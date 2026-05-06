'use client';

import { useState, useEffect, useCallback, use } from 'react';
import Image from 'next/image';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Order {
  id: string
  customer_name: string
  customer_phone: string | null
  customer_email: string | null
  slot: string | null
  status: string
  items: { name: string; quantity: number; unit_price: number }[]
  deals: { name: string; slots: Record<string,string> }[] | null
  total: number
  notes: string | null
  created_at: string
}

interface Slot {
  collection_time: string
  production_slot: string
  current_orders: number
  max_orders: number
  available: boolean
}

interface TruckData {
  id: string
  name: string
  mode: string
  venue_name: string | null
}

interface MenuItem {
  name: string
  description: string
  price: number
  category: string
}

interface TruckMenu {
  items: MenuItem[]
}

// ─── ASAP slot calculator ────────────────────────────────────────────────────
// Finds the next available slot considering current order load
function getAsapSlot(slots: Slot[]): Slot | null {
  if (!slots.length) return null
  const now = new Date()
  const nowMins = now.getHours() * 60 + now.getMinutes()
  // Find slots that are in the future and have capacity
  const available = slots.filter(s => {
    const [h, m] = s.collection_time.split(':').map(Number)
    const slotMins = h * 60 + m
    return slotMins > nowMins && s.available
  })
  return available[0] || null
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS = {
  pending:   { label: 'New',       bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
  confirmed: { label: 'Confirmed', bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500'  },
  rejected:  { label: 'Rejected',  bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-400'    },
  ready:     { label: 'Ready',     bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-500'   },
  collected: { label: 'Collected', bg: 'bg-slate-100',  text: 'text-slate-500',  dot: 'bg-slate-400'  },
  modified:  { label: 'Modified',  bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500' },
} as const

// ─── Main component ───────────────────────────────────────────────────────────

export default function DashboardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)

  const [pin, setPin] = useState('')
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [requiresPin, setRequiresPin] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)

  const [truck, setTruck] = useState<TruckData | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [slots, setSlots] = useState<Slot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const [activeTab, setActiveTab] = useState<'orders' | 'manual'>('orders')
  const [truckMenu, setTruckMenu] = useState<TruckMenu | null>(null)
  const [slotMode, setSlotMode] = useState<'asap' | 'specific'>('asap')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Manual order form
  const [manualName, setManualName] = useState('')
  const [manualPhone, setManualPhone] = useState('')
  const [manualEmail, setManualEmail] = useState('')
  const [manualSlot, setManualSlot] = useState('')
  const [manualNotes, setManualNotes] = useState('')
  const [manualItems, setManualItems] = useState<{ name: string; quantity: number; unit_price: number }[]>([])

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ── Fetch orders ────────────────────────────────────────────────────────────
  const fetchOrders = useCallback(async (currentPin = pin) => {
    try {
      const params = new URLSearchParams({ token })
      if (currentPin) params.set('pin', currentPin)
      const res = await fetch(`/api/dashboard?${params}`)
      const data = await res.json()

      if (res.status === 401) {
        if (data.requiresPin) { setRequiresPin(true); setLoading(false); return }
        setError('Invalid access link'); setLoading(false); return
      }

      if (!res.ok) { setError(data.error || 'Failed to load'); setLoading(false); return }

      setTruck(data.truck)
      setOrders(data.orders)
      setSlots(data.slots)
      setAuthenticated(true)
      setLastRefresh(new Date())
      // Load truck menu for manual order entry
      if (data.truck?.id && !truckMenu) {
        fetch(`/api/menu/${data.truck.id}`)
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d?.menu) setTruckMenu(d.menu) })
          .catch(() => null)
      }
    } catch {
      setError('Connection error')
    } finally {
      setLoading(false)
    }
  }, [token, pin])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!authenticated) return
    const interval = setInterval(() => fetchOrders(), 30000)
    return () => clearInterval(interval)
  }, [authenticated, fetchOrders])

  // ── PIN submit ──────────────────────────────────────────────────────────────
  // Derived ASAP slot
  const asapSlot = getAsapSlot(slots)

  const submitPin = async () => {
    const params = new URLSearchParams({ token, pin: pinInput })
    const res = await fetch(`/api/dashboard?${params}`)
    const data = await res.json()
    if (!res.ok) { setPinError('Incorrect PIN'); return }
    setPin(pinInput)
    setTruck(data.truck)
    setOrders(data.orders)
    setSlots(data.slots)
    setAuthenticated(true)
    setRequiresPin(false)
  }

  // ── Order action ────────────────────────────────────────────────────────────
  const doAction = async (action: string, orderId: string) => {
    setActionLoading(`${action}-${orderId}`)
    try {
      const res = await fetch('/api/dashboard/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, pin, action, orderId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showToast(`Order #${orderId} ${action === 'confirm' ? 'confirmed' : action === 'reject' ? 'rejected' : action}d`)
      await fetchOrders()
    } catch (err: any) {
      showToast(err.message || 'Action failed', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  // ── Manual order submit ─────────────────────────────────────────────────────
  const submitManual = async () => {
    const validItems = manualItems.filter(i => i.name.trim() && i.unit_price > 0)
    if (!manualName.trim() || !validItems.length) {
      showToast('Name and at least one item with price required', 'error'); return
    }
    setActionLoading('manual')
    try {
      const res = await fetch('/api/dashboard/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token, pin, action: 'manual',
          manualOrder: {
            customerName:  manualName,
            customerPhone: manualPhone || null,
            customerEmail: manualEmail || null,
            slot:          slotMode === 'asap' ? (asapSlot?.collection_time || null) : (manualSlot || null),
            items:         validItems,
            notes:         manualNotes || null,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const msg = data.slotFull
        ? `Order #${data.orderId} saved as pending — slot is full`
        : `Order #${data.orderId} saved and confirmed`
      showToast(msg)
      setManualName(''); setManualPhone(''); setManualEmail('')
      setManualSlot(''); setManualNotes('')
      setManualItems([{ name: '', quantity: 1, unit_price: 0 }])
      setActiveTab('orders')
      await fetchOrders()
    } catch (err: any) {
      showToast(err.message || 'Failed to save order', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  // ── Loading / error / PIN screens ───────────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <p className="text-slate-400 animate-pulse font-medium">Loading dashboard...</p>
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-white font-bold text-lg mb-2">Access denied</p>
        <p className="text-slate-400 text-sm">{error}</p>
        <Link href="/" className="mt-4 inline-block text-orange-400 text-sm hover:underline">← Village Foodie</Link>
      </div>
    </div>
  )

  if (requiresPin && !authenticated) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="bg-slate-800 rounded-2xl p-8 max-w-sm w-full text-center">
        <div className="text-4xl mb-4">🔒</div>
        <h2 className="text-white font-black text-xl mb-2">Enter PIN</h2>
        <p className="text-slate-400 text-sm mb-6">Enter your 4-digit dashboard PIN</p>
        <input
          type="number"
          maxLength={4}
          value={pinInput}
          onChange={e => setPinInput(e.target.value.slice(0, 4))}
          onKeyDown={e => e.key === 'Enter' && submitPin()}
          placeholder="• • • •"
          className="w-full text-center text-2xl font-black tracking-widest bg-slate-700 text-white rounded-xl px-4 py-3 mb-3 focus:outline-none focus:ring-2 focus:ring-orange-500 border border-slate-600"
        />
        {pinError && <p className="text-red-400 text-sm mb-3">{pinError}</p>}
        <button onClick={submitPin} className="w-full bg-orange-600 text-white font-black py-3 rounded-xl hover:bg-orange-700 transition-colors">
          Unlock
        </button>
      </div>
    </div>
  )

  // ── Order counts for summary ────────────────────────────────────────────────
  const pendingOrders   = orders.filter(o => o.status === 'pending')
  const confirmedOrders = orders.filter(o => o.status === 'confirmed')
  const otherOrders     = orders.filter(o => !['pending','confirmed'].includes(o.status))

  // ── Main dashboard ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-900 text-white">

      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-4 py-3 sticky top-0 z-50">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Image src="/logos/village-foodie-logo-v2.png" alt="Village Foodie" width={100} height={30} className="object-contain opacity-80" />
            </Link>
            <div className="h-5 w-px bg-slate-600" />
            <div>
              <p className="font-black text-sm leading-none">{truck?.name}</p>
              {truck?.venue_name && <p className="text-slate-400 text-xs mt-0.5">{truck.venue_name}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {pendingOrders.length > 0 && (
              <span className="bg-orange-500 text-white text-xs font-black px-2 py-0.5 rounded-full animate-pulse">
                {pendingOrders.length} new
              </span>
            )}
            <button
              onClick={() => fetchOrders()}
              className="text-slate-400 hover:text-white text-xs font-medium transition-colors"
            >
              ↻ Refresh
            </button>
          </div>
        </div>
      </header>

      {/* Tab bar */}
      <div className="bg-slate-800 border-b border-slate-700 px-4">
        <div className="max-w-2xl mx-auto flex">
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'orders' ? 'border-orange-500 text-white' : 'border-transparent text-slate-400 hover:text-white'}`}
          >
            Live orders {orders.filter(o => ['pending','confirmed'].includes(o.status)).length > 0 && `(${orders.filter(o => ['pending','confirmed'].includes(o.status)).length})`}
          </button>
          <button
            onClick={() => setActiveTab('manual')}
            className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'manual' ? 'border-orange-500 text-white' : 'border-transparent text-slate-400 hover:text-white'}`}
          >
            + Add order
          </button>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-4 pb-20">

        {/* ORDERS TAB */}
        {activeTab === 'orders' && (
          <div>
            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <StatCard label="New" value={pendingOrders.length} accent="orange" />
              <StatCard label="Confirmed" value={confirmedOrders.length} accent="green" />
              <StatCard label="Done" value={otherOrders.length} accent="slate" />
            </div>

            {/* New orders first */}
            {pendingOrders.length > 0 && (
              <div className="mb-4">
                <SectionLabel>New orders — action needed</SectionLabel>
                <div className="space-y-3">
                  {pendingOrders.map(order => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      truck={truck}
                      actionLoading={actionLoading}
                      onAction={doAction}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Confirmed orders */}
            {confirmedOrders.length > 0 && (
              <div className="mb-4">
                <SectionLabel>Confirmed</SectionLabel>
                <div className="space-y-3">
                  {confirmedOrders.map(order => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      truck={truck}
                      actionLoading={actionLoading}
                      onAction={doAction}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* All other orders */}
            {otherOrders.length > 0 && (
              <div className="mb-4">
                <SectionLabel>Earlier today</SectionLabel>
                <div className="space-y-2">
                  {otherOrders.map(order => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      truck={truck}
                      actionLoading={actionLoading}
                      onAction={doAction}
                      compact
                    />
                  ))}
                </div>
              </div>
            )}

            {orders.length === 0 && (
              <div className="text-center py-16">
                <p className="text-4xl mb-3">🍕</p>
                <p className="text-slate-400 font-medium">No orders yet today</p>
                <p className="text-slate-500 text-sm mt-1">Orders will appear here automatically</p>
                <p className="text-slate-600 text-xs mt-3">Last updated: {lastRefresh.toLocaleTimeString()}</p>
              </div>
            )}
          </div>
        )}

        {/* MANUAL ORDER TAB */}
        {activeTab === 'manual' && (
          <div>
            <SectionLabel>Add walk-up or phone order</SectionLabel>

            <div className="bg-slate-800 rounded-2xl p-4 space-y-3">

              <ManualField label="Customer name *">
                <input type="text" value={manualName} onChange={e => setManualName(e.target.value)}
                  placeholder="e.g. John" className="w-full bg-slate-700 text-white rounded-xl px-3 py-2.5 text-sm font-medium placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500 border border-slate-600" />
              </ManualField>

              <ManualField label="Email (optional)">
                <input type="email" value={manualEmail} onChange={e => setManualEmail(e.target.value)}
                  placeholder="For ready notification" className="w-full bg-slate-700 text-white rounded-xl px-3 py-2.5 text-sm font-medium placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500 border border-slate-600" />
              </ManualField>

              <ManualField label="Phone (optional)">
                <input type="tel" value={manualPhone} onChange={e => setManualPhone(e.target.value)}
                  placeholder="07700 900000" className="w-full bg-slate-700 text-white rounded-xl px-3 py-2.5 text-sm font-medium placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500 border border-slate-600" />
              </ManualField>

              {/* Collection time — ASAP default with optional override */}
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-wide">Collection time</label>
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() => { setSlotMode('asap'); setManualSlot(asapSlot?.collection_time || '') }}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-black transition-all ${slotMode === 'asap' ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                  >
                    ⚡ ASAP
                  </button>
                  <button
                    onClick={() => setSlotMode('specific')}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-black transition-all ${slotMode === 'specific' ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                  >
                    🕐 Choose time
                  </button>
                </div>

                {slotMode === 'asap' ? (
                  <div className="bg-slate-700 rounded-xl px-3 py-2.5">
                    {asapSlot ? (
                      <>
                        <p className="text-green-400 font-black text-sm">
                          Ready at approximately {asapSlot.collection_time}
                        </p>
                        <p className="text-slate-400 text-xs mt-0.5">
                          {asapSlot.max_orders - asapSlot.current_orders} slot{asapSlot.max_orders - asapSlot.current_orders !== 1 ? 's' : ''} available in this window
                        </p>
                      </>
                    ) : (
                      <p className="text-orange-400 text-sm font-bold">No slots available — walk-up only</p>
                    )}
                  </div>
                ) : (
                  <div>
                    <select
                      value={manualSlot}
                      onChange={e => setManualSlot(e.target.value)}
                      className="w-full bg-slate-700 text-white rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500 border border-slate-600"
                    >
                      <option value="">Walk-up / no slot</option>
                      {slots.map(s => {
                        const pct = s.max_orders > 0 ? s.current_orders / s.max_orders : 0
                        const label = pct >= 1 ? '🔴 FULL' : pct >= 0.7 ? `🟡 ${s.max_orders - s.current_orders} left` : `🟢 ${s.max_orders - s.current_orders} left`
                        return (
                          <option key={s.collection_time} value={s.collection_time}>
                            {s.collection_time} — {label}
                          </option>
                        )
                      })}
                    </select>
                    {manualSlot && (() => {
                      const sl = slots.find(s => s.collection_time === manualSlot)
                      if (!sl) return null
                      return sl.available
                        ? <p className="text-green-400 text-xs mt-1">✓ Slot available — order will auto-confirm</p>
                        : <p className="text-orange-400 text-xs mt-1">⚠ Slot full — order saved as pending</p>
                    })()}
                  </div>
                )}
              </div>

              {/* Menu items — tap to add */}
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-wide">Items *</label>

                {truckMenu ? (
                  <div className="space-y-3">
                    {/* Group by category */}
                    {Object.entries(
                      truckMenu.items.reduce((groups: Record<string, MenuItem[]>, item) => {
                        if (!groups[item.category]) groups[item.category] = []
                        groups[item.category].push(item)
                        return groups
                      }, {})
                    ).map(([category, items]) => (
                      <div key={category}>
                        <p className="text-xs font-black text-orange-400 uppercase tracking-wide mb-1.5">
                          {category.charAt(0).toUpperCase() + category.slice(1)}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {(items as MenuItem[]).map(item => {
                            const inBasket = manualItems.find(i => i.name === item.name)
                            return (
                              <button
                                key={item.name}
                                onClick={() => {
                                  if (inBasket) {
                                    setManualItems(prev => prev.map(i =>
                                      i.name === item.name ? { ...i, quantity: i.quantity + 1 } : i
                                    ))
                                  } else {
                                    setManualItems(prev => [...prev, { name: item.name, quantity: 1, unit_price: item.price }])
                                  }
                                }}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-bold transition-all active:scale-95 ${
                                  inBasket
                                    ? 'bg-orange-600 border-orange-600 text-white'
                                    : 'bg-slate-700 border-slate-600 text-slate-200 hover:border-orange-400'
                                }`}
                              >
                                {inBasket && <span className="text-orange-200">{inBasket.quantity}×</span>}
                                <span>{item.name}</span>
                                <span className={inBasket ? 'text-orange-200' : 'text-slate-400'}>£{item.price.toFixed(2)}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}

                    {/* Basket summary with quantity controls */}
                    {manualItems.length > 0 && (
                      <div className="bg-slate-700 rounded-xl p-3 mt-2 space-y-2">
                        <p className="text-xs font-black text-slate-400 uppercase tracking-wide">Order</p>
                        {manualItems.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between">
                            <span className="text-white text-sm font-medium flex-1">{item.name}</span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setManualItems(prev => {
                                  const updated = prev.map((i, n) => n === idx ? { ...i, quantity: i.quantity - 1 } : i)
                                  return updated.filter(i => i.quantity > 0)
                                })}
                                className="w-6 h-6 rounded-full bg-slate-600 text-white flex items-center justify-center text-sm font-bold hover:bg-red-600 transition-colors"
                              >−</button>
                              <span className="text-white font-black w-4 text-center text-sm">{item.quantity}</span>
                              <button
                                onClick={() => setManualItems(prev => prev.map((i, n) => n === idx ? { ...i, quantity: i.quantity + 1 } : i))}
                                className="w-6 h-6 rounded-full bg-slate-600 text-white flex items-center justify-center text-sm font-bold hover:bg-orange-600 transition-colors"
                              >+</button>
                              <span className="text-slate-400 text-xs w-14 text-right">£{(item.unit_price * item.quantity).toFixed(2)}</span>
                            </div>
                          </div>
                        ))}
                        <div className="flex justify-between pt-2 border-t border-slate-600">
                          <span className="text-slate-300 text-sm font-bold">Total</span>
                          <span className="text-white font-black">£{manualItems.reduce((s, i) => s + i.unit_price * i.quantity, 0).toFixed(2)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  // Fallback if menu not loaded
                  <p className="text-slate-400 text-sm">Loading menu...</p>
                )}
              </div>

              <ManualField label="Notes">
                <textarea value={manualNotes} onChange={e => setManualNotes(e.target.value)}
                  placeholder="Allergies, special requests…" rows={2}
                  className="w-full bg-slate-700 text-white rounded-xl px-3 py-2.5 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500 border border-slate-600 resize-none" />
              </ManualField>

              <button
                onClick={submitManual}
                disabled={actionLoading === 'manual' || !manualName.trim() || manualItems.length === 0}
                className="w-full bg-orange-600 text-white font-black py-3.5 rounded-xl hover:bg-orange-700 transition-colors active:scale-[0.98] disabled:opacity-50 mt-2"
              >
                {actionLoading === 'manual' ? 'Saving...' : `Save order${manualItems.length ? ` · £${manualItems.reduce((s,i) => s+i.unit_price*i.quantity,0).toFixed(2)}` : ''}`}
              </button>
            </div>
          </div>
        )}

      </main>

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 left-4 right-4 max-w-sm mx-auto rounded-xl px-4 py-3 text-sm font-bold text-center shadow-xl z-50 transition-all ${toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function OrderCard({
  order, truck, actionLoading, onAction, compact = false
}: {
  order: Order
  truck: TruckData | null
  actionLoading: string | null
  onAction: (action: string, orderId: string) => void
  compact?: boolean
}) {
  const [expanded, setExpanded] = useState(!compact)
  const statusCfg = STATUS[order.status as keyof typeof STATUS] || STATUS.pending
  const isPub = truck?.mode === 'pub'

  return (
    <div className={`bg-slate-800 rounded-2xl overflow-hidden border ${order.status === 'pending' ? 'border-orange-500/50' : 'border-slate-700'}`}>

      {/* Order header — always visible */}
      <button onClick={() => setExpanded(e => !e)} className="w-full text-left p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-black text-white">#{order.id}</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusCfg.bg} ${statusCfg.text}`}>
                {statusCfg.label}
              </span>
              {order.slot && (
                <span className="text-xs font-bold text-slate-300 bg-slate-700 px-2 py-0.5 rounded-full">
                  🕐 {order.slot}
                </span>
              )}
            </div>
            <p className="text-slate-300 font-bold text-sm mt-1">{order.customer_name}</p>
            {order.customer_phone && <p className="text-slate-500 text-xs">{order.customer_phone}</p>}
          </div>
          <div className="text-right shrink-0">
            <p className="font-black text-white">£{Number(order.total).toFixed(2)}</p>
            <p className="text-slate-500 text-xs mt-0.5">{expanded ? '▲' : '▼'}</p>
          </div>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-700 pt-3">

          {/* Items */}
          <div className="space-y-1 mb-3">
            {order.items.map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-slate-300">{item.quantity}× {item.name}</span>
                <span className="text-slate-400">£{(item.unit_price * item.quantity).toFixed(2)}</span>
              </div>
            ))}
            {order.deals?.map((deal, i) => (
              <div key={i} className="text-xs text-orange-400 mt-1">
                🎁 {deal.name}: {Object.values(deal.slots).filter(Boolean).join(', ')}
              </div>
            ))}
          </div>

          {order.notes && (
            <div className="bg-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 mb-3">
              📝 {order.notes}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap">
            {order.status === 'pending' && (
              <>
                <ActionBtn
                  label="✓ Confirm"
                  color="green"
                  loading={actionLoading === `confirm-${order.id}`}
                  onClick={() => onAction('confirm', order.id)}
                />
                <ActionBtn
                  label="✗ Reject"
                  color="red"
                  loading={actionLoading === `reject-${order.id}`}
                  onClick={() => onAction('reject', order.id)}
                />
              </>
            )}
            {order.status === 'confirmed' && isPub && (
              <ActionBtn
                label="🍕 Ready"
                color="blue"
                loading={actionLoading === `ready-${order.id}`}
                onClick={() => onAction('ready', order.id)}
              />
            )}
            {order.status === 'confirmed' && !isPub && (
              <ActionBtn
                label="✓ Collected"
                color="slate"
                loading={actionLoading === `collected-${order.id}`}
                onClick={() => onAction('collected', order.id)}
              />
            )}
            {order.status === 'ready' && (
              <ActionBtn
                label="✓ Collected"
                color="slate"
                loading={actionLoading === `collected-${order.id}`}
                onClick={() => onAction('collected', order.id)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ActionBtn({ label, color, loading, onClick }: {
  label: string; color: string; loading: boolean; onClick: () => void
}) {
  const colors: Record<string, string> = {
    green: 'bg-green-600 hover:bg-green-700',
    red:   'bg-red-600 hover:bg-red-700',
    blue:  'bg-blue-600 hover:bg-blue-700',
    slate: 'bg-slate-600 hover:bg-slate-500',
  }
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`${colors[color] || colors.slate} text-white font-bold text-sm px-4 py-2 rounded-xl transition-colors active:scale-95 disabled:opacity-50 flex-1 min-w-[80px]`}
    >
      {loading ? '...' : label}
    </button>
  )
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  const colors: Record<string, string> = {
    orange: 'text-orange-400',
    green:  'text-green-400',
    slate:  'text-slate-400',
  }
  return (
    <div className="bg-slate-800 rounded-xl p-3 text-center border border-slate-700">
      <p className={`text-2xl font-black ${colors[accent] || colors.slate}`}>{value}</p>
      <p className="text-slate-500 text-xs font-medium mt-0.5">{label}</p>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">{children}</p>
}

function ManualField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-400 mb-1 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}