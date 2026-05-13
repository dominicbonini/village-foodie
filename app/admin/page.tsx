// app/admin/page.tsx
// Village Foodie admin panel — manage truck tiers and feature access
// Protected by ADMIN_SECRET env variable

'use client'
import { useState, useEffect } from 'react'

interface Truck {
  id: string; name: string; slug: string; plan: string | null; is_active: boolean;
  auto_accept: boolean; contact_email: string | null; onboarded_at: string | null
}

const TIERS = ['free', 'starter', 'pro', 'max']

const FEATURES: Record<string, { label: string; tiers: string[] }> = {
  web_ordering:    { label: 'Web ordering',         tiers: ['free','starter','pro','max'] },
  dashboard:       { label: 'Orders dashboard',     tiers: ['free','starter','pro','max'] },
  stock_control:   { label: 'Stock control',        tiers: ['free','starter','pro','max'] },
  whatsapp:        { label: 'WhatsApp notifications',tiers: ['pro','max'] },
  time_slots:      { label: 'Time slots',           tiers: ['pro','max'] },
  auto_accept:     { label: 'Auto-accept',          tiers: ['pro','max'] },
  online_payments: { label: 'Online payments',      tiers: ['max'] },
  pay_at_hatch:    { label: 'Pay at hatch',         tiers: ['free','starter','pro','max'] }, // free period only
  sales_reporting: { label: 'Sales reporting',      tiers: ['max'] },
  modifier_system: { label: 'Modifier system',      tiers: ['pro','max'] },
}

export default function AdminPage() {
  const [secret, setSecret] = useState('')
  const [authed, setAuthed] = useState(false)
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000) }

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin?secret=${secret}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setTrucks(data.trucks)
      setAuthed(true)
    } catch (e: any) { alert(e.message || 'Auth failed') }
    finally { setLoading(false) }
  }

  const updateTruck = async (truckId: string, updates: Record<string, any>) => {
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

        {/* Feature tiers reference */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-6 overflow-x-auto">
          <p className="font-black text-slate-900 mb-3">Feature tiers</p>
          <table className="text-xs w-full">
            <thead>
              <tr className="text-left">
                <th className="pr-4 pb-2 text-slate-500 font-bold">Feature</th>
                {TIERS.map(t => <th key={t} className="px-3 pb-2 text-slate-500 font-bold capitalize">{t}</th>)}
              </tr>
            </thead>
            <tbody>
              {Object.entries(FEATURES).map(([key, { label, tiers }]) => (
                <tr key={key} className="border-t border-slate-50">
                  <td className="pr-4 py-1.5 text-slate-700 font-medium">{label}</td>
                  {TIERS.map(t => (
                    <td key={t} className="px-3 py-1.5 text-center">
                      {tiers.includes(t) ? <span className="text-green-500 font-black">✓</span> : <span className="text-slate-200">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Truck list */}
        <div className="space-y-3">
          {trucks.map(truck => (
            <div key={truck.id} className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-black text-slate-900">{truck.name}</p>
                    <span className="text-xs text-slate-400 font-mono">{truck.slug}</span>
                    {!truck.is_active && <span className="text-[10px] bg-red-100 text-red-600 font-bold px-1.5 py-0.5 rounded-full">Inactive</span>}
                  </div>
                  {truck.contact_email && <p className="text-slate-400 text-xs mt-0.5">{truck.contact_email}</p>}
                  {truck.onboarded_at && <p className="text-slate-300 text-xs">Joined {new Date(truck.onboarded_at).toLocaleDateString('en-GB')}</p>}
                </div>
                <div className="flex items-center gap-3 flex-wrap shrink-0">
                  {/* Tier selector */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-0.5">Tier</label>
                    <select value={truck.plan || 'free'}
                      onChange={e => updateTruck(truck.id, { plan: e.target.value })}
                      className="border border-slate-200 rounded-lg px-2 py-1 text-sm font-bold bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 text-slate-700">
                      {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  {/* Pay at hatch override */}
                  <div className="text-center">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-0.5">Pay at hatch</label>
                    <input type="checkbox" checked={true} disabled
                      className="w-4 h-4 accent-orange-500" title="Always on during free period" />
                    <p className="text-[9px] text-slate-300 mt-0.5">Free period</p>
                  </div>
                  {/* Active toggle */}
                  <div className="text-center">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-0.5">Active</label>
                    <input type="checkbox" checked={truck.is_active}
                      onChange={e => updateTruck(truck.id, { is_active: e.target.checked })}
                      className="w-4 h-4 accent-orange-500" />
                  </div>
                  {saving === truck.id && <span className="text-xs text-slate-400 animate-pulse">Saving...</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg">
          ✓ {toast}
        </div>
      )}
    </div>
  )
}