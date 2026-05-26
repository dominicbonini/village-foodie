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

  // Build category ID map from existing categories
  const categoryIdMap: Record<string, string> = {}

  const { data: existingCats } = await supabase
    .from('menu_categories')
    .select('id, name')
    .eq('truck_id', truck.id)
    .eq('is_active', true)

  for (const cat of existingCats || []) {
    categoryIdMap[cat.name] = cat.id
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
    if (categoryIdMap[catName]) continue

    const slug = catName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const prep = categoryPrep?.[catName]
    const { data: newCat } = await supabase
      .from('menu_categories')
      .insert({
        truck_id: truck.id,
        name: catName,
        slug,
        prep_secs: prep?.prep_secs ?? 0,
        batch_size: prep?.batch_size ?? 999,
        allow_notes: false,
        sort_order: sortOrder++,
        is_active: true,
      })
      .select('id')
      .single()

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
      .select('id')
      .eq('truck_id', truck.id)
      .eq('name', item.name)
      .eq('category_id', categoryId)
      .maybeSingle()

    if (existing) { skipped++; continue }

    const { data: maxItemSort } = await supabase
      .from('menu_items_db')
      .select('sort_order')
      .eq('category_id', categoryId)
      .order('sort_order', { ascending: false })
      .limit(1)

    const itemSortOrder = (maxItemSort?.[0]?.sort_order ?? 0) + 1

    await supabase
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

    inserted++
  }

  return NextResponse.json({ ok: true, inserted, skipped })
}
