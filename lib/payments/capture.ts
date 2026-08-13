// lib/payments/capture.ts
// 🔴 THE ONE PLACE A HELD AUTHORISATION BECOMES MONEY. CAPTURE FOLLOWS CONFIRMATION.
//
// ── THE RULE ────────────────────────────────────────────────────────────────────────────────────
// A confirmed order captures, whatever route it took to get there — auto-accepted at placement, an
// operator's Confirm, a quick-time-adjust, or an offline confirm replayed hours later. A rolled-forward
// slot still captures. Auto-accept FAILING leaves the order pending and UNCAPTURED, exactly like any
// other pending order, and it will capture when a human confirms it.
//
// ── 🔴 THERE ARE TWO AUTO-ACCEPTS, AND THAT COST ONE ORDER ITS CAPTURE ──────────────────────────
// A PAY-AT-HATCH order is auto-accepted inside place_order_atomic, at app/api/orders/submit. A CARD
// order never reaches that code: its request returns at submit/route.ts:820 with a client secret, and
// the order is created later by lib/payments/promote-draft, which decides auto-accept itself. The first
// build of this file hooked only the first of those, so every auto-accepted CARD order was confirmed and
// never captured — the state this file exists to prevent. `promote_auto_accept` is that second site.
// ⚠️ SO THE TRIGGER LIST IS NOT DECORATION. It is how "which confirmations capture" is answerable by
// grep and by one audit query, instead of by reading two routes and inferring.
//
// ── WHERE THE AUTHORISATION LIVES, AND WHY NO MIGRATION WAS NEEDED ──────────────────────────────
// The promoted draft keeps `payment_intent_id` under the ORDER'S OWN KEY — a draft's key becomes its
// order's key at promotion, and nothing deletes a promoted draft. So finding the intent for an order is
// a primary-key lookup on `order_drafts`, and
//     promoted_at IS NOT NULL AND authorization_cancelled_at IS NULL
// already means "authorised, not released". No column was added and no table was altered.
//
// ── 🔴 IDEMPOTENT ON THE INTENT ID, AT THREE LAYERS ────────────────────────────────────────────
//   1. A ledger pre-check on `stripe_pi:<id>` — a second call returns `already` WITHOUT touching Stripe.
//   2. Stripe itself refuses to capture twice; that refusal is recognised and treated as success.
//   3. `order_payments_idempotency_key_uidx` makes a duplicate insert a silent no-op (recordPaymentEvent
//      already treats 23505 that way).
// Two calls can therefore never double-capture and never write two ledger rows.
//
// ── ⚠️ THE WEBHOOK WILL ALSO SEE THIS ─────────────────────────────────────────────────────────────
// Capturing makes Stripe emit `payment_intent.succeeded`, which the existing webhook branch handles by
// calling recordOnlineCardPayment with the SAME key. That is deliberate and safe: whichever arrives
// second is a 23505 no-op. The webhook is NOT changed by this work and does not need to be — it becomes
// the backstop for a capture whose own ledger write failed.
//
// ── ⚠️ NO application_fee_amount ─────────────────────────────────────────────────────────────────
// The parameter is accepted at capture and is deliberately not sent. This build charges no platform
// fee, and a fee must be a positive integer, so "no fee" is absence. Search this file — there is none.
import type { SupabaseClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { recordOnlineCardPayment, onlinePaymentIdempotencyKey } from '@/lib/payments/online'
// 🔴 THE CHOKEPOINT FOR "WHAT DOES THIS ORDER OWE". Read-only. See step 2b.
import { readOrderBalance, type OrderBalance } from '@/lib/payments/ledger'
import { stripeAccountForTruck } from '@/lib/payments/authorize'
import { logAction } from '@/lib/audit/actionAudit'

/** ⚠️ The same refusal every other money path makes: this build may not move real money. */
function sandboxKey(): string {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  if (!key.startsWith('sk_test_')) {
    throw new Error('REFUSING: STRIPE_SECRET_KEY is not a sandbox key. This build may not capture real payments.')
  }
  return key
}

export type CaptureResult =
  /** Money moved. `amountMinor` is Stripe's own `amount_received`. */
  | { status: 'captured'; paymentIntentId: string; amountMinor: number }
  /** Already captured — by an earlier confirmation, or by a retry. Nothing was done. */
  | { status: 'already'; paymentIntentId: string }
  /** 🔴 NOTHING TO CAPTURE, AND NOT AN ERROR. Pay-at-hatch, a walk-up, or an order placed before
   *  authorize-then-capture existed. Costs one indexed read and no Stripe call. */
  | { status: 'none' }
  /** 🔴 THE HOLD IS GONE. Stripe expires an uncaptured intent after ~7 days, and the sweep cancels
   *  abandoned ones. The order is confirmed and the customer owes money at the hatch. */
  | { status: 'expired'; paymentIntentId: string; detail: string }
  /**
   * 🔴 A REFUSAL, NOT AN ERROR AND NOT A SUCCESS. THE ORDER DOES NOT OWE THIS MONEY.
   *
   * `settled`   the balance is already zero — somebody paid at the hatch, or a part-payment closed it.
   *             Capturing would charge the customer a second time. THIS IS THE 12 AUGUST FIX AND IT
   *             STANDS UNCHANGED.
   * `part_paid` 🔴 NO LONGER EMITTED. It used to mean "something is owed, but LESS than the hold is
   *             for", and it refused — which took nothing at all from a card that was covering the
   *             order, and left the truck with no money and a hold that expired in silence. That case
   *             now CAPTURES THE LOWER AMOUNT (step 2c below). The variant is kept so an older
   *             persisted result or an exhaustive switch elsewhere still type-checks; nothing in this
   *             file produces it.
   *
   * The hold is left EXACTLY as it was: live, uncaptured, uncancelled. Nothing here releases money and
   * nothing here takes it — the decision of what to do next belongs to a human.
   */
  | {
      status: 'not_owed'
      paymentIntentId: string
      reason: 'settled' | 'part_paid'
      /** From getOrderBalance. Minor units. */
      paidMinor: number
      balanceMinor: number
      /** What the hold is for, and therefore what a capture would take. */
      authorisedMinor: number
    }
  /** Capture was attempted and failed for a reason that is not "already" and not "expired". */
  | { status: 'failed'; paymentIntentId: string; detail: string }

/** Stripe's wording for an intent that cannot be captured because it already was. */
const ALREADY_CAPTURED = /already been captured|already captured|status of succeeded/i
/** …and for one that no longer exists to capture. `canceled` covers both expiry and our own sweep. */
const GONE = /canceled|cancelled|expired|status of requires_payment_method/i

/**
 * Capture the authorisation behind a confirmed order, if there is one.
 *
 * 🔴 IT CANNOT THROW. Every failure is a result value. Confirmation must never fail because money did
 * not move — an order that reaches the kitchen and is not captured is recoverable; an order that never
 * reaches the kitchen because a capture errored is a customer standing at a hatch with no food.
 *
 * @param trigger which confirmation site called this. Recorded, so "did the time-adjust capture?" is
 *                answerable from the audit log rather than by inference.
 *                ⚠️ `auto_accept` is the PAY-AT-HATCH auto-accept (place_order_atomic);
 *                `promote_auto_accept` is the CARD one (promote-draft). They are different code paths
 *                and are named apart so the audit log can tell them apart.
 *                ⚠️ `stranded_sweep` is not a confirmation at all — it is the backstop retrying a
 *                capture that should already have happened. See lib/payments/stranded-authorisations.
 */
export async function captureOnConfirmation(
  supabase: SupabaseClient,
  args: {
    orderKey: string
    truckId: string
    trigger: 'auto_accept' | 'promote_auto_accept' | 'confirm' | 'time_adjust' | 'stranded_sweep'
  },
): Promise<CaptureResult> {
  try {
    // ── 1. IS THERE AN AUTHORISATION AT ALL? ──────────────────────────────────────────────────
    // 🔴 THE CHEAP NO-OP FOR EVERY PAY-AT-HATCH AND WALK-UP ORDER: one primary-key read, and out.
    // No Stripe client is constructed, no network call is made, nothing is logged. The overwhelming
    // majority of confirmations end here and must cost almost nothing.
    // ⚠️ A NARROW SELECT, not `*` — this reads a table another module owns, and naming the four columns
    // keeps that dependency legible.
    const { data: draft, error: draftErr } = await supabase
      .from('order_drafts')
      // ⚠️ `total_minor` JOINED THE LIST for the balance guard at step 2b: it is the amount the hold is
      // for, and therefore the amount a capture would take.
      .select('order_key, truck_id, payment_intent_id, authorization_cancelled_at, total_minor')
      .eq('order_key', args.orderKey)
      .maybeSingle()

    if (draftErr) {
      // ⚠️ A READ FAILURE IS NOT "no authorisation". Saying `none` here would silently drop a real hold,
      // so it is reported as a failure with no intent id — findable, and never mistaken for success.
      console.error(
        `[capture] 🔴 could not read the draft for order_key=${args.orderKey} (${args.trigger}) — ` +
        `if this order HAD an authorisation it is NOT captured:`, draftErr.message,
      )
      return { status: 'failed', paymentIntentId: '', detail: `draft read failed: ${draftErr.message}` }
    }
    if (!draft?.payment_intent_id) return { status: 'none' }
    if (draft.authorization_cancelled_at) {
      // The sweep or a superseding basket already released this hold. There is nothing to capture and
      // nothing wrong — but it is worth a line, because a CONFIRMED order whose hold was released means
      // the customer owes money at the hatch.
      console.warn(
        `[capture] order_key=${args.orderKey} confirmed (${args.trigger}) but its authorisation was ` +
        `already cancelled at ${draft.authorization_cancelled_at} — nothing to capture; the customer ` +
        `has NOT paid.`,
      )
      return { status: 'expired', paymentIntentId: draft.payment_intent_id, detail: 'authorisation already cancelled' }
    }
    const piId = draft.payment_intent_id

    // ── 2a. HAS THIS INTENT ALREADY BEEN CAPTURED? Answered from OUR ledger, before touching Stripe. ─
    // 🔴 IDEMPOTENCY LAYER 1. A second confirmation of the same order — a time-adjust after a confirm,
    // an offline replay landing late — must not cost a Stripe round trip, let alone a second capture.
    // ⚠️ THIS IS A NARROW QUESTION AND IT IS NOT THE ONE THAT MATTERS MOST. It answers "did WE capture
    // THIS intent", nothing more. Step 2b is the one that asks what the order owes.
    const idempotencyKey = onlinePaymentIdempotencyKey(piId)
    const { data: existing } = await supabase
      .from('order_payments')
      .select('id')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()
    if (existing) return { status: 'already', paymentIntentId: piId }

    // ── 2b. 🔴 DOES THIS ORDER STILL OWE THE MONEY? THE GUARD THAT WAS MISSING. ─────────────────────
    // ── WHAT IT COST TO NOT ASK THIS ─────────────────────────────────────────────────────────────
    // Orders 18 and 19, 12 August 2026. An operator pressed Mark paid at 21:14:05 and 21:14:07, booking
    // `collect:<order_key>:0:600` and `…:0:650` in person. Seventy seconds later the stranded sweep
    // captured both held cards. Two customers were charged twice, and BOTH orders read `refund_due`
    // within a second — the ledger knew immediately, and nothing had asked it.
    // 🔴 THE OLD PRE-CHECK COULD NOT HAVE CAUGHT IT AT ANY PRICE. It tests
    // `idempotency_key = 'stripe_pi:' || <intent>`; an in-person row's key is `collect:<order_key>:…`.
    // Those strings can never be equal, so the check is not a filter that missed a case — it is a filter
    // that can only ever see one row, and every other payment in the ledger is outside its field of view.
    // 🔴 SO THE QUESTION CHANGED. Not "has this intent been captured" but "does this order owe money",
    // and this codebase already has exactly one answer to that: getOrderBalance, which its own header
    // calls "the CHOKEPOINT" and which every other paid-ness consumer goes through. readOrderBalance is
    // that call, read-only. Capture now goes through it too.
    // ⚠️ FIXED HERE, AT THE ONE FUNCTION ALL FOUR CAPTURE SITES CALL, rather than in the sweep that
    // happened to expose it. A guard in the sweep would have left confirm, time-adjust and promotion
    // blind, and the next report would have been about one of those.
    let balance: OrderBalance
    try {
      balance = await readOrderBalance(supabase, args.orderKey)
    } catch (err) {
      // 🔴 "I COULD NOT TELL" IS A REFUSAL, NEVER A ZERO. readOrderBalance throws on a missing order, a
      // failed read and a scope violation. Capturing on any of those would be moving money on a guess,
      // and the guess that costs a double charge is exactly the one being fixed. The sweep retries.
      const message = err instanceof Error ? err.message : String(err)
      console.error(
        `[capture] 🔴 COULD NOT ESTABLISH THE BALANCE for order_key=${args.orderKey} (${args.trigger}) — ` +
        `REFUSING TO CAPTURE pi=${piId} rather than risk charging twice:`, message,
      )
      return { status: 'failed', paymentIntentId: piId, detail: `balance unavailable: ${message}` }
    }

    // What the hold is for, and therefore what capturing takes. The draft's own figure, which is the
    // amount authorised — not the order total, which an operator may have edited since.
    const authorisedMinor = typeof draft.total_minor === 'number' ? draft.total_minor : balance.balanceMinor

    if (balance.balanceMinor <= 0) {
      // 🔴 THE ORDERS 18-AND-19 CASE. Nothing is owed; somebody has already been paid.
      console.error(
        `[capture] 🔴 REFUSING TO CAPTURE order_key=${args.orderKey} (${args.trigger}): the order is ` +
        `ALREADY SETTLED — paid_minor=${balance.paidMinor}, balance=${balance.balanceMinor}, ` +
        `status=${balance.status}. Capturing pi=${piId} would charge this customer a second time. The ` +
        `hold is untouched and still needs releasing or claiming by hand.`,
      )
      await recordCaptureRefusal(supabase, args, piId, 'settled', balance, authorisedMinor)
      return {
        status: 'not_owed', paymentIntentId: piId, reason: 'settled',
        paidMinor: balance.paidMinor, balanceMinor: balance.balanceMinor, authorisedMinor,
      }
    }

    // ── 2c. 🔴 TAKE WHAT IS OWED, NEVER MORE THAN WAS AGREED. ──────────────────────────────────────
    // ── THE RULE ─────────────────────────────────────────────────────────────────────────────────
    // The authorisation is fixed at the amount the customer agreed to. An operator's edit NEVER
    // increases what comes off the card. So the amount captured is the SMALLER of the two numbers:
    //     order goes UP    balance > authorised   capture the whole hold; the remainder is owed at the hatch
    //     order goes DOWN  balance < authorised   capture the balance; Stripe releases the difference
    //     untouched        balance = authorised   capture the whole hold, exactly as before
    // 🔴 WHAT THIS REPLACES, AND WHY IT HAD TO GO. Until now the middle row REFUSED. It was written to
    // stop an overcharge, and it did — by taking nothing at all. A held order edited down was never
    // captured by anything: the sweep retried into the same refusal, the hold expired after about seven
    // days, and the truck was paid nothing for food it had served. Silent, and wrong in the direction
    // that costs the operator rather than the customer.
    // ⚠️ THE 12 AUGUST GUARD ABOVE IS UNTOUCHED. `balance <= 0` still refuses, so an order already paid
    // at the hatch still cannot be charged a second time. This step only ever LOWERS the amount taken.
    // ⚠️ THE ORDINARY CARD ORDER IS BYTE-IDENTICAL: nothing paid and no edit means balance == authorised,
    // so `captureMinor === authorisedMinor`, no `amount_to_capture` is sent, and the Stripe call below is
    // the same call it has always been.
    const captureMinor = Math.min(balance.balanceMinor, authorisedMinor)
    const isPartialCapture = captureMinor < authorisedMinor

    // ── 3. CAPTURE AT STRIPE. ─────────────────────────────────────────────────────────────────
    const account = await stripeAccountForTruck(supabase, draft.truck_id ?? args.truckId)
    if (!account) {
      console.error(
        `[capture] 🔴 NO STRIPE ACCOUNT for truck=${draft.truck_id ?? args.truckId} — cannot capture ` +
        `pi=${piId} on order_key=${args.orderKey}. The hold will expire unclaimed unless resolved by hand.`,
      )
      return { status: 'failed', paymentIntentId: piId, detail: 'no stripe account for the truck' }
    }

    let amountMinor: number
    try {
      const stripe = new Stripe(sandboxKey())
      // ⚠️ NO application_fee_amount. See the header — absence, never zero.
      // 🔴 `amount_to_capture` IS SENT ONLY WHEN IT LOWERS THE AMOUNT, so a full capture is the same
      // empty-params call it has always been and cannot change behaviour for an unedited order.
      // Stripe's own wording for the parameter, from the hold documentation: "This captures the total
      // authorized amount by default. To capture less or (for certain online card payments) more than
      // the initial amount, pass the amount_to_capture option. A PARTIAL CAPTURE AUTOMATICALLY RELEASES
      // THE REMAINING AMOUNT." Nothing here releases anything by hand — there is no second call.
      // ⚠️ AND IT IS ONE SHOT: "you can only perform one capture on an authorized payment for most
      // payments. If you partially capture a payment, you can't perform another capture for the
      // difference." So the number below is the last word on this hold, which is why it is the minimum
      // of the two and never a guess.
      const captured = await stripe.paymentIntents.capture(
        piId,
        isPartialCapture ? { amount_to_capture: captureMinor } : {},
        { stripeAccount: account },
      )
      amountMinor = typeof captured.amount_received === 'number' ? captured.amount_received : 0
      if (amountMinor <= 0) {
        // Captured with nothing received is not a state this design produces, and writing a zero-amount
        // ledger row would fail the CHECK anyway. Reported rather than papered over.
        return { status: 'failed', paymentIntentId: piId, detail: `capture returned amount_received=${captured.amount_received}` }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // 🔴 IDEMPOTENCY LAYER 2. Stripe refusing a second capture IS the correct outcome, not a failure.
      // Fall through to the ledger write, which is itself idempotent, so a first attempt that captured
      // and then failed to record still gets its row on the retry.
      if (ALREADY_CAPTURED.test(message)) {
        try {
          const stripe = new Stripe(sandboxKey())
          const pi = await stripe.paymentIntents.retrieve(piId, {}, { stripeAccount: account })
          amountMinor = typeof pi.amount_received === 'number' ? pi.amount_received : 0
          if (amountMinor <= 0) return { status: 'already', paymentIntentId: piId }
        } catch { return { status: 'already', paymentIntentId: piId } }
      } else if (GONE.test(message)) {
        // 🔴 THE EXPIRED / CANCELLED HOLD. Stripe keeps an uncaptured intent about seven days; a pending
        // order confirmed after that has nothing left to take. It MUST NOT look like a capture.
        console.error(
          `[capture] 🔴 AUTHORISATION GONE for order_key=${args.orderKey} pi=${piId} (${args.trigger}): ` +
          `${message}. The order IS confirmed and the customer has NOT paid — they owe ` +
          `money at the hatch. No ledger row was written.`,
        )
        await recordCaptureProblem(supabase, args, piId, 'expired', message)
        return { status: 'expired', paymentIntentId: piId, detail: message }
      } else {
        console.error(`[capture] 🔴 CAPTURE FAILED order_key=${args.orderKey} pi=${piId} (${args.trigger}): ${message}`)
        await recordCaptureProblem(supabase, args, piId, 'failed', message)
        return { status: 'failed', paymentIntentId: piId, detail: message }
      }
    }

    // ── 3b. 🔴 A PARTIAL CAPTURE IS A MONEY DECISION AND IS WRITTEN DOWN. ──────────────────────────
    // The ledger row records what was TAKEN. Only this record says what was HELD and therefore what was
    // released and never collected, which is the number somebody reconciling a till will want:
    //     select * from action_audit_log where action = 'capture_partial' order by created_at desc;
    // ⚠️ Best-effort, like every other audit write on this path — logAction swallows its own errors,
    // because a logging failure must not become a second failure in a function that may not throw.
    if (isPartialCapture) {
      console.warn(
        `[capture] PARTIAL CAPTURE order_key=${args.orderKey} (${args.trigger}): the hold is for ` +
        `${authorisedMinor} and the order owes ${balance.balanceMinor}, so ${amountMinor} was taken from ` +
        `pi=${piId} and Stripe released the remaining ${authorisedMinor - amountMinor}. That difference is ` +
        `NOT recoverable from this hold — a capture cannot be repeated for the difference.`,
      )
      await recordPartialCapture(supabase, args, piId, balance, authorisedMinor, amountMinor)
    }

    // ── 4. THE LEDGER ROW. Same writer the webhook uses, so the row is identical in shape. ───────
    // 🔴 IDEMPOTENCY LAYER 3 — recordPaymentEvent treats a 23505 on the idempotency key as a successful
    // no-op, so even a race with the webhook's `payment_intent.succeeded` can only produce one row.
    try {
      const { inserted, balance } = await recordOnlineCardPayment(supabase, {
        orderKey: args.orderKey,
        truckId: draft.truck_id ?? args.truckId,
        amountMinor,
        paymentIntentId: piId,
        // ⚠️ FROM OUR OWN KEY'S MODE, because a capture is not an event and carries no `livemode` of its
        // own to copy. `sandboxKey()` has already refused anything but sk_test_, so this is false by
        // construction today; it is written this way so that going live changes it without an edit here.
        livemode: !process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_'),
      })
      console.log(
        `[capture] ${inserted ? 'CAPTURED' : 'captured (ledger row already present)'} order_key=${args.orderKey} ` +
        `pi=${piId} amount_minor=${amountMinor} trigger=${args.trigger} -> status=${balance.status}`,
      )
    } catch (ledgerErr) {
      // 🔴 THE MONEY MOVED AND WE FAILED TO RECORD IT. The order is confirmed and the customer HAS paid,
      // but the board will read unpaid. Loud, and recoverable: the webhook's payment_intent.succeeded
      // for this same capture writes the identical row under the identical key.
      const message = ledgerErr instanceof Error ? ledgerErr.message : String(ledgerErr)
      console.error(
        `[capture] 🔴 CAPTURED BUT NOT RECORDED order_key=${args.orderKey} pi=${piId} ` +
        `amount_minor=${amountMinor}: ${message}. THE CUSTOMER HAS PAID. The webhook's ` +
        `payment_intent.succeeded should write the same row; verify before taking money again.`,
      )
      await recordCaptureProblem(supabase, args, piId, 'ledger_failed', message)
      return { status: 'failed', paymentIntentId: piId, detail: `captured but not recorded: ${message}` }
    }

    return { status: 'captured', paymentIntentId: piId, amountMinor }
  } catch (err) {
    // 🔴 THE OUTER NET. Nothing above may reach a caller as an exception, because every caller is a
    // confirmation and confirmation must not fail over money.
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[capture] 🔴 UNEXPECTED for order_key=${args.orderKey} (${args.trigger}): ${message}`)
    return { status: 'failed', paymentIntentId: '', detail: message }
  }
}

/**
 * 🔴 MAKE A FAILED CAPTURE FINDABLE. The console line is for the person watching; this is the durable
 * record for the person looking six weeks later.
 *
 * `action_audit_log` is the codebase's existing append-only record for money actions, and it is used
 * rather than a new column because the brief forbids touching the draft table and no migration is
 * wanted. One query answers "which confirmed orders failed to capture":
 *     select * from action_audit_log where action = 'capture_failed' order by created_at desc;
 *
 * ⚠️ BEST-EFFORT — logAction already swallows its own errors. A failure to log must not become a second
 * failure on a path whose whole point is not to break confirmation.
 * ⚠️ actor is 'unknown'/'web': capture is a SYSTEM action with no human behind it — auto-accept has no
 * operator at all — and inventing one would put a false name on a money record.
 */
/**
 * 🔴 MAKE A NEAR-MISS VISIBLE. A refusal that leaves no trace is indistinguishable from never having
 * run, and this one means an operator has taken money at the hatch for an order that still has a live
 * hold against it — a state somebody has to resolve, and nothing else will notice.
 *
 * A DISTINCT ACTION FROM `capture_failed`, deliberately. Nothing failed. One query separates
 * "capture is broken" from "capture correctly declined":
 *     select * from action_audit_log where action = 'capture_not_owed' order by created_at desc;
 *
 * ⚠️ Best-effort, like every other audit write on this path — logAction swallows its own errors, because
 * a logging failure must not become a second failure in a function whose whole contract is not to throw.
 */
async function recordCaptureRefusal(
  supabase: SupabaseClient,
  args: { orderKey: string; truckId: string; trigger: string },
  paymentIntentId: string,
  reason: 'settled' | 'part_paid',
  balance: OrderBalance,
  authorisedMinor: number,
): Promise<void> {
  await logAction(supabase, {
    action: 'capture_not_owed',
    truckId: args.truckId,
    orderKey: args.orderKey,
    amountMinor: authorisedMinor,
    beforeState: { payment_intent_id: paymentIntentId, trigger: args.trigger, authorised_minor: authorisedMinor },
    afterState: {
      reason,
      captured: false,
      paid_minor: balance.paidMinor,
      balance_minor: balance.balanceMinor,
      payment_status: balance.status,
      meaning: reason === 'settled'
        ? 'this order was already paid by other means; capturing would have charged the customer twice'
        : 'this order is part paid; capturing the whole hold would have overcharged',
      hold: 'left live and uncaptured — release or claim it by hand',
    },
    actor: { actorKind: 'unknown', actorId: null, actorLabel: null },
    source: 'web',
  })
}

/**
 * 🔴 RECORD THAT LESS WAS TAKEN THAN WAS HELD, AND HOW MUCH WENT BACK.
 *
 * A DISTINCT ACTION FROM `capture_not_owed`, deliberately: nothing was refused and nothing is
 * outstanding. This is a completed capture at a lowered amount, and the fact worth keeping is the
 * DIFFERENCE — money the customer authorised, the truck did not take, and cannot take later.
 *
 * ⚠️ `amountMinor` IS STRIPE'S OWN `amount_received`, not the figure we asked for. If the two ever
 * disagree the record shows both, because the ledger only ever sees the one Stripe returned.
 */
async function recordPartialCapture(
  supabase: SupabaseClient,
  args: { orderKey: string; truckId: string; trigger: string },
  paymentIntentId: string,
  balance: OrderBalance,
  authorisedMinor: number,
  amountMinor: number,
): Promise<void> {
  await logAction(supabase, {
    action: 'capture_partial',
    truckId: args.truckId,
    orderKey: args.orderKey,
    amountMinor,
    beforeState: { payment_intent_id: paymentIntentId, trigger: args.trigger, authorised_minor: authorisedMinor },
    afterState: {
      captured: true,
      captured_minor: amountMinor,
      requested_minor: balance.balanceMinor,
      released_minor: authorisedMinor - amountMinor,
      paid_minor_before: balance.paidMinor,
      meaning: 'the order owed less than the hold was for, so only the lower amount was taken and Stripe released the rest',
    },
    actor: { actorKind: 'unknown', actorId: null, actorLabel: null },
    source: 'web',
  })
}

async function recordCaptureProblem(
  supabase: SupabaseClient,
  args: { orderKey: string; truckId: string; trigger: string },
  paymentIntentId: string,
  kind: 'expired' | 'failed' | 'ledger_failed',
  detail: string,
): Promise<void> {
  await logAction(supabase, {
    action: 'capture_failed',
    truckId: args.truckId,
    orderKey: args.orderKey,
    beforeState: { payment_intent_id: paymentIntentId, trigger: args.trigger },
    afterState: { kind, detail: detail.slice(0, 500), captured: false },
    actor: { actorKind: 'unknown', actorId: null, actorLabel: null },
    source: 'web',
  })
}
