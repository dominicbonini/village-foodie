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
import { extractConnectedAccount, extractStripeCreatedAt, isThinEvent } from '@/lib/stripe/webhook-envelope'
// 🔴 THE ONLY WRITER OF AN ONLINE PAYMENT INTO order_payments. See the payment_intent.succeeded branch.
import { recordOnlineCardPayment, recordOnlineCardRefund, onlinePaymentIdempotencyKey } from '@/lib/payments/online'
// ── PHASE 2b: promotion. Started out of band; never awaited before the 2xx. See startPromotion. ────
import { promoteDraft } from '@/lib/payments/promote-draft'
import { getOrderDraft } from '@/lib/payments/order-drafts'
// 🔴 THE FIX FOR THE SUSPENSION ORDER 25 EVIDENCED. See the file, and startPromotion below.
import { keepAlive } from '@/lib/runtime/after-response'
// A PENDING refund writes no ledger row (see the refund branch); this is how it stays visible anyway.
import { logAction } from '@/lib/audit/actionAudit'
// ⚠️ THE ONLY OUTBOUND STRIPE CALL ON THIS ROUTE, and it exists for one measured reason: a
// `charge.refunded` payload carries NO refunds list, so the safety-net branch has to ask. See it there.
import Stripe from 'stripe'

// Node runtime, pinned EXPLICITLY. Signature verification uses node:crypto's createHmac/timingSafeEqual,
// which do not exist on the edge runtime. Without this the route would build fine and fail at runtime on
// every request. Precedent: app/api/manage/verify-schedule-url/route.ts.
export const runtime = 'nodejs'

// ── 🔴 THE BUDGET FOR THE WORK THAT OUTLIVES THE RESPONSE. ────────────────────────────────────────
// This route returns its 2xx in well under a second and then keeps promoting, so `maxDuration` is not a
// bound on the customer's latency — it is the window the runtime is willing to keep this container
// awake for the `after()` task. It had NONE, so it inherited the platform default the repo documents at
// app/api/demo/route.ts:23 as "10s on Hobby / 15s on Pro".
// 🔴 THAT DEFAULT IS BELOW THE MEASURED COST OF A PROMOTION. Order 25 spent 23.5s from claim to insert
// alone; order 24 took 20.4s end to end including its two emails. A 15s budget cannot host either.
// Set to 300 — the same number and the same reasoning as app/api/demo/route.ts, which records it as
// "the highest a Vercel Pro Node function permits (300s)". ⚠️ REQUIRES THE PRO PLAN: on Hobby the cap is
// 60s and this value is rejected.
// ⚠️ IT COSTS NOTHING WHEN UNUSED. Vercel bills actual duration, and the ordinary promotion finishes in
// seconds. The number is a ceiling for the pathological case, not a reservation — and the pathological
// case is exactly the one that currently loses a customer's order.
export const maxDuration = 300

// Service-role client at module scope — the house pattern for a server-only route
// (app/api/inbound-schedule, app/api/webhooks/meta/whatsapp, …). stripe_webhook_events has RLS enabled
// with zero policies, so the service key is the only thing that can write to it.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/** The subset of a Stripe Event this endpoint reads. Deliberately narrow: everything else in the payload
 *  is ignored and none of it is stored (see the migration header for why the body is not persisted).
 *  ⚠️ SPANS BOTH FORMATS. `account` and `api_version` are v1-only; `object`, `related_object` and
 *  `context` are how a v2 thin event says the same things. See lib/stripe/webhook-envelope.ts. */
interface StripeEventEnvelope {
  id?: unknown
  type?: unknown
  livemode?: unknown
  account?: unknown
  api_version?: unknown
  created?: unknown
  object?: unknown
  related_object?: unknown
  context?: unknown
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

  // ── 🔴 THE TWO FIELDS THAT USED TO BE DROPPED ON EVERY v2 EVENT ──────────────────────────────────
  // Both are extracted by lib/stripe/webhook-envelope.ts, which handles v1 and v2 shapes SEPARATELY
  // rather than assuming one of them. Each returns a `source` slug alongside the value, because a NULL
  // meaning "this event has no connected account" and a NULL meaning "we failed to read one" are not
  // the same NULL and must not look the same in this table or in these logs.
  const account = extractConnectedAccount(event)
  const created = extractStripeCreatedAt(event.created)
  const connectedAccount = account.value
  const stripeCreatedAt = created.value

  // ⚠️ `api_version` IS v1-ONLY AND ITS NULL IS CORRECT, NOT A DROP. Thin events are UNVERSIONED by
  // design — Stripe: "Unversioned, allowing you to upgrade your integration without changing your
  // webhook endpoint configuration" — so there is no value to record and none is invented.
  const apiVersion = typeof event.api_version === 'string' ? event.api_version : null

  // 🔴 A DROP IS LOUD. `unreadable` means the payload offered the value and we could not read it, which
  // is the failure this pair of fields just spent a probe demonstrating can happen in total silence.
  // Logged at error level with the raw value, and the event is still recorded — a diagnostic gap must
  // not cost us the receipt.
  if (created.source === 'unreadable' || account.source === 'unreadable') {
    console.error(
      `[webhook/stripe] FIELD DROP id=${eventId} type=${eventType} ` +
      `createdSource=${created.source} rawCreated=${JSON.stringify(event.created)} ` +
      `accountSource=${account.source} — recorded with a NULL that means "we could not read it"`,
    )
  }

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
      // ── 🔴 A DUPLICATE IS NOT AUTOMATICALLY A NO-OP ANY MORE ────────────────────────────────────
      // This used to return immediately, BEFORE any handler ran, and that was right when every handler
      // was cheap and synchronous: the first delivery had already done the work.
      // It is wrong now. Promotion runs OUT OF BAND, so a first delivery can be recorded and then have
      // its promotion dropped — a frozen serverless invocation, a crash, a lock it could not get. If a
      // redelivery still short-circuits here, that draft is never promoted by the webhook at all, and
      // the customer's money sits authorised against nothing.
      // 🔴 SO THE DUPLICATE BRANCH NOW DISTINGUISHES THE TWO CASES, using the `handled` flag the first
      // delivery sets only once its handler reached a decision:
      //     handled = true   → the work was done. Acknowledge and stop, exactly as before.
      //     handled = false  → recorded, but the handler never finished. FALL THROUGH and run it.
      // ⚠️ RE-RUNNING IS SAFE BECAUSE PROMOTION IS IDEMPOTENT ON THE DRAFT CLAIM: a second promotion of
      // an already-promoted draft gets zero rows from the conditional UPDATE and returns `already`. The
      // ledger is likewise idempotent on the PaymentIntent id. Nothing here can double.
      const { data: seen } = await supabase
        .from('stripe_webhook_events')
        .select('handled, handler_result')
        .eq('stripe_event_id', eventId)
        .maybeSingle()
      if (seen?.handled) {
        console.log(
          `[webhook/stripe] DUPLICATE id=${eventId} type=${eventType} livemode=${livemode}` +
          `${connectedAccount ? ` account=${connectedAccount}` : ''} — already recorded AND handled ` +
          `(${seen.handler_result ?? 'no result'}), ignoring`,
        )
        return NextResponse.json({ received: true, duplicate: true })
      }
      console.warn(
        `[webhook/stripe] DUPLICATE id=${eventId} type=${eventType} — recorded but NOT handled ` +
        `(handled=${String(seen?.handled)}). Re-running the handler: a first delivery whose out-of-band ` +
        `work was dropped is exactly what this redelivery is for.`,
      )
      // ⚠️ Deliberately NOT a return. Execution continues into the dispatch below.
    } else {
      // 🔴 A REAL PERSISTENCE FAILURE. 500 ON PURPOSE, so Stripe retries — we hold no record of this
      // event, and its re-delivery is the recovery path. This is the one branch where a non-2xx is the
      // correct answer rather than a mistake. Names the event id so the retry can be correlated.
      console.error(
        `[webhook/stripe] PERSIST FAILED id=${eventId} type=${eventType} livemode=${livemode} — ` +
        `returning 500 so Stripe retries. ${insertErr.code ?? ''} ${insertErr.message}`,
      )
      return NextResponse.json({ error: 'Could not record event' }, { status: 500 })
    }
  }

  // ── ACCEPTED ─────────────────────────────────────────────────────────────────────────────────────
  // One line, one event, every field needed to find it again. `id` is the join key to Stripe's own
  // Dashboard, which holds the payload this app deliberately does not store — so this log plus that id
  // is a complete trail without keeping customer identifiers in our database.
  // 🔴 `livemode` is logged EXPLICITLY and on every line. During test-mode bring-up, `livemode=true`
  // appearing in these logs means a REAL event has reached this app, and that should be noticed
  // immediately rather than discovered later in a table.
  // ⚠️ `format` and the two `…Source` slugs are on every line deliberately. One URL now receives both
  // event formats (see §6.3 of the Connect report — three registrations point at it), so "which shape
  // was this" is the first question asked when a row looks wrong, and it is not answerable from the
  // stored columns alone once a value is NULL.
  console.log(
    `[webhook/stripe] RECEIVED id=${eventId} type=${eventType} livemode=${livemode} ` +
    `format=${isThinEvent(event) ? 'thin' : 'snapshot'} ` +
    `account=${connectedAccount ?? 'null'}(${account.source}) created=${created.source}` +
    `${apiVersion ? ` apiVersion=${apiVersion}` : ''}`,
  )

  // ── 🔴 account.updated — THE ONLY HANDLER, AND IT KEEPS A MONEY GATE FRESH ───────────────────────
  // `operators.stripe_charges_enabled` is the single readiness test for whether a truck may be offered
  // card payment. Stripe can withdraw `charges_enabled` at any time when a requirement falls due, and
  // when it does, THIS is what notices. If this branch stops working the failure is silent by
  // construction: the cached value simply stops changing, and a stale `true` is a truck still being
  // offered card payment that Stripe has stopped allowing.
  //
  // 🔴 LIVEMODE-GUARDED, AND THE GUARD IS `!== false`, NOT `=== true`. `livemode` is parsed strictly
  // above and is `null` when the payload carried a non-boolean. A null here means "we could not tell",
  // and an event we cannot classify must NOT be allowed to write a money gate. Only an explicit
  // `livemode: false` — a sandbox event, which is all this build may act on — proceeds.
  // ⚠️ When live accounts are switched on, this condition is the thing to change, deliberately and in
  // its own change. Do not widen it while `lib/stripe/connect.ts` still refuses a live key.
  //
  // ⚠️ IT LOOKS THE OPERATOR UP BY ACCOUNT ID, which is why the migration puts a UNIQUE index on
  // `operators.stripe_account_id`. Without it a duplicated id would make this update an arbitrary row.
  if (eventType === 'account.updated') {
    if (livemode !== false) {
      console.warn(
        `[webhook/stripe] account.updated IGNORED id=${eventId} livemode=${livemode} — this build acts ` +
        `on SANDBOX events only, and a null livemode means the payload could not be classified`,
      )
      await markHandled(eventId, 'ignored:livemode')
      return NextResponse.json({ received: true })
    }

    // The account this event is about. For Connect events Stripe sets `account`; `data.object.id` is the
    // same account for account.updated. Prefer the envelope, fall back to the object.
    const dataObject = (event as { data?: { object?: { id?: unknown; charges_enabled?: unknown } } }).data?.object
    const accountId = connectedAccount ?? (typeof dataObject?.id === 'string' ? dataObject.id : null)
    // 🔴 STRICT BOOLEAN AGAIN. A missing or non-boolean `charges_enabled` must not be coerced — reading
    // `undefined` as false would revoke a working truck's readiness on a malformed payload.
    const chargesEnabled = typeof dataObject?.charges_enabled === 'boolean' ? dataObject.charges_enabled : null

    if (!accountId || chargesEnabled === null) {
      console.warn(
        `[webhook/stripe] account.updated INCOMPLETE id=${eventId} account=${accountId ?? 'null'} ` +
        `charges_enabled=${String(dataObject?.charges_enabled)} — recorded, not acted on`,
      )
      await markHandled(eventId, 'incomplete_payload')
      return NextResponse.json({ received: true })
    }

    const { data: rows, error: updErr } = await supabase
      .from('operators')
      .update({ stripe_charges_enabled: chargesEnabled, stripe_account_synced_at: new Date().toISOString() })
      .eq('stripe_account_id', accountId)
      .select('id')

    if (updErr) {
      // 🔴 500 so Stripe RETRIES. This is the one handler whose failure silently degrades a money gate,
      // so a lost event is worse than a duplicate delivery — and the update is idempotent, so a retry
      // costs nothing.
      console.error(
        `[webhook/stripe] account.updated PERSIST FAILED id=${eventId} account=${accountId} — returning ` +
        `500 so Stripe retries:`, updErr.message,
      )
      return NextResponse.json({ error: 'persist failed' }, { status: 500 })
    }

    if (!rows?.length) {
      // Not an error: an account can exist at Stripe with no operator row pointing at it — a create that
      // failed to persist (the route logs that case loudly), or an account made in the Dashboard by hand.
      console.warn(`[webhook/stripe] account.updated NO OPERATOR for account=${accountId} — recorded, not acted on`)
      await markHandled(eventId, 'no_operator')
      return NextResponse.json({ received: true })
    }

    console.log(
      `[webhook/stripe] account.updated APPLIED account=${accountId} operator=${rows[0].id} ` +
      `charges_enabled=${chargesEnabled}`,
    )
    await markHandled(eventId, `charges_enabled:${chargesEnabled}`)
    return NextResponse.json({ received: true })
  }

  // ── 🔴 payment_intent.succeeded — THE ONLINE CARD PAYMENT LANDS IN THE LEDGER HERE ───────────────
  // This is the ONLY place an online payment becomes true. The customer's browser returning from
  // Stripe is not evidence — they can close the tab, lose signal, or never come back — so the money is
  // recorded from the event and nowhere else.
  //
  // 🔴 IT WRITES order_payments, NOT orders.payment_status. That is the whole reason a fee-free first
  // version is safe: `recordOnlineCardPayment` writes `channel: 'online'` with the truck and the
  // timestamp, so the ledger IS the allowance history and a platform fee introduced later can be
  // computed over orders taken today. Setting payment_status directly and skipping the ledger would
  // take real money with no record of how it arrived — the one mistake that cannot be undone.
  // ⚠️ `orders.payment_status` and `amount_paid` still update — recordPaymentEvent calls
  // recalcOrderPayment, which rewrites them FROM the ledger. They stay derived caches, as designed.
  //
  // ⚠️ SCOPE: this arrives on the CONNECTED-ACCOUNT scope (`events_from: @accounts`), because a direct
  // charge belongs to the truck. The endpoint is already subscribed to it.
  // ── 🔴 payment_intent.amount_capturable_updated — THE AUTHORISATION LANDS HERE ────────────────────
  // ⚠️ A CORRECTION TO THE PHASE-2b BRIEF, STATED RATHER THAN QUIETLY IMPLEMENTED. The brief said
  // promotion should hang off `payment_intent.succeeded` "which now arrives with amount_received: 0".
  // It does not arrive at all. With `capture_method: 'manual'` an authorised-but-uncaptured intent has
  // status `requires_capture` and Stripe emits `payment_intent.amount_capturable_updated`;
  // `payment_intent.succeeded` fires only AFTER capture, which is a later phase. Hanging promotion on
  // `succeeded` alone would mean no card order was ever created.
  // 🔴 SO BOTH ARE HANDLED: this branch is the real trigger, and the `succeeded` branch below ALSO
  // promotes if a draft somehow reaches capture unpromoted. Doing what was asked, plus what works.
  //
  // 🔴 THE AMOUNT IS `amount_capturable`, NOT `amount_received`. Money is HELD, not taken — nothing has
  // moved, so nothing is written to the ledger here. The ledger stays exactly as it was: it records
  // captures, and this is not one.
  //
  // ⚠️ SUBSCRIPTION REQUIRED. The endpoint must be subscribed to
  // `payment_intent.amount_capturable_updated` on the CONNECTED-ACCOUNT scope (`events_from: @accounts`),
  // alongside the two types it already receives. Without that subscription this branch never runs and
  // every card order waits for its redirect — which works, but loses the guarantee that a customer who
  // closes the tab still gets their order.
  if (eventType === 'payment_intent.amount_capturable_updated') {
    if (livemode !== false) {
      console.warn(`[webhook/stripe] amount_capturable_updated IGNORED id=${eventId} livemode=${livemode} — sandbox only`)
      await markHandled(eventId, 'ignored:livemode')
      return NextResponse.json({ received: true })
    }
    const pi = (event as { data?: { object?: Record<string, unknown> } }).data?.object
    const piId = typeof pi?.id === 'string' ? pi.id : null
    const capturable = typeof pi?.amount_capturable === 'number' ? pi.amount_capturable : 0
    const metadata = (pi?.metadata ?? {}) as Record<string, unknown>
    const orderKey = typeof metadata.order_key === 'string' ? metadata.order_key : null

    // ⚠️ NOT OURS IS NORMAL. The same connected account can take payments that did not originate here.
    if (!orderKey || capturable <= 0) {
      console.log(
        `[webhook/stripe] amount_capturable_updated id=${eventId} pi=${piId} capturable=${capturable} ` +
        `order_key=${orderKey ?? 'none'} — not ours or nothing held, ignoring`,
      )
      await markHandled(eventId, 'not_ours')
      return NextResponse.json({ received: true })
    }

    // 🔴 OUT OF BAND. THE 2xx CONTRACT IS NOT NEGOTIABLE — see the header: nothing slow and nothing that
    // can throw runs between verification and the response. Promotion is both: it takes a lock, runs
    // four checks, inserts, rebuilds capacity and sends two emails. So it is STARTED and not awaited,
    // and the 2xx goes back immediately.
    // ⚠️ THE COST, STATED PLAINLY: on a serverless runtime an invocation may be frozen once the response
    // is returned, so this promotion is NOT guaranteed to finish. That is why it is not the only trigger.
    // The redirect route promotes too, and the cancellation sweep releases any hold that never became an
    // order — so a dropped continuation costs latency, never money.
    startPromotion(orderKey, 'webhook', eventId)
    console.log(`[webhook/stripe] AUTHORISED pi=${piId} order_key=${orderKey} capturable=${capturable} — promotion started`)
    return NextResponse.json({ received: true })
  }

  if (eventType === 'payment_intent.succeeded') {
    if (livemode !== false) {
      console.warn(
        `[webhook/stripe] payment_intent.succeeded IGNORED id=${eventId} livemode=${livemode} — this ` +
        `build records SANDBOX payments only, and a null livemode means the payload could not be classified`,
      )
      await markHandled(eventId, 'ignored:livemode')
      return NextResponse.json({ received: true })
    }

    const pi = (event as { data?: { object?: Record<string, unknown> } }).data?.object
    const piId = typeof pi?.id === 'string' ? pi.id : null
    // 🔴 THE AMOUNT IS STRIPE'S. `amount_received` is what the customer was actually charged; using our
    // own order total here would paper over a divergence the ledger exists to expose.
    const amountReceived = typeof pi?.amount_received === 'number' ? pi.amount_received : null
    const metadata = (pi?.metadata ?? {}) as Record<string, unknown>
    const orderKey = typeof metadata.order_key === 'string' ? metadata.order_key : null

    // ⚠️ NOT OURS IS NORMAL, NOT AN ERROR. The same connected account can take payments that did not
    // originate from HatchGrab — from their own Stripe Dashboard, or another integration. Those carry
    // no order_key and must be acknowledged and ignored, never guessed at.
    if (!orderKey) {
      console.log(`[webhook/stripe] payment_intent.succeeded id=${eventId} pi=${piId} — no order_key metadata, not ours`)
      await markHandled(eventId, 'not_ours')
      return NextResponse.json({ received: true })
    }
    // ── ⚠️ THE GUARD, AND WHAT CHANGED ────────────────────────────────────────────────────────────
    // IT USED TO READ:
    //     if (!piId || amountReceived === null || amountReceived <= 0) { … recorded, not acted on }
    // and that was right when every intent was an immediate charge. Under manual capture it is a trap:
    // an intent can reach this branch with `amount_received: 0` and still be an intent we own, so the
    // guard would silently drop it as an incomplete payload and no draft would ever be promoted.
    // 🔴 WHAT CHANGED: a zero amount no longer ends the branch — it skips the LEDGER WRITE and still
    // attempts promotion. The ledger's rule is untouched and deliberately so: it records money that has
    // MOVED, and nothing has moved until capture. Only `piId` is now genuinely required, because without
    // it there is nothing to key anything off.
    if (!piId) {
      console.warn(`[webhook/stripe] payment_intent.succeeded INCOMPLETE id=${eventId} — no intent id, not acted on`)
      await markHandled(eventId, 'incomplete_payload')
      return NextResponse.json({ received: true })
    }
    const moneyMoved = amountReceived !== null && amountReceived > 0

    // 🔴 THE ORDER ROW IS THE AUTHORITY FOR truck_id, not the metadata. Metadata is ours and therefore
    // trustworthy, but the ledger's truck_id drives per-truck money rollups — so it is read from the
    // row that owns it. This also proves the order still exists before writing money against it.
    const { data: order } = await supabase
      .from('orders')
      .select('order_key, truck_id')
      .eq('order_key', orderKey)
      .maybeSingle()

    if (!order?.truck_id) {
      // ── 🔴 "UNKNOWN ORDER" IS NO LONGER ALWAYS AN ALARM ──────────────────────────────────────────
      // Under authorize-then-capture the order legitimately does not exist yet: the draft has not been
      // promoted. That is an ordinary state, not a lost payment, and it must not fire the reconcile-by-
      // hand alert that this branch was written for. So promotion is started and the alarm is kept for
      // what it was always meant to catch: money that moved with nothing anywhere to attribute it to.
      const draft = await getOrderDraft(supabase, orderKey)
      if (draft) {
        startPromotion(orderKey, 'webhook', eventId)
        console.log(`[webhook/stripe] payment_intent.succeeded pi=${piId} order_key=${orderKey} — draft not yet promoted, promotion started`)
        await markHandled(eventId, 'promotion_started')
        return NextResponse.json({ received: true })
      }
      console.error(
        `[webhook/stripe] 🔴 payment_intent.succeeded FOR AN UNKNOWN ORDER AND NO DRAFT — pi=${piId} ` +
        `order_key=${orderKey} amount_received=${amountReceived}. The customer HAS been charged. Reconcile by hand.`,
      )
      await markHandled(eventId, 'unknown_order')
      return NextResponse.json({ received: true })
    }

    // ⚠️ NO MONEY MOVED => NO LEDGER ROW. An uncaptured intent that somehow reaches this branch has an
    // order already, so there is nothing to promote and nothing to record. The ledger records captures.
    if (!moneyMoved) {
      console.log(`[webhook/stripe] payment_intent.succeeded pi=${piId} order=${orderKey} amount_received=0 — order exists, nothing captured, no ledger row`)
      await markHandled(eventId, 'no_capture')
      return NextResponse.json({ received: true })
    }

    try {
      const { inserted, balance } = await recordOnlineCardPayment(supabase, {
        orderKey: order.order_key,
        truckId: order.truck_id,
        amountMinor: amountReceived,
        paymentIntentId: piId,
        livemode,
        currency: typeof pi?.currency === 'string' ? pi.currency.toUpperCase() : undefined,
      })
      console.log(
        `[webhook/stripe] online payment ${inserted ? 'RECORDED' : 'DUPLICATE (no-op)'} order=${orderKey} ` +
        `truck=${order.truck_id} pi=${piId} amount_minor=${amountReceived} → status=${balance.status} ` +
        `paid_minor=${balance.paidMinor}`,
      )
      await markHandled(eventId, `online_payment:${balance.status}`)
      return NextResponse.json({ received: true })
    } catch (ledgerErr) {
      // 🔴 500 SO STRIPE RETRIES. The money moved and we failed to record it — a lost event here is a
      // paid order showing unpaid on the hatch. The write is idempotent on the PaymentIntent id, so a
      // retry costs nothing.
      console.error(
        `[webhook/stripe] 🔴 LEDGER WRITE FAILED for order=${orderKey} pi=${piId} — returning 500 so ` +
        `Stripe retries:`, ledgerErr instanceof Error ? ledgerErr.message : ledgerErr,
      )
      return NextResponse.json({ error: 'ledger write failed' }, { status: 500 })
    }
  }

  // ── 🔴 charge.refunded / refund.updated — A REFUND MADE ANYWHERE REACHES THE LEDGER ──────────────
  // ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────
  // These are DIRECT charges on the truck's own Stripe account, and the truck has full Dashboard
  // access to it. They can refund a customer in two taps, today, without touching HatchGrab — and
  // until this branch existed our ledger never learned. Every surface kept saying PAID: the order card,
  // the KDS, the printed ticket and the takings figure. That is true whatever refund UI is built later,
  // which is why it is handled first.
  //
  // ── 🔴 THREE TYPES, ONE WRITER — AND THE SHAPE OF charge.refunded FORCED IT. MEASURED. ──────────
  // The obvious design was "handle charge.refunded, read the refunds out of the payload". IT DOES NOT
  // WORK, and this was found by issuing a real refund and reading the real event rather than by
  // reasoning: on this API version `charge.refunded`'s data.object carries
  //     id, payment_intent, amount_refunded: 650, refunded: true
  // and NO `refunds` KEY AT ALL — `'refunds' in charge` is false. There is nothing in that payload with
  // a refund id, so nothing that can key a row one-per-refund. `amount_refunded` is no substitute: it
  // is CUMULATIVE, so a second 200p refund on a charge already refunded 200p reports 400, and booking it
  // would double-count the first.
  //
  //   refund.created   -> carries the Refund itself — id, amount, status, payment_intent. The primary.
  //   refund.updated   -> the same object, and THE ONLY EVENT FOR A SETTLEMENT. A Connect refund can be
  //                    created `pending` when the connected account's balance is short; the later flip
  //                    to succeeded emits refund.updated and NOT another charge.refunded. Without this
  //                    type a pending refund would never be recorded at all.
  //   charge.refunded  ⚠️ KEPT AS THE SAFETY NET, and it has to ASK. It names the intent, so the refunds
  //                    are fetched with one refunds.list on the connected account. It earns its keep if
  //                    the refund.* types are ever unsubscribed, or one delivery is lost.
  // All three converge on `stripe_re:<refund id>`, so whichever arrives first with a settled refund
  // writes the row and every other delivery is a 23505 no-op. None of them knows about the others.
  if (eventType === 'charge.refunded' || eventType === 'refund.created' || eventType === 'refund.updated') {
    if (livemode !== false) {
      console.warn(`[webhook/stripe] ${eventType} IGNORED id=${eventId} livemode=${livemode} — sandbox only`)
      await markHandled(eventId, 'ignored:livemode')
      return NextResponse.json({ received: true })
    }

    const obj = (event as { data?: { object?: Record<string, unknown> } }).data?.object ?? {}
    let refunds: Record<string, unknown>[] = []

    if (eventType === 'refund.created' || eventType === 'refund.updated') {
      // THE OBJECT IS THE REFUND. No network call, no ambiguity, nothing to look up.
      refunds = [obj]
    } else {
      // ── ⚠️ THE ONE PLACE THIS ROUTE ASKS STRIPE A QUESTION, AND WHY IT IS ACCEPTABLE HERE ────────
      // The 2xx contract forbids anything SLOW or THROWING between verification and the response. This
      // is one GET, on a branch that fires only for a refund (rare), wrapped so it cannot throw, and its
      // failure mode is a 500 — which is not a broken contract but the DOCUMENTED one: "we failed to
      // PERSIST it. RETRY IS EXACTLY WHAT WE WANT." It is the same posture the ledger write below takes.
      // ⚠️ IT IS NOT MOVED UNDER after() LIKE PROMOTION. after() would forfeit the retry, and the retry
      // is the entire recovery mechanism for a refund we would otherwise lose. Promotion can be redriven
      // by the redirect and the sweep; a lost refund event has no second trigger.
      const piId = typeof obj.payment_intent === 'string' ? obj.payment_intent : null
      if (!piId || !connectedAccount) {
        console.warn(`[webhook/stripe] charge.refunded id=${eventId} — no payment_intent or no account, not acted on`)
        await markHandled(eventId, 'incomplete_payload')
        return NextResponse.json({ received: true })
      }
      try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
        const list = await stripe.refunds.list({ payment_intent: piId, limit: 100 }, { stripeAccount: connectedAccount })
        refunds = list.data as unknown as Record<string, unknown>[]
      } catch (listErr) {
        console.error(
          `[webhook/stripe] 🔴 could not list refunds for pi=${piId} on ${connectedAccount} — returning 500 ` +
          `so Stripe retries; a refund we cannot read is a refund the ledger never learns about:`,
          listErr instanceof Error ? listErr.message : listErr,
        )
        return NextResponse.json({ error: 'refund list failed' }, { status: 500 })
      }
    }

    let written = 0, pending = 0, skipped = 0
    for (const r of refunds) {
      const refundId = typeof r.id === 'string' ? r.id : null
      const amountMinor = typeof r.amount === 'number' ? r.amount : 0
      const status = typeof r.status === 'string' ? r.status : null
      const piId = typeof r.payment_intent === 'string' ? r.payment_intent
        : typeof obj.payment_intent === 'string' ? obj.payment_intent : null

      if (!refundId || amountMinor <= 0 || !piId) {
        console.warn(`[webhook/stripe] ${eventType} id=${eventId} — refund ${refundId ?? '?'} incomplete (amount=${amountMinor} pi=${piId ?? 'none'}), not acted on`)
        skipped++
        continue
      }

      // ── 🔴 THE CORRELATION. THE LEDGER IS THE INDEX. ────────────────────────────────────────────
      // Stripe tells us the PaymentIntent; our own capture row for that intent was written under
      // `stripe_pi:<intent id>` and carries the order_key and truck_id. So the charge we took IS the
      // lookup — a unique-index hit on order_payments_idempotency_key_uidx, no join, no scan.
      // ⚠️ AND IT IS WHY A CASH ORDER CAN NEVER MATCH. An in-person payment writes
      // `collect:<order_key>:<paid_before>:<balance>` and has no Stripe charge at all, so no
      // charge.refunded can ever name it and this lookup can never return it. See the report.
      // ⚠️ METADATA IS DELIBERATELY NOT USED. Our order_key rides on the PaymentIntent, not the Charge,
      // and a refund issued from the truck's Dashboard carries none of ours at all. The ledger row is
      // the only correlation that works for a refund we did not initiate — which is the whole case.
      const { data: chargeRow, error: lookupErr } = await supabase
        .from('order_payments')
        .select('order_key, truck_id, currency')
        .eq('idempotency_key', onlinePaymentIdempotencyKey(piId))
        .maybeSingle()

      if (lookupErr) {
        // 🔴 500 SO STRIPE RETRIES. We cannot tell whether this refund belongs to us, and guessing "not
        // ours" would lose a customer's refund silently.
        console.error(`[webhook/stripe] 🔴 refund correlation lookup FAILED for pi=${piId} — returning 500 so Stripe retries:`, lookupErr.message)
        return NextResponse.json({ error: 'refund lookup failed' }, { status: 500 })
      }
      if (!chargeRow) {
        // ⚠️ NOT OURS, AND THAT IS ORDINARY. The same connected account can take payments that did not
        // originate here — a walk-up on the truck's own terminal, a Stripe invoice, a Payment Link.
        console.log(`[webhook/stripe] ${eventType} refund=${refundId} pi=${piId} — no charge of ours under that intent, ignoring`)
        skipped++
        continue
      }

      // ── 🔴 PENDING WRITES NO LEDGER ROW. THE REASONING IS IN lib/payments/online.ts. ────────────
      // In short: getOrderBalance counts only `succeeded`, so a pending row would change no balance and
      // no surface, and recordPaymentEvent is insert-only so flipping it later would mean building an
      // UPDATE path for a row nothing reads. The audit log carries it instead — visible, and not
      // pretending to be money that has moved. `refund.updated` writes the real row when Stripe settles.
      if (status !== 'succeeded') {
        console.warn(
          `[webhook/stripe] refund=${refundId} on order_key=${chargeRow.order_key} is ${status ?? 'unknown'}, ` +
          `NOT succeeded — no ledger row yet. The order still reads paid, which is true: the money has ` +
          `not gone back. Waiting for refund.updated.`,
        )
        await logAction(supabase, {
          action: 'refund_pending', truckId: chargeRow.truck_id as string, orderKey: chargeRow.order_key as string,
          amountMinor,
          beforeState: { refund_id: refundId, payment_intent_id: piId, event_type: eventType },
          afterState: {
            stripe_status: status, recorded: false,
            meaning: 'Stripe has not settled this refund yet, so no money has gone back and no ledger row exists',
          },
          actor: { actorKind: 'unknown', actorId: null, actorLabel: null },
          source: 'web',
        })
        pending++
        continue
      }

      try {
        const { inserted, balance } = await recordOnlineCardRefund(supabase, {
          orderKey: chargeRow.order_key as string,
          truckId: chargeRow.truck_id as string,
          amountMinor,
          refundId,
          paymentIntentId: piId,
          livemode,
          currency: typeof r.currency === 'string' ? r.currency.toUpperCase() : undefined,
        })
        if (inserted) written++
        console.log(
          `[webhook/stripe] refund ${inserted ? 'RECORDED' : 'DUPLICATE (no-op)'} order=${chargeRow.order_key} ` +
          `refund=${refundId} amount_minor=${amountMinor} -> status=${balance.status} paid_minor=${balance.paidMinor}`,
        )
      } catch (ledgerErr) {
        // 🔴 500 SO STRIPE RETRIES, exactly as the payment branch does and for the mirror reason: a lost
        // event here is a REFUNDED order showing paid on the hatch. The write is idempotent on the
        // refund id, so a retry costs nothing and re-runs the ones already written as no-ops.
        console.error(
          `[webhook/stripe] 🔴 REFUND LEDGER WRITE FAILED for order=${chargeRow.order_key} refund=${refundId} — ` +
          `returning 500 so Stripe retries:`, ledgerErr instanceof Error ? ledgerErr.message : ledgerErr,
        )
        return NextResponse.json({ error: 'refund write failed' }, { status: 500 })
      }
    }

    await markHandled(eventId, `refund:written=${written},pending=${pending},skipped=${skipped}`)
    return NextResponse.json({ received: true })
  }

  // ── UNRECOGNISED EVENT TYPES ARE NORMAL, NOT ERRORS ──────────────────────────────────────────────
  // Every verified event is recorded and acknowledged, whatever its type. Handlers dispatch above on
  // `eventType`; this default arm stays exactly as it is: record, log, 200. Returning non-2xx for a type
  // we do not handle would make Stripe retry it for three days to no purpose, and eventually disable
  // the endpoint.
  return NextResponse.json({ received: true })
}

/**
 * Record that a handler ran, and what it decided.
 * ⚠️ BEST-EFFORT AND DELIBERATELY SO. This is a diagnostic, not the work — failing to mark an event
 * handled must never turn a successful update into a 500 that makes Stripe redeliver it.
 * ⚠️ `handled_at` / `handler_result` arrive with supabase/migrations/20260810_stripe_webhook_events_
 * account_updated.sql. Before that migration this write fails harmlessly and logs; the money-gate update
 * above has already committed either way.
 */
/**
 * 🔴 SCHEDULE PROMOTION FOR AFTER THE RESPONSE. THE 2xx CONTRACT IS WHY IT IS NOT AWAITED.
 *
 * The header's rule is absolute: nothing slow and nothing that can throw runs between verification and
 * the response, because a slow or throwing handler is what turns one delivery into several. Promotion is
 * both — it takes a per-event lock, runs four checks, inserts an order, rebuilds the capacity board and
 * sends two emails. Awaiting it here would put all of that inside Stripe's timeout.
 *
 * ── 🔴 IT WAS `void promoteDraft(...)`. THAT IS WHAT ORDER 25 PROVED DOES NOT SURVIVE. ─────────────
 * Vercel's runtime log for 21:22-21:25 on 12 August carries 24 RECEIVED lines, one DUPLICATE and one
 * 500, and NOT ONE `promotion(...) -> promoted` line — yet the order exists and `handled_at` was
 * written, which only happens in the `.then` below. The work ran and its logs surfaced under no
 * invocation: the container was suspended and resumed, because nothing had told the runtime the work
 * existed. `after()` tells it. See lib/runtime/after-response.
 * ⚠️ A THUNK, NOT A PROMISE, so promotion does not even BEGIN until the response is on the wire. With
 * `void` it started immediately and raced the response; there is no reason for it to.
 *
 * ⚠️ THE HONEST LIMITATION IS SMALLER BUT NOT GONE. `after()` is a declaration, not a guarantee, and the
 * two backstops still matter:
 *   - /api/payments/return promotes as well, and since the return_url now points at it, that path runs
 *     for every customer who comes back — awaited, ahead of this one, in the ordinary case;
 *   - the cancellation sweep releases any authorisation that never became an order.
 * And a redelivery re-runs the handler (see the duplicate branch) precisely because of this.
 */
function startPromotion(orderKey: string, trigger: 'webhook', eventId: string) {
  keepAlive(() => promoteDraft(supabase, orderKey, trigger)
    .then(async res => {
      console.log(`[webhook/stripe] promotion(${orderKey}) -> ${res.status}${'detail' in res ? ` (${res.detail})` : ''}${'reason' in res ? ` (${res.reason})` : ''}`)

      // ── 🔴 `already` IS NOW VERIFIED, NOT ASSUMED. ────────────────────────────────────────────
      // `already` means the claim was taken by someone else — the redirect, ordinarily, which is the
      // whole point of wiring it. It does NOT prove an order exists. The claim is taken BEFORE the
      // work, so a promoter killed between the claim and the insert leaves `promoted_at` set with no
      // order row, and this branch used to stand down on that and call it success.
      // ⚠️ ONE INDEXED READ, ON THE UNCOMMON PATH ONLY. A `promoted` result skips it entirely.
      if (res.status === 'already') {
        const { data: order } = await supabase
          .from('orders').select('order_key').eq('order_key', orderKey).maybeSingle()
        if (!order) {
          // 🔴 A CLAIMED DRAFT WITH NO ORDER. Either another promoter is still mid-flight (ordinary,
          // resolves in seconds) or one was killed holding the claim (money authorised against
          // nothing). This webhook cannot tell them apart and must not guess: re-promoting a draft
          // whose order is about to be inserted would hit the order_key primary key, and promoteDraft
          // treats an insert failure as a refusal AND CANCELS THE HOLD — on a real order.
          // So it is recorded, loudly and distinctly, and left for the operator tooling:
          //     node scripts/list-stranded-authorisations.cjs   -> shows it as CHECK BY HAND
          console.error(
            `[webhook/stripe] 🔴 promotion(${orderKey}) -> already, BUT NO ORDER ROW EXISTS. Either a ` +
            `promoter is still running or one died holding the claim. If this key has no order in a ` +
            `few minutes, money is authorised against nothing — reconcile by hand.`,
          )
          return markHandled(eventId, 'promotion:already_no_order')
        }
      }

      // Marked only once the work actually finished, which is what makes the duplicate branch above
      // able to tell "done" from "started and lost".
      return markHandled(eventId, `promotion:${res.status}`)
    })
    .catch(err => {
      console.error(`[webhook/stripe] 🔴 promotion(${orderKey}) threw — the event stays UNHANDLED so a redelivery retries it:`, err)
    }), `promotion:${orderKey}`)
}

async function markHandled(eventId: string | null, result: string) {
  if (!eventId) return
  const { error } = await supabase
    .from('stripe_webhook_events')
    .update({ handled: true, handled_at: new Date().toISOString(), handler_result: result })
    .eq('stripe_event_id', eventId)
  if (error) console.error(`[webhook/stripe] could not mark ${eventId} handled (${result}):`, error.message)
}
