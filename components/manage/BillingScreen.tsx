'use client'
// components/manage/BillingScreen.tsx — billing-2 (11 November 2026; docs/billing-2-report.md): MANAGE › BILLING when billing is
// on (or for a billing_test truck), the Change plan modal, and the one billing notice the other tabs show.
// 🔴 VISIBILITY IS THE SERVER'S: /api/manage/billing answers { visible: false } for every other truck, and then nothing here renders —
// Manage › Billing and the notices stay exactly as today.
// 🔴 iOS (App Store 3.1.1, manual §40): "Facts about the product are permitted. Instructions to buy are not." Inside the iOS app
// (purchaseCtaAllowed() false) every button and link that adds a card, pays or changes plan is left out, and so is every sentence
// that tells the truck to do so; the facts (plan, dates, amounts, invoices, status) stay.
// Words: messages `billing`; plan names from the (localised) plan catalogue; dates, months, money and percentages through lib/time-utils and lib/money-format.
// The server sends values only (lib/billing/view.ts).
import { useCallback, useEffect, useState } from 'react'
import { useT } from '@/lib/i18n/use-t'
import '@/lib/i18n/catalog/billing'
import { nativeAuthHeader } from '@/lib/native/session'
import { purchaseCtaAllowed } from '@/lib/commerce-policy'
import { useCountrySettings } from '@/components/CountrySettingsProvider'
import { useTruckTime } from '@/components/TruckTimeContext'
import { usePlanCatalog } from '@/components/PlanCatalogProvider'
import { planByKey } from '@/lib/plans'
import { moneyFormatOf, planMoneyFormatOf } from '@/lib/country-settings-types'
import { formatMinor, formatWholeAmount, pctLabel } from '@/lib/money-format'
import { formatYmd, monthName } from '@/lib/time-utils'
import type { BillingScreenView, NoticeView, PlanChangePreview, InvoiceView } from '@/lib/billing/view'

type Loaded = { status: 'loading' } | { status: 'hidden' } | { status: 'error' } | { status: 'visible'; view: BillingScreenView }

async function call(token: string, action: string, extra: Record<string, unknown> = {}): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch('/api/manage/billing', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(await nativeAuthHeader()) }, body: JSON.stringify({ token, action, ...extra }),
  })
  let data: Record<string, unknown> = {}
  try { data = await res.json() } catch { /* reported by status */ }
  return { ok: res.ok, data }
}

/** The Billing tab's data. `hidden` = this truck sees today's Billing tab. Returning from Stripe's hosted card page
 *  (?setup=cs_…) records the card first, then drops the parameter from the address bar. */
export function useBillingScreen(token: string) {
  const [state, setState] = useState<Loaded>({ status: 'loading' })
  useEffect(() => {
    let off = false
    const qs = new URLSearchParams(window.location.search)
    const sessionId = qs.get('setup')
    const run = async () => {
      if (sessionId) {
        qs.delete('setup')
        window.history.replaceState(null, '', `${window.location.pathname}${qs.toString() ? `?${qs}` : ''}`)
        const r = await call(token, 'setup_return', { sessionId })
        if (!off && r.ok && r.data.visible) { setState({ status: 'visible', view: r.data as unknown as BillingScreenView }); return }
      }
      const r = await call(token, 'view')
      if (off) return
      if (!r.ok) setState({ status: 'error' })
      else setState(r.data.visible ? { status: 'visible', view: r.data as unknown as BillingScreenView } : { status: 'hidden' })
    }
    void run()
    return () => { off = true }
  }, [token])
  const setView = useCallback((view: BillingScreenView) => setState({ status: 'visible', view }), [])
  return { state, setView }
}

/** The one billing notice for the other tabs (null for every truck billing is not shown to). */
export function useBillingNotice(token: string): NoticeView | null {
  const [notice, setNotice] = useState<NoticeView | null>(null)
  useEffect(() => {
    let off = false
    call(token, 'notice').then(r => { if (!off && r.ok && r.data.visible) setNotice((r.data.notice as NoticeView | null) ?? null) })
    return () => { off = true }
  }, [token])
  return notice
}

const BRAND: Record<string, string> = { visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', discover: 'Discover', jcb: 'JCB', diners: 'Diners Club', unionpay: 'UnionPay', cartes_bancaires: 'Cartes Bancaires', eftpos_au: 'eftpos' }

function useWords() {
  const t = useT('billing')
  // Plan names from the catalogue, already in the truck's language (components/PlanCatalogProvider → lib/plan-names.ts).
  const catalog = usePlanCatalog()
  const country = useCountrySettings()
  const time = useTruckTime()
  const money = moneyFormatOf(country)
  const planMoney = planMoneyFormatOf(country)
  return {
    t,
    plan: (key: string | null | undefined) => (key ? planByKey(catalog, key)?.name ?? key : ''),
    amount: (minor: number) => formatMinor(minor, money),
    price: (minor: number) => formatWholeAmount(minor, planMoney),
    allowance: (minor: number | null) => (minor === null ? '' : formatWholeAmount(minor, planMoney)),
    fee: (bps: number) => pctLabel(bps / 100, { locale: country.locale }),
    date: (ymd: string) => formatYmd(ymd, time, { day: 'numeric', month: 'long' }),
    month: (ymd: string) => monthName(ymd, country.locale, 'long'),
  }
}

/** The notice strip — the page's one notification mechanism (amber; green for "all set"), ✕ where it may be dismissed. */
export function BillingNoticeStrip({ notice, onOpen }: { notice: NoticeView; onOpen: () => void }) {
  const w = useWords()
  const [dismissed, setDismissed] = useState(false)
  // iOS: every billing notice's sentence carries an instruction to pay or add a card (3.1.1), so none is shown there — the Billing
  // tab still states the facts.
  if (dismissed || !purchaseCtaAllowed()) return null
  const b = (chunks: React.ReactNode) => <strong>{chunks}</strong>
  const green = notice.kind === 'all_set'
  const text = notice.kind === 'trial_ends_soon' ? w.t.rich('notices.trialEndsSoon', { b, date: w.date(notice.date!) })
    : notice.kind === 'trial_ends_tomorrow' ? w.t.rich('notices.trialEndsTomorrow', { b })
    : notice.kind === 'all_set' ? w.t.rich('notices.allSet', { b, plan: w.plan(notice.planKey), date: w.date(notice.date!) })
    : notice.kind === 'payment_failed' ? w.t.rich('notices.paymentFailed', { b, method: notice.method, date: w.date(notice.lastDay!) })
    : w.t.rich('notices.paused', { b, amount: w.amount(notice.amountMinor ?? 0), date: w.date(notice.suspendWarningDate!) })
  const link = notice.kind === 'all_set' ? null
    : notice.kind === 'paused' ? w.t('notices.payNow')
    : notice.kind === 'payment_failed' ? w.t('notices.updateCard', { method: notice.method })
    : w.t('notices.addCard')
  return (
    <div data-billing-notice={notice.kind} className={`mb-4 rounded-xl px-4 py-3 flex items-center gap-3 border ${green ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
      <span className={`text-lg shrink-0 ${green ? 'text-green-500' : 'text-amber-500'}`}>{green ? '✅' : '💳'}</span>
      <p className={`text-sm flex-1 ${green ? 'text-green-800' : 'text-amber-800'}`}>{text}</p>
      {link && <button type="button" onClick={onOpen} className="text-xs font-bold text-amber-800 underline whitespace-nowrap">{link}</button>}
      {notice.dismissible && (
        <button type="button" aria-label={w.t('notices.dismiss')} onClick={() => setDismissed(true)}
          className={`text-sm font-bold leading-none shrink-0 ${green ? 'text-green-400 hover:text-green-600' : 'text-amber-400 hover:text-amber-600'}`}>✕</button>
      )}
    </div>
  )
}

const CARD = 'bg-white border border-slate-200 rounded-2xl p-6'
const ROW = 'flex items-start justify-between gap-3 py-2 border-b border-slate-100 text-sm'
const BTN = 'rounded-xl bg-orange-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60'
const BTN2 = 'rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-600'

/** 🔴 THE BILLING TAB (billing on, or a billing_test truck). The "Compare plans" table stays below it (the caller's). */
export function BillingScreen({ token, view, setView }: { token: string; view: BillingScreenView; setView: (v: BillingScreenView) => void }) {
  const w = useWords()
  const t = w.t
  const cta = purchaseCtaAllowed()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [changing, setChanging] = useState(false)
  const [saved, setSaved] = useState(false)

  const go = async (action: 'add_card' | 'add_pix') => {
    setBusy(action); setError(null)
    const r = await call(token, action)
    setBusy(null)
    if (r.ok && typeof r.data.url === 'string') window.location.assign(r.data.url)
    else setError(t('tab.payment.error'))
  }
  const setPreorder = async (value: 'online' | 'at_truck') => {
    setBusy('preorder'); setError(null); setSaved(false)
    const r = await call(token, 'pre_order_payment', { value })
    setBusy(null)
    if (r.ok && r.data.visible) { setView(r.data as unknown as BillingScreenView); setSaved(true) } else setError(t('tab.preorders.error'))
  }

  const p = view.plan
  const pm = view.paymentMethod
  const lineForPlan = () => {
    if (view.trial) {
      return view.trial.afterMonthlyMinor > 0
        ? t('tab.plan.trialLine', { date: w.date(view.trial.endDate), plan: w.plan(view.trial.afterPlanKey), price: w.price(view.trial.afterMonthlyMinor) })
        : t('tab.plan.trialLineFree', { date: w.date(view.trial.endDate), plan: w.plan(view.trial.afterPlanKey) })
    }
    if ((p.allowanceMinor ?? 0) > 0) return t('tab.plan.proLine', { allowance: w.allowance(p.allowanceMinor), fee: w.fee(p.feeBps) })
    if (p.feeBps > 0) return t('tab.plan.paygLine', { fee: w.fee(p.feeBps) })
    return t('tab.plan.unlimitedLine', { price: w.price(p.monthlyMinor) })
  }

  return (
    <div className="flex flex-col gap-6" data-billing-screen={view.mode}>
      {/* ── payment failed (days 1–6) / paused ── */}
      {view.failure && !view.failure.paused && (
        <div data-billing-alert="failed" className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-sm font-bold text-amber-800">{t('tab.failed.title', { amount: w.amount(view.failure.amountMinor) })}</p>
          {cta && <p className="text-sm text-amber-800 mt-0.5">{t('tab.failed.body', { date: w.date(view.failure.lastDay) })}</p>}
          {cta && <button type="button" disabled={!!busy} onClick={() => void go(pm.type === 'pix' ? 'add_pix' : 'add_card')} className={`${BTN} mt-3`}>{t('tab.failed.button')}</button>}
        </div>
      )}
      {view.failure?.paused && (
        <div data-billing-alert="paused" className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-sm font-bold text-red-700">{t('tab.paused.title')}</p>
          {cta && <p className="text-sm text-red-700 mt-0.5">{t('tab.paused.body', { amount: w.amount(view.failure.amountMinor) })}</p>}
          {cta && <p className="text-sm font-bold text-red-700 mt-0.5">{t('tab.paused.warning', { date: w.date(view.failure.suspendWarningDate) })}</p>}
          {cta && (
            <div className="mt-3 flex flex-wrap gap-2">
              {view.failure.payUrl && <a href={view.failure.payUrl} className={BTN}>{t('tab.paused.pay', { amount: w.amount(view.failure.amountMinor) })}</a>}
              <button type="button" disabled={!!busy} onClick={() => void go(pm.type === 'pix' ? 'add_pix' : 'add_card')} className={BTN2}>{t('tab.paused.otherCard')}</button>
            </div>
          )}
        </div>
      )}
      {error && <p className="text-sm font-semibold text-red-600" role="alert">{error}</p>}

      {/* ── Your plan ── */}
      <div className={CARD} data-billing-card="plan">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">{t('tab.plan.title')}</p>
            <p className="text-lg font-bold text-slate-900 mt-1">
              {/* On the trial: the plan it becomes, with the "Free trial" pill beside it. */}
              {w.plan(view.trial ? view.trial.afterPlanKey : p.key)}
              {p.onTrial && <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">{t('tab.plan.trialPill')}</span>}
            </p>
          </div>
          {cta && !p.onTrial && view.plans.length > 1 && <button type="button" onClick={() => setChanging(true)} className={BTN2}>{t('tab.plan.change')}</button>}
        </div>
        <p className="text-sm text-slate-600 mt-2">{lineForPlan()}</p>
        {view.pendingPlan && <p className="text-sm text-slate-600 mt-1">{t('tab.plan.pendingLine', { plan: w.plan(view.pendingPlan.key), date: w.date(view.pendingPlan.from) })}</p>}
      </div>

      {/* ── Payment method ── */}
      <div className={CARD} data-billing-card="payment">
        <p className="text-sm font-semibold text-slate-900">{t('tab.payment.title')}</p>
        {pm.state === 'valid' ? (
          <div className="flex items-start justify-between gap-3 mt-2">
            <div>
              <p className="text-sm text-slate-800">{pm.type === 'pix' ? t('tab.payment.pixOnFile') : t('tab.payment.card', { brand: BRAND[pm.brand ?? ''] ?? pm.brand ?? '', last4: pm.last4 ?? '' })}</p>
              {pm.lastFailed && <p className="text-sm font-semibold text-red-600 mt-0.5">{t('tab.payment.lastFailed')}</p>}
            </div>
            {cta && <button type="button" disabled={!!busy} onClick={() => void go(pm.type === 'pix' ? 'add_pix' : 'add_card')} className={pm.lastFailed ? BTN : BTN2}>{pm.lastFailed ? t('tab.payment.update') : t('tab.payment.change')}</button>}
          </div>
        ) : pm.state === 'pending' ? (
          <p className="text-sm text-slate-600 mt-2">{t('tab.payment.pending')}</p>
        ) : (
          <>
            {cta && <p className="text-sm text-slate-600 mt-2">{t('tab.payment.none')}</p>}
            {cta && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={!!busy} onClick={() => void go('add_card')} className={BTN}>{t('tab.payment.add')}</button>
                {view.pixOffered && <button type="button" disabled={!!busy} onClick={() => void go('add_pix')} className={BTN2}>{t('tab.payment.pix')}</button>}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── What you pay (trial) / Next payment (paying) ── */}
      {view.trial && (
        <div className={CARD} data-billing-card="what-you-pay">
          <p className="text-sm font-semibold text-slate-900 mb-2">{t('tab.whatYouPay.title')}</p>
          {view.trial.afterMonthlyMinor > 0 && <div className={ROW}><span>{t('tab.whatYouPay.plan')}</span><span className="font-semibold">{w.price(view.trial.afterMonthlyMinor)}</span></div>}
          {view.trial.afterFeeBps > 0 && (
            <div className={ROW}>
              <span>{(view.trial.afterAllowanceMinor ?? 0) > 0 ? t('tab.whatYouPay.fee', { allowance: w.allowance(view.trial.afterAllowanceMinor) }) : t('tab.whatYouPay.feePayg')}</span>
              <span className="font-semibold">{w.fee(view.trial.afterFeeBps)}</span>
            </div>
          )}
          <div className={ROW}><span>{t('tab.whatYouPay.walkUps')}</span><span className="font-semibold">{t('tab.whatYouPay.free')}</span></div>
          {view.trial.restOfMonth && (
            <p className="text-sm text-slate-600 mt-3">{t('tab.whatYouPay.trialEnd', { date: w.date(view.trial.endDate), amount: w.amount(view.trial.restOfMonth.amountMinor),
              month: w.month(view.trial.restOfMonth.month), price: w.price(view.trial.afterMonthlyMinor), nextFirst: w.date(view.trial.nextFirst) })}</p>
          )}
        </div>
      )}
      {view.nextPayment && (() => {
        const n = view.nextPayment
        return (
          <div className={CARD} data-billing-card="next-payment">
            <p className="text-sm font-semibold text-slate-900 mb-2">{t('tab.next.title', { date: w.date(n.date) })}</p>
            {n.planMinor > 0 && <div className={ROW}><span>{t('tab.next.plan', { plan: w.plan(n.planKey), month: w.month(n.planMonth) })}</span><span className="font-semibold">{w.amount(n.planMinor)}</span></div>}
            {n.feeBps > 0 && (
              <div className={ROW}>
                <span>{(n.allowanceMinor ?? 0) > 0 ? t('tab.next.fee', { fee: w.fee(n.feeBps), month: w.month(n.usageMonth), allowance: w.allowance(n.allowanceMinor) }) : t('tab.next.feePayg', { fee: w.fee(n.feeBps), month: w.month(n.usageMonth) })}</span>
                <span className="font-semibold">{w.amount(n.usageMinor)}</span>
              </div>
            )}
            {n.vansMinor > 0 && <div className={ROW}><span>{t('tab.next.vans', { month: w.month(n.planMonth) })}</span><span className="font-semibold">{w.amount(n.vansMinor)}</span></div>}
            {n.surchargeMinor > 0 && <div className={ROW}><span>{t('tab.next.surcharge', { month: w.month(n.usageMonth) })}</span><span className="font-semibold">{w.amount(n.surchargeMinor)}</span></div>}
            {n.carriedMinor > 0 && <div className={ROW}><span>{t('tab.next.carried')}</span><span className="font-semibold">{w.amount(n.carriedMinor)}</span></div>}
            <div className="flex items-start justify-between gap-3 pt-2 text-sm font-bold text-slate-900"><span>{t('tab.next.total')}</span><span>{w.amount(n.totalMinor)}</span></div>
            <p className="text-xs text-slate-500 mt-3">{t('tab.next.walkUps')}</p>
          </div>
        )
      })()}

      {/* ── How customers pay for pre-orders (truck_billing.post_pay) ── */}
      <div className={CARD} data-billing-card="pre-orders">
        <p className="text-sm font-semibold text-slate-900 mb-2">{t('tab.preorders.title')}</p>
        {view.preOrderPayment.onlineAllowed && (
          <label className="flex items-start gap-3 py-2 cursor-pointer">
            <input type="radio" name="billing-preorders" checked={view.preOrderPayment.value === 'online'} disabled={busy === 'preorder'} onChange={() => void setPreorder('online')} className="mt-1" />
            <span><span className="block text-sm font-semibold text-slate-800">{t('tab.preorders.online')}</span><span className="block text-xs text-slate-500">{t('tab.preorders.onlineHint')}</span></span>
          </label>
        )}
        <label className="flex items-start gap-3 py-2 cursor-pointer">
          <input type="radio" name="billing-preorders" checked={view.preOrderPayment.value === 'at_truck'} disabled={busy === 'preorder'} onChange={() => void setPreorder('at_truck')} className="mt-1" />
          <span><span className="block text-sm font-semibold text-slate-800">{t('tab.preorders.atTruck')}</span><span className="block text-xs text-slate-500">{t('tab.preorders.atTruckHint')}</span></span>
        </label>
        {saved && <p className="text-xs font-semibold text-green-700 mt-1">{t('tab.preorders.saved')}</p>}
      </div>

      {/* ── Invoices ── */}
      <div className={CARD} data-billing-card="invoices">
        <p className="text-sm font-semibold text-slate-900 mb-2">{t('tab.invoices.title')}</p>
        {view.invoices.length === 0 ? <p className="text-sm text-slate-500">{t('tab.invoices.none')}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-3">{t('tab.invoices.date')}</th><th className="py-2 pr-3">{t('tab.invoices.for')}</th>
                  <th className="py-2 pr-3">{t('tab.invoices.amount')}</th><th className="py-2 pr-3">{t('tab.invoices.status')}</th><th className="py-2 pr-3"></th>
                </tr>
              </thead>
              <tbody>{view.invoices.map(inv => <InvoiceRowView key={inv.id} inv={inv} cta={cta} />)}</tbody>
            </table>
          </div>
        )}
      </div>

      {changing && cta && <ChangePlanModal token={token} view={view} onClose={() => setChanging(false)} onDone={v => { setView(v); setChanging(false) }} />}
    </div>
  )
}

function InvoiceRowView({ inv, cta }: { inv: InvoiceView; cta: boolean }) {
  const w = useWords()
  const t = w.t
  const what = inv.kind === 'trial_end' ? t('tab.invoices.forTrialEnd', { month: w.month(inv.planMonth) })
    : inv.kind === 'upgrade' ? t('tab.invoices.forUpgrade', { plan: w.plan(inv.toPlanKey) })
    : inv.usageMonth ? t('tab.invoices.forMonthly', { planMonth: w.month(inv.planMonth), usageMonth: w.month(inv.usageMonth) })
    : t('tab.invoices.forMonthlyPlan', { planMonth: w.month(inv.planMonth) })
  const pill = inv.status === 'paid' ? 'bg-green-100 text-green-700' : inv.status === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
  return (
    <tr className="border-b border-slate-100 align-top" data-billing-invoice={inv.status}>
      <td className="py-2 pr-3 text-slate-600">{w.date(inv.date)}</td>
      <td className="py-2 pr-3 text-slate-800">{what}{inv.lateFeeMinor > 0 && <div className="text-xs text-slate-500">{t('tab.invoices.lateFee')} · {w.amount(inv.lateFeeMinor)}</div>}</td>
      <td className="py-2 pr-3 font-semibold text-slate-800">{w.amount(inv.amountMinor)}</td>
      <td className="py-2 pr-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${pill}`}>{t(`tab.invoices.${inv.status}` as never)}</span></td>
      <td className="py-2 pr-3">
        {inv.status === 'paid' ? (inv.pdfUrl && <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-slate-600 underline">{t('tab.invoices.download')}</a>)
          : (cta && inv.payUrl && <a href={inv.payUrl} className="text-xs font-bold text-orange-700 underline">{t('tab.invoices.payNow')}</a>)}
      </td>
    </tr>
  )
}

/** CHANGE PLAN (replaces the "email us to switch" modal while billing is shown). lib/billing/engine.ts requestPlanChange. */
function ChangePlanModal({ token, view, onClose, onDone }: { token: string; view: BillingScreenView; onClose: () => void; onDone: (v: BillingScreenView) => void }) {
  const w = useWords()
  const t = w.t
  const current = view.plans.find(x => x.current)?.key ?? view.plan.key
  const [chosen, setChosen] = useState<string>(current)
  const [preview, setPreview] = useState<PlanChangePreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (chosen === current) return
    let off = false
    call(token, 'plan_preview', { planKey: chosen }).then(r => { if (!off && r.ok) setPreview(r.data as unknown as PlanChangePreview) })
    return () => { off = true }
  }, [token, chosen, current])
  const shown = chosen === current ? null : preview
  const lineOf = (x: BillingScreenView['plans'][number]) => (x.allowanceMinor ?? 0) > 0 ? t('changePlan.proLine', { allowance: w.allowance(x.allowanceMinor), fee: w.fee(x.feeBps) })
    : x.feeBps > 0 ? t('changePlan.paygLine', { fee: w.fee(x.feeBps) }) : t('changePlan.unlimitedLine')
  const submit = async () => {
    setBusy(true); setError(null)
    const r = await call(token, 'change_plan', { planKey: chosen })
    setBusy(false)
    if (r.ok && r.data.view) onDone(r.data.view as BillingScreenView); else setError(t('changePlan.error'))
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" data-billing-modal="change-plan">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-slate-900">{t('changePlan.title')}</h3>
        <p className="text-sm text-slate-600 mt-1">{t('changePlan.current', { plan: w.plan(current) })}</p>
        <div className="mt-4 flex flex-col gap-2">
          {view.plans.map(x => (
            <label key={x.key} data-plan-choice={x.key} className={`flex items-start gap-3 rounded-xl border px-4 py-3 cursor-pointer ${chosen === x.key ? 'border-orange-600 bg-orange-50' : 'border-slate-200 bg-white'}`}>
              <input type="radio" name="billing-plan" checked={chosen === x.key} onChange={() => setChosen(x.key)} className="mt-1" />
              <span className="flex-1">
                <span className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  {w.plan(x.key)}
                  {x.current && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{t('changePlan.yourPlan')}</span>}
                </span>
                <span className="block text-sm text-slate-800">{x.monthlyMinor === 0 ? t('changePlan.free') : t('changePlan.perMonth', { price: w.price(x.monthlyMinor) })}</span>
                <span className="block text-xs text-slate-500">{lineOf(x)}</span>
              </span>
            </label>
          ))}
        </div>
        {shown?.direction === 'up' && (
          <>
            <p className="text-sm font-semibold text-slate-800 mt-4">{t('changePlan.startsNow')}</p>
            <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
              {t('changePlan.chargeToday', { amount: w.amount(shown.amountMinor), month: w.month(shown.month), price: w.price(shown.toMonthlyMinor), nextFirst: w.date(shown.nextFirst) })}
            </div>
          </>
        )}
        {shown?.direction === 'down' && <p className="text-sm text-slate-800 mt-4">{t('changePlan.startsLater', { nextFirst: w.date(shown.nextFirst), plan: w.plan(current) })}</p>}
        {error && <p className="text-sm font-semibold text-red-600 mt-3" role="alert">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={BTN2}>{t('changePlan.cancel')}</button>
          <button type="button" disabled={busy || chosen === current || !shown || shown.direction === 'in_trial'} onClick={() => void submit()} className={BTN}>{t('changePlan.switchTo', { plan: w.plan(chosen) })}</button>
        </div>
      </div>
    </div>
  )
}
