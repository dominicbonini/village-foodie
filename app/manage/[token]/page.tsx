'use client'
// app/manage/[token]/page.tsx
// Truck management page — menu, modifiers, deals, schedule, settings

import { useState, useEffect, useCallback, use } from 'react'
import Image from 'next/image'
import { PLAN_META, canAccess, maxVans } from '@/lib/features'
import type { Plan, Feature } from '@/lib/features'
import { FeatureGate } from '@/components/FeatureGate'
import type { TruckEvent } from '@/components/dashboard/types'
import { Tooltip } from '@/components/ui/Tooltip'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

// ── Types ─────────────────────────────────────────────────────
interface Truck { id: string; name: string; description: string | null; cuisine_type: string | null; logo_storage_path: string | null; contact_email: string | null; contact_phone: string | null; social_instagram: string | null; social_facebook: string | null; auto_accept: boolean; dashboard_token: string; crew_mode: 'solo' | 'full'; kds_mode: boolean; keep_screen_on: boolean; plan: Plan; feature_overrides: Record<string, boolean> | null; trial_expires_at: string | null; whatsapp_sender: string | null }
interface Category { id: string; name: string; slug: string; prep_secs: number; batch_size: number; allow_notes: boolean; sort_order: number; is_active: boolean }
interface Item { id: string; name: string; description: string | null; price: number; category_id: string | null; is_available: boolean; stock_count: number | null; sort_order: number; image_path: string | null }
interface ModifierGroup { id: string; name: string; is_required: boolean; min_choices: number; max_choices: number }
interface ModifierOption { id: string; group_id: string; name: string; price_adjustment: number; type: string; sort_order: number }
interface Bundle { id: string; name: string; description: string | null; bundle_price: number; original_price: number | null; is_available: boolean; apply_to_new_events: boolean; start_time: string | null; end_time: string | null; slot_1_category: string | null; slot_2_category: string | null; slot_3_category: string | null; slot_4_category: string | null; slot_5_category: string | null; slot_6_category: string | null }
interface Van { id: string; truck_id: string; name: string; kds_token: string; active: boolean; auto_pause_on_offline: boolean }
interface TeamMember { id: string; email: string; name: string | null; role: 'owner' | 'manager' | 'staff'; accepted_at: string | null; van_names?: string[] }

type Tab = 'menu' | 'modifiers' | 'deals' | 'schedule' | 'team' | 'settings'

// ── Helpers ────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
function imgUrl(path: string | null) {
  if (!path) return null
  return `${SUPABASE_URL}/storage/v1/object/public/truck-media/${path}`
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

// ── Small UI components ────────────────────────────────────────
function Spinner() { return <div className="w-5 h-5 border-2 border-slate-200 border-t-orange-500 rounded-full animate-spin" /> }
function Badge({ label, colour }: { label: string; colour: 'green' | 'slate' | 'orange' | 'red' }) {
  const c = { green: 'bg-green-100 text-green-700', slate: 'bg-slate-100 text-slate-500', orange: 'bg-orange-100 text-orange-700', red: 'bg-red-100 text-red-600' }[colour]
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c}`}>{label}</span>
}
function Btn({ label, colour = 'orange', size = 'md', loading = false, disabled = false, onClick, icon }: { label: string; colour?: string; size?: 'sm' | 'md'; loading?: boolean; disabled?: boolean; onClick?: () => void; icon?: string }) {
  const colours: Record<string, string> = {
    orange: 'bg-orange-600 hover:bg-orange-700 text-white',
    red:    'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200',
    slate:  'bg-slate-100 hover:bg-slate-200 text-slate-700',
    green:  'bg-green-600 hover:bg-green-700 text-white',
    ghost:  'hover:bg-slate-100 text-slate-600 border border-slate-200',
  }
  const sizes = { sm: 'text-xs px-2.5 py-1.5', md: 'text-sm px-4 py-2' }
  return (
    <button onClick={onClick} disabled={disabled || loading}
      className={`${colours[colour] || colours.orange} ${sizes[size]} font-bold rounded-xl transition-colors active:scale-95 disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap`}>
      {loading ? <Spinner /> : icon ? <span>{icon}</span> : null}
      {label}
    </button>
  )
}
function Input({ label, value, onChange, type = 'text', placeholder, required, hint }: { label: string; value: string | number; onChange: (v: string) => void; type?: string; placeholder?: string; required?: boolean; hint?: string }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-600 mb-1">{label}{required && <span className="text-red-400 ml-0.5">*</span>}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" />
      {hint && <p className="text-slate-400 text-xs mt-0.5">{hint}</p>}
    </div>
  )
}
function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label?: string }) {
  return (
    <button onClick={onToggle} className="flex items-center gap-2 group">
      <div className={`relative w-10 h-5 rounded-full transition-colors ${on ? 'bg-green-500' : 'bg-slate-300'}`}>
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </div>
      {label && <span className="text-sm text-slate-600 font-medium group-hover:text-slate-900">{label}</span>}
    </button>
  )
}
function Toast({ msg, type, onClose }: { msg: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t) }, [onClose])
  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl shadow-lg text-sm font-bold text-white ${type === 'success' ? 'bg-green-600' : 'bg-red-500'}`}>
      {type === 'success' ? '✓' : '✗'} {msg}
    </div>
  )
}
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${className}`}>{children}</div>
}
function EmptyState({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="text-center py-12">
      <p className="text-4xl mb-3">{icon}</p>
      <p className="font-bold text-slate-700 mb-1">{title}</p>
      <p className="text-slate-400 text-sm">{body}</p>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────
export default function ManagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [activeTab, setActiveTab] = useState<Tab>('menu')
  const [truck, setTruck] = useState<Truck | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([])
  const [modifierOptions, setModifierOptions] = useState<ModifierOption[]>([])
  const [categoryModGroups, setCategoryModGroups] = useState<{category_id:string;group_id:string}[]>([])
  const [bundles, setBundles] = useState<Bundle[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{msg:string;type:'success'|'error'}|null>(null)
  const [currentUserName, setCurrentUserName] = useState<string | null>(null)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => setToast({ msg, type })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/manage?token=${token}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setTruck(data.truck)
      setCategories(data.categories)
      setItems(data.items)
      setModifierGroups(data.modifierGroups)
      setModifierOptions(data.modifierOptions)
      setCategoryModGroups(data.categoryModGroups)
      setBundles(data.bundles)
    } catch (e: any) { showToast(e.message || 'Failed to load', 'error') }
    finally { setLoading(false) }
  }, [token])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => setCurrentUserName(d.name ?? null)).catch(() => null)
  }, [])

  const handleSignOut = async () => {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const api = async (action: string, extra: Record<string, any> = {}) => {
    const res = await fetch('/api/manage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action, ...extra }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed')
    return data
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center"><Spinner /><p className="text-slate-400 text-sm mt-3">Loading management console...</p></div>
    </div>
  )

  if (!truck) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <p className="text-red-500 font-bold">Invalid or expired token</p>
    </div>
  )

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'menu',      label: 'Menu',      icon: '🍕' },
    { id: 'modifiers', label: 'Modifiers', icon: '⚙️' },
    { id: 'deals',     label: 'Deals',     icon: '🎁' },
    { id: 'schedule',  label: 'Schedule',  icon: '📅' },
    { id: 'team',      label: 'Team',      icon: '👥' },
    { id: 'settings',  label: 'Settings',  icon: '🔧' },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-[#0f1923] text-white sticky top-0 z-30 shadow">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {truck.logo_storage_path && (
              <Image src={imgUrl(truck.logo_storage_path)!} alt="" width={32} height={32} className="rounded-full object-cover w-8 h-8" />
            )}
            <div>
              <p className="font-black text-white text-sm leading-tight">{truck.name}</p>
              <p className="text-slate-400 text-[10px]">Management console</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a href={`/dashboard/${token}`} className="text-xs text-slate-400 hover:text-orange-400 font-bold transition-colors hidden sm:block">← Orders dashboard</a>
            {currentUserName && (
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center text-xs font-semibold text-orange-700">
                  {currentUserName.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm text-slate-300 hidden sm:inline">{currentUserName}</span>
              </div>
            )}
            <button onClick={handleSignOut} className="text-xs text-slate-400 hover:text-white">Sign out</button>
          </div>
        </div>
        {/* Tabs */}
        <div className="max-w-5xl mx-auto px-4 flex gap-1 pb-0 overflow-x-auto">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-bold whitespace-nowrap border-b-2 transition-colors ${activeTab === t.id ? 'border-orange-500 text-white' : 'border-transparent text-slate-400 hover:text-white'}`}>
              <span>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {activeTab === 'menu'      && <MenuTab      truck={truck} categories={categories} items={items} api={api} reload={load} showToast={showToast} />}
        {activeTab === 'modifiers' && <ModifiersTab categories={categories} modifierGroups={modifierGroups} modifierOptions={modifierOptions} categoryModGroups={categoryModGroups} api={api} reload={load} showToast={showToast} />}
        {activeTab === 'deals'     && <DealsTab     categories={categories} bundles={bundles} setBundles={setBundles} api={api} reload={load} showToast={showToast} />}
        {activeTab === 'schedule'  && <ScheduleTab  token={token} bundles={bundles} api={api} reload={load} showToast={showToast} />}
        {activeTab === 'team'      && <TeamTab      truck={truck} token={token} api={api} reload={load} showToast={showToast} />}
        {activeTab === 'settings'  && <SettingsTab  truck={truck} token={token} api={api} reload={load} showToast={showToast} />}
      </main>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// MENU TAB
// ══════════════════════════════════════════════════════════════
function MenuTab({ truck, categories, items, api, reload, showToast }: {
  truck: Truck; categories: Category[]; items: Item[]
  api: (a: string, e?: any) => Promise<any>; reload: () => void; showToast: (m: string, t?: any) => void
}) {
  const [editingCat, setEditingCat] = useState<Partial<Category> | null>(null)
  const [editingItem, setEditingItem] = useState<Partial<Item> | null>(null)
  const [saving, setSaving] = useState(false)
  const [expandedCat, setExpandedCat] = useState<string | null>(categories[0]?.id || null)

  const saveCat = async (overrides?: Partial<Category>) => {
    const data = { ...(editingCat || {}), ...overrides } as Partial<Category>
    if (!data?.name) return
    setSaving(true)
    try {
      await api('upsert_category', { id: data.id, name: data.name, prep_secs: data.prep_secs || 0, batch_size: data.batch_size || 0, allow_notes: !!(data as any).allow_notes })
      if (!data.id) { setEditingCat(null) } // only close for new category modal
      reload()
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  const saveItem = async () => {
    if (!editingItem?.name || !editingItem?.price) return
    setSaving(true)
    try {
      await api('upsert_item', editingItem)
      showToast(editingItem.id ? 'Item updated' : 'Item added')
      setEditingItem(null); reload()
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  const toggleItem = async (item: Item) => {
    try {
      await api('toggle_item', { id: item.id, is_available: !item.is_available })
      reload()
    } catch (e: any) { showToast(e.message, 'error') }
  }

  const deleteItem = async (id: string) => {
    if (!confirm('Remove this item?')) return
    try { await api('delete_item', { id }); reload(); showToast('Item removed') }
    catch (e: any) { showToast(e.message, 'error') }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-slate-900 text-lg">Menu</h2>
          <p className="text-slate-400 text-sm">{categories.length} categories · {items.length} items</p>
        </div>
        <Btn label="+ Add category" onClick={() => setEditingCat({ prep_secs: 0, batch_size: 0, allow_notes: false } as any)} />
      </div>

      {/* Category list */}
      {categories.length === 0 && (
        <EmptyState icon="🍕" title="No categories yet" body="Add a category (e.g. Pizza, Burgers, Drinks) to start building your menu" />
      )}

      {categories.map((cat, index) => {
        const catItems = items.filter(i => i.category_id === cat.id)
        const isOpen = expandedCat === cat.id
        return (
          <div
            key={cat.id}
            draggable
            onDragStart={(e: React.DragEvent<HTMLDivElement>) => {
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/html', cat.id)
              const target = e.currentTarget as HTMLElement
              target.style.opacity = '0.5'
              target.style.border = '2px dashed #fb923c'
            }}
            onDragEnd={(e: React.DragEvent<HTMLDivElement>) => {
              const target = e.currentTarget as HTMLElement
              target.style.opacity = '1'
              target.style.border = ''
            }}
            onDragOver={(e: React.DragEvent<HTMLDivElement>) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              const target = e.currentTarget as HTMLElement
              target.style.borderTop = '3px solid #fb923c'
            }}
            onDragLeave={(e: React.DragEvent<HTMLDivElement>) => {
              const target = e.currentTarget as HTMLElement
              target.style.borderTop = ''
            }}
            onDrop={async (e: React.DragEvent<HTMLDivElement>) => {
              e.preventDefault()
              const target = e.currentTarget as HTMLElement
              target.style.borderTop = ''
              
              const draggedId = e.dataTransfer.getData('text/html')
              if (draggedId === cat.id) return
              
              const draggedIndex = categories.findIndex(c => c.id === draggedId)
              const targetIndex = index
              
              // Reorder categories array
              const newCategories = [...categories]
              const [removed] = newCategories.splice(draggedIndex, 1)
              newCategories.splice(targetIndex, 0, removed)
              
              // Update sort_order in database
              try {
                await Promise.all(
                  newCategories.map((c, i) => 
                    api('update_category_order', { id: c.id, sort_order: i + 1 })
                  )
                )
                reload()
                showToast('Category order updated')
              } catch (e: any) {
                showToast(e.message, 'error')
              }
            }}
            className="transition-all duration-200"
          >
            <Card>
            {/* Category header */}
            <div 
              className="flex items-center gap-3 p-4 hover:bg-slate-50 transition-colors" 
              onClick={(e) => {
                // Only toggle if not clicking drag handle or edit button
                if (!(e.target as HTMLElement).closest('button')) {
                  setExpandedCat(isOpen ? null : cat.id)
                }
              }}>
              <div className="text-slate-600 hover:text-slate-900 cursor-grab active:cursor-grabbing text-xl font-bold select-none" title="Drag to reorder" draggable={false}>
                ⋮⋮
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-slate-900">{cat.name}</span>
                  <span className="text-slate-400 text-xs">{catItems.length} item{catItems.length !== 1 ? 's' : ''}</span>
                  <span className="text-[11px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{Math.round(cat.prep_secs / 60)}m prep</span>
                  <span className="text-[11px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">batch {cat.batch_size}</span>
                  {cat.allow_notes && <span className="text-[11px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Notes on</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={e => { e.stopPropagation(); setEditingCat(editingCat?.id === cat.id ? null : cat) }}
                  className={`text-xs font-bold px-2 py-1 rounded-lg transition-colors ${editingCat?.id === cat.id ? 'bg-orange-100 text-orange-600' : 'text-slate-400 hover:text-orange-600 hover:bg-orange-50'}`}>
                  {editingCat?.id === cat.id ? '✕ Close' : 'Edit'}
                </button>
                <span className="text-slate-400 text-xs">{isOpen ? '▲' : '▼'}</span>
              </div>
            </div>

            {/* Inline category edit accordion — auto-saves on blur / toggle */}
            {editingCat?.id === cat.id && (
              <div className="border-t border-orange-100 bg-orange-50/40 px-4 py-3 space-y-2">
                {/* Row 1: Name + Allow notes toggle */}
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={editingCat.name || ''}
                    onChange={e => setEditingCat(p => ({...p!, name: e.target.value}))}
                    onBlur={() => saveCat()}
                    placeholder="Category name"
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
                  />
                  <label className="flex items-center gap-2 shrink-0 cursor-pointer select-none">
                    <span className="text-xs font-bold text-slate-600 whitespace-nowrap">Allow notes</span>
                    <Toggle
                      on={!!(editingCat as any).allow_notes}
                      onToggle={() => {
                        const newVal = !(editingCat as any).allow_notes
                        setEditingCat(p => ({...p!, allow_notes: newVal} as any))
                        saveCat({ allow_notes: newVal } as any)
                      }}
                    />
                  </label>
                </div>
                {/* Row 2: Prep time + Batch size */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Prep time (mins)</label>
                    <input type="number" min="0" max="60" placeholder="0 = instant"
                      value={editingCat.prep_secs ? Math.round(editingCat.prep_secs / 60) : ''}
                      onChange={e => setEditingCat(p => ({...p!, prep_secs: parseInt(e.target.value) * 60 || 0}))}
                      onBlur={() => saveCat()}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Batch size</label>
                    <input type="number" min="1" max="20" placeholder="e.g. 3"
                      value={editingCat.batch_size || ''}
                      onChange={e => setEditingCat(p => ({...p!, batch_size: parseInt(e.target.value) || 0}))}
                      onBlur={() => saveCat()}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" />
                  </div>
                </div>
              </div>
            )}

            {/* Items */}
            {isOpen && (
              <div className="border-t border-slate-100">
                {catItems.map(item => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                    {/* Item image */}
                    <label className="w-10 h-10 rounded-lg bg-slate-100 overflow-hidden shrink-0 cursor-pointer hover:opacity-80 transition-opacity block" title="Click to upload photo">
                      {item.image_path
                        ? <img src={imgUrl(item.image_path)!} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-slate-300 text-lg">📷</div>
                      }
                      <input type="file" accept="image/*" className="sr-only" onChange={async e => {
                        const file = e.target.files?.[0]; if(!file) return
                        try {
                          const { upload_url, path } = await api('get_upload_url', { filename: file.name, content_type: file.type })
                          await fetch(upload_url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
                          await api('upsert_item', { id: item.id, image_path: path })
                          reload()
                          showToast('Photo updated')
                        } catch(err: any) { showToast(err.message, 'error') }
                      }} />
                    </label>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900 text-sm truncate">{item.name}</p>
                      {item.description && <p className="text-slate-400 text-xs truncate">{item.description}</p>}
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-black text-orange-600 text-sm">£{Number(item.price).toFixed(2)}</span>
                        {item.stock_count !== null && <Badge label={`Stock: ${item.stock_count}`} colour="orange" />}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Toggle on={item.is_available} onToggle={() => toggleItem(item)} />
                      <button onClick={() => setEditingItem(item)} className="text-slate-400 hover:text-orange-600 text-xs font-bold p-1.5 rounded-lg hover:bg-orange-50 transition-colors">✏️</button>
                      <button onClick={() => deleteItem(item.id)} className="text-slate-300 hover:text-red-500 text-xs p-1.5 rounded-lg hover:bg-red-50 transition-colors">🗑️</button>
                    </div>
                  </div>
                ))}

                <div className="px-4 py-3">
                  <Btn label="+ Add item" size="sm" colour="ghost" onClick={() => setEditingItem({ category_id: cat.id, is_available: true, price: 0 })} />
                </div>
              </div>
            )}
          </Card>
          </div>
        )
      })}

      {/* Add Category Modal — new categories only, existing use inline accordion above */}
      {editingCat && !editingCat.id && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => {}}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <h3 className="font-black text-slate-900 mb-4">New category</h3>
            <div className="space-y-3">
              <Input label="Category name" required value={editingCat.name || ''} onChange={v => setEditingCat(p => ({...p!, name: v}))} placeholder="e.g. Pizza" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Prep time (mins)</label>
                  <input type="number" min="0" max="60" placeholder="0 = instant" value={editingCat.prep_secs ? Math.round(editingCat.prep_secs / 60) : ""}
                    onChange={e => setEditingCat(p => ({...p!, prep_secs: parseInt(e.target.value) * 60 || 0}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Batch size</label>
                  <input type="number" min="1" max="20" value={editingCat.batch_size || ""} placeholder="e.g. 3"
                    onChange={e => setEditingCat(p => ({...p!, batch_size: parseInt(e.target.value) || 0}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <div>
                  <p className="text-sm font-bold text-slate-700">Allow custom notes</p>
                  <p className="text-xs text-slate-400">Customers can add special instructions</p>
                </div>
                <Toggle on={!!(editingCat as any).allow_notes} onToggle={() => setEditingCat(p => ({...p!, allow_notes: !(p as any).allow_notes} as any))} />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Btn label="Cancel" colour="slate" onClick={() => setEditingCat(null)} />
              <Btn label={saving ? 'Saving...' : 'Save'} loading={saving} onClick={saveCat} />
            </div>
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => {}}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="font-black text-slate-900 mb-4">{editingItem.id ? 'Edit item' : 'New item'}</h3>
            <div className="space-y-3">
              <Input label="Item name" required value={editingItem.name || ''} onChange={v => setEditingItem(p => ({...p!, name: v}))} placeholder="e.g. Margherita" />
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Ingredients <span className="text-slate-400 font-normal">(comma separated)</span></label>
                <input value={editingItem.description || ''} onChange={e => setEditingItem(p => ({...p!, description: e.target.value}))}
                  placeholder="e.g. Tomato, Mozzarella, Basil"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" />
                <p className="text-slate-400 text-xs mt-0.5">Shown to customers — they can request to add/remove if Allow Edit is on</p>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <div>
                  <p className="text-sm font-bold text-slate-700">Allow customer to edit ingredients?</p>
                  <p className="text-xs text-slate-400">Customers can request to add/remove ingredients from the list above</p>
                </div>
                <Toggle on={!!(editingItem as any).allow_customer_edit} onToggle={() => setEditingItem(p => ({...p!, allow_customer_edit: !(p as any).allow_customer_edit}))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Price" required type="number" value={editingItem.price || ''} onChange={v => setEditingItem(p => ({...p!, price: parseFloat(v) || 0}))} placeholder="10.00" />

              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Category</label>
                <select value={editingItem.category_id || ''} onChange={e => setEditingItem(p => ({...p!, category_id: e.target.value || null}))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white">
                  <option value="">No category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {editingItem.image_path && (
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Current image</label>
                  <img src={imgUrl(editingItem.image_path)!} alt="" className="w-20 h-20 rounded-xl object-cover" />
                  <button onClick={() => setEditingItem(p => ({...p!, image_path: null}))} className="text-xs text-red-400 hover:text-red-600 mt-1">Remove image</button>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-4">
              <Btn label="Cancel" colour="slate" onClick={() => setEditingItem(null)} />
              <Btn label={saving ? 'Saving...' : 'Save item'} loading={saving} onClick={saveItem} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// MODIFIERS TAB
// ══════════════════════════════════════════════════════════════
function ModifiersTab({ categories, modifierGroups, modifierOptions, categoryModGroups, api, reload, showToast }: {
  categories: Category[]; modifierGroups: ModifierGroup[]; modifierOptions: ModifierOption[]
  categoryModGroups: {category_id:string;group_id:string}[]; api: (a: string, e?: any) => Promise<any>; reload: () => void; showToast: (m: string, t?: any) => void
}) {
  const [editingGroup, setEditingGroup] = useState<Partial<ModifierGroup> | null>(null)
  const [editingOption, setEditingOption] = useState<Partial<ModifierOption> | null>(null)
  const [saving, setSaving] = useState(false)
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)

  const saveGroup = async () => {
    if (!editingGroup?.name) return
    setSaving(true)
    try {
      await api('upsert_modifier_group', editingGroup)
      showToast(editingGroup.id ? 'Group updated' : 'Group created')
      setEditingGroup(null); reload()
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  const saveOption = async () => {
    if (!editingOption?.name || !editingOption.group_id) return
    setSaving(true)
    try {
      await api('upsert_modifier_option', editingOption)
      showToast(editingOption.id ? 'Option updated' : 'Option added')
      const keepOpen = editingOption.group_id
      setEditingOption(null)
      await reload()
      if(keepOpen) setExpandedGroup(keepOpen)
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  const toggleCatAssign = async (category_id: string, group_id: string, assigned: boolean) => {
    try {
      if (assigned) {
        await api('unassign_modifier_from_category', { category_id, group_id })
        showToast('Removed from category')
      } else {
        await api('assign_modifier_to_category', { category_id, group_id })
        showToast('Added to category')
      }
      reload()
    } catch (e: any) { showToast(e.message, 'error') }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-slate-900 text-lg">Modifiers</h2>
          <p className="text-slate-400 text-sm">Customisation options customers can add to items</p>
        </div>
        <Btn label="+ New group" onClick={() => setEditingGroup({ is_required: false, min_choices: 0, max_choices: 99 })} />
      </div>

      {/* Explainer */}
      <Card className="p-4 bg-blue-50 border-blue-100">
        <p className="text-xs text-blue-700 font-bold mb-1">How modifier groups work</p>
        <p className="text-xs text-blue-600">Create a group (e.g. "Pizza extras"), add options to it (Extra Cheese +£1, No Onion £0), then assign it to one or more categories. All items in that category will offer those options. Individual item overrides can be added from the Menu tab.</p>
      </Card>

      {modifierGroups.length === 0 && (
        <EmptyState icon="⚙️" title="No modifier groups yet" body='Create a group like "Pizza extras" and add options like "Extra Cheese +£1.00"' />
      )}

      {modifierGroups.map(group => {
        const opts = modifierOptions.filter(o => o.group_id === group.id).sort((a, b) => a.sort_order - b.sort_order)
        const assignedCats = categories.filter(c => categoryModGroups.some(cmg => cmg.category_id === c.id && cmg.group_id === group.id))
        const isOpen = expandedGroup === group.id
        return (
          <Card key={group.id}>
            <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={() => setExpandedGroup(isOpen ? null : group.id)}>
              <div className="flex-1">
                <p className="font-black text-slate-900">{group.name}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-slate-400 text-xs">{opts.length} option{opts.length !== 1 ? 's' : ''}</span>
                  {group.is_required && <Badge label="Required" colour="orange" />}
                  {assignedCats.map(c => <Badge key={c.id} label={c.name} colour="green" />)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={e => { e.stopPropagation(); setEditingGroup(group) }} className="text-slate-400 hover:text-orange-600 text-xs font-bold px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors">Edit</button>
                <span className="text-slate-400 text-xs">{isOpen ? '▲' : '▼'}</span>
              </div>
            </div>

            {isOpen && (
              <div className="border-t border-slate-100 p-4 space-y-4">
                {/* Options */}
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Options</p>
                  {opts.map(opt => (
                    <div key={opt.id} className="flex items-center gap-2 py-1.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${opt.type === 'remove' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>{opt.type}</span>
                      <span className="flex-1 text-sm text-slate-800 font-medium">{opt.name}</span>
                      <span className="text-sm font-bold text-orange-600">{opt.price_adjustment > 0 ? `+£${opt.price_adjustment.toFixed(2)}` : opt.price_adjustment < 0 ? `-£${Math.abs(opt.price_adjustment).toFixed(2)}` : 'Free'}</span>
                      <button onClick={() => setEditingOption(opt)} className="text-slate-300 hover:text-orange-500 text-xs px-1.5 py-0.5 rounded hover:bg-orange-50">✏️</button>
                      <button onClick={async () => { const gid = opt.group_id; await api('delete_modifier_option', { id: opt.id }); await reload(); setExpandedGroup(gid); showToast('Option removed') }} className="text-slate-300 hover:text-red-500 text-xs px-1.5 py-0.5 rounded hover:bg-red-50">🗑️</button>
                    </div>
                  ))}
                  <button onClick={() => setEditingOption({ group_id: group.id, type: 'add', price_adjustment: 0, sort_order: opts.length })}
                    className="text-xs text-orange-600 font-bold hover:text-orange-700 mt-1">+ Add option</button>
                </div>

                {/* Category assignments */}
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Assign to categories</p>
                  <div className="flex flex-wrap gap-2">
                    {categories.map(cat => {
                      const assigned = categoryModGroups.some(cmg => cmg.category_id === cat.id && cmg.group_id === group.id)
                      return (
                        <button key={cat.id} onClick={() => toggleCatAssign(cat.id, group.id, assigned)}
                          className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all active:scale-95 ${assigned ? 'bg-green-600 text-white border-green-600' : 'bg-white text-slate-600 border-slate-200 hover:border-green-400'}`}>
                          {assigned ? '✓ ' : ''}{cat.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </Card>
        )
      })}

      {/* Edit Group Modal */}
      {editingGroup && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => {}}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <h3 className="font-black text-slate-900 mb-4">{editingGroup.id ? 'Edit group' : 'New modifier group'}</h3>
            <div className="space-y-3">
              <Input label="Group name" required value={editingGroup.name || ''} onChange={v => setEditingGroup(p => ({...p!, name: v}))} placeholder='e.g. Pizza extras' />
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <div>
                  <p className="text-sm font-bold text-slate-700">Required</p>
                  <p className="text-xs text-slate-400">Customer must make a selection</p>
                </div>
                <Toggle on={!!editingGroup.is_required} onToggle={() => setEditingGroup(p => ({...p!, is_required: !p!.is_required}))} />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Btn label="Cancel" colour="slate" onClick={() => setEditingGroup(null)} />
              <Btn label={saving ? 'Saving...' : 'Save'} loading={saving} onClick={saveGroup} />
            </div>
          </div>
        </div>
      )}

      {/* Edit Option Modal */}
      {editingOption && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => {}}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <h3 className="font-black text-slate-900 mb-4">{editingOption.id ? 'Edit option' : 'New option'}</h3>
            <div className="space-y-3">
              <Input label="Option name" required value={editingOption.name || ''} onChange={v => setEditingOption(p => ({...p!, name: v}))} placeholder='e.g. Extra Cheese' />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Type</label>
                  <select value={editingOption.type || 'add'} onChange={e => setEditingOption(p => ({...p!, type: e.target.value}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
                    <option value="add">Add</option>
                    <option value="remove">Remove</option>
                    <option value="swap">Swap</option>
                  </select>
                </div>
                <Input label="Price adjustment (£)" type="number" value={editingOption.price_adjustment ?? 0} onChange={v => setEditingOption(p => ({...p!, price_adjustment: parseFloat(v) || 0}))} placeholder="0.00" hint="0 = free" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Btn label="Cancel" colour="slate" onClick={() => setEditingOption(null)} />
              <Btn label={saving ? 'Saving...' : 'Save'} loading={saving} onClick={saveOption} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// DEALS TAB
// ══════════════════════════════════════════════════════════════
function DealsTab({ categories, bundles, setBundles, api, reload, showToast }: {
  categories: Category[]; bundles: Bundle[]; setBundles: React.Dispatch<React.SetStateAction<Bundle[]>>
  api: (a: string, e?: any) => Promise<any>; reload: () => void; showToast: (m: string, t?: any) => void
}) {
  const [editing, setEditing] = useState<Partial<Bundle> | null>(null)
  const [saving, setSaving] = useState(false)
  const [showDefaultWarning, setShowDefaultWarning] = useState<string | null>(null)

  const handleToggleDefault = async (bundleId: string, newValue: boolean) => {
    setShowDefaultWarning(bundleId)
    setTimeout(() => setShowDefaultWarning(null), 4000)
    setBundles(prev => prev.map(b => b.id === bundleId ? { ...b, apply_to_new_events: newValue } : b))
    await api('update_bundle_default', { bundleId, applyToNewEvents: newValue })
  }

  const emptyBundle: Partial<Bundle> = { is_available: true, bundle_price: 0, slot_1_category: null, slot_2_category: null, slot_3_category: null, slot_4_category: null, slot_5_category: null, slot_6_category: null }

  const save = async () => {
    if (!editing?.name || !editing?.bundle_price) return
    setSaving(true)
    try {
      await api('upsert_bundle', editing)
      showToast(editing.id ? 'Deal updated' : 'Deal created')
      setEditing(null); reload()
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  const del = async (id: string) => {
    if (!confirm('Remove this deal?')) return
    try { await api('delete_bundle', { id }); reload(); showToast('Deal removed') }
    catch (e: any) { showToast(e.message, 'error') }
  }

  const slotKeys = ['slot_1_category','slot_2_category','slot_3_category','slot_4_category','slot_5_category','slot_6_category'] as const
  const activeSlotsOf = (b: Partial<Bundle>) => slotKeys.filter(k => b[k]).map(k => b[k]!)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-slate-900 text-lg">Deals</h2>
          <p className="text-slate-400 text-sm">{bundles.length} deal{bundles.length !== 1 ? 's' : ''} configured</p>
        </div>
        <Btn label="+ New deal" onClick={() => setEditing(emptyBundle)} />
      </div>

      {bundles.length === 0 && (
        <EmptyState icon="🎁" title="No deals yet" body='Create a bundle deal like "Lunch Deal — any pizza + drink + dip for £12"' />
      )}

      {bundles.map(bundle => {
        const slots = activeSlotsOf(bundle)
        return (
          <Card key={bundle.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-black text-slate-900">{bundle.name}</p>
                  <Badge label={bundle.is_available ? 'Active' : 'Off'} colour={bundle.is_available ? 'green' : 'slate'} />
                </div>
                {bundle.description && <p className="text-slate-400 text-xs mt-0.5">{bundle.description}</p>}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="font-black text-orange-600">£{bundle.bundle_price.toFixed(2)}</span>
                  {bundle.original_price && <span className="text-slate-400 text-xs line-through">£{bundle.original_price.toFixed(2)}</span>}
                  {(bundle.start_time || bundle.end_time) && (
                    <span className="text-xs text-slate-400">{[bundle.start_time, bundle.end_time].filter(Boolean).join(' – ')}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {slots.map((s, i) => <Badge key={i} label={s} colour="orange" />)}
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <Btn label="Edit" size="sm" colour="ghost" onClick={() => setEditing(bundle)} />
                <Btn label="Delete" size="sm" colour="red" onClick={() => del(bundle.id)} />
              </div>
            </div>

            <div className="flex items-center justify-between py-2 border-t border-slate-100 mt-3">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">New events</p>
                <p className="text-xs text-slate-400 mt-0.5">Automatically add this deal to events created from now on</p>
              </div>
              <button
                onClick={() => handleToggleDefault(bundle.id, !bundle.apply_to_new_events)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${bundle.apply_to_new_events ? 'bg-orange-600' : 'bg-slate-200'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${bundle.apply_to_new_events ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            {showDefaultWarning === bundle.id && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-1">
                ⚠️ This change only applies to events added from now on. To update existing events, go to the Schedule tab.
              </p>
            )}
          </Card>
        )
      })}

      {editing && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => {}}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="font-black text-slate-900 mb-4">{editing.id ? 'Edit deal' : 'New deal'}</h3>
            <div className="space-y-3">
              <Input label="Deal name" required value={editing.name || ''} onChange={v => setEditing(p => ({...p!, name: v}))} placeholder='e.g. Lunch Deal' />
              <Input label="Description" value={editing.description || ''} onChange={v => setEditing(p => ({...p!, description: v}))} placeholder='Any pizza + drink + dip' />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Deal price" required type="number" value={editing.bundle_price || ''} onChange={v => setEditing(p => ({...p!, bundle_price: parseFloat(v) || 0}))} placeholder="12.00" />
                <Input label="Original price" type="number" value={editing.original_price ?? ''} onChange={v => setEditing(p => ({...p!, original_price: v === '' ? null : parseFloat(v)}))} placeholder="leave blank = auto" hint="blank = calculate from items" />
              </div>

              <div>
                <p className="text-xs font-bold text-slate-600 mb-2">Item slots (categories required for this deal)</p>
                {slotKeys.map((k, i) => (
                  <div key={k} className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs text-slate-400 w-12 shrink-0">Slot {i + 1}</span>
                    <select value={editing[k] || ''} onChange={e => setEditing(p => ({...p!, [k]: e.target.value || null}))}
                      className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
                      <option value="">— Not used —</option>
                      {categories.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <span className="text-sm font-bold text-slate-700">Deal active</span>
                <Toggle on={!!editing.is_available} onToggle={() => setEditing(p => ({...p!, is_available: !p!.is_available}))} />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Btn label="Cancel" colour="slate" onClick={() => setEditing(null)} />
              <Btn label={saving ? 'Saving...' : 'Save deal'} loading={saving} onClick={save} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// SCHEDULE TAB (merged schedule CRUD + live event operations)
// ══════════════════════════════════════════════════════════════
async function geocodeLocation(
  venueName: string,
  town: string,
  postcode: string
): Promise<{ lat: number | null; lng: number | null }> {
  try {
    const res = await fetch('/api/manage/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueName, town, postcode }),
    })
    const data = await res.json()
    return { lat: data.lat, lng: data.lng }
  } catch {
    return { lat: null, lng: null }
  }
}
interface EventForm {
  auto_open: boolean | null
  auto_close: boolean
  venue_address: string
  customer_note: string
}

function EventStatusBadge({ status }: { status: TruckEvent['status'] }) {
  if (status === 'unconfirmed') return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-600">
      <span className="inline-block w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />Unconfirmed
    </span>
  )
  if (status === 'confirmed') return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-blue-600">
      <span className="inline-block w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />Confirmed
    </span>
  )
  if (status === 'open') return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-green-600">
      <span className="inline-block w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />Open now
    </span>
  )
  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
      <span className="inline-block w-2 h-2 rounded-full bg-slate-300 flex-shrink-0" />Closed
    </span>
  )
}

type EditingEvent = { id?: string; venue_name: string; town: string; postcode: string; address: string; event_date: string; start_time: string; end_time: string; notes: string }

function ScheduleTab({ token, bundles, api, reload, showToast }: {
  token: string; bundles: Bundle[]
  api: (a: string, e?: any) => Promise<any>; reload: () => void; showToast: (m: string, t?: any) => void
}) {
  const [events, setEvents] = useState<TruckEvent[]>([])
  const [loadingEvents, setLoadingEvents] = useState(true)
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null)
  const [form, setForm] = useState<EventForm>({ auto_open: null, auto_close: true, venue_address: '', customer_note: '' })
  const [saving, setSaving] = useState(false)
  const [showPast, setShowPast] = useState(false)
  const [showEventCancelModal, setShowEventCancelModal] = useState(false)
  const [cancellingEvent, setCancellingEvent] = useState<TruckEvent | null>(null)
  const [eventCancelReason, setEventCancelReason] = useState('')
  const [eventCancelNote, setEventCancelNote] = useState('')
  const [affectedOrderCount, setAffectedOrderCount] = useState(0)
  const [editingEvent, setEditingEvent] = useState<EditingEvent | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [addMode, setAddMode] = useState<'manual' | 'upload'>('manual')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadText, setUploadText] = useState('')
  const [uploadProcessing, setUploadProcessing] = useState(false)
  const [extractedEvents, setExtractedEvents] = useState<any[]>([])
  const [savingExtracted, setSavingExtracted] = useState(false)

  const loadEvents = useCallback(async () => {
    setLoadingEvents(true)
    try {
      const res = await fetch(`/api/events/manage?token=${token}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setEvents(data.events)
    } catch (e: any) { showToast(e.message || 'Failed to load events', 'error') }
    finally { setLoadingEvents(false) }
  }, [token])

  useEffect(() => { loadEvents() }, [loadEvents])

  const closeAddModal = () => {
    setEditingEvent(null)
    setExtractedEvents([])
    setUploadFile(null)
    setUploadText('')
  }

  const saveEdit = async () => {
    if (!editingEvent?.venue_name || !editingEvent?.event_date) return
    setEditSaving(true)
    try {
      const { lat, lng } = await geocodeLocation(
        editingEvent.venue_name,
        editingEvent.town,
        editingEvent.postcode
      )
      if (lat === null || lng === null) {
        console.warn('Geocoding returned null for event:', editingEvent.venue_name, editingEvent.postcode)
      }
      await api('upsert_event', { ...editingEvent, latitude: lat, longitude: lng })
      showToast(editingEvent.id ? 'Event updated' : 'Event added')
      closeAddModal()
      await loadEvents()
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setEditSaving(false) }
  }

  const processUpload = async () => {
    setUploadProcessing(true)
    const fd = new FormData()
    if (uploadFile) fd.append('file', uploadFile)
    if (uploadText) fd.append('text', uploadText)
    fd.append('token', token)
    const res = await fetch('/api/manage/process-schedule', { method: 'POST', body: fd })
    const data = await res.json()
    setExtractedEvents(data.events || [])
    setUploadProcessing(false)
  }

  const saveExtractedEvents = async () => {
    setSavingExtracted(true)
    try {
      for (const ev of extractedEvents) {
        const parts = (ev.event_date || '').split('/')
        const isoDate = parts.length === 3
          ? `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
          : ev.event_date

        const { lat, lng } = (ev.town || ev.postcode)
          ? await geocodeLocation(ev.venue_name || '', ev.town || '', ev.postcode || '')
          : { lat: null, lng: null }

        if (lat === null || lng === null) {
          console.warn('Geocoding returned null for extracted event:', ev.venue_name)
        }

        await api('upsert_event', {
          venue_name: ev.venue_name || '',
          town: ev.town || '',
          postcode: ev.postcode || '',
          address: [ev.town, ev.postcode].filter(Boolean).join(', '),
          event_date: isoDate,
          start_time: ev.start_time || '',
          end_time: ev.end_time || '',
          notes: ev.notes || '',
          latitude: lat,
          longitude: lng,
        })
      }
      const count = extractedEvents.length
      await loadEvents()
      closeAddModal()
      showToast(`${count} event${count !== 1 ? 's' : ''} saved`)
    } catch (e: any) { showToast(e.message || 'Failed to save events', 'error') }
    finally { setSavingExtracted(false) }
  }

  const expandEvent = (event: TruckEvent) => {
    if (expandedEventId === event.id) {
      setExpandedEventId(null)
      return
    }
    setExpandedEventId(event.id)
    if (event.status === 'confirmed') {
      setForm({
        auto_open: event.auto_open,
        auto_close: event.auto_close,
        venue_address: event.venue_address || '',
        customer_note: event.customer_note || '',
      })
    } else {
      setForm({ auto_open: null, auto_close: true, venue_address: event.venue_address || '', customer_note: event.customer_note || '' })
    }
  }

  const confirmEvent = async (eventId: string) => {
    if (form.auto_open === null) return
    setSaving(true)
    try {
      const res = await fetch('/api/events/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          action: 'confirm',
          eventId,
          payload: {
            auto_open: form.auto_open,
            auto_close: form.auto_close,
            venue_address: form.venue_address,
            customer_note: form.customer_note,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setEvents(prev => prev.map(e => e.id === eventId ? {
        ...e,
        status: 'confirmed' as const,
        auto_open: form.auto_open!,
        auto_close: form.auto_close,
        venue_address: form.venue_address || null,
        customer_note: form.customer_note || null,
      } : e))
      setExpandedEventId(null)
      showToast('Event confirmed')
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  const openEventCancelModal = (event: TruckEvent) => {
    setCancellingEvent(event)
    setAffectedOrderCount(0)
    setShowEventCancelModal(true)
  }

  const confirmCancelEvent = async () => {
    if (!cancellingEvent) return
    setShowEventCancelModal(false)
    try {
      const res = await fetch('/api/events/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          action: 'cancel',
          eventId: cancellingEvent.id,
          payload: { cancellationReason: eventCancelReason, cancellationNote: eventCancelNote },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setEvents(prev => prev.filter(e => e.id !== cancellingEvent.id))
      const cancelled = data.cancelledOrders ?? 0
      showToast(cancelled > 0
        ? `Event cancelled · ${cancelled} order${cancelled !== 1 ? 's' : ''} cancelled`
        : 'Event cancelled')
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setCancellingEvent(null); setEventCancelReason(''); setEventCancelNote('') }
  }

  const handleEventDealToggle = async (eventId: string, bundleId: string, active: boolean) => {
    setEvents(prev => prev.map(e => {
      if (e.id !== eventId) return e
      const existing = e.event_deals?.find(d => d.bundle_id === bundleId)
      const updated = existing
        ? e.event_deals!.map(d => d.bundle_id === bundleId ? { ...d, active, overridden: true } : d)
        : [...(e.event_deals || []), { bundle_id: bundleId, active, overridden: true }]
      return { ...e, event_deals: updated }
    }))
    await api('update_event_deal', { eventId, bundleId, active })
  }

  const renderEvent = (event: TruckEvent) => {
    const expanded = expandedEventId === event.id
    const canExpand = event.status === 'unconfirmed' || event.status === 'confirmed'
    return (
      <Card key={event.id}>
        <div
          className={`p-4 flex items-start justify-between gap-3 ${canExpand ? 'cursor-pointer' : ''}`}
          onClick={() => canExpand && expandEvent(event)}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-slate-900">{event.venue_name}</p>
              <EventStatusBadge status={event.status} />
            </div>
            {event.venue_address && <p className="text-slate-400 text-xs mt-0.5">{event.venue_address}</p>}
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-slate-700">{fmtDate(event.event_date)}</span>
              {event.start_time && event.end_time && (
                <span className="text-slate-400 text-xs">{event.start_time} – {event.end_time}</span>
              )}
            </div>
          </div>
          <div className="flex gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
            <Btn label="Edit" size="sm" colour="ghost" onClick={() => setEditingEvent({ id: event.id, venue_name: event.venue_name, town: (event as any).town || '', postcode: (event as any).postcode || '', address: event.venue_address || '', event_date: event.event_date, start_time: event.start_time || '', end_time: event.end_time || '', notes: event.customer_note || '' })} />
            {event.status === 'unconfirmed' && (
              <Btn label="Confirm" size="sm" colour="green" onClick={() => expandEvent(event)} />
            )}
            {event.status === 'confirmed' && (
              <Btn label="Settings" size="sm" colour="ghost" onClick={() => expandEvent(event)} />
            )}
            <Btn label="Cancel" size="sm" colour="red" onClick={() => openEventCancelModal(event)} />
          </div>
        </div>

        {bundles.length > 0 && (
          <div className="px-4 pb-3 border-t border-slate-100 mt-0">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 pt-3">
              Deals for this event
            </p>
            {bundles.map(bundle => {
              const eventDeal = event.event_deals?.find(d => d.bundle_id === bundle.id)
              const isActive = eventDeal ? eventDeal.active : bundle.apply_to_new_events
              return (
                <div key={bundle.id} className="flex items-center justify-between py-1.5">
                  <div>
                    <span className="text-sm text-slate-700">{bundle.name}</span>
                    <span className="text-xs text-slate-400 ml-2">£{bundle.bundle_price}</span>
                  </div>
                  <button
                    onClick={() => handleEventDealToggle(event.id, bundle.id, !isActive)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isActive ? 'bg-orange-600' : 'bg-slate-200'}`}
                  >
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${isActive ? 'translate-x-5' : 'translate-x-1'}`} />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {expanded && canExpand && (
          <div className="px-4 pb-4 mt-0 pt-3 border-t border-slate-100 flex flex-col gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Venue address — optional
              </label>
              <input type="text" value={form.venue_address}
                onChange={e => setForm(f => ({...f, venue_address: e.target.value}))}
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Customer note — optional
              </label>
              <input type="text" placeholder="e.g. Park in the main car park"
                value={form.customer_note}
                onChange={e => setForm(f => ({...f, customer_note: e.target.value}))}
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                When should this event open for orders?
                <Tooltip
                  content="Auto: orders open automatically at your start time. Manual: you tap 'Open for orders' on your dashboard when you're ready."
                  position="right"
                />
              </p>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="radio" name={`open-${event.id}`}
                    checked={form.auto_open === false}
                    onChange={() => setForm(f => ({...f, auto_open: false}))} />
                  <span className="text-sm">I'll open it manually when I arrive</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="radio" name={`open-${event.id}`}
                    checked={form.auto_open === true}
                    onChange={() => setForm(f => ({...f, auto_open: true}))} />
                  <span className="text-sm">Open automatically at {event.start_time}</span>
                </label>
              </div>
              {form.auto_open === null && (
                <p className="text-xs text-red-500 mt-1">Please choose when this event should open</p>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                When should it close?
                <Tooltip
                  content="Auto: orders close automatically at your end time. Manual: you close it yourself — useful if you want to run late."
                  position="right"
                />
              </p>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="radio" name={`close-${event.id}`}
                    checked={form.auto_close === true}
                    onChange={() => setForm(f => ({...f, auto_close: true}))} />
                  <span className="text-sm">Close automatically at {event.end_time}</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="radio" name={`close-${event.id}`}
                    checked={form.auto_close === false}
                    onChange={() => setForm(f => ({...f, auto_close: false}))} />
                  <span className="text-sm">I'll close it manually</span>
                </label>
              </div>
            </div>

            <button
              disabled={form.auto_open === null || saving}
              onClick={() => confirmEvent(event.id)}
              className="w-full bg-teal-600 text-white font-semibold py-3 rounded-xl disabled:opacity-40 hover:bg-teal-700 transition-colors"
            >
              {saving ? 'Confirming...' : 'Confirm event'}
            </button>
          </div>
        )}
      </Card>
    )
  }

  if (loadingEvents) return (
    <div className="flex items-center justify-center py-12"><Spinner /></div>
  )

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const upcoming = events.filter(e => e.status !== 'cancelled' && new Date(e.event_date) >= today)
  const past = events.filter(e => e.status !== 'cancelled' && new Date(e.event_date) < today)
  const unconfirmedEvents = upcoming.filter(e => e.status === 'unconfirmed')
  const confirmedEvents = upcoming.filter(e => e.status === 'confirmed')
  const openEvents = upcoming.filter(e => e.status === 'open')
  const otherUpcoming = upcoming.filter(e => !['unconfirmed', 'confirmed', 'open'].includes(e.status))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-slate-900 text-lg">Schedule</h2>
          <p className="text-slate-400 text-sm">{upcoming.length} upcoming</p>
        </div>
        <Btn label="+ Add event" onClick={() => { setEditingEvent({ venue_name: '', town: '', postcode: '', address: '', event_date: '', start_time: '', end_time: '', notes: '' }); setAddMode('manual'); setExtractedEvents([]) }} />
      </div>

      {upcoming.length === 0 && (
        <EmptyState icon="🗓️" title="No upcoming events" body="Events scraped from your social media and booking calendar will appear here for you to confirm" />
      )}

      {unconfirmedEvents.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Needs confirmation</p>
          {unconfirmedEvents.map(renderEvent)}
        </div>
      )}

      {confirmedEvents.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Confirmed</p>
          {confirmedEvents.map(renderEvent)}
        </div>
      )}

      {openEvents.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Open now</p>
          {openEvents.map(renderEvent)}
        </div>
      )}

      {otherUpcoming.length > 0 && (
        <div className="space-y-2">{otherUpcoming.map(renderEvent)}</div>
      )}

      {past.length > 0 && (
        <div className="pt-2">
          <button
            onClick={() => setShowPast(p => !p)}
            className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors"
          >
            <span>{showPast ? '▲' : '▼'}</span>
            Past events ({past.length})
          </button>
          {showPast && (
            <div className="mt-3 space-y-2">{past.map(renderEvent)}</div>
          )}
        </div>
      )}

      {editingEvent && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="font-black text-slate-900 mb-4">
              {editingEvent.id ? 'Edit event' : 'Add event'}
            </h3>

            {/* Mode toggle — new events only */}
            {!editingEvent.id && (
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => { setAddMode('manual'); setExtractedEvents([]) }}
                  className={`px-4 py-2 rounded-xl text-sm font-medium ${addMode === 'manual' ? 'bg-orange-600 text-white' : 'border border-slate-200 text-slate-600'}`}
                >
                  Add manually
                </button>
                <button
                  onClick={() => setAddMode('upload')}
                  className={`px-4 py-2 rounded-xl text-sm font-medium ${addMode === 'upload' ? 'bg-orange-600 text-white' : 'border border-slate-200 text-slate-600'}`}
                >
                  Upload schedule
                </button>
              </div>
            )}

            {/* Manual form */}
            {(editingEvent.id || addMode === 'manual') && (
              <div className="space-y-3">
                <Input label="Venue name" required value={editingEvent.venue_name} onChange={v => setEditingEvent(p => ({...p!, venue_name: v}))} placeholder="e.g. The Crown" />
                <Input label="Village / Town" value={editingEvent.town} onChange={v => setEditingEvent(p => ({...p!, town: v}))} placeholder="e.g. Wickhambrook" />
                <Input label="Postcode" value={editingEvent.postcode} onChange={v => setEditingEvent(p => ({...p!, postcode: v}))} placeholder="e.g. CB8 8PD" />
                <Input label="Full address (optional)" value={editingEvent.address} onChange={v => setEditingEvent(p => ({...p!, address: v}))} placeholder="e.g. 123 High St, Wickhambrook" />
                <Input label="Date" required type="date" value={editingEvent.event_date} onChange={v => setEditingEvent(p => ({...p!, event_date: v}))} />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Start time" type="time" value={editingEvent.start_time} onChange={v => setEditingEvent(p => ({...p!, start_time: v}))} />
                  <Input label="End time" type="time" value={editingEvent.end_time} onChange={v => setEditingEvent(p => ({...p!, end_time: v}))} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Notes</label>
                  <textarea value={editingEvent.notes} onChange={e => setEditingEvent(p => ({...p!, notes: e.target.value}))} placeholder="e.g. Park in the main car park" rows={2} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none" />
                </div>
                <div className="flex gap-2 pt-1">
                  <Btn label="Cancel" colour="slate" onClick={closeAddModal} />
                  <Btn label={editSaving ? 'Saving...' : editingEvent.id ? 'Save changes' : 'Add event'} loading={editSaving} onClick={saveEdit} />
                </div>
              </div>
            )}

            {/* Upload mode — new events only */}
            {!editingEvent.id && addMode === 'upload' && (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-slate-500">
                  Upload a screenshot, photo, or PDF of your schedule — or paste the text below.
                  Our AI will extract your events for you to review.
                </p>

                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Upload image or PDF
                  </label>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={e => setUploadFile(e.target.files?.[0] || null)}
                    className="mt-1 w-full text-sm text-slate-600"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Or paste schedule text
                  </label>
                  <textarea
                    value={uploadText}
                    onChange={e => setUploadText(e.target.value)}
                    placeholder="Paste your schedule here e.g. Saturday 14th June, The Crown, Wickhambrook, 5pm-9pm"
                    rows={4}
                    className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>

                <button
                  onClick={processUpload}
                  disabled={(!uploadFile && !uploadText) || uploadProcessing}
                  className="w-full bg-orange-600 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-40"
                >
                  {uploadProcessing ? 'Analysing...' : 'Extract events with AI'}
                </button>

                {extractedEvents.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm font-semibold text-slate-900">
                      We found {extractedEvents.length} event{extractedEvents.length !== 1 ? 's' : ''} — does this look right?
                    </p>
                    {extractedEvents.map((ev, i) => (
                      <div key={i} className="border border-slate-200 rounded-xl p-3 text-sm">
                        <p className="font-medium">{ev.venue_name}</p>
                        <p className="text-slate-500">{ev.event_date} · {ev.start_time}–{ev.end_time}</p>
                        <p className="text-slate-500">{ev.town}{ev.postcode ? `, ${ev.postcode}` : ''}</p>
                      </div>
                    ))}
                    <div className="flex gap-3">
                      <button
                        onClick={() => setExtractedEvents([])}
                        className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm"
                      >
                        Try again
                      </button>
                      <button
                        onClick={saveExtractedEvents}
                        disabled={savingExtracted}
                        className="flex-1 bg-orange-600 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-40"
                      >
                        {savingExtracted ? 'Saving...' : 'Save all events'}
                      </button>
                    </div>
                  </div>
                )}

                <button onClick={closeAddModal} className="text-sm text-slate-400 hover:text-slate-600 text-center">
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showEventCancelModal && cancellingEvent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 flex flex-col gap-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Cancel this event?</h3>
              <p className="text-sm text-slate-500 mt-1">{cancellingEvent.venue_name} · {cancellingEvent.event_date}</p>
              {affectedOrderCount > 0 && (
                <p className="text-sm font-medium text-red-600 mt-2">
                  {affectedOrderCount} order{affectedOrderCount !== 1 ? 's' : ''} will be cancelled and customers notified.
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Reason — optional</label>
              <select value={eventCancelReason} onChange={e => setEventCancelReason(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm">
                <option value="">Select a reason</option>
                <option value="Vehicle breakdown">Vehicle breakdown</option>
                <option value="Weather">Weather</option>
                <option value="Venue issue">Venue issue</option>
                <option value="Personal emergency">Personal emergency</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Message to customers — optional</label>
              <textarea
                value={eventCancelNote}
                onChange={e => setEventCancelNote(e.target.value)}
                placeholder="e.g. Sorry, our trailer broke down on the way to the venue..."
                rows={3}
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowEventCancelModal(false); setEventCancelReason(''); setEventCancelNote('') }}
                className="flex-1 border border-slate-200 text-slate-600 font-medium py-3 rounded-xl text-sm"
              >
                Keep event
              </button>
              <button
                onClick={() => confirmCancelEvent()}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-xl text-sm"
              >
                Cancel event
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// SETTINGS TAB
// ══════════════════════════════════════════════════════════════
function SettingsTab({ truck, token, api, reload, showToast }: {
  truck: Truck; token: string
  api: (a: string, e?: any) => Promise<any>; reload: () => void; showToast: (m: string, t?: any) => void
}) {
  const [form, setForm] = useState({ ...truck })
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [crewMode, setCrewMode] = useState<'solo' | 'full'>(truck.crew_mode ?? 'solo')
  const [kdsMode, setKdsMode] = useState<boolean>(truck.kds_mode ?? false)
  const [displayMode, setDisplayMode] = useState<'list' | 'grid'>((truck as any).display_mode ?? 'list')
  const [keepScreenOn, setKeepScreenOn] = useState<boolean>(truck.keep_screen_on ?? true)
  const [whatsappSender, setWhatsappSender] = useState(truck.whatsapp_sender ?? '')
  const [vans, setVans] = useState<Van[]>([])
  const [addingVan, setAddingVan] = useState(false)
  const [newVanName, setNewVanName] = useState('')
  const [renamingVanId, setRenamingVanId] = useState<string | null>(null)
  const [renameVanName, setRenameVanName] = useState('')
  const [deletingVan, setDeletingVan] = useState<Van | null>(null)
  const [deleteVanConfirm, setDeleteVanConfirm] = useState('')

  useEffect(() => {
    api('get_vans').then(r => setVans(r.vans || [])).catch(() => {})
  }, [])

  const can = (feature: Feature) => canAccess(
    truck.plan,
    feature,
    truck.feature_overrides ?? {},
    truck.trial_expires_at ?? null
  )

  const saveSetting = async (key: string, value: string) => {
    try {
      await api('update_truck', { data: { [key]: value } })
      showToast('Saved')
    } catch (e: any) {
      showToast(e.message, 'error')
    }
  }

  const handleDisplayModeChange = async (value: 'list' | 'grid') => {
    setDisplayMode(value)
    try { await api('update_truck', { data: { display_mode: value } }) }
    catch (err: any) { showToast(err.message, 'error') }
  }

  const save = async () => {
    setSaving(true)
    try {
      await api('update_settings', { ...form, website: (form as any).website })
      showToast('Settings saved'); reload()
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  const uploadLogo = async (file: File) => {
    setUploadingLogo(true)
    try {
      const { upload_url, path } = await api('get_upload_url', { filename: file.name, content_type: file.type })
      await fetch(upload_url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      setForm(p => ({ ...p, logo_storage_path: path }))
      showToast('Logo uploaded — save settings to apply')
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setUploadingLogo(false) }
  }

  const copyKdsLink = async (kdsToken: string) => {
    await navigator.clipboard.writeText(`https://www.hatchgrab.com/kds/${kdsToken}`)
    showToast('Order screen link copied')
  }

  const saveNewVan = async () => {
    try {
      const result = await api('add_van', { name: newVanName })
      if (result.van) {
        setVans(prev => [...prev, result.van])
        setAddingVan(false)
        setNewVanName('')
      }
    } catch (e: any) { showToast(e.message, 'error') }
  }

  const confirmRenameVan = async (vanId: string) => {
    if (!renameVanName.trim()) return
    try {
      await api('rename_van', { vanId, name: renameVanName })
      setVans(prev => prev.map(v => v.id === vanId ? { ...v, name: renameVanName.trim() } : v))
      setRenamingVanId(null)
      setRenameVanName('')
    } catch (e: any) { showToast(e.message, 'error') }
  }

  const confirmDeleteVan = async () => {
    if (!deletingVan || deleteVanConfirm !== deletingVan.name) return
    try {
      await api('delete_van', { vanId: deletingVan.id })
      setVans(prev => prev.filter(v => v.id !== deletingVan.id))
      setDeletingVan(null)
      setDeleteVanConfirm('')
      showToast('Van deleted')
    } catch (e: any) { showToast(e.message, 'error') }
  }

  const toggleAutoPause = async (vanId: string, enabled: boolean) => {
    setVans(prev => prev.map(v => v.id === vanId ? { ...v, auto_pause_on_offline: enabled } : v))
    await api('update_van_settings', { vanId, autoPauseOnOffline: enabled })
  }

  return (
    <div className="space-y-6 max-w-lg">
      <h2 className="font-black text-slate-900 text-lg">Settings</h2>

      {/* Plan */}
      <Card className="p-4">
        <div className="flex items-center justify-between py-1">
          <div>
            <div className="text-sm font-medium text-slate-900">Current plan</div>
            <div className="text-xs text-slate-500 mt-0.5">
              {PLAN_META[truck.plan].description}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-teal-600">
              {PLAN_META[truck.plan].name} · {PLAN_META[truck.plan].price}
            </span>
            {truck.plan !== 'max' && (
              <a href="/pricing" className="text-xs text-slate-400 hover:text-slate-600 underline">
                Upgrade
              </a>
            )}
          </div>
        </div>
      </Card>

      {/* Logo */}
      <Card className="p-4">
        <p className="font-bold text-slate-900 mb-3">Logo</p>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
            {form.logo_storage_path
              ? <img src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/truck-media/${form.logo_storage_path}`} alt="" className="w-full h-full object-cover" />
              : <span className="text-3xl">🚚</span>
            }
          </div>
          <div>
            <label className="cursor-pointer">
              <Btn label={uploadingLogo ? 'Uploading...' : 'Upload logo'} loading={uploadingLogo} colour="ghost" onClick={() => {}} />
              <input type="file" accept="image/*" className="sr-only" onChange={e => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
            </label>
            <p className="text-xs text-slate-400 mt-1">PNG or JPG, square recommended</p>
          </div>
        </div>
      </Card>

      {/* Truck details */}
      <Card className="p-4 space-y-3">
        <p className="font-bold text-slate-900">Truck details</p>
        <Input label="Truck name" required value={form.name} onChange={v => setForm(p => ({...p, name: v}))} />
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Description</label>
          <textarea value={form.description || ''} onChange={e => setForm(p => ({...p, description: e.target.value}))} placeholder="Tell customers about your food..."
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none" rows={3} />
        </div>
        <Input label="Cuisine type" value={form.cuisine_type || ''} onChange={v => setForm(p => ({...p, cuisine_type: v}))} placeholder="e.g. Italian, Thai, Burgers" />
      </Card>

      {/* Contact */}
      <Card className="p-4 space-y-3">
        <p className="font-bold text-slate-900">Contact</p>
        <Input label="Email" type="email" value={form.contact_email || ''} onChange={v => setForm(p => ({...p, contact_email: v}))} placeholder="hello@yourtruck.com" />
        <Input label="Phone" type="tel" value={form.contact_phone || ''} onChange={v => setForm(p => ({...p, contact_phone: v}))} placeholder="07700 900123" />
      </Card>

      {/* Social */}
      <Card className="p-4 space-y-3">
        <p className="font-bold text-slate-900">Online presence</p>
        <Input label="Website URL" value={(form as any).website || ''} onChange={v => setForm(p => ({...p, website: v}))} placeholder="https://yourtruck.co.uk" />
        <Input label="Instagram handle" value={form.social_instagram || ''} onChange={v => setForm(p => ({...p, social_instagram: v}))} placeholder="@yourtruck" />
        <Input label="Facebook page URL" value={form.social_facebook || ''} onChange={v => setForm(p => ({...p, social_facebook: v}))} placeholder="facebook.com/yourtruck" />
      </Card>

      {/* Orders */}
      <Card className="p-4 space-y-3">
        <p className="font-bold text-slate-900">Order settings</p>
        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-sm font-bold text-slate-700">Auto-accept orders</p>
            <p className="text-xs text-slate-400">Incoming web orders are confirmed immediately</p>
          </div>
          <Toggle on={!!form.auto_accept} onToggle={() => setForm(p => ({...p, auto_accept: !p.auto_accept}))} />
        </div>
        {form.auto_accept && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700">
            ⚠ Slot capacity limits still apply — full slots are never auto-confirmed
          </div>
        )}
      </Card>

      {/* Kitchen display */}
      <Card className="p-4 space-y-3">
        <div>
          <p className="font-bold text-slate-900">Kitchen display</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Settings for your order screen at{' '}
            <a href={`/dashboard/${token}/kds`} target="_blank" className="text-teal-600 underline">
              /dashboard/{token}/kds
            </a>
          </p>
        </div>

        {/* Split kitchen screen */}
        <div className="flex items-start justify-between gap-4 py-1">
          <div>
            <p className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
              Split kitchen screen
              <Tooltip
                content="Shows a separate cooking view on a second device in the kitchen."
                position="right"
              />
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              Show a separate cooking view on a second device. The order screen link appears in the header when enabled.
            </p>
          </div>
          <select
            value={crewMode}
            onChange={async e => {
              const val = e.target.value as 'solo' | 'full'
              setCrewMode(val)
              try { await api('update_truck', { data: { crew_mode: val } }) }
              catch (err: any) { showToast(err.message, 'error') }
            }}
            className="text-sm border border-slate-200 rounded-md px-3 py-1.5 bg-white text-slate-900 flex-shrink-0"
          >
            <option value="solo">Single screen</option>
            <option value="full">Show cook screen link</option>
          </select>
        </div>

        {/* KDS mode — cooking step */}
        <div className="flex items-start justify-between gap-4 py-1 border-t border-slate-100 pt-3">
          <div>
            <p className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
              Show cooking step
              <Tooltip
                content="Enables a two-step cooking workflow: orders move through Cooking → Ready → Collected. Best for crews of 2 or more."
                position="right"
              />
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              Adds a "Cooking" button between confirmed and done.
              Useful when your cook and window person use separate screens.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={kdsMode}
            onClick={async () => {
              const val = !kdsMode
              setKdsMode(val)
              try { await api('update_truck', { data: { kds_mode: val } }) }
              catch (err: any) { showToast(err.message, 'error') }
            }}
            className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors ${kdsMode ? 'bg-teal-600' : 'bg-slate-200'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${kdsMode ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>

        {/* Display layout */}
        <div className="flex items-start justify-between gap-4 py-3 border-b border-slate-100">
          <div>
            <div className="text-sm font-medium text-slate-900">Display layout</div>
            <div className="text-xs text-slate-500 mt-0.5">
              Grid view fits more tickets on screen at once — best for mounted
              displays. List view is simpler for counter-top setups.
            </div>
          </div>
          <select
            value={displayMode}
            onChange={e => handleDisplayModeChange(e.target.value as 'list' | 'grid')}
            className="text-sm border border-slate-200 rounded-md px-3 py-1.5 bg-white text-slate-900 flex-shrink-0"
          >
            <option value="list">List (single column)</option>
            <option value="grid">Grid (side by side)</option>
          </select>
        </div>

        {/* Keep screen on */}
        <div className="flex items-start justify-between gap-4 py-3 border-b border-slate-100">
          <div>
            <div className="text-sm font-medium text-slate-900">Keep screen on</div>
            <div className="text-xs text-slate-500 mt-0.5">
              Prevents the device screen from turning off while the dashboard is open.
              Recommended when offline detection is enabled — if the screen turns off,
              online orders may pause automatically.
            </div>
          </div>
          <button
            role="switch"
            aria-checked={keepScreenOn}
            onClick={async () => {
              const val = !keepScreenOn
              setKeepScreenOn(val)
              try { await api('update_truck', { data: { keep_screen_on: val } }) }
              catch (err: any) { showToast(err.message, 'error') }
            }}
            className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors ${keepScreenOn ? 'bg-teal-600' : 'bg-slate-200'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${keepScreenOn ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>

        {/* Cook screen URL — shown when full crew mode */}
        {crewMode === 'full' && (
          <div className="text-xs text-slate-500 bg-slate-50 rounded-md px-3 py-2.5 border-t border-slate-100 pt-3">
            Cook screen URL (open on a second tablet):
            <a
              href={`/dashboard/${token}/kds?view=cook`}
              target="_blank"
              className="block text-teal-600 underline mt-0.5 break-all"
            >
              /dashboard/{token}/kds?view=cook
            </a>
          </div>
        )}
      </Card>

      {/* Social Media Auto-Replies */}
      <Card className="p-4">
        <p className="font-bold text-slate-900 mb-1">Social media auto-replies</p>
        <p className="text-xs text-slate-500 mb-4">
          Automatically reply to customer messages with your schedule
          and order link. Requires Business accounts on each platform.
        </p>

        {/* WhatsApp */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              WhatsApp Business number
            </label>
            {!can('whatsapp_replies') && (
              <FeatureGate
                feature="whatsapp_replies"
                plan={truck.plan}
                overrides={truck.feature_overrides}
                trialExpiresAt={truck.trial_expires_at}
                showUpgrade={true}
              />
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5 mb-2">
            Your customers message this number. Must be a WhatsApp
            Business account. Format: +447700900000
          </p>
          {can('whatsapp_replies') ? (
            <div className="flex gap-2">
              <input
                type="tel"
                value={whatsappSender}
                onChange={e => setWhatsappSender(e.target.value)}
                placeholder="+447700900000"
                className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
              />
              <button
                onClick={() => saveSetting('whatsapp_sender', whatsappSender)}
                className="px-4 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-xl"
              >
                Save
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">Available on Max plan</p>
          )}
        </div>

        {/* Facebook / Instagram */}
        <div className="border-t border-slate-100 pt-4">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Facebook &amp; Instagram
          </label>
          <p className="text-xs text-slate-400 mt-0.5 mb-2">
            Connect your Facebook Business Page to auto-reply to
            messages and post comments.
          </p>
          <span className="text-xs text-slate-400 italic">
            Facebook &amp; Instagram integration coming soon
          </span>
        </div>
      </Card>

      {/* Vans */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Vans</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Manage your vehicles. Each van has its own order screen.
            </p>
          </div>
          {vans.length < maxVans(truck.plan) && (
            <button
              onClick={() => setAddingVan(true)}
              className="text-xs px-3 py-1.5 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700"
            >
              + Add van
            </button>
          )}
        </div>
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-1 mb-3">
          One van is included on all plans. Additional vans are available on
          Pro and Max plans — contact us to add more.
        </p>
        {vans.length >= maxVans(truck.plan) && truck.plan === 'starter' && (
          <p className="text-xs text-slate-400 mb-2">Upgrade to Pro to add more vans</p>
        )}

        {vans.map(van => (
          <div key={van.id}>
            <div className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
              <div>
                <p className="text-sm font-medium text-slate-900">{van.name}</p>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Screen: hatchgrab.com/kds/{van.kds_token.slice(0, 12)}...
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  <button
                    onClick={() => toggleAutoPause(van.id, !van.auto_pause_on_offline)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${van.auto_pause_on_offline ? 'bg-orange-600' : 'bg-slate-200'}`}
                  >
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${van.auto_pause_on_offline ? 'translate-x-5' : 'translate-x-1'}`} />
                  </button>
                  <span className="text-xs text-slate-500">Pause online orders if this device goes offline</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copyKdsLink(van.kds_token)}
                  className="text-xs px-2.5 py-1.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50"
                >
                  Copy order screen link
                </button>
                <button
                  onClick={() => { setRenamingVanId(van.id); setRenameVanName(van.name) }}
                  className="text-xs px-2.5 py-1.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50"
                >
                  Rename
                </button>
                {vans.length > 1 && (
                  <button
                    onClick={() => setDeletingVan(van)}
                    className="text-xs px-2.5 py-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
            {renamingVanId === van.id && (
              <div className="mt-2 mb-2 flex gap-2">
                <input
                  type="text"
                  value={renameVanName}
                  onChange={e => setRenameVanName(e.target.value)}
                  autoFocus
                  className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm"
                />
                <button
                  onClick={() => confirmRenameVan(van.id)}
                  disabled={!renameVanName.trim()}
                  className="px-3 py-2 bg-orange-600 text-white text-sm font-medium rounded-xl disabled:opacity-40"
                >
                  Save
                </button>
                <button
                  onClick={() => { setRenamingVanId(null); setRenameVanName('') }}
                  className="px-3 py-2 border border-slate-200 text-slate-600 text-sm rounded-xl"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        ))}

        {addingVan && (
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={newVanName}
              onChange={e => setNewVanName(e.target.value)}
              placeholder="e.g. Van 2, Festival Van"
              autoFocus
              className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm"
            />
            <button
              onClick={saveNewVan}
              disabled={!newVanName.trim()}
              className="px-4 py-2 bg-orange-600 text-white text-sm font-medium rounded-xl disabled:opacity-40"
            >
              Add
            </button>
            <button
              onClick={() => { setAddingVan(false); setNewVanName('') }}
              className="px-4 py-2 border border-slate-200 text-slate-600 text-sm rounded-xl"
            >
              Cancel
            </button>
          </div>
        )}
      </Card>

      {/* Delete van confirmation modal */}
      {deletingVan && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 flex flex-col gap-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Delete {deletingVan.name}?</h3>
              <p className="text-sm text-slate-500 mt-2">
                This will remove {deletingVan.name} from all future events.
                Past orders won't be affected. Staff assigned only to this
                van will need their access updated.
              </p>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Type the van name to confirm
              </label>
              <input
                type="text"
                value={deleteVanConfirm}
                onChange={e => setDeleteVanConfirm(e.target.value)}
                placeholder={deletingVan.name}
                autoFocus
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setDeletingVan(null); setDeleteVanConfirm('') }}
                className="flex-1 border border-slate-200 text-slate-600 py-3 rounded-xl text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteVan}
                disabled={deleteVanConfirm !== deletingVan.name}
                className="flex-1 bg-red-600 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-40 hover:bg-red-700"
              >
                Delete van
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Btn label={saving ? 'Saving...' : 'Save settings'} loading={saving} onClick={save} />
        <a href={`/dashboard/${token}`} className="text-sm text-slate-400 hover:text-slate-600 font-bold py-2">← Back to dashboard</a>
      </div>
    </div>
  )
}

// ── TeamTab ────────────────────────────────────────────────────
function TeamTab({ truck, token, api, reload, showToast }: {
  truck: Truck; token: string
  api: (a: string, e?: any) => Promise<any>; reload: () => void; showToast: (m: string, t?: any) => void
}) {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [vans, setVans] = useState<Van[]>([])
  const [invitingMember, setInvitingMember] = useState(false)
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null)
  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'manager' | 'staff'>('staff')
  const [inviteVanIds, setInviteVanIds] = useState<string[]>([])
  const [inviteLoading, setInviteLoading] = useState(false)

  const loadTeam = useCallback(async () => {
    try {
      const [teamResult, vansResult] = await Promise.all([
        api('get_team'),
        api('get_vans'),
      ])
      setTeamMembers(teamResult.members || [])
      setVans(vansResult.vans || [])
    } catch {}
  }, [])

  useEffect(() => { loadTeam() }, [loadTeam])

  const openInviteModal = () => {
    setEditingMember(null)
    setInviteName(''); setInviteEmail(''); setInviteRole('staff'); setInviteVanIds([])
    setInvitingMember(true)
  }

  const editMember = (member: TeamMember) => {
    setEditingMember(member)
    setInviteName(member.name || '')
    setInviteEmail(member.email)
    setInviteRole(member.role === 'owner' ? 'manager' : member.role)
    const matchedVanIds = vans
      .filter(v => member.van_names?.includes(v.name))
      .map(v => v.id)
    setInviteVanIds(matchedVanIds)
    setInvitingMember(true)
  }

  const closeModal = () => {
    setInvitingMember(false)
    setEditingMember(null)
    setInviteName(''); setInviteEmail(''); setInviteRole('staff'); setInviteVanIds([])
  }

  const sendInvite = async () => {
    if (!inviteEmail.trim()) return
    setInviteLoading(true)
    try {
      if (editingMember) {
        await api('update_member', {
          memberId: editingMember.id,
          name: inviteName,
          role: inviteRole,
          van_ids: inviteVanIds,
        })
        showToast('Member updated')
      } else {
        await api('invite_team_member', {
          name: inviteName,
          email: inviteEmail,
          role: inviteRole,
          vanIds: inviteVanIds,
        })
        showToast('Invite sent')
      }
      await loadTeam()
      closeModal()
    } catch (e: any) {
      showToast(e.message, 'error')
    } finally {
      setInviteLoading(false)
    }
  }

  const removeMember = async (memberId: string) => {
    if (!window.confirm('Remove this team member?')) return
    try {
      await api('remove_team_member', { memberId })
      setTeamMembers(prev => prev.filter(m => m.id !== memberId))
      showToast('Member removed')
    } catch (e: any) {
      showToast(e.message, 'error')
    }
  }

  return (
    <div className="flex flex-col gap-4 max-w-lg">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">Team members</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Invite staff to access the order screen and take orders
          </p>
        </div>
        <button
          onClick={openInviteModal}
          className="text-xs px-3 py-1.5 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700"
        >
          + Invite member
        </button>
      </div>

      <Card className="p-4">
        {/* Owner row — always shown */}
        <div className="flex items-center justify-between py-2.5 border-b border-slate-100">
          <div>
            <p className="text-sm font-medium text-slate-900">
              {truck.contact_email} (you)
            </p>
            <p className="text-xs text-slate-400">Owner · All vans</p>
          </div>
        </div>

        {/* Team member rows */}
        {teamMembers.map(member => (
          <div key={member.id} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
            <div>
              <p className="text-sm font-medium text-slate-900">
                {member.name || member.email}
              </p>
              <p className="text-xs text-slate-400">
                {member.role === 'manager' ? 'Manager' : 'Staff'}
                {' · '}
                {member.van_names?.length
                  ? member.van_names.join(', ')
                  : 'All vans'}
                {!member.accepted_at && ' · Invite pending'}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => editMember(member)}
                className="text-xs px-2.5 py-1.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50"
              >
                Edit
              </button>
              <button
                onClick={() => removeMember(member.id)}
                className="text-xs px-2.5 py-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
              >
                Remove
              </button>
            </div>
          </div>
        ))}

        {teamMembers.length === 0 && (
          <p className="text-xs text-slate-400 py-3 text-center">No team members yet</p>
        )}
      </Card>

      {/* Invite / edit modal */}
      {invitingMember && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
             onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 flex flex-col gap-4">
            <h3 className="text-lg font-semibold text-slate-900">
              {editingMember ? 'Edit team member' : 'Invite team member'}
            </h3>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</label>
              <input
                type="text"
                value={inviteName}
                onChange={e => setInviteName(e.target.value)}
                placeholder="e.g. Sarah"
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="sarah@example.com"
                disabled={!!editingMember}
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm disabled:bg-slate-50 disabled:text-slate-400"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</label>
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value as 'manager' | 'staff')}
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
              >
                <option value="staff">Staff — Take orders and manage the kitchen</option>
                <option value="manager">Manager — Full access including menu and settings</option>
              </select>
            </div>

            {vans.length > 1 && (
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Van access</label>
                <p className="text-xs text-slate-400 mb-2">Leave all unchecked to allow access to all vans</p>
                {vans.map(van => (
                  <label key={van.id} className="flex items-center gap-2 py-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={inviteVanIds.includes(van.id)}
                      onChange={e => {
                        if (e.target.checked) {
                          setInviteVanIds(prev => [...prev, van.id])
                        } else {
                          setInviteVanIds(prev => prev.filter(id => id !== van.id))
                        }
                      }}
                    />
                    <span className="text-sm text-slate-700">{van.name}</span>
                  </label>
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={closeModal}
                className="flex-1 border border-slate-200 text-slate-600 py-3 rounded-xl text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={sendInvite}
                disabled={!inviteEmail || inviteLoading}
                className="flex-1 bg-orange-600 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-40 hover:bg-orange-700"
              >
                {inviteLoading ? 'Saving...' : editingMember ? 'Save changes' : 'Send invite'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}