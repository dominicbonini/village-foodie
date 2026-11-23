// lib/accounts/periods.ts — france-records-1 (24 November 2026, docs/france-records-1-report.md): THE DAILY-TOTALS FILE'S PERIOD PRESETS.
//
// PURE AND CLIENT-SAFE. The period a French truck reports its takings for follows its VAT regime (Dominic, the brief):
//   franchise en base        → two-month blocks: Jan–Feb, Mar–Apr, May–Jun, Jul–Aug, Sep–Oct, Nov–Dec;
//   réel simplifié           → the calendar month;
//   réel normal, monthly     → thirds of the month: 1–10, 11–20, 21 to the month's end;
//   réel normal, quarterly   → the calendar month;
//   no regime, or not France → the calendar month.
// A custom range is always allowed (the screen offers it). Dates are YYYY-MM-DD on the truck's own calendar.
import { hasVatRegime, type VatRegime } from '@/lib/business-details'

export type PeriodKind = 'two_months' | 'month' | 'thirds'
export interface Period { kind: PeriodKind; from: string; to: string }

export function periodKindFor(country: string | null | undefined, regime: VatRegime | string | null | undefined): PeriodKind {
  if (!hasVatRegime(country)) return 'month'
  if (regime === 'franchise') return 'two_months'
  if (regime === 'reel_normal_monthly') return 'thirds'
  return 'month'
}

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()   // m 1–12

/** The period of `kind` that contains `day` (YYYY-MM-DD). */
export function periodContaining(kind: PeriodKind, day: string): Period {
  const [y, m, d] = day.split('-').map(Number)
  if (kind === 'month') return { kind, from: ymd(y, m, 1), to: ymd(y, m, daysIn(y, m)) }
  if (kind === 'two_months') { const start = m % 2 === 1 ? m : m - 1; return { kind, from: ymd(y, start, 1), to: ymd(y, start + 1, daysIn(y, start + 1)) } }
  const [a, b] = d <= 10 ? [1, 10] : d <= 20 ? [11, 20] : [21, daysIn(y, m)]
  return { kind, from: ymd(y, m, a), to: ymd(y, m, b) }
}

/** The period just before `p`. */
export function previousPeriod(p: Period): Period {
  const [y, m, d] = p.from.split('-').map(Number)
  const prevDay = new Date(Date.UTC(y, m - 1, d - 1))
  return periodContaining(p.kind, ymd(prevDay.getUTCFullYear(), prevDay.getUTCMonth() + 1, prevDay.getUTCDate()))
}

/** The `n` most recent periods ending on or after `today`'s period, newest first: [the current one, the one before, …]. */
export function recentPeriods(kind: PeriodKind, today: string, n = 6): Period[] {
  const out: Period[] = [periodContaining(kind, today)]
  while (out.length < n) out.push(previousPeriod(out[out.length - 1]))
  return out
}

/** The preset the screen starts on: the last COMPLETE period (the one before today's). */
export const defaultPeriod = (kind: PeriodKind, today: string): Period => previousPeriod(periodContaining(kind, today))
