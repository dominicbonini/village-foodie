// lib/printing/testTicket.ts — the "Print test ticket" bytes, through the SAME encoder as a real ticket.
//
// 🔴 A TEST TICKET IS NOT AN ORDER. It never goes through usePrintWatcher, never enters the dedupe record
// (hg_printed_keys_<token>) and never marks anything printed — the card hands these bytes straight to the
// transport and reports the transport's answer. It exists so an operator can prove bytes reach paper
// before a real order depends on it, and so TICKET_LEADING_FEED_LINES can be measured with a ruler.
import { renderTicket, type PaperWidth, type TicketOrder } from './ticket'

export function renderTestTicket(args: { truckName?: string | null; paper: PaperWidth; at?: Date }): Uint8Array {
  const d = args.at ?? new Date()
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const order: TicketOrder = {
    id: 'TEST',
    customer_name: 'Test ticket',
    collection_time: hhmm,
    items: [{ name: 'Test ticket', quantity: 1 }],
    total: 0,
    truck_name: args.truckName ?? undefined,
    printedLabel: hhmm,
  }
  return renderTicket(order, { paper_width: args.paper })   // renderTicket ends with the cut
}
