// lib/charge-settings.ts — Manage › Payments › "Tax, tips and fees": what each box holds, how it becomes a
// stored value, and every rule it must pass (Phase 3 screens, docs/phase-3-screens-report.md).
//
// PURE AND CLIENT-SAFE, like lib/admin/country-form.ts: the card checks a value before it sends it, and the
// `update_charges` action runs the SAME function again on what arrives, so the two can never disagree.
// Every refusal is a plain sentence a truck owner can act on; no message names a column.
// ⚠️ LANGUAGE PHASE 1d PART 2: a refusal is a CODE (`errorsManage.charges_*` in messages/en-GB.json) and its values.
// `update_charges` sends it with manageErrorBody in the truck's language; the card words it with `useT('errorsManage')`.
// `error` is the same message in en-GB (one source, no second copy) for anything that reads the sentence directly.
// The coin table, the "%" figures and the money amounts stay code: they are passed into the messages ready-made.
import type { CountrySettings } from '@/lib/country-settings-types'
import { boxToBps } from '@/lib/admin/country-form'
import type { ManageErrorCode } from '@/lib/i18n/manage-errors'
import { translatorFor } from '@/lib/i18n/translator'
import { DEFAULT_LOCALE } from '@/lib/i18n/locales'
import '@/lib/i18n/catalog/errorsManage'
import { includedTaxOf } from '@/lib/address-formats'   // france-1

/** The four country facts the card and the action read. */
export type ChargeCountry = Pick<CountrySettings,
  'name' | 'pricesIncludeTax' | 'serviceFeeAllowed' | 'serviceFeeRecipient' | 'addressFormat'
  | 'serviceFeeTruckMaxBps' | 'serviceFeeTruckMaxFixedMinor' | 'currency'>

/** A refusal's code: an `errorsManage` key that starts `charges_`. */
export type ChargeErrorCode = Extract<ManageErrorCode, `charges_${string}`>
export type ChargeRefusal = { ok: false; error: string; code: ChargeErrorCode; params: Record<string, string> }

const gbErr = translatorFor(DEFAULT_LOCALE, 'errorsManage') as unknown as (code: string, params?: Record<string, string>) => string
/** A refusal: its code, its values, and the en-GB sentence (`error`). */
function refusal(code: ChargeErrorCode, params: Record<string, string> = {}): ChargeRefusal {
  return { ok: false, error: gbErr(code, params), code, params }
}

/** A typed rate → thousandths of a percent, by string arithmetic ("8.875" → 8875). '' → null. */
export function rateBoxToMilli(text: string): number | null | 'decimals' | 'bad' {
  const t = text.trim()
  if (t === '') return null
  const m = t.match(/^(\d+)(?:\.(\d+))?$/)
  if (!m) return 'bad'
  if ((m[2] ?? '').length > 3) return 'decimals'
  const n = Number(m[1] + (m[2] ?? '').padEnd(3, '0'))
  return n >= 0 && n <= 20000 ? n : 'bad'
}

/** A typed amount in major units → minor units ("0.50" → 50), two decimals. '' → null. */
export function moneyBoxToMinor(text: string): number | null | 'bad' {
  const t = text.trim().replace(/,/g, '')
  if (t === '') return null
  const m = t.match(/^(\d+)(?:\.(\d{1,2}))?$/)
  if (!m) return 'bad'
  const n = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'))
  return Number.isSafeInteger(n) ? n : 'bad'
}

/** What one save may carry. Every key optional: each control saves its own field. */
export interface ChargeSettingsInput {
  taxRate?: unknown          // the typed text, e.g. "8.875"
  tippingEnabled?: unknown   // boolean
  serviceFeeEnabled?: unknown
  serviceFeePct?: unknown    // typed text, e.g. "3"
  serviceFeeFixed?: unknown  // typed text in major units, e.g. "0.30"
}

/** The stored columns, only those the input named. */
export interface ChargeSettingsValues {
  tax_rate_milli?: number | null
  tipping_enabled?: boolean
  service_fee_enabled?: boolean
  service_fee_bps?: number | null
  service_fee_fixed_minor?: number | null
}

/**
 * Check one save against the truck's country. Returns the columns to write, or the first problem.
 * ⚠️ `fmtMinor` formats a minor amount for the refusal sentence in the truck's own money.
 */
export function checkChargeSettings(
  input: ChargeSettingsInput,
  c: ChargeCountry,
  fmtMinor: (minor: number) => string,
): { ok: true; values: ChargeSettingsValues } | ChargeRefusal {
  const values: ChargeSettingsValues = {}
  if ('taxRate' in input) {
    // france-1: a country whose prices INCLUDE a tax its receipts word (France's TVA) takes the rate those prices include.
    if (c.pricesIncludeTax && !includedTaxOf(c.addressFormat)) return refusal('charges_rate_not_here')
    const v = rateBoxToMilli(String(input.taxRate ?? ''))
    if (v === 'decimals') return refusal('charges_rate_decimals')
    if (v === 'bad') return refusal('charges_rate_range')
    values.tax_rate_milli = v
  }
  if ('tippingEnabled' in input) {
    if (typeof input.tippingEnabled !== 'boolean') return refusal('charges_choose_on_off')
    values.tipping_enabled = input.tippingEnabled
  }
  const feeKeys = ['serviceFeeEnabled', 'serviceFeePct', 'serviceFeeFixed'] as const
  if (feeKeys.some(k => k in input)) {
    // 🔴 NOTHING IS SAVED FOR A COUNTRY THAT DOES NOT ALLOW IT, OR WHERE HATCHGRAB SETS THE FEE.
    if (!c.serviceFeeAllowed) return refusal('charges_fee_not_here')
    if (c.serviceFeeRecipient !== 'truck') return refusal('charges_fee_hatchgrab')
    if ('serviceFeeEnabled' in input) {
      if (typeof input.serviceFeeEnabled !== 'boolean') return refusal('charges_choose_on_off')
      values.service_fee_enabled = input.serviceFeeEnabled
    }
    if ('serviceFeePct' in input) {
      const v = boxToBps(String(input.serviceFeePct ?? ''))
      if (v === 'bad') return refusal('charges_fee_pct')
      if (v !== null && v > 0) {
        if (c.serviceFeeTruckMaxBps === null) return refusal('charges_fee_part_not_allowed')
        if (v > c.serviceFeeTruckMaxBps) return refusal('charges_fee_over_pct', { max: pctText(c.serviceFeeTruckMaxBps) })
      }
      values.service_fee_bps = v
    }
    if ('serviceFeeFixed' in input) {
      const v = moneyBoxToMinor(String(input.serviceFeeFixed ?? ''))
      if (v === 'bad') return refusal('charges_fee_fixed')
      if (v !== null && v > 0) {
        if (c.serviceFeeTruckMaxFixedMinor === null) return refusal('charges_fee_part_not_allowed')
        if (v > c.serviceFeeTruckMaxFixedMinor) return refusal('charges_fee_over_fixed', { max: fmtMinor(c.serviceFeeTruckMaxFixedMinor) })
      }
      values.service_fee_fixed_minor = v
    }
  }
  if (Object.keys(values).length === 0) return refusal('charges_nothing_to_save')
  return { ok: true, values }
}

// pctText, shortMoney and feePhrase moved to lib/fee-phrase.ts (legal follow-ups, 19 October 2026) — pure, so the
// customer's order page can word its service-fee notice without importing this module's refusal catalogue.
import { pctText, shortMoney, feePhrase } from '@/lib/fee-phrase'
export { pctText, shortMoney, feePhrase }
