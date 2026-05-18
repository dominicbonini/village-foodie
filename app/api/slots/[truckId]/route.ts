// app/api/slots/[truckId]/route.ts
// Returns available collection slots for a truck on a given date
// Accounts for: slot capacity, past times, AND prep time based on queue

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCatConfig, catCookSecs, calcMinReadyMins, type CatConfig } from '@/lib/prep-utils'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const revalidate = 0

export async function GET(req: NextRequest, { params }: { params: Promise<{ truckId: string }> }) {
  const { truckId } = await params
  const date = req.nextUrl.searchParams.get('date') || new Date().toISOString().split('T')[0]

  // Fetch everything in parallel
  const [
    { data: times },
    { data: capacities },
    { data: existingOrders },
    { data: categories },
    { data: menuItems },
  ] = await Promise.all([
    supabase
      .from('collection_times')
      .select('collection_time, production_slot')
      .eq('truck_id', truckId)
      .order('collection_time', { ascending: true }),

    supabase
      .from('slot_capacity')
      .select('slot, max_orders')
      .eq('truck_id', truckId)
      .eq('event_date', date),

    supabase
      .from('orders')
      .select('slot, items')
      .eq('truck_id', truckId)
      .eq('event_date', date)
      .in('status', ['pending', 'confirmed', 'modified']),

    supabase
      .from('menu_categories')
      .select('id, name, prep_secs, batch_size')
      .eq('truck_id', truckId),

    supabase
      .from('menu_items_db')
      .select('name, category_id')
      .eq('truck_id', truckId),
  ])

  if (!times || times.length === 0) {
    return NextResponse.json({ slots: [] })
  }

  // ── Build category config map ─────────────────────────────────────────────
  const catConfigs: Record<string, CatConfig> = {}
  ;(categories || []).forEach(c => {
    catConfigs[c.name.toLowerCase()] = {
      secs: c.prep_secs || 240,
      batch: c.batch_size || 2,
    }
  })

  // ── Build item → category name map ───────────────────────────────────────
  const itemCatMap: Record<string, string> = {}
  ;(menuItems || []).forEach(item => {
    const cat = categories?.find(c => c.id === item.category_id)
    if (cat) itemCatMap[item.name] = cat.name
  })

  // ── Count queue items by category from existing orders ───────────────────
  const queueByCat: Record<string, number> = {}
  ;(existingOrders || []).forEach(order => {
    const items = Array.isArray(order.items) ? order.items : []
    items.forEach((item: { name: string; quantity: number }) => {
      const cat = itemCatMap[item.name] || 'mains'
      queueByCat[cat] = (queueByCat[cat] || 0) + (item.quantity || 1)
    })
  })

  // ── Calculate minimum ready time ─────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0]
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes()
  const minReadyMins = date === today ? calcMinReadyMins(queueByCat, catConfigs) : 0
  const earliestCollectionMins = nowMins + minReadyMins

  // ── Build capacity maps ───────────────────────────────────────────────────
  const capacityMap = Object.fromEntries(
    (capacities || []).map(c => [c.slot, c.max_orders])
  )
  const slotCounts: Record<string, number> = {}
  ;(existingOrders || []).forEach(o => {
    if (o.slot) slotCounts[o.slot] = (slotCounts[o.slot] || 0) + 1
  })

  const SOFT_CAP_RATIO = 0.85

  // ── Build slot list ───────────────────────────────────────────────────────
  const slots = times.map(s => {
    const maxOrders = capacityMap[s.production_slot] || 999
    const currentOrders = slotCounts[s.collection_time] || 0
    const softMax = Math.max(1, Math.floor(maxOrders * SOFT_CAP_RATIO))
    const capacityAvailable = currentOrders < softMax
    const remaining = Math.max(0, softMax - currentOrders)

    const [h, m] = s.collection_time.split(':').map(Number)
    const slotMins = h * 60 + m

    // Past: slot is in the past (with 5 min buffer)
    const isPast = date === today && slotMins <= nowMins + 5

    // Too soon: slot doesn't allow enough time for current queue
    const tooSoon = date === today && slotMins < earliestCollectionMins

    return {
      collection_time: s.collection_time,
      production_slot: s.production_slot,
      current_orders: currentOrders,
      max_orders: maxOrders,
      soft_max: softMax,
      remaining,
      available: capacityAvailable && !isPast && !tooSoon,
      is_past: isPast || tooSoon, // treat "too soon" same as past in UI
    }
  })

  return NextResponse.json({ slots, queueByCat, catConfigs })
}