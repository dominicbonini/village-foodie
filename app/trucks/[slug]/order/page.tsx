'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { use } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MenuItem {
  name: string
  description: string
  price: number
  available: boolean
  category: string
  upsell_ids: string[]
}

interface UpsellItem {
  id: string
  name: string
  price: number
  available: boolean
  upsell_for: string
}

interface Bundle {
  name: string
  description: string
  original_price: number
  bundle_price: number
  available: boolean
}

interface DiscountCode {
  code: string
  type: 'pct' | 'fixed'
  value: number
  active: boolean
}

interface TruckMenu {
  items: MenuItem[]
  upsells: UpsellItem[]
  bundles: Bundle[]
  codes: DiscountCode[]
}

interface TruckData {
  id: string
  name: string
  mode: 'village' | 'pub'
  venue_name: string | null
}

interface BasketItem {
  menuItem: MenuItem
  quantity: number
  selectedUpsells: UpsellItem[]
}

interface Slot {
  collection_time: string
  production_slot: string
  available: boolean
  remaining: number
  is_popular: boolean
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OrderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const router = useRouter()

  const [truck, setTruck] = useState<TruckData | null>(null)
  const [menu, setMenu] = useState<TruckMenu | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submittedOrderId, setSubmittedOrderId] = useState<string | null>(null)

  // Basket state
  const [basket, setBasket] = useState<BasketItem[]>([])
  const [selectedBundle, setSelectedBundle] = useState<Bundle | null>(null)
  const [discountInput, setDiscountInput] = useState('')
  const [appliedCode, setAppliedCode] = useState<DiscountCode | null>(null)
  const [discountError, setDiscountError] = useState('')

  // Customer details
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [selectedSlot, setSelectedSlot] = useState('')
  const [notes, setNotes] = useState('')

  // ── Load menu data ──────────────────────────────────────────────────────────
  useEffect(() => {
    const loadMenu = async () => {
      try {
        const res = await fetch(`/api/menu/${slug}`)
        if (!res.ok) {
          setError('This truck is not currently taking orders.')
          setLoading(false)
          return
        }
        const data = await res.json()
        setTruck(data.truck)
        setMenu(data.menu)
      } catch {
        setError('Failed to load menu. Please try again.')
      } finally {
        setLoading(false)
      }
    }
    loadMenu()
  }, [slug])

  // ── Load slots ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!truck || truck.mode !== 'village') return
    const today = new Date().toISOString().split('T')[0]
    const loadSlots = async () => {
      try {
        const res = await fetch(`/api/slots/${slug}?date=${today}`)
        if (res.ok) {
          const data = await res.json()
          setSlots(data.slots || [])
        }
      } catch {
        // Slots unavailable — order can still be placed without slot
      }
    }
    loadSlots()
  }, [truck, slug])

  // ── Basket helpers ──────────────────────────────────────────────────────────

  const addToBasket = (item: MenuItem) => {
    setBasket(prev => {
      const existing = prev.find(b => b.menuItem.name === item.name)
      if (existing) {
        return prev.map(b =>
          b.menuItem.name === item.name
            ? { ...b, quantity: b.quantity + 1 }
            : b
        )
      }
      return [...prev, { menuItem: item, quantity: 1, selectedUpsells: [] }]
    })
  }

  const removeFromBasket = (itemName: string) => {
    setBasket(prev => {
      const existing = prev.find(b => b.menuItem.name === itemName)
      if (!existing) return prev
      if (existing.quantity === 1) {
        return prev.filter(b => b.menuItem.name !== itemName)
      }
      return prev.map(b =>
        b.menuItem.name === itemName
          ? { ...b, quantity: b.quantity - 1 }
          : b
      )
    })
  }

  const getQuantity = (itemName: string) =>
    basket.find(b => b.menuItem.name === itemName)?.quantity || 0

  const toggleUpsell = (itemName: string, upsell: UpsellItem) => {
    setBasket(prev =>
      prev.map(b => {
        if (b.menuItem.name !== itemName) return b
        const hasUpsell = b.selectedUpsells.find(u => u.id === upsell.id)
        return {
          ...b,
          selectedUpsells: hasUpsell
            ? b.selectedUpsells.filter(u => u.id !== upsell.id)
            : [...b.selectedUpsells, upsell],
        }
      })
    )
  }

  const isUpsellSelected = (itemName: string, upsellId: string) =>
    basket.find(b => b.menuItem.name === itemName)?.selectedUpsells.some(u => u.id === upsellId) || false

  // ── Upsells for a basket item ───────────────────────────────────────────────
  const getUpsellsForItem = (item: MenuItem): UpsellItem[] => {
    if (!menu) return []
    return menu.upsells.filter(
      u => u.upsell_for === item.category || item.upsell_ids.includes(u.id)
    )
  }

  // ── Totals ──────────────────────────────────────────────────────────────────
  const { itemsTotal, upsellsTotal, bundleDiscount, discountAmt, total } = useMemo(() => {
    const itemsTotal = basket.reduce(
      (sum, b) => sum + b.menuItem.price * b.quantity, 0
    )
    const upsellsTotal = basket.reduce(
      (sum, b) => sum + b.selectedUpsells.reduce((s, u) => s + u.price, 0), 0
    )
    const bundleDiscount = selectedBundle
      ? selectedBundle.original_price - selectedBundle.bundle_price
      : 0
    const subtotal = itemsTotal + upsellsTotal - bundleDiscount
    const discountAmt = appliedCode
      ? appliedCode.type === 'pct'
        ? subtotal * (appliedCode.value / 100)
        : appliedCode.value
      : 0
    const total = Math.max(0, subtotal - discountAmt)
    return { itemsTotal, upsellsTotal, bundleDiscount, discountAmt, total }
  }, [basket, selectedBundle, appliedCode])

  const hasItems = basket.length > 0

  // ── Apply discount code ─────────────────────────────────────────────────────
  const applyCode = () => {
    if (!menu) return
    const upper = discountInput.trim().toUpperCase()
    const found = menu.codes.find(c => c.code === upper)
    if (found) {
      setAppliedCode(found)
      setDiscountError('')
    } else {
      setAppliedCode(null)
      setDiscountError('Code not recognised')
    }
  }

  // ── Submit order ────────────────────────────────────────────────────────────
  const submitOrder = async () => {
    if (!truck || !menu || !name || !email || basket.length === 0) return
    if (truck.mode === 'village' && !selectedSlot) return

    setSubmitting(true)
    try {
      const items = basket.map(b => ({
        name: b.menuItem.name,
        quantity: b.quantity,
        unit_price: b.menuItem.price,
        upsells: b.selectedUpsells.map(u => ({ name: u.name, price: u.price })),
      }))

      const payload = {
        truckId: slug,
        customerName: name,
        customerEmail: email,
        customerPhone: phone || null,
        slot: selectedSlot || null,
        eventDate: new Date().toISOString().split('T')[0],
        items,
        bundle: selectedBundle?.name || null,
        discountCode: appliedCode?.code || null,
        subtotal: itemsTotal + upsellsTotal,
        discountAmt: bundleDiscount + discountAmt,
        total,
        notes: notes || null,
      }

      const res = await fetch('/api/orders/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Order failed')

      setSubmittedOrderId(data.orderId)
      setSubmitted(true)
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Loading state ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Header slug={slug} truckName={null} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-slate-400 animate-pulse font-medium">Loading menu...</div>
        </div>
      </div>
    )
  }

  // ── Error state ─────────────────────────────────────────────────────────────
  if (error && !submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Header slug={slug} truckName={truck?.name || null} />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-2xl mb-4 mx-auto">😕</div>
            <p className="text-slate-600 font-medium">{error}</p>
            <Link href={`/trucks/${slug}`} className="mt-4 inline-block text-orange-600 font-bold hover:underline">
              ← Back to truck page
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Success state ───────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Header slug={slug} truckName={truck?.name || null} />
        <div className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-sm w-full text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">✓</div>
            <h2 className="text-2xl font-black text-slate-900 mb-2">Order received!</h2>
            <p className="text-slate-500 mb-1">
              <span className="font-bold text-slate-700">{truck?.name}</span> will confirm shortly.
            </p>
            {submittedOrderId && (
              <p className="text-slate-400 text-sm mb-4">Order #{submittedOrderId}</p>
            )}
            <div className="bg-slate-50 rounded-xl p-4 text-left space-y-2 mb-6 border border-slate-100">
              {selectedSlot && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Collection</span>
                  <span className="font-bold text-slate-700">{selectedSlot}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Total</span>
                <span className="font-bold text-slate-700">£{total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Payment</span>
                <span className="font-bold text-slate-700">Pay at the truck</span>
              </div>
            </div>
            <p className="text-slate-400 text-xs mb-6">
              Confirmation sent to {email}
            </p>
            <Link
              href={`/trucks/${slug}`}
              className="block w-full bg-slate-900 text-white font-bold py-3 px-6 rounded-xl hover:bg-slate-800 transition-colors"
            >
              Back to {truck?.name}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Main order form ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header slug={slug} truckName={truck?.name || null} />

      <main className="flex-1 w-full max-w-lg mx-auto px-4 py-6 pb-32">

        {/* Truck name + back link */}
        <div className="mb-5">
          <Link
            href={`/trucks/${slug}`}
            className="text-sm text-slate-400 hover:text-slate-600 font-medium flex items-center gap-1 mb-3 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
            </svg>
            Back to {truck?.name}
          </Link>
          <h1 className="text-2xl font-black text-slate-900">
            Pre-order from {truck?.name}
            {truck?.venue_name && (
              <span className="block text-base font-bold text-slate-400 mt-0.5">{truck.venue_name}</span>
            )}
          </h1>
          <p className="text-slate-500 text-sm mt-1">Choose your items, collect and pay at the truck.</p>
        </div>

        {/* ── MENU SECTION ── */}
        <Section title="Menu">
          <div className="divide-y divide-slate-100">
            {menu?.items.map(item => {
              const qty = getQuantity(item.name)
              const itemUpsells = getUpsellsForItem(item)
              const basketItem = basket.find(b => b.menuItem.name === item.name)

              return (
                <div key={item.name}>
                  <div className="flex items-center gap-3 py-3.5">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900 text-sm leading-snug">{item.name}</p>
                      {item.description && (
                        <p className="text-slate-400 text-xs mt-0.5 leading-snug">{item.description}</p>
                      )}
                    </div>
                    <span className="text-slate-700 font-bold text-sm shrink-0">
                      £{item.price.toFixed(2)}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      {qty > 0 ? (
                        <>
                          <QtyBtn onClick={() => removeFromBasket(item.name)} label="−" />
                          <span className="w-5 text-center font-black text-slate-900 text-sm">{qty}</span>
                          <QtyBtn onClick={() => addToBasket(item)} label="+" accent />
                        </>
                      ) : (
                        <button
                          onClick={() => addToBasket(item)}
                          className="bg-orange-600 text-white font-bold text-xs px-3 py-1.5 rounded-lg hover:bg-orange-700 transition-colors active:scale-95"
                        >
                          Add
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Per-item upsells — shown when item is in basket */}
                  {qty > 0 && itemUpsells.length > 0 && (
                    <div className="bg-orange-50 rounded-xl px-3 py-2.5 mb-2 -mt-1">
                      <p className="text-xs font-bold text-orange-700 mb-2">
                        Add to your {item.name.toLowerCase()}?
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {itemUpsells.map(upsell => {
                          const selected = isUpsellSelected(item.name, upsell.id)
                          return (
                            <button
                              key={upsell.id}
                              onClick={() => toggleUpsell(item.name, upsell)}
                              className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg border transition-all active:scale-95 ${
                                selected
                                  ? 'bg-orange-600 text-white border-orange-600'
                                  : 'bg-white text-slate-700 border-orange-200 hover:border-orange-400'
                              }`}
                            >
                              {selected && <span>✓</span>}
                              <span>{upsell.name}</span>
                              <span className={selected ? 'text-orange-200' : 'text-orange-500'}>
                                +£{upsell.price.toFixed(2)}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Section>

        {/* ── BUNDLES ── */}
        {menu && menu.bundles.length > 0 && (
          <Section title="Meal deals">
            <div className="space-y-2">
              {menu.bundles.map(bundle => {
                const isSelected = selectedBundle?.name === bundle.name
                return (
                  <button
                    key={bundle.name}
                    onClick={() => setSelectedBundle(isSelected ? null : bundle)}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                      isSelected
                        ? 'border-2 border-orange-500 bg-orange-50'
                        : 'border border-slate-200 bg-white hover:border-orange-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="font-bold text-slate-900 text-sm">{bundle.name}</p>
                        <p className="text-slate-400 text-xs mt-0.5">{bundle.description}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400 text-xs line-through">
                            £{bundle.original_price.toFixed(2)}
                          </span>
                          <span className="font-black text-orange-600 text-sm">
                            £{bundle.bundle_price.toFixed(2)}
                          </span>
                        </div>
                        <span className="text-[10px] bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded-full">
                          Save £{(bundle.original_price - bundle.bundle_price).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </Section>
        )}

        {/* ── DISCOUNT CODE ── */}
        <Section title="Discount code">
          <div className="flex gap-2">
            <input
              type="text"
              value={discountInput}
              onChange={e => { setDiscountInput(e.target.value); setDiscountError('') }}
              placeholder="Enter code"
              className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
            />
            <button
              onClick={applyCode}
              className="bg-slate-900 text-white font-bold text-sm px-4 py-2.5 rounded-xl hover:bg-slate-800 transition-colors active:scale-95"
            >
              Apply
            </button>
          </div>
          {discountError && (
            <p className="text-red-500 text-xs font-medium mt-1.5">{discountError}</p>
          )}
          {appliedCode && (
            <p className="text-green-600 text-xs font-bold mt-1.5">
              ✓ {appliedCode.type === 'pct' ? `${appliedCode.value}% off` : `£${appliedCode.value.toFixed(2)} off`} applied
            </p>
          )}
        </Section>

        {/* ── COLLECTION SLOT ── */}
        {truck?.mode === 'village' && (
          <Section title="Collection time">
            {slots.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {slots.map(slot => (
                  <button
                    key={slot.collection_time}
                    onClick={() => setSelectedSlot(slot.collection_time)}
                    className={`py-2.5 px-2 rounded-xl border text-sm font-bold transition-all active:scale-95 ${
                      selectedSlot === slot.collection_time
                        ? 'bg-orange-600 text-white border-orange-600'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-orange-300'
                    }`}
                  >
                    {slot.collection_time}
                    {slot.is_popular && selectedSlot !== slot.collection_time && (
                      <span className="block text-[10px] text-orange-500 font-medium">Filling up</span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <input
                type="text"
                value={selectedSlot}
                onChange={e => setSelectedSlot(e.target.value)}
                placeholder="e.g. 12:30"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
              />
            )}
          </Section>
        )}

        {/* ── YOUR DETAILS ── */}
        <Section title="Your details">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Name <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Sarah"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">
                Email <span className="text-red-400">*</span>
                <span className="text-slate-400 font-normal ml-1">— confirmation sent here</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="e.g. sarah@email.com"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">
                Phone <span className="text-slate-400 font-normal">— optional, SMS fallback</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="e.g. 07700 900123"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Special instructions</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Allergies, no onion, extra crispy…"
                rows={2}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white resize-none"
              />
            </div>
          </div>
        </Section>

      </main>

      {/* ── STICKY ORDER SUMMARY + SUBMIT ── */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-xl px-4 py-4 z-50">
        <div className="max-w-lg mx-auto">

          {/* Summary rows — only show when items selected */}
          {hasItems && (
            <div className="mb-3 space-y-1">
              <SummaryRow label="Items" value={`£${itemsTotal.toFixed(2)}`} />
              {upsellsTotal > 0 && (
                <SummaryRow label="Extras" value={`£${upsellsTotal.toFixed(2)}`} />
              )}
              {bundleDiscount > 0 && (
                <SummaryRow label={`Deal: ${selectedBundle?.name}`} value={`-£${bundleDiscount.toFixed(2)}`} green />
              )}
              {discountAmt > 0 && (
                <SummaryRow label={`Code: ${appliedCode?.code}`} value={`-£${discountAmt.toFixed(2)}`} green />
              )}
              <div className="flex justify-between pt-1 border-t border-slate-100 mt-1">
                <span className="font-black text-slate-900 text-sm">Total</span>
                <span className="font-black text-slate-900 text-sm">£{total.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Validation hint */}
          {!hasItems && (
            <p className="text-center text-slate-400 text-xs font-medium mb-2">Add items from the menu to place an order</p>
          )}

          <button
            onClick={submitOrder}
            disabled={
              submitting ||
              !hasItems ||
              !name ||
              !email ||
              (truck?.mode === 'village' && !selectedSlot)
            }
            className="w-full bg-orange-600 text-white font-black py-3.5 px-6 rounded-xl text-base hover:bg-orange-700 transition-colors active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
          >
            {submitting ? 'Sending order...' : `Send order to ${truck?.name || 'truck'}`}
          </button>

          <p className="text-center text-slate-400 text-xs mt-2">
            Pay at the truck on collection · No card details needed
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Header({ slug, truckName }: { slug: string; truckName: string | null }) {
  return (
    <header className="bg-slate-900 text-white py-3 px-4 sticky top-0 z-50 shadow-md h-[60px] flex items-center">
      <div className="max-w-6xl mx-auto flex items-center w-full gap-3">
        <Link href="/" className="flex items-center transition-opacity hover:opacity-90 shrink-0">
          <Image
            src="/logos/village-foodie-logo-v2.png"
            alt="Village Foodie"
            width={140}
            height={42}
            className="object-contain w-[110px] sm:w-[140px]"
            priority
          />
        </Link>
        {truckName && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-slate-400 text-sm hidden sm:block">Pre-order from</span>
            <span className="text-white font-bold text-sm truncate max-w-[120px] sm:max-w-xs">{truckName}</span>
          </div>
        )}
      </div>
    </header>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-4 py-4 mb-4">
      <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">{title}</h2>
      {children}
    </div>
  )
}

function QtyBtn({ onClick, label, accent }: { onClick: () => void; label: string; accent?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-7 h-7 rounded-full border flex items-center justify-center text-base font-bold transition-colors active:scale-90 ${
        accent
          ? 'border-orange-400 text-orange-600 hover:bg-orange-50'
          : 'border-slate-300 text-slate-600 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  )
}

function SummaryRow({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={`text-xs font-medium ${green ? 'text-green-600' : 'text-slate-500'}`}>{label}</span>
      <span className={`text-xs font-bold ${green ? 'text-green-600' : 'text-slate-700'}`}>{value}</span>
    </div>
  )
}