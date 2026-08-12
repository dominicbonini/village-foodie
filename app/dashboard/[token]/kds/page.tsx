'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Preferences } from '@capacitor/preferences'
import { useParams, useSearchParams } from 'next/navigation'
import { OrderCard } from '@/components/dashboard/OrderCard'
import { BuzzerGrid } from '@/components/dashboard/BuzzerGrid'
import { applyPendingBuzzers, echoedBuzzerKeys, resolveCurrentBuzzer, planOptimisticBuzzer, buzzerPill } from '@/lib/buzzer'
import { KeepAwakePrompt } from '@/components/dashboard/KeepAwakePrompt'
import { AppLink } from '@/components/native/AppLink'   // internal-route anchor: soft-nav in native, plain <a> on web
import { isDemoIdentifier } from '@/lib/demo'
import { DemoModeBanner } from '@/components/DemoModeBanner'
import { DemoGetStarted } from '@/components/DemoGetStarted'
import { useToasts } from '@/lib/useToasts'
import { useReadyEmailUndo } from '@/lib/useReadyEmailUndo'
import { ToastStack } from '@/components/ToastStack'
import { getAllDayCounts } from '@/components/dashboard/helpers'
import { supabaseBrowser } from '@/lib/supabase-browser'
import type { Order, TruckData, TruckEvent, SoundConfig } from '@/components/dashboard/types'
import { DEFAULT_SOUND_CONFIG } from '@/components/dashboard/types'
import { getOrderBalance, hasUnrecordedPayment, type LedgerRow } from '@/lib/payments/ledger'
import { resolvePaidStep } from '@/lib/payments/paid-step'
import type { CatConfig } from '@/lib/prep-utils'
import { useFeatures } from '@/lib/useFeatures'
import { keepAwake, prepareKeepAwake, allowSleep, subscribeWakeState, type WakeState } from '@/lib/native/keepAwake'
import { readSoundConfig, seedSoundConfig, effectiveSoundConfig } from '@/lib/sound-prefs'
import { formatTime, formatTimeRange } from '@/lib/time-utils'
import { getNetworkStatus, addNetworkListener } from '@/lib/native/network'
import { requestNotificationPermission } from '@/lib/native/notifications'
import { installAudioUnlock, primeAudio, playNewOrder } from '@/lib/audio'
import { configureStatusBar } from '@/lib/native/statusBar'
import { registerServiceWorker, addSWMessageListener } from '@/lib/native/serviceWorker'
import { countOps, removePendingStatusOp } from '@/lib/native/outbox'
import { isNativeApp, setLastScreen } from '@/lib/native/device'
import { gatedAction, STATUS_REPLAY_EXPECTED_FROM } from '@/lib/native/orderGate'
import { isOnline } from '@/lib/native/reachability'
import { mergeOrders } from '@/lib/orders/mergeOrders'
import { useOfflineStatusOverlay } from '@/lib/native/useOfflineStatusOverlay'
import { OfflineBanner } from '@/components/native/OfflineBanner'
import { useOutboxConflicts } from '@/lib/native/useOutboxConflicts'
import { WebOfflineBanner } from '@/components/WebOfflineBanner'
import { nativeAuthHeader } from '@/lib/native/session'
import { ThisDeviceSettings } from '@/components/native/OperatorDeviceConfig'
import { AppLockGate } from '@/components/native/AppLockGate'

// View mode driven by ?view= query param
// /kds           → window view (default, for the main iPad at the hatch)
// /kds?view=cook → cook view (for a second tablet facing into the kitchen)
type KdsView = 'window' | 'cook'

export default function KdsPage() {
  const { token } = useParams<{ token: string }>()
  // DEMO MODE — same signal, same source as the dashboard and proxy.ts: the `demo-` token prefix
  // (lib/demo.ts). This route runs on the DASHBOARD token, so the check is identical here.
  // The KDS is demo-ABLE rather than blocked: placing a customer order and watching the ticket land on the
  // kitchen screen is part of the loop we want a prospect to see. Only configuration is hidden below.
  const isDemo = isDemoIdentifier(token)
  // FIX 2 — one-time explainer the FIRST time a demo visitor opens the kitchen screen. A prospect arriving
  // here from the dashboard has no idea what a KDS is for; without a sentence of context it reads as "the
  // same orders again, differently". Remembered per token so it never nags. Lazy initialiser (not an
  // effect) so it's decided on first render — no flash of the popup for someone who already dismissed it.
  const [showKdsIntro, setShowKdsIntro] = useState(() => {
    if (typeof window === 'undefined') return false
    if (!isDemoIdentifier(token)) return false
    try { return localStorage.getItem(`hg_demo_kds_intro_${token}`) !== 'seen' } catch { return true }
  })
  const dismissKdsIntro = () => {
    try { localStorage.setItem(`hg_demo_kds_intro_${token}`, 'seen') } catch { /* private mode — asks again */ }
    setShowKdsIntro(false)
  }
  const searchParams = useSearchParams()
  const kdsView: KdsView = searchParams.get('view') === 'cook' ? 'cook' : 'window'
  const vanId = searchParams.get('van_id') ?? ''
  const vanName = searchParams.get('van_name') ?? ''

  // Native: remember this device is on KDS so a cold-launch reopens here (restart-to-last-screen, §33).
  useEffect(() => { if (isNativeApp()) setLastScreen('kds') }, [])

  const [truck, setTruck] = useState<TruckData | null>(null)
  // Van-level "show cooking step" preference (Settings). Gates the cook view's "Start
  // cooking" button. Defaults off (matches the Settings toggle default) until loaded.
  const [showCookingStep, setShowCookingStep] = useState(false)
  // 🔴 Order keys with a live, UNCAPTURED card authorisation — resolved server-side once per load and
  // read, never derived. See lib/payments/held-authorisation.ts.
  const [heldAuthorisations, setHeldAuthorisations] = useState<Set<string>>(new Set())
  const [orders, setOrders] = useState<Order[]>([])
  // ── THE PAYMENT LEDGER ROWS (order_key → order_payments rows) ───────────────────────────────────
  // 🔴 PREREQUISITE, NOT A FEATURE. Without this the KDS rendered OrderCard with no `ledgerRows`, so
  // getOrderBalance(order, undefined ?? []) resolved EVERY order to {paidMinor:0, status:'unpaid'} —
  // a fully-paid online order included. Latent only because show_paid_step gates every payment-derived
  // element to null; one tap on the per-event override made it live (docs/kds-payment-report.md).
  // The rows RIDE ALONG on the /api/dashboard response the KDS already fetches (route.ts:~199/610,
  // keyed by order_key and already van-scoped) — this surface simply discarded them at setState time.
  // No extra query, no new endpoint, nothing added to the 60s poll.
  const [payments, setPayments] = useState<Record<string, LedgerRow[]>>({})
  // Order keys whose ledger write is on record as having FAILED. Same server-derived signal the
  // dashboard reads, so the two surfaces cannot disagree about which orders are missing money.
  // Paired with the live balance by hasUnrecordedPayment — never used alone (see that function).
  const [paymentFailures, setPaymentFailures] = useState<Set<string>>(new Set())
  // Buzzers (phase 1, online only). buzzerCount null ⇒ this van has no buzzers → no chip, no grid.
  const [buzzerCount, setBuzzerCount] = useState<number | null>(null)
  const [buzzerTarget, setBuzzerTarget] = useState<Order | null>(null)
  const [savingBuzzer, setSavingBuzzer] = useState(false)
  // ── OPTIMISTIC BUZZER GUARD ─────────────────────────────────────────────────────────────────────
  // The dashboard keeps these in its shared pendingWritesRef under `buzzer:${order_key}`; the KDS has
  // no such shared ref, so it owns a dedicated one. The MECHANISM is identical and both feed the same
  // two helpers in lib/buzzer.ts, which is what keeps the two surfaces behaving the same.
  // Absent ⇒ no guard; present-with-null ⇒ a pending DESELECT. Do not collapse those two.
  const pendingBuzzersRef = useRef<Record<string, number | null>>({})
  const peekPendingBuzzer = useCallback((orderKey: string) => pendingBuzzersRef.current[orderKey], [])
  const [pausedUntil, setPausedUntil] = useState<string | null>(null)
  const [extraWaitMins, setExtraWaitMins] = useState(0)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [categoryOrder, setCategoryOrder] = useState<string[]>([])
  const [itemCategoryMap, setItemCategoryMap] = useState<Record<string, string>>({})
  const [catConfigs, setCatConfigs] = useState<Record<string, CatConfig>>({})

  // PIN auth — same pattern as main dashboard
  // Operators can bake the PIN into the bookmark URL: /kds?pin=1234
  const [pin, setPin] = useState(() => searchParams.get('pin') ?? '')
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [requiresPin, setRequiresPin] = useState(false)

  // PER-DEVICE keep-screen-on pref (mirrors sound + the dashboard). Lazy initializer reads localStorage
  // SYNCHRONOUSLY at first paint (SSR-guarded) so the KeepAwakePrompt can't flash. KDS previously read the
  // truck DB column even on native — this is its first per-device path. Default ON.
  // Per-device keep-screen-on pref — SAME rule as the dashboard (see its comment for the full reasoning):
  // operators default ON (opt-out), demo defaults OFF (opt-in) so KeepAwakePrompt never renders unasked on
  // a demo. The Screen on/off toggle stays fully functional either way.
  const [keepScreenOn, setKeepScreenOn] = useState(() => {
    if (typeof window === 'undefined') return !isDemo
    const pref = localStorage.getItem(`hg_keepawake_${token}`)
    return isDemo ? pref === 'on' : pref !== 'off'
  })
  // ACTUAL keep-awake state, not intent — so the KDS Screen chip can't lie. No grace needed: with
  // gesture-based acquisition the lock stays 'off' (optimistic) until first tap, so there's no mount-denial.
  const [wakeState, setWakeState] = useState<WakeState>('off')
  useEffect(() => subscribeWakeState(setWakeState), [])
  const [showScreenOffWarning, setShowScreenOffWarning] = useState(false)
  const [vansWithAutoPause, setVansWithAutoPause] = useState<string[]>([])
  const [viewOverride, setViewOverride] = useState<'window' | 'cook' | null>(null)
  const [layoutOverride, setLayoutOverride] = useState<'list' | 'grid' | null>(null)
  // ── "TAKE PAYMENTS ON THIS DEVICE" — PER-DEVICE, CAPACITOR PREFERENCES ──────────────────────────
  // 🔴 PER DEVICE, DELIBERATELY — NOT a trucks column and NOT a per-event override. Two iPads on one
  // truck must be able to disagree: the window iPad takes money, the grill iPad never shows a price it
  // could be asked about. A truck-level flag cannot express that, and a per-event one expresses the
  // wrong axis entirely (it is a property of WHERE THE DEVICE SITS, not of the pitch).
  //
  // ⚠️ CAPACITOR PREFERENCES, NOT localStorage, UNLIKE the view/layout/sound prefs beside it. Those
  // predate the native shell. Preferences persists to UserDefaults on iOS, which survives the hard
  // navigations and cold-kills that can hand a WKWebView a fresh localStorage (the reasoning is written
  // out in lib/native/preferencesStorage.ts). On web the plugin falls back to localStorage, so a browser
  // KDS persists too. This toggle changes which orders LEAVE THE BOARD, so losing it silently is worse
  // than losing a list/grid preference.
  //
  // Keyed by token like every other KDS device pref, so two trucks on one iPad do not collide.
  // null = not read yet. Resolved as NOT-on (see `hidePayments`): the safe direction is to withhold
  // money UI for a frame, never to flash it on a device configured not to show it.
  const [showPaymentsPref, setShowPaymentsPref] = useState<boolean | null>(null)
  // New-order SOUND pref — per DEVICE (localStorage, not DB), default ON. A ref mirrors it for the
  // realtime INSERT callback (set up once), which reads the CURRENT pref without re-subscribing.
  const [soundEnabled, setSoundEnabled] = useState(true)
  const soundEnabledRef = useRef(true)
  // Per-truck sound policy, mirrored to a ref so the realtime callback (a stale closure) reads the
  // current value. The header toggle stays the per-device MASTER; this is WHICH new orders ding.
  const soundConfigRef = useRef<SoundConfig>(DEFAULT_SOUND_CONFIG)
  // PER-DEVICE sound CONFIG (V9.5) — the SAME localStorage key the dashboard uses (hg_soundcfg_${token}),
  // so "which sounds fire" is one concept in one place on this device. Lazy initializer, SSR-guarded.
  // null = never seeded; the effect below seeds it from trucks.sound_config once the payload arrives.
  const [storedSoundCfg, setStoredSoundCfg] = useState<SoundConfig | null>(
    () => (typeof window === 'undefined' ? null : readSoundConfig(token)),
  )
  const [deviceOpen, setDeviceOpen] = useState(false)   // "This device" sheet (native-only)
  const [isOffline, setIsOffline] = useState(false)
  const [pendingSyncCount, setPendingSyncCount] = useState(0)
  const [pendingSync, setPendingSync] = useState<Set<string>>(new Set())
  // FIX 2 — durable offline pending-status overlay (shared with the dashboard). Optimistic advances live in
  // the outbox, applied at render over the merged orders, HELD until the server reflects the status (no
  // reconnect flash). Web/non-native → empty → no-op. dropEntry = the offline UNDO.
  const { overlay: kdsOverlay, refresh: refreshPendingStatus, dropEntry: dropOverlayEntry } = useOfflineStatusOverlay(orders)
  // ── THE CONFLICT SIGNAL ──────────────────────────────────────────────────────────────────────────
  // 🔴 ONE source for BOTH the banner and the per-order card marker, so they cannot disagree. The KDS
  // fetches the SAME /api/dashboard order set as the dashboard, so it CAN resolve display ids — see
  // resolveConflictLabel. ⚠️ It renders only `visibleOrders`, so a conflicted order that is filtered out
  // of the columns is NAMED by the banner but carries no card marker on this surface.
  const { conflicts: outboxConflicts, byOrderKey: conflictByOrder, acknowledge: acknowledgeConflicts } = useOutboxConflicts()
  const resolveConflictLabel = useCallback((c: { order_key: string; provisional_id: string }) => {
    const o = orders.find(x => x.order_key === c.order_key)
    return o ? `#${o.id}` : (c.provisional_id ? `#${c.provisional_id}` : null)
  }, [orders])
  const [todayEvents, setTodayEvents] = useState<TruckEvent[]>([])
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [showEventMenu, setShowEventMenu] = useState(false)
  // Styled "finish event" confirm (replaces window.confirm). early → harder warning naming the end.
  const [finishConfirm, setFinishConfirm] = useState<{ eventId: string; early: boolean; endTime: string } | null>(null)
  const [eventNoteInput, setEventNoteInput] = useState('')
  const [kdsToast, setKdsToast] = useState<string | null>(null)

  const fetchAllRef = useRef<() => void>(() => {})
  /** Assigned just below handleAction — see the note there for why the retry goes through a ref. */
  const handleActionRef = useRef<(action: string, orderKey: string) => Promise<void>>(async () => {})
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
      const res = await fetch(`/api/dashboard?${params}`, { headers: await nativeAuthHeader() })
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
      // Buzzers: the VAN's rack size, resolved server-side (lib/buzzer.ts). Null ⇒ this van has no
      // buzzers and the chip is never rendered. The KDS does NOT read effectiveBuzzerPrompt — the
      // after-order prompt belongs to Add Order, which the KDS does not have.
      setBuzzerCount(data.vanBuzzerCount ?? null)
      // keep_screen_on is a PER-DEVICE localStorage pref now (see the keepScreenOn useState) — not read from
      // the truck row (which never carried it in the /api/dashboard map anyway).
      // Buzzer guard: release against the RAW SERVER ROWS first, then apply what is still pending over
      // the merge so a poll that started before a write cannot revert an open grid. See lib/buzzer.ts.
      const incomingOrders = data.orders ?? []
      for (const k of echoedBuzzerKeys(incomingOrders, peekPendingBuzzer)) delete pendingBuzzersRef.current[k]
      setOrders(prev => applyPendingBuzzers(mergeOrders(prev, incomingOrders), peekPendingBuzzer))
      setPausedUntil(data.truck?.paused_until ?? null)
      setExtraWaitMins(data.truck?.extra_wait_mins ?? 0)
      setCategoryOrder(data.categoryOrder ?? [])
      setItemCategoryMap(data.itemCategoryMap ?? {})
      setCatConfigs(data.catConfigs ?? {})
      // Guarded on `!== undefined` — the SAME shape the dashboard uses (page.tsx:~710). An older server
      // that does not send the field leaves the previous map intact rather than blanking every card to
      // unpaid; a server that sends an EMPTY map (the payments query failed, route.ts logs it) still
      // clears it, because that is a real "no rows this poll" and must not be masked by a stale copy.
      if (data.payments !== undefined) setPayments(data.payments || {})
    if (data.heldAuthorisations !== undefined) setHeldAuthorisations(new Set<string>(data.heldAuthorisations || []))
      // ⚠️ Guarded separately, like every sibling: a partial refresh must not clear it.
      if (data.heldAuthorisations !== undefined) setHeldAuthorisations(new Set<string>(data.heldAuthorisations || []))
      if (data.paymentFailures !== undefined) setPaymentFailures(new Set<string>(data.paymentFailures || []))
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

  // ── LOAD + PERSIST "take payments on this device" ───────────────────────────────────────────────
  // Read ONCE on mount. Deliberately NOT a lazy useState initialiser like the localStorage prefs above —
  // Preferences.get is async and cannot be read synchronously at first render. That is not a hazard here:
  // the whole board is gated behind `loading`, which does not clear until the /api/dashboard round-trip
  // returns, and a native-storage read beats a network fetch. Should it ever lose that race, `null`
  // resolves to NOT-on, which withholds money UI rather than flashing it. Never the unsafe direction.
  // A read failure (plugin missing, private mode) lands on `false` = OFF = today's behaviour.
  useEffect(() => {
    let cancelled = false
    void Preferences.get({ key: `hg_kds_payments_${token}` })
      .then(({ value }) => { if (!cancelled) setShowPaymentsPref(value === 'on') })
      .catch(() => { if (!cancelled) setShowPaymentsPref(false) })
    return () => { cancelled = true }
  }, [token])

  // Write-through on toggle. State first so the board responds to the tap immediately; the persist is
  // fire-and-forget because a failed write costs the operator a re-tap next session, not this one.
  const togglePayments = useCallback((next: boolean) => {
    setShowPaymentsPref(next)
    void Preferences.set({ key: `hg_kds_payments_${token}`, value: next ? 'on' : 'off' }).catch(() => {})
  }, [token])

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
  // 🔴 SEED-ON-FIRST-LOAD — identical rule to the dashboard: only when this device has nothing stored
  // AND the truck's value has actually arrived. Never seed from the hardcoded default in the pre-load
  // window; that would reset a truck that configured sound deliberately.
  useEffect(() => {
    if (storedSoundCfg !== null) return
    if (truck?.sound_config === undefined) return
    setStoredSoundCfg(seedSoundConfig(token, truck.sound_config))
  }, [storedSoundCfg, truck?.sound_config, token])
  // The trigger reads a ref (it runs inside a realtime callback), so keep it pointed at the resolved
  // per-device value rather than the truck column.
  useEffect(() => {
    soundConfigRef.current = effectiveSoundConfig(storedSoundCfg, truck?.sound_config)
  }, [storedSoundCfg, truck?.sound_config])

  useEffect(() => {
    configureStatusBar()
    // 🔴 NO `prepareKeepAwake()` HERE — it used to run UNCONDITIONALLY on mount, before anything had read
    // the operator's setting. The [keepScreenOn] effect below runs on mount too and is the single owner of
    // acquire/release; this effect owns the status bar only.
    //
    // 🚫 NO `return () => { allowSleep() }` HERE. An unmount release was added on 5 August 2026 and
    // WITHDRAWN the same day, because it answered the wrong question.
    //
    // ✅ PERSISTENCE ACROSS CLIENT-SIDE ROUTES IS CORRECT, and this restores the 2026-07-28 decision.
    // keep-awake is a DEVICE preference (hg_keepawake_${token}) meaning "this screen stays on" — NOT
    // "stays on while the KDS is mounted". An operator who steps into Manage mid-service to fix a price
    // must not come back to a slept screen. Unmount is the operator moving BETWEEN screens; it is not
    // them finishing with the app, and releasing there treats a navigation as an exit.
    // ⚠️ It was measurably worse than the bug it was meant to fix: on WEB the re-acquire is a no-op
    // (Safari needs a user activation, so prepareKeepAwake only sets intent), so every dashboard↔KDS hop
    // dropped the lock and demanded a tap to get it back. See docs/keepawake-report.md.
    //
    // 🔴 THE RELEASE PATH STILL HAS TO EXIST — that part of the original finding stands. iOS's
    // UIApplication.shared.isIdleTimerDisabled is PROCESS-WIDE: it survives backgrounding, teardown and
    // route changes, and nothing in the OS clears it. So the lock is released on the events that mean the
    // operator no longer wants the screen held — the SETTING going off, and the app being BACKGROUNDED
    // (a module-level visibilitychange listener in lib/native/keepAwake.ts, which is why it keeps working
    // no matter which route is mounted). Ownership belongs to the setting, never to a component.
  }, [])

  // Single owner of acquire/release. `prepareKeepAwake` now takes the SETTING, so an unconditional call is
  // a compile error rather than something review has to notice.
  useEffect(() => {
    prepareKeepAwake(keepScreenOn)
  }, [keepScreenOn])

  useEffect(() => {
    requestNotificationPermission()
  }, [])

  useEffect(() => {
    getNetworkStatus().then(s => setIsOffline(s === 'offline'))
    const remove = addNetworkListener(s => {
      setIsOffline(s === 'offline')
      if (s === 'online') countOps().then(setPendingSyncCount)
    })
    return remove
  }, [])

  useEffect(() => {
    registerServiceWorker()
    countOps().then(setPendingSyncCount)
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
    // (Package 5 dupe removal) Order NOTIFICATIONS are now sent SERVER-side via APNs — the SOLE source,
    // firing whether the app is foreground/background/closed. The webview no longer schedules a local
    // notification here. The realtime INSERT handler below still plays the in-app SOUND for a foregrounded
    // operator (UI feedback, not a notification → no dupe). Count tracking retained (harmless).
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
        // NEW-ORDER sound, gated on master (per-device) && per-truck config.new_orders:
        //   'all' → confirmed OR pending · 'needs_confirming' → pending only · 'off' → never.
        const mode = soundConfigRef.current.new_orders
        const st = payload.new?.status
        const wanted = mode === 'all' ? (st === 'confirmed' || st === 'pending')
          : mode === 'needs_confirming' ? st === 'pending'
          : false
        if (soundEnabledRef.current && payload.eventType === 'INSERT' && wanted) {
          playNewOrder()   // in-app SOUND only (Web Audio, works in the webview foreground); notification is the server APNs push
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

  // BINARY UI: green only when actually held; grey otherwise. The KeepAwakePrompt banner carries the
  // plain-English prompt/failure copy; no toast needed here.
  const screenHeld = wakeState === 'held' || wakeState === 'native'
  const applyKeepScreenOn = async (value: boolean): Promise<WakeState> => {
    setKeepScreenOn(value)
    let st: WakeState = 'off'
    if (value) { st = await keepAwake() } else { await allowSleep() }
    // PER-DEVICE pref (localStorage, per-token) — mirrors sound + the dashboard. No DB round-trip; read
    // synchronously on mount so the KeepAwakePrompt can't flash for an operator who turned it off.
    try { localStorage.setItem(`hg_keepawake_${token}`, value ? 'on' : 'off') } catch {}
    return st
  }
  // 🔴 BRANCHES ON THE SETTING, NOT ON `wakeState`. It used to test `screenHeld`, so once belief diverged
  // from reality — a failed release publishing 'off' while the OS flag stayed set — every tap took the
  // ENABLE branch and the operator could not turn the screen off at all. `wakeState` may DISPLAY; it must
  // never DECIDE. (`screenHeld` still drives the green/grey chip and the KeepAwakePrompt.)
  const toggleKeepScreenOn = async () => {
    if (keepScreenOn) {   // setting is ON → turning OFF
      if (truck?.id) {
        try {
          const { data: vans } = await supabaseBrowser.from('truck_vans').select('name,auto_pause_on_offline').eq('truck_id', truck.id).eq('active', true)
          const autoPauseVans = (vans || []).filter((v: any) => v.auto_pause_on_offline).map((v: any) => v.name)
          if (autoPauseVans.length > 0) { setVansWithAutoPause(autoPauseVans); setShowScreenOffWarning(true); return }
        } catch {}
      }
      await applyKeepScreenOn(false)
    } else {            // grey → turning ON / retry (this tap is the gesture; the banner reflects the outcome)
      await applyKeepScreenOn(true)
    }
  }
  const confirmScreenOff = async () => { setShowScreenOffWarning(false); await applyKeepScreenOn(false) }

  // Shared stacked-toast + ready-email-undo machinery (the SAME modules the dashboard uses). KDS passes
  // NO onUndoRestore — it has no prep pills; undo just reverts status and the order re-appears in cookOrders
  // on refetch. The hook's beforeunload/unmount sendBeacon flush runs on KDS's lifecycle for free.
  const { toasts, showToast, dismissToast } = useToasts()
  const { scheduleReadyEmail, undoReady } = useReadyEmailUndo({ token, pin, showToast, refetch: () => fetchAllRef.current() })

  // ── THE BUZZER WRITE (KDS) ───────────────────────────────────────────────────────────────────────
  // Mirrors the dashboard's saveBuzzer exactly. 🔴 NOT the `edit` action (which forces
  // status:'modified', re-books capacity and emails the customer).
  // ✅ PHASE 2 — through gatedAction, kind:'buzzer', with the same queued-only replay marker and
  // placed_at. The reasoning is recorded on the dashboard copy and in lib/native/outbox.ts.
  // keepOpen ⇒ the order already had a buzzer when the picker opened, so a change leaves it up and Done
  // closes it. `prior` is read from the LIVE orders list because buzzerTarget is the snapshot taken
  // when the chip was tapped. Both mirror the dashboard copy of this handler.
  const saveBuzzer = useCallback(async (orderKey: string, buzzerNumber: number | null, keepOpen = false) => {
    const prior = orders.find(o => o.order_key === orderKey)?.buzzer_number ?? null
    // OPTIMISTIC — guard FIRST, then patch, so a refetch already in flight is overridden rather than
    // winning. Mirrors the dashboard exactly; the reasoning is in lib/buzzer.ts.
    // Full local effect (this order gains it, any other in-event holder loses it) — mirrors the two
    // rows assignBuzzer touches server-side. Identical to the dashboard; the plan is shared.
    const { next, prior: priorByKey } = planOptimisticBuzzer(orders, orderKey, buzzerNumber)
    for (const [k, v] of Object.entries(next)) pendingBuzzersRef.current[k] = v
    setOrders(prev => prev.map(o => o.order_key in next ? { ...o, buzzer_number: next[o.order_key] } : o))
    setSavingBuzzer(true)
    try {
      const placedAt = orders.find(o => o.order_key === orderKey)?.placed_at ?? null
      const result = await gatedAction({
        url: '/api/dashboard/action',
        body: { token, pin, action: 'set_buzzer', order_key: orderKey, buzzerNumber },
        kind: 'buzzer', order_key: orderKey, online: isOnline(),
        queuedExtra: { replay: true, placedAt },
      })
      if (result.queued) {
        // Queued durably. The optimistic guard HOLDS until replay — dropping it would let the next poll
        // revert a pager that is already in a customer's hand.
        showToast(buzzerNumber == null
          ? `Buzzer ${prior ?? ''} removed — saved on this device, will sync when back online`
          : `Buzzer ${buzzerNumber} saved on this device — will sync when back online`)
        if (!keepOpen) setBuzzerTarget(null)
        setSavingBuzzer(false)
        return
      }
      const data = result.data ?? {}
      if (!result.ok) throw new Error(data.error || 'write failed')
      const from = data.clearedFrom?.id ? ` (taken from #${data.clearedFrom.id})` : ''
      // Names the number that went back to the rack — see the dashboard copy of this handler.
      showToast(buzzerNumber == null
        ? (prior != null ? `Buzzer ${prior} removed` : 'Buzzer removed')
        : `Buzzer ${buzzerNumber} assigned${from}`)
      if (!keepOpen) setBuzzerTarget(null)
      // Guard released by fetchAll, and only once the SERVER row carries the value — see the dashboard.
      fetchAllRef.current()
    } catch {
      // FAILED — drop the guard, revert, and SAY SO. Same contract as the dashboard: the operator may
      // already be holding the pager, so the toast names the number and the order's real state.
      for (const k of Object.keys(next)) delete pendingBuzzersRef.current[k]
      setOrders(prev => prev.map(o => o.order_key in priorByKey ? { ...o, buzzer_number: priorByKey[o.order_key] } : o))
      const who = buzzerTarget?.id ? `order #${buzzerTarget.id}` : 'this order'
      showToast(buzzerNumber == null
        ? `Could not remove buzzer ${prior} — it is still on ${who}`
        : `Could not give buzzer ${buzzerNumber} to ${who} — ${prior != null ? `it still has buzzer ${prior}` : 'it still has no buzzer'}`, 'error')
    } finally { setSavingBuzzer(false) }
  }, [token, pin, showToast, orders, buzzerTarget])

  const handleAction = useCallback(async (action: string, orderKey: string) => {
    setActionLoading(`${action}-${orderKey}`)
    try {
      // Through the offline GATE: online → normal write; offline (native, unreachable) → durable outbox +
      // queued result. `expected_from` guards the eventual replay (customer-cancel-wins), riding only on the
      // queued op so the online request is byte-identical.
      const result = await gatedAction({
        url: '/api/dashboard/action',
        // 'ready' defers the customer email so the undo toast can cancel it (mirrors the dashboard).
        body: { token, pin, action, order_key: orderKey, ...(action === 'ready' ? { defer_email: true } : {}) },
        kind: 'status', order_key: orderKey, online: isOnline(), expectedFrom: STATUS_REPLAY_EXPECTED_FROM,
      })
      if (result.queued) {
        // QUEUED OFFLINE → the ready did NOT commit server-side. Do NOT schedule the customer email (a phantom
        // email must not fire for an uncommitted ready). Advance the KDS board via the DURABLE outbox overlay
        // (FIX 2) — refreshPendingStatus reflects the just-queued op instantly; the overlay outlives reads and
        // is held until the server reflects it. Shared with the dashboard so the two surfaces never diverge.
        refreshPendingStatus()
        setPendingSyncCount(c => c + 1)
        setPendingSync(prev => new Set(prev).add(orderKey))
        setActionLoading(null)
        // OFFLINE UNDO (ISSUE 1) for 'ready' (matching KDS's online undo affordance): remove the still-pending
        // op → the overlay reverts as-if-never-happened; if it already synced, fall back to the online undo.
        if (action === 'ready') {
          const num = orders.find(o => o.order_key === orderKey)?.id ?? ''
          const offlineUndo = async () => {
            const removed = await removePendingStatusOp(orderKey)
            if (removed) {
              dropOverlayEntry(orderKey); refreshPendingStatus()
              setPendingSync(prev => { const n = new Set(prev); n.delete(orderKey); return n }); setPendingSyncCount(c => Math.max(0, c - 1))
              showToast(`Order #${num} reverted`)
            } else { undoReady(orderKey, num) }
          }
          showToast(`Order #${num} saved on this device — will sync when back online`, 'success', { duration: 7000, action: { label: '↩ Undo', run: offlineUndo } })
        }
        return
      }
      // ── THE MONEY HALF FAILED, ON A 200 ──────────────────────────────────────────────────────────
      // 🔴 The window person is the one holding the cash, so this surface needs the same signal the
      // dashboard gets — same words, same 20s, same repair. Without it the KDS swallowed it entirely:
      // this handler checks `result.ok` only for 'ready', and its `catch {}` is empty.
      // The card marker (see the `conflict` prop below) is the durable record; this is the catch-in-the-
      // act. 'mark_paid' charges the outstanding balance under the same idempotency key — safe to
      // re-fire, a no-op if the money did land.
      const payWarn = (result.data as { paymentWarning?: string } | undefined)?.paymentWarning
      if (payWarn && result.ok) {
        const num = orders.find(o => o.order_key === orderKey)?.id ?? ''
        showToast(
          `⚠ Order #${num} — PAYMENT NOT RECORDED. The order went through; the money did not.`,
          'error',
          // ⚠️ Through the REF, not a direct self-call: handleAction is a useCallback, and naming itself
          // in its own body would put it in its own dependency array. Same fetchAllRef pattern this file
          // already uses. The retry is the SAME handler, so it takes the same offline gate.
          { duration: 20000, action: { label: 'Record payment', run: () => { void handleActionRef.current('mark_paid', orderKey) } } },
        )
      }
      // Committed 'ready' → defer the email 4s + show a stacked undo toast (undo cancels the email +
      // reverts the status; the order then re-appears in the cook list on refetch).
      if (action === 'ready' && result.ok) {
        const readyOrder = orders.find(o => o.order_key === orderKey)
        const num = readyOrder?.id ?? ''
        scheduleReadyEmail(orderKey)
        // Buzzer in the ready toast — see the dashboard copy of this call for the full reasoning.
        // 🔴 The pill markup below is BYTE-IDENTICAL to the dashboard's so the two surfaces cannot
        // render differently; no buzzer ⇒ the original string, unchanged.
        showToast(
          readyOrder?.buzzer_number != null
            ? <>Order #{num} ready · {buzzerPill(readyOrder.buzzer_number)}</>
            : `Order #${num} ready`,
          'success', { duration: 4000, action: { label: '↩ Undo', run: () => undoReady(orderKey, num) } })
      }
    } catch {}
    setActionLoading(null)
    fetchAllRef.current()
  }, [token, pin, orders, scheduleReadyEmail, undoReady, showToast])
  // Kept current so the PAYMENT NOT RECORDED toast's "Record payment" can re-enter this same handler
  // (and therefore the same offline gate) without handleAction depending on itself.
  // ⚠️ In an EFFECT, not during render. The `fetchAllRef.current = fetchAll` assignment above writes during
  // render and is one of this file's existing react-hooks/refs findings; copying that would add a new one.
  // A ref written after commit is equivalent here — the toast can only fire long after mount.
  useEffect(() => { handleActionRef.current = handleAction }, [handleAction])

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
    const res = await fetch(`/api/dashboard?${params}`, { headers: await nativeAuthHeader() })
    const data = await res.json()
    if (!res.ok) {
      setPinError('Incorrect PIN')
      return
    }
    setPin(pinInput)
    setTruck(data.truck)
    setShowCookingStep(data.vanShowCookingStep ?? false)
    setOrders(prev => applyPendingBuzzers(mergeOrders(prev, data.orders ?? []), peekPendingBuzzer))
    setPausedUntil(data.truck?.paused_until ?? null)
    setExtraWaitMins(data.truck?.extra_wait_mins ?? 0)
    // Seeded here too, not just in fetchAll: this response is the FIRST board an operator sees after
    // entering the PIN. Without it the first paint would resolve every order unpaid until the next poll.
    if (data.payments !== undefined) setPayments(data.payments || {})
    if (data.paymentFailures !== undefined) setPaymentFailures(new Set<string>(data.paymentFailures || []))
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
  // FIX 1 — DEMO defaults to Window + Grid. Window because it's the view that tells the story a prospect
  // came for (orders to make, in the order to make them); Grid because a wall of cards reads as a working
  // kitchen where a list reads as a spreadsheet. Still OVERRIDABLE — the switcher works, and once they
  // pick something it persists per-token like any operator's preference.
  const activeView: KdsView = can('cook_screen')
    ? (viewOverride ?? (isDemo ? 'window' : kdsView))
    : 'window'
  const activeLayout = layoutOverride ?? (isDemo ? 'grid' : displayMode)

  // ── DOES THIS DEVICE DO MONEY? ──────────────────────────────────────────────────────────────────
  // 🔴 TWO GATES, AND THE TRUCK ONE COMES FIRST. `showPaidStep` is resolved by the SHARED resolver over
  // the same (truck, event) pair the card itself uses — never inline — so this surface and OrderCard
  // cannot disagree about whether the paid step is split for THIS event (lib/payments/paid-step.ts).
  //
  // showPaidStep FALSE ⇒ the truck takes payment as one tap ("Paid & collected") and there is no payment
  // step to opt out of. The device toggle is not rendered, `hidePayments` is FORCED false, and every line
  // below collapses to exactly what this file did before. That is what keeps Pizzeria Gusto — and every
  // other truck on the default — byte-identical.
  //
  // ⚠️ `!== true`, not `=== false`. `null` (pref not read yet) resolves to HIDE. Withholding money UI for
  // a frame is recoverable; flashing a paid chip on a grill screen is the thing this setting exists to
  // prevent.
  const { showPaidStep } = resolvePaidStep(truck, activeEvent)
  const hidePayments = showPaidStep && showPaymentsPref !== true

  // FIX 2 — apply the durable offline status overlay (sticky; held until the server reflects it) over the
  // merged orders BEFORE the view split, so an offline-advanced card moves columns and no stale/intermediate
  // read can wipe it. Empty overlay (online) → identity.
  const overlayedOrders = kdsOverlay.size
    ? orders.map(o => { const ov = kdsOverlay.get(o.order_key); return ov ? ({ ...o, ...ov } as Order) : o })
    : orders

  // Base: exclude terminal statuses for all views
  const activeOrders = overlayedOrders.filter(o =>
    !['collected', 'cancelled', 'rejected'].includes(o.status)
  )

  // Cook view: cook's job ends at ready — hide ready orders from the kitchen screen
  const cookOrders = activeOrders.filter(o => o.status !== 'ready')
  // Window view: keep ready orders visible — window person hands over and takes payment.
  //
  // ── THE LIFECYCLE HALF OF THE TOGGLE ────────────────────────────────────────────────────────────
  // 🔴 THIS IS THE POINT OF THE SETTING, AND IT IS NOT A DISPLAY RULE. A device that does not take money
  // cannot be the device that decides an order is finished — "collected" MEANS "paid and handed over",
  // and half of that is invisible here. So on such a device the ticket's life ends at READY: the card
  // offers Ready (see OrderCard's `hidePayments`), the tap advances the order, and the ticket leaves
  // THIS BOARD. It is the same rule the cook screen has always followed, applied to a window device that
  // has been told it is not the hatch.
  //
  // ⚠️ THE ORDER IS NOT FINISHED — ONLY THIS SCREEN IS FINISHED WITH IT. status becomes 'ready', which is
  // NOT terminal: it stays in the dashboard's confirmedOrders bucket (page.tsx:~2219 includes 'ready')
  // and on any other KDS whose device toggle is on. Nothing is written that could hide it there — the
  // filter is a local render-time predicate over a SHARED status, so two devices disagreeing about what
  // they show is exactly the intended consequence and costs no state.
  const windowOrders = hidePayments
    ? activeOrders.filter(o => o.status !== 'ready')
    : activeOrders

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
  const doneOrders = overlayedOrders
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

      {/* Offline warning + sync state (native only); also drives reachability + the outbox drain on reconnect. */}
      <OfflineBanner conflicts={outboxConflicts} resolveLabel={resolveConflictLabel} onAcknowledge={acknowledgeConflicts} onSynced={() => { fetchAllRef.current(); refreshPendingStatus() }} />
      {/* WEB-only counterpart (renders null on native): a clear "you're offline, orders won't send" bar. */}
      <WebOfflineBanner />

      {/* App-lock overlay (per-device biometric/passcode) — no-op on web / when off. */}
      <AppLockGate />

      {/* Shared with the dashboard and the customer order page — components/DemoModeBanner.tsx. Sits ABOVE
          the header so it can't be mistaken for a kitchen control. The "what is this screen" explanation
          lives in the one-time intro popup below, not here. */}
      {isDemo && <DemoModeBanner action={<DemoGetStarted token={token} />} />}

      {/* ── Header ── */}
      <header className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-slate-200 flex-shrink-0">
        {/* Back to the orders dashboard — staff are auto-routed to KDS on login and otherwise have no
            way back to place orders. Unconditional (all roles): /dashboard/[token] has no staff block,
            so this can't loop. Label collapses to just ← on narrow widths to avoid crowding. */}
        <AppLink
          href={`/dashboard/${token}`}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
        >
          <span aria-hidden>←</span>
          <span className="hidden sm:inline">Dashboard</span>
        </AppLink>
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

        {/* ── TAKE PAYMENTS ON THIS DEVICE ──────────────────────────────────────────────────────────
            🔴 RENDERED ONLY WHEN THE TRUCK HAS THE PAID STEP ON. With it off there is no payment step to
            opt out of — "Paid & collected" is one tap — so a toggle here would offer a choice that
            changes nothing, on the screen where a control that does nothing is most expensive. Gusto and
            every other default truck never see it.
            NO PLAN GATE, deliberately: this is where the operator physically stands, not a paid tier.
            Placed beside Sound because both are per-DEVICE, and away from Window/Cook because those pick
            a LAYOUT while this decides whether the device handles money. Same chip shape as Sound so it
            reads as a sibling; the word is spelled out (not icon-only) because it moves tickets off the
            board and an icon alone cannot carry that.
            ⚠️ WINDOW VIEW ONLY. Cook view has no prices, no chip and no payment action by design (§9) and
            is UNCHANGED by this setting in every combination — so on the cook screen this button would be
            a control that visibly does nothing, which is the same failure as showing it to a truck with
            the paid step off. `hidePayments` itself is still computed and still passed to cook cards
            (where it changes nothing), so switching back to Window applies the stored preference. */}
        {showPaidStep && activeView === 'window' && (
          <button
            onClick={() => togglePayments(hidePayments)}
            title={hidePayments
              ? 'Payments off — this screen finishes at Ready. Tap to take payment here.'
              : 'Payments on — tickets stay until paid & collected. Tap to finish at Ready instead.'}
            className={`flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${
              hidePayments ? 'bg-slate-100 text-slate-400' : 'bg-green-100 text-green-700'
            }`}
          >
            <span aria-hidden>💷</span>
            <span className="hidden sm:inline text-xs">{hidePayments ? 'No payments' : 'Payments'}</span>
          </button>
        )}

        {/* This device (native app only) — device/user config, reachable from KDS since it's a default-
            screen surface. Not role-gated, not sm:hidden. Uses the dashboard token (this route runs on it),
            so its bind-device reads/writes authenticate. */}
        {/* DEMO: hidden. ThisDeviceSettings is pure CONFIGURATION (default screen, van binding, notification
            prefs) — the KDS counterpart of the NotificationSettings card hidden on the dashboard. Already
            native-only, so a web demo never saw it; gated here so a native demo doesn't either. */}
        {isNativeApp() && !isDemo && (
          <button
            onClick={() => setDeviceOpen(true)}
            title="This device"
            className="text-sm px-3 py-1.5 rounded-lg font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors shrink-0"
          >
            📱
          </button>
        )}

        <div className="flex-1" />

        {/* Extra wait selector.
            DEMO: hidden. A visitor with no mental model of the system sets +30 min, forgets, then sees
            quoted collection times they can't explain and concludes the product is broken. Neither this nor
            Pause is part of what the demo is selling, and both can only make the demo look wrong. Safe to
            hide OUTRIGHT (rather than keep a clear-path like Pause below): extra wait is only ever set from
            here or the dashboard, and both are gated in demo — so it can never be non-zero to begin with. */}
        {!isDemo && (
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
        )}

        {/* Pause — both views.
            DEMO: the PAUSE direction is hidden, the RESUME direction is NOT. This is one toggle button, so
            `!isDemo || isPaused` keeps the recovery path open: offline auto-pause (heartbeat-monitor) can
            still pause a demo event without anyone touching this, and hiding the button outright would
            strand the demo paused with no way back — the exact failure we're avoiding, just caused by us. */}
        {activeEvent?.status === 'open' && (!isDemo || isPaused) && (
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
          <AppLink
            href={`/dashboard/${token}/kds?view=cook${pin ? `&pin=${pin}` : ''}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-400 hover:text-slate-600 underline"
          >
            Open cook screen
          </AppLink>
        )}

        {/* BINARY: teal "Screen on" ONLY when the lock is actually HELD; grey "Screen off" otherwise. Failure
            is a plain-English toast on the tap (screenFailMsg), never a hedged label. */}
        <button
          onClick={toggleKeepScreenOn}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${screenHeld ? 'bg-teal-600 text-white' : 'bg-slate-200 text-slate-600'}`}
          title={screenHeld ? 'Screen will stay on' : 'Tap to keep the screen on'}
        >
          <span>{screenHeld ? '☀️' : '🌙'}</span>
          <span className="hidden sm:inline">{screenHeld ? 'Screen on' : 'Screen off'}</span>
        </button>
      </header>
      {/* Keep-screen-on prompt — full-width bar right under the header, unmissable on the cook screen. Shows
          only when the pref is on but the lock isn't held; the operator's first tap dismisses AND acquires it. */}
      <KeepAwakePrompt keepScreenOn={keepScreenOn} wakeState={wakeState} onAcquire={() => { void applyKeepScreenOn(true) }} />

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
          {/* FIX 3 — DEMO removes both. Same reasoning as the dashboard's Event actions: extend/finish/
              cancel/note are operator event-lifecycle controls with nothing to offer a prospect, and
              several of them can leave the demo looking broken. */}
          {!isDemo && (
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
          )}
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
                catConfigs={catConfigs}
                /* 🔴 PART 1. The card NEVER derives payment state itself — it feeds these straight to
                   getOrderBalance, the same pure function the server rollup uses. Undefined here (the
                   state before this line existed) is not "unknown", it is "nothing paid", which is why
                   its absence was silent. See the payments state above. */
                ledgerRows={payments[order.order_key]}
                heldAuthorisation={heldAuthorisations.has(order.order_key)}
                /* 🔴 PART 2, the DISPLAY half. True ⇒ this device does not do money: no paid chip, no
                   pay buttons, Ready in their place. Always FALSE when the truck's paid step is off, so
                   a show_paid_step-false truck renders exactly what it rendered before. */
                hidePayments={hidePayments}
                pendingSync={pendingSync.has(order.order_key)}
                /* 🔴 TWO SOURCES, ONE MARKER — the SAME fold the dashboard makes (page.tsx, cardConflict).
                   A failed offline replay and a failed server-side ledger write are one fact to an
                   operator; they must not produce two different red bars. Payment wins over status,
                   matching useOutboxConflicts' own rule. */
                conflict={hasUnrecordedPayment(order as never, payments[order.order_key] ?? [], paymentFailures.has(order.order_key))
                  ? 'payment'
                  : conflictByOrder.get(order.order_key)}
                onBuzzer={buzzerCount != null ? setBuzzerTarget : undefined}
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
              {doneOrders.map(o => {
                // 🔴 WAS THE LITERAL STRING "✓ paid", printed for every collected order and derived from
                // NOTHING — not the ledger, not payment_status, not even show_paid_step. It was the one
                // payment claim on this screen that survived the paid-step gate, so it was the only one
                // Gusto could see. Now that Part 1 supplies the rows it is derived like everything else,
                // through the same resolver the card uses. Accurate in the common case either way (a
                // collected order has been through recordCollectionPayment) — but "accurate by luck" is
                // not a property worth keeping on a money label.
                // Suppressed entirely on a no-payments device: a screen that shows no prices and no pay
                // buttons must not assert in a footer that money changed hands.
                const bal = getOrderBalance(o as never, payments[o.order_key] ?? [])
                // ⚠️ 'part_refunded' RIDES WITH 'refunded'. Charged in full and partly given back means
                // nothing is owed, and without it here the KDS footer prints "£2.00 due" for money the
                // customer was just refunded. The KDS is a glance surface, so it says paid rather than
                // spelling out the refund; the order card carries the detail.
                const settled = bal.status === 'paid' || bal.status === 'refunded' || bal.status === 'part_refunded'
                // 🔴 HELD IS NEITHER SETTLED NOR DUE. `£X due` on an order whose card is already
                // authorised is an instruction to collect money that is held — the double-payment path
                // this change exists to close. Tested after `settled`, and the resolver already excludes
                // captured intents, so the two cannot both be true.
                const held = heldAuthorisations.has(o.order_key)
                return (
                  <div key={o.order_key} className="flex justify-between items-center py-1 text-xs text-slate-400 border-t border-slate-100">
                    <span>#{o.id} · {o.customer_name}</span>
                    {hidePayments ? null : settled
                      ? <span className="text-green-600">✓ paid</span>
                      : held
                      ? <span className="text-indigo-600">card held</span>
                      : <span className="text-amber-600">£{(bal.balanceMinor / 100).toFixed(2)} due</span>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
      </div>

      {/* Buzzer grid — card path only. The KDS has no Add Order, so there is no blocking prompt here. */}
      {buzzerTarget && buzzerCount != null && (
        <BuzzerGrid
          open
          buzzerCount={buzzerCount}
          orders={orders}
          eventId={buzzerTarget.event_id ?? activeEvent?.id ?? null}
          targetOrderKey={buzzerTarget.order_key}
          targetOrderId={String(buzzerTarget.id)}
          /* 🔴 resolveCurrentBuzzer, NOT a `??` chain — see the dashboard copy and lib/buzzer.ts. */
          currentNumber={resolveCurrentBuzzer(orders, buzzerTarget)}
          saving={savingBuzzer}
          onAssign={(n, keepOpen) => saveBuzzer(buzzerTarget.order_key, n, keepOpen)}
          onClose={() => setBuzzerTarget(null)}
        />
      )}

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
      {showEventMenu && activeEvent && !isDemo && (
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

      {/* FIX 2 — DEMO kitchen-screen explainer. Fixed-height flex shell per the reference manual, though
          it's short enough not to need the scroller; kept for consistency with the other demo modals. */}
      {isDemo && showKdsIntro && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4"
          onClick={dismissKdsIntro}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 flex flex-col gap-3"
            onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="text-3xl text-center" aria-hidden>👨‍🍳</div>
            <h3 className="font-black text-slate-900 text-center">This is the kitchen screen</h3>
            <p className="text-sm text-slate-600">
              It&apos;s the cook&apos;s view — the orders you need to make, in the order to make them. The
              screen by the grill shows this while the counter uses the orders dashboard.
            </p>
            <p className="text-sm text-slate-600">
              Cards move across as you tap them, so whoever&apos;s cooking always knows what&apos;s next and
              nobody has to shout. Everything here is your demo data — have a play.
            </p>
            <button onClick={dismissKdsIntro}
              className="mt-1 w-full bg-orange-600 text-white font-bold py-3 rounded-xl text-sm hover:bg-orange-700">
              Got it
            </button>
          </div>
        </div>
      )}

      {/* "This device" sheet — same pattern as the dashboard UserMenu. ThisDeviceSettings self-guards on
          isNativeApp and renders its own card + "this device only" note. `token` here is the dashboard
          token (this route runs on it), so its bind-device calls authenticate. */}
      {deviceOpen && !isDemo && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-4"
          onClick={() => setDeviceOpen(false)}>
          <div className="w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex justify-end mb-1">
              <button onClick={() => setDeviceOpen(false)} aria-label="Close"
                className="text-white/80 hover:text-white text-3xl leading-none">×</button>
            </div>
            <div className="bg-white rounded-2xl shadow-2xl max-h-[85vh] overflow-y-auto">
              <ThisDeviceSettings token={token} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
