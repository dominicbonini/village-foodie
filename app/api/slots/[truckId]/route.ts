// app/api/slots/[truckId]/route.ts
// Returns available collection slots for a truck on a given date
// Accounts for: slot capacity, past times, AND prep time based on queue

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCatConfig, calcMinReadyMins, type CatConfig } from '@/lib/prep-utils'
import { getProductionSlotUnits } from '@/lib/slot-bookings'
import { buildSlotAvailability } from '@/lib/slot-availability'
import { generateCollectionTimes } from '@/lib/slot-generation'
import { getNowMinsInTz, getLocalDateInTz } from '@/lib/time-utils'

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
  const cols = 'id, collection_interval_mins, slot_duration_mins' // extra-wait is now event-scoped
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
  const eventIdParam = req.nextUrl.searchParams.get('event_id')

  const truck = await resolveTruck(truckIdParam)
  if (!truck) {
    return NextResponse.json({ error: 'Truck not found' }, { status: 404 })
  }
  const truckId = truck.id

  // Resolve THE event for this slot view (re-key fix): prefer the explicit event_id the
  // customer page passes (event.id). Fall back to the sole non-cancelled event on the
  // date — warning on an ambiguous date so a two-same-date-event truck doesn't project
  // the wrong event. The resolved id scopes the production-usage read below.
  type EventRow = { id: string; start_time: string | null; end_time: string | null; van_id: string | null; extra_wait_mins: number | null; extra_wait_started_at: string | null }
  let todayEvent: EventRow | null = null
  if (eventIdParam) {
    const { data } = await supabase
      .from('truck_events')
      .select('id, start_time, end_time, van_id, extra_wait_mins, extra_wait_started_at')
      .eq('truck_id', truckId)
      .eq('id', eventIdParam)
      .maybeSingle()
    todayEvent = (data as EventRow) ?? null
    if (!todayEvent) console.warn(`[slots] event_id ${eventIdParam} not found for truck ${truckId} — date fallback`)
  }
  if (!todayEvent) {
    const { data, count } = await supabase
      .from('truck_events')
      .select('id, start_time, end_time, van_id, extra_wait_mins, extra_wait_started_at', { count: 'exact' })
      .eq('truck_id', truckId)
      .eq('event_date', date)
      .neq('status', 'cancelled')
      .order('start_time', { ascending: true })
      .limit(1)
    todayEvent = (data?.[0] as EventRow) ?? null
    if (!eventIdParam && (count ?? 0) > 1) {
      console.warn(`[slots] ${count} events on ${date} for truck ${truckId} and no event_id — using earliest (${todayEvent?.id})`)
    }
  }
  // EVENT-scoped extra-wait (was truck.extra_wait_*).
  const extraWaitMins = effectiveExtraWaitMins(todayEvent?.extra_wait_mins ?? 0, todayEvent?.extra_wait_started_at ?? null)

  // Queue read for queueByCat: scope to the SAME resolved event as the units read
  // below (getProductionSlotUnits(todayEvent.id)), never the date's pooled orders.
  // The event_id eq also excludes null-event rows. No event resolved (param
  // start/end legacy path) → fall back to date scope, mirroring the units read ({}).
  let existingOrdersQuery = supabase
    .from('orders')
    .select('items')
    .eq('truck_id', truckId)
    .in('status', ['pending', 'confirmed', 'modified'])
  existingOrdersQuery = todayEvent?.id
    ? existingOrdersQuery.eq('event_id', todayEvent.id)
    : existingOrdersQuery.eq('event_date', date)

  // Fetch everything else in parallel
  const [
    { data: staticTimes },
    { data: existingOrders },
    { data: categories },
    { data: menuItems },
  ] = await Promise.all([
    supabase
      .from('collection_times')
      .select('collection_time, production_slot')
      .eq('truck_id', truckId)
      .order('collection_time', { ascending: true }),

    existingOrdersQuery,

    supabase
      .from('menu_categories')
      .select('id, name, prep_secs, batch_size, counts_toward_capacity')
      .eq('truck_id', truckId),

    supabase
      .from('menu_items_db')
      .select('name, category_id')
      .eq('truck_id', truckId),
  ])

  // Use dynamically generated times: prefer truck_events row, fall back to caller-supplied
  // start/end params (e.g. from Google Sheets), then static collection_times table
  const intervalMins = truck.collection_interval_mins ?? 0
  const slotDurationMins = truck.slot_duration_mins ?? intervalMins
  const eventStart = todayEvent?.start_time || paramStart
  const eventEnd   = todayEvent?.end_time   || paramEnd
  const GRACE_MINS = 30
  const rawTimes =
    eventStart && eventEnd && intervalMins > 0
      ? generateCollectionTimes(eventStart, eventEnd, intervalMins, slotDurationMins, GRACE_MINS)
      : (staticTimes ?? [])

  // WINDOW-KEY MAP: collection_time → production_slot from the static collection_times table — the
  // EXACT source the WRITE keys production_slot_usage by (slot-bookings.ts fetchCollectionTimeMap).
  // Pre-resolve the per-slot window key here (= timeMap[ct] || ct) so the day-load dots read the SAME
  // key the write stored under. Empty collection_times ⇒ empty map ⇒ key degenerates to ct (= write key).
  const timeMap: Record<string, string> = {}
  ;(staticTimes ?? []).forEach(r => { timeMap[r.collection_time] = r.production_slot })
  const times = rawTimes.map(t => ({
    ...t,
    production_window_key: timeMap[t.collection_time] || t.collection_time,
  }))

  // ── Build category config map (always needed for ASAP calculation) ────────
  const catConfigs: Record<string, CatConfig> = {}
  ;(categories || []).forEach(c => {
    catConfigs[c.name.toLowerCase()] = {
      secs: c.prep_secs || 0,
      batch: c.batch_size || 1,
      countsToCapacity: !!c.counts_toward_capacity,
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
  // EVENT timezone (hardcoded 'Europe/London' for now — replaced by trucks.timezone later). now/today
  // run in this tz, NOT the server's (UTC on Vercel) — otherwise in BST the server is an hour behind
  // and wrongly marks a just-passed slot as still available. The client reads `tz` from the response
  // and derives `isSlotPast` live in the same tz, so server + every client agree.
  const eventTz = 'Europe/London'
  const today = getLocalDateInTz(eventTz)
  const nowMins = getNowMinsInTz(eventTz)

  // Customers cannot book slots before the event start time
  const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  const eventStartMins = eventStart ? toMins(eventStart) : 0
  const eventEndMins = eventEnd ? toMins(eventEnd) : undefined
  // Slot TIME floor — capacity is now per-window via fitOrderBackward (backward model), NOT a
  // front-of-queue cumulative push. So the floor is purely:
  //   - never before event start (eventStartMins), and
  //   - today only: not before now + minimal prep + operator extra-wait (the "don't offer a
  //     past/too-soon-TODAY slot" guard that fitOrderBackward has no "now" awareness for).
  // The old `eventStartMins + queuePushMins` term added the existing queue's cumulative
  // pre-prep push (a retired-(b) artifact): under the backward model the queue's load lives in
  // its own cooking windows, so a new order at event start fits — the push double-counted the
  // queue and wrongly floored future events past their opening (e.g. 17:00 → 17:10). Removed.
  //
  // NOW-FLOOR (today): the SAME serial-queue push had survived here as calcMinReadyMins(queueByCat)
  // — it serially cleared the WHOLE existing queue from now (ceil(qty/batch)×prep), ignoring WHEN
  // those items are scheduled to cook. A 5-pizza order booked at 14:30 cooks 14:20–14:30 (oven idle
  // at 14:15), yet it floored a new order to 14:25 as if all 5 were cooking now. The existing queue's
  // per-window occupancy is ALREADY enforced downstream by fitOrderBackward (each window's existing
  // load + the order ≤ batch), so this floor must NOT scale with the queue. It carries ONLY the
  // physical "you can't collect before one cook cycle from now": feed calcMinReadyMins a synthetic
  // ONE-BATCH-per-cooking-category queue → it returns max over categories of a single batch's prep
  // (the slowest cooking category's one cycle), keeping its built-in 2-min floor. Queue-SIZE no longer
  // pushes the floor; a genuinely-busy current window is still blocked by fitOrderBackward, not here.
  const oneBatchByCat: Record<string, number> = {}
  for (const [cat, cfg] of Object.entries(catConfigs)) {
    if (cfg.secs > 0) oneBatchByCat[cat] = Math.max(1, cfg.batch)
  }
  const earliestCollectionMins = Math.max(
    eventStartMins,
    date === today ? nowMins + calcMinReadyMins(oneBatchByCat, catConfigs) + extraWaitMins : 0,
  )

  // ── Live category-aware capacity inputs ───────────────────────────────────
  // kitchen_capacity comes from the event's van (truck_vans), computed live — the
  // slot_capacity batch cache is no longer consulted for the decision.
  let kitchenCapacity: number | null = null
  let capacityWindowMins = 5
  if (todayEvent?.van_id) {
    const { data: van } = await supabase
      .from('truck_vans')
      .select('kitchen_capacity, capacity_window_mins')
      .eq('id', todayEvent.van_id)
      .single()
    kitchenCapacity = van?.kitchen_capacity ?? null
    capacityWindowMins = van?.capacity_window_mins ?? 5
  }
  // Event-scoped usage (re-key fix): only the resolved event's load, never pooled with
  // other same-date events. No event resolved → empty (slots still generated from times).
  const productionSlotUnits = todayEvent?.id
    ? await getProductionSlotUnits(supabase, truckId, todayEvent.id)
    : {}

  const slots = buildSlotAvailability({
    times,
    productionSlotUnits,
    catConfigs,
    kitchenCapacity,
    capacityWindowMins,
    date,
    nowMins,
    earliestCollectionMins,
    eventStartMins,
    eventEndMins,
    tz: eventTz,
  })

  // Engine inputs so the operator panel can recompute basket-inclusive tones with
  // the SAME buildSlotAvailability (one engine — dot, modal, autoConfirm agree).
  return NextResponse.json({
    slots,
    queueByCat,
    catConfigs,
    tz: eventTz, // event timezone — client derives isSlotPast/ASAP live in this tz
    queryDate: date, // the event date these slots belong to (for isSlotPast future/prior-day guard)
    capacityInputs: {
      productionSlotUnits,
      kitchenCapacity,
      capacityWindowMins,
      eventStartMins,
      eventEndMins: eventEndMins ?? null,
      earliestCollectionMins,
      date,
      nowMins,
      // real production-window interval (slot config, never hardcoded) for the
      // oven-occupancy projection's rate scaling.
      windowSecs: (slotDurationMins > 0 ? slotDurationMins : intervalMins > 0 ? intervalMins : 5) * 60,
    },
  })
}