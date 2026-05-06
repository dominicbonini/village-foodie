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
  deals: { name: string; slots: Record<string, string> }[] | null
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

interface BasketItem {
  name: string
  quantity: number
  unit_price: number
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS: Record<string, { label: string; bg: string; text: string }> = {
  pending:   { label: 'New',       bg: 'bg-orange-100', text: 'text-orange-700' },
  confirmed: { label: 'Confirmed', bg: 'bg-green-100',  text: 'text-green-700'  },
  rejected:  { label: 'Rejected',  bg: 'bg-red-100',    text: 'text-red-600'    },
  ready:     { label: 'Ready',     bg: 'bg-blue-100',   text: 'text-blue-700'   },
  collected: { label: 'Collected', bg: 'bg-slate-100',  text: 'text-slate-500'  },
  modified:  { label: 'Modified',  bg: 'bg-yellow-100', text: 'text-yellow-700' },
}

// ─── ASAP helper ──────────────────────────────────────────────────────────────

function getAsapSlot(slots: Slot[]): Slot | null {
  if (!slots.length) return null
  const now = new Date()
  const nowMins = now.getHours() * 60 + now.getMinutes()
  return slots.find(s => {
    const [h, m] = s.collection_time.split(':').map(Number)
    return (h * 60 + m) > nowMins && s.available
  }) || null
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DashboardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)

  // Auth
  const [pin, setPin] = useState('')
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [requiresPin, setRequiresPin] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)

  // Data
  const [truck, setTruck] = useState<TruckData | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [slots, setSlots] = useState<Slot[]>([])
  const [truckMenu, setTruckMenu] = useState<TruckMenu | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState(new Date())

  // UI
  const [activeTab, setActiveTab] = useState<'orders' | 'manual'>('orders')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Manual order form
  const [manualName, setManualName] = useState('')
  const [manualEmail, setManualEmail] = useState('')
  const [manualNotes, setManualNotes] = useState('')
  const [manualSlot, setManualSlot] = useState('')
  const [manualItems, setManualItems] = useState<BasketItem[]>([])

  const asapSlot = getAsapSlot(slots)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ── Fetch data ──────────────────────────────────────────────────────────────

  const fetchOrders = useCallback(async (currentPin = pin) => {
    try {
      const p = new URLSearchParams({ token })
      if (currentPin) p.set('pin', currentPin)
      const res = await fetch(`/api/dashboard?${p}`)
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

      // Load menu for manual order
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
  }, [token, pin, truckMenu])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  // Auto-refresh every 30s
  useEffect(() => {
    if (!authenticated) return
    const id = setInterval(() => fetchOrders(), 30000)
    return () => clearInterval(id)
  }, [authenticated, fetchOrders])

  // ── PIN ─────────────────────────────────────────────────────────────────────

  const submitPin = async () => {
    const p = new URLSearchParams({ token, pin: pinInput })
    const res = await fetch(`/api/dashboard?${p}`)
    const data = await res.json()
    if (!res.ok) { setPinError('Incorrect PIN'); return }
    setPin(pinInput)
    setTruck(data.truck)
    setOrders(data.orders)
    setSlots(data.slots)
    setAuthenticated(true)
    setRequiresPin(false)
    if (data.truck?.id) {
      fetch(`/api/menu/${data.truck.id}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.menu) setTruckMenu(d.menu) })
        .catch(() => null)
    }
  }

  // ── Order actions ───────────────────────────────────────────────────────────

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
      const labels: Record<string, string> = { confirm: 'confirmed', reject: 'rejected', ready: 'ready', collected: 'collected' }
      showToast(`Order #${orderId} ${labels[action] || action}`)
      await fetchOrders()
    } catch (err: any) {
      showToast(err.message || 'Action failed', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  // ── Manual order ────────────────────────────────────────────────────────────

  const addMenuItem = (item: MenuItem) => {
    setManualItems(prev => {
      const ex = prev.find(i => i.name === item.name)
      return ex
        ? prev.map(i => i.name === item.name ? { ...i, quantity: i.quantity + 1 } : i)
        : [...prev, { name: item.name, quantity: 1, unit_price: item.price }]
    })
  }

  const adjustQty = (name: string, delta: number) => {
    setManualItems(prev => {
      const updated = prev.map(i => i.name === name ? { ...i, quantity: i.quantity + delta } : i)
      return updated.filter(i => i.quantity > 0)
    })
  }

  const editPrice = (name: string, price: number) => {
    setManualItems(prev => prev.map(i => i.name === name ? { ...i, unit_price: price } : i))
  }

  const manualTotal = manualItems.reduce((s, i) => s + i.unit_price * i.quantity, 0)

  const submitManual = async () => {
    if (!manualName.trim() || !manualItems.length) return
    const effectiveSlot = manualSlot || asapSlot?.collection_time || null
    setActionLoading('manual')
    try {
      const res = await fetch('/api/dashboard/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token, pin, action: 'manual',
          manualOrder: {
            customerName:  manualName,
            customerPhone: null,
            customerEmail: manualEmail || null,
            slot:          effectiveSlot,
            items:         manualItems,
            notes:         manualNotes || null,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showToast(data.slotFull
        ? `Order #${data.orderId} saved — slot full, pending confirmation`
        : `Order #${data.orderId} saved and confirmed`)
      setManualName(''); setManualEmail(''); setManualNotes(''); setManualSlot(''); setManualItems([])
      setActiveTab('orders')
      await fetchOrders()
    } catch (err: any) {
      showToast(err.message || 'Failed to save order', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  // ── Render guards ───────────────────────────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <p className="text-slate-400 animate-pulse font-medium">Loading dashboard...</p>
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-slate-900 font-bold text-lg mb-2">Access denied</p>
        <p className="text-slate-500 text-sm">{error}</p>
        <Link href="/" className="mt-4 inline-block text-orange-600 text-sm hover:underline">← Village Foodie</Link>
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
          type="number" maxLength={4} value={pinInput}
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

  const pendingOrders   = orders.filter(o => o.status === 'pending')
  const confirmedOrders = orders.filter(o => o.status === 'confirmed')
  const otherOrders     = orders.filter(o => !['pending', 'confirmed'].includes(o.status))

  // Group menu by category
  const menuGroups: Record<string, MenuItem[]> = {}
  truckMenu?.items.forEach(item => {
    if (!menuGroups[item.category]) menuGroups[item.category] = []
    menuGroups[item.category].push(item)
  })

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-50 shadow-sm">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Image src="/logos/village-foodie-logo-v2.png" alt="Village Foodie" width={100} height={30} className="object-contain opacity-80" />
            </Link>
            <div className="h-5 w-px bg-slate-200" />
            <div>
              <p className="font-black text-sm text-slate-900 leading-none">{truck?.name}</p>
              {truck?.venue_name && <p className="text-slate-500 text-xs mt-0.5">{truck.venue_name}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {pendingOrders.length > 0 && (
              <span className="bg-orange-500 text-white text-xs font-black px-2 py-0.5 rounded-full animate-pulse">
                {pendingOrders.length} new
              </span>
            )}
            <button onClick={() => fetchOrders()} className="text-slate-400 hover:text-slate-700 text-xs font-medium">
              ↻
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200 px-4">
        <div className="max-w-2xl mx-auto flex">
          {(['orders', 'manual'] as const).map((tab, i) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === tab ? 'border-orange-500 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-700'}`}>
              {tab === 'orders'
                ? `Live orders${orders.filter(o => ['pending','confirmed'].includes(o.status)).length > 0 ? ` (${orders.filter(o => ['pending','confirmed'].includes(o.status)).length})` : ''}`
                : '+ Add order'}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-4 pb-20">

        {/* ── ORDERS TAB ── */}
        {activeTab === 'orders' && (
          <div>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: 'New', value: pendingOrders.length, colour: 'text-orange-500' },
                { label: 'Confirmed', value: confirmedOrders.length, colour: 'text-green-600' },
                { label: 'Done', value: otherOrders.length, colour: 'text-slate-400' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-xl p-3 text-center border border-slate-200 shadow-sm">
                  <p className={`text-2xl font-black ${s.colour}`}>{s.value}</p>
                  <p className="text-slate-500 text-xs font-medium mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* New orders */}
            {pendingOrders.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">New — action needed</p>
                <div className="space-y-3">
                  {pendingOrders.map(o => <OrderCard key={o.id} order={o} truck={truck} actionLoading={actionLoading} onAction={doAction} />)}
                </div>
              </div>
            )}

            {/* Confirmed */}
            {confirmedOrders.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Confirmed</p>
                <div className="space-y-3">
                  {confirmedOrders.map(o => <OrderCard key={o.id} order={o} truck={truck} actionLoading={actionLoading} onAction={doAction} />)}
                </div>
              </div>
            )}

            {/* Earlier */}
            {otherOrders.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Earlier today</p>
                <div className="space-y-2">
                  {otherOrders.map(o => <OrderCard key={o.id} order={o} truck={truck} actionLoading={actionLoading} onAction={doAction} compact />)}
                </div>
              </div>
            )}

            {orders.length === 0 && (
              <div className="text-center py-16">
                <p className="text-4xl mb-3">🍕</p>
                <p className="text-slate-500 font-medium">No orders yet today</p>
                <p className="text-slate-400 text-sm mt-1">Orders appear here automatically</p>
                <p className="text-slate-300 text-xs mt-3">Updated {lastRefresh.toLocaleTimeString()}</p>
              </div>
            )}
          </div>
        )}

        {/* ── MANUAL ORDER TAB ── */}
        {activeTab === 'manual' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-5">

            {/* STEP 1 — Items */}
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-3">1. What would you like?</p>
              {truckMenu ? (
                <div className="space-y-3">
                  {Object.entries(menuGroups).map(([cat, items]) => (
                    <div key={cat}>
                      <p className="text-xs font-black text-orange-600 uppercase tracking-wide mb-1.5">
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {items.map(item => {
                          const inBasket = manualItems.find(i => i.name === item.name)
                          return (
                            <button key={item.name} onClick={() => addMenuItem(item)}
                              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-bold transition-all active:scale-95 ${
                                inBasket ? 'bg-orange-600 border-orange-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-orange-300'
                              }`}>
                              {inBasket && <span className={inBasket ? 'text-orange-200' : ''}>{inBasket.quantity}×</span>}
                              <span>{item.name}</span>
                              <span className={inBasket ? 'text-orange-200' : 'text-slate-400'}>£{item.price.toFixed(2)}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}

                  {/* Basket */}
                  {manualItems.length > 0 && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                      <p className="text-xs font-black text-slate-500 uppercase tracking-wide">Order</p>
                      {manualItems.map(item => (
                        <div key={item.name} className="flex items-center gap-2">
                          <span className="text-slate-900 text-sm font-bold flex-1 min-w-0 truncate">{item.name}</span>
                          <div className="flex items-center gap-1">
                            <button onClick={() => adjustQty(item.name, -1)}
                              className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold hover:bg-red-100 hover:text-red-600 transition-colors text-sm">−</button>
                            <span className="w-4 text-center font-black text-slate-900 text-sm">{item.quantity}</span>
                            <button onClick={() => adjustQty(item.name, 1)}
                              className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold hover:bg-orange-100 hover:text-orange-600 transition-colors text-sm">+</button>
                          </div>
                          <InlinePriceEditor price={item.unit_price} quantity={item.quantity} onChange={p => editPrice(item.name, p)} />
                        </div>
                      ))}
                      <div className="flex justify-between pt-2 border-t border-slate-200">
                        <span className="text-slate-600 text-sm font-bold">Total</span>
                        <span className="text-slate-900 font-black">£{manualTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-slate-400 text-sm animate-pulse">Loading menu...</p>
              )}
            </div>

            {/* STEP 2 — Collection time */}
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-2">2. When to collect?</p>

              {/* ASAP info */}
              <div className={`rounded-xl px-3 py-2.5 mb-2 ${asapSlot ? 'bg-green-50 border border-green-200' : 'bg-slate-100 border border-slate-200'}`}>
                {asapSlot ? (
                  <>
                    <p className="text-green-700 font-black text-sm">⚡ ASAP — ready at approximately {asapSlot.collection_time}</p>
                    <p className="text-green-600 text-xs mt-0.5">{asapSlot.max_orders - asapSlot.current_orders} slot{asapSlot.max_orders - asapSlot.current_orders !== 1 ? 's' : ''} available</p>
                  </>
                ) : (
                  <p className="text-slate-500 text-sm">No slots configured — walk-up only</p>
                )}
              </div>

              {/* Single dropdown — always visible, ASAP = blank selection */}
              {slots.length > 0 && (
                <>
                  <p className="text-xs text-slate-400 mb-1">Or choose a specific time:</p>
                  <select value={manualSlot} onChange={e => setManualSlot(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
                    <option value="">ASAP ({asapSlot?.collection_time || 'next available'})</option>
                    {slots.map(s => {
                      const pct = s.max_orders > 0 ? s.current_orders / s.max_orders : 0
                      const ind = pct >= 1 ? '🔴' : pct >= 0.7 ? '🟡' : '🟢'
                      const rem = s.max_orders - s.current_orders
                      return (
                        <option key={s.collection_time} value={s.collection_time} disabled={!s.available}>
                          {s.collection_time} {ind} {s.available ? `${rem} left` : 'Full'}
                        </option>
                      )
                    })}
                  </select>
                </>
              )}
            </div>

            {/* STEP 3 — Name */}
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-1">3. Customer name *</p>
              <input type="text" value={manualName} onChange={e => setManualName(e.target.value)}
                placeholder="e.g. Sarah"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" />
            </div>

            {/* STEP 4 — Email (optional) */}
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-1">
                4. Email <span className="font-normal normal-case text-slate-400">— optional, for ready notification</span>
              </p>
              <input type="email" value={manualEmail} onChange={e => setManualEmail(e.target.value)}
                placeholder="customer@email.com"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" />
            </div>

            {/* STEP 5 — Notes */}
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-1">
                5. Notes <span className="font-normal normal-case text-slate-400">— optional</span>
              </p>
              <textarea value={manualNotes} onChange={e => setManualNotes(e.target.value)}
                placeholder="Allergies, no onion…" rows={2}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white resize-none" />
            </div>

            <button onClick={submitManual}
              disabled={actionLoading === 'manual' || !manualName.trim() || manualItems.length === 0}
              className="w-full bg-orange-600 text-white font-black py-3.5 rounded-xl hover:bg-orange-700 transition-colors active:scale-[0.98] disabled:opacity-40">
              {actionLoading === 'manual'
                ? 'Saving...'
                : `Save order${manualItems.length ? ` · £${manualTotal.toFixed(2)}` : ''}`}
            </button>
          </div>
        )}

      </main>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-4 right-4 max-w-sm mx-auto rounded-xl px-4 py-3 text-sm font-bold text-center shadow-xl z-50 ${toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ─── Order card ───────────────────────────────────────────────────────────────

function OrderCard({ order, truck, actionLoading, onAction, compact = false }: {
  order: Order
  truck: TruckData | null
  actionLoading: string | null
  onAction: (action: string, orderId: string) => void
  compact?: boolean
}) {
  const [expanded, setExpanded] = useState(!compact)
  const s = STATUS[order.status] || STATUS.pending
  const isPub = truck?.mode === 'pub'

  return (
    <div className={`bg-white rounded-2xl overflow-hidden border shadow-sm ${order.status === 'pending' ? 'border-orange-400' : 'border-slate-200'}`}>
      <button onClick={() => setExpanded(e => !e)} className="w-full text-left p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-black text-slate-900">#{order.id}</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>{s.label}</span>
              {order.slot && <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">🕐 {order.slot}</span>}
            </div>
            <p className="text-slate-700 font-bold text-sm mt-1">{order.customer_name}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-black text-slate-900">£{Number(order.total).toFixed(2)}</p>
            <p className="text-slate-400 text-xs">{expanded ? '▲' : '▼'}</p>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-3 bg-slate-50">
          <div className="space-y-1 mb-3">
            {order.items.map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-slate-700">{item.quantity}× {item.name}</span>
                <span className="text-slate-500">£{(item.unit_price * item.quantity).toFixed(2)}</span>
              </div>
            ))}
            {order.deals?.map((d, i) => (
              <p key={i} className="text-xs text-orange-600">🎁 {d.name}: {Object.values(d.slots).filter(Boolean).join(', ')}</p>
            ))}
          </div>
          {order.notes && (
            <div className="bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 text-xs text-orange-700 mb-3">📝 {order.notes}</div>
          )}
          <div className="flex gap-2 flex-wrap">
            {order.status === 'pending' && (
              <>
                <Btn label="✓ Confirm" colour="green" loading={actionLoading === `confirm-${order.id}`} onClick={() => onAction('confirm', order.id)} />
                <Btn label="✗ Reject"  colour="red"   loading={actionLoading === `reject-${order.id}`}  onClick={() => onAction('reject',  order.id)} />
              </>
            )}
            {order.status === 'confirmed' && isPub && (
              <Btn label="🍕 Ready" colour="blue" loading={actionLoading === `ready-${order.id}`} onClick={() => onAction('ready', order.id)} />
            )}
            {order.status === 'confirmed' && !isPub && (
              <Btn label="✓ Collected" colour="slate" loading={actionLoading === `collected-${order.id}`} onClick={() => onAction('collected', order.id)} />
            )}
            {order.status === 'ready' && (
              <Btn label="✓ Collected" colour="slate" loading={actionLoading === `collected-${order.id}`} onClick={() => onAction('collected', order.id)} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Inline price editor ──────────────────────────────────────────────────────

function InlinePriceEditor({ price, quantity, onChange }: {
  price: number; quantity: number; onChange: (p: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(price.toFixed(2))

  if (editing) {
    return (
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-slate-400 text-xs">£</span>
        <input
          type="number" value={val} step="0.50" min="0" autoFocus
          onChange={e => setVal(e.target.value)}
          onBlur={() => { onChange(parseFloat(val) || 0); setEditing(false) }}
          onKeyDown={e => { if (e.key === 'Enter') { onChange(parseFloat(val) || 0); setEditing(false) } }}
          className="w-14 border border-orange-400 rounded-lg px-1.5 py-0.5 text-xs font-bold text-slate-900 focus:outline-none text-center"
        />
      </div>
    )
  }
  return (
    <button onClick={() => { setVal(price.toFixed(2)); setEditing(true) }}
      className="text-right shrink-0 min-w-[56px]" title="Tap to edit price">
      <span className="text-slate-700 font-bold text-sm">£{(price * quantity).toFixed(2)}</span>
      <span className="text-slate-400 text-[10px] block leading-none">edit</span>
    </button>
  )
}

// ─── Action button ────────────────────────────────────────────────────────────

function Btn({ label, colour, loading, onClick }: {
  label: string; colour: string; loading: boolean; onClick: () => void
}) {
  const colours: Record<string, string> = {
    green: 'bg-green-600 hover:bg-green-700',
    red:   'bg-red-500 hover:bg-red-600',
    blue:  'bg-blue-600 hover:bg-blue-700',
    slate: 'bg-slate-500 hover:bg-slate-600',
  }
  return (
    <button onClick={onClick} disabled={loading}
      className={`${colours[colour] || colours.slate} text-white font-bold text-sm px-4 py-2 rounded-xl transition-colors active:scale-95 disabled:opacity-50 flex-1 min-w-[80px]`}>
      {loading ? '...' : label}
    </button>
  )
}
