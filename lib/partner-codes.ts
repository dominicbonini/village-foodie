// lib/partner-codes.ts — partners-2 (16 November 2026, docs/partners-2-report.md): PARTNER CODES, THEIR DEALS AND THEIR
// COMMISSION — the pure rules. No database, no React: the signup route, the setup route, Admin › Partners and the harness
// (scripts/partners-2.cjs) all call these, so a code means the same thing everywhere.
//
//   • A code is DATA (public.partner_codes): its deal (extra trial months; a percentage off a chosen plan — or any paid plan — for
//     N months; or a fixed monthly price on a chosen plan for N months: partners offer, 16 November 2026), its validity
//     (valid_until, max_uses, active) and its commission terms (pct_year1 / pct_year2 of plan fees). Nothing is hardcoded.
//   • A code is matched case-insensitively, ignoring spaces ("ncass 2026" = "NCASS2026").
//   • The deal is applied through the EXISTING plan mechanisms only: an extra-months deal extends the trial end exactly as
//     Admin's "Extend trial" does (lib/plans.ts extendTrialEnd); a percentage or fixed-price deal is the existing promotional
//     monthly price (trucks.plan_price_override_minor / _until), set when the truck MOVES ONTO A PAID PLAN (Dominic's decision 1 =
//     A), from that day for N months, computed from the country's price of that plan (priceOverrideFor below).
//   • 🔴 NOTHING HAS A DEFAULT: no code is created automatically, and every code states its deal and its commission.
//   • Commission is a percentage of the PLAN FEES a referred truck actually paid (billing_charges.plan_minor on a paid
//     invoice): year 1 / year 2 counted from that truck's signup. Nothing else (usage fees, surcharges, vans) earns any.
import { addMonthsYmd, extendTrialEnd } from '@/lib/plans'

export const DEAL_TYPES = ['extra_trial_months', 'percent_off', 'fixed_price'] as const
export type DealType = (typeof DEAL_TYPES)[number]

export interface PartnerCode {
  id: string
  code: string
  partnerId: string
  partnerName: string
  dealType: DealType
  /** extra_trial_months: the months added; percent_off: the percentage (1–100). */
  dealValue: number
  /** percent_off / fixed_price: how many months the reduced price lasts. */
  dealMonths: number | null
  /** percent_off / fixed_price: the plan the deal is for (null = any paid plan; fixed_price always names one). */
  dealPlanKey?: string | null
  /** fixed_price only: the currency of dealValue (minor units). */
  dealCurrency?: string | null
  /** Last day the code can be used (YYYY-MM-DD, inclusive), or null. */
  validUntil: string | null
  maxUses: number | null
  uses: number
  active: boolean
  pctYear1: number
  pctYear2: number
  basis: 'plan_fees'
}

/** The form a code is stored and compared in. */
export const normaliseCode = (s: unknown): string => String(s ?? '').replace(/\s+/g, '').toUpperCase().slice(0, 40)

export type CodeState = 'ok' | 'invalid' | 'expired'

/**
 * Can this code be used today? `today` is YYYY-MM-DD. Unknown, inactive or used-up codes are 'invalid' (the visitor sees
 * "That code isn't valid."); past their last day, 'expired' ("That code has expired.").
 */
export function codeState(c: PartnerCode | null | undefined, today: string): CodeState {
  if (!c || !c.active) return 'invalid'
  if (c.validUntil && c.validUntil.slice(0, 10) < today) return 'expired'
  if (c.maxUses !== null && c.uses >= c.maxUses) return 'invalid'
  return 'ok'
}

export type DealArgs =
  | { kind: 'extraMonths'; months: number }
  | { kind: 'percentOff'; pct: number; months: number; planKey: string | null }
  | { kind: 'fixedPrice'; priceMinor: number; currency: string; months: number; planKey: string }
type DealFields = Pick<PartnerCode, 'dealType' | 'dealValue' | 'dealMonths'> & Partial<Pick<PartnerCode, 'dealPlanKey' | 'dealCurrency'>>

/** The deal, as the arguments the wording needs ("2 extra months free" / "20% off Pro for 6 months" / "Pro at £19 a month for 6 months"). */
export function dealArgs(c: DealFields): DealArgs {
  if (c.dealType === 'extra_trial_months') return { kind: 'extraMonths', months: c.dealValue }
  if (c.dealType === 'fixed_price') return { kind: 'fixedPrice', priceMinor: c.dealValue, currency: c.dealCurrency ?? '', months: c.dealMonths ?? 0, planKey: c.dealPlanKey ?? '' }
  return { kind: 'percentOff', pct: c.dealValue, months: c.dealMonths ?? 0, planKey: c.dealPlanKey ?? null }
}

/** A money amount in minor units, as `locale` writes it (two decimals unless whole). */
export function formatMinor(minor: number, currency: string, locale = 'en-GB'): string {
  const whole = minor % 100 === 0
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(minor / 100)
  } catch { return `${(minor / 100).toFixed(whole ? 0 : 2)} ${currency}` }
}

/** English deal text, for Admin (the signup page and the emails use the translated words). `planName` names a plan key. */
export function dealTextEn(c: DealFields, planName: (key: string) => string = k => k): string {
  const d = dealArgs(c)
  const mo = (n: number) => `${n} month${n === 1 ? '' : 's'}`
  if (d.kind === 'extraMonths') return `${d.months} extra month${d.months === 1 ? '' : 's'} free`
  if (d.kind === 'fixedPrice') return `${planName(d.planKey)} at ${formatMinor(d.priceMinor, d.currency)} a month for ${mo(d.months)}`
  return d.planKey ? `${d.pct}% off ${planName(d.planKey)} for ${mo(d.months)}` : `${d.pct}% off for ${mo(d.months)}`
}

/** Does this code's deal change the price of a paid plan (applied when the truck moves onto one)? */
export const isPriceDeal = (dealType: string) => dealType === 'percent_off' || dealType === 'fixed_price'

/** An extra-months deal: the trial's new end — Admin's "Extend trial" rule (lib/plans.ts extendTrialEnd). */
export function extendedTrialEnd(trialEndIso: string, c: Pick<PartnerCode, 'dealType' | 'dealValue'>, timeZone: string): string {
  if (c.dealType !== 'extra_trial_months') throw new Error('[partner-codes] not an extra-months deal')
  return extendTrialEnd(trialEndIso, c.dealValue, timeZone)
}

/** The last day (inclusive) of a deal that starts on `startYmd` and lasts `months` months — as lib/plans.ts truckPlanPrice reads it. */
export function dealUntil(startYmd: string, months: number): string {
  const end = addMonthsYmd(startYmd, months)                       // the same day N months on…
  return new Date(Date.parse(`${end}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)   // …the day before it
}

/**
 * A percentage deal as the existing promotional monthly price: the plan's standard monthly price less the percentage
 * (rounded to the minor unit), from `startYmd` for `dealMonths` months — `until` is the last day it applies (inclusive, as
 * lib/plans.ts truckPlanPrice reads it).
 */
export function percentOffOverride(monthlyMinor: number, c: Pick<PartnerCode, 'dealType' | 'dealValue' | 'dealMonths'>, startYmd: string):
  { minor: number; until: string } {
  if (c.dealType !== 'percent_off' || !c.dealMonths) throw new Error('[partner-codes] not a percentage deal with a length')
  return { minor: Math.round(monthlyMinor * (100 - c.dealValue) / 100), until: dealUntil(startYmd, c.dealMonths) }
}

/**
 * Decision 1 = A: the promotional price a price deal gives the plan a truck has just MOVED ONTO, from `startYmd`. Null with the
 * reason when it does not apply (yet): the deal names another plan, the plan has no monthly price in the truck's country, a
 * fixed price is in another currency, or would not be lower than the standard price. A redemption that does not apply stays
 * pending and is tried again at the truck's next plan change.
 */
export function priceOverrideFor(deal: DealFields, plan: { key: string; isTrial: boolean }, price: { monthlyMinor: number; currency: string } | null,
  startYmd: string): { ok: true; minor: number; until: string } | { ok: false; reason: string } {
  if (!isPriceDeal(deal.dealType) || !deal.dealMonths) return { ok: false, reason: 'not a price deal' }
  if (plan.isTrial) return { ok: false, reason: 'still on a trial' }
  if (deal.dealPlanKey && deal.dealPlanKey !== plan.key) return { ok: false, reason: `the deal is for ${deal.dealPlanKey}, the truck moved to ${plan.key}` }
  if (!price || !(price.monthlyMinor > 0)) return { ok: false, reason: `${plan.key} has no monthly price here` }
  const until = dealUntil(startYmd, deal.dealMonths)
  if (deal.dealType === 'percent_off') return { ok: true, minor: Math.round(price.monthlyMinor * (100 - deal.dealValue) / 100), until }
  if ((deal.dealCurrency ?? '').toUpperCase() !== price.currency.toUpperCase()) return { ok: false, reason: `the fixed price is in ${deal.dealCurrency}, the truck pays in ${price.currency}` }
  if (deal.dealValue >= price.monthlyMinor) return { ok: false, reason: 'the fixed price is not lower than the standard price' }
  return { ok: true, minor: deal.dealValue, until }
}

// ── the offer: a partner with no usable code is never queued or sent ─────────────────────────────────────────────────────

export interface CodeRowLike { id: string; partner_id: string; active: boolean; valid_until: string | null; max_uses: number | null; created_at?: string | null }

/**
 * The partner's OFFER: its newest code that can be used today (active, not past its last day, not used up). Null = the partner
 * "Needs offer" — never queued, never sent (Dominic, 16 November 2026). Every code carries a deal and a commission (the database
 * requires both; neither has a default).
 */
export function offerCodeFor<C extends CodeRowLike>(codes: C[], partnerId: string, uses: Record<string, number>, today: string): C | null {
  const ok = codes.filter(c => c.partner_id === partnerId && c.active && !(c.valid_until && c.valid_until.slice(0, 10) < today)
    && !(c.max_uses !== null && c.max_uses !== undefined && (uses[c.id] ?? 0) >= c.max_uses))
  ok.sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
  return ok[0] ?? null
}

// ── commission ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** One plan-fee payment by a referred truck: the plan part of a PAID invoice. */
export interface PlanFeePaid { truckId: string; paidAt: string; currency: string; planMinor: number }

/** Each referred truck's signup instant (its year 1 / year 2 start). */
export type SignupAt = Record<string, string>

export interface CommissionLine { month: string; currency: string; feesMinor: number; owedMinor: number }

/**
 * Commission owed per calendar month (of the payment, UTC) and currency: pct_year1 of each payment made in the truck's
 * first 12 months from signup, pct_year2 in months 13–24, nothing after. Rounded per payment to the minor unit.
 */
export function commissionByMonth(paid: PlanFeePaid[], signupAt: SignupAt, c: Pick<PartnerCode, 'pctYear1' | 'pctYear2'>): CommissionLine[] {
  const out = new Map<string, CommissionLine>()
  for (const p of paid) {
    const start = signupAt[p.truckId]
    if (!start || p.planMinor <= 0) continue
    const s = start.slice(0, 10), at = p.paidAt.slice(0, 10)
    const pct = at < addMonthsYmd(s, 12) ? c.pctYear1 : at < addMonthsYmd(s, 24) ? c.pctYear2 : 0
    if (!pct) continue
    const month = at.slice(0, 7)
    const key = `${month}|${p.currency}`
    const line = out.get(key) ?? { month, currency: p.currency, feesMinor: 0, owedMinor: 0 }
    line.feesMinor += p.planMinor
    line.owedMinor += Math.round(p.planMinor * pct / 100)
    out.set(key, line)
  }
  return [...out.values()].sort((a, b) => a.month.localeCompare(b.month) || a.currency.localeCompare(b.currency))
}

/** Owed, paid and outstanding per month and currency — the partner's ledger. */
export function ledger(owed: CommissionLine[], payments: { month: string; currency: string; amountMinor: number }[]):
  { month: string; currency: string; owedMinor: number; paidMinor: number; outstandingMinor: number }[] {
  const rows = new Map<string, { month: string; currency: string; owedMinor: number; paidMinor: number; outstandingMinor: number }>()
  const at = (month: string, currency: string) => {
    const k = `${month}|${currency}`
    if (!rows.has(k)) rows.set(k, { month, currency, owedMinor: 0, paidMinor: 0, outstandingMinor: 0 })
    return rows.get(k)!
  }
  for (const o of owed) at(o.month, o.currency).owedMinor += o.owedMinor
  for (const p of payments) at(p.month.slice(0, 7), p.currency).paidMinor += p.amountMinor
  for (const r of rows.values()) r.outstandingMinor = r.owedMinor - r.paidMinor
  return [...rows.values()].sort((a, b) => a.month.localeCompare(b.month) || a.currency.localeCompare(b.currency))
}
