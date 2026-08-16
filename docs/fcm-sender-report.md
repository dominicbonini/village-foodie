# The FCM sender — Android push, from a token with nowhere to go to a proven transport

Scope honoured: **one new file (`lib/fcm.ts`) and one edited file (`app/api/orders/submit/route.ts`).**
No `next dev`, no `next build`, no `cap sync`, no deploy, no commit, **no package installed**, no
migration, no payment path touched, **`lib/apns.ts` byte-identical**.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

iOS and Android are reported **separately** throughout. Every claim is marked **READ**, **INFERRED**
or **LIVE-VERIFIED**.

> ✅ `npx tsc --noEmit` exits 0.
> ✅ **LIVE-VERIFIED, and this is the headline:** the service account signs, Google returns a real
> access token, and the FCM v1 endpoint **accepted and validated the exact payload this sender
> builds** — rejecting only the deliberately fake token. Nothing was delivered to any device. Part H3.

🔴 **TWO PREMISES IN THE BRIEF ARE WRONG AND ARE CORRECTED BELOW, BOTH IN YOUR FAVOUR.** `lib/apns.ts`
is **not** pure ASCII (G1), and the private key needs **no** unescaping (B4).

---

# PART A — THE IOS MODEL AND THE SEND PATH

## A1. `lib/apns.ts` in full — READ, all 79 lines

```ts
// APNs sender (Package 5, server side). Token-based (.p8) auth over HTTP/2.
//
// ⚠️ CANNOT BE VALIDATED WITHOUT: the APNs auth key (.p8) + Key ID + Team ID + the app's bundle id, the
// Push Notifications capability/entitlement on the iOS app, and a physical device to receive. Until
// APNS_* env is set this is a SAFE NO-OP (logs + returns), so shipping the trigger cannot break the order
// save. The JWT signing + HTTP/2 transport below are written blind and must be smoke-tested on a real
// device in the paid-account phase.
import http2 from 'node:http2'
import crypto from 'node:crypto'

interface ApnsConfig { keyId: string; teamId: string; bundleId: string; key: string; host: string }

function apnsConfig(): ApnsConfig | null {
  const keyId = process.env.APNS_KEY_ID
  const teamId = process.env.APNS_TEAM_ID
  const bundleId = process.env.APNS_BUNDLE_ID
  // .p8 contents (PEM). Support literal newlines or \n-escaped env storage.
  const key = process.env.APNS_KEY?.replace(/\\n/g, '\n')
  if (!keyId || !teamId || !bundleId || !key) return null
  const host = process.env.APNS_ENV === 'production'
    ? 'https://api.push.apple.com'
    : 'https://api.sandbox.push.apple.com'
  return { keyId, teamId, bundleId, key, host }
}

// ES256 provider JWT (iss=teamId, kid=keyId). Valid ~1h; regenerated per batch (fine at this volume).
function providerToken(cfg: ApnsConfig): string {
  const header = { alg: 'ES256', kid: cfg.keyId }
  const payload = { iss: cfg.teamId, iat: Math.floor(Date.now() / 1000) }
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const signingInput = `${b64(header)}.${b64(payload)}`
  const sig = crypto.sign('SHA256', Buffer.from(signingInput), { key: cfg.key, dsaEncoding: 'ieee-p1363' })
  return `${signingInput}.${sig.toString('base64url')}`
}

export interface OrderPendingPush { orderKey: string; orderNumber: string | number; truckName: string }

/**
 * Send "order needs confirming" to each device token. Returns which tokens APNs rejected as
 * BadDeviceToken/Unregistered so the caller can clean them (stale-device handling). Never throws.
 */
export async function sendOrderPendingPush(
  tokens: string[],
  payload: OrderPendingPush,
): Promise<{ sent: number; invalidTokens: string[]; skipped?: string }> {
  const cfg = apnsConfig()
  if (!cfg) { console.warn('[apns] not configured — skipping push (safe no-op)'); return { sent: 0, invalidTokens: [], skipped: 'not-configured' } }
  if (!tokens.length) return { sent: 0, invalidTokens: [] }

  const jwt = providerToken(cfg)
  const body = JSON.stringify({
    aps: { alert: { title: 'New order to confirm', body: `Order ${payload.orderNumber} — ${payload.truckName}` }, sound: 'default', 'content-available': 1 },
    type: 'order_pending', orderKey: payload.orderKey,   // custom keys → tap deep-link
  })

  const client = http2.connect(cfg.host)
  const invalidTokens: string[] = []
  let sent = 0
  try {
    await Promise.all(tokens.map(token => new Promise<void>(resolve => {
      const req = client.request({
        ':method': 'POST', ':path': `/3/device/${token}`,
        authorization: `bearer ${jwt}`, 'apns-topic': cfg.bundleId, 'apns-push-type': 'alert',
      })
      let status = 0, data = ''
      req.on('response', h => { status = Number(h[':status']) || 0 })
      req.on('data', c => { data += c })
      req.on('end', () => {
        if (status === 200) sent++
        else { try { const r = JSON.parse(data || '{}'); if (r.reason === 'BadDeviceToken' || r.reason === 'Unregistered') invalidTokens.push(token) } catch {} }
        resolve()
      })
      req.on('error', () => resolve())
      req.end(body)
    })))
  } catch (e) { console.warn('[apns] send failed:', (e as Error).message) }
  finally { try { client.close() } catch {} }
  return { sent, invalidTokens }
}
```

**The four properties `lib/fcm.ts` copies:** config-returns-null with an early skip; `(tokens, payload)`
in; `{ sent, invalidTokens, skipped? }` out; never throws.

## A2. The caller, BEFORE — READ, `app/api/orders/submit/route.ts:1271-1286`

```ts
            // APNs-ONLY ALLOWLIST: sendOrderPendingPush POSTs to api.push.apple.com, which understands
            // Apple device tokens only. A non-Apple token (e.g. an FCM token from an Android build) comes
            // back as BadDeviceToken → the invalidTokens cleanup just below would NULL that row's push_token,
            // silently and permanently disabling push for that device. So allowlist the Apple-compatible
            // platforms; any future platform value is EXCLUDED by default until a sender exists for it.
            // NULL is included: legacy rows predate the column being populated and are all iOS.
            const { data: devices } = await supabase
              .from('van_devices').select('device_id, push_token').eq('van_id', vanId).eq('notify_enabled', true).not('push_token', 'is', null)
              .or('platform.eq.ios,platform.is.null')
            const tokens = (devices || []).map(d => d.push_token as string).filter(Boolean)
            if (tokens.length) {
              const res = await sendOrderPendingPush(tokens, { orderKey: order?.order_key ?? '', orderNumber: orderId, truckName: truck.name })
              if (res.invalidTokens.length) {
                await supabase.from('van_devices').update({ push_token: null }).in('push_token', res.invalidTokens)
              }
            }
```

The whole block is wrapped in `if (!autoAccepted) { try { … } catch (pushErr) { … } }` — **READ**,
`:1258` and `:1289-1291` — so push has always been fire-and-forget and non-fatal to the order save.

## A3. Every read of `push_token`, and every NULLing of it — READ, exhaustive

**READS (4):**

| Site | What it does |
|---|---|
| `app/api/orders/submit/route.ts:1281` | **the send path** — selects tokens for a van |
| `app/api/native/bind-device/route.ts:83` | `if (push_token !== undefined) patch.push_token = push_token` — the client WRITE |
| `app/api/native/switch-truck/route.ts:44` | comment only: the token **carries over** to the new truck |
| `lib/native/device.ts:14` | the client-side type |

**NULLING (1, and only one):**

```ts
app/api/orders/submit/route.ts:1284
  await supabase.from('van_devices').update({ push_token: null }).in('push_token', res.invalidTokens)
```

🔴 **ONE STATEMENT IN THE ENTIRE CODEBASE CAN ERASE A DEVICE'S REGISTRATION, AND IT IS FED DIRECTLY BY
WHATEVER A SENDER PUTS IN `invalidTokens`.** That is the whole reason Part C3 is written the way it is:
`lib/fcm.ts` is not deciding what to log, it is deciding what gets destroyed.

**Also READ** — `supabase/migrations/20260701_van_devices.sql:15`:

```sql
  push_token     text,                                -- APNs device token; NULL until push permission granted
```

⚠️ The column comment still says "APNs". **Not changed** — a comment-only migration edit is outside
this scope, and migrations are yours to run.

## A4. The Android row — reported honestly, including what I did NOT do

⚠️ **I DID NOT QUERY THE LIVE DATABASE THIS TURN.** The figures below are **READ from
`docs/android.md`'s verified-facts block**, which records them as captured against the live DB on
2026-07-27:

```
- `van_devices` has **9 rows as of 2026-07-27; was 7 on 2026-07-26.** Split: **7 `ios`, 2 `android`**
  (*was: all `ios`*). **ONE row carries a `push_token`** — the live Android emulator, 142 chars,
  written 2026-07-27 21:07:48 … The other Android row is an orphan from a reinstall and has no token.
  No NULL `platform` values exist.
```

So: **`platform = 'android'`, token length 142.** The prefix is not recorded and I have not invented
one.

✅ **LIVE-VERIFIED SUBSTITUTE FOR THE SHAPE.** Rather than guess, the real endpoint was asked what it
considers a valid token. A `validate_only` probe with a deliberately fake token returned:

```json
{"error":{"code":400,"message":"The registration token is not a valid FCM registration token",
 "status":"INVALID_ARGUMENT",
 "details":[{"@type":"type.googleapis.com/google.firebase.fcm.v1.FcmError","errorCode":"INVALID_ARGUMENT"},
            {"@type":"type.googleapis.com/google.rpc.BadRequest",
             "fieldViolations":[{"field":"message.token",
                                 "description":"The registration token is not a valid FCM registration token"}]}]}}
```

**FCM validates token format server-side and names the offending field.** That response shape is what
C3's handling is built on, and it was obtained rather than assumed.

---

# PART B — THE CONFIG

## B1. `FCM_SERVICE_ACCOUNT_JSON` — LIVE-VERIFIED shape, no secret printed

**LIVE-VERIFIED** — the value in `.env.local` parses as a Google service-account key file:

```
keys: ['auth_provider_x509_cert_url', 'auth_uri', 'client_email', 'client_id',
       'client_x509_cert_url', 'private_key', 'private_key_id', 'project_id',
       'token_uri', 'type', 'universe_domain']
type             = service_account
project_id       = hatchgrab
token_uri        = https://oauth2.googleapis.com/token
client_email     = <local>@hatchgrab.iam.gserviceaccount.com
private_key      : len=1704  head='-----BEGIN PRIVATE KEY-----\n'
```

✅ **AND IT MATCHES THE APP.** **LIVE-VERIFIED** — `android/app/google-services.json`:

```
project_id: hatchgrab   project_number: 176175981602   clients: ['com.hatchgrab.app']
```

**Same project (`hatchgrab`), and the package name matches `capacitor.config.ts`'s
`appId: 'com.hatchgrab.app'`.** That is the pairing whose mismatch produces `SENDER_ID_MISMATCH`, and
it is correct today.

## B2. 🔴 The log line, and why it cannot be missed

**READ** — the APNs precedent that hid a defect for three weeks:

```ts
lib/apns.ts:47   if (!cfg) { console.warn('[apns] not configured — skipping push (safe no-op)'); return { … } }
```

Three things made that miss: **`console.warn`** (filtered out of most log views), the words **"safe
no-op"** (which read as *nothing is wrong*), and **one line for three different faults**.

**The replacement — READ, `lib/fcm.ts`:**

```ts
  if (!raw || !raw.trim()) {
    console.error('[fcm] NOT CONFIGURED: FCM_SERVICE_ACCOUNT_JSON is missing or empty — Android push is DISABLED. No notification was sent.')
    return null
  }
```

```ts
    console.error(`[fcm] NOT CONFIGURED: FCM_SERVICE_ACCOUNT_JSON is not valid JSON (${(e as Error).message}) — Android push is DISABLED. Paste the service-account file as ONE line; a value split across lines is truncated at the first newline.`)
```

```ts
    console.error(`[fcm] NOT CONFIGURED: FCM_SERVICE_ACCOUNT_JSON parsed but is missing ${missing} — Android push is DISABLED. This is a service-account key file from Firebase Console -> Project settings -> Service accounts, not a Web API key.`)
```

**Why it is unmissable, stated plainly — four deliberate differences from the line it learns from:**

1. **`console.error`, not `console.warn`.** Vercel surfaces errors; warnings sit in the stream.
2. **"Android push is DISABLED"** — a statement of consequence, not of intent. Nobody reads that as
   normal, where "safe no-op" invites exactly that reading.
3. **Three distinct messages for three distinct faults**, so the log says *which* thing is wrong. The
   APNs line could not tell "no key" from "wrong key".
4. **Each names the fix**, not just the fault. The JSON-parse line names the single most likely cause
   (a multi-line paste) because that is precisely what went wrong locally — see H.

## B3. Does an empty string count as absent?

✅ **YES, and it is tested before anything else.** **READ:**

```ts
  if (!raw || !raw.trim()) {
```

`!raw` catches `undefined` and `''`; `!raw.trim()` catches a value that is only whitespace. **INFERRED,
and it is the reason the whitespace test is there:** a variable created in the Vercel dashboard but
never pasted into arrives as `''`. Without this it would reach `JSON.parse` and be reported as
*malformed JSON* — sending you to hunt for a syntax error in a value that does not exist.

## B4. 🔴 Newline handling — the brief's premise is wrong, and the code says why

**The answer is: no unescaping is needed, and none is done blindly.**

**READ** — `lib/apns.ts` must unescape because `APNS_KEY` is a **bare PEM** sitting directly in the
environment:

```ts
  const key = process.env.APNS_KEY?.replace(/\\n/g, '\n')
```

**LIVE-VERIFIED** — the FCM key is different in kind. It arrives **inside a JSON string**, where the
newlines are already `\n` escapes that `JSON.parse` converts for you. Measured after parsing:

```
private_key: len=1704  literal_newlines=28  escaped_backslash_n=0
```

28 real newlines, zero remaining escapes. **A blind `.replace(/\\n/g, '\n')` would therefore be a
no-op on a correct value — and would silently corrupt a key that legitimately contained the two
characters `\` and `n`.** What is written instead:

```ts
  const privateKeyRaw = typeof parsed.private_key === 'string' ? parsed.private_key : ''
  const privateKey = privateKeyRaw.includes('\n') ? privateKeyRaw : privateKeyRaw.replace(/\\n/g, '\n')
```

**Repair only when repair is needed:** if the key already has real newlines it is used untouched; only
a **double-escaped** key (pasted as `\\n`) is repaired — which `crypto.sign` would otherwise reject
with an opaque *"no start line"*.

✅ **PROVEN, not reasoned:** `crypto.sign('RSA-SHA256', …)` on this key produced a 655-character
assertion that **Google accepted**. See H3.

---

# PART C — THE SENDER

## C1. The endpoint

**READ** — `lib/fcm.ts`:

```ts
  const endpoint = `https://fcm.googleapis.com/v1/projects/${cfg.projectId}/messages:send`
```

✅ **HTTP v1, one message per token, OAuth2 bearer.** The legacy `fcm.googleapis.com/fcm/send`
server-key API is **not used and not referenced anywhere in this file** — which is why the file signs
a JWT rather than reading an API key. **LIVE-VERIFIED**: this exact URL, with
`projectId = 'hatchgrab'`, authenticated and validated a message.

## C2. Signature and return shape — interchangeable at the call site

| | `lib/apns.ts` | `lib/fcm.ts` |
|---|---|---|
| Export name | `sendOrderPendingPush` | `sendOrderPendingPush` |
| Params | `(tokens: string[], payload: OrderPendingPush)` | **identical** |
| Returns | `{ sent, invalidTokens, skipped? }` | **identical** |
| Config failure | returns `skipped: 'not-configured'` | **same, plus `'no-access-token'`, `'all-rejected'`** |
| Empty tokens | `{ sent: 0, invalidTokens: [] }` | **identical** |
| Throws? | never | never |

**READ** — the payload interface is **declared locally, not imported**:

```ts
// Structurally identical to lib/apns.ts's OrderPendingPush. Declared here rather than imported so the
// Android sender does not depend on the iOS one; TypeScript's structural typing is what makes the two
// interchangeable at the call site, and a field added to one without the other is a compile error there.
export interface OrderPendingPush { orderKey: string; orderNumber: string | number; truckName: string }
```

⚠️ **A deliberate choice with a cost, stated:** the two can drift. What stops silent drift is that the
call site passes **one object literal to both**, so a field added to one interface and not the other
fails `tsc` at the call site rather than at runtime on a device.

## C3. 🔴 Invalid-token handling — which codes kill a token, and which must not

**FCM v1 error codes, and the ruling on each:**

| Code | HTTP | Meaning | Ruling |
|---|---|---|---|
| `UNREGISTERED` | 404 | app uninstalled / token rotated | 🔴 **DEAD — null it.** The analogue of APNs `Unregistered`. Unambiguous. |
| `INVALID_ARGUMENT` | 400 | malformed **token** *or* malformed **message** | ⚠️ **AMBIGUOUS — see below.** |
| `SENDER_ID_MISMATCH` | 403 | token belongs to another Firebase project | ✅ **KEEP.** Not a dead device. |
| `QUOTA_EXCEEDED` | 429 | rate limited | ✅ **KEEP** — transient. |
| `UNAVAILABLE` | 503 | FCM overloaded | ✅ **KEEP** — transient. |
| `INTERNAL` | 500 | FCM fault | ✅ **KEEP** — transient. |
| `THIRD_PARTY_AUTH_ERROR` | 401 | APNs credential fault for iOS-via-FCM | ✅ **KEEP** — not this path. |
| network throw | — | DNS, timeout, socket | ✅ **KEEP** — transient by definition. |

🔴 **`SENDER_ID_MISMATCH` IS THE ONE WHERE THE BRIEF'S WARNING BITES HARDEST, AND IT IS DELIBERATELY
NOT NULLED.** **READ:**

```ts
      } else if (code === 'SENDER_ID_MISMATCH') {
        console.error('[fcm] SENDER_ID_MISMATCH — this token belongs to another Firebase project. Check that android/app/google-services.json and FCM_SERVICE_ACCOUNT_JSON are from the SAME project. The token was KEPT, deliberately.')
```

It means the *deployment* is wrong — mismatched `google-services.json` and service account — not that
the device is gone. Nulling would clear every token in the fleet **and erase the evidence of the
misconfiguration**, which is exactly the APNs `BadDeviceToken` failure mode the brief flagged.

### 🔴 The ambiguity in `INVALID_ARGUMENT`, and the two-layer defence

The problem, stated concretely: **a payload regression looks identical to every device in the van
dying at once.** One bad deploy would null the whole fleet, permanently, through the single statement
quoted in A3.

**LAYER 1 — ask FCM which field it objected to. LIVE-VERIFIED, and better than any heuristic.** The
probe in A4 showed FCM returns a `google.rpc.BadRequest` detail naming the field. **READ:**

```ts
      const violations = body.error?.details?.flatMap(d => d.fieldViolations ?? []) ?? []
      const blamesToken = violations.length > 0 && violations.every(v => v.field === 'message.token')
      const blamesMessage = violations.length > 0 && !blamesToken
```

```ts
      } else if (code === 'INVALID_ARGUMENT' && blamesMessage) {
        // FCM named a field that is NOT the token. The device is fine and the payload is not; nulling
        // here would blame the wrong thing and destroy a working registration.
        console.error(`[fcm] INVALID_ARGUMENT on ${violations.map(v => v.field).join(', ')} - this is a MESSAGE fault, not a dead device. Token KEPT. ${body.error?.message || ''}`)
      } else if (code === 'INVALID_ARGUMENT') {
        invalidTokens.push(token)
        if (!blamesToken) invalidArgument.push(token)
      }
```

**LAYER 2 — the circuit breaker, for responses that carry no `fieldViolations`. READ:**

```ts
  if (sent === 0 && invalidArgument.length > 1 && invalidArgument.length === invalidTokens.length) {
    console.error(`[fcm] ALL ${invalidArgument.length} tokens were rejected with INVALID_ARGUMENT and none succeeded. Treating this as a MESSAGE fault, not ${invalidArgument.length} dead devices — no token was marked invalid. Check the payload against the FCM v1 message schema.`)
    return { sent: 0, invalidTokens: [], skipped: 'all-rejected' }
  }
```

⚠️ **THE BREAKER IS DELIBERATELY BLIND TO `UNREGISTERED`, AND THAT IS WHY THERE ARE TWO LISTS.** An
earlier draft guarded on `invalidTokens` as a whole, and it was wrong: a van whose two tablets were
both wiped produces two genuine `UNREGISTERED`s and zero sends, and would have had both tokens kept
**forever** — the opposite failure, equally silent. A message fault cannot produce `UNREGISTERED`, so
only the ambiguous code is counted. The `> 1` clause keeps a lone malformed token actionable: with one
token there is no shape to read.

## C4. OAuth2 token caching

**READ:**

```ts
let cachedToken: { value: string; expiresAt: number } | null = null

async function accessToken(cfg: FcmConfig): Promise<string | null> {
  // 60s of skew, so a token that expires mid-flight is never handed to a send.
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value
  …
    cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 }
```

**LIVE-VERIFIED:** Google returned `expires_in: 3599`, so the cache is real and one hour long.

🔴 **YES, A COLD SERVERLESS INVOCATION MINTS A NEW ONE. STATED, NOT HIDDEN.** Module state does not
survive a cold start, so the first push after a scale-up pays one extra round trip (~200ms) to
`oauth2.googleapis.com`. **INFERRED** — a warm lambda handling a burst of orders mints **one** token,
not one per order, which is the case that actually matters at a hatch.

⚠️ **The alternative was considered and rejected**, and the reasoning is in the file: a shared cache
(Upstash is already in this project) would hold a **live credential** in an external store. That is a
much larger security surface than one extra request on a path that is already fire-and-forget.

## C5. The payload, side by side

| | APNs (`lib/apns.ts:51-54`) | FCM (`lib/fcm.ts`) |
|---|---|---|
| Visible title | `aps.alert.title = 'New order to confirm'` | `notification.title = 'New order to confirm'` |
| Visible body | ``aps.alert.body = `Order ${orderNumber} — ${truckName}` `` | ``notification.body = `Order ${orderNumber} — ${truckName}` `` |
| Sound | `aps.sound = 'default'` | `android.notification.sound = 'default'` |
| Wake priority | `aps['content-available'] = 1` | `android.priority = 'high'` |
| Deep-link key 1 | `type: 'order_pending'` (top level) | `data.type = 'order_pending'` |
| Deep-link key 2 | `orderKey: payload.orderKey` (top level) | `data.orderKey = payload.orderKey` |

**READ** — the FCM body:

```ts
        body: JSON.stringify({
          message: {
            token,
            notification,
            android: { priority: 'high', notification: { sound: 'default' } },
            data: { type: 'order_pending', orderKey: payload.orderKey },
          },
        }),
```

✅ **Same information, both fields the tap handler deep-links from, byte-identical alert text —
including the same em dash.** ⚠️ **One transport difference that is a real trap:** FCM `data` values
**must be strings**. A number there is rejected for the whole message with `INVALID_ARGUMENT`.
`orderKey` is already a string; `orderNumber` is deliberately **not** in `data` (it is interpolated
into the body text), so the trap is not reachable from the current call site.

## C6. Packages installed: **NONE**

✅ **Nothing was installed and nothing was needed.** **READ** — the only import in `lib/fcm.ts`:

```ts
import crypto from 'node:crypto'
```

`crypto.sign('RSA-SHA256', …)` mints the assertion (the same `node:crypto` `lib/apns.ts` uses for
ES256 — different curve, no library either time), and **global `fetch`** does both HTTP calls (Node
v22.22.3, and this repo's other route handlers already use it). `firebase-admin` and
`google-auth-library` were **not** added: both are large dependency trees whose only relevant function
here is ~40 lines of JWT signing. **G6 confirms `package.json` is not in the diff.**

---

# PART D — THE CALL SITE

## D1. The filter is gone, and routing is by name

**READ** — the replacement in `app/api/orders/submit/route.ts`:

```ts
            const { data: devices } = await supabase
              .from('van_devices').select('device_id, push_token, platform').eq('van_id', vanId).eq('notify_enabled', true).not('push_token', 'is', null)
            const allDevices = devices || []
            const iosTokens = allDevices.filter(d => d.platform === 'ios' || d.platform == null).map(d => d.push_token as string).filter(Boolean)
            const androidTokens = allDevices.filter(d => d.platform === 'android').map(d => d.push_token as string).filter(Boolean)
            const unroutable = allDevices.filter(d => d.platform != null && d.platform !== 'ios' && d.platform !== 'android')
```

🔴 **THE ALLOWLIST'S DEFAULT-DENY PROPERTY IS PRESERVED, AND THAT WAS NOT THE FIRST DRAFT.** The
obvious routing is `platform !== 'android'` → iOS. **READ** — that would be wrong, because
`lib/native/device.ts:69` can write a third value:

```ts
      body: JSON.stringify({ token, device_id: getDeviceId(), platform: Capacitor?.getPlatform?.() ?? 'web', ...patch }),
```

`Capacitor.getPlatform()` returns `'ios' | 'android' | 'web'`. Under negation-routing a `'web'` row
would be **posted to APNs** — precisely the class of accident the old comment refused to permit
(*"any future platform value is EXCLUDED by default until a sender exists for it"*). Each platform is
therefore matched **by name**, an unrecognised value routes **nowhere**, and it is logged:

```ts
              console.warn(`[push] ${unroutable.length} device(s) have a push_token but an unroutable platform (${…}) — no sender exists, so nothing was sent and NO token was cleared.`)
```

⚠️ **INFERRED, and it is why this is belt-and-braces:** a `'web'` row cannot hold a token today
(`lib/native/push.ts` only registers on native, and the query already filters
`.not('push_token','is',null)`). The guard is for the value that does not exist yet.

## D2. 🔴 One platform failing must not stop the other — the isolation, quoted

```ts
            const invalidTokens: string[] = []
            if (iosTokens.length) {
              try {
                const res = await sendOrderPendingPush(iosTokens, { orderKey: order?.order_key ?? '', orderNumber: orderId, truckName: truck.name })
                invalidTokens.push(...res.invalidTokens)
              } catch (iosErr) { console.error('APNs push failed (non-fatal, Android unaffected):', iosErr) }
            }
            if (androidTokens.length) {
              try {
                const res = await sendOrderPendingPushFcm(androidTokens, { orderKey: order?.order_key ?? '', orderNumber: orderId, truckName: truck.name })
                invalidTokens.push(...res.invalidTokens)
              } catch (fcmErr) { console.error('FCM push failed (non-fatal, iOS unaffected):', fcmErr) }
            }
```

**Two independent `try`/`catch` blocks, each with its own guard.** ⚠️ **Both senders promise never to
throw — and the isolation does not rely on that promise.** A contract is not a boundary: an
import-time fault, an OOM in one transport, or a future rewrite that does throw must not cost the
other platform its notification. **A van running one iPad and one Android tablet gets both alerts, or
the one that worked — never neither.**

**INFERRED, and worth stating:** the two sends are sequential, not parallel. At one push per pending
order this costs nothing measurable, and it keeps each failure attributable to its own platform in the
log.

## D3. What happens to a row with `platform` NULL

✅ **It routes to APNs, exactly as before — no change whatsoever.** **READ**, the condition:
`d.platform === 'ios' || d.platform == null`.

**READ** — the justification is the old comment's, retained verbatim in substance: *"legacy rows
predate the column being populated and are all iOS."* `docs/android.md` records **"No NULL `platform`
values exist"** as of 2026-07-27, so this branch is **INFERRED to be empty in practice** — kept
because the old filter kept it, and removing a case while also changing the routing would be two
changes wearing one coat.

⚠️ Note the operator: `== null` (loose), which matches both `null` and `undefined`. That is deliberate
— a Supabase row missing the column entirely arrives as `undefined`, and it must route the same way.

## D4. Does the guard still short-circuit cleanly?

✅ **Yes, and there are now two of them instead of one.**

| Fleet state | `iosTokens` | `androidTokens` | Senders called | DB writes |
|---|---|---|---|---|
| No devices registered | `[]` | `[]` | **none** | **none** |
| iOS only (Pizzeria Gusto) | n | `[]` | APNs only | only if APNs reports dead tokens |
| Android only | `[]` | n | **FCM only** | only if FCM reports dead tokens |
| Mixed | n | m | both, isolated | one combined statement |

**READ** — the cleanup is unchanged in behaviour and now covers both platforms through one statement:

```ts
            if (invalidTokens.length) {
              await supabase.from('van_devices').update({ push_token: null }).in('push_token', invalidTokens)
            }
```

It is keyed on the **token value**, so a dead Android token and a dead Apple token are cleared
together. ✅ It is skipped entirely when both senders report nothing dead — **including the
circuit-breaker case, which deliberately returns an empty list rather than the whole fleet.**

---

# PART E — THE NOTIFICATION ICON

## E1. Both configs, quoted — and there is no push icon at all

**READ** — `capacitor.config.ts`, the **only** notification-icon configuration in the file:

```ts
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#F5A623',
      sound: 'beep.wav',
    },
```

**READ** — the `plugins` block in full contains exactly three entries: `SplashScreen`,
`LocalNotifications`, `CapacitorHttp`.

🔴 **THERE IS NO `PushNotifications` PLUGIN BLOCK. "Not found" is the result, stated plainly.**

**READ** — nor is there a manifest fallback. `android/app/src/main/AndroidManifest.xml` contains one
`<meta-data>` element and it is unrelated:

```xml
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths"></meta-data>
```

No `com.google.firebase.messaging.default_notification_icon`, and no
`default_notification_color`.

**READ** — `find android -name "ic_stat*"` returns **nothing**. So the icon named under
`LocalNotifications` **does not exist either**; the audit's finding is confirmed and is in fact one
step worse than "configured in the wrong place".

## E2. What Android would render — INFERRED, with the mechanism

**No asset is created. This is a report.**

**INFERRED**, from Android's documented behaviour: with no `default_notification_icon` metadata and no
`smallIcon` in the message, FCM falls back to the **application icon** for the status-bar small icon.
Since API 21 (Lollipop) the small icon is rendered as a **silhouette** — the system keeps the alpha
channel and discards all colour. A full-colour launcher icon therefore renders as a **solid white
square or blob** in the status bar and in the notification shade.

⚠️ **AND THE LAUNCHER ICON HERE IS THE STOCK CAPACITOR ONE** (`docs/android-audit-report.md` records
the Android icons as unchanged from the scaffold), so the fallback is not merely ugly — it is a white
smear that identifies nothing.

⚠️ **This is unreachable until push actually delivers**, which is why it stays a report item and not a
blocker: the asset cannot be judged before the first real notification arrives on a device.

---

# PART F — BOUNDARIES

## F1. `git diff --stat` — this task's files only

```
 app/api/orders/submit/route.ts | 66 +++++++++++++++++++++++++++++++++---------
 1 file changed, 52 insertions(+), 14 deletions(-)
```

plus one untracked file: **`lib/fcm.ts`**.

✅ **Boundary greps against THIS TASK'S diff and the new file — all zero:**

```
  lib/payments           in submit/route.ts diff: 0 | in lib/fcm.ts: 0
  gatedAction            in submit/route.ts diff: 0 | in lib/fcm.ts: 0
  supabase/migrations    in submit/route.ts diff: 0 | in lib/fcm.ts: 0
  ios/                   in submit/route.ts diff: 0 | in lib/fcm.ts: 0
  capacitor.config       in submit/route.ts diff: 0 | in lib/fcm.ts: 0
  package.json           in submit/route.ts diff: 0 | in lib/fcm.ts: 0
  AppDelegate            in submit/route.ts diff: 0 | in lib/fcm.ts: 0
```

**No payment path, no offline gate, no migration, no iOS file, no Capacitor config, no dependency.**

## F2. Is `lib/apns.ts` untouched?

✅ **Yes. `git diff --stat -- lib/apns.ts` produces zero lines of output** — the file is not in the
diff at all. Its non-ASCII census is also unchanged (G2), which is a second, independent check on the
same claim.

## F3. ⚠️ Blast radius — and what happens to Pizzeria Gusto

**Pizzeria Gusto trades with real money and has no Android device registered.**

✅ **NOTHING CHANGES FOR THEM, AND THE REASON IS STRUCTURAL RATHER THAN INCIDENTAL.** Trace it:

1. Their rows are `platform = 'ios'` (or NULL). `androidTokens` is `[]`.
2. `if (androidTokens.length)` is false → **`lib/fcm.ts` is never called.** Not "called and returns
   early" — **never entered.** The FCM config is never read, no OAuth request is made.
3. `iosTokens` contains exactly what the old `.or('platform.eq.ios,platform.is.null')` selected — the
   two conditions are the same set, rewritten from SQL into a JS filter.
4. `sendOrderPendingPush` is called with the same tokens and the same payload, and its result feeds
   the same cleanup statement.

⚠️ **The one behavioural difference for an iOS-only van, stated because it is real:** the query now
returns rows the old filter excluded (any `platform` that is neither `'ios'`, `'android'` nor NULL).
Those rows are routed **nowhere** and merely logged (D1) — they cannot reach APNs, so they cannot be
mis-cleaned. **INFERRED:** no such row exists today.

**The genuine risk surface is one query and two branches:**

| Change | Worst case | Contained by |
|---|---|---|
| Filter moved from SQL to JS | A row mis-classified and sent to the wrong transport | Match by name; unknown → nowhere (D1) |
| FCM added | The FCM call hangs | The whole block is already `try`/`catch` + fire-and-forget (`:1258`); the order is saved before it runs |
| Cleanup now fed by two senders | A fleet's tokens nulled by a payload bug | Two-layer defence in C3 |

🔴 **AND THE ORDER SAVE CANNOT BE AFFECTED BY ANY OF IT.** **READ** — the push block sits after the
order is written and returns, inside `try { … } catch (pushErr) { console.error('Order-pending push
failed (non-fatal, order saved):', pushErr) }`.

---

# PART G — INTEGRITY

## G1. Non-ASCII census BEFORE

```
lib/apns.ts                      3854 bytes   4 classes
    U+2014 x2     EM DASH
    U+26A0 x1     WARNING SIGN
    U+FE0F x1     VARIATION SELECTOR-16
    U+2192 x1     RIGHTWARDS ARROW

app/api/orders/submit/route.ts  80055 bytes  19 classes
    U+2500 x1145  U+2014 x131  U+2192 x35  U+1F534 x33  U+26A0 x19  U+FE0F x19
    U+00A3 x3  U+2026 x3  U+00A7 x2  U+1F4DE x1  U+1F4E7 x1  U+00D7 x1  U+1F381 x1
    U+1F4DD x1  U+2019 x1  U+2265 x1  U+2208 x1  U+27F7 x1  U+1F514 x1
```

🔴 **THE BRIEF'S ASSUMPTION IS WRONG: `lib/apns.ts` IS NOT PURE ASCII.** It carries four classes. That
is measured, not remembered, and it changes the target — "a new `lib/fcm.ts` should be too" becomes
*match the model's vocabulary*, not *use none*.

## G2. Census AFTER, side by side — every difference explained

**`app/api/orders/submit/route.ts` — 19 classes before, 19 after. None gained, none lost.**

| Codepoint | Before | After | Explanation |
|---|---|---|---|
| U+2500 | 1145 | 1191 | +46 — the two new section rules, both already the file's own vocabulary |
| U+2014 | 131 | 133 | +2 — em dashes in the new comments |
| U+1F534 | 33 | 35 | +2 — two new 🔴 headers |
| U+26A0 | 19 | 21 | +2 — two new ⚠️ notes |
| U+FE0F | 19 | 21 | +2 — **tracks U+26A0 exactly**, see G3 |
| all 14 others | — | **unchanged** | untouched by this edit |

✅ **`gained=[] lost=[]`, measured programmatically.**

**`lib/fcm.ts` — NEW FILE, no baseline to violate, and deliberately narrower than its model:**

```
lib/fcm.ts    3 classes:  U+2014 x22   U+26A0 x6   U+FE0F x6
lib/apns.ts   4 classes:  U+2014 x2    U+26A0 x1   U+FE0F x1   U+2192 x1
```

⚠️ **THE FIRST DRAFT HAD SIX CLASSES AND WAS REWRITTEN.** It reached for the house style — U+2500 box
rules (×309), U+00B7 middle dots, U+1F534 — none of which appear in the file the brief named as the
model. Rules became `-----`, middle dots became hyphens, the red circles became the uppercase they
already sat beside. **The result is a strict subset of `lib/apns.ts`'s vocabulary.** Measuring caught
it; reading it back would not have.

✅ **`lib/apns.ts` — 4 classes before, 4 after, every count `same`.** An independent confirmation of F2.

## G3. 🔴 Carrier-aware variation-selector check

Per emoji-presentation base, counting how many occurrences are **followed by U+FE0F**:

**`app/api/orders/submit/route.ts`**

| Base | n | paired | bare |
|---|---|---|---|
| U+2705 | 0 | — | — (absent) |
| U+1F534 LARGE RED CIRCLE | 35 | 0 | 35 |
| U+2500 BOX DRAWINGS LIGHT HORIZONTAL | 1191 | 0 | 1191 |
| U+26A0 WARNING SIGN | **21** | **21** | **0** |

**Sum of per-base paired = 21 = total U+FE0F = 21.** ✅ Every selector has a named carrier; **zero bare
warning signs**. ⚠️ U+1F534 and U+2500 are default-emoji and box-drawing respectively — neither takes a
selector, and counting them as "unpaired" would be the false positive this method exists to prevent.

**`lib/fcm.ts`**

| Base | n | paired | bare |
|---|---|---|---|
| U+26A0 WARNING SIGN | **6** | **6** | **0** |
| U+2705, U+1F534, U+2500 | 0 | — | absent |

**Sum = 6 = total U+FE0F = 6.** ✅

## G4. Byte scan of every edited and created file

Byte-level scan for NUL and every control byte below 0x09 (plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F). **Never
grep.**

```
  app/api/orders/submit/route.ts           83547 bytes  offending=0  CR=0
  lib/fcm.ts                               15636 bytes  offending=0  CR=0
  lib/apns.ts                               3854 bytes  offending=0  CR=0
```

✅ **Zero offending bytes, zero CR.** `lib/apns.ts` is included as a control: unchanged size, unchanged
scan.

## G5. Byte scan of this report

Separate pass, run after writing: **47,130 bytes, offending = 0** — no NUL, no control byte below
0x09, no CRLF, no lone CR. Its own carrier-aware check:

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 34 | 0 | 34 |
| U+1F534 LARGE RED CIRCLE | 19 | 0 | 19 |
| U+2500 BOX DRAWINGS LIGHT HORIZONTAL | 0 | 0 | 0 |
| U+26A0 WARNING SIGN | 24 | 24 | **0** |

**Sum of per-base paired = 24 = total U+FE0F count = 24** — no orphan, no double-count,
**zero bare warning signs**.

## G6. `git status` and `git diff --stat`, with this task's entries named

```
M app/api/orders/submit/route.ts
 M app/api/webhooks/instagram/route.ts
 M app/api/webhooks/messenger/route.ts
 M app/api/webhooks/meta/whatsapp/route.ts
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M components/dashboard/AddOrderPanel.tsx
 M docs/reference-manual.md
?? docs/android-audit-report.md
?? docs/android-back-handler-report.md
?? docs/event-cancel-holds-report.md
?? docs/fcm-sender-report.md
?? docs/overlay-audit-report.md
?? docs/whatsapp-onboarding-report.md
?? docs/whatsapp-routing-report.md
?? docs/whatsapp-signature-report.md
?? lib/fcm.ts
?? lib/meta/
?? lib/native/backHandler.ts
?? supabase/migrations/20260816_trucks_phone_number_id.sql
```

```
app/api/orders/submit/route.ts          |  66 +++-
 app/api/webhooks/instagram/route.ts     |  48 ++-
 app/api/webhooks/messenger/route.ts     |  48 ++-
 app/api/webhooks/meta/whatsapp/route.ts | 173 +++++++++--
 app/dashboard/[token]/kds/page.tsx      |  19 ++
 app/dashboard/[token]/page.tsx          |  32 ++
 components/dashboard/AddOrderPanel.tsx  |  22 ++
 docs/reference-manual.md                | 519 +++++++++++++++++++++++++++++++-
 8 files changed, 878 insertions(+), 49 deletions(-)
```

🔴 **THIS TASK'S ENTRIES ARE EXACTLY TWO: `app/api/orders/submit/route.ts` (modified) and `lib/fcm.ts`
(new).** Everything else — the three Meta webhook routes, the three overlay files, the reference
manual, and the seven untracked reports plus `lib/meta/`, `lib/native/backHandler.ts` and the
`20260816` migration — is **prior turns' work, uncommitted as instructed, and untouched here.**
✅ **`package.json` and `package-lock.json` do not appear at all**, which is the proof for C6.

---

# PART H — WHAT YOU MUST DO

## H1. Vercel

**Set ONE variable:**

| Name | Value | Environments |
|---|---|---|
| `FCM_SERVICE_ACCOUNT_JSON` | the whole service-account JSON file, **as one line** | Production (and Preview if you want to test there) |

🔴 **PASTE IT AS ONE LINE, AND THIS IS NOT PEDANTRY — IT IS THE FAILURE I HIT LOCALLY.**
**LIVE-VERIFIED**: your `.env.local` holds the JSON **pretty-printed across 14 lines**, and
`@next/env` loaded it as:

```
loaded by @next/env: length=1
first 40 chars: "{"
JSON.parse FAILS: Expected property name or '}' in JSON at position 1
```

**The value is the single character `{`.** The same file truncates `APNS_KEY` to 27 characters
(`-----BEGIN PRIVATE KEY-----`) for the same reason. ⚠️ **This does not affect Vercel** — its dashboard
stores a value whole regardless of newlines — **but it means Android push cannot be tested against a
local `next dev` until `.env.local` is fixed**, and that is exactly the confusion the B2 log line is
worded to short-circuit. To fix locally: replace the block with one line, or wrap the whole value in
single quotes.

**A no-op today, worth knowing:** `APNS_ENV` is unrelated to FCM (see H4) and needs no change.

## H2. Where the JSON comes from in Firebase

1. Firebase Console → the **`hatchgrab`** project (**LIVE-VERIFIED** as the project id in both
   `android/app/google-services.json` and the service account you already hold).
2. **Project settings** (gear icon) → **Service accounts** tab.
3. **Generate new private key** → **Generate key**. A `.json` file downloads.
4. That file's entire contents is the value. It must contain `project_id`, `client_email` and
   `private_key`.

⚠️ **It is NOT the "Server key" or "Web API key"** on the Cloud Messaging tab — those are the legacy
API this sender deliberately does not use (C1). The B2 log line says so explicitly, because it is the
most likely wrong thing to paste.

✅ **You may not need step 3 at all.** The credential in `.env.local` is already a valid `hatchgrab`
service-account key and **it minted a live token during this task** (H3). Copying that same value into
Vercel is sufficient; generating a new key is only necessary if you would rather not reuse it.

⚠️ **One permission to confirm:** the service account needs the **Firebase Cloud Messaging API
Admin** role (or `cloudmessaging.messages.create`). A key generated by step 3 has it by default. Yours
demonstrably does — the probe authenticated and was rejected only on the token.

## H3. ✅ How to prove a send works without waiting for a real order — ALREADY DONE

**LIVE-VERIFIED, 16 August 2026. This ran during the task and delivered nothing to any device:**

```
service account: project_id=hatchgrab  keys=11
RS256 assertion signed OK, length 655
OAuth2 status=200  access_token=OK (len 1024)  expires_in=3599
validate_only POST https://fcm.googleapis.com/v1/projects/hatchgrab/messages:send -> status 400
response: {"error":{"code":400,"message":"The registration token is not a valid FCM registration token",
           "status":"INVALID_ARGUMENT","details":[…{"field":"message.token"}…]}}
```

**What that 400 proves — and it proves more than a 200 would have:**

1. ✅ The private key **signs**, and Google **accepted** the assertion — the whole B4 newline question
   is settled empirically.
2. ✅ The OAuth2 exchange works against the real `token_uri` and returns a one-hour token.
3. ✅ The FCM v1 endpoint **authenticated** the request. An unauthorised service account returns 401 or
   403, not 400.
4. ✅ **The message schema is correct.** FCM validated `notification`, `android` and `data` and
   objected to **exactly one field: `message.token`** — the one deliberately fake input. Had
   `android.priority` or a non-string `data` value been wrong, the violation would have named it.

**The `validate_only` flag is the mechanism, and it is worth keeping:**

```json
{ "validate_only": true, "message": { … } }
```

FCM runs every check and **delivers nothing**. To repeat it after deploying, run the same probe with a
**real** token from `van_devices` — a 200 then means the full path is live. Drop `validate_only` for a
genuine test notification.

⚠️ **What is still unproven, stated plainly:** no notification has been **delivered to an Android
device**. That needs the variable set in Vercel, a deploy, and a device whose `van_devices` row has
`platform='android'` and a non-null `push_token`. Everything up to the moment of delivery is verified.

## H4. ⚠️ Does FCM have a sandbox/production split like APNs?

🔴 **NO. ONE CREDENTIAL COVERS BOTH, AND THERE IS NO ENDPOINT TO CHOOSE.**

**READ** — the contrast is visible in `lib/apns.ts`, which must pick a host:

```ts
  const host = process.env.APNS_ENV === 'production'
    ? 'https://api.push.apple.com'
    : 'https://api.sandbox.push.apple.com'
```

An APNs token minted by a **development** build is rejected by the production host as
`BadDeviceToken` and vice versa — the split that has cost this project time before.

**FCM has no such thing.** One endpoint (`fcm.googleapis.com/v1/projects/{project}/messages:send`),
one service account, one token namespace. A debug build and a Play Store build of the **same
`applicationId`** against the **same Firebase project** produce tokens that are interchangeable. There
is **no `FCM_ENV` variable and there should never be one** — `lib/fcm.ts` reads no environment beyond
`FCM_SERVICE_ACCOUNT_JSON`.

✅ **What this means for you practically: the emulator token recorded on 2026-07-27 and a token from a
signed release build are both valid against the same credential.** The APNs sandbox/production trap
has no Android counterpart.

⚠️ **The Android equivalent trap is different and worth naming:** the credential and the app must be
from the **same Firebase project**. Mismatch them and you get `SENDER_ID_MISMATCH`, which C3
deliberately logs loudly **without** nulling the token — so the misconfiguration stays diagnosable
instead of erasing the fleet.
