// FCM sender (Android). HTTP v1 API with an OAuth2 access token minted from a service account.
//
// THE MIRROR OF lib/apns.ts, AND DELIBERATELY SO. Same config-returns-null pattern, same
// `sendOrderPendingPush(tokens, payload)` signature, same `{ sent, invalidTokens, skipped? }` return, so
// the call site can route by platform and treat the two senders as interchangeable. Read them together.
//
// WHY HTTP v1 AND NOT THE LEGACY SERVER KEY: the legacy FCM endpoints (fcm.googleapis.com/fcm/send and
// the /v1beta1 batch send) are decommissioned. v1 authenticates with a short-lived OAuth2 bearer minted
// from the service-account private key — which is why this file signs a JWT rather than reading an API
// key out of the environment.
//
// ⚠️ CANNOT BE FULLY VALIDATED WITHOUT: FCM_SERVICE_ACCOUNT_JSON set in the deployed environment, the
// android/app/google-services.json whose project_id MATCHES that service account, and a physical
// Android device (or emulator) whose van_devices row carries platform='android' and a push_token. Until
// the variable is set this is a NO-OP that LOGS AT ERROR (see fcmConfig) — deliberately not the quiet
// console.warn that let the APNs gap sit unnoticed for three weeks.
import crypto from 'node:crypto'

interface FcmConfig { projectId: string; clientEmail: string; privateKey: string; tokenUri: string }

// -- CONFIG -------------------------------------------------------------------------------------------
// Returns null when unusable, exactly like apnsConfig(). Three ways to be unusable, all of them logged
// distinctly, because "push did not arrive" is otherwise indistinguishable between them:
//   absent/empty variable - not JSON - JSON without the three fields a send needs.
function fcmConfig(): FcmConfig | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON
  // AN EMPTY STRING COUNTS AS ABSENT. A variable created in the dashboard but never pasted into arrives
  // as '' and would otherwise reach JSON.parse and be reported as malformed, sending the reader to look
  // for a syntax error in a value that is not there.
  if (!raw || !raw.trim()) {
    console.error('[fcm] NOT CONFIGURED: FCM_SERVICE_ACCOUNT_JSON is missing or empty — Android push is DISABLED. No notification was sent.')
    return null
  }
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>
  } catch (e) {
    console.error(`[fcm] NOT CONFIGURED: FCM_SERVICE_ACCOUNT_JSON is not valid JSON (${(e as Error).message}) — Android push is DISABLED. Paste the service-account file as ONE line; a value split across lines is truncated at the first newline.`)
    return null
  }
  const projectId = typeof parsed.project_id === 'string' ? parsed.project_id : ''
  const clientEmail = typeof parsed.client_email === 'string' ? parsed.client_email : ''
  // ⚠️ NO UNESCAPING IS NEEDED HERE AND NONE IS DONE BLINDLY. APNS_KEY is a bare PEM in the environment,
  // so lib/apns.ts has to undo \n-escaping itself. This key arrives INSIDE a JSON string, where JSON.parse
  // has already turned \n into real newlines. The replace below is therefore a no-op on a correct value
  // and only repairs a DOUBLE-escaped one (a key pasted as \\n), which crypto.sign would otherwise reject
  // with an opaque "no start line" error.
  const privateKeyRaw = typeof parsed.private_key === 'string' ? parsed.private_key : ''
  const privateKey = privateKeyRaw.includes('\n') ? privateKeyRaw : privateKeyRaw.replace(/\\n/g, '\n')
  if (!projectId || !clientEmail || !privateKey) {
    const missing = [!projectId && 'project_id', !clientEmail && 'client_email', !privateKey && 'private_key'].filter(Boolean).join(', ')
    console.error(`[fcm] NOT CONFIGURED: FCM_SERVICE_ACCOUNT_JSON parsed but is missing ${missing} — Android push is DISABLED. This is a service-account key file from Firebase Console -> Project settings -> Service accounts, not a Web API key.`)
    return null
  }
  const tokenUri = typeof parsed.token_uri === 'string' && parsed.token_uri ? parsed.token_uri : 'https://oauth2.googleapis.com/token'
  return { projectId, clientEmail, privateKey, tokenUri }
}

// -- OAUTH2 ACCESS TOKEN ------------------------------------------------------------------------------
// Google mints these for one hour. CACHED AT MODULE SCOPE, keyed on nothing because there is exactly one
// service account: a warm lambda handling a burst of orders mints ONE token, not one per order.
// ⚠️ A COLD INVOCATION MINTS A NEW ONE, UNAVOIDABLY. Module state does not survive a cold start, so the
// first push after a scale-up pays one extra round trip to oauth2.googleapis.com. That is the correct
// trade: the alternative is a shared cache (Upstash) holding a live credential, which is a much larger
// surface than one ~200ms request on a path that is already fire-and-forget.
let cachedToken: { value: string; expiresAt: number } | null = null

async function accessToken(cfg: FcmConfig): Promise<string | null> {
  // 60s of skew, so a token that expires mid-flight is never handed to a send.
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claims = {
    iss: cfg.clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: cfg.tokenUri,
    iat: now,
    exp: now + 3600,
  }
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const signingInput = `${b64(header)}.${b64(claims)}`
  let assertion: string
  try {
    // RS256 — the service-account key is RSA. (lib/apns.ts signs ES256 because an APNs .p8 is EC. Same
    // node:crypto, different curve; no library is needed for either.)
    const sig = crypto.sign('RSA-SHA256', Buffer.from(signingInput), cfg.privateKey)
    assertion = `${signingInput}.${sig.toString('base64url')}`
  } catch (e) {
    console.error('[fcm] could not sign the OAuth2 assertion — the private_key in FCM_SERVICE_ACCOUNT_JSON is not a usable PEM:', (e as Error).message)
    return null
  }
  try {
    const res = await fetch(cfg.tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
    })
    const data = await res.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error_description?: string; error?: string }
    if (!res.ok || !data.access_token) {
      console.error(`[fcm] OAuth2 token request failed (${res.status}): ${data.error_description || data.error || 'no access_token in the response'}`)
      return null
    }
    cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 }
    return cachedToken.value
  } catch (e) {
    console.error('[fcm] OAuth2 token request threw:', (e as Error).message)
    return null
  }
}

// Structurally identical to lib/apns.ts's OrderPendingPush. Declared here rather than imported so the
// Android sender does not depend on the iOS one; TypeScript's structural typing is what makes the two
// interchangeable at the call site, and a field added to one without the other is a compile error there.
export interface OrderPendingPush { orderKey: string; orderNumber: string | number; truckName: string }

/**
 * Send "order needs confirming" to each Android device token. Returns which tokens FCM rejected as
 * permanently dead so the caller can clean them (stale-device handling). Never throws.
 */
export async function sendOrderPendingPush(
  tokens: string[],
  payload: OrderPendingPush,
): Promise<{ sent: number; invalidTokens: string[]; skipped?: string }> {
  const cfg = fcmConfig()
  if (!cfg) return { sent: 0, invalidTokens: [], skipped: 'not-configured' }   // fcmConfig already logged, at error
  if (!tokens.length) return { sent: 0, invalidTokens: [] }

  const bearer = await accessToken(cfg)
  if (!bearer) return { sent: 0, invalidTokens: [], skipped: 'no-access-token' }

  // -- THE PAYLOAD ------------------------------------------------------------------------------------
  // Carries exactly what the APNs payload carries. `notification` is the visible alert (aps.alert),
  // `android.priority: 'high'` is the wake-now signal (aps 'content-available': 1), and `data` carries
  // the same two custom keys the iOS tap handler deep-links from. ⚠️ FCM data values MUST be strings —
  // a number here is rejected for the whole message with INVALID_ARGUMENT.
  const endpoint = `https://fcm.googleapis.com/v1/projects/${cfg.projectId}/messages:send`
  const notification = {
    title: 'New order to confirm',
    body: `Order ${payload.orderNumber} — ${payload.truckName}`,
  }

  const invalidTokens: string[] = []
  // The subset of invalidTokens that were rejected with the AMBIGUOUS code. The breaker at the bottom
  // reasons about this list, never about invalidTokens as a whole.
  const invalidArgument: string[] = []
  let sent = 0

  await Promise.all(tokens.map(async token => {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token,
            notification,
            // ⚠️ channel_id MUST MATCH ORDER_CHANNEL_ID in lib/native/push.ts and
            // @string/default_notification_channel_id in the Android manifest. Sent EXPLICITLY rather
            // than relying on the manifest default, because the manifest value is only a fallback for
            // messages that name no channel - naming it here is what makes the routing deterministic.
            // AND THE CHANNEL'S IMPORTANCE OUTRANKS THIS priority. 'high' asks for a heads-up alert;
            // the channel is what grants it, which is why the channel is created at importance 5.
            android: { priority: 'high', notification: { sound: 'default', channel_id: 'hg_orders' } },
            data: { type: 'order_pending', orderKey: payload.orderKey },
          },
        }),
      })
      if (res.ok) { sent++; return }
      const body = await res.json().catch(() => ({})) as {
        error?: {
          status?: string; message?: string
          details?: Array<{ errorCode?: string; fieldViolations?: Array<{ field?: string }> }>
        }
      }
      const detailCode = body.error?.details?.find(d => d.errorCode)?.errorCode
      const code = detailCode || body.error?.status || ''
      // -- WHICH FIELD DID FCM ACTUALLY OBJECT TO? -------------------------------------------------
      // VERIFIED AGAINST THE LIVE ENDPOINT (validate_only probe, 16 August 2026): alongside the
      // FcmError detail, FCM v1 returns a google.rpc.BadRequest detail naming the field, e.g.
      //     fieldViolations: [{ field: 'message.token', description: 'The registration token is not a
      //     valid FCM registration token' }]
      // That is a far better signal than inferring from the shape of the batch, because it separates
      // "this token is malformed" from "this message is malformed" IN THE SAME RESPONSE. Absent on some
      // errors, hence the fallback breaker at the bottom.
      const violations = body.error?.details?.flatMap(d => d.fieldViolations ?? []) ?? []
      const blamesToken = violations.length > 0 && violations.every(v => v.field === 'message.token')
      const blamesMessage = violations.length > 0 && !blamesToken
      // -- WHICH FAILURES KILL A TOKEN, AND WHICH ARE ONLY A BAD DAY --------------------------------
      // DEAD, null the column:
      //   UNREGISTERED (404) — the app was uninstalled, or the token was rotated. The APNs analogue of
      //                        Unregistered. Unambiguous, and the only code that is dead on its own.
      //   INVALID_ARGUMENT (400) — a malformed registration token. See the circuit breaker below: this
      //                        code is ALSO what a malformed MESSAGE returns, which is why it is not
      //                        trusted on its own.
      // NOT DEAD, leave the column alone:
      //   UNAVAILABLE (503) / INTERNAL (500) / QUOTA_EXCEEDED (429) — transient, retry later.
      //   SENDER_ID_MISMATCH (403) — the token belongs to a DIFFERENT Firebase project. That is a
      //                        deployment mistake (wrong google-services.json, or the service account
      //                        and the app are from two projects), not a dead device. ⚠️ NULLING HERE
      //                        WOULD DESTROY THE EVIDENCE OF THE MISCONFIGURATION and leave a fleet of
      //                        silently unreachable devices — the exact failure mode APNs's
      //                        BadDeviceToken handling has. It is logged loudly and the token is kept.
      //   THIRD_PARTY_AUTH_ERROR (401) — an APNs credential problem for iOS-via-FCM. Not this path.
      if (code === 'UNREGISTERED') {
        invalidTokens.push(token)
      } else if (code === 'INVALID_ARGUMENT' && blamesMessage) {
        // FCM named a field that is NOT the token. The device is fine and the payload is not; nulling
        // here would blame the wrong thing and destroy a working registration.
        console.error(`[fcm] INVALID_ARGUMENT on ${violations.map(v => v.field).join(', ')} - this is a MESSAGE fault, not a dead device. Token KEPT. ${body.error?.message || ''}`)
      } else if (code === 'INVALID_ARGUMENT') {
        invalidTokens.push(token)
        // Only counted as ambiguous when FCM did NOT tell us which field it objected to. A response that
        // explicitly blames message.token is certain, and must not be second-guessed by the breaker.
        if (!blamesToken) invalidArgument.push(token)
      } else if (code === 'SENDER_ID_MISMATCH') {
        console.error('[fcm] SENDER_ID_MISMATCH — this token belongs to another Firebase project. Check that android/app/google-services.json and FCM_SERVICE_ACCOUNT_JSON are from the SAME project. The token was KEPT, deliberately.')
      } else {
        console.warn(`[fcm] send failed (${res.status} ${code || 'unknown'}) — token kept: ${body.error?.message || ''}`)
      }
    } catch (e) {
      // A network throw is transient by definition, and never a dead token.
      console.warn('[fcm] send threw — token kept:', (e as Error).message)
    }
  }))

  // -- THE CIRCUIT BREAKER. IT GUARDS ONE CODE, NOT ALL OF THEM. -------------------------------------
  // INVALID_ARGUMENT is returned both for a bad registration token and for a bad message body. A payload
  // regression therefore looks exactly like every device in the van going dead at once — and the cleanup
  // at the call site would NULL the whole fleet's push_token, permanently, from one bad deploy. Nothing
  // in a single response distinguishes the two, so the SHAPE of the batch does it: if nothing succeeded
  // and every rejection was the ambiguous code, the common factor is the message, not the devices.
  // ⚠️ IT IS DELIBERATELY BLIND TO UNREGISTERED, AND THAT IS THE WHOLE REASON FOR THE SECOND LIST. A
  // message fault cannot produce UNREGISTERED — that code means the app was uninstalled — so a van whose
  // two tablets were both wiped must still have both tokens cleared. Guarding on invalidTokens as a whole
  // would have kept them forever, which is the opposite failure and just as silent.
  // The `> 1` clause keeps a single ambiguous rejection actionable: with one token there is no shape to
  // read, and a lone malformed token is far likelier than a payload that only one device rejects.
  if (sent === 0 && invalidArgument.length > 1 && invalidArgument.length === invalidTokens.length) {
    console.error(`[fcm] ALL ${invalidArgument.length} tokens were rejected with INVALID_ARGUMENT and none succeeded. Treating this as a MESSAGE fault, not ${invalidArgument.length} dead devices — no token was marked invalid. Check the payload against the FCM v1 message schema.`)
    return { sent: 0, invalidTokens: [], skipped: 'all-rejected' }
  }
  return { sent, invalidTokens }
}
