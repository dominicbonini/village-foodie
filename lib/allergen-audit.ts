import type { SupabaseClient } from '@supabase/supabase-js'

// Shared helpers for the allergen audit log + the owner/admin gate decision. Used by both the manage
// route (item / settings-card / modifier-option writes) and commit-menu (import). The audit table is
// append-only — these only ever INSERT.

// 'card_match' = an allergen ADDED to a dish by the import allergen-card→dish matcher (verified=false,
// staged for the operator's row-by-row confirm). Distinct from 'import' (menu AI detections) and 'confirm'
// (the operator's later verification) so the trail reads: card added (unverified) → operator confirmed.
export type AuditChangeType = 'confirm' | 'edit' | 'card_save' | 'import' | 'card_match'
export type AuditField = 'allergens' | 'dietary' | 'allergens_verified' | 'card'
export type Actor = { actor_user_id: string | null; actor_role: string | null; auth_method: 'token' | 'authenticated' }
export type AllergenAuditRow = Actor & {
  truck_id: string
  item_id?: string | null
  change_type: AuditChangeType
  field: AuditField
  old_value?: string | null
  new_value?: string | null
}

// Order-insensitive JSON for text[] comparison + storage (so a re-order isn't logged as a change).
export const tagJson = (v: unknown) => JSON.stringify(Array.isArray(v) ? [...v].map(String).sort() : v ?? null)
export const arrEq = (a: unknown, b: unknown) => tagJson(a) === tagJson(b)

// Best-effort, append-only. A logging failure must NOT fail the underlying write (the data change is
// already committed) — we console.error so it's visible without blocking the operator.
export async function logAllergenChanges(supabase: SupabaseClient, rows: AllergenAuditRow[]) {
  if (!rows.length) return
  try {
    const { error } = await supabase.from('allergen_audit_log').insert(rows)
    if (error) console.error('[allergen-audit] insert failed:', error.message)
  } catch (e) { console.error('[allergen-audit] insert threw:', e) }
}

// Build per-field audit rows for an ITEM allergen write. Empty array ⇒ nothing allergen-relevant changed
// (so the owner/admin gate does NOT fire — e.g. a manager editing only price/stock via upsert_item).
export function diffItemAllergens(opts: {
  truckId: string
  itemId: string | null
  actor: Actor
  prev: { allergens?: string[] | null; dietary_info?: string[] | null; allergens_verified?: boolean | null } | null
  next: { allergens?: string[]; dietary_info?: string[]; allergens_verified?: boolean }
  // Card→dish matcher writes pass 'card_match' so the trail distinguishes a card-sourced addition from a
  // manual edit (the operator's later confirm logs its own 'confirm'). Optional — manual edits omit it.
  changeTypeOverride?: AuditChangeType
}): AllergenAuditRow[] {
  const { truckId, itemId, actor, prev, next } = opts
  const prevA = prev?.allergens ?? [], prevD = prev?.dietary_info ?? [], prevV = prev?.allergens_verified
  const rows: AllergenAuditRow[] = []
  const aChg = next.allergens !== undefined && !arrEq(next.allergens, prevA)
  const dChg = next.dietary_info !== undefined && !arrEq(next.dietary_info, prevD)
  const newV = next.allergens_verified
  const vChg = newV !== undefined && (newV === true) !== (prevV === true)
  // A write that flips verified→true is a CONFIRM; any other allergen change is an EDIT — unless the caller
  // overrides (e.g. 'card_match' for the card→dish merge).
  const changeType: AuditChangeType = opts.changeTypeOverride ?? ((vChg && newV === true) ? 'confirm' : 'edit')
  if (aChg) rows.push({ ...actor, truck_id: truckId, item_id: itemId, change_type: changeType, field: 'allergens', old_value: tagJson(prevA), new_value: tagJson(next.allergens) })
  if (dChg) rows.push({ ...actor, truck_id: truckId, item_id: itemId, change_type: changeType, field: 'dietary', old_value: tagJson(prevD), new_value: tagJson(next.dietary_info) })
  if (vChg) rows.push({ ...actor, truck_id: truckId, item_id: itemId, change_type: changeType, field: 'allergens_verified', old_value: String(prevV ?? null), new_value: String(newV) })
  return rows
}
