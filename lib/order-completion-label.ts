// lib/order-completion-label.ts — the words on the button that completes an order, in ONE place.
//
// ── 🔴 WHY (19 September 2026) ──────────────────────────────────────────────────────────────────────
// `OrderCard` carries this branch TWICE — the live button and the disabled placeholder the cooking gate
// shows — and its own comment says so: "IT DUPLICATES completionBtn's BRANCH AND WILL DRIFT IF ONLY ONE IS
// CHANGED." The demo introduction now names that button ("Hit <label> on an order"), which would have made
// a THIRD copy, in a file nobody editing OrderCard would think to look at — and the wrong one was already
// on screen: the introduction said "Mark paid & done" while every demo renders "Mark paid & collected".
//
// ⚠️ THE CASH SPLIT IS DELIBERATELY NOT IN HERE. When `takes_cash` is on, the live button becomes a PAIR
// ("💷 Cash & collected" / "💳 Card & collected") and the disabled placeholder does not — the two sites
// genuinely differ there. Folding cash in would change what the placeholder renders, which is a behaviour
// change and not what this is for. Callers that care about cash decide it themselves, above this call.
import type { CompletionPresses } from '@/lib/payments/paid-step'

export function completionLabel(a: {
  /** getOrderBalance's verdict: paid or refunded in full. */
  paid: boolean
  /** A card authorisation is held: complete, do not collect — it books nothing. */
  heldAuthorisation: boolean
  /** The resolved setting for this event (resolvePaidStep), NOT the truck column. */
  completionPresses: CompletionPresses
  /** Some money is recorded but a balance remains. */
  partPaid: boolean
  /** The outstanding balance, already formatted (e.g. "£8.50"). Only read on the part-paid branch. */
  balanceLabel?: string
}): string {
  // 🔴 SAME BRANCH ORDER AS OrderCard's completionBtn: paid-ness FIRST, the setting second. Whether money
  // has been recorded is a fact about the ORDER; the setting is a preference of the truck, and it may not
  // overrule the fact. A settled order reads "Collected" whatever the truck is configured to do.
  if (a.paid || a.heldAuthorisation) return 'Collected'
  if (a.completionPresses === 'one') return 'Mark paid & collected'
  if (a.partPaid) return `Mark ${a.balanceLabel ?? ''} paid`.replace('  ', ' ')
  return 'Mark paid'
}
