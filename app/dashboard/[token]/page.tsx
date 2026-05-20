'use client'
// app/dashboard/[token]/page.tsx

import { useState, useEffect, useCallback, useRef, useMemo, use } from 'react'
import Image from 'next/image'
import Link from 'next/link'

import type {
  Order, Slot, TruckData, TruckMenu, Bundle, MenuItem,
  BasketItem, AppliedDeal, ItemStock, CategoryStock, CatConfig,
  ModifierOption, ModifierGroup,
} from '@/components/dashboard/types'
import { STATUS, DEFAULT_CAT_CONFIG } from '@/components/dashboard/types'
import {
  getAsapSlot, getCatConfig, catCookSecs, calcReadyTime,
  calcMinsFromNow, getCategoryTime, getBundleSlotCats, getAllDayCounts
} from '@/components/dashboard/helpers'
import { calcQueueAwareReadySecs } from '@/lib/prep-utils'
import { OrderCard, Toggle, InlinePriceEditor } from '@/components/dashboard/OrderCard'
import { DealsModal } from '@/components/dashboard/DealsModal'
import { calculateOrderTotal } from '@/lib/order-calculations'
import { adjustQuantity, cleanupDealsForItem, groupByCategory } from '@/lib/basket-utils'
import { supabaseBrowser } from '@/lib/supabase-browser'

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
  const[todayEvent,setTodayEvent]=useState<{id:string;event_date:string;start_time:string;end_time:string;venue_name?:string|null}|null>(null)
  const[manualEvent,setManualEvent]=useState<{id:string;event_date:string;start_time:string;end_time:string;venue_name?:string|null}|null>(null)
  const[upcomingEvents,setUpcomingEvents]=useState<{id:string;event_date:string;start_time:string;end_time:string;venue_name?:string|null}[]>([])
  const[showEventPicker,setShowEventPicker]=useState(false)
  const[manualSlots,setManualSlots]=useState<Slot[]>([])
  const[autoAccept,setAutoAccept]=useState(false)
  const[savingAutoAccept,setSavingAutoAccept]=useState(false)
  // Add order
  const[manualName,setManualName]=useState('')
  const[manualEmail,setManualEmail]=useState('')
  const[manualNotes,setManualNotes]=useState('')
  const[manualSlot,setManualSlot]=useState('')
  const[manualItems,setManualItems]=useState<BasketItem[]>([])
  const[appliedDeals,setAppliedDeals]=useState<AppliedDeal[]>([])
  // Item modal (modifier selection / edit)
  const[itemModal,setItemModal]=useState<{item:MenuItem;modGroups:ModifierGroup[];editCartKey?:string}|null>(null)
  const[modalMods,setModalMods]=useState<{name:string;price:number}[]>([])
  const[modalNotes,setModalNotes]=useState('')
  // Deal modal
  const[showDealsModal,setShowDealsModal]=useState(false)
  const[activeDealBundle,setActiveDealBundle]=useState<any>(null)
  const[showCompleted,setShowCompleted]=useState(false)
  const[struckPrep,setStruckPrep]=useState<Set<string>>(new Set())
  const[undoPrep,setUndoPrep]=useState<{name:string;qty:number}|null>(null)
  const[categoryConfigs,setCategoryConfigs]=useState<Record<string,{secs:number;batch:number}>>({})
  const[categoryAllowNotes,setCategoryAllowNotes]=useState<Record<string,boolean>>({})
  const[editingCatId,setEditingCatId]=useState<string|null>(null)
  const[editCatForm,setEditCatForm]=useState<{name:string;prepMins:number;prepSecs30:number;batch:number;allowNotes:boolean}|null>(null)
  const[savingCat,setSavingCat]=useState(false)
  const[showPrepList,setShowPrepList]=useState(false)
  const[dealSlotPicks,setDealSlotPicks]=useState<Record<string,string>>({})
  // Pause state (paused_until ISO string, null = not paused)
  const[pausedUntil,setPausedUntil]=useState<string|null>(null)
  const[showPauseModal,setShowPauseModal]=useState(false)
  const paused=pausedUntil?new Date(pausedUntil)>new Date():false
  // Slot capacity confirmation
  const[pendingSlot,setPendingSlot]=useState<{time:string;remaining:number;isFull:boolean}|null>(null)
  // Cancel confirmation
  const[cancelConfirmId,setCancelConfirmId]=useState<string|null>(null)
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
  const prevPendingCount=useRef(0)
  const hasAutoSelected=useRef(false)
  const fetchAllRef=useRef<()=>void>(()=>{})
  const asapSlot=getAsapSlot(slots)
  const manualAsapSlot=getAsapSlot(manualSlots)
  // Auto-decay: effective remaining extra wait based on elapsed time since it was set
  const waitMinutes=useMemo(()=>{
    void waitTick // re-evaluate every 30s
    if(!extraWaitMins||!extraWaitStartedAt) return 0
    const elapsed=(Date.now()-new Date(extraWaitStartedAt).getTime())/60000
    return Math.max(0,Math.ceil(extraWaitMins-elapsed))
  },[extraWaitMins,extraWaitStartedAt,waitTick])

  // Use shared calculation function for consistency
  const calculation = useMemo(() => {
    return calculateOrderTotal(
      manualItems.map(item => ({ name: item.name, price: item.unit_price, quantity: item.quantity })),
      appliedDeals,
      truckMenu?.items || [],
      null // No discount codes in manual orders
    )
  }, [manualItems, appliedDeals, truckMenu])
  
  const manualItemsSubtotal = calculation.itemsTotal
  const dealSavings = calculation.dealSavings
  const manualTotal = calculation.total
  const calcQueueAwareReadyTime=()=>{
    if(!manualItems.length&&!appliedDeals.length) return {readyTime:'',minsFromNow:0}
    const nowMins=new Date().getHours()*60+new Date().getMinutes()
    const eventStartMins=manualEvent?(()=>{const[h,m]=manualEvent.start_time.split(':').map(Number);return h*60+m})():null
    const beforeEvent=eventStartMins!==null&&(!manualEvent||manualEvent.event_date>new Date().toISOString().split('T')[0]||nowMins<eventStartMins)
    const queueByCat:Record<string,number>={}
    orders.filter(o=>['pending','confirmed'].includes(o.status)).forEach(o=>{
      o.items.forEach(item=>{
        const cat=(truckMenu?.items.find(m=>m.name===item.name)?.category||'mains').toLowerCase()
        queueByCat[cat]=(queueByCat[cat]||0)+item.quantity
      })
    })
    const newByCat:Record<string,number>={}
    manualItems.forEach(item=>{
      const cat=(truckMenu?.items.find(m=>m.name===item.name)?.category||'mains').toLowerCase()
      newByCat[cat]=(newByCat[cat]||0)+item.quantity
    })
    if(beforeEvent&&eventStartMins!==null){
      let extraBatchMins=0
      for(const[cat,newQty] of Object.entries(newByCat)){
        const cfg=categoryConfigs[cat]||getCatConfig(cat)
        if(!cfg.secs) continue
        const totalQty=(queueByCat[cat]||0)+newQty
        const totalBatches=Math.ceil(totalQty/cfg.batch)
        const mins=Math.ceil(Math.max(0,totalBatches-1)*cfg.secs/60)
        extraBatchMins=Math.max(extraBatchMins,mins)
      }
      const asapMins=Math.round((eventStartMins+extraBatchMins+waitMinutes)/5)*5
      const h=Math.floor(asapMins/60);const m=asapMins%60
      return{readyTime:`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`,minsFromNow:Math.max(0,asapMins-nowMins)}
    }
    const totalSecs=calcQueueAwareReadySecs(newByCat,queueByCat,categoryConfigs,waitMinutes*60+120)
    if(totalSecs===0) return{readyTime:'',minsFromNow:0}
    const t=new Date();t.setSeconds(t.getSeconds()+totalSecs)
    return{readyTime:`${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`,minsFromNow:Math.ceil(totalSecs/60)}
  }
  const queueAware=calcQueueAwareReadyTime()
  const readyTime=queueAware.readyTime||calcReadyTime(manualItems,waitMinutes*60,truckMenu?.items,categoryConfigs)
  const availableDeals=(truckMenu?.bundles||[]).filter(b=>b.available)

  const showToast=(msg:string,type:'success'|'error'='success')=>{setToast({msg,type});setTimeout(()=>setToast(null),3500)}

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

  const fetchUpcomingEvents=useCallback(async(autoSelect=false)=>{
    if(!truck?.id)return
    try{
      const res=await fetch(`/api/events?truck=${truck.id}`)
      const data=await res.json()
      if(!data.events?.length)return
      // Mirror customer page: next 14 days, fall back to first event
      const cutoff=new Date();cutoff.setDate(cutoff.getDate()+14)
      const upcoming=data.events.filter((ev:any)=>{
        const[d,m,y]=ev.date.split('/').map(Number);return new Date(y,m-1,d)<=cutoff
      })
      const eventsToShow=upcoming.length>0?upcoming:[data.events[0]]
      const mapped=eventsToShow.map((ev:any)=>({
        id:ev.date_iso,
        event_date:ev.date_iso,
        start_time:ev.start_time,
        end_time:ev.end_time,
        venue_name:[ev.venue_name,ev.village].filter(Boolean).join(', ')||null,
      }))
      setUpcomingEvents(mapped)
      if(autoSelect){
        const now=new Date();const todayIso=now.toISOString().split('T')[0];const nowMins=now.getHours()*60+now.getMinutes()
        const current=mapped.find((ev:any)=>{
          if(ev.event_date!==todayIso)return false
          const[sh,sm]=ev.start_time.split(':').map(Number)
          const[eh,em]=ev.end_time.split(':').map(Number)
          return nowMins>=sh*60+sm&&nowMins<=eh*60+em+30
        })
        const next=mapped.find((ev:any)=>{
          if(ev.event_date>todayIso)return true
          const[sh,sm]=ev.start_time.split(':').map(Number)
          return sh*60+sm>nowMins
        })||mapped[0]||null
        const best=current||next
        if(best)setManualEvent(prev=>prev??best)
      }
    }catch{}
  },[truck?.id])

  const fetchManualSlots=useCallback(async(eventDate:string,startTime?:string,endTime?:string)=>{
    if(!truck?.id)return
    try{
      const p=new URLSearchParams({date:eventDate})
      if(startTime)p.set('start',startTime)
      if(endTime)p.set('end',endTime)
      const res=await fetch(`/api/slots/${truck.id}?${p}`)
      const data=await res.json()
      setManualSlots(data.slots||[])
    }catch{setManualSlots([])}
  },[truck?.id])

  const fetchAll=useCallback(async(currentPin=pin)=>{
    try {
      const p=new URLSearchParams({token}); if(currentPin) p.set('pin',currentPin)
      const res=await fetch(`/api/dashboard?${p}`); const data=await res.json()
      if(res.status===401){if(data.requiresPin){setRequiresPin(true);setLoading(false);return};setError('Invalid access link');setLoading(false);return}
      if(!res.ok){setError(data.error||'Failed to load');setLoading(false);return}
      setTruck(data.truck)
      setAutoAccept(data.truck?.auto_accept || false); setPausedUntil(data.truck?.paused_until||null); setExtraWaitMins(data.truck?.extra_wait_mins||0); setExtraWaitStartedAt(data.truck?.extra_wait_started_at||null); setOrders(data.orders); setSlots(data.slots)
      // Clear prep pills for orders no longer active (collected/cancelled)
      const activeOrderIds=new Set((data.orders||[]).filter((o:Order)=>['pending','confirmed','modified'].includes(o.status)).map((o:Order)=>o.id))
      setStruckPrep(prev=>{const n=new Set<string>();prev.forEach(k=>{const orderId=k.split(':')[0];if(activeOrderIds.has(orderId))n.add(k)});return n})
      setAuthenticated(true); setLastRefresh(new Date())
      if(data.truck?.id){fetchMenu(data.truck.id,currentPin);fetchStock(currentPin)}
      if(data.todayEvent) setTodayEvent(data.todayEvent)
    } catch{setError('Connection error')} finally{setLoading(false)}
  },[token,pin,fetchMenu,fetchStock])

  useEffect(()=>{fetchAll()},[fetchAll])
  useEffect(()=>{fetchAllRef.current=fetchAll},[fetchAll])
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
    if(!authenticated||hasAutoSelected.current)return
    hasAutoSelected.current=true
    fetchUpcomingEvents(true)
  },[authenticated,fetchUpcomingEvents])
  useEffect(()=>{if(manualEvent?.event_date)fetchManualSlots(manualEvent.event_date,manualEvent.start_time,manualEvent.end_time)},[manualEvent?.event_date,manualEvent?.start_time,manualEvent?.end_time,fetchManualSlots])
  useEffect(()=>{const id=setInterval(()=>setWaitTick(t=>t+1),30000);return()=>clearInterval(id)},[]);
  useEffect(()=>{
    if(!authenticated)return; let lock:any=null
    const get=async()=>{try{if('wakeLock' in navigator)lock=await(navigator as any).wakeLock.request('screen')}catch{}}
    get(); return()=>{lock?.release().catch(()=>null)}
  },[authenticated])
  useEffect(()=>{
    const count=orders.filter(o=>o.status==='pending').length
    if(count>prevPendingCount.current&&authenticated){
      try{const ctx=new(window.AudioContext||(window as any).webkitAudioContext)();const osc=ctx.createOscillator();const gain=ctx.createGain();osc.connect(gain);gain.connect(ctx.destination);osc.frequency.value=880;gain.gain.setValueAtTime(0.3,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.6);osc.start(ctx.currentTime);osc.stop(ctx.currentTime+0.6)}catch{}
    }
    prevPendingCount.current=count
  },[orders,authenticated])

  const submitPin=async()=>{
    const p=new URLSearchParams({token,pin:pinInput}); const res=await fetch(`/api/dashboard?${p}`); const data=await res.json()
    if(!res.ok){setPinError('Incorrect PIN');return}
    setPin(pinInput); setTruck(data.truck); setOrders(data.orders); setSlots(data.slots)
    if(data.todayEvent) setTodayEvent(data.todayEvent)
    setAuthenticated(true); setRequiresPin(false)
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

  const doAction=async(action:string,orderId:string)=>{
    if(action==='cancel'){setCancelConfirmId(orderId);return}
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
    if(slots.length===0&&todayEvent)fetchManualSlots(todayEvent.event_date,todayEvent.start_time,todayEvent.end_time)
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

  const addManualItem = (item: MenuItem, mods: { name: string; price: number }[] = [], notes = '') => {
    const key = makeCartKey(item.name, mods, notes)
    const unitPrice = item.price + mods.reduce((s, m) => s + m.price, 0)
    setManualItems(prev => {
      const ex = prev.find(i => i.cartKey === key)
      if (ex) return prev.map(i => i.cartKey === key ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, { name: item.name, quantity: 1, unit_price: unitPrice, modifiers: mods, specialInstructions: notes || undefined, cartKey: key }]
    })
  }
  const adjustManualQty = (cartKey: string, delta: number) => {
    setManualItems(prev => prev
      .map(i => i.cartKey === cartKey ? { ...i, quantity: i.quantity + delta } : i)
      .filter(i => i.quantity > 0)
    )
  }
  // editCartKey = updating an existing cart row; undefined = adding fresh
  const openManualItemModal = (item: MenuItem, modGroups: ModifierGroup[], editCartKey?: string) => {
    const existing = editCartKey ? manualItems.find(i => (i.cartKey || i.name) === editCartKey) : undefined
    setItemModal({ item, modGroups, editCartKey })
    setModalMods(existing?.modifiers || [])
    setModalNotes(existing?.specialInstructions || '')
  }
  const toggleModalMod = (opt: ModifierOption) => {
    setModalMods(prev => {
      const has = prev.some(m => m.name === opt.name)
      return has ? prev.filter(m => m.name !== opt.name) : [...prev, { name: opt.name, price: opt.price_adjustment }]
    })
  }
  const confirmAddFromModal = () => {
    if (!itemModal) return
    const newKey = makeCartKey(itemModal.item.name, modalMods, modalNotes)
    const newUnitPrice = itemModal.item.price + modalMods.reduce((s, m) => s + m.price, 0)

    if (itemModal.editCartKey) {
      // UPDATE the existing entry in-place (or merge if new signature already exists)
      setManualItems(prev => {
        const editEntry = prev.find(i => (i.cartKey || i.name) === itemModal.editCartKey)
        if (!editEntry) return prev
        const without = prev.filter(i => (i.cartKey || i.name) !== itemModal.editCartKey)
        const collision = without.find(i => i.cartKey === newKey)
        if (collision) {
          // Merge into the existing entry with the same signature
          return without.map(i => i.cartKey === newKey ? { ...i, quantity: i.quantity + editEntry.quantity } : i)
        }
        return without.concat({ ...editEntry, modifiers: modalMods, specialInstructions: modalNotes || undefined, unit_price: newUnitPrice, cartKey: newKey })
      })
    } else {
      addManualItem(itemModal.item, modalMods, modalNotes)
    }

    setItemModal(null)
    setModalMods([])
    setModalNotes('')
  }
  const resetManual=()=>{setManualName('');setManualEmail('');setManualNotes('');setManualSlot('');setManualItems([]);setAppliedDeals([]);setActiveDealBundle(null);setDealSlotPicks({})}

  const submitManual=async()=>{
    if(!manualName.trim()||(!manualItems.length && !appliedDeals.length))return
    const effectiveSlot=manualSlot||manualAsapSlot?.collection_time||null
    setActionLoading('manual')
    try{
      const res=await fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({token,pin,action:'manual',manualOrder:{customerName:manualName,customerPhone:null,customerEmail:manualEmail||null,slot:effectiveSlot,items:manualItems,deals:appliedDeals.map(d=>({name:d.bundle.name,slots:d.slots,slotModifiers:d.slotModifiers,slotNotes:d.slotNotes,price:d.bundle.bundle_price})),discountAmt:dealSavings,total:manualTotal,subtotal:manualItemsSubtotal,notes:manualNotes||null,event_id:null,event_date:manualEvent?.event_date||null}})})
      const data=await res.json(); if(!res.ok)throw new Error(data.error)
      showToast(data.slotFull?`Order #${data.orderId} saved — slot full`:`Order #${data.orderId} confirmed`)
      if(manualItems.length){
        const categoryMap:Record<string,string>={}
        manualItems.forEach(item=>{const mi=truckMenu?.items.find(m=>m.name===item.name);if(mi)categoryMap[item.name]=mi.category})
        await fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'decrement_stock',items:manualItems,categoryMap})}).catch(()=>null)
      }
      resetManual(); setActiveTab('orders'); await fetchAll()
    }catch(err:any){showToast(err.message||'Failed','error')}finally{setActionLoading(null)}
  }

  const updateStock=async(itemName:string,available:boolean,stockCount:number|null,category?:string)=>{
    await fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'set_stock',itemName,available,stockCount,category})})
    setItemStocks(prev=>{const ex=prev.find(s=>s.name===itemName);if(ex)return prev.map(s=>s.name===itemName?{...s,available,stock_count:stockCount}:s);return[...prev,{name:itemName,available,stock_count:stockCount,orders_count:0,category:category||null}]})
    if(truck?.id)fetchMenu(truck.id,pin)
  }
  const updateCategoryStock=async(category:string,stockCount:number|null)=>{
    await fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'set_category_stock',category,stockCount})})
    setCategoryStocks(prev=>{const ex=prev.find(s=>s.category===category);if(ex)return prev.map(s=>s.category===category?{...s,stock_count:stockCount}:s);return[...prev,{category,stock_count:stockCount,orders_count:0}]})
  }

  // Deal logic
  const openDealModal=(bundle:Bundle)=>{
    // Always start fresh — no pre-fill. Operator selects items explicitly.
    setActiveDealBundle(bundle); setDealSlotPicks({}); setShowDealsModal(true)
  }
  const applyDeal=()=>{
    if(!activeDealBundle)return
    const cats=getBundleSlotCats(activeDealBundle)
    if(!cats.every((c:string)=>dealSlotPicks[c])){showToast('Please select all items for this deal','error');return}

    // For each slot: if "USE_EXISTING:name" prefix, link to basket item (don't add)
    // Otherwise add new item to basket
    const newItems=[...manualItems]
    const resolvedSlots: Record<string,string>={}
    cats.forEach((cat:string)=>{
      const val=dealSlotPicks[cat]
      if(!val) return
      if(val.startsWith('USE_EXISTING:')){
        // Link to existing basket item — don't increment
        const itemName=val.replace('USE_EXISTING:','')
        resolvedSlots[cat]=itemName
      } else {
        // Add new item
        resolvedSlots[cat]=val
        const existing=newItems.find(i=>i.name===val)
        if(existing){
          existing.quantity+=1
        } else {
          const menuItem=truckMenu?.items.find(i=>i.name===val)
          if(menuItem) newItems.push({name:menuItem.name,quantity:1,unit_price:menuItem.price})
        }
      }
    })
    setManualItems(newItems)
    setAppliedDeals(prev=>[...prev,{bundle:activeDealBundle,slots:resolvedSlots,itemsTakenFromBasket:[]}])
    setShowDealsModal(false); setActiveDealBundle(null); setDealSlotPicks({})
    showToast(`${activeDealBundle.name} applied`)
  }

  if(loading)return<div className="min-h-screen bg-slate-50 flex items-center justify-center"><p className="text-slate-400 animate-pulse font-medium">Loading dashboard...</p></div>
  if(error)return<div className="min-h-screen bg-slate-50 flex items-center justify-center px-4"><div className="text-center"><p className="text-slate-900 font-bold text-lg mb-2">Access denied</p><p className="text-slate-500 text-sm">{error}</p><Link href="/" className="mt-4 inline-block text-orange-600 text-sm hover:underline">← Village Foodie</Link></div></div>
  if(requiresPin&&!authenticated)return(
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="bg-slate-800 rounded-2xl p-8 max-w-sm w-full text-center">
        <div className="text-4xl mb-4">🔒</div>
        <h2 className="text-white font-black text-xl mb-2">Enter PIN</h2>
        <p className="text-slate-400 text-sm mb-6">4-digit dashboard PIN</p>
        <input type="number" maxLength={4} value={pinInput} onChange={e=>setPinInput(e.target.value.slice(0,4))} onKeyDown={e=>e.key==='Enter'&&submitPin()} placeholder="• • • •" className="w-full text-center text-2xl font-black tracking-widest bg-slate-700 text-white rounded-xl px-4 py-3 mb-3 focus:outline-none focus:ring-2 focus:ring-orange-500 border border-slate-600"/>
        {pinError&&<p className="text-red-400 text-sm mb-3">{pinError}</p>}
        <button onClick={submitPin} className="w-full bg-orange-600 text-white font-black py-3 rounded-xl hover:bg-orange-700">Unlock</button>
      </div>
    </div>
  )

  // Sort by collection time (soonest first), then by order ID (oldest first)
  // Orders without slot get high sort value so they appear after timed orders
  const sortByTimeThenId=(a:Order,b:Order)=>{
    const aSlot=a.slot?parseInt(a.slot.split(':')[0])*60+parseInt(a.slot.split(':')[1]):99999
    const bSlot=b.slot?parseInt(b.slot.split(':')[0])*60+parseInt(b.slot.split(':')[1]):99999
    if(aSlot!==bSlot) return aSlot-bSlot
    return a.id.localeCompare(b.id)
  }
  const pendingOrders=orders.filter(o=>o.status==='pending').sort(sortByTimeThenId)
  const confirmedOrders=orders.filter(o=>['confirmed','modified'].includes(o.status)).sort(sortByTimeThenId)
  const otherOrders=orders.filter(o=>!['pending','confirmed','modified'].includes(o.status))
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
      <header className="bg-slate-900 px-4 py-3 sticky top-0 z-50 shadow-md">
        <div className="max-w-5xl mx-auto flex items-center justify-between relative">
          <Link href="/" className="shrink-0 z-10">
            <Image src="/logos/village-foodie-logo-v2.png" alt="Village Foodie" width={90} height={27} className="object-contain opacity-70"/>
          </Link>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex items-center gap-2">
              {truck?.logo&&<img src={truck.logo} alt={truck?.name||''} className="w-7 h-7 rounded-full object-cover bg-white shadow-sm shrink-0"/>}
              <div>
                <p className="font-black text-sm text-white leading-none">{truck?.name}</p>
                {truck?.venue_name&&<p className="text-slate-400 text-[11px] mt-0.5">{truck.venue_name}</p>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 z-10">
            <Link href={`/manage/${token}`} className="text-slate-400 hover:text-white text-xs font-bold hidden sm:block transition-colors">⚙ Manage</Link>
            {pendingOrders.length>0&&<span className="bg-orange-500 text-white text-xs font-black px-2 py-0.5 rounded-full animate-pulse">{pendingOrders.length}</span>}
            <button onClick={()=>fetchAll()} className="text-slate-400 hover:text-white text-sm">↻</button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-slate-800 px-4 border-b border-slate-700">
        <div className="max-w-5xl mx-auto flex">
          {([['orders',`Orders${orders.filter(o=>['pending','confirmed'].includes(o.status)).length>0?` (${orders.filter(o=>['pending','confirmed'].includes(o.status)).length})`:''}`],['add','+ Add order'],['stock','Menu & Stock']] as [typeof activeTab,string][]).map(([tab,label])=>(
            <button key={tab} onClick={()=>setActiveTab(tab)} className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab===tab?'border-orange-500 text-white':'border-transparent text-slate-400 hover:text-white'}`}>{label}</button>
          ))}
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 py-4 pb-20">

        {/* ORDERS TAB */}
        {activeTab==='orders'&&(
          <div>
            <div className="flex gap-2 mb-3">
              <button onClick={()=>{if(paused){fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'set_paused',paused_until:null})});setPausedUntil(null)}else{setShowPauseModal(true)}}} className={`flex-1 py-2.5 rounded-xl text-sm font-black border transition-all ${paused?'bg-red-600 text-white border-red-600':'bg-white text-slate-700 border-slate-200 hover:border-red-300'}`}>{paused?'▶ Resume orders':'⏸ Pause orders'}</button>
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
            <div className="flex items-center justify-between mb-3">
              <div className="grid grid-cols-3 gap-2 flex-1">
                {[{label:'New',value:pendingOrders.length,colour:'text-orange-500'},{label:'Confirmed',value:confirmedOrders.length,colour:'text-green-600'},{label:'Done',value:otherOrders.length,colour:'text-slate-400'}].map(s=>(
                  <div key={s.label} className="bg-white rounded-xl p-2.5 text-center border border-slate-200 shadow-sm"><p className={`text-xl font-black ${s.colour}`}>{s.value}</p><p className="text-slate-500 text-[11px] font-medium mt-0.5">{s.label}</p></div>
                ))}
              </div>
              <div className="flex gap-1.5 ml-2 shrink-0">
                <button onClick={()=>setShowPrepList(p=>!p)} className={`font-bold text-xs px-2.5 py-2 rounded-xl transition-colors ${showPrepList?'bg-amber-100 text-amber-700':'bg-slate-100 text-slate-600 hover:bg-slate-200'}`} title="Today's prep list">📋 Prep</button>
                {otherOrders.length>0&&(
                  <button onClick={()=>setShowCompleted(c=>!c)} className={`font-bold text-xs px-2.5 py-2 rounded-xl transition-colors ${showCompleted?'bg-slate-700 text-white':cancelledCount>0?'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100':'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {showCompleted?'Hide':cancelledCount>0?`✕ ${cancelledCount} cancelled · ${otherOrders.length-cancelledCount} done`:'✓ '+otherOrders.length+' done'}
                  </button>
                )}
              </div>
            </div>
            {(pendingOrders.length>0||confirmedOrders.length>0)&&(()=>{
              const allActive=orders.filter(o=>['pending','confirmed','modified'].includes(o.status))
              const counts=getAllDayCounts(allActive)
              const entries=Object.entries(counts).sort((a,b)=>b[1]-a[1])
              if(!entries.length)return null
              return(
                <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 mb-3 flex items-center gap-2 overflow-x-auto">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wide shrink-0">To make</span>
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
              const slottedOrders=orders
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
                  const cfg=getCatConfig(cat,categoryConfigs)
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
              orders.filter(o=>['pending','confirmed','modified'].includes(o.status)&&!o.slot).forEach(o=>currentBatch.push(o))

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
                <div className="grid lg:grid-cols-2 gap-3">{pendingOrders.map(o=><OrderCard key={o.id} order={o} truck={truck} slots={slots} actionLoading={actionLoading} onAction={doAction} onEdit={startEdit} categoryOrder={truckMenu?.categories?.map(c=>c.name)} kdsMode={truck?.kds_mode??false}/>)}</div>
              </div>
            )}
            {confirmedOrders.length>0&&(
              <div className="mb-4">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Confirmed</p>
                <div className="grid lg:grid-cols-2 gap-3">{confirmedOrders.map(o=><OrderCard key={o.id} order={o} truck={truck} slots={slots} actionLoading={actionLoading} onAction={doAction} onEdit={startEdit} categoryOrder={truckMenu?.categories?.map(c=>c.name)} kdsMode={truck?.kds_mode??false}/>)}</div>
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
                          {o.slot&&<span className="text-xs text-slate-400">🕐 {o.slot}</span>}
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
                  {otherOrders.length>5&&<p className="text-xs text-slate-400 text-center pt-1">+{otherOrders.length-5} more</p>}
                </div>
              </div>
            )}
            {pendingOrders.length===0&&confirmedOrders.length===0&&(
              <div className="text-center py-16">
                <p className="text-4xl mb-3">🍕</p>
                <p className="text-slate-500 font-medium">{orders.length===0?'No orders yet today':'All orders complete!'}</p>
                <p className="text-slate-300 text-xs mt-3">Updated {lastRefresh.toLocaleTimeString()}</p>
              </div>
            )}
          </div>
        )}

        {/* ADD ORDER TAB */}
        {activeTab==='add'&&(
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-5">
            {/* Event banner */}
            {manualEvent?(
              <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-orange-900 truncate">{(()=>{const t=new Date().toISOString().split('T')[0];const tmrw=new Date(Date.now()+86400000).toISOString().split('T')[0];const d=manualEvent.event_date;const label=d===t?'Today':d===tmrw?'Tomorrow':new Date(d+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});return`📅 ${label} · ${manualEvent.start_time}–${manualEvent.end_time}`})()}</p>
                  {manualEvent.venue_name&&<p className="text-xs text-orange-600 truncate mt-0.5">{manualEvent.venue_name}</p>}
                </div>
                <button onClick={()=>{fetchUpcomingEvents();setShowEventPicker(true)}} className="text-xs font-bold text-orange-600 border border-orange-300 rounded-lg px-2.5 py-1 shrink-0 hover:bg-orange-100 active:scale-95">Change</button>
              </div>
            ):(
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 flex items-center justify-between">
                <span className="text-sm text-slate-400">No event selected</span>
                <button onClick={()=>{fetchUpcomingEvents();setShowEventPicker(true)}} className="text-xs font-bold text-slate-600 border border-slate-200 rounded-lg px-2.5 py-1 hover:bg-slate-100 active:scale-95">Select event</button>
              </div>
            )}
            {/* STEP 1 */}
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-3">1. What would you like?</p>
              {truckMenu?(
                <div className="space-y-3">
                  {Object.entries(menuGroups).map(([cat,items])=>(
                    <div key={cat}>
                      <p className="text-xs font-black text-orange-600 uppercase tracking-wide mb-1.5">{cat.charAt(0).toUpperCase()+cat.slice(1)}</p>
                      <div className="flex flex-wrap gap-2">
                        {items.map(item=>{
                          const isSoldOut=!(item.available ?? true)
                          const stock=itemStocks.find(s=>s.name===item.name)
                          const itemRem=stock?.stock_count!=null?stock.stock_count-(stock.orders_count||0):null
                          const catSt=categoryStocks.find(s=>s.category===cat)
                          const catRem=catSt?.stock_count!=null?catSt.stock_count-(catSt.orders_count||0):null
                          const effectiveRem=itemRem!==null?(catRem!==null?Math.min(itemRem,catRem):itemRem):catRem
                          const isLow=!isSoldOut&&effectiveRem!==null&&effectiveRem<=10
                          const catModGroups=truckMenu?.categories?.find(c=>c.name===cat)?.modifierGroups||[]
                          const hasModifiers=catModGroups.length>0
                          const totalInBasket=manualItems.filter(i=>i.name===item.name).reduce((s,i)=>s+i.quantity,0)
                          if(isSoldOut)return(
                            <div key={item.name} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-100 bg-slate-50 cursor-not-allowed opacity-60">
                              <span className="text-xs text-slate-500 line-through">{item.name}</span>
                              <span className="text-[10px] text-red-400 font-bold">sold out</span>
                            </div>
                          )
                          return(
                            <button key={item.name}
                              onClick={()=>addManualItem(item)}
                              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-bold transition-all active:scale-95 ${totalInBasket>0?'bg-orange-600 border-orange-600 text-white':'bg-slate-50 border-slate-200 text-slate-700 hover:border-orange-300'}`}>
                              {totalInBasket>0&&<span className="text-orange-200">{totalInBasket}×</span>}
                              <span>{item.name}</span>
                              <span className={totalInBasket>0?'text-orange-200':'text-slate-400'}>£{item.price.toFixed(2)}</span>
                              {isLow&&!totalInBasket&&<span className="text-[10px] text-orange-500 font-black ml-0.5">({effectiveRem} left)</span>}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}

                  {(manualItems.length > 0 || appliedDeals.length > 0) && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                      <p className="text-xs font-black text-slate-500 uppercase tracking-wide">Order</p>
                      {(()=>{
                        // Group basket items by category for readback
                        const grouped: Record<string, typeof manualItems> = {}
                        manualItems.forEach(item => {
                          const cat = truckMenu?.items.find(m=>m.name===item.name)?.category || 'other'
                          if(!grouped[cat]) grouped[cat]=[]
                          grouped[cat].push(item)
                        })
                        return Object.entries(grouped).map(([cat, items]) => (
                          <div key={cat}>
                            {Object.keys(grouped).length > 1 && (
                              <p className="text-[10px] font-black text-orange-500 uppercase tracking-wide mb-1 mt-2 first:mt-0">{cat}</p>
                            )}
                            {items.map(item=>{
                              const modLabel=(item.modifiers||[]).map(m=>m.name).join(', ')
                              const subLabel=[modLabel,item.specialInstructions].filter(Boolean).join(' · ')
                              const rowKey=item.cartKey||item.name
                              const catAllowNotes=categoryAllowNotes[cat.toLowerCase()]??false
                              const itemCatModGroups=truckMenu?.categories?.find(c=>c.name===(truckMenu?.items.find(m=>m.name===item.name)?.category||''))?.modifierGroups||[]
                              const fullMenuItem=truckMenu?.items.find(m=>m.name===item.name)
                              return(
                              <div key={rowKey} className="flex items-start gap-2 py-1">
                                {/* Qty controls — top-aligned with item name */}
                                <div className="flex items-center gap-1 shrink-0 mt-0.5">
                                  <button onClick={()=>adjustManualQty(rowKey,-1)} className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center font-bold hover:bg-red-100 hover:text-red-600 text-sm leading-none">−</button>
                                  <span className="w-5 text-center font-black text-sm text-slate-900">{item.quantity}</span>
                                  <button onClick={()=>adjustManualQty(rowKey,1)} className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center font-bold hover:bg-orange-100 hover:text-orange-600 text-sm leading-none">+</button>
                                </div>
                                {/* Name + sub-label */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-sm font-bold text-slate-900">{item.name}</span>
                                    {itemCatModGroups.length>0&&fullMenuItem&&(
                                      <button onClick={()=>openManualItemModal(fullMenuItem,itemCatModGroups,rowKey)}
                                        className="text-[10px] font-bold text-orange-500 border border-orange-200 rounded-md px-1.5 py-0.5 hover:bg-orange-50 shrink-0">
                                        {subLabel ? '✏ Edit' : '+ Customise'}
                                      </button>
                                    )}
                                  </div>
                                  {(subLabel || catAllowNotes) && (
                                    <p className={`text-[10px] mt-0.5 leading-tight ${subLabel ? 'text-orange-500 font-medium' : 'text-slate-400 italic'}`}>
                                      {subLabel || 'Standard'}
                                    </p>
                                  )}
                                </div>
                                {/* Price — top-aligned */}
                                <div className="shrink-0 mt-0.5">
                                  <InlinePriceEditor price={item.unit_price} quantity={item.quantity} onChange={p=>setManualItems(prev=>prev.map(i=>(i.cartKey||i.name)===rowKey?{...i,unit_price:p}:i))}/>
                                </div>
                              </div>
                            )})}
                          </div>
                        ))
                      })()}
                      {appliedDeals.length>0&&(
                        <div className="border-t border-slate-200 pt-2 space-y-1">
                          <div className="flex justify-between text-xs"><span className="text-slate-500">Items subtotal</span><span className="text-slate-600">£{manualItemsSubtotal.toFixed(2)}</span></div>
                          {appliedDeals.map((d,i)=>{
                            const dealItemLabels=Object.entries(d.slots)
                              .filter(([,n])=>n)
                              .map(([cat,n])=>{const mods=d.slotModifiers?.[cat];return mods?.length?`${n} (+ ${mods.map(m=>m.name).join(', ')})`:n})
                              .join(', ')
                            const dealSlotMods=Object.entries(d.slotModifiers||{}).filter(([,mods])=>mods.length>0).map(([cat,mods])=>({itemName:d.slots[cat],mods})).filter(({itemName})=>itemName)
                            return(
                              <div key={i} className="text-xs space-y-0.5">
                                <div className="flex justify-between items-start gap-2">
                                  <div className="flex-1 min-w-0">
                                    <span className="text-green-600 font-bold">🎁 {d.bundle.name}</span>
                                    <span className="text-green-500 font-normal ml-1">({Object.values(d.slots).filter(Boolean).join(', ')})</span>
                                    <button
                                      onClick={()=>{
                                        if (d.itemsTakenFromBasket?.length > 0) {
                                          setManualItems(prev => prev.filter(item => !d.itemsTakenFromBasket.includes(item.cartKey || item.name)))
                                        }
                                        setAppliedDeals(prev=>prev.filter((_,n)=>n!==i))
                                      }}
                                      className="text-slate-300 hover:text-red-500 ml-1.5 text-sm leading-none align-middle"
                                      title="Remove deal"
                                    >×</button>
                                  </div>
                                  <span className="text-green-600 font-bold shrink-0">£{d.bundle.bundle_price.toFixed(2)}</span>
                                </div>
                                {dealSlotMods.map(({itemName,mods})=>(
                                  <div key={itemName} className="flex justify-between pl-3">
                                    <span className="text-slate-400">↳ {itemName}: + {mods.map(m=>m.name).join(', ')}</span>
                                    <span className="text-slate-400">+£{mods.reduce((s,m)=>s+m.price,0).toFixed(2)}</span>
                                  </div>
                                ))}
                              </div>
                            )
                          })}
                        </div>
                      )}
                      <div className="flex justify-between pt-2 border-t border-slate-200">
                        <span className="text-slate-600 text-sm font-bold">Total</span>
                        <span className="text-slate-900 font-black">£{manualTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                </div>
              ):<p className="text-slate-400 text-sm animate-pulse">Loading menu...</p>}

              {/* Deal button — always visible, outside basket */}
              {availableDeals.length>0&&(
                <button onClick={()=>{
                  if(availableDeals.length===1){openDealModal(availableDeals[0])}
                  else{setActiveDealBundle(null);setShowDealsModal(true)}
                }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-orange-300 text-orange-600 hover:bg-orange-50 transition-colors text-sm font-bold active:scale-[0.99] mt-2">
                  <span>🎁</span>
                  <span>{appliedDeals.length>0?'+ Add another deal':'+ Apply a deal'}</span>
                  {appliedDeals.length>0&&<span className="text-xs text-orange-400 font-normal">({appliedDeals.length} applied)</span>}
                </button>
              )}
            </div>

            {/* STEP 2 — Collection time */}
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-2">2. When to collect?</p>
              <div className="flex gap-2">
                <div className={`flex-1 rounded-xl px-3 py-2.5 ${readyTime?'bg-green-50 border border-green-200':'bg-slate-100 border border-slate-100'}`}>
                  {manualItems.length>0?(
                    <p className="text-green-700 font-black text-sm">⚡ ~{queueAware.minsFromNow} min{queueAware.minsFromNow!==1?'s':''} · around {readyTime}</p>
                  ):manualAsapSlot?(
                    <p className="text-slate-600 font-bold text-sm">⚡ Next slot: {manualAsapSlot.collection_time}</p>
                  ):(
                    <p className="text-slate-400 text-sm">Walk-up only</p>
                  )}
                </div>
                <div className="flex-1">
                  {manualSlots.length>0?(
                    <select value={manualSlot} onChange={e=>{
                      const chosen=e.target.value
                      if(!chosen){setManualSlot('');return}
                      const s=manualSlots.find(s=>s.collection_time===chosen)
                      if(s&&s.max_orders<999){
                        const remaining=Math.max(0,s.max_orders-s.current_orders)
                        const pct=s.current_orders/s.max_orders
                        if(pct>=0.7){setPendingSlot({time:chosen,remaining,isFull:pct>=1});return}
                      }
                      setManualSlot(chosen)
                    }} className="w-full h-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
                      <option value="">ASAP</option>
                      {manualSlots.filter(s=>!s.is_past||s.is_grace).map(s=>{if(s.is_grace)return<option key={s.collection_time} value={s.collection_time}>⚠️ {s.collection_time} · After closing</option>;const unlimited=s.max_orders>=999;const remaining=Math.max(0,s.max_orders-s.current_orders);const pct=unlimited?0:s.current_orders/s.max_orders;const ind=pct>=1?'🔴':pct>=0.7?'🟡':'🟢';const label=(!unlimited&&pct>=1)?' · Full':(!unlimited&&pct>=0.7)?` · ${remaining} left`:'';return<option key={s.collection_time} value={s.collection_time}>{s.collection_time} {ind}{label}</option>})}
                    </select>
                  ):(
                    <select value={manualSlot} onChange={e=>setManualSlot(e.target.value)}
                      className="w-full h-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
                      <option value="">ASAP</option>
                      {(()=>{
                        const startMins=manualEvent?(()=>{const[h,m]=manualEvent.start_time.split(':').map(Number);return h*60+m})():10*60
                        const endMins=manualEvent?(()=>{const[h,m]=manualEvent.end_time.split(':').map(Number);return h*60+m})():22*60+30
                        const opts=[]
                        for(let t=startMins;t<=endMins;t+=5){
                          const hh=String(Math.floor(t/60)).padStart(2,'0')
                          const mm=String(t%60).padStart(2,'0')
                          opts.push(`${hh}:${mm}`)
                        }
                        return opts.map(time=><option key={time} value={time}>{time}</option>)
                      })()}
                    </select>
                  )}
                </div>
              </div>
            </div>

            {/* STEP 3-5 */}
            <div><p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-1">3. Customer name *</p><input type="text" value={manualName} onChange={e=>setManualName(e.target.value)} placeholder="e.g. Sarah" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"/></div>
            <div><p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-1">4. Email <span className="font-normal normal-case text-slate-400">— optional</span></p><input type="email" value={manualEmail} onChange={e=>setManualEmail(e.target.value)} placeholder="For confirmation" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"/></div>
            <div><p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-1">5. Notes <span className="font-normal normal-case text-slate-400">— optional</span></p><textarea value={manualNotes} onChange={e=>setManualNotes(e.target.value)} placeholder="Allergies, no onion…" rows={2} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white resize-none"/></div>

            {(()=>{
              const isPastGrace=manualEvent?(()=>{const today=new Date().toISOString().split('T')[0];if(manualEvent.event_date>today)return false;const[h,m]=manualEvent.end_time.split(':').map(Number);return new Date().getHours()*60+new Date().getMinutes()>h*60+m+30})():false
              return(
                <button onClick={submitManual} disabled={actionLoading==='manual'||!manualName.trim()||(!manualItems.length && !appliedDeals.length)||isPastGrace}
                  className="w-full bg-orange-600 text-white font-black py-3.5 rounded-xl hover:bg-orange-700 transition-colors active:scale-[0.98] disabled:opacity-40">
                  {actionLoading==='manual'?'Saving...':isPastGrace?'Grace period ended':`Save order${manualItems.length || appliedDeals.length ? ` · £${manualTotal.toFixed(2)}` : ''}`}
                </button>
              )
            })()}
          </div>
        )}

        {/* MENU & STOCK TAB */}
        {activeTab==='stock'&&(
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
              <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-1">Stock & availability</p>
              <p className="text-slate-400 text-xs mb-4">Set category totals, add item-level limits, or toggle availability. Changes take effect immediately.</p>
              {truckMenu?(
                <div className="space-y-5">
                  {Object.entries(menuGroups).map(([cat,items])=>{
                    const catStock=categoryStocks.find(s=>s.category===cat)
                    const catCount=catStock?.stock_count??null; const catOrdered=catStock?.orders_count??0
                    const catRem=catCount!==null?catCount-catOrdered:null
                    const catObj=truckMenu?.categories?.find(c=>c.name.toLowerCase()===cat.toLowerCase())
                    const isEditingThis=editingCatId===catObj?.id&&editCatForm!==null
                    return(
                      <div key={cat}>
                        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100">
                          <p className="text-sm font-black text-orange-600 uppercase tracking-wide flex-1">{cat.charAt(0).toUpperCase()+cat.slice(1)}</p>
                          <div className="flex items-center gap-2">
                            {catRem!==null&&<span className={`text-xs font-bold ${catRem<=5?'text-orange-500':'text-slate-400'}`}>{catRem} left</span>}
                            {catOrdered>0&&<span className="text-xs text-slate-400">{catOrdered} sold</span>}
                            <input type="number" min="0" placeholder="∞" value={catCount??''}
                              onChange={e=>updateCategoryStock(cat,e.target.value===''?null:parseInt(e.target.value))}
                              className="w-16 border border-orange-200 rounded-lg px-2 py-1.5 text-xs text-center font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-orange-50"/>
                            <span className="text-slate-400 text-xs">total</span>
                            {catObj&&(
                              <button onClick={()=>isEditingThis?(setEditingCatId(null),setEditCatForm(null)):openCatEdit(catObj.id??'',cat)}
                                className={`text-[10px] font-bold px-2 py-1 rounded-md border transition-colors ${isEditingThis?'border-orange-400 text-orange-600 bg-orange-50':'border-slate-200 text-slate-400 hover:text-orange-600 hover:border-orange-300'}`}>
                                {isEditingThis?'✕':'Edit'}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Inline category edit accordion */}
                        {isEditingThis&&editCatForm&&(
                          <div className="mb-3 bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-3">
                            {/* Row 1: Name */}
                            <div>
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wide block mb-1">Category name</label>
                              <input type="text" value={editCatForm.name}
                                onChange={e=>setEditCatForm(prev=>prev?{...prev,name:e.target.value}:prev)}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"/>
                            </div>
                            {/* Row 2: Prep time + Batch */}
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wide block mb-1">Prep time</label>
                                <div className="flex gap-1.5">
                                  <select value={editCatForm.prepMins}
                                    onChange={e=>setEditCatForm(prev=>prev?{...prev,prepMins:parseInt(e.target.value)}:prev)}
                                    className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white">
                                    {[0,1,2,3,4,5,6,7,8,9,10,12,15,20].map(m=><option key={m} value={m}>{m}m</option>)}
                                  </select>
                                  <select value={editCatForm.prepSecs30}
                                    onChange={e=>setEditCatForm(prev=>prev?{...prev,prepSecs30:parseInt(e.target.value)}:prev)}
                                    className="w-14 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white">
                                    <option value={0}>0s</option>
                                    <option value={30}>30s</option>
                                  </select>
                                </div>
                              </div>
                              <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wide block mb-1">Batch size</label>
                                <input type="number" min="1" max="20" value={editCatForm.batch}
                                  onChange={e=>setEditCatForm(prev=>prev?{...prev,batch:parseInt(e.target.value)||1}:prev)}
                                  className="w-full border border-orange-200 rounded-lg px-3 py-2 text-xs font-bold text-center focus:outline-none focus:ring-2 focus:ring-orange-400 bg-orange-50"/>
                              </div>
                            </div>
                            {/* Row 3: Allow notes */}
                            <div className="flex items-center justify-between py-0.5">
                              <div>
                                <p className="text-xs font-bold text-slate-700">Allow custom notes</p>
                                <p className="text-[10px] text-slate-400">Customers can add special instructions for this category</p>
                              </div>
                              <Toggle on={editCatForm.allowNotes} onToggle={()=>setEditCatForm(prev=>prev?{...prev,allowNotes:!prev.allowNotes}:prev)}/>
                            </div>
                            {/* Row 4: Actions */}
                            <div className="flex gap-2 pt-0.5">
                              <button onClick={()=>{setEditingCatId(null);setEditCatForm(null)}}
                                className="flex-1 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">
                                Cancel
                              </button>
                              <button onClick={saveCatEdit} disabled={savingCat||!editCatForm.name.trim()}
                                className="flex-1 py-2 text-sm font-bold text-white bg-orange-600 rounded-xl hover:bg-orange-700 disabled:opacity-40">
                                {savingCat?'Saving…':'Save'}
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="space-y-1.5 ml-2">
                          {items.map(item=>{
                            const stock=itemStocks.find(s=>s.name===item.name)
                            // isAvailable: check itemStocks first (override), then fall back to menu
                            const isAvailable = stock ? (stock.available ?? true) : (item.available ?? true)
                            const itemCount=stock?.stock_count??null; const itemOrdered=stock?.orders_count??0
                            const itemRem=itemCount!==null?itemCount-itemOrdered:null
                            const effectiveRem=itemRem!==null?(catRem!==null?Math.min(itemRem,catRem):itemRem):catRem
                            return(
                              <div key={item.name} className={`flex items-center gap-2 p-2 rounded-xl border ${!isAvailable?'bg-red-50 border-red-200':'bg-slate-50 border-slate-100'}`}>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className={`font-bold text-sm ${!isAvailable?'text-red-500':'text-slate-800'}`}>{item.name}</p>
                                    {!isAvailable&&<span className="text-[10px] font-black text-red-500 bg-red-100 px-1.5 py-0.5 rounded-full">SOLD OUT</span>}
                                    {isAvailable&&effectiveRem!==null&&<span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${effectiveRem<=3?'text-red-600 bg-red-100':effectiveRem<=10?'text-orange-600 bg-orange-100':'text-slate-500 bg-slate-100'}`}>{effectiveRem} left</span>}
                                  </div>
                                  {itemOrdered>0&&<p className="text-xs text-slate-400 mt-0.5">{itemOrdered} ordered</p>}
                                </div>
                                <input type="number" min="0" placeholder="–" value={itemCount??''}
                                  onChange={e=>updateStock(item.name,isAvailable,e.target.value===''?null:parseInt(e.target.value),cat)}
                                  className="w-12 border border-slate-200 rounded-lg px-1.5 py-1 text-xs text-center font-bold focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" title="Item stock"/>
                                <Toggle on={isAvailable} onToggle={()=>updateStock(item.name,!isAvailable,itemCount,cat)}/>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ):<p className="text-slate-400 text-sm animate-pulse">Loading menu...</p>}
            </div>
            {truckMenu&&Object.keys(menuGroups).length>0&&(
            <div className="space-y-4">
            {/* Auto-accept toggle */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-black text-slate-900 text-sm">Auto-accept orders</p>
                  <p className="text-slate-400 text-xs mt-0.5">Orders confirm automatically when a slot has capacity. Full slots are still rejected.</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  {savingAutoAccept&&<span className="text-xs text-slate-400 animate-pulse">Saving…</span>}
                  <Toggle on={autoAccept} onToggle={()=>saveAutoAccept(!autoAccept)}/>
                </div>
              </div>
              {autoAccept&&(
                <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                  ⚠ Orders will be confirmed immediately — review regularly to avoid over-commitment
                </div>
              )}
            </div>

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

      {/* Item modifier modal */}
      {itemModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={()=>setItemModal(null)}/>
          <div className="relative bg-white rounded-t-2xl w-full max-w-lg shadow-2xl">
            <div className="px-5 pt-5 pb-4">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-black text-slate-900 text-lg">{itemModal.item.name}</h3>
                  <p className="text-slate-400 text-sm">£{itemModal.item.price.toFixed(2)} base</p>
                </div>
                <button onClick={()=>setItemModal(null)} className="text-slate-400 hover:text-slate-600 text-xl font-bold leading-none ml-4 mt-0.5">✕</button>
              </div>
              <div className="space-y-4">
                {itemModal.modGroups.map(group=>(
                  <div key={group.id}>
                    <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">{group.name}</p>
                    <div className="flex flex-wrap gap-2">
                      {group.options.map((opt:ModifierOption)=>{
                        const selected=modalMods.some(m=>m.name===opt.name)
                        return(
                          <button key={opt.id} onClick={()=>toggleModalMod(opt)}
                            className={`flex items-center gap-1.5 text-sm font-bold px-3.5 py-2 rounded-xl border-2 transition-all active:scale-95 ${selected?'bg-orange-600 border-orange-600 text-white':'bg-white border-slate-200 text-slate-700 hover:border-orange-300'}`}>
                            <span>{opt.name}</span>
                            {opt.price_adjustment>0&&<span className={selected?'text-orange-200':'text-orange-500'}>+£{opt.price_adjustment.toFixed(2)}</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
                {(truckMenu?.categories?.find(c => c.name === itemModal.item.category)?.allowNotes ?? false) && (
                  <div>
                    <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Note <span className="font-normal normal-case text-slate-400">— optional</span></p>
                    <textarea
                      value={modalNotes}
                      onChange={e=>setModalNotes(e.target.value.slice(0,60))}
                      placeholder="e.g. No onions, well done…"
                      rows={2}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white resize-none"
                    />
                    <p className="text-right text-[10px] text-slate-400 mt-0.5">{modalNotes.length}/60</p>
                  </div>
                )}
              </div>
            </div>
            <div className="px-5 pb-5 pt-2 border-t border-slate-100">
              <button onClick={confirmAddFromModal}
                className="w-full bg-orange-600 text-white font-black py-3.5 rounded-xl hover:bg-orange-700 transition-colors active:scale-[0.98]">
                {itemModal.editCartKey ? 'Save changes' : 'Add'} · £{(itemModal.item.price+modalMods.reduce((s,m)=>s+m.price,0)).toFixed(2)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deals modal */}
      {showDealsModal && (
        <DealsModal
          bundles={activeDealBundle ? [activeDealBundle] : availableDeals}
          menuItems={truckMenu?.items || []}
          menuCategories={truckMenu?.categories || []}
          basketItems={manualItems.map(i => ({ name: i.name, quantity: i.quantity, unit_price: i.unit_price, cartKey: i.cartKey, modifiers: i.modifiers, specialInstructions: i.specialInstructions }))}
          existingDeals={appliedDeals}
          onApply={(deal, slots, price, discount, rawSlots, modifierExtra, slotModifiers, slotNotes) => {
            const itemsTakenFromBasket = Object.entries(rawSlots)
              .filter(([, raw]) => raw.startsWith('USE_EXISTING:'))
              .map(([, raw]) => raw.replace('USE_EXISTING:', ''))
              .filter(Boolean)

            if (itemsTakenFromBasket.length > 0) {
              setManualItems(prev => prev.filter(item => !itemsTakenFromBasket.includes(item.cartKey || item.name)))
            }

            setAppliedDeals(prev => [...prev, {
              bundle: {
                ...deal,
                available: true,
                start_time: deal.start_time ?? null,
                end_time: deal.end_time ?? null
              },
              slots,
              itemsTakenFromBasket,
              modifierExtra,
              slotModifiers,
              slotNotes,
            }])
            setShowDealsModal(false)
            setActiveDealBundle(null)
          }}
          onClose={() => {
            setShowDealsModal(false)
            setActiveDealBundle(null)
          }}
        />
      )}

      {/* Pause duration picker */}
      {showPauseModal&&(
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <h3 className="font-black text-slate-900 text-base text-center mb-1">Pause online orders</h3>
            <p className="text-slate-500 text-sm text-center mb-4">Customers can still browse the menu but won't be able to order.</p>
            <div className="space-y-2 mb-4">
              {[{label:'10 minutes',mins:10},{label:'20 minutes',mins:20},{label:'30 minutes',mins:30}].map(({label,mins})=>(
                <button key={mins} onClick={()=>{const until=new Date(Date.now()+mins*60000).toISOString();fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'set_paused',paused_until:until})});setPausedUntil(until);setShowPauseModal(false)}} className="w-full bg-orange-50 border border-orange-200 text-orange-700 font-bold py-3 rounded-xl hover:bg-orange-100 text-sm">{label}</button>
              ))}
              <button onClick={()=>{const until=new Date('2099-01-01').toISOString();fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'set_paused',paused_until:until})});setPausedUntil(until);setShowPauseModal(false)}} className="w-full bg-slate-100 border border-slate-200 text-slate-700 font-bold py-3 rounded-xl hover:bg-slate-200 text-sm">Until I turn it back on</button>
            </div>
            <button onClick={()=>setShowPauseModal(false)} className="w-full text-slate-400 text-sm font-bold py-2">Cancel</button>
          </div>
        </div>
      )}

      {/* Slot capacity confirmation */}
      {pendingSlot&&(
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <div className="text-center mb-4">
              <div className="text-3xl mb-2">{pendingSlot.isFull?'🔴':'🟡'}</div>
              <p className="font-bold text-slate-900 text-base">
                {pendingSlot.isFull
                  ?`This slot is full. Use anyway?`
                  :`This slot only has ${pendingSlot.remaining} space${pendingSlot.remaining!==1?'s':''} left. Use anyway?`
                }
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={()=>{setManualSlot('');setPendingSlot(null)}} className="flex-1 bg-slate-100 text-slate-700 font-bold py-3 rounded-xl hover:bg-slate-200 text-sm">Cancel</button>
              <button onClick={()=>{setManualSlot(pendingSlot.time);setPendingSlot(null)}} className="flex-1 bg-orange-600 text-white font-bold py-3 rounded-xl hover:bg-orange-700 text-sm">Use anyway</button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel confirmation */}
      {cancelConfirmId&&(
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <p className="font-bold text-slate-900 text-base text-center mb-4">Are you sure you want to cancel order #{cancelConfirmId}?</p>
            <div className="flex gap-2">
              <button onClick={()=>setCancelConfirmId(null)} className="flex-1 bg-slate-100 text-slate-700 font-bold py-3 rounded-xl hover:bg-slate-200 text-sm">No</button>
              <button onClick={()=>{const id=cancelConfirmId;setCancelConfirmId(null);setActionLoading(`cancel-${id}`);fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'cancel',orderId:id})}).then(r=>r.json()).then(()=>{showToast(`Order #${id} cancelled`);fetchAll()}).catch(()=>showToast('Failed to cancel','error')).finally(()=>setActionLoading(null))}} className="flex-1 bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700 text-sm">Yes, cancel</button>
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
                            {item.name}<span className={totalInEdit>0?'text-orange-200':'text-slate-400'}> £{item.price.toFixed(2)}</span>
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
                      <p key={m.name} className="text-xs text-slate-400 pl-3 leading-tight">+ {m.name}{m.price>0?` +£${m.price.toFixed(2)}`:''}</p>
                    ))}
                    {item.specialInstructions&&<p className="text-xs text-slate-400 italic pl-3 leading-tight">📝 {item.specialInstructions}</p>}
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
                                {mods.map(m=><p key={m.name} className="text-xs text-slate-400 leading-tight">↳ {itemName}: + {m.name}{m.price>0?` +£${m.price.toFixed(2)}`:''}</p>)}
                                {note&&<p className="text-xs text-slate-400 italic leading-tight">↳ {itemName}: 📝 {note}</p>}
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
                    <span className="text-slate-400">Original</span>
                    <span className="text-slate-400">£{Number(editingOrder.total).toFixed(2)}</span>
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
                const editModalSlots=slots.length>0?slots:manualSlots
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
                <p className="text-sm text-slate-400">£{editItemModal.item.price.toFixed(2)}{editModalMods.reduce((s,m)=>s+m.price,0)>0?` + £${editModalMods.reduce((s,m)=>s+m.price,0).toFixed(2)}`:''}</p>
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

      {toast&&<div className={`fixed bottom-6 left-4 right-4 max-w-sm mx-auto rounded-xl px-4 py-3 text-sm font-bold text-center shadow-xl z-50 ${toast.type==='success'?'bg-green-600 text-white':'bg-red-600 text-white'}`}>{toast.msg}</div>}

      {/* Event picker sheet */}
      {showEventPicker&&(
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={()=>setShowEventPicker(false)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm" onClick={e=>e.stopPropagation()}>
            <div className="px-4 pt-4 pb-3 border-b border-slate-100 flex items-center justify-between">
              <p className="font-black text-slate-900 text-base">Select event</p>
              <button onClick={()=>setShowEventPicker(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 text-lg">✕</button>
            </div>
            <div className="p-3 space-y-2 max-h-72 overflow-y-auto">
              {upcomingEvents.length===0?(
                <p className="text-sm text-slate-400 text-center py-6">No upcoming events found</p>
              ):upcomingEvents.map(ev=>{
                const t=new Date().toISOString().split('T')[0]
                const tmrw=new Date(Date.now()+86400000).toISOString().split('T')[0]
                const label=ev.event_date===t?'Today':ev.event_date===tmrw?'Tomorrow':new Date(ev.event_date+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})
                const isSelected=manualEvent?.id===ev.id
                return(
                  <button key={ev.id} onClick={()=>{setManualEvent(ev);setShowEventPicker(false);fetchManualSlots(ev.event_date,ev.start_time,ev.end_time);setManualSlot('')}}
                    className={`w-full text-left px-3 py-3 rounded-xl border transition-colors ${isSelected?'border-orange-400 bg-orange-50':'border-slate-200 hover:border-orange-200 hover:bg-orange-50/50'}`}>
                    <p className="text-sm font-bold text-slate-900">{label} · {ev.start_time}–{ev.end_time}</p>
                    {ev.venue_name&&<p className="text-xs text-slate-500 mt-0.5">{ev.venue_name}</p>}
                    {isSelected&&<span className="text-[10px] font-black text-orange-600 uppercase tracking-wide">Selected</span>}
                  </button>
                )
              })}
            </div>
            <div className="p-3 border-t border-slate-100 pb-8">
              <button onClick={()=>setShowEventPicker(false)} className="w-full border border-slate-200 rounded-xl py-2.5 text-sm text-slate-600 font-medium hover:bg-slate-50">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Deals modal ──────────────────────────────────────────────────────────────