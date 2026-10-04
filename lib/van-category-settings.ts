// lib/van-category-settings.ts — the ONE resolver for "what are this van's category capacity settings".
//
// ── 🔴 THE BUG THIS EXISTS FOR ───────────────────────────────────────────────────────────────────────
// Prep, Items and "Counts to total capacity" are shown inside each VAN's Kitchen capacity card but were
// stored once per TRUCK on `menu_categories`, which has no `van_id`. Editing Van 2 edited Van 1.
// These three fields decide whether an order is accepted and when it is ready, so a truck with two
// kitchens could not be configured correctly at all. See docs/settings-and-preview-report.md §4.
//
// ── 🔴 ONE RESOLVER, EVERY READER ────────────────────────────────────────────────────────────────────
// Four server routes build category capacity inputs, and all four now resolve through this file:
//   app/api/slots/[truckId]/route.ts   — the customer's slot grid
//   app/api/dashboard/route.ts         — the operator board and the KDS
//   lib/prep-utils.ts buildCatConfigs  — used by app/api/orders/submit (order acceptance)
//   app/api/menu/[truckId]/route.ts    — the customer menu payload
// A second place that decides this is a second answer to "can this order be accepted", and the two
// would disagree only under load, which is the worst time to find out.
//
// ── 🔴 WHY THIS RETURNS RAW FIELD VALUES AND NOT A `CatConfig` ───────────────────────────────────────
// The four readers normalise DIFFERENTLY, and those differences are pre-existing behaviour this change
// must not alter:
//   slots              `batch: c.batch_size || 1`
//   dashboard          `batch: c.batch_size || 1`
//   buildCatConfigs    `batch: c.batch_size && c.batch_size > 0 ? c.batch_size : 999`
//   menu payload       `batch_size: c.batch_size ?? null`  (raw, normalised by the client)
// So `resolveCategory` hands back a category object with the three fields SWAPPED and nothing else
// touched, and each caller keeps its own expression verbatim. Had this returned a `CatConfig` it would
// have had to pick one of those defaults and would have silently changed the other three readers.
// (The 1-vs-999 split is pre-existing and is reported, not fixed here.)
//
// ⚠️ PURE, EXCEPT FOR THE ONE READ. `readVanCategorySettings` is the only function that touches the
// database; everything else is a pure function over rows the caller already has, so the equivalence
// harness can drive it with fixtures.

import type { SupabaseClient } from '@supabase/supabase-js'

/** The three fields, as `menu_categories` and `van_category_settings` both hold them. */
export interface CategoryCapacityFields {
  prep_secs?: number | null
  batch_size?: number | null
  counts_toward_capacity?: boolean | null
}

/** One `van_category_settings` row, as the resolver needs it. */
export interface VanCategoryRow extends CategoryCapacityFields {
  category_id: string
}

/** Every per-van row for one van, keyed by `category_id`. */
export type VanCategoryMap = ReadonlyMap<string, VanCategoryRow>

/**
 * 🔴 THE STATE OF EVERY TRUCK THE DAY THIS SHIPS, and the value every failure path returns. Shared and
 * frozen so a caller cannot accidentally populate "no overrides" for everybody.
 */
export const NO_VAN_CATEGORY_SETTINGS: VanCategoryMap = new Map()

export interface VanCategoryRead {
  /** false = the read failed (migration not applied, schema cache stale, or a network error). */
  ok: boolean
  byCategoryId: VanCategoryMap
}

const READ_FAILED: VanCategoryRead = { ok: false, byCategoryId: NO_VAN_CATEGORY_SETTINGS }

/**
 * Every per-van override for one van.
 *
 * 🔴 IT FAILS OPEN TO TODAY'S BEHAVIOUR, AND THAT IS THE WHOLE POINT. Any failure — the migration not
 * yet applied (42703), PostgREST serving a stale schema cache (PGRST205/PGRST204), a dropped
 * connection — returns an EMPTY map, and every caller then reads `menu_categories` exactly as it did
 * before this file existed. Ordering cannot break because a migration has not been run.
 *
 * ⚠️ THE SAME PATTERN AS `readVanIntervals`/`readEventIntervals` in lib/slot-interval.ts, and for the
 * same documented reason: these columns are read on the ORDER PATH, where a thrown error would turn a
 * degraded answer into no answer at all.
 *
 * ⚠️ NO VAN ⇒ NO READ. `vanId` null is the ordinary case for an event with no van assigned, and it
 * means "use the truck defaults" — not an error, and not worth a query.
 */
export async function readVanCategorySettings(
  supabase: SupabaseClient,
  vanId: string | null | undefined,
): Promise<VanCategoryRead> {
  if (!vanId) return { ok: true, byCategoryId: NO_VAN_CATEGORY_SETTINGS }
  try {
    const { data, error } = await supabase
      .from('van_category_settings')
      .select('category_id, prep_secs, batch_size, counts_toward_capacity')
      .eq('van_id', vanId)
    if (error) {
      const code = (error as { code?: string }).code
      if (code === 'PGRST205' || code === 'PGRST204') {
        console.warn(`[van-category-settings] van ${vanId}: table not in PostgREST's schema cache (${code}) — reload the schema; this van reads the truck defaults`)
      } else if (code === '42703' || code === '42P01') {
        console.warn(`[van-category-settings] van ${vanId}: table or column absent (${code}) — migration not applied; this van reads the truck defaults`)
      } else {
        console.warn(`[van-category-settings] van ${vanId}: read failed (${code ?? 'no code'}): ${error.message}; this van reads the truck defaults`)
      }
      return READ_FAILED
    }
    const byCategoryId = new Map<string, VanCategoryRow>()
    for (const row of (data ?? []) as VanCategoryRow[]) {
      if (row?.category_id) byCategoryId.set(row.category_id, row)
    }
    return { ok: true, byCategoryId }
  } catch (e) {
    console.warn(`[van-category-settings] van ${vanId}: read threw; this van reads the truck defaults:`, e instanceof Error ? e.message : String(e))
    return READ_FAILED
  }
}

/**
 * THE RESOLUTION, for one category.
 *
 * The van's own row if it has one, otherwise the category's own values — which is what every reader
 * did before this existed.
 *
 * 🔴 WITH NO ROWS THIS RETURNS THE INPUT OBJECT ITSELF, not a copy. That is deliberate: it makes the
 * no-overrides path (every truck today, Pizzeria Gusto included) not merely equivalent but IDENTICAL,
 * with no allocation and no field-by-field reconstruction that could drop a property the caller also
 * reads — `id`, `name`, `sort_order`, `allow_notes`, `default_stock` all travel through untouched.
 *
 * ⚠️ A ROW OVERRIDES ALL THREE FIELDS TOGETHER. There is no per-field inheritance: a row means "this
 * van has its own settings for this category". The writer seeds a new row from the values the van is
 * already resolving, so the first write cannot change what the kitchen is doing.
 */
export function resolveCategory<T extends CategoryCapacityFields & { id: string }>(
  category: T,
  rows: VanCategoryMap | null | undefined,
): T {
  if (!rows || rows.size === 0) return category
  const own = rows.get(category.id)
  if (!own) return category
  return {
    ...category,
    prep_secs: own.prep_secs ?? null,
    batch_size: own.batch_size ?? null,
    counts_toward_capacity: !!own.counts_toward_capacity,
  }
}

/** The same resolution over a whole list, in order. */
export function resolveCategories<T extends CategoryCapacityFields & { id: string }>(
  categories: readonly T[] | null | undefined,
  rows: VanCategoryMap | null | undefined,
): T[] {
  const list = categories ?? []
  if (!rows || rows.size === 0) return list as T[]
  return list.map(c => resolveCategory(c, rows))
}

/**
 * The three fields a van is effectively using for a category — for the WRITER, which seeds a van's
 * first row from what that van already resolves so nothing jumps.
 *
 * ⚠️ IT RETURNS THE SAME THREE FIELDS IN BOTH BRANCHES, deliberately shaped as the insert payload, so
 * the writer has no second place to decide what "current value" means.
 */
export function effectiveCategorySettings(
  category: CategoryCapacityFields & { id: string },
  rows: VanCategoryMap | null | undefined,
): { prep_secs: number | null; batch_size: number | null; counts_toward_capacity: boolean } {
  const r = resolveCategory(category, rows)
  return {
    prep_secs: r.prep_secs ?? null,
    batch_size: r.batch_size ?? null,
    counts_toward_capacity: !!r.counts_toward_capacity,
  }
}

/**
 * Van + categories in one step, from ids the caller already has.
 *
 * ⚠️ `vanId` IS NOT RESOLVED HERE. It comes from the event the caller already resolved by its own
 * existing path — the same `van_id` that `kitchen_capacity` and the collection intervals are read
 * from. This function resolves no events and chooses no vans, exactly like `resolveIntervalsFor`.
 */
export async function resolveCategoriesForVan<T extends CategoryCapacityFields & { id: string }>(
  supabase: SupabaseClient,
  vanId: string | null | undefined,
  categories: readonly T[] | null | undefined,
): Promise<{ categories: T[]; ok: boolean; vanRowCount: number }> {
  const read = await readVanCategorySettings(supabase, vanId)
  return {
    categories: resolveCategories(categories, read.byCategoryId),
    ok: read.ok,
    vanRowCount: read.byCategoryId.size,
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// "SAME AS VAN 1" — THE FIRST-VAN RULE, AND WHAT THE SWITCH COPIES
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * 🔴 THE FIRST VAN IS THE OLDEST ACTIVE VAN, BY `created_at` ASCENDING.
 *
 * That is not a choice made here — it is the order `get_vans` already returns
 * (`.eq('active', true).order('created_at', { ascending: true })` in app/api/manage/route.ts), which is
 * the order Manage › Truck settings renders. So "Van 1" in the switch's label means the van at the top
 * of the operator's own list, and the rule cannot drift from what they see.
 *
 * ⚠️ INACTIVE VANS ARE NOT CANDIDATES. A deactivated van is not shown in that list, so treating it as
 * "Van 1" would name a van the operator cannot see.
 *
 * ⚠️ IF THE FIRST VAN IS DELETED the next-oldest active van becomes first, automatically, because this
 * is derived and never stored. Vans with the switch ON keep their own copied values and stay on — the
 * switch is a write fan-out, not a read-time lookup, so nothing re-resolves and nothing jumps. They
 * then follow the NEW first van from its next edit onwards.
 */
export function firstVanId(
  vans: readonly { id: string; active?: boolean | null; created_at?: string | null }[] | null | undefined,
): string | null {
  const active = (vans ?? []).filter(v => v.active !== false)
  if (active.length === 0) return null
  // ⚠️ A STABLE SORT ON THE STRING, not `new Date()`. These are ISO timestamptz strings, which compare
  // correctly as strings, and a van with a null created_at sorts last rather than becoming NaN-first.
  const sorted = [...active].sort((a, b) => String(a.created_at ?? '~').localeCompare(String(b.created_at ?? '~')))
  return sorted[0]?.id ?? null
}

/**
 * The `truck_vans` columns "Same as Van 1" copies.
 *
 * 🔴 THIS LIST IS THE ONE FROM docs/settings-and-preview-report.md §4 — the fields that genuinely live
 * per van. Everything a van owns is copied, so "same as" means the same service, not "the same except
 * the four things nobody remembered".
 *
 * ⛔ DELIBERATELY ABSENT, and each for a reason:
 *   `id`, `truck_id`, `created_at`  — identity, never copied.
 *   `name`                          — the operator named this van; copying would rename it "Van 1".
 *   `kds_token`                     — a SECRET and a device address. Copying it would point two vans'
 *                                     kitchen screens at one queue.
 *   `active`                        — whether the van exists in the list is not a setting.
 *   `same_as_first_van`             — the switch itself, written separately by its own handler.
 *   `display_layout`, `split_screen`— read-only on this screen; set on the KDS device itself.
 *   `network_printer_address`, `network_print_device_id`
 *                                   — a PHYSICAL ADDRESS on a specific network and a specific device
 *                                     id. Two vans sharing them would print one van's tickets in the
 *                                     other van. This is the one group where "same settings" would be
 *                                     actively wrong.
 * ⚠️ ADDING A PER-VAN SETTING LATER MEANS ADDING IT HERE TOO, or the switch silently stops meaning
 * "same". The harness asserts this list against `update_van_settings`' own allowlist.
 */
export const VAN_COPY_FIELDS = [
  'auto_pause_on_offline',
  'offline_protection_mode',
  'offline_auto_reject_mins',
  'show_cooking_step',
  'order_ready_enabled',
  'buzzer_count',
  'collection_interval_mins',
  'operator_collection_interval_mins',
] as const

export type VanCopyField = typeof VAN_COPY_FIELDS[number]

/**
 * ── 🔴 THE CAPACITY SWITCH'S OWN FIELDS (October 2026) ────────────────────────────────────────────
 * `kitchen_capacity` and `capacity_window_mins` LEFT `VAN_COPY_FIELDS` and live here instead, because
 * capacity moved to Menu › Kitchen capacity with a switch of its own
 * (`truck_vans.capacity_same_as_first_van`).
 *
 * 🔴 THE TWO SETS MUST BE DISJOINT, AND THAT IS THE WHOLE POINT. If a field were in both, turning on
 * Settings' "Same as Van 1" would also move the van's capacity — which the capacity switch says it
 * owns — and the operator would have two controls that quietly undo each other. `capacitySplitIsClean`
 * below is the assertion, and scripts/van-category-settings.cjs runs it.
 *
 * ⚠️ THE CATEGORY ROWS (`van_category_settings`) TRAVEL WITH CAPACITY, not with the other settings.
 * They are per-category batch sizes and prep times — the capacity table's own rows — so the capacity
 * switch copies and fans them out, and Settings' switch no longer touches them.
 */
export const CAPACITY_COPY_FIELDS = [
  'kitchen_capacity',
  'capacity_window_mins',
] as const

export type CapacityCopyField = typeof CAPACITY_COPY_FIELDS[number]

/**
 * 🔴 NO FIELD IS IN BOTH SETS. Exported so a harness can assert it rather than a comment claiming it.
 * A field in both would make the two switches fight over one column.
 */
export const capacitySplitIsClean = (): boolean =>
  !(VAN_COPY_FIELDS as readonly string[]).some(f => (CAPACITY_COPY_FIELDS as readonly string[]).includes(f))

/**
 * Just the CAPACITY fields of a van row, for the capacity switch's copy and fan-out.
 *
 * ⚠️ SAME SHAPE AS `vanCopyPayload`, deliberately: one function per switch, each over its own field
 * list, so neither can carry the other's columns by accident.
 */
export function capacityCopyPayload(van: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!van) return out
  for (const f of CAPACITY_COPY_FIELDS) if (f in van) out[f] = van[f]
  return out
}

/** Just the copyable fields of a van row, for the fan-out write. */
export function vanCopyPayload(van: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!van) return out
  for (const f of VAN_COPY_FIELDS) {
    if (f in van) out[f] = (van as Record<string, unknown>)[f]
  }
  return out
}

/**
 * The per-van category rows to write into `targetVanId` so it matches `sourceVanId`.
 *
 * 🔴 IT RETURNS A FULL REPLACEMENT, NOT A MERGE, and that is what makes "same" true. If the source van
 * has rows for two categories and the target has a row for a third, merging would leave the target
 * with the third category still overridden — the same switch, two different kitchens. So the caller
 * DELETES the target's rows and inserts these.
 *
 * ⚠️ AN EMPTY RESULT IS CORRECT AND MEANS "inherit the truck defaults, exactly as the source does".
 * A source van with no rows of its own is following `menu_categories`; the target matches it by also
 * having none, not by being given a snapshot that would then stop following.
 */
export function vanCategoryCopyRows(
  sourceRows: VanCategoryMap | null | undefined,
  truckId: string,
  targetVanId: string,
): Array<{ truck_id: string; van_id: string; category_id: string; prep_secs: number | null; batch_size: number | null; counts_toward_capacity: boolean }> {
  const out: Array<{ truck_id: string; van_id: string; category_id: string; prep_secs: number | null; batch_size: number | null; counts_toward_capacity: boolean }> = []
  if (!sourceRows) return out
  for (const row of sourceRows.values()) {
    out.push({
      truck_id: truckId,
      van_id: targetVanId,
      category_id: row.category_id,
      prep_secs: row.prep_secs ?? null,
      batch_size: row.batch_size ?? null,
      counts_toward_capacity: !!row.counts_toward_capacity,
    })
  }
  return out
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE TRUCK-WIDE READS THE SETTINGS SCREEN NEEDS
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Every per-van category row for one truck, grouped by van.
 *
 * ⚠️ A SEPARATE, PROBED READ — the rule app/api/manage/route.ts states on `get_vans`' named select: a
 * column (or here a table) that may not exist yet belongs in its own read, because one absent name
 * fails the WHOLE statement and would hide every van from its own operator. `ok: false` means the
 * screen shows the per-van controls at the truck defaults and says the setting is unavailable, rather
 * than silently showing wrong numbers.
 */
export async function readVanCategorySettingsForTruck(
  supabase: SupabaseClient,
  truckId: string,
): Promise<{ ok: boolean; byVanId: Map<string, VanCategoryRow[]> }> {
  const byVanId = new Map<string, VanCategoryRow[]>()
  try {
    const { data, error } = await supabase
      .from('van_category_settings')
      .select('van_id, category_id, prep_secs, batch_size, counts_toward_capacity')
      .eq('truck_id', truckId)
    if (error) {
      const code = (error as { code?: string }).code
      console.warn(`[van-category-settings] truck ${truckId}: per-van rows unreadable (${code ?? 'no code'}): ${error.message}; every van shows the truck defaults`)
      return { ok: false, byVanId }
    }
    for (const row of (data ?? []) as Array<VanCategoryRow & { van_id: string }>) {
      if (!row?.van_id || !row?.category_id) continue
      const list = byVanId.get(row.van_id) ?? []
      list.push({
        category_id: row.category_id,
        prep_secs: row.prep_secs ?? null,
        batch_size: row.batch_size ?? null,
        counts_toward_capacity: !!row.counts_toward_capacity,
      })
      byVanId.set(row.van_id, list)
    }
    return { ok: true, byVanId }
  } catch (e) {
    console.warn(`[van-category-settings] truck ${truckId}: per-van rows read threw; every van shows the truck defaults:`, e instanceof Error ? e.message : String(e))
    return { ok: false, byVanId }
  }
}

/**
 * The "Same as Van 1" switch state per van, and `created_at` so the first-van rule can be applied.
 *
 * ⚠️ PROBED AND SEPARATE, for the same reason as above: `same_as_first_van` ships before or after its
 * migration, and `get_vans`' named select must not be able to 42703 on it.
 * 🔴 THIS IS READ FOR THE UI AND FOR THE WRITE FAN-OUT ONLY. No reader on the order path consults it —
 * asserted by the harness, because a read-time indirection through it would put a second van lookup on
 * order acceptance and make turning the switch off a silent behaviour change.
 */
export async function readVanSameAsFirst(
  supabase: SupabaseClient,
  truckId: string,
): Promise<{
  ok: boolean
  byVanId: Map<string, boolean>
  /**
   * 🔴 THE CAPACITY SWITCH, WHICH IS A SECOND, INDEPENDENT FLAG (October 2026). Kitchen capacity
   * moved to Menu › Kitchen capacity with its own switch, so `same_as_first_van` now covers
   * everything EXCEPT capacity and this covers capacity alone. The two were one column; a truck must
   * be able to give Van 2 the same service settings and a smaller kitchen, or the reverse.
   * ⚠️ READ IN THE SAME QUERY, so the pair cannot come from two different reads of one table.
   */
  capacityByVanId: Map<string, boolean>
  createdAt: Map<string, string | null>
}> {
  const byVanId = new Map<string, boolean>()
  const capacityByVanId = new Map<string, boolean>()
  const createdAt = new Map<string, string | null>()
  try {
    const { data, error } = await supabase
      .from('truck_vans')
      .select('id, same_as_first_van, capacity_same_as_first_van, created_at')
      .eq('truck_id', truckId)
    if (error) {
      const code = (error as { code?: string }).code
      console.warn(`[van-category-settings] truck ${truckId}: same_as_first_van unreadable (${code ?? 'no code'}): ${error.message}; every switch reads off`)
      return { ok: false, byVanId, capacityByVanId, createdAt }
    }
    for (const row of (data ?? []) as Array<{ id: string; same_as_first_van?: boolean | null; capacity_same_as_first_van?: boolean | null; created_at?: string | null }>) {
      if (!row?.id) continue
      byVanId.set(row.id, !!row.same_as_first_van)
      /* ⚠️ `undefined` BEFORE THE MIGRATION FALLS BACK TO THE OLD FLAG, not to false. Until 20261010
       * is applied, `same_as_first_van` IS what covers capacity — so reading the capacity switch as
       * off would show "set separately" on a van the operator had set to follow. One deploy order,
       * either way round, and the screen tells the truth in both. */
      capacityByVanId.set(row.id, row.capacity_same_as_first_van ?? !!row.same_as_first_van)
      createdAt.set(row.id, row.created_at ?? null)
    }
    return { ok: true, byVanId, capacityByVanId, createdAt }
  } catch (e) {
    console.warn(`[van-category-settings] truck ${truckId}: same_as_first_van read threw; every switch reads off:`, e instanceof Error ? e.message : String(e))
    return { ok: false, byVanId, capacityByVanId, createdAt }
  }
}
