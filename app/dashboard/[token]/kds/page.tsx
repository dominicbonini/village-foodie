'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { OrderCard } from '@/components/dashboard/OrderCard'
import { useToasts } from '@/lib/useToasts'
import { useReadyEmailUndo } from '@/lib/useReadyEmailUndo'
import { ToastStack } from '@/components/ToastStack'
import { getAllDayCounts } from '@/components/dashboard/helpers'
import { supabaseBrowser } from '@/lib/supabase-browser'
import type { Order, TruckData, TruckEvent } from '@/components/dashboard/types'
import { useFeatures } from '@/lib/useFeatures'
import { keepAwake, allowSleep } from '@/lib/native/keepAwake'
import { formatTime, formatTimeRange } from '@/lib/time-utils'
import { getNetworkStatus, addNetworkListener } from '@/lib/native/network'
import { requestNotificationPermission, playNewOrderAlert, notifyNewOrder } from '@/lib/native/notifications'
import { installAudioUnlock, primeAudio } from '@/lib/audio'
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
  // Van-level "show cooking step" preference (Settings). Gates the cook view's "Start
  // cooking" button. Defaults off (matches the Settings toggle default) until loaded.
  const [showCookingStep, setShowCookingStep] = useState(false)
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
  // New-order SOUND pref — per DEVICE (localStorage, not DB), default ON. A ref mirrors it for the
  // realtime INSERT callback (set up once), which reads the CURRENT pref without re-subscribing.
  const [soundEnabled, setSoundEnabled] = useState(true)
  const soundEnabledRef = useRef(true)
  const [isOffline, setIsOffline] = useState(false)
  const [pendingSyncCount, setPendingSyncCount] = useState(0)
  const [pendingSync, setPendingSync] = useState<Set<string>>(new Set())
  const [todayEvents, setTodayEvents] = useState<TruckEvent[]>([])
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [showEventMenu, setShowEventMenu] = useState(false)
  // Styled "finish event" confirm (replaces window.confirm). early → harder warning naming the end.
  const [finishConfirm, setFinishConfirm] = useState<{ eventId: string; early: boolean; endTime: string } | null>(null)
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
      // event_id scopes the slot projection to the active event (re-key fix). Null on the
      // first load → the server falls back to the sole event on the date; once an event is
      // selected, fetchAll's identity changes and the effect re-fetches event-scoped.
      if (selectedEventId) params.set('event_id', selectedEventId)
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
      setShowCookingStep(data.vanShowCookingStep ?? false)
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
  }, [token, pin, selectedEventId])

  // Per-DEVICE KDS prefs (localStorage, keyed by token so two trucks on one device don't collide):
  // restore the saved view/layout on mount, then persist on change. A restored 'cook' still passes
  // through the activeView gate (can('cook_screen'), Max-plan only — Stage 1 de-coupled it from
  // show_cooking_step), so a non-Max device falls back to Window automatically — no extra guard needed.
  // null overrides are never written, so a first-ever-mount default isn't clobbered.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const v = localStorage.getItem(`hg_kds_view_${token}`)
    if (v === 'window' || v === 'cook') setViewOverride(v)
    const l = localStorage.getItem(`hg_kds_layout_${token}`)
    if (l === 'list' || l === 'grid') setLayoutOverride(l)
  }, [token])
  useEffect(() => {
    if (typeof window === 'undefined' || viewOverride === null) return
    localStorage.setItem(`hg_kds_view_${token}`, viewOverride)
  }, [viewOverride, token])
  useEffect(() => {
    if (typeof window === 'undefined' || layoutOverride === null) return
    localStorage.setItem(`hg_kds_layout_${token}`, layoutOverride)
  }, [layoutOverride, token])

  // Per-device SOUND pref (hg_kds_sound_<token>): install audio-unlock + restore on mount, persist on
  // change, and mirror into a ref the realtime INSERT callback reads. Default ON when no stored pref.
  useEffect(() => {
    installAudioUnlock()
    if (typeof window === 'undefined') return
    const s = localStorage.getItem(`hg_kds_sound_${token}`)
    if (s !== null) setSoundEnabled(s === 'on')
  }, [token])
  useEffect(() => {
    soundEnabledRef.current = soundEnabled
    if (typeof window !== 'undefined') localStorage.setItem(`hg_kds_sound_${token}`, soundEnabled ? 'on' : 'off')
  }, [soundEnabled, token])

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

  // SINGLE active-event resolution (also drives ● Live, the pause/extra-wait target, and the render
  // below): the selected event, else the live → confirmed → first today event. Declared here, above
  // the heartbeat effect, so the heartbeat can gate on its live status. "live" = status==='open'
  // (live-redefinition) — the same rule as the customer page, TruckListCard, the dashboard, and the
  // heartbeat-monitor.
  const activeEvent: TruckEvent | null = selectedEventId
    ? todayEvents.find(e => e.id === selectedEventId) ?? null
    : (todayEvents.find(e => e.status === 'open')
      ?? todayEvents.find(e => e.status === 'confirmed')
      ?? todayEvents[0]
      ?? null)
  const activeEventLive = activeEvent?.status === 'open'

  useEffect(() => {
    // Heartbeat ONLY while this KDS's active event is LIVE (status==='open') — offline protection
    // only matters for a live event; a confirmed/pre-order event isn't affected by going offline,
    // and the monitor only pauses status='open' events. Keyed on activeEventLive so STARTING an
    // event fires an immediate ping then the interval, and FINISHING it clears the interval (no
    // re-arm). No stale closure — the gate is the dep.
    if (!activeEventLive) return
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
    sendHeartbeat() // immediate ping on the confirmed→open flip
    const heartbeatInterval = setInterval(sendHeartbeat, 15000)
    return () => { clearInterval(heartbeatInterval) }
  }, [token, vanId, activeEventLive])

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
          soundEnabledRef.current &&
          payload.eventType === 'INSERT' &&
          ['confirmed', 'pending'].includes(payload.new?.status)
        ) {
          playNewOrderAlert(`#${payload.new.id}`)   // web → shared primed AudioContext; native → local notif
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

  // Shared stacked-toast + ready-email-undo machinery (the SAME modules the dashboard uses). KDS passes
  // NO onUndoRestore — it has no prep pills; undo just reverts status and the order re-appears in cookOrders
  // on refetch. The hook's beforeunload/unmount sendBeacon flush runs on KDS's lifecycle for free.
  const { toasts, showToast, dismissToast } = useToasts()
  const { scheduleReadyEmail, undoReady } = useReadyEmailUndo({ token, pin, showToast, refetch: () => fetchAllRef.current() })

  const handleAction = useCallback(async (action: string, orderKey: string) => {
    setActionLoading(`${action}-${orderKey}`)
    try {
      const res = await fetch('/api/dashboard/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 'ready' defers the customer email so the undo toast can cancel it (mirrors the dashboard).
        body: JSON.stringify({ token, pin, action, order_key: orderKey, ...(action === 'ready' ? { defer_email: true } : {}) }),
      })
      const data = await res.json()
      if (data?.queued) {
        // QUEUED OFFLINE → the ready did NOT commit server-side. Do NOT schedule the email or show the
        // undo toast (a phantom email must not fire 4s later for an uncommitted ready).
        setPendingSyncCount(c => c + 1)
        setPendingSync(prev => new Set(prev).add(orderKey))
        setActionLoading(null)
        return
      }
      // Committed 'ready' → defer the email 4s + show a stacked undo toast (undo cancels the email +
      // reverts the status; the order then re-appears in the cook list on refetch).
      if (action === 'ready') {
        const num = orders.find(o => o.order_key === orderKey)?.id ?? ''
        scheduleReadyEmail(orderKey)
        showToast(`Order #${num} ready`, 'success', { duration: 4000, action: { label: '↩ Undo', run: () => undoReady(orderKey, num) } })
      }
    } catch {}
    setActionLoading(null)
    fetchAllRef.current()
  }, [token, pin, orders, scheduleReadyEmail, undoReady, showToast])

  // Latest active-event id (assigned during render after activeEvent resolves below) so the pause/
  // extra-wait callbacks — defined before activeEvent — can read the current id without a TDZ ref.
  const activeEventIdRef = useRef<string | null>(null)
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
      body: JSON.stringify({ token, pin, action: 'set_paused', paused_until, eventId: activeEventIdRef.current }),
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
      body: JSON.stringify({ token, pin, action: 'set_extra_wait', minutes: mins, eventId: activeEventIdRef.current }),
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
    setShowCookingStep(data.vanShowCookingStep ?? false)
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
      showKdsToast('Event started')
      fetchAllRef.current() // re-sync from the server read so status propagates immediately
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

  // Styled finish confirm (replaces window.confirm). finishEvent OPENS the modal; doFinishEvent runs
  // the close after Yes. The timing-aware (finishingEarly = now<end_time, minute-parsed) logic is
  // UNCHANGED — only the confirm SURFACE moved to the modal below.
  const finishEvent = (eventId: string) => {
    const ev = todayEvents.find(e => e.id === eventId)
    const nowMins = new Date().getHours() * 60 + new Date().getMinutes()
    const endMins = ev?.end_time ? (() => { const [h, m] = ev.end_time.split(':').map(Number); return (h || 0) * 60 + (m || 0) })() : null
    const finishingEarly = endMins != null && nowMins < endMins
    setFinishConfirm({ eventId, early: finishingEarly, endTime: (ev?.end_time || '').slice(0, 5) })
  }
  const doFinishEvent = async (eventId: string) => {
    setFinishConfirm(null)
    try {
      // EVENT status → 'closed' only; existing orders stay visible/actionable on the KDS.
      const res = await fetch('/api/events/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action: 'close', eventId, payload: {} }) })
      const data = await res.json()
      if (data?.queued) { setPendingSyncCount(c => c + 1); setShowEventMenu(false); return }
      if (!res.ok) throw new Error(data.error)
      setTodayEvents(prev => prev.map(e => e.id === eventId ? { ...e, status: 'closed' as const, closed_at: new Date().toISOString() } : e))
      setShowEventMenu(false); showKdsToast('Event finished')
      fetchAllRef.current() // re-sync so the status flips to "Finished" immediately
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
      fetchAllRef.current() // re-sync so the cancelled event drops out immediately
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

  // activeEvent + activeEventLive resolved once near the top (above the heartbeat effect).
  activeEventIdRef.current = activeEvent?.id ?? null // keep the ref current for the pause/wait callbacks
  const recentlyClosed = !!(activeEvent?.status === 'closed' && activeEvent.closed_at && Date.now() - new Date(activeEvent.closed_at).getTime() < 10 * 60 * 1000)

  const isPaused = pausedUntil ? new Date(pausedUntil) > new Date() : false

  const kdsMode = truck?.kds_mode ?? false
  const displayMode = truck?.display_mode ?? 'list'
  const { can } = useFeatures(truck)

  // Session-only overrides — URL param / DB setting is the default.
  // Stage 1 (order-ready redesign): the cooking step is now ALWAYS on, so the cook view is gated on the
  // Max-plan feature ONLY — DE-COUPLED from show_cooking_step (was `can('cook_screen') && showCookingStep`).
  // To re-add the "Show cooking step" toggle later, restore `&& showCookingStep` here (and at :629).
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

  // Grid (BOTH views, now equally dense) shows up to 8; list views are uncapped (slice n/a below).
  const MAX_GRID_VISIBLE = activeLayout === 'grid' ? 8 : 6
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
        {/* Back to the orders dashboard — staff are auto-routed to KDS on login and otherwise have no
            way back to place orders. Unconditional (all roles): /dashboard/[token] has no staff block,
            so this can't loop. Label collapses to just ← on narrow widths to avoid crowding. */}
        <a
          href={`/dashboard/${token}`}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
        >
          <span aria-hidden>←</span>
          <span className="hidden sm:inline">Dashboard</span>
        </a>
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
          {/* Stage 1: Cook tab gated on the Max-plan feature ONLY (cooking always-on; de-coupled from
              show_cooking_step — restore `&& showCookingStep` to re-add the toggle). */}
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

        {/* Sound toggle — per-device new-order ding. Enabling is a gesture → prime the audio so dings play. */}
        <button
          onClick={() => setSoundEnabled(v => { const next = !v; if (next) primeAudio(); return next })}
          title={soundEnabled ? 'Sound on' : 'Sound off'}
          className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${
            soundEnabled ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'
          }`}
        >
          {soundEnabled ? '🔔' : '🔕'}
        </button>

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
        {activeEvent?.status === 'open' && (
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
        )}

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
              {event.venue_name.split(',')[0]} {formatTime(event.start_time)}{event.status === 'open' ? ' ●' : ''}
            </button>
          ))}
        </div>
      )}

      {/* ── Start Event banner ── */}
      {activeEvent?.status === 'confirmed' && !activeEvent.auto_open && (
        <div className="bg-white border-2 border-teal-500 m-3 rounded-2xl p-5 text-center flex-shrink-0">
          <div className="text-base font-semibold text-slate-900 mb-1">📍 {activeEvent.venue_name}</div>
          <div className="text-sm text-slate-500 mb-3">Today · {formatTimeRange(activeEvent.start_time, activeEvent.end_time)}</div>
          <button onClick={() => openEvent(activeEvent.id)}
            className="w-full bg-teal-600 text-white font-bold py-3 rounded-xl text-base hover:bg-teal-700 active:scale-[0.98] transition-all">
            Start Event
          </button>
        </div>
      )}

      {/* ── Event header when open ── */}
      {activeEvent?.status === 'open' && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
            <span className="text-sm font-medium text-slate-900 truncate">{activeEvent.venue_name}</span>
            <span className="text-xs text-slate-400 flex-shrink-0">{formatTimeRange(activeEvent.start_time, activeEvent.end_time)}</span>
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
          <span className="text-sm text-slate-600">Event finished · {activeEvent.venue_name} ended at {formatTime(activeEvent.end_time)}</span>
          <button onClick={() => extendEvent(activeEvent.id, 30)} className="text-sm font-medium text-teal-600 hover:text-teal-700 ml-3 flex-shrink-0">Extend 30 min</button>
        </div>
      )}

      {/* ── Main layout ── */}
      <div className="flex flex-1 min-h-0">

        {/* ── Queue panel ── */}
        <div className="flex flex-col flex-1 min-w-0 overflow-y-auto">
        <div
          className={
            activeLayout === 'grid'
              // BOTH views' grid use the SAME compact auto-fill density (see style below). Window
              // dropped its fixed `grid-cols-2 xl:grid-cols-3` (≈3 wide cards) to match Cook's ≈4-across.
              ? 'grid gap-3 items-stretch p-3'
              : 'flex flex-col gap-3 p-3'
          }
          style={activeLayout === 'grid'
            ? { gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }
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
                key={order.order_key}
                order={order}
                truck={truck}
                event={activeEvent}
                slots={[]}
                actionLoading={actionLoading}
                onAction={handleAction}
                onEdit={() => {}}
                viewMode={cardViewMode}
                kdsMode={kdsMode}
                showCookingStep={showCookingStep}
                categoryOrder={categoryOrder}
                itemCategoryMap={itemCategoryMap}
                pendingSync={pendingSync.has(order.order_key)}
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
                <div key={o.order_key} className="flex justify-between items-center py-1 text-xs text-slate-400 border-t border-slate-100">
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
                  ? `${vansWithAutoPause.join(', ')} ${vansWithAutoPause.length === 1 ? 'has' : 'have'} offline detection enabled. If the screen turns off, the device may stop sending its online signal and customer ordering may be paused.`
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
              <button onClick={() => finishEvent(activeEvent.id)} className="w-full bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl hover:bg-slate-200 text-sm">Finish event</button>
              <button onClick={() => cancelEventFromMenu(activeEvent.id)} className="w-full bg-red-50 text-red-600 font-bold py-2.5 rounded-xl hover:bg-red-100 border border-red-200 text-sm">Cancel event</button>
            </div>
          </div>
        </div>
      )}

      {/* Finish-event confirm (styled — replaces window.confirm). Stacks above the event menu; early
          close warns harder. z-[60] so it sits over the event menu modal. */}
      {finishConfirm && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="font-black text-slate-900 text-base mb-1">End event?</h3>
            <p className="text-sm text-slate-600">
              {finishConfirm.early
                ? `This event isn't scheduled to finish until ${finishConfirm.endTime}. No more orders will be allowed. Confirm to end event?`
                : 'Finish this event? No more orders will be taken.'}
            </p>
            <div className="flex gap-2 mt-5">
              <button onClick={() => doFinishEvent(finishConfirm.eventId)} className="flex-1 bg-red-600 text-white font-black text-sm py-2.5 rounded-xl hover:bg-red-700">Yes</button>
              <button onClick={() => setFinishConfirm(null)} className="flex-1 bg-slate-100 border border-slate-200 text-slate-700 font-bold text-sm py-2.5 rounded-xl hover:bg-slate-200">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {kdsToast && (
        <div className="fixed bottom-6 left-4 right-4 max-w-sm mx-auto rounded-xl px-4 py-3 text-sm font-bold text-center shadow-xl z-50 bg-green-600 text-white">
          {kdsToast}
        </div>
      )}

      {/* Shared stacked toast system — the ready-undo toasts (the event-lifecycle kdsToast above stays
          as-is; they rarely coincide). */}
      <ToastStack toasts={toasts} dismissToast={dismissToast} />
    </div>
  )
}
