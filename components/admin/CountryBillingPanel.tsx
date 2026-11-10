'use client'
// components/admin/CountryBillingPanel.tsx — Admin › Countries › "Billing" (billing-1, 10 November 2026).
// One row per country, each saving on its own (the Comparison pages panel's pattern): how HatchGrab charges trucks there —
// the payment model (a / b / c), the post-pay surcharge (0 = not applied) and the minimum charge under which an amount is
// carried forward. public.country_billing, through /api/admin/billing. The global switch is shown, never set, here.
// ⚠️ Only Tailwind classes the Admin screens already use (a new class would change the stylesheet the public pages share) —
// scripts/billing-1.cjs checks every class in this file against the rest of the code.
import { useEffect, useState } from 'react'
import { nativeAuthHeader } from '@/lib/native/session'
import { PAYMENT_MODELS, PAYMENT_MODEL_LABELS, type PaymentModel } from '@/lib/billing/rules'

interface Row {
  countryCode: string; name: string; currency: string | null; platformFeeAllowed: boolean
  paymentModel: PaymentModel; postPaySurchargeBps: number; postPaySurchargeFixedMinor: number; minChargeMinor: number; updatedAt?: string
}
type Draft = { paymentModel: PaymentModel; bps: string; fixed: string; min: string }
const BOX = 'min-w-0 rounded-lg border bg-white px-2 py-1 text-sm text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 disabled:bg-slate-100 disabled:text-slate-500'
const draftOf = (r: Row): Draft => ({ paymentModel: r.paymentModel, bps: String(r.postPaySurchargeBps), fixed: String(r.postPaySurchargeFixedMinor), min: String(r.minChargeMinor) })
const whole = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : NaN)

async function call(method: 'GET' | 'PUT', body?: unknown) {
  const res = await fetch('/api/admin/billing', {
    method, headers: { 'Content-Type': 'application/json', ...(await nativeAuthHeader()) }, body: body === undefined ? undefined : JSON.stringify(body),
  })
  let data: Record<string, unknown> = {}
  try { data = await res.json() } catch { /* reported by status */ }
  return { ok: res.ok, data }
}

export function CountryBillingPanel() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [switchOn, setSwitchOn] = useState<boolean | null>(null)
  const [missing, setMissing] = useState<{ countryCode: string; name: string }[]>([])
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    let off = false
    call('GET').then(r => {
      if (off) return
      if (!r.ok) { setNotice({ ok: false, text: String(r.data.error ?? 'Could not load billing settings.') }); return }
      const list = (r.data.countries ?? []) as Row[]
      setRows(list)
      setDrafts(Object.fromEntries(list.map(x => [x.countryCode, draftOf(x)])))
      setSwitchOn(((r.data.switch ?? {}) as { enabled?: boolean }).enabled === true)
      setMissing((r.data.missingCountries ?? []) as { countryCode: string; name: string }[])
    })
    return () => { off = true }
  }, [])

  async function save(r: Row) {
    const d = drafts[r.countryCode]
    setBusy(r.countryCode); setNotice(null)
    const res = await call('PUT', {
      countryCode: r.countryCode, paymentModel: d.paymentModel, postPaySurchargeBps: whole(d.bps),
      postPaySurchargeFixedMinor: whole(d.fixed), minChargeMinor: whole(d.min), expectedUpdatedAt: r.updatedAt ?? null,
    })
    setBusy(null)
    if (!res.ok) { setNotice({ ok: false, text: `${r.name}: ${String(res.data.error ?? 'Not saved.')}` }); return }
    const saved = res.data.row as Row
    setRows(prev => (prev ?? []).map(x => (x.countryCode === r.countryCode ? { ...x, ...saved } : x)))
    setDrafts(prev => ({ ...prev, [r.countryCode]: draftOf({ ...r, ...saved }) }))
    setNotice({ ok: true, text: `${r.name} saved.` })
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4" data-country-billing>
      <p className="text-sm font-bold text-slate-900">Billing</p>
      <p className="text-xs text-slate-500">How HatchGrab charges trucks in each country. (a) takes the fee from each online payment; (b) and (c) bill it monthly, with the plan. Any truck can also choose post-pay. Amounts are in the country&apos;s minor units (pence, cents, whole yen). Surcharge 100 = 1%.</p>
      {switchOn !== null && (
        <p className={`mt-2 rounded-lg px-3 py-2 text-sm font-semibold ${switchOn ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`} data-billing-switch={switchOn ? 'on' : 'off'}>
          {switchOn ? 'Billing is switched ON — these settings are charging trucks.' : 'Billing is switched OFF — nothing is charged and no truck is paused. These settings take effect when it is switched on.'}
        </p>
      )}
      {missing.length > 0 && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">No billing row yet (never billed until saved): {missing.map(m => `${m.name} (${m.countryCode})`).join(', ')}</p>}
      {notice && <p className={`mt-2 rounded-lg px-3 py-2 text-sm font-semibold ${notice.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`} role="status">{notice.text}</p>}
      {rows && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <th className="px-2 py-1.5">Country</th><th className="px-2 py-1.5">Payment model</th><th className="px-2 py-1.5">Post-pay surcharge %</th>
              <th className="px-2 py-1.5">Post-pay monthly</th><th className="px-2 py-1.5">Minimum charge</th><th className="px-2 py-1.5"></th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(r => {
                const d = drafts[r.countryCode] ?? draftOf(r)
                const dirty = JSON.stringify(d) !== JSON.stringify(draftOf(r))
                const bad = [d.bps, d.fixed, d.min].some(v => Number.isNaN(whole(v)))
                const set = (p: Partial<Draft>) => setDrafts(prev => ({ ...prev, [r.countryCode]: { ...d, ...p } }))
                return (
                  <tr key={r.countryCode} data-billing-row={r.countryCode} className={dirty ? 'bg-orange-50' : ''}>
                    <td className="px-2 py-1.5 font-semibold text-slate-800">{r.name} <span className="font-mono text-xs text-slate-400">{r.countryCode}</span> <span className="text-xs text-slate-500">{r.currency}</span></td>
                    <td className="px-2 py-1.5">
                      <select className={`${BOX} border-slate-200`} value={d.paymentModel} aria-label={`${r.name} payment model`} onChange={e => set({ paymentModel: e.target.value as PaymentModel })}>
                        {PAYMENT_MODELS.map(m => <option key={m} value={m} disabled={m === 'fee_from_payment' && !r.platformFeeAllowed}>{PAYMENT_MODEL_LABELS[m]}{m === 'fee_from_payment' && !r.platformFeeAllowed ? ' — not allowed here' : ''}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1.5"><input className={`${BOX} w-20 ${Number.isNaN(whole(d.bps)) ? 'border-red-400' : 'border-slate-200'}`} inputMode="numeric" value={d.bps} aria-label={`${r.name} post-pay surcharge basis points`} onChange={e => set({ bps: e.target.value })} /></td>
                    <td className="px-2 py-1.5"><input className={`${BOX} w-20 ${Number.isNaN(whole(d.fixed)) ? 'border-red-400' : 'border-slate-200'}`} inputMode="numeric" value={d.fixed} aria-label={`${r.name} post-pay monthly surcharge`} onChange={e => set({ fixed: e.target.value })} /></td>
                    <td className="px-2 py-1.5"><input className={`${BOX} w-20 ${Number.isNaN(whole(d.min)) ? 'border-red-400' : 'border-slate-200'}`} inputMode="numeric" value={d.min} aria-label={`${r.name} minimum charge`} onChange={e => set({ min: e.target.value })} /></td>
                    <td className="px-2 py-1.5">
                      {dirty && <button type="button" disabled={bad || busy === r.countryCode} onClick={() => void save(r)}
                        className="shrink-0 rounded-lg bg-orange-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-orange-700 disabled:bg-slate-200 disabled:text-slate-500">{busy === r.countryCode ? 'Saving…' : 'Save'}</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
