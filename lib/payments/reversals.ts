// lib/payments/reversals.ts — 🔴 till-pack-2 (25 November 2026, docs/till-pack-2-report.md): A (PAYMENT, REVERSAL) PAIR IS NOTHING.
//
// PURE AND CLIENT-SAFE: no database, no React. An undo of a counter collection, an undo of "Mark paid" and a refund that failed used to
// DELETE their payment row. They now INSERT a `kind = 'reversal'` row whose `reverses_payment_id` points at the row it cancels
// (supabase/migrations/20261133_till_pack_2.sql), so the record of money is never destroyed. Every reader of order_payments must then
// see the pair as if neither row existed — which is exactly what it saw before, when the row was deleted. This module is that rule, ONCE.
//
// ⚠️ WITH NO REVERSAL IN THE SET, THE OUTPUT IS THE INPUT, row for row and in the same order (only the two netting keys are dropped by
// `netted`). So every figure, status, ticket and screen is byte-identical to before for every order without a reversal — which is every
// order until this code is deployed.
// ⚠️ A reversal row is dropped even when the row it points at is not in the set (a reader that fetched a narrower slice): it is never
// money in its own right, and the deployed code never counted one either (it filters 'charge' / 'refund' by name).

/** The columns a reader must ALSO select for the netting to work. Not part of LEDGER_ROW_COLUMNS, so the rows a reader hands on (to the
 *  browser, to getOrderBalance, to a CSV) keep exactly today's shape once `netted` has removed them. */
export const NETTING_COLUMNS = 'id, reverses_payment_id'

export interface NettableRow {
  id?: string | null
  kind?: string | null
  reverses_payment_id?: string | null
  state?: string | null
}

/** The ids reversed by a SUCCEEDED reversal in the set. */
export function reversedIds(rows: readonly NettableRow[] | null | undefined): Set<string> {
  const out = new Set<string>()
  for (const r of rows ?? []) {
    if (r && r.kind === 'reversal' && r.reverses_payment_id && (r.state == null || r.state === 'succeeded')) out.add(String(r.reverses_payment_id))
  }
  return out
}

/** The rows with every reversal and every row a reversal cancels removed. The rows keep their own keys (including id). */
export function withoutReversals<T extends NettableRow>(rows: readonly T[] | null | undefined): T[] {
  const list = rows ?? []
  if (!list.some(r => r && r.kind === 'reversal')) return [...list]
  const gone = reversedIds(list)
  return list.filter(r => !(r && (r.kind === 'reversal' || (r.id != null && gone.has(String(r.id))))))
}

/** How many rows of the set a reversal cancels (a collect's idempotency key must change after an undo — see ledger.ts). */
export function reversalCount(rows: readonly NettableRow[] | null | undefined): number {
  return reversedIds(rows).size
}

/** `withoutReversals`, then the two netting keys removed — the rows exactly as a reader that never selected them would have had them. */
export function netted<T extends NettableRow>(rows: readonly T[] | null | undefined): Omit<T, 'id' | 'reverses_payment_id'>[] {
  return withoutReversals(rows).map(r => {
    const { id: _id, reverses_payment_id: _rp, ...rest } = r as T & Record<string, unknown>
    void _id; void _rp
    return rest as Omit<T, 'id' | 'reverses_payment_id'>
  })
}
