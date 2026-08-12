// lib/payments/email-payment-state.ts
// 🔴 THE ONE ANSWER EVERY ORDER EMAIL ASKS: "WHAT DOES THIS CUSTOMER OWE, IF ANYTHING?"
//
// ── THE PROBLEM THIS CLOSES ─────────────────────────────────────────────────────────────────────
// `cardHeld` was passed at exactly ONE call site in the codebase. Every other order email — the
// operator confirm, the ready notification, the quick-time-adjust, the edit — fell through to the
// hardcoded sentence "Pay at the truck on collection", and sent it to customers whose card was held or
// already charged. Two of those sites CAPTURE THE MONEY IN THE SAME REQUEST that tells the customer to
// pay again.
//
// ── 🔴 ONE RESOLVER, NOT FOUR OPINIONS. THE SAME RULE THE OPERATOR SURFACES FOLLOW. ────────────────
// lib/payments/held-authorisation.ts exists because "is this order's money held" is a two-table
// question and four independent implementations of it would drift within a month. This is the same
// argument for the same question asked by email, and the answer is computed here and nowhere else.
//
// ── 🔴 FOUR STATES, BECAUSE THREE IS A LIE AND TWO WAS THE BUG ────────────────────────────────────
//   'captured'  money has moved. Nothing to pay.
//   'held'      authorised, not captured. Nothing to pay YET, and nothing to pay at the hatch either.
//   'hatch'     no authorisation, or one that was released without being taken. Money IS owed.
//   'unknown'   we could not tell. Neither reassure nor demand — see the fourth sentence in lib/email.
//
// ── ⚠️ WHY THIS FAILS OPEN WHERE THE DISPLAY FAILS CLOSED, AND THAT DIFFERENCE IS DELIBERATE ──────
// readHeldAuthorisations returns an EMPTY SET on any error, so an operator surface degrades to what it
// showed before the chip existed. That is right for a chip and WRONG for an email: "not held" collapses
// into "pay at the truck", which is a bill sent to someone who has already been charged, and an email
// cannot be corrected once sent. So every read failure here becomes 'unknown', which says neither.
// 🔴 THE 'held' PREDICATE BELOW IS THE SAME THREE CONDITIONS held-authorisation.ts USES, PLUS THE SAME
// LEDGER CHECK. If you change one, change both — they are two readings of one fact and are allowed to
// differ only in what they do when the database will not answer.
import type { SupabaseClient } from '@supabase/supabase-js'
import { onlinePaymentIdempotencyKey } from '@/lib/payments/online'
import type { CaptureResult } from '@/lib/payments/capture'

export type EmailPaymentState = 'captured' | 'held' | 'hatch' | 'unknown'

/**
 * What does this order's customer owe?
 *
 * ⚠️ TWO INDEXED READS AT MOST, AND USUALLY ONE. A pay-at-hatch order has no draft row, so it costs a
 * single primary-key miss and returns 'hatch' — the same answer, and the same rendered email, that
 * every order got before this function existed.
 */
export async function readEmailPaymentState(
  supabase: SupabaseClient,
  orderKey: string,
): Promise<EmailPaymentState> {
  try {
    const { data: draft, error: draftErr } = await supabase
      .from('order_drafts')
      .select('payment_intent_id, promoted_at, authorization_cancelled_at')
      .eq('order_key', orderKey)
      .maybeSingle()

    if (draftErr) {
      // 🔴 NOT 'hatch'. A read failure is not evidence that nobody paid, and turning it into one is
      // exactly how a charged customer gets asked for money at the window.
      console.error(`[email-payment-state] could not read the draft for order_key=${orderKey}:`, draftErr.message)
      return 'unknown'
    }

    // No draft, or a draft that never had an authorisation: this is a pay-at-hatch or walk-up order.
    if (!draft?.payment_intent_id) return 'hatch'

    const { data: ledgerRow, error: ledgerErr } = await supabase
      .from('order_payments')
      .select('id')
      .eq('idempotency_key', onlinePaymentIdempotencyKey(draft.payment_intent_id))
      .maybeSingle()

    if (ledgerErr) {
      console.error(`[email-payment-state] could not read the ledger for order_key=${orderKey}:`, ledgerErr.message)
      return 'unknown'
    }

    // 🔴 THE LEDGER IS THE AUTHORITY ON MONEY, HERE AS EVERYWHERE. Same key captureOnConfirmation and
    // the webhook both write, so all three agree by construction and no email makes a Stripe call.
    if (ledgerRow) return 'captured'

    // Authorised and then RELEASED without being taken — the sweep, a refused promotion, or an expiry
    // that has been recorded. No money moved and the hold is gone, so the customer genuinely owes.
    if (draft.authorization_cancelled_at) return 'hatch'

    // ⚠️ A CARD ORDER ONLY EXISTS BECAUSE ITS DRAFT WAS PROMOTED, so promoted_at cannot be null for any
    // order an email is being sent about. If it somehow is, this row does not describe a state this
    // design produces and it must not be reported as a fact either way.
    if (!draft.promoted_at) {
      console.error(`[email-payment-state] order_key=${orderKey} has an intent but no promoted_at — not describable`)
      return 'unknown'
    }

    return 'held'
  } catch (err) {
    console.error(`[email-payment-state] unexpected for order_key=${orderKey}:`, err instanceof Error ? err.message : err)
    return 'unknown'
  }
}

/**
 * 🔴 THE ANSWER THE CALLER ALREADY HAS IN ITS HAND.
 *
 * The confirm and time-adjust branches both call captureOnConfirmation and then compose an email
 * moments later. Until now they discarded its return value and re-derived nothing — the confirm branch
 * threw away the exact fact its email needed, twenty-six lines above where it needed it.
 *
 * ── WHY THIS BEATS RE-READING THE DATABASE ─────────────────────────────────────────────────────
 * It is not just cheaper. It is MORE ACCURATE, in the one case that matters: a capture that came back
 * `expired` means Stripe refused because the hold is gone, and the draft row does not know that yet —
 * `authorization_cancelled_at` is set later, by the stranded sweep, or never. A database read at that
 * moment says 'held', and the customer would be told their card is covering an order it is not.
 *
 * @returns the state, or null when this result is not decisive and the database should be read.
 */
export function emailPaymentStateFromCapture(result: CaptureResult): EmailPaymentState | null {
  switch (result.status) {
    // Money moved: in this request, or in an earlier one whose ledger row we found.
    case 'captured':
    case 'already':
      return 'captured'

    // 🔴 THE HOLD IS GONE AND NOTHING WAS TAKEN. The order is confirmed and the customer OWES. This is
    // the one outcome where "Pay at the truck on collection" is the correct sentence for a card order,
    // and the only way to know it is from this result.
    case 'expired':
      return 'hatch'

    // 🔴 WE DO NOT KNOW. `failed` covers a draft read that errored, a missing Stripe account, a network
    // failure mid-capture, and "captured but the ledger write failed" — which means the customer HAS
    // paid. Claiming either direction would be a guess, and one of the two guesses bills someone twice.
    case 'failed':
      return 'unknown'

    // Not decisive: there was no authorisation on this order at all, so the answer comes from the
    // database like any other order. In practice that read returns 'hatch'.
    case 'none':
      return null

    // 🔴 THE CAPTURE WAS REFUSED BECAUSE THE ORDER DOES NOT OWE THE MONEY — settled at the hatch, or
    // part paid. NOT DECISIVE FOR AN EMAIL, so it defers to the database like `none`.
    // ⚠️ THE ONE MAPPING THAT WOULD BE ACTIVELY HARMFUL IS 'hatch', which prints "Pay at the truck on
    // collection" — to somebody who has just paid at the truck. The deferred read answers 'held', which
    // is literally true: their card IS still held and there IS nothing to pay. It does not say "paid",
    // because the ledger, not this switch, decides that.
    // ⚠️ THIS CASE EXISTS BECAUSE THE SWITCH IS EXHAUSTIVE AND A NEW CaptureResult VARIANT WAS ADDED.
    // The email work is otherwise untouched; nothing else in it changed.
    case 'not_owed':
      return null
  }
}

/**
 * The single entry point every email site uses: prefer a capture result if one is in hand, otherwise ask.
 *
 * ⚠️ `capture` is optional because only two of the four sites have one. The ready notification and the
 * edit email happen long after any capture and must read.
 */
export async function resolveEmailPaymentState(
  supabase: SupabaseClient,
  orderKey: string,
  capture?: CaptureResult,
): Promise<EmailPaymentState> {
  if (capture) {
    const fromCapture = emailPaymentStateFromCapture(capture)
    if (fromCapture) return fromCapture
  }
  return readEmailPaymentState(supabase, orderKey)
}
