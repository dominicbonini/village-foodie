// lib/admin/competitor-check-actions.ts — Admin › Pricing check › Automatic checks (competitor-check-1, 25 October 2026;
// docs/competitor-check-1-report.md). What reviewing the checker's findings DOES. The database is reached through two
// stores, so the route and scripts/competitor-check-1.cjs run the same code.
//
// 🔴 ACCEPTING USES THE PRICING CHECK'S OWN PATHS AND CLEARS VERIFICATION:
//   • a price, fee or card-rate change, and a plan that has gone (closed) → a NEW competitor_plans row superseding the old
//     (newPlanVersion — the history rule), unverified;
//   • a new plan → inserted, unverified;
//   • a feature, the minimum term or the payment methods → the competitor's field, with features_verified_at cleared;
//   • a new page → added to check_urls; a page gone → removed from it; a blocked page → acknowledged only;
//   • a classification → lifecycle and focus (lib/competitor-check/model.ts CLASSIFICATION_EFFECT), verification cleared —
//     a candidate is then still hidden until its features are verified (lib/pricing-check.ts isCountedCompetitor).
//   • "unchanged" (both checks agreed) → only checked_on / features_checked_on; nothing else, verification kept.
//   • global-players-1: "not sold in X" (not_in_country) → X added to not_in_countries, its current plans in X closed (new
//     versions) and its comparison entry in X removed — it drops out of X's deep check and table; "sold in X" (in_country)
//     → X taken off not_in_countries. The FIRST plan accepted in X for a 'pos' competitor, when X has a comparison page
//     (admin or live), also adds it to X's comparison_entries, unverified. A 'pos' competitor classified "POS or card
//     reader" stays (active, focus pos).
// Every change must then be verified again before it shows publicly (the comparison pages show verified data only).
import { newPlanVersion, planProblem, type PricingStore, type ActionResult, type Stamp } from '@/lib/admin/pricing-check-actions'
import { CLASSIFICATION_EFFECT, PLAN_FIELDS, type Classification } from '@/lib/competitor-check/model'
import { LEGACY_FEATURE_COLUMNS, effectiveValue, valueOut, type FeatureValue } from '@/lib/comparison-features'
import { writeAnswer } from '@/lib/admin/feature-actions'
import { minorDigits } from '@/lib/money-format'
import { overviewOf } from '@/lib/competitor-check/overview'
import { countriesOf, deepQueueOf, type QueueCountry } from '@/lib/competitor-check/core'

type Row = Record<string, unknown>
const refuse = <T>(status: number, error: string): ActionResult<T> => ({ ok: false, status, error })

export interface CheckAdminStore {
  /** Null while 20261043 has not run. */
  settings(): Promise<Row | null>
  updateSettings(cols: Row): Promise<Row>
  runs(limit: number): Promise<Row[]>
  findings(limit: number): Promise<Row[]>
  getFinding(id: string): Promise<Row | null>
  /** Sets the review on a finding that is still pending; null when it no longer is. */
  reviewFinding(id: string, cols: Row): Promise<Row | null>
  competitors(): Promise<Row[]>
  /** The admin's scheduling and lifecycle writes: check_requested_at, check_urls, check_interval_days, lifecycle, focus. */
  updateCompetitor(id: string, cols: Row): Promise<Row | null>
  setAllIntervals(days: number): Promise<void>
  /** checked_on on ONE current plan — the only in-place plan write, for an "unchanged" confirmed by both checks. */
  touchPlanChecked(id: string, date: string): Promise<boolean>
  /** competitor-check-2: every country's code, name, switch and comparison status (read only). */
  countries(): Promise<(QueueCountry & { name: string })[]>
  /** competitor-check-2: the country of every CURRENT plan, by competitor. */
  planCountries(): Promise<{ competitor_id: string; country_code: string }[]>
}
/** global-players-1: the pricing store's entry methods the Accept paths use (the comparison page's entries). */
type EntryStore = Pick<PricingStore, 'entriesReady' | 'listEntries' | 'insertEntry' | 'deleteEntry' | 'listAll'>

/** comparison-features-1: which feature a finding is about — field 'feature' names its key; a finding made before the
 *  master list (field pre_orders … min_term) maps to its key (lib/comparison-features.ts LEGACY_FEATURE_COLUMNS). */
function featureOf(f: Row): { key: string; legacyText: boolean } | null {
  if (f.field === 'feature') { const k = (f.found as Row | null)?.feature_key; return typeof k === 'string' ? { key: k, legacyText: false } : null }
  const legacy = LEGACY_FEATURE_COLUMNS[String(f.field)]
  return legacy ? { key: legacy.key, legacyText: !!legacy.text } : null
}
const toMinor = (amount: unknown, currency: string) => (typeof amount === 'number' && Number.isFinite(amount) ? Math.round(amount * 10 ** minorDigits(currency)) : null)
const toBps = (percent: unknown) => (typeof percent === 'number' && Number.isFinite(percent) ? Math.round(percent * 100) : null)

/** The plan columns a plan finding sets, from its typed `found` — never from its words. */
export function planColsOf(field: string, found: Row, currency: string): { ok: true; cols: Row } | { ok: false; error: string } {
  const cur = typeof found.currency === 'string' && /^[A-Z]{3}$/.test(found.currency) ? found.currency : currency
  switch (field) {
    case 'monthly_price': {
      const m = toMinor(found.amount, cur)
      if (m === null) return { ok: true, cols: { price_hidden: true, monthly_minor: null } }
      const yearly = found.period === 'year'
      return { ok: true, cols: { price_hidden: false, currency: cur, monthly_minor: yearly ? Math.round(m / 12) : m, yearly_only: yearly,
        ...(found.vat === 'incl' || found.vat === 'excl' || found.vat === 'unknown' ? { vat: found.vat } : {}) } }
    }
    case 'setup_fee': { const m = toMinor(found.amount, cur); return m === null ? { ok: false, error: 'This finding has no amount to save.' } : { ok: true, cols: { setup_minor: m } } }
    case 'truck_fee': return { ok: true, cols: { truck_fee_bps: toBps(found.percent) ?? 0, truck_fee_fixed_minor: toMinor(found.amount, cur) ?? 0 } }
    case 'customer_fee': return { ok: true, cols: { customer_fee_bps: toBps(found.percent) ?? 0, customer_fee_fixed_minor: toMinor(found.amount, cur) ?? 0 } }
    case 'card_rate': return { ok: true, cols: { card_bps: toBps(found.percent), card_fixed_minor: toMinor(found.amount, cur), card_rate_assumed: false } }
    default: return { ok: false, error: 'This finding has nothing to save on a plan.' }
  }
}

/** Accepts ONE pending finding. */
export async function acceptFinding(pricing: PricingStore, checks: CheckAdminStore, id: string, stamp: Stamp): Promise<ActionResult<{ finding: Row; entryAdded?: boolean }>> {
  const f = await checks.getFinding(id)
  if (!f) return refuse(404, 'That finding is gone. Reload the page.')
  if (f.review_status !== 'pending') return refuse(409, 'That finding has already been reviewed.')
  const field = String(f.field), outcome = String(f.outcome), found = (f.found ?? {}) as Row
  const cid = String(f.competitor_id)
  const comp = await pricing.getCompetitor(cid)
  if (!comp) return refuse(404, 'That competitor is gone.')
  const isPlanField = (PLAN_FIELDS as readonly string[]).includes(field)
  let entryAdded = false
  const featuresTouched = { features_checked_on: stamp.today, features_verified_at: null, updated_at: stamp.at }
  // comparison-features-1: a feature finding writes competitor_feature_values — for the country it was read in (a country
  // check), else for every country.
  const feat = featureOf(f)
  const featCountry = f.field === 'feature' && typeof f.country_code === 'string' && /^[A-Z]{2}$/.test(f.country_code) ? f.country_code : null

  if (outcome === 'unchanged') {
    // Both checks agreed nothing changed: only the date it was last checked moves on. Verification is kept.
    if (isPlanField && f.plan_id) { if (!(await checks.touchPlanChecked(String(f.plan_id), stamp.today))) return refuse(409, 'That plan has been edited since. Reload the page.') }
    else if (feat) {
      const cur = pricing.featureValues ? effectiveValue((await pricing.featureValues()).map(valueOut), cid, feat.key, featCountry) : null
      if (cur && pricing.touchFeatureValueChecked) await pricing.touchFeatureValueChecked(cur.id, stamp.today)
      await pricing.updateCompetitor(cid, { features_checked_on: stamp.today, updated_at: stamp.at })
    }
  } else if (outcome === 'changed' || (outcome === 'not_stated' && !isPlanField)) {
    if (isPlanField) {
      if (!f.plan_id) return refuse(409, 'This finding names no stored plan. Add the plan by hand (+ Add competitor) or reject it.')
      const old = await pricing.getPlan(String(f.plan_id))
      if (!old) return refuse(404, 'That plan is gone.')
      if (old.superseded_at != null) return refuse(409, 'That plan has been edited since this finding was made. Reject it, or check the plan by hand.')
      const c = planColsOf(field, found, String(old.currency))
      if (!c.ok) return refuse(400, c.error)
      const v = await newPlanVersion(pricing, old, { ...c.cols, source_url: f.source_url ?? old.source_url }, stamp)
      if (!v.ok) return v
    } else if (feat) {
      // The answer: the finding's value (an old finding's not_stated is unknown), its note as advertised (an old text
      // finding's text), its quote and page — a new row, unverified; the competitor's features stamp cleared.
      const text = typeof f.found_value === 'string' && f.found_value.trim() ? f.found_value.trim() : null
      const value: FeatureValue | null = outcome === 'not_stated' ? 'unknown' : feat.legacyText ? 'unknown'
        : found.feature === 'not_stated' ? 'unknown' : (['yes', 'no', 'partial', 'unknown'] as const).find(v => v === found.feature) ?? null
      if (!value) return refuse(400, 'This finding has no answer (yes / no / partly / not stated) to save.')
      const note = outcome === 'not_stated' ? null : feat.legacyText ? text : typeof found.note === 'string' && found.note.trim() ? found.note.trim() : null
      const w = await writeAnswer(pricing, { competitorId: cid, key: feat.key, countryCode: featCountry, value, note,
        quote: typeof f.quote === 'string' ? f.quote : null, sourceUrl: typeof f.source_url === 'string' ? f.source_url : null }, stamp)
      if (!w.ok) return w
      await pricing.updateCompetitor(cid, featuresTouched)
    } else return refuse(400, 'This finding has nothing to save.')
  } else if (outcome === 'new_plan') {
    const code = typeof f.country_code === 'string' && /^[A-Z]{2}$/.test(f.country_code) ? f.country_code : null
    const name = typeof found.plan_name === 'string' && found.plan_name.trim() ? found.plan_name.trim() : null
    const cur = typeof found.currency === 'string' && /^[A-Z]{3}$/.test(found.currency) ? found.currency : null
    if (!code || !name || !cur) return refuse(400, 'A new plan needs its country, name and currency — add it by hand (+ Add competitor) or reject this.')
    const price = planColsOf('monthly_price', found, cur)
    const row: Row = {
      competitor_id: cid, country_code: code, plan_name: name, currency: cur, price_hidden: false, monthly_minor: null, yearly_only: false, setup_minor: 0,
      truck_fee_bps: 0, truck_fee_fixed_minor: 0, customer_fee_bps: 0, customer_fee_fixed_minor: 0, card_mode: 'unknown', card_bps: null, card_fixed_minor: null,
      card_rate_assumed: true, order_cap: null, included_orders: null, overage_fixed_minor: null, vat: 'unknown', status: 'counted', unclear: false,
      second_hand: false, notes: `Added from an automatic check (${stamp.today}).`, ...(price.ok ? price.cols : {}),
      source: 'admin', source_url: f.source_url ?? null, checked_on: stamp.today,
    }
    const p = planProblem(row); if (p) return refuse(400, `${p} Add it by hand instead, or reject this.`)
    // global-players-1: a 'pos' competitor's FIRST plan in a country with a comparison page joins that page, unverified.
    const isPos = comp.focus === 'pos'
    const hadPlanHere = isPos && (await pricing.listAll()).plans.some(x => x.competitor_id === cid && x.country_code === code && x.superseded_at == null)
    const inserted = await pricing.insertPlan(row)
    if (isPos && !hadPlanHere) entryAdded = await addPosEntry(pricing, checks, cid, code, String(inserted.id))
  } else if (outcome === 'plan_gone') {
    if (!f.plan_id) return refuse(409, 'This finding names no stored plan.')
    const old = await pricing.getPlan(String(f.plan_id))
    if (!old) return refuse(404, 'That plan is gone.')
    const v = await newPlanVersion(pricing, old, { status: 'closed' }, stamp)
    if (!v.ok) return v
  } else if (outcome === 'new_url' || outcome === 'page_gone') {
    const urls = Array.isArray(comp.check_urls) ? (comp.check_urls as string[]) : []
    const url = String((outcome === 'new_url' ? found.url : f.source_url ?? found.url) ?? '')
    if (!url) return refuse(400, 'This finding has no URL.')
    const next = outcome === 'new_url' ? [...new Set([...urls, url])] : urls.filter(u => u !== url)
    await checks.updateCompetitor(cid, { check_urls: next })
  } else if (outcome === 'not_in_country' || outcome === 'in_country') {
    const code = typeof f.country_code === 'string' && /^[A-Z]{2}$/.test(f.country_code) ? f.country_code : null
    if (!code) return refuse(400, 'This finding names no country.')
    const row = (await checks.competitors()).find(c => c.id === cid)
    const notIn = Array.isArray(row?.not_in_countries) ? (row!.not_in_countries as string[]) : []
    if (outcome === 'in_country') { if (notIn.includes(code)) await checks.updateCompetitor(cid, { not_in_countries: notIn.filter(c => c !== code) }) }
    else {
      if (!row || !('not_in_countries' in row)) return refuse(503, 'Run supabase/migrations/20261046_global_players_1.sql first — it records where a competitor does not sell.')
      await checks.updateCompetitor(cid, { not_in_countries: [...new Set([...notIn, code])].sort() })
      // No plans in X any more (each closed as a new version — the history rule), and off X's comparison page.
      for (const p of (await pricing.listAll()).plans.filter(x => x.competitor_id === cid && x.country_code === code && x.superseded_at == null && x.status !== 'closed')) {
        const v = await newPlanVersion(pricing, p, { status: 'closed' }, stamp)
        if (!v.ok) return v
      }
      if (await pricing.entriesReady()) for (const e of (await pricing.listEntries()).filter(e => e.competitor_id === cid && e.country_code === code)) await pricing.deleteEntry(String(e.id))
    }
  } else if (outcome === 'classification') {
    const posKept = comp.focus === 'pos' && found.classification === 'pos_or_card_reader'
    const effect = posKept ? { lifecycle: 'active' as const, focus: 'pos' } : CLASSIFICATION_EFFECT[found.classification as Classification]
    if (!effect) return refuse(400, 'This finding has no classification.')
    await checks.updateCompetitor(cid, { lifecycle: effect.lifecycle, focus: effect.focus })
    await pricing.updateCompetitor(cid, { features_verified_at: null, updated_at: stamp.at })
  }
  // 'blocked', and 'not_stated' on a plan field: acknowledged only — nothing to save.
  const done = await checks.reviewFinding(id, { review_status: 'accepted', reviewed_by: stamp.by, reviewed_at: stamp.at })
  return done ? { ok: true, data: { finding: done, ...(entryAdded ? { entryAdded } : {}) } } : refuse(409, 'That finding has already been reviewed.')
}

/** global-players-1: adds a 'pos' competitor to country `code`'s comparison page — only when the country has one (admin or
 *  live) and the competitor is not on it yet — unverified, last in the order, showing `planId`. True when it was added. */
async function addPosEntry(pricing: EntryStore, checks: CheckAdminStore, cid: string, code: string, planId: string): Promise<boolean> {
  const country = (await checks.countries()).find(c => c.code === code)
  if (!country || (country.comparisonStatus !== 'admin' && country.comparisonStatus !== 'live')) return false
  if (!(await pricing.entriesReady())) return false
  const list = (await pricing.listEntries()).filter(e => e.country_code === code)
  if (list.some(e => e.competitor_id === cid)) return false
  await pricing.insertEntry({ country_code: code, competitor_id: cid, primary_plan_id: planId, choose_when: null,
    sort_order: list.reduce((m, e) => Math.max(m, Number(e.sort_order) || 0), 0) + 1, verified_at: null, verified_by: null })
  return true
}

export async function rejectFinding(checks: CheckAdminStore, id: string, stamp: Stamp): Promise<ActionResult<{ finding: Row }>> {
  const done = await checks.reviewFinding(id, { review_status: 'rejected', reviewed_by: stamp.by, reviewed_at: stamp.at })
  return done ? { ok: true, data: { finding: done } } : refuse(409, 'That finding is gone or already reviewed. Reload the page.')
}

/** "N confirmed unchanged by both checks": pending, unchanged, quote found in the page, second check confirmed. */
export const isConfirmedUnchanged = (f: Row) => f.review_status === 'pending' && f.outcome === 'unchanged' && f.quote_in_page === true && f.second_check === 'confirmed'

/** "Review and accept all": accepts every confirmed-unchanged finding (dates only). Refused ones are reported, not fatal. */
export async function acceptAllUnchanged(pricing: PricingStore, checks: CheckAdminStore, ids: string[], stamp: Stamp): Promise<ActionResult<{ accepted: number; refused: number }>> {
  let accepted = 0, refused = 0
  for (const id of ids) {
    const f = await checks.getFinding(id)
    if (!f || !isConfirmedUnchanged(f)) { refused++; continue }
    const r = await acceptFinding(pricing, checks, id, stamp)
    if (r.ok) accepted++; else refused++
  }
  return { ok: true, data: { accepted, refused } }
}

// ── settings ────────────────────────────────────────────────────────────────────────────────────────────────────────
const MODEL_ID = /^claude-[a-z0-9-]{2,60}$/
/** Validates the Settings form. Prices must name a price for each chosen model. */
export function settingsCols(f: Row, enabledCodes?: readonly string[]): { ok: true; cols: Row } | { ok: false; error: string } {
  const cols: Row = {}
  const num = (k: string, min: number, max: number, label: string) => {
    if (!(k in f)) return true
    const v = f[k]
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) return `${label} must be a number from ${min} to ${max}.`
    cols[k] = v; return true
  }
  for (const [k, min, max, label] of [['daily_cap_usd', 0, 500, 'Daily cap'], ['monthly_cap_usd', 0, 5000, 'Monthly cap'], ['deep_per_day', 0, 200, 'Deep checks per day'], ['check_interval_days', 7, 365, 'Interval']] as const) {
    const r = num(k, min, max, label); if (r !== true) return { ok: false, error: r }
  }
  if ('deep_per_day' in cols && !Number.isInteger(cols.deep_per_day)) return { ok: false, error: 'Deep checks per day must be a whole number.' }
  if ('check_interval_days' in cols && !Number.isInteger(cols.check_interval_days)) return { ok: false, error: 'The interval must be a whole number of days.' }
  // competitor-check-2: the deep check's country order — two-letter codes, each once; [] = the default order. When the
  // switched-on countries are given, every code must be one of them.
  if ('deep_queue' in f) {
    const q = f.deep_queue
    if (!Array.isArray(q) || q.length > 80 || !q.every(c => typeof c === 'string' && /^[A-Z]{2}$/.test(c)) || new Set(q).size !== q.length)
      return { ok: false, error: 'The deep check order must be country codes such as DE, AT, CZ — each once.' }
    const unknown = enabledCodes ? (q as string[]).filter(c => !enabledCodes.includes(c)) : []
    if (unknown.length) return { ok: false, error: `Not a switched-on country: ${unknown.join(', ')}.` }
    cols.deep_queue = q
  }
  if ('paused' in f) { if (typeof f.paused !== 'boolean') return { ok: false, error: 'Paused must be yes or no.' }; cols.paused = f.paused }
  for (const k of ['extractor_model', 'verifier_model']) if (k in f) { if (typeof f[k] !== 'string' || !MODEL_ID.test(f[k] as string)) return { ok: false, error: 'A model must be a Claude model id, e.g. claude-sonnet-5-5.' }; cols[k] = f[k] }
  if ('prices' in f) {
    const p = f.prices as Row
    const ok = p && typeof p === 'object' && typeof p.web_search_per_search === 'number' && p.web_search_per_search >= 0 && p.models && typeof p.models === 'object'
      && Object.values(p.models as Row).every(m => m && typeof m === 'object' && ['input_per_mtok', 'output_per_mtok'].every(k => typeof (m as Row)[k] === 'number' && ((m as Row)[k] as number) >= 0))
    if (!ok) return { ok: false, error: 'Prices: each model needs input and output per million tokens, and a price per web search.' }
    cols.prices = p
  }
  const models = (cols.prices ?? null) as Row | null
  for (const k of ['extractor_model', 'verifier_model']) if (cols[k] && models && !(models.models as Row)[cols[k] as string]) return { ok: false, error: `Add a price for ${cols[k]} before choosing it.` }
  if (!Object.keys(cols).length) return { ok: false, error: 'Nothing to save.' }
  return { ok: true, cols }
}

/** competitor-check-2: every competitor row with its countries (current plans' countries; a candidate's recorded ones). */
async function withCountries(store: CheckAdminStore): Promise<Row[]> {
  const [competitors, plans, countries] = await Promise.all([store.competitors(), store.planCountries(), store.countries()])
  const allCodes = countries.filter(c => c.enabled).map(c => c.code)
  return competitors.map(c => ({ ...c, countries: countriesOf(String(c.lifecycle ?? 'active'), plans.filter(p => p.competitor_id === c.id).map(p => p.country_code), c.notes,
    { focus: (c.focus as string | null) ?? null, notIn: Array.isArray(c.not_in_countries) ? c.not_in_countries as string[] : [], allCodes }) }))
}

/** Everything the tab shows, or null while 20261043 has not run. */
export async function loadChecks(store: CheckAdminStore, today: string) {
  const settings = await store.settings()
  if (!settings) return null
  const [runs, findings, competitors, countries] = await Promise.all([store.runs(40), store.findings(300), withCountries(store), store.countries()])
  return {
    settings, runs, findings, today,
    competitors: competitors.map(c => ({ id: c.id, name: c.name, lifecycle: c.lifecycle })),
    // competitor-check-2: the Deep check picker's countries — every switched-on one, and whether it has a comparison page.
    countries: countries.filter(c => c.enabled).map(c => ({ code: c.code, name: c.name, comparisonPage: c.comparisonStatus === 'admin' || c.comparisonStatus === 'live' }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    overview: overviewOf({ settings, competitors, runs, findings, today, countries }),
  }
}

/** competitor-check-2: "Start deep check" — one switched-on country (it starts there and goes on through the queue), or
 *  'ALL' (the first country of the queue in force). Sets deep_requested_at (every competitor is due again) and deep_country. */
export async function startDeep(store: CheckAdminStore, choice: unknown, stamp: Stamp): Promise<ActionResult<{ settings: Row }>> {
  const settings = await store.settings()
  if (!settings) return refuse(503, 'Run supabase/migrations/20261043_competitor_check_1.sql first.')
  if (!('deep_country' in settings)) return refuse(503, 'Run supabase/migrations/20261045_competitor_check_2.sql first — it adds the deep check\u2019s country.')
  const countries = await store.countries()
  const on = countries.filter(c => c.enabled).map(c => c.code)
  let code: string | null = null
  if (choice === 'ALL') {
    const comps = await withCountries(store)
    const rows = comps.map(c => ({ id: String(c.id), name: String(c.name), lifecycle: c.lifecycle as 'active', checkIntervalDays: 90, nextCheckAt: null, lastCheckedAt: null, deepCheckedAt: null, checkRequestedAt: null, countries: c.countries as string[] }))
    code = deepQueueOf(Array.isArray(settings.deep_queue) ? settings.deep_queue as string[] : [], countries, rows).find(c => on.includes(c)) ?? null
    if (!code) return refuse(409, 'No switched-on country to start with.')
  } else if (typeof choice === 'string' && on.includes(choice)) code = choice
  else return refuse(400, 'Pick a switched-on country, or All countries.')
  const saved = await store.updateSettings({ deep_requested_at: stamp.at, deep_country: code, updated_at: stamp.at, updated_by: stamp.by })
  return { ok: true, data: { settings: saved } }
}

