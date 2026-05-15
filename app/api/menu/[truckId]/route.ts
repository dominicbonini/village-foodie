// app/api/menu/[truckId]/route.ts
// Supabase-only menu API — looks up by slug (not ID)

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const revalidate = 0  // No cache — sold out changes must propagate immediately

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ truckId: string }> }
) {
  const { truckId: slugOrId } = await params
  
  // The parameter is called truckId but it's actually a slug (like "pizzeria-gusto")
  // Look up truck by ID first, then fall back to slug
  let truck = null
  
  // Try by ID first
  const { data: byId } = await supabase
    .from('trucks')
    .select('*')
    .eq('id', slugOrId)
    .eq('active', true)
    .single()
  
  if (byId) {
    truck = byId
  } else {
    // Fall back to slug lookup
    const { data: bySlug } = await supabase
      .from('trucks')
      .select('*')
      .eq('slug', slugOrId)
      .eq('active', true)
      .single()
    
    truck = bySlug
  }

  if (!truck) {
    return NextResponse.json({ error: 'Truck not found' }, { status: 404 })
  }

  // Fetch all menu data from Supabase using the actual truck ID
  const truckId = truck.id
  
  const [
    { data: categories },
    { data: items },
    { data: bundles },
    { data: upsellRules },
    { data: codes },
  ] = await Promise.all([
    supabase
      .from('categories')
      .select('name, prep_secs, batch_size')
      .eq('truck_id', truckId)
      .order('name'),
    
    supabase
      .from('menu_items_db')
      .select('*, categories!category_id(name)')
      .eq('truck_id', truckId)
      .order('name'),
    
    supabase
      .from('bundles')
      .select('*')
      .eq('truck_id', truckId),
    
    supabase
      .from('upsell_rules')
      .select('*')
      .eq('truck_id', truckId),
    
    supabase
      .from('discount_codes')
      .select('*')
      .eq('truck_id', truckId)
      .eq('is_active', true),
  ])

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
      category: i.category || (i.categories as any)?.name || 'Uncategorized',
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