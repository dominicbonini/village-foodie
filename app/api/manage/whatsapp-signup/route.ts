// app/api/manage/whatsapp-signup/route.ts
// ── S5: THE SERVER SIDE OF EMBEDDED SIGNUP. THE ONLY PLACE THAT TALKS TO META FOR ONBOARDING. ──────
//
// Three server-to-server calls, in this order, after the flow completes (Meta, "Onboarding business
// customers as a Tech Provider or Tech Partner"):
//   1. GET  /oauth/access_token?client_id&client_secret&code   → the customer-scoped BUSINESS TOKEN
//   2. POST /<phone_number_id>/register  { messaging_product, pin }
//   3. POST /<waba_id>/subscribed_apps                          → webhooks ON THE CUSTOMER'S WABA
// 🔴 APP-LEVEL `account_update` DOES NOT COVER 2 OR 3. The app subscription says which FIELDS this app
// wants; step 3 says which WABAs it wants them FROM. Without step 3 the customer's messages never reach
// our webhook and the auto-replies are silently dead — the connection looks perfect and answers nothing.
//
// ── 🔴 NO TRUCK ID IS ACCEPTED FROM THE REQUEST BODY. THE TRUCK COMES FROM THE DASHBOARD TOKEN. ────
// Precedent, quoted verbatim from app/api/manage/whatsapp-preview/route.ts:
//     "🔴 NO truckId IS ACCEPTED FROM THE REQUEST. THE TRUCK COMES FROM THE TOKEN.
//      `generateWhatsAppReply` reads menu_items_db with a SERVICE-ROLE client scoped by nothing but the
//      truckId it is handed. A body-supplied id would therefore read any truck's menu. The token is the
//      only identity this route trusts, exactly as /api/manage does."
// The same reasoning, one notch worse: this route WRITES. A body-supplied id would let any caller
// holding any dashboard token bind a WhatsApp connection — and a live Meta credential — onto ANOTHER
// truck's row. There is deliberately no `body.truckId` read anywhere in this file.
//
// ── 🔴 THE 30-SECOND CODE TTL ─────────────────────────────────────────────────────────────────────
// Meta: "The exchangeable token code has a time-to-live of 30 seconds." So: no queue, no background
// job, no retry-later, no confirmation step. The exchange is the FIRST thing this route does. If it
// fails, THE CODE IS DEAD — a retry seconds later is guaranteed to fail too — and the operator must
// re-run the whole flow. That is said to them in plain words (`CODE_DEAD_MESSAGE`), never swallowed.
//
// ── 🔴 NOTHING HERE MAY LOG THE CODE OR THE TOKEN. AT ANY LEVEL. INCLUDING ERROR PATHS. ───────────
// Not the code, not the token, not a prefix, not a length, not "the first six characters". Meta's own
// error bodies can echo a request back, so Graph error text is NEVER logged verbatim either — only the
// error's `code`/`type` and our own message. `redactGraphError` is the one funnel for that.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { encryptToken, encryptionKeyConfigured } from '@/lib/whatsapp/token-crypto'
import { parseMetaAppSecrets } from '@/lib/meta/webhook-signature'
import { FINISH_COEXISTENCE, FINISH_CLOUD_API, FINISH_ONLY_WABA, FINISH_OBO_MIGRATION, FINISH_GRANT_ONLY_API_ACCESS } from '@/lib/whatsapp/embedded-signup'
import { readWhatsAppConnection, type WhatsAppConnectionView } from '@/lib/whatsapp/connection-read'

// Node runtime: token-crypto uses node:crypto, which the edge runtime does not provide.
export const runtime = 'nodejs'
// Three sequential Graph calls plus two writes. The platform default (10s Hobby / 15s Pro) is tight if
// Meta is slow, and a timeout here after the token is stored is the messiest state to be in.
export const maxDuration = 60

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const TAG = '[whatsapp-signup]'

/** ⚠️ THE ONBOARDING GRAPH VERSION, PINNED SEPARATELY FROM BOTH OTHERS. Meta's tech-provider examples
 *  use v21.0 for the exchange and register calls. This is NOT `GRAPH_API_VERSION` (v19.0, the send and
 *  template path, past deprecation, deliberately untouched by this workstream) and NOT
 *  `SDK_GRAPH_VERSION` (v26.0, the browser SDK). Three versions, three independent decisions. */
const ONBOARDING_GRAPH_VERSION = 'v21.0'
const GRAPH = `https://graph.facebook.com/${ONBOARDING_GRAPH_VERSION}`

// ── 🔴 THERE IS NO TOKEN-LIFETIME CONSTANT ANY MORE, AND THERE MUST NOT BE ONE. ──────────────────
// This was `const TOKEN_LIFETIME_DAYS = 60`, and the 60 was FABRICATED after the v4 switch. It came
// from ONE fact about ONE configuration: the v2-era config 2892063604490064 was created from Meta's
// "…With 60 Expiration Token" template. The launcher now uses 1544768623597981, built by selecting
// PRODUCTS — no template, no stated lifetime — so the 60 was a number with nothing behind it being
// written into a column the state machine trusts.
// 🔴 THE EXPIRY NOW COMES FROM META, FROM `expires_in` ON THE EXCHANGE RESPONSE, OR IT DOES NOT COME
// AT ALL. `expires_in` is seconds-from-now and is what Meta actually issued for THIS token, on THIS
// configuration, today. If a future configuration changes the lifetime, nothing here needs editing.
// ⚠️ DO NOT REINTRODUCE A DEFAULT. A fallback constant is the same fabrication wearing a different
// name: it produces a confident date for a token whose real death we did not observe, and the
// failure is silent until a truck stops answering customers mid-service.

const CODE_DEAD_MESSAGE =
  'That took too long and the one-time code from Meta expired. Nothing was saved. Press Set up and run through it again — it should only take a minute.'

/** 🔴 THE ONE FUNNEL FOR GRAPH ERRORS. Meta's error bodies can echo the request, so the raw body never
 *  reaches a log line or the operator. Only the structured error code/type survive. */
function redactGraphError(body: unknown): { code: string | null; type: string | null } {
  const e = (body as any)?.error
  return {
    code: e?.code != null ? String(e.code) : null,
    type: e?.type != null ? String(e.type) : null,
  }
}

/** 🔴 THE RESPONSE SHAPE. `connection` IS THE S2 VIEW, PRODUCED BY THE SAME `readWhatsAppConnection`
 *  the Manage payload uses — four booleans-and-a-state, proven by execution to carry no token, no
 *  ciphertext and no ids. Reusing it here means this route cannot invent a richer, leakier shape of
 *  its own, and the client updates its state from the DATABASE rather than from a guess. */
type Ok = { ok: true; state: string; message: string; connection: WhatsAppConnectionView }
type Fail = { ok: false; kind: string; error: string }

function fail(kind: string, error: string, status: number) {
  return NextResponse.json<Fail>({ ok: false, kind, error }, { status })
}

/**
 * 🔴 THE ONE WAY THIS ROUTE REPORTS SUCCESS, AND `state` IS DERIVED, NEVER TYPED IN. ───────────────
 * Every success response used to carry a hand-written `state:` string beside a `connection` read back
 * from the database. 🔴 THEY DRIFTED, AND EXECUTION CAUGHT IT: the no-expiry branch said
 * `state: 'token_missing'` while the row it had just written actually derived `onboarding_incomplete`
 * (that row has no `phone_number_id`, and the derivation tests the missing number BEFORE the missing
 * token). A literal beside a derived value is a fabricated state waiting to happen — the label agrees
 * with what the author believed, not with what the row says.
 * ⚠️ SO THERE IS NOWHERE LEFT TO TYPE A STATE. `state` is taken from the connection view, which is
 * read from the row after the writes, through the same `readWhatsAppConnection` the Manage payload
 * uses. If the two ever disagree again it is because the DERIVATION changed, which is the only place
 * that decision belongs.
 */
async function ok(truckId: string, message: string) {
  const connection = await readWhatsAppConnection(supabase, truckId)
  return NextResponse.json<Ok>({ ok: true, state: connection.state, connection, message })
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return fail('bad_request', 'The request body was not valid JSON.', 400)
  }

  const token = typeof body.token === 'string' ? body.token : ''
  if (!token) return fail('unauthorised', 'Token required', 401)

  // 🔴 THE TRUCK COMES FROM THE TOKEN AND FROM NOTHING ELSE. See the header.
  const { data: truck } = await supabase
    .from('trucks')
    .select('id, name')
    .eq('dashboard_token', token)
    .single()
  if (!truck) return fail('unauthorised', 'Invalid token', 401)

  const kind = typeof body.kind === 'string' ? body.kind : ''

  // ── DIAGNOSTICS: ABANDONMENT AND ERRORS ──────────────────────────────────────────────────────────
  // 🔴 THESE ARE NOT DISCARDED. Which screen an operator gave up on, and which error code Meta showed
  // them, is the only evidence that exists — the flow runs inside Meta's iframe and leaves no other
  // trace on our side. ⚠️ THEY GO TO THE SERVER LOG, NOT TO A TABLE: no table exists for them and this
  // workstream is not adding an unrequested migration. Vercel's log retention is therefore the
  // retention. If these need to outlive that, they need a table and a migration you apply by hand.
  if (kind === 'abandoned' || kind === 'error') {
    console.warn(TAG, 'flow did not complete', {
      truck_id: truck.id,
      kind,
      current_step: typeof body.currentStep === 'string' ? body.currentStep : null,
      error_code: typeof body.errorCode === 'string' ? body.errorCode : null,
      error_message: typeof body.errorMessage === 'string' ? body.errorMessage : null,
      session_id: typeof body.sessionId === 'string' ? body.sessionId : null,
    })
    return NextResponse.json({ ok: true, state: 'unchanged', message: 'Logged.' })
  }

  if (kind !== 'complete') return fail('bad_request', 'Unrecognised signup outcome.', 400)

  const code = typeof body.code === 'string' ? body.code : ''
  const wabaId = typeof body.wabaId === 'string' && body.wabaId ? body.wabaId : ''
  const phoneNumberId = typeof body.phoneNumberId === 'string' && body.phoneNumberId ? body.phoneNumberId : ''
  const businessId = typeof body.businessId === 'string' && body.businessId ? body.businessId : null
  const finishType = typeof body.finishType === 'string' ? body.finishType : ''

  if (!code) return fail('bad_request', 'Meta did not return a one-time code. Press Set up and try again.', 400)
  if (!wabaId) return fail('bad_request', 'Meta did not return a WhatsApp Business Account. Press Set up and try again.', 400)

  // ── CONFIGURATION, CHECKED BEFORE THE CLOCK STARTS ───────────────────────────────────────────────
  // 🔴 CHECKED FIRST, DELIBERATELY. Discovering a missing env var AFTER burning the 30-second code
  // costs the operator a second run of the whole wizard for a fault that is entirely ours.
  if (!encryptionKeyConfigured()) {
    console.error(TAG, 'WHATSAPP_TOKEN_ENCRYPTION_KEY missing — refusing to exchange', { truck_id: truck.id })
    return fail('not_configured', 'WhatsApp setup is not available right now. We have been alerted — please contact support.', 503)
  }
  const appId = process.env.NEXT_PUBLIC_WHATSAPP_SIGNUP_APP_ID
  const secrets = parseMetaAppSecrets(process.env.META_WHATSAPP_APP_SECRET)
  if (!appId || secrets.length === 0) {
    console.error(TAG, 'app id or app secret missing — refusing to exchange', {
      truck_id: truck.id, has_app_id: !!appId, secret_count: secrets.length,
    })
    return fail('not_configured', 'WhatsApp setup is not available right now. We have been alerted — please contact support.', 503)
  }
  // ⚠️ `META_WHATSAPP_APP_SECRET` IS A COMMA-SEPARATED LIST (parseMetaAppSecrets) so the webhook can
  // verify signatures across an app-secret rotation. The exchange needs exactly ONE secret and it must
  // belong to the app in `appId`. The first entry is used. If the list ever carries more than one, that
  // assumption is worth checking — a wrong secret here fails the exchange and kills the code.
  if (secrets.length > 1) console.warn(TAG, 'multiple app secrets configured; using the first', { count: secrets.length })
  const appSecret = secrets[0]

  // ── CALL 1: EXCHANGE THE CODE. IMMEDIATELY. ──────────────────────────────────────────────────────
  let accessToken: string
  /** 🔴 SECONDS UNTIL THE TOKEN DIES, AS META REPORTS IT. `null` = Meta did not say. */
  let expiresInSeconds: number | null = null
  try {
    const url = new URL(`${GRAPH}/oauth/access_token`)
    url.searchParams.set('client_id', appId)
    url.searchParams.set('client_secret', appSecret)
    url.searchParams.set('code', code)
    // 🔴 `url` NOW CONTAINS BOTH THE APP SECRET AND THE CODE. It must never be logged, and it is not.
    const res = await fetch(url, { method: 'GET' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json?.access_token) {
      console.error(TAG, 'code exchange failed', { truck_id: truck.id, status: res.status, ...redactGraphError(json) })
      return fail('exchange_failed', CODE_DEAD_MESSAGE, 502)
    }
    accessToken = String(json.access_token)
    // 🔴 READ THE EXPIRY META ACTUALLY RETURNED. `expires_in` is seconds from now, and Meta omits it
    // for a token that does not expire. ⚠️ VALIDATED, NOT TRUSTED: a non-numeric, zero or negative
    // value is treated as ABSENT rather than coerced — a token that "expires in 0 seconds" would
    // derive `revoked` on the very next read and lock the truck out of a connection that works.
    const rawExpiresIn = Number(json.expires_in)
    expiresInSeconds = Number.isFinite(rawExpiresIn) && rawExpiresIn > 0 ? rawExpiresIn : null
  } catch (e) {
    // ⚠️ `(e as Error).message` ONLY. A thrown fetch error can carry the request URL in some runtimes,
    // and that URL holds the secret and the code — so the error OBJECT is never spread or serialised.
    console.error(TAG, 'code exchange threw', { truck_id: truck.id, message: (e as Error).message })
    return fail('exchange_failed', CODE_DEAD_MESSAGE, 502)
  }

  // 🔴 ONE INSTANT, USED FOR BOTH ENDS OF THE LIFETIME. `issuedAt` is captured here — immediately after
  // the exchange returned, before any write — and `expiresAt` is that same instant plus Meta's
  // `expires_in`. So `token_expires_at - token_issued_at` reconstructs `expires_in` EXACTLY rather than
  // approximating it, and the two can never drift by the duration of the writes between them.
  // ⚠️ IT IS THE EXCHANGE INSTANT, NOT THE WRITE INSTANT, AND THAT IS THE POINT. Reading the clock
  // again at the upsert would make the stored lifetime shorter than the one Meta actually granted.
  const issuedAtMs = Date.now()
  const issuedAt = new Date(issuedAtMs).toISOString()
  const expiresAt = expiresInSeconds === null
    ? null
    : new Date(issuedAtMs + expiresInSeconds * 1000).toISOString()

  // ── 🔴 NO `expires_in` ⇒ WE DO NOT STORE THE TOKEN. THE DECISION, AND WHY IT IS THE ONLY ONE. ────
  // ⚠️ "STORE THE TOKEN WITH A NULL EXPIRY" IS NOT ACTUALLY ON THE TABLE. The table's CHECK —
  //     check (access_token_ciphertext is null or token_expires_at is not null)
  // forbids exactly that pair, so choosing it would not produce a null-expiry row; it would produce a
  // 23514 constraint violation and a 500. The real choice is between DROPPING THE TOKEN and CHANGING
  // THE SCHEMA, and a schema change is a hand-applied migration, not something to smuggle in here.
  // 🔴 SO WE DROP THE TOKEN AND KEEP THE IDENTIFIERS. The row is written with waba/business/finish and
  // NO ciphertext, which satisfies the CHECK and derives `token_missing` — a state whose own
  // documentation is this situation exactly: "IDENTIFIERS ARE COMPLETE BUT WE HOLD NO USABLE TOKEN.
  // Not the operator's fault and not something they can fix." It routes to support and offers NO
  // button, because there is no button that would help.
  // ⚠️ YES, THIS DISCARDS A TOKEN THAT MIGHT BE PERFECTLY VALID — Meta omits `expires_in` for tokens
  // that never expire, so a missing value may mean "permanent", not "broken". That is a real cost and
  // it is accepted deliberately: a permanent token is a change to what this table can represent, and
  // the alternative — inventing a death date for a token we cannot describe — is the fabrication this
  // whole change removes. If permanent tokens turn out to be the norm, relax the CHECK in a migration
  // and store a null expiry HONESTLY, rather than defaulting here.
  if (expiresAt === null) {
    console.error(TAG, 'exchange returned no usable expires_in — refusing to store the token', {
      truck_id: truck.id, finish_type: finishType || null,
    })
    const noExpiry = await supabase.from('whatsapp_connections').upsert({
      truck_id: truck.id,
      waba_id: wabaId,
      phone_number_id: null,
      business_id: businessId,
      finish_type: finishType || null,
      access_token_ciphertext: null,   // 🔴 THE TOKEN IS DELIBERATELY NOT STORED.
      token_expires_at: null,
      token_issued_at: null,           // no token ⇒ no issue time. Both CHECKs are satisfied by the null above.
      token_revoked_at: null,
      payment_method_present: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'truck_id' })
    if (noExpiry.error) {
      console.error(TAG, 'no-expiry write failed', { truck_id: truck.id, code: noExpiry.error.code, message: noExpiry.error.message })
    }
    return ok(truck.id, 'We linked your WhatsApp Business account but could not complete the connection. Nothing is wrong on your side — please contact us and we will finish it.')
  }

  // ── PHASE A WRITE: THE TOKEN IS PERSISTED BEFORE CALLS 2 AND 3, WITHOUT `phone_number_id`. ───────
  // 🔴 THIS IS THE ANSWER TO "WHAT IF CALL 2 OR 3 FAILS AFTER THE TOKEN IS STORED?" — and it is the
  // reason the state machine has an `onboarding_incomplete` state at all.
  //   • Writing everything up front would leave a row deriving `ready` while the WABA is NOT subscribed
  //     to our webhook. `ready` means "we can send"; a truck that receives nothing is not ready. That
  //     is a fabricated connected state, which this codebase forbids.
  //   • Writing nothing until all three succeed would DISCARD a token we cannot get again — the code is
  //     spent, so a failure at step 3 would cost the operator the whole wizard for a Meta hiccup.
  // So: waba/business/finish/token/expiry now, `phone_number_id` only once 2 and 3 have succeeded.
  // A partial failure therefore derives `onboarding_incomplete` → NOT sendable, offers "Reconnect".
  // ⚠️ IDEMPOTENT BY CONSTRUCTION: `upsert` on the `truck_id` PRIMARY KEY. Re-running the flow for a
  // truck that already has a row UPDATES it — it cannot duplicate, and it cannot half-write, because
  // the CHECK constraint refuses ciphertext without an expiry in the same statement.
  const phaseA = await supabase.from('whatsapp_connections').upsert({
    truck_id: truck.id,
    waba_id: wabaId,
    phone_number_id: null,
    business_id: businessId,
    finish_type: finishType || null,
    access_token_ciphertext: encryptToken(accessToken),
    token_expires_at: expiresAt,
    // 🔴 WRITTEN IN THE SAME STATEMENT AS THE CIPHERTEXT. The CHECK
    // `whatsapp_connections_token_issued_together` refuses the row otherwise, which is the point:
    // a stored token that nobody can date is a token whose renewal prompt cannot be timed.
    token_issued_at: issuedAt,
    token_revoked_at: null,
    payment_method_present: null,   // 🔴 NULL = UNREAD. Never write `false` for "we did not ask".
    updated_at: new Date().toISOString(),
  }, { onConflict: 'truck_id' })

  if (phaseA.error) {
    console.error(TAG, 'phase A write failed', { truck_id: truck.id, code: phaseA.error.code, message: phaseA.error.message })
    return fail('write_failed', 'We connected to Meta but could not save the connection. Please contact support — do not run the setup again yet.', 500)
  }

  // ── CALL 2: REGISTER THE BUSINESS PHONE NUMBER FOR CLOUD API USE ────────────────────────────────
  // 🔴 SKIPPED FOR COEXISTENCE, ON META'S OWN INSTRUCTION, AND THIS IS OUR ONLY SUPPORTED CASE.
  // "Onboard WhatsApp Business app users": for a number already in use with the WhatsApp Business app,
  // "skip the phone number registration step, as the number is already registered."
  // ⚠️ FLAGGED RATHER THAN QUIETLY OMITTED: the brief asked for three calls unconditionally. The call
  // IS implemented below; it is skipped only when Meta says the number is already registered.
  // Re-registering an operator's live WhatsApp Business number is not a no-op — it is the one call in
  // this file that could disturb the phone in their van.
  //
  // ── 🔴 KEYED ON THE FINISH TYPE META RETURNED, NOT ON A BUILD-TIME CONSTANT (4 September 2026). ──
  // This was `const SKIP_REGISTER_FOR_COEXISTENCE = true`, which is WRONG in a way that only shows up
  // in production: a truck completing the DEFAULT flow gets a freshly provisioned Cloud API number
  // that MUST be registered, and a constant would have skipped it for them too — leaving a number
  // that looks connected and can never send. A constant makes per-truck behaviour a code change; the
  // finish type is per-truck data and is already stored on the row.
  // 🔴 THE DEFAULT FOR AN UNKNOWN FINISH TYPE IS TO REGISTER. Meta may add finish types; a new one
  // that provisions a number and is silently skipped is mute, whereas registering an already-
  // registered number returns an error we surface. Fail toward the recoverable side.
  const REGISTRATION_BY_FINISH_TYPE: Record<string, { register: boolean; why: string }> = {
    [FINISH_COEXISTENCE]:            { register: false, why: 'coexistence: the operator’s own number is already registered' },
    [FINISH_CLOUD_API]:              { register: true,  why: 'default flow: a new Cloud API number was provisioned' },
    [FINISH_OBO_MIGRATION]:          { register: true,  why: 'on-behalf-of migration: the number is moving in from another provider' },
    [FINISH_ONLY_WABA]:              { register: false, why: 'WABA only: no phone number was onboarded' },
    [FINISH_GRANT_ONLY_API_ACCESS]:  { register: false, why: 'grant-only: no phone number was onboarded through this flow' },
  }
  const rule = REGISTRATION_BY_FINISH_TYPE[finishType]
    ?? { register: true, why: `unrecognised finish type ${finishType || '(none)'} — registering, because a provisioned number that is never registered is silently mute` }
  const isCoexistence = finishType === FINISH_COEXISTENCE
  let registerSkipped: string | null = null

  if (!phoneNumberId) {
    // FINISH_ONLY_WABA and abandonment-after-WABA both land here. The row stays at
    // `onboarding_incomplete` and the operator is told what is missing.
    return ok(truck.id, 'Your WhatsApp Business account is linked, but no phone number came back. Press Reconnect and finish the number step.')
  }

  if (!rule.register) {
    registerSkipped = rule.why
  } else {
    // 🔴 THE PIN IS A REAL CREDENTIAL AND IS NOT INVENTED HERE. Meta requires a 6-digit two-step
    // verification PIN on register. There is no column for it and no value in the environment by
    // default, so rather than generating one nobody can ever recover, this refuses and says so.
    const pin = process.env.WHATSAPP_REGISTRATION_PIN
    if (!pin || !/^\d{6}$/.test(pin)) {
      console.error(TAG, 'registration required but WHATSAPP_REGISTRATION_PIN is unset or not six digits', {
        truck_id: truck.id, finish_type: finishType || null, why: rule.why,
      })
      return ok(truck.id, 'Your account is linked, but this number needs registering by us before replies can start. Please contact support — your setup is saved, do not run it again.')
    }
    const reg = await fetch(`${GRAPH}/${encodeURIComponent(phoneNumberId)}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ messaging_product: 'whatsapp', pin }),
    })
    if (!reg.ok) {
      const j = await reg.json().catch(() => ({}))
      console.error(TAG, 'phone number registration failed', { truck_id: truck.id, status: reg.status, ...redactGraphError(j) })
      return ok(truck.id, 'Your account is linked but Meta would not register the number. Your setup is saved — please contact support rather than running it again.')
    }
  }

  // ── CALL 3: SUBSCRIBE OUR APP TO WEBHOOKS ON THE CUSTOMER'S WABA ────────────────────────────────
  // 🔴 WITHOUT THIS THE TRUCK RECEIVES NOTHING. App-level `account_update` is a field subscription, not
  // a WABA subscription — this is what points the customer's message traffic at our webhook.
  const sub = await fetch(`${GRAPH}/${encodeURIComponent(wabaId)}/subscribed_apps`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!sub.ok) {
    const j = await sub.json().catch(() => ({}))
    console.error(TAG, 'webhook subscription failed', { truck_id: truck.id, status: sub.status, ...redactGraphError(j) })
    return ok(truck.id, 'Your account is linked but Meta would not turn on message delivery. Your setup is saved — please contact support rather than running it again.')
  }

  // ── PHASE B WRITE: THE NUMBER GOES IN LAST, AND THAT IS WHAT MAKES THE STATE `ready`. ────────────
  const phaseB = await supabase
    .from('whatsapp_connections')
    .update({ phone_number_id: phoneNumberId, updated_at: new Date().toISOString() })
    .eq('truck_id', truck.id)

  if (phaseB.error) {
    // 🔴 23505 = unique_violation. The partial unique index on phone_number_id means ANOTHER TRUCK
    // ALREADY HOLDS THIS NUMBER — a real and likely case: an operator with two trucks running one
    // WhatsApp number, or a number moved between accounts. A generic "write failed" would send support
    // hunting through Postgres logs, so it is named exactly.
    if (phaseB.error.code === '23505') {
      console.error(TAG, 'phone_number_id already claimed by another truck', { truck_id: truck.id })
      return ok(truck.id, 'That WhatsApp number is already connected to another HatchGrab account. A number can only answer for one truck. Contact support and we will move it across.')
    }
    console.error(TAG, 'phase B write failed', { truck_id: truck.id, code: phaseB.error.code, message: phaseB.error.message })
    return ok(truck.id, 'Almost there — we could not finish saving. Your setup is saved, please contact support rather than running it again.')
  }

  console.info(TAG, 'connection established', {
    truck_id: truck.id, finish_type: finishType || null,
    coexistence: isCoexistence, registered: rule.register, register_skipped: registerSkipped,
  })

  return ok(truck.id, 'WhatsApp is connected. Auto-replies will start answering messages to this number.')
}
