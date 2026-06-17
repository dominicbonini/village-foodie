'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type {
  TruckData, TruckMenu, MenuItem, Slot, Bundle, BasketItem, AppliedDeal,
  ItemStock, CategoryStock, ModifierGroup, ModifierOption, Order,
} from '@/components/dashboard/types'
import { getAsapSlot, calcReadyTime, getCatConfig } from '@/components/dashboard/helpers'
import { isSlotPast } from '@/lib/slot-utils'
import { calcQueueAwareReadySecs, calcQueuePushSecs } from '@/lib/prep-utils'
import { earliestBackwardFitSlot } from '@/lib/slot-availability'
import { buildSlotIndicators, type SlotIndicator } from '@/lib/slot-display'
import { InlinePriceEditor } from '@/components/dashboard/OrderCard'
import { DealsModal } from '@/components/dashboard/DealsModal'
import { calculateOrderTotal } from '@/lib/order-calculations'
import { isModifierAvailable } from '@/lib/modifier-utils'
import { OrderLineItem } from '@/components/dashboard/OrderLineItem'
import { calcStockRemaining, calcEffectiveRemaining } from '@/lib/stock-utils'
import { isOrderNonEmpty, consumeBasketItemsForDeal, dealConsumedCartKeys } from '@/lib/basket-utils'
import { formatTime, localTodayIso, pickDefaultEventByTime, getNowMinsInTz, getLocalDateInTz } from '@/lib/time-utils'

// ─── helpers ─────────────────────────────────────────────────────────────────

function getAsapBaseTime(event: { event_date: string; start_time: string } | null): Date {
  if (!event) return new Date()
  const now = new Date()
  const todayStr = localTodayIso() // LOCAL date (s.7) — UTC must not treat a future event as today
  const [startH, startM] = (event.start_time || '00:00').split(':').map(Number)
  if (event.event_date > todayStr) {
    const [y, mo, d] = event.event_date.split('-').map(Number)
    return new Date(y, mo - 1, d, startH, startM, 0, 0)
  }
  if (event.event_date === todayStr) {
    const eventStart = new Date()
    eventStart.setHours(startH, startM, 0, 0)
    return now < eventStart ? eventStart : now
  }
  return now
}

function makeCartKey(itemName: string, mods: { name: string }[], notes?: string): string {
  const parts: string[] = []
  const modStr = [...mods].map(m => m.name).sort().join('|')
  if (modStr) parts.push(modStr)
  const noteStr = (notes || '').trim()
  if (noteStr) parts.push(`note:${noteStr}`)
  return parts.length > 0 ? `${itemName}::${parts.join('::')}` : itemName
}

type EventRecord = {
  id: string
  event_date: string
  start_time: string
  end_time: string
  venue_name?: string | null
  town?: string | null
  status?: string
}

/** "Village Hall - Wickhambrook", but skip town if already in venue name */
function fmtVenue(venueName?: string | null, town?: string | null): string {
  if (!venueName && !town) return ''
  if (!venueName) return town!
  if (!town) return venueName
  if (venueName.toLowerCase().includes(town.toLowerCase())) return venueName
  return `${venueName} — ${town}`
}

// ─── props ────────────────────────────────────────────────────────────────────

interface AddOrderPanelProps {
  truck: TruckData
  truckMenu: TruckMenu | null
  menuGroups: Record<string, MenuItem[]>
  itemStocks: ItemStock[]
  categoryStocks: CategoryStock[]
  categoryConfigs: Record<string, { secs: number; batch: number }>
  categoryAllowNotes: Record<string, boolean>
  orders: Order[]
  waitMinutes: number
  token: string
  pin: string
  todayEvent: EventRecord | null
  categoryOrder: string[]
  itemCategoryMap: Record<string, string>
  showToast: (msg: string, type?: 'success' | 'error') => void
  onOrderPlaced: () => void
  onOpenEvent?: (eventId: string) => void
  requestEventPickerOpen?: boolean
  onEventPickerOpened?: () => void
  onEventChange?: (eventId: string) => void
  controlledEvent?: EventRecord | null
  /** Always-mounted tab pattern (manual s.22): panel stays mounted, data effects
   *  only run while the tab is visible. Basket state survives tab switches. */
  isActive?: boolean
}

// ─── component ───────────────────────────────────────────────────────────────

export function AddOrderPanel({
  truck, truckMenu, menuGroups,
  itemStocks, categoryStocks, categoryConfigs, categoryAllowNotes,
  orders, waitMinutes, token, pin, todayEvent,
  categoryOrder, itemCategoryMap,
  showToast, onOrderPlaced, onOpenEvent,
  requestEventPickerOpen, onEventPickerOpened,
  onEventChange, controlledEvent,
  isActive = true,
}: AddOrderPanelProps) {

  // ── order state ─────────────────────────────────────────────────────────────
  const [manualName, setManualName] = useState('')
  const [manualEmail, setManualEmail] = useState('')
  const [manualPhone, setManualPhone] = useState('')
  const [manualNotes, setManualNotes] = useState('')
  const [manualSlot, setManualSlot] = useState('')
  // Operator Add Order: which top-level category tab is selected (null ⇒ default to the first).
  const [activeMenuCat, setActiveMenuCat] = useState<string | null>(null)
  const [manualItems, setManualItems] = useState<BasketItem[]>([])
  const [appliedDeals, setAppliedDeals] = useState<AppliedDeal[]>([])
  const [loading, setLoading] = useState(false)

  // ── event / slot state ──────────────────────────────────────────────────────
  const [manualEvent, setManualEvent] = useState<EventRecord | null>(todayEvent)
  const [manualSlots, setManualSlots] = useState<Slot[]>([])
  // Event timezone from /api/slots (default London); ASAP + isSlotPast derive in this tz.
  const [eventTz, setEventTz] = useState('Europe/London')
  // Live 30s tick → re-render so manualAsapSlot + the dropdown's isSlotPast re-evaluate as the clock
  // advances even without a refetch (a just-passed slot drops out automatically). Value unused — the
  // re-render it triggers is the point.
  const [, setNowTick] = useState(0)
  const [apiQueueByCat, setApiQueueByCat] = useState<Record<string, number>>({})
  // Engine inputs from /api/slots so the dot/modal can recompute basket-inclusive
  // tones with the SAME buildSlotAvailability the server traffic-light uses.
  const [capacityInputs, setCapacityInputs] = useState<{
    productionSlotUnits: Record<string, Record<string, number>>
    kitchenCapacity: number | null
    capacityWindowMins?: number
    eventStartMins: number
    eventEndMins: number | null
    earliestCollectionMins: number
    date: string
    nowMins: number
    windowSecs: number
  } | null>(null)
  // Server catConfigs from /api/slots — the SAME complete object the customer page feeds the
  // engine. It carries countsToCapacity (mapped from counts_toward_capacity at /api/slots:155);
  // the flag-less `categoryConfigs` prop does NOT, which is why instant items never counted on
  // the operator path. Typed {secs,batch} (countsToCapacity is optional on CatConfig and read at
  // runtime), identical to the customer page's serverCatConfigs.
  const [serverCatConfigs, setServerCatConfigs] = useState<Record<string, { secs: number; batch: number }>>({})
  const [showEventPicker, setShowEventPicker] = useState(false)
  const [upcomingEvents, setUpcomingEvents] = useState<EventRecord[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  // True once a fetch has SUCCEEDED at least once — so "No events" only shows
  // after a confirmed-empty load, never on cold start or a failed fetch (S5).
  const [eventsLoaded, setEventsLoaded] = useState(false)

  // ── item modifier modal ─────────────────────────────────────────────────────
  const [itemModal, setItemModal] = useState<{ item: MenuItem; modGroups: ModifierGroup[]; editCartKey?: string } | null>(null)
  const [modalMods, setModalMods] = useState<{ name: string; price: number }[]>([])
  const [modalNotes, setModalNotes] = useState('')

  // ── deal modal ──────────────────────────────────────────────────────────────
  const [showDealsModal, setShowDealsModal] = useState(false)
  const [activeDealBundle, setActiveDealBundle] = useState<Bundle | null>(null)

  // ── slot capacity confirmation ──────────────────────────────────────────────
  // Set only when the kitchen genuinely CAN'T produce the order by the chosen slot (per the
  // SAME engine the traffic-light/booking use). `reason` = a human sentence ("too soon to make
  // N Pizza by 18:05"). A slot the order fits selects silently — no nag.

  // ── phone bottom sheet ──────────────────────────────────────────────────────
  const [showOrderSheet, setShowOrderSheet] = useState(false)

  // ── derived ─────────────────────────────────────────────────────────────────
  const manualAsapSlot = getAsapSlot(manualSlots, manualEvent?.event_date, eventTz)
  const availableDeals = (truckMenu?.bundles || []).filter(b => b.available)

  const calculation = useMemo(() => calculateOrderTotal(
    manualItems.map(item => ({ name: item.name, price: item.unit_price, quantity: item.quantity })),
    appliedDeals,
    truckMenu?.items || [],
    null,
  ), [manualItems, appliedDeals, truckMenu])

  const { itemsTotal: manualItemsSubtotal, dealSavings, total: manualTotal } = calculation

  // In-progress basket as items-by-category INCLUDING deal constituents (deals[].slots),
  // mirroring the customer page. ONE conversion, reused by the ASAP estimate (#2), the
  // tail-completion slot (#3), and the capacity fit-check — so the deal's cookable items
  // are counted everywhere. Instant categories land here too but are ignored downstream
  // (projection: secs 0; fit-check: no rateByCat entry).
  const basketByCat = useMemo(() => {
    const itemCatMap: Record<string, string> = {}
    ;(truckMenu?.items || []).forEach(i => { itemCatMap[i.name] = (i.category || 'mains').toLowerCase() })
    const byCat: Record<string, number> = {}
    manualItems.forEach(i => { const c = itemCatMap[i.name] || 'mains'; byCat[c] = (byCat[c] || 0) + i.quantity })
    appliedDeals.forEach(d => Object.values(d.slots || {}).filter(Boolean).forEach(name => {
      const c = itemCatMap[String(name)] || 'mains'; byCat[c] = (byCat[c] || 0) + 1
    }))
    return byCat
  }, [manualItems, appliedDeals, truckMenu])

  // Single formula for both pre-event and live: queue from API, new items from basket.
  // Base time = max(now, eventStart) so pre-event orders anchor to event start correctly.
  const queueAware = useMemo(() => {
    if (!manualItems.length && !appliedDeals.length) return { readyTime: '', minsFromNow: 0 }
    const newByCat = basketByCat
    // Prep (kitchen-set) + operator extra-wait is the truth — NO phantom +120s buffer.
    // (waitMinutes is the deliberate operator control; the max(30,…) floor stays in the helper.)
    const totalSecs = calcQueueAwareReadySecs(newByCat, apiQueueByCat, categoryConfigs, waitMinutes * 60)
    if (totalSecs === 0) return { readyTime: '', minsFromNow: 0 }
    // Unified ASAP formula (manual s.6): max(now + totalSecs, eventStart + pushSecs).
    // - now + totalSecs: live-service term — full prep from now, nothing pre-prepped.
    // - eventStart + pushSecs: pre-prep term — batch 1 ready AT event start, this
    //   order's final batch lands (batches-1) cycles later. Empty queue ⇒ push 0 ⇒
    //   exactly event start (never eventStart + prep, per the manual rule).
    // Future date: now-term is today, so eventStart+push wins (queue-aware fix).
    // Today pre-start: continuous crossover, queue-aware, old empty-queue behaviour.
    // Underway: base=now and totalSecs > pushSecs always, so now+totalSecs wins —
    // identical to the pre-fix path. No step at the event-start boundary.
    const base = getAsapBaseTime(manualEvent)
    const t = new Date(Math.max(
      Date.now() + totalSecs * 1000,
      base.getTime() + calcQueuePushSecs(newByCat, apiQueueByCat, categoryConfigs) * 1000,
    ))
    return {
      readyTime: `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`,
      minsFromNow: Math.max(0, Math.ceil((t.getTime() - Date.now()) / 60000)),
    }
  }, [manualItems, appliedDeals, basketByCat, apiQueueByCat, manualEvent, categoryConfigs, waitMinutes])

  // Dots + pick-slot indicator: per-window OVEN OCCUPANCY via the SHARED helper
  // (lib/slot-display) — the SAME projection→tone/label mapping the Edit Order picker
  // uses, so the two surfaces can never diverge. Keyed by collection_time. windowSecs
  // comes from the slot config (rate scaling, never 5).
  const slotIndicators = useMemo(() => {
    if (!capacityInputs || !manualSlots.length) return new Map<string, SlotIndicator>()
    return buildSlotIndicators(
      manualSlots,
      capacityInputs.productionSlotUnits || {},
      serverCatConfigs,
      capacityInputs.kitchenCapacity ?? null,
      capacityInputs.eventStartMins,
      categoryOrder,
      capacityInputs.capacityWindowMins ?? 5,
    )
  }, [capacityInputs, manualSlots, serverCatConfigs, categoryOrder])

  const slotIndicatorFor = (s: Slot): SlotIndicator =>
    slotIndicators.get(s.collection_time) ?? { tone: 'green', emoji: '🟢', label: '', occ: null }

  // ASAP "ready around" slot — the BASKET-AWARE earliest BACKWARD-FITTING slot (Stage 3):
  // the earliest collection slot whose cooking windows have room for this order, via the SAME
  // fitOrderBackward engine the picker/server use (no forward tail). The one place the
  // in-progress basket influences the display, and it now agrees with what the picker offers.
  const adjustedAsapSlot = useMemo(() => {
    if (!manualSlots.length || !capacityInputs) return manualAsapSlot
    const asapStart = manualAsapSlot?.collection_time ?? manualSlots.find(s => !s.is_grace)?.collection_time
    if (!asapStart) return manualAsapSlot
    const [sh, sm] = asapStart.split(':').map(Number)
    // NOW-CLAMP (today only — mins-of-day would mis-compare for a future-date event): the operator
    // ASAP can't place cooking windows before now, so a large order pushes out by its real cook span.
    const nowClamp = manualEvent?.event_date === getLocalDateInTz(eventTz)
      ? getNowMinsInTz(eventTz)
      : Number.NEGATIVE_INFINITY
    const fitTime = earliestBackwardFitSlot(
      manualSlots.map(s => ({ collection_time: s.collection_time, production_slot: s.production_slot })),
      capacityInputs.productionSlotUnits || {},
      serverCatConfigs,
      capacityInputs.kitchenCapacity ?? null,
      capacityInputs.eventStartMins,
      basketByCat,
      (sh || 0) * 60 + (sm || 0),
      capacityInputs.capacityWindowMins ?? 5,
      nowClamp,
    )
    const fitSlot = fitTime ? manualSlots.find(s => s.collection_time === fitTime) : null
    return fitSlot ?? manualSlots.find(s => !s.is_grace && s.available) ?? manualAsapSlot
  }, [manualSlots, capacityInputs, serverCatConfigs, basketByCat, manualAsapSlot, eventTz, manualEvent])

  // "Ready around" (DISPLAY-ONLY readout — NOT placement): must ALWAYS agree with the ASAP slot, which
  // is the engine's load + kitchen-capacity-ceiling-aware earliest-ready (adjustedAsapSlot →
  // earliestBackwardFitSlot). So ready is ANCHORED to that slot (fitReadyTime), shown honest-early ONLY
  // when the slot is late purely by GRIDDING (food genuinely done before the gridded mark, light queue).
  //  • fitReadyTime = the engine's backward-fit collection slot — load + ceiling aware, the authoritative
  //    earliest the food can ACTUALLY be ready. Taken only once there's a basket (an empty order "fits"
  //    every slot).
  //  • queueAware = ungridded now+prep / eventStart+push. It models per-category batch throughput but is
  //    BLIND to the global concurrency ceiling, so under load it UNDER-counts (e.g. a 7th dessert trips
  //    the ceiling → the slot moves 17:10→17:15 but queueAware stays 17:10). It is therefore only safe to
  //    surface when it AGREES with the engine's reasoning.
  // DISCRIMINATOR (gridding vs load): grid queueAware UP to its own collection slot. If that equals the
  // engine slot, the gap is PURE GRIDDING ⇒ show honest-early (the ungridded queueAware, ≤ the slot). If
  // the engine slot is LATER than gridded-queueAware, something queueAware can't see (existing load OR the
  // order's own size tripping a window/capacity ceiling) pushed the slot ⇒ ready FOLLOWS the slot. Either
  // way ready ≈ the slot and NEVER exceeds it. The dropdown/submit slot (:504/:591) is unchanged — this
  // only changes what the readout READS. Fallback to queueAware/calcReadyTime only when there's no fit slot.
  const hasBasketForReady = manualItems.length > 0 || appliedDeals.length > 0
  const fitReadyTime = (hasBasketForReady && capacityInputs) ? (adjustedAsapSlot?.collection_time || null) : null
  const readyToMins = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0) }
  // The collection slot that gridding the honest queueAware estimate UP lands on (earliest slot ≥ it).
  const queueAwareGridSlot = queueAware.readyTime
    ? (manualSlots
        .map(s => s.collection_time)
        .filter(t => readyToMins(t) >= readyToMins(queueAware.readyTime))
        .sort((a, b) => readyToMins(a) - readyToMins(b))[0] ?? null)
    : null
  const readyTime = !fitReadyTime
    ? (queueAware.readyTime || calcReadyTime(manualItems, waitMinutes * 60, truckMenu?.items, categoryConfigs))
    : (queueAware.readyTime && queueAwareGridSlot === fitReadyTime)
      ? queueAware.readyTime   // gridding-only gap ⇒ honest-early (food done before the gridded slot)
      : fitReadyTime           // load/ceiling pushed the slot past queueAware ⇒ ready follows the slot
  // "~N mins" wait — derived from the now-consistent readyTime so the number agrees with the shown time
  // (never more minutes than the slot implies). When honest-early won, reuse queueAware's sub-minute-
  // precise count; when ready followed the engine slot (or a calcReadyTime fallback), compute from that HH:MM.
  // (Only rendered on the same-day branch; future-day shows a date label, not a wait.)
  const readyMinsFromNow = (readyTime && readyTime === queueAware.readyTime)
    ? queueAware.minsFromNow
    : readyTime
    ? (() => {
        const nowM = new Date().getHours() * 60 + new Date().getMinutes()
        return Math.max(0, readyToMins(readyTime) - nowM)
      })()
    : queueAware.minsFromNow

  const isEventEnded = manualEvent ? (() => {
    const today = localTodayIso() // LOCAL date (s.7) — pairs with the local end_time check below
    if (manualEvent.event_date > today) return false
    if (manualEvent.event_date < today) return true
    const [h, m] = manualEvent.end_time.split(':').map(Number)
    return new Date().getHours() * 60 + new Date().getMinutes() > h * 60 + m
  })() : false

  const hasItems = isOrderNonEmpty(manualItems, appliedDeals)
  const totalItemCount = manualItems.reduce((s, i) => s + i.quantity, 0) + appliedDeals.length

  // ── fetch events / slots ────────────────────────────────────────────────────


  const fetchUpcomingEvents = useCallback(async () => {
    if (!token) return
    setEventsLoading(true)
    try {
      const res = await fetch(`/api/events/manage?token=${token}&upcoming=true`)
      if (!res.ok) return // S5: never setState from a failed fetch (e.g. 429)
      const data = await res.json()
      if (!Array.isArray(data.events)) return // malformed body — don't blank the list
      const mapped: EventRecord[] = data.events
        .filter((ev: any) => ['confirmed', 'open', 'closed'].includes(ev.status))
        .map((ev: any) => ({
          id: ev.id,
          event_date: ev.event_date,
          start_time: ev.start_time || '',
          end_time: ev.end_time || '',
          venue_name: ev.venue_name || null,
          town: ev.town || null,
          status: ev.status,
        }))
      // Set even when empty: a confirmed 200 with zero events is a legit empty.
      setUpcomingEvents(mapped)
      setEventsLoaded(true)
    } catch { /* S5: swallow — a failed/aborted fetch must not wipe the list */ }
    finally { setEventsLoading(false) }
  }, [token])

  const fetchManualSlots = useCallback(async (eventDate: string, startTime?: string, endTime?: string, eventId?: string) => {
    if (!truck?.id) return
    try {
      const p = new URLSearchParams({ date: eventDate })
      if (startTime) p.set('start', startTime)
      if (endTime) p.set('end', endTime)
      // event_id scopes the panel's capacity projection to THIS event (re-key fix).
      if (eventId) p.set('event_id', eventId)
      const res = await fetch(`/api/slots/${truck.id}?${p}`)
      const data = await res.json()
      setManualSlots(data.slots || [])
      setApiQueueByCat(data.queueByCat || {})
      setCapacityInputs(data.capacityInputs ?? null)
      setServerCatConfigs(data.catConfigs || {})
      if (data.tz) setEventTz(data.tz)
    } catch { setManualSlots([]); setApiQueueByCat({}); setCapacityInputs(null); setServerCatConfigs({}) }
  }, [truck?.id])

  // Live 30s tick so the ASAP label + the dropdown's isSlotPast re-evaluate as time passes.
  useEffect(() => {
    const id = setInterval(() => setNowTick(t => t + 1), 30000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!isActive) return
    fetchUpcomingEvents()
  }, [fetchUpcomingEvents, isActive])

  // Open the picker reusing the already-loaded events for an INSTANT list. Only
  // fetch when we have nothing cached (cold start, or a prior failed load) and
  // aren't already loading — so rapid re-opens never trigger redundant fetches
  // and never flash an empty list.
  const openEventPicker = useCallback(() => {
    if (upcomingEvents.length === 0 && !eventsLoading) fetchUpcomingEvents()
    setShowEventPicker(true)
  }, [upcomingEvents.length, eventsLoading, fetchUpcomingEvents])

  useEffect(() => {
    if (!requestEventPickerOpen) return
    openEventPicker()
    onEventPickerOpened?.()
  }, [requestEventPickerOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync manualEvent when the dashboard switches to a different event
  // isActive in deps: re-sync on tab activation if the event changed while hidden
  useEffect(() => {
    if (!isActive) return
    if (!controlledEvent) return
    if (controlledEvent.id === manualEvent?.id) return // tab switch / identical re-selection
    // Operator ruling (supersedes the V6.4 persist-on-event-change rule): a genuine
    // event CHANGE resets the in-progress basket + customer fields. manualEvent here is
    // still the PREVIOUS event (setManualEvent below hasn't applied) — reset only when
    // there was a prior event that differs, never on the first sync. Reset BEFORE the
    // slot re-fetch so no slot from the old event lingers selected.
    if (manualEvent && manualEvent.id !== controlledEvent.id) resetManual()
    setManualEvent(controlledEvent)
    fetchManualSlots(controlledEvent.event_date, controlledEvent.start_time, controlledEvent.end_time, controlledEvent.id)
    setManualSlot('')
  }, [controlledEvent?.id, isActive]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync status-only changes on the same event (e.g. after open/close)
  useEffect(() => {
    if (!controlledEvent) return
    if (controlledEvent.id !== manualEvent?.id) return
    if (controlledEvent.status === manualEvent?.status) return
    setManualEvent(prev => prev ? { ...prev, status: controlledEvent.status } : controlledEvent)
  }, [controlledEvent?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (manualEvent || upcomingEvents.length === 0) return
    // Status-INDEPENDENT default (cross-event fix): current-by-time, else earliest upcoming —
    // never "the single today event" by UTC date, which could seat a stale-live event. The
    // dashboard's controlledEvent (activeEvent) remains the authoritative driver via the sync
    // effect above; this is only the no-controlledEvent cold-start default.
    setManualEvent(pickDefaultEventByTime(upcomingEvents))
  }, [upcomingEvents])

  useEffect(() => {
    if (!isActive) return
    if (manualEvent?.event_date) {
      fetchManualSlots(manualEvent.event_date, manualEvent.start_time, manualEvent.end_time, manualEvent.id)
    }
  }, [manualEvent?.id, manualEvent?.event_date, manualEvent?.start_time, manualEvent?.end_time, fetchManualSlots, isActive])

  // ── item manipulation ───────────────────────────────────────────────────────
  const addManualItem = (item: MenuItem, mods: { name: string; price: number }[] = [], notes = '') => {
    const key = makeCartKey(item.name, mods, notes)
    const unitPrice = item.price + mods.reduce((s, m) => s + m.price, 0)
    setManualItems(prev => {
      const ex = prev.find(i => i.cartKey === key)
      if (ex) return prev.map(i => i.cartKey === key ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, { name: item.name, quantity: 1, unit_price: unitPrice, modifiers: mods, specialInstructions: notes || undefined, cartKey: key }]
    })
  }

  const adjustManualQty = (cartKey: string, delta: number) => {
    setManualItems(prev =>
      prev.map(i => i.cartKey === cartKey ? { ...i, quantity: i.quantity + delta } : i).filter(i => i.quantity > 0)
    )
  }

  const openManualItemModal = (item: MenuItem, modGroups: ModifierGroup[], editCartKey?: string) => {
    const existing = editCartKey ? manualItems.find(i => (i.cartKey || i.name) === editCartKey) : undefined
setItemModal({ item, modGroups, editCartKey })
    setModalMods(existing?.modifiers || [])
    setModalNotes(existing?.specialInstructions || '')
  }

  const toggleModalMod = (opt: ModifierOption) => {
    setModalMods(prev => prev.some(m => m.name === opt.name)
      ? prev.filter(m => m.name !== opt.name)
      : [...prev, { name: opt.name, price: opt.price_adjustment }]
    )
  }

  const confirmAddFromModal = () => {
    if (!itemModal) return
    const newKey = makeCartKey(itemModal.item.name, modalMods, modalNotes)
    const newUnitPrice = itemModal.item.price + modalMods.reduce((s, m) => s + m.price, 0)
    if (itemModal.editCartKey) {
      setManualItems(prev => {
        const editEntry = prev.find(i => (i.cartKey || i.name) === itemModal.editCartKey)
        if (!editEntry) return prev
        const without = prev.filter(i => (i.cartKey || i.name) !== itemModal.editCartKey)
        const collision = without.find(i => i.cartKey === newKey)
        if (collision) return without.map(i => i.cartKey === newKey ? { ...i, quantity: i.quantity + editEntry.quantity } : i)
        return without.concat({ ...editEntry, modifiers: modalMods, specialInstructions: modalNotes || undefined, unit_price: newUnitPrice, cartKey: newKey })
      })
    } else {
      addManualItem(itemModal.item, modalMods, modalNotes)
    }
    setItemModal(null); setModalMods([]); setModalNotes('')
  }

  const resetManual = () => {
    setManualName(''); setManualEmail(''); setManualPhone(''); setManualNotes('')
    setManualSlot(''); setManualItems([]); setAppliedDeals([])
    setActiveDealBundle(null)
  }

  // ── slot change handler ─────────────────────────────────────────────────────
  // Operator can pick ANY visible slot (manual s.10). The ONLY confirmation is capacity
  // Operator picks a slot → place at it directly, no confirmation. The traffic-light dots already
  // show each slot's load + per-category label, so the operator reads them and makes their own call;
  // the over-capacity "This slot is too full … Use anyway?" modal was removed (operator-only friction,
  // Dominic 2026-06). The CUSTOMER path is unaffected — it's hard-blocked server-side by the same fit
  // check (an over-capacity/too-soon slot is never offered to a customer); this only drops the operator
  // prompt. Empty value clears the selection.
  const handleSlotChange = (value: string) => {
    setManualSlot(value)
  }

  // ── submit ──────────────────────────────────────────────────────────────────
  // override=false: normal submit, runs the atomic stock check. On a shortfall the server
  // returns 409 {stock} WITHOUT inserting — we show the real remaining and let the operator
  // choose. override=true (resubmit after "Proceed anyway"): the operator has SEEN the shortfall
  // and deliberately oversells — the server still runs the check, then inserts past it.
  const submitManual = async (override = false) => {
    if (!hasItems) return
    const effectiveSlot = manualSlot || adjustedAsapSlot?.collection_time || null
    setLoading(true)
    try {
      const res = await fetch('/api/dashboard/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token, pin, action: 'manual',
          manualOrder: {
            customerName: manualName,
            customerPhone: manualPhone || null,
            customerEmail: manualEmail || null,
            slot: effectiveSlot,
            items: manualItems,
            deals: appliedDeals.map(d => ({
              name: d.bundle.name,
              slots: d.slots,
              slotModifiers: d.slotModifiers,
              slotNotes: d.slotNotes,
              price: d.bundle.bundle_price,
            })),
            discountAmt: dealSavings,
            total: manualTotal,
            subtotal: manualItemsSubtotal,
            notes: manualNotes || null,
            event_id: manualEvent?.id || null,
            event_date: manualEvent?.event_date || null,
            override,
          },
        }),
      })
      const data = await res.json()
      // Lock contention past the budget (rare): server did NOT insert — keep the order, retry.
      if (res.status === 409 && data?.retry) {
        showToast('Busy right now — tap Confirm again in a moment', 'error')
        return
      }
      // Stock shortfall: the atomic check RAN and reported the real remaining. INFORMED override
      // — operator proceeds anyway (deliberate oversell) or cancels to edit. Not inserted yet.
      if (res.status === 409 && data?.stock) {
        const shortItems: { name: string; remaining: number }[] = Array.isArray(data.items) ? data.items : []
        const detail = shortItems.length
          ? shortItems.map(s => `${s.name}: only ${s.remaining} left`).join('\n')
          : 'Some items are low on stock'
        const proceed = window.confirm(`${detail}\n\nProceed anyway (oversell)?\n\nOK = proceed anyway   ·   Cancel = edit the order`)
        if (proceed) { await submitManual(true); return }
        return // Edit/Cancel — keep the order in the panel for adjustment, not inserted
      }
      if (!res.ok) throw new Error(data.error)
      showToast(`Order #${data.orderId} confirmed`)
      if (manualItems.length) {
        const categoryMap: Record<string, string> = {}
        manualItems.forEach(item => {
          const mi = truckMenu?.items.find(m => m.name === item.name)
          if (mi) categoryMap[item.name] = mi.category
        })
        await fetch('/api/dashboard/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, pin, action: 'decrement_stock', items: manualItems, categoryMap }),
        }).catch(() => null)
      }
      resetManual()
      setShowOrderSheet(false)
      if (manualEvent) {
        await fetchManualSlots(manualEvent.event_date, manualEvent.start_time, manualEvent.end_time)
      }
      onOrderPlaced()
    } catch (err: any) {
      showToast(err.message || 'Failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  // ── shared JSX pieces ───────────────────────────────────────────────────────

  const slotSelector = (
    <div>
      {manualSlots.length > 0 ? (
        <select
          value={manualSlot}
          onChange={e => handleSlotChange(e.target.value)}
          className="w-full border border-slate-200 rounded-xl px-3 py-3 text-sm font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400"
        >
          {/* Show the concrete earliest-fitting time ONLY once the basket has items — empty-basket
              "earliest" (event open) is misleading and jumps as soon as an item is added. Display-only. */}
          <option value="">⚡ ASAP{(hasItems && adjustedAsapSlot) ? ` — ${adjustedAsapSlot.collection_time}` : ''}</option>
          {/* PAST = the SINGLE live source of truth isSlotPast(eventTz) — never the cached server
              is_past flag (stale once the clock advances; on Vercel it's UTC, an hour off in BST).
              Operators see every slot from NOW including the imminent next one (isSlotPast excludes
              only genuinely-elapsed slots, no +5 grace); too-soon/full slots stay visible with their
              traffic-light. */}
          {manualSlots.filter(s => s.is_grace || !isSlotPast(s, eventTz, manualEvent?.event_date)).map(s => {
            if (s.is_grace) return <option key={s.collection_time} value={s.collection_time}>⚠️ {s.collection_time} · After closing</option>
            const ind = slotIndicatorFor(s)
            return <option key={s.collection_time} value={s.collection_time}>{s.collection_time} {ind.emoji}{ind.label ? ` ${ind.label}` : ''}</option>
          })}
        </select>
      ) : (
        <select
          value={manualSlot}
          onChange={e => setManualSlot(e.target.value)}
          className="w-full border border-slate-200 rounded-xl px-3 py-3 text-sm font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400"
        >
          <option value="">⚡ ASAP</option>
          {(() => {
            const startMins = manualEvent ? (() => { const [h, m] = manualEvent.start_time.split(':').map(Number); return h * 60 + m })() : 10 * 60
            const endMins = manualEvent ? (() => { const [h, m] = manualEvent.end_time.split(':').map(Number); return h * 60 + m })() : 22 * 60 + 30
            const opts: string[] = []
            for (let t = startMins; t <= endMins; t += 5) {
              opts.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`)
            }
            // Same INVARIANT as the capacity dropdown: never offer a slot before now (this fallback
            // previously had NO past filter — a past time was selectable). isSlotPast in the event tz.
            return opts
              .filter(time => !isSlotPast({ collection_time: time }, eventTz, manualEvent?.event_date))
              .map(time => <option key={time} value={time}>{time}</option>)
          })()}
        </select>
      )}
      {/* ASAP-only: the ready estimate is meaningless once a specific slot is picked
          (manualSlot set). manualSlot === '' is the ASAP/default state (the "ASAP — {time}"
          option's value=""), the same truth the dropdown uses — no new source. */}
      {!manualSlot && readyTime && (() => {
        const isFutureDay = manualEvent && manualEvent.event_date > localTodayIso()
        const dateLabel = isFutureDay
          ? new Date(manualEvent!.event_date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
          : null
        // Sub-label time + minutes come from `readyTime`/`readyMinsFromNow`, anchored to the engine's
        // ASAP slot (adjustedAsapSlot): ready ALWAYS agrees with the dropdown slot — equal to it when
        // load/ceiling set the slot, or honest-early (the ungridded estimate ≤ the slot) only when the
        // slot is late purely by gridding. Falls back to the queue-batch estimate when there's no fit slot.
        const m = readyMinsFromNow
        const wait = m < 60
          ? `~${m} min${m !== 1 ? 's' : ''}`
          : `~${Math.round(m / 30) / 2} hr${Math.round(m / 30) / 2 !== 1 ? 's' : ''}`
        return isFutureDay ? (
          <div className="mt-2 bg-teal-50 border border-teal-200 rounded-xl px-3 py-2.5 flex items-center gap-2">
            <span className="text-teal-600 text-base">⚡</span>
            <div>
              <p className="text-sm font-black text-teal-800">Ready around {readyTime}</p>
              <p className="text-xs text-teal-600 font-medium">{dateLabel}</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-green-600 font-medium mt-1.5">⚡ {wait} · around {readyTime}</p>
        )
      })()}
    </div>
  )

  const contactDetails = (
    <details className="text-xs text-slate-400">
      <summary className="cursor-pointer select-none py-1">+ Add email / phone / notes</summary>
      <div className="mt-2 flex flex-col gap-2">
        <input type="email" placeholder="Email for receipt" value={manualEmail}
          onChange={e => setManualEmail(e.target.value)}
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
        <input type="tel" placeholder="Phone number" value={manualPhone}
          onChange={e => setManualPhone(e.target.value)}
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
        <textarea placeholder="Order notes" value={manualNotes} onChange={e => setManualNotes(e.target.value)}
          rows={2} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none" />
      </div>
    </details>
  )

  const submitPanel = (
    <div className="border-t border-slate-200 p-4 flex flex-col gap-3 bg-white shrink-0">
      {hasItems && (
        <div className="flex justify-between text-base font-semibold text-slate-900">
          <span>Total</span>
          <span>£{manualTotal.toFixed(2)}</span>
        </div>
      )}
      <input
        type="text"
        placeholder="Customer name — optional"
        value={manualName}
        onChange={e => setManualName(e.target.value)}
        className="w-full border border-slate-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
      />
      {slotSelector}
      {contactDetails}
      <button
        onClick={() => submitManual()}
        disabled={loading || !hasItems || !manualEvent}
        className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-4 rounded-xl text-base disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-[0.98]"
      >
        {loading ? 'Confirming...' : !manualEvent ? 'Select an event to confirm' : `Confirm order${manualTotal > 0 ? ` · £${manualTotal.toFixed(2)}` : ''}`}
      </button>
    </div>
  )

  const cartLines = (
    <div className="space-y-1">
      {/* Deals first — always with category header */}
      {appliedDeals.length > 0 && (
        <p className="text-[10px] font-black text-orange-500 uppercase tracking-wide mb-1">Deals</p>
      )}
      {appliedDeals.map((d, i) => (
        <div key={i} className="py-1">
          {/* Deal header — same visual weight as standalone item rows */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <span className="text-sm font-bold text-slate-900 truncate">🎁 {d.bundle.name}</span>
              <button
                onClick={() => {
                  if (d.itemsTakenFromBasket?.length > 0) {
                    setManualItems(prev => prev.filter(item => !d.itemsTakenFromBasket.includes(item.cartKey || item.name)))
                  }
                  setAppliedDeals(prev => prev.filter((_, n) => n !== i))
                }}
                className="text-slate-300 hover:text-red-500 ml-1 text-sm leading-none shrink-0"
              >×</button>
            </div>
            <InlinePriceEditor
              price={d.bundle.bundle_price}
              quantity={1}
              onChange={p => setAppliedDeals(prev => prev.map((deal, idx) =>
                idx === i ? { ...deal, bundle: { ...deal.bundle, bundle_price: p } } : deal
              ))}
            />
          </div>
          {/* Constituent items — indented, muted */}
          {Object.keys(d.slots).sort().map(slotKey => {
            const itemName = d.slots[slotKey]
            if (!itemName) return null
            const mods = d.slotModifiers?.[slotKey] || []
            const note = d.slotNotes?.[slotKey]
            return (
              <div key={slotKey}>
                <div className="pl-4 text-xs text-slate-500">{itemName}</div>
                {mods.map(m => (
                  <div key={m.name} className="flex justify-between pl-8 text-xs text-slate-400">
                    <span>{m.name}</span>
                    {m.price > 0 && <span className="text-slate-500">+£{m.price.toFixed(2)}</span>}
                  </div>
                ))}
                {note && <div className="pl-8 text-xs text-slate-400 italic">📝 {note}</div>}
              </div>
            )
          })}
        </div>
      ))}
      {/* Items — sorted by menu category order, always show category header */}
      {(() => {
        const grouped: Record<string, BasketItem[]> = {}
        manualItems.forEach(item => {
          const cat = truckMenu?.items.find(m => m.name === item.name)?.category || 'other'
          if (!grouped[cat]) grouped[cat] = []
          grouped[cat].push(item)
        })
        const sortedCats = [
          ...categoryOrder.filter(cat => grouped[cat]),
          ...Object.keys(grouped).filter(cat => !categoryOrder.includes(cat)),
        ]
        return sortedCats.map(cat => (
          <div key={cat}>
            <p className="text-[10px] font-black text-orange-500 uppercase tracking-wide mb-1 mt-2 first:mt-0">{cat}</p>
            {grouped[cat].map(item => {
              const rowKey = item.cartKey || item.name
              const hasMods = (item.modifiers || []).length > 0
              const catAllowNotes = categoryAllowNotes[cat.toLowerCase()] ?? false
              const itemCatModGroups = truckMenu?.categories?.find(c => c.name === (truckMenu?.items.find(m => m.name === item.name)?.category || ''))?.modifierGroups || []
              const fullMenuItem = truckMenu?.items.find(m => m.name === item.name)
              const showCustomise = itemCatModGroups.length > 0 && fullMenuItem
              return (
                <div key={rowKey} className="flex items-start gap-2 py-1">
                  <div className="flex items-center gap-1 shrink-0 mt-0.5">
                    <button onClick={() => adjustManualQty(rowKey, -1)} className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center font-bold hover:bg-red-100 hover:text-red-600 text-sm leading-none">−</button>
                    <span className="w-5 text-center font-black text-sm text-slate-900">{item.quantity}</span>
                    <button onClick={() => adjustManualQty(rowKey, 1)} className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center font-bold hover:bg-orange-100 hover:text-orange-600 text-sm leading-none">+</button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <OrderLineItem
                      name={item.name}
                      quantity={item.quantity}
                      unitPrice={item.unit_price}
                      modifiers={item.modifiers}
                      specialInstructions={item.specialInstructions}
                      variant="operator"
                      nameSuffix={showCustomise ? (
                        <button onClick={() => openManualItemModal(fullMenuItem!, itemCatModGroups, rowKey)}
                          className="text-[10px] font-bold text-orange-500 border border-orange-200 rounded-md px-1.5 py-0.5 hover:bg-orange-50 shrink-0">
                          {hasMods ? '✏ Edit' : '+ Customise'}
                        </button>
                      ) : catAllowNotes && !hasMods ? (
                        <span className="text-[10px] text-slate-400 italic">Standard</span>
                      ) : undefined}
                      rightSlot={
                        <InlinePriceEditor price={item.unit_price} quantity={item.quantity}
                          onChange={p => setManualItems(prev => prev.map(i => (i.cartKey || i.name) === rowKey ? { ...i, unit_price: p } : i))} />
                      }
                    />
                  </div>
                </div>
              )
            })}
          </div>
        ))
      })()}
    </div>
  )

  // ── Operator Add Order menu navigation ──────────────────────────────────────
  // Top-level category TABS (no long scroll) + FLAT alphabetical items. Subcategory headings are
  // NOT used on THIS screen (the customer order page + Menu & Stock editor still group by subcategory
  // — that feature/data is untouched). Same category ordering both render paths used.
  const menuCats = [
    ...categoryOrder.filter(cat => menuGroups[cat]?.length),
    ...Object.keys(menuGroups).filter(cat => !categoryOrder.includes(cat) && menuGroups[cat]?.length),
  ]
  // Default to the first category; self-heal if the active tab disappears (menu reload / now-empty cat).
  const selectedMenuCat = (activeMenuCat && menuCats.includes(activeMenuCat)) ? activeMenuCat : (menuCats[0] ?? null)
  // FLAT sort, structured for a FUTURE "featured / bestseller" tier: items with a higher `sort_priority`
  // (or a `featured` flag) float to the TOP in priority order; the REST are alphabetical by name. No such
  // column exists on menu_items_db today, so both read undefined ⇒ priority 0 for all ⇒ PURE ALPHABETICAL
  // now (the current ask). To enable later: add `sort_priority int` (or `featured boolean`) to
  // menu_items_db, surface it on the MenuItem type + /api/menu select — the comparator already honours it,
  // featured floats up, the rest stay alphabetical, NO re-architecting.
  const sortMenuItems = (items: MenuItem[]) => {
    const priorityOf = (i: MenuItem) => {
      const f = i as { sort_priority?: number; featured?: boolean }
      return Number(f.sort_priority ?? (f.featured ? 1 : 0)) || 0
    }
    return [...items].sort((a, b) => priorityOf(b) - priorityOf(a) || a.name.localeCompare(b.name))
  }
  // Sticky, finger-sized (≥44px) category tab bar. Horizontal-scrolls on a narrow width — never off-screen.
  const categoryTabs = menuCats.length > 1 ? (
    <div className="sticky top-0 z-10 bg-white pb-2 mb-2 border-b border-slate-100">
      <div className="flex gap-1.5 overflow-x-auto">
        {menuCats.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveMenuCat(cat)}
            className={`shrink-0 inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl text-sm font-black uppercase tracking-wide transition-colors active:scale-95 ${
              cat === selectedMenuCat ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>
    </div>
  ) : null

  const menuGrid = (
    <div>
      {categoryTabs}
      {selectedMenuCat && (
        <div className="flex flex-wrap gap-2">
          {sortMenuItems(menuGroups[selectedMenuCat] || []).map(item => {
            const stock = itemStocks.find(s => s.name === item.name)
            // Sold-out mirrors the SERVER rule (menu route AND-composition): menu-level flag OFF
            // (item.available — standing Settings availability) OR per-event override OFF
            // (stock.available — the sold-out-for-tonight toggle). Read from the SAME optimistically-
            // updated itemStocks slice the stock count uses, so a toggle reflects instantly instead of
            // lagging the 60s menu poll. No event override row ⇒ stock.available undefined ⇒ menu flag wins.
            const isSoldOut = !(item.available ?? true) || stock?.available === false
            const catSt = categoryStocks.find(s => s.category === selectedMenuCat)
            const itemRem = calcStockRemaining(stock?.stock_count ?? null, stock?.orders_count ?? 0)
            const catRem = calcStockRemaining(catSt?.stock_count ?? null, catSt?.orders_count ?? 0)
            const effectiveRem = calcEffectiveRemaining(itemRem, catRem)
            const isLow = !isSoldOut && effectiveRem !== null && effectiveRem <= 10
            const totalInBasket = manualItems.filter(i => i.name === item.name).reduce((s, i) => s + i.quantity, 0)
            const atStockLimit = effectiveRem !== null && totalInBasket >= effectiveRem
            if (isSoldOut) return (
              <div key={item.name} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-100 bg-slate-50 cursor-not-allowed opacity-60 min-h-[56px]">
                <span className="text-xs text-slate-500 line-through">{item.name}</span>
                <span className="text-[10px] text-red-400 font-bold">sold out</span>
              </div>
            )
            return (
              <button
                key={item.name}
                onClick={() => !atStockLimit && addManualItem(item)}
                disabled={atStockLimit}
                className={`flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-xl border text-sm font-bold transition-all min-h-[56px] min-w-[80px] ${
                  atStockLimit ? 'opacity-50 cursor-not-allowed bg-slate-100 border-slate-200 text-slate-400'
                  : totalInBasket > 0 ? 'bg-orange-600 border-orange-600 text-white active:scale-95'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-orange-300 hover:bg-white active:scale-95'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {totalInBasket > 0 && <span className={atStockLimit ? 'text-slate-500' : 'text-orange-200'}>{totalInBasket}×</span>}
                  <span>{item.name}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs font-normal ${atStockLimit ? 'text-slate-400' : totalInBasket > 0 ? 'text-orange-200' : 'text-slate-400'}`}>£{item.price.toFixed(2)}</span>
                  {atStockLimit && <span className="text-[10px] text-red-500 font-black">max</span>}
                  {!atStockLimit && isLow && <span className="text-[10px] text-orange-500 font-black">({effectiveRem} left)</span>}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )

  const menuList = (
    <div>
      {categoryTabs}
      {selectedMenuCat && (
        <div>
          {sortMenuItems(menuGroups[selectedMenuCat] || []).map(item => {
            const stock = itemStocks.find(s => s.name === item.name)
            // Sold-out mirrors the SERVER rule (menu route AND-composition): menu-level flag OFF
            // (item.available — standing Settings availability) OR per-event override OFF
            // (stock.available — the sold-out-for-tonight toggle). Read from the SAME optimistically-
            // updated itemStocks slice the stock count uses, so a toggle reflects instantly instead of
            // lagging the 60s menu poll. No event override row ⇒ stock.available undefined ⇒ menu flag wins.
            const isSoldOut = !(item.available ?? true) || stock?.available === false
            const catSt = categoryStocks.find(s => s.category === selectedMenuCat)
            const itemRem = calcStockRemaining(stock?.stock_count ?? null, stock?.orders_count ?? 0)
            const catRem = calcStockRemaining(catSt?.stock_count ?? null, catSt?.orders_count ?? 0)
            const effectiveRem = calcEffectiveRemaining(itemRem, catRem)
            const isLow = !isSoldOut && effectiveRem !== null && effectiveRem <= 10
            const totalInBasket = manualItems.filter(i => i.name === item.name).reduce((s, i) => s + i.quantity, 0)
            const atStockLimit = effectiveRem !== null && totalInBasket >= effectiveRem
            return (
              <div key={item.name} className={`flex items-center gap-3 py-3 border-b border-slate-50 ${isSoldOut ? 'opacity-50' : ''}`}>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${isSoldOut ? 'line-through text-slate-400' : 'text-slate-800'}`}>{item.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-slate-400">£{item.price.toFixed(2)}</span>
                    {isSoldOut && <span className="text-[10px] text-red-400 font-bold">sold out</span>}
                    {atStockLimit && <span className="text-[10px] text-red-500 font-black">max reached</span>}
                    {!atStockLimit && isLow && <span className="text-[10px] text-orange-500 font-black">{effectiveRem} left</span>}
                  </div>
                </div>
                {!isSoldOut && (
                  totalInBasket > 0 ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => adjustManualQty(item.name, -1)}
                        className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 font-bold text-lg leading-none active:scale-90"
                      >−</button>
                      <span className="text-sm font-bold text-slate-800 w-4 text-center">{totalInBasket}</span>
                      <button
                        onClick={() => !atStockLimit && addManualItem(item)}
                        disabled={atStockLimit}
                        className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-lg leading-none ${atStockLimit ? 'bg-slate-100 text-slate-300 cursor-not-allowed' : 'bg-orange-600 text-white active:scale-90'}`}
                      >+</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => !atStockLimit && addManualItem(item)}
                      disabled={atStockLimit}
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xl leading-none shrink-0 ${atStockLimit ? 'bg-slate-100 text-slate-300 cursor-not-allowed' : 'bg-orange-100 text-orange-600 active:scale-90'}`}
                    >+</button>
                  )
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  const dealsButton = availableDeals.length > 0 ? (
    <button
      onClick={() => {
        if (availableDeals.length === 1) { setActiveDealBundle(availableDeals[0]); setShowDealsModal(true) }
        else { setActiveDealBundle(null); setShowDealsModal(true) }
      }}
      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-orange-300 text-orange-600 hover:bg-orange-50 transition-colors text-sm font-bold active:scale-[0.99] mb-4"
    >
      <span>🎁</span>
      <span>{appliedDeals.length > 0 ? '+ Add another deal' : '+ Apply a deal'}</span>
      {appliedDeals.length > 0 && <span className="text-xs text-orange-400 font-normal">({appliedDeals.length} applied)</span>}
    </button>
  ) : null

  const eventBanner = manualEvent?.status !== 'open' ? (
    <div className="hidden sm:block mb-4">
      {manualEvent ? (
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              {(manualEvent.venue_name || manualEvent.town) && (
                <p className="text-sm font-bold text-orange-900 truncate">
                  {fmtVenue(manualEvent.venue_name, manualEvent.town)}
                </p>
              )}
              <p className="text-xs text-orange-600 truncate">{(() => {
                const t = new Date().toISOString().split('T')[0]
                const tmrw = new Date(Date.now() + 86400000).toISOString().split('T')[0]
                const d = manualEvent.event_date
                const label = d === t ? 'Today' : d === tmrw ? 'Tomorrow' : new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
                return `${label} · ${formatTime(manualEvent.start_time)}–${formatTime(manualEvent.end_time)}`
              })()}</p>
            </div>
            <button onClick={openEventPicker}
              className="text-xs font-bold text-orange-600 border border-orange-300 rounded-lg px-2.5 py-1 shrink-0 hover:bg-orange-100 active:scale-95">
              Change
            </button>
          </div>
          {(manualEvent.status === 'confirmed' || manualEvent.status === 'closed') && onOpenEvent && (
            <button
              onClick={() => onOpenEvent(manualEvent.id)}
              className="mt-2 w-full bg-orange-600 text-white font-bold py-2.5 rounded-xl text-sm hover:bg-orange-700 active:scale-[0.98] transition-all">
              {manualEvent.status === 'closed' ? 'Restart Event' : 'Start Event'}
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-amber-500">⚠️</span>
            <p className="text-sm font-medium text-amber-800">No event selected</p>
          </div>
          <button onClick={openEventPicker}
            className="text-sm font-semibold text-amber-700 border border-amber-300 bg-white rounded-lg px-3 py-1.5 hover:bg-amber-50 whitespace-nowrap">
            Select event
          </button>
        </div>
      )}
      {isEventEnded && (
        <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          ⚠️ This event has ended — you're adding an order after close. Make sure you've selected the right event.
        </div>
      )}
    </div>
  ) : null

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── iPad / desktop: two-column split ── */}
      <div className="hidden md:flex -mx-4 -mt-4" style={{ height: 'calc(100dvh - 130px)' }}>

        {/* LEFT — scrollable menu */}
        <div className="w-[58%] overflow-y-auto border-r border-slate-200 p-4">
          {eventBanner}
          {dealsButton}
          {truckMenu ? menuGrid : <p className="text-slate-400 text-sm animate-pulse">Loading menu…</p>}
        </div>

        {/* RIGHT — cart + submit */}
        <div className="w-[42%] flex flex-col bg-white overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4">
            {hasItems ? cartLines : (
              <div className="flex flex-col items-center justify-center h-full text-slate-300 gap-2 select-none">
                <span className="text-4xl">🛒</span>
                <span className="text-sm">Tap items to build order</span>
              </div>
            )}
          </div>
          {submitPanel}
        </div>
      </div>

      {/* ── Phone: single column ── */}
      <div className="md:hidden pb-24">
        {eventBanner}
        {dealsButton}
        {truckMenu ? menuList : <p className="text-slate-400 text-sm animate-pulse">Loading menu…</p>}
      </div>

      {/* ── Phone: sticky bottom bar ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-4 py-3 flex items-center justify-between gap-3 z-20">
        <div>
          <p className="text-sm font-bold text-slate-900">£{manualTotal.toFixed(2)}</p>
          <p className="text-xs text-slate-400">{totalItemCount} item{totalItemCount !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowOrderSheet(true)}
          disabled={!hasItems}
          className="flex-1 max-w-xs bg-teal-600 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-40 active:scale-95"
        >
          Review order →
        </button>
      </div>

      {/* ── Phone: bottom sheet ── */}
      {showOrderSheet && (
        <div className="md:hidden fixed inset-0 z-50 flex items-end" onClick={() => setShowOrderSheet(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative w-full bg-white rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-100">
              <p className="font-black text-slate-900">Confirm order</p>
              <button onClick={() => setShowOrderSheet(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold w-8 h-8 flex items-center justify-center">✕</button>
            </div>
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 max-h-48 overflow-y-auto">
              {cartLines}
            </div>
            {submitPanel}
          </div>
        </div>
      )}

      {/* ── Item modifier modal ── */}
      {itemModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setItemModal(null)} />
          <div className="relative bg-white rounded-t-2xl w-full max-w-lg shadow-2xl">
            <div className="px-5 pt-5 pb-4">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-black text-slate-900 text-lg">{itemModal.item.name}</h3>
                  <p className="text-slate-400 text-sm">£{itemModal.item.price.toFixed(2)} base</p>
                </div>
                <button onClick={() => setItemModal(null)} className="text-slate-400 hover:text-slate-600 text-xl font-bold leading-none ml-4 mt-0.5">✕</button>
              </div>
              <div className="space-y-4">
                {itemModal.modGroups.map(group => (
                  <div key={group.id}>
                    <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">{group.name}</p>
                    <div className="flex flex-wrap gap-2">
                      {group.options.filter(isModifierAvailable).map((opt: ModifierOption) => {
                        const selected = modalMods.some(m => m.name === opt.name)
                        return (
                          <button key={opt.id} onClick={() => toggleModalMod(opt)}
                            className={`flex items-center gap-1.5 text-sm font-bold px-3.5 py-2 rounded-xl border-2 transition-all active:scale-95 ${selected ? 'bg-orange-600 border-orange-600 text-white' : 'bg-white border-slate-200 text-slate-700 hover:border-orange-300'}`}>
                            <span>{opt.name}</span>
                            {opt.price_adjustment > 0 && <span className={selected ? 'text-orange-200' : 'text-orange-500'}>+£{opt.price_adjustment.toFixed(2)}</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
                {(truckMenu?.categories?.find(c => c.name === itemModal.item.category)?.allowNotes ?? false) && (
                  <div>
                    <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Note <span className="font-normal normal-case text-slate-400">— optional</span></p>
                    <textarea value={modalNotes} onChange={e => setModalNotes(e.target.value.slice(0, 60))}
                      placeholder="e.g. No onions, well done…" rows={2}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white resize-none" />
                    <p className="text-right text-[10px] text-slate-400 mt-0.5">{modalNotes.length}/60</p>
                  </div>
                )}
              </div>
            </div>
            <div className="px-5 pb-5 pt-2 border-t border-slate-100">
              <button onClick={confirmAddFromModal}
                className="w-full bg-orange-600 text-white font-black py-3.5 rounded-xl hover:bg-orange-700 transition-colors active:scale-[0.98]">
                {itemModal.editCartKey ? 'Save changes' : 'Add'} · £{(itemModal.item.price + modalMods.reduce((s, m) => s + m.price, 0)).toFixed(2)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Deals modal ── */}
      {showDealsModal && (
        <DealsModal
          bundles={activeDealBundle ? [activeDealBundle] : availableDeals}
          menuItems={truckMenu?.items || []}
          menuCategories={truckMenu?.categories || []}
          basketItems={manualItems.map(i => ({ name: i.name, quantity: i.quantity, unit_price: i.unit_price, cartKey: i.cartKey, modifiers: i.modifiers, specialInstructions: i.specialInstructions }))}
          existingDeals={appliedDeals}
          onApply={(deal, slots, price, discount, rawSlots, modifierExtra, slotModifiers, slotNotes) => {
            const itemsTakenFromBasket = dealConsumedCartKeys(rawSlots)
            setManualItems(prev => consumeBasketItemsForDeal(prev, rawSlots))
            setAppliedDeals(prev => [...prev, {
              bundle: { ...deal, available: true, start_time: deal.start_time ?? null, end_time: deal.end_time ?? null },
              slots, itemsTakenFromBasket, modifierExtra, slotModifiers, slotNotes,
            }])
            setShowDealsModal(false)
            setActiveDealBundle(null)
          }}
          onClose={() => { setShowDealsModal(false); setActiveDealBundle(null) }}
        />
      )}


      {/* ── Event picker sheet ── */}
      {showEventPicker && (() => {
        const todayIso = new Date().toISOString().split('T')[0]
        const fmtEvDate = (d: string) => {
          const tmrw = new Date(Date.now() + 86400000).toISOString().split('T')[0]
          if (d === todayIso) return 'Today'
          if (d === tmrw) return 'Tomorrow'
          return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
        }
        return (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowEventPicker(false)}>
            <div className="bg-white rounded-2xl w-full max-w-sm mx-auto max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="px-4 pt-4 pb-3 border-b border-slate-100 flex items-center justify-between">
                <p className="font-black text-slate-900 text-base">Select event</p>
                <button onClick={() => setShowEventPicker(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 text-lg">✕</button>
              </div>
              <div className="p-3 space-y-2">
                {upcomingEvents.length > 0
                  ? upcomingEvents.map(ev => {
                    const isSelected = manualEvent?.id === ev.id
                    const isFuture = ev.event_date > todayIso
                    return (
                      <button key={ev.id} onClick={() => { if (manualEvent && manualEvent.id !== ev.id) resetManual(); setManualEvent(ev); setShowEventPicker(false); fetchManualSlots(ev.event_date, ev.start_time, ev.end_time, ev.id); setManualSlot(''); onEventChange?.(ev.id) }}
                        className={`w-full text-left px-3 py-3 rounded-xl border transition-colors ${isSelected ? 'border-orange-400 bg-orange-50' : 'border-slate-200 hover:border-orange-200 hover:bg-orange-50/50'}`}>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-slate-900 flex-1">{fmtEvDate(ev.event_date)} · {formatTime(ev.start_time)}–{formatTime(ev.end_time)}</p>
                          {ev.status === 'closed' && <span className="text-[10px] font-bold text-slate-400 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 flex-shrink-0">● Finished</span>}
                          {ev.status === 'open' && <span className="text-[10px] font-bold text-green-600 bg-green-50 border border-green-200 rounded px-1.5 py-0.5 flex-shrink-0">● Live</span>}
                          {isFuture && ev.status !== 'closed' && ev.status !== 'open' && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 flex-shrink-0">Future</span>}
                        </div>
                        {(ev.venue_name || ev.town) && <p className="text-xs text-slate-500 mt-0.5">{fmtVenue(ev.venue_name, ev.town)}</p>}
                        {isSelected && <span className="text-[10px] font-black text-orange-600 uppercase tracking-wide">Selected</span>}
                      </button>
                    )
                  })
                  : (eventsLoading || !eventsLoaded)
                    // S5: skeleton while loading OR before any successful load (incl.
                    // a failed fetch) — never flash "No events" in those states.
                    ? [0, 1, 2].map(i => <div key={i} className="h-[58px] rounded-xl bg-slate-100 animate-pulse" />)
                    // Only after a confirmed-empty successful load:
                    : <p className="text-sm text-slate-400 text-center py-6">No upcoming events found</p>}
              </div>

              {/* Warning when a future event is selected */}
              {manualEvent && manualEvent.event_date > todayIso && (
                <div className="mx-3 mb-2 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  <span className="text-amber-500 flex-shrink-0 text-sm">⚠️</span>
                  <p className="text-xs text-amber-700">
                    {fmtEvDate(manualEvent.event_date)} event selected. Orders will appear on the order screen when the event opens.
                  </p>
                </div>
              )}

              {/* Info when today's confirmed (not yet open) event is selected */}
              {manualEvent && manualEvent.event_date === todayIso && manualEvent.status === 'confirmed' && (
                <div className="mx-3 mb-2 flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
                  <span className="text-blue-500 flex-shrink-0 text-sm">ℹ️</span>
                  <p className="text-xs text-blue-700">
                    Today's event — not yet open for orders. Orders will be queued and visible when you open the event.
                  </p>
                </div>
              )}

              <div className="p-3 border-t border-slate-100">
                <button onClick={() => setShowEventPicker(false)} className="w-full border border-slate-200 rounded-xl py-2.5 text-sm text-slate-600 font-medium hover:bg-slate-50">Done</button>
              </div>
            </div>
          </div>
        )
      })()}
    </>
  )
}
