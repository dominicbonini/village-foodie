'use client';

import { useState, useEffect, useCallback, useRef, use } from 'react';
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
  logo: string | null
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

interface CategoryStock {
  category: string
  stock_count: number | null
  orders_count: number
}

interface ItemStock {
  name: string
  available: boolean
  stock_count: number | null
  orders_count: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS: Record<string, { label: string; bg: string; text: string }> = {
  pending:   { label: 'New',       bg: 'bg-orange-100', text: 'text-orange-700' },
  confirmed: { label: 'Confirmed', bg: 'bg-green-100',  text: 'text-green-700'  },
  rejected:  { label: 'Rejected',  bg: 'bg-red-100',    text: 'text-red-600'    },
  ready:     { label: 'Ready',     bg: 'bg-blue-100',   text: 'text-blue-700'   },
  collected: { label: 'Collected', bg: 'bg-slate-100',  text: 'text-slate-500'  },
  modified:  { label: 'Modified',  bg: 'bg-yellow-100', text: 'text-yellow-700' },
}

function getAsapSlot(slots: Slot[]): Slot | null {
  const now = new Date()
  const nowMins = now.getHours() * 60 + now.getMinutes()
  return slots.find(s => {
    const [h, m] = s.collection_time.split(':').map(Number)
    return (h * 60 + m) > nowMins && s.available
  }) || null
}

function calcReadyTime(items: BasketItem[], waitMinutes: number): string {
  const total = items.reduce((s, i) => s + i.quantity, 0)
  if (!total) return ''
  const mins = Math.ceil(total * 3) + waitMinutes
  const t = new Date()
  t.setMinutes(t.getMinutes() + mins)
  return `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`
}

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
  const [truckMenu, setTruckMenu] = useState<TruckMenu | null>(null)
  const [itemStocks, setItemStocks] = useState<ItemStock[]>([])
  const [categoryStocks, setCategoryStocks] = useState<CategoryStock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState(new Date())

  const [activeTab, setActiveTab] = useState<'orders' | 'add' | 'stock'>('orders')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Live orders controls
  const [paused, setPaused] = useState(false)
  const [waitMinutes, setWaitMinutes] = useState(0)

  // Add order form
  const [manualName, setManualName] = useState('')
  const [manualEmail, setManualEmail] = useState('')
  const [manualNotes, setManualNotes] = useState('')
  const [manualSlot, setManualSlot] = useState('')
  const [manualItems, setManualItems] = useState<BasketItem[]>([])

  // Edit order modal
  const [editingOrder, setEditingOrder] = useState<Order | null>(null)
  const [editItems, setEditItems] = useState<BasketItem[]>([])
  const [editSlot, setEditSlot] = useState('')
  const [editNotes, setEditNotes] = useState('')

  const asapSlot = getAsapSlot(slots)
  const prevPendingCount = useRef(0)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  // ── Fetch ───────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async (currentPin = pin) => {
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

      // Fetch menu + logo
      if (data.truck?.id) {
        fetch(`/api/menu/${data.truck.id}`)
          .then(r => r.ok ? r.json() : null)
          .then(d => {
            if (d) {
              if (d.truck?.logo) setTruck(prev => prev ? { ...prev, logo: d.truck.logo } : prev)
              if (d.menu) setTruckMenu(d.menu)
            }
          }).catch(() => null)

        // Fetch stock/availability data
        fetch('/api/dashboard/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, pin: currentPin, action: 'get_stock' })
        }).then(r => r.json()).then(d => {
          if (d.stocks) setItemStocks(d.stocks)
          if (d.categoryStocks) setCategoryStocks(d.categoryStocks)
        }).catch(() => null)
      }
    } catch { setError('Connection error') }
    finally { setLoading(false) }
  }, [token, pin])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    if (!authenticated) return
    const id = setInterval(() => fetchAll(), 30000)
    return () => clearInterval(id)
  }, [authenticated, fetchAll])

  // WakeLock
  useEffect(() => {
    if (!authenticated) return
    let lock: any = null
    const acquire = async () => {
      try { if ('wakeLock' in navigator) lock = await (navigator as any).wakeLock.request('screen') }
      catch {}
    }
    acquire()
    return () => { lock?.release().catch(() => null) }
  }, [authenticated])

  // Audio alert for new orders
  useEffect(() => {
    const count = orders.filter(o => o.status === 'pending').length
    if (count > prevPendingCount.current && authenticated) {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
        const osc = ctx.createOscillator(); const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.frequency.value = 880
        gain.gain.setValueAtTime(0.3, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.6)
      } catch {}
    }
    prevPendingCount.current = count
  }, [orders, authenticated])

  // ── PIN ─────────────────────────────────────────────────────────────────────

  const submitPin = async () => {
    const p = new URLSearchParams({ token, pin: pinInput })
    const res = await fetch(`/api/dashboard?${p}`)
    const data = await res.json()
    if (!res.ok) { setPinError('Incorrect PIN'); return }
    setPin(pinInput)
    setTruck(data.truck); setOrders(data.orders); setSlots(data.slots)
    setAuthenticated(true); setRequiresPin(false)
    if (data.truck?.id) {
      fetch(`/api/menu/${data.truck.id}`).then(r=>r.ok?r.json():null)
        .then(d => {
          if (d?.truck?.logo) setTruck(prev => prev ? {...prev, logo: d.truck.logo} : prev)
          if (d?.menu) setTruckMenu(d.menu)
        }).catch(()=>null)
    }
  }

  // ── Order actions ────────────────────────────────────────────────────────────

  const doAction = async (action: string, orderId: string) => {
    setActionLoading(`${action}-${orderId}`)
    try {
      const res = await fetch('/api/dashboard/action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, pin, action, orderId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const labels: Record<string,string> = { confirm:'confirmed', reject:'rejected', ready:'ready', collected:'collected', undo_collected:'restored' }
      showToast(`Order #${orderId} ${labels[action] || action}`)
      await fetchAll()
    } catch (err: any) { showToast(err.message || 'Failed', 'error') }
    finally { setActionLoading(null) }
  }

  // ── Edit order ───────────────────────────────────────────────────────────────

  const startEdit = (order: Order) => {
    setEditingOrder(order)
    setEditItems(order.items.map(i => ({...i})))
    setEditSlot(order.slot || '')
    setEditNotes(order.notes || '')
  }

  const addEditItem = (item: MenuItem) => {
    setEditItems(prev => {
      const ex = prev.find(i => i.name === item.name)
      return ex ? prev.map(i => i.name === item.name ? {...i, quantity: i.quantity+1} : i)
        : [...prev, { name: item.name, quantity: 1, unit_price: item.price }]
    })
  }

  const submitEdit = async () => {
    if (!editingOrder) return
    setActionLoading(`edit-${editingOrder.id}`)
    try {
      const res = await fetch('/api/dashboard/action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token, pin, action: 'edit', orderId: editingOrder.id,
          editedOrder: { items: editItems.filter(i=>i.quantity>0), slot: editSlot||null, notes: editNotes||null }
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showToast(`Order #${editingOrder.id} updated`)
      setEditingOrder(null)
      await fetchAll()
    } catch (err: any) { showToast(err.message||'Edit failed','error') }
    finally { setActionLoading(null) }
  }

  // ── Manual order ─────────────────────────────────────────────────────────────

  const addMenuItem = (item: MenuItem) => {
    setManualItems(prev => {
      const ex = prev.find(i => i.name === item.name)
      return ex ? prev.map(i => i.name===item.name ? {...i, quantity:i.quantity+1} : i)
        : [...prev, { name: item.name, quantity: 1, unit_price: item.price }]
    })
  }

  const adjustManualQty = (name: string, delta: number) => {
    setManualItems(prev =>
      prev.map(i => i.name===name ? {...i, quantity:i.quantity+delta} : i).filter(i=>i.quantity>0)
    )
  }

  const manualTotal = manualItems.reduce((s,i) => s+i.unit_price*i.quantity, 0)

  const submitManual = async () => {
    if (!manualName.trim() || !manualItems.length) return
    const effectiveSlot = manualSlot || asapSlot?.collection_time || null
    setActionLoading('manual')
    try {
      const res = await fetch('/api/dashboard/action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token, pin, action: 'manual',
          manualOrder: {
            customerName: manualName, customerPhone: null,
            customerEmail: manualEmail||null, slot: effectiveSlot,
            items: manualItems, notes: manualNotes||null,
          },
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showToast(data.slotFull
        ? `Order #${data.orderId} saved — slot full, pending confirmation`
        : `Order #${data.orderId} confirmed`)
      setManualName(''); setManualEmail(''); setManualNotes(''); setManualSlot(''); setManualItems([])
      setActiveTab('orders')
      await fetchAll()
    } catch (err: any) { showToast(err.message||'Failed','error') }
    finally { setActionLoading(null) }
  }

  // ── Stock management ──────────────────────────────────────────────────────────

  const updateStock = async (itemName: string, available: boolean, stockCount: number | null, category?: string) => {
    await fetch('/api/dashboard/action', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, pin, action: 'set_stock', itemName, available, stockCount, category })
    })
    setItemStocks(prev => {
      const ex = prev.find(s => s.name === itemName)
      if (ex) return prev.map(s => s.name===itemName ? {...s, available, stock_count:stockCount} : s)
      return [...prev, { name: itemName, available, stock_count: stockCount, orders_count: 0, category: category||null }]
    })
  }

  const updateCategoryStock = async (category: string, stockCount: number | null) => {
    await fetch('/api/dashboard/action', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, pin, action: 'set_category_stock', category, stockCount })
    })
    setCategoryStocks(prev => {
      const ex = prev.find(s => s.category === category)
      if (ex) return prev.map(s => s.category===category ? {...s, stock_count:stockCount} : s)
      return [...prev, { category, stock_count: stockCount, orders_count: 0 }]
    })
  }

  // ── Render guards ─────────────────────────────────────────────────────────────

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
        <input type="number" maxLength={4} value={pinInput}
          onChange={e => setPinInput(e.target.value.slice(0,4))}
          onKeyDown={e => e.key==='Enter' && submitPin()}
          placeholder="• • • •"
          className="w-full text-center text-2xl font-black tracking-widest bg-slate-700 text-white rounded-xl px-4 py-3 mb-3 focus:outline-none focus:ring-2 focus:ring-orange-500 border border-slate-600"
        />
        {pinError && <p className="text-red-400 text-sm mb-3">{pinError}</p>}
        <button onClick={submitPin} className="w-full bg-orange-600 text-white font-black py-3 rounded-xl hover:bg-orange-700">Unlock</button>
      </div>
    </div>
  )

  const pendingOrders   = orders.filter(o => o.status === 'pending')
  const confirmedOrders = orders.filter(o => o.status === 'confirmed')
  const otherOrders     = orders.filter(o => !['pending','confirmed'].includes(o.status))

  const menuGroups: Record<string, MenuItem[]> = {}
  truckMenu?.items.forEach(item => {
    if (!menuGroups[item.category]) menuGroups[item.category] = []
    menuGroups[item.category].push(item)
  })

  const editTotal = editItems.reduce((s,i) => s+i.unit_price*i.quantity, 0)
  const originalTotal = editingOrder?.total || 0
  const priceDiff = editTotal - originalTotal

  const readyTime = calcReadyTime(manualItems, waitMinutes)

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Header — dark slate */}
      <header className="bg-slate-900 px-4 py-3 sticky top-0 z-50 shadow-md">
        <div className="max-w-2xl mx-auto flex items-center justify-between relative">
          <Link href="/" className="shrink-0 z-10">
            <Image src="/logos/village-foodie-logo-v2.png" alt="Village Foodie" width={90} height={27} className="object-contain opacity-70" />
          </Link>

          {/* Centred truck identity — logo only shown once loaded, no emoji fallback */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex items-center gap-2">
              {truck?.logo && (
                <img src={truck.logo} alt={truck?.name||''} className="w-7 h-7 rounded-full object-cover bg-white shadow-sm shrink-0" />
              )}
              <div>
                <p className="font-black text-sm text-white leading-none">{truck?.name}</p>
                {truck?.venue_name && <p className="text-slate-400 text-[11px] mt-0.5">{truck.venue_name}</p>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 z-10">
            {pendingOrders.length > 0 && (
              <span className="bg-orange-500 text-white text-xs font-black px-2 py-0.5 rounded-full animate-pulse">{pendingOrders.length}</span>
            )}
            <button onClick={() => fetchAll()} className="text-slate-400 hover:text-white text-sm">↻</button>
          </div>
        </div>
      </header>

      {/* Tabs — dark */}
      <div className="bg-slate-800 px-4 border-b border-slate-700">
        <div className="max-w-2xl mx-auto flex">
          {([
            ['orders', `Orders${orders.filter(o=>['pending','confirmed'].includes(o.status)).length > 0 ? ` (${orders.filter(o=>['pending','confirmed'].includes(o.status)).length})` : ''}`],
            ['add', '+ Add order'],
            ['stock', 'Menu & Stock'],
          ] as [typeof activeTab, string][]).map(([tab, label]) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab===tab ? 'border-orange-500 text-white' : 'border-transparent text-slate-400 hover:text-white'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-4 pb-20">

        {/* ── ORDERS TAB ── */}
        {activeTab === 'orders' && (
          <div>
            {/* Pause + wait controls */}
            <div className="flex gap-2 mb-3">
              <button onClick={() => setPaused(p=>!p)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-black border transition-all ${paused ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-700 border-slate-200 hover:border-red-300'}`}>
                {paused ? '▶ Resume' : '⏸ Pause orders'}
              </button>
              <select value={waitMinutes} onChange={e => setWaitMinutes(parseInt(e.target.value))}
                className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
                <option value={0}>No extra wait</option>
                <option value={10}>+10 min</option>
                <option value={20}>+20 min</option>
                <option value={30}>+30 min</option>
                <option value={45}>+45 min</option>
              </select>
            </div>

            {paused && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-3 text-center">
                <p className="text-red-700 font-black text-sm">⏸ Orders paused</p>
                <p className="text-red-500 text-xs mt-0.5">Customers see "Too busy — please order at the truck"</p>
              </div>
            )}
            {waitMinutes > 0 && !paused && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 mb-3 text-center">
                <p className="text-orange-700 font-black text-sm">⏱ +{waitMinutes} min extra wait active</p>
              </div>
            )}

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

            {pendingOrders.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">New — action needed</p>
                <div className="space-y-3">
                  {pendingOrders.map(o => <OrderCard key={o.id} order={o} truck={truck} slots={slots} actionLoading={actionLoading} onAction={doAction} onEdit={startEdit} />)}
                </div>
              </div>
            )}

            {confirmedOrders.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Confirmed</p>
                <div className="space-y-3">
                  {confirmedOrders.map(o => <OrderCard key={o.id} order={o} truck={truck} slots={slots} actionLoading={actionLoading} onAction={doAction} onEdit={startEdit} />)}
                </div>
              </div>
            )}

            {otherOrders.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Earlier today</p>
                <div className="space-y-2">
                  {otherOrders.map(o => <OrderCard key={o.id} order={o} truck={truck} slots={slots} actionLoading={actionLoading} onAction={doAction} onEdit={startEdit} compact />)}
                </div>
              </div>
            )}

            {orders.length === 0 && (
              <div className="text-center py-16">
                <p className="text-4xl mb-3">🍕</p>
                <p className="text-slate-500 font-medium">No orders yet today</p>
                <p className="text-slate-300 text-xs mt-3">Updated {lastRefresh.toLocaleTimeString()}</p>
              </div>
            )}
          </div>
        )}

        {/* ── ADD ORDER TAB ── */}
        {activeTab === 'add' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-5">

            {/* STEP 1 — Items */}
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-3">1. What would you like?</p>
              {truckMenu ? (
                <div className="space-y-3">
                  {Object.entries(menuGroups).map(([cat, items]) => (
                    <div key={cat}>
                      <p className="text-xs font-black text-orange-600 uppercase tracking-wide mb-1.5">
                        {cat.charAt(0).toUpperCase()+cat.slice(1)}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {items.map(item => {
                          const inBasket = manualItems.find(i => i.name===item.name)
                          const stock = itemStocks.find(s => s.name===item.name)
                          const isSoldOut = stock ? !stock.available : false
                          // Effective remaining — min of item stock and category stock
                          const itemRem = stock?.stock_count != null ? stock.stock_count - (stock.orders_count||0) : null
                          const catSt = categoryStocks.find(s => s.category === cat)
                          const catRem = catSt?.stock_count != null ? catSt.stock_count - (catSt.orders_count||0) : null
                          const effectiveRem = itemRem !== null ? (catRem !== null ? Math.min(itemRem, catRem) : itemRem) : catRem
                          const isLow = !isSoldOut && effectiveRem !== null && effectiveRem <= 10

                          if (isSoldOut) return (
                            // Sold out stays visible — strikethrough, not tappable
                            <div key={item.name} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-100 bg-slate-50 cursor-not-allowed">
                              <span className="text-xs text-slate-400 line-through">{item.name}</span>
                              <span className="text-[10px] text-red-400 font-bold">sold out</span>
                            </div>
                          )
                          return (
                            <button key={item.name} onClick={() => addMenuItem(item)}
                              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-bold transition-all active:scale-95 ${
                                inBasket ? 'bg-orange-600 border-orange-600 text-white'
                                : isLow ? 'bg-orange-50 border-orange-200 text-slate-700 hover:border-orange-400'
                                : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-orange-300'
                              }`}>
                              {inBasket && <span className="text-orange-200">{inBasket.quantity}×</span>}
                              <span>{item.name}</span>
                              <span className={inBasket ? 'text-orange-200' : 'text-slate-400'}>£{item.price.toFixed(2)}</span>
                              {isLow && !inBasket && (
                                <span className="text-[10px] text-orange-500 font-black ml-0.5">({effectiveRem} left)</span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}

                  {manualItems.length > 0 && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                      <p className="text-xs font-black text-slate-500 uppercase tracking-wide">Order</p>
                      {manualItems.map(item => (
                        <div key={item.name} className="flex items-center gap-2">
                          <span className="flex-1 text-sm font-bold text-slate-900 truncate">{item.name}</span>
                          <div className="flex items-center gap-1">
                            <button onClick={() => adjustManualQty(item.name,-1)} className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-sm font-bold hover:bg-red-100 hover:text-red-600">−</button>
                            <span className="w-4 text-center font-black text-sm">{item.quantity}</span>
                            <button onClick={() => adjustManualQty(item.name,1)} className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-sm font-bold hover:bg-orange-100 hover:text-orange-600">+</button>
                          </div>
                          <InlinePriceEditor price={item.unit_price} quantity={item.quantity} onChange={p => setManualItems(prev=>prev.map(i=>i.name===item.name?{...i,unit_price:p}:i))} />
                        </div>
                      ))}
                      <div className="flex justify-between pt-2 border-t border-slate-200">
                        <span className="text-slate-600 text-sm font-bold">Total</span>
                        <span className="text-slate-900 font-black">£{manualTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : <p className="text-slate-400 text-sm animate-pulse">Loading menu...</p>}
            </div>

            {/* STEP 2 — Collection time: left=ready time, right=selector */}
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-2">2. When to collect?</p>
              <div className="flex gap-2">
                {/* Left — dynamic ready time */}
                <div className={`flex-1 rounded-xl px-3 py-2.5 ${readyTime ? 'bg-green-50 border border-green-200' : 'bg-slate-100 border border-slate-100'}`}>
                  {readyTime ? (
                    <>
                      <p className="text-green-700 font-black text-sm">⚡ ~{readyTime}</p>
                      <p className="text-green-600 text-xs mt-0.5">Tell customer: "Around {readyTime}"</p>
                    </>
                  ) : asapSlot ? (
                    <>
                      <p className="text-slate-600 font-bold text-sm">Next: {asapSlot.collection_time}</p>
                      <p className="text-slate-400 text-xs mt-0.5">Add items to see ready time</p>
                    </>
                  ) : (
                    <p className="text-slate-400 text-sm">Walk-up only</p>
                  )}
                </div>
                {/* Right — specific time selector, always visible */}
              <div className="flex-1">
                {slots.length > 0 ? (
                  <select value={manualSlot} onChange={e => setManualSlot(e.target.value)}
                    className="w-full h-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
                    <option value="">ASAP</option>
                    {slots.map(s => {
                      const pct = s.max_orders>0 ? s.current_orders/s.max_orders : 0
                      const ind = pct>=1?'🔴':pct>=0.7?'🟡':'🟢'
                      const rem = s.max_orders - s.current_orders
                      return (
                        <option key={s.collection_time} value={s.collection_time} disabled={!s.available}>
                          {s.collection_time} {ind} {s.available?`${rem} left`:'Full'}
                        </option>
                      )
                    })}
                  </select>
                ) : (
                  // Fallback: manual time entry when no slots configured
                  <input
                    type="time"
                    value={manualSlot}
                    onChange={e => setManualSlot(e.target.value)}
                    className="w-full h-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                )}
              </div>
              </div>
            </div>

            {/* STEP 3 — Name */}
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-1">3. Customer name *</p>
              <input type="text" value={manualName} onChange={e=>setManualName(e.target.value)} placeholder="e.g. Sarah"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" />
            </div>

            {/* STEP 4 — Email */}
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-1">4. Email <span className="font-normal normal-case text-slate-400">— optional</span></p>
              <input type="email" value={manualEmail} onChange={e=>setManualEmail(e.target.value)} placeholder="For ready notification"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" />
            </div>

            {/* STEP 5 — Notes */}
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-1">5. Notes <span className="font-normal normal-case text-slate-400">— optional</span></p>
              <textarea value={manualNotes} onChange={e=>setManualNotes(e.target.value)} placeholder="Allergies, no onion…" rows={2}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white resize-none" />
            </div>

            <button onClick={submitManual} disabled={actionLoading==='manual'||!manualName.trim()||!manualItems.length}
              className="w-full bg-orange-600 text-white font-black py-3.5 rounded-xl hover:bg-orange-700 transition-colors active:scale-[0.98] disabled:opacity-40">
              {actionLoading==='manual' ? 'Saving...' : `Save order${manualItems.length?` · £${manualTotal.toFixed(2)}`:''}`}
            </button>
          </div>
        )}

        {/* ── MENU & STOCK TAB ── */}
        {activeTab === 'stock' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
              <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-1">Stock & availability</p>
              <p className="text-slate-400 text-xs mb-4">Set category totals for quick setup, then fine-tune individual items if needed. Stock counts down as orders come in.</p>

              {truckMenu ? (
                <div className="space-y-5">
                  {Object.entries(menuGroups).map(([cat, items]) => {
                    const catStock = categoryStocks.find(s => s.category === cat)
                    const catStockCount = catStock?.stock_count ?? null
                    const catOrdersCount = catStock?.orders_count ?? 0
                    const catRemaining = catStockCount !== null ? catStockCount - catOrdersCount : null

                    return (
                      <div key={cat}>
                        {/* Category header with stock control */}
                        <div className="flex items-center gap-3 mb-2 pb-2 border-b border-slate-100">
                          <p className="text-sm font-black text-orange-600 uppercase tracking-wide flex-1">
                            {cat.charAt(0).toUpperCase()+cat.slice(1)}
                          </p>
                          <div className="flex items-center gap-2">
                            {catRemaining !== null && (
                              <span className={`text-xs font-bold ${catRemaining <= 5 ? 'text-orange-500' : 'text-slate-400'}`}>
                                {catRemaining} left
                              </span>
                            )}
                            {catOrdersCount > 0 && (
                              <span className="text-xs text-slate-400">{catOrdersCount} ordered</span>
                            )}
                            <input
                              type="number" min="0" placeholder="∞"
                              value={catStockCount ?? ''}
                              onChange={e => {
                                const val = e.target.value === '' ? null : parseInt(e.target.value)
                                updateCategoryStock(cat, val)
                              }}
                              className="w-16 border border-orange-200 rounded-lg px-2 py-1.5 text-xs text-center font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-orange-50"
                            />
                            <span className="text-slate-400 text-xs">total</span>
                          </div>
                        </div>

                        {/* Individual items */}
                        <div className="space-y-1.5 ml-2">
                          {items.map(item => {
                            const stock = itemStocks.find(s => s.name===item.name)
                            const isSoldOut = stock ? !stock.available : false
                            const itemStockCount = stock?.stock_count ?? null
                            const itemOrdersCount = stock?.orders_count ?? 0
                            const itemRemaining = itemStockCount !== null ? itemStockCount - itemOrdersCount : null
                            // Category remaining (for display)
                            const catRemObj = categoryStocks.find(s => s.category === cat)
                            const catRem = catRemObj && catRemObj.stock_count !== null
                              ? catRemObj.stock_count - catRemObj.orders_count : null
                            const effectiveRemaining = itemRemaining !== null
                              ? (catRem !== null ? Math.min(itemRemaining, catRem) : itemRemaining)
                              : catRem

                            return (
                              // Always visible — sold out items stay in list
                              <div key={item.name} className={`flex items-center gap-2 p-2 rounded-xl border ${isSoldOut ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-100'}`}>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className={`font-bold text-sm ${isSoldOut ? 'text-red-500' : 'text-slate-800'}`}>
                                      {item.name}
                                    </p>
                                    {isSoldOut && (
                                      <span className="text-[10px] font-black text-red-500 bg-red-100 px-1.5 py-0.5 rounded-full">SOLD OUT</span>
                                    )}
                                    {!isSoldOut && effectiveRemaining !== null && (
                                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${effectiveRemaining <= 3 ? 'text-red-600 bg-red-100' : effectiveRemaining <= 10 ? 'text-orange-600 bg-orange-100' : 'text-slate-500 bg-slate-100'}`}>
                                        {effectiveRemaining} left
                                      </span>
                                    )}
                                  </div>
                                  {itemOrdersCount > 0 && (
                                    <p className="text-xs text-slate-400 mt-0.5">{itemOrdersCount} ordered</p>
                                  )}
                                </div>

                                {/* Per-item stock — optional override */}
                                <input
                                  type="number" min="0" placeholder="–"
                                  value={itemStockCount ?? ''}
                                  onChange={e => {
                                    const val = e.target.value === '' ? null : parseInt(e.target.value)
                                    updateStock(item.name, !isSoldOut, val, cat)
                                  }}
                                  className="w-12 border border-slate-200 rounded-lg px-1.5 py-1 text-xs text-center font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
                                  title="Override count for this item only"
                                />

                                <button
                                  onClick={() => updateStock(item.name, isSoldOut, itemStockCount, cat)}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all border shrink-0 ${isSoldOut ? 'bg-red-500 text-white border-red-500' : 'bg-white text-slate-500 border-slate-200 hover:border-red-200 hover:text-red-500'}`}>
                                  {isSoldOut ? '✗ Out' : '✓ In'}
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : <p className="text-slate-400 text-sm animate-pulse">Loading menu...</p>}
            </div>

            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 text-xs text-slate-500 space-y-1">
              <p className="font-bold text-slate-700">How stock works</p>
              <p>• Set a category total (e.g. 100 pizzas) for quick setup</p>
              <p>• Optionally add item-level overrides (e.g. only 8 Pepperoni)</p>
              <p>• Both category and item counts go down as orders come in</p>
              <p>• When either hits zero that item is hidden from customers</p>
              <p>• Use ✓ In / ✗ Out to override manually at any time</p>
            </div>
          </div>
        )}

      </main>

      {/* Edit order modal */}
      {editingOrder && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={e => e.target===e.currentTarget && setEditingOrder(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-black text-slate-900">Edit Order #{editingOrder.id}</h3>
              <button onClick={() => setEditingOrder(null)} className="text-slate-400 hover:text-slate-700 text-xl font-bold w-8 h-8 flex items-center justify-center">×</button>
            </div>

            {/* Full menu to add/remove items */}
            {truckMenu && (
              <div className="mb-4 space-y-3">
                <p className="text-xs font-black text-slate-500 uppercase tracking-wide">Add items</p>
                {Object.entries(menuGroups).map(([cat, items]) => (
                  <div key={cat}>
                    <p className="text-xs font-black text-orange-600 uppercase tracking-wide mb-1.5">{cat.charAt(0).toUpperCase()+cat.slice(1)}</p>
                    <div className="flex flex-wrap gap-2">
                      {items.map(item => {
                        const inEdit = editItems.find(i => i.name===item.name)
                        const stock = itemStocks.find(s => s.name===item.name)
                        const isSoldOut = stock ? !stock.available : false
                        const itemRem = stock?.stock_count != null ? stock.stock_count - (stock.orders_count||0) : null
                        const catSt = categoryStocks.find(s => s.category === item.category)
                        const catRem = catSt?.stock_count != null ? catSt.stock_count - (catSt.orders_count||0) : null
                        const effectiveRem = itemRem !== null ? (catRem !== null ? Math.min(itemRem, catRem) : itemRem) : catRem
                        const isLow = !isSoldOut && effectiveRem !== null && effectiveRem <= 10
                        if (isSoldOut) return (
                          <div key={item.name} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-100 bg-slate-50">
                            <span className="text-xs text-slate-400 line-through">{item.name}</span>
                            <span className="text-[9px] text-red-400 font-bold">out</span>
                          </div>
                        )
                        return (
                          <button key={item.name} onClick={() => addEditItem(item)}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all ${inEdit ? 'bg-orange-600 border-orange-600 text-white' : isLow ? 'bg-orange-50 border-orange-200 text-slate-700' : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-orange-300'}`}>
                            {inEdit && <span className="text-orange-200">{inEdit.quantity}×</span>}
                            {item.name}
                            <span className={inEdit?'text-orange-200':'text-slate-400'}>£{item.price.toFixed(2)}</span>
                            {isLow && !inEdit && <span className="text-[9px] text-orange-500 font-black">({effectiveRem})</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Current items with qty controls */}
            {editItems.length > 0 && (
              <div className="bg-slate-50 rounded-xl p-3 mb-4 space-y-2">
                <p className="text-xs font-black text-slate-500 uppercase tracking-wide">Order</p>
                {editItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="flex-1 text-sm font-bold text-slate-900 truncate">{item.name}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditItems(prev => prev.map((i,n)=>n===idx?{...i,quantity:i.quantity-1}:i).filter(i=>i.quantity>0))}
                        className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center font-bold hover:bg-red-100 hover:text-red-600 text-sm">−</button>
                      <span className="w-4 text-center font-black text-sm">{item.quantity}</span>
                      <button onClick={() => setEditItems(prev => prev.map((i,n)=>n===idx?{...i,quantity:i.quantity+1}:i))}
                        className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center font-bold hover:bg-orange-100 hover:text-orange-600 text-sm">+</button>
                    </div>
                    <span className="text-slate-500 text-xs w-12 text-right">£{(item.unit_price*item.quantity).toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 border-t border-slate-200">
                  <span className="text-slate-600 text-sm font-bold">New total</span>
                  <div className="text-right">
                    <span className="text-slate-900 font-black">£{editTotal.toFixed(2)}</span>
                    {priceDiff !== 0 && (
                      <span className={`text-xs ml-1.5 font-bold ${priceDiff>0?'text-orange-500':'text-green-500'}`}>
                        {priceDiff>0?'+':''}{priceDiff.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Edit slot */}
            {slots.length > 0 && (
              <div className="mb-4">
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wide">Collection time</label>
                <select value={editSlot} onChange={e=>setEditSlot(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
                  <option value="">No slot</option>
                  {slots.map(s=><option key={s.collection_time} value={s.collection_time}>{s.collection_time}</option>)}
                </select>
              </div>
            )}

            {/* Edit notes */}
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wide">Notes</label>
              <textarea value={editNotes} onChange={e=>setEditNotes(e.target.value)} rows={2}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none" />
            </div>

            <div className="flex gap-2">
              <button onClick={() => setEditingOrder(null)} className="flex-1 bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl hover:bg-slate-200 text-sm">Cancel</button>
              <button onClick={submitEdit} disabled={!!actionLoading?.startsWith('edit')||editItems.length===0}
                className="flex-1 bg-orange-600 text-white font-bold py-2.5 rounded-xl hover:bg-orange-700 text-sm disabled:opacity-50">
                {actionLoading?.startsWith('edit') ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-4 right-4 max-w-sm mx-auto rounded-xl px-4 py-3 text-sm font-bold text-center shadow-xl z-50 ${toast.type==='success'?'bg-green-600 text-white':'bg-red-600 text-white'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ─── Order card ───────────────────────────────────────────────────────────────

function OrderCard({ order, truck, slots, actionLoading, onAction, onEdit, compact=false }: {
  order: Order; truck: TruckData|null; slots: Slot[]
  actionLoading: string|null
  onAction: (action:string, orderId:string)=>void
  onEdit: (order:Order)=>void
  compact?: boolean
}) {
  const [expanded, setExpanded] = useState(!compact)
  const s = STATUS[order.status] || STATUS.pending
  const isPub = truck?.mode === 'pub'

  return (
    <div className={`bg-white rounded-2xl overflow-hidden border shadow-sm ${order.status==='pending'?'border-orange-400':'border-slate-200'}`}>
      <button onClick={() => setExpanded(e=>!e)} className="w-full text-left p-4">
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
            <p className="text-slate-400 text-xs">{expanded?'▲':'▼'}</p>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-3 bg-slate-50">
          <div className="space-y-1 mb-3">
            {order.items.map((item,i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-slate-700">{item.quantity}× {item.name}</span>
                <span className="text-slate-500">£{(item.unit_price*item.quantity).toFixed(2)}</span>
              </div>
            ))}
            {order.deals?.map((d,i) => <p key={i} className="text-xs text-orange-600">🎁 {d.name}: {Object.values(d.slots).filter(Boolean).join(', ')}</p>)}
          </div>
          {order.notes && <div className="bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 text-xs text-orange-700 mb-3">📝 {order.notes}</div>}
          <div className="flex gap-2 flex-wrap">
            {order.status==='pending' && (
              <>
                <Btn label="✓ Confirm" colour="green" loading={actionLoading===`confirm-${order.id}`} onClick={()=>onAction('confirm',order.id)} />
                <Btn label="✗ Reject"  colour="red"   loading={actionLoading===`reject-${order.id}`}  onClick={()=>onAction('reject',order.id)}  />
              </>
            )}
            {order.status==='confirmed' && isPub && <Btn label="🍕 Ready" colour="blue" loading={actionLoading===`ready-${order.id}`} onClick={()=>onAction('ready',order.id)} />}
            {order.status==='confirmed' && !isPub && <Btn label="✓ Collected" colour="slate" loading={actionLoading===`collected-${order.id}`} onClick={()=>onAction('collected',order.id)} />}
            {order.status==='ready' && <Btn label="✓ Collected" colour="slate" loading={actionLoading===`collected-${order.id}`} onClick={()=>onAction('collected',order.id)} />}
            {order.status==='collected' && <Btn label="↩ Undo" colour="slate" loading={actionLoading===`undo_collected-${order.id}`} onClick={()=>onAction('undo_collected',order.id)} />}
            {['pending','confirmed','modified'].includes(order.status) && <Btn label="✏ Edit" colour="orange" loading={false} onClick={()=>onEdit(order)} />}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Inline price editor ──────────────────────────────────────────────────────

function InlinePriceEditor({ price, quantity, onChange }: { price:number; quantity:number; onChange:(p:number)=>void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(price.toFixed(2))
  if (editing) return (
    <div className="flex items-center gap-1 shrink-0">
      <span className="text-slate-400 text-xs">£</span>
      <input type="number" value={val} step="0.50" min="0" autoFocus
        onChange={e=>setVal(e.target.value)}
        onBlur={() => { onChange(parseFloat(val)||0); setEditing(false) }}
        onKeyDown={e => { if(e.key==='Enter'){onChange(parseFloat(val)||0);setEditing(false)} }}
        className="w-14 border border-orange-400 rounded-lg px-1.5 py-0.5 text-xs font-bold text-slate-900 focus:outline-none text-center"
      />
    </div>
  )
  return (
    <button onClick={() => { setVal(price.toFixed(2)); setEditing(true) }} className="text-right shrink-0 min-w-[56px]" title="Edit price">
      <span className="text-slate-700 font-bold text-sm">£{(price*quantity).toFixed(2)}</span>
      <span className="text-slate-400 text-[10px] block leading-none">edit</span>
    </button>
  )
}

// ─── Action button ────────────────────────────────────────────────────────────

function Btn({ label, colour, loading, onClick }: { label:string; colour:string; loading:boolean; onClick:()=>void }) {
  const colours: Record<string,string> = {
    green:  'bg-green-600 hover:bg-green-700',
    red:    'bg-red-500 hover:bg-red-600',
    blue:   'bg-blue-600 hover:bg-blue-700',
    slate:  'bg-slate-500 hover:bg-slate-600',
    orange: 'bg-orange-100 text-orange-700 hover:bg-orange-200 border border-orange-200',
  }
  return (
    <button onClick={onClick} disabled={loading}
      className={`${colours[colour]||colours.slate} ${colour==='orange'?'':'text-white'} font-bold text-sm px-4 py-2 rounded-xl transition-colors active:scale-95 disabled:opacity-50 flex-1 min-w-[72px]`}>
      {loading ? '...' : label}
    </button>
  )
}