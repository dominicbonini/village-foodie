'use client'
// app/dashboard/[token]/page.tsx

import { useState, useEffect, useCallback, useRef, useMemo, use } from 'react'
import Image from 'next/image'
import Link from 'next/link'

import type {
  Order, Slot, TruckData, TruckMenu, Bundle, MenuItem,
  BasketItem, AppliedDeal, ItemStock, CategoryStock, CatConfig
} from '@/components/dashboard/types'
import { STATUS, DEFAULT_CAT_CONFIG } from '@/components/dashboard/types'
import {
  getAsapSlot, getCatConfig, catCookSecs, calcReadyTime,
  calcMinsFromNow, getCategoryTime, getBundleSlotCats
} from '@/components/dashboard/helpers'
import { OrderCard, Toggle, InlinePriceEditor } from '@/components/dashboard/OrderCard'
import { DealsModal } from '@/components/dashboard/DealsModal'
import { calculateOrderTotal } from '@/lib/order-calculations'
import { addToBasket, adjustQuantity, cleanupDealsForItem, groupByCategory } from '@/lib/basket-utils'


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
  const[paused,setPaused]=useState(false)
  const[waitMinutes,setWaitMinutes]=useState(0)
  const[autoAccept,setAutoAccept]=useState(false)
  const[savingAutoAccept,setSavingAutoAccept]=useState(false)
  // Add order
  const[manualName,setManualName]=useState('')
  const[manualEmail,setManualEmail]=useState('')
  const[manualNotes,setManualNotes]=useState('')
  const[manualSlot,setManualSlot]=useState('')
  const[manualItems,setManualItems]=useState<BasketItem[]>([])
  const[appliedDeals,setAppliedDeals]=useState<AppliedDeal[]>([])
  // Deal modal
  const[showDealsModal,setShowDealsModal]=useState(false)
  const[activeDealBundle,setActiveDealBundle]=useState<any>(null)
  const[showCompleted,setShowCompleted]=useState(false)
  const[struckPrep,setStruckPrep]=useState<Set<string>>(new Set())
  const[undoPrep,setUndoPrep]=useState<{name:string;qty:number}|null>(null)
  const[categoryConfigs,setCategoryConfigs]=useState<Record<string,{secs:number;batch:number}>>({})
  const[showPrepList,setShowPrepList]=useState(false)
  const[dealSlotPicks,setDealSlotPicks]=useState<Record<string,string>>({})
  // Edit modal
  const[editingOrder,setEditingOrder]=useState<Order|null>(null)
  const[editItems,setEditItems]=useState<BasketItem[]>([])
  const[editSlot,setEditSlot]=useState('')
  const[editNotes,setEditNotes]=useState('')
  const prevPendingCount=useRef(0)
  const asapSlot=getAsapSlot(slots)

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
  // Calculate queue-aware ready time accounting for existing pending/confirmed orders
  // For each category: queue qty + new qty, calculate batches needed, find ready time
  const calcQueueAwareReadyTime=()=>{
    if(!manualItems.length) return {readyTime:'',minsFromNow:0}
    // Aggregate items by category from active orders + new order
    const queueByCategory:Record<string,number>={}
    const newByCategory:Record<string,number>={}
    orders.filter(o=>['pending','confirmed'].includes(o.status)).forEach(o=>{
      o.items.forEach(item=>{
        const cat=truckMenu?.items.find(m=>m.name===item.name)?.category||'mains'
        queueByCategory[cat]=(queueByCategory[cat]||0)+item.quantity
      })
    })
    manualItems.forEach(item=>{
      const cat=truckMenu?.items.find(m=>m.name===item.name)?.category||'mains'
      newByCategory[cat]=(newByCategory[cat]||0)+item.quantity
    })
    // For each category with new items, calc total batches (queue + new) vs queue alone
    // The new order's items finish in the LAST batch they're in
    let maxNewItemSecs=0
    Object.entries(newByCategory).forEach(([cat,newQty])=>{
      const cfg=getCatConfig(cat,categoryConfigs)
      if(cfg.secs===0) return // drinks/dips don't queue
      const queueQty=queueByCategory[cat]||0
      const totalQty=queueQty+newQty
      // Total batches needed = ceil(totalQty / batch)
      // The new items finish in batch ceil(totalQty / batch)
      const finalBatch=Math.ceil(totalQty/cfg.batch)
      const totalSecs=finalBatch*cfg.secs
      if(totalSecs>maxNewItemSecs) maxNewItemSecs=totalSecs
    })
    // Add 2-min buffer + manual wait
    const totalSecs=Math.max(30,maxNewItemSecs)+(waitMinutes*60)+120
    const t=new Date(); t.setSeconds(t.getSeconds()+totalSecs)
    const readyTime=`${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`
    const minsFromNow=Math.ceil(totalSecs/60)
    return {readyTime,minsFromNow}
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
        if(d?.menu) setTruckMenu(d.menu)
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
      if(!res.ok){setError(data.error||'Failed to load');setLoading(false);return}
      setTruck(data.truck)
      setAutoAccept(data.truck?.auto_accept || false); setOrders(data.orders); setSlots(data.slots)
      // Clear prep pills for orders no longer active (collected/cancelled)
      const activeOrderIds=new Set((data.orders||[]).filter((o:Order)=>['pending','confirmed'].includes(o.status)).map((o:Order)=>o.id))
      setStruckPrep(prev=>{const n=new Set<string>();prev.forEach(k=>{const orderId=k.split(':')[0];if(activeOrderIds.has(orderId))n.add(k)});return n})
      setAuthenticated(true); setLastRefresh(new Date())
      if(data.truck?.id){fetchMenu(data.truck.id,currentPin);fetchStock(currentPin)}
    } catch{setError('Connection error')} finally{setLoading(false)}
  },[token,pin,fetchMenu,fetchStock])

  useEffect(()=>{fetchAll()},[fetchAll])
  useEffect(()=>{if(!authenticated)return;const id=setInterval(()=>fetchAll(),30000);return()=>clearInterval(id)},[authenticated,fetchAll])
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

  const doAction=async(action:string,orderId:string)=>{
    setActionLoading(`${action}-${orderId}`)
    try{
      const res=await fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action,orderId})})
      const data=await res.json(); if(!res.ok)throw new Error(data.error)
      const labels:Record<string,string>={confirm:'confirmed',reject:'rejected',ready:'ready',collected:'collected',undo_collected:'restored'}
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

  const startEdit=(order:Order)=>{setEditingOrder(order);setEditItems(order.items.map(i=>({...i})));setEditSlot(order.slot||'');setEditNotes(order.notes||'')}
  const addEditItem=(item:MenuItem)=>setEditItems(prev=>{const ex=prev.find(i=>i.name===item.name);return ex?prev.map(i=>i.name===item.name?{...i,quantity:i.quantity+1}:i):[...prev,{name:item.name,quantity:1,unit_price:item.price}]})
  const submitEdit=async()=>{
    if(!editingOrder)return; setActionLoading(`edit-${editingOrder.id}`)
    try{
      const res=await fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'edit',orderId:editingOrder.id,editedOrder:{items:editItems.filter(i=>i.quantity>0),slot:editSlot||null,notes:editNotes||null}})})
      const data=await res.json(); if(!res.ok)throw new Error(data.error)
      showToast(`Order #${editingOrder.id} updated`); setEditingOrder(null); await fetchAll()
    }catch(err:any){showToast(err.message||'Edit failed','error')}finally{setActionLoading(null)}
  }

  const addMenuItem = (item: MenuItem) => {
    setManualItems(prev => addToBasket(prev, item))
  }
  const adjustManualQty = (name: string, delta: number) => {
    const wasInBasket = manualItems.find(i => i.name === name)
    setManualItems(prev => adjustQuantity(prev, name, delta))
    // If item was removed (quantity hit 0), clean up deals
    const stillInBasket = adjustQuantity(manualItems, name, delta).find(i => i.name === name)
    if (wasInBasket && !stillInBasket) {
      setAppliedDeals(prev => cleanupDealsForItem(prev, name))
    }
  }
  const resetManual=()=>{setManualName('');setManualEmail('');setManualNotes('');setManualSlot('');setManualItems([]);setAppliedDeals([]);setActiveDealBundle(null);setDealSlotPicks({})}

  const submitManual=async()=>{
    if(!manualName.trim()||!manualItems.length)return
    const effectiveSlot=manualSlot||asapSlot?.collection_time||null
    setActionLoading('manual')
    try{
      const res=await fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({token,pin,action:'manual',manualOrder:{customerName:manualName,customerPhone:null,customerEmail:manualEmail||null,slot:effectiveSlot,items:manualItems,deals:appliedDeals.map(d=>({name:d.bundle.name,slots:d.slots})),discountAmt:dealSavings,total:manualTotal,subtotal:manualItemsSubtotal,notes:manualNotes||null}})})
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
    setAppliedDeals(prev=>[...prev,{bundle:activeDealBundle,slots:resolvedSlots}])
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
  const confirmedOrders=orders.filter(o=>o.status==='confirmed').sort(sortByTimeThenId)
  const otherOrders=orders.filter(o=>!['pending','confirmed'].includes(o.status))
  const menuGroups = truckMenu ? Object.fromEntries(groupByCategory(truckMenu.items, truckMenu.categories?.map(c => c.name))) : {}
  const editTotal=editItems.reduce((s,i)=>s+i.unit_price*i.quantity,0)

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
              <button onClick={()=>setPaused(p=>!p)} className={`flex-1 py-2.5 rounded-xl text-sm font-black border transition-all ${paused?'bg-red-600 text-white border-red-600':'bg-white text-slate-700 border-slate-200 hover:border-red-300'}`}>{paused?'▶ Resume':'⏸ Pause orders'}</button>
              <select value={waitMinutes} onChange={e=>setWaitMinutes(parseInt(e.target.value))} className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
                <option value={0}>No extra wait</option><option value={10}>+10 min</option><option value={20}>+20 min</option><option value={30}>+30 min</option><option value={45}>+45 min</option>
              </select>
            </div>
            {paused&&<div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-3 text-center"><p className="text-red-700 font-black text-sm">⏸ Orders paused — customers see "Too busy, please order at the truck"</p></div>}
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
                  <button onClick={()=>setShowCompleted(c=>!c)} className={`font-bold text-xs px-2.5 py-2 rounded-xl transition-colors ${showCompleted?'bg-slate-700 text-white':'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {showCompleted?'Hide':'✓ '+otherOrders.length+' done'}
                  </button>
                )}
              </div>
            </div>
            {showPrepList&&(()=>{
              const now=new Date()
              const nowMins=now.getHours()*60+now.getMinutes()
              const BUFFER_SECS=120

              // Get all active orders with slots, sorted by slot time
              const slottedOrders=orders
                .filter(o=>['pending','confirmed'].includes(o.status)&&o.slot)
                .sort((a,b)=>a.slot!.localeCompare(b.slot!))

              // Find the NEXT slot that needs action (start cooking time <= now+5min)
              const currentBatch:typeof slottedOrders=[]
              const upcomingBatches:{slot:string;startBy:string;minsUntil:number;items:Record<string,number>}[]=[]

              // Process each unique slot
              const slotGroups:Record<string,typeof slottedOrders>={}
              slottedOrders.forEach(o=>{if(!slotGroups[o.slot!])slotGroups[o.slot!]=[];slotGroups[o.slot!].push(o)})

              Object.entries(slotGroups).forEach(([slot,slotOrders])=>{
                const itemMap:Record<string,number>={}
                slotOrders.forEach(o=>o.items.forEach(i=>{itemMap[i.name]=(itemMap[i.name]||0)+i.quantity}))
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
                  upcomingBatches.push({slot,startBy:startStr,minsUntil:minsUntilStart,items:itemMap})
                }
              })

              // Also include slotless confirmed orders in current batch
              orders.filter(o=>['pending','confirmed'].includes(o.status)&&!o.slot).forEach(o=>currentBatch.push(o))

              // Build current prep map
              // Build ordered list of units in insertion order across orders, then by item position
              // Sort orders by slot then ID, items keep their original order, expand each into units
              const sortedBatch=[...currentBatch].sort((a,b)=>{
                const aSlot=a.slot?parseInt(a.slot.replace(':','')):99999
                const bSlot=b.slot?parseInt(b.slot.replace(':','')):99999
                if(aSlot!==bSlot) return aSlot-bSlot
                return a.id.localeCompare(b.id)
              })
              type PrepUnit={name:string;orderId:string;unitIdx:number;cat:string}
              const allUnits:PrepUnit[]=[]
              sortedBatch.forEach(o=>o.items.forEach(item=>{
                const cat=truckMenu?.items.find(m=>m.name===item.name)?.category||''
                for(let u=0;u<item.quantity;u++) allUnits.push({name:item.name,orderId:o.id,unitIdx:u,cat})
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
                                  {u.name}{struck?' ✓':''}
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
                                  {u.name}{struck?' ✓':''}
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
                        <div key={b.slot} className="flex items-center justify-between text-xs">
                          <span className="text-amber-700 font-bold">
                            {Object.entries(b.items).map(([n,q])=>`${q}× ${n}`).join(', ')}
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
                <div className="grid lg:grid-cols-2 gap-3">{pendingOrders.map(o=><OrderCard key={o.id} order={o} truck={truck} slots={slots} actionLoading={actionLoading} onAction={doAction} onEdit={startEdit}/>)}</div>
              </div>
            )}
            {confirmedOrders.length>0&&(
              <div className="mb-4">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Confirmed</p>
                <div className="grid lg:grid-cols-2 gap-3">{confirmedOrders.map(o=><OrderCard key={o.id} order={o} truck={truck} slots={slots} actionLoading={actionLoading} onAction={doAction} onEdit={startEdit}/>)}</div>
              </div>
            )}
            {showCompleted&&otherOrders.length>0&&(
              <div className="mb-4">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Completed today</p>
                <div className="space-y-2">
                  {otherOrders.map(o=>(
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
                          const inBasket=manualItems.find(i=>i.name===item.name)
                          const isSoldOut=!(item.available ?? true)
                          const stock=itemStocks.find(s=>s.name===item.name)
                          const itemRem=stock?.stock_count!=null?stock.stock_count-(stock.orders_count||0):null
                          const catSt=categoryStocks.find(s=>s.category===cat)
                          const catRem=catSt?.stock_count!=null?catSt.stock_count-(catSt.orders_count||0):null
                          const effectiveRem=itemRem!==null?(catRem!==null?Math.min(itemRem,catRem):itemRem):catRem
                          const isLow=!isSoldOut&&effectiveRem!==null&&effectiveRem<=10
                          if(isSoldOut)return(
                            <div key={item.name} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-100 bg-slate-50 cursor-not-allowed opacity-60">
                              <span className="text-xs text-slate-500 line-through">{item.name}</span>
                              <span className="text-[10px] text-red-400 font-bold">sold out</span>
                            </div>
                          )
                          return(
                            <button key={item.name} onClick={()=>addMenuItem(item)}
                              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-bold transition-all active:scale-95 ${inBasket?'bg-orange-600 border-orange-600 text-white':'bg-slate-50 border-slate-200 text-slate-700 hover:border-orange-300'}`}>
                              {inBasket&&<span className="text-orange-200">{inBasket.quantity}×</span>}
                              <span>{item.name}</span>
                              <span className={inBasket?'text-orange-200':'text-slate-400'}>£{item.price.toFixed(2)}</span>
                              {isLow&&!inBasket&&<span className="text-[10px] text-orange-500 font-black ml-0.5">({effectiveRem} left)</span>}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}

                  {manualItems.length>0&&(
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
                            {items.map(item=>(
                              <div key={item.name} className="flex items-center gap-2 py-0.5">
                                {/* Qty LEFT — natural speech order: "3 Margheritas" */}
                                <div className="flex items-center gap-1 shrink-0">
                                  <button onClick={()=>adjustManualQty(item.name,-1)} className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center font-bold hover:bg-red-100 hover:text-red-600 text-sm leading-none">−</button>
                                  <span className="w-5 text-center font-black text-sm text-slate-900">{item.quantity}</span>
                                  <button onClick={()=>adjustManualQty(item.name,1)} className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center font-bold hover:bg-orange-100 hover:text-orange-600 text-sm leading-none">+</button>
                                </div>
                                <span className="flex-1 text-sm font-bold text-slate-900 truncate">{item.name}</span>
                                <InlinePriceEditor price={item.unit_price} quantity={item.quantity} onChange={p=>setManualItems(prev=>prev.map(i=>i.name===item.name?{...i,unit_price:p}:i))}/>
                              </div>
                            ))}
                          </div>
                        ))
                      })()}
                      {appliedDeals.length>0&&(
                        <div className="border-t border-slate-200 pt-2 space-y-1">
                          <div className="flex justify-between text-xs"><span className="text-slate-500">Items subtotal</span><span className="text-slate-600">£{manualItemsSubtotal.toFixed(2)}</span></div>
                          {appliedDeals.map((d,i)=>{
                            const orig=Object.values(d.slots).reduce((sum,n)=>{const item=truckMenu?.items.find(m=>m.name===n);return sum+(item?.price||0)},0)
                            const saving=Math.max(0,orig-d.bundle.bundle_price)
                            const dealItemLabels=Object.values(d.slots).filter(Boolean).join(', ')
                            return(
                              <div key={i} className="flex justify-between items-start text-xs gap-2">
                                <div className="flex-1 min-w-0">
                                  <span className="text-green-600 font-bold">🎁 {d.bundle.name}</span>
                                  <span className="text-green-500 font-normal ml-1">({dealItemLabels})</span>
                                  <button
                                    onClick={()=>{
                                      // Add items from the deal back to manual items
                                      const itemsInDeal = Object.values(d.slots).filter(Boolean) as string[]
                                      itemsInDeal.forEach(itemName => {
                                        const menuItem = truckMenu?.items.find(m => m.name === itemName)
                                        if (menuItem) {
                                          setManualItems(prev => {
                                            const existing = prev.find(i => i.name === itemName)
                                            if (existing) {
                                              return prev.map(i => 
                                                i.name === itemName 
                                                  ? { ...i, quantity: i.quantity + 1 } 
                                                  : i
                                              )
                                            } else {
                                              return [...prev, { name: itemName, quantity: 1, unit_price: menuItem.price }]
                                            }
                                          })
                                        }
                                      })
                                      setAppliedDeals(prev=>prev.filter((_,n)=>n!==i))
                                    }}
                                    className="text-slate-300 hover:text-red-500 ml-1.5 text-sm leading-none align-middle"
                                    title="Remove deal and restore items"
                                  >×</button>
                                </div>
                                <span className="text-green-600 font-bold shrink-0">-£{saving.toFixed(2)}</span>
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
                  {(()=>{
                    // Calculate queue-aware ready time accounting for existing pending/confirmed orders
  // For each category: queue qty + new qty, calculate batches needed, find ready time
  const calcQueueAwareReadyTime=()=>{
    if(!manualItems.length) return {readyTime:'',minsFromNow:0}
    // Aggregate items by category from active orders + new order
    const queueByCategory:Record<string,number>={}
    const newByCategory:Record<string,number>={}
    orders.filter(o=>['pending','confirmed'].includes(o.status)).forEach(o=>{
      o.items.forEach(item=>{
        const cat=truckMenu?.items.find(m=>m.name===item.name)?.category||'mains'
        queueByCategory[cat]=(queueByCategory[cat]||0)+item.quantity
      })
    })
    manualItems.forEach(item=>{
      const cat=truckMenu?.items.find(m=>m.name===item.name)?.category||'mains'
      newByCategory[cat]=(newByCategory[cat]||0)+item.quantity
    })
    // For each category with new items, calc total batches (queue + new) vs queue alone
    // The new order's items finish in the LAST batch they're in
    let maxNewItemSecs=0
    Object.entries(newByCategory).forEach(([cat,newQty])=>{
      const cfg=getCatConfig(cat,categoryConfigs)
      if(cfg.secs===0) return // drinks/dips don't queue
      const queueQty=queueByCategory[cat]||0
      const totalQty=queueQty+newQty
      // Total batches needed = ceil(totalQty / batch)
      // The new items finish in batch ceil(totalQty / batch)
      const finalBatch=Math.ceil(totalQty/cfg.batch)
      const totalSecs=finalBatch*cfg.secs
      if(totalSecs>maxNewItemSecs) maxNewItemSecs=totalSecs
    })
    // Add 2-min buffer + manual wait
    const totalSecs=Math.max(30,maxNewItemSecs)+(waitMinutes*60)+120
    const t=new Date(); t.setSeconds(t.getSeconds()+totalSecs)
    const readyTime=`${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`
    const minsFromNow=Math.ceil(totalSecs/60)
    return {readyTime,minsFromNow}
  }
  const queueAware=calcQueueAwareReadyTime()
  const readyTime=queueAware.readyTime||calcReadyTime(manualItems,waitMinutes*60,truckMenu?.items,categoryConfigs)
                    const hasItems=manualItems.length>0
                    const minsFromNow=hasItems?queueAware.minsFromNow:null
                    return(
                      <div className={`rounded-xl px-3 py-2.5 ${hasItems?'bg-green-50 border border-green-200':'bg-slate-100 border border-slate-100'}`}>
                        {hasItems?(
                          <p className="text-green-700 font-black text-sm">⚡ ~{minsFromNow} min{minsFromNow!==1?'s':''} · around {readyTime}</p>
                        ):asapSlot?(
                          <p className="text-slate-600 font-bold text-sm">⚡ Next slot: {asapSlot.collection_time}</p>
                        ):(
                          <p className="text-slate-400 text-sm">Walk-up only</p>
                        )}
                      </div>
                    )
                  })()}
                </div>
                <div className="flex-1">
                  {slots.length>0?(
                    <select value={manualSlot} onChange={e=>setManualSlot(e.target.value)} className="w-full h-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
                      <option value="">ASAP</option>
                      {slots.map(s=>{const pct=s.max_orders>0?s.current_orders/s.max_orders:0;const ind=pct>=1?'🔴':pct>=0.7?'🟡':'🟢';return<option key={s.collection_time} value={s.collection_time} disabled={!s.available}>{s.collection_time} {ind} {s.available?`${s.max_orders-s.current_orders} left`:'Full'}</option>})}
                    </select>
                  ):(
                    <div className="flex gap-1.5">
                      <select
                        value={manualSlot?manualSlot.split(':')[0]:''}
                        onChange={e=>{const h=e.target.value;const m=manualSlot?manualSlot.split(':')[1]||'00':'00';setManualSlot(h?`${h}:${m}`:'')}}
                        className="flex-1 border border-slate-200 rounded-xl px-2 py-2.5 text-sm font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                      >
                        <option value="">Hr</option>
                        {Array.from({length:14},(_,i)=>String(i+10).padStart(2,'0')).map(h=>(
                          <option key={h} value={h}>{parseInt(h)}</option>
                        ))}
                      </select>
                      <select
                        value={manualSlot?manualSlot.split(':')[1]||'':''}
                        onChange={e=>{const h=manualSlot?manualSlot.split(':')[0]||'12':'12';setManualSlot(e.target.value?`${h}:${e.target.value}`:'')}}
                        className="flex-1 border border-slate-200 rounded-xl px-2 py-2.5 text-sm font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                      >
                        <option value="">Min</option>
                        {['00','05','10','15','20','25','30','35','40','45','50','55'].map(m=>(
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* STEP 3-5 */}
            <div><p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-1">3. Customer name *</p><input type="text" value={manualName} onChange={e=>setManualName(e.target.value)} placeholder="e.g. Sarah" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"/></div>
            <div><p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-1">4. Email <span className="font-normal normal-case text-slate-400">— optional</span></p><input type="email" value={manualEmail} onChange={e=>setManualEmail(e.target.value)} placeholder="For confirmation" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"/></div>
            <div><p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-1">5. Notes <span className="font-normal normal-case text-slate-400">— optional</span></p><textarea value={manualNotes} onChange={e=>setManualNotes(e.target.value)} placeholder="Allergies, no onion…" rows={2} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white resize-none"/></div>

            <button onClick={submitManual} disabled={actionLoading==='manual'||!manualName.trim()||!manualItems.length}
              className="w-full bg-orange-600 text-white font-black py-3.5 rounded-xl hover:bg-orange-700 transition-colors active:scale-[0.98] disabled:opacity-40">
              {actionLoading==='manual'?'Saving...':`Save order${manualItems.length ? ` · £${manualTotal.toFixed(2)}` : ''}`}
            </button>
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
                    return(
                      <div key={cat}>
                        <div className="flex items-center gap-3 mb-2 pb-2 border-b border-slate-100">
                          <p className="text-sm font-black text-orange-600 uppercase tracking-wide flex-1">{cat.charAt(0).toUpperCase()+cat.slice(1)}</p>
                          <div className="flex items-center gap-2">
                            {catRem!==null&&<span className={`text-xs font-bold ${catRem<=5?'text-orange-500':'text-slate-400'}`}>{catRem} left</span>}
                            {catOrdered>0&&<span className="text-xs text-slate-400">{catOrdered} sold</span>}
                            <input type="number" min="0" placeholder="∞" value={catCount??''}
                              onChange={e=>updateCategoryStock(cat,e.target.value===''?null:parseInt(e.target.value))}
                              className="w-16 border border-orange-200 rounded-lg px-2 py-1.5 text-xs text-center font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-orange-50"/>
                            <span className="text-slate-400 text-xs">total</span>
                          </div>
                        </div>
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
            {/* Timing configuration per category */}
            {truckMenu&&Object.keys(menuGroups).length>0&&(
            <div className="space-y-4">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mt-4">
                <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-1">Prep time per category</p>
                <p className="text-slate-400 text-xs mb-3">Set how many minutes each item takes per category. Drinks and dips should be 0. Used to estimate ready times.</p>
                <div className="space-y-2">
                  {Object.keys(menuGroups).map((cat:string)=>{
                    const cfg=categoryConfigs[cat]??getCatConfig(cat)
                    const mins=Math.floor(cfg.secs/60)
                    const secs30=cfg.secs%60>=30?30:0
                    return(
                      <div key={cat} className="flex items-center gap-3">
                        <span className="text-sm font-bold text-slate-700 capitalize flex-1">{cat}</span>
                        <div className="flex items-center gap-1.5">
                          <select value={mins}
                            onChange={e=>setCategoryConfigs(prev=>({...prev,[cat]:{...(prev[cat]??getCatConfig(cat)),secs:parseInt(e.target.value)*60+secs30}}))}
                            className="w-16 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-center font-bold focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white">
                            {[0,1,2,3,4,5,6,7,8,9,10,12,15,20].map(m=><option key={m} value={m}>{m}m</option>)}
                          </select>
                          <select value={secs30}
                            onChange={e=>setCategoryConfigs(prev=>({...prev,[cat]:{...(prev[cat]??getCatConfig(cat)),secs:mins*60+parseInt(e.target.value)}}))}
                            className="w-14 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-center font-bold focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white">
                            <option value={0}>0s</option>
                            <option value={30}>30s</option>
                          </select>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-slate-400 font-bold">Batch</span>
                          <input type="number" min="1" max="20" value={cfg.batch}
                            onChange={e=>setCategoryConfigs(prev=>({...prev,[cat]:{...(prev[cat]??getCatConfig(cat)),batch:parseInt(e.target.value)||1}}))}
                            className="w-12 border border-orange-200 rounded-lg px-2 py-1.5 text-xs text-center font-bold focus:outline-none focus:ring-2 focus:ring-orange-400 bg-orange-50"
                            title="How many cook simultaneously"
                          />
                        </div>
                      </div>
                    )
                  })}
                  <p className="text-xs text-slate-400 mt-2">Batch = how many cook at once. 3 pizzas at 4 batched = 1 cycle.</p>
                </div>
              </div>
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
              <p>• Sold out items show with strikethrough to customers</p>
              <p>• Batch = how many of that item cook simultaneously</p>
            </div>
            </div>
            )}
          </div>
        )}
      </main>

      {/* Deals modal */}
      {showDealsModal && (
        <DealsModal
          bundles={activeDealBundle ? [activeDealBundle] : availableDeals}
          menuItems={truckMenu?.items || []}
          basketItems={manualItems.map(i => ({ name: i.name, quantity: i.quantity, unit_price: 0 }))}
          existingDeals={appliedDeals}
          onApply={(deal, slots, price, discount) => {
            // Remove items from basket that are being used in this deal
            // (prevents double-counting: deal price + individual item prices)
            const itemsInDeal = Object.values(slots).filter(Boolean)
            setManualItems(prev => prev.filter(item => !itemsInDeal.includes(item.name)))
            
            // Add the deal
            setAppliedDeals(prev => [...prev, { 
              bundle: { 
                ...deal, 
                available: true,
                start_time: deal.start_time ?? null,
                end_time: deal.end_time ?? null
              }, 
              slots 
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



      {/* Edit order modal */}
      {editingOrder&&(
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={e=>e.target===e.currentTarget&&setEditingOrder(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-black text-slate-900">Edit Order #{editingOrder.id}</h3>
              <button onClick={()=>setEditingOrder(null)} className="text-slate-400 hover:text-slate-700 text-xl font-bold w-8 h-8 flex items-center justify-center">×</button>
            </div>
            {truckMenu&&(
              <div className="mb-4 space-y-3">
                <p className="text-xs font-black text-slate-500 uppercase tracking-wide">Add items</p>
                {Object.entries(menuGroups).map(([cat,items])=>(
                  <div key={cat}>
                    <p className="text-xs font-black text-orange-600 uppercase tracking-wide mb-1.5">{cat.charAt(0).toUpperCase()+cat.slice(1)}</p>
                    <div className="flex flex-wrap gap-2">
                      {items.map(item=>{
                        const inEdit=editItems.find(i=>i.name===item.name); const isSoldOut=!(item.available ?? true)
                        if(isSoldOut)return<div key={item.name} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-100 bg-slate-50 opacity-50"><span className="text-xs text-slate-400 line-through">{item.name}</span></div>
                        return(
                          <button key={item.name} onClick={()=>addEditItem(item)}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all ${inEdit?'bg-orange-600 border-orange-600 text-white':'bg-slate-50 border-slate-200 text-slate-700 hover:border-orange-300'}`}>
                            {inEdit&&<span className="text-orange-200">{inEdit.quantity}×</span>}
                            {item.name}<span className={inEdit?'text-orange-200':'text-slate-400'}> £{item.price.toFixed(2)}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {editItems.length>0&&(
              <div className="bg-slate-50 rounded-xl p-3 mb-4 space-y-2">
                <p className="text-xs font-black text-slate-500 uppercase tracking-wide">Order</p>
                {editItems.map((item,idx)=>(
                  <div key={idx} className="flex items-center gap-2">
                    <span className="flex-1 text-sm font-bold text-slate-900 truncate">{item.name}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={()=>setEditItems(prev=>prev.map((i,n)=>n===idx?{...i,quantity:i.quantity-1}:i).filter(i=>i.quantity>0))} className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center font-bold hover:bg-red-100 hover:text-red-600 text-sm">−</button>
                      <span className="w-4 text-center font-black text-sm">{item.quantity}</span>
                      <button onClick={()=>setEditItems(prev=>prev.map((i,n)=>n===idx?{...i,quantity:i.quantity+1}:i))} className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center font-bold hover:bg-orange-100 hover:text-orange-600 text-sm">+</button>
                    </div>
                    <span className="text-slate-500 text-xs w-12 text-right">£{(item.unit_price*item.quantity).toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 border-t border-slate-200">
                  <span className="text-slate-600 text-sm font-bold">New total</span>
                  <div className="text-right">
                    <span className="text-slate-900 font-black">£{editTotal.toFixed(2)}</span>
                    {editTotal!==editingOrder.total&&<span className={`text-xs ml-1.5 font-bold ${editTotal>editingOrder.total?'text-orange-500':'text-green-500'}`}>{editTotal>editingOrder.total?'+':''}{(editTotal-editingOrder.total).toFixed(2)}</span>}
                  </div>
                </div>
              </div>
            )}
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wide">Collection time</label>
              {slots.length>0?(
                <select value={editSlot} onChange={e=>setEditSlot(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
                  <option value="">No slot</option>
                  {slots.map(s=><option key={s.collection_time} value={s.collection_time}>{s.collection_time}</option>)}
                </select>
              ):(
                <input type="time" value={editSlot} onChange={e=>setEditSlot(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"/>
              )}
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

      {toast&&<div className={`fixed bottom-6 left-4 right-4 max-w-sm mx-auto rounded-xl px-4 py-3 text-sm font-bold text-center shadow-xl z-50 ${toast.type==='success'?'bg-green-600 text-white':'bg-red-600 text-white'}`}>{toast.msg}</div>}
    </div>
  )
}

// ─── Deals modal ──────────────────────────────────────────────────────────────