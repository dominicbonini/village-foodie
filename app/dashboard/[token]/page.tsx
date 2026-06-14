'use client'
// app/dashboard/[token]/page.tsx

import { useState, useEffect, useCallback, useRef, useMemo, use } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { hasFeature } from '@/lib/features'
import AppHeader from '@/components/shared/AppHeader'

import type {
  Order, Slot, TruckData, TruckMenu, Bundle, MenuItem,
  BasketItem, AppliedDeal, ItemStock, CategoryStock, CatConfig,
  ModifierOption, ModifierGroup, TruckEvent,
} from '@/components/dashboard/types'
import { STATUS, DEFAULT_CAT_CONFIG } from '@/components/dashboard/types'
import {
  getAsapSlot, getCatConfig, catCookSecs,
  calcMinsFromNow, getAllDayCounts, resolveCollectionTime
} from '@/components/dashboard/helpers'
import { OrderCard, Toggle, InlinePriceEditor } from '@/components/dashboard/OrderCard'

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
import UserMenu from '@/components/dashboard/UserMenu'
import { calculateOrderTotal } from '@/lib/order-calculations'
import { adjustQuantity, cleanupDealsForItem, groupByCategory, isOrderNonEmpty, consumeBasketItemsForDeal, dealConsumedCartKeys } from '@/lib/basket-utils'
import { supabaseBrowser } from '@/lib/supabase-browser'
import { keepAwake, allowSleep } from '@/lib/native/keepAwake'
import { formatTime, localTodayIso, pickDefaultEventByTime } from '@/lib/time-utils'
import { KITCHEN_CAPACITY_DESC, KITCHEN_CAPACITY_EXAMPLE, KITCHEN_CAPACITY_WARNING, kitchenCapacityNeedsPrepWarning } from '@/lib/kitchen-capacity'
import { buildSlotIndicators, type SlotIndicator } from '@/lib/slot-display'

function makeCartKey(itemName: string, mods: { name: string }[], notes?: string): string {
  const parts: string[] = []
  const modStr = [...mods].map(m => m.name).sort().join('|')
  if (modStr) parts.push(modStr)
  const noteStr = (notes || '').trim()
  if (noteStr) parts.push(`note:${noteStr}`)
  return parts.length > 0 ? `${itemName}::${parts.join('::')}` : itemName
}

export default function DashboardPage({params}:{params:Promise<{token:string}>}) {
  const{token}=use(params)
  const searchParams=useSearchParams()
  const vanName=searchParams.get('van_name')??''
  const vanId=searchParams.get('van_id')??''
  const[pin,setPin]=useState('')
  const[pinInput,setPinInput]=useState('')
  const[pinError,setPinError]=useState('')
  const[requiresPin,setRequiresPin]=useState(false)
  const[authenticated,setAuthenticated]=useState(false)
  const[truck,setTruck]=useState<TruckData|null>(null)
  const[orders,setOrders]=useState<Order[]>([])
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
  // Set by Escape so the blur it triggers reverts the draft instead of committing it.
  const skipStockBlurRef=useRef(false)
  const[loading,setLoading]=useState(true)
  const[error,setError]=useState<string|null>(null)
  const[lastRefresh,setLastRefresh]=useState(new Date())
  const[activeTab,setActiveTab]=useState<'orders'|'add'|'stock'>('orders')
  const[actionLoading,setActionLoading]=useState<string|null>(null)
  const[toast,setToast]=useState<{msg:string;type:'success'|'error'}|null>(null)
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
  const[vanAutoPause,setVanAutoPause]=useState<boolean>(false)
  const[eventOfflineOverride,setEventOfflineOverride]=useState<boolean|null>(null)
  const[kitchenCapacity,setKitchenCapacity]=useState<number|null>(null)
  const[capacityWindowMins,setCapacityWindowMins]=useState<number>(5)
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
  const[showPauseModal,setShowPauseModal]=useState(false)
  // Offline-pause notification: durable marker from /api/dashboard (set only by heartbeat-monitor,
  // survives the reconnect clear). Fires a one-time popup when it's NEWER than this device's ack.
  const[lastOfflinePauseAt,setLastOfflinePauseAt]=useState<string|null>(null)
  const[offlinePauseEventId,setOfflinePauseEventId]=useState<string|null>(null)
  const[showOfflinePausedNotice,setShowOfflinePausedNotice]=useState(false)
  const[offlinePauseNoticeEnabled,setOfflinePauseNoticeEnabled]=useState(true) // per-device pref (localStorage)
  // OK → record the acknowledged marker for THIS event so a poll tick / reload won't re-pop it; a
  // newer offline pause (newer timestamp) clears the guard and re-fires.
  const ackOfflinePausedNotice=()=>{
    if(typeof window!=='undefined'&&offlinePauseEventId&&lastOfflinePauseAt)
      localStorage.setItem(`hg_offline_pause_ack_${offlinePauseEventId}`,lastOfflinePauseAt)
    setShowOfflinePausedNotice(false)
  }
  const toggleOfflinePauseNotice=()=>setOfflinePauseNoticeEnabled(prev=>{
    const next=!prev
    if(typeof window!=='undefined') localStorage.setItem('hg_offline_pause_notice',next?'on':'off')
    if(!next) setShowOfflinePausedNotice(false)
    return next
  })
  const isFuturePause=(s:string|null)=>!!s&&new Date(s).getTime()>Date.now()
  const manualPaused=isFuturePause(pausedUntil)||isFuturePause(vanPausedUntil)
  const offlinePaused=isFuturePause(vanOnlinePausedUntil)
  const paused=manualPaused||offlinePaused
  const pauseReason:'manual'|'offline'|null=manualPaused?'manual':offlinePaused?'offline':null
  const pauseUntilEffective=[vanPausedUntil,pausedUntil,vanOnlinePausedUntil].find(isFuturePause)??null
  // Cancel confirmation modal
  const[showCancelModal,setShowCancelModal]=useState(false)
  const[cancellingOrder,setCancellingOrder]=useState<Order|null>(null)
  const[cancelReason,setCancelReason]=useState('')
  const[cancelNote,setCancelNote]=useState('')
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
  // Event the ping baseline (prevPendingCount) belongs to — prevents an event
  // SWITCH from being mistaken for new orders and firing a spurious ping.
  const soundEventRef=useRef<string|null>(null)
  // Selected event {id,date} for scoping /api/dashboard. Held in a ref so the
  // realtime/interval refetches (which call fetchAllRef with no args) stay scoped.
  const selectedEventRef=useRef<{id:string,date:string}|null>(null)
  const fetchAllRef=useRef<()=>void>(()=>{})
  // Tracks auth across fetchAll closures (authenticated state is stale inside the callback).
  // Once true, transient fetch failures keep existing state instead of showing the error screen.
  const authenticatedRef=useRef(false)
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

  const showToast=(msg:string,type:'success'|'error'='success')=>{setToast({msg,type});setTimeout(()=>setToast(null),3500)}
  const handleSignOut=async()=>{await supabaseBrowser.auth.signOut();window.location.href='/login'}

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
        setCategoryStocksByEvent(prev=>({...prev,[key]:d.categoryStocks??[]}))
        setFetchedStockKeys(prev=>prev.has(key)?prev:new Set(prev).add(key))
      }).catch(()=>null)
  },[token])

  const fetchAll=useCallback(async(currentPin=pin)=>{
    try {
      const p=new URLSearchParams({token}); if(currentPin) p.set('pin',currentPin)
      // Scope the read to the selected event (V6.4). Pass its date too so the
      // route resolves the right event even when it isn't today's first event.
      const sel=selectedEventRef.current
      if(sel){p.set('event_id',sel.id);p.set('date',sel.date)}
      const res=await fetch(`/api/dashboard?${p}`); const data=await res.json()
      if(res.status===401){if(data.requiresPin){setRequiresPin(true);setLoading(false);return};setError('Invalid access link');setLoading(false);return}
      // Transient failure after successful auth — keep existing state, never blank the dashboard
      if(!res.ok){if(authenticatedRef.current){console.warn('[fetchAll] dashboard fetch failed:',res.status,'— keeping existing state')}else{setError(data.error||'Failed to load')};setLoading(false);return}
      setTruck(data.truck)
      setKeepScreenOn(data.truck?.keep_screen_on ?? true)
      setAutoAccept(data.truck?.auto_accept || false); setPausedUntil(data.truck?.paused_until||null); setVanPausedUntil(data.vanPausedUntil??null); setVanOnlinePausedUntil(data.vanOnlinePausedUntil??null); setLastOfflinePauseAt(data.lastOfflinePauseAt??null); setOfflinePauseEventId(data.offlinePauseEventId??null); setExtraWaitMins(data.truck?.extra_wait_mins||0); setExtraWaitStartedAt(data.truck?.extra_wait_started_at||null); setOrders(data.orders); setSlots(data.slots)
      // Clear prep pills for orders no longer active (collected/cancelled)
      const activeOrderKeys=new Set((data.orders||[]).filter((o:Order)=>['pending','confirmed','modified'].includes(o.status)).map((o:Order)=>o.order_key))
      setStruckPrep(prev=>{const n=new Set<string>();prev.forEach(k=>{const orderKey=k.split(':')[0];if(activeOrderKeys.has(orderKey))n.add(k)});return n})
      if(data.currentUserName !== undefined) setCurrentUserName(data.currentUserName)
      if(data.userRole !== undefined) setUserRole(data.userRole)
      // Capacity card: single-source from the server (service-role van read). Guard on
      // !== undefined so a failed/partial response never wipes a good value.
      if(data.kitchenCapacity !== undefined) setKitchenCapacity(data.kitchenCapacity)
      if(data.capacityWindowMins !== undefined) setCapacityWindowMins(data.capacityWindowMins ?? 5)
      if(data.activeVanName !== undefined) setActiveVanName(data.activeVanName)
      // Real van offline-protection default (Settings value) — feeds the toggle/label when
      // there's no event override. Without this, vanAutoPause stayed hardcoded false.
      if(data.vanAutoPause !== undefined) setVanAutoPause(data.vanAutoPause)
      setAuthenticated(true); authenticatedRef.current=true; setLastRefresh(new Date())
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
  },[token,pin,fetchMenu,fetchStock])

  useEffect(()=>{fetchAll()},[fetchAll])

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
    const event=selectedEventId?upcomingEvents.find(e=>e.id===selectedEventId)??null:null
    // kitchen_capacity + active van name now come from /api/dashboard (service-role read in
    // fetchAll). The direct anon truck_vans read here was RLS-blocked, so the card showed
    // "No limit" even though the van had a value. See diagnosis. Only the event-scoped
    // offline-override read remains.
    if(!event?.van_id){setEventOfflineOverride(null);return}
    supabaseBrowser.from('truck_events').select('offline_protection_override').eq('id',event.id).single()
      .then(({data})=>{setEventOfflineOverride(data?.offline_protection_override??null)})
  },[selectedEventId,upcomingEvents])
  useEffect(()=>{fetchAllRef.current=fetchAll},[fetchAll])
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
  // Refetch only when the SELECTED event changes, so orders/badges/sound re-scope.
  useEffect(()=>{
    if(authenticatedRef.current) fetchAllRef.current()
  },[selectedEventId])
  useEffect(()=>{
    fetch('/api/auth/me').then(r=>r.json()).then(d=>{if(d.email)setCurrentUserEmail(d.email);if(d.first_name)setCurrentUserFirstName(d.first_name);if(d.is_admin)setIsAdmin(true)}).catch(()=>null)
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
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'trucks',filter:`id=eq.${truck.id}`},
        ()=>fetchAllRef.current())
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
  // Load the per-device offline-pause-notice preference (default ON).
  useEffect(()=>{if(typeof window!=='undefined')setOfflinePauseNoticeEnabled(localStorage.getItem('hg_offline_pause_notice')!=='off')},[])
  // Fire the popup when the durable marker is NEWER than this device's ack for that event. Deps are
  // the marker + its event id, so a poll tick that returns the SAME timestamp doesn't re-run it; after
  // OK (ack = marker) the `> ack` test is false; a NEW offline pause (newer marker) re-fires.
  useEffect(()=>{
    if(typeof window==='undefined'||!offlinePauseNoticeEnabled) return
    if(!offlinePauseEventId||!lastOfflinePauseAt) return
    const ack=localStorage.getItem(`hg_offline_pause_ack_${offlinePauseEventId}`)
    if(!ack||new Date(lastOfflinePauseAt).getTime()>new Date(ack).getTime()) setShowOfflinePausedNotice(true)
  },[lastOfflinePauseAt,offlinePauseEventId,offlinePauseNoticeEnabled])
  useEffect(()=>{
    const sendHeartbeat=async()=>{
      if(typeof navigator!=='undefined'&&!navigator.onLine)return
      console.log('[Heartbeat] sending token:',token,'vanId:',vanId||'(none)')
      try{
        const res=await fetch('/api/heartbeat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,vanId:vanId||undefined})})
        const data=await res.json()
        console.log('[Heartbeat] response:',data)
      }catch(err){console.error('[Heartbeat] failed:',err)}
    }
    sendHeartbeat()
    const id=setInterval(sendHeartbeat,15000)
    return()=>clearInterval(id)
  },[token])
  useEffect(()=>{
    if(!authenticated)return
    if(keepScreenOn){keepAwake()}else{allowSleep()}
    return()=>{allowSleep()}
  },[authenticated,keepScreenOn])
  useEffect(()=>{
    // orders is now event-scoped server-side. The ping must only fire for NEW
    // pending orders within the SAME event — never when switching events brings in
    // a different event's set. Identify the event from the data (all rows share the
    // selected event_id), falling back to selectedEventId for an empty list.
    const count=orders.filter(o=>o.status==='pending').length
    const ordersEventId=orders.find(o=>o.event_id)?.event_id??selectedEventId??null
    const sameEvent=ordersEventId===soundEventRef.current
    if(sameEvent&&count>prevPendingCount.current&&authenticated){
      try{const ctx=new(window.AudioContext||(window as any).webkitAudioContext)();const osc=ctx.createOscillator();const gain=ctx.createGain();osc.connect(gain);gain.connect(ctx.destination);osc.frequency.value=880;gain.gain.setValueAtTime(0.3,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.6);osc.start(ctx.currentTime);osc.stop(ctx.currentTime+0.6)}catch{}
    }
    soundEventRef.current=ordersEventId
    prevPendingCount.current=count
  },[orders,authenticated,selectedEventId])

  useEffect(()=>{setQrFullscreenDataUrl(null)},[truck?.logo,truck?.qr_code_style])

  const handleOpenKDS=()=>{
    if(vans.length===1){
      const van=vans[0]
      if(van?.kds_token){window.open(`/kds/${van.kds_token}`,'_blank')}
      else{window.open(`/dashboard/${token}/kds`,'_blank')}
      return
    }
    if(vans.length===0){window.open(`/dashboard/${token}/kds`,'_blank');return}
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
    const res=await fetch(`/api/dashboard?${p}`); const data=await res.json()
    if(!res.ok){setPinError('Incorrect PIN');return}
    setPin(pinInput); setTruck(data.truck); setOrders(data.orders); setSlots(data.slots)
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

  const toggleOfflineProtection=async(value:boolean)=>{
    if(!activeEvent)return
    if(value===true){
      const confirmed=window.confirm('Offline protection enabled.\n\nTo keep orders flowing, your screen must stay on. If this device loses connection, online orders will pause automatically.\n\nMake sure Screen On is enabled.')
      if(!confirmed)return
      if(!keepScreenOn)applyKeepScreenOn(true)
    }else{
      const confirmed=window.confirm('Disable offline protection for this event?\n\nIf this device loses connection, online orders will continue — customers may place orders you cannot see. Only disable if you have a reliable connection.')
      if(!confirmed)return
    }
    setEventOfflineOverride(value)
    await supabaseBrowser.from('truck_events').update({offline_protection_override:value}).eq('id',activeEvent.id)
  }

  const saveKitchenCapacity=async(value:number|null)=>{
    if(!activeEvent?.van_id)return
    setKitchenCapacity(value) // optimistic
    // Service-role write via /api/manage (same action the Manage page uses). The previous
    // anon supabaseBrowser.update on truck_vans was RLS-blocked and failed silently.
    await fetch('/api/manage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,action:'update_van_settings',vanId:activeEvent.van_id,kitchen_capacity:value})})
    fetchAllRef.current() // re-sync from the authoritative server read
  }

  const saveCapacityWindow=async(value:number)=>{
    if(!activeEvent?.van_id)return
    setCapacityWindowMins(value) // optimistic
    await fetch('/api/manage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,action:'update_van_settings',vanId:activeEvent.van_id,capacity_window_mins:value})})
    fetchAllRef.current() // re-sync from the authoritative server read
  }

  const applyKeepScreenOn=async(value:boolean)=>{
    setKeepScreenOn(value)
    if(value){await keepAwake()}else{await allowSleep()}
    try{
      await fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({token,pin,action:'update_keep_screen_on',keepScreenOn:value})})
    }catch{}
  }
  const toggleKeepScreenOn=async()=>{
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
    }
    await applyKeepScreenOn(!keepScreenOn)
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
    setActionLoading(`${action}-${orderKey}`)
    try{
      const res=await fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action,order_key:orderKey})})
      const data=await res.json(); if(!res.ok)throw new Error(data.error)
      const labels:Record<string,string>={confirm:'confirmed',reject:'rejected',ready:'ready',collected:'collected',undo_collected:'restored',cancel:'cancelled'}
      const done=orders.find(o=>o.order_key===orderKey)
      showToast(`Order #${done?.id??''} ${labels[action]||action}`)
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
    try{await fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'set_stock',itemName,available,stockCount,noItemCap,category,event_id})})}
    catch(err){console.warn('[updateStock] write failed (will re-sync on next refresh):',err)}
  }
  const updateCategoryStock=async(category:string,stockCount:number|null)=>{
    const event_id=selectedEventRef.current?.id??null
    const key=event_id??'__none__'
    setCategoryStocksByEvent(prev=>{const cur=prev[key]??[];const ex=cur.find(s=>s.category===category);const next=ex?cur.map(s=>s.category===category?{...s,stock_count:stockCount}:s):[...cur,{category,stock_count:stockCount,default_stock:null,orders_count:0}];return{...prev,[key]:next}})
    try{await fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'set_category_stock',category,stockCount,event_id})})}
    catch(err){console.warn('[updateCategoryStock] write failed (will re-sync on next refresh):',err)}
  }

  const updateModifierOptionAvailable=async(optionId:string,available:boolean)=>{
    // Optimistic update in truckMenu state
    setTruckMenu(prev=>{
      if(!prev)return prev
      return{...prev,categories:prev.categories?.map(cat=>({
        ...cat,
        modifierGroups:cat.modifierGroups?.map(grp=>({
          ...grp,
          options:grp.options?.map(opt=>opt.id===optionId?{...opt,available}:opt)
        }))
      }))}
    })
    await fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'set_modifier_option_available',optionId,available})})
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

  const confirmCancelOrder=()=>{
    if(!cancellingOrder) return
    const orderKey=cancellingOrder.order_key
    const displayId=cancellingOrder.id
    const fullReason=[cancelReason,cancelNote].filter(Boolean).join(' — ')
    setShowCancelModal(false);setCancellingOrder(null);setCancelReason('');setCancelNote('')
    setActionLoading(`cancel-${orderKey}`)
    fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'cancel',order_key:orderKey,cancellationReason:fullReason||null})})
      .then(r=>r.json()).then(()=>{showToast(`Order #${displayId} cancelled`);fetchAll()})
      .catch(()=>showToast('Failed to cancel','error'))
      .finally(()=>setActionLoading(null))
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

  const resolvedEvent:TruckEvent|null=selectedOrDefaultEvent
  // Fall back to the last known event when upcomingEvents is transiently empty
  // (failed refetch) but the selection is still live — never blank the event bar
  const activeEvent:TruckEvent|null=resolvedEvent
    ??(selectedEventId&&lastActiveEventRef.current?.id===selectedEventId?lastActiveEventRef.current:null)
  if(resolvedEvent)lastActiveEventRef.current=resolvedEvent
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
  const eventOrders=activeEvent
    ?orders.filter(o=>o.event_id===activeEvent.id)
    :orders
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

  return(
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <AppHeader
        truckName={truck?.name ? (vanName ? `${truck.name} — ${vanName}` : truck.name) : null}
        truckLogoUrl={truck?.logo || null}
        subtitle={truck?.venue_name || undefined}
      >
        {pendingOrders.length>0&&<span className="bg-orange-500 text-white text-xs font-black px-2 py-0.5 rounded-full animate-pulse">{pendingOrders.length}</span>}
        {/* Screen toggle — desktop only; mobile handled via UserMenu */}
        <button onClick={toggleKeepScreenOn} className="hidden sm:flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500 select-none">
            {keepScreenOn ? 'Screen on' : 'Screen off'}
          </span>
          <div className={`relative w-10 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${keepScreenOn ? 'bg-green-500' : 'bg-slate-300'}`}>
            <div className={`absolute top-1 left-0 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${keepScreenOn ? 'translate-x-5' : 'translate-x-1'}`} />
          </div>
        </button>
        <UserMenu
          truckName={truck?.name||null}
          operatorName={currentUserFirstName || currentUserName?.split(' ')[0] || ''}
          token={token}
          showScreenToggle
          showOrderUtilities
          showManageLink={userRole==='owner'||userRole==='manager'}
          isAdmin={isAdmin}
          keepScreenOn={keepScreenOn}
          onToggleScreenOn={toggleKeepScreenOn}
          copiedOrderLink={copiedOrderLink}
          onCopyOrderLink={handleCopyOrderLink}
          onShowQR={handleShowQR}
          onOpenKDS={handleOpenKDS}
        />
      </AppHeader>

      {/* Tabs — bg-slate-900 must match HEADER_BG in lib/brand.ts */}
      <div className="bg-slate-900 border-b border-slate-700 sticky top-[51px] z-40 overflow-x-auto">
        {/* Nav tabs row */}
        <div className="px-4">
          <div className="max-w-5xl mx-auto flex items-center">
            {([['orders',(()=>{const c=activeEvent?eventOrders.filter(o=>['pending','confirmed'].includes(o.status)).length:0;return`Orders${c>0?` (${c})`:''}`})()],['add','+ Add order'],['stock','Menu & Stock']] as [typeof activeTab,string][]).map(([tab,label])=>(
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

      {/* Event bar — Orders, Add Order, and Menu & Stock tabs */}
      {(activeTab==='orders'||activeTab==='add'||activeTab==='stock')&&(
        <div className="bg-slate-800 border-b border-slate-700 sticky top-[95px] z-30 relative">
          <div className="max-w-5xl mx-auto px-4 py-2 flex items-center gap-2">
            {activeEvent?(
              <>
                <span className="text-white text-sm font-medium truncate flex-1 min-w-0">
                  📍 {fmtVenue(activeEvent.venue_name,activeEvent.town)} · {formatTime(activeEvent.start_time)}–{formatTime(activeEvent.end_time)}
                </span>
                <button
                  onClick={()=>{setPendingOpenEventPicker(true);setActiveTab('add')}}
                  className="text-xs text-slate-400 hover:text-white flex-shrink-0 px-2 py-1 rounded border border-slate-600 hover:border-slate-400 transition-colors">
                  Change
                </button>
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
                <button onClick={()=>{setEventNoteInput(activeEvent.customer_note||'');setShowEventMenu(true)}}
                  className="text-slate-400 hover:text-white flex-shrink-0 text-base leading-none px-1">
                  ···
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

      <main className="max-w-5xl mx-auto px-4 py-4 pb-20">

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
              {/* Prep time banner */}
            {showPrepTimeBanner&&(
              <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 mb-4 flex items-start gap-3">
                <span className="text-orange-500 text-lg flex-shrink-0">⚙️</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-orange-800">Set your prep times before going live</p>
                  <p className="text-xs text-orange-700 mt-0.5">Your menu is using default prep times. Update them in Manage so your kitchen doesn't get overwhelmed with orders.</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <a href={`/manage/${token}`} className="text-xs font-medium text-orange-700 underline">Edit categories</a>
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
            <div className="flex gap-2 mb-3">
              {activeEvent?.status==='open'&&<button onClick={()=>{if(paused){fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'set_paused',paused_until:null,eventId:activeEvent?.id})});setPausedUntil(null);setVanPausedUntil(null);setVanOnlinePausedUntil(null)}else{setShowPauseModal(true)}}} className={`flex-1 py-2.5 rounded-xl text-sm font-black border transition-all ${paused?'bg-red-600 text-white border-red-600':'bg-white text-slate-700 border-slate-200 hover:border-red-300'}`}>{paused?'▶ Resume orders':'⏸ Pause orders'}</button>}
              {waitMinutes>0?(
                <button onClick={()=>{fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'set_extra_wait',minutes:0,eventId:activeEvent?.id})});setExtraWaitMins(0);setExtraWaitStartedAt(null)}} className="flex-1 py-2.5 rounded-xl text-sm font-black bg-orange-100 text-orange-700 border border-orange-300 hover:bg-orange-200">
                  ⏱ +{waitMinutes}m active · Tap to clear
                </button>
              ):(
                <select defaultValue="" onChange={e=>{const m=parseInt(e.target.value);if(!m)return;const startedAt=new Date().toISOString();fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'set_extra_wait',minutes:m,eventId:activeEvent?.id})});setExtraWaitMins(m);setExtraWaitStartedAt(startedAt);e.target.value=''}} className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
                  <option value="">⏱ Add extra wait</option>
                  <option value={10}>+10 min</option>
                  <option value={20}>+20 min</option>
                  <option value={30}>+30 min</option>
                </select>
              )}
            </div>
            {paused&&pauseUntilEffective&&(()=>{const minsLeft=Math.max(0,Math.round((new Date(pauseUntilEffective).getTime()-Date.now())/60000));const isIndefinite=new Date(pauseUntilEffective).getFullYear()>=2099;return<div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-3 text-center"><p className="text-red-700 font-black text-sm">⏸ Orders paused{pauseReason==='offline'?' (device offline)':''}{isIndefinite?'':(` — resuming in ~${minsLeft} min`)} · Customers can browse but not order</p>
              {/* Prominent inline Resume — one tap, no hunting in the ··· menu. Clears BOTH paused_until
                  and online_paused_until on the active event (set_paused resume). */}
              <button onClick={()=>{fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'set_paused',paused_until:null,eventId:activeEvent?.id})});setPausedUntil(null);setVanPausedUntil(null);setVanOnlinePausedUntil(null)}} className="mt-2 w-full sm:w-auto bg-red-600 text-white font-black text-sm px-6 py-2.5 rounded-xl hover:bg-red-700 transition-colors">▶ Resume orders</button>
              {pauseReason==='offline'&&<p className="text-red-500 text-xs mt-1.5">If your connection is unstable, orders may pause again.</p>}
            </div>})()}
            {waitMinutes>0&&!paused&&<div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 mb-3 text-center"><p className="text-orange-700 font-black text-sm">⏱ +{waitMinutes} min extra wait active</p></div>}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3">
              <div className="grid grid-cols-3 gap-2 mb-2 sm:mb-0 sm:flex-1">
                {[{label:'New',value:pendingOrders.length,colour:'text-orange-500'},{label:'Confirmed',value:confirmedOrders.length,colour:'text-green-600'},{label:'Done',value:otherOrders.length,colour:'text-slate-400'}].map(s=>(
                  <div key={s.label} className="bg-white rounded-xl p-2.5 text-center border border-slate-200 shadow-sm"><p className={`text-xl font-black ${s.colour}`}>{s.value}</p><p className="text-slate-500 text-[11px] font-medium mt-0.5">{s.label}</p></div>
                ))}
              </div>
              <div className="flex gap-1.5 sm:ml-2 sm:shrink-0">
                <button onClick={()=>setShowPrepList(p=>!p)} className={`font-bold text-xs px-2.5 py-2 rounded-xl transition-colors ${showPrepList?'bg-amber-100 text-amber-700':'bg-slate-100 text-slate-600 hover:bg-slate-200'}`} title="Today's prep list">📋 Prep</button>
              </div>
            </div>
            {(pendingOrders.length>0||confirmedOrders.length>0)&&(()=>{
              const allActive=eventOrders.filter(o=>['pending','confirmed','modified'].includes(o.status))
              const counts=getAllDayCounts(allActive)
              const entries=Object.entries(counts).sort((a,b)=>b[1]-a[1])
              if(!entries.length)return null
              return(
                <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 mb-3 flex items-center gap-2 overflow-x-auto">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-wide shrink-0">To make</span>
                  <div className="flex gap-1.5 flex-wrap">
                    {entries.map(([name,qty])=>(
                      <span key={name} className="text-xs font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full whitespace-nowrap">{qty}× {name}</span>
                    ))}
                  </div>
                </div>
              )
            })()}
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
                <div className="grid lg:grid-cols-2 gap-3">{pendingOrders.map(o=><OrderCard key={o.order_key} order={o} truck={truck} event={activeEvent} slots={slots} actionLoading={actionLoading} onAction={doAction} onEdit={startEdit} categoryOrder={categoryOrder} itemCategoryMap={itemCategoryMap} kdsMode={truck?.kds_mode??false}/>)}</div>
              </div>
            )}
            {confirmedOrders.length>0&&(
              <div className="mb-4">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Confirmed</p>
                <div className="grid lg:grid-cols-2 gap-3">{confirmedOrders.map(o=><OrderCard key={o.order_key} order={o} truck={truck} event={activeEvent} slots={slots} actionLoading={actionLoading} onAction={doAction} onEdit={startEdit} categoryOrder={categoryOrder} itemCategoryMap={itemCategoryMap} kdsMode={truck?.kds_mode??false}/>)}</div>
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
              </>
            )}
          </div>
        )}

        {/* ADD ORDER TAB — always mounted (manual s.22): basket state lives inside
            AddOrderPanel and must survive tab switches. Hidden via CSS, never unmounted. */}
        {truck&&(
          <div className={activeTab==='add'?'':'hidden'}>
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
            onOrderPlaced={()=>{fetchAll();setActiveTab('orders')}}
            onOpenEvent={openEvent}
            requestEventPickerOpen={pendingOpenEventPicker}
            onEventPickerOpened={()=>setPendingOpenEventPicker(false)}
            controlledEvent={activeEvent}
            onEventChange={(id)=>setSelectedEventId(id)}
          />
          </div>
        )}


        {/* MENU & STOCK TAB */}
        {activeTab==='stock'&&(
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Auto-accept orders</p>
                  <p className="text-slate-500 text-xs mt-0.5">Orders confirm automatically. If the requested slot is full, the order bumps to the next available slot. Only confirms when there is capacity.</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  {savingAutoAccept&&<span className="text-xs text-slate-400 animate-pulse">Saving…</span>}
                  <Toggle on={autoAccept} onToggle={()=>saveAutoAccept(!autoAccept)}/>
                </div>
              </div>
            </div>
            {activeEvent&&(
              <div className="flex items-start justify-between gap-4 p-4 bg-white rounded-2xl border border-slate-100">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">Offline protection</p>
                  <p className="text-xs text-slate-500 mt-0.5">Pauses online orders if this device goes offline.</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {eventOfflineOverride!==null
                      ?'Using event override — van default is '+(vanAutoPause?'on':'off')
                      :'Using van default setting'}
                  </p>
                  {eventOfflineOverride!==null&&(
                    <button
                      onClick={()=>{
                        setEventOfflineOverride(null)
                        supabaseBrowser.from('truck_events').update({offline_protection_override:null}).eq('id',activeEvent.id)
                      }}
                      className="text-xs text-slate-400 hover:text-slate-600 mt-1">
                      Reset to van default
                    </button>
                  )}
                </div>
                <Toggle on={effectiveOfflineProtection} onToggle={()=>toggleOfflineProtection(!effectiveOfflineProtection)}/>
              </div>
            )}
            {/* Per-device pref: show the "paused while offline" popup on reconnect. Not gated on an
                active event (it's a device UI pref). localStorage-backed — no migration. */}
            <div className="flex items-start justify-between gap-4 p-4 bg-white rounded-2xl border border-slate-100">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800">Offline-pause alert</p>
                <p className="text-xs text-slate-500 mt-0.5">Pop up on this device when offline protection paused orders while you were away.</p>
              </div>
              <Toggle on={offlinePauseNoticeEnabled} onToggle={toggleOfflinePauseNotice}/>
            </div>
            {/* Kitchen capacity — its own card now (was nested in Stock & availability). Event-scoped
                ceiling + category scope; the control's bold "Kitchen capacity" label doubles as the
                card heading. One tight, left-aligned unit (max-w stops it stretching on the wide
                dashboard); mirrors Settings. Reads/writes via service-role /api/dashboard +
                update_van_settings (Section 10). Behaviour unchanged. */}
            {activeEvent&&(
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <p className="text-sm font-semibold text-slate-800">Kitchen capacity</p>
                    {activeEvent.van_id&&activeVanName&&(
                      <span className="text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-200 rounded px-1.5 py-0.5">🚐 {activeVanName}</span>
                    )}
                    <select
                      value={kitchenCapacity??''}
                      disabled={!activeEvent.van_id}
                      onChange={e=>saveKitchenCapacity(e.target.value===''?null:parseInt(e.target.value))}
                      className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 flex-shrink-0 w-32 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50">
                      <option value="">No limit</option>
                      {Array.from({length:20},(_,i)=>i+1).map(n=>(
                        <option key={n} value={n}>{n} item{n!==1?'s':''}</option>
                      ))}
                    </select>
                    {/* The ceiling's OWN window cadence — how often the kitchen completes a cycle.
                        Independent of any category's prep. Disabled until van + capacity are set. */}
                    <span className="text-sm text-slate-500">every</span>
                    <select
                      value={capacityWindowMins}
                      disabled={!activeEvent.van_id||kitchenCapacity==null}
                      onChange={e=>saveCapacityWindow(parseInt(e.target.value))}
                      className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 flex-shrink-0 w-28 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50">
                      {Array.from({length:20},(_,i)=>i+1).map(n=>(
                        <option key={n} value={n}>{n} min</option>
                      ))}
                    </select>
                  </div>
                  {!activeEvent.van_id&&(
                    <p className="text-xs text-amber-600 font-medium mt-1.5">⚠ Assign a truck to this event before setting kitchen capacity.</p>
                  )}
                  {truckMenu?.categories&&truckMenu.categories.length>0&&(
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                      <span className="text-xs text-slate-400">Limit applies to:</span>
                      {truckMenu.categories.map(cat=>{
                        const hasCap=kitchenCapacity!=null
                        const locked=(cat.prep_secs??0)>0
                        const disabled=locked||!hasCap||!activeEvent.van_id
                        return(
                          <label key={cat.id??cat.name}
                            title={locked
                              ? 'Cooked — always counts (its prep & batch set the pace)'
                              : !hasCap ? 'Set a capacity to choose which categories count'
                              : 'Tick to include this instant category (e.g. sides, dips, drinks) in the shared per-window limit'}
                            className={`flex items-center gap-1.5 text-sm ${disabled?'text-slate-400 cursor-not-allowed':'text-slate-700 cursor-pointer'}`}>
                            <input type="checkbox"
                              checked={locked?true:!!cat.counts_toward_capacity}
                              disabled={disabled}
                              onChange={()=>{if(!locked&&hasCap&&cat.id)toggleCatCapacityDash(cat.id,!cat.counts_toward_capacity)}}
                              className="w-4 h-4 accent-orange-600 cursor-pointer disabled:cursor-not-allowed"/>
                            <span>{cat.name}</span>
                            {locked&&<span className="text-[10px] text-slate-400">cooked — always counts</span>}
                          </label>
                        )
                      })}
                    </div>
                  )}
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
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-800 tracking-wide mb-1">Stock & availability</p>
              <p className="text-slate-500 text-xs mb-4">Set category totals, add item-level limits, or toggle availability. Changes take effect immediately.</p>
              {truckMenu&&stockLoading?(
                // This event's stock hasn't resolved yet (never-viewed) — skeleton, NOT empty/stale rows.
                <div className="space-y-2 animate-pulse">
                  {[0,1,2,3].map(i=><div key={i} className="h-10 bg-slate-100 rounded-xl" />)}
                </div>
              ):truckMenu?(
                <div className="space-y-5">
                  {Object.entries(menuGroups).map(([cat,items])=>{
                    const catStock=categoryStocks.find(s=>s.category===cat)
                    const catDefStock=truckMenu?.categories?.find(c=>c.name.toLowerCase()===cat.toLowerCase())?.default_stock??null
                    const catCount=catStock?.stock_count??catDefStock??null; const catOrdered=activeEvent?(catStock?.orders_count??0):0
                    const isCatDefault=catStock?.stock_count==null&&catDefStock!=null
                    const catRem=catCount!==null?catCount-catOrdered:null
                    const catObj=truckMenu?.categories?.find(c=>c.name.toLowerCase()===cat.toLowerCase())
                    return(
                      <div key={cat}>
                        {/* Mobile: two lines. Desktop: one line via hidden sm:flex */}
                        <div className="mb-2 pb-2 border-b border-slate-100">
                          {/* Line 1 (mobile) / full row (desktop) */}
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-black text-orange-600 uppercase tracking-wide flex-1">{cat.charAt(0).toUpperCase()+cat.slice(1)}{catOrdered>0&&<span className="ml-1.5 text-sm font-medium normal-case tracking-normal text-slate-500">({catOrdered} sold)</span>}</p>
                            {/* Prep + Batch: hidden on mobile, shown on sm+ */}
                            {catObj&&(
                              <div className="hidden sm:flex items-center gap-2 text-sm">
                                <div className="flex items-center gap-1">
                                  <span className="text-slate-500 text-sm">Prep</span>
                                  <input type="number" min={0} placeholder="0"
                                    value={Math.floor((catObj.prep_secs??0)/60)}
                                    onChange={e=>{const v=parseInt(e.target.value)||0;const secs30=(catObj.prep_secs??0)%60;setTruckMenu(prev=>prev?{...prev,categories:prev.categories?.map(c=>c.id===catObj.id?{...c,prep_secs:v*60+secs30}:c)}:prev)}}
                                    onBlur={e=>{const v=parseInt(e.target.value)||0;const secs30=(catObj.prep_secs??0)%60;updateCategoryField(catObj.id??'','prep_secs',v*60+secs30)}}
                                    className="w-12 text-center border border-slate-200 rounded-lg px-1.5 py-1 text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"/>
                                  <span className="text-slate-500 text-sm">m</span>
                                  <select
                                    value={(catObj.prep_secs??0)%60>=30?30:0}
                                    onChange={e=>{const mins=Math.floor((catObj.prep_secs??0)/60);const s30=parseInt(e.target.value);setTruckMenu(prev=>prev?{...prev,categories:prev.categories?.map(c=>c.id===catObj.id?{...c,prep_secs:mins*60+s30}:c)}:prev);updateCategoryField(catObj.id??'','prep_secs',mins*60+s30)}}
                                    className="border border-slate-200 rounded-lg px-1.5 py-1 text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
                                    <option value={0}>0s</option>
                                    <option value={30}>30s</option>
                                  </select>
                                </div>
                                <div className="flex flex-col items-center gap-0.5">
                                  <div className="flex items-center gap-1">
                                    <span className="text-slate-500 text-sm">Batch</span>
                                    <input type="number" min={1} placeholder="∞"
                                      value={(!catObj.batch_size||catObj.batch_size===0)?'':catObj.batch_size}
                                      onChange={e=>{const v=e.target.value===''||e.target.value==='0'?undefined:parseInt(e.target.value)||undefined;setTruckMenu(prev=>prev?{...prev,categories:prev.categories?.map(c=>c.id===catObj.id?{...c,batch_size:v}:c)}:prev)}}
                                      onBlur={e=>{const val=e.target.value===''||e.target.value==='0'?null:parseInt(e.target.value);updateCategoryField(catObj.id??'','batch_size',val)}}
                                      className="w-12 text-center border border-slate-200 rounded-lg px-1.5 py-1 text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"/>
                                  </div>
                                </div>
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              {catRem!==null&&<span className={`text-xs font-bold ${catRem<=5?'text-orange-500':'text-slate-600'}`}>{catRem} left</span>}
                              <div className="flex flex-col items-center gap-0.5">
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
                              <span className="text-slate-600 font-medium text-xs">total</span>
                            </div>
                          </div>
                          {/* Line 2: Prep + Batch — mobile only */}
                          {catObj&&(
                            <div className="flex sm:hidden items-center gap-3 mt-1.5 text-sm">
                              <div className="flex items-center gap-1">
                                <span className="text-slate-500 text-sm">Prep</span>
                                <input type="number" min={0} placeholder="0"
                                  value={Math.floor((catObj.prep_secs??0)/60)}
                                  onChange={e=>{const v=parseInt(e.target.value)||0;const secs30=(catObj.prep_secs??0)%60;setTruckMenu(prev=>prev?{...prev,categories:prev.categories?.map(c=>c.id===catObj.id?{...c,prep_secs:v*60+secs30}:c)}:prev)}}
                                  onBlur={e=>{const v=parseInt(e.target.value)||0;const secs30=(catObj.prep_secs??0)%60;updateCategoryField(catObj.id??'','prep_secs',v*60+secs30)}}
                                  className="w-12 text-center border border-slate-200 rounded-lg px-1.5 py-1 text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"/>
                                <span className="text-slate-500 text-sm">m</span>
                                <select
                                  value={(catObj.prep_secs??0)%60>=30?30:0}
                                  onChange={e=>{const mins=Math.floor((catObj.prep_secs??0)/60);const s30=parseInt(e.target.value);setTruckMenu(prev=>prev?{...prev,categories:prev.categories?.map(c=>c.id===catObj.id?{...c,prep_secs:mins*60+s30}:c)}:prev);updateCategoryField(catObj.id??'','prep_secs',mins*60+s30)}}
                                  className="border border-slate-200 rounded-lg px-1.5 py-1 text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
                                  <option value={0}>0s</option>
                                  <option value={30}>30s</option>
                                </select>
                              </div>
                              <div className="flex flex-col items-center gap-0.5">
                                <div className="flex items-center gap-1">
                                  <span className="text-slate-500 text-sm">Batch</span>
                                  <input type="number" min={1} placeholder="∞"
                                    value={(!catObj.batch_size||catObj.batch_size===0)?'':catObj.batch_size}
                                    onChange={e=>{const v=e.target.value===''||e.target.value==='0'?undefined:parseInt(e.target.value)||undefined;setTruckMenu(prev=>prev?{...prev,categories:prev.categories?.map(c=>c.id===catObj.id?{...c,batch_size:v}:c)}:prev)}}
                                    onBlur={e=>{const val=e.target.value===''||e.target.value==='0'?null:parseInt(e.target.value);updateCategoryField(catObj.id??'','batch_size',val)}}
                                    className="w-12 text-center border border-slate-200 rounded-lg px-1.5 py-1 text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"/>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="space-y-1.5 ml-2">
                          {items.map(item=>{
                            const stock=itemStocks.find(s=>s.name===item.name)
                            // isAvailable: check itemStocks first (override), then fall back to menu
                            const isAvailable = stock ? (stock.available ?? true) : (item.available ?? true)
                            // no_item_cap = "follow category" → no individual cap → itemCount null (empty box,
                            // inherits the category pool) REGARDLESS of any default_stock.
                            const followsCategory=!!stock?.no_item_cap
                            const itemCount=followsCategory?null:(stock?.stock_count ?? item.default_stock ?? null)
                            const itemOrdered=activeEvent?(stock?.orders_count??0):0
                            const itemRem=itemCount!==null?itemCount-itemOrdered:null
                            const effectiveRem=itemRem!==null?(catRem!==null?Math.min(itemRem,catRem):itemRem):catRem
                            // Drives the input's default-state border/tooltip (the visible "default"
                            // label + "reset to default" link were removed — reset is still reachable
                            // by typing the default number back in).
                            const isDefault=!followsCategory&&stock?.stock_count==null&&item.default_stock!=null
                            return(
                              <div key={item.name} className={`flex items-center gap-2 p-2 rounded-xl border ${!isAvailable?'bg-red-50 border-red-200':'bg-slate-50 border-slate-100'}`}>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className={`font-bold text-sm ${!isAvailable?'text-red-500':'text-slate-800'}`}>{item.name}<span className="text-slate-600 font-normal ml-1.5">£{item.price.toFixed(2)}</span></p>
                                    {!isAvailable&&<span className="text-[10px] font-black text-red-500 bg-red-100 px-1.5 py-0.5 rounded-full">SOLD OUT</span>}
                                    {isAvailable&&effectiveRem!==null&&<span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${effectiveRem<=3?'text-red-600 bg-red-100':effectiveRem<=10?'text-orange-600 bg-orange-100':'text-slate-500 bg-slate-100'}`}>{effectiveRem} left</span>}
                                  </div>
                                  {itemOrdered>0&&<p className="text-xs text-slate-600 mt-0.5">{itemOrdered} sold</p>}
                                </div>
                                <div className="flex flex-col items-center gap-0.5">
                                  <input type="number" inputMode="numeric" min="0" placeholder="–"
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
                                    className={`w-16 border rounded-lg px-2 py-1.5 text-base sm:text-xs text-center font-bold focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white ${isDefault?'border-blue-200 text-blue-600':'border-slate-200'}`} title={isDefault?'Default stock — save to override':followsCategory?'Following category total — type a number to cap':'Item stock'}/>
                                </div>
                                <Toggle on={isAvailable} onToggle={()=>updateStock(item.name,!isAvailable,stock?.stock_count??null,cat,!!stock?.no_item_cap)}/>
                              </div>
                            )
                          })}
                        </div>
                        {/* Modifier options for this category */}
                        {(()=>{
                          const catMods=truckMenu?.categories?.find(c=>c.name.toLowerCase()===cat.toLowerCase())?.modifierGroups??[]
                          const allOpts=catMods.flatMap(g=>g.options??[])
                          if(allOpts.length===0)return null
                          return(
                            <div className="mt-2 ml-2">
                              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wide mb-1.5">Modifier options</p>
                              <div className="space-y-1">
                                {catMods.map(grp=>(
                                  <div key={grp.id}>
                                    {catMods.length>1&&<p className="text-[10px] font-medium text-slate-600 mb-0.5 pl-1">{grp.name}</p>}
                                    {(grp.options??[]).map(opt=>{
                                      const isOptOn=opt.available!==false
                                      return(
                                        <div key={opt.id} className={`flex items-center gap-2 p-2 rounded-xl border ${!isOptOn?'bg-red-50 border-red-200':'bg-slate-50 border-slate-100'}`}>
                                          <div className="flex-1 min-w-0">
                                            <p className={`text-sm font-medium ${!isOptOn?'text-red-500':'text-slate-700'}`}>{opt.name}{opt.price_adjustment!==0&&<span className="text-xs text-slate-600 font-normal ml-1.5">{opt.price_adjustment>0?`+£${opt.price_adjustment.toFixed(2)}`:`-£${Math.abs(opt.price_adjustment).toFixed(2)}`}</span>}</p>
                                          </div>
                                          {!isOptOn&&<span className="text-[10px] font-black text-red-500 bg-red-100 px-1.5 py-0.5 rounded-full">OFF</span>}
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
                      </div>
                    )
                  })}
                </div>
              ):<p className="text-slate-400 text-sm animate-pulse">Loading menu...</p>}
            </div>
            {truckMenu&&Object.keys(menuGroups).length>0&&(
            <div className="space-y-4">
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 text-xs text-slate-500 space-y-1 mt-4">
              <p className="font-bold text-slate-700">How it works</p>
              <p>• Orange input: total for this category (e.g. 100 pizzas tonight)</p>
              <p>• Small input: item override (e.g. only 8 Pepperoni)</p>
              <p>• Toggle: green = available, grey = sold out</p>
              <p>• Sold out items show as unavailable to customers</p>
              <p>• Edit: configure prep time, batch size, and notes per category</p>
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
                <button key={mins} onClick={()=>{const until=new Date(Date.now()+mins*60000).toISOString();fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'set_paused',paused_until:until,eventId:activeEvent?.id})});setVanPausedUntil(until);setShowPauseModal(false)}} className="w-full bg-orange-50 border border-orange-200 text-orange-700 font-bold py-3 rounded-xl hover:bg-orange-100 text-sm">{label}</button>
              ))}
              <button onClick={()=>{const until=new Date('2099-01-01').toISOString();fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'set_paused',paused_until:until,eventId:activeEvent?.id})});setVanPausedUntil(until);setShowPauseModal(false)}} className="w-full bg-slate-100 border border-slate-200 text-slate-700 font-bold py-3 rounded-xl hover:bg-slate-200 text-sm">Until I turn it back on</button>
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
              <button key={van.id} onClick={()=>{window.open(`/kds/${van.kds_token}`,'_blank');setShowKDSPicker(false)}} className="w-full py-3 px-4 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 hover:border-orange-300 hover:bg-orange-50 text-left transition-colors flex items-center justify-between">
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
            {activeEvent.status==='confirmed'&&!activeEvent.auto_open&&(
              <button onClick={()=>{openEvent(activeEvent.id);setShowEventMenu(false)}}
                className="w-full bg-orange-600 text-white font-bold py-2.5 rounded-xl hover:bg-orange-700 text-sm mb-3">
                Start Event
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
              <button onClick={()=>{extendEvent(activeEvent.id,30);setShowEventMenu(false)}}
                className="w-full bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl hover:bg-slate-200 text-sm">+30 min</button>
              <button onClick={()=>finishEvent(activeEvent.id)}
                className="w-full bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl hover:bg-slate-200 text-sm">Finish event</button>
              <button onClick={()=>cancelEventFromMenu(activeEvent.id)}
                className="w-full bg-red-50 text-red-600 font-bold py-2.5 rounded-xl hover:bg-red-100 border border-red-200 text-sm">Cancel event</button>
            </div>
          </div>
        </div>
      )}

      {toast&&<div className={`fixed bottom-6 left-4 right-4 max-w-sm mx-auto rounded-xl px-4 py-3 text-sm font-bold text-center shadow-xl z-50 ${toast.type==='success'?'bg-green-600 text-white':'bg-red-600 text-white'}`}>{toast.msg}</div>}

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