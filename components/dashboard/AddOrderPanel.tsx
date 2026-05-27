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

// ─── helpers ─────────────────────────────────────────────────────────────────

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
}

// ─── component ───────────────────────────────────────────────────────────────

export function AddOrderPanel({
  truck, truckMenu, menuGroups,
  itemStocks, categoryStocks, categoryConfigs, categoryAllowNotes,
  orders, waitMinutes, token, pin, todayEvent,
  categoryOrder, itemCategoryMap,
  showToast, onOrderPlaced,
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
  const manualAsapSlot = getAsapSlot(manualSlots)
  const availableDeals = (truckMenu?.bundles || []).filter(b => b.available)

  const calculation = useMemo(() => calculateOrderTotal(
    manualItems.map(item => ({ name: item.name, price: item.unit_price, quantity: item.quantity })),
    appliedDeals,
    truckMenu?.items || [],
    null,
  ), [manualItems, appliedDeals, truckMenu])

  const { itemsTotal: manualItemsSubtotal, dealSavings, total: manualTotal } = calculation

  const queueAware = useMemo(() => {
    if (!manualItems.length && !appliedDeals.length) return { readyTime: '', minsFromNow: 0 }
    const nowMins = new Date().getHours() * 60 + new Date().getMinutes()
    const eventStartMins = manualEvent
      ? (() => { const [h, m] = manualEvent.start_time.split(':').map(Number); return h * 60 + m })()
      : null
    const beforeEvent = eventStartMins !== null && (
      !manualEvent ||
      manualEvent.event_date > new Date().toISOString().split('T')[0] ||
      nowMins < eventStartMins
    )
    const queueByCat: Record<string, number> = {}
    orders.filter(o => ['pending', 'confirmed'].includes(o.status)).forEach(o => {
      o.items.forEach(item => {
        const cat = (truckMenu?.items.find(m => m.name === item.name)?.category || 'mains').toLowerCase()
        queueByCat[cat] = (queueByCat[cat] || 0) + item.quantity
      })
    })
    const newByCat: Record<string, number> = {}
    manualItems.forEach(item => {
      const cat = (truckMenu?.items.find(m => m.name === item.name)?.category || 'mains').toLowerCase()
      newByCat[cat] = (newByCat[cat] || 0) + item.quantity
    })
    if (beforeEvent && eventStartMins !== null) {
      let extraBatchMins = 0
      for (const [cat, newQty] of Object.entries(newByCat)) {
        const cfg = categoryConfigs[cat] || getCatConfig(cat)
        if (!cfg.secs) continue
        const totalQty = (queueByCat[cat] || 0) + newQty
        const totalBatches = Math.ceil(totalQty / cfg.batch)
        const mins = Math.ceil(Math.max(0, totalBatches - 1) * cfg.secs / 60)
        extraBatchMins = Math.max(extraBatchMins, mins)
      }
      const asapMins = Math.round((eventStartMins + extraBatchMins + waitMinutes) / 5) * 5
      const h = Math.floor(asapMins / 60); const m2 = asapMins % 60
      return {
        readyTime: `${String(h).padStart(2, '0')}:${String(m2).padStart(2, '0')}`,
        minsFromNow: Math.max(0, asapMins - nowMins),
      }
    }
    const totalSecs = calcQueueAwareReadySecs(newByCat, queueByCat, categoryConfigs, waitMinutes * 60 + 120)
    if (totalSecs === 0) return { readyTime: '', minsFromNow: 0 }
    const t = new Date(); t.setSeconds(t.getSeconds() + totalSecs)
    return {
      readyTime: `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`,
      minsFromNow: Math.ceil(totalSecs / 60),
    }
  }, [manualItems, appliedDeals, orders, manualEvent, categoryConfigs, waitMinutes, truckMenu])

  const readyTime = queueAware.readyTime || calcReadyTime(manualItems, waitMinutes * 60, truckMenu?.items, categoryConfigs)

  const isPastGrace = manualEvent ? (() => {
    const today = new Date().toISOString().split('T')[0]
    if (manualEvent.event_date > today) return false
    const [h, m] = manualEvent.end_time.split(':').map(Number)
    return new Date().getHours() * 60 + new Date().getMinutes() > h * 60 + m + 30
  })() : false

  const hasItems = manualItems.length > 0 || appliedDeals.length > 0
  const totalItemCount = manualItems.reduce((s, i) => s + i.quantity, 0) + appliedDeals.length

  // ── fetch events / slots ────────────────────────────────────────────────────
  const hasAutoSelected = useRef(false)

  const fetchUpcomingEvents = useCallback(async (autoSelect = false) => {
    if (!truck?.id) return
    try {
      const res = await fetch(`/api/events?truck=${truck.id}`)
      const data = await res.json()
      if (!data.events?.length) return
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() + 14)
      const upcoming = data.events.filter((ev: any) => {
        const [d, m, y] = ev.date.split('/').map(Number)
        return new Date(y, m - 1, d) <= cutoff
      })
      const eventsToShow = upcoming.length > 0 ? upcoming : [data.events[0]]
      const mapped: EventRecord[] = eventsToShow.map((ev: any) => ({
        id: ev.date_iso,
        event_date: ev.date_iso,
        start_time: ev.start_time,
        end_time: ev.end_time,
        venue_name: [ev.venue_name, ev.village].filter(Boolean).join(', ') || null,
      }))
      setUpcomingEvents(mapped)
      if (autoSelect) {
        const now = new Date()
        const todayIso = now.toISOString().split('T')[0]
        const nowMins = now.getHours() * 60 + now.getMinutes()
        const current = mapped.find(ev => {
          if (ev.event_date !== todayIso) return false
          const [sh, sm] = ev.start_time.split(':').map(Number)
          const [eh, em] = ev.end_time.split(':').map(Number)
          return nowMins >= sh * 60 + sm && nowMins <= eh * 60 + em + 30
        })
        const next = mapped.find(ev => {
          if (ev.event_date > todayIso) return true
          const [sh, sm] = ev.start_time.split(':').map(Number)
          return sh * 60 + sm > nowMins
        }) || mapped[0] || null
        const best = current || next
        if (best) setManualEvent(prev => prev ?? best)
      }
    } catch { }
  }, [truck?.id])

  const fetchManualSlots = useCallback(async (eventDate: string, startTime?: string, endTime?: string) => {
    if (!truck?.id) return
    try {
      const p = new URLSearchParams({ date: eventDate })
      if (startTime) p.set('start', startTime)
      if (endTime) p.set('end', endTime)
      const res = await fetch(`/api/slots/${truck.id}?${p}`)
      const data = await res.json()
      setManualSlots(data.slots || [])
    } catch { setManualSlots([]) }
  }, [truck?.id])

  useEffect(() => {
    if (hasAutoSelected.current) return
    hasAutoSelected.current = true
    if (!todayEvent) fetchUpcomingEvents(true)
  }, [todayEvent, fetchUpcomingEvents])

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
    const effectiveSlot = manualSlot || manualAsapSlot?.collection_time || null
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
          <option value="">⚡ ASAP{manualAsapSlot ? ` — ${manualAsapSlot.collection_time}` : ''}</option>
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
      {readyTime && (
        <p className="text-xs text-green-600 font-medium mt-1.5">⚡ ~{queueAware.minsFromNow} min{queueAware.minsFromNow !== 1 ? 's' : ''} · around {readyTime}</p>
      )}
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
        disabled={loading || !hasItems || isPastGrace}
        className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold py-4 rounded-xl text-base disabled:opacity-40 transition-colors active:scale-[0.98]"
      >
        {loading ? 'Confirming...' : isPastGrace ? 'Grace period ended' : `Confirm order${manualTotal > 0 ? ` · £${manualTotal.toFixed(2)}` : ''}`}
      </button>
    </div>
  )

  const cartLines = (
    <div className="space-y-1">
      {(() => {
        const grouped: Record<string, BasketItem[]> = {}
        manualItems.forEach(item => {
          const cat = truckMenu?.items.find(m => m.name === item.name)?.category || 'other'
          if (!grouped[cat]) grouped[cat] = []
          grouped[cat].push(item)
        })
        return Object.entries(grouped).map(([cat, items]) => (
          <div key={cat}>
            {Object.keys(grouped).length > 1 && (
              <p className="text-[10px] font-black text-orange-500 uppercase tracking-wide mb-1 mt-2 first:mt-0">{cat}</p>
            )}
            {items.map(item => {
              const modLabel = (item.modifiers || []).map(m => m.name).join(', ')
              const subLabel = [modLabel, item.specialInstructions].filter(Boolean).join(' · ')
              const rowKey = item.cartKey || item.name
              const catAllowNotes = categoryAllowNotes[cat.toLowerCase()] ?? false
              const itemCatModGroups = truckMenu?.categories?.find(c => c.name === (truckMenu?.items.find(m => m.name === item.name)?.category || ''))?.modifierGroups || []
              const fullMenuItem = truckMenu?.items.find(m => m.name === item.name)
              return (
                <div key={rowKey} className="flex items-start gap-2 py-1">
                  <div className="flex items-center gap-1 shrink-0 mt-0.5">
                    <button onClick={() => adjustManualQty(rowKey, -1)} className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center font-bold hover:bg-red-100 hover:text-red-600 text-sm leading-none">−</button>
                    <span className="w-5 text-center font-black text-sm text-slate-900">{item.quantity}</span>
                    <button onClick={() => adjustManualQty(rowKey, 1)} className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center font-bold hover:bg-orange-100 hover:text-orange-600 text-sm leading-none">+</button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-bold text-slate-900">{item.name}</span>
                      {itemCatModGroups.length > 0 && fullMenuItem && (
                        <button onClick={() => openManualItemModal(fullMenuItem, itemCatModGroups, rowKey)}
                          className="text-[10px] font-bold text-orange-500 border border-orange-200 rounded-md px-1.5 py-0.5 hover:bg-orange-50 shrink-0">
                          {subLabel ? '✏ Edit' : '+ Customise'}
                        </button>
                      )}
                    </div>
                    {(subLabel || catAllowNotes) && (
                      <p className={`text-[10px] mt-0.5 leading-tight ${subLabel ? 'text-orange-500 font-medium' : 'text-slate-400 italic'}`}>
                        {subLabel || 'Standard'}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 mt-0.5">
                    <InlinePriceEditor price={item.unit_price} quantity={item.quantity}
                      onChange={p => setManualItems(prev => prev.map(i => (i.cartKey || i.name) === rowKey ? { ...i, unit_price: p } : i))} />
                  </div>
                </div>
              )
            })}
          </div>
        ))
      })()}
      {appliedDeals.length > 0 && (
        <div className="border-t border-slate-200 pt-2 space-y-1">
          {manualItems.length > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Items subtotal</span>
              <span className="text-slate-600">£{manualItemsSubtotal.toFixed(2)}</span>
            </div>
          )}
          {appliedDeals.map((d, i) => {
            const dealSlotMods = Object.entries(d.slotModifiers || {})
              .filter(([, mods]) => mods.length > 0)
              .map(([cat, mods]) => ({ itemName: d.slots[cat], mods }))
              .filter(({ itemName }) => itemName)
            return (
              <div key={i} className="text-xs space-y-0.5">
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <span className="text-green-600 font-bold">🎁 {d.bundle.name}</span>
                    <span className="text-green-500 font-normal ml-1">({Object.values(d.slots).filter(Boolean).join(', ')})</span>
                    <button
                      onClick={() => {
                        if (d.itemsTakenFromBasket?.length > 0) {
                          setManualItems(prev => prev.filter(item => !d.itemsTakenFromBasket.includes(item.cartKey || item.name)))
                        }
                        setAppliedDeals(prev => prev.filter((_, n) => n !== i))
                      }}
                      className="text-slate-300 hover:text-red-500 ml-1.5 text-sm leading-none align-middle"
                    >×</button>
                  </div>
                  <span className="text-green-600 font-bold shrink-0">£{d.bundle.bundle_price.toFixed(2)}</span>
                </div>
                {dealSlotMods.map(({ itemName, mods }) => (
                  <div key={itemName} className="flex justify-between pl-3">
                    <span className="text-slate-400">↳ {itemName}: + {mods.map(m => m.name).join(', ')}</span>
                    <span className="text-slate-400">+£{mods.reduce((s, m) => s + m.price, 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
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
                const itemRem = stock?.stock_count != null ? stock.stock_count - (stock.orders_count || 0) : null
                const catSt = categoryStocks.find(s => s.category === cat)
                const catRem = catSt?.stock_count != null ? catSt.stock_count - (catSt.orders_count || 0) : null
                const effectiveRem = itemRem !== null ? (catRem !== null ? Math.min(itemRem, catRem) : itemRem) : catRem
                const isLow = !isSoldOut && effectiveRem !== null && effectiveRem <= 10
                const catModGroups = truckMenu?.categories?.find(c => c.name === cat)?.modifierGroups || []
                const totalInBasket = manualItems.filter(i => i.name === item.name).reduce((s, i) => s + i.quantity, 0)
                if (isSoldOut) return (
                  <div key={item.name} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-100 bg-slate-50 cursor-not-allowed opacity-60 min-h-[56px]">
                    <span className="text-xs text-slate-500 line-through">{item.name}</span>
                    <span className="text-[10px] text-red-400 font-bold">sold out</span>
                  </div>
                )
                return (
                  <button
                    key={item.name}
                    onClick={() => addManualItem(item)}
                    className={`flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-xl border text-sm font-bold transition-all active:scale-95 min-h-[56px] min-w-[80px] ${totalInBasket > 0 ? 'bg-orange-600 border-orange-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-orange-300 hover:bg-white'}`}
                  >
                    <div className="flex items-center gap-1.5">
                      {totalInBasket > 0 && <span className="text-orange-200">{totalInBasket}×</span>}
                      <span>{item.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-normal ${totalInBasket > 0 ? 'text-orange-200' : 'text-slate-400'}`}>£{item.price.toFixed(2)}</span>
                      {isLow && !totalInBasket && <span className="text-[10px] text-orange-500 font-black">({effectiveRem} left)</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      {availableDeals.length > 0 && (
        <button
          onClick={() => {
            if (availableDeals.length === 1) { setActiveDealBundle(availableDeals[0]); setShowDealsModal(true) }
            else { setActiveDealBundle(null); setShowDealsModal(true) }
          }}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-orange-300 text-orange-600 hover:bg-orange-50 transition-colors text-sm font-bold active:scale-[0.99] mt-2"
        >
          <span>🎁</span>
          <span>{appliedDeals.length > 0 ? '+ Add another deal' : '+ Apply a deal'}</span>
          {appliedDeals.length > 0 && <span className="text-xs text-orange-400 font-normal">({appliedDeals.length} applied)</span>}
        </button>
      )}
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
                const itemRem = stock?.stock_count != null ? stock.stock_count - (stock.orders_count || 0) : null
                const catSt = categoryStocks.find(s => s.category === cat)
                const catRem = catSt?.stock_count != null ? catSt.stock_count - (catSt.orders_count || 0) : null
                const effectiveRem = itemRem !== null ? (catRem !== null ? Math.min(itemRem, catRem) : itemRem) : catRem
                const isLow = !isSoldOut && effectiveRem !== null && effectiveRem <= 10
                const totalInBasket = manualItems.filter(i => i.name === item.name).reduce((s, i) => s + i.quantity, 0)
                return (
                  <div key={item.name} className={`flex items-center gap-3 py-3 border-b border-slate-50 ${isSoldOut ? 'opacity-50' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${isSoldOut ? 'line-through text-slate-400' : 'text-slate-800'}`}>{item.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-slate-400">£{item.price.toFixed(2)}</span>
                        {isSoldOut && <span className="text-[10px] text-red-400 font-bold">sold out</span>}
                        {isLow && <span className="text-[10px] text-orange-500 font-black">{effectiveRem} left</span>}
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
                            onClick={() => addManualItem(item)}
                            className="w-8 h-8 rounded-full bg-orange-600 flex items-center justify-center text-white font-bold text-lg leading-none active:scale-90"
                          >+</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => addManualItem(item)}
                          className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-xl leading-none active:scale-90 shrink-0"
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

      {availableDeals.length > 0 && (
        <button
          onClick={() => {
            if (availableDeals.length === 1) { setActiveDealBundle(availableDeals[0]); setShowDealsModal(true) }
            else { setActiveDealBundle(null); setShowDealsModal(true) }
          }}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-orange-300 text-orange-600 hover:bg-orange-50 transition-colors text-sm font-bold active:scale-[0.99] mt-4"
        >
          <span>🎁</span>
          <span>{appliedDeals.length > 0 ? '+ Add another deal' : '+ Apply a deal'}</span>
          {appliedDeals.length > 0 && <span className="text-xs text-orange-400 font-normal">({appliedDeals.length} applied)</span>}
        </button>
      )}
    </div>
  )

  const eventBanner = (
    <div className="mb-4">
      {manualEvent ? (
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-orange-900 truncate">{(() => {
              const t = new Date().toISOString().split('T')[0]
              const tmrw = new Date(Date.now() + 86400000).toISOString().split('T')[0]
              const d = manualEvent.event_date
              const label = d === t ? 'Today' : d === tmrw ? 'Tomorrow' : new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
              return `📅 ${label} · ${manualEvent.start_time}–${manualEvent.end_time}`
            })()}</p>
            {manualEvent.venue_name && <p className="text-xs text-orange-600 truncate mt-0.5">{manualEvent.venue_name}</p>}
          </div>
          <button onClick={() => { fetchUpcomingEvents(); setShowEventPicker(true) }}
            className="text-xs font-bold text-orange-600 border border-orange-300 rounded-lg px-2.5 py-1 shrink-0 hover:bg-orange-100 active:scale-95">
            Change
          </button>
        </div>
      ) : (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 flex items-center justify-between">
          <span className="text-sm text-slate-400">No event selected</span>
          <button onClick={() => { fetchUpcomingEvents(); setShowEventPicker(true) }}
            className="text-xs font-bold text-slate-600 border border-slate-200 rounded-lg px-2.5 py-1 hover:bg-slate-100 active:scale-95">
            Select event
          </button>
        </div>
      )}
    </div>
  )

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── iPad / desktop: two-column split ── */}
      <div className="hidden md:flex -mx-4 -mt-4" style={{ height: 'calc(100dvh - 130px)' }}>

        {/* LEFT — scrollable menu */}
        <div className="w-[58%] overflow-y-auto border-r border-slate-200 p-4">
          {eventBanner}
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
                      {group.options.map((opt: ModifierOption) => {
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
      {showEventPicker && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={() => setShowEventPicker(false)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="px-4 pt-4 pb-3 border-b border-slate-100 flex items-center justify-between">
              <p className="font-black text-slate-900 text-base">Select event</p>
              <button onClick={() => setShowEventPicker(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 text-lg">✕</button>
            </div>
            <div className="p-3 space-y-2 max-h-72 overflow-y-auto">
              {upcomingEvents.length === 0
                ? <p className="text-sm text-slate-400 text-center py-6">No upcoming events found</p>
                : upcomingEvents.map(ev => {
                  const t = new Date().toISOString().split('T')[0]
                  const tmrw = new Date(Date.now() + 86400000).toISOString().split('T')[0]
                  const label = ev.event_date === t ? 'Today' : ev.event_date === tmrw ? 'Tomorrow' : new Date(ev.event_date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
                  const isSelected = manualEvent?.id === ev.id
                  return (
                    <button key={ev.id} onClick={() => { setManualEvent(ev); setShowEventPicker(false); fetchManualSlots(ev.event_date, ev.start_time, ev.end_time); setManualSlot('') }}
                      className={`w-full text-left px-3 py-3 rounded-xl border transition-colors ${isSelected ? 'border-orange-400 bg-orange-50' : 'border-slate-200 hover:border-orange-200 hover:bg-orange-50/50'}`}>
                      <p className="text-sm font-bold text-slate-900">{label} · {ev.start_time}–{ev.end_time}</p>
                      {ev.venue_name && <p className="text-xs text-slate-500 mt-0.5">{ev.venue_name}</p>}
                      {isSelected && <span className="text-[10px] font-black text-orange-600 uppercase tracking-wide">Selected</span>}
                    </button>
                  )
                })}
            </div>
            <div className="p-3 border-t border-slate-100 pb-8">
              <button onClick={() => setShowEventPicker(false)} className="w-full border border-slate-200 rounded-xl py-2.5 text-sm text-slate-600 font-medium hover:bg-slate-50">Done</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
