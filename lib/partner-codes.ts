// lib/partner-codes.ts — partners-2 (16 November 2026, docs/partners-2-report.md): PARTNER CODES, THEIR DEALS AND THEIR
// COMMISSION — the pure rules. No database, no React: the signup route, the setup route, Admin › Partners and the harness
// (scripts/partners-2.cjs) all call these, so a code means the same thing everywhere.
//
//   • A code is DATA (public.partner_codes): its deal (extra trial months, or a percentage off for N months), its validity
//     (valid_until, max_uses, active) and its commission terms (pct_year1 / pct_year2 of plan fees). Nothing is hardcoded.
//   • A code is matched case-insensitively, ignoring spaces ("ncass 2026" = "NCASS2026").
//   • The deal is applied through the EXISTING plan mechanisms only: an extra-months deal extends the trial end exactly as
//     Admin's "Extend trial" does (lib/plans.ts extendTrialEnd); a percentage deal is the existing promotional monthly price
//     (trucks.plan_price_override_minor / _until), computed from the country's price of a plan.
//   • Commission is a percentage of the PLAN FEES a referred truck actually paid (billing_charges.plan_minor on a paid
//     invoice): year 1 / year 2 counted from that truck's signup. Nothing else (usage fees, surcharges, vans) earns any.
import { addMonthsYmd, extendTrialEnd } from '@/lib/plans'

export const DEAL_TYPES = ['extra_trial_months', 'percent_off'] as const
export type DealType = (typeof DEAL_TYPES)[number]

export interface PartnerCode {
  id: string
  code: string
  partnerId: string
  partnerName: string
  dealType: DealType
  /** extra_trial_months: the months added; percent_off: the percentage (1–100). */
  dealValue: number
  /** percent_off only: how many months the reduced price lasts. */
  dealMonths: number | null
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

/** The deal, as the arguments the wording needs ("2 extra months free" / "20% off for 6 months"). */
export function dealArgs(c: Pick<PartnerCode, 'dealType' | 'dealValue' | 'dealMonths'>):
  { kind: 'extraMonths'; months: number } | { kind: 'percentOff'; pct: number; months: number } {
  return c.dealType === 'extra_trial_months'
    ? { kind: 'extraMonths', months: c.dealValue }
    : { kind: 'percentOff', pct: c.dealValue, months: c.dealMonths ?? 0 }
}

/** English deal text, for Admin (the signup page uses the translated messages). */
export function dealTextEn(c: Pick<PartnerCode, 'dealType' | 'dealValue' | 'dealMonths'>): string {
  const d = dealArgs(c)
  return d.kind === 'extraMonths'
    ? `${d.months} extra month${d.months === 1 ? '' : 's'} free`
    : `${d.pct}% off for ${d.months} month${d.months === 1 ? '' : 's'}`
}

/** An extra-months deal: the trial's new end — Admin's "Extend trial" rule (lib/plans.ts extendTrialEnd). */
export function extendedTrialEnd(trialEndIso: string, c: Pick<PartnerCode, 'dealType' | 'dealValue'>, timeZone: string): string {
  if (c.dealType !== 'extra_trial_months') throw new Error('[partner-codes] not an extra-months deal')
  return extendTrialEnd(trialEndIso, c.dealValue, timeZone)
}

/**
 * A percentage deal as the existing promotional monthly price: the plan's standard monthly price less the percentage
 * (rounded to the minor unit), from `startYmd` for `dealMonths` months — `until` is the last day it applies (inclusive, as
 * lib/plans.ts truckPlanPrice reads it).
 */
export function percentOffOverride(monthlyMinor: number, c: Pick<PartnerCode, 'dealType' | 'dealValue' | 'dealMonths'>, startYmd: string):
  { minor: number; until: string } {
  if (c.dealType !== 'percent_off' || !c.dealMonths) throw new Error('[partner-codes] not a percentage deal with a length')
  const minor = Math.round(monthlyMinor * (100 - c.dealValue) / 100)
  const end = addMonthsYmd(startYmd, c.dealMonths)                 // the same day N months on…
  const until = new Date(Date.parse(`${end}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)   // …the day before it
  return { minor, until }
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
