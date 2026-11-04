// lib/accounts/tax-year.ts — costs-accounts-1 (4 November 2026, docs/costs-accounts-1-report.md): THE REPORT'S DATE PRESETS.
//
// PURE AND CLIENT-SAFE (no import). "This month", "Last month", "Last quarter" and "Last tax year", as inclusive
// YYYY-MM-DD ranges on the TRUCK'S calendar (the caller passes the truck-local today). Where a tax year starts is DATA — the
// truck's country's `country_settings.tax_year_start_month` / `tax_year_start_day` (GB 6 April, AU 1 July, NZ 1 April) — never a
// country check here or in a component. No start (NULL) = the calendar year, 1 January.
// "Last quarter" is the last whole calendar quarter (January–March, April–June, July–September, October–December).

export interface TaxYearStart { month: number; day: number }
export interface DateRange { from: string; to: string }
export type PresetKey = 'thisMonth' | 'lastMonth' | 'lastQuarter' | 'lastTaxYear'
export const PRESET_KEYS: readonly PresetKey[] = ['thisMonth', 'lastMonth', 'lastQuarter', 'lastTaxYear']

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
/** The day before a calendar date (UTC arithmetic on a date with no time — no zone can move it). */
function dayBefore(y: number, m: number, d: number): string {
  const t = new Date(Date.UTC(y, m - 1, d) - 86_400_000)
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
}
const lastDayOf = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()

/** A usable start, or null (= 1 January). Anything out of range is treated as no start, never guessed. */
export function taxYearStartOf(month: unknown, day: unknown): TaxYearStart | null {
  const m = Number(month), d = Number(day)
  if (!Number.isInteger(m) || !Number.isInteger(d) || m < 1 || m > 12 || d < 1 || d > 28) return null
  return m === 1 && d === 1 ? null : { month: m, day: d }
}

/** The tax year that contains `today` (inclusive range). */
export function taxYearContaining(today: string, start: TaxYearStart | null): DateRange {
  const [y, m, d] = today.split('-').map(Number)
  const sm = start?.month ?? 1, sd = start?.day ?? 1
  const startYear = m > sm || (m === sm && d >= sd) ? y : y - 1
  return { from: ymd(startYear, sm, sd), to: dayBefore(startYear + 1, sm, sd) }
}

/** The four presets for a truck-local `today` (YYYY-MM-DD). "This month" ends today; the others are whole past periods. */
export function datePresets(today: string, start: TaxYearStart | null): Record<PresetKey, DateRange> {
  const [y, m] = today.split('-').map(Number)
  const lm = m === 1 ? 12 : m - 1, ly = m === 1 ? y - 1 : y
  const q = Math.floor((m - 1) / 3)                     // this quarter: 0..3
  const lq = q === 0 ? 3 : q - 1, lqy = q === 0 ? y - 1 : y
  const current = taxYearContaining(today, start)
  const [cy, cm, cd] = current.from.split('-').map(Number)
  return {
    thisMonth: { from: ymd(y, m, 1), to: today },
    lastMonth: { from: ymd(ly, lm, 1), to: ymd(ly, lm, lastDayOf(ly, lm)) },
    lastQuarter: { from: ymd(lqy, lq * 3 + 1, 1), to: ymd(lqy, lq * 3 + 3, lastDayOf(lqy, lq * 3 + 3)) },
    lastTaxYear: { from: ymd(cy - 1, cm, cd), to: dayBefore(cy, cm, cd) },
  }
}

/** Which preset a range is (for the picker to show), or null for a custom range. */
export function presetOf(range: DateRange, today: string, start: TaxYearStart | null): PresetKey | null {
  const p = datePresets(today, start)
  return PRESET_KEYS.find(k => p[k].from === range.from && p[k].to === range.to) ?? null
}
