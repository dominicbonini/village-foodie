// lib/loyalty/retention.ts — loyalty-1 (5 November 2026, docs/loyalty-1-report.md): the loyalty tables in the existing privacy routines.
//   • purgeOldLoyalty   — called by the daily 12-month retention job (lib/order-retention.ts, app/api/cron/order-retention). Once an
//     order's customer details are removed at 12 months, nothing in loyalty may still tie that order to a customer, so it DELETES:
//       – every stamp stamped more than 12 months ago (the order ↔ customer-key link);
//       – every reward redeemed, voided, or expired unused more than 12 months ago;
//       – every card with no stamp for 12 months (its stamps and rewards go with it, ON DELETE CASCADE) — including an unused reward
//         with no expiry date on it (a launch decision to confirm: the report's "privacy" section).
//     Bounded like the rest of that job (batches, a cap per run) and idempotent: a deleted row is not there to delete twice.
//   • deleteTruckLoyalty — called by account deletion (lib/account-deletion.ts): the truck's cards (cascading stamps and rewards) and
//     its settings. The hard delete (lib/delete-truck.ts) needs nothing: every loyalty table cascades from trucks(id).
// Failures are collected (retention) or thrown (account deletion), as each routine already does.
import type { SupabaseClient } from '@supabase/supabase-js'

export interface LoyaltyPurgeResult { cardsDeleted: number; stampsDeleted: number; rewardsDeleted: number }
type Narrow = (q: any) => any // eslint-disable-line @typescript-eslint/no-explicit-any

/** Delete, in id-keyed batches, the rows of `table` that `narrow` selects. */
async function deleteWhere(db: SupabaseClient, table: 'loyalty_cards' | 'loyalty_stamps' | 'loyalty_rewards', narrow: Narrow, batch: number, max: number, failures: string[]): Promise<number> {
  let deleted = 0
  while (deleted < max) {
    const { data, error } = await narrow(db.from(table).select('id')).order('id', { ascending: true }).limit(batch)
    if (error) { failures.push(`${table} read: ${error.message}`); return deleted }
    const ids = ((data || []) as { id: string }[]).map(r => r.id)
    if (!ids.length) return deleted
    const { error: dErr } = await db.from(table).delete().in('id', ids)
    if (dErr) { failures.push(`${table} delete: ${dErr.message}`); return deleted }
    deleted += ids.length
    if (ids.length < batch) return deleted
  }
  return deleted
}

export async function purgeOldLoyalty(db: SupabaseClient, cutoffIso: string, batch: number, max: number, failures: string[]): Promise<LoyaltyPurgeResult> {
  const cards = await deleteWhere(db, 'loyalty_cards', q => q.lt('last_stamp_at', cutoffIso), batch, max, failures)
    + await deleteWhere(db, 'loyalty_cards', q => q.is('last_stamp_at', null).lt('created_at', cutoffIso), batch, max, failures)
  const stamps = await deleteWhere(db, 'loyalty_stamps', q => q.lt('stamped_at', cutoffIso), batch, max, failures)
  const rewards = await deleteWhere(db, 'loyalty_rewards', q => q.lt('redeemed_at', cutoffIso), batch, max, failures)
    + await deleteWhere(db, 'loyalty_rewards', q => q.lt('voided_at', cutoffIso), batch, max, failures)
    + await deleteWhere(db, 'loyalty_rewards', q => q.is('redeemed_at', null).lt('expires_at', cutoffIso), batch, max, failures)
  return { cardsDeleted: cards, stampsDeleted: stamps, rewardsDeleted: rewards }
}

/** Account deletion: the trucks' loyalty cards (their stamps and rewards cascade) and settings. Throws on the first failure. */
export async function deleteTruckLoyalty(db: SupabaseClient, truckIds: string[]): Promise<{ cards: number; settings: number }> {
  let cards = 0, settings = 0
  for (const truckId of truckIds) {
    const c = await db.from('loyalty_cards').delete().eq('truck_id', truckId).select('id')
    if (c.error) throw new Error(`loyalty_cards ${truckId}: ${c.error.message}`)
    cards += c.data?.length ?? 0
    const s = await db.from('truck_loyalty_settings').delete().eq('truck_id', truckId).select('truck_id')
    if (s.error) throw new Error(`truck_loyalty_settings ${truckId}: ${s.error.message}`)
    settings += s.data?.length ?? 0
  }
  return { cards, settings }
}
