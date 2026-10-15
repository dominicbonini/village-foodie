// lib/printing/testTicket.ts — the "Print test ticket" bytes, through the SAME encoder as a real ticket.
//
// 🔴 A TEST TICKET IS NOT AN ORDER. It never goes through usePrintWatcher, never enters the dedupe record
// (hg_printed_keys_<token>) and never marks anything printed — the card hands these bytes straight to the
// transport and reports the transport's answer. It exists so an operator can prove bytes reach paper
// before a real order depends on it, and so TICKET_LEADING_FEED_LINES can be measured with a ruler.
import { renderTicket, type PaperWidth, type TicketOrder } from './ticket'
import { formatInstantClock, type TimeSettings } from '@/lib/time-utils'
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/ticket'

export function renderTestTicket(args: { truckName?: string | null; paper: PaperWidth; at?: Date; time: TimeSettings | null | undefined }): Uint8Array {
  const d = args.at ?? new Date()
  // The truck's clock and style (Phase 2B): GB "18:37", US "6:37pm".
  const hhmm = formatInstantClock(d, args.time)
  // Its words in the truck's language (messages/en-GB.json `ticket`), like a real ticket's.
  const locale = args.time?.locale ?? null
  const t = translatorFor(locale, 'ticket')
  const order: TicketOrder = {
    id: t('testId'),
    customer_name: t('testName'),
    collection_time: hhmm,
    items: [{ name: t('testItem'), quantity: 1 }],
    total: 0,
    truck_name: args.truckName ?? undefined,
    printedLabel: hhmm,
    locale,
  }
  return renderTicket(order, { paper_width: args.paper })   // renderTicket ends with the cut
}
