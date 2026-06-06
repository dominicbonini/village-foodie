'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type {
  TruckData, TruckMenu, MenuItem, Slot, Bundle, BasketItem, AppliedDeal,
  ItemStock, CategoryStock, ModifierGroup, ModifierOption, Order,
} from '@/components/dashboard/types'
import { getAsapSlot, calcReadyTime, getCatConfig } from '@/components/dashboard/helpers'
import { calcQueueAwareReadySecs } from '@/lib/prep-utils'
import { InlinePriceEditor } from '@/components/dashboard/OrderCard'
import { DealsModal } from '@/components/dashboard/DealsModal'
import { calculateOrderTotal } from '@/lib/order-calculations'
import { isModifierAvailable } from '@/lib/modifier-utils'
import { OrderLineItem } from '@/components/dashboard/OrderLineItem'
import { calcStockRemaining, calcEffectiveRemaining } from '@/lib/stock-utils'
import { formatTime } from '@/lib/time-utils'

// ─── helpers ─────────────────────────────────────────────────────────────────

function getAsapBaseTime(event: { event_date: string; start_time: string } | null): Date {
  if (!event) return new Date()
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
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
}: AddOrderPanelProps) {

  // ── order state ─────────────────────────────────────────────────────────────
  const [manualName, setManualName] = useState('')
  const [manualEmail, setManualEmail] = useState('')
  const [manualPhone, setManualPhone] = useState('')
  const [manualNotes, setManualNotes] = useState('')
  const [manualSlot, setManualSlot] = useState('')
  const [manualItems, setManualItems] = useState<BasketItem[]>([])
  const [appliedDeals, setAppliedDeals] = useState<AppliedDeal[]>([])
  const [loading, setLoading] = useState(false)

  // ── event / slot state ──────────────────────────────────────────────────────
  const [manualEvent, setManualEvent] = useState<EventRecord | null>(todayEvent)
  const [manualSlots, setManualSlots] = useState<Slot[]>([])
  const [apiQueueByCat, setApiQueueByCat] = useState<Record<string, number>>({})
  const [showEventPicker, setShowEventPicker] = useState(false)
  const [upcomingEvents, setUpcomingEvents] = useState<EventRecord[]>([])

  // ── item modifier modal ─────────────────────────────────────────────────────
  const [itemModal, setItemModal] = useState<{ item: MenuItem; modGroups: ModifierGroup[]; editCartKey?: string } | null>(null)
  const [modalMods, setModalMods] = useState<{ name: string; price: number }[]>([])
  const [modalNotes, setModalNotes] = useState('')

  // ── deal modal ──────────────────────────────────────────────────────────────
  const [showDealsModal, setShowDealsModal] = useState(false)
  const [activeDealBundle, setActiveDealBundle] = useState<Bundle | null>(null)

  // ── slot capacity confirmation ──────────────────────────────────────────────
  const [pendingSlot, setPendingSlot] = useState<{ time: string; remaining: number; isFull: boolean } | null>(null)

  // ── phone bottom sheet ──────────────────────────────────────────────────────
  const [showOrderSheet, setShowOrderSheet] = useState(false)

  // ── derived ─────────────────────────────────────────────────────────────────
  const manualAsapSlot = getAsapSlot(manualSlots, manualEvent?.event_date)
  const availableDeals = (truckMenu?.bundles || []).filter(b => b.available)

  const calculation = useMemo(() => calculateOrderTotal(
    manualItems.map(item => ({ name: item.name, price: item.unit_price, quantity: item.quantity })),
    appliedDeals,
    truckMenu?.items || [],
    null,
  ), [manualItems, appliedDeals, truckMenu])

  const { itemsTotal: manualItemsSubtotal, dealSavings, total: manualTotal } = calculation

  // Single formula for both pre-event and live: queue from API, new items from basket.
  // Base time = max(now, eventStart) so pre-event orders anchor to event start correctly.
  const queueAware = useMemo(() => {
    if (!manualItems.length && !appliedDeals.length) return { readyTime: '', minsFromNow: 0 }
    const newByCat: Record<string, number> = {}
    manualItems.forEach(item => {
      const cat = (truckMenu?.items.find(m => m.name === item.name)?.category || 'mains').toLowerCase()
      newByCat[cat] = (newByCat[cat] || 0) + item.quantity
    })
    const totalSecs = calcQueueAwareReadySecs(newByCat, apiQueueByCat, categoryConfigs, waitMinutes * 60 + 120)
    if (totalSecs === 0) return { readyTime: '', minsFromNow: 0 }
    // ASAP base: max(now + prep, eventStart) — NOT eventStart + prep.
    // Pre-event orders must not add prep time on top of event start.
    // See manual Section 6: ASAP base time rule.
    const base = getAsapBaseTime(manualEvent)
    const t = new Date(Math.max(
      Date.now() + totalSecs * 1000,
      base.getTime(),
    ))
    return {
      readyTime: `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`,
      minsFromNow: Math.max(0, Math.ceil((t.getTime() - Date.now()) / 60000)),
    }
  }, [manualItems, appliedDeals, apiQueueByCat, manualEvent, categoryConfigs, waitMinutes, truckMenu])

  // ASAP slot calculation — see Engineering Manual s.6
  // queueByCat sourced from /api/slots response (canonical, includes modified orders)
  // Both dropdown and sub-label derive from calcQueueAwareReadySecs — single formula
  // adjustedAsapSlot = first slot at or after eventStart + queueAware.minsFromNow
  // Do NOT rebuild queueByCat from orders prop — it misses modified status
  const adjustedAsapSlot = useMemo(() => {
    if (!manualSlots.length) return null
    if (!queueAware.minsFromNow) return manualAsapSlot
    const tMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
    // Use readyTime HH:MM as the floor — identical to the "Ready around" label.
    // nowMins + minsFromNow is wrong for future events: minsFromNow spans overnight
    // (e.g. 20h) so neededMins overflows past midnight and always picks the last slot.
    const neededMins = queueAware.readyTime
      ? tMins(queueAware.readyTime)
      : new Date().getHours() * 60 + new Date().getMinutes() + queueAware.minsFromNow
    return (
      manualSlots.find(s => !s.is_grace && s.available && tMins(s.collection_time) >= neededMins)
      ?? manualSlots.filter(s => !s.is_grace && s.available).slice(-1)[0]
      ?? manualAsapSlot
    )
  }, [manualSlots, queueAware, manualAsapSlot])

  const readyTime = queueAware.readyTime || calcReadyTime(manualItems, waitMinutes * 60, truckMenu?.items, categoryConfigs)

  const isEventEnded = manualEvent ? (() => {
    const today = new Date().toISOString().split('T')[0]
    if (manualEvent.event_date > today) return false
    if (manualEvent.event_date < today) return true
    const [h, m] = manualEvent.end_time.split(':').map(Number)
    return new Date().getHours() * 60 + new Date().getMinutes() > h * 60 + m
  })() : false

  const hasItems = manualItems.length > 0 || appliedDeals.length > 0
  const totalItemCount = manualItems.reduce((s, i) => s + i.quantity, 0) + appliedDeals.length

  // ── fetch events / slots ────────────────────────────────────────────────────


  const fetchUpcomingEvents = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`/api/events/manage?token=${token}&upcoming=true`)
      const data = await res.json()
      if (!data.events?.length) return
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
      setUpcomingEvents(mapped)
    } catch { }
  }, [token])

  const fetchManualSlots = useCallback(async (eventDate: string, startTime?: string, endTime?: string) => {
    if (!truck?.id) return
    try {
      const p = new URLSearchParams({ date: eventDate })
      if (startTime) p.set('start', startTime)
      if (endTime) p.set('end', endTime)
      const res = await fetch(`/api/slots/${truck.id}?${p}`)
      const data = await res.json()
      setManualSlots(data.slots || [])
      setApiQueueByCat(data.queueByCat || {})
    } catch { setManualSlots([]); setApiQueueByCat({}) }
  }, [truck?.id])

  useEffect(() => {
    fetchUpcomingEvents()
  }, [fetchUpcomingEvents])

  useEffect(() => {
    if (!requestEventPickerOpen) return
    fetchUpcomingEvents()
    setShowEventPicker(true)
    onEventPickerOpened?.()
  }, [requestEventPickerOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync manualEvent when the dashboard switches to a different event
  useEffect(() => {
    if (!controlledEvent) return
    if (controlledEvent.id === manualEvent?.id) return
    setManualEvent(controlledEvent)
    fetchManualSlots(controlledEvent.event_date, controlledEvent.start_time, controlledEvent.end_time)
    setManualSlot('')
  }, [controlledEvent?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync status-only changes on the same event (e.g. after open/close)
  useEffect(() => {
    if (!controlledEvent) return
    if (controlledEvent.id !== manualEvent?.id) return
    if (controlledEvent.status === manualEvent?.status) return
    setManualEvent(prev => prev ? { ...prev, status: controlledEvent.status } : controlledEvent)
  }, [controlledEvent?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (manualEvent || upcomingEvents.length === 0) return
    const todayIso = new Date().toISOString().split('T')[0]
    const todayEvs = upcomingEvents.filter(e => e.event_date === todayIso)
    if (todayEvs.length === 1) {
      setManualEvent(todayEvs[0])
    } else if (todayEvs.length === 0) {
      // No today event — pre-select the next upcoming one
      setManualEvent(upcomingEvents[0])
    }
  }, [upcomingEvents])

  useEffect(() => {
    if (manualEvent?.event_date) {
      fetchManualSlots(manualEvent.event_date, manualEvent.start_time, manualEvent.end_time)
    }
  }, [manualEvent?.event_date, manualEvent?.start_time, manualEvent?.end_time, fetchManualSlots])

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
  const handleSlotChange = (value: string) => {
    if (!value) { setManualSlot(''); return }
    const s = manualSlots.find(sl => sl.collection_time === value)
    if (s && s.max_orders < 999) {
      const remaining = Math.max(0, s.max_orders - s.current_orders)
      const pct = s.current_orders / s.max_orders
      if (pct >= 0.7) { setPendingSlot({ time: value, remaining, isFull: pct >= 1 }); return }
    }
    setManualSlot(value)
  }

  // ── submit ──────────────────────────────────────────────────────────────────
  const submitManual = async () => {
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
            event_id: null,
            event_date: manualEvent?.event_date || null,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showToast(data.slotFull ? `Order #${data.orderId} saved — slot full` : `Order #${data.orderId} confirmed`)
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
          <option value="">⚡ ASAP{adjustedAsapSlot ? ` — ${adjustedAsapSlot.collection_time}` : ''}</option>
          {manualSlots.filter(s => !s.is_past || s.is_grace).map(s => {
            if (s.is_grace) return <option key={s.collection_time} value={s.collection_time}>⚠️ {s.collection_time} · After closing</option>
            const unlimited = s.max_orders >= 999
            const remaining = Math.max(0, s.max_orders - s.current_orders)
            const pct = unlimited ? 0 : s.current_orders / s.max_orders
            const ind = pct >= 1 ? '🔴' : pct >= 0.7 ? '🟡' : '🟢'
            const label = (!unlimited && pct >= 1) ? ' · Full' : (!unlimited && pct >= 0.7) ? ` · ${remaining} left` : ''
            return <option key={s.collection_time} value={s.collection_time}>{s.collection_time} {ind}{label}</option>
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
            return opts.map(time => <option key={time} value={time}>{time}</option>)
          })()}
        </select>
      )}
      {readyTime && (() => {
        const isFutureDay = manualEvent && manualEvent.event_date > new Date().toISOString().split('T')[0]
        const dateLabel = isFutureDay
          ? new Date(manualEvent!.event_date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
          : null
        const m = queueAware.minsFromNow
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
        onClick={submitManual}
        disabled={loading || !hasItems || !manualEvent}
        className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold py-4 rounded-xl text-base disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-[0.98]"
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

  const menuGrid = (
    <div className="space-y-4">
      {[
        ...categoryOrder.filter(cat => menuGroups[cat]?.length),
        ...Object.keys(menuGroups).filter(cat => !categoryOrder.includes(cat) && menuGroups[cat]?.length),
      ].map(cat => {
        const items = menuGroups[cat]
        if (!items?.length) return null
        return (
          <div key={cat}>
            <p className="text-xs font-black text-orange-600 uppercase tracking-wide mb-2">
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </p>
            <div className="flex flex-wrap gap-2">
              {items.map(item => {
                const isSoldOut = !(item.available ?? true)
                const stock = itemStocks.find(s => s.name === item.name)
                const catSt = categoryStocks.find(s => s.category === cat)
                const itemRem = calcStockRemaining(stock?.stock_count ?? null, stock?.orders_count ?? 0)
                const catRem = calcStockRemaining(catSt?.stock_count ?? null, catSt?.orders_count ?? 0)
                const effectiveRem = calcEffectiveRemaining(itemRem, catRem)
                const isLow = !isSoldOut && effectiveRem !== null && effectiveRem <= 10
                const catModGroups = truckMenu?.categories?.find(c => c.name === cat)?.modifierGroups || []
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
          </div>
        )
      })}

    </div>
  )

  const menuList = (
    <div>
      {[
        ...categoryOrder.filter(cat => menuGroups[cat]?.length),
        ...Object.keys(menuGroups).filter(cat => !categoryOrder.includes(cat) && menuGroups[cat]?.length),
      ].map(cat => {
        const items = menuGroups[cat]
        if (!items?.length) return null
        return (
          <div key={cat}>
            <div className="sticky top-0 bg-white z-10 py-2 border-b border-slate-100">
              <p className="text-xs font-black text-orange-600 uppercase tracking-wide">
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </p>
            </div>
            <div>
              {items.map(item => {
                const isSoldOut = !(item.available ?? true)
                const stock = itemStocks.find(s => s.name === item.name)
                const catSt = categoryStocks.find(s => s.category === cat)
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
          </div>
        )
      })}

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
            <button onClick={() => { fetchUpcomingEvents(); setShowEventPicker(true) }}
              className="text-xs font-bold text-orange-600 border border-orange-300 rounded-lg px-2.5 py-1 shrink-0 hover:bg-orange-100 active:scale-95">
              Change
            </button>
          </div>
          {(manualEvent.status === 'confirmed' || manualEvent.status === 'closed') && onOpenEvent && (
            <button
              onClick={() => onOpenEvent(manualEvent.id)}
              className="mt-2 w-full bg-teal-600 text-white font-bold py-2.5 rounded-xl text-sm hover:bg-teal-700 active:scale-[0.98] transition-all">
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
          <button onClick={() => { fetchUpcomingEvents(); setShowEventPicker(true) }}
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
            const itemsTakenFromBasket = Object.entries(rawSlots)
              .filter(([, raw]) => raw.startsWith('USE_EXISTING:'))
              .map(([, raw]) => raw.replace('USE_EXISTING:', ''))
              .filter(Boolean)
            if (itemsTakenFromBasket.length > 0) {
              setManualItems(prev => prev.filter(item => !itemsTakenFromBasket.includes(item.cartKey || item.name)))
            }
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

      {/* ── Slot capacity confirmation ── */}
      {pendingSlot && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <div className="text-center mb-4">
              <div className="text-3xl mb-2">{pendingSlot.isFull ? '🔴' : '🟡'}</div>
              <p className="font-bold text-slate-900 text-base">
                {pendingSlot.isFull
                  ? 'This slot is full. Use anyway?'
                  : `This slot only has ${pendingSlot.remaining} space${pendingSlot.remaining !== 1 ? 's' : ''} left. Use anyway?`}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setManualSlot(''); setPendingSlot(null) }} className="flex-1 bg-slate-100 text-slate-700 font-bold py-3 rounded-xl hover:bg-slate-200 text-sm">Cancel</button>
              <button onClick={() => { setManualSlot(pendingSlot.time); setPendingSlot(null) }} className="flex-1 bg-orange-600 text-white font-bold py-3 rounded-xl hover:bg-orange-700 text-sm">Use anyway</button>
            </div>
          </div>
        </div>
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
                {upcomingEvents.length === 0
                  ? <p className="text-sm text-slate-400 text-center py-6">No upcoming events found</p>
                  : upcomingEvents.map(ev => {
                    const isSelected = manualEvent?.id === ev.id
                    const isFuture = ev.event_date > todayIso
                    return (
                      <button key={ev.id} onClick={() => { setManualEvent(ev); setShowEventPicker(false); fetchManualSlots(ev.event_date, ev.start_time, ev.end_time); setManualSlot(''); onEventChange?.(ev.id) }}
                        className={`w-full text-left px-3 py-3 rounded-xl border transition-colors ${isSelected ? 'border-orange-400 bg-orange-50' : 'border-slate-200 hover:border-orange-200 hover:bg-orange-50/50'}`}>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-slate-900 flex-1">{fmtEvDate(ev.event_date)} · {formatTime(ev.start_time)}–{formatTime(ev.end_time)}</p>
                          {ev.status === 'closed' && <span className="text-[10px] font-bold text-slate-400 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 flex-shrink-0">● Closed</span>}
                          {ev.status === 'open' && <span className="text-[10px] font-bold text-green-600 bg-green-50 border border-green-200 rounded px-1.5 py-0.5 flex-shrink-0">● Live</span>}
                          {isFuture && ev.status !== 'closed' && ev.status !== 'open' && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 flex-shrink-0">Future</span>}
                        </div>
                        {(ev.venue_name || ev.town) && <p className="text-xs text-slate-500 mt-0.5">{fmtVenue(ev.venue_name, ev.town)}</p>}
                        {isSelected && <span className="text-[10px] font-black text-orange-600 uppercase tracking-wide">Selected</span>}
                      </button>
                    )
                  })}
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
