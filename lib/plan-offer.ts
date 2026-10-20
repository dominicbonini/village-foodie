// lib/plan-offer.ts — 🔴 WHAT THE PUBLIC PRICING SURFACES SAY, COMPUTED FROM THE PLAN DATA (Stage B of the new pricing,
// docs/pricing-pages-report.md).
//
// The landing pricing section, /features, Manage › Billing's table, the /compare calculator and the plans PDF all read
// THIS module, which reads only public.plans / plan_prices / plan_features (lib/plans.ts) and the country's money
// format. It returns DATA — amounts as minor units, shapes, flags, feature keys — never sentences: every word is a
// message, chosen by the component that renders it.
// ⛔ NO PLAN KEY, NAME, PRICE, ALLOWANCE, FEE OR THRESHOLD IS WRITTEN HERE. Which fee sentence a card gets is chosen by
// the SHAPE of its price row (included 0 / > 0 / NULL), never by its key; the "cheapest plan" thresholds are solved
// from the prices.
// PURE AND CLIENT-SAFE.
import { FEATURES, type Feature } from '@/lib/features'
import {
  publicPlans, planPriceFor, planAllowsFeature, expiryFallbackPlan, signupDefaultPlan, activePlans,
  type PlanCatalog, type PlanRow, type PlanPrice,
} from '@/lib/plans'
import { FEATURE_TABLE, FEATURE_GROUPS, BASE_CARD_BULLETS, ADDED_FEATURE_BULLETS, type FeatureGroup, type FeatureTableRow } from '@/lib/feature-table'
import { minorDigits } from '@/lib/money-format'

/**
 * The shape of a plan's price row, which decides its fee sentence:
 *   • 'feeOnly'  — nothing included (0) and a fee: "0.99%* on online card orders only…"
 *   • 'included' — an amount included each month, then a fee: "First £4,000 … included each month, then 0.99%*…"
 *   • 'noFee'    — unlimited (NULL) or no fee at all: "No HatchGrab fees on online orders…"
 */
export type FeeShape = 'feeOnly' | 'included' | 'noFee'

export interface OfferPlan {
  plan: PlanRow
  price: PlanPrice
  monthlyMinor: number
  /** Online orders included each month; null = unlimited. */
  includedMinor: number | null
  feeBps: number
  shape: FeeShape
  highlighted: boolean
}

export function feeShape(p: Pick<PlanPrice, 'includedOnlineMinor' | 'feeBps'>): FeeShape {
  if (p.includedOnlineMinor === null || p.feeBps <= 0) return 'noFee'
  return p.includedOnlineMinor > 0 ? 'included' : 'feeOnly'
}

/** The public plans a country's pages show, in sort_order — each with its price row there (a plan unpriced in the country is left out). */
export function offerPlans(catalog: PlanCatalog, countryCode: string | null | undefined): OfferPlan[] {
  const out: OfferPlan[] = []
  for (const plan of publicPlans(catalog)) {
    const price = planPriceFor(catalog, plan.key, countryCode)
    if (!price) continue
    out.push({ plan, price, monthlyMinor: price.monthlyMinor, includedMinor: price.includedOnlineMinor, feeBps: price.feeBps, shape: feeShape(price), highlighted: plan.isHighlighted })
  }
  return out
}

/** The trial the pages advertise: the signup-default plan's length when it is a trial, else the first active trial plan's. */
export function offerTrialMonths(catalog: PlanCatalog): number | null {
  const d = (() => { try { return signupDefaultPlan(catalog) } catch { return null } })()
  if (d && d.isTrial && d.trialMonths) return d.trialMonths
  return activePlans(catalog).find(p => p.isTrial && p.trialMonths)?.trialMonths ?? null
}

/** The plan a truck moves to when its plan ends, and whether it has no monthly fee in the country. */
export function offerFallback(catalog: PlanCatalog, countryCode: string | null | undefined): { plan: PlanRow; free: boolean } {
  const plan = expiryFallbackPlan(catalog)
  const price = planPriceFor(catalog, plan.key, countryCode)
  return { plan, free: !price || price.monthlyMinor === 0 }
}

// ── the cards ────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface CardFeatureBullet { feature: Feature; comingSoon: boolean; sub: { feature: Feature; comingSoon: boolean }[] }

/** The first card's base bullets (lib/feature-table.ts BASE_CARD_BULLETS) the first plan actually has. */
export function baseBullets(catalog: PlanCatalog, first: OfferPlan): string[] {
  return BASE_CARD_BULLETS.filter(b => !b.feature || planAllowsFeature(catalog, first.plan.key, b.feature)).map(b => b.key)
}

/**
 * The features a card ADDS over the card before it: on for this plan, off for the previous one (plan_features).
 * Ordered as ADDED_FEATURE_BULLETS lists them, then any other added feature in FEATURES order; a feature marked `under`
 * another is shown beneath it when both are added (else on its own).
 */
export function addedFeatureBullets(catalog: PlanCatalog, plan: OfferPlan, previous: OfferPlan): CardFeatureBullet[] {
  const added = FEATURES.filter(f => planAllowsFeature(catalog, plan.plan.key, f) && !planAllowsFeature(catalog, previous.plan.key, f))
  const listed = ADDED_FEATURE_BULLETS.map(b => b.feature)
  const ordered = [...ADDED_FEATURE_BULLETS.filter(b => added.includes(b.feature) && !b.hidden), ...added.filter(f => !listed.includes(f)).map(feature => ({ feature, under: undefined, comingSoon: false }))]
  const out: CardFeatureBullet[] = []
  for (const b of ordered) {
    if (b.under && added.includes(b.under)) continue   // shown beneath its parent below
    out.push({
      feature: b.feature, comingSoon: !!b.comingSoon,
      sub: ordered.filter(x => x.under === b.feature).map(x => ({ feature: x.feature, comingSoon: !!x.comingSoon })),
    })
  }
  return out
}

/**
 * The money bullets a card adds over the card before it, by the SHAPE of its price (never its key):
 *   • 'noFee'    → `unlimitedOrders` and `samePrice`;
 *   • 'included' / 'feeOnly' → none — the fee sentence under the price already states the included amount and the fee
 *     (the "{included} of online orders a month with no HatchGrab fee" bullet was taken off on Dominic's request,
 *     20 October 2026, as a repeat of that line).
 */
export function moneyBullets(plan: OfferPlan): ('unlimitedOrders' | 'samePrice')[] {
  if (plan.shape === 'noFee') return ['unlimitedOrders', 'samePrice']
  return []
}

// ── which plan is cheapest ───────────────────────────────────────────────────────────────────────────────────────────

/** A plan's monthly cost, in minor units, at `salesMinor` of online card orders a month. */
export function monthlyCostMinor(p: Pick<OfferPlan, 'monthlyMinor' | 'includedMinor' | 'feeBps'>, salesMinor: number): number {
  if (p.includedMinor === null) return p.monthlyMinor
  return p.monthlyMinor + (p.feeBps / 10000) * Math.max(0, salesMinor - p.includedMinor)
}

/** The cheapest plan at a volume — ties go to the earlier plan in sort_order. */
export function cheapestAt(plans: OfferPlan[], salesMinor: number): OfferPlan | null {
  let best: OfferPlan | null = null
  let bestCost = Infinity
  for (const p of plans) {
    const c = monthlyCostMinor(p, salesMinor)
    if (c < bestCost - 1e-9) { best = p; bestCost = c }
  }
  return best
}

export interface CheapestBand { plan: OfferPlan; fromMinor: number | null; toMinor: number | null }

/**
 * 🔴 "WHICH PLAN IS CHEAPEST FOR ME?" — SOLVED, NEVER TYPED. As monthly online sales rise from nothing, where does the
 * cheapest plan change? Each crossover is found exactly (the costs are piecewise-linear: scanned in whole units of the
 * currency, then bisected to the minor unit) and ROUNDED TO THE NEAREST 100 in the country's currency (GB today:
 * under 2,900 → the first plan; 2,900–8,000 → the second; over 8,000 → the third). A plan that is never cheapest is left
 * out; a band that rounding empties is dropped.
 */
export function cheapestBands(plans: OfferPlan[], currency: string): CheapestBand[] {
  if (!plans.length) return []
  const unit = 10 ** minorDigits(currency)            // minor units in one whole unit
  const round = 100 * unit                            // round to the nearest 100 in the currency
  const finiteFees = plans.filter(p => p.includedMinor !== null && p.feeBps > 0)
  const maxMonthly = Math.max(...plans.map(p => p.monthlyMinor))
  const maxIncluded = Math.max(0, ...plans.map(p => p.includedMinor ?? 0))
  const minFee = finiteFees.length ? Math.min(...finiteFees.map(p => p.feeBps)) : 1
  // Beyond this volume every fee-charging plan has passed every flat price, so nothing changes any more.
  const limit = maxIncluded + Math.ceil((maxMonthly + unit) * 10000 / minFee) + unit
  const changes: { at: number; to: OfferPlan }[] = []
  let current = cheapestAt(plans, 0)
  for (let s = unit; s <= limit + unit; s += unit) {
    const here = cheapestAt(plans, s)
    if (here && here !== current) {
      let lo = s - unit, hi = s                       // cheapestAt(lo) = current, cheapestAt(hi) = here
      while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (cheapestAt(plans, mid) === current) lo = mid; else hi = mid }
      changes.push({ at: hi, to: here })
      current = here
    }
  }
  const first = cheapestAt(plans, 0)!
  const bands: CheapestBand[] = []
  let from: number | null = null
  let who = first
  for (const c of changes) {
    const at = Math.round(c.at / round) * round
    if (from === null || at > from) bands.push({ plan: who, fromMinor: from, toMinor: at })
    from = at; who = c.to
  }
  bands.push({ plan: who, fromMinor: from, toMinor: null })
  return bands
}

// ── the table ────────────────────────────────────────────────────────────────────────────────────────────────────────

export type TableCell = 'on' | 'off' | 'soon'

/** A feature row's cell for a plan: "—" when the plan switches its feature off, "Coming soon" for an unbuilt product, else ✓. */
export function tableCell(catalog: PlanCatalog, row: FeatureTableRow, plan: OfferPlan): TableCell {
  if (row.feature && !planAllowsFeature(catalog, plan.plan.key, row.feature)) return 'off'
  return row.comingSoon ? 'soon' : 'on'
}

/** The table's feature rows, by group, in order. */
export function tableGroups(): { group: FeatureGroup; rows: FeatureTableRow[] }[] {
  return FEATURE_GROUPS.map(group => ({ group, rows: FEATURE_TABLE.filter(r => r.group === group) }))
}

/** "WHAT YOU PAY": walk-up orders are "Free" while the plan has them (else "—"). */
export const walkUpFree = (catalog: PlanCatalog, plan: OfferPlan): boolean => planAllowsFeature(catalog, plan.plan.key, 'walkup_orders')

/**
 * The plans after the first that ADD features (for the /features lede: "{plans} add {features}…"), and those features —
 * in the cards' order (ADDED_FEATURE_BULLETS, then FEATURES order), a feature the cards show `under` another left to it.
 */
export function upgradeSummary(catalog: PlanCatalog, plans: OfferPlan[]): { plans: OfferPlan[]; features: Feature[] } {
  if (plans.length < 2) return { plans: [], features: [] }
  const base = plans[0]
  const added = FEATURES.filter(f => !planAllowsFeature(catalog, base.plan.key, f) && plans.slice(1).some(p => planAllowsFeature(catalog, p.plan.key, f)))
  const listed = ADDED_FEATURE_BULLETS.map(b => b.feature)
  const features = [
    ...ADDED_FEATURE_BULLETS.filter(b => added.includes(b.feature) && !b.hidden && !(b.under && added.includes(b.under))).map(b => b.feature),
    ...added.filter(f => !listed.includes(f)),
  ]
  return { plans: plans.slice(1).filter(p => added.some(f => planAllowsFeature(catalog, p.plan.key, f))), features }
}
