// app/api/slots/[truckId]/route.ts
// Returns available collection slots for a truck on a given date
// Accounts for: slot capacity, past times, AND prep time based on queue

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCatConfig, calcMinReadyMins, type CatConfig } from '@/lib/prep-utils'
import { getBatchCountsByCollectionTime } from '@/lib/slot-bookings'
import { buildSlotAvailability } from '@/lib/slot-availability'
import { generateCollectionTimes } from '@/lib/slot-generation'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const revalidate = 0

/** Normalise dd/mm/yyyy or yyyy-mm-dd to yyyy-mm-dd for Supabase. */
function normalizeEventDate(raw: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) {
    const [, d, mo, y] = m
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return new Date().toISOString().split('T')[0]
}

interface TruckRow {
  id: string
  extra_wait_mins: number
  extra_wait_started_at: string | null
  collection_interval_mins: number | null
  slot_duration_mins: number | null
}

async function resolveTruck(truckIdOrSlug: string): Promise<TruckRow | null> {
  const cols = 'id, extra_wait_mins, extra_wait_started_at, collection_interval_mins, slot_duration_mins'
  const bySlug = await supabase.from('trucks').select(cols).eq('slug', truckIdOrSlug).single()
  if (bySlug.data) return bySlug.data as TruckRow
  const byId = await supabase.from('trucks').select(cols).eq('id', truckIdOrSlug).single()
  return (byId.data ?? null) as TruckRow | null
}

function effectiveExtraWaitMins(mins: number, startedAt: string | null): number {
  if (!mins || !startedAt) return 0
  const elapsed = (Date.now() - new Date(startedAt).getTime()) / 60000
  return Math.max(0, Math.ceil(mins - elapsed))
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ truckId: string }> }) {
  const { truckId: truckIdParam } = await params
  const rawDate = req.nextUrl.searchParams.get('date') || new Date().toISOString().split('T')[0]
  const date = normalizeEventDate(rawDate)
  const paramStart = req.nextUrl.searchParams.get('start') || null
  const paramEnd   = req.nextUrl.searchParams.get('end')   || null

  const truck = await resolveTruck(truckIdParam)
  if (!truck) {
    return NextResponse.json({ error: 'Truck not found' }, { status: 404 })
  }
  const truckId = truck.id
  const extraWaitMins = effectiveExtraWaitMins(truck.extra_wait_mins ?? 0, truck.extra_wait_started_at ?? null)

  // Fetch everything in parallel
  const [
    { data: staticTimes },
    { data: capacities },
    { data: existingOrders },
    { data: categories },
    { data: menuItems },
    { data: todayEvent },
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
      .select('items')
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

    // Today's event for dynamic slot generation
    supabase
      .from('truck_events')
      .select('start_time, end_time')
      .eq('truck_id', truckId)
      .eq('event_date', date)
      .neq('is_cancelled', true)
      .maybeSingle(),
  ])

  // Use dynamically generated times: prefer truck_events row, fall back to caller-supplied
  // start/end params (e.g. from Google Sheets), then static collection_times table
  const intervalMins = truck.collection_interval_mins ?? 0
  const slotDurationMins = truck.slot_duration_mins ?? intervalMins
  const eventStart = todayEvent?.start_time || paramStart
  const eventEnd   = todayEvent?.end_time   || paramEnd
  const GRACE_MINS = 30
  const times =
    eventStart && eventEnd && intervalMins > 0
      ? generateCollectionTimes(eventStart, eventEnd, intervalMins, slotDurationMins, GRACE_MINS)
      : (staticTimes ?? [])

  // ── Build category config map (always needed for ASAP calculation) ────────
  const catConfigs: Record<string, CatConfig> = {}
  ;(categories || []).forEach(c => {
    catConfigs[c.name.toLowerCase()] = {
      secs: c.prep_secs || 0,
      batch: c.batch_size || 1,
    }
  })

  // ── Build item → category name map ───────────────────────────────────────
  const itemCatMap: Record<string, string> = {}
  ;(menuItems || []).forEach(item => {
    const cat = categories?.find(c => c.id === item.category_id)
    if (cat) itemCatMap[item.name] = cat.name.toLowerCase()
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

  if (!times || times.length === 0) {
    return NextResponse.json({ slots: [], catConfigs, queueByCat })
  }

  // ── Calculate minimum ready time ─────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0]
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes()
  const minReadyMins = date === today ? calcMinReadyMins(queueByCat, catConfigs) : 0

  // Customers cannot book slots before the event start time
  const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  const eventStartMins = eventStart ? toMins(eventStart) : 0
  const eventEndMins = eventEnd ? toMins(eventEnd) : undefined
  const earliestCollectionMins = Math.max(nowMins + minReadyMins + extraWaitMins, eventStartMins)

  // ── Build capacity maps ───────────────────────────────────────────────────
  const capacityMap = Object.fromEntries(
    (capacities || []).map(c => [c.slot, c.max_orders])
  )
  const slotCounts = await getBatchCountsByCollectionTime(supabase, truckId, date, times, catConfigs)

  const slots = buildSlotAvailability({
    times,
    capacityMap,
    slotCounts,
    date,
    nowMins,
    earliestCollectionMins,
    eventEndMins,
  })

  return NextResponse.json({ slots, queueByCat, catConfigs })
}