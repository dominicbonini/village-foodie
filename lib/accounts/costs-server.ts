// lib/accounts/costs-server.ts — costs-accounts-1 (4 November 2026, docs/costs-accounts-1-report.md): THE ONE READER AND WRITER OF
// public.menu_item_costs (what one portion of a dish costs the truck, with history).
//
// 🔴 SERVER ONLY, SERVICE ROLE, MANAGE ONLY. The table has RLS on and no policy; nothing else in the app names it (the
// costs-accounts-1 harness fails if anything does). Its callers are /api/manage's `get_item_cost`, `set_item_cost` and
// `get_report` — an owner or manager of the truck. No customer surface (the public menu API, the order page, the KDS, tickets)
// imports this module or reads the table.
// HISTORY: one row per dish per truck-local day. Setting a cost writes TODAY's row (a second change the same day replaces it);
// an earlier day's row is never changed, so a past order keeps the cost that applied on its event date (lib/accounts/ledger.ts
// costOn). Clearing the box writes a row with cost_minor NULL — "no cost from today".
import 'server-only'
import type { CostRow } from '@/lib/accounts/ledger'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the route's service-role client, typed loosely like its other helpers
type Db = any

const TABLE = 'menu_item_costs'
const COLS = 'item_id, cost_minor, currency, effective_from'

/** Every cost row of a truck, oldest first (for a report). */
export async function readTruckCosts(db: Db, truckId: string): Promise<CostRow[]> {
  const out: CostRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(TABLE).select(COLS).eq('truck_id', truckId).order('effective_from', { ascending: true }).range(from, from + 999)
    if (error) throw new Error(`menu_item_costs read: ${error.message}`)
    out.push(...((data ?? []) as CostRow[]))
    if (!data || data.length < 1000) return out
  }
}

/** The cost that applies to a dish today (its latest row), or null. */
export async function currentItemCost(db: Db, truckId: string, itemId: string): Promise<{ costMinor: number | null; currency: string; effectiveFrom: string } | null> {
  const { data, error } = await db.from(TABLE).select(COLS).eq('truck_id', truckId).eq('item_id', itemId).order('effective_from', { ascending: false }).limit(1)
  if (error) throw new Error(`menu_item_costs read: ${error.message}`)
  const r = (data ?? [])[0] as CostRow | undefined
  return r ? { costMinor: r.cost_minor, currency: r.currency, effectiveFrom: r.effective_from } : null
}

export type SetCostResult = { ok: true; written: boolean } | { ok: false; code: 'item_not_found' | 'cost_invalid' }

/**
 * Set a dish's cost from `today` (the truck-local date). `costMinor` null clears it. Nothing is written when the cost that applies
 * already says the same, or when clearing a dish that never had one. The dish must belong to the truck.
 */
export async function setItemCost(db: Db, args: { truckId: string; itemId: string; costMinor: number | null; currency: string; today: string; actor: string | null }): Promise<SetCostResult> {
  const { truckId, itemId, costMinor, currency, today, actor } = args
  if (costMinor !== null && (!Number.isSafeInteger(costMinor) || costMinor < 0 || costMinor > 100_000_000)) return { ok: false, code: 'cost_invalid' }
  const { data: item } = await db.from('menu_items_db').select('id').eq('id', itemId).eq('truck_id', truckId).maybeSingle()
  if (!item) return { ok: false, code: 'item_not_found' }
  const current = await currentItemCost(db, truckId, itemId)
  if (current ? current.costMinor === costMinor && current.currency === currency : costMinor === null) return { ok: true, written: false }
  const { error } = await db.from(TABLE).upsert(
    { truck_id: truckId, item_id: itemId, cost_minor: costMinor, currency, effective_from: today, created_by: actor },
    { onConflict: 'item_id,effective_from' },
  )
  if (error) throw new Error(`menu_item_costs write: ${error.message}`)
  return { ok: true, written: true }
}
