// app/admin/page.tsx
// Village Foodie admin panel — manage truck plans, trials, and feature overrides
// Protected by ADMIN_SECRET env variable

'use client'
import { useState } from 'react'
import { PLAN_META, PLAN_FEATURES, type Plan, type Feature } from '@/lib/features'
import { PLAN_PRICES } from '@/lib/plan-features'

interface AdminTruck {
  id: string
  name: string
  plan: Plan
  trial_expires_at: string | null
  feature_overrides: Record<string, boolean> | null
  active: boolean
  auto_accept: boolean
  contact_email: string | null
  onboarded_at: string | null
  operator_id: string | null
  is_test: boolean
}

interface DiscoveryTruck {
  id: string
  name: string
  visibility: 'public' | 'hg_only' | 'hidden'
  hatchgrab_truck_id: string | null
  exclude_reason: string | null
}

const PLAN_ORDER: Plan[] = ['starter', 'trial', 'pro', 'max']

const OVERRIDEABLE_FEATURES: Feature[] = [
  'cook_screen',
  'multi_device_kds',
  'online_payments',
  'advance_preordering',
  'ticket_printing',
]

export default function AdminPage() {
  const [secret, setSecret] = useState('')
  const [authed, setAuthed] = useState(false)
  const [trucks, setTrucks] = useState<AdminTruck[]>([])
  const [discoveryTrucks, setDiscoveryTrucks] = useState<DiscoveryTruck[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
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
      const [res, discRes] = await Promise.all([
        fetch(`/api/admin?secret=${secret}`),
        fetch(`/api/admin?secret=${secret}&section=discovery`),
      ])
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setTrucks(data.trucks)
      if (discRes.ok) {
        const discData = await discRes.json()
        setDiscoveryTrucks(discData.discoveryTrucks || [])
      }
      setAuthed(true)
    } catch (e: any) { alert(e.message || 'Auth failed') }
    finally { setLoading(false) }
  }

  const updateDiscovery = async (discoveryTruckId: string, visibility: string) => {
    setSaving(discoveryTruckId)
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, discoveryTruckId, visibility }),
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

  const update = async (truckId: string, updates: Record<string, any>) => {
    setSaving(truckId)
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, truckId, ...updates }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setTrucks(prev => prev.map(t => t.id === truckId ? { ...t, ...updates } : t))
      showToast('Saved')
    } catch (e: any) { alert(e.message) }
    finally { setSaving(null) }
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret,
        truckId: createModalTruck.id,
        email: createEmail,
      }),
    })
    const data = await res.json()
    setCreateLoading(false)

    if (data.ok) {
      setCreatedPassword(data.tempPassword)
      setTrucks(prev => prev.map(t =>
        t.id === createModalTruck.id
          ? { ...t, operator_id: data.operatorId }
          : t
      ))
    } else {
      setCreateError(data.error || 'Something went wrong')
    }
  }

  const setTrial = (truck: AdminTruck, months: 1 | 3) => {
    const expires = new Date()
    expires.setMonth(expires.getMonth() + months)
    update(truck.id, { plan: 'trial', trial_expires_at: expires.toISOString() })
  }

  if (!authed) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-2xl">
        <h1 className="font-black text-slate-900 text-xl mb-6">🔐 Admin</h1>
        <input type="password" placeholder="Admin secret" value={secret} onChange={e => setSecret(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load()}
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-orange-400" />
        <button onClick={load} disabled={loading}
          className="w-full bg-orange-600 text-white font-bold py-2.5 rounded-xl hover:bg-orange-700 disabled:opacity-50">
          {loading ? 'Loading...' : 'Sign in'}
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-black text-lg">Village Foodie Admin</h1>
          <p className="text-slate-400 text-xs">{trucks.length} trucks</p>
        </div>
        <button onClick={load} className="text-slate-400 hover:text-white text-sm font-bold">↻ Refresh</button>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">

        {/* Plan tiers reference — generated from PLAN_META and PLAN_FEATURES */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-6 overflow-x-auto">
          <p className="font-black text-slate-900 mb-3">Plan features</p>
          <table className="text-xs w-full">
            <thead>
              <tr className="text-left">
                <th className="pr-4 pb-2 text-slate-500 font-bold">Feature</th>
                {PLAN_ORDER.map(p => (
                  <th key={p} className="px-3 pb-2 text-slate-500 font-bold">
                    {PLAN_META[p].name}
                    <span className="block text-[10px] font-normal text-slate-400">{PLAN_PRICES[p]}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(Array.from(PLAN_FEATURES.max) as Feature[]).map(feature => (
                <tr key={feature} className="border-t border-slate-50">
                  <td className="pr-4 py-1.5 text-slate-700 font-medium">{feature}</td>
                  {PLAN_ORDER.map(p => (
                    <td key={p} className="px-3 py-1.5 text-center">
                      {PLAN_FEATURES[p].has(feature)
                        ? <span className="text-green-500 font-black">✓</span>
                        : <span className="text-slate-200">—</span>
                      }
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Truck list */}
        <div className="space-y-3">
          {trucks.map(truck => {
            const trialExpiry = truck.trial_expires_at ? new Date(truck.trial_expires_at) : null
            const trialExpired = trialExpiry ? trialExpiry < new Date() : false
            const trialDays = trialExpiry
              ? Math.max(0, Math.ceil((trialExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
              : 0

            return (
              <div key={truck.id} className="bg-white rounded-2xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  {/* Truck info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-black text-slate-900">{truck.name}</p>
                      {!truck.active && <span className="text-[10px] bg-red-100 text-red-600 font-bold px-1.5 py-0.5 rounded-full">Inactive</span>}
                    </div>
                    {truck.contact_email && <p className="text-slate-400 text-xs mt-0.5">{truck.contact_email}</p>}
                    {truck.onboarded_at && <p className="text-slate-300 text-xs">Joined {new Date(truck.onboarded_at).toLocaleDateString('en-GB')}</p>}
                  </div>

                  {/* Controls */}
                  <div className="flex items-center gap-4 flex-wrap shrink-0">

                    {/* Plan selector */}
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Plan</p>
                      <div className="flex gap-1">
                        {PLAN_ORDER.map(p => (
                          <button
                            key={p}
                            onClick={() => update(truck.id, {
                              plan: p,
                              trial_expires_at: p !== 'trial' ? null : truck.trial_expires_at,
                            })}
                            className={`text-xs px-2.5 py-1 rounded-lg font-bold transition-colors ${
                              truck.plan === p
                                ? 'bg-slate-900 text-white'
                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            }`}
                          >
                            {PLAN_META[p].name}
                          </button>
                        ))}
                      </div>

                      {/* Trial duration controls */}
                      {truck.plan === 'trial' && (
                        <div className="flex items-center gap-2 mt-2">
                          <button onClick={() => setTrial(truck, 1)}
                            className="text-xs bg-teal-50 text-teal-700 hover:bg-teal-100 font-bold px-2 py-1 rounded-lg transition-colors">
                            1 month
                          </button>
                          <button onClick={() => setTrial(truck, 3)}
                            className="text-xs bg-teal-50 text-teal-700 hover:bg-teal-100 font-bold px-2 py-1 rounded-lg transition-colors">
                            3 months
                          </button>
                          {trialExpiry && (
                            <span className={`text-xs font-bold ${
                              trialExpired ? 'text-red-500' : trialDays <= 7 ? 'text-orange-500' : 'text-teal-600'
                            }`}>
                              {trialExpired ? 'Expired' : `${trialDays}d remaining`}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Active toggle */}
                    <div className="text-center">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Active</label>
                      <input type="checkbox" checked={truck.active}
                        onChange={e => update(truck.id, { active: e.target.checked })}
                        className="w-4 h-4 accent-orange-500" />
                    </div>

                    {/* Test account toggle */}
                    <div className="text-center">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Test</label>
                      <input type="checkbox" checked={truck.is_test ?? false}
                        onChange={e => update(truck.id, { is_test: e.target.checked })}
                        className="w-4 h-4 accent-slate-500" />
                    </div>

                    {/* Create operator account */}
                    <div className="text-center">
                      {!truck.operator_id ? (
                        <button
                          onClick={() => openCreateModal(truck)}
                          className="text-xs px-3 py-1.5 border border-teal-200 text-teal-600
                                     rounded-lg hover:bg-teal-50"
                        >
                          + Create account
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">Account linked</span>
                      )}
                    </div>

                    {saving === truck.id && <span className="text-xs text-slate-400 animate-pulse">Saving…</span>}
                  </div>
                </div>

                {/* Feature overrides */}
                <details className="text-xs mt-3">
                  <summary className="text-slate-400 cursor-pointer select-none hover:text-slate-600">
                    Feature overrides
                    {Object.keys(truck.feature_overrides ?? {}).length > 0 &&
                      <span className="ml-1 text-orange-500 font-bold">
                        ({Object.keys(truck.feature_overrides ?? {}).length} active)
                      </span>
                    }
                  </summary>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 pl-2">
                    {OVERRIDEABLE_FEATURES.map(f => (
                      <label key={f} className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={truck.feature_overrides?.[f] === true}
                          onChange={e => {
                            const next = { ...(truck.feature_overrides ?? {}) }
                            if (e.target.checked) next[f] = true
                            else delete next[f]
                            update(truck.id, { feature_overrides: next })
                          }}
                          className="w-3.5 h-3.5 accent-orange-500"
                        />
                        <span className="text-slate-600">{f}</span>
                      </label>
                    ))}
                  </div>
                </details>
              </div>
            )
          })}
        </div>

        {/* Discovery trucks visibility */}
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
                        {truck.hatchgrab_truck_id && (
                          <p className="text-[10px] text-teal-600 font-bold mt-0.5">HatchGrab operator</p>
                        )}
                        {(truck.exclude_reason || '').toLowerCase().includes('y') && (
                          <p className="text-[10px] text-red-500 font-bold mt-0.5">Excluded</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
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

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg z-50">
          ✓ {toast}
        </div>
      )}

      {/* Create operator modal */}
      {createModalTruck && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
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
                {createError && (
                  <p className="text-sm text-red-600">{createError}</p>
                )}
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
                  Send this password to the operator. They'll be prompted to change it on first login.
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
