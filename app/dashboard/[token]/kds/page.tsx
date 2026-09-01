'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Preferences } from '@capacitor/preferences'
import { useParams, useSearchParams } from 'next/navigation'
import { OrderCard } from '@/components/dashboard/OrderCard'
import { BuzzerGrid } from '@/components/dashboard/BuzzerGrid'
import { applyPendingBuzzers, echoedBuzzerKeys, resolveCurrentBuzzer, planOptimisticBuzzer } from '@/lib/buzzer'
import { KeepAwakePrompt } from '@/components/dashboard/KeepAwakePrompt'
import { AppLink } from '@/components/native/AppLink'   // internal-route anchor: soft-nav in native, plain <a> on web
// The ONE event-cancel gate, shared with manage and the dashboard. Replaces a window.confirm whose
// safe button was labelled "Cancel" on the operation that cancels every live order.
import { EventPickerPanel } from '@/components/shared/EventPickerPanel'
import { EventCancelModal } from '@/components/shared/EventCancelModal'
import { EventFinishTimeModal } from '@/components/shared/EventFinishTimeModal'
import { EventActionsModal } from '@/components/shared/EventActionsModal'
import { ExtraWaitModal } from '@/components/shared/ExtraWaitModal'
import { RejectOrderModal } from '@/components/shared/RejectOrderModal'
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
import { readSoundConfig, seedSoundConfig, effectiveSoundConfig, writeSoundConfig } from '@/lib/sound-prefs'
import { formatTime, formatTimeRange, localTodayIso, pickDefaultEventByTime } from '@/lib/time-utils'
import { fmtVenue, eventDateLabel, eventStatusDisplay, EVENT_STATUS_TEXT_ON_LIGHT, EVENT_STATUS_DOT } from '@/lib/event-display'
import { useAndroidBack } from '@/lib/native/backHandler'
import { getNetworkStatus, addNetworkListener } from '@/lib/native/network'
import { requestNotificationPermission } from '@/lib/native/notifications'
import { installAudioUnlock, primeAudio, playNewOrder } from '@/lib/audio'
import { configureStatusBar } from '@/lib/native/statusBar'
import { registerServiceWorker, addSWMessageListener } from '@/lib/native/serviceWorker'
import { countOps } from '@/lib/native/outbox'
import { isNativeApp, setLastScreen } from '@/lib/native/device'
import { useHeartbeat } from '@/lib/native/useHeartbeat'
import { gatedAction, STATUS_REPLAY_EXPECTED_FROM, PLAIN_PAID_ACTIONS } from '@/lib/native/orderGate'
import { isOnline } from '@/lib/native/reachability'
import { mergeOrders } from '@/lib/orders/mergeOrders'
import { useOfflineStatusOverlay } from '@/lib/native/useOfflineStatusOverlay'
import { useOfflinePaymentOverlay } from '@/lib/native/useOfflinePaymentOverlay'
import { useGatedActionResult } from '@/lib/native/useGatedActionResult'
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

/**
 * ── 🔴 THE TOKEN MAY ARRIVE AS A PROP, AND THAT IS THE WHOLE POINT. ─────────────────────────────────
 * This screen runs on the DASHBOARD token: 93 references below send it to /api/dashboard,
 * /api/dashboard/action, /api/events/manage and /api/events/action, every one of which authenticates on
 * `dashboard_token` alone. It genuinely cannot run on a van's `kds_token`.
 *
 * It used to be REACHED by /kds/<kds_token> redirecting to /dashboard/<dashboard_token>/kds — which put
 * the OWNER credential in the address bar, and therefore in browser history, server request logs and
 * PostHog's `$current_url`. Live dashboard tokens have already been confirmed in PostHog.
 *
 * So the token now arrives by PROP from a server component that resolved it server-side
 * (app/kds/[kds_token]/page.tsx), and never appears in a URL. When this file is used as a PAGE at
 * /dashboard/<token>/kds, Next passes `{ params, searchParams }` — no `token` prop — and the
 * `useParams` fallback below carries it exactly as before. Both entry points, one component, unchanged
 * behaviour.
 * ⚠️ vanId/vanName take the same treatment for the same reason: they used to ride the redirect's query
 * string, and the /kds route no longer has one. They are NOT credentials — they move to props only so
 * that route can supply them without a redirect.
 */
type KdsPageProps = { token?: string; vanId?: string; vanName?: string }

export default function KdsPage({ token: tokenProp, vanId: vanIdProp, vanName: vanNameProp }: KdsPageProps = {}) {
  // ⚠️ `useParams` is OPTIONAL-TYPED NOW. On /kds/<kds_token> it returns `{ kds_token }` and has no
  // `token` key at all, so the prop is what carries it there. On the dashboard route it is the source.
  const routeParams = useParams<{ token?: string }>()
  const token = tokenProp ?? routeParams?.token ?? ''
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
  // `?view=cook` IS NO LONGER READ. The view is derived from the handover switch, so the URL param
  // decides nothing; a stale bookmark carrying it simply opens the KDS. Left unparsed rather than
  // parsed-and-ignored, so nothing suggests it still has an effect.
  // Prop first (the /kds route, which has no query string), then the query string (the dashboard
  // route's existing handoff). Identical values either way — only the delivery differs.
  const vanId = vanIdProp ?? searchParams.get('van_id') ?? ''
  const vanName = vanNameProp ?? searchParams.get('van_name') ?? ''
  // 🔴 THE SEED FROM THE DASHBOARD. Same handoff mechanism as van_id above. Read ONCE, into the initial
  // state below; nothing re-reads it, so a later navigation cannot move an event out from under a cook.
  const seedEventId = searchParams.get('event_id') ?? ''
  // 🔴 FIX 2, RECEIVING HALF. openKDS now sends `date` ALONGSIDE `event_id`, from one resolved event
  // object. Read it here so the FIRST fetch — the one made before the events list has landed and
  // `eventScopeRef` can supply the pair — forwards both. Without this the sender's half is inert: the
  // route would still default `date` to today and still fail to match a non-today event.
  // ⚠️ Read ONCE, exactly like seedEventId, and only ever used together with it (see applyEventScope).
  const seedEventDate = searchParams.get('date') ?? ''

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
  // ── OPTIMISTIC SCALAR GUARD — the flip-back guard, carried over from the dashboard ────────────────
  // 🔴 WHY IT EXISTS HERE AT ALL. This board's pause handler refetches IMMEDIATELY after its own write.
  // Without a guard, a refetch that started before the server committed returns the OLD value and
  // silently undoes the operator's tap — the dashboard's own comment names it "the write-round-trip
  // clobber (the flip-back bug)" (page.tsx:252-257). The dashboard has had this guard since that bug;
  // the KDS never did.
  // 🔴 A LOCAL EQUIVALENT, NOT AN EXTRACTION, AND THAT IS A DELIBERATE CHOICE. The dashboard's version
  // is INLINE — a useCallback over `pendingWritesRef`, which it also shares with the buzzer guard
  // (`buzzer:${key}`) and with category-availability (`catavail:`, which stores a `meta`). Extracting
  // it would mean rewriting the dashboard's ref, its 12 call sites and two composite-key conventions,
  // on the surface Pizzeria Gusto trades on — and the brief forbids changing the dashboard's use of it.
  // ⚠️ THE PRECEDENT FOR THIS SHAPE IS FOUR LINES ABOVE: `pendingBuzzersRef` is the same decision, taken
  // for the same reason, and its comment says so. The MECHANISM is copied exactly; if the dashboard's
  // ever changes, this must change with it.
  // ⚠️ `key in p`, NOT a truthiness test — the dashboard boxes its value as `{v}` so that a pending
  // NULL (a Resume) is still truthy. Storing the bare value here means the "absent" and "pending null"
  // cases would collapse under `if (!p[key])`, and a Resume is exactly a pending null.
  const pendingWritesRef = useRef<Record<string, unknown>>({})
  /** Return the value to use for `key`, releasing the guard once the server echoes the desired value. */
  const applyPending = useCallback(<T,>(key: string, serverVal: T): T => {
    const p = pendingWritesRef.current
    if (!(key in p)) return serverVal
    if (serverVal === p[key]) { delete p[key]; return serverVal }
    return p[key] as T
  }, [])
  /** Register an optimistic write BEFORE its setState, so a refetch mid-write cannot clobber it. */
  const markPending = useCallback((key: string, value: unknown) => { pendingWritesRef.current[key] = value }, [])
  // 🔴 THE MANUAL EVENT PAUSE — `data.vanPausedUntil`, i.e. `truck_events.paused_until`. It used to be
  // read from `data.truck.paused_until`, which /api/dashboard hardcodes to `null` on every response
  // (route.ts:711), so this state was permanently null however many times the operator paused. See
  // docs/kds-pause-fix-report.md. The state NAME is kept; only its source and its guard changed.
  const [pausedUntil, setPausedUntil] = useState<string | null>(null)
  /** `truck_events.online_paused_until` — the OFFLINE auto-pause. Gated, never OR'd raw. */
  const [onlinePausedUntil, setOnlinePausedUntil] = useState<string | null>(null)
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
  // ── 🔴 THE KDS'S OWN KEY. IT USED TO WRITE THE DASHBOARD'S. ────────────────────────────────────
  // Both pages wrote `hg_keepawake_${token}` with the identical expression, so screen-on was ONE
  // setting pretending to be two: turning it on here turned it on there. The KDS moves to
  // `hg_kds_keepawake_${token}`; 🔴 THE DASHBOARD'S KEY IS UNTOUCHED and its behaviour does not move.
  // 🔴 MIGRATE ON FIRST READ, ONCE-ONLY AND IDEMPOTENT BY CONSTRUCTION — no flag, no timestamp. The
  // guard is "my own key is unset"; the migration's own effect is to SET it, so a second run cannot
  // satisfy its own precondition. An operator whose screen currently stays on keeps it; the first
  // write from this surface then makes the two independent for ever.
  // ⚠️ localStorage AND NOT Preferences, deliberately, and the rule holds: Preferences is for values
  // that must survive a WKWebView cold kill because they decide BOARD MEMBERSHIP (the two step
  // switches). This decides appearance and a hardware lock — losing it costs one tap, not a wrong
  // board — so it stays where the dashboard's equivalent is.
  const [keepScreenOn, setKeepScreenOn] = useState(() => {
    if (typeof window === 'undefined') return !isDemo
    const own = localStorage.getItem(`hg_kds_keepawake_${token}`)
    const pref = own ?? localStorage.getItem(`hg_keepawake_${token}`)
    return isDemo ? pref === 'on' : pref !== 'off'
  })
  // ACTUAL keep-awake state, not intent — so the KDS Screen chip can't lie. No grace needed: with
  // gesture-based acquisition the lock stays 'off' (optimistic) until first tap, so there's no mount-denial.
  const [wakeState, setWakeState] = useState<WakeState>('off')
  useEffect(() => subscribeWakeState(setWakeState), [])
  const [showScreenOffWarning, setShowScreenOffWarning] = useState(false)
  const [vansWithAutoPause, setVansWithAutoPause] = useState<string[]>([])
  // 🔴 THE TRUCK'S ACTIVE VAN COUNT, FROM `/api/dashboard` — the header uses it to decide whether the
  // van name says anything. `null` = NOT KNOWN YET (or the count query failed), and null SHOWS the van:
  // before the first response there is nothing to decide on, and removing a name once on the first poll
  // is quieter than adding one once. This surface had no way to know this fact until the field existed.
  const [activeVanCount, setActiveVanCount] = useState<number | null>(null)
  // ── VIEW + LAYOUT: LAZY INITIALISERS, THE SAME PATTERN AS keepScreenOn ABOVE ────────────────────
  // 🔴 THIS READS localStorage SYNCHRONOUSLY AT FIRST PAINT. It used to start `null` and be filled by a
  // mount effect, which persisted correctly but restored ONE FRAME LATE — and for the VIEW that frame is
  // not cosmetic. The same hazard now lives on the handover switch, which the view is derived from, and
  // is closed the same way: a device configured as a MAKING screen must not paint a WINDOW board first —
  // prices visible (showPrices = viewMode !== 'cook'), ready tickets on the board, the window set. On an
  // unattended grill screen that is a frame of money UI on a device deliberately configured never to
  // show it. The lazy read closes the gap by construction — there is no frame in which the stored
  // preference is not yet applied.
  // ⚠️ NO SECOND MECHANISM. Same localStorage keys, same token scoping, same writer effects below; only
  // the READ moved from an effect into the initialiser, exactly as keepScreenOn does it.
  // ⚠️ SSR-GUARDED and validated, so a corrupt value falls through to null = today's default resolution.
  // ── `hg_kds_view_` IS READ ONCE, FOR THE MIGRATION, AND NEVER WRITTEN AGAIN ─────────────────────
  // 🔴 THE WINDOW/COOK CONTROL IS GONE. `viewMode` is now DERIVED from the handover switch
  // (`handoverOn ? 'window' : 'cook'`), so this key no longer decides anything. It is still READ,
  // exactly once, because a device that chose Cook must not silently become a window screen — see the
  // migration in the reconcile effect below. The value is left in place, harmless and unread thereafter.
  const storedView = typeof window === 'undefined' ? null : localStorage.getItem(`hg_kds_view_${token}`)
  const [layoutOverride, setLayoutOverride] = useState<'list' | 'grid' | null>(() => {
    if (typeof window === 'undefined') return null
    const l = localStorage.getItem(`hg_kds_layout_${token}`)
    return l === 'list' || l === 'grid' ? l : null
  })
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
  // ── THE TWO PER-DEVICE STEP SWITCHES ────────────────────────────────────────────────────────────
  // 🔴 "Marks ready" and "Takes payment" — which STEPS this screen performs. An order leaves this
  // board once the last selected step is done. Both stored per device, keyed by token so two trucks on
  // one iPad do not collide.
  //
  // 🔴 TRI-STATE, AND THE `null` IS LOAD-BEARING. `null` means NOTHING IS STORED, which is NOT the same
  // as stored-false: the unset default differs by truck (see `handoverOn` below), so collapsing null to
  // a boolean here would erase the distinction the acceptance test depends on.
  //
  // ⚠️ LAZY INITIALISERS READ localStorage AT FIRST PAINT. `Preferences.get` is async and cannot run in
  // an initialiser, so localStorage carries the first frame and Preferences reconciles on mount — see
  // the dual-write effects below for which wins and why.
  const readLocalPref = (key: string): boolean | null => {
    if (typeof window === 'undefined') return null
    const v = localStorage.getItem(key)
    return v === 'on' ? true : v === 'off' ? false : null
  }
  // 🔴 THE MIGRATION'S SYNCHRONOUS HALF. A device holding view='cook' with NEITHER switch stored is a
  // MAKING screen, and must paint as one from the first frame — otherwise, on a show_paid_step-FALSE
  // truck, `handoverOn` would fall to its unset default of TRUE and paint the window branch: prices on a
  // grill screen. That is the exact failure this exists to prevent, and it is a first-paint failure, so
  // a mount effect alone cannot close it.
  // ⚠️ IN-MEMORY ONLY HERE. The PERSIST happens in the reconcile effect, after Preferences has had its
  // say — writing from an initialiser would commit a decision made without the store that wins.
  const migrateFromCook = storedView === 'cook'
    && readLocalPref(`hg_kds_payments_${token}`) === null
    && readLocalPref(`hg_kds_readystep_${token}`) === null
  const [handoverPref, setHandoverPref] = useState<boolean | null>(
    () => migrateFromCook ? false : readLocalPref(`hg_kds_payments_${token}`),
  )
  const [readyPref, setReadyPref] = useState<boolean | null>(
    () => migrateFromCook ? true : readLocalPref(`hg_kds_readystep_${token}`),
  )
  // Has the Preferences reconcile completed? Used ONLY to keep the board from narrowing during the
  // window where localStorage was cleared by a cold kill but Preferences still holds the real value.
  const [prefsReconciled, setPrefsReconciled] = useState(false)
  // ── THE CARD-DISPLAY PREFERENCE — localStorage ONLY, AND THAT IS A RULE, NOT AN OVERSIGHT ───────
  // 🔴 A PREFERENCE THAT MOVES THE BOARD IS DUAL-WRITTEN; A PREFERENCE THAT ONLY CHANGES APPEARANCE IS
  // localStorage. The two step switches above decide which orders leave this screen, so losing one to a
  // WKWebView cold kill would silently change what a kitchen can see — they are written to Capacitor
  // Preferences as well, and reconciled. This one decides how a card LOOKS. A one-frame flash of the
  // wrong card size is cosmetic and self-corrects on the next paint; a one-frame flash of the wrong
  // board membership is not. The cheaper store is the correct store here, and pairing it with the
  // switches would blur the distinction that makes the dual write meaningful.
  // ⚠️ TRI-STATE. `null` means the operator has never chosen, which is NOT the same as choosing 'window'
  // — unset follows `boardMode`, and a stored value overrides it. Collapsing it would freeze a making
  // screen on Full cards the first time anyone glanced at the control.
  // ⚠️ A NEW KEY, deliberately. `hg_kds_view_` is read by the one-time migration, and giving it a second
  // meaning would make a display choice look like a migration input.
  const [cardModePref, setCardModePref] = useState<KdsView | null>(() => {
    if (typeof window === 'undefined') return null
    const v = localStorage.getItem(`hg_kds_cardmode_${token}`)
    return v === 'window' || v === 'cook' ? v : null
  })
  const setCardMode = useCallback((next: KdsView) => {
    setCardModePref(next)
    try { localStorage.setItem(`hg_kds_cardmode_${token}`, next) } catch { /* private mode — resets next session */ }
  }, [token])
  // New-order SOUND pref — per DEVICE (localStorage, not DB), default ON. A ref mirrors it for the
  // realtime INSERT callback (set up once), which reads the CURRENT pref without re-subscribing.
  // Lazy initialiser, same pattern as keepScreenOn / view / layout: restore at first paint rather than
  // one frame later. Default ON when nothing is stored, unchanged.
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem(`hg_kds_sound_${token}`) !== 'off'
  })
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
  // ── 🔴 `deviceOnline` — A SECOND SIGNAL, AND IT IS NOT `isOffline`. ─────────────────────────────
  // `isOffline` comes from the OUTBOX's reachability (getNetworkStatus / subscribeNetworkStatus) and
  // answers "should I queue this write?". This one answers "is this device on the network right now?"
  // and is the dashboard's own expression — `navigator.onLine` plus its two listeners — reproduced so
  // the offline-pause gate below is the SAME derivation on both surfaces rather than a lookalike.
  // ⚠️ THEY ARE NOT INTERCHANGEABLE. The outbox signal is deliberately conservative and can lag or be
  // forced by the dev toggle; using it here would make a truck's ordering banner depend on a write-
  // queuing heuristic. Two jobs, two signals, stated rather than merged.
  const [deviceOnline, setDeviceOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  useEffect(() => {
    const on = () => setDeviceOnline(true), off = () => setDeviceOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  const [pendingSyncCount, setPendingSyncCount] = useState(0)
  const [pendingSync, setPendingSync] = useState<Set<string>>(new Set())
  // FIX 2 — durable offline pending-status overlay (shared with the dashboard). Optimistic advances live in
  // the outbox, applied at render over the merged orders, HELD until the server reflects the status (no
  // reconnect flash). Web/non-native → empty → no-op. dropEntry = the offline UNDO.
  const { overlay: kdsOverlay, refresh: refreshPendingStatus, dropEntry: dropOverlayEntry } = useOfflineStatusOverlay(orders)
  // ── THE PAYMENT OVERLAY — THE SIBLING THIS SURFACE NEVER HAD ────────────────────────────────────
  // 🔴 IT WAS NEVER BLOCKED HERE, ONLY NEVER CALLED. The hook needs `order_key` + a `confirmedPaid`
  // computed from getOrderBalance, and this file already holds `orders`, already holds `payments`, and
  // already imports getOrderBalance for the conflict marker below. Wiring it is three lines.
  // 🔴 WHY IT MATTERS ON THIS SURFACE IN PARTICULAR: the window person takes the money. Without this, an
  // operator who took cash offline and tapped Mark paid saw an unpaid card and a button still inviting
  // the tap — and the rational response is to tap again. The server's idempotency absorbed the second
  // press; that is not a reason to keep showing them something false.
  // ⚠️ `confirmedPaid` is computed HERE from the SAME resolver the card uses, so the overlay knows when
  // the server has caught up without re-deriving a balance anywhere. It is the ledger, not the status,
  // that clears a pending payment chip. 'part_refunded' counts as settled: nothing is outstanding.
  const paymentOrders = useMemo(() => orders.map(o => ({
    order_key: o.order_key,
    confirmedPaid: (() => { const b = getOrderBalance(o as never, payments[o.order_key] ?? []); return b.status === 'paid' || b.status === 'refunded' || b.status === 'part_refunded' })(),
  })), [orders, payments])
  const { overlay: paymentOverlay, refresh: refreshPendingPayment } = useOfflinePaymentOverlay(paymentOrders)
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
  // ── THE CANDIDATE SET ────────────────────────────────────────────────────────────────────────
  // Every upcoming event (today onward) — the SAME set the dashboard resolves over, so the id it hands
  // us can always be found. This was `todayEvents`, filtered to today with a UTC date string: it could
  // not hold tomorrow's event, which is why a handoff alone would not have been enough.
  const [events, setEvents] = useState<TruckEvent[]>([])
  // 🔴 SEEDED FROM THE URL AT MOUNT, so a KDS opened from the dashboard is scoped on its FIRST fetch.
  const [selectedEventId, setSelectedEventId] = useState<string | null>(seedEventId || null)
  // 🔴 THE LATCH THAT MAKES THIS "SEED ONCE, THEN HOLD". Set the first time an event is resolved and
  // never cleared. Every path that resolves an event checks it, so a refetch, a poll, a re-render or a
  // resume after hours in the background CANNOT pick a different event. See the seed effect below.
  const seededRef = useRef(false)
  // ── REJECT: THE REASON GATE THIS SURFACE NEVER HAD ──────────────────────────────────────────────
  // 🔴 Until now the KDS's Reject button called handleAction directly, which rejected the order and
  // emailed the customer with NO reason — the server drops the reason line rather than refusing. The
  // dashboard has intercepted `reject` before the gate since it was written; this is that interception.
  const [rejectingOrder, setRejectingOrder] = useState<Order | null>(null)
  const [showEventMenu, setShowEventMenu] = useState(false)
  // Styled "finish event" confirm (replaces window.confirm). early → harder warning naming the end.
  const [finishConfirm, setFinishConfirm] = useState<{ eventId: string; early: boolean; endTime: string } | null>(null)
  // ── CHANGE EVENT FINISH TIME (replaces the removed "+30 min") ────────────────────────────────────
  // 🔴 TWO STATES, AND THE SPLIT IS THE SAFETY. `finishTimePicker` is the PICKER — open it, choose a
  // time, change your mind, close it, and NOTHING has been written. `finishTimeConfirm` is the second,
  // explicit step that actually commits. The old control was a single "+30 min" tap that wrote
  // immediately with no undo, which is exactly how it got pressed by accident.
  // ⚠️ `selected` lives in the picker state, so closing the picker discards it. There is no draft to
  // leak back in on the next open — every open starts from the event's CURRENT finish time.
  // ⚠️ ONE STATE NOW, NOT TWO. The picker/confirm split moved INSIDE EventFinishTimeModal, which is
  // where it belongs — it is the safety property of the control, not of this screen. Non-null means the
  // modal is mounted for that event; every open is a fresh mount, so there is no draft to leak back in.
  const [finishTimeTarget, setFinishTimeTarget] = useState<{ id: string; end_time: string | null; event_date: string | null } | null>(null)
  const [finishTimeBusy, setFinishTimeBusy] = useState(false)
  const [eventNoteInput, setEventNoteInput] = useState('')
  // ── EVENT-CANCEL GATE (was window.confirm) ──────────────────────────────────────────────────────
  // The TruckEvent itself, not an id: the shared modal names the venue, the date and the time window.
  // `null` is closed, and the modal is mounted conditionally, so every open is a fresh mount.
  // The event picker the three-dot menu opens. Replaces the permanent chip strip; the list, the tap
  // target and switchEvent's confirm are all unchanged, only where they live.
  const [showEventPicker, setShowEventPicker] = useState(false)
  // ── 🔴 THE TWO STEP SWITCHES, BEHIND ONE CONTROL — BELOW THE `sm:` BREAKPOINT ONLY ──────────────
  // At phone width the two switches collapse to a bare `✓` and a bare `💷`. Those two decide when a
  // ticket leaves this screen and whether the money buttons exist, and an unlabelled glyph for that is
  // unreadable — an operator cannot discover what it does by looking. This panel is where they get
  // their full labels and a sentence each.
  // ⚠️ AT AND ABOVE `sm:` NOTHING CHANGES: the switches stay on the header and this opener is hidden.
  // See the `hidden sm:contents` wrapper — `contents` means the two buttons remain DIRECT children of
  // the header's flex row at wide width, so their spacing is the header's own `gap-x-3`, unchanged.
  // 🔴 THE STEPS PANEL'S STATE IS GONE — the panel was ABSORBED, not deleted. Its two rows now open
  // inside the one `View` panel below `sm:` (which is `deviceOpen`), so a second piece of state for a
  // second sheet would be the thing that lets one phone show two panels again.
  const [showExtraWaitPicker, setShowExtraWaitPicker] = useState(false)
  // ── 🔴 THE PHONE HEADER'S EXPAND STATE — IN FLOW, NOT A SHEET ─────────────────────────────────
  // 🔴 A SHEET COVERS THE BOARD WHILE THE OPERATOR CHANGES WHAT THE BOARD SHOWS. `List`/`Grid` and
  // `Full`/`Cook` change the tickets underneath; behind an overlay the change cannot be seen being
  // made. This flag drives an ordinary flex child instead, so the header grows and the board moves
  // down. DO NOT PUT THESE CONTROLS BACK IN A MODAL.
  // ⚠️ REACT STATE, NOT localStorage: it survives every render and poll — nothing writes it but the
  // toggle — and does NOT survive a reload, which reopens collapsed. 🔴 NO AUTO-COLLAPSE: `setPhoneOpen`
  // has exactly one caller, the toggle's own onClick.
  const [phoneOpen, setPhoneOpen] = useState(false)
  const [eventCancelTarget, setEventCancelTarget] = useState<TruckEvent | null>(null)
  const [eventCancelCount, setEventCancelCount] = useState(0)
  const [eventCancelBusy, setEventCancelBusy] = useState(false)
  const [kdsToast, setKdsToast] = useState<string | null>(null)

  const fetchAllRef = useRef<() => void>(() => {})
  /** Assigned just below handleAction — see the note there for why the retry goes through a ref. */
  const handleActionRef = useRef<(action: string, orderKey: string) => Promise<void>>(async () => {})
  const prevOrderCountRef = useRef(0)
  const initialLoadDoneRef = useRef(false)

  // ── 🔴 THE EVENT SCOPE SENT WITH EVERY /api/dashboard READ ──────────────────────────────────────
  // 🔴 INVARIANT 1 — THE ID AND THE DATE COME FROM ONE RESOLVED EVENT OBJECT, NEVER TWO LOOKUPS.
  // This ref holds a PAIR taken from `activeEvent` in a single expression, so `event_id` and `date`
  // cannot describe different events. Two independent lookups — `selectedEventId` for the id and a
  // separate `events.find(...)` for the date — would be one poll away from disagreeing, and a request
  // whose date does not contain its id is exactly the shape the server silently rejects.
  // 🔴 INVARIANT 2 — WRITTEN IN AN EFFECT KEYED ON THAT OBJECT, so the value in flight is always the
  // COMMITTED selection. The write is in the effect beside `activeEvent`, which is declared BEFORE the
  // effect that calls fetchAll — React runs passive effects in declaration order, so on the commit that
  // changes the event this ref is current before the request is built.
  // ⚠️ A REF AND NOT A DEPENDENCY, DELIBERATELY. `activeEvent` is `events.find(...)`, and `setEvents`
  // installs fresh objects on EVERY poll, so its identity changes every 60s. In `fetchAll`'s dep array
  // that would re-create fetchAll → re-run the fetch effect → fetch again: an unbounded loop. The
  // dashboard reaches for a ref here for the same reason and says so ("cheap — no fetch, runs on every
  // event-list poll"). `selectedEventId` STAYS in fetchAll's deps — it is what makes a switch refetch.
  const eventScopeRef = useRef<{ id: string; date: string | null } | null>(null)

  /** Put this read's event scope on `params` and return the id we are REQUESTING (null if unscoped).
   *  🔴 ONE IMPLEMENTATION, BOTH FETCHES. The PIN-submit path builds its own params and used to send
   *  neither id nor date; a copy of the main path would have missed it, so there is no copy.
   *  ⚠️ THE FALLBACK IS NOT A SECOND LOOKUP — it is the PRE-RESOLUTION case. Before the first events
   *  response `activeEvent` is null while `selectedEventId` may already hold the ?event_id= handover, and
   *  sending that bare id is EXACTLY what this file did before this change. No date accompanies it, so
   *  there is nothing for it to disagree with, and the behaviour on that path is unchanged rather than
   *  newly weakened. Once events land, the pair takes over. */
  const applyEventScope = useCallback((params: URLSearchParams, fallbackId: string | null): string | null => {
    const scope = eventScopeRef.current
    if (scope) {
      params.set('event_id', scope.id)
      // ⚠️ `event_date` is nullable on TruckEvent. No date ⇒ send the id alone rather than a bare
      // `date=` the route would read as an empty string and fail to match any row.
      if (scope.date) params.set('date', scope.date)
      return scope.id
    }
    // 🔴 FIX 2 — THE PRE-RESOLUTION PATH NOW CARRIES THE PAIR TOO. This branch used to send a bare id
    // and its comment claimed "there is nothing for it to disagree with". There was: the route defaults
    // `date` to today, so a handed-over event on any other date could never be matched and the server
    // served a different (or null) event, which the scope check below then read as a mismatch.
    // ⚠️ THE DATE IS ONLY APPLIED TO THE ID IT ARRIVED WITH. `seedEventDate` describes `seedEventId` and
    // nothing else, so it is sent only while the fallback id IS that seeded id. Once the operator
    // switches event, `eventScopeRef` is populated and the branch above owns the pair anyway — this can
    // never pair a date with an event it does not describe.
    if (fallbackId) {
      params.set('event_id', fallbackId)
      if (seedEventDate && fallbackId === seedEventId) params.set('date', seedEventDate)
      return fallbackId
    }
    return null
  }, [seedEventDate, seedEventId])

  // ── 🔴 FIX 2: WHAT THE SERVER ACTUALLY SERVED, WHEN IT IS NOT WHAT WE ASKED FOR ─────────────────
  // Non-null ⇒ the last response was scoped to a DIFFERENT event from the one this board believes it
  // is showing. The board renders a notice and NO orders; see the render and the check in fetchAll.
  const [eventScopeMismatch, setEventScopeMismatch] = useState<{ requested: string; served: string | null } | null>(null)

  const fetchAll = useCallback(async (currentPin = pin) => {
    if (!token) return
    try {
      const params = new URLSearchParams({ token })
      if (currentPin) params.set('pin', currentPin)
      if (vanId) params.set('van_id', vanId)
      // event_id scopes the slot projection to the active event (re-key fix).
      // 🔴 OPENED FROM THE DASHBOARD THIS IS SET ON THE VERY FIRST FETCH, because `selectedEventId` is
      // initialised from ?event_id= at mount rather than left null until an operator taps something. That
      // closes the old hole: the control that used to be the only way to set it is a chip row that does
      // not render at all when a truck has one event, so a single-event day fetched unscoped forever and
      // relied on a server-side date fallback to guess.
      // ⚠️ HONEST LIMIT — A COLD LAUNCH STILL MAKES ONE UNSCOPED FETCH. The seed for that path comes from
      // `pickDefaultEventByTime` over the events list, and that list arrives INSIDE this same request, so
      // there is nothing to scope by yet. When it lands, the seed effect sets the id, `fetchAll`'s
      // identity changes, and the next fetch is scoped. Closing that too would mean fetching events
      // before orders — a second round trip on the slowest path there is, for one poll of imprecision.
      // 🔴 FIX 1 — `date` RIDES WITH `event_id`, FROM THE SAME OBJECT. Without it the route defaults
      // `date` to today, builds `todayEvents` as `.eq('event_date', date)`, and an `event_id` outside
      // that set is not rejected — it falls through to `todayEvents[0]` and the orders query runs
      // against THAT event. See docs/kds-event-isolation-report.md.
      const requestedEventId = applyEventScope(params, selectedEventId)
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

      // ── 🔴 FIX 2: VERIFY WHAT WE WERE SERVED, BEFORE ANY OF IT REACHES STATE ──────────────────
      // 🔴 THE FORBIDDEN STATE IS ORDERS FROM ONE EVENT UNDER ANOTHER EVENT'S NAME, so this returns
      // BEFORE `setTruck`, `setOrders`, the pause read and every other event-scoped field. A partial
      // apply would be the same defect with fewer symptoms.
      // 🔴 WHY IT RENDERS NOTHING RATHER THAN FOLLOWING THE SERVER. Adopting the served id would move
      // the board to an event the operator did not choose — and "seed once, then hold" exists precisely
      // to stop the board auto-advancing off a cook's unserved orders while nobody is watching. A silent
      // correction here would be that auto-advance wearing a different hat. So: no orders, and a notice
      // that names both events.
      // ⚠️ `offlinePauseEventId` IS A NAME/MEANING MISMATCH AND IT IS BEING USED ANYWAY. The route
      // documents it as "the event the marker belongs to (ack key)" for the offline-pause popup; it
      // happens to be assigned the route's own `selectedEventId`, i.e. the exact id the orders query
      // filtered on. It is the only field that carries that value. NOT RENAMED HERE — renaming is a
      // server change and the server is out of scope. Reported in docs/kds-event-isolation-fix-report.md.
      // ⚠️ `undefined` IS NOT A MISMATCH — an older server that does not send the field must not blank a
      // working board. Only a PRESENT-and-different value counts.
      const servedEventId = data.offlinePauseEventId
      // ── 🔴 FIX 3 — A SERVED `null` IS NOT A MISMATCH ────────────────────────────────────────────
      // `null` means "this truck has no event on the date I resolved", not "I served you a different
      // event". The old condition tested `!== undefined` only, and `null !== undefined`, so the guard
      // fired on every no-event day — and because of Fix 1 below that rendered as "Truck not found".
      // 🔴 IT IS SAFE TO EXCLUDE, NOT MERELY CONVENIENT: /api/dashboard wraps BOTH order queries in
      // `if (selectedEventId) { … }` (route.ts:249), so a null selection returns NO orders at all.
      // There is no wrong-event data to protect against, because there is no data.
      const scopeMismatch =
        !!requestedEventId && servedEventId !== undefined && servedEventId !== null && servedEventId !== requestedEventId

      // ── 🔴 FIX 1 — TRUCK-LEVEL STATE IS APPLIED BEFORE ANY GUARD, ALWAYS ────────────────────────
      // 🔴 THE TRUCK WAS NEVER IN DOUBT. It is resolved from `dashboard_token` at the top of the route,
      // long before any event is chosen, and a bad token returns 401 'Invalid token' — handled above.
      // The old guard `return`ed one statement BEFORE `setTruck(data.truck)`, so a 200 carrying a
      // perfectly good truck was discarded and the render fell through to `{error ?? 'Truck not found'}`
      // — an accurate guard reporting itself as a missing truck.
      // ⚠️ WHAT IS HOISTED IS EXACTLY WHAT IS NOT EVENT-SCOPED: the truck row, the van's cooking-step
      // and buzzer settings, the truck's van count, the menu maps, and the auth flag. Every
      // EVENT-scoped field — orders, both pause columns, extra wait, payments — stays below, inside the
      // guard, because the forbidden state this guard exists to prevent is one event's data under
      // another event's name. That guarantee is unchanged; only the truck escapes it.
      setTruck(data.truck)
      setShowCookingStep(data.vanShowCookingStep ?? false)
      setActiveVanCount(data.activeVanCount ?? null)
      // Buzzers: the VAN's rack size, resolved server-side (lib/buzzer.ts). Null ⇒ this van has no
      // buzzers and the chip is never rendered. The KDS does NOT read effectiveBuzzerPrompt — the
      // after-order prompt belongs to Add Order, which the KDS does not have.
      setBuzzerCount(data.vanBuzzerCount ?? null)
      // keep_screen_on is a PER-DEVICE localStorage pref now (see the keepScreenOn useState) — not read from
      // the truck row (which never carried it in the /api/dashboard map anyway).
      // Buzzer guard: release against the RAW SERVER ROWS first, then apply what is still pending over
      // the merge so a poll that started before a write cannot revert an open grid. See lib/buzzer.ts.
      setCategoryOrder(data.categoryOrder ?? [])
      setItemCategoryMap(data.itemCategoryMap ?? {})
      setCatConfigs(data.catConfigs ?? {})
      setRequiresPin(false)

      // ── 🔴 FIX 1/4 — THE GUARD NOW GATES THE EVENT-SCOPED APPLY INSTEAD OF ABANDONING THE HANDLER ──
      // It used to `return`. That skipped everything below it — including the events fetch at the end of
      // this handler — so `activeEvent` never resolved, `eventScopeRef` stayed null, and the next poll
      // repeated the identical unscoped request. The failure was SELF-PERPETUATING, not transient.
      // 🔴 FIX 4 — AND THIS IS WHY THE NOTICE IS NOW REACHABLE. The notice renders inside the main
      // return, BELOW `if (error || !truck)`. While the guard left `truck` null, the notice could only
      // be set in the one state that guaranteed it could not be shown. `setTruck` above makes that state
      // unreachable, so the notice renders where it was always meant to — no move required, and moving
      // it would have treated the symptom while leaving the truck unset.
      if (scopeMismatch) {
        console.error(`[kds] event scope mismatch — requested ${requestedEventId}, served ${servedEventId ?? 'null'}; rendering no orders`)
        setEventScopeMismatch({ requested: requestedEventId as string, served: servedEventId ?? null })
        // Clearing is part of the guarantee: leaving the previous array on screen under the new header
        // IS the reported defect.
        setOrders([])
      } else {
      setEventScopeMismatch(null)
      // ── FIX 3: DEFENCE IN DEPTH — THE PER-ORDER `event_id` FILTER ────────────────────────────────
      // 🔴 THIS SHOULD NEVER FIRE. The route's orders query is `.eq('event_id', selectedEventId)`, so
      // every row it returns already carries the served id; Fix 1 makes the served id the requested one
      // and Fix 2 refuses the response outright when it is not. If this filter ever drops a row, one of
      // those three statements is false — which is why it logs rather than dropping silently.
      // ⚠️ IT IS SKIPPED WHEN WE ASKED FOR NOTHING (the cold-launch unscoped read), because with no
      // requested event there is no id to test against and the server's choice is legitimate.
      const rawOrders = data.orders ?? []
      const incomingOrders = requestedEventId
        ? rawOrders.filter((o: Order) => o.event_id === requestedEventId)
        : rawOrders
      if (incomingOrders.length !== rawOrders.length) {
        console.error(`[kds] ${rawOrders.length - incomingOrders.length} order(s) dropped by the event_id filter for ${requestedEventId} — Fixes 1 and 2 should have made this unreachable`)
      }
      for (const k of echoedBuzzerKeys(incomingOrders, peekPendingBuzzer)) delete pendingBuzzersRef.current[k]
      setOrders(prev => applyPendingBuzzers(mergeOrders(prev, incomingOrders), peekPendingBuzzer))
      // 🔴 THE LIVE EVENT COLUMN, GUARDED. `data.vanPausedUntil` is `truck_events.paused_until` — the
      // value `set_paused` actually writes and the customer ordering gate actually reads. The old
      // `data.truck?.paused_until` is hardcoded `null` by the API, which is why the banner vanished
      // roughly one second after every pause: this line was the thing that wiped it.
      // ⚠️ `extra_wait_mins` on the line below is NOT the same case and is NOT changed — the same
      // override block sources it from the selected EVENT (route.ts:712), so it already carries live data.
      setPausedUntil(applyPending('vanPausedUntil', data.vanPausedUntil ?? null))
      // 🔴 THE OFFLINE AUTO-PAUSE COLUMN. V11.24 EXCLUDED IT DELIBERATELY AND THIS ADDS IT BACK
      // CORRECTLY — WITH THE GATE, NOT RAW. That exclusion was right at the time: the dashboard does
      // not OR `vanOnlinePausedUntil` in, it gates it on `deviceOnline && activeEventLive`, and
      // copying the OR without the gate would have shown a stale offline banner on a reconnected
      // device. The gate is now here too (see `offlinePausedDisplay`), so the column can be read.
      // ⚠️ DO NOT RE-EXCLUDE THIS. Without it the KDS shows NOTHING while customers cannot order.
      setOnlinePausedUntil(data.vanOnlinePausedUntil ?? null)
      setExtraWaitMins(data.truck?.extra_wait_mins ?? 0)
      // Guarded on `!== undefined` — the SAME shape the dashboard uses (page.tsx:~710). An older server
      // that does not send the field leaves the previous map intact rather than blanking every card to
      // unpaid; a server that sends an EMPTY map (the payments query failed, route.ts logs it) still
      // clears it, because that is a real "no rows this poll" and must not be masked by a stale copy.
      if (data.payments !== undefined) setPayments(data.payments || {})
      // ⚠️ Guarded separately, like every sibling: a partial refresh must not clear it.
      if (data.heldAuthorisations !== undefined) setHeldAuthorisations(new Set<string>(data.heldAuthorisations || []))
      if (data.paymentFailures !== undefined) setPaymentFailures(new Set<string>(data.paymentFailures || []))
      }

      try {
        const eventsRes = await fetch(`/api/events/manage?token=${token}&upcoming=true`)
        // 🔴 NEVER REPLACE GOOD EVENT STATE WITH DATA FROM A FAILED RESPONSE. A 429 or 500 returns valid
        // JSON without `.events`, and `?? []` turned that into an EMPTY candidate set — which blanked the
        // active event on a kitchen screen mid-service until the next successful poll. The dashboard has
        // carried this guard for some time; this surface did not. Keep what we have and try again.
        if (!eventsRes.ok) {
          console.warn('[kds] events fetch failed:', eventsRes.status, '— keeping the events we already have')
        } else {
        const eventsData = await eventsRes.json()
        // The FULL upcoming list, unfiltered — see the candidate-set note on `events`.
        const fetched: TruckEvent[] = eventsData.events ?? []
        setEvents(fetched)
        // ⚠️ THE AUTO-OPEN LOOP IS THE ONE PLACE "TODAY" STILL MATTERS, AND IT MATTERS A LOT: the test is
        // `start_time <= currentTime`, a bare wall-clock string. Run against the unfiltered list it would
        // fire `action: 'open'` on TOMORROW's event the moment today's clock passed its start time. So the
        // date filter stays here, and it is now LOCAL — §7: never use toISOString() (UTC) to decide
        // whether an event date is "today". In BST the UTC string is still yesterday until 01:00.
        const todayStr = localTodayIso()
        const currentTime = new Date().toTimeString().slice(0, 5)
        const stale = fetched.filter((e: TruckEvent) =>
          e.event_date === todayStr && e.status === 'confirmed' && e.auto_open === true && e.start_time <= currentTime
        )
        for (const ev of stale) {
          await fetch('/api/events/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, action: 'open', eventId: ev.id, payload: {} }),
          })
        }
        if (stale.length > 0) {
          setEvents(prev => prev.map(e =>
            stale.some((s: TruckEvent) => s.id === e.id)
              ? { ...e, status: 'open' as const, opened_at: new Date().toISOString() }
              : e
          ))
        }
        }
      } catch {}
    } catch (e) {
      console.error('[kds] fetchAll error:', e)
      setError('Could not load orders')
    } finally {
      setLoading(false)
    }
    // `applyPending` listed for the same reason as in togglePause: it is a `useCallback` with an empty
    // dep array, so its identity is fixed and this cannot re-create fetchAll. Listing it keeps this
    // hook's pre-existing exhaustive-deps warning naming exactly the two it named before this change.
  }, [token, pin, selectedEventId, applyPending, applyEventScope])

  // Per-DEVICE KDS prefs (localStorage, keyed by token so two trucks on one device don't collide):
  // the RESTORE now happens in the useState initialisers above (first paint, no flash); these two effects
  // are the WRITERS and are unchanged. A restored 'cook' still passes through the activeView gate
  // (can('cook_screen'), Max-plan only — Stage 1 de-coupled it from show_cooking_step), so a non-Max
  // device falls back to Window automatically — no extra guard needed.
  // null overrides are never written, so a first-ever-mount default isn't clobbered.
  useEffect(() => {
    if (typeof window === 'undefined' || layoutOverride === null) return
    localStorage.setItem(`hg_kds_layout_${token}`, layoutOverride)
  }, [layoutOverride, token])

  // ── RECONCILE THE TWO STEP SWITCHES FROM Capacitor Preferences, WHICH WINS ──────────────────────
  // 🔴 WHY BOTH STORES. Preferences persists to UserDefaults on iOS and survives the hard navigations
  // and cold kills that can hand a WKWebView a FRESH localStorage; localStorage is the only one that
  // can be read synchronously in an initialiser, so it is the only one that can make the FIRST PAINT
  // correct. Neither alone is sufficient, so both switches write both on every change, and Preferences
  // wins on reconcile because it is the store that survives.
  // ⚠️ A missing Preferences value does NOT clobber a localStorage value — `value == null` leaves the
  // state alone. Only an explicit 'on'/'off' overrides, so a device that has only ever written
  // localStorage keeps its setting.
  // ⚠️ A read failure (plugin missing, private mode) still marks the reconcile DONE, or the board would
  // stay permanently un-narrowed on web. See `boardKeepsReady`.
  useEffect(() => {
    let cancelled = false
    const readOne = (key: string) => Preferences.get({ key }).then(({ value }) => value).catch(() => null)
    void Promise.all([
      readOne(`hg_kds_payments_${token}`),
      readOne(`hg_kds_readystep_${token}`),
      readOne(`hg_kds_view_${token}`),
    ]).then(([pay, rdy, view]) => {
      if (cancelled) return
      if (pay === 'on' || pay === 'off') setHandoverPref(pay === 'on')
      if (rdy === 'on' || rdy === 'off') setReadyPref(rdy === 'on')
      setPrefsReconciled(true)

      // ── 🔴 THE MIGRATION'S PERSISTING HALF. ONCE PER DEVICE, AND IDEMPOTENT BY CONSTRUCTION. ──────
      // A device that chose Cook, with NEITHER switch stored in EITHER store, is a making screen: write
      // READY on / HANDOVER off to both stores so the choice survives as a switch setting.
      // 🔴 ONCE-ONLY NEEDS NO FLAG, AND THAT IS THE POINT. The guard is "both keys unset", and the write
      // sets both — so a second run cannot satisfy its own precondition. Re-running is a no-op rather
      // than a correction, which is what makes it safe on every mount, on every reload, forever.
      // ⚠️ A STORED SWITCH ALWAYS WINS. Either key holding a value in either store aborts the migration,
      // so an operator who has already used the switches is never overridden by an old view value.
      // ⚠️ IF THE Preferences READ FAILED, `readOne` returned null for all three — indistinguishable
      // from "not stored". The localStorage values then decide alone, which is the best available
      // evidence and is exactly what the synchronous seed above already painted. The risk is bounded:
      // the only way to migrate wrongly is for Preferences to hold a switch value that localStorage
      // lacks AND its read to fail, and the next successful reconcile corrects it because Preferences
      // wins there.
      // ⚠️ 'window' IS NOT MIGRATED. Only 'cook' carries information the switches cannot already express.
      const effPay = (pay === 'on' || pay === 'off') ? pay : (localStorage.getItem(`hg_kds_payments_${token}`) ?? null)
      const effRdy = (rdy === 'on' || rdy === 'off') ? rdy : (localStorage.getItem(`hg_kds_readystep_${token}`) ?? null)
      const effView = view ?? storedView
      if (effView === 'cook' && effPay === null && effRdy === null) {
        setReady(true)
        setHandover(false)
      }
    })
    return () => { cancelled = true }
  }, [token])

  // Write-through on toggle — BOTH stores, state first so the board responds to the tap immediately.
  // The persists are fire-and-forget: a failed write costs the operator a re-tap next session, not this
  // one. localStorage is wrapped because private mode throws on write.
  const writePref = useCallback((key: string, next: boolean) => {
    try { if (typeof window !== 'undefined') localStorage.setItem(key, next ? 'on' : 'off') } catch { /* private mode */ }
    void Preferences.set({ key, value: next ? 'on' : 'off' }).catch(() => {})
  }, [])
  const setHandover = useCallback((next: boolean) => {
    setHandoverPref(next); writePref(`hg_kds_payments_${token}`, next)
  }, [token, writePref])
  const setReady = useCallback((next: boolean) => {
    setReadyPref(next); writePref(`hg_kds_readystep_${token}`, next)
  }, [token, writePref])

  // Per-device SOUND pref (hg_kds_sound_<token>): the RESTORE moved into the useState initialiser above
  // (first paint), so this effect now only installs the audio unlock. Persist-on-change and the ref
  // mirror for the realtime INSERT callback are unchanged. Default ON when no stored pref.
  useEffect(() => {
    installAudioUnlock()
  }, [])
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
    // 'dark' CONTENT, AND THIS IS THE ONE SURFACE THAT ASKS FOR IT. The KDS's top bar is bg-white and
    // fills the safe-area strip, so the shared default (light glyphs, correct against the dashboard's
    // navy AppHeader) rendered the clock and indicators invisible - only the battery, whose filled
    // outline survives, remained readable. The header stays white by decision; the glyphs change.
    configureStatusBar('dark')
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

  // ── 🔴 SINGLE ACTIVE-EVENT RESOLUTION: A HELD VALUE, NOT A DERIVATION ────────────────────────────
  // This is a LOOKUP of the seeded id and nothing else. The status-keyed fallback chain that used to sit
  // here — `open ?? confirmed ?? todayEvents[0]` — is GONE, and its absence is the whole fix.
  //
  // 🔴 WHY A FALLBACK HERE WOULD BE A KITCHEN DEFECT. This expression re-evaluates on every render, and
  // the render is driven by a poll. Anything time- or status-dependent in it is an AUTO-ADVANCE: the
  // moment an event's end time passed, or its status flipped to 'closed', the board would silently move
  // to the next event and take a cook's unserved orders off the screen. Nobody is watching this display.
  // A held value cannot do that. If the seeded event has finished, it STAYS — with its late orders on it
  // — until a human taps the picker.
  //
  // ⚠️ null is a legitimate outcome (no events at all, or the seeded one was cancelled) and is handled by
  // the render below, exactly as an empty `todayEvents` was before.
  // "live" = status==='open' (live-redefinition) — the same rule as the customer page, TruckListCard,
  // the dashboard, and the heartbeat-monitor. Declared above the heartbeat effect so it can gate on it.
  const activeEvent: TruckEvent | null = selectedEventId
    ? events.find(e => e.id === selectedEventId) ?? null
    : null
  const activeEventLive = activeEvent?.status === 'open'

  // 🔴 THE PAIR, TAKEN FROM ONE OBJECT, IN ONE EXPRESSION. See `eventScopeRef` for both invariants.
  // ⚠️ THIS EFFECT IS DECLARED HERE, IMMEDIATELY BELOW ITS SOURCE, AND THAT POSITION IS LOAD-BEARING:
  // the effect that calls `fetchAll` is declared further down, and React runs passive effects in
  // declaration order within a commit — so on the render where the operator's switch lands, this ref is
  // written before the request that reads it is built. Moving either effect past the other reopens the
  // one-poll window this fix exists to close.
  // ⚠️ It runs on every events poll (fresh objects each time) and writes a ref only — no state, no
  // fetch, no loop.
  useEffect(() => {
    eventScopeRef.current = activeEvent ? { id: activeEvent.id, date: activeEvent.event_date ?? null } : null
  }, [activeEvent])

  // ── 🔴 ANDROID HARDWARE BACK — THE KDS IS THE HIGH-RISK SURFACE ────────────────────────────────
  // ORDERED INNERMOST FIRST, which here means highest z-index first: the demo intro (z-70) sits over
  // the device sheet and the finish confirm (both z-60), which sit over the event menu and the
  // screen-off warning (z-50). Back closes exactly the top one and consumes the press.
  //
  // 🔴 AND WITH NOTHING OPEN, BACK DOES NOTHING. There is no navigation entry in this list and no
  // fallback in the handler — an operator mid-service CANNOT lose the board to a stray edge-swipe,
  // which is what happened before: canGoBack() was true and Capacitor navigated the page away.
  // ⚠️ Do not add a "go back to the dashboard" entry here. The Dashboard control in the header is the
  // deliberate way off this screen; a gesture is not.
  // 🔴 THE TWO FINISH-TIME ARMS ARE NON-COMMITTING, AND THEY ARE FIRST BECAUSE THEY STACK HIGHEST
  // (z-70 confirm over z-60 picker). Back DISMISSES the confirm without writing and DISCARDS the
  // picker's selection — it can never be the thing that changes an event's finish time. That is the
  // §38 rule verbatim: back may dismiss a decision, never make one.
  // ⚠️ Gated on `!finishTimeBusy` so a press mid-write cannot unmount the modal while its POST is in
  // flight, matching the eventCancelTarget arm below. ONE arm covers both of the modal's steps now that
  // the step lives inside it — and the OUTCOME is unchanged: back at the picker dismissed it, back at
  // the confirm dismissed it, and back at either still does exactly that.
  useAndroidBack([
    [isDemo && showKdsIntro, () => dismissKdsIntro()],
    [!!finishTimeTarget && !finishTimeBusy, () => setFinishTimeTarget(null)],
    // 🔴 NO LONGER `&& !isDemo`, AND THAT IS A CONSEQUENCE OF THE MERGE, NOT A NEW DECISION. This
    // panel is now the phone's ONLY route to the two step switches, and the steps panel it absorbed
    // was registered unconditionally — keeping the demo clause would have TAKEN BACK Android-back
    // closing from a demo operator who has it today.
    [deviceOpen, () => setDeviceOpen(false)],
    [!!finishConfirm, () => setFinishConfirm(null)],
    [showEventPicker, () => setShowEventPicker(false)],
    // The extra-wait picker — opened FROM the event menu and stacked over it, so it dismisses first.
    [showExtraWaitPicker, () => setShowExtraWaitPicker(false)],
    [!!eventCancelTarget && !eventCancelBusy, () => setEventCancelTarget(null)],
    // 🔴 THE REJECT GATE. It is registered HERE, in this page's ordered list, and NOT from inside
    // RejectOrderModal — `useAndroidBack` keeps ONE LIFO stack and the ORDER of this array is the
    // nesting, so a registration made from the component would sit at its own position rather than the
    // one this surface chose. Above the event menu because it is opened from a card, over everything.
    [!!rejectingOrder, () => setRejectingOrder(null)],
    // 🔴 `isPaused` IS DECLARED BELOW THIS LINE (:~1534) AND CANNOT BE READ HERE — this array is
    // evaluated during render, so referencing it would be a TDZ ReferenceError. The identical
    // expression is inlined from `pausedUntil` (:165) instead. It must stay in step with the modal's
    // mount gate: back/escape has to dismiss exactly what can be opened.
    [showEventMenu && !!activeEvent && (!isDemo || (pausedUntil ? new Date(pausedUntil) > new Date() : false)), () => setShowEventMenu(false)],
    [showScreenOffWarning, () => setShowScreenOffWarning(false)],
  ])

  // ── 🔴 THE SEED. RUNS ONCE, EVER. ───────────────────────────────────────────────────────────────
  // Priority 1: the id handed over by the dashboard (?event_id=), IF it is one of this truck's upcoming
  //             events. Membership is the validation — an id for another truck, or a deleted, cancelled
  //             or past event, simply is not in the list and falls through, which is the no-param path.
  // Priority 2: pickDefaultEventByTime over the SAME candidate set the dashboard uses. Its documented
  //             order is "in progress by time, else earliest upcoming, else most recent past", which is
  //             precisely "the current or next event". THE SECOND RESOLVER THAT WAS HERE IS DELETED —
  //             there is now one implementation of this question and both surfaces call it.
  // 🔴 `seededRef` is set BEFORE anything else and never cleared, so this body cannot run twice however
  // many times `events` changes. That is the guarantee behind "seed once, then hold".
  useEffect(() => {
    if (seededRef.current) return
    if (!events.length) return          // nothing to seed FROM yet — wait for the first successful fetch
    seededRef.current = true
    if (selectedEventId && events.some(e => e.id === selectedEventId)) return   // the URL seed resolved
    setSelectedEventId(pickDefaultEventByTime(events)?.id ?? null)
  }, [events, selectedEventId])

  // ── HEARTBEAT — THE SHARED EMITTER (lib/native/useHeartbeat) ────────────────────────────────────
  // 🔴 THREE DEFECTS CLOSED BY ONE CALL. This was an inline near-duplicate of the dashboard's effect
  // that lacked two of its parts: no `deviceOnline` dep, so a reconnect waited up to 15s for the next
  // tick; and no native foreground re-ping, so a BACKGROUNDED KDS — a sleeping kitchen iPad — went
  // stale in 30 seconds and paused a truck's ordering. Both now come from the shared hook.
  // 🔴 `earlyPing` IS THE SWITCH-GAP FIX, AND IT IS THIS SURFACE'S ALONE. The dashboard's interval
  // clears the instant it unmounts; a KDS mount then needs auth, `/api/dashboard` AND a second
  // `/api/events/manage` round trip before `activeEvent` exists — against a 30-SECOND threshold. One
  // ping on mount, ungated, closes that. See the hook for why weakening the gate is safe: the monitor
  // only pauses `status='open'` events, so an off-event stamp cannot cause a wrong pause.
  useHeartbeat({ token, vanId, activeEventLive, deviceOnline, earlyPing: true })

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
    try { localStorage.setItem(`hg_kds_keepawake_${token}`, value ? 'on' : 'off') } catch {}
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

  // ── 🔴 ONE BUTTON, TWO MOUNTS — THE HEADER AND THE DEVICE SHEET ─────────────────────────────────
  // 🔴 IT IS A PLACED VALUE, NOT A COPY. The `paidChip` / `statusBadgeKds` pattern: computed once,
  // rendered wherever it is needed. Both mounts are THIS element, with THIS `onClick`, so there is one
  // acquire path and no second implementation to drift.
  // 🔴 AND THE PATH IS A REAL `click`. `onClick` → `toggleKeepScreenOn` → `applyKeepScreenOn(true)` →
  // `keepAwake()`, which reaches `navigator.wakeLock.request` with NOTHING awaited before it (the
  // platform check is synchronous and the only dynamic import is on the native branch). Safari spends
  // the user activation on the first `await`, so that ordering is the whole reason this works.
  // 🔴 NEVER A `pointerdown` LISTENER. The global one-shot pointerdown was the previous bug and was
  // removed; keepAwake.ts's own note says an unreliable pointerdown-triggered request "is exactly what
  // failed on Safari". Do not reintroduce anything of that shape.
  // 🔴 WHY IT IS BACK ON THE HEADER (and sound is not): ON WEB THIS BUTTON IS THE ACQUISITION
  // MECHANISM, not a display. The browser drops the lock whenever the page loses visibility or focus,
  // so an operator who navigates away and back must RE-ACQUIRE — and a control behind two taps in a
  // sheet is the wrong place for the recovery action. The native app holds it through the plugin and
  // never needs this; the web KDS does, every time.
  // ⚠️ `screenHeld`, NOT THE STORED SETTING. It shows what the lock is ACTUALLY doing, so "on" can
  // never claim something the device is not doing. `wakeState` may DISPLAY; it must never DECIDE —
  // which is why `toggleKeepScreenOn` still branches on `keepScreenOn`.
  // ⚠️ THE LABEL IS THE ONLY THING THAT DIFFERS between the two mounts: the header carries the whole
  // phrase, the sheet's row already has "Keep the screen on" beside it and needs only the state word.
  // 🔴 `wordsOnly` IS OPTIONAL AND DEFAULTS TO FALSE, WHICH IS WHY THE `sm:`-AND-ABOVE MOUNT IS
  // UNCHANGED — without it this renders exactly what it always rendered, ☀️ when the lock is held and 🌙
  // when it is not. The PHONE mount passes it, and gets no glyph at all: the row carries words.
  // 🔴 TWO GLYPH ATTEMPTS HAVE NOW BEEN REJECTED — ☀️/🌙 as a pair, then the sun struck through — and the
  // conclusion recorded here is that a state GLYPH cannot say "this is a setting, not a fault". The
  // words can. This costs ~70px on the narrowest row in the product and is spent deliberately.
  // 🔴 ONE IMPLEMENTATION. The handler, the `aria-pressed`, the colours and the binary `screenHeld` rule
  // are shared, and none of them branches on this flag.
  // 🔴 THE NEW-ORDER SOUND MASTER, AS A CONTROL RATHER THAN A BADGE — ONE IMPLEMENTATION, TWO MOUNTS,
  // exactly like `screenOnBtn` below it. It was on the phone row only; at `sm:` and above the master
  // lived INSIDE the device sheet and the header showed a 🔕 BADGE on the 📱 button instead — a laptop
  // operator could see that the ding was off but had to open a sheet to change it, which is the wrong
  // way round for the control an operator hits when the van gets loud.
  // ⚠️ TWO DISTINCT GLYPHS, NEVER ONE STRUCK THROUGH: 🔔 and 🔕 each read as themselves. Colour carries
  // the same state a second time, and the accessible name says it in words at both states, because the
  // glyph is the only visible label. The handler is the original — enabling primes the audio, because
  // enabling is the gesture the browser requires.
  const soundBtn = (extra: string) => (
    <button
      type="button"
      onClick={() => setSoundEnabled(v => { const next = !v; if (next) primeAudio(); return next })}
      aria-pressed={soundEnabled}
      aria-label={soundEnabled ? 'New-order sound is on — tap to turn it off' : 'New-order sound is off — tap to turn it on'}
      title={soundEnabled ? 'New-order sound is on — tap to turn it off' : 'New-order sound is off — tap to turn it on'}
      className={`${extra} items-center px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${soundEnabled ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}
    >
      <span aria-hidden>{soundEnabled ? '🔔' : '🔕'}</span>
    </button>
  )

  const screenOnBtn = (label: string, wordsOnly = false) => (
    <button
      type="button"
      onClick={toggleKeepScreenOn}
      aria-pressed={screenHeld}
      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${screenHeld ? 'bg-teal-600 text-white' : 'bg-slate-200 text-slate-600'}`}
    >
      {!wordsOnly && <span aria-hidden>{screenHeld ? '☀️' : '🌙'}</span>}
      <span>{label}</span>
    </button>
  )

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
          ? `Buzzer ${prior ?? ''} removed`
          : `Buzzer ${buzzerNumber} saved`)
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

  // ── POST-GATE HANDLING — THE SHARED HANDLER (lib/native/useGatedActionResult) ────────────────────
  // 🔴 THIS SURFACE USED TO CARRY A PARTIAL COPY OF THE DASHBOARD'S POST-GATE BLOCK, AND THE GAPS WERE
  // NOT DESIGN. It toasted only for 'ready' — a queued or committed `mark_paid`/`collected` produced
  // nothing at all, live-verified on the KDS — it offered Undo only for 'ready', it had no payment
  // overlay, and its `catch {}` was empty, so a server rejection was swallowed whole. All four are gone:
  // this now runs the DASHBOARD'S code, not a matched-looking second copy of it.
  // ⚠️ THE TWO CALLBACKS BELOW ARE THIS SURFACE'S ALONE — the pending-sync set and its counter, which the
  // dashboard has no equivalent of. The dashboard's prep-pill callbacks are the mirror case and are not
  // passed here, because this screen has no prep pills. An omitted callback omits the effect.
  // ── 🔴 WHAT A PLAIN PAID BUTTON RECORDS ON THIS TRUCK ────────────────────────────────────────────
  // The SAME expression the dashboard uses, for the same reason: it decides both what the request body
  // carries and what the toast says, so the two cannot disagree. `takes_cash` is a DECLARATION (Manage ->
  // Order settings, "Do you take cash?"), so OFF means a plain "Mark paid" is a card payment on the
  // operator's own terminal; ON means the card renders the explicit Cash/Card pair and nothing is
  // asserted here. ⚠️ Never Stripe: an online payment books `channel:'online'` and never reaches these.
  // 🔴 ALWAYS `card` — THE `takesCash` GATE IS GONE ON BOTH SURFACES, AND THE REASONING IS THE
  // DASHBOARD'S, RECORDED THERE IN FULL: `takes_cash` adds a BUTTON, it does not change what the plain
  // button MEANS. The explicit `*_cash` / `*_card` names still answer for themselves and the server
  // derives their method from the string, so this value never reaches them.
  // ⚠️ KEEP THE TWO SURFACES IDENTICAL. This expression and the dashboard's are one rule; if either is
  // ever changed alone, one truck records two different answers depending on which screen was tapped.
  const plainPaidMethod: 'card' | null = 'card'

  const handleGateResult = useGatedActionResult<Order>({
    showToast,
    findOrder: (k) => orders.find(o => o.order_key === k),
    refreshPendingStatus, dropOverlayEntry, scheduleReadyEmail, undoReady,
    // Through the REF, not a direct self-call: handleAction is a useCallback, and naming itself in its
    // own body would put it in its own dependency array. The retry/Undo is the SAME handler, so it takes
    // the same offline gate.
    runAction: (a, k) => { void handleActionRef.current(a, k) },
    refetch: () => fetchAllRef.current(),
    setActionLoading, refreshPendingPayment, plainPaidMethod,
    onQueued: (k) => { setPendingSyncCount(c => c + 1); setPendingSync(prev => new Set(prev).add(k)) },
    onQueuedUndone: (k) => {
      setPendingSync(prev => { const n = new Set(prev); n.delete(k); return n }); setPendingSyncCount(c => Math.max(0, c - 1))
    },
  })

  // ── 🔴 THE PRE-GATE INTERCEPTION. IT MUST RETURN BEFORE `gatedAction`. ──────────────────────────
  // The dashboard's `doAction` opens a modal and returns for `reject`; this is the same shape. It is
  // ABOVE the gate for a reason that only shows up offline: the outbox freezes the request body, so a
  // reason not captured here can never be added later.
  // ⚠️ `cancel` IS NOT INTERCEPTED HERE, AND IT IS NOT AN OVERSIGHT — see the note at the modal mount.
  const rejectFromCard = useCallback((orderKey: string) => {
    setRejectingOrder(orders.find(o => o.order_key === orderKey) ?? null)
  }, [orders])

  // ⚠️ ENFORCEMENT LAYER 2 OF 2 — the modal's disabled button is layer 1. Both survive on both surfaces.
  const confirmRejectOrder = useCallback(async (fullReason: string) => {
    if (!rejectingOrder) return
    if (!fullReason) return
    const orderKey = rejectingOrder.order_key
    setRejectingOrder(null)
    setActionLoading(`reject-${orderKey}`)
    try {
      // 🔴 THE REASON IS IN THE BODY, BEFORE THE GATE — byte-identical to the dashboard's call, so a
      // queued reject replays with its reason on this surface too.
      const result = await gatedAction({
        url: '/api/dashboard/action',
        body: { token, pin, action: 'reject', order_key: orderKey, rejectionReason: fullReason },
        kind: 'status', order_key: orderKey, online: isOnline(), expectedFrom: STATUS_REPLAY_EXPECTED_FROM,
      })
      await handleGateResult(result, 'reject', orderKey)
    } catch { showToast('Failed to reject', 'error') } finally { setActionLoading(null) }
  }, [token, pin, rejectingOrder, handleGateResult, showToast])

  // `opts.booksPayment` is OrderCard's toast hint for the one-press "Mark paid & collected" — carried
  // straight through to the shared handler and NEVER into the request body, exactly as the dashboard
  // does it. The server sees the same `collected` action it always has.
  const handleAction = useCallback(async (action: string, orderKey: string, opts?: { booksPayment?: boolean }) => {
    // 🔴 THE ONE PRE-GATE STATEMENT THIS SURFACE HAS, AND IT MIRRORS THE DASHBOARD'S LINE FOR LINE.
    if (action === 'reject') { rejectFromCard(orderKey); return }
    setActionLoading(`${action}-${orderKey}`)
    try {
      // Through the offline GATE: online → normal write; offline (native, unreachable) → durable outbox +
      // queued result. `expected_from` guards the eventual replay (customer-cancel-wins), riding only on the
      // queued op so the online request is byte-identical.
      const result = await gatedAction({
        url: '/api/dashboard/action',
        // 'ready' defers the customer email so the undo toast can cancel it (mirrors the dashboard).
        body: { token, pin, action, order_key: orderKey, ...(action === 'ready' ? { defer_email: true } : {}),
          // The plain paid buttons carry the method this truck's own setting declares — see plainPaidMethod.
          ...(PLAIN_PAID_ACTIONS.has(action) && plainPaidMethod ? { method: plainPaidMethod } : {}) },
        kind: 'status', order_key: orderKey, online: isOnline(), expectedFrom: STATUS_REPLAY_EXPECTED_FROM,
      })
      // 🔴 THE EMPTY `catch {}` IS GONE. The shared handler throws on a server rejection exactly as the
      // dashboard always did, and this catch is what surfaces it.
      await handleGateResult(result, action, orderKey, opts?.booksPayment)
    } catch (err: any) { showToast(err.message || 'Failed', 'error') } finally { setActionLoading(null) }
    // `plainPaidMethod` is listed because this body reads it. It is a plain derived value, so it changes
    // only when the truck's setting or the active event does — exactly when this handler SHOULD be
    // rebuilt, since a stale copy would attach the previous truck's declaration to a new request.
  }, [token, pin, handleGateResult, showToast, rejectFromCard, plainPaidMethod])
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
    // 🔴 markPending BEFORE the setState, exactly as the dashboard does it. The `fetchAllRef.current()`
    // at the bottom of this handler is a refetch of our own write; without this registration it would
    // apply whatever the server happened to return and undo the tap. The guard releases itself as soon
    // as the server echoes this value back.
    // ⚠️ A RESUME REGISTERS A PENDING `null`, and that is a real guard, not an absent one — which is why
    // applyPending tests `key in p` rather than truthiness.
    markPending('vanPausedUntil', paused_until)
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
    // `markPending` is a useCallback with an empty dep array, so its identity never changes and adding
    // it here cannot re-create this handler. It is listed only so this edit introduces no new lint
    // finding — the file's pre-existing findings are left exactly as they were.
  }, [token, pin, pausedUntil, markPending])

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
    // 🔴 THE SITE A COPY OF `fetchAll` WOULD HAVE MISSED. This path builds its own params and sent
    // `{token, pin}` and nothing else — no `event_id`, no `date` — so its response, which is the FIRST
    // board an operator sees after entering the PIN, was resolved entirely by the route's fallback.
    // It goes through the SAME `applyEventScope`, not a second copy of the same three lines.
    // ⚠️ AT PIN TIME THE SCOPE IS USUALLY ABSENT — `events` has not been fetched — so this most often
    // sends the ?event_id= handover alone or nothing at all, exactly as before. It is correct on the
    // re-auth case, where a board that has been running hands over its committed pair.
    // ⚠️ `van_id` IS STILL NOT SENT HERE and is NOT added by this task — it was not in scope. Reported.
    const requestedEventId = applyEventScope(params, selectedEventId)
    const res = await fetch(`/api/dashboard?${params}`, { headers: await nativeAuthHeader() })
    const data = await res.json()
    if (!res.ok) {
      setPinError('Incorrect PIN')
      return
    }
    // The same served-versus-requested check as fetchAll, before anything reaches state. Same reasons,
    // same `undefined`-is-not-a-mismatch rule — see the note there.
    const servedEventId = data.offlinePauseEventId
    if (requestedEventId && servedEventId !== undefined && servedEventId !== requestedEventId) {
      console.error(`[kds] event scope mismatch on PIN submit — requested ${requestedEventId}, served ${servedEventId ?? 'null'}`)
      setEventScopeMismatch({ requested: requestedEventId, served: servedEventId ?? null })
      setOrders([])
      setPin(pinInput)
      setRequiresPin(false)
      return
    }
    setEventScopeMismatch(null)
    setPin(pinInput)
    setTruck(data.truck)
    setShowCookingStep(data.vanShowCookingStep ?? false)
    setActiveVanCount(data.activeVanCount ?? null)
    // Fix 3's filter applies here too — same reasoning, same expectation that it can never fire.
    setOrders(prev => applyPendingBuzzers(mergeOrders(prev, (data.orders ?? []).filter((o: Order) => !requestedEventId || o.event_id === requestedEventId)), peekPendingBuzzer))
    // The SECOND read path, and it had the identical defect. Same field, same guard — the guard is a
    // no-op here in practice (nothing can be pending before the PIN is accepted) but the two seeds must
    // not diverge; a field fixed in one place and not the other is how this class of bug survives.
    setPausedUntil(applyPending('vanPausedUntil', data.vanPausedUntil ?? null))
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
      setEvents(prev => prev.map(e => e.id === eventId ? { ...e, status: 'open' as const, opened_at: new Date().toISOString() } : e))
      showKdsToast('Event started')
      fetchAllRef.current() // re-sync from the server read so status propagates immediately
    } catch (err: any) { showKdsToast(err.message || 'Failed') }
  }

  // ── `extendEvent` DELETED (16 August) ───────────────────────────────────────────────────────────
  // 🔴 IT HAD NO CALLERS LEFT once this screen's recently-closed banner lost its "Extend 30 min". The
  // Manage event menu moved to `applyFinishTime` when the shared picker replaced the +30 control.
  // ⚠️ NOTHING QUEUED CAN LAND ON IT. It was a CLIENT function; an offline replay carries the POST body
  // to /api/events/action and is served by that route's `update` handler, which is untouched — so an op
  // queued before this change still replays, and `pendingSyncCount` is still incremented by
  // `applyFinishTime`'s own `data?.queued` branch below.
  // 🔴 THE CAPABILITY IS NOT GONE — `applyFinishTime` makes the identical write.

  // ── CHANGE EVENT FINISH TIME ────────────────────────────────────────────────────────────────────
  // 🔴 THE SAME WRITE `extendEvent` MAKES, AND NOTHING MORE: one POST to /api/events/action with
  // action:'update' and a payload of exactly `{ end_time }`. That handler's allow-list is
  // ['venue_name','venue_address','start_time','end_time','customer_note','auto_open','auto_close','notes']
  // and its only other write is `updated_at`. It touches NO order, NO status, NO production slot and
  // imports nothing from lib/payments/. This control changes WHICH TIMES A NEW ORDER CAN BE PLACED FOR
  // and nothing else.
  // ⚠️ ABSOLUTE, NOT RELATIVE — and now the ONLY writer of this column on this screen. The deleted
  // `extendEvent` took `addMins` and could only ever push the finish LATER; this takes the finish time
  // itself, so a truck that sells out early can bring it forward.
  const applyFinishTime = async (eventId: string, newEnd: string) => {
    setFinishTimeBusy(true)
    try {
      const res = await fetch('/api/events/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action: 'update', eventId, payload: { end_time: newEnd } }) })
      const data = await res.json()
      if (data?.queued) { setPendingSyncCount(c => c + 1); setFinishTimeTarget(null); return }
      if (!res.ok) throw new Error(data.error)
      setEvents(prev => prev.map(e => e.id === eventId ? { ...e, end_time: newEnd } : e))
      showKdsToast(`Finish time now ${newEnd}`)
      setFinishTimeTarget(null)
    } catch (err: any) { showKdsToast(err.message || 'Failed') }
    finally { setFinishTimeBusy(false) }
  }

  // Styled finish confirm (replaces window.confirm). finishEvent OPENS the modal; doFinishEvent runs
  // the close after Yes. The timing-aware (finishingEarly = now<end_time, minute-parsed) logic is
  // UNCHANGED — only the confirm SURFACE moved to the modal below.
  const finishEvent = (eventId: string) => {
    const ev = events.find(e => e.id === eventId)
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
      setEvents(prev => prev.map(e => e.id === eventId ? { ...e, status: 'closed' as const, closed_at: new Date().toISOString() } : e))
      setShowEventMenu(false); showKdsToast('Event finished')
      fetchAllRef.current() // re-sync so the status flips to "Finished" immediately
    } catch (err: any) { showKdsToast(err.message || 'Failed') }
  }

  // ── OPEN THE GATE. WAS: `if (!window.confirm('Cancel this event? This cannot be undone.')) return` ──
  // 🔴 THE MENU IS CLOSED ON THE WAY IN, matching the dashboard: the shared modal and the event menu are
  // both z-50, so closing the menu removes the stacking question rather than answering it with a z-index,
  // and leaves exactly ONE overlay for the back button to dismiss. On a KDS a stray edge-swipe over a
  // half-stacked pair of overlays is precisely the accident the back handler exists to prevent.
  // ⚠️ TAKES THE EVENT, NOT AN ID — the modal needs the venue, date and window, and the one call site is
  // already gated on `activeEvent`. No lookup means no way to silently cancel nothing.
  const cancelEventFromMenu = async (ev: TruckEvent) => {
    setShowEventMenu(false)
    setEventCancelCount(0); setEventCancelTarget(ev)
    try {
      const res = await fetch(`/api/events/affected-orders?eventId=${ev.id}&token=${token}`)
      const data = await res.json()
      if (res.ok) setEventCancelCount(data.count ?? 0)
    } catch { /* silently fail - the gate still works, the count just stays hidden */ }
  }

  // The request itself, UNCHANGED — including the offline `queued` branch, which must keep working: the
  // KDS is the surface most likely to be offline mid-service. Only the reason and note are new, and both
  // are optional; leave them blank and the body is what `payload: {}` produced.
  const doCancelEvent = async (eventId: string, cancellationReason: string, cancellationNote: string) => {
    setEventCancelBusy(true)
    try {
      const res = await fetch('/api/events/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action: 'cancel', eventId, payload: { cancellationReason, cancellationNote } }) })
      const data = await res.json()
      if (data?.queued) { setPendingSyncCount(c => c + 1); setShowEventMenu(false); return }
      if (!res.ok) throw new Error(data.error)
      // 🔴 THE ONE PLACE THE DEFAULT PICK RUNS AGAIN, AND IT IS OPERATOR-INITIATED. The held event has
      // just been cancelled by a human on this screen, so there is nothing left to hold; leaving
      // `selectedEventId` null would strand the board on a blank event with no way back (the seed latch
      // has long since fired). This is a deliberate re-pick at the moment of a deliberate action — it is
      // NOT the automatic re-resolution the latch exists to prevent, and it cannot fire on a poll.
      const remaining = events.filter(e => e.id !== eventId)
      setEvents(remaining)
      setSelectedEventId(pickDefaultEventByTime(remaining)?.id ?? null); setShowEventMenu(false); showKdsToast('Event cancelled')
      fetchAllRef.current() // re-sync so the cancelled event drops out immediately
    } catch (err: any) { showKdsToast(err.message || 'Failed') }
    finally { setEventCancelBusy(false); setEventCancelTarget(null) }
  }

  const saveEventNote = async (eventId: string) => {
    try {
      const res = await fetch('/api/events/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action: 'update', eventId, payload: { customer_note: eventNoteInput } }) })
      const data = await res.json()
      if (data?.queued) { setPendingSyncCount(c => c + 1); setShowEventMenu(false); return }
      if (!res.ok) throw new Error(data.error)
      setEvents(prev => prev.map(e => e.id === eventId ? { ...e, customer_note: eventNoteInput || null } : e))
      setShowEventMenu(false); showKdsToast('Note saved')
    } catch (err: any) { showKdsToast(err.message || 'Failed') }
  }

  // ── 🔴 CHANGING EVENT SETS A NEW HELD VALUE. IT DOES NOT RE-ENABLE RESOLUTION. ──────────────────
  // `seededRef` stays true, so nothing re-derives afterwards: the operator's choice is now the held one
  // and the board holds it exactly as it held the seed.
  // ⚠️ THE CONFIRM FIRES ON EVERY SWITCH, not only when the current event is 'open' as it used to. This
  // control is a row of small chips on a screen that sits on a counter in a working kitchen, and a
  // mis-tap used to move the whole board silently. The dialog is the accident guard; it names what is
  // being left and how many orders are on it, because the orders are what an operator actually loses
  // sight of. Do not soften it back to an `if (open)` — the finished-event case is exactly when unserved
  // food is still on the screen.
  const switchEvent = (event: TruckEvent) => {
    const active = selectedEventId ? events.find(e => e.id === selectedEventId) ?? null : null
    if (active && event.id !== active.id) {
      const onScreen = orders.filter(o => ['pending', 'confirmed', 'modified', 'cooking', 'ready'].includes(o.status)).length
      const orderPart = onScreen > 0 ? ` ${onScreen} order${onScreen === 1 ? '' : 's'} on this screen will be replaced.` : ''
      if (!window.confirm(`Switch from ${active.venue_name} to ${event.venue_name}?${orderPart} Tap the current event to switch back.`)) return
    }
    setSelectedEventId(event.id)
  }

  // activeEvent + activeEventLive resolved once near the top (above the heartbeat effect).
  activeEventIdRef.current = activeEvent?.id ?? null // keep the ref current for the pause/wait callbacks
  const recentlyClosed = !!(activeEvent?.status === 'closed' && activeEvent.closed_at && Date.now() - new Date(activeEvent.closed_at).getTime() < 10 * 60 * 1000)

  const isPaused = pausedUntil ? new Date(pausedUntil) > new Date() : false
  // ── 🔴 THE OFFLINE PAUSE, WITH THE DASHBOARD'S GATE — NOT OR'd RAW ──────────────────────────────
  // The dashboard's expression, reproduced:
  //     const offlinePausedDisplay = offlinePaused && !(deviceOnline && activeEventLive)
  //     const paused = manualPaused || offlinePausedDisplay
  //     const pauseReason = manualPaused ? 'manual' : offlinePausedDisplay ? 'offline' : null
  // 🔴 WHY THE GATE AND NOT A RAW OR: `online_paused_until` lingers in the DB for ~15-30s after a
  // device reconnects, because only the next heartbeat clears it. Showing it raw would tell a working
  // kitchen its orders are paused when they are not. The gate suppresses the DISPLAY the instant this
  // device is back and its event is live, exactly as the dashboard does.
  // ⚠️ MANUAL WINS, in the same order the dashboard uses, so the two can never disagree about which
  // reason to name. The manual half — `pausedUntil`, its applyPending guard and its resume — is
  // untouched by this.
  const offlinePausedRaw = onlinePausedUntil ? new Date(onlinePausedUntil) > new Date() : false
  const offlinePausedDisplay = offlinePausedRaw && !(deviceOnline && activeEventLive)
  const anyPaused = isPaused || offlinePausedDisplay
  const pauseReason: 'manual' | 'offline' | null = isPaused ? 'manual' : offlinePausedDisplay ? 'offline' : null

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

  // ── 🔴 THE TWO SWITCHES, RESOLVED. THIS IS THE ACCEPTANCE TEST IN FOUR LINES. ────────────────────
  // HANDOVER's unset default is `!showPaidStep`, and that is NOT arbitrary — it is exactly what HEAD
  // rendered. HEAD computed `hidePayments = showPaidStep && showPaymentsPref !== true`, so with nothing
  // stored a show_paid_step-TRUE truck got the COOK button set (handover off) and a show_paid_step-FALSE
  // truck got the WINDOW branch (handover on). Both are reproduced here by construction.
  //
  // READY's unset default is the COMPLEMENT of handover, which is also what HEAD rendered: HEAD had no
  // third combination at all, so every device was ready-on XOR handover-on. Since `hg_kds_readystep_` is
  // absent from HEAD — never committed, never written on any device — `readyPref` is null everywhere on
  // first load and every existing device lands on that complement.
  //
  // 🔴 THE ONE DIVERGENCE FROM HEAD, DECLARED RATHER THAN HIDDEN: a device that stored payments 'off'
  // while the truck had show_paid_step TRUE, on a truck that has SINCE turned show_paid_step off, gets
  // handover OFF here where HEAD gave it the window branch. That is the widening this change is for —
  // the stored preference now means something on every truck — and it is the only combination in which
  // an existing device renders differently. See docs/kds-two-switches-build-report.md.
  const handoverOn = handoverPref ?? !showPaidStep
  const readyOn = readyPref ?? !handoverOn
  // `hidePayments` now means exactly "this screen does not do the handover step". Every existing
  // consumer — the cook-branch condition, partPaidRow, the money chips below — keeps its meaning,
  // because "does not take money" and "does not hand over" were already the same thing on this screen.
  const hidePayments = !handoverOn

  // ── 🔴 THE VIEW IS NOW DERIVED FROM THE HANDOVER SWITCH. THE CONTROL IS GONE. ───────────────────
  // A screen that hands over is a WINDOW; a screen that only makes food is a COOK screen. That was
  // always the relationship — the old Window/Cook control and the payments chip were two ways of saying
  // the same thing, which is why a payments-off window device already rendered the cook button set.
  // Deriving it means every existing consumer keeps working untouched: `showPrices`, the cook card's
  // header shape, padding, item grouping and type size, and the cook-branch condition all read
  // `viewMode` and none of them needs to know where it came from.
  // ⚠️ `can('cook_screen')` NO LONGER GATES ANYTHING HERE — see the report. The making screen is now
  // reachable on every plan, because the control that was gated no longer exists.
  // ── 🔴 TWO VALUES, NOT ONE. THIS SPLIT IS THE POINT OF THE CHANGE. ──────────────────────────────
  // `boardMode` decides WHICH ORDERS ARE ON THE BOARD and nothing about appearance. `cardMode` decides
  // WHAT A CARD LOOKS LIKE and nothing about membership. They used to be one value, which meant a
  // display preference could not exist without moving tickets.
  // 🔴 `displayOrders` READS boardMode AND MUST NEVER READ cardMode. A display control that changes
  // which orders are visible is not a display control; on an unattended board it is a way to lose a
  // ticket by choosing a font size.
  const boardMode: KdsView = handoverOn ? 'window' : 'cook'
  // ⚠️ UNSET FOLLOWS THE BOARD: a making screen defaults to Cook cards, a handover screen to Full. Once
  // the operator picks, their choice sticks — which is why this is tri-state and `null` is not `false`.
  const cardMode: KdsView = cardModePref ?? boardMode

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
  //
  // 🔴 AND THE ONE GUARD THE DUAL WRITE NEEDS. After a WKWebView cold kill localStorage can be empty
  // while Preferences still holds "handover on". For the frames before the reconcile lands, `handoverOn`
  // would fall to its unset default and — on a show_paid_step-true truck — DROP every 'ready' order from
  // the board. Showing MORE orders than configured is visible and harmless; showing fewer silently drops
  // a ticket. So while nothing is stored locally AND the reconcile has not returned, the board does not
  // narrow. It costs one render pass and only on that path: with anything in localStorage, or once the
  // reconcile lands, this term is false and the filter is HEAD's exactly.
  const boardKeepsReady = handoverOn || (handoverPref === null && !prefsReconciled)
  const windowOrders = boardKeepsReady
    ? activeOrders
    : activeOrders.filter(o => o.status !== 'ready')

  // 🔴 THE GUARD NOW HAS TO COVER THE COOK PATH TOO, AND THIS IS THE ONE PLACE THE DERIVATION MOVED A
  // BOARD DECISION. `activeView` used to be independent of the switches, so an unreconciled device
  // always took `windowOrders` and got `boardKeepsReady` for free. With the view derived, an
  // unreconciled device on a show_paid_step-TRUE truck resolves to 'cook' and would take `cookOrders`,
  // which has no guard — dropping every 'ready' order for the frames before Preferences lands. The
  // guard is UNCHANGED (H7); it is applied on both paths rather than one.
  const displayOrders = (boardMode === 'cook' ? (boardKeepsReady ? activeOrders : cookOrders) : windowOrders)
    .slice()
    .sort((a, b) => {
      const ta = a.slot ? new Date(`1970-01-01T${a.slot}`).getTime() : 0
      const tb = b.slot ? new Date(`1970-01-01T${b.slot}`).getTime() : 0
      return ta - tb
    })

  // 🔴 THE GRID CAP IS GONE. It was `MAX_GRID_VISIBLE = activeLayout === 'grid' ? 8 : 6`, sliced into
  // `displayOrders` for grid only, with the remainder reported by a "+N more orders in queue" tile.
  // Two reasons it went, and the second is the one that mattered:
  //   1. It was NOT viewport-adaptive while the COLUMN COUNT IS. The grid is
  //      `repeat(auto-fill, minmax(240px, 1fr))`, so a wide screen resolves 5-6 columns and 8 cards
  //      filled one row and a fragment, leaving the rest of the board empty with orders hidden.
  //   2. Its tile carried `col-span-2`. At phone width auto-fill resolves to ONE column, and a
  //      span-2 item forces an IMPLICIT second column sized by `grid-auto-columns: auto` rather than
  //      the `minmax` - unequal tracks, and cards auto-flowed into the narrow one. That was the
  //      portrait overlap. See docs/kds-layout-read.md.
  // ⚠️ SCROLLING IS NOT NEW BEHAVIOUR. The queue panel below already carries `overflow-y-auto` and the
  // LIST branch has always rendered every order through it. The grid branch was opting out of a
  // behaviour that already existed; it now does what list does.
  // ⚠️ `visibleOrders` IS KEPT AS THE NAME rather than pointing the map at `displayOrders`: the
  // conflict-signal comment above names it, and one binding is a smaller change than two edits.
  const visibleOrders = displayOrders

  // Done orders: last 5 collected (window view only)
  const doneOrders = overlayedOrders
    .filter(o => o.status === 'collected')
    .slice(0, 5)

  const allDayCounts = getAllDayCounts(activeOrders)
  const allDayPills = Object.entries(allDayCounts)

  // ── THE DISPLAY CHOICE, AND ONLY THE DISPLAY CHOICE ─────────────────────────────────────────────
  // 🔴 THIS USED TO BE `cardViewMode`, FED STRAIGHT INTO OrderCard's `viewMode`. That was the defect:
  // `renderButtons` reads `viewMode`, so a DISPLAY control was picking the BUTTON branch — and at status
  // 'ready' it picked the cook branch, which has no 'ready' case and returns null. A card with no
  // buttons at all, on a live board. `viewMode` is `boardMode` again (the two switches), and the
  // display choice now produces ONE boolean that drives MONEY and nothing else.
  // ⚠️ IT REACHES NO FILTER, NO BUTTON AND NO DIMENSION. `boardMode` still decides which orders are on
  // the board; `viewMode` still decides the header, the padding, the type size and which item renderer
  // runs. This decides only whether an AMOUNT is printed.
  const hideAmounts = cardMode === 'cook'

  // (finishTimeOptions + ordersDueAfter moved into components/shared/EventFinishTimeModal as exported
  //  functions, so the dashboard's copy of this control cannot drift from this one. The modal takes the
  //  event and this screen's order list and derives both itself — see the modal below.)

  if (loading) return (
    <div className="flex items-center justify-center h-dvh text-slate-400 text-sm">
      Loading kitchen...
    </div>
  )

  // PIN prompt
  if (requiresPin) return (
    <div className="flex flex-col items-center justify-center h-dvh bg-slate-50 gap-4">
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
    <div className="flex items-center justify-center h-dvh text-red-500 text-sm">
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

      {/* ── Header ──────────────────────────────────────────────────────────────────────────────────
          🔴 THE SAFE-AREA INSET, AND IT IS THE SAME ONE AppHeader USES — NOT A SECOND MECHANISM.
          components/shared/AppHeader.tsx:45 carries `style={{ paddingTop: 'env(safe-area-inset-top)' }}`,
          which is why every dashboard/manage/admin header renders BELOW the status bar. This header is
          hand-rolled and never had it, so the KDS rendered full-bleed and its top-right control sat UNDER
          the battery indicator (device-verified).
          🔴 MOVING THE CONTROL LEFT WOULD NOT HAVE FIXED IT. On iPad landscape the status bar spans the
          FULL width — clock left, battery right — so a leftward move collides with the clock instead. And
          any horizontal answer breaks the moment the bar grows taller (call in progress, screen recording,
          personal hotspot). The inset is the only answer that tracks all of those, because iOS reports the
          new height and env() follows it.
          ⚠️ WEB IS BYTE-FOR-BYTE UNCHANGED: env(safe-area-inset-top) resolves to 0 in a normal browser.
          Pairs with viewport-fit=cover (app/layout.tsx) and contentInset:'never', which let CSS own the
          safe area — see lib/native/statusBar.ts for why iOS is the only platform where env() is non-zero.
          ⚠️ The padding goes on the HEADER, not the layout root: the root is the flex column that owns the
          board's height, and padding there would inset the scroll region as well as the chrome. */}
      {/* ── 🔴 THE HEADER WRAPS. IT USED TO CLIP, AND CLIPPING IS THE ONE OUTCOME A KITCHEN SCREEN
          CANNOT HAVE. ──────────────────────────────────────────────────────────────────────────────
          The root is `overflow-hidden` and this was a nowrap row whose widest chips are `shrink-0`, so
          past a certain width the LAST child — Screen on/off — was pushed outside the box and cut, with
          no scrollbar and no hint that a control existed. `flex-wrap` moves the overflow onto a second
          line instead, where it is visible and reachable.
          🔴 NOT `overflow-x-auto`. A horizontally scrolling strip hides controls behind a swipe with no
          affordance, on a screen that runs unattended and is operated with one thumb.
          ⚠️ THE WORST CASE IS JUST ABOVE 640px, NOT AT THE NARROWEST. Below `sm:` every chip label
          collapses to its glyph and the row gets SHORTER; at 641px they all appear at once. Wrapping
          covers that discontinuity without needing to know where it falls.
          ⚠️ `gap-y-2` so a wrapped second line is not flush against the first, and `content-start` so
          the lines pack upward rather than spreading.
          ⚠️ THE SAFE-AREA paddingTop IS UNCHANGED — it is what keeps this header below the iOS status
          bar, and it is the same mechanism AppHeader uses. */}
      <header
        className="flex flex-wrap content-start items-center gap-x-3 gap-y-2 px-4 py-2.5 bg-white border-b border-slate-200 flex-shrink-0"
        style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top))' }}
      >
        {/* Back to the orders dashboard — staff are auto-routed to KDS on login and otherwise have no
            way back to place orders. Unconditional (all roles): /dashboard/[token] has no staff block,
            so this can't loop. Label collapses to just ← on narrow widths to avoid crowding. */}
        {/* 🔴 IT HAD NO ACCESSIBLE NAME AT ALL. Below `sm:` the word is hidden and the arrow is
            `aria-hidden`, so this — the ONLY route off this screen — announced as nothing. `aria-label`
            is the exact visible string, not a longer paraphrase: WCAG 2.5.3 (Label in Name) wants the
            visible text contained in the accessible name, and a voice-control user saying "Dashboard"
            must match. The `title` carries the longer wording for pointer users instead.
            ⚠️ POSITION, ICON AND VISIBLE TEXT ARE UNCHANGED — attributes only. */}
        <AppLink
          href={`/dashboard/${token}`}
          aria-label="Dashboard"
          title="Back to the dashboard"
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
        >
          <span aria-hidden>←</span>
          <span className="hidden sm:inline">Dashboard</span>
        </AppLink>
        {/* ── 🔴 FIX 2 — THE NAME IS THE ONLY THING ON THIS ROW ALLOWED TO GIVE WAY ────────────────
            The collapsed row wrapped when a long truck+van name met three state badges, and collapsed is
            the state the operator is in all service. Every other item here is `shrink-0`: the badges are
            the state and must never be cut. This block is `shrink` with `min-w-0`, so it absorbs the
            deficit instead of pushing a chip onto a second line.
            🔴 THE TRUCK TRUNCATES AND THE VAN DOES NOT, AND THAT SPLIT IS THE POINT. A plain `truncate`
            on one string would eat the END of it — which is exactly where the van name is — and a
            two-van truck tells its screens apart by that word. So the truck name is its own `truncate`
            span and the " — Van 2" is a `shrink-0` sibling that is always drawn in full:
              "The Long Barn Wood-Fired Pizza Co — Van 2"  ->  "The Long Barn Wo... — Van 2" (CSS ellipsis)
            ⚠️ ONE OUTER SPAN, NOT TWO FLEX CHILDREN. The wrapper's `gap-2` applies to its children, so
            adding a second child would have inserted 8px between the truck and the van at EVERY width.
            The two spans are inside the original span instead, which keeps them one run of text.
            ⚠️ `sm:shrink-0` RESTORES TODAY'S BEHAVIOUR ABOVE THE BREAKPOINT. At `sm:` and up this block
            cannot shrink, so `truncate` can never engage and the ellipsis cannot appear. */}
        <div className="flex items-center gap-2 min-w-0 shrink sm:shrink-0">
          <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
          <span className="font-medium text-slate-900 flex min-w-0">
            {/* 🔴 THE VAN IS A LAST RESORT, NOT A FIXED BLOCK, AND THE TWO SHRINK FACTORS ARE HOW.
                `shrink-[999]` against `shrink` means flexbox takes ~1000 pixels off the TRUCK name for
                every one it takes off the van, so in practice the truck is gone before the van loses a
                character — and at 320px, where even that is not enough, the van clips to "Van 1..." rather
                than the row wrapping. Both carry `truncate`, so whichever gives way gets an ellipsis and
                neither ever wraps.
                ⚠️ AT `sm:` AND ABOVE NEITHER CAN ENGAGE: the wrapper is `sm:shrink-0`, so nothing inside
                it shrinks and `text-overflow` has nothing to do. */}
            <span className="truncate shrink-[999] min-w-0">{truck.name}</span>
            {/* 🔴 `\u00A0` AND NOT A PLAIN SPACE, AND THE BUG IT FIXES WAS MINE. Splitting the name into
                two spans last task made each of them a FLEX ITEM, and a flex item's own LEADING
                white-space is stripped — the space before the em dash simply stopped existing, so the
                header rendered `Test Kitchen— Van1`. A no-break space is not collapsible white-space, so
                it survives, and in this font it has the SAME advance as the space it replaces, which is
                why `sm:` and above is pixel-unchanged. ⚠️ WRITTEN AS THE ESCAPE `\u00A0`, deliberately:
                a literal NBSP in source is invisible to the next reader and would add a character class
                to this file. The escape is ASCII on disk. */}
            {/* 🔴 `activeVanCount !== 1` — THE VAN NAME ONLY EARNS ITS PLACE WHEN THERE ARE TWO SCREENS
                TO TELL APART. One active van and the header reads the truck name alone, separator and
                all: this whole ternary arm is what disappears, so the `\u00A0` goes with it and cannot
                strand a dangling dash. More than one van — or a count that has not arrived — renders
                exactly what it renders today, `\u00A0— Van 1`, space either side of the dash.
                ⚠️ `!== 1` AND NOT `> 1`, DELIBERATELY: `null` (unknown) and `0` (a truck with no active
                van, which still has a `van_name` in a stale URL) both fall through to SHOWING the name,
                which is the direction that never hides something an operator was relying on. */}
            {vanName && activeVanCount !== 1 ? <span className="truncate shrink min-w-0">{`\u00A0— ${vanName}`}</span> : null}
          </span>
        </div>

        {/* ── LAYOUT SWITCHER. THE WINDOW/COOK PAIR THAT SAT HERE IS GONE. ──────────────────────────
            🔴 The two step switches replaced it: a screen that hands over IS the window, a screen that
            only makes food IS the cook screen, so `activeView` is derived from the handover switch and
            an operator no longer picks a role and a set of steps separately. The divider that separated
            the two pairs went with it. `hg_kds_view_` is still READ ONCE for the migration and is never
            written again. */}
        {/* 🔴 `hidden sm:flex` — PHONE ONLY. At `sm:` and above this is `display:flex`, which is what it
            computed to before, so the segment, its divider and all four buttons are unchanged there.
            Below `sm:` the same four buttons render inside the `View` panel — the SAME handlers and the
            SAME words, a second PLACE and never a second implementation. */}
        <div className="hidden sm:flex items-center gap-1 bg-slate-100 rounded-lg p-1">
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
          {/* ── 🔴 CARD DISPLAY: Full / Cook. A DISPLAY CONTROL, BESIDE THE OTHER DISPLAY CONTROL. ─────
              It sits with List/Grid and NOT with the two step switches, because that is what it is: it
              changes how a card LOOKS — prices, the part-paid row, padding, item grouping, type size —
              and it changes NOTHING about which orders are on the board. Putting it beside the switches
              would imply it moves tickets, which is the one thing it must never do.
              ⚠️ UNSET FOLLOWS THE BOARD, so this reads as already-correct on both kinds of screen
              before anyone touches it; pressing either button commits a choice that then sticks. */}
          <div className="w-px h-4 bg-slate-300 mx-1" />
          <button
            onClick={() => setCardMode('window')}
            title="Full cards — prices and payment details, as the hatch sees them."
            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
              cardMode === 'window'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Full
          </button>
          <button
            onClick={() => setCardMode('cook')}
            title="Cook cards — bigger type, grouped by category, no prices."
            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
              cardMode === 'cook'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Cook
          </button>
        </div>

        {/* ── SOUND MOVED INTO THE DEVICE SHEET ────────────────────────────────────────────────────
            🔴 The per-device new-order ding now lives behind the device button, with a full label, and
            its OFF state shows as a 🔕 badge on that button. It is per-device configuration exactly like
            the default screen and the notification switch already in that sheet, and this header does
            not have the width for it — see docs/kds-header-group-report.md. The handler is unchanged
            (enabling is a gesture, so it still primes the audio). */}

        {/* ── THE TWO STEP SWITCHES — WHICH STEPS THIS SCREEN PERFORMS ─────────────────────────────
            🔴 WINDOW VIEW ONLY. In Cook view the lifecycle is forced to marks-ready / no-handover, which
            is what Cook has always done, so a switch there would be a control that visibly does nothing.
            NO PLAN GATE and NO TRUCK GATE, deliberately: this is a property of WHERE THE DEVICE STANDS.
            🔴 THE HANDOVER SWITCH IS NOW SHOWN ON EVERY TRUCK, where the old payments chip was hidden
            unless the truck had the paid step on. That is the widening: an operator on a
            show_paid_step-false truck can now say this screen does not hand over, which they could not
            before. Nothing changes for them until they use it — the unset default reproduces exactly
            what they render today.
            ⚠️ BOTH OFF IS FORBIDDEN, AND THE REFUSAL IS `disabled`, NOT A SILENT NO-OP. With one switch
            left on, that switch cannot be turned off: a screen performing no steps has no buttons at all
            (renderButtons ends in `return null`), which on an unattended board is a dead ticket.
            ⚠️ Same chip shape as Sound so they read as siblings. Green = this screen does the step. */}
        {/* ⚠️ NO LONGER GATED ON THE VIEW. The view is now DERIVED FROM THESE SWITCHES, so gating them
            on it would be circular — and hiding them in "cook" would leave a making screen with no way
            back. They are the only lifecycle control on this header now, so they are always visible. */}
        {/* 🔴 `hidden sm:contents` AND NOT `hidden sm:flex`, AND THE DIFFERENCE IS THE WHOLE POINT.
            `display: contents` makes this wrapper produce no box of its own, so at and above `sm:` the
            two buttons are still DIRECT children of the header's flex row — same `gap-x-3` between them
            and their neighbours, same wrap behaviour, same widths. A `flex` wrapper would have introduced
            one flex item where there were two and changed the spacing at every width above the
            breakpoint, which is exactly what "at wider widths nothing changes" forbids.
            ⚠️ Below `sm:` it is `display: none` and the opener below takes over. The two buttons are the
            SAME markup either way — nothing was duplicated, so they cannot drift. */}
        <div className="hidden sm:contents">
            <button
              onClick={() => { if (handoverOn) setReady(!readyOn) }}
              disabled={!handoverOn}
              title={!handoverOn
                ? 'This screen only marks orders ready, so this cannot be turned off — it is the only step it performs.'
                : readyOn
                  ? 'This screen marks orders ready. Tap so another screen does it instead.'
                  : 'Another screen marks orders ready. Tap so this one does it.'}
              className={`flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 disabled:opacity-60 ${
                readyOn ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'
              }`}
            >
              {/* ⚠️ U+2713, a glyph THIS FILE ALREADY CARRIES, chosen over a new emoji deliberately: the
                  census rule for this codebase is that an edited file must not gain a character class.
                  It must never be dropped — below `sm` the word hides and this glyph is the whole
                  button. */}
              <span aria-hidden>✓</span>
              {/* ⚠️ "Ready step", MATCHING THE DASHBOARD'S SETTINGS ENTRY "Order-ready step" — the same
                  step named the same way on both surfaces, even though the two are set independently.
                  Label text only: the key, the default and the behaviour are unchanged. */}
              <span className="hidden sm:inline text-xs">Ready step</span>
            </button>
            <button
              onClick={() => { if (readyOn) setHandover(!handoverOn) }}
              disabled={!readyOn}
              title={!readyOn
                ? 'This screen only takes payment, so this cannot be turned off — it is the only step it performs.'
                : handoverOn
                  ? 'This screen takes payment and hands over. Tap so another screen does it instead.'
                  : 'Another screen takes payment. Tap so this one does it.'}
              className={`flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 disabled:opacity-60 ${
                handoverOn ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'
              }`}
            >
              <span aria-hidden>💷</span>
              {/* ⚠️ "Payment & handover" NAMES WHAT THIS SCREEN DOES, not two of our status values. It was
                  "Payment/Collected" — two internal statuses and a slash that reads as "or". The buttons an
                  operator sees are still the ones this names —
                  "Mark paid", "Collected", "Mark paid & collected" — rather than describing the step in
                  the abstract. The earlier rule against labelling a control with a status word was
                  rescinded for this switch deliberately, for exactly that reason. */}
              <span className="hidden sm:inline text-xs">Payment &amp; handover</span>
            </button>
        </div>

        {/* ── 🔴 PHONE WIDTH ONLY: ONE LABELLED CONTROL IN PLACE OF TWO BARE GLYPHS ─────────────────
            🔴 THE STATE IS ON THE BUTTON, NOT BEHIND IT. These two switches decide when a ticket
            disappears from this screen; an operator must never have to open a menu to find out what
            their own board is doing. So the label carries the answer in words — "Ready + payment",
            "Ready only", "Payment only" — and the panel behind it is only for CHANGING them.
            ⚠️ WORDS, NOT COLOURED GLYPHS. Two tinted icons would be the same defect one layer down: a
            glyph an untrained operator has to decode, plus colour as the only state channel.
            ⚠️ "None" IS UNREACHABLE and is written anyway. Each switch is `disabled` while it is the
            only step left, so the pair cannot both be off — but a label that silently has no branch for
            a state is how a future change to that rule produces a blank button.
            ⚠️ NO `aria-label`: the button has real visible text, so it already has an accessible name,
            and an aria-label would have to repeat it to satisfy Label in Name. `title` carries the
            longer sentence for pointer users instead. */}
        {/* ── PHONE ROW — FOUR CONTROLS, NO INDICATORS ────────────────────────────────────────────
            🔴 EVERY STATE BADGE IS GONE FROM THIS ROW, AND THE REASON IS NOT SPACE. A struck-through
            glyph reads as "unavailable" or "cancelled"; these are SETTINGS. A screen deliberately set to
            make-only is not in an error state, and a cross said it was. The badges existed only because
            four settings were being encoded in a collapsed row — so the two an operator changes
            mid-service became REAL CONTROLS here, where the control IS the indicator, and the rest went
            behind a button where their state is visible in full.
            🔴 NO `🔕` AS A BADGE, NO `🌙`, NO `☀️`, NO STRUCK `✓` OR `💷` ANYWHERE ON THIS ROW. The one
            glyph left is the sound toggle's own face, which is the control, not a marker on another one.
            ⚠️ ALL FOUR ARE `sm:hidden`. At `sm:` and above every one of these is already on this header
            as its own control and none of this renders. */}
        {/* SOUND — icon-only, and the two states are TWO DISTINCT GLYPHS. 🔴 NEVER ONE STRUCK THROUGH:
            🔔 and 🔕 are different characters that both read as themselves, which is exactly what a
            struck glyph fails to do. The accessible name says the state AND the action in words at both
            states, because the glyph is the only visible label. The handler is the original — enabling
            primes the audio, because enabling is the user gesture the browser requires. */}
        {soundBtn('sm:hidden flex')}
        {/* SCREEN — WORDS. 🔴 THIS IS THE CONTROL COMING BACK OUT OF A PANEL, AND IT IS A CORRECTION.
            On web this is the ACQUISITION mechanism, not a display of one: Safari grants `wakeLock` only
            on a completed gesture and drops the lock on visibility loss, so re-acquiring must be one tap.
            Putting it behind `Screen & sound` last task made it three. `screenOnBtn` is the SAME function
            the `hidden sm:block` mount calls and `toggleKeepScreenOn` is untouched — only the label
            argument and the words-only flag differ. The label is the wide-width label, verbatim. */}
        <div className="sm:hidden shrink-0">{screenOnBtn(screenHeld ? 'Screen on' : 'Screen off', true)}</div>
        {/* SCREEN SETTINGS — everything that is NOT changed mid-service. See the panel below for what is
            in it and why it is a sheet rather than an expanding row. */}
        <button
          type="button"
          onClick={() => setPhoneOpen(v => !v)}
          aria-expanded={phoneOpen}
          className="sm:hidden flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors shrink-0"
        >
          Screen settings
          {/* ⚠️ A ROTATION, NOT A SECOND CHARACTER — U+25B4 would be a character class this file does not
              carry. `aria-expanded` above is what actually announces the state. */}
          <span aria-hidden className={`text-slate-400 transition-transform ${phoneOpen ? 'rotate-180' : ''}`}>▾</span>
        </button>
        {/* MANAGE EVENT — the same opener as the event bar's, which is `hidden sm:block` from the
            previous task, so it renders in exactly ONE place at any width. Same handler, same two state
            writes, same gate, same `aria-label` and `title`, same words.
            🔴 IT IS ON THIS ROW ON YOUR EXPLICIT DECISION, AND THE ROW WRAPS TO TWO LINES BECAUSE OF IT.
            The model puts the six-item row at ~442px against 358px available at 390px; you were given
            that figure, and the alternatives, and chose the two lines over moving the control. `Manage
            event` is kept verbatim rather than shortened to `Manage`, because `Manage` saves 46px and the
            row still wraps — the rename would have cost a word and bought nothing. */}
        {/* 🔴 `(!isDemo || isPaused)`, NOT `!isDemo` — THIS CARRIES THE ARM THE HEADER'S PAUSE BUTTON
            USED TO. With `Pause orders` off the header, a PAUSED DEMO reaches Resume only through this
            menu, so the opener has to admit exactly the case the old button's gate admitted. */}
        {activeEvent && (!isDemo || isPaused) && (
          <button
            onClick={() => { setEventNoteInput(activeEvent.customer_note || ''); setShowEventMenu(true) }}
            aria-label="Manage event"
            title="Manage event — start, pause, change or finish it"
            className="sm:hidden text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:border-slate-400 font-semibold shrink-0"
          >
            Manage event ▾
          </button>
        )}

        {/* This device (native app only) — device/user config, reachable from KDS since it's a default-
            screen surface. Not role-gated, not sm:hidden. Uses the dashboard token (this route runs on it),
            so its bind-device reads/writes authenticate. */}
        {/* DEMO: hidden. ThisDeviceSettings is pure CONFIGURATION (default screen, van binding, notification
            prefs) — the KDS counterpart of the NotificationSettings card hidden on the dashboard. Already
            native-only, so a web demo never saw it; gated here so a native demo doesn't either. */}
        {/* 🔴 THE ONLY HEADER CONTROL WITH NO TEXT AT ANY WIDTH, so its name has to come from the
            attributes. `aria-label` gives it an accessible name; `title` gives pointer users the same
            words on hover. Both say "Device settings" — the SAME words as the sheet's heading, because a
            control and the thing it opens disagreeing about their own name is worse than either wording.
            🔴 NO VISIBLE LABEL ON THE BUTTON, DELIBERATELY. It would not fit at phone width, which is
            exactly the width at which this header already wraps.
            ⚠️ THE GLYPH IS `aria-hidden` — the file's own idiom (see the ← on the Dashboard link). With
            `aria-label` set the children are not used for the name anyway; this stops a screen reader
            announcing the emoji's own name alongside it. */}
        {/* 🔴 THE GATE CHANGED, AND IT IS A CONSEQUENCE OF THE MOVE, NOT A SEPARATE DECISION. This
            button was `isNativeApp() && !isDemo`, because the sheet held nothing but native device
            config. It now also holds SOUND and KEEP-SCREEN-ON, which are per-device browser settings
            that every KDS has — web, native and demo alike. Leaving the old gate would have DELETED
            both controls on web and in demo rather than moving them.
            ⚠️ NOTHING WAS UNGATED INSIDE THE SHEET. `ThisDeviceSettings` keeps its own
            `isNativeApp() && !isDemo` gate at its mount point below, so a web or demo operator opens
            this and sees exactly the two new rows and nothing else. The demo still shows no device
            configuration, which is what that gate was for.
            🔴 THE BADGES ARE THE WHOLE SAFETY ARGUMENT FOR MOVING TWO CONTROLS BEHIND A TAP. An OFF
            state is never hidden: 🔕 shows when the ding is off, 🌙 shows when the wake lock is not
            held. Both on ⇒ neither badge ⇒ the bare 📱. A cook glancing at the header still learns
            "this screen will go dark" and "this screen will not ding" without opening anything.
            ⚠️ THE ACCESSIBLE NAME STATES BOTH IN WORDS, always — a badge is a visual channel only, and
            "Device settings" alone would announce nothing about either state. */}
        {/* ── 🔴 THE 📱 BUTTON IS NOW A LABELLED `Screen settings` OPENER, AND ITS BADGES ARE GONE ──
            It was a bare 📱 carrying a 🔕 when the ding was off and a 🌙 when the lock was not held —
            two INDICATORS for two settings an operator could not change without opening the sheet. Both
            settings are now REAL CONTROLS on this row (the sound chip and `Screen on`/`Screen off`
            beside it), so the badges have nothing left to warn about: the control IS the indicator.
            🔴 AND IT IS NAMED FOR WHAT IT ACTUALLY OPENS: `Sound settings`, NOT `Screen settings`. At
            this width the view controls, the step switches, the screen-on button and the sound master
            are ALL on the header already, so what is left behind this button is which-sounds and the
            due-to-cook setting — sound detail. The phone's expander is `Screen settings` because there
            it really does hold the view and step controls too; the two names differ because the two
            panels differ, and a button that overstates its contents is how an operator learns to guess. */}
        <button
          onClick={() => setDeviceOpen(true)}
          title="Which sounds fire on this device"
          className="hidden sm:flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors shrink-0"
        >
          Sound settings
        </button>

        {/* ⚠️ `basis-0` SO IT CANNOT FORCE A WRAP. As a bare `flex-1` this spacer has an `auto` basis; on
            a wrapping row that lets it claim width and push the next chip onto a new line while space
            remains. With a zero basis it takes only leftover slack and disappears entirely when there is
            none, which is exactly what a spacer should do. */}
        <div className="flex-1 basis-0" />

        {/* ── EXTRA WAIT MOVED TO MANAGE EVENT ──────────────────────────────────────────────────────
            🔴 IT IS AN EVENT-LEVEL WRITE AND IT NOW LIVES WITH THE OTHER EVENT-LEVEL WRITES. It sets a
            buffer on the collection time quoted to customers of THIS EVENT; pause, finish, cancel and
            change-finish-time are all in the Manage event menu and this is the same kind of thing. It is
            passed to `EventActionsModal` as `extraWaitControl`, the slot the dashboard already fills.
            ⚠️ THE HANDLER IS UNTOUCHED. `handleSetWait` — same values, same POST, same optimistic set —
            is now called from the shared picker instead of a <select>. And the amber banner with its
            "Clear" is unchanged, so an active extra wait is still visible and clearable without opening
            anything. */}

        {/* ── 🔴 THE HEADER PAUSE BUTTON THAT STOOD HERE IS DELETED. ITS COMMENT SAID "DO NOT DELETE
            IT" AND THAT COMMENT WAS RIGHT UNTIL ITS RECOVERY ARM WAS MOVED — WHICH THIS EDIT DOES. ──
            The old block argued the button was not a duplicate of the EventActionsModal row because on a
            PAUSED DEMO the modal's mount and both its openers were `!isDemo`, so the menu could not be
            opened and this button was the only way back. That argument is discharged, not ignored: the
            same `(!isDemo || isPaused)` condition now sits on the mount, on both openers and on the
            back/escape entry, and `onPause` is `undefined` in demo so the asymmetry (resume yes, pause
            no) is preserved exactly.
            ⚠️ ONE CLAIM IN THE OLD COMMENT WAS ALREADY WRONG AND IS CORRECTED RATHER THAN INHERITED:
            this button was NOT "the ONLY resume control on the screen". The red pause banner below
            carries `{pauseReason === 'manual' && <button onClick={togglePause}>Resume</button>}` and is
            gated on `anyPaused` alone — no `isDemo` term — so a paused demo could always resume from it.
            The banner is untouched by this edit; it is named here so the next reader does not re-derive
            a false premise from a comment. */}
        {/* ── 🔴 `Pause orders` IS GONE FROM THIS HEADER AT EVERY WIDTH. `Screen on` HAS ITS SLOT. ────
            The header wrapped to two rows on an iPad in landscape with `Screen on` alone on the second.
            Pause lives in **Manage event** — the shared `EventActionsModal`'s `⏸ Pause orders` row,
            still gated there on `event.status === 'open'`, unchanged.
            🔴 AND THE RECOVERY PATH THE OLD GATE PROTECTED IS PRESERVED, NOT DELETED. That gate read
            `(!isDemo || isPaused)` because on a PAUSED DEMO this button was the ONLY resume control:
            the modal's mount and both its openers were `!isDemo`, so the menu could not be reached at
            all. Removing the button without moving that arm would have stranded a paused demo with no
            way back — the exact failure the gate was written for, and the reason a previous removal was
            refused. So the SAME `(!isDemo || isPaused)` condition now sits on the modal's mount and on
            both openers, and `onPause` is `undefined` in demo — a demo can RESUME and still cannot
            PAUSE, which is precisely what this button did.
            ⚠️ NOT ASSERTED UNREACHABLE. `set_paused` carries no server-side demo guard, so
            `truck_events.paused_until` can hold a value on a demo row whatever the UI offers today.
            Betting on unreachability is what the earlier refusal was protecting against.
            ⚠️ `togglePause`, `applyPending`, `markPending`, the `vanPausedUntil` read, the offline-pause
            derivation and the banner are all UNTOUCHED. This is reachability, not the pause mechanism. */}
        {/* 🔴 SCREEN ON, IN THE SLOT PAUSE VACATED — AND IT IS STILL THE ACQUISITION MECHANISM.
            `screenOnBtn` and `toggleKeepScreenOn` are unchanged: a real `<button>` whose `onClick` runs
            the acquire, because Safari grants `wakeLock` only on a completed gesture and drops it on
            visibility loss. Moving where it sits in the row cannot change that — the element, its
            handler, its `aria-pressed` and its classes are byte-identical, only its position moved.
            ⚠️ It keeps `hidden sm:block`, so the phone row is untouched; the phone's own `sm:hidden`
            mount on the expanded line is a separate call to the same helper and is not touched either. */}
        <div className="hidden sm:block shrink-0">{screenOnBtn(screenHeld ? 'Screen on' : 'Screen off')}</div>

        {/* ── "Open cook screen" REMOVED — IT BECAME A LINK THAT LIED. ──────────────────────────────
            🔴 It opened `?view=cook` in a second tab, and `?view=cook` is no longer read by anything:
            the view is derived from the handover switch, not from the URL. The link would therefore
            have opened an ordinary window board under a label promising a cook screen — worse than not
            offering it. A second making screen is now made by opening the KDS on that device and
            turning "Payment & handover" off, which is per-device and survives a reload.
            ⚠️ REMOVED AS A CONSEQUENCE OF CHANGE 1, NOT AS A FOURTH CHANGE — see the report. */}

        {/* ── KEEP-SCREEN-ON MOVED INTO THE DEVICE SHEET ───────────────────────────────────────────
            🔴 Same reasoning as sound, and the same safety requirement: the OFF state shows as a 🌙
            badge on the device button, because a screen-off device that LOOKS screen-on is a dark
            screen mid-service. The binary rule is unchanged — the badge follows `screenHeld` (the lock
            actually held), not the stored preference, so belief and reality cannot diverge on the
            header any more than they could on the old chip.
            ⚠️ `KeepAwakePrompt` STILL SITS DIRECTLY BELOW THIS HEADER and is untouched: when the pref
            is on but the lock is not held, the full-width bar is still there to be tapped. Moving the
            toggle did not move the recovery path.

            ── 🔴 AND KEEP-SCREEN-ON IS BACK ON THE HEADER AT `sm:` AND ABOVE. SOUND IS NOT. ──────────
            The two were moved together and only one of them should have been. 🔴 ON WEB THIS BUTTON IS
            THE ACQUISITION MECHANISM, NOT A DISPLAY OF ONE: the browser drops the lock whenever the
            page loses visibility or focus, so an operator who navigates away and back has to
            RE-ACQUIRE, and burying the recovery action behind two taps is the wrong place for it. The
            ding has no such property — it is a setting, set once, and it stays in the sheet.
            🔴 `sm:` AND NOT `md:`, DELIBERATELY. It is the ONLY breakpoint this header uses — every
            label collapse and the step switches' `hidden sm:contents` / `sm:hidden` pair are all `sm:`
            — and a second breakpoint on one row is how a header starts reflowing in ways nobody can
            predict from reading it. ⚠️ THE STATED COST: 640-767px is a large phone in landscape rather
            than a tablet, so this appears slightly earlier than "tablet" strictly means. That is the
            right direction to be wrong in — that band is exactly where a browser KDS runs.
            ⚠️ THE DEVICE BUTTON'S MOON BADGE STAYS AT EVERY WIDTH, INCLUDING HERE. Two indicators of
            one state is deliberate: this is the CONTROL, that is the at-a-glance summary, and the
            summary must not vanish just because the control is visible. */}
        {/* The sound master, beside the screen control it belongs with. Same helper as the phone's
            mount, so the two can never drift. ⚠️ THE TWO ARE STILL ADJACENT — `Screen on` moved into the
            slot `Pause orders` vacated, a few lines up, so the pair simply swapped order. Nothing else
            renders between them. */}
        {soundBtn('hidden sm:flex')}

        {/* ── 🔴 THE EXPANDED REGION — IN NORMAL FLOW, PUSHING THE BOARD DOWN ──────────────────────
            🔴 `w-full` INSIDE THE HEADER'S OWN `flex-wrap` ROW. It is an ordinary flex child claiming the
            full width, so it wraps onto its own line and the header simply gets taller; the header is
            `flex-shrink-0` in the page's `h-dvh flex-col` column, so the board below — `flex-1 min-h-0` —
            shortens by exactly this height and scrolls inside what is left. NOTHING here is `fixed`,
            `absolute`, `z-`ed or backdropped. THE BOARD IS NEVER COVERED.
            🔴 THAT IS THE WHOLE REASON THIS IS NOT A SHEET: `List`/`Grid` and `Full`/`Cook` change the
            tickets underneath, and an operator must see the change they are making. A previous build put
            this behind an overlay; it was wrong and is not to be reinstated.
            🔴 `sm:hidden` — at `sm:` and above this generates no box at all. Every control below is on the
            header row itself at those widths.
            🔴 NO HELPER SENTENCES ANYWHERE IN HERE, and none is to be added. In the sheet the due-to-cook
            description rendered CUT OFF MID-SENTENCE, which is worse than no words; expanded in place the
            effect is immediate and the words earn nothing.
            🔴 STATE LIVES INSIDE THE CHIP — `Ready step On`, `Payment & handover Off`, and line 4's
            control the same way. That pattern is what removed the need for badges on the row. */}
        {phoneOpen && (
          <div className="w-full sm:hidden flex flex-col gap-2 pt-1">
            {/* 🔴 TWO HEADINGS, ON INSTRUCTION, AND BETWEEN THEM THEY COVER THE WHOLE REGION. `View
                settings` governs what follows until `Sound settings` — the two display segments AND the
                two step switches, i.e. everything about what this screen shows and does; `Sound settings`
                governs the two chips and the due-to-cook control.
                ⚠️ THE STEP SWITCHES SIT UNDER `View settings` BY POSITION, NOT BY CONVICTION. They decide
                which BUTTONS this screen gets, which is arguably its own group — but you asked for two
                headings and nothing here was reordered to make them fit. A third heading over the steps
                is one line away if you want it.
                ⚠️ EACH HEADING COSTS A ROW: the region is two rows taller than it was. No label was
                shortened to pay for them. */}
            <p className="text-xs font-bold text-slate-500 -mb-1">View settings</p>
            {/* LINE 1 — `List` `Grid` `Full` `Cook`, the header segments' own button text, verbatim.
                🔴 SELECTED IS GREEN HERE AND WHITE AT `sm:` AND ABOVE, AND THE SPLIT IS DELIBERATE. The
                instruction was one colour language across this phone panel; `sm:` and above must stay
                byte-identical, so the header's own segments keep `bg-white ... shadow-sm`. Same controls,
                same handlers, two palettes by width — reported rather than quietly aligned.
                ⚠️ THESE TWO PAIRS ARE CHOICES, NOT TOGGLES, LIKE THE SOUND PAIR — but they are plain
                buttons with no radio semantics, exactly as they were, because the display controls are on
                this task's DO-NOT list and only their colour was asked for. The gap is stated in the
                report rather than closed here. */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                <button onClick={() => setLayoutOverride('list')}
                  className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${activeLayout === 'list' ? 'bg-green-100 text-green-700' : 'text-slate-500 hover:text-slate-700'}`}>List</button>
                <button onClick={() => setLayoutOverride('grid')}
                  className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${activeLayout === 'grid' ? 'bg-green-100 text-green-700' : 'text-slate-500 hover:text-slate-700'}`}>Grid</button>
              </div>
              <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                <button onClick={() => setCardMode('window')}
                  className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${cardMode === 'window' ? 'bg-green-100 text-green-700' : 'text-slate-500 hover:text-slate-700'}`}>Full</button>
                <button onClick={() => setCardMode('cook')}
                  className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${cardMode === 'cook' ? 'bg-green-100 text-green-700' : 'text-slate-500 hover:text-slate-700'}`}>Cook</button>
              </div>
            </div>
            {/* LINE 2 — the two step switches, their wide-width labels verbatim, state inside the chip.
                Same handlers and the same `disabled` rule: neither can be turned off while it is the only
                step this screen performs. */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => { if (handoverOn) setReady(!readyOn) }}
                disabled={!handoverOn}
                aria-pressed={readyOn}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-60 shrink-0 ${readyOn ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}`}
              >
                <span>Ready step</span><span className="font-bold">{readyOn ? 'On' : 'Off'}</span>
              </button>
              <button
                onClick={() => { if (readyOn) setHandover(!handoverOn) }}
                disabled={!readyOn}
                aria-pressed={handoverOn}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-60 shrink-0 ${handoverOn ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}`}
              >
                <span>Payment &amp; handover</span><span className="font-bold">{handoverOn ? 'On' : 'Off'}</span>
              </button>
            </div>
            {/* LINE 3 — which sounds. 🔴 TWO CHIPS IN ONE BOX, AND THE HEADING IS GONE. The scope is
                folded into the labels — "Ding: needs confirming" / "Ding: all orders" — so the row that
                said `New order sound` above them is no longer carrying anything the chips do not. That
                heading row was one of the two reasons this panel rendered six rows instead of four.
                🔴 THE WORDING IS THE DASHBOARD'S, WORD FOR WORD, ON INSTRUCTION. A shorter pair
                ("Ding: needs confirming" / "Ding: all orders", 272.6px) was proposed and REJECTED: one
                setting must not acquire a second vocabulary on the way to a second surface. The cost is
                width — these two are 313.7px in this box, which fits 375px and up and is 25.7px too wide
                for a 320px phone, where `flex-wrap` puts the second chip on a second line INSIDE the
                track rather than overflowing. That is why the wrap is there; do not remove it.
                🔴 GREEN = SELECTED, THE SAME `bg-green-100 text-green-700` AS `Ready step On`, because
                one visual language across this panel was the instruction.
                🔴 AND THAT IS EXACTLY WHY THE SEMANTICS DIFFER FROM ITS NEIGHBOURS. These two are a RADIO
                PAIR — tapping the green one does nothing — while `Ready step On` beside them is a TOGGLE
                that turns off. They look the same on purpose and must NOT sound the same: this is a
                `role="radiogroup"` with `role="radio"` + `aria-checked` children, so a screen reader says
                "radio button, selected, 1 of 2" here and "toggle button, pressed" there. The group needs
                its own `aria-label` because the visible heading was removed.
                ⚠️ THE VISUAL AMBIGUITY IS REAL AND IS NOT FULLY SOLVED — see the report. A sighted
                operator sees two green-when-active controls that behave differently; the shared track and
                the rounded segment behind these two is the only visual cue that they are one choice.
                🔴 `if (selected) return` — TAPPING THE SELECTED CHIP WRITES NOTHING. No localStorage
                write, no state set, no ref update. The value and the key are unchanged. */}
            {/* 🔴 THE SOUND GROUP GETS A VISIBLE HEADING, ON INSTRUCTION. With the scope no longer in
                the chip labels, nothing on this surface said these controls were about SOUND — only the
                radiogroup's `aria-label` did, and that is announced to assistive tech alone.
                ⚠️ `Sound settings` AND NOT `New order sound`: it is the pair to `View settings` above,
                and it governs BOTH sound controls below it — the two chips and the due-to-cook chip on
                the next line — where `New order sound` would name only the chips. The radiogroup keeps `aria-label="New order sound"`,
                the dashboard's sub-heading, so a screen reader still gets the specific name.
                ⚠️ IT COSTS ONE ROW AT EVERY WIDTH. That is the price of naming the group and it is paid
                knowingly; no label was shortened to avoid it. */}
            <p className="text-xs font-bold text-slate-500 -mb-1">Sound settings</p>
            <div role="radiogroup" aria-label="New order sound" className="flex flex-wrap items-center gap-1 bg-slate-100 rounded-lg p-1 self-start">
              {([['needs_confirming', 'Only orders needing confirming'], ['all', 'All new orders']] as const).map(([val, label]) => {
                const selected = (storedSoundCfg ?? DEFAULT_SOUND_CONFIG).new_orders === val
                return (
                  <button key={val} type="button" role="radio" aria-checked={selected}
                    onClick={() => {
                      if (selected) return
                      const next = { ...(storedSoundCfg ?? DEFAULT_SOUND_CONFIG), new_orders: val }
                      writeSoundConfig(token, next); setStoredSoundCfg(next); soundConfigRef.current = next
                    }}
                    className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${selected ? 'bg-green-100 text-green-700' : 'text-slate-500 hover:text-slate-700'}`}>
                    {label}
                  </button>
                )
              })}
            </div>
            {/* LINE 4 — the due-to-cook sound, state inside the chip, and the native device opener.
                🔴 THE DESCRIPTION IS DELETED, NOT MOVED: "Sounds when a ticket turns amber." is gone from
                this surface. 🔴 THE DEVICE BLOCK IS NOT EXPANDED HERE — truck/van rebinding, default
                screen, notifications and app-lock are SET-ONCE settings and do not belong among
                per-service controls, so they stay behind this opener, which carries their own
                `isNativeApp() && !isDemo` gate so it does not exist on web or in demo. */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const cur = storedSoundCfg ?? DEFAULT_SOUND_CONFIG
                  const next = { ...cur, order_due: !cur.order_due }
                  writeSoundConfig(token, next); setStoredSoundCfg(next); soundConfigRef.current = next
                }}
                aria-pressed={(storedSoundCfg ?? DEFAULT_SOUND_CONFIG).order_due}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${(storedSoundCfg ?? DEFAULT_SOUND_CONFIG).order_due ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}`}
              >
                <span>Sound when an order is due to be cooked</span>
                <span className="font-bold">{(storedSoundCfg ?? DEFAULT_SOUND_CONFIG).order_due ? 'On' : 'Off'}</span>
              </button>
              {isNativeApp() && !isDemo && (
                <button
                  type="button"
                  onClick={() => setDeviceOpen(true)}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors shrink-0"
                >
                  Device settings
                </button>
              )}
            </div>
          </div>
        )}
      </header>
      {/* ── THE BANNER STACK — ONE CONTAINER, DIRECTLY UNDER THE HEADER ───────────────────────────
          🔴 THE WAKE-LOCK BAR USED TO RENDER HERE AND THE REST RENDERED FURTHER DOWN, so on a phone the
          "screen can't be kept on" notice appeared in the MIDDLE of the page, under the controls,
          nowhere near the other bars. Every status bar this screen can raise is now in this one box,
          between the header and everything else, so an operator looks in exactly one place.
          🔴 THE ORDER IS MOST-CONSEQUENTIAL-FIRST, AND THEY STACK RATHER THAN REPLACE. More than one can
          be true at once — a paused board on an offline device with no wake lock shows all three, in
          this order, one under the other. Nothing here is exclusive with anything else.
            1. orders-not-loaded — the board is EMPTY and this says why. It outranks pause because a
               paused board still shows the right orders and this one shows none. That precedence was
               already written into its own comment below and is preserved, not re-decided.
            2. paused — customers cannot order.
            3. offline — this device is not talking to the server.
            4. wake-lock — this screen may dim. Least consequential of the four, and the only one that
               is about the device rather than the orders.
            5. extra wait — informational, and self-clearing from its own button.
          ⚠️ NOT ONE CONDITION, ONE WORD OR ONE HANDLER CHANGED. Every block below is the block that was
          already in this file, moved. The wake-lock bar is still `KeepAwakePrompt` with the same props.
          ⚠️ `OfflineBanner`, `WebOfflineBanner` and `DemoModeBanner` are NOT in here and deliberately so:
          they are shared components mounted ABOVE the header on both surfaces (the dashboard mounts them
          in the same order), they are already at the top of the page rather than mid-page, and moving
          them would change the app shell rather than this screen's own banners. */}
      <div className="flex-shrink-0">
        {/* ── 🔴 EVENT SCOPE MISMATCH — THE BOARD IS EMPTY AND THIS SAYS WHY ────────────────────────
            🔴 THE ONE THING THIS SCREEN MUST NEVER DO IS SHOW ONE EVENT'S ORDERS UNDER ANOTHER EVENT'S
            NAME. When the server answers with a different event from the one requested, `fetchAll`
            returns before any order reaches state and sets this — so the grid below renders EMPTY, and
            an empty grid on a kitchen screen reads as "no orders", which would be a lie. This is the
            sentence that stops it being one.
            ⚠️ IT NAMES THE EVENT THE OPERATOR CHOSE, not the one the server picked: the operator's
            question is "where are my orders", and the answer is "not loaded", not "renamed".
            ⚠️ RED, AND ABOVE THE PAUSE BANNER. It outranks pause — a paused board still shows the right
            orders; this one shows none. */}
        {eventScopeMismatch && (
          <div className="bg-red-700 text-white text-sm font-medium px-4 py-3 flex-shrink-0">
            <div className="font-black">⚠️ Orders not loaded for this event</div>
            <div className="text-xs mt-0.5 text-red-100">
              The server answered with a different event, so nothing is shown rather than the wrong
              orders{activeEvent ? ` for ${activeEvent.venue_name}` : ''}. Pick the event again, or reload.
            </div>
          </div>
        )}
        {/* ── Pause / wait banners ── */}
        {/* 🔴 IT NOW FIRES FOR AN OFFLINE PAUSE TOO, AND SAYS WHICH. Until this change the banner read
            `isPaused` alone — the MANUAL column — so a truck could have ordering paused for customers by
            the offline monitor while this screen looked completely normal. That was the worst half of
            docs/offline-protection-kds-report.md.
            ⚠️ "(device offline)" IS THE DASHBOARD'S OWN WORDING, reused rather than reinvented.
            ⚠️ RESUME IS OFFERED ONLY FOR A MANUAL PAUSE. `togglePause` writes `paused_until`; an offline
            pause is cleared by the next successful heartbeat, not by a button, so offering one here
            would be a control that does not do what it says. */}
        {anyPaused && (
          <div className="bg-red-500 text-white text-sm font-medium px-4 py-2.5 flex items-center justify-between flex-shrink-0">
            <span>⏸ Orders paused{pauseReason === 'offline' ? ' (device offline)' : ''} — customers cannot order</span>
            {pauseReason === 'manual' && <button onClick={togglePause} className="underline text-white text-xs">Resume</button>}
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
        {/* Keep-screen-on prompt — full-width bar right under the header, unmissable on the cook screen. Shows
            only when the pref is on but the lock isn't held; the operator's first tap dismisses AND acquires it. */}
        <KeepAwakePrompt keepScreenOn={keepScreenOn} wakeState={wakeState} onAcquire={() => { void applyKeepScreenOn(true) }} />
        {extraWaitMins > 0 && (
          <div className="bg-amber-500 text-white text-sm font-medium px-4 py-2.5 flex items-center justify-between flex-shrink-0">
            <span>⏱ +{extraWaitMins} min extra wait active</span>
            <button onClick={() => handleSetWait(0)} className="underline text-white text-xs">Clear</button>
          </div>
        )}
      </div>

      {/* ── To Make bar ── */}
      {/* ⚠️ ON boardMode, DELIBERATELY — the card toggle must not hide it. Unchanged from the
          previous build; whether it should be ungated is a separate decision. */}
      {allDayPills.length > 0 && boardMode === 'window' && (
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

      {/* ── THE EVENT BAR — MIRRORS THE DASHBOARD'S, AND NO LONGER HIDES ITSELF ────────────────────
          🔴 IT WAS GATED ON `activeEvent?.status === 'open'`, AND THAT WAS THE DEFECT. A truck whose
          event had not started got no event line, no Manage event menu, no way to change event and no way
          to press Start Event — from the one screen that is standing in the kitchen. The gate is now
          simply "is there an event", which is the only thing the bar actually needs to render.
          🔴 AND IT NOW CARRIES WHAT THE DASHBOARD'S CARRIES: venue · time range, the date line, and the
          STATUS. The old row showed a green dot that silently meant "open" — meaningless the moment the
          row renders for other statuses, so it is replaced by the dashboard's own status vocabulary.
          ⚠️ THE STATUS BRANCHES ARE THE DASHBOARD'S, IN THE DASHBOARD'S ORDER — paused, then open,
          closed, cancelled, else "Not started". Only the COLOURS differ, because this header is white
          where the dashboard's is dark: `-400` on dark becomes `-600` here so the text keeps its
          contrast. Same words, same order, same meaning.
          ⚠️ `fmtVenue` and `eventDateLabel` are IMPORTED from lib/event-display, not copied — see that
          file for why.
          ⚠️ DEMO still hides Manage event and the date line, exactly as before. */}
      {activeEvent && (() => { const eventStatus = eventStatusDisplay(activeEvent.status, isPaused); return (
        <div className="flex items-center gap-3 px-4 py-2 bg-white border-b border-slate-100 flex-shrink-0">
          {/* ── THE STATUS DOT, COLOURED PER STATUS ────────────────────────────────────────────────
              🔴 IT USED TO BE A HARDCODED GREEN DOT, WHICH WAS ONLY HONEST WHILE THE ROW RENDERED FOR
              'open' ALONE. Now that the row renders for every status the dot has to carry the same
              distinction the label does, or it contradicts the words beside it.
              ⚠️ THE COLOURS ARE THE DASHBOARD'S, DARKENED FOR A WHITE HEADER — the same shift the status
              labels take (`-400` on dark becomes `-500`/`-600` here). Same hue per status, same meaning.
              ⚠️ Paused wins over open, exactly as it does in the label chain below, so the two can never
              disagree. */}
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${EVENT_STATUS_DOT[eventStatus.tone]}`} />
          <div className="flex-1 min-w-0">
            <span className="block text-sm font-medium text-slate-900 truncate">
              📍 {fmtVenue(activeEvent.venue_name, activeEvent.town)} · {formatTime(activeEvent.start_time)}–{formatTime(activeEvent.end_time)}
            </span>
            {activeEvent.event_date && !isDemo && (
              <span className="hidden sm:block text-xs font-medium text-slate-500 truncate mt-0.5">📅 {eventDateLabel(activeEvent.event_date)}</span>
            )}
          </div>
          {/* ⚠️ THE SECOND COPY OF THIS CHAIN IS GONE. Words and branch order come from
              lib/event-display, shared with the dashboard; only the palette below is this surface's,
              because this header is white where the dashboard's is dark. */}
          <span className={`text-xs font-medium ${EVENT_STATUS_TEXT_ON_LIGHT[eventStatus.tone]} flex-shrink-0`}>{eventStatus.label}</span>
          {/* FIX 3 — DEMO removes it. Same reasoning as the dashboard's Manage event menu: extend/finish/
              cancel/note are operator event-lifecycle controls with nothing to offer a prospect, and
              several of them can leave the demo looking broken.
              ⚠️ THIS IS THE ONLY OPENER OF THE SHARED MENU ON THIS SURFACE, which is why the gate above
              mattered so much: with it, Start Event, Change event, Finish and Cancel were all
              unreachable on any event that was not already running. */}
          {/* 🔴 IT HAD NO ACCESSIBLE NAME AT ALL. Below `sm:` the words are hidden and the only child
              left is a bare `▾`, so the ONLY route to Start Event, pause, change-event, change finish
              time, finish and cancel announced as nothing at phone width.
              🔴 `aria-label` IS THE EXACT VISIBLE STRING AT WIDE WIDTH — the precedent set for the
              Dashboard link. WCAG 2.5.3 (Label in Name) wants the visible text contained in the
              accessible name, and a voice-control user saying "Manage event" has to match. A longer
              paraphrase would read better in a screen reader and BREAK voice control at wide width, so
              the longer wording goes in `title`, for pointer users, where it costs nothing.
              ⚠️ POSITION, ICON AND THE WIDE-WIDTH LABEL ARE UNCHANGED — attributes only. Whether
              🔴 THE NAME AND THE ACCESSIBLE NAME MOVE TOGETHER, ALWAYS. This read "Event actions" until
              V11.25 marked the rename; if either the label, the `aria-label` or the `title` is ever changed
              alone, voice control matches NEITHER. Change all three or none. */}
          {/* 🔴 `hidden sm:block` — THE PHONE'S COPY OF THIS IS ON THE EXPANDED LINE 1, AND THERE MUST
              ONLY EVER BE ONE. Below `sm:` this rendered as a bare `▾`; that is the copy that goes. At
              `sm:` and above it is untouched — a flex child is blockified, so `display:block` is what it
              already computed to, and the words, the border, the position and the gate are unchanged. */}
          {/* 🔴 `(!isDemo || isPaused)` — see the phone opener. A paused demo must reach Resume. */}
          {(!isDemo || isPaused) && (
            <button onClick={() => { setEventNoteInput(activeEvent.customer_note || ''); setShowEventMenu(true) }}
              aria-label="Manage event"
              title="Manage event — start, pause, change or finish it"
              className="hidden sm:block flex-shrink-0 text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:border-slate-400 font-semibold">
              <span className="hidden sm:inline">Manage event </span>▾
            </button>
          )}
        </div>
      ) })()}

      {/* ── Recently closed banner ── */}
      {/* ⚠️ "Extend 30 min" REMOVED FROM THIS BANNER ON THE KDS, ON INSTRUCTION (16 August). It called
          `extendEvent(activeEvent.id, 30)` — one tap, relative, no confirm, no undo, sitting ~14px above
          the order grid on a screen that runs UNATTENDED. It was left in place during the finish-time
          extraction on the reasoning that recovering an already-closed event is a different job from
          adjusting a live one; that reasoning is now overruled and the button is gone.
          🔴 RECOVERY IS NOT LOST. Manage event -> "Change event finish time" reaches the same write with
          a picker and a confirm, and it can set any future time rather than only +30.
          ⚠️ THE BANNER ITSELF STAYS — it is how an operator knows the event has ended.
          ⚠️ THE DASHBOARD'S BANNER NOW MATCHES: its copy was removed in the same sweep, and `extendEvent`
          itself is deleted from both files — it had no callers left. */}
      {recentlyClosed && activeEvent && (
        <div className="mx-3 mt-2 mb-1 bg-slate-100 border border-slate-200 rounded-xl p-3 flex items-center justify-between flex-shrink-0">
          <span className="text-sm text-slate-600">Event finished · {activeEvent.venue_name} ended at {formatTime(activeEvent.end_time)}</span>
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
                /* 🔴 THE LIFECYCLE AXIS — `boardMode`, from the two switches. It decides the button
                   branch and NOTHING about appearance. `cardStyle` below is the presentation axis. */
                viewMode={boardMode}
                /* 🔴 THE PRESENTATION AXIS — the Full/Cook control, and it now owns the header, the type
                   size and the item renderer. Before this it did not: `viewMode` carried both jobs, so a
                   Payment-&-handover-off device rendered the COOK card even with `Full` selected — a
                   text-lg order number instead of text-3xl, and no prices. A switch was overruling a
                   display control. `Full` now means everything on every switch combination. */
                cardStyle={cardMode}
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
                /* 🔴 THE THIRD CONFIGURATION: this screen marks ready AND hands over. Window view only,
                   and only when handover is on — a handover-off device takes the cook branch above and
                   never reaches the window block, so `readyOn && handoverOn` is the only combination the
                   card needs told about. `effectiveOrderReady` is still NOT passed: the dashboard's
                   setting and this one are independent by construction, not by coincidence. */
                readyStepOn={boardMode === 'window' && readyOn && handoverOn}
                /* 🔴 THE DISPLAY CHOICE — MONEY ONLY. Hides line prices, the order total, the
                   part-paid row and the refund amount. It does NOT touch buttons, board membership,
                   the item grouping, the card's size, PAID or CARD HELD. */
                hideAmounts={hideAmounts}
                pendingSync={pendingSync.has(order.order_key)}
                /* 🔴 THE PAYMENT OVERLAY, NEWLY WIRED ON THIS SURFACE. A queued `mark_paid` now renders
                   as paid here, exactly as it has on the dashboard — same chip, same colour, same
                   buttons, deliberately indistinguishable from a confirmed payment (see OrderCard's own
                   note on this prop). The alternative was what this screen did until now: show nothing
                   and rely on the server's idempotency to absorb the second press. */
                pendingPayment={paymentOverlay.get(order.order_key)}
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

          {/* Done strip — window view, list mode only */}
          {/* ⚠️ ON boardMode, DELIBERATELY — see the To-make bar above. */}
          {boardMode === 'window' && activeLayout === 'list' && doneOrders.length > 0 && (
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

      {/* ── Event picker (opened from the three-dot menu) ────────────────────────────────────────
          The chip strip's list, moved. Same `switchEvent`, so the confirm that names the event being
          left and the orders on screen still fires on every switch. Closing changes nothing. */}
      {/* ── 🔴 THE SHARED PANEL. The card, the scroll region and the rows now live in ONE place. ──────
          Was ~40 lines of bespoke modal here; the layout it carried (max-h-[85dvh], flex-col, the
          list's flex-1 min-h-0 overflow-y-auto, shrink-0 header/footer, the click-stop) moved INTO
          components/shared/EventPickerPanel.tsx unchanged — see docs/kds-picker-fix-report.md for why
          each of those is load-bearing.
          ⚠️ `switchEvent` AND ITS CONFIRM ARE UNTOUCHED and still belong to this screen: switching
          discards the orders on the board, so the confirm is this surface's own decision.
          ⚠️ THE OFFLINE GATE IS NEW HERE, by decision. `isEventBlocked` mirrors AddOrderPanel's rule —
          offline, not the current event, and not loaded this session — so a kitchen tablet that has
          dropped its connection cannot switch to an event whose orders it does not hold. */}
      <EventPickerPanel
        open={showEventPicker}
        isDemo={isDemo}
        events={events}
        isSelected={event => activeEvent?.id === event.id}
        isEventBlocked={event => isOffline && activeEvent?.id !== event.id}
        onSelect={event => { setShowEventPicker(false); switchEvent(event) }}
        onClose={() => setShowEventPicker(false)}
        title="Change event"
        closeLabel="Cancel"
      />

      {/* ── EVENT ACTIONS — THE SHARED MODAL, the same one the dashboard mounts ─────────────────────
          🔴 EXTRACTED so the two menus cannot drift again. The KDS's copy was MISSING Start / Restart
          Event entirely — a truck whose event had not auto-opened could not start it from the kitchen
          screen — and styled "Change event" as a bordered list row while its siblings were filled
          buttons. Both are fixed by using the dashboard's modal rather than patching this one.
          ⚠️ EVERY ACTION IS STILL THIS SCREEN'S OWN: switchEvent's confirm, the styled finish confirm and
          the shared cancel modal are all unchanged — only the MENU that launches them is shared.
          ⚠️ `onChangeEvent` is omitted when there is only one event, which is what this file did before.
          ⚠️ IT CALLS THE SAME switchEvent, WITH THE SAME CONFIRM, AND THE SEED (seededRef) IS NOT TOUCHED
          — carried over from the note that lived on the old inline markup, because it is the thing most
          worth re-checking whenever this menu changes. */}
      {/* 🔴 MOUNT WIDENED TO `(!isDemo || isPaused)` — the resume path for a paused demo, carrying the
          arm the removed header pause button used to hold.
          🔴 AND `onPause` IS `undefined` IN DEMO, DELIBERATELY. EventActionsModal renders its pause row
          only when `onPause` is passed (`onPause && (…)`), so a demo gets RESUME and never PAUSE — the
          exact asymmetry the old header button had via `(!isDemo || isPaused)` on a single toggle. */}
      {showEventMenu && activeEvent && (!isDemo || isPaused) && (
        <EventActionsModal
          // ⚠️ THE FOUR EXTRA FIELDS ARE READ STRAIGHT OFF THE SAME `activeEvent` THE BAR RENDERS, so the
          //    menu and the bar above it can never describe two different events. The modal formats them
          //    with `fmtVenue`/`eventDateLabel`/`formatTimeRange` — no formatter was written for it.
          event={{ id: activeEvent.id, venue_name: activeEvent.venue_name, status: activeEvent.status, town: activeEvent.town, event_date: activeEvent.event_date, start_time: activeEvent.start_time, end_time: activeEvent.end_time }}
          noteValue={eventNoteInput}
          onNoteChange={setEventNoteInput}
          onSaveNote={() => saveEventNote(activeEvent.id)}
          onStartEvent={() => { setShowEventMenu(false); void openEvent(activeEvent.id) }}
          onChangeEvent={events.length > 1 ? () => { setShowEventMenu(false); setShowEventPicker(true) } : undefined}
          paused={isPaused}
          onPause={isDemo ? undefined : () => { setShowEventMenu(false); togglePause() }}
          onResume={() => { setShowEventMenu(false); togglePause() }}
          // EXTRA WAIT — the control that used to sit on this header, in the slot the dashboard already
          //    fills. 🔴 THE DEMO GATE IS THE DASHBOARD'S, NOT THE HEADER'S: the header hid it outright in
          //    demo, and this hides the ADD direction while leaving a clear path if a value somehow
          //    exists — the same shape `renderExtraWait` uses, and the same reasoning as the pause
          //    button's `(!isDemo || isPaused)` two rows above.
          extraWaitControl={(isDemo && extraWaitMins <= 0) ? undefined : extraWaitMins > 0 ? (
            <button onClick={() => { setShowEventMenu(false); void handleSetWait(0) }}
              className="w-full bg-orange-100 text-orange-700 border border-orange-300 font-black py-2.5 rounded-xl hover:bg-orange-200 text-sm">
              ⏱ +{extraWaitMins}m active · Tap to clear
            </button>
          ) : (
            <button onClick={() => { setShowEventMenu(false); setShowExtraWaitPicker(true) }}
              className="w-full bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl hover:bg-slate-200 text-sm">
              ⏱ Add extra wait
            </button>
          )}
          onChangeFinishTime={() => { setShowEventMenu(false); setFinishTimeTarget({ id: activeEvent.id, end_time: activeEvent.end_time ?? null, event_date: activeEvent.event_date ?? null }) }}
          onFinishEvent={() => finishEvent(activeEvent.id)}
          onCancelEvent={() => cancelEventFromMenu(activeEvent)}
          onClose={() => setShowEventMenu(false)}
        />
      )}

      {/* The shared extra-wait picker — the SAME component the dashboard opens, with the same three
          options. `handleSetWait` is this surface's own write and is unchanged. */}
      {showExtraWaitPicker && (
        <ExtraWaitModal onPick={m => { void handleSetWait(m); setShowExtraWaitPicker(false) }} onClose={() => setShowExtraWaitPicker(false)} />
      )}

      {/* Event-cancel gate — the SHARED modal (components/shared/EventCancelModal), the same one manage
          and the dashboard use. It replaced a window.confirm whose safe button read "Cancel". */}
      {eventCancelTarget && (
        <EventCancelModal
          event={eventCancelTarget}
          affectedOrderCount={eventCancelCount}
          busy={eventCancelBusy}
          onKeep={() => setEventCancelTarget(null)}
          onConfirm={(reason, note) => { void doCancelEvent(eventCancelTarget.id, reason, note) }}
        />
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

      {/* ── REJECT: THE SHARED REASON GATE ───────────────────────────────────────────────────────
          🔴 THE SAME COMPONENT THE DASHBOARD MOUNTS, so the reasons, their order, their labels and the
          mandatory-reason rule cannot drift between the two surfaces. The Reject button that opens it
          sits ABOVE every `viewMode` branch in OrderCard, so this gate now stands in all three switch
          configurations rather than only where the dashboard happened to render.
          ⚠️ `cancel` HAS NO INTERCEPTION HERE, DELIBERATELY. This surface CANNOT DISPATCH IT: the Cancel
          control lives inside OrderCard's `viewMode === 'solo'` branch and the KDS renders only 'window'
          and 'cook'. Wiring a modal for an action no control can fire would be dead code that reads as
          coverage — and the cancel modal is not just a reason, it is a REFUND DECISION, which is a money
          flow this screen has never had. If Cancel is ever surfaced here, that is the change that needs
          it, not this one. */}
      {rejectingOrder && (
        <RejectOrderModal
          orderId={rejectingOrder.id}
          customerName={rejectingOrder.customer_name}
          /* ⚠️ NO TOTAL ON THIS SURFACE, DELIBERATELY, AND IT IS A JUDGEMENT I AM FLAGGING RATHER THAN
             BURYING. The dashboard shows " · £12.00" here and this screen has a display mode whose whole
             definition is that no monetary amount renders (`hideAmounts`). Adding an UNCONDITIONAL price
             to a KDS overlay would be the first money render on this surface that the Cook toggle does
             not govern. The order is identified by its number and the customer's name, which is what a
             rejection decision needs. One prop reverses it if you disagree. */
          totalLabel=""
          onConfirm={confirmRejectOrder}
          onDismiss={() => setRejectingOrder(null)}
        />
      )}

      {/* ── CHANGE FINISH TIME — THE SHARED MODAL ────────────────────────────────────────────────
          🔴 EXTRACTED, NOT REWRITTEN. The picker, the confirm, the validation, the affected-order count
          and every word of copy moved verbatim into components/shared/EventFinishTimeModal so the
          DASHBOARD offers the same control — it had `Extend event +30 min`, one tap, relative, with no
          confirm. Both surfaces now gate the same action the same way.
          ⚠️ THE COMPONENT OWNS THE TWO STEPS; this file owns the WRITE, because the KDS routes it through
          the offline outbox (`data?.queued`) and the dashboard does not. */}
      {finishTimeTarget && (
        <EventFinishTimeModal
          event={finishTimeTarget}
          orders={overlayedOrders}
          busy={finishTimeBusy}
          onClose={() => setFinishTimeTarget(null)}
          onConfirm={newEnd => { void applyFinishTime(finishTimeTarget.id, newEnd) }}
        />
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

      {/* ── 🔴 THE STEPS PANEL WAS ABSORBED INTO THE `View` PANEL BELOW, NOT DELETED ──────────────
          Its two rows, their sentences, their handlers and the `disabled` rule are all still on this
          screen — they render inside the one phone panel, under "What this screen does". A phone had
          TWO sheets behind two buttons for one screen's settings; it now has one. */}
      {/* "This device" sheet — same pattern as the dashboard UserMenu. ThisDeviceSettings self-guards on
          isNativeApp and renders its own card + "this device only" note. `token` here is the dashboard
          token (this route runs on it), so its bind-device calls authenticate. */}
      {/* 🔴 NO LONGER `!isDemo` — see the device button's note. The sheet now carries two controls every
          KDS has, so it must open on every KDS; the native-only CONFIG inside it keeps its own gate. */}
      {deviceOpen && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-4"
          onClick={() => setDeviceOpen(false)}>
          <div className="w-full max-w-sm" onClick={e => e.stopPropagation()}>
            {/* 🔴 THE WORDING LIVES HERE, WHERE THERE IS ROOM FOR IT. The button that opens this sheet is
                a bare 📱 by necessity, so this heading is where an operator finds out what they opened.
                Same two words as the button's aria-label and title.
                ⚠️ IT IS ADDED ON THE SHEET, NOT INSIDE THE CARD. The card is `ThisDeviceSettings`, which
                lives in components/native/OperatorDeviceConfig.tsx and is ALSO mounted by the dashboard's
                UserMenu — editing its own `<h3>This device</h3>` would change the dashboard, which this
                task must not do. So the sheet supplies the heading and the shared card is untouched.
                ⚠️ CONSEQUENCE, STATED: the sheet now reads "Device settings" and the card below it still
                reads "This device" as its first line. Not a contradiction — the inner one labels the
                viewing/ID block — but they are two headings where one would do. Reported, not resolved. */}
            <div className="flex items-center justify-between mb-1">
                {/* 🔴 ONE WORDING AT BOTH WIDTHS AGAIN. The phone opener on line 4 says `Device settings`
                  and so does the 📱 button's accessible name, so the breakpoint pair this heading carried is
                  no longer buying anything — and `Device settings` is what it read at `sm:`+ before and
                  after. The panel holds device configuration on a phone and device configuration plus the
                  sound detail on a tablet; the name is true of both. */}
              {/* 🔴 ONE `<h2>`, TWO WORDINGS, AND EACH IS TRUE OF WHAT IS ACTUALLY BELOW IT. Below `sm:`
                  this sheet holds ONLY the native device card — the sound card inside it is
                  `hidden sm:flex` — and it is opened by the expander's native-gated `Device settings`
                  button, so `Device settings` is the honest name there. At `sm:` and above it holds
                  which-sounds and the due-to-cook setting (plus that same card on a native device), and
                  it is opened by the header's `Sound settings` chip, so it says `Sound settings` and
                  matches the control that opened it. */}
              <h2 className="text-white font-bold text-base">
                <span className="sm:hidden">Device settings</span>
                <span className="hidden sm:inline">Sound settings</span>
              </h2>
              <button onClick={() => setDeviceOpen(false)} aria-label="Close"
                className="text-white/80 hover:text-white text-3xl leading-none">×</button>
            </div>
            <div className="bg-white rounded-2xl shadow-2xl max-h-[85vh] overflow-y-auto">
              {/* ── 🔴 THE TWO CONTROLS MOVED OFF THE HEADER, WITH THE FULL LABELS THAT WAS THE POINT ──
                  On the header these were a bare 🔔/🔕 at every width and an emoji-only ☀️/🌙 below
                  `sm:`. Here they get sentences.
                  🔴 WRITTEN HERE, IN THE KDS'S OWN SHEET, AND **NOT** INSIDE `ThisDeviceSettings`.
                  That component is SHARED — components/dashboard/UserMenu.tsx mounts it too — and a
                  screen-wake or new-order-ding row has no meaning on the dashboard's copy. Putting them
                  in it would have changed what the dashboard renders, which this task forbids. The
                  dashboard's UserMenu is byte-for-byte unaffected by everything in this task.
                  ⚠️ THE ROW GRAMMAR IS COPIED FROM THAT CARD ON PURPOSE — `flex items-center
                  justify-between gap-3 text-sm` with a `font-semibold text-slate-700` label — so the
                  two blocks read as one sheet rather than as a bolted-on strip.
                  ⚠️ BOTH HANDLERS ARE THE ORIGINALS, UNCHANGED: `toggleKeepScreenOn` (which owns the
                  failure toast) and the sound setter that primes the audio when enabling, because
                  enabling is the user gesture the browser requires. */}
              {/* 🔴 THE PHONE-ONLY SECTION THAT SAT HERE IS GONE — SUPERSEDED, NOT LOST. The step
                  switches and the two display segments are on the header's own expanded rows now, where
                  the operator can see the board change as they tap. A panel that covered the board while
                  they changed what the board does was the defect; keeping a second copy of those rows in
                  here would put it straight back. Nothing at `sm:` and above is affected — that section
                  was `sm:hidden` and generated no box there. */}
              {/* 🔴 THE PHONE SECTION THAT SAT HERE IS GONE, AND SO IS EVERY SOUND ROW BELOW `sm:`.
                  All of it is in the header's expanded region now, in flow, where the board stays visible.
                  What is left in this panel BELOW `sm:` is the native device card and nothing else — which
                  is why the card wrapper underneath is `hidden sm:flex` and this panel is opened on a phone
                  only by line 4's native-gated `Device settings` opener.
                  ⚠️ AT `sm:` AND ABOVE NOTHING CHANGED: every row inside that wrapper renders exactly as it
                  did, in the same order, opened by the same 📱 button. */}
              <div className="hidden sm:flex rounded-2xl border border-slate-200 p-4 flex-col gap-3 mb-3">
                {/* 🔴 THIS IS THE KDS's OWN SHEET WRAPPER, NOT `ThisDeviceSettings` — that shared card is
                    mounted below and keeps its own "This device" heading, so the dashboard's UserMenu is
                    untouched by this edit.
                    🔴 THE HEADING IS `hidden sm:block` NOW, AND THAT IS A CONSEQUENCE OF WHAT IS LEFT IN
                    THE CARD. At `sm:` and above it holds the master, which-sounds and due-to-cook, so
                    "Sound" is exactly right and is the word it already carried. Below `sm:` the master and
                    keep-screen-on are on the header's own line, this card holds only the two set-once
                    settings, and the panel's `<h2>` above already says "Sounds" — a second heading saying
                    the same word one line lower is noise, so it does not render there. The `sm:hidden`
                    "Screen & sound" wording went with the screen row it named. */}
                <h3 className="hidden sm:block text-sm font-bold text-slate-900">Sound</h3>
                {/* 🔴 KEEP-SCREEN-ON HAS LEFT THIS PANEL AGAIN, AND THAT IS A CORRECTION, NOT A WOBBLE.
                    It is the wake-lock ACQUISITION control on web — Safari grants the lock only on a
                    completed gesture and drops it on visibility loss — so a control the operator re-taps
                    after every visibility change cannot live behind a button. It is on the header row, in
                    words. ⚠️ This row was `sm:hidden`, so `sm:` and above never rendered it either way. */}
                {/* 🔴 THE MASTER ROW THAT SAT HERE IS GONE — IT WAS THIS SHEET'S ONLY REASON TO CARRY
                    A CONTROL RATHER THAN A SETTING. It was `hidden sm:flex`, i.e. the `sm:`-and-above
                    home of the new-order ding, and the ding is now a chip on the header at that width
                    too. Keeping it would be two controls for one setting on one screen. Below `sm:` it
                    was already hidden, so a phone loses nothing. */}
                {/* ── 🔴 WHICH SOUNDS — THE CONTROL THIS SURFACE NEVER HAD ──────────────────────────
                    The KDS has always READ this value and never been able to SET it, so an operator on a
                    kitchen screen who wanted only needs-confirming orders to ding had to walk to the
                    dashboard. The rows below are the DASHBOARD'S, reused verbatim — same two options,
                    same labels, same radio shape — because inventing a second vocabulary for one stored
                    value is how two surfaces come to disagree about what it means.
                    🔴 IT WRITES THE SHARED `hg_soundcfg_${token}` KEY, AND THE SHARING STAYS. That is
                    documented as deliberate — "which sounds fire is one concept in one place on this
                    device" — and the defect was never the sharing; it was that only ONE surface could
                    write it.
                    ⚠️ NO CROSS-SURFACE SYNC IS BUILT, AND THE CONSEQUENCE IS STATED: the dashboard reads
                    this key into its own state at mount, so a change made here reaches an ALREADY-OPEN
                    dashboard only after that page reloads. Both surfaces are correct on their next load.
                    ⚠️ `soundConfigRef` is updated alongside the state so the ding decision — which reads
                    the ref, not the state — takes effect on the very next order without a re-render. */}
                <div className="pt-1">
                  <p className="text-sm font-semibold text-slate-700 mb-1.5">New order sound</p>
                  <div className="space-y-1">
                    {([['needs_confirming', 'Only orders needing confirming'], ['all', 'All new orders']] as const).map(([val, label]) => (
                      <button key={val} type="button"
                        onClick={() => {
                          const next = { ...(storedSoundCfg ?? DEFAULT_SOUND_CONFIG), new_orders: val }
                          writeSoundConfig(token, next); setStoredSoundCfg(next); soundConfigRef.current = next
                        }}
                        className="flex items-center gap-2.5 w-full text-left py-1">
                        <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${(storedSoundCfg ?? DEFAULT_SOUND_CONFIG).new_orders === val ? 'border-orange-500' : 'border-slate-300'}`}>
                          {(storedSoundCfg ?? DEFAULT_SOUND_CONFIG).new_orders === val && <span className="w-2 h-2 rounded-full bg-orange-500" />}
                        </span>
                        <span className="text-sm text-slate-700">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {/* ── 🔴 THE SETTING THIS SURFACE NEVER HAD — "due to be cooked" ─────────────────────
                    The KDS reads `order_due` when it decides whether to ding an amber ticket and had no
                    way to SET it, so a cook who wanted that sound had to walk to the dashboard. 🔴 THE
                    LABEL AND THE SUB-LABEL ARE THE DASHBOARD'S, WORD FOR WORD — "Sound when an order is
                    due to be cooked" / "Sounds when a ticket turns amber." One setting must not acquire a
                    second name on the way to a second surface.
                    ⚠️ THE SHAPE IS THIS SHEET'S, NOT THE DASHBOARD'S `Toggle`. Every other control in this
                    panel is the same pill button, and importing the dashboard's toggle would put one
                    stranger among them; the WORDS are what must match, not the widget.
                    🔴 IT WRITES THE SAME SHARED `hg_soundcfg_` KEY THROUGH `writeSoundConfig`, exactly as
                    the "which sounds" radios above it do, and updates `soundConfigRef` alongside the state
                    so the next amber ticket obeys it without waiting for a re-render. */}
                <label className="flex items-center justify-between gap-3 text-sm pt-1">
                  <span className="font-semibold text-slate-700">Sound when an order is due to be cooked</span>
                  <button
                    type="button"
                    onClick={() => {
                      const cur = storedSoundCfg ?? DEFAULT_SOUND_CONFIG
                      const next = { ...cur, order_due: !cur.order_due }
                      writeSoundConfig(token, next); setStoredSoundCfg(next); soundConfigRef.current = next
                    }}
                    aria-pressed={(storedSoundCfg ?? DEFAULT_SOUND_CONFIG).order_due}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${(storedSoundCfg ?? DEFAULT_SOUND_CONFIG).order_due ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}
                  >
                    <span>{(storedSoundCfg ?? DEFAULT_SOUND_CONFIG).order_due ? 'On' : 'Off'}</span>
                  </button>
                </label>
                <p className="text-xs text-slate-500 -mt-1">Sounds when a ticket turns amber.</p>
              </div>
              {/* The native-only device configuration, gate intact — see the device button's note. */}
              {isNativeApp() && !isDemo && <ThisDeviceSettings token={token} />}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
