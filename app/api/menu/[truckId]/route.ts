// app/api/menu/[truckId]/route.ts
// Supabase-only menu API

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const revalidate = 0  // No cache

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ truckId: string }> }
) {
  const { truckId } = await params
  
  console.log('[MENU API] Looking up truck:', truckId)
  
  // Fetch truck by ID (the truckId param IS the truck ID)
  const { data: truck, error: truckError } = await supabase
    .from('trucks')
    .select('*')
    .eq('id', truckId)
    .eq('active', true)
    .single()

  console.log('[MENU API] Truck found:', truck?.name, 'Error:', truckError)

  if (truckError || !truck) {
    return NextResponse.json({ error: 'Truck not found' }, { status: 404 })
  }

  // Fetch all menu data from Supabase
  const [
    { data: categories, error: catError },
    { data: items, error: itemsError },
    { data: bundles },
    { data: upsellRules },
    { data: codes },
  ] = await Promise.all([
    supabase
      .from('menu_categories')
      .select('name, prep_secs, batch_size')
      .eq('truck_id', truckId)
      .order('sort_order', { ascending: true })
      .order('name'),
    
    supabase
      .from('menu_items_db')
      .select('*, menu_categories!category_id(name)')
      .eq('truck_id', truckId)
      .order('name'),
    
    supabase
      .from('bundles_db')
      .select('*')
      .eq('truck_id', truckId),
    
    supabase
      .from('upsell_rules')
      .select('*')
      .eq('truck_id', truckId),
    
    supabase
      .from('discount_codes_db')
      .select('*')
      .eq('truck_id', truckId)
      .eq('is_active', true),
  ])

  console.log('[MENU API] Query results:')
  console.log('  categories:', categories?.length || 0, catError)
  console.log('  items:', items?.length || 0, itemsError)
  console.log('  items data:', items)
  console.log('  bundles:', bundles?.length || 0)

  // Build menu response
  const menu = {
    categories: (categories || []).map(c => ({
      name: c.name,
      prep_secs: c.prep_secs || 0,
      batch_size: c.batch_size || 1,
    })),
    
    items: (items || []).map(i => ({
      name: i.name,
      description: i.description || '',
      price: i.price,
      category: i.category || (i.menu_categories as any)?.name || 'Uncategorized',
      available: i.is_available,
      stock_remaining: i.stock_count,
    })),
    
    bundles: (bundles || []).map(b => ({
      name: b.name,
      description: b.description || '',
      bundle_price: b.bundle_price,
      original_price: b.original_price,
      slot_1_category: b.slot_1_category,
      slot_2_category: b.slot_2_category,
      slot_3_category: b.slot_3_category,
      slot_4_category: b.slot_4_category,
      slot_5_category: b.slot_5_category,
      slot_6_category: b.slot_6_category,
      start_time: b.start_time,
      end_time: b.end_time,
      available: true,
    })),
    
    upsell_rules: (upsellRules || []).map(r => ({
      trigger_category: r.trigger_category,
      suggest_category: r.suggest_category,
      max_suggestions: r.max_suggestions,
    })),
    
    codes: (codes || []).map(c => ({
      code: c.code,
      type: c.type,
      value: c.value,
    })),
  }

  console.log('[MENU API] Returning menu with', menu.items.length, 'items')

  return NextResponse.json({
    truck: {
      id: truck.id,
      name: truck.name,
      logo: truck.logo_storage_path,
      mode: truck.mode,
      venue_name: truck.venue_name,
    },
    menu,
  })
}