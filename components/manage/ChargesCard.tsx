'use client'
// components/manage/ChargesCard.tsx — Manage › Payments › "Tax, tips and fees" (Phase 3 screens, approved
// mockup; docs/phase-3-screens-report.md).
//
// 🔴 SHOWN ONLY WHERE THE TRUCK'S COUNTRY ADDS TAX AT CHECKOUT. A UK truck never sees it: its country's
// prices include VAT, and this component returns null before anything renders.
//
// Three rows, each a label with a grey hint on the left and the control on the right:
//   • "Sales tax rate" — the truck's ONE rate, 0–20 % with up to 3 decimals, stored in thousandths;
//   • "Tips" — on/off, with the country's choices shown (trucks cannot change them);
//   • "Online service fee" — only where the country allows one: the truck's own switch and amounts within
//     the country's maximum, or, where HatchGrab keeps it, one line saying so and nothing to change.
// Every save is `update_charges`, which runs lib/charge-settings.ts again on the server.
import { useState } from 'react'
import { Card, Toggle } from './primitives'
import { useCountrySettings } from '@/components/CountrySettingsProvider'
import { formatMinor } from '@/lib/money-format'
import { applyBps } from '@/lib/order-charges'
import { formatRateMilli, formatRateBps } from '@/lib/order-charge-lines'
import { checkChargeSettings, feePhrase, pctText, type ChargeSettingsInput } from '@/lib/charge-settings'

export interface ChargesTruck {
  tax_rate_milli?: number | null
  tipping_enabled?: boolean | null
  service_fee_enabled?: boolean | null
  service_fee_bps?: number | null
  service_fee_fixed_minor?: number | null
}

const EXAMPLE_FOOD_MINOR = 2400   // "worked out on $24.00 of food"

export function ChargesCard({ truck, api, showToast, onTruckUpdate }: {
  truck: ChargesTruck
  api: (action: string, extra?: Record<string, unknown>) => Promise<{ truck?: Partial<ChargesTruck> } | null | undefined>
  showToast: (msg: string, type?: 'success' | 'error') => void
  onTruckUpdate: (partial: Partial<ChargesTruck>) => void
}) {
  const cs = useCountrySettings()
  const fmt = { currency: cs.currency, locale: cs.locale }
  const money = (minor: number) => formatMinor(minor, fmt)
  const [rate, setRate] = useState(truck.tax_rate_milli != null ? formatRateMilli(truck.tax_rate_milli) : '')
  const [rateError, setRateError] = useState<string | null>(null)
  const [tipping, setTipping] = useState(typeof truck.tipping_enabled === 'boolean' ? truck.tipping_enabled : cs.tippingEnabledDefault)
  const [feeOn, setFeeOn] = useState(truck.service_fee_enabled === true)
  const [feePct, setFeePct] = useState(truck.service_fee_bps ? pctText(truck.service_fee_bps) : '')
  const [feeFixed, setFeeFixed] = useState(truck.service_fee_fixed_minor ? (truck.service_fee_fixed_minor / 100).toFixed(2) : '')
  const [feeError, setFeeError] = useState<string | null>(null)

  if (cs.pricesIncludeTax) return null

  const save = async (input: ChargeSettingsInput, onError: (e: string | null) => void) => {
    const r = checkChargeSettings(input, cs, money)
    if (!r.ok) { onError(r.error); return false }
    onError(null)
    try {
      const res = await api('update_charges', input as Record<string, unknown>)
      if (res?.truck) onTruckUpdate(res.truck)
      return true
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Couldn’t save — please try again.'
      onError(msg); showToast(msg, 'error')
      return false
    }
  }

  const truckKeeps = cs.serviceFeeAllowed && cs.serviceFeeRecipient === 'truck'
  const hatchgrabKeeps = cs.serviceFeeAllowed && cs.serviceFeeRecipient === 'hatchgrab'
  const maxPct = cs.serviceFeeTruckMaxBps
  const maxFixed = cs.serviceFeeTruckMaxFixedMinor
  const exampleFee = (() => {
    const bps = Number(feePct) > 0 ? Math.round(Number(feePct) * 100) : 0
    const fixed = Number(feeFixed) > 0 ? Math.round(Number(feeFixed) * 100) : 0
    return applyBps(EXAMPLE_FOOD_MINOR, Math.min(bps, maxPct ?? 0)) + Math.min(fixed, maxFixed ?? 0)
  })()

  const row = (label: string, hint: string, control: React.ReactNode, below?: React.ReactNode, testId?: string) => (
    <div className="py-3" data-charges-row={testId}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">{label}</p>
          <p className="text-xs text-slate-500 mt-0.5">{hint}</p>
        </div>
        <div className="flex-shrink-0">{control}</div>
      </div>
      {below}
    </div>
  )

  return (
    <Card className="p-4">
      <h3 className="text-base font-bold text-slate-800">Tax, tips and fees</h3>
      <div className="divide-y divide-slate-100">
        {row('Sales tax rate',
          'The rate you charge on every order. Customers see it added at checkout, on receipts and on tickets.',
          <div className="flex items-center gap-1.5">
            <input type="text" inputMode="decimal" aria-label="Sales tax rate" value={rate}
              onChange={e => setRate(e.target.value)}
              onBlur={() => { void save({ taxRate: rate }, setRateError) }}
              placeholder="0"
              className={`w-24 rounded-xl border px-3 py-2 text-sm text-right text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400 ${rateError ? 'border-red-400' : 'border-slate-200'}`} />
            <span className="text-sm text-slate-600">%</span>
          </div>,
          rateError ? <p className="text-xs text-red-600 mt-1" role="alert">{rateError}</p> : null,
          'rate')}

        {row('Tips',
          'Customers paying online by card can add a tip. It all goes to you.',
          <Toggle on={tipping} ariaLabel="Tips"
            onToggle={() => { const next = !tipping; setTipping(next); void save({ tippingEnabled: next }, () => {}) }} />,
          <div className="mt-2">
            <p className="text-xs text-slate-500">Choices customers see:</p>
            <div className="mt-1 flex flex-wrap gap-1.5" data-tip-chips>
              {cs.tipPresetsPct.map(p => (
                <span key={p} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{formatRateBps(Math.round(p * 100))}%</span>
              ))}
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">Other amount</span>
            </div>
          </div>,
          'tips')}

        {truckKeeps && row('Online service fee',
          'Added to online orders only. Never on pay-at-the-truck or walk-up orders. You keep it.',
          <Toggle on={feeOn} ariaLabel="Online service fee"
            onToggle={() => { const next = !feeOn; setFeeOn(next); void save({ serviceFeeEnabled: next }, setFeeError) }} />,
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center gap-1.5 text-sm text-slate-700" data-fee-boxes>
              {maxPct !== null && (<>
                <input type="text" inputMode="decimal" aria-label="Service fee percentage" value={feePct}
                  onChange={e => setFeePct(e.target.value)} onBlur={() => { void save({ serviceFeePct: feePct }, setFeeError) }}
                  placeholder="0" className="w-16 rounded-xl border border-slate-200 px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-orange-400" />
                <span>%</span>
              </>)}
              {maxPct !== null && maxFixed !== null && <span className="px-1">+</span>}
              {maxFixed !== null && (<>
                <span>{money(0).replace(/[\d.,\s]/g, '')}</span>
                <input type="text" inputMode="decimal" aria-label="Service fee fixed amount" value={feeFixed}
                  onChange={e => setFeeFixed(e.target.value)} onBlur={() => { void save({ serviceFeeFixed: feeFixed }, setFeeError) }}
                  placeholder="0.00" className="w-20 rounded-xl border border-slate-200 px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </>)}
            </div>
            <p className="text-xs text-slate-500">Most you can charge: {feePhrase(maxPct, maxFixed, cs.currency, money)}</p>
            {feeError && <p className="text-xs text-red-600" role="alert">{feeError}</p>}
            <p className="text-xs text-slate-500">
              Customers see it before they pay, as one line: &ldquo;Online service fee {money(exampleFee)}&rdquo;.
            </p>
          </div>,
          'fee')}

        {hatchgrabKeeps && (
          <div className="py-3" data-charges-row="fee-hatchgrab">
            <p className="text-sm font-semibold text-slate-800">Online service fee</p>
            <p className="text-xs text-slate-500 mt-0.5">
              HatchGrab adds a {feePhrase(cs.serviceFeeHatchgrabBps, cs.serviceFeeHatchgrabFixedMinor, cs.currency, money)} service fee to your customers&apos; online orders. You don&apos;t pay it and can&apos;t change it.
            </p>
          </div>
        )}
      </div>
    </Card>
  )
}
