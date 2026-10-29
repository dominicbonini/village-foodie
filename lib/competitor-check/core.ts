// lib/competitor-check/core.ts — the checker's deterministic rules (competitor-check-1, 25 October 2026). PURE.
//   • quotes: a quote must appear in the text of a page actually fetched in the same conversation;
//   • cost: a response's usage × the prices in competitor_check_settings (data, not code), plus web searches;
//   • the budget guard: stop before a competitor that would cross the daily or monthly cap;
//   • scheduling: who is due, the daily routine quota, and spreading first check dates evenly across the interval;
//   • competitor-check-2: the deep check COUNTRY BY COUNTRY — the queue, who is in a country, and when to move on.

// ── quotes ──────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Case, whitespace, quote marks, dashes and non-breaking spaces made uniform, so a quote copied from a page matches it. */
export function normaliseForQuote(s: string): string {
  return s.normalize('NFKC')
    .replace(/[    ​]/g, ' ')
    .replace(/[“”„‟«»″〝〞]/g, '"')
    .replace(/[‘’‚‛′´`]/g, "'")
    .replace(/[‐-―−]/g, '-')
    .replace(/…/g, '...')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}
/** True when the quote, normalised, is inside one of the fetched pages' text, normalised. An empty quote never is. */
export function quoteInPages(quote: string | null | undefined, pages: readonly string[]): boolean {
  const q = quote ? normaliseForQuote(quote) : ''
  if (q.length < 3) return false
  return pages.some(p => normaliseForQuote(p).includes(q))
}

/** Every page's text the API fetched in a conversation: the `web_fetch_tool_result` blocks of every assistant turn,
 *  including those run from code execution (dynamic filtering adds a `caller`, the block is the same). PDFs arrive as
 *  base64 and are not text, so a quote from a PDF cannot be checked and counts as not found. Errors are skipped. */
export function fetchedPages(contents: readonly unknown[][]): { url: string; text: string }[] {
  const out: { url: string; text: string }[] = []
  for (const content of contents) for (const b of content as { type?: string; content?: unknown }[]) {
    if (!b || b.type !== 'web_fetch_tool_result') continue
    const r = b.content as { type?: string; url?: string; content?: { source?: { type?: string; data?: string } } } | undefined
    if (!r || r.type !== 'web_fetch_result') continue
    const src = r.content?.source
    if (src?.type === 'text' && typeof src.data === 'string') out.push({ url: String(r.url ?? ''), text: src.data })
  }
  return out
}
/** The fetch errors in a conversation, by URL ("url_not_accessible", "url_not_allowed" …) — a blocked or gone page. */
export function fetchErrors(contents: readonly unknown[][]): { toolUseId: string; code: string }[] {
  const out: { toolUseId: string; code: string }[] = []
  for (const content of contents) for (const b of content as { type?: string; tool_use_id?: string; content?: { type?: string; error_code?: string } }[]) {
    if (b?.type === 'web_fetch_tool_result' && b.content?.type === 'web_fetch_tool_result_error') out.push({ toolUseId: String(b.tool_use_id), code: String(b.content.error_code) })
  }
  return out
}

// ── cost ────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface ModelPrice { input_per_mtok: number; output_per_mtok: number; cache_write_per_mtok?: number; cache_read_per_mtok?: number }
export interface Prices { web_search_per_search: number; models: Record<string, ModelPrice>; source?: string; checked_on?: string }
export interface Usage {
  input_tokens?: number | null; output_tokens?: number | null
  cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null
  server_tool_use?: { web_search_requests?: number | null; web_fetch_requests?: number | null } | null
}
export interface Spend { inputTokens: number; outputTokens: number; webSearches: number; webFetches: number; usd: number }
export const ZERO_SPEND: Spend = { inputTokens: 0, outputTokens: 0, webSearches: 0, webFetches: 0, usd: 0 }

/** One response's cost. The model's own prices from settings; a model the settings do not price is an error (the run
 *  stops rather than spending at an unknown rate). */
export function costOf(usage: Usage | null | undefined, model: string, prices: Prices): Spend {
  const p = prices.models[model]
  if (!p) throw new Error(`No price for model "${model}" in competitor_check_settings.prices — add it before running.`)
  const u = usage ?? {}
  const n = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  const input = n(u.input_tokens), output = n(u.output_tokens), write = n(u.cache_creation_input_tokens), read = n(u.cache_read_input_tokens)
  const searches = n(u.server_tool_use?.web_search_requests), fetches = n(u.server_tool_use?.web_fetch_requests)
  const usd = (input * p.input_per_mtok + output * p.output_per_mtok + write * (p.cache_write_per_mtok ?? p.input_per_mtok)
    + read * (p.cache_read_per_mtok ?? p.input_per_mtok)) / 1e6 + searches * prices.web_search_per_search
  return { inputTokens: input + write + read, outputTokens: output, webSearches: searches, webFetches: fetches, usd }
}
export const addSpend = (a: Spend, b: Spend): Spend => ({
  inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens,
  webSearches: a.webSearches + b.webSearches, webFetches: a.webFetches + b.webFetches, usd: a.usd + b.usd,
})

// ── the budget guard ────────────────────────────────────────────────────────────────────────────────────────────────
export interface Caps { dailyUsd: number; monthlyUsd: number }
/** Before each competitor: the next one is estimated at 1.5 × this run's average so far (before the first, the average
 *  of recent runs, else nothing). Stop if that would cross the daily or the monthly cap — the daily one first. */
export function budgetStop(a: { spentTodayUsd: number; spentMonthUsd: number; runUsd: number; runChecked: number; priorAvgUsd: number | null; caps: Caps }):
  { stop: false; estimateUsd: number } | { stop: true; reason: 'daily_cap' | 'monthly_cap'; estimateUsd: number } {
  const avg = a.runChecked > 0 ? a.runUsd / a.runChecked : (a.priorAvgUsd ?? 0)
  const estimateUsd = 1.5 * avg
  if (a.spentTodayUsd + estimateUsd > a.caps.dailyUsd || a.spentTodayUsd >= a.caps.dailyUsd) return { stop: true, reason: 'daily_cap', estimateUsd }
  if (a.spentMonthUsd + estimateUsd > a.caps.monthlyUsd || a.spentMonthUsd >= a.caps.monthlyUsd) return { stop: true, reason: 'monthly_cap', estimateUsd }
  return { stop: false, estimateUsd }
}

// ── scheduling ──────────────────────────────────────────────────────────────────────────────────────────────────────
export type Lifecycle = 'active' | 'candidate' | 'closed' | 'not_relevant'
export interface SchedRow {
  id: string; name: string; lifecycle: Lifecycle; checkIntervalDays: number
  nextCheckAt: string | null; lastCheckedAt: string | null; deepCheckedAt: string | null; checkRequestedAt: string | null
  /** competitor-check-2: the countries it is in — those of its current plans, and for a candidate the ones recorded for it. */
  countries?: string[]
  /** global-players-1 (20261046): per country, when it was last deep-checked THERE — for a competitor in several countries,
   *  which the deep check reads one country at a time. */
  deepCheckedIn?: Record<string, string>
}
export const addDays = (ymd: string, n: number) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
/** A small allowance on top of the even share, so a day that fell behind (a capped or failed run) catches up. */
export const CATCH_UP_PER_DAY = 2

/** The routine quota for a day: an even share of the competitors over the interval, plus the catch-up allowance. */
export const routineQuota = (activeCount: number, intervalDays: number) => (activeCount === 0 ? 0 : Math.ceil(activeCount / intervalDays) + CATCH_UP_PER_DAY)

/** Competitors that get their FIRST check date now (active, no next_check_at): spread over the next `interval` days, each
 *  on the least-loaded day so far (existing dates count), earliest first on a tie — so 137 competitors over 90 days land
 *  1–2 a day, never 137 on one. Returns id → date. */
export function spreadFirstDates(rows: readonly SchedRow[], today: string, intervalDays: number): Map<string, string> {
  const load = new Map<number, number>()
  for (const r of rows) if (r.lifecycle === 'active' && r.nextCheckAt) {
    const off = Math.round((Date.parse(`${r.nextCheckAt}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
    if (off >= 0 && off < intervalDays) load.set(off, (load.get(off) ?? 0) + 1)
  }
  const out = new Map<string, string>()
  const fresh = rows.filter(r => r.lifecycle === 'active' && !r.nextCheckAt).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  for (const r of fresh) {
    let best = 0
    for (let d = 1; d < intervalDays; d++) if ((load.get(d) ?? 0) < (load.get(best) ?? 0)) best = d
    load.set(best, (load.get(best) ?? 0) + 1)
    out.set(r.id, addDays(today, best))
  }
  return out
}

/** Today's routine list: "Check now" requests first (any active competitor), then those due (next_check_at ≤ today),
 *  oldest due first, then least recently checked — up to the quota. Requests do not count against the quota. */
export function selectRoutine<T extends SchedRow>(rows: readonly T[], today: string, quota: number, exclude: ReadonlySet<string> = new Set()): T[] {
  const active = rows.filter(r => r.lifecycle === 'active' && !exclude.has(r.id))
  const requested = active.filter(r => r.checkRequestedAt).sort((a, b) => String(a.checkRequestedAt).localeCompare(String(b.checkRequestedAt)))
  const due = active.filter(r => !r.checkRequestedAt && r.nextCheckAt && r.nextCheckAt <= today)
    .sort((a, b) => String(a.nextCheckAt).localeCompare(String(b.nextCheckAt)) || String(a.lastCheckedAt ?? '').localeCompare(String(b.lastCheckedAt ?? '')) || a.name.localeCompare(b.name))
  return [...requested, ...due.slice(0, quota)]
}

/** The full deep check's list: active and candidate competitors not deep-checked since it was requested (never, when it
 *  was never requested — a manual deep run), "Check now" requests first, then by name — up to `limit`. */
export function selectDeep<T extends SchedRow>(rows: readonly T[], deepRequestedAt: string | null, limit: number): T[] {
  const pending = rows.filter(r => (r.lifecycle === 'active' || r.lifecycle === 'candidate')
    && (!r.deepCheckedAt || (deepRequestedAt !== null && r.deepCheckedAt < deepRequestedAt)))
  return pending.sort((a, b) => Number(!a.checkRequestedAt) - Number(!b.checkRequestedAt) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)).slice(0, Math.max(0, limit))
}
/** How many the full deep check still has to do (for the tile). */
export const deepRemaining = (rows: readonly SchedRow[], deepRequestedAt: string | null) =>
  rows.filter(r => (r.lifecycle === 'active' || r.lifecycle === 'candidate') && (!r.deepCheckedAt || (deepRequestedAt !== null && r.deepCheckedAt < deepRequestedAt))).length

/** One competitor's new schedule after a check: the next check one interval from today. A deep check of ONE country
 *  (global-players-1) also stamps that country in deep_checked_in. */
export const afterCheck = (row: Pick<SchedRow, 'checkIntervalDays' | 'deepCheckedIn'>, today: string, nowIso: string, deep: boolean, country?: string | null) => ({
  next_check_at: addDays(today, row.checkIntervalDays), last_checked_at: nowIso, check_requested_at: null,
  ...(deep ? { deep_checked_at: nowIso } : {}),
  ...(deep && country ? { deep_checked_in: { ...(row.deepCheckedIn ?? {}), [country]: nowIso } } : {}),
})

// ── competitor-check-2: the deep check, country by country ──────────────────────────────────────────────────────────
/** The countries mark in a competitor's notes: "countries: DE, AT" (20261044) or "countries: all switched-on"
 *  (global-players-1 — every switched-on country). */
export const COUNTRIES_MARK = /countries:\s*(?:all switched-on|[A-Z]{2}(?:\s*,\s*[A-Z]{2})*)/
/** The countries recorded in a competitor's notes; "all switched-on" is every code in `allCodes`. */
export function candidateCountries(notes: unknown, allCodes: readonly string[] = []): string[] {
  const m = COUNTRIES_MARK.exec(typeof notes === 'string' ? notes : '')
  if (!m) return []
  return /all switched-on/.test(m[0]) ? [...allCodes] : m[0].replace(/^countries:\s*/, '').split(',').map(c => c.trim())
}
/** A competitor's countries: its current plans' countries, plus the ones recorded in its notes while it is a candidate —
 *  or always, for a 'pos' competitor (global-players-1: compared wherever it sells) — minus the countries an accepted
 *  "not sold here" finding ruled out (not_in_countries). `allCodes`: the switched-on countries. */
export function countriesOf(lifecycle: string, planCountries: readonly string[], notes: unknown,
  more: { focus?: string | null; notIn?: readonly string[] | null; allCodes?: readonly string[] } = {}): string[] {
  const recorded = lifecycle === 'candidate' || more.focus === 'pos' ? candidateCountries(notes, more.allCodes ?? []) : []
  const out = new Set([...planCountries, ...recorded])
  for (const c of more.notIn ?? []) out.delete(c)
  return [...out]
}

export interface QueueCountry { code: string; enabled: boolean; comparisonStatus: string | null }
/** After the countries with a comparison page (admin or live), these, in this order (the brief of competitor-check-2). */
export const DEEP_QUEUE_NEXT = ['AT', 'CZ', 'PL'] as const
/** The default order: switched-on countries with a comparison page first, then AT, CZ, PL, then the other switched-on
 *  countries by how many competitors are in them (most first; ties by code). */
export function defaultDeepQueue(countries: readonly QueueCountry[], rows: readonly SchedRow[]): string[] {
  const on = countries.filter(c => c.enabled)
  const n = (code: string) => rows.filter(r => (r.lifecycle === 'active' || r.lifecycle === 'candidate') && r.countries?.includes(code)).length
  const byCount = (a: string, b: string) => n(b) - n(a) || a.localeCompare(b)
  const pages = on.filter(c => c.comparisonStatus === 'admin' || c.comparisonStatus === 'live').map(c => c.code).sort(byCount)
  const next = DEEP_QUEUE_NEXT.filter(code => on.some(c => c.code === code) && !pages.includes(code))
  const rest = on.map(c => c.code).filter(code => !pages.includes(code) && !(next as string[]).includes(code)).sort(byCount)
  return [...pages, ...next, ...rest]
}
/** The queue in force: the stored one (Settings) when there is one, else the default. */
export const deepQueueOf = (stored: readonly string[] | null | undefined, countries: readonly QueueCountry[], rows: readonly SchedRow[]) =>
  (stored && stored.length ? [...stored] : defaultDeepQueue(countries, rows))
/** The countries from `current` to the end of the queue (current first, even when it is not in the queue). */
export const queueFrom = (queue: readonly string[], current: string) => {
  const i = queue.indexOf(current)
  return i < 0 ? [current, ...queue] : queue.slice(i)
}

/** global-players-1: a competitor in several countries is checked one country at a time (lib/competitor-check/prompts.ts
 *  countryTask), so each country keeps its own date; a competitor in one country keeps using deep_checked_at. */
export const isMultiCountry = (r: Pick<SchedRow, 'countries'>) => (r.countries?.length ?? 0) > 1
/** Not yet deep-checked in `code` since the request. */
const isDeepPendingIn = (r: SchedRow, code: string, deepRequestedAt: string | null) => {
  if (r.lifecycle !== 'active' && r.lifecycle !== 'candidate') return false
  const at = isMultiCountry(r) ? r.deepCheckedIn?.[code] ?? null : r.deepCheckedAt
  return !at || (deepRequestedAt !== null && at < deepRequestedAt)
}
/** A country's deep progress: its competitors (active, or a candidate recorded for it) and how many are done since the request. */
export function deepCountryProgress(rows: readonly SchedRow[], code: string, deepRequestedAt: string | null) {
  const inCountry = rows.filter(r => (r.lifecycle === 'active' || r.lifecycle === 'candidate') && r.countries?.includes(code))
  const pending = inCountry.filter(r => isDeepPendingIn(r, code, deepRequestedAt))
  return { total: inCountry.length, done: inCountry.length - pending.length, pending }
}
/** Today's deep list, country by country: the current country's competitors not deep-checked since the request ("Check
 *  now" requests first, then by name); when they run out, the next country in the queue's — up to `limit`. */
export function selectDeepByCountry<T extends SchedRow>(rows: readonly T[], queue: readonly string[], current: string, deepRequestedAt: string | null, limit: number): T[] {
  return deepTargets(rows, queue, current, deepRequestedAt, limit).map(x => x.row)
}
/** The same list with the country each competitor was picked for (global-players-1: a competitor in several countries is
 *  then checked for THAT country only). A competitor is picked once a day, for the first country it is pending in. */
export function deepTargets<T extends SchedRow>(rows: readonly T[], queue: readonly string[], current: string, deepRequestedAt: string | null, limit: number): { row: T; country: string }[] {
  const out: { row: T; country: string }[] = []
  for (const code of queueFrom(queue, current)) {
    if (out.length >= limit) break
    const pending = (deepCountryProgress(rows, code, deepRequestedAt).pending as T[]).filter(r => !out.some(x => x.row === r))
      .sort((a, b) => Number(!a.checkRequestedAt) - Number(!b.checkRequestedAt) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    out.push(...pending.slice(0, limit - out.length).map(row => ({ row, country: code })))
  }
  return out
}
/** The country the deep check is on after a run: the first from `current` on that still has someone to check; null when
 *  the whole queue from there is done. */
export const nextDeepCountry = (rows: readonly SchedRow[], queue: readonly string[], current: string, deepRequestedAt: string | null) =>
  queueFrom(queue, current).find(code => deepCountryProgress(rows, code, deepRequestedAt).pending.length > 0) ?? null
