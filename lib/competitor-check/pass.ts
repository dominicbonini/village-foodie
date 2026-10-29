// lib/competitor-check/pass.ts — THE QUICK PASS (competitor-check-3, 29 October 2026; docs/competitor-check-3-report.md).
// One cheap check of every competitor in every country it sells in, alongside the thorough deep check (which becomes the
// later per-country dive). Run by lib/competitor-check/checker.ts runChecker (mode 'pass', and in the nightly job).
//
// WHAT ONE CHECK READS — a competitor in ONE country, on the pass's own model (Haiku by default):
//   • prices and fees of its plans there, the card rate, the minimum term, the set-up fee and the free trial;
//   • ONLY the features shown on that country's comparison page (show_scope 'all', or 'some' naming it) — never a hidden one.
// A CANDIDATE first gets one classification read (one page, nothing else); only a relevant one (food-truck or restaurant
// ordering, or a POS player) gets the checks, the rest a "not relevant" finding for Dominic to accept.
//
// 🔴 HARD LIMITS per check: at most pass_max_fetches pages and pass_max_searches searches; each page capped at
// pass_max_page_tokens; no request's input reaches 100,000 tokens (Haiku's price rises above it) — the request is shrunk
// before it is sent, and no further turn is sent once the next would reach it; at most three turns.
// 🔴 PROMPT CACHING: the system prompt and the country's feature list are the stable prefix (cache_control). The tools come
// first in the cached prefix and carry the competitor's own allowed_domains, so the cache only hits within one
// competitor's requests — kept on purpose: the domain lock is what keeps a check on the competitor's own site.
// 🔴 MESSAGE BATCHES (50% off tokens): competitor-check-1 STEP 0a found that batches support the web fetch and web search
// server tools, so the pass submits its daily share as one batch and collects it on the next run. A dry run, or a
// checker built without the batch API, runs the same checks one by one.
// 🔴 THE SECOND CHECK: the quote check on every finding; the verifier only on prices, fees, the minimum term, the set-up fee,
// the trial, and feature answers that differ from what is stored.
// 🔴 FINDINGS are written exactly as the routine and deep checks write them (Dominic accepts each); pass_state records each
// competitor and country done, so a stopped pass resumes where it stopped. The daily and monthly caps cover everything.
import type Anthropic from '@anthropic-ai/sdk'
import { RECORD_FINDINGS_TOOL, APP_STORE_HOSTS, validateRecordFindings, type Classification } from './model'
import { EXTRACTOR_SYSTEM, passFeatureBlock, passCompetitorBlock, classifyMessage, type CheckFeature } from './prompts'
import { addSpend, ZERO_SPEND, budgetStop, passTargets, type PassItem, type PassState, type Spend } from './core'
import {
  converse, rowsFrom, secondCheck, domainsOf, answersFor, loginFailure,
  type CheckerDeps, type CheckSettings, type CompetitorForCheck, type FindingRow, type RunReport,
} from './checker'

type Row = Record<string, unknown>

/** competitor-check-1 STEP 0a (Anthropic's batch-processing page, 25 Oct 2026): "Tool use, including all server tools (web
 *  search, web fetch, code execution …)". The pass uses the Batch API because of this. */
export const BATCH_SUPPORTS_SERVER_TOOLS = true
/** Haiku 5.5's price for a request's input rises above this (STEP 0a: "$0.10 input … prompts up to 100k tokens"). */
export const PRICE_STEP_TOKENS = 100_000
/** What one web search's results may add to the input (an estimate, for the request's worst case). */
export const SEARCH_RESULT_TOKENS = 8_000
/** A batch result costs half the token price; a web search keeps its full fee. */
export const BATCH_TOKEN_SCALE = 0.5
/** A check's cost before any pass has run (the fixture estimate in docs/competitor-check-3-report.md §5). */
export const PASS_ESTIMATE_USD = 0.03
const OUTPUT_TOKENS = 6_000
/** The findings the verifier checks in the pass: prices and fees (and new or gone plans), and these two features. */
export const PASS_VERIFIED_FIELDS = ['monthly_price', 'setup_fee', 'truck_fee', 'customer_fee', 'card_rate', 'plan'] as const
export const PASS_VERIFIED_FEATURES = ['term', 'trial'] as const

export interface PassBatchItem { customId: string; competitorId: string; country: string | null; kind: 'classify' | 'check' }
export interface PassBatch { id: string; submittedAt: string; items: PassBatchItem[]; estimateUsd: number }
export interface PassSettings {
  extractorModel: string; verifierModel: string; perDay: number; requestedAt: string | null; country: string | null
  maxFetches: number; maxSearches: number; maxPageTokens: number; batch: PassBatch | null
}
export const DEFAULT_PASS: PassSettings = { extractorModel: 'claude-haiku-5-5', verifierModel: 'claude-haiku-5-5', perDay: 40, requestedAt: null, country: null,
  maxFetches: 3, maxSearches: 1, maxPageTokens: 6000, batch: null }
/** The Message Batches calls the pass needs (the SDK's client.beta.messages.batches, or a harness's fixtures). */
export interface BatchApi {
  create(requests: { custom_id: string; params: Row }[]): Promise<{ id: string }>
  retrieve(id: string): Promise<{ processing_status: string }>
  results(id: string): Promise<AsyncIterable<{ custom_id: string; result: { type: string; message?: Anthropic.Beta.BetaMessage } }>>
}

/** Batch when the docs allow it and the checker has the batch API; never for a dry run (it would bill a whole batch). */
export const passTransport = (deps: Pick<CheckerDeps, 'batch' | 'dryRun'>): 'batch' | 'sync' => (BATCH_SUPPORTS_SERVER_TOOLS && deps.batch && !deps.dryRun ? 'batch' : 'sync')
/** The features a check asks about in a country: shown on its comparison page, checked, and not read from the plans. */
export const visibleFeatures = (features: readonly CheckFeature[], country: string) =>
  features.filter(f => !f.fromPlans && (f.showScope === 'all' || (f.showScope === 'some' && (f.showCountries ?? []).includes(country))))
/** A rough token count (4 characters a token) — enough for the worst-case bound. */
export const roughTokens = (x: unknown) => Math.ceil(JSON.stringify(x).length / 4)
export const customIdOf = (competitorId: string, country: string | null) => `${competitorId}_${country ?? 'class'}`.slice(0, 64)

/**
 * One check's request. Its worst case — the prompt, every allowed page at the page cap, every search, the output — must stay
 * under 100,000 input tokens: fetches are taken away first, then the search, until it does. Returns the parts converse
 * needs and the bound it was held to.
 */
export function passRequest(c: CompetitorForCheck, item: Pick<PassItem<CompetitorForCheck>, 'kind' | 'country'>, s: CheckSettings, today: string) {
  const p = s.pass
  const allowed = [...domainsOf(c), ...APP_STORE_HOSTS]
  const classify = item.kind === 'classify'
  const feats = classify || !item.country ? [] : visibleFeatures(s.features ?? [], item.country)
  let fetches = classify ? 1 : p.maxFetches, searches = classify ? 0 : p.maxSearches
  const system = [{ type: 'text', text: EXTRACTOR_SYSTEM, cache_control: { type: 'ephemeral' } }]
  const keys = [...new Set([...feats.map(f => f.key)])]
  const user = classify ? [{ type: 'text', text: classifyMessage({ name: c.name, website: c.website, check_urls: c.checkUrls }, today) }]
    : [{ type: 'text', text: passFeatureBlock(item.country!, feats), cache_control: { type: 'ephemeral' } },
      { type: 'text', text: passCompetitorBlock({ name: c.name, website: c.website, lifecycle: c.lifecycle, focus: c.focus, check_urls: c.checkUrls,
        features: answersFor(c, keys, item.country), plans: c.plans.filter(pl => pl.country_code === item.country) }, item.country!, today, fetches, searches) }]
  const tools = (f: number, q: number) => [
    { type: 'web_fetch_20260318', name: 'web_fetch', max_uses: f, max_content_tokens: p.maxPageTokens, allowed_domains: allowed },
    ...(q > 0 ? [{ type: 'web_search_20260318', name: 'web_search', max_uses: q, allowed_domains: allowed }] : []),
    RECORD_FINDINGS_TOOL,
  ]
  const bound = (f: number, q: number) => roughTokens({ system, user, tools: tools(f, q) }) + f * p.maxPageTokens + q * SEARCH_RESULT_TOKENS + OUTPUT_TOKENS
  while (bound(fetches, searches) >= PRICE_STEP_TOKENS && fetches > 1) fetches--
  while (bound(fetches, searches) >= PRICE_STEP_TOKENS && searches > 0) searches--
  return { model: p.extractorModel, system, user, tools: tools(fetches, searches), fetches, searches, bound: bound(fetches, searches), keys, allowed }
}

/** The Messages API body of a check (what a batch request carries) — no refusal fallback: Haiku has none and batches
 *  reject the parameter. */
export function passParams(r: ReturnType<typeof passRequest>): Row {
  return { model: r.model, max_tokens: OUTPUT_TOKENS, system: r.system, messages: [{ role: 'user', content: r.user }], tools: r.tools, output_config: { effort: 'low' } }
}

/** Does the verifier check this finding? Prices, fees, plans, the minimum term, the trial — and a feature answer that
 *  differs from the stored one. */
export function needsSecondCheck(row: FindingRow): boolean {
  if ((PASS_VERIFIED_FIELDS as readonly string[]).includes(row.field)) return true
  if (row.field !== 'feature') return false
  const key = String(row.found.feature_key ?? '')
  if ((PASS_VERIFIED_FEATURES as readonly string[]).includes(key)) return true
  const stored = (row.stored_value ?? 'unknown').split(' — ')[0]
  return row.outcome === 'changed' || (row.found.feature != null && row.found.feature !== stored)
}

/** What a classification read says: relevant (an ordering tool, or a till player already filed as POS), or not. */
export function classOf(rows: FindingRow[], c: Pick<CompetitorForCheck, 'focus'>): 'relevant' | 'not_relevant' | 'unclear' {
  const f = rows.find(r => r.field === 'classification')
  const k = (f?.found.classification ?? null) as Classification | null
  if (!k) return 'unclear'
  return k === 'food_truck_ordering' || k === 'restaurant_ordering' || (k === 'pos_or_card_reader' && c.focus === 'pos') ? 'relevant' : 'not_relevant'
}

/** One item: the read (from a batch result, or asked now), the rows, the second check. */
export async function processPassItem(deps: CheckerDeps, s: CheckSettings, item: PassItem<CompetitorForCheck>, runId: string, seed?: Anthropic.Beta.BetaMessage):
  Promise<{ findings: FindingRow[]; spend: Spend; dropped: number; klass: 'relevant' | 'not_relevant' | 'unclear' | null }> {
  const c = item.row
  const r = passRequest(c, item, s, deps.now().toISOString().slice(0, 10))
  const ex = await converse(deps, {
    model: r.model, system: r.system, user: r.user, tools: r.tools, toolName: RECORD_FINDINGS_TOOL.name, prices: s.prices,
    effort: 'low', maxTurns: 3, validate: validateRecordFindings, maxInputTokens: PRICE_STEP_TOKENS, maxTokens: OUTPUT_TOKENS,
    ...(seed ? { seed, seedScale: BATCH_TOKEN_SCALE } : {}),
  })
  const keep = item.kind === 'classify' ? ['classification'] : null
  const { findings: all, dropped } = rowsFrom(c, ex, { runId, country: item.country, keys: [...r.keys, ...PASS_VERIFIED_FEATURES], domains: domainsOf(c) })
  const findings = keep ? all.filter(f => keep.includes(f.field)) : all
  const verify = item.kind === 'classify' ? ZERO_SPEND
    : await secondCheck(deps, { model: s.pass.verifierModel, prices: s.prices, pageTokens: s.pass.maxPageTokens, allowed: r.allowed, maxInputTokens: PRICE_STEP_TOKENS }, c, findings, needsSecondCheck)
  return { findings, spend: addSpend(ex.spend, verify), dropped: dropped + (all.length - findings.length), klass: item.kind === 'classify' ? classOf(findings, c) : null }
}

/** pass_state after an item: the classification, or the country done. */
export function nextPassState(prev: PassState | undefined, item: { kind: 'classify' | 'check'; country: string | null }, at: string, klass: string | null): PassState {
  const p = prev ?? {}
  return item.kind === 'classify' ? { ...p, class: (klass ?? 'unclear') as PassState['class'], class_at: at } : { ...p, done: { ...(p.done ?? {}), [item.country!]: at } }
}

/**
 * The pass's share of a job. With batches: collect the batch in flight (when it has ended), then submit the next share —
 * as many items as pass_per_day allows AND the caps allow at 1.5 × the estimated cost each. One by one (sync): the same
 * items, the budget guard before each. Returns the run reports and the estimate a just-submitted batch reserves today.
 */
export async function runPass(deps: CheckerDeps, s: CheckSettings, all: CompetitorForCheck[], queue: readonly string[], job: { trigger: 'schedule' | 'manual'; limit?: number | null },
  spent: () => { todayUsd: number; monthUsd: number; priorAvgUsd: number | null }): Promise<{ reports: RunReport[]; reservedUsd: number }> {
  const p = s.pass
  const reports: RunReport[] = []
  const byId = new Map(all.map(c => [c.id, c]))
  const transport = passTransport(deps)
  let inFlight = p.batch
  // ── 1 · collect the batch in flight ──
  if (transport === 'batch' && inFlight && deps.batch) {
    const st = await deps.batch.retrieve(inFlight.id)
    if (st.processing_status !== 'ended') { deps.log(`Quick pass: batch ${inFlight.id} is still ${st.processing_status} — collected next run.`); return { reports, reservedUsd: 0 } }
    reports.push(await collectBatch(deps, s, inFlight, byId, job.trigger))
    if (deps.store.setPassBatch) await deps.store.setPassBatch(null)
    inFlight = null
  }
  if (s.paused || !p.requestedAt) return { reports, reservedUsd: 0 }
  // ── 2 · the next share ──
  const todo = passTargets(all, queue, p.country, p.requestedAt).filter(i => i.kind === 'classify' || i.row.lifecycle !== 'candidate' || i.row.passState?.class === 'relevant')
  const want = Math.min(todo.length, job.limit ?? p.perDay)
  if (!want) { if (!todo.length) deps.log('Quick pass: every competitor and country is done.'); return { reports, reservedUsd: 0 } }
  // The run-wide average mixes in the deep check's far dearer checks, so the pass estimates its own.
  const per = 1.5 * PASS_ESTIMATE_USD
  const cap = Math.min(want, Math.floor(Math.max(0, s.dailyCapUsd - spent().todayUsd) / per), Math.floor(Math.max(0, s.monthlyCapUsd - spent().monthUsd) / per))
  if (transport === 'batch' && deps.batch) {
    if (cap <= 0) { deps.log(`Quick pass: stopped before submitting — ${s.dailyCapUsd - spent().todayUsd < per ? 'daily_cap' : 'monthly_cap'} (each check estimated at $${per.toFixed(3)})`); return { reports, reservedUsd: 0 } }
    const items = todo.slice(0, cap)
    const today = deps.now().toISOString().slice(0, 10)
    const requests = items.map(i => ({ custom_id: customIdOf(i.row.id, i.country), params: passParams(passRequest(i.row, i, s, today)) }))
    const b = await deps.batch.create(requests)
    const batch: PassBatch = { id: b.id, submittedAt: deps.now().toISOString(), items: items.map(i => ({ customId: customIdOf(i.row.id, i.country), competitorId: i.row.id, country: i.country, kind: i.kind })), estimateUsd: items.length * per }
    if (deps.store.setPassBatch) await deps.store.setPassBatch(batch)
    deps.log(`Quick pass: submitted batch ${b.id} — ${items.length} checks, estimated $${batch.estimateUsd.toFixed(2)} (collected next run).`)
    return { reports, reservedUsd: batch.estimateUsd }
  }
  reports.push(await runPassSync(deps, s, todo.slice(0, want), job.trigger, spent))
  return { reports, reservedUsd: 0 }
}

async function startRun(deps: CheckerDeps, trigger: 'schedule' | 'manual'): Promise<{ runId: string; report: RunReport }> {
  const runId = deps.dryRun ? 'dry-run-pass' : await deps.store.createRun({ mode: 'pass', trigger, started_at: deps.now().toISOString() })
  return { runId, report: { runId: deps.dryRun ? null : runId, mode: 'pass', checked: 0, failed: [], spend: ZERO_SPEND, stoppedReason: 'done', findings: [], checkedIds: [] } }
}
async function saveRun(deps: CheckerDeps, runId: string, r: RunReport, finished: boolean) {
  if (deps.dryRun) return
  await deps.store.updateRun(runId, {
    competitors_checked: r.checked, input_tokens: r.spend.inputTokens, output_tokens: r.spend.outputTokens, web_searches: r.spend.webSearches,
    web_fetches: r.spend.webFetches, cost_usd: Number(r.spend.usd.toFixed(4)),
    notes: r.error || r.failed.length ? [r.error, ...r.failed.map(f => `${f.name}: ${f.error}`)].filter(Boolean).join(' · ').slice(0, 4000) : null,
    ...(finished ? { finished_at: deps.now().toISOString(), stopped_reason: r.stoppedReason } : {}),
  })
}
/** Writes an item's findings and marks it done (pass_state), so a stopped pass resumes after it. */
async function writeItem(deps: CheckerDeps, item: PassItem<CompetitorForCheck>, out: Awaited<ReturnType<typeof processPassItem>>, r: RunReport) {
  r.findings.push(...out.findings); r.checked++; r.checkedIds!.push(item.row.id)
  r.spend = addSpend(r.spend, out.spend)
  deps.log(`  ${item.row.name}${item.country ? ` · ${item.country}` : ' · classification'}: ${out.findings.length} finding(s)${out.klass ? ` (${out.klass})` : ''} · $${out.spend.usd.toFixed(4)}`)
  if (deps.dryRun) return
  if (out.findings.length) await deps.store.insertFindings(out.findings)
  const next = nextPassState(item.row.passState, item, deps.now().toISOString(), out.klass)
  item.row.passState = next
  await deps.store.setSchedule(item.row.id, { pass_state: next as Record<string, unknown> })
}

/** The batch's results: each item read from its result (continued one by one only if it needs another turn); an errored or
 *  expired item is left undone, so the next share takes it again. */
async function collectBatch(deps: CheckerDeps, s: CheckSettings, b: PassBatch, byId: Map<string, CompetitorForCheck>, trigger: 'schedule' | 'manual'): Promise<RunReport> {
  const { runId, report } = await startRun(deps, trigger)
  const items = new Map(b.items.map(i => [i.customId, i]))
  for await (const res of await deps.batch!.results(b.id)) {
    const it = items.get(res.custom_id)
    const row = it ? byId.get(it.competitorId) : undefined
    if (!it || !row) continue
    const item = (it.kind === 'classify' ? { kind: 'classify', row, country: null, done: false } : { kind: 'check', row, country: it.country!, done: false }) as PassItem<CompetitorForCheck>
    if (res.result.type !== 'succeeded' || !res.result.message) { report.failed.push({ name: `${row.name}${it.country ? ` · ${it.country}` : ''}`, error: `batch item ${res.result.type} — retried in the next share` }); continue }
    try { await writeItem(deps, item, await processPassItem(deps, s, item, runId, res.result.message), report) }
    catch (e) {
      if (loginFailure(e)) { report.stoppedReason = 'error'; report.error = `${loginFailure(e)} — the pass stopped.`; break }
      report.failed.push({ name: `${row.name}${it.country ? ` · ${it.country}` : ''}`, error: e instanceof Error ? e.message : String(e) })
    }
    await saveRun(deps, runId, report, false)
  }
  if (report.stoppedReason === 'done' && report.checked === 0 && report.failed.length > 0) { report.stoppedReason = 'error'; report.error = `Every item of the batch failed (${report.failed.length}).` }
  await saveRun(deps, runId, report, true)
  return report
}

/** One by one: the budget guard before each item (as runOne), the same processing, written as it goes. */
async function runPassSync(deps: CheckerDeps, s: CheckSettings, items: PassItem<CompetitorForCheck>[], trigger: 'schedule' | 'manual',
  spent: () => { todayUsd: number; monthUsd: number; priorAvgUsd: number | null }): Promise<RunReport> {
  const { runId, report } = await startRun(deps, trigger)
  for (const item of items) {
    const live = deps.dryRun ? s : { ...(await deps.store.settings()), features: s.features }
    if (live.paused) { report.stoppedReason = 'paused'; break }
    const sp = spent()
    const guard = budgetStop({ spentTodayUsd: sp.todayUsd + report.spend.usd, spentMonthUsd: sp.monthUsd + report.spend.usd, runUsd: report.spend.usd,
      runChecked: report.checked + report.failed.length, priorAvgUsd: PASS_ESTIMATE_USD, caps: { dailyUsd: live.dailyCapUsd, monthlyUsd: live.monthlyCapUsd } })
    if (guard.stop) { report.stoppedReason = guard.reason; deps.log(`  stopped before ${item.row.name}: ${guard.reason}`); break }
    try { await writeItem(deps, item, await processPassItem(deps, live, item, runId), report) }
    catch (e) {
      const login = loginFailure(e)
      if (login) { report.stoppedReason = 'error'; report.error = `${login} — the pass stopped.`; await saveRun(deps, runId, report, false); break }
      report.failed.push({ name: `${item.row.name}${item.country ? ` · ${item.country}` : ''}`, error: e instanceof Error ? e.message : String(e) })
    }
    await saveRun(deps, runId, report, false)
  }
  if (report.stoppedReason === 'done' && report.checked === 0 && report.failed.length > 0) { report.stoppedReason = 'error'; report.error = `Every check in this run failed (${report.failed.length}).` }
  await saveRun(deps, runId, report, true)
  return report
}
