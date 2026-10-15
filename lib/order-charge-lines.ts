// lib/order-charge-lines.ts — 🔴 THE ONE LIST OF TAX, FEE AND TIP LINES EVERY SCREEN DRAWS (Phase 3 screens,
// docs/phase-3-screens-report.md).
//
// PURE AND CLIENT-SAFE: no database, no formatting of money (each surface formats with its own money
// format), no React. The order page, the in-page confirmation, the status page, every customer email, the
// new-order email, the printed ticket, the dashboard card and the KDS all ask THIS for their lines, so the
// same order reads the same everywhere.
//
// ── 🔴 THE UK GETS NOTHING ───────────────────────────────────────────────────────────────────────────
// A line is drawn only when its amount is above zero, and "Subtotal" only when another line is. A UK
// order — tax included, no tip, no fee, no surcharge — gives an EMPTY list, so every surface that renders
// the list renders nothing new and stays byte-identical.

import { translatorFor } from '@/lib/i18n/translator'

/** The snapshot columns a line needs (lib/order-charges.ts). All optional: an older order has none. */
export interface ChargeLineSource {
  food_minor?: number | null
  tax_minor?: number | null
  tax_rate_milli?: number | null
  tax_label?: string | null
  tip_minor?: number | null
  tip_pct_bps?: number | null
  service_fee_minor?: number | null
  card_surcharge_minor?: number | null
}

export type ChargeLineKey = 'subtotal' | 'tax' | 'service_fee' | 'card_fee' | 'tip'

export interface ChargeLine {
  key: ChargeLineKey
  /** The words: "Subtotal", "Sales tax", "Online service fee", "Tip". */
  label: string
  /** A rate shown beside the words, small and grey on screen: "8.25%", "15%". Null when there is none. */
  rate: string | null
  minor: number
}

/**
 * Which words. The customer reads "Online service fee" and "Tip 15%"; the kitchen's ticket, the dashboard
 * card and the KDS read "Service fee" and "Tip" — the brief's two vocabularies, one function.
 */
export type ChargeLineAudience = 'customer' | 'kitchen'

/**
 * A rate in thousandths of a percent, as entered: 8250 → "8.25", 8875 → "8.875", 7000 → "7".
 * Integer arithmetic on the string — never `/ 1000`, which would print 8.875 as 8.874999….
 */
export function formatRateMilli(milli: number): string {
  const s = String(Math.abs(Math.trunc(milli))).padStart(4, '0')
  const whole = s.slice(0, -3).replace(/^0+(?=\d)/, '')
  const frac = s.slice(-3).replace(/0+$/, '')
  return `${milli < 0 ? '-' : ''}${frac ? `${whole}.${frac}` : whole}`
}
/** A percentage in basis points, as entered: 1500 → "15", 1250 → "12.5". */
export function formatRateBps(bps: number): string {
  return formatRateMilli(Math.trunc(bps) * 10)
}

const pos = (n: number | null | undefined): number => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : 0)

/** The lines, in the order every surface draws them, each only when non-zero. Empty for every UK order. */
export function chargeLinesFor(src: ChargeLineSource | null | undefined, audience: ChargeLineAudience = 'customer', locale?: string | null): ChargeLine[] {
  if (!src) return []
  // The words: messages/en-GB.json `charges` (Language Phase 1a). The tax label is the country's own data
  // (country_settings) and stays as it is stored; the rate is still written by hand — listed for later.
  const t = translatorFor(locale, 'charges')
  const tax = pos(src.tax_minor)
  const fee = pos(src.service_fee_minor)
  const card = pos(src.card_surcharge_minor)
  const tip = pos(src.tip_minor)
  const lines: ChargeLine[] = []
  if (tax > 0) {
    const label = String(src.tax_label ?? '').trim() || t('taxFallback')
    lines.push({ key: 'tax', label, rate: src.tax_rate_milli ? t('rate', { rate: formatRateMilli(src.tax_rate_milli) }) : null, minor: tax })
  }
  if (fee > 0) lines.push({ key: 'service_fee', label: audience === 'customer' ? t('serviceFeeCustomer') : t('serviceFee'), rate: null, minor: fee })
  if (card > 0) lines.push({ key: 'card_fee', label: t('cardFee'), rate: null, minor: card })
  if (tip > 0) {
    lines.push({
      key: 'tip', label: t('tip'),
      rate: audience === 'customer' && src.tip_pct_bps ? t('rate', { rate: formatRateBps(src.tip_pct_bps) }) : null,
      minor: tip,
    })
  }
  if (lines.length === 0) return []
  // 🔴 "Subtotal" IS THE FOOD AFTER ANY DISCOUNT — what the lines below it are added to.
  const food = typeof src.food_minor === 'number' && Number.isFinite(src.food_minor) ? Math.round(src.food_minor) : 0
  return [{ key: 'subtotal', label: t('subtotal'), rate: null, minor: food }, ...lines]
}

/** One line as plain text, for the text email and the CSV: "Sales tax 8.25%: $1.98". */
export function chargeLineText(line: ChargeLine, money: (minor: number) => string, locale?: string | null): string {
  const t = translatorFor(locale, 'charges')
  return line.rate
    ? t('lineWithRate', { label: line.label, rate: line.rate, amount: money(line.minor) })
    : t('line', { label: line.label, amount: money(line.minor) })
}

/** The snapshot columns off any row that carries them — a narrower object for a prop or a JSON key. */
export function chargeSourceOf(row: Record<string, unknown> | null | undefined): ChargeLineSource | null {
  if (!row) return null
  const n = (k: string) => (typeof row[k] === 'number' ? (row[k] as number) : row[k] == null ? null : Number(row[k]))
  return {
    food_minor: n('food_minor'), tax_minor: n('tax_minor'), tax_rate_milli: n('tax_rate_milli'),
    tax_label: typeof row.tax_label === 'string' ? row.tax_label : null,
    tip_minor: n('tip_minor'), tip_pct_bps: n('tip_pct_bps'),
    service_fee_minor: n('service_fee_minor'), card_surcharge_minor: n('card_surcharge_minor'),
  }
}

/** The charges for a JSON response, or undefined when there are none — so a UK response gains no key. */
export function chargesForResponse(row: Record<string, unknown> | null | undefined): ChargeLineSource | undefined {
  const src = chargeSourceOf(row)
  return chargeLinesFor(src).length ? (src as ChargeLineSource) : undefined
}
