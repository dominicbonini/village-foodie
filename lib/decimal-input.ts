// lib/decimal-input.ts — TYPED DECIMALS IN THE TRUCK'S LOCALE (france-1, 22 October 2026; languages-1 §8.2).
//
// PURE AND CLIENT-SAFE. A French operator types a price as "12,50". Every price and money box in Manage was parsed with
// parseFloat / Number, which reads "12,50" as 12. The separator comes from Intl, never a country check: a locale whose
// numbers are written with a decimal COMMA (fr-FR, de-DE, …) has its typed text normalised to "12.50" before the existing
// parse; a locale written with a decimal POINT (every English locale) is handed back EXACTLY what was typed, so its
// behaviour is byte-identical. Import-free on purpose (harnesses compile lib/ standalone).

const separators = new Map<string, '.' | ','>()

/** The decimal separator a locale writes, from Intl ("." for en-GB, "," for fr-FR). Unknown or broken → ".". */
export function decimalSeparatorOf(locale: string | null | undefined): '.' | ',' {
  const key = String(locale ?? '')
  let sep = separators.get(key)
  if (!sep) {
    try {
      const part = new Intl.NumberFormat(key || 'en-GB').formatToParts(1.5).find(p => p.type === 'decimal')?.value
      sep = part === ',' ? ',' : '.'
    } catch { sep = '.' }
    separators.set(key, sep)
  }
  return sep
}

/** True when the locale writes a decimal comma — the boxes then take "12,50". */
export const usesDecimalComma = (locale: string | null | undefined): boolean => decimalSeparatorOf(locale) === ','

/**
 * Typed text → the text the existing parsers read. A decimal-POINT locale: unchanged, character for character. A
 * decimal-COMMA locale: spaces (and no-break spaces, which French uses between thousands) dropped, the LAST comma becomes
 * the point and any other comma or point is a thousands mark ("1 234,50" → "1234.50", "12,5" → "12.5"); text with no
 * comma is kept as typed, so "12.50" still works.
 */
export function normaliseDecimal(raw: string, locale: string | null | undefined): string {
  if (!usesDecimalComma(locale)) return raw
  const s = String(raw ?? '').replace(/[\s  ]/g, '')
  const at = s.lastIndexOf(',')
  if (at < 0) return s
  return s.slice(0, at).replace(/[.,]/g, '') + '.' + s.slice(at + 1)
}

/** A stored number (or the text the box held) as a decimal-comma locale writes it in a box: "12.5" → "12,5". A
 *  decimal-point locale gets String(value), as every box always showed. */
export function decimalForInput(value: number | string | null | undefined, locale: string | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value)
  return usesDecimalComma(locale) ? s.replace('.', ',') : s
}
