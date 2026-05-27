'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { OrderCard } from '@/components/dashboard/OrderCard'
import { getAllDayCounts } from '@/components/dashboard/helpers'
import { supabaseBrowser } from '@/lib/supabase-browser'
import type { Order, TruckData, TruckEvent } from '@/components/dashboard/types'
import { useFeatures } from '@/lib/useFeatures'
import { keepAwake, allowSleep } from '@/lib/native/keepAwake'
import { getNetworkStatus, addNetworkListener } from '@/lib/native/network'
import { requestNotificationPermission, playNewOrderAlert, notifyNewOrder } from '@/lib/native/notifications'
import { configureStatusBar } from '@/lib/native/statusBar'
import { registerServiceWorker, addSWMessageListener, getQueueCount } from '@/lib/native/serviceWorker'

// View mode driven by ?view= query param
// /kds           → window view (default, for the main iPad at the hatch)
// /kds?view=cook → cook view (for a second tablet facing into the kitchen)
type KdsView = 'window' | 'cook'

export default function KdsPage() {
  const { token } = useParams<{ token: string }>()
  const searchParams = useSearchParams()
  const kdsView: KdsView = searchParams.get('view') === 'cook' ? 'cook' : 'window'
  const vanId = searchParams.get('van_id') ?? ''
  const vanName = searchParams.get('van_name') ?? ''

  const [truck, setTruck] = useState<TruckData | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [pausedUntil, setPausedUntil] = useState<string | null>(null)
  const [extraWaitMins, setExtraWaitMins] = useState(0)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [categoryOrder, setCategoryOrder] = useState<string[]>([])
  const [itemCategoryMap, setItemCategoryMap] = useState<Record<string, string>>({})

  // PIN auth — same pattern as main dashboard
  // Operators can bake the PIN into the bookmark URL: /kds?pin=1234
  const [pin, setPin] = useState(() => searchParams.get('pin') ?? '')
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [requiresPin, setRequiresPin] = useState(false)

  const [keepScreenOn, setKeepScreenOn] = useState(true)
  const [showScreenOffWarning, setShowScreenOffWarning] = useState(false)
  const [vansWithAutoPause, setVansWithAutoPause] = useState<string[]>([])
  const [viewOverride, setViewOverride] = useState<'window' | 'cook' | null>(null)
  const [layoutOverride, setLayoutOverride] = useState<'list' | 'grid' | null>(null)
  const [isOffline, setIsOffline] = useState(false)
  const [pendingSyncCount, setPendingSyncCount] = useState(0)
  const [pendingSync, setPendingSync] = useState<Set<string>>(new Set())
  const [todayEvents, setTodayEvents] = useState<TruckEvent[]>([])
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [showEventMenu, setShowEventMenu] = useState(false)
  const [eventNoteInput, setEventNoteInput] = useState('')
  const [kdsToast, setKdsToast] = useState<string | null>(null)

  const fetchAllRef = useRef<() => void>(() => {})
  const prevOrderCountRef = useRef(0)
  const initialLoadDoneRef = useRef(false)

  const fetchAll = useCallback(async (currentPin = pin) => {
    if (!token) return
    try {
      const params = new URLSearchParams({ token })
      if (currentPin) params.set('pin', currentPin)
      if (vanId) params.set('van_id', vanId)
      const res = await fetch(`/api/dashboard?${params}`)
      const data = await res.json()

      if (res.status === 401) {
        if (data.requiresPin) {
          setRequiresPin(true)
          setLoading(false)
          return
        }
        throw new Error(data.error ?? 'Unauthorized')
      }

      if (!res.ok) throw new Error('Failed to fetch')

      setTruck(data.truck)
      setKeepScreenOn(data.truck?.keep_screen_on ?? true)
      setOrders(data.orders ?? [])
      setPausedUntil(data.truck?.paused_until ?? null)
      setExtraWaitMins(data.truck?.extra_wait_mins ?? 0)
      setCategoryOrder(data.categoryOrder ?? [])
      setItemCategoryMap(data.itemCategoryMap ?? {})
      setRequiresPin(false)

      try {
        const eventsRes = await fetch(`/api/events/manage?token=${token}&upcoming=true`)
        const eventsData = await eventsRes.json()
        const todayStr = new Date().toISOString().split('T')[0]
        const fetched = (eventsData.events ?? []).filter((e: TruckEvent) => e.event_date === todayStr)
        setTodayEvents(fetched)
        const currentTime = new Date().toTimeString().slice(0, 5)
        const stale = fetched.filter((e: TruckEvent) =>
          e.status === 'confirmed' && e.auto_open === true && e.start_time <= currentTime
        )
        for (const ev of stale) {
          await fetch('/api/events/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, action: 'open', eventId: ev.id, payload: {} }),
          })
        }
        if (stale.length > 0) {
          setTodayEvents(prev => prev.map(e =>
            stale.some((s: TruckEvent) => s.id === e.id)
              ? { ...e, status: 'open' as const, opened_at: new Date().toISOString() }
              : e
          ))
        }
      } catch {}
    } catch (e) {
      console.error('[kds] fetchAll error:', e)
      setError('Could not load orders')
    } finally {
      setLoading(false)
    }
  }, [token, pin])

  useEffect(() => {
    configureStatusBar()
    keepAwake() // on by default; updated when truck.keep_screen_on loads
    return () => { allowSleep() }
  }, [])

  useEffect(() => {
    if (keepScreenOn) { keepAwake() } else { allowSleep() }
  }, [keepScreenOn])

  useEffect(() => {
    requestNotificationPermission()
  }, [])

  useEffect(() => {
    getNetworkStatus().then(s => setIsOffline(s === 'offline'))
    const remove = addNetworkListener(s => {
      setIsOffline(s === 'offline')
      if (s === 'online') getQueueCount().then(setPendingSyncCount)
    })
    return remove
  }, [])

  useEffect(() => {
    registerServiceWorker()
    getQueueCount().then(setPendingSyncCount)
    return addSWMessageListener(count => {
      setPendingSyncCount(count)
      if (count === 0) {
        setPendingSync(new Set())
        fetchAllRef.current()
      }
    })
  }, [])

  useEffect(() => {
    const sendHeartbeat = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return
      try {
        await fetch('/api/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, vanId: vanId || undefined }),
        })
      } catch {}
    }
    sendHeartbeat()
    const heartbeatInterval = setInterval(sendHeartbeat, 15000)
    return () => { clearInterval(heartbeatInterval) }
  }, [token, vanId])

  useEffect(() => {
    fetchAllRef.current = fetchAll
  }, [fetchAll])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  useEffect(() => {
    if (!initialLoadDoneRef.current) {
      initialLoadDoneRef.current = true
      prevOrderCountRef.current = orders.length
      return
    }
    if (orders.length > prevOrderCountRef.current) {
      const newCount = orders.length - prevOrderCountRef.current
      notifyNewOrder(newCount)
    }
    prevOrderCountRef.current = orders.length
  }, [orders])

  useEffect(() => {
    if (truck?.name) document.title = `${truck.name} Kitchen`
  }, [truck?.name])

  // Realtime subscription (same pattern as main dashboard)
  useEffect(() => {
    if (!truck?.id) return

    const ordersChannel = supabaseBrowser
      .channel(`kds-orders:${truck.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `truck_id=eq.${truck.id}`,
      }, (payload: any) => {
        fetchAllRef.current()
        if (
          payload.eventType === 'INSERT' &&
          ['confirmed', 'pending'].includes(payload.new?.status)
        ) {
          playNewOrderAlert(`#${payload.new.id}`)
        }
      })
      .subscribe()

    const truckChannel = supabaseBrowser
      .channel(`kds-truck:${truck.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'trucks',
        filter: `id=eq.${truck.id}`,
      }, () => fetchAllRef.current())
      .subscribe()

    const fallback = setInterval(() => fetchAllRef.current(), 60000)

    return () => {
      supabaseBrowser.removeChannel(ordersChannel)
      supabaseBrowser.removeChannel(truckChannel)
      clearInterval(fallback)
    }
  }, [truck?.id])

  const applyKeepScreenOn = async (value: boolean) => {
    setKeepScreenOn(value)
    if (value) { await keepAwake() } else { await allowSleep() }
    try {
      await fetch('/api/dashboard/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: 'update_keep_screen_on', keepScreenOn: value }),
      })
    } catch {}
  }
  const toggleKeepScreenOn = async () => {
    if (keepScreenOn && truck?.id) {
      try {
        const { data: vans } = await supabaseBrowser.from('truck_vans').select('name,auto_pause_on_offline').eq('truck_id', truck.id).eq('active', true)
        const autoPauseVans = (vans || []).filter((v: any) => v.auto_pause_on_offline).map((v: any) => v.name)
        if (autoPauseVans.length > 0) { setVansWithAutoPause(autoPauseVans); setShowScreenOffWarning(true); return }
      } catch {}
    }
    await applyKeepScreenOn(!keepScreenOn)
  }
  const confirmScreenOff = async () => { setShowScreenOffWarning(false); await applyKeepScreenOn(false) }

  const handleAction = useCallback(async (action: string, orderId: string) => {
    setActionLoading(`${action}-${orderId}`)
    try {
      const res = await fetch('/api/dashboard/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, pin, action, orderId }),
      })
      const data = await res.json()
      if (data?.queued) {
        setPendingSyncCount(c => c + 1)
        setPendingSync(prev => new Set(prev).add(orderId))
        setActionLoading(null)
        return
      }
    } catch {}
    setActionLoading(null)
    fetchAllRef.current()
  }, [token, pin])

  const togglePause = useCallback(async () => {
    const isPaused = pausedUntil && new Date(pausedUntil) > new Date()
    if (!isPaused) {
      const confirmed = window.confirm('Pause orders? Customers will see "Not accepting orders" until you resume.')
      if (!confirmed) return
    }
    const paused_until = isPaused
      ? null
      : new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    setPausedUntil(paused_until)
    const res = await fetch('/api/dashboard/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, pin, action: 'set_paused', paused_until }),
    })
    const data = await res.json()
    if (data?.queued) {
      setPendingSyncCount(c => c + 1)
      return
    }
    fetchAllRef.current()
  }, [token, pin, pausedUntil])

  const handleSetWait = useCallback(async (mins: number) => {
    setExtraWaitMins(mins)
    const res = await fetch('/api/dashboard/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, pin, action: 'set_extra_wait', minutes: mins }),
    })
    const data = await res.json()
    if (data?.queued) {
      setPendingSyncCount(c => c + 1)
      return
    }
    fetchAllRef.current()
  }, [token, pin])

  const submitPin = async () => {
    setPinError('')
    const params = new URLSearchParams({ token, pin: pinInput })
    const res = await fetch(`/api/dashboard?${params}`)
    const data = await res.json()
    if (!res.ok) {
      setPinError('Incorrect PIN')
      return
    }
    setPin(pinInput)
    setTruck(data.truck)
    setOrders(data.orders ?? [])
    setPausedUntil(data.truck?.paused_until ?? null)
    setExtraWaitMins(data.truck?.extra_wait_mins ?? 0)
    setRequiresPin(false)
  }

  const showKdsToast = (msg: string) => { setKdsToast(msg); setTimeout(() => setKdsToast(null), 3500) }

  const openEvent = async (eventId: string) => {
    try {
      const res = await fetch('/api/events/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action: 'open', eventId, payload: {} }) })
      const data = await res.json()
      if (data?.queued) { setPendingSyncCount(c => c + 1); return }
      if (!res.ok) throw new Error(data.error)
      setTodayEvents(prev => prev.map(e => e.id === eventId ? { ...e, status: 'open' as const, opened_at: new Date().toISOString() } : e))
      showKdsToast('Open for orders')
    } catch (err: any) { showKdsToast(err.message || 'Failed') }
  }

  const extendEvent = async (eventId: string, addMins: number) => {
    const ev = todayEvents.find(e => e.id === eventId); if (!ev) return
    const [h, m] = ev.end_time.split(':').map(Number)
    const total = h * 60 + m + addMins
    const newEnd = `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
    try {
      const res = await fetch('/api/events/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action: 'update', eventId, payload: { end_time: newEnd } }) })
      const data = await res.json()
      if (data?.queued) { setPendingSyncCount(c => c + 1); return }
      if (!res.ok) throw new Error(data.error)
      setTodayEvents(prev => prev.map(e => e.id === eventId ? { ...e, end_time: newEnd } : e))
      showKdsToast(`Extended to ${newEnd}`)
    } catch (err: any) { showKdsToast(err.message || 'Failed') }
  }

  const closeEventEarly = async (eventId: string) => {
    try {
      const res = await fetch('/api/events/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action: 'close', eventId, payload: {} }) })
      const data = await res.json()
      if (data?.queued) { setPendingSyncCount(c => c + 1); setShowEventMenu(false); return }
      if (!res.ok) throw new Error(data.error)
      setTodayEvents(prev => prev.map(e => e.id === eventId ? { ...e, status: 'closed' as const, closed_at: new Date().toISOString() } : e))
      setShowEventMenu(false); showKdsToast('Event closed')
    } catch (err: any) { showKdsToast(err.message || 'Failed') }
  }

  const cancelEventFromMenu = async (eventId: string) => {
    if (!window.confirm('Cancel this event? This cannot be undone.')) return
    try {
      const res = await fetch('/api/events/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action: 'cancel', eventId, payload: {} }) })
      const data = await res.json()
      if (data?.queued) { setPendingSyncCount(c => c + 1); setShowEventMenu(false); return }
      if (!res.ok) throw new Error(data.error)
      setTodayEvents(prev => prev.filter(e => e.id !== eventId))
      setSelectedEventId(null); setShowEventMenu(false); showKdsToast('Event cancelled')
    } catch (err: any) { showKdsToast(err.message || 'Failed') }
  }

  const saveEventNote = async (eventId: string) => {
    try {
      const res = await fetch('/api/events/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action: 'update', eventId, payload: { customer_note: eventNoteInput } }) })
      const data = await res.json()
      if (data?.queued) { setPendingSyncCount(c => c + 1); setShowEventMenu(false); return }
      if (!res.ok) throw new Error(data.error)
      setTodayEvents(prev => prev.map(e => e.id === eventId ? { ...e, customer_note: eventNoteInput || null } : e))
      setShowEventMenu(false); showKdsToast('Note saved')
    } catch (err: any) { showKdsToast(err.message || 'Failed') }
  }

  const switchEvent = (event: TruckEvent) => {
    const active = todayEvents.find(e => e.id === selectedEventId) ?? (todayEvents.find(e => e.status === 'open') ?? todayEvents.find(e => e.status === 'confirmed') ?? todayEvents[0] ?? null)
    if (active?.status === 'open' && event.id !== active.id) {
      if (!window.confirm(`You're currently serving at ${active.venue_name}. Switch to ${event.venue_name}? Tap the current event to switch back.`)) return
    }
    setSelectedEventId(event.id)
  }

  const activeEvent: TruckEvent | null = selectedEventId
    ? todayEvents.find(e => e.id === selectedEventId) ?? null
    : (todayEvents.find(e => e.status === 'open')
      ?? todayEvents.find(e => e.status === 'confirmed')
      ?? todayEvents[0]
      ?? null)
  const recentlyClosed = !!(activeEvent?.status === 'closed' && activeEvent.closed_at && Date.now() - new Date(activeEvent.closed_at).getTime() < 10 * 60 * 1000)

  const isPaused = pausedUntil ? new Date(pausedUntil) > new Date() : false

  const kdsMode = truck?.kds_mode ?? false
  const displayMode = truck?.display_mode ?? 'list'
  const { can } = useFeatures(truck)

  // Session-only overrides — URL param / DB setting is the default
  // Cook screen is Max-only: force window view if plan doesn't include it
  const activeView: KdsView = can('cook_screen')
    ? (viewOverride ?? kdsView)
    : 'window'
  const activeLayout = layoutOverride ?? displayMode

  // Base: exclude terminal statuses for all views
  const activeOrders = orders.filter(o =>
    !['collected', 'cancelled', 'rejected'].includes(o.status)
  )

  // Cook view: cook's job ends at ready — hide ready orders from the kitchen screen
  const cookOrders = activeOrders.filter(o => o.status !== 'ready')
  // Window view: keep ready orders visible — window person hands over and takes payment
  const windowOrders = activeOrders

  const displayOrders = (activeView === 'cook' ? cookOrders : windowOrders)
    .slice()
    .sort((a, b) => {
      const ta = a.slot ? new Date(`1970-01-01T${a.slot}`).getTime() : 0
      const tb = b.slot ? new Date(`1970-01-01T${b.slot}`).getTime() : 0
      return ta - tb
    })

  const MAX_GRID_VISIBLE = activeView === 'cook' && activeLayout === 'grid' ? 8 : 6
  const visibleOrders = activeLayout === 'grid'
    ? displayOrders.slice(0, MAX_GRID_VISIBLE)
    : displayOrders
  const overflowCount = activeLayout === 'grid'
    ? Math.max(0, displayOrders.length - MAX_GRID_VISIBLE)
    : 0

  // Done orders: last 5 collected (window view only)
  const doneOrders = orders
    .filter(o => o.status === 'collected')
    .slice(0, 5)

  const allDayCounts = getAllDayCounts(activeOrders)
  const allDayPills = Object.entries(allDayCounts)

  // KDS always uses window or cook — never solo
  const cardViewMode = activeView === 'cook' ? 'cook' : 'window'

  if (loading) return (
    <div className="flex items-center justify-center h-screen text-slate-400 text-sm">
      Loading kitchen...
    </div>
  )

  // PIN prompt
  if (requiresPin) return (
    <div className="flex flex-col items-center justify-center h-screen bg-slate-50 gap-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 w-80 flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-slate-900 text-center">Enter PIN</h2>
        <input
          type="number"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="PIN"
          value={pinInput}
          onChange={e => setPinInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submitPin()}
          className="border border-slate-200 rounded-xl px-4 py-3 text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-slate-300"
          autoFocus
        />
        {pinError && <p className="text-red-500 text-sm text-center">{pinError}</p>}
        <button
          onClick={submitPin}
          className="bg-slate-900 text-white rounded-xl py-3 font-medium hover:bg-slate-700 transition-colors"
        >
          Unlock
        </button>
      </div>
    </div>
  )

  if (error || !truck) return (
    <div className="flex items-center justify-center h-screen text-red-500 text-sm">
      {error ?? 'Truck not found'}
    </div>
  )

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 overflow-hidden">

      {/* ── Header ── */}
      <header className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="font-medium text-slate-900">
            {truck.name}{vanName ? ` — ${vanName}` : ''}
          </span>
        </div>

        {/* View / layout switcher */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          <button
            onClick={() => setViewOverride('window')}
            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeView === 'window'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Window
          </button>
          {can('cook_screen') && (
            <button
              onClick={() => setViewOverride('cook')}
              className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
                activeView === 'cook'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Cook
            </button>
          )}
          <div className="w-px h-4 bg-slate-300 mx-1" />
          <button
            onClick={() => setLayoutOverride('list')}
            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeLayout === 'list'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            List
          </button>
          <button
            onClick={() => setLayoutOverride('grid')}
            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeLayout === 'grid'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Grid
          </button>
        </div>

        <div className="flex-1" />

        {/* Extra wait selector */}
        <div className="flex items-center gap-1">
          <select
            value={extraWaitMins}
            onChange={e => handleSetWait(parseInt(e.target.value))}
            className="text-xs border border-slate-200 rounded-md px-2 py-1.5 bg-white text-slate-700"
          >
            <option value="0">No extra wait</option>
            <option value="10">+10 min</option>
            <option value="20">+20 min</option>
            <option value="30">+30 min</option>
          </select>
        </div>

        {/* Pause — both views */}
        <button
          onClick={togglePause}
          className={`text-xs px-3 py-1.5 rounded-md border font-medium ${
            isPaused
              ? 'bg-red-50 text-red-700 border-red-200'
              : 'bg-white text-slate-600 border-slate-200'
          }`}
        >
          {isPaused ? 'Paused — tap to resume' : 'Pause orders'}
        </button>

        {/* Link to cook screen — window view + full crew mode only */}
        {activeView === 'window' && truck.crew_mode === 'full' && (
          <a
            href={`/dashboard/${token}/kds?view=cook${pin ? `&pin=${pin}` : ''}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-400 hover:text-slate-600 underline"
          >
            Open cook screen
          </a>
        )}

        <button
          onClick={toggleKeepScreenOn}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${keepScreenOn ? 'bg-teal-600 text-white' : 'bg-slate-200 text-slate-600'}`}
          title={keepScreenOn ? 'Screen will stay on' : 'Screen may turn off'}
        >
          <span>{keepScreenOn ? '☀️' : '🌙'}</span>
          <span className="hidden sm:inline">{keepScreenOn ? 'Screen on' : 'Screen off'}</span>
        </button>
      </header>

      {/* ── To Make bar ── */}
      {allDayPills.length > 0 && activeView === 'window' && (
        <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-slate-200 flex-shrink-0 overflow-x-auto">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wide flex-shrink-0">
            To make
          </span>
          {allDayPills.map(([name, count]) => (
            <span
              key={name}
              className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded-md whitespace-nowrap flex-shrink-0"
            >
              {count}× {name}
            </span>
          ))}
        </div>
      )}

      {/* ── Offline banner ── */}
      {isOffline && (
        <div className="bg-slate-900 text-white text-sm font-medium px-4 py-2.5 flex items-center gap-3 flex-shrink-0">
          <span className="inline-block w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
          <span>
            No connection — showing last known orders. Online ordering has been paused for customers.
            {pendingSyncCount > 0 && ` · ${pendingSyncCount} action${pendingSyncCount > 1 ? 's' : ''} queued`}
          </span>
        </div>
      )}

      {/* ── Pause / wait banners ── */}
      {isPaused && (
        <div className="bg-red-500 text-white text-sm font-medium px-4 py-2.5 flex items-center justify-between flex-shrink-0">
          <span>⏸ Orders paused — customers cannot order</span>
          <button onClick={togglePause} className="underline text-white text-xs">Resume</button>
        </div>
      )}
      {extraWaitMins > 0 && (
        <div className="bg-amber-500 text-white text-sm font-medium px-4 py-2.5 flex items-center justify-between flex-shrink-0">
          <span>⏱ +{extraWaitMins} min extra wait active</span>
          <button onClick={() => handleSetWait(0)} className="underline text-white text-xs">Clear</button>
        </div>
      )}

      {/* ── Multi-event switcher ── */}
      {todayEvents.length > 1 && (
        <div className="flex gap-2 px-4 py-2 border-b border-slate-100 overflow-x-auto flex-shrink-0">
          {todayEvents.map(event => (
            <button key={event.id} onClick={() => switchEvent(event)}
              className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                activeEvent?.id === event.id
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200'
              }`}>
              {event.venue_name.split(',')[0]} {event.start_time}{event.status === 'open' ? ' ●' : ''}
            </button>
          ))}
        </div>
      )}

      {/* ── Open for orders banner ── */}
      {activeEvent?.status === 'confirmed' && !activeEvent.auto_open && (
        <div className="bg-white border-2 border-teal-500 m-3 rounded-2xl p-5 text-center flex-shrink-0">
          <div className="text-base font-semibold text-slate-900 mb-1">📍 {activeEvent.venue_name}</div>
          <div className="text-sm text-slate-500 mb-3">Today · {activeEvent.start_time}–{activeEvent.end_time}</div>
          <button onClick={() => openEvent(activeEvent.id)}
            className="w-full bg-teal-600 text-white font-bold py-3 rounded-xl text-base hover:bg-teal-700 active:scale-[0.98] transition-all">
            Open for orders
          </button>
        </div>
      )}

      {/* ── Event header when open ── */}
      {activeEvent?.status === 'open' && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
            <span className="text-sm font-medium text-slate-900 truncate">{activeEvent.venue_name}</span>
            <span className="text-xs text-slate-400 flex-shrink-0">{activeEvent.start_time}–{activeEvent.end_time}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => extendEvent(activeEvent.id, 30)}
              className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:border-slate-400">
              +30 min
            </button>
            <button onClick={() => { setEventNoteInput(activeEvent.customer_note || ''); setShowEventMenu(true) }}
              className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:border-slate-400">
              ⋯
            </button>
          </div>
        </div>
      )}

      {/* ── Recently closed banner ── */}
      {recentlyClosed && activeEvent && (
        <div className="mx-3 mt-2 mb-1 bg-slate-100 border border-slate-200 rounded-xl p-3 flex items-center justify-between flex-shrink-0">
          <span className="text-sm text-slate-600">Event closed · {activeEvent.venue_name} ended at {activeEvent.end_time}</span>
          <button onClick={() => extendEvent(activeEvent.id, 30)} className="text-sm font-medium text-teal-600 hover:text-teal-700 ml-3 flex-shrink-0">Extend 30 min</button>
        </div>
      )}

      {/* ── Main layout ── */}
      <div className="flex flex-1 min-h-0">

        {/* ── Queue panel ── */}
        <div className="flex flex-col flex-1 min-w-0 overflow-y-auto">
        <div
          className={
            activeView === 'cook'
              ? activeLayout === 'list'
                ? 'flex flex-col gap-3 p-3'
                : 'grid gap-3 items-stretch p-3'
              : activeLayout === 'grid'
                ? 'grid grid-cols-2 xl:grid-cols-3 gap-3 items-stretch p-3'
                : 'flex flex-col gap-3 p-3'
          }
          style={(activeView === 'cook' && activeLayout === 'grid')
            ? { gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }
            : undefined
          }
        >

          {displayOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 text-slate-300 gap-2">
              <span className="text-4xl">✓</span>
              <span className="text-sm">Queue clear</span>
            </div>
          ) : (
            visibleOrders.map(order => (
              <OrderCard
                key={order.id}
                order={order}
                truck={truck}
                slots={[]}
                actionLoading={actionLoading}
                onAction={handleAction}
                onEdit={() => {}}
                viewMode={cardViewMode}
                kdsMode={kdsMode}
                categoryOrder={categoryOrder}
                itemCategoryMap={itemCategoryMap}
                pendingSync={pendingSync.has(order.id)}
              />
            ))
          )}

          {overflowCount > 0 && (
            <div className="col-span-2 text-center text-sm text-slate-500 py-3 bg-slate-100 rounded-lg">
              +{overflowCount} more order{overflowCount > 1 ? 's' : ''} in queue
            </div>
          )}

          {/* Done strip — window view, list mode only */}
          {activeView === 'window' && activeLayout === 'list' && doneOrders.length > 0 && (
            <div className="mt-2 border-t border-slate-200 pt-2">
              <div className="text-xs text-slate-400 uppercase tracking-wide mb-1.5">
                Done today · {doneOrders.length}
              </div>
              {doneOrders.map(o => (
                <div key={o.id} className="flex justify-between items-center py-1 text-xs text-slate-400 border-t border-slate-100">
                  <span>#{o.id} · {o.customer_name}</span>
                  <span className="text-green-600">✓ paid</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      </div>

      {/* Screen-off warning modal */}
      {showScreenOffWarning && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Allow screen to turn off?</h3>
              <p className="text-sm text-slate-500 mt-2">
                {vansWithAutoPause.length > 0
                  ? `${vansWithAutoPause.join(', ')} ${vansWithAutoPause.length === 1 ? 'has' : 'have'} offline detection enabled. If the screen turns off, the device may stop sending its online signal and automatically pause customer orders.`
                  : 'If the screen turns off, the device may stop sending its online signal.'
                }
              </p>
              <p className="text-sm text-slate-500 mt-2">Keep the screen on to ensure uninterrupted ordering.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowScreenOffWarning(false)} className="flex-1 border border-slate-200 text-slate-600 py-3 rounded-xl text-sm">Keep screen on</button>
              <button onClick={confirmScreenOff} className="flex-1 bg-slate-900 text-white font-semibold py-3 rounded-xl text-sm">Allow screen off</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Event menu modal ── */}
      {showEventMenu && activeEvent && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setShowEventMenu(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">{activeEvent.venue_name}</h3>
              <button onClick={() => setShowEventMenu(false)} className="text-slate-400 hover:text-slate-700 text-xl font-bold w-8 h-8 flex items-center justify-center">×</button>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Customer note</label>
              <input type="text" value={eventNoteInput} onChange={e => setEventNoteInput(e.target.value)}
                placeholder="e.g. Park in the main car park"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
              <button onClick={() => saveEventNote(activeEvent.id)} className="mt-2 w-full bg-slate-100 text-slate-700 font-bold py-2 rounded-xl hover:bg-slate-200 text-sm">Save note</button>
            </div>
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <button onClick={() => closeEventEarly(activeEvent.id)} className="w-full bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl hover:bg-slate-200 text-sm">Close early</button>
              <button onClick={() => cancelEventFromMenu(activeEvent.id)} className="w-full bg-red-50 text-red-600 font-bold py-2.5 rounded-xl hover:bg-red-100 border border-red-200 text-sm">Cancel event</button>
            </div>
          </div>
        </div>
      )}

      {kdsToast && (
        <div className="fixed bottom-6 left-4 right-4 max-w-sm mx-auto rounded-xl px-4 py-3 text-sm font-bold text-center shadow-xl z-50 bg-green-600 text-white">
          {kdsToast}
        </div>
      )}
    </div>
  )
}
