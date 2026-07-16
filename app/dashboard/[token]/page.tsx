'use client'
// app/dashboard/[token]/page.tsx

import { useState, useEffect, useCallback, useRef, useMemo, use, Fragment } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { hasFeature } from '@/lib/features'
import { OFFLINE_PROTECTION_ENABLE_CONFIRM, OFFLINE_PROTECTION_DISABLE_CONFIRM, OFFLINE_PROTECTION_CARD_DESCRIPTION, OFFLINE_PROTECTION_EXPLAINER_LEAD, OFFLINE_PROTECTION_EXPLAINER_BODY } from '@/lib/copy/offlineProtection'
import AppHeader from '@/components/shared/AppHeader'
import { playNewOrder, playOrderDue, installAudioUnlock, primeAudio } from '@/lib/audio'

import type {
  Order, Slot, TruckData, TruckMenu, Bundle, MenuItem,
  BasketItem, AppliedDeal, ItemStock, CategoryStock, CatConfig,
  ModifierOption, ModifierGroup, TruckEvent, SoundConfig,
} from '@/components/dashboard/types'
import { STATUS, DEFAULT_CAT_CONFIG, DEFAULT_SOUND_CONFIG } from '@/components/dashboard/types'
import {
  getAsapSlot, getCatConfig, catCookSecs,
  calcMinsFromNow, getAllDayCounts, resolveCollectionTime,
  getOrderCookSecs, getCombinedUrgency, cookAmberLeadMins
} from '@/components/dashboard/helpers'
import { OrderCard, Toggle, InlinePriceEditor } from '@/components/dashboard/OrderCard'
import { useToasts } from '@/lib/useToasts'
import { useReadyEmailUndo } from '@/lib/useReadyEmailUndo'
import { ToastStack } from '@/components/ToastStack'

/** "Village Hall — Wickhambrook", skip town if already in venue name */
function fmtVenue(venueName?: string | null, town?: string | null): string {
  if (!venueName && !town) return ''
  if (!venueName) return town!
  if (!town) return venueName
  if (venueName.toLowerCase().includes(town.toLowerCase())) return venueName
  return `${venueName} — ${town}`
}
import { DealsModal } from '@/components/dashboard/DealsModal'
import { AddOrderPanel } from '@/components/dashboard/AddOrderPanel'
import { DayLoadStrip } from '@/components/dashboard/DayLoadStrip'
import UserMenu from '@/components/dashboard/UserMenu'
import { AppLink } from '@/components/native/AppLink'   // internal-route anchor: soft-nav in native, plain <a> on web
import { DeviceSetupGate } from '@/components/native/OperatorDeviceConfig'
import { AppLockGate } from '@/components/native/AppLockGate'
import { calculateOrderTotal } from '@/lib/order-calculations'
import { adjustQuantity, cleanupDealsForItem, groupByCategory, groupBySubcategory, isOrderNonEmpty, consumeBasketItemsForDeal, dealConsumedCartKeys } from '@/lib/basket-utils'
import { supabaseBrowser } from '@/lib/supabase-browser'
import { keepAwake, keepAwakeOnGesture, allowSleep, subscribeWakeState, type WakeState } from '@/lib/native/keepAwake'
import { addNetworkListener } from '@/lib/native/network'
import { onAppResume } from '@/lib/native/app'
import { isNativeApp, setLastScreen } from '@/lib/native/device'
import { configureStatusBar } from '@/lib/native/statusBar'
import { gatedAction, STATUS_REPLAY_EXPECTED_FROM } from '@/lib/native/orderGate'
import { removePendingStatusOp } from '@/lib/native/outbox'
import { isOnline, startReachability, onReachabilityChange } from '@/lib/native/reachability'
import { useOfflineAlert } from '@/lib/native/useOfflineAlert'
import { NotificationSettings } from '@/components/native/NotificationSettings'
import { OfflineBanner } from '@/components/native/OfflineBanner'
import { WebOfflineBanner } from '@/components/WebOfflineBanner'
import { KeepAwakePrompt } from '@/components/dashboard/KeepAwakePrompt'
import { CapacityBreachBanner } from '@/components/dashboard/CapacityBreachBanner'
import type { CapacityBreach } from '@/lib/capacity-breach'
import { mergeOrders } from '@/lib/orders/mergeOrders'
import { useOfflineStatusOverlay } from '@/lib/native/useOfflineStatusOverlay'
import { DevOfflineToggle } from '@/components/native/DevOfflineToggle'
import { DevOutboxInspector } from '@/components/native/DevOutboxInspector'
import { PrintingSettings } from '@/components/printing/PrintingSettings'
import { registerServiceWorker } from '@/lib/native/serviceWorker'
import { nativeAuthHeader } from '@/lib/native/session'
import { formatTime, localTodayIso, pickDefaultEventByTime, getLocalDateInTz } from '@/lib/time-utils'
import { KITCHEN_CAPACITY_DESC, KITCHEN_CAPACITY_EXAMPLE, KITCHEN_CAPACITY_WARNING, KITCHEN_CAPACITY_GRID, kitchenCapacityNeedsPrepWarning, formatPrepSecs } from '@/lib/kitchen-capacity'
import { PrepTimeSelect } from '@/components/PrepTimeSelect'
import { BatchSizeSelect } from '@/components/manage/KitchenCapacityEdit'
import { buildSlotIndicators, type SlotIndicator } from '@/lib/slot-display'
import { normaliseOrderLines } from '@/lib/slot-bookings'
import { orderItemsToQtyByCat, mergeQtyByCat } from '@/lib/slot-capacity'

function makeCartKey(itemName: string, mods: { name: string }[], notes?: string): string {
  const parts: string[] = []
  const modStr = [...mods].map(m => m.name).sort().join('|')
  if (modStr) parts.push(modStr)
  const noteStr = (notes || '').trim()
  if (noteStr) parts.push(`note:${noteStr}`)
  return parts.length > 0 ? `${itemName}::${parts.join('::')}` : itemName
}

// CLEANUP: on cold launch, purge the SW read-cache (DATA_CACHE = 'vf-data-v1', see public/sw.js) entries for
// events that have ENDED (the request's `date` query param < today). These are re-fetchable read snapshots,
// so removing a past event's snapshot is safe. GATED ON ONLINE — never touch the cache offline (it may be the
// only copy of the CURRENT event's data). Touches the CACHE ONLY — NEVER Preferences / the outbox (un-synced
// ops for a past event must still drain). Past-date only ⇒ today's/future events' cache is preserved.
async function pruneStaleEventCache(): Promise<void> {
  try {
    if (typeof caches === 'undefined') return
    if (typeof navigator !== 'undefined' && !navigator.onLine) return   // offline → don't evict the offline snapshot
    const cache = await caches.open('vf-data-v1')
    const todayIso = new Date().toISOString().split('T')[0]
    for (const req of await cache.keys()) {
      try {
        const d = new URL(req.url).searchParams.get('date')   // /api/dashboard?…&date=YYYY-MM-DD (per-event)
        if (d && d < todayIso) await cache.delete(req)
      } catch { /* skip an unparseable key, never throw */ }
    }
  } catch { /* cache API unavailable / any error → no-op, never crash the dashboard */ }
}

export default function DashboardPage({params}:{params:Promise<{token:string}>}) {
  const{token}=use(params)
  const searchParams=useSearchParams()
  const router=useRouter()
  const vanName=searchParams.get('van_name')??''
  const vanId=searchParams.get('van_id')??''
  // Native: remember this device is on the DASHBOARD so a cold-launch reopens here (restart-to-last-screen, §33).
  useEffect(()=>{if(isNativeApp()){setLastScreen('dashboard');void configureStatusBar()}},[]) // configureStatusBar here too (not only cold-launch /app) so the WebView overlays the status bar wherever AppHeader renders
  // Register the read-cache service worker (offline snapshot of this event's orders + menu). Its mutation
  // replay is neutered — the app-level outbox owns all writes (Phase-1 offline).
  useEffect(()=>{registerServiceWorker()},[])
  const[pin,setPin]=useState('')
  const[pinInput,setPinInput]=useState('')
  const[pinError,setPinError]=useState('')
  const[requiresPin,setRequiresPin]=useState(false)
  const[authenticated,setAuthenticated]=useState(false)
  const[truck,setTruck]=useState<TruckData|null>(null)
  const[orders,setOrders]=useState<Order[]>([])
  // Offline walk-ups optimistically added here (isolated from `orders`/fetchAll). Merged into the display
  // list below; cleared on the reconnect drain (OfflineBanner onSynced), when the real orders arrive.
  const[deviceQueuedOrders,setDeviceQueuedOrders]=useState<Order[]>([])
  // FIX 2 — durable offline pending-status overlay. Optimistic advances live in the outbox (not a one-shot
  // setOrders patch a stale poll would wipe); applied at render over the merged orders. HOLDS each entry until
  // the server reflects the status (no reconnect flash — ISSUE 2). Web/non-native → empty → no-op. dropEntry =
  // the offline UNDO (drop the optimistic entry as-if-never-happened). refreshPendingStatus() re-reads the
  // outbox immediately after queueing / on drain.
  const{overlay:statusOverlay,refresh:refreshPendingStatus,dropEntry:dropOverlayEntry}=useOfflineStatusOverlay(orders)
  // The active event's van "Show cooking step" preference — REUSED (no new toggle) to also expose the
  // order-READY step on the operator orders (solo) screen, alongside pub mode. Defaults off.
  const[showCookingStep,setShowCookingStep]=useState(false)
  // Order-ready redesign (stage 3): the resolved order-ready value (event override ?? van default ?? false,
  // computed in /api/dashboard) — gates the orders-screen Ready button. Defaults off.
  const[effectiveOrderReady,setEffectiveOrderReady]=useState(false)
  const[slots,setSlots]=useState<Slot[]>([])
  const[truckMenu,setTruckMenu]=useState<TruckMenu|null>(null)
  // Per-EVENT stock slices (keyed by event_id; '__none__' for the no-event case). Keeps each event's
  // stock isolated so switching events never renders the previous event's rows during the re-fetch
  // round-trip (stale-while-revalidate: a cached slice shows instantly, an unseen one shows a skeleton
  // until its fetch lands). The flat `itemStocks`/`categoryStocks` below are the CURRENT slice derived
  // from these maps, so all existing reads + draft inputs keep working unchanged.
  const[itemStocksByEvent,setItemStocksByEvent]=useState<Record<string,ItemStock[]>>({})
  const[categoryStocksByEvent,setCategoryStocksByEvent]=useState<Record<string,CategoryStock[]>>({})
  // Event keys whose stock has resolved at least once → drives the skeleton (unseen key = skeleton,
  // not empty rows).
  const[fetchedStockKeys,setFetchedStockKeys]=useState<Set<string>>(new Set())
  // Local DRAFTS for the Menu & Stock number inputs (keyed by item name / category). While a field
  // is focused/being edited it has a draft entry, so the input reads the draft — NOT the resolved
  // prop — which stops fetchAll/fetchStock (orders realtime + 60s poll) clobbering it mid-edit during
  // live service. Drafts are seeded on focus, updated on keystroke (no network), committed on
  // blur/Enter, reverted on Escape, then cleared (input falls back to the optimistically-updated state).
  const[stockDrafts,setStockDrafts]=useState<Record<string,string>>({})
  const[catStockDrafts,setCatStockDrafts]=useState<Record<string,string>>({})
  // Standing option-stock number-input drafts (keyed by option id) — same live-edit guard pattern.
  const[optStockDrafts,setOptStockDrafts]=useState<Record<string,string>>({})
  // Set by Escape so the blur it triggers reverts the draft instead of committing it.
  const skipStockBlurRef=useRef(false)
  // ── SHARED optimistic-write guard (ONE mechanism for every dual-source field) ─────────────────────────
  // A field the operator edits optimistically registers its key here; any background refetch (poll /
  // realtime / reseed) applies the DESIRED value over server state until the server ECHOES it (then the
  // key is released). Stops the write-round-trip clobber (the flip-back bug) without a per-toggle ref that
  // a future edit has to remember. Used by: pause + extra-wait (dual-source live), and category-available
  // (keyed `catavail:${eventKey}:${cat}`, meta = original-case name so an omitting refetch can re-add it).
  const pendingWritesRef=useRef<Record<string,{v:any;meta?:any}>>({})
  // Guard a SCALAR field: return the value to use, releasing the key once the server value matches.
  const applyPending=useCallback((key:string,serverVal:any)=>{
    const p=pendingWritesRef.current, g=p[key]
    if(!g) return serverVal
    if(serverVal===g.v){ delete p[key]; return serverVal }
    return g.v
  },[])
  // Register an optimistic write BEFORE its setState, so a background refetch mid-write can't clobber it.
  const markPending=useCallback((key:string,value:any)=>{ pendingWritesRef.current[key]={v:value} },[])
  const[loading,setLoading]=useState(true)
  const[error,setError]=useState<string|null>(null)
  const[lastRefresh,setLastRefresh]=useState(new Date())
  const[activeTab,setActiveTab]=useState<'orders'|'add'|'stock'|'settings'>('orders')
  const[actionLoading,setActionLoading]=useState<string|null>(null)
  // Shared stacked-toast system (lib/useToasts) + the ready-email-undo machinery (lib/useReadyEmailUndo,
  // wired below after fetchAll). Extracted so KDS + manage can reuse the SAME implementation.
  const{toasts,showToast,dismissToast}=useToasts()
  const[extraWaitMins,setExtraWaitMins]=useState(0)
  const[extraWaitStartedAt,setExtraWaitStartedAt]=useState<string|null>(null)
  const[waitTick,setWaitTick]=useState(0)
  const[todayEvents,setTodayEvents]=useState<TruckEvent[]>([])
  const[upcomingEvents,setUpcomingEvents]=useState<TruckEvent[]>([])
  const[selectedEventId,setSelectedEventId]=useState<string|null>(null)
  const[showEventMenu,setShowEventMenu]=useState(false)
  // Styled "finish event" confirm (replaces window.confirm). early → harder warning naming the end.
  const[finishConfirm,setFinishConfirm]=useState<{eventId:string;early:boolean;endTime:string}|null>(null)
  const[eventNoteInput,setEventNoteInput]=useState('')
  const[pendingOpenEventPicker,setPendingOpenEventPicker]=useState(false)
  const[autoAccept,setAutoAccept]=useState(false)
  const[savingAutoAccept,setSavingAutoAccept]=useState(false)
  const[notesRequireReview,setNotesRequireReview]=useState(true)   // safe-by-default
  const[savingNotesReview,setSavingNotesReview]=useState(false)
  const[vanAutoPause,setVanAutoPause]=useState<boolean>(false)
  const[eventOfflineOverride,setEventOfflineOverride]=useState<boolean|null>(null)
  // Order-ready (master-switch model): the van DEFAULT (order_ready_enabled — the Settings master switch +
  // seed for new events) + the per-event value (order_ready_override, concrete true/false). effectiveOrderReady
  // resolves override ?? default ?? false server-side and gates the Ready button; the dashboard toggle reads it.
  const[vanOrderReadyDefault,setVanOrderReadyDefault]=useState<boolean>(false)
  const[eventOrderReadyOverride,setEventOrderReadyOverride]=useState<boolean|null>(null)
  const[kitchenCapacity,setKitchenCapacity]=useState<number|null>(null)
  const[capacityWindowMins,setCapacityWindowMins]=useState<number>(5)
  // Frozen server occupancy + server catConfigs (with countsToCapacity) — inputs the OFFLINE capacity re-run
  // folds deviceQueuedOrders into (Piece 1). Only refresh on a successful (online) fetch → they hold the
  // last-synced state while offline. Unused online.
  const[productionSlotUnits,setProductionSlotUnits]=useState<Record<string,Record<string,number>>>({})
  const[serverCatConfigs,setServerCatConfigs]=useState<Record<string,CatConfig>>({})
  // Piece 2 — server-detected over-capacity slots (reconnect flag). Dismiss keyed to the breach set
  // signature so a NEW/worse breach re-shows but an already-reviewed one stays hidden.
  const[capacityBreaches,setCapacityBreaches]=useState<CapacityBreach[]>([])
  const[breachDismissedSig,setBreachDismissedSig]=useState<string|null>(null)
  const[activeVanName,setActiveVanName]=useState<string|null>(null)
  const[showCompleted,setShowCompleted]=useState(false)
  const[struckPrep,setStruckPrep]=useState<Set<string>>(new Set())
  const[undoPrep,setUndoPrep]=useState<{name:string;qty:number}|null>(null)
  const[categoryConfigs,setCategoryConfigs]=useState<Record<string,{secs:number;batch:number}>>({})
  const[categoryAllowNotes,setCategoryAllowNotes]=useState<Record<string,boolean>>({})
  const[editingCatId,setEditingCatId]=useState<string|null>(null)
  const[editCatForm,setEditCatForm]=useState<{name:string;prepMins:number;prepSecs30:number;batch:number;allowNotes:boolean}|null>(null)
  const[savingCat,setSavingCat]=useState(false)
  const[showPrepList,setShowPrepList]=useState(false)
  const[showPrepTimeBanner,setShowPrepTimeBanner]=useState(false)
  const[keepScreenOn,setKeepScreenOn]=useState(true)
  // ACTUAL keep-awake state (held / denied / unsupported / native), NOT the intent. The toggle reads this so
  // it can't claim "Screen on" while the lock was denied. Updates live (OS release, focus re-acquire).
  const[wakeState,setWakeState]=useState<WakeState>('off')
  useEffect(()=>subscribeWakeState(setWakeState),[])
  // BINARY UI: the toggle shows "Screen on" (green) ONLY when the lock is actually HELD; otherwise "Screen off"
  // (grey). No hedged labels — honesty is carried by position. The internal WakeState still drives a plain-
  // English failure MESSAGE (toast) shown only when the operator TAPS to turn it on and it can't hold.
  const screenHeld = wakeState==='held'||wakeState==='native'
  // New-order SOUND pref — per DEVICE (localStorage, not DB), default ON (a truck wants to hear orders).
  const[soundEnabled,setSoundEnabled]=useState(true)
  const[currentUserName,setCurrentUserName]=useState<string|null>(null)
  const[currentUserFirstName,setCurrentUserFirstName]=useState<string|null>(null)
  const[currentUserEmail,setCurrentUserEmail]=useState<string|null>(null)
  const[isAdmin,setIsAdmin]=useState(false)
  const[userRole,setUserRole]=useState<'owner'|'manager'|'staff'|null>(null)
  const[showScreenOffWarning,setShowScreenOffWarning]=useState(false)
  const[vansWithAutoPause,setVansWithAutoPause]=useState<string[]>([])
  const[vans,setVans]=useState<{id:string;name:string;auto_pause_on_offline:boolean;kds_token?:string|null}[]>([])
  const[showKDSPicker,setShowKDSPicker]=useState(false)
  const[showProfileModal,setShowProfileModal]=useState(false)
  const[editProfileName,setEditProfileName]=useState('')
  const[savingProfile,setSavingProfile]=useState(false)
  // (showUserDropdown removed — UserMenu component manages its own open state)
  // Pause state. The dashboard pause toggle WRITES the active event's VAN pause
  // (truck_vans.paused_until via vanId), so we must READ the van fields too — plus the
  // truck-level legacy field and the offline pause — mirroring the customer menu, so the
  // dashboard and customer agree and the operator can always Resume.
  const[pausedUntil,setPausedUntil]=useState<string|null>(null)            // truck-level (legacy)
  const[vanPausedUntil,setVanPausedUntil]=useState<string|null>(null)       // active van — manual
  const[vanOnlinePausedUntil,setVanOnlinePausedUntil]=useState<string|null>(null) // active van — offline
  // Reactive device-online flag (navigator.onLine + online/offline transition events). Drives BOTH the
  // immediate reconnect-heartbeat (heartbeat-effect dep) AND the operator-only offline-pause suppression.
  const[deviceOnline,setDeviceOnline]=useState(typeof navigator!=='undefined'?navigator.onLine:true)
  // SINGLE offline source for all offline gating (settings-lock, the header chip, and — later — stock/event
  // gating). Driven by the SAME reachability signal OfflineBanner/heartbeat use, so everything agrees. isOffline
  // is false online → every gated control is enabled exactly as today (online path byte-identical).
  const[isOffline,setIsOffline]=useState(false)
  // EVENT-SWITCH GATE (Option A): events whose data was successfully loaded THIS session (network OR the SW
  // read-cache). Offline, the event picker allows switching ONLY to these — a never-loaded event has no
  // cached orders/stock/capacity, so ordering against it would be unsafe. Online → not consulted (no gating).
  const[loadedEventIds,setLoadedEventIds]=useState<Set<string>>(new Set())
  const[showPauseModal,setShowPauseModal]=useState(false)
  // Offline-pause notification: durable marker from /api/dashboard (set only by heartbeat-monitor,
  // survives the reconnect clear). Fires a one-time popup when it's NEWER than this device's ack.
  const[lastOfflinePauseAt,setLastOfflinePauseAt]=useState<string|null>(null)
  const[offlinePauseEventId,setOfflinePauseEventId]=useState<string|null>(null)
  const[showOfflinePausedNotice,setShowOfflinePausedNotice]=useState(false)
  // OK → record the acknowledged marker for THIS event so a poll tick / reload won't re-pop it; a
  // newer offline pause (newer timestamp) clears the guard and re-fires.
  const ackOfflinePausedNotice=()=>{
    if(typeof window!=='undefined'&&offlinePauseEventId&&lastOfflinePauseAt)
      localStorage.setItem(`hg_offline_pause_ack_${offlinePauseEventId}`,lastOfflinePauseAt)
    setShowOfflinePausedNotice(false)
  }
  const isFuturePause=(s:string|null)=>!!s&&new Date(s).getTime()>Date.now()
  const manualPaused=isFuturePause(pausedUntil)||isFuturePause(vanPausedUntil)
  const offlinePaused=isFuturePause(vanOnlinePausedUntil)
  // `paused` / `pauseReason` (the DISPLAY values, with the local-reconnect override applied to the
  // OFFLINE pause only) are derived below, after activeEventLive is resolved — see ~:228.
  const pauseUntilEffective=[vanPausedUntil,pausedUntil,vanOnlinePausedUntil].find(isFuturePause)??null
  // Cancel confirmation modal
  const[showCancelModal,setShowCancelModal]=useState(false)
  const[cancellingOrder,setCancellingOrder]=useState<Order|null>(null)
  const[cancelReason,setCancelReason]=useState('')
  const[cancelNote,setCancelNote]=useState('')
  // Reject (pending-order review) — REQUIRED reason, mirrors the cancel modal pattern.
  const[showRejectModal,setShowRejectModal]=useState(false)
  const[rejectingOrder,setRejectingOrder]=useState<Order|null>(null)
  const[rejectReason,setRejectReason]=useState('')
  const[rejectNote,setRejectNote]=useState('')
  // Edit modal
  const[editingOrder,setEditingOrder]=useState<Order|null>(null)
  // Slots for the EDITED order's own event — fetched via the shared /api/slots path
  // (same as Add Order), so the picker shows that event's window, not the dashboard's
  // active event. Never reuse the dashboard `slots` here.
  const[editSlots,setEditSlots]=useState<Slot[]>([])
  // Engine inputs from /api/slots so the edit picker runs the SAME oven-occupancy
  // projection as Add Order (shared buildSlotIndicators) — not a count ratio.
  const[editCapacityInputs,setEditCapacityInputs]=useState<{productionSlotUnits:Record<string,Record<string,number>>;kitchenCapacity:number|null;capacityWindowMins?:number;windowSecs:number;eventStartMins:number}|null>(null)
  // Server catConfigs (with countsToCapacity) for the edited order's event — fed to the edit
  // picker's buildSlotIndicators instead of the flag-less `categoryConfigs`, so instant items
  // count on the edit path too. Same source/shape as Add Order's serverCatConfigs.
  const[editServerCatConfigs,setEditServerCatConfigs]=useState<Record<string,{secs:number;batch:number}>>({})
  const[editSlotsLoading,setEditSlotsLoading]=useState(false)
  const[editItems,setEditItems]=useState<BasketItem[]>([])
  const[editSlot,setEditSlot]=useState('')
  const[editNotes,setEditNotes]=useState('')
  // Customer contact — all OPTIONAL; never gate Save (Save gates only on isOrderNonEmpty).
  const[editName,setEditName]=useState('')
  const[editEmail,setEditEmail]=useState('')
  const[editPhone,setEditPhone]=useState('')
  const[editDeals,setEditDeals]=useState<Array<{name:string;slots:Record<string,string>;slotModifiers?:Record<string,{name:string;price:number}[]>;slotNotes?:Record<string,string>;isNew?:boolean;itemsTakenFromBasket?:string[]}>>([])
  const[showEditDealModal,setShowEditDealModal]=useState(false)
  const[editOrderBaseline,setEditOrderBaseline]=useState<{total:number;itemsSubtotal:number;deals:Array<{name:string}>}|null>(null)
  const[editItemModal,setEditItemModal]=useState<{item:MenuItem;modGroups:ModifierGroup[];allowNotes:boolean}|null>(null)
  const[editModalMods,setEditModalMods]=useState<{name:string;price:number}[]>([])
  const[editModalNotes,setEditModalNotes]=useState('')
  const[copiedOrderLink,setCopiedOrderLink]=useState(false)
  const[showQRFullscreen,setShowQRFullscreen]=useState(false)
  const[qrFullscreenDataUrl,setQrFullscreenDataUrl]=useState<string|null>(null)
  const prevPendingCount=useRef(0)
  // 'all'-mode new-order detection: order_keys seen last tick (per event) → a key that appears anew is a
  // new order (covers AUTO-ACCEPTED orders that land 'confirmed' and never raise the pending count).
  const prevOrderKeysRef=useRef<Set<string>>(new Set())
  // Amber-DUE de-dupe: last-seen urgency per order_key, so the due sound fires ONCE on ok→warn, not every
  // 15s tick. Persisted in the page (survives card remounts), so a card unmount/remount can't re-ding.
  const prevUrgencyRef=useRef<Map<string,string>>(new Map())
  // Event the ping baseline (prevPendingCount) belongs to — prevents an event
  // SWITCH from being mistaken for new orders and firing a spurious ping.
  const soundEventRef=useRef<string|null>(null)
  // Selected event {id,date} for scoping /api/dashboard. Held in a ref so the
  // realtime/interval refetches (which call fetchAllRef with no args) stay scoped.
  const selectedEventRef=useRef<{id:string,date:string}|null>(null)
  const fetchAllRef=useRef<()=>void>(()=>{})     // LIVE refetch (poll / orders-realtime / vans-realtime) — never re-seeds config
  const reseedRef=useRef<()=>void>(()=>{})       // CONFIG reseed (event-switch / trucks-realtime / reconnect) — forceSeed
  // CONFIG is seeded on nav/auth/trucks-change ONLY, never by the order poll. Flag flips true after the first
  // successful seed so subsequent LIVE refetches leave operator-edited settings untouched (the flip-back class).
  const configSeededRef=useRef(false)
  // Tracks auth across fetchAll closures (authenticated state is stale inside the callback).
  // Once true, transient fetch failures keep existing state instead of showing the error screen.
  const authenticatedRef=useRef(false)
  // Transient 429 on the very FIRST load (before auth): a momentary rate-limit burst must not render the
  // hard "Access denied" lockout. Count retries so we back off + recover instead of erroring out.
  const rl429RetriesRef=useRef(0)
  // Last successfully resolved event — survives transient empty upcomingEvents (e.g. failed refetch)
  const lastActiveEventRef=useRef<TruckEvent|null>(null)
  // SINGLE status-INDEPENDENT event resolution (cross-event fix): the explicitly-selected
  // event by id, else a time-based default (current-by-time, else earliest upcoming) from
  // pickDefaultEventByTime. NEVER keys on status ('open'/'live') or a UTC "today" lookup, so
  // a stale-live (auto-close-failed) or different-date event can't hijack the slots/ASAP/
  // orders of the viewed event. resolvedEvent + stockEvent both read this one value.
  const selectedOrDefaultEvent:TruckEvent|null=selectedEventId
    ?(upcomingEvents.find(e=>e.id===selectedEventId)??null)
    :pickDefaultEventByTime(upcomingEvents)
  // SINGLE live signal — same rule as the "● Live" indicator (activeEvent.status==='open'), the
  // customer page, TruckListCard, and the heartbeat-monitor: live = the resolved active event is
  // status==='open'. Derived from selectedOrDefaultEvent (the canonical resolution; activeEvent
  // below is just this + a transient-blank UI guard) so the heartbeat hook above the early-returns
  // can read it. Gates the heartbeat: ping ONLY while live (offline protection only matters then).
  const activeEventLive=selectedOrDefaultEvent?.status==='open'
  // LOCAL-RECONNECT OVERRIDE (operator DISPLAY only): this device knows it's back — navigator.onLine
  // (deviceOnline) AND heartbeating for a live event (activeEventLive ⇒ the heartbeat is running). So
  // it stops showing the OFFLINE pause IMMEDIATELY, without waiting ~15-30s for the DB online_paused_until
  // to clear (the reconnect-heartbeat below clears it in the background within ~1-2s). Applies to the
  // OFFLINE pause ONLY — a MANUAL pause (operator tapped Pause orders) is never suppressed, being online
  // doesn't un-pause it. The CUSTOMER page is untouched: it stays DB-driven (authoritative server state).
  const offlinePausedDisplay=offlinePaused&&!(deviceOnline&&activeEventLive)
  const paused=manualPaused||offlinePausedDisplay
  const pauseReason:'manual'|'offline'|null=manualPaused?'manual':offlinePausedDisplay?'offline':null
  // ASAP date = the SELECTED/active event's own date (not "the live event"), so a future
  // event's ASAP is its first real slot, never now-floored against a different event's date.
  const asapSlot=getAsapSlot(slots,selectedOrDefaultEvent?.event_date)
  const availableDeals = truckMenu?.bundles ?? []
  // Auto-decay: effective remaining extra wait based on elapsed time since it was set
  const waitMinutes=useMemo(()=>{
    void waitTick // re-evaluate every 30s
    if(!extraWaitMins||!extraWaitStartedAt) return 0
    const elapsed=(Date.now()-new Date(extraWaitStartedAt).getTime())/60000
    return Math.max(0,Math.ceil(extraWaitMins-elapsed))
  },[extraWaitMins,extraWaitStartedAt,waitTick])


  const saveProfile=async()=>{
    if(!editProfileName.trim())return
    setSavingProfile(true)
    try{
      const res=await fetch('/api/auth/update-profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:editProfileName})})
      const data=await res.json()
      if(!res.ok)throw new Error(data.error)
      setCurrentUserName(data.name)
      setShowProfileModal(false)
    }catch{}finally{setSavingProfile(false)}
  }

  const fetchMenu=useCallback((truckId:string,currentPin:string)=>{
    // Scope deals/pause/ordering to the SELECTED event (cross-event fix) so the panel shows
    // THIS event's deals + pause, never the server's "live event" auto-detect. dashboard=1
    // bypasses the customer status-gate so the operator can load any event's menu.
    const evId=selectedEventRef.current?.id
    const evParam=evId?`&event_id=${evId}`:''
    fetch(`/api/menu/${truckId}?dashboard=1${evParam}&nocache=${Date.now()}`)
      .then(r=>r.ok?r.json():null)
      .then(d=>{
        if(d?.truck?.logo) setTruck(prev=>prev?{...prev,logo:d.truck.logo}:prev)
        if(d?.menu){
          setTruckMenu(d.menu)
          // Seed categoryConfigs from the DB values (user edits take precedence via spread order)
          const fromDb:Record<string,{secs:number;batch:number}>={}
          const notesFromDb:Record<string,boolean>={}
          ;(d.menu.categories||[]).forEach((c:any)=>{
            fromDb[c.name.toLowerCase()]={secs:c.prep_secs??0,batch:c.batch_size??1}
            notesFromDb[c.name.toLowerCase()]=c.allowNotes??false
          })
          setCategoryConfigs(fromDb)
          setCategoryAllowNotes(notesFromDb)
          const cats = d.menu.categories || []
          const allAtDefault = cats.length > 0 && cats.every((c:any) => c.prep_secs === 300 && c.batch_size === 1)
          setShowPrepTimeBanner(allAtDefault)
        }
      }).catch(()=>null)
  },[])

  const fetchStock=useCallback((currentPin:string,eventId?:string|null)=>{
    // Write into THIS event's slice (keyed by the id the call was made with), never a flat replace —
    // so a stale response from a previously-selected event can't pollute the current slice.
    const key=eventId??'__none__'
    fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({token,pin:currentPin,action:'get_stock',eventId:eventId??null})})
      .then(r=>r.json()).then(d=>{
        setItemStocksByEvent(prev=>({...prev,[key]:d.stocks??[]}))
        // Apply any in-flight category-available override on top of server state (guard against the
        // write-round-trip clobber); drop a guard once the server row has caught up to the desired value.
        const incoming=(d.categoryStocks??[]) as CategoryStock[]
        const pend=pendingWritesRef.current
        const kf=(cat:string)=>`catavail:${key}:${cat.toLowerCase()}`
        const seen=new Set<string>()
        const merged=incoming.map(cs=>{
          const pk=kf(cs.category); seen.add(pk); const g=pend[pk]
          return (g && (cs.available??true)!==g.v) ? {...cs,available:g.v as boolean} : cs
        })
        // Drop a guard once the server row has caught up to the desired value.
        for(const cs of incoming){const pk=kf(cs.category); const g=pend[pk]; if(g && (cs.available??true)===g.v) delete pend[pk]}
        // Re-add any pending category the (pre-write) refetch OMITTED entirely (no total/default/orders yet),
        // so a mid-write clobber can't drop the optimistic toggle. Reconciles once the row lands in `incoming`.
        for(const pk of Object.keys(pend)){ if(pk.startsWith(`catavail:${key}:`)&&!seen.has(pk)){ const g=pend[pk]; merged.push({category:g.meta as string,stock_count:null,default_stock:null,orders_count:0,available:g.v as boolean}) } }
        setCategoryStocksByEvent(prev=>({...prev,[key]:merged}))
        setFetchedStockKeys(prev=>prev.has(key)?prev:new Set(prev).add(key))
      }).catch(()=>null)
  },[token])

  const fetchAll=useCallback(async(currentPin=pin,forceSeed=false)=>{
    try {
      const p=new URLSearchParams({token}); if(currentPin) p.set('pin',currentPin)
      // Scope the read to the selected event (V6.4). Pass its date too so the
      // route resolves the right event even when it isn't today's first event.
      const sel=selectedEventRef.current
      if(sel){p.set('event_id',sel.id);p.set('date',sel.date)}
      const res=await fetch(`/api/dashboard?${p}`,{headers:await nativeAuthHeader()}); const data=await res.json()
      if(res.status===401){if(data.requiresPin){setRequiresPin(true);setLoading(false);return};setError('Invalid access link');setLoading(false);return}
      // Initial-load 429 = transient rate-limit burst → back off + retry, NEVER the hard "Access denied"
      // lockout (operators are now exempt in proxy.ts; this is belt-and-braces for any first-paint edge on
      // a shared IP). Up to 5 tries (1s,2s,4s,8s,8s). Keeps the loading spinner; self-heals on recovery.
      if(res.status===429&&!authenticatedRef.current&&rl429RetriesRef.current<5){
        const backoff=Math.min(1000*2**rl429RetriesRef.current,8000); rl429RetriesRef.current++
        setLoading(true); setTimeout(()=>fetchAllRef.current(),backoff); return
      }
      // Transient failure after successful auth — keep existing state, never blank the dashboard
      if(!res.ok){if(authenticatedRef.current){console.warn('[fetchAll] dashboard fetch failed:',res.status,'— keeping existing state')}else{setError(data.error||'Failed to load')};setLoading(false);return}
      // ── CONFIG vs LIVE SPLIT (the flip-back CLASS fix) ──────────────────────────────────────────────
      // seedConfig runs on NAV/AUTH (first load, event-switch, trucks-change, reconnect) — NEVER on the 60s
      // poll or a realtime ORDER event. Config = operator-edited settings; re-seeding them from the order
      // poll clobbers an in-flight optimistic edit (3× bug: offline-protection, category-available,
      // sound_config). Trucks-realtime (fires AFTER the operator's own commit) + event-switch cover genuine
      // config changes. The LIVE block below runs on EVERY fetch.
      const seedConfig = forceSeed || !configSeededRef.current
      // EVENT-SWITCH GATE: this event's data just loaded (network or SW cache) → mark it switchable offline.
      {const loadedId=selectedEventRef.current?.id; if(loadedId)setLoadedEventIds(p=>p.has(loadedId)?p:new Set(p).add(loadedId))}
      if(seedConfig){
        // ── CONFIG — operator-edited; seeded on nav only. ⚠️ Everything here is CONFIG by default; adding a
        //    LIVE field to this block would STOP it polling. Live state goes in the block below. ──
        setTruck(data.truck)
        // WEB: "Screen on" follows the truck setting. APP: it follows the per-device pref (mount init) — so
        // don't let the truck setting override it here.
        if(!isNativeApp()) setKeepScreenOn(data.truck?.keep_screen_on ?? true)
        setAutoAccept(data.truck?.auto_accept || false)
        setNotesRequireReview(data.truck?.notes_require_review ?? true)
        setShowCookingStep(data.vanShowCookingStep??false)
        // Capacity card + order-ready: van/event-scoped config. applyPending guards them so a reseed that
        // fires DURING the operator's own optimistic edit (before the write commits) can't clobber it.
        if(data.kitchenCapacity !== undefined) setKitchenCapacity(applyPending('kitchenCapacity',data.kitchenCapacity))
        if(data.capacityWindowMins !== undefined) setCapacityWindowMins(applyPending('capacityWindowMins',data.capacityWindowMins ?? 5))
        if(data.catConfigs !== undefined) setServerCatConfigs(data.catConfigs || {})                        // server catConfigs (has countsToCapacity)
        if(data.vanAutoPause !== undefined) setVanAutoPause(data.vanAutoPause)
        if(data.vanOrderReadyDefault !== undefined) setVanOrderReadyDefault(data.vanOrderReadyDefault)
        setEffectiveOrderReady(applyPending('effectiveOrderReady',data.effectiveOrderReady??false))
        configSeededRef.current=true
      }
      // ── LIVE — merged on EVERY fetch (poll/realtime/nav). Changes WITHOUT the operator (new orders,
      //    server offline-auto-pause, other devices) → must keep polling. ⚠️ THIS is the explicit LIVE
      //    ALLOWLIST; adding a field puts it back in the clobber path. Dual-source live+optimistic fields
      //    (manual pause, extra-wait) go through applyPending so a mid-write poll can't clobber them. ──
      setOrders(prev=>mergeOrders(prev,data.orders||[]))
      setSlots(data.slots)
      setPausedUntil(applyPending('pausedUntil',data.truck?.paused_until||null))              // manual truck pause (dual-source)
      setVanPausedUntil(applyPending('vanPausedUntil',data.vanPausedUntil??null))              // manual van pause (dual-source)
      setVanOnlinePausedUntil(data.vanOnlinePausedUntil??null)                                 // SERVER offline auto-pause (server-only → no guard)
      setLastOfflinePauseAt(data.lastOfflinePauseAt??null)
      setOfflinePauseEventId(data.offlinePauseEventId??null)
      setExtraWaitMins(applyPending('extraWaitMins',data.truck?.extra_wait_mins||0))           // operator extra-wait (dual-source)
      setExtraWaitStartedAt(applyPending('extraWaitStartedAt',data.truck?.extra_wait_started_at||null))
      if(data.productionSlotUnits !== undefined) setProductionSlotUnits(data.productionSlotUnits || {})   // frozen occupancy for the offline re-run
      if(data.capacityBreaches !== undefined) setCapacityBreaches(data.capacityBreaches || [])            // Piece 2 — over-capacity slots (reconnect flag)
      if(data.currentUserName !== undefined) setCurrentUserName(data.currentUserName)
      if(data.userRole !== undefined) setUserRole(data.userRole)
      if(data.activeVanName !== undefined) setActiveVanName(data.activeVanName)
      // Clear prep pills for orders no longer active (collected/cancelled)
      const activeOrderKeys=new Set((data.orders||[]).filter((o:Order)=>['pending','confirmed','modified'].includes(o.status)).map((o:Order)=>o.order_key))
      setStruckPrep(prev=>{const n=new Set<string>();prev.forEach(k=>{const orderKey=k.split(':')[0];if(activeOrderKeys.has(orderKey))n.add(k)});return n})
      setAuthenticated(true); authenticatedRef.current=true; rl429RetriesRef.current=0; setLastRefresh(new Date())
      if(data.truck?.id){fetchMenu(data.truck.id,currentPin);fetchStock(currentPin,selectedEventRef.current?.id??null)}
      try{
        const eventsRes=await fetch(`/api/events/manage?token=${token}&upcoming=true`)
        // Never replace good event state with data from a failed response (429/500
        // returns valid JSON without .events, which would silently wipe events)
        if(!eventsRes.ok){
          console.warn('[fetchAll] events fetch failed:',eventsRes.status,'— keeping existing events')
        }else{
          const eventsData=await eventsRes.json()
          const todayStr=localTodayIso() // LOCAL date (s.7) — UTC toISOString rolls at UTC midnight
          const fetched=(eventsData.events??[]).filter((e:TruckEvent)=>e.event_date===todayStr)
          setTodayEvents(fetched)
          setUpcomingEvents(eventsData.events??[])
          const currentTime=new Date().toTimeString().slice(0,5)
          const stale=fetched.filter((e:TruckEvent)=>e.status==='confirmed'&&e.auto_open===true&&e.start_time<=currentTime)
          for(const ev of stale){
            await fetch('/api/events/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,action:'open',eventId:ev.id,payload:{}})})
          }
          if(stale.length>0) setTodayEvents(prev=>prev.map(e=>stale.some((s:TruckEvent)=>s.id===e.id)?{...e,status:'open' as const,opened_at:new Date().toISOString()}:e))
        }
      }catch{}
    } catch{if(!authenticatedRef.current)setError('Connection error')} finally{setLoading(false)}
  },[token,pin,fetchMenu,fetchStock,applyPending])

  // Ready-email-undo machinery (shared hook). onUndoRestore = the dashboard-specific revert: un-strike the
  // prep pills the Ready click struck (KDS, the later consumer, passes none). Placed after fetchAll so it
  // can pass it as `refetch`.
  const{scheduleReadyEmail,undoReady}=useReadyEmailUndo({token,pin,showToast,refetch:fetchAll,onUndoRestore:(orderKey)=>{
    const ord=orders.find(o=>o.order_key===orderKey)
    if(ord)setStruckPrep(prev=>{const n=new Set(prev);ord.items.forEach(item=>{for(let u=0;u<item.quantity;u++)n.delete(`${orderKey}:${item.name}:${u}`)});return n})
  }})

  useEffect(()=>{fetchAll()},[fetchAll])

  // SINGLE offline source: subscribe to the reachability module (same signal as OfflineBanner/heartbeat).
  // Fires immediately with the current state; startReachability is idempotent (OfflineBanner may already
  // have started it). Drives isOffline for the settings-lock + the header chip.
  // NATIVE-ONLY: the offline UX (chip, settings-lock, event-switch gate, stock "saved on this device — will
  // sync" banner) is only TRUTHFUL on the native app, where the durable outbox exists. On web there's no
  // queue → "will sync" would be a false promise (a web offline change is NOT queued → lost), so DON'T
  // activate any of it. Native-gating the SOURCE keeps isOffline false on web (offline behaves as today);
  // every isOffline consumer inherits the gate from this single point.
  useEffect(()=>{if(!isNativeApp())return;startReachability();return onReachabilityChange(online=>setIsOffline(!online))},[])

  // COLD-LAUNCH cleanup: purge the SW read-cache for ENDED events (past date). Cache-only, online-only,
  // never the outbox. Runs once on mount; a failure is a silent no-op (helper is fully guarded).
  useEffect(()=>{void pruneStaleEventCache()},[])

  // LOCAL offline/paused notification (iPad-only, reachability-driven, debounced, Settings-gated). Message
  // depends on whether auto-pause is on (effectiveOfflineProtection = event override ?? van default).
  useOfflineAlert(eventOfflineOverride!==null?eventOfflineOverride:vanAutoPause)

  useEffect(()=>{
    if(selectedEventId||!upcomingEvents.length) return
    console.log('[auto-select] running, upcomingEvents:', upcomingEvents.length)
    const now=new Date()
    const todayStr=localTodayIso() // LOCAL date (s.7) — UTC midnight must not misclassify "today"
    // Priority 1: currently open event (started, not ended)
    const openEvent=upcomingEvents.find(e=>{
      if(e.event_date!==todayStr||!e.start_time||!e.end_time) return false
      return now>=new Date(`${e.event_date}T${e.start_time}`)&&now<=new Date(`${e.event_date}T${e.end_time}`)
    })
    if(openEvent){console.log('[auto-select] priority 1 open:',openEvent.id);setSelectedEventId(openEvent.id);return}
    // Priority 2: upcoming event today (not started yet)
    const upcomingToday=upcomingEvents.find(e=>{
      if(e.event_date!==todayStr||!e.start_time) return false
      return now<new Date(`${e.event_date}T${e.start_time}`)
    })
    if(upcomingToday){console.log('[auto-select] priority 2 today:',upcomingToday.id);setSelectedEventId(upcomingToday.id);return}
    // Priority 3: next upcoming event (any date)
    const nextEvent=[...upcomingEvents]
      .filter(e=>e.start_time&&new Date(`${e.event_date}T${e.start_time}`)>now)
      .sort((a,b)=>new Date(`${a.event_date}T${a.start_time}`).getTime()-new Date(`${b.event_date}T${b.start_time}`).getTime())[0]
    if(nextEvent){console.log('[auto-select] priority 3 next:',nextEvent.id,nextEvent.event_date);setSelectedEventId(nextEvent.id)}
  },[upcomingEvents,selectedEventId])
  useEffect(()=>{
    // Event-scoped offline-override read (anon SELECT is permitted; only the WRITE was RLS-blocked —
    // that now goes through the service-role action). Keyed on selectedEventId ONLY (was also
    // [upcomingEvents]) so a routine events poll no longer re-reads and CLOBBERS a just-set optimistic
    // toggle value mid-change. Query by id directly (not via upcomingEvents.find) so it doesn't need
    // that list. cancelled guard drops a stale in-flight read after a fast event switch.
    if(!selectedEventId){setEventOfflineOverride(null);setEventOrderReadyOverride(null);return}
    let cancelled=false
    supabaseBrowser.from('truck_events').select('offline_protection_override, order_ready_override').eq('id',selectedEventId).single()
      .then(({data})=>{if(!cancelled){setEventOfflineOverride(data?.offline_protection_override??null);setEventOrderReadyOverride((data as any)?.order_ready_override??null)}})
    return()=>{cancelled=true}
  },[selectedEventId])
  useEffect(()=>{fetchAllRef.current=()=>fetchAll();reseedRef.current=()=>fetchAll(pin,true)},[fetchAll,pin])
  // SINGLE source for the event the Menu & Stock counts AND the order-scoping ref
  // resolve to: the explicitly-selected event, else today's open/confirmed/first.
  // EVERY stock/order fetcher reads this one value — the ref for non-reactive callers
  // (fetchAll, submitPin, realtime, poll), stockEventId for the reactive effect — so
  // they can't drift apart and blank the counts (Fix A-finish).
  const stockEvent:TruckEvent|null=selectedOrDefaultEvent
  const stockEventId=stockEvent?.id??null
  // Current event's stock slice, derived from the per-event maps. Same names as before so every
  // downstream read (itemStocks.find / categoryStocks.find) + the draft inputs are unchanged.
  const stockKey=stockEventId??'__none__'
  const itemStocks=itemStocksByEvent[stockKey]??[]
  const categoryStocks=categoryStocksByEvent[stockKey]??[]
  const stockLoading=!fetchedStockKeys.has(stockKey) // unseen key → skeleton (not empty rows)
  // Keep the scoping ref current (cheap — no fetch, runs on every event-list poll).
  useEffect(()=>{
    selectedEventRef.current=stockEvent?{id:stockEvent.id,date:stockEvent.event_date}:null
  },[stockEvent])
  // Refetch when the SELECTED event changes — RESEED (event-switch = navigation; van-scoped config like
  // kitchen capacity / catConfigs / order-ready can differ per event's van, so config must re-resolve).
  useEffect(()=>{
    if(authenticatedRef.current) reseedRef.current()
  },[selectedEventId])
  useEffect(()=>{
    // Native app sends its Bearer so /api/auth/me resolves is_admin (+ identity) without a cookie → the
    // Admin link appears in-app. Web: nativeAuthHeader() returns {} → cookie path unchanged.
    nativeAuthHeader().then(h=>fetch('/api/auth/me',{headers:h})).then(r=>r.json()).then(d=>{if(d.email)setCurrentUserEmail(d.email);if(d.first_name)setCurrentUserFirstName(d.first_name);if(d.is_admin)setIsAdmin(true)}).catch(()=>null)
  },[])
  useEffect(()=>{
    if(!truck?.id)return
    const ordersChannel=supabaseBrowser
      .channel(`orders:${truck.id}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'orders',filter:`truck_id=eq.${truck.id}`},
        ()=>fetchAllRef.current())
      .subscribe()
    const truckChannel=supabaseBrowser
      .channel(`truck:${truck.id}`)
      // trucks UPDATE = a CONFIG change (this operator's own committed write, or another device) → RESEED
      // config. Fires AFTER the DB commit, so it reads the new value (matches an optimistic edit → no
      // clobber) and is the channel by which cross-device settings changes propagate.
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'trucks',filter:`id=eq.${truck.id}`},
        ()=>reseedRef.current())
      .subscribe()
    // Van pause lives on truck_vans (paused_until / online_paused_until), set by this
    // dashboard, other screens, AND the heartbeat-monitor — subscribe so a pause/unpause
    // (incl. offline auto-pause) propagates live without a manual refresh.
    const vansChannel=supabaseBrowser
      .channel(`vans:${truck.id}`)
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'truck_vans',filter:`truck_id=eq.${truck.id}`},
        ()=>fetchAllRef.current())
      .subscribe()
    const fallbackInterval=setInterval(()=>fetchAllRef.current(),60000)
    return()=>{
      supabaseBrowser.removeChannel(ordersChannel)
      supabaseBrowser.removeChannel(truckChannel)
      supabaseBrowser.removeChannel(vansChannel)
      clearInterval(fallbackInterval)
    }
  },[truck?.id])
  // Reconcile the optimistic device-queued list: once an offline-created order's synced twin lands in
  // `orders` (matched on order_key), prune it from deviceQueuedOrders. Keeps state tidy (the render-time
  // dedup handles the same-tick display). Returns the same ref when nothing changed → no re-render loop.
  useEffect(()=>{
    const keys=new Set(orders.map(o=>o.order_key))
    setDeviceQueuedOrders(prev=>{const next=prev.filter(o=>!keys.has(o.order_key));return next.length===prev.length?prev:next})
  },[orders])
  useEffect(()=>{
    const truckId=truck?.id
    if(!truckId)return
    console.log('[VansFetch] truckId:',truckId)
    fetch('/api/manage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,action:'get_vans'})})
      .then(r=>r.json()).then(d=>{
        console.log('[VansFetch] result:',d.vans)
        setVans(d.vans||[])
      }).catch(err=>console.error('[VansFetch] error:',err))
  },[truck?.id])
  useEffect(()=>{const id=setInterval(()=>setWaitTick(t=>t+1),30000);return()=>clearInterval(id)},[]);
  // Fire the popup when the durable marker is NEWER than this device's ack for that event. ALWAYS
  // shows (no per-device suppression pref — an operator must never miss that their orders were paused
  // while away); the per-event ack (hg_offline_pause_ack_*) still prevents re-firing for the same event.
  useEffect(()=>{
    if(typeof window==='undefined') return
    if(!offlinePauseEventId||!lastOfflinePauseAt) return
    const ack=localStorage.getItem(`hg_offline_pause_ack_${offlinePauseEventId}`)
    if(!ack||new Date(lastOfflinePauseAt).getTime()>new Date(ack).getTime()) setShowOfflinePausedNotice(true)
  },[lastOfflinePauseAt,offlinePauseEventId])
  useEffect(()=>{
    // Track the device's connectivity reactively so the UI re-renders on reconnect (offline-pause
    // suppression) and the heartbeat effect re-fires immediately (its dep below).
    // Package 6: addNetworkListener uses the native Capacitor Network plugin INSIDE the iOS shell (more
    // reliable transitions than navigator.onLine) and falls back to the SAME window online/offline events
    // on web — so this is a strict upgrade that is a no-op behaviour change for browser users. Mirrors the
    // KDS wiring (kds/page.tsx:196-197).
    if(typeof window==='undefined')return
    return addNetworkListener(s=>setDeviceOnline(s==='online'))
  },[])
  // APP keep-awake init (Package 4): the "Screen on" control follows the PER-DEVICE pref (default ON /
  // manual off), not the truck setting. No-op on web (the truck setting drives it there, via fetchAll).
  useEffect(()=>{ if(isNativeApp()){const p=localStorage.getItem('hg_keepawake');setKeepScreenOn(p!=='off')} },[])
  // Package 6: on native app FOREGROUND, ping the heartbeat immediately (don't wait for the 15s tick) so a
  // returning device clears any offline-pause fast. No-op on web. Only meaningful while a live event is
  // heartbeating; the /api/heartbeat call is idempotent so an off-event ping is harmless.
  useEffect(()=>{
    return onAppResume(()=>{
      if(typeof navigator!=='undefined'&&!navigator.onLine)return
      fetch('/api/heartbeat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,vanId:vanId||undefined})}).catch(()=>{})
    })
  },[token,vanId])
  useEffect(()=>{
    // Heartbeat ONLY while the active event is LIVE (status==='open'). Offline protection only
    // matters for a live event — a confirmed/pre-order event is unaffected by the truck being
    // offline, and the monitor only pauses status='open' events, so a non-live van going stale is
    // harmless. Keyed on activeEventLive so the effect re-runs on the flip: STARTING an event
    // (confirmed→open) fires an IMMEDIATE ping (no 15s wait) then the interval; FINISHING it
    // (open→closed) runs cleanup → interval cleared, no re-arm. No stale closure — the gate is the
    // dep, so the interval only ever exists during a live window.
    if(!activeEventLive)return
    const sendHeartbeat=async()=>{
      if(typeof navigator!=='undefined'&&!navigator.onLine)return
      console.log('[Heartbeat] sending token:',token,'vanId:',vanId||'(none)')
      try{
        const res=await fetch('/api/heartbeat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,vanId:vanId||undefined})})
        const data=await res.json()
        console.log('[Heartbeat] response:',data)
      }catch(err){console.error('[Heartbeat] failed:',err)}
    }
    sendHeartbeat() // immediate ping on the confirmed→open flip OR an offline→online reconnect (deviceOnline dep)
    const id=setInterval(sendHeartbeat,15000)
    return()=>clearInterval(id)
  },[token,vanId,activeEventLive,deviceOnline])
  // Sound pref: install the audio-unlock (prime the shared AudioContext on first user gesture) +
  // restore the per-device localStorage pref on mount; persist on change. Per-token so two trucks on
  // one device don't collide. Default ON when no stored pref.
  useEffect(()=>{installAudioUnlock();if(typeof window!=='undefined'){const s=localStorage.getItem(`hg_sound_${token}`);if(s!==null)setSoundEnabled(s==='on')}},[token])
  useEffect(()=>{if(typeof window!=='undefined')localStorage.setItem(`hg_sound_${token}`,soundEnabled?'on':'off')},[soundEnabled,token])
  useEffect(()=>{
    if(!authenticated)return
    // ROOT FIX: arm the lock to acquire on the operator's FIRST gesture (Safari denies a mount-effect
    // auto-request — no user activation). The toggle tap acquires directly (also a gesture).
    if(keepScreenOn){keepAwakeOnGesture()}else{allowSleep()}
    return()=>{allowSleep()}
  },[authenticated,keepScreenOn])
  useEffect(()=>{
    // NEW-ORDER sound. Fires iff master (soundEnabled, per-device) && per-truck config.new_orders:
    //   'needs_confirming' → pending count rose (today's behaviour; misses auto-accepted orders)
    //   'all'              → a NEW order_key appeared (any status) → also dings auto-accepted 'confirmed'
    //                        orders — closes the gap where an auto-accept truck was silent on the dashboard
    //   'off'              → never
    // orders is event-scoped server-side. Fire only within the SAME event — an event SWITCH bringing in a
    // different set must not ping (soundEventRef guards it; on switch we just reset the baselines).
    const mode=(truck?.sound_config??DEFAULT_SOUND_CONFIG).new_orders
    const count=orders.filter(o=>o.status==='pending').length
    const ordersEventId=orders.find(o=>o.event_id)?.event_id??selectedEventId??null
    const sameEvent=ordersEventId===soundEventRef.current
    if(soundEnabled&&authenticated&&sameEvent&&mode!=='off'){
      const fire = mode==='all'
        ? orders.some(o=>o.order_key&&!prevOrderKeysRef.current.has(o.order_key))
        : count>prevPendingCount.current
      if(fire) playNewOrder()   // shared primed AudioContext (unlocked on first gesture)
    }
    soundEventRef.current=ordersEventId
    prevPendingCount.current=count
    prevOrderKeysRef.current=new Set(orders.map(o=>o.order_key))
  },[orders,authenticated,selectedEventId,soundEnabled,truck?.sound_config])

  useEffect(()=>{setQrFullscreenDataUrl(null)},[truck?.logo,truck?.qr_code_style])

  // Open the Kitchen Display. NATIVE: soft-route to the in-app KDS (/dashboard/[token]/kds — dashboard_token
  // based, authenticates natively; van preserved via query) so it stays in the webview — window.open('_blank')
  // escapes to Safari / no-ops in WKWebView. WEB: unchanged — new tab (van's standalone /kds/[kds_token], or
  // the in-app KDS when the van has no kds_token).
  const openKDS=(van?:{id?:string;name?:string;kds_token?:string|null})=>{
    if(isNativeApp()){
      const q=van?.id?`?van_id=${encodeURIComponent(van.id)}${van.name?`&van_name=${encodeURIComponent(van.name)}`:''}`:''
      router.push(`/dashboard/${token}/kds${q}`)
      return
    }
    window.open(van?.kds_token?`/kds/${van.kds_token}`:`/dashboard/${token}/kds`,'_blank')
  }

  const handleOpenKDS=()=>{
    if(vans.length===1){openKDS(vans[0]);return}
    if(vans.length===0){openKDS();return}
    setShowKDSPicker(true)
  }

  const handleCopyOrderLink=async()=>{
    const orderUrl=truck?.slug?`${process.env.NEXT_PUBLIC_HATCHGRAB_URL}/trucks/${truck.slug}/order`:null
    if(!orderUrl){showToast('Order URL not available — slug not set','error');return}
    try{
      await navigator.clipboard.writeText(orderUrl)
      setCopiedOrderLink(true)
      setTimeout(()=>setCopiedOrderLink(false),2000)
    }catch{/* clipboard permission denied — fail silently */}
  }

  const handleShowQR=async()=>{
    const orderUrl=truck?.slug?`${process.env.NEXT_PUBLIC_HATCHGRAB_URL}/trucks/${truck.slug}/order`:null
    if(!orderUrl){showToast('Order URL not available — slug not set','error');return}
    setShowQRFullscreen(true)
    if(qrFullscreenDataUrl) return
    if(!truck) return
    try{
      const{generateQRWithLogo}=await import('@/lib/generateQRCode')
      const showBrandedQr=hasFeature(truck.plan,'branded_qr_code')&&truck.qr_code_style==='branded'
      setQrFullscreenDataUrl(await generateQRWithLogo(orderUrl,showBrandedQr?truck.logo:null))
    }catch(err){
      console.error('[QR] Generation failed:',err)
      setShowQRFullscreen(false)
    }
  }

  const submitPin=async()=>{
    const p=new URLSearchParams({token,pin:pinInput})
    const sel=selectedEventRef.current; if(sel){p.set('event_id',sel.id);p.set('date',sel.date)}
    const res=await fetch(`/api/dashboard?${p}`,{headers:await nativeAuthHeader()}); const data=await res.json()
    if(!res.ok){setPinError('Incorrect PIN');return}
    setPin(pinInput); setTruck(data.truck); setOrders(prev=>mergeOrders(prev,data.orders||[])); setSlots(data.slots); setShowCookingStep(data.vanShowCookingStep??false); setEffectiveOrderReady(data.effectiveOrderReady??false)
    {const loadedId=selectedEventRef.current?.id; if(loadedId)setLoadedEventIds(p=>p.has(loadedId)?p:new Set(p).add(loadedId))} // EVENT-SWITCH GATE: mark loaded
    setAuthenticated(true); authenticatedRef.current=true; setRequiresPin(false)
    if(data.truck?.id){fetchMenu(data.truck.id,pinInput);fetchStock(pinInput,selectedEventRef.current?.id??null)}
  }

  const saveAutoAccept=async(val:boolean)=>{
    setSavingAutoAccept(true)
    try{
      await fetch('/api/dashboard/action',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({token,pin,action:'set_auto_accept',value:val})
      })
      setAutoAccept(val)
      showToast(val?'Auto-accept enabled':'Auto-accept disabled')
    }catch{showToast('Failed to save','error')}
    finally{setSavingAutoAccept(false)}
  }

  const saveNotesRequireReview=async(val:boolean)=>{
    setSavingNotesReview(true)
    try{
      await fetch('/api/dashboard/action',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({token,pin,action:'set_notes_require_review',value:val})
      })
      setNotesRequireReview(val)
      showToast(val?'Noted orders will need review':'Noted orders auto-accept')
    }catch{showToast('Failed to save','error')}
    finally{setSavingNotesReview(false)}
  }

  // Per-truck SOUND POLICY. Writes the SAME trucks.sound_config as Manage → Settings (one column, one
  // source of truth → the two surfaces mirror automatically). §23 optimistic: patch truck.sound_config
  // (the trigger effects read it → react immediately), no reload; revert on failure.
  const saveSoundConfig=async(next:SoundConfig)=>{
    const prev=truck?.sound_config??DEFAULT_SOUND_CONFIG
    setTruck(t=>t?{...t,sound_config:next}:t)
    try{
      const res=await fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({token,pin,action:'set_sound_config',value:next})})
      if(!res.ok)throw new Error()
    }catch{setTruck(t=>t?{...t,sound_config:prev}:t);showToast('Failed to save','error')}
  }

  const toggleOfflineProtection=async(value:boolean)=>{
    if(!activeEvent)return
    if(value===true){
      const confirmed=window.confirm(OFFLINE_PROTECTION_ENABLE_CONFIRM)
      if(!confirmed)return
      if(!keepScreenOn)applyKeepScreenOn(true)
    }else{
      const confirmed=window.confirm(OFFLINE_PROTECTION_DISABLE_CONFIRM)
      if(!confirmed)return
    }
    // SERVICE-ROLE write (was a direct supabaseBrowser anon update → RLS silently no-op'd it, so the
    // toggle never persisted). Optimistic, then revert on failure — same safe pattern as set_auto_accept.
    const prev=eventOfflineOverride
    setEventOfflineOverride(value)
    try{
      const res=await fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'set_offline_protection',value,eventId:activeEvent.id})})
      if(!res.ok)throw new Error('write failed')
      // Disabling clears the offline pause server-side too → reflect it locally so the dashboard
      // un-pauses immediately (the customer catches up on its DB cycle).
      if(value===false)setVanOnlinePausedUntil(null)
    }catch{
      setEventOfflineOverride(prev) // revert optimistic on failure
    }
  }

  // Per-event order-ready on/off (master-switch model: writes a concrete order_ready_override=true|false,
  // NEVER null). Optimistic on effectiveOrderReady (what the toggle + Ready button read), then refetch to
  // confirm the server-resolved value. Mirrors toggleOfflineProtection's per-event write.
  const setOrderReadyOverride=async(value:boolean)=>{
    if(!activeEvent)return
    const prevOverride=eventOrderReadyOverride
    const prevEffective=effectiveOrderReady
    markPending('effectiveOrderReady',value)   // guard: a reseed mid-write can't clobber the optimistic value
    setEventOrderReadyOverride(value)
    setEffectiveOrderReady(value)
    try{
      const res=await fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'set_order_ready_override',value,eventId:activeEvent.id})})
      if(!res.ok)throw new Error('write failed')
      reseedRef.current() // re-resolve effectiveOrderReady (override ?? default); reads committed → releases guard
    }catch{
      delete pendingWritesRef.current['effectiveOrderReady']
      setEventOrderReadyOverride(prevOverride); setEffectiveOrderReady(prevEffective) // revert optimistic on failure
    }
  }

  const saveKitchenCapacity=async(value:number|null)=>{
    if(!activeEvent?.van_id)return
    markPending('kitchenCapacity',value); setKitchenCapacity(value) // optimistic + guard
    // Service-role write via /api/manage (same action the Manage page uses). The previous
    // anon supabaseBrowser.update on truck_vans was RLS-blocked and failed silently.
    await fetch('/api/manage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,action:'update_van_settings',vanId:activeEvent.van_id,kitchen_capacity:value})})
    reseedRef.current() // re-sync from the authoritative server read (reads committed → releases guard)
  }

  const saveCapacityWindow=async(value:number)=>{
    if(!activeEvent?.van_id)return
    markPending('capacityWindowMins',value); setCapacityWindowMins(value) // optimistic + guard
    await fetch('/api/manage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,action:'update_van_settings',vanId:activeEvent.van_id,capacity_window_mins:value})})
    reseedRef.current() // re-sync from the authoritative server read (reads committed → releases guard)
  }

  const applyKeepScreenOn=async(value:boolean):Promise<WakeState>=>{
    setKeepScreenOn(value)
    let st:WakeState='off'
    if(value){st=await keepAwake()}else{await allowSleep()}
    // ONE visible "Screen on" control, DUAL persistence (user unaware): in the APP it drives the PER-DEVICE
    // keep-awake pref (localStorage 'hg_keepawake', default on / manual off) and does NOT touch the truck
    // setting — so the web setting-tied mechanism can't also fire/clobber it. On WEB it persists to the
    // truck keep_screen_on setting exactly as before. keepAwake()/allowSleep() above is the single applier.
    if(isNativeApp()){try{localStorage.setItem('hg_keepawake',value?'on':'off')}catch{}return st}
    try{
      await fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({token,pin,action:'update_keep_screen_on',keepScreenOn:value})})
    }catch{}
    return st
  }
  const toggleKeepScreenOn=async()=>{
    // The toggle acts on REALITY: green (held) → turn off; grey (not held) → turn on / retry (this click IS
    // the user gesture, so it acquires). On a failed turn-on, a plain-English toast says why + what to do.
    if(screenHeld){
      // Ensure vans are loaded before evaluating auto-pause
      let currentVans=vans
      if(currentVans.length===0&&truck?.id){
        const res=await fetch('/api/manage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,action:'get_vans'})})
        const d=await res.json()
        currentVans=d.vans||[]
        setVans(currentVans)
        console.log('[VansFetch] on-demand result:',currentVans)
      }
      let affectedVans:string[]=[]
      if(vanId){
        const thisVan=currentVans.find(v=>v.id===vanId)
        console.log('[screen-off] vanId',vanId,'thisVan',thisVan,'vans',currentVans)
        if(thisVan?.auto_pause_on_offline) affectedVans=[thisVan.name]
      } else {
        affectedVans=currentVans.filter(v=>v.auto_pause_on_offline).map(v=>v.name)
        console.log('[screen-off] no vanId, affectedVans',affectedVans,'vans',currentVans)
      }
      if(affectedVans.length>0){setVansWithAutoPause(affectedVans);setShowScreenOffWarning(true);return}
      await applyKeepScreenOn(false)   // turning OFF (it's held) — no auto-pause vans
    } else {
      // turning ON / retry — this click is the gesture that acquires. The KeepAwakePrompt banner reflects
      // the outcome (held → gone; still not held → the plain-English reason), so no toast is needed.
      await applyKeepScreenOn(true)
    }
  }
  const confirmScreenOff=async()=>{setShowScreenOffWarning(false);await applyKeepScreenOn(false)}

  const openCatEdit=(catId:string,catName:string)=>{
    const key=catName.toLowerCase()
    const cfg=categoryConfigs[key]??{secs:0,batch:1}
    setEditingCatId(catId)
    setEditCatForm({
      name:catName,
      prepMins:Math.floor(cfg.secs/60),
      prepSecs30:cfg.secs%60>=30?30:0,
      batch:cfg.batch,
      allowNotes:categoryAllowNotes[key]??false,
    })
  }

  const saveCatEdit=async()=>{
    if(!editingCatId||!editCatForm||!truck)return
    setSavingCat(true)
    try{
      const prepSecs=editCatForm.prepMins*60+editCatForm.prepSecs30
      await fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({token,pin,action:'update_category',categoryId:editingCatId,
          name:editCatForm.name,prep_secs:prepSecs,batch_size:editCatForm.batch,allow_notes:editCatForm.allowNotes})})
      setEditingCatId(null);setEditCatForm(null)
      fetchMenu(truck.id,pin)
      showToast('Category saved')
    }catch{showToast('Failed to save category','error')}
    finally{setSavingCat(false)}
  }

  const updateCategoryField=async(catId:string,field:'prep_secs'|'batch_size',value:number|null)=>{
    if(!truck)return
    const catData=truckMenu?.categories?.find(c=>c.id===catId)
    if(!catData)return
    const key=catData.name.toLowerCase()
    const allowNotes=categoryAllowNotes[key]??false
    const prepSecs=field==='prep_secs'?(value??0):(catData.prep_secs??0)
    const batchSize=field==='batch_size'?value:(catData.batch_size??null)
    try{
      await fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({token,pin,action:'update_category',categoryId:catId,
          name:catData.name,prep_secs:prepSecs,batch_size:batchSize,allow_notes:allowNotes})})
      setCategoryConfigs(prev=>({...prev,[key]:{secs:prepSecs,batch:batchSize??1}}))
    }catch{}
  }

  // Toggle a no-prep category's "counts toward kitchen capacity" flag from the dashboard's
  // Kitchen Capacity tickbox list. Optimistic truckMenu update + update_category (carries
  // counts_toward_capacity; omitting prep/batch leaves them untouched). Truck-wide flag.
  const toggleCatCapacityDash=async(catId:string,newVal:boolean)=>{
    if(!truck)return
    const catData=truckMenu?.categories?.find(c=>c.id===catId)
    if(!catData)return
    setTruckMenu(prev=>prev?{...prev,categories:prev.categories?.map(c=>c.id===catId?{...c,counts_toward_capacity:newVal}:c)}:prev)
    try{
      await fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({token,pin,action:'update_category',categoryId:catId,name:catData.name,counts_toward_capacity:newVal})})
    }catch{}
  }

  // orderKey is the UUID row identity. Display number comes from the looked-up order.
  const doAction=async(action:string,orderKey:string)=>{
    if(action==='cancel'){const ord=orders.find(o=>o.order_key===orderKey)??null;setCancellingOrder(ord);setShowCancelModal(true);return}
    if(action==='reject'){const ord=orders.find(o=>o.order_key===orderKey)??null;setRejectingOrder(ord);setShowRejectModal(true);return}
    setActionLoading(`${action}-${orderKey}`)
    try{
      // Offline GATE (mirrors KDS): online → normal write; offline (native) → durable outbox + queued.
      const result=await gatedAction({url:'/api/dashboard/action',body:{token,pin,action,order_key:orderKey,...(action==='ready'?{defer_email:true}:{})},kind:'status',order_key:orderKey,online:isOnline(),expectedFrom:STATUS_REPLAY_EXPECTED_FROM})
      if(result.queued){
        // OFFLINE: the optimistic advance is now a DURABLE render-time overlay derived from the outbox (FIX 2),
        // NOT a one-shot setOrders patch (a stale poll / SW-cache read would wipe that — the revert bug). We
        // just refresh the overlay so the card advances instantly; it outlives reads and auto-clears on drain.
        const q=orders.find(o=>o.order_key===orderKey)??deviceQueuedOrders.find(o=>o.order_key===orderKey)
        refreshPendingStatus()
        // Mirror the online prep-board auto-clear on ready/collected.
        if((action==='ready'||action==='collected')&&q){
          setStruckPrep(prev=>{const n=new Set(prev);q.items.forEach((item:any)=>{for(let u=0;u<item.quantity;u++)n.add(`${orderKey}:${item.name}:${u}`)});return n})
        }
        setActionLoading(null)
        // OFFLINE UNDO (ISSUE 1): remove the still-pending op → the overlay reverts as-if-never-happened. If it
        // already synced within the toast window (removePendingStatusOp → false), fall back to the ONLINE
        // compensating undo. Offered for ready/collected (matching the online undo affordance).
        const offlineUndo=async()=>{
          const removed=await removePendingStatusOp(orderKey)
          if(removed){
            dropOverlayEntry(orderKey); refreshPendingStatus()
            // Un-strike this order's prep pills (the onUndoRestore side-effect).
            setStruckPrep(prev=>{const n=new Set(prev);prev.forEach(k=>{if(k.split(':')[0]===orderKey)n.delete(k)});return n})
            showToast(`Order #${q?.id??''} reverted`)
          }else if(action==='ready'){undoReady(orderKey,q?.id??'')}
          else if(action==='collected'){doAction('undo_collected',orderKey)}
          else{fetchAll()}
        }
        const savedMsg=`Order #${q?.id??''} saved on this device — will sync when back online`
        if(action==='ready'||action==='collected'){
          showToast(savedMsg,'success',{duration:7000,action:{label:'↩ Undo',run:offlineUndo}})
        }else{showToast(savedMsg)}
        return
      }
      const data=result.data??{}; if(!result.ok)throw new Error(data.error)
      const labels:Record<string,string>={confirm:'confirmed',reject:'rejected',ready:'ready',collected:'collected',undo_collected:'restored',cancel:'cancelled'}
      const done=orders.find(o=>o.order_key===orderKey)
      const num=done?.id??''
      // "Mark paid & done" → a 7s Undo toast (undo_collected reverts ONE stage to the order's actual
      // previous status — ready if it was ready, else confirmed — AND rebuilds capacity to match).
      // "Ready" → status commits now but the customer email is DEFERRED 4s (defer_email above): an Undo
      // within 4s cancels the email (clears the per-order timer) AND reverts the status. The toast's tap
      // auto-dismisses it (handled in the render), so the run handlers only do the action.
      if(action==='collected'){
        showToast(`Order #${num} completed`,'success',{duration:7000,action:{label:'↩ Undo',run:()=>doAction('undo_collected',orderKey)}})
      }else if(action==='ready'){
        scheduleReadyEmail(orderKey)
        showToast(`Order #${num} ready`,'success',{duration:4000,action:{label:'↩ Undo',run:()=>undoReady(orderKey,num)}})
      }else{
        showToast(`Order #${num} ${labels[action]||action}`)
      }
      // Auto-clear prep board on collected (solo operator workflow)
      if(action==='collected'||action==='ready'){
        if(done){
          // Auto-clear unit pills for this specific order
          setStruckPrep(prev=>{
            const n=new Set(prev)
            done.items.forEach(item=>{
              for(let u=0;u<item.quantity;u++) n.add(`${orderKey}:${item.name}:${u}`)
            })
            return n
          })
        }
      }
      await fetchAll()
    }catch(err:any){showToast(err.message||'Failed','error')}finally{setActionLoading(null)}
  }

  // Fetch the edited order's slots from the SHARED /api/slots path, keyed to the
  // order's own event_id + date — identical to the Add Order panel's fetchManualSlots.
  // The route resolves the event window from event_id and floors against localTodayIso(),
  // so a future-dated order shows its full in-window list (no today wall-clock floor).
  const fetchEditSlots=async(order:Order)=>{
    if(!truck?.id){setEditSlots([]);setEditCapacityInputs(null);setEditServerCatConfigs({});return}
    setEditSlotsLoading(true)
    try{
      const p=new URLSearchParams()
      if(order.event_date)p.set('date',order.event_date)
      if(order.event_id)p.set('event_id',order.event_id)
      const res=await fetch(`/api/slots/${truck.id}?${p}`)
      const data=await res.json()
      setEditSlots(data.slots||[])
      setEditCapacityInputs(data.capacityInputs??null)
      setEditServerCatConfigs(data.catConfigs||{})
    }catch{setEditSlots([]);setEditCapacityInputs(null);setEditServerCatConfigs({})}
    finally{setEditSlotsLoading(false)}
  }
  const startEdit=(order:Order)=>{
    setEditingOrder(order)
    setEditSlots([]); setEditCapacityInputs(null); setEditServerCatConfigs({}); fetchEditSlots(order)
    setEditItems(order.items.map(i=>({...i,cartKey:makeCartKey(i.name,i.modifiers||[],i.specialInstructions)})))
    setEditDeals((order.deals||[]).map(d=>({name:d.name,slots:d.slots,slotModifiers:d.slotModifiers||{},slotNotes:d.slotNotes||{},isNew:false})))
    setEditSlot(order.slot||'')
    setEditNotes(order.notes||'')
    // "Walk-up" is the display default, not a real name — start the field empty for it so
    // it isn't shown as a pseudo-name (blank on save preserves the "Walk-up" default).
    setEditName(order.customer_name&&order.customer_name!=='Walk-up'?order.customer_name:''); setEditEmail(order.customer_email||''); setEditPhone(order.customer_phone||'')
    const itemsSubtotal=order.items.reduce((s,i)=>s+Number(i.unit_price)*i.quantity,0)
    setEditOrderBaseline({total:Number(order.total),itemsSubtotal,deals:(order.deals||[]).map(d=>({name:d.name}))})
  }
  const addEditItem=(item:MenuItem,mods:{name:string;price:number}[]=[],notes='')=>{
    const key=makeCartKey(item.name,mods,notes)
    const unitPrice=item.price+mods.reduce((s,m)=>s+m.price,0)
    setEditItems(prev=>{
      const ex=prev.find(i=>i.cartKey===key)
      if(ex)return prev.map(i=>i.cartKey===key?{...i,quantity:i.quantity+1}:i)
      return[...prev,{name:item.name,quantity:1,unit_price:unitPrice,modifiers:mods.length?mods:undefined,specialInstructions:notes||undefined,cartKey:key}]
    })
  }
  const openEditItemModal=(item:MenuItem)=>{
    const catName=truckMenu?.items.find(i=>i.name===item.name)?.category
    const cat=truckMenu?.categories?.find(c=>c.name===catName)
    const modGroups=cat?.modifierGroups||[]
    const allowNotes=cat?.allowNotes??false
    if(modGroups.length>0||allowNotes){setEditItemModal({item,modGroups,allowNotes});setEditModalMods([]);setEditModalNotes('')}
    else{addEditItem(item)}
  }
  const closeEditItemModal=()=>{setEditItemModal(null);setEditModalMods([]);setEditModalNotes('')}
  const submitEdit=async()=>{
    if(!editingOrder)return; setActionLoading(`edit-${editingOrder.id}`)
    try{
      const res=await fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'edit',order_key:editingOrder.order_key,editedOrder:{items:editItems.filter(i=>i.quantity>0),deals:editDeals,slot:editSlot||null,notes:editNotes||null,customerName:editName,customerEmail:editEmail,customerPhone:editPhone}})})
      const data=await res.json(); if(!res.ok)throw new Error(data.error)
      showToast(`Order #${editingOrder.id} updated`); setEditingOrder(null); await fetchAll()
    }catch(err:any){showToast(err.message||'Edit failed','error')}finally{setActionLoading(null)}
  }

  const updateStock=async(itemName:string,available:boolean,stockCount:number|null,category?:string,noItemCap=false)=>{
    // event_id = the SAME event the Menu & Stock tab is showing (per-event override, Phase 5).
    const event_id=selectedEventRef.current?.id??null
    const key=event_id??'__none__'
    // Optimistic FIRST (reflect the value immediately) into THIS event's slice, THEN POST — never
    // await before showing it. no_item_cap rides along so the follow-category state shows pre-POST.
    // No fetchMenu here: it re-pulled default_stock and was a clobber vector.
    setItemStocksByEvent(prev=>{const cur=prev[key]??[];const ex=cur.find(s=>s.name===itemName);const next=ex?cur.map(s=>s.name===itemName?{...s,available,stock_count:stockCount,no_item_cap:noItemCap}:s):[...cur,{name:itemName,available,stock_count:stockCount,no_item_cap:noItemCap,orders_count:0,category:category||null}];return{...prev,[key]:next}})
    // Through the offline GATE (kind:'stock'): online → posts directly (unchanged); offline → durable outbox +
    // optimistic stays. Synthetic key `${event_id}:set_stock:${itemName}` coalesces re-queues (last-write-wins).
    const r=await gatedAction({url:'/api/dashboard/action',body:{token,pin,action:'set_stock',itemName,available,stockCount,noItemCap,category,event_id},kind:'stock',order_key:`${event_id??'none'}:set_stock:${itemName}`,online:isOnline()})
    if(r.queued)showToast('Stock saved on this device — will sync when back online')
  }
  const updateCategoryStock=async(category:string,stockCount:number|null)=>{
    const event_id=selectedEventRef.current?.id??null
    const key=event_id??'__none__'
    setCategoryStocksByEvent(prev=>{const cur=prev[key]??[];const ex=cur.find(s=>s.category===category);const next=ex?cur.map(s=>s.category===category?{...s,stock_count:stockCount}:s):[...cur,{category,stock_count:stockCount,default_stock:null,orders_count:0}];return{...prev,[key]:next}})
    const r=await gatedAction({url:'/api/dashboard/action',body:{token,pin,action:'set_category_stock',category,stockCount,event_id},kind:'stock',order_key:`${event_id??'none'}:set_category_stock:${category}`,online:isOnline()})
    if(r.queued)showToast('Stock saved on this device — will sync when back online')
  }

  // Enable/disable a whole category for THIS event (GATE) — mirrors updateCategoryStock. Optimistic
  // toggle of `available`; the server upsert preserves stock_count (no-clobber). Closing hides the
  // customer tab + blocks at submit; auto-reverts next event.
  const updateCategoryAvailable=async(category:string,available:boolean)=>{
    const event_id=selectedEventRef.current?.id??null
    const key=event_id??'__none__'
    const pk=`catavail:${key}:${category.toLowerCase()}`
    pendingWritesRef.current[pk]={v:available,meta:category}   // shared guard; meta=name so an omitting refetch can re-add the row
    setCategoryStocksByEvent(prev=>{const cur=prev[key]??[];const ex=cur.find(s=>s.category===category);const next=ex?cur.map(s=>s.category===category?{...s,available}:s):[...cur,{category,stock_count:null,default_stock:null,orders_count:0,available}];return{...prev,[key]:next}})
    const r=await gatedAction({url:'/api/dashboard/action',body:{token,pin,action:'set_category_available',category,available,event_id},kind:'stock',order_key:`${event_id??'none'}:set_category_available:${category}`,online:isOnline()})
    if(r.queued){delete pendingWritesRef.current[pk];showToast('Saved on this device — will sync when back online');return}
    if(!r.ok){
      // Write FAILED (surfaced now that the action checks .error): drop the guard + revert so the UI
      // shows the truth instead of a lie that a later refetch would silently undo.
      delete pendingWritesRef.current[pk]
      setCategoryStocksByEvent(prev=>{const cur=prev[key]??[];const next=cur.map(s=>s.category===category?{...s,available:!available}:s);return{...prev,[key]:next}})
      showToast('Could not update the category — please try again','error')
    }
    // On success the guard stays until fetchStock sees the committed value catch up (then drops it).
  }

  // Stage B re-source: options now live on item.modifierGroups (category.modifierGroups was emptied),
  // so the optimistic patch walks the ITEM groups. One shared option appears on multiple items — patch
  // every copy so the deduped Options list reflects the change immediately.
  const patchOption=(optionId:string,patch:Partial<ModifierOption>)=>{
    setTruckMenu(prev=>{
      if(!prev)return prev
      return{...prev,items:prev.items.map(it=>it.modifierGroups?{
        ...it,
        modifierGroups:it.modifierGroups.map(grp=>({
          ...grp,
          options:grp.options?.map(opt=>opt.id===optionId?{...opt,...patch}:opt)
        }))
      }:it)}
    })
  }
  // PER-EVENT override (extras stock-scoping fix): writes event_option_stock for the SELECTED event
  // (same event_id source as updateStock), NOT the shared modifier_options template. Optimistic patch of
  // the menu copy; a refresh re-pulls /api/menu?event_id=… which resolves the event override.
  const updateModifierOptionAvailable=async(optionId:string,available:boolean)=>{
    const event_id=selectedEventRef.current?.id??null
    patchOption(optionId,{available}) // optimistic
    // Offline gate (kind:'stock'). Key includes the ACTION so an option's availability + stock don't collide.
    const r=await gatedAction({url:'/api/dashboard/action',body:{token,pin,action:'set_modifier_option_available',optionId,available,event_id},kind:'stock',order_key:`${event_id??'none'}:set_modifier_option_available:${optionId}`,online:isOnline()})
    if(r.queued)showToast('Stock saved on this device — will sync when back online')
  }
  const updateModifierOptionStock=async(optionId:string,stockCount:number|null)=>{
    const event_id=selectedEventRef.current?.id??null
    patchOption(optionId,{stock_count:stockCount}) // optimistic
    const r=await gatedAction({url:'/api/dashboard/action',body:{token,pin,action:'set_modifier_option_stock',optionId,stockCount,event_id},kind:'stock',order_key:`${event_id??'none'}:set_modifier_option_stock:${optionId}`,online:isOnline()})
    if(r.queued)showToast('Stock saved on this device — will sync when back online')
  }

  const openEvent=async(eventId:string)=>{
    const wasClosedEvent=upcomingEvents.find(e=>e.id===eventId)?.status==='closed'
    try{
      const res=await fetch('/api/events/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,action:'open',eventId,payload:{}})})
      const data=await res.json(); if(!res.ok) throw new Error(data.error)
      const opened=new Date().toISOString()
      setTodayEvents(prev=>prev.map(e=>e.id===eventId?{...e,status:'open' as const,opened_at:opened}:e))
      setUpcomingEvents(prev=>prev.map(e=>e.id===eventId?{...e,status:'open' as const,opened_at:opened}:e))
      showToast(wasClosedEvent?'Event restarted':'Event started')
      fetchAllRef.current() // re-sync from the authoritative server read so status propagates immediately
    }catch(err:any){showToast(err.message||'Failed','error')}
  }

  const extendEvent=async(eventId:string,addMins:number)=>{
    const ev=todayEvents.find(e=>e.id===eventId); if(!ev) return
    const[h,m]=ev.end_time.split(':').map(Number)
    const total=h*60+m+addMins
    const newEnd=`${String(Math.floor(total/60)%24).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`
    try{
      const res=await fetch('/api/events/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,action:'update',eventId,payload:{end_time:newEnd}})})
      const data=await res.json(); if(!res.ok) throw new Error(data.error)
      setTodayEvents(prev=>prev.map(e=>e.id===eventId?{...e,end_time:newEnd}:e))
      showToast(`Extended to ${newEnd}`)
    }catch(err:any){showToast(err.message||'Failed','error')}
  }

  // Styled finish confirm (replaces window.confirm). finishEvent OPENS the modal; doFinishEvent runs
  // the close after Yes. The timing-aware (finishingEarly = now<end_time, minute-parsed) logic is
  // UNCHANGED — only the confirm SURFACE moved from native confirm to the modal below.
  const finishEvent=(eventId:string)=>{
    const ev=todayEvents.find(e=>e.id===eventId)??upcomingEvents.find(e=>e.id===eventId)
    const nowMins=new Date().getHours()*60+new Date().getMinutes()
    const endMins=ev?.end_time?(()=>{const[h,m]=ev.end_time.split(':').map(Number);return (h||0)*60+(m||0)})():null
    const finishingEarly=endMins!=null && nowMins<endMins
    setFinishConfirm({eventId,early:finishingEarly,endTime:ev?.end_time?formatTime(ev.end_time):''})
  }
  const doFinishEvent=async(eventId:string)=>{
    setFinishConfirm(null)
    try{
      // Flips the EVENT status to 'closed' only — existing orders are untouched and stay
      // fully visible/actionable; this just stops NEW customer orders.
      const res=await fetch('/api/events/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,action:'close',eventId,payload:{}})})
      const data=await res.json(); if(!res.ok) throw new Error(data.error)
      setTodayEvents(prev=>prev.map(e=>e.id===eventId?{...e,status:'closed' as const,closed_at:new Date().toISOString()}:e))
      setShowEventMenu(false); showToast('Event finished')
      fetchAllRef.current() // re-sync so the status flips to "Finished" immediately (no manual refresh)
    }catch(err:any){showToast(err.message||'Failed','error')}
  }

  const confirmCancelOrder=async()=>{
    if(!cancellingOrder) return
    const orderKey=cancellingOrder.order_key
    const displayId=cancellingOrder.id
    const fullReason=[cancelReason,cancelNote].filter(Boolean).join(' — ')
    setShowCancelModal(false);setCancellingOrder(null);setCancelReason('');setCancelNote('')
    setActionLoading(`cancel-${orderKey}`)
    try{
      // Through the offline GATE (FIX 2): online → normal write; offline → durable outbox + queued. The
      // reason rides IN the body so the reconnect replay is faithful; expected_from → 409-to-conflict if it raced.
      const result=await gatedAction({url:'/api/dashboard/action',body:{token,pin,action:'cancel',order_key:orderKey,cancellationReason:fullReason||null},kind:'status',order_key:orderKey,online:isOnline(),expectedFrom:STATUS_REPLAY_EXPECTED_FROM})
      if(result.queued){refreshPendingStatus();showToast(`Order #${displayId} saved on this device — will sync when back online`);return}
      if(!result.ok)throw new Error((result.data as any)?.error)
      showToast(`Order #${displayId} cancelled`);await fetchAll()
    }catch{showToast('Failed to cancel','error')}finally{setActionLoading(null)}
  }

  const confirmRejectOrder=async()=>{
    if(!rejectingOrder) return
    const note=rejectNote.trim()
    // REQUIRED reason: a concrete preset → preset (+ optional note); "Other" or no preset → the note
    // (mandatory). fullReason is never empty (the confirm button is also disabled until valid).
    const fullReason=(rejectReason&&rejectReason!=='Other')?[rejectReason,note].filter(Boolean).join(' — '):note
    if(!fullReason) return
    const orderKey=rejectingOrder.order_key
    const displayId=rejectingOrder.id
    setShowRejectModal(false);setRejectingOrder(null);setRejectReason('');setRejectNote('')
    setActionLoading(`reject-${orderKey}`)
    try{
      // Offline GATE (FIX 2) — reason in the body for faithful replay; expected_from → conflict if it raced.
      const result=await gatedAction({url:'/api/dashboard/action',body:{token,pin,action:'reject',order_key:orderKey,rejectionReason:fullReason},kind:'status',order_key:orderKey,online:isOnline(),expectedFrom:STATUS_REPLAY_EXPECTED_FROM})
      if(result.queued){refreshPendingStatus();showToast(`Order #${displayId} saved on this device — will sync when back online`);return}
      if(!result.ok)throw new Error((result.data as any)?.error)
      showToast(`Order #${displayId} rejected`);await fetchAll()
    }catch{showToast('Failed to reject','error')}finally{setActionLoading(null)}
  }

  const cancelEventFromMenu=async(eventId:string)=>{
    if(!window.confirm('Cancel this event? This cannot be undone.')) return
    try{
      const res=await fetch('/api/events/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,action:'cancel',eventId,payload:{}})})
      const data=await res.json(); if(!res.ok) throw new Error(data.error)
      setTodayEvents(prev=>prev.filter(e=>e.id!==eventId))
      setSelectedEventId(null); setShowEventMenu(false); showToast('Event cancelled')
      fetchAllRef.current() // re-sync so the cancelled event drops out immediately
    }catch(err:any){showToast(err.message||'Failed','error')}
  }

  const saveEventNote=async(eventId:string)=>{
    try{
      const res=await fetch('/api/events/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,action:'update',eventId,payload:{customer_note:eventNoteInput}})})
      const data=await res.json(); if(!res.ok) throw new Error(data.error)
      setTodayEvents(prev=>prev.map(e=>e.id===eventId?{...e,customer_note:eventNoteInput||null}:e))
      setShowEventMenu(false); showToast('Note saved')
    }catch(err:any){showToast(err.message||'Failed','error')}
  }

  const switchEvent=(event:TruckEvent)=>{
    const active=todayEvents.find(e=>e.id===selectedEventId)||(todayEvents.find(e=>e.status==='open')??todayEvents.find(e=>e.status==='confirmed')??todayEvents[0]??null)
    if(active?.status==='open'&&event.id!==active.id){
      const confirmed=window.confirm(`You're currently serving at ${active.venue_name}. Switch to ${event.venue_name}? Tap the current event to switch back.`)
      if(!confirmed) return
    }
    setSelectedEventId(event.id)
  }

  const categoryOrder = useMemo(
    () => truckMenu?.categories?.map(c => c.name) ?? [],
    [truckMenu]
  )
  const itemCategoryMap = useMemo(() => {
    const map: Record<string, string> = {}
    truckMenu?.items?.forEach(item => { if (item.category) map[item.name] = item.category })
    return map
  }, [truckMenu])
  // Per-category cook config (keyed by lowercased name) → drives the order card's
  // prep-aware green→amber threshold. Same shape the slot engine uses.
  const catConfigs = useMemo<Record<string, CatConfig>>(() => {
    const m: Record<string, CatConfig> = {}
    truckMenu?.categories?.forEach(c => {
      m[c.name.toLowerCase()] = { secs: c.prep_secs ?? 0, batch: c.batch_size && c.batch_size > 0 ? c.batch_size : 1 }
    })
    return m
  }, [truckMenu])

  // Edit picker traffic-light: SAME shared oven-occupancy helper as Add Order, so the
  // edit modal shows "Pizza 1/4" amber identically (no count-ratio fork). Empty until
  // /api/slots returns capacityInputs for the edited order's event.
  const editSlotIndicators = useMemo<Map<string, SlotIndicator>>(() => {
    if (!editCapacityInputs || !editSlots.length) return new Map()
    return buildSlotIndicators(
      editSlots,
      editCapacityInputs.productionSlotUnits || {},
      editServerCatConfigs,
      editCapacityInputs.kitchenCapacity ?? null,
      editCapacityInputs.eventStartMins,
      categoryOrder,
      editCapacityInputs.capacityWindowMins ?? 5,
    )
  }, [editCapacityInputs, editSlots, editServerCatConfigs, categoryOrder])

  // Sold counts are event-scoped (V6.4): refetch Menu & Stock whenever the resolved
  // stockEvent changes (single-source resolution above) so each event shows only its
  // own counts. fetchAll/submitPin/realtime/poll fetch the SAME id via selectedEventRef.
  useEffect(()=>{
    if(!authenticatedRef.current) return
    fetchStock(pin,stockEventId)
  },[stockEventId,pin,fetchStock])

  // ── Event resolution + displaySlots — MUST run UNCONDITIONALLY, ABOVE the early returns below ──────────
  // resolvedEvent/activeEvent are consts (movable), but displaySlots is a HOOK (useMemo): if it sat after a
  // conditional return (loading/error/pin) it would be skipped on those renders → "Rendered more hooks than
  // during the previous render". Rules of Hooks: every hook runs on every render, in the same order.
  const resolvedEvent:TruckEvent|null=selectedOrDefaultEvent
  // Fall back to the last known event when upcomingEvents is transiently empty
  // (failed refetch) but the selection is still live — never blank the event bar
  const activeEvent:TruckEvent|null=resolvedEvent
    ??(selectedEventId&&lastActiveEventRef.current?.id===selectedEventId?lastActiveEventRef.current:null)
  if(resolvedEvent)lastActiveEventRef.current=resolvedEvent

  // AMBER-DUE sound: ding ONCE when an active order first crosses ok→warn (getCombinedUrgency), iff master
  // (soundEnabled, per-device) && per-truck config.order_due. Runs on a 15s tick (like the card's own colour
  // tick), with a per-order_key previous-urgency map so it fires once per transition, not every tick, and
  // only for pending/confirmed orders (cooking/ready are already being handled — no "start now" alert).
  // Uses the SAME urgency inputs as OrderCard (resolveCollectionTime + prep-aware cookAmberLeadMins) so the
  // sound matches the card colour exactly. Default OFF (can get chatty). NOTE: fires from a TIMER, not a
  // click, so it's silently dropped until the audio context is gesture-unlocked (the Settings UI says so).
  useEffect(()=>{
    const cfg=truck?.sound_config??DEFAULT_SOUND_CONFIG
    if(!soundEnabled||!authenticated||!cfg.order_due) return
    const scan=()=>{
      const seen=new Set<string>()
      for(const o of orders){
        if(o.status!=='pending'&&o.status!=='confirmed'){ prevUrgencyRef.current.delete(o.order_key); continue }
        seen.add(o.order_key)
        const slotDt=resolveCollectionTime(o,activeEvent)
        const lead=cookAmberLeadMins(getOrderCookSecs(o.items,itemCategoryMap,catConfigs))
        const u=getCombinedUrgency(slotDt,o.created_at,lead)
        const prev=prevUrgencyRef.current.get(o.order_key)
        // Only a REAL transition into warn from a known ok/new fires — never on first sight of an
        // already-amber order (load / card remount), never on warn→late re-entries.
        if((prev==='ok'||prev==='new')&&u==='warn') playOrderDue()
        prevUrgencyRef.current.set(o.order_key,u)
      }
      for(const k of Array.from(prevUrgencyRef.current.keys())) if(!seen.has(k)) prevUrgencyRef.current.delete(k)
    }
    scan()
    const id=setInterval(scan,15000)
    return()=>clearInterval(id)
  },[orders,authenticated,soundEnabled,truck?.sound_config,activeEvent,catConfigs,itemCategoryMap])

  // OFFLINE-AWARE capacity for the day-load strip (Piece 1). ONLINE / no optimistic orders → returns the
  // server `slots` UNCHANGED (deviceQueuedOrders is ONLY ever populated by an OFFLINE create, so online this
  // is a no-op returning the same reference — the online path is byte-identical). OFFLINE with optimistic
  // orders → fold THEIR oven occupancy into the frozen server occupancy and re-run the SAME buildSlotIndicators
  // the strip's tone/label already come from, overlaying tone/label. Mirrors the server buildUnitsFromOrders
  // EXACTLY: ct = order.slot || eventStart → window key (timeMap[ct]||ct); normaliseOrderLines +
  // orderItemsToQtyByCat + mergeQtyByCat; event-scoped. Auto-reverts to server truth once the orders sync +
  // prune. Advisory OFFLINE view — the server stays authoritative on reconnect; oversell detection is Piece 2.
  const displaySlots=useMemo(()=>{
    // FAIL-SAFE: the capacity STRIP must NEVER crash the dashboard. Any not-yet-loaded input OR any thrown
    // error → return the plain server `slots` (the online/normal path). Worst case the strip shows
    // server-only state; it can never take the page down.
    try{
      if(!Array.isArray(slots)||slots.length===0)return slots
      // ONLINE-SAFETY GATE (critical): recompute ONLY when the device holds offline changes — offline CREATES
      // (deviceQueuedOrders) OR offline STATUS changes (statusOverlay, the sticky offline overlay). Both are
      // populated ONLY offline, so online BOTH are empty → return server `slots` UNCHANGED (byte-identical live
      // path; the client recompute can never affect the online strip, and divergence stays offline-only).
      const hasOfflineChanges=deviceQueuedOrders.length>0||statusOverlay.size>0
      if(!hasOfflineChanges||!activeEvent)return slots
      if(!serverCatConfigs||Object.keys(serverCatConfigs).length===0)return slots  // engine inputs not loaded yet → server slots
      // Stage 2b — FROM-ORDERS recompute (base = {}, NOT the frozen productionSlotUnits blob): mirror the
      // server's buildUnitsFromOrders so offline STATUS changes are reflected, not just creates. Source = server
      // orders + offline creates not yet synced (dedup by order_key), EVENT-SCOPED (null/other-event excluded,
      // matching .eq('event_id', …)). Apply the Stage-2 OVERLAY status, then the ENGINE'S OWN occupied filter —
      // so ready/collected/cancelled/rejected RELEASE and pending/confirmed/modified/cooking OCCUPY. On sync the
      // server rebuild + overlay-clear reconcile to the same occupancy → seamless handoff. NO engine change.
      const serverOrders=Array.isArray(orders)?orders:[]
      const syncedKeys=new Set(serverOrders.map(o=>o.order_key))
      const source=[...serverOrders,...deviceQueuedOrders.filter(o=>o&&!syncedKeys.has(o.order_key))]
        .filter(o=>o&&(o as {event_id?:string|null}).event_id===activeEvent.id)
      const timeMap:Record<string,string>={}
      slots.forEach(s=>{if(s?.collection_time)timeMap[s.collection_time]=s.production_window_key||s.collection_time})
      const eventStart=activeEvent.start_time||''
      // buildUnitsFromOrders' .in(...) status filter (§71) reused as a constant — the whole release mechanism.
      const OCCUPYING=['pending','confirmed','modified','cooking']
      const merged:Record<string,Record<string,number>>={}
      source.forEach(o=>{
        const status=statusOverlay.get(o.order_key)?.status??(o as {status?:string}).status
        if(!status||!OCCUPYING.includes(status))return          // released (ready/collected/cancelled/rejected) → excluded
        const ct=(o as {slot?:string|null}).slot||eventStart     // slot||eventStart (mirrors buildUnitsFromOrders)
        if(!ct)return
        const ps=timeMap[ct]||ct                                 // window key = timeMap[ct] || ct
        const lines=normaliseOrderLines((o.items as Array<{name:string;quantity:number|string}>)||[],(o as {deals?:Array<{slots?:Record<string,unknown>}>|null}).deals)
        const delta=orderItemsToQtyByCat(lines,itemCategoryMap||{})
        merged[ps]=mergeQtyByCat(merged[ps]||{},delta)
      })
      const[h,m]=(activeEvent.start_time||'0:0').split(':').map(Number)
      const eventStartMins=(h||0)*60+(m||0)
      const ind=buildSlotIndicators(slots,merged,serverCatConfigs,kitchenCapacity,eventStartMins,categoryOrder||[],capacityWindowMins)
      return slots.map(s=>({...s,tone:ind.get(s.collection_time)?.tone??s.tone,label:ind.get(s.collection_time)?.label??s.label}))
    }catch(e){
      console.warn('[displaySlots] offline capacity recompute failed — using server slots',e)
      return slots
    }
  },[slots,orders,deviceQueuedOrders,statusOverlay,activeEvent,serverCatConfigs,kitchenCapacity,categoryOrder,capacityWindowMins,itemCategoryMap])

  // STOCK ↔ ORDERS (offline): fold offline-order consumption into the displayed orders_count so remaining
  // ticks down as the operator takes orders offline. EXACTLY-ONCE: only offline orders NOT yet in server
  // `orders` (dedup by order_key), event-scoped, and NOT cancelled/rejected (overlay status). On sync the
  // server's own decrement covers the same orders and they prune from deviceQueuedOrders → the fold empties →
  // no double-decrement. FAIL-SAFE: any error → empty maps (display falls back to server orders_count).
  const{offlineConsumedByItem,offlineConsumedByCat}=useMemo(()=>{
    const byItem=new Map<string,number>(); const byCat=new Map<string,number>()
    try{
      if(deviceQueuedOrders.length===0)return{offlineConsumedByItem:byItem,offlineConsumedByCat:byCat}
      const syncedKeys=new Set((Array.isArray(orders)?orders:[]).map(o=>o.order_key))
      for(const o of deviceQueuedOrders){
        if(!o||syncedKeys.has(o.order_key))continue
        if(stockEventId&&(o as {event_id?:string|null}).event_id!==stockEventId)continue
        const status=statusOverlay.get(o.order_key)?.status??(o as {status?:string}).status
        if(status==='cancelled'||status==='rejected')continue                       // not placed → doesn't consume
        const lines=normaliseOrderLines((o.items as Array<{name:string;quantity:number|string}>)||[],(o as {deals?:Array<{slots?:Record<string,unknown>}>|null}).deals)
        for(const l of lines){
          const name=l.name; const qty=Number(l.quantity)||0
          if(!name||qty<=0)continue
          byItem.set(name,(byItem.get(name)||0)+qty)
          const c=(itemCategoryMap||{})[name]; if(c)byCat.set(c,(byCat.get(c)||0)+qty)
        }
      }
    }catch(e){console.warn('[stock] offline consumption fold failed — server counts only',e);return{offlineConsumedByItem:new Map<string,number>(),offlineConsumedByCat:new Map<string,number>()}}
    return{offlineConsumedByItem:byItem,offlineConsumedByCat:byCat}
  },[deviceQueuedOrders,orders,statusOverlay,stockEventId,itemCategoryMap])

  if(loading)return<div className="min-h-screen bg-slate-50 flex items-center justify-center"><p className="text-slate-400 animate-pulse font-medium">Loading dashboard...</p></div>
  if(error){const _brand=typeof window!=='undefined'&&window.location.hostname.includes('hatchgrab')?'HatchGrab':'Village Foodie';return<div className="min-h-screen bg-slate-50 flex items-center justify-center px-4"><div className="text-center"><p className="text-slate-900 font-bold text-lg mb-2">Access denied</p><p className="text-slate-500 text-sm">{error}</p><Link href="/" className="mt-4 inline-block text-orange-600 text-sm hover:underline">← {_brand}</Link></div></div>}
  if(requiresPin&&!authenticated)return(
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="bg-slate-800 rounded-2xl p-8 max-w-sm w-full text-center">
        <div className="text-4xl mb-4">🔒</div>
        <h2 className="text-white font-black text-xl mb-2">Enter PIN</h2>
        <p className="text-slate-500 text-sm mb-6">4-digit dashboard PIN</p>
        <input type="number" maxLength={4} value={pinInput} onChange={e=>setPinInput(e.target.value.slice(0,4))} onKeyDown={e=>e.key==='Enter'&&submitPin()} placeholder="• • • •" className="w-full text-center text-2xl font-black tracking-widest bg-slate-700 text-white rounded-xl px-4 py-3 mb-3 focus:outline-none focus:ring-2 focus:ring-orange-500 border border-slate-600"/>
        {pinError&&<p className="text-red-400 text-sm mb-3">{pinError}</p>}
        <button onClick={submitPin} className="w-full bg-orange-600 text-white font-black py-3 rounded-xl hover:bg-orange-700">Unlock</button>
      </div>
    </div>
  )

  const recentlyClosed=!!(activeEvent?.status==='closed'&&activeEvent.closed_at&&Date.now()-new Date(activeEvent.closed_at).getTime()<10*60*1000)
  const effectiveOfflineProtection=eventOfflineOverride!==null?eventOfflineOverride:vanAutoPause

  // Sort ascending by RESOLVED collection time (Manual s.6/s.9): null-slot ASAP
  // orders resolve to the event-date-aware ASAP base, so they interleave with
  // timed orders instead of always sorting last. order_key is the stable
  // tiebreaker only — never the ordering key (Manual s.18a).
  const sortByTimeThenId=(a:Order,b:Order)=>{
    const aDt=resolveCollectionTime(a,activeEvent)?.getTime()??Number.POSITIVE_INFINITY
    const bDt=resolveCollectionTime(b,activeEvent)?.getTime()??Number.POSITIVE_INFINITY
    if(aDt!==bDt) return aDt-bDt
    // Same collection time → first PLACED wins (creation order), not the random order_key UUID —
    // otherwise a later order could jump ahead of an earlier one at the same time (looks like a bug).
    return new Date(a.created_at).getTime()-new Date(b.created_at).getTime()
  }
  // Orders arrive already event-scoped from /api/dashboard (V6.4). Keep a strict
  // event_id match as a client-side safety net during the brief window between an
  // event switch and its refetch. NULL-event orders are intentionally excluded
  // (the date+van fallback is dropped — it was the same-date multi-event bleed path).
  // Offline-queued walk-ups (deviceQueuedOrders) are prepended for DISPLAY only — the isolated merge never
  // touches `orders`/fetchAll; they clear on the reconnect drain once the synced order arrives from server.
  // Per-order reconciliation: drop any optimistic order whose synced twin has arrived in `orders` (matched on
  // order_key) — kills the M3+3 duplicate AND the duplicate React key. Replaces the old wholesale onSynced
  // clear (which also dropped un-synced optimistic orders).
  const syncedKeys=new Set(orders.map(o=>o.order_key))
  const pendingQueued=deviceQueuedOrders.filter(o=>!syncedKeys.has(o.order_key))
  // FIX 2 — apply the durable offline status overlay (sticky; held until the server reflects it) over the
  // merged orders BEFORE the column split, so an offline-advanced (or offline-cancelled) card moves to the
  // right section and no stale/intermediate read can wipe it. Empty overlay (online) → identity, no change.
  const overlayed=statusOverlay.size
    ?[...pendingQueued,...orders].map(o=>{const ov=statusOverlay.get(o.order_key);return ov?({...o,...ov} as Order):o})
    :[...pendingQueued,...orders]
  const eventOrders=activeEvent
    ?overlayed.filter(o=>o.event_id===activeEvent.id)
    :overlayed
  const pendingOrders=eventOrders.filter(o=>o.status==='pending').sort(sortByTimeThenId)
  // Active in-progress states render as live cards (cooking/ready included — food done/
  // being made, still awaiting collection). otherOrders is a POSITIVE terminal filter, NOT
  // a negative one — so cooking/ready (or any future status) can't silently fall into the
  // Completed section. Mirrors the server's ACTIVE_STATUSES / DONE_STATUSES split.
  const confirmedOrders=eventOrders.filter(o=>['confirmed','modified','cooking','ready'].includes(o.status)).sort(sortByTimeThenId)
  const otherOrders=eventOrders.filter(o=>['collected','cancelled','rejected'].includes(o.status))
  const cancelledCount=otherOrders.filter(o=>o.status==='cancelled').length
  const menuGroups = truckMenu ? Object.fromEntries(groupByCategory(truckMenu.items, truckMenu.categories?.map(c => c.name))) : {}
  const editItemsSubtotal=editItems.reduce((s,i)=>s+i.unit_price*i.quantity,0)
  const editTotal=editOrderBaseline?(()=>{
    const itemDelta=editItemsSubtotal-editOrderBaseline.itemsSubtotal
    const removedOriginalValue=editOrderBaseline.deals.reduce((s,od)=>{
      const stillPresent=editDeals.some(ed=>!ed.isNew&&ed.name===od.name)
      if(stillPresent)return s
      return s+(truckMenu?.bundles?.find(b=>b.name===od.name)?.bundle_price??0)
    },0)
    const addedNewValue=editDeals.filter(d=>d.isNew).reduce((s,d)=>{
      const bundle=truckMenu?.bundles?.find(b=>b.name===d.name)
      const modExtra=Object.values(d.slotModifiers||{}).flat().reduce((sm,m)=>sm+m.price,0)
      return s+(bundle?.bundle_price??0)+modExtra
    },0)
    return Math.max(0,editOrderBaseline.total+itemDelta-removedOriginalValue+addedNewValue)
  })():Math.max(0,editItemsSubtotal)

  // Relative event-date label for the header — "Today/Tomorrow/{Weekday} {D}th {Month}". "today" is
  // resolved in the EVENT tz (Europe/London) via getLocalDateInTz, NOT device-local / toISOString, so a
  // future pre-order event reads correctly. event_date is a pure calendar date ('YYYY-MM-DD'); we format
  // its parts under timeZone:'UTC' so the weekday/month never shift.
  const eventDateLabel=(dateStr:string):string=>{
    const ordinal=(n:number)=>{const v=n%100;const s=['th','st','nd','rd'];return `${n}${s[(v-20)%10]||s[v]||s[0]}`}
    const todayStr=getLocalDateInTz('Europe/London')
    const [ty,tm,td]=todayStr.split('-').map(Number)
    const tmw=new Date(Date.UTC(ty,tm-1,td+1))
    const tomorrowStr=`${tmw.getUTCFullYear()}-${String(tmw.getUTCMonth()+1).padStart(2,'0')}-${String(tmw.getUTCDate()).padStart(2,'0')}`
    const [ey,em,ed]=dateStr.split('-').map(Number)
    const d=new Date(Date.UTC(ey,em-1,ed))
    const dayLabel=`${ordinal(ed)} ${d.toLocaleDateString('en-GB',{month:'long',timeZone:'UTC'})}`
    if(dateStr===todayStr)return `Today ${dayLabel}`
    if(dateStr===tomorrowStr)return `Tomorrow ${dayLabel}`
    return `${d.toLocaleDateString('en-GB',{weekday:'long',timeZone:'UTC'})} ${dayLabel}`
  }

  // Extra-wait control (select, or the active "tap to clear" button) — ONE definition reused in two
  // responsive placements so the set/clear logic never diverges: mobile keeps it in the top controls
  // row; desktop (lg:) shows it stacked above Prep beside the stat boxes. `cls` carries the per-slot
  // width/visibility classes.
  const renderExtraWait=(cls:string)=> waitMinutes>0?(
    <button onClick={()=>{fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'set_extra_wait',minutes:0,eventId:activeEvent?.id})});markPending('extraWaitMins',0);markPending('extraWaitStartedAt',null);setExtraWaitMins(0);setExtraWaitStartedAt(null)}} className={`py-2.5 rounded-xl text-sm font-black bg-orange-100 text-orange-700 border border-orange-300 hover:bg-orange-200 ${cls}`}>
      ⏱ +{waitMinutes}m active · Tap to clear
    </button>
  ):(
    <select defaultValue="" onChange={e=>{const m=parseInt(e.target.value);if(!m)return;const startedAt=new Date().toISOString();fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'set_extra_wait',minutes:m,eventId:activeEvent?.id})});markPending('extraWaitMins',m);markPending('extraWaitStartedAt',startedAt);setExtraWaitMins(m);setExtraWaitStartedAt(startedAt);e.target.value=''}} className={`border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 ${cls}`}>
      <option value="">⏱ Add extra wait</option>
      <option value={10}>+10 min</option>
      <option value={20}>+20 min</option>
      <option value={30}>+30 min</option>
    </select>
  )

  return(
    <div className="bg-slate-50 h-dvh flex flex-col overflow-hidden">{/* App-shell (KDS flex pattern) for EVERY tab: fixed-viewport h-dvh column where the top bars are shrink-0 and only <main> scrolls. Bars stay locked on all tabs + all browsers — replaces the stacked position:sticky-against-body-scroll that was unreliable in the iPad WKWebView (tabs scrolled away). */}
      {/* App-lock overlay (per-device biometric/passcode) — covers the screen until unlocked. No-op on web
          / when off. Rendered first so it's on top. */}
      <AppLockGate />
      {/* Package 3: first-launch per-device setup (default screen + van). App-only overlay — renders null
          on web and once this device is configured. */}
      <OfflineBanner onSynced={()=>{reseedRef.current();refreshPendingStatus()}} />
      {/* WEB-only counterpart: no queue on web, so just a clear "you're offline, orders won't send" bar
          (renders null on native, where OfflineBanner owns the offline state). */}
      <WebOfflineBanner />
      {/* Piece 2 — reconnect capacity-exceeded flag (detection only, non-blocking, dismissible). Fed by
          the server's detectCapacityBreaches; a fresh fetchAll after a drain refreshes it. */}
      <CapacityBreachBanner breaches={capacityBreaches} dismissedSig={breachDismissedSig} onDismiss={setBreachDismissedSig} />
      {/* Persistent OFFLINE chip — shown on EVERY tab whenever offline (single isOffline source), so the
          operator always knows. Complements OfflineBanner (order-focused, native-only): this signals the
          global offline state + what's locked, on Settings/Stock too. Slim shrink-0 bar in the app-shell. */}
      {isOffline&&(
        <div className="w-full bg-slate-800 text-white text-xs font-semibold px-4 py-1.5 flex items-center justify-center gap-2 shrink-0">
          <span>📴 Offline — orders &amp; stock save on this device; settings are locked</span>
        </div>
      )}
      {/* Keep-screen-on prompt — full-width shrink-0 bar in the app-shell (visible on the service screen, not
          buried). Shows only when the pref is on but the lock isn't held; the operator's first tap dismisses
          AND acquires it. */}
      <KeepAwakePrompt keepScreenOn={keepScreenOn} wakeState={wakeState} />
      {/* DEV-ONLY floating pills (render null in production) — force offline + inspect the live outbox. */}
      <DevOfflineToggle />
      <DevOutboxInspector />
      <DeviceSetupGate token={token} />
      {/* Header */}
      <AppHeader
        truckName={truck?.name ? (vanName ? `${truck.name} — ${vanName}` : truck.name) : null}
        truckLogoUrl={truck?.logo || null}
        subtitle={truck?.venue_name || undefined}
      >
        {pendingOrders.length>0&&<span className="bg-orange-500 text-white text-xs font-black px-2 py-0.5 rounded-full animate-pulse">{pendingOrders.length}</span>}
        {/* Sound toggle — per-device new-order ding. Enabling is a user gesture → prime the audio so
            subsequent dings play (the autoplay-unlock moment). */}
        <button onClick={()=>setSoundEnabled(v=>{const next=!v;if(next)primeAudio();return next})} className="hidden sm:flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500 select-none">
            {soundEnabled ? '🔔 Sound on' : '🔕 Sound off'}
          </span>
          <div className={`relative w-10 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${soundEnabled ? 'bg-green-500' : 'bg-slate-300'}`}>
            <div className={`absolute top-1 left-0 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${soundEnabled ? 'translate-x-5' : 'translate-x-1'}`} />
          </div>
        </button>
        {/* Screen toggle — desktop only (mobile → UserMenu). BINARY: green "Screen on" ONLY when the lock is
            actually HELD; grey "Screen off" otherwise. Failure is a toast on the tap, never a hedged label. */}
        <button onClick={toggleKeepScreenOn} title={screenHeld ? 'Screen will stay on' : 'Tap to keep the screen on'} className="hidden sm:flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500 select-none">{screenHeld ? 'Screen on' : 'Screen off'}</span>
          <div className={`relative w-10 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${screenHeld ? 'bg-green-500' : 'bg-slate-300'}`}>
            <div className={`absolute top-1 left-0 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${screenHeld ? 'translate-x-5' : 'translate-x-1'}`} />
          </div>
        </button>
        <UserMenu
          operatorName={currentUserName || currentUserFirstName || ''}
          userEmail={currentUserEmail}
          token={token}
          showScreenToggle
          showOrderUtilities
          showManageLink={userRole==='owner'||userRole==='manager'}
          isAdmin={isAdmin}
          keepScreenOn={screenHeld}
          onToggleScreenOn={toggleKeepScreenOn}
          soundEnabled={soundEnabled}
          onToggleSound={()=>setSoundEnabled(v=>{const next=!v;if(next)primeAudio();return next})}
          copiedOrderLink={copiedOrderLink}
          onCopyOrderLink={handleCopyOrderLink}
          onShowQR={handleShowQR}
          onOpenKDS={handleOpenKDS}
        />
      </AppHeader>

      {/* Tabs — bg-slate-900 must match HEADER_BG in lib/brand.ts.
          Non-scrolling `shrink-0` flex child of the h-dvh app-shell → stays locked on every tab/browser
          (incl. the iPad WKWebView, where position:sticky-against-body-scroll was unreliable). overflow-x-auto
          stays on the INNER row so the tab strip can still scroll horizontally on narrow widths. */}
      <div className="bg-slate-900 border-b border-slate-700 shrink-0 z-40">
        {/* Nav tabs row */}
        <div className="px-4 overflow-x-auto">
          <div className={"w-full min-[1400px]:max-w-5xl min-[1400px]:mx-auto flex items-center"}>
            {([['orders',(()=>{const c=activeEvent?pendingOrders.length:0;return`Orders${c>0?` (${c})`:''}`})()],['add','+ Add order'],['stock','Menu & Stock'],['settings','Settings']] as [typeof activeTab,string][]).map(([tab,label])=>(
              <button key={tab} onClick={()=>setActiveTab(tab)} className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab===tab?'border-orange-500 text-white':'border-transparent text-slate-400 hover:text-white'}`}>{label}</button>
            ))}
            {/* Utility actions — desktop only */}
            <div className="ml-auto hidden sm:flex items-center">
              <button onClick={handleCopyOrderLink} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 hover:text-white transition-colors whitespace-nowrap">
                {copiedOrderLink ? '✓ Copied' : 'Order link'}
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
              </button>
              <button onClick={handleShowQR} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 hover:text-white transition-colors whitespace-nowrap">
                QR code
              </button>
              <button onClick={handleOpenKDS} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-500 hover:text-white transition-colors whitespace-nowrap">
                Kitchen screen
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Event bar — Orders, Add Order, Menu & Stock, and Settings tabs (Settings has per-event toggles
          — offline protection, order-ready, kitchen capacity — that need the active-event context). */}
      {(activeTab==='orders'||activeTab==='add'||activeTab==='stock'||activeTab==='settings')&&(
        <div id="dashboard-event-bar" className="bg-slate-800 border-b border-slate-700 shrink-0 z-30 relative">
          <div className={"w-full min-[1400px]:max-w-5xl min-[1400px]:mx-auto px-4 py-2 flex items-center gap-2"}>
            {activeEvent?(
              <>
                <div className="flex-1 min-w-0">
                  <span className="block text-white text-sm font-medium truncate">
                    📍 {fmtVenue(activeEvent.venue_name,activeEvent.town)} · {formatTime(activeEvent.start_time)}–{formatTime(activeEvent.end_time)}
                  </span>
                  {activeEvent.event_date&&(
                    <span className="hidden sm:block text-xs font-medium text-slate-400 truncate mt-0.5">📅 {eventDateLabel(activeEvent.event_date)}</span>
                  )}
                </div>
                {/* "Change" button removed — event-switching lives in Event actions ▾ → "📅 Change event"
                    (redundant here on every viewport). The no-event "Select event" path below is unaffected. */}
                {paused?(
                  <span className="text-xs font-medium text-amber-400 flex-shrink-0">⏸ Paused</span>
                ):activeEvent.status==='open'?(
                  <span className="text-xs font-medium text-green-400 flex-shrink-0">● Live</span>
                ):activeEvent.status==='closed'?(
                  <span className="text-xs font-medium text-slate-400 flex-shrink-0">● Finished</span>
                ):activeEvent.status==='cancelled'?(
                  <span className="text-xs font-medium text-red-400 flex-shrink-0">Cancelled</span>
                ):(
                  // 'confirmed' (or any not-yet-started status) — NOT finished; pairs with Start Event.
                  <span className="text-xs font-medium text-slate-400 flex-shrink-0">Not started</span>
                )}
                {/* Labeled, obviously-tappable trigger for the event-level actions (pause / +30 / finish /
                    cancel / note) — names the menu so those actions are discoverable, not hidden behind ⋯. */}
                <button onClick={()=>{setEventNoteInput(activeEvent.customer_note||'');setShowEventMenu(true)}}
                  className="flex-shrink-0 text-xs font-semibold text-white bg-slate-700 border border-slate-500 hover:bg-slate-600 rounded px-2.5 py-1 transition-colors">
                  Event actions ▾
                </button>
              </>
            ):(
              <>
                <span className="text-slate-400 text-sm flex-1">No event selected</span>
                <button onClick={()=>{setPendingOpenEventPicker(true);setActiveTab('add')}}
                  className="text-xs text-slate-400 hover:text-white flex-shrink-0 px-2 py-1 rounded border border-slate-600 hover:border-slate-400 transition-colors">
                  Select event
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* The ONLY scroll container — flex-1 min-h-0 lets it fill the shell and scroll internally while the
          top bars above stay put. Add tab manages its own inner scroll (overflow-hidden here). */}
      <main className={`w-full min-[1400px]:max-w-5xl min-[1400px]:mx-auto flex-1 min-h-0 ${activeTab==='add'?'overflow-hidden px-4':'overflow-y-auto px-4 py-4 pb-20'}`}>

        {/* ORDERS TAB */}
        {activeTab==='orders'&&(
          <div>
            {!activeEvent?(
              <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-amber-500">⚠️</span>
                  <p className="text-sm font-medium text-amber-800">No event selected — select an event to view orders</p>
                </div>
                <button onClick={()=>{setPendingOpenEventPicker(true);setActiveTab('add')}}
                  className="text-sm font-semibold text-amber-700 border border-amber-300 bg-white rounded-lg px-3 py-1.5 hover:bg-amber-50 whitespace-nowrap">
                  Select event
                </button>
              </div>
            ):(
              <>
              {/* Day-load sidebar (desktop) sits right of the order list on lg+; the order
                  content stays in the flex-1 left column. Mobile renders the strip variant
                  inline below the summary (lg:hidden) — two presentations, one data source. */}
              <div className="lg:flex lg:gap-5 lg:items-start">
              {/* @container: the order-card grids below size their column count off THIS content column's
                  width (not the viewport), so iPad gets 3-across in both orientations and desktop stays 3. */}
              <div className="@container lg:flex-1 lg:min-w-0">
              {/* Prep time banner */}
            {showPrepTimeBanner&&(
              <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 mb-4 flex items-start gap-3">
                <span className="text-orange-500 text-lg flex-shrink-0">⚙️</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-orange-800">Set your prep times before going live</p>
                  <p className="text-xs text-orange-700 mt-0.5">Your menu is using default prep times. Update them in Manage so your kitchen doesn't get overwhelmed with orders.</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <AppLink href={`/manage/${token}`} className="text-xs font-medium text-orange-700 underline">Edit categories</AppLink>
                  <button onClick={()=>setShowPrepTimeBanner(false)} className="text-orange-400 hover:text-orange-600 text-lg leading-none">×</button>
                </div>
              </div>
            )}
            {/* Recently closed banner */}
            {recentlyClosed&&activeEvent&&(
              <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 mb-4 flex items-center justify-between">
                <span className="text-sm text-slate-600">Event finished · {activeEvent.venue_name} ended at {formatTime(activeEvent.end_time)}</span>
                <button onClick={()=>extendEvent(activeEvent.id,30)} className="text-sm font-medium text-teal-600 hover:text-teal-700">Extend 30 min</button>
              </div>
            )}
            {/* Mobile controls row REMOVED to reclaim vertical space (was: inline Add-extra-wait + Prep).
                "Add extra wait" now lives in the Event actions ▾ menu (below); Prep is mobile-dropped (the
                KDS covers live prep). Desktop/iPad are unchanged — they keep both inline in the right-hand
                stack beside the stat boxes (md:block extra-wait + Prep, below). Stat boxes stay on all sizes. */}
            {paused&&pauseUntilEffective&&(()=>{const minsLeft=Math.max(0,Math.round((new Date(pauseUntilEffective).getTime()-Date.now())/60000));const isIndefinite=new Date(pauseUntilEffective).getFullYear()>=2099;return<div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-3 text-center"><p className="text-red-700 font-black text-sm">⏸ Orders paused{pauseReason==='offline'?' (device offline)':''}{isIndefinite?'':(` — resuming in ~${minsLeft} min`)} · Customers can browse but not order</p>
              {/* Prominent inline Resume — one tap, no hunting in the ··· menu. Clears BOTH paused_until
                  and online_paused_until on the active event (set_paused resume). */}
              <button onClick={()=>{fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'set_paused',paused_until:null,eventId:activeEvent?.id})});markPending('pausedUntil',null);markPending('vanPausedUntil',null);setPausedUntil(null);setVanPausedUntil(null);setVanOnlinePausedUntil(null)}} className="mt-2 w-full sm:w-auto bg-red-600 text-white font-black text-sm px-6 py-2.5 rounded-xl hover:bg-red-700 transition-colors">▶ Resume orders</button>
              {pauseReason==='offline'&&<p className="text-red-500 text-xs mt-1.5">If your connection is unstable, orders may pause again.</p>}
            </div>})()}
            {waitMinutes>0&&!paused&&<div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 mb-3 text-center"><p className="text-orange-700 font-black text-sm">⏱ +{waitMinutes} min extra wait active</p></div>}
            <div className="flex flex-col sm:flex-row sm:items-center lg:items-start sm:justify-between mb-3">
              <div className="grid grid-cols-3 gap-2 mb-2 sm:mb-0 sm:flex-1">
                {[{label:'New',value:pendingOrders.length,colour:'text-orange-500'},{label:'Confirmed',value:confirmedOrders.length,colour:'text-green-600'},{label:'Done',value:otherOrders.length,colour:'text-slate-400'}].map(s=>(
                  <div key={s.label} className="bg-white rounded-xl p-2.5 text-center border border-slate-200 shadow-sm"><p className={`text-xl font-black ${s.colour}`}>{s.value}</p><p className="text-slate-500 text-[11px] font-medium mt-0.5">{s.label}</p></div>
                ))}
              </div>
              {/* Right-hand controls: on lg+ this becomes a stack with Add extra wait ABOVE Prep, beside
                  the stat boxes (the boxes flex-shrink to make room). On sm–lg it's just Prep (unchanged). */}
              <div className={"hidden sm:flex sm:flex-col gap-1.5 sm:ml-2 sm:shrink-0 md:w-40"}>
                <div className={'hidden md:block'}>{renderExtraWait('w-full')}</div>
                <button onClick={()=>setShowPrepList(p=>!p)} className={`font-bold text-xs px-2.5 py-2 rounded-xl transition-colors ${showPrepList?'bg-amber-100 text-amber-700':'bg-slate-100 text-slate-600 hover:bg-slate-200'}`} title="Today's prep list">📋 Prep</button>
              </div>
            </div>
            <div className="lg:hidden">
              <DayLoadStrip slots={displaySlots} eventDate={activeEvent?.event_date ?? null} variant="strip" />
            </div>
            {/* "To make" aggregate box removed (2026-06) — a cook-per-order truck doesn't work from a
                day-wide item total. getAllDayCounts is retained (still used by the completed-order
                summary line and the KDS all-day counts). */}
            {showPrepList&&(()=>{
              const todayStr=localTodayIso() // LOCAL date (s.7) — pairs with local order-time batching
              // "Start by" = collection slot − cook time, with NO extra grace buffer (the old +2min
              // padding made it read 11:53 for an 11:55 start, which confused operators). Removed.
              const BUFFER_SECS=0

              // Get all active orders with slots, sorted by slot time
              const slottedOrders=eventOrders
                .filter(o=>['pending','confirmed','modified'].includes(o.status)&&o.slot)
                .sort((a,b)=>a.slot!.localeCompare(b.slot!))

              // Find the NEXT slot that needs action (start cooking time <= now+5min)
              const currentBatch:typeof slottedOrders=[]
              const upcomingBatches:{id:string;slot:string;startBy:string;minsUntil:number;items:{label:string;qty:number}[];orderNotes:string[]}[]=[]

              // Process each order individually so same-slot orders appear as separate lines.
              // Keyed by order_key (UUID) — display id isn't unique across events.
              const slotGroups:Record<string,typeof slottedOrders>={}
              slottedOrders.forEach(o=>{slotGroups[o.order_key]=[o]})

              Object.entries(slotGroups).forEach(([orderId,slotOrders])=>{
                const slot=slotOrders[0].slot!
                const itemMap:Record<string,number>={}
                const displayItems:Record<string,{label:string;qty:number}>={}
                const addDisplayItem=(name:string,qty:number,mods:string[],note?:string)=>{
                  itemMap[name]=(itemMap[name]||0)+qty
                  const parts=[...mods];if(note)parts.push(`📝 ${note}`)
                  const label=`${name}${parts.length?` (${parts.join(', ')})`:''}`;if(!displayItems[label])displayItems[label]={label,qty:0};displayItems[label].qty+=qty
                }
                slotOrders.forEach(o=>{
                  o.items.forEach((i:any)=>addDisplayItem(i.name,i.quantity,(i.modifiers||[]).map((m:any)=>m.name),i.specialInstructions));
                  (o.deals||[]).forEach((d:any)=>Object.entries(d.slots||{}).forEach(([cat,itemName]:any)=>{
                    if(!itemName)return
                    const mods=((d.slotModifiers||{})[cat]||[]).map((m:any)=>m.name)
                    const note=(d.slotNotes||{})[cat]
                    addDisplayItem(itemName,1,mods,note)
                  }))
                })
                const orderNotes=slotOrders.flatMap(o=>(o.notes?[o.notes]:[]))
                // Calculate cook time for this slot's items
                const catGroups:Record<string,number>={}
                Object.entries(itemMap).forEach(([name,qty])=>{
                  const cat=truckMenu?.items.find(m=>m.name===name)?.category||'mains'
                  catGroups[cat]=(catGroups[cat]||0)+qty
                })
                let maxSecs=0
                Object.entries(catGroups).forEach(([cat,qty]:[string,number])=>{
                  const cfg=categoryConfigs[cat.toLowerCase()]??getCatConfig(cat)
                  const secs=catCookSecs(qty,cfg)
                  if(secs>maxSecs)maxSecs=secs
                })
                const totalSecs=maxSecs+BUFFER_SECS
                // Date-aware slot datetime (manual s.7: new Date(y,mo-1,d,h,m), never
                // time-of-day vs now) — an 11:30 slot TOMORROW must not compare as
                // 11:30 today, or future-event orders hit "Prep needed now" hours early
                const [slotH,slotM]=slot.split(':').map(Number)
                const orderEventDate=slotOrders[0].event_date
                const slotDt=orderEventDate
                  ?(()=>{const[y,mo,d]=orderEventDate.split('-').map(Number);return new Date(y,mo-1,d,slotH,slotM,0,0)})()
                  :(()=>{const t=new Date();t.setHours(slotH,slotM,0,0);return t})()
                const startDt=new Date(slotDt.getTime()-totalSecs*1000)
                const minsUntilStart=Math.floor((startDt.getTime()-Date.now())/60000)
                const startStr=`${String(startDt.getHours()).padStart(2,'0')}:${String(startDt.getMinutes()).padStart(2,'0')}`

                if(minsUntilStart<=2){
                  // Due now or within 2 mins — add to current batch
                  slotOrders.forEach(o=>currentBatch.push(o))
                } else {
                  upcomingBatches.push({id:orderId,slot,startBy:startStr,minsUntil:minsUntilStart,items:Object.values(displayItems),orderNotes})
                }
              })

              // Slotless (ASAP) orders: gate by DISTANCE like the slotted branch (Section 9
              // — a far-off order must NEVER show "prep needed now"). ASAP base = max(now,
              // eventStart) (Section 6); start cooking = base − this order's cook time, so
              // startBy = max(now, eventStart − cookTime). A future/not-yet-started event →
              // start is in the future → "Coming up", not the current batch. Event start is
              // parsed LOCAL from event_date + start_time (Section 7), never from now.
              const asapEventStart=activeEvent?.start_time||null
              eventOrders
                .filter(o=>['pending','confirmed','modified'].includes(o.status)&&!o.slot)
                .forEach(o=>{
                  // Per-order display items + cook time (mirrors the slotted branch above)
                  const itemMap:Record<string,number>={}
                  const displayItems:Record<string,{label:string;qty:number}>={}
                  const addDisplayItem=(name:string,qty:number,mods:string[],note?:string)=>{
                    itemMap[name]=(itemMap[name]||0)+qty
                    const parts=[...mods];if(note)parts.push(`📝 ${note}`)
                    const label=`${name}${parts.length?` (${parts.join(', ')})`:''}`;if(!displayItems[label])displayItems[label]={label,qty:0};displayItems[label].qty+=qty
                  }
                  o.items.forEach((i:any)=>addDisplayItem(i.name,i.quantity,(i.modifiers||[]).map((m:any)=>m.name),i.specialInstructions));
                  (o.deals||[]).forEach((d:any)=>Object.entries(d.slots||{}).forEach(([cat,itemName]:any)=>{
                    if(!itemName)return
                    const mods=((d.slotModifiers||{})[cat]||[]).map((m:any)=>m.name)
                    const note=(d.slotNotes||{})[cat]
                    addDisplayItem(itemName,1,mods,note)
                  }))
                  const orderNotes=o.notes?[o.notes]:[]
                  const catGroups:Record<string,number>={}
                  Object.entries(itemMap).forEach(([name,qty])=>{
                    const cat=truckMenu?.items.find(m=>m.name===name)?.category||'mains'
                    catGroups[cat]=(catGroups[cat]||0)+qty
                  })
                  let maxSecs=0
                  Object.entries(catGroups).forEach(([cat,qty]:[string,number])=>{
                    const cfg=categoryConfigs[cat.toLowerCase()]??getCatConfig(cat)
                    const secs=catCookSecs(qty,cfg)
                    if(secs>maxSecs)maxSecs=secs
                  })
                  const totalSecs=maxSecs+BUFFER_SECS
                  const odate=o.event_date
                  const eventStartMs=(odate&&asapEventStart)
                    ?(()=>{const[y,mo,d]=odate.split('-').map(Number);const[sh,sm]=asapEventStart.split(':').map(Number);return new Date(y,mo-1,d,sh,sm,0,0).getTime()})()
                    :null
                  if(eventStartMs===null){
                    // No event start time (walk-up / no schedule): preserve prior behaviour
                    // — today/past is due now; a future-dated order is never "prep now".
                    if(!odate||odate<=todayStr) currentBatch.push(o)
                    return
                  }
                  const startMs=Math.max(Date.now(),eventStartMs-totalSecs*1000)
                  const minsUntilStart=Math.floor((startMs-Date.now())/60000)
                  if(minsUntilStart<=2){
                    currentBatch.push(o)
                  } else {
                    const fmt=(ms:number)=>{const dt=new Date(ms);return`${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`}
                    upcomingBatches.push({id:o.order_key,slot:`ASAP ~${fmt(startMs+totalSecs*1000)}`,startBy:fmt(startMs),minsUntil:minsUntilStart,items:Object.values(displayItems),orderNotes})
                  }
                })

              // Build current prep map
              // Build ordered list of units in insertion order across orders, then by item position
              // Sort orders by slot then CREATION ORDER (first placed first — same fairness as the
              // order lists; not id.localeCompare, which mis-ranks "10" before "2" and ignores placement)
              const sortedBatch=[...currentBatch].sort((a,b)=>{
                const aSlot=a.slot?parseInt(a.slot.replace(':','')):99999
                const bSlot=b.slot?parseInt(b.slot.replace(':','')):99999
                if(aSlot!==bSlot) return aSlot-bSlot
                return new Date(a.created_at).getTime()-new Date(b.created_at).getTime()
              })
              type PrepUnit={name:string;orderId:string;unitIdx:number;cat:string;modLabel:string}
              const allUnits:PrepUnit[]=[]
              sortedBatch.forEach(o=>{
                // Monotonic unitIdx per (order,name) so the pillKey stays unique across
                // BOTH standalone items AND deal constituents that repeat a name (e.g.
                // "Dinner 2 pizzas" = 2× the same pizza) — otherwise pills collide / double-strike.
                const nextIdx:Record<string,number>={}
                const pushUnit=(name:string,cat:string,modLabel:string)=>{
                  const k=`${o.order_key}:${name}`
                  const unitIdx=nextIdx[k]=(nextIdx[k]??-1)+1
                  allUnits.push({name,orderId:o.order_key,unitIdx,cat,modLabel})
                }
                o.items.forEach(item=>{
                  const cat=truckMenu?.items.find(m=>m.name===item.name)?.category||''
                  const parts=(item.modifiers||[]).map((m:any)=>m.name)
                  if(item.specialInstructions)parts.push(`📝 ${item.specialInstructions}`)
                  const modLabel=parts.length?` (${parts.join(', ')})`:''
                  for(let u=0;u<item.quantity;u++) pushUnit(item.name,cat,modLabel)
                })
                // Deal constituents count as cookable units exactly like standalone items
                // (same deal.slots iteration displayItems/getAllDayCounts use). Category comes
                // from the item's own category, so instant constituents (e.g. drinks) fall to
                // Assembly via the kitchen-vs-assembly split below — no deal special-casing.
                ;(o.deals||[]).forEach((d:any)=>Object.entries(d.slots||{}).forEach(([slotKey,itemName]:any)=>{
                  if(!itemName)return
                  const cat=truckMenu?.items.find(m=>m.name===String(itemName))?.category||''
                  const parts=((d.slotModifiers||{})[slotKey]||[]).map((m:any)=>m.name)
                  const note=(d.slotNotes||{})[slotKey]
                  if(note)parts.push(`📝 ${note}`)
                  const modLabel=parts.length?` (${parts.join(', ')})`:''
                  pushUnit(String(itemName),cat,modLabel)
                }))
              })
              // Split into kitchen vs assembly preserving order.
              // Use DB-loaded categoryConfigs — getCategoryTime always returns 0 since
              // prep config moved to the DB, which silently put everything in Assembly.
              const kitchenUnits=allUnits.filter(u=>(categoryConfigs[u.cat.toLowerCase()]?.secs??0)>0)
              const assemblyUnits=allUnits.filter(u=>(categoryConfigs[u.cat.toLowerCase()]?.secs??0)===0)

              return(
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-black text-amber-700 uppercase tracking-wide">📋 Prep needed now</p>
                    <button onClick={()=>setShowPrepList(false)} className="text-amber-400 hover:text-amber-700 text-sm font-bold">×</button>
                  </div>

                  {allUnits.length===0?(
                    <p className="text-amber-600 text-sm">Nothing to prep right now</p>
                  ):(
                    <div className="space-y-1.5 mb-2">
                      {kitchenUnits.length>0&&(
                        <div>
                          <p className="text-[10px] font-black text-amber-600 uppercase tracking-wide mb-1">🔥 Kitchen — start now (in order)</p>
                          <div className="flex flex-wrap gap-1.5">
                            {kitchenUnits.map((u,idx)=>{
                              const pillKey=`${u.orderId}:${u.name}:${u.unitIdx}`
                              const struck=struckPrep.has(pillKey)
                              const ding=()=>{try{const ctx=new((window as any).AudioContext||(window as any).webkitAudioContext)();const o=ctx.createOscillator();const g=ctx.createGain();o.connect(g);g.connect(ctx.destination);o.frequency.value=660;g.gain.setValueAtTime(0.2,ctx.currentTime);g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.3);o.start(ctx.currentTime);o.stop(ctx.currentTime+0.3)}catch{}}
                              return(
                                <button key={pillKey}
                                  onClick={()=>{
                                    if(struck){
                                      setStruckPrep(prev=>{const n=new Set(prev);n.delete(pillKey);return n})
                                      setUndoPrep(null)
                                    } else {
                                      setStruckPrep(prev=>{const n=new Set(prev);n.add(pillKey);return n})
                                      setUndoPrep({name:u.name,qty:1})
                                      setTimeout(()=>setUndoPrep(null),5000)
                                      ding()
                                    }
                                  }}
                                  className={`font-black text-sm px-2.5 py-1 rounded-lg border transition-all active:scale-95 ${struck?'bg-slate-100 border-slate-200 text-slate-400 line-through opacity-50':'bg-white border-amber-200 text-slate-900 hover:border-amber-400'}`}>
                                  {u.name}{u.modLabel}{struck?' ✓':''}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}
                      {assemblyUnits.length>0&&(
                        <div>
                          <p className="text-[10px] font-black text-amber-600 uppercase tracking-wide mb-1">🥤 Assembly</p>
                          <div className="flex flex-wrap gap-1.5">
                            {assemblyUnits.map((u,idx)=>{
                              const pillKey=`${u.orderId}:${u.name}:${u.unitIdx}`
                              const struck=struckPrep.has(pillKey)
                              return(
                                <button key={pillKey}
                                  onClick={()=>{
                                    if(struck){
                                      setStruckPrep(prev=>{const n=new Set(prev);n.delete(pillKey);return n})
                                      setUndoPrep(null)
                                    } else {
                                      setStruckPrep(prev=>{const n=new Set(prev);n.add(pillKey);return n})
                                      setUndoPrep({name:u.name,qty:1})
                                      setTimeout(()=>setUndoPrep(null),5000)
                                    }
                                  }}
                                  className={`font-bold text-sm px-2.5 py-1 rounded-lg border transition-all active:scale-95 ${struck?'bg-slate-100 border-slate-200 text-slate-400 line-through opacity-50':'bg-white border-amber-200 text-slate-900 hover:border-amber-400'}`}>
                                  {u.name}{u.modLabel}{struck?' ✓':''}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Upcoming batches — countdown timers */}
                  {upcomingBatches.length>0&&(
                    <div className="border-t border-amber-200 pt-2 mt-1 space-y-1">
                      <p className="text-[10px] font-black text-amber-500 uppercase tracking-wide">Coming up</p>
                      {upcomingBatches.map(b=>(
                        <div key={b.id} className="flex items-center justify-between text-xs">
                          <span className="text-amber-700 font-bold">
                            {b.items.map(item=>`${item.qty}× ${item.label}`).join(', ')}{b.orderNotes.length>0&&` · 📝 ${b.orderNotes.join(' · ')}`}
                          </span>
                          <span className="text-amber-600 font-black ml-2 shrink-0">
                            Start by {b.startBy} · {b.minsUntil>=120?`in ${Math.round(b.minsUntil/60)}h`:`${b.minsUntil}min`}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}

            {pendingOrders.length>0&&(
              <div className="mb-4">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">New — action needed</p>
                <div className="grid grid-cols-1 @md:grid-cols-2 @2xl:grid-cols-3 gap-3">{pendingOrders.map(o=><OrderCard key={o.order_key} order={o} truck={truck} event={activeEvent} slots={slots} actionLoading={actionLoading} onAction={doAction} onEdit={startEdit} categoryOrder={categoryOrder} itemCategoryMap={itemCategoryMap} catConfigs={catConfigs} kdsMode={truck?.kds_mode??false} showCookingStep={showCookingStep} effectiveOrderReady={effectiveOrderReady}/>)}</div>
              </div>
            )}
            {confirmedOrders.length>0&&(
              <div className="mb-4">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Confirmed</p>
                <div className="grid grid-cols-1 @md:grid-cols-2 @2xl:grid-cols-3 gap-3">{confirmedOrders.map(o=><OrderCard key={o.order_key} order={o} truck={truck} event={activeEvent} slots={slots} actionLoading={actionLoading} onAction={doAction} onEdit={startEdit} categoryOrder={categoryOrder} itemCategoryMap={itemCategoryMap} catConfigs={catConfigs} kdsMode={truck?.kds_mode??false} showCookingStep={showCookingStep} effectiveOrderReady={effectiveOrderReady}/>)}</div>
              </div>
            )}
            {otherOrders.length>0&&(
              <div className="mb-4">
                {/* In-place expander (V6.1 unified arrow) — the ONE control for the completed
                    list, sitting directly above it so cause and effect are visible. */}
                <button onClick={()=>setShowCompleted(c=>!c)} className="w-full flex items-center justify-between gap-2 py-2 text-left">
                  <span className="flex items-center gap-2 text-sm font-bold text-slate-700">
                    <span className={`transition-transform inline-block text-slate-400 text-xs ${showCompleted?'rotate-90':''}`}>▶</span>
                    Completed &amp; cancelled ({otherOrders.length})
                  </span>
                  <span className="text-xs text-slate-500 shrink-0">{otherOrders.length-cancelledCount} done{cancelledCount>0?` · ${cancelledCount} cancelled`:''}</span>
                </button>
                {showCompleted&&(
                <div className="space-y-2 mt-1">
                  {otherOrders.map(o=>(
                    <div key={o.order_key} className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-slate-700 text-sm">#{o.id}</span>
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${STATUS[o.status]?.bg||'bg-slate-100'} ${STATUS[o.status]?.text||'text-slate-500'}`}>{STATUS[o.status]?.label||o.status}</span>
                          {o.slot&&<span className="text-xs text-slate-700">🕐 {o.slot}</span>}
                        </div>
                        <p className="text-slate-500 text-xs mt-0.5 truncate">{o.customer_name} · {Object.entries(getAllDayCounts([o])).map(([name,qty])=>`${qty}× ${name}`).join(', ')}</p>
                        {o.notes&&<p className="text-orange-500 text-xs truncate">📝 {o.notes}</p>}
                      </div>
                      <div className="shrink-0 ml-3 flex items-center gap-2">
                        {/* Later-recovery Undo — collected orders only (not cancelled/rejected). Reuses
                            the same undo_collected action as the toast: reverts ONE stage to the actual
                            previous status (ready/confirmed) + rebuilds capacity. */}
                        {o.status==='collected'&&(
                          <button onClick={()=>doAction('undo_collected',o.order_key)} disabled={actionLoading===`undo_collected-${o.order_key}`}
                            className="text-xs font-bold text-slate-500 hover:text-orange-600 border border-slate-200 hover:border-orange-300 rounded-lg px-3 py-2 transition-colors active:scale-95 disabled:opacity-50">
                            ↩ Undo
                          </button>
                        )}
                        <span className="font-black text-slate-600 text-sm">£{Number(o.total).toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
                )}
              </div>
            )}
            {pendingOrders.length===0&&confirmedOrders.length===0&&(
              <div className="text-center py-16">
                <p className="text-4xl mb-3">{truck?.truck_emoji || '🍕'}</p>
                <p className="text-slate-500 font-medium">{orders.length===0?'No orders yet today':'All orders complete!'}</p>
                <p className="text-slate-300 text-xs mt-3">Updated {lastRefresh.toLocaleTimeString()}</p>
              </div>
            )}
              </div>
              {/* Sticks within <main>'s own scroll now (bars live outside main) → offset is 0, not the old
                  120px body-scroll offset. */}
              <aside className="hidden lg:block lg:w-48 lg:flex-shrink-0 lg:sticky lg:top-0">
                <DayLoadStrip slots={displaySlots} eventDate={activeEvent?.event_date ?? null} variant="sidebar" />
              </aside>
              </div>
              </>
            )}
          </div>
        )}

        {/* ADD ORDER TAB — always mounted (manual s.22): basket state lives inside
            AddOrderPanel and must survive tab switches. Hidden via CSS, never unmounted. */}
        {truck&&(
          <div className={activeTab==='add'?'h-full min-h-0 flex flex-col':'hidden'}>
          <AddOrderPanel
            isActive={activeTab==='add'}
            truck={truck}
            truckMenu={truckMenu}
            menuGroups={menuGroups}
            itemStocks={itemStocks}
            categoryStocks={categoryStocks}
            categoryConfigs={categoryConfigs}
            categoryAllowNotes={categoryAllowNotes}
            orders={orders}
            waitMinutes={waitMinutes}
            token={token}
            pin={pin}
            todayEvent={activeEvent}
            categoryOrder={categoryOrder}
            itemCategoryMap={itemCategoryMap}
            showToast={showToast}
            onOrderPlaced={(optimistic?:Order)=>{if(optimistic){setDeviceQueuedOrders(p=>[optimistic,...p])}else{fetchAll()}setActiveTab('orders')}}
            onOpenEvent={openEvent}
            requestEventPickerOpen={pendingOpenEventPicker}
            onEventPickerOpened={()=>setPendingOpenEventPicker(false)}
            controlledEvent={activeEvent}
            isOffline={isOffline}
            isEventLoaded={(id)=>loadedEventIds.has(id)}
            onEventChange={(id)=>{
              // EVENT-SWITCH GATE backstop: never switch to a never-loaded event offline (the picker also
              // greys/blocks these). Online → always allowed. Current event is always in loadedEventIds.
              if(isOffline&&!loadedEventIds.has(id)){showToast('Reconnect to load this event','error');return}
              setSelectedEventId(id)
            }}
          />
          </div>
        )}


        {/* SETTINGS TAB (setup-time config: printing, auto-accept, offline protection, order-ready
            notifications, kitchen capacity). The service-time Menu & Stock list renders in its own block
            below. Sections relocated VERBATIM from the old Menu & Stock tab — no behaviour change. */}
        {activeTab==='settings'&&(
          <div className="space-y-4">
            {/* SETTINGS-LOCK notice — the server-backed settings below are disabled offline (they'd fail
                silently / desync the engine). The device-local Printer + Notifications cards (moved to the
                BOTTOM of this tab) stay editable offline. */}
            {isOffline&&(
              <div className="bg-slate-100 border border-slate-200 rounded-2xl p-3 text-sm text-slate-600 flex items-center gap-2">
                <span aria-hidden>📴</span>
                <span>You&apos;re offline — reconnect to change these settings. (Printer &amp; notification settings still work offline.)</span>
              </div>
            )}
            {/* Auto-accept + its dependent "review notes" sub-option read as ONE group (divide-y rows, same
                treatment as the Sounds card). Notes-review only applies when auto-accept is on (conditional). */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 divide-y divide-slate-100">
              <div className={`flex items-center justify-between ${autoAccept?'pb-3':''}`}>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Auto-accept orders</p>
                  <p className="text-slate-500 text-xs mt-0.5">Orders confirm automatically. If the requested slot is full, the order bumps to the next available slot. Only confirms when there is capacity.</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  {savingAutoAccept&&<span className="text-xs text-slate-400 animate-pulse">Saving…</span>}
                  <Toggle on={autoAccept} onToggle={()=>saveAutoAccept(!autoAccept)} disabled={isOffline}/>
                </div>
              </div>
              {/* DIRECT polarity: ON = notes_require_review = hold NOTED orders for review. Default ON.
                  pl-4 indents it as a CHILD of auto-accept (only enabled when auto-accept is on). */}
              {autoAccept&&(
                <div className="pt-3 pl-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Review orders with notes before accepting</p>
                    <p className="text-slate-500 text-xs mt-0.5">When on, an order with a customer note (e.g. an allergy) waits for you to read and accept instead of auto-confirming. Recommended on.</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {savingNotesReview&&<span className="text-xs text-slate-400 animate-pulse">Saving…</span>}
                    <Toggle on={notesRequireReview} onToggle={()=>saveNotesRequireReview(!notesRequireReview)} disabled={isOffline}/>
                  </div>
                </div>
              )}
            </div>
            {/* SOUNDS — same trucks.sound_config as Manage → Settings (mirrors automatically). Which alerts
                fire; the on/off MASTER is the per-device header toggle. */}
            {(()=>{
              const sc=truck?.sound_config??DEFAULT_SOUND_CONFIG
              return (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 divide-y divide-slate-100">
                  <div className="pb-3">
                    <p className="text-sm font-semibold text-slate-800">Sounds</p>
                    <p className="text-slate-500 text-xs mt-0.5">The on/off switch is on each screen; every device controls its own sound.</p>
                  </div>
                  <div className="py-3">
                    <p className="text-sm font-semibold text-slate-800 mb-1.5">New order sound</p>
                    <div className="space-y-1">
                      {([['needs_confirming','Only orders needing confirming'],['all','All new orders']] as const).map(([val,label])=>(
                        <button key={val} onClick={()=>!isOffline&&saveSoundConfig({...sc,new_orders:val})} disabled={isOffline} className="flex items-center gap-2.5 w-full text-left py-1 disabled:opacity-50">
                          <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${sc.new_orders===val?'border-orange-500':'border-slate-300'}`}>{sc.new_orders===val&&<span className="w-2 h-2 rounded-full bg-orange-500"/>}</span>
                          <span className="text-sm text-slate-700">{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">Sound when an order is due to be cooked</p>
                      <p className="text-slate-500 text-xs mt-0.5">Sounds when a ticket turns amber.</p>
                    </div>
                    <Toggle on={sc.order_due} onToggle={()=>saveSoundConfig({...sc,order_due:!sc.order_due})} disabled={isOffline}/>
                  </div>
                </div>
              )
            })()}
            {activeEvent&&(
              <div className="flex items-start justify-between gap-4 p-4 bg-white rounded-2xl shadow-sm border border-slate-200">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">Offline protection</p>
                  <p className="text-xs text-slate-500 mt-0.5">{OFFLINE_PROTECTION_CARD_DESCRIPTION}</p>
                  <p className="text-xs text-amber-600 mt-1">⚠️ <strong>{OFFLINE_PROTECTION_EXPLAINER_LEAD}</strong> {OFFLINE_PROTECTION_EXPLAINER_BODY}</p>
                </div>
                <Toggle on={effectiveOfflineProtection} onToggle={()=>toggleOfflineProtection(!effectiveOfflineProtection)} disabled={isOffline}/>
              </div>
            )}
            {/* Order-ready notifications — PER-EVENT on/off (MASTER-SWITCH model: every event has a concrete
                order_ready_override, seeded from the Settings default at creation + bulk-set when the Settings
                master switch flips). Writes order_ready_override=true|false (never null). Gates the orders-screen
                Ready button (effectiveOrderReady) — NOT the email (model A). Shared <Toggle> for size/colour
                consistency with Offline protection / Auto-accept above. */}
            {activeEvent&&(
              <div className="flex items-start justify-between gap-4 p-4 bg-white rounded-2xl shadow-sm border border-slate-200">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">Order-ready notifications</p>
                  <p className="text-xs text-slate-500 mt-0.5">Show a &ldquo;Mark ready&rdquo; button on the orders screen and notify customers by email when their order is ready.</p>
                </div>
                <Toggle on={effectiveOrderReady} onToggle={()=>setOrderReadyOverride(!effectiveOrderReady)} disabled={isOffline}/>
              </div>
            )}
            {/* The offline-pause alert ALWAYS fires (the per-device suppression toggle was removed) —
                an operator must never be able to silence "your orders were paused while you were away".
                The per-event ack still prevents re-firing for the same pause. */}
            {/* Kitchen capacity — its own card now (was nested in Stock & availability). Event-scoped
                ceiling + category scope; the control's bold "Kitchen capacity" label doubles as the
                card heading. One tight, left-aligned unit (max-w stops it stretching on the wide
                dashboard); mirrors Settings. Reads/writes via service-role /api/dashboard +
                update_van_settings (Section 10). Behaviour unchanged. */}
            {activeEvent&&(
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
                <div>
                  <p className="text-sm font-semibold text-slate-800 tracking-wide mb-3">Kitchen capacity</p>
                  {/* Items(batch) / Prep / capacity-membership AND the Total-capacity ceiling — aligned
                      to ONE shared 4-column template (V7.8 §42): CATEGORY · ITEMS · PREP · COUNTS TO
                      TOTAL CAPACITY. The category grid and the Total-capacity grid use the SAME
                      grid-template-columns (same container ⇒ identical widths) so the ceiling row lines
                      up under the category rows. ALL writes unchanged: updateCategoryField
                      (prep_secs/batch_size), toggleCatCapacityDash (counts_toward_capacity),
                      saveKitchenCapacity, saveCapacityWindow. Cooking cats (prep>0) lock-checked; instant
                      cats toggle once a capacity is set. PrepTimeSelect + off-grid preservation unchanged.
                      The window select stays PLAIN MINUTES (capacity window ≠ a prep time). */}
                  {truckMenu?.categories&&truckMenu.categories.length>0&&(
                    <div className={`${KITCHEN_CAPACITY_GRID} gap-y-2 items-center`}>
                      <span className="min-w-0 truncate text-[11px] font-bold uppercase tracking-wide text-slate-400">Category</span>
                      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Items</span>
                      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Prep</span>
                      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400 text-center leading-tight" title="Which categories count toward the total capacity. Cooked categories always count; tick instant ones (sides, dips, drinks) to include them.">Counts to total capacity</span>
                      {truckMenu.categories.map(catObj=>{
                        const hasCap=kitchenCapacity!=null
                        const locked=(catObj.prep_secs??0)>0
                        const capDisabled=locked||!hasCap||!activeEvent.van_id||isOffline
                        return(
                          <Fragment key={catObj.id??catObj.name}>
                            <span className="min-w-0 truncate text-slate-700 font-medium text-sm">{catObj.name}</span>
                            {/* ITEMS = batch_size — shared <BatchSizeSelect> atom (∞ + 1..20 + off-grid).
                                ∞ = no batch limit (null), unchanged write (updateCategoryField 'batch_size'). */}
                            <BatchSizeSelect
                              ariaLabel={`${catObj.name} items per batch`}
                              disabled={isOffline}
                              valueSize={catObj.batch_size}
                              onChange={val=>{setTruckMenu(prev=>prev?{...prev,categories:prev.categories?.map(c=>c.id===catObj.id?{...c,batch_size:val??undefined}:c)}:prev);updateCategoryField(catObj.id??'','batch_size',val)}}
                              className="w-full border border-slate-200 rounded-lg px-2 py-1 text-slate-700 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400" />
                            <PrepTimeSelect
                              valueSecs={catObj.prep_secs}
                              disabled={isOffline}
                              ariaLabel={`${catObj.name} prep time`}
                              onChange={secs=>{setTruckMenu(prev=>prev?{...prev,categories:prev.categories?.map(c=>c.id===catObj.id?{...c,prep_secs:secs}:c)}:prev);updateCategoryField(catObj.id??'','prep_secs',secs)}}
                              className="w-full border border-slate-200 rounded-lg px-2 py-1 text-slate-700 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"/>
                            <label className={`flex items-center justify-center ${capDisabled?'cursor-not-allowed':'cursor-pointer'}`}
                              title={locked
                                ? 'Cooked — always counts (its prep & batch set the pace)'
                                : !hasCap ? 'Set a capacity to choose which categories count'
                                : 'Tick to include this instant category (sides, dips, drinks) in the shared per-window limit'}>
                              <input type="checkbox"
                                checked={locked?true:!!catObj.counts_toward_capacity}
                                disabled={capDisabled}
                                onChange={()=>{if(!locked&&hasCap&&catObj.id)toggleCatCapacityDash(catObj.id,!catObj.counts_toward_capacity)}}
                                className="w-4 h-4 accent-orange-600 cursor-pointer disabled:cursor-not-allowed"/>
                            </label>
                          </Fragment>
                        )
                      })}
                    </div>
                  )}
                  {/* Total-capacity ceiling — SAME column template ⇒ aligns under the categories.
                      ITEMS column holds the kitchen_capacity ceiling, PREP column holds the WINDOW
                      (plain whole minutes — NOT PrepTimeSelect; the engine reads capacity_window_mins
                      as minutes). Same saveKitchenCapacity / saveCapacityWindow writes. */}
                  <div className={`${KITCHEN_CAPACITY_GRID} items-center ${truckMenu?.categories&&truckMenu.categories.length>0?'mt-2 pt-2.5 border-t border-slate-100':''}`}>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm font-semibold text-slate-800">Total capacity</span>
                      {activeEvent.van_id&&activeVanName&&(
                        <span className="text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-200 rounded px-1.5 py-0.5 flex-shrink-0">🚐 {activeVanName}</span>
                      )}
                    </div>
                    <select
                      value={kitchenCapacity??''}
                      aria-label="Total capacity (items)"
                      disabled={!activeEvent.van_id||isOffline}
                      onChange={e=>saveKitchenCapacity(e.target.value===''?null:parseInt(e.target.value))}
                      className="w-full border border-slate-200 rounded-lg px-2 py-1 text-slate-700 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50">
                      <option value="">∞</option>
                      {Array.from({length:20},(_,i)=>i+1).map(n=>(
                        <option key={n} value={n}>{n} item{n!==1?'s':''}</option>
                      ))}
                    </select>
                    <select
                      value={capacityWindowMins}
                      aria-label="Capacity window (minutes)"
                      disabled={!activeEvent.van_id||kitchenCapacity==null||isOffline}
                      onChange={e=>saveCapacityWindow(parseInt(e.target.value))}
                      className="w-full border border-slate-200 rounded-lg px-2 py-1 text-slate-700 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50">
                      {Array.from({length:20},(_,i)=>i+1).concat((capacityWindowMins>20)?[capacityWindowMins]:[]).map(n=>(
                        <option key={n} value={n}>every {formatPrepSecs(n*60)}</option>
                      ))}
                    </select>
                    <span/>
                  </div>
                  {!activeEvent.van_id&&(
                    <p className="text-xs text-amber-600 font-medium mt-1.5">⚠ Assign a truck to this event before setting kitchen capacity.</p>
                  )}
                  {/* The per-category "Counts" tick boxes now live in the grid above (one aligned column). */}
                  {kitchenCapacity==null&&activeEvent.van_id&&truckMenu?.categories&&truckMenu.categories.length>0&&(
                    <p className="text-xs text-slate-400 mt-1.5">Set a capacity to choose which categories count.</p>
                  )}
                  {kitchenCapacityNeedsPrepWarning(kitchenCapacity, truckMenu?.categories)&&(
                    <div className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{KITCHEN_CAPACITY_WARNING}</div>
                  )}
                  <p className="text-xs text-slate-400 mt-2">{KITCHEN_CAPACITY_DESC}</p>
                  <p className="text-xs text-slate-400 mt-1">{KITCHEN_CAPACITY_EXAMPLE}</p>
                </div>
              </div>
            )}
            {/* Device-specific iPad-only cards LAST — both render null on web / non-native, so mobile & desktop
                show none of this block and the SHARED settings above (auto-accept → offline protection →
                order-ready → kitchen capacity) sit in the same relative order on every surface. Kitchen ticket
                printing: iPad-native + Max-gated inside the component. Notifications: iPad-native, device-local. */}
            {truck&&<PrintingSettings plan={truck.plan} featureOverrides={truck.feature_overrides} trialExpiresAt={truck.trial_expires_at}/>}
            <NotificationSettings token={token}/>
          </div>
        )}

        {/* MENU & STOCK TAB (service-time: per-event stock + availability operators adjust mid-service) */}
        {activeTab==='stock'&&(
          <div className="space-y-4">
            {/* Stock is EDITABLE offline (unlike Settings, which lock) — changes are optimistic + durably
                queued and reconcile on reconnect. Distinct affordance so the operator knows it's safe to edit. */}
            {isOffline&&(
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-sm text-amber-800 flex items-center gap-2">
                <span aria-hidden>📴</span>
                <span>You&apos;re offline — stock changes are saved on this device and will sync when you reconnect.</span>
              </div>
            )}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-800 tracking-wide mb-1">Items — this event</p>
              <p className="text-slate-500 text-xs mb-4">Category totals, item limits and availability for the selected event — these reset each event. Changes take effect immediately.</p>
              {truckMenu&&stockLoading?(
                // This event's stock hasn't resolved yet (never-viewed) — skeleton, NOT empty/stale rows.
                <div className="space-y-2 animate-pulse">
                  {[0,1,2,3].map(i=><div key={i} className="h-10 bg-slate-100 rounded-xl" />)}
                </div>
              ):truckMenu?(
                <>
                {/* Column headers — line up with the fixed LIMIT (w-16) + AVAILABLE (w-12) columns on every
                    row below; pr-2 matches the item rows' p-2 right inset so each label sits over its column. */}
                <div className="flex items-center gap-2 pr-2 mb-2">
                  <span className="flex-1" />
                  <span className="w-16 text-center text-[10px] font-black uppercase tracking-wide text-slate-400">Item limit</span>
                  <span className="w-12 text-center text-[10px] font-black uppercase tracking-wide text-slate-400">Available</span>
                </div>
                <div className="space-y-5">
                  {Object.entries(menuGroups).map(([cat,items])=>{
                    const catStock=categoryStocks.find(s=>s.category===cat)
                    const catDefStock=truckMenu?.categories?.find(c=>c.name.toLowerCase()===cat.toLowerCase())?.default_stock??null
                    const catCount=catStock?.stock_count??catDefStock??null; const catOrdered=activeEvent?((catStock?.orders_count??0)+(offlineConsumedByCat.get(cat)??0)):0
                    const isCatDefault=catStock?.stock_count==null&&catDefStock!=null
                    const catRem=catCount!==null?catCount-catOrdered:null
                    const catObj=truckMenu?.categories?.find(c=>c.name.toLowerCase()===cat.toLowerCase())
                    // Category OFF this event → its item rows follow visibly: dimmed + inputs/toggle disabled.
                    // DISPLAY/input-disable ONLY — each item's stored state is untouched (GATE), so reopening
                    // the category restores exactly what was there.
                    const catClosed=catStock?.available===false
                    return(
                      <div key={cat}>
                        {/* Mobile: two lines. Desktop: one line via hidden sm:flex */}
                        <div className="mb-2 pb-2 border-b border-slate-100">
                          {/* Line 1 (mobile) / full row (desktop) */}
                          <div className="flex items-center gap-2 pr-2">
                            <p className="text-sm font-black text-orange-600 uppercase tracking-wide flex-1">{cat.charAt(0).toUpperCase()+cat.slice(1)}{catOrdered>0&&<span className="ml-1.5 text-sm font-medium normal-case tracking-normal text-slate-500">({catOrdered} sold)</span>}{catRem!==null&&<span className={`ml-1.5 text-xs font-bold normal-case tracking-normal ${catRem<=5?'text-orange-500':'text-slate-500'}`}>{catRem} left</span>}{catStock?.available===false&&<span className="ml-1.5 text-[10px] font-black text-red-500 bg-red-100 px-1.5 py-0.5 rounded-full normal-case tracking-normal">CLOSED</span>}</p>
                            {/* Prep & batch moved to the "Total capacity" section (V7.8 §42) — this card is per-event STOCK only. */}
                            <div className="flex items-center gap-2">
                              <div className="flex flex-col items-center gap-0.5 w-16 shrink-0">
                                <input type="number" inputMode="numeric" min="0" placeholder="∞"
                                  value={catStockDrafts[cat] ?? (catCount??'').toString()}
                                  onFocus={()=>setCatStockDrafts(d=>({...d,[cat]:(catCount??'').toString()}))}
                                  onChange={e=>setCatStockDrafts(d=>({...d,[cat]:e.target.value}))}
                                  onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();else if(e.key==='Escape'){skipStockBlurRef.current=true;e.currentTarget.blur()}}}
                                  onBlur={()=>{
                                    const raw=catStockDrafts[cat]; const skip=skipStockBlurRef.current; skipStockBlurRef.current=false
                                    setCatStockDrafts(d=>{const n={...d};delete n[cat];return n})
                                    if(skip||raw===undefined)return
                                    const p=raw.trim()===''?null:parseInt(raw,10)
                                    const next=p!==null&&!isNaN(p)?Math.max(0,p):null
                                    if(next!==(catStock?.stock_count??null))updateCategoryStock(cat,next)
                                  }}
                                  className={`w-16 border rounded-lg px-2 py-1.5 text-base sm:text-xs text-center font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400 ${isCatDefault?'border-blue-200 bg-blue-50 text-blue-700':'border-orange-200 bg-orange-50'}`}
                                  title={isCatDefault?'Default stock — save to override':'Category stock'}/>
                                {isCatDefault&&<span className="text-[9px] text-blue-400 font-medium">default</span>}
                              </div>
                              {/* AVAILABLE column — per-event category enable/disable (GATE). Off = closed for this
                                  event: hidden from customers (tab vanishes) + blocked at submit; auto-reverts next event. */}
                              <span className="w-12 shrink-0 flex justify-center"><Toggle on={catStock?.available??true} onToggle={()=>updateCategoryAvailable(cat,!(catStock?.available??true))}/></span>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1.5 ml-2">
                          {groupBySubcategory(items, catObj?.subcategories)
                            .filter(g=>g.items.length>0)
                            .map(group=>(
                            <div key={group.id ?? '__ungrouped'} className="space-y-1.5">
                              {group.name&&<p className="text-xs font-black text-orange-500 uppercase tracking-wider">{group.name}</p>}
                              {group.items.map(item=>{
                            const stock=itemStocks.find(s=>s.name===item.name)
                            // isAvailable: check itemStocks first (override), then fall back to menu
                            const isAvailable = stock ? (stock.available ?? true) : (item.available ?? true)
                            // no_item_cap = "follow category" → no individual cap → itemCount null (empty box,
                            // inherits the category pool) REGARDLESS of any default_stock.
                            const followsCategory=!!stock?.no_item_cap
                            const itemCount=followsCategory?null:(stock?.stock_count ?? item.default_stock ?? null)
                            const itemOrdered=activeEvent?((stock?.orders_count??0)+(offlineConsumedByItem.get(item.name)??0)):0
                            const itemRem=itemCount!==null?itemCount-itemOrdered:null
                            // Drives the input's default-state border/tooltip (the visible "default"
                            // label + "reset to default" link were removed — reset is still reachable
                            // by typing the default number back in).
                            const isDefault=!followsCategory&&stock?.stock_count==null&&item.default_stock!=null
                            return(
                              <div key={item.name} className={`flex items-center gap-2 p-2 rounded-xl border ${catClosed?'bg-slate-50 border-slate-100 opacity-50':!isAvailable?'bg-red-50 border-red-200':'bg-slate-50 border-slate-100'}`}>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className={`font-bold text-sm ${!isAvailable?'text-red-500':'text-slate-800'}`}>{item.name}<span className="text-slate-600 font-normal ml-1.5">£{item.price.toFixed(2)}</span></p>
                                    {!isAvailable&&<span className="text-[10px] font-black text-red-500 bg-red-100 px-1.5 py-0.5 rounded-full">SOLD OUT</span>}
                                    {/* Show "X left" ONLY for an item with its OWN cap (itemRem !== null) — never echo
                                        the category number onto every item (the category header row shows {catRem} left).
                                        No ≤N threshold on this stock-management surface: the operator set the cap and wants
                                        to see it at any value. DISPLAY only — gating/enforcement is unchanged. */}
                                    {isAvailable&&itemRem!==null&&<span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${itemRem<=3?'text-red-600 bg-red-100':itemRem<=10?'text-orange-600 bg-orange-100':'text-slate-500 bg-slate-100'}`}>{itemRem} left</span>}
                                  </div>
                                  {itemOrdered>0&&<p className="text-xs text-slate-600 mt-0.5">{itemOrdered} sold</p>}
                                </div>
                                <div className="flex flex-col items-center gap-0.5 w-16 shrink-0">
                                  <input type="number" inputMode="numeric" min="0" placeholder="–" disabled={catClosed}
                                    value={stockDrafts[item.name] ?? (itemCount??'').toString()}
                                    onFocus={()=>setStockDrafts(d=>({...d,[item.name]:(itemCount??'').toString()}))}
                                    onChange={e=>setStockDrafts(d=>({...d,[item.name]:e.target.value}))}
                                    onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();else if(e.key==='Escape'){skipStockBlurRef.current=true;e.currentTarget.blur()}}}
                                    onBlur={()=>{
                                      const raw=stockDrafts[item.name]; const skip=skipStockBlurRef.current; skipStockBlurRef.current=false
                                      setStockDrafts(d=>{const n={...d};delete n[item.name];return n})
                                      if(skip||raw===undefined)return
                                      const trimmed=raw.trim()
                                      const p=trimmed===''?null:parseInt(trimmed,10)
                                      const next=p!==null&&!isNaN(p)?Math.max(0,p):null
                                      if(next===null){
                                        // empty → follow category (no individual cap this event)
                                        if(!followsCategory)updateStock(item.name,isAvailable,null,cat,true)
                                      }else if(next!==(stock?.stock_count??null)||followsCategory){
                                        // a number → individual cap this event
                                        updateStock(item.name,isAvailable,next,cat,false)
                                      }
                                    }}
                                    className={`w-16 border rounded-lg px-2 py-1.5 text-base sm:text-xs text-center font-bold focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white disabled:cursor-not-allowed disabled:bg-slate-100 ${isDefault?'border-blue-200 text-blue-600':'border-slate-200'}`} title={catClosed?'Category closed for this event':isDefault?'Default stock — save to override':followsCategory?'Following category total — type a number to cap':'Item stock'}/>
                                </div>
                                <span className="w-12 shrink-0 flex justify-center"><Toggle on={isAvailable} disabled={catClosed} onToggle={()=>updateStock(item.name,!isAvailable,stock?.stock_count??null,cat,!!stock?.no_item_cap)}/></span>
                              </div>
                            )
                          })}
                            </div>
                            ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
                </>
              ):<p className="text-slate-400 text-sm animate-pulse">Loading menu...</p>}
            </div>

            {/* ── OPTIONS — STANDING shared-pool stock (item 3) ───────────────────────────
                Re-sourced from item.modifierGroups (Stage B emptied category.modifierGroups) and
                deduped by opt.id so a shared option (e.g. prawn) on many dishes shows ONCE. This
                stock is STANDING — it spans the whole service and does NOT reset per event (unlike
                the item stock above). Toggling sold-out / setting "N left" applies across ALL dishes
                that use the option, instantly. */}
            {truckMenu&&(()=>{
              // Dedupe options by id, bucketed by their group (in item/group encounter order).
              const seen=new Set<string>()
              const buckets:{id:string;name:string;options:ModifierOption[]}[]=[]
              const byId:Record<string,{id:string;name:string;options:ModifierOption[]}>={}
              for(const it of (truckMenu.items||[])){
                for(const g of ((it as MenuItem).modifierGroups||[])){
                  let b=byId[g.id]
                  if(!b){b={id:g.id,name:g.name,options:[]};byId[g.id]=b;buckets.push(b)}
                  for(const o of (g.options||[])){
                    if(seen.has(o.id))continue
                    seen.add(o.id)
                    b.options.push(o)
                  }
                }
              }
              const total=buckets.reduce((n,b)=>n+b.options.length,0)
              if(total===0)return null
              return(
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mt-4">
                  <p className="text-sm font-semibold text-slate-800 tracking-wide mb-1">Options — standing stock</p>
                  <p className="text-slate-500 text-xs mb-4">Shared across all dishes that use them. This count does <span className="font-semibold">not</span> reset per event — it&apos;s a running total for the whole service.</p>
                  <div className="space-y-3">
                    {buckets.map(grp=>(
                      <div key={grp.id} className="space-y-1.5">
                        {buckets.length>1&&<p className="text-xs font-black text-orange-500 uppercase tracking-wider">{grp.name}</p>}
                        {grp.options.map(opt=>{
                          const isOptOn=opt.available!==false
                          const optCount=opt.stock_count??null // null = untracked/unlimited (standing)
                          return(
                            <div key={opt.id} className={`flex items-center gap-2 p-2 rounded-xl border ${!isOptOn?'bg-red-50 border-red-200':'bg-slate-50 border-slate-100'}`}>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className={`font-bold text-sm ${!isOptOn?'text-red-500':'text-slate-800'}`}>{opt.name}{opt.price_adjustment!==0&&<span className="text-slate-600 font-normal ml-1.5">{opt.price_adjustment>0?`+£${opt.price_adjustment.toFixed(2)}`:`-£${Math.abs(opt.price_adjustment).toFixed(2)}`}</span>}</p>
                                  {!isOptOn&&<span className="text-[10px] font-black text-red-500 bg-red-100 px-1.5 py-0.5 rounded-full">SOLD OUT</span>}
                                  {isOptOn&&optCount!==null&&<span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${optCount<=3?'text-red-600 bg-red-100':optCount<=10?'text-orange-600 bg-orange-100':'text-slate-500 bg-slate-100'}`}>{optCount} left</span>}
                                </div>
                              </div>
                              <div className="flex flex-col items-center gap-0.5">
                                <input type="number" inputMode="numeric" min="0" placeholder="∞"
                                  value={optStockDrafts[opt.id] ?? (optCount??'').toString()}
                                  onFocus={()=>setOptStockDrafts(d=>({...d,[opt.id]:(optCount??'').toString()}))}
                                  onChange={e=>setOptStockDrafts(d=>({...d,[opt.id]:e.target.value}))}
                                  onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();else if(e.key==='Escape'){skipStockBlurRef.current=true;e.currentTarget.blur()}}}
                                  onBlur={()=>{
                                    const raw=optStockDrafts[opt.id]; const skip=skipStockBlurRef.current; skipStockBlurRef.current=false
                                    setOptStockDrafts(d=>{const n={...d};delete n[opt.id];return n})
                                    if(skip||raw===undefined)return
                                    const trimmed=raw.trim()
                                    const p=trimmed===''?null:parseInt(trimmed,10)
                                    const next=p!==null&&!isNaN(p)?Math.max(0,p):null // blank = untracked/unlimited
                                    if(next!==optCount)updateModifierOptionStock(opt.id,next)
                                  }}
                                  className="w-16 border border-slate-200 rounded-lg px-2 py-1.5 text-base sm:text-xs text-center font-bold focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" title="Standing stock — blank = unlimited"/>
                              </div>
                              <Toggle on={isOptOn} onToggle={()=>updateModifierOptionAvailable(opt.id,!isOptOn)}/>
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
            {truckMenu&&Object.keys(menuGroups).length>0&&(
            <div className="space-y-4">
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 text-xs text-slate-500 space-y-1 mt-4">
              <p className="font-bold text-slate-700">How it works</p>
              <p>• <span className="font-semibold">Category total</span> is a shared pool across every item in that category (e.g. 30 starters tonight).</p>
              <p>• <span className="font-semibold">Item limit</span> caps just that one item within the pool (e.g. only 8 Pepperoni) — leave it blank to draw from the pool with no cap of its own.</p>
              <p>• Whichever runs out first applies — the category pool or the item&apos;s own limit.</p>
              <p>• <span className="font-semibold">Available</span>: green = on sale, grey = sold out (hidden from customers).</p>
              <p>• Edit: configure prep time, batch size, and notes per category.</p>
            </div>
            </div>
            )}
          </div>
        )}
      </main>

      {/* Offline-pause reconnect notice — surfaces that the safety net fired while the device was away.
          Read-only: triggered by the durable last_offline_pause_at marker, ack'd per-device via localStorage. */}
      {showOfflinePausedNotice&&(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl text-center">
            <div className="text-3xl mb-2">📡</div>
            <h3 className="font-black text-slate-900 text-base mb-1">Offline protection kept you covered</h3>
            <p className="text-slate-600 text-sm">Orders were paused while your device was offline. Customer orders are active again now.</p>
            <button onClick={ackOfflinePausedNotice} className="mt-5 w-full bg-orange-600 text-white font-black text-sm py-3 rounded-xl hover:bg-orange-700 transition-colors">OK</button>
          </div>
        </div>
      )}

      {/* Finish-event confirm (styled — replaces window.confirm). Early close warns harder.
          z-[60] so it stacks above the event menu the Finish button lives in. */}
      {finishConfirm&&(
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="font-black text-slate-900 text-base mb-1">End event?</h3>
            <p className="text-sm text-slate-600">
              {finishConfirm.early
                ? `This event isn't scheduled to finish until ${finishConfirm.endTime}. No more orders will be allowed. Confirm to end event?`
                : 'Finish this event? No more orders will be taken.'}
            </p>
            <div className="flex gap-2 mt-5">
              <button onClick={()=>doFinishEvent(finishConfirm.eventId)} className="flex-1 bg-red-600 text-white font-black text-sm py-2.5 rounded-xl hover:bg-red-700">Yes</button>
              <button onClick={()=>setFinishConfirm(null)} className="flex-1 bg-slate-100 border border-slate-200 text-slate-700 font-bold text-sm py-2.5 rounded-xl hover:bg-slate-200">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Pause duration picker */}
      {showPauseModal&&(
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <h3 className="font-black text-slate-900 text-base text-center mb-1">Pause online orders</h3>
            <p className="text-slate-500 text-sm text-center mb-4">Customers can still browse the menu but won't be able to order.</p>
            <div className="space-y-2 mb-4">
              {[{label:'10 minutes',mins:10},{label:'20 minutes',mins:20},{label:'30 minutes',mins:30}].map(({label,mins})=>(
                <button key={mins} onClick={()=>{const until=new Date(Date.now()+mins*60000).toISOString();fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'set_paused',paused_until:until,eventId:activeEvent?.id})});markPending('vanPausedUntil',until);setVanPausedUntil(until);setShowPauseModal(false)}} className="w-full bg-orange-50 border border-orange-200 text-orange-700 font-bold py-3 rounded-xl hover:bg-orange-100 text-sm">{label}</button>
              ))}
              <button onClick={()=>{const until=new Date('2099-01-01').toISOString();fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'set_paused',paused_until:until,eventId:activeEvent?.id})});markPending('vanPausedUntil',until);setVanPausedUntil(until);setShowPauseModal(false)}} className="w-full bg-slate-100 border border-slate-200 text-slate-700 font-bold py-3 rounded-xl hover:bg-slate-200 text-sm">Until I turn it back on</button>
            </div>
            <button onClick={()=>setShowPauseModal(false)} className="w-full text-slate-400 text-sm font-bold py-2">Cancel</button>
          </div>
        </div>
      )}

      {/* Screen-off warning modal */}
      {showScreenOffWarning&&(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Allow screen to turn off?</h3>
              <p className="text-sm text-slate-500 mt-2">
                Offline order protection is currently enabled. If the screen turns off and the device loses its connection, online ordering may pause automatically.
              </p>
              <p className="text-sm text-slate-500 mt-2">Are you sure you want to allow the screen to turn off?</p>
            </div>
            <div className="flex gap-3">
              <button onClick={()=>setShowScreenOffWarning(false)} className="flex-1 border border-slate-200 text-slate-600 py-3 rounded-xl text-sm">Keep screen on</button>
              <button onClick={confirmScreenOff} className="flex-1 bg-slate-900 text-white font-semibold py-3 rounded-xl text-sm">Allow screen off</button>
            </div>
          </div>
        </div>
      )}

      {/* KDS van picker modal */}
      {showKDSPicker&&(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e=>e.target===e.currentTarget&&setShowKDSPicker(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-3">
            <h3 className="text-lg font-semibold text-slate-900">Open kitchen screen</h3>
            <p className="text-sm text-slate-500">Choose which van's kitchen screen to open:</p>
            {vans.map(van=>(
              <button key={van.id} onClick={()=>{openKDS(van);setShowKDSPicker(false)}} className="w-full py-3 px-4 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 hover:border-orange-300 hover:bg-orange-50 text-left transition-colors flex items-center justify-between">
                {van.name}
                <span className="text-xs text-slate-600">Kitchen screen →</span>
              </button>
            ))}
            <button onClick={()=>setShowKDSPicker(false)} className="text-sm text-slate-400 hover:text-slate-600 pt-1">Cancel</button>
          </div>
        </div>
      )}

      {/* Edit profile modal */}
      {showProfileModal&&(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
             onClick={e=>e.target===e.currentTarget&&setShowProfileModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-4">
            <h3 className="text-lg font-semibold text-slate-900">Edit profile</h3>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</label>
              <input type="text" value={editProfileName} onChange={e=>setEditProfileName(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" autoFocus/>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</label>
              <input type="email" value={currentUserEmail||''} disabled
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 text-slate-400"/>
            </div>
            <div className="flex gap-3">
              <button onClick={()=>setShowProfileModal(false)}
                className="flex-1 border border-slate-200 text-slate-600 py-3 rounded-xl text-sm">Cancel</button>
              <button onClick={saveProfile} disabled={!editProfileName.trim()||savingProfile}
                className="flex-1 bg-orange-600 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-40">
                {savingProfile?'Saving...':'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel order modal */}
      {showCancelModal&&cancellingOrder&&(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 flex flex-col gap-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Cancel order #{cancellingOrder.id}?</h3>
              <p className="text-sm text-slate-500 mt-1">{cancellingOrder.customer_name} · £{cancellingOrder.total.toFixed(2)}</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Reason — optional</label>
              <select value={cancelReason} onChange={e=>setCancelReason(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm">
                <option value="">Select a reason</option>
                <option value="Sold out / item unavailable">Sold out / item unavailable</option>
                <option value="Requested by customer">Requested by customer</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Additional note — optional</label>
              <textarea value={cancelNote} onChange={e=>setCancelNote(e.target.value)} placeholder="Add more detail for the customer..." rows={2} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none"/>
            </div>
            <div className="flex gap-3">
              <button onClick={()=>{setShowCancelModal(false);setCancellingOrder(null);setCancelReason('');setCancelNote('')}} className="flex-1 border border-slate-200 text-slate-600 font-medium py-3 rounded-xl text-sm">Keep order</button>
              <button onClick={()=>confirmCancelOrder()} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-xl text-sm">Cancel order</button>
            </div>
          </div>
        </div>
      )}

      {/* Reject order modal — REQUIRED reason (shown to the customer). Mirrors the cancel modal. */}
      {showRejectModal&&rejectingOrder&&(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 flex flex-col gap-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Reject order #{rejectingOrder.id}?</h3>
              <p className="text-sm text-slate-500 mt-1">{rejectingOrder.customer_name} · £{rejectingOrder.total.toFixed(2)}</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Reason — required (shown to the customer)</label>
              <select value={rejectReason} onChange={e=>setRejectReason(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm">
                <option value="">Select a reason</option>
                <option value="Sold out of an item">Sold out of an item</option>
                <option value="Too busy — can't make it in time">Too busy — can&apos;t make it in time</option>
                <option value="Closing soon">Closing soon</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{rejectReason==='Other'?'Reason — required':'Additional note — optional'}</label>
              <textarea value={rejectNote} onChange={e=>setRejectNote(e.target.value)} placeholder="Add more detail for the customer..." rows={2} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none"/>
            </div>
            <div className="flex gap-3">
              <button onClick={()=>{setShowRejectModal(false);setRejectingOrder(null);setRejectReason('');setRejectNote('')}} className="flex-1 border border-slate-200 text-slate-600 font-medium py-3 rounded-xl text-sm">Keep order</button>
              <button onClick={()=>confirmRejectOrder()} disabled={!((rejectReason!==''&&rejectReason!=='Other')||rejectNote.trim()!=='')} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-50 disabled:cursor-not-allowed">Reject order</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit order modal */}
      {editingOrder&&(
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={e=>e.target===e.currentTarget&&setEditingOrder(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-black text-slate-900">Edit Order #{editingOrder.id}</h3>
              <button onClick={()=>setEditingOrder(null)} className="text-slate-400 hover:text-slate-700 text-xl font-bold w-8 h-8 flex items-center justify-center">×</button>
            </div>

            {/* Add items */}
            {truckMenu&&(
              <div className="mb-4 space-y-3">
                <p className="text-xs font-black text-slate-500 uppercase tracking-wide">Add items</p>
                {Object.entries(menuGroups).map(([cat,items])=>(
                  <div key={cat}>
                    <p className="text-xs font-black text-orange-600 uppercase tracking-wide mb-1.5">{cat.charAt(0).toUpperCase()+cat.slice(1)}</p>
                    <div className="flex flex-wrap gap-2">
                      {items.map(item=>{
                        const totalInEdit=editItems.filter(i=>i.name===item.name).reduce((s,i)=>s+i.quantity,0)
                        const isSoldOut=!(item.available??true)
                        if(isSoldOut)return<div key={item.name} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-100 bg-slate-50 opacity-50"><span className="text-xs text-slate-400 line-through">{item.name}</span></div>
                        return(
                          <button key={item.name} onClick={()=>openEditItemModal(item)}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all ${totalInEdit>0?'bg-orange-600 border-orange-600 text-white':'bg-slate-50 border-slate-200 text-slate-700 hover:border-orange-300'}`}>
                            {totalInEdit>0&&<span className="text-orange-200">{totalInEdit}×</span>}
                            {item.name}<span className={totalInEdit>0?'text-orange-200':'text-slate-600'}> £{item.price.toFixed(2)}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Current order items */}
            {(editItems.length>0||(editingOrder.deals&&editingOrder.deals.length>0))&&(
              <div className="bg-slate-50 rounded-xl p-3 mb-4 space-y-2">
                <p className="text-xs font-black text-slate-500 uppercase tracking-wide">Order</p>
                {editItems.map(item=>(
                  <div key={item.cartKey||item.name}>
                    <div className="flex items-center gap-2">
                      <span className="flex-1 text-sm font-bold text-slate-900 truncate">{item.name}</span>
                      <div className="flex items-center gap-1">
                        <button onClick={()=>setEditItems(prev=>prev.map(i=>i.cartKey===item.cartKey?{...i,quantity:i.quantity-1}:i).filter(i=>i.quantity>0))} className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center font-bold hover:bg-red-100 hover:text-red-600 text-sm">−</button>
                        <span className="w-4 text-center font-black text-sm">{item.quantity}</span>
                        <button onClick={()=>setEditItems(prev=>prev.map(i=>i.cartKey===item.cartKey?{...i,quantity:i.quantity+1}:i))} className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center font-bold hover:bg-orange-100 hover:text-orange-600 text-sm">+</button>
                      </div>
                      <span className="text-slate-500 text-xs w-12 text-right">£{(item.unit_price*item.quantity).toFixed(2)}</span>
                    </div>
                    {(item.modifiers||[]).map(m=>(
                      <p key={m.name} className="text-xs text-slate-600 pl-3 leading-tight">+ {m.name}{m.price>0?` +£${m.price.toFixed(2)}`:''}</p>
                    ))}
                    {item.specialInstructions&&<p className="text-xs text-slate-600 italic pl-3 leading-tight">📝 {item.specialInstructions}</p>}
                  </div>
                ))}
                {/* Deals — removable */}
                {editDeals.map((deal,di)=>{
                  const bundle=truckMenu?.bundles?.find(b=>b.name===deal.name)
                  const bundlePrice=bundle?.bundle_price??0
                  const modExtra=Object.values(deal.slotModifiers||{}).flat().reduce((s,m)=>s+m.price,0)
                  return(
                    <div key={di} className="pt-1">
                      <div className="flex items-start gap-1">
                        <div className="flex-1">
                          <p className="text-xs font-black text-amber-600">🎁 {deal.name}: {Object.entries(deal.slots).filter(([,v])=>v).map(([cat,itemName])=>{const mods=(deal.slotModifiers||{})[cat]||[];return mods.length?`${itemName} (+ ${mods.map(m=>m.name).join(', ')})`:itemName}).join(', ')}</p>
                          {Object.entries(deal.slots).map(([cat,itemName])=>{
                            if(!itemName)return null
                            const mods=(deal.slotModifiers||{})[cat]||[]
                            const note=(deal.slotNotes||{})[cat]
                            if(!mods.length&&!note)return null
                            return(
                              <div key={cat} className="pl-3">
                                {mods.map(m=><p key={m.name} className="text-xs text-slate-600 leading-tight">↳ {itemName}: + {m.name}{m.price>0?` +£${m.price.toFixed(2)}`:''}</p>)}
                                {note&&<p className="text-xs text-slate-600 italic leading-tight">↳ {itemName}: 📝 {note}</p>}
                              </div>
                            )
                          })}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-slate-500">£{(bundlePrice+modExtra).toFixed(2)}</span>
                          <button onClick={()=>setEditDeals(prev=>prev.filter((_,i)=>i!==di))} className="w-5 h-5 rounded-full bg-red-100 text-red-500 hover:bg-red-200 text-xs font-bold flex items-center justify-center">×</button>
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div className="pt-2 border-t border-slate-200 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Original</span>
                    <span className="text-slate-600">£{Number(editingOrder.total).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold">
                    <span className="text-slate-600">New total</span>
                    <span className="text-slate-900">£{editTotal.toFixed(2)}</span>
                  </div>
                  {editTotal!==Number(editingOrder.total)&&(
                    <div className={`flex justify-between text-sm font-black rounded-lg px-2 py-1.5 ${editTotal>Number(editingOrder.total)?'bg-orange-50 text-orange-600':'bg-green-50 text-green-600'}`}>
                      <span>{editTotal>Number(editingOrder.total)?'Extra to collect':'Reduction'}</span>
                      <span>{editTotal>Number(editingOrder.total)?'+':'-'}£{Math.abs(editTotal-Number(editingOrder.total)).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {availableDeals.length>0&&(
              <div className="mb-4">
                <button onClick={()=>setShowEditDealModal(true)}
                  className="w-full border-2 border-dashed border-amber-300 text-amber-700 font-bold py-2 rounded-xl text-sm hover:bg-amber-50 transition-colors">
                  + Add deal
                </button>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wide">Collection time</label>
              {(()=>{
                const editModalSlots=editSlots
                if(editSlotsLoading)return<div className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-50 text-slate-400">Loading slots…</div>
                if(editModalSlots.length===0)return<input type="time" value={editSlot} onChange={e=>setEditSlot(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"/>
                return(
                  <select value={editSlot} onChange={e=>setEditSlot(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
                    <option value="">No slot</option>
                    {editModalSlots.map(s=>{
                      const isCurrent=s.collection_time===editingOrder?.slot
                      if(s.is_past&&!s.is_grace&&!isCurrent)return null
                      if(s.is_grace)return<option key={s.collection_time} value={s.collection_time}>⚠️ {s.collection_time} · After closing{isCurrent?' · (current)':''}</option>
                      // Same oven-occupancy indicator as Add Order (shared helper): tone +
                      // per-category composition label ("4 Pizza, 2 Other"). (current) is edit-only.
                      const ind=editSlotIndicators.get(s.collection_time)??{emoji:'🟢',label:''}
                      const label=`${ind.label?` ${ind.label}`:''}${isCurrent?' · (current)':''}`
                      return<option key={s.collection_time} value={s.collection_time}>{s.collection_time} {ind.emoji}{label}</option>
                    })}
                  </select>
                )
              })()}
            </div>
            <div className="mb-4">
              {/* Name + email + phone grouped, all optional, collapsed. Name is NOT pre-filled
                  with the "Walk-up" default (that reads like a real name) — it starts empty for
                  walk-ups; blank on save keeps the "Walk-up" display default. Never gates Save. */}
              <details className="text-xs text-slate-400">
                <summary className="cursor-pointer select-none py-1">+ Add name / email / phone</summary>
                <div className="mt-2 flex flex-col gap-2">
                  <input type="text" placeholder="Name — optional" value={editName} onChange={e=>setEditName(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"/>
                  <input type="email" placeholder="Email for receipt" value={editEmail} onChange={e=>setEditEmail(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"/>
                  <input type="tel" placeholder="Phone number" value={editPhone} onChange={e=>setEditPhone(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"/>
                </div>
              </details>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wide">Notes</label>
              <textarea value={editNotes} onChange={e=>setEditNotes(e.target.value)} rows={2} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"/>
            </div>
            <div className="flex gap-2">
              <button onClick={()=>setEditingOrder(null)} className="flex-1 bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl hover:bg-slate-200 text-sm">Cancel</button>
              <button onClick={submitEdit} disabled={!!actionLoading?.startsWith('edit')||!isOrderNonEmpty(editItems,editDeals)} className="flex-1 bg-orange-600 text-white font-bold py-2.5 rounded-xl hover:bg-orange-700 text-sm disabled:opacity-50">{actionLoading?.startsWith('edit')?'Saving...':'Save changes'}</button>
            </div>
          </div>
        </div>
      )}

      {showEditDealModal&&(
        <DealsModal
          bundles={availableDeals}
          menuItems={truckMenu?.items||[]}
          menuCategories={truckMenu?.categories||[]}
          basketItems={editItems.map(i=>({name:i.name,quantity:i.quantity,unit_price:i.unit_price,cartKey:i.cartKey,modifiers:i.modifiers,specialInstructions:i.specialInstructions}))}
          existingDeals={editDeals.map(d=>({bundle:{name:d.name,description:'',bundle_price:0,original_price:null,available:true,start_time:null,end_time:null,slot_1_category:null,slot_2_category:null,slot_3_category:null,slot_4_category:null,slot_5_category:null,slot_6_category:null},slots:d.slots,itemsTakenFromBasket:d.itemsTakenFromBasket||[]}))}
          onApply={(deal,slots,price,discount,rawSlots,modifierExtra,slotModifiers,slotNotes)=>{
            // Consume the in-basket items the deal took (shared helper) so they aren't
            // double-counted in total OR re-booked into capacity (the Edit #7 bug).
            setEditItems(prev=>consumeBasketItemsForDeal(prev,rawSlots))
            setEditDeals(prev=>[...prev,{name:deal.name,slots,slotModifiers,slotNotes,isNew:true,itemsTakenFromBasket:dealConsumedCartKeys(rawSlots)}])
            setShowEditDealModal(false)
          }}
          onClose={()=>setShowEditDealModal(false)}
        />
      )}

      {/* Edit item modifier modal */}
      {editItemModal&&(
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-4 w-full max-w-sm shadow-2xl max-h-[70vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-3">
              <div>
                <p className="font-black text-slate-900">{editItemModal.item.name}</p>
                <p className="text-sm text-slate-600">£{editItemModal.item.price.toFixed(2)}{editModalMods.reduce((s,m)=>s+m.price,0)>0?` + £${editModalMods.reduce((s,m)=>s+m.price,0).toFixed(2)}`:''}</p>
              </div>
              <button onClick={closeEditItemModal} className="text-slate-400 hover:text-slate-700 text-xl font-bold w-8 h-8 flex items-center justify-center">×</button>
            </div>
            {editItemModal.modGroups.map(group=>(
              <div key={group.id} className="mb-3">
                <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-2">{group.name}</p>
                <div className="flex flex-wrap gap-2">
                  {group.options.map(opt=>{
                    const sel=editModalMods.some(m=>m.name===opt.name)
                    return(
                      <button key={opt.id} type="button" onClick={()=>setEditModalMods(prev=>sel?prev.filter(m=>m.name!==opt.name):[...prev,{name:opt.name,price:opt.price_adjustment}])}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-all ${sel?'border-orange-500 bg-orange-500 text-white':'border-slate-200 bg-white text-slate-700 hover:border-orange-300'}`}>
                        <span>{opt.name}</span>
                        {opt.price_adjustment>0&&<span className={sel?'text-orange-200':'text-orange-500'}>+£{opt.price_adjustment.toFixed(2)}</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            {editItemModal.allowNotes&&(
              <div className="mb-3">
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wide mb-1">Special instructions</label>
                <textarea value={editModalNotes} onChange={e=>setEditModalNotes(e.target.value)} rows={2} placeholder="e.g. no onions"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"/>
              </div>
            )}
            <button onClick={()=>{addEditItem(editItemModal.item,editModalMods,editModalNotes);closeEditItemModal()}}
              className="w-full bg-orange-600 text-white font-bold py-2.5 rounded-xl hover:bg-orange-700 text-sm">
              Add to order
            </button>
          </div>
        </div>
      )}

      {/* Event menu */}
      {showEventMenu&&activeEvent&&(
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={e=>e.target===e.currentTarget&&setShowEventMenu(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-slate-900">{activeEvent.venue_name}</h3>
              <button onClick={()=>setShowEventMenu(false)} className="text-slate-400 hover:text-slate-700 text-xl font-bold w-8 h-8 flex items-center justify-center">×</button>
            </div>
            {/* Start / Restart — visible whenever the event isn't live yet (confirmed) or has finished
                (closed), on ALL viewports incl. mobile. Was gated `confirmed && !auto_open`, so a not-started
                event was un-startable from the mobile menu — the only Start button was the Add-order banner,
                which is hidden on mobile (hidden sm:block). Now mirrors that banner's condition. */}
            {(activeEvent.status==='confirmed'||activeEvent.status==='closed')&&(
              <button onClick={()=>{openEvent(activeEvent.id);setShowEventMenu(false)}}
                className="w-full bg-orange-600 text-white font-bold py-2.5 rounded-xl hover:bg-orange-700 text-sm mb-3">
                {activeEvent.status==='closed'?'Restart Event':'Start Event'}
              </button>
            )}
            <button onClick={()=>{setShowEventMenu(false);setActiveTab('add');setPendingOpenEventPicker(true)}}
              className="w-full text-left py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 border border-slate-100 rounded-xl px-3 mb-4">
              📅 Change event
            </button>
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Note for customers</label>
              <input type="text" value={eventNoteInput} onChange={e=>setEventNoteInput(e.target.value)}
                placeholder="e.g. Park in the main car park, look for the orange gazebo"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"/>
              <p className="text-xs text-slate-500 mt-1.5">Shown to customers on the order page below your event details.</p>
              <button onClick={()=>saveEventNote(activeEvent.id)} className="mt-2 w-full bg-slate-100 text-slate-700 font-bold py-2 rounded-xl hover:bg-slate-200 text-sm">Save note</button>
            </div>
            <div className="space-y-2 border-t border-slate-100 pt-3">
              {/* Pause / Resume orders (moved here from the full-width row). Only for a LIVE event. Same handler:
                  paused → clear paused_until (resume); else → open the pause-duration modal. */}
              {activeEvent.status==='open'&&(
                paused?(
                  <button onClick={()=>{fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'set_paused',paused_until:null,eventId:activeEvent?.id})});markPending('pausedUntil',null);markPending('vanPausedUntil',null);setPausedUntil(null);setVanPausedUntil(null);setVanOnlinePausedUntil(null);setShowEventMenu(false)}}
                    className="w-full bg-red-600 text-white font-bold py-2.5 rounded-xl hover:bg-red-700 text-sm">▶ Resume orders</button>
                ):(
                  <button onClick={()=>{setShowEventMenu(false);setShowPauseModal(true)}}
                    className="w-full bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl hover:bg-slate-200 text-sm">⏸ Pause orders</button>
                )
              )}
              {/* Add extra wait — event-level buffer added to NEW-order time quotes (set_extra_wait). Moved
                  here from the removed mobile controls row; desktop/iPad keep their inline copy beside the
                  stat boxes. Active state stays visible via the "⏱ +N min extra wait active" banner above. */}
              {renderExtraWait('w-full')}
              {/* Extends the event's END TIME by 30 min (extendEvent → end_time) — NOT an order-wait buffer.
                  Labelled explicitly so it isn't confused with "Add extra wait" now sitting beside it. */}
              <button onClick={()=>{extendEvent(activeEvent.id,30);setShowEventMenu(false)}}
                className="w-full bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl hover:bg-slate-200 text-sm">Extend event +30 min</button>
              <button onClick={()=>finishEvent(activeEvent.id)}
                className="w-full bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl hover:bg-slate-200 text-sm">Finish event</button>
              <button onClick={()=>cancelEventFromMenu(activeEvent.id)}
                className="w-full bg-red-50 text-red-600 font-bold py-2.5 rounded-xl hover:bg-red-100 border border-red-200 text-sm">Cancel event</button>
            </div>
          </div>
        </div>
      )}

      <ToastStack toasts={toasts} dismissToast={dismissToast}/>

      {showQRFullscreen&&(
        <div className="fixed inset-0 bg-white z-50 flex flex-col items-center justify-center" onClick={()=>setShowQRFullscreen(false)}>
          <div className="w-[85vmin] h-[85vmin] flex-shrink-0">
            {qrFullscreenDataUrl
              ? <img src={qrFullscreenDataUrl} className="w-full h-full object-contain" alt="Order QR code"/>
              : <div className="w-full h-full flex items-center justify-center"><div className="w-8 h-8 border-2 border-slate-300 border-t-orange-600 rounded-full animate-spin"/></div>
            }
          </div>
          <p className="text-lg font-bold text-slate-900 mt-4">{truck?.name}</p>
          <p className="text-xs text-slate-500 mt-1">Powered by <span className="font-semibold text-orange-600">HatchGrab</span></p>
          <p className="text-xs text-slate-300 mt-4">Tap anywhere to close</p>
        </div>
      )}

    </div>
  )
}

// ─── Deals modal ──────────────────────────────────────────────────────────────