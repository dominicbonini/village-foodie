// app/(app)/admin/billing/page.tsx — billing-1 (10 November 2026). 🔴 ADMIN ONLY: every truck billing could touch, its status
// (now, and as it would be with the switch on), and — for one truck — its months (the ledger), the open month's pre-orders,
// its invoices, and "Run month-end (test)" for a billing-TEST truck on Stripe test mode.
// The page holds no authority: /api/admin/billing checks verifyAdmin on every call. Not linked from the console (the same
// reason as /admin/whatsapp-connections: the console carries the live plan controls). Go to /admin/billing directly.
// ⚠️ Only Tailwind classes the Admin screens already use — scripts/billing-1.cjs checks every class in this file.
'use client'

import { useEffect, useState } from 'react'
import { nativeAuthHeader } from '@/lib/native/session'
import { formatMinorOrBare, type MoneyFormat } from '@/lib/money-format'

type Status = { status: string; reason: string } | null
interface TruckRow {
  id: string; name: string; country: string; currency: string; plan: string; isCustomer: boolean; billingTest: boolean; postPay: boolean
  paymentMethod: string | null; paymentMethodState: string; statusNow: Status; statusIfOn: Status
}
type Rec = Record<string, unknown>

const fmtDate = (iso: unknown) => (typeof iso === 'string' && iso ? new Date(iso).toLocaleString('en-GB') : '—')
const statusText = (s: Status) => (s ? `${s.status} (${s.reason})` : 'not billed')
const TONE: Record<string, string> = {
  trialling: 'bg-slate-100 text-slate-600', active: 'bg-green-100 text-green-700', past_due: 'bg-amber-100 text-amber-700', paused: 'bg-red-100 text-red-700',
}

async function api(method: 'GET' | 'POST', qs = '', body?: unknown) {
  const res = await fetch(`/api/admin/billing${qs}`, {
    method, headers: { 'Content-Type': 'application/json', ...(await nativeAuthHeader()) }, body: body === undefined ? undefined : JSON.stringify(body),
  })
  let data: Rec = {}
  try { data = await res.json() } catch { /* reported by status */ }
  return { ok: res.ok, data }
}

export default function AdminBillingPage() {
  const [list, setList] = useState<{ switch?: { enabled: boolean; pauseAfterDays: number }; keyState?: string; trucks?: TruckRow[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Rec | null>(null)
  const [period, setPeriod] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [planKey, setPlanKey] = useState('pro')

  useEffect(() => {
    let off = false
    api('GET').then(r => {
      if (off) return
      if (!r.ok) { setError(String(r.data.error ?? 'Could not load.')); return }
      setList(r.data as typeof list)
    })
    return () => { off = true }
  }, [])

  async function open(id: string) {
    setOpenId(id); setDetail(null); setResult(null)
    const r = await api('GET', `?truckId=${encodeURIComponent(id)}`)
    if (!r.ok) { setError(String(r.data.error ?? 'Could not load the truck.')); return }
    setDetail(r.data)
    setPeriod(String(r.data.currentPeriod ?? ''))
  }

  async function act(action: 'preview_month' | 'run_month_end_test' | 'change_plan_test') {
    if (!openId) return
    setBusy(true); setResult(null)
    const r = await api('POST', '', { action, truckId: openId, period, planKey })
    setBusy(false)
    setResult(JSON.stringify(r.ok ? (r.data.outcome ?? r.data.preview ?? r.data) : { error: r.data.error }, null, 2))
    if (action !== 'preview_month') void open(openId)
  }

  const truck = (detail?.truck ?? null) as Rec | null
  const money: MoneyFormat | null = truck ? { currency: String(truck.currency), locale: 'en-GB' } : null
  const m = (v: unknown) => (money && typeof v === 'number' ? formatMinorOrBare(v, money, 'admin billing') : '—')

  return (
    <div className="px-8 py-6">
      <h1 className="text-xl font-bold text-slate-800">Billing</h1>
      {list?.switch && (
        <p className="mt-1 text-sm text-slate-600">
          Billing is switched <strong className={list.switch.enabled ? 'text-green-700' : 'text-amber-700'}>{list.switch.enabled ? 'on' : 'off'}</strong>
          {' '}· online ordering pauses {list.switch.pauseAfterDays} days after an unpaid invoice · Stripe billing key: <strong>{list.keyState}</strong> (test mode only in this build).
        </p>
      )}
      {error && <p className="mt-6 text-sm text-red-700">{error}</p>}
      {!list && !error && <p className="mt-6 text-sm text-slate-500">Loading…</p>}
      {list?.trucks && list.trucks.length === 0 && <p className="mt-6 text-sm text-slate-500">No truck could be billed yet: no customers, and no billing test trucks.</p>}
      {list?.trucks && list.trucks.length > 0 && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-3">Truck</th><th className="py-2 pr-3">Plan</th><th className="py-2 pr-3">Payment method</th>
                <th className="py-2 pr-3">Status now</th><th className="py-2 pr-3">If switched on</th><th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {list.trucks.map(t => (
                <tr key={t.id} className="border-b border-slate-100 align-top">
                  <td className="py-2 pr-3">
                    <div className="font-semibold text-slate-800">{t.name}</div>
                    <div className="text-xs text-slate-500">{t.id} · {t.country} · {t.currency}{t.billingTest ? ' · billing test' : ''}{t.postPay ? ' · post-pay' : ''}{t.isCustomer ? '' : ' · not a customer'}</div>
                  </td>
                  <td className="py-2 pr-3 text-xs text-slate-600">{t.plan}</td>
                  <td className="py-2 pr-3 text-xs text-slate-600">{t.paymentMethod ?? '—'} <div className="text-slate-400">{t.paymentMethodState}</div></td>
                  <td className="py-2 pr-3 text-xs">{statusText(t.statusNow)}</td>
                  <td className="py-2 pr-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${TONE[t.statusIfOn?.status ?? ''] ?? 'bg-slate-100 text-slate-600'}`}>{statusText(t.statusIfOn)}</span></td>
                  <td className="py-2 pr-3"><button type="button" onClick={() => void open(t.id)} className="rounded-lg border border-slate-200 px-2 py-1 font-semibold text-slate-600">Open</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openId && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4" data-billing-truck={openId}>
          {!detail && <p className="text-sm text-slate-500">Loading…</p>}
          {detail && truck && (
            <>
              <p className="text-sm font-bold text-slate-900">{String(truck.name)} <span className="font-mono text-xs text-slate-400">{String(truck.id)}</span></p>
              <p className="text-xs text-slate-500">Plan {String(truck.plan)} · trial ends {fmtDate(truck.trialEndsAt)} · {String(truck.timezone ?? '')} · arrangement {JSON.stringify(detail.arrangement)}</p>
              <p className="text-xs text-slate-500">Status now: {statusText(detail.statusNow as Status)} · if switched on: {statusText(detail.statusIfOn as Status)}</p>

              <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">Usage by month (billed in arrears on the next 1st)</p>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-3">Month</th><th className="py-2 pr-3">State</th><th className="py-2 pr-3">Pre-orders</th><th className="py-2 pr-3">Counted</th>
                    <th className="py-2 pr-3">Fee due</th><th className="py-2 pr-3">Taken</th><th className="py-2 pr-3">Billed</th><th className="py-2 pr-3">Plan</th>
                    <th className="py-2 pr-3">Surcharge</th>
                  </tr></thead>
                  <tbody>
                    {((detail.usage ?? []) as Rec[]).map(u => (
                      <tr key={String(u.period)} className="border-b border-slate-100 align-top text-xs text-slate-600">
                        <td className="py-2 pr-3 font-semibold text-slate-800">{String(u.period).slice(0, 7)}</td><td className="py-2 pr-3">{String(u.state)}</td>
                        <td className="py-2 pr-3">{String(u.preorderCount)}</td><td className="py-2 pr-3">{m(u.countedMinor)}</td><td className="py-2 pr-3">{m(u.feeDueMinor)}</td>
                        <td className="py-2 pr-3">{m(u.feeTakenMinor)}</td><td className="py-2 pr-3">{m(u.feeBilledMinor)}</td><td className="py-2 pr-3">{String(u.planKey)}</td>
                        <td className="py-2 pr-3">{m(u.surchargeMinor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">Charges (plan in advance; trial end and upgrades pro rata)</p>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-3">Month</th><th className="py-2 pr-3">Kind</th><th className="py-2 pr-3">Plan</th><th className="py-2 pr-3">Plan fee</th><th className="py-2 pr-3">Vans</th>
                    <th className="py-2 pr-3">Usage</th><th className="py-2 pr-3">Surcharge</th><th className="py-2 pr-3">Carried in</th><th className="py-2 pr-3">Charged</th><th className="py-2 pr-3">Carried out</th><th className="py-2 pr-3">State</th>
                  </tr></thead>
                  <tbody>
                    {((detail.charges ?? []) as Rec[]).map(c => (
                      <tr key={String(c.id)} className="border-b border-slate-100 align-top text-xs text-slate-600">
                        <td className="py-2 pr-3 font-semibold text-slate-800">{String(c.period).slice(0, 7)}</td><td className="py-2 pr-3">{String(c.kind)}</td>
                        <td className="py-2 pr-3">{c.fromPlanKey ? `${String(c.fromPlanKey)} → ` : ''}{String(c.planKey)}{Number(c.planDays) > 0 && Number(c.planDays) < Number(c.periodDays) ? ` (${String(c.planDays)}/${String(c.periodDays)} days)` : ''}</td>
                        <td className="py-2 pr-3">{m(c.planMinor)}</td><td className="py-2 pr-3">{m(c.vansMinor)}</td>
                        <td className="py-2 pr-3">{m(c.usageFeeMinor)}{c.usagePeriod ? <div className="text-slate-400">{String(c.usagePeriod).slice(0, 7)}</div> : null}</td>
                        <td className="py-2 pr-3">{m(c.surchargeMinor)}</td><td className="py-2 pr-3">{m(c.carriedInMinor)}</td><td className="py-2 pr-3">{m(c.chargedMinor)}</td>
                        <td className="py-2 pr-3">{m(c.carriedOutMinor)}</td><td className="py-2 pr-3">{String(c.state)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {((detail.history ?? []) as Rec[]).length > 0 && (
                <p className="text-xs text-slate-500">Plan history: {((detail.history ?? []) as Rec[]).map(h => `${String(h.planKey)} from ${h.changedAt === '-infinity' ? 'before billing' : fmtDate(h.changedAt)}`).join(' · ')}</p>
              )}

              <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">Invoices</p>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-3">Month</th><th className="py-2 pr-3">Amount</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Due</th><th className="py-2 pr-3">Paid</th><th className="py-2 pr-3">Attempts</th><th className="py-2 pr-3">Stripe</th>
                  </tr></thead>
                  <tbody>
                    {((detail.invoices ?? []) as Rec[]).map(i => (
                      <tr key={String(i.id)} className="border-b border-slate-100 align-top text-xs text-slate-600">
                        <td className="py-2 pr-3 font-semibold text-slate-800">{String(i.period).slice(0, 7)}</td><td className="py-2 pr-3">{m(i.amountMinor)}</td>
                        <td className="py-2 pr-3">{String(i.status)}{Number(i.lateFeeMinor) > 0 ? <div className="text-red-700">late fee {m(i.lateFeeMinor)}</div> : null}{i.lastError ? <div className="text-red-700">{String(i.lastError)}</div> : null}</td>
                        <td className="py-2 pr-3">{fmtDate(i.dueAt)}</td><td className="py-2 pr-3">{fmtDate(i.paidAt)}</td><td className="py-2 pr-3">{String(i.attemptCount)}</td>
                        <td className="py-2 pr-3 font-mono">{String(i.stripeInvoiceId ?? '—')}{i.livemode ? ' (live)' : ' (test)'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input className="min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900" value={period} aria-label="Month (YYYY-MM-01)" onChange={e => setPeriod(e.target.value)} />
                <button type="button" disabled={busy} onClick={() => void act('preview_month')} className="rounded-lg border border-slate-200 px-2 py-1 font-semibold text-slate-600">Preview month</button>
                <button type="button" disabled={busy || !(detail.billing as Rec | null)?.billingTest} onClick={() => void act('run_month_end_test')}
                  className="shrink-0 rounded-lg bg-orange-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-orange-700 disabled:bg-slate-200 disabled:text-slate-500">Run billing for this truck (test)</button>
                <input className="min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900" value={planKey} aria-label="Plan key" onChange={e => setPlanKey(e.target.value)} />
                <button type="button" disabled={busy || !(detail.billing as Rec | null)?.billingTest} onClick={() => void act('change_plan_test')} className="rounded-lg border border-slate-200 px-2 py-1 font-semibold text-slate-600">Change plan (test)</button>
                {!(detail.billing as Rec | null)?.billingTest && <span className="text-xs text-slate-500">Only billing test trucks can be run by hand.</span>}
              </div>
              {result && <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{result}</pre>}
            </>
          )}
        </section>
      )}
    </div>
  )
}
