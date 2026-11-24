// lib/receipt.ts — france-receipts-1 (24 November 2026, docs/france-receipts-1-report.md): WHAT A CUSTOMER RECEIPT SAYS BEYOND ITS
// LINES AND TOTALS — the receipt number, the date and time of sale, the truck's business details and, for an order sold under France's
// franchise en base, the « TVA non applicable, art. 293 B du CGI » line. ONE source for the three approved outputs: the customer
// confirmation email (lib/email.ts), the status page (/order/<key>/manage, through /api/orders/[id]) and the printed ticket
// (lib/printing/mapOrderToTicket.ts). PURE AND CLIENT-SAFE (the ticket is mapped in the browser): no database, no React.
//
//   receipt number     orders.receipt_no (france-records-1's gap-free per-truck counter) — only when set; older orders have none.
//   date of sale       orders.placed_at (else created_at: a walk-up row has no placed_at) on the truck's clock, in the locale's usual
//                      short numeric date and the truck's clock style — France « 24/11/2026 12:41 », GB "24/11/2026 12:41",
//                      US "11/24/2026 12:41 PM".
//   business details   only the fields the truck has filled in, nothing at all if none: legal name; registered address in the truck's
//                      address format; registration number — France "SIRET" (14 digits) / "SIREN" (9), spaced 732 829 320 00074 (on the
//                      ticket: digits only), GB "Company no.", elsewhere "Registration no."; the VAT number — "{label} no." with the
//                      order's own tax name (France « N° TVA »).
//   franchise en base  FRANCE ONLY, read from the ORDER (orders.vat_regime — the truck's regime when the order was placed, stamped by
//                      20261126_france_receipts_1), and only while the order carries no tax at all: an order placed under franchise
//                      keeps its line after the truck changes regime, and an order the deployed code taxed is never told it was exempt.
//                      The words are French legal wording, used exactly, whatever the customer's language.
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/charges'
import { hasVatRegime, registrationKindOf } from '@/lib/business-details'
import { eventAddressLine } from '@/lib/event-address'
import { formatInstantClock, formatNumericDate, localDateOfInstant, timeSettingsOr, type TimeSettings } from '@/lib/time-utils'
import type { TaxBook } from '@/lib/order-tax'

/** French legal wording (CGI art. 293 B) — exactly this, for French trucks only. */
export const FRANCHISE_NOTE_FR = 'TVA non applicable, art. 293 B du CGI'

/** Does franchise en base apply to a NEW order on this truck now? France, regime = franchise. */
export function franchiseApplies(country: string | null | undefined, regime: string | null | undefined): boolean {
  return hasVatRegime(country) && regime === 'franchise'
}
/** The price book with every dish at 0 % — the truck's saved rates are untouched (they come back when the regime changes). */
export function franchiseTaxBook(book: TaxBook): TaxBook {
  const out: TaxBook = {}
  for (const [name, e] of Object.entries(book)) out[name] = { ...e, rate: 0 }
  return out
}
/** The charge rules with the default rate at 0 % (so the order's rate, every line's stamp and its breakdown are 0 %). */
export function franchiseRules<R extends { taxRateMilli: number | null }>(rules: R): R {
  return { ...rules, taxRateMilli: 0 }
}

const int = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : 0 }

/** The order fields a receipt reads. */
export interface ReceiptOrder {
  receipt_no?: number | string | null
  placed_at?: string | null
  created_at?: string | null
  vat_regime?: string | null
  country?: string | null
  tax_label?: string | null
  tax_minor?: number | null
  tax_rate_milli?: number | null
  tax_breakdown?: unknown
}
/** The truck fields a receipt reads (all from trucks, france-records-1). */
export interface ReceiptTruck {
  country?: string | null
  legal_name?: string | null
  registered_address?: { address?: string | null; town?: string | null; suburb?: string | null; region?: string | null; postcode?: string | null } | null
  registration_number?: string | null
  vat_number?: string | null
}
export interface ReceiptFacts {
  /** "Receipt no. 142" in the receipt's language — null when the order has no number. */
  receiptNo: string | null
  /** "24/11/2026 12:41" — null only when the row carries no time at all. */
  soldAt: string | null
  /** The business details, one line each, only those filled in ([] when none). */
  business: string[]
  /** « TVA non applicable, art. 293 B du CGI » for a French order sold under franchise en base, else null. */
  franchiseNote: string | null
}

/** Is this STORED order one sold under franchise en base? France, stamped franchise, and no tax on it anywhere. */
export function franchiseNoteFor(order: ReceiptOrder, truckCountry?: string | null): string | null {
  if (!hasVatRegime(order.country ?? truckCountry) || order.vat_regime !== 'franchise') return null
  if (int(order.tax_minor) > 0 || int(order.tax_rate_milli) > 0) return null
  if (Array.isArray(order.tax_breakdown) && (order.tax_breakdown as Record<string, unknown>[]).some(r => int(r?.tax_minor) > 0 || int(r?.rate_milli) > 0)) return null
  return FRANCHISE_NOTE_FR
}

/** A SIREN (9) or SIRET (14) with its usual spaces: "732 829 320", "732 829 320 00074". Anything else as stored. */
export function spacedSiren(digits: string): string {
  if (/^\d{9}$/.test(digits)) return digits.replace(/^(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3')
  if (/^\d{14}$/.test(digits)) return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{5})$/, '$1 $2 $3 $4')
  return digits
}

/** The date and time of sale on the truck's clock. */
export function saleDateTime(iso: string, time: TimeSettings | null | undefined): string {
  const ts = timeSettingsOr(time, 'receipt date of sale')
  return `${formatNumericDate(localDateOfInstant(iso, ts.timeZone), ts)} ${formatInstantClock(iso, ts)}`
}

export interface ReceiptOptions {
  time: TimeSettings | null | undefined
  /** The receipt's language (the truck's locale). */
  locale?: string | null
  /** The truck's address format (lib/address-formats.ts key) — how the registered address reads. */
  addressFormat?: unknown
  /** The printed ticket: the registration number as digits only, and characters the printer cannot print made plain. */
  forTicket?: boolean
}

export function receiptFactsOf(order: ReceiptOrder, truck: ReceiptTruck | null | undefined, opts: ReceiptOptions): ReceiptFacts {
  const locale = opts.locale ?? opts.time?.locale ?? null
  const t = translatorFor(locale, 'charges')
  const plain = (s: string) => (opts.forTicket ? s.replace(/[  ]/g, ' ').replace(/°/g, 'o') : s)
  const no = order.receipt_no
  const receiptNo = no === null || no === undefined || String(no).trim() === '' ? null : plain(t('receipt.number', { n: String(no) }))
  const iso = order.placed_at || order.created_at || null
  const soldAt = iso && Number.isFinite(Date.parse(iso)) ? plain(saleDateTime(iso, opts.time)) : null

  const business: string[] = []
  const tk = truck ?? {}
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  if (s(tk.legal_name)) business.push(s(tk.legal_name))
  const a = tk.registered_address
  if (a && typeof a === 'object' && [a.address, a.town, a.suburb, a.region, a.postcode].some(v => s(v))) {
    const line = eventAddressLine({ venueName: s(a.address) || null, town: s(a.town) || null, suburb: s(a.suburb) || null, region: s(a.region) || null, postcode: s(a.postcode) || null }, opts.addressFormat)
    if (line.trim()) business.push(line.trim())
  }
  const reg = s(tk.registration_number)
  if (reg) {
    const kind = registrationKindOf(tk.country ?? order.country)
    if (kind === 'siren') {
      const digits = reg.replace(/\D/g, '')
      const label = digits.length === 14 ? 'SIRET' : 'SIREN'
      business.push(`${label} ${opts.forTicket ? digits : spacedSiren(digits)}`)
    } else {
      business.push(`${kind === 'gb_company' ? t('receipt.companyNumber') : t('receipt.registrationNumber')} ${reg}`)
    }
  }
  const vat = s(tk.vat_number)
  if (vat) business.push(`${t('receipt.taxNumber', { label: s(order.tax_label) || t('taxFallback') })} ${vat}`)

  return { receiptNo, soldAt, business: business.map(plain), franchiseNote: franchiseNoteFor(order, tk.country) }
}
