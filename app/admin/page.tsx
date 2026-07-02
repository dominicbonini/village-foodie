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
}

const PLAN_ORDER: Plan[] = ['starter', 'trial', 'tester', 'pro', 'max']

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
  pro:     'bg-blue-100 text-blue-700',
  max:     'bg-orange-100 text-orange-700',
}

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
  const [planFilter, setPlanFilter] = useState<Plan | ''>('')

  const [editingTruck, setEditingTruck] = useState<AdminTruck | null>(null)
  const [modalEdits, setModalEdits] = useState<Partial<AdminTruck>>({})
  const [modalSaving, setModalSaving] = useState(false)

  const [createModalTruck, setCreateModalTruck] = useState<AdminTruck | null>(null)
  const [createEmail, setCreateEmail] = useState('')
  const [createLoading, setCreateLoading] = useState(false)
  const [createdPassword, setCreatedPassword] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)

  const [showDiscovery, setShowDiscovery] = useState(false)
  const [discoveryFilter, setDiscoveryFilter] = useState('')

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

  const updateDiscovery = async (discoveryTruckId: string, visibility: string) => {
    setSaving(discoveryTruckId)
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...await nativeAuthHeader() },
        body: JSON.stringify({ discoveryTruckId, visibility }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setDiscoveryTrucks(prev => prev.map(t =>
        t.id === discoveryTruckId ? { ...t, visibility: visibility as DiscoveryTruck['visibility'] } : t
      ))
      showToast('Saved')
    } catch (e: any) { alert(e.message) }
    finally { setSaving(null) }
  }

  const linkDiscoveryTruck = async (discoveryTruckId: string, hatchgrabTruckId: string | null) => {
    setSaving(discoveryTruckId)
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...await nativeAuthHeader() },
        body: JSON.stringify({ discoveryTruckId, hatchgrab_truck_id: hatchgrabTruckId || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setDiscoveryTrucks(prev => prev.map(t =>
        t.id === discoveryTruckId ? { ...t, hatchgrab_truck_id: hatchgrabTruckId } : t
      ))
      showToast(hatchgrabTruckId ? 'Linked' : 'Unlinked')
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

  const filteredTrucks = trucks.filter(t => {
    if (planFilter && t.plan !== planFilter) return false
    if (truckSearch && !t.name.toLowerCase().includes(truckSearch.toLowerCase())) return false
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

        {/* Trucks tab */}
        {adminTab === 'trucks' && (
          <div>
            <div className="flex gap-3 mb-4">
              <input
                type="text"
                placeholder="Search trucks…"
                value={truckSearch}
                onChange={e => setTruckSearch(e.target.value)}
                className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
              <select
                value={planFilter}
                onChange={e => setPlanFilter(e.target.value as Plan | '')}
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
              >
                <option value="">All plans</option>
                {PLAN_ORDER.map(p => (
                  <option key={p} value={p}>{PLAN_META[p].name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              {filteredTrucks.map(truck => {
                const trialExpiry = truck.trial_expires_at ? new Date(truck.trial_expires_at) : null
                const trialExpired = trialExpiry ? trialExpiry < new Date() : false
                const trialDays = trialExpiry
                  ? Math.max(0, Math.ceil((trialExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
                  : 0
                return (
                  <div key={truck.id} className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-slate-900 text-sm">{truck.name}</p>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${PLAN_BADGE[truck.plan]}`}>
                          {PLAN_META[truck.plan].name}
                        </span>
                        {truck.plan === 'trial' && trialExpiry && (
                          <span className={`text-[10px] font-bold ${trialExpired ? 'text-red-500' : trialDays <= 7 ? 'text-amber-500' : 'text-teal-600'}`}>
                            {trialExpired ? 'Expired' : `${trialDays}d`}
                          </span>
                        )}
                        {truck.lifetime_discount_pct != null && (
                          <span className="text-[10px] font-bold text-green-700 bg-green-50 px-1.5 py-0.5 rounded-full">
                            💚 {truck.lifetime_discount_pct}% lifetime
                          </span>
                        )}
                        {!truck.active && (
                          <span className="text-[10px] bg-red-100 text-red-600 font-bold px-1.5 py-0.5 rounded-full">Inactive</span>
                        )}
                      </div>
                      {truck.contact_email && <p className="text-slate-400 text-xs mt-0.5">{truck.contact_email}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {truck.operator_id && truck.dashboard_token && (
                        <AppLink
                          href={`/dashboard/${truck.dashboard_token}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50"
                        >
                          🖥 Dashboard →
                        </AppLink>
                      )}
                      <button
                        onClick={() => openEditModal(truck)}
                        className="text-xs px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Discovery trucks */}
            <div className="mt-8">
              <button
                onClick={() => setShowDiscovery(v => !v)}
                className="flex items-center gap-2 font-black text-slate-700 text-lg mb-4 hover:text-slate-900"
              >
                {showDiscovery ? '▼' : '▶'} Discovery trucks ({discoveryTrucks.length})
              </button>
              {showDiscovery && (
                <>
                  <input
                    type="text"
                    placeholder="Filter by name…"
                    value={discoveryFilter}
                    onChange={e => setDiscoveryFilter(e.target.value)}
                    className="mb-3 w-full max-w-sm border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                  <div className="space-y-2">
                    {discoveryTrucks
                      .filter(t => !discoveryFilter || t.name.toLowerCase().includes(discoveryFilter.toLowerCase()))
                      .map(truck => (
                        <div key={truck.id} className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-slate-900 text-sm truncate">{truck.name}</p>
                            {truck.hatchgrab_truck_id ? (
                              <p className="text-[10px] text-teal-600 font-bold mt-0.5">
                                → {trucks.find(t => t.id === truck.hatchgrab_truck_id)?.name || truck.hatchgrab_truck_id}
                              </p>
                            ) : (
                              <p className="text-[10px] text-slate-400 mt-0.5">Not linked</p>
                            )}
                            {(truck.exclude_reason || '').toLowerCase().includes('y') && (
                              <p className="text-[10px] text-red-500 font-bold mt-0.5">Excluded</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <select
                              value={truck.hatchgrab_truck_id || ''}
                              onChange={e => linkDiscoveryTruck(truck.id, e.target.value || null)}
                              disabled={saving === truck.id}
                              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400 max-w-[140px]"
                            >
                              <option value="">— Link HG truck —</option>
                              {trucks.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                            <select
                              value={truck.visibility || 'public'}
                              onChange={e => updateDiscovery(truck.id, e.target.value)}
                              disabled={saving === truck.id}
                              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                            >
                              <option value="public">Public (VF + HG)</option>
                              <option value="hg_only">HG only</option>
                              <option value="hidden">Hidden</option>
                            </select>
                            {saving === truck.id && (
                              <span className="text-xs text-slate-400 animate-pulse">Saving…</span>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </>
              )}
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
    </div>
  )
}
