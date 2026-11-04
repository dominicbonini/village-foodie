// lib/accounts/csv.ts — costs-accounts-1 (4 November 2026, docs/costs-accounts-1-report.md): THE TWO CSV FILES FOR AN ACCOUNTANT.
//
// PURE AND CLIENT-SAFE. Built in the browser from the rows the Reports screen shows (lib/accounts/ledger.ts), like Reports' own CSVs.
// 🔴 THE FORMAT, FOR EXCEL, NUMBERS, XERO AND QUICKBOOKS:
//   • UTF-8 with a byte-order mark (Excel reads the file as UTF-8 only with it) and ONE header row; rows end CRLF (RFC 4180);
//   • dates ISO (YYYY-MM-DD), times 24-hour HH:MM, on the truck's clock;
//   • amounts plain numbers with a dot and the currency's own decimals — no symbol, no thousands mark ("1234.50"; yen "1980") —
//     with a currency column;
//   • a cell is quoted only when it must be (a comma, quote or line break); a cell that a spreadsheet would run as a formula
//     (starting = + - @) gets a leading apostrophe;
//   • NO customer name, email or phone.
import { minorDigits } from '@/lib/money-format'
import type { AccountRow, EventSummary, TaxBasis, Channel, PaymentMethod } from '@/lib/accounts/ledger'
import { taxBasisOf } from '@/lib/accounts/ledger'

export const CSV_BOM = '﻿'

/** Minor units → "1234.50" (two-decimal currencies) or "1980" (zero-decimal: JPY). */
export function csvAmount(minor: number, currency: string): string {
  const d = minorDigits(currency)
  const neg = minor < 0, abs = Math.abs(Math.round(minor))
  if (d === 0) return `${neg ? '-' : ''}${abs}`
  const s = String(abs).padStart(d + 1, '0')
  return `${neg ? '-' : ''}${s.slice(0, -d)}.${s.slice(-d)}`
}

/** One cell: an apostrophe before a would-be formula; quoted only when it must be. */
export function csvCell(v: string | number | null | undefined): string {
  let s = v === null || v === undefined ? '' : String(v)
  // A plain number ("-3.20", a loss) stays a number; anything else starting = + - @ is text a spreadsheet must not run.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function csvFile(header: readonly string[], rows: readonly (readonly (string | number | null)[])[]): string {
  return CSV_BOM + [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

/** The words a CSV needs, in the truck's language (manageReports.accountsCsv.*). */
export interface CsvWords {
  header: (key: CsvColumn) => string
  channel: (c: Channel) => string
  payment: (p: PaymentMethod) => string
  taxBasis: (b: TaxBasis) => string
  /** The event's name ("Venue, Town"), or the "unknown event" word. */
  event: (eventId: string | null, eventDate: string | null) => string
}

export const ORDER_COLUMNS = ['date', 'time', 'orderNumber', 'event', 'channel', 'paymentMethod', 'currency', 'gross', 'tax', 'taxBasis', 'net', 'refunded', 'cost', 'profit'] as const
export const EVENT_COLUMNS = ['eventDate', 'event', 'orders', 'currency', 'gross', 'tax', 'taxBasis', 'net', 'refunded', 'dishesSold', 'dishesWithCost', 'cost', 'profit'] as const
export type CsvColumn = (typeof ORDER_COLUMNS)[number] | (typeof EVENT_COLUMNS)[number]

/** One row per order. Cost and profit are blank unless every dish in the order has a cost. */
export function ordersCsv(rows: readonly AccountRow[], w: CsvWords): string {
  return csvFile(ORDER_COLUMNS.map(w.header), rows.map(r => {
    const complete = r.dishesWithCost === r.dishes
    return [r.date, r.time, r.number, w.event(r.eventId, r.eventDate), w.channel(r.channel), w.payment(r.payment), r.currency,
      csvAmount(r.grossMinor, r.currency), csvAmount(r.taxMinor, r.currency), w.taxBasis(r.taxBasis), csvAmount(r.netMinor, r.currency),
      csvAmount(r.refundedMinor, r.currency), complete ? csvAmount(r.costMinor, r.currency) : '', r.profitMinor != null ? csvAmount(r.profitMinor, r.currency) : '']
  }))
}

/** One summary row per event. Profit is blank unless every dish sold at the event has a cost (the two dish columns say how many). */
export function eventsCsv(events: readonly EventSummary[], currency: string, w: CsvWords): string {
  return csvFile(EVENT_COLUMNS.map(w.header), events.map(e => [
    e.eventDate ?? '', w.event(e.eventId, e.eventDate), e.orders, currency,
    csvAmount(e.grossMinor, currency), csvAmount(e.taxMinor, currency), w.taxBasis(taxBasisOf(e.taxBases)), csvAmount(e.netMinor, currency),
    csvAmount(e.refundedMinor, currency), e.dishes, e.dishesWithCost, csvAmount(e.costMinor, currency),
    e.profitMinor != null ? csvAmount(e.profitMinor, currency) : '',
  ]))
}
