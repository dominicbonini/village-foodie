'use client';

import { useState, useEffect, useLayoutEffect, useMemo, useRef, use } from 'react';
import { getBundleSlotCategories as getSlotCats, calculateDealOriginalPrice as calcOrigPrice } from '@/lib/deal-utils'
import { DealsModal } from '@/components/dashboard/DealsModal'
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { calculateOrderTotal, calculateDealOriginalPrice, formatModifiers } from '@/lib/order-calculations';
import { OrderLineItem } from '@/components/dashboard/OrderLineItem';
import { cleanupDealsForItem, groupByCategory, consumeBasketItemsForDeal, dealConsumedCartKeys } from '@/lib/basket-utils';
import { getAsapSlot } from '@/lib/slot-utils';
import { projectBackwardOccupancy, fitOrderBackward, earliestBackwardFitSlot } from '@/lib/slot-availability';
import { getCatConfig, catCookSecs, calcQueueAwareReadySecs } from '@/lib/prep-utils';
import { hasFeature } from '@/lib/features';
import { formatTime, localTodayIso } from '@/lib/time-utils';
import { isModifierAvailable } from '@/lib/modifier-utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MenuItem {
  name: string; description?: string; price: number; available?: boolean; category: string; stock_remaining?: number | null; image?: string | null; photo_url?: string | null; allergens?: string[]; dietary?: string[]
}
interface UpsellRule {
  id: string; trigger_category: string; suggest_category: string; max_suggestions: number; show_at_checkout: boolean
}
interface Bundle {
  name: string; description: string
  original_price: number | null  // null = calculate dynamically from slot items
  bundle_price: number
  available: boolean
  start_time: string | null; end_time: string | null
  slot_1_category: string | null; slot_2_category: string | null
  slot_3_category: string | null; slot_4_category: string | null
  slot_5_category: string | null; slot_6_category: string | null
}
interface DiscountCode { code: string; type: 'pct' | 'fixed'; value: number; active: boolean }
interface ModifierOption { id: string; name: string; price_adjustment: number; available?: boolean }
interface ModifierGroup { id: string; name: string; options: ModifierOption[] }
interface TruckMenu { categories?: Array<{ id: string; name: string; prep_secs?: number | null; batch_size?: number | null; allowNotes?: boolean; modifierGroups?: ModifierGroup[] }>; items: MenuItem[]; upsell_rules: UpsellRule[]; bundles: Bundle[]; codes: DiscountCode[] }
interface TruckData { id: string; name: string; logo: string | null; mode: 'village' | 'pub'; venue_name: string | null; time_selection_enabled?: boolean; paused?: boolean; pauseReason?: 'manual' | 'offline' | null; extra_wait_mins?: number; plan: 'starter' | 'pro' | 'max'; allergen_info_url?: string | null; allergen_info_text?: string | null; ordering_available?: boolean }
interface EventData {
  id: string            // truck_events.id — the event the customer is ordering against
  date: string          // dd/mm/yyyy
  date_iso: string      // yyyy-mm-dd
  date_friendly: string
  start_time: string
  end_time: string
  venue_name: string
  village: string
  notes: string
}

interface BasketItem {
  menuItem: MenuItem
  quantity: number
  modifiers: { name: string; price: number }[]
  specialInstructions: string
  cartKey: string
}
interface AppliedDeal { bundle: Bundle; slots: Record<string, string>; itemsTakenFromBasket: string[]; modifierExtra?: number; slotModifiers?: Record<string, { name: string; price: number }[]>; slotNotes?: Record<string, string> }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBundleAvailabilityMessage(b: Bundle): string | null {
  if (!b.start_time && !b.end_time) return null
  const now = new Date()
  const cur = now.getHours() * 60 + now.getMinutes()
  if (b.start_time) {
    const [h, m] = b.start_time.split(':').map(Number)
    if (cur < h * 60 + m) return `Available from ${formatTime(b.start_time)}`
  }
  if (b.end_time) {
    const [h, m] = b.end_time.split(':').map(Number)
    if (cur > h * 60 + m) return `Available until ${formatTime(b.end_time)} — no longer available`
  }
  return null
}

// Calculate the original price for a deal dynamically from chosen slot items
function calcDealOriginalPrice(deal: AppliedDeal, menuItems: MenuItem[]): number {
  // If the bundle has a fixed original_price, use it
  if (deal.bundle.original_price !== null && deal.bundle.original_price > 0) {
    return deal.bundle.original_price
  }
  // Otherwise use shared utility to calculate from slots
  return calcOrigPrice(deal.slots, menuItems)
}

const HOURS = Array.from({ length: 13 }, (_, i) => String(i + 9).padStart(2, '0'))
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function makeCartKey(itemName: string, mods: { name: string }[], notes?: string): string {
  const parts: string[] = []
  const modStr = [...mods].map(m => m.name).sort().join('|')
  if (modStr) parts.push(modStr)
  const noteStr = (notes || '').trim()
  if (noteStr) parts.push(`note:${noteStr}`)
  return parts.length > 0 ? `${itemName}::${parts.join('::')}` : itemName
}

// Live (open now) vs Pre-order (confirmed, not yet open) — derived from the event's own times,
// local-parse per the engineering manual. Past events are already filtered out before display,
// so a non-live upcoming event is a pre-order (ordering works via submit's confirmed-allowed guard).
function isEventLiveNow(e: { date_iso?: string; start_time?: string; end_time?: string }): boolean {
  if (!e.date_iso || !e.start_time || !e.end_time) return false
  const now = new Date()
  return now >= new Date(`${e.date_iso}T${e.start_time}`) && now < new Date(`${e.date_iso}T${e.end_time}`)
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OrderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  // Per-event deep-link (hatchgrab "Order now" flow). ?event_id present → scope the page to that
  // one truck_events row (single-event card + "Change"). Absent → the order-entry schedule:
  // a single-event truck auto-selects; a multi-event truck shows the picker to choose from.
  const searchParams = useSearchParams()
  const eventIdParam = searchParams.get('event_id')

  const [truck, setTruck] = useState<TruckData | null>(null)
  const [menu, setMenu] = useState<TruckMenu | null>(null)
  const [showAllergenModal, setShowAllergenModal] = useState(false)
  const [events, setEvents] = useState<EventData[]>([])
  const [event, setEvent] = useState<EventData | null>(null)
  const [eventLoading, setEventLoading] = useState(true)
  const [noEvents, setNoEvents] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Non-destructive "orders paused" notice on a submit 423 — keeps the basket + order UI
  // (unlike `error`, which renders the page-replacing error view).
  const [pauseNotice, setPauseNotice] = useState<string | null>(null)
  // Non-destructive "just sold out" notice on a submit 409 (atomic stock guard) — keeps the
  // basket (capped to what's left) so the customer can review + re-submit. Customer hard stop.
  const [stockNotice, setStockNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submittedOrderId, setSubmittedOrderId] = useState<string | null>(null)
  const [submittedAutoAccepted, setSubmittedAutoAccepted] = useState(false)
  const [submittedConfirmedSlot, setSubmittedConfirmedSlot] = useState<string | null>(null)
  const [submittedRequestedSlot, setSubmittedRequestedSlot] = useState<string | null>(null)
  const [submittedSlotChanged, setSubmittedSlotChanged] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const [summaryExpanded, setSummaryExpanded] = useState(true)
  const [footerHeight, setFooterHeight] = useState(0)
  const footerRef = useRef<HTMLDivElement>(null)

  // Sync padding synchronously after every render — fires before paint so the
  // expanded footer and the updated paddingBottom are always drawn together.
  useLayoutEffect(() => {
    if (!footerRef.current) return
    const h = Math.ceil(footerRef.current.offsetHeight)
    if (h !== footerHeight) setFooterHeight(h)
  })

  // ResizeObserver as backup for orientation changes / window resize events
  // that happen outside a React render cycle.
  useEffect(() => {
    if (!footerRef.current) return
    const el = footerRef.current
    const observer = new ResizeObserver(() => {
      setFooterHeight(Math.ceil(el.offsetHeight))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const fn = () => setIsScrolled(window.scrollY > 120)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  const [basket, setBasket] = useState<BasketItem[]>([])
  const [appliedDeals, setAppliedDeals] = useState<AppliedDeal[]>([])
  const [dealModalOpen, setDealModalOpen] = useState(false)
  const [selectedBundleForModal, setSelectedBundleForModal] = useState<Bundle | null>(null)
  const [itemModal, setItemModal] = useState<{ item: MenuItem; modGroups: ModifierGroup[]; upsells: MenuItem[] } | null>(null)
  const [modalMods, setModalMods] = useState<{ name: string; price: number }[]>([])
  const [modalNotes, setModalNotes] = useState('')
  // Upsells STAGED in the modal (like modalMods) — selected names, committed on "Add to basket".
  const [modalUpsells, setModalUpsells] = useState<string[]>([])
  const [openNoteKey, setOpenNoteKey] = useState<string | null>(null)
  const [noteInputVal, setNoteInputVal] = useState('')
  const [discountInput, setDiscountInput] = useState('')
  const [appliedCode, setAppliedCode] = useState<DiscountCode | null>(null)
  const [discountError, setDiscountError] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [slotHour, setSlotHour] = useState('')
  const [slotMinute, setSlotMinute] = useState('')
  const [availableSlots, setAvailableSlots] = useState<{collection_time:string;available:boolean;remaining:number;is_past:boolean;too_soon:boolean;is_grace:boolean}[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [asapSlot, setAsapSlot] = useState<string|null>(null)
  const [asapChosen, setAsapChosen] = useState(true)
  const [queueByCat, setQueueByCat] = useState<Record<string,number>>({})
  const [serverCatConfigs, setServerCatConfigs] = useState<Record<string,{secs:number;batch:number}>>({})
  // Backward-occupancy inputs from /api/slots — for the client-side basket-aware fit overlay
  // (hard-blocks a slot the customer's order can't fit; no override on the customer surface).
  const [capacityInputs, setCapacityInputs] = useState<{productionSlotUnits:Record<string,Record<string,number>>;kitchenCapacity:number|null;eventStartMins:number}|null>(null)
  const [notes, setNotes] = useState('')

  const selectedSlot = slotHour && slotMinute ? `${slotHour}:${slotMinute}` : ''

  // Calculate available hours from event times (customer-facing only)
  const availableHours = useMemo(() => {
    if (!event?.start_time || !event?.end_time) {
      // Fallback if no event hours: 10:00-23:00
      return Array.from({length:14}, (_,i) => String(i+10).padStart(2,'0'))
    }
    
    const [startH] = event.start_time.split(':').map(Number)
    const [endH] = event.end_time.split(':').map(Number)
    
    const hours = []
    for (let h = startH; h <= endH; h++) {
      hours.push(String(h).padStart(2, '0'))
    }
    return hours
  }, [event])

  // Filter minutes based on first/last hour of event
  const availableMinutes = useMemo(() => {
    const allMinutes = ['00','05','10','15','20','25','30','35','40','45','50','55']
    
    if (!event?.start_time || !event?.end_time || !slotHour) {
      return allMinutes
    }
    
    const [startH, startM] = event.start_time.split(':').map(Number)
    const [endH, endM] = event.end_time.split(':').map(Number)
    const selectedH = parseInt(slotHour)
    
    // First hour: filter out minutes before start
    if (selectedH === startH) {
      return allMinutes.filter(m => parseInt(m) >= startM)
    }
    
    // Last hour: filter out minutes after end
    if (selectedH === endH) {
      return allMinutes.filter(m => parseInt(m) <= endM)
    }
    
    // Middle hours: all minutes available
    return allMinutes
  }, [event, slotHour])

  // Fetch available slots (must use date_iso yyyy-mm-dd to match orders.event_date in Supabase)
  const fetchSlots = async (truckId: string, dateIso: string, startTime?: string, endTime?: string, eventId?: string) => {
    setLoadingSlots(true)
    try {
      const p = new URLSearchParams({ date: dateIso })
      if (startTime) p.set('start', startTime)
      if (endTime) p.set('end', endTime)
      // event_id scopes the slot capacity to THIS event (re-key fix) — date is the fallback.
      if (eventId) p.set('event_id', eventId)
      const res = await fetch(`/api/slots/${truckId}?${p}`, { cache: 'no-store' })
      const data = await res.json()
      const slots = data.slots || []
      setAvailableSlots(slots)
      setQueueByCat(data.queueByCat || {})
      setServerCatConfigs(data.catConfigs || {})
      setCapacityInputs(data.capacityInputs ?? null)
      const first = getAsapSlot(slots, dateIso)
      setAsapSlot(first?.collection_time || null)
    } catch { setAvailableSlots([]) }
    finally { setLoadingSlots(false) }
  }

  const eventDateIso = event?.date_iso ?? new Date().toISOString().split('T')[0]

  // Reload slot availability whenever truck/event is known or customer returns to the tab
  useEffect(() => {
    if (!truck?.id) return
    fetchSlots(truck.id, eventDateIso, event?.start_time, event?.end_time, event?.id)
  }, [truck?.id, eventDateIso, event?.start_time, event?.end_time, event?.id])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && truck?.id) {
        fetchSlots(truck.id, eventDateIso, event?.start_time, event?.end_time, event?.id)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [truck?.id, eventDateIso, event?.start_time, event?.end_time])

  // Load upcoming events for this truck
  useEffect(() => {
    const loadEvent = async () => {
      try {
        const res = await fetch(`/api/events?truck=${slug}`)
        if (!res.ok) { setEventLoading(false); return }
        const data = await res.json()
        if (data.events && data.events.length > 0) {
          const now = new Date()
          const cutoff = new Date()
          cutoff.setDate(cutoff.getDate() + 14)
          const upcoming = data.events.filter((e: EventData) => {
            // Exclude events whose end time has passed — local time parse per engineering manual
            if (e.date_iso && e.end_time && now >= new Date(`${e.date_iso}T${e.end_time}`)) return false
            const [d, m, y] = e.date.split('/').map(Number)
            return new Date(y, m-1, d) <= cutoff
          })
          if (upcoming.length > 0) {
            setEvents(upcoming)
            // Selection is derived from ?event_id in the effect below — don't pre-select here.
          } else {
            setNoEvents(true)
          }
        } else {
          setNoEvents(true)
        }
      } catch {
        // Non-fatal
      } finally {
        setEventLoading(false)
      }
    }
    loadEvent()
  }, [slug])

  // Derive the selected event from ?event_id (the deep-link). With a valid id → scope to it;
  // without → auto-select the only event (single-event truck), else leave unselected so the
  // picker (the order-entry schedule) is shown. Reset the slot when the scope changes so no
  // slot from a previously-viewed event lingers. Re-runs on Link navigation (param change).
  useEffect(() => {
    if (!events.length) { setEvent(null); return }
    const next = eventIdParam
      ? (events.find(e => e.id === eventIdParam) ?? null)
      : (events.length === 1 ? events[0] : null)
    setEvent(next)
    setSlotHour(''); setSlotMinute('')
  }, [eventIdParam, events])


  useEffect(() => {
    console.log('[ORDER FORM] Fetching menu for slug:', slug)
    // Scope deals + pause + ordering_available to the SELECTED event (cross-event fix): a
    // customer viewing a FUTURE event reads THAT event's deals/pause, not the server's "live
    // event" auto-detect. Refetches when the customer switches events. /api/events only
    // returns confirmed/open events, so the menu route's status-gate never 404s here.
    const menuUrl = event?.id ? `/api/menu/${slug}?event_id=${event.id}` : `/api/menu/${slug}`
    fetch(menuUrl)
      .then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}))
          console.error('[ORDER FORM] Menu API error:', r.status, body)
          throw new Error(body.error || `HTTP ${r.status}`)
        }
        return r.json()
      })
      .then(data => {
        console.log('[ORDER FORM] Menu API response:', data)
        console.log('[ORDER FORM] Items count:', data.menu?.items?.length || 0)
        setTruck(data.truck)
        setMenu(data.menu)
      })
      .catch((err) => {
        console.error('[ORDER FORM] Menu fetch error:', err?.message || err)
        setError('This truck is not currently taking orders.')
      })
      .finally(() => setLoading(false))
  }, [slug, event?.id])

  // ── Basket ──────────────────────────────────────────────────────────────────

  const addItem = (item: MenuItem, mods: { name: string; price: number }[] = [], notes = '', source: 'direct' | 'upsell' = 'direct') => {
    const key = makeCartKey(item.name, mods, notes)
    setBasket(prev => {
      const ex = prev.find(b => b.cartKey === key)
      if (item.stock_remaining != null) {
        const totalQty = prev.filter(b => b.menuItem.name === item.name).reduce((s, b) => s + b.quantity, 0)
        if (totalQty >= item.stock_remaining) return prev
      }
      if (ex) return prev.map(b => b.cartKey === key ? { ...b, quantity: b.quantity + 1 } : b)
      return [...prev, { menuItem: item, quantity: 1, modifiers: mods, specialInstructions: notes, cartKey: key, source }]
    })
  }

  const removeItem = (cartKey: string) => {
    const entry = basket.find(b => b.cartKey === cartKey)
    if (!entry) return
    const isLastVariant = basket.filter(b => b.menuItem.name === entry.menuItem.name).length === 1 && entry.quantity === 1
    if (isLastVariant) setAppliedDeals(prev => cleanupDealsForItem(prev, entry.menuItem.name))
    if (entry.quantity === 1) setOpenNoteKey(prev => prev === cartKey ? null : prev)
    setBasket(prev => {
      const ex = prev.find(b => b.cartKey === cartKey)
      if (!ex) return prev
      if (ex.quantity === 1) return prev.filter(b => b.cartKey !== cartKey)
      return prev.map(b => b.cartKey === cartKey ? { ...b, quantity: b.quantity - 1 } : b)
    })
  }

  // Cap basket lines to the server's authoritative remaining (submit-409 stock guard). For each
  // over-ordered item, trim quantity across its variant lines (from the last) until total ≤
  // remaining; drop any line that hits 0. Deal-routed items aren't trimmed here — the server
  // re-rejects on resubmit, so oversell is still impossible.
  const capBasketToRemaining = (shortItems: { name: string; remaining: number }[]) => {
    if (!shortItems.length) return
    setBasket(prev => {
      let next = [...prev]
      for (const { name, remaining } of shortItems) {
        const total = next.filter(b => b.menuItem.name === name).reduce((s, b) => s + b.quantity, 0)
        let excess = total - Math.max(0, remaining)
        if (excess <= 0) continue
        for (let i = next.length - 1; i >= 0 && excess > 0; i--) {
          if (next[i].menuItem.name !== name) continue
          const take = Math.min(next[i].quantity, excess)
          next[i] = { ...next[i], quantity: next[i].quantity - take }
          excess -= take
        }
      }
      return next.filter(b => b.quantity > 0)
    })
  }

  const commitNote = (itemName: string) => {
    const note = noteInputVal.trim()
    setBasket(prev => prev.map(b =>
      b.menuItem.name === itemName && b.modifiers.length === 0
        ? { ...b, specialInstructions: note, cartKey: makeCartKey(b.menuItem.name, [], note) }
        : b
    ))
    setOpenNoteKey(null)
  }

  // Total qty across all variants of an item (for UI badge and stock checks)
  const getQty = (itemName: string) => basket.filter(b => b.menuItem.name === itemName).reduce((s, b) => s + b.quantity, 0)

  // Item modal helpers
  const openItemModal = (item: MenuItem, modGroups: ModifierGroup[], upsells: MenuItem[] = []) => {
    setItemModal({ item, modGroups, upsells })
    setModalMods([])
    setModalNotes('')
    setModalUpsells([])
  }

  const toggleModalMod = (opt: ModifierOption) => {
    setModalMods(prev => {
      const has = prev.some(m => m.name === opt.name)
      return has ? prev.filter(m => m.name !== opt.name) : [...prev, { name: opt.name, price: opt.price_adjustment }]
    })
  }

  // Toggle a staged upsell (select/deselect) — mirrors toggleModalMod; committed on confirm.
  const toggleModalUpsell = (name: string) => {
    setModalUpsells(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name])
  }

  const confirmAddFromModal = () => {
    if (!itemModal) return
    addItem(itemModal.item, modalMods, modalNotes)
    // Commit selected upsells ONCE here (not on tap) — each as its OWN-category basket line
    // (capacity-correct: drink ≠ pizza windows), tagged source:'upsell'.
    itemModal.upsells
      .filter(u => modalUpsells.includes(u.name))
      .forEach(u => addItem(u, [], '', 'upsell'))
    setItemModal(null)
    setModalMods([])
    setModalNotes('')
    setModalUpsells([])
  }

  // ── Grouped menu ────────────────────────────────────────────────────────────
  const groupedMenu = useMemo(() => {
    if (!menu) return []
    return groupByCategory(menu.items, menu.categories?.map(c => c.name))
  }, [menu])

  // ── Upsells ─────────────────────────────────────────────────────────────────
  // Inline upsells — item-specific, shown immediately when a matching item is in basket
  const getItemUpsells = (item: MenuItem): MenuItem[] => {
    if (!menu) return []
    const rules = menu.upsell_rules.filter(r => r.trigger_category === item.category)
    const suggestions: MenuItem[] = []
    for (const rule of rules) {
      const matchedItems = menu.items.filter(i =>
        i.category === rule.suggest_category &&
        i.available &&
        !basket.find(b => b.menuItem.name === i.name)
      ).slice(0, rule.max_suggestions)
      suggestions.push(...matchedItems)
    }
    return suggestions
  }

  const upsellSuggestions = useMemo(() => {
    if (!menu) return []
    const basketCats = new Set(basket.map(b => b.menuItem.category))
    const seen = new Set<string>()
    const result: MenuItem[] = []
    for (const b of basket) {
      for (const rule of menu.upsell_rules.filter(r => r.trigger_category === b.menuItem.category)) {
        if (basketCats.has(rule.suggest_category)) continue
        menu.items.filter(i => i.category === rule.suggest_category && !seen.has(i.name))
          .slice(0, rule.max_suggestions)
          .forEach(c => { seen.add(c.name); result.push(c) })
      }
    }
    return result
  }, [basket, menu])

  // ── Deals ───────────────────────────────────────────────────────────────────
  const maxDealsApplicable = (bundle: Bundle) => {
    if (!menu) return 0
    const slots = getSlotCats(bundle)
    if (!slots.length) return 0
    return Math.min(...slots.map((cat: string) =>
      basket.filter(b => b.menuItem.category === cat).reduce((s, b) => s + b.quantity, 0)
    ))
  }

  const dealsApplied = (bundle: Bundle) => appliedDeals.filter(d => d.bundle.name === bundle.name).length

  const addDeal = (bundle: Bundle) => {
    setSelectedBundleForModal(bundle)
    setDealModalOpen(true)
  }

  const handleApplyDeal = (deal: any, slots: Record<string, string>, price: number, discount: number, rawSlots: Record<string, string>, modifierExtra: number, slotModifiers: Record<string, { name: string; price: number }[]>, slotNotes: Record<string, string>) => {
    const itemsTakenFromBasket: string[] = dealConsumedCartKeys(rawSlots)
    setBasket(prev => consumeBasketItemsForDeal(prev, rawSlots))

    setAppliedDeals(prev => [...prev, { bundle: deal, slots, itemsTakenFromBasket, modifierExtra, slotModifiers, slotNotes }])
    setDealModalOpen(false)
  }

  const removeDeal = (i: number) => {
    const deal = appliedDeals[i]
    if (deal.itemsTakenFromBasket.length > 0) {
      setBasket(prev => prev.filter(b => !deal.itemsTakenFromBasket.includes(b.cartKey)))
    }
    setAppliedDeals(prev => prev.filter((_, idx) => idx !== i))
  }


  const getSlotOptions = (cat: string) => basket.filter(b => b.menuItem.category === cat).map(b => b.menuItem)

  // ── Totals ──────────────────────────────────────────────────────────────────
  const { itemsTotal, dealsTotal, dealSavings, subtotal, discountAmt, total } = useMemo(() => {
    return calculateOrderTotal(
      basket.map(b => ({
        name: b.menuItem.name,
        price: b.menuItem.price + b.modifiers.reduce((s, m) => s + m.price, 0),
        quantity: b.quantity,
      })),
      appliedDeals.map(d => ({ bundle: d.bundle, slots: d.slots, modifierExtra: d.modifierExtra })),
      menu?.items || [],
      appliedCode
    )
  }, [basket, appliedDeals, appliedCode, menu])

  const hasItems = basket.length > 0 || appliedDeals.length > 0
  const totalItems = basket.reduce((s, b) => s + b.quantity, 0)

  // ── Queue-aware ASAP time (pre-order, queue-aware) ───────────────────────────
  // Uses same batch logic as truck dashboard calcQueueAwareReadyTime.
  // New items placed after existing queue:
  //   totalQty = queueByCat[cat] + newItems[cat]
  //   finalBatch = ceil(totalQty / batchSize)
  //   prepTime = finalBatch × prepSecs
  // If batch 2 has space, new items slot in — finish with batch 2.
  // If full, spill into batch 3.
  const customerAsapTime = useMemo(() => {
    if (!event?.start_time) return asapSlot

    const [startH, startM] = event.start_time.split(':').map(Number)
    const eventStartMins = startH * 60 + startM
    const extraWait = truck?.extra_wait_mins ?? 0

    const catConfigs: Record<string, { secs: number; batch: number }> =
      Object.keys(serverCatConfigs).length > 0
        ? serverCatConfigs
        : Object.fromEntries(
            (menu?.categories || []).map(c => [
              c.name.toLowerCase(),
              { secs: c.prep_secs ?? 0, batch: c.batch_size ?? 1 }
            ])
          )

    const todayIso = localTodayIso() // local date (s.7) — a future LOCAL event is never "today"
    const isToday = eventDateIso === todayIso
    const nowMins = new Date().getHours() * 60 + new Date().getMinutes()
    const beforeEvent = !isToday || nowMins < eventStartMins

    if (!menu) {
      if (!extraWait) return asapSlot || event.start_time
      const rounded = Math.round((eventStartMins + extraWait) / 5) * 5
      return `${String(Math.floor(rounded/60)).padStart(2,'0')}:${String(rounded%60).padStart(2,'0')}`
    }

    // Count basket items by category
    const newByCat: Record<string, number> = {}
    basket.forEach(b => {
      const cat = b.menuItem.category?.toLowerCase() || 'mains'
      newByCat[cat] = (newByCat[cat] || 0) + b.quantity
    })
    appliedDeals.forEach(d => {
      Object.values(d.slots).filter(Boolean).forEach(name => {
        const item = menu.items.find(m => m.name === name)
        const cat = item?.category?.toLowerCase() || 'mains'
        newByCat[cat] = (newByCat[cat] || 0) + 1
      })
    })

    let asapMins: number

    if (beforeEvent) {
      // Pre-event model: batch 1 is pre-cooked and ready at event start.
      // Each batch beyond the first adds one prep cycle on top of event start.
      // When basket is empty, simulate +1 per queued category so we show the
      // realistic "next order ready at" time rather than the raw event start.
      let extraBatchMins = 0
      const catsToCheck = hasItems
        ? Object.keys(newByCat)
        : Object.keys(queueByCat)
      for (const cat of catsToCheck) {
        const newQty = hasItems ? (newByCat[cat] || 0) : 1
        const cfg = catConfigs[cat] || { secs: 0, batch: 1 }
        if (!cfg.secs) continue
        const totalQty = (queueByCat[cat] || 0) + newQty
        const totalBatches = Math.ceil(totalQty / cfg.batch)
        const mins = Math.ceil(Math.max(0, totalBatches - 1) * cfg.secs / 60)
        extraBatchMins = Math.max(extraBatchMins, mins)
      }
      asapMins = eventStartMins + extraBatchMins + extraWait
    } else {
      // During / after event: now + full prep time for all batches in queue
      const prepMins = Math.ceil(calcQueueAwareReadySecs(newByCat, queueByCat, catConfigs, 0) / 60)
      asapMins = Math.max(eventStartMins, nowMins + prepMins + extraWait)
    }

    if (asapMins === eventStartMins && extraWait === 0) return event.start_time

    const roundedMins = Math.round(asapMins / 5) * 5
    const h = Math.floor(roundedMins / 60)
    const m = roundedMins % 60
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`

  }, [basket, appliedDeals, menu, event, asapSlot, hasItems, queueByCat, serverCatConfigs, truck, eventDateIso])

  // Convert HH:MM to total minutes for comparison
  const toMins = (time: string) => {
    const [h, m] = time.split(':').map(Number)
    return h * 60 + m
  }

  // ── Backward-occupancy fit (Stage 2): which slots can't fit the current order ──
  // The customer is HARD-BLOCKED from a slot whose backward cooking windows (ending at it)
  // can't hold the order (no spare, or run-off-front) — no override on this surface. Uses
  // the SAME engine (fitOrderBackward) as the operator/server, fed by /api/slots capacityInputs.
  const basketByCat = useMemo(() => {
    const m: Record<string, number> = {}
    basket.forEach(b => { const c = b.menuItem.category?.toLowerCase() || 'mains'; m[c] = (m[c] || 0) + b.quantity })
    appliedDeals.forEach(d => Object.values(d.slots).filter(Boolean).forEach(name => {
      const item = menu?.items.find(mi => mi.name === name)
      const c = item?.category?.toLowerCase() || 'mains'
      m[c] = (m[c] || 0) + 1
    }))
    return m
  }, [basket, appliedDeals, menu])

  const unfittableSlots = useMemo(() => {
    const out = new Set<string>()
    if (!capacityInputs || Object.keys(basketByCat).length === 0) return out
    const back = projectBackwardOccupancy(
      capacityInputs.productionSlotUnits || {},
      serverCatConfigs,
      capacityInputs.eventStartMins,
      capacityInputs.kitchenCapacity,
    )
    for (const s of availableSlots) {
      const fit = fitOrderBackward(back, toMins(s.collection_time), basketByCat, serverCatConfigs, capacityInputs.kitchenCapacity, capacityInputs.eventStartMins)
      if (!fit.fits) out.add(s.collection_time)
    }
    return out
  }, [capacityInputs, basketByCat, serverCatConfigs, availableSlots])

  // Backward-fit ASAP (Stage 3): the earliest slot the order actually fits — the SAME
  // engine the picker/server use, so the displayed "Around HH:MM" and the auto-booked slot
  // agree. Null (no basket / no capacity data) ⇒ fall back to the queue-based estimate.
  const backwardAsap = useMemo(() => {
    if (!capacityInputs || Object.keys(basketByCat).length === 0) return null
    // Time-eligible candidates only (past / too-soon / grace), NOT capacity-filtered: feed every
    // such slot so earliestBackwardFitSlot can reach a worst-case-vetoed-but-actually-fits slot
    // (e.g. anchovies at a pizza-full 6pm with ceiling spare). Capacity is decided category-aware
    // inside fitOrderBackward; the !too_soon filter preserves the lead/ASAP floor.
    const avail = availableSlots.filter(s => !s.is_past && !s.too_soon && !s.is_grace)
    return earliestBackwardFitSlot(
      avail.map(s => ({ collection_time: s.collection_time, production_slot: s.collection_time })),
      capacityInputs.productionSlotUnits || {},
      serverCatConfigs,
      capacityInputs.kitchenCapacity,
      capacityInputs.eventStartMins,
      basketByCat,
    )
  }, [capacityInputs, basketByCat, serverCatConfigs, availableSlots])

  // ASAP is selected by DEFAULT (asapChosen initial = true) and submits as slot=null,
  // so there's nothing to auto-populate on load — the selection no longer depends on a
  // concrete slotHour/Minute being filled in. This is the fix for "looks selected but
  // can't place" and for the basket recompute clearing ASAP.

  // Snap only an EXPLICITLY chosen specific time back to ASAP if a basket change pushes
  // the ready time past it. ASAP itself is never touched here — it persists through
  // basket edits; only the "Around …" estimate (customerAsapTime) updates.
  useEffect(() => {
    if (asapChosen) return
    if (!selectedSlot || !customerAsapTime) return
    if (toMins(selectedSlot) < toMins(customerAsapTime)) {
      setAsapChosen(true)
      setSlotHour(''); setSlotMinute('')
    }
  }, [customerAsapTime]) // eslint-disable-line react-hooks/exhaustive-deps

  const applyCode = () => {
    if (!menu) return
    const found = menu.codes.find(c => c.code === discountInput.trim().toUpperCase())
    if (found) { setAppliedCode(found); setDiscountError('') }
    else { setAppliedCode(null); setDiscountError('Code not recognised') }
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmitClick = () => submitOrder({})

  const submitOrder = async (extra: { upsellEvents?: any[] } = {}) => {
    if (!truck || !menu || !name || !email || !hasItems || !event) return
    // ASAP (asapChosen) is a genuine active choice — it submits slot=null and the
    // server resolves the earliest ready window. A specific time requires selectedSlot.
    if (truck.mode === 'village' && !selectedSlot && !asapChosen) return
    setSubmitting(true)
    setPauseNotice(null)
    setStockNotice(null)
    try {
      const res = await fetch('/api/orders/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          truckId: slug, customerName: name, customerEmail: email, customerPhone: phone,
          slot: asapChosen ? null : (selectedSlot || null), eventDate: eventDateIso, eventId: event?.id ?? null,
          items: basket.map(b => ({
            name: b.menuItem.name,
            quantity: b.quantity,
            unit_price: b.menuItem.price + b.modifiers.reduce((s, m) => s + m.price, 0),
            modifiers: b.modifiers.length > 0 ? b.modifiers : undefined,
            specialInstructions: b.specialInstructions || undefined,
            source: (b as any).source || 'direct',
          })),
          deals: appliedDeals.map(d => ({ name: d.bundle.name, slots: d.slots, slotModifiers: d.slotModifiers, slotNotes: d.slotNotes, price: d.bundle.bundle_price })),
          discountCode: appliedCode?.code || null,
          subtotal: subtotal, discountAmt: discountAmt, total, notes: notes || null,
          upsellEvents: extra.upsellEvents || [],
        }),
      })
      const data = await res.json()
      // Paused (423): non-destructive — keep the basket + order UI, show a dismissible notice,
      // and let the customer wait and re-submit. Do NOT setError (page-replacing) or clear basket.
      if (res.status === 423 || data?.paused) {
        setPauseNotice('Orders are paused right now — please check back shortly. Your order is saved here.')
        return
      }
      // Lock contention past the retry budget (very rare, sustained load): the server did NOT
      // insert (no-oversell guarantee). Non-destructive — keep the basket, ask to re-submit.
      if (res.status === 409 && data?.retry) {
        setPauseNotice('We are handling a lot of orders right now — please tap Place order again in a moment. Your order is saved here.')
        return
      }
      // Out of stock (409, atomic guard): non-destructive HARD STOP — cap the basket to what's
      // actually left, refresh availability, show a warning, and let the customer re-submit.
      // Mirrors the pause-423 pattern (keep basket, never page-replacing). Customer can't exceed.
      if (res.status === 409 && data?.stock) {
        const shortItems: { name: string; remaining: number }[] = Array.isArray(data.items) ? data.items : []
        capBasketToRemaining(shortItems)
        setStockNotice(
          shortItems.length
            ? shortItems.map(s => `only ${s.remaining} ${s.name} left`).join(', ')
            : 'some items just sold out'
        )
        // Refresh stock_remaining badges from the authoritative menu read.
        if (event?.id) {
          fetch(`/api/menu/${slug}?event_id=${event.id}`, { cache: 'no-store' })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.menu) { setMenu(d.menu); if (d.truck) setTruck(d.truck) } })
            .catch(() => null)
        }
        return
      }
      if (!res.ok) throw new Error(data.error || 'Order failed')
      setSubmittedOrderId(data.orderId)
      setSubmittedAutoAccepted(!!data.autoAccepted)
      setSubmittedConfirmedSlot(data.slot ?? null)
      setSubmittedRequestedSlot(data.requestedSlot ?? (selectedSlot || null))
      setSubmittedSlotChanged(!!data.slotChanged)
      setSubmitted(true)
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally { setSubmitting(false) }
  }

  // ── States ──────────────────────────────────────────────────────────────────
  if (loading) return <Shell><Hdr slug={slug} truck={null} scrolled={false} /><div className="flex-1 flex items-center justify-center"><p className="text-slate-400 animate-pulse font-medium">Loading menu...</p></div></Shell>

  if (error && !submitted) return (
    <Shell><Hdr slug={slug} truck={truck} scrolled={false} />
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-2xl mb-4 mx-auto">😕</div>
          <p className="text-slate-600 font-medium">{error}</p>
          <a href={`/trucks/${slug}/order`} className="mt-4 inline-block text-orange-600 font-bold hover:underline">← Back to truck page</a>
        </div>
      </div>
    </Shell>
  )

  if (truck && !hasFeature(truck.plan, 'advance_preordering')) {
    return (
      <Shell>
        <Hdr slug={slug} truck={truck} scrolled={false} />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-2xl mb-4 mx-auto">🚚</div>
            <p className="font-bold text-slate-900 mb-1">Online ordering not available</p>
            <p className="text-slate-500 text-sm">This truck takes walk-up orders at the hatch.</p>
            <a href={`/trucks/${slug}/order`} className="mt-4 inline-block text-orange-600 font-bold hover:underline">← Back</a>
          </div>
        </div>
      </Shell>
    )
  }

  if (submitted) return (
    <Shell><Hdr slug={slug} truck={truck} scrolled={false} showBack={false} />
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">✓</div>
          <h2 className="text-2xl font-black text-slate-900 mb-1">{submittedAutoAccepted ? 'Order confirmed!' : 'Order received!'}</h2>
          <p className="text-slate-500 mb-3 text-sm">
            {submittedAutoAccepted
              ? <>Thanks! We've received your order and it'll be ready soon.</>
              : <><span className="font-semibold text-slate-700">{truck?.name}</span> will confirm your order shortly.</>
            }
          </p>

          {submittedOrderId && <p className="text-slate-400 text-sm mb-3">Order #{submittedOrderId}</p>}

          {/* Collection time — promoted above the receipt */}
          {(submittedConfirmedSlot || selectedSlot) && (
            submittedAutoAccepted && submittedConfirmedSlot ? (
              <div className={`rounded-xl p-3 mb-4 text-sm text-center border ${submittedSlotChanged ? 'bg-amber-50 border-amber-100' : 'bg-green-50 border-green-100'}`}>
                {submittedSlotChanged && submittedRequestedSlot ? (
                  <>
                    <p className="font-bold text-amber-800 mb-0.5">Sorry, your {submittedRequestedSlot} slot was taken.</p>
                    <p className="text-amber-700 text-xs">Your order will be ready at <span className="font-bold">{submittedConfirmedSlot}</span>.</p>
                  </>
                ) : (
                  <>
                    <p className="font-bold text-green-800 mb-0.5">Collection time: {submittedConfirmedSlot}</p>
                    <p className="text-green-700 text-xs">See you at the hatch!</p>
                  </>
                )}
              </div>
            ) : (selectedSlot || submittedConfirmedSlot) ? (
              <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 mb-4 text-sm text-left">
                <p className="font-bold text-orange-700 mb-0.5">Preferred collection: {selectedSlot || submittedConfirmedSlot}</p>
                <p className="text-orange-600 text-xs">{truck?.name} will confirm your collection time when they accept your order.</p>
              </div>
            ) : null
          )}

          <div className="bg-slate-50 rounded-xl p-4 text-left space-y-2 mb-4 border border-slate-100">
            {basket.map(b => (
              <OrderLineItem
                key={b.cartKey}
                name={b.menuItem.name}
                quantity={b.quantity}
                unitPrice={b.menuItem.price + b.modifiers.reduce((s, m) => s + m.price, 0)}
                basePrice={b.menuItem.price}
                modifiers={b.modifiers}
                specialInstructions={b.specialInstructions}
                variant="customer"
              />
            ))}
            {appliedDeals.map((deal, i) => {
              const origPrice = calcDealOriginalPrice(deal, menu?.items || [])
              const saving = origPrice > deal.bundle.bundle_price ? origPrice - deal.bundle.bundle_price : 0
              return (
                <div key={i}>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">
                      🎁 {deal.bundle.name}
                      {saving > 0 && <span className="ml-1.5 text-green-600 font-medium">save £{saving.toFixed(2)}</span>}
                    </span>
                    <span className="font-medium text-slate-700">£{deal.bundle.bundle_price.toFixed(2)}</span>
                  </div>
                  {Object.keys(deal.slots).sort().map(slotKey => {
                    const itemName = deal.slots[slotKey]
                    if (!itemName) return null
                    const mods = deal.slotModifiers?.[slotKey] || []
                    const note = deal.slotNotes?.[slotKey]
                    return (
                      <div key={slotKey}>
                        <div className="pl-3 text-xs text-slate-400">{itemName}</div>
                        {mods.map(m => (
                          <div key={m.name} className="flex justify-between pl-6 text-xs text-slate-400">
                            <span>{m.name}</span>
                            {m.price > 0 && <span>+£{m.price.toFixed(2)}</span>}
                          </div>
                        ))}
                        {note && <div className="pl-6 text-xs text-slate-400 italic">📝 {note}</div>}
                      </div>
                    )
                  })}
                </div>
              )
            })}
            <div className="flex justify-between text-sm border-t border-slate-200 pt-2">
              <span className="font-black text-slate-900">Total</span>
              <span className="font-black text-slate-900">£{total.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex justify-between text-sm mb-4">
            <span className="text-slate-500">Payment</span>
            <span className="font-bold text-slate-700">Pay at the truck</span>
          </div>

          <p className="text-slate-400 text-xs mb-6">Confirmation sent to {email}</p>
          {/* Slug-based truck route (Manual s.7). Targets the truck's own order/menu
             page, the only customer route that resolves by slug for a HatchGrab truck
             (/trucks/[slug] is the discovery profile and 404s for operator-only trucks).
             A full navigation (<a>) reloads a fresh form — the confirmation shares this
             URL, so a soft <Link> would just re-render the confirmation. */}
          <a href={`/trucks/${slug}/order`} className="block w-full bg-slate-900 text-white font-bold py-3 px-6 rounded-xl hover:bg-slate-800 transition-colors">
            Back to {truck?.name}
          </a>
        </div>
      </div>
    </Shell>
  )

  // ── Main form ───────────────────────────────────────────────────────────────
  const isPaused = !!truck?.paused

  // Block ordering after event end time (only applies to today's event)
  const isEventClosed = (() => {
    if (!event?.end_time || !event?.date_iso) return false
    const todayIso = localTodayIso() // local date (s.7) — don't mark a future event "closed"
    if (event.date_iso !== todayIso) return false
    const [endH, endM] = event.end_time.split(':').map(Number)
    const nowMins = new Date().getHours() * 60 + new Date().getMinutes()
    return nowMins > endH * 60 + endM
  })()

  const isOpenNow = (() => {
    if (!event?.date_iso || !event?.start_time || !event?.end_time) return false
    const now = new Date()
    const start = new Date(`${event.date_iso}T${event.start_time}`)
    const end = new Date(`${event.date_iso}T${event.end_time}`)
    return now >= start && now < end
  })()

  const isOrderingBlocked = isPaused || isEventClosed

  return (
    <Shell>
      <Hdr slug={slug} truck={truck} scrolled={isScrolled} />

      {/* Event closed banner */}
      {isEventClosed && (
        <div className="sticky top-[60px] z-40 bg-slate-800 text-white px-4 py-3 shadow-md">
          <div className="max-w-lg mx-auto">
            <p className="font-black text-sm">Ordering has closed</p>
            <p className="text-xs text-slate-300 mt-0.5">Online ordering for this event ended at {formatTime(event?.end_time || '')}. We hope to see you next time!</p>
          </div>
        </div>
      )}

      {/* Paused banner — stays visible while scrolling */}
      {isPaused && !isEventClosed && (
        <div className="sticky top-[60px] z-40 bg-amber-50 border-b border-amber-200 px-4 py-3">
          <div className="flex items-start gap-3 max-w-lg mx-auto">
            <span className="text-xl flex-shrink-0">
              {truck?.pauseReason === 'offline' ? '📡' : '⏸️'}
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">
                {truck?.pauseReason === 'offline'
                  ? 'Online ordering temporarily unavailable'
                  : 'Orders are temporarily paused'
                }
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                {truck?.pauseReason === 'offline'
                  ? "We're having a connection issue but you can still order at the window. Check back soon!"
                  : 'Check back shortly or order at the window when you arrive.'
                }
              </p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="text-xs text-amber-700 font-medium underline flex-shrink-0 mt-0.5"
            >
              Check again
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 w-full max-w-lg mx-auto px-4 py-6" style={{ paddingBottom: `${footerHeight + 8}px` }}>

        {/* Unconfirmed event — ordering blocked */}
        {truck?.ordering_available === false && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <div className="text-5xl mb-4">🕐</div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Orders not open yet</h2>
            <p className="text-sm text-slate-500 max-w-xs">
              {truck?.name} hasn&apos;t confirmed this event yet. Check back closer to the date or follow them on social media for updates.
            </p>
          </div>
        )}

        <div className={truck?.ordering_available === false ? 'hidden' : ''}>

        {/* Truck hero — logo, name, event details */}
        <div className="text-center mb-5">
          {truck?.logo ? (
            <Image
              src={truck.logo}
              alt={truck.name || ''}
              width={80}
              height={80}
              className="w-20 h-20 object-contain rounded-full border border-slate-200 shadow-md bg-white mx-auto mb-3"
            />
          ) : (
            <div className="w-20 h-20 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-4xl shadow-md mx-auto mb-3">🚚</div>
          )}
          <h1 className="text-2xl font-black text-slate-900">
            Order from {truck?.name}
          </h1>
          {/* Event details card */}
          {eventLoading ? (
            <div className="mt-3 bg-slate-100 rounded-xl px-4 py-3 animate-pulse">
              <p className="text-slate-400 text-sm">Loading events...</p>
            </div>
          ) : noEvents ? (
            <div className="mt-3 bg-slate-100 rounded-xl px-4 py-3">
              <p className="text-slate-500 text-sm font-medium">No upcoming events in the next 2 weeks</p>
              <p className="text-slate-400 text-xs mt-0.5">Check back soon or visit the truck page for updates</p>
            </div>
          ) : events.length > 0 ? (
            <div className="mt-3 text-left">
              {event ? (
                // Scoped to ONE event (deep-linked ?event_id, or the only event). Single-event
                // card; "Change" returns to the order-entry schedule when there are alternatives.
                <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-slate-800 text-base leading-tight">
                      📍 {event.venue_name}{event.village ? `, ${event.village}` : ''}
                    </p>
                    {events.length > 1 && (
                      <Link href={`/trucks/${slug}/order`} className="text-orange-600 text-xs font-bold shrink-0 mt-0.5 hover:underline">
                        Change
                      </Link>
                    )}
                  </div>
                  <p className="text-slate-600 text-sm mt-1.5 flex items-center gap-2 flex-wrap">
                    <span>{event.date_friendly}{event.start_time && event.end_time ? ` · ${formatTime(event.start_time)}–${formatTime(event.end_time)}` : ''}</span>
                    {isOpenNow ? (
                      <span className="inline-flex items-center gap-1 text-green-600 text-xs font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />Live
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-orange-600 text-xs font-semibold">Pre-order</span>
                    )}
                  </p>
                </div>
              ) : (
                // No event selected → the ORDER-ENTRY SCHEDULE: pick a confirmed event. Each row
                // deep-links to ?event_id=<truck_events.id> (real id from /api/events) and is
                // tagged Live vs Pre-order. Only confirmed/open events are returned by /api/events.
                <>
                  <p className="text-xs font-black text-orange-600 uppercase tracking-wider mb-2 text-center">Choose which event to order for</p>
                  <div className="space-y-2">
                    {events.map((e) => {
                      const live = isEventLiveNow(e)
                      return (
                        <Link
                          key={e.id}
                          href={`/trucks/${slug}/order?event_id=${e.id}`}
                          className="flex items-center justify-between gap-3 w-full text-left px-4 py-3.5 rounded-xl border bg-white border-slate-200 hover:border-orange-300 transition-all"
                        >
                          {/* Left: venue / date·time / status. Right: compact boxed Order button. */}
                          <div className="min-w-0">
                            <p className="font-black text-slate-900 text-base leading-tight truncate">{e.venue_name}{e.village ? `, ${e.village}` : ''}</p>
                            <p className="text-slate-400 text-xs mt-1">{e.date_friendly}{e.start_time && e.end_time ? ` · ${formatTime(e.start_time)}–${formatTime(e.end_time)}` : ''}</p>
                            <span className={`mt-1 inline-flex items-center gap-1 text-xs font-bold ${live ? 'text-green-600' : 'text-orange-600'}`}>
                              {live && <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />}{live ? 'Live' : 'Pre-order'}
                            </span>
                          </div>
                          <span className="shrink-0 bg-orange-600 text-white font-bold px-4 py-2 rounded-lg text-sm">Order now</span>
                        </Link>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>

        {/* Ordering UI (deals + menu) renders only once an event is scoped — until then the
            block above is the order-entry schedule. Picking an event (?event_id) reveals this. */}
        {event && (<>

        {/* MEAL DEALS — flat cards, before menu, hidden if none available */}
        {menu && menu.bundles.filter(b => b.available).length > 0 && (
          <div className="mb-4">
            <h2 className="text-xs font-black text-orange-600 uppercase tracking-widest mb-2 px-1">🎁 Meal deals</h2>
            <div className="space-y-2">
              {menu.bundles.filter(b => b.available).map(bundle => {
                const applied = dealsApplied(bundle)
                const slots = getSlotCats(bundle)
                const saving = bundle.original_price !== null && bundle.original_price > 0
                  ? bundle.original_price - bundle.bundle_price : null

                return (
                  <div key={bundle.name} className="bg-white rounded-2xl border border-orange-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3.5">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-black text-slate-900 text-sm">{bundle.name}</p>
                            {saving !== null && saving > 0 && (
                              <span className="text-[10px] bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded-full">Save £{saving.toFixed(2)}</span>
                            )}
                            {applied > 0 && (
                              <span className="text-[10px] bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded-full">✓ {applied} applied</span>
                            )}
                          </div>
                          <p className="text-slate-500 text-xs mt-0.5">{bundle.description}</p>
                        </div>
                        <p className="font-black text-orange-600 text-lg shrink-0">£{bundle.bundle_price.toFixed(2)}</p>
                      </div>
                      <button onClick={() => !isOrderingBlocked && addDeal(bundle)} disabled={isOrderingBlocked}
                        className={`w-full font-bold text-sm py-2 rounded-xl transition-colors active:scale-95 ${isOrderingBlocked ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-orange-600 text-white hover:bg-orange-700'}`}>
                        {isOrderingBlocked ? (isEventClosed ? 'Ordering closed' : 'Ordering paused') : applied === 0 ? 'Add deal' : '+ Add another deal'}
                      </button>
                    </div>
                    {/* Applied deal instances - compact summary */}
                    {appliedDeals
                      .filter(deal => deal.bundle.name === bundle.name)
                      .map((deal, localIdx) => {
                        const dynOrig = calcDealOriginalPrice(deal, menu.items)
                        const dynSaving = dynOrig > 0 ? Math.max(0, dynOrig - deal.bundle.bundle_price) : null
                        const globalIdx = appliedDeals.indexOf(deal)
                        const itemsSummary = Object.entries(deal.slots)
                          .filter(([, itemName]) => itemName)
                          .map(([cat, itemName]) => {
                            const mods = deal.slotModifiers?.[cat]
                            return mods?.length ? `${itemName} (+ ${mods.map(m => m.name).join(', ')})` : itemName
                          })
                          .join(' + ')
                        
                        return (
                          <div key={globalIdx} className="border-t border-orange-100 px-4 py-3 bg-orange-50">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-xs font-black text-orange-700">
                                    {appliedDeals.filter(d => d.bundle.name === bundle.name).length > 1 
                                      ? `Deal ${localIdx + 1}` 
                                      : 'Your deal'}
                                  </p>
                                  {dynSaving !== null && dynSaving > 0 && (
                                    <span className="text-[10px] bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded-full">Save £{dynSaving.toFixed(2)}</span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-600 mt-0.5 truncate">{itemsSummary}</p>
                              </div>
                              <button onClick={() => removeDeal(globalIdx)} className="text-[10px] text-orange-400 hover:text-orange-600 font-bold shrink-0">Remove</button>
                            </div>
                          </div>
                        )
                      })}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* MENU — grouped by category */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-4 py-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest">Menu</h2>
            {(truck?.allergen_info_url || truck?.allergen_info_text) && (
              <button
                onClick={() => setShowAllergenModal(true)}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 underline"
              >
                ⚠️ Allergen information
              </button>
            )}
          </div>
          {groupedMenu.map(([category, items]) => (
            <div key={category} className="mb-4 last:mb-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-black text-orange-600 uppercase tracking-wider">{cap(category)}</span>
                <div className="flex-1 h-px bg-orange-100" />
              </div>
              <div className="divide-y divide-slate-100">
                {items.map(item => {
                  const qty = getQty(item.name)
                  const isSoldOut = !(item.available ?? true)
                  // Cross-category upsells for this item (resolved regardless of qty so they show
                  // in the modal as you add). Rendered ONLY in the item modal now (not inline).
                  const itemUpsells = getItemUpsells(item)
                  const catModGroups = menu?.categories?.find(c => c.name === item.category)?.modifierGroups || []
                  const hasModifiers = catModGroups.length > 0
                  const catAllowNotes = menu?.categories?.find(c => c.name.toLowerCase() === item.category.toLowerCase())?.allowNotes ?? false
                  // Open the modal when the category has EXTRAS or UPSELLS or NOTES — so a
                  // suggestion/notes-only category still surfaces them (was extras-only).
                  const opensModal = hasModifiers || itemUpsells.length > 0 || catAllowNotes
                  const itemVariants = basket.filter(b => b.menuItem.name === item.name)
                  const directEntry = !hasModifiers ? itemVariants.find(b => b.modifiers.length === 0) : undefined
                  const atStockLimit = item.stock_remaining != null && qty >= item.stock_remaining
                  return (
                    <div key={item.name} className={isSoldOut ? 'opacity-60' : ''}>
                    <div className={`flex items-center gap-3 py-3`}>
                      {item.photo_url && (
                        <img
                          src={item.photo_url}
                          alt={item.name}
                          className="w-16 h-16 rounded-xl object-cover flex-shrink-0 border border-slate-100"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className={`font-bold text-sm leading-snug ${isSoldOut ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{item.name}</p>
                          {isSoldOut && (
                            <span className="text-[10px] font-black text-red-500 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">Sold out</span>
                          )}
                          {!isSoldOut && item.stock_remaining != null && item.stock_remaining <= 10 && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${item.stock_remaining <= 3 ? 'text-red-600 bg-red-50 border-red-200' : 'text-orange-600 bg-orange-50 border-orange-200'}`}>
                              {item.stock_remaining <= 3 ? `Only ${item.stock_remaining} left!` : `${item.stock_remaining} left`}
                            </span>
                          )}
                        </div>
                        {item.description && <p className="text-slate-400 text-xs mt-0.5 leading-snug">{item.description}</p>}
                        {((item.dietary?.length ?? 0) > 0 || (item.allergens?.length ?? 0) > 0) && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {item.dietary?.map((d: string) => (
                              <span key={d} className="text-[10px] px-1.5 py-0.5 bg-green-50 text-green-700 rounded-md font-medium">{d}</span>
                            ))}
                            {item.allergens?.map((a: string) => (
                              <span key={a} className="text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded-md font-medium">{a}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className={`font-bold text-sm shrink-0 ${isSoldOut ? 'text-slate-400' : 'text-slate-700'}`}>£{item.price.toFixed(2)}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        {isSoldOut ? (
                          <span className="text-xs text-slate-400 font-medium px-3 py-1.5">Sold out</span>
                        ) : opensModal ? (
                          // Extras OR upsells OR notes → open the modal (surfaces all three).
                          <button
                            onClick={() => !isOrderingBlocked && openItemModal(item, catModGroups, itemUpsells)}
                            disabled={isOrderingBlocked || atStockLimit}
                            className={`font-bold text-xs px-3 py-1.5 rounded-lg transition-colors active:scale-95 ${
                              isOrderingBlocked ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                              : atStockLimit ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                              : qty > 0 ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                              : 'bg-orange-600 text-white hover:bg-orange-700'
                            }`}>
                            {isOrderingBlocked ? (isEventClosed ? 'Closed' : 'Paused') : qty > 0 ? `${qty} · Add` : 'Add'}
                          </button>
                        ) : qty > 0 ? (
                          <>
                            <QBtn onClick={() => removeItem(directEntry?.cartKey ?? makeCartKey(item.name, []))} label="−" />
                            <span className="w-5 text-center font-black text-slate-900 text-sm">{qty}</span>
                            {isOrderingBlocked || atStockLimit ? (
                              <button disabled className="w-7 h-7 rounded-lg bg-slate-100 text-slate-300 font-black text-sm cursor-not-allowed">+</button>
                            ) : (
                              <QBtn onClick={() => addItem(item, [], directEntry?.specialInstructions || '')} label="+" accent />
                            )}
                          </>
                        ) : (
                          <button onClick={() => !isOrderingBlocked && addItem(item)} disabled={isOrderingBlocked}
                            className={`font-bold text-xs px-3 py-1.5 rounded-lg transition-colors active:scale-95 ${isOrderingBlocked ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-orange-600 text-white hover:bg-orange-700'}`}>
                            {isOrderingBlocked ? (isEventClosed ? 'Closed' : 'Paused') : 'Add'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Per-variant basket rows (only for modifier items) */}
                    {hasModifiers && itemVariants.length > 0 && (
                      <div className="pl-2 pb-2 space-y-1.5">
                        {itemVariants.map(v => {
                          const modSum = v.modifiers.reduce((s, m) => s + m.price, 0)
                          const modLabel = formatModifiers(v.modifiers)
                          const subLabel = [modLabel, v.specialInstructions].filter(Boolean).join(' · ')
                          return (
                            <div key={v.cartKey} className="flex items-center gap-2 bg-orange-50 rounded-xl px-3 py-2 border border-orange-100">
                              <div className="flex items-center gap-1 shrink-0">
                                <button onClick={() => removeItem(v.cartKey)} className="w-6 h-6 rounded-full bg-white border border-orange-200 flex items-center justify-center font-bold text-orange-600 hover:bg-orange-100 text-sm leading-none">−</button>
                                <span className="w-5 text-center font-black text-slate-900 text-sm">{v.quantity}</span>
                                <button onClick={() => !atStockLimit && addItem(v.menuItem, v.modifiers, v.specialInstructions)} disabled={atStockLimit}
                                  className="w-6 h-6 rounded-full bg-orange-600 flex items-center justify-center font-bold text-white hover:bg-orange-700 text-sm leading-none disabled:opacity-40">+</button>
                              </div>
                              <span className={`flex-1 text-xs truncate ${subLabel ? 'text-slate-600' : catAllowNotes ? 'text-slate-400 italic' : ''}`}>
                                {subLabel || (catAllowNotes ? 'Standard' : '')}
                              </span>
                              <span className="text-xs font-bold text-slate-700 shrink-0">£{((item.price + modSum) * v.quantity).toFixed(2)}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Inline note affordance for direct-add (no-modifier) items */}
                    {!hasModifiers && qty > 0 && catAllowNotes && (() => {
                      const directEntry = basket.find(b => b.menuItem.name === item.name && b.modifiers.length === 0)
                      const directCartKey = directEntry?.cartKey ?? makeCartKey(item.name, [])
                      const directNote = directEntry?.specialInstructions || ''
                      return (
                        <div className="px-3 pb-2.5 -mt-1">
                          {openNoteKey === directCartKey ? (
                            <ItemNoteInput
                              compact
                              value={noteInputVal}
                              onChange={setNoteInputVal}
                              onBlur={() => commitNote(item.name)}
                              onKeyDown={(e) => e.key === 'Enter' && commitNote(item.name)}
                            />
                          ) : directNote ? (
                            <button
                              onClick={() => { setNoteInputVal(directNote); setOpenNoteKey(directCartKey) }}
                              className="flex items-center gap-1.5 text-xs text-slate-400 italic"
                            >
                              <span>📝 {directNote}</span>
                              <span className="not-italic text-slate-300 ml-0.5">✏️</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => { setNoteInputVal(''); setOpenNoteKey(directCartKey) }}
                              className="text-xs text-orange-500 font-medium"
                            >
                              + Add note
                            </button>
                          )}
                        </div>
                      )
                    })()}

                    {/* Upsells now live in the item modal ("Goes well with") — not inline. */}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>



        {/* COLLECTION TIME */}
        {truck?.mode === 'village' && (
          <Sec title="Collection time">
            {loadingSlots ? (
              <p className="text-slate-400 text-sm animate-pulse">Loading available times...</p>
            ) : (
              <>
                <div className="flex gap-3 items-stretch">

                  {/* LEFT: ASAP button */}
                  {(() => {
                    const asapTime = backwardAsap || customerAsapTime || asapSlot || (availableHours.length > 0
                      ? `${availableHours[0]}:${availableMinutes[0] || '00'}`
                      : null)
                    const isSelected = asapChosen

                    return (
                      <button
                        onClick={() => {
                          // ASAP is selected as a first-class choice (submits null) —
                          // clear any concrete time so the highlight + submit agree.
                          setAsapChosen(true)
                          setSlotHour(''); setSlotMinute('')
                        }}
                        disabled={!asapTime}
                        className={`flex-1 flex flex-col items-center justify-center px-3 py-3 rounded-2xl border-2 font-bold transition-all active:scale-95 ${
                          isSelected
                            ? 'bg-orange-600 border-orange-600 text-white'
                            : asapTime
                              ? 'bg-white border-slate-200 text-slate-700 hover:border-orange-300 hover:bg-orange-50'
                              : 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed'
                        }`}>
                        <span className="text-sm font-black">⚡ ASAP</span>
                        <span className={`text-xs mt-0.5 ${isSelected ? 'text-orange-100' : 'text-orange-400'}`}>
                          {asapTime ? `Around ${formatTime(asapTime)}` : 'Unavailable'}
                        </span>
                      </button>
                    )
                  })()}

                  {/* RIGHT: Choose time button / dropdown */}
                  <div className="flex-1">
                    {truck?.time_selection_enabled ? (() => {
                      const asapTime = backwardAsap || customerAsapTime || asapSlot || (availableHours.length > 0 ? `${availableHours[0]}:${availableMinutes[0] || '00'}` : null)
                      const hasChosenTime = !asapChosen && selectedSlot && selectedSlot !== asapTime

                      return (
                        <div className="relative h-full">
                          <select
                            value={hasChosenTime ? selectedSlot : ''}
                            onChange={e => {
                              const val = e.target.value
                              if (val) {
                                setAsapChosen(false)
                                const [h, m] = val.split(':')
                                setSlotHour(h); setSlotMinute(m)
                              } else {
                                // Deselect a specific time — back to ASAP (submits null).
                                setAsapChosen(true)
                                setSlotHour(''); setSlotMinute('')
                              }
                            }}
                            className={`w-full h-full min-h-[68px] rounded-2xl border-2 px-3 py-3 text-sm font-bold appearance-none text-center cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-orange-400 ${
                              hasChosenTime
                                ? 'bg-orange-600 border-orange-600 text-white'
                                : 'bg-white border-slate-200 text-slate-700 hover:border-orange-300'
                            }`}>
                            <option value="">Choose time</option>
                            {availableSlots.length > 0
                              ? availableSlots
                                  .filter(s => {
                                    // Non-capacity gates (unchanged behaviour) — past, too-soon (below
                                    // the lead/ASAP floor), and grace (strictly after end_time, operator-
                                    // only "After closing"). These were previously bundled inside
                                    // s.available; now explicit so the CAPACITY decision below can be
                                    // basket-aware. 16:00 is is_grace:false (kept); 16:05+ excluded.
                                    if (s.is_past) return false
                                    if (s.too_soon) return false
                                    if (s.is_grace) return false
                                    // CAPACITY — basket-aware when the customer has a basket: gate on the
                                    // category-aware fitOrderBackward result (unfittableSlots), NOT the
                                    // server's basket-agnostic worst-case s.available. So a window the
                                    // worst-case dot vetoes (e.g. pizza-full 6pm) is still offered when
                                    // THIS order fits the ceiling spare (anchovies: 4 pizzas + 2 = 6 ≤ 6),
                                    // and still hidden when it doesn't (a pizza: batch full). Empty basket
                                    // ⇒ keep the server worst-case default (nothing to fit yet).
                                    if (Object.keys(basketByCat).length > 0) {
                                      if (unfittableSlots.has(s.collection_time)) return false
                                    } else if (!s.available) {
                                      return false
                                    }
                                    // Only show slots at or after the ASAP time
                                    if (asapTime) return toMins(s.collection_time) >= toMins(asapTime)
                                    return true
                                  })
                                  .map(slot => (
                                    <option key={slot.collection_time} value={slot.collection_time}>
                                      {slot.collection_time}
                                    </option>
                                  ))
                              : availableHours.flatMap(h =>
                                  availableMinutes
                                    .filter(m => {
                                      const time = `${h}:${m}`
                                      if (!asapTime) return true
                                      return toMins(time) >= toMins(asapTime)
                                    })
                                    .map(m => {
                                      const time = `${h}:${m}`
                                      return <option key={time} value={time}>{time}</option>
                                    })
                                )
                            }
                          </select>
                          <div className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs ${hasChosenTime ? 'text-white' : 'text-slate-400'}`}>▾</div>
                        </div>
                      )
                    })() : (
                      // Free tier: greyed out, no badge
                      <div className="w-full h-full min-h-[68px] rounded-2xl border-2 border-slate-100 bg-slate-50 flex flex-col items-center justify-center px-3 py-3">
                        <span className="text-xs font-black text-slate-300">Choose time</span>
                        <span className="text-[10px] text-slate-300 mt-0.5">ASAP only</span>
                      </div>
                    )}
                  </div>

                </div>

                {/* Confirmation */}
                {selectedSlot
                  ? <p className="text-green-600 text-xs font-bold mt-2">✓ Collection time: {selectedSlot}</p>
                  : <p className="text-slate-400 text-xs mt-2">Select ASAP or choose a specific time</p>
                }
              </>
            )}
          </Sec>
        )}

        {/* YOUR DETAILS */}
        <Sec title="Your details">
          <div className="space-y-3">
            <Fld label="Name" required><input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sarah" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" /></Fld>
            <Fld label="Email" required note="confirmation sent here"><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="e.g. sarah@email.com" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" /></Fld>
            <Fld label="Phone number" note="optional"><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 07700 900123" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" /></Fld>
            <Fld label="Special instructions" note="optional"><textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                onFocus={e => setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300)}
                placeholder="Allergies, no onion, extra crispy…"
                rows={3}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white resize-none"
              /></Fld>
          </div>
        </Sec>

        </>)}{/* end event-scoped ordering UI */}

      </div>{/* end ordering_available wrapper */}

      </main>

      {/* STICKY FOOTER with expandable summary — only once an event is scoped (not on the
          order-entry schedule, where there's nothing to total yet). */}
      {event && (
      <div ref={footerRef} className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-xl px-4 pt-3 pb-2 z-50" style={{paddingBottom: 'max(8px, env(safe-area-inset-bottom))'}}>
        <div className="max-w-lg mx-auto">

          {hasItems && (
            <div className="mb-3">
              {/* Collapsed / expanded toggle */}
              <button
                onClick={() => setSummaryExpanded(e => !e)}
                className="w-full flex items-center justify-between mb-2 group"
              >
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                  {(() => { const n = totalItems + appliedDeals.length; return `${n} item${n !== 1 ? 's' : ''}` })()}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="font-black text-slate-900 text-sm">£{total.toFixed(2)}</span>
                  <svg className={`w-4 h-4 text-slate-400 transition-transform ${summaryExpanded ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Expanded breakdown */}
              {summaryExpanded && (
                <div className="bg-slate-50 rounded-xl p-3 mb-2 space-y-1.5 border border-slate-100">
                  {/* Deals first */}
                  {appliedDeals.map((deal, i) => (
                    <div key={i}>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-600">🎁 {deal.bundle.name}</span>
                        <span className="text-slate-700 font-medium">£{deal.bundle.bundle_price.toFixed(2)}</span>
                      </div>
                      {Object.keys(deal.slots).sort().map(slotKey => {
                        const itemName = deal.slots[slotKey]
                        if (!itemName) return null
                        const mods = deal.slotModifiers?.[slotKey] || []
                        const note = deal.slotNotes?.[slotKey]
                        return (
                          <div key={slotKey}>
                            <div className="pl-3 text-[10px] text-slate-400">{itemName}</div>
                            {mods.map(m => (
                              <div key={m.name} className="flex justify-between pl-6 text-[10px] text-slate-400">
                                <span>{m.name}</span>
                                {m.price > 0 && <span>+£{m.price.toFixed(2)}</span>}
                              </div>
                            ))}
                            {note && <div className="pl-6 text-[10px] text-slate-400 italic">📝 {note}</div>}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                  {/* Items sorted by menu category order */}
                  {(() => {
                    const catOrder = menu?.categories?.map(c => c.name) ?? []
                    const sorted = [...basket].sort((a, b) => {
                      const ai = catOrder.indexOf(a.menuItem.category)
                      const bi = catOrder.indexOf(b.menuItem.category)
                      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
                    })
                    return sorted.map(b => (
                      <OrderLineItem
                        key={b.cartKey}
                        name={b.menuItem.name}
                        quantity={b.quantity}
                        unitPrice={b.menuItem.price + b.modifiers.reduce((s, m) => s + m.price, 0)}
                        basePrice={b.menuItem.price}
                        modifiers={b.modifiers}
                        specialInstructions={b.specialInstructions}
                        variant="customer"
                      />
                    ))
                  })()}
                  {discountAmt > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-green-600">Code: {appliedCode?.code}</span>
                      <span className="text-green-600 font-medium">-£{discountAmt.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-black text-slate-900 border-t border-slate-200 pt-1.5">
                    <span>Total</span><span>£{total.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {!hasItems && <p className="text-center text-slate-400 text-xs font-medium mb-2">Add items from the menu to place an order</p>}

          {pauseNotice && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-2 flex items-start gap-2">
              <p className="flex-1 text-amber-800 text-sm font-medium">⏸ {pauseNotice}</p>
              <button onClick={() => setPauseNotice(null)} className="text-amber-400 hover:text-amber-600 text-sm font-bold leading-none mt-0.5">✕</button>
            </div>
          )}

          {stockNotice && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-2 flex items-start gap-2">
              <p className="flex-1 text-amber-800 text-sm font-medium">Sorry — {stockNotice} now. We&apos;ve updated your order — please review and confirm.</p>
              <button onClick={() => setStockNotice(null)} className="text-amber-400 hover:text-amber-600 text-sm font-bold leading-none mt-0.5">✕</button>
            </div>
          )}

          <button onClick={e => { e.preventDefault(); handleSubmitClick() }}
            disabled={submitting || isOrderingBlocked || !hasItems || !name || !email || (truck?.mode === 'village' && !selectedSlot && !asapChosen) || (!eventLoading && !event)}
            className="w-full bg-orange-600 text-white font-black py-3.5 px-6 rounded-xl text-base hover:bg-orange-700 transition-colors active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed shadow-sm">
            {submitting ? 'Sending order...' : isEventClosed ? 'Ordering has closed' : isPaused ? 'Ordering paused' : !eventLoading && !event ? 'No event available' : `Send order to ${truck?.name || 'truck'}`}
          </button>
          <p className="text-center text-slate-400 text-xs mt-1">Pay at the truck on collection · No card details needed</p>
        </div>
      </div>
      )}

      {/* Item Modal — modifier selection before adding to basket */}
      {itemModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setItemModal(null)} />
          <div className="relative bg-white rounded-t-2xl w-full max-w-lg shadow-2xl pb-safe">
            <div className="px-5 pt-5 pb-4">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-black text-slate-900 text-lg leading-snug">{itemModal.item.name}</h3>
                  {itemModal.item.description && <p className="text-slate-400 text-sm mt-0.5">{itemModal.item.description}</p>}
                </div>
                <button onClick={() => setItemModal(null)} className="text-slate-400 hover:text-slate-600 text-xl font-bold leading-none ml-4 mt-0.5">✕</button>
              </div>

              <div className="space-y-4">
                {itemModal.modGroups.map(group => (
                  <div key={group.id}>
                    <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">{group.name}</p>
                    <div className="flex flex-wrap gap-2">
                      {group.options.filter(isModifierAvailable).map(opt => {
                        const selected = modalMods.some(m => m.name === opt.name)
                        return (
                          <button key={opt.id} onClick={() => toggleModalMod(opt)}
                            className={`flex items-center gap-1.5 text-sm font-bold px-3.5 py-2 rounded-xl border-2 transition-all active:scale-95 ${
                              selected ? 'bg-orange-600 border-orange-600 text-white' : 'bg-white border-slate-200 text-slate-700 hover:border-orange-300'
                            }`}>
                            <span>{opt.name}</span>
                            {opt.price_adjustment > 0 && <span className={selected ? 'text-orange-200' : 'text-orange-500'}>+£{opt.price_adjustment.toFixed(2)}</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}

                {/* GOES WELL WITH — cross-category upsells, added as STANDARD own-category basket
                    items (not modifiers). Same compact pill style as PIZZA EXTRAS above (only the
                    section heading frames them as a cross-category nudge). Tap TOGGLES selection (like an
                    extra) — staged in modalUpsells and committed on "Add to basket"; the button total
                    below reflects the selection. */}
                {itemModal.upsells.length > 0 && (
                  <div>
                    <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Goes well with</p>
                    <div className="flex flex-wrap gap-2">
                      {itemModal.upsells.map(u => {
                        const selected = modalUpsells.includes(u.name)
                        return (
                          <button key={u.name} onClick={() => toggleModalUpsell(u.name)}
                            className={`flex items-center gap-1.5 text-sm font-bold px-3.5 py-2 rounded-xl border-2 transition-all active:scale-95 ${
                              selected ? 'bg-orange-600 border-orange-600 text-white' : 'bg-white border-slate-200 text-slate-700 hover:border-orange-300'
                            }`}>
                            <span>{selected ? '✓ ' : ''}{u.name}</span>
                            <span className={selected ? 'text-orange-200' : 'text-orange-500'}>+£{u.price.toFixed(2)}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {(menu?.categories?.find(c => c.name === itemModal.item.category)?.allowNotes ?? false) && (
                  <ItemNoteInput value={modalNotes} onChange={setModalNotes} />
                )}
              </div>
            </div>

            <div className="px-5 pb-5 pt-2 border-t border-slate-100">
              <button onClick={confirmAddFromModal}
                className="w-full bg-orange-600 text-white font-black py-3.5 rounded-xl text-base hover:bg-orange-700 transition-colors active:scale-[0.98]">
                Add to basket · £{(
                  itemModal.item.price
                  + modalMods.reduce((s, m) => s + m.price, 0)
                  + itemModal.upsells.filter(u => modalUpsells.includes(u.name)).reduce((s, u) => s + u.price, 0)
                ).toFixed(2)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deals Modal */}
      {dealModalOpen && selectedBundleForModal && menu && (
        <DealsModal
          bundles={[selectedBundleForModal]}
          menuItems={menu.items}
          menuCategories={menu.categories}
          basketItems={basket.map(b => ({
            name: b.menuItem.name,
            quantity: b.quantity,
            unit_price: b.menuItem.price + b.modifiers.reduce((s, m) => s + m.price, 0),
            cartKey: b.cartKey,
            modifiers: b.modifiers,
            specialInstructions: b.specialInstructions || undefined,
          }))}
          existingDeals={appliedDeals}
          onApply={handleApplyDeal}
          onClose={() => setDealModalOpen(false)}
        />
      )}

      {/* Allergen information modal */}
      {showAllergenModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 flex flex-col gap-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Allergen information</h3>
              <button onClick={() => setShowAllergenModal(false)}
                className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
            </div>
            {truck?.allergen_info_url && (
              <a href={truck.allergen_info_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 bg-orange-50 border border-orange-100 rounded-xl px-4 py-3
                           text-sm text-orange-700 font-medium hover:bg-orange-100">
                📎 View allergen card (PDF/image)
              </a>
            )}
            {truck?.allergen_info_text && (
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{truck.allergen_info_text}</p>
            )}
            <p className="text-xs text-slate-400">
              If you have a severe allergy, please contact the vendor directly before ordering.
            </p>
          </div>
        </div>
      )}

    </Shell>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// Shared note input used on basket lines (compact) and in the modifier popup (full)
function ItemNoteInput({
  value, onChange, compact = false, onBlur, onKeyDown,
}: {
  value: string
  onChange: (v: string) => void
  compact?: boolean
  onBlur?: () => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
}) {
  if (compact) {
    return (
      <input
        autoFocus
        type="text"
        maxLength={60}
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        placeholder="Any requests? e.g. no onions"
        className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
      />
    )
  }
  return (
    <div>
      <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">
        Any requests? <span className="font-normal normal-case text-slate-400">— optional</span>
      </p>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value.slice(0, 60))}
        placeholder="e.g. no onions, extra crispy"
        rows={2}
        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white resize-none"
      />
      <p className="text-right text-[10px] text-slate-400 mt-0.5">{value.length}/60</p>
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-50 flex flex-col">{children}</div>
}

function Hdr({ slug, truck, scrolled, showBack = true }: { slug: string; truck: TruckData | null; scrolled: boolean; showBack?: boolean }) {
  return (
    <header className="bg-slate-900 text-white py-3 px-4 sticky top-0 z-50 shadow-md h-[60px] flex items-center">
      <div className="max-w-6xl mx-auto flex justify-between items-center w-full relative">

        {/* Left — Village Foodie logo, always visible */}
        <Link href="/" className="flex items-center transition-opacity hover:opacity-90 shrink-0 z-20">
          <Image src="/logos/village-foodie-logo-v2.png" alt="Village Foodie" width={140} height={42} className="object-contain w-[110px] sm:w-[140px]" priority />
        </Link>

        {/* Centre — truck logo + name, absolutely positioned so it never pushes logo or Back */}
        {truck && (
          <div className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-300 ${scrolled ? 'opacity-100' : 'opacity-0'}`}>
            <div className="flex items-center justify-center gap-1.5 sm:gap-2 px-[90px] sm:px-0 w-full">
              {truck.logo
                ? <Image src={truck.logo} alt={truck.name} width={24} height={24} className="w-6 h-6 sm:w-7 sm:h-7 object-contain rounded-full bg-white shadow-sm shrink-0" />
                : <div className="w-6 h-6 sm:w-7 sm:h-7 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-[10px] shrink-0">🚚</div>
              }
              <h1 className="text-[13px] sm:text-[15px] font-bold sm:font-black tracking-tight leading-tight truncate max-w-[110px] sm:max-w-xs">
                {truck.name}
              </h1>
            </div>
          </div>
        )}

        {/* Right — Back link. Hidden on the confirmation screen (showBack=false), where
           the bottom "Back to {truck}" button is the single action. Targets the truck's
           own order page by slug (Manual s.7) — /trucks/[slug] is the discovery profile
           and 404s for a HatchGrab-only tenant. Full navigation (<a>) so it lands on a
           fresh menu even from the error/unavailable states (same URL otherwise). */}
        {showBack && truck && (
          <a href={`/trucks/${slug}/order`} className="text-slate-400 hover:text-white text-xs font-bold transition-colors shrink-0 z-20">
            ← Back
          </a>
        )}

      </div>
    </header>
  )
}


function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-4 py-4 mb-4">
      <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">{title}</h2>
      {children}
    </div>
  )
}

function Fld({ label, required, note, children }: { label: string; required?: boolean; note?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
        {note && <span className="text-slate-400 font-normal ml-1">— {note}</span>}
      </label>
      {children}
    </div>
  )
}

function QBtn({ onClick, label, accent }: { onClick: () => void; label: string; accent?: boolean }) {
  return (
    <button onClick={onClick} className={`w-7 h-7 rounded-full border flex items-center justify-center text-base font-bold transition-colors active:scale-90 ${accent ? 'border-orange-400 text-orange-600 hover:bg-orange-50' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>{label}</button>
  )
}