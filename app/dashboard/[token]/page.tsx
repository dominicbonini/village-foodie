'use client'
// app/dashboard/[token]/page.tsx

import { useState, useEffect, useCallback, useRef, useMemo, use, Fragment } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { hasFeature, canAccess } from '@/lib/features'
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
import { PaymentActionsModal } from '@/components/dashboard/PaymentActionsModal'
import { useToasts } from '@/lib/useToasts'
import { useReadyEmailUndo } from '@/lib/useReadyEmailUndo'
import { ToastStack } from '@/components/ToastStack'

/** "Village Hall — Wickhambrook", skip town if already in venue name */
import { DealsModal } from '@/components/dashboard/DealsModal'
import { AddOrderPanel } from '@/components/dashboard/AddOrderPanel'
import { resolvePaidStep } from '@/lib/payments/paid-step'
import { readSoundConfig, writeSoundConfig, seedSoundConfig, effectiveSoundConfig } from '@/lib/sound-prefs'
import { DayLoadStrip } from '@/components/dashboard/DayLoadStrip'
import UserMenu from '@/components/dashboard/UserMenu'
import { AppLink } from '@/components/native/AppLink'   // internal-route anchor: soft-nav in native, plain <a> on web
// The ONE event-cancel gate, shared with manage and the KDS. Replaces a window.confirm whose safe
// button was labelled "Cancel" on the operation that cancels every live order. See the component.
import { EventCancelModal } from '@/components/shared/EventCancelModal'
import { RejectOrderModal } from '@/components/shared/RejectOrderModal'
import { EventFinishTimeModal } from '@/components/shared/EventFinishTimeModal'
import { EventActionsModal } from '@/components/shared/EventActionsModal'
import { DeviceSetupGate } from '@/components/native/OperatorDeviceConfig'
import { AppLockGate } from '@/components/native/AppLockGate'
import { calculateOrderTotal } from '@/lib/order-calculations'
import { adjustQuantity, cleanupDealsForItem, groupByCategory, groupBySubcategory, isOrderNonEmpty, consumeBasketItemsForDeal, dealConsumedCartKeys } from '@/lib/basket-utils'
import { supabaseBrowser } from '@/lib/supabase-browser'
import { keepAwake, prepareKeepAwake, allowSleep, subscribeWakeState, type WakeState } from '@/lib/native/keepAwake'
import { addNetworkListener } from '@/lib/native/network'
import { onAppResume } from '@/lib/native/app'
import { isNativeApp, setLastScreen } from '@/lib/native/device'
import { configureStatusBar } from '@/lib/native/statusBar'
// 🔴 `collected_cash` / `collected_card` ARE COLLECTIONS. Every branch below that asked "was this a
// collection?" by string equality now asks the shared predicate, so the two new names get the struck-prep
// clear, the undo affordance, the payment-warning wording and the post-action refresh that `collected`
// has always had — rather than silently taking the else branch.
import { gatedAction, STATUS_REPLAY_EXPECTED_FROM } from '@/lib/native/orderGate'
import { isOnline, startReachability, onReachabilityChange } from '@/lib/native/reachability'
import { useOfflineAlert } from '@/lib/native/useOfflineAlert'
import { NotificationSettings } from '@/components/native/NotificationSettings'
import { OfflineBanner } from '@/components/native/OfflineBanner'
import { WebOfflineBanner } from '@/components/WebOfflineBanner'
import { KeepAwakePrompt } from '@/components/dashboard/KeepAwakePrompt'
import { DemoWelcome } from '@/components/dashboard/DemoWelcome'
import { DemoLockChip } from '@/components/dashboard/DemoLockChip'
import { DemoLoopComplete } from '@/components/dashboard/DemoLoopComplete'
import { DemoModeBanner } from '@/components/DemoModeBanner'
import { DemoGetStarted } from '@/components/DemoGetStarted'
import { CapacityBreachBanner } from '@/components/dashboard/CapacityBreachBanner'
import { BuzzerGrid } from '@/components/dashboard/BuzzerGrid'
import { BuzzerLostBanner, type BuzzerLoss } from '@/components/dashboard/BuzzerLostBanner'
import { applyPendingBuzzers, echoedBuzzerKeys, resolveCurrentBuzzer, planOptimisticBuzzer } from '@/lib/buzzer'
import type { CapacityBreach } from '@/lib/capacity-breach'
import { mergeOrders } from '@/lib/orders/mergeOrders'
import { useOfflineStatusOverlay } from '@/lib/native/useOfflineStatusOverlay'
import { useOfflinePaymentOverlay } from '@/lib/native/useOfflinePaymentOverlay'
import { useGatedActionResult } from '@/lib/native/useGatedActionResult'
import { useOutboxConflicts } from '@/lib/native/useOutboxConflicts'
import { getOrderBalance, hasUnrecordedPayment } from '@/lib/payments/ledger'
import { DevOfflineToggle } from '@/components/native/DevOfflineToggle'
import { DevOutboxInspector } from '@/components/native/DevOutboxInspector'
import { PrintingSettings } from '@/components/printing/PrintingSettings'
import { usePrinting } from '@/lib/printing/usePrinting'   // the ONE mount of the print watcher — dashboard only, never the KDS
import { registerServiceWorker } from '@/lib/native/serviceWorker'
import { nativeAuthHeader } from '@/lib/native/session'
import { formatTime, localTodayIso, pickDefaultEventByTime, getLocalDateInTz } from '@/lib/time-utils'
import { fmtVenue, eventDateLabel, eventStatusDisplay, EVENT_STATUS_TEXT_ON_DARK } from '@/lib/event-display'
import { useAndroidBack } from '@/lib/native/backHandler'
import { KITCHEN_CAPACITY_DESC, KITCHEN_CAPACITY_EXAMPLE, KITCHEN_CAPACITY_WARNING, KITCHEN_CAPACITY_GRID, kitchenCapacityNeedsPrepWarning, formatPrepSecs } from '@/lib/kitchen-capacity'
import { PrepTimeSelect } from '@/components/PrepTimeSelect'
import { BatchSizeSelect } from '@/components/manage/KitchenCapacityEdit'
import { buildSlotIndicators, type SlotIndicator } from '@/lib/slot-display'
import { normaliseOrderLines } from '@/lib/slot-bookings'
import { orderItemsToQtyByCat, mergeQtyByCat, buildOfflineOccupancy } from '@/lib/slot-capacity'

/** The ONLY list of valid ?tab= values, shared by the tab bar and the URL validator — so a tab cannot be
 *  added to the UI without becoming linkable, or removed without ceasing to be. */
const TAB_VALUES = ['orders','add','stock','settings'] as const

// ── THE PER-EVENT OVERRIDE INDICATOR — REMOVED 10 AUGUST 2026. READ BEFORE REBUILDING IT. ──────────
// A "Changed for this event" pill briefly rendered on each of the three payment rows. It is gone, and
// the reason is the ruling already recorded at the payment card: DASHBOARD → SETTINGS IS ENTIRELY
// EVENT-SCOPED. Every control on that tab applies to the current event only, so a per-row badge saying
// "changed for this event" states on every row what the screen already says once — the exact
// repeat-a-screen-level-fact-per-row failure that made the card read as a box of unrelated exceptions
// when scope wording was removed on 30 July. Do not reinstate it.
//
// 🔴 THE RESET AFFORDANCE WENT WITH IT, ON EXPLICIT INSTRUCTION, AND THAT HAS A COST — SEE BELOW.
// "Use my usual setting" was the only route from an overridden event back to inheriting the truck
// default. With it gone, the three set_*_override handlers still ACCEPT null (that capability is intact
// and tested), but nothing in the product sends it. So an operator who changes a payment setting for
// one event can no longer return that event to following the truck default: they can only match the
// default by hand, and a hand-matched event SILENTLY STOPS TRACKING the default when it later changes —
// coinciding and inheriting are different states. That is the one-way door the 10 August work removed,
// re-opened deliberately at the operator's request and recorded here so it is not rediscovered as a bug.
// 🔴 TO RESTORE IT: render a single "Use my usual setting" control per row calling the row's existing
// save function with `null`. No migration, no new action, no outbox op — the server side is unchanged.
// docs/payments-report.md carries the full reasoning and the recommendation.
//
// USUAL_SETTING_TOAST is KEPT because the save functions still handle `null` and still toast for it;
// it is the string that fires if a clear is ever dispatched again.
const USUAL_SETTING_TOAST = 'Back to your usual setting for this event'

// A cheap fingerprint of the edit basket, used ONLY to invalidate a stale unpriceable-line banner:
// the server's verdict was computed for one particular basket, and must not stay on screen naming a
// line the operator has since removed. Names + modifier sets + quantities + deal names, order-
// independent. Not a price and not an identity — see lineIdentity in lib/order-repricing.ts for that.
function editBasketSignature(items: { name: string; quantity: number; modifiers?: { name: string }[] }[], deals: { name: string }[]): string {
  const i = items.map(x => `${x.name}|${(x.modifiers || []).map(m => m.name).sort().join(',')}|${x.quantity}`).sort().join(';')
  return `${i}#${deals.map(x => x.name).sort().join(',')}`
}

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
  // ── DEMO MODE ────────────────────────────────────────────────────────────────────────────────────────
  // The prospect demo runs on THIS page (one dashboard, one codebase — every future improvement lands in
  // the demo for free), so demo differences are conditional rendering, never a fork.
  //
  // DETECTION = the token prefix, the SAME signal proxy.ts keys on to waive the session gate, upheld by
  // assertReservedPrefix() in lib/provision-truck.ts (no operator truck can ever carry a `demo-` token).
  // Deliberately NOT keyed on truck.plan, and that holds under EITHER plan model. It used to read
  // "NOT truck.plan==='demo', because a SIGNED-UP pre-trial truck also sits on plan 'demo'" — as of
  // 4 August signup provisions 'trial' instead, so the collision that argument named is gone. The
  // conclusion is unchanged and stronger for it: the PLAN is a billing tier and says nothing about
  // whether a truck is a throwaway sandbox, so it could never be the detector. The token prefix is.
  // A trucks.is_test-style column is forbidden (reference-manual §824).
  // Client-side from the route param → no fetch, no API change, correct on first paint.
  const isDemo=token.startsWith('demo-')
  // ── CUSTOMER-URL BASE ────────────────────────────────────────────────────────────────────────────
  // DEMO uses the CURRENT ORIGIN so local testing stays local. Hardcoding NEXT_PUBLIC_HATCHGRAB_URL sent
  // a localhost tester to PRODUCTION, where the truck doesn't exist (and, pre-deploy, where /api/orders/
  // submit has no demo exception in the excluded gate) — so ordering died with "Truck not found".
  //
  // REAL TRUCKS KEEP THE ENV VAR, deliberately: their order link and QR get printed and shared, so they
  // must always be the canonical production domain regardless of which host the operator happens to be
  // on (a preview deploy, the native shell). Origin would be actively wrong there.
  const customerUrlBase = isDemo && typeof window !== 'undefined'
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_HATCHGRAB_URL ?? '')
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
  // 🔴 ORDER KEYS WITH A LIVE, UNCAPTURED CARD AUTHORISATION. Resolved server-side once per load
  // (lib/payments/held-authorisation.ts) and passed straight to the card — never derived here, and never
  // mixed into `payments`, which is the ledger and must keep meaning money that has MOVED.
  const[heldAuthorisations,setHeldAuthorisations]=useState<Set<string>>(new Set())
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
  // Buzzer guards live in the SAME shared ref under `buzzer:${order_key}` — the composite-key form
  // catavail already uses. This adapter is what lib/buzzer.ts's two helpers read: absent ⇒ undefined
  // (no guard), present-with-null ⇒ a pending DESELECT. Those two must stay distinguishable.
  const peekPendingBuzzer=useCallback((orderKey:string)=>pendingWritesRef.current[`buzzer:${orderKey}`]?.v as number|null|undefined,[])
  const[loading,setLoading]=useState(true)
  const[error,setError]=useState<string|null>(null)
  const[lastRefresh,setLastRefresh]=useState(new Date())
  // ── ?tab= RESTORES THE ACTIVE TAB (V9.6) ─────────────────────────────────────────────────────────
  // A reload used to land on Orders whatever the operator was doing. Straight into the useState
  // INITIALISER — no ref and no effect needed, unlike ?event=, because this validates against a
  // hardcoded list rather than against fetched data, so the answer is available at mount.
  // ⚠️ A MEMBERSHIP TEST, NOT A TYPE ASSERTION. `as typeof activeTab` on a URL string compiles happily
  // and would put an impossible value into state; `.includes()` cannot.
  // Unknown or absent falls through to 'orders' — same rule as ?event=, silently, no error.
  const[activeTab,setActiveTab]=useState<'orders'|'add'|'stock'|'settings'>(()=>{
    const t=searchParams.get('tab')
    return (TAB_VALUES as readonly string[]).includes(t??'') ? (t as 'orders'|'add'|'stock'|'settings') : 'orders'
  })
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
  // Change-event-finish-time target. Non-null mounts the SHARED modal, which owns the picker/confirm
  // split internally — so there is no draft state on this screen to leak between opens.
  const[finishTimeTarget,setFinishTimeTarget]=useState<{id:string;end_time:string|null;event_date:string|null}|null>(null)
  const[finishTimeBusy,setFinishTimeBusy]=useState(false)
  // DEMO: event actions are shown-but-locked; clicking any of them (event bar OR AddOrderPanel) opens this
  // one explainer instead of mutating anything. Centralised here so both surfaces share it.
  const[showDemoEventLock,setShowDemoEventLock]=useState(false)
  // Styled "finish event" confirm (replaces window.confirm). early → harder warning naming the end.
  const[finishConfirm,setFinishConfirm]=useState<{eventId:string;early:boolean;endTime:string}|null>(null)
  const[eventNoteInput,setEventNoteInput]=useState('')
  // ── 🔴 TAPPING A PUSH NOTIFICATION OPENS THAT ORDER. THIS IS THE HANDLER THAT WAS NEVER PASSED. ────
  // lib/native/push.ts has accepted an onOpenOrder callback since it was written and all three call sites
  // in DeviceSetupGate passed only the token, so the tap listener resolved `onOpenOrder` to undefined and
  // did nothing. BOTH PLATFORMS. It was invisible because iOS has never obtained a push token.
  // ── WHAT "OPEN THE ORDER" MEANS ON THIS SURFACE ───────────────────────────────────────────────────
  // The dashboard IS the screen the order lives on, so opening it is two moves: show the orders tab (the
  // operator may have been on Add/Stock/Settings) and bring the card into view. It deliberately does NOT
  // open the edit modal or take any action — a notification tap is navigation, never a decision.
  // ⚠️ THE ORDER MAY NOT BE ON THIS BOARD. It can belong to a different event, or have been confirmed and
  // cleared from another device, or the board may not have polled yet. `document.getElementById` then
  // returns null and this MUST NOT leave the operator on a blank screen — so the tab switch stands on its
  // own and a toast names the order rather than an error appearing. See docs/native-fixes-report.md A5.
  // ⚠️ TWO ANIMATION FRAMES, NOT ONE. The tab switch is a state change; the card does not exist in the DOM
  // until React has committed that render. One frame is the commit, the second is after paint.
  const openOrderFromPush=useCallback((orderKey:string)=>{
    setActiveTab('orders')
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      const el=document.getElementById(`order-${orderKey}`)
      if(el){el.scrollIntoView({behavior:'smooth',block:'center'});return}
      showToast('That order is not on this board - check the event','error')
    }))
  },[showToast])
  // ── EVENT-CANCEL GATE (was window.confirm) ──────────────────────────────────────────────────────
  // The TruckEvent itself, not an id: the shared modal names the venue, the date and the time window,
  // none of which an id carries. `null` is closed — the modal is mounted conditionally, so every open is
  // a fresh mount with empty reason/note fields and nothing can leak between events.
  const[eventCancelTarget,setEventCancelTarget]=useState<TruckEvent|null>(null)
  // Orders that will be cancelled with it. Seeded 0 and filled by /api/events/affected-orders, exactly as
  // manage does it; 0 renders no line, so an in-flight count never claims "0 orders".
  const[eventCancelCount,setEventCancelCount]=useState(0)
  const[eventCancelBusy,setEventCancelBusy]=useState(false)
  const[pendingOpenEventPicker,setPendingOpenEventPicker]=useState(false)
  const[autoAccept,setAutoAccept]=useState(false)
  const[savingAutoAccept,setSavingAutoAccept]=useState(false)
  const[savingAddOrderLayout,setSavingAddOrderLayout]=useState(false)
  // ── PAID STEP (V9.4) ──────────────────────────────────────────────────────────────────────────
  // showPaidStep=false (the DB default) means every paid-step affordance below is inert and the
  // operator surface is byte-identical to before. payments = order_key → order_payments rows, shipped
  // by /api/dashboard so the card can call getOrderBalance without a second fetch.
  // The dashboard no longer OWNS these — the truck defaults live in Manage → Settings. What it owns is
  // the per-EVENT override, written to truck_events.show_paid_step_override for the current event only.
  const[savingPaidStepOverride,setSavingPaidStepOverride]=useState(false)
  const[savingTakesCashOverride,setSavingTakesCashOverride]=useState(false)
  const[savingCompletionOverride,setSavingCompletionOverride]=useState(false)
  // 🔴 TEMPORARY — delete with the online-payments switch. NOT a per-event override: this one is
  // TRUCK-WIDE and lives on trucks.online_payments_paused_at, which is why it is not in the card with
  // the three that are. State is held on `truck`, not here; only the in-flight flag is local.
  const[savingOnlinePaymentsPause,setSavingOnlinePaymentsPause]=useState(false)
  const[payments,setPayments]=useState<Record<string,any[]>>({})
  // Order keys whose ledger write is on record as having FAILED (audit after_state.ledger_failed).
  // Server-derived, so it survives a poll, a reload, a different device and an offline replay whose
  // response nobody read. Paired with the live balance by hasUnrecordedPayment — never used alone.
  const[paymentFailures,setPaymentFailures]=useState<Set<string>>(new Set())
  // ── OFFLINE PAYMENT OVERLAY ──────────────────────────────────────────────────────────────────────
  // 🔴 `confirmedPaid` is computed HERE from getOrderBalance — the same resolver the card uses — so the
  // overlay knows when the server has caught up WITHOUT re-deriving a balance anywhere. It is the ledger,
  // not the status, that clears a pending payment chip.
  const paymentOrders=useMemo(()=>orders.map(o=>({
    order_key:o.order_key,
    /* 'part_refunded' counts as settled here for the same reason as 'refunded': nothing is outstanding. */
    confirmedPaid:(()=>{const b=getOrderBalance(o as never,payments[o.order_key]??[]);return b.status==='paid'||b.status==='refunded'||b.status==='part_refunded'})(),
  })),[orders,payments])
  const{overlay:paymentOverlay,refresh:refreshPendingPayment}=useOfflinePaymentOverlay(paymentOrders)
  // ── THE CONFLICT SIGNAL ──────────────────────────────────────────────────────────────────────────
  // 🔴 ONE source for BOTH the banner and the per-order card marker, so they can never disagree about
  // what is conflicted or what has been acknowledged. See lib/native/useOutboxConflicts.ts.
  const{conflicts:outboxConflicts,byOrderKey:conflictByOrder,acknowledge:acknowledgeConflicts}=useOutboxConflicts()
  // 🔴 THE BANNER CANNOT NAME AN ORDER ON ITS OWN — the op carries only order_key. THIS surface holds the
  // orders, so it resolves the display id. Falls back to the provisional id an offline create was given
  // (the number the operator was actually shown), then to null — which the banner degrades honestly on
  // rather than inventing an order number somebody would go hunting for.
  const resolveConflictLabel=useCallback((c:{order_key:string;provisional_id:string})=>{
    const o=orders.find(x=>x.order_key===c.order_key)
    return o?`#${o.id}`:(c.provisional_id?`#${c.provisional_id}`:null)
  },[orders])
  // ── THE SERVER-SIDE MONEY FAILURE, FOLDED INTO THE SAME MARKER ───────────────────────────────────
  // 🔴 TWO SOURCES, ONE VOCABULARY. A failed offline replay (outbox conflict) and a failed server-side
  // ledger write are the same fact to an operator — "money went wrong on this order" — so they must not
  // produce two different red bars. They meet HERE, and everything downstream sees one `conflict` prop
  // and the one marker OrderCard already renders. Inventing a second alerting mechanism is the failure
  // this fold exists to prevent.
  // ⚠️ PAYMENT WINS, matching useOutboxConflicts' own rule: an order with a failed status op AND missing
  // money is a money problem first.
  // ⚠️ The server signal is NOT acknowledgeable and must not become so. An outbox conflict is hidden by
  // the operator because the op is dead and only they can judge it; this one clears by ITSELF the moment
  // the payment is recorded, because hasUnrecordedPayment re-reads the live balance every render. A
  // dismiss button here would let an operator hide missing money.
  const cardConflict=useCallback((o:Order):'payment'|'status'|undefined=>{
    if(hasUnrecordedPayment(o as never,payments[o.order_key]??[],paymentFailures.has(o.order_key)))return 'payment'
    return conflictByOrder.get(o.order_key)
  },[payments,paymentFailures,conflictByOrder])
  // ── 🔴 AN OFFLINE WALK-UP PAID AT CREATION MUST NOT BE OFFERED "Mark paid" (14 August 2026) ────────
  // OBSERVED on a live iPad: two walk-ups created offline and paid at creation rendered a live "Mark
  // paid" button. The operator's rational response is to ask the customer to pay again; the second tap
  // books nothing (recordCollectionPayment short-circuits on balanceMinor <= 0) but returns success
  // silently, so cash goes in the till with no row against it.
  // 🔴 WHY THE CARD COULD NOT KNOW. OrderCard derives paid-ness from getOrderBalance(order, ledgerRows),
  // and the ledger is SERVER-SIDE — offline there are no rows, so balanceMinor is the full total and the
  // order reads unpaid. `payment_status` cannot help: getOrderBalance takes BalanceableOrder
  // ({ total_minor?, total? }) and never sees that field. See docs/paid-button-options-report.md.
  // ⚠️ NO NEW PROP. `pendingPayment` already exists for exactly this shape of problem (a payment the
  // operator has made that the server has not confirmed) and short-circuits effectivePaid BEFORE isPaid
  // is consulted. This only supplies it for a case it never covered: money that rode inside a
  // kind:'create' op rather than arriving as a `mark_paid` action.
  // 🔴 IT LAYERS ON THE RESOLVER'S OUTPUT AND CHANGES NO ARITHMETIC. getOrderBalance still runs, `balance`
  // is still the confirmed state, and every other consumer — the printed ticket, confirmedPaid, the
  // ledger — is untouched. A fabricated ledger row was the rejected alternative, precisely because it
  // would have corrupted the resolver's INPUT and reached all of them.
  // 🔴 THE UNPAID CASE IS EXPLICIT, NOT A FALL-THROUGH. Both live trucks run show_paid_step = true, so a
  // deliberately-unpaid walk-up is a real case and MUST still be offered the button. It resolves to
  // 'pending_unpaid', which effectivePaid reads as false — the same answer as today, said out loud.
  // ⚠️ READ FROM THE QUEUED RECORD, not from `o`: `o` may be a statusOverlay-merged copy, and the queued
  // entry is the authoritative copy of what was actually sent (AddOrderPanel derives payment_status there
  // from the same `paymentTaken` the outbox body carries, so the two cannot diverge).
  const queuedPayment=useCallback((o:Order):'pending_paid'|'pending_unpaid'|undefined=>{
    const q=deviceQueuedOrders.find(x=>x.order_key===o.order_key)
    if(!q)return undefined              // not queued → online path, byte-identical to before
    return q.payment_status==='paid'?'pending_paid':'pending_unpaid'
  },[deviceQueuedOrders])
  const[notesRequireReview,setNotesRequireReview]=useState(true)   // safe-by-default
  const[savingNotesReview,setSavingNotesReview]=useState(false)
  const[vanAutoPause,setVanAutoPause]=useState<boolean>(false)
  const[eventOfflineOverride,setEventOfflineOverride]=useState<boolean|null>(null)
  // Order-ready (master-switch model): the van DEFAULT (order_ready_enabled — the Settings master switch +
  // seed for new events) + the per-event value (order_ready_override, concrete true/false). effectiveOrderReady
  // resolves override ?? default ?? false server-side and gates the Ready button; the dashboard toggle reads it.
  const[vanOrderReadyDefault,setVanOrderReadyDefault]=useState<boolean>(false)
  const[eventOrderReadyOverride,setEventOrderReadyOverride]=useState<boolean|null>(null)
  // Buzzers. vanBuzzerCount is the VAN's rack (null ⇒ this van has no buzzers and every buzzer
  // affordance stays hidden — no chip, no Add Order button, no Settings row). Both are RESOLVED
  // server-side by lib/buzzer.ts and delivered by /api/dashboard, so the dashboard, the KDS and Add
  // Order can never disagree about them — the same arrangement the paid step uses.
  const[vanBuzzerCount,setVanBuzzerCount]=useState<number|null>(null)
  const[effectiveBuzzerPrompt,setEffectiveBuzzerPrompt]=useState<boolean>(false)
  const[savingBuzzerPrompt,setSavingBuzzerPrompt]=useState(false)
  // The order whose buzzer grid is open (card path). Null ⇒ closed.
  const[buzzerTarget,setBuzzerTarget]=useState<Order|null>(null)
  const[savingBuzzer,setSavingBuzzer]=useState(false)
  // Conflict-resolution losses (phase 2). Server-computed like capacityBreaches.
  // 🔴 dismissal is a SET of order_keys, not a single signature: dismissing #12 must never suppress
  // #15 later in the same service. See the note in BuzzerLostBanner.
  const[buzzerLosses,setBuzzerLosses]=useState<BuzzerLoss[]>([])
  const[dismissedBuzzerLosses,setDismissedBuzzerLosses]=useState<Set<string>>(new Set())
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
  // 🔴 THE COMPLETED ROW'S MODAL, WHICH IS THE ACTIVE LIST'S MODAL. One order_key at a time — the row
  // has no card and no local state of its own, so the page holds which one is open.
  const[payModalOrder,setPayModalOrder]=useState<string|null>(null)
  const[struckPrep,setStruckPrep]=useState<Set<string>>(new Set())
  const[undoPrep,setUndoPrep]=useState<{name:string;qty:number}|null>(null)
  const[categoryConfigs,setCategoryConfigs]=useState<Record<string,{secs:number;batch:number}>>({})
  const[categoryAllowNotes,setCategoryAllowNotes]=useState<Record<string,boolean>>({})
  const[editingCatId,setEditingCatId]=useState<string|null>(null)
  const[editCatForm,setEditCatForm]=useState<{name:string;prepMins:number;prepSecs30:number;batch:number;allowNotes:boolean}|null>(null)
  const[savingCat,setSavingCat]=useState(false)
  const[showPrepList,setShowPrepList]=useState(false)
  const[showPrepTimeBanner,setShowPrepTimeBanner]=useState(false)
  // PER-DEVICE keep-screen-on pref (mirrors sound's hg_sound_${token}). Read SYNCHRONOUSLY here via a lazy
  // initializer — NOT a useEffect — so the value is known at first paint and the KeepAwakePrompt can't flash
  // for an operator who turned it off. SSR-guarded (localStorage is client-only). Default ON.
  // Per-device keep-screen-on pref. OPERATORS: unchanged — defaults ON (opt-OUT via 'off'), because a
  // kitchen screen going dark mid-service is a real problem.
  // DEMO: defaults OFF (opt-IN via 'on'). KeepAwakePrompt renders `iff pref ON && lock not held`, so an
  // ON default means a prospect's very first paint carries an orange "Keep screen on 👆" call-to-action —
  // unpolished, and meaningless to someone browsing a demo on a laptop. Flipping the DEFAULT (rather than
  // suppressing the banner) keeps the Screen on/off toggle fully working: if the visitor deliberately turns
  // it on, the pref writes 'on' and every normal behaviour — banner included — resumes.
  const[keepScreenOn,setKeepScreenOn]=useState(()=>{
    if(typeof window==='undefined')return !isDemo
    const pref=localStorage.getItem(`hg_keepawake_${token}`)
    return isDemo?pref==='on':pref!=='off'
  })
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
  // PER-DEVICE sound CONFIG. Lazy initializer, SSR-guarded — read at FIRST PAINT, not in a useEffect,
  // per the keep-screen-on lesson (an effect runs after paint; for sound that window could ding).
  // null = this device has never seeded; the seed effect below fills it from trucks.sound_config.
  const[storedSoundCfg,setStoredSoundCfg]=useState<SoundConfig|null>(()=>typeof window==='undefined'?null:readSoundConfig(token))
  // 🔴 SEED-ON-FIRST-LOAD. Runs only when this device has NO stored config AND the truck's value has
  // actually arrived. Waiting for truck.sound_config is the whole point: seeding from the hardcoded
  // default in the pre-load window would silently reset a truck that configured sound deliberately.
  useEffect(()=>{
    if(storedSoundCfg!==null)return
    if(truck?.sound_config===undefined)return          // payload not in yet — wait, do NOT default
    setStoredSoundCfg(seedSoundConfig(token,truck.sound_config))
  },[storedSoundCfg,truck?.sound_config,token])
  // ONE resolution point for every consumer on this surface.
  const soundCfg=effectiveSoundConfig(storedSoundCfg,truck?.sound_config)
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
  /** The ONE list, mirrored from lib/payments/refund's REFUND_REASONS. Value = what the server and the
   *  audit log record; label = what the customer reads in the cancellation email. */
  const CANCEL_REASONS: [string,string][] = [
    ['customer_cancelled','Customer cancelled'],
    ['item_unavailable','Item unavailable'],
    ['not_collected','Order not collected'],
    ['wrong_or_missing_item','Wrong or missing item'],
    ['quality_issue','Quality issue'],
    ['duplicate_payment','Duplicate payment'],
    ['other','Other'],
  ]
  // ── 🔴 CANCELLING A PAID ORDER IS TWO DECISIONS, NOT ONE. ──────────────────────────────────────
  // Whether to cancel, and whether the money goes back. They are separate because a no-show — the truck
  // cooked the food and nobody came — is a real cancellation that must NOT return the money, and
  // assuming every cancellation refunds would hand it back without asking.
  const[cancelRefund,setCancelRefund]=useState(true)
  const[cancelError,setCancelError]=useState<string|null>(null)
  const[cancelBusy,setCancelBusy]=useState(false)
  /** A reason is REQUIRED when this cancellation will send money back, because the refund records it. */
  const cancelNeedsRefundReason=!!cancellingOrder&&cancelRefund&&(()=>{const rows=payments[cancellingOrder.order_key]??[]
    return Math.max(0,rows.filter((r:any)=>r.kind==='charge'&&r.channel==='online').reduce((t:number,r:any)=>t+r.amount_minor,0)
      -rows.filter((r:any)=>r.kind==='refund').reduce((t:number,r:any)=>t+r.amount_minor,0))>0})()
  const[cancelNote,setCancelNote]=useState('')
  // Reject (pending-order review) — REQUIRED reason, mirrors the cancel modal pattern.
  const[showRejectModal,setShowRejectModal]=useState(false)
  const[rejectingOrder,setRejectingOrder]=useState<Order|null>(null)
  // 🔴 `rejectReason` / `rejectNote` MOVED INTO components/shared/RejectOrderModal — the modal is mounted
  // conditionally, so it UNMOUNTS on every exit and those two fields are cleared by construction rather
  // than by three arms remembering to call one reset. That is strictly stronger than what resetRejectModal
  // did for them, and it is why they are not replaced here.
  // ── 🔴 ONE RESET PER MODAL, CALLED BY EVERY ARM. THE DEFECT WAS THREE CALL SITES, NOT ONE OF THEM. ──
  // Both real arms cleared five pieces of state; the Android back closer cleared ONE (`setShowCancelModal
  // (false)`), so a back-dismiss carried the reason, the customer-facing note AND the refund decision to
  // the NEXT order cancelled. The modal has no close glyph, no backdrop dismiss and no Escape, so before
  // the back handler existed that path did not exist either — the handler created it.
  // 🔴 THE FIX IS NOT A FOURTH CALL SITE. Three hand-maintained copies is the defect; a fourth copy is
  // more of it. Every way out of these modals now goes through one function, so a piece of state added
  // here is cleared by every arm at once and cannot be forgotten by one of them.
  // ⚠️ `cancelBusy` IS DELIBERATELY NOT RESET HERE. It is owned by the in-flight refund
  // (confirmCancelOrder sets and clears it around the await), and every arm is unreachable while it is
  // true — the buttons are `disabled={cancelBusy}`. Clearing it here would be this function reaching into
  // a request it does not own.
  const resetCancelModal=()=>{
    setShowCancelModal(false);setCancellingOrder(null)
    setCancelReason('');setCancelNote('')
    setCancelRefund(true)      // 🔴 THE DANGEROUS ONE — back to "refund the customer" every time
    setCancelError(null)
  }
  // ⚠️ TWO FIELDS FEWER THAN BEFORE, AND NOT BECAUSE THEY STOPPED BEING CLEARED. The reason and the note
  // now live inside the shared modal, which unmounts on every exit — see the state note above. This
  // function still runs from all three arms (confirm, "Keep order", Android back), unchanged.
  const resetRejectModal=()=>{
    setShowRejectModal(false);setRejectingOrder(null)
  }
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
  // `deals[].lockedValue` is what each stored deal actually contributes to the order total AS PLACED
  // (its stored bundle price + its stored slot-modifier surcharges). Removing a deal must subtract
  // that, not the deal's CURRENT menu price — prices on an existing order are locked server-side, so
  // subtracting today's bundle price would make this preview disagree with what the save produces.
  const[editOrderBaseline,setEditOrderBaseline]=useState<{total:number;itemsSubtotal:number;deals:Array<{name:string;lockedValue:number}>}|null>(null)
  // UNPRICEABLE-LINE prompt. Prices on an existing order are LOCKED server-side (they come from the
  // stored row), so there is no menu-drift delta to confirm — the only thing the server stops for is a
  // NEWLY ADDED item / modifier / deal whose name is not on the live menu, which therefore has no
  // authoritative price. NOTHING was written when this is set. `signature` is the basket this verdict
  // was computed for, so the banner can hide itself the moment the operator changes anything.
  const[editReprice,setEditReprice]=useState<{total:number;unresolved:Array<{kind:string;name:string;on?:string;advisoryPrice:number}>;signature:string}|null>(null)
  const[editItemModal,setEditItemModal]=useState<{item:MenuItem;modGroups:ModifierGroup[];allowNotes:boolean}|null>(null)
  const[editModalMods,setEditModalMods]=useState<{name:string;price:number}[]>([])
  const[editModalNotes,setEditModalNotes]=useState('')
  const[copiedOrderLink,setCopiedOrderLink]=useState(false)
  // DEMO ONLY — the order key DemoLoopComplete's "Show me" has just scrolled to, so its card can carry
  // the settled ring. Set only by that component (which only renders when isDemo), and read only in the
  // `isDemo&&` ternaries on the two OrderCard grids, so on a live board it is null for the page's whole
  // life and every card renders byte-for-byte what it did before.
  const[highlightOrderKey,setHighlightOrderKey]=useState<string|null>(null)
  // DEMO ONLY — the server-side session block from /api/dashboard (see the route). Null for an operator
  // truck, where the key isn't sent at all.
  const[demoSession,setDemoSession]=useState<{extraction_source:string|null;email:string|null;expires_at:string|null}|null>(null)
  // DEMO ONLY — "Start a new service" (the elapsed-event card below).
  const[restarting,setRestarting]=useState(false)
  // The SAME in-flight flag as `restarting`, held in a ref so the re-entry guard is SYNCHRONOUS.
  // `disabled={restarting}` only takes effect on the next render, so two clicks inside one frame can
  // both read restarting===false and fire two restarts — and the second would delete the orders the
  // first just seeded. The ref closes that window; the state drives the button's busy label.
  const restartingRef=useRef(false)
  const[restartError,setRestartError]=useState<string|null>(null)
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
  // The ?event= param AS IT WAS AT MOUNT. A ref, not state: it is consumed exactly once by the
  // auto-select effect (priority 0) and must not react to the replaceState the sync effect performs,
  // or the URL would re-select on every change. Null when absent ⇒ the no-param path is untouched.
  const urlEventParamRef=useRef<string|null>(searchParams.get('event'))
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
        // DEMO session block (/api/dashboard). Read HERE, in the config branch, not the live one below:
        // extraction_source never changes, and email/expires_at change at most once or twice in a session,
        // so re-reading them on every 60s poll would be waste. Config seeding runs on nav/auth/event-switch
        // only, which is exactly the cadence this data warrants. Absent key ⇒ not a demo ⇒ stays null.
        if(data.demo!==undefined)setDemoSession(data.demo)
        // keep_screen_on is now a PER-DEVICE localStorage pref (see the keepScreenOn useState) — NOT read
        // from the truck row. (The trucks.keep_screen_on column is dormant; it was never in the /api/dashboard
        // truck map anyway, so this read always resolved to the default — the bug this fix removes.)
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
        // Buzzers — CONFIG, so they sit inside the seed gate with the rest of the van/event settings.
        // applyPending guards the prompt for the same reason effectiveOrderReady is guarded: a reseed
        // fired by the operator's own write must not clobber the value that write is still committing.
        if(data.vanBuzzerCount !== undefined) setVanBuzzerCount(data.vanBuzzerCount??null)
        setEffectiveBuzzerPrompt(applyPending('effectiveBuzzerPrompt',data.effectiveBuzzerPrompt??false))
        configSeededRef.current=true
      }
      // ── LIVE — merged on EVERY fetch (poll/realtime/nav). Changes WITHOUT the operator (new orders,
      //    server offline-auto-pause, other devices) → must keep polling. ⚠️ THIS is the explicit LIVE
      //    ALLOWLIST; adding a field puts it back in the clobber path. Dual-source live+optimistic fields
      //    (manual pause, extra-wait) go through applyPending so a mid-write poll can't clobber them. ──
      // ── BUZZER GUARD — applied AFTER mergeOrders, so it has the last word. ──────────────────────
      // Release first, against the RAW SERVER ROWS (not the merged result — that may still be carrying
      // the optimistic value, which would release every guard immediately). Then apply whatever is
      // still pending over the merge, so a poll that started before the write cannot revert a cell the
      // operator is looking at. See lib/buzzer.ts.
      const incomingOrders=data.orders||[]
      for(const k of echoedBuzzerKeys(incomingOrders,peekPendingBuzzer)) delete pendingWritesRef.current[`buzzer:${k}`]
      setOrders(prev=>applyPendingBuzzers(mergeOrders(prev,incomingOrders),peekPendingBuzzer))
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
      if(data.buzzerLosses !== undefined) setBuzzerLosses(data.buzzerLosses || [])                        // phase 2 — orders that lost a buzzer to conflict resolution
      if(data.payments !== undefined) setPayments(data.payments||{})
      // ⚠️ GUARDED SEPARATELY, exactly like every sibling above. A partial refresh that omits the field
      // must leave the previous value alone — clearing it would flip every held order back to reading
      // "collect at the hatch" for one poll.
      if(data.heldAuthorisations !== undefined) setHeldAuthorisations(new Set<string>(data.heldAuthorisations||[]))
      if(data.paymentFailures !== undefined) setPaymentFailures(new Set<string>(data.paymentFailures||[]))
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
  },[token,pin,fetchMenu,fetchStock,applyPending,peekPendingBuzzer])

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
    // ── PRIORITY 0 — THE ?event= URL PARAM (V9.6) ─────────────────────────────────────────────────
    // WHY THIS EXISTS: selectedEventId was plain useState(null) with no persistence, so a reload threw
    // the selection away and priority 1 below grabbed today's OPEN event. An operator who selected
    // tomorrow's event, changed a per-event setting (cash, paid step, order-ready, offline protection)
    // and reloaded landed back on the live event — where that event's override reads NULL and inherits
    // the truck default. The write was CORRECT and INVISIBLE, which is far worse than a failed write.
    //
    // 🔴 OWNERSHIP IS VALIDATED BY MEMBERSHIP, NOT BY TRUST. upcomingEvents comes from
    // /api/events/manage?token=… which is `.eq('truck_id', truck.id)` server-side, so a param naming
    // ANOTHER TRUCK'S event simply is not in this list and is ignored. Never look the id up directly.
    // The same membership test also drops a DELETED event, a CANCELLED one (the route filters
    // `.neq('status','cancelled')`) and a PAST one (`upcoming=true` ⇒ `event_date >= today`). All four
    // fall through to the priority chain below, which is exactly the no-param behaviour.
    //
    // ONE-SHOT: consumed on the first resolution attempt whether or not it matched, so a later
    // replaceState (the sync effect below) can never feed back in and re-hijack the operator's choice.
    const fromUrl=urlEventParamRef.current
    if(fromUrl){
      urlEventParamRef.current=null
      const owned=upcomingEvents.find(e=>e.id===fromUrl)
      if(owned){console.log('[auto-select] priority 0 url param:',owned.id);setSelectedEventId(owned.id);return}
      console.warn('[auto-select] ?event= names an event not belonging to this truck (or deleted/past/cancelled) — ignoring:',fromUrl)
    }
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
  // ── KEEP ?event= AND ?tab= IN STEP WITH THE VIEW (V9.6) ─────────────────────────────────────────
  // 🔴 ONE EFFECT WRITES BOTH PARAMS. Do NOT add a second replaceState effect for a future param.
  // Two effects each doing `new URL(window.location.href)` → mutate → replaceState in the same commit
  // only work because React flushes effects in declaration order, so the second happens to read the URL
  // the first just wrote. Reorder them, or add a third, and one write silently clobbers another.
  // Keyed on [selectedEventId, activeTab]; a third param joins this effect and this dependency array.
  // ⚠️ replaceState, NOT router.push/replace. Two reasons, both load-bearing:
  //   • REPLACE, NOT PUSH — an operator comparing two events would otherwise stack a history entry per
  //     switch, and the back button would walk them backwards through every selection instead of
  //     leaving the dashboard.
  //   • history.replaceState, NOT router.replace — this is a pure URL rewrite with no Next navigation,
  //     so it triggers no re-render and no refetch. router.replace would re-run the route for a change
  //     that is purely cosmetic to the address bar.
  // The initial param was captured into a REF at mount, so this write cannot feed back into selection.
  // Clearing the selection (e.g. cancelling an event) DROPS the param rather than leaving a stale id in
  // a URL the operator might bookmark or send to someone.
  useEffect(()=>{
    if(typeof window==='undefined')return
    const url=new URL(window.location.href)
    const before=url.search
    if(selectedEventId) url.searchParams.set('event',selectedEventId)
    else url.searchParams.delete('event')
    // 'orders' is the default, so it is written as the ABSENCE of the param — a bare dashboard URL keeps
    // meaning "the default view", and today's links are unchanged.
    if(activeTab!=='orders') url.searchParams.set('tab',activeTab)
    else url.searchParams.delete('tab')
    if(url.search===before)return   // nothing moved — do not touch history
    window.history.replaceState(null,'',url.toString())
  },[selectedEventId,activeTab])
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
    // ── 🔴 THERE IS NO truck_vans SUBSCRIPTION HERE, AND THERE MUST NOT BE. READ THIS FIRST. ────────
    // IF YOU ARE HERE BECAUSE VAN PAUSE FEELS SLOW ON A SECOND DEVICE: that is expected. Cross-device
    // van pause propagates on the 60s poll below (fallbackInterval), and that is ACCEPTED, not a gap.
    // Adding `truck_vans` to the Supabase realtime publication would fix the latency and break the app.
    //
    // WHY PUBLISHING truck_vans IS NOT AN OPTION:
    //   • `last_heartbeat_at` lives on truck_vans, and /api/heartbeat UPDATEs it EVERY 15 SECONDS PER
    //     DEVICE (kds/page.tsx setInterval(sendHeartbeat, 15000)).
    //   • postgres_changes filters by ROW, not by COLUMN — `filter: truck_id=eq.X` cannot say "watch
    //     paused_until but ignore last_heartbeat_at". There is no column-level subscription.
    //   • So publishing it would make every heartbeat, from every van, fire a full /api/dashboard
    //     refetch on EVERY connected dashboard — a self-sustaining storm scaling with devices × vans.
    //   This is the same "wrong ratio" argument that declined a truck_events subscription (see the
    //   propagation ruling above savePaidStepOverride), an order of magnitude worse: 15 seconds versus
    //   a setting changed once a service.
    //
    // A subscription DID exist here until 30 July 2026. It had NEVER FIRED — truck_vans is not in the
    // realtime publication (live query: only `orders` and `trucks` are) — and its stated main case had
    // silently moved out from under it: the offline auto-pause now writes truck_events.online_paused_until,
    // NOT truck_vans (see the header of app/api/heartbeat/route.ts). It was dead twice over.
    //
    // WHAT ALREADY COVERS VAN PAUSE — nothing was lost by removing it:
    //   • the 60s poll below calls the SAME handler the subscription did (fetchAllRef.current());
    //   • vanPausedUntil / vanOnlinePausedUntil are set in fetchAll's LIVE block, OUTSIDE the seed gate,
    //     so every poll refreshes them;
    //   • the device that pauses is instant already (markPending('vanPausedUntil') + setVanPausedUntil);
    //   • offlinePausedDisplay makes a device's own reconnect instant regardless of DB state.
    //
    // ⚠️ IF INSTANT CROSS-DEVICE PROPAGATION IS EVER GENUINELY WANTED, the prerequisite is moving
    // `last_heartbeat_at` OFF truck_vans (its own table, or a column on something not watched) — NOT
    // publishing this one. Do that first, or not at all.
    const fallbackInterval=setInterval(()=>fetchAllRef.current(),60000)
    return()=>{
      supabaseBrowser.removeChannel(ordersChannel)
      supabaseBrowser.removeChannel(truckChannel)
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
    // Native acquires now; web can't (Safari denies a request outside a user activation) so this only sets
    // intent + reflects state — the KeepAwakePrompt BUTTON (a real click) acquires the web lock.
    //
    // 🔴 THE OLD NO-CLEANUP NOTE HERE WAS RIGHT ABOUT WHAT TO DO AND WRONG ABOUT WHY (corrected 5 Aug 2026).
    // Its reasoning was Android's: FLAG_KEEP_SCREEN_ON is a WINDOW flag that dies with its Window, so
    // "there is no OS path where a missing release strands the screen on." On iOS the plugin sets
    // UIApplication.shared.isIdleTimerDisabled — PROCESS-WIDE, surviving backgrounding, teardown and route
    // changes, cleared only by an explicit false. So a release path IS required, and its absence is why an
    // operator's screen stayed on with the setting off.
    // ✅ But the conclusion — do not release here — stands, for a different reason: releasing on unmount
    // treats a mid-service navigation as an exit. The release belongs to INTENT (setting off, backgrounding),
    // handled in lib/native/keepAwake.ts at module level so it works on every route. Not to lifecycle.
    prepareKeepAwake(keepScreenOn)
  },[authenticated,keepScreenOn])
  // 🚫 NO UNMOUNT RELEASE. One was added on 5 August 2026 and WITHDRAWN the same day — see the KDS copy of
  // this note and docs/keepawake-report.md. Releasing on unmount treats a mid-service navigation as an exit:
  // it left /manage holding no lock at all (that route has no keep-awake code and needs none), and on WEB
  // the re-acquire is a no-op without a user gesture, so every route change silently ended keep-awake until
  // the operator tapped the prompt. ✅ Persistence across client-side routes is the 2026-07-28 decision and
  // it was right. The release path lives on INTENT — setting off, and backgrounding — not on lifecycle.
  useEffect(()=>{
    // NEW-ORDER sound. Fires iff master (soundEnabled, per-device) && per-truck config.new_orders:
    //   'needs_confirming' → pending count rose (today's behaviour; misses auto-accepted orders)
    //   'all'              → a NEW order_key appeared (any status) → also dings auto-accepted 'confirmed'
    //                        orders — closes the gap where an auto-accept truck was silent on the dashboard
    //   'off'              → never
    // orders is event-scoped server-side. Fire only within the SAME event — an event SWITCH bringing in a
    // different set must not ping (soundEventRef guards it; on switch we just reset the baselines).
    const mode=soundCfg.new_orders
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
  },[orders,authenticated,selectedEventId,soundEnabled,soundCfg])

  useEffect(()=>{setQrFullscreenDataUrl(null)},[truck?.logo,truck?.qr_code_style])

  // Open the Kitchen Display. NATIVE: soft-route to the in-app KDS (/dashboard/[token]/kds — dashboard_token
  // based, authenticates natively; van preserved via query) so it stays in the webview — window.open('_blank')
  // escapes to Safari / no-ops in WKWebView. WEB: unchanged — new tab (van's standalone /kds/[kds_token], or
  // the in-app KDS when the van has no kds_token).
  // 🔴 THE EVENT TRAVELS WITH THE HANDOFF, EXACTLY AS THE VAN ALREADY DOES. Without it the KDS
  // re-derived its own answer and the two screens could sit on different events — observed 15 August:
  // this dashboard on tomorrow's event while the KDS held today's finished one with unserved orders.
  // The KDS treats this as a SEED it applies once and then holds; it does not follow later changes here,
  // which is deliberate (see the seed note in kds/page.tsx). Nothing about how THIS page picks its event
  // is touched — `selectedEventId` is read, never written, by this function.
  // ⚠️ Both routes carry it. The web branch opens a NEW TAB, which has no other way to know.
  // 🔴 THE EVENT ID COMES FROM `activeEvent`, NOT FROM `selectedEventId`, AND THAT IS THE SAME OBJECT
  // handleOpenKDS BELOW TAKES THE VAN FROM. `activeEvent` IS the resolution (`= resolvedEvent =
  // selectedOrDefaultEvent`), so when a selection exists the two are identical, and when one has not
  // committed yet this hands over the event the dashboard is ACTUALLY SHOWING rather than nothing at all.
  // ⚠️ A van derived from one event and an event id from another would be worse than asking every time —
  // the kitchen screen would open on event A scoped to event B's van. Deriving both from one value makes
  // that unrepresentable rather than merely unlikely.
  const openKDS=(van?:{id?:string;name?:string;kds_token?:string|null})=>{
    const ev=activeEvent?.id?`event_id=${encodeURIComponent(activeEvent.id)}`:''
    if(isNativeApp()){
      const parts=[
        van?.id?`van_id=${encodeURIComponent(van.id)}`:'',
        van?.id&&van.name?`van_name=${encodeURIComponent(van.name)}`:'',
        ev,
      ].filter(Boolean)
      router.push(`/dashboard/${token}/kds${parts.length?`?${parts.join('&')}`:''}`)
      return
    }
    // ⚠️ The van's STANDALONE /kds/[kds_token] surface is a different page and is left exactly as it
    // was — it has no dashboard behind it to hand anything over. Only the in-app KDS gains the seed.
    window.open(van?.kds_token?`/kds/${van.kds_token}`:`/dashboard/${token}/kds${ev?`?${ev}`:''}`,'_blank')
  }

  // ── 🔴 SKIP WHEN UNAMBIGUOUS, ASK WHEN NOT ──────────────────────────────────────────────────────
  // WHAT WAS WRONG: this keyed on `vans.length` ALONE, so a truck with two vans was asked which kitchen
  // screen to open EVERY time — even when the event on screen already named one. Device-observed: pick
  // Van1, go back to the dashboard, open the KDS again, get asked again. Nothing remembered anything
  // because nothing had to: the answer was already on the page and was not being read.
  // ⚠️ LIVE-VERIFIED that this changes NOTHING for either live truck — Pizzeria Gusto and Tikka Tonic
  // each have exactly one van, so both already took the first branch and never saw the picker.
  //
  // THE RULE, IN THE ORDER IT IS ASKED:
  //   1. no vans          -> open with none, exactly as before
  //   2. exactly one van  -> open with it, exactly as before
  //   3. the event names a van -> 🔴 NEW. Use it. An event bound to a van is not ambiguous, and this page
  //      already trusts `activeEvent.van_id` for the capacity writes and the van chip beside them
  //      (saveKitchenCapacity, saveCapacityWindow, and the "Total capacity" badge). Reading it here is
  //      consistency, not a new source of truth.
  //   4. several vans and the event names none -> ASK. That is the case the picker exists for.
  // 🔴 THE VAN AND THE EVENT COME FROM THE SAME `activeEvent`. See openKDS above.
  // ⚠️ The van must still be one of THIS truck's vans: `vans.find` is the membership test, so an event
  // carrying a stale or foreign van_id falls through to the picker rather than opening on a van that is
  // not in the list.
  const handleOpenKDS=()=>{
    if(vans.length===0){openKDS();return}
    if(vans.length===1){openKDS(vans[0]);return}
    const eventVan=activeEvent?.van_id?vans.find(v=>v.id===activeEvent.van_id):undefined
    if(eventVan){openKDS(eventVan);return}
    setShowKDSPicker(true)
  }

  // The ONE customer order URL — copy link, QR and the demo welcome popup all read this, so they can't
  // disagree about which host they point at. See customerUrlBase above for the demo/production split.
  const customerOrderUrl = truck?.slug ? `${customerUrlBase}/trucks/${truck.slug}/order` : null

  const handleCopyOrderLink=async()=>{
    const orderUrl=customerOrderUrl
    if(!orderUrl){showToast('Order URL not available — slug not set','error');return}
    try{
      await navigator.clipboard.writeText(orderUrl)
      setCopiedOrderLink(true)
      setTimeout(()=>setCopiedOrderLink(false),2000)
    }catch{/* clipboard permission denied — fail silently */}
  }

  // DEMO ONLY — wipe the finished service and provision a fresh one for now. The server does all the
  // work (app/api/demo/restart → lib/demo-restart); this only clears the CLIENT-side demo state the
  // server can't see, then RELOADS THE PAGE.
  //
  // 🔴 WHY A RELOAD, NOT A REFETCH. A restart DELETES the event, every order and the slot map, and
  // seeds new ones — so the client's event IDENTITY is destroyed, and a refetch cannot repair that:
  //   • `selectedEventId` still names the DELETED event, and the auto-select effect that would pick a
  //     new one bails on its first line whenever a selection is already set.
  //   • `selectedOrDefaultEvent` therefore resolves to null, and the "never blank the event bar"
  //     fallback (lastActiveEventRef) hands `activeEvent` back the deleted event object.
  //   • Everything keyed on activeEvent then reads a dead event: the header window, the
  //     New/Confirmed/Done counts (eventOrders filters orders on activeEvent.id, and the freshly
  //     seeded orders carry the NEW event_id, so it matches nothing), and demoServiceEnded — which is
  //     why the "service has ended" card survives its own button.
  //   • Meanwhile slots/productionSlotUnits/capacity are set WHOLESALE from the /api/dashboard
  //     response, and that route re-resolves the event server-side when the passed event_id no longer
  //     exists — so the capacity strip shows the NEW window while everything else shows the old one.
  //     That asymmetry is server-resolved data vs client-resolved identity, not a missing refetch.
  // Patching each of those by hand would be re-deriving a whole page load in pieces. A reload rebuilds
  // every derived value from one consistent server read, and this is a once-per-session action behind
  // a deliberate button press, so the cost is irrelevant.
  const startNewService=async()=>{
    // Synchronous re-entry guard — see restartingRef. A second restart mid-flight would delete the
    // orders the first one just seeded.
    if(restartingRef.current)return
    restartingRef.current=true
    setRestarting(true); setRestartError(null)
    try{
      const res=await fetch('/api/demo/restart',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})})
      const data=await res.json().catch(()=>({}))
      // 🔴 FAILURE PATH — NO RELOAD. The restart did not happen, so the board behind this card is still
      // the dead one. Reloading would drop the operator back onto the same ended service with the error
      // gone and nothing to press. Instead: keep the card, show the real error, re-enable the button.
      if(!res.ok){
        setRestartError(data?.error||'Could not start a new service — try again.')
        restartingRef.current=false; setRestarting(false)
        return
      }
      // RESET THE LOOP-COMPLETE STATE. Its baseline is a persisted list of order keys
      // (components/dashboard/DemoLoopComplete.tsx) — every key in it has just been deleted, so without
      // this the NEW seeded board reads as 37 orders the visitor caused and the prompt fires instantly
      // on load. Clearing both keys means the fresh board is re-baselined on next load and the visitor
      // gets the moment properly when they order on the new service. Same key names as the component.
      // MUST happen before the reload — localStorage outlives it, React state does not.
      try{
        localStorage.removeItem(`hg_demo_seen_orders_${token}`)
        localStorage.removeItem(`hg_demo_loop_${token}`)
      }catch{/* private mode — the baseline just re-records itself */}
      // SUCCESS, and only now. `restarting` is deliberately NOT cleared: the button stays disabled and
      // reading "Setting up…" until the document is replaced, so it is never pressable again in the gap.
      window.location.reload()
    }catch{
      // Network/parse failure — same as above: the restart may not have happened, so stay put.
      setRestartError('Could not start a new service — try again.')
      restartingRef.current=false; setRestarting(false)
    }
  }

  const handleShowQR=async()=>{
    const orderUrl=customerOrderUrl
    if(!orderUrl){showToast('Order URL not available — slug not set','error');return}
    setShowQRFullscreen(true)
    if(qrFullscreenDataUrl) return
    if(!truck) return
    try{
      const{generateQRWithLogo}=await import('@/lib/generateQRCode')
      const showBrandedQr=hasFeature(truck.plan,'branded_qr_code')&&truck.qr_code_style==='branded'
      // FIX 4 — DEMO renders the BRANDED composite with placeholder text where the logo would sit. It
      // shows the branded-QR feature working and hints at what signing up adds, without faking a logo the
      // visitor hasn't given us. Real trucks are unaffected (placeholder is ignored when a logo exists).
      setQrFullscreenDataUrl(await generateQRWithLogo(
        orderUrl,
        showBrandedQr?truck.logo:null,
        600,
        isDemo?'Your logo here':null,
      ))
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
    setPin(pinInput); setTruck(data.truck); setOrders(prev=>applyPendingBuzzers(mergeOrders(prev,data.orders||[]),peekPendingBuzzer)); setSlots(data.slots); setShowCookingStep(data.vanShowCookingStep??false); setEffectiveOrderReady(data.effectiveOrderReady??false)
    {const loadedId=selectedEventRef.current?.id; if(loadedId)setLoadedEventIds(p=>p.has(loadedId)?p:new Set(p).add(loadedId))} // EVENT-SWITCH GATE: mark loaded
    setAuthenticated(true); authenticatedRef.current=true; setRequiresPin(false)
    if(data.truck?.id){fetchMenu(data.truck.id,pinInput);fetchStock(pinInput,selectedEventRef.current?.id??null)}
  }

  // ── PRINT TRIGGER MODE — the TRUCK column is the single source of truth ──────────────────────────
  // 🔴 It was briefly mirrored into device Preferences by the Settings card. Two homes for one value with
  // nothing to arbitrate between them; the copy is gone. This follows saveAutoAccept exactly: POST the
  // set_* action, then patch local truck state so the card reflects the change before the next 60s poll.
  const savePrintTriggerMode=async(m:'lead_time'|'on_confirmed')=>{
    try{
      await fetch('/api/dashboard/action',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({token,pin,action:'set_print_trigger_mode',value:m})
      })
      setTruck(t=>t?{...t,print_trigger_mode:m}:t)
      showToast(m==='on_confirmed'?'Tickets will print when you accept an order':'Tickets will print shortly before collection')
    }catch{showToast('Failed to save','error')}
  }

  // ── MENU LAYOUT (trucks.add_order_layout) ──────────────────────────────────────────────────────────
  // Shape copied from saveAutoAccept directly below: POST one named action to /api/dashboard/action,
  // then patch the local `truck` so the Add order screen re-renders immediately instead of waiting for
  // the 60s poll. No optimistic local mirror state — `truck.add_order_layout` IS the value the control
  // reads, so there is nothing that can disagree with the server.
  // 🔴 THE STORE DID NOT MOVE. Still trucks.add_order_layout, 'tabs' | 'scroll'. Not localStorage, not
  // per-device, not a van column: the same value must reach every device this truck signs in on.
  const saveAddOrderLayout=async(value:'tabs'|'scroll')=>{
    if(truck?.add_order_layout===value)return
    setSavingAddOrderLayout(true)
    const prev=truck?.add_order_layout
    // Optimistic: the radio is the kind of control that must answer the tap instantly. Reverted below
    // if the write fails, so the dot can never claim a layout the server did not accept.
    setTruck(t=>t?{...t,add_order_layout:value}:t)
    try{
      const res=await fetch('/api/dashboard/action',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({token,pin,action:'set_add_order_layout',value})
      })
      if(!res.ok)throw new Error('save failed')
      showToast(value==='scroll'?'Menu shows as one page':'Menu shows separate categories')
    }catch{
      setTruck(t=>t?{...t,add_order_layout:prev}:t)
      showToast('Failed to save','error')
    }
    finally{setSavingAddOrderLayout(false)}
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

  // ── 🔴 TEMPORARY — ONLINE CARD PAYMENTS OFF/ON. DELETE WITH THE SWITCH. ────────────────────────────
  // TRUCK-WIDE, not per-event. It writes trucks.online_payments_paused_at and applies to every event
  // this truck runs, now and later, until it is turned back on. That is why it is NOT in the per-event
  // card and why the copy says so out loud — the house rule there ("scope is a property of the screen")
  // holds for that card, and this control is the exception that proves it, so it lives outside.
  //
  // SERVER-CONFIRMED, same shape as applyEventPatch: state is set from the TIMESTAMP THE SERVER MINTED,
  // never from a local clock, so the banner's "since" can never disagree with the row. Not optimistic.
  // ⚠️ The response carries ONLY this column, not the truck row — `trucks` holds the dashboard token and
  // pin, which /api/dashboard strips before they reach a browser. Patch the one field onto `truck`.
  const saveOnlinePaymentsPaused=async(paused:boolean)=>{
    setSavingOnlinePaymentsPause(true)
    try{
      const res=await fetch('/api/dashboard/action',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({token,pin,action:'set_online_payments_paused',value:paused})
      })
      if(!res.ok)throw new Error('write failed')
      const d=await res.json().catch(()=>({}))
      setTruck(t=>t?{...t,online_payments_paused_at:d?.online_payments_paused_at??null}:t)
      showToast(paused?'Card payments off — customers pay at the hatch':'Card payments back on')
    }catch{showToast('Failed to save','error')}
    finally{setSavingOnlinePaymentsPause(false)}
  }

  // ── SERVER-CONFIRMED EVENT PATCH (V9.6) ───────────────────────────────────────────────────────────
  // The handler returns the UPDATED ROW, so state is set FROM THE RESPONSE. Merged into upcomingEvents
  // by id — which is what activeEvent, the Settings toggles, OrderCard's `event` prop and AddOrderPanel's
  // liveEvent all derive from, so one patch reaches every consumer.
  //
  // 🔴 THIS IS NOT THE FLIP-BACK CLASS AND NEEDS NO applyPending GUARD. That class was OPTIMISTIC state
  // set BEFORE (or independently of) the commit, so a poll racing in between read the OLD value and
  // clobbered the new one. Here the value arrives in a response that the server sent AFTER committing,
  // so there is nothing to revert and any later read returns the same value or newer. A poll issued
  // AFTER this patch cannot carry stale data.
  // ⚠️ The one residual race, stated honestly: a poll issued BEFORE the commit but landing AFTER this
  // patch would overwrite with the pre-write value. It is unchanged from the previous `await fetchAll()`
  // (which had the identical exposure), it is bounded by one request round-trip, and the next poll
  // corrects it within 60s. Not introduced here, and not worth an optimistic guard.
  //
  // ⚠️ FALLBACK RETAINED, DELIBERATELY. No row (a zero-row update, or an older deploy that still returns
  // a bare {success:true}) ⇒ full refetch, i.e. exactly the previous behaviour. Never a silent no-update.
  const applyEventPatch=async(res:Response)=>{
    let ev:any=null
    try{ ev=(await res.clone().json())?.event ?? null }catch{ ev=null }
    if(ev?.id){
      setUpcomingEvents(prev=>prev.map(e=>e.id===ev.id?{...e,...ev}:e))
      setTodayEvents(prev=>prev.map(e=>e.id===ev.id?{...e,...ev}:e))
      return
    }
    await fetchAll()
  }

  // PER-EVENT ONLY. This writes truck_events.show_paid_step_override for the CURRENT event and must
  // NEVER write trucks.show_paid_step — that default belongs to Manage → Settings.
  //
  // ── 🔴 PROPAGATION IS A DECISION, NOT AN ACCIDENT. ──────────────────────────────────────────────
  // ⚠️ DO NOT "IMPROVE" THIS INTO AN OPTIMISTIC UPDATE OR A REALTIME SUBSCRIPTION. Ruled 30 July 2026
  // after all four options were costed:
  //   A · optimistic local update — REJECTED. It only speeds up the device that just saved, and it adds
  //       an optimistic/revert path in a class that has bitten THREE times (offline-protection,
  //       category-available, sound_config — the reason applyPending exists). New risk, no new coverage.
  //   B · refetch after the write — SUPERSEDED. It was correct but coarse, and it refreshed a source a
  //       consumer had privately COPIED, so a saved paid step stayed invisible to Add Order.
  //       ✅ NOW: applyEventPatch above — SERVER-CONFIRMED, state set from the returned row, with the
  //       refetch RETAINED as the no-row fallback. Strictly better than B and not optimistic: see the
  //       flip-back note on applyEventPatch. Other devices still pick the change up on the 60s poll.
  //   C · subscribe to truck_events — REJECTED. truck_events UPDATEs also fire on open/close, pause and
  //       every order_counter increment — potentially EVERY ORDER — so this would refetch config
  //       constantly to propagate a setting changed once a service. Wrong ratio.
  //   D · subscribe + compare the override columns to skip irrelevant UPDATEs — the RIGHT SHAPE, but it
  //       needs REPLICA IDENTITY FULL on truck_events, i.e. a MIGRATION. Cost it only if the
  //       multi-device story ever demands it; it is not warranted by anything today.
  // 🔴 truck_events is deliberately NOT in the realtime subscriptions — which are `orders` and `trucks`,
  // AND ONLY THOSE TWO. Those are also the only two tables in the Supabase realtime publication, so any
  // other subscription would be silently dead on arrival (a truck_vans one was, for months — see the
  // note in the subscription effect). That is not an oversight: it is option C, declined.
  // **Cross-device settings propagation at 60s is ACCEPTED.**
  // `val === null` CLEARS the override — this event goes back to following the truck default. Same
  // mechanism, wording and behaviour as the other two; see the handler for why NULL is a value here.
  const savePaidStepOverride=async(val:boolean|null)=>{
    if(!activeEvent)return
    setSavingPaidStepOverride(true)
    try{
      const res=await fetch('/api/dashboard/action',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({token,pin,action:'set_show_paid_step_override',value:val,eventId:activeEvent.id})
      })
      await applyEventPatch(res)
      showToast(val===null?USUAL_SETTING_TOAST:val?'Unpaid orders on for this event':'Unpaid orders off for this event')
    }catch{showToast('Failed to save','error')}
    finally{setSavingPaidStepOverride(false)}
  }

  // PER-EVENT ONLY, same rule as the paid step: writes truck_events.completion_presses_override for the
  // CURRENT event and NEVER trucks.completion_presses — that default belongs to Manage → Settings.
  // `val === null` CLEARS the override (back to the truck default); 'one'/'two' pin this event.
  // Same server-confirmed shape as savePaidStepOverride above (applyEventPatch, refetch as the no-row
  // fallback), and the propagation ruling recorded there applies here unchanged.
  const saveCompletionPressesOverride=async(val:'one'|'two'|null)=>{
    if(!activeEvent)return
    setSavingCompletionOverride(true)
    try{
      const res=await fetch('/api/dashboard/action',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({token,pin,action:'set_completion_presses_override',value:val,eventId:activeEvent.id})
      })
      await applyEventPatch(res)
      showToast(val===null?USUAL_SETTING_TOAST:val==='one'?'One press for this event':'Two presses for this event')
    }catch{showToast('Failed to save','error')}
    finally{setSavingCompletionOverride(false)}
  }

  // PER-EVENT ONLY, same rule as the paid step: writes truck_events.takes_cash_override for the CURRENT
  // event and NEVER trucks.takes_cash. The case this exists for is a card terminal failing mid-service.
  // ⚠️ The `await fetchAll()` here is the SAME ruled decision recorded above savePaidStepOverride —
  // option B, refetch. Do not convert it to an optimistic update or a truck_events subscription.
  // `val === null` CLEARS the override, same as the two above.
  const saveTakesCashOverride=async(val:boolean|null)=>{
    if(!activeEvent)return
    setSavingTakesCashOverride(true)
    try{
      const res=await fetch('/api/dashboard/action',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({token,pin,action:'set_takes_cash_override',value:val,eventId:activeEvent.id})
      })
      await applyEventPatch(res)
      showToast(val===null?USUAL_SETTING_TOAST:val?'Cash and card on for this event':'Cash and card off for this event')
    }catch{showToast('Failed to save','error')}
    finally{setSavingTakesCashOverride(false)}
  }


  // PER-EVENT ONLY. Writes truck_events.buzzer_prompt for the CURRENT event and must NEVER write
  // truck_vans.buzzer_count — the van default (whether this vehicle carries buzzers at all) is owned by
  // Manage → Settings. This toggle governs one thing: does the grid open by itself after a new order.
  // Same server-confirmed shape as savePaidStepOverride above (applyEventPatch, refetch as the
  // no-row fallback); the propagation ruling recorded there applies here unchanged.
  const saveBuzzerPromptOverride=async(val:boolean)=>{
    if(!activeEvent)return
    setSavingBuzzerPrompt(true)
    markPending('effectiveBuzzerPrompt',val)   // guard: a reseed mid-write can't clobber the optimistic value
    setEffectiveBuzzerPrompt(val)
    try{
      const res=await fetch('/api/dashboard/action',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({token,pin,action:'set_buzzer_prompt_override',value:val,eventId:activeEvent.id})
      })
      if(!res.ok)throw new Error('write failed')
      await applyEventPatch(res)
      showToast(val?'Buzzer prompt on for this event':'Buzzer prompt off for this event')
    }catch{
      delete pendingWritesRef.current['effectiveBuzzerPrompt']
      setEffectiveBuzzerPrompt(!val)   // revert optimistic on failure
      showToast('Failed to save','error')
    }
    finally{setSavingBuzzerPrompt(false)}
  }

  // ── THE BUZZER WRITE (card path) ────────────────────────────────────────────────────────────────
  // 🔴 Deliberately NOT the `edit` action: edit forces status:'modified', re-books production slot
  // capacity and EMAILS THE CUSTOMER. Handing over a pager does none of those. set_buzzer writes
  // buzzer_number and nothing else — see the handler in app/api/dashboard/action/route.ts.
  // ✅ PHASE 2 — ROUTED THROUGH gatedAction, kind:'buzzer'. Offline on native this is queued durably
  // rather than lost. 🔴 That matters more here than for a status op: a buzzer number is a PHYSICAL
  // FACT about a pager already in a customer's hand and cannot be re-derived from anything, so losing
  // the write means nobody has a record of it. The queued body carries the order's placed_at and a
  // `replay: true` marker (queuedExtra — online requests stay byte-identical), which is what lets the
  // server arbitrate a two-device conflict instead of last-writer-wins.
  // keepOpen (from the grid) ⇒ the order already had a buzzer when the picker opened, so a change must
  // NOT close it: the operator is switching and looking, and Done is what ends that. A first assignment
  // still closes, exactly as before.
  const saveBuzzer=async(orderKey:string,buzzerNumber:number|null,keepOpen=false)=>{
    // Read from the LIVE orders list, not from buzzerTarget: with the grid staying open, buzzerTarget
    // is the snapshot taken when the chip was tapped and goes stale after the first switch.
    const prior=orders.find(o=>o.order_key===orderKey)?.buzzer_number??null
    // ── OPTIMISTIC (see lib/buzzer.ts for the full why) ──────────────────────────────────────────
    // GUARD FIRST, THEN PATCH — the order matters. A refetch already in flight can land between these
    // two statements; registering the guard first means it gets overridden rather than winning.
    // Follows updateCategoryAvailable's shape exactly (shared pendingWritesRef, composite key), so the
    // grid turns the old cell green and the new one red the instant the operator taps, and a stale poll
    // cannot revert it.
    // The write's FULL local effect: this order gains the number, and any other in-event order holding
    // it loses it — the same two rows assignBuzzer touches server-side. Guarding both means the board
    // behind the modal is correct immediately, not after the refetch.
    const {next,prior:priorByKey}=planOptimisticBuzzer(orders,orderKey,buzzerNumber)
    for(const [k,v] of Object.entries(next)) pendingWritesRef.current[`buzzer:${k}`]={v}
    setOrders(prev=>prev.map(o=>o.order_key in next?{...o,buzzer_number:next[o.order_key]}:o))
    setSavingBuzzer(true)
    try{
      const placedAt=orders.find(o=>o.order_key===orderKey)?.placed_at??null
      const result=await gatedAction({
        url:'/api/dashboard/action',
        body:{token,pin,action:'set_buzzer',order_key:orderKey,buzzerNumber},
        kind:'buzzer',order_key:orderKey,online:isOnline(),
        // QUEUED-ONLY. `replay` flips the server to conflict-resolution mode; placedAt is the value it
        // arbitrates on (repair-only — the row normally already has it).
        queuedExtra:{replay:true,placedAt},
      })
      if(result.queued){
        // Durably queued. The optimistic patch already applied above and its guard HOLDS — do not drop
        // it here, or the next poll would revert the cell while the op is still waiting to replay.
        showToast(buzzerNumber==null
          ?`Buzzer ${prior??''} removed`
          :`Buzzer ${buzzerNumber} saved`)
        if(!keepOpen)setBuzzerTarget(null)
        setSavingBuzzer(false)
        return
      }
      const data=result.data??{}
      if(!result.ok)throw new Error(data.error||'write failed')
      // Name the order the buzzer came FROM when one was taken — the operator has just been told in the
      // confirm that it would happen, and the toast is the receipt that it did.
      const from=data.clearedFrom?.id?` (taken from #${data.clearedFrom.id})`:''
      // A removal NAMES the number that just went back to the rack — "Buzzer cleared" told the operator
      // an action had happened but not which pager they are now holding, which is the fact that matters.
      showToast(buzzerNumber==null
        ?(prior!=null?`Buzzer ${prior} removed`:'Buzzer removed')
        :`Buzzer ${buzzerNumber} assigned${from}`)
      if(!keepOpen)setBuzzerTarget(null)
      // The guard is NOT dropped here. It is released by fetchAll, and only once the SERVER row
      // actually carries the new value (echoedBuzzerKeys) — dropping it on the 2xx would re-open the
      // window for an already-in-flight stale read to revert the cell.
      await fetchAll()
    }catch{
      // ── THE WRITE FAILED — REVERT, AND SAY SO. ──────────────────────────────────────────────────
      // The one case where reverting is correct: the board must show what is actually recorded, not a
      // hopeful value a later refetch would silently undo. Drop the guard FIRST so the revert (and any
      // subsequent poll) is not immediately overridden by it.
      // 🔴 SURFACED, NEVER SILENT. The operator may already be holding the pager, so the toast names
      // the number that failed AND the state the order is really in.
      for(const k of Object.keys(next)) delete pendingWritesRef.current[`buzzer:${k}`]
      setOrders(prev=>prev.map(o=>o.order_key in priorByKey?{...o,buzzer_number:priorByKey[o.order_key]}:o))
      const who=buzzerTarget?.id?`order #${buzzerTarget.id}`:'this order'
      showToast(buzzerNumber==null
        ?`Could not remove buzzer ${prior} — it is still on ${who}`
        :`Could not give buzzer ${buzzerNumber} to ${who} — ${prior!=null?`it still has buzzer ${prior}`:'it still has no buzzer'}`,'error')
    }
    finally{setSavingBuzzer(false)}
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

  // PER-DEVICE sound config (V9.5). Writes localStorage for THIS device only and deliberately does NOT
  // write trucks.sound_config — that column is now a one-way SEED for devices that have never loaded.
  // No network call, so no optimistic/revert dance: the write is local and synchronous.
  // ⚠️ A failed write is SURFACED, not swallowed (see lib/sound-prefs.ts). The setting still applies for
  // this session; the toast tells the operator it will not survive a reload, which is the fact that
  // matters and the thing keep-screen-on's silent catch hid.
  const saveSoundConfig=(next:SoundConfig)=>{
    setStoredSoundCfg(next)
    if(!writeSoundConfig(token,next)) showToast('Sound saved for now, but this device could not store it — it will reset on reload','error')
  }

  const toggleOfflineProtection=async(value:boolean)=>{
    if(!activeEvent)return
    // DEMO HARD STOP. The card renders disabled, but styling is not enforcement — a disabled prop can be
    // bypassed (devtools, a stray programmatic call, a future refactor that forgets). This is the single
    // choke point every path to set_offline_protection goes through, so the guard belongs here.
    if(isDemo)return
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
    // PER-DEVICE pref (localStorage, per-token so two trucks on one iPad don't collide) — mirrors the sound
    // pref. Web + app share one path; read synchronously on mount (the useState initializer) so no flash and
    // no async DB round-trip. keepAwake()/allowSleep() above is the single applier.
    try{localStorage.setItem(`hg_keepawake_${token}`,value?'on':'off')}catch{}
    return st
  }
  const toggleKeepScreenOn=async()=>{
    // 🔴 BRANCHES ON THE SETTING, NOT ON `wakeState`. This used to test `screenHeld` — "the toggle acts on
    // REALITY" — which inverted the moment belief and reality diverged: a failed release publishes a
    // not-held state while the OS flag is still set, so every tap took the ENABLE branch and turning the
    // screen off became impossible. `wakeState` may DISPLAY (the green/grey chip, the KeepAwakePrompt); it
    // must never DECIDE. Turning ON is still the user gesture that acquires the web lock.
    if(keepScreenOn){
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
  // ── 🔴 THE REFUND SUBMIT. ONLINE ONLY, AND DELIBERATELY NOT THROUGH doAction. ──────────────────
  // doAction routes through `gatedAction`, which queues to the offline outbox when the device is off
  // the network. A refund is a Stripe call whose guards are computed from a position that moves — a
  // queued one would replay blind against a charge that may already have been refunded. So this posts
  // directly, and if the request cannot be made the operator is told rather than promised.
  // ⚠️ IT RETURNS WORDS, NOT A STATUS. The modal renders whatever comes back; the three outcomes that
  // matter (refunded · accepted-but-not-yet-moved · refused) each get their own sentence here.
  const submitRefund=async({orderKey,amountMinor,reason,note,context}:{orderKey:string;amountMinor:number;reason:string;note:string;context?:'cancellation'})=>{
    try{
      // `refund_context` suppresses the standalone refund email: a cancellation says what happened to
      // the money in its own sentence, and two emails for one event is worse than none.
      const res=await fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({token,pin,action:'refund',order_key:orderKey,amount_minor:amountMinor,reason,note,refund_context:context??null})})
      const data=await res.json().catch(()=>({}))
      const money=`£${(amountMinor/100).toFixed(2)}`
      if(!res.ok) return {ok:false,settled:false,message:typeof data?.error==='string'?data.error:'That refund could not be sent.'}
      fetchAll()
      // 🔴 "SENT" IS NOT "REFUNDED", AND THE PENDING CASE SAYS SO. Stripe accepts a refund on a direct
      // charge as `pending` when the connected account's balance is short; no money has moved yet and
      // the ledger is untouched. Reporting it as done would be the false-success class again.
      if(data?.pending) return {ok:true,settled:false,message:`${money} refund sent. Stripe is processing it — the order will show as refunded once the money has actually gone back.`}
      return {ok:true,settled:true,message:`${money} has been refunded to the customer's card.`}
    }catch{
      return {ok:false,settled:false,message:'We could not reach the payment system, so nothing was refunded. Check your connection and try again.'}
    }
  }

  // ── POST-GATE HANDLING — THE SHARED HANDLER (lib/native/useGatedActionResult) ────────────────────
  // 🔴 EXTRACTED, NOT REWRITTEN. Every branch, string, duration and Undo target below used to sit inline
  // in doAction; they moved verbatim and this surface is the reference the module was built from, so
  // nothing here renders or fires differently. What changed is that the KDS now runs the SAME code
  // instead of its own partial copy (it toasted only for 'ready' and swallowed errors entirely).
  // ⚠️ THE FOUR CALLBACKS BELOW ARE THIS SURFACE'S ALONE. `findOrder` keeps the deviceQueuedOrders
  // fallback (an offline-CREATED order is not in `orders` yet — the KDS has no create path); the two prep
  // callbacks are the solo-operator pill auto-clear, which the KDS has no equivalent of. The KDS's own
  // queued-op counter is the mirror case: it passes onQueued/onQueuedUndone and this surface does not.
  const handleGateResult=useGatedActionResult<Order>({
    showToast,
    findOrder:(k)=>orders.find(o=>o.order_key===k)??deviceQueuedOrders.find(o=>o.order_key===k),
    refreshPendingStatus,dropOverlayEntry,scheduleReadyEmail,undoReady,
    runAction:(a,k)=>doAction(a,k),
    refetch:fetchAll,setActionLoading,refreshPendingPayment,
    onPrepStrike:(orderKey,order)=>{
      setStruckPrep(prev=>{
        const n=new Set(prev)
        order.items.forEach((item:any)=>{
          for(let u=0;u<item.quantity;u++) n.add(`${orderKey}:${item.name}:${u}`)
        })
        return n
      })
    },
    onPrepUnstrike:(orderKey)=>{
      setStruckPrep(prev=>{const n=new Set(prev);prev.forEach(k=>{if(k.split(':')[0]===orderKey)n.delete(k)});return n})
    },
  })

  const doAction=async(action:string,orderKey:string)=>{
    if(action==='cancel'){const ord=orders.find(o=>o.order_key===orderKey)??null;setCancellingOrder(ord);setShowCancelModal(true);return}
    if(action==='reject'){const ord=orders.find(o=>o.order_key===orderKey)??null;setRejectingOrder(ord);setShowRejectModal(true);return}
    setActionLoading(`${action}-${orderKey}`)
    try{
      // Offline GATE (mirrors KDS): online → normal write; offline (native) → durable outbox + queued.
      const result=await gatedAction({url:'/api/dashboard/action',body:{token,pin,action,order_key:orderKey,...(action==='ready'?{defer_email:true}:{})},kind:'status',order_key:orderKey,online:isOnline(),expectedFrom:STATUS_REPLAY_EXPECTED_FROM})
      await handleGateResult(result,action,orderKey)
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
    setEditReprice(null)
    setEditSlots([]); setEditCapacityInputs(null); setEditServerCatConfigs({}); fetchEditSlots(order)
    setEditItems(order.items.map(i=>({...i,cartKey:makeCartKey(i.name,i.modifiers||[],i.specialInstructions)})))
    setEditDeals((order.deals||[]).map(d=>({name:d.name,slots:d.slots,slotModifiers:d.slotModifiers||{},slotNotes:d.slotNotes||{},isNew:false})))
    setEditSlot(order.slot||'')
    setEditNotes(order.notes||'')
    // "Walk-up" is the display default, not a real name — start the field empty for it so
    // it isn't shown as a pseudo-name (blank on save preserves the "Walk-up" default).
    setEditName(order.customer_name&&order.customer_name!=='Walk-up'?order.customer_name:''); setEditEmail(order.customer_email||''); setEditPhone(order.customer_phone||'')
    const itemsSubtotal=order.items.reduce((s,i)=>s+Number(i.unit_price)*i.quantity,0)
    setEditOrderBaseline({total:Number(order.total),itemsSubtotal,deals:(order.deals||[]).map(d=>({
      name:d.name,
      lockedValue:(Number(d.price)||0)+Object.values(d.slotModifiers||{}).flat().reduce((s,m)=>s+(Number(m?.price)||0),0),
    }))})
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
  // `confirmTotal` is the operator's explicit acknowledgement that lines the server could not price
  // are being saved at their advisory figure: the exact total the banner showed them. Absent on a
  // normal save. Existing prices are locked server-side, so an ordinary edit never sees the prompt —
  // it only fires for a NEWLY ADDED name that is not on the live menu.
  const submitEdit=async(confirmTotal?:number)=>{
    if(!editingOrder)return; setActionLoading(`edit-${editingOrder.id}`)
    const sendItems=editItems.filter(i=>i.quantity>0)
    try{
      const res=await fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'edit',order_key:editingOrder.order_key,editedOrder:{items:sendItems,deals:editDeals,slot:editSlot||null,notes:editNotes||null,customerName:editName,customerEmail:editEmail,customerPhone:editPhone,...(confirmTotal!==undefined?{confirmUnresolvedTotal:confirmTotal}:{})}})})
      const data=await res.json()
      // 409 + needsPriceConfirm: NOTHING was saved. Show what could not be priced and wait for an
      // explicit confirm, tagged with the basket it was computed for.
      if(res.status===409&&data?.needsPriceConfirm){
        setEditReprice({total:Number(data.total),unresolved:data.unresolved||[],signature:editBasketSignature(sendItems,editDeals)})
        return
      }
      if(!res.ok)throw new Error(data.error)
      setEditReprice(null)
      // A slot-rebooking failure does NOT undo the saved edit — the server reports it so the operator
      // knows the capacity board is stale, and surfacing it must not read as "the edit failed".
      showToast(data?.slotWarning??`Order #${editingOrder.id} updated`,data?.slotWarning?'error':'success')
      setEditingOrder(null); await fetchAll()
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
    if(r.queued)showToast('Stock saved')
  }
  const updateCategoryStock=async(category:string,stockCount:number|null)=>{
    const event_id=selectedEventRef.current?.id??null
    const key=event_id??'__none__'
    setCategoryStocksByEvent(prev=>{const cur=prev[key]??[];const ex=cur.find(s=>s.category===category);const next=ex?cur.map(s=>s.category===category?{...s,stock_count:stockCount}:s):[...cur,{category,stock_count:stockCount,default_stock:null,orders_count:0}];return{...prev,[key]:next}})
    const r=await gatedAction({url:'/api/dashboard/action',body:{token,pin,action:'set_category_stock',category,stockCount,event_id},kind:'stock',order_key:`${event_id??'none'}:set_category_stock:${category}`,online:isOnline()})
    if(r.queued)showToast('Stock saved')
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
    if(r.queued){delete pendingWritesRef.current[pk];showToast(`${category} availability saved`);return}
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
    if(r.queued)showToast('Stock saved')
  }
  const updateModifierOptionStock=async(optionId:string,stockCount:number|null)=>{
    const event_id=selectedEventRef.current?.id??null
    patchOption(optionId,{stock_count:stockCount}) // optimistic
    const r=await gatedAction({url:'/api/dashboard/action',body:{token,pin,action:'set_modifier_option_stock',optionId,stockCount,event_id},kind:'stock',order_key:`${event_id??'none'}:set_modifier_option_stock:${optionId}`,online:isOnline()})
    if(r.queued)showToast('Stock saved')
  }

  const openEvent=async(eventId:string)=>{
    // DEMO HARD STOP (§3 Stage 3: styling is not enforcement). Start/Restart is locked in demo; this is the
    // single choke point every caller (event-bar menu, AddOrderPanel) funnels through, so the guard belongs
    // here — before any fetch. The locked buttons open the explainer instead of calling this.
    if(isDemo)return
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

  // ── CHANGE EVENT FINISH TIME ────────────────────────────────────────────────────────────────────
  // 🔴 THE SAME WRITE `extendEvent` MAKES, AND NOTHING MORE: one POST to /api/events/action with
  // action:'update' and a payload of exactly `{ end_time }`. That handler's allow-list is
  // ['venue_name','venue_address','start_time','end_time','customer_note','auto_open','auto_close','notes']
  // and its only other write is `updated_at`. It touches NO order, NO status, NO production slot and
  // imports nothing from lib/payments/.
  // ⚠️ ABSOLUTE, NOT RELATIVE — and now the ONLY writer of this column on this screen. The deleted
  // `extendEvent` took `addMins` and could only push the finish LATER; this takes the time itself.
  const applyFinishTime=async(eventId:string,newEnd:string)=>{
    setFinishTimeBusy(true)
    try{
      const res=await fetch('/api/events/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,action:'update',eventId,payload:{end_time:newEnd}})})
      const data=await res.json(); if(!res.ok) throw new Error(data.error)
      setTodayEvents(prev=>prev.map(e=>e.id===eventId?{...e,end_time:newEnd}:e))
      showToast(`Finish time now ${newEnd}`)
      setFinishTimeTarget(null)
    }catch(err:any){showToast(err.message||'Failed','error')}
    finally{setFinishTimeBusy(false)}
  }

  // ── `extendEvent` DELETED (16 August) ───────────────────────────────────────────────────────────
  // 🔴 IT HAD NO CALLERS LEFT. Its last one was the recently-closed banner's "Extend 30 min", removed
  // above; the Event actions menu moved to `applyFinishTime` when the shared picker replaced it. A
  // relative, unconfirmed +30 writer left sitting in a money screen is an invitation to re-add a button
  // to it, which is the thing being removed.
  // ⚠️ NOTHING QUEUED CAN LAND ON IT. It was a CLIENT function; an offline replay carries the POST body
  // to /api/events/action and is served by that route's `update` handler, which is untouched. Any op
  // queued before this change still replays correctly.
  // 🔴 THE CAPABILITY IS NOT GONE — `applyFinishTime` makes the identical write (action:'update',
  // payload `{ end_time }`), from an absolute picker behind a confirm.

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
    // (`displayId` removed with the inline post-gate block — the shared handler resolves the display
    //  number itself via findOrder, exactly as it does for every other action.)
    // The single reason, in both vocabularies: the LABEL is what the customer reads on the cancellation,
    // the VALUE is what the refund path and the audit log record. One question, asked once.
    const reasonLabel=CANCEL_REASONS.find(([v])=>v===cancelReason)?.[1]??''
    const fullReason=[reasonLabel,cancelNote].filter(Boolean).join(' — ')
    // ── 🔴 THE REFUND GOES FIRST, AND A FAILED REFUND DOES NOT CANCEL THE ORDER. ─────────────────
    // Cancel-then-refund can leave a cancelled order with the money still taken and nobody looking at
    // it. This way a failure leaves the order exactly as it was, with the error on screen and the
    // operator's decision still to make — the recoverable direction.
    // ⚠️ THE SAME PATH THE REFUND FORM USES. No second way to issue one: same route, same guards, same
    // idempotency key, same ledger row.
    const rows=payments[orderKey]??[]
    const refundableMinor=Math.max(0,
      rows.filter((r:any)=>r.kind==='charge'&&r.channel==='online').reduce((t:number,r:any)=>t+r.amount_minor,0)
      -rows.filter((r:any)=>r.kind==='refund').reduce((t:number,r:any)=>t+r.amount_minor,0))
    let refundedMinor:number|null=null
    if(cancelRefund&&refundableMinor>0){
      if(!cancelReason){setCancelError('Choose a reason for the refund.');return}
      setCancelBusy(true);setCancelError(null)
      const res=await submitRefund({orderKey,amountMinor:refundableMinor,reason:cancelReason,note:fullReason||'',context:'cancellation'})
      setCancelBusy(false)
      if(!res.ok){setCancelError(res.message);return}
      // 🔴 ONLY A SETTLED REFUND IS REPORTED AS ONE. A pending refund has moved no money, so the
      // cancellation email must not say it has — `refundedMinor` stays null and the email falls back to
      // the neutral sentence. The webhook settles it later.
      if(res.settled)refundedMinor=refundableMinor
      showToast(res.message)
    }
    resetCancelModal()
    setActionLoading(`cancel-${orderKey}`)
    try{
      // Through the offline GATE (FIX 2): online → normal write; offline → durable outbox + queued. The
      // reason rides IN the body so the reconnect replay is faithful; expected_from → 409-to-conflict if it raced.
      // WHAT THE OPERATOR DECIDED TRAVELS WITH THE CANCELLATION, so the email says what happened rather
      // than hedging: the amount when a refund settled, and the DECLINE when they were offered one and
      // kept the money. Neither is inferred server-side — only this modal knows.
      const result=await gatedAction({url:'/api/dashboard/action',body:{token,pin,action:'cancel',order_key:orderKey,cancellationReason:fullReason||null,refunded_minor:refundedMinor,refund_declined:refundableMinor>0&&!cancelRefund},kind:'status',order_key:orderKey,online:isOnline(),expectedFrom:STATUS_REPLAY_EXPECTED_FROM})
      // 🔴 THE SHARED POST-GATE HANDLER — the second half of closing the duplicate. `labels.cancel` is
      // 'cancelled', so the committed toast is the same string; the queued branch produces the same
      // `Order #N saved`. ⚠️ The refund decision above is UNTOUCHED: it happens before the gate, it is
      // this modal's alone, and nothing in the shared handler knows or needs to know about it.
      await handleGateResult(result,'cancel',orderKey)
    }catch{showToast('Failed to cancel','error')}finally{setActionLoading(null)}
  }

  // 🔴 THE COMPOSED REASON ARRIVES FROM THE MODAL. The composition rule (preset, preset + note, or the
  // note alone for "Other") moved into components/shared/RejectOrderModal so both surfaces compose it
  // identically — see composeRejectReason there.
  // ⚠️ ENFORCEMENT LAYER 2 OF 2 IS THE `if(!fullReason) return` BELOW, and it stays. Layer 1 is the
  // modal's disabled button. Two layers, because this is the last gate before an email reaches a customer.
  const confirmRejectOrder=async(fullReason:string)=>{
    if(!rejectingOrder) return
    if(!fullReason) return
    const orderKey=rejectingOrder.order_key
    resetRejectModal()
    setActionLoading(`reject-${orderKey}`)
    try{
      // 🔴 THE REASON RIDES IN THE BODY, BEFORE THE GATE. That ordering is the whole offline story: the
      // outbox persists this body verbatim, so a reject queued on a dead connection replays WITH its
      // reason. There is no prompt left to attach one to afterwards.
      const result=await gatedAction({url:'/api/dashboard/action',body:{token,pin,action:'reject',order_key:orderKey,rejectionReason:fullReason},kind:'status',order_key:orderKey,online:isOnline(),expectedFrom:STATUS_REPLAY_EXPECTED_FROM})
      // 🔴 THE SHARED POST-GATE HANDLER, NOT A SECOND COPY. This used to carry its own queued branch, its
      // own `!result.ok` throw and its own two toasts — a second implementation of the shape
      // useGatedActionResult exists to be the only one. `labels.reject` is 'rejected', so the committed
      // toast is the same string it always was.
      await handleGateResult(result,'reject',orderKey)
    }catch{showToast('Failed to reject','error')}finally{setActionLoading(null)}
  }

  // ── OPEN THE GATE. WAS: `if(!window.confirm('Cancel this event? This cannot be undone.')) return` ──
  // 🔴 THE MENU IS CLOSED ON THE WAY IN, DELIBERATELY. The shared modal renders at z-50 and so does the
  // event menu it is opened from; closing the menu removes the stacking question entirely rather than
  // answering it with a z-index, and leaves exactly ONE overlay for the back button to dismiss.
  // (finishConfirm stacks at z-[60] instead — that is its existing behaviour and is not touched here.)
  // ⚠️ TAKES THE EVENT, NOT AN ID. The modal names the venue, the date and the window, so it needs the
  // row; and the one call site is inside a block already gated on `activeEvent`, so handing the object
  // over is both simpler and safer than a lookup that could miss and silently cancel nothing.
  const cancelEventFromMenu=async(ev:TruckEvent)=>{
    setShowEventMenu(false)
    setEventCancelCount(0); setEventCancelTarget(ev)
    try{
      const res=await fetch(`/api/events/affected-orders?eventId=${ev.id}&token=${token}`)
      const data=await res.json()
      if(res.ok) setEventCancelCount(data.count??0)
    }catch{ /* silently fail - the gate still works, the count just stays hidden */ }
  }
  // The request itself, UNCHANGED except that the reason and note the modal collected now ride in the
  // payload the endpoint has always accepted (manage has sent them since the modal was written). Leave
  // both blank and the body is what `payload:{}` produced.
  const doCancelEvent=async(eventId:string,cancellationReason:string,cancellationNote:string)=>{
    setEventCancelBusy(true)
    try{
      const res=await fetch('/api/events/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,action:'cancel',eventId,payload:{cancellationReason,cancellationNote}})})
      const data=await res.json(); if(!res.ok) throw new Error(data.error)
      setTodayEvents(prev=>prev.filter(e=>e.id!==eventId))
      setSelectedEventId(null); setShowEventMenu(false); showToast('Event cancelled')
      fetchAllRef.current() // re-sync so the cancelled event drops out immediately
    }catch(err:any){showToast(err.message||'Failed','error')}
    finally{setEventCancelBusy(false); setEventCancelTarget(null)}
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

  // ── 🔴 ANDROID HARDWARE BACK ───────────────────────────────────────────────────────────────────
  // ORDERED INNERMOST FIRST, and the ordering here is z-index, read off the overlays themselves. The
  // four z-[60] modals (finish confirm, edit-ITEM, demo lock) stack over the z-50 ones, and
  // editItemModal specifically opens FROM the editingOrder modal — so it must come first or back
  // would close the order editor underneath and strand the item editor on top of nothing.
  //
  // 🔴 WITH NOTHING OPEN, BACK DOES NOTHING. No entry navigates, and the handler has no fallback. An
  // operator cannot leave the dashboard with a gesture, which is what happened before: router.push had
  // pushed history, canGoBack() was true, and Capacitor navigated the page away with the modal state.
  // ⚠️ editingOrder and editItemModal HOLD AN EDIT IN PROGRESS. They are registered anyway because
  // editingOrder already dismisses on a backdrop tap (`onClick={e=>e.target===e.currentTarget&&
  // setEditingOrder(null)}`), so back is the same existing dismissal by another gesture — and leaving
  // editItemModal OUT would have been worse than including it, per the nesting note above.
  // ⚠️ Dismissing a confirm modal is always its CANCEL arm. Nothing here confirms, submits or cancels
  // an order; every closer is the same setter the modal's own X button calls.
  useAndroidBack([
    [!!editItemModal, () => setEditItemModal(null)],
    // NON-COMMITTING, and FIRST because the finish-time modal stacks highest (z-70 confirm over z-60
    // picker). Back dismisses it without writing — it can never be the thing that changes a finish time.
    // Gated on !busy so a press mid-write cannot unmount the modal while its POST is in flight.
    [!!finishTimeTarget && !finishTimeBusy, () => setFinishTimeTarget(null)],
    [!!finishConfirm, () => setFinishConfirm(null)],
    [!!eventCancelTarget && !eventCancelBusy, () => setEventCancelTarget(null)],
    [showDemoEventLock, () => setShowDemoEventLock(false)],
    [!!editingOrder, () => setEditingOrder(null)],
    [showCancelModal && !!cancellingOrder, resetCancelModal],
    [showRejectModal && !!rejectingOrder, resetRejectModal],
    [showQRFullscreen, () => setShowQRFullscreen(false)],
    [showProfileModal, () => setShowProfileModal(false)],
    [showKDSPicker, () => setShowKDSPicker(false)],
    [showEventMenu && !!activeEvent && !isDemo, () => setShowEventMenu(false)],
    [showPauseModal && !isDemo, () => setShowPauseModal(false)],
    [showScreenOffWarning, () => setShowScreenOffWarning(false)],
    [showOfflinePausedNotice, () => setShowOfflinePausedNotice(false)],
  ])

  // ── 🔴 KITCHEN TICKET PRINTING — THE ONE MOUNT OF THE PRINT WATCHER ────────────────────────────────
  // MOUNTED HERE AND NOWHERE ELSE. The dedupe record is device-local Capacitor Preferences; there is no
  // print_jobs table and no orders.printed_at, so a SECOND mounted watcher does not race this one, it
  // duplicates it — two devices at one event would each print every ticket, at the same moment, because
  // the trigger mode is truck-level and both agree on when a ticket is due. DO NOT MOUNT ON THE KDS.
  // ⚠️ CLIENT-SIDE, AND THAT IS A KNOWN LIMIT, NOT AN OVERSIGHT: the watcher is a 20s interval inside this
  // page. Backgrounding the app suspends it (Info.plist declares NO UIBackgroundModes), and navigating to
  // the KDS unmounts this page and stops it. Keep-awake holds the SCREEN on, not the app foregrounded.
  // Nothing is lost by that — an order that did not print is still DUE and prints on the next tick once
  // this screen is live again — but tickets do not appear while the dashboard is not on screen.
  // 🔴 THE PLAN GATE IS THE SAME PREDICATE THE SETTINGS CARD USES, resolved once here and passed down, so
  // the card and the watcher can never disagree about whether this truck may print.
  const canPrintTickets = canAccess(truck?.plan ?? 'starter', 'ticket_printing', truck?.feature_overrides ?? {}, truck?.trial_expires_at ?? null)
  const printing = usePrinting({
    token,
    orders,
    truck,
    event: activeEvent,
    payments,
    heldAuthorisations,
    canPrint: canPrintTickets,
    mode: truck?.print_trigger_mode==='on_confirmed' ? 'on_confirmed' : 'lead_time',
  })

  // The SAME resolver every other consumer uses — the dashboard's own reads (the toggle's position and
  // the collected/undo toast wording) must agree with the card and the server.
  const {showPaidStep:effectivePaidStep,takesCash:effectiveTakesCash,completionPresses:effectiveCompletionPresses}=resolvePaidStep(truck,activeEvent)
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
    const cfg=soundCfg
    if(!soundEnabled||!authenticated||!cfg.order_due) return
    const scan=()=>{
      const seen=new Set<string>()
      for(const o of orders){
        // 'modified' JOINS THE SCAN. An edited order is still an order somebody is waiting for, and it was
        // being skipped AND having its remembered urgency deleted — so an edit permanently silenced that
        // order's due alert, on the one surface an operator relies on to hear about lateness.
        if(o.status!=='pending'&&o.status!=='confirmed'&&o.status!=='modified'){ prevUrgencyRef.current.delete(o.order_key); continue }
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
  },[orders,authenticated,soundEnabled,soundCfg,activeEvent,catConfigs,itemCategoryMap])

  // OFFLINE-AWARE capacity for the day-load strip (Piece 1). ONLINE / no optimistic orders → returns the
  // server `slots` UNCHANGED (deviceQueuedOrders is ONLY ever populated by an OFFLINE create, so online this
  // is a no-op returning the same reference — the online path is byte-identical). OFFLINE with optimistic
  // orders → fold THEIR oven occupancy into the frozen server occupancy and re-run the SAME buildSlotIndicators
  // the strip's tone/label already come from, overlaying tone/label. Mirrors the server buildUnitsFromOrders
  // EXACTLY: ct = order.slot || eventStart → window key (timeMap[ct]||ct); normaliseOrderLines +
  // orderItemsToQtyByCat + mergeQtyByCat; event-scoped. Auto-reverts to server truth once the orders sync +
  // prune. Advisory OFFLINE view — the server stays authoritative on reconnect; oversell detection is Piece 2.
  // Advisory occupancy (window→qtyByCat), rebuilt FROM ORDERS via the SHARED buildOfflineOccupancy — used by
  // BOTH the day strip (displaySlots) AND the Add-Order picker (offlineCapacity prop below), so the two can't
  // diverge. Safe (try/catch → {}). Folds server orders + not-yet-synced offline creates, overlay-aware.
  const offlineOccupancy=useMemo<Record<string,Record<string,number>>>(()=>{
    try{
      if(!activeEvent||!Array.isArray(slots)||slots.length===0)return {}
      return buildOfflineOccupancy({
        slots,
        serverOrders:Array.isArray(orders)?orders:[],
        queuedOrders:deviceQueuedOrders,
        statusFor:(o)=>statusOverlay.get((o as {order_key:string}).order_key)?.status??(o as {status?:string}).status,
        eventId:activeEvent.id,
        eventStart:activeEvent.start_time||'',
        itemCategoryMap:itemCategoryMap||{},
      })
    }catch{return {}}
  },[slots,orders,deviceQueuedOrders,statusOverlay,activeEvent,itemCategoryMap])
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
      // FROM-ORDERS occupancy comes from the shared offlineOccupancy memo (same fold the picker uses) — then
      // re-run the SAME buildSlotIndicators, overlaying tone/label. Advisory; server-authoritative on reconnect.
      const merged=offlineOccupancy
      const[h,m]=(activeEvent.start_time||'0:0').split(':').map(Number)
      const eventStartMins=(h||0)*60+(m||0)
      const ind=buildSlotIndicators(slots,merged,serverCatConfigs,kitchenCapacity,eventStartMins,categoryOrder||[],capacityWindowMins)
      return slots.map(s=>({...s,tone:ind.get(s.collection_time)?.tone??s.tone,label:ind.get(s.collection_time)?.label??s.label}))
    }catch(e){
      console.warn('[displaySlots] offline capacity recompute failed — using server slots',e)
      return slots
    }
  },[slots,offlineOccupancy,deviceQueuedOrders,statusOverlay,activeEvent,serverCatConfigs,kitchenCapacity,categoryOrder,capacityWindowMins])

  // Cached, ADVISORY capacity for the Add-Order picker when /api/slots is unavailable (offline). Same inputs
  // the day strip uses (SW-cached /api/dashboard) + the SHARED offlineOccupancy fold, scoped to the active
  // event. The panel derives its capacityInputs from this when its own fetch left them null → lights instead
  // of bare times, and they DRAIN LIVE as offline orders queue (offlineOccupancy re-folds). null when unresolved.
  const offlineCapacity=useMemo(()=>{
    if(!activeEvent||!Array.isArray(slots)||slots.length===0)return null
    const[h,m]=(activeEvent.start_time||'0:0').split(':').map(Number)
    return {
      eventId:activeEvent.id,
      slots,
      productionSlotUnits:offlineOccupancy,
      kitchenCapacity,
      capacityWindowMins,
      eventStartMins:(h||0)*60+(m||0),
      catConfigs:serverCatConfigs,
    }
  },[activeEvent,slots,offlineOccupancy,kitchenCapacity,capacityWindowMins,serverCatConfigs])

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
  // 🔴 NON-NAVIGATING INSIDE THE NATIVE SHELL (2.1 completeness, 14 August 2026) — SAME MECHANISM AS
  //    components/shared/AppHeader.tsx:86-115, deliberately not a second approach.
  //    href="/" is the Village Foodie DISCOVERY MAP (app/page.tsx), not a HatchGrab page. This screen
  //    offers exactly ONE affordance and nothing else, so in the app an operator hitting an error tapped
  //    the only thing on offer and landed in a different product with no back button and no way home.
  //    Worse than the header case, where it was one of several ways out.
  //    ⚠️ The label already disagreed with the destination: _brand reads "HatchGrab" on a hatchgrab
  //    hostname while the href goes to Village Foodie. The label is computed; the href was not.
  //    🔴 DISPLAY-ONLY. Same text, same classes, same position. Nothing an operator can DO changes.
  //    ⚠️ WEB IS BYTE-IDENTICAL: isNativeApp() is Capacitor.isNativePlatform(), false in every browser,
  //    so a browser renders the <Link> branch — the same element it always did.
  //    ⚠️ isNativeApp() IS CALLED DIRECTLY WITH NO `mounted` FLAG, AND THAT IS SAFE HERE — the loading
  //    early-return on the line above starts `true` (:265), so this block never appears in server output
  //    nor on the first client frame. The same property manual section 40 records for the manage page.
  //    🔴 IF THAT EARLY-RETURN EVER GOES, THIS BECOMES A HYDRATION MISMATCH.
  //    ⚠️ NOT repointed at /app: that is the cold-launch route and it is unverified. AppHeader declined
  //    the same substitution for the same reason — a link landing somewhere unproven is not an
  //    improvement on a link landing somewhere wrong.
  //    ⚠️ KNOWN RESIDUAL, REPORTED NOT DECIDED: the native branch keeps the arrow and the link styling,
  //    because matching AppHeader exactly means keeping the children identical. It therefore reads as a
  //    control that does nothing, which the 2.1 rule calls a defect. It is still strictly better than the
  //    trap it replaces (tapping now does nothing instead of stranding you in another product), but the
  //    alternative — render nothing at all in the app — is a one-line change and is Dominic's call.
  if(error){const _brand=typeof window!=='undefined'&&window.location.hostname.includes('hatchgrab')?'HatchGrab':'Village Foodie';return<div className="min-h-screen bg-slate-50 flex items-center justify-center px-4"><div className="text-center"><p className="text-slate-900 font-bold text-lg mb-2">Access denied</p><p className="text-slate-500 text-sm">{error}</p>{isNativeApp()?<span className="mt-4 inline-block text-orange-600 text-sm hover:underline">← {_brand}</span>:<Link href="/" className="mt-4 inline-block text-orange-600 text-sm hover:underline">← {_brand}</Link>}</div></div>}
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

  // DEMO — has this service finished? Two ways: the window ELAPSED (a demo is provisioned auto_close:false
  // so it just runs out with status still 'open'), or the event was CLOSED. Either way the board is dead:
  // slots are generated for the window, so past end_time there is nothing bookable and the demo's whole
  // loop is impossible. Previously /api/dashboard silently rolled the window forward on every load; that
  // is gone (see the note there), so the state is now surfaced instead of hidden.
  // Venue-local comparison via the event's own date + end_time, matching how every other surface reads
  // these columns — they are wall-clock, not UTC.
  const demoServiceEnded=!!(isDemo&&activeEvent&&(
    activeEvent.status==='closed'||
    (activeEvent.event_date&&activeEvent.end_time&&
      Date.now()>new Date(`${activeEvent.event_date}T${activeEvent.end_time}`).getTime())
  ))
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
      // The value this deal contributed AS PLACED (locked), not its current menu price — see
      // editOrderBaseline. Also includes its slot-modifier surcharges, which the previous
      // current-price lookup silently dropped.
      return s+od.lockedValue
    },0)
    const addedNewValue=editDeals.filter(d=>d.isNew).reduce((s,d)=>{
      const bundle=truckMenu?.bundles?.find(b=>b.name===d.name)
      const modExtra=Object.values(d.slotModifiers||{}).flat().reduce((sm,m)=>sm+m.price,0)
      return s+(bundle?.bundle_price??0)+modExtra
    },0)
    return Math.max(0,editOrderBaseline.total+itemDelta-removedOriginalValue+addedNewValue)
  })():Math.max(0,editItemsSubtotal)
  // The server's unpriceable-line verdict is only meaningful for the basket it was computed against.
  // Change anything and the banner disappears rather than naming a line that is no longer there;
  // saving again simply re-asks. (Pure derivation — no effect, no extra state to keep in sync.)
  const editRepriceActive=!!editReprice&&editReprice.signature===editBasketSignature(editItems.filter(i=>i.quantity>0),editDeals)

  // Relative event-date label for the header — "Today/Tomorrow/{Weekday} {D}th {Month}". "today" is
  // resolved in the EVENT tz (Europe/London) via getLocalDateInTz, NOT device-local / toISOString, so a
  // future pre-order event reads correctly. event_date is a pure calendar date ('YYYY-MM-DD'); we format
  // its parts under timeZone:'UTC' so the weekday/month never shift.
  // (fmtVenue + eventDateLabel moved to lib/event-display.ts — fmtVenue existed byte-identically here
  //  and in AddOrderPanel, and the KDS event bar would have been a third copy.)

  // Extra-wait control (select, or the active "tap to clear" button) — ONE definition reused in two
  // responsive placements so the set/clear logic never diverges: mobile keeps it in the top controls
  // row; desktop (lg:) shows it stacked above Prep beside the stat boxes. `cls` carries the per-slot
  // width/visibility classes.
  // DEMO: no way to ADD extra wait (same trap as Pause — set it, forget it, then the quoted collection
  // times look wrong and the demo reads as broken). The CLEAR button below is left reachable whenever a
  // wait is somehow active, so nothing can strand the demo. Gating here covers BOTH responsive placements
  // at once — the whole reason this renderer exists as one definition.
  // The demo-lock chip, in ONE place so every locked control reads identically. Sits on the TITLE LINE —
  // "Offline protection · Not available in demo" — rather than under the toggle: the reader hits the
  // constraint while they're still reading what the thing IS, instead of learning the name, reading the
  // description, and only then discovering it's off-limits.
  //
  // COLOUR IS DELIBERATELY THE BANNER'S, EXACTLY: amber-100 ground / amber-900 text / amber-300 border
  // (components/DemoModeBanner.tsx). Two reasons:
  //   1. ONE visual language for demo CONSTRAINTS. The chip previously sat on amber-50 — near-white — next
  //      to the banner's amber-100, which read as a different system saying the same thing.
  //   2. It keeps ORANGE meaning exactly ONE thing across every demo surface: the action to take. Orange
  //      was doing double duty as both "click this" and "you can't use this" — precisely the wrong signal
  //      on a conversion surface, where the only orange on screen should be the way forward.
  // Renders nothing outside demo, so call sites need no conditional of their own.
  const demoLockChip = isDemo ? <DemoLockChip className="ml-2" /> : null

  const renderExtraWait=(cls:string)=> (isDemo&&waitMinutes<=0)?null:waitMinutes>0?(
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
      <OfflineBanner conflicts={outboxConflicts} resolveLabel={resolveConflictLabel} onAcknowledge={acknowledgeConflicts} onSynced={()=>{reseedRef.current();refreshPendingStatus()}} />
      {/* WEB-only counterpart: no queue on web, so just a clear "you're offline, orders won't send" bar
          (renders null on native, where OfflineBanner owns the offline state). */}
      <WebOfflineBanner />
      {/* Piece 2 — reconnect capacity-exceeded flag (detection only, non-blocking, dismissible). Fed by
          the server's detectCapacityBreaches; a fresh fetchAll after a drain refreshes it. */}
      <CapacityBreachBanner breaches={capacityBreaches} dismissedSig={breachDismissedSig} onDismiss={setBreachDismissedSig} />
      {/* Assign opens the STANDARD grid for that order — same component, same rules. The order is
          looked up live in `orders` so the grid gets the real row (and its current buzzer, which is
          null by definition here); if it has since left the fetched window the banner row simply does
          nothing rather than opening a grid against a phantom. */}
      <BuzzerLostBanner
        losses={buzzerLosses}
        dismissedKeys={dismissedBuzzerLosses}
        onDismiss={(k)=>setDismissedBuzzerLosses(prev=>{const n=new Set(prev);n.add(k);return n})}
        onAssign={(l)=>{const ord=orders.find(o=>o.order_key===l.order_key);if(ord)setBuzzerTarget(ord)}}
      />
      {/* ── 🔴 THE DARK OFFLINE CHIP WAS DELETED HERE (14 August 2026). DO NOT REINSTATE IT. ──────────
          It read "Offline — orders & stock save on this device; settings are locked" and stacked directly
          under OfflineBanner, which was already saying the same thing with a count. Both read the SAME
          detector (reachability), so they could never disagree — the duplication was purely presentational,
          and on the Settings tab THREE offline notices rendered at once.
          ⚠️ ITS ONE UNIQUE FACT — "settings are locked" — WAS NOT LOST: it is absorbed into OfflineBanner's
          offline phase. ⚠️ AND ITS COVERAGE WAS NOT LOST EITHER: both were app-shell children OUTSIDE
          <main>, so the surviving banner still renders on every tab exactly as this did.
          🔴 THE RULE THIS FOLLOWS: persistent state belongs in the BANNER, per-event confirmation in the
          TOAST. The banner keeps STATE; the toast keeps IDENTITY and ACTION. */}
      {/* DEMO MODE — persistent app-shell strip (same slim shrink-0 treatment as the offline chip). Sits on
          EVERY tab so the visitor is never unclear about what they're looking at. Deliberately calm rather
          than alarming: this is a prospect exploring the product, not an operator being warned. The
          explanatory copy that used to live here moved to the one-time welcome popup — said once, properly,
          rather than repeated on every screen forever. */}
      {/* isAdmin comes from the /api/auth/me call this page ALREADY makes on mount (see the effect above
          — unconditional, so it fires on a demo dashboard too). No new request. It opens the setup path
          for a production tester while public signup stays off; /api/signup re-checks it server-side. */}
      {isDemo&&<DemoModeBanner action={<DemoGetStarted token={token} isAdmin={isAdmin} extractionSource={demoSession?.extraction_source??null}/>}/>}
      {/* One-time orientation, shown BEFORE they see the board. Carries the customer order link, which is
          the thing most likely to be missed and the one that closes the loop. */}
      {/* isSample reads the SERVER's answer alone (demo_sessions.extraction_source, via /api/dashboard's
          demo block). It replaced a `?welcome=sample` URL param, which was gone after one navigation — so
          a reloaded sample demo used to start claiming "Here's your menu" about a menu nobody uploaded,
          breaking the §11 rule DemoWelcome:93 exists to enforce. A stored column survives reloads, tabs
          and devices; a query param survives none of them.
          The param was briefly kept as an `||` fallback while it was unconfirmed whether the column
          existed in prod (it is written by lib/provision-demo.ts but had no migration). Live schema
          confirmed it present and populated on 2026-07-28, and the migration now exists
          (20260728_demo_sessions_extraction_source.sql), so the fallback is gone. */}
      {isDemo&&<DemoWelcome token={token} orderUrl={customerOrderUrl} isSample={demoSession?.extraction_source==='template'}/>}
      {/* Keep-screen-on prompt — full-width shrink-0 bar in the app-shell (visible on the service screen, not
          buried). Shows only when the pref is on but the lock isn't held; the operator's first tap dismisses
          AND acquires it. */}
      <KeepAwakePrompt keepScreenOn={keepScreenOn} wakeState={wakeState} onAcquire={()=>{void applyKeepScreenOn(true)}} />
      {/* DEV-ONLY floating pills (render null in production) — force offline + inspect the live outbox. */}
      <DevOfflineToggle />
      <DevOutboxInspector />
      <DeviceSetupGate token={token} onOpenOrder={openOrderFromPush} />
      {/* Header */}
      {/* FIX 7 — DEMO hides the truck name. It's a GENERATED internal id ("Demo Kitchen (f1dz70)") that the
          spec says must never be shown; the visitor has no truck of their own yet. */}
      {/* sticky={false}: this header is a shrink-0 flex child of an h-dvh overflow-hidden shell, so
          position:sticky can never apply an offset here — the root never scrolls and <main> is a SIBLING,
          not an ancestor. It becomes `relative`, keeping z-50 and the stacking context while dropping
          WebKit's sticky compositing hint. See AppHeader and docs/native-shell-report.md. */}
      <AppHeader
        sticky={false}
        truckName={isDemo ? null : (truck?.name ? (vanName ? `${truck.name} — ${vanName}` : truck.name) : null)}
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
          {/* CANONICAL toggle values (w-11 h-6 · teal-500 · translate-x-6) — matched to the shared
              <Toggle> in components/dashboard/OrderCard.tsx. This site is a BESPOKE inline copy because the
              label + track share one click target and <Toggle> is itself a <button> (nesting them is
              invalid HTML). Hand-matched classes are how this drifts — it was w-10/green-500 — so the
              durable fix is a `label` prop on the shared component; logged as a follow-up. */}
          <div className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${soundEnabled ? 'bg-green-500' : 'bg-slate-300'}`}>
            <div className={`absolute top-1 left-0 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${soundEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </div>
        </button>
        {/* Screen toggle — desktop only (mobile → UserMenu). BINARY: green "Screen on" ONLY when the lock is
            actually HELD; grey "Screen off" otherwise. Failure is a toast on the tap, never a hedged label. */}
        <button onClick={toggleKeepScreenOn} title={screenHeld ? 'Screen will stay on' : 'Tap to keep the screen on'} className="hidden sm:flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500 select-none">{screenHeld ? 'Screen on' : 'Screen off'}</span>
          {/* CANONICAL toggle values — see the Sound toggle above. */}
          <div className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${screenHeld ? 'bg-green-500' : 'bg-slate-300'}`}>
            <div className={`absolute top-1 left-0 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${screenHeld ? 'translate-x-6' : 'translate-x-1'}`} />
          </div>
        </button>
        {/* DEMO gating of the menu. Manage/Admin are whole consoles with no demo treatment, and Sign out is
            a dead end with no session behind it — all hidden. The order utilities ALL stay: opening your own
            order page, placing a test order and watching it land here and on the Kitchen screen is the demo's
            full loop. Safe to hand out the URL — a demo slug is 130-bit random and absent from both discovery
            feeds — and the KDS carries its own demo mode (see kds/page.tsx). */}
        {/* DEMO: the whole profile menu is MOBILE-ONLY. Its remaining items (Screen, Sound, Order link,
            QR) are all `sm:hidden` — desktop has them in the header and the tab bar — and Manage / Admin /
            Sign out are hidden in demo, so on desktop the dropdown held nothing but an empty identity row.
            An avatar that opens a blank panel reads as a broken profile setting, which a demo visitor has
            no business seeing at all. Mobile still needs it, so it's hidden by breakpoint, not removed. */}
        <span className={isDemo ? 'sm:hidden' : undefined}>
        <UserMenu
          showIdentity={!isDemo}
          operatorName={currentUserName || currentUserFirstName || ''}
          userEmail={currentUserEmail}
          token={token}
          showScreenToggle
          showOrderUtilities
          showManageLink={!isDemo&&(userRole==='owner'||userRole==='manager')}
          isAdmin={!isDemo&&isAdmin}
          showSignOut={!isDemo}
          keepScreenOn={screenHeld}
          onToggleScreenOn={toggleKeepScreenOn}
          soundEnabled={soundEnabled}
          onToggleSound={()=>setSoundEnabled(v=>{const next=!v;if(next)primeAudio();return next})}
          copiedOrderLink={copiedOrderLink}
          onCopyOrderLink={handleCopyOrderLink}
          onShowQR={handleShowQR}
          onOpenKDS={handleOpenKDS}
        />
        </span>
      </AppHeader>

      {/* Tabs — bg-slate-900 must match HEADER_BG in lib/brand.ts.
          Non-scrolling `shrink-0` flex child of the h-dvh app-shell → stays locked on every tab/browser
          (incl. the iPad WKWebView, where position:sticky-against-body-scroll was unreliable). overflow-x-auto
          stays on the INNER row so the tab strip can still scroll horizontally on narrow widths. */}
      <div className="bg-slate-900 border-b border-slate-700 shrink-0 z-40">
        {/* Nav tabs row */}
        <div className="px-4 overflow-x-auto">
          <div className={"w-full min-[1400px]:max-w-5xl min-[1400px]:mx-auto flex items-center"}>
            {/* In DEMO the Settings tab keeps only ONE card (Kitchen capacity — see the tab body), so it is
                relabelled to match what's actually in it. "Settings" on a single-card tab reads as broken. */}
            {([['orders',(()=>{const c=activeEvent?pendingOrders.length:0;return`Orders${c>0?` (${c})`:''}`})()],['add','+ Add order'],['stock','Menu & Stock'],['settings','Settings']] as [typeof activeTab,string][]).map(([tab,label])=>(
              <button key={tab} onClick={()=>setActiveTab(tab)} className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab===tab?'border-orange-500 text-white':'border-transparent text-slate-400 hover:text-white'}`}>{label}</button>
            ))}
            {/* Utility actions — desktop only. Desktop twins of the UserMenu items, so they must stay in
                lockstep with it: all three available in DEMO (the test-order loop). Gating one surface and
                not the other is how a "hidden" link stays reachable — change both or neither. */}
            {/* DEMO-ONLY mobile QR shortcut. The welcome popup now INSTRUCTS them to scan the QR, so it
                has to be findable without opening the avatar menu — on mobile the utility row below is
                `hidden sm:flex`, which buried it. Demo only: a live operator prints their QR once and
                sticks it on the hatch, so promoting a setup control above the order queue during service
                would be wrong. Availability is unchanged for everyone (the UserMenu twin still carries it
                on mobile) — this adds reach in demo, it does not gate anything. Two `ml-auto` siblings is
                intentional: exactly one is visible per breakpoint, so the spacer always lands correctly. */}
            {isDemo&&(
              <button onClick={handleShowQR} className="ml-auto sm:hidden flex items-center gap-1.5 my-1.5 px-3 py-1.5 rounded-lg bg-orange-500 text-white text-sm font-bold hover:bg-orange-600 transition-colors whitespace-nowrap">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"/></svg>
                QR code
              </button>
            )}
            <div className="ml-auto hidden sm:flex items-center">
              <button onClick={handleCopyOrderLink} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 hover:text-white transition-colors whitespace-nowrap">
                {copiedOrderLink ? '✓ Copied' : 'Order link'}
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
              </button>
              {/* DEMO: filled orange, not a text link — the popup points at it by name. Non-demo keeps the
                  plain utility styling; see the mobile shortcut above for why this is demo-only. */}
              <button onClick={handleShowQR} className={isDemo
                ? "flex items-center gap-1.5 my-1.5 px-3 py-1.5 rounded-lg bg-orange-500 text-white text-sm font-bold hover:bg-orange-600 transition-colors whitespace-nowrap"
                : "flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 hover:text-white transition-colors whitespace-nowrap"}>
                {isDemo&&<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"/></svg>}
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
                  {/* FIX 8 — DEMO hides the date. The demo event is always "today" by construction, so the
                      line carries no information and just dates the screenshot. */}
                  {activeEvent.event_date&&!isDemo&&(
                    <span className="hidden sm:block text-xs font-medium text-slate-400 truncate mt-0.5">📅 {eventDateLabel(activeEvent.event_date)}</span>
                  )}
                </div>
                {/* "Change" button removed — event-switching lives in Event actions ▾ → "📅 Change event"
                    (redundant here on every viewport). The no-event "Select event" path below is unaffected. */}
                {/* Status label — the words and the branch order live in lib/event-display, shared with the
                    KDS; only the palette is per-surface (this header is dark). Output is unchanged. */}
                {(()=>{const st=eventStatusDisplay(activeEvent.status,paused);return(
                  <span className={`text-xs font-medium ${EVENT_STATUS_TEXT_ON_DARK[st.tone]} flex-shrink-0`}>{st.label}</span>
                )})()}
                {/* Labeled, obviously-tappable trigger for the event-level actions (pause / +30 / finish /
                    cancel / note) — names the menu so those actions are discoverable, not hidden behind ⋯. */}
                {/* DEMO: SHOW, don't hide (§3 Stage 3 — "a prospect can't want what they can't see"). Event
                    actions render but are LOCKED: the chip sits beside the control, and clicking opens the
                    explainer instead of the real menu (which stays !isDemo-gated below as a backstop). The
                    handler enforcement lives in openEvent/openEventPicker, not here. */}
                {isDemo?(
                  // Padlock only — no chip. The explainer on click carries the "why"; a chip here too would
                  // double the message on a control they haven't engaged with yet.
                  <button onClick={()=>setShowDemoEventLock(true)}
                    className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold text-slate-300 bg-slate-700/60 border border-slate-600 rounded px-2.5 py-1 cursor-pointer">
                    <span aria-hidden>🔒</span> Event actions
                  </button>
                ):(
                  <button onClick={()=>{setEventNoteInput(activeEvent.customer_note||'');setShowEventMenu(true)}}
                    className="flex-shrink-0 text-xs font-semibold text-white bg-slate-700 border border-slate-500 hover:bg-slate-600 rounded px-2.5 py-1 transition-colors">
                    Event actions ▾
                  </button>
                )}
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

      {/* ── 🔴 TEMPORARY — CARD PAYMENTS OFF. PERSISTENT BANNER. DELETE WITH THE SWITCH. ─────────────
          ⚠️ IT SITS OUTSIDE <main> ON PURPOSE, so it shows on EVERY tab and is not inside the scroll
          container that Add manages itself. This is the one dashboard setting that does NOT expire on
          its own — the three per-event overrides all lapse when the event does, this one persists until
          somebody turns it back on — so it must be impossible to leave switched off and forget.
          ⚠️ NO DATE FORMATTING HERE. The card below carries the day it was turned off; a formatted
          timestamp in a client component that also renders on the server is a hydration mismatch, and
          this banner does not need one to do its job.
          ⚠️ The "Turn back on" button writes the same action as the card's toggle — one save path. */}
      {truck?.online_payments_paused_at&&(
        <div className="w-full min-[1400px]:max-w-5xl min-[1400px]:mx-auto px-4 pt-3">
          <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-amber-500">⚠️</span>
              <p className="text-sm font-medium text-amber-800">
                Card payments are off — customers are paying at the hatch. This stays off, on every event, until you turn it back on.
              </p>
            </div>
            <button onClick={()=>saveOnlinePaymentsPaused(false)} disabled={isOffline||savingOnlinePaymentsPause}
              className="text-sm font-semibold text-amber-700 border border-amber-300 bg-white rounded-lg px-3 py-1.5 hover:bg-amber-50 whitespace-nowrap disabled:opacity-50">
              Turn back on
            </button>
          </div>
        </div>
      )}

      {/* The ONLY scroll container — flex-1 min-h-0 lets it fill the shell and scroll internally while the
          top bars above stay put. Add tab manages its own inner scroll (overflow-hidden here). */}
      {/* ── 🔴 ORDERS AT lg+ IS NOW A FLEX FIT, NOT A SCROLLING PAGE (14 Aug 2026) ─────────────────────
          The Kitchen capacity panel had to be sized to the VIEWPORT and stay pinned while orders scroll.
          Inside a scrolling <main> that is impossible in pure CSS without a magic offset: a sticky child's
          height comes from its own box, and there is no CSS token for "my scrollport's height". The manual
          forbids the alternative in terms — hardcoded `calc(100dvh - Npx)` offsets desync the moment the
          chrome or a safe-area inset changes, and this project has been bitten by exactly that twice.
          So Orders adopts the SAME durable pattern the Add tab already uses in landscape: the page stops
          scrolling, and the columns inside it scroll. `<main>` is the bounded box; the orders column and the
          capacity panel are SIBLING scrollers, never nested.
          ⚠️ SCOPED TO lg: AND TO THE ORDERS TAB ONLY. Below 1024px this is byte-identical to before
          (`overflow-y-auto px-4 py-4 pb-20`) and the sidebar does not render at all, so portrait iPad and
          every phone are untouched. Every other tab keeps its own branch unchanged.
          ⚠️ lg:pb-4 replaces pb-20 at lg only: pb-20 exists to clear the bottom of a SCROLLING page, and on
          a non-scrolling one it would just eat 80px of the height the panel is trying to fill. */}
      <main className={`w-full min-[1400px]:max-w-5xl min-[1400px]:mx-auto flex-1 min-h-0 ${activeTab==='add'?'overflow-hidden px-4':activeTab==='orders'?'overflow-y-auto lg:overflow-hidden px-4 py-4 pb-20 lg:pb-4':'overflow-y-auto px-4 py-4 pb-20'}`}>

        {/* ORDERS TAB */}
        {/* lg:h-full min-h-0 flex-col — the first link of the flex fit above. `h-full` resolves because
            <main> has a DEFINITE height (flex-1 min-h-0 inside the h-dvh app-shell), so this is a real
            bound, not an auto height wearing a percentage. Inert below lg. */}
        {activeTab==='orders'&&(
          <div className="lg:h-full lg:min-h-0 lg:flex lg:flex-col">
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
                  inline below the summary (lg:hidden) — two presentations, one data source.
                  ── 🔴 `lg:items-start` REPLACED BY `lg:items-stretch`, AND THAT IS SAFE **ONLY** BECAUSE
                  THIS ROW IS NOW HEIGHT-BOUNDED (`lg:flex-1 lg:min-h-0` inside the non-scrolling <main>).
                  items-stretch was rightly rejected while the row was CONTENT-driven: it sized the panel to
                  the orders grid, which grows without bound as orders arrive, giving a capacity list
                  thousands of pixels tall. That premise is gone. The row's height is now the viewport
                  remainder and nothing else, so stretch makes the panel exactly one screen tall.
                  🔴 IF ANYONE EVER REMOVES `lg:flex-1 lg:min-h-0` FROM THIS ROW, `lg:items-stretch` BECOMES
                  THE UNBOUNDED-HEIGHT BUG AGAIN. The two must be changed together or not at all. */}
              <div className="lg:flex lg:gap-5 lg:items-stretch lg:flex-1 lg:min-h-0">
              {/* @container: the order-card grids below size their column count off THIS content column's
                  width (not the viewport), so iPad gets 3-across in both orientations and desktop stays 3.
                  lg:min-h-0 + lg:overflow-y-auto: THIS is the orders scroller at lg — the one <main> used to
                  be. It is a SIBLING of the panel's scroller, not an ancestor of it. */}
              <div className="@container lg:flex-1 lg:min-w-0 lg:min-h-0 lg:overflow-y-auto">
              {/* DEMO — behaviour-triggered signup prompt. Fires when an order the visitor caused lands on
                  this board (see the component for the baseline detection). Sits ABOVE the order list
                  because that's where their eye returns; deliberately not a modal. */}
              {/* DEMO — the service has finished. Shown INSTEAD of the loop-complete prompt: the board
                  behind this is dead (nothing bookable past end_time), so a signup prompt would be
                  pitching off the back of something that no longer works. One action, no dead ends. */}
              {demoServiceEnded&&(
                <div className="bg-white border-2 border-slate-300 rounded-2xl px-4 py-4 mb-4 shadow-sm text-center">
                  <p className="text-base font-black text-slate-900">This service has ended</p>
                  <p className="text-sm text-slate-600 mt-1">
                    Start a new one and we&apos;ll set up a fresh service for right now — your menu stays as it is.
                  </p>
                  <button type="button" onClick={startNewService} disabled={restarting}
                    className="mt-3 bg-orange-600 hover:bg-orange-700 disabled:opacity-40 text-white text-sm font-black px-5 py-2.5 rounded-xl shadow-sm">
                    {restarting?'Setting up…':'Start a new service'}
                  </button>
                  {restartError&&<p className="text-sm text-red-600 mt-2">{restartError}</p>}
                </div>
              )}
              {isDemo&&!demoServiceEnded&&(
                <DemoLoopComplete
                  token={token}
                  orderKeys={orders.map(o=>o.order_key)}
                  orders={orders}
                  loaded={!loading&&!!truck}
                  onHighlight={setHighlightOrderKey}
                  isAdmin={isAdmin}
                  extractionSource={demoSession?.extraction_source??null}
                />
              )}
              {/* Prep time banner — hidden in DEMO. Not just its "Edit categories" → /manage link: the whole
                  card's copy instructs the reader to fix prep times *in Manage*, which a demo visitor cannot
                  reach. Hiding only the link would leave instructions pointing nowhere. (Demo prep times are
                  set by the provisioner's wizard assumptions, so the banner has nothing to tell them anyway.) */}
            {showPrepTimeBanner&&!isDemo&&(
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
            {/* ⚠️ "Extend 30 min" REMOVED FROM THIS BANNER (16 August), matching the KDS's, which lost
                its copy first. It called `extendEvent(activeEvent.id,30)` — one tap, relative, with no
                confirm and no undo, which is the shape that got pressed by accident.
                🔴 RECOVERY IS NOT LOST. Event actions ▾ -> "Change event finish time" reaches the same
                write behind a picker and a confirm, and can set any future time rather than only +30.
                ⚠️ THE BANNER ITSELF STAYS — it is how an operator knows the event has ended. It keeps
                `justify-between` so the sentence sits exactly where it did; there is no empty slot,
                because a single flex child with that class simply starts at the left edge. */}
            {recentlyClosed&&activeEvent&&(
              <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 mb-4 flex items-center justify-between">
                <span className="text-sm text-slate-600">Event finished · {activeEvent.venue_name} ended at {formatTime(activeEvent.end_time)}</span>
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
                <div className="grid grid-cols-1 @md:grid-cols-2 @2xl:grid-cols-3 gap-3">{pendingOrders.map(o=><OrderCard key={o.order_key} anchorId={isDemo?`demo-order-${o.order_key}`:`order-${o.order_key}`} highlight={isDemo&&o.order_key===highlightOrderKey} order={o} truck={truck} event={activeEvent} slots={slots} actionLoading={actionLoading} onAction={doAction} onRefund={submitRefund} onEdit={startEdit} categoryOrder={categoryOrder} itemCategoryMap={itemCategoryMap} catConfigs={catConfigs} kdsMode={truck?.kds_mode??false} showCookingStep={showCookingStep} effectiveOrderReady={effectiveOrderReady} ledgerRows={payments[o.order_key]} heldAuthorisation={heldAuthorisations.has(o.order_key)} pendingPayment={paymentOverlay.get(o.order_key)??queuedPayment(o)} conflict={cardConflict(o)} offline={isOffline} onBuzzer={vanBuzzerCount!=null?setBuzzerTarget:undefined}/>)}</div>
              </div>
            )}
            {confirmedOrders.length>0&&(
              <div className="mb-4">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Confirmed</p>
                <div className="grid grid-cols-1 @md:grid-cols-2 @2xl:grid-cols-3 gap-3">{confirmedOrders.map(o=><OrderCard key={o.order_key} anchorId={isDemo?`demo-order-${o.order_key}`:`order-${o.order_key}`} highlight={isDemo&&o.order_key===highlightOrderKey} order={o} truck={truck} event={activeEvent} slots={slots} actionLoading={actionLoading} onAction={doAction} onRefund={submitRefund} onEdit={startEdit} categoryOrder={categoryOrder} itemCategoryMap={itemCategoryMap} catConfigs={catConfigs} kdsMode={truck?.kds_mode??false} showCookingStep={showCookingStep} effectiveOrderReady={effectiveOrderReady} ledgerRows={payments[o.order_key]} heldAuthorisation={heldAuthorisations.has(o.order_key)} pendingPayment={paymentOverlay.get(o.order_key)??queuedPayment(o)} conflict={cardConflict(o)} offline={isOffline} onBuzzer={vanBuzzerCount!=null?setBuzzerTarget:undefined}/>)}</div>
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
                  {otherOrders.map(o=>{
                  // ── THE COLLECTED ORDER'S MONEY MARKER ────────────────────────────────────────────
                  // 🔴 THIS IS THE SURFACE THAT MATTERS FOR 'collected'. A completed order LEAVES the
                  // board, so the card marker can never be seen for the one failure that hides itself
                  // best: the operator taps once, the order clears, and nothing anywhere says the money
                  // is missing. This row is where that order now lives, and the ↩ Undo already sitting
                  // beside it is why: this is the surface an operator already comes to when a completed
                  // order needs correcting.
                  // Same predicate, same words and same red as the card marker — one vocabulary for
                  // "money went wrong on this order", never a second alerting mechanism.
                  const unrecorded=hasUnrecordedPayment(o as never,payments[o.order_key]??[],paymentFailures.has(o.order_key))
                  return (
                    <div key={o.order_key} className={`bg-white rounded-xl px-4 py-3 flex items-center justify-between ${unrecorded?'border-2 border-red-600':'border border-slate-200'}`}>
                      <div className="min-w-0 flex-1">
                        {unrecorded&&(
                          <p className="text-[11px] font-black text-red-700 mb-1 tracking-wide">⚠ PAYMENT NOT RECORDED</p>
                        )}
                        <div className="flex items-center gap-2">
                          <span className="font-black text-slate-700 text-sm">#{o.id}</span>
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${STATUS[o.status]?.bg||'bg-slate-100'} ${STATUS[o.status]?.text||'text-slate-500'}`}>{STATUS[o.status]?.label||o.status}</span>
                          {o.slot&&<span className="text-xs text-slate-700">🕐 {o.slot}</span>}
                        </div>
                        <p className="text-slate-500 text-xs mt-0.5 truncate">{o.customer_name} · {Object.entries(getAllDayCounts([o])).map(([name,qty])=>`${qty}× ${name}`).join(', ')}</p>
                        {o.notes&&<p className="text-orange-500 text-xs truncate">📝 {o.notes}</p>}
                      </div>
                      <div className="shrink-0 ml-3 flex items-center gap-2">
                        {/* 🔴 THE REPAIR, NOT JUST THE ALERT. An operator told money is missing and given
                            nothing to do about it will learn to ignore the marker. This fires the SAME
                            'mark_paid' the card offers — one existing action, charging the outstanding
                            balance under the same idempotency key, so re-firing is safe and a no-op if
                            the money did land after all. The marker clears by itself on the next poll
                            because hasUnrecordedPayment re-reads the live balance; nothing is dismissed.
                            Shown ONLY when unrecorded, so a normal completed row is unchanged. */}
                        {unrecorded&&(
                          <button onClick={()=>doAction('mark_paid',o.order_key)} disabled={actionLoading===`mark_paid-${o.order_key}`}
                            className="text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg px-3 py-2 transition-colors active:scale-95 disabled:opacity-50">
                            {actionLoading===`mark_paid-${o.order_key}`?'…':'Record payment'}
                          </button>
                        )}
                        {/* Later-recovery Undo — collected orders only (not cancelled/rejected). Reuses
                            the same undo_collected action as the toast: reverts ONE stage to the actual
                            previous status (ready/confirmed) + rebuilds capacity. */}
                        {o.status==='collected'&&(
                          <button onClick={()=>doAction('undo_collected',o.order_key)} disabled={actionLoading===`undo_collected-${o.order_key}`}
                            className="text-xs font-bold text-slate-500 hover:text-orange-600 border border-slate-200 hover:border-orange-300 rounded-lg px-3 py-2 transition-colors active:scale-95 disabled:opacity-50">
                            ↩ Undo
                          </button>
                        )}
                        {/* ── 🔴 THE MONEY CHIP THIS ROW NEVER HAD, AND THE ONLY WAY INTO A REFUND FROM HERE.
                            A completed order LEAVES the board, so the card's PAID chip — the tap target for
                            every payment correction — is unreachable for exactly the orders most likely to
                            need one. This is that chip, in the card's own vocabulary and words: PAID,
                            REFUNDED, or the amount given back. Tapping it opens the SAME modal the card
                            opens, so there is one refund UI and not two.
                            ⚠️ RENDERED ONLY WHEN THERE IS SOMETHING TO ACT ON — money recorded against the
                            order. An unpaid or cancelled-before-payment row is unchanged, and the red
                            "Record payment" repair beside it is untouched. */}
                        {(()=>{const bal=getOrderBalance(o as never,payments[o.order_key]??[])
                          if(bal.paidMinor<=0&&bal.status!=='refunded'&&bal.status!=='part_refunded')return null
                          const label=bal.status==='refunded'?'REFUNDED':bal.status==='part_refunded'?`£${(bal.balanceMinor/100).toFixed(2)} REFUNDED`:'PAID'
                          const tone=bal.status==='refunded'||bal.status==='part_refunded'?'bg-slate-200 text-slate-700':'bg-green-100 text-green-700'
                          return (
                            <button onClick={()=>setPayModalOrder(o.order_key)} title="Tap to refund or correct this payment"
                              className={`text-[10px] font-black px-1.5 py-0.5 rounded-full whitespace-nowrap ${tone}`}>{label}</button>
                          )})()}
                        <span className="font-black text-slate-600 text-sm">£{Number(o.total).toFixed(2)}</span>
                      </div>
                    </div>
                  )})}
                </div>
                )}
                {/* ONE modal for the list, driven by which order_key is open. The figures are derived
                    from the SAME ledger rows the chip above read; the server recomputes both. */}
                {payModalOrder&&(()=>{const o=otherOrders.find(x=>x.order_key===payModalOrder)
                  if(!o)return null
                  const rows=payments[o.order_key]??[]
                  const bal=getOrderBalance(o as never,rows)
                  return (
                    <PaymentActionsModal open onClose={()=>setPayModalOrder(null)}
                      orderId={String(o.id)} orderKey={o.order_key} paidMinor={bal.paidMinor}
                      cardChargeMinor={rows.filter((r:any)=>r.kind==='charge'&&r.channel==='online').reduce((s:number,r:any)=>s+r.amount_minor,0)}
                      refundedMinor={rows.filter((r:any)=>r.kind==='refund').reduce((s:number,r:any)=>s+r.amount_minor,0)}
                      charges={rows.filter((r:any)=>r.kind==='charge').map((r:any)=>({channel:r.channel,method:r.method??null,amountMinor:r.amount_minor}))}
                      hasReversibleInPersonPayment={rows.some((r:any)=>r.kind==='charge'&&r.channel!=='online'&&r.livemode===true)}
                      onUndoPayment={()=>doAction('undo_mark_paid',o.order_key)}
                      undoLoading={actionLoading===`undo_mark_paid-${o.order_key}`}
                      onRefund={submitRefund}
                      /* 🔴 Same reachability state the offline banner uses (onReachabilityChange →
                         setIsOffline), so this modal recovers on reconnect without a reload. */
                      offline={isOffline}/>
                  )})()}
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
              {/* ── 🔴 STICKY REMOVED, NOT REPLACED WITH A DIFFERENT OFFSET ────────────────────────────
                  This was `lg:sticky lg:top-0`, which was correct while <main> scrolled. <main> no longer
                  scrolls at lg, so the panel cannot scroll away and has nothing to stick to — sticky here
                  would be inert at best. Manual section 27 records position:sticky as unreliable in this
                  WebView (the tab bar detaching was the same class), so an inert sticky is not worth
                  keeping. The panel is now simply a bounded flex sibling: pinned by structure, not by
                  position. NO hardcoded offset was introduced to replace it, and none is needed. */}
              <aside className="hidden lg:flex lg:flex-col lg:w-48 lg:flex-shrink-0 lg:min-h-0">
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
            isDemo={isDemo}
            onLockedEventAction={()=>setShowDemoEventLock(true)}
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
            buzzerCount={vanBuzzerCount}
            onSaveBuzzer={async(orderKey,buzzerNumber)=>{await saveBuzzer(orderKey,buzzerNumber)}}
            buzzerPromptEnabled={effectiveBuzzerPrompt}
            offlineCapacity={offlineCapacity}
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
                {/* TRIMMED 14 August 2026 to the ONE fact nothing else says. The lead — "You're offline —
                    reconnect to change these settings" — is carried persistently by OfflineBanner, which
                    now ends with "Settings are locked." This keeps the EXCEPTION to that rule. */}
                <span>Printer &amp; notification settings still work offline.</span>
              </div>
            )}
            {/* ⚠️ DEMO MODE keeps this TAB but strips it to the Kitchen-capacity card alone.
                Reason: "adjust kitchen capacity and watch slots respond" is one of the four things the demo
                exists to show (spec Stage 3), and that control lives HERE — hiding the tab outright would
                have removed a required demo capability. So each of the other cards is gated individually
                below (auto-accept, sounds, offline protection, order-ready, printing, notifications), and
                the tab is relabelled "Kitchen" in the tab bar. */}
            {/* ── OFFLINE PROTECTION — FIRST CARD IN THIS TAB (V9.5). Moved to the top deliberately:
                it is the setting with the largest consequence on this screen (it can stop the truck
                taking orders), so it should not sit below three lower-stakes toggles.
                DEMO: VISIBLE BUT DISABLED, not hidden. Offline protection is a genuine selling point, so a
                prospect should see that it exists — but must not be able to switch it on: it interacts with
                the heartbeat-monitor auto-pause, and a demo that silently stops taking orders reads as
                broken rather than as a feature working. Forced OFF, toggle disabled, and the ENABLE path is
                additionally blocked in toggleOfflineProtection so a click can never write set_offline_
                protection — the disabled state is enforced, not just styled. The ⚠️ operator explainer is
                swapped for a calm one-liner; there is nothing here for a visitor to act on. */}
            {activeEvent&&(
              <div className="flex items-start justify-between gap-4 p-4 bg-white rounded-2xl shadow-sm border border-slate-200">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">Offline protection{demoLockChip}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{OFFLINE_PROTECTION_CARD_DESCRIPTION}</p>
                  {!isDemo&&<p className="text-xs text-amber-600 mt-1">⚠️ <strong>{OFFLINE_PROTECTION_EXPLAINER_LEAD}</strong> {OFFLINE_PROTECTION_EXPLAINER_BODY}</p>}
                </div>
                <Toggle on={isDemo?false:effectiveOfflineProtection} onToggle={()=>toggleOfflineProtection(!effectiveOfflineProtection)} disabled={isOffline||isDemo}/>
              </div>
            )}
            {/* Auto-accept + its dependent "review notes" sub-option read as ONE group (divide-y rows, same
                treatment as the Sounds card). Notes-review only applies when auto-accept is on (conditional).
                FIX 9 — DEMO: fully AVAILABLE and interactive, defaulted ON (set at provision). It genuinely
                works end-to-end here, and toggling it then placing a test order is one of the more
                convincing things a prospect can do. NOT locked. */}
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
            {/* == ORDER SCREEN — THE FOUR SETTINGS THAT SHAPE IT ========================================
                GROUPED 15 August 2026, COMPLETED the same day. Four cards that were scattered down this tab,
                now adjacent and in a fixed order: Menu layout, the paid-step card, the order-ready step, the
                buzzer prompt. Every card is MOVED VERBATIM -- same label, same helper text, same handler, same
                column, same default, same render gate. Nothing about what any of them writes changed.
            
                THE PAID-STEP CARD MOVED AS A WHOLE UNIT, AND THAT IS THE POINT. An earlier pass moved only the
                other three and stopped, because "Take orders without payment" is that card TITLE ROW -- the
                card header below records that the card is titled by its setting, with the cash row nested
                beneath it as a child. Moving the row alone would have left a card with no title whose two
                remaining rows both name it. Moving the CARD keeps that structure intact and orphans nothing.
            
                THE HEADING FOLLOWS THE ORDERS-TAB PATTERN (see the "New -- action needed" and "Confirmed"
                headings): same classes, minus the outer mb-4, because this tab space-y-4 already separates
                siblings and mb-4 would double it. The inner gap-3 is deliberately tighter than that space-y-4
                so the four read as one family rather than four neighbours. */}
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Order screen</p>
              <div className="flex flex-col gap-3">
            {/* ── MENU LAYOUT — trucks.add_order_layout (MOVED HERE 14 August 2026) ────────────────────
                It was in Manage → Settings and is now here, in ONE place, because this is the screen it
                changes: an operator judging tabs against one scrolling list is standing at the hatch
                looking at the Add order tab, not in Manage. The Manage sub-panel, its resolver constant
                and its update_truck allow-list entry were all removed in the same change — see the note
                left at app/api/manage/route.ts.

                🔴 TRUCK-WIDE ON A MOSTLY-PER-EVENT TAB. Read the amended scope note on the card above
                before assuming otherwise. It writes trucks.add_order_layout through
                `set_add_order_layout` (app/api/dashboard/action/route.ts), the same one-action-one-column
                shape as set_auto_accept — this route has no update_truck and no shared allow-list.

                ⚠️ ITS OWN CARD, not a row in the payment card above: that card's rows are per-event
                payment overrides and this is neither. RADIO rather than a toggle — two named
                alternatives that each need their own explanation, and neither is the "on" state of the
                other. DRAWN radio, never <input type="radio">: a native one paints in the browser's
                accent instead of this page's orange and reads as a foreign control. */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Menu layout</p>
                  <p className="text-slate-500 text-xs mt-0.5">How items appear on the Add order screen.</p>
                </div>
                {savingAddOrderLayout&&<span className="text-xs text-slate-400 animate-pulse shrink-0">Saving…</span>}
              </div>
              <div className="flex flex-col gap-2 mt-3">
                {([
                  ['tabs','Separate categories','Show one category at a time. Tap a category to switch. Best for longer menus, where every item stays in the same place.'],
                  ['scroll','One page','Show every item in one scrolling list, with a heading for each category. There are no category buttons - you scroll to move around. Best for shorter menus, where you can see most of it at once.'],
                ] as const).map(([v,lbl,help])=>{
                  // Anything that is not exactly 'scroll' reads as 'tabs' — the SAME expression
                  // AddOrderPanel uses, so this control and that screen cannot show different answers.
                  const active=(truck?.add_order_layout==='scroll'?'scroll':'tabs')===v
                  return (
                    <button type="button" key={v} disabled={isOffline}
                      onClick={()=>saveAddOrderLayout(v)}
                      className={`w-full text-left flex items-start gap-2 ${isOffline?'opacity-50 cursor-not-allowed':'cursor-pointer'}`}>
                      <span className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${active?'border-orange-500':'border-slate-300'}`}>{active&&<span className="w-2 h-2 rounded-full bg-orange-500"/>}</span>
                      <span className="text-sm">
                        <span className="font-medium text-slate-700">{lbl}</span>
                        <span className="block text-xs text-slate-400">{help}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
            {/* ── TAKING PAYMENT — PER-EVENT OVERRIDES (V9.5) ────────────────────────────────────────
                BOTH settings are now truck DEFAULT + per-event override, so they group cleanly and the
                mixed-scope problem that blocked this grouping is gone. Each writes truck_events only and
                NEVER the trucks column — the defaults belong to Manage → Settings.
                Resolution for both is lib/payments/paid-step.ts, the same helper the order card, the Add
                Order panel and both server handlers use, so nothing here can disagree with them.
                ⚠️ NO GROUP HEADING HERE (V9.6). This card is titled by its SETTING ("Separate paid step"),
                like every other card on this tab, with "Do you take cash?" nested beneath it as a child —
                structurally identical to the auto-accept card two rows above. A "TAKING PAYMENT" group
                label was tried and removed: it is only needed in MANAGE, where three groups share one
                Order settings card, and here the nesting already carries what it was saying. Do not
                reinstate it — and note SUBCARD_HEADING is a MANAGE token; this file no longer imports it. */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 divide-y divide-slate-100">
              {/* ── 🔴 DO NOT ADD PER-EVENT SCOPE WORDING TO THESE ROWS. ────────────────────────────
                  SCOPE IS A PROPERTY OF THE SCREEN, NOT OF EACH SETTING. Dashboard → Settings is
                  PER-EVENT; Manage → Settings is TRUCK-WIDE. That holds for EVERY option on this tab,
                  not just these two, which is exactly why it does not belong in any single row's copy.
                  A row's description says what the setting DOES. The screen says what it applies to.
                  This is a DESIGN DECISION, NOT AN UNCLOSED GAP. Scope wording was removed deliberately
                  on 30 July 2026 — from the heading sub-label ("This event only. Your usual settings
                  live in Manage → Settings.") and from the cash row ("…it switches back after this
                  event"). ⚠️ Do NOT reinstate either, and do NOT add equivalent wording to any other row
                  on this tab. Repeating a screen-level fact per row is what made the card read as a
                  box of unrelated exceptions.
                  Behaviour is unaffected and always was: both toggles write truck_events overrides for
                  the ACTIVE EVENT ONLY and never touch the trucks columns (resolved by
                  lib/payments/paid-step.ts). The toasts still name the event after a tap.

                  ── 🔴 AMENDED 14 AUGUST 2026: "EVERY option on this tab" IS NO LONGER TRUE. ─────────
                  The rule above is kept because it is right about THESE rows and about why per-row
                  scope wording was removed. But the tab now carries settings that are TRUCK-WIDE, and a
                  reader who takes "PER-EVENT" as universal will draw the wrong conclusion about them:
                    • "Menu layout" (trucks.add_order_layout) — added below, in the Add order card.
                    • "Online card payments" (trucks.online_payments_paused_at) — already here, and
                      already flagging itself as the exception in its own header.
                  ⚠️ WHY MENU LAYOUT CROSSES THE BOUNDARY DELIBERATELY: it is a property of the SCREEN
                  THE OPERATOR IS LOOKING AT, not of a night's trading. A per-event copy would ask the
                  same question again at every event and let two events disagree about the shape of the
                  same menu; and the setting is only meaningful WHILE standing at the hatch on this
                  screen, which is where it now lives and is not where Manage is. Scope is still a
                  property of the SCREEN — the screen just no longer has exactly one scope.
                  ⚠️ THE PER-ROW WORDING RULE IS UNCHANGED AND STILL BINDING. The truck-wide rows do
                  NOT say "applies to every event" in their descriptions either; that is what this
                  comment is for. Do not start annotating rows with their scope. */}
              <div className="flex items-center justify-between gap-3 pb-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Take orders without payment</p>
                  <p className="text-slate-500 text-xs mt-0.5">Adds a Confirm button when you add an order yourself, so you can place it now and take payment later.</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  {savingPaidStepOverride&&<span className="text-xs text-slate-400 animate-pulse">Saving…</span>}
                  <Toggle on={effectivePaidStep} onToggle={()=>savePaidStepOverride(!effectivePaidStep)} disabled={isOffline||!activeEvent}/>
                </div>
              </div>
              {/* ── COMPLETING AN UNPAID ORDER — PER-EVENT OVERRIDE (10 August 2026) ─────────────────
                  A SIBLING of the row above, NOT a child. "Take orders without payment" decides whether
                  the Add Order panel can place an order unpaid; this decides how an unpaid order is
                  COMPLETED. Unpaid orders arrive from the CUSTOMER PATH on every truck, so this must
                  stay live whatever the row above says — it is never disabled by it.
                  ⚠️ NO PER-ROW SCOPE WORDING, per the ruling at the top of this card: scope is a
                  property of THIS SCREEN, not of each setting. The toast names the event after a tap.
                  RADIO SHAPE COPIED FROM MANAGE's "Past the deadline" control — the codebase's existing
                  two-option-with-descriptions pattern. Not a new control style. */}
              <div className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Completing an unpaid order</p>
                    <p className="text-slate-500 text-xs mt-0.5">What happens when an unpaid order is ready to hand over.</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {savingCompletionOverride&&<span className="text-xs text-slate-400 animate-pulse">Saving…</span>}
                  </div>
                </div>
                <div className="space-y-1.5 mt-1.5">
                  {/* 🔴 SAME WORDING AS MANAGE, DELIBERATELY — the two surfaces set the same setting at
                      different scopes, so an operator must meet the same sentence in both. If you edit
                      one, edit the other; app/manage/[token]/page.tsx carries the full note.
                      🔴 The button names are QUOTED FROM THE CODE — “Mark paid & collected”, “Mark paid”
                      and “Collected” are the exact `label` strings OrderCard renders. Verify against the
                      code before editing, and change the copy to match the button, never the reverse. */}
                  {([['one','One press (“Mark paid & collected”)','Best when you take the money as you hand the food over. You get a single button, “Mark paid & collected”, which records the payment and clears the order together.'],
                     ['two','Two presses (“Mark paid” & “Collected”)','Best when payment and handover happen at different moments — someone pays at the hatch, then collects when it’s ready. You get two buttons: “Mark paid” first, then “Collected” when they take the food.']] as const).map(([v,lbl,help])=>(
                    <button type="button" key={v} onClick={()=>saveCompletionPressesOverride(v)}
                      disabled={isOffline||!activeEvent||savingCompletionOverride}
                      className="w-full text-left flex items-start gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                      <span className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${effectiveCompletionPresses===v?'border-orange-500':'border-slate-300'}`}>{effectiveCompletionPresses===v&&<span className="w-2 h-2 rounded-full bg-orange-500" />}</span>
                      <span className="text-sm"><span className="font-medium text-slate-700">{lbl}</span><span className="block text-xs text-slate-400">{help}</span></span>
                    </button>
                  ))}
                </div>
              </div>
              {/* ── 🔴 NESTED AS A CHILD OF THE PAID STEP (V9.6). READ BEFORE RE-FLATTENING. ──────────
                  ⚠️ THESE TWO WERE DELIBERATELY DE-NESTED ONCE AND RE-NESTED ON A LAYOUT ARGUMENT. The
                  de-nesting rationale ("they answer different questions") is still in the git history
                  and was the WRONG TEST — two settings can answer different questions and still have
                  one DEPEND on the other, and structure should show the DEPENDENCY, not the semantics.
                  With the paid step OFF, one tap means "paid AND collected" (the button reads
                  `Paid & collected`); a Cash/Card split there would make each button also collect,
                  which "Cash" does not say, and the honest `Cash & collected` needs ~110px against a
                  72px label box at the 240px KDS column. There is no honest way to render the split
                  when the button also collects. Full reasoning at the Manage copy of this row.
                  INDENT + TYPE SCALE copied from the notes-review sub-option above (pl-4, same
                  text-sm/text-xs pair) — one nesting treatment per card, not a new one.
                  ⚠️ Unlike that sub-option this is NOT conditionally rendered: it stays visible and goes
                  DISABLED with the reason inline. Structure shows the relationship, text explains it.
                  Gated on effectivePaidStep — the RESOLVED value for THIS event, not the truck default —
                  so an event that overrides the paid step ON unlocks cash here even when Manage's truck
                  default reads off. That is correct, and it is the one case where this toggle is live
                  while Manage shows the paid step off.
                  ⚠️ Does NOT auto-enable the paid step; does NOT write takes_cash_override=false when
                  the paid step goes off — the stored override is left exactly as the operator set it. */}
              {/* ── 🔴 DE-NESTED AND RE-GATED TO MATCH MANAGE (10 August 2026) ──────────────────────
                  Two corrections to my own earlier change, which fixed the Manage copy of this row and
                  left this one behind — so the two surfaces disagreed about when cash is available.
                  1. THE GATE HAS TWO PARENTS NOW. The cash split renders in two places and they answer
                     to different settings: the Add Order panel's "Take payment" button splits on the
                     paid step, and the ORDER CARD's "Mark paid" button splits on two-press completion.
                     Gating on the paid step alone left a truck with a live "Mark paid" button unable to
                     split it. The condition is the OR of the two, and the note names both.
                  2. THE `pl-4` IS GONE, and NOT by reversing the V9.6 rule. That rule — "structure
                     should show the DEPENDENCY" — is what removes it: indentation is a SINGLE-PARENT
                     notation, it can only point at the row directly above, and that row is now only one
                     of the two ways to unlock this. The indent had stopped showing the dependency and
                     started asserting a wrong one. The disabled state plus the note carry it instead.
                  Both changes match app/manage/[token]/page.tsx exactly; full reasoning is recorded
                  there. Resolution is untouched — effectiveTakesCash still comes from the one resolver. */}
              <div className="pt-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Do you take cash?</p>
                  <p className="text-slate-500 text-xs mt-0.5">Splits the payment button into "Cash" and "Card".</p>
                  {/* 🔴 THE GATE IS GONE — 10 August 2026, matching Manage. The Add Order confirm bar now
                      ALWAYS offers a payment button (the single one when "Take orders without payment" is
                      off, the primary one when it is on), so the cash split has a live parent in every
                      configuration and a disabled toggle here would contradict a button already on
                      screen. Full reasoning at the Manage copy of this row. */}
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  {savingTakesCashOverride&&<span className="text-xs text-slate-400 animate-pulse">Saving…</span>}
                  <Toggle on={effectiveTakesCash} onToggle={()=>saveTakesCashOverride(!effectiveTakesCash)} disabled={isOffline||!activeEvent}/>
                </div>
              </div>
            </div>
            {/* Order-ready step — PER-EVENT on/off (MASTER-SWITCH model: every event has a concrete
                order_ready_override, seeded from the Settings default at creation + bulk-set when the Settings
                master switch flips). Writes order_ready_override=true|false (never null). Gates the orders-screen
                Ready button (effectiveOrderReady) — NOT the email (model A). Shared <Toggle> for size/colour
                consistency with Offline protection / Auto-accept above.
                FIX 7 — DEMO: SHOWN but locked. Customers being emailed the moment their food is ready is a
                headline feature worth seeing; but it emails real addresses and the seeded orders carry NULL
                emails, so it stays non-interactive. */}
            {activeEvent&&(
              <div className="flex items-start justify-between gap-4 p-4 bg-white rounded-2xl shadow-sm border border-slate-200">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">Order-ready step{demoLockChip}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Show a “Mark ready” button on the orders screen. Kitchen screens are set separately. Customers are emailed whenever an order is marked ready.</p>
                </div>
                <Toggle on={isDemo?false:effectiveOrderReady} onToggle={()=>{if(isDemo)return;setOrderReadyOverride(!effectiveOrderReady)}} disabled={isOffline||isDemo}/>
              </div>
            )}
            {/* ── BUZZER PROMPT — PER-EVENT ONLY ──────────────────────────────────────────────────
                Writes truck_events.buzzer_prompt for the ACTIVE EVENT and NEVER truck_vans.buzzer_count
                — the van default (does this vehicle carry buzzers) belongs to Manage → Settings, and
                this dashboard must not write it. Resolution is resolveBuzzerPrompt (lib/buzzer.ts),
                the same override-then-default idiom resolvePaidStep uses, and the ONLY place that
                chain lives.
                ⚠️ RENDERED ONLY WHEN THE VAN HAS BUZZERS (vanBuzzerCount != null). A van with no
                buzzers has nothing to prompt for, and a disabled toggle would advertise a feature the
                operator cannot reach from this screen.
                ⚠️ NO PER-EVENT SCOPE WORDING in the copy — scope is a property of THIS SCREEN, not of
                each row. See the 🔴 note above the paid-step card. */}
            {activeEvent&&vanBuzzerCount!=null&&(
              <div className="flex items-start justify-between gap-4 p-4 bg-white rounded-2xl shadow-sm border border-slate-200">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">Remind me to add a buzzer</p>
                  <p className="text-xs text-slate-500 mt-0.5">Opens the buzzer grid as soon as you place an order, so the number goes on the board while the customer is still in front of you. With it off you can still add a buzzer any time by tapping the order, but nothing will prompt you. Useful where you hand buzzers out, easy to switch off where you don’t.</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {savingBuzzerPrompt&&<span className="text-xs text-slate-400 animate-pulse">Saving…</span>}
                  <Toggle on={effectiveBuzzerPrompt} onToggle={()=>saveBuzzerPromptOverride(!effectiveBuzzerPrompt)} disabled={isOffline||!activeEvent}/>
                </div>
              </div>
            )}
              </div>
            </div>

            {/* ── 🔴 TEMPORARY — ONLINE CARD PAYMENTS. DELETE THIS WHOLE BLOCK WITH THE SWITCH. ──────
                🔴 DELIBERATELY OUTSIDE THE CARD ABOVE, AND THE SEPARATION IS THE POINT.
                That card's house rule (read the 🔴 note at the top of it) is that SCOPE IS A PROPERTY OF
                THE SCREEN: everything in it is PER-EVENT, so no row repeats it. This control breaks that
                invariant — it is TRUCK-WIDE and writes trucks.online_payments_paused_at — so putting it
                in that card would silently make every neighbouring row's scope a lie. It gets its own
                block, its own heading, and copy that states the scope explicitly, precisely BECAUSE the
                surrounding convention says not to. Do not merge it in.
                ⚠️ IT DOES NOT SELF-EXPIRE. The three overrides above lapse when the event does, because
                nothing seeds them onto the next one. This one persists until an operator clears it —
                correct for a payment incident, and the reason for the persistent banner at the top of
                every tab. Do not add an auto-expiry.
                ⚠️ NOT GATED ON activeEvent, unlike every toggle above. A truck-wide switch must be
                reachable during an incident whether or not an event is selected.
                ⚠️ THE DATE IS RENDERED FROM THE ISO STRING BY SLICE, not toLocaleString: this is a
                client component that also renders on the server, and a locale-formatted date is a
                hydration mismatch. The switch stores WHEN so this line can exist at all.

                ── 🔴 THE GATE HAS TWO ARMS AND BOTH ARE LOAD-BEARING ─────────────────────────────
                (a) truck.stripe_charges_enabled — the truck can actually take cards. Without this arm
                    the control renders for every truck, including Pizzeria Gusto, which has no Stripe
                    account at all and was being offered a switch for a capability it does not have.
                🔴 (b) truck.online_payments_paused_at — the truck is CURRENTLY PAUSED.
                    THIS ARM IS NOT REDUNDANT AND MUST NOT BE DROPPED. Readiness can be withdrawn at
                    any time: Stripe revokes charges_enabled the moment a requirement falls due, and
                    the account.updated webhook writes that straight to operators. A truck that paused
                    during an incident and then lost readiness would, under (a) alone, have the ONLY
                    control that can clear the pause disappear from the screen — leaving it paused with
                    no way out, and the banner above still telling it to "turn it back on" with nothing
                    to turn. THE WAY OUT MUST NEVER BE HIDDEN. Arm (b) is what guarantees that: a
                    non-null paused_at is exactly the state in which the control is indispensable.
                ⚠️ OR, never AND. (a) alone is a truck that can take cards and is not paused — show it.
                (b) alone is a truck that is paused and cannot take cards — show it, because it needs
                the way out. Both is the ordinary paused-but-ready case. Neither is Gusto.
                ⚠️ The BANNER above is deliberately gated on (b) ONLY and is not touched by this: a
                paused truck must keep seeing why cards are off wherever it is in the app. */}
            {(truck?.stripe_charges_enabled === true || truck?.online_payments_paused_at != null) && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">Take card payments online</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Turn this off during a card problem and customers will place orders as normal and pay at the hatch instead. Orders keep coming; only the card step stops.
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    This applies to your whole truck, on every event, and stays off until you turn it back on.
                  </p>
                  {truck?.online_payments_paused_at&&(
                    <p className="text-xs font-semibold text-amber-700 mt-1.5">
                      Off since {String(truck.online_payments_paused_at).slice(0,10)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {savingOnlinePaymentsPause&&<span className="text-xs text-slate-400 animate-pulse">Saving…</span>}
                  {/* ON means "we take cards", so the stored value is INVERTED at both ends: the toggle
                      reads !pausedAt, and tapping saves !pausedAt (currently on ⇒ pause). */}
                  <Toggle on={!truck?.online_payments_paused_at} onToggle={()=>saveOnlinePaymentsPaused(!truck?.online_payments_paused_at)} disabled={isOffline}/>
                </div>
              </div>
            </div>
            )}

            {/* SOUNDS — same trucks.sound_config as Manage → Settings (mirrors automatically). Which alerts
                fire; the on/off MASTER is the per-device header toggle.
                DEMO: HIDDEN. Was briefly shown-but-locked; reverted because the sound model is moving to
                PER-DEVICE (the per-truck "which sounds" split is being retired — see the V9.0 note), so
                advertising this card would be showing a prospect a control that won't exist where they'd
                go looking for it. Better to show nothing than to promise the wrong shape. */}
            {!isDemo&&(()=>{
              const sc=soundCfg
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
                      as minutes). Same saveKitchenCapacity / saveCapacityWindow writes.
                      DEMO: SHOWN, and deliberately UNSET. Provisioning passes kitchen_capacity: null, so
                      this renders its existing null state (∞ = no van-level ceiling) and the MAINS category
                      batch alone governs — one number, one story. Same principle as offline protection:
                      a real feature a prospect should see exists, not something to hide. */}
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
                printing: iPad-native + Max-gated inside the component. Notifications: iPad-native, device-local.
                DEMO: both hidden — hardware/device configuration a prospect has nothing to point at. */}
            {!isDemo&&truck&&<PrintingSettings plan={truck.plan} featureOverrides={truck.feature_overrides} trialExpiresAt={truck.trial_expires_at} mode={truck.print_trigger_mode==='on_confirmed'?'on_confirmed':'lead_time'} onChangeMode={savePrintTriggerMode} connected={printing.status.connected} statusDetail={printing.status.detail} waitingCount={printing.waitingCount}/>}
            {!isDemo&&<NotificationSettings token={token}/>}
          </div>
        )}

        {/* MENU & STOCK TAB (service-time: per-event stock + availability operators adjust mid-service) */}
        {activeTab==='stock'&&(
          <div className="space-y-4">
            {/* Stock is EDITABLE offline (unlike Settings, which lock) — changes are optimistic + durably
                queued and reconcile on reconnect. Distinct affordance so the operator knows it's safe to edit. */}
            {/* ── 🔴 THE MENU & STOCK OFFLINE NOTICE WAS DELETED HERE (14 August 2026). ─────────────────
                It read "You're offline — stock changes are saved on this device and will sync when you
                reconnect" — which OfflineBanner now says persistently, with a COUNT, on every tab. It
                added nothing this tab did not already have on screen above it. */}
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

      {/* Event-cancel gate — the SHARED modal (components/shared/EventCancelModal), the same one manage
          and the KDS use. It replaced a window.confirm whose safe button read "Cancel". */}
      {eventCancelTarget&&(
        <EventCancelModal
          event={eventCancelTarget}
          affectedOrderCount={eventCancelCount}
          busy={eventCancelBusy}
          onKeep={()=>setEventCancelTarget(null)}
          onConfirm={(reason,note)=>{void doCancelEvent(eventCancelTarget.id,reason,note)}}
        />
      )}

      {/* ── CHANGE FINISH TIME — THE SHARED MODAL, the same one the KDS mounts ───────────────────────
          🔴 THIS IS THE REPLACEMENT FOR `Extend event +30 min`. Same component, same validation, same
          confirm copy, same affected-order count as the KDS — the divergence was the point of the change.
          ⚠️ `eventOrders` is this screen's per-event list; the modal excludes terminal statuses itself, so
          both surfaces count "due after" the same way rather than each pre-filtering to its own idea of
          live. This screen holds ledger data the KDS does not, and NONE of it is passed — the control
          decides nothing about money. */}
      {finishTimeTarget&&(
        <EventFinishTimeModal
          event={finishTimeTarget}
          orders={eventOrders}
          busy={finishTimeBusy}
          onClose={()=>setFinishTimeTarget(null)}
          onConfirm={newEnd=>{void applyFinishTime(finishTimeTarget.id,newEnd)}}
        />
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

      {/* Pause duration picker. DEMO: gated here too, not just at the entry point — belt-and-braces so a
          stale showPauseModal can never render the one control we just removed. */}
      {showPauseModal&&!isDemo&&(
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

      {/* Buzzer grid — CARD path (tapping the chip on an order). Non-blocking: the operator opened it
          deliberately, so a backdrop tap closes it. The after-order PROMPT is a separate, blocking
          instance that lives inside AddOrderPanel. `orders` (not the split columns) so a buzzer held by
          a collected/cancelled order is correctly seen as free — the filtering is buildBuzzerMap's job,
          driven by BUZZER_IN_USE_STATUSES, never by which column a card happens to be rendered in. */}
      {buzzerTarget&&vanBuzzerCount!=null&&(
        <BuzzerGrid
          open
          buzzerCount={vanBuzzerCount}
          orders={orders}
          eventId={buzzerTarget.event_id??activeEvent?.id??null}
          targetOrderKey={buzzerTarget.order_key}
          targetOrderId={String(buzzerTarget.id)}
          /* LIVE, re-read from `orders` each render. 🔴 resolveCurrentBuzzer, NOT a `??` chain — the
             inline `live ?? snapshot ?? null` that used to be here fell through on null, so a DESELECT
             (whose whole point is null) reverted to the stale snapshot and the cell stayed red. See
             lib/buzzer.ts. */
          currentNumber={resolveCurrentBuzzer(orders,buzzerTarget)}
          saving={savingBuzzer}
          onAssign={(n,keepOpen)=>saveBuzzer(buzzerTarget.order_key,n,keepOpen)}
          onClose={()=>setBuzzerTarget(null)}
        />
      )}

      {/* Cancel order modal */}
      {showCancelModal&&cancellingOrder&&(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 flex flex-col gap-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Cancel order #{cancellingOrder.id}?</h3>
              <p className="text-sm text-slate-500 mt-1">{cancellingOrder.customer_name} · £{cancellingOrder.total.toFixed(2)}</p>
            </div>
            {/* ── 🔴 WHAT HAPPENS TO THE MONEY, STATED BEFORE THE OPERATOR PRESSES ANYTHING. ────────
                Four different things can be true of a cancelled order's money and only one of them is a
                refund. Each says what IS true rather than what usually is:
                  card money taken  -> offer the refund, with the amount, and let them decline it
                  card held         -> nothing was taken; do NOT promise a refund for money that never moved
                  cash taken        -> there is no card to refund; the cash is handed back at the truck
                  nothing taken     -> no block at all, and the modal is exactly as it was */}
            {(()=>{const rows=payments[cancellingOrder.order_key]??[]
              const cardMinor=rows.filter((r:any)=>r.kind==='charge'&&r.channel==='online').reduce((t:number,r:any)=>t+r.amount_minor,0)
              const refundedAlready=rows.filter((r:any)=>r.kind==='refund').reduce((t:number,r:any)=>t+r.amount_minor,0)
              const refundable=Math.max(0,cardMinor-refundedAlready)
              const cashMinor=rows.filter((r:any)=>r.kind==='charge'&&r.channel!=='online').reduce((t:number,r:any)=>t+r.amount_minor,0)
              const held=heldAuthorisations.has(cancellingOrder.order_key)
              const money=(m:number)=>`£${(m/100).toFixed(2)}`
              if(refundable>0)return(
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-sm font-semibold text-amber-900">Cancel this order and refund {money(refundable)} to the customer&apos;s card?</p>
                  <label className="flex items-start gap-2 mt-3 text-sm text-amber-900">
                    <input type="checkbox" checked={cancelRefund} onChange={e=>{setCancelRefund(e.target.checked);setCancelError(null)}} className="mt-0.5"/>
                    <span>Refund {money(refundable)} to their card</span>
                  </label>
                  {cancelRefund?(
                    /* The reason for the refund IS the reason for the cancellation — asked once, below. */
                    <p className="text-xs text-amber-800 mt-2">The reason you give below is recorded against the refund.</p>
                  ):(
                    /* 🔴 THE NO-SHOW. The food was made and nobody came, so the money stays with the
                       truck — a real cancellation that must not return it. Said plainly, because an
                       unticked box beside an amount is otherwise easy to misread. */
                    <p className="text-xs text-amber-800 mt-2">The order will be cancelled and the {money(refundable)} will stay with you. Nothing goes back to the customer&apos;s card.</p>
                  )}
                </div>
              )
              if(held)return(
                <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
                  <p className="text-sm text-indigo-900">Their card is <strong>held, not charged</strong> — no money has been taken, so there is nothing to refund. Cancelling releases the hold straight away.</p>
                </div>
              )
              if(cashMinor>0)return(
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-sm text-slate-700">{money(cashMinor)} was taken in person. There is no card payment to refund — hand the money back at the truck, and use the PAID chip on the order to remove the record.</p>
                </div>
              )
              return null})()}
            {cancelError&&(
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{cancelError}</p>
            )}
            {/* ── 🔴 ONE REASON, FILLED ONCE. ──────────────────────────────────────────────────────
                The modal carried TWO selects: this one (three cancellation reasons, shown to the
                customer) and the refund form's own (the seven the refund path records). An operator
                cancelling a paid order had to answer the same question twice, in two vocabularies.
                🔴 THE SEVEN SURVIVE, BECAUSE THEY ARE A SUPERSET. Every cancellation reason maps onto
                one of them with nothing dropped: "Sold out / item unavailable" is Item unavailable,
                "Requested by customer" is Customer cancelled, "Other" is Other. The reverse is not
                true — Order not collected, Wrong or missing item, Quality issue and Duplicate payment
                had no cancellation equivalent, so keeping the three would have LOST four.
                ⚠️ THE LABEL IS WHAT THE CUSTOMER READS, in the cancellation email, exactly as before.
                The machine value is what reaches the refund path and the audit log. */}
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Reason {cancelNeedsRefundReason?'— required':'— optional'}
              </label>
              <select value={cancelReason} onChange={e=>{setCancelReason(e.target.value);setCancelError(null)}} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm">
                <option value="">Select a reason</option>
                {CANCEL_REASONS.map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Additional note — optional</label>
              <textarea value={cancelNote} onChange={e=>setCancelNote(e.target.value)} placeholder="Add more detail for the customer..." rows={2} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none"/>
            </div>
            <div className="flex gap-3">
              <button disabled={cancelBusy} onClick={resetCancelModal} className="flex-1 border border-slate-200 text-slate-600 font-medium py-3 rounded-xl text-sm disabled:opacity-50">Keep order</button>
              <button disabled={cancelBusy} onClick={()=>confirmCancelOrder()} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-50">{cancelBusy?'Refunding…':'Cancel order'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Reject order modal — REQUIRED reason (shown to the customer). EXTRACTED to
          components/shared/RejectOrderModal so the KDS shows the SAME gate; its Reject button used to
          reject immediately and email the customer with no reason. The mount condition, the order it
          reads and resetRejectModal are unchanged, so this surface renders exactly what it rendered. */}
      {showRejectModal&&rejectingOrder&&(
        <RejectOrderModal
          orderId={rejectingOrder.id}
          customerName={rejectingOrder.customer_name}
          totalLabel={` · £${rejectingOrder.total.toFixed(2)}`}
          onConfirm={confirmRejectOrder}
          onDismiss={resetRejectModal}
        />
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
                      // ❗ = STRICTLY over the ceiling, not merely full — red alone conflates the two
                      // (tone goes red at conc >= ceiling). Same mark, same rule as the Add Order
                      // picker. Permanent property of the slot's load; unaffected by any acknowledgement.
                      const ind=editSlotIndicators.get(s.collection_time)??{emoji:'🟢',label:'',overTotal:0}
                      const label=`${ind.label?` ${ind.label}`:''}${isCurrent?' · (current)':''}`
                      return<option key={s.collection_time} value={s.collection_time}>{s.collection_time} {ind.emoji}{ind.overTotal>0?'❗':''}{label}</option>
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
            {/* UNPRICEABLE NEW LINE. Everything already on this order keeps the price it was placed
                at — the server reads those off the stored row, so a menu price change can never move
                them and there is nothing to confirm. This fires only when the edit ADDS a name the
                live menu doesn't have, which has no authoritative price. Nothing was saved.
                Hidden the moment the basket changes: the verdict belonged to a different basket. */}
            {editRepriceActive&&(
              <div className="mb-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-3">
                <p className="text-sm font-black text-amber-800 mb-1">Not on the menu</p>
                <p className="text-xs text-amber-800 mb-2">
                  These are new to this order and aren&apos;t on the menu, so the price couldn&apos;t be checked.
                  Everything already on the order keeps its original price. Nothing has been saved yet.
                </p>
                <div className="space-y-0.5">
                  {editReprice!.unresolved.map((u,i)=>(
                    <p key={`${u.name}-${i}`} className="text-xs text-amber-800">
                      {u.kind==='deal'?'🎁 ':''}{u.name}{u.on?` (on ${u.on})`:''} — kept at <strong>£{u.advisoryPrice.toFixed(2)}</strong>
                    </p>
                  ))}
                </div>
                <div className="flex justify-between text-sm font-black text-amber-900 mt-2 pt-2 border-t border-amber-200">
                  <span>Order total</span><span>£{editReprice!.total.toFixed(2)}</span>
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={()=>setEditingOrder(null)} className="flex-1 bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl hover:bg-slate-200 text-sm">Cancel</button>
              <button onClick={()=>submitEdit(editRepriceActive?editReprice!.total:undefined)} disabled={!!actionLoading?.startsWith('edit')||!isOrderNonEmpty(editItems,editDeals)} className="flex-1 bg-orange-600 text-white font-bold py-2.5 rounded-xl hover:bg-orange-700 text-sm disabled:opacity-50">
                {actionLoading?.startsWith('edit')?'Saving...':editRepriceActive?`Save at £${editReprice!.total.toFixed(2)}`:'Save changes'}
              </button>
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

      {/* DEMO event-actions explainer — opened by any locked event control (event bar or AddOrderPanel).
          Answers "why can't I?" and reframes it as a signup benefit, rather than a dead disabled button. */}
      {showDemoEventLock&&(
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-end sm:items-center justify-center p-4" onClick={e=>e.target===e.currentTarget&&setShowDemoEventLock(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <div className="flex items-start justify-between gap-3 mb-3">
              <h3 className="font-black text-slate-900 flex items-center gap-2"><span aria-hidden>🔒</span> Event actions</h3>
              <button onClick={()=>setShowDemoEventLock(false)} aria-label="Close" className="text-slate-400 hover:text-slate-700 text-xl font-bold w-8 h-8 flex items-center justify-center leading-none">×</button>
            </div>
            <p className="text-sm text-slate-600 mb-3">
              This is where you start and close a service, pause orders when the queue gets long, or switch to a different event.
            </p>
            <p className="text-sm text-slate-600 mb-4">
              We keep one event running in the demo so there&apos;s always something to play with. You get full control when you sign up.
            </p>
            <button onClick={()=>setShowDemoEventLock(false)}
              className="w-full bg-slate-900 text-white font-bold py-2.5 rounded-xl text-sm hover:bg-slate-800">
              Got it
            </button>
          </div>
        </div>
      )}

      {/* ── EVENT ACTIONS — THE SHARED MODAL, the same one the KDS mounts ───────────────────────────
          🔴 EXTRACTED so the two menus cannot drift again. This screen's copy was the more complete of
          the two, so it is the one that moved into components/shared/EventActionsModal; the KDS was
          missing Start / Restart Event entirely.
          ⚠️ EVERY ACTION IS STILL THIS SCREEN'S OWN — the pause write, the extra-wait control and the
          tab switch behind "Change event" are unchanged; only the MENU is shared.
          ⚠️ DEMO: Pause is withheld and Resume is not, exactly as before — `onPause` is omitted while
          `onResume` is passed, so recovery stays reachable and only the trap is removed. */}
      {showEventMenu&&activeEvent&&!isDemo&&(
        <EventActionsModal
          event={{id:activeEvent.id,venue_name:activeEvent.venue_name,status:activeEvent.status}}
          noteValue={eventNoteInput}
          onNoteChange={setEventNoteInput}
          onSaveNote={()=>saveEventNote(activeEvent.id)}
          onStartEvent={()=>{openEvent(activeEvent.id);setShowEventMenu(false)}}
          onChangeEvent={()=>{setShowEventMenu(false);setActiveTab('add');setPendingOpenEventPicker(true)}}
          paused={paused}
          onPause={isDemo?undefined:()=>{setShowEventMenu(false);setShowPauseModal(true)}}
          onResume={()=>{fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'set_paused',paused_until:null,eventId:activeEvent?.id})});markPending('pausedUntil',null);markPending('vanPausedUntil',null);setPausedUntil(null);setVanPausedUntil(null);setVanOnlinePausedUntil(null);setShowEventMenu(false)}}
          extraWaitControl={renderExtraWait('w-full')}
          onChangeFinishTime={()=>{setShowEventMenu(false);setFinishTimeTarget({id:activeEvent.id,end_time:activeEvent.end_time??null,event_date:activeEvent.event_date??null})}}
          onFinishEvent={()=>finishEvent(activeEvent.id)}
          onCancelEvent={()=>cancelEventFromMenu(activeEvent)}
          onClose={()=>setShowEventMenu(false)}
        />
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
          {/* DEMO: the truck name is a generated internal id ("Demo Kitchen (12w7he)") — hidden everywhere
              else in demo for exactly that reason. Strip the trailing "(code)" so the QR label reads a clean
              "Demo Kitchen" instead of leaking the identifier. */}
          <p className="text-lg font-bold text-slate-900 mt-4">{isDemo ? (truck?.name?.replace(/\s*\([^)]*\)\s*$/, '') || 'Demo') : truck?.name}</p>
          <p className="text-xs text-slate-500 mt-1">Powered by <span className="font-semibold text-orange-600">HatchGrab</span></p>
          <p className="text-xs text-slate-300 mt-4">Tap anywhere to close</p>
        </div>
      )}

    </div>
  )
}

// ─── Deals modal ──────────────────────────────────────────────────────────────