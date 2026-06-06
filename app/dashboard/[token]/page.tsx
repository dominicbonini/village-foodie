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
  calcMinsFromNow, getCategoryTime, getAllDayCounts
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
import { adjustQuantity, cleanupDealsForItem, groupByCategory } from '@/lib/basket-utils'
import { supabaseBrowser } from '@/lib/supabase-browser'
import { keepAwake, allowSleep } from '@/lib/native/keepAwake'
import { formatTime } from '@/lib/time-utils'

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
  const[itemStocks,setItemStocks]=useState<ItemStock[]>([])
  const[categoryStocks,setCategoryStocks]=useState<CategoryStock[]>([])
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
  const[eventNoteInput,setEventNoteInput]=useState('')
  const[pendingOpenEventPicker,setPendingOpenEventPicker]=useState(false)
  const[autoAccept,setAutoAccept]=useState(false)
  const[savingAutoAccept,setSavingAutoAccept]=useState(false)
  const[vanAutoPause,setVanAutoPause]=useState<boolean>(false)
  const[eventOfflineOverride,setEventOfflineOverride]=useState<boolean|null>(null)
  const[kitchenCapacity,setKitchenCapacity]=useState<number|null>(null)
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
  // Pause state (paused_until ISO string, null = not paused)
  const[pausedUntil,setPausedUntil]=useState<string|null>(null)
  const[showPauseModal,setShowPauseModal]=useState(false)
  const paused=pausedUntil?new Date(pausedUntil)>new Date():false
  // Cancel confirmation modal
  const[showCancelModal,setShowCancelModal]=useState(false)
  const[cancellingOrder,setCancellingOrder]=useState<Order|null>(null)
  const[cancelReason,setCancelReason]=useState('')
  const[cancelNote,setCancelNote]=useState('')
  // Edit modal
  const[editingOrder,setEditingOrder]=useState<Order|null>(null)
  const[editItems,setEditItems]=useState<BasketItem[]>([])
  const[editSlot,setEditSlot]=useState('')
  const[editNotes,setEditNotes]=useState('')
  const[editDeals,setEditDeals]=useState<Array<{name:string;slots:Record<string,string>;slotModifiers?:Record<string,{name:string;price:number}[]>;slotNotes?:Record<string,string>;isNew?:boolean}>>([])
  const[showEditDealModal,setShowEditDealModal]=useState(false)
  const[editOrderBaseline,setEditOrderBaseline]=useState<{total:number;itemsSubtotal:number;deals:Array<{name:string}>}|null>(null)
  const[editItemModal,setEditItemModal]=useState<{item:MenuItem;modGroups:ModifierGroup[];allowNotes:boolean}|null>(null)
  const[editModalMods,setEditModalMods]=useState<{name:string;price:number}[]>([])
  const[editModalNotes,setEditModalNotes]=useState('')
  const[copiedOrderLink,setCopiedOrderLink]=useState(false)
  const[showQRFullscreen,setShowQRFullscreen]=useState(false)
  const[qrFullscreenDataUrl,setQrFullscreenDataUrl]=useState<string|null>(null)
  const prevPendingCount=useRef(0)
  const fetchAllRef=useRef<()=>void>(()=>{})
  // Tracks auth across fetchAll closures (authenticated state is stale inside the callback).
  // Once true, transient fetch failures keep existing state instead of showing the error screen.
  const authenticatedRef=useRef(false)
  // Last successfully resolved event — survives transient empty upcomingEvents (e.g. failed refetch)
  const lastActiveEventRef=useRef<TruckEvent|null>(null)
  const asapSlot=getAsapSlot(slots,(todayEvents.find(e=>e.status==='open')??todayEvents[0])?.event_date)
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
    fetch(`/api/menu/${truckId}?dashboard=1&nocache=${Date.now()}`)
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

  const fetchStock=useCallback((currentPin:string)=>{
    fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({token,pin:currentPin,action:'get_stock'})})
      .then(r=>r.json()).then(d=>{
        if(d.stocks) setItemStocks(d.stocks)
        if(d.categoryStocks) setCategoryStocks(d.categoryStocks)
      }).catch(()=>null)
  },[token])

  const fetchAll=useCallback(async(currentPin=pin)=>{
    try {
      const p=new URLSearchParams({token}); if(currentPin) p.set('pin',currentPin)
      const res=await fetch(`/api/dashboard?${p}`); const data=await res.json()
      if(res.status===401){if(data.requiresPin){setRequiresPin(true);setLoading(false);return};setError('Invalid access link');setLoading(false);return}
      // Transient failure after successful auth — keep existing state, never blank the dashboard
      if(!res.ok){if(authenticatedRef.current){console.warn('[fetchAll] dashboard fetch failed:',res.status,'— keeping existing state')}else{setError(data.error||'Failed to load')};setLoading(false);return}
      setTruck(data.truck)
      setKeepScreenOn(data.truck?.keep_screen_on ?? true)
      setAutoAccept(data.truck?.auto_accept || false); setPausedUntil(data.truck?.paused_until||null); setExtraWaitMins(data.truck?.extra_wait_mins||0); setExtraWaitStartedAt(data.truck?.extra_wait_started_at||null); setOrders(data.orders); setSlots(data.slots)
      // Clear prep pills for orders no longer active (collected/cancelled)
      const activeOrderIds=new Set((data.orders||[]).filter((o:Order)=>['pending','confirmed','modified'].includes(o.status)).map((o:Order)=>o.id))
      setStruckPrep(prev=>{const n=new Set<string>();prev.forEach(k=>{const orderId=k.split(':')[0];if(activeOrderIds.has(orderId))n.add(k)});return n})
      if(data.currentUserName !== undefined) setCurrentUserName(data.currentUserName)
      if(data.userRole !== undefined) setUserRole(data.userRole)
      setAuthenticated(true); authenticatedRef.current=true; setLastRefresh(new Date())
      if(data.truck?.id){fetchMenu(data.truck.id,currentPin);fetchStock(currentPin)}
      try{
        const eventsRes=await fetch(`/api/events/manage?token=${token}&upcoming=true`)
        // Never replace good event state with data from a failed response (429/500
        // returns valid JSON without .events, which would silently wipe events)
        if(!eventsRes.ok){
          console.warn('[fetchAll] events fetch failed:',eventsRes.status,'— keeping existing events')
        }else{
          const eventsData=await eventsRes.json()
          const todayStr=new Date().toISOString().split('T')[0]
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
    const todayStr=now.toISOString().split('T')[0]
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
    if(!event?.van_id){setVanAutoPause(false);setEventOfflineOverride(null);setKitchenCapacity(null);return}
    supabaseBrowser.from('truck_vans').select('auto_pause_on_offline, kitchen_capacity').eq('id',event.van_id).single()
      .then(({data})=>{if(data){setVanAutoPause(data.auto_pause_on_offline??false);setKitchenCapacity(data.kitchen_capacity??null)}})
    supabaseBrowser.from('truck_events').select('offline_protection_override').eq('id',event.id).single()
      .then(({data})=>{setEventOfflineOverride(data?.offline_protection_override??null)})
  },[selectedEventId,upcomingEvents])
  useEffect(()=>{fetchAllRef.current=fetchAll},[fetchAll])
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
    const fallbackInterval=setInterval(()=>fetchAllRef.current(),60000)
    return()=>{
      supabaseBrowser.removeChannel(ordersChannel)
      supabaseBrowser.removeChannel(truckChannel)
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
    const count=orders.filter(o=>o.status==='pending').length
    if(count>prevPendingCount.current&&authenticated){
      try{const ctx=new(window.AudioContext||(window as any).webkitAudioContext)();const osc=ctx.createOscillator();const gain=ctx.createGain();osc.connect(gain);gain.connect(ctx.destination);osc.frequency.value=880;gain.gain.setValueAtTime(0.3,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.6);osc.start(ctx.currentTime);osc.stop(ctx.currentTime+0.6)}catch{}
    }
    prevPendingCount.current=count
  },[orders,authenticated])

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
    const p=new URLSearchParams({token,pin:pinInput}); const res=await fetch(`/api/dashboard?${p}`); const data=await res.json()
    if(!res.ok){setPinError('Incorrect PIN');return}
    setPin(pinInput); setTruck(data.truck); setOrders(data.orders); setSlots(data.slots)
    setAuthenticated(true); authenticatedRef.current=true; setRequiresPin(false)
    if(data.truck?.id){fetchMenu(data.truck.id,pinInput);fetchStock(pinInput)}
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
    setKitchenCapacity(value)
    await supabaseBrowser.from('truck_vans').update({kitchen_capacity:value}).eq('id',activeEvent.van_id)
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

  const doAction=async(action:string,orderId:string)=>{
    if(action==='cancel'){const ord=orders.find(o=>o.id===orderId)??null;setCancellingOrder(ord);setShowCancelModal(true);return}
    setActionLoading(`${action}-${orderId}`)
    try{
      const res=await fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action,orderId})})
      const data=await res.json(); if(!res.ok)throw new Error(data.error)
      const labels:Record<string,string>={confirm:'confirmed',reject:'rejected',ready:'ready',collected:'collected',undo_collected:'restored',cancel:'cancelled'}
      showToast(`Order #${orderId} ${labels[action]||action}`)
      // Auto-clear prep board on collected (solo operator workflow)
      if(action==='collected'||action==='ready'){
        const done=orders.find(o=>o.id===orderId)
        if(done){
          // Auto-clear unit pills for this specific order
          setStruckPrep(prev=>{
            const n=new Set(prev)
            done.items.forEach(item=>{
              for(let u=0;u<item.quantity;u++) n.add(`${orderId}:${item.name}:${u}`)
            })
            return n
          })
        }
      }
      await fetchAll()
    }catch(err:any){showToast(err.message||'Failed','error')}finally{setActionLoading(null)}
  }

  const startEdit=(order:Order)=>{
    setEditingOrder(order)
    setEditItems(order.items.map(i=>({...i,cartKey:makeCartKey(i.name,i.modifiers||[],i.specialInstructions)})))
    setEditDeals((order.deals||[]).map(d=>({name:d.name,slots:d.slots,slotModifiers:d.slotModifiers||{},slotNotes:d.slotNotes||{},isNew:false})))
    setEditSlot(order.slot||'')
    setEditNotes(order.notes||'')
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
      const res=await fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'edit',orderId:editingOrder.id,editedOrder:{items:editItems.filter(i=>i.quantity>0),deals:editDeals,slot:editSlot||null,notes:editNotes||null}})})
      const data=await res.json(); if(!res.ok)throw new Error(data.error)
      showToast(`Order #${editingOrder.id} updated`); setEditingOrder(null); await fetchAll()
    }catch(err:any){showToast(err.message||'Edit failed','error')}finally{setActionLoading(null)}
  }

  const updateStock=async(itemName:string,available:boolean,stockCount:number|null,category?:string)=>{
    await fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'set_stock',itemName,available,stockCount,category})})
    setItemStocks(prev=>{const ex=prev.find(s=>s.name===itemName);if(ex)return prev.map(s=>s.name===itemName?{...s,available,stock_count:stockCount}:s);return[...prev,{name:itemName,available,stock_count:stockCount,orders_count:0,category:category||null}]})
    if(truck?.id)fetchMenu(truck.id,pin)
  }
  const updateCategoryStock=async(category:string,stockCount:number|null)=>{
    await fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'set_category_stock',category,stockCount})})
    setCategoryStocks(prev=>{const ex=prev.find(s=>s.category===category);if(ex)return prev.map(s=>s.category===category?{...s,stock_count:stockCount}:s);return[...prev,{category,stock_count:stockCount,default_stock:null,orders_count:0}]})
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

  const closeEventEarly=async(eventId:string)=>{
    try{
      const res=await fetch('/api/events/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,action:'close',eventId,payload:{}})})
      const data=await res.json(); if(!res.ok) throw new Error(data.error)
      setTodayEvents(prev=>prev.map(e=>e.id===eventId?{...e,status:'closed' as const,closed_at:new Date().toISOString()}:e))
      setShowEventMenu(false); showToast('Event closed')
    }catch(err:any){showToast(err.message||'Failed','error')}
  }

  const confirmCancelOrder=()=>{
    if(!cancellingOrder) return
    const id=cancellingOrder.id
    const fullReason=[cancelReason,cancelNote].filter(Boolean).join(' — ')
    setShowCancelModal(false);setCancellingOrder(null);setCancelReason('');setCancelNote('')
    setActionLoading(`cancel-${id}`)
    fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'cancel',orderId:id,cancellationReason:fullReason||null})})
      .then(r=>r.json()).then(()=>{showToast(`Order #${id} cancelled`);fetchAll()})
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

  const resolvedEvent:TruckEvent|null=selectedEventId
    ?upcomingEvents.find(e=>e.id===selectedEventId)??null
    :(todayEvents.find(e=>e.status==='open')
      ??todayEvents.find(e=>e.status==='confirmed')
      ??todayEvents[0]
      ??null)
  // Fall back to the last known event when upcomingEvents is transiently empty
  // (failed refetch) but the selection is still live — never blank the event bar
  const activeEvent:TruckEvent|null=resolvedEvent
    ??(selectedEventId&&lastActiveEventRef.current?.id===selectedEventId?lastActiveEventRef.current:null)
  if(resolvedEvent)lastActiveEventRef.current=resolvedEvent
  const recentlyClosed=!!(activeEvent?.status==='closed'&&activeEvent.closed_at&&Date.now()-new Date(activeEvent.closed_at).getTime()<10*60*1000)
  const effectiveOfflineProtection=eventOfflineOverride!==null?eventOfflineOverride:vanAutoPause

  // Sort by collection time (soonest first), then by order ID (oldest first)
  // Orders without slot get high sort value so they appear after timed orders
  const sortByTimeThenId=(a:Order,b:Order)=>{
    const aSlot=a.slot?parseInt(a.slot.split(':')[0])*60+parseInt(a.slot.split(':')[1]):99999
    const bSlot=b.slot?parseInt(b.slot.split(':')[0])*60+parseInt(b.slot.split(':')[1]):99999
    if(aSlot!==bSlot) return aSlot-bSlot
    return a.id.localeCompare(b.id)
  }
  // Scope orders to the selected event. Primary match: event_id. Fallback for
  // orders with NULL event_id (pre-backfill rows, ambiguous same-date multi-event
  // inserts, or any future path that misses event_id): match event_date + van_id.
  // The van_id check is what prevents same-date multi-event bleed — two events on
  // one date run on different vans, so date alone would merge their orders.
  const eventOrders=activeEvent
    ?orders.filter(o=>o.event_id
      ?o.event_id===activeEvent.id
      :o.event_date===activeEvent.event_date&&(o.van_id??null)===(activeEvent.van_id??null))
    :orders
  const pendingOrders=eventOrders.filter(o=>o.status==='pending').sort(sortByTimeThenId)
  const confirmedOrders=eventOrders.filter(o=>['confirmed','modified'].includes(o.status)).sort(sortByTimeThenId)
  const otherOrders=eventOrders.filter(o=>!['pending','confirmed','modified'].includes(o.status))
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
                ):(
                  <span className="text-xs font-medium text-slate-400 flex-shrink-0">● Closed</span>
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
                <span className="text-sm text-slate-600">Event closed · {activeEvent.venue_name} ended at {formatTime(activeEvent.end_time)}</span>
                <button onClick={()=>extendEvent(activeEvent.id,30)} className="text-sm font-medium text-teal-600 hover:text-teal-700">Extend 30 min</button>
              </div>
            )}
            <div className="flex gap-2 mb-3">
              {activeEvent?.status==='open'&&<button onClick={()=>{if(paused){fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'set_paused',paused_until:null,vanId:activeEvent?.van_id})});setPausedUntil(null)}else{setShowPauseModal(true)}}} className={`flex-1 py-2.5 rounded-xl text-sm font-black border transition-all ${paused?'bg-red-600 text-white border-red-600':'bg-white text-slate-700 border-slate-200 hover:border-red-300'}`}>{paused?'▶ Resume orders':'⏸ Pause orders'}</button>}
              {waitMinutes>0?(
                <button onClick={()=>{fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'set_extra_wait',minutes:0})});setExtraWaitMins(0);setExtraWaitStartedAt(null)}} className="flex-1 py-2.5 rounded-xl text-sm font-black bg-orange-100 text-orange-700 border border-orange-300 hover:bg-orange-200">
                  ⏱ +{waitMinutes}m active · Tap to clear
                </button>
              ):(
                <select defaultValue="" onChange={e=>{const m=parseInt(e.target.value);if(!m)return;const startedAt=new Date().toISOString();fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'set_extra_wait',minutes:m})});setExtraWaitMins(m);setExtraWaitStartedAt(startedAt);e.target.value=''}} className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
                  <option value="">⏱ Add extra wait</option>
                  <option value={10}>+10 min</option>
                  <option value={20}>+20 min</option>
                  <option value={30}>+30 min</option>
                </select>
              )}
            </div>
            {paused&&pausedUntil&&(()=>{const minsLeft=Math.max(0,Math.round((new Date(pausedUntil).getTime()-Date.now())/60000));const isIndefinite=new Date(pausedUntil).getFullYear()>=2099;return<div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-3 text-center"><p className="text-red-700 font-black text-sm">⏸ Orders paused{isIndefinite?'':(` — resuming in ~${minsLeft} min`)} · Customers can browse but not order</p></div>})()}
            {waitMinutes>0&&!paused&&<div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 mb-3 text-center"><p className="text-orange-700 font-black text-sm">⏱ +{waitMinutes} min extra wait active</p></div>}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3">
              <div className="grid grid-cols-3 gap-2 mb-2 sm:mb-0 sm:flex-1">
                {[{label:'New',value:pendingOrders.length,colour:'text-orange-500'},{label:'Confirmed',value:confirmedOrders.length,colour:'text-green-600'},{label:'Done',value:otherOrders.length,colour:'text-slate-400'}].map(s=>(
                  <div key={s.label} className="bg-white rounded-xl p-2.5 text-center border border-slate-200 shadow-sm"><p className={`text-xl font-black ${s.colour}`}>{s.value}</p><p className="text-slate-500 text-[11px] font-medium mt-0.5">{s.label}</p></div>
                ))}
              </div>
              <div className="flex gap-1.5 sm:ml-2 sm:shrink-0">
                <button onClick={()=>setShowPrepList(p=>!p)} className={`font-bold text-xs px-2.5 py-2 rounded-xl transition-colors ${showPrepList?'bg-amber-100 text-amber-700':'bg-slate-100 text-slate-600 hover:bg-slate-200'}`} title="Today's prep list">📋 Prep</button>
                {otherOrders.length>0&&(
                  <button onClick={()=>setShowCompleted(c=>!c)} className={`font-bold text-xs px-2.5 py-2 rounded-xl transition-colors ${showCompleted?'bg-slate-700 text-white':cancelledCount>0?'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100':'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {showCompleted?'Hide':cancelledCount>0?`✕ ${cancelledCount} cancelled · ${otherOrders.length-cancelledCount} done`:'✓ '+otherOrders.length+' done'}
                  </button>
                )}
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
              const now=new Date()
              const nowMins=now.getHours()*60+now.getMinutes()
              const BUFFER_SECS=120

              // Get all active orders with slots, sorted by slot time
              const slottedOrders=eventOrders
                .filter(o=>['pending','confirmed','modified'].includes(o.status)&&o.slot)
                .sort((a,b)=>a.slot!.localeCompare(b.slot!))

              // Find the NEXT slot that needs action (start cooking time <= now+5min)
              const currentBatch:typeof slottedOrders=[]
              const upcomingBatches:{id:string;slot:string;startBy:string;minsUntil:number;items:{label:string;qty:number}[];orderNotes:string[]}[]=[]

              // Process each order individually so same-slot orders appear as separate lines
              const slotGroups:Record<string,typeof slottedOrders>={}
              slottedOrders.forEach(o=>{slotGroups[o.id]=[o]})

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
                const [slotH,slotM]=slot.split(':').map(Number)
                const slotTotalMins=slotH*60+slotM
                const startMins=slotTotalMins-Math.ceil(totalSecs/60)
                const minsUntilStart=startMins-nowMins
                const startH=Math.floor(Math.max(0,startMins)/60)
                const startM=Math.max(0,startMins)%60
                const startStr=`${String(startH).padStart(2,'0')}:${String(startM).padStart(2,'0')}`

                if(minsUntilStart<=2){
                  // Due now or within 2 mins — add to current batch
                  slotOrders.forEach(o=>currentBatch.push(o))
                } else {
                  upcomingBatches.push({id:orderId,slot,startBy:startStr,minsUntil:minsUntilStart,items:Object.values(displayItems),orderNotes})
                }
              })

              // Also include slotless confirmed orders in current batch
              eventOrders.filter(o=>['pending','confirmed','modified'].includes(o.status)&&!o.slot).forEach(o=>currentBatch.push(o))

              // Build current prep map
              // Build ordered list of units in insertion order across orders, then by item position
              // Sort orders by slot then ID, items keep their original order, expand each into units
              const sortedBatch=[...currentBatch].sort((a,b)=>{
                const aSlot=a.slot?parseInt(a.slot.replace(':','')):99999
                const bSlot=b.slot?parseInt(b.slot.replace(':','')):99999
                if(aSlot!==bSlot) return aSlot-bSlot
                return a.id.localeCompare(b.id)
              })
              type PrepUnit={name:string;orderId:string;unitIdx:number;cat:string;modLabel:string}
              const allUnits:PrepUnit[]=[]
              sortedBatch.forEach(o=>o.items.forEach(item=>{
                const cat=truckMenu?.items.find(m=>m.name===item.name)?.category||''
                const parts=(item.modifiers||[]).map((m:any)=>m.name)
                if(item.specialInstructions)parts.push(`📝 ${item.specialInstructions}`)
                const modLabel=parts.length?` (${parts.join(', ')})`:''
                for(let u=0;u<item.quantity;u++) allUnits.push({name:item.name,orderId:o.id,unitIdx:u,cat,modLabel})
              }))
              // Split into kitchen vs assembly preserving order
              const kitchenUnits=allUnits.filter(u=>getCategoryTime(u.cat)>0)
              const assemblyUnits=allUnits.filter(u=>getCategoryTime(u.cat)===0)

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
                            Start by {b.startBy} · {b.minsUntil}min
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
                <div className="grid lg:grid-cols-2 gap-3">{pendingOrders.map(o=><OrderCard key={o.id} order={o} truck={truck} slots={slots} actionLoading={actionLoading} onAction={doAction} onEdit={startEdit} categoryOrder={categoryOrder} itemCategoryMap={itemCategoryMap} kdsMode={truck?.kds_mode??false}/>)}</div>
              </div>
            )}
            {confirmedOrders.length>0&&(
              <div className="mb-4">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Confirmed</p>
                <div className="grid lg:grid-cols-2 gap-3">{confirmedOrders.map(o=><OrderCard key={o.id} order={o} truck={truck} slots={slots} actionLoading={actionLoading} onAction={doAction} onEdit={startEdit} categoryOrder={categoryOrder} itemCategoryMap={itemCategoryMap} kdsMode={truck?.kds_mode??false}/>)}</div>
              </div>
            )}
            {showCompleted&&otherOrders.length>0&&(
              <div className="mb-4">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Completed today</p>
                <div className="space-y-2">
                  {otherOrders.slice(0,5).map(o=>(
                    <div key={o.id} className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-slate-700 text-sm">#{o.id}</span>
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${STATUS[o.status]?.bg||'bg-slate-100'} ${STATUS[o.status]?.text||'text-slate-500'}`}>{STATUS[o.status]?.label||o.status}</span>
                          {o.slot&&<span className="text-xs text-slate-700">🕐 {o.slot}</span>}
                        </div>
                        <p className="text-slate-500 text-xs mt-0.5 truncate">{o.customer_name} · {o.items.map(i=>`${i.quantity}× ${i.name}`).join(', ')}</p>
                        {o.notes&&<p className="text-orange-500 text-xs truncate">📝 {o.notes}</p>}
                      </div>
                      <div className="shrink-0 ml-3 flex items-center gap-2">
                        <span className="font-black text-slate-600 text-sm">£{Number(o.total).toFixed(2)}</span>
                        {o.status==='collected'&&(
                          <button onClick={()=>doAction('undo_collected',o.id)} className="text-xs text-slate-400 hover:text-orange-600 font-bold transition-colors">↩ Undo</button>
                        )}
                      </div>
                    </div>
                  ))}
                  {otherOrders.length>5&&<p className="text-xs text-slate-700 text-center pt-1">+{otherOrders.length-5} more</p>}
                </div>
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
                  <p className="text-sm font-semibold text-slate-800">Kitchen capacity</p>
                  <p className="text-sm text-slate-500">Maximum items per 5-minute window. Items with no prep time set are excluded. Leave blank for no limit.</p>
                </div>
                <select
                  value={kitchenCapacity??''}
                  onChange={e=>saveKitchenCapacity(e.target.value===''?null:parseInt(e.target.value))}
                  className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 flex-shrink-0">
                  <option value="">No limit</option>
                  {Array.from({length:20},(_,i)=>i+1).map(n=>(
                    <option key={n} value={n}>{n} item{n!==1?'s':''}</option>
                  ))}
                </select>
              </div>
            )}
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
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-800 tracking-wide mb-1">Stock & availability</p>
              <p className="text-slate-500 text-xs mb-4">Set category totals, add item-level limits, or toggle availability. Changes take effect immediately.</p>
              {truckMenu?(
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
                            <p className="text-sm font-black text-orange-600 uppercase tracking-wide flex-1">{cat.charAt(0).toUpperCase()+cat.slice(1)}</p>
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
                              {catOrdered>0&&<span className="text-xs text-slate-600">{catOrdered} sold</span>}
                              <div className="flex flex-col items-center gap-0.5">
                                <input type="number" min="0" placeholder="∞" value={catCount??''}
                                  onChange={e=>updateCategoryStock(cat,e.target.value===''?null:parseInt(e.target.value))}
                                  className={`w-16 border rounded-lg px-2 py-1.5 text-xs text-center font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400 ${isCatDefault?'border-blue-200 bg-blue-50 text-blue-700':'border-orange-200 bg-orange-50'}`}
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
                            // stock_count: explicit override wins; then fall back to item's default_stock as starting value
                            const itemCount=stock?.stock_count ?? item.default_stock ?? null
                            const itemOrdered=activeEvent?(stock?.orders_count??0):0
                            const itemRem=itemCount!==null?itemCount-itemOrdered:null
                            const effectiveRem=itemRem!==null?(catRem!==null?Math.min(itemRem,catRem):itemRem):catRem
                            const isDefault=stock?.stock_count==null&&item.default_stock!=null
                            return(
                              <div key={item.name} className={`flex items-center gap-2 p-2 rounded-xl border ${!isAvailable?'bg-red-50 border-red-200':'bg-slate-50 border-slate-100'}`}>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className={`font-bold text-sm ${!isAvailable?'text-red-500':'text-slate-800'}`}>{item.name}<span className="text-slate-600 font-normal ml-1.5">£{item.price.toFixed(2)}</span></p>
                                    {!isAvailable&&<span className="text-[10px] font-black text-red-500 bg-red-100 px-1.5 py-0.5 rounded-full">SOLD OUT</span>}
                                    {isAvailable&&effectiveRem!==null&&<span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${effectiveRem<=3?'text-red-600 bg-red-100':effectiveRem<=10?'text-orange-600 bg-orange-100':'text-slate-500 bg-slate-100'}`}>{effectiveRem} left</span>}
                                  </div>
                                  {itemOrdered>0&&<p className="text-xs text-slate-600 mt-0.5">{itemOrdered} ordered</p>}
                                </div>
                                <div className="flex flex-col items-center gap-0.5">
                                  <input type="number" min="0" placeholder="–" value={itemCount??''}
                                    onChange={e=>updateStock(item.name,isAvailable,e.target.value===''?null:parseInt(e.target.value),cat)}
                                    className={`w-12 border rounded-lg px-1.5 py-1 text-xs text-center font-bold focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white ${isDefault?'border-blue-200 text-blue-600':'border-slate-200'}`} title={isDefault?'Default stock — save to override':'Item stock'}/>
                                  {isDefault&&<span className="text-[9px] text-blue-400 font-medium">default</span>}
                                </div>
                                <Toggle on={isAvailable} onToggle={()=>updateStock(item.name,!isAvailable,itemCount,cat)}/>
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

      {/* Pause duration picker */}
      {showPauseModal&&(
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <h3 className="font-black text-slate-900 text-base text-center mb-1">Pause online orders</h3>
            <p className="text-slate-500 text-sm text-center mb-4">Customers can still browse the menu but won't be able to order.</p>
            <div className="space-y-2 mb-4">
              {[{label:'10 minutes',mins:10},{label:'20 minutes',mins:20},{label:'30 minutes',mins:30}].map(({label,mins})=>(
                <button key={mins} onClick={()=>{const until=new Date(Date.now()+mins*60000).toISOString();fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'set_paused',paused_until:until,vanId:activeEvent?.van_id})});setPausedUntil(until);setShowPauseModal(false)}} className="w-full bg-orange-50 border border-orange-200 text-orange-700 font-bold py-3 rounded-xl hover:bg-orange-100 text-sm">{label}</button>
              ))}
              <button onClick={()=>{const until=new Date('2099-01-01').toISOString();fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'set_paused',paused_until:until,vanId:activeEvent?.van_id})});setPausedUntil(until);setShowPauseModal(false)}} className="w-full bg-slate-100 border border-slate-200 text-slate-700 font-bold py-3 rounded-xl hover:bg-slate-200 text-sm">Until I turn it back on</button>
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
                const editModalSlots=slots
                if(editModalSlots.length===0)return<input type="time" value={editSlot} onChange={e=>setEditSlot(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"/>
                return(
                  <select value={editSlot} onChange={e=>setEditSlot(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
                    <option value="">No slot</option>
                    {editModalSlots.map(s=>{
                      const isCurrent=s.collection_time===editingOrder?.slot
                      if(s.is_past&&!s.is_grace&&!isCurrent)return null
                      if(s.is_grace)return<option key={s.collection_time} value={s.collection_time}>⚠️ {s.collection_time} · After closing{isCurrent?' · (current)':''}</option>
                      const unlimited=s.max_orders>=999
                      const remaining=Math.max(0,s.max_orders-s.current_orders)
                      const pct=unlimited?0:s.current_orders/s.max_orders
                      const ind=pct>=1?'🔴':pct>=0.7?'🟡':'🟢'
                      const label=(!unlimited&&pct>=1)?isCurrent?' · (current)':' · Full':(!unlimited&&pct>=0.7)?` · ${remaining} left${isCurrent?' · (current)':''}`:isCurrent?' · (current)':''
                      return<option key={s.collection_time} value={s.collection_time}>{s.collection_time} {ind}{label}</option>
                    })}
                  </select>
                )
              })()}
            </div>
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wide">Notes</label>
              <textarea value={editNotes} onChange={e=>setEditNotes(e.target.value)} rows={2} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"/>
            </div>
            <div className="flex gap-2">
              <button onClick={()=>setEditingOrder(null)} className="flex-1 bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl hover:bg-slate-200 text-sm">Cancel</button>
              <button onClick={submitEdit} disabled={!!actionLoading?.startsWith('edit')||editItems.length===0} className="flex-1 bg-orange-600 text-white font-bold py-2.5 rounded-xl hover:bg-orange-700 text-sm disabled:opacity-50">{actionLoading?.startsWith('edit')?'Saving...':'Save changes'}</button>
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
          existingDeals={editDeals.map(d=>({bundle:{name:d.name,description:'',bundle_price:0,original_price:null,available:true,start_time:null,end_time:null,slot_1_category:null,slot_2_category:null,slot_3_category:null,slot_4_category:null,slot_5_category:null,slot_6_category:null},slots:d.slots,itemsTakenFromBasket:[]}))}
          onApply={(deal,slots,price,discount,rawSlots,modifierExtra,slotModifiers,slotNotes)=>{
            setEditDeals(prev=>[...prev,{name:deal.name,slots,slotModifiers,slotNotes,isNew:true}])
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
                className="w-full bg-teal-600 text-white font-bold py-2.5 rounded-xl hover:bg-teal-700 text-sm mb-3">
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
              <button onClick={()=>closeEventEarly(activeEvent.id)}
                className="w-full bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl hover:bg-slate-200 text-sm">Close early</button>
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