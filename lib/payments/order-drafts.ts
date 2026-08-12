// lib/payments/order-drafts.ts
// THE ONLY MODULE THAT TOUCHES `order_drafts`. No route may query the table directly.
//
// ── WHAT A DRAFT IS ─────────────────────────────────────────────────────────────────────────────
// A customer's order REQUEST, held between submit and a successful card authorisation. It is a wish,
// not a commitment: nothing reserves capacity until the money is authorised.
//
// 🔴 IT IS INVISIBLE TO STOCK AND CAPACITY BY CONSTRUCTION, NOT BY CONVENTION. It lives outside
// `orders`, and that is the whole reason it is a separate table:
//   lib/stock-availability.ts:35-42  getLiveItemCounts   .neq('status','cancelled').neq('status','rejected')
//   lib/option-stock.ts:68-75        getLiveOptionCounts  same two .neq filters
// Both are DENY-lists. A draft row inside `orders` would be counted as sold whatever status it carried.
// There is no status value that avoids that; only a different relation does. Do not "simplify" this
// module by moving drafts into `orders`.
//
// ── THE KEY ─────────────────────────────────────────────────────────────────────────────────────
// The draft mints `order_key` and the order later takes that same uuid as its primary key. That is what
// keeps every existing correlation working untouched: /api/stripe/checkout puts it in
// payment_intent_data.metadata.order_key, the webhook reads it back, and the ledger's idempotency key
// (`stripe_pi:{id}`) never involved the order key at all.
// The precedent is the offline walk-up path, which already supplies a client-minted order_key on INSERT
// (app/api/dashboard/action/route.ts:1174, :1219).
//
// ── SCOPE OF THIS PHASE ─────────────────────────────────────────────────────────────────────────
// ⚠️ NOTHING CALLS THIS MODULE YET. Phase 2a is the store and its accessors. The authorize call, the
// capture call, the promotion into `orders`, the sweeper and cancel-authorization are later phases, and
// deliberately absent — including any function that would create an order. This module reads and writes
// one table and does nothing else.
//
// 🔴 DEPLOY COUPLING. The selects below are NAMED, which is the house rule for a money-adjacent table
// (lib/payments/ledger.ts's LEDGER_ROW_COLUMNS) because it makes the read's dependencies legible. The
// cost is that the FIRST build which calls this module REQUIRES 20260812_order_drafts.sql to have been
// applied: PostgREST answers a named select on a missing relation with 42P01 and fails the whole
// statement. Nothing calls it today, so today it is inert — the coupling starts in phase 2b.

import type { SupabaseClient } from '@supabase/supabase-js'

/** Every column this module reads, in one place. See the deploy-coupling note in the header. */
export const DRAFT_ROW_COLUMNS = [
  'order_key',
  'truck_id', 'event_id', 'van_id', 'event_date', 'requested_slot', 'order_type', 'table_ref',
  'customer_name', 'customer_email', 'customer_phone',
  'items', 'deals', 'extras', 'bundle', 'notes', 'discount_code', 'asap_estimate', 'upsell_events',
  'subtotal', 'discount_amt', 'total', 'total_minor', 'currency',
  'created_at', 'expires_at', 'payment_intent_id', 'livemode', 'promoted_at',
].join(', ')

/** The request as the draft holds it. Money is SERVER-computed — see NewOrderDraft's note. */
export interface OrderDraftRow {
  order_key: string
  truck_id: string
  event_id: string | null
  van_id: string | null
  event_date: string | null
  requested_slot: string | null
  order_type: string
  table_ref: string | null
  /** 🔴 PII. Null on a promoted draft — erased in the claim. See claimOrderDraft. */
  customer_name: string | null
  customer_email: string | null
  customer_phone: string | null
  items: unknown
  deals: unknown
  extras: unknown
  bundle: unknown
  notes: string | null
  discount_code: string | null
  asap_estimate: string | null
  upsell_events: unknown
  subtotal: number
  discount_amt: number
  total: number
  /** Integer pence. THE AMOUNT AUTHORISED. */
  total_minor: number
  currency: string
  created_at: string
  expires_at: string
  payment_intent_id: string | null
  livemode: boolean | null
  promoted_at: string | null
}

/**
 * What a caller supplies to create a draft.
 *
 * 🔴 EVERY MONEY FIELD HERE IS SERVER-DERIVED AND MUST STAY SO. Server-side pricing removed every money
 * field from the request body; these come from lib/order-repricing's calculation, resolved from the
 * price book. If a future caller passes a figure that arrived from a browser, this whole design is
 * undone at its first line — the draft carries SELECTIONS, and the total the server computed from them.
 */
export interface NewOrderDraft {
  /** Mint with newOrderKey(). Becomes orders.order_key verbatim. */
  orderKey: string
  truckId: string
  eventId?: string | null
  vanId?: string | null
  eventDate?: string | null
  /** What the customer ASKED for. Re-resolved under the lock at promotion; null = ASAP. */
  requestedSlot?: string | null
  orderType?: string
  tableRef?: string | null
  customerName?: string | null
  customerEmail?: string | null
  customerPhone?: string | null
  items: unknown
  deals?: unknown
  extras?: unknown
  bundle?: unknown
  notes?: string | null
  discountCode?: string | null
  asapEstimate?: string | null
  upsellEvents?: unknown
  subtotal: number
  discountAmt: number
  total: number
  /** Integer pence, from toMinor(). The amount that will be authorised. */
  totalMinor: number
  currency?: string
}

/**
 * Mint the identity a draft and its future order share.
 *
 * ⚠️ `crypto.randomUUID()` — the Web Crypto API, available on the Node and edge runtimes alike, and the
 * same call lib/native/outbox.ts's newUuid() makes for the offline walk-up key. Deliberately NOT the
 * database default: `order_drafts.order_key` has none, because the caller needs this value in hand to
 * put in Stripe metadata, and a value it only learns after the insert is a value it can forget to use.
 */
export function newOrderKey(): string {
  return crypto.randomUUID()
}

/**
 * Create a draft, purging expired ones first.
 *
 * 🔴 THE PURGE IS NOT HOUSEKEEPING — IT IS THE ERASURE PATH. This table holds a customer's name, email
 * and phone. Deleting expired drafts here, on the write path, is what makes that PII leave without any
 * scheduled sweeper existing: on a truck taking orders, an abandoned draft's PII lifetime is bounded by
 * its expiry plus the gap to the next order.
 * ⚠️ EXACTLY THE booking_locks PRECEDENT — lib/stock-guard.ts:43-48 deletes stale locks immediately
 * before acquiring one, for the same reason: a TTL nobody enforces is not a TTL.
 * ⚠️ TRUCK-SCOPED, so one busy truck cannot make another truck's insert pay for a large sweep, and so
 * the delete uses order_drafts_truck rather than scanning. purge_order_drafts() in the migration is the
 * unscoped belt-and-braces for a truck that stopped trading mid-service.
 * ⚠️ FAIL-OPEN: a purge failure is logged and the draft is still created. Refusing to take an order
 * because we could not tidy up would be the wrong trade by a wide margin.
 */
export async function createOrderDraft(
  supabase: SupabaseClient,
  draft: NewOrderDraft,
): Promise<{ ok: true; row: OrderDraftRow } | { ok: false; error: string }> {
  const { error: purgeErr } = await supabase
    .from('order_drafts')
    .delete()
    .eq('truck_id', draft.truckId)
    .is('promoted_at', null)
    .lt('expires_at', new Date().toISOString())
  if (purgeErr) {
    console.error(
      `[order-drafts] expired-draft purge failed for truck=${draft.truckId} — the draft is still being ` +
      `created; abandoned drafts may hold customer details past their expiry until the next successful ` +
      `purge:`, purgeErr.message,
    )
  }

  const { data, error } = await supabase
    .from('order_drafts')
    .insert({
      order_key:      draft.orderKey,
      truck_id:       draft.truckId,
      event_id:       draft.eventId ?? null,
      van_id:         draft.vanId ?? null,
      event_date:     draft.eventDate ?? null,
      requested_slot: draft.requestedSlot ?? null,
      order_type:     draft.orderType ?? 'collection',
      table_ref:      draft.tableRef ?? null,
      customer_name:  draft.customerName ?? null,
      customer_email: draft.customerEmail ?? null,
      customer_phone: draft.customerPhone ?? null,
      items:          draft.items ?? [],
      deals:          draft.deals ?? null,
      extras:         draft.extras ?? null,
      bundle:         draft.bundle ?? null,
      notes:          draft.notes ?? null,
      discount_code:  draft.discountCode ?? null,
      asap_estimate:  draft.asapEstimate ?? null,
      upsell_events:  draft.upsellEvents ?? null,
      subtotal:       draft.subtotal,
      discount_amt:   draft.discountAmt,
      total:          draft.total,
      total_minor:    draft.totalMinor,
      currency:       draft.currency ?? 'GBP',
      // created_at, expires_at and promoted_at are the column defaults. expires_at deliberately is NOT
      // settable from here — see the migration header for why it lives in one place.
    })
    .select(DRAFT_ROW_COLUMNS)
    .single()

  if (error || !data) {
    console.error(`[order-drafts] create failed for order_key=${draft.orderKey} truck=${draft.truckId}:`, error?.message)
    return { ok: false, error: error?.message ?? 'draft not created' }
  }
  return { ok: true, row: data as unknown as OrderDraftRow }
}

/**
 * Read a draft by its key.
 * ⚠️ RETURNS AN EXPIRED OR ALREADY-PROMOTED DRAFT AS-IS. This is the plain read; the caller decides what
 * those states mean. Anything that intends to CREATE AN ORDER must go through claimOrderDraft instead —
 * a read followed by a decision is exactly the race the claim exists to close.
 */
export async function getOrderDraft(
  supabase: SupabaseClient,
  orderKey: string,
): Promise<OrderDraftRow | null> {
  const { data, error } = await supabase
    .from('order_drafts')
    .select(DRAFT_ROW_COLUMNS)
    .eq('order_key', orderKey)
    .maybeSingle()
  if (error) {
    console.error(`[order-drafts] read failed for order_key=${orderKey}:`, error.message)
    return null
  }
  return (data as unknown as OrderDraftRow) ?? null
}

/**
 * Find the draft an authorisation belongs to, by PaymentIntent id.
 *
 * ⚠️ THE FALLBACK PATH, NOT THE PRIMARY ONE. Correlation runs on metadata.order_key exactly as it does
 * today; this exists for the case where an event arrives without it. `order_drafts_payment_intent_uidx`
 * makes the answer unambiguous — one intent can belong to at most one draft.
 */
export async function getOrderDraftByPaymentIntent(
  supabase: SupabaseClient,
  paymentIntentId: string,
): Promise<OrderDraftRow | null> {
  const { data, error } = await supabase
    .from('order_drafts')
    .select(DRAFT_ROW_COLUMNS)
    .eq('payment_intent_id', paymentIntentId)
    .maybeSingle()
  if (error) {
    console.error(`[order-drafts] read-by-intent failed for pi=${paymentIntentId}:`, error.message)
    return null
  }
  return (data as unknown as OrderDraftRow) ?? null
}

/**
 * Record which PaymentIntent this draft's authorisation belongs to.
 *
 * ⚠️ `livemode` COMES FROM THE STRIPE OBJECT, never from a key prefix, an env var or NODE_ENV — the same
 * rule order_payments.livemode and stripe_webhook_events.livemode follow, for the same reason: a test
 * payment recorded as live is the defect the column exists to prevent.
 * ⚠️ GUARDED ON `promoted_at is null`. A promoted draft is finished; attaching an intent to it would be
 * a second payment against an order that already exists, and this must not be the write that records it.
 * Returns false when nothing matched, which the caller must treat as "not attached", never as success.
 */
export async function attachPaymentIntent(
  supabase: SupabaseClient,
  args: { orderKey: string; paymentIntentId: string; livemode: boolean },
): Promise<boolean> {
  const { data, error } = await supabase
    .from('order_drafts')
    .update({ payment_intent_id: args.paymentIntentId, livemode: args.livemode })
    .eq('order_key', args.orderKey)
    .is('promoted_at', null)
    .select('order_key')
  if (error) {
    console.error(
      `[order-drafts] could not attach pi=${args.paymentIntentId} to order_key=${args.orderKey}:`, error.message,
    )
    return false
  }
  return (data?.length ?? 0) > 0
}

/**
 * 🔴 CLAIM A DRAFT FOR PROMOTION. THE CONSTRAINT THAT MAKES DOUBLE-PROMOTION IMPOSSIBLE.
 *
 * Both the webhook and the redirect-back will try to create the order from one draft. Exactly one may
 * succeed, and the loser must LEARN it lost rather than error.
 *
 * ── HOW IT WORKS ────────────────────────────────────────────────────────────────────────────────
 * One statement: a conditional UPDATE guarded on `promoted_at is null`, RETURNING the row. Two
 * concurrent claims serialise on Postgres's row lock. The winner gets the row back — including the PII
 * it needs to build the order. The loser re-evaluates the guard after the winner commits, matches
 * nothing, and receives an EMPTY RESULT AND NO ERROR. That empty result IS the answer: someone else is
 * creating this order.
 *
 * 🔴 THE `.select()` IS LOAD-BEARING, NOT A CONVENIENCE. Claim-then-read would leave a window in which
 * the loser reads the row between the winner's claim and its INSERT, and both would proceed. The claim
 * and the read have to be the same statement.
 *
 * 🔴 AND IT ERASES THE PII IN THE SAME BREATH. The three customer columns are nulled by this UPDATE, so
 * from the instant a draft is claimed it holds no personal data — the ORDER holds it from then on,
 * under the order's own retention. The returned row still carries the values, because the caller needs
 * them to create that order; the stored row does not. There is no second write to forget.
 *
 * ⚠️ EXPIRY IS *NOT* PART OF THE GUARD, DELIBERATELY. A draft whose customer authorised at 29:58 and
 * whose webhook lands at 30:02 must still promote — refusing it would mean money held with no order,
 * which is the worst outcome this design has. Expiry governs the PURGE (an unauthorised draft nobody
 * paid for), not the claim. The purge only ever deletes rows with `promoted_at is null` AND no
 * authorisation behind them, and a draft in flight is racing a purge either way; the intent id on the
 * row is what a later phase would use to tell the two apart.
 *
 * @returns the claimed row (you won, create the order), or null (you lost, or it never existed)
 */
export async function claimOrderDraft(
  supabase: SupabaseClient,
  orderKey: string,
): Promise<OrderDraftRow | null> {
  const { data, error } = await supabase
    .from('order_drafts')
    .update({
      promoted_at: new Date().toISOString(),
      // 🔴 ERASURE, IN THE CLAIM. See above.
      customer_name: null,
      customer_email: null,
      customer_phone: null,
    })
    .eq('order_key', orderKey)
    .is('promoted_at', null)
    .select(DRAFT_ROW_COLUMNS)
    .maybeSingle()

  if (error) {
    // A real failure, not a lost race — a lost race returns zero rows with no error. The caller must
    // NOT treat this as "someone else has it": nobody may have.
    console.error(`[order-drafts] claim failed for order_key=${orderKey}:`, error.message)
    return null
  }
  if (!data) {
    // ⚠️ THE ORDINARY OUTCOME FOR THE LOSER, AND NOT AN ERROR. Logged at info because in a two-trigger
    // design one of these per paid order is expected, and an error line per payment would train
    // everyone to ignore the log.
    console.log(`[order-drafts] claim not taken for order_key=${orderKey} — already promoted, or no such draft`)
    return null
  }
  return data as unknown as OrderDraftRow
}
