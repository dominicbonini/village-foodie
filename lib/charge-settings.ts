// lib/charge-settings.ts — Manage › Payments › "Tax, tips and fees": what each box holds, how it becomes a
// stored value, and every rule it must pass (Phase 3 screens, docs/phase-3-screens-report.md).
//
// PURE AND CLIENT-SAFE, like lib/admin/country-form.ts: the card checks a value before it sends it, and the
// `update_charges` action runs the SAME function again on what arrives, so the two can never disagree.
// Every refusal is a plain sentence a truck owner can act on; no message names a column.
import type { CountrySettings } from '@/lib/country-settings-types'
import { boxToBps } from '@/lib/admin/country-form'

/** The four country facts the card and the action read. */
export type ChargeCountry = Pick<CountrySettings,
  'name' | 'pricesIncludeTax' | 'serviceFeeAllowed' | 'serviceFeeRecipient'
  | 'serviceFeeTruckMaxBps' | 'serviceFeeTruckMaxFixedMinor' | 'currency'>

export const CHARGE_ERRORS = {
  rateDecimals: 'Use up to 3 decimal places, like 8.875.',
  rateRange: 'Use a rate from 0 to 20%.',
  rateNotHere: 'Prices in your country already include tax, so there is no rate to set.',
  feeNotHere: 'Online service fees aren’t available in your country.',
  feeHatchgrab: 'HatchGrab sets the online service fee in your country, so it can’t be changed here.',
  feePct: 'Use a percentage like 3 or 3.5.',
  feeFixed: 'Use an amount like 0.50.',
  feeOverPct: (max: string) => `The most you can charge is ${max}%.`,
  feeOverFixed: (max: string) => `The most you can charge is ${max}.`,
  feePartNotAllowed: 'That part of the fee isn’t allowed in your country.',
} as const

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
): { ok: true; values: ChargeSettingsValues } | { ok: false; error: string } {
  const values: ChargeSettingsValues = {}
  if ('taxRate' in input) {
    if (c.pricesIncludeTax) return { ok: false, error: CHARGE_ERRORS.rateNotHere }
    const v = rateBoxToMilli(String(input.taxRate ?? ''))
    if (v === 'decimals') return { ok: false, error: CHARGE_ERRORS.rateDecimals }
    if (v === 'bad') return { ok: false, error: CHARGE_ERRORS.rateRange }
    values.tax_rate_milli = v
  }
  if ('tippingEnabled' in input) {
    if (typeof input.tippingEnabled !== 'boolean') return { ok: false, error: 'Choose on or off.' }
    values.tipping_enabled = input.tippingEnabled
  }
  const feeKeys = ['serviceFeeEnabled', 'serviceFeePct', 'serviceFeeFixed'] as const
  if (feeKeys.some(k => k in input)) {
    // 🔴 NOTHING IS SAVED FOR A COUNTRY THAT DOES NOT ALLOW IT, OR WHERE HATCHGRAB SETS THE FEE.
    if (!c.serviceFeeAllowed) return { ok: false, error: CHARGE_ERRORS.feeNotHere }
    if (c.serviceFeeRecipient !== 'truck') return { ok: false, error: CHARGE_ERRORS.feeHatchgrab }
    if ('serviceFeeEnabled' in input) {
      if (typeof input.serviceFeeEnabled !== 'boolean') return { ok: false, error: 'Choose on or off.' }
      values.service_fee_enabled = input.serviceFeeEnabled
    }
    if ('serviceFeePct' in input) {
      const v = boxToBps(String(input.serviceFeePct ?? ''))
      if (v === 'bad') return { ok: false, error: CHARGE_ERRORS.feePct }
      if (v !== null && v > 0) {
        if (c.serviceFeeTruckMaxBps === null) return { ok: false, error: CHARGE_ERRORS.feePartNotAllowed }
        if (v > c.serviceFeeTruckMaxBps) return { ok: false, error: CHARGE_ERRORS.feeOverPct(pctText(c.serviceFeeTruckMaxBps)) }
      }
      values.service_fee_bps = v
    }
    if ('serviceFeeFixed' in input) {
      const v = moneyBoxToMinor(String(input.serviceFeeFixed ?? ''))
      if (v === 'bad') return { ok: false, error: CHARGE_ERRORS.feeFixed }
      if (v !== null && v > 0) {
        if (c.serviceFeeTruckMaxFixedMinor === null) return { ok: false, error: CHARGE_ERRORS.feePartNotAllowed }
        if (v > c.serviceFeeTruckMaxFixedMinor) return { ok: false, error: CHARGE_ERRORS.feeOverFixed(fmtMinor(c.serviceFeeTruckMaxFixedMinor)) }
      }
      values.service_fee_fixed_minor = v
    }
  }
  if (Object.keys(values).length === 0) return { ok: false, error: 'Nothing to save.' }
  return { ok: true, values }
}

/** Basis points as a percentage, as written: 400 → "4", 350 → "3.5". */
export function pctText(bps: number): string {
  const s = String(bps).padStart(3, '0')
  const whole = s.slice(0, -2).replace(/^0+(?=\d)/, '')
  const frac = s.slice(-2).replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole
}

/**
 * A small amount the way the mockup writes it: below one whole unit, in the currency's coin ("50¢",
 * "30p"); otherwise the normal money format. Currencies without a coin word use the money format.
 */
export function shortMoney(minor: number, currency: string, fmtMinor: (m: number) => string): string {
  const coin: Record<string, string> = { USD: '¢', CAD: '¢', AUD: 'c', NZD: 'c', EUR: 'c', GBP: 'p' }
  return minor > 0 && minor < 100 && coin[currency] ? `${minor}${coin[currency]}` : fmtMinor(minor)
}

/** "3% + 30¢", "4%", "50¢" — a fee or a maximum as one phrase. A part that is 0 or absent is left out. */
export function feePhrase(bps: number | null, fixedMinor: number | null, currency: string, fmtMinor: (m: number) => string): string {
  const parts: string[] = []
  if (bps) parts.push(`${pctText(bps)}%`)
  if (fixedMinor) parts.push(shortMoney(fixedMinor, currency, fmtMinor))
  return parts.join(' + ')
}
