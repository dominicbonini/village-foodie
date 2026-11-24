// lib/price-units.ts — 🔴 ONE PLACE FOR A COMPETITOR PRICE'S UNIT (compare-fix-1, 24 November 2026; docs/compare-fix-1-report.md).
// PURE. compare-status-1 §1.4 found 14 plans stored 100× too high: the checker's prompt showed the model stored prices in MINOR
// units ("2900 EUR = 29.00 €"), the model sometimes answered `amount` in minor units, and planColsOf multiplied by 100 again.
//
// The rules, end to end:
//   • the extractor is told `amount` is the price AS PRINTED, in the currency's normal (major) units (lib/competitor-check/model.ts),
//     and is shown stored prices in major units too (lib/competitor-check/prompts.ts);
//   • resolveAmountMinor() reads the printed price back out of the finding's own words (found_value / quote) and decides the unit
//     from it: equal to a printed number → major (× 10^digits); equal to a printed number × 10^digits → it was already minor (kept);
//   • a monthly price above PLAUSIBLE_MONTHLY_MAX for its currency is NOT stored: it is marked unclear (implausible: true);
//   • the research importer takes MAJOR units explicitly (`monthly_major`), converts with toMinorUnits, and applies the same guard.
import { minorDigits, toMinorUnits } from '@/lib/money-format'
import { numbersIn } from '@/lib/enquiries/rules'

/** The highest plausible MONTHLY price for food-ordering software, in each currency's major units — about US$1,500 a month.
 *  Above it the amount is almost certainly a unit slip (cents read as euros), so it is never stored as a price. A currency not
 *  listed has no ceiling (the printed-number check still runs). Rough levels, Nov 2026; generous on purpose. */
export const PLAUSIBLE_MONTHLY_MAX: Readonly<Record<string, number>> = {
  USD: 1500, EUR: 1500, GBP: 1200, CHF: 1400, CAD: 2000, AUD: 2300, NZD: 2500, SGD: 2000, HKD: 12000, MYR: 7000, THB: 55000,
  JPY: 230000, KRW: 2000000, CNY: 11000, TWD: 48000, INR: 125000, IDR: 24000000, PHP: 85000, VND: 38000000, BRL: 8000, MXN: 27000,
  CLP: 1400000, COP: 6000000, PEN: 5600, ARS: 1500000, DKK: 11000, SEK: 16000, NOK: 16000, ISK: 210000, PLN: 6000, CZK: 35000,
  HUF: 550000, RON: 7000, BGN: 2700, RSD: 160000, TRY: 50000, AED: 5500, SAR: 5600, QAR: 5500, ZAR: 27000, NGN: 2400000,
  EGP: 72000, ILS: 5500, UAH: 62000, KZT: 750000, GEL: 4000, MAD: 15000, GIP: 1200,
}

/** True when a MONTHLY amount in major units is above its currency's ceiling (false for a currency with none). */
export function implausibleMonthly(major: number, currency: string): boolean {
  const max = PLAUSIBLE_MONTHLY_MAX[currency.toUpperCase()]
  return typeof max === 'number' && major > max
}

const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.005, Math.abs(b) * 1e-6)

export interface ResolvedAmount {
  /** The amount in minor units, or null when there is none (or it must not be stored). */
  minor: number | null
  /** How the unit was decided. */
  unit: 'major' | 'minor' | 'assumed_major' | 'none'
  /** The monthly amount is above its currency's ceiling: mark the price unclear, never store it. */
  implausible: boolean
}

/** 🔴 THE amount → minor units rule. `amount` as the finding gives it; `words` the finding's own text (found_value, quote) where
 *  the printed price is; `period` 'year' divides by 12 for the plausibility check (the caller stores the monthly figure). */
export function resolveAmountMinor(amount: unknown, currency: string, words: readonly (string | null | undefined)[] = [], period: string | null = null): ResolvedAmount {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) return { minor: null, unit: 'none', implausible: false }
  const d = minorDigits(currency)
  const printed = words.filter((w): w is string => typeof w === 'string' && !!w.trim()).flatMap(w => numbersIn(w).flatMap(n => n.values))
  let minor: number, unit: ResolvedAmount['unit']
  if (printed.some(v => close(v, amount))) { minor = toMinorUnits(amount, currency); unit = 'major' }
  else if (d > 0 && Number.isInteger(amount) && printed.some(v => close(v, amount / 10 ** d))) { minor = amount; unit = 'minor' }
  else { minor = toMinorUnits(amount, currency); unit = 'assumed_major' }
  const monthlyMajor = minor / 10 ** d / (period === 'year' ? 12 : 1)
  return implausibleMonthly(monthlyMajor, currency) ? { minor: null, unit, implausible: true } : { minor, unit, implausible: false }
}
