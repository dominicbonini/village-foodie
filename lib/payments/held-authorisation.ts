// lib/payments/held-authorisation.ts
// 🔴 THE SINGLE SOURCE OF TRUTH FOR "THIS ORDER HAS MONEY HELD AGAINST IT".
//
// ── THE PROBLEM THIS ANSWERS ────────────────────────────────────────────────────────────────────
// Between authorisation and capture, an order is genuinely `payment_status: 'unpaid'` — no money has
// moved and no ledger row exists, and that is CORRECT. But four surfaces read that as "collect at the
// hatch": the card offered `Mark paid`, the KDS said `£6.00 due`, the ticket printed `TO PAY £6.00`,
// and the email said "Pay at the truck on collection". All four agreed and all four were wrong, which
// is a double-payment path. For an auto-accepted order the window is seconds; for a PENDING order
// awaiting operator approval it is minutes to hours — exactly when an operator is looking at the board.
//
// 🔴 THIS IS AN ADDITIONAL FACT DISPLAYED ALONGSIDE `payment_status`, NOT A REDEFINITION OF PAID.
// Nothing here touches getOrderBalance, the ledger, the CHECK constraint or the meaning of 'unpaid'.
// The order is unpaid. It ALSO has a card held. Both are true at once and the surfaces now say so.
//
// ── ONE FUNCTION, ONE PLACE ─────────────────────────────────────────────────────────────────────
// Every surface reads the SAME answer, computed once server-side and shipped as a list of order keys.
// No surface works it out for itself, because "held" is a two-table question (a draft row AND the
// absence of a ledger row) and four independent implementations of that would drift within a month.
//
// ── 🔴 THE DEPENDENCY THIS CREATES, AND WHY THE PURGE FUNCTION NOW CARRIES A WARNING ────────────
// The authorisation lives on the PROMOTED DRAFT: a draft's key becomes its order's key, so
// `order_drafts.payment_intent_id WHERE order_key = <the order's own key>` is a primary-key lookup with
// no migration and no Stripe call.
// 🔴 THAT ROW IS NOW LOAD-BEARING FOR DISPLAY. `purge_order_drafts()` has never swept promoted rows —
// its predicate is `promoted_at is null` — but nothing GUARANTEED that, and deleting a promoted draft
// would silently return every held order to reading "collect at the hatch". The guarantee is now
// written into the function itself: see supabase/migrations/20260814_purge_order_drafts_display_note.sql,
// which restates the predicate unchanged and adds the reason to its COMMENT.
// ⚠️ IF YOU EVER NEED TO SWEEP PROMOTED DRAFTS, the fact must move somewhere else FIRST — an `orders`
// column, or a ledger row of a new kind. Do not delete the answer and then look for it.
import type { SupabaseClient } from '@supabase/supabase-js'
import { onlinePaymentIdempotencyKey } from '@/lib/payments/online'

/**
 * Which of these orders have a live, uncaptured authorisation?
 *
 * 🔴 BATCHED — TWO QUERIES FOR THE WHOLE BOARD, NOT TWO PER ORDER. Both are `.in(...)` over the keys the
 * caller already has. A dashboard load that fetches sixty orders makes exactly two extra reads.
 *
 * ── THE PREDICATE, AND WHY EACH HALF IS REQUIRED ───────────────────────────────────────────────
 *   payment_intent_id IS NOT NULL        an authorisation was created at all
 *   promoted_at IS NOT NULL              the draft became this order (a draft that never promoted has
 *                                        no order to display against)
 *   authorization_cancelled_at IS NULL   the hold has not been released by the sweep or superseded
 *   AND no `stripe_pi:<id>` ledger row   🔴 NOT CAPTURED. Without this, every CAPTURED order would keep
 *                                        reading "held" forever — the draft row is unchanged by capture.
 *
 * ⚠️ THE CAPTURE CHECK IS AGAINST OUR OWN LEDGER, NOT STRIPE. Same key `captureOnConfirmation` writes
 * and the webhook writes, so the three agree by construction and no surface makes a network call.
 *
 * ⚠️ FAILS CLOSED — ON ANY ERROR IT RETURNS AN EMPTY SET. Every surface then shows exactly what it
 * showed before this existed. Being wrong in that direction costs an operator a second look at an order
 * that is already paid for; being wrong the other way would tell them not to collect money that really
 * is owed.
 */
export async function readHeldAuthorisations(
  supabase: SupabaseClient,
  orderKeys: string[],
): Promise<Set<string>> {
  const held = new Set<string>()
  if (!orderKeys.length) return held

  const { data: drafts, error } = await supabase
    .from('order_drafts')
    .select('order_key, payment_intent_id')
    .in('order_key', orderKeys)
    .not('payment_intent_id', 'is', null)
    .not('promoted_at', 'is', null)
    .is('authorization_cancelled_at', null)

  if (error) {
    console.error('[held-auth] could not read order_drafts — every surface falls back to today\'s display:', error.message)
    return held
  }
  if (!drafts?.length) return held

  // 🔴 EXCLUDE THE CAPTURED. One `.in()` over the idempotency keys those intents would have written.
  const byKey = new Map<string, string>()
  for (const d of drafts as { order_key: string; payment_intent_id: string }[]) {
    byKey.set(onlinePaymentIdempotencyKey(d.payment_intent_id), d.order_key)
  }
  const { data: captured, error: capErr } = await supabase
    .from('order_payments')
    .select('idempotency_key')
    .in('idempotency_key', [...byKey.keys()])

  if (capErr) {
    // ⚠️ CANNOT TELL HELD FROM CAPTURED ⇒ SAY NEITHER. Showing "card held" on an order that was in fact
    // captured would tell an operator not to collect from a customer who has already been charged —
    // harmless — but it would also contradict the PAID chip on the same card, which is worse than silence.
    console.error('[held-auth] could not read order_payments — treating every authorisation as unknown:', capErr.message)
    return held
  }
  const capturedKeys = new Set((captured ?? []).map(r => (r as { idempotency_key: string }).idempotency_key))

  for (const [idemKey, orderKey] of byKey) {
    if (!capturedKeys.has(idemKey)) held.add(orderKey)
  }
  return held
}

/**
 * The one-order form, for a caller that has no batch to work with — the confirmation email at promotion.
 * ⚠️ Prefer the batched reader anywhere a list exists; this exists so a single caller does not have to
 * build an array of one and unpack a Set.
 */
export async function hasHeldAuthorisation(
  supabase: SupabaseClient,
  orderKey: string,
): Promise<boolean> {
  return (await readHeldAuthorisations(supabase, [orderKey])).has(orderKey)
}
