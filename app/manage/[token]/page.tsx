'use client'
// app/manage/[token]/page.tsx
// Truck management page — menu, modifiers, deals, schedule, settings

import { useState, useEffect, useCallback, use } from 'react'
import Image from 'next/image'

// ── Types ─────────────────────────────────────────────────────
interface Truck { id: string; name: string; description: string | null; cuisine_type: string | null; logo_storage_path: string | null; contact_email: string | null; contact_phone: string | null; social_instagram: string | null; social_facebook: string | null; auto_accept: boolean; dashboard_token: string }
interface Category { id: string; name: string; slug: string; prep_secs: number; batch_size: number; sort_order: number; is_active: boolean }
interface Item { id: string; name: string; description: string | null; price: number; category_id: string | null; is_available: boolean; stock_count: number | null; sort_order: number; image_path: string | null }
interface ModifierGroup { id: string; name: string; is_required: boolean; min_choices: number; max_choices: number }
interface ModifierOption { id: string; group_id: string; name: string; price_adjustment: number; type: string; sort_order: number }
interface Bundle { id: string; name: string; description: string | null; bundle_price: number; original_price: number | null; is_available: boolean; start_time: string | null; end_time: string | null; slot_1_category: string | null; slot_2_category: string | null; slot_3_category: string | null; slot_4_category: string | null; slot_5_category: string | null; slot_6_category: string | null }
interface TruckEvent { id: string; venue_name: string; address: string | null; event_date: string; start_time: string | null; end_time: string | null; notes: string | null; source: string; is_confirmed: boolean; is_cancelled: boolean }

type Tab = 'menu' | 'modifiers' | 'deals' | 'schedule' | 'settings'

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
  const [events, setEvents] = useState<TruckEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{msg:string;type:'success'|'error'}|null>(null)

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
      setEvents(data.events)
    } catch (e: any) { showToast(e.message || 'Failed to load', 'error') }
    finally { setLoading(false) }
  }, [token])

  useEffect(() => { load() }, [load])

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
          <a href={`/dashboard/${token}`} className="text-xs text-slate-400 hover:text-orange-400 font-bold transition-colors">← Orders dashboard</a>
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
        {activeTab === 'deals'     && <DealsTab     categories={categories} bundles={bundles} api={api} reload={load} showToast={showToast} />}
        {activeTab === 'schedule'  && <ScheduleTab  events={events} api={api} reload={load} showToast={showToast} />}
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

  const saveCat = async () => {
    if (!editingCat?.name) return
    setSaving(true)
    try {
      await api('upsert_category', { id: editingCat.id, name: editingCat.name, prep_secs: editingCat.prep_secs || 0, batch_size: editingCat.batch_size || 0 })
      showToast(editingCat.id ? 'Category updated' : 'Category added')
      setEditingCat(null); reload()
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
        <Btn label="+ Add category" onClick={() => setEditingCat({ prep_secs: 0, batch_size: 0 })} />
      </div>

      {/* Category list */}
      {categories.length === 0 && (
        <EmptyState icon="🍕" title="No categories yet" body="Add a category (e.g. Pizza, Burgers, Drinks) to start building your menu" />
      )}

      {categories.map(cat => {
        const catItems = items.filter(i => i.category_id === cat.id)
        const isOpen = expandedCat === cat.id
        return (
          <Card key={cat.id}>
            {/* Category header */}
            <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={() => setExpandedCat(isOpen ? null : cat.id)}>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-black text-slate-900">{cat.name}</span>
                  <span className="text-slate-400 text-xs">{catItems.length} item{catItems.length !== 1 ? 's' : ''}</span>
                  <span className="text-slate-300 text-xs">· {Math.round(cat.prep_secs / 60)}m prep · batch {cat.batch_size}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={e => { e.stopPropagation(); setEditingCat(cat) }} className="text-slate-400 hover:text-orange-600 text-xs font-bold px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors">Edit</button>
                <span className="text-slate-400 text-xs">{isOpen ? '▲' : '▼'}</span>
              </div>
            </div>

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
        )
      })}

      {/* Edit Category Modal */}
      {editingCat && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => {}}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <h3 className="font-black text-slate-900 mb-4">{editingCat.id ? 'Edit category' : 'New category'}</h3>
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
function DealsTab({ categories, bundles, api, reload, showToast }: {
  categories: Category[]; bundles: Bundle[]
  api: (a: string, e?: any) => Promise<any>; reload: () => void; showToast: (m: string, t?: any) => void
}) {
  const [editing, setEditing] = useState<Partial<Bundle> | null>(null)
  const [saving, setSaving] = useState(false)

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
// SCHEDULE TAB
// ══════════════════════════════════════════════════════════════
function ScheduleTab({ events, api, reload, showToast }: {
  events: TruckEvent[]
  api: (a: string, e?: any) => Promise<any>; reload: () => void; showToast: (m: string, t?: any) => void
}) {
  const emptyEvent = { venue_name: '', address: '', event_date: '', start_time: '', end_time: '', notes: '' }
  const [editing, setEditing] = useState<Partial<TruckEvent> | null>(null)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!editing?.venue_name || !editing?.event_date) return
    setSaving(true)
    try {
      await api('upsert_event', editing)
      showToast(editing.id ? 'Event updated' : 'Event added')
      setEditing(null); reload()
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  const cancel = async (id: string) => {
    if (!confirm('Cancel this event?')) return
    try { await api('delete_event', { id }); reload(); showToast('Event cancelled') }
    catch (e: any) { showToast(e.message, 'error') }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-slate-900 text-lg">Upcoming schedule</h2>
          <p className="text-slate-400 text-sm">{events.length} upcoming event{events.length !== 1 ? 's' : ''}</p>
        </div>
        <Btn label="+ Add event" onClick={() => setEditing(emptyEvent)} />
      </div>

      {events.length === 0 && (
        <EmptyState icon="📅" title="No upcoming events" body="Add your schedule so customers know where to find you" />
      )}

      <div className="space-y-3">
        {events.map(ev => (
          <Card key={ev.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-black text-slate-900">{ev.venue_name}</p>
                  <Badge label={ev.source === 'manual' ? 'Manual' : ev.source === 'scraped' ? 'Scraped' : 'AI'} colour={ev.source === 'manual' ? 'green' : 'slate'} />
                </div>
                {ev.address && <p className="text-slate-400 text-xs mt-0.5">{ev.address}</p>}
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm font-bold text-slate-700">{fmtDate(ev.event_date)}</span>
                  {(ev.start_time || ev.end_time) && (
                    <span className="text-slate-400 text-xs">{[ev.start_time, ev.end_time].filter(Boolean).join(' – ')}</span>
                  )}
                </div>
                {ev.notes && <p className="text-slate-400 text-xs mt-0.5 italic">{ev.notes}</p>}
              </div>
              <div className="flex gap-1.5 shrink-0">
                <Btn label="Edit" size="sm" colour="ghost" onClick={() => setEditing(ev)} />
                <Btn label="Cancel" size="sm" colour="red" onClick={() => cancel(ev.id)} />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => {}}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <h3 className="font-black text-slate-900 mb-4">{editing.id ? 'Edit event' : 'Add event'}</h3>
            <div className="space-y-3">
              <Input label="Venue / location name" required value={editing.venue_name || ''} onChange={v => setEditing(p => ({...p!, venue_name: v}))} placeholder='e.g. The Red Lion, Long Melford' />
              <Input label="Address" value={editing.address || ''} onChange={v => setEditing(p => ({...p!, address: v}))} placeholder='Optional' />
              <Input label="Date" required type="date" value={editing.event_date || ''} onChange={v => setEditing(p => ({...p!, event_date: v}))} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Start time</label>
                  <input type="time" value={editing.start_time || ''} onChange={e => setEditing(p => ({...p!, start_time: e.target.value || null}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">End time</label>
                  <input type="time" value={editing.end_time || ''} onChange={e => setEditing(p => ({...p!, end_time: e.target.value || null}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Notes</label>
                <textarea value={editing.notes || ''} onChange={e => setEditing(p => ({...p!, notes: e.target.value}))} placeholder="e.g. Limited menu, parking available"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none" rows={2} />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Btn label="Cancel" colour="slate" onClick={() => setEditing(null)} />
              <Btn label={saving ? 'Saving...' : 'Save event'} loading={saving} onClick={save} />
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

  return (
    <div className="space-y-6 max-w-lg">
      <h2 className="font-black text-slate-900 text-lg">Settings</h2>

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

      <div className="flex gap-3">
        <Btn label={saving ? 'Saving...' : 'Save settings'} loading={saving} onClick={save} />
        <a href={`/dashboard/${token}`} className="text-sm text-slate-400 hover:text-slate-600 font-bold py-2">← Back to dashboard</a>
      </div>
    </div>
  )
}