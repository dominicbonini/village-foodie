// lib/menu-commit.ts
// The menu-commit CORE — extracted (V9.x) from app/api/manage/commit-menu/route.ts, which is now a thin
// auth-and-shape wrapper. Same reasoning as lib/menu-extract.ts: the demo provisioner is server-side and
// must not self-fetch a sibling route.
//
// KNOWN CHARACTERISTICS THIS PRESERVES EXACTLY (callers must handle them, see CommitMenuResult):
//  • NOT TRANSACTIONAL — a mid-run failure leaves partial inserts. `ok:false` does NOT mean nothing saved.
//  • An item whose CATEGORY failed to resolve is dropped by `continue` and does NOT appear in `failed[]`,
//    so `inserted + skipped + failed.length` can be LESS than the number of items submitted. The only way
//    to see those losses is to reconcile against the submitted count — which is why the result now
//    carries `submitted` and `unaccounted`.
//  • Re-running is NOT fully idempotent: categories reuse/reactivate and active items skip, but
//    modifier_groups insert unconditionally.

import type { SupabaseClient } from '@supabase/supabase-js'
import { logAllergenChanges, type Actor } from '@/lib/allergen-audit'

export interface CommitMenuFailure {
  type: 'category' | 'item' | 'group' | 'option' | 'link'
  name: string
  error: string
}

export interface CommitMenuResult {
  ok: boolean
  inserted: number
  skipped: number
  failed: CommitMenuFailure[]
  groupsCreated: number
  optionsCreated: number
  linksCreated: number
  priceConflicts: string[]
  /** How many items the caller submitted (excluding _skip). Added by the extraction. */
  submitted: number
  /** submitted - inserted - skipped - item-level failures. >0 means items were SILENTLY dropped,
   *  almost always because their category failed to resolve. Invisible in `failed[]`. */
  unaccounted: number
}

export interface CommitMenuInput {
  categories: string[]
  items: Record<string, any>[]
  categoryPrep?: Record<string, { prep_secs?: number | null; batch_size?: number | null; counts_toward?: boolean }> | null
}

/**
 * Wipe a truck's committed menu so a re-commit REPAIRS instead of APPENDS.
 *
 * commitMenu is neither transactional nor idempotent — a second commit appends. That is correct for the
 * operator "import more items" flow, but wrong for a retry after a PARTIAL commit (the demo→real migration),
 * which must start clean. This lives here, next to commitMenu, because it must delete exactly what commitMenu
 * writes: menu_items_db, modifier_groups (→ cascades modifier_options + item_modifier_groups), and
 * menu_categories. Reconstructing that graph from a caller with partial FK knowledge is how orphans start.
 *
 * ⚠️ DESTRUCTIVE. The HTTP caller (commit-menu route) guards it to trucks still in setup, so it can never
 * wipe a live menu; this function itself trusts its caller and does not re-check.
 *
 * ⚠️ NOTE FOR DEMO-TRUCK RETIREMENT (spec §7 / §10 Phase 4 — NOT built here): the signup menu migration
 * re-commits from demo_sessions.extraction, and demo_sessions.truck_id → trucks is ON DELETE CASCADE, so
 * deleting the demo truck destroys the stored extraction — the retry source — with it. Retirement (and the
 * cleanup sweeps) must NOT delete the demo until the operator's menu is committed onto the real truck, or a
 * failed/re-attempted migration has nothing to fall back to. The cleanup expiry sweep already excludes
 * claimed_by_operator_id for this reason; retirement must uphold the same ordering.
 *
 * modifier_groups and menu_categories are both truck_id-keyed; deleting modifier_groups cascades its
 * options and item links (they have no truck_id).
 *
 * The specific cascade this relies on was VERIFIED AGAINST THE LIVE SCHEMA (2026-07): modifier_options.
 * group_id → modifier_groups is ON DELETE CASCADE, and item_modifier_groups cascades from BOTH parents
 * (modifier_groups via group_id, menu_items_db via menu_item_id). Note this is NOT the same fact as
 * lib/delete-truck.ts's inventory, which establishes trucks → modifier_groups (the truck level) and says
 * nothing about group → option / item → link. An earlier version of this comment conflated the two.
 */
export async function clearMenu(supabase: SupabaseClient, truckId: string): Promise<void> {
  for (const table of ['modifier_groups', 'menu_items_db', 'menu_categories'] as const) {
    const { error } = await supabase.from(table).delete().eq('truck_id', truckId)
    if (error) throw new Error(`clearMenu: ${table} delete failed: ${error.message}`)
  }
}

/**
 * Commit an extracted menu to a truck. Writes menu_categories, menu_items_db, modifier_groups,
 * modifier_options, item_modifier_groups and one allergen_audit_log summary row.
 */
export async function commitMenu(
  supabase: SupabaseClient,
  truck: { id: string },
  input: CommitMenuInput,
  importActor: Actor,
): Promise<CommitMenuResult> {
  const { categories, items, categoryPrep } = input
  // Counted up-front so the caller can detect the silent category-failure drop described above.
  const submitted = (items || []).filter((it) => !it._skip).length

  // Build category ID map from existing categories — INCLUDING soft-deleted rows (no is_active filter)
  // so a same-key dead category is detected. The UNIQUE constraint is `menu_categories_truck_id_slug_key`
  // on (truck_id, slug) (confirmed via catalog probe — NOT on name), so a soft-deleted row still occupies
  // the slug key and a naive INSERT collides (23505). Detection maps key on slug (the constraint) AND
  // name (case-insensitive) so a row found by either is reused/reactivated instead of re-inserted.
  type CatRow = { id: string; name: string; slug: string; is_active: boolean }
  const categoryIdMap: Record<string, string> = {}
  const failed: { type: 'category' | 'item' | 'group' | 'option' | 'link'; name: string; error: string }[] = []

  const { data: existingCats } = await supabase
    .from('menu_categories')
    .select('id, name, slug, is_active')
    .eq('truck_id', truck.id)

  const bySlug = new Map<string, CatRow>()
  const byName = new Map<string, CatRow>()
  for (const cat of (existingCats || []) as CatRow[]) {
    if (cat.is_active) categoryIdMap[cat.name] = cat.id   // active reuse (by name, for item resolution)
    bySlug.set(cat.slug, cat)
    byName.set((cat.name || '').toLowerCase(), cat)
  }

  // Create new categories that don't already exist
  const { data: maxSortData } = await supabase
    .from('menu_categories')
    .select('sort_order')
    .eq('truck_id', truck.id)
    .order('sort_order', { ascending: false })
    .limit(1)

  let sortOrder = (maxSortData?.[0]?.sort_order ?? 0) + 1

  for (const catName of categories) {
    if (categoryIdMap[catName]) continue   // (a) already resolved to an ACTIVE row by name → reuse

    const slug = catName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const prep = categoryPrep?.[catName]
    const existing = bySlug.get(slug) || byName.get(catName.toLowerCase())

    if (existing && existing.is_active) {
      // (a') ACTIVE row matches by slug under a different name-key → reuse it (avoid a slug-dup INSERT).
      categoryIdMap[catName] = existing.id
      continue
    }

    if (existing && !existing.is_active) {
      // (b) SOFT-DELETED same-key row → REACTIVATE + reuse its id; do NOT insert a new row (that's the
      // collision). Touches ONLY the category row — its old inactive items are NOT resurrected here.
      const { error: reErr } = await supabase
        .from('menu_categories')
        .update({
          is_active: true,
          name: catName,
          slug,
          prep_secs: prep?.prep_secs ?? 0,
          batch_size: prep?.batch_size ?? 0,
          // Deferred counts-toward write (mirrors the import kitchen step): cooked (prep>0) always counts;
          // instant carries the operator's tick. Default false.
          counts_toward_capacity: (prep?.prep_secs ?? 0) > 0 ? true : !!prep?.counts_toward,
        })
        .eq('id', existing.id)
      if (reErr) {
        console.error('[commit-menu] category reactivate failed', { truck_id: truck.id, name: catName }, reErr.message)
        failed.push({ type: 'category', name: catName, error: reErr.message })
        continue
      }
      categoryIdMap[catName] = existing.id
      continue
    }

    // (c) no same-key row → INSERT new
    const { data: newCat, error: insErr } = await supabase
      .from('menu_categories')
      .insert({
        truck_id: truck.id,
        name: catName,
        slug,
        prep_secs: prep?.prep_secs ?? 0,
        batch_size: prep?.batch_size ?? 0,
        counts_toward_capacity: (prep?.prep_secs ?? 0) > 0 ? true : !!prep?.counts_toward,
        allow_notes: false,
        sort_order: sortOrder++,
        is_active: true,
      })
      .select('id')
      .single()
    if (insErr) {
      console.error('[commit-menu] category insert failed', { truck_id: truck.id, name: catName }, insErr.message)
      failed.push({ type: 'category', name: catName, error: insErr.message })
      continue
    }
    if (newCat) categoryIdMap[catName] = newCat.id
  }

  // Insert items
  let inserted = 0
  let skipped = 0
  // §63: items that committed (inserted/reactivated) AND carry AI-extracted modifierGroups — collected
  // here with their resolved menu_item_id, then turned into modifier_groups/options/links AFTER the
  // item loop (links need the item ids). Category-skipped items never reach here → their groups can't
  // orphan. Truck-scoped throughout.
  const committedWithGroups: { menu_item_id: string; name: string; groups: any[] }[] = []

  // ── BATCHED PRE-READS (perf) ───────────────────────────────────────────────────────────────────────
  // Two of the three per-item round trips are reads that don't depend on any per-item write, so they are
  // hoisted OUT of the loop into one read each and resolved in memory below. The INSERTS stay per-row
  // (a per-row insert fails alone into failed[]; a batched insert would fail wholesale — see §submitted).
  //
  // 🔴 BYTE-IDENTICAL contract — how each in-memory structure reproduces the query it replaces:
  //  • existingByKey replaces the per-item `.eq('truck_id').eq('name').eq('category_id').maybeSingle()`
  //    (an EXACT name+category match). maybeSingle() returns null for 0 OR ≥2 matches, so a key with ≥2
  //    rows is stored as 'MULTIPLE' and resolves to "not found" (→ insert path), exactly as today. The map
  //    is kept LIVE through the loop (updated on every insert/reactivate) so a duplicate (name, category)
  //    LATER in the same payload is seen as present — reproducing the per-item DB re-read's visibility of
  //    rows committed earlier in the loop.
  //  • maxSortByCat replaces the per-item `.eq('category_id').order('sort_order' desc).limit(1)` + `?? 0`,
  //    which was re-queried per item so each insert saw the prior insert's row. Reproduced by seeding the
  //    per-category max once and incrementing IN MEMORY per insert. Exact for non-null sort_order (verified
  //    live invariant: 0 rows null, and commitMenu is the only writer — always non-null).
  type ExistingRow = { id: string; is_active: boolean }
  const existingByKey = new Map<string, ExistingRow | 'MULTIPLE'>()
  // Separator is the ESCAPE SEQUENCE '\u0000', six ASCII characters in the source -- NOT a change of
  // separator. It evaluates to the SAME U+0000 the literal produced, so every key this builds is
  // byte-identical; only the source encoding moved.
  // It was a literal NUL byte until 14 August 2026, which made `file` report this .ts as `data` and
  // made grep skip the file entirely -- every search of it silently returned nothing, which reads the
  // same as 'no matches'. tsc compiled it happily throughout, which is exactly why it went unnoticed.
  // Keep it escaped. U+0000 is deliberate as the separator and must not be swapped for a printable
  // character: it is the one byte that cannot occur in a name or a category id, so it cannot collide.
  const keyOf = (name: string, categoryId: string) => `${name}\u0000${categoryId}`
  const liveNames = [...new Set(items.filter(it => !it._skip).map(it => it.name))]
  if (liveNames.length > 0) {
    const { data: existingItems } = await supabase
      .from('menu_items_db')
      .select('id, is_active, name, category_id')
      .eq('truck_id', truck.id)
      .in('name', liveNames)
    for (const row of (existingItems || []) as { id: string; is_active: boolean; name: string; category_id: string }[]) {
      const k = keyOf(row.name, row.category_id)
      existingByKey.set(k, existingByKey.has(k) ? 'MULTIPLE' : { id: row.id, is_active: row.is_active })
    }
  }

  const maxSortByCat = new Map<string, number>()
  const catIdsForInserts = [...new Set(Object.values(categoryIdMap))]
  if (catIdsForInserts.length > 0) {
    const { data: sortRows } = await supabase
      .from('menu_items_db')
      .select('category_id, sort_order')
      .in('category_id', catIdsForInserts)
    for (const r of (sortRows || []) as { category_id: string; sort_order: number | null }[]) {
      const so = typeof r.sort_order === 'number' ? r.sort_order : 0
      if (so > (maxSortByCat.get(r.category_id) ?? 0)) maxSortByCat.set(r.category_id, so)
    }
  }

  for (const item of items) {
    if (item._skip) { skipped++; continue }

    const categoryId = categoryIdMap[item.category]
    if (!categoryId) continue

    // In-memory equivalent of the old per-item .maybeSingle() (see BATCHED PRE-READS). 'MULTIPLE' → null,
    // matching maybeSingle()'s "≥2 rows returns null" so the item takes the insert path exactly as today.
    const key = keyOf(item.name, categoryId)
    const hit = existingByKey.get(key)
    const existing: ExistingRow | null = hit && hit !== 'MULTIPLE' ? hit : null

    if (existing && existing.is_active) { skipped++; continue }   // already present & active

    if (existing && !existing.is_active) {
      // Soft-deleted same-name item being RE-IMPORTED into this (possibly reactivated) category →
      // REACTIVATE it (don't insert a duplicate, which would also collide on any item unique key).
      // Items NOT in this import are never visited, so they stay inactive — no side-effect resurrection.
      const { error: reItemErr } = await supabase
        .from('menu_items_db')
        .update({
          is_active: true,
          is_available: true,
          price: item.price,
          description: item.description || null,
          allergens: item.allergens || [],
          // The import wizard no longer verifies allergens (the allergen step was removed). allergens
          // stays a non-null array (the AI's detections); verified is true ONLY if explicitly confirmed
          // (_allergensChecked) — which the wizard never sets now → every imported item commits
          // verified=false and is flagged "allergens not set" in manage until reviewed in Settings.
          allergens_verified: (item._allergensChecked === true),
          dietary_info: item.dietary || [],
          spiciness: item.spiciness ?? null,
          auto_accept: item.auto_accept ?? true,
        })
        .eq('id', existing.id)
      if (reItemErr) {
        console.error('[commit-menu] item reactivate failed', { truck_id: truck.id, name: item.name }, reItemErr.message)
        failed.push({ type: 'item', name: item.name, error: reItemErr.message })
        continue
      }
      inserted++
      // Live-map sync: a later duplicate (name, category) in THIS payload must now see it active — the
      // per-item DB re-read did. (This branch is only reached for a single existing row, never MULTIPLE.)
      existingByKey.set(key, { id: existing.id, is_active: true })
      if (Array.isArray(item.modifierGroups) && item.modifierGroups.length) committedWithGroups.push({ menu_item_id: existing.id, name: item.name, groups: item.modifierGroups })
      continue
    }

    // In-memory equivalent of the old per-item max-sort re-query (see BATCHED PRE-READS): seeded once per
    // category, incremented per insert. Same start value and +1 step as `(max ?? 0) + 1`, so the emitted
    // sort_order sequence per category is identical (fresh category → 1,2,3; existing max M → M+1,M+2,…).
    const itemSortOrder = (maxSortByCat.get(categoryId) ?? 0) + 1
    maxSortByCat.set(categoryId, itemSortOrder)

    const { data: insItem, error: itemErr } = await supabase
      .from('menu_items_db')
      .insert({
        truck_id: truck.id,
        name: item.name,
        description: item.description || null,
        price: item.price,
        category_id: categoryId,
        is_available: true,
        sort_order: itemSortOrder,
        allergens: item.allergens || [],
        allergens_verified: (item._allergensChecked === true),   // wizard no longer verifies → always false on import → "allergens not set" flag in manage
        dietary_info: item.dietary || [],
        spiciness: item.spiciness ?? null,
        auto_accept: item.auto_accept ?? true,
      })
      .select('id').single()
    if (itemErr || !insItem) {
      console.error('[commit-menu] item insert failed', { truck_id: truck.id, name: item.name }, itemErr?.message)
      failed.push({ type: 'item', name: item.name, error: itemErr?.message || 'insert failed' })
      continue
    }

    inserted++
    // Live-map sync (same reason as the reactivate branch): a later duplicate in THIS payload must see the
    // row we just inserted. Skip when the key was 'MULTIPLE' — that must stay "not found" like maybeSingle.
    if (existingByKey.get(key) !== 'MULTIPLE') existingByKey.set(key, { id: insItem.id, is_active: true })
    if (Array.isArray(item.modifierGroups) && item.modifierGroups.length) committedWithGroups.push({ menu_item_id: insItem.id, name: item.name, groups: item.modifierGroups })
  }

  // ── §63: CREATE CUSTOM EXTRAS from the AI-extracted, operator-reviewed modifierGroups ──────────────
  // Dedupe by NORMALISED group name → ONE modifier_groups row + the SUPERSET of options (union by
  // normalised option name) across every dish carrying that name. Each dish links via
  // item_modifier_groups with excluded_option_ids = the superset options this dish does NOT carry (§59),
  // so a dish shows only its own options. Caps: singleSelect→max 1, else 99 (NO choose-up-to-N inference
  // — N is manual). is_required: ANY carrying dish marking it required → required (the operator already
  // reviewed each group's Required toggle; this merges those). Per-option allergens/dietary the AI
  // extracted are written (previously dropped). Allergen→dish linking is unchanged (per-item only, §26a
  // gate) — NOT touched here.
  let groupsCreated = 0, optionsCreated = 0, linksCreated = 0
  const priceConflicts: string[] = []
  if (committedWithGroups.length > 0) {
    const norm = (s: string) => String(s).trim().toLowerCase()
    type OptAgg = { name: string; price: number; allergens: string[]; dietary: string[]; order: number }
    type GroupAgg = { display: string; isRequired: boolean; singleSelect: boolean; inferred: boolean; options: Map<string, OptAgg> }
    const registry = new Map<string, GroupAgg>()

    // Pass 1 — aggregate groups + superset of options across committed dishes.
    for (const ci of committedWithGroups) {
      for (const g of ci.groups) {
        if (!g?.name || !Array.isArray(g.options)) continue
        const key = norm(g.name)
        let entry = registry.get(key)
        if (!entry) { entry = { display: String(g.name).trim(), isRequired: false, singleSelect: false, inferred: false, options: new Map() }; registry.set(key, entry) }
        if (g.isRequired === true) entry.isRequired = true
        if (g.singleSelect === true) entry.singleSelect = true
        // _inferredFromVariants → hide_name: customers see "Choose an option", not the internal
        // "Category - Name N". Set by the import grouping pass (makeGroupingRow); never on manual groups.
        if (g._inferredFromVariants === true) entry.inferred = true
        for (const o of g.options) {
          if (!o?.name) continue
          const ok = norm(o.name)
          const price = typeof o.price === 'number' ? o.price : 0
          const existingOpt = entry.options.get(ok)
          if (!existingOpt) {
            entry.options.set(ok, { name: String(o.name).trim(), price, allergens: Array.isArray(o.allergens) ? o.allergens : [], dietary: Array.isArray(o.dietary) ? o.dietary : [], order: entry.options.size })
          } else if (existingOpt.price !== price) {
            // Same option name, different delta across dishes → keep FIRST-seen; per-dish pricing isn't
            // modelled (operator adjusts after import). Flag it.
            priceConflicts.push(`${entry.display}/${existingOpt.name}`)
          }
        }
      }
    }

    // Pass 2 — create one group + its superset options; remember the option ids per (group, optName).
    const groupIdByName = new Map<string, string>()
    const optionIdByGroupOpt = new Map<string, Map<string, string>>()
    for (const [key, entry] of registry) {
      const { data: grp, error: gErr } = await supabase.from('modifier_groups').insert({
        truck_id: truck.id,
        name: entry.display,
        is_required: entry.isRequired,
        min_choices: entry.isRequired ? 1 : 0,
        max_choices: entry.singleSelect ? 1 : 99,
        hide_name: entry.inferred,
      }).select('id').single()
      if (gErr || !grp) { failed.push({ type: 'group', name: entry.display, error: gErr?.message || 'group insert failed' }); continue }
      groupsCreated++
      groupIdByName.set(key, grp.id)
      const optMap = new Map<string, string>()
      for (const o of [...entry.options.values()].sort((a, b) => a.order - b.order)) {
        const { data: opt, error: oErr } = await supabase.from('modifier_options').insert({
          group_id: grp.id, name: o.name, price_adjustment: o.price, type: 'add',
          sort_order: o.order, allergens: o.allergens, dietary_info: o.dietary, available: true, stock_count: null,
        }).select('id').single()
        if (oErr || !opt) { failed.push({ type: 'option', name: `${entry.display}/${o.name}`, error: oErr?.message || 'option insert failed' }); continue }
        optionsCreated++
        optMap.set(norm(o.name), opt.id)
      }
      optionIdByGroupOpt.set(key, optMap)
    }

    // Pass 3 — link each dish to each group it carries; exclude (per §59) the superset options the dish
    // does NOT carry, so it shows only its own. Skip cleanly if the group creation failed (no orphans).
    for (const ci of committedWithGroups) {
      for (const g of ci.groups) {
        if (!g?.name || !Array.isArray(g.options)) continue
        const key = norm(g.name)
        const groupId = groupIdByName.get(key)
        const optMap = optionIdByGroupOpt.get(key)
        if (!groupId || !optMap) continue
        const dishOpts = new Set(g.options.filter((o: any) => o?.name).map((o: any) => norm(o.name)))
        const excluded: string[] = []
        for (const [optName, optId] of optMap) { if (!dishOpts.has(optName)) excluded.push(optId) }
        const { error: lErr } = await supabase.from('item_modifier_groups').insert({
          menu_item_id: ci.menu_item_id, group_id: groupId, excluded_option_ids: excluded,
        })
        if (lErr) failed.push({ type: 'link', name: `${ci.name} ↔ ${g.name}`, error: lErr.message })
        else linksCreated++
      }
    }
  }

  // (A) Append-only import-summary audit row — records that allergens were STAGED unverified on import
  // (never customer-visible until a gated wizard confirm). One row per import keeps the log clean.
  await logAllergenChanges(supabase, [{
    ...importActor, truck_id: truck.id, item_id: null, change_type: 'import', field: 'allergens',
    old_value: null, new_value: JSON.stringify({ items_imported: inserted, allergens_verified: false }),
  }])


  // RECONCILIATION (added by the extraction, not present in the original route): items lost to a failed
  // category never reach `failed[]`, so without this a caller cannot tell a clean import from one that
  // quietly dropped half the menu.
  const itemFailures = failed.filter(f => f.type === 'item').length
  const unaccounted = Math.max(0, submitted - inserted - skipped - itemFailures)
  if (unaccounted > 0) {
    console.warn(`[menu-commit] ${unaccounted} item(s) silently dropped for truck ${truck.id} — almost certainly a failed category`)
  }

  return { ok: failed.length === 0, inserted, skipped, failed, groupsCreated, optionsCreated, linksCreated, priceConflicts, submitted, unaccounted }
}
