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

import type { Benchmark, Competitor, CompetitorPlan, ComparisonEntry } from '@/lib/pricing-check'

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
  // ── compare-de-1: public.comparison_entries (20261042) ──
  /** False while the table is not there (the migration has not run). */
  entriesReady(): Promise<boolean>
  listEntries(): Promise<Row[]>
  insertEntry(row: Row): Promise<Row>
  updateEntry(id: string, cols: Row): Promise<Row | null>
  deleteEntry(id: string): Promise<void>
  /** Which of these ids already exist in the table (the German import's once-only check). */
  existingIds(table: 'competitors' | 'plans' | 'benchmarks' | 'entries', ids: string[]): Promise<string[]>
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string }
const refuse = <T>(status: number, error: string): ActionResult<T> => ({ ok: false, status, error })
export interface Stamp { by: string; at: string; today: string }

// ── columns ↔ fields ────────────────────────────────────────────────────────────────────────────────────────────────
type Kind = 'text' | 'textOrNull' | 'url' | 'bool' | 'boolOrNull' | 'int0' | 'int0OrNull' | 'int1OrNull' | 'num' | 'date' | 'currency' | 'country' | 'textArray'
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
  // compare-de-1 (20261042): read tolerantly — LEGACY_COMPETITOR_COLUMNS below is the select before that migration runs.
  capacitySlots: { col: 'capacity_slots', kind: { oneOf: TRI } }, multiLocationSchedule: { col: 'multi_location_schedule', kind: { oneOf: TRI } },
  kds: { col: 'kds', kind: { oneOf: TRI } }, payAtTruck: { col: 'pay_at_truck', kind: { oneOf: TRI } },
  paymentMethods: { col: 'payment_methods', kind: 'textOrNull' }, minTerm: { col: 'min_term', kind: 'textOrNull' },
  featuresCheckedOn: { col: 'features_checked_on', kind: 'date' }, featuresVerifiedAt: { col: 'features_verified_at', kind: 'textOrNull' },
  notes: { col: 'notes', kind: 'textOrNull' },
  // competitor-check-1 (20261043): read tolerantly (CHECK_COMPETITOR_COLUMNS), defaults below when absent.
  lifecycle: { col: 'lifecycle', kind: { oneOf: ['active', 'candidate', 'closed', 'not_relevant'] } },
  addedAsCandidate: { col: 'added_as_candidate', kind: 'bool' }, checkUrls: { col: 'check_urls', kind: 'textArray' },
  checkIntervalDays: { col: 'check_interval_days', kind: 'int0' }, nextCheckAt: { col: 'next_check_at', kind: 'textOrNull' },
  lastCheckedAt: { col: 'last_checked_at', kind: 'textOrNull' }, deepCheckedAt: { col: 'deep_checked_at', kind: 'textOrNull' },
  checkRequestedAt: { col: 'check_requested_at', kind: 'textOrNull' },
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
const FEATURE_COLS: Record<string, string> = { preOrders: 'pre_orders', whatsapp: 'whatsapp', socialPosts: 'social_posts', ownDomain: 'own_domain', iosApp: 'ios_app', androidApp: 'android_app',
  // compare-de-1: the comparison page's further rows.
  capacitySlots: 'capacity_slots', multiLocationSchedule: 'multi_location_schedule', kds: 'kds', payAtTruck: 'pay_at_truck' }
/** compare-de-1: the as-advertised texts an admin may set on a competitor. */
const COMPETITOR_TEXT_COLS: Record<string, string> = { paymentMethods: 'payment_methods', minTerm: 'min_term' }
/** compare-de-1: the columns added by 20261042 — left out of the select while that migration has not run. */
export const COMPARE_COMPETITOR_COLUMNS = ['capacity_slots', 'multi_location_schedule', 'kds', 'pay_at_truck', 'payment_methods', 'min_term'] as const
/** competitor-check-1: the columns added by 20261043 — left out of the select while that migration has not run. */
export const CHECK_COMPETITOR_COLUMNS = ['lifecycle', 'added_as_candidate', 'check_urls', 'check_interval_days', 'next_check_at', 'last_checked_at', 'deep_checked_at', 'check_requested_at'] as const
/** competitor-check-1: what a competitor column reads as when the row does not carry it (before 20261043). */
const ABSENT: Record<string, unknown> = { lifecycle: 'active', added_as_candidate: false, check_urls: [], check_interval_days: 90 }

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
    case 'textArray': return Array.isArray(v) && v.every(x => typeof x === 'string') ? { ok: true, value: v } : { ok: false, error: `${label} must be a list.` }
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
    let v = row[d.col] ?? (d.col in ABSENT ? ABSENT[d.col] : null)
    // compare-de-1: a yes/no/unknown column the row does not carry (20261042 not run yet) reads as 'unknown'.
    if (v === null && typeof d.kind === 'object' && !d.kind.nullable && (d.kind.oneOf as readonly string[]).includes('unknown')) v = 'unknown'
    if ((d.kind === 'num') && typeof v === 'string') v = Number(v)   // numeric columns arrive as strings
    o[f] = v
  }
  return o as T
}
const ENTRY: Record<keyof ComparisonEntry, Def> = {
  id: { col: 'id', kind: 'text' }, countryCode: { col: 'country_code', kind: 'country' }, competitorId: { col: 'competitor_id', kind: 'text' },
  primaryPlanId: { col: 'primary_plan_id', kind: 'textOrNull' }, chooseWhen: { col: 'choose_when', kind: 'textOrNull' },
  sortOrder: { col: 'sort_order', kind: 'int0' }, verifiedAt: { col: 'verified_at', kind: 'textOrNull' }, verifiedBy: { col: 'verified_by', kind: 'textOrNull' },
  createdAt: { col: 'created_at', kind: 'textOrNull' },
}
export const entryOut = (r: Row) => mapOut<ComparisonEntry>(r, ENTRY)
export const competitorOut = (r: Row) => mapOut<Competitor>(r, COMPETITOR)
export const planOut = (r: Row) => mapOut<CompetitorPlan>(r, PLAN)
export const benchmarkOut = (r: Row) => mapOut<Benchmark>(r, BENCH)
/** The columns each table is read with (the store selects exactly these). */
export const COLUMNS = {
  competitors: [...Object.values(COMPETITOR).map(d => d.col), 'updated_at'].join(', '),
  /** competitor-check-1: the select before 20261043 runs (the store falls back to it on an unknown column). */
  competitorsNoCheck: [...Object.values(COMPETITOR).map(d => d.col).filter(c => !(CHECK_COMPETITOR_COLUMNS as readonly string[]).includes(c)), 'updated_at'].join(', '),
  /** compare-de-1: the competitors select before 20261042 runs (the store falls back to it on an unknown column). */
  competitorsLegacy: [...Object.values(COMPETITOR).map(d => d.col).filter(c => !(COMPARE_COMPETITOR_COLUMNS as readonly string[]).includes(c) && !(CHECK_COMPETITOR_COLUMNS as readonly string[]).includes(c)), 'updated_at'].join(', '),
  plans: Object.values(PLAN).map(d => d.col).join(', '),
  benchmarks: Object.values(BENCH).map(d => d.col).join(', '),
}

/** 🔴 THE HISTORY RULE, in one place: a NEW row with the old row's values and `cols` on top (source 'admin', unverified,
 *  checked today unless `cols` says otherwise), inserted first; then the old row superseded — a lost race takes the new
 *  row back out. Used by Edit (edit_plan) and by accepting an automatic check's finding (competitor-check-1). */
export async function newPlanVersion(store: PricingStore, old: Row, cols: Row, stamp: Stamp): Promise<ActionResult<{ plan: CompetitorPlan; row: Row }>> {
  if (old.superseded_at != null) return refuse(409, 'That plan has been edited since this page loaded. Reload to see it.')
  const next: Row = {}
  for (const d of Object.values(PLAN)) if (!['id', 'superseded_at', 'verified_at', 'verified_by', 'created_at'].includes(d.col)) next[d.col] = old[d.col] ?? null
  Object.assign(next, cols, { source: 'admin', checked_on: cols.checked_on ?? stamp.today })
  if ('card_bps' in cols && !('card_rate_assumed' in cols)) next.card_rate_assumed = cols.card_bps === null
  const p = planProblem(next); if (p) return refuse(400, p)
  const inserted = await store.insertPlan(next)
  if (!(await store.supersedePlan(String(old.id), stamp.at))) {
    await store.deletePlan(inserted.id as string)
    return refuse(409, 'That plan has been edited since this page loaded. Nothing was changed — reload to see it.')
  }
  return { ok: true, data: { plan: planOut(inserted), row: inserted } }
}

/** A plan row must still make sense as a whole: a counted plan has a price. */
export function planProblem(cols: Row): string | null {
  if (cols.status === 'counted' && cols.monthly_minor === null) return 'A counted plan needs a monthly price (or set it to “Price hidden”).'
  if (cols.price_hidden === true && cols.status === 'counted') return 'A hidden price can’t be counted — set Counted to “Price hidden”.'
  return null
}

// ── reads ───────────────────────────────────────────────────────────────────────────────────────────────────────────
export async function loadState(store: PricingStore, compare?: ComparePayload | null): Promise<ActionResult<{
  empty: boolean; importable: boolean; competitors: Competitor[]; plans: CompetitorPlan[]; benchmarks: Benchmark[]
  entries: ComparisonEntry[]; entriesReady: boolean; compareImportable: boolean
}>> {
  const counts = await store.counts()
  const empty = counts.competitors === 0 && counts.plans === 0 && counts.benchmarks === 0
  const all = await store.listAll()
  // compare-de-1: the comparison entries, and whether the German research can still be imported (its plan ids not yet in).
  const entriesReady = await store.entriesReady()
  const entries = entriesReady ? (await store.listEntries()).map(entryOut) : []
  const entryIds = (compare?.entries ?? []).map(e => String(e.id))
  const compareImportable = !!compare && !empty && entryIds.length > 0 && (!entriesReady || (await store.existingIds('entries', entryIds)).length === 0)
  return { ok: true, data: {
    empty, importable: empty && counts.research === 0,
    competitors: all.competitors.map(competitorOut), plans: all.plans.map(planOut), benchmarks: all.benchmarks.map(benchmarkOut),
    entries, entriesReady, compareImportable,
  } }
}

// ── compare-de-1: the German comparison research, imported once ─────────────────────────────────────────────────────────
/** data/compare-de-1/competitors.json — the pricing-check shape (snake_case rows) plus the comparison entries. Every id is
 *  fixed in the file, so "already imported" is simply: any of its entry ids is already in comparison_entries. */
export interface ComparePayload { id: string; checked_on: string; competitors: Row[]; plans: Row[]; entries: Row[] }

/** The German research: competitors matched BY NAME (an existing one keeps its id and only its 'unknown' features and empty
 *  texts are filled in), then its plans — except one the competitor already has, current, under the same name in the same
 *  country (the earlier research's row stays; no duplicate) — and its comparison entries, pointed at whichever plan row
 *  is the one in the table. All source 'research', all unverified. Refused when any of the file's entries is already in,
 *  when the file is not in the expected shape, or while 20261042 has not run. */
export async function importCompareResearch(store: PricingStore, payload: ComparePayload): Promise<ActionResult<{ competitors: number; updated: number; plans: number; entries: number }>> {
  if (!payload || !Array.isArray(payload.competitors) || !Array.isArray(payload.plans) || !Array.isArray(payload.entries)
    || !payload.plans.every(p => p.source === 'research' && !p.verified_at) || !payload.entries.every(e => !e.verified_at))
    return refuse(500, 'The German research file is not in the expected shape. Nothing was changed.')
  if (!(await store.entriesReady())) return refuse(503, 'Run supabase/migrations/20261042_compare_de_1.sql first, then reload. Nothing was changed.')
  if ((await store.existingIds('entries', payload.entries.map(e => String(e.id)))).length) return refuse(409, 'The German comparison research has already been imported. Nothing was changed.')
  const idOf = new Map<string, string>()
  let added = 0, updated = 0
  const FILL = ['pre_orders', 'whatsapp', 'social_posts', 'own_domain', 'ios_app', 'android_app', 'capacity_slots', 'multi_location_schedule', 'kds', 'pay_at_truck']
  for (const c of payload.competitors) {
    const existing = await store.findCompetitorByName(String(c.name))
    if (existing) {
      const cols: Row = {}
      for (const col of FILL) if ((existing[col] ?? 'unknown') === 'unknown' && c[col] && c[col] !== 'unknown') cols[col] = c[col]
      for (const col of ['payment_methods', 'min_term', 'website', 'focus']) if (existing[col] == null && c[col] != null) cols[col] = c[col]
      if (Object.keys(cols).length) { cols.features_checked_on = c.features_checked_on ?? payload.checked_on; await store.updateCompetitor(String(existing.id), cols); updated++ }
      idOf.set(String(c.id), String(existing.id))
    } else {
      const { features_verified_at: _skip, ...row } = c   // eslint-disable-line @typescript-eslint/no-unused-vars
      await store.insertCompetitor({ ...row, features_verified_at: null })
      idOf.set(String(c.id), String(c.id)); added++
    }
  }
  const current = (await store.listAll()).plans.filter(p => p.superseded_at == null)
  const key = (cid: unknown, cc: unknown, name: unknown) => `${cid}|${cc}|${String(name).trim().toLowerCase()}`
  const have = new Map(current.map(p => [key(p.competitor_id, p.country_code, p.plan_name), String(p.id)]))
  const planIdOf = new Map<string, string>()
  const fresh: Row[] = []
  for (const p of payload.plans) {
    const cid = idOf.get(String(p.competitor_id)) ?? String(p.competitor_id)
    const existing = have.get(key(cid, p.country_code, p.plan_name))
    if (existing) { planIdOf.set(String(p.id), existing); continue }
    planIdOf.set(String(p.id), String(p.id))
    fresh.push({ ...p, competitor_id: cid, verified_at: null, verified_by: null })
  }
  const n = fresh.length ? await store.insertMany('plans', fresh) : 0
  let entries = 0
  for (const e of payload.entries) {
    await store.insertEntry({ ...e, competitor_id: idOf.get(String(e.competitor_id)) ?? e.competitor_id,
      primary_plan_id: e.primary_plan_id ? planIdOf.get(String(e.primary_plan_id)) ?? null : null, verified_at: null, verified_by: null }); entries++
  }
  return { ok: true, data: { competitors: added, updated, plans: n, entries } }
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
      const v = await newPlanVersion(store, old, r.cols, stamp)
      return v.ok ? { ok: true, data: { plan: v.data.plan } } : v
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
      if (!col) return refuse(400, 'Only the key features can be set here.')
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
    // ── compare-de-1 ──────────────────────────────────────────────────────────────────────────────────────────────────
    case 'verify_features':
    case 'unverify_features': {
      const cid = typeof body.competitorId === 'string' ? body.competitorId : null
      if (!cid) return refuse(400, 'Which competitor?')
      const on = body.action === 'verify_features'
      const r = await store.updateCompetitor(cid, { features_verified_at: on ? stamp.at : null, ...(on ? { features_checked_on: stamp.today } : {}), updated_at: stamp.at })
      return r ? { ok: true, data: { competitor: competitorOut(r) } } : refuse(404, 'That competitor is gone. Reload the page.')
    }
    case 'set_competitor_text': {
      const cid = typeof body.competitorId === 'string' ? body.competitorId : null
      const col = typeof body.field === 'string' ? COMPETITOR_TEXT_COLS[body.field] : undefined
      if (!cid) return refuse(400, 'Which competitor?')
      if (!col) return refuse(400, 'Only payment methods and minimum term can be set here.')
      if (body.value !== null && typeof body.value !== 'string') return refuse(400, 'That must be text.')
      const v = typeof body.value === 'string' && body.value.trim() ? body.value.trim() : null
      const r = await store.updateCompetitor(cid, { [col]: v, features_checked_on: stamp.today, updated_at: stamp.at })
      return r ? { ok: true, data: { competitor: competitorOut(r) } } : refuse(404, 'That competitor is gone. Reload the page.')
    }
    case 'entry_add': {
      const code = typeof body.countryCode === 'string' ? body.countryCode.trim().toUpperCase() : ''
      const cid = typeof body.competitorId === 'string' ? body.competitorId : null
      if (!/^[A-Z]{2}$/.test(code) || !cid) return refuse(400, 'Which country and which competitor?')
      if (!(await store.entriesReady())) return refuse(503, 'Run supabase/migrations/20261042_compare_de_1.sql first, then reload.')
      const list = (await store.listEntries()).filter(e => e.country_code === code)
      if (list.some(e => e.competitor_id === cid)) return refuse(409, 'That competitor is already on this country’s page.')
      const planId = typeof body.primaryPlanId === 'string' && body.primaryPlanId ? body.primaryPlanId : null
      const r = await store.insertEntry({ country_code: code, competitor_id: cid, primary_plan_id: planId, choose_when: null,
        sort_order: list.reduce((m, e) => Math.max(m, Number(e.sort_order) || 0), 0) + 1, verified_at: null, verified_by: null })
      return { ok: true, data: { entry: entryOut(r) } }
    }
    case 'entry_update': {
      if (!id) return refuse(400, 'Which entry?')
      const f = (body.fields && typeof body.fields === 'object' ? body.fields : {}) as Row
      const cols: Row = {}
      for (const [k, v] of Object.entries(f)) {
        if (k === 'chooseWhen') { if (v !== null && typeof v !== 'string') return refuse(400, 'The “passt, wenn” line must be text.'); cols.choose_when = typeof v === 'string' && v.trim() ? v.trim() : null }
        else if (k === 'primaryPlanId') { if (v !== null && typeof v !== 'string') return refuse(400, 'Choose a plan.'); cols.primary_plan_id = v || null }
        else return refuse(400, `“${k}” can’t be changed here.`)
      }
      // An edit takes the verification back: the line or the plan shown has changed since it was checked.
      const r = await store.updateEntry(id, { ...cols, verified_at: null, verified_by: null })
      return r ? { ok: true, data: { entry: entryOut(r) } } : refuse(404, 'That entry is gone. Reload the page.')
    }
    case 'entry_verify':
    case 'entry_unverify': {
      if (!id) return refuse(400, 'Which entry?')
      const on = body.action === 'entry_verify'
      const r = await store.updateEntry(id, { verified_at: on ? stamp.at : null, verified_by: on ? stamp.by : null })
      return r ? { ok: true, data: { entry: entryOut(r) } } : refuse(404, 'That entry is gone. Reload the page.')
    }
    case 'entry_move': {
      if (!id || (body.dir !== 'up' && body.dir !== 'down')) return refuse(400, 'Which entry, and up or down?')
      const all = await store.listEntries()
      const me = all.find(e => e.id === id)
      if (!me) return refuse(404, 'That entry is gone. Reload the page.')
      const list = all.filter(e => e.country_code === me.country_code).sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
      const i = list.findIndex(e => e.id === id), j = body.dir === 'up' ? i - 1 : i + 1
      if (j < 0 || j >= list.length) return { ok: true, data: { entry: entryOut(me) } }
      // Renumber the country's list 1…n with the two swapped, so equal or missing orders can't stall a move.
      const next = list.slice(); [next[i], next[j]] = [next[j], next[i]]
      for (let k = 0; k < next.length; k++) if (Number(next[k].sort_order) !== k + 1) await store.updateEntry(String(next[k].id), { sort_order: k + 1 })
      return { ok: true, data: { moved: true } }
    }
    case 'entry_remove': {
      if (!id) return refuse(400, 'Which entry?')
      await store.deleteEntry(id)
      return { ok: true, data: { removed: true } }
    }
    default:
      return refuse(400, 'Unknown action.')
  }
}
