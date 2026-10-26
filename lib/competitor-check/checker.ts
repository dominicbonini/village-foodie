// lib/competitor-check/checker.ts — the automatic competitor checker (competitor-check-1, 25 October 2026;
// docs/competitor-check-1-report.md). Run by scripts/competitor-check/main.ts in GitHub Actions; proven by
// scripts/competitor-check-1.cjs with recorded fixture responses (it never calls the real API).
//
// For each competitor, in this order:
//   1 · the EXTRACTOR — a fresh conversation with the stored data, web fetch and web search limited to the competitor's own
//       domains and the official app stores, and ONE client tool, record_findings (strict schema). Its output is validated
//       in code (lib/competitor-check/model.ts); a malformed call is sent back once with the errors, then the competitor fails.
//   2 · the QUOTE CHECK — in code: each quote must be in the text of a page actually fetched in that conversation.
//   3 · the VERIFIER — a separate fresh conversation that sees only the claim (field, value, URL), fetches the URL itself and
//       returns confirmed / disagreed with its own quote. Deep: every quoted finding. Routine: every finding that is not
//       "unchanged", and any whose quote was not found.
//   4 · WRITES — only competitor_check_findings, competitor_check_runs and the scheduling columns (next_check_at,
//       last_checked_at, deep_checked_at, check_requested_at). `CheckerStore.setSchedule` refuses any other column.
// The budget guard runs before every competitor; one competitor failing never stops the run; findings are written per
// competitor, so a stopped run keeps what it found. A dry run calls the API and writes nothing.
import type Anthropic from '@anthropic-ai/sdk'
import {
  RECORD_FINDINGS_TOOL, RECORD_VERDICT_TOOL, QUOTED_OUTCOMES, PLAN_FIELDS, FEATURE_FIELDS, hostOf, onOwnSite, APP_STORE_HOSTS,
  validateRecordFindings, validateRecordVerdict, type RawFinding, type Field,
} from './model'
import {
  quoteInPages, fetchedPages, costOf, addSpend, ZERO_SPEND, budgetStop, routineQuota, spreadFirstDates, selectRoutine, selectDeep,
  afterCheck, type Prices, type Spend, type SchedRow, type Lifecycle,
} from './core'
import { EXTRACTOR_SYSTEM, VERIFIER_SYSTEM, extractorMessage, verifierMessage, type StoredPlanForPrompt } from './prompts'

type Row = Record<string, unknown>
export type Mode = 'deep' | 'routine' | 'single'

export interface CheckSettings {
  paused: boolean; dailyCapUsd: number; monthlyCapUsd: number; deepPerDay: number; checkIntervalDays: number
  deepRequestedAt: string | null; extractorModel: string; verifierModel: string; prices: Prices
}
export interface CompetitorForCheck extends SchedRow {
  website: string | null; focus: string | null; checkUrls: string[]; minTerm: string | null; paymentMethods: string | null
  features: Record<string, string>; plans: StoredPlanForPrompt[]
}
export interface FindingRow {
  run_id: string; competitor_id: string; plan_id: string | null; country_code: string | null; field: Field
  stored_value: string | null; found_value: string | null; found: Row; quote: string | null; quote_en: string | null; source_url: string | null
  outcome: RawFinding['outcome']; quote_in_page: boolean; second_check: 'confirmed' | 'disagreed' | 'not_run'
  second_value: string | null; second_quote: string | null; review_status: 'pending'
}
/** The scheduling columns — the ONLY competitor columns the checker may write. */
export const SCHEDULE_COLUMNS = ['next_check_at', 'last_checked_at', 'deep_checked_at', 'check_requested_at'] as const

export interface CheckerStore {
  settings(): Promise<CheckSettings>
  competitors(): Promise<CompetitorForCheck[]>
  /** USD spent today and this month (UTC) by earlier runs, and the recent average per competitor (null before any). */
  spend(today: string): Promise<{ todayUsd: number; monthUsd: number; priorAvgUsd: number | null }>
  createRun(row: Row): Promise<string>
  updateRun(id: string, cols: Row): Promise<void>
  insertFindings(rows: FindingRow[]): Promise<void>
  setSchedule(id: string, cols: Partial<Record<(typeof SCHEDULE_COLUMNS)[number], string | null>>): Promise<void>
}
export interface CheckerDeps {
  /** One Messages API call (the SDK's client.beta.messages.create, or a harness's recorded fixtures). */
  api(params: Row): Promise<Anthropic.Beta.BetaMessage>
  store: CheckerStore
  now(): Date
  log(line: string): void
  dryRun: boolean
  /** Per-competitor time limit (ms). */
  timeLimitMs?: number
}
export interface RunReport {
  runId: string | null; mode: Mode; checked: number; failed: { name: string; error: string }[]; spend: Spend
  stoppedReason: 'done' | 'daily_cap' | 'monthly_cap' | 'paused' | 'error'; findings: FindingRow[]
}

const ymd = (d: Date) => d.toISOString().slice(0, 10)
const minor = (n: number | null, cur: string) => (n === null ? 'not stated' : `${(n / 100).toFixed(2)} ${cur}`)
const bps = (b: number) => `${(b / 100).toLocaleString('en-GB', { maximumFractionDigits: 2 })}%`

/** The stored value a finding is compared with, written plainly — from OUR data, never the model's. */
export function storedValueOf(field: Field, c: CompetitorForCheck, plan: StoredPlanForPrompt | null): string | null {
  if (plan) {
    switch (field) {
      case 'monthly_price': return plan.price_hidden ? 'price on request' : `${minor(plan.monthly_minor, plan.currency)} per month${plan.yearly_only ? ' (billed yearly)' : ''}, VAT ${plan.vat}`
      case 'setup_fee': return minor(plan.setup_minor, plan.currency)
      case 'truck_fee': return plan.truck_fee_bps || plan.truck_fee_fixed_minor ? `${bps(plan.truck_fee_bps)} + ${minor(plan.truck_fee_fixed_minor, plan.currency)}` : 'none'
      case 'customer_fee': return plan.customer_fee_bps || plan.customer_fee_fixed_minor ? `${bps(plan.customer_fee_bps)} + ${minor(plan.customer_fee_fixed_minor, plan.currency)}` : 'none'
      case 'card_rate': return plan.card_bps === null && plan.card_fixed_minor === null ? 'not stated' : `${bps(plan.card_bps ?? 0)} + ${minor(plan.card_fixed_minor ?? 0, plan.currency)} (${plan.card_mode})`
      case 'plan': return plan.plan_name
    }
  }
  if ((FEATURE_FIELDS as readonly string[]).includes(field)) return c.features[field] ?? 'unknown'
  if (field === 'min_term') return c.minTerm
  if (field === 'payment_methods') return c.paymentMethods
  if (field === 'classification') return `${c.lifecycle}${c.focus ? ` · ${c.focus}` : ''}`
  if (field === 'url') return c.checkUrls.join(' · ') || null
  return null
}
/** The finding's value in words, when the model gave typed parts but no text. */
export function describeFound(f: RawFinding): string | null {
  if (f.found_value) return f.found_value
  if (f.feature) return f.feature
  if (f.classification) return f.classification
  if (f.url) return f.url
  const parts = [f.amount !== null ? `${f.amount} ${f.currency ?? ''}`.trim() : null, f.percent !== null ? `${f.percent}%` : null,
    f.period ? `per ${f.period}` : null, f.vat ? `VAT ${f.vat}` : null].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

/** The competitor's own domains (website and stored pages); the web tools are limited to these and the app stores. */
export const domainsOf = (c: Pick<CompetitorForCheck, 'website' | 'checkUrls'>) =>
  [...new Set([c.website, ...c.checkUrls].map(hostOf).filter((h): h is string => !!h && !(APP_STORE_HOSTS as readonly string[]).includes(h)))]

function matchPlan(c: CompetitorForCheck, f: RawFinding): StoredPlanForPrompt | null {
  if (!(PLAN_FIELDS as readonly string[]).includes(f.field) || !f.plan_name) return null
  const name = f.plan_name.trim().toLowerCase()
  const same = c.plans.filter(p => p.plan_name.trim().toLowerCase() === name)
  return same.find(p => !f.country_code || p.country_code === f.country_code) ?? null
}

const withTimeout = <T>(p: Promise<T>, ms: number, what: string) => new Promise<T>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`${what} took longer than ${Math.round(ms / 1000)} s`)), ms)
  p.then(v => { clearTimeout(timer); resolve(v) }, e => { clearTimeout(timer); reject(e) })
})

/** One conversation with one client tool: loops through pause_turn and tool calls until that tool is called with valid
 *  input (or the turns run out). Unknown tools are answered with an error and never executed. */
async function converse<T>(deps: CheckerDeps, a: {
  model: string; system: string; user: string; tools: Row[]; toolName: string; effort: 'low' | 'medium' | 'high'
  validate(input: unknown): { ok: true; value: T } | { ok: false; errors: string[] }; maxTurns: number; prices: Prices
}): Promise<{ value: T; contents: unknown[][]; spend: Spend }> {
  const messages: Row[] = [{ role: 'user', content: a.user }]
  const contents: unknown[][] = []
  let spend = ZERO_SPEND, fixes = 0, nudged = false
  for (let turn = 0; turn < a.maxTurns; turn++) {
    const res = await deps.api({
      model: a.model, max_tokens: 16000, system: a.system, messages, tools: a.tools,
      output_config: { effort: a.effort },
      // The skill's default for this model family: on a policy decline the API re-runs the request on a fallback model.
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    })
    const priced = a.prices.models[res.model] ? res.model : a.model
    spend = addSpend(spend, costOf(res.usage as never, priced, a.prices))
    contents.push(res.content as unknown[])
    if (res.stop_reason === 'refusal') throw new Error('the model declined the request')
    if (res.stop_reason === 'max_tokens') throw new Error('the response was cut off (max_tokens)')
    messages.push({ role: 'assistant', content: res.content })
    if (res.stop_reason === 'pause_turn') continue
    const uses = (res.content as { type: string; id?: string; name?: string; input?: unknown }[]).filter(b => b.type === 'tool_use')
    const mine = uses.find(u => u.name === a.toolName)
    if (mine) {
      const v = a.validate(mine.input)
      if (v.ok) return { value: v.value, contents, spend }
      if (fixes++ >= 1) throw new Error(`${a.toolName} was malformed twice: ${v.errors.slice(0, 3).join(' ')}`)
      messages.push({ role: 'user', content: uses.map(u => ({ type: 'tool_result', tool_use_id: u.id, is_error: true,
        content: u === mine ? `Rejected — fix these and call ${a.toolName} again: ${v.errors.slice(0, 20).join(' ')}` : 'Not run.' })) })
      continue
    }
    if (uses.length) {
      messages.push({ role: 'user', content: uses.map(u => ({ type: 'tool_result', tool_use_id: u.id, is_error: true, content: `Unknown tool. The only tool you may call yourself is ${a.toolName}.` })) })
      continue
    }
    if (nudged) throw new Error(`the model ended without calling ${a.toolName}`)
    nudged = true
    messages.push({ role: 'user', content: `Call ${a.toolName} now with what you found.` })
  }
  throw new Error(`no valid ${a.toolName} call within ${a.maxTurns} turns`)
}

/** Checks ONE competitor: extractor, quote check, verifier. Returns its findings (not yet written) and what it cost. */
export async function checkCompetitor(deps: CheckerDeps, settings: CheckSettings, c: CompetitorForCheck, depth: 'deep' | 'routine', runId: string):
  Promise<{ findings: FindingRow[]; spend: Spend; dropped: number }> {
  const domains = domainsOf(c)
  const allowed = [...domains, ...APP_STORE_HOSTS]
  const today = ymd(deps.now())
  const ex = await converse(deps, {
    model: settings.extractorModel, system: EXTRACTOR_SYSTEM, toolName: RECORD_FINDINGS_TOOL.name, prices: settings.prices,
    effort: depth === 'deep' ? 'medium' : 'low', maxTurns: depth === 'deep' ? 12 : 8, validate: validateRecordFindings,
    user: extractorMessage({ name: c.name, website: c.website, lifecycle: c.lifecycle, focus: c.focus, check_urls: c.checkUrls,
      min_term: c.minTerm, payment_methods: c.paymentMethods, features: c.features, plans: c.plans }, depth, today),
    tools: [
      { type: 'web_fetch_20260318', name: 'web_fetch', max_uses: depth === 'deep' ? 12 : 6, max_content_tokens: 12000, allowed_domains: allowed },
      { type: 'web_search_20260318', name: 'web_search', max_uses: depth === 'deep' ? 6 : 3, allowed_domains: allowed },
      RECORD_FINDINGS_TOOL,
    ],
  })
  const pages = fetchedPages(ex.contents).map(p => p.text)
  let spend = ex.spend, dropped = 0
  const findings: FindingRow[] = []
  for (const f of ex.value.findings) {
    // A finding about another website is not one: the rules allow the competitor's own site and the app stores only.
    if (f.source_url && !onOwnSite(f.source_url, domains)) { dropped++; continue }
    if (f.outcome === 'new_url' && f.url && !onOwnSite(f.url, domains)) { dropped++; continue }
    const plan = matchPlan(c, f)
    const { field, plan_name, country_code, outcome, found_value, quote, quote_en, source_url, ...typed } = f
    findings.push({
      run_id: runId, competitor_id: c.id, plan_id: plan?.id ?? null, country_code: country_code ?? plan?.country_code ?? null, field,
      stored_value: outcome === 'new_plan' ? null : storedValueOf(field, c, plan), found_value: describeFound(f),
      found: { ...typed, plan_name, found_value }, quote, quote_en, source_url, outcome,
      quote_in_page: (QUOTED_OUTCOMES as readonly string[]).includes(outcome) ? quoteInPages(quote, pages) : false,
      second_check: 'not_run', second_value: null, second_quote: null, review_status: 'pending',
    })
  }
  // The second check, on its own fresh conversation per claim.
  for (const row of findings) {
    const quoted = (QUOTED_OUTCOMES as readonly string[]).includes(row.outcome) && !!row.source_url
    const wanted = quoted && (depth === 'deep' || row.outcome !== 'unchanged' || !row.quote_in_page)
    if (!wanted) continue
    try {
      const v = await converse(deps, {
        model: settings.verifierModel, system: VERIFIER_SYSTEM, toolName: RECORD_VERDICT_TOOL.name, prices: settings.prices, effort: 'low', maxTurns: 4,
        validate: input => { const r = validateRecordVerdict(input); return r ? { ok: true, value: r } : { ok: false, errors: ['record_verdict needs verdict, value, quote and quote_en.'] } },
        user: verifierMessage({ competitor: c.name, field: row.field, plan: (row.found.plan_name as string | null) ?? null, value: row.found_value ?? '(none)', url: row.source_url! }),
        tools: [{ type: 'web_fetch_20260318', name: 'web_fetch', max_uses: 2, max_content_tokens: 12000, allowed_domains: allowed }, RECORD_VERDICT_TOOL],
      })
      spend = addSpend(spend, v.spend)
      const ownPages = fetchedPages(v.contents).map(p => p.text)
      // Confirmed only when the verifier says so AND its own quote is in the page it fetched; anything else can't confirm.
      row.second_check = v.value.verdict === 'confirmed' && quoteInPages(v.value.quote, ownPages) ? 'confirmed' : 'disagreed'
      row.second_value = v.value.value
      row.second_quote = v.value.quote
    } catch (e) {
      deps.log(`  verifier failed for ${c.name} · ${row.field}: ${e instanceof Error ? e.message : e}`)
    }
  }
  return { findings, spend, dropped }
}

/** One run: picks the competitors, guards the budget, checks each, writes per competitor. */
async function runOne(deps: CheckerDeps, settings: CheckSettings, mode: Mode, trigger: 'schedule' | 'manual', list: CompetitorForCheck[],
  spentBefore: { todayUsd: number; monthUsd: number; priorAvgUsd: number | null }): Promise<RunReport> {
  const started = deps.now()
  const runId = deps.dryRun ? `dry-run-${mode}` : await deps.store.createRun({ mode, trigger, started_at: started.toISOString() })
  const report: RunReport = { runId: deps.dryRun ? null : runId, mode, checked: 0, failed: [], spend: ZERO_SPEND, stoppedReason: 'done', findings: [] }
  const depth = mode === 'routine' ? 'routine' : 'deep'
  const save = async () => {
    if (deps.dryRun) return
    await deps.store.updateRun(runId, {
      competitors_checked: report.checked, input_tokens: report.spend.inputTokens, output_tokens: report.spend.outputTokens,
      web_searches: report.spend.webSearches, web_fetches: report.spend.webFetches, cost_usd: Number(report.spend.usd.toFixed(4)),
      notes: report.failed.length ? report.failed.map(f => `${f.name}: ${f.error}`).join(' · ').slice(0, 4000) : null,
    })
  }
  for (const c of list) {
    const live = deps.dryRun ? settings : await deps.store.settings()
    if (live.paused) { report.stoppedReason = 'paused'; break }
    const guard = budgetStop({ spentTodayUsd: spentBefore.todayUsd + report.spend.usd, spentMonthUsd: spentBefore.monthUsd + report.spend.usd,
      runUsd: report.spend.usd, runChecked: report.checked + report.failed.length, priorAvgUsd: spentBefore.priorAvgUsd,
      caps: { dailyUsd: live.dailyCapUsd, monthlyUsd: live.monthlyCapUsd } })
    if (guard.stop) { report.stoppedReason = guard.reason; deps.log(`  stopped before ${c.name}: ${guard.reason} (next one estimated at $${guard.estimateUsd.toFixed(2)})`); break }
    try {
      const r = await withTimeout(checkCompetitor(deps, live, c, depth, runId), deps.timeLimitMs ?? (depth === 'deep' ? 600_000 : 300_000), c.name)
      report.spend = addSpend(report.spend, r.spend)
      report.findings.push(...r.findings)
      report.checked++
      deps.log(`  ${c.name}: ${r.findings.length} finding(s)${r.dropped ? `, ${r.dropped} dropped (another website)` : ''} · $${r.spend.usd.toFixed(3)}`)
      if (deps.dryRun) deps.log(JSON.stringify(r.findings, null, 1))
      else {
        if (r.findings.length) await deps.store.insertFindings(r.findings)
        const now = deps.now()
        await deps.store.setSchedule(c.id, afterCheck({ checkIntervalDays: c.checkIntervalDays || live.checkIntervalDays }, ymd(now), now.toISOString(), depth === 'deep'))
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      report.failed.push({ name: c.name, error })
      deps.log(`  ${c.name}: FAILED — ${error}`)
    }
    await save()
  }
  if (!deps.dryRun) await deps.store.updateRun(runId, { finished_at: deps.now().toISOString(), stopped_reason: report.stoppedReason })
  await save()
  return report
}

/** A whole job: 'scheduled' (the daily cron) runs the full deep check's daily share while one is requested, then the
 *  routine share; 'deep' / 'routine' / 'single' are the manual modes. */
export async function runChecker(deps: CheckerDeps, job: { mode: Mode | 'scheduled'; trigger: 'schedule' | 'manual'; competitor?: string | null; limit?: number | null }): Promise<RunReport[]> {
  const settings = await deps.store.settings()
  const today = ymd(deps.now())
  const all = (await deps.store.competitors()).filter(c => c.checkUrls.length > 0 || !!c.website)
  const reports: RunReport[] = []
  const spent = await deps.store.spend(today)
  const spentSoFar = () => ({ todayUsd: spent.todayUsd + reports.reduce((s, r) => s + r.spend.usd, 0), monthUsd: spent.monthUsd + reports.reduce((s, r) => s + r.spend.usd, 0), priorAvgUsd: spent.priorAvgUsd })
  if (settings.paused) {
    deps.log('Paused in Admin › Pricing check › Automatic checks — nothing checked.')
    if (!deps.dryRun) { const id = await deps.store.createRun({ mode: job.mode === 'scheduled' ? 'routine' : job.mode, trigger: job.trigger, started_at: deps.now().toISOString() }); await deps.store.updateRun(id, { finished_at: deps.now().toISOString(), stopped_reason: 'paused' }) }
    return [{ runId: null, mode: job.mode === 'scheduled' ? 'routine' : job.mode, checked: 0, failed: [], spend: ZERO_SPEND, stoppedReason: 'paused', findings: [] }]
  }
  if (job.mode === 'single') {
    const key = String(job.competitor ?? '').trim().toLowerCase()
    const c = all.find(x => x.id === job.competitor || x.name.trim().toLowerCase() === key)
    if (!c) throw new Error(`No competitor with the id or name "${job.competitor}".`)
    reports.push(await runOne(deps, settings, 'single', job.trigger, [c], spentSoFar()))
    return reports
  }
  const deepDone = new Set<string>()
  if (job.mode === 'deep' || (job.mode === 'scheduled' && settings.deepRequestedAt)) {
    const list = selectDeep(all, settings.deepRequestedAt, job.limit ?? settings.deepPerDay)
    if (list.length) {
      const r = await runOne(deps, settings, 'deep', job.trigger, list, spentSoFar())
      reports.push(r)
      for (const c of list.slice(0, r.checked + r.failed.length)) deepDone.add(c.id)
      if (r.stoppedReason !== 'done') return reports
    }
    if (job.mode === 'deep') return reports
  }
  // Routine: first check dates for active competitors that have none, spread evenly over the interval.
  const firstDates = spreadFirstDates(all, today, settings.checkIntervalDays)
  for (const [id, date] of firstDates) {
    const c = all.find(x => x.id === id)!
    c.nextCheckAt = date
    if (!deps.dryRun) await deps.store.setSchedule(id, { next_check_at: date })
  }
  const quota = job.limit ?? routineQuota(all.filter(c => c.lifecycle === 'active').length, settings.checkIntervalDays)
  const list = selectRoutine(all, today, quota, deepDone)
  if (list.length) reports.push(await runOne(deps, settings, 'routine', job.trigger, list, spentSoFar()))
  return reports
}

/** The admin email: a short summary, only when a run found something to review. */
export function summaryEmail(reports: RunReport[], adminUrl: string): { subject: string; text: string; html: string } | null {
  const pending = reports.flatMap(r => r.findings).filter(f => f.outcome !== 'unchanged' || f.second_check !== 'confirmed' || !f.quote_in_page)
  if (!pending.length) return null
  const checked = reports.reduce((s, r) => s + r.checked, 0)
  const cost = reports.reduce((s, r) => s + r.spend.usd, 0)
  const lines = [
    `The competitor check found ${pending.length} change${pending.length === 1 ? '' : 's'} to review (${checked} competitor${checked === 1 ? '' : 's'} checked, $${cost.toFixed(2)}).`,
    ...reports.filter(r => r.stoppedReason !== 'done').map(r => `The ${r.mode} run stopped early: ${r.stoppedReason.replace('_', ' ')}.`),
    ...reports.flatMap(r => r.failed).slice(0, 10).map(f => `Couldn't check ${f.name}: ${f.error}`),
    `Review them in Admin › Pricing check › Automatic checks: ${adminUrl}`,
  ]
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return { subject: `Competitor check: ${pending.length} to review`, text: lines.join('\n\n'), html: lines.map(l => `<p>${esc(l)}</p>`).join('') }
}

export type { Lifecycle }
