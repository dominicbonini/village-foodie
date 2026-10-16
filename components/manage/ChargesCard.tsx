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
import { formatMinor, currencySymbol, editableMinor } from '@/lib/money-format'
import { applyBps } from '@/lib/order-charges'
import { formatRateMilli, formatRateBps } from '@/lib/order-charge-lines'
import { checkChargeSettings, feePhrase, pctText, type ChargeSettingsInput } from '@/lib/charge-settings'
// Language Phase 1d Part 2: the card's words are `manageCharges`; a refusal is an `errorsManage` code — the same one
// `update_charges` sends — worded here in the truck's locale; the example quotes the customer's own charge line
// (`charges.serviceFeeCustomer`), so it can never name a line the customer does not see.
import { useT } from '@/lib/i18n/use-t'
import '@/lib/i18n/catalog/manageCharges'
import '@/lib/i18n/catalog/errorsManage'
import '@/lib/i18n/catalog/charges'

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
  const t = useT('manageCharges')
  const tCharges = useT('charges')
  // A refusal's code and values, worded (lib/charge-settings.ts returns `errorsManage` codes).
  const tErr = useT('errorsManage') as unknown as (code: string, params?: Record<string, string>) => string
  const fmt = { currency: cs.currency, locale: cs.locale }
  const money = (minor: number) => formatMinor(minor, fmt)
  const [rate, setRate] = useState(truck.tax_rate_milli != null ? formatRateMilli(truck.tax_rate_milli) : '')
  const [rateError, setRateError] = useState<string | null>(null)
  const [tipping, setTipping] = useState(typeof truck.tipping_enabled === 'boolean' ? truck.tipping_enabled : cs.tippingEnabledDefault)
  const [feeOn, setFeeOn] = useState(truck.service_fee_enabled === true)
  const [feePct, setFeePct] = useState(truck.service_fee_bps ? pctText(truck.service_fee_bps) : '')
  const [feeFixed, setFeeFixed] = useState(truck.service_fee_fixed_minor ? editableMinor(truck.service_fee_fixed_minor, fmt) : '')
  const [feeError, setFeeError] = useState<string | null>(null)

  if (cs.pricesIncludeTax) return null

  const save = async (input: ChargeSettingsInput, onError: (e: string | null) => void) => {
    const r = checkChargeSettings(input, cs, money)
    if (!r.ok) { onError(tErr(r.code, r.params)); return false }
    onError(null)
    try {
      const res = await api('update_charges', input as Record<string, unknown>)
      if (res?.truck) onTruckUpdate(res.truck)
      return true
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('saveFailed')
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
      <h3 className="text-base font-bold text-slate-800">{t('heading')}</h3>
      <div className="divide-y divide-slate-100">
        {row(t('rate.label'),
          t('rate.hint'),
          <div className="flex items-center gap-1.5">
            <input type="text" inputMode="decimal" aria-label={t('rate.label')} value={rate}
              onChange={e => setRate(e.target.value)}
              onBlur={() => { void save({ taxRate: rate }, setRateError) }}
              placeholder="0"
              className={`w-24 rounded-xl border px-3 py-2 text-sm text-right text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400 ${rateError ? 'border-red-400' : 'border-slate-200'}`} />
            <span className="text-sm text-slate-600">%</span>
          </div>,
          rateError ? <p className="text-xs text-red-600 mt-1" role="alert">{rateError}</p> : null,
          'rate')}

        {row(t('tips.label'),
          t('tips.hint'),
          <Toggle on={tipping} ariaLabel={t('tips.label')}
            onToggle={() => { const next = !tipping; setTipping(next); void save({ tippingEnabled: next }, () => {}) }} />,
          <div className="mt-2">
            <p className="text-xs text-slate-500">{t('tips.choices')}</p>
            <div className="mt-1 flex flex-wrap gap-1.5" data-tip-chips>
              {cs.tipPresetsPct.map(p => (
                <span key={p} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{t('tips.chip', { rate: formatRateBps(Math.round(p * 100)) })}</span>
              ))}
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{t('tips.other')}</span>
            </div>
          </div>,
          'tips')}

        {truckKeeps && row(t('fee.label'),
          t('fee.hint'),
          <Toggle on={feeOn} ariaLabel={t('fee.label')}
            onToggle={() => { const next = !feeOn; setFeeOn(next); void save({ serviceFeeEnabled: next }, setFeeError) }} />,
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center gap-1.5 text-sm text-slate-700" data-fee-boxes>
              {maxPct !== null && (<>
                <input type="text" inputMode="decimal" aria-label={t('fee.pctAria')} value={feePct}
                  onChange={e => setFeePct(e.target.value)} onBlur={() => { void save({ serviceFeePct: feePct }, setFeeError) }}
                  placeholder="0" className="w-16 rounded-xl border border-slate-200 px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-orange-400" />
                <span>%</span>
              </>)}
              {maxPct !== null && maxFixed !== null && <span className="px-1">+</span>}
              {maxFixed !== null && (<>
                <span>{currencySymbol(fmt)}</span>
                <input type="text" inputMode="decimal" aria-label={t('fee.fixedAria')} value={feeFixed}
                  onChange={e => setFeeFixed(e.target.value)} onBlur={() => { void save({ serviceFeeFixed: feeFixed }, setFeeError) }}
                  placeholder="0.00" className="w-20 rounded-xl border border-slate-200 px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </>)}
            </div>
            <p className="text-xs text-slate-500">{t('fee.max', { max: feePhrase(maxPct, maxFixed, cs.currency, money) })}</p>
            {feeError && <p className="text-xs text-red-600" role="alert">{feeError}</p>}
            <p className="text-xs text-slate-500">
              {t('fee.example', { label: tCharges('serviceFeeCustomer'), amount: money(exampleFee) })}
            </p>
          </div>,
          'fee')}

        {hatchgrabKeeps && (
          <div className="py-3" data-charges-row="fee-hatchgrab">
            <p className="text-sm font-semibold text-slate-800">{t('fee.label')}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {t('fee.hatchgrab', { fee: feePhrase(cs.serviceFeeHatchgrabBps, cs.serviceFeeHatchgrabFixedMinor, cs.currency, money) })}
            </p>
          </div>
        )}
      </div>
    </Card>
  )
}
