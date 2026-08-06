// ── Order → TicketOrder — THE ONE MAPPER ──────────────────────────────────────────────────────────────
// Pure. No React, no fetch, no clock: everything time-dependent is an input. A dashboard `Order` is a wide
// runtime row; a `TicketOrder` is the narrow thing paper needs. This is the only place the two meet.
//
// ── 🔴 THE FAILURE MODE THIS FILE IS SHAPED AROUND ──────────────────────────────────────────────────
// Only FOUR of TicketOrder's fields are required (id, customer_name, items, total). Every other field is
// optional, and the renderer OMITS a line rather than printing a blank one — deliberately, because a blank
// buzzer field reads as "buzzer 0" or as a printer fault. The consequence is that a mapping mistake does
// not throw, does not fail to compile and does not look wrong in a preview: it produces A MISSING LINE ON
// PAPER, discovered by a cook who never learns that a line was supposed to be there.
//
// TWO DEFENCES, because neither alone is enough:
//   1. `ExhaustiveTicketOrder` below — the compiler requires EVERY key to be written. A field added to
//      TicketOrder that nothing maps, or a field deleted from the mapper, is a BUILD ERROR. Deliberate
//      absence must be spelled `undefined`, so "not mapped" and "mapped to nothing" stop looking alike.
//      ⚠️ It CANNOT catch a field mapped from the wrong source (customer_name ← customer_phone).
//   2. The field-by-field assertion in /dev/ticket-preview, which derives each expected value from the
//      Order INDEPENDENTLY of this file and flags any disagreement. That is what catches (1)'s blind spot.
//
// ── PAYMENT ─────────────────────────────────────────────────────────────────────────────────────────
// 🔴 RESOLVED HERE, NEVER IN THE RENDERER. resolvePaidStep() is the single paid-step resolver (this is its
// ninth consumer) and getOrderBalance() is the single balance resolver. ticket.ts does no payment
// arithmetic and reads none of trucks.show_paid_step / trucks.takes_cash / show_paid_step_override.
import { getOrderBalance, type LedgerRow } from '@/lib/payments/ledger'
import { resolvePaidStep } from '@/lib/payments/paid-step'
import type { TicketOrder, TicketReprint } from '@/lib/printing/ticket'
import type { Order, TruckData, TruckEvent } from '@/components/dashboard/types'

/** Every TicketOrder key becomes REQUIRED while keeping its original value type (which still includes
 *  `undefined` for optional props). So the key cannot be forgotten, but "deliberately absent" is still
 *  expressible — as an explicit `undefined` that a reader can see. */
type ExhaustiveTicketOrder = { [K in keyof Required<TicketOrder>]: TicketOrder[K] }

export interface MapTicketInput {
  order: Order
  truck: TruckData | null | undefined
  event: TruckEvent | null | undefined
  /** This order's `order_payments` rows — /api/dashboard ships them as `payments[order_key]`. */
  ledgerRows: LedgerRow[] | null | undefined
  /** Caller-formatted print time, e.g. "18:37". */
  printedLabel?: string
  /** From usePrintWatcher's PrintAttemptContext — see reprintFromContext below. */
  reprint?: TicketReprint | null
}

/** 🔴 The bridge from the watcher's attempt history to the ticket's banner, in ONE place so the rule is
 *  not re-derived per call site. `mayDuplicate` (an earlier attempt ended UNKNOWN ⇒ paper may exist)
 *  becomes a banner; a retry after a clean 'failed' gets NOTHING, because nothing came out and that
 *  ticket is the first one. Banner-on-every-retry would train the kitchen to ignore the banner. */
export function reprintFromContext(ctx: { attempt: number; mayDuplicate: boolean }): TicketReprint | undefined {
  if (!ctx.mayDuplicate) return undefined
  return { reason: 'possible_duplicate', attempt: ctx.attempt }
}

/** "18:45" / "18:45:00" / null → "18:45" / null. The renderer prints `DUE ASAP` for null. */
function hhmm(slot: string | null | undefined): string | null {
  if (!slot) return null
  const m = /^(\d{1,2}):(\d{2})/.exec(slot)
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null
}

export function mapOrderToTicket(input: MapTicketInput): TicketOrder {
  const { order, truck, event, ledgerRows, printedLabel, reprint } = input

  // ── PAYMENT — both resolvers called, their OUTPUT passed on. No arithmetic below this line.
  // ⚠️ `takesCash` is resolved and deliberately UNUSED: a ticket has no cash/card concept. It is the
  // handover method, not a property of the order, and printing it would invent a fact.
  const { showPaidStep } = resolvePaidStep(truck, event)
  const balance = getOrderBalance(order, ledgerRows ?? [])

  // 🔴 showPaidStep FALSE ⇒ NO PAYMENT FIELDS AT ALL — not "unpaid". A truck without the paid step has no
  // concept of an unpaid order at handover, so carrying a real status here (which the renderer happens to
  // guard against) would still be putting a state on the object that the truck does not have. Pizzeria
  // Gusto is exactly this truck.
  const paymentStatus = showPaidStep ? balance.status : undefined
  const balanceMinor = showPaidStep ? balance.balanceMinor : undefined

  // ⚠️ SAME `slot` FIELD AS THE TRIGGER READS, so the printed collection time and the watcher's due
  // DECISION cannot drift apart. An order with no parseable slot is ASAP in both — "COLLECT ASAP" on
  // paper, due-now to the selector.
  // 🔴 NO COUNTDOWN IS COMPUTED. `minutesUntilDue` was removed from TicketOrder — see the note there.
  const collection_time = hhmm(order.slot)

  const t: ExhaustiveTicketOrder = {
    id: order.id,
    customer_name: order.customer_name,
    customer_phone: order.customer_phone,
    collection_time,
    buzzer_number: order.buzzer_number ?? null,

    // ⚠️ modifiers' `allergens` / `dietary` are NOT carried — see the report. No surface renders them
    // today, so dropping them is parity with the dashboard rather than a new loss, but it is named there
    // rather than left silent, because they are allergy data.
    items: (order.items ?? []).map(it => ({
      name: it.name,
      quantity: it.quantity,
      unit_price: it.unit_price,
      modifiers: it.modifiers?.map(m => ({ name: m.name, price: m.price })),
      specialInstructions: it.specialInstructions,
    })),

    // 🔴 slotModifiers / slotNotes carried through — a deal slot's "no peanuts" used to have nowhere to go.
    deals: (order.deals ?? []).map(d => ({
      name: d.name,
      price: d.price,
      slots: d.slots,
      slotModifiers: d.slotModifiers,
      slotNotes: d.slotNotes,
    })),

    notes: order.notes,
    total: order.total,

    showPaidStep,
    paymentStatus,
    balanceMinor,

    truck_name: truck?.name,
    printedLabel,
    reprint: reprint ?? null,
  }
  return t
}
