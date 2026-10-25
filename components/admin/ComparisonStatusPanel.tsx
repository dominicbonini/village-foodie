'use client'
// components/admin/ComparisonStatusPanel.tsx — Admin › Countries › "Comparison pages" (compare-de-1, 24 October 2026).
// One row per country that can have a comparison page (German-language countries, plus any already on): its address,
// the app flags the page's app rows follow, and the status — Off (404), Admins only (noindex, banner, checklist) or Live
// (public, indexed, in the sitemap and /llms.txt). Live asks first. ⛔ The app flags are not set here: they follow the
// stores, by SQL on the day (docs/compare-de-1-report.md). Talks to /api/admin/countries/comparison.
import { useEffect, useState } from 'react'
import { nativeAuthHeader } from '@/lib/native/session'
import type { ComparisonStatus } from '@/lib/comparison-types'

interface Row { code: string; name: string; locale: string; enabled: boolean; path: string; status: ComparisonStatus; iosApp: boolean; androidApp: boolean }
const LABEL: Record<ComparisonStatus, string> = { off: 'Off', admin: 'Admins only', live: 'Live' }
const PILL: Record<ComparisonStatus, string> = { off: 'bg-slate-100 text-slate-600', admin: 'bg-amber-100 text-amber-800', live: 'bg-emerald-100 text-emerald-800' }

async function call(method: 'GET' | 'PATCH', body?: unknown) {
  const res = await fetch('/api/admin/countries/comparison', {
    method, headers: { 'Content-Type': 'application/json', ...(await nativeAuthHeader()) }, body: body === undefined ? undefined : JSON.stringify(body),
  })
  let data: Record<string, unknown> = {}
  try { data = await res.json() } catch { /* reported by status */ }
  return { ok: res.ok, data }
}

export function ComparisonStatusPanel() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [ready, setReady] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  const load = async () => {
    const r = await call('GET')
    if (!r.ok) { setNotice({ ok: false, text: typeof r.data.error === 'string' ? r.data.error : 'The comparison pages could not be loaded.' }); return }
    setReady(r.data.ready === true); setRows(r.data.countries as Row[])
  }
  useEffect(() => { let off = false; call('GET').then(r => { if (off) return; if (r.ok) { setReady(r.data.ready === true); setRows(r.data.countries as Row[]) } else setNotice({ ok: false, text: 'The comparison pages could not be loaded.' }) }); return () => { off = true } }, [])

  const set = async (row: Row, status: ComparisonStatus) => {
    if (status === row.status) return
    if (status === 'live' && !window.confirm(`Make the ${row.name} comparison page public? It becomes indexable and is added to the sitemap, /llms.txt and the ${row.name} footer.`)) return
    setBusy(row.code); setNotice(null)
    const r = await call('PATCH', { code: row.code, status })
    setBusy(null)
    if (!r.ok) { setNotice({ ok: false, text: typeof r.data.error === 'string' ? r.data.error : 'That could not be saved.' }); return }
    setNotice({ ok: true, text: `${row.name}: ${LABEL[status]}.` })
    await load()
  }

  if (!rows) return null
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4" data-comparison-status>
      <p className="text-sm font-bold text-slate-900">Comparison pages</p>
      <p className="text-xs text-slate-500">Off: the page is a 404. Admins only: you see it with a checklist; nobody else does, and it is not indexed. Live: public and indexed. Who is on each page is in Pricing check.</p>
      {!ready && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">Run supabase/migrations/20261042_compare_de_1.sql to switch comparison pages on.</p>}
      {notice && <p className={`mt-2 rounded-lg px-3 py-2 text-sm font-semibold ${notice.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`} role="status">{notice.text}</p>}
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
            <th className="px-2 py-1.5">Country</th><th className="px-2 py-1.5">Address</th><th className="px-2 py-1.5">iPad app</th><th className="px-2 py-1.5">Android app</th><th className="px-2 py-1.5">Status</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(r => (
              <tr key={r.code} data-comparison-country={r.code}>
                <td className="px-2 py-1.5 font-semibold text-slate-800">{r.name} <span className="font-mono text-xs text-slate-400">{r.code}</span></td>
                <td className="px-2 py-1.5">{r.status === 'off' ? <span className="font-mono text-xs text-slate-500">{r.path}</span> : <a className="font-mono text-xs text-orange-700 underline" href={r.path} target="_blank" rel="noreferrer">{r.path}</a>}</td>
                <td className="px-2 py-1.5 text-xs">{r.iosApp ? 'In the store' : 'Not in the store'}</td>
                <td className="px-2 py-1.5 text-xs">{r.androidApp ? 'In the store' : 'Not in the store'}</td>
                <td className="px-2 py-1.5">
                  <div className="inline-flex rounded-xl border border-slate-200 p-0.5" role="group" aria-label={`${r.name} comparison page`}>
                    {(['off', 'admin', 'live'] as const).map(s => (
                      <button key={s} type="button" disabled={!ready || busy !== null} aria-pressed={r.status === s} onClick={() => set(r, s)} data-status={s}
                        className={`rounded-lg px-2.5 py-1 text-xs font-bold disabled:opacity-50 ${r.status === s ? PILL[s] : 'text-slate-500 hover:bg-slate-50'}`}>{LABEL[s]}</button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
