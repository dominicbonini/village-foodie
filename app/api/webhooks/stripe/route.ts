// ── /api/webhooks/stripe — INBOUND STRIPE EVENTS ────────────────────────────────────────────────────
// GROUNDWORK ONLY. This endpoint verifies that an event genuinely came from Stripe and records that it
// arrived. IT MOVES NO MONEY. It does not write to order_payments, does not create PaymentIntents or
// Connect accounts, and does not touch the customer order path or anything in lib/payments. When a
// handler is built it will be a NEW caller of recordPaymentEvent, added here deliberately — not by
// widening what this file already does.
//
// 🔴 THE RAW BODY. THIS IS THE ONE THAT BITES.
// `await req.text()` is called FIRST, before anything else touches the request, and `req.json()` is
// never called on this route. Two independent reasons, and only the second is widely known:
//   1. The body is a STREAM AND CAN ONLY BE READ ONCE. Call req.json() first and the stream is consumed;
//      a later req.text() throws "Body is unusable". There is no way back.
//   2. Even if you could, re-serialising is fatal. `JSON.stringify(JSON.parse(body))` is a DIFFERENT
//      STRING from what Stripe signed — key order, whitespace, unicode escaping and number formatting
//      all drift — so the HMAC differs and verification fails 100% of the time WITH A CORRECT SECRET.
//      It presents as "my signing secret must be wrong", which sends you looking in the wrong place.
// ⚠️ A NOTE ON THE FRAMEWORK, because the usual warning is about a different router: in the APP ROUTER
// (this file) a route handler receives a Web `Request` and the body is NOT parsed for you — you choose
// .json() or .text(), so the raw bytes are simply available. The "Next.js parses the body by default"
// hazard, and its fix `export const config = { api: { bodyParser: false } }`, belong to the PAGES router
// (`pages/api/*`). That config key does NOTHING here. The trap in the App Router is the two points
// above, not an implicit parser — and it is just as fatal, so the discipline is identical.
//
// ── ERROR CONTRACT, WHICH IS ALSO A RETRY CONTRACT ──────────────────────────────────────────────────
// Stripe retries on any non-2xx for up to three days. So the status code is not a formality; it is an
// instruction to Stripe about whether to send this again.
//   400 — the request is not from Stripe, or is not parseable. RETRYING WOULD NOT HELP, and a forged
//         request must never earn a retry. Nothing is recorded.
//   500 — verified, well-formed, but we failed to PERSIST it. RETRY IS EXACTLY WHAT WE WANT: we hold no
//         record, so Stripe re-sending is the recovery mechanism. This is the one case where a non-2xx
//         is the correct outcome rather than a bug.
//   200 — accepted and durably recorded, OR a duplicate of something already recorded, OR a verified
//         event of a type we do not handle. All three are "do not send this again".
// 🔴 The 2xx is returned as soon as the event is DURABLY RECORDED and no later. Nothing slow, and
// nothing that can throw, runs between verification and the response — because a slow or throwing
// handler is precisely what turns one delivery into several.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseSigningSecrets, verifyStripeSignature } from '@/lib/stripe/webhook-signature'

// Node runtime, pinned EXPLICITLY. Signature verification uses node:crypto's createHmac/timingSafeEqual,
// which do not exist on the edge runtime. Without this the route would build fine and fail at runtime on
// every request. Precedent: app/api/manage/verify-schedule-url/route.ts.
export const runtime = 'nodejs'

// Service-role client at module scope — the house pattern for a server-only route
// (app/api/inbound-schedule, app/api/webhooks/meta/whatsapp, …). stripe_webhook_events has RLS enabled
// with zero policies, so the service key is the only thing that can write to it.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/** The subset of a Stripe Event this endpoint reads. Deliberately narrow: everything else in the payload
 *  is ignored and none of it is stored (see the migration header for why the body is not persisted). */
interface StripeEventEnvelope {
  id?: unknown
  type?: unknown
  livemode?: unknown
  account?: unknown
  api_version?: unknown
  created?: unknown
}

/** Postgres unique-violation. A duplicate delivery, which is a SUCCESS on this endpoint. */
const PG_UNIQUE_VIOLATION = '23505'

export async function POST(req: NextRequest) {
  // 🔴 FIRST LINE. See the raw-body note in the header. Nothing may read the body before this.
  let rawBody: string
  try {
    rawBody = await req.text()
  } catch (err) {
    // A body that cannot even be read as text is not a Stripe delivery. Nothing to verify, nothing to
    // record, and no useful retry.
    console.error('[webhook/stripe] REFUSED — could not read request body:', err)
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  const signatureHeader = req.headers.get('stripe-signature')
  const secrets = parseSigningSecrets(process.env.STRIPE_WEBHOOK_SECRET)

  // ── 🔴 THE GATE. THERE IS NO PATH AROUND THIS AND NO FLAG THAT SKIPS IT. ─────────────────────────
  // Every `return` between here and the verification result is a refusal. `rawBody` is NOT parsed, NOT
  // inspected and NOT logged before this call — the only thing that happens to an unverified body is
  // that its LENGTH is measured for the log line below. Deliberately no env-var bypass, no
  // NODE_ENV==='development' shortcut and no "skip if no secret configured": Stripe's own quickstart
  // sample verifies only `if (endpointSecret)`, which means a deployment that forgot the variable
  // accepts anything from anyone. That is a tutorial convenience and it is refused here — an unset
  // secret is a broken deployment, and it fails closed.
  const verification = verifyStripeSignature({ rawBody, signatureHeader, secrets })

  if (!verification.ok) {
    // 🔴 THE LOG IS THE 7PM-FRIDAY ARTEFACT, so it names the CAUSE rather than saying "unauthorised",
    // and it carries the three things that distinguish the realistic failures from each other:
    //   no_secret_configured        → STRIPE_WEBHOOK_SECRET is missing in this environment.
    //   missing_signature_header    → something that is not Stripe is POSTing here (a scanner, a probe).
    //   signature_mismatch          → wrong secret for this endpoint, OR the secret for the OTHER mode
    //                                 is the only one configured, OR a genuine forgery.
    //   timestamp_outside_tolerance → a real Stripe signature that is stale (heavily delayed retry, or
    //                                 a replay of a captured request), or this server's clock has drifted.
    // secretsConfigured is a COUNT, never the values. bodyBytes distinguishes an empty probe from a
    // real payload without logging a single byte of an unverified body.
    console.error(
      `[webhook/stripe] REFUSED reason=${verification.reason} ` +
      `secretsConfigured=${secrets.length} hasSignature=${!!signatureHeader} bodyBytes=${rawBody.length}`,
    )
    // ⚠️ The response says nothing. The reason is for our logs, not for whoever sent this — a caller
    // probing the endpoint must not learn whether a secret is configured or which check it tripped.
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // ── VERIFIED. Only now is the body trusted enough to parse. ───────────────────────────────────────
  let event: StripeEventEnvelope
  try {
    event = JSON.parse(rawBody) as StripeEventEnvelope
  } catch {
    // Signed by Stripe but not JSON. Not reachable in practice; refused rather than assumed.
    console.error('[webhook/stripe] REFUSED reason=signed_but_unparseable')
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  const eventId = typeof event.id === 'string' ? event.id : null
  const eventType = typeof event.type === 'string' ? event.type : null
  // 🔴 STRICT BOOLEAN, NOT TRUTHINESS. See the livemode note at the insert below. A payload whose
  // livemode is absent or non-boolean is refused rather than guessed at — there is no safe default.
  const livemode = typeof event.livemode === 'boolean' ? event.livemode : null

  if (!eventId || !eventType || livemode === null) {
    console.error(
      `[webhook/stripe] REFUSED reason=malformed_event ` +
      `hasId=${!!eventId} hasType=${!!eventType} hasLivemode=${livemode !== null}`,
    )
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  // The connected account for a Connect event. Stripe: "Each event for a connected account contains a
  // top-level `account` property that identifies the connected account." Absent on platform events.
  const connectedAccount = typeof event.account === 'string' ? event.account : null
  const apiVersion = typeof event.api_version === 'string' ? event.api_version : null
  // `created` is unix SECONDS. Guarded because a malformed value would otherwise become 1970 or Invalid
  // Date and quietly poison the delivery-delay figure this column exists to give.
  const stripeCreatedAt =
    typeof event.created === 'number' && Number.isFinite(event.created)
      ? new Date(event.created * 1000).toISOString()
      : null

  // ── 🔴 IDEMPOTENCY: INSERT FIRST, LET THE UNIQUE CONSTRAINT ARBITRATE ────────────────────────────
  // Deliberately NOT `select … then insert if absent`. Stripe guarantees AT-LEAST-ONCE delivery and
  // retries for up to three days, so the realistic duplicate is a retry racing a slow first attempt —
  // and both requests would read "not seen" before either wrote. Only the database can settle that, so
  // it is asked to: 23505 on stripe_webhook_events_event_id_uniq IS the duplicate detection.
  // Same idiom the payment ledger already uses (recordPaymentEvent treats 23505 as a successful no-op),
  // deliberately, so idempotency is done ONE way in this codebase rather than two.
  const { error: insertErr } = await supabase.from('stripe_webhook_events').insert({
    stripe_event_id: eventId,
    type: eventType,
    // ── 🔴 LIVEMODE COMES FROM THE EVENT. THIS IS THE WHOLE POINT OF THE FIELD. ──────────────────
    // `event.livemode`, copied verbatim. NEVER from STRIPE_WEBHOOK_SECRET's shape, never from an
    // sk_test_/sk_live_ prefix, never from NODE_ENV, and never from the fact that this is the
    // production endpoint. Stripe documents that "your production webhook URLs receive BOTH live and
    // test webhooks… We recommend that you check the `livemode` value" — so the endpoint proves
    // nothing, and the key proves nothing about a callback that arrived unbidden. The event is the
    // ONLY artefact that knows which mode produced it, and it states it in this field.
    // Deriving it from configuration would look correct and be wrong exactly when it mattered: the day
    // a test payment landed on a truck trading real money. That is the defect order_payments.livemode
    // was added to prevent, and it would be reintroduced here, one layer earlier.
    livemode,
    connected_account: connectedAccount,
    api_version: apiVersion,
    stripe_created_at: stripeCreatedAt,
  })

  if (insertErr) {
    if (insertErr.code === PG_UNIQUE_VIOLATION) {
      // DUPLICATE DELIVERY. Not an error — the documented behaviour of an at-least-once system. The
      // first delivery is already recorded, so acknowledge and stop. 200, so Stripe stops retrying.
      console.log(
        `[webhook/stripe] DUPLICATE id=${eventId} type=${eventType} livemode=${livemode}` +
        `${connectedAccount ? ` account=${connectedAccount}` : ''} — already recorded, ignoring`,
      )
      return NextResponse.json({ received: true, duplicate: true })
    }
    // 🔴 A REAL PERSISTENCE FAILURE. 500 ON PURPOSE, so Stripe retries — we hold no record of this
    // event, and its re-delivery is the recovery path. This is the one branch where a non-2xx is the
    // correct answer rather than a mistake. Names the event id so the retry can be correlated.
    console.error(
      `[webhook/stripe] PERSIST FAILED id=${eventId} type=${eventType} livemode=${livemode} — ` +
      `returning 500 so Stripe retries. ${insertErr.code ?? ''} ${insertErr.message}`,
    )
    return NextResponse.json({ error: 'Could not record event' }, { status: 500 })
  }

  // ── ACCEPTED ─────────────────────────────────────────────────────────────────────────────────────
  // One line, one event, every field needed to find it again. `id` is the join key to Stripe's own
  // Dashboard, which holds the payload this app deliberately does not store — so this log plus that id
  // is a complete trail without keeping customer identifiers in our database.
  // 🔴 `livemode` is logged EXPLICITLY and on every line. During test-mode bring-up, `livemode=true`
  // appearing in these logs means a REAL event has reached this app, and that should be noticed
  // immediately rather than discovered later in a table.
  console.log(
    `[webhook/stripe] RECEIVED id=${eventId} type=${eventType} livemode=${livemode}` +
    `${connectedAccount ? ` account=${connectedAccount}` : ''}` +
    `${apiVersion ? ` apiVersion=${apiVersion}` : ''}`,
  )

  // ── UNRECOGNISED EVENT TYPES ARE NORMAL, NOT ERRORS ──────────────────────────────────────────────
  // No handler exists for ANY type yet — that is this pass's scope, not an oversight. Every verified
  // event is recorded and acknowledged, whatever its type. When handlers arrive they dispatch here on
  // `eventType`, and the default arm stays exactly this: record, log, 200. Returning non-2xx for a type
  // we do not handle would make Stripe retry it for three days to no purpose, and eventually disable
  // the endpoint.
  return NextResponse.json({ received: true })
}
