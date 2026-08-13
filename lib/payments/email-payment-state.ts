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
//   'held_short' authorised, not captured, AND THE HOLD NO LONGER COVERS THE ORDER. An operator edited it
//               upward after the customer agreed a smaller amount. Part of it IS owed at the hatch.
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
// The chokepoint for "what does this order still owe". Read-only. See resolveEmailPaymentState.
import { readOrderBalance } from '@/lib/payments/ledger'
import type { CaptureResult } from '@/lib/payments/capture'

export type EmailPaymentState = 'captured' | 'part_paid' | 'held' | 'held_short' | 'hatch' | 'unknown'

/**
 * 🔴 THE STATE, PLUS THE TWO OR THREE NUMBERS THE SENTENCE NEEDS.
 *
 * Every figure here is optional because every one of them can fail to be readable, and a missing number
 * costs a vaguer sentence rather than a wrong one -- lib/email's paymentNote renders every state with and
 * without its figures.
 */
export interface EmailPaymentFacts {
  state: EmailPaymentState
  /** From getOrderBalance. Minor units. */
  paidMinor?: number
  balanceMinor?: number
  /** 🔴 WHAT THE AUTHORISATION IS FOR -- order_drafts.total_minor, frozen at the moment the customer
   *  agreed to it and never revised. It is NOT the order total: an edit moves one and not the other, and
   *  the gap between them is the whole of 'held_short'. */
  heldMinor?: number
}

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
  return (await readEmailPaymentFacts(supabase, orderKey)).state
}

/**
 * The same read, keeping the authorised amount it had to fetch anyway.
 *
 * ⚠️ ONE EXTRA COLUMN ON A QUERY THAT ALREADY RAN. `total_minor` rides along on the draft select, so
 * knowing what the hold is for costs nothing and no caller pays for a state it does not use.
 */
export async function readEmailPaymentFacts(
  supabase: SupabaseClient,
  orderKey: string,
): Promise<EmailPaymentFacts> {
  try {
    const { data: draft, error: draftErr } = await supabase
      .from('order_drafts')
      // 🔴 `total_minor` IS THE AMOUNT AUTHORISED. order-drafts.ts writes it once and never updates it --
      // the five updates that table takes are the intent id, promoted_at, the PII erase, the promotion
      // failure and the cancellation stamp, and not one of them touches this column. That is what makes
      // it a trustworthy record of what the customer actually agreed to pay.
      .select('payment_intent_id, promoted_at, authorization_cancelled_at, total_minor')
      .eq('order_key', orderKey)
      .maybeSingle()

    if (draftErr) {
      // 🔴 NOT 'hatch'. A read failure is not evidence that nobody paid, and turning it into one is
      // exactly how a charged customer gets asked for money at the window.
      console.error(`[email-payment-state] could not read the draft for order_key=${orderKey}:`, draftErr.message)
      return { state: 'unknown' }
    }

    // No draft, or a draft that never had an authorisation: this is a pay-at-hatch or walk-up order.
    if (!draft?.payment_intent_id) return { state: 'hatch' }

    const heldMinor = typeof draft.total_minor === 'number' ? draft.total_minor : undefined

    const { data: ledgerRow, error: ledgerErr } = await supabase
      .from('order_payments')
      .select('id')
      .eq('idempotency_key', onlinePaymentIdempotencyKey(draft.payment_intent_id))
      .maybeSingle()

    if (ledgerErr) {
      console.error(`[email-payment-state] could not read the ledger for order_key=${orderKey}:`, ledgerErr.message)
      return { state: 'unknown' }
    }

    // 🔴 THE LEDGER IS THE AUTHORITY ON MONEY, HERE AS EVERYWHERE. Same key captureOnConfirmation and
    // the webhook both write, so all three agree by construction and no email makes a Stripe call.
    if (ledgerRow) return { state: 'captured', heldMinor }

    // Authorised and then RELEASED without being taken — the sweep, a refused promotion, or an expiry
    // that has been recorded. No money moved and the hold is gone, so the customer genuinely owes.
    if (draft.authorization_cancelled_at) return { state: 'hatch' }

    // ⚠️ A CARD ORDER ONLY EXISTS BECAUSE ITS DRAFT WAS PROMOTED, so promoted_at cannot be null for any
    // order an email is being sent about. If it somehow is, this row does not describe a state this
    // design produces and it must not be reported as a fact either way.
    if (!draft.promoted_at) {
      console.error(`[email-payment-state] order_key=${orderKey} has an intent but no promoted_at — not describable`)
      return { state: 'unknown' }
    }

    // Authorised, nothing taken yet. Whether the hold still covers the order is decided in
    // resolveEmailPayment, which is the only place that reads the balance.
    return { state: 'held', heldMinor }
  } catch (err) {
    console.error(`[email-payment-state] unexpected for order_key=${orderKey}:`, err instanceof Error ? err.message : err)
    return { state: 'unknown' }
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
  return (await resolveEmailPayment(supabase, orderKey, capture)).state
}

/**
 * The same resolution, returning the figures the sentence can use.
 *
 * ⚠️ NO EXTRA READS. It is the identical work resolveEmailPaymentState already did; the only difference
 * is that the numbers it computed on the way are handed back instead of discarded. A caller that wanted
 * them previously had to call readOrderBalance again -- which the edit handler was doing, for the same
 * two rows, a dozen lines later.
 */
export async function resolveEmailPayment(
  supabase: SupabaseClient,
  orderKey: string,
  capture?: CaptureResult,
): Promise<EmailPaymentFacts> {
  const fromCapture = capture ? emailPaymentStateFromCapture(capture) : null
  const facts: EmailPaymentFacts = fromCapture
    ? { state: fromCapture }
    : await readEmailPaymentFacts(supabase, orderKey)
  const state = facts.state

  // ── 🔴 A HOLD IS FIXED AND AN ORDER IS NOT. WHEN THEY DIVERGE, SAY SO. ─────────────────────────
  // An order authorised at 650 and then edited up to 1300 has a card covering HALF of it, and every
  // email said "Your card is held, not charged -- nothing to pay at the truck". True about the card,
  // false about the order, and the customer reads it before they walk to the window.
  // 🔴 THE COMPARISON IS AGAINST THE HOLD, NOT AGAINST ZERO. 'part_paid' means money has MOVED and some
  // is still owed; this means NOTHING has moved and the instrument that is standing by is too small.
  // Different facts, different sentence -- see paymentNote in lib/email.
  // ⚠️ AN EDIT DOWNWARD IS STILL PLAIN 'held'. The hold is bigger than the order, capture takes the
  // lower amount (lib/payments/capture step 2c), and there is genuinely nothing to pay at the truck.
  if (state === 'held') {
    if (typeof facts.heldMinor !== 'number') {
      // A draft with no total_minor predates that column being populated. We cannot tell whether the
      // hold covers the order, so nothing is claimed and the answer is the one this state always gave.
      return facts
    }
    try {
      const balance = await readOrderBalance(supabase, orderKey)
      if (balance.balanceMinor > facts.heldMinor) {
        return { state: 'held_short', paidMinor: balance.paidMinor, balanceMinor: balance.balanceMinor, heldMinor: facts.heldMinor }
      }
      return { ...facts, paidMinor: balance.paidMinor, balanceMinor: balance.balanceMinor }
    } catch (err) {
      // 🔴 SAME REASONING AS THE 'captured' BRANCH BELOW. 'held' asserts "nothing to pay at the truck",
      // which is the other sentence that cannot be walked back once sent. A balance we could not read is
      // not evidence that the hold still covers the order.
      console.error(`[email-payment-state] could not confirm the hold covers order_key=${orderKey}:`, err instanceof Error ? err.message : err)
      return { state: 'unknown' }
    }
  }

  // ── 🔴 "CAPTURED" ANSWERS THE WRONG QUESTION WHEN THE ORDER HAS MOVED SINCE. ────────────────────
  // ── WHAT IT COST ─────────────────────────────────────────────────────────────────────────────
  // Order 59, 13 August. Paid 650p by card, then EDITED to add an item, taking the total to 1300p.
  // The "order updated" email said the new total and "Paid by card". Both sentences are true on
  // their own; together they tell a customer they have settled an order they still owe 650p on.
  // 🔴 EVERY CHECK ABOVE THIS LINE IS ABOUT THE INTENT, NOT THE ORDER. `readEmailPaymentState` asks
  // "is there a `stripe_pi:` row for this intent" and `emailPaymentStateFromCapture` asks "did the
  // capture succeed" — and BOTH are still yes after an edit doubles the total. Neither can see that the
  // order now wants more money than was ever taken. Live for order 59:
  //     readEmailPaymentState -> "captured"      readOrderBalance -> balanceMinor 650, status part_paid
  // ⚠️ SAME CLASS AS THE CAPTURE GUARD. That one asked "has this intent been captured?" when it needed
  // "does this order still owe money?", and it double-charged two customers. This is the email saying
  // the same wrong thing, in words, to the customer. getOrderBalance is the answer in both cases.
  //
  // ── WHY ONLY 'captured' AND 'held' ARE RE-EXAMINED ─────────────────────────────────────────────
  // They are the two states that ASSERT THERE IS NOTHING TO PAY AT THE WINDOW. 'hatch' already says
  // money is owed; 'unknown' already says do not pay again. Neither can be made wrong by an edit.
  // ⚠️ ONE EXTRA PAIR OF READS, ON THOSE TWO PATHS ONLY. Emails are rare; a wrong one is not.
  if (state !== 'captured') return facts
  try {
    const balance = await readOrderBalance(supabase, orderKey)
    const amounts = { paidMinor: balance.paidMinor, balanceMinor: balance.balanceMinor }
    if (balance.balanceMinor > 0) return { ...facts, ...amounts, state: 'part_paid' }
    return { ...facts, ...amounts, state: 'captured' }
  } catch (err) {
    // 🔴 NOT 'captured'. A read failure is not evidence the order is settled, and "Paid by card" is the
    // one sentence that cannot be walked back. 'unknown' says neither and asks them not to pay twice —
    // ⚠️ which is imperfect for a customer who genuinely owes the remainder, and is still the safer of
    // the two: they are told at the hatch rather than told they are done.
    console.error(`[email-payment-state] could not confirm the balance for order_key=${orderKey}:`, err instanceof Error ? err.message : err)
    return { state: 'unknown' }
  }
}
