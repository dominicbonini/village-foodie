// lib/category-capacity-write.ts: the ONE server writer for a category's prep time, items per batch and
// "counts to total capacity". Also the ONE read that gives Manage the values to show.
//
// ── 🔴 THE BUG THIS EXISTS FOR (capacity-one-source-1, 13 November 2026) ─────────────────────────────
// Two screens edited two different stores and nothing kept them equal:
//   Menu › Items, category card    → `upsert_category`     → menu_categories       (Pizza Kitchen: 15m / 8)
//   Menu › Kitchen capacity        → `upsert_van_category` → van_category_settings (Pizza Kitchen: 5m / 4)
// Orders on an event WITH a van read the van row (lib/van-category-settings.ts); orders on an event
// with NO van read menu_categories. So the Items card, the Settings warning and every no-van event
// showed numbers that the van's orders were not using.
//
// ── 🔴 THE RULE NOW ──────────────────────────────────────────────────────────────────────────────────
// • THE VALUES ARE THE PER-VAN VALUES, as the existing resolver gives them. The first van (oldest active)
//   is what Manage shows on the Items card.
// • EVERY WRITE GOES THROUGH `writeVanCategoryCapacity`: the van row, the fan-out to the vans that
//   follow the first van's capacity, and (when the van IS the first van) a MIRROR into menu_categories,
//   so an event with no van uses the same numbers. One function, called by every route that can change
//   these three fields. No screen writes menu_categories' capacity fields itself.
// • A TRUCK WITH NO ACTIVE VAN has nothing to resolve through, so its truck-level row IS the value and
//   `writeCategoryCapacityForTruck` writes it directly.
//
// ⚠️ THE ORDER ENGINE IS NOT TOUCHED. It still resolves exactly as before (van row if the event has a
// van, else menu_categories). This file only makes the two stores hold the same numbers.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  readVanCategorySettings, readVanCategorySettingsForTruck, readVanSameAsFirst, effectiveCategorySettings,
  resolveCategories, firstVanId, type VanCategoryRow,
} from '@/lib/van-category-settings'

export interface CategoryCapacityPatch {
  prep_secs?: number | null
  batch_size?: number | null
  counts_toward_capacity?: boolean
}

/** True when the patch carries at least one of the three capacity fields. */
export function hasCapacityFields(p: Record<string, unknown> | null | undefined): boolean {
  if (!p) return false
  return p.prep_secs !== undefined || p.batch_size !== undefined || p.counts_toward_capacity !== undefined
}

/** Just the three fields, `undefined` dropped. `!== undefined`, never truthiness: 0 and false are real values. */
export function capacityPatchOf(p: Record<string, unknown> | null | undefined): CategoryCapacityPatch {
  const out: CategoryCapacityPatch = {}
  if (!p) return out
  if (p.prep_secs !== undefined) out.prep_secs = p.prep_secs === null ? null : Number(p.prep_secs)
  if (p.batch_size !== undefined) out.batch_size = p.batch_size === null ? null : Number(p.batch_size)
  if (p.counts_toward_capacity !== undefined) out.counts_toward_capacity = !!p.counts_toward_capacity
  return out
}

/** The truck's first van by the one rule (oldest ACTIVE van), or null. */
export async function readFirstVanId(supabase: SupabaseClient, truckId: string): Promise<{ ok: boolean; firstId: string | null }> {
  const same = await readVanSameAsFirst(supabase, truckId)
  if (!same.ok) {
    // ⚠️ The flags columns could not be read. Fall back to the long-standing columns so the first van is
    // still found; the fan-out simply has no followers to visit.
    const { data, error } = await supabase.from('truck_vans').select('id, created_at, active').eq('truck_id', truckId)
    if (error) return { ok: false, firstId: null }
    return { ok: true, firstId: firstVanId((data ?? []) as Array<{ id: string; created_at?: string | null; active?: boolean | null }>) }
  }
  const rows = [...same.createdAt.entries()].map(([id, created_at]) => ({ id, created_at, active: same.activeById.get(id) !== false }))
  return { ok: true, firstId: firstVanId(rows) }
}

export type WriteResult =
  | { ok: true; fannedTo: string[]; mirrored: boolean; row: { prep_secs: number | null; batch_size: number | null; counts_toward_capacity: boolean } }
  | { ok: false; code: 'van_not_found' | 'category_not_found' | 'van_capacity_save_failed'; status: number }

/**
 * ══ 🔴 THE WRITER ═══════════════════════════════════════════════════════════════════════════════════
 * Moved here verbatim in behaviour from `upsert_van_category` (app/api/manage/route.ts), plus step 4.
 *  1. Both ids are checked against THIS truck.
 *  2. The van's row is upserted, seeded from what the van already resolves, so the fields not in the
 *     patch do not jump.
 *  3. If the van is the first van, every van following its CAPACITY gets the same row.
 *  4. 🔴 NEW: if the van is the first van, menu_categories gets the same three values, so an event
 *     with no van assigned resolves to the same numbers.
 * ⚠️ 3 and 4 are best-effort: the van row is already saved and is what that van's orders use, so a
 * failure is logged and reported (`mirrored: false`), and re-saving repairs it. Failing the request
 * would lose the operator's edit.
 */
export async function writeVanCategoryCapacity(
  supabase: SupabaseClient,
  truckId: string,
  vanId: string,
  categoryId: string,
  patch: CategoryCapacityPatch,
): Promise<WriteResult> {
  const [{ data: van }, { data: cat }] = await Promise.all([
    supabase.from('truck_vans').select('id').eq('id', vanId).eq('truck_id', truckId).maybeSingle(),
    supabase.from('menu_categories').select('id, prep_secs, batch_size, counts_toward_capacity')
      .eq('id', categoryId).eq('truck_id', truckId).maybeSingle(),
  ])
  if (!van) return { ok: false, code: 'van_not_found', status: 404 }
  if (!cat) return { ok: false, code: 'category_not_found', status: 404 }

  const existing = await readVanCategorySettings(supabase, vanId)
  const base = effectiveCategorySettings(cat as { id: string } & Record<string, unknown>, existing.byCategoryId)
  const values = {
    prep_secs: patch.prep_secs !== undefined ? patch.prep_secs : base.prep_secs,
    batch_size: patch.batch_size !== undefined ? patch.batch_size : base.batch_size,
    counts_toward_capacity: patch.counts_toward_capacity !== undefined ? patch.counts_toward_capacity : base.counts_toward_capacity,
  }
  const row = { truck_id: truckId, van_id: vanId, category_id: categoryId, ...values, updated_at: new Date().toISOString() }

  const { error: upErr } = await supabase.from('van_category_settings').upsert(row, { onConflict: 'van_id,category_id' })
  if (upErr) {
    const code = (upErr as { code?: string }).code
    if (code === 'PGRST205' || code === '42P01') console.warn(`[category-capacity] van ${vanId}: table absent (${code}): migration not applied`)
    else console.warn(`[category-capacity] van ${vanId}: save failed (${code ?? 'no code'}): ${upErr.message}`)
    return { ok: false, code: 'van_capacity_save_failed', status: 500 }
  }

  const fannedTo: string[] = []
  let mirrored = false
  const same = await readVanSameAsFirst(supabase, truckId)
  const first = same.ok
    ? firstVanId([...same.createdAt.entries()].map(([id, created_at]) => ({ id, created_at, active: same.activeById.get(id) !== false })))
    : (await readFirstVanId(supabase, truckId)).firstId
  if (first && first === vanId) {
    if (same.ok) {
      for (const [fid, on] of same.capacityByVanId.entries()) {
        if (!on || fid === first) continue
        const { error: fanErr } = await supabase.from('van_category_settings').upsert({ ...row, van_id: fid }, { onConflict: 'van_id,category_id' })
        if (fanErr) console.warn(`[category-capacity] van ${fid}: follow-the-first-van write failed (${(fanErr as { code?: string }).code ?? 'no code'}): ${fanErr.message}`)
        else fannedTo.push(fid)
      }
    }
    /* 🔴 KEEP THE OTHER VANS WHERE THEY ARE. A van that does NOT follow the first van's capacity and has no row of its own
     * for this category reads menu_categories; the mirror below would move it with Van 1, behind the operator's back, on
     * a truck that answered "No" to "Same kitchen capacity for all vans?". So it first gets its own row at the values it
     * is using now (the category's, before this write). Nothing it runs changes; it simply stops reading the truck row. */
    await pinIndependentVans(supabase, truckId, first, categoryId,
      { prep_secs: cat.prep_secs ?? null, batch_size: cat.batch_size ?? null, counts_toward_capacity: !!cat.counts_toward_capacity },
      same.ok ? same : null)
    // 🔴 THE MIRROR. The first van's values are the truck's values, so the no-van path reads them too.
    const { error: mErr } = await supabase.from('menu_categories').update(values).eq('id', categoryId).eq('truck_id', truckId)
    if (mErr) console.warn(`[category-capacity] category ${categoryId}: mirror to menu_categories failed (${(mErr as { code?: string }).code ?? 'no code'}): ${mErr.message}`)
    else mirrored = true
  }
  return { ok: true, fannedTo, mirrored, row: values }
}

/**
 * Give every OTHER active van that does not follow the first van's capacity, and has no row of its own for `categoryId`,
 * a row at `current` (what it resolves to now, from menu_categories), so that changing menu_categories cannot move it.
 * ⚠️ With the switch flags unreadable (`same` null) every other active van counts as independent: keeping a van's numbers
 * is the safe direction, and the fan-out to followers is skipped in that case anyway.
 */
async function pinIndependentVans(
  supabase: SupabaseClient,
  truckId: string,
  firstId: string,
  categoryId: string,
  current: { prep_secs: number | null; batch_size: number | null; counts_toward_capacity: boolean },
  same: { capacityByVanId: Map<string, boolean>; activeById: Map<string, boolean> } | null,
): Promise<string[]> {
  let others: string[]
  if (same) {
    others = [...same.activeById.entries()].filter(([id, active]) => active && id !== firstId && !same.capacityByVanId.get(id)).map(([id]) => id)
  } else {
    const { data } = await supabase.from('truck_vans').select('id, active').eq('truck_id', truckId)
    others = ((data ?? []) as Array<{ id: string; active?: boolean | null }>).filter(v => v.active !== false && v.id !== firstId).map(v => v.id)
  }
  if (!others.length) return []
  const { data: rows } = await supabase.from('van_category_settings').select('van_id').eq('truck_id', truckId).eq('category_id', categoryId)
  const has = new Set(((rows ?? []) as Array<{ van_id: string }>).map(r => r.van_id))
  const pinned: string[] = []
  for (const vid of others) {
    if (has.has(vid)) continue
    const { error } = await supabase.from('van_category_settings').upsert(
      { truck_id: truckId, van_id: vid, category_id: categoryId, ...current, updated_at: new Date().toISOString() }, { onConflict: 'van_id,category_id' })
    if (error) console.warn(`[category-capacity] van ${vid}: keeping its own values failed: ${error.message}`)
    else pinned.push(vid)
  }
  return pinned
}

/**
 * The same write when the caller has no van in hand (Menu › Items, the dashboard's category editor).
 * 🔴 A TRUCK WITH A VAN WRITES THROUGH ITS FIRST VAN, never menu_categories directly, so there is no
 * second writer. A truck with NO active van has nothing to resolve through, and menu_categories is the
 * value; that is the only branch that writes it directly.
 */
export async function writeCategoryCapacityForTruck(
  supabase: SupabaseClient,
  truckId: string,
  categoryId: string,
  patch: CategoryCapacityPatch,
): Promise<WriteResult & { vanId?: string | null }> {
  const { firstId } = await readFirstVanId(supabase, truckId)
  if (firstId) return { ...(await writeVanCategoryCapacity(supabase, truckId, firstId, categoryId, patch)), vanId: firstId }
  const { data: cat } = await supabase.from('menu_categories').select('id, prep_secs, batch_size, counts_toward_capacity')
    .eq('id', categoryId).eq('truck_id', truckId).maybeSingle()
  if (!cat) return { ok: false, code: 'category_not_found', status: 404 }
  const values = {
    prep_secs: patch.prep_secs !== undefined ? patch.prep_secs : (cat.prep_secs ?? null),
    batch_size: patch.batch_size !== undefined ? patch.batch_size : (cat.batch_size ?? null),
    counts_toward_capacity: patch.counts_toward_capacity !== undefined ? patch.counts_toward_capacity : !!cat.counts_toward_capacity,
  }
  const { error } = await supabase.from('menu_categories').update(values).eq('id', categoryId).eq('truck_id', truckId)
  if (error) {
    console.warn(`[category-capacity] category ${categoryId}: save failed (${(error as { code?: string }).code ?? 'no code'}): ${error.message}`)
    return { ok: false, code: 'van_capacity_save_failed', status: 500 }
  }
  return { ok: true, fannedTo: [], mirrored: true, row: values, vanId: null }
}

/**
 * After the first van changes (it was removed, so the next-oldest active van is now first), copy the
 * new first van's own rows into menu_categories so the no-van path follows it. Categories it has no
 * row for already resolve to menu_categories and need nothing.
 */
export async function mirrorFirstVanToMenuCategories(supabase: SupabaseClient, truckId: string): Promise<number> {
  const { firstId } = await readFirstVanId(supabase, truckId)
  if (!firstId) return 0
  const read = await readVanCategorySettings(supabase, firstId)
  if (!read.ok) return 0
  let n = 0
  const same = await readVanSameAsFirst(supabase, truckId)
  for (const r of read.byCategoryId.values()) {
    const { data: cat } = await supabase.from('menu_categories').select('id, prep_secs, batch_size, counts_toward_capacity')
      .eq('id', r.category_id).eq('truck_id', truckId).maybeSingle()
    if (cat) await pinIndependentVans(supabase, truckId, firstId, r.category_id,
      { prep_secs: cat.prep_secs ?? null, batch_size: cat.batch_size ?? null, counts_toward_capacity: !!cat.counts_toward_capacity }, same.ok ? same : null)
    const { error } = await supabase.from('menu_categories')
      .update({ prep_secs: r.prep_secs ?? null, batch_size: r.batch_size ?? null, counts_toward_capacity: !!r.counts_toward_capacity })
      .eq('id', r.category_id).eq('truck_id', truckId)
    if (error) console.warn(`[category-capacity] category ${r.category_id}: first-van mirror failed: ${error.message}`)
    else n++
  }
  return n
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE READ: what Manage shows
// ════════════════════════════════════════════════════════════════════════════════════════════════

type Cat = { id: string; prep_secs?: number | null; batch_size?: number | null; counts_toward_capacity?: boolean | null }

const same3 = (a: Cat, b: Cat) =>
  (a.prep_secs ?? null) === (b.prep_secs ?? null)
  && (a.batch_size ?? null) === (b.batch_size ?? null)
  && !!a.counts_toward_capacity === !!b.counts_toward_capacity

/**
 * PURE. The categories as the FIRST van resolves them, and the ids of the categories where another
 * active van resolves differently. Exported so the harness can drive it with fixtures.
 */
export function resolveForFirstVan<T extends Cat>(
  categories: readonly T[],
  vans: ReadonlyArray<{ id: string; created_at?: string | null; active?: boolean | null }>,
  rowsByVan: ReadonlyMap<string, VanCategoryRow[]>,
): { categories: T[]; firstVanId: string | null; vanCount: number; vansDiffer: string[] } {
  const active = vans.filter(v => v.active !== false)
  const first = firstVanId(active)
  const mapOf = (vid: string) => new Map((rowsByVan.get(vid) ?? []).map(r => [r.category_id, r]))
  const resolved = first ? resolveCategories(categories, mapOf(first)) : [...categories]
  const vansDiffer: string[] = []
  if (first) {
    const others = active.filter(v => v.id !== first)
    for (let i = 0; i < categories.length; i++) {
      if (others.some(v => !same3(resolveCategories([categories[i]], mapOf(v.id))[0], resolved[i]))) vansDiffer.push(categories[i].id)
    }
  }
  return { categories: resolved, firstVanId: first, vanCount: active.length, vansDiffer }
}

/**
 * The read Manage's GET uses. ⚠️ FAILS OPEN: if the per-van rows cannot be read the categories come
 * back as stored, exactly as before this file existed.
 */
export async function readCategoriesForFirstVan<T extends Cat>(
  supabase: SupabaseClient,
  truckId: string,
  categories: readonly T[],
): Promise<{ categories: T[]; firstVanId: string | null; vanCount: number; vansDiffer: string[] }> {
  try {
    const [{ data: vans, error }, rows] = await Promise.all([
      supabase.from('truck_vans').select('id, created_at, active').eq('truck_id', truckId),
      readVanCategorySettingsForTruck(supabase, truckId),
    ])
    if (error) return { categories: [...categories], firstVanId: null, vanCount: 0, vansDiffer: [] }
    return resolveForFirstVan(categories, (vans ?? []) as Array<{ id: string; created_at?: string | null; active?: boolean | null }>, rows.ok ? rows.byVanId : new Map())
  } catch (e) {
    console.warn(`[category-capacity] truck ${truckId}: first-van read threw; categories shown as stored:`, e instanceof Error ? e.message : String(e))
    return { categories: [...categories], firstVanId: null, vanCount: 0, vansDiffer: [] }
  }
}
