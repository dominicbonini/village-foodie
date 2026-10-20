// lib/plans.ts — 🔴 THE ONE SOURCE FOR PLANS (plans-data-model, Stage A, 19 October 2026; docs/plans-data-model-report.md).
//
// Plans and their per-country prices are DATA: public.plans (one row per plan) and public.plan_prices (a plan's price in
// one country). The server loads them through lib/plans-server.ts (cached) and hands the catalogue to the browser in
// the same payload as the country settings; every reader asks THIS module. Nothing else may name a plan, a price, an
// included amount, a fee, an extra-van price, the plan list or its order, the signup default or the expiry fallback.
//
// A plan is a STRING KEY validated against the table — never a TypeScript union of names.
// A plan has every feature unless public.plan_features switches one off (Stage A2, docs/plan-features-config-report.md);
// lib/features.ts canAccess applies the order override → the EFFECTIVE plan's switch → allowed. Since Stage B
// (docs/pricing-pages-report.md) there is no exception to "no plan in code": the frozen display of the old pricing is deleted,
// and the public pricing surfaces read this module through lib/plan-offer.ts.
//
// PURE AND CLIENT-SAFE — no database, no server imports.
import { canAccess, featureBlock, isFeature, FEATURES, type Feature, type FeatureBlock, type PlanFeatureSwitch } from '@/lib/features'
import { localDateOfInstant, instantOfLocal } from '@/lib/time-utils'

/** A plan's key, as stored in trucks.plan and public.plans.key. Validate it with `planByKey` / `isPlanKey`. */
export type PlanKey = string

/** One row of public.plans. */
export interface PlanRow {
  key: PlanKey
  name: string
  description: string
  sortOrder: number
  /** Shown on pricing pages and choosable by trucks. */
  isPublic: boolean
  isInternal: boolean
  isTrial: boolean
  /** The plan a newly signed-up truck is provisioned on (exactly one). */
  isSignupDefault: boolean
  /** The plan a truck resolves to once its plan's end date has passed (exactly one). */
  isExpiryFallback: boolean
  /** The plan a demo truck is provisioned on (exactly one). */
  isDemo: boolean
  /** 🔴 ENFORCED (Stage A2): false switches the plan's `online_ordering_pay_at_hatch` off — customers are not offered
   *  Pay at Hatch and submit refuses it (`payAtHatchOn`). Folded into `planAllowsFeature`, so it is one mechanism. */
  payAtHatchAllowed: boolean
  active: boolean
  /** Vans included in the monthly price (≥ 1); each van above it costs the country's extra_van_monthly_minor. */
  includedVans: number
  /** A trial plan's length in months (null unless isTrial). Signup's end date is `trialEndFor`. */
  trialMonths: number | null
  /** The plan the public pricing pages mark and colour ("MOST TRUCKS") — at most one (Stage B). */
  isHighlighted: boolean
  /** The short line under the plan's name on the pricing cards, or null (Stage B). */
  subtitle: string | null
}

/** One row of public.plan_features: a plan's switch for one feature. NO ROW = ENABLED. */
export interface PlanFeatureRow {
  planKey: PlanKey
  /** A key of lib/features.ts FEATURES (an unknown one is moved to `ignoredFeatures` by the loader — splitUnknownFeatures). */
  feature: string
  enabled: boolean
}

/** One row of public.plan_prices: a plan's price in one country, in that country's minor units. */
export interface PlanPrice {
  planKey: PlanKey
  countryCode: string
  monthlyMinor: number
  /** Online food sales included each month before `feeBps` applies. NULL = unlimited. */
  includedOnlineMinor: number | null
  /** The platform fee, in basis points, on online food above the included amount. */
  feeBps: number
  extraVanMonthlyMinor: number
}

/** The whole catalogue: plans in sort order, every price row, and every feature switch. */
export interface PlanCatalog {
  plans: PlanRow[]
  prices: PlanPrice[]
  features: PlanFeatureRow[]
  /** plan_features rows that name no code feature — IGNORED (Stage B, Dominic's decision 1): kept out of `features`, logged
   *  by the loader and shown as a warning in Admin's plans table, never a reason to refuse the catalogue. */
  ignoredFeatures?: PlanFeatureRow[]
}

/** The plan columns a truck carries (a subset of its row). */
export interface TruckPlanFields {
  plan?: string | null
  /** 🔴 THE PLAN'S END DATE. Historically named for the trial; since Stage A it is the end date of WHATEVER plan the
   *  truck is on. NULL = no end. */
  trial_expires_at?: string | null
  plan_price_override_minor?: number | null
  plan_price_override_until?: string | null
  plan_price_override_note?: string | null
}

// ── the list ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Every plan in sort order (the catalogue is kept sorted; this re-sorts defensively). */
export function plansInOrder(catalog: PlanCatalog): PlanRow[] {
  return [...catalog.plans].sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key))
}

/** Active plans in sort order — what Admin offers. */
export function activePlans(catalog: PlanCatalog): PlanRow[] {
  return plansInOrder(catalog).filter(p => p.active)
}

/** Active public plans in sort order — what pricing pages show and trucks may choose. */
export function publicPlans(catalog: PlanCatalog): PlanRow[] {
  return activePlans(catalog).filter(p => p.isPublic)
}

/** The plan with this key, or null. */
export function planByKey(catalog: PlanCatalog, key: string | null | undefined): PlanRow | null {
  if (typeof key !== 'string' || !key) return null
  return catalog.plans.find(p => p.key === key) ?? null
}

/** Is this a plan key in the table? `activeOnly` refuses an inactive plan (what a write should do). */
export function isPlanKey(catalog: PlanCatalog, key: unknown, opts: { activeOnly?: boolean } = {}): key is PlanKey {
  if (typeof key !== 'string') return false
  const p = planByKey(catalog, key)
  return !!p && (!opts.activeOnly || p.active)
}

const onlyOne = (catalog: PlanCatalog, pick: (p: PlanRow) => boolean, what: string): PlanRow => {
  const found = catalog.plans.filter(pick)
  if (found.length !== 1) throw new Error(`[plans] expected exactly one ${what} plan, found ${found.length} — check public.plans`)
  return found[0]
}
/** The plan a new truck is provisioned on. 🔴 THROWS unless exactly one row is flagged. */
export const signupDefaultPlan = (catalog: PlanCatalog): PlanRow => onlyOne(catalog, p => p.isSignupDefault, 'signup-default')
/** The plan a truck falls back to when its plan has ended. 🔴 THROWS unless exactly one row is flagged. */
export const expiryFallbackPlan = (catalog: PlanCatalog): PlanRow => onlyOne(catalog, p => p.isExpiryFallback, 'expiry-fallback')
/** The plan a demo truck is provisioned on. 🔴 THROWS unless exactly one row is flagged. */
export const demoPlan = (catalog: PlanCatalog): PlanRow => onlyOne(catalog, p => p.isDemo, 'demo')

/** The structural checks a loader applies before handing a catalogue out. Returns the problems ([] = sound). */
export function catalogProblems(catalog: PlanCatalog): string[] {
  const out: string[] = []
  for (const [pick, what] of [[(p: PlanRow) => p.isSignupDefault, 'signup-default'], [(p: PlanRow) => p.isExpiryFallback, 'expiry-fallback'], [(p: PlanRow) => p.isDemo, 'demo']] as const) {
    const n = catalog.plans.filter(pick).length
    if (n !== 1) out.push(`${n} ${what} plans (expected exactly 1)`)
  }
  for (const pr of catalog.prices) if (!planByKey(catalog, pr.planKey)) out.push(`a price row for unknown plan "${pr.planKey}"`)
  // ⚠️ A SWITCH NAMING NO CODE FEATURE IS NOT A PROBLEM HERE (Stage B, decision 1): `splitUnknownFeatures` sets it aside
  // as a warning before this runs, so one typo in plan_features can never take the catalogue — and every page — down.
  for (const f of catalog.features ?? []) {
    if (!planByKey(catalog, f.planKey)) out.push(`a feature switch for unknown plan "${f.planKey}"`)
  }
  if ((catalog.plans ?? []).filter(p => p.isHighlighted).length > 1) out.push('more than one highlighted plan')
  for (const p of catalog.plans) {
    if (!(Number.isInteger(p.includedVans) && p.includedVans >= 1)) out.push(`plan "${p.key}" includes ${p.includedVans} vans (expected ≥ 1)`)
    if (p.trialMonths !== null && !(p.isTrial && Number.isInteger(p.trialMonths) && p.trialMonths >= 1)) out.push(`plan "${p.key}" has trial_months ${p.trialMonths} (only a trial plan, ≥ 1)`)
  }
  return out
}

/**
 * 🔴 UNKNOWN FEATURE KEYS ARE IGNORED, NOT FATAL (Stage B, decision 1). Returns the catalogue with every plan_features row
 * that names no code feature moved to `ignoredFeatures` — the loader logs them and Admin's plans table shows them.
 */
export function splitUnknownFeatures(catalog: PlanCatalog): PlanCatalog {
  const known = (catalog.features ?? []).filter(f => isFeature(f.feature))
  const ignored = (catalog.features ?? []).filter(f => !isFeature(f.feature))
  return { ...catalog, features: known, ignoredFeatures: ignored }
}

// ── a truck's plan ──────────────────────────────────────────────────────────────────────────────────────────────────

/** The truck's plan end date. 🔴 TODAY THIS IS `trucks.trial_expires_at` (the column's name is historical): it is the
 *  end date of whatever plan the truck is on. NULL = no end. */
export function planEndDate(truck: TruckPlanFields | null | undefined): string | null {
  return truck?.trial_expires_at ?? null
}

export interface EffectivePlan {
  /** The plan that applies now — its feature switches are the truck's (unless an override says otherwise). */
  plan: PlanRow
  /** The plan the truck is assigned (trucks.plan), or null if the key is not in the table. */
  assigned: PlanRow | null
  /** True when the assigned plan's end date has passed and `plan` is the expiry fallback. */
  ended: boolean
  /** The end date that passed, when `ended`. */
  endedAt: string | null
}

/**
 * 🔴 THE ONE RESOLVER for "which plan applies to this truck now".
 *   • the assigned plan, while its end date (planEndDate) is NULL or in the future;
 *   • the EXPIRY-FALLBACK plan once that date has passed (`ended: true`) — WITH THE FALLBACK'S feature switches (Stage
 *     A2 replaced Stage A's "keeps every feature"): an ended trial has exactly what a Pay as you go truck has;
 *   • the expiry fallback too for a key that is not in the table or a plan that is inactive (`ended: false`) — defensive;
 *     the foreign key on trucks.plan makes an unknown key impossible in the database.
 */
export function effectivePlan(truck: TruckPlanFields | null | undefined, catalog: PlanCatalog, now: Date = new Date()): EffectivePlan {
  const assigned = planByKey(catalog, truck?.plan)
  const fallback = expiryFallbackPlan(catalog)
  if (!assigned || !assigned.active) return { plan: fallback, assigned, ended: false, endedAt: null }
  const end = planEndDate(truck)
  if (end && new Date(end).getTime() <= now.getTime()) return { plan: fallback, assigned, ended: true, endedAt: end }
  return { plan: assigned, assigned, ended: false, endedAt: null }
}

/** A plan's price row in a country, or null (internal plans have none: they charge nothing). */
export function planPriceFor(catalog: PlanCatalog, planKey: PlanKey, countryCode: string | null | undefined): PlanPrice | null {
  const cc = String(countryCode ?? '').toUpperCase()
  return catalog.prices.find(p => p.planKey === planKey && p.countryCode === cc) ?? null
}

/** Today's date as YYYY-MM-DD in UTC — the default "today" for the promo override; callers pass the truck's local date. */
export function utcToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

export interface TruckPlanPrice {
  effective: EffectivePlan
  /** The effective plan's price row in the truck's country, or null (an internal plan, or an unpriced country). */
  price: PlanPrice | null
  /** The standard monthly price (the price row's), or null without a row. */
  standardMonthlyMinor: number | null
  /** The promotional override, when it applies today. */
  override: { minor: number; until: string | null; note: string | null } | null
  /** What the truck pays a month: the override while it applies, else the standard price; null without a price row. */
  monthlyMinor: number | null
  /** The effective plan's included online amount (NULL = unlimited), or undefined without a price row. */
  includedOnlineMinor: number | null | undefined
}

/**
 * The truck's monthly price, with its promotional override.
 * 🔴 THE OVERRIDE APPLIES ONLY TO THE PLAN IT WAS GIVEN FOR: while the truck is on its assigned plan (not ended), and
 * while `plan_price_override_until` is NULL or on/after `today` (inclusive). After that the standard price applies —
 * at read time, nothing is rewritten.
 * `today` is a YYYY-MM-DD date; pass the truck's local date where it matters (the default is UTC).
 */
export function truckPlanPrice(truck: TruckPlanFields | null | undefined, catalog: PlanCatalog, countryCode: string | null | undefined,
  opts: { now?: Date; today?: string } = {}): TruckPlanPrice {
  const effective = effectivePlan(truck, catalog, opts.now ?? new Date())
  const price = planPriceFor(catalog, effective.plan.key, countryCode)
  const today = opts.today ?? utcToday(opts.now ?? new Date())
  const ovMinor = truck?.plan_price_override_minor
  const until = truck?.plan_price_override_until ?? null
  const overrideApplies = typeof ovMinor === 'number' && ovMinor >= 0 && !effective.ended && effective.assigned?.key === effective.plan.key
    && (until === null || until.slice(0, 10) >= today)
  const override = overrideApplies ? { minor: ovMinor as number, until, note: truck?.plan_price_override_note ?? null } : null
  return {
    effective,
    price,
    standardMonthlyMinor: price ? price.monthlyMinor : null,
    override,
    monthlyMinor: override ? override.minor : price ? price.monthlyMinor : null,
    includedOnlineMinor: price ? price.includedOnlineMinor : undefined,
  }
}

/** The extra-van monthly price for the truck's effective plan in its country (0 without a price row). */
export function extraVanMonthlyMinor(truck: TruckPlanFields | null | undefined, catalog: PlanCatalog, countryCode: string | null | undefined, now: Date = new Date()): number {
  const eff = effectivePlan(truck, catalog, now)
  return planPriceFor(catalog, eff.plan.key, countryCode)?.extraVanMonthlyMinor ?? 0
}

/** Vans the truck's effective plan includes in its monthly price (each van above costs `extraVanMonthlyMinor`). */
export function includedVans(truck: TruckPlanFields | null | undefined, catalog: PlanCatalog, now: Date = new Date()): number {
  return effectivePlan(truck, catalog, now).plan.includedVans
}

// ── feature switches (Stage A2) ─────────────────────────────────────────────────────────────────────────────────────

/** The capability Pay at Hatch is: `plans.pay_at_hatch_allowed` folds into this feature's switch (one mechanism). */
export const PAY_AT_HATCH_FEATURE: Feature = 'online_ordering_pay_at_hatch'

/**
 * Does the plan have the feature switched on? NO ROW = ON (a new feature is on for every plan until switched off).
 * 🔴 `pay_at_hatch_allowed = false` switches PAY_AT_HATCH_FEATURE off too — the plan flag and the switch are one rule.
 */
export function planAllowsFeature(catalog: PlanCatalog, planKey: PlanKey, feature: Feature): boolean {
  const row = (catalog.features ?? []).find(f => f.planKey === planKey && f.feature === feature)
  if (row && !row.enabled) return false
  if (feature === PAY_AT_HATCH_FEATURE && planByKey(catalog, planKey)?.payAtHatchAllowed === false) return false
  return true
}

/** One plan's switches as a function — the third argument of lib/features.ts canAccess. */
export function planFeatureSwitch(catalog: PlanCatalog, planKey: PlanKey): PlanFeatureSwitch {
  return (feature: Feature) => planAllowsFeature(catalog, planKey, feature)
}

/** 🔴 THE TRUCK'S switches: its EFFECTIVE plan's (an ended plan → the expiry fallback's). */
export function truckPlanSwitch(truck: TruckPlanFields | null | undefined, catalog: PlanCatalog, now: Date = new Date()): PlanFeatureSwitch {
  return planFeatureSwitch(catalog, effectivePlan(truck, catalog, now).plan.key)
}

/** The plan the one upgrade prompt names: the FIRST active public plan, in sort_order, that has the feature on. */
export function upgradePlanFor(catalog: PlanCatalog, feature: Feature): PlanRow | null {
  return publicPlans(catalog).find(p => planAllowsFeature(catalog, p.key, feature)) ?? null
}

/** A truck plus its override map — what the access helpers read. */
export type TruckAccessFields = TruckPlanFields & { feature_overrides?: Record<string, boolean> | null }

export interface FeatureAccess {
  allowed: boolean
  /** Why it is off: the truck's override ("switched off for your truck") or its plan (the upgrade prompt). */
  block: FeatureBlock
  /** When the PLAN is why: the plan to name in the prompt (null when no public plan has it). */
  upgradeTo: PlanRow | null
}

/** 🔴 ONE ANSWER for a feature on a truck: override → effective plan's switch → allowed, and what to tell them. */
export function featureAccess(truck: TruckAccessFields | null | undefined, catalog: PlanCatalog, feature: Feature, now: Date = new Date()): FeatureAccess {
  const block = featureBlock(feature, truck?.feature_overrides, truckPlanSwitch(truck, catalog, now))
  return { allowed: block === null, block, upgradeTo: block === 'plan' ? upgradePlanFor(catalog, feature) : null }
}

/** canAccess with the truck's effective plan — the server routes' one call. */
export function truckCan(truck: TruckAccessFields | null | undefined, catalog: PlanCatalog, feature: Feature, now: Date = new Date()): boolean {
  return canAccess(feature, truck?.feature_overrides, truckPlanSwitch(truck, catalog, now))
}

/** Is Pay at Hatch offered to this truck's customers (the plan flag, the switch and the override, in that one order)? */
export function payAtHatchOn(truck: TruckAccessFields | null | undefined, catalog: PlanCatalog, now: Date = new Date()): boolean {
  return truckCan(truck, catalog, PAY_AT_HATCH_FEATURE, now)
}

/** What the upgrade prompt shows about a plan, in the truck's country (sent to surfaces without the catalogue). */
export interface PlanPromptPlan { key: PlanKey; name: string; description: string; monthlyMinor: number | null }

/**
 * The features the truck's EFFECTIVE PLAN switches off (an override decides nothing here — it travels with the truck),
 * each with the plan its prompt names. The server sends this as `plan_blocks` to the surfaces that have no catalogue
 * (the kitchen dashboard and KDS); lib/useFeatures.ts reads it.
 */
export type PlanBlocks = Partial<Record<Feature, { upgradeTo: PlanPromptPlan | null }>>
export function planBlocks(truck: TruckPlanFields | null | undefined, catalog: PlanCatalog, countryCode: string | null | undefined, now: Date = new Date()): PlanBlocks {
  const allows = truckPlanSwitch(truck, catalog, now)
  const out: PlanBlocks = {}
  for (const f of FEATURES) {
    if (allows(f)) continue
    const up = upgradePlanFor(catalog, f)
    out[f] = { upgradeTo: up ? promptPlan(catalog, up, countryCode) : null }
  }
  return out
}

/** A plan as the prompt shows it, with its standard monthly price in the country (null without a price row). */
export function promptPlan(catalog: PlanCatalog, plan: PlanRow, countryCode: string | null | undefined): PlanPromptPlan {
  return { key: plan.key, name: plan.name, description: plan.description, monthlyMinor: planPriceFor(catalog, plan.key, countryCode)?.monthlyMinor ?? null }
}

// ── trial length (Stage A2) ─────────────────────────────────────────────────────────────────────────────────────────

/** YYYY-MM-DD plus whole calendar months, clamped to the month's last day (31 Oct + 4 → 28/29 Feb). */
export function addMonthsYmd(ymd: string, months: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const first = new Date(Date.UTC(y, (m - 1) + months, 1))
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
}

/**
 * 🔴 A TRIAL'S END DATE: `plan.trialMonths` after `start`, at the END OF THAT DAY (23:59:59) in the truck's time zone,
 * as an ISO instant — or null when the plan is not a trial or has no length (then the trial has no end date).
 * Signup (lib/provision-truck.ts) and Admin's "Start trial" both use it.
 */
export function trialEndFor(plan: PlanRow, start: Date, timeZone: string): string | null {
  if (!plan.isTrial || !plan.trialMonths) return null
  const endDay = addMonthsYmd(localDateOfInstant(start, timeZone), plan.trialMonths)
  return new Date(instantOfLocal(endDay, '23:59:59', timeZone)).toISOString()
}

/**
 * Admin "Extend trial by 1 month" (Stage B): the end date `months` calendar months after the CURRENT end date, at the end
 * of that day in the truck's zone (23:59:59, the same rule as trialEndFor). The current end's own local day is the base,
 * so 31 January + 1 → 28/29 February (addMonthsYmd clamps).
 */
export function extendTrialEnd(currentEndIso: string, months: number, timeZone: string): string {
  const endDay = addMonthsYmd(localDateOfInstant(new Date(currentEndIso), timeZone), months)
  return new Date(instantOfLocal(endDay, '23:59:59', timeZone)).toISOString()
}

/** The trial plan's length, for copy ("a 4-month free trial") — the signup-default plan's when it is a trial. */
export function trialMonthsOf(plan: PlanRow | null | undefined): number | null {
  return plan && plan.isTrial && plan.trialMonths ? plan.trialMonths : null
}

// ── mapping database rows (shared by the server loader and the harnesses) ────────────────────────────────────────────
type Row = Record<string, unknown>
const bool = (r: Row, k: string) => r[k] === true
const int = (r: Row, k: string) => { const v = r[k]; if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`[plans] ${k} is not a number`); return v }

export function mapPlanRow(r: Row): PlanRow {
  return {
    key: String(r.key), name: String(r.name ?? ''), description: String(r.description ?? ''), sortOrder: int(r, 'sort_order'),
    isPublic: bool(r, 'is_public'), isInternal: bool(r, 'is_internal'), isTrial: bool(r, 'is_trial'),
    isSignupDefault: bool(r, 'is_signup_default'), isExpiryFallback: bool(r, 'is_expiry_fallback'), isDemo: bool(r, 'is_demo'),
    payAtHatchAllowed: bool(r, 'pay_at_hatch_allowed'), active: bool(r, 'active'),
    includedVans: int(r, 'included_vans'),
    trialMonths: r.trial_months === null || r.trial_months === undefined ? null : int(r, 'trial_months'),
    isHighlighted: bool(r, 'is_highlighted'),
    subtitle: typeof r.subtitle === 'string' && r.subtitle.trim() ? r.subtitle : null,
  }
}

export function mapFeatureRow(r: Row): PlanFeatureRow {
  return { planKey: String(r.plan_key), feature: String(r.feature), enabled: bool(r, 'enabled') }
}

export function mapPriceRow(r: Row): PlanPrice {
  const inc = r.included_online_minor
  return {
    planKey: String(r.plan_key), countryCode: String(r.country_code),
    monthlyMinor: int(r, 'monthly_minor'),
    includedOnlineMinor: inc === null || inc === undefined ? null : int(r, 'included_online_minor'),
    feeBps: int(r, 'fee_bps'), extraVanMonthlyMinor: int(r, 'extra_van_monthly_minor'),
  }
}

export const PLAN_COLUMNS = 'key, name, description, sort_order, is_public, is_internal, is_trial, is_signup_default, is_expiry_fallback, is_demo, pay_at_hatch_allowed, active, included_vans, trial_months, is_highlighted, subtitle'
export const PLAN_FEATURE_COLUMNS = 'plan_key, feature, enabled'
export const PLAN_PRICE_COLUMNS = 'plan_key, country_code, monthly_minor, included_online_minor, fee_bps, extra_van_monthly_minor'
