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
  const failed: { type: 'category' | 'item'; name: string; error: string }[] = []

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
          dietary_info: item.dietary || [],
        })
        .eq('id', existing.id)
      if (reItemErr) {
        console.error('[commit-menu] item reactivate failed', { truck_id: truck.id, name: item.name }, reItemErr.message)
        failed.push({ type: 'item', name: item.name, error: reItemErr.message })
        continue
      }
      inserted++
      continue
    }

    const { data: maxItemSort } = await supabase
      .from('menu_items_db')
      .select('sort_order')
      .eq('category_id', categoryId)
      .order('sort_order', { ascending: false })
      .limit(1)

    const itemSortOrder = (maxItemSort?.[0]?.sort_order ?? 0) + 1

    const { error: itemErr } = await supabase
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
        dietary_info: item.dietary || [],
      })
    if (itemErr) {
      console.error('[commit-menu] item insert failed', { truck_id: truck.id, name: item.name }, itemErr.message)
      failed.push({ type: 'item', name: item.name, error: itemErr.message })
      continue
    }

    inserted++
  }

  return NextResponse.json({ ok: failed.length === 0, inserted, skipped, failed })
}
