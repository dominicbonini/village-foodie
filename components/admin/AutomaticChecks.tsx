'use client'
// components/admin/AutomaticChecks.tsx — Admin › Pricing check › Automatic checks (competitor-check-1, 25 October 2026;
// docs/competitor-check-1-report.md). What the automatic competitor checker (GitHub Actions + the Claude API) found, for
// Dominic to accept or reject — nothing it finds changes a price until it is accepted here, and an accepted change is
// unverified until it is verified again in the country view.
//
// Layout: tiles (deep check, API spend, regular checks, couldn't check); the buttons (Settings, Pause, the Deep check
// country picker and Start deep check — competitor-check-2: the deep check runs country by country); filter chips; the findings table (scrolls sideways in its own box on a phone); the "confirmed unchanged by
// both checks" footer row; recent runs. Talks to /api/admin/competitor-check only.
import { useEffect, useMemo, useState } from 'react'
import { nativeAuthHeader } from '@/lib/native/session'
import { FIELD_LABEL, CLASSIFICATION_LABEL, type Field, type Classification } from '@/lib/competitor-check/model'
import type { Overview } from '@/lib/competitor-check/overview'
import { LEGACY_FEATURE_COLUMNS } from '@/lib/comparison-features'

type Row = Record<string, unknown>
interface Data { settings: Row; runs: Row[]; findings: Row[]; competitors: { id: string; name: string; lifecycle: string }[]; overview: Overview; today: string
  /** comparison-features-1: each feature key's English label (a 'feature' finding names its key). */
  featureLabels?: Record<string, string>
  countries?: { code: string; name: string; comparisonPage: boolean }[] }

async function call(method: 'GET' | 'POST', body?: unknown): Promise<{ ok: boolean; data: Row }> {
  const res = await fetch('/api/admin/competitor-check', { method, headers: { 'Content-Type': 'application/json', ...(await nativeAuthHeader()) }, body: body === undefined ? undefined : JSON.stringify(body) })
  let data: Row = {}
  try { data = await res.json() } catch { /* status says it */ }
  return { ok: res.ok, data }
}

const CARD = 'rounded-2xl border border-slate-200 bg-white p-4'
const BTN = 'whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50'
const BOX = 'w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400'
const usd = (n: number) => `$${n.toFixed(2)}`
const day = (ymd: string | null | undefined) => { if (!ymd) return '—'; const d = new Date(`${String(ymd).slice(0, 10)}T00:00:00Z`); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) }
const OUTCOME_LABEL: Record<string, string> = { changed: 'Changed', unchanged: 'Unchanged', new_plan: 'New plan', plan_gone: 'Plan gone', new_url: 'New page', classification: 'Classified', blocked: 'Blocked', page_gone: 'Page gone', not_stated: 'Not stated',
  in_country: 'Sold here', not_in_country: 'Not sold here' }   // global-players-1

type Chip = 'review' | 'blocked' | 'gone' | 'unchanged' | 'all'

/** comparison-features-1: what a finding is about — a feature's label (its key from the master list, or an old finding's
 *  retired field mapped to its key), else the field's label. */
function whatOf(f: Row, labels: Record<string, string>): string {
  const key = f.field === 'feature' ? String(((f.found ?? {}) as Row).feature_key ?? '') : LEGACY_FEATURE_COLUMNS[String(f.field)]?.key
  if (key) return labels[key] ?? key
  return FIELD_LABEL[f.field as Field] ?? String(f.field)
}

export default function AutomaticChecks({ onCount }: { onCount?: (n: number) => void }) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [chip, setChip] = useState<Chip>('review')
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [deepPick, setDeepPick] = useState('ALL')

  const load = async () => {
    const r = await call('GET')
    if (!r.ok) { setError(typeof r.data.error === 'string' ? r.data.error : 'The automatic checks could not be loaded.'); return }
    setError(null); setData(r.data as unknown as Data); onCount?.((r.data as unknown as Data).overview.toReview)
  }
  useEffect(() => {
    let off = false
    call('GET').then(r => {
      if (off) return
      if (!r.ok) { setError(typeof r.data.error === 'string' ? r.data.error : 'The automatic checks could not be loaded.'); return }
      setData(r.data as unknown as Data); onCount?.((r.data as unknown as Data).overview.toReview)
    }).catch(() => { if (!off) setError('The automatic checks could not be loaded.') })
    return () => { off = true }
  }, [onCount])

  const post = async (label: string, body: Row, done?: string) => {
    setBusy(label); setNotice(null)
    const r = await call('POST', body)
    setBusy(null)
    if (!r.ok) { setNotice({ ok: false, text: typeof r.data.error === 'string' ? r.data.error : 'That could not be saved.' }); return false }
    await load()
    if (done) setNotice({ ok: true, text: done })
    return true
  }

  const nameOf = useMemo(() => new Map((data?.competitors ?? []).map(c => [c.id, c.name])), [data])
  if (error) return <div className={`${CARD} text-sm font-semibold text-red-700`} data-automatic-checks>{error}</div>
  if (!data) return <p className="text-sm text-slate-500" data-automatic-checks>Loading the automatic checks…</p>
  const o = data.overview
  const pending = data.findings.filter(f => f.review_status === 'pending')
  const confirmedUnchanged = pending.filter(f => f.outcome === 'unchanged' && f.quote_in_page === true && f.second_check === 'confirmed')
  const shown = chip === 'review' ? pending.filter(f => !(f.outcome === 'unchanged' && f.quote_in_page === true && f.second_check === 'confirmed'))
    : chip === 'blocked' ? pending.filter(f => f.outcome === 'blocked') : chip === 'gone' ? pending.filter(f => f.outcome === 'page_gone')
    : chip === 'unchanged' ? confirmedUnchanged : data.findings
  const chips: [Chip, string, number][] = [['review', 'To review', pending.length - confirmedUnchanged.length], ['blocked', 'Blocked', o.couldNotCheck.blocked], ['gone', 'Page gone', o.couldNotCheck.pageGone], ['all', 'All', data.findings.length]]
  const spendPct = o.spend.monthlyCapUsd ? Math.min(100, (o.spend.monthUsd / o.spend.monthlyCapUsd) * 100) : 0
  const countries = data.countries ?? []
  const countryName = (code: string) => countries.find(c => c.code === code)?.name ?? code
  const deepReady = 'deep_country' in data.settings   // 20261045 has run
  const startDeep = () => {
    const what = deepPick === 'ALL' ? `every country, in order (${o.queue.inForce.slice(0, 4).map(countryName).join(', ')}${o.queue.inForce.length > 4 ? ' …' : ''})` : `${countryName(deepPick)}, then the countries after it in the order`
    if (window.confirm(`Start a deep check of ${what}? Every competitor there is checked again in depth — about ${o.deep.perDay} a day, within the caps. The next scheduled run starts it.`))
      post('deep', { action: 'start_deep', country: deepPick }, 'Deep check started. The next scheduled run picks it up.')
  }
  // competitor-check-3: the quick pass — every competitor in each of its countries, cheaply, from the picked country onwards.
  const passReady = 'pass_requested_at' in data.settings   // 20261049 has run
  const startPass = () => {
    const what = deepPick === 'ALL' ? 'every competitor in every country it sells in' : `every competitor in ${countryName(deepPick)} and the countries after it in the order`
    if (window.confirm(`Start a quick pass of ${what}? Each check reads a few pages on ${String(data.settings.pass_extractor_model ?? 'Haiku')} — about ${String(data.settings.pass_per_day ?? 40)} a day, within the caps. The next scheduled run starts it.`))
      post('pass', { action: 'start_pass', country: deepPick }, 'Quick pass started. The next scheduled run submits its first share.')
  }

  return (
    <div className="space-y-3" data-automatic-checks>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-base font-black text-slate-900">Automatic checks {o.paused && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">Paused</span>}</p>
          <p className="text-sm text-slate-500">Each competitor&apos;s own website, re-read every {o.routine.intervalDays} days. Nothing changes until you accept it, and every accepted change needs verifying again.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BTN} onClick={() => setSettingsOpen(true)}>Settings</button>
          <button type="button" className={BTN} disabled={busy !== null} onClick={() => post('pause', { action: o.paused ? 'resume' : 'pause' }, o.paused ? 'Checks resumed.' : 'Checks paused. The next run stops before its first competitor.')}>{o.paused ? 'Resume checks' : 'Pause checks'}</button>
          <label className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-slate-700">
            <span className="whitespace-nowrap">Deep check</span>
            <select className={`${BOX} max-w-[15rem]`} value={deepPick} onChange={e => setDeepPick(e.target.value)} disabled={!deepReady} data-deep-picker>
              <option value="ALL">All countries, in order</option>
              {countries.map(c => <option key={c.code} value={c.code}>{c.name}{c.comparisonPage ? ' (has a comparison page)' : ''}</option>)}
            </select>
          </label>
          <button type="button" disabled={busy !== null || !deepReady} onClick={startDeep} title={deepReady ? undefined : 'Run supabase/migrations/20261045_competitor_check_2.sql first'}
            className="whitespace-nowrap rounded-xl bg-orange-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50" data-start-deep>Start deep check</button>
          <button type="button" disabled={busy !== null || !passReady} onClick={startPass} title={passReady ? undefined : 'Run supabase/migrations/20261049_competitor_check_3.sql first'}
            className="whitespace-nowrap rounded-xl bg-slate-900 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50" data-start-pass>Start quick pass</button>
        </div>
      </div>

      {notice && <div className={`rounded-xl px-3 py-2 text-sm font-semibold ${notice.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`} role="status">{notice.text}</div>}

      {/* tiles */}
      <div className={`grid grid-cols-1 gap-2 sm:grid-cols-2 ${o.pass ? 'xl:grid-cols-5' : 'xl:grid-cols-4'}`} data-check-tiles>
        {o.pass && (
          <div className={CARD} data-tile="pass">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Quick pass</p>
            {o.pass.requested ? <>
              <p className="mt-1 text-xl font-black text-slate-900">{o.pass.done} of {o.pass.total} <span className="text-sm font-semibold text-slate-500">checks</span></p>
              <div className="mt-1.5 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-slate-900" style={{ width: `${o.pass.total ? (o.pass.done / o.pass.total) * 100 : 0}%` }} /></div>
              <p className="mt-1 text-xs text-slate-500" data-pass-line>About {o.pass.perDay} a day · cost so far {usd(o.pass.costUsd)} · estimated total {usd(o.pass.estimateUsd)}</p>
              {o.pass.batch ? <p className="text-xs text-slate-500">A batch of {o.pass.batch.items} is out — collected next run</p> : o.pass.finishOn ? <p className="text-xs text-slate-500">Done by about {day(o.pass.finishOn)}</p> : null}
            </> : <>
              <p className="mt-1 text-xl font-black text-slate-900">Not running</p>
              <p className="mt-1 text-xs text-slate-500">Pick a country (or All countries) and press Start quick pass.</p>
            </>}
          </div>
        )}
        <div className={CARD} data-tile="deep">
          {o.deep.country ? <>
            <p className="truncate text-[11px] font-bold uppercase tracking-wide text-slate-500">Deep check · {countryName(o.deep.country)}</p>
            <p className="mt-1 text-xl font-black text-slate-900">{o.deep.countryDone} of {o.deep.countryTotal} <span className="text-sm font-semibold text-slate-500">competitors</span></p>
            <div className="mt-1.5 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-orange-500" style={{ width: `${o.deep.countryTotal ? (o.deep.countryDone / o.deep.countryTotal) * 100 : 0}%` }} /></div>
            <p className="mt-1 truncate text-xs text-slate-500" data-deep-then>Then: {o.deep.then.length ? `${o.deep.then.slice(0, 4).map(countryName).join(', ')}${o.deep.then.length > 4 ? ` and ${o.deep.then.length - 4} more` : ''}` : 'nothing — the last country'}</p>
            <p className="text-xs text-slate-500">About {o.deep.perDay} a day{o.deep.finishOn ? ` · all done by ${day(o.deep.finishOn)}` : ''}</p>
          </> : <>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Deep check</p>
            <p className="mt-1 text-xl font-black text-slate-900">{o.deep.requested ? 'Finished' : 'Not running'}</p>
            <p className="mt-1 text-xs text-slate-500">{deepReady ? 'Pick a country (or All countries) and press Start deep check.' : 'Run supabase/migrations/20261045_competitor_check_2.sql to check country by country.'}</p>
          </>}
        </div>
        <div className={CARD} data-tile="spend">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">API spend this month</p>
          <p className="mt-1 text-xl font-black text-slate-900">{usd(o.spend.monthUsd)} <span className="text-sm font-semibold text-slate-500">of {usd(o.spend.monthlyCapUsd)}</span></p>
          <div className="mt-1.5 h-1.5 rounded-full bg-slate-100"><div className={`h-1.5 rounded-full ${spendPct > 85 ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${spendPct}%` }} /></div>
          <p className="mt-1 text-xs text-slate-500">Today {usd(o.spend.todayUsd)} · daily cap {usd(o.spend.dailyCapUsd)}</p>
        </div>
        <div className={CARD} data-tile="routine">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Regular checks</p>
          <p className="mt-1 text-xl font-black text-slate-900">Every {o.routine.intervalDays} days</p>
          <p className="text-xs text-slate-500">{o.routine.active} competitors · about {o.routine.perDay} a day</p>
          <p className="mt-1 truncate text-xs text-slate-500">Next: {o.routine.nextDue.length ? o.routine.nextDue.map(n => `${n.name} (${day(n.on)})`).join(', ') : 'none scheduled yet'}</p>
        </div>
        <div className={CARD} data-tile="blocked">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Couldn&apos;t check</p>
          <p className="mt-1 text-xl font-black text-slate-900">{o.couldNotCheck.blocked + o.couldNotCheck.pageGone}</p>
          <p className="text-xs text-slate-500">{o.couldNotCheck.blocked} blocked · {o.couldNotCheck.pageGone} page gone</p>
        </div>
      </div>

      {/* findings */}
      <section className={CARD} data-findings>
        <div className="flex flex-wrap items-center gap-2">
          {chips.map(([k, label, n]) => (
            <button key={k} type="button" aria-pressed={chip === k} onClick={() => setChip(k)} data-chip={k}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${chip === k ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
              {label} <span className={chip === k ? 'text-slate-300' : 'text-slate-400'}>{n}</span>
            </button>
          ))}
          {chip === 'unchanged' && confirmedUnchanged.length > 0 && (
            <button type="button" className="ml-auto whitespace-nowrap rounded-xl bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50" disabled={busy !== null}
              onClick={() => post('all', { action: 'accept_unchanged', ids: confirmedUnchanged.map(f => f.id) }, `${confirmedUnchanged.length} accepted — only their checked dates moved on.`)}>Accept all {confirmedUnchanged.length}</button>
          )}
        </div>
        <div className="mt-2 overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <tr><th className="px-3 py-2">Competitor · plan</th><th className="px-3 py-2">Country</th><th className="px-3 py-2">What</th><th className="px-3 py-2">Stored → found</th><th className="px-3 py-2">Quote</th><th className="px-3 py-2">Second check</th><th className="px-3 py-2"></th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">Nothing here.</td></tr>}
              {shown.map(f => {
                const found = (f.found ?? {}) as Row
                const quoted = ['changed', 'unchanged', 'new_plan', 'plan_gone', 'new_url', 'classification', 'in_country', 'not_in_country'].includes(String(f.outcome))
                const confirmed = f.second_check === 'confirmed' && f.quote_in_page === true
                // competitor-check-7: a disagreement is only a different value WITH its own quote; anything the second check
                // could not settle ('unclear'), or a quote not found on the page, is "Couldn't confirm".
                const disagrees = quoted && f.second_check === 'disagreed'
                const couldnt = quoted && (f.second_check === 'unclear' || f.quote_in_page !== true)
                return (
                  <tr key={String(f.id)} data-finding={String(f.outcome)} className="align-top">
                    <td className="px-3 py-2"><p className="font-semibold text-slate-900">{nameOf.get(String(f.competitor_id)) ?? 'Unknown'}</p>{typeof found.plan_name === 'string' && <p className="text-xs text-slate-500">{found.plan_name}</p>}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">{String(f.country_code ?? '—')}</td>
                    <td className="px-3 py-2"><p className="text-slate-800">{whatOf(f, data.featureLabels ?? {})}</p><p className="text-xs font-semibold text-slate-500">{OUTCOME_LABEL[String(f.outcome)] ?? String(f.outcome)}</p></td>
                    <td className="px-3 py-2 text-slate-800"><span className="text-slate-500">{String(f.stored_value ?? '—')}</span> → <b>{f.outcome === 'classification' && found.classification ? CLASSIFICATION_LABEL[found.classification as Classification] : String(f.found_value ?? '—')}</b></td>
                    <td className="max-w-[22rem] px-3 py-2">
                      {f.quote ? <><p className="text-slate-800">“{String(f.quote)}”</p>{f.quote_en && f.quote_en !== f.quote && <p className="text-xs italic text-slate-500">{String(f.quote_en)}</p>}</> : <span className="text-slate-400">—</span>}
                      {typeof f.source_url === 'string' && <a className="mt-0.5 block truncate text-xs text-orange-700 underline" href={f.source_url} target="_blank" rel="noreferrer noopener">{f.source_url}</a>}
                    </td>
                    <td className="px-3 py-2">
                      {confirmed ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">Confirmed</span>
                        : disagrees ? <><span data-second="disagreed" className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-800">Disagrees</span>
                          {f.second_value ? <p className="mt-0.5 text-xs text-slate-500">Second check found: {String(f.second_value)}</p> : null}
                          {f.second_quote ? <p className="mt-0.5 text-xs italic text-slate-500">“{String(f.second_quote)}”</p> : null}
                          {f.quote_in_page !== true && <p className="mt-0.5 text-xs text-slate-500">Quote not found on the page</p>}</>
                        : couldnt ? <><span data-second="unclear" className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">Couldn&apos;t confirm</span>
                          {f.quote_in_page !== true && <p className="mt-0.5 text-xs text-slate-500">Quote not found on the page</p>}
                          {f.second_check === 'unclear' && <p className="mt-0.5 text-xs text-slate-500">The second check couldn&apos;t find the value</p>}</>
                        : <span className="text-xs text-slate-400">Not run</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {f.review_status === 'pending' ? (
                        <div className="flex gap-1">
                          <button type="button" className={BTN} disabled={busy !== null} data-accept onClick={() => post('accept', { action: 'accept', id: f.id }, 'Accepted. Verify it again in the country view before it shows publicly.')}>Accept</button>
                          <button type="button" className={BTN} disabled={busy !== null} data-reject onClick={() => post('reject', { action: 'reject', id: f.id }, 'Rejected.')}>Reject</button>
                        </div>
                      ) : <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${f.review_status === 'accepted' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{f.review_status === 'accepted' ? 'Accepted' : 'Rejected'}</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm" data-unchanged-footer>
          <span className="text-slate-700"><b>{confirmedUnchanged.length}</b> confirmed unchanged by both checks</span>
          <button type="button" className={BTN} disabled={!confirmedUnchanged.length} onClick={() => setChip('unchanged')}>Review and accept all</button>
        </div>
      </section>

      {/* recent runs */}
      <section className={CARD} data-runs>
        <p className="text-sm font-bold text-slate-900">Recent runs</p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-2 py-1.5">Date</th><th className="px-2 py-1.5">Mode</th><th className="px-2 py-1.5">Checked</th><th className="px-2 py-1.5">Result</th><th className="px-2 py-1.5 text-right">Cost</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.runs.length === 0 && <tr><td colSpan={5} className="px-2 py-4 text-center text-slate-500">No runs yet. The workflow runs daily at 02:10 UTC once it is merged.</td></tr>}
              {data.runs.slice(0, 15).map(r => {
                const n = data.findings.filter(f => f.run_id === r.id)
                const changes = n.filter(f => f.outcome !== 'unchanged').length
                return (
                  <tr key={String(r.id)}>
                    <td className="px-2 py-1.5 text-slate-700">{day(String(r.started_at))} {String(r.started_at).slice(11, 16)}</td>
                    <td className="px-2 py-1.5 capitalize text-slate-700">{String(r.mode)}{r.trigger === 'manual' ? ' · manual' : ''}</td>
                    <td className="px-2 py-1.5 text-slate-700">{String(r.competitors_checked)}</td>
                    <td className="px-2 py-1.5 text-slate-700">{changes} to review · {n.length - changes} unchanged{r.stopped_reason && r.stopped_reason !== 'done' ? <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">{String(r.stopped_reason).replace('_', ' ')}</span> : null}</td>
                    <td className="px-2 py-1.5 text-right font-semibold text-slate-900">{usd(Number(r.cost_usd || 0))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {settingsOpen && <SettingsModal settings={data.settings} queue={o.queue} busy={busy !== null} onClose={() => setSettingsOpen(false)}
        onSave={async fields => { if (await post('settings', { action: 'settings', fields }, 'Settings saved.')) setSettingsOpen(false) }} />}
    </div>
  )
}

function SettingsModal({ settings, queue, busy, onClose, onSave }: { settings: Row; queue: Overview['queue']; busy: boolean; onClose: () => void; onSave: (f: Row) => void }) {
  const prices = settings.prices as { web_search_per_search: number; models: Record<string, { input_per_mtok: number; output_per_mtok: number; cache_write_per_mtok?: number; cache_read_per_mtok?: number }>; source?: string; checked_on?: string }
  const [f, setF] = useState({
    paused: settings.paused === true, daily: String(settings.daily_cap_usd), monthly: String(settings.monthly_cap_usd), deep: String(settings.deep_per_day),
    interval: String(settings.check_interval_days), extractor: String(settings.extractor_model), verifier: String(settings.verifier_model),
    prices: JSON.stringify(prices, null, 2), order: queue.stored.join(', '),
    // competitor-check-3: the quick pass's own models, share and hard limits.
    passExtractor: String(settings.pass_extractor_model ?? 'claude-haiku-5-5'), passVerifier: String(settings.pass_verifier_model ?? 'claude-haiku-5-5'),
    passPerDay: String(settings.pass_per_day ?? 40), passFetches: String(settings.pass_max_fetches ?? 3), passSearches: String(settings.pass_max_searches ?? 1), passPage: String(settings.pass_max_page_tokens ?? 6000),
  })
  const [err, setErr] = useState<string | null>(null)
  const save = () => {
    let p: unknown
    try { p = JSON.parse(f.prices) } catch { setErr('Prices must be valid JSON.'); return }
    // competitor-check-2: the deep check's country order (empty = the default); only once 20261045 has added the column.
    const order = f.order.split(/[\s,]+/).map(c => c.trim().toUpperCase()).filter(Boolean)
    onSave({ paused: f.paused, daily_cap_usd: Number(f.daily), monthly_cap_usd: Number(f.monthly), deep_per_day: Number(f.deep), check_interval_days: Number(f.interval),
      extractor_model: f.extractor.trim(), verifier_model: f.verifier.trim(), prices: p, ...('deep_queue' in settings ? { deep_queue: order } : {}),
      ...('pass_requested_at' in settings ? { pass_extractor_model: f.passExtractor.trim(), pass_verifier_model: f.passVerifier.trim(), pass_per_day: Number(f.passPerDay),
        pass_max_fetches: Number(f.passFetches), pass_max_searches: Number(f.passSearches), pass_max_page_tokens: Number(f.passPage) } : {}) })
  }
  const label = 'mb-1 block text-xs font-semibold text-slate-600'
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label="Automatic check settings" data-settings>
      <div className="mt-8 w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between"><p className="text-base font-black text-slate-900">Settings</p><button type="button" className={BTN} onClick={onClose}>Close</button></div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <label className="col-span-2 inline-flex items-center gap-2 font-semibold text-slate-700"><input type="checkbox" checked={f.paused} onChange={e => setF({ ...f, paused: e.target.checked })} /> Paused</label>
          <label><span className={label}>Daily cap (USD)</span><input className={BOX} inputMode="decimal" value={f.daily} onChange={e => setF({ ...f, daily: e.target.value })} /></label>
          <label><span className={label}>Monthly cap (USD)</span><input className={BOX} inputMode="decimal" value={f.monthly} onChange={e => setF({ ...f, monthly: e.target.value })} /></label>
          <label><span className={label}>Deep checks per day</span><input className={BOX} inputMode="numeric" value={f.deep} onChange={e => setF({ ...f, deep: e.target.value })} /></label>
          <label><span className={label}>Check every (days)</span><input className={BOX} inputMode="numeric" value={f.interval} onChange={e => setF({ ...f, interval: e.target.value })} /></label>
          {'pass_requested_at' in settings && <>
            <p className="col-span-2 mt-1 text-xs font-bold uppercase tracking-wide text-slate-500" data-pass-settings>Quick pass</p>
            <label><span className={label}>Pass reading model</span><input className={BOX} value={f.passExtractor} onChange={e => setF({ ...f, passExtractor: e.target.value })} /></label>
            <label><span className={label}>Pass second-check model</span><input className={BOX} value={f.passVerifier} onChange={e => setF({ ...f, passVerifier: e.target.value })} /></label>
            <label><span className={label}>Pass checks per day</span><input className={BOX} inputMode="numeric" value={f.passPerDay} onChange={e => setF({ ...f, passPerDay: e.target.value })} /></label>
            <label><span className={label}>Pages per check</span><input className={BOX} inputMode="numeric" value={f.passFetches} onChange={e => setF({ ...f, passFetches: e.target.value })} /></label>
            <label><span className={label}>Searches per check</span><input className={BOX} inputMode="numeric" value={f.passSearches} onChange={e => setF({ ...f, passSearches: e.target.value })} /></label>
            <label><span className={label}>Page length (tokens)</span><input className={BOX} inputMode="numeric" value={f.passPage} onChange={e => setF({ ...f, passPage: e.target.value })} /></label>
            <p className="col-span-2 mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">Deep check</p>
          </>}
          <label><span className={label}>Reading model</span><input className={BOX} value={f.extractor} onChange={e => setF({ ...f, extractor: e.target.value })} /></label>
          <label><span className={label}>Second-check model</span><input className={BOX} value={f.verifier} onChange={e => setF({ ...f, verifier: e.target.value })} /></label>
          {'deep_queue' in settings && <label className="col-span-2"><span className={label}>Deep check order (country codes; empty = the default)</span>
            <input className={BOX} value={f.order} placeholder={queue.default.join(', ')} onChange={e => setF({ ...f, order: e.target.value })} data-deep-order />
            <span className="mt-1 block text-xs text-slate-500">Default: {queue.default.slice(0, 8).join(', ')}{queue.default.length > 8 ? ', …' : ''} — countries with a comparison page, then AT, CZ, PL, then by number of competitors.</span></label>}
          <label className="col-span-2"><span className={label}>Prices (USD per million tokens; per web search){prices.checked_on ? ` — checked ${prices.checked_on}` : ''}</span>
            <textarea className={`${BOX} h-40 font-mono text-xs`} value={f.prices} onChange={e => setF({ ...f, prices: e.target.value })} /></label>
        </div>
        {err && <p className="mt-2 text-sm font-semibold text-red-700">{err}</p>}
        <div className="mt-4 flex justify-end gap-2"><button type="button" className={BTN} onClick={onClose}>Cancel</button>
          <button type="button" disabled={busy} onClick={save} className="rounded-xl bg-slate-900 px-3.5 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Save</button></div>
      </div>
    </div>
  )
}
