// APNs sender (Package 5, server side). Token-based (.p8) auth over HTTP/2.
//
// ⚠️ THE JWT SIGNING AND HTTP/2 TRANSPORT WERE WRITTEN BLIND and, as of this change, still have not
// completed a round trip to Apple — see the environment note on `apnsHost` below. What HAS been proven
// is the key parsing, which is where this file was failing.
//
// ── 🔴 THE PRODUCTION FAILURE THIS FILE NOW GUARDS AGAINST ──────────────────────────────────────────
// Every push since the APNs key was first set failed here, at signing, before any network call:
//
//     Error: error:1E08010C:DECODER routines::unsupported
//     code: 'ERR_OSSL_UNSUPPORTED', library: 'DECODER routines', reason: 'unsupported'
//
// Node's OpenSSL refused to decode the private key. The cause is an environment-store artefact, not a
// bad key: a .p8 is a MULTI-LINE PEM, and Vercel's environment editor stores a multi-line value as ONE
// line carrying LITERAL BACKSLASH-N. `-----BEGIN PRIVATE KEY-----\n…` with a real backslash and a real
// 'n' is not a PEM, and OpenSSL says only "unsupported". It works locally — where `.env.local` holds
// real newlines — and fails in production, which is the worst shape a configuration bug can have.
//
// 🔴 AND IT WAS INVISIBLE. The order still saved, the request still returned 200, and the single
// `console.error` at the call site was the only trace anywhere. It took a hand-placed order with a
// Vercel log open to find it. That is why this file now normalises the key, distinguishes the three
// ways it can be wrong, and logs EVERY APNs outcome at `error` rather than counting silently.
//
// 🔴 THE KEY IS NEVER LOGGED. Not a prefix, not a sample, not a hash, at any level, in any path. Length
// alone is reported, because "is it 27 characters or 240" is the one property that distinguishes a
// truncated value from a real one and it discloses nothing.
import http2 from 'node:http2'
import crypto from 'node:crypto'

interface ApnsConfig { keyId: string; teamId: string; bundleId: string; key: crypto.KeyObject; host: string }

/**
 * Undo the damage an environment store does to a multi-line PEM.
 *
 * 🔴 THE ARMOUR LINES ARE LEFT ALONE. `-----BEGIN PRIVATE KEY-----` / `-----END PRIVATE KEY-----` are
 * REQUIRED by the decoder, not decoration — stripping them to "tidy" the value is the other way to
 * produce exactly the same `ERR_OSSL_UNSUPPORTED`.
 *
 * ⚠️ ORDER MATTERS: quotes come off BEFORE the escape expansion, because a value pasted as
 * `"-----BEGIN…\n…"` carries the quotes outside the escapes.
 *
 * ⚠️ REAL CRLF NEEDS NO HANDLING — EXECUTION-VERIFIED, not assumed: `createPrivateKey` accepts a PEM
 * whose line endings are real `\r\n`. It is only the ESCAPED form that breaks, which is why the escaped
 * pair is expanded here and real carriage returns are left alone.
 *
 * ⚠️ WHAT THIS DELIBERATELY DOES NOT DO: a value whose newlines were STRIPPED ENTIRELY, or replaced
 * with spaces, is not recoverable by unescaping — the base64 body would have to be re-wrapped. Both
 * fail, both are proven to fail, and both now produce the named "armoured but undecodable" error
 * instead of a bare OpenSSL code. See docs/apns-key-fix-report.md.
 */
export function normaliseApnsKey(raw: string): string {
  return raw
    .trim()
    .replace(/^['"]|['"]$/g, '')   // a value pasted with its surrounding quotes
    // ⚠️ ESCAPED CRLF FIRST. `\r\n` CONTAINS `\n`, so expanding `\n` alone would leave a stray literal
    // backslash-r on every line — which fails to decode exactly as the original bug did. Proven.
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')         // 🔴 THE PRODUCTION FIX: literal backslash-n → a real newline
    .trim()
}

/** Distinguishes the three ways `APNS_KEY` can be wrong. They used to arrive as one opaque OpenSSL error. */
type KeyResult = { key: crypto.KeyObject } | { error: string }

function loadApnsKey(raw: string | undefined): KeyResult {
  // 1. MISSING — including an empty string, which an environment editor produces from a cleared field.
  if (!raw || !raw.trim()) {
    return { error: 'APNS_KEY is not set (or is empty). Push is disabled until it is.' }
  }
  const pem = normaliseApnsKey(raw)
  // 2. PRESENT BUT NOT A PEM — the armour is missing, so this is a truncated or mangled value rather
  //    than an unsupported key type. ⚠️ `.env.local` has historically held a 27-character stub, which
  //    lands exactly here.
  if (!pem.includes('-----BEGIN') || !pem.includes('-----END')) {
    return { error: `APNS_KEY is set but is not a PEM — the BEGIN/END armour lines are missing (normalised length ${pem.length}). A .p8 must be pasted whole, including both -----BEGIN PRIVATE KEY----- and -----END PRIVATE KEY----- lines.` }
  }
  // 3. ARMOURED BUT UNDECODABLE — the case that was firing in production. After normalisation this
  //    should mean a genuinely wrong key type or corrupt body, NOT an escaping artefact.
  try {
    return { key: crypto.createPrivateKey(pem) }
  } catch (e) {
    return { error: `APNS_KEY is armoured but OpenSSL could not decode it (${(e as Error).message}). The escaped-newline and wrapping-quote cases are already normalised, so this is the key itself: check it is the .p8 as downloaded from Apple, PKCS#8, and not a .cer/.p12 or a re-encoded copy.` }
  }
}

/** Config, or the specific reason there is none. Never throws; never includes key material. */
function apnsConfig(): { cfg: ApnsConfig } | { error: string } {
  const keyId = process.env.APNS_KEY_ID
  const teamId = process.env.APNS_TEAM_ID
  const bundleId = process.env.APNS_BUNDLE_ID
  // ⚠️ NAMED INDIVIDUALLY, not counted. "not configured" was the old message and it did not say WHICH
  // of four variables was absent, which is a materially different question when three are set.
  const missing = [
    !keyId && 'APNS_KEY_ID',
    !teamId && 'APNS_TEAM_ID',
    !bundleId && 'APNS_BUNDLE_ID',
  ].filter(Boolean) as string[]
  if (!keyId || !teamId || !bundleId) return { error: `not configured — missing ${missing.join(', ')}` }
  const k = loadApnsKey(process.env.APNS_KEY)
  if ('error' in k) return { error: k.error }
  // ⚠️ THE HOST IS UNCHANGED BY THIS FIX, AND IT HAS NEVER BEEN EXERCISED — no send has reached Apple,
  // so neither branch has been proven against a real device token. `APNS_ENV` must equal the exact
  // string 'production' to select the production host; ANYTHING else — unset, empty, 'Production',
  // 'prod', a trailing space — selects sandbox. There is one value per deployment, and it must match
  // the aps-environment the installed build was signed with (Debug ⇒ sandbox, Release/TestFlight ⇒
  // production). See docs/apns-key-fix-report.md, C2.
  const host = process.env.APNS_ENV === 'production'
    ? 'https://api.push.apple.com'
    : 'https://api.sandbox.push.apple.com'
  return { cfg: { keyId, teamId, bundleId, key: k.key, host } }
}

// ES256 provider JWT (iss=teamId, kid=keyId). Valid ~1h; regenerated per batch (fine at this volume).
// ⚠️ `cfg.key` IS ALREADY A PARSED KeyObject by the time this runs — loadApnsKey did the decoding and
// reported any failure by name. This function can no longer be the place an escaping bug surfaces.
function providerToken(cfg: ApnsConfig): string {
  const header = { alg: 'ES256', kid: cfg.keyId }
  const payload = { iss: cfg.teamId, iat: Math.floor(Date.now() / 1000) }
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const signingInput = `${b64(header)}.${b64(payload)}`
  const sig = crypto.sign('SHA256', Buffer.from(signingInput), { key: cfg.key, dsaEncoding: 'ieee-p1363' })
  return `${signingInput}.${sig.toString('base64url')}`
}

/** Last six characters of a device token — enough to line a log row up against `van_devices`, and not
 *  the token. ⚠️ Deliberately not the whole value: a log is not the place to reproduce a routing
 *  credential, and the tail is sufficient to tell two rows apart. */
const tokenTail = (t: string) => `…${t.slice(-6)}`

export interface OrderPendingPush { orderKey: string; orderNumber: string | number; truckName: string }

/**
 * Send "order needs confirming" to each device token. Returns which tokens APNs rejected as
 * BadDeviceToken/Unregistered so the caller can clean them (stale-device handling).
 *
 * 🔴 NEVER THROWS — and that is now true rather than merely documented. The previous version signed the
 * JWT and opened the HTTP/2 session OUTSIDE its own try block, so a key that would not parse threw
 * straight out of a function whose docblock promised it could not. Both are inside now.
 *
 * 🔴 EVERY OUTCOME IS LOGGED AT `error`, INCLUDING SUCCESS COUNTS. The send stays NON-FATAL — an order
 * must submit whether or not push works, and that decision stands — but non-fatal must not mean
 * invisible. Before this change a 400, a 403 and a 410 were all swallowed with no log line at all, and
 * `sent` was computed, returned and discarded by the caller.
 */
export async function sendOrderPendingPush(
  tokens: string[],
  payload: OrderPendingPush,
): Promise<{ sent: number; invalidTokens: string[]; skipped?: string }> {
  const conf = apnsConfig()
  if ('error' in conf) {
    // 🔴 `error`, NOT `warn`. This line is the whole difference between "push is off" and "push is
    // broken", and it was a warn nobody read for the entire life of the feature.
    console.error(`[apns] SEND SKIPPED — ${conf.error}`)
    return { sent: 0, invalidTokens: [], skipped: 'not-configured' }
  }
  const cfg = conf.cfg
  if (!tokens.length) {
    console.error(`[apns] SEND SKIPPED — no device tokens for order ${payload.orderNumber} (${payload.truckName}). The van resolved but no enabled device had a push_token.`)
    return { sent: 0, invalidTokens: [], skipped: 'no-tokens' }
  }

  const invalidTokens: string[] = []
  // Counted, never collected: a BadDeviceToken no longer reaches `invalidTokens`, so the only way the
  // summary can report it is a tally. See the two-way split at the rejection branch below.
  let badDeviceTokens = 0
  let sent = 0
  let client: http2.ClientHttp2Session | null = null
  try {
    const jwt = providerToken(cfg)
    const body = JSON.stringify({
      aps: { alert: { title: 'New order to confirm', body: `Order ${payload.orderNumber} — ${payload.truckName}` }, sound: 'default', 'content-available': 1 },
      type: 'order_pending', orderKey: payload.orderKey,   // custom keys → tap deep-link
    })

    client = http2.connect(cfg.host)
    // ⚠️ A SESSION-LEVEL ERROR HAD NO LISTENER, AND AN UNHANDLED 'error' EVENT THROWS. DNS failure, TLS
    // failure or a refused connection would have escaped as an unhandled event rather than a per-request
    // error — which is the one way this "non-fatal" path could have taken the order down with it. The
    // handler is log-only; it changes no outcome, it stops one from being silent.
    client.on('error', e => console.error(`[apns] SESSION ERROR to ${cfg.host}: ${(e as Error).message}`))

    const c = client
    await Promise.all(tokens.map(token => new Promise<void>(resolve => {
      const req = c.request({
        ':method': 'POST', ':path': `/3/device/${token}`,
        authorization: `bearer ${jwt}`, 'apns-topic': cfg.bundleId, 'apns-push-type': 'alert',
      })
      let status = 0, data = '', apnsId = ''
      req.on('response', h => { status = Number(h[':status']) || 0; apnsId = String(h['apns-id'] ?? '') })
      req.on('data', c2 => { data += c2 })
      req.on('end', () => {
        if (status === 200) {
          sent++
          console.error(`[apns] 200 OK device=${tokenTail(token)} order=${payload.orderNumber} apns-id=${apnsId}`)
        } else {
          // 🔴 APPLE'S `reason` IS THE ONLY THING THAT NAMES THE FAULT, and it was being parsed for two
          // values and then discarded. 403 ExpiredProviderToken, 403 InvalidProviderToken and every 5xx
          // produced literally nothing before this line existed.
          let reason = ''
          try { reason = String((JSON.parse(data || '{}') as { reason?: unknown }).reason ?? '') } catch { /* non-JSON body */ }
          console.error(`[apns] ${status || 'NO-STATUS'} device=${tokenTail(token)} order=${payload.orderNumber} reason=${reason || '(none given)'}${reason ? '' : ` body=${data.slice(0, 200)}`}`)
          // ── 🔴 WHICH REJECTIONS KILL A TOKEN — TWO-WAY, AND THE SPLIT IS THE WHOLE POINT ───────────
          // `Unregistered` (410) — DEAD, null it. Apple states the token is no longer valid FOR THIS
          //   TOPIC: the app was uninstalled, or the token rotated. Unambiguous, and the only reason that
          //   is dead on its own. The direct analogue of FCM's UNREGISTERED, which nulls for the same
          //   reason and with the same certainty.
          // 🔴 `BadDeviceToken` (400) — AMBIGUOUS, KEEP IT. Apple returns this BOTH for a genuinely bad
          //   token AND for a perfectly valid token presented to the WRONG HOST — a sandbox token at
          //   api.push.apple.com, or the reverse. Nothing in the response distinguishes them, and there
          //   is exactly ONE `APNS_ENV` per deployment, so a mismatch rejects the WHOLE FLEET at once.
          //   Nulling would destroy working credentials, force every iPad to delete-and-reinstall to
          //   re-register, and erase the only evidence that the deployment was misconfigured.
          // 🔴 THIS IS lib/fcm.ts's SENDER_ID_MISMATCH TREATMENT, ADOPTED RATHER THAN INVENTED. That
          //   branch keeps its token and logs loudly on the grounds that "the DEPLOYMENT is wrong, not
          //   the device", and the manual records it as *the `BadDeviceToken` lesson generalised rather
          //   than copied* — so this is the lesson coming home to the case it was learned from.
          // ⚠️ FCM's OTHER carve-out, the INVALID_ARGUMENT circuit breaker, is NOT copied and does not
          //   apply: it guards a MESSAGE fault masquerading as dead devices, and a bad APNs payload
          //   returns BadMessageId/PayloadEmpty/etc., never BadDeviceToken. Copying a breaker for a
          //   collision that cannot occur would be a third policy, not parity.
          if (reason === 'Unregistered') {
            invalidTokens.push(token)
          } else if (reason === 'BadDeviceToken') {
            badDeviceTokens++
            console.error(
              `[apns] BadDeviceToken device=${tokenTail(token)} status=${status} host=${cfg.host} topic=${cfg.bundleId} order=${payload.orderNumber} — TOKEN KEPT, DELIBERATELY. ` +
              `This is EITHER a dead token OR a valid token sent to the wrong APNs host. Check APNS_ENV against the aps-environment the installed build was signed with ` +
              `(Xcode/Debug ⇒ sandbox, TestFlight/Release ⇒ production) BEFORE concluding the device is dead.`,
            )
          }
        }
        resolve()
      })
      // ⚠️ Per-request transport failure. It used to `resolve()` with no log at all.
      req.on('error', e => { console.error(`[apns] REQUEST ERROR device=${tokenTail(token)} order=${payload.orderNumber}: ${(e as Error).message}`); resolve() })
      req.end(body)
    })))
  } catch (e) {
    // Signing, session construction, or anything else before the per-request handlers took over.
    console.error(`[apns] SEND FAILED before any device was attempted — order ${payload.orderNumber}: ${(e as Error).message}`)
  } finally { try { client?.close() } catch { /* already closed */ } }

  // 🔴 THE ONE-LINE SUMMARY. The caller reads only `invalidTokens`, so without this line a send of five
  // that delivered none looked exactly like a send of five that delivered all five.
  const failed = tokens.length - sent
  console.error(
    `[apns] SUMMARY order=${payload.orderNumber} truck="${payload.truckName}" host=${cfg.host} attempted=${tokens.length} succeeded=${sent} failed=${failed}` +
    (invalidTokens.length ? ` tokens-to-be-cleared=${invalidTokens.length}` : '') +
    (badDeviceTokens ? ` bad-device-token=${badDeviceTokens}(KEPT)` : ''),
  )
  // 🔴 THE WHOLE-FLEET SIGNAL, AND IT IS THE ONE A HOST MISMATCH PRODUCES. Every device rejected, none
  // delivered, and every rejection the ambiguous one: that shape is a deployment fault, not a van whose
  // tablets all died at the same instant. Said in one line so it does not have to be inferred from a
  // column read that the previous behaviour would have already destroyed.
  if (sent === 0 && badDeviceTokens > 0 && badDeviceTokens === tokens.length) {
    console.error(
      `[apns] 🔴 ALL ${tokens.length} device(s) rejected with BadDeviceToken and none succeeded, on host ${cfg.host}. ` +
      `That is the signature of an APNS_ENV / aps-environment MISMATCH, not ${tokens.length} dead device(s). NO TOKEN WAS CLEARED.`,
    )
  }
  return { sent, invalidTokens }
}
