'use client'
// Phase-A VALIDATION HARNESS (dev only) — visit /dev/ticket-preview.
// See the combined ticket at 58mm/80mm, tweak the config + due time, inspect the ESC/POS bytes, and
// simulate the "print when due" watcher — all WITHOUT a printer, a native plugin, or the DB migration.
//
// ── 🔴 EVERYTHING FLOWS THROUGH THE REAL MAPPER, FROM REAL `Order`-SHAPED DATA ──────────────────────
// This harness used to hand-write a `TicketOrder` literal. That is exactly the shape of the bug the
// watcher already shipped once: the harness was the only place the code ever saw the fields it asked
// for, so it could not disagree with reality and the drift stayed invisible. Now the fixtures are typed
// `Order` / `TruckData` / `TruckEvent` / `LedgerRow[]` — the source of truth — and the ticket is produced
// by mapOrderToTicket, so a field the mapper drops is missing HERE, in a preview, rather than on paper in
// a kitchen. Payment scenarios are driven by LEDGER ROWS, not by patching a paymentStatus: the resolvers
// have to actually produce paid / part-paid / unpaid for the scenario to show anything.
import { useMemo, useState } from 'react'
import { TicketPreview } from '@/components/printing/TicketPreview'
import { renderTicket, type TicketOrder, type TicketConfig, type PaperWidth, type TicketReprint } from '@/lib/printing/ticket'
import { selectDueToPrint } from '@/lib/printing/printWatcher'
import { mapOrderToTicket } from '@/lib/printing/mapOrderToTicket'
import { getOrderBalance, type LedgerRow } from '@/lib/payments/ledger'
import { resolvePaidStep } from '@/lib/payments/paid-step'
import type { Order, TruckData, TruckEvent } from '@/components/dashboard/types'

// ── FIXTURES — `Order`-SHAPED, not TicketOrder-shaped ────────────────────────────────────────────────
// Exercises every content branch at once: prices, a DEAL with slot fills AND slot modifiers AND a slot
// NOTE (the allergy-adjacent case that used to be dropped), modifiers priced and free, an item-level
// instruction, and a LONG order note that must wrap untruncated across many lines.
const SAMPLE_ORDER: Order = {
  id: '17',
  order_key: 'k-17',
  customer_name: 'Jamie',
  customer_phone: '07700 900123',
  customer_email: null,
  slot: '18:45',
  event_date: '2026-08-06',
  event_id: 'ev-1',
  van_id: null,
  status: 'confirmed',
  items: [
    { name: 'Sesame Prawn Toast', quantity: 1, unit_price: 6.5, modifiers: [{ name: 'extra chilli', price: 0.5 }] },
    { name: 'Chicken wings Thai style', quantity: 2, unit_price: 7.0, specialInstructions: 'no peanuts' },
    { name: 'Spring Rolls', quantity: 1, unit_price: 4.5, modifiers: [{ name: 'sweet chilli dip', price: 0 }] },
  ],
  deals: [{
    name: 'Two mains + drink',
    price: 18.0,
    slots: { main: 'Pad Thai', drink: 'Coke' },
    // 🔴 THE GAP THIS BUILD CLOSED. Both used to have nowhere to go on TicketOrder, so a deal slot's
    // "no peanuts" was silently lost between the dashboard and the paper.
    slotModifiers: { main: [{ name: 'extra chilli', price: 0.5 }] },
    slotNotes: { main: 'no peanuts - severe allergy' },
  }],
  total: 42.5,
  total_minor: 4250,
  notes: 'SEVERE PEANUT ALLERGY for one of the mains - please use clean oil and a clean pan, and keep it away from the wings. Also no coriander on anything, one of us really cannot stand it. Thank you!',
  paid_at: null,
  collected_at: null,
  created_at: '2026-08-06T10:00:00Z',
  buzzer_number: 12,
}

const SAMPLE_TRUCK: TruckData = {
  id: 't-1', name: 'Real Thai Food', mode: 'event', venue_name: null, logo: null,
  dashboard_token: 'tok', kds_mode: false, crew_mode: 'solo', display_mode: 'grid',
  keep_screen_on: false, plan: 'max', trial_expires_at: null, feature_overrides: null,
  show_paid_step: true, takes_cash: true,
}

const SAMPLE_EVENT: TruckEvent = {
  id: 'ev-1', truck_id: 't-1', event_date: '2026-08-06', venue_name: 'Riverside',
  venue_address: null, address: null, town: null, postcode: null,
  start_time: '17:00', end_time: '21:00', status: 'open',
  auto_open: true, auto_close: true, opened_at: null, closed_at: null, confirmed_at: null,
  customer_note: null, notes: null, source: null, van_id: null,
}

// `livemode: true` is REQUIRED for this fixture to count, and its absence being fatal is the point:
// getOrderBalance treats an unclassified row as test and drops it (isLiveRow), so a hand-built row with
// no livemode renders every preview scenario as unpaid. That is the exclude-by-default rule working —
// the fixture had to change to keep meaning what it says, which is the cost of putting the strict check
// at the chokepoint, and it is the cheap direction to be wrong in.
const charge = (minor: number): LedgerRow => ({ kind: 'charge', channel: 'in_person_other', amount_minor: minor, state: 'succeeded', livemode: true })

interface Scenario {
  key: string
  label: string
  order?: Partial<Order>
  truck?: Partial<TruckData>
  rows?: LedgerRow[]
  reprint?: TicketReprint | null
}

// 🔴 Payment scenarios are LEDGER ROWS, so resolvePaidStep + getOrderBalance genuinely run.
const SCENARIOS: Scenario[] = [
  { key: 'part', label: 'Part paid — £25.00 taken of £42.50', rows: [charge(2500)] },
  { key: 'unpaid', label: 'Unpaid — no ledger rows', rows: [] },
  { key: 'paid', label: 'Paid in full', rows: [charge(4250)] },
  // 🔴 The Gusto case. show_paid_step false ⇒ NO payment line at all, not "unpaid".
  { key: 'nopaidstep', label: 'Paid step OFF (Gusto) — no payment line', truck: { show_paid_step: false }, rows: [charge(2500)] },
  { key: 'nobuzzer', label: 'No buzzer assigned', order: { buzzer_number: null }, rows: [charge(2500)] },
  { key: 'nonote', label: 'No order note', order: { notes: null }, rows: [charge(2500)] },
  { key: 'asap', label: 'ASAP — no slot (prints DUE ASAP)', order: { slot: null }, rows: [charge(2500)] },
  { key: 'minimal', label: 'Minimal — no deal, no note, no buzzer', order: { deals: null, notes: null, buzzer_number: null }, rows: [] },
  // 🔴 THE CASES THIS LAYOUT WORK IS ABOUT — four dish notes at once (does the emphasis defeat itself?)
  // and a single note long enough to wrap (does an inverted block stay readable across lines?).
  { key: 'fournotes', label: 'FOUR items, each with a customer note', rows: [charge(2500)], order: {
    items: [
      { name: 'Pad Thai', quantity: 1, unit_price: 9.5, specialInstructions: 'no peanuts' },
      { name: 'Green Curry', quantity: 1, unit_price: 9.0, specialInstructions: 'extra mild' },
      { name: 'Spring Rolls', quantity: 2, unit_price: 4.5, specialInstructions: 'no dipping sauce' },
      { name: 'Sticky Rice', quantity: 1, unit_price: 3.0, specialInstructions: 'gluten free please' },
    ],
    deals: null,
  } },
  { key: 'longitemnote', label: 'Item note long enough to WRAP', rows: [charge(2500)], order: {
    items: [{ name: 'Pad Thai', quantity: 1, unit_price: 9.5, specialInstructions:
      'no peanuts at all please, severe allergy - and please use a clean pan and clean oil, not the wok the wings were done in' }],
    deals: null,
  } },
  // 🔴 The reprint cases. 'possible_duplicate' is what an UNKNOWN print outcome produces.
  { key: 'dup', label: 'REPRINT — after an UNKNOWN outcome (may be a duplicate)', rows: [charge(2500)], reprint: { reason: 'possible_duplicate', attempt: 2 } },
  { key: 'reprint', label: 'REPRINT — deliberate re-print', rows: [charge(2500)], reprint: { reason: 'reprint' } },
]

// ── 🔴 THE FIELD-BY-FIELD ASSERTION ─────────────────────────────────────────────────────────────────
// The compiler (ExhaustiveTicketOrder) guarantees every field is WRITTEN. It cannot tell whether it was
// written from the RIGHT source — `customer_name: order.customer_phone` compiles perfectly. This closes
// that gap: each expectation is derived from the Order here, independently of the mapper, and any
// disagreement is flagged. For the payment fields the expectation is the RESOLVER'S OUTPUT (not a
// re-implementation of it), so what is asserted is that the mapper passes it through unchanged — which
// is exactly what a `balance.paidMinor` / `balance.balanceMinor` slip would break.
interface FieldCheck { field: string; source: string; expected: unknown; actual: unknown; ok: boolean }

const eq = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

function checkMapping(
  order: Order, truck: TruckData, event: TruckEvent, rows: LedgerRow[], nowMins: number,
  reprint: TicketReprint | null | undefined, printedLabel: string, mapped: TicketOrder,
): FieldCheck[] {
  const { showPaidStep } = resolvePaidStep(truck, event)
  const bal = getOrderBalance(order, rows)

  const rows_: [string, string, unknown, unknown][] = [
    ['id', 'order.id', order.id, mapped.id],
    ['customer_name', 'order.customer_name', order.customer_name, mapped.customer_name],
    ['customer_phone', 'order.customer_phone', order.customer_phone, mapped.customer_phone],
    ['collection_time', 'order.slot (HH:MM)', order.slot, mapped.collection_time],
    ['buzzer_number', 'order.buzzer_number', order.buzzer_number ?? null, mapped.buzzer_number],
    ['items', 'order.items[] (name/qty/price/mods/instr)', order.items.map(i => ({
      name: i.name, quantity: i.quantity, unit_price: i.unit_price,
      modifiers: i.modifiers?.map(m => ({ name: m.name, price: m.price })), specialInstructions: i.specialInstructions,
    })), mapped.items],
    ['deals', 'order.deals[] incl. slotModifiers + slotNotes', (order.deals ?? []).map(d => ({
      name: d.name, price: d.price, slots: d.slots, slotModifiers: d.slotModifiers, slotNotes: d.slotNotes,
    })), mapped.deals],
    ['notes', 'order.notes', order.notes, mapped.notes],
    ['total', 'order.total', order.total, mapped.total],
    ['showPaidStep', 'resolvePaidStep().showPaidStep', showPaidStep, mapped.showPaidStep],
    ['paymentStatus', 'getOrderBalance().status, or ABSENT when paid step off', showPaidStep ? bal.status : null, mapped.paymentStatus],
    ['balanceMinor', 'getOrderBalance().balanceMinor (NOT paidMinor)', showPaidStep ? bal.balanceMinor : null, mapped.balanceMinor],
    ['truck_name', 'truck.name', truck.name, mapped.truck_name],
    ['printedLabel', 'caller-supplied', printedLabel, mapped.printedLabel],
    ['reprint', 'caller-supplied (watcher ctx.mayDuplicate)', reprint ?? null, mapped.reprint],
  ]
  return rows_.map(([field, source, expected, actual]) => ({ field, source, expected, actual, ok: eq(expected, actual) }))
}

export default function TicketPreviewHarness() {
  const [paper, setPaper] = useState<PaperWidth>(80)
  const [showPhone, setShowPhone] = useState(true)
  const [leadMins, setLeadMins] = useState(10)
  const [nowMins, setNowMins] = useState(18 * 60 + 40) // 18:40
  const [scenario, setScenario] = useState('part')

  const config: TicketConfig = { paper_width: paper, show_phone: showPhone }
  const sc = SCENARIOS.find(x => x.key === scenario) ?? SCENARIOS[0]

  const built = useMemo(() => {
    const order: Order = { ...SAMPLE_ORDER, ...(sc.order ?? {}) }
    const truck: TruckData = { ...SAMPLE_TRUCK, ...(sc.truck ?? {}) }
    const rows = sc.rows ?? []
    // 🔴 DATE AND TIME. A ticket found on a counter may be from a previous service, and a bare
    // "18:40" cannot say which day it belongs to. The renderer prints what it is given.
    const printedLabel = `${stampDate(SAMPLE_ORDER.event_date)} ${minsToStr(nowMins)}`
    // 🔴 THE REAL MAPPER. Nothing below hand-writes a TicketOrder field.
    const ticket = mapOrderToTicket({
      order, truck, event: SAMPLE_EVENT, ledgerRows: rows, printedLabel, reprint: sc.reprint,
    })
    return { order, truck, rows, ticket, checks: checkMapping(order, truck, SAMPLE_EVENT, rows, nowMins, sc.reprint, printedLabel, ticket) }
  }, [sc, nowMins])

  const bytes = useMemo(() => renderTicket(built.ticket, config), [built, config])
  const hex = useMemo(() => Array.from(bytes.slice(0, 64)).map(b => b.toString(16).padStart(2, '0')).join(' '), [bytes])
  const failed = built.checks.filter(c => !c.ok)

  // ── WATCHER SIMULATION ────────────────────────────────────────────────────────────────────────────
  // 🔴 THESE ARE `Order`-SHAPED, AND THAT IS THE POINT. This harness previously hand-wrote objects with a
  // literal `collection_time`, which NO REAL ORDER HAS — the stored field is `slot`. That masked the bug
  // where every order printed immediately, because the harness was the only place the watcher ever saw the
  // field it asked for. Typing these as `Pick<Order, …>` means the compiler now rejects any future drift
  // between what the watcher reads and what an order actually carries.
  const watch = useMemo(() => {
    const orders: (Pick<Order, 'order_key' | 'slot' | 'status'> & { label: string })[] = [
      { order_key: 'k-asap', slot: null, status: 'confirmed', label: '#A ASAP (no slot)' },
      { order_key: 'k-soon', slot: minsToStr(nowMins + leadMins - 2), status: 'confirmed', label: `#B due ${minsToStr(nowMins + leadMins - 2)}` },
      { order_key: 'k-later', slot: minsToStr(nowMins + leadMins + 30), status: 'confirmed', label: `#C due ${minsToStr(nowMins + leadMins + 30)}` },
      { order_key: 'k-pending', slot: minsToStr(nowMins), status: 'pending', label: '#E PENDING — never prints in either mode' },
      { order_key: 'k-done', slot: minsToStr(nowMins), status: 'collected', label: '#D collected (ineligible)' },
    ]
    // Both modes evaluated side by side, from the SAME orders — so the difference between them is visible
    // rather than asserted.
    const dueLead = selectDueToPrint(orders, { mode: 'lead_time', nowMins, leadMins, printed: new Set() })
    const dueConfirmed = selectDueToPrint(orders, { mode: 'on_confirmed', nowMins, leadMins, printed: new Set() })
    return {
      orders,
      leadKeys: new Set(dueLead.map(o => o.order_key)),
      confirmedKeys: new Set(dueConfirmed.map(o => o.order_key)),
    }
  }, [nowMins, leadMins])

  return (
    <div className="min-h-screen bg-slate-100 p-6 flex flex-col gap-6">
      <h1 className="text-lg font-bold text-slate-900">Kitchen ticket — Phase A preview (no printer)</h1>

      <div className="flex flex-wrap gap-4 items-end bg-white p-4 rounded-xl border text-sm">
        <label className="flex flex-col gap-1">Scenario
          <select value={scenario} onChange={e => setScenario(e.target.value)} className="border rounded px-2 py-1">
            {SCENARIOS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">Paper
          <select value={paper} onChange={e => setPaper(Number(e.target.value) as PaperWidth)} className="border rounded px-2 py-1">
            <option value={80}>80mm (48 col)</option>
            <option value={58}>58mm (32 col)</option>
          </select>
        </label>
        <label className="flex items-center gap-2">Show phone
          <input type="checkbox" checked={showPhone} onChange={e => setShowPhone(e.target.checked)} />
        </label>
        <label className="flex flex-col gap-1">Lead mins (N)
          <input type="number" value={leadMins} onChange={e => setLeadMins(Number(e.target.value) || 0)} className="border rounded px-2 py-1 w-20" />
        </label>
        <label className="flex flex-col gap-1">Now ({minsToStr(nowMins)})
          <input type="range" min={0} max={1439} value={nowMins} onChange={e => setNowMins(Number(e.target.value))} className="w-48" />
        </label>
      </div>

      <div className="flex flex-wrap gap-8">
        <div>
          <h2 className="text-xs font-bold text-slate-500 uppercase mb-2">Preview</h2>
          <TicketPreview order={built.ticket} config={config} />
        </div>

        <div className="flex flex-col gap-4 max-w-2xl flex-1">
          {/* 🔴 The mapping assertion, first — a missing line is visible HERE rather than on paper. */}
          <div>
            <h2 className="text-xs font-bold text-slate-500 uppercase mb-1">
              Order → TicketOrder mapping ({built.checks.length} fields){' '}
              {failed.length === 0
                ? <span className="text-green-700">— all match</span>
                : <span className="text-red-600">— {failed.length} MISMATCHED</span>}
            </h2>
            <table className="w-full text-[11px] bg-white border rounded-lg overflow-hidden">
              <thead className="bg-slate-100 text-slate-600">
                <tr><th className="text-left px-2 py-1">Field</th><th className="text-left px-2 py-1">Source</th><th className="text-left px-2 py-1">Value on the ticket</th></tr>
              </thead>
              <tbody>
                {built.checks.map(c => (
                  <tr key={c.field} className={`border-t ${c.ok ? '' : 'bg-red-50'}`}>
                    <td className="px-2 py-1 font-bold whitespace-nowrap">{c.ok ? '✓' : '🔴'} {c.field}</td>
                    <td className="px-2 py-1 text-slate-500">{c.source}</td>
                    <td className="px-2 py-1 font-mono break-all">
                      {fmt(c.actual)}
                      {!c.ok && <span className="text-red-600 block">expected {fmt(c.expected)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h2 className="text-xs font-bold text-slate-500 uppercase mb-1">ESC/POS bytes ({bytes.length} total — first 64 hex)</h2>
            <pre className="bg-slate-900 text-green-300 text-[10px] p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-all">{hex}</pre>
          </div>

          <div>
            <h2 className="text-xs font-bold text-slate-500 uppercase mb-1">Watcher (now = {minsToStr(nowMins)}, N = {leadMins}m)</h2>
            <ul className="text-sm bg-white border rounded-lg divide-y">
              {watch.orders.map(o => (
                <li key={o.order_key} className={`px-3 py-1.5 flex justify-between ${watch.leadKeys.has(o.order_key) || watch.confirmedKeys.has(o.order_key) ? 'text-green-700 font-bold' : 'text-slate-500'}`}>
                  <span>{o.label}</span>
                  {/* Both modes shown per order, so the difference is legible at a glance rather than
                    requiring the reader to switch a control and remember the previous state. */}
                <span className="tabular-nums text-xs">
                  lead: {watch.leadKeys.has(o.order_key) ? 'PRINT' : '—'}
                  {'   '}· on-accept: {watch.confirmedKeys.has(o.order_key) ? 'PRINT' : '—'}
                </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

function fmt(v: unknown): string {
  if (v === undefined) return '—'
  if (v === null) return 'null'
  return typeof v === 'string' ? v : JSON.stringify(v)
}
/** "2026-08-06" → "6 Aug". ASCII only — strBytes maps anything outside 0x20-0x7E (bar £) to '?'. */
function stampDate(iso: string | null): string {
  if (!iso) return ''
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${Number(m[3])} ${MON[Number(m[2]) - 1] ?? ''}`.trim() : ''
}
function minsToStr(m: number): string {
  const mm = ((m % 1440) + 1440) % 1440
  return `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`
}
