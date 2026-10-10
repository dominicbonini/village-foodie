// lib/money-format.ts — THE formatter for price and fee labels. Pure, client-safe, no imports.
//
// Every label takes its currency and locale from a country_settings row (moneyFormatOf in
// lib/country-settings-types.ts). Nothing here knows a country.
//
// ── 🔴 THE GB OUTPUT IS BYTE-IDENTICAL TO THE HELPERS IT REPLACES ─────────────────────────────────────
//   planPriceLabel(2900)            "£29/mo"       → perMonthLabel(2900, gb)
//   allowanceAmountLabel(150000)    "£1,500"       → formatWholeAmount(150000, gb)
//   pctLabel({ pct: 0.99 })         "0.99%"        → pctLabel(0.99, gb)
//   feeLabel({ pct: 1.5, pence: 20 }) "1.5% + 20p" → feeLabel({ pct: 1.5, fixedMinor: 20 }, gb)
// scripts/country-settings-parity.cjs proves it on every value the app renders, and on neighbours.
//
// ⚠️ TWO KNOWN DIFFERENCES, BOTH ON INPUTS NOTHING RENDERS TODAY, BOTH IN THE NEW CODE'S FAVOUR:
//   • a monthly price of £1,000 or more is now grouped ("£1,000/mo"); the old helper printed "£1000/mo";
//   • a fixed fee of a whole unit or more is now an amount ("£1.20"); the old helper printed "120p".
//
// ── ⚠️ WHY Intl, GIVEN THE MANUAL'S WARNING (V11.38) ────────────────────────────────────────────────
// The manual records that a locale formatter is not deterministic across runtimes: a trimmed-ICU build
// renders "£1500" where a full one renders "£1,500", and allowanceAmountLabel deliberately avoided
// toLocaleString for that reason. That was true of the build host it was written against. Node 22 ships
// full ICU, Vercel's Node runtime is full-ICU, and every browser is. The parity harness renders these
// labels in Node AND in Chromium and WebKit and fails if any engine disagrees — so the risk the manual
// names is now measured rather than avoided by hand-rolling.

export interface MoneyFormat { currency: string; locale: string }

const cache = new Map<string, Intl.NumberFormat>()
function nf(locale: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = locale + '|' + JSON.stringify(opts)
  let f = cache.get(key)
  if (!f) { f = new Intl.NumberFormat(locale, opts); cache.set(key, f) }
  return f
}

/** How many minor units make one major unit's decimal places: 2 for GBP and USD, 0 for JPY. Read from
 *  Intl rather than assumed, because "never hardcode ×100" (manual §16) — zero-decimal currencies exist. */
export function minorDigits(currency: string): number {
  return nf('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
}

/** Minor units → major units (2900 → 29 for GBP). The one division in this module. */
export function toMajor(minor: number, currency: string): number {
  return minor / 10 ** minorDigits(currency)
}

/** "£1,500" — whole major units, rounded. For allowances and headline figures. */
export function formatWholeAmount(minor: number, f: MoneyFormat): string {
  return nf(f.locale, { style: 'currency', currency: f.currency, minimumFractionDigits: 0, maximumFractionDigits: 0 })
    .format(Math.round(toMajor(minor, f.currency)))
}

/** "£29", or "£29.50" when there are minor units. The fraction appears only when it is not zero, so a
 *  future £29.50 plan renders correctly without this being revisited. */
export function formatAmount(minor: number, f: MoneyFormat): string {
  const digits = minorDigits(f.currency)
  const whole = Math.round(minor) % 10 ** digits === 0
  return nf(f.locale, {
    style: 'currency', currency: f.currency,
    minimumFractionDigits: whole ? 0 : digits, maximumFractionDigits: whole ? 0 : digits,
  }).format(toMajor(minor, f.currency))
}

/** "£29/mo" (or "£29/month"). The ONLY place a monthly price becomes a string. */
export function perMonthLabel(minor: number, f: MoneyFormat, unit: 'mo' | 'month' = 'mo'): string {
  return `${formatAmount(minor, f)}/${unit}`
}

/** "0.99%", "1.5%" — percent AS WRITTEN (0.99 means 0.99%). Up to two decimals, no trailing zeros. */
export function pctLabel(pct: number, f: Pick<MoneyFormat, 'locale'>): string {
  return nf(f.locale, { style: 'percent', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(pct / 100)
}

// The minor unit's own symbol, where a small fee is written in it ("20p", "30¢"). A currency missing from
// this list writes a small fee as an ordinary amount ("€0.20"), which is correct if less idiomatic.
const MINOR_SUFFIX: Record<string, string> = { GBP: 'p', USD: '¢', CAD: '¢', AUD: 'c', NZD: 'c', EUR: 'c' }

/** The minor unit's own symbol — "p" for GBP, "¢" for USD — or null where a currency has none listed here.
 *  The admin Countries page shows it beside a fixed-fee box. */
export function minorUnitSuffix(currency: string): string | null {
  return MINOR_SUFFIX[currency] ?? null
}

/** "20p", "30¢" — a small fixed fee in minor units. A whole unit or more is written as an amount. */
export function smallFeeLabel(minor: number, f: MoneyFormat): string {
  const suffix = MINOR_SUFFIX[f.currency]
  if (suffix && Math.abs(minor) < 10 ** minorDigits(f.currency)) {
    return nf(f.locale, { maximumFractionDigits: 0 }).format(minor) + suffix
  }
  return formatAmount(minor, f)
}

/** "1.5% + 20p" — the ONLY place a card fee becomes a string. */
export function feeLabel(fee: { pct: number; fixedMinor: number }, f: MoneyFormat): string {
  return `${pctLabel(fee.pct, f)} + ${smallFeeLabel(fee.fixedMinor, f)}`
}

/** "£" for GBP in en-GB, "$" for USD in en-US — the symbol a price-rule label puts beside its box. */
export function currencySymbol(f: MoneyFormat): string {
  const part = nf(f.locale, { style: 'currency', currency: f.currency, minimumFractionDigits: 0, maximumFractionDigits: 0 })
    .formatToParts(0).find(p => p.type === 'currency')
  return part?.value ?? f.currency
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════
// ORDER AND MENU AMOUNTS (Phase 2A, the money sweep) — every £ an order, a ticket, an email or a menu
// shows comes from here, in the ORDER's currency (or, before there is an order, the truck's).
//
// ── 🔴 BYTE-IDENTICAL TO THE `£${n.toFixed(2)}` IT REPLACES, IN GB ──────────────────────────────────────
//   • the currency's own decimals (2 for GBP/USD), ALWAYS shown — "£12.00", never "£12";
//   • NO thousands separator by default — orders, tickets and emails have printed "£1234.56" since launch,
//     and a ticket's columns are counted in characters;
//   • ROUNDED BY toFixed, THEN FORMATTED BY Intl. The two round differently: toFixed rounds the double's
//     EXACT binary value (1.005 is 1.00499…, so "1.00"), Intl rounds its shortest decimal form ("1.005",
//     so "1.01"). The old code was toFixed, so toFixed decides the digits and Intl only lays them out —
//     the figure Intl receives already has no more decimals than the currency's. Never pre-multiplied
//     either: `Math.round(x*100)` is a third answer (1.115*100 is 111.5 in floating point).
//   • A NEGATIVE KEEPS ITS MINUS DIRECTLY BEFORE THE DIGITS — "£-20.00", as `£${n.toFixed(2)}` printed it,
//     not Intl's "-£20.00". No screen means to show a negative amount (each one that can go below zero
//     writes its own "−" beside Math.abs), so where one appears it is a fault upstream, and it should
//     look exactly as it did; for a symbol that trails ("20,00 €") the minus still leads the digits.
//   • −0 and anything that rounds to zero print as zero, unsigned. (toFixed printed "£-0.00" for a tiny
//     negative; nothing renders one, and "£0.00" is what it meant.)
// scripts/money-sweep-parity.cjs proves it against a snapshot of every surface taken before the sweep.
// ════════════════════════════════════════════════════════════════════════════════════════════════════

/** The {currency, locale} a truck's screens carry, plus the locale of every country its orders came from
 *  (an order is shown in ITS currency, with its own country's locale). From /api/dashboard. */
export interface TruckMoney extends MoneyFormat { localeByCountry?: Record<string, string> }

export interface AmountOptions {
  /** Thousands separators. OFF by default — see above. */
  grouping?: boolean
  /** "£12" for a whole amount, "£12.50" otherwise — event-pricing rule labels only. */
  trimWhole?: boolean
  /** Decimals other than the currency's own — the /compare page's whole-unit headline figures only. */
  decimals?: number
  /** "-£5" rather than "£-5" — the /compare page, whose own helper always wrote its sign first. */
  minusBeforeSymbol?: boolean
}

/** The amount rounded to the currency's decimals exactly as toFixed rounds it, with −0 (and anything that
 *  rounds to zero) as an unsigned 0. */
function rounded(major: number, digits: number): number {
  const r = Number(Number(major).toFixed(digits))
  return r === 0 ? 0 : r
}

/** "£43.90" — an amount in MAJOR units (an order's 43.9, a menu price), in this format's currency. */
export function formatMajor(major: number, f: MoneyFormat, opts: AmountOptions = {}): string {
  const digits = opts.decimals ?? minorDigits(f.currency)
  const n = rounded(major, digits)
  const whole = opts.trimWhole === true && Number.isInteger(n)
  const parts = nf(f.locale, {
    style: 'currency', currency: f.currency, useGrouping: opts.grouping === true,
    minimumFractionDigits: whole ? 0 : digits, maximumFractionDigits: whole ? 0 : digits,
  }).formatToParts(Math.abs(n))
  if (opts.minusBeforeSymbol) return (n < 0 ? '-' : '') + parts.map(p => p.value).join('')
  return minusBeforeDigits(parts, n < 0)
}

/** Joins Intl parts, with a "-" immediately before the first digit when the amount is negative. */
function minusBeforeDigits(parts: Intl.NumberFormatPart[], negative: boolean): string {
  let out = '', placed = !negative
  for (const p of parts) {
    if (!placed && p.type === 'integer') { out += '-'; placed = true }
    out += p.value
  }
  return out
}

/** "£43.90" from MINOR units (4390) — ledger amounts, refunds, balances. */
export function formatMinor(minor: number, f: MoneyFormat, opts: AmountOptions = {}): string {
  return formatMajor(toMajor(minor, f.currency), f, opts)
}

/** "43.90" — the figure alone, with the currency's decimals and no symbol. For a box with the symbol
 *  printed beside it, and for a printer that cannot encode the symbol ("EUR 43.90"). */
export function formatMajorNumber(major: number, f: MoneyFormat, opts: Pick<AmountOptions, 'grouping'> = {}): string {
  const digits = minorDigits(f.currency)
  const n = rounded(major, digits)
  return minusBeforeDigits(
    nf(f.locale, { useGrouping: opts.grouping === true, minimumFractionDigits: digits, maximumFractionDigits: digits }).formatToParts(Math.abs(n)),
    n < 0,
  )
}

/** An existing order's format: ITS currency, with its own country's locale (else the truck's). Null when the
 *  order carries no currency — a caller that must not break (the KDS, a printer) then prints bare figures. */
export function orderMoney(
  order: { currency?: string | null; country?: string | null } | null | undefined,
  truck: TruckMoney | null | undefined,
): MoneyFormat | null {
  const currency = order?.currency || null
  if (!currency) return null
  const locale = (order?.country && truck?.localeByCountry?.[order.country]) || truck?.locale || null
  return locale ? { currency, locale } : null
}

// ── 🔴 THE KITCHEN NEVER BREAKS AND NEVER GUESSES ───────────────────────────────────────────────────────
// The KDS, the printed ticket and the offline paths must render whatever they are given. A missing format
// prints the amount with NO symbol and logs one warning per place — never a £ it cannot vouch for, and
// never a throw in front of a cook.
const warned = new Set<string>()
function warnOnce(where: string): void {
  if (warned.has(where)) return
  warned.add(where)
  console.warn(`[money] ${where}: no currency for this amount — printing it without a symbol`)
}

/** formatMajor, or the bare figure ("43.90") and one warning when there is no format. */
export function formatMajorOrBare(major: number, f: MoneyFormat | null | undefined, where: string, opts: AmountOptions = {}): string {
  if (f && f.currency && f.locale) return formatMajor(major, f, opts)
  warnOnce(where)
  return rounded(major, 2).toFixed(2)
}

/** formatMinor, or the bare figure and one warning when there is no format. */
export function formatMinorOrBare(minor: number, f: MoneyFormat | null | undefined, where: string, opts: AmountOptions = {}): string {
  if (f && f.currency && f.locale) return formatMinor(minor, f, opts)
  warnOnce(where)
  return rounded(Number(minor) / 100, 2).toFixed(2)
}

/** The symbol for a box's prefix ("£", "$"), or nothing (and one warning) when there is no format. */
export function currencySymbolOrBare(f: MoneyFormat | null | undefined, where = 'price box'): string {
  if (f && f.currency && f.locale) return currencySymbol(f)
  warnOnce(where)
  return ''
}

/** "10.75" — the figure an editable price box starts with: machine-readable (a "." decimal point, no
 *  separators, whatever the locale), with the currency's own decimals. Not a display string. */
export function editableAmount(major: number, f: MoneyFormat | null | undefined): string {
  return rounded(major, f && f.currency ? minorDigits(f.currency) : 2).toFixed(f && f.currency ? minorDigits(f.currency) : 2)
}

/** editableAmount from MINOR units — the currency's own decimals; 2 when there is no format. */
export function editableMinor(minor: number, f: MoneyFormat | null | undefined): string {
  return f && f.currency ? editableAmount(toMajor(minor, f.currency), f) : rounded(Number(minor) / 100, 2).toFixed(2)
}
