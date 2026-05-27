'use client'
// app/manage/[token]/page.tsx
// Truck management page — menu, modifiers, deals, schedule, settings

import { useState, useEffect, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { PLAN_META, canAccess, maxVans } from '@/lib/features'
import type { Plan, Feature } from '@/lib/features'
import { FeatureGate } from '@/components/FeatureGate'
import type { TruckEvent } from '@/components/dashboard/types'
import { Tooltip } from '@/components/ui/Tooltip'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useDragDrop } from '@/lib/useDragDrop'

// ── Types ─────────────────────────────────────────────────────
interface Truck { id: string; name: string; description: string | null; cuisine_type: string | null; logo_storage_path: string | null; contact_email: string | null; contact_phone: string | null; social_instagram: string | null; social_facebook: string | null; auto_accept: boolean; dashboard_token: string; crew_mode: 'solo' | 'full'; kds_mode: boolean; keep_screen_on: boolean; plan: Plan; feature_overrides: Record<string, boolean> | null; trial_expires_at: string | null; whatsapp_sender: string | null; allergen_info_url: string | null; allergen_info_text: string | null; preferred_contact_method: string | null; allow_customer_cancellation: boolean; cancellation_cutoff_mins: number }
interface Category { id: string; name: string; slug: string; prep_secs: number; batch_size: number; allow_notes: boolean; sort_order: number; is_active: boolean }
interface Item { id: string; name: string; description: string | null; price: number; category_id: string | null; is_available: boolean; stock_count: number | null; sort_order: number; image_path: string | null; allergens: string[]; dietary_info: string[] }
interface ModifierGroup { id: string; name: string; is_required: boolean; min_choices: number; max_choices: number }
interface ModifierOption { id: string; group_id: string; name: string; price_adjustment: number; type: string; sort_order: number }
interface Bundle { id: string; name: string; description: string | null; bundle_price: number; original_price: number | null; is_available: boolean; apply_to_new_events: boolean; start_time: string | null; end_time: string | null; slot_1_category: string | null; slot_2_category: string | null; slot_3_category: string | null; slot_4_category: string | null; slot_5_category: string | null; slot_6_category: string | null }
interface Van { id: string; truck_id: string; name: string; kds_token: string; active: boolean; auto_pause_on_offline: boolean }
interface TeamMember { id: string; email: string; name: string | null; role: 'owner' | 'manager' | 'staff'; accepted_at: string | null; van_names?: string[] }

type Tab = 'menu' | 'modifiers' | 'deals' | 'reports' | 'schedule' | 'team' | 'settings' | 'billing'
type UserRole = 'owner' | 'manager' | 'staff'

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
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('menu')
  const [userRole, setUserRole] = useState<UserRole>('owner')
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
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [editProfileName, setEditProfileName] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [showUserDropdown, setShowUserDropdown] = useState(false)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => setToast({ msg, type })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/manage?token=${token}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setTruck(data.truck)
      setUserRole(data.userRole || 'owner')
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

  // Read ?tab= query param on mount and activate that tab
  useEffect(() => {
    const tabParam = new URLSearchParams(window.location.search).get('tab') as Tab | null
    const allTabIds: Tab[] = ['menu', 'modifiers', 'deals', 'reports', 'schedule', 'team', 'settings', 'billing']
    if (tabParam && allTabIds.includes(tabParam)) setActiveTab(tabParam)
  }, [])

  // Staff have no business on the manage page — send them to the dashboard
  useEffect(() => {
    if (userRole === 'staff') router.replace(`/dashboard/${token}`)
  }, [userRole, token, router])

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      setCurrentUserName(d.name ?? null)
      setCurrentUserEmail(d.email ?? null)
    }).catch(() => null)
  }, [])

  const handleSignOut = async () => {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const saveProfile = async () => {
    if (!editProfileName.trim()) return
    setSavingProfile(true)
    try {
      const res = await fetch('/api/auth/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editProfileName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCurrentUserName(data.name)
      setShowProfileModal(false)
      showToast('Profile updated')
    } catch (e: any) {
      showToast(e.message || 'Failed to save', 'error')
    } finally {
      setSavingProfile(false)
    }
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

  const allTabs: { id: Tab; label: string; icon: string; roles: UserRole[] }[] = [
    { id: 'menu',      label: 'Menu',      icon: '🍕', roles: ['owner', 'manager'] },
    { id: 'modifiers', label: 'Modifiers', icon: '⚙️', roles: ['owner', 'manager'] },
    { id: 'deals',     label: 'Deals',     icon: '🎁', roles: ['owner', 'manager'] },
    { id: 'reports',   label: 'Reports',   icon: '📊', roles: ['owner', 'manager'] },
    { id: 'schedule',  label: 'Schedule',  icon: '📅', roles: ['owner', 'manager'] },
    { id: 'team',      label: 'Team',      icon: '👥', roles: ['owner', 'manager'] },
    { id: 'settings',  label: 'Settings',  icon: '🔧', roles: ['owner', 'manager'] },
    { id: 'billing',   label: 'Billing',   icon: '💳', roles: ['owner'] },
  ]
  const tabs = allTabs.filter(t => t.roles.includes(userRole))

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
            <div className="relative">
              <button
                onClick={() => setShowUserDropdown(v => !v)}
                className="flex items-center gap-2 focus:outline-none"
              >
                <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center text-xs font-semibold text-orange-700">
                  {currentUserName ? currentUserName.charAt(0).toUpperCase() : '?'}
                </div>
                <span className="text-sm text-slate-300 hidden sm:inline">{currentUserName}</span>
              </button>
              {showUserDropdown && (
                <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-lg border border-slate-100 py-1 z-50"
                     onBlur={() => setShowUserDropdown(false)}>
                  <button
                    onClick={() => { setEditProfileName(currentUserName || ''); setShowProfileModal(true); setShowUserDropdown(false) }}
                    className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Edit profile
                  </button>
                  <hr className="my-1 border-slate-100" />
                  <button
                    onClick={handleSignOut}
                    className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
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
        {/* Mandatory fields banner */}
        {(() => {
          const missing = [
            !truck.name?.trim() && 'truck name',
            !truck.cuisine_type?.trim() && 'cuisine type',
            !truck.contact_email?.trim() && 'contact email',
            !truck.contact_phone?.trim() && 'contact phone',
          ].filter(Boolean) as string[]
          if (missing.length === 0) return null
          return (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
              <span className="text-amber-500 text-lg shrink-0">⚠</span>
              <div>
                <p className="text-sm font-semibold text-amber-800">Complete your profile</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Missing: {missing.join(', ')}.{' '}
                  <button onClick={() => setActiveTab('settings')} className="underline font-medium">Go to Settings →</button>
                </p>
              </div>
            </div>
          )
        })()}
        {activeTab === 'menu'      && <MenuTab      truck={truck} categories={categories} items={items} token={token} api={api} reload={load} showToast={showToast} />}
        {activeTab === 'modifiers' && <ModifiersTab categories={categories} modifierGroups={modifierGroups} modifierOptions={modifierOptions} categoryModGroups={categoryModGroups} api={api} reload={load} showToast={showToast} />}
        {activeTab === 'deals'     && <DealsTab     categories={categories} bundles={bundles} setBundles={setBundles} api={api} reload={load} showToast={showToast} />}
        {activeTab === 'reports'   && <ReportsTab   truck={truck} api={api} />}
        {activeTab === 'schedule'  && <ScheduleTab  token={token} bundles={bundles} categories={categories} api={api} reload={load} showToast={showToast} />}
        {activeTab === 'team'      && <TeamTab      truck={truck} token={token} api={api} reload={load} showToast={showToast} />}
        {activeTab === 'settings'  && <SettingsTab  truck={truck} token={token} api={api} reload={load} showToast={showToast} />}
        {activeTab === 'billing'   && <BillingTab   truck={truck} />}
      </main>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* Edit profile modal */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
             onClick={e => e.target === e.currentTarget && setShowProfileModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-4">
            <h3 className="text-lg font-semibold text-slate-900">Edit profile</h3>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</label>
              <input
                type="text"
                value={editProfileName}
                onChange={e => setEditProfileName(e.target.value)}
                placeholder="Your name"
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</label>
              <input
                type="email"
                value={currentUserEmail || ''}
                disabled
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 text-slate-400"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowProfileModal(false)}
                className="flex-1 border border-slate-200 text-slate-600 py-3 rounded-xl text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={saveProfile}
                disabled={!editProfileName.trim() || savingProfile}
                className="flex-1 bg-orange-600 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-40 hover:bg-orange-700"
              >
                {savingProfile ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close dropdown on outside click */}
      {showUserDropdown && (
        <div className="fixed inset-0 z-40" onClick={() => setShowUserDropdown(false)} />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// MENU TAB
// ══════════════════════════════════════════════════════════════
type ImportStep = 'idle' | 'upload' | 'processing' | 'review' | 'prep' | 'saving' | 'done'

function MenuTab({ truck, categories, items, token, api, reload, showToast }: {
  truck: Truck; categories: Category[]; items: Item[]; token: string
  api: (a: string, e?: any) => Promise<any>; reload: () => void; showToast: (m: string, t?: any) => void
}) {
  const [editingCat, setEditingCat] = useState<Partial<Category> | null>(null)
  const [editingItem, setEditingItem] = useState<Partial<Item> | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadingItemPhoto, setUploadingItemPhoto] = useState(false)
  const [importStep, setImportStep] = useState<ImportStep>('idle')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importText, setImportText] = useState('')
  const [importDoneSkipped, setImportDoneSkipped] = useState(0)
  const [categoryPrep, setCategoryPrep] = useState<Record<string, { prep_secs: number | null; batch_size: number | null }>>({})

  const [importResult, setImportResult] = useState<{
    categories: string[]
    items: Array<{ name: string; description?: string; price: number; category: string; price_missing?: boolean; _skip?: boolean; allergens?: string[]; dietary?: string[] }>
    existing_categories: string[]
  } | null>(null)

  const { isDragging: isMenuDragging, dragProps: menuDragProps } = useDragDrop(
    (file) => setImportFile(file),
    ['image/*', '.pdf']
  )
  const { isDragging: isAllergenDragging, dragProps: allergenDragProps } = useDragDrop(
    (file) => handleAllergenUploadAndProcess(file),
    ['image/*', '.pdf']
  )

  const handleProcessMenu = async () => {
    setImportStep('processing')
    try {
      const fd = new FormData()
      fd.append('token', token)
      if (importFile) fd.append('file', importFile)
      if (importText) fd.append('text', importText)
      const res = await fetch('/api/manage/process-menu', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setImportResult(data)
      setImportStep('review')
    } catch (err) {
      console.error('Menu processing failed:', err)
      setImportStep('upload')
    }
  }

  const handleCommitMenu = async () => {
    if (!importResult) return
    setImportStep('saving')
    try {
      const res = await fetch('/api/manage/commit-menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, categories: importResult.categories, items: importResult.items, categoryPrep }),
      })
      const data = await res.json()
      if (data.ok) {
        setImportDoneSkipped(data.skipped ?? 0)
        setImportStep('done')
        setTimeout(() => {
          setImportStep('idle')
          setImportResult(null)
          setImportFile(null)
          setImportText('')
          setImportDoneSkipped(0)
          setCategoryPrep({})
          reload()
        }, 2500)
      }
    } catch (err) {
      console.error('Menu commit failed:', err)
      setImportStep('prep')
    }
  }

  const uploadItemPhoto = async (file: File) => {
    if (!editingItem) return
    setUploadingItemPhoto(true)
    try {
      const { upload_url, path } = await api('get_upload_url', { filename: file.name, content_type: file.type })
      await fetch(upload_url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      setEditingItem(prev => prev ? { ...prev, image_path: path } : prev)
      await api('upsert_item', { id: editingItem.id, image_path: path })
    } catch (err: any) { showToast(err.message || 'Upload failed', 'error') }
    finally { setUploadingItemPhoto(false) }
  }
  const [expandedCat, setExpandedCat] = useState<string | null>(categories[0]?.id || null)
  const [allergenText, setAllergenText] = useState('')
  const [allergenUrl, setAllergenUrl] = useState(truck.allergen_info_url || '')
  const [allergenInfoText, setAllergenInfoText] = useState(truck.allergen_info_text || '')
  type AllergenStep = 'idle' | 'processing' | 'review'
  const [allergenStep, setAllergenStep] = useState<AllergenStep>('idle')
  const [allergenExtracted, setAllergenExtracted] = useState<any>(null)
  const [showAllergenModal, setShowAllergenModal] = useState(false)

  const handleAllergenUploadAndProcess = async (file: File) => {
    setAllergenStep('processing')
    try {
      const { upload_url, path } = await api('get_upload_url', { filename: file.name, content_type: file.type })
      await fetch(upload_url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/truck-media/${path}`
      setAllergenUrl(publicUrl)
      await api('update_settings', { allergen_info_url: publicUrl })
    } catch { /* file upload failure — continue with AI */ }

    const fd = new FormData()
    fd.append('token', token)
    fd.append('file', file)
    try {
      const res = await fetch('/api/manage/process-allergens', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.ok) { setAllergenExtracted(data.allergens); setAllergenStep('review') }
      else { setAllergenStep('idle'); showToast('AI processing failed', 'error') }
    } catch { setAllergenStep('idle'); showToast('Processing failed', 'error') }
  }

  const handleAllergenTextProcess = async (text: string) => {
    setAllergenStep('processing')
    const fd = new FormData()
    fd.append('token', token)
    fd.append('text', text)
    try {
      const res = await fetch('/api/manage/process-allergens', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.ok) { setAllergenExtracted(data.allergens); setAllergenStep('review') }
      else { setAllergenStep('idle'); showToast('AI processing failed', 'error') }
    } catch { setAllergenStep('idle'); showToast('Processing failed', 'error') }
  }

  const handleSaveAllergens = async () => {
    if (!allergenExtracted) return
    const formattedText = allergenExtracted.formatted_text || [
      allergenExtracted.summary,
      allergenExtracted.contains?.length ? `Contains: ${allergenExtracted.contains.join(', ')}` : null,
      allergenExtracted.may_contain?.length ? `May contain: ${allergenExtracted.may_contain.join(', ')}` : null,
      allergenExtracted.dietary_options?.length ? allergenExtracted.dietary_options.join('. ') : null,
      allergenExtracted.additional_notes,
    ].filter(Boolean).join('\n')
    try {
      await api('update_settings', { allergen_info_text: formattedText })
      setAllergenInfoText(formattedText)
      setAllergenStep('idle')
      setAllergenExtracted(null)
      setAllergenText('')
      setShowAllergenModal(false)
    } catch (e: any) { showToast(e.message || 'Save failed', 'error') }
  }

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
      <div className="flex items-start justify-between mb-2">
        <div>
          <h2 className="font-black text-slate-900 text-lg">Menu</h2>
          <p className="text-slate-400 text-sm mt-0.5">
            {categories.length} {categories.length === 1 ? 'category' : 'categories'} · {items.length} items
          </p>
        </div>
        <div className="flex items-center gap-3">
          {categories.length > 0 && (
            <div className="flex flex-col items-end gap-0.5">
              <button onClick={() => setImportStep('upload')}
                className="flex items-center gap-2 px-4 py-2 border border-orange-200 text-orange-600 text-sm font-medium rounded-xl hover:bg-orange-50 transition-colors">
                ✨ Import with AI
              </button>
              <p className="text-xs text-slate-400">photo, PDF or text</p>
            </div>
          )}
          <div className="self-start">
            <Btn label="+ Add category" onClick={() => setEditingCat({ prep_secs: 0, batch_size: 0, allow_notes: false } as any)} />
          </div>
        </div>
      </div>

      {/* Empty state / Category list */}
      {categories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="text-5xl mb-4">✨</div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Build your menu in seconds</h3>
          <p className="text-sm text-slate-500 text-center max-w-sm mb-2">
            Take a photo of your menu board, screenshot your existing menu, or drag in a PDF — our AI will extract everything and build your digital menu automatically.
          </p>
          <p className="text-xs text-slate-400 text-center max-w-xs mb-8">
            Works with photos, screenshots, PDFs and plain text. You can review and edit everything before it's saved.
          </p>
          <button onClick={() => setImportStep('upload')}
            className="flex items-center gap-2 px-6 py-3 bg-orange-600 text-white font-semibold rounded-xl text-sm hover:bg-orange-700 transition-colors shadow-sm">
            ✨ Import menu with AI
          </button>
          <button onClick={() => setEditingCat({ prep_secs: 0, batch_size: 0, allow_notes: false } as any)}
            className="mt-3 text-xs text-slate-400 hover:text-slate-600 underline">
            or add categories manually
          </button>
        </div>
      ) : null}

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
                  {cat.prep_secs > 0 && (
                    <span className="text-[11px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                      {cat.prep_secs < 60 ? `${cat.prep_secs}s prep` : `${Math.round(cat.prep_secs / 60)}m prep`}
                    </span>
                  )}
                  {cat.batch_size > 0 && cat.batch_size < 999 && (
                    <span className="text-[11px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{cat.batch_size} at a time</span>
                  )}
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
                      {(item.dietary_info?.length > 0 || item.allergens?.length > 0) && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {item.dietary_info?.map(d => (
                            <span key={d} className="text-[10px] px-1.5 py-0.5 bg-green-50 text-green-700 rounded-md border border-green-100">{d}</span>
                          ))}
                          {item.allergens?.map(a => (
                            <span key={a} className="text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded-md border border-amber-100">{a}</span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-black text-orange-600 text-sm">£{Number(item.price).toFixed(2)}</span>
                        {item.stock_count !== null && <Badge label={`Stock: ${item.stock_count}`} colour="orange" />}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-medium hidden sm:inline ${item.is_available ? 'text-green-600' : 'text-slate-400'}`}>
                          {item.is_available ? 'Available' : 'Hidden'}
                        </span>
                        <Toggle on={item.is_available} onToggle={() => toggleItem(item)} />
                      </div>
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

      {/* Allergen information — card */}
      {!allergenInfoText && allergenStep === 'idle' && (
        <div className="border border-slate-200 rounded-2xl p-6 flex flex-col items-center text-center gap-3 mt-8">
          <div className="text-3xl">🛡️</div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Allergen information</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-xs">
              Help customers with allergies order safely. Upload your allergen card and our AI will structure it automatically.
            </p>
          </div>
          <button onClick={() => setShowAllergenModal(true)}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors">
            Add allergen info
          </button>
          <p className="text-xs text-slate-400">photo, PDF or text</p>
        </div>
      )}

      {allergenInfoText && allergenStep === 'idle' && (
        <div className="border border-green-100 bg-green-50 rounded-2xl p-4 mt-8">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="text-lg flex-shrink-0">🛡️</span>
              <div>
                <p className="text-sm font-semibold text-slate-900">Allergen information</p>
                <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{allergenInfoText}</p>
                {allergenUrl && (
                  <a href={allergenUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-green-600 underline mt-1 inline-block">
                    View original card
                  </a>
                )}
              </div>
            </div>
            <button onClick={() => setShowAllergenModal(true)}
              className="text-xs px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-white flex-shrink-0">
              Edit
            </button>
          </div>
        </div>
      )}

      {allergenStep === 'processing' && (
        <div className="border border-slate-200 rounded-2xl p-6 flex items-center gap-3 mt-8">
          <div className="w-5 h-5 border-2 border-orange-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <p className="text-sm text-slate-500">Reading allergen information...</p>
        </div>
      )}

      {allergenStep === 'review' && allergenExtracted && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 flex flex-col gap-3 max-h-[90vh] overflow-y-auto">
            <p className="text-sm font-semibold text-slate-900">Extracted allergen information</p>

            {allergenExtracted.summary && (
              <p className="text-sm text-slate-600">{allergenExtracted.summary}</p>
            )}

            {allergenExtracted.contains?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">Contains</p>
                <div className="flex flex-wrap gap-1">
                  {allergenExtracted.contains.map((a: string) => (
                    <span key={a} className="text-xs px-2 py-1 bg-red-50 border border-red-200 text-red-700 rounded-lg">{a}</span>
                  ))}
                </div>
              </div>
            )}

            {allergenExtracted.may_contain?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">May contain</p>
                <div className="flex flex-wrap gap-1">
                  {allergenExtracted.may_contain.map((a: string) => (
                    <span key={a} className="text-xs px-2 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg">{a}</span>
                  ))}
                </div>
              </div>
            )}

            {allergenExtracted.free_from?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">Free from</p>
                <div className="flex flex-wrap gap-1">
                  {allergenExtracted.free_from.map((a: string) => (
                    <span key={a} className="text-xs px-2 py-1 bg-green-50 border border-green-200 text-green-700 rounded-lg">{a}</span>
                  ))}
                </div>
              </div>
            )}

            {allergenExtracted.dietary_options?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">Dietary options</p>
                <div className="flex flex-wrap gap-1">
                  {allergenExtracted.dietary_options.map((d: string) => (
                    <span key={d} className="text-xs px-2 py-1 bg-green-50 border border-green-200 text-green-700 rounded-lg">{d}</span>
                  ))}
                </div>
              </div>
            )}

            {allergenExtracted.additional_notes && (
              <p className="text-xs text-slate-500 italic">{allergenExtracted.additional_notes}</p>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={() => { setAllergenStep('idle'); setAllergenExtracted(null); setShowAllergenModal(true) }}
                className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm hover:bg-slate-50">
                Try again
              </button>
              <button onClick={handleSaveAllergens}
                className="flex-1 bg-orange-600 text-white font-semibold py-2.5 rounded-xl text-sm hover:bg-orange-700">
                Save allergen info
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Allergen modal */}
      {showAllergenModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                {allergenInfoText ? 'Update allergen info' : 'Add allergen info'}
              </h3>
              <button onClick={() => { setShowAllergenModal(false); setAllergenText('') }}
                className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
            </div>
            <p className="text-sm text-slate-500">
              Upload your allergen card or paste your allergen information. Our AI will extract and structure it clearly for customers.
            </p>
            <label
              {...allergenDragProps}
              className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-8 cursor-pointer transition-colors ${isAllergenDragging ? 'border-orange-400 bg-orange-50' : 'border-slate-200 hover:border-orange-300 hover:bg-orange-50/30'}`}
            >
              <span className="text-3xl">{isAllergenDragging ? '📂' : '📋'}</span>
              <span className="text-sm text-slate-500 text-center">
                {isAllergenDragging ? 'Drop your allergen card here' : 'Drag and drop or tap to upload'}
              </span>
              <span className="text-xs text-slate-400">Image or PDF</span>
              <input type="file" accept="image/*,.pdf" className="sr-only"
                onChange={e => { const f = e.target.files?.[0]; if (f) { setShowAllergenModal(false); handleAllergenUploadAndProcess(f) } }} />
            </label>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-100" />
              <span className="text-xs text-slate-400">or type / paste</span>
              <div className="flex-1 h-px bg-slate-100" />
            </div>
            <textarea
              value={allergenText}
              onChange={e => setAllergenText(e.target.value)}
              placeholder="Paste your allergen information here..."
              rows={4}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            <div className="flex gap-3">
              <button onClick={() => { setShowAllergenModal(false); setAllergenText('') }}
                className="flex-1 border border-slate-200 text-slate-600 py-3 rounded-xl text-sm hover:bg-slate-50">
                Cancel
              </button>
              <button
                onClick={() => { setShowAllergenModal(false); handleAllergenTextProcess(allergenText) }}
                disabled={!allergenText.trim()}
                className="flex-1 bg-orange-600 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-40 hover:bg-orange-700">
                Extract with AI
              </button>
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

              {/* Photo */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">Photo</label>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-xl border border-slate-200 overflow-hidden flex-shrink-0 bg-slate-50 flex items-center justify-center">
                    {editingItem.image_path
                      ? <img src={imgUrl(editingItem.image_path)!} alt={editingItem.name || ''} className="w-full h-full object-cover" />
                      : <span className="text-2xl">🍽️</span>
                    }
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                      {uploadingItemPhoto ? 'Uploading…' : editingItem.image_path ? 'Change photo' : 'Add photo'}
                      <input type="file" accept="image/*" className="sr-only" onChange={e => e.target.files?.[0] && uploadItemPhoto(e.target.files[0])} />
                    </label>
                    {editingItem.image_path && (
                      <button onClick={() => setEditingItem(p => p ? { ...p, image_path: null } : p)} className="text-xs text-red-500 hover:text-red-700 text-left">
                        Remove photo
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-1">Square photos work best. JPG or PNG.</p>
              </div>

              {/* Allergens */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Allergens</label>
                <p className="text-xs text-slate-400 mt-0.5 mb-2">Select all that apply</p>
                <div className="flex flex-wrap gap-2">
                  {['Dairy', 'Lactose', 'Gluten', 'Eggs', 'Nuts', 'Soy', 'Fish', 'Shellfish', 'Celery', 'Mustard'].map(allergen => {
                    const active = ((editingItem as any).allergens || []).includes(allergen)
                    return (
                      <button key={allergen} type="button"
                        onClick={() => {
                          const current: string[] = (editingItem as any).allergens || []
                          const updated = active ? current.filter(a => a !== allergen) : [...current, allergen]
                          setEditingItem(prev => prev ? { ...prev, allergens: updated } as any : prev)
                        }}
                        className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${active ? 'bg-amber-50 border-amber-300 text-amber-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                        {allergen}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Dietary */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Dietary</label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {['Vegetarian', 'Vegan', 'Halal', 'Kosher', 'Gluten Free', 'Dairy Free'].map(diet => {
                    const active = ((editingItem as any).dietary_info || []).includes(diet)
                    return (
                      <button key={diet} type="button"
                        onClick={() => {
                          const current: string[] = (editingItem as any).dietary_info || []
                          const updated = active ? current.filter(d => d !== diet) : [...current, diet]
                          setEditingItem(prev => prev ? { ...prev, dietary_info: updated } as any : prev)
                        }}
                        className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${active ? 'bg-green-50 border-green-300 text-green-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                        {diet}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Btn label="Cancel" colour="slate" onClick={() => setEditingItem(null)} />
              <Btn label={saving ? 'Saving...' : 'Save item'} loading={saving} onClick={saveItem} />
            </div>
          </div>
        </div>
      )}

      {/* AI Import — Upload modal */}
      {importStep === 'upload' && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-black text-slate-900 mb-1">Import your menu</h3>
            <p className="text-slate-400 text-sm mb-5">Upload a photo of your menu board, a screenshot, a PDF, or paste your menu as text. Our AI reads it and builds your digital menu — you review everything before it saves.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Upload menu file</label>
                <label
                  {...menuDragProps}
                  className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-8 cursor-pointer transition-colors ${isMenuDragging ? 'border-orange-400 bg-orange-50' : 'border-slate-200 hover:border-orange-300 hover:bg-orange-50/30'}`}
                >
                  <span className="text-3xl">{isMenuDragging ? '📂' : importFile ? '✅' : '📷'}</span>
                  <span className="text-sm text-slate-500 text-center">
                    {isMenuDragging ? 'Drop your menu here' : importFile ? importFile.name : 'Drag and drop or tap to choose'}
                  </span>
                  {!isMenuDragging && !importFile && (
                    <span className="text-xs text-slate-400">Image or PDF</span>
                  )}
                  <input type="file" accept="image/*,.pdf" className="sr-only" onChange={e => setImportFile(e.target.files?.[0] || null)} />
                </label>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs text-slate-400 font-medium">or</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Paste menu text</label>
                <textarea
                  value={importText}
                  onChange={e => setImportText(e.target.value)}
                  placeholder="Paste your menu here — item names, descriptions, prices..."
                  rows={5}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <Btn label="Cancel" colour="slate" onClick={() => { setImportStep('idle'); setImportFile(null); setImportText('') }} />
              <Btn
                label="Process menu"
                disabled={!importFile && !importText.trim()}
                onClick={handleProcessMenu}
              />
            </div>
          </div>
        </div>
      )}

      {/* AI Import — Processing spinner */}
      {importStep === 'processing' && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-2xl text-center">
            <div className="w-12 h-12 border-4 border-slate-200 border-t-orange-500 rounded-full animate-spin mx-auto mb-4" />
            <p className="font-black text-slate-900 mb-1">Analysing your menu</p>
            <p className="text-slate-400 text-sm">AI is reading and categorising your items…</p>
          </div>
        </div>
      )}

      {/* AI Import — Review screen */}
      {importStep === 'review' && importResult && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100">
              <h3 className="font-black text-slate-900">Review imported items</h3>
              <p className="text-slate-400 text-sm mt-0.5">
                {importResult.items.filter(i => !i._skip).length} items ready to add.{' '}
                Uncheck any you don't want — you can edit details after importing.
              </p>
            </div>
            <div className="overflow-y-auto flex-1 p-6 flex flex-col gap-6">
              {importResult.categories.map(cat => {
                const catItems = importResult.items.filter(i => i.category === cat)
                if (catItems.length === 0) return null
                return (
                  <div key={cat} className="first:pt-0 pt-4 first:border-0 border-t border-slate-100">
                    <div className="flex items-center gap-2 mb-3">
                      <h4 className="text-base font-bold text-slate-900 tracking-tight">{cat}</h4>
                      <span className="text-xs text-slate-400">
                        {catItems.filter(i => !i._skip).length} of {catItems.length}
                      </span>
                      {importResult.existing_categories.includes(cat) && (
                        <span className="text-xs text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">existing</span>
                      )}
                    </div>
                    <div className="flex flex-col divide-y divide-slate-100">
                      {catItems.map((item) => {
                        const globalIdx = importResult.items.indexOf(item)
                        return (
                          <div key={globalIdx} className={`flex items-start gap-3 py-3 transition-opacity ${item._skip ? 'opacity-40' : 'opacity-100'}`}>
                            <button
                              type="button"
                              onClick={() => setImportResult(prev => prev ? {
                                ...prev,
                                items: prev.items.map((it, i) => i === globalIdx ? { ...it, _skip: !it._skip } : it)
                              } : prev)}
                              className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 border-2 transition-colors ${item._skip ? 'border-slate-300 bg-white' : 'border-orange-500 bg-orange-500'}`}
                            >
                              {!item._skip && (
                                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </button>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                              {item.description && <p className="text-xs text-slate-400 mt-0.5">{item.description}</p>}
                              {((item.allergens ?? []).length > 0 || (item.dietary ?? []).length > 0) && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {item.dietary?.map((d: string) => (
                                    <span key={d} className="text-xs px-1.5 py-0.5 bg-green-50 text-green-700 rounded-md border border-green-100">{d}</span>
                                  ))}
                                  {item.allergens?.map((a: string) => (
                                    <span key={a} className="text-xs px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded-md border border-amber-100">{a}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center flex-shrink-0">
                              {item.price_missing ? (
                                <div className="flex flex-col items-end gap-1">
                                  <span className="text-xs text-amber-600 font-medium">Price missing</span>
                                  <div className="flex items-center gap-1">
                                    <span className="text-sm text-slate-400">£</span>
                                    <input
                                      type="number"
                                      value={item.price || ''}
                                      onChange={e => setImportResult(prev => prev ? {
                                        ...prev,
                                        items: prev.items.map((it, i) => i === globalIdx ? { ...it, price: parseFloat(e.target.value) || 0, price_missing: !e.target.value } : it)
                                      } : prev)}
                                      placeholder="0.00"
                                      step="0.50"
                                      className="w-16 text-sm text-right border border-amber-400 bg-amber-50 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-orange-400"
                                    />
                                  </div>
                                </div>
                              ) : (
                                <span className="text-sm font-semibold text-orange-600">£{Number(item.price).toFixed(2)}</span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="p-5 border-t border-slate-100 flex gap-2">
              <Btn label="Back" colour="slate" onClick={() => setImportStep('upload')} />
              <Btn
                label="Next →"
                onClick={() => {
                  const newCats = importResult.categories.filter(c => !importResult.existing_categories.includes(c))
                  const initPrep: Record<string, { prep_secs: number | null; batch_size: number | null }> = {}
                  newCats.forEach(cat => { initPrep[cat] = { prep_secs: null, batch_size: null } })
                  setCategoryPrep(initPrep)
                  setImportStep('prep')
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* AI Import — Prep time */}
      {(importStep === 'prep' || importStep === 'saving') && importResult && (() => {
        const newCats = importResult.categories.filter(c => !importResult.existing_categories.includes(c))
        return (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
              <div className="p-5 border-b border-slate-100">
                <h3 className="font-black text-slate-900">Kitchen setup</h3>
                <p className="text-slate-400 text-sm mt-0.5">Help customers know how long to wait — you can always change these later.</p>
              </div>

              <div className="mx-5 mt-4 mb-0 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex-shrink-0">
                <p className="text-xs font-semibold text-blue-700 mb-2">How kitchen setup works</p>
                <p className="text-xs text-blue-600 mb-1.5">
                  <strong>Example:</strong> If your kitchen can cook 10 pizzas every 10 minutes, set Pizza to <strong>10 min prep</strong> and <strong>10 items at a time</strong>. Once 10 pizza items are in progress, the next customer is automatically told their order takes 20 minutes.
                </p>
                <p className="text-xs text-blue-500">
                  Items like drinks or dips that are ready instantly can be left as "No wait time" and "No limit".
                </p>
                <p className="text-xs text-blue-500 mt-1.5">
                  You can also set a maximum orders-per-window limit when creating an event — this acts as a safety cap across all categories combined.
                </p>
              </div>

              <div className="overflow-y-auto flex-1 p-5 space-y-5">
                {newCats.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">All categories already exist — no times to set.</p>
                ) : (
                  newCats.map(cat => {
                    const prep = categoryPrep[cat] || { prep_secs: null, batch_size: null }
                    return (
                      <div key={cat} className="space-y-3">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-slate-900">{cat}</p>
                          {prep.prep_secs && prep.prep_secs > 0 ? (
                            <span className="text-xs px-2 py-0.5 bg-orange-50 text-orange-600 border border-orange-100 rounded-full">🔥 Cooked</span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 bg-green-50 text-green-600 border border-green-100 rounded-full">⚡ Instant</span>
                          )}
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-slate-700">Prep time per order</p>
                            <p className="text-xs text-slate-400">How long one order takes to prepare</p>
                          </div>
                          <select
                            value={prep.prep_secs ?? ''}
                            onChange={e => setCategoryPrep(prev => ({
                              ...prev,
                              [cat]: { ...prev[cat], prep_secs: e.target.value === '' ? null : parseInt(e.target.value) }
                            }))}
                            className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-orange-400"
                          >
                            <option value="">No wait time</option>
                            <option value="120">2 minutes</option>
                            <option value="300">5 minutes</option>
                            <option value="600">10 minutes</option>
                            <option value="900">15 minutes</option>
                            <option value="1200">20 minutes</option>
                            <option value="1800">30 minutes</option>
                            <option value="2700">45 minutes</option>
                            <option value="3600">60 minutes</option>
                          </select>
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-slate-700">Items at a time</p>
                            <p className="text-xs text-slate-400">How many items your kitchen can cook simultaneously</p>
                          </div>
                          <select
                            value={prep.batch_size ?? ''}
                            onChange={e => setCategoryPrep(prev => ({
                              ...prev,
                              [cat]: { ...prev[cat], batch_size: e.target.value === '' ? null : parseInt(e.target.value) }
                            }))}
                            className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-orange-400"
                          >
                            <option value="">No limit</option>
                            <option value="1">1 item</option>
                            <option value="2">2 items</option>
                            <option value="3">3 items</option>
                            <option value="4">4 items</option>
                            <option value="5">5 items</option>
                            <option value="8">8 items</option>
                            <option value="10">10 items</option>
                            <option value="20">20 items</option>
                          </select>
                        </div>
                        {(!prep.prep_secs || prep.prep_secs === 0) && (
                          <p className="text-xs text-slate-400">
                            Instant items don't count towards kitchen capacity — customers receive them immediately.
                          </p>
                        )}
                      </div>
                    )
                  })
                )}
              </div>

              <div className="p-5 border-t border-slate-100 flex gap-2">
                <Btn label="← Back" colour="slate" onClick={() => setImportStep('review')} disabled={importStep === 'saving'} />
                <div className="flex-1" />
                <Btn label="Skip for now" colour="ghost" onClick={handleCommitMenu} loading={importStep === 'saving'} />
                <Btn label="Save & add to menu" onClick={handleCommitMenu} loading={importStep === 'saving'} />
              </div>
            </div>
          </div>
        )
      })()}

      {/* AI Import — Done */}
      {importStep === 'done' && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-2xl text-center">
            <p className="text-5xl mb-4">✅</p>
            <p className="font-black text-slate-900 mb-1">Menu imported!</p>
            <p className="text-slate-400 text-sm">Your items have been added to the menu.</p>
            {importDoneSkipped > 0 && (
              <p className="text-sm text-slate-400 mt-1">
                {importDoneSkipped} duplicate{importDoneSkipped !== 1 ? 's' : ''} skipped
              </p>
            )}
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

type EditingEvent = { id?: string; venue_name: string; town: string; postcode: string; address: string; event_date: string; start_time: string; end_time: string; notes: string; maxOrdersPerSlot?: number | null }

function ScheduleTab({ token, bundles, categories, api, reload, showToast }: {
  token: string; bundles: Bundle[]; categories: Category[]
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
      if (editingEvent.start_time && editingEvent.end_time) {
        await api('save_slot_capacity', {
          eventDate: editingEvent.event_date,
          startTime: editingEvent.start_time,
          endTime: editingEvent.end_time,
          maxOrdersPerSlot: editingEvent.maxOrdersPerSlot ?? null,
        })
      }
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
                {categories.some(c => c.prep_secs > 0) && (
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Kitchen capacity</label>
                    <p className="text-xs text-slate-400 mb-2">Maximum orders your kitchen can handle per 5-minute window. Leave blank for no limit.</p>
                    <select
                      value={editingEvent.maxOrdersPerSlot ?? ''}
                      onChange={e => setEditingEvent(p => ({...p!, maxOrdersPerSlot: e.target.value ? parseInt(e.target.value) : null}))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
                    >
                      <option value="">No limit</option>
                      <option value="3">3 orders per 5 mins (very small kitchen)</option>
                      <option value="5">5 orders per 5 mins (small kitchen)</option>
                      <option value="8">8 orders per 5 mins (medium kitchen)</option>
                      <option value="10">10 orders per 5 mins (busy kitchen)</option>
                      <option value="15">15 orders per 5 mins (large kitchen)</option>
                      <option value="20">20 orders per 5 mins (very high volume)</option>
                    </select>
                  </div>
                )}
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
  const [whatsappSender, setWhatsappSender] = useState(truck.whatsapp_sender ?? '')
  const [preferredContact, setPreferredContact] = useState(truck.preferred_contact_method ?? '')
  const [allowCancellation, setAllowCancellation] = useState(truck.allow_customer_cancellation ?? true)
  const [cancellationCutoff, setCancellationCutoff] = useState(truck.cancellation_cutoff_mins ?? 30)
  const [vans, setVans] = useState<Van[]>([])
  const [addingVan, setAddingVan] = useState(false)
  const [newVanName, setNewVanName] = useState('')
  const [renamingVanId, setRenamingVanId] = useState<string | null>(null)
  const [renameVanName, setRenameVanName] = useState('')
  const [showAutoPauseInfo, setShowAutoPauseInfo] = useState<string | null>(null)
  const [deletingVan, setDeletingVan] = useState<Van | null>(null)
  const [deleteVanConfirm, setDeleteVanConfirm] = useState('')
  const [showVanBillingModal, setShowVanBillingModal] = useState(false)
  const [showVanUpgradeModal, setShowVanUpgradeModal] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [generatingQR, setGeneratingQR] = useState(false)

  useEffect(() => {
    api('get_vans').then(r => setVans(r.vans || [])).catch(() => {})
  }, [])

  const orderUrl = `${process.env.NEXT_PUBLIC_HATCHGRAB_URL}/order/${truck.dashboard_token}`

  const handleGenerateQR = async () => {
    setGeneratingQR(true)
    try {
      const { generateQRCodePNG } = await import('@/lib/generateQRCode')
      const dataUrl = await generateQRCodePNG({
        url: orderUrl,
        logoUrl: truck.logo_storage_path
          ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/truck-media/${truck.logo_storage_path}`
          : null,
        truckName: truck.name,
        hatchgrabLogoUrl: `${window.location.origin}/logos/hatchgrab.png`,
      })
      setQrDataUrl(dataUrl)
    } catch (err) {
      console.error('QR generation failed:', err)
    }
    setGeneratingQR(false)
  }

  const can = (feature: Feature) => canAccess(
    truck.plan,
    feature,
    truck.feature_overrides ?? {},
    truck.trial_expires_at ?? null
  )

  // £/month for each additional van beyond included count
  // TODO: Wire to Stripe billing API when payments are integrated.
  const VAN_ADDON_PRICE: Record<string, number> = { starter: 0, pro: 29, max: 49, trial: 0 }
  const INCLUDED_VANS: Record<string, number> = { starter: 1, pro: 2, max: 999, trial: 999 }

  const handleAddVanClick = () => {
    const included = INCLUDED_VANS[truck.plan] ?? 1
    const addonPrice = VAN_ADDON_PRICE[truck.plan] ?? 0
    if (vans.length >= included) {
      if (addonPrice > 0) {
        setShowVanBillingModal(true)
      } else if (truck.plan === 'starter') {
        setShowVanUpgradeModal(true)
      } else {
        setAddingVan(true)
      }
    } else {
      setAddingVan(true)
    }
  }

  const saveSetting = async (key: string, value: string | boolean | number | null) => {
    try {
      await api('update_truck', { data: { [key]: value } })
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
      reload()
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  const uploadLogo = async (file: File) => {
    setUploadingLogo(true)
    try {
      const { upload_url, path } = await api('get_upload_url', { filename: file.name, content_type: file.type })
      await fetch(upload_url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      setForm(p => ({ ...p, logo_storage_path: path }))
      await api('update_settings', { logo_storage_path: path })
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

  const handleToggleAutoPause = async (vanId: string, enabled: boolean) => {
    setVans(prev => prev.map(v => v.id === vanId ? { ...v, auto_pause_on_offline: enabled } : v))
    if (enabled) {
      setShowAutoPauseInfo(vanId)
    } else {
      setShowAutoPauseInfo(null)
    }
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
            <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
              {uploadingLogo ? 'Uploading…' : 'Upload logo'}
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
        <Input label="Cuisine type" required value={form.cuisine_type || ''} onChange={v => setForm(p => ({...p, cuisine_type: v}))} placeholder="e.g. Italian, Thai, Burgers" />
      </Card>

      {/* Contact */}
      <Card className="p-4 space-y-3">
        <p className="font-bold text-slate-900">Contact</p>
        <Input label="Email" required type="email" value={form.contact_email || ''} onChange={v => setForm(p => ({...p, contact_email: v}))} placeholder="hello@yourtruck.com" />
        <Input label="Phone" required type="tel" value={form.contact_phone || ''} onChange={v => setForm(p => ({...p, contact_phone: v}))} placeholder="07700 900123" />
      </Card>

      {/* Online presence & social */}
      <Card className="p-4 space-y-3">
        <p className="font-bold text-slate-900">Online presence &amp; social</p>

        {/* Website */}
        <div className="flex items-center gap-3">
          <label className="text-sm text-slate-600 w-24 flex-shrink-0">Website</label>
          <input
            type="text"
            value={(form as any).website || ''}
            onChange={e => setForm(p => ({...p, website: e.target.value}))}
            onBlur={() => saveSetting('website', (form as any).website || '')}
            placeholder="https://yourtruck.co.uk"
            className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>

        {/* Auto-replies subsection */}
        <div className="border-t border-slate-100 pt-4 mt-1">
          <p className="text-sm font-bold text-slate-700 mb-0.5">Auto-replies</p>
          <p className="text-xs text-slate-400 mb-3">Requires Business accounts on each platform.</p>

          <div className="space-y-3">
            {/* WhatsApp */}
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-600 w-24 flex-shrink-0">WhatsApp</label>
              {can('whatsapp_replies') ? (
                <>
                  <input
                    type="tel"
                    value={whatsappSender}
                    onChange={e => setWhatsappSender(e.target.value)}
                    placeholder="+447700900000"
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                  <button
                    onClick={() => saveSetting('whatsapp_sender', whatsappSender)}
                    className="text-xs px-3 py-2 bg-teal-600 text-white font-medium rounded-xl flex-shrink-0"
                  >
                    Connect
                  </button>
                </>
              ) : (
                <>
                  <input
                    type="tel"
                    disabled
                    placeholder="+447700900000"
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-50 text-slate-400 cursor-not-allowed"
                  />
                  <FeatureGate
                    feature="whatsapp_replies"
                    plan={truck.plan}
                    overrides={truck.feature_overrides}
                    trialExpiresAt={truck.trial_expires_at}
                    showUpgrade={true}
                  />
                </>
              )}
            </div>

            {/* Messenger */}
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-600 w-24 flex-shrink-0">Messenger</label>
              <input
                type="text"
                disabled
                placeholder="Coming soon"
                className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-50 text-slate-400 cursor-not-allowed"
              />
              <button
                disabled
                className="text-xs px-3 py-2 border border-slate-200 text-slate-400 rounded-xl whitespace-nowrap cursor-not-allowed flex-shrink-0"
              >
                Connect
              </button>
            </div>

            {/* Instagram */}
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-600 w-24 flex-shrink-0">Instagram</label>
              <input
                type="text"
                value={form.social_instagram || ''}
                onChange={e => setForm(p => ({...p, social_instagram: e.target.value}))}
                onBlur={() => saveSetting('social_instagram', form.social_instagram || '')}
                placeholder="@youraccount"
                className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
              <button
                disabled
                className="text-xs px-3 py-2 border border-slate-200 text-slate-400 rounded-xl whitespace-nowrap cursor-not-allowed flex-shrink-0"
              >
                Connect
              </button>
            </div>

            {/* Facebook */}
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-600 w-24 flex-shrink-0">Facebook</label>
              <input
                type="text"
                value={form.social_facebook || ''}
                onChange={e => setForm(p => ({...p, social_facebook: e.target.value}))}
                onBlur={() => saveSetting('social_facebook', form.social_facebook || '')}
                placeholder="facebook.com/yourtruck"
                className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
              <button
                disabled
                className="text-xs px-3 py-2 border border-slate-200 text-slate-400 rounded-xl whitespace-nowrap cursor-not-allowed flex-shrink-0"
              >
                Connect
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* QR Code */}
      <Card className="p-4">
        <p className="font-bold text-slate-900 mb-1">Order QR code</p>
        <p className="text-xs text-slate-500 mb-4">
          Print or display this code so customers can scan and pre-order.
          Place it at your hatch, on your van, or share it online.
        </p>
        {qrDataUrl ? (
          <div className="flex flex-col items-center gap-4">
            <img
              src={qrDataUrl}
              alt="Order QR code"
              className="w-48 h-auto rounded-xl border border-slate-100 shadow-sm"
            />
            <div className="flex gap-3 w-full">
              <a
                href={qrDataUrl}
                download={`${truck.name.toLowerCase().replace(/\s+/g, '-')}-qr.png`}
                className="flex-1 flex items-center justify-center gap-2
                           px-4 py-2.5 bg-orange-600 text-white text-sm
                           font-medium rounded-xl"
              >
                Download PNG
              </a>
              <button
                onClick={() => setQrDataUrl(null)}
                className="px-4 py-2.5 border border-slate-200 text-slate-600
                           text-sm rounded-xl"
              >
                Regenerate
              </button>
            </div>
            <p className="text-xs text-slate-400 self-start">{orderUrl}</p>
          </div>
        ) : (
          <button
            onClick={handleGenerateQR}
            disabled={generatingQR}
            className="w-full bg-orange-600 text-white font-semibold
                       py-3 rounded-xl text-sm disabled:opacity-40"
          >
            {generatingQR ? 'Generating...' : 'Generate QR code'}
          </button>
        )}
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

      {/* Customer contact */}
      <Card className="p-4 space-y-3">
        <div>
          <p className="font-bold text-slate-900">Customer contact</p>
          <p className="text-xs text-slate-500 mt-0.5">
            How customers should contact you about their order. This appears on their confirmation email.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm text-slate-600 w-36 flex-shrink-0">Preferred method</label>
          <select
            value={preferredContact}
            onChange={async e => {
              const val = e.target.value
              setPreferredContact(val)
              await saveSetting('preferred_contact_method', val || null)
            }}
            className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white"
          >
            <option value="">Not specified</option>
            <option value="phone">Phone call</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="facebook">Facebook Messenger</option>
            <option value="messenger">Messenger</option>
            <option value="instagram">Instagram DM</option>
            <option value="email">Email</option>
          </select>
        </div>

        {preferredContact === 'phone' && !truck.contact_phone && (
          <p className="text-xs text-amber-600">⚠️ Add your phone number in truck details above</p>
        )}
        {preferredContact === 'whatsapp' && !truck.whatsapp_sender && (
          <p className="text-xs text-amber-600">⚠️ Add your WhatsApp number in Online presence &amp; social above</p>
        )}
        {preferredContact === 'facebook' && !truck.social_facebook && (
          <p className="text-xs text-amber-600">⚠️ Add your Facebook page in Online presence &amp; social above</p>
        )}
        {preferredContact === 'instagram' && !truck.social_instagram && (
          <p className="text-xs text-amber-600">⚠️ Add your Instagram handle in Online presence &amp; social above</p>
        )}
        {preferredContact === 'email' && !truck.contact_email && (
          <p className="text-xs text-amber-600">⚠️ Add your contact email in truck details above</p>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <div>
            <p className="text-sm text-slate-700">Allow customers to cancel orders</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Customers can cancel up to{' '}
              <select
                value={cancellationCutoff}
                onChange={async e => {
                  const val = parseInt(e.target.value)
                  setCancellationCutoff(val)
                  await saveSetting('cancellation_cutoff_mins', val)
                }}
                className="border-b border-slate-300 text-xs px-1 bg-transparent"
              >
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="60">60 minutes</option>
                <option value="120">2 hours</option>
              </select>
              {' '}before their pickup time
            </p>
          </div>
          <button
            onClick={async () => {
              const next = !allowCancellation
              setAllowCancellation(next)
              await saveSetting('allow_customer_cancellation', next)
            }}
            className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${allowCancellation ? 'bg-teal-500' : 'bg-slate-300'}`}
          >
            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${allowCancellation ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
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

      {/* Vans */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Vans</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Manage your vehicles. Each van has its own order screen.
            </p>
          </div>
          <button
            onClick={handleAddVanClick}
            className="text-xs px-3 py-1.5 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700"
          >
            + Add van
          </button>
        </div>

        {vans.map(van => (
          <div key={van.id}>
            <div className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
              <p className="text-sm font-medium text-slate-900">{van.name}</p>
              <div className="flex items-center gap-2">
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

            {/* Offline Order Protection card */}
            <div className={`mt-2 rounded-xl border p-3 transition-colors ${
              van.auto_pause_on_offline
                ? 'border-teal-200 bg-teal-50'
                : 'border-slate-100 bg-slate-50'
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className={`text-sm font-semibold ${
                    van.auto_pause_on_offline ? 'text-teal-800' : 'text-slate-600'
                  }`}>
                    Offline order protection
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {van.auto_pause_on_offline
                      ? 'Enabled — online orders pause if kitchen device loses connection'
                      : 'Disabled — online orders continue even if kitchen device goes offline'
                    }
                  </p>
                </div>
                <button
                  onClick={() => handleToggleAutoPause(van.id, !van.auto_pause_on_offline)}
                  className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 mt-0.5 ${
                    van.auto_pause_on_offline ? 'bg-teal-500' : 'bg-slate-300'
                  }`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    van.auto_pause_on_offline ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              {van.auto_pause_on_offline && showAutoPauseInfo === van.id && (
                <div className="mt-3 pt-3 border-t border-teal-200">
                  <p className="text-xs text-teal-700">
                    <strong>Keep your screen on during service.</strong> This feature
                    works by checking your device is online every 15 seconds. If the
                    screen turns off and the device loses its signal, online ordering
                    will pause automatically for customers until the device reconnects.
                  </p>
                  <button
                    onClick={() => setShowAutoPauseInfo(null)}
                    className="mt-3 w-full py-2 bg-teal-600 text-white text-xs font-semibold rounded-lg"
                  >
                    Got it
                  </button>
                </div>
              )}
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

      {/* Van billing modal */}
      {showVanBillingModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 flex flex-col gap-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Add another van</h3>
              <p className="text-sm text-slate-500 mt-2">
                Your {truck.plan === 'pro' ? 'Pro' : 'Max'} plan includes{' '}
                {truck.plan === 'pro' ? '2 vans' : 'unlimited vans'}.
                Adding an additional van costs{' '}
                <strong>£{VAN_ADDON_PRICE[truck.plan]}/month</strong>{' '}
                and will be added to your next billing cycle.
              </p>
              <div className="mt-3 bg-slate-50 rounded-xl px-4 py-3">
                <p className="text-xs text-slate-500">
                  ⚠️ Note: Billing adjustment is processed manually during early access.
                  You will receive a confirmation email within 24 hours.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowVanBillingModal(false)}
                className="flex-1 border border-slate-200 text-slate-600 py-3 rounded-xl text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowVanBillingModal(false); setAddingVan(true) }}
                className="flex-1 bg-orange-600 text-white font-semibold py-3 rounded-xl text-sm hover:bg-orange-700"
              >
                Add van — £{VAN_ADDON_PRICE[truck.plan]}/mo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Van upgrade modal (starter plan) */}
      {showVanUpgradeModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 flex flex-col gap-4">
            <h3 className="text-lg font-semibold text-slate-900">Upgrade to add more vans</h3>
            <p className="text-sm text-slate-500">
              The Starter plan includes 1 van. Upgrade to Pro or Max to add additional vans.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowVanUpgradeModal(false)}
                className="flex-1 border border-slate-200 text-slate-600 py-3 rounded-xl text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
              <a
                href="/pricing"
                className="flex-1 bg-orange-600 text-white font-semibold py-3 rounded-xl text-sm text-center hover:bg-orange-700"
              >
                View plans
              </a>
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

// ── BillingTab ──────────────────────────────────────────────────
type FeatureCellValue = boolean | 'coming_soon'
interface FeatureRow { name: string; detail?: string; starter: FeatureCellValue; pro: FeatureCellValue; max: FeatureCellValue }
const BILLING_SECTIONS: { title: string; rows: FeatureRow[] }[] = [
  {
    title: 'Transaction fees',
    rows: [
      { name: 'Walk-up orders — platform fee',      detail: '0% on all plans',           starter: true,  pro: true,  max: true  },
      { name: 'Online pre-orders — platform fee',   detail: '0.99% per transaction',     starter: false, pro: true,  max: true  },
      { name: 'Online pre-orders — card processing',detail: '~1.5% + 20p per transaction (Stripe)', starter: false, pro: true,  max: true  },
      { name: 'Pay at Hatch — no card processing',  detail: 'Customers pay in person',   starter: true,  pro: false, max: false },
    ],
  },
  {
    title: 'Core operations',
    rows: [
      { name: 'Village Foodie discovery map listing', starter: true, pro: true, max: true },
      { name: 'Web dashboard',                        starter: true, pro: true, max: true },
      { name: 'iPad kitchen display (KDS)',            starter: true, pro: true, max: true },
      { name: 'QR code menu & ordering',              starter: true, pro: true, max: true },
      { name: 'Meal deals & upsell engine',           starter: true, pro: true, max: true },
      { name: 'Walk-up order processing',             starter: true, pro: true, max: true },
      { name: 'Online ordering — Pay at Hatch',       starter: true, pro: false, max: false },
      { name: 'Instant sold out toggle',              starter: true, pro: true, max: true },
      { name: 'Automated stock countdown',            starter: true, pro: true, max: true },
    ],
  },
  {
    title: 'Online sales & automation',
    rows: [
      { name: 'Offline sync protection',              starter: false, pro: true,           max: true },
      { name: 'Online payments (Stripe Connect)',     starter: false, pro: true,           max: true },
      { name: 'Dynamic fee splitting & tax controls', starter: false, pro: true,           max: true },
      { name: 'Advance pre-ordering',                 starter: false, pro: true,           max: true },
      { name: 'Customer time slot selection',         starter: false, pro: true,           max: true },
      { name: 'Smart batch pacing',                   starter: false, pro: true,           max: true },
      { name: 'Auto-accept online orders',            starter: false, pro: true,           max: true },
      { name: 'Instagram & Messenger auto-replies',   starter: false, pro: true,           max: true },
      { name: 'Personalised schedule generator',      starter: false, pro: 'coming_soon',  max: 'coming_soon' },
      { name: 'Advanced reporting',                   starter: false, pro: 'coming_soon',  max: 'coming_soon' },
    ],
  },
  {
    title: 'Max tier',
    rows: [
      { name: 'Unlimited WhatsApp auto-replies', starter: false, pro: false, max: true },
      { name: 'Kitchen ticket printing',         starter: false, pro: false, max: true },
      { name: 'Multi-device kitchen sync',       starter: false, pro: false, max: true },
      { name: 'Customer-facing display',         starter: false, pro: false, max: 'coming_soon' },
      { name: 'Event & festival pricing',        starter: false, pro: false, max: 'coming_soon' },
    ],
  },
]

const PLAN_PRICE: Record<string, string> = {
  starter: 'Free',
  pro: '£29/month',
  max: '£49/month',
  trial: 'Free trial (Max features)',
}
const PLAN_DESCRIPTION: Record<string, string> = {
  starter: 'Weekend traders & simple walk-up pitches',
  pro: 'Busy trucks scaling online pre-orders',
  max: 'High-volume operations & festivals',
  trial: 'Full access during your trial period',
}

function BillingTab({ truck }: { truck: Truck | null }) {
  if (!truck) return null
  const currentPlan = truck.plan
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="max-w-2xl flex flex-col gap-6">
      {/* Current plan card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide">Current plan</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {PLAN_META[currentPlan]?.name ?? currentPlan}
            </p>
            <p className="text-sm text-slate-500 mt-0.5">{PLAN_PRICE[currentPlan] ?? ''}</p>
            <p className="text-xs text-slate-400 mt-1">{PLAN_DESCRIPTION[currentPlan] ?? ''}</p>
            {truck.trial_expires_at && (
              <p className="text-xs text-amber-600 mt-1">
                Trial ends {formatDate(truck.trial_expires_at)}
              </p>
            )}
          </div>
          {currentPlan !== 'max' && currentPlan !== 'trial' && (
            <button className="px-4 py-2 bg-orange-600 text-white text-sm font-medium rounded-xl hover:bg-orange-700 transition-colors">
              Upgrade
            </button>
          )}
        </div>

        {/* Feature matrix */}
        {BILLING_SECTIONS.map(section => (
          <div key={section.title} className="mb-2">
            {/* Section heading row */}
            <div className="flex items-center justify-between py-2 border-t-2 border-slate-100 mt-3 first:mt-0">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                {section.title}
              </span>
              <div className="flex gap-8">
                {(['starter', 'pro', 'max'] as const).map(p => (
                  <div key={p} className={`w-16 text-center text-xs font-bold uppercase tracking-wide ${
                    p === currentPlan || (currentPlan === 'trial' && p === 'max')
                      ? 'text-orange-600' : 'text-slate-400'
                  }`}>
                    {p}
                  </div>
                ))}
              </div>
            </div>

            {/* Feature rows */}
            {section.rows.map(row => (
              <div key={row.name} className="flex items-center justify-between py-2 border-t border-slate-100">
                <div className="flex-1 pr-4">
                  <span className="text-sm text-slate-700">{row.name}</span>
                  {row.detail && (
                    <p className="text-xs text-slate-400 mt-0.5">{row.detail}</p>
                  )}
                </div>
                <div className="flex gap-8">
                  {(['starter', 'pro', 'max'] as const).map(p => {
                    const val = row[p]
                    const isCurrentPlan = p === currentPlan || (currentPlan === 'trial' && p === 'max')
                    return (
                      <div key={p} className="w-16 text-center">
                        {val === true && (
                          <span className={`text-sm font-semibold ${isCurrentPlan ? 'text-orange-500' : 'text-slate-400'}`}>✓</span>
                        )}
                        {val === false && (
                          <span className="text-slate-200 text-sm">—</span>
                        )}
                        {val === 'coming_soon' && (
                          <span className="text-xs text-slate-400 italic whitespace-nowrap">Coming soon</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        ))}

        {/* Legend */}
        <div className="mt-4 pt-4 border-t border-slate-100">
          <p className="text-xs text-slate-400">
            Card processing fees are charged by Stripe and vary by card type. Typical UK rate: 1.5% + 20p per transaction.
          </p>
        </div>
      </div>

      {/* Billing section */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <p className="text-sm font-semibold text-slate-900 mb-4">Billing & payments</p>
        <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 flex items-start gap-3">
          <span className="text-amber-500 flex-shrink-0 mt-0.5">⚙️</span>
          <div>
            <p className="text-sm font-medium text-amber-800">Payment setup coming soon</p>
            <p className="text-xs text-amber-700 mt-0.5">
              We&apos;re setting up our payment system. During early access, billing is handled manually.
              We&apos;ll contact you when automated billing is ready.
            </p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-100">
          <p className="text-xs text-slate-400">
            {truck.name} · {PLAN_META[currentPlan]?.name ?? currentPlan} plan{truck.trial_expires_at ? ' (trial)' : ''}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── ReportsTab ──────────────────────────────────────────────────
interface ReportData {
  totalOrders: number
  totalRevenue: number
  avgOrder: number
  topItems: Array<{ name: string; qty: number; revenue: number }>
  dealsRedeemed: number
  dealSavings: number
  upsellRevenue: number
}
interface RecentEvent { id: string; venue_name: string | null; event_date: string; status: string }

function ReportsTab({ truck, api }: { truck: Truck | null; api: (a: string, e?: any) => Promise<any> }) {
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0])
  const [reportEventId, setReportEventId] = useState('')
  const [reportData, setReportData] = useState<ReportData | null | undefined>(undefined)
  const [reportLoaded, setReportLoaded] = useState(false)
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api('get_recent_events').then(r => setRecentEvents(r.events || [])).catch(() => {})
    loadReport()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadReport = async (date = reportDate, eventId = reportEventId) => {
    setLoading(true)
    try {
      const r = await api('get_report', { date, eventId: eventId || undefined })
      setReportData(r.report ?? null)
    } catch { setReportData(null) }
    finally { setLoading(false); setReportLoaded(true) }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="date"
          value={reportDate}
          onChange={e => setReportDate(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white"
        />
        <select
          value={reportEventId}
          onChange={e => setReportEventId(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white"
        >
          <option value="">All events</option>
          {recentEvents.map(event => (
            <option key={event.id} value={event.id}>
              {event.venue_name || 'Event'} — {event.event_date}
            </option>
          ))}
        </select>
        <button
          onClick={() => loadReport(reportDate, reportEventId)}
          disabled={loading}
          className="px-4 py-2 bg-orange-600 text-white text-sm font-medium rounded-xl hover:bg-orange-700 transition-colors disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'View report'}
        </button>
      </div>

      {reportData && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-400">Orders</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{reportData.totalOrders}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-400">Revenue</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">£{reportData.totalRevenue.toFixed(2)}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-400">Avg order</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">£{reportData.avgOrder.toFixed(2)}</p>
            </div>
          </div>

          {/* Top items */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-slate-900 mb-3">Items sold</p>
            {reportData.topItems.map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 w-4">{i + 1}</span>
                  <span className="text-sm text-slate-700">{item.name}</span>
                  <span className="text-xs text-slate-400">×{item.qty}</span>
                </div>
                <span className="text-sm font-medium text-slate-900">£{item.revenue.toFixed(2)}</span>
              </div>
            ))}
          </div>

          {/* Deals summary */}
          {reportData.dealsRedeemed > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-slate-900 mb-3">Deals & discounts</p>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-slate-600">Deals redeemed</span>
                <span className="text-sm font-medium text-slate-900">{reportData.dealsRedeemed}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-t border-slate-100">
                <span className="text-sm text-slate-600">Customer savings</span>
                <span className="text-sm font-medium text-green-600">£{reportData.dealSavings.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Pro upgrade prompt */}
          {truck?.plan === 'starter' && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
              <p className="text-sm font-semibold text-slate-700">Want more insights?</p>
              <p className="text-xs text-slate-500 mt-1">
                Upgrade to Pro for trend reports, export to CSV, and weekly summaries by email.
              </p>
            </div>
          )}
        </>
      )}

      {reportData === null && reportLoaded && (
        <div className="text-center py-12">
          <p className="text-sm text-slate-400">No orders found for this period.</p>
        </div>
      )}
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
  const [inviteRole, setInviteRole] = useState<'owner' | 'manager' | 'staff'>('staff')
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
    setInviteName(''); setInviteEmail(''); setInviteRole('staff')
    // Pre-select the only van if there's just one
    setInviteVanIds(vans.length === 1 ? [vans[0].id] : [])
    setInvitingMember(true)
  }

  const editMember = (member: TeamMember) => {
    setEditingMember(member)
    setInviteName(member.name || '')
    setInviteEmail(member.email)
    setInviteRole(member.role)
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
                onChange={e => setInviteRole(e.target.value as 'owner' | 'manager' | 'staff')}
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
              >
                <option value="staff">Staff — Take orders and manage the kitchen</option>
                <option value="manager">Manager — Full access including menu and settings</option>
                <option value="owner">Owner — Full access including team and billing</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Van access</label>
              {vans.length === 1 ? (
                <label className="flex items-center gap-2 py-1.5 opacity-60 cursor-not-allowed">
                  <input type="checkbox" checked disabled />
                  <span className="text-sm text-slate-700">{vans[0].name} <span className="text-slate-400">(only van)</span></span>
                </label>
              ) : (
                <>
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
                  {vans.length > 1 && inviteVanIds.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">Select at least one van</p>
                  )}
                </>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={closeModal}
                className="flex-1 border border-slate-200 text-slate-600 py-3 rounded-xl text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={sendInvite}
                disabled={!inviteEmail || inviteLoading || (vans.length > 1 && inviteVanIds.length === 0)}
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