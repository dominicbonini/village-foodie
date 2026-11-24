// lib/receipt-server.ts — france-receipts-1 (24 November 2026, docs/france-receipts-1-report.md): the receipt facts (lib/receipt.ts) for
// a customer email, from the server. Two ways in:
//   receiptForRow(order, truck, time, locale)          the caller already holds the order row (select '*').
//   receiptForOrderKey(db, orderKey, truck, time, locale)  the caller holds only its key (the RPC's answer, a walk-up's insert): one read
//                                                      of the four receipt columns.
// 🔴 NEVER THE REASON AN EMAIL FAILS: any error is logged and the answer is null, and the email is then exactly what it was before.
import 'server-only'
import { addressFormatForTruck } from '@/lib/country-settings'
import { receiptFactsOf, type ReceiptFacts, type ReceiptOrder, type ReceiptTruck } from '@/lib/receipt'
import type { TimeSettings } from '@/lib/time-utils'

type Db = { from: (t: string) => any }   // eslint-disable-line @typescript-eslint/no-explicit-any -- the Supabase client, any flavour

export async function receiptForRow(order: ReceiptOrder, truck: (ReceiptTruck & { country?: string | null }) | null | undefined, time: TimeSettings | null | undefined, locale?: string | null): Promise<ReceiptFacts | null> {
  try {
    const addressFormat = truck?.registered_address ? await addressFormatForTruck(truck) : undefined
    return receiptFactsOf(order, truck, { time, locale: locale ?? time?.locale ?? null, addressFormat })
  } catch (e) {
    console.error('[receipt] receipt facts unavailable — the email goes without them:', e instanceof Error ? e.message : e)
    return null
  }
}

export async function receiptForOrderKey(db: Db, orderKey: string | null | undefined, truck: (ReceiptTruck & { country?: string | null }) | null | undefined, time: TimeSettings | null | undefined, locale?: string | null): Promise<ReceiptFacts | null> {
  if (!orderKey) return null
  try {
    const { data, error } = await db.from('orders').select('receipt_no, placed_at, created_at, vat_regime, country, tax_label, tax_minor, tax_rate_milli, tax_breakdown').eq('order_key', orderKey).maybeSingle()
    if (error || !data) { if (error) console.error('[receipt] order read failed — the email goes without its receipt facts:', error.message); return null }
    return await receiptForRow(data as ReceiptOrder, truck, time, locale)
  } catch (e) {
    console.error('[receipt] receipt facts unavailable — the email goes without them:', e instanceof Error ? e.message : e)
    return null
  }
}
