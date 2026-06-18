'use client'
// app/manage/[token]/page.tsx
// Truck management page — menu, modifiers, deals, schedule, settings

import { useState, useEffect, useCallback, useMemo, use, useRef, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { PLAN_META, canAccess, maxVans } from '@/lib/features'
import { isValidEmail, isValidUKPhone } from '@/lib/contact-validation'
import { PRICING_PUBLISHED, maskPrice } from '@/lib/pricing'
import type { Plan, Feature } from '@/lib/features'
import { PLAN_PRICES, PLAN_DESCRIPTIONS, TRANSACTION_ROWS, FEATURE_SECTIONS, FOOTNOTES } from '@/lib/plan-features'
import { FeatureGate } from '@/components/FeatureGate'
import { KITCHEN_CAPACITY_DESC, KITCHEN_CAPACITY_EXAMPLE, KITCHEN_CAPACITY_WARNING, kitchenCapacityNeedsPrepWarning } from '@/lib/kitchen-capacity'
import { groupBySubcategory } from '@/lib/basket-utils'
import type { TruckEvent } from '@/components/dashboard/types'
import { Tooltip } from '@/components/ui/Tooltip'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useDragDrop } from '@/lib/useDragDrop'
import { formatTime } from '@/lib/time-utils'
import { isExcluded } from '@/lib/schedule-extract'
import { detectEventConflicts } from '@/lib/event-conflicts'
import UserMenu from '@/components/dashboard/UserMenu'
import AppHeader from '@/components/shared/AppHeader'

// ── Types ─────────────────────────────────────────────────────
interface Truck { id: string; name: string; slug: string | null; description: string | null; cuisine_type: string | null; logo_storage_path: string | null; logo: string | null; contact_email: string | null; contact_phone: string | null; social_instagram: string | null; social_facebook: string | null; website: string | null; whatsapp: string | null; phone_is_whatsapp: boolean; auto_accept: boolean; dashboard_token: string; crew_mode: 'solo' | 'full'; kds_mode: boolean; keep_screen_on: boolean; plan: Plan; feature_overrides: Record<string, boolean> | null; trial_expires_at: string | null; whatsapp_sender: string | null; allergen_info_url: string | null; allergen_info_text: string | null; preferred_contact_method: string | null; allow_customer_cancellation: boolean; cancellation_cutoff_mins: number; is_test?: boolean; default_auto_open: boolean; default_auto_close: boolean; qr_code_style?: 'standard' | 'branded'; truck_emoji?: string; scraper_preference?: 'auto' | 'manual' | 'both'; schedule_url?: string | null }
interface Category { id: string; name: string; slug: string; prep_secs: number; batch_size: number; allow_notes: boolean; default_stock: number | null; sort_order: number; is_active: boolean; counts_toward_capacity?: boolean }
interface Item { id: string; name: string; description: string | null; price: number; category_id: string | null; subcategory_id?: string | null; subcategory?: string | null; is_available: boolean; stock_count: number | null; default_stock: number | null; sort_order: number; image_path: string | null; allergens: string[]; dietary_info: string[] }
interface Subcategory { id: string; category_id: string; name: string; sort_order: number }
interface ModifierGroup { id: string; name: string; is_required: boolean; min_choices: number; max_choices: number }
interface ModifierOption { id: string; group_id: string; name: string; price_adjustment: number; type: string; sort_order: number }
interface Bundle { id: string; name: string; description: string | null; bundle_price: number; original_price: number | null; is_available: boolean; apply_to_new_events: boolean; start_time: string | null; end_time: string | null; slot_1_category: string | null; slot_2_category: string | null; slot_3_category: string | null; slot_4_category: string | null; slot_5_category: string | null; slot_6_category: string | null; stock_warning?: string | null }
interface Van { id: string; truck_id: string; name: string; kds_token: string; active: boolean; auto_pause_on_offline: boolean; show_cooking_step: boolean; kitchen_capacity: number | null; capacity_window_mins?: number | null }
interface UpsellRule { id: string; trigger_category: string; suggest_category: string; max_suggestions: number; show_at_checkout: boolean }
interface TeamMember { id: string; email: string; name: string | null; role: 'owner' | 'manager' | 'staff'; accepted_at: string | null; auth_user_id: string | null; van_names?: string[] }

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
function Input({ label, value, onChange, onBlur, type = 'text', inputMode, placeholder, required, hint, error }: { label: string; value: string | number; onChange: (v: string) => void; onBlur?: () => void; type?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']; placeholder?: string; required?: boolean; hint?: string; error?: string }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-600 mb-1">{label}{required && <span className="text-red-400 ml-0.5">*</span>}</label>
      <input type={type} inputMode={inputMode} value={value} onChange={e => onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder}
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

const FOOD_EMOJI_CATEGORIES = [
  {
    label: 'Street food & fast food',
    emojis: ['🍕', '🍔', '🌮', '🌯', '🥙', '🌭', '🥪', '🍟', '🧆', '🫔', '🥡'],
  },
  {
    label: 'Meat & protein',
    emojis: ['🥩', '🍖', '🍗', '🥓', '🍳', '🥚', '🧀'],
  },
  {
    label: 'Fish & seafood',
    emojis: ['🐟', '🦐', '🦞', '🦀', '🦑', '🦪', '🍤'],
  },
  {
    label: 'World cuisine',
    emojis: ['🍜', '🍝', '🍛', '🍲', '🥘', '🫕', '🍱', '🍣', '🥟', '🍙', '🍚', '🍥', '🥮', '🍢', '🍡'],
  },
  {
    label: 'Bread & breakfast',
    emojis: ['🍞', '🥐', '🥖', '🫓', '🥨', '🥯', '🧇', '🥞', '🧈'],
  },
  {
    label: 'Sweet & dessert',
    emojis: ['🍰', '🎂', '🧁', '🍩', '🍪', '🍫', '🍬', '🍭', '🍮', '🍦', '🍨', '🍧', '🥧', '🍿'],
  },
  {
    label: 'Fruit & veg',
    emojis: ['🥗', '🌽', '🥦', '🥕', '🍅', '🫛', '🥬', '🥔', '🍠', '🧄', '🧅', '🍄', '🫒', '🥑', '🌶️', '🥜'],
  },
  {
    label: 'Drinks',
    emojis: ['☕', '🍵', '🫖', '🧃', '🥤', '🧋', '🥛', '🍺', '🥂', '🍷', '🥃', '🍹', '🧉', '🍾'],
  },
  {
    label: 'Utensils & dining',
    emojis: ['🍽️', '🍴', '🥢', '🥄', '🔪', '🫙', '🧂'],
  },
  {
    label: 'Truck & vibe',
    emojis: ['🚚', '🔥', '⭐', '✨', '🏆', '👨‍🍳', '🧑‍🍳', '🎪'],
  },
]

// ── Main page ──────────────────────────────────────────────────
export default function ManagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('menu')
  const [pendingVerifyEvents, setPendingVerifyEvents] = useState<any[] | null>(null)
  const [showTrialReminder, setShowTrialReminder] = useState(false)
  const [userRole, setUserRole] = useState<UserRole>('owner')
  const [truck, setTruck] = useState<Truck | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([])
  const [modifierOptions, setModifierOptions] = useState<ModifierOption[]>([])
  const [categoryModGroups, setCategoryModGroups] = useState<{category_id:string;group_id:string}[]>([])
  const [bundles, setBundles] = useState<Bundle[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{msg:string;type:'success'|'error'}|null>(null)
  const [currentUserName, setCurrentUserName] = useState<string | null>(null)
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null)
  const [currentUserFirstName, setCurrentUserFirstName] = useState<string | null>(null)
  const [currentUserLastName, setCurrentUserLastName] = useState<string | null>(null)
  const [currentUserPhone, setCurrentUserPhone] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [pendingEmailChange, setPendingEmailChange] = useState<{ id: string; new_email: string; requested_at: string; expired_at: string } | null>(null)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [editProfileName, setEditProfileName] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  // Pending scraper-approval count → Schedule nav badge + "events to approve" banner.
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0)
  // Banner is dismissible per-session but REAPPEARS when the count rises above the dismissed level
  // (i.e. new events arrived) — not dismissed-forever.
  const [bannerDismissedAtCount, setBannerDismissedAtCount] = useState<number | null>(null)
  const showApprovalBanner = pendingApprovalCount > 0 &&
    (bannerDismissedAtCount === null || pendingApprovalCount > bannerDismissedAtCount)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => setToast({ msg, type })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/manage?token=${token}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setTruck(data.truck)
      setUserRole(data.userRole || 'owner')
      setCurrentUserId(data.currentUserId || null)
      setCategories(data.categories)
      setItems(data.items)
      setSubcategories(data.subcategories || [])
      setModifierGroups(data.modifierGroups)
      setModifierOptions(data.modifierOptions)
      setCategoryModGroups(data.categoryModGroups)
      setBundles(data.bundles)
      setPendingEmailChange(data.pendingEmailChange || null)
    } catch (e: any) { showToast(e.message || 'Failed to load', 'error') }
    finally { setLoading(false) }
  }, [token])

  useEffect(() => { load() }, [load])

  // Keep the truck's van(s) alive while the operator is on Manage — mirrors the dashboard/KDS
  // heartbeat (every 15s → /api/heartbeat) so a dashboard→Manage switch doesn't stop the only
  // heartbeat and trigger a FALSE offline-pause (the device is still online; orders still land).
  // No vanId → the route's no-vanId path stamps THIS truck's active vans (Manage's URL token IS the
  // dashboard_token). UNGATED on live-event (Manage isn't event-scoped) — harmless, the monitor only
  // pauses status='open' events, so heartbeating with no live event keeps the van fresh and pauses
  // nothing. navigator.onLine guard so a GENUINE connectivity loss on Manage still lets the van pause
  // (protection intact) — we only suppress the false positive from a same-device screen switch.
  // Single-van/single-truck fix; per-van attendance scoping is a logged backlog item.
  useEffect(() => {
    const sendHeartbeat = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return
      try {
        await fetch('/api/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
      } catch {}
    }
    sendHeartbeat() // immediate ping on arriving at Manage (close the gap after the dashboard unmounts)
    const id = setInterval(sendHeartbeat, 15000)
    return () => clearInterval(id)
  }, [token])

  // Fetch the pending scraper-approval count on load so the badge/banner show without opening
  // Schedule. ScheduleTab keeps it live via onPendingCount after approve/reject. Upcoming only
  // (end not passed), source=scraper, status=unconfirmed — mirrors the Schedule "Needs approval" list.
  useEffect(() => {
    let cancelled = false
    fetch(`/api/events/manage?token=${token}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelled || !Array.isArray(d?.events)) return
        const now = new Date()
        const n = d.events.filter((e: any) =>
          e.status === 'unconfirmed' && e.source === 'scraper' &&
          (e.end_time ? now < new Date(`${e.event_date}T${e.end_time}`) : new Date(`${e.event_date}T23:59`) >= now)
        ).length
        setPendingApprovalCount(n)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [token])

  // Read ?tab= query param on mount and activate that tab
  useEffect(() => {
    const tabParam = new URLSearchParams(window.location.search).get('tab') as Tab | null
    const allTabIds: Tab[] = ['menu', 'modifiers', 'deals', 'reports', 'schedule', 'team', 'settings', 'billing']
    if (tabParam && allTabIds.includes(tabParam)) setActiveTab(tabParam)
  }, [])

  // Trial accounts default to billing tab on every page load
  useEffect(() => {
    if (truck?.plan === 'trial') setActiveTab('billing')
  }, [truck?.id])

  // Trial reminder popup — only within the final 2 months of the trial, then once per day.
  // Previously it appeared on every login regardless of how far out the trial end was (no
  // window gate) — e.g. ~2.4 months out. Now it stays hidden until now >= trial_end − 2 months
  // (Test Kitchen trial ends 23 Aug 2026 → shows from ~23 Jun 2026). The daily-dismiss
  // localStorage behaviour is kept on top (closing it won't re-show until the next day).
  useEffect(() => {
    if (truck?.plan !== 'trial') return
    if (!truck.trial_expires_at) return
    const windowStart = new Date(truck.trial_expires_at)
    windowStart.setMonth(windowStart.getMonth() - 2)   // 2 months before trial end
    if (new Date() < windowStart) return                // too early — don't nag yet
    const key = 'hg_trial_reminder_shown'
    const lastShown = localStorage.getItem(key)
    const today = new Date().toDateString()
    if (lastShown !== today) {
      setShowTrialReminder(true)
      localStorage.setItem(key, today)
    }
  }, [truck?.plan, truck?.trial_expires_at])

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
      if (d.is_admin) setIsAdmin(true)
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
      <div className="flex flex-col items-center gap-3"><Spinner /><p className="text-slate-400 text-sm">Loading management console...</p></div>
    </div>
  )

  if (!truck) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <p className="text-red-500 font-bold">Invalid or expired token</p>
    </div>
  )

  const allTabs: { id: Tab; label: string; icon: string; roles: UserRole[] }[] = [
    { id: 'menu',      label: 'Menu',      icon: truck?.truck_emoji || '🍕', roles: ['owner', 'manager'] },
    { id: 'schedule',  label: 'Schedule',  icon: '📅', roles: ['owner', 'manager'] },
    { id: 'deals',     label: 'Deals',     icon: '🎁', roles: ['owner', 'manager'] },
    { id: 'modifiers', label: 'Extras & Upsells', icon: '⚡', roles: ['owner', 'manager'] },
    { id: 'reports',   label: 'Reports',   icon: '📊', roles: ['owner', 'manager'] },
    { id: 'team',      label: 'Team',      icon: '👥', roles: ['owner', 'manager'] },
    { id: 'settings',  label: 'Settings',  icon: '🔧', roles: ['owner', 'manager'] },
    { id: 'billing',   label: 'Billing',   icon: '💳', roles: ['owner'] },
  ]
  const tabs = allTabs.filter(t => {
    if (t.id === 'billing') return userRole === 'owner' && truck?.plan !== 'tester'
    return t.roles.includes(userRole)
  })

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <AppHeader
        truckName={truck.name}
        truckLogoUrl={truck.logo ?? null}
        subtitle="Management console"
      >
        <a href={`/dashboard/${token}`}
          className="text-xs text-slate-400 hover:text-orange-400 font-bold transition-colors hidden sm:block">
          ← Orders dashboard
        </a>
        <UserMenu
          truckName={truck.name}
          operatorName={currentUserFirstName || currentUserName?.split(' ')[0] || ''}
          token={token}
          showDashboardLink
          isAdmin={isAdmin}
        />
      </AppHeader>
      {/* Tabs — bg-slate-900 must match HEADER_BG in lib/brand.ts */}
      <div className="bg-slate-900 border-b border-slate-700 sticky top-[51px] z-40 overflow-x-auto">
        <div className="max-w-5xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-bold whitespace-nowrap border-b-2 transition-colors ${activeTab === t.id ? 'border-orange-500 text-white' : 'border-transparent text-slate-400 hover:text-white'}`}>
              <span>{t.icon}</span>
              {t.id === 'schedule' && pendingApprovalCount > 0 ? (
                // Pending: show the count inline in the same font, reading "Schedule (8)" in orange.
                <span className="text-orange-400">{t.label} ({pendingApprovalCount})</span>
              ) : (
                t.label
              )}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Events-to-approve banner — helpful framing, dismissible, reappears when more arrive */}
        {showApprovalBanner && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-amber-500 text-lg shrink-0">📅</span>
            <p className="text-sm text-amber-800 flex-1">
              We found <strong>{pendingApprovalCount}</strong> event{pendingApprovalCount !== 1 ? 's' : ''} for you — review and approve before they go live.
            </p>
            <button onClick={() => setActiveTab('schedule')} className="text-xs font-bold text-amber-800 underline whitespace-nowrap">Review →</button>
            <button onClick={() => setBannerDismissedAtCount(pendingApprovalCount)} className="text-amber-400 hover:text-amber-600 text-sm font-bold leading-none shrink-0">✕</button>
          </div>
        )}
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
        {activeTab === 'menu'      && <MenuTab      truck={truck} categories={categories} items={items} subcategories={subcategories} token={token} api={api} reload={load} showToast={showToast} />}
        {activeTab === 'modifiers' && <ModifiersTab categories={categories} modifierGroups={modifierGroups} modifierOptions={modifierOptions} categoryModGroups={categoryModGroups} api={api} reload={load} showToast={showToast} />}
        {activeTab === 'deals'     && <DealsTab     categories={categories} bundles={bundles} setBundles={setBundles} api={api} reload={load} showToast={showToast} />}
        {activeTab === 'reports'   && <ReportsTab   truck={truck} api={api} />}
        <ScheduleTab isActive={activeTab === 'schedule'} truck={truck} token={token} bundles={bundles} categories={categories} api={api} reload={load} showToast={showToast} onSwitchTab={setActiveTab} pendingVerifyEvents={pendingVerifyEvents} onClearPendingVerify={() => setPendingVerifyEvents(null)} onPendingCount={setPendingApprovalCount} />
        {activeTab === 'team'      && <TeamTab      truck={truck} token={token} api={api} reload={load} showToast={showToast}
          currentUserEmail={currentUserEmail}
          currentUserFirstName={currentUserFirstName}
          currentUserLastName={currentUserLastName}
          currentUserPhone={currentUserPhone}
          currentUserId={currentUserId}
          userRole={userRole}
          initialPendingEmailChange={pendingEmailChange}
          onProfileSaved={(firstName, lastName, phone) => {
            const fullName = `${firstName} ${lastName}`.trim()
            setCurrentUserName(fullName)
            setCurrentUserFirstName(firstName)
            setCurrentUserLastName(lastName)
            setCurrentUserPhone(phone)
          }}
        />}
        {activeTab === 'settings'  && <SettingsTab  truck={truck} token={token} api={api} reload={load} showToast={showToast} onVerifySuccess={setPendingVerifyEvents} onSwitchTab={setActiveTab} categories={categories} />}
        {activeTab === 'billing'   && <BillingTab   truck={truck} />}
      </main>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* Trial reminder popup — shown once per day */}
      {showTrialReminder && truck && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl relative">
            <button
              onClick={() => setShowTrialReminder(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-lg leading-none">
              ✕
            </button>
            <div className="text-center mb-4">
              <div className="text-3xl mb-2">🎉</div>
              <h2 className="text-xl font-black text-slate-900">You&apos;re on a free trial</h2>
              <p className="text-sm text-slate-500 mt-1">
                Trial ends <span className="font-semibold text-orange-500">
                  {truck.trial_expires_at ? formatTrialEndDate(truck.trial_expires_at) : 'soon'}
                </span>
              </p>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-4 text-center">
              <p className="text-sm font-semibold text-orange-800">
                Full Max features + Pay at Hatch ordering — completely free*
              </p>
              <p className="text-sm text-orange-700 mt-1">
                You won&apos;t be charged anything until your trial ends on{' '}
                <strong>{truck.trial_expires_at ? formatTrialEndDate(truck.trial_expires_at) : 'soon'}</strong>.
                Choose your plan before then — if you don&apos;t, access will revert to the free Starter tier and some features will stop working.
              </p>
              <p className="text-xs text-orange-500 mt-2">
                *Standard card processing fees apply on online orders
              </p>
            </div>
            <button
              onClick={() => { setShowTrialReminder(false); setActiveTab('billing') }}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl transition-colors">
              Upgrade here →
            </button>
          </div>
        </div>
      )}

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

    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// MENU TAB
// ══════════════════════════════════════════════════════════════
type ImportStep = 'idle' | 'upload' | 'processing' | 'review' | 'prep' | 'saving' | 'done'

function MenuTab({ truck, categories, items, subcategories, token, api, reload, showToast }: {
  truck: Truck; categories: Category[]; items: Item[]; subcategories: Subcategory[]; token: string
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

  // Optimistic local sub-category state — mirrors `subcategories` prop, updated instantly on
  // add/delete/reorder (display-only labels; no capacity/stock/prep).
  const [localSubcats, setLocalSubcats] = useState<Subcategory[]>(subcategories)
  const prevSubcatsRef = useRef(subcategories)
  if (prevSubcatsRef.current !== subcategories) { prevSubcatsRef.current = subcategories; setLocalSubcats(subcategories) }
  const [newSubcatName, setNewSubcatName] = useState('')
  const [addingSubcatInModal, setAddingSubcatInModal] = useState(false)   // inline create in the item modal
  const [subcatModalCat, setSubcatModalCat] = useState<string | null>(null)   // category_id whose "Manage sub-categories" modal is open
  const [editingSubcatId, setEditingSubcatId] = useState<string | null>(null) // sub-category row in tap-to-rename mode
  const [editingSubcatName, setEditingSubcatName] = useState('')              // rename text buffer

  // Sub-categories for a given category, sorted by sort_order.
  const subcatsFor = (categoryId: string | null | undefined) =>
    !categoryId ? [] : localSubcats.filter(s => s.category_id === categoryId).sort((a, b) => a.sort_order - b.sort_order)

  // Create (or reactivate) a sub-category in a category, refresh local state, return the saved row.
  const createSubcategory = async (categoryId: string, name: string): Promise<Subcategory | null> => {
    const trimmed = name.trim()
    if (!trimmed || !categoryId) return null
    try {
      const res = await api('upsert_subcategory', { category_id: categoryId, name: trimmed })
      const sc = res.subcategory as Subcategory
      if (sc) setLocalSubcats(prev => prev.some(s => s.id === sc.id) ? prev.map(s => s.id === sc.id ? sc : s) : [...prev, sc])
      return sc ?? null
    } catch (e: any) { showToast(e.message || 'Failed to add sub-category', 'error'); return null }
  }

  // Delete a sub-category (empty-guarded server-side); show a clear message when it has items.
  const deleteSubcategory = async (sc: Subcategory) => {
    try {
      const res = await api('delete_subcategory', { id: sc.id })
      if (res?.ok === false && res.error === 'not_empty') {
        showToast(`Move or remove its ${res.count} item${res.count === 1 ? '' : 's'} first`, 'error'); return
      }
      setLocalSubcats(prev => prev.filter(s => s.id !== sc.id))
    } catch (e: any) {
      showToast(e.message || 'Failed to delete sub-category', 'error')
    }
  }

  // Reorder by swapping an adjacent pair's sort_order (one update_subcategory_order call per row).
  const moveSubcat = async (categoryId: string, scId: string, dir: -1 | 1) => {
    const list = subcatsFor(categoryId)
    const idx = list.findIndex(s => s.id === scId)
    const swapIdx = idx + dir
    if (idx < 0 || swapIdx < 0 || swapIdx >= list.length) return
    const a = list[idx], b = list[swapIdx]
    setLocalSubcats(prev => prev.map(s => s.id === a.id ? { ...s, sort_order: b.sort_order } : s.id === b.id ? { ...s, sort_order: a.sort_order } : s))
    try {
      await api('update_subcategory_order', { id: a.id, sort_order: b.sort_order })
      await api('update_subcategory_order', { id: b.id, sort_order: a.sort_order })
    } catch (e: any) { showToast(e.message || 'Failed to reorder', 'error') }
  }

  // Rename a sub-category by id, refresh local state. Same upsert action as create (edit-by-id).
  const renameSubcategory = async (sc: Subcategory, name: string) => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === sc.name) { setEditingSubcatId(null); return }
    try {
      const res = await api('upsert_subcategory', { id: sc.id, name: trimmed })
      const updated = res.subcategory as Subcategory
      if (updated) setLocalSubcats(prev => prev.map(s => s.id === updated.id ? updated : s))
    } catch (e: any) { showToast(e.message || 'Failed to rename sub-category', 'error') }
    setEditingSubcatId(null)
  }
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
  const [expandedCat, setExpandedCat] = useState<string | null>(null)
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

  const handleDeleteCategory = async (cat: Category) => {
    const catItemCount = localItems.filter(i => i.category_id === cat.id).length
    const confirmMsg = catItemCount > 0
      ? `Delete "${cat.name}"? This will also delete ${catItemCount} item${catItemCount === 1 ? '' : 's'} in this category. This cannot be undone.`
      : `Delete "${cat.name}"? This cannot be undone.`
    if (!window.confirm(confirmMsg)) return
    try {
      if (catItemCount > 0) {
        await api('bulk_delete_items', { category_id: cat.id })
      }
      await api('delete_category', { id: cat.id })
      await reload()
    } catch (e: any) {
      showToast(e.message, 'error')
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
      <div className="mb-2">
        {/* Row 1: heading + Add category button */}
        <div className="flex items-start justify-between">
          <div>
            {/* Manage page section heading — use font-black text-slate-900 text-lg for all tab headings */}
            <h2 className="font-black text-slate-900 text-lg">Menu</h2>
            <p className="text-slate-400 text-sm mt-0.5">
              {categories.length} {categories.length === 1 ? 'category' : 'categories'} · {items.length} items
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex flex-col items-end gap-0.5">
              <button onClick={() => setImportStep('upload')}
                className="flex items-center gap-2 px-4 py-2 border border-orange-200 text-orange-600 text-sm font-medium rounded-xl hover:bg-orange-50 transition-colors whitespace-nowrap">
                ✨ Import menu
              </button>
              <p className="text-xs text-slate-400">photo, PDF or text</p>
            </div>
            <div className="self-start">
              <Btn label="+ Add category" onClick={() => setEditingCat({ prep_secs: 0, batch_size: 0, allow_notes: false } as any)} />
            </div>
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
              onClick={() => handleExpandCat(isOpen ? null : cat.id)}>
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
                  {/* "Counts toward kitchen capacity" is configured in Settings → Kitchen capacity
                      (the tickbox list under the ceiling), not here — one place, no double-toggle.
                      A tiny read-only indicator for instant categories that are included: */}
                  {cat.prep_secs === 0 && cat.counts_toward_capacity && (
                    <span title="Counts toward the kitchen-capacity limit (set in Settings → Kitchen capacity)"
                      className="text-[11px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Counts toward capacity</span>
                  )}
                </div>
              </div>
              <div className="flex items-center shrink-0">
                <span className={`transition-transform inline-block text-slate-400 text-xs select-none ${isOpen ? 'rotate-90' : ''}`}>▶</span>
              </div>
            </div>

            {/* Inline category settings — visible when expanded and editingCat loaded */}
            {isOpen && editingCat?.id === cat.id && (
              <div className="border-t border-orange-100 bg-orange-50/40 px-4 py-3 space-y-2">
                {/* Row 1: Name + Allow notes toggle */}
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="text"
                    value={editingCat.name || ''}
                    onChange={e => setEditingCat(p => ({...p!, name: e.target.value}))}
                    onBlur={() => saveCat()}
                    placeholder="Category name"
                    className="flex-1 min-w-0 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Prep time (mins)</label>
                    <input type="number" min="0" max="60" placeholder="0 = instant"
                      value={editingCat.prep_secs ? Math.round(editingCat.prep_secs / 60) : ''}
                      onChange={e => setEditingCat(p => ({...p!, prep_secs: parseInt(e.target.value) * 60 || 0}))}
                      onBlur={() => saveCat()}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" />
                    <p className="text-xs text-slate-400 mt-1">Set to 0 for instant items (drinks, dips). These won&apos;t count toward kitchen capacity.</p>
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

                {/* Sub-categories — display-only headings within this category. Managed in a modal
                    (create/delete/rename/reorder are immediate); grouping is handled elsewhere. */}
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <button type="button"
                    onClick={() => { setNewSubcatName(''); setEditingSubcatId(null); setSubcatModalCat(cat.id) }}
                    className="inline-flex items-center gap-2 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                    Manage sub-categories ({subcatsFor(cat.id).length})
                  </button>
                </div>
              </div>
            )}

            {/* Items */}
            {isOpen && (
              <div className="border-t border-slate-100">
                {/* Group the editor's item list by sub-category — ALL active sub-cats show as headings
                    here INCLUDING EMPTY ones; ungrouped items (subcategory_id null) render first with no
                    heading. Display-only (Phase 3); "+ Add item" stays category-level below. */}
                {groupBySubcategory(catItems, subcatsFor(cat.id)).map(group => (
                <div key={group.id ?? '__ungrouped'}>
                  {group.name && <p className="text-xs font-black text-orange-500 uppercase tracking-wider px-4 pt-2.5 pb-1">{group.name}{group.items.length === 0 ? ' · empty' : ''}</p>}
                  {group.items.map(item => (
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
                </div>
                ))}

                <div className="px-4 py-3">
                  <Btn label="+ Add item" size="sm" colour="ghost" onClick={() => setEditingItem({ category_id: cat.id, is_available: true, price: 0 })} />
                </div>
                <div className="px-4 pb-4">
                  <button
                    onClick={() => handleDeleteCategory(cat)}
                    className="mt-4 text-sm text-red-500 hover:text-red-700 flex items-center gap-1"
                  >
                    🗑 Delete category
                  </button>
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
                  <p className="text-xs text-slate-400 mt-1">Set to 0 for instant items (drinks, dips). These won&apos;t count toward kitchen capacity.</p>
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

      {/* Manage sub-categories modal — create/delete/rename/reorder are all immediate (no save step).
          Reads from localSubcats via subcatsFor(), so it re-renders live as the handlers update state. */}
      {subcatModalCat && (() => {
        const modalCat = categories.find(c => c.id === subcatModalCat)
        const modalSubcats = subcatsFor(subcatModalCat)
        return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setSubcatModalCat(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="font-black text-slate-900 mb-4">Sub-categories — {modalCat?.name}</h3>
            <div className="space-y-1.5">
              {modalSubcats.map((sc, i, arr) => {
                const itemCount = localItems.filter(it => it.subcategory_id === sc.id).length
                return (
                  <div key={sc.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-2.5 py-1.5">
                    <div className="flex items-center gap-1">
                      <button type="button" disabled={i === 0} onClick={() => moveSubcat(subcatModalCat, sc.id, -1)}
                        className="border border-slate-200 rounded px-2 py-1 text-slate-600 hover:bg-slate-50 disabled:opacity-30" title="Move up">↑</button>
                      <button type="button" disabled={i === arr.length - 1} onClick={() => moveSubcat(subcatModalCat, sc.id, 1)}
                        className="border border-slate-200 rounded px-2 py-1 text-slate-600 hover:bg-slate-50 disabled:opacity-30" title="Move down">↓</button>
                    </div>
                    {editingSubcatId === sc.id ? (
                      <input autoFocus value={editingSubcatName}
                        onChange={e => setEditingSubcatName(e.target.value)}
                        onBlur={() => renameSubcategory(sc, editingSubcatName)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { renameSubcategory(sc, editingSubcatName) }
                          else if (e.key === 'Escape') { setEditingSubcatId(null) }
                        }}
                        className="flex-1 border border-slate-200 rounded-lg px-2.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" />
                    ) : (
                      <button type="button" onClick={() => { setEditingSubcatId(sc.id); setEditingSubcatName(sc.name) }}
                        className="flex-1 text-left text-sm text-slate-700 truncate hover:text-orange-600" title="Tap to rename">{sc.name}</button>
                    )}
                    <span className="text-[10px] text-slate-400 flex-shrink-0">{itemCount === 0 ? 'empty' : `${itemCount} item${itemCount === 1 ? '' : 's'}`}</span>
                    <button type="button" onClick={() => deleteSubcategory(sc)} className="text-slate-400 hover:text-red-500 text-sm flex-shrink-0" title="Delete sub-category">🗑</button>
                  </div>
                )
              })}
              {modalSubcats.length === 0 && <p className="text-xs text-slate-400">No sub-categories yet</p>}
            </div>
            <div className="flex items-center gap-2 mt-3">
              <input value={newSubcatName} onChange={e => setNewSubcatName(e.target.value)}
                onKeyDown={async e => {
                  if (e.key === 'Enter' && newSubcatName.trim()) { await createSubcategory(subcatModalCat, newSubcatName); setNewSubcatName('') }
                }}
                placeholder="Sub-category name"
                className="flex-1 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" />
              <button type="button" disabled={!newSubcatName.trim()}
                onClick={async () => { await createSubcategory(subcatModalCat, newSubcatName); setNewSubcatName('') }}
                className="flex-shrink-0 text-xs font-bold px-2.5 py-1.5 rounded-lg bg-orange-600 text-white disabled:opacity-40">+ Add sub-category</button>
            </div>
            <div className="flex gap-2 mt-4">
              <Btn label="Done" colour="slate" onClick={() => setSubcatModalCat(null)} />
            </div>
          </div>
        </div>
        )
      })()}

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
                <select value={editingItem.category_id || ''} onChange={e => {
                    const newCat = e.target.value || null
                    // If the current sub-category doesn't belong to the new category, clear it.
                    setEditingItem(p => {
                      const stillValid = p?.subcategory_id && subcatsFor(newCat).some(s => s.id === p.subcategory_id)
                      return { ...p!, category_id: newCat, subcategory_id: stillValid ? p!.subcategory_id : null }
                    })
                    setAddingSubcatInModal(false)
                  }}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white">
                  <option value="">No category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* Sub-category (optional, display-only) — a managed label that groups this item under a
                  heading within its category on the order screens. Dropdown of the selected category's
                  sub-categories (+ inline create). null = ungrouped. Phase 3 does the actual grouping. */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Sub-category <span className="text-slate-400 font-normal">(optional)</span></label>
                <div className="flex items-center gap-2">
                  <select
                    value={editingItem.subcategory_id || ''}
                    onChange={e => setEditingItem(p => ({...p!, subcategory_id: e.target.value || null}))}
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white">
                    <option value="">— None —</option>
                    {subcatsFor(editingItem.category_id).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <button type="button" disabled={!editingItem.category_id}
                    onClick={() => { setNewSubcatName(''); setAddingSubcatInModal(true) }}
                    className="flex-shrink-0 text-xs font-bold px-2.5 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
                    + New
                  </button>
                </div>
                {addingSubcatInModal && editingItem.category_id && (
                  <div className="flex items-center gap-2 mt-2">
                    <input autoFocus value={newSubcatName} onChange={e => setNewSubcatName(e.target.value)}
                      onKeyDown={async e => {
                        if (e.key === 'Enter') {
                          const sc = await createSubcategory(editingItem.category_id!, newSubcatName)
                          if (sc) { setEditingItem(p => ({...p!, subcategory_id: sc.id})); setAddingSubcatInModal(false) }
                        } else if (e.key === 'Escape') { setAddingSubcatInModal(false) }
                      }}
                      placeholder="New sub-category name"
                      className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" />
                    <button type="button" disabled={!newSubcatName.trim()}
                      onClick={async () => {
                        const sc = await createSubcategory(editingItem.category_id!, newSubcatName)
                        if (sc) { setEditingItem(p => ({...p!, subcategory_id: sc.id})); setAddingSubcatInModal(false) }
                      }}
                      className="flex-shrink-0 text-xs font-bold px-2.5 py-2 rounded-xl bg-orange-600 text-white disabled:opacity-40">Add</button>
                    <button type="button" onClick={() => setAddingSubcatInModal(false)}
                      className="flex-shrink-0 text-xs px-2.5 py-2 rounded-xl border border-slate-200 text-slate-500">Cancel</button>
                  </div>
                )}
                <p className="text-xs text-slate-400 mt-1">Groups this item under a heading within its category on the order screens — e.g. Meat Lovers, Veggie. Leave blank for none.</p>
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
  // When set, the inline form is editing this existing rule (vs. adding a new one).
  const [editingId, setEditingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await api('get_upsell_rules')
      setRules(data.rules || [])
    } catch { /* non-fatal */ }
    finally { setLoading(false) }
  }, [api])

  useEffect(() => { load() }, [load])

  const saveRule = async () => {
    if (!newTrigger || !newSuggest || newTrigger === newSuggest) return
    const editing = editingId ? rules.find(r => r.id === editingId) : undefined
    try {
      const data = await api('upsert_upsell_rule', {
        id: editingId ?? undefined,
        trigger_category: newTrigger,
        suggest_category: newSuggest,
        max_suggestions: editing?.max_suggestions ?? 3,
        show_at_checkout: editing?.show_at_checkout ?? true,
      })
      setRules(prev => editingId ? prev.map(r => r.id === editingId ? data.rule : r) : [...prev, data.rule])
      setNewTrigger(''); setNewSuggest(''); setEditingId(null); setAdding(false)
      showToast(editingId ? 'Upsell rule updated' : 'Upsell rule added')
    } catch (e: any) { showToast(e.message, 'error') }
  }

  const startEdit = (rule: UpsellRule) => {
    setNewTrigger(rule.trigger_category)
    setNewSuggest(rule.suggest_category)
    setEditingId(rule.id)
    setAdding(true)
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
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">When customer adds…</label>
              <select value={newTrigger} onChange={e => setNewTrigger(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
                <option value="">Choose category</option>
                {catNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Suggest items from…</label>
              <select value={newSuggest} onChange={e => setNewSuggest(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
                <option value="">Choose category</option>
                {catNames.filter(n => n !== newTrigger).map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <Btn label="Cancel" colour="slate" onClick={() => { setAdding(false); setNewTrigger(''); setNewSuggest(''); setEditingId(null) }} />
            <Btn label={editingId ? 'Save changes' : 'Add rule'} onClick={saveRule} />
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
                <button onClick={() => startEdit(rule)}
                  className="text-slate-400 hover:text-orange-500 text-sm px-1.5 py-1 rounded hover:bg-orange-50">
                  ✏️
                </button>
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
  // Price adjustment is edited as a STRING buffer (clean decimal entry, no stuck leading zero / can
  // hold "1." mid-type / can be empty). Seeded when the option editor opens; coerced to a number only
  // on save. Empty/malformed → 0 (free). See saveOption + the Price adjustment Input.
  const [priceInput, setPriceInput] = useState('')
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
    // Coerce the price STRING buffer → number here (the only place). Empty or malformed → 0 (free),
    // preserving the "0 = free" semantics; never write NaN. Stored format (number) is unchanged.
    const parsedPrice = parseFloat(priceInput)
    const price_adjustment = Number.isFinite(parsedPrice) ? parsedPrice : 0
    setSavingOption(true)
    try {
      await api('upsert_modifier_option', { ...editingOption, price_adjustment })
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
      <p className="text-xs text-slate-400 mb-4">Create a group of options and assign it to a menu category. All items in that category will offer those options when customers order.</p>

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
              <span className={`transition-transform inline-block text-slate-400 text-xs flex-shrink-0 ${isOpen ? 'rotate-90' : ''}`}>▶</span>
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
                      <button onClick={() => { setEditingOption(opt); setPriceInput(opt.price_adjustment ? String(opt.price_adjustment) : '') }} className="text-slate-300 hover:text-orange-500 text-xs px-1.5 py-0.5 rounded hover:bg-orange-50">✏️</button>
                      <button onClick={async () => { const gid = opt.group_id; await api('delete_modifier_option', { id: opt.id }); await reload(); setExpandedGroup(gid); showToast('Option removed') }} className="text-slate-300 hover:text-red-500 text-xs px-1.5 py-0.5 rounded hover:bg-red-50">🗑️</button>
                    </div>
                  ))}
                  <button
                    onClick={() => { setEditingOption({ group_id: group.id, type: 'add', price_adjustment: 0, sort_order: opts.length }); setPriceInput('') }}
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
                <Input label="Price adjustment (£)" type="text" inputMode="decimal" value={priceInput} onChange={setPriceInput} placeholder="0" hint="0 = free" />
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
  if (status === 'cancelled') return (
    <span className="text-xs font-semibold text-slate-400">Cancelled</span>
  )
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

const SCHEDULE_TIME_OPTIONS = Array.from({ length: 33 }, (_, i) => {
  const totalMins = 7 * 60 + i * 30
  const h = Math.floor(totalMins / 60).toString().padStart(2, '0')
  const m = (totalMins % 60).toString().padStart(2, '0')
  return `${h}:${m}`
})

function applyStartTimeChange(newStart: string, currentEnd: string): { start_time: string; end_time: string } {
  if (!newStart) return { start_time: '', end_time: currentEnd }
  if (!currentEnd) {
    const [h, m] = newStart.split(':').map(Number)
    const clamped = Math.min(h * 60 + m + 180, 23 * 60)
    const autoEnd = `${Math.floor(clamped / 60).toString().padStart(2, '0')}:${(clamped % 60).toString().padStart(2, '0')}`
    return { start_time: newStart, end_time: autoEnd }
  }
  if (currentEnd <= newStart) return { start_time: newStart, end_time: '' }
  return { start_time: newStart, end_time: currentEnd }
}

function ScheduleTab({ isActive, truck, token, bundles, categories, api, reload, showToast, onSwitchTab, pendingVerifyEvents, onClearPendingVerify, onPendingCount }: {
  isActive: boolean; truck: Truck; token: string; bundles: Bundle[]; categories: Category[]
  api: (a: string, e?: any) => Promise<any>; reload: () => void; showToast: (m: string, t?: any) => void
  onSwitchTab: (tab: Tab) => void
  pendingVerifyEvents?: any[] | null
  onClearPendingVerify?: () => void
  onPendingCount?: (n: number) => void
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
  const [editingEventConfirmOnSave, setEditingEventConfirmOnSave] = useState(false)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [editSaving, setEditSaving] = useState(false)
  const [vans, setVans] = useState<{ id: string; name: string }[]>([])
  const [addMode, setAddMode] = useState<'manual' | 'upload'>('manual')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadText, setUploadText] = useState('')
  const [uploadProcessing, setUploadProcessing] = useState(false)
  const [extractedEvents, setExtractedEvents] = useState<any[]>([])
  const [editedEvents, setEditedEvents] = useState<any[]>([])
  const [selectedEvents, setSelectedEvents] = useState<Set<number>>(new Set())
  const [editingEventIdx, setEditingEventIdx] = useState<number | null>(null)
  const [expandedEventIds, setExpandedEventIds] = useState<Set<string>>(new Set())
  const [focusedEventIds, setFocusedEventIds] = useState<Set<string>>(new Set())
  const [savingExtracted, setSavingExtracted] = useState(false)
  const [exclusionTerms, setExclusionTerms] = useState<string[]>([])
  const [exclusionList, setExclusionList] = useState<{ id: string; term: string }[]>([])
  const [showVenueSuggestions, setShowVenueSuggestions] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importModalTitle, setImportModalTitle] = useState('Import schedule')
  const { isDragging: isScheduleDragging, dragProps: scheduleDragProps } = useDragDrop(
    (file) => setUploadFile(file),
    ['image/*', '.pdf']
  )

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

  useEffect(() => { if (isActive) loadEvents() }, [isActive, loadEvents])
  // Keep the parent's Schedule badge/banner count live after approve/reject (optimistic setEvents).
  // Upcoming scraper-unconfirmed only — mirrors the "Needs your approval" list. Past-check inlined
  // (isPastEvent is defined later in render). Skipped while still loading (avoid a transient 0).
  useEffect(() => {
    if (!onPendingCount || loadingEvents) return
    const now = new Date()
    const n = events.filter(e =>
      e.status === 'unconfirmed' && e.source === 'scraper' &&
      (e.end_time ? now < new Date(`${e.event_date}T${e.end_time}`) : new Date(`${e.event_date}T23:59`) >= now)
    ).length
    onPendingCount(n)
  }, [events, loadingEvents, onPendingCount])
  useEffect(() => { if (isActive) api('get_vans').then(r => setVans((r.vans || []).map((v: any) => ({ id: v.id, name: v.name })))).catch(() => {}) }, [isActive])
  useEffect(() => {
    if (!isActive) return
    api('get_exclusion_terms').then(r => {
      const list = (r.terms || []) as { id: string; term: string }[]
      setExclusionList(list)
      setExclusionTerms(list.map((t: { id: string; term: string }) => t.term))
    }).catch(() => {})
  }, [isActive])

  useEffect(() => {
    if (!pendingVerifyEvents?.length) return
    const _seedToday = new Date().toISOString().split('T')[0]
    const evs = pendingVerifyEvents.map((e: any, i: number) => {
      const _p = (e.event_date || '').split('/')
      const _iso = _p.length === 3 ? `${_p[2]}-${_p[1].padStart(2,'0')}-${_p[0].padStart(2,'0')}` : ''
      return {
        ...e,
        id: `ev-${i}-${Date.now()}`,
        selected: !(_iso && _iso < _seedToday),
        _missingDate: !e.event_date,
        _missingVenue: !e.venue_name,
        _missingTime: !e.start_time || !e.end_time,
        _originalDate: e.event_date,
      }
    })
    setExtractedEvents(evs)
    setEditedEvents(evs)
    setSelectedEvents(new Set(evs.map((_: any, i: number) => i)))
    setExpandedEventIds(new Set())
    setFocusedEventIds(new Set(evs.filter((e: any) => e._missingDate || e._missingVenue || e._missingTime).map((e: any) => e.id)))
    setImportModalTitle('Events found on your website')
    setShowImportModal(true)
    onClearPendingVerify?.()
  }, [pendingVerifyEvents])

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
      truck_id: truck.id,
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
    if (vans.length > 1 && !form.van_id) errors.van_id = 'Please select a truck'
    return errors
  }

  const closeAddModal = () => {
    setEditingEvent(null)
    setEditingEventConfirmOnSave(false)
    setFormErrors({})
    setExtractedEvents([])
    setEditedEvents([])
    setSelectedEvents(new Set())
    setEditingEventIdx(null)
    setExpandedEventIds(new Set())
    setFocusedEventIds(new Set())
    setUploadFile(null)
    setUploadText('')
  }

  const closeImportModal = () => {
    setShowImportModal(false)
    setImportModalTitle('Import schedule')
    setUploadFile(null)
    setUploadText('')
    setExtractedEvents([])
    setEditedEvents([])
    setSelectedEvents(new Set())
    setEditingEventIdx(null)
    setExpandedEventIds(new Set())
    setFocusedEventIds(new Set())
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
      if (editingEventConfirmOnSave && editingEvent.id) {
        await handleConfirmEvent(editingEvent.id)
        setEditingEventConfirmOnSave(false)
      } else {
        showToast(editingEvent.id ? 'Event updated' : 'Event added')
      }
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
    const raw = data.events || []
    const _seedToday = new Date().toISOString().split('T')[0]
    const evs = raw.map((e: any, i: number) => {
      const _p = (e.event_date || '').split('/')
      const _iso = _p.length === 3 ? `${_p[2]}-${_p[1].padStart(2,'0')}-${_p[0].padStart(2,'0')}` : ''
      return {
        ...e,
        id: `ev-${i}-${Date.now()}`,
        selected: !(_iso && _iso < _seedToday),
        _missingDate: !e.event_date,
        _missingVenue: !e.venue_name,
        _missingTime: !e.start_time || !e.end_time,
        _originalDate: e.event_date,
      }
    })
    setExtractedEvents(evs)
    setEditedEvents(evs)
    setSelectedEvents(new Set(evs.map((_: any, i: number) => i)))
    setExpandedEventIds(new Set())
    setFocusedEventIds(new Set(evs.filter((e: any) => e._missingDate || e._missingVenue || e._missingTime).map((e: any) => e.id)))
    setUploadProcessing(false)
  }

  const saveExtractedEvents = async (eventsToSave?: any[]) => {
    const toSave = eventsToSave ?? extractedEvents
    setSavingExtracted(true)
    try {
      for (const ev of toSave) {
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
          address: ev.address || '',
          event_date: isoDate,
          start_time: ev.start_time || '',
          end_time: ev.end_time || '',
          notes: ev.notes || '',
          latitude: lat,
          longitude: lng,
          truck_id: editingEvent?.truck_id || truck.id,
        })
      }
      const count = toSave.length
      await loadEvents()
      closeAddModal()
      setShowImportModal(false)
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

  const [pendingRejectId, setPendingRejectId] = useState<string | null>(null)
  // Conflict acknowledge gate: the event id whose Approve has been clicked while a conflict exists,
  // so the card shows the explicit "approve anyway" acknowledgement (warn-with-friction, not block).
  const [conflictAckId, setConflictAckId] = useState<string | null>(null)

  const doRejectEvent = async (eventId: string) => {
    setSaving(true)
    try {
      const res = await fetch('/api/events/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // suppress: true → server stores the event's scraped signature so it won't re-surface (Stage 3).
        body: JSON.stringify({ token, action: 'cancel', eventId, payload: { auto_open: false, auto_close: false, suppress: true } }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setEvents(prev => prev.filter(e => e.id !== eventId))
      showToast('Event rejected')
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setSaving(false); setPendingRejectId(null) }
  }

  const handleRejectScrapedEvent = (eventId: string) => doRejectEvent(eventId)

  const openEventCancelModal = async (event: TruckEvent) => {
    setCancellingEvent(event)
    setAffectedOrderCount(0)
    setShowEventCancelModal(true)
    try {
      const res = await fetch(`/api/events/affected-orders?eventId=${event.id}&token=${token}`)
      const data = await res.json()
      if (res.ok) setAffectedOrderCount(data.count ?? 0)
    } catch { /* silently fail — modal still works, count just shows 0 */ }
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

  const renderEvent = (event: TruckEvent, pending = false) => {
    const isPast = isPastEvent(event) || event.status === 'cancelled'
    // READ-TIME conflict check (no new column): for ANY event being CONFIRMED — the scraper approval
    // card (pending=true) AND the operator-added "Needs confirmation" card (pending=false, the inline
    // Confirm button). Both are status 'unconfirmed' candidates; the helper compares them against
    // existing same-date confirmed/open events and is source-agnostic. See lib/event-conflicts.ts.
    // Complementary to the inbound-schedule scrape dedup (untouched).
    const conflicts = event.status === 'unconfirmed' ? detectEventConflicts(event, events) : []
    const dateObj = new Date(event.event_date + 'T00:00:00')
    const dayName = dateObj.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase()
    const dayNum = dateObj.getDate()
    const month = dateObj.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()

    return (
      <Card key={event.id}>
        <div className="px-4 py-3">
          {/* Main row: date | venue | status | actions */}
          <div className="flex items-start gap-4">

            {/* Date column — fixed width, calendar-style */}
            <div className="flex flex-col items-center justify-center w-12 flex-shrink-0 text-center pl-2">
              <span className="text-[10px] font-bold text-slate-400 leading-none">{dayName}</span>
              <span className="text-2xl font-black text-orange-600 leading-tight">{dayNum}</span>
              <span className="text-[10px] font-bold text-slate-400 leading-none">{month}</span>
            </div>

            {/* Divider */}
            <div className="w-px bg-slate-100 self-stretch flex-shrink-0" />

            {/* Venue / area & postcode / time — 3 lines */}
            <div className="flex-1 min-w-0">
              {/* Line 1: venue name (+ status) */}
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-bold text-slate-900">{event.venue_name}</p>
                <EventStatusBadge status={event.status} event_date={event.event_date} end_time={event.end_time} />
              </div>
              {/* Line 2: area & postcode */}
              {(event.town || event.postcode) && (
                <p className="text-xs text-slate-500 mt-0.5">{[event.town, event.postcode].filter(Boolean).join(' · ')}</p>
              )}
              {/* Line 3: time (+ van / truck) */}
              <p className="text-sm font-semibold text-slate-700 mt-0.5">
                {event.start_time && event.end_time && `${formatTime(event.start_time)}–${formatTime(event.end_time)}`}
                {vans.length > 1 && event.van_id && ` · ${vans.find(v => v.id === event.van_id)?.name || ''}`}
              </p>
              {event.notes && <p className="text-xs text-slate-400 mt-0.5 truncate">📝 {event.notes}</p>}
            </div>

            {/* Actions — confirmed cards keep their compact icon buttons right-aligned here.
                Pending (Approve/Edit/Reject) render in a full-width row BELOW the main row (see below),
                so the venue/area/time block above gets the full card width. */}
            {!pending && (
              <div className="flex items-center gap-1.5 flex-shrink-0 self-start">
                <>
                  {event.status === 'unconfirmed' && (
                    // SAME acknowledge gate as the scraper Approve button: with a conflict the first
                    // click reveals "confirm anyway" in the banner below (warn-with-friction); no
                    // conflict → confirms immediately. Keyed on event.id so cards don't collide.
                    <button onClick={() => { if (conflicts.length > 0 && conflictAckId !== event.id) { setConflictAckId(event.id) } else { handleConfirmEvent(event.id) } }} className="text-xs font-semibold text-green-700 border border-green-300 bg-white rounded-lg px-2 py-1.5 hover:bg-green-50">
                      <span className="sm:hidden">✓</span>
                      <span className="hidden sm:inline">Confirm</span>
                    </button>
                  )}
                  <button onClick={() => { setAddMode('manual'); setExtractedEvents([]); handleCopyEvent(event) }} className="text-xs font-semibold text-slate-600 border border-slate-200 bg-white rounded-lg px-2 py-1.5 hover:bg-slate-50">
                    <span className="sm:hidden">⧉</span>
                    <span className="hidden sm:inline">Copy</span>
                  </button>
                  {!isPast && (
                    <>
                      <button onClick={() => { setFormErrors({}); setEditingEvent({ id: event.id, venue_name: event.venue_name, town: event.town || '', postcode: event.postcode || '', address: event.address || '', event_date: event.event_date, start_time: event.start_time ? event.start_time.substring(0, 5) : '', end_time: event.end_time ? event.end_time.substring(0, 5) : '', notes: event.notes || '', truck_id: event.truck_id || truck.id, van_id: event.van_id || null }) }} className="text-xs font-semibold text-slate-600 border border-slate-200 bg-white rounded-lg px-2 py-1.5 hover:bg-slate-50">
                        <span className="sm:hidden">✏</span>
                        <span className="hidden sm:inline">Edit</span>
                      </button>
                      <button onClick={() => openEventCancelModal(event)} className="text-xs font-semibold text-red-600 border border-red-200 bg-white rounded-lg px-2 py-1.5 hover:bg-red-50">
                        <span className="sm:hidden">✕</span>
                        <span className="hidden sm:inline">Cancel</span>
                      </button>
                    </>
                  )}
                </>
              </div>
            )}
          </div>

          {/* Conflict warning — shown when this unconfirmed event (scraper card OR operator-added
              card) clashes with an existing confirmed/open event. `conflicts` is non-empty only for
              status 'unconfirmed', so this is NOT gated on `pending` — it renders below the main row
              for BOTH card types. Lists each conflicting event's details (venue/date/time/postcode)
              for side-by-side comparison; the Approve/Confirm action requires an explicit acknowledge
              (warn-with-friction, never hard-blocked). */}
          {conflicts.length > 0 && (
            <div className="mt-3 px-3 py-2.5 bg-amber-50 border border-amber-300 rounded-lg text-sm">
              <p className="font-bold text-amber-800 mb-1.5">⚠️ Possible conflict{conflicts.length !== 1 ? 's' : ''} — review before {pending ? 'approving' : 'confirming'}</p>
              <div className="space-y-2">
                {conflicts.map((c, i) => (
                  <div key={`${c.event.id}-${i}`} className="text-amber-900">
                    <p>{c.message}</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Already on your schedule: <strong>{c.event.venue_name || 'Unnamed venue'}</strong>
                      {` · ${new Date(`${c.event.event_date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
                      {(c.event.start_time || c.event.end_time) ? ` · ${(c.event.start_time || '').slice(0, 5)}–${(c.event.end_time || '').slice(0, 5)}` : ''}
                      {c.event.postcode ? ` · ${c.event.postcode}` : ''}
                      {` (${c.event.status})`}
                    </p>
                  </div>
                ))}
              </div>
              {conflictAckId === event.id && (
                <div className="flex flex-wrap gap-2 mt-2.5">
                  <button onClick={() => { handleConfirmEvent(event.id); setConflictAckId(null) }} className="text-xs font-semibold px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700">Yes, these are different events — {pending ? 'approve' : 'confirm'} anyway</button>
                  <button onClick={() => setConflictAckId(null)} className="text-xs font-medium px-3 py-1.5 border border-amber-300 bg-white rounded-lg hover:bg-amber-100">Cancel</button>
                </div>
              )}
            </div>
          )}

          {/* Pending approval actions — full-width row beneath the text (frees the venue/area/time
              block above), same position pattern as the deal-summary line. flex-1 even on mobile;
              compact right-aligned on desktop. ≥16px text on mobile (iOS rule). */}
          {pending && (
            <div className="flex gap-2 mt-3 sm:justify-end">
              {/* Approve: with a conflict, the FIRST click reveals the acknowledge in the banner
                  above (warn-with-friction); the explicit "approve anyway" there confirms. No conflict
                  → confirms immediately. */}
              <button onClick={() => { if (conflicts.length > 0 && conflictAckId !== event.id) { setConflictAckId(event.id) } else { handleConfirmEvent(event.id) } }} className="flex-1 sm:flex-none text-center text-base sm:text-xs font-semibold text-green-700 border border-green-300 bg-white rounded-lg px-3 py-2 sm:py-1.5 hover:bg-green-50">Approve</button>
              {!isPast && (
                <button onClick={() => { setEditingEventConfirmOnSave(true); setFormErrors({}); setEditingEvent({ id: event.id, venue_name: event.venue_name, town: event.town || '', postcode: event.postcode || '', address: event.address || '', event_date: event.event_date, start_time: event.start_time ? event.start_time.substring(0, 5) : '', end_time: event.end_time ? event.end_time.substring(0, 5) : '', notes: event.notes || '', truck_id: event.truck_id || truck.id, van_id: event.van_id || null }) }} className="flex-1 sm:flex-none text-center text-base sm:text-xs font-semibold text-slate-600 border border-slate-200 bg-white rounded-lg px-3 py-2 sm:py-1.5 hover:bg-slate-50">Edit</button>
              )}
              {pendingRejectId !== event.id && (
                <button onClick={() => setPendingRejectId(event.id)} className="flex-1 sm:flex-none text-center text-base sm:text-xs font-semibold text-red-600 border border-red-200 bg-white rounded-lg px-3 py-2 sm:py-1.5 hover:bg-red-50">Reject</button>
              )}
            </div>
          )}

          {/* Reject confirm — scraper-pending only, inline below the row. Single OK/Cancel; OK
              rejects AND suppresses this exact event (truck+date+venue) so it won't re-surface. */}
          {pending && pendingRejectId === event.id && (
            <div className="mt-3 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600">
              <p className="font-medium mb-2">We won&apos;t show this event again.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => handleRejectScrapedEvent(event.id)} className="text-xs font-medium px-4 py-1.5 bg-slate-800 text-white rounded-lg hover:bg-slate-900">OK</button>
                <button type="button" onClick={() => setPendingRejectId(null)} className="text-xs font-medium px-4 py-1.5 border border-slate-200 bg-white rounded-lg hover:bg-slate-50">Cancel</button>
              </div>
            </div>
          )}

          {/* Deals — collapsed by default, expand on tap */}
          {!isPast && bundles.length > 0 && (() => {
            const activeDeals = bundles.filter(bundle => {
              const eventDeal = event.event_deals?.find(d => d.bundle_id === bundle.id)
              return eventDeal ? eventDeal.active : bundle.apply_to_new_events
            })
            const hiddenDeals = activeDeals.filter(b => b.stock_warning)
            const dealNames = activeDeals.map(b => b.name).join(' · ')
            const dealLabel = activeDeals.length === 0
              ? 'No deals active'
              : `${activeDeals.length} deal${activeDeals.length !== 1 ? 's' : ''} active · ${dealNames}${hiddenDeals.length > 0 ? ` · ${hiddenDeals.length} hidden` : ''}`

            return (
              <details className="mt-2 border-t border-slate-50 pt-2 group">
                <summary className="text-xs text-slate-400 cursor-pointer select-none hover:text-slate-600 list-none flex items-center gap-1">
                  <span className="transition-transform group-open:rotate-90 inline-block text-slate-300">▶</span>
                  <span>{dealLabel}</span>
                </summary>
                <div className="mt-2 space-y-1">
                  {bundles.map(bundle => {
                    const eventDeal = event.event_deals?.find(d => d.bundle_id === bundle.id)
                    const isActive = eventDeal ? eventDeal.active : bundle.apply_to_new_events
                    return (
                      <div key={bundle.id} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-700 truncate">{bundle.name}</span>
                            <span className="text-xs text-slate-400">£{bundle.bundle_price.toFixed(2)}</span>
                            {bundle.stock_warning && <span className="text-xs text-amber-600">⚠️ Stock</span>}
                          </div>
                          {bundle.stock_warning && <p className="text-xs text-amber-600 mt-0.5">Hidden — {bundle.stock_warning}</p>}
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
              </details>
            )
          })()}
        </div>
      </Card>
    )
  }

  const filteredVenueSuggestions = editingEvent?.venue_name
    ? venueSuggestions.filter(v => v.venue_name.toLowerCase().includes(editingEvent.venue_name.toLowerCase()))
    : venueSuggestions

  if (loadingEvents && isActive) return (
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
  // Single-truck console: events are already token-scoped to this truck (events/manage). No truck filter.
  const upcoming = events.filter(e => e.status !== 'cancelled' && !isPastEvent(e))
  const past = events.filter(e => isPastEvent(e) || e.status === 'cancelled')
  const unconfirmedEvents = upcoming.filter(e => e.status === 'unconfirmed')
  const scraperUnconfirmed = unconfirmedEvents.filter(e => e.source === 'scraper')
  const operatorUnconfirmed = unconfirmedEvents.filter(e => e.source !== 'scraper')
  const confirmedEvents = upcoming.filter(e => e.status === 'confirmed')
  const openEvents = upcoming.filter(e => e.status === 'open')
  const otherUpcoming = upcoming.filter(e => !['unconfirmed', 'confirmed', 'open'].includes(e.status))

  const renderScheduleReview = (onCancel: () => void) => {
    const isEv = (e: any) => !e.event_date || !e.venue_name || !e.start_time
    const needsAttention = (e: any) => !e.event_date || !e.venue_name || !e.start_time || !e.end_time

    const todayStr = new Date().toISOString().split('T')[0]
    const parseDDMMYYYY = (s: string): string => {
      if (!s) return ''
      const [d, m, y] = s.split('/')
      if (!d || !m || !y) return ''
      return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
    }
    const sortByDate = (evs: any[]) => [...evs].sort((a, b) => {
      const ia = parseDDMMYYYY(a.event_date), ib = parseDDMMYYYY(b.event_date)
      if (!ia) return 1; if (!ib) return -1
      return ia.localeCompare(ib)
    })

    const includedEvents = editedEvents.filter(ev => !isExcluded(ev.venue_name || '', exclusionTerms))
    const excludedEvents = editedEvents.filter(ev => isExcluded(ev.venue_name || '', exclusionTerms))

    const futureIncluded = includedEvents.filter(ev => {
      const iso = parseDDMMYYYY(ev._originalDate ?? ev.event_date)
      return !iso || iso >= todayStr
    })
    const historicalIncluded = includedEvents.filter(ev => {
      const iso = parseDDMMYYYY(ev._originalDate ?? ev.event_date)
      return iso && iso < todayStr
    })
    const sortedFuture = sortByDate(futureIncluded)
    const sortedHistorical = sortByDate(historicalIncluded)

    const selectedEvts = includedEvents.filter(e => e.selected)
    const incompleteSelected = selectedEvts.filter(isEv)
    const attentionSelected = selectedEvts.filter(needsAttention)
    const saveCount = selectedEvts.filter(e => !isEv(e)).length
    const canSave = incompleteSelected.length === 0 && saveCount > 0

    const updateEvent = (id: string, patch: any) => {
      setEditedEvents(prev => prev.map(e => {
        if (e.id !== id) return e
        if ('event_date' in patch) {
          const iso = parseDDMMYYYY(patch.event_date)
          const updated = { ...e, ...patch }
          if (iso && iso >= todayStr) updated.selected = true
          else if (iso && iso < todayStr) updated.selected = false
          return updated
        }
        if ('start_time' in patch) {
          const { start_time, end_time } = applyStartTimeChange(patch.start_time, e.end_time)
          return { ...e, ...patch, start_time, end_time }
        }
        return { ...e, ...patch }
      }))
    }
    const toggleSelected = (id: string) =>
      setEditedEvents(prev => prev.map(e => e.id === id ? { ...e, selected: !e.selected } : e))
    const setPendingDelete = (id: string, value: boolean) =>
      setEditedEvents(prev => prev.map(e => e.id === id ? { ...e, _pendingDelete: value } : e))
    const removeEvent = (id: string) =>
      setEditedEvents(prev => prev.filter(e => e.id !== id))
    const handleDeleteWithExclusion = async (ev: any) => {
      try {
        const res = await api('add_exclusion_term', { term: ev.venue_name })
        setExclusionList(prev => [...prev, { id: res.id ?? '', term: ev.venue_name }])
        setExclusionTerms(prev => [...prev, ev.venue_name])
        removeEvent(ev.id)
        showToast('Removed and excluded from future imports')
      } catch { removeEvent(ev.id) }
    }
    const handleDeleteOnly = (ev: any) => removeEvent(ev.id)
    const handleAddBack = async (ev: any) => {
      const match = exclusionList.find(t => t.term === ev.venue_name || isExcluded(ev.venue_name, [t.term]))
      if (match?.id) {
        try { await api('remove_exclusion_term', { id: match.id }) } catch { /* continue */ }
      }
      if (match?.term) {
        setExclusionTerms(prev => prev.filter(t => t !== match.term))
        setExclusionList(prev => prev.filter(t => t.term !== match.term))
      }
      showToast('Added back — exclusion removed')
    }
    const expandToEdit = (id: string) =>
      setExpandedEventIds(prev => { const n = new Set(prev); n.add(id); return n })

    const getFriendlyDate = (ev: any) => {
      const p = (ev.event_date || '').split('/')
      if (p.length !== 3) return ev.event_date || ''
      const d = new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]))
      const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
      const day = d.getDate()
      const nth = (day > 3 && day < 21) ? 'th' : ['th','st','nd','rd','th','th','th','th','th','th'][day % 10]
      return `${days[d.getDay()]} ${day}${nth} ${months[d.getMonth()]}`
    }
    const getDateVal = (ev: any) => {
      const p = (ev.event_date || '').split('/')
      return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : ev.event_date || ''
    }
    const getMissingLabel = (ev: any) => {
      if (!ev.event_date) return 'Add date'
      if (!ev.venue_name) return 'Add venue'
      if (!ev.start_time) return 'Add start time'
      if (!ev.end_time) return 'Add end time'
      return ''
    }

    const TrashBtn = ({ id }: { id: string }) => (
      <button type="button" onClick={() => setPendingDelete(id, true)} className="text-slate-400 hover:text-red-600" aria-label="Remove">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    )
    const Checkbox = ({ id, checked, disabled }: { id: string; checked: boolean; disabled?: boolean }) => (
      <button type="button" onClick={disabled ? undefined : () => toggleSelected(id)} className={`w-[18px] h-[18px] rounded border-2 flex-shrink-0 flex items-center justify-center ${checked ? 'bg-orange-600 border-orange-600' : 'border-slate-300 bg-white'} ${disabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`} aria-label={checked ? 'Deselect' : 'Select'}>
        {checked && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </button>
    )

    return (
      <div className="flex flex-col gap-3">
        {attentionSelected.length > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <span className="text-amber-600">⚠</span>
            <span className="text-sm text-amber-700 font-medium">
              {attentionSelected.length} event{attentionSelected.length !== 1 ? 's' : ''} need{attentionSelected.length === 1 ? 's' : ''} attention before saving
            </span>
          </div>
        )}

        {/* Mobile cards */}
        <div className="md:hidden flex flex-col gap-2">
          {(() => {
            const renderMobileCard = (ev: any, isHistorical: boolean) => {
            const canEdit = ev.selected || isHistorical
            const rowAmber = !ev.event_date || !ev.venue_name || !ev.start_time || !ev.end_time
            const stateC = expandedEventIds.has(ev.id)
            const stateB = focusedEventIds.has(ev.id) && !stateC
            const dateLabel = getFriendlyDate(ev)
            const timeLabel = ev.start_time
              ? `${formatTime(ev.start_time)}${ev.end_time ? `–${formatTime(ev.end_time)}` : ''}`
              : null
            const dateVal = getDateVal(ev)

            const fieldCls = (amber: boolean) => `bg-white border rounded-lg px-3 py-2.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-orange-400 ${amber ? 'border-amber-400 bg-amber-50' : 'border-slate-200'}`
            const endTimeOptions = ev.start_time ? SCHEDULE_TIME_OPTIONS.filter(t => t > ev.start_time) : SCHEDULE_TIME_OPTIONS
            const timePair = (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`text-xs font-medium mb-1 block ${!ev.start_time ? 'text-amber-600' : 'text-slate-500'}`}>Start time</label>
                  <select value={ev.start_time || ''} onChange={e => updateEvent(ev.id, { start_time: e.target.value })} className={fieldCls(!ev.start_time)}>
                    <option value="">— : —</option>
                    {SCHEDULE_TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className={`text-xs font-medium mb-1 block ${!ev.end_time ? 'text-amber-600' : 'text-slate-500'}`}>End time</label>
                  <select value={ev.end_time || ''} onChange={e => updateEvent(ev.id, { end_time: e.target.value })} className={fieldCls(!ev.end_time)}>
                    <option value="">— : —</option>
                    {endTimeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
            )

            return (
              <div key={ev.id}
                className={`border border-slate-200 overflow-hidden ${stateB ? 'border-l-[3px] border-l-amber-400' : ''} ${!ev.selected && !isHistorical ? 'opacity-40' : ''} ${isHistorical ? 'opacity-70' : ''}`}
                style={{ borderRadius: stateB ? '0 10px 10px 0' : '10px' }}>

                {/* Summary — always visible */}
                <div className="flex items-start gap-2 p-3">
                  <Checkbox id={ev.id} checked={ev.selected} disabled={isHistorical && !ev.selected} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold leading-snug ${!ev.start_time || !ev.event_date ? 'text-amber-600' : 'text-slate-900'}`}>
                          {ev.event_date ? dateLabel : 'No date'}{timeLabel ? ` · ${timeLabel}` : ' · time missing'}
                        </p>
                        <p className="text-sm text-slate-900 break-words">{ev.venue_name || <span className="text-amber-600">Add venue</span>}</p>
                        {(ev.town || ev.postcode) && <p className="text-xs text-slate-500">{[ev.town, ev.postcode].filter(Boolean).join(' · ')}</p>}
                      </div>
                      <div className="flex items-center flex-shrink-0 pt-0.5">
                        {/* Edit in State A and State B — not in State C */}
                        {!stateC && (
                          <>
                            <button type="button" disabled={!canEdit} onClick={() => expandToEdit(ev.id)} className={`text-xs font-medium text-slate-600 border border-slate-200 rounded px-2.5 py-1 leading-5 ${!canEdit ? 'pointer-events-none opacity-40' : 'hover:bg-slate-50'}`}>
                              Edit
                            </button>
                            <span className="mx-3 text-slate-200 select-none">|</span>
                          </>
                        )}
                        <TrashBtn id={ev.id} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* State B — only the fields that were missing on load (snapshotted flags) */}
                {stateB && canEdit && (
                  <div className="border-t border-slate-100 px-3 pb-3 pt-2 space-y-3">
                    {ev._missingDate && (
                      <div className="relative">
                        <label className={`text-xs font-medium mb-1 block ${!ev.event_date ? 'text-amber-600' : 'text-slate-500'}`}>Date</label>
                        <div onClick={() => { const el = document.getElementById(`m-date-${ev.id}`) as HTMLInputElement | null; el?.showPicker?.() || el?.click() }} className={`w-full border rounded-lg px-3 py-2.5 text-sm cursor-pointer flex items-center justify-between ${!ev.event_date ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white'}`}>
                          <span className={ev.event_date ? 'text-slate-800 font-medium' : 'text-amber-600'}>{dateLabel || 'Select date'}</span>
                          <span className="text-slate-400 text-xs">📅</span>
                        </div>
                        <input id={`m-date-${ev.id}`} type="date" value={dateVal} onChange={e => { const d = e.target.value.split('-'); updateEvent(ev.id, { event_date: d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : e.target.value }) }} className="absolute opacity-0 top-0 left-0 w-full h-full cursor-pointer" />
                      </div>
                    )}
                    {ev._missingVenue && (
                      <div>
                        <label className={`text-xs font-medium mb-1 block ${!ev.venue_name ? 'text-amber-600' : 'text-slate-500'}`}>Venue</label>
                        <input type="text" value={ev.venue_name || ''} onChange={e => updateEvent(ev.id, { venue_name: e.target.value })} placeholder="Venue name" className={fieldCls(!ev.venue_name)} />
                      </div>
                    )}
                    {ev._missingTime && timePair}
                    {vans.length > 1 && !ev.van_id && (
                      <div>
                        <label className={`text-xs font-medium mb-1 block ${!ev.van_id ? 'text-amber-600' : 'text-slate-500'}`}>Van</label>
                        <select value={ev.van_id || ''} onChange={e => updateEvent(ev.id, { van_id: e.target.value || undefined })} className={fieldCls(!ev.van_id)}>
                          <option value="">Select a van</option>
                          {vans.map(van => <option key={van.id} value={van.id}>{van.name}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {/* State C — all fields, no Done button */}
                {stateC && canEdit && (
                  <div className="border-t border-slate-100 px-3 pb-3 pt-2 space-y-3">
                    <div className="relative">
                      <label className="text-xs font-medium text-slate-500 mb-1 block">Date</label>
                      <div onClick={() => { const el = document.getElementById(`m-date-${ev.id}`) as HTMLInputElement | null; el?.showPicker?.() || el?.click() }} className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2.5 text-sm cursor-pointer flex items-center justify-between">
                        <span className={ev.event_date ? 'text-slate-800 font-medium' : 'text-slate-400'}>{dateLabel || 'Select date'}</span>
                        <span className="text-slate-400 text-xs">📅</span>
                      </div>
                      <input id={`m-date-${ev.id}`} type="date" value={dateVal} onChange={e => { const d = e.target.value.split('-'); updateEvent(ev.id, { event_date: d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : e.target.value }) }} className="absolute opacity-0 top-0 left-0 w-full h-full cursor-pointer" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 mb-1 block">Venue</label>
                      <input type="text" value={ev.venue_name || ''} onChange={e => updateEvent(ev.id, { venue_name: e.target.value })} placeholder="Venue name" className={fieldCls(!ev.venue_name)} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 mb-1 block">Area</label>
                      <input type="text" value={ev.town || ''} onChange={e => updateEvent(ev.id, { town: e.target.value })} placeholder="Area" className={fieldCls(false)} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 mb-1 block">Postcode</label>
                      <input type="text" value={ev.postcode || ''} onChange={e => updateEvent(ev.id, { postcode: e.target.value.toUpperCase() })} placeholder="Postcode" className={`${fieldCls(false)} uppercase`} />
                    </div>
                    {timePair}
                    {vans.length > 1 && (
                      <div>
                        <label className="text-xs font-medium text-slate-500 mb-1 block">Van</label>
                        <select value={ev.van_id || ''} onChange={e => updateEvent(ev.id, { van_id: e.target.value || undefined })} className={fieldCls(false)}>
                          <option value="">Select a van</option>
                          {vans.map(van => <option key={van.id} value={van.id}>{van.name}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              {/* Pending-delete confirmation */}
              {ev._pendingDelete && (
                <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 text-sm text-slate-600">
                  <p className="font-medium mb-2">Exclude &ldquo;{ev.venue_name}&rdquo; from future imports?</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => handleDeleteWithExclusion(ev)} className="text-xs font-medium px-3 py-1.5 bg-slate-800 text-white rounded-lg hover:bg-slate-900">
                      Yes, exclude
                    </button>
                    <button type="button" onClick={() => handleDeleteOnly(ev)} className="text-xs font-medium px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50">
                      Just remove this one
                    </button>
                    <button type="button" onClick={() => setPendingDelete(ev.id, false)} className="text-xs text-slate-400 px-2 py-1.5 hover:text-slate-600 ml-auto">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              </div>
            )
            } // end renderMobileCard

            return (
              <>
                {sortedFuture.map(ev => renderMobileCard(ev, false))}
                {sortedHistorical.length > 0 && (
                  <div className="mt-2">
                    <div className="px-1 mb-1.5">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Past dates — update to save</p>
                      <p className="text-xs text-slate-400 mt-0.5">These events have already passed. Update the date to a future date to include them.</p>
                    </div>
                    {sortedHistorical.map(ev => renderMobileCard(ev, true))}
                  </div>
                )}
              </>
            )
          })()}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '32px' }} />
              <col style={{ width: '130px' }} />
              <col style={{ width: '220px' }} />
              <col style={{ width: '150px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '100px' }} />
              {vans.length > 1 && <col style={{ width: '120px' }} />}
              <col style={{ width: '36px' }} />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200">
                <th className="pb-2" />
                <th className="text-xs font-medium text-slate-500 text-left px-1.5 pb-2">Date</th>
                <th className="text-xs font-medium text-slate-500 text-left px-1.5 pb-2">Venue</th>
                <th className="text-xs font-medium text-slate-500 text-left px-1.5 pb-2">Area</th>
                <th className="text-xs font-medium text-slate-500 text-left px-1.5 pb-2">Postcode</th>
                <th className="text-xs font-medium text-slate-500 text-left px-1.5 pb-2">Start</th>
                <th className="text-xs font-medium text-slate-500 text-left px-1.5 pb-2">End</th>
                {vans.length > 1 && <th className="text-xs font-medium text-slate-500 text-left px-1.5 pb-2">Van</th>}
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {(() => {
                const renderDesktopRow = (ev: any, isHistorical: boolean) => {
                const incomplete = isEv(ev)
                const rowAmber = !ev.event_date || !ev.venue_name || !ev.start_time || !ev.end_time
                const missingDate = !ev.event_date
                const missingVenue = !ev.venue_name
                const missingStart = !ev.start_time
                const missingEnd = !ev.end_time
                const dateVal = getDateVal(ev)
                const dateLabel = getFriendlyDate(ev)
                const ci = (missing: boolean) => `bg-transparent border-b text-sm text-slate-900 px-1.5 py-2 w-full rounded-none focus:outline-none ${missing ? 'border-b-amber-400 bg-amber-50' : 'border-b-slate-200 hover:border-b-slate-400 hover:bg-slate-50 focus:border-b-orange-500 focus:bg-slate-50 focus:rounded'}`
                const endTimeOptions = ev.start_time ? SCHEDULE_TIME_OPTIONS.filter(t => t > ev.start_time) : SCHEDULE_TIME_OPTIONS
                return (
                  <Fragment key={ev.id}>
                  <tr className={`${rowAmber ? 'bg-amber-50' : isHistorical ? 'bg-slate-50' : 'bg-white'} ${!ev.selected && !isHistorical ? 'opacity-35' : ''} ${isHistorical ? 'opacity-70' : ''}`}>
                    <td className="px-2 py-1 align-middle">
                      <Checkbox id={ev.id} checked={ev.selected} disabled={isHistorical && !ev.selected} />
                    </td>
                    <td className="px-0 py-0 align-middle" style={{ pointerEvents: isHistorical || ev.selected ? 'auto' : 'none' }}>
                      <div className="relative">
                        <div onClick={() => { const el = document.getElementById(`d-date-${ev.id}`) as HTMLInputElement | null; el?.showPicker?.() || el?.click() }} className={`text-sm px-1.5 cursor-pointer flex items-center ${missingDate ? 'text-amber-600 bg-amber-50 border-b border-amber-400' : 'text-slate-900 hover:bg-slate-50 border-b border-b-slate-200 hover:border-b-slate-400'}`} style={{ minHeight: '48px' }}>
                          {dateLabel || <span className="italic text-xs text-amber-400">Add date</span>}
                        </div>
                        <input id={`d-date-${ev.id}`} type="date" value={dateVal} onChange={e => { const d = e.target.value.split('-'); updateEvent(ev.id, { event_date: d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : e.target.value }) }} className="absolute opacity-0 top-0 left-0 w-full h-full cursor-pointer" />
                      </div>
                    </td>
                    <td className="px-0 py-0 align-middle" style={{ pointerEvents: isHistorical || ev.selected ? 'auto' : 'none' }}>
                      <input type="text" value={ev.venue_name || ''} onChange={e => updateEvent(ev.id, { venue_name: e.target.value })} placeholder="Venue name" className={ci(missingVenue)} style={{ minHeight: '48px' }} />
                    </td>
                    <td className="px-0 py-0 align-middle" style={{ pointerEvents: isHistorical || ev.selected ? 'auto' : 'none' }}>
                      <input type="text" value={ev.town || ''} onChange={e => updateEvent(ev.id, { town: e.target.value })} placeholder="Area" className={ci(false)} style={{ minHeight: '48px' }} />
                    </td>
                    <td className="px-0 py-0 align-middle" style={{ pointerEvents: isHistorical || ev.selected ? 'auto' : 'none' }}>
                      <input type="text" value={ev.postcode || ''} onChange={e => updateEvent(ev.id, { postcode: e.target.value.toUpperCase() })} placeholder="CB22 5EJ" className={`${ci(false)} uppercase`} style={{ minHeight: '48px' }} />
                    </td>
                    <td className="px-0 py-0 align-middle" style={{ pointerEvents: isHistorical || ev.selected ? 'auto' : 'none' }}>
                      <select value={ev.start_time || ''} onChange={e => updateEvent(ev.id, { start_time: e.target.value })} className={ci(missingStart)} style={{ minHeight: '48px' }}>
                        <option value="">—:—</option>
                        {SCHEDULE_TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td className="px-0 py-0 align-middle" style={{ pointerEvents: isHistorical || ev.selected ? 'auto' : 'none' }}>
                      <select value={ev.end_time || ''} onChange={e => updateEvent(ev.id, { end_time: e.target.value })} className={ci(missingEnd)} style={{ minHeight: '48px' }}>
                        <option value="">—:—</option>
                        {endTimeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    {vans.length > 1 && (
                      <td className="px-0 py-0 align-middle" style={{ pointerEvents: isHistorical || ev.selected ? 'auto' : 'none' }}>
                        <select value={ev.van_id || ''} onChange={e => updateEvent(ev.id, { van_id: e.target.value || undefined })} className={`${ci(false)} bg-transparent`} style={{ minHeight: '48px' }}>
                          <option value="">Select</option>
                          {vans.map(van => <option key={van.id} value={van.id}>{van.name}</option>)}
                        </select>
                      </td>
                    )}
                    <td className="px-2 py-1 align-middle text-center">
                      <TrashBtn id={ev.id} />
                    </td>
                  </tr>
                  {ev._pendingDelete ? (
                    <tr>
                      <td colSpan={vans.length > 1 ? 9 : 8} className="px-3 py-2 bg-slate-50 border-t border-slate-100 text-sm text-slate-600">
                        <span className="font-medium mr-3">Exclude &ldquo;{ev.venue_name}&rdquo; from future imports?</span>
                        <button type="button" onClick={() => handleDeleteWithExclusion(ev)} className="text-xs font-medium px-2.5 py-1 bg-slate-800 text-white rounded-lg hover:bg-slate-900 mr-2">Yes, exclude</button>
                        <button type="button" onClick={() => handleDeleteOnly(ev)} className="text-xs font-medium px-2.5 py-1 border border-slate-200 rounded-lg hover:bg-white mr-2">Just remove</button>
                        <button type="button" onClick={() => setPendingDelete(ev.id, false)} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                      </td>
                    </tr>
                  ) : null}
                  </Fragment>
                )
                } // end renderDesktopRow
                return sortedFuture.map(ev => renderDesktopRow(ev, false))
              })()}
            </tbody>
            {sortedHistorical.length > 0 && (
              <>
                <tbody>
                  <tr>
                    <td colSpan={vans.length > 1 ? 9 : 8} className="pt-4 pb-1 px-1.5">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Past dates — update to save</p>
                    </td>
                  </tr>
                </tbody>
                <tbody>
                  {sortedHistorical.map(ev => (() => {
                    const incomplete = isEv(ev)
                    const rowAmber = !ev.event_date || !ev.venue_name || !ev.start_time || !ev.end_time
                    const missingDate = !ev.event_date
                    const missingVenue = !ev.venue_name
                    const missingStart = !ev.start_time
                    const missingEnd = !ev.end_time
                    const dateVal = getDateVal(ev)
                    const dateLabel = getFriendlyDate(ev)
                    const ci = (missing: boolean) => `bg-transparent border-b text-sm text-slate-900 px-1.5 py-2 w-full rounded-none focus:outline-none ${missing ? 'border-b-amber-400 bg-amber-50' : 'border-b-slate-200 hover:border-b-slate-400 hover:bg-slate-50 focus:border-b-orange-500 focus:bg-slate-50 focus:rounded'}`
                    const endTimeOptions = ev.start_time ? SCHEDULE_TIME_OPTIONS.filter(t => t > ev.start_time) : SCHEDULE_TIME_OPTIONS
                    return (
                      <Fragment key={ev.id}>
                      <tr className={`bg-slate-50 opacity-70`}>
                        <td className="px-2 py-1 align-middle">
                          <Checkbox id={ev.id} checked={ev.selected} disabled={!ev.selected} />
                        </td>
                        <td className="px-0 py-0 align-middle">
                          <div className="relative">
                            <div onClick={() => { const el = document.getElementById(`d-date-${ev.id}`) as HTMLInputElement | null; el?.showPicker?.() || el?.click() }} className={`text-sm px-1.5 cursor-pointer flex items-center ${missingDate ? 'text-amber-600 bg-amber-50 border-b border-amber-400' : 'text-slate-900 hover:bg-slate-50 border-b border-b-slate-200 hover:border-b-slate-400'}`} style={{ minHeight: '48px' }}>
                              {dateLabel || <span className="italic text-xs text-amber-400">Add date</span>}
                            </div>
                            <input id={`d-date-${ev.id}`} type="date" value={dateVal} onChange={e => { const d = e.target.value.split('-'); updateEvent(ev.id, { event_date: d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : e.target.value }) }} className="absolute opacity-0 top-0 left-0 w-full h-full cursor-pointer" />
                          </div>
                        </td>
                        <td className="px-0 py-0 align-middle"><input type="text" value={ev.venue_name || ''} onChange={e => updateEvent(ev.id, { venue_name: e.target.value })} placeholder="Venue name" className={ci(missingVenue)} style={{ minHeight: '48px' }} /></td>
                        <td className="px-0 py-0 align-middle"><input type="text" value={ev.town || ''} onChange={e => updateEvent(ev.id, { town: e.target.value })} placeholder="Area" className={ci(false)} style={{ minHeight: '48px' }} /></td>
                        <td className="px-0 py-0 align-middle"><input type="text" value={ev.postcode || ''} onChange={e => updateEvent(ev.id, { postcode: e.target.value.toUpperCase() })} placeholder="CB22 5EJ" className={`${ci(false)} uppercase`} style={{ minHeight: '48px' }} /></td>
                        <td className="px-0 py-0 align-middle">
                          <select value={ev.start_time || ''} onChange={e => updateEvent(ev.id, { start_time: e.target.value })} className={ci(missingStart)} style={{ minHeight: '48px' }}>
                            <option value="">—:—</option>
                            {SCHEDULE_TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </td>
                        <td className="px-0 py-0 align-middle">
                          <select value={ev.end_time || ''} onChange={e => updateEvent(ev.id, { end_time: e.target.value })} className={ci(missingEnd)} style={{ minHeight: '48px' }}>
                            <option value="">—:—</option>
                            {endTimeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </td>
                        {vans.length > 1 && (
                          <td className="px-0 py-0 align-middle">
                            <select value={ev.van_id || ''} onChange={e => updateEvent(ev.id, { van_id: e.target.value || undefined })} className={`${ci(false)} bg-transparent`} style={{ minHeight: '48px' }}>
                              <option value="">Select</option>
                              {vans.map(van => <option key={van.id} value={van.id}>{van.name}</option>)}
                            </select>
                          </td>
                        )}
                        <td className="px-2 py-1 align-middle text-center">
                          <TrashBtn id={ev.id} />
                        </td>
                      </tr>
                      </Fragment>
                    )
                  })())}
                </tbody>
              </>
            )}
          </table>
        </div>

        {/* Footer */}
        {/* Excluded events — collapsed by default */}
        {excludedEvents.length > 0 && (
          <details className="border border-slate-200 rounded-xl overflow-hidden">
            <summary className="px-4 py-3 text-sm font-medium text-slate-500 cursor-pointer select-none list-none flex items-center justify-between hover:bg-slate-50">
              <span>{excludedEvents.length} excluded — previously flagged as not an event</span>
              <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </summary>
            <div className="divide-y divide-slate-100">
              {excludedEvents.map(ev => (
                <div key={ev.id} className="flex items-center gap-3 px-4 py-3 bg-slate-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-500 line-through">{ev.venue_name}</p>
                    <p className="text-xs text-slate-400">{ev.event_date}{ev.town ? ` · ${ev.town}` : ''}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddBack(ev)}
                    className="shrink-0 text-xs font-medium text-orange-600 hover:text-orange-700 px-3 py-1.5 border border-orange-200 rounded-lg hover:bg-orange-50 whitespace-nowrap"
                  >
                    Add back
                  </button>
                </div>
              ))}
            </div>
          </details>
        )}

        <div className="flex flex-col-reverse gap-2 pt-1 md:flex-row md:justify-end">
          <button type="button" onClick={onCancel} className="w-full md:w-auto border border-slate-200 text-slate-600 py-2.5 px-4 rounded-xl text-sm">Cancel</button>
          {canSave ? (
            <button type="button" onClick={() => saveExtractedEvents(selectedEvts.filter(e => !isEv(e)))} disabled={savingExtracted} className="w-full md:w-auto bg-orange-600 text-white font-medium py-2.5 px-4 rounded-xl text-sm disabled:opacity-40">
              {savingExtracted ? 'Saving...' : `Save ${saveCount} event${saveCount !== 1 ? 's' : ''}`}
            </button>
          ) : (
            <button type="button" disabled className="w-full md:w-auto bg-slate-100 text-slate-400 font-medium py-2.5 px-4 rounded-xl text-sm cursor-not-allowed">
              Fix {incompleteSelected.length} event{incompleteSelected.length !== 1 ? 's' : ''} first
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
    {isActive && (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-slate-900 text-lg">Schedule</h2>
          <p className="text-slate-400 text-sm">{upcoming.length} upcoming</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-end gap-0.5">
            <button onClick={() => setShowImportModal(true)}
              className="flex items-center gap-2 px-4 py-2 border border-orange-200 text-orange-600 text-sm font-medium rounded-xl hover:bg-orange-50 transition-colors">
              ✨ Import schedule
            </button>
            <p className="text-xs text-slate-400">photo, PDF or text</p>
          </div>
          <div className="self-start">
            <Btn label="+ Add event" onClick={() => {
              const lastEv = [...events].filter(e => e.start_time && e.end_time).sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime())[0]
              setFormErrors({})
              setEditingEvent({ venue_name: '', town: '', postcode: '', address: '', event_date: '', start_time: lastEv?.start_time?.substring(0, 5) || '', end_time: lastEv?.end_time?.substring(0, 5) || '', notes: '', truck_id: truck.id })
              setAddMode('manual'); setExtractedEvents([])
            }} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {truck.scraper_preference === 'auto' || truck.scraper_preference === 'both'
            ? 'Finding events automatically from your website'
            : "You're managing your schedule manually"}
          {' · '}
          <button onClick={() => onSwitchTab('settings')} className="text-orange-600 hover:underline font-medium">
            Change in Settings
          </button>
        </p>
      </div>

      {upcoming.length === 0 && (
        <EmptyState icon="🗓️" title="No upcoming events" body="Events scraped from your social media and booking calendar will appear here for you to confirm" />
      )}

      {openEvents.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Open now</p>
          {openEvents.map(e => renderEvent(e))}
        </div>
      )}

      {scraperUnconfirmed.length > 0 && (
        <div className="space-y-2">
          <div className="mb-1">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Needs your approval</p>
            <p className="text-sm text-slate-600 mt-0.5">
              We found {scraperUnconfirmed.length} event{scraperUnconfirmed.length !== 1 ? 's' : ''} for you — review and approve before they go live.
            </p>
          </div>
          {scraperUnconfirmed.map(event => (
            <div key={event.id} className="border-l-4 border-l-amber-400 bg-white border border-slate-200 rounded-2xl overflow-hidden">
              {renderEvent(event, true)}
            </div>
          ))}
        </div>
      )}

      {operatorUnconfirmed.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Needs confirmation</p>
          {operatorUnconfirmed.map(e => renderEvent(e))}
        </div>
      )}

      {confirmedEvents.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Confirmed</p>
          {confirmedEvents.map(e => renderEvent(e))}
        </div>
      )}

      {otherUpcoming.length > 0 && (
        <div className="space-y-2">{otherUpcoming.map(e => renderEvent(e))}</div>
      )}

      {past.length > 0 && (
        <div className="pt-2">
          <button
            onClick={() => setShowPast(p => !p)}
            className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors"
          >
            <span className={`transition-transform inline-block ${showPast ? 'rotate-90' : ''}`}>▶</span>
            <span>Past events ({past.length})</span>
          </button>
          {showPast && (
            <div className="mt-3 space-y-2">{past.map(e => renderEvent(e))}</div>
          )}
        </div>
      )}

      {editingEvent && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center lg:items-start lg:pt-8 justify-center p-4">
          <div className={`bg-white rounded-2xl p-5 sm:p-6 pb-8 sm:pb-8 w-full shadow-2xl max-h-[90vh] overflow-y-auto overscroll-contain touch-pan-y ${extractedEvents.length > 0 ? 'md:max-w-[980px]' : 'max-w-sm sm:max-w-lg lg:max-w-2xl overflow-x-hidden'}`}>
            <h3 className="font-black text-slate-900 mb-4">
              {editingEvent.id ? 'Edit event' : addMode === 'upload' ? 'Import schedule' : 'Add event'}
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
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-600 mb-1">Date<span className="text-red-400 ml-0.5">*</span></label>
                  <div className="relative">
                    <div onClick={() => { const el = document.getElementById('date-input-event') as HTMLInputElement | null; el?.showPicker?.() || el?.click() }} className={`w-full border rounded-xl px-3 py-2 text-sm cursor-pointer flex items-center justify-between bg-white ${formErrors.event_date ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}>
                      <span className={editingEvent.event_date ? 'text-slate-900 font-medium' : 'text-slate-400'}>
                        {editingEvent.event_date ? (() => { const p = editingEvent.event_date.split('-'); if (p.length !== 3) return editingEvent.event_date; const d = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2])); const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']; const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; const day = d.getDate(); const nth = (day > 3 && day < 21) ? 'th' : ['th','st','nd','rd','th','th','th','th','th','th'][day % 10]; return `${days[d.getDay()]} ${day}${nth} ${months[d.getMonth()]}` })() : 'Select date'}
                      </span>
                      <span className="text-slate-400 text-xs">📅</span>
                    </div>
                    <input id="date-input-event" type="date" value={editingEvent.event_date} onChange={e => { setEditingEvent(p => ({...p!, event_date: e.target.value})); if (formErrors.event_date) setFormErrors(p => ({...p, event_date: ''})) }} className="absolute opacity-0 top-0 left-0 w-full h-full cursor-pointer" />
                  </div>
                  {formErrors.event_date && <p className="text-xs text-red-500 mt-1">{formErrors.event_date}</p>}
                </div>
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
                {/* ADDRESS FIELDS — order and labels are locale-specific.
                    UK format: street address → village/town + postcode
                    Future: extract to addressFieldConfig(locale) to support US/EU formats */}
                <div className="sm:col-span-2">
                  <Input label="Full address (optional)" value={editingEvent.address} onChange={v => setEditingEvent(p => ({...p!, address: v}))} placeholder="e.g. 123 High St, Wickhambrook" />
                </div>
                <div>
                  <Input label="Area (village, town or city)" value={editingEvent.town} onChange={v => setEditingEvent(p => ({...p!, town: v}))} placeholder="e.g. Wickhambrook" />
                </div>
                <Input label="Postcode" value={editingEvent.postcode} onChange={v => setEditingEvent(p => ({...p!, postcode: v}))} placeholder="e.g. CB8 8PD" />
                <div className="sm:col-span-2 grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Start time<span className="text-red-400 ml-0.5">*</span></label>
                    <select value={editingEvent.start_time}
                      onChange={e => {
                        const { start_time, end_time } = applyStartTimeChange(e.target.value, editingEvent.end_time)
                        setEditingEvent(p => ({ ...p!, start_time, end_time }))
                        if (formErrors.start_time) setFormErrors(p => ({ ...p, start_time: '' }))
                      }}
                      className={`w-full border rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white ${formErrors.start_time ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}>
                      <option value="">Select</option>
                      {SCHEDULE_TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    {formErrors.start_time && <p className="text-xs text-red-500 mt-1">{formErrors.start_time}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">End time<span className="text-red-400 ml-0.5">*</span></label>
                    <select value={editingEvent.end_time}
                      onChange={e => { setEditingEvent(p => ({ ...p!, end_time: e.target.value })); if (formErrors.end_time) setFormErrors(p => ({ ...p, end_time: '' })) }}
                      className={`w-full border rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white ${formErrors.end_time ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}>
                      <option value="">Select</option>
                      {(editingEvent.start_time ? SCHEDULE_TIME_OPTIONS.filter(t => t > editingEvent.start_time) : SCHEDULE_TIME_OPTIONS).map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    {formErrors.end_time && <p className="text-xs text-red-500 mt-1">{formErrors.end_time}</p>}
                  </div>
                </div>
                {vans.length > 1 && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-600 mb-1">Truck <span className="text-red-500">*</span></label>
                    <select
                      value={editingEvent.van_id || ''}
                      onChange={e => { setEditingEvent(p => ({ ...p!, van_id: e.target.value || null })); if (formErrors.van_id) setFormErrors(p => ({ ...p, van_id: '' })) }}
                      className={`w-full border rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white ${formErrors.van_id ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                    >
                      <option value="">Select a truck</option>
                      {vans.map(van => (
                        <option key={van.id} value={van.id}>{van.name}</option>
                      ))}
                    </select>
                    {formErrors.van_id && <p className="text-xs text-red-500 mt-1">{formErrors.van_id}</p>}
                  </div>
                )}
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
                {extractedEvents.length === 0 && (
                  <>
                    <p className="text-sm text-slate-500">
                      Upload a screenshot, photo, or PDF of your schedule — or paste the text below.
                      Our AI will extract your events for you to review.
                    </p>

                    <label
                      {...scheduleDragProps}
                      className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-8 cursor-pointer transition-colors ${isScheduleDragging ? 'border-orange-400 bg-orange-50' : 'border-slate-200 hover:border-orange-300 hover:bg-orange-50/30'}`}
                    >
                      <span className="text-3xl">{isScheduleDragging ? '📂' : uploadFile ? '✅' : '📷'}</span>
                      <span className="text-sm text-slate-500 text-center">
                        {isScheduleDragging ? 'Drop your schedule here' : uploadFile ? uploadFile.name : 'Drag and drop or tap to choose'}
                      </span>
                      {!isScheduleDragging && !uploadFile && (
                        <span className="text-xs text-slate-400">Image or PDF</span>
                      )}
                      <input type="file" accept="image/*,.pdf" className="sr-only" onChange={e => setUploadFile(e.target.files?.[0] || null)} />
                    </label>

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
                      {uploadProcessing ? 'Analysing...' : 'Process schedule'}
                    </button>
                  </>
                )}

                {extractedEvents.length > 0 && renderScheduleReview(closeAddModal)}

                {extractedEvents.length === 0 && (
                  <button onClick={closeAddModal} className="text-sm text-slate-400 hover:text-slate-600 text-center">
                    Cancel
                  </button>
                )}
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
    )}
    {/* Import modal — rendered outside the isActive gate so it can open from any tab */}
    {showImportModal && (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
        <div className={`bg-white rounded-2xl p-5 sm:p-6 w-full shadow-2xl max-h-[90vh] overflow-y-auto overscroll-contain touch-pan-y ${extractedEvents.length > 0 ? 'md:max-w-[980px]' : 'max-w-sm sm:max-w-lg'}`}>
          <h3 className="font-black text-slate-900 mb-4">{importModalTitle}</h3>
          <div className="flex flex-col gap-4">
            {extractedEvents.length === 0 && (
              <>
                <p className="text-sm text-slate-500">
                  Upload a screenshot, photo, or PDF of your schedule — or paste the text below.
                  Our AI will extract your events for you to review.
                </p>

                <label
                  {...scheduleDragProps}
                  className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-8 cursor-pointer transition-colors ${isScheduleDragging ? 'border-orange-400 bg-orange-50' : 'border-slate-200 hover:border-orange-300 hover:bg-orange-50/30'}`}
                >
                  <span className="text-3xl">{isScheduleDragging ? '📂' : uploadFile ? '✅' : '📷'}</span>
                  <span className="text-sm text-slate-500 text-center">
                    {isScheduleDragging ? 'Drop your schedule here' : uploadFile ? uploadFile.name : 'Drag and drop or tap to choose'}
                  </span>
                  {!isScheduleDragging && !uploadFile && (
                    <span className="text-xs text-slate-400">Image or PDF</span>
                  )}
                  <input type="file" accept="image/*,.pdf" className="sr-only" onChange={e => setUploadFile(e.target.files?.[0] || null)} />
                </label>

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
                  {uploadProcessing ? 'Analysing...' : 'Process schedule'}
                </button>
              </>
            )}

            {extractedEvents.length > 0 && renderScheduleReview(closeImportModal)}

            {extractedEvents.length === 0 && (
              <button onClick={closeImportModal} className="text-sm text-slate-400 hover:text-slate-600 text-center">
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    )}
  </>
  )
}

// ══════════════════════════════════════════════════════════════
// SETTINGS TAB
// ══════════════════════════════════════════════════════════════
function SettingsTab({ truck, token, api, reload, showToast, onVerifySuccess, onSwitchTab, categories }: {
  truck: Truck; token: string
  api: (a: string, e?: any) => Promise<any>; reload: () => void; showToast: (m: string, t?: any) => void
  onVerifySuccess: (events: any[]) => void
  onSwitchTab: (tab: Tab) => void
  categories: Category[]
}) {
  const [form, setForm] = useState({ ...truck })
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
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
  const [settingsExclusionList, setSettingsExclusionList] = useState<{ id: string; term: string }[]>([])
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)

  useEffect(() => {
    api('get_vans').then(r => setVans(r.vans || [])).catch(() => {})
    api('get_exclusion_terms').then(r => setSettingsExclusionList(r.terms || [])).catch(() => {})
  }, [])

  const BLOCKED_DOMAINS = ['facebook.com', 'fb.com', 'fb.me', 'instagram.com', 'instagr.am']
  const isBlockedDomain = (url: string): boolean => {
    try {
      const hostname = new URL(url).hostname.toLowerCase()
      return BLOCKED_DOMAINS.some(d => hostname === d || hostname.endsWith(`.${d}`))
    } catch { return false }
  }
  const BLOCKED_DOMAIN_MSG = "Please use your website URL — Facebook and Instagram pages can't be scraped automatically."

  const handleVerifyUrl = async () => {
    const url = (form.schedule_url ?? '').trim()
    if (!url) return
    if (isBlockedDomain(url)) {
      setVerifyError(BLOCKED_DOMAIN_MSG)
      return
    }
    setVerifying(true)
    setVerifyError(null)
    try {
      const res = await fetch('/api/manage/verify-schedule-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, url }),
      })
      const data = await res.json().catch(() => ({} as any))
      console.log('[verify]', { status: res.status, found: data.found, eventCount: data.events?.length, reason: data.reason, navStatus: data.status, error: data.error })
      if (data.found) {
        onVerifySuccess(data.events)
        return
      }
      // Accurate, distinct messaging per outcome (was: blocks + launch-fail + unreachable all said
      // "couldn't reach", wrongly blaming a valid URL). Unknown / unexpected server error (>=500)
      // → treat as OUR problem, not the URL.
      const reason: string = data.reason || (res.status >= 500 ? 'launch_failed' : 'unreachable')
      const VERIFY_MESSAGES: Record<string, string> = {
        launch_failed: "Verification is temporarily unavailable. Please try again in a moment.",
        blocked: "We couldn't access this site — it may be blocking automated checks. Try the page that lists your schedule, or add events manually.",
        unreachable: "Couldn't reach this website. Check the URL and try again.",
        no_content: "We couldn't load this page. Check the URL is correct and publicly accessible.",
        no_events: "We couldn't find any upcoming events on this page. Make sure the URL points directly to where your schedule is listed.",
      }
      setVerifyError(VERIFY_MESSAGES[reason] || VERIFY_MESSAGES.unreachable)
    } catch {
      // The verify request itself failed (network/our API) — genuinely couldn't complete the check.
      setVerifyError("Couldn't reach this website. Check the URL and try again.")
    } finally {
      setVerifying(false)
    }
  }

  const orderUrl = truck.slug
    ? `${process.env.NEXT_PUBLIC_HATCHGRAB_URL}/trucks/${truck.slug}/order`
    : null

  const handleCopyOrderLink = async () => {
    if (!orderUrl) return
    try {
      await navigator.clipboard.writeText(orderUrl)
      setCopiedOrderLink(true)
      setTimeout(() => setCopiedOrderLink(false), 2000)
    } catch { /* clipboard permission denied — fail silently */ }
  }

  const handleGenerateQR = async () => {
    if (!orderUrl) return
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
    const confirmed = window.confirm(
      "Adding an additional truck will be charged as an add-on to your subscription.\n\nThis will be reflected in your next billing cycle.\n\nDo you want to continue?"
    )
    if (!confirmed) return
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

  // Auto-replies WhatsApp sender — saves on blur (like the rest of Settings) AND on the button.
  // The ref guards the blur→click double-fire (clicking the button blurs the input first) and skips
  // pointless writes when nothing changed, so the operator gets exactly one success toast.
  const lastSavedSender = useRef(truck.whatsapp_sender ?? '')
  const saveWhatsappSender = async () => {
    if (whatsappSender === lastSavedSender.current) return
    try {
      await api('update_truck', { data: { whatsapp_sender: whatsappSender } })
      lastSavedSender.current = whatsappSender
      showToast('WhatsApp number saved')
    } catch (e: any) {
      showToast(e.message, 'error')
    }
  }

  const saveFormField = async (overrides?: Record<string, unknown>) => {
    try {
      await api('update_settings', { ...form, ...overrides })
    } catch (e: any) {
      showToast(e.message, 'error')
    }
  }

  // ── Contact Details: validation (shared with the customer order screen) + the WhatsApp tick ──
  const contactEmailErr = (form.contact_email || '').trim() !== '' && !isValidEmail(form.contact_email || '')
  const contactPhoneErr = (form.contact_phone || '').trim() !== '' && !isValidUKPhone(form.contact_phone || '')
  // Customer-facing `whatsapp` = the phone number WHEN "this number is on WhatsApp" is ticked; else ''.
  // Cleared value is '' (NOT null) because trucks.whatsapp is NOT NULL with a '' default — writing null
  // 400s the settings save on untick. '' and null read identically (nothing reads this column for
  // null-vs-empty; the WhatsApp gate uses phone_is_whatsapp && contact_phone). Distinct from
  // whatsapp_sender (Auto-replies/Connect) — never touched here.
  const waFromPhone = (phone: string | null, isWa: boolean) => (isWa && (phone || '').trim() ? phone : '')

  // Phone onBlur: persist phone AND keep `whatsapp` synced to it while the tick is on (no drift).
  const saveContactPhone = () =>
    saveFormField({ whatsapp: waFromPhone(form.contact_phone, !!form.phone_is_whatsapp) })

  // Tick toggle: set the flag + sync/clear `whatsapp`. On UNTICK, if WhatsApp was the preferred method
  // it falls back to a valid one (can't keep preferred=whatsapp with no WhatsApp number).
  const togglePhoneIsWhatsapp = (checked: boolean) => {
    const wa = waFromPhone(form.contact_phone, checked)
    setForm(p => ({ ...p, phone_is_whatsapp: checked, whatsapp: wa }))
    saveFormField({ phone_is_whatsapp: checked, whatsapp: wa })
    if (!checked && preferredContact === 'whatsapp') {
      const fallback = (form.contact_email || '').trim() ? 'email' : ((form.contact_phone || '').trim() ? 'phone' : '')
      setPreferredContact(fallback)
      saveSetting('preferred_contact_method', fallback || null)
    }
  }
  // True when WhatsApp is a usable customer contact method (ticked + a phone present).
  const whatsappUsable = !!form.phone_is_whatsapp && !!(form.contact_phone || '').trim()

  const handleDisplayModeChange = async (value: 'list' | 'grid') => {
    setDisplayMode(value)
    try { await api('update_truck', { data: { display_mode: value } }) }
    catch (err: any) { showToast(err.message, 'error') }
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
    field: 'show_cooking_step' | 'auto_pause_on_offline' | 'kitchen_capacity' | 'capacity_window_mins',
    value: boolean | number | null
  ) => {
    setVans(prev => prev.map(v => v.id === vanId ? { ...v, [field]: value } : v))
    await api('update_van_settings', { vanId, [field]: value })
  }

  // Toggle a NO-PREP category's "counts toward kitchen capacity" flag from the capacity
  // tickbox list. Sends the full row + the new flag (upsert_category field update), then reload.
  const toggleCatCapacity = async (cat: Category, newVal: boolean) => {
    try {
      await api('upsert_category', {
        id: cat.id, name: cat.name, prep_secs: cat.prep_secs, batch_size: cat.batch_size,
        allow_notes: cat.allow_notes, default_stock: cat.default_stock, sort_order: cat.sort_order,
        counts_toward_capacity: newVal,
      })
      reload()
    } catch (e: any) { showToast(e.message, 'error') }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h2 className="font-black text-slate-900 text-lg">Settings</h2>

      {/* Logo */}
      <Card className="p-4">
        <p className="text-base font-bold text-slate-800 mb-3">Logo</p>
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
        <p className="text-base font-bold text-slate-800">Truck details</p>
        <Input label="Truck name" required value={form.name} onChange={v => setForm(p => ({...p, name: v}))} onBlur={() => saveFormField()} />
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Description</label>
          <textarea value={form.description || ''} onChange={e => setForm(p => ({...p, description: e.target.value}))} onBlur={() => saveFormField()} placeholder="Tell customers about your food..."
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none" rows={3} />
        </div>
        <Input label="Cuisine type" required value={form.cuisine_type || ''} onChange={v => setForm(p => ({...p, cuisine_type: v}))} onBlur={() => saveFormField()} placeholder="e.g. Italian, Thai, Burgers" />

        {/* Menu icon */}
        <div className="mt-1">
          <label className="text-xs font-bold uppercase tracking-widest text-slate-500 block mb-2">
            Menu icon
          </label>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{form.truck_emoji || '🍕'}</span>
            <button
              onClick={() => setShowEmojiPicker(true)}
              className="text-sm text-orange-500 hover:text-orange-600 font-medium underline underline-offset-2">
              Change emoji
            </button>
          </div>
        </div>
      </Card>

      {/* Contact (merged: business contact + customer contact) */}
      <Card className="p-4 space-y-3">
        <div>
          <p className="text-base font-bold text-slate-800">Contact Details</p>
          <p className="text-xs text-slate-400 mt-0.5">How customers reach you about their order (shown on order confirmations) and where you receive new-order alerts. For your personal account details, go to Team → My profile.</p>
        </div>
        <Input label="Email" required type="email" value={form.contact_email || ''} onChange={v => setForm(p => ({...p, contact_email: v}))} onBlur={() => saveFormField()} placeholder="hello@yourtruck.com" error={contactEmailErr ? 'Please enter a valid email (e.g. hello@yourtruck.com)' : undefined} />
        <p className="text-xs text-slate-400 -mt-1.5">Where you receive new-order notifications — and shown to customers on their confirmation when “Email” is the preferred method below.</p>
        <Input label="Phone" required type="tel" value={form.contact_phone || ''} onChange={v => setForm(p => ({...p, contact_phone: v}))} onBlur={saveContactPhone} placeholder="07700 900123" error={contactPhoneErr ? 'Please enter a valid UK phone (e.g. 07700 900123)' : undefined} />
        {/* "This number is on WhatsApp" — ties the customer-facing `whatsapp` to the phone (no double
            entry) and gates WhatsApp as a preferred method below. */}
        <label className="flex items-center gap-2 text-sm text-slate-600 -mt-1 cursor-pointer">
          <input type="checkbox" checked={!!form.phone_is_whatsapp} onChange={e => togglePhoneIsWhatsapp(e.target.checked)} className="w-4 h-4 accent-orange-600 cursor-pointer" />
          This number is on WhatsApp
        </label>

        {/* Preferred contact method — WhatsApp gated on the tick above (customer-facing whatsapp = phone) */}
        <div className="pt-3 border-t border-slate-100">
          {['facebook', 'messenger', 'instagram'].includes(preferredContact) && (
            <p className="text-xs text-slate-500 italic mb-2">Your previous contact method is no longer available. Please select a new one.</p>
          )}
          <div className="flex items-center gap-3">
            <label className="text-sm text-slate-600 w-36 flex-shrink-0">Preferred method</label>
            <select
              value={['facebook', 'messenger', 'instagram'].includes(preferredContact) ? '' : preferredContact}
              onChange={async e => {
                const val = e.target.value
                setPreferredContact(val)
                await saveSetting('preferred_contact_method', val || null)
              }}
              className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white"
            >
              <option value="">Not specified</option>
              {(!!form.contact_email?.trim() || preferredContact === 'email') && <option value="email">Email</option>}
              {(!!form.contact_phone?.trim() || preferredContact === 'phone') && <option value="phone">Phone</option>}
              {(whatsappUsable || preferredContact === 'whatsapp') && <option value="whatsapp">WhatsApp</option>}
            </select>
          </div>
          <p className="text-xs text-slate-400 mt-1.5">How customers should contact you about their order — shown on their confirmation email.</p>
          {!form.contact_email?.trim() && !form.contact_phone?.trim() && (
            <p className="text-xs text-slate-400 mt-1">Add an email or phone above to offer a contact method.</p>
          )}
          {preferredContact === 'whatsapp' && !whatsappUsable && (
            <p className="text-xs text-amber-600 mt-1">⚠️ Tick “This number is on WhatsApp” on the Phone field to use WhatsApp.</p>
          )}
        </div>

        {/* Cancellation policy */}
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

      {/* Online presence & social */}
      <Card className="p-4 space-y-3">
        <p className="text-base font-bold text-slate-800">Online presence &amp; social</p>

        {/* Website */}
        <div className="flex items-center gap-3">
          <label className="text-sm text-slate-600 w-24 flex-shrink-0">Website</label>
          <input
            type="text"
            value={form.website || ''}
            onChange={e => setForm(p => ({...p, website: e.target.value}))}
            onBlur={() => saveFormField()}
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
            <div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-600 w-20 flex-shrink-0">WhatsApp</label>
                {can('whatsapp_replies') ? (
                  <>
                    <input
                      type="tel"
                      value={whatsappSender}
                      onChange={e => setWhatsappSender(e.target.value)}
                      onBlur={saveWhatsappSender}
                      placeholder="+447700900000"
                      className="flex-1 min-w-0 truncate border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                    <button
                      onClick={saveWhatsappSender}
                      className="flex-shrink-0 text-xs px-2.5 py-1.5 bg-teal-600 text-white font-medium rounded-xl"
                    >
                      Save
                    </button>
                  </>
                ) : (
                  <>
                    <input
                      type="tel"
                      disabled
                      placeholder="+447700900000"
                      className="flex-1 min-w-0 truncate border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-50 text-slate-400 cursor-not-allowed"
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
              {/* Distinguishes this from the customer-facing contact number (Contact Details → Phone). */}
              <p className="text-xs text-slate-400 mt-1.5 sm:pl-[5.5rem]">
                The WhatsApp Business number used to send automated replies to customers (set up with the WhatsApp Business API). This is separate from your contact number above.
              </p>
            </div>

            {/* Messenger */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600 w-20 flex-shrink-0">Messenger</label>
              <input
                type="text"
                disabled
                placeholder="Coming soon"
                className="flex-1 min-w-0 truncate border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-50 text-slate-400 cursor-not-allowed"
              />
              <button
                disabled
                className="flex-shrink-0 text-xs px-2.5 py-1.5 border border-slate-200 text-slate-400 rounded-xl whitespace-nowrap cursor-not-allowed"
              >
                Connect
              </button>
            </div>

            {/* Instagram */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600 w-20 flex-shrink-0">Instagram</label>
              <input
                type="text"
                disabled
                value=""
                placeholder="Coming soon"
                className="flex-1 min-w-0 truncate border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-50 text-slate-400 cursor-not-allowed"
              />
              <button
                disabled
                className="flex-shrink-0 text-xs px-2.5 py-1.5 border border-slate-200 text-slate-400 rounded-xl whitespace-nowrap cursor-not-allowed"
              >
                Connect
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Your schedule */}
      <Card className="p-4 space-y-4">
        <p className="text-base font-bold text-slate-800">Your schedule</p>
        <div className="space-y-2">
          {([
            { value: 'manual', label: "I'll add events myself" },
            { value: 'auto',   label: 'Find my events automatically',    desc: "Tell us where you post your schedule and we'll check it for you, sending any events we find for your approval. This needs to be your own website — not a Facebook or Instagram page." },
          ] as { value: 'auto' | 'manual'; label: string; desc?: string }[]).map(opt => {
            const pref = form.scraper_preference ?? 'manual'
            const selected = pref === opt.value || (opt.value === 'auto' && pref === 'both')
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setForm(p => ({ ...p, scraper_preference: opt.value }))
                  saveSetting('scraper_preference', opt.value)
                }}
                className={`w-full text-left border rounded-xl p-4 transition-colors ${selected ? 'border-orange-500 bg-orange-50' : 'border-slate-200 hover:border-slate-300'}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${selected ? 'border-orange-500' : 'border-slate-300'}`}>
                    {selected && <div className="w-2 h-2 rounded-full bg-orange-500" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{opt.label}</p>
                    {opt.desc && <p className="text-xs text-slate-500 mt-0.5">{opt.desc}</p>}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
        {/* Clarifier — applies to BOTH options: found events always come for approval, nothing
            goes live until confirmed (so a "I'll add events myself" truck isn't surprised). */}
        <p className="text-xs text-slate-500">
          Either way, if we find your events listed elsewhere, we&apos;ll still send these to you for approval. Nothing goes live until you confirm it.
        </p>
        {['auto', 'both'].includes(form.scraper_preference ?? 'manual') && (
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-800">Where do you post your schedule?</p>
            <div className="flex gap-2">
              <input
                type="url"
                value={form.schedule_url ?? ''}
                onChange={e => { setForm(p => ({ ...p, schedule_url: e.target.value })); setVerifyError(null) }}
                onBlur={e => {
                  const val = e.target.value
                  if (val && isBlockedDomain(val)) {
                    setVerifyError(BLOCKED_DOMAIN_MSG)
                  } else {
                    setVerifyError(null)
                    saveSetting('schedule_url', val || null)
                  }
                }}
                placeholder="https://yourtruck.co.uk/events"
                disabled={verifying}
                className={`flex-1 min-w-0 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 ${verifying ? 'opacity-50 cursor-not-allowed' : ''}`}
              />
              <button
                type="button"
                onClick={handleVerifyUrl}
                disabled={!form.schedule_url?.trim() || verifying}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {verifying
                  ? <><div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-orange-500 rounded-full animate-spin" />Checking...</>
                  : 'Verify'}
              </button>
            </div>
            {verifying && (
              <div className="mt-1 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <svg className="animate-spin h-4 w-4 text-amber-600 shrink-0 mt-0.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                <div>
                  <p className="text-sm font-semibold text-amber-800">Checking your website...</p>
                  <p className="text-xs text-amber-700 mt-0.5">This can take up to 2 minutes — please keep this page open and don't close the tab.</p>
                </div>
              </div>
            )}
            {!verifying && verifyError && <p className="text-xs text-red-500">{verifyError}</p>}
            <p className="text-xs text-slate-500">Your website where customers can see your upcoming events — not a Facebook or Instagram page</p>
          </div>
        )}
      </Card>

      {/* Import exclusions */}
      {settingsExclusionList.length > 0 && (
        <Card className="p-4 space-y-3">
          <div>
            <p className="text-base font-bold text-slate-800">Import exclusions</p>
            <p className="text-xs text-slate-500 mt-0.5">These terms are automatically filtered out when importing your schedule. Remove any that were added by mistake.</p>
          </div>
          <div className="space-y-1.5">
            {settingsExclusionList.map(item => (
              <div key={item.id} className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-sm text-slate-700">{item.term}</span>
                <button
                  type="button"
                  onClick={async () => {
                    if (item.id) {
                      try { await api('remove_exclusion_term', { id: item.id }) } catch { /* continue */ }
                    }
                    setSettingsExclusionList(prev => prev.filter(t => t.id !== item.id))
                  }}
                  className="text-slate-400 hover:text-red-600 transition-colors ml-3"
                  aria-label={`Remove exclusion for ${item.term}`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* QR Code */}
      <Card className="p-4">
        <p className="text-base font-bold text-slate-800 mb-1">Order QR code</p>
        <p className="text-xs text-slate-500 mb-4">
          Print or display this code so customers can scan and pre-order.
          Place it at your hatch, on your van, or share it online.
        </p>
        {orderUrl ? (
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 mb-4">
            <p className="text-sm text-slate-600 flex-1 truncate font-mono">{orderUrl}</p>
            <button
              onClick={handleCopyOrderLink}
              className="text-xs text-orange-600 font-semibold flex-shrink-0 hover:text-orange-700"
            >
              {copiedOrderLink ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-400 mb-4">No order URL — slug not set</p>
        )}
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

        {orderUrl && (qrDataUrl ? (
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
        ))}
      </Card>

      {/* Orders */}
      <Card className="p-4 space-y-3">
        <p className="text-base font-bold text-slate-800">Order settings</p>
        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-sm font-semibold text-slate-800">Auto-accept orders</p>
            <p className="text-xs text-slate-400">Incoming web orders are confirmed immediately</p>
          </div>
          <button
            onClick={() => {
              const next = !form.auto_accept
              setForm(p => ({...p, auto_accept: next}))
              saveFormField({ auto_accept: next })
            }}
            className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${form.auto_accept ? 'bg-teal-500' : 'bg-slate-300'}`}
          >
            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${form.auto_accept ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        {form.auto_accept && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700">
            ⚠ Slot capacity limits still apply — full slots are never auto-confirmed
          </div>
        )}

        <div className="flex items-center justify-between py-3 border-t border-slate-100">
          <div>
            <p className="text-sm font-semibold text-slate-800">Open for orders automatically</p>
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
            <p className="text-sm font-semibold text-slate-800">Close for orders automatically</p>
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


      {/* Your trucks */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-base font-bold text-slate-800">Your trucks</p>
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
          <div key={van.id} className="mt-4 border border-slate-200 rounded-2xl p-4">
            <div className="flex items-center justify-between py-3 border-b border-slate-200 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-slate-900">{van.name}</span>
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
                    van.auto_pause_on_offline ? 'text-teal-800' : 'text-slate-800'
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
              <p className="text-sm font-semibold text-slate-800 mt-3 mb-2">Display settings</p>

              {/* Show cooking step */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Show cooking step</p>
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
              {/* Capacity number + its category scope = ONE tight, left-aligned unit (max-w keeps it
                  from stretching apart). Category list uses a quiet inline lead-in, NOT a third
                  heading; copy sits muted below. Behaviour unchanged: cooked (prep>0) always count
                  (checked+locked); instant categories toggle; all disabled until a capacity is set. */}
              <div className="mt-3 max-w-md">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
                  <p className="text-sm font-semibold text-slate-800">Kitchen capacity</p>
                  <select
                    value={van.kitchen_capacity ?? ''}
                    onChange={e => updateVanSetting(
                      van.id,
                      'kitchen_capacity',
                      e.target.value === '' ? null : parseInt(e.target.value)
                    )}
                    className="border border-slate-200 rounded-xl px-2 py-2 text-sm text-slate-700 bg-white flex-shrink-0 w-24"
                  >
                    <option value="">No limit</option>
                    {Array.from({length:20},(_,i)=>i+1).map(n=>(
                      <option key={n} value={n}>{n} item{n!==1?'s':''}</option>
                    ))}
                  </select>
                  {/* The ceiling's OWN window cadence — how often the kitchen completes a cycle.
                      Independent of any category's prep. Disabled until a capacity is set. */}
                  <span className="text-sm text-slate-500">every</span>
                  <select
                    value={van.capacity_window_mins ?? 5}
                    disabled={van.kitchen_capacity == null}
                    onChange={e => updateVanSetting(van.id, 'capacity_window_mins', parseInt(e.target.value))}
                    className="border border-slate-200 rounded-xl px-2 py-2 text-sm text-slate-700 bg-white flex-shrink-0 w-20 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50"
                  >
                    {Array.from({length:20},(_,i)=>i+1).map(n=>(
                      <option key={n} value={n}>{n} min</option>
                    ))}
                  </select>
                </div>
                {categories.length > 0 && (
                  <div className="mt-2">
                    <span className="text-xs text-slate-400">Limit applies to:</span>
                    {/* Side-by-side wrapping row — Pizza / Other / Drinks flow inline and wrap to the
                        next row only if they don't fit. Even spacing; auto-selected cooked categories
                        (Pizza) show checked + locked, no caption. */}
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                      {categories.map(cat => {
                        const hasCap = van.kitchen_capacity != null
                        const locked = cat.prep_secs > 0
                        const disabled = locked || !hasCap
                        return (
                          <label key={cat.id}
                            title={locked
                              ? 'Cooked — always counts (its prep & batch set the pace)'
                              : !hasCap ? 'Set a capacity to choose which categories count'
                              : 'Tick to include this instant category (e.g. sides, dips, drinks) in the shared per-window limit'}
                            className={`flex items-center gap-1.5 text-sm ${disabled ? 'text-slate-400 cursor-not-allowed' : 'text-slate-700 cursor-pointer'}`}>
                            <input
                              type="checkbox"
                              checked={locked ? true : !!cat.counts_toward_capacity}
                              disabled={disabled}
                              onChange={() => { if (!locked && hasCap) toggleCatCapacity(cat, !cat.counts_toward_capacity) }}
                              className="w-4 h-4 accent-orange-600 cursor-pointer disabled:cursor-not-allowed"
                            />
                            <span>{cat.name}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )}
                {van.kitchen_capacity == null && categories.length > 0 && (
                  <p className="text-xs text-slate-400 mt-1.5">Set a capacity to choose which categories count.</p>
                )}
                {kitchenCapacityNeedsPrepWarning(van.kitchen_capacity, categories)&&(
                  <div className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{KITCHEN_CAPACITY_WARNING}</div>
                )}
                <p className="text-xs text-slate-400 mt-2">{KITCHEN_CAPACITY_DESC}</p>
                <p className="text-xs text-slate-400 mt-1">{KITCHEN_CAPACITY_EXAMPLE}</p>
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
                <strong>{maskPrice(`£${VAN_ADDON_PRICE[truck.plan]}/month`)}</strong>{' '}
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
                Add truck — {maskPrice(`£${VAN_ADDON_PRICE[truck.plan]}/mo`)}
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

      <p className="text-xs text-slate-400 text-center pb-2">Changes save automatically</p>

      {/* Emoji picker popup */}
      {showEmojiPicker && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">Choose your icon</h3>
              <button
                onClick={() => setShowEmojiPicker(false)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none">
                ✕
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-4">
              {FOOD_EMOJI_CATEGORIES.map(({ label, emojis }) => (
                <div key={label}>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                    {label}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {emojis.map(emoji => (
                      <button
                        key={emoji}
                        onClick={() => {
                          setForm(f => ({ ...f, truck_emoji: emoji }))
                          saveFormField({ truck_emoji: emoji })
                          setShowEmojiPicker(false)
                        }}
                        className={`text-2xl p-1.5 rounded-lg transition-colors ${
                          form.truck_emoji === emoji
                            ? 'bg-orange-100 ring-2 ring-orange-400'
                            : 'hover:bg-slate-100'
                        }`}>
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const formatTrialEndDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

// ── BillingTab ──────────────────────────────────────────────────
// TODO: Replace upgrade modal with Stripe Checkout/Customer Portal when Stripe Connect billing is implemented
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'hello@villagefoodie.co.uk'

function BillingTab({ truck }: { truck: Truck | null }) {
  if (!truck) return null
  const currentPlan = truck.plan
  const trialActive = truck.plan === 'trial' &&
    truck.trial_expires_at !== null &&
    new Date(truck.trial_expires_at) > new Date()
  const billingPlans: readonly ('trial' | 'starter' | 'pro' | 'max')[] = trialActive
    ? (['trial', 'starter', 'pro', 'max'] as const)
    : (['starter', 'pro', 'max'] as const)
  const isCurrent = (p: 'trial' | 'starter' | 'pro' | 'max') =>
    p === truck.plan
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [upgradeTarget, setUpgradeTarget] = useState<'pro' | 'max'>('max')
  const [showMatrix, setShowMatrix] = useState(false)
  const openUpgrade = (target: 'pro' | 'max') => { setUpgradeTarget(target); setShowUpgradeModal(true) }
  const plan = truck.plan

  // Pre-launch pricing gate (shared with FeatureGate + the van add-on) — concrete prices show as
  // "TBC" until NEXT_PUBLIC_PRICING_PUBLISHED === 'true'. Free / 0% / Pay at Hatch / Lifetime stay
  // visible. Plan structure and feature rows are unaffected. See lib/pricing.ts.
  const px = maskPrice

  const matrixContent = (
    <>
      {/* Plan columns header with prices — sticky below the nav (51px) + tabs bar (~44px) so the
          plan/price columns stay visible while scrolling the feature rows. z-30 < tabs z-40 so it
          tucks under the tabs. bg-white hides rows scrolling beneath. Works on mobile (the matrix
          wrapper has no overflow ancestor — page scrolls on the window). */}
      <div className="flex items-start justify-between mb-2 sticky top-[95px] z-30 bg-white pt-2">
        <div className="flex-1" />
        {billingPlans.map(p => (
          <div key={p} className={`w-14 sm:w-28 text-center pb-3 border-b-2 ${
            isCurrent(p) ? 'border-orange-500' : 'border-slate-100'
          }`}>
            <p className={`text-[10px] sm:text-xs font-semibold uppercase tracking-widest ${
              isCurrent(p) ? 'text-orange-500' : 'text-slate-400'
            }`}>{p}</p>
            <p className={`text-base sm:text-xl font-bold mt-1 ${
              isCurrent(p) ? 'text-orange-600' : 'text-slate-900'
            }`}>{px(PLAN_PRICES[p])}</p>
            <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5">
              {/* Trial column: render the placeholder invisibly so the column keeps the same
                  height as Starter/Pro/Max and its bottom border stays aligned. The trial end
                  date is shown elsewhere (the reminder banner + the "won't be charged until" line). */}
              <span className={p === 'trial' ? 'invisible' : ''}>per truck / month</span>
            </p>
          </div>
        ))}
      </div>
      {/* Transaction fees */}
      <div className="mb-2">
        <div className="flex items-center py-2 border-t-2 border-slate-100 mt-3">
          <span className="flex-1 text-xs font-bold text-slate-900 uppercase tracking-wider">Transaction fees</span>
          {trialActive && <div className="w-14 sm:w-28" />}<div className="w-14 sm:w-28" /><div className="w-14 sm:w-28" /><div className="w-14 sm:w-28" />
        </div>
        {TRANSACTION_ROWS.map(row => (
          <div key={row.name} className="flex items-start py-2.5 border-t border-slate-100">
            <div className="flex-1 pr-4">
              <div className="text-sm font-medium text-slate-800 pl-3 sm:pl-0">
                {row.name}
                {row.footnote && <sup className="text-slate-500 text-[10px] ml-0.5">{row.footnote}</sup>}
              </div>
            </div>
            {billingPlans.map(p => (
              <div key={p} className={`w-14 sm:w-28 text-center text-xs sm:text-sm font-semibold leading-snug ${
                isCurrent(p) ? 'text-orange-600' : 'text-slate-600'
              }`}>
                {px(p === 'trial' ? row.values.starter : row.values[p as 'starter' | 'pro' | 'max'])}
              </div>
            ))}
          </div>
        ))}
      </div>
      {/* Feature sections */}
      {FEATURE_SECTIONS.map(section => (
        <div key={section.title} className="mb-2">
          <div className="flex items-center py-2 border-t-2 border-slate-100 mt-3">
            <span className="flex-1 text-xs font-bold text-slate-900 uppercase tracking-wider">
              {section.title}
            </span>
            {trialActive && <div className="w-14 sm:w-28" />}<div className="w-14 sm:w-28" /><div className="w-14 sm:w-28" /><div className="w-14 sm:w-28" />
          </div>
          {section.rows.map(row => (
            <div key={row.name} className="flex items-center py-2 border-t border-slate-100">
              <div className="flex-1 pr-4">
                <div className="text-sm text-slate-800 pl-3 sm:pl-0">
                  {row.name}
                  {row.footnote && <sup className="text-slate-500 text-[10px] ml-0.5">{row.footnote}</sup>}
                </div>
                {row.detail && <p className="text-xs text-slate-600 mt-0.5">{row.detail}</p>}
              </div>
              {billingPlans.map(p => {
                const val = p === 'trial'
                  ? (row.name === 'Online ordering — Pay at Hatch' ? true : row.max)
                  : row[p as 'starter' | 'pro' | 'max']
                return (
                  <div key={p} className="w-14 sm:w-28 text-center">
                    {val === true && (
                      <span className={`text-sm font-semibold ${isCurrent(p) ? 'text-orange-500' : 'text-slate-500'}`}>✓</span>
                    )}
                    {val === false && (
                      <span className="text-slate-300 text-sm">—</span>
                    )}
                    {val === 'coming_soon' && (
                      <span className="text-xs text-slate-400 italic leading-tight">Coming soon</span>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      ))}
    </>
  )

  const footnotesContent = (
    <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col gap-1.5">
      {FOOTNOTES.map(f => (
        <p key={f.number} className="text-xs text-slate-700">
          <sup>{f.number}</sup> {PRICING_PUBLISHED || f.number !== '2'
            ? f.text
            : 'Online payments are powered by Stripe Connect. Platform and card processing fees are TBC and will be confirmed at launch.'}
        </p>
      ))}
    </div>
  )

  const billingCard = (
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
  )

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">

      {/* TRIAL: payment capture is urgent — show ABOVE the matrix */}
      {plan === 'trial' && (
        <>
          <div className="bg-white border-0 shadow-none rounded-none px-0 sm:border sm:border-slate-200 sm:shadow-sm sm:rounded-2xl sm:px-6 py-6">
            <div className="mb-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Current plan</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {PLAN_META[currentPlan]?.name ?? currentPlan}
              </p>
              <p className="text-sm text-slate-700 mt-0.5">{px(PLAN_PRICES[currentPlan])}</p>
              <p className="text-sm text-slate-700 mt-0.5">{PLAN_DESCRIPTIONS[currentPlan]}</p>
              {truck.trial_expires_at && (
                <p className="text-xs text-amber-600 mt-1">
                  Trial ends {formatDate(truck.trial_expires_at)}
                </p>
              )}
            </div>
            <div className="rounded-xl p-4 bg-orange-50 border border-orange-200">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    Your trial ends {truck.trial_expires_at ? formatDate(truck.trial_expires_at) : 'soon'}
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    You&apos;re on Max features. Choose a plan before your trial ends to keep access.
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-shrink-0">
                  <button
                    onClick={() => openUpgrade('max')}
                    className="w-full sm:w-auto px-4 py-2 bg-orange-600 text-white text-sm font-semibold rounded-xl whitespace-nowrap hover:bg-orange-700 transition-colors"
                  >
                    Upgrade to Max — {px('£49/mo')}
                  </button>
                  <button
                    onClick={() => openUpgrade('pro')}
                    className="w-full sm:w-auto px-4 py-2 border border-orange-300 text-orange-600 text-sm font-medium rounded-xl whitespace-nowrap hover:bg-orange-50 transition-colors"
                  >
                    Choose Pro — {px('£29/mo')}
                  </button>
                </div>
              </div>
            </div>
            {truck.trial_expires_at && (
              <>
                <p className="text-xs text-center text-slate-500 mt-3">
                  🔒 You won&apos;t be charged anything until your trial ends on{' '}
                  {formatTrialEndDate(truck.trial_expires_at)}.
                  Automated billing activates at the end of your trial — cancel anytime before then at no cost.
                </p>
                <p className="text-xs text-center text-slate-400 mt-1">
                  *Standard card processing fees apply on online orders
                </p>
              </>
            )}
          </div>
          <p className="text-xs text-amber-600 font-medium -mt-3">
            ⏱ Set up payment before your trial ends to keep access
          </p>
          {billingCard}
          <div className="bg-white border-0 shadow-none rounded-none px-0 sm:border sm:border-slate-200 sm:shadow-sm sm:rounded-2xl sm:px-6 py-6">
            {matrixContent}
            {footnotesContent}
          </div>
        </>
      )}

      {/* STARTER: upgrade prompt + payment ready below */}
      {plan === 'starter' && (
        <>
          <div className="bg-white border-0 shadow-none rounded-none px-0 sm:border sm:border-slate-200 sm:shadow-sm sm:rounded-2xl sm:px-6 py-6">
            <div className="mb-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Current plan</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {PLAN_META[currentPlan]?.name ?? currentPlan}
              </p>
              <p className="text-sm text-slate-700 mt-0.5">{px(PLAN_PRICES[currentPlan])}</p>
              <p className="text-sm text-slate-700 mt-0.5">{PLAN_DESCRIPTIONS[currentPlan]}</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <p className="text-sm font-bold text-slate-900 mb-3">Upgrade your plan</p>
              <div className="flex gap-3">
                <button
                  onClick={() => openUpgrade('pro')}
                  className="flex-1 py-2.5 border border-orange-200 text-orange-600 text-sm font-semibold rounded-xl hover:bg-orange-50 transition-colors"
                >
                  Pro — {px('£29/mo')}
                </button>
                <button
                  onClick={() => openUpgrade('max')}
                  className="flex-1 py-2.5 bg-orange-600 text-white text-sm font-semibold rounded-xl hover:bg-orange-700 transition-colors"
                >
                  Max — {px('£49/mo')}
                </button>
              </div>
            </div>
          </div>
          {billingCard}
          <div className="bg-white border-0 shadow-none rounded-none px-0 sm:border sm:border-slate-200 sm:shadow-sm sm:rounded-2xl sm:px-6 py-6">
            {matrixContent}
            {footnotesContent}
          </div>
        </>
      )}

      {/* PRO / MAX: already paying — minimal friction */}
      {(plan === 'pro' || plan === 'max') && (
        <>
          <div className="bg-white border-0 shadow-none rounded-none px-0 sm:border sm:border-slate-200 sm:shadow-sm sm:rounded-2xl sm:px-6 py-6">
            <div className="mb-6">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Current plan</p>
              <p className="text-2xl font-black text-slate-900">
                {plan === 'pro' ? 'Pro' : 'Max'}
              </p>
              <p className="text-sm text-slate-500 mt-0.5">
                {px(plan === 'pro' ? '£29/mo' : '£49/mo')} per truck · renews automatically
              </p>
            </div>
            <div className="mb-6">
              <button
                onClick={() => setShowMatrix(!showMatrix)}
                className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"
              >
                {showMatrix ? '▲ Hide' : '▼ Compare all plans'}
              </button>
              {showMatrix && matrixContent}
            </div>
            {footnotesContent}
          </div>
          {billingCard}
        </>
      )}

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
                  ? `${px('£49/month')} — High-volume operations & festivals`
                  : `${px('£29/month')} — Busy trucks scaling pre-orders`
                }
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <p className="text-sm text-slate-700">
                We&apos;re setting up automated billing. To upgrade now, drop us a message and we&apos;ll get you set up within 24 hours.
              </p>
            </div>
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=Upgrade to ${upgradeTarget === 'max' ? 'Max' : 'Pro'} — ${truck.name}&body=Hi, I'd like to upgrade ${truck.name} to the ${upgradeTarget === 'max' ? `Max (${px('£49/mo')})` : `Pro (${px('£29/mo')})`} plan.`}
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

type ExplodedItem = {
  orderId: string; dateStr: string; eventStr: string; timePlaced: string
  collectionTime: string; customerName: string; orderType: string; orderTotal: number
  itemLabel: string; qty: number; basePrice: number; modStr: string; noteStr: string; itemTotal: number
}
function explodeOrderItems(
  orders: any[],
  eventsMap: Record<string, { venue_name: string | null; town: string | null }>
): ExplodedItem[] {
  const rows: ExplodedItem[] = []
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
    const dealItemMap: Record<string, string> = {}
    for (const d of (Array.isArray(o.deals) ? o.deals : []))
      for (const itemName of Object.values(d.slots || {}))
        if (itemName && !dealItemMap[itemName as string]) dealItemMap[itemName as string] = d.name
    for (const item of (Array.isArray(o.items) ? o.items : [])) {
      const dealName = dealItemMap[item.name]
      const qty = item.quantity || 1
      const modSum = (item.modifiers || []).reduce((s: number, m: any) => s + (m.price || 0), 0)
      rows.push({
        orderId: o.id, dateStr, eventStr, timePlaced, collectionTime, customerName, orderType, orderTotal: o.total || 0,
        itemLabel: dealName ? `🎁 ${item.name} (${dealName})` : item.name,
        qty,
        basePrice: (item.unit_price || 0) - modSum,
        modStr: (item.modifiers || []).filter((m: any) => m.price > 0).map((m: any) => `${m.name} +£${m.price.toFixed(2)}`).join('; '),
        noteStr: item.specialInstructions || '',
        itemTotal: (item.unit_price || 0) * qty,
      })
    }
  }
  return rows
}

function ReportsTab({ truck, api }: { truck: Truck | null; api: (a: string, e?: any) => Promise<any> }) {
  const hasAdvanced = truck
    ? canAccess(truck.plan, 'advanced_reporting', truck.feature_overrides ?? {}, truck.trial_expires_at ?? null)
    : false
  const isoDate = (offset: number) => {
    const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().split('T')[0]
  }
  const [filterMode, setFilterMode] = useState<'date' | 'event'>(hasAdvanced ? 'date' : 'event')
  const [itemView, setItemView] = useState<'orders' | 'items'>('orders')
  // Mobile order-history: which order rows are tap-expanded (desktop shows the full table, no expand).
  const [expandedOrders, setExpandedOrders] = useState<Set<string | number>>(new Set())
  const toggleOrderExpand = (id: string | number) => setExpandedOrders(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const [dateFrom, setDateFrom] = useState(() => isoDate(-7))
  const [dateTo, setDateTo]     = useState(() => isoDate(-1))
  const [reportEventId, setReportEventId] = useState('')
  const [reportData, setReportData] = useState<ReportData | null | undefined>(undefined)
  const [reportLoaded, setReportLoaded] = useState(false)
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api('get_recent_events').then(r => setRecentEvents(r.events || [])).catch(() => {})
    if (hasAdvanced) loadReport()
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
    if (!orders.length || filterMode !== 'event' || !reportEventId) return null
    const ev = recentEvents.find(e => e.id === reportEventId)
    const dateStr = ev?.event_date
      ? new Date(ev.event_date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
      : ''
    return [ev?.venue_name, dateStr].filter(Boolean).join(' · ')
  }, [orders, filterMode, reportEventId, recentEvents]) // eslint-disable-line react-hooks/exhaustive-deps

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
    const rows = explodeOrderItems(orders, eventsMap).map(r =>
      [r.orderId, r.dateStr, r.eventStr, r.timePlaced, r.collectionTime, r.customerName, r.orderType,
       r.itemLabel, String(r.qty), fmtGBP(r.basePrice), r.modStr, r.noteStr, fmtGBP(r.itemTotal), fmtGBP(r.orderTotal)]
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
    )
    const csv = [headers.map(h => `"${h}"`), ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = itemsCsvFilename
    a.click(); URL.revokeObjectURL(url)
  }

  // Shared column cell classes — used by both Orders and Items views. Lower-priority columns are
  // hidden on mobile (hidden sm:block) so the Items view fits without the total being cut off; the
  // Orders desktop row is itself hidden sm:flex (mobile uses the compact card), so this only affects
  // the Items view on mobile. Desktop (sm:) unchanged.
  const colId    = 'font-mono text-slate-400 flex-shrink-0 w-10'
  const colDate  = 'text-slate-400 flex-shrink-0 w-10 hidden sm:block'
  const colVenue = 'text-slate-500 flex-shrink-0 w-24 truncate hidden sm:block'
  const colTime  = 'text-slate-400 flex-shrink-0 w-10 hidden sm:block'
  const colType  = (online: boolean) => `flex-shrink-0 w-14 font-medium hidden sm:block ${online ? 'text-blue-600' : 'text-slate-500'}`
  const colCust  = 'text-slate-600 flex-shrink-0 w-16 truncate'
  const colTotal = 'font-medium text-slate-900 flex-shrink-0'
  const colMuted = 'text-slate-400 flex-shrink-0'

  return (
    <div className="flex flex-col gap-5">
      {/* ── Filter bar ── */}
      {/* Mobile toolbar — three rows */}
      <div className="sm:hidden space-y-2">
        {/* Row 1: filter toggles (Pro/Max) + View report */}
        <div className="flex items-center gap-2">
          {hasAdvanced && (
            <>
              <button onClick={() => setFilterMode('date')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterMode === 'date' ? 'bg-slate-800 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                📅 Date range
              </button>
              <button onClick={() => setFilterMode('event')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterMode === 'event' ? 'bg-slate-800 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                📍 Event
              </button>
            </>
          )}
          <button onClick={() => loadReport()} disabled={loading || (filterMode === 'event' && !reportEventId)}
            className="ml-auto px-3 py-1.5 bg-orange-600 text-white text-sm font-medium rounded-xl hover:bg-orange-700 transition-colors disabled:opacity-50 whitespace-nowrap">
            {loading ? 'Loading…' : 'View report'}
          </button>
        </div>
        {/* Row 2: filter inputs */}
        {filterMode === 'date' ? (
          <div className="flex items-center gap-2">
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white" />
            <span className="text-sm text-slate-400 flex-shrink-0">to</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white" />
          </div>
        ) : (
          <select value={reportEventId}
            onChange={e => { const id = e.target.value; setReportEventId(id); if (id) loadReport(undefined, undefined, id, 'event') }}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white">
            <option value="">Select an event…</option>
            {recentEvents.map(ev => {
              const evDate = new Date(ev.event_date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
              return <option key={ev.id} value={ev.id}>{ev.venue_name || 'Event'} · {evDate}</option>
            })}
          </select>
        )}
        {/* Row 3: results actions */}
        <div className={`flex items-center gap-2 ${orders.length === 0 ? 'invisible' : ''}`}>
          <button onClick={() => setItemView('orders')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${itemView === 'orders' ? 'bg-slate-800 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            📋 Orders
          </button>
          <button onClick={() => setItemView('items')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${itemView === 'items' ? 'bg-slate-800 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            📦 Items
          </button>
          <button onClick={itemView === 'orders' ? exportCSV : exportItemsCSV}
            disabled={orders.length === 0}
            className="ml-auto p-2 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors text-base leading-none">
            ⬇
          </button>
        </div>
      </div>
      {/* Desktop toolbar — unchanged single row */}
      <div className="hidden sm:flex flex-col gap-3">
        {/* Row 1: Filter mode toggle — Pro/Max only */}
        {hasAdvanced && (
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
        )}
        {/* Row 2: fixed-width filter controls + action buttons + view toggle + export far-right */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 flex-shrink-0" style={{ minWidth: '320px' }}>
            {filterMode === 'date' ? (
              <>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white flex-shrink-0" />
                <span className="text-sm text-slate-400 flex-shrink-0">to</span>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white flex-shrink-0" />
              </>
            ) : (
              <select value={reportEventId}
                onChange={e => { const id = e.target.value; setReportEventId(id); if (id) loadReport(undefined, undefined, id, 'event') }}
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white w-[320px]">
                <option value="">Select an event…</option>
                {recentEvents.map(ev => {
                  const evDate = new Date(ev.event_date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
                  return <option key={ev.id} value={ev.id}>{ev.venue_name || 'Event'} · {evDate}</option>
                })}
              </select>
            )}
          </div>
          <button onClick={() => loadReport()} disabled={loading || (filterMode === 'event' && !reportEventId)}
            className="h-10 px-4 bg-orange-600 text-white text-sm font-medium rounded-xl hover:bg-orange-700 transition-colors disabled:opacity-50 flex-shrink-0">
            {loading ? 'Loading…' : 'View report'}
          </button>
          <button onClick={() => setItemView('orders')}
            className={`flex-shrink-0 ${orders.length === 0 ? 'invisible ' : ''}${itemView === 'orders' ? 'bg-slate-800 text-white px-3 py-1.5 rounded-lg text-sm font-medium' : 'border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg text-sm hover:bg-slate-50'}`}>
            📋 Orders
          </button>
          <button onClick={() => setItemView('items')}
            className={`flex-shrink-0 ${orders.length === 0 ? 'invisible ' : ''}${itemView === 'items' ? 'bg-slate-800 text-white px-3 py-1.5 rounded-lg text-sm font-medium' : 'border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg text-sm hover:bg-slate-50'}`}>
            📦 Items
          </button>
          <button onClick={itemView === 'orders' ? exportCSV : exportItemsCSV}
            disabled={orders.length === 0}
            className={`ml-auto h-10 px-4 border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors flex-shrink-0 ${orders.length === 0 ? 'invisible' : ''}`}>
            ⬇ Export CSV
          </button>
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
              <p className="text-xs text-slate-500 mb-0.5">{reportHeader}</p>
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

          {/* ── Results list ── */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            {itemView === 'orders' && (
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
                  const isExpanded = expandedOrders.has(o.id)
                  return (
                    <div key={o.id} className={`border-b border-slate-50 last:border-0 text-xs ${isCancelled ? 'opacity-50' : ''}`}>
                      {/* Desktop: full row (unchanged) */}
                      <div className="hidden sm:flex items-center gap-2 py-2">
                        <span className={colId}>#{o.id}</span>
                        <span className={colDate}>{dateStr}</span>
                        <span className={colVenue}>{venueShort}</span>
                        <span className={colTime}>{timePlaced}</span>
                        <span className={colType(!!o.customer_email)}>{orderType}</span>
                        <span className={colCust}>{customerLabel}</span>
                        <span className="text-slate-600 flex-1 truncate min-w-0">{itemSummary}</span>
                        <span className={colTotal}>{fmtGBP(o.total || 0)}</span>
                      </div>
                      {/* Mobile: compact glance row (#N · date time | total) + tap-to-expand for the rest. */}
                      <div className="sm:hidden">
                        <button onClick={() => toggleOrderExpand(o.id)}
                          className="w-full flex items-center justify-between gap-2 py-2.5 text-left text-sm">
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span className={`text-slate-300 flex-shrink-0 text-[10px] transition-transform inline-block ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                            <span className="font-mono font-semibold text-orange-500 flex-shrink-0">#{o.id}</span>
                            <span className="text-slate-500 truncate">{dateStr} · {timePlaced}</span>
                          </span>
                          <span className="font-bold text-slate-900 flex-shrink-0">{fmtGBP(o.total || 0)}</span>
                        </button>
                        {isExpanded && (
                          <div className="pb-2.5 pl-5 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className={colType(!!o.customer_email)}>{orderType}</span>
                              {customerLabel !== '—' && <span className="text-slate-600">{customerLabel}</span>}
                              {venueName && <span className="text-slate-400">· {venueName}</span>}
                            </div>
                            <div className="space-y-0.5">
                              {(Array.isArray(o.items) ? o.items : []).map((i: any, idx: number) => {
                                const mods = Array.isArray(i.modifiers) && i.modifiers.length > 0
                                  ? ` (${i.modifiers.map((m: any) => m.name).join(', ')})` : ''
                                return (
                                  <div key={idx} className="flex items-baseline justify-between gap-2">
                                    <span className="text-slate-700 min-w-0">{i.quantity || 1}× {i.name}{mods}</span>
                                    <span className="text-slate-400 flex-shrink-0 tabular-nums">{fmtGBP(i.unit_price || 0)}</span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {itemView === 'items' && (() => {
              const rows = explodeOrderItems(orders, eventsMap)
              return (
                <div>
                  {rows.map((r, i) => {
                    const isNewOrder = i === 0 || rows[i - 1].orderId !== r.orderId
                    const isOnline = r.orderType === 'Customer online'
                    const orderTypeShort = isOnline ? 'Online' : 'Walk-up'
                    const customerLabel = r.customerName === 'Unknown' ? '—' : r.customerName
                    const venueShort = r.eventStr.length > 18 ? r.eventStr.slice(0, 17) + '…' : r.eventStr
                    const isDeal = r.itemLabel.startsWith('🎁 ')
                    const dealMatch = isDeal ? r.itemLabel.match(/^🎁 (.+) \((.+)\)$/) : null
                    const itemDisplayName = dealMatch ? `🎁 ${dealMatch[1]}` : r.itemLabel
                    const dealName = dealMatch ? dealMatch[2] : null
                    return (
                      <div key={i} className={`flex items-center gap-2 py-2 text-xs ${isNewOrder && i > 0 ? 'border-t border-slate-100' : ''}`}>
                        <span className="font-mono text-orange-400 flex-shrink-0 w-10">#{r.orderId}</span>
                        <span className={colDate}>{r.dateStr}</span>
                        <span className={colVenue}>{venueShort}</span>
                        <span className={colTime}>{r.timePlaced}</span>
                        <span className={colType(isOnline)}>{orderTypeShort}</span>
                        <span className={colCust}>{customerLabel}</span>
                        <div className="flex-1 min-w-0">
                          <span className="text-slate-700 truncate block">{itemDisplayName}</span>
                          {dealName && <span className="text-slate-400 text-[10px] truncate block">{dealName}</span>}
                        </div>
                        <span className={`${colMuted} w-6 text-right`}>×{r.qty}</span>
                        <span className="text-slate-500 flex-shrink-0 w-14 text-right">{fmtGBP(r.basePrice)}</span>
                        <span className={`${colMuted} w-28 truncate hidden sm:block`}>{r.modStr || <span className="text-slate-300">—</span>}</span>
                        <span className={`${colTotal} w-14 text-right`}>{fmtGBP(r.itemTotal)}</span>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>

          {/* ── Pro feature placeholder (Starter only) ── */}
          {!hasAdvanced && (
            <div className="rounded-xl border border-slate-200 p-6 opacity-60">
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold text-slate-700">Revenue breakdown & analytics</span>
                <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">Pro feature</span>
              </div>
              <p className="text-sm text-slate-400">
                Date range reporting, revenue breakdown, deal performance, items sold ranking, hourly sales patterns, and event ROI comparison. Available on Pro and Max.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── TeamTab ────────────────────────────────────────────────────
type PendingEmailChange = { id: string; new_email: string; requested_at: string; expired_at: string }

function TeamTab({ truck, token, api, reload, showToast, currentUserEmail, currentUserFirstName, currentUserLastName, currentUserPhone, currentUserId, userRole, initialPendingEmailChange, onProfileSaved }: {
  truck: Truck; token: string
  api: (a: string, e?: any) => Promise<any>; reload: () => void; showToast: (m: string, t?: any) => void
  currentUserEmail: string | null; currentUserFirstName: string | null; currentUserLastName: string | null; currentUserPhone: string | null
  currentUserId: string | null; userRole: 'owner' | 'manager' | 'staff'
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
  const [cancellingEmailChange, setCancellingEmailChange] = useState(false)
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
            expired_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
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

  const handleCancelEmailChange = async () => {
    if (!pendingEmailChange) return
    setCancellingEmailChange(true)
    try {
      const res = await fetch('/api/auth/cancel-email-change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changeId: pendingEmailChange.id }),
      })
      const data = await res.json()
      if (data.ok) {
        setPendingEmailChange(null)
        showToast('Email change cancelled')
      } else {
        showToast(data.error || 'Failed to cancel', 'error')
      }
    } catch {
      showToast('Failed to cancel', 'error')
    } finally {
      setCancellingEmailChange(false)
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

  const canEdit = (member: TeamMember) => {
    if (userRole === 'owner') return true
    if (userRole === 'manager') return member.role === 'staff'
    if (userRole === 'staff') return member.auth_user_id === currentUserId
    return false
  }

  const canRemove = (member: TeamMember) => {
    if (userRole === 'owner') return true
    if (userRole === 'manager') return member.role === 'staff'
    return false
  }

  const visibleMembers = teamMembers.filter(member => {
    if (userRole === 'owner' || userRole === 'manager') return true
    return member.auth_user_id === currentUserId
  })

  const invitableRoles: Array<'owner' | 'manager' | 'staff'> = userRole === 'owner'
    ? ['manager', 'staff']
    : ['staff']

  return (
    <div className="flex flex-col gap-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">Team members</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Invite staff to access the order screen and take orders
          </p>
        </div>
        {userRole !== 'staff' && (
          <button
            onClick={openInviteModal}
            className="text-xs px-3 py-1.5 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700"
          >
            + Invite member
          </button>
        )}
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
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <button
                onClick={() => handleResendVerification(pendingEmailChange.id)}
                disabled={resendingVerification || cancellingEmailChange}
                className="text-xs text-amber-700 font-semibold underline disabled:opacity-50"
              >
                {resendingVerification ? 'Sending...' : 'Resend'}
              </button>
              <button
                onClick={handleCancelEmailChange}
                disabled={cancellingEmailChange || resendingVerification}
                className="text-xs text-slate-500 underline disabled:opacity-50"
              >
                {cancellingEmailChange ? 'Cancelling...' : 'Cancel'}
              </button>
            </div>
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
                disabled={!!pendingEmailChange}
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white disabled:bg-slate-50 disabled:text-slate-400"
              />
              {pendingEmailChange ? (
                <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-amber-800">⏳ Awaiting verification</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Verification sent to <strong>{pendingEmailChange.new_email}</strong>. Check your inbox.
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleResendVerification(pendingEmailChange.id)}
                      disabled={resendingVerification || cancellingEmailChange}
                      className="text-xs text-amber-700 font-semibold underline disabled:opacity-50"
                    >
                      {resendingVerification ? 'Sending...' : 'Resend'}
                    </button>
                    <button
                      onClick={handleCancelEmailChange}
                      disabled={cancellingEmailChange || resendingVerification}
                      className="text-xs text-slate-500 underline disabled:opacity-50"
                    >
                      {cancellingEmailChange ? 'Cancelling...' : 'Cancel'}
                    </button>
                  </div>
                </div>
              ) : ownProfileEmail !== currentUserEmail && (
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
        {visibleMembers.map(member => (
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
              {canEdit(member) && (
                <button
                  onClick={() => editMember(member)}
                  className="text-xs px-2.5 py-1.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50"
                >
                  Edit
                </button>
              )}
              {canRemove(member) && (
                <button
                  onClick={() => removeMember(member.id)}
                  className="text-xs px-2.5 py-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}

        {visibleMembers.length === 0 && (
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
                {invitableRoles.includes('staff') && (
                  <option value="staff">Staff — Take orders and manage the kitchen</option>
                )}
                {invitableRoles.includes('manager') && (
                  <option value="manager">Manager — Full access including menu and settings</option>
                )}
                {invitableRoles.includes('owner') && (
                  <option value="owner">Owner — Full access including team and billing</option>
                )}
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