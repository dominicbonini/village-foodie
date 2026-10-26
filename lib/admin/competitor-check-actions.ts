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
// Every change must then be verified again before it shows publicly (the comparison pages show verified data only).
import { newPlanVersion, planProblem, type PricingStore, type ActionResult, type Stamp } from '@/lib/admin/pricing-check-actions'
import { CLASSIFICATION_EFFECT, FEATURE_FIELDS, PLAN_FIELDS, type Classification } from '@/lib/competitor-check/model'
import { minorDigits } from '@/lib/money-format'
import { overviewOf } from '@/lib/competitor-check/overview'

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
}

const FEATURE_COL: Record<string, string> = Object.fromEntries(FEATURE_FIELDS.map(f => [f, f]))
const TEXT_COL: Record<string, string> = { min_term: 'min_term', payment_methods: 'payment_methods' }
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
export async function acceptFinding(pricing: PricingStore, checks: CheckAdminStore, id: string, stamp: Stamp): Promise<ActionResult<{ finding: Row }>> {
  const f = await checks.getFinding(id)
  if (!f) return refuse(404, 'That finding is gone. Reload the page.')
  if (f.review_status !== 'pending') return refuse(409, 'That finding has already been reviewed.')
  const field = String(f.field), outcome = String(f.outcome), found = (f.found ?? {}) as Row
  const cid = String(f.competitor_id)
  const comp = await pricing.getCompetitor(cid)
  if (!comp) return refuse(404, 'That competitor is gone.')
  const isPlanField = (PLAN_FIELDS as readonly string[]).includes(field)
  const featuresTouched = { features_checked_on: stamp.today, features_verified_at: null, updated_at: stamp.at }

  if (outcome === 'unchanged') {
    // Both checks agreed nothing changed: only the date it was last checked moves on. Verification is kept.
    if (isPlanField && f.plan_id) { if (!(await checks.touchPlanChecked(String(f.plan_id), stamp.today))) return refuse(409, 'That plan has been edited since. Reload the page.') }
    else if (FEATURE_COL[field] || TEXT_COL[field]) await pricing.updateCompetitor(cid, { features_checked_on: stamp.today, updated_at: stamp.at })
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
    } else if (FEATURE_COL[field]) {
      const tri = outcome === 'not_stated' || found.feature === 'not_stated' ? 'unknown' : found.feature === 'yes' || found.feature === 'no' ? found.feature : null
      if (!tri) return refuse(400, 'This finding has no yes / no to save.')
      await pricing.updateCompetitor(cid, { [FEATURE_COL[field]]: tri, ...featuresTouched })
    } else if (TEXT_COL[field]) {
      const text = outcome === 'not_stated' ? null : typeof f.found_value === 'string' && f.found_value.trim() ? f.found_value.trim().slice(0, 300) : null
      await pricing.updateCompetitor(cid, { [TEXT_COL[field]]: text, ...featuresTouched })
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
    await pricing.insertPlan(row)
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
  } else if (outcome === 'classification') {
    const effect = CLASSIFICATION_EFFECT[found.classification as Classification]
    if (!effect) return refuse(400, 'This finding has no classification.')
    await checks.updateCompetitor(cid, { lifecycle: effect.lifecycle, focus: effect.focus })
    await pricing.updateCompetitor(cid, { features_verified_at: null, updated_at: stamp.at })
  }
  // 'blocked', and 'not_stated' on a plan field: acknowledged only — nothing to save.
  const done = await checks.reviewFinding(id, { review_status: 'accepted', reviewed_by: stamp.by, reviewed_at: stamp.at })
  return done ? { ok: true, data: { finding: done } } : refuse(409, 'That finding has already been reviewed.')
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
export function settingsCols(f: Row): { ok: true; cols: Row } | { ok: false; error: string } {
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

/** Everything the tab shows, or null while 20261043 has not run. */
export async function loadChecks(store: CheckAdminStore, today: string) {
  const settings = await store.settings()
  if (!settings) return null
  const [runs, findings, competitors] = await Promise.all([store.runs(40), store.findings(300), store.competitors()])
  return {
    settings, runs, findings, today,
    competitors: competitors.map(c => ({ id: c.id, name: c.name, lifecycle: c.lifecycle })),
    overview: overviewOf({ settings, competitors, runs, findings, today }),
  }
}

