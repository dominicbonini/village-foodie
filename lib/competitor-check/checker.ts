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
// competitor-check-2: 🔴 A FAILED LOGIN STOPS EVERYTHING — an authentication or permission error (the federation token
// exchange, a 401 or 403) ends the run at once with stopped_reason 'error' and the reason, and nothing else is tried; a run in
// which EVERY competitor failed is 'error' too. Either way the script exits non-zero (exitCodeOf), so Actions shows a red cross.
// The deep check works COUNTRY BY COUNTRY (deep_country, deep_queue: lib/competitor-check/core.ts selectDeepByCountry).
// global-players-1: a competitor that sells in SEVERAL countries is deep-checked for the one country it was picked for —
// the extractor is told that country only (prompts.ts countryTask), sees only that country's stored plans, reads at most
// COUNTRY_MAX_FETCHES pages, and any finding about another country is dropped; deep_checked_in stamps the country.
// comparison-features-1: the extractor is asked about every CHECKED feature of the master list (key, label, explanation —
// CheckSettings.features) and records one 'feature' finding each: value, note, verbatim quote, URL. A finding about a key
// not in the list is dropped. Quote checks and the verifier are unchanged.
import type Anthropic from '@anthropic-ai/sdk'
import {
  RECORD_FINDINGS_TOOL, RECORD_VERDICT_TOOL, QUOTED_OUTCOMES, PLAN_FIELDS, hostOf, onOwnSite, APP_STORE_HOSTS,
  validateRecordFindings, validateRecordVerdict, type RawFinding, type Field,
} from './model'
import {
  quoteInPages, fetchedPages, costOf, addSpend, ZERO_SPEND, budgetStop, routineQuota, spreadFirstDates, selectRoutine, selectDeep,
  afterCheck, deepQueueOf, deepTargets, nextDeepCountry, isMultiCountry, scaleTokens, type Prices, type Spend, type SchedRow, type Lifecycle, type QueueCountry,
} from './core'
import { EXTRACTOR_SYSTEM, VERIFIER_SYSTEM, extractorMessage, verifierMessage, type StoredPlanForPrompt, type CheckFeature } from './prompts'
import { effectiveValue, type FeatureValueRow } from '@/lib/comparison-features'
import { runPass, type BatchApi, type PassBatch, type PassSettings } from './pass'

type Row = Record<string, unknown>
export type Mode = 'deep' | 'routine' | 'single' | 'pass'   // pass: competitor-check-3, the quick pass (lib/competitor-check/pass.ts)

export interface CheckSettings {
  paused: boolean; dailyCapUsd: number; monthlyCapUsd: number; deepPerDay: number; checkIntervalDays: number
  deepRequestedAt: string | null; extractorModel: string; verifierModel: string; prices: Prices
  /** competitor-check-2 (20261045): the country the deep check is on (null: none), and the stored order (empty: the default). */
  deepCountry: string | null; deepQueue: string[]
  /** comparison-features-1: the CHECKED features the extractor is asked about (store.features(), read once per job). */
  features?: CheckFeature[]
  /** competitor-check-3 (20261049): the quick pass's settings (its own models, share, limits, the batch in flight). */
  pass: PassSettings
}
export interface CompetitorForCheck extends SchedRow {
  website: string | null; focus: string | null; checkUrls: string[]
  /** comparison-features-1: its current answers (competitor_feature_values), every country's and each country's own. */
  featureValues: FeatureValueRow[]; plans: StoredPlanForPrompt[]
}
export interface FindingRow {
  run_id: string; competitor_id: string; plan_id: string | null; country_code: string | null; field: Field
  stored_value: string | null; found_value: string | null; found: Row; quote: string | null; quote_en: string | null; source_url: string | null
  outcome: RawFinding['outcome']; quote_in_page: boolean; second_check: 'confirmed' | 'disagreed' | 'not_run'
  second_value: string | null; second_quote: string | null; review_status: 'pending'
}
/** The scheduling columns — the ONLY competitor columns the checker may write. */
export const SCHEDULE_COLUMNS = ['next_check_at', 'last_checked_at', 'deep_checked_at', 'check_requested_at', 'deep_checked_in', 'pass_state'] as const
/** global-players-1: a country check reads at most this many pages (and half as many searches) — its cost stays bounded. */
export const COUNTRY_MAX_FETCHES = 8

export interface CheckerStore {
  settings(): Promise<CheckSettings>
  competitors(): Promise<CompetitorForCheck[]>
  /** USD spent today and this month (UTC) by earlier runs, and the recent average per competitor (null before any). */
  spend(today: string): Promise<{ todayUsd: number; monthUsd: number; priorAvgUsd: number | null }>
  createRun(row: Row): Promise<string>
  updateRun(id: string, cols: Row): Promise<void>
  insertFindings(rows: FindingRow[]): Promise<void>
  setSchedule(id: string, cols: Partial<Record<(typeof SCHEDULE_COLUMNS)[number], string | null | Record<string, unknown>>>): Promise<void>
  /** competitor-check-2: every country's switch and comparison status (read only), for the default deep queue. */
  countries(): Promise<QueueCountry[]>
  /** competitor-check-2: moves the deep check on to the next country (null: the queue is done) — settings.deep_country only. */
  setDeepCountry(code: string | null): Promise<void>
  /** comparison-features-1: the CHECKED features, with their English words (the master list; the shipped file until seeded). */
  features?(): Promise<CheckFeature[]>
  /** competitor-check-3: records the quick pass's Message Batch in flight (null once collected) — settings.pass_batch only. */
  setPassBatch?(batch: PassBatch | null): Promise<void>
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
  /** competitor-check-3: the Message Batches API (the SDK's client.beta.messages.batches, or fixtures) — the quick pass uses it. */
  batch?: BatchApi
}
export interface RunReport {
  runId: string | null; mode: Mode; checked: number; failed: { name: string; error: string }[]; spend: Spend
  stoppedReason: 'done' | 'daily_cap' | 'monthly_cap' | 'paused' | 'error'; findings: FindingRow[]
  /** competitor-check-2: why a run stopped with 'error' (a failed login, or every competitor failed). */
  error?: string
  /** competitor-check-2: the ids checked successfully (the deep check's country progress). */
  checkedIds?: string[]
}

/** competitor-check-2: the reason, when an error is a failed LOGIN — the federation token exchange (the SDK's
 *  WorkloadIdentityError, or an identity-token file it can't read), or a 401 / 403 from the API. Null for anything else. */
export function loginFailure(e: unknown): string | null {
  if (!e || typeof e !== 'object') return null
  const kind = (e as { constructor?: { name?: string } }).constructor?.name ?? ''
  const status = (e as { status?: unknown }).status
  const text = e instanceof Error ? e.message : String(e)
  if (['WorkloadIdentityError', 'AuthenticationError', 'PermissionDeniedError'].includes(kind) || status === 401 || status === 403
    || /identity token|token exchange|token endpoint|workload identity/i.test(text))
    return `The Claude API login failed (${kind || `status ${status}`}): ${text}`
  return null
}
/** competitor-check-2: the script's exit code — non-zero when any run stopped with 'error'. */
export const exitCodeOf = (reports: readonly RunReport[]) => (reports.some(r => r.stoppedReason === 'error') ? 1 : 0)

const ymd = (d: Date) => d.toISOString().slice(0, 10)
const minor = (n: number | null, cur: string) => (n === null ? 'not stated' : `${(n / 100).toFixed(2)} ${cur}`)
const bps = (b: number) => `${(b / 100).toLocaleString('en-GB', { maximumFractionDigits: 2 })}%`

/** The stored value a finding is compared with, written plainly — from OUR data, never the model's. */
export function storedValueOf(field: Field, c: CompetitorForCheck, plan: StoredPlanForPrompt | null, featureKey: string | null = null, country: string | null = null): string | null {
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
  if (field === 'feature') {
    const v = featureKey ? effectiveValue(c.featureValues, c.id, featureKey, country) : null
    return v ? `${v.value}${v.note ? ` — ${v.note}` : ''}` : 'unknown'
  }
  if (field === 'classification') return `${c.lifecycle}${c.focus ? ` · ${c.focus}` : ''}`
  if (field === 'url') return c.checkUrls.join(' · ') || null
  return null
}
/** The finding's value in words, when the model gave typed parts but no text. */
export function describeFound(f: RawFinding): string | null {
  if (f.found_value) return f.found_value
  if (f.feature) return `${f.feature}${f.note ? ` — ${f.note}` : ''}`
  if (f.classification) return f.classification
  if (f.url) return f.url
  const parts = [f.amount !== null ? `${f.amount} ${f.currency ?? ''}`.trim() : null, f.percent !== null ? `${f.percent}%` : null,
    f.period ? `per ${f.period}` : null, f.vat ? `VAT ${f.vat}` : null].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

/** comparison-features-1: the competitor's current answers for the checked keys, as the message shows them (the country's own
 *  row when a country is checked, else the every-country one). */
export function answersFor(c: Pick<CompetitorForCheck, 'id' | 'featureValues'>, keys: readonly string[], country: string | null): Record<string, { value: string; note: string | null }> {
  return Object.fromEntries(keys.map(k => { const v = effectiveValue(c.featureValues, c.id, k, country); return [k, { value: v?.value ?? 'unknown', note: v?.note ?? null }] }))
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
export async function converse<T>(deps: CheckerDeps, a: {
  model: string; system: string | Row[]; user: string | Row[]; tools: Row[]; toolName: string; effort: 'low' | 'medium' | 'high'
  validate(input: unknown): { ok: true; value: T } | { ok: false; errors: string[] }; maxTurns: number; prices: Prices
  /** competitor-check-3: a response already produced (a Message Batch result) — the conversation continues from it. */
  seed?: Anthropic.Beta.BetaMessage
  /** Its token cost is this share of the normal price (a batch: 0.5); a web search keeps its full fee. */
  seedScale?: number
  /** Stop before a further turn whose input would reach this many tokens (Haiku's price rises above 100,000). */
  maxInputTokens?: number
  maxTokens?: number
}): Promise<{ value: T; contents: unknown[][]; spend: Spend }> {
  const messages: Row[] = [{ role: 'user', content: a.user }]
  const contents: unknown[][] = []
  let spend = ZERO_SPEND, fixes = 0, nudged = false
  // The server-side refusal fallback exists for the Sonnet / Opus / Fable families only (none for Haiku), and the Batches
  // API rejects the parameter — so it is sent only where it applies.
  const fallback = !/haiku/.test(a.model)
  for (let turn = 0; turn < a.maxTurns; turn++) {
    const seeded = turn === 0 && !!a.seed
    const res = seeded ? a.seed! : await deps.api({
      model: a.model, max_tokens: a.maxTokens ?? 16000, system: a.system, messages, tools: a.tools,
      output_config: { effort: a.effort },
      // The skill's default for this model family: on a policy decline the API re-runs the request on a fallback model.
      ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
    })
    const priced = a.prices.models[res.model] ? res.model : a.model
    const cost = costOf(res.usage as never, priced, a.prices)
    spend = addSpend(spend, seeded && a.seedScale !== undefined ? scaleTokens(cost, a.seedScale, a.prices) : cost)
    contents.push(res.content as unknown[])
    // competitor-check-3: never send a turn whose input would cross the limit — the next turn re-reads all of this one.
    const u = (res.usage ?? {}) as { input_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null; output_tokens?: number | null }
    const nextInput = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.output_tokens ?? 0)
    // A further turn adds a short message of ours (a nudge or the errors to fix) on top: keep 2,000 tokens of room for it.
    const mayContinue = a.maxInputTokens === undefined || nextInput + 2_000 < a.maxInputTokens
    const stopHere = (): never => { throw new Error(`the next turn would reach ${a.maxInputTokens!.toLocaleString('en-GB')} input tokens — stopped`) }
    if (res.stop_reason === 'refusal') throw new Error('the model declined the request')
    if (res.stop_reason === 'max_tokens') throw new Error('the response was cut off (max_tokens)')
    messages.push({ role: 'assistant', content: res.content })
    if (res.stop_reason === 'pause_turn') { if (!mayContinue) stopHere(); continue }
    const uses = (res.content as { type: string; id?: string; name?: string; input?: unknown }[]).filter(b => b.type === 'tool_use')
    const mine = uses.find(u => u.name === a.toolName)
    if (mine) {
      const v = a.validate(mine.input)
      if (v.ok) return { value: v.value, contents, spend }
      if (fixes++ >= 1) throw new Error(`${a.toolName} was malformed twice: ${v.errors.slice(0, 3).join(' ')}`)
      if (!mayContinue) stopHere()
      messages.push({ role: 'user', content: uses.map(u => ({ type: 'tool_result', tool_use_id: u.id, is_error: true,
        content: u === mine ? `Rejected — fix these and call ${a.toolName} again: ${v.errors.slice(0, 20).join(' ')}` : 'Not run.' })) })
      continue
    }
    if (!mayContinue) stopHere()
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
export async function checkCompetitor(deps: CheckerDeps, settings: CheckSettings, c: CompetitorForCheck, depth: 'deep' | 'routine', runId: string, country: string | null = null):
  Promise<{ findings: FindingRow[]; spend: Spend; dropped: number }> {
  const domains = domainsOf(c)
  const allowed = [...domains, ...APP_STORE_HOSTS]
  const today = ymd(deps.now())
  const keys = (settings.features ?? []).map(f => f.key)
  const fetches = country ? COUNTRY_MAX_FETCHES : depth === 'deep' ? 12 : 6
  const searches = country ? Math.ceil(COUNTRY_MAX_FETCHES / 2) : depth === 'deep' ? 6 : 3
  const ex = await converse(deps, {
    model: settings.extractorModel, system: EXTRACTOR_SYSTEM, toolName: RECORD_FINDINGS_TOOL.name, prices: settings.prices,
    effort: depth === 'deep' ? 'medium' : 'low', maxTurns: depth === 'deep' ? 12 : 8, validate: validateRecordFindings,
    user: extractorMessage({ name: c.name, website: c.website, lifecycle: c.lifecycle, focus: c.focus, check_urls: c.checkUrls,
      features: answersFor(c, keys, country), plans: c.plans }, depth, today,
      country ? { code: country, maxFetches: COUNTRY_MAX_FETCHES } : undefined, settings.features ?? []),
    tools: [
      { type: 'web_fetch_20260318', name: 'web_fetch', max_uses: fetches, max_content_tokens: 12000, allowed_domains: allowed },
      { type: 'web_search_20260318', name: 'web_search', max_uses: searches, allowed_domains: allowed },
      RECORD_FINDINGS_TOOL,
    ],
  })
  const { findings, dropped } = rowsFrom(c, ex, { runId, country, keys, domains })
  // The second check, on its own fresh conversation per claim. Deep: every quoted finding; routine: every change and every
  // quote not found on the page.
  const spend = addSpend(ex.spend, await secondCheck(deps, { model: settings.verifierModel, prices: settings.prices, pageTokens: 12000, allowed }, c, findings,
    row => depth === 'deep' || row.outcome !== 'unchanged' || !row.quote_in_page))
  return { findings, spend, dropped }
}

/** The extractor's findings as rows, after the rules: a finding about another website, another country, an availability
 *  outside a country check, or a feature not in `keys` is dropped; the quote check runs on every quoted one. */
export function rowsFrom(c: CompetitorForCheck, ex: { value: { findings: RawFinding[] }; contents: unknown[][] }, o: { runId: string; country: string | null; keys: readonly string[]; domains: readonly string[] }):
  { findings: FindingRow[]; dropped: number } {
  const { runId, country, keys, domains } = o
  const pages = fetchedPages(ex.contents).map(p => p.text)
  let dropped = 0
  const findings: FindingRow[] = []
  for (const f of ex.value.findings) {
    // A finding about another website is not one: the rules allow the competitor's own site and the app stores only.
    if (f.source_url && !onOwnSite(f.source_url, domains)) { dropped++; continue }
    if (f.outcome === 'new_url' && f.url && !onOwnSite(f.url, domains)) { dropped++; continue }
    // A country check is about that country only: a finding about another one is dropped; the rest are that country's.
    if (country && f.country_code && f.country_code !== country) { dropped++; continue }
    if (country && !f.country_code) f.country_code = country
    // An availability finding outside a country check has no country to be about.
    if (!country && f.field === 'availability') { dropped++; continue }
    // comparison-features-1: a feature must be one of the checked keys; outside a country check it is about every country.
    if (f.field === 'feature' && (!f.feature_key || !keys.includes(f.feature_key))) { dropped++; continue }
    if (f.field === 'feature' && !country) f.country_code = null
    const plan = matchPlan(c, f)
    const { field, plan_name, country_code, outcome, found_value, quote, quote_en, source_url, ...typed } = f
    findings.push({
      run_id: runId, competitor_id: c.id, plan_id: plan?.id ?? null, country_code: country_code ?? plan?.country_code ?? null, field,
      stored_value: outcome === 'new_plan' ? null : storedValueOf(field, c, plan, f.feature_key, country), found_value: describeFound(f),
      found: { ...typed, plan_name, found_value }, quote, quote_en, source_url, outcome,
      quote_in_page: (QUOTED_OUTCOMES as readonly string[]).includes(outcome) ? quoteInPages(quote, pages) : false,
      second_check: 'not_run', second_value: null, second_quote: null, review_status: 'pending',
    })
  }
  return { findings, dropped }
}

/** The second check on the quoted findings `wanted` picks — each on its own fresh conversation, the verifier fetching the page
 *  itself. Confirmed only when it says so AND its own quote is in the page it fetched. Returns what it cost. */
export async function secondCheck(deps: CheckerDeps, v: { model: string; prices: Prices; pageTokens: number; allowed: string[]; maxInputTokens?: number },
  c: Pick<CompetitorForCheck, 'name'>, rows: FindingRow[], wanted: (row: FindingRow) => boolean): Promise<Spend> {
  let spend = ZERO_SPEND
  for (const row of rows) {
    const quoted = (QUOTED_OUTCOMES as readonly string[]).includes(row.outcome) && !!row.source_url
    if (!quoted || !wanted(row)) continue
    try {
      const r = await converse(deps, {
        model: v.model, system: VERIFIER_SYSTEM, toolName: RECORD_VERDICT_TOOL.name, prices: v.prices, effort: 'low', maxTurns: 4, maxInputTokens: v.maxInputTokens,
        validate: input => { const x = validateRecordVerdict(input); return x ? { ok: true, value: x } : { ok: false, errors: ['record_verdict needs verdict, value, quote and quote_en.'] } },
        user: verifierMessage({ competitor: c.name, field: row.field, plan: (row.found.plan_name as string | null) ?? null, value: row.found_value ?? '(none)', url: row.source_url! }),
        tools: [{ type: 'web_fetch_20260318', name: 'web_fetch', max_uses: 2, max_content_tokens: v.pageTokens, allowed_domains: v.allowed }, RECORD_VERDICT_TOOL],
      })
      spend = addSpend(spend, r.spend)
      const ownPages = fetchedPages(r.contents).map(p => p.text)
      row.second_check = r.value.verdict === 'confirmed' && quoteInPages(r.value.quote, ownPages) ? 'confirmed' : 'disagreed'
      row.second_value = r.value.value
      row.second_quote = r.value.quote
    } catch (e) {
      if (loginFailure(e)) throw e   // a failed login is never just one claim's problem
      deps.log(`  verifier failed for ${c.name} · ${row.field}: ${e instanceof Error ? e.message : e}`)
    }
  }
  return spend
}

/** One run: picks the competitors, guards the budget, checks each, writes per competitor. */
async function runOne(deps: CheckerDeps, settings: CheckSettings, mode: Mode, trigger: 'schedule' | 'manual', list: CompetitorForCheck[],
  spentBefore: { todayUsd: number; monthUsd: number; priorAvgUsd: number | null }, countryOf: ReadonlyMap<string, string> = new Map()): Promise<RunReport> {
  const started = deps.now()
  const runId = deps.dryRun ? `dry-run-${mode}` : await deps.store.createRun({ mode, trigger, started_at: started.toISOString() })
  const report: RunReport = { runId: deps.dryRun ? null : runId, mode, checked: 0, failed: [], spend: ZERO_SPEND, stoppedReason: 'done', findings: [], checkedIds: [] }
  const depth = mode === 'routine' ? 'routine' : 'deep'
  const save = async () => {
    if (deps.dryRun) return
    await deps.store.updateRun(runId, {
      competitors_checked: report.checked, input_tokens: report.spend.inputTokens, output_tokens: report.spend.outputTokens,
      web_searches: report.spend.webSearches, web_fetches: report.spend.webFetches, cost_usd: Number(report.spend.usd.toFixed(4)),
      notes: report.error || report.failed.length ? [report.error, ...report.failed.map(f => `${f.name}: ${f.error}`)].filter(Boolean).join(' · ').slice(0, 4000) : null,
    })
  }
  for (const c of list) {
    const live = deps.dryRun ? settings : { ...(await deps.store.settings()), features: settings.features }
    if (live.paused) { report.stoppedReason = 'paused'; break }
    const guard = budgetStop({ spentTodayUsd: spentBefore.todayUsd + report.spend.usd, spentMonthUsd: spentBefore.monthUsd + report.spend.usd,
      runUsd: report.spend.usd, runChecked: report.checked + report.failed.length, priorAvgUsd: spentBefore.priorAvgUsd,
      caps: { dailyUsd: live.dailyCapUsd, monthlyUsd: live.monthlyCapUsd } })
    if (guard.stop) { report.stoppedReason = guard.reason; deps.log(`  stopped before ${c.name}: ${guard.reason} (next one estimated at $${guard.estimateUsd.toFixed(2)})`); break }
    try {
      // global-players-1: a competitor in several countries, picked for a country, is checked for that country only.
      const country = depth === 'deep' && isMultiCountry(c) ? countryOf.get(c.id) ?? null : null
      const r = await withTimeout(checkCompetitor(deps, live, c, depth, runId, country), deps.timeLimitMs ?? (depth === 'deep' ? 600_000 : 300_000), country ? `${c.name} (${country})` : c.name)
      report.spend = addSpend(report.spend, r.spend)
      report.findings.push(...r.findings)
      report.checked++
      report.checkedIds!.push(c.id)
      deps.log(`  ${c.name}${country ? ` · ${country}` : ''}: ${r.findings.length} finding(s)${r.dropped ? `, ${r.dropped} dropped (another website)` : ''} · $${r.spend.usd.toFixed(3)}`)
      if (deps.dryRun) deps.log(JSON.stringify(r.findings, null, 1))
      else {
        if (r.findings.length) await deps.store.insertFindings(r.findings)
        const now = deps.now()
        await deps.store.setSchedule(c.id, afterCheck({ checkIntervalDays: c.checkIntervalDays || live.checkIntervalDays, deepCheckedIn: c.deepCheckedIn }, ymd(now), now.toISOString(), depth === 'deep', country))
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      const login = loginFailure(e)
      if (login) {
        // Stop the whole run at once: every other competitor would fail the same way.
        report.stoppedReason = 'error'; report.error = `${login} — the run stopped before checking anything else.`
        deps.log(`  ${report.error}`)
        await save()
        break
      }
      report.failed.push({ name: c.name, error })
      deps.log(`  ${c.name}: FAILED — ${error}`)
    }
    await save()
  }
  if (report.stoppedReason === 'done' && report.checked === 0 && report.failed.length > 0) {
    report.stoppedReason = 'error'; report.error = `Every competitor in this run failed (${report.failed.length}).`
    deps.log(`  ${report.error}`)
  }
  if (!deps.dryRun) await deps.store.updateRun(runId, { finished_at: deps.now().toISOString(), stopped_reason: report.stoppedReason })
  await save()
  return report
}

/** A whole job: 'scheduled' (the daily cron) runs the full deep check's daily share while one is requested, then the
 *  routine share; 'deep' / 'routine' / 'single' are the manual modes. */
export async function runChecker(deps: CheckerDeps, job: { mode: Mode | 'scheduled'; trigger: 'schedule' | 'manual'; competitor?: string | null; limit?: number | null }): Promise<RunReport[]> {
  // comparison-features-1: the checked features are read once per job and carried with the settings.
  const settings = { ...(await deps.store.settings()), features: deps.store.features ? await deps.store.features() : [] }
  const today = ymd(deps.now())
  const all = (await deps.store.competitors()).filter(c => c.checkUrls.length > 0 || !!c.website)
  const reports: RunReport[] = []
  const spent = await deps.store.spend(today)
  // competitor-check-3: a quick-pass batch just submitted reserves its estimate today (its cost lands when it is collected).
  let reserved = 0
  const spentSoFar = () => ({ todayUsd: spent.todayUsd + reserved + reports.reduce((s, r) => s + r.spend.usd, 0), monthUsd: spent.monthUsd + reserved + reports.reduce((s, r) => s + r.spend.usd, 0), priorAvgUsd: spent.priorAvgUsd })
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
  // competitor-check-3: the quick pass — first in the nightly job (collect the batch in flight, submit the next share).
  if (job.mode === 'pass' || (job.mode === 'scheduled' && (settings.pass.requestedAt || settings.pass.batch))) {
    const queue = deepQueueOf(settings.deepQueue, await deps.store.countries(), all)
    const r = await runPass(deps, settings, all, queue, { trigger: job.trigger, limit: job.mode === 'pass' ? job.limit : null }, spentSoFar)
    reports.push(...r.reports); reserved += r.reservedUsd
    if (job.mode === 'pass' || r.reports.some(x => x.stoppedReason === 'error')) return reports
  }
  const deepDone = new Set<string>()
  // competitor-check-2: the scheduled deep share runs while a country is set (Start deep check); it works through that
  // country, then the next in the queue. A manual deep run with no country set takes everyone by name, as before.
  if (job.mode === 'deep' || (job.mode === 'scheduled' && settings.deepCountry)) {
    const limit = job.limit ?? settings.deepPerDay
    const queue = settings.deepCountry ? deepQueueOf(settings.deepQueue, await deps.store.countries(), all) : []
    const targets = settings.deepCountry ? deepTargets(all, queue, settings.deepCountry, settings.deepRequestedAt, limit) : selectDeep(all, settings.deepRequestedAt, limit).map(row => ({ row, country: '' }))
    const list = targets.map(x => x.row)
    const countryOf = new Map(targets.filter(x => x.country).map(x => [x.row.id, x.country]))
    if (list.length) {
      const r = await runOne(deps, settings, 'deep', job.trigger, list, spentSoFar(), countryOf)
      reports.push(r)
      for (const c of list.slice(0, r.checked + r.failed.length)) deepDone.add(c.id)
      const at = deps.now().toISOString()
      for (const id of r.checkedIds ?? []) {
        const c = all.find(x => x.id === id)
        if (!c) continue
        c.deepCheckedAt = at
        if (countryOf.has(id) && isMultiCountry(c)) c.deepCheckedIn = { ...(c.deepCheckedIn ?? {}), [countryOf.get(id)!]: at }
      }
    }
    if (settings.deepCountry && !deps.dryRun) {
      const next = nextDeepCountry(all, queue, settings.deepCountry, settings.deepRequestedAt)
      if (next !== settings.deepCountry) {
        await deps.store.setDeepCountry(next)
        deps.log(next ? `Deep check: ${settings.deepCountry} is done — on to ${next}.` : `Deep check: ${settings.deepCountry} is done, and so is the rest of the queue.`)
      }
    }
    if (reports.length && reports[reports.length - 1].stoppedReason !== 'done') return reports
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
