// lib/pricing-check.ts — Admin › Pricing check: what a truck would pay us and each competitor in a country, and the price
// that would make us cheapest (pricing-check-1, 23 October 2026; docs/pricing-check-1-report.md).
//
// PURE AND CLIENT-SAFE — no database, no server imports. The tab (components/admin/PricingCheckTab.tsx) and the harness
// (scripts/pricing-check-1.cjs) run the SAME functions.
//
// ── 🔴 NO PLAN IS NAMED HERE (manual §81) ─────────────────────────────────────────────────────────────────────────────
// Our plans, prices, included amounts and fees come from the catalogue (lib/plans.ts) for a country that has plan_prices
// rows. A planned country has none: its benchmark carries a PROPOSED Pro and Unlimited price, and they are matched to
// our plans by the SHAPE of every live price row — the public plan whose included amount is always positive takes the
// proposed Pro price and allowance, the one whose included amount is always unlimited takes the proposed Unlimited
// price, and a plan that is free with nothing included in every row stays free. Each keeps the fee its live rows agree
// on. A catalogue that does not have exactly that shape is reported as a problem, never guessed.
//
// ── THE MODEL (docs/pricing-research-1-report.md §2, reproduced to the unit) ─────────────────────────────────────────
// Volumes: 150 / 600 / 2,000 online orders a month at the meal price × the order multiplier, all paid online by card.
// Ours:   the cheapest public plan — monthly + fee_bps on online food above its included amount + card processing.
// Theirs: monthly (or the per-month price of a yearly-only plan) + setup ÷ 12 + the fees the truck pays + card
//         processing (their bundled or stated rate; otherwise OUR country's rate, marked assumed) + their per-order
//         overage above their included orders. A plan whose order cap is below the volume is not counted. Fees the
//         customer pays are shown on their own and added only when "Count fees customers pay" is on. Only status
//         'counted' plans with a price count.

import type { Feature } from '@/lib/features'
import { planAllowsFeature, planPriceFor, publicPlans, type PlanCatalog, type PlanKey } from '@/lib/plans'
import { minorDigits } from '@/lib/money-format'

// ── the stored rows (camelCase; the route maps the columns) ─────────────────────────────────────────────────────────
export type Focus = 'food_truck' | 'street_food_markets' | 'nearest_local' | 'pop_up'
export type Tri = 'yes' | 'no' | 'unknown'
export const KEY_FEATURE_COLUMNS = ['preOrders', 'whatsapp', 'socialPosts', 'ownDomain', 'iosApp', 'androidApp'] as const
/** compare-de-1: the further yes/no/unknown features the comparison page shows (editable in the Pricing check tab). */
export const COMPARE_FEATURE_COLUMNS = ['capacitySlots', 'multiLocationSchedule', 'kds', 'payAtTruck'] as const
export type CompareFeatureColumn = (typeof COMPARE_FEATURE_COLUMNS)[number]
export const COMPARE_FEATURE_LABEL: Record<CompareFeatureColumn, string> = {
  capacitySlots: 'Pickup times follow kitchen capacity', multiLocationSchedule: 'Weekly schedule with changing locations',
  kds: 'Kitchen display (KDS)', payAtTruck: 'Pay at the truck',
}
export type KeyFeatureColumn = (typeof KEY_FEATURE_COLUMNS)[number]

export interface Competitor {
  id: string
  name: string
  website: string | null
  focus: Focus | null
  paymentProviders: string | null
  preOrders: Tri; whatsapp: Tri; socialPosts: Tri; ownDomain: Tri; iosApp: Tri; androidApp: Tri
  // compare-de-1 (24 October 2026): the comparison table's further rows (20261042). 'unknown' / null until that migration
  // runs and the cells are filled (the store reads them tolerantly).
  capacitySlots: Tri; multiLocationSchedule: Tri; kds: Tri; payAtTruck: Tri
  paymentMethods: string | null; minTerm: string | null
  featuresCheckedOn: string | null
  featuresVerifiedAt: string | null
  notes: string | null
  // competitor-check-1 (20261043): the lifecycle and the automatic checker's schedule. Read tolerantly — before that
  // migration runs every competitor reads 'active', with no pages and no schedule.
  lifecycle: 'active' | 'candidate' | 'closed' | 'not_relevant'
  addedAsCandidate: boolean
  checkUrls: string[]
  checkIntervalDays: number
  nextCheckAt: string | null
  lastCheckedAt: string | null
  deepCheckedAt: string | null
  checkRequestedAt: string | null
}

/** competitor-check-1: whether a competitor is counted and shown anywhere in Pricing check (and the comparison pages).
 *  Only an active one; a competitor added as a CANDIDATE also needs its features verified (after its classification was
 *  accepted). Closed and not-relevant competitors are kept for history but never counted. */
export const isCountedCompetitor = (c: Pick<Competitor, 'lifecycle' | 'addedAsCandidate' | 'featuresVerifiedAt'>) =>
  c.lifecycle === 'active' && !(c.addedAsCandidate && !c.featuresVerifiedAt)

/** compare-de-1 (20261042): one competitor on a country's comparison page. */
export interface ComparisonEntry {
  id: string; countryCode: string; competitorId: string; primaryPlanId: string | null; chooseWhen: string | null
  sortOrder: number; verifiedAt: string | null; verifiedBy: string | null; createdAt: string | null
}

export interface CompetitorPlan {
  id: string
  competitorId: string
  countryCode: string
  planName: string
  currency: string
  priceHidden: boolean
  monthlyMinor: number | null
  yearlyOnly: boolean
  setupMinor: number
  truckFeeBps: number
  truckFeeFixedMinor: number
  customerFeeBps: number
  customerFeeFixedMinor: number
  cardMode: 'bundled' | 'separate' | 'unknown'
  cardBps: number | null
  cardFixedMinor: number | null
  cardRateAssumed: boolean
  orderCap: number | null
  includedOrders: number | null
  overageFixedMinor: number | null
  vat: 'incl' | 'excl' | 'unknown'
  status: 'counted' | 'hidden' | 'closed' | 'excluded'
  unclear: boolean
  secondHand: boolean
  source: 'research' | 'manual' | 'admin'
  sourceUrl: string | null
  checkedOn: string
  verifiedAt: string | null
  verifiedBy: string | null
  notes: string | null
  supersededAt: string | null
  createdAt: string | null
}

export interface Benchmark {
  id: string
  countryCode: string
  currency: string
  mealMinor: number
  mealSourceLabel: string | null
  mealSourceUrl: string | null
  mealSourceOk: boolean
  orderMultiplier: number
  eurRate: number
  eurRateDate: string
  cardBps: number | null
  cardFixedMinor: number | null
  plannedProMinor: number | null
  plannedProIncludedMinor: number | null
  plannedUnlimitedMinor: number | null
  iosAppAvailable: boolean | null
  androidAppAvailable: boolean | null
  notes: string | null
  checkedOn: string
  supersededAt: string | null
  createdAt: string | null
}

/** The country_settings fields this page reads (the card rate and the switch). */
export interface CountryRow { countryCode: string; name: string; enabled: boolean; currency: string; cardFeeOnlinePct: number; cardFeeOnlineFixedMinor: number }

export interface CheckOptions { foodTruckOnly: boolean; countCustomerFees: boolean; verifiedOnly: boolean }
export const DEFAULT_OPTIONS: CheckOptions = { foodTruckOnly: true, countCustomerFees: true, verifiedOnly: false }

/** Truck sizes, in online orders a month (the research's scenarios — sizes, not prices). */
export const VOLUMES = [
  { key: 'small', label: 'Small', orders: 150 },
  { key: 'medium', label: 'Medium', orders: 600 },
  { key: 'busy', label: 'Busy', orders: 2000 },
] as const
export type VolumeKey = (typeof VOLUMES)[number]['key']

/** "Within 5% / 10%": the margins the suggestion cards show. */
export const MARGINS = [
  { key: 'cheapest', label: 'To be cheapest', factor: 1 },
  { key: 'within5', label: 'Within 5%', factor: 1.05 },
  { key: 'within10', label: 'Within 10%', factor: 1.1 },
] as const

/** A food-truck tool, for the "Food-truck tools only" filter: anything built for trucks, markets or pop-ups. */
export const isFoodTruckTool = (c: Pick<Competitor, 'focus'> | null | undefined) => !!c?.focus && c.focus !== 'nearest_local'

export const FOCUS_LABEL: Record<Focus, string> = {
  food_truck: 'Food trucks', street_food_markets: 'Street food & markets', pop_up: 'Pop-ups', nearest_local: 'Local restaurants',
}

// ── money ────────────────────────────────────────────────────────────────────────────────────────────────────────────
const toMajor = (minor: number, cur: string) => minor / 10 ** minorDigits(cur)
const toMinorUnits = (major: number, cur: string) => major * 10 ** minorDigits(cur)

/** Units of each currency per 1 EUR, from every current benchmark (a currency many countries share appears once). */
export function eurRates(benchmarks: Benchmark[]): Map<string, number> {
  const m = new Map<string, number>([['EUR', 1]])
  for (const b of benchmarks) if (b.supersededAt === null && b.eurRate > 0 && !m.has(b.currency)) m.set(b.currency, b.eurRate)
  return m
}

/** An amount in one currency's minor units, in another's — through the euro. Null when a rate is missing. */
export function convertMinor(minor: number, from: string, to: string, rates: Map<string, number>): number | null {
  if (from === to) return minor
  const rf = rates.get(from), rt = rates.get(to)
  if (!rf || !rt) return null
  return toMinorUnits((toMajor(minor, from) / rf) * rt, to)
}

/**
 * The nearest price point AT OR BELOW a limit, in major units. There is no price-point helper in the app (native-prices
 * changed how prices are WRITTEN, not where they land — lib/currencies.ts homeDisplay is display only), so this is the
 * brief's rule: round DOWN to a number ending in 9 at the price's scale — 9, 19 … 99; 149, 199, 249 … above 100;
 * 1 490, 1 990 … above 1,000 — and the same pattern a power of ten up each time (14 900, 19 900 …; 149 000 …).
 * Null when the limit is under the lowest point (9).
 */
export function pricePointAtOrBelow(limitMajor: number): number | null {
  if (!(limitMajor >= 9)) return null
  const mag = Math.floor(Math.log10(limitMajor))
  if (mag <= 1) return Math.floor((limitMajor + 1) / 10) * 10 - 1
  const step = 5 * 10 ** (mag - 1), end = 10 ** (mag - 2)
  return Math.floor((limitMajor + end) / step) * step - end
}

// ── our plans ────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface OurPlan { key: PlanKey; name: string; sortOrder: number; monthlyMinor: number; includedOnlineMinor: number | null; feeBps: number }
export interface OurPlans { plans: OurPlan[]; live: boolean; problem: string | null }

/** Our public plans in a country: its live plan_prices rows, or — with none — the benchmark's proposed prices. */
export function ourPlansFor(catalog: PlanCatalog, countryCode: string, benchmark: Benchmark | null): OurPlans {
  const pub = publicPlans(catalog)
  const live = pub.map(p => ({ p, price: planPriceFor(catalog, p.key, countryCode) }))
  if (live.length && live.every(x => x.price)) {
    return { live: true, problem: null, plans: live.map(({ p, price }) => ({ key: p.key, name: p.name, sortOrder: p.sortOrder,
      monthlyMinor: price!.monthlyMinor, includedOnlineMinor: price!.includedOnlineMinor, feeBps: price!.feeBps })) }
  }
  if (live.some(x => x.price)) return { live: true, plans: [], problem: 'Only some of our plans have a price in this country.' }
  if (!benchmark || benchmark.plannedProMinor === null || benchmark.plannedUnlimitedMinor === null || benchmark.plannedProIncludedMinor === null)
    return { live: false, plans: [], problem: 'No live prices here, and no proposed prices in this country’s data.' }
  const plans: OurPlan[] = []
  for (const p of pub) {
    const rows = catalog.prices.filter(r => r.planKey === p.key)
    if (!rows.length) return { live: false, plans: [], problem: `${p.name} has no price in any country, so the proposed prices cannot be placed.` }
    const fees = new Set(rows.map(r => r.feeBps))
    if (fees.size !== 1) return { live: false, plans: [], problem: `${p.name}’s fee differs between countries, so a planned country’s fee is not known.` }
    const feeBps = rows[0].feeBps
    const unlimited = rows.every(r => r.includedOnlineMinor === null)
    const allowance = rows.every(r => (r.includedOnlineMinor ?? 0) > 0)
    const free = rows.every(r => r.includedOnlineMinor === 0 && r.monthlyMinor === 0)
    const base = { key: p.key, name: p.name, sortOrder: p.sortOrder, feeBps }
    if (unlimited) plans.push({ ...base, monthlyMinor: benchmark.plannedUnlimitedMinor, includedOnlineMinor: null })
    else if (allowance) plans.push({ ...base, monthlyMinor: benchmark.plannedProMinor, includedOnlineMinor: benchmark.plannedProIncludedMinor })
    else if (free) plans.push({ ...base, monthlyMinor: 0, includedOnlineMinor: 0 })
    else return { live: false, plans: [], problem: `${p.name}’s live prices do not have one shape, so the proposed prices cannot be placed.` }
  }
  const shapes = plans.map(p => (p.includedOnlineMinor === null ? 'u' : p.includedOnlineMinor > 0 ? 'a' : 'f'))
  if (shapes.filter(s => s === 'u').length !== 1 || shapes.filter(s => s === 'a').length !== 1)
    return { live: false, plans: [], problem: 'Our plans are not one with an allowance and one unlimited, so the two proposed prices cannot be placed.' }
  return { live: false, plans, problem: null }
}

/** Our online card rate in a country: its country_settings row, else the benchmark's (a planned country). */
export function ourCardRate(country: CountryRow | null, benchmark: Benchmark | null): { bps: number; fixedMinor: number; source: 'country' | 'benchmark' } | null {
  if (country) return { bps: Math.round(country.cardFeeOnlinePct * 100), fixedMinor: country.cardFeeOnlineFixedMinor, source: 'country' }
  if (benchmark && benchmark.cardBps !== null) return { bps: benchmark.cardBps, fixedMinor: benchmark.cardFixedMinor ?? 0, source: 'benchmark' }
  return null
}

// ── one volume ───────────────────────────────────────────────────────────────────────────────────────────────────────
export interface OurTotal { plan: OurPlan; subMinor: number; feeMinor: number; cardMinor: number; totalMinor: number }
export interface RivalTotal {
  plan: CompetitorPlan
  competitor: Competitor | null
  /** Why it is not counted at all (status, no price, cap, no rate) — null when counted. */
  reason: string | null
  /** Left out by the page's filters (still shown, dimmed). */
  filteredOut: boolean
  truckMinor: number
  customerMinor: number
  /** What the comparison uses: the truck's total, plus the customer's when "Count fees customers pay" is on. */
  comparableMinor: number
  parts: { subMinor: number; setupMinor: number; feesMinor: number; cardMinor: number; overageMinor: number }
  cardAssumed: boolean
}
export interface MarginCard {
  key: (typeof MARGINS)[number]['key']
  label: string
  factor: number
  limitMinor: number
  state: 'price' | 'already_met' | 'not_possible' | 'below_lowest'
  priceMinor: number | null
  /** The suggestion is at or below another of our plans' prices (an Unlimited at or under Pro). */
  atOrBelow: OurPlan | null
}
export interface Suggestion { plan: OurPlan; rival: RivalTotal; cards: MarginCard[]; todayMinor: number; diffPct: number }
export interface VolumeResult {
  key: VolumeKey; orders: number; orderMinor: number; revenueMinor: number
  ours: OurTotal[]; best: OurTotal | null
  rivals: RivalTotal[]
  cheapestRival: RivalTotal | null
  cheapest: boolean
  beatenBy: RivalTotal[]
  suggestion: Suggestion | null
}

function ourTotals(plans: OurPlan[], revenueMinor: number, cardMinor: number): OurTotal[] {
  return plans.map(plan => {
    const above = plan.includedOnlineMinor === null ? 0 : Math.max(0, revenueMinor - plan.includedOnlineMinor)
    const feeMinor = (above * plan.feeBps) / 10000
    return { plan, subMinor: plan.monthlyMinor, feeMinor, cardMinor, totalMinor: plan.monthlyMinor + feeMinor + cardMinor }
  })
}

const rejected = (plan: CompetitorPlan, competitor: Competitor | null, reason: string): RivalTotal => ({
  plan, competitor, reason, filteredOut: false, truckMinor: 0, customerMinor: 0, comparableMinor: 0,
  parts: { subMinor: 0, setupMinor: 0, feesMinor: 0, cardMinor: 0, overageMinor: 0 }, cardAssumed: false,
})

const NOT_COUNTED: Record<Exclude<CompetitorPlan['status'], 'counted'>, string> = {
  hidden: 'Price hidden', closed: 'Closed to new customers', excluded: 'Left out on purpose',
}

export function rivalTotal(plan: CompetitorPlan, competitor: Competitor | null, ctx: {
  currency: string; orders: number; orderMinor: number; revenueMinor: number; card: { bps: number; fixedMinor: number } | null
  rates: Map<string, number>; options: CheckOptions
}): RivalTotal {
  if (plan.status !== 'counted') return rejected(plan, competitor, NOT_COUNTED[plan.status])
  if (plan.monthlyMinor === null) return rejected(plan, competitor, 'No price')
  if (plan.orderCap !== null && plan.orderCap < ctx.orders) return rejected(plan, competitor, `Takes at most ${plan.orderCap.toLocaleString('en-GB')} orders a month`)
  const conv = (m: number) => convertMinor(m, plan.currency, ctx.currency, ctx.rates)
  const sub = conv(plan.monthlyMinor), setup = conv(plan.setupMinor), tFix = conv(plan.truckFeeFixedMinor), cFix = conv(plan.customerFeeFixedMinor)
  const over = plan.overageFixedMinor === null ? 0 : conv(plan.overageFixedMinor)
  if (sub === null || setup === null || tFix === null || cFix === null || over === null) return rejected(plan, competitor, `No exchange rate for ${plan.currency}`)
  let cardMinor: number, cardAssumed = false
  if (plan.cardBps !== null) {
    const fixed = conv(plan.cardFixedMinor ?? 0)
    if (fixed === null) return rejected(plan, competitor, `No exchange rate for ${plan.currency}`)
    cardMinor = (ctx.revenueMinor * plan.cardBps) / 10000 + ctx.orders * fixed
  } else {
    if (!ctx.card) return rejected(plan, competitor, 'No card rate to assume')
    cardMinor = (ctx.revenueMinor * ctx.card.bps) / 10000 + ctx.orders * ctx.card.fixedMinor
    cardAssumed = true
  }
  const feesMinor = (ctx.revenueMinor * plan.truckFeeBps) / 10000 + ctx.orders * tFix
  const overageMinor = plan.includedOrders === null ? 0 : Math.max(0, ctx.orders - plan.includedOrders) * over
  const setupMinor = setup / 12
  const truckMinor = sub + setupMinor + feesMinor + cardMinor + overageMinor
  const customerMinor = (ctx.revenueMinor * plan.customerFeeBps) / 10000 + ctx.orders * cFix
  const filteredOut = (ctx.options.foodTruckOnly && !isFoodTruckTool(competitor)) || (ctx.options.verifiedOnly && !plan.verifiedAt)
  return {
    plan, competitor, reason: null, filteredOut, truckMinor, customerMinor,
    comparableMinor: truckMinor + (ctx.options.countCustomerFees ? customerMinor : 0),
    parts: { subMinor: sub, setupMinor, feesMinor, cardMinor, overageMinor }, cardAssumed,
  }
}

export interface CountryInput {
  countryCode: string
  benchmark: Benchmark | null
  country: CountryRow | null
  catalog: PlanCatalog
  /** Current competitor plans (superseded ones are ignored here). */
  plans: CompetitorPlan[]
  competitors: Competitor[]
  rates: Map<string, number>
}
export interface CountryResult {
  countryCode: string
  currency: string
  our: OurPlans
  card: { bps: number; fixedMinor: number; source: 'country' | 'benchmark' } | null
  volumes: VolumeResult[]
  problem: string | null
}

/** Everything the tab shows for one country, at every volume. */
export function checkCountry(input: CountryInput, options: CheckOptions): CountryResult {
  const { benchmark, country } = input
  const currency = benchmark?.currency ?? country?.currency ?? 'EUR'
  const our = ourPlansFor(input.catalog, input.countryCode, benchmark)
  const card = ourCardRate(country, benchmark)
  const compById = new Map(input.competitors.map(c => [c.id, c]))
  const current = input.plans.filter(p => p.countryCode === input.countryCode && p.supersededAt === null)
  const problem = !benchmark ? 'No benchmark for this country yet (meal price, exchange rate).' : our.problem
  if (!benchmark) return { countryCode: input.countryCode, currency, our, card, volumes: [], problem }
  const orderMinor = benchmark.mealMinor * benchmark.orderMultiplier
  const volumes = VOLUMES.map(v => {
    const revenueMinor = orderMinor * v.orders
    const cardMinor = card ? (revenueMinor * card.bps) / 10000 + v.orders * card.fixedMinor : 0
    const ours = our.problem ? [] : ourTotals(our.plans, revenueMinor, cardMinor)
    const best = ours.length ? ours.reduce((a, b) => (b.totalMinor < a.totalMinor ? b : a)) : null
    const rivals = current.map(p => rivalTotal(p, compById.get(p.competitorId) ?? null, {
      currency, orders: v.orders, orderMinor, revenueMinor, card, rates: input.rates, options,
    }))
    const live = rivals.filter(r => r.reason === null && !r.filteredOut)
    rivals.sort((a, b) => (a.reason === null ? 0 : 1) - (b.reason === null ? 0 : 1) || a.comparableMinor - b.comparableMinor || a.plan.planName.localeCompare(b.plan.planName))
    const cheapestRival = live.length ? live.reduce((a, b) => (b.comparableMinor < a.comparableMinor ? b : a)) : null
    const beatenBy = best ? live.filter(r => r.comparableMinor < best.totalMinor - 1e-9).sort((a, b) => a.comparableMinor - b.comparableMinor) : []
    const cheapest = !!best && beatenBy.length === 0
    return { key: v.key, orders: v.orders, orderMinor, revenueMinor, ours, best, rivals, cheapestRival, cheapest, beatenBy,
      suggestion: best && cheapestRival ? suggest(best, cheapestRival, our.plans, currency) : null }
  })
  return { countryCode: input.countryCode, currency, our, card, volumes, problem }
}

/**
 * "What {plan} price would win": for the plan that is our cheapest at this volume, the highest monthly price at which
 * our total is within each margin of the cheapest counted rival — limit = rival × factor − card − the plan's fee above
 * its included amount — and the nearest price point at or below it.
 */
export function suggest(best: OurTotal, rival: RivalTotal, plans: OurPlan[], currency: string): Suggestion {
  const cards = MARGINS.map(m => {
    const limitMinor = rival.comparableMinor * m.factor - best.cardMinor - best.feeMinor
    const limitMajor = toMajor(limitMinor, currency)
    let state: MarginCard['state'], priceMinor: number | null = null
    if (limitMinor <= 0) state = 'not_possible'
    else if (best.plan.monthlyMinor <= limitMinor + 1e-9) { state = 'already_met'; priceMinor = best.plan.monthlyMinor }
    else {
      const point = pricePointAtOrBelow(limitMajor)
      if (point === null) state = 'below_lowest'
      else { state = 'price'; priceMinor = Math.round(toMinorUnits(point, currency)) }
    }
    const atOrBelow = priceMinor === null || state === 'already_met' ? null
      : plans.filter(p => p.key !== best.plan.key && p.monthlyMinor > 0 && p.sortOrder < best.plan.sortOrder && priceMinor! <= p.monthlyMinor)
        .sort((a, b) => b.monthlyMinor - a.monthlyMinor)[0] ?? null
    return { key: m.key, label: m.label, factor: m.factor, limitMinor, state, priceMinor, atOrBelow }
  })
  return { plan: best.plan, rival, cards, todayMinor: best.totalMinor,
    diffPct: rival.comparableMinor > 0 ? ((best.totalMinor - rival.comparableMinor) / rival.comparableMinor) * 100 : 0 }
}

/** The country list's pill, at medium (with the page's filters): cheapest there, only at small, not, or no rivals. */
export type CountryStatus = 'cheapest' | 'small_only' | 'not_cheapest' | 'no_rivals' | 'no_data'
export function countryStatus(r: CountryResult): CountryStatus {
  const med = r.volumes.find(v => v.key === 'medium'), small = r.volumes.find(v => v.key === 'small')
  if (!med || !med.best) return 'no_data'
  if (!med.cheapestRival) return 'no_rivals'
  if (med.cheapest) return 'cheapest'
  return small?.cheapest ? 'small_only' : 'not_cheapest'
}

/** A row's checked date is older than six months. */
export function isStale(checkedOn: string, today: string): boolean {
  const [y, m, d] = today.split('-').map(Number)
  const cut = new Date(Date.UTC(y, m - 1 - 6, d)).toISOString().slice(0, 10)
  return checkedOn < cut
}

// ── key features ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** The six compared features. Ours come from the plan switches (Feature keys are capabilities, allowed in code; WHICH
 *  plans have them is data). Own web address has no switch: custom domains are not plan-gated, so it is on every plan.
 *  The apps are the operator app (`ipad_kds`), and the benchmark says whether the store sells it in the country. */
export const KEY_FEATURES: readonly { column: KeyFeatureColumn; label: string; features: readonly Feature[]; app?: 'ios' | 'android' }[] = [
  { column: 'preOrders', label: 'Pre-orders with collection times', features: ['advance_preordering', 'time_slot_selection'] },
  { column: 'whatsapp', label: 'WhatsApp auto-replies', features: ['whatsapp_replies'] },
  { column: 'socialPosts', label: 'Social media posts', features: ['schedule_graphics'] },
  { column: 'ownDomain', label: 'Own web address', features: [] },
  { column: 'iosApp', label: 'iPhone and iPad app', features: ['ipad_kds'], app: 'ios' },
  { column: 'androidApp', label: 'Android app', features: ['ipad_kds'], app: 'android' },
]

/** compare-de-1: the comparison page's further rows, the same way: our cell from the plan switches. Changing locations has
 *  no switch (the weekly schedule is the product itself), so it is on every plan. */
export const COMPARE_FEATURES: readonly { column: CompareFeatureColumn; label: string; features: readonly Feature[] }[] = [
  { column: 'capacitySlots', label: COMPARE_FEATURE_LABEL.capacitySlots, features: ['smart_batch_pacing'] },
  { column: 'multiLocationSchedule', label: COMPARE_FEATURE_LABEL.multiLocationSchedule, features: [] },
  { column: 'kds', label: COMPARE_FEATURE_LABEL.kds, features: ['web_dashboard'] },
  { column: 'payAtTruck', label: COMPARE_FEATURE_LABEL.payAtTruck, features: ['online_ordering_pay_at_hatch'] },
]

/** Our cell for one key feature: "Yes" on every public plan, else the plans that have it ("Pro & Unlimited"). */
export function ourFeatureCell(catalog: PlanCatalog, def: { features: readonly Feature[]; app?: 'ios' | 'android' }, benchmark: Benchmark | null): string {
  if (def.app) {
    const avail = def.app === 'ios' ? benchmark?.iosAppAvailable : benchmark?.androidAppAvailable
    if (avail === false) return 'Not in this country'
  }
  const pub = publicPlans(catalog)
  const has = pub.filter(p => def.features.every(f => planAllowsFeature(catalog, p.key, f)))
  let cell = has.length === pub.length ? 'Yes' : has.length === 0 ? 'No' : has.map(p => p.name).join(' & ')
  if (def.app && (def.app === 'ios' ? benchmark?.iosAppAvailable : benchmark?.androidAppAvailable) == null && has.length) cell += ' (store countries not recorded)'
  return cell
}
