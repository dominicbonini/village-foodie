// app/admin/page.tsx
// Village Foodie admin panel — manage truck plans, trials, and feature overrides
// Protected by Supabase session: operators.is_admin = true required

'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PLAN_META, type Plan, type Feature } from '@/lib/features'
import { PLAN_PRICES, FEATURE_SECTIONS, FOOTNOTES } from '@/lib/plan-features'
import AppHeader from '@/components/shared/AppHeader'
import UserMenu from '@/components/dashboard/UserMenu'
import { operatorSignOut } from '@/lib/native/signOut'
import { nativeAuthHeader } from '@/lib/native/session'   // native app sends its Bearer; {} on web (cookie path unchanged)
import { createSlug } from '@/lib/utils'   // slug preview in the create-truck modal — SAME fn provision-truck derives with
import { AppLink } from '@/components/native/AppLink'   // internal-route anchor: soft-nav in native, plain <a> on web

interface AdminTruck {
  id: string
  name: string
  slug: string | null
  dashboard_token: string | null
  plan: Plan
  trial_expires_at: string | null
  feature_overrides: Record<string, boolean> | null
  active: boolean
  auto_accept: boolean
  contact_email: string | null
  onboarded_at: string | null
  operator_id: string | null
  lifetime_discount_pct: number | null
  lifetime_discount_note: string | null
  show_on_vf: boolean
  show_on_hg: boolean
  order_link_vf: boolean
  order_link_hg: boolean
  is_customer: boolean
  excluded: boolean
  scraper_preference?: 'auto' | 'manual' | 'both' | null
  schedule_url?: string | null
  scraper_rule?: 'scroll_lazy' | 'scroll_next' | null
  scraper_learning_complete?: boolean
  scraper_first_run_at?: string | null
  scraper_update_day?: number | null
  scraper_last_changed_at?: string | null
  scraper_last_empty_notify_at?: string | null
  scraper_last_hash?: string | null
}

interface DiscoveryTruck {
  id: string
  name: string
  visibility: 'public' | 'hg_only' | 'hidden'
  hatchgrab_truck_id: string | null
  exclude_reason: string | null
  show_on_vf: boolean
  show_on_hg: boolean
  excluded: boolean
}

// ── Create-truck form ────────────────────────────────────────────────────────────────────────────────
// Mirrors ProvisionTruckOptions in lib/provision-truck.ts. Kept as plain strings so the inputs stay
// controlled; coerced at submit (kitchen_capacity → number, blank optionals → omitted).
interface NewTruckForm {
  name: string
  slug: string
  kind: 'operator' | 'demo'
  visibility: 'hidden' | 'public'
  contactEmail: string
  cuisineType: string
  vanName: string
  kitchenCapacity: string
}

const NEW_TRUCK_DEFAULTS: NewTruckForm = {
  name: '',
  slug: '',
  kind: 'operator',
  visibility: 'hidden',   // fail-safe — going public is an explicit act (see §4.3 of the onboarding spec)
  contactEmail: '',
  cuisineType: '',
  vanName: 'Van 1',
  kitchenCapacity: '5',
}

// The endpoint's error shape. `code` distinguishes 400 validation/reserved-prefix from 409
// unique-exhausted; `orphanTruckId` appears ONLY when a truck row was created and the compensating
// delete also failed — i.e. a real row is stranded and needs manual cleanup.
interface NewTruckError {
  message: string
  code?: string
  status: number
  orphanTruckId?: string
}

// ── Delete truck ─────────────────────────────────────────────────────────────────────────────────────
// The dry-run payload from GET /api/admin/delete-truck — real row counts, so the confirm screen shows what
// is actually about to be destroyed rather than a bland "are you sure?".
interface DeleteImpactRow { label: string; count: number | null }

interface DeleteTarget {
  truck: Pick<AdminTruck, 'id' | 'name' | 'slug' | 'operator_id' | 'plan' | 'active' | 'excluded'>
  impact: DeleteImpactRow[]
  requiresOperatorOverride: boolean
}

interface DeleteFailure {
  message: string
  code?: string
  failedStep?: string
  partial?: boolean
}

interface CreateTruckResponse {
  truck: {
    id: string
    slug: string
    name: string
    plan: Plan
    dashboard_token: string
    active: boolean
    excluded: boolean
    show_on_vf: boolean
    show_on_hg: boolean
  }
  van: { id: string; name: string; kds_token: string | null } | null
  urls: { manage: string; dashboard: string; order: string }
  warnings: string[]
}

const PLAN_ORDER: Plan[] = ['starter', 'trial', 'tester', 'demo', 'pro', 'max']

const OVERRIDEABLE_FEATURES: Feature[] = [
  'cook_screen',
  'multi_device_kds',
  'online_payments',
  'advance_preordering',
  'ticket_printing',
]

const PLAN_BADGE: Record<Plan, string> = {
  starter: 'bg-slate-100 text-slate-600',
  trial:   'bg-teal-100 text-teal-700',
  tester:  'bg-purple-100 text-purple-700',
  demo:    'bg-pink-100 text-pink-700',
  pro:     'bg-blue-100 text-blue-700',
  max:     'bg-orange-100 text-orange-700',
}
// Presentation-only pseudo-plan for scraped discovery rows (NOT in the Plan enum; derived from row type).
const DISCOVERY_BADGE = 'bg-slate-100 text-slate-500'

export default function AdminPage() {
  const router = useRouter()
  const [checkingSession, setCheckingSession] = useState(true)
  const [denied, setDenied] = useState(false)
  const [operatorName, setOperatorName] = useState<string | null>(null)
  const [trucks, setTrucks] = useState<AdminTruck[]>([])
  const [discoveryTrucks, setDiscoveryTrucks] = useState<DiscoveryTruck[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [adminTab, setAdminTab] = useState<'trucks' | 'features'>('trucks')
  const [truckSearch, setTruckSearch] = useState('')
  const [planFilter, setPlanFilter] = useState<Plan | 'discovery' | ''>('')
  const [customersOnly, setCustomersOnly] = useState(false)   // Customers = non-Discovery (operator trucks)

  const [editingTruck, setEditingTruck] = useState<AdminTruck | null>(null)
  const [modalEdits, setModalEdits] = useState<Partial<AdminTruck>>({})
  const [modalSaving, setModalSaving] = useState(false)

  const [createModalTruck, setCreateModalTruck] = useState<AdminTruck | null>(null)
  const [createEmail, setCreateEmail] = useState('')
  const [createLoading, setCreateLoading] = useState(false)
  const [createdPassword, setCreatedPassword] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)

  // ── CREATE TRUCK (POST /api/admin/create-truck → lib/provision-truck) ──────────────────────────────
  // This replaces hand-written SQL as the way trucks get created. Trucks are created HIDDEN by default
  // (excluded=true, show_on_hg=false) — a deliberate behaviour change from the SQL path, surfaced in the
  // form so it can't surprise anyone. The result panel echoes the visibility flags back as proof.
  const [showNewTruck, setShowNewTruck] = useState(false)
  const [newTruck, setNewTruck] = useState<NewTruckForm>({ ...NEW_TRUCK_DEFAULTS })
  const [newTruckLoading, setNewTruckLoading] = useState(false)
  const [newTruckError, setNewTruckError] = useState<NewTruckError | null>(null)
  const [newTruckResult, setNewTruckResult] = useState<CreateTruckResponse | null>(null)
  const [tokenCopied, setTokenCopied] = useState(false)

  // ── DELETE TRUCK (POST /api/admin/delete-truck → lib/delete-truck) ────────────────────────────────
  // Deliberately NOT a per-row button: a one-click delete in a dense table that also lists a live trading
  // operator is an accident waiting to happen. Reached from the edit modal's Danger zone instead, so you
  // have already opened a specific truck, then gated behind a typed slug + (if an operator is attached) an
  // explicit override. Every guard is re-checked server-side.
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)   // dry-run fetch
  const [deleteTyped, setDeleteTyped] = useState('')
  const [deleteOverride, setDeleteOverride] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)         // the destructive call itself
  const [deleteFailure, setDeleteFailure] = useState<DeleteFailure | null>(null)


  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000) }

  const load = async () => {
    setLoading(true)
    try {
      const h = await nativeAuthHeader()
      const [res, discRes] = await Promise.all([
        fetch('/api/admin', { headers: h }),
        fetch('/api/admin?section=discovery', { headers: h }),
      ])
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setTrucks(data.trucks)
      if (discRes.ok) {
        const discData = await discRes.json()
        setDiscoveryTrucks(discData.discoveryTrucks || [])
      }
      setCheckingSession(false)
    } catch (e: any) { alert(e.message || 'Failed to load') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    // Thread the native Bearer (if any) through check_admin + auth/me so the app can reach the console; on
    // web nativeAuthHeader() is {} → same requests as before.
    nativeAuthHeader().then(h =>
      fetch('/api/admin?section=check_admin', { headers: h })
        .then(r => r.json())
        .then(d => {
          if (d.isAdmin) {
            load()
            fetch('/api/auth/me', { headers: h }).then(r => r.json()).then(me => {
              setOperatorName(me.first_name || me.name || null)
            }).catch(() => null)
          } else { setCheckingSession(false); setDenied(true) }
        })
    ).catch(() => { setCheckingSession(false); setDenied(true) })
  }, [])

  const update = async (truckId: string, updates: Record<string, any>) => {
    setSaving(truckId)
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...await nativeAuthHeader() },
        body: JSON.stringify({ truckId, ...updates }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setTrucks(prev => prev.map(t => t.id === truckId ? { ...t, ...updates } : t))
      showToast('Saved')
    } catch (e: any) { alert(e.message) }
    finally { setSaving(null) }
  }

  // Inline per-field update for an OPERATOR truck (writes trucks.*). Mirrors updateDiscovery so the unified
  // table's tickboxes dispatch to the correct table by row type.
  const updateTruck = async (truckId: string, patch: Partial<Pick<AdminTruck, 'show_on_vf' | 'show_on_hg' | 'order_link_vf' | 'order_link_hg' | 'excluded' | 'active'>>) => {
    setSaving(truckId)
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...await nativeAuthHeader() },
        body: JSON.stringify({ truckId, ...patch }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setTrucks(prev => prev.map(t => (t.id === truckId ? { ...t, ...patch } : t)))
      showToast('Saved')
    } catch (e: any) { alert(e.message) }
    finally { setSaving(null) }
  }

  const updateDiscovery = async (discoveryTruckId: string, patch: Partial<Pick<DiscoveryTruck, 'show_on_vf' | 'show_on_hg' | 'excluded'>>) => {
    setSaving(discoveryTruckId)
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...await nativeAuthHeader() },
        body: JSON.stringify({ discoveryTruckId, ...patch }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setDiscoveryTrucks(prev => prev.map(t =>
        t.id === discoveryTruckId ? { ...t, ...patch } : t
      ))
      showToast('Saved')
    } catch (e: any) { alert(e.message) }
    finally { setSaving(null) }
  }


  const openEditModal = (truck: AdminTruck) => {
    setEditingTruck(truck)
    setModalEdits({
      plan: truck.plan,
      active: truck.active,
      trial_expires_at: truck.trial_expires_at,
      feature_overrides: truck.feature_overrides ? { ...truck.feature_overrides } : {},
      lifetime_discount_pct: truck.lifetime_discount_pct,
      lifetime_discount_note: truck.lifetime_discount_note,
    })
  }

  const saveModal = async () => {
    if (!editingTruck) return
    setModalSaving(true)
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...await nativeAuthHeader() },
        body: JSON.stringify({ truckId: editingTruck.id, ...modalEdits }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setTrucks(prev => prev.map(t => t.id === editingTruck.id ? { ...t, ...modalEdits } : t))
      showToast('Saved')
      setEditingTruck(null)
    } catch (e: any) { alert(e.message) }
    finally { setModalSaving(false) }
  }

  const openCreateModal = (truck: AdminTruck) => {
    setCreateModalTruck(truck)
    setCreateEmail(truck.contact_email || '')
    setCreatedPassword(null)
    setCreateError(null)
  }

  const openNewTruck = () => {
    setNewTruck({ ...NEW_TRUCK_DEFAULTS })
    setNewTruckError(null)
    setNewTruckResult(null)
    setTokenCopied(false)
    setShowNewTruck(true)
  }

  // A demo truck's name is generated internally (and never shown to the visitor), so it's required only
  // for an operator truck — mirroring profile.nameRequired in lib/provision-truck.ts.
  const newTruckNameOk = newTruck.kind === 'demo' || !!newTruck.name.trim()

  const submitNewTruck = async () => {
    if (!newTruckNameOk) return
    setNewTruckLoading(true)
    setNewTruckError(null)
    try {
      const capacity = Number(newTruck.kitchenCapacity)
      const res = await fetch('/api/admin/create-truck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...await nativeAuthHeader() },
        body: JSON.stringify({
          kind: newTruck.kind,
          ...(newTruck.name.trim() ? { name: newTruck.name.trim() } : {}),
          // Blank optionals are OMITTED, not sent as '' — the module derives the slug from the name and
          // treats absent contact/cuisine as null.
          ...(newTruck.slug.trim() ? { slug: newTruck.slug.trim() } : {}),
          ...(newTruck.contactEmail.trim() ? { contactEmail: newTruck.contactEmail.trim() } : {}),
          ...(newTruck.cuisineType.trim() ? { cuisineType: newTruck.cuisineType.trim() } : {}),
          visibility: newTruck.visibility,
          van: {
            name: newTruck.vanName.trim() || 'Van 1',
            ...(Number.isFinite(capacity) && capacity > 0 ? { kitchen_capacity: capacity } : {}),
          },
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setNewTruckError({
          message: data.error || 'Truck creation failed',
          code: data.code,
          status: res.status,
          orphanTruckId: data.orphanTruckId,
        })
        return
      }
      setNewTruckResult(data as CreateTruckResponse)
      await load()   // refresh the list so the new truck appears in the table behind the modal
    } catch (e) {
      setNewTruckError({ message: e instanceof Error ? e.message : 'Network error', status: 0 })
    } finally {
      setNewTruckLoading(false)
    }
  }

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token)
    setTokenCopied(true)
    setTimeout(() => setTokenCopied(false), 2000)
  }

  // Opens the delete confirmation by first running the DRY RUN, so the confirm screen can state the real
  // blast radius. Closes the edit modal (nested modals fight over z-index and read badly).
  const openDeleteTruck = async (truck: AdminTruck) => {
    setDeleteLoading(true)
    setDeleteTyped('')
    setDeleteOverride(false)
    setDeleteFailure(null)
    setEditingTruck(null)
    try {
      const res = await fetch(`/api/admin/delete-truck?truckId=${encodeURIComponent(truck.id)}`, {
        headers: await nativeAuthHeader(),
      })
      const data = await res.json()
      if (!res.ok) { showToast(data.error || 'Could not load delete details'); return }
      setDeleteTarget(data as DeleteTarget)
    } catch {
      showToast('Could not load delete details')
    } finally {
      setDeleteLoading(false)
    }
  }

  const closeDeleteTruck = () => {
    setDeleteTarget(null)
    setDeleteTyped('')
    setDeleteOverride(false)
    setDeleteFailure(null)
  }

  const submitDeleteTruck = async () => {
    if (!deleteTarget) return
    setDeleteBusy(true)
    setDeleteFailure(null)
    try {
      const res = await fetch('/api/admin/delete-truck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...await nativeAuthHeader() },
        body: JSON.stringify({
          truckId: deleteTarget.truck.id,
          confirmSlug: deleteTyped.trim(),
          allowOperatorDelete: deleteOverride,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setDeleteFailure({
          message: data.error || 'Delete failed',
          code: data.code,
          failedStep: data.failedStep,
          partial: data.partial === true,
        })
        return
      }
      showToast(`Deleted ${data.name || data.truckId}`)
      closeDeleteTruck()
      await load()
    } catch (e) {
      setDeleteFailure({ message: e instanceof Error ? e.message : 'Network error' })
    } finally {
      setDeleteBusy(false)
    }
  }

  // The slug (or id, when slug is null) the admin must type — mirrors the server's own expectation.
  const deleteExpected = deleteTarget ? (deleteTarget.truck.slug || deleteTarget.truck.id) : ''
  const deleteConfirmOk = !!deleteTarget
    && deleteTyped.trim().toLowerCase() === deleteExpected.toLowerCase()
    && (!deleteTarget.requiresOperatorOverride || deleteOverride)

  const submitCreateOperator = async () => {
    if (!createModalTruck || !createEmail) return
    setCreateLoading(true)
    setCreateError(null)
    const res = await fetch('/api/admin/create-operator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...await nativeAuthHeader() },
      body: JSON.stringify({ truckId: createModalTruck.id, email: createEmail }),
    })
    const data = await res.json()
    setCreateLoading(false)
    if (data.ok) {
      setCreatedPassword(data.tempPassword)
      setTrucks(prev => prev.map(t =>
        t.id === createModalTruck.id ? { ...t, operator_id: data.operatorId } : t
      ))
    } else {
      setCreateError(data.error || 'Something went wrong')
    }
  }

  const setModalTrial = (months: 1 | 3) => {
    const expires = new Date()
    expires.setMonth(expires.getMonth() + months)
    setModalEdits(prev => ({ ...prev, plan: 'trial', trial_expires_at: expires.toISOString() }))
  }
  // Custom trial end date from the date picker. Sets it to end-of-day so the trial lasts
  // THROUGH the chosen date. Selecting a date here makes neither month preset "active" (the
  // preset highlight is computed from the stored expiry below), so the 1/3-month chips deselect.
  const setModalTrialDate = (dateStr: string) => {
    if (!dateStr) return
    const expires = new Date(`${dateStr}T23:59:59`)
    setModalEdits(prev => ({ ...prev, plan: 'trial', trial_expires_at: expires.toISOString() }))
  }

  if (checkingSession) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-slate-400 text-sm animate-pulse">Loading...</div>
    </div>
  )

  if (denied) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-2xl text-center">
        <div className="text-3xl mb-3">🔐</div>
        <h1 className="font-black text-slate-900 text-lg mb-2">Access denied</h1>
        <p className="text-sm text-slate-500 mb-6">Your account does not have admin access.</p>
        <button
          onClick={() => operatorSignOut(router)}
          className="w-full bg-slate-900 text-white font-bold py-2.5 rounded-xl hover:bg-slate-700"
        >
          Sign out
        </button>
      </div>
    </div>
  )

  // Unified rows over BOTH sources, normalized to a common shape with a `kind` discriminant. Discovery rows
  // present plan="Discovery" (derived from kind — NOT stored). Each tickbox dispatches to updateTruck /
  // updateDiscovery by kind.
  type UnifiedRow =
    | { kind: 'operator'; id: string; name: string; op: AdminTruck }
    | { kind: 'discovery'; id: string; name: string; dt: DiscoveryTruck }
  const unifiedRows: UnifiedRow[] = [
    ...trucks.map((t): UnifiedRow => ({ kind: 'operator', id: t.id, name: t.name, op: t })),
    // A discovery_trucks row WITH hatchgrab_truck_id set is an operator truck's linking-shadow — the
    // structural row that carries scraped events into that operator's truck_events + suppresses the raw
    // scraped copies (see reference-manual §33). It is NOT a separate truck: it must NOT render as its own
    // admin row, or the operator shows twice. Fold it behind the operator row (display-only; the shadow row
    // STAYS in the DB — it is load-bearing, do not delete). Unlinked discovery rows (pure discovery) render
    // as normal.
    ...discoveryTrucks
      .filter(t => !t.hatchgrab_truck_id)
      .map((t): UnifiedRow => ({ kind: 'discovery', id: t.id, name: t.name, dt: t })),
  ]
  const filteredRows = unifiedRows.filter(r => {
    if (truckSearch && !r.name.toLowerCase().includes(truckSearch.toLowerCase())) return false
    if (customersOnly && r.kind !== 'operator') return false
    if (planFilter === 'discovery' && r.kind !== 'discovery') return false
    if (planFilter && planFilter !== 'discovery' && (r.kind !== 'operator' || r.op.plan !== planFilter)) return false
    return true
  })

  const currentModalPlan = (modalEdits.plan ?? editingTruck?.plan) as Plan | undefined
  const modalTrialExpiry = modalEdits.trial_expires_at ? new Date(modalEdits.trial_expires_at) : null
  const modalTrialExpired = modalTrialExpiry ? modalTrialExpiry < new Date() : false
  const modalTrialDays = modalTrialExpiry
    ? Math.max(0, Math.ceil((modalTrialExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0
  // Which preset (if any) the current expiry matches — drives the chip "selected" highlight.
  // A custom picked date matches neither, so both chips show as deselected.
  const presetYMD = (months: 1 | 3) => { const d = new Date(); d.setMonth(d.getMonth() + months); return d.toISOString().slice(0, 10) }
  const modalExpiryYMD = modalTrialExpiry ? modalTrialExpiry.toISOString().slice(0, 10) : null
  const isTrialPreset1 = !!modalExpiryYMD && modalExpiryYMD === presetYMD(1)
  const isTrialPreset3 = !!modalExpiryYMD && modalExpiryYMD === presetYMD(3)

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader truckName="Admin" truckLogoUrl={null} subtitle="Platform admin">
        <UserMenu
          truckName={null}
          operatorName={operatorName}
          token=""
          isAdmin={false}
        />
      </AppHeader>

      {/* Tab bar */}
      <div className="sticky top-[51px] z-40 bg-slate-900 border-b border-slate-700 overflow-x-auto">
        <div className={"w-full min-[1400px]:max-w-5xl min-[1400px]:mx-auto px-4 flex gap-1 overflow-x-auto"}>
          {(['trucks', 'features'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setAdminTab(tab)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-bold whitespace-nowrap border-b-2 transition-colors ${
                adminTab === tab
                  ? 'border-orange-500 text-white'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              <span>{tab === 'trucks' ? '🚚' : '📋'}</span>{tab === 'trucks' ? 'Trucks' : 'Features'}
            </button>
          ))}
        </div>
      </div>

      <div className={"w-full min-[1400px]:max-w-6xl min-[1400px]:mx-auto px-4 py-6"}>

        {/* Features tab */}
        {adminTab === 'features' && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
            <table className="text-xs w-full">
              <thead>
                <tr className="text-left border-b border-slate-100">
                  <th className="px-4 py-3 text-slate-500 font-bold">Feature</th>
                  {PLAN_ORDER.map(p => (
                    <th key={p} className="px-3 py-3 text-slate-500 font-bold text-center">
                      <span className="block">{PLAN_META[p].name}</span>
                      <span className="block text-[10px] font-normal text-slate-400">
                        {p === 'tester' ? 'Lifetime discount' : PLAN_PRICES[p]}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Transaction fees */}
                <tr className="bg-slate-50">
                  <td colSpan={PLAN_ORDER.length + 1} className="px-4 py-2 text-xs font-bold text-slate-500 uppercase tracking-wide border-t border-slate-100">
                    Transaction fees
                  </td>
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-700">Walk-up orders</td>
                  {PLAN_ORDER.map(p => (
                    <td key={p} className="px-3 py-2 text-center text-slate-600 font-medium">0%</td>
                  ))}
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-700">Online orders</td>
                  {PLAN_ORDER.map(p => (
                    <td key={p} className="px-3 py-2 text-center text-slate-600 font-medium">
                      {(p === 'starter' || p === 'trial' || p === 'tester') ? 'Pay at Hatch' : '0.99% + card fee'}
                    </td>
                  ))}
                </tr>
                {/* Feature sections from FEATURE_SECTIONS */}
                {FEATURE_SECTIONS.flatMap(section => [
                  <tr key={`section-${section.title}`} className="bg-slate-50">
                    <td colSpan={PLAN_ORDER.length + 1} className="px-4 py-2 text-xs font-bold text-slate-500 uppercase tracking-wide border-t border-slate-100">
                      {section.title}
                    </td>
                  </tr>,
                  ...section.rows.map(row => (
                    <tr key={`row-${row.name}`} className="border-t border-slate-100">
                      <td className="px-4 py-2 text-slate-700">
                        {row.name}
                        {row.footnote && <sup className="text-slate-400 ml-0.5">{row.footnote}</sup>}
                      </td>
                      {PLAN_ORDER.map(p => {
                        const isPayAtHatch = row.name === 'Online ordering — Pay at Hatch'
                        const val = p === 'starter' ? row.starter
                          : (p === 'trial' || p === 'tester') && isPayAtHatch ? true
                          : p === 'pro' ? row.pro
                          : row.max
                        return (
                          <td key={p} className="px-3 py-2 text-center">
                            {val === true && <span className="text-green-500 font-black">✓</span>}
                            {val === false && <span className="text-slate-200">—</span>}
                            {val === 'coming_soon' && <span className="text-[10px] text-slate-400 italic">Coming soon</span>}
                          </td>
                        )
                      })}
                    </tr>
                  )),
                ])}
              </tbody>
            </table>
            <div className="px-4 py-4 border-t border-slate-100 flex flex-col gap-1.5">
              {FOOTNOTES.map(f => (
                <p key={f.number} className="text-xs text-slate-500">
                  <sup>{f.number}</sup> {f.text}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Trucks tab — ONE unified table over operator (trucks) + discovery (discovery_trucks) sources. */}
        {adminTab === 'trucks' && (
          <div>
            <div className="flex gap-3 mb-4 flex-wrap items-center">
              <input
                type="text"
                placeholder="Search trucks…"
                value={truckSearch}
                onChange={e => setTruckSearch(e.target.value)}
                className="flex-1 min-w-[180px] border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
              <select
                value={planFilter}
                onChange={e => setPlanFilter(e.target.value as Plan | 'discovery' | '')}
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
              >
                <option value="">All plans</option>
                {PLAN_ORDER.map(p => (
                  <option key={p} value={p}>{PLAN_META[p].name}</option>
                ))}
                <option value="discovery">Discovery</option>
              </select>
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer whitespace-nowrap">
                <input type="checkbox" checked={customersOnly} onChange={e => setCustomersOnly(e.target.checked)} className="w-4 h-4 accent-orange-500" />
                Customers only
              </label>
              <span className="text-xs text-slate-400">{filteredRows.length} trucks</span>
              <button
                onClick={openNewTruck}
                className="ml-auto whitespace-nowrap text-sm px-3.5 py-2 bg-orange-600 text-white rounded-xl font-semibold hover:bg-orange-700"
              >
                ＋ Create truck
              </button>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-auto max-h-[70vh]">
              <table className="w-full text-sm border-collapse table-fixed">
                <colgroup>
                  <col style={{ width: '11rem' }} />{/* Name — fixed base so it never collapses to 0 on mobile (table-fixed); flexes wider on desktop */}
                  <col style={{ width: '5rem' }} />{/* Active */}
                  <col style={{ width: '6rem' }} />{/* Plan */}
                  <col style={{ width: '5rem' }} />{/* VF · Map */}
                  <col style={{ width: '5rem' }} />{/* VF · Ordering */}
                  <col style={{ width: '5rem' }} />{/* HG · Map */}
                  <col style={{ width: '5rem' }} />{/* HG · Ordering */}
                  <col style={{ width: '5rem' }} />{/* Exclude? */}
                  <col style={{ width: '6rem' }} />{/* Dashboard */}
                  <col style={{ width: '6rem' }} />{/* Manage */}
                  <col style={{ width: '5rem' }} />{/* Actions */}
                </colgroup>
                {/* z-20 + opaque bg on every sticky th → body tickboxes never bleed through the header. */}
                <thead className="text-slate-500 text-xs uppercase tracking-wide">
                  {/* Row 1 — groups (sticky top-0). Site names span the two Map|Ordering sub-columns. */}
                  <tr>
                    <th rowSpan={2} className="sticky top-0 left-0 z-30 h-9 bg-slate-100 text-left font-bold px-3 align-middle">Name</th>
                    <th rowSpan={2} className="sticky top-0 z-20 h-9 bg-slate-100 text-center font-bold px-2 align-middle border-l border-slate-200">Active</th>
                    <th rowSpan={2} className="sticky top-0 z-20 h-9 bg-slate-100 text-left font-bold px-3 align-middle border-l border-slate-200">Plan</th>
                    <th colSpan={2} className="sticky top-0 z-20 h-9 bg-slate-100 text-center font-bold px-2 border-l border-slate-200">Village Foodie</th>
                    <th colSpan={2} className="sticky top-0 z-20 h-9 bg-slate-100 text-center font-bold px-2 border-l border-slate-200">HatchGrab</th>
                    <th rowSpan={2} className="sticky top-0 z-20 h-9 bg-slate-100 text-center font-bold px-2 align-middle border-l border-slate-200">Exclude?</th>
                    <th rowSpan={2} className="sticky top-0 z-20 h-9 bg-slate-100 text-center font-bold px-2 align-middle border-l border-slate-200">Dashboard</th>
                    <th rowSpan={2} className="sticky top-0 z-20 h-9 bg-slate-100 text-center font-bold px-2 align-middle border-l border-slate-200">Manage</th>
                    <th rowSpan={2} className="sticky top-0 z-20 h-9 bg-slate-100 text-center font-bold px-2 align-middle border-l border-slate-200">Actions</th>
                  </tr>
                  {/* Row 2 — sub-columns (sticky top-9 = below row 1). */}
                  <tr>
                    <th className="sticky top-9 z-20 h-8 bg-slate-100 text-center font-medium px-2 border-l border-slate-200">Map</th>
                    <th className="sticky top-9 z-20 h-8 bg-slate-100 text-center font-medium px-2">Ordering</th>
                    <th className="sticky top-9 z-20 h-8 bg-slate-100 text-center font-medium px-2 border-l border-slate-200">Map</th>
                    <th className="sticky top-9 z-20 h-8 bg-slate-100 text-center font-medium px-2">Ordering</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map(r => {
                    const isOp = r.kind === 'operator'
                    const excluded = isOp ? r.op.excluded : r.dt.excluded
                    const showVf = isOp ? r.op.show_on_vf : r.dt.show_on_vf
                    const showHg = isOp ? r.op.show_on_hg : r.dt.show_on_hg
                    const busy = saving === r.id
                    const na = <span className="text-slate-300">—</span>
                    // All toggles share ONE style — orange accent; `dim` (excluded) greys + disables.
                    const box = (checked: boolean, dim: boolean, onChange: (v: boolean) => void) => (
                      <input type="checkbox" checked={checked} disabled={busy || dim}
                        className={`w-4 h-4 accent-orange-500 ${dim ? 'opacity-40' : ''}`}
                        onChange={e => onChange(e.target.checked)} />
                    )
                    const linkBtn = (href: string, label: string) => (
                      <AppLink href={href} target="_blank" rel="noopener noreferrer"
                        className="inline-block text-xs px-2.5 py-1 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50">{label}</AppLink>
                    )
                    const opNav = isOp && r.op.operator_id && r.op.dashboard_token
                    return (
                      <tr key={`${r.kind}-${r.id}`} className="group border-t border-slate-100 hover:bg-slate-50/60">
                        {/* Name — sticky-left so it stays visible while the wide table scrolls horizontally on mobile */}
                        <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 px-3 py-2 truncate">
                          <span className="font-bold text-slate-900">{r.name}</span>
                          {isOp && !r.op.active && (
                            <span className="ml-2 text-[10px] bg-red-100 text-red-600 font-bold px-1.5 py-0.5 rounded-full">Inactive</span>
                          )}
                          {isOp && r.op.lifetime_discount_pct != null && (
                            <span className="ml-2 text-[10px] font-bold text-green-700 bg-green-50 px-1.5 py-0.5 rounded-full">💚 {r.op.lifetime_discount_pct}%</span>
                          )}
                        </td>
                        {/* Active — ON-AIR kill-switch (operator only). Confirm before taking a truck OFFLINE
                            (active=false blocks ordering + hides from the public map + removes from the app). */}
                        <td className="text-center px-2 py-2 border-l border-slate-100">
                          {isOp
                            ? <input type="checkbox" checked={r.op.active} disabled={busy}
                                className="w-4 h-4 accent-green-600"
                                onChange={e => {
                                  const next = e.target.checked
                                  if (!next && !window.confirm(`Take ${r.name} offline? This immediately stops customer ordering and hides it from the public map.`)) return
                                  updateTruck(r.id, { active: next })
                                }} />
                            : na}
                        </td>
                        {/* Plan (Discovery derived for scraped rows) */}
                        <td className="px-3 py-2">
                          {isOp
                            ? <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${PLAN_BADGE[r.op.plan]}`}>{PLAN_META[r.op.plan].name}</span>
                            : <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${DISCOVERY_BADGE}`}>Discovery</span>}
                        </td>
                        {/* VF · Map */}
                        <td className="text-center px-2 py-2 border-l border-slate-100">
                          {box(showVf, excluded, v => isOp ? updateTruck(r.id, { show_on_vf: v }) : updateDiscovery(r.id, { show_on_vf: v }))}
                        </td>
                        {/* VF · Ordering — operator only */}
                        <td className="text-center px-2 py-2">
                          {isOp ? box(r.op.order_link_vf, excluded, v => updateTruck(r.id, { order_link_vf: v })) : na}
                        </td>
                        {/* HG · Map */}
                        <td className="text-center px-2 py-2 border-l border-slate-100">
                          {box(showHg, excluded, v => isOp ? updateTruck(r.id, { show_on_hg: v }) : updateDiscovery(r.id, { show_on_hg: v }))}
                        </td>
                        {/* HG · Ordering — operator only */}
                        <td className="text-center px-2 py-2">
                          {isOp ? box(r.op.order_link_hg, excluded, v => updateTruck(r.id, { order_link_hg: v })) : na}
                        </td>
                        {/* Exclude? — master hide (same orange toggle), moved before Dashboard */}
                        <td className="text-center px-2 py-2 border-l border-slate-100">
                          {box(excluded, false, v => isOp ? updateTruck(r.id, { excluded: v }) : updateDiscovery(r.id, { excluded: v }))}
                        </td>
                        {/* Dashboard — operator only */}
                        <td className="text-center px-2 py-2 border-l border-slate-100">
                          {opNav ? linkBtn(`/dashboard/${r.op.dashboard_token}`, '🖥') : na}
                        </td>
                        {/* Manage — operator only (/manage/[dashboard_token]) */}
                        <td className="text-center px-2 py-2 border-l border-slate-100">
                          {opNav ? linkBtn(`/manage/${r.op.dashboard_token}`, '⚙️') : na}
                        </td>
                        {/* Actions — Edit (operator only) */}
                        <td className="text-center px-2 py-2 border-l border-slate-100">
                          {isOp
                            ? <button onClick={() => openEditModal(r.op)}
                                className="text-xs px-2.5 py-1 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50">Edit</button>
                            : na}
                          {busy && <span className="ml-1 text-xs text-slate-400 animate-pulse">…</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg z-50">
          ✓ {toast}
        </div>
      )}

      {/* Truck edit modal */}
      {editingTruck && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{editingTruck.name}</h3>
              {editingTruck.slug && <p className="text-xs text-slate-400 mt-0.5">{editingTruck.slug}</p>}
            </div>

            {/* Plan selector */}
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Plan</p>
              <div className="flex gap-1 flex-wrap">
                {PLAN_ORDER.map(p => (
                  <button
                    key={p}
                    onClick={() => setModalEdits(prev => ({
                      ...prev,
                      plan: p,
                      trial_expires_at: p !== 'trial' ? null : prev.trial_expires_at,
                    }))}
                    className={`text-xs px-2.5 py-1 rounded-lg font-bold transition-colors ${
                      currentModalPlan === p ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {PLAN_META[p].name}
                  </button>
                ))}
              </div>
              {currentModalPlan === 'trial' && (
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <button onClick={() => setModalTrial(1)}
                    className={`text-xs font-bold px-2 py-1 rounded-lg transition-colors ${
                      isTrialPreset1 ? 'bg-slate-900 text-white' : 'bg-teal-50 text-teal-700 hover:bg-teal-100'
                    }`}>
                    1 month
                  </button>
                  <button onClick={() => setModalTrial(3)}
                    className={`text-xs font-bold px-2 py-1 rounded-lg transition-colors ${
                      isTrialPreset3 ? 'bg-slate-900 text-white' : 'bg-teal-50 text-teal-700 hover:bg-teal-100'
                    }`}>
                    3 months
                  </button>
                  <input
                    type="date"
                    value={modalExpiryYMD ?? ''}
                    onChange={e => setModalTrialDate(e.target.value)}
                    className="text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                  {modalTrialExpiry && (
                    <span className={`text-xs font-bold ${
                      modalTrialExpired ? 'text-red-500' : modalTrialDays <= 7 ? 'text-orange-500' : 'text-teal-600'
                    }`}>
                      {modalTrialExpired ? 'Expired' : `${modalTrialDays}d remaining`}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Active + Test toggles */}
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={modalEdits.active ?? editingTruck.active}
                  onChange={e => setModalEdits(prev => ({ ...prev, active: e.target.checked }))}
                  className="w-4 h-4 accent-orange-500"
                />
                <span className="text-sm font-medium text-slate-700">Active</span>
              </label>
            </div>

            {/* NB: VF/HG · Orders VF/HG · Excluded are edited INLINE in the unified trucks table now, not here. */}

            {/* Lifetime discount */}
            <div className="border border-slate-200 rounded-xl p-3 space-y-2">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Lifetime discount</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Lifetime subscription discount</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={modalEdits.lifetime_discount_pct ?? editingTruck.lifetime_discount_pct ?? ''}
                    onChange={e => setModalEdits(prev => ({
                      ...prev,
                      lifetime_discount_pct: e.target.value === '' ? null : parseInt(e.target.value),
                    }))}
                    placeholder="e.g. 50"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Discount note</label>
                  <input
                    type="text"
                    value={modalEdits.lifetime_discount_note ?? editingTruck.lifetime_discount_note ?? ''}
                    onChange={e => setModalEdits(prev => ({
                      ...prev,
                      lifetime_discount_note: e.target.value || null,
                    }))}
                    placeholder="e.g. Pre-launch tester"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>
              </div>
              <p className="text-[10px] text-slate-400">0.99% transaction fee still applies at standard rate</p>
            </div>

            {/* Feature overrides */}
            <details className="text-xs">
              <summary className="text-slate-400 cursor-pointer select-none hover:text-slate-600 font-medium">
                Feature overrides
                {Object.keys(modalEdits.feature_overrides ?? editingTruck.feature_overrides ?? {}).length > 0 && (
                  <span className="ml-1 text-orange-500 font-bold">
                    ({Object.keys(modalEdits.feature_overrides ?? editingTruck.feature_overrides ?? {}).length} active)
                  </span>
                )}
              </summary>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 pl-2">
                {OVERRIDEABLE_FEATURES.map(f => (
                  <label key={f} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(modalEdits.feature_overrides ?? editingTruck.feature_overrides ?? {})[f] === true}
                      onChange={e => {
                        const next = { ...(modalEdits.feature_overrides ?? editingTruck.feature_overrides ?? {}) }
                        if (e.target.checked) next[f] = true
                        else delete next[f]
                        setModalEdits(prev => ({ ...prev, feature_overrides: next }))
                      }}
                      className="w-3.5 h-3.5 accent-orange-500"
                    />
                    <span className="text-slate-600">{f}</span>
                  </label>
                ))}
              </div>
            </details>

            {/* Scraper settings */}
            <div className="space-y-3 pt-1 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Scraper</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Preference</label>
                  <p className="text-sm text-slate-800">{editingTruck.scraper_preference ?? 'manual'}</p>
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Schedule URL</label>
                  {editingTruck.schedule_url
                    ? <a href={editingTruck.schedule_url} target="_blank" rel="noreferrer" className="text-sm text-orange-600 hover:underline truncate block max-w-[160px]">{editingTruck.schedule_url}</a>
                    : <p className="text-sm text-slate-400">—</p>
                  }
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Scraper rule override</label>
                <select
                  value={modalEdits.scraper_rule ?? editingTruck.scraper_rule ?? ''}
                  onChange={e => setModalEdits(prev => ({ ...prev, scraper_rule: (e.target.value || null) as 'scroll_lazy' | 'scroll_next' | null }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">(auto-detect on next run)</option>
                  <option value="scroll_lazy">scroll_lazy</option>
                  <option value="scroll_next">scroll_next</option>
                </select>
              </div>
            </div>

            {/* Scraper intelligence — read-only */}
            {(editingTruck.scraper_preference === 'auto' || editingTruck.scraper_preference === 'both') && (() => {
              const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
              const relDate = (iso: string | null | undefined) => {
                if (!iso) return 'Never'
                const days = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24))
                if (days === 0) return 'Today'
                if (days === 1) return 'Yesterday'
                return `${days} days ago`
              }
              const firstRun = editingTruck.scraper_first_run_at
              const daysRunning = firstRun
                ? Math.floor((Date.now() - new Date(firstRun).getTime()) / (1000 * 60 * 60 * 24))
                : null
              return (
                <div className="space-y-2 pt-1 border-t border-slate-100">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Scraper intelligence</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div>
                      <span className="text-slate-400">Learning phase</span>
                      <p className="text-slate-800 font-medium mt-0.5">
                        {editingTruck.scraper_learning_complete
                          ? 'Complete'
                          : daysRunning !== null ? `${Math.max(0, 30 - daysRunning)} days remaining` : 'Not started'}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-400">Learned update day</span>
                      <p className="text-slate-800 font-medium mt-0.5">
                        {editingTruck.scraper_update_day !== null && editingTruck.scraper_update_day !== undefined
                          ? DAY_NAMES[editingTruck.scraper_update_day]
                          : 'Not yet learned'}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-400">Last schedule change</span>
                      <p className="text-slate-800 font-medium mt-0.5">{relDate(editingTruck.scraper_last_changed_at)}</p>
                    </div>
                    <div>
                      <span className="text-slate-400">Last empty-schedule email</span>
                      <p className="text-slate-800 font-medium mt-0.5">{relDate(editingTruck.scraper_last_empty_notify_at)}</p>
                    </div>
                    {editingTruck.scraper_last_hash && (
                      <div className="col-span-2">
                        <span className="text-slate-400">Last run hash</span>
                        <p className="text-slate-800 font-mono mt-0.5">{editingTruck.scraper_last_hash.slice(0, 8)}</p>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* Operator account */}
            <div>
              {!editingTruck.operator_id ? (
                <button
                  onClick={() => openCreateModal(editingTruck)}
                  className="text-xs px-3 py-1.5 border border-teal-200 text-teal-600 rounded-lg hover:bg-teal-50"
                >
                  + Create operator account
                </button>
              ) : (
                <span className="text-xs text-slate-400">Account linked</span>
              )}
            </div>

            {/* Danger zone — delete lives HERE, not on the table row, so it can only be reached after
                deliberately opening one specific truck. */}
            <div className="border border-red-200 bg-red-50/50 rounded-xl px-3 py-3 mt-1">
              <p className="text-xs font-bold text-red-700 uppercase tracking-wide">Danger zone</p>
              <p className="text-[11px] text-red-600/90 mt-1 leading-relaxed">
                Permanently deletes this truck and everything belonging to it. Irreversible, with no backup.
              </p>
              <button
                onClick={() => openDeleteTruck(editingTruck)}
                disabled={deleteLoading}
                className="mt-2 text-xs px-3 py-1.5 border border-red-300 text-red-700 rounded-lg hover:bg-red-100 disabled:opacity-40"
              >
                {deleteLoading ? 'Loading…' : 'Delete truck…'}
              </button>
              {editingTruck.operator_id && (
                <p className="text-[11px] text-red-700 mt-2">
                  ⚠️ This truck has an <strong>operator account</strong> attached — it is somebody&apos;s live
                  business. Deleting it requires an extra override.
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setEditingTruck(null)}
                className="flex-1 border border-slate-200 text-slate-600 py-3 rounded-xl text-sm"
              >
                Cancel
              </button>
              <button
                onClick={saveModal}
                disabled={modalSaving}
                className="flex-1 bg-slate-900 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-40"
              >
                {modalSaving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create operator modal */}
      {createModalTruck && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 flex flex-col gap-4">
            {!createdPassword ? (
              <>
                <h3 className="text-lg font-semibold text-slate-900">
                  Create account — {createModalTruck.name}
                </h3>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Email address
                  </label>
                  <input
                    type="email"
                    value={createEmail}
                    onChange={e => setCreateEmail(e.target.value)}
                    placeholder="operator@example.com"
                    className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>
                {createError && <p className="text-sm text-red-600">{createError}</p>}
                <div className="flex gap-3">
                  <button
                    onClick={() => setCreateModalTruck(null)}
                    className="flex-1 border border-slate-200 text-slate-600 py-3 rounded-xl text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitCreateOperator}
                    disabled={createLoading || !createEmail}
                    className="flex-1 bg-teal-600 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-40"
                  >
                    {createLoading ? 'Creating...' : 'Create account'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-center">
                  <div className="text-3xl mb-2">✅</div>
                  <h3 className="text-lg font-semibold text-slate-900">Account created</h3>
                  <p className="text-sm text-slate-500 mt-1">{createEmail}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Temporary password — copy this now
                  </label>
                  <div className="mt-1 flex gap-2">
                    <code className="flex-1 bg-slate-100 rounded-xl px-3 py-2.5 text-sm font-mono">
                      {createdPassword}
                    </code>
                    <button
                      onClick={() => navigator.clipboard.writeText(createdPassword!)}
                      className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50"
                    >
                      Copy
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-400 text-center">
                  Send this password to the operator. They&apos;ll be prompted to change it on first login.
                </p>
                <button
                  onClick={() => { setCreateModalTruck(null); setCreatedPassword(null) }}
                  className="w-full bg-slate-900 text-white font-semibold py-3 rounded-xl text-sm"
                >
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Delete truck confirmation ──────────────────────────────────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 flex flex-col gap-4 my-8 border-2 border-red-200">
            <div>
              <h3 className="text-lg font-semibold text-red-700">Delete {deleteTarget.truck.name}</h3>
              <p className="text-xs text-slate-500 mt-1">
                <code className="bg-slate-100 px-1 rounded">{deleteTarget.truck.id}</code>
                {deleteTarget.truck.slug && deleteTarget.truck.slug !== deleteTarget.truck.id && (
                  <> · <code className="bg-slate-100 px-1 rounded">{deleteTarget.truck.slug}</code></>
                )}
              </p>
            </div>

            {/* What actually gets destroyed — real counts from the dry run */}
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-3">
              <p className="text-xs font-bold text-red-800">This permanently destroys:</p>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                {deleteTarget.impact.map(row => (
                  <div key={row.label} className="flex justify-between gap-2 text-xs">
                    <span className="text-red-700/80 truncate">{row.label}</span>
                    <span className={`font-mono font-bold shrink-0 ${
                      row.count === null ? 'text-amber-600' : row.count > 0 ? 'text-red-800' : 'text-red-300'
                    }`}>
                      {row.count === null ? '?' : row.count}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-red-700/80 mt-2.5 leading-relaxed">
                …plus everything else keyed to this truck: stock, slots, capacity usage, discount codes,
                subcategories, upsell rules, KDS sessions, bound devices, WhatsApp logs and the allergen audit
                trail. Roughly 25 tables in total. <strong>There is no backup and no undo.</strong>
              </p>
            </div>

            {/* Operator override — the guard rail */}
            {deleteTarget.requiresOperatorOverride && (
              <label className="flex items-start gap-2.5 bg-amber-50 border border-amber-300 rounded-xl px-3 py-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteOverride}
                  onChange={e => setDeleteOverride(e.target.checked)}
                  className="w-4 h-4 accent-red-600 mt-0.5 shrink-0"
                />
                <span className="text-xs text-amber-900 leading-relaxed">
                  <strong>This truck has an operator account attached.</strong> That normally means a real,
                  possibly trading, business — demo and throwaway trucks have no operator. I understand I am
                  deleting a live account&apos;s truck and want to proceed.
                </span>
              </label>
            )}

            {/* Typed confirmation */}
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Type <code className="bg-slate-100 px-1 rounded normal-case font-mono text-slate-800">{deleteExpected}</code> to confirm
              </label>
              <input
                type="text"
                value={deleteTyped}
                onChange={e => setDeleteTyped(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder={deleteExpected}
                className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-400"
              />
            </div>

            {deleteFailure && (
              <div className="bg-red-100 border border-red-300 rounded-xl px-3 py-2.5">
                <p className="text-sm text-red-800 font-semibold">
                  {deleteFailure.partial ? 'Partially deleted' : 'Delete failed'}
                </p>
                <p className="text-xs text-red-700 mt-1">{deleteFailure.message}</p>
                {deleteFailure.failedStep && (
                  <p className="text-xs text-red-800 mt-2 font-mono bg-red-50 rounded-lg px-2 py-1.5">
                    Failed at step: <strong>{deleteFailure.failedStep}</strong>
                  </p>
                )}
                {deleteFailure.partial && (
                  <p className="text-[11px] text-red-700 mt-2 leading-relaxed">
                    The cascade is a sequence, not a transaction — everything before this step was already
                    deleted, so <strong>this truck is now in a partial state</strong>. Re-running the delete is
                    safe (every step is an idempotent delete-by-truck_id) and is the right next move.
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={closeDeleteTruck}
                disabled={deleteBusy}
                className="flex-1 border border-slate-200 text-slate-600 py-3 rounded-xl text-sm disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={submitDeleteTruck}
                disabled={deleteBusy || !deleteConfirmOk}
                className="flex-1 bg-red-600 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-40 hover:bg-red-700"
              >
                {deleteBusy ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create truck modal ─────────────────────────────────────────────────────────────────────── */}
      {showNewTruck && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 flex flex-col gap-4 my-8">
            {!newTruckResult ? (
              <>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Create truck</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Creates the truck row + a van. Replaces the old hand-written SQL path.
                  </p>
                </div>

                {/* Kind */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Kind</label>
                  <div className="mt-1 flex gap-2">
                    {(['operator', 'demo'] as const).map(k => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setNewTruck(p => ({ ...p, kind: k }))}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border ${
                          newTruck.kind === k
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {k === 'operator' ? 'Operator' : 'Demo'}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    {newTruck.kind === 'operator'
                      ? 'Readable id/slug derived from the name. Plan starts as demo (pre-trial setup mode) — the clock starts at go-live.'
                      : 'Random demo- prefixed id, slug and token (130-bit). Name is generated internally and never shown to the visitor.'}
                  </p>
                </div>

                {/* Name */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Name {newTruck.kind === 'operator' ? '(required)' : '(optional)'}
                  </label>
                  <input
                    type="text"
                    value={newTruck.name}
                    onChange={e => setNewTruck(p => ({ ...p, name: e.target.value }))}
                    placeholder={newTruck.kind === 'demo' ? 'Auto-generated if blank' : 'Real Thai Food'}
                    className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>

                {/* Slug — operator only; a demo's slug is always random */}
                {newTruck.kind === 'operator' && (
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Slug (optional)
                    </label>
                    <input
                      type="text"
                      value={newTruck.slug}
                      onChange={e => setNewTruck(p => ({ ...p, slug: e.target.value }))}
                      placeholder={createSlug(newTruck.name) || 'derived-from-name'}
                      className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                    <p className="text-[11px] text-slate-400 mt-1.5">
                      Leave blank to derive from the name
                      {newTruck.name.trim() && (
                        <> — will be <code className="bg-slate-100 px-1 rounded">{createSlug(newTruck.slug || newTruck.name)}</code></>
                      )}
                      . Used for both the truck id and the public order URL. Collisions get a numeric suffix.
                    </p>
                  </div>
                )}

                {/* Visibility — the behaviour change, made loud */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Visibility</label>
                  <div className="mt-1 flex gap-2">
                    {(['hidden', 'public'] as const).map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setNewTruck(p => ({ ...p, visibility: v }))}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border ${
                          newTruck.visibility === v
                            ? v === 'public'
                              ? 'bg-amber-500 text-white border-amber-500'
                              : 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {v === 'hidden' ? '🔒 Hidden' : '🌍 Public'}
                      </button>
                    ))}
                  </div>
                  {newTruck.visibility === 'hidden' ? (
                    <div className="mt-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        <strong className="text-slate-800">New trucks are created HIDDEN.</strong> This is a change
                        from the old SQL path. Sets <code className="bg-white px-1 rounded">excluded=true</code>,{' '}
                        <code className="bg-white px-1 rounded">show_on_hg=false</code>,{' '}
                        <code className="bg-white px-1 rounded">order_link_hg=false</code> (both of which default to
                        TRUE in the DB). The truck will <strong>not</strong> appear on the map and{' '}
                        <strong>cannot take orders</strong> until you make it visible deliberately — flip the
                        tickboxes in the table, or at go-live.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                      <p className="text-[11px] text-amber-800 leading-relaxed">
                        <strong>⚠️ Public immediately.</strong> The truck will be discoverable on HatchGrab and able
                        to take real customer orders as soon as it has a confirmed event. Only choose this for a
                        truck that is genuinely going live now.
                      </p>
                    </div>
                  )}
                </div>

                {/* Optional details */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Contact email</label>
                    <input
                      type="email"
                      value={newTruck.contactEmail}
                      onChange={e => setNewTruck(p => ({ ...p, contactEmail: e.target.value }))}
                      placeholder="optional"
                      className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Cuisine</label>
                    <input
                      type="text"
                      value={newTruck.cuisineType}
                      onChange={e => setNewTruck(p => ({ ...p, cuisineType: e.target.value }))}
                      placeholder="optional"
                      className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                  </div>
                </div>

                {/* Van */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Van</label>
                  <div className="mt-1 grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={newTruck.vanName}
                      onChange={e => setNewTruck(p => ({ ...p, vanName: e.target.value }))}
                      placeholder="Van 1"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        value={newTruck.kitchenCapacity}
                        onChange={e => setNewTruck(p => ({ ...p, kitchenCapacity: e.target.value }))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                      />
                      <span className="text-xs text-slate-400 whitespace-nowrap">capacity</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    Kitchen capacity is a <strong>concurrency ceiling</strong> — how many counted items can be in
                    production at once — not a rate. Without a van carrying one, no slot capacity is written and the
                    capacity engine stays inert.
                  </p>
                </div>

                {/* Errors */}
                {newTruckError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                    <p className="text-sm text-red-700 font-semibold">
                      {newTruckError.status === 409 ? 'Name/slug already taken'
                        : newTruckError.code === 'reserved_prefix' ? 'Reserved prefix'
                        : newTruckError.status === 400 ? 'Invalid'
                        : 'Creation failed'}
                    </p>
                    <p className="text-xs text-red-600 mt-1">{newTruckError.message}</p>
                    {newTruckError.status === 409 && (
                      <p className="text-xs text-red-500 mt-1">
                        Tried several numeric suffixes without finding a free slug — pick a different name.
                      </p>
                    )}
                    {newTruckError.orphanTruckId && (
                      <p className="text-xs text-red-800 mt-2 font-mono bg-red-100 rounded-lg px-2 py-1.5">
                        ⚠️ ORPHAN — truck <strong>{newTruckError.orphanTruckId}</strong> was created but its van
                        failed AND the rollback failed. It needs manual cleanup.
                      </p>
                    )}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowNewTruck(false)}
                    className="flex-1 border border-slate-200 text-slate-600 py-3 rounded-xl text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitNewTruck}
                    disabled={newTruckLoading || !newTruckNameOk}
                    className="flex-1 bg-orange-600 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-40"
                  >
                    {newTruckLoading ? 'Creating…' : 'Create truck'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-center">
                  <div className="text-3xl mb-2">✅</div>
                  <h3 className="text-lg font-semibold text-slate-900">Truck created</h3>
                  <p className="text-sm text-slate-500 mt-1">{newTruckResult.truck.name}</p>
                </div>

                {/* Identity */}
                <div className="bg-slate-50 rounded-xl px-3 py-2.5 text-xs space-y-1">
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-500">id</span>
                    <code className="font-mono text-slate-800 truncate">{newTruckResult.truck.id}</code>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-500">slug</span>
                    <code className="font-mono text-slate-800 truncate">{newTruckResult.truck.slug}</code>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-500">plan</span>
                    <span className={`px-1.5 rounded font-bold ${PLAN_BADGE[newTruckResult.truck.plan]}`}>
                      {PLAN_META[newTruckResult.truck.plan].name}
                    </span>
                  </div>
                </div>

                {/* Visibility proof — echoed back from the server, not assumed */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Visibility</label>
                  <div className={`mt-1 rounded-xl px-3 py-2.5 border ${
                    newTruckResult.truck.excluded ? 'bg-slate-50 border-slate-200' : 'bg-amber-50 border-amber-200'
                  }`}>
                    <p className="text-sm font-semibold text-slate-800">
                      {newTruckResult.truck.excluded ? '🔒 Created hidden ✓' : '🌍 Created PUBLIC'}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500 font-mono">
                      <span>active={String(newTruckResult.truck.active)}</span>
                      <span>excluded={String(newTruckResult.truck.excluded)}</span>
                      <span>show_on_vf={String(newTruckResult.truck.show_on_vf)}</span>
                      <span>show_on_hg={String(newTruckResult.truck.show_on_hg)}</span>
                    </div>
                  </div>
                </div>

                {/* Van */}
                {newTruckResult.van ? (
                  <div className="text-xs text-slate-600">
                    <span className="font-semibold">Van:</span> {newTruckResult.van.name}{' '}
                    <span className="text-slate-400 font-mono">({newTruckResult.van.id.slice(0, 8)}…)</span>
                  </div>
                ) : (
                  <div className="text-xs text-amber-700">No van created.</div>
                )}

                {/* Dashboard token — shown ONCE */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Dashboard token — copy this now
                  </label>
                  <div className="mt-1 flex gap-2">
                    <code className="flex-1 bg-slate-100 rounded-xl px-3 py-2.5 text-xs font-mono break-all">
                      {newTruckResult.truck.dashboard_token}
                    </code>
                    <button
                      onClick={() => copyToken(newTruckResult.truck.dashboard_token)}
                      className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 whitespace-nowrap"
                    >
                      {tokenCopied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    This token is the truck&apos;s credential — anyone holding it can reach its dashboard. It is not
                    logged anywhere; it is also in the Manage/Dashboard links below.
                  </p>
                </div>

                {/* URLs */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Links</label>
                  <div className="mt-1 flex flex-col gap-1.5">
                    {([
                      ['Manage', newTruckResult.urls.manage],
                      ['Dashboard', newTruckResult.urls.dashboard],
                      ['Order page', newTruckResult.urls.order],
                    ] as const).map(([label, href]) => (
                      <div key={label} className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 w-20 shrink-0">{label}</span>
                        <AppLink
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 text-xs font-mono text-teal-700 hover:underline truncate"
                        >
                          {href}
                        </AppLink>
                      </div>
                    ))}
                  </div>
                </div>

                {newTruckResult.warnings.length > 0 && (
                  <ul className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-[11px] text-amber-800 list-disc list-inside space-y-1">
                    {newTruckResult.warnings.map(w => <li key={w}>{w}</li>)}
                  </ul>
                )}

                <p className="text-[11px] text-slate-400 text-center">
                  Next: create the operator account from this truck&apos;s row in the table.
                </p>
                <button
                  onClick={() => { setShowNewTruck(false); setNewTruckResult(null) }}
                  className="w-full bg-slate-900 text-white font-semibold py-3 rounded-xl text-sm"
                >
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
