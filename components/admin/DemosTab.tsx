'use client'
// components/admin/DemosTab.tsx — demo-2 (30 October 2026, docs/demo-2-report.md): Admin › Demos.
//
// One row per demo that still exists — created, landing or outreach, email, the tips-and-news tick, country, truck name
// (when it is not the default), items found, the uploaded menu (a 60-second signed link), and how far the visitor got:
// ordered, finished the walkthrough, started signup, signed up — plus when it expires. Above it, the funnel for the
// chosen dates, counted from public.demo_events (which outlives the demos it counts). Filter by dates and source.
// Same layout rules as the other admin tabs: one width on a laptop and a monitor, tight, and a card list on a phone.
import { useCallback, useEffect, useState } from 'react'

type Source = 'all' | 'landing' | 'outreach'
interface DemoRow {
  truckId: string; createdAt: string; expiresAt: string | null; source: 'landing' | 'outreach'
  email: string | null; marketingOptIn: boolean | null; country: string | null; truckName: string | null
  itemsFound: number; extraction: string | null
  files: { path: string; name: string; size: number | null }[]
  ordered: boolean; finishedWalkthrough: boolean; startedSignup: boolean; signedUp: boolean
}
interface Payload { from: string; to: string; source: Source; demos: DemoRow[]; funnel: Record<string, number>; funnelAvailable: boolean }

const FUNNEL: [string, string][] = [
  ['build_started', 'Build started'], ['build_ok', 'Built'], ['build_failed', 'Build failed'], ['sample_used', 'Sample used'],
  ['menu_viewed', 'Menu viewed'], ['order_placed', 'Ordered'], ['cooking_started', 'Started cooking'], ['ready_pressed', 'Pressed Ready'],
  ['signup_started', 'Started signup'], ['signup_done', 'Signed up'],
]
const ymd = (d: Date) => d.toISOString().slice(0, 10)
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')
const yes = (v: boolean) => (v ? <span className="text-green-700 font-bold">Yes</span> : <span className="text-slate-400">No</span>)

export default function DemosTab() {
  const [from, setFrom] = useState(() => ymd(new Date(Date.now() - 30 * 86_400_000)))
  const [to, setTo] = useState(() => ymd(new Date()))
  const [source, setSource] = useState<Source>('all')
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/admin/demos?from=${from}&to=${to}&source=${source}`, { cache: 'no-store' })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body?.demos) { setError(body?.error ?? 'Could not load the demos.'); return }
      setData(body as Payload)
    } catch { setError('Could not reach the server.') } finally { setLoading(false) }
  }, [from, to, source])
  useEffect(() => { void load() }, [load])

  const openFile = async (path: string, download: boolean) => {
    const res = await fetch(`/api/admin/demos?file=${encodeURIComponent(path)}${download ? '&download=1' : ''}`, { cache: 'no-store' })
    const body = await res.json().catch(() => null)
    if (body?.url) window.open(body.url, '_blank', 'noopener,noreferrer')
    else setError(body?.error ?? 'That file could not be opened.')
  }

  const files = (d: DemoRow) => d.files.length === 0 ? <span className="text-slate-400">—</span> : (
    <span className="flex flex-col gap-0.5">
      {d.files.map(f => (
        <span key={f.path} className="whitespace-nowrap">
          <button type="button" onClick={() => openFile(f.path, false)} className="text-orange-700 underline underline-offset-2">{f.name.length > 22 ? `${f.name.slice(0, 20)}…` : f.name}</button>
          <button type="button" onClick={() => openFile(f.path, true)} className="ml-1.5 text-slate-500 underline underline-offset-2 text-[11px]">download</button>
        </span>
      ))}
    </span>
  )

  return (
    <div className="max-w-[1400px] mx-auto" data-demos-tab>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <h2 className="text-xl font-black text-slate-900 mr-auto">Demos</h2>
        <label className="text-xs font-bold text-slate-600">From<input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className="block mt-0.5 border border-slate-200 rounded-lg px-2 py-1.5 text-sm" /></label>
        <label className="text-xs font-bold text-slate-600">To<input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} className="block mt-0.5 border border-slate-200 rounded-lg px-2 py-1.5 text-sm" /></label>
        <label className="text-xs font-bold text-slate-600">Source
          <select value={source} onChange={e => setSource(e.target.value as Source)} className="block mt-0.5 border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white">
            <option value="all">All</option><option value="landing">Landing page</option><option value="outreach">Outreach</option>
          </select>
        </label>
      </div>

      {error && <p className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      {/* THE FUNNEL — demos reaching each step in the dates (each demo counted once per step). */}
      <div className="mb-5" data-demos-funnel>
        <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2">
          {FUNNEL.map(([key, label]) => (
            <div key={key} className="bg-white border border-slate-200 rounded-xl px-3 py-2">
              <p className="text-[11px] font-bold text-slate-500 leading-tight">{label}</p>
              <p className="text-2xl font-black text-slate-900 tabular-nums">{data?.funnelAvailable === false ? '—' : (data?.funnel?.[key] ?? 0)}</p>
            </div>
          ))}
        </div>
        {data?.funnelAvailable === false && <p className="text-xs text-amber-700 mt-2">The counts start once migration 20261052 is run.</p>}
        <p className="text-xs text-slate-500 mt-2">Counts survive the demos they count; the rows below are the demos that still exist (a demo is deleted when it expires).</p>
      </div>

      {loading && !data && <p className="text-sm text-slate-500">Loading…</p>}
      {data && data.demos.length === 0 && <p className="text-sm text-slate-500">No demos in these dates.</p>}

      {/* LAPTOP AND MONITOR: one table. */}
      {data && data.demos.length > 0 && (
        <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Created</th><th className="px-3 py-2">Source</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Tips</th>
                <th className="px-3 py-2">Country</th><th className="px-3 py-2">Truck</th><th className="px-3 py-2 text-right">Items</th><th className="px-3 py-2">Menu file</th>
                <th className="px-3 py-2">Ordered</th><th className="px-3 py-2">Walkthrough</th><th className="px-3 py-2">Signup started</th><th className="px-3 py-2">Signed up</th><th className="px-3 py-2">Expires</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.demos.map(d => (
                <tr key={d.truckId} className="align-top" data-demo-row={d.source}>
                  <td className="px-3 py-2 whitespace-nowrap">{when(d.createdAt)}</td>
                  <td className="px-3 py-2">{d.source === 'outreach' ? 'Outreach' : 'Landing'}{d.extraction === 'template' && <span className="block text-[11px] text-slate-500">sample</span>}</td>
                  <td className="px-3 py-2 break-all">{d.email ?? <span className="text-slate-400">—</span>}</td>
                  <td className="px-3 py-2">{d.marketingOptIn === null ? '—' : yes(d.marketingOptIn)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{d.country ?? '—'}</td>
                  <td className="px-3 py-2">{d.truckName ?? <span className="text-slate-400">—</span>}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{d.itemsFound}</td>
                  <td className="px-3 py-2">{files(d)}</td>
                  <td className="px-3 py-2">{yes(d.ordered)}</td>
                  <td className="px-3 py-2">{yes(d.finishedWalkthrough)}</td>
                  <td className="px-3 py-2">{yes(d.startedSignup)}</td>
                  <td className="px-3 py-2">{yes(d.signedUp)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{when(d.expiresAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* PHONE: one card per demo. */}
      {data && data.demos.length > 0 && (
        <div className="md:hidden space-y-2">
          {data.demos.map(d => (
            <div key={d.truckId} className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm" data-demo-card={d.source}>
              <div className="flex justify-between gap-2">
                <span className="font-bold text-slate-900">{d.truckName ?? (d.source === 'outreach' ? 'Outreach demo' : 'Landing demo')}</span>
                <span className="text-xs text-slate-500 whitespace-nowrap">{when(d.createdAt)}</span>
              </div>
              <p className="text-xs text-slate-600 break-all mt-0.5">{d.email ?? 'no email'} · tips {d.marketingOptIn ? 'yes' : 'no'} · {d.country ?? '—'} · {d.itemsFound} items</p>
              <div className="mt-1.5 text-xs">{files(d)}</div>
              <p className="text-xs mt-1.5">Ordered {yes(d.ordered)} · Walkthrough {yes(d.finishedWalkthrough)} · Signup {yes(d.startedSignup)} · Signed up {yes(d.signedUp)}</p>
              <p className="text-[11px] text-slate-500 mt-1">Expires {when(d.expiresAt)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
