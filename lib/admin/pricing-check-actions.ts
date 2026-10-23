// lib/admin/pricing-check-actions.ts — what the admin Pricing check route DOES (pricing-check-1, 23 October 2026).
//
// The database is reached only through a PricingStore, so the SAME code runs in the route (against the service-role
// store in lib/admin/pricing-check-store.ts) and in scripts/pricing-check-1.cjs (against an in-memory one). Every rule
// is checked here, with the plain sentence the page shows, before any write; the database CHECKs stay behind them.
//
// 🔴 THE HISTORY RULE: a competitor's price is never edited in place. edit_plan INSERTS a new row (the old row's values
// with the edited fields on top, source 'admin', unverified) and stamps superseded_at on the old one. A country's
// benchmark the same, with at most one current row per country. Mark verified / Undo verified, and a key-feature cell,
// are the only in-place writes.
// 🔴 FIELD ALLOWLISTS: each action names the fields it accepts; anything else is refused, not ignored. This file is the
// ONE place the page's field names meet column names, so no column name ships to a browser.

import type { Benchmark, Competitor, CompetitorPlan } from '@/lib/pricing-check'

type Row = Record<string, unknown>
export interface PricingStore {
  counts(): Promise<{ competitors: number; plans: number; benchmarks: number; research: number }>
  listAll(): Promise<{ competitors: Row[]; plans: Row[]; benchmarks: Row[] }>
  insertMany(table: 'competitors' | 'plans' | 'benchmarks', rows: Row[]): Promise<number>
  getPlan(id: string): Promise<Row | null>
  insertPlan(row: Row): Promise<Row>
  /** Stamp superseded_at on ONE row, only while it is still current. False when it no longer is. */
  supersedePlan(id: string, at: string): Promise<boolean>
  deletePlan(id: string): Promise<void>
  /** Set (or clear) verified_at / verified_by on a CURRENT row. Null when the row is not current. */
  setPlanVerified(id: string, at: string | null, by: string | null): Promise<Row | null>
  getCompetitor(id: string): Promise<Row | null>
  findCompetitorByName(name: string): Promise<Row | null>
  insertCompetitor(row: Row): Promise<Row>
  updateCompetitor(id: string, cols: Row): Promise<Row | null>
  currentBenchmark(code: string): Promise<Row | null>
  supersedeBenchmark(id: string, at: string): Promise<boolean>
  unsupersedeBenchmark(id: string): Promise<void>
  insertBenchmark(row: Row): Promise<Row>
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string }
const refuse = <T>(status: number, error: string): ActionResult<T> => ({ ok: false, status, error })
export interface Stamp { by: string; at: string; today: string }

// ── columns ↔ fields ────────────────────────────────────────────────────────────────────────────────────────────────
type Kind = 'text' | 'textOrNull' | 'url' | 'bool' | 'boolOrNull' | 'int0' | 'int0OrNull' | 'int1OrNull' | 'num' | 'date' | 'currency' | 'country'
  | { oneOf: readonly string[]; nullable?: boolean }
interface Def { col: string; kind: Kind }
const TRI = ['yes', 'no', 'unknown'] as const

const COMPETITOR: Record<keyof Competitor, Def> = {
  id: { col: 'id', kind: 'text' }, name: { col: 'name', kind: 'text' }, website: { col: 'website', kind: 'url' },
  focus: { col: 'focus', kind: { oneOf: ['food_truck', 'street_food_markets', 'nearest_local', 'pop_up'], nullable: true } },
  paymentProviders: { col: 'payment_providers', kind: 'textOrNull' },
  preOrders: { col: 'pre_orders', kind: { oneOf: TRI } }, whatsapp: { col: 'whatsapp', kind: { oneOf: TRI } },
  socialPosts: { col: 'social_posts', kind: { oneOf: TRI } }, ownDomain: { col: 'own_domain', kind: { oneOf: TRI } },
  iosApp: { col: 'ios_app', kind: { oneOf: TRI } }, androidApp: { col: 'android_app', kind: { oneOf: TRI } },
  featuresCheckedOn: { col: 'features_checked_on', kind: 'date' }, featuresVerifiedAt: { col: 'features_verified_at', kind: 'textOrNull' },
  notes: { col: 'notes', kind: 'textOrNull' },
}
const PLAN: Record<keyof CompetitorPlan, Def> = {
  id: { col: 'id', kind: 'text' }, competitorId: { col: 'competitor_id', kind: 'text' },
  countryCode: { col: 'country_code', kind: 'country' }, planName: { col: 'plan_name', kind: 'text' },
  currency: { col: 'currency', kind: 'currency' }, priceHidden: { col: 'price_hidden', kind: 'bool' },
  monthlyMinor: { col: 'monthly_minor', kind: 'int0OrNull' }, yearlyOnly: { col: 'yearly_only', kind: 'bool' },
  setupMinor: { col: 'setup_minor', kind: 'int0' },
  truckFeeBps: { col: 'truck_fee_bps', kind: 'int0' }, truckFeeFixedMinor: { col: 'truck_fee_fixed_minor', kind: 'int0' },
  customerFeeBps: { col: 'customer_fee_bps', kind: 'int0' }, customerFeeFixedMinor: { col: 'customer_fee_fixed_minor', kind: 'int0' },
  cardMode: { col: 'card_mode', kind: { oneOf: ['bundled', 'separate', 'unknown'] } },
  cardBps: { col: 'card_bps', kind: 'int0OrNull' }, cardFixedMinor: { col: 'card_fixed_minor', kind: 'int0OrNull' },
  cardRateAssumed: { col: 'card_rate_assumed', kind: 'bool' },
  orderCap: { col: 'order_cap', kind: 'int1OrNull' }, includedOrders: { col: 'included_orders', kind: 'int0OrNull' },
  overageFixedMinor: { col: 'overage_fixed_minor', kind: 'int0OrNull' },
  vat: { col: 'vat', kind: { oneOf: ['incl', 'excl', 'unknown'] } },
  status: { col: 'status', kind: { oneOf: ['counted', 'hidden', 'closed', 'excluded'] } },
  unclear: { col: 'unclear', kind: 'bool' }, secondHand: { col: 'second_hand', kind: 'bool' },
  source: { col: 'source', kind: { oneOf: ['research', 'manual', 'admin'] } }, sourceUrl: { col: 'source_url', kind: 'url' },
  checkedOn: { col: 'checked_on', kind: 'date' }, verifiedAt: { col: 'verified_at', kind: 'textOrNull' }, verifiedBy: { col: 'verified_by', kind: 'textOrNull' },
  notes: { col: 'notes', kind: 'textOrNull' }, supersededAt: { col: 'superseded_at', kind: 'textOrNull' }, createdAt: { col: 'created_at', kind: 'textOrNull' },
}
const BENCH: Record<keyof Benchmark, Def> = {
  id: { col: 'id', kind: 'text' }, countryCode: { col: 'country_code', kind: 'country' }, currency: { col: 'currency', kind: 'currency' },
  mealMinor: { col: 'meal_minor', kind: 'int0' }, mealSourceLabel: { col: 'meal_source_label', kind: 'textOrNull' },
  mealSourceUrl: { col: 'meal_source_url', kind: 'url' }, mealSourceOk: { col: 'meal_source_ok', kind: 'bool' },
  orderMultiplier: { col: 'order_multiplier', kind: 'num' }, eurRate: { col: 'eur_rate', kind: 'num' }, eurRateDate: { col: 'eur_rate_date', kind: 'date' },
  cardBps: { col: 'card_bps', kind: 'int0OrNull' }, cardFixedMinor: { col: 'card_fixed_minor', kind: 'int0OrNull' },
  plannedProMinor: { col: 'planned_pro_minor', kind: 'int0OrNull' }, plannedProIncludedMinor: { col: 'planned_pro_included_minor', kind: 'int0OrNull' },
  plannedUnlimitedMinor: { col: 'planned_unlimited_minor', kind: 'int0OrNull' },
  iosAppAvailable: { col: 'ios_app_available', kind: 'boolOrNull' }, androidAppAvailable: { col: 'android_app_available', kind: 'boolOrNull' },
  notes: { col: 'notes', kind: 'textOrNull' }, checkedOn: { col: 'checked_on', kind: 'date' },
  supersededAt: { col: 'superseded_at', kind: 'textOrNull' }, createdAt: { col: 'created_at', kind: 'textOrNull' },
}

/** What an admin may change on a plan (Edit / Add competitor). Ids, source, verification and history are not here. */
const PLAN_EDITABLE = ['planName', 'currency', 'priceHidden', 'monthlyMinor', 'yearlyOnly', 'setupMinor', 'truckFeeBps', 'truckFeeFixedMinor',
  'customerFeeBps', 'customerFeeFixedMinor', 'cardMode', 'cardBps', 'cardFixedMinor', 'cardRateAssumed', 'orderCap', 'includedOrders',
  'overageFixedMinor', 'vat', 'status', 'unclear', 'secondHand', 'sourceUrl', 'checkedOn', 'notes'] as const
/** What "Edit country data" may change (currency only when the country has no benchmark yet). */
const BENCH_EDITABLE = ['mealMinor', 'mealSourceLabel', 'mealSourceUrl', 'mealSourceOk', 'orderMultiplier', 'eurRate', 'eurRateDate', 'cardBps',
  'cardFixedMinor', 'plannedProMinor', 'plannedProIncludedMinor', 'plannedUnlimitedMinor', 'iosAppAvailable', 'androidAppAvailable', 'notes', 'checkedOn'] as const
const COMPETITOR_NEW = ['name', 'website', 'focus', 'paymentProviders', 'notes'] as const
const FEATURE_COLS: Record<string, string> = { preOrders: 'pre_orders', whatsapp: 'whatsapp', socialPosts: 'social_posts', ownDomain: 'own_domain', iosApp: 'ios_app', androidApp: 'android_app' }

const LABEL: Record<string, string> = {
  planName: 'Plan name', currency: 'Currency', monthlyMinor: 'Monthly price', setupMinor: 'Setup fee', truckFeeBps: 'Fee the truck pays (%)',
  truckFeeFixedMinor: 'Fixed fee the truck pays', customerFeeBps: 'Fee customers pay (%)', customerFeeFixedMinor: 'Fixed fee customers pay',
  cardMode: 'Card processing', cardBps: 'Card rate (%)', cardFixedMinor: 'Card fixed part', orderCap: 'Order cap', includedOrders: 'Orders included',
  overageFixedMinor: 'Price per extra order', vat: 'VAT', status: 'Counted', sourceUrl: 'Pricing page', checkedOn: 'Checked on', mealMinor: 'Meal price',
  mealSourceUrl: 'Meal price source', orderMultiplier: 'Order size', eurRate: 'Exchange rate', eurRateDate: 'Rate date', name: 'Name', website: 'Website', focus: 'Built for',
}

/** One value checked against its kind. Returns the stored value, or an error sentence. */
function check(field: string, kind: Kind, v: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  const label = LABEL[field] ?? field
  const isInt = (x: unknown) => typeof x === 'number' && Number.isInteger(x)
  if (typeof kind === 'object') {
    if (v === null && kind.nullable) return { ok: true, value: null }
    return typeof v === 'string' && kind.oneOf.includes(v) ? { ok: true, value: v } : { ok: false, error: `${label}: choose one of the options.` }
  }
  switch (kind) {
    case 'text': return typeof v === 'string' && v.trim() ? { ok: true, value: v.trim() } : { ok: false, error: `${label} can’t be empty.` }
    case 'textOrNull': return v === null || v === '' ? { ok: true, value: null } : typeof v === 'string' ? { ok: true, value: v.trim() } : { ok: false, error: `${label} must be text.` }
    case 'url': {
      if (v === null || v === '') return { ok: true, value: null }
      if (typeof v !== 'string') return { ok: false, error: `${label} must be a web address.` }
      try { const u = new URL(v.trim()); return u.protocol === 'https:' || u.protocol === 'http:' ? { ok: true, value: u.toString() } : { ok: false, error: `${label} must start with https://.` } }
      catch { return { ok: false, error: `${label} must be a web address.` } }
    }
    case 'bool': return typeof v === 'boolean' ? { ok: true, value: v } : { ok: false, error: `${label} must be yes or no.` }
    case 'boolOrNull': return v === null || typeof v === 'boolean' ? { ok: true, value: v } : { ok: false, error: `${label} must be yes, no or not known.` }
    case 'int0': return isInt(v) && (v as number) >= 0 ? { ok: true, value: v } : { ok: false, error: `${label} must be a whole number, 0 or more.` }
    case 'int0OrNull': return v === null || (isInt(v) && (v as number) >= 0) ? { ok: true, value: v } : { ok: false, error: `${label} must be a whole number, 0 or more, or empty.` }
    case 'int1OrNull': return v === null || (isInt(v) && (v as number) >= 1) ? { ok: true, value: v } : { ok: false, error: `${label} must be 1 or more, or empty.` }
    case 'num': return typeof v === 'number' && Number.isFinite(v) && v > 0 ? { ok: true, value: v } : { ok: false, error: `${label} must be a number above 0.` }
    case 'date': return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? { ok: true, value: v } : { ok: false, error: `${label} must be a date.` }
    case 'currency': return typeof v === 'string' && /^[A-Z]{3}$/.test(v.trim().toUpperCase()) ? { ok: true, value: v.trim().toUpperCase() } : { ok: false, error: `${label} must be a three-letter code, e.g. GBP.` }
    case 'country': return typeof v === 'string' && /^[A-Z]{2}$/.test(v.trim().toUpperCase()) ? { ok: true, value: v.trim().toUpperCase() } : { ok: false, error: 'Country must be a two-letter code.' }
  }
}

/** Fields → columns, refusing any field not on the allowlist. */
function toColumns<T extends string>(fields: unknown, allowed: readonly T[], defs: Record<string, Def>): { ok: true; cols: Row } | { ok: false; error: string } {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return { ok: false, error: 'Nothing to save.' }
  const cols: Row = {}
  for (const [k, v] of Object.entries(fields as Row)) {
    if (!(allowed as readonly string[]).includes(k)) return { ok: false, error: `“${k}” can’t be changed here.` }
    const r = check(k, defs[k].kind, v)
    if (!r.ok) return r
    cols[defs[k].col] = r.value
  }
  return { ok: true, cols }
}

const mapOut = <T>(row: Row, defs: Record<string, Def>): T => {
  const o: Row = {}
  for (const [f, d] of Object.entries(defs)) {
    let v = row[d.col] ?? null
    if ((d.kind === 'num') && typeof v === 'string') v = Number(v)   // numeric columns arrive as strings
    o[f] = v
  }
  return o as T
}
export const competitorOut = (r: Row) => mapOut<Competitor>(r, COMPETITOR)
export const planOut = (r: Row) => mapOut<CompetitorPlan>(r, PLAN)
export const benchmarkOut = (r: Row) => mapOut<Benchmark>(r, BENCH)
/** The columns each table is read with (the store selects exactly these). */
export const COLUMNS = {
  competitors: [...Object.values(COMPETITOR).map(d => d.col), 'updated_at'].join(', '),
  plans: Object.values(PLAN).map(d => d.col).join(', '),
  benchmarks: Object.values(BENCH).map(d => d.col).join(', '),
}

/** A plan row must still make sense as a whole: a counted plan has a price. */
function planProblem(cols: Row): string | null {
  if (cols.status === 'counted' && cols.monthly_minor === null) return 'A counted plan needs a monthly price (or set it to “Price hidden”).'
  if (cols.price_hidden === true && cols.status === 'counted') return 'A hidden price can’t be counted — set Counted to “Price hidden”.'
  return null
}

// ── reads ───────────────────────────────────────────────────────────────────────────────────────────────────────────
export async function loadState(store: PricingStore): Promise<ActionResult<{
  empty: boolean; importable: boolean; competitors: Competitor[]; plans: CompetitorPlan[]; benchmarks: Benchmark[]
}>> {
  const counts = await store.counts()
  const empty = counts.competitors === 0 && counts.plans === 0 && counts.benchmarks === 0
  const all = await store.listAll()
  return { ok: true, data: {
    empty, importable: empty && counts.research === 0,
    competitors: all.competitors.map(competitorOut), plans: all.plans.map(planOut), benchmarks: all.benchmarks.map(benchmarkOut),
  } }
}

// ── the one-time import ─────────────────────────────────────────────────────────────────────────────────────────────
export interface ResearchPayload { competitors: Row[]; plans: Row[]; benchmarks: Row[] }

/** Inserts data/pricing-research-1/*.json. Refused once ANY research row exists, or while any table has rows. */
export async function importResearch(store: PricingStore, payload: ResearchPayload): Promise<ActionResult<{ competitors: number; plans: number; benchmarks: number }>> {
  const counts = await store.counts()
  if (counts.research > 0) return refuse(409, 'The research data has already been imported. Nothing was changed.')
  if (counts.competitors || counts.plans || counts.benchmarks) return refuse(409, 'The tables already hold rows, so the research import is switched off. Nothing was changed.')
  if (!Array.isArray(payload.competitors) || !Array.isArray(payload.plans) || !Array.isArray(payload.benchmarks) || !payload.plans.every(p => p.source === 'research' || p.source === 'manual'))
    return refuse(500, 'The research files are not in the expected shape. Nothing was changed.')
  const c = await store.insertMany('competitors', payload.competitors)
  const b = await store.insertMany('benchmarks', payload.benchmarks)
  const p = await store.insertMany('plans', payload.plans)
  return { ok: true, data: { competitors: c, plans: p, benchmarks: b } }
}

// ── the writes ──────────────────────────────────────────────────────────────────────────────────────────────────────
export async function act(store: PricingStore, body: Row, stamp: Stamp): Promise<ActionResult<Row>> {
  const id = typeof body.id === 'string' ? body.id : null
  switch (body.action) {
    case 'verify':
    case 'unverify': {
      if (!id) return refuse(400, 'Which plan?')
      const on = body.action === 'verify'
      const r = await store.setPlanVerified(id, on ? stamp.at : null, on ? stamp.by : null)
      return r ? { ok: true, data: { plan: planOut(r) } } : refuse(409, 'That plan has been edited since this page loaded. Reload to see it.')
    }
    case 'edit_plan': {
      if (!id) return refuse(400, 'Which plan?')
      const old = await store.getPlan(id)
      if (!old) return refuse(404, 'That plan is gone. Reload the page.')
      if (old.superseded_at !== null) return refuse(409, 'That plan has been edited since this page loaded. Reload to see it.')
      const r = toColumns(body.fields, PLAN_EDITABLE, PLAN as Record<string, Def>)
      if (!r.ok) return refuse(400, r.error)
      const next: Row = {}
      for (const d of Object.values(PLAN)) if (!['id', 'superseded_at', 'verified_at', 'verified_by', 'created_at'].includes(d.col)) next[d.col] = old[d.col] ?? null
      Object.assign(next, r.cols, { source: 'admin', checked_on: r.cols.checked_on ?? stamp.today })
      if ('card_bps' in r.cols && !('card_rate_assumed' in r.cols)) next.card_rate_assumed = r.cols.card_bps === null
      const p = planProblem(next); if (p) return refuse(400, p)
      // New row first, then the old one superseded; a lost race takes the new row back out.
      const inserted = await store.insertPlan(next)
      if (!(await store.supersedePlan(id, stamp.at))) {
        await store.deletePlan(inserted.id as string)
        return refuse(409, 'That plan has been edited since this page loaded. Nothing was changed — reload to see it.')
      }
      return { ok: true, data: { plan: planOut(inserted) } }
    }
    case 'edit_benchmark': {
      const code = typeof body.countryCode === 'string' ? body.countryCode.trim().toUpperCase() : ''
      if (!/^[A-Z]{2}$/.test(code)) return refuse(400, 'Which country?')
      const old = await store.currentBenchmark(code)
      const allowed = old ? BENCH_EDITABLE : ([...BENCH_EDITABLE, 'currency'] as const)
      const r = toColumns(body.fields, allowed, BENCH as Record<string, Def>)
      if (!r.ok) return refuse(400, r.error)
      const next: Row = { country_code: code }
      if (old) for (const d of Object.values(BENCH)) if (!['id', 'superseded_at', 'created_at'].includes(d.col)) next[d.col] = old[d.col] ?? null
      Object.assign(next, r.cols, { checked_on: r.cols.checked_on ?? stamp.today })
      for (const need of ['currency', 'meal_minor', 'eur_rate', 'eur_rate_date']) if (next[need] === undefined || next[need] === null)
        return refuse(400, `${LABEL[Object.keys(BENCH).find(k => (BENCH as Record<string, Def>)[k].col === need) ?? need] ?? need} is needed for a new country.`)
      if (old && !(await store.supersedeBenchmark(old.id as string, stamp.at))) return refuse(409, 'This country’s data has been edited since this page loaded. Reload to see it.')
      try { return { ok: true, data: { benchmark: benchmarkOut(await store.insertBenchmark(next)) } } }
      catch (e) { if (old) await store.unsupersedeBenchmark(old.id as string); throw e }
    }
    case 'set_feature': {
      const cid = typeof body.competitorId === 'string' ? body.competitorId : null
      const col = typeof body.column === 'string' ? FEATURE_COLS[body.column] : undefined
      if (!cid) return refuse(400, 'Which competitor?')
      if (!col) return refuse(400, 'Only the six key features can be set here.')
      if (!TRI.includes(body.value as (typeof TRI)[number])) return refuse(400, 'A feature is yes, no or not checked.')
      const r = await store.updateCompetitor(cid, { [col]: body.value, features_checked_on: stamp.today, features_verified_at: stamp.at, updated_at: stamp.at })
      return r ? { ok: true, data: { competitor: competitorOut(r) } } : refuse(404, 'That competitor is gone. Reload the page.')
    }
    case 'add_competitor': {
      const comp = toColumns(body.competitor, COMPETITOR_NEW, COMPETITOR as Record<string, Def>)
      if (!comp.ok) return refuse(400, comp.error)
      const planFields = { ...(body.plan as Row ?? {}) }
      const code = typeof planFields.countryCode === 'string' ? planFields.countryCode.trim().toUpperCase() : ''
      delete planFields.countryCode
      if (!/^[A-Z]{2}$/.test(code)) return refuse(400, 'Which country is the plan for?')
      const plan = toColumns(planFields, PLAN_EDITABLE, PLAN as Record<string, Def>)
      if (!plan.ok) return refuse(400, plan.error)
      if (!plan.cols.plan_name || !plan.cols.currency) return refuse(400, 'The plan needs a name and a currency.')
      const existing = await store.findCompetitorByName(comp.cols.name as string)
      const competitor = existing ?? await store.insertCompetitor({ ...comp.cols, created_at: stamp.at, updated_at: stamp.at })
      const row: Row = {
        competitor_id: competitor.id, country_code: code, price_hidden: false, yearly_only: false, setup_minor: 0, truck_fee_bps: 0,
        truck_fee_fixed_minor: 0, customer_fee_bps: 0, customer_fee_fixed_minor: 0, card_mode: 'unknown', card_bps: null, card_fixed_minor: null,
        order_cap: null, included_orders: null, overage_fixed_minor: null, vat: 'unknown', status: 'counted', unclear: false, second_hand: false,
        monthly_minor: null, source_url: null, notes: null,
        ...plan.cols, source: 'admin', checked_on: plan.cols.checked_on ?? stamp.today,
      }
      if (!('card_rate_assumed' in plan.cols)) row.card_rate_assumed = row.card_bps === null
      const p = planProblem(row); if (p) return refuse(400, p)
      const inserted = await store.insertPlan(row)
      return { ok: true, data: { competitor: competitorOut(competitor), plan: planOut(inserted) } }
    }
    default:
      return refuse(400, 'Unknown action.')
  }
}
