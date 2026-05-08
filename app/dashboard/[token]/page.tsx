'use client';
import { useState, useEffect, useCallback, useRef, useMemo, use } from 'react';
import Image from 'next/image';
import Link from 'next/link';

interface Order { id:string; customer_name:string; customer_phone:string|null; customer_email:string|null; slot:string|null; status:string; items:{name:string;quantity:number;unit_price:number}[]; deals:{name:string;slots:Record<string,string>}[]|null; total:number; notes:string|null; created_at:string }
interface Slot { collection_time:string; production_slot:string; current_orders:number; max_orders:number; available:boolean }
interface TruckData { id:string; name:string; mode:string; venue_name:string|null; logo:string|null }
interface MenuItem { name:string; description:string; price:number; category:string; available:boolean }
interface Bundle { name:string; description:string; original_price:number|null; bundle_price:number; available:boolean; start_time:string|null; end_time:string|null; slot_1_category:string|null; slot_2_category:string|null; slot_3_category:string|null; slot_4_category:string|null; slot_5_category:string|null; slot_6_category:string|null }
interface TruckMenu { items:MenuItem[]; bundles?:Bundle[] }
interface BasketItem { name:string; quantity:number; unit_price:number }
interface ItemStock { name:string; available:boolean; stock_count:number|null; orders_count:number; category:string|null }
interface CategoryStock { category:string; stock_count:number|null; orders_count:number }
interface AppliedDeal { bundle:Bundle; slots:Record<string,string> }

const STATUS: Record<string,{label:string;bg:string;text:string}> = {
  pending:{label:'New',bg:'bg-orange-100',text:'text-orange-700'},
  confirmed:{label:'Confirmed',bg:'bg-green-100',text:'text-green-700'},
  rejected:{label:'Rejected',bg:'bg-red-100',text:'text-red-600'},
  ready:{label:'Ready',bg:'bg-blue-100',text:'text-blue-700'},
  collected:{label:'Collected',bg:'bg-slate-100',text:'text-slate-500'},
  modified:{label:'Modified',bg:'bg-yellow-100',text:'text-yellow-700'},
}

function getAsapSlot(slots:Slot[]):Slot|null {
  const now=new Date(); const nowMins=now.getHours()*60+now.getMinutes()
  return slots.find(s=>{const[h,m]=s.collection_time.split(':').map(Number);return(h*60+m)>nowMins&&s.available})||null
}
// Default prep times per category — drinks/dips = 0, food = 4 mins
const DEFAULT_CATEGORY_TIMES:Record<string,number> = {
  pizzas:4, pizza:4, burgers:5, burger:5, mains:5,
  drinks:0, drink:0, dips:0, dip:0, sides:1, side:1, desserts:3, extras:0
}

function getCategoryTime(cat:string, customTimes?:Record<string,number>):number {
  const key=cat.toLowerCase()
  if(customTimes?.[key] !== undefined) return customTimes[key]
  return DEFAULT_CATEGORY_TIMES[key] ?? 4
}

function calcReadyTime(items:BasketItem[],waitMins:number,menuItems?:MenuItem[],customTimes?:Record<string,number>):string {
  if(!items.length) return ''
  // Group items by category, take max cook time approach
  // Total time = max(items in slowest category) + wait
  let maxCookMins=0
  if(menuItems) {
    const catGroups:Record<string,number>={} // cat -> total qty
    items.forEach(item=>{
      const mi=menuItems.find(m=>m.name===item.name)
      const cat=mi?.category||'mains'
      catGroups[cat]=(catGroups[cat]||0)+item.quantity
    })
    Object.entries(catGroups).forEach(([cat,qty])=>{
      const minsPerItem=getCategoryTime(cat,customTimes)
      const catTime=qty*minsPerItem
      if(catTime>maxCookMins) maxCookMins=catTime
    })
  } else {
    maxCookMins=Math.ceil(items.reduce((s,i)=>s+i.quantity,0)*3)
  }
  const totalMins=Math.max(1,maxCookMins)+waitMins
  const t=new Date(); t.setMinutes(t.getMinutes()+totalMins)
  return `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`
}

function calcMinsFromNow(items:BasketItem[],waitMins:number,menuItems?:MenuItem[],customTimes?:Record<string,number>):number {
  if(!items.length) return 0
  let maxCookMins=0
  if(menuItems) {
    const catGroups:Record<string,number>={}
    items.forEach(item=>{
      const mi=menuItems.find(m=>m.name===item.name)
      const cat=mi?.category||'mains'
      catGroups[cat]=(catGroups[cat]||0)+item.quantity
    })
    Object.entries(catGroups).forEach(([cat,qty])=>{
      const catTime=qty*getCategoryTime(cat,customTimes)
      if(catTime>maxCookMins) maxCookMins=catTime
    })
  } else {
    maxCookMins=Math.ceil(items.reduce((s,i)=>s+i.quantity,0)*3)
  }
  return Math.max(1,maxCookMins)+waitMins
}
function getBundleSlotCats(b:Bundle):string[] {
  return [b.slot_1_category,b.slot_2_category,b.slot_3_category,b.slot_4_category,b.slot_5_category,b.slot_6_category].filter((s):s is string=>!!s)
}

function Toggle({on,onToggle}:{on:boolean;onToggle:()=>void}) {
  return (
    <button onClick={onToggle} title={on?'Available — tap to mark sold out':'Sold out — tap to restore'}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${on?'bg-green-500':'bg-slate-300'}`}>
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${on?'translate-x-6':'translate-x-1'}`}/>
    </button>
  )
}

function Btn({label,colour,loading,onClick}:{label:string;colour:string;loading:boolean;onClick:()=>void}) {
  const c:Record<string,string>={green:'bg-green-600 hover:bg-green-700 text-white',red:'bg-red-500 hover:bg-red-600 text-white',blue:'bg-blue-600 hover:bg-blue-700 text-white',slate:'bg-slate-500 hover:bg-slate-600 text-white',orange:'bg-orange-100 text-orange-700 hover:bg-orange-200 border border-orange-200'}
  return <button onClick={onClick} disabled={loading} className={`${c[colour]||c.slate} font-bold text-sm px-4 py-2 rounded-xl transition-colors active:scale-95 disabled:opacity-50 flex-1 min-w-[72px]`}>{loading?'...':label}</button>
}

function InlinePriceEditor({price,quantity,onChange}:{price:number;quantity:number;onChange:(p:number)=>void}) {
  const[editing,setEditing]=useState(false)
  const[val,setVal]=useState(price.toFixed(2))
  if(editing) return(
    <div className="flex items-center gap-1 shrink-0">
      <span className="text-slate-400 text-xs">£</span>
      <input type="number" value={val} step="0.50" min="0" autoFocus
        onChange={e=>setVal(e.target.value)}
        onBlur={()=>{onChange(parseFloat(val)||0);setEditing(false)}}
        onKeyDown={e=>{if(e.key==='Enter'){onChange(parseFloat(val)||0);setEditing(false)}}}
        className="w-16 border border-orange-400 rounded-lg px-1.5 py-1 text-sm font-bold text-slate-900 focus:outline-none text-center"/>
    </div>
  )
  return(
    <button
      onClick={()=>{setVal(price.toFixed(2));setEditing(true)}}
      className="flex items-center gap-1.5 shrink-0 text-right group"
      title="Tap to override price"
    >
      <span className="text-slate-700 font-bold text-sm">£{(price*quantity).toFixed(2)}</span>
      {/* Pencil icon — larger tap target, clearer affordance */}
      <span className="text-slate-300 group-hover:text-orange-400 transition-colors text-xs leading-none" aria-hidden>✏</span>
    </button>
  )
}

function OrderCard({order,truck,slots,actionLoading,onAction,onEdit}:{order:Order;truck:TruckData|null;slots:Slot[];actionLoading:string|null;onAction:(a:string,id:string)=>void;onEdit:(o:Order)=>void}) {
  const[expanded,setExpanded]=useState(true)
  const s=STATUS[order.status]||STATUS.pending
  const isPub=truck?.mode==='pub'

  const urgency=useMemo(()=>{
    if(!order.slot||!['pending','confirmed'].includes(order.status)) return 'normal'
    const[h,m]=order.slot.split(':').map(Number)
    const diff=(h*60+m)-(new Date().getHours()*60+new Date().getMinutes())
    if(diff<=0) return 'overdue'
    if(diff<=10) return 'urgent'
    return 'normal'
  },[order.slot,order.status])

  const borderClass=urgency==='overdue'?'border-red-500':urgency==='urgent'?'border-yellow-400':order.status==='pending'?'border-orange-400':'border-slate-200'

  // Item summary for collapsed view
  const itemSummary=order.items.map(i=>`${i.quantity}× ${i.name}`).join(', ')

  return(
    <div className={`bg-white rounded-2xl overflow-hidden border shadow-sm ${borderClass}`}>
      {urgency==='overdue'&&<div className="bg-red-500 text-white text-[11px] font-black text-center py-1">⚠ OVERDUE</div>}
      {urgency==='urgent'&&<div className="bg-yellow-400 text-yellow-900 text-[11px] font-black text-center py-1">⏰ DUE SOON</div>}

      <button onClick={()=>setExpanded(e=>!e)} className="w-full text-left p-4 active:bg-slate-50 transition-colors">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-black text-slate-900 text-sm">#{order.id}</span>
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${s.bg} ${s.text}`}>{s.label}</span>
              {order.slot&&<span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${urgency==='overdue'?'bg-red-100 text-red-700':urgency==='urgent'?'bg-yellow-100 text-yellow-700':'bg-slate-100 text-slate-500'}`}>🕐 {order.slot}</span>}
              <span className="text-slate-600 font-bold text-xs truncate max-w-[120px]">{order.customer_name}</span>
            </div>
            {/* Always show items + notes in compact collapsed view */}
            {!expanded&&(
              <p className="text-slate-500 text-xs mt-0.5 truncate leading-tight">{itemSummary}</p>
            )}
            {!expanded&&order.notes&&(
              <p className="text-orange-600 text-xs font-medium truncate leading-tight">📝 {order.notes}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-black text-slate-900 text-sm">£{Number(order.total).toFixed(2)}</span>
            <span className="text-slate-400 text-xs">{expanded?'▲':'▼'}</span>
          </div>
        </div>
      </button>

      {expanded&&(
        <div className="px-4 pb-4 border-t border-slate-100 pt-3 bg-slate-50">
          <div className="space-y-1 mb-3">
            {order.items.map((item,i)=>(
              <div key={i} className="flex justify-between text-sm">
                <span className="text-slate-700 font-medium">{item.quantity}× {item.name}</span>
                <span className="text-slate-400 text-xs self-center">£{(item.unit_price*item.quantity).toFixed(2)}</span>
              </div>
            ))}
            {order.deals?.map((d,i)=><p key={i} className="text-xs text-orange-600 font-bold">🎁 {d.name}: {Object.values(d.slots).filter(Boolean).join(', ')}</p>)}
          </div>
          {order.notes&&<div className="bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 text-xs text-orange-700 mb-3 font-medium">📝 {order.notes}</div>}
          <div className="flex gap-2 flex-wrap">
            {order.status==='pending'&&<><Btn label="✓ Confirm" colour="green" loading={actionLoading===`confirm-${order.id}`} onClick={()=>onAction('confirm',order.id)}/><Btn label="✗ Reject" colour="red" loading={actionLoading===`reject-${order.id}`} onClick={()=>onAction('reject',order.id)}/></>}
            {order.status==='confirmed'&&isPub&&<Btn label="🍕 Ready" colour="blue" loading={actionLoading===`ready-${order.id}`} onClick={()=>onAction('ready',order.id)}/>}
            {order.status==='confirmed'&&!isPub&&<Btn label="✓ Collected" colour="slate" loading={actionLoading===`collected-${order.id}`} onClick={()=>onAction('collected',order.id)}/>}
            {order.status==='ready'&&<Btn label="✓ Collected" colour="slate" loading={actionLoading===`collected-${order.id}`} onClick={()=>onAction('collected',order.id)}/>}
            {order.status==='collected'&&<Btn label="↩ Undo" colour="slate" loading={actionLoading===`undo_collected-${order.id}`} onClick={()=>onAction('undo_collected',order.id)}/>}
            {['pending','confirmed','modified'].includes(order.status)&&<Btn label="✏ Edit" colour="orange" loading={false} onClick={()=>onEdit(order)}/>}
          </div>
        </div>
      )}
    </div>
  )
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
  const[paused,setPaused]=useState(false)
  const[waitMinutes,setWaitMinutes]=useState(0)
  // Add order
  const[manualName,setManualName]=useState('')
  const[manualEmail,setManualEmail]=useState('')
  const[manualNotes,setManualNotes]=useState('')
  const[manualSlot,setManualSlot]=useState('')
  const[manualItems,setManualItems]=useState<BasketItem[]>([])
  const[appliedDeals,setAppliedDeals]=useState<AppliedDeal[]>([])
  // Deal modal
  const[showDealsModal,setShowDealsModal]=useState(false)
  const[showCompleted,setShowCompleted]=useState(false)
  const[categoryTimes,setCategoryTimes]=useState<Record<string,number>>({})
  const[showPrepList,setShowPrepList]=useState(false)
  const[activeDealBundle,setActiveDealBundle]=useState<Bundle|null>(null)
  const[dealSlotPicks,setDealSlotPicks]=useState<Record<string,string>>({})
  // Edit modal
  const[editingOrder,setEditingOrder]=useState<Order|null>(null)
  const[editItems,setEditItems]=useState<BasketItem[]>([])
  const[editSlot,setEditSlot]=useState('')
  const[editNotes,setEditNotes]=useState('')
  const prevPendingCount=useRef(0)
  const asapSlot=getAsapSlot(slots)

  const manualItemsSubtotal=manualItems.reduce((s,i)=>s+i.unit_price*i.quantity,0)
  const dealDiscount=appliedDeals.reduce((s,d)=>{
    const orig=Object.values(d.slots).reduce((sum,n)=>{const item=truckMenu?.items.find(i=>i.name===n);return sum+(item?.price||0)},0)
    return s+Math.max(0,orig-d.bundle.bundle_price)
  },0)
  const manualTotal=Math.max(0,manualItemsSubtotal-dealDiscount)
  const readyTime=calcReadyTime(manualItems,waitMinutes,truckMenu?.items,categoryTimes)
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
      setTruck(data.truck); setOrders(data.orders); setSlots(data.slots)
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

  const doAction=async(action:string,orderId:string)=>{
    setActionLoading(`${action}-${orderId}`)
    try{
      const res=await fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action,orderId})})
      const data=await res.json(); if(!res.ok)throw new Error(data.error)
      const labels:Record<string,string>={confirm:'confirmed',reject:'rejected',ready:'ready',collected:'collected',undo_collected:'restored'}
      showToast(`Order #${orderId} ${labels[action]||action}`); await fetchAll()
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

  const addMenuItem=(item:MenuItem)=>setManualItems(prev=>{const ex=prev.find(i=>i.name===item.name);return ex?prev.map(i=>i.name===item.name?{...i,quantity:i.quantity+1}:i):[...prev,{name:item.name,quantity:1,unit_price:item.price}]})
  const adjustManualQty=(name:string,delta:number)=>setManualItems(prev=>prev.map(i=>i.name===name?{...i,quantity:i.quantity+delta}:i).filter(i=>i.quantity>0))
  const resetManual=()=>{setManualName('');setManualEmail('');setManualNotes('');setManualSlot('');setManualItems([]);setAppliedDeals([]);setActiveDealBundle(null);setDealSlotPicks({})}

  const submitManual=async()=>{
    if(!manualName.trim()||!manualItems.length)return
    const effectiveSlot=manualSlot||asapSlot?.collection_time||null
    setActionLoading('manual')
    try{
      const res=await fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({token,pin,action:'manual',manualOrder:{customerName:manualName,customerPhone:null,customerEmail:manualEmail||null,slot:effectiveSlot,items:manualItems,deals:appliedDeals.map(d=>({name:d.bundle.name,slots:d.slots})),discountAmt:dealDiscount,total:manualTotal,notes:manualNotes||null}})})
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
    if(!cats.every(c=>dealSlotPicks[c])){showToast('Please select all items for this deal','error');return}

    // Always add 1 of each selected item — increment if already in basket
    const newItems=[...manualItems]
    cats.forEach(cat=>{
      const picked=dealSlotPicks[cat]
      if(!picked) return
      const existing=newItems.find(i=>i.name===picked)
      if(existing){
        existing.quantity+=1
      } else {
        const menuItem=truckMenu?.items.find(i=>i.name===picked)
        if(menuItem) newItems.push({name:menuItem.name,quantity:1,unit_price:menuItem.price})
      }
    })
    setManualItems(newItems)
    setAppliedDeals(prev=>[...prev,{bundle:activeDealBundle,slots:{...dealSlotPicks}}])
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

  const pendingOrders=orders.filter(o=>o.status==='pending')
  const confirmedOrders=orders.filter(o=>o.status==='confirmed')
  const otherOrders=orders.filter(o=>!['pending','confirmed'].includes(o.status))
  const menuGroups:Record<string,MenuItem[]>={}
  truckMenu?.items.forEach(item=>{if(!menuGroups[item.category])menuGroups[item.category]=[];menuGroups[item.category].push(item)})
  const editTotal=editItems.reduce((s,i)=>s+i.unit_price*i.quantity,0)

  return(
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-slate-900 px-4 py-3 sticky top-0 z-50 shadow-md">
        <div className="max-w-2xl mx-auto flex items-center justify-between relative">
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
            {pendingOrders.length>0&&<span className="bg-orange-500 text-white text-xs font-black px-2 py-0.5 rounded-full animate-pulse">{pendingOrders.length}</span>}
            <button onClick={()=>fetchAll()} className="text-slate-400 hover:text-white text-sm">↻</button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-slate-800 px-4 border-b border-slate-700">
        <div className="max-w-2xl mx-auto flex">
          {([['orders',`Orders${orders.filter(o=>['pending','confirmed'].includes(o.status)).length>0?` (${orders.filter(o=>['pending','confirmed'].includes(o.status)).length})`:''}`],['add','+ Add order'],['stock','Menu & Stock']] as [typeof activeTab,string][]).map(([tab,label])=>(
            <button key={tab} onClick={()=>setActiveTab(tab)} className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab===tab?'border-orange-500 text-white':'border-transparent text-slate-400 hover:text-white'}`}>{label}</button>
          ))}
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-4 pb-20">

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
              const activeOrders=orders.filter(o=>['pending','confirmed'].includes(o.status))
              const prepMap:Record<string,number>={}
              activeOrders.forEach(o=>o.items.forEach(i=>{prepMap[i.name]=(prepMap[i.name]||0)+i.quantity}))
              const prepItems=Object.entries(prepMap).sort((a,b)=>b[1]-a[1])
              return(
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-black text-amber-700 uppercase tracking-wide">📋 Prep needed now</p>
                    <button onClick={()=>setShowPrepList(false)} className="text-amber-400 hover:text-amber-700 text-sm font-bold">×</button>
                  </div>
                  {prepItems.length===0?(<p className="text-amber-600 text-sm">No active orders</p>):(
                    <div className="flex flex-wrap gap-2">
                      {prepItems.map(([name,qty])=>(
                        <span key={name} className="bg-white border border-amber-200 text-slate-900 font-black text-sm px-3 py-1.5 rounded-xl">{qty}× {name}</span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}
            {pendingOrders.length>0&&(
              <div className="mb-4">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">New — action needed</p>
                <div className="space-y-3">{pendingOrders.map(o=><OrderCard key={o.id} order={o} truck={truck} slots={slots} actionLoading={actionLoading} onAction={doAction} onEdit={startEdit}/>)}</div>
              </div>
            )}
            {confirmedOrders.length>0&&(
              <div className="mb-4">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Confirmed</p>
                <div className="space-y-3">{confirmedOrders.map(o=><OrderCard key={o.id} order={o} truck={truck} slots={slots} actionLoading={actionLoading} onAction={doAction} onEdit={startEdit}/>)}</div>
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
                          const isSoldOut=!item.available
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
                            return(
                              <div key={i} className="flex justify-between text-xs">
                                <div className="flex items-center gap-1">
                                  <span className="text-green-600 font-bold">🎁 {d.bundle.name}</span>
                                  <button onClick={()=>setAppliedDeals(prev=>prev.filter((_,n)=>n!==i))} className="text-slate-300 hover:text-red-500 ml-1 text-sm leading-none">×</button>
                                </div>
                                <span className="text-green-600 font-bold">-£{saving.toFixed(2)}</span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                      {/* Add deal button — always visible when deals available */}
                      {availableDeals.length>0&&(
                        <button onClick={()=>{
                          if(availableDeals.length===1){
                            openDealModal(availableDeals[0])
                          } else {
                            setActiveDealBundle(null);setDealSlotPicks({});setShowDealsModal(true)
                          }
                        }}
                          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-dashed border-orange-300 text-orange-600 hover:bg-orange-50 transition-colors text-sm font-bold active:scale-[0.99]">
                          <span>🎁</span>
                          <span>{appliedDeals.length>0?'+ Add another deal':'+ Apply a deal'}</span>
                          {appliedDeals.length>0&&<span className="text-xs text-orange-400 font-normal">({appliedDeals.length} applied)</span>}
                        </button>
                      )}
                      <div className="flex justify-between pt-2 border-t border-slate-200">
                        <span className="text-slate-600 text-sm font-bold">Total</span>
                        <span className="text-slate-900 font-black">£{manualTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  )}


                </div>
              ):<p className="text-slate-400 text-sm animate-pulse">Loading menu...</p>}
            </div>

            {/* STEP 2 — Collection time */}
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-2">2. When to collect?</p>
              <div className="flex gap-2">
                <div className={`flex-1 rounded-xl px-3 py-2.5 ${readyTime?'bg-green-50 border border-green-200':'bg-slate-100 border border-slate-100'}`}>
                  {(()=>{
                    const readyTime=calcReadyTime(manualItems,waitMinutes,truckMenu?.items,categoryTimes)
                    const hasItems=manualItems.length>0
                    const minsFromNow=hasItems?calcMinsFromNow(manualItems,waitMinutes,truckMenu?.items,categoryTimes):null
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
                            const isAvailable=stock?stock.available:item.available
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
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 text-xs text-slate-500 space-y-1">
              <p className="font-bold text-slate-700">How it works</p>
              <p>• Orange input: total for this category (e.g. 100 pizzas)</p>
              <p>• Small input: item override (e.g. only 8 Pepperoni)</p>
              <p>• Toggle: green = available, grey = sold out</p>
              <p>• Sold out items show with strikethrough to customers</p>
            </div>
            {/* Timing configuration per category */}
            {truckMenu&&Object.keys(menuGroups).length>0&&(
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mt-4">
                <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-1">Prep time per category</p>
                <p className="text-slate-400 text-xs mb-3">Set how many minutes each item takes per category. Drinks and dips should be 0. Used to estimate ready times.</p>
                <div className="space-y-2">
                  {Object.keys(menuGroups).map(cat=>{
                    const current=categoryTimes[cat]??DEFAULT_CATEGORY_TIMES[cat.toLowerCase()]??4
                    return(
                      <div key={cat} className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-700 capitalize">{cat}</span>
                        <div className="flex items-center gap-2">
                          <input type="number" min="0" max="30" value={current}
                            onChange={e=>setCategoryTimes(prev=>({...prev,[cat]:parseInt(e.target.value)||0}))}
                            className="w-14 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-center font-bold focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
                          />
                          <span className="text-xs text-slate-400">min/item</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Deals modal */}
      {showDealsModal&&(
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={e=>e.target===e.currentTarget&&(setShowDealsModal(false),setActiveDealBundle(null))}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <div>
                {activeDealBundle&&<button onClick={()=>setActiveDealBundle(null)} className="text-orange-600 text-sm font-bold flex items-center gap-1 mb-1">← Back</button>}
                <h3 className="font-black text-slate-900">{activeDealBundle?activeDealBundle.name:'Apply a deal'}</h3>
              </div>
              <button onClick={()=>{setShowDealsModal(false);setActiveDealBundle(null)}} className="text-slate-400 hover:text-slate-700 text-xl font-bold w-8 h-8 flex items-center justify-center shrink-0">×</button>
            </div>

            {!activeDealBundle?(
              // Deal list view
              <div className="space-y-3">
                <p className="text-xs text-slate-400 mb-3">Time windows are for reference only — deals can always be applied.</p>
                {availableDeals.map(bundle=>{
                  const cats=getBundleSlotCats(bundle)
                  const saving=bundle.original_price?bundle.original_price-bundle.bundle_price:null
                  const now=new Date(); const nowMins=now.getHours()*60+now.getMinutes()
                  const isActive=(()=>{
                    if(!bundle.start_time&&!bundle.end_time) return true
                    const startMins=bundle.start_time?parseInt(bundle.start_time.split(':')[0])*60+parseInt(bundle.start_time.split(':')[1]):0
                    const endMins=bundle.end_time?parseInt(bundle.end_time.split(':')[0])*60+parseInt(bundle.end_time.split(':')[1]):1440
                    return nowMins>=startMins&&nowMins<endMins
                  })()
                  return(
                    <button key={bundle.name} onClick={()=>openDealModal(bundle)}
                      className="w-full text-left border border-slate-200 rounded-xl p-3 hover:border-orange-300 hover:bg-orange-50 transition-all active:scale-[0.99]">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="font-black text-slate-900 text-sm">{bundle.name}</p>
                            {isActive
                              ? <span className="text-[10px] bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded-full">Active now</span>
                              : <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded-full">Outside hours</span>
                            }
                          </div>
                          <p className="text-slate-500 text-xs">{bundle.description}</p>
                          {(bundle.start_time||bundle.end_time)&&(
                            <p className="text-slate-400 text-xs mt-0.5">
                              {[bundle.start_time&&`${bundle.start_time}`,bundle.end_time&&`${bundle.end_time}`].filter(Boolean).join(' – ')}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-black text-orange-600">£{bundle.bundle_price.toFixed(2)}</p>
                          {saving&&saving>0&&<span className="text-[10px] bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded-full">Save £{saving.toFixed(2)}</span>}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {cats.map(cat=>{
                          const inBasket=manualItems.some(i=>{const mi=truckMenu?.items.find(m=>m.name===i.name);return mi?.category===cat})
                          return<span key={cat} className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${inBasket?'bg-green-100 text-green-700':'bg-slate-100 text-slate-500'}`}>{cat}{inBasket?' ✓':''}</span>
                        })}
                      </div>
                    </button>
                  )
                })}
              </div>
            ):(
              // Slot picker view — activeDealBundle is set
              <div>
                {(()=>{
                  const b=activeDealBundle!
                  const now=new Date(); const nowMins=now.getHours()*60+now.getMinutes()
                  const startMins=b.start_time?parseInt(b.start_time.split(':')[0])*60+parseInt(b.start_time.split(':')[1]):0
                  const endMins=b.end_time?parseInt(b.end_time.split(':')[0])*60+parseInt(b.end_time.split(':')[1]):1440
                  const isActive=(!b.start_time&&!b.end_time)||(nowMins>=startMins&&nowMins<endMins)
                  return(
                    <div className={`border rounded-xl p-3 mb-4 ${isActive?'bg-green-50 border-green-200':'bg-amber-50 border-amber-200'}`}>
                      <div className="flex items-center justify-between">
                        <p className="text-slate-700 text-xs font-bold">{b.description}</p>
                        <p className="font-black text-orange-600 text-sm">£{b.bundle_price.toFixed(2)}</p>
                      </div>
                      {(b.start_time||b.end_time)&&(
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${isActive?'bg-green-200 text-green-800':'bg-amber-200 text-amber-800'}`}>
                            {isActive?'Active now':'Outside hours'}
                          </span>
                          <span className="text-slate-400 text-xs">
                            {[b.start_time&&`${b.start_time}`,b.end_time&&`${b.end_time}`].filter(Boolean).join(' – ')}
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })()}
                <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-3">Select items for each slot</p>
                {getBundleSlotCats(activeDealBundle!).map(cat=>{
                  const allOpts=(truckMenu?.items||[]).filter(i=>i.category===cat)
                  const isFilled=!!dealSlotPicks[cat]
                  return(
                    <div key={cat} className="mb-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${isFilled?'bg-green-500 text-white':'bg-slate-200 text-slate-500'}`}>{isFilled?'✓':''}</span>
                        <label className="text-xs font-black text-slate-700 uppercase">{cat}</label>
                      </div>
                      <select value={dealSlotPicks[cat]||''} onChange={e=>setDealSlotPicks(prev=>({...prev,[cat]:e.target.value}))}
                        className={`w-full border rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 ${isFilled?'border-green-300':'border-slate-200'}`}>
                        <option value="">Choose {cat}…</option>
                        {allOpts.map(item=><option key={item.name} value={item.name}>{item.name} £{item.price.toFixed(2)}</option>)}
                      </select>
                    </div>
                  )
                })}
                {getBundleSlotCats(activeDealBundle!).every(c=>dealSlotPicks[c])&&(()=>{
                  const orig=Object.values(dealSlotPicks).reduce((sum,n)=>{const item=truckMenu?.items.find(i=>i.name===n);return sum+(item?.price||0)},0)
                  const saving=Math.max(0,orig-activeDealBundle!.bundle_price)
                  return saving>0?(
                    <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4 text-center">
                      <p className="text-green-700 font-black text-sm">Save £{saving.toFixed(2)}</p>
                      <p className="text-green-600 text-xs">£{orig.toFixed(2)} → £{activeDealBundle!.bundle_price.toFixed(2)}</p>
                    </div>
                  ):null
                })()}
                <div className="flex gap-2">
                  <button onClick={()=>setActiveDealBundle(null)} className="flex-1 bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl hover:bg-slate-200 text-sm">Cancel</button>
                  <button onClick={applyDeal} disabled={!activeDealBundle||!getBundleSlotCats(activeDealBundle).every(c=>dealSlotPicks[c])}
                    className="flex-1 bg-orange-600 text-white font-bold py-2.5 rounded-xl hover:bg-orange-700 text-sm disabled:opacity-40">
                    Apply deal
                  </button>
                </div>
              </div>
            )}
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
            {truckMenu&&(
              <div className="mb-4 space-y-3">
                <p className="text-xs font-black text-slate-500 uppercase tracking-wide">Add items</p>
                {Object.entries(menuGroups).map(([cat,items])=>(
                  <div key={cat}>
                    <p className="text-xs font-black text-orange-600 uppercase tracking-wide mb-1.5">{cat.charAt(0).toUpperCase()+cat.slice(1)}</p>
                    <div className="flex flex-wrap gap-2">
                      {items.map(item=>{
                        const inEdit=editItems.find(i=>i.name===item.name); const isSoldOut=!item.available
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

function DealsModal({ bundles, menuItems, basketItems, onApply, onClose }: {
  bundles: any[]
  menuItems: MenuItem[]
  basketItems: BasketItem[]
  onApply: (deal: any, slots: Record<string,string>, dealPrice: number, discountAmt: number) => void
  onClose: () => void
}) {
  const [selectedDeal, setSelectedDeal] = useState<any>(bundles.length === 1 ? bundles[0] : null)
  const [slotSelections, setSlotSelections] = useState<Record<string,string>>({})

  // Auto-prefill slots when single deal is auto-selected
  useEffect(() => {
    if (bundles.length === 1) {
      const bundle = bundles[0]
      const prefill: Record<string,string> = {}
      const slotKeys = ['slot_1_category','slot_2_category','slot_3_category','slot_4_category','slot_5_category','slot_6_category']
      slotKeys.forEach((k, idx) => {
        const cat = bundle[k]; if (!cat) return
        const match = basketItems.find(b => { const m = menuItems.find(mi => mi.name === b.name); return m?.category === cat })
        if (match) prefill[`slot_${idx+1}`] = match.name
      })
      setSlotSelections(prefill)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectDeal = (bundle: any) => {
    setSelectedDeal(bundle)
    // Pre-fill slots from basket where possible
    const prefill: Record<string,string> = {}
    const slots = ['slot_1_category','slot_2_category','slot_3_category','slot_4_category','slot_5_category','slot_6_category']
    slots.forEach((slotKey, idx) => {
      const cat = bundle[slotKey]
      if (!cat) return
      const matchInBasket = basketItems.find(b => {
        const menuItem = menuItems.find(m => m.name === b.name)
        return menuItem?.category === cat
      })
      if (matchInBasket) prefill[`slot_${idx+1}`] = matchInBasket.name
    })
    setSlotSelections(prefill)
  }

  if (!selectedDeal) {
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4"
        onClick={e => e.target===e.currentTarget && onClose()}>
        <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl max-h-[80vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-black text-slate-900">Choose a deal</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl font-bold w-8 h-8 flex items-center justify-center">×</button>
          </div>
          <p className="text-xs text-slate-400 mb-4">All deals available regardless of time — time windows shown for info only.</p>
          <div className="space-y-3">
            {bundles.map((bundle: any) => {
              // Calculate original price from slots if not set
              const slots = ['slot_1_category','slot_2_category','slot_3_category','slot_4_category','slot_5_category','slot_6_category']
              const slotCats = slots.map(k => bundle[k]).filter(Boolean)
              const calcOriginal = slotCats.reduce((total: number, cat: string) => {
                const cheapest = menuItems.filter(m => m.category === cat).sort((a,b) => a.price-b.price)[0]
                return total + (cheapest?.price || 0)
              }, 0)
              const originalPrice = bundle.original_price || calcOriginal
              const saving = originalPrice > bundle.bundle_price ? originalPrice - bundle.bundle_price : 0

              return (
                <button key={bundle.name} onClick={() => selectDeal(bundle)}
                  className="w-full text-left border border-slate-200 rounded-xl p-3 bg-slate-50 hover:border-orange-300 hover:bg-orange-50 transition-all">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="font-black text-slate-900 text-sm">{bundle.name}</p>
                      <p className="text-slate-500 text-xs mt-0.5">{bundle.description}</p>
                      <p className="text-xs text-slate-400 mt-1">{slotCats.map((c:string) => c.charAt(0).toUpperCase()+c.slice(1)).join(' + ')}</p>
                      {(bundle.start_time || bundle.end_time) && (
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {[bundle.start_time&&`from ${bundle.start_time}`, bundle.end_time&&`until ${bundle.end_time}`].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="font-black text-orange-600">£{bundle.bundle_price.toFixed(2)}</p>
                      {saving > 0 && (
                        <span className="text-[10px] bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded-full">Save £{saving.toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // Selected deal — choose items for each slot
  const slots = ['slot_1_category','slot_2_category','slot_3_category','slot_4_category','slot_5_category','slot_6_category']
  const activeSlots = slots.map((k,i) => ({ key:`slot_${i+1}`, cat: selectedDeal[k] })).filter(s => s.cat)
  const allFilled = activeSlots.every(s => slotSelections[s.key])

  // Calc saving
  const originalFromSlots = activeSlots.reduce((t, s) => {
    const sel = slotSelections[s.key]
    const item = menuItems.find(m => m.name === sel)
    return t + (item?.price || 0)
  }, 0)
  const saving = originalFromSlots > selectedDeal.bundle_price ? originalFromSlots - selectedDeal.bundle_price : 0

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => setSelectedDeal(null)} className="text-slate-400 hover:text-slate-700 font-bold text-lg">←</button>
          <h3 className="font-black text-slate-900 flex-1">{selectedDeal.name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl font-bold w-8 h-8 flex items-center justify-center">×</button>
        </div>

        <div className="space-y-3 mb-4">
          {activeSlots.map(({ key, cat }) => {
            const itemsForCat = menuItems.filter(m => m.category === cat)
            const selected = slotSelections[key]
            return (
              <div key={key}>
                <label className="block text-xs font-black text-orange-600 uppercase tracking-wide mb-1">
                  {cat.charAt(0).toUpperCase()+cat.slice(1)}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {itemsForCat.map(item => (
                    <button key={item.name}
                      onClick={() => setSlotSelections(prev => ({...prev, [key]: item.name}))}
                      className={`px-3 py-1.5 rounded-xl border text-sm font-bold transition-all ${selected===item.name ? 'bg-orange-600 text-white border-orange-600' : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-orange-300'}`}>
                      {item.name}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Price summary */}
        <div className="bg-slate-50 rounded-xl p-3 mb-4 space-y-1">
          {activeSlots.map(({ key, cat }) => {
            const item = menuItems.find(m => m.name === slotSelections[key])
            return slotSelections[key] ? (
              <div key={key} className="flex justify-between text-sm">
                <span className="text-slate-600">{slotSelections[key]}</span>
                <span className="text-slate-400 line-through text-xs self-center">£{item?.price.toFixed(2)}</span>
              </div>
            ) : null
          })}
          {saving > 0 && (
            <div className="flex justify-between text-sm text-green-600 font-bold pt-1 border-t border-slate-200">
              <span>Saving</span><span>-£{saving.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between font-black pt-1 border-t border-slate-200">
            <span className="text-slate-900">Deal price</span>
            <span className="text-orange-600">£{selectedDeal.bundle_price.toFixed(2)}</span>
          </div>
        </div>

        <button
          onClick={() => {
            if (!allFilled) return
            onApply(selectedDeal, slotSelections, selectedDeal.bundle_price, saving)
          }}
          disabled={!allFilled}
          className="w-full bg-orange-600 text-white font-black py-3 rounded-xl hover:bg-orange-700 transition-colors disabled:opacity-40"
        >
          {allFilled ? `Apply deal · £${selectedDeal.bundle_price.toFixed(2)}` : 'Select all items to continue'}
        </button>
      </div>
    </div>
  )
}