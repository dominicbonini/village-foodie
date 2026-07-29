// ── THE PAYMENT LEDGER (V9.4, payments phase 1a) ─────────────────────────────────────────────────────
// `order_payments` is the CANONICAL record of money: one row per money event, integer minor units only.
// `orders.payment_status` and `orders.amount_paid` are DERIVED CACHES recomputed from it here.
//
// ── THE RULE ────────────────────────────────────────────────────────────────────────────────────────
// NOTHING may COMPUTE or MUTATE payment state outside this module. Every write of `payment_status` /
// `amount_paid` goes through recalcOrderPayment().
//   DELIBERATE EXCEPTION, ruled on and recorded so it is not re-litigated: the three order-CREATION sites
//   (app/api/dashboard/action/route.ts:~879 walk-up, app/api/orders/submit/route.ts:~902 customer,
//   lib/seed-demo-orders.ts:~323 demo seed) each insert the literal `payment_status: 'unpaid'`. That is
//   creation-time initialisation to the column's own default, not a derived-cache violation — no payment
//   state is computed or mutated. They are left alone: editing two LIVE insert paths for zero functional
//   change is unjustified risk. Do not "fix" them.
//
// ── ATOMICITY: TWO SEQUENTIAL WRITES, NOT A DB FUNCTION (ruled on 29 July) ──────────────────────────
// The ledger insert and the write-back to `orders` are two separate PostgREST calls. That is deliberate.
// The LEDGER is the truth; payment_status/amount_paid are caches. If the insert succeeds and the
// write-back fails, the truth is intact and only the cache is stale — repairable by re-running the
// recalc. A Postgres function would buy real atomicity at the cost of the `create or replace function`
// silent-failure hazard (§35) that took customer ordering down for ~15 minutes on 28 July — buying it to
// protect a cache rather than the source of truth. Wrong trade today. Revisit when Stripe webhooks land
// and concurrency genuinely matters.
// CONSEQUENCE: recalcOrderPayment() MUST be idempotent — it recomputes from the ledger every time and
// never accumulates, so re-running it on any order converges. Ledger insert first, recalc second. A
// failed recalc is surfaced loudly and does NOT roll back the ledger row.
//
// ── RECONCILIATION QUERY — run this to detect cache drift ───────────────────────────────────────────
// Lists any order whose cached payment state disagrees with its own ledger rows. Expect ZERO rows.
//
//   select o.order_key, o.id, o.truck_id, o.total_minor, o.payment_status, o.amount_paid,
//          coalesce(l.paid_minor, 0)                              as ledger_paid_minor,
//          round(coalesce(l.paid_minor, 0) / 100.0, 2)            as ledger_paid_pounds,
//          o.total_minor - coalesce(l.paid_minor, 0)              as balance_minor
//     from orders o
//     left join (
//       select order_key,
//              sum(case when kind = 'charge' then amount_minor else -amount_minor end) as paid_minor,
//              count(*) filter (where kind = 'refund')                                  as refund_rows
//         from order_payments
//        where state = 'succeeded'
//        group by order_key
//     ) l on l.order_key = o.order_key
//    where round(coalesce(l.paid_minor, 0) / 100.0, 2) is distinct from coalesce(o.amount_paid, 0)
//       or o.payment_status is distinct from case
//            when coalesce(l.paid_minor, 0) = 0 and coalesce(l.refund_rows, 0) > 0 then 'refunded'
//            when coalesce(l.paid_minor, 0) = 0                                    then 'unpaid'
//            when o.total_minor - coalesce(l.paid_minor, 0) < 0                     then 'refund_due'
//            when o.total_minor - coalesce(l.paid_minor, 0) = 0                     then 'paid'
//            else 'part_paid' end
//    order by o.created_at desc;
//
// `import type` (not a value import) is load-bearing: getOrderBalance is called from CLIENT components
// (OrderCard, AddOrderPanel) and a value import would pull the supabase client into the browser bundle.
// The server-only functions below are simply never called there.
import type { SupabaseClient } from '@supabase/supabase-js'
import { toMinor, fromMinor } from '@/lib/order-repricing'

export type PaymentKind = 'charge' | 'refund'
export type PaymentChannel = 'online' | 'in_person_stripe' | 'in_person_other'
export type PaymentEventState = 'pending' | 'succeeded' | 'failed'
export type PaymentStatus = 'unpaid' | 'paid' | 'part_paid' | 'refunded' | 'refund_due' | 'failed'

/** A row of `order_payments`. amount_minor is ALWAYS POSITIVE — `kind` carries the sign. */
export interface LedgerRow {
  kind: PaymentKind
  channel: PaymentChannel
  amount_minor: number
  state: PaymentEventState
  external_ref?: string | null
}

/** The full stored shape of a collect row, as read immediately before deletion. Every column is
 *  included deliberately: this is what gets written to action_audit_log.before_state, and the deletion
 *  must be fully reconstructable from the log alone. */
export interface DeletedCollectRow extends LedgerRow {
  id: string
  currency?: string | null
  note?: string | null
  idempotency_key?: string | null
  created_at?: string | null
  created_by?: string | null
}

/** The minimum an order must supply to be balanced. total_minor is authoritative; `total` is the
 *  fallback for rows written before 20260728_orders_total_minor_deal_savings.sql populated it. */
export interface BalanceableOrder {
  total_minor?: number | null
  total?: number | null
}

export interface OrderBalance {
  paidMinor: number
  balanceMinor: number
  status: PaymentStatus
}

/** The order's charge amount in pence. total_minor when present; otherwise derived from the pounds
 *  column — safe because every money column is numeric(8,2) and Postgres rounds at the insert boundary,
 *  so `total` never carries sub-penny error (0 of 346 rows exceed 2dp, live-verified 29 July). */
export function orderTotalMinor(order: BalanceableOrder): number {
  if (order.total_minor != null) return Math.round(order.total_minor)
  return toMinor(Number(order.total ?? 0))
}

/**
 * THE DERIVATION. Pure — no I/O — so the next pass's UI can call it with rows it already has.
 *   paid    = Σ succeeded charges − Σ succeeded refunds
 *   balance = total_minor − paid
 */
export function getOrderBalance(order: BalanceableOrder, ledgerRows: LedgerRow[]): OrderBalance {
  const succeeded = (ledgerRows ?? []).filter(r => r.state === 'succeeded')
  const chargeMinor = succeeded.filter(r => r.kind === 'charge').reduce((s, r) => s + Math.round(r.amount_minor), 0)
  const refundMinor = succeeded.filter(r => r.kind === 'refund').reduce((s, r) => s + Math.round(r.amount_minor), 0)

  const paidMinor = chargeMinor - refundMinor
  const totalMinor = orderTotalMinor(order)
  const balanceMinor = totalMinor - paidMinor
  const hasRefundRow = succeeded.some(r => r.kind === 'refund')

  // ── BRANCH ORDER IS LOAD-BEARING ──────────────────────────────────────────────────────────────────
  // 'refunded' is tested FIRST and keys on refund-row PRESENCE, never on the sum. "Charged then fully
  // refunded back to zero" and "never paid at all" are the SAME arithmetic state (paidMinor === 0);
  // only the existence of a refund row tells them apart. Reordering these two silently reports every
  // fully-refunded order as 'unpaid'.
  let status: PaymentStatus
  if (paidMinor === 0 && hasRefundRow) status = 'refunded'
  else if (paidMinor === 0) status = 'unpaid'
  // Refunds exceeding charges is not reachable while amount_minor > 0 (CHECK) and undo DELETES rather
  // than over-refunding — but it is bucketed explicitly rather than being allowed to fall through into
  // 'part_paid', where a negative paid figure would read as a normal outstanding balance.
  else if (paidMinor < 0) status = 'refund_due'
  else if (balanceMinor < 0) status = 'refund_due'
  else if (balanceMinor === 0) status = 'paid'
  else status = 'part_paid'

  return { paidMinor, balanceMinor, status }
}

/** The deterministic idempotency key for the single "Mark paid & done" charge on an order.
 *  See recordCollectionPayment() for why this shape, and why an undo frees it. */
export function collectIdempotencyKey(orderKey: string): string {
  return `collect:${orderKey}`
}

async function readLedger(supabase: SupabaseClient, orderKey: string): Promise<LedgerRow[]> {
  const { data, error } = await supabase
    .from('order_payments')
    .select('kind, channel, amount_minor, state, external_ref')
    .eq('order_key', orderKey)
  if (error) throw new Error(`[ledger] could not read order_payments for ${orderKey}: ${error.message}`)
  return (data ?? []) as LedgerRow[]
}

async function readOrder(supabase: SupabaseClient, orderKey: string): Promise<BalanceableOrder> {
  const { data, error } = await supabase
    .from('orders')
    .select('total, total_minor')
    .eq('order_key', orderKey)
    .single()
  if (error || !data) throw new Error(`[ledger] could not read order ${orderKey}: ${error?.message ?? 'not found'}`)
  return data as BalanceableOrder
}

/**
 * RECOMPUTE the derived caches from the ledger and write them back to `orders`.
 * IDEMPOTENT by construction: it reads the full ledger and writes an absolute value, never a delta, so
 * re-running it converges from any starting state. This is the ONLY writer of payment_status/amount_paid.
 *
 * The write-back is also STRUCTURAL, not a convenience: a row in a separate table does not touch
 * `orders.updated_at`, and lib/orders/mergeOrders.ts version-guards on that value — so without this
 * update a cached dashboard would never learn a balance changed.
 *
 * Throws on any failure. Callers must surface it, never swallow it.
 */
export async function recalcOrderPayment(supabase: SupabaseClient, orderKey: string): Promise<OrderBalance> {
  const [order, rows] = await Promise.all([readOrder(supabase, orderKey), readLedger(supabase, orderKey)])
  const balance = getOrderBalance(order, rows)

  const { error } = await supabase
    .from('orders')
    .update({ payment_status: balance.status, amount_paid: fromMinor(balance.paidMinor) })
    .eq('order_key', orderKey)
  // A CHECK violation here (23514) almost certainly means the DEPLOY-COUPLED constraint migration
  // 20260729_orders_payment_status_widen_check.sql has not been applied — say so rather than surfacing
  // a bare Postgres error, because that is the one failure mode this rollout can actually produce.
  if (error) {
    const hint = error.code === '23514'
      ? ' — payment_status CHECK rejected the value; has 20260729_orders_payment_status_widen_check.sql been applied?'
      : ''
    throw new Error(`[ledger] write-back failed for ${orderKey}: ${error.message}${hint}`)
  }
  return balance
}

/**
 * Insert one money event, then recalc. Insert first, recalc second (see the atomicity note above).
 * A unique violation on `idempotency_key` is treated as a SUCCESSFUL NO-OP — that is the whole point of
 * the key: an offline replay of the same action must not book a second charge. The recalc still runs, so
 * a replay that lands after a failed first recalc repairs the cache.
 */
export async function recordPaymentEvent(
  supabase: SupabaseClient,
  event: {
    orderKey: string
    truckId: string
    kind: PaymentKind
    channel: PaymentChannel
    amountMinor: number
    state?: PaymentEventState
    externalRef?: string | null
    note?: string | null
    idempotencyKey?: string | null
    createdBy?: string | null
    currency?: string
  },
): Promise<{ inserted: boolean; balance: OrderBalance }> {
  if (!Number.isInteger(event.amountMinor) || event.amountMinor <= 0) {
    throw new Error(`[ledger] amount_minor must be a positive integer (got ${event.amountMinor}) — kind carries the sign`)
  }

  const { error } = await supabase.from('order_payments').insert({
    order_key: event.orderKey,
    truck_id: event.truckId,
    kind: event.kind,
    channel: event.channel,
    amount_minor: event.amountMinor,
    currency: event.currency ?? 'GBP',
    state: event.state ?? 'succeeded',
    external_ref: event.externalRef ?? null,
    note: event.note ?? null,
    idempotency_key: event.idempotencyKey ?? null,
    created_by: event.createdBy ?? null,
  })

  let inserted = true
  if (error) {
    if (error.code === '23505') inserted = false          // idempotent replay — the event is already recorded
    else throw new Error(`[ledger] insert failed for ${event.orderKey}: ${error.message}`)
  }

  const balance = await recalcOrderPayment(supabase, event.orderKey)
  return { inserted, balance }
}

/**
 * "Mark paid & done" — charge the FULL OUTSTANDING BALANCE in person.
 *
 * IDEMPOTENCY KEY: `collect:{order_key}`, deterministic rather than client-supplied. The outbox DOES mint
 * a stable per-op uuid (lib/native/outbox.ts `op_id`), but it never reaches the server — drainOnce()
 * posts only `op.body`, and op_id lives outside it. Plumbing it through would mean changing the live
 * native offline gate for no gain here: this action charges the whole balance exactly once per order, so
 * the order key plus the action already identifies the event uniquely. An offline replay re-posts the
 * same body, derives the same key, and collides — which is exactly the desired no-op.
 * An undo DELETES this row (see reverseCollectionPayment), which FREES the key, so a legitimate
 * collect → undo → re-collect cycle inserts cleanly the second time.
 *
 * Charges only the outstanding balance, so it composes with any earlier part-payment: an order already
 * £10 paid against a £15 total books £5 here, not £15.
 */
export async function recordCollectionPayment(
  supabase: SupabaseClient,
  opts: { orderKey: string; truckId: string; createdBy?: string | null },
): Promise<{ inserted: boolean; balance: OrderBalance; chargedMinor: number }> {
  const [order, rows] = await Promise.all([readOrder(supabase, opts.orderKey), readLedger(supabase, opts.orderKey)])
  const before = getOrderBalance(order, rows)

  // Nothing outstanding (already settled, or a replay whose row is present): recalc so the cache is
  // correct and return without inserting a zero/negative row the CHECK would reject anyway.
  if (before.balanceMinor <= 0) {
    const balance = await recalcOrderPayment(supabase, opts.orderKey)
    return { inserted: false, balance, chargedMinor: 0 }
  }

  const { inserted, balance } = await recordPaymentEvent(supabase, {
    orderKey: opts.orderKey,
    truckId: opts.truckId,
    kind: 'charge',
    channel: 'in_person_other',
    amountMinor: before.balanceMinor,
    state: 'succeeded',
    idempotencyKey: collectIdempotencyKey(opts.orderKey),
    note: 'Mark paid & done — taken at the hatch',
    createdBy: opts.createdBy ?? null,
  })
  return { inserted, balance, chargedMinor: inserted ? before.balanceMinor : 0 }
}

/**
 * Undo of "Mark paid & done" — reverse the payment this order's collect booked.
 *
 * DELETE when no real money moved; REVERSE when it did. Concretely: delete the row only when
 * `external_ref is null` AND `state = 'succeeded'` AND `channel != 'online'`; otherwise insert a
 * compensating refund.
 *
 * WHY: "Mark paid & done" carries a 7-second undo toast (app/dashboard/[token]/page.tsx:~1258), so the
 * overwhelming majority of undos are mis-taps seconds after the fact. Writing a charge AND a refund for a
 * mis-tap records two money events that never happened — a ledger claiming a refund was issued when
 * nothing was ever taken is actively misleading to the operator reading it back, and it would corrupt the
 * 0.99%/allowance figures §37 depends on. Deleting a row that represents no real-world event loses
 * nothing. The moment `external_ref` is set, money genuinely moved through a processor, the row has an
 * external counterpart, and it must be reversed and never deleted — which is why the rule keys on
 * external_ref rather than on elapsed time or on channel alone.
 */
export async function reverseCollectionPayment(
  supabase: SupabaseClient,
  opts: {
    orderKey: string
    truckId: string
    createdBy?: string | null
    /**
     * Called with the FULL contents of the collect row immediately BEFORE it is deleted, and awaited.
     * 🔴 IF THIS THROWS, THE DELETE DOES NOT HAPPEN and the error propagates to the caller.
     * That is the point: the row is about to stop existing, so this is the last moment its contents can
     * be captured. The route passes the append-only audit write here, so a payment record can never be
     * erased without a log of the erasure. Not called on the 'refunded' or 'none' paths — nothing is
     * destroyed there.
     */
    beforeDelete?: (row: DeletedCollectRow) => Promise<void>
  },
): Promise<{ reversal: 'deleted' | 'refunded' | 'none'; balance: OrderBalance }> {
  const key = collectIdempotencyKey(opts.orderKey)

  const { data: rows, error } = await supabase
    .from('order_payments')
    .select('id, kind, channel, amount_minor, currency, state, external_ref, note, idempotency_key, created_at, created_by')
    .eq('order_key', opts.orderKey)
    .eq('idempotency_key', key)
  if (error) throw new Error(`[ledger] could not read the collect row for ${opts.orderKey}: ${error.message}`)

  const row = (rows ?? [])[0] as DeletedCollectRow | undefined
  if (!row) {
    // Nothing to reverse (never collected, or already undone). Recalc anyway so the cache is correct.
    return { reversal: 'none', balance: await recalcOrderPayment(supabase, opts.orderKey) }
  }

  const noRealMoneyMoved = row.external_ref == null && row.state === 'succeeded' && row.channel !== 'online'

  if (noRealMoneyMoved) {
    // CAPTURE BEFORE DESTROY. Awaited, and deliberately NOT wrapped in try/catch — a throw here must
    // abort the delete, leaving the ledger row intact and the undo refused.
    if (opts.beforeDelete) await opts.beforeDelete(row)
    const { error: delErr } = await supabase.from('order_payments').delete().eq('id', row.id)
    if (delErr) throw new Error(`[ledger] could not delete the collect row for ${opts.orderKey}: ${delErr.message}`)
    return { reversal: 'deleted', balance: await recalcOrderPayment(supabase, opts.orderKey) }
  }

  // Real money moved — compensate, never delete. No idempotency key: a second undo of a genuinely
  // processed payment is a distinct money event and must not be silently swallowed by a key collision.
  const { balance } = await recordPaymentEvent(supabase, {
    orderKey: opts.orderKey,
    truckId: opts.truckId,
    kind: 'refund',
    channel: row.channel,
    amountMinor: Math.round(row.amount_minor),
    state: 'succeeded',
    note: 'Reversal of "Mark paid & done" (undo) — original payment had an external reference',
    createdBy: opts.createdBy ?? null,
  })
  return { reversal: 'refunded', balance }
}
