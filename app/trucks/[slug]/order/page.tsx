'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { getBundleSlotCategories as getSlotCats, calculateDealOriginalPrice as calcOrigPrice } from '@/lib/deal-utils'
import { DealsModal } from '@/components/dashboard/DealsModal'
import Link from 'next/link';
import Image from 'next/image';
import { use } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MenuItem {
  name: string; description: string; price: number; available: boolean; category: string; stock_remaining?: number | null
}
interface UpsellRule {
  trigger_category: string; suggest_category: string; max_suggestions: number
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
interface TruckMenu { items: MenuItem[]; upsell_rules: UpsellRule[]; bundles: Bundle[]; codes: DiscountCode[] }
interface TruckData { id: string; name: string; logo: string | null; mode: 'village' | 'pub'; venue_name: string | null }
interface EventData {
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
  modifiers?: string[] // e.g. ["Extra Cheese +£1", "No Onion"]
}
interface AppliedDeal { bundle: Bundle; slots: Record<string, string> }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBundleAvailabilityMessage(b: Bundle): string | null {
  if (!b.start_time && !b.end_time) return null
  const now = new Date()
  const cur = now.getHours() * 60 + now.getMinutes()
  if (b.start_time) {
    const [h, m] = b.start_time.split(':').map(Number)
    if (cur < h * 60 + m) return `Available from ${b.start_time}`
  }
  if (b.end_time) {
    const [h, m] = b.end_time.split(':').map(Number)
    if (cur > h * 60 + m) return `Available until ${b.end_time} — no longer available`
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function OrderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)

  const [truck, setTruck] = useState<TruckData | null>(null)
  const [menu, setMenu] = useState<TruckMenu | null>(null)
  const [events, setEvents] = useState<EventData[]>([])
  const [event, setEvent] = useState<EventData | null>(null)
  const [eventLoading, setEventLoading] = useState(true)
  const [noEvents, setNoEvents] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submittedOrderId, setSubmittedOrderId] = useState<string | null>(null)
  const [isScrolled, setIsScrolled] = useState(false)
  const [summaryExpanded, setSummaryExpanded] = useState(false)
  const [footerHeight, setFooterHeight] = useState(220)
  const footerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!footerRef.current) return
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setFooterHeight(entry.contentRect.height + 16)
      }
    })
    observer.observe(footerRef.current)
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
  const [expandedItem, setExpandedItem] = useState<string | null>(null)
  const [discountInput, setDiscountInput] = useState('')
  const [appliedCode, setAppliedCode] = useState<DiscountCode | null>(null)
  const [discountError, setDiscountError] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [slotHour, setSlotHour] = useState('')
  const [slotMinute, setSlotMinute] = useState('')
  const [availableSlots, setAvailableSlots] = useState<{collection_time:string;available:boolean;remaining:number;is_past:boolean}[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [asapSlot, setAsapSlot] = useState<string|null>(null)
  const [notes, setNotes] = useState('')

  const selectedSlot = slotHour && slotMinute ? `${slotHour}:${slotMinute}` : ''

  // Fetch available slots for capacity-aware time selection
  const fetchSlots = async (truckId: string, date: string) => {
    setLoadingSlots(true)
    try {
      const res = await fetch(`/api/slots/${truckId}?date=${date}`)
      const data = await res.json()
      const slots = data.slots || []
      setAvailableSlots(slots)
      // Set ASAP to earliest available slot
      const first = slots.find((s: any) => s.available)
      setAsapSlot(first?.collection_time || null)
      // Auto-select ASAP
      if (first && !slotHour) {
        const [h, m] = first.collection_time.split(':')
        setSlotHour(h)
        setSlotMinute(m)
      }
    } catch { setAvailableSlots([]) }
    finally { setLoadingSlots(false) }
  }

  // Load upcoming events for this truck
  useEffect(() => {
    const loadEvent = async () => {
      try {
        const res = await fetch(`/api/events?truck=${slug}`)
        if (!res.ok) { setEventLoading(false); return }
        const data = await res.json()
        if (data.events && data.events.length > 0) {
          // Show events in the next 14 days
          const cutoff = new Date()
          cutoff.setDate(cutoff.getDate() + 14)
          const upcoming = data.events.filter((e: EventData) => {
            const [d, m, y] = e.date.split('/').map(Number)
            return new Date(y, m-1, d) <= cutoff
          })
          const eventsToShow = upcoming.length > 0 ? upcoming : [data.events[0]]
          setEvents(eventsToShow)
          setEvent(eventsToShow[0])
        if (eventsToShow[0] && truck) {
          const date = eventsToShow[0].date || new Date().toISOString().split('T')[0]
          fetchSlots(truck.id || slug, date)
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

  // Auto-expand summary when first item added
  useEffect(() => {
    if (basket.length === 1 && !summaryExpanded) setSummaryExpanded(true)
  }, [basket.length])

  useEffect(() => {
    fetch(`/api/menu/${slug}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        setTruck(data.truck)
        setMenu(data.menu)
        // If event already loaded, fetch slots now
        if (event && data.truck.id) {
          const date = event.date || new Date().toISOString().split('T')[0]
          fetchSlots(data.truck.id, date)
        }
      })
      .catch(() => setError('This truck is not currently taking orders.'))
      .finally(() => setLoading(false))
  }, [slug])

  // ── Basket ──────────────────────────────────────────────────────────────────

  const addItem = (item: MenuItem) => setBasket(prev => {
    const ex = prev.find(b => b.menuItem.name === item.name)
    // Stock check: don't allow adding if at limit
    if (item.stock_remaining != null && ex && ex.quantity >= item.stock_remaining) {
      return prev
    }
    return ex ? prev.map(b => b.menuItem.name === item.name ? { ...b, quantity: b.quantity + 1 } : b)
      : [...prev, { menuItem: item, quantity: 1 }]
  })

  const removeItem = (itemName: string) => {
    setAppliedDeals(d => d.filter(deal => !Object.values(deal.slots).includes(itemName)))
    setBasket(prev => {
      const ex = prev.find(b => b.menuItem.name === itemName)
      if (!ex) return prev
      return ex.quantity === 1
        ? prev.filter(b => b.menuItem.name !== itemName)
        : prev.map(b => b.menuItem.name === itemName ? { ...b, quantity: b.quantity - 1 } : b)
    })
  }

  const getQty = (n: string) => basket.find(b => b.menuItem.name === n)?.quantity || 0

  // ── Grouped menu ────────────────────────────────────────────────────────────
  const groupedMenu = useMemo(() => {
    if (!menu) return []
    const groups: Record<string, MenuItem[]> = {}
    menu.items.forEach(item => {
      if (!groups[item.category]) groups[item.category] = []
      groups[item.category].push(item)
    })
    return Object.entries(groups)
  }, [menu])

  // ── Upsells ─────────────────────────────────────────────────────────────────
  // Get upsell options for a specific item
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
    const slots = getSlotCats(bundle)
    setAppliedDeals(prev => [...prev, {
      bundle,
      slots: Object.fromEntries(slots.map((cat: string) => {
        const first = basket.find(b => b.menuItem.category === cat)
        return [cat, first?.menuItem.name || '']
      }))
    }])
  }

  const removeDeal = (i: number) => setAppliedDeals(prev => prev.filter((_, idx) => idx !== i))

  const updateSlot = (dealIdx: number, cat: string, val: string) =>
    setAppliedDeals(prev => prev.map((d, i) => i === dealIdx ? { ...d, slots: { ...d.slots, [cat]: val } } : d))

  const getSlotOptions = (cat: string) => basket.filter(b => b.menuItem.category === cat).map(b => b.menuItem)

  // ── Totals ──────────────────────────────────────────────────────────────────
  const { itemsTotal, dealDiscount, discountAmt, total } = useMemo(() => {
    const itemsTotal = basket.reduce((s, b) => s + b.menuItem.price * b.quantity, 0)
    const dealDiscount = appliedDeals.reduce((s, d) => {
      const orig = calcDealOriginalPrice(d, menu?.items || [])
      return s + Math.max(0, orig - d.bundle.bundle_price)
    }, 0)
    const sub = itemsTotal - dealDiscount
    const discountAmt = appliedCode
      ? appliedCode.type === 'pct' ? sub * appliedCode.value / 100 : appliedCode.value
      : 0
    return { itemsTotal, dealDiscount, discountAmt, total: Math.max(0, sub - discountAmt) }
  }, [basket, appliedDeals, appliedCode, menu])

  const hasItems = basket.length > 0
  const totalItems = basket.reduce((s, b) => s + b.quantity, 0)

  const applyCode = () => {
    if (!menu) return
    const found = menu.codes.find(c => c.code === discountInput.trim().toUpperCase())
    if (found) { setAppliedCode(found); setDiscountError('') }
    else { setAppliedCode(null); setDiscountError('Code not recognised') }
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  const submitOrder = async () => {
    if (!truck || !menu || !name || !email || !phone || !hasItems) return
    if (truck.mode === 'village' && !selectedSlot) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/orders/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          truckId: slug, customerName: name, customerEmail: email, customerPhone: phone,
          slot: selectedSlot || null, eventDate: new Date().toISOString().split('T')[0],
          items: basket.map(b => ({ name: b.menuItem.name, quantity: b.quantity, unit_price: b.menuItem.price })),
          deals: appliedDeals.map(d => ({ name: d.bundle.name, slots: d.slots })),
          discountCode: appliedCode?.code || null,
          subtotal: itemsTotal, discountAmt: dealDiscount + discountAmt, total, notes: notes || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Order failed')
      setSubmittedOrderId(data.orderId); setSubmitted(true)
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
          <Link href={`/trucks/${slug}`} className="mt-4 inline-block text-orange-600 font-bold hover:underline">← Back to truck page</Link>
        </div>
      </div>
    </Shell>
  )

  if (submitted) return (
    <Shell><Hdr slug={slug} truck={truck} scrolled={false} />
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">✓</div>
          <h2 className="text-2xl font-black text-slate-900 mb-2">Order received!</h2>
          <p className="text-slate-500 mb-4"><span className="font-bold text-slate-700">{truck?.name}</span> will confirm your order shortly.</p>
          {submittedOrderId && <p className="text-slate-400 text-sm mb-4">Order #{submittedOrderId}</p>}

          <div className="bg-slate-50 rounded-xl p-4 text-left space-y-2 mb-4 border border-slate-100">
            {/* Order items summary on confirmation */}
            {basket.map(b => (
              <div key={b.menuItem.name} className="flex justify-between text-sm">
                <span className="text-slate-600">{b.quantity}× {b.menuItem.name}</span>
                <span className="font-medium text-slate-700">£{(b.menuItem.price * b.quantity).toFixed(2)}</span>
              </div>
            ))}
            {dealDiscount > 0 && <div className="flex justify-between text-sm border-t border-slate-200 pt-2"><span className="text-green-600">Deals</span><span className="text-green-600 font-medium">-£{dealDiscount.toFixed(2)}</span></div>}
            <div className="flex justify-between text-sm border-t border-slate-200 pt-2">
              <span className="font-black text-slate-900">Total</span>
              <span className="font-black text-slate-900">£{total.toFixed(2)}</span>
            </div>
          </div>

          {selectedSlot && (
            <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 mb-4 text-sm text-left">
              <p className="font-bold text-orange-700 mb-0.5">Preferred collection: {selectedSlot}</p>
              <p className="text-orange-600 text-xs">{truck?.name} will confirm your collection time when they accept your order.</p>
            </div>
          )}

          <div className="flex justify-between text-sm mb-4">
            <span className="text-slate-500">Payment</span>
            <span className="font-bold text-slate-700">Pay at the truck</span>
          </div>

          <p className="text-slate-400 text-xs mb-6">Confirmation sent to {email}</p>
          <Link href={`/trucks/${slug}`} className="block w-full bg-slate-900 text-white font-bold py-3 px-6 rounded-xl hover:bg-slate-800 transition-colors">
            Back to {truck?.name}
          </Link>
        </div>
      </div>
    </Shell>
  )

  // ── Main form ───────────────────────────────────────────────────────────────
  return (
    <Shell>
      <Hdr slug={slug} truck={truck} scrolled={isScrolled} />
      <main className="flex-1 w-full max-w-lg mx-auto px-4 py-6" style={{ paddingBottom: `${footerHeight}px` }}>

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
              <p className="text-xs font-black text-orange-600 uppercase tracking-wider mb-2 text-center">Choose which event to order for</p>
              {events.length === 1 ? (
                // Single event — just show it, date+location on 2 lines
                <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
                  <p className="font-black text-slate-900 text-sm">
                    {event?.date_friendly}{event?.start_time && event?.end_time ? ` · ${event.start_time}–${event.end_time}` : ''}
                  </p>
                  <p className="text-slate-600 text-sm">{event?.venue_name}{event?.village ? `, ${event?.village}` : ''}</p>
                </div>
              ) : (
                // Multiple events — show selector
                <div className="space-y-2">
                  {events.map((e, idx) => (
                    <button
                      key={idx}
                      onClick={() => { setEvent(e); setSlotHour(''); setSlotMinute('') }}
                      className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                        event?.date_iso === e.date_iso && event?.venue_name === e.venue_name
                          ? 'bg-orange-50 border-2 border-orange-500'
                          : 'bg-white border border-slate-200 hover:border-orange-200'
                      }`}
                    >
                      <p className="font-black text-slate-900 text-sm">
                        {e.date_friendly}{e.start_time && e.end_time ? ` · ${e.start_time}–${e.end_time}` : ''}
                      </p>
                      <p className="text-slate-600 text-xs">{e.venue_name}{e.village ? `, ${e.village}` : ''}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* MEAL DEALS — flat cards, before menu, hidden if none available */}
        {menu && menu.bundles.filter(b => b.available).length > 0 && (
          <div className="mb-4">
            <h2 className="text-xs font-black text-orange-600 uppercase tracking-widest mb-2 px-1">🎁 Meal deals</h2>
            <div className="space-y-2">
              {menu.bundles.filter(b => b.available).map(bundle => {
                const isLocked = false
                const maxApplicable = maxDealsApplicable(bundle)
                const applied = dealsApplied(bundle)
                const canAddMore = applied < maxApplicable
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
                          </div>
                          <p className="text-slate-500 text-xs mt-0.5">{bundle.description}</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {slots.map((cat: string) => <span key={cat} className="text-[10px] bg-orange-50 text-orange-600 font-bold px-2 py-0.5 rounded-full uppercase">{cat}</span>)}
                          </div>
                        </div>
                        <p className="font-black text-orange-600 text-lg shrink-0">£{bundle.bundle_price.toFixed(2)}</p>
                      </div>
                      {canAddMore ? (
                        <button onClick={() => addDeal(bundle)}
                          className="w-full bg-orange-600 text-white font-bold text-sm py-2 rounded-xl hover:bg-orange-700 transition-colors active:scale-95">
                          {applied === 0 ? `Add deal · £${bundle.bundle_price.toFixed(2)}` : '+ Add another deal'}
                        </button>
                      ) : maxApplicable === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-1">Add {slots.join(' + ')} items to unlock</p>
                      ) : (
                        <p className="text-xs text-green-600 font-bold text-center py-1">✓ {applied} applied — max reached</p>
                      )}
                    </div>
                    {/* Applied deal instances */}
                    {appliedDeals
                      .map((deal, idx) => ({ deal, idx }))
                      .filter(({ deal }) => deal.bundle.name === bundle.name)
                      .map(({ deal, idx }) => {
                        const dynOrig = calcDealOriginalPrice(deal, menu.items)
                        const dynSaving = dynOrig > 0 ? Math.max(0, dynOrig - deal.bundle.bundle_price) : null
                        const dealNum = appliedDeals.filter((d, i) => d.bundle.name === bundle.name && i <= idx).length
                        return (
                          <div key={idx} className="border-t border-orange-100 px-4 py-3 bg-orange-50">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <p className="text-xs font-black text-orange-700">{applied > 1 ? `Deal ${dealNum}` : 'Your deal'}</p>
                                {dynSaving !== null && dynSaving > 0 && (
                                  <span className="text-[10px] bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded-full">Save £{dynSaving.toFixed(2)}</span>
                                )}
                              </div>
                              <button onClick={() => removeDeal(idx)} className="text-[10px] text-orange-400 hover:text-orange-600 font-bold">Remove</button>
                            </div>
                            {slots.map((cat: string) => (
                              <div key={cat} className="mb-2 last:mb-0">
                                <label className="block text-[10px] font-bold text-orange-600 uppercase tracking-wide mb-1">Choose {cat}</label>
                                <select value={deal.slots[cat] || ''} onChange={e => updateSlot(idx, cat, e.target.value)}
                                  className="w-full border border-orange-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
                                  <option value="">Select {cat}...</option>
                                  {getSlotOptions(cat).map(opt => <option key={opt.name} value={opt.name}>{opt.name} — £{opt.price.toFixed(2)}</option>)}
                                </select>
                              </div>
                            ))}
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
          <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Menu</h2>
          {groupedMenu.map(([category, items]) => (
            <div key={category} className="mb-4 last:mb-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-black text-orange-600 uppercase tracking-wider">{cap(category)}</span>
                <div className="flex-1 h-px bg-orange-100" />
              </div>
              <div className="divide-y divide-slate-100">
                {items.map(item => {
                  const qty = getQty(item.name)
                  const isSoldOut = !item.available
                  const itemUpsells = qty > 0 ? getItemUpsells(item) : []
                  const isExpanded = expandedItem === item.name
                  return (
                    <div key={item.name} className={isSoldOut ? 'opacity-60' : ''}>
                    <div className={`flex items-center gap-3 py-3`}>
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
                      </div>
                      <span className={`font-bold text-sm shrink-0 ${isSoldOut ? 'text-slate-400' : 'text-slate-700'}`}>£{item.price.toFixed(2)}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        {isSoldOut ? (
                          <span className="text-xs text-slate-400 font-medium px-3 py-1.5">Sold out</span>
                        ) : qty > 0 ? (
                          <>
                            <QBtn onClick={() => removeItem(item.name)} label="−" />
                            <span className="w-5 text-center font-black text-slate-900 text-sm">{qty}</span>
                            {item.stock_remaining != null && qty >= item.stock_remaining ? (
                              <button disabled className="w-7 h-7 rounded-lg bg-slate-100 text-slate-300 font-black text-sm cursor-not-allowed">+</button>
                            ) : (
                              <QBtn onClick={() => addItem(item)} label="+" accent />
                            )}
                          </>
                        ) : (
                          <button onClick={() => addItem(item)} className="bg-orange-600 text-white font-bold text-xs px-3 py-1.5 rounded-lg hover:bg-orange-700 transition-colors active:scale-95">Add</button>
                        )}
                      </div>
                    </div>
                    
                    {/* Modifiers/Upsells inline */}
                    {qty > 0 && itemUpsells.length > 0 && (
                      <div className="pl-3 pb-3">
                        {!isExpanded ? (
                          <button onClick={() => setExpandedItem(item.name)}
                            className="text-xs text-orange-600 font-bold hover:text-orange-700 flex items-center gap-1">
                            <span>+ Add extras</span>
                            <span>▼</span>
                          </button>
                        ) : (
                          <div className="bg-orange-50 rounded-xl p-3 border border-orange-100">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-black text-orange-700">Available extras</p>
                              <button onClick={() => setExpandedItem(null)} className="text-xs text-orange-400 hover:text-orange-600">▲</button>
                            </div>
                            <div className="space-y-1.5">
                              {itemUpsells.map(upsell => {
                                const upsellQty = getQty(upsell.name)
                                return (
                                  <button key={upsell.name} onClick={() => addItem(upsell)}
                                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-bold transition-all ${
                                      upsellQty > 0 
                                        ? 'bg-orange-600 text-white' 
                                        : 'bg-white text-slate-700 border border-orange-200 hover:border-orange-400'
                                    }`}>
                                    <span>{upsellQty > 0 ? `✓ ${upsellQty}× ` : ''}{upsell.name}</span>
                                    <span className={upsellQty > 0 ? 'text-orange-200' : 'text-orange-600'}>+£{upsell.price.toFixed(2)}</span>
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>



        {/* DISCOUNT CODE */}
        <Sec title="Discount code">
          <div className="flex gap-2">
            <input type="text" value={discountInput} onChange={e => { setDiscountInput(e.target.value); setDiscountError('') }}
              placeholder="Enter code"
              className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" />
            <button onClick={applyCode} className="bg-slate-900 text-white font-bold text-sm px-4 py-2.5 rounded-xl hover:bg-slate-800 transition-colors active:scale-95">Apply</button>
          </div>
          {discountError && <p className="text-red-500 text-xs font-medium mt-1.5">{discountError}</p>}
          {appliedCode && <p className="text-green-600 text-xs font-bold mt-1.5">✓ {appliedCode.type === 'pct' ? `${appliedCode.value}%` : `£${appliedCode.value.toFixed(2)}`} off applied</p>}
        </Sec>

        {/* COLLECTION TIME — capacity-aware slot buttons */}
        {truck?.mode === 'village' && (
          <Sec title="Collection time">
            {loadingSlots ? (
              <p className="text-slate-400 text-sm animate-pulse">Loading available times...</p>
            ) : availableSlots.length > 0 ? (
              <>
                {/* ASAP button */}
                <button
                  onClick={() => {
                    if (asapSlot) {
                      const [h, m] = asapSlot.split(':')
                      setSlotHour(h); setSlotMinute(m)
                    }
                  }}
                  className={`w-full mb-3 flex items-center justify-between px-4 py-3 rounded-xl border font-bold text-sm transition-all active:scale-[0.99] ${
                    selectedSlot === asapSlot
                      ? 'bg-orange-600 border-orange-600 text-white'
                      : 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100'
                  }`}>
                  <span>⚡ ASAP — collect at {asapSlot}</span>
                  <span className="text-xs opacity-70">Earliest available</span>
                </button>

                {/* All slots grid */}
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Or choose a time</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {availableSlots.map(slot => {
                    const isSelected = selectedSlot === slot.collection_time
                    const isFull = !slot.available
                    const isPast = slot.is_past
                    return (
                      <button key={slot.collection_time}
                        disabled={isFull || isPast}
                        onClick={() => {
                          const [h, m] = slot.collection_time.split(':')
                          setSlotHour(h); setSlotMinute(m)
                        }}
                        className={`py-2 rounded-lg text-sm font-bold transition-all border ${
                          isSelected
                            ? 'bg-orange-600 text-white border-orange-600'
                            : isFull || isPast
                              ? 'bg-slate-100 text-slate-300 border-slate-100 cursor-not-allowed line-through'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-orange-400 hover:text-orange-600 active:scale-95'
                        }`}>
                        {slot.collection_time}
                        {isFull && <span className="block text-[9px] font-normal">Full</span>}
                        {!isFull && !isPast && slot.remaining < 4 && (
                          <span className="block text-[9px] font-normal text-orange-500">{slot.remaining} left</span>
                        )}
                      </button>
                    )
                  })}
                </div>
                {selectedSlot && (
                  <p className="text-green-600 text-xs font-bold mt-2">✓ Collection time: {selectedSlot}</p>
                )}
              </>
            ) : (
              // Fallback: no slots configured — free time entry
              <>
                <p className="text-slate-400 text-xs mb-2">Choose your preferred collection time</p>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-slate-500 mb-1">Hour</label>
                    <select value={slotHour} onChange={e => { setSlotHour(e.target.value); setSlotMinute('') }}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white">
                      <option value="">--</option>
                      {Array.from({length:14},(_,i)=>String(i+10).padStart(2,'0')).map(h => (
                        <option key={h} value={h}>{parseInt(h)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-slate-500 mb-1">Minutes</label>
                    <select value={slotMinute} onChange={e => setSlotMinute(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white">
                      <option value="">--</option>
                      {['00','05','10','15','20','25','30','35','40','45','50','55'].map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {selectedSlot && (
                  <p className="text-green-600 text-xs font-bold mt-2">✓ Collection time: {selectedSlot}</p>
                )}
              </>
            )}
          </Sec>
        )}

        {/* YOUR DETAILS */}
        <Sec title="Your details">
          <div className="space-y-3">
            <Fld label="Name" required><input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sarah" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" /></Fld>
            <Fld label="Email" required note="confirmation sent here"><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="e.g. sarah@email.com" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" /></Fld>
            <Fld label="Phone number" required><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 07700 900123" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" /></Fld>
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

      </main>

      {/* STICKY FOOTER with expandable summary */}
      <div ref={footerRef} className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-xl px-4 pt-3 pb-6 z-50">
        <div className="max-w-lg mx-auto">

          {hasItems && (
            <div className="mb-3">
              {/* Collapsed / expanded toggle */}
              <button
                onClick={() => setSummaryExpanded(e => !e)}
                className="w-full flex items-center justify-between mb-2 group"
              >
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                  {totalItems} item{totalItems > 1 ? 's' : ''}
                  {appliedDeals.length > 0 && ` · ${appliedDeals.length} deal${appliedDeals.length > 1 ? 's' : ''}`}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="font-black text-slate-900 text-sm">£{total.toFixed(2)}</span>
                  <svg className={`w-4 h-4 text-slate-400 transition-transform ${summaryExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Expanded breakdown */}
              {summaryExpanded && (
                <div className="bg-slate-50 rounded-xl p-3 mb-2 space-y-1.5 border border-slate-100">
                  {basket.map(b => (
                    <div key={b.menuItem.name} className="flex justify-between text-xs">
                      <span className="text-slate-600">{b.quantity}× {b.menuItem.name}</span>
                      <span className="font-medium text-slate-700">£{(b.menuItem.price * b.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                  {dealDiscount > 0 && (
                    <div className="flex justify-between text-xs border-t border-slate-200 pt-1.5">
                      <span className="text-green-600">{appliedDeals.length} deal{appliedDeals.length > 1 ? 's' : ''}</span>
                      <span className="text-green-600 font-medium">-£{dealDiscount.toFixed(2)}</span>
                    </div>
                  )}
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

          <button onClick={submitOrder}
            disabled={submitting || !hasItems || !name || !email || !phone || (truck?.mode === 'village' && !selectedSlot)}
            className="w-full bg-orange-600 text-white font-black py-3.5 px-6 rounded-xl text-base hover:bg-orange-700 transition-colors active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed shadow-sm">
            {submitting ? 'Sending order...' : `Send order to ${truck?.name || 'truck'}`}
          </button>
          <p className="text-center text-slate-400 text-xs mt-2">Pay at the truck on collection · No card details needed</p>
        </div>
      </div>
    </Shell>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-50 flex flex-col">{children}</div>
}

function Hdr({ slug, truck, scrolled }: { slug: string; truck: TruckData | null; scrolled: boolean }) {
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

        {/* Right — Back link, always visible */}
        {truck && (
          <Link href={`/trucks/${slug}`} className="text-slate-400 hover:text-white text-xs font-bold transition-colors shrink-0 z-20">
            ← Back
          </Link>
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
