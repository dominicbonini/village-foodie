import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { token, categories, items, categoryPrep } = await req.json()

  const { data: truck } = await supabase
    .from('trucks')
    .select('id')
    .eq('dashboard_token', token)
    .single()

  if (!truck) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

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

  for (const item of items) {
    if (item._skip) { skipped++; continue }

    const categoryId = categoryIdMap[item.category]
    if (!categoryId) continue

    const { data: existing } = await supabase
      .from('menu_items_db')
      .select('id, is_active')
      .eq('truck_id', truck.id)
      .eq('name', item.name)
      .eq('category_id', categoryId)
      .maybeSingle()

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
      if (Array.isArray(item.modifierGroups) && item.modifierGroups.length) committedWithGroups.push({ menu_item_id: existing.id, name: item.name, groups: item.modifierGroups })
      continue
    }

    const { data: maxItemSort } = await supabase
      .from('menu_items_db')
      .select('sort_order')
      .eq('category_id', categoryId)
      .order('sort_order', { ascending: false })
      .limit(1)

    const itemSortOrder = (maxItemSort?.[0]?.sort_order ?? 0) + 1

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
    type GroupAgg = { display: string; isRequired: boolean; singleSelect: boolean; options: Map<string, OptAgg> }
    const registry = new Map<string, GroupAgg>()

    // Pass 1 — aggregate groups + superset of options across committed dishes.
    for (const ci of committedWithGroups) {
      for (const g of ci.groups) {
        if (!g?.name || !Array.isArray(g.options)) continue
        const key = norm(g.name)
        let entry = registry.get(key)
        if (!entry) { entry = { display: String(g.name).trim(), isRequired: false, singleSelect: false, options: new Map() }; registry.set(key, entry) }
        if (g.isRequired === true) entry.isRequired = true
        if (g.singleSelect === true) entry.singleSelect = true
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

  return NextResponse.json({ ok: failed.length === 0, inserted, skipped, failed, groupsCreated, optionsCreated, linksCreated, priceConflicts })
}
