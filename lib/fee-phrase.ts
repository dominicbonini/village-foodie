// lib/fee-phrase.ts — a fee written as one short phrase ("3% + 30¢"), PURE and client-safe. Moved out of
// lib/charge-settings.ts unchanged (legal follow-ups, 19 October 2026) so the customer's order page can use it without
// that module's imports (its refusal catalogue). lib/charge-settings.ts re-exports all three.

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
