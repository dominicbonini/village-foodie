'use client'
// app/manage/[token]/page.tsx
// Truck management page — menu, modifiers, deals, schedule, settings

import { useState, useEffect, useCallback, useMemo, use, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { PLAN_META, canAccess, maxVans } from '@/lib/features'
import type { Plan, Feature } from '@/lib/features'
import { PLAN_PRICES, PLAN_DESCRIPTIONS, TRANSACTION_ROWS, FEATURE_SECTIONS, FOOTNOTES } from '@/lib/plan-features'
import { FeatureGate } from '@/components/FeatureGate'
import type { TruckEvent } from '@/components/dashboard/types'
import { Tooltip } from '@/components/ui/Tooltip'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useDragDrop } from '@/lib/useDragDrop'
import { formatTime } from '@/lib/time-utils'

// ── Types ─────────────────────────────────────────────────────
interface Truck { id: string; name: string; description: string | null; cuisine_type: string | null; logo_storage_path: string | null; contact_email: string | null; contact_phone: string | null; social_instagram: string | null; social_facebook: string | null; auto_accept: boolean; dashboard_token: string; crew_mode: 'solo' | 'full'; kds_mode: boolean; keep_screen_on: boolean; plan: Plan; feature_overrides: Record<string, boolean> | null; trial_expires_at: string | null; whatsapp_sender: string | null; allergen_info_url: string | null; allergen_info_text: string | null; preferred_contact_method: string | null; allow_customer_cancellation: boolean; cancellation_cutoff_mins: number; is_test?: boolean; default_auto_open: boolean; default_auto_close: boolean; qr_code_style?: 'standard' | 'branded' }
interface Category { id: string; name: string; slug: string; prep_secs: number; batch_size: number; allow_notes: boolean; default_stock: number | null; sort_order: number; is_active: boolean }
interface Item { id: string; name: string; description: string | null; price: number; category_id: string | null; is_available: boolean; stock_count: number | null; default_stock: number | null; sort_order: number; image_path: string | null; allergens: string[]; dietary_info: string[] }
interface ModifierGroup { id: string; name: string; is_required: boolean; min_choices: number; max_choices: number }
interface ModifierOption { id: string; group_id: string; name: string; price_adjustment: number; type: string; sort_order: number }
interface Bundle { id: string; name: string; description: string | null; bundle_price: number; original_price: number | null; is_available: boolean; apply_to_new_events: boolean; start_time: string | null; end_time: string | null; slot_1_category: string | null; slot_2_category: string | null; slot_3_category: string | null; slot_4_category: string | null; slot_5_category: string | null; slot_6_category: string | null; stock_warning?: string | null }
interface Van { id: string; truck_id: string; name: string; kds_token: string; active: boolean; auto_pause_on_offline: boolean; show_cooking_step: boolean; kitchen_capacity: number | null }
interface UpsellRule { id: string; trigger_category: string; suggest_category: string; max_suggestions: number; show_at_checkout: boolean }
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
function Input({ label, value, onChange, type = 'text', placeholder, required, hint, error }: { label: string; value: string | number; onChange: (v: string) => void; type?: string; placeholder?: string; required?: boolean; hint?: string; error?: string }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-600 mb-1">{label}{required && <span className="text-red-400 ml-0.5">*</span>}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className={`w-full border rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white ${error ? 'border-red-400 bg-red-50' : 'border-slate-200'}`} />
      {hint && <p className="text-slate-400 text-xs mt-0.5">{hint}</p>}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
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
  const [operatorTrucks, setOperatorTrucks] = useState<{ id: string; name: string; dashboard_token: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{msg:string;type:'success'|'error'}|null>(null)
  const [currentUserName, setCurrentUserName] = useState<string | null>(null)
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null)
  const [currentUserFirstName, setCurrentUserFirstName] = useState<string | null>(null)
  const [currentUserLastName, setCurrentUserLastName] = useState<string | null>(null)
  const [currentUserPhone, setCurrentUserPhone] = useState<string | null>(null)
  const [pendingEmailChange, setPendingEmailChange] = useState<{ id: string; new_email: string; requested_at: string; expires_at: string } | null>(null)
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
      setOperatorTrucks(data.operatorTrucks || [])
      setPendingEmailChange(data.pendingEmailChange || null)
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
      setCurrentUserFirstName(d.first_name ?? null)
      setCurrentUserLastName(d.last_name ?? null)
      setCurrentUserPhone(d.phone ?? null)
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
    { id: 'schedule',  label: 'Schedule',  icon: '📅', roles: ['owner', 'manager'] },
    { id: 'deals',     label: 'Deals',     icon: '🎁', roles: ['owner', 'manager'] },
    { id: 'modifiers', label: 'Extras & Upsells', icon: '⚡', roles: ['owner', 'manager'] },
    { id: 'reports',   label: 'Reports',   icon: '📊', roles: ['owner', 'manager'] },
    { id: 'team',      label: 'Team',      icon: '👥', roles: ['owner', 'manager'] },
    { id: 'settings',  label: 'Settings',  icon: '🔧', roles: ['owner', 'manager'] },
    { id: 'billing',   label: 'Billing',   icon: '💳', roles: ['owner'] },
  ]
  const tabs = allTabs.filter(t => {
    if (t.id === 'billing') return userRole === 'owner' && !truck?.is_test
    return t.roles.includes(userRole)
  })

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
                <span className="text-sm text-slate-300 hidden sm:inline">
                  {currentUserFirstName || (currentUserName || '').split(' ')[0] || currentUserName}
                </span>
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
        {activeTab === 'schedule'  && <ScheduleTab  truck={truck} token={token} bundles={bundles} categories={categories} operatorTrucks={operatorTrucks} api={api} reload={load} showToast={showToast} />}
        {activeTab === 'team'      && <TeamTab      truck={truck} token={token} api={api} reload={load} showToast={showToast}
          currentUserEmail={currentUserEmail}
          currentUserFirstName={currentUserFirstName}
          currentUserLastName={currentUserLastName}
          currentUserPhone={currentUserPhone}
          initialPendingEmailChange={pendingEmailChange}
          onProfileSaved={(firstName, lastName, phone) => {
            const fullName = `${firstName} ${lastName}`.trim()
            setCurrentUserName(fullName)
            setCurrentUserFirstName(firstName)
            setCurrentUserLastName(lastName)
            setCurrentUserPhone(phone)
          }}
        />}
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
  const [editingCat, setEditingCat] = useState<Partial<Category> | null>(categories[0] ? categories[0] as any : null)
  const [editingItem, setEditingItem] = useState<Partial<Item> | null>(null)
  const [deletingItem, setDeletingItem] = useState<Item | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadingItemPhoto, setUploadingItemPhoto] = useState(false)

  // Optimistic local item state — mirrors `items` prop but updates instantly on toggle/delete
  const [localItems, setLocalItems] = useState<Item[]>(items)
  const prevItemsRef = useRef(items)
  if (prevItemsRef.current !== items) { prevItemsRef.current = items; setLocalItems(items) }
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
      await api('upsert_category', { id: data.id, name: data.name, prep_secs: data.prep_secs || 0, batch_size: data.batch_size || 0, allow_notes: !!(data as any).allow_notes, default_stock: (data as any).default_stock ?? null })
      if (!data.id) { setEditingCat(null) } // only close for new category modal
      reload()
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  const saveItem = async () => {
    if (!editingItem?.name || !editingItem?.price) return
    setSaving(true)
    try {
      const result = await api('upsert_item', editingItem)
      showToast(editingItem.id ? 'Item updated' : 'Item added')
      if (editingItem.id) {
        // Update in-place — no reload, category stays open
        const saved = result.item || editingItem
        setLocalItems(prev => prev.map(i => i.id === editingItem.id ? { ...i, ...saved } as Item : i))
        setEditingItem(null)
      } else {
        // New item — reload to get server-assigned id, but keep category open
        const catId = editingItem.category_id
        setEditingItem(null)
        await reload()
        if (catId) handleExpandCat(catId)
      }
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  // Expand a category and auto-load it into editingCat for inline settings
  const handleExpandCat = (catId: string | null) => {
    setExpandedCat(catId)
    if (catId) {
      const cat = categories.find(c => c.id === catId)
      if (cat) setEditingCat(cat as any)
    } else {
      setEditingCat(null)
    }
  }

  const toggleItem = async (item: Item) => {
    const newAvail = !item.is_available
    setLocalItems(prev => prev.map(i => i.id === item.id ? { ...i, is_available: newAvail } : i))
    try {
      await api('toggle_item', { id: item.id, is_available: newAvail })
    } catch (e: any) {
      setLocalItems(prev => prev.map(i => i.id === item.id ? item : i))
      showToast(e.message, 'error')
    }
  }

  const confirmDeleteItem = async () => {
    if (!deletingItem) return
    const gone = deletingItem
    setLocalItems(prev => prev.filter(i => i.id !== gone.id))
    setDeletingItem(null)
    try {
      await api('delete_item', { id: gone.id })
      showToast('Item removed')
    } catch (e: any) {
      setLocalItems(prev => [...prev, gone])
      showToast(e.message, 'error')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          {/* Manage page section heading — use font-black text-slate-900 text-lg for all tab headings */}
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
        const catItems = localItems.filter(i => i.category_id === cat.id)
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
              className="flex items-center gap-3 p-4 hover:bg-slate-50 transition-colors cursor-pointer"
              onClick={(e) => {
                if (!(e.target as HTMLElement).closest('button')) {
                  handleExpandCat(isOpen ? null : cat.id)
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
                  {cat.default_stock != null && (
                    <span className="text-[11px] font-bold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{cat.default_stock} per event</span>
                  )}
                  {cat.allow_notes && <span className="text-[11px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Notes on</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-slate-400 text-xs select-none">{isOpen ? '▲' : '▼'}</span>
              </div>
            </div>

            {/* Inline category settings — visible when expanded and editingCat loaded */}
            {isOpen && editingCat?.id === cat.id && (
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
                  <div className="shrink-0">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <span className="text-xs font-bold text-slate-600 whitespace-nowrap">Allow item notes</span>
                      <Toggle
                        on={!!(editingCat as any).allow_notes}
                        onToggle={() => {
                          const newVal = !(editingCat as any).allow_notes
                          setEditingCat(p => ({...p!, allow_notes: newVal} as any))
                          saveCat({ allow_notes: newVal } as any)
                        }}
                      />
                    </label>
                    <p className="text-[10px] text-slate-400 mt-0.5 whitespace-nowrap">e.g. "no onion"</p>
                  </div>
                </div>
                {/* Row 2: Prep time + Batch size + Default stock */}
                <div className="grid grid-cols-3 gap-2">
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
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Default stock/event</label>
                    <input type="number" min="0" placeholder="e.g. 100"
                      value={(editingCat as any).default_stock ?? ''}
                      onChange={e => setEditingCat(p => ({...p!, default_stock: e.target.value === '' ? null : parseInt(e.target.value)} as any))}
                      onBlur={() => saveCat()}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" />
                    <p className="text-[10px] text-slate-400 mt-0.5">Category-wide limit</p>
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
                      <div className="flex items-baseline gap-2">
                        <p className="font-bold text-slate-900 text-sm truncate">{item.name}</p>
                        <span className="font-black text-orange-600 text-sm shrink-0">£{Number(item.price).toFixed(2)}</span>
                      </div>
                      {item.description && <p className="text-slate-400 text-xs truncate">{item.description}</p>}
                      {(item.dietary_info?.length > 0 || item.allergens?.length > 0 || item.default_stock != null || item.stock_count != null) && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {item.dietary_info?.map(d => (
                            <span key={d} className="text-[10px] px-1.5 py-0.5 bg-green-50 text-green-700 rounded-md border border-green-100">{d}</span>
                          ))}
                          {item.allergens?.map(a => (
                            <span key={a} className="text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded-md border border-amber-100">{a}</span>
                          ))}
                          {item.default_stock != null && <Badge label={`${item.default_stock} per event`} colour="slate" />}
                          {item.stock_count != null && <Badge label={`Stock: ${item.stock_count}`} colour="orange" />}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-medium hidden sm:inline ${item.is_available ? 'text-green-600' : 'text-slate-400'}`}>
                          {item.is_available ? 'Available' : 'Hidden'}
                        </span>
                        <Toggle on={item.is_available} onToggle={() => toggleItem(item)} />
                      </div>
                      <button onClick={() => setEditingItem(item)} className="text-slate-400 hover:text-orange-600 text-xs font-bold p-1.5 rounded-lg hover:bg-orange-50 transition-colors">✏️</button>
                      <button onClick={() => setDeletingItem(item)} className="text-slate-300 hover:text-red-500 text-xs p-1.5 rounded-lg hover:bg-red-50 transition-colors">🗑️</button>
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
              <div className="grid grid-cols-3 gap-3">
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
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Default stock/event</label>
                  <input type="number" min="0" placeholder="e.g. 100"
                    value={(editingCat as any).default_stock ?? ''}
                    onChange={e => setEditingCat(p => ({...p!, default_stock: e.target.value === '' ? null : parseInt(e.target.value)} as any))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
              </div>
              {/* TODO: ask operator if allow_notes during onboarding menu setup — see session notes May 2026 */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <div>
                  <p className="text-sm font-bold text-slate-700">Allow customer notes per item</p>
                  <p className="text-xs text-slate-400">Customers can add a note to each item (e.g. "no onion"). All orders also have an order-level notes field.</p>
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

      {/* Delete item confirmation modal */}
      {deletingItem && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setDeletingItem(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-4 shadow-2xl">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Remove {deletingItem.name}?</h3>
              <p className="text-sm text-slate-500 mt-2">
                This item will be hidden from your menu immediately. It won't appear on the customer order page or in the Add Order panel.
              </p>
              <p className="text-xs text-slate-400 mt-2">
                Historical orders containing this item are preserved.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeletingItem(null)}
                className="flex-1 border border-slate-200 text-slate-600 py-3 rounded-xl text-sm hover:bg-slate-50">
                Keep item
              </button>
              <button onClick={confirmDeleteItem}
                className="flex-1 bg-red-600 text-white font-semibold py-3 rounded-xl text-sm hover:bg-red-700">
                Remove item
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
                <p className="text-slate-400 text-xs mt-0.5">Shown to customers on the order page</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Price" required type="number" value={editingItem.price || ''} onChange={v => setEditingItem(p => ({...p!, price: parseFloat(v) || 0}))} placeholder="10.00" />
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Default stock per event <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="number" min="0" placeholder="e.g. 100"
                    value={(editingItem as any).default_stock ?? ''}
                    onChange={e => setEditingItem(p => ({...p!, default_stock: e.target.value === '' ? null : parseInt(e.target.value)} as any))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Pre-fills stock in Menu & Stock each event</p>
                </div>
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
// UPSELL RULES SECTION (used inside MenuTab)
// ══════════════════════════════════════════════════════════════
function UpsellRulesSection({ categories, api, showToast, adding, setAdding }: {
  categories: Category[]
  api: (a: string, e?: any) => Promise<any>
  showToast: (m: string, t?: any) => void
  adding: boolean
  setAdding: (v: boolean) => void
}) {
  const [rules, setRules] = useState<UpsellRule[]>([])
  const [loading, setLoading] = useState(true)
  const [newTrigger, setNewTrigger] = useState('')
  const [newSuggest, setNewSuggest] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await api('get_upsell_rules')
      setRules(data.rules || [])
    } catch { /* non-fatal */ }
    finally { setLoading(false) }
  }, [api])

  useEffect(() => { load() }, [load])

  const addRule = async () => {
    if (!newTrigger || !newSuggest || newTrigger === newSuggest) return
    try {
      const data = await api('upsert_upsell_rule', { trigger_category: newTrigger, suggest_category: newSuggest, max_suggestions: 3, show_at_checkout: true })
      setRules(prev => [...prev, data.rule])
      setNewTrigger(''); setNewSuggest(''); setAdding(false)
      showToast('Upsell rule added')
    } catch (e: any) { showToast(e.message, 'error') }
  }

  const deleteRule = async (rule: UpsellRule) => {
    if (!window.confirm(`Remove upsell rule "${rule.trigger_category} → ${rule.suggest_category}"?`)) return
    setRules(prev => prev.filter(r => r.id !== rule.id))
    try {
      await api('delete_upsell_rule', { id: rule.id })
      showToast('Rule removed')
    } catch (e: any) {
      setRules(prev => [...prev, rule])
      showToast(e.message, 'error')
    }
  }

  const catNames = categories.map(c => c.name)

  return (
    <Card className="p-4">
      {adding && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">When customer adds…</label>
              <select value={newTrigger} onChange={e => setNewTrigger(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
                <option value="">Choose category</option>
                {catNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Suggest items from…</label>
              <select value={newSuggest} onChange={e => setNewSuggest(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
                <option value="">Choose category</option>
                {catNames.filter(n => n !== newTrigger).map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <Btn label="Cancel" colour="slate" onClick={() => { setAdding(false); setNewTrigger(''); setNewSuggest('') }} />
            <Btn label="Add rule" onClick={addRule} />
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-slate-400 text-sm animate-pulse">Loading…</p>
      ) : rules.length === 0 ? (
        <p className="text-slate-400 text-sm">No upsell rules yet.</p>
      ) : (
        <div className="space-y-2">
          {rules.map(rule => (
            <div key={rule.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">
                  {rule.trigger_category} → {rule.suggest_category}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">Up to {rule.max_suggestions} items suggested</p>
              </div>
              {/* show_at_checkout column exists in DB but is unused — all rules are inline */}
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => deleteRule(rule)}
                  className="text-slate-400 hover:text-red-500 text-sm px-1.5 py-1 rounded hover:bg-red-50">
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ══════════════════════════════════════════════════════════════
// MODIFIERS TAB
// ══════════════════════════════════════════════════════════════
function ModifiersTab({ categories, modifierGroups, modifierOptions, categoryModGroups, api, reload, showToast }: {
  categories: Category[]; modifierGroups: ModifierGroup[]; modifierOptions: ModifierOption[]
  categoryModGroups: {category_id:string;group_id:string}[]; api: (a: string, e?: any) => Promise<any>; reload: () => void; showToast: (m: string, t?: any) => void
}) {
  // New-group creation modal (name only)
  const [newGroupName, setNewGroupName] = useState('')
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [savingGroup, setSavingGroup] = useState(false)

  // Inline rename
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [savingRename, setSavingRename] = useState(false)

  // Option modal
  const [editingOption, setEditingOption] = useState<Partial<ModifierOption> | null>(null)
  const [savingOption, setSavingOption] = useState(false)

  // Expanded card
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)

  // Upsell "add rule" form visibility — lifted from UpsellRulesSection for header button
  const [upsellAdding, setUpsellAdding] = useState(false)

  // Optimistic category assignments — local copy, no reload on toggle
  const [localCatMGs, setLocalCatMGs] = useState<{category_id:string;group_id:string}[]>(categoryModGroups)
  const prevCatMGsRef = useRef(categoryModGroups)
  if (prevCatMGsRef.current !== categoryModGroups) {
    prevCatMGsRef.current = categoryModGroups
    // Sync from parent only when parent reloads; don't clobber in-flight optimistic changes
    setLocalCatMGs(categoryModGroups)
  }

  // ── Create new group ────────────────────────────────────────────────────────
  const createGroup = async () => {
    if (!newGroupName.trim()) return
    setSavingGroup(true)
    try {
      const result = await api('upsert_modifier_group', {
        name: newGroupName.trim(), is_required: false, min_choices: 0, max_choices: 99,
      })
      const newId = result.group?.id
      setShowNewGroup(false)
      setNewGroupName('')
      await reload()
      if (newId) setExpandedGroup(newId)
      showToast('Group created')
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setSavingGroup(false) }
  }

  // ── Rename (inline) ─────────────────────────────────────────────────────────
  const startRename = (group: ModifierGroup) => {
    setRenamingGroupId(group.id)
    setRenameValue(group.name)
  }
  const saveRename = async (group: ModifierGroup) => {
    if (!renameValue.trim() || renameValue.trim() === group.name) { setRenamingGroupId(null); return }
    setSavingRename(true)
    try {
      await api('upsert_modifier_group', { id: group.id, name: renameValue.trim(), is_required: group.is_required, min_choices: group.min_choices, max_choices: group.max_choices })
      setRenamingGroupId(null)
      await reload()
      setExpandedGroup(group.id)
      showToast('Group renamed')
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setSavingRename(false) }
  }

  // ── Delete group ────────────────────────────────────────────────────────────
  const deleteGroup = async (group: ModifierGroup) => {
    if (!window.confirm(`Delete "${group.name}"? All options will be removed and it will be unassigned from all categories.`)) return
    try {
      await api('delete_modifier_group', { id: group.id })
      setExpandedGroup(null)
      await reload()
      showToast('Group deleted')
    } catch (e: any) { showToast(e.message, 'error') }
  }

  // ── Category pill toggle — optimistic, no reload ────────────────────────────
  const toggleCatAssign = async (category_id: string, group_id: string, currentlyAssigned: boolean) => {
    // Optimistic update
    if (currentlyAssigned) {
      setLocalCatMGs(prev => prev.filter(x => !(x.category_id === category_id && x.group_id === group_id)))
    } else {
      setLocalCatMGs(prev => [...prev, { category_id, group_id }])
    }
    try {
      if (currentlyAssigned) {
        await api('unassign_modifier_from_category', { category_id, group_id })
      } else {
        await api('assign_modifier_to_category', { category_id, group_id })
      }
    } catch (e: any) {
      // Revert optimistic change
      if (currentlyAssigned) {
        setLocalCatMGs(prev => [...prev, { category_id, group_id }])
      } else {
        setLocalCatMGs(prev => prev.filter(x => !(x.category_id === category_id && x.group_id === group_id)))
      }
      showToast(e.message, 'error')
    }
  }

  // ── Option save ─────────────────────────────────────────────────────────────
  const saveOption = async () => {
    if (!editingOption?.name || !editingOption.group_id) return
    setSavingOption(true)
    try {
      await api('upsert_modifier_option', editingOption)
      showToast(editingOption.id ? 'Option updated' : 'Option added')
      const keepOpen = editingOption.group_id
      setEditingOption(null)
      await reload()
      if (keepOpen) setExpandedGroup(keepOpen)
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setSavingOption(false) }
  }

  return (
    <div>
      {/* ── Section 1: Upsells ─────────────────────────────────────────────── */}
      {/* Section heading — match this pattern for all manage page sections */}
      <div className="flex items-center justify-between mb-4">
        <div>
          {/* Manage page section heading — use font-black text-slate-900 text-lg for all tab headings */}
          <h2 className="font-black text-slate-900 text-lg">Upsells</h2>
          <p className="text-slate-400 text-sm mt-0.5">Nudge customers to add something extra. When someone orders from one category, suggest items from another — a drink with a pizza, a sauce with a burger.</p>
        </div>
        {!upsellAdding && <Btn label="+ Add upsell" onClick={() => setUpsellAdding(true)} />}
      </div>

      <UpsellRulesSection categories={categories} api={api} showToast={showToast} adding={upsellAdding} setAdding={setUpsellAdding} />

      {/* ── Section 2: Custom Extras ────────────────────────────────────────── */}
      {/* Section heading — match this pattern for all manage page sections */}
      <div className="flex items-center justify-between mt-10 mb-4">
        <div>
          {/* Manage page section heading — use font-black text-slate-900 text-lg for all tab headings */}
          <h2 className="font-black text-slate-900 text-lg">Custom Extras</h2>
          <p className="text-slate-400 text-sm mt-0.5">Add paid or free options customers can choose when ordering — e.g. Extra Cheese +£1.50, No Onion £0</p>
        </div>
        <Btn label="+ Add customisation" onClick={() => { setShowNewGroup(true); setNewGroupName('') }} />
      </div>
      <p className="text-xs text-slate-400 mb-4">Create a group of options and assign it to a menu category. All items in that category will offer those options when customers order. Individual item overrides can be set from the Menu tab.</p>

      <div className="space-y-4">
      {modifierGroups.length === 0 && (
        <EmptyState icon="⚙️" title="No custom extras yet" body='Create a group like "Pizza extras" and add options like "Extra Cheese +£1.00"' />
      )}

      {modifierGroups.map(group => {
        const opts = modifierOptions.filter(o => o.group_id === group.id).sort((a, b) => a.sort_order - b.sort_order)
        const assignedCats = categories.filter(c => localCatMGs.some(cmg => cmg.category_id === c.id && cmg.group_id === group.id))
        const isOpen = expandedGroup === group.id
        const isRenaming = renamingGroupId === group.id

        return (
          <Card key={group.id}>
            {/* ── Collapsed header — chevron is the only toggle ── */}
            <div
              className="flex items-center gap-3 p-4 cursor-pointer select-none"
              onClick={() => !isRenaming && setExpandedGroup(isOpen ? null : group.id)}
            >
              <div className="flex-1 min-w-0">
                {!isOpen && <p className="font-black text-slate-900">{group.name}</p>}
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-slate-400 text-xs">{opts.length} option{opts.length !== 1 ? 's' : ''}</span>
                  {assignedCats.map(c => <Badge key={c.id} label={c.name} colour="green" />)}
                </div>
              </div>
              <span className="text-slate-400 text-xs flex-shrink-0">{isOpen ? '▲' : '▼'}</span>
            </div>

            {isOpen && (
              <div className="border-t border-slate-100 p-4 space-y-5">

                {/* ── Expanded header: Rename + Delete ── */}
                <div className="flex items-center justify-between gap-3 -mt-1">
                  {isRenaming ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onBlur={() => saveRename(group)}
                      onKeyDown={e => { if (e.key === 'Enter') saveRename(group); if (e.key === 'Escape') setRenamingGroupId(null) }}
                      className="flex-1 border border-orange-400 rounded-lg px-3 py-1.5 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400"
                      disabled={savingRename}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <p className="font-black text-slate-900 text-base truncate flex-1">{group.name}</p>
                  )}
                  <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    {!isRenaming && (
                      <button
                        onClick={() => startRename(group)}
                        className="text-xs text-slate-500 hover:text-orange-600 font-bold px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors"
                      >
                        Rename
                      </button>
                    )}
                    <button
                      onClick={() => deleteGroup(group)}
                      className="text-slate-400 hover:text-red-500 px-1.5 py-1 rounded-lg hover:bg-red-50 transition-colors text-sm"
                      title="Delete group"
                    >
                      🗑
                    </button>
                  </div>
                </div>

                {/* ── Options ── */}
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
                  <button
                    onClick={() => setEditingOption({ group_id: group.id, type: 'add', price_adjustment: 0, sort_order: opts.length })}
                    className="text-xs text-orange-600 font-bold hover:text-orange-700 mt-1"
                  >
                    + Add option
                  </button>
                </div>

                {/* ── Category assignment pills — optimistic, no reload ── */}
                <div onClick={e => e.stopPropagation()}>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Assign to categories</p>
                  <div className="flex flex-wrap gap-2">
                    {categories.map(cat => {
                      const assigned = localCatMGs.some(cmg => cmg.category_id === cat.id && cmg.group_id === group.id)
                      return (
                        <button
                          key={cat.id}
                          onClick={() => toggleCatAssign(cat.id, group.id, assigned)}
                          className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all active:scale-95 ${assigned ? 'bg-green-600 text-white border-green-600' : 'bg-white text-slate-600 border-slate-200 hover:border-green-400'}`}
                        >
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

      </div>{/* end space-y-4 group list */}

      {/* New group modal — name only */}
      {showNewGroup && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <h3 className="font-black text-slate-900 mb-4">New custom extra</h3>
            <Input
              label="Group name"
              required
              value={newGroupName}
              onChange={v => setNewGroupName(v)}
              placeholder='e.g. Pizza extras'
            />
            <div className="flex gap-2 mt-4">
              <Btn label="Cancel" colour="slate" onClick={() => { setShowNewGroup(false); setNewGroupName('') }} />
              <Btn label={savingGroup ? 'Saving...' : 'Save'} loading={savingGroup} onClick={createGroup} />
            </div>
          </div>
        </div>
      )}

      {/* Edit Option Modal — unchanged */}
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
                  </select>
                </div>
                <Input label="Price adjustment (£)" type="number" value={editingOption.price_adjustment ?? 0} onChange={v => setEditingOption(p => ({...p!, price_adjustment: parseFloat(v) || 0}))} placeholder="0.00" hint="0 = free" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Btn label="Cancel" colour="slate" onClick={() => setEditingOption(null)} />
              <Btn label={savingOption ? 'Saving...' : 'Save'} loading={savingOption} onClick={saveOption} />
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

  const emptyBundle: Partial<Bundle> = { is_available: true, apply_to_new_events: true, bundle_price: 0, slot_1_category: null, slot_2_category: null, slot_3_category: null, slot_4_category: null, slot_5_category: null, slot_6_category: null }

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
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-black text-slate-900">{bundle.name}</p>
                  <Badge label={bundle.is_available ? 'Active' : 'Off'} colour={bundle.is_available ? 'green' : 'slate'} />
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${
                    bundle.apply_to_new_events
                      ? 'bg-teal-50 text-teal-700 border-teal-100'
                      : 'bg-slate-100 text-slate-500 border-slate-200'
                  }`}>
                    {bundle.apply_to_new_events ? 'Auto-apply' : 'Manual'}
                  </span>
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

            {bundle.stock_warning && (
              <div className="mt-3 flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                <span className="text-amber-500 flex-shrink-0 text-sm">⚠️</span>
                <p className="text-xs text-amber-700">Currently hidden from customers — {bundle.stock_warning}</p>
              </div>
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

              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Apply to events</p>
                <p className="text-xs text-slate-400 mt-0.5 mb-3">Choose whether this deal is automatically applied to your events</p>
                <div className="flex flex-col gap-2">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="apply_to_new_events"
                      checked={editing.apply_to_new_events === true}
                      onChange={() => setEditing(p => p ? { ...p, apply_to_new_events: true } : p)}
                      className="mt-0.5 flex-shrink-0"
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-800">Apply to all future events automatically</p>
                      <p className="text-xs text-slate-500">This deal will be active on every new event you create. You can still turn it off for specific events in Schedule.</p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="apply_to_new_events"
                      checked={editing.apply_to_new_events === false}
                      onChange={() => setEditing(p => p ? { ...p, apply_to_new_events: false } : p)}
                      className="mt-0.5 flex-shrink-0"
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-800">Select manually per event</p>
                      <p className="text-xs text-slate-500">This deal won't appear on events unless you enable it in the Schedule tab.</p>
                    </div>
                  </label>
                </div>
                {editing.apply_to_new_events && (
                  <div className="mt-3 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                    <p className="text-xs text-amber-700">This deal will be added to new events. For existing events, go to Schedule to manage deals per event.</p>
                  </div>
                )}
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
function EventStatusBadge({ status, event_date, end_time }: { status: TruckEvent['status']; event_date: string; end_time: string }) {
  const isPast = end_time ? new Date() > new Date(`${event_date}T${end_time}`) : false
  if (isPast) return (
    <span className="text-xs font-semibold text-slate-400">Finished</span>
  )
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

type EditingEvent = { id?: string; venue_name: string; town: string; postcode: string; address: string; event_date: string; start_time: string; end_time: string; notes: string; truck_id?: string; van_id?: string | null }

function ScheduleTab({ truck, token, bundles, categories, operatorTrucks, api, reload, showToast }: {
  truck: Truck; token: string; bundles: Bundle[]; categories: Category[]
  operatorTrucks: { id: string; name: string; dashboard_token: string }[]
  api: (a: string, e?: any) => Promise<any>; reload: () => void; showToast: (m: string, t?: any) => void
}) {
  const [events, setEvents] = useState<TruckEvent[]>([])
  const [loadingEvents, setLoadingEvents] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showPast, setShowPast] = useState(false)
  const [showEventCancelModal, setShowEventCancelModal] = useState(false)
  const [cancellingEvent, setCancellingEvent] = useState<TruckEvent | null>(null)
  const [eventCancelReason, setEventCancelReason] = useState('')
  const [eventCancelNote, setEventCancelNote] = useState('')
  const [affectedOrderCount, setAffectedOrderCount] = useState(0)
  const [editingEvent, setEditingEvent] = useState<EditingEvent | null>(null)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [editSaving, setEditSaving] = useState(false)
  const [vans, setVans] = useState<{ id: string; name: string }[]>([])
  const [scheduleFilterTruckId, setScheduleFilterTruckId] = useState<string>('')
  const [addMode, setAddMode] = useState<'manual' | 'upload'>('manual')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadText, setUploadText] = useState('')
  const [uploadProcessing, setUploadProcessing] = useState(false)
  const [extractedEvents, setExtractedEvents] = useState<any[]>([])
  const [savingExtracted, setSavingExtracted] = useState(false)
  const [showVenueSuggestions, setShowVenueSuggestions] = useState(false)

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
  useEffect(() => { api('get_vans').then(r => setVans((r.vans || []).map((v: any) => ({ id: v.id, name: v.name })))).catch(() => {}) }, [])

  const recentEvents = useMemo(() => {
    const seen = new Set<string>()
    return [...events]
      .filter(e => e.status === 'confirmed' || e.status === 'open')
      .sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime())
      .filter(e => {
        const key = `${e.venue_name}-${e.town}`.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, 5)
  }, [events])

  const venueSuggestions = useMemo(() => {
    const seen = new Set<string>()
    return [...events]
      .sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime())
      .filter(e => {
        if (!e.venue_name) return false
        const key = e.venue_name.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, 10)
      .map(e => ({
        venue_name: e.venue_name,
        town: e.town,
        postcode: e.postcode,
        address: e.address,
        start_time: e.start_time,
        end_time: e.end_time,
      }))
  }, [events])

  const handleCopyEvent = (event: TruckEvent) => {
    setEditingEvent({
      id: undefined,
      event_date: '',
      start_time: event.start_time?.substring(0, 5) || '',
      end_time: event.end_time?.substring(0, 5) || '',
      venue_name: event.venue_name || '',
      town: event.town || '',
      postcode: event.postcode || '',
      address: event.address || '',
      notes: '',
      van_id: event.van_id || null,
      truck_id: operatorTrucks.length === 1 ? operatorTrucks[0].id : (event.truck_id || ''),
    })
    setFormErrors({})
    setTimeout(() => {
      document.getElementById('add-event-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  const validateEventForm = (form: EditingEvent) => {
    const errors: Record<string, string> = {}
    if (!form.event_date) errors.event_date = 'Date is required'
    if (!form.venue_name?.trim()) errors.venue_name = 'Venue name is required'
    if (!form.start_time) errors.start_time = 'Start time is required'
    if (!form.end_time) errors.end_time = 'End time is required'
    if (operatorTrucks.length > 1 && !form.truck_id) errors.truck_id = 'Please select a truck'
    return errors
  }

  const closeAddModal = () => {
    setEditingEvent(null)
    setFormErrors({})
    setExtractedEvents([])
    setUploadFile(null)
    setUploadText('')
  }

  const saveEdit = async () => {
    if (!editingEvent) return
    const errors = validateEventForm(editingEvent)
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return }
    setFormErrors({})
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
          truck_id: editingEvent?.truck_id || truck.id,
        })
      }
      const count = extractedEvents.length
      await loadEvents()
      closeAddModal()
      showToast(`${count} event${count !== 1 ? 's' : ''} saved`)
    } catch (e: any) { showToast(e.message || 'Failed to save events', 'error') }
    finally { setSavingExtracted(false) }
  }

  const handleConfirmEvent = async (eventId: string) => {
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
            auto_open: truck.default_auto_open ?? true,
            auto_close: truck.default_auto_close ?? true,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setEvents(prev => prev.map(e => e.id === eventId ? { ...e, status: 'confirmed' as const } : e))
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
    return (
      <Card key={event.id}>
        <div className="px-4 py-3 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {operatorTrucks.length > 1 && (
              <p className="text-xs font-semibold text-orange-600 mb-0.5">
                {operatorTrucks.find(t => t.id === event.truck_id)?.name ?? truck.name}
              </p>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-slate-900">
                {event.venue_name}{event.town ? `, ${event.town}` : ''}
              </p>
              <EventStatusBadge status={event.status} event_date={event.event_date} end_time={event.end_time} />
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {fmtDate(event.event_date)}
              {event.start_time && event.end_time && ` · ${formatTime(event.start_time)}–${formatTime(event.end_time)}`}
              {event.postcode && ` · ${event.postcode}`}
              {vans.length > 1 && event.van_id && ` · ${vans.find(v => v.id === event.van_id)?.name || ''}`}
            </p>
            {event.address && <p className="text-xs text-slate-400 mt-0.5 truncate">{event.address}</p>}
            {event.notes && <p className="text-xs text-slate-400 mt-0.5 truncate">📝 {event.notes}</p>}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {event.status === 'unconfirmed' && (
              <Btn label="Confirm" size="sm" colour="green" onClick={() => handleConfirmEvent(event.id)} />
            )}
            <Btn label="Copy" size="sm" colour="ghost" onClick={() => { setAddMode('manual'); setExtractedEvents([]); handleCopyEvent(event) }} />
            <Btn label="Edit" size="sm" colour="ghost" onClick={() => { setFormErrors({}); setEditingEvent({ id: event.id, venue_name: event.venue_name, town: event.town || '', postcode: event.postcode || '', address: event.address || '', event_date: event.event_date, start_time: event.start_time ? event.start_time.substring(0, 5) : '', end_time: event.end_time ? event.end_time.substring(0, 5) : '', notes: event.notes || '', truck_id: event.truck_id || truck.id, van_id: event.van_id || null }) }} />
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
                <div key={bundle.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-800 truncate">{bundle.name}</span>
                      <span className="text-xs text-slate-400 flex-shrink-0">£{bundle.bundle_price.toFixed(2)}</span>
                      {bundle.stock_warning && (
                        <span className="text-xs text-amber-600 flex-shrink-0">⚠️ Stock</span>
                      )}
                    </div>
                    {bundle.stock_warning && (
                      <p className="text-xs text-amber-600 mt-0.5">Hidden — {bundle.stock_warning}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleEventDealToggle(event.id, bundle.id, !isActive)}
                    className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ml-3 ${isActive ? 'bg-teal-500' : 'bg-slate-300'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${isActive ? 'translate-x-5' : 'translate-x-1'}`} />
                  </button>
                </div>
              )
            })}
          </div>
        )}

      </Card>
    )
  }

  const filteredVenueSuggestions = editingEvent?.venue_name
    ? venueSuggestions.filter(v => v.venue_name.toLowerCase().includes(editingEvent.venue_name.toLowerCase()))
    : venueSuggestions

  if (loadingEvents) return (
    <div className="flex items-center justify-center py-12"><Spinner /></div>
  )

  const now = new Date()
  const today = new Date(); today.setHours(0, 0, 0, 0)
  // isPastEvent uses new Date(`${event.event_date}T${event.end_time}`) — local time parse
  // Do NOT use new Date(event.event_date) — that parses as UTC midnight and breaks
  // today's date comparison in BST (and any UTC+ timezone)
  // DB status is never auto-written after event ends — all past detection is client-side
  const isPastEvent = (e: TruckEvent) =>
    e.end_time ? now > new Date(`${e.event_date}T${e.end_time}`) : new Date(e.event_date) < today
  const filteredEvents = scheduleFilterTruckId
    ? events.filter(e => e.truck_id === scheduleFilterTruckId)
    : events
  const upcoming = filteredEvents.filter(e => e.status !== 'cancelled' && !isPastEvent(e))
  const past = filteredEvents.filter(e => e.status !== 'cancelled' && isPastEvent(e))
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
        <div className="flex items-center gap-2">
          {operatorTrucks.length > 1 && (
            <select
              value={scheduleFilterTruckId}
              onChange={e => setScheduleFilterTruckId(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
            >
              <option value="">All trucks</option>
              {operatorTrucks.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
          <Btn label="+ Add event" onClick={() => {
            const lastEv = [...events].filter(e => e.start_time && e.end_time).sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime())[0]
            setFormErrors({})
            setEditingEvent({ venue_name: '', town: '', postcode: '', address: '', event_date: '', start_time: lastEv?.start_time?.substring(0, 5) || '', end_time: lastEv?.end_time?.substring(0, 5) || '', notes: '', truck_id: operatorTrucks.length === 1 ? operatorTrucks[0].id : '' })
            setAddMode('manual'); setExtractedEvents([])
          }} />
        </div>
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
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center lg:items-start lg:pt-8 justify-center p-4">
          <div className="bg-white rounded-2xl p-5 sm:p-6 w-full max-w-sm sm:max-w-lg lg:max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="font-black text-slate-900 mb-4">
              {editingEvent.id ? 'Edit event' : 'Add event'}
            </h3>

            {/* Recent events quick-copy — new events only */}
            {!editingEvent.id && recentEvents.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Copy a recent event</p>
                <div className="flex flex-col gap-2">
                  {recentEvents.map(event => (
                    <button
                      key={event.id}
                      onClick={() => handleCopyEvent(event)}
                      className="flex items-center justify-between w-full px-3 py-2.5 border border-slate-200 rounded-xl hover:border-orange-300 hover:bg-orange-50 transition-colors text-left group"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-800">{event.venue_name}{event.town ? `, ${event.town}` : ''}</p>
                        <p className="text-xs text-slate-400">{fmtDate(event.event_date)} · {formatTime(event.start_time)}–{formatTime(event.end_time)}</p>
                      </div>
                      <span className="text-xs text-orange-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-2">Copy →</span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <div className="flex-1 h-px bg-slate-100" />
                  <span className="text-xs text-slate-400">or add manually</span>
                  <div className="flex-1 h-px bg-slate-100" />
                </div>
              </div>
            )}

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
              <div id="add-event-form" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {operatorTrucks.length > 1 && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-600 mb-1">Truck <span className="text-red-500">*</span></label>
                    <select
                      value={editingEvent.truck_id || ''}
                      onChange={e => { setEditingEvent(p => ({ ...p!, truck_id: e.target.value })); if (formErrors.truck_id) setFormErrors(p => ({ ...p, truck_id: '' })) }}
                      className={`w-full border rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white ${formErrors.truck_id ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                    >
                      <option value="">Select a truck</option>
                      {operatorTrucks.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    {formErrors.truck_id && <p className="text-xs text-red-500 mt-1">{formErrors.truck_id}</p>}
                  </div>
                )}
                {vans.length > 1 && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-600 mb-1">Van</label>
                    <select
                      value={editingEvent.van_id || ''}
                      onChange={e => setEditingEvent(p => ({ ...p!, van_id: e.target.value || null }))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
                    >
                      <option value="">Not specified</option>
                      {vans.map(van => (
                        <option key={van.id} value={van.id}>{van.name}</option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-400 mt-1">Assign this event to a specific van for separate order screens.</p>
                  </div>
                )}
                <div className="sm:col-span-2 relative">
                  <label className="block text-xs font-bold text-slate-600 mb-1">Venue name <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    value={editingEvent.venue_name}
                    onChange={e => { setEditingEvent(p => ({ ...p!, venue_name: e.target.value })); setShowVenueSuggestions(true); if (formErrors.venue_name) setFormErrors(p => ({ ...p, venue_name: '' })) }}
                    onFocus={() => setShowVenueSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowVenueSuggestions(false), 150)}
                    placeholder="e.g. The Crown"
                    className={`w-full border rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white ${formErrors.venue_name ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                  />
                  {showVenueSuggestions && filteredVenueSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 max-h-48 overflow-y-auto">
                      {filteredVenueSuggestions.map((venue, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setEditingEvent(p => ({ ...p!, venue_name: venue.venue_name, town: venue.town || p!.town, postcode: venue.postcode || p!.postcode, address: venue.address || p!.address, start_time: venue.start_time?.substring(0, 5) || p!.start_time, end_time: venue.end_time?.substring(0, 5) || p!.end_time }))
                            setShowVenueSuggestions(false)
                            if (formErrors.venue_name) setFormErrors(p => ({ ...p, venue_name: '' }))
                          }}
                          className="w-full text-left px-4 py-2.5 hover:bg-slate-50 border-b border-slate-100 last:border-0"
                        >
                          <p className="text-sm font-medium text-slate-800">{venue.venue_name}</p>
                          <p className="text-xs text-slate-400">
                            {[venue.town, venue.postcode].filter(Boolean).join(' · ')}
                            {venue.start_time ? ` · ${formatTime(venue.start_time)}–${formatTime(venue.end_time || '')}` : ''}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                  {formErrors.venue_name && <p className="text-xs text-red-500 mt-1">{formErrors.venue_name}</p>}
                </div>
                <div>
                  <Input label="Village / Town" value={editingEvent.town} onChange={v => setEditingEvent(p => ({...p!, town: v}))} placeholder="e.g. Wickhambrook" />
                  <p className="text-xs text-slate-400 mt-1">Used for WhatsApp auto-replies and discovery map</p>
                </div>
                <Input label="Postcode" value={editingEvent.postcode} onChange={v => setEditingEvent(p => ({...p!, postcode: v}))} placeholder="e.g. CB8 8PD" />
                <div className="sm:col-span-2">
                  <Input label="Full address (optional)" value={editingEvent.address} onChange={v => setEditingEvent(p => ({...p!, address: v}))} placeholder="e.g. 123 High St, Wickhambrook" />
                </div>
                <div className="sm:col-span-2">
                  <Input label="Date" required type="date" value={editingEvent.event_date}
                    onChange={v => { setEditingEvent(p => ({...p!, event_date: v})); if (formErrors.event_date) setFormErrors(p => ({...p, event_date: ''})) }}
                    error={formErrors.event_date} />
                </div>
                <Input label="Start time" required type="time" value={editingEvent.start_time}
                  onChange={v => { setEditingEvent(p => ({...p!, start_time: v})); if (formErrors.start_time) setFormErrors(p => ({...p, start_time: ''})) }}
                  error={formErrors.start_time} />
                <Input label="End time" required type="time" value={editingEvent.end_time}
                  onChange={v => { setEditingEvent(p => ({...p!, end_time: v})); if (formErrors.end_time) setFormErrors(p => ({...p, end_time: ''})) }}
                  error={formErrors.end_time} />
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-600 mb-1">Notes</label>
                  <textarea value={editingEvent.notes} onChange={e => setEditingEvent(p => ({...p!, notes: e.target.value}))} placeholder="e.g. Park in the main car park" rows={2} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none" />
                </div>
                <div className="sm:col-span-2 flex gap-2 pt-1">
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
              <p className="text-sm text-slate-500 mt-1">
                {cancellingEvent.venue_name}{cancellingEvent.town ? `, ${cancellingEvent.town}` : ''}
                {' · '}
                {fmtDate(cancellingEvent.event_date)}
                {cancellingEvent.start_time && cancellingEvent.end_time
                  ? ` · ${formatTime(cancellingEvent.start_time)}–${formatTime(cancellingEvent.end_time)}`
                  : ''}
              </p>
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
  const [showVanBillingModal, setShowVanBillingModal] = useState(false)
  const [showVanUpgradeModal, setShowVanUpgradeModal] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [generatingQR, setGeneratingQR] = useState(false)
  const [copiedOrderLink, setCopiedOrderLink] = useState(false)
  const [qrCodeStyle, setQrCodeStyle] = useState<'standard' | 'branded'>(truck.qr_code_style ?? 'standard')

  useEffect(() => {
    api('get_vans').then(r => setVans(r.vans || [])).catch(() => {})
  }, [])

  const orderUrl = `${process.env.NEXT_PUBLIC_HATCHGRAB_URL}/order/${truck.dashboard_token}`

  const handleCopyOrderLink = async () => {
    try {
      await navigator.clipboard.writeText(orderUrl)
      setCopiedOrderLink(true)
      setTimeout(() => setCopiedOrderLink(false), 2000)
    } catch { /* clipboard permission denied — fail silently */ }
  }

  const handleGenerateQR = async () => {
    setGeneratingQR(true)
    try {
      const { generateQRCodePNG } = await import('@/lib/generateQRCode')
      const showBrandedQr = can('branded_qr_code') && qrCodeStyle === 'branded'
      const dataUrl = await generateQRCodePNG({
        url: orderUrl,
        logoUrl: showBrandedQr && truck.logo_storage_path
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
    if (!deletingVan) return
    try {
      await api('delete_van', { vanId: deletingVan.id })
      setVans(prev => prev.filter(v => v.id !== deletingVan.id))
      setDeletingVan(null)
      showToast(`${deletingVan.name} removed`)
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

  const updateVanSetting = async (
    vanId: string,
    field: 'show_cooking_step' | 'auto_pause_on_offline' | 'kitchen_capacity',
    value: boolean | number | null
  ) => {
    setVans(prev => prev.map(v => v.id === vanId ? { ...v, [field]: value } : v))
    await api('update_van_settings', { vanId, [field]: value })
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

      {/* Business contact */}
      <Card className="p-4 space-y-3">
        <div>
          <p className="font-bold text-slate-900">Business contact</p>
          <p className="text-xs text-slate-400 mt-0.5">Shown to customers on order confirmations. For your personal account details, go to Team → My profile.</p>
        </div>
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
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 mb-4">
          <p className="text-sm text-slate-600 flex-1 truncate font-mono">{orderUrl}</p>
          <button
            onClick={handleCopyOrderLink}
            className="text-xs text-orange-600 font-semibold flex-shrink-0 hover:text-orange-700"
          >
            {copiedOrderLink ? '✓ Copied' : 'Copy'}
          </button>
        </div>
        {/* QR code style selector */}
        <div className="mb-4 space-y-2">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">QR code style</p>
          {/* Standard — available to all tiers */}
          <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${qrCodeStyle === 'standard' ? 'border-orange-400 bg-orange-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
            <input
              type="radio"
              name="qr_style"
              value="standard"
              checked={qrCodeStyle === 'standard'}
              onChange={() => {
                setQrCodeStyle('standard')
                setQrDataUrl(null)
                saveSetting('qr_code_style', 'standard')
              }}
              className="accent-orange-600"
            />
            <div>
              <p className="text-sm font-semibold text-slate-800">Standard QR code</p>
            </div>
          </label>

          {/* Branded — Pro/Max only */}
          {can('branded_qr_code') ? (
            <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${qrCodeStyle === 'branded' ? 'border-orange-400 bg-orange-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
              <input
                type="radio"
                name="qr_style"
                value="branded"
                checked={qrCodeStyle === 'branded'}
                onChange={() => {
                  setQrCodeStyle('branded')
                  setQrDataUrl(null)
                  saveSetting('qr_code_style', 'branded')
                }}
                className="accent-orange-600"
              />
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-800">Branded QR code</p>
                <p className="text-xs text-slate-400">Your logo shown in the middle of the QR code</p>
              </div>
              {truck.logo_storage_path && (
                <img
                  src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/truck-media/${truck.logo_storage_path}`}
                  alt="Logo preview"
                  className="w-8 h-8 rounded-md object-contain border border-slate-100 shrink-0"
                />
              )}
              {!truck.logo_storage_path && (
                <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-medium shrink-0">No logo</span>
              )}
            </label>
          ) : (
            <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 opacity-50 cursor-not-allowed">
              <input type="radio" disabled className="accent-orange-600" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-800">Branded QR code</p>
                <p className="text-xs text-slate-400">Your logo shown in the middle of the QR code</p>
              </div>
              <FeatureGate
                feature="branded_qr_code"
                plan={truck.plan}
                overrides={truck.feature_overrides}
                trialExpiresAt={truck.trial_expires_at}
                showUpgrade={true}
              />
            </div>
          )}
        </div>

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

        <div className="flex items-center justify-between py-3 border-t border-slate-100">
          <div>
            <p className="text-sm font-medium text-slate-800">Open for orders automatically</p>
            <p className="text-xs text-slate-500 mt-0.5">Events open for online orders at your event start time</p>
          </div>
          <button
            onClick={() => {
              const next = !form.default_auto_open
              setForm(p => ({...p, default_auto_open: next}))
              saveSetting('default_auto_open', next)
            }}
            className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
              form.default_auto_open ? 'bg-teal-500' : 'bg-slate-300'
            }`}
          >
            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
              form.default_auto_open ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>

        <div className="flex items-center justify-between py-3 border-t border-slate-100">
          <div>
            <p className="text-sm font-medium text-slate-800">Close for orders automatically</p>
            <p className="text-xs text-slate-500 mt-0.5">Events stop taking orders at your event end time</p>
          </div>
          <button
            onClick={() => {
              const next = !form.default_auto_close
              setForm(p => ({...p, default_auto_close: next}))
              saveSetting('default_auto_close', next)
            }}
            className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
              form.default_auto_close ? 'bg-teal-500' : 'bg-slate-300'
            }`}
          >
            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
              form.default_auto_close ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>
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
            <p className="text-sm text-slate-700 mt-0.5">
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

      {/* Your trucks */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Your trucks</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Manage your trucks. Each has its own order screen and settings.
            </p>
          </div>
          <button
            onClick={handleAddVanClick}
            className="text-xs px-3 py-1.5 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700"
          >
            + Add truck
          </button>
        </div>

        {vans.map(van => (
          <div key={van.id}>
            <div className="flex items-center justify-between py-3 border-b border-slate-200 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-slate-900">{van.name}</span>
                {van.auto_pause_on_offline && (
                  <span className="text-xs px-2 py-0.5 bg-teal-50 text-teal-700 border border-teal-100 rounded-full">
                    Protected
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setRenamingVanId(van.id); setRenameVanName(van.name) }}
                  className="text-xs px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50"
                >
                  Rename
                </button>
                {vans.length > 1 && (
                  <button
                    onClick={() => setDeletingVan(van)}
                    className="text-xs px-3 py-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
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
            {/* Van-specific display settings */}
            <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col gap-3">
              <p className="text-xs text-slate-400 mt-3 mb-2">Display settings</p>

              {/* Show cooking step */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-800">Show cooking step</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Adds a "Cooking" step between confirmed and done.
                    Useful when your cook and window person use separate screens.
                  </p>
                </div>
                <button
                  onClick={() => updateVanSetting(van.id, 'show_cooking_step', !van.show_cooking_step)}
                  className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 mt-0.5 ${
                    van.show_cooking_step ? 'bg-teal-500' : 'bg-slate-300'
                  }`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                    van.show_cooking_step ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              {/* Kitchen capacity */}
              <div className="flex items-center justify-between gap-3 mt-3">
                <div>
                  <p className="text-slate-800">Kitchen capacity</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Maximum cooked items per 5-minute window. Drinks and instant items don&apos;t count. Leave blank for no limit.
                  </p>
                </div>
                <select
                  value={van.kitchen_capacity ?? ''}
                  onChange={e => updateVanSetting(
                    van.id,
                    'kitchen_capacity',
                    e.target.value === '' ? null : parseInt(e.target.value)
                  )}
                  className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 bg-white flex-shrink-0 w-32"
                >
                  <option value="">No limit</option>
                  <option value="3">3 items</option>
                  <option value="5">5 items</option>
                  <option value="8">8 items</option>
                  <option value="10">10 items</option>
                  <option value="15">15 items</option>
                  <option value="20">20 items</option>
                </select>
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

      {/* Remove van confirmation modal */}
      {deletingVan && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 flex flex-col gap-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Remove {deletingVan.name}?</h3>
              <p className="text-sm text-slate-500 mt-2">
                This van will be removed from your account and will no longer
                appear on your dashboard or in future events.
              </p>
              <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 space-y-1.5">
                <p className="text-xs text-slate-600">
                  <span className="font-semibold">✓ Preserved:</span> All historical orders, sales data, and reports are kept permanently.
                </p>
                <p className="text-xs text-slate-600">
                  <span className="font-semibold">✓ Preserved:</span> Past event records linked to this van are unaffected.
                </p>
                <p className="text-xs text-red-600">
                  <span className="font-semibold">✕ Removed:</span> The van&apos;s kitchen screen link and settings will be deactivated.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeletingVan(null)}
                className="flex-1 border border-slate-200 text-slate-600 py-3 rounded-xl text-sm hover:bg-slate-50"
              >
                Keep van
              </button>
              <button
                onClick={confirmDeleteVan}
                className="flex-1 bg-red-600 text-white font-semibold py-3 rounded-xl text-sm hover:bg-red-700"
              >
                Remove van
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
              <h3 className="text-lg font-semibold text-slate-900">Add another truck</h3>
              <p className="text-sm text-slate-500 mt-2">
                Your {truck.plan === 'pro' ? 'Pro' : 'Max'} plan includes{' '}
                {truck.plan === 'pro' ? '2 trucks' : 'unlimited trucks'}.
                Adding an additional truck costs{' '}
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
                Add truck — £{VAN_ADDON_PRICE[truck.plan]}/mo
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
// TODO: Replace upgrade modal with Stripe Checkout/Customer Portal when Stripe Connect billing is implemented
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'hello@villagefoodie.co.uk'

function BillingTab({ truck }: { truck: Truck | null }) {
  if (!truck) return null
  const currentPlan = truck.plan
  const isCurrent = (p: 'starter' | 'pro' | 'max') =>
    p === currentPlan || (currentPlan === 'trial' && p === 'max')
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [upgradeTarget, setUpgradeTarget] = useState<'pro' | 'max'>('max')
  const openUpgrade = (target: 'pro' | 'max') => { setUpgradeTarget(target); setShowUpgradeModal(true) }

  return (
    <div className="max-w-2xl flex flex-col gap-6">
      {/* Current plan card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">

        {/* Plan info */}
        <div className="mb-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Current plan</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {PLAN_META[currentPlan]?.name ?? currentPlan}
          </p>
          <p className="text-sm text-slate-700 mt-0.5">{PLAN_PRICES[currentPlan]}</p>
          <p className="text-sm text-slate-700 mt-0.5">{PLAN_DESCRIPTIONS[currentPlan]}</p>
          {truck.trial_expires_at && (
            <p className="text-xs text-amber-600 mt-1">
              Trial ends {formatDate(truck.trial_expires_at)}
            </p>
          )}
        </div>

        {/* Plan switch CTA — TODO: wire to Stripe billing when payments are integrated */}
        {(truck.plan === 'trial' || truck.plan === 'max') && (
          <div className={`rounded-xl p-4 mb-6 ${
            truck.plan === 'trial'
              ? 'bg-orange-50 border border-orange-200'
              : 'bg-slate-50 border border-slate-200'
          }`}>
            {truck.plan === 'trial' ? (
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    Your trial ends {truck.trial_expires_at ? formatDate(truck.trial_expires_at) : 'soon'}
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    You&apos;re on Max features. Choose a plan before your trial ends to keep access.
                  </p>
                </div>
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <button
                    onClick={() => openUpgrade('max')}
                    className="px-4 py-2 bg-orange-600 text-white text-sm font-semibold rounded-xl whitespace-nowrap hover:bg-orange-700 transition-colors"
                  >
                    Upgrade to Max — £49/mo
                  </button>
                  <button
                    onClick={() => openUpgrade('pro')}
                    className="px-4 py-2 border border-orange-300 text-orange-600 text-sm font-medium rounded-xl whitespace-nowrap hover:bg-orange-50 transition-colors"
                  >
                    Choose Pro — £29/mo
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-600 text-center">You&apos;re on the highest plan ✓</p>
            )}
          </div>
        )}

        {truck.plan === 'starter' && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6">
            <p className="text-sm font-bold text-slate-900 mb-3">Upgrade your plan</p>
            <div className="flex gap-3">
              <button
                onClick={() => openUpgrade('pro')}
                className="flex-1 py-2.5 border border-orange-200 text-orange-600 text-sm font-semibold rounded-xl hover:bg-orange-50 transition-colors"
              >
                Pro — £29/mo
              </button>
              <button
                onClick={() => openUpgrade('max')}
                className="flex-1 py-2.5 bg-orange-600 text-white text-sm font-semibold rounded-xl hover:bg-orange-700 transition-colors"
              >
                Max — £49/mo
              </button>
            </div>
          </div>
        )}

        {truck.plan === 'pro' && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-slate-900">Unlock Max features</p>
              <p className="text-xs text-slate-500 mt-0.5">WhatsApp, kitchen printing, multi-device sync</p>
            </div>
            <button
              onClick={() => openUpgrade('max')}
              className="px-4 py-2.5 bg-orange-600 text-white text-sm font-semibold rounded-xl hover:bg-orange-700 transition-colors flex-shrink-0"
            >
              Upgrade to Max — £49/mo
            </button>
          </div>
        )}

        {/* Plan columns header with prices */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1" />
          {(['starter', 'pro', 'max'] as const).map(p => (
            <div key={p} className={`w-28 text-center pb-3 border-b-2 ${
              isCurrent(p) ? 'border-orange-500' : 'border-slate-100'
            }`}>
              <p className={`text-xs font-semibold uppercase tracking-widest ${
                isCurrent(p) ? 'text-orange-500' : 'text-slate-400'
              }`}>{p}</p>
              <p className={`text-xl font-bold mt-1 ${
                isCurrent(p) ? 'text-orange-600' : 'text-slate-900'
              }`}>{PLAN_PRICES[p]}</p>
              <p className="text-xs text-slate-400 mt-0.5">per truck / month</p>
            </div>
          ))}
        </div>

        {/* Transaction fees — value display */}
        <div className="mb-2">
          <div className="flex items-center py-2 border-t-2 border-slate-100 mt-3">
            <span className="flex-1 text-xs font-bold text-slate-900 uppercase tracking-wider">Transaction fees</span>
            <div className="w-28" /><div className="w-28" /><div className="w-28" />
          </div>
          {TRANSACTION_ROWS.map(row => (
            <div key={row.name} className="flex items-start py-2.5 border-t border-slate-100">
              <div className="flex-1 pr-4">
                <span className="text-sm font-medium text-slate-800">
                  {row.name}
                  {row.footnote && <sup className="text-slate-500 text-[10px] ml-0.5">{row.footnote}</sup>}
                </span>
              </div>
              {(['starter', 'pro', 'max'] as const).map(p => (
                <div key={p} className={`w-28 text-center text-sm font-semibold leading-snug ${
                  isCurrent(p) ? 'text-orange-600' : 'text-slate-600'
                }`}>
                  {row.values[p]}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Feature sections — checkmark display */}
        {FEATURE_SECTIONS.map(section => (
          <div key={section.title} className="mb-2">
            <div className="flex items-center py-2 border-t-2 border-slate-100 mt-3">
              <span className="flex-1 text-xs font-bold text-slate-900 uppercase tracking-wider">
                {section.title}
              </span>
              <div className="w-28" /><div className="w-28" /><div className="w-28" />
            </div>
            {section.rows.map(row => (
              <div key={row.name} className="flex items-center py-2 border-t border-slate-100">
                <div className="flex-1 pr-4">
                  <span className="text-sm text-slate-800">
                    {row.name}
                    {row.footnote && <sup className="text-slate-500 text-[10px] ml-0.5">{row.footnote}</sup>}
                  </span>
                  {row.detail && <p className="text-xs text-slate-600 mt-0.5">{row.detail}</p>}
                </div>
                {(['starter', 'pro', 'max'] as const).map(p => {
                  const val = row[p]
                  return (
                    <div key={p} className="w-28 text-center">
                      {val === true && (
                        <span className={`text-sm font-semibold ${isCurrent(p) ? 'text-orange-500' : 'text-slate-500'}`}>✓</span>
                      )}
                      {val === false && (
                        <span className="text-slate-300 text-sm">—</span>
                      )}
                      {val === 'coming_soon' && (
                        <span className="text-xs text-slate-400 italic whitespace-nowrap">Coming soon</span>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        ))}

        {/* Footnotes */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col gap-1.5">
          {FOOTNOTES.map(f => (
            <p key={f.number} className="text-xs text-slate-700">
              <sup>{f.number}</sup> {f.text}
            </p>
          ))}
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

      {/* Upgrade interest modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                Upgrade to {upgradeTarget === 'max' ? 'Max' : 'Pro'}
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                {upgradeTarget === 'max'
                  ? '£49/month — High-volume operations & festivals'
                  : '£29/month — Busy trucks scaling pre-orders'
                }
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <p className="text-sm text-slate-700">
                We&apos;re setting up automated billing. To upgrade now, drop us a message and we&apos;ll get you set up within 24 hours.
              </p>
            </div>
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=Upgrade to ${upgradeTarget === 'max' ? 'Max' : 'Pro'} — ${truck.name}&body=Hi, I'd like to upgrade ${truck.name} to the ${upgradeTarget === 'max' ? 'Max (£49/mo)' : 'Pro (£29/mo)'} plan.`}
              className="w-full py-3 bg-orange-600 text-white text-sm font-semibold rounded-xl text-center hover:bg-orange-700 transition-colors"
            >
              Email us to upgrade
            </a>
            <button
              onClick={() => setShowUpgradeModal(false)}
              className="w-full py-3 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── ReportsTab ──────────────────────────────────────────────────
interface ReportData {
  totalOrders?: number
  totalRevenue?: number
  avgOrder?: number
  topItems?: Array<{ name: string; qty: number; revenue: number }>
  dealsRedeemed?: number
  dealSavings?: number
  upsellRevenue?: number
  whatsappStats?: { total: number; handled: number; misses: number } | null
  orders?: Array<any>
  eventsMap?: Record<string, { venue_name: string | null; town: string | null }>
}
interface RecentEvent { id: string; venue_name: string | null; event_date: string; status: string }

function fmtGBP(n: number) { return `£${n.toFixed(2)}` }

function ReportsTab({ truck, api }: { truck: Truck | null; api: (a: string, e?: any) => Promise<any> }) {
  const hasAdvanced = truck
    ? canAccess(truck.plan, 'advanced_reporting', truck.feature_overrides ?? {}, truck.trial_expires_at ?? null)
    : false
  const isoDate = (offset: number) => {
    const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().split('T')[0]
  }
  const [filterMode, setFilterMode] = useState<'date' | 'event'>('date')
  const [dateFrom, setDateFrom] = useState(() => isoDate(-7))
  const [dateTo, setDateTo]     = useState(() => isoDate(-1))
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


  const loadReport = async (from = dateFrom, to = dateTo, eventId = reportEventId, mode = filterMode) => {
    setLoading(true)
    try {
      const r = await api('get_report', {
        dateFrom: mode === 'date' ? from : undefined,
        dateTo:   mode === 'date' ? to   : undefined,
        eventId:  mode === 'event' && eventId ? eventId : undefined,
      })
      setReportData(r.report ?? null)
    } catch { setReportData(null) }
    finally { setLoading(false); setReportLoaded(true) }
  }

  // ── Client-side derived breakdowns ─────────────────────────────
  const orders: any[] = reportData?.orders ?? []
  const eventsMap: Record<string, { venue_name: string | null; town: string | null }> = reportData?.eventsMap ?? {}

  const revenueBreakdown = useMemo(() => {
    // Only count revenue from orders that weren't cancelled/rejected
    const revenueOrders = orders.filter((o: any) => !['cancelled', 'rejected'].includes(o.status))
    let dealRev = 0, mods = 0
    for (const o of revenueOrders) {
      for (const d of (Array.isArray(o.deals) ? o.deals : [])) dealRev += d.price || 0
      for (const item of (Array.isArray(o.items) ? o.items : [])) {
        // unit_price = base_menu_price + sum(mod.price) — modifiers are baked in.
        // So modifier upcharges = sum(mod.price × qty); base = total − dealRev − mods.
        const modSum = (item.modifiers || []).reduce((s: number, m: any) => s + (m.price || 0), 0)
        mods += modSum * (item.quantity || 1)
      }
    }
    const total = revenueOrders.reduce((s: number, o: any) => s + (o.total || 0), 0)
    const base = total - dealRev - mods
    return { base, dealRev, mods, total }
  }, [orders]) // eslint-disable-line react-hooks/exhaustive-deps

  const dealBreakdown = useMemo(() => {
    const map: Record<string, { count: number; revenue: number }> = {}
    for (const o of orders)
      for (const d of (Array.isArray(o.deals) ? o.deals : [])) {
        if (!d.name) continue
        if (!map[d.name]) map[d.name] = { count: 0, revenue: 0 }
        map[d.name].count += 1; map[d.name].revenue += d.price || 0
      }
    return Object.entries(map).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.count - a.count)
  }, [orders]) // eslint-disable-line react-hooks/exhaustive-deps

  const modifierBreakdown = useMemo(() => {
    const map: Record<string, { count: number; revenue: number }> = {}
    for (const o of orders)
      for (const item of (Array.isArray(o.items) ? o.items : []))
        for (const m of (item.modifiers || [])) {
          if (!m.name) continue
          if (!map[m.name]) map[m.name] = { count: 0, revenue: 0 }
          map[m.name].count += item.quantity || 1
          map[m.name].revenue += (m.price || 0) * (item.quantity || 1)
        }
    return Object.entries(map).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.revenue - a.revenue)
  }, [orders]) // eslint-disable-line react-hooks/exhaustive-deps

  const customerNotes = useMemo(() => {
    const map: Record<string, number> = {}
    for (const o of orders)
      for (const item of (Array.isArray(o.items) ? o.items : [])) {
        const note = (item.specialInstructions || '').trim()
        if (note) map[note] = (map[note] || 0) + 1
      }
    return Object.entries(map).map(([note, count]) => ({ note, count })).sort((a, b) => b.count - a.count)
  }, [orders]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Report header context ────────────────────────────────────────
  const reportHeader = useMemo(() => {
    if (!orders.length) return null
    if (filterMode === 'event') {
      const ev = recentEvents.find(e => e.id === reportEventId)
      const dateStr = ev?.event_date
        ? new Date(ev.event_date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
        : ''
      return { context: [ev?.venue_name, dateStr].filter(Boolean).join(' · '), isMulti: false }
    }
    const eventDates = [...new Set(orders.map((o: any) => o.event_date).filter(Boolean))] as string[]
    const eventNames = eventDates
      .map(d => recentEvents.find(e => e.event_date === d)?.venue_name)
      .filter((n): n is string => !!n)
    const uniqueNames = [...new Set(eventNames)]
    if (uniqueNames.length === 1 && eventDates.length === 1) {
      const dateStr = new Date(eventDates[0] + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
      return { context: `${uniqueNames[0]} · ${dateStr}`, isMulti: false }
    }
    const fromStr = new Date(dateFrom + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    const toStr   = new Date(dateTo   + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    return { context: `${fromStr} – ${toStr} · ${eventDates.length} event${eventDates.length !== 1 ? 's' : ''}`, isMulti: true }
  }, [orders, filterMode, reportEventId, recentEvents, dateFrom, dateTo]) // eslint-disable-line react-hooks/exhaustive-deps

  const csvFilename = filterMode === 'date'
    ? `orders-${dateFrom}-to-${dateTo}.csv`
    : `orders-event-${reportEventId}.csv`
  const itemsCsvFilename = filterMode === 'date'
    ? `items-${dateFrom}-to-${dateTo}.csv`
    : `items-event-${reportEventId}.csv`

  const exportCSV = () => {
    if (!orders.length) return
    const headers = ['Order ID', 'Date', 'Event', 'Time placed', 'Collection time', 'Customer name', 'Order type', 'Items', 'Deals', 'Modifiers', 'Notes', 'Total']
    const rows = orders.map((o: any) => {
      const createdAt = o.created_at ? new Date(o.created_at) : null
      const dateStr = createdAt
        ? `${String(createdAt.getDate()).padStart(2, '0')}/${String(createdAt.getMonth() + 1).padStart(2, '0')}/${createdAt.getFullYear()}`
        : ''
      const timePlaced = createdAt
        ? formatTime(`${String(createdAt.getHours()).padStart(2, '0')}:${String(createdAt.getMinutes()).padStart(2, '0')}`)
        : ''
      const ev = eventsMap[o.event_date]
      const eventStr = ev ? [ev.venue_name, ev.town].filter(Boolean).join(', ') : 'Unknown event'
      const collectionTime = o.slot ? formatTime(o.slot) : 'ASAP'
      const customerName = (o.customer_name && o.customer_name !== 'Walk-up') ? o.customer_name : 'Unknown'
      // customer_email IS NULL is the best available signal for operator-placed orders (no source column yet)
      const orderType = o.customer_email ? 'Customer online' : 'Placed by truck'
      const itemStr = (Array.isArray(o.items) ? o.items : []).map((i: any) => `${i.quantity || 1}× ${i.name}`).join('; ')
      const dealStr = (Array.isArray(o.deals) ? o.deals : []).map((d: any) => d.name).join('; ')
      const modStr  = (Array.isArray(o.items) ? o.items : []).flatMap((i: any) => (i.modifiers || []).filter((m: any) => m.price > 0).map((m: any) => `${m.name} +£${m.price.toFixed(2)}`)).join('; ')
      const noteStr = (Array.isArray(o.items) ? o.items : []).map((i: any) => i.specialInstructions).filter(Boolean).join('; ')
      return [o.id, dateStr, eventStr, timePlaced, collectionTime, customerName, orderType, itemStr, dealStr, modStr, noteStr, fmtGBP(o.total || 0)]
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
    })
    const csv = [headers.map(h => `"${h}"`), ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = csvFilename
    a.click(); URL.revokeObjectURL(url)
  }

  const exportItemsCSV = () => {
    if (!orders.length) return
    const headers = ['Order ID', 'Date', 'Event', 'Time placed', 'Collection time', 'Customer name', 'Order type', 'Item name', 'Qty', 'Unit price', 'Modifiers', 'Notes', 'Item total', 'Order total']
    const rows: string[][] = []
    for (const o of orders) {
      const createdAt = o.created_at ? new Date(o.created_at) : null
      const dateStr = createdAt
        ? `${String(createdAt.getDate()).padStart(2, '0')}/${String(createdAt.getMonth() + 1).padStart(2, '0')}/${createdAt.getFullYear()}`
        : ''
      const timePlaced = createdAt
        ? formatTime(`${String(createdAt.getHours()).padStart(2, '0')}:${String(createdAt.getMinutes()).padStart(2, '0')}`)
        : ''
      const ev = eventsMap[o.event_date]
      const eventStr = ev ? [ev.venue_name, ev.town].filter(Boolean).join(', ') : 'Unknown event'
      const collectionTime = o.slot ? formatTime(o.slot) : 'ASAP'
      const customerName = (o.customer_name && o.customer_name !== 'Walk-up') ? o.customer_name : 'Unknown'
      const orderType = o.customer_email ? 'Customer online' : 'Placed by truck'
      const orderTotal = fmtGBP(o.total || 0)
      // Map item name → deal name for deal constituent detection
      const dealItemMap: Record<string, string> = {}
      for (const d of (Array.isArray(o.deals) ? o.deals : [])) {
        for (const itemName of Object.values(d.slots || {})) {
          if (itemName && !dealItemMap[itemName as string]) dealItemMap[itemName as string] = d.name
        }
      }
      const orderFields = [o.id, dateStr, eventStr, timePlaced, collectionTime, customerName, orderType]
      for (const item of (Array.isArray(o.items) ? o.items : [])) {
        const dealName = dealItemMap[item.name]
        const itemLabel = dealName ? `🎁 ${item.name} (${dealName})` : item.name
        const qty = item.quantity || 1
        const modSum = (item.modifiers || []).reduce((s: number, m: any) => s + (m.price || 0), 0)
        const basePrice = (item.unit_price || 0) - modSum
        const modStr = (item.modifiers || []).filter((m: any) => m.price > 0).map((m: any) => `${m.name} +£${m.price.toFixed(2)}`).join('; ')
        const noteStr = item.specialInstructions || ''
        const itemTotal = fmtGBP((item.unit_price || 0) * qty)
        rows.push([...orderFields, itemLabel, String(qty), fmtGBP(basePrice), modStr, noteStr, itemTotal, orderTotal]
          .map(v => `"${String(v).replace(/"/g, '""')}"`))
      }
    }
    const csv = [headers.map(h => `"${h}"`), ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = itemsCsvFilename
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── Filter bar ── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Filter by</span>
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
            <button onClick={() => setFilterMode('date')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterMode === 'date' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
              📅 Date range
            </button>
            <button onClick={() => setFilterMode('event')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterMode === 'event' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
              📍 Event
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {filterMode === 'date' ? (
            <>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white" />
              <span className="text-sm text-slate-400">to</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white" />
            </>
          ) : (
            <select value={reportEventId}
              onChange={e => { const id = e.target.value; setReportEventId(id); if (id) loadReport(undefined, undefined, id, 'event') }}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white">
              <option value="">Select an event…</option>
              {recentEvents.map(ev => {
                const evDate = new Date(ev.event_date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
                return <option key={ev.id} value={ev.id}>{ev.venue_name || 'Event'} · {evDate}</option>
              })}
            </select>
          )}
          <button onClick={() => loadReport()} disabled={loading || (filterMode === 'event' && !reportEventId)}
            className="px-4 py-2 bg-orange-600 text-white text-sm font-medium rounded-xl hover:bg-orange-700 transition-colors disabled:opacity-50">
            {loading ? 'Loading…' : 'View report'}
          </button>
          {orders.length > 0 && (
            <>
              <button onClick={exportCSV}
                className="px-4 py-2 border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors">
                ⬇ Export orders CSV
              </button>
              <button onClick={exportItemsCSV}
                className="px-4 py-2 border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors">
                ⬇ Export items CSV
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── No data states ── */}
      {reportData === null && reportLoaded && (
        <p className="text-sm text-slate-400 text-center py-10">No orders found for this period.</p>
      )}
      {filterMode === 'event' && !reportEventId && !reportLoaded && (
        <p className="text-sm text-slate-400 text-center py-10">Select an event above to view its report.</p>
      )}

      {orders.length > 0 && (
        <>
          {/* ── Summary line ── */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
            {reportHeader && (
              <p className="text-xs text-slate-500 mb-0.5">{reportHeader.context}</p>
            )}
            <p className="text-base font-bold text-slate-900">
              {orders.length} order{orders.length !== 1 ? 's' : ''} · {fmtGBP(revenueBreakdown.total)}
            </p>
          </div>

          {/* ── Advanced analytics (Pro/Max only) ── */}
          {hasAdvanced && (
            <>
              {/* Revenue breakdown */}
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-slate-900 mb-3">Revenue breakdown</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Menu items</span>
                    <span className="font-medium text-slate-900">{fmtGBP(revenueBreakdown.base)}</span>
                  </div>
                  {revenueBreakdown.dealRev > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Deal revenue</span>
                      <span className="font-medium text-slate-900">{fmtGBP(revenueBreakdown.dealRev)}</span>
                    </div>
                  )}
                  {revenueBreakdown.mods > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Modifier upcharges</span>
                      <span className="font-medium text-slate-900">{fmtGBP(revenueBreakdown.mods)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-semibold border-t border-slate-100 pt-2 mt-1">
                    <span className="text-slate-900">Total</span>
                    <span className="text-slate-900">{fmtGBP(revenueBreakdown.total)}</span>
                  </div>
                </div>
              </div>

              {/* Items sold */}
              {reportData?.topItems && reportData.topItems.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-slate-900 mb-3">Items sold</p>
                  <div className="space-y-1">
                    {reportData.topItems.map((item, i) => (
                      <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xs text-slate-300 w-4 flex-shrink-0">{i + 1}</span>
                          <span className="text-sm text-slate-700 truncate">{item.name}</span>
                          <span className="text-xs text-slate-400 flex-shrink-0">×{item.qty}</span>
                        </div>
                        <span className="text-sm font-medium text-slate-900 ml-3 flex-shrink-0">{fmtGBP(item.revenue)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Deals */}
              {dealBreakdown.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-slate-900 mb-3">Deals</p>
                  <div className="space-y-1">
                    {dealBreakdown.map((d, i) => (
                      <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-slate-700">{d.name}</span>
                          <span className="text-xs text-slate-400">{d.count}×</span>
                        </div>
                        <span className="text-sm font-medium text-slate-900">{fmtGBP(d.revenue)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Customisations */}
              {(modifierBreakdown.length > 0 || customerNotes.length > 0) && (
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-slate-900 mb-3">Customisations</p>
                  {modifierBreakdown.length > 0 && (
                    <>
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Paid modifiers</p>
                      <div className="space-y-1 mb-4">
                        {modifierBreakdown.map((m, i) => (
                          <div key={i} className="flex items-center justify-between py-1">
                            <div className="flex items-center gap-3">
                              <span className="text-sm text-slate-700">{m.name}</span>
                              <span className="text-xs text-slate-400">{m.count}×</span>
                            </div>
                            <span className="text-sm font-medium text-slate-900">{fmtGBP(m.revenue)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {customerNotes.length > 0 && (
                    <>
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Customer notes</p>
                      <div className="space-y-1">
                        {customerNotes.map((n, i) => (
                          <div key={i} className="flex items-center justify-between py-1">
                            <span className="text-sm text-slate-600 italic">"{n.note}"</span>
                            {n.count > 1 && <span className="text-xs text-slate-400">{n.count}×</span>}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── Order list ── */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-slate-900 mb-3">Orders</p>
            <div className="space-y-0.5">
              {orders.map((o: any) => {
                const createdAt = o.created_at ? new Date(o.created_at) : null
                const dateStr = createdAt
                  ? `${String(createdAt.getDate()).padStart(2, '0')}/${String(createdAt.getMonth() + 1).padStart(2, '0')}`
                  : ''
                const timePlaced = createdAt
                  ? formatTime(`${String(createdAt.getHours()).padStart(2, '0')}:${String(createdAt.getMinutes()).padStart(2, '0')}`)
                  : ''
                const ev = eventsMap[o.event_date]
                const venueName = ev?.venue_name ?? null
                const venueShort = venueName ? (venueName.length > 18 ? venueName.slice(0, 17) + '…' : venueName) : '—'
                const orderType = o.customer_email ? 'Online' : 'Walk-up'
                const customerLabel = (o.customer_name && o.customer_name !== 'Walk-up') ? o.customer_name : '—'
                const itemSummary = (Array.isArray(o.items) ? o.items : [])
                  .map((i: any) => `${i.quantity || 1}× ${i.name}`).join(', ')
                const isCancelled = o.status === 'cancelled' || o.status === 'rejected'
                return (
                  <div key={o.id} className={`flex items-center gap-2 py-2 border-b border-slate-50 last:border-0 text-xs ${isCancelled ? 'opacity-50' : ''}`}>
                    <span className="font-mono text-slate-400 flex-shrink-0 w-10">#{o.id}</span>
                    <span className="text-slate-400 flex-shrink-0 w-10">{dateStr}</span>
                    <span className="text-slate-500 flex-shrink-0 w-24 truncate hidden sm:block">{venueShort}</span>
                    <span className="text-slate-400 flex-shrink-0 w-10">{timePlaced}</span>
                    <span className={`flex-shrink-0 w-14 font-medium ${o.customer_email ? 'text-blue-600' : 'text-slate-500'}`}>{orderType}</span>
                    <span className="text-slate-600 flex-shrink-0 w-16 truncate">{customerLabel}</span>
                    <span className="text-slate-600 flex-1 truncate min-w-0">{itemSummary}</span>
                    <span className="font-medium text-slate-900 flex-shrink-0">{fmtGBP(o.total || 0)}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Pro feature placeholder (Starter only) ── */}
          {!hasAdvanced && (
            <div className="rounded-xl border border-slate-200 p-6 opacity-60">
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold text-slate-700">Revenue breakdown & analytics</span>
                <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">Pro feature</span>
              </div>
              <p className="text-sm text-slate-400">
                Revenue by category, deal performance, popular customisations, and trends over time. Available on Pro and Max.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── TeamTab ────────────────────────────────────────────────────
type PendingEmailChange = { id: string; new_email: string; requested_at: string; expires_at: string }

function TeamTab({ truck, token, api, reload, showToast, currentUserEmail, currentUserFirstName, currentUserLastName, currentUserPhone, initialPendingEmailChange, onProfileSaved }: {
  truck: Truck; token: string
  api: (a: string, e?: any) => Promise<any>; reload: () => void; showToast: (m: string, t?: any) => void
  currentUserEmail: string | null; currentUserFirstName: string | null; currentUserLastName: string | null; currentUserPhone: string | null
  initialPendingEmailChange: PendingEmailChange | null
  onProfileSaved: (firstName: string, lastName: string, phone: string | null) => void
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
  const [editingOwnProfile, setEditingOwnProfile] = useState(false)
  const [ownProfileFirstName, setOwnProfileFirstName] = useState('')
  const [ownProfileLastName, setOwnProfileLastName] = useState('')
  const [ownProfilePhone, setOwnProfilePhone] = useState('')
  const [ownProfileEmail, setOwnProfileEmail] = useState('')
  const [pendingEmailChange, setPendingEmailChange] = useState<PendingEmailChange | null>(initialPendingEmailChange)
  const [resendingVerification, setResendingVerification] = useState(false)
  const [savingOwnProfile, setSavingOwnProfile] = useState(false)

  const saveOwnProfile = async () => {
    if (!ownProfileFirstName.trim() || !ownProfileLastName.trim()) return
    setSavingOwnProfile(true)
    try {
      const fullName = `${ownProfileFirstName.trim()} ${ownProfileLastName.trim()}`
      const res = await fetch('/api/auth/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: ownProfileFirstName.trim(),
          last_name: ownProfileLastName.trim(),
          name: fullName,
          phone: ownProfilePhone.trim() || null,
        }),
      })
      if (!res.ok) throw new Error('Failed to save')

      if (ownProfileEmail.trim() && ownProfileEmail.trim() !== currentUserEmail) {
        const emailRes = await fetch('/api/auth/change-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newEmail: ownProfileEmail.trim() }),
        })
        const emailData = await emailRes.json()
        if (emailData.ok) {
          setPendingEmailChange({
            id: emailData.changeId,
            new_email: ownProfileEmail.trim(),
            requested_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          })
          showToast('Verification email sent')
        } else {
          showToast(emailData.error || 'Email change failed', 'error')
        }
      }

      onProfileSaved(ownProfileFirstName.trim(), ownProfileLastName.trim(), ownProfilePhone.trim() || null)
      setEditingOwnProfile(false)
      showToast('Profile updated')
    } catch {
      showToast('Failed to save profile', 'error')
    } finally {
      setSavingOwnProfile(false)
    }
  }

  const handleResendVerification = async (changeId: string) => {
    setResendingVerification(true)
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changeId }),
      })
      const data = await res.json()
      if (data.ok) {
        showToast('Verification email resent — check your inbox')
      } else {
        showToast(data.error || 'Failed to resend', 'error')
      }
    } finally {
      setResendingVerification(false)
    }
  }

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
              {currentUserFirstName && currentUserLastName
                ? `${currentUserFirstName} ${currentUserLastName} (you)`
                : `${currentUserEmail || truck.contact_email} (you)`}
            </p>
            <p className="text-xs text-slate-400">Owner · All vans</p>
          </div>
          <button
            onClick={() => {
              setOwnProfileFirstName(currentUserFirstName || '')
              setOwnProfileLastName(currentUserLastName || '')
              setOwnProfilePhone(currentUserPhone || '')
              setOwnProfileEmail(currentUserEmail || '')
              setEditingOwnProfile(true)
            }}
            className="text-xs px-2.5 py-1.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50"
          >
            Edit
          </button>
        </div>

        {pendingEmailChange && !editingOwnProfile && (
          <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-amber-800">⏳ Awaiting verification</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Verification sent to <strong>{pendingEmailChange.new_email}</strong>. Check your inbox.
              </p>
            </div>
            <button
              onClick={() => handleResendVerification(pendingEmailChange.id)}
              disabled={resendingVerification}
              className="text-xs text-amber-700 font-semibold underline flex-shrink-0 disabled:opacity-50"
            >
              {resendingVerification ? 'Sending...' : 'Resend'}
            </button>
          </div>
        )}

        {editingOwnProfile && (
          <div className="bg-slate-50 rounded-xl p-4 flex flex-col gap-3 mt-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">My profile</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">First name *</label>
                <input
                  type="text"
                  value={ownProfileFirstName}
                  onChange={e => setOwnProfileFirstName(e.target.value)}
                  className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Last name *</label>
                <input
                  type="text"
                  value={ownProfileLastName}
                  onChange={e => setOwnProfileLastName(e.target.value)}
                  className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Phone</label>
              <input
                type="tel"
                value={ownProfilePhone}
                onChange={e => setOwnProfilePhone(e.target.value)}
                placeholder="+44 7700 900000"
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</label>
              <input
                type="email"
                value={ownProfileEmail}
                onChange={e => setOwnProfileEmail(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white"
              />
              {ownProfileEmail !== currentUserEmail && (
                <p className="text-xs text-amber-600 mt-1">
                  A verification link will be sent to this address. Your current email remains active until verified.
                </p>
              )}
            </div>

            <p className="text-xs text-slate-600 bg-white border border-slate-100 rounded-lg px-3 py-2">
              Your personal details are private and never shown to customers. They're used for account management and billing verification.
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setEditingOwnProfile(false)}
                className="flex-1 border border-slate-200 text-slate-600 py-2 rounded-xl text-sm"
              >
                Cancel
              </button>
              <button
                onClick={saveOwnProfile}
                disabled={!ownProfileFirstName.trim() || !ownProfileLastName.trim() || savingOwnProfile}
                className="flex-1 bg-orange-600 text-white font-semibold py-2 rounded-xl text-sm disabled:opacity-40"
              >
                {savingOwnProfile ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}

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
                  : 'All trucks'}
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
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Truck access</label>
              {vans.length === 1 ? (
                <label className="flex items-center gap-2 py-1.5 opacity-60 cursor-not-allowed">
                  <input type="checkbox" checked disabled />
                  <span className="text-sm text-slate-700">{vans[0].name} <span className="text-slate-400">(only truck)</span></span>
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
                    <p className="text-xs text-amber-600 mt-1">Select at least one truck</p>
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