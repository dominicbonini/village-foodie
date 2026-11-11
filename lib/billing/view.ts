// lib/billing/view.ts — billing-2 (11 November 2026; docs/billing-2-report.md): WHAT THE BILLING SCREENS, NOTICES AND EMAILS
// SAY, as data. PURE AND CLIENT-SAFE. The server builds it from the engine's facts (app/api/manage/billing); the Billing tab,
// the notice strip and the email schedule read ONLY this — codes, dates (YYYY-MM-DD, the truck's own calendar) and amounts in
// minor units. The words are the screens' (messages `billing`, `emailBilling`); nothing here is a sentence (language rule 7).
import type { PlanCatalog } from '@/lib/plans'
import { publicPlans, planPriceFor } from '@/lib/plans'
import {
  billingStatusOf, arrangementOf, failureTimeline, oldestFailure, planLevelAt, trialEndOf, daysInPeriod, daysLeftFrom, periodOf, nextPeriod,
  addDaysYmd, type BillingContext, type PlanHistoryRow, type PaymentMethodState, type PaymentMethodType,
} from '@/lib/billing/rules'
import { localDateOfInstant, instantOfLocal } from '@/lib/time-utils'
import type { InvoiceRow, ChargeRow, UsageRow, TruckBillingRow, BillingEmailKind, BillingEmailRow } from '@/lib/billing/store-types'

export type NoticeKind = 'trial_ends_soon' | 'trial_ends_tomorrow' | 'all_set' | 'payment_failed' | 'paused' | 'trial_ended'

export interface NoticeView {
  kind: NoticeKind
  /** A, C: the trial's end / the plan's start. */
  date?: string
  planKey?: string
  /** D: the last day to pay. E: the amount and the suspension-warning date. */
  lastDay?: string
  amountMinor?: number
  suspendWarningDate?: string
  /** "card" everywhere; "payment method" in Brazil with Pix (D, E and the emails). */
  method: 'card' | 'payment_method'
  dismissible: boolean
}

export interface InvoiceView {
  id: string
  /** The invoice's local date. */
  date: string
  kind: 'monthly' | 'trial_end' | 'upgrade'
  /** monthly: the plan's month and the fees' month ("December plan, November fees"); trial_end: the month ("Rest of November");
   *  upgrade: the new plan ("Switch to Unlimited"). */
  planMonth: string
  usageMonth: string | null
  toPlanKey: string | null
  amountMinor: number
  status: 'paid' | 'unpaid' | 'overdue'
  pdfUrl: string | null
  payUrl: string | null
  lateFeeMinor: number
}

export interface PlanChoiceView { key: string; monthlyMinor: number; allowanceMinor: number | null; feeBps: number; current: boolean }

export interface BillingScreenView {
  visible: true
  mode: 'trial' | 'paying'
  currency: string
  /** Today in the truck's calendar. */
  today: string
  plan: { key: string; onTrial: boolean; monthlyMinor: number; allowanceMinor: number | null; feeBps: number }
  trial: null | {
    endDate: string
    afterPlanKey: string
    afterMonthlyMinor: number
    afterAllowanceMinor: number | null
    afterFeeBps: number
    /** What is charged the day the trial ends (the rest of that month), null on a free plan. */
    restOfMonth: { amountMinor: number; month: string } | null
    /** The first 1st after the trial. */
    nextFirst: string
  }
  nextPayment: null | {
    date: string
    planKey: string
    planMonth: string
    planMinor: number
    usageMonth: string
    usageMinor: number
    allowanceMinor: number | null
    feeBps: number
    vansMinor: number
    surchargeMinor: number
    carriedMinor: number
    totalMinor: number
  }
  paymentMethod: { state: PaymentMethodState; type: PaymentMethodType | null; brand: string | null; last4: string | null; label: string | null; lastFailed: boolean }
  pixOffered: boolean
  failure: null | { amountMinor: number; lastDay: string; pauseDay: string; suspendWarningDate: string; paused: boolean; payUrl: string | null }
  preOrderPayment: { value: 'online' | 'at_truck'; onlineAllowed: boolean }
  invoices: InvoiceView[]
  plans: PlanChoiceView[]
  pendingPlan: { key: string; from: string } | null
  /** billing-3: the free trial is over and no payment method is on file — online ordering is paused (notice F; the Payment method
   *  card's "No card added. Add one to turn online ordering back on."). */
  trialEndedNoCard: boolean
  notice: NoticeView | null
}

const dayDiff = (a: string, b: string) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86_400_000)

/** "visa •••• 4242" (lib/billing/processor.ts) → brand and last four. */
export function cardParts(label: string | null): { brand: string | null; last4: string | null } {
  const m = /^(.+?) •••• (\d{4})$/.exec(label ?? '')
  return m ? { brand: m[1], last4: m[2] } : { brand: null, last4: null }
}

export interface ScreenInput {
  ctx: BillingContext
  catalog: PlanCatalog
  history: PlanHistoryRow[]
  truckBilling: TruckBillingRow | null
  invoices: InvoiceRow[]
  charges: ChargeRow[]
  /** This month's usage so far (computeUsage, not saved). */
  usageSoFar: UsageRow | null
  vanCount: number
}

/** 🔴 THE SCREEN, AS DATA. `ctx.switchOn` is true here — the caller decides visibility (billing on, or a billing_test truck). */
export function billingScreenOf(i: ScreenInput): BillingScreenView {
  const { ctx, catalog } = i
  const truck = ctx.truck
  const tz = truck.timezone || 'Europe/London'
  const now = ctx.now.getTime()
  const today = localDateOfInstant(ctx.now, tz)
  const pin = { truck, history: i.history, catalog, countryCode: truck.country ?? ctx.country.countryCode, tz }
  const level = planLevelAt(pin, now)
  const tb = i.truckBilling
  const isPix = tb?.paymentMethodType === 'pix'
  const method: NoticeView['method'] = isPix ? 'payment_method' : 'card'
  const pmValid = tb?.paymentMethodState === 'valid'

  // ── the plan, and the trial ──
  const trialEnd = trialEndOf(truck, catalog)
  const onTrial = level.trialling
  let trial: BillingScreenView['trial'] = null
  if (onTrial && trialEnd) {
    const x = Date.parse(trialEnd)
    const after = planLevelAt(pin, x)
    const month = periodOf(trialEnd, tz)
    const days = daysLeftFrom(x, month, tz)
    const amount = Math.floor((after.monthlyMinor * days) / daysInPeriod(month))
    trial = {
      endDate: localDateOfInstant(trialEnd, tz), afterPlanKey: after.planKey, afterMonthlyMinor: after.monthlyMinor,
      afterAllowanceMinor: after.price ? after.price.includedOnlineMinor : null, afterFeeBps: after.price ? after.price.feeBps : 0,
      restOfMonth: after.monthlyMinor > 0 && amount > 0 ? { amountMinor: amount, month } : null, nextFirst: nextPeriod(month),
    }
  }

  // ── the next 1st (paying) ──
  let nextPayment: BillingScreenView['nextPayment'] = null
  const pending = tb?.pendingPlanKey && tb.pendingPlanFrom ? { key: tb.pendingPlanKey, from: tb.pendingPlanFrom } : null
  if (!onTrial) {
    const thisMonth = periodOf(ctx.now, tz)
    const next = nextPeriod(thisMonth)
    const nextPlanKey = pending && pending.from <= next ? pending.key : level.planKey
    const nextPrice = planPriceFor(catalog, nextPlanKey, pin.countryCode)
    const planMinor = nextPlanKey === level.planKey ? level.monthlyMinor : nextPrice?.monthlyMinor ?? 0
    const vansMinor = nextPrice ? Math.max(0, i.vanCount - level.includedVans) * nextPrice.extraVanMonthlyMinor : 0
    const usageMinor = i.usageSoFar?.feeBilledMinor ?? 0
    const surchargeMinor = i.usageSoFar?.surchargeMinor ?? 0
    const carriedMinor = i.charges.filter(c => c.state === 'carried' && !c.carriedInto).reduce((s, c) => s + c.carriedOutMinor, 0)
    nextPayment = {
      date: next, planKey: nextPlanKey, planMonth: next, planMinor, usageMonth: thisMonth, usageMinor,
      allowanceMinor: level.price ? level.price.includedOnlineMinor : null, feeBps: level.price ? level.price.feeBps : 0,
      vansMinor, surchargeMinor, carriedMinor, totalMinor: planMinor + vansMinor + usageMinor + surchargeMinor + carriedMinor,
    }
  }

  // ── the failure (the 5-full-day rule) ──
  const unpaid = i.invoices.filter(v => v.status === 'open' || v.status === 'failed')
  const failed = unpaid.filter(v => v.firstFailedAt).sort((a, b) => String(a.firstFailedAt).localeCompare(String(b.firstFailedAt)))
  const fl = oldestFailure(ctx)
  const failure: BillingScreenView['failure'] = fl && failed[0] ? {
    amountMinor: failed.reduce((s, v) => s + v.amountMinor, 0), lastDay: fl.lastDay, pauseDay: fl.pauseDay, suspendWarningDate: fl.suspendWarningDate,
    paused: now >= Date.parse(fl.pauseAt), payUrl: failed[0].hostedInvoiceUrl,
  } : null

  // ── invoices ──
  const chargeOf = new Map(i.charges.map(c => [c.id, c]))
  const invoices: InvoiceView[] = i.invoices
    .filter(v => v.status === 'paid' || v.status === 'open' || v.status === 'failed')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(v => {
      const c = chargeOf.get(v.chargeId)
      const overdue = !!v.firstFailedAt && v.status !== 'paid'
        && now >= Date.parse(failureTimeline(v.firstFailedAt, tz, ctx.pauseAfterDays, ctx.suspendWarningDays ?? 6).pauseAt)
      return {
        id: v.id, date: localDateOfInstant(v.finalizedAt ?? v.createdAt, tz), kind: c?.kind ?? 'monthly', planMonth: v.period,
        usageMonth: c?.kind === 'monthly' && c.usageFeeMinor > 0 ? c.usagePeriod : null, toPlanKey: c?.kind === 'upgrade' ? c.planKey : null,
        amountMinor: v.amountMinor, status: v.status === 'paid' ? 'paid' : overdue ? 'overdue' : 'unpaid',
        pdfUrl: v.invoicePdfUrl, payUrl: v.status === 'paid' ? null : v.hostedInvoiceUrl, lateFeeMinor: v.lateFeeMinor ?? 0,
      }
    })

  // ── the plans to change to ──
  const plans: PlanChoiceView[] = publicPlans(catalog)
    .map(p => ({ p, price: planPriceFor(catalog, p.key, pin.countryCode) }))
    .filter(x => x.price && x.price.offered !== false)
    .map(x => ({ key: x.p.key, monthlyMinor: x.price!.monthlyMinor, allowanceMinor: x.price!.includedOnlineMinor, feeBps: x.price!.feeBps, current: x.p.key === level.planKey && !onTrial }))

  const arr = arrangementOf(ctx)
  const label = tb?.paymentMethodLabel ?? null
  const pmState = tb?.paymentMethodState ?? 'none'
  const trialEndedNoCard = !onTrial && !!trialEnd && now >= Date.parse(trialEnd) && pmState !== 'valid' && pmState !== 'pending'
  const view: BillingScreenView = {
    visible: true, mode: onTrial ? 'trial' : 'paying', currency: truck.currency ?? 'GBP', today,
    plan: { key: level.planKey, onTrial, monthlyMinor: level.monthlyMinor, allowanceMinor: level.price ? level.price.includedOnlineMinor : null, feeBps: level.price ? level.price.feeBps : 0 },
    trial, nextPayment,
    paymentMethod: { state: tb?.paymentMethodState ?? 'none', type: tb?.paymentMethodType ?? null, ...cardParts(label), label, lastFailed: failed.length > 0 },
    pixOffered: (truck.currency ?? '') === 'BRL',
    failure,
    preOrderPayment: { value: arr?.postPay ? 'at_truck' : 'online', onlineAllowed: ctx.countryBilling?.paymentModel !== 'billed_at_truck' },
    invoices, plans, pendingPlan: pending, trialEndedNoCard, notice: null,
  }
  view.notice = noticeOf(view, { pmValid, method })
  return view
}

/**
 * 🔴 ONE BILLING NOTICE AT A TIME (every Manage tab except Billing; the owner only). Most urgent first:
 *   E paused → D payment failed → F trial over, no card (billing-3) → B trial ends tomorrow, no card → A trial ends within 7 days,
 *   no card → C trial ending, card added.
 */
export function noticeOf(v: Omit<BillingScreenView, 'notice'>, o: { pmValid: boolean; method: NoticeView['method'] }): NoticeView | null {
  if (v.failure?.paused) return { kind: 'paused', amountMinor: v.failure.amountMinor, suspendWarningDate: v.failure.suspendWarningDate, method: o.method, dismissible: false }
  if (v.failure) return { kind: 'payment_failed', lastDay: v.failure.lastDay, method: o.method, dismissible: false }
  if (v.trialEndedNoCard) return { kind: 'trial_ended', method: o.method, dismissible: false }
  if (v.trial) {
    const left = dayDiff(v.today, v.trial.endDate)
    if (left < 0 || left > 7) return null
    if (o.pmValid) return { kind: 'all_set', planKey: v.trial.afterPlanKey, date: addDaysYmd(v.trial.endDate, 1), method: o.method, dismissible: true }
    if (left === 1) return { kind: 'trial_ends_tomorrow', date: v.trial.endDate, method: o.method, dismissible: false }
    return { kind: 'trial_ends_soon', date: v.trial.endDate, method: o.method, dismissible: true }
  }
  return null
}

// ── the email schedule ──────────────────────────────────────────────────────────────────────────────────────────────

export interface EmailDue {
  kind: BillingEmailKind
  /** Once per (truck, kind, ref): the invoice for a payment email, the trial's end for a trial email. */
  ref: string
  params: { amountMinor?: number; lastDay?: string; suspendWarningDate?: string; trialEnd?: string; planKey?: string; restAmountMinor?: number;
    restMonth?: string; nextFirst?: string; monthlyMinor?: number; feeBps?: number; method: 'card' | 'payment_method'; hasPaymentMethod?: boolean; payUrl?: string | null }
}

/** Scheduled emails go from 08:00 in the truck's zone; the failure email goes as soon as the failure is known. */
export const EMAIL_FROM_HOUR = '08:00:00'

/**
 * 🔴 WHICH BILLING EMAILS ARE DUE NOW (billing-2 item 5). Each once per invoice (or per trial end); an email is only due ON ITS
 * DAY (a missed day is skipped, never sent late), and nothing is due once the invoice is paid (it is no longer unpaid).
 *   payment_failed  the failure day (or any day up to the last day, if the failure was learned late) — at once
 *   two_days_left   lastDay − 2        one_day_left   lastDay − 1        last_day   lastDay        paused   the pause day
 *   trial_7_days    trial end − 7, no payment method on file
 *   trial_1_day     trial end − 1 (either way: "add one" or "you're all set")
 */
export function emailsDue(i: { view: BillingScreenView; ctx: BillingContext; invoices: InvoiceRow[]; sent: BillingEmailRow[] }): EmailDue[] {
  const tz = i.ctx.truck.timezone || 'Europe/London'
  const now = i.ctx.now.getTime()
  const today = i.view.today
  const afterHour = now >= instantOfLocal(today, EMAIL_FROM_HOUR, tz)
  const sentKey = new Set(i.sent.map(e => `${e.kind}:${e.ref}`))
  const method: 'card' | 'payment_method' = i.view.paymentMethod.type === 'pix' ? 'payment_method' : 'card'
  const out: EmailDue[] = []
  const push = (d: EmailDue) => { if (!sentKey.has(`${d.kind}:${d.ref}`)) out.push(d) }

  const st = billingStatusOf(i.ctx)
  if (!st) return out
  for (const inv of i.invoices) {
    if (!(inv.status === 'open' || inv.status === 'failed') || !inv.firstFailedAt) continue
    const fl = failureTimeline(inv.firstFailedAt, tz, i.ctx.pauseAfterDays, i.ctx.suspendWarningDays ?? 6)
    const base = { amountMinor: inv.amountMinor, lastDay: fl.lastDay, suspendWarningDate: fl.suspendWarningDate, method, payUrl: inv.hostedInvoiceUrl }
    if (today >= fl.failDay && today <= fl.lastDay) push({ kind: 'payment_failed', ref: inv.id, params: base })
    if (!afterHour) continue
    if (today === addDaysYmd(fl.lastDay, -2)) push({ kind: 'two_days_left', ref: inv.id, params: base })
    if (today === addDaysYmd(fl.lastDay, -1)) push({ kind: 'one_day_left', ref: inv.id, params: base })
    if (today === fl.lastDay) push({ kind: 'last_day', ref: inv.id, params: base })
    if (today === fl.pauseDay && now >= Date.parse(fl.pauseAt)) push({ kind: 'paused', ref: inv.id, params: base })
  }
  const t = i.view.trial
  if (t && afterHour) {
    const ref = t.endDate
    const p = { trialEnd: t.endDate, planKey: t.afterPlanKey, monthlyMinor: t.afterMonthlyMinor, feeBps: t.afterFeeBps, restAmountMinor: t.restOfMonth?.amountMinor,
      restMonth: t.restOfMonth?.month, nextFirst: t.nextFirst, method, hasPaymentMethod: i.view.paymentMethod.state === 'valid' }
    if (today === addDaysYmd(t.endDate, -7) && !p.hasPaymentMethod) push({ kind: 'trial_7_days', ref, params: p })
    if (today === addDaysYmd(t.endDate, -1)) push({ kind: 'trial_1_day', ref, params: p })
  }
  return out
}

// ── the change-plan preview ─────────────────────────────────────────────────────────────────────────────────────────

export interface PlanChangePreview {
  direction: 'up' | 'down' | 'same' | 'in_trial'
  /** up: charged today for the rest of the month. */
  amountMinor: number
  month: string
  nextFirst: string
  toMonthlyMinor: number
  /** billing-3: 'in_trial' — the plan starts when the trial ends, on this date (the trial's last day). */
  trialEndDate?: string | null
}

/**
 * What "Switch to {plan}" will do (billing-2 item 3), from the same rules requestPlanChange charges by: up → the difference
 * for the rest of this month, from what this month is already paid at (its monthly charge, then any upgrade since); down →
 * from the next 1st, nothing refunded.
 */
export function planChangePreview(i: ScreenInput & { toPlanKey: string }): PlanChangePreview {
  const { ctx, catalog } = i
  const truck = ctx.truck
  const tz = truck.timezone || 'Europe/London'
  const now = ctx.now.getTime()
  const pin = { truck, history: i.history, catalog, countryCode: truck.country ?? ctx.country.countryCode, tz }
  const level = planLevelAt(pin, now)
  const month = periodOf(ctx.now, tz)
  const nextFirst = nextPeriod(month)
  const to = planPriceFor(catalog, i.toPlanKey, pin.countryCode)
  const toMonthlyMinor = to?.monthlyMinor ?? 0
  // billing-3 item 5: during the trial the choice starts when the trial ends — nothing is charged now (no amount box).
  if (level.trialling) {
    const end = trialEndOf(truck, catalog)
    return { direction: 'in_trial', amountMinor: 0, month, nextFirst, toMonthlyMinor, trialEndDate: end ? localDateOfInstant(end, tz) : null }
  }
  if (toMonthlyMinor < level.monthlyMinor) return { direction: 'down', amountMinor: 0, month, nextFirst, toMonthlyMinor }
  if (toMonthlyMinor === level.monthlyMinor) return { direction: 'same', amountMinor: 0, month, nextFirst, toMonthlyMinor }
  const monthly = i.charges.find(c => c.kind === 'monthly' && c.period === month)
  const ups = i.charges.filter(c => c.period === month && (c.kind === 'upgrade' || c.kind === 'trial_end'))
  // Already paid at: the monthly charge's plan, raised by every later trial-end / upgrade charge (each brought it to its plan's price).
  let paid = monthly ? monthly.planMinor : level.monthlyMinor
  for (const u of ups) paid = Math.max(paid, planPriceFor(catalog, u.planKey, pin.countryCode)?.monthlyMinor ?? paid)
  const days = daysLeftFrom(now, month, tz)
  return { direction: 'up', amountMinor: Math.max(0, Math.floor(((toMonthlyMinor - paid) * days) / daysInPeriod(month))), month, nextFirst, toMonthlyMinor }
}
