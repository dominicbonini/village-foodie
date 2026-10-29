'use client'
// components/admin/PricingCheckTab.tsx — Admin › Pricing check (pricing-check-1, 23 October 2026;
// docs/pricing-check-1-report.md). ADMIN ONLY: nothing here is public, and nothing here changes a price we charge.
//
// ── WHAT IT IS FOR ───────────────────────────────────────────────────────────────────────────────────────────────────
// Every country's competitor plans, key features and benchmarks (public.competitors / competitor_plans /
// country_benchmarks, through /api/admin/pricing-check), compared live against our plan_prices with lib/pricing-check.ts —
// the same code the harness runs — and the price that would make us cheapest, or within 5% / 10%. A suggestion is only a
// suggestion: our prices change when Dominic runs the SQL.
//
// ── LAYOUT ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// A country list on the left (Live / Switched off / Planned, a search box, a pill per country at the medium size with
// the current filters), the country on the right. The same layout on a laptop and a 27in monitor (the tab sits in the
// wide 1800px container, like Outreach); on a phone the two stack. Every table scrolls sideways inside its own box, and
// the page never does.
//
// ── EDITING ──────────────────────────────────────────────────────────────────────────────────────────────────────────
// Edit never changes a stored price: the server inserts a new row and supersedes the old (History shows them), and the
// new row starts unverified. Mark verified / Undo verified and a key-feature cell are the only in-place saves.
//
// ── COMPARISON PAGE (compare-de-1, 24 October 2026) ──────────────────────────────────────────────────────────────────
// Section 5 of a country: which competitors its public comparison page shows (public.comparison_entries), in what order,
// the plan whose price line it uses, the honest "passt, wenn …" line, and the three checks the public page needs — the
// entry, its plan and its features verified. Until all three are, the page shows that competitor to admins only.

import { useCallback, useEffect, useMemo, useState } from 'react'
// competitor-check-1: the "Automatic checks" view (what the competitor checker found, to accept or reject).
import AutomaticChecks from '@/components/admin/AutomaticChecks'
import { nativeAuthHeader } from '@/lib/native/session'
import { formatAmount, formatWholeAmount, minorDigits } from '@/lib/money-format'
import type { PlanCatalog } from '@/lib/plans'
import {
  checkCountry, countryStatus, eurRates, isStale, ourFeatureCell,
  DEFAULT_OPTIONS, VOLUMES, KEY_FEATURES, COMPARE_FEATURES, FOCUS_LABEL,
  type Benchmark, type CheckOptions, type Competitor, type CompetitorPlan, type CountryResult, type CountryRow,
  type CountryStatus, type KeyFeatureColumn, type CompareFeatureColumn, type ComparisonEntry, type RivalTotal, type Tri, type VolumeKey, type Focus,
} from '@/lib/pricing-check'

interface State {
  empty: boolean; importable: boolean
  competitors: Competitor[]; plans: CompetitorPlan[]; benchmarks: Benchmark[]
  catalog: PlanCatalog; countries: CountryRow[]; today: string
  // compare-de-1: the comparison pages' entries ([] and entriesReady false until 20261042 runs)
  entries: ComparisonEntry[]; entriesReady: boolean
  imports?: { path: string; ok: boolean | null; text: string }[]
}

async function call(method: 'GET' | 'POST', body?: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const res = await fetch('/api/admin/pricing-check', {
    method,
    headers: { 'Content-Type': 'application/json', ...(await nativeAuthHeader()) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let data: Record<string, unknown> = {}
  try { data = await res.json() } catch { /* an empty or broken body is reported by status */ }
  return { ok: res.ok, status: res.status, data }
}

// ── money, in the admin's side-by-side form (en-GB, the currency's international symbol) ──
const fm = (cur: string) => ({ currency: cur, locale: 'en-GB' })
const money = (minor: number, cur: string) => formatAmount(Math.round(minor), fm(cur))
const whole = (minor: number, cur: string) => formatWholeAmount(minor, fm(cur))
const pct = (bps: number) => `${(bps / 100).toLocaleString('en-GB', { maximumFractionDigits: 2 })}%`
const toMinor = (major: string, cur: string): number | null => {
  const s = major.trim().replace(/,/g, '')
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(n * 10 ** minorDigits(cur)) : NaN
}
const toMajorText = (minor: number | null, cur: string) => (minor === null ? '' : String(minor / 10 ** minorDigits(cur)))
const regionName = (code: string) => { try { return new Intl.DisplayNames(['en-GB'], { type: 'region' }).of(code) ?? code } catch { return code } }

const PILL: Record<CountryStatus, { label: string; cls: string }> = {
  cheapest: { label: 'Cheapest', cls: 'bg-emerald-100 text-emerald-800' },
  small_only: { label: 'Small only', cls: 'bg-amber-100 text-amber-800' },
  not_cheapest: { label: 'Not cheapest', cls: 'bg-red-100 text-red-700' },
  no_rivals: { label: 'No rivals', cls: 'bg-slate-100 text-slate-500' },
  no_data: { label: 'No data', cls: 'bg-slate-100 text-slate-400' },
}
const CARD = 'rounded-2xl border border-slate-200 bg-white p-4'
const BTN = 'whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50'
const BOX = 'w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400'

export default function PricingCheckTab() {
  const [state, setState] = useState<State | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [volume, setVolume] = useState<VolumeKey>('medium')
  const [options, setOptions] = useState<CheckOptions>(DEFAULT_OPTIONS)
  const [view, setView] = useState<'admin' | 'preview'>('admin')
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [editPlan, setEditPlan] = useState<CompetitorPlan | 'new' | null>(null)
  const [history, setHistory] = useState<CompetitorPlan | null>(null)
  const [editCountry, setEditCountry] = useState(false)
  // competitor-check-1: which part of the tab, and how many findings wait for review (the tab's count).
  const [section, setSection] = useState<'prices' | 'checks'>('prices')
  const [toReview, setToReview] = useState<number | null>(null)
  const onCount = useCallback((n: number) => setToReview(n), [])
  useEffect(() => {
    let off = false
    nativeAuthHeader().then(h => fetch('/api/admin/competitor-check', { headers: h })).then(r => (r.ok ? r.json() : null))
      .then(d => { if (!off && d?.overview) setToReview(d.overview.toReview) }).catch(() => { /* the tab works without the count */ })
    return () => { off = true }
  }, [])

  const load = async () => {
    const r = await call('GET')
    if (!r.ok) { setLoadError(typeof r.data.error === 'string' ? r.data.error : 'The pricing check could not be loaded.'); return }
    setLoadError(null)
    setState(r.data as unknown as State)
  }
  useEffect(() => {
    let cancelled = false
    call('GET').then(r => {
      if (cancelled) return
      if (!r.ok) { setLoadError(typeof r.data.error === 'string' ? r.data.error : 'The pricing check could not be loaded.'); return }
      setState(r.data as unknown as State)
    }).catch(() => { if (!cancelled) setLoadError('The pricing check could not be loaded.') })
    return () => { cancelled = true }
  }, [])

  // ── every country's result with the current filters (the list's pills need them all) ──
  const derived = useMemo(() => {
    if (!state) return null
    const current = state.benchmarks.filter(b => b.supersededAt === null)
    const rates = eurRates(current)
    const byCode = new Map(state.countries.map(c => [c.countryCode, c]))
    const codes = [...new Set([...state.countries.map(c => c.countryCode), ...current.map(b => b.countryCode)])]
    const results = new Map<string, CountryResult>()
    for (const code of codes) {
      results.set(code, checkCountry({ countryCode: code, benchmark: current.find(b => b.countryCode === code) ?? null, country: byCode.get(code) ?? null,
        catalog: state.catalog, plans: state.plans, competitors: state.competitors, rates }, options))
    }
    const nameOf = (code: string) => byCode.get(code)?.name ?? regionName(code)
    const group = (code: string) => (!byCode.has(code) ? 'Planned' : byCode.get(code)!.enabled ? 'Live' : 'Switched off')
    return { results, nameOf, group, codes: codes.sort((a, b) => nameOf(a).localeCompare(nameOf(b))), byCode, current }
  }, [state, options])

  // Open on the first live country (the list's order) once the data is in.
  const effectiveSelected = selected ?? derived?.codes.find(c => derived.group(c) === 'Live') ?? derived?.codes[0] ?? null

  if (loadError) return <div className={`${CARD} text-sm font-semibold text-red-700`} data-pricing-check>{loadError}</div>
  if (!state || !derived) return <p className="text-sm text-slate-500" data-pricing-check>Loading the pricing check…</p>

  const post = async (label: string, body: Record<string, unknown>, done?: string) => {
    setBusy(label); setNotice(null)
    const r = await call('POST', body)
    setBusy(null)
    if (!r.ok) { setNotice({ ok: false, text: typeof r.data.error === 'string' ? r.data.error : 'That could not be saved.' }); return false }
    await load()
    if (done) setNotice({ ok: true, text: done })
    return true
  }

  const code = effectiveSelected
  const result = code ? derived.results.get(code) ?? null : null
  const bench = code ? derived.current.find(b => b.countryCode === code) ?? null : null
  const compById = new Map(state.competitors.map(c => [c.id, c]))

  const exportCsv = (scope: 'country' | 'all') => {
    const rows = state.plans.filter(p => p.supersededAt === null && (scope === 'all' || p.countryCode === code))
    const cols = ['country', 'competitor', 'built_for', 'website', 'plan', 'currency', 'price_hidden', 'monthly', 'yearly_only', 'setup', 'truck_fee_pct',
      'truck_fee_fixed', 'customer_fee_pct', 'customer_fee_fixed', 'card_mode', 'card_pct', 'card_fixed', 'card_rate_assumed', 'order_cap', 'included_orders',
      'overage', 'vat', 'status', 'unclear', 'second_hand', 'source', 'source_url', 'checked_on', 'verified_at', 'pre_orders', 'whatsapp', 'social_posts',
      'own_domain', 'ios_app', 'android_app', 'payment_providers', 'notes']
    const major = (m: number | null, cur: string) => (m === null ? '' : String(m / 10 ** minorDigits(cur)))
    const esc = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const lines = [cols.join(',')]
    for (const p of rows) {
      const c = compById.get(p.competitorId)
      lines.push([p.countryCode, c?.name, c?.focus, c?.website, p.planName, p.currency, p.priceHidden, major(p.monthlyMinor, p.currency), p.yearlyOnly,
        major(p.setupMinor, p.currency), p.truckFeeBps / 100, major(p.truckFeeFixedMinor, p.currency), p.customerFeeBps / 100, major(p.customerFeeFixedMinor, p.currency),
        p.cardMode, p.cardBps === null ? '' : p.cardBps / 100, major(p.cardFixedMinor, p.currency), p.cardRateAssumed, p.orderCap ?? '', p.includedOrders ?? '',
        major(p.overageFixedMinor, p.currency), p.vat, p.status, p.unclear, p.secondHand, p.source, p.sourceUrl, p.checkedOn, p.verifiedAt ?? '',
        c?.preOrders, c?.whatsapp, c?.socialPosts, c?.ownDomain, c?.iosApp, c?.androidApp, c?.paymentProviders, p.notes].map(esc).join(','))
    }
    const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = scope === 'all' ? `pricing-check-all-${state.today}.csv` : `pricing-check-${code}-${state.today}.csv`
    a.click(); URL.revokeObjectURL(a.href)
  }

  const checkNow = async (c: Competitor) => {
    setBusy('check'); setNotice(null)
    const res = await fetch('/api/admin/competitor-check', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await nativeAuthHeader()) }, body: JSON.stringify({ action: 'check_now', competitorId: c.id }) })
    setBusy(null)
    if (res.ok) { await load(); setNotice({ ok: true, text: `${c.name} goes first in the next automatic check.` }) }
    else setNotice({ ok: false, text: ((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'That could not be queued.' })
  }

  const sections = (
    <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5 text-sm font-semibold" role="tablist" aria-label="Pricing check" data-sections>
      {([['prices', 'Prices and features'], ['checks', 'Automatic checks']] as const).map(([k, label]) => (
        <button key={k} type="button" role="tab" aria-selected={section === k} onClick={() => setSection(k)} data-section={k}
          className={`rounded-lg px-3 py-1 ${section === k ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'}`}>
          {label}{k === 'checks' && toReview ? <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold ${section === k ? 'bg-white/20 text-white' : 'bg-orange-100 text-orange-800'}`}>{toReview}</span> : null}
        </button>
      ))}
    </div>
  )
  if (section === 'checks') return <div className="space-y-3" data-pricing-check>{sections}<AutomaticChecks onCount={onCount} /></div>

  return (
    <div className="space-y-3" data-pricing-check>
      {sections}
      {/* ── the header ── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-900">Pricing check</h2>
          <p className="text-sm text-slate-500">What a truck would pay us and each competitor, and the price that would make us cheapest. Admin only.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5 text-sm font-semibold" role="tablist" aria-label="View">
            {(['admin', 'preview'] as const).map(v => (
              <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
                className={`rounded-lg px-3 py-1 ${view === v ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'}`}>
                {v === 'admin' ? 'Admin view' : 'Customer preview'}
              </button>
            ))}
          </div>
          <button type="button" className={BTN} disabled={!code} onClick={() => exportCsv('country')}>Export {code ?? ''} CSV</button>
          <button type="button" className={BTN} onClick={() => exportCsv('all')}>Export all</button>
          <button type="button" onClick={() => setEditPlan('new')} disabled={!code}
            className="whitespace-nowrap rounded-xl bg-orange-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50">+ Add competitor</button>
        </div>
      </div>

      {notice && <div className={`rounded-xl px-3 py-2 text-sm font-semibold ${notice.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`} role="status">{notice.text}</div>}

      {state.importable && (
        <div className={`${CARD} flex flex-wrap items-center justify-between gap-3 border-orange-200 bg-orange-50`} data-import>
          <div className="text-sm text-slate-700">
            <p className="font-bold text-slate-900">The tables are empty.</p>
            <p>Import the research of 23 October 2026 (docs/pricing-research-1-report.md): competitors, plans and every country’s benchmark. It can only run once.</p>
          </div>
          <button type="button" disabled={busy !== null} onClick={() => post('import', { action: 'import' }, 'The research data is in.')}
            className="whitespace-nowrap rounded-xl bg-orange-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50">
            {busy === 'import' ? 'Importing…' : 'Import research data'}
          </button>
        </div>
      )}

      {/* competitor-check-2: data files are imported by the nightly competitor-check workflow (lib/data-import) — read only. */}
      {(state.imports ?? []).map(l => (
        <p key={l.path} className={`text-xs ${l.ok === false ? 'font-semibold text-red-700' : 'text-slate-500'}`} data-import-line={l.ok === null ? 'pending' : l.ok ? 'ok' : 'error'}>{l.text}</p>
      ))}

      <div className="grid gap-3 lg:grid-cols-[16.5rem_minmax(0,1fr)]">
        {/* ── the country list ── */}
        <nav className={`${CARD} p-3 lg:sticky lg:top-[108px] lg:max-h-[calc(100dvh-124px)] lg:self-start lg:overflow-y-auto`} aria-label="Countries" data-country-list>
          <input className={BOX} placeholder="Search countries" aria-label="Search countries" value={search} onChange={e => setSearch(e.target.value)} />
          <div className="mt-2 max-h-64 space-y-3 overflow-y-auto lg:max-h-none">
            {(['Live', 'Switched off', 'Planned'] as const).map(g => {
              const q = search.trim().toLowerCase()
              const list = derived.codes.filter(c => derived.group(c) === g && (!q || c.toLowerCase().includes(q) || derived.nameOf(c).toLowerCase().includes(q)))
              if (!list.length) return null
              return (
                <div key={g}>
                  <p className="px-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">{g} · {list.length}</p>
                  <ul className="mt-1 space-y-0.5">
                    {list.map(c => {
                      const st = countryStatus(derived.results.get(c)!)
                      return (
                        <li key={c}>
                          <button type="button" onClick={() => setSelected(c)} data-country={c}
                            className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${c === code ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'}`}>
                            <span className="min-w-0 truncate"><span className={`mr-1.5 font-mono text-xs ${c === code ? 'text-slate-300' : 'text-slate-400'}`}>{c}</span>{derived.nameOf(c)}</span>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${PILL[st].cls}`}>{PILL[st].label}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            })}
          </div>
        </nav>

        {/* ── the country ── */}
        <div className="min-w-0 space-y-3" data-detail>
          {code && result ? (
            view === 'admin'
              ? <CountryAdmin code={code} state={state} result={result} bench={bench} derived={derived} volume={volume} setVolume={setVolume}
                  options={options} setOptions={setOptions} busy={busy} post={post}
                  onEditPlan={setEditPlan} onHistory={setHistory} onEditCountry={() => setEditCountry(true)} onCheckNow={checkNow} />
              : <CustomerPreview code={code} state={state} result={result} bench={bench} name={derived.nameOf(code)} volume={volume} setVolume={setVolume} />
          ) : <div className={`${CARD} text-sm text-slate-500`}>No countries yet.</div>}
        </div>
      </div>

      {editPlan && code && (
        <PlanModal plan={editPlan === 'new' ? null : editPlan} code={code} currency={result?.currency ?? 'EUR'} competitors={state.competitors}
          busy={busy !== null} today={state.today} onClose={() => setEditPlan(null)}
          onSave={async body => { if (await post('plan', body, editPlan === 'new' ? 'Added.' : 'Saved as a new version. The old one is in History.')) setEditPlan(null) }} />
      )}
      {history && <HistoryModal plan={history} plans={state.plans} competitor={compById.get(history.competitorId) ?? null} onClose={() => setHistory(null)} />}
      {editCountry && code && (
        <CountryModal name={derived.nameOf(code)} bench={bench} hasRow={derived.byCode.has(code)} today={state.today} busy={busy !== null}
          onClose={() => setEditCountry(false)}
          onSave={async fields => { if (await post('country', { action: 'edit_benchmark', countryCode: code, fields }, 'Saved. The old figures are kept.')) setEditCountry(false) }} />
      )}
    </div>
  )
}

// ── the admin view of one country ────────────────────────────────────────────────────────────────────────────────────
type Derived = { results: Map<string, CountryResult>; nameOf: (c: string) => string; group: (c: string) => string; byCode: Map<string, CountryRow> }
type Post = (label: string, body: Record<string, unknown>, done?: string) => Promise<boolean>

function CountryAdmin({ code, state, result, bench, derived, volume, setVolume, options, setOptions, busy, post, onEditPlan, onHistory, onEditCountry, onCheckNow }: {
  code: string; state: State; result: CountryResult; bench: Benchmark | null; derived: Derived; volume: VolumeKey; setVolume: (v: VolumeKey) => void
  options: CheckOptions; setOptions: (o: CheckOptions) => void; busy: string | null; post: Post
  onEditPlan: (p: CompetitorPlan) => void; onHistory: (p: CompetitorPlan) => void; onEditCountry: () => void; onCheckNow: (c: Competitor) => void
}) {
  const cur = result.currency
  const v = result.volumes.find(x => x.key === volume)
  const group = derived.group(code)
  const live = result.our.live
  const counted = (result.volumes[0]?.rivals ?? []).filter(r => r.reason === null)
  const verified = counted.filter(r => r.plan.verifiedAt).length
  const lastChecked = [bench?.checkedOn, ...counted.map(r => r.plan.checkedOn)].filter(Boolean).sort().pop()

  return (
    <>
      {/* 1 · the country header */}
      <section className={CARD} data-country-header>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-lg font-black text-slate-900">{derived.nameOf(code)} <span className="font-mono text-sm font-semibold text-slate-400">{code}</span></p>
            <p className="text-sm text-slate-500">
              <span className={`mr-2 rounded-full px-2 py-0.5 text-xs font-bold ${group === 'Live' ? 'bg-emerald-100 text-emerald-800' : group === 'Planned' ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-600'}`}>{group}</span>
              {cur} · last checked {lastChecked ?? '—'}
            </p>
          </div>
          <button type="button" className={BTN} onClick={onEditCountry}>Edit country data</button>
        </div>
        {result.problem && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">{result.problem}</p>}
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-4">
          <Tile label="Typical order">
            {bench ? <>
              <p className="text-xl font-black text-slate-900">{money(bench.mealMinor * bench.orderMultiplier, cur)}</p>
              <p className="text-xs text-slate-500">Meal {money(bench.mealMinor, cur)} × {bench.orderMultiplier} · {bench.mealSourceUrl
                ? <a className="underline" href={bench.mealSourceUrl} target="_blank" rel="noreferrer">{bench.mealSourceLabel ?? 'source'}</a> : bench.mealSourceLabel}</p>
              {!bench.mealSourceOk && <p className="mt-1 text-xs font-semibold text-amber-700">⚠ Not the cited source — check. {bench.notes}</p>}
            </> : <p className="text-sm text-slate-500">No benchmark yet.</p>}
          </Tile>
          <Tile label="Our card cost">
            {result.card ? <>
              <p className="text-xl font-black text-slate-900">{pct(result.card.bps)}{result.card.fixedMinor ? ` + ${money(result.card.fixedMinor, cur)}` : ''}</p>
              <p className="text-xs text-slate-500">{result.card.source === 'country' ? 'From Admin › Countries' : 'From this country’s data (no country row)'}</p>
            </> : <p className="text-sm text-amber-700">{bench?.notes ?? 'Not known.'}</p>}
          </Tile>
          <Tile label={live ? 'Our plans' : 'Our plans — proposed, not live'}>
            {result.our.plans.length ? (
              <ul className="space-y-0.5 text-sm">{result.our.plans.map(p => (
                <li key={p.key} className="flex justify-between gap-2"><span className="text-slate-600">{p.name}</span>
                  <span className="font-semibold text-slate-900">{money(p.monthlyMinor, cur)}{p.includedOnlineMinor ? <span className="font-normal text-slate-500"> incl. {whole(p.includedOnlineMinor, cur)}</span> : null}{p.feeBps ? <span className="font-normal text-slate-500"> · {pct(p.feeBps)}</span> : null}</span></li>
              ))}</ul>
            ) : <p className="text-sm text-slate-500">{result.our.problem}</p>}
          </Tile>
          <Tile label="Rivals verified">
            <p className="text-xl font-black text-slate-900">{verified} of {counted.length}</p>
            <p className="text-xs text-slate-500">Counted plans you have checked yourself</p>
          </Tile>
        </div>
      </section>

      {/* 2 · size, filters, verdict and the price that would win */}
      {v && (
        <section className={CARD} data-verdict>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SizeSwitch volume={volume} setVolume={setVolume} />
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700">
              {([['foodTruckOnly', 'Food-truck tools only'], ['countCustomerFees', 'Count fees customers pay'], ['verifiedOnly', 'Verified rivals only']] as const).map(([k, l]) => (
                <label key={k} className="inline-flex items-center gap-1.5"><input type="checkbox" checked={options[k]} onChange={e => setOptions({ ...options, [k]: e.target.checked })} />{l}</label>
              ))}
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">{v.orders.toLocaleString('en-GB')} online orders a month × {money(v.orderMinor, cur)} = {whole(v.revenueMinor, cur)} of online orders a month.</p>
          <Verdict v={v} cur={cur} />
          {v.suggestion && <WinCards v={v} cur={cur} code={code} live={live} />}
        </section>
      )}

      {/* 3 · the monthly cost table */}
      {v && <RivalTable v={v} cur={cur} live={live} today={state.today} busy={busy} post={post} onEditPlan={onEditPlan} onHistory={onHistory} onCheckNow={onCheckNow} />}

      {/* 4 · key features */}
      {v && <FeatureTable v={v} state={state} bench={bench} busy={busy} post={post} />}

      {/* 5 · the country's comparison page (compare-de-1) */}
      <ComparisonPanel code={code} state={state} busy={busy} post={post} />
    </>
  )
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p><div className="mt-1">{children}</div></div>
}

function SizeSwitch({ volume, setVolume }: { volume: VolumeKey; setVolume: (v: VolumeKey) => void }) {
  return (
    <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5 text-sm font-semibold" role="tablist" aria-label="Truck size">
      {VOLUMES.map(x => (
        <button key={x.key} type="button" role="tab" aria-selected={volume === x.key} onClick={() => setVolume(x.key)}
          className={`rounded-lg px-3 py-1 ${volume === x.key ? 'bg-orange-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}>
          {x.label} <span className={volume === x.key ? 'text-orange-100' : 'text-slate-400'}>{x.orders.toLocaleString('en-GB')}</span>
        </button>
      ))}
    </div>
  )
}

type Vol = CountryResult['volumes'][number]
const rivalName = (r: RivalTotal) => `${r.competitor?.name ?? 'Unknown'} — ${r.plan.planName}`

function Verdict({ v, cur }: { v: Vol; cur: string }) {
  if (!v.best) return null
  const ours = `${v.best.plan.name} at ${whole(v.best.totalMinor, cur)} a month`
  if (!v.cheapestRival) return <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700" data-verdict-box>No counted rival with these filters. Our cheapest plan is {ours}.</div>
  return (
    <div className={`mt-3 rounded-xl p-3 text-sm ${v.cheapest ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'}`} data-verdict-box>
      <p className="font-bold">{v.cheapest ? `We are the cheapest: ${ours}.` : `We are not the cheapest: ${ours}.`}</p>
      {v.cheapest
        ? <p>Next cheapest: {rivalName(v.cheapestRival)}, {whole(v.cheapestRival.comparableMinor, cur)}.</p>
        : <p>{v.beatenBy.length === 1 ? 'Cheaper: ' : `${v.beatenBy.length} rivals are cheaper: `}{v.beatenBy.slice(0, 4).map(r => `${rivalName(r)} (${whole(r.comparableMinor, cur)})`).join(', ')}{v.beatenBy.length > 4 ? ', …' : ''}.</p>}
    </div>
  )
}

function WinCards({ v, cur, code, live }: { v: Vol; cur: string; code: string; live: boolean }) {
  const s = v.suggestion!
  const diff = Math.round(s.diffPct * 10) / 10
  const sql = live ? s.cards.filter(c => c.state === 'price' && c.priceMinor !== null).map(c =>
    `-- ${c.label}: ${s.plan.name} ${money(c.priceMinor!, cur)} in ${code}. NOT RUN.\nupdate public.plan_prices set monthly_minor = ${c.priceMinor}, extra_van_monthly_minor = ${c.priceMinor}, updated_at = now()\n where country_code = '${code}' and plan_key = '${s.plan.key}' and monthly_minor = ${s.plan.monthlyMinor};`).join('\n\n') : ''
  return (
    <div className="mt-3" data-win>
      <p className="text-sm font-bold text-slate-900">What {s.plan.name} price would win</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {s.cards.map(c => (
          <div key={c.key} className="rounded-xl border border-slate-200 p-3" data-win-card={c.key}>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{c.label}</p>
            <p className="mt-1 text-2xl font-black text-slate-900">
              {c.state === 'price' ? money(c.priceMinor!, cur) : c.state === 'already_met' ? 'Already met' : c.state === 'not_possible' ? 'Not possible' : 'Below our lowest price point'}
            </p>
            <p className="text-xs text-slate-500">
              {c.state === 'not_possible' ? `${rivalName(s.rival)} costs less than card processing alone.`
                : c.state === 'already_met' ? `Today’s ${money(s.plan.monthlyMinor, cur)} is within it.`
                : `Up to ${money(Math.max(0, c.limitMinor), cur)} a month.`}
            </p>
            {c.atOrBelow && <p className="mt-1 text-xs font-semibold text-amber-700">⚠ At or below {c.atOrBelow.name} ({money(c.atOrBelow.monthlyMinor, cur)}).</p>}
          </div>
        ))}
      </div>
      <p className="mt-2 text-sm text-slate-700">Today: our {s.plan.name} totals {whole(s.todayMinor, cur)}, {Math.abs(diff)}% {diff >= 0 ? 'more' : 'less'} than {rivalName(s.rival)} ({whole(s.rival.comparableMinor, cur)}).</p>
      <p className="text-xs font-semibold text-slate-500">Nothing changes until you run the SQL.</p>
      {sql && (
        <details className="mt-1 text-xs">
          <summary className="cursor-pointer text-slate-500">SQL for these prices (not run)</summary>
          <pre className="mt-1 overflow-x-auto rounded-lg bg-slate-900 p-2 text-slate-100">{sql}</pre>
        </details>
      )}
    </div>
  )
}

function badges(r: RivalTotal, today: string): { label: string; cls: string }[] {
  const b: { label: string; cls: string }[] = []
  const p = r.plan
  b.push(p.verifiedAt ? { label: 'Verified by you', cls: 'bg-emerald-100 text-emerald-800' } : { label: 'Not verified', cls: 'bg-slate-100 text-slate-600' })
  if (r.cardAssumed || p.cardRateAssumed) b.push({ label: 'Card rate assumed', cls: 'bg-amber-100 text-amber-800' })
  if (p.unclear) b.push({ label: 'Unclear on their site', cls: 'bg-amber-100 text-amber-800' })
  if (p.secondHand) b.push({ label: 'Second-hand price', cls: 'bg-amber-100 text-amber-800' })
  if (p.source === 'manual') b.push({ label: 'From the manual', cls: 'bg-sky-100 text-sky-800' })
  if (isStale(p.checkedOn, today)) b.push({ label: 'Stale', cls: 'bg-red-100 text-red-700' })
  return b
}

function feesText(p: CompetitorPlan): string {
  const parts: string[] = []
  const f = (bps: number, fixed: number) => [bps ? pct(bps) : '', fixed ? money(fixed, p.currency) : ''].filter(Boolean).join(' + ')
  if (p.truckFeeBps || p.truckFeeFixedMinor) parts.push(`${f(p.truckFeeBps, p.truckFeeFixedMinor)} per order`)
  if (p.customerFeeBps || p.customerFeeFixedMinor) parts.push(`customer pays ${f(p.customerFeeBps, p.customerFeeFixedMinor)}`)
  if (p.includedOrders !== null && p.overageFixedMinor !== null) parts.push(`${p.includedOrders} orders incl., then ${money(p.overageFixedMinor, p.currency)} each`)
  if (p.orderCap !== null) parts.push(`up to ${p.orderCap.toLocaleString('en-GB')} orders`)
  return parts.join(' · ') || 'None'
}

function RivalTable({ v, cur, live, today, busy, post, onEditPlan, onHistory, onCheckNow }: {
  v: Vol; cur: string; live: boolean; today: string; busy: string | null; post: Post
  onEditPlan: (p: CompetitorPlan) => void; onHistory: (p: CompetitorPlan) => void; onCheckNow: (c: Competitor) => void
}) {
  const counted = v.rivals.filter(r => r.reason === null)
  const notCounted = v.rivals.filter(r => r.reason !== null)
  // Our cheapest plan takes its place in the order.
  const rows: ({ ours: true } | { ours: false; r: RivalTotal })[] = []
  let placed = false
  for (const r of counted) {
    if (!placed && v.best && v.best.totalMinor <= r.comparableMinor) { rows.push({ ours: true }); placed = true }
    rows.push({ ours: false, r })
  }
  if (!placed && v.best) rows.push({ ours: true })
  const th = 'px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap'
  const td = 'px-3 py-2 align-top'
  return (
    <section className={CARD} data-rivals>
      <p className="text-sm font-bold text-slate-900">Monthly cost to the truck</p>
      <p className="text-xs text-slate-500">Cheapest first — counting fees customers pay when that box is ticked. Rows the filters leave out are dimmed, not hidden.</p>
      <div className="mt-2 overflow-x-auto rounded-xl border border-slate-100" data-rivals-box>
        <table className="w-full min-w-[1080px] text-sm">
          <thead className="bg-slate-50"><tr>
            <th className={th}>Tool and plan</th><th className={th}>Built for</th><th className={th}>Price</th><th className={th}>Fees</th>
            <th className={th}>Card processing</th><th className={`${th} text-right`}>Total a month</th><th className={th}>Data</th><th className={th}></th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, i) => row.ours ? (
              <tr key="ours" className="bg-orange-50" data-ours-row>
                <td className={td}><p className="font-bold text-slate-900">HatchGrab — {v.best!.plan.name}</p><p className="text-xs text-slate-500">Our cheapest plan at this size</p></td>
                <td className={td}>Food trucks</td>
                <td className={td}>{money(v.best!.plan.monthlyMinor, cur)}/mo{v.best!.plan.includedOnlineMinor ? <p className="text-xs text-slate-500">incl. {whole(v.best!.plan.includedOnlineMinor, cur)}</p> : null}</td>
                <td className={td}>{v.best!.plan.feeBps ? `${pct(v.best!.plan.feeBps)} above the included amount (${whole(v.best!.feeMinor, cur)})` : 'None'}</td>
                <td className={td}>{whole(v.best!.cardMinor, cur)}</td>
                <td className={`${td} text-right font-black text-slate-900`}>{whole(v.best!.totalMinor, cur)}</td>
                <td className={td}><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${live ? 'bg-orange-100 text-orange-800' : 'bg-sky-100 text-sky-800'}`}>{live ? 'Our live prices' : 'Proposed, not live'}</span></td>
                <td className={td}></td>
              </tr>
            ) : (
              <tr key={row.r.plan.id} className={row.r.filteredOut ? 'opacity-45' : ''} data-rival-row={i}>
                <td className={td}>
                  <p className="font-semibold text-slate-900">{row.r.plan.sourceUrl ? <a className="hover:underline" href={row.r.plan.sourceUrl} target="_blank" rel="noreferrer">{row.r.competitor?.name}</a> : row.r.competitor?.name}
                    {/* global-players-1: a till / POS player — left out by "Food-truck tools only" (on by default). */}
                    {row.r.competitor?.focus === 'pos' && <span className="ml-1.5 rounded bg-slate-800 px-1.5 py-0.5 align-middle text-[10px] font-bold text-white" data-pos-badge>POS</span>}</p>
                  <p className="text-xs text-slate-500">{row.r.plan.planName}{row.r.plan.yearlyOnly ? ' · billed yearly' : ''}</p>
                </td>
                <td className={td}>{row.r.competitor?.focus ? FOCUS_LABEL[row.r.competitor.focus] : <span className="text-slate-400">Not recorded</span>}</td>
                <td className={td}>{row.r.plan.monthlyMinor === null ? '—' : `${money(row.r.plan.monthlyMinor, row.r.plan.currency)}/mo`}
                  {row.r.plan.setupMinor ? <p className="text-xs text-slate-500">+ {money(row.r.plan.setupMinor, row.r.plan.currency)} setup</p> : null}</td>
                <td className={td}><span className="text-slate-700">{feesText(row.r.plan)}</span></td>
                <td className={td}>{row.r.plan.cardBps !== null ? `${row.r.plan.cardMode === 'bundled' ? 'Included' : 'Separate'}: ${pct(row.r.plan.cardBps)}${row.r.plan.cardFixedMinor ? ` + ${money(row.r.plan.cardFixedMinor, row.r.plan.currency)}` : ''}` : 'Not published — ours assumed'}
                  <p className="text-xs text-slate-500">{whole(row.r.parts.cardMinor, cur)}</p></td>
                <td className={`${td} text-right`}><p className="font-black text-slate-900">{whole(row.r.truckMinor, cur)}</p>
                  {row.r.customerMinor > 0.5 ? <p className="text-xs text-slate-500">+ {whole(row.r.customerMinor, cur)} paid by customers</p> : null}</td>
                <td className={td}><div className="flex max-w-[15rem] flex-wrap gap-1">{badges(row.r, today).map(b => <span key={b.label} className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${b.cls}`}>{b.label}</span>)}</div></td>
                <td className={`${td} whitespace-nowrap`}>
                  <div className="flex gap-1">
                    <button type="button" className={BTN} disabled={busy !== null}
                      onClick={() => post('verify', { action: row.r.plan.verifiedAt ? 'unverify' : 'verify', id: row.r.plan.id })}>{row.r.plan.verifiedAt ? 'Undo verified' : 'Mark verified'}</button>
                    <button type="button" className={BTN} onClick={() => onEditPlan(row.r.plan)}>Edit</button>
                    <button type="button" className={BTN} onClick={() => onHistory(row.r.plan)}>History</button>
                    {/* competitor-check-1: puts this competitor first in the next automatic check. */}
                    {row.r.competitor && (row.r.competitor.checkRequestedAt
                      ? <span className="self-center rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-800" data-check-queued>Check queued</span>
                      : <button type="button" className={BTN} disabled={busy !== null} data-check-now onClick={() => onCheckNow(row.r.competitor!)}>Check now</button>)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {notCounted.length > 0 && (
        <div className="mt-3" data-not-counted>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Not counted</p>
          {/* grid-cols-1 (minmax(0, 1fr)), not a bare `grid`: an implicit column is as wide as its widest name, and on a
              phone that pushed the page sideways. */}
          <ul className="mt-1 grid grid-cols-1 gap-x-6 gap-y-1 text-sm text-slate-600 md:grid-cols-2">
            {notCounted.map(r => (
              <li key={r.plan.id} className="flex min-w-0 items-baseline justify-between gap-2">
                <span className="min-w-0 truncate">{r.competitor?.name} — {r.plan.planName}</span>
                <span className="flex shrink-0 items-center gap-1"><span className="text-xs text-slate-500">{r.reason}</span>
                  <button type="button" className="text-xs font-semibold text-slate-500 underline" onClick={() => onEditPlan(r.plan)}>Edit</button></span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

const TRI_LABEL: Record<Tri, string> = { yes: 'Yes', no: 'No', unknown: 'Not checked' }
const NEXT: Record<Tri, Tri> = { yes: 'no', no: 'unknown', unknown: 'yes' }

function FeatureTable({ v, state, bench, busy, post }: { v: Vol; state: State; bench: Benchmark | null; busy: string | null; post: Post }) {
  // The five cheapest counted rivals (one column per tool), with the current filters.
  const cols: Competitor[] = []
  for (const r of v.rivals) {
    if (r.reason !== null || r.filteredOut || !r.competitor || cols.some(c => c.id === r.competitor!.id)) continue
    cols.push(r.competitor); if (cols.length === 5) break
  }
  const th = 'px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500'
  return (
    <section className={CARD} data-features>
      <p className="text-sm font-bold text-slate-900">Key features</p>
      <div className="mt-2 overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50"><tr><th className={th}>Feature</th><th className={`${th} text-orange-700`}>HatchGrab</th>{cols.map(c => <th key={c.id} className={th}>{c.name}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            <FeatureRows competitors={cols} state={state} bench={bench} busy={busy} post={post} />
            <tr>
              <td className="px-3 py-2 font-semibold text-slate-700">Payment providers</td>
              <td className="px-3 py-2 text-slate-700">Stripe</td>
              {cols.map(c => <td key={c.id} className="px-3 py-2 text-slate-600">{c.paymentProviders ?? <span className="text-slate-400">Not recorded</span>}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">Ordering, kitchen screen, printed tickets, allergens and the rest are standard on every plan, so they are not compared here.</p>
    </section>
  )
}

/** Every compared feature as tri buttons (the six key ones, then the comparison page's four), then the two as-advertised
 *  texts. A click saves at once and stamps the features checked today (set_feature, as pricing-check-1). */
function FeatureRows({ competitors, state, bench, busy, post }: { competitors: Competitor[]; state: State; bench: Benchmark | null; busy: string | null; post: Post }) {
  return (
    <>
      {[...KEY_FEATURES, ...COMPARE_FEATURES].map(f => (
        <tr key={f.column} data-feature-row={f.column}>
          <td className="px-3 py-2 font-semibold text-slate-700">{f.label}</td>
          <td className="px-3 py-2 font-semibold text-slate-900">{ourFeatureCell(state.catalog, f, bench)}</td>
          {competitors.map(c => {
            const val = c[f.column as KeyFeatureColumn | CompareFeatureColumn]
            return (
              <td key={c.id} className="px-3 py-2">
                <button type="button" disabled={busy !== null} title="Click to change: Yes → No → Not checked"
                  onClick={() => post('feature', { action: 'set_feature', competitorId: c.id, column: f.column, value: NEXT[val] })}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${val === 'yes' ? 'bg-emerald-100 text-emerald-800' : val === 'no' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>
                  {TRI_LABEL[val]}
                </button>
              </td>
            )
          })}
        </tr>
      ))}
      {([['paymentMethods', 'Payment methods (as advertised)', 'Card, PayPal, …'], ['minTerm', 'Minimum term (as advertised)', '12 months, none, …']] as const).map(([field, label, hint]) => (
        <tr key={field} data-feature-row={field}>
          <td className="px-3 py-2 font-semibold text-slate-700">{label}</td>
          <td className="px-3 py-2 text-slate-500">From the page’s messages</td>
          {competitors.map(c => (
            <td key={c.id} className="px-3 py-2">
              <TextCell value={c[field]} placeholder={hint} busy={busy !== null}
                onSave={value => post('text', { action: 'set_competitor_text', competitorId: c.id, field, value }, 'Saved.')} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

/** A text that saves when it loses focus or on Enter, only when it changed. */
function TextCell({ value, placeholder, busy, onSave }: { value: string | null; placeholder: string; busy: boolean; onSave: (v: string | null) => void }) {
  const [text, setText] = useState(value ?? '')
  const [was, setWas] = useState(value)
  if (was !== value) { setWas(value); setText(value ?? '') }
  const save = () => { const v = text.trim() || null; if (v !== (value ?? null)) onSave(v) }
  return <input className={`${BOX} min-w-[9rem]`} value={text} placeholder={placeholder} disabled={busy} aria-label={placeholder}
    onChange={e => setText(e.target.value)} onBlur={save} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
}

// ── the comparison page panel (compare-de-1) ─────────────────────────────────────────────────────────────────────────
/** The plan a comparison entry shows: its own if current, else the current plan of the same competitor and country
 *  (an edit supersedes a plan, and the page follows it — lib/comparison.ts does the same). */
function entryPlan(e: ComparisonEntry, plans: CompetitorPlan[]): CompetitorPlan | null {
  const own = e.primaryPlanId ? plans.find(p => p.id === e.primaryPlanId) ?? null : null
  if (own && own.supersededAt === null) return own
  const current = plans.filter(p => p.competitorId === e.competitorId && p.countryCode === e.countryCode && p.supersededAt === null)
  return (own && current.find(p => p.planName === own.planName)) ?? current[0] ?? null
}

function ComparisonPanel({ code, state, busy, post }: { code: string; state: State; busy: string | null; post: Post }) {
  const [adding, setAdding] = useState('')
  const compById = new Map(state.competitors.map(c => [c.id, c]))
  const entries = state.entries.filter(e => e.countryCode === code).sort((a, b) => a.sortOrder - b.sortOrder)
  // Competitors with a current plan in this country that are not on the page yet.
  const candidates = state.competitors.filter(c => !entries.some(e => e.competitorId === c.id)
    && state.plans.some(p => p.competitorId === c.id && p.countryCode === code && p.supersededAt === null))
  const publicCount = entries.filter(e => { const p = entryPlan(e, state.plans); return e.verifiedAt && p?.verifiedAt && compById.get(e.competitorId)?.featuresVerifiedAt }).length
  const ok = 'bg-emerald-100 text-emerald-800', no = 'bg-orange-100 text-orange-800'
  return (
    <section className={CARD} data-comparison-panel>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-slate-900">Comparison page</p>
          <p className="text-xs text-slate-500">Who the country’s public comparison page shows. A competitor is public only when the entry, its plan and its features are all verified · {publicCount} of {entries.length} public.</p>
        </div>
      </div>
      {!state.entriesReady ? (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">Run supabase/migrations/20261042_compare_de_1.sql to manage the comparison page.</p>
      ) : (
        <>
          {entries.length ? (
            <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-100">
              {entries.map((e, i) => {
                const c = compById.get(e.competitorId)
                const plan = entryPlan(e, state.plans)
                const plans = state.plans.filter(p => p.competitorId === e.competitorId && p.countryCode === code && p.supersededAt === null)
                return (
                  <li key={e.id} className="space-y-2 p-3" data-entry={c?.name}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-slate-900">{i + 1}. {c?.name ?? 'Unknown'}{c?.focus === 'pos' && <span className="ml-1.5 rounded bg-slate-800 px-1.5 py-0.5 align-middle text-[10px] font-bold text-white" data-pos-badge>POS</span>}</p>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
                        <span className={`rounded-full px-2 py-0.5 ${e.verifiedAt ? ok : no}`}>Entry {e.verifiedAt ? 'verified' : 'not verified'}</span>
                        <span className={`rounded-full px-2 py-0.5 ${plan?.verifiedAt ? ok : no}`}>Plan {plan?.verifiedAt ? 'verified' : 'not verified'}</span>
                        <span className={`rounded-full px-2 py-0.5 ${c?.featuresVerifiedAt ? ok : no}`}>Features {c?.featuresVerifiedAt ? 'verified' : 'not verified'}</span>
                      </div>
                    </div>
                    <div className="grid gap-2 md:grid-cols-[14rem_minmax(0,1fr)]">
                      <select className={BOX} aria-label="Plan shown" value={plan?.id ?? ''} disabled={busy !== null}
                        onChange={ev => post('entry', { action: 'entry_update', id: e.id, fields: { primaryPlanId: ev.target.value || null } }, 'Saved. Verify the entry again.')}>
                        <option value="">No plan</option>
                        {plans.map(p => <option key={p.id} value={p.id}>{p.planName}{p.verifiedAt ? ' ✓' : ''}</option>)}
                      </select>
                      <TextCell value={e.chooseWhen} placeholder="passt, wenn … (shown on the page)" busy={busy !== null}
                        onSave={value => post('entry', { action: 'entry_update', id: e.id, fields: { chooseWhen: value } }, 'Saved. Verify the entry again.')} />
                      {/* global-players-1: the label under the tool's name on the page; empty = the label for its focus. */}
                      <span className="text-xs font-semibold text-slate-500 md:self-center">Group label</span>
                      <TextCell value={e.groupLabel ?? null} placeholder="e.g. Kasse mit Online-Shop (empty = by focus)" busy={busy !== null}
                        onSave={value => post('entry', { action: 'entry_update', id: e.id, fields: { groupLabel: value } }, 'Saved. Verify the entry again.')} />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" className={BTN} disabled={busy !== null} onClick={() => post('entry', { action: e.verifiedAt ? 'entry_unverify' : 'entry_verify', id: e.id })}>{e.verifiedAt ? 'Undo entry verified' : 'Mark entry verified'}</button>
                      {plan && <button type="button" className={BTN} disabled={busy !== null} onClick={() => post('verify', { action: plan.verifiedAt ? 'unverify' : 'verify', id: plan.id })}>{plan.verifiedAt ? 'Undo plan verified' : 'Mark plan verified'}</button>}
                      {c && <button type="button" className={BTN} disabled={busy !== null} onClick={() => post('features', { action: c.featuresVerifiedAt ? 'unverify_features' : 'verify_features', competitorId: c.id })}>{c.featuresVerifiedAt ? 'Undo features verified' : 'Mark features verified'}</button>}
                      <button type="button" className={BTN} disabled={busy !== null || i === 0} aria-label="Move up" onClick={() => post('entry', { action: 'entry_move', id: e.id, dir: 'up' })}>↑</button>
                      <button type="button" className={BTN} disabled={busy !== null || i === entries.length - 1} aria-label="Move down" onClick={() => post('entry', { action: 'entry_move', id: e.id, dir: 'down' })}>↓</button>
                      <button type="button" className={`${BTN} text-red-700`} disabled={busy !== null} onClick={() => { if (window.confirm(`Take ${c?.name ?? 'this competitor'} off the comparison page?`)) post('entry', { action: 'entry_remove', id: e.id }, 'Removed from the page.') }}>Remove</button>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : <p className="mt-2 text-sm text-slate-500">No competitors on this country’s page yet.</p>}
          {entries.length > 0 && (
            <div className="mt-3 overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full min-w-[760px] text-sm" data-entry-features>
                <thead className="bg-slate-50"><tr>
                  <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">Feature</th>
                  <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-orange-700">HatchGrab</th>
                  {entries.map(e => <th key={e.id} className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">{compById.get(e.competitorId)?.name}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  <FeatureRows competitors={entries.map(e => compById.get(e.competitorId)).filter((c): c is Competitor => !!c)} state={state}
                    bench={state.benchmarks.find(b => b.countryCode === code && b.supersededAt === null) ?? null} busy={busy} post={post} />
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select className={`${BOX} max-w-xs`} aria-label="Competitor to add" value={adding} onChange={e => setAdding(e.target.value)}>
              <option value="">Add a competitor with a plan here…</option>
              {candidates.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button type="button" className={BTN} disabled={busy !== null || !adding}
              onClick={async () => { if (await post('entry', { action: 'entry_add', countryCode: code, competitorId: adding }, 'Added, unverified.')) setAdding('') }}>Add to the page</button>
          </div>
        </>
      )}
    </section>
  )
}

// ── the customer preview (a mock; admin-only, no public route) ───────────────────────────────────────────────────────
function CustomerPreview({ code, state, result, bench, name, volume, setVolume }: {
  code: string; state: State; result: CountryResult; bench: Benchmark | null; name: string; volume: VolumeKey; setVolume: (v: VolumeKey) => void
}) {
  const cur = result.currency
  const v = result.volumes.find(x => x.key === volume)
  const verified = (v?.rivals ?? []).filter(r => r.reason === null && r.plan.verifiedAt)
  const bars = v?.best ? [{ label: `HatchGrab — ${v.best.plan.name}`, minor: v.best.totalMinor, ours: true }, ...verified.map(r => ({ label: rivalName(r), minor: r.comparableMinor, ours: false }))]
    .sort((a, b) => a.minor - b.minor) : []
  const max = Math.max(1, ...bars.map(b => b.minor))
  const comps = [...new Map(verified.map(r => [r.competitor!.id, r.competitor!])).values()]
  return (
    <section className={CARD} data-preview>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-sky-700">Customer preview · a mock, not published anywhere</p>
          <p className="text-lg font-black text-slate-900">What a truck pays each month · {name}</p>
        </div>
        <SizeSwitch volume={volume} setVolume={setVolume} />
      </div>
      {!verified.length ? (
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">No rival is verified in {code} yet, so a customer would see nothing to compare. Mark rivals verified in Admin view first.</p>
      ) : (
        <>
          <ul className="mt-3 space-y-2">
            {bars.map(b => (
              <li key={b.label} className="grid grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto] items-center gap-2 text-sm">
                <span className={`truncate ${b.ours ? 'font-bold text-orange-700' : 'text-slate-700'}`}>{b.label}</span>
                <span className="h-3 rounded-full bg-slate-100"><span className={`block h-3 rounded-full ${b.ours ? 'bg-orange-500' : 'bg-slate-400'}`} style={{ width: `${(b.minor / max) * 100}%` }} /></span>
                <span className="font-semibold text-slate-900">{whole(b.minor, cur)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm font-bold text-slate-900">What’s included</p>
          <div className="mt-1 overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50"><tr><th className="px-3 py-2 text-left text-[11px] font-bold uppercase text-slate-500">Feature</th>
                <th className="px-3 py-2 text-left text-[11px] font-bold uppercase text-orange-700">HatchGrab</th>
                {comps.map(c => <th key={c.id} className="px-3 py-2 text-left text-[11px] font-bold uppercase text-slate-500">{c.name}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {KEY_FEATURES.map(f => (
                  <tr key={f.column}><td className="px-3 py-2 text-slate-700">{f.label}</td>
                    <td className="px-3 py-2 font-semibold">{ourFeatureCell(state.catalog, f, bench)}</td>
                    {comps.map(c => <td key={c.id} className="px-3 py-2 text-slate-600">{c.featuresVerifiedAt ? TRI_LABEL[c[f.column as KeyFeatureColumn]] : 'Not checked'}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

// ── modals ───────────────────────────────────────────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-lg font-black text-slate-900">{title}</p>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-lg px-2 text-xl text-slate-400 hover:text-slate-700">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>{children}{hint && <span className="mt-0.5 block text-[11px] text-slate-400">{hint}</span>}</label>
}

function PlanModal({ plan, code, currency, competitors, busy, today, onClose, onSave }: {
  plan: CompetitorPlan | null; code: string; currency: string; competitors: Competitor[]; busy: boolean; today: string
  onClose: () => void; onSave: (body: Record<string, unknown>) => void
}) {
  const p = plan
  const cur0 = p?.currency ?? currency
  const [f, setF] = useState({
    competitorName: '', website: '', focus: 'food_truck' as Focus | '',
    planName: p?.planName ?? '', currency: cur0, priceHidden: p?.priceHidden ?? false, monthly: toMajorText(p?.monthlyMinor ?? null, cur0), yearlyOnly: p?.yearlyOnly ?? false,
    setup: toMajorText(p?.setupMinor ?? 0, cur0), truckPct: p ? String(p.truckFeeBps / 100) : '0', truckFixed: toMajorText(p?.truckFeeFixedMinor ?? 0, cur0),
    custPct: p ? String(p.customerFeeBps / 100) : '0', custFixed: toMajorText(p?.customerFeeFixedMinor ?? 0, cur0), cardMode: p?.cardMode ?? 'unknown',
    cardPct: p?.cardBps === null || p?.cardBps === undefined ? '' : String(p.cardBps / 100), cardFixed: toMajorText(p?.cardFixedMinor ?? null, cur0),
    orderCap: p?.orderCap?.toString() ?? '', included: p?.includedOrders?.toString() ?? '', overage: toMajorText(p?.overageFixedMinor ?? null, cur0),
    vat: p?.vat ?? 'unknown', status: p?.status ?? 'counted', unclear: p?.unclear ?? false, secondHand: p?.secondHand ?? false,
    sourceUrl: p?.sourceUrl ?? '', checkedOn: today, notes: p?.notes ?? '',
  })
  const [err, setErr] = useState<string | null>(null)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(prev => ({ ...prev, [k]: v }))
  const bps = (s: string) => { const n = Number(s.trim() || '0'); return Number.isFinite(n) ? Math.round(n * 100) : NaN }
  const int = (s: string) => (s.trim() === '' ? null : Number.isInteger(Number(s)) ? Number(s) : NaN)
  const submit = () => {
    const cur = f.currency.trim().toUpperCase()
    let digitsOk = true; try { minorDigits(cur) } catch { digitsOk = false }
    if (!/^[A-Z]{3}$/.test(cur) || !digitsOk) { setErr('Currency must be a three-letter code, e.g. GBP.'); return }
    const fields: Record<string, unknown> = {
      planName: f.planName, currency: cur, priceHidden: f.priceHidden, monthlyMinor: toMinor(f.monthly, cur), yearlyOnly: f.yearlyOnly,
      setupMinor: toMinor(f.setup, cur) ?? 0, truckFeeBps: bps(f.truckPct), truckFeeFixedMinor: toMinor(f.truckFixed, cur) ?? 0,
      customerFeeBps: bps(f.custPct), customerFeeFixedMinor: toMinor(f.custFixed, cur) ?? 0, cardMode: f.cardMode,
      cardBps: f.cardPct.trim() === '' ? null : bps(f.cardPct), cardFixedMinor: f.cardPct.trim() === '' ? null : toMinor(f.cardFixed, cur) ?? 0,
      orderCap: int(f.orderCap), includedOrders: int(f.included), overageFixedMinor: toMinor(f.overage, cur),
      vat: f.vat, status: f.status, unclear: f.unclear, secondHand: f.secondHand, sourceUrl: f.sourceUrl, checkedOn: f.checkedOn, notes: f.notes,
    }
    if (Object.values(fields).some(x => typeof x === 'number' && Number.isNaN(x))) { setErr('Check the numbers — one of them is not a number.'); return }
    setErr(null)
    if (p) onSave({ action: 'edit_plan', id: p.id, fields })
    else onSave({ action: 'add_competitor', competitor: { name: f.competitorName, website: f.website, focus: f.focus || null }, plan: { ...fields, countryCode: code } })
  }
  const cb = (k: 'priceHidden' | 'yearlyOnly' | 'unclear' | 'secondHand', l: string) => (
    <label className="inline-flex items-center gap-1.5 text-sm text-slate-700"><input type="checkbox" checked={f[k]} onChange={e => set(k, e.target.checked)} />{l}</label>
  )
  return (
    <Modal title={p ? `Edit ${p.planName}` : `Add a competitor in ${code}`} onClose={onClose}>
      {p && <p className="mb-3 text-xs text-slate-500">Saving keeps this version in History and starts a new one, unverified.</p>}
      <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {!p && <>
          <Field label="Competitor" hint="An existing name adds a plan to it"><input className={BOX} list="pc-competitors" value={f.competitorName} onChange={e => set('competitorName', e.target.value)} />
            <datalist id="pc-competitors">{competitors.map(c => <option key={c.id} value={c.name} />)}</datalist></Field>
          <Field label="Website"><input className={BOX} value={f.website} placeholder="https://" onChange={e => set('website', e.target.value)} /></Field>
          <Field label="Built for"><select className={BOX} value={f.focus} onChange={e => set('focus', e.target.value as Focus | '')}>
            <option value="">Not recorded</option>{(Object.keys(FOCUS_LABEL) as Focus[]).map(k => <option key={k} value={k}>{FOCUS_LABEL[k]}</option>)}</select></Field>
        </>}
        <Field label="Plan name"><input className={BOX} value={f.planName} onChange={e => set('planName', e.target.value)} /></Field>
        <Field label="Currency"><input className={`${BOX} uppercase`} maxLength={3} value={f.currency} onChange={e => set('currency', e.target.value)} /></Field>
        <Field label="Monthly price" hint="Empty = no price"><input className={BOX} inputMode="decimal" value={f.monthly} onChange={e => set('monthly', e.target.value)} /></Field>
        <Field label="Setup fee"><input className={BOX} inputMode="decimal" value={f.setup} onChange={e => set('setup', e.target.value)} /></Field>
        <Field label="Fee the truck pays, % per order"><input className={BOX} inputMode="decimal" value={f.truckPct} onChange={e => set('truckPct', e.target.value)} /></Field>
        <Field label="Fixed fee the truck pays, per order"><input className={BOX} inputMode="decimal" value={f.truckFixed} onChange={e => set('truckFixed', e.target.value)} /></Field>
        <Field label="Fee customers pay, % per order"><input className={BOX} inputMode="decimal" value={f.custPct} onChange={e => set('custPct', e.target.value)} /></Field>
        <Field label="Fixed fee customers pay, per order"><input className={BOX} inputMode="decimal" value={f.custFixed} onChange={e => set('custFixed', e.target.value)} /></Field>
        <Field label="Card processing"><select className={BOX} value={f.cardMode} onChange={e => set('cardMode', e.target.value as CompetitorPlan['cardMode'])}>
          <option value="bundled">Included in their price</option><option value="separate">Separate (their processor)</option><option value="unknown">Not known</option></select></Field>
        <Field label="Card rate, %" hint="Empty = not published (ours is assumed)"><input className={BOX} inputMode="decimal" value={f.cardPct} onChange={e => set('cardPct', e.target.value)} /></Field>
        <Field label="Card fixed part, per order"><input className={BOX} inputMode="decimal" value={f.cardFixed} disabled={f.cardPct.trim() === ''} onChange={e => set('cardFixed', e.target.value)} /></Field>
        <Field label="Order cap" hint="Empty = none"><input className={BOX} inputMode="numeric" value={f.orderCap} onChange={e => set('orderCap', e.target.value)} /></Field>
        <Field label="Orders included" hint="With a price per extra order"><input className={BOX} inputMode="numeric" value={f.included} onChange={e => set('included', e.target.value)} /></Field>
        <Field label="Price per extra order"><input className={BOX} inputMode="decimal" value={f.overage} onChange={e => set('overage', e.target.value)} /></Field>
        <Field label="VAT"><select className={BOX} value={f.vat} onChange={e => set('vat', e.target.value as CompetitorPlan['vat'])}>
          <option value="incl">Included</option><option value="excl">Excluded</option><option value="unknown">Not stated</option></select></Field>
        <Field label="Counted"><select className={BOX} value={f.status} onChange={e => set('status', e.target.value as CompetitorPlan['status'])}>
          <option value="counted">Counted</option><option value="hidden">Price hidden</option><option value="closed">Closed to new customers</option><option value="excluded">Left out on purpose</option></select></Field>
        <Field label="Their pricing page"><input className={BOX} value={f.sourceUrl} placeholder="https://" onChange={e => set('sourceUrl', e.target.value)} /></Field>
        <Field label="Checked on"><input className={BOX} type="date" value={f.checkedOn} onChange={e => set('checkedOn', e.target.value)} /></Field>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">{cb('priceHidden', 'Price hidden')}{cb('yearlyOnly', 'Only a yearly price')}{cb('unclear', 'Unclear on their site')}{cb('secondHand', 'Second-hand price')}</div>
      <div className="mt-3"><Field label="Notes"><textarea className={`${BOX} h-20`} value={f.notes} onChange={e => set('notes', e.target.value)} /></Field></div>
      {err && <p className="mt-2 text-sm font-semibold text-red-600">{err}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className={BTN} onClick={onClose}>Cancel</button>
        <button type="button" disabled={busy} onClick={submit} className="rounded-xl bg-orange-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50">{p ? 'Save as new version' : 'Add'}</button>
      </div>
    </Modal>
  )
}

function HistoryModal({ plan, plans, competitor, onClose }: { plan: CompetitorPlan; plans: CompetitorPlan[]; competitor: Competitor | null; onClose: () => void }) {
  // Versions of this competitor's plans in this country (the schema keeps no link between versions, so all of them).
  const list = plans.filter(p => p.competitorId === plan.competitorId && p.countryCode === plan.countryCode)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
  return (
    <Modal title={`History — ${competitor?.name ?? ''} in ${plan.countryCode}`} onClose={onClose}>
      <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
        <thead className="bg-slate-50"><tr>{['Plan', 'Monthly', 'Fees', 'Checked', 'Source', 'State'].map(h => <th key={h} className="px-3 py-2 text-left text-[11px] font-bold uppercase text-slate-500">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">{list.map(p => (
          <tr key={p.id} className={p.supersededAt ? 'text-slate-500' : 'font-semibold text-slate-900'}>
            <td className="px-3 py-2">{p.planName}</td>
            <td className="px-3 py-2">{p.monthlyMinor === null ? '—' : money(p.monthlyMinor, p.currency)}</td>
            <td className="px-3 py-2">{feesText(p)}</td>
            <td className="px-3 py-2">{p.checkedOn}</td>
            <td className="px-3 py-2">{p.source}</td>
            <td className="px-3 py-2">{p.supersededAt ? `Replaced ${p.supersededAt.slice(0, 10)}` : 'Current'}{p.verifiedAt ? ' · verified' : ''}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </Modal>
  )
}

function CountryModal({ name, bench, hasRow, today, busy, onClose, onSave }: {
  name: string; bench: Benchmark | null; hasRow: boolean; today: string; busy: boolean; onClose: () => void; onSave: (fields: Record<string, unknown>) => void
}) {
  const cur0 = bench?.currency ?? 'EUR'
  const tri = (b: boolean | null | undefined) => (b === true ? 'yes' : b === false ? 'no' : '')
  const [f, setF] = useState({
    currency: cur0, meal: toMajorText(bench?.mealMinor ?? null, cur0), mealSourceLabel: bench?.mealSourceLabel ?? '', mealSourceUrl: bench?.mealSourceUrl ?? '',
    mealSourceOk: bench?.mealSourceOk ?? true, orderMultiplier: String(bench?.orderMultiplier ?? 1.3), eurRate: String(bench?.eurRate ?? ''), eurRateDate: bench?.eurRateDate ?? today,
    cardPct: bench?.cardBps === null || bench?.cardBps === undefined ? '' : String(bench.cardBps / 100), cardFixed: toMajorText(bench?.cardFixedMinor ?? null, cur0),
    pro: toMajorText(bench?.plannedProMinor ?? null, cur0), proIncl: toMajorText(bench?.plannedProIncludedMinor ?? null, cur0), unl: toMajorText(bench?.plannedUnlimitedMinor ?? null, cur0),
    ios: tri(bench?.iosAppAvailable), android: tri(bench?.androidAppAvailable), notes: bench?.notes ?? '', checkedOn: today,
  })
  const [err, setErr] = useState<string | null>(null)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(prev => ({ ...prev, [k]: v }))
  const submit = () => {
    const cur = f.currency.trim().toUpperCase()
    const fields: Record<string, unknown> = {
      mealMinor: toMinor(f.meal, cur), mealSourceLabel: f.mealSourceLabel, mealSourceUrl: f.mealSourceUrl, mealSourceOk: f.mealSourceOk,
      orderMultiplier: Number(f.orderMultiplier), eurRate: Number(f.eurRate), eurRateDate: f.eurRateDate,
      iosAppAvailable: f.ios === '' ? null : f.ios === 'yes', androidAppAvailable: f.android === '' ? null : f.android === 'yes', notes: f.notes, checkedOn: f.checkedOn,
    }
    if (!hasRow) Object.assign(fields, {
      cardBps: f.cardPct.trim() === '' ? null : Math.round(Number(f.cardPct) * 100), cardFixedMinor: f.cardPct.trim() === '' ? null : toMinor(f.cardFixed, cur) ?? 0,
      plannedProMinor: toMinor(f.pro, cur), plannedProIncludedMinor: toMinor(f.proIncl, cur), plannedUnlimitedMinor: toMinor(f.unl, cur),
    })
    if (!bench) fields.currency = cur
    if (Object.values(fields).some(x => typeof x === 'number' && Number.isNaN(x))) { setErr('Check the numbers — one of them is not a number.'); return }
    setErr(null); onSave(fields)
  }
  return (
    <Modal title={`${name} — country data`} onClose={onClose}>
      <p className="mb-3 text-xs text-slate-500">Saving keeps the old figures and starts a new set.{hasRow ? ' Our card rate here comes from Admin › Countries.' : ' This country has no country row, so its card rate and proposed prices live here.'}</p>
      <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {!bench && <Field label="Currency"><input className={`${BOX} uppercase`} maxLength={3} value={f.currency} onChange={e => set('currency', e.target.value)} /></Field>}
        <Field label={`Meal price (${f.currency})`}><input className={BOX} inputMode="decimal" value={f.meal} onChange={e => set('meal', e.target.value)} /></Field>
        <Field label="Source"><input className={BOX} value={f.mealSourceLabel} onChange={e => set('mealSourceLabel', e.target.value)} /></Field>
        <Field label="Source link"><input className={BOX} value={f.mealSourceUrl} onChange={e => set('mealSourceUrl', e.target.value)} /></Field>
        <Field label="Order size, × the meal"><input className={BOX} inputMode="decimal" value={f.orderMultiplier} onChange={e => set('orderMultiplier', e.target.value)} /></Field>
        <Field label={`${f.currency} per 1 EUR`}><input className={BOX} inputMode="decimal" value={f.eurRate} onChange={e => set('eurRate', e.target.value)} /></Field>
        <Field label="Rate date"><input className={BOX} type="date" value={f.eurRateDate} onChange={e => set('eurRateDate', e.target.value)} /></Field>
        {!hasRow && <>
          <Field label="Our card rate, %"><input className={BOX} inputMode="decimal" value={f.cardPct} onChange={e => set('cardPct', e.target.value)} /></Field>
          <Field label="Our card fixed part"><input className={BOX} inputMode="decimal" value={f.cardFixed} onChange={e => set('cardFixed', e.target.value)} /></Field>
          <Field label="Proposed Pro price"><input className={BOX} inputMode="decimal" value={f.pro} onChange={e => set('pro', e.target.value)} /></Field>
          <Field label="Proposed Pro includes"><input className={BOX} inputMode="decimal" value={f.proIncl} onChange={e => set('proIncl', e.target.value)} /></Field>
          <Field label="Proposed Unlimited price"><input className={BOX} inputMode="decimal" value={f.unl} onChange={e => set('unl', e.target.value)} /></Field>
        </>}
        <Field label="iPhone app sold here"><select className={BOX} value={f.ios} onChange={e => set('ios', e.target.value)}><option value="">Not known</option><option value="yes">Yes</option><option value="no">No</option></select></Field>
        <Field label="Android app sold here"><select className={BOX} value={f.android} onChange={e => set('android', e.target.value)}><option value="">Not known</option><option value="yes">Yes</option><option value="no">No</option></select></Field>
        <Field label="Checked on"><input className={BOX} type="date" value={f.checkedOn} onChange={e => set('checkedOn', e.target.value)} /></Field>
      </div>
      <label className="mt-3 inline-flex items-center gap-1.5 text-sm text-slate-700"><input type="checkbox" checked={f.mealSourceOk} onChange={e => set('mealSourceOk', e.target.checked)} />The source link is the cited source</label>
      <div className="mt-3"><Field label="Notes"><textarea className={`${BOX} h-16`} value={f.notes} onChange={e => set('notes', e.target.value)} /></Field></div>
      {err && <p className="mt-2 text-sm font-semibold text-red-600">{err}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className={BTN} onClick={onClose}>Cancel</button>
        <button type="button" disabled={busy} onClick={submit} className="rounded-xl bg-orange-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50">Save</button>
      </div>
    </Modal>
  )
}

