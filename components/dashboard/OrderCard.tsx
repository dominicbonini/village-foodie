'use client'
// components/dashboard/OrderCard.tsx

import { useState, useEffect } from 'react'
import type { Order, TruckData, Slot, TruckEvent } from './types'
import { STATUS } from './types'
import { getCategoryTime, getTicketAge, getSlotOffset, getCombinedUrgency, getHeaderStyle, resolveCollectionTime, getOrderCookSecs, cookAmberLeadMins } from './helpers'
import type { CatConfig } from '@/lib/prep-utils'
import { getOrderBalance, type LedgerRow } from '@/lib/payments/ledger'
import { BTN_COLOURS } from '@/lib/ui-tokens'
import { resolvePaidStep } from '@/lib/payments/paid-step'

export type ViewMode = 'solo' | 'window' | 'cook'

// Per-item tap-to-mark-done (the "8× Anchovies (2/8)" progress ticking on Window/Solo line items).
// DISABLED per product decision 2026-06 — operators read an order, make it, and tap "Mark paid & done";
// they don't tick individual items. Flip to `true` to restore the full behaviour (Window + Solo).
// The struckUnits/tapItem/allStruck code is RETAINED but unreachable when this is false, so re-enabling
// is just this one flag — nothing to re-implement.
const ITEM_TICK_ENABLED = false

// ── Shared UI primitives ──────────────────────────────────────────────────────

export function Toggle({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button onClick={onToggle} disabled={disabled} className="relative shrink-0 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed">
      <div className={`w-11 h-6 rounded-full transition-colors ${on ? 'bg-green-500' : 'bg-slate-300'}`}>
        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
      </div>
    </button>
  )
}

export function Btn({ label, colour, loading, onClick }: {
  label: string; colour: string; loading: boolean; onClick: () => void
}) {
  const colours = BTN_COLOURS
  return (
    <button onClick={onClick} disabled={loading}
      className={`${colours[colour] || colours.slate} font-bold text-sm px-4 py-3 rounded-xl transition-colors active:scale-95 disabled:opacity-50 flex-1 min-w-[72px]`}>
      {loading ? '...' : label}
    </button>
  )
}

export function InlinePriceEditor({ price, quantity, onChange }: {
  price: number; quantity: number; onChange: (p: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(price.toFixed(2))
  if (editing) {
    return (
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-slate-400 text-xs">£</span>
        <input type="number" value={val} step="0.50" min="0" autoFocus
          onChange={e => setVal(e.target.value)}
          onBlur={() => { onChange(parseFloat(val) || 0); setEditing(false) }}
          onKeyDown={e => { if (e.key === 'Enter') { onChange(parseFloat(val) || 0); setEditing(false) } }}
          className="w-16 border border-orange-400 rounded-lg px-1.5 py-1 text-sm font-bold text-slate-900 focus:outline-none text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
      </div>
    )
  }
  return (
    <button onClick={() => { setVal(price.toFixed(2)); setEditing(true) }}
      className="flex items-center gap-1.5 shrink-0 text-right group" title="Tap to override price">
      <span className="text-slate-900 font-bold text-sm">£{(price * quantity).toFixed(2)}</span>
      <span className="text-slate-300 group-hover:text-orange-400 transition-colors text-xs" aria-hidden>✏</span>
    </button>
  )
}

function addMinsToSlot(slot: string, mins: number): string {
  const [h, m] = slot.split(':').map(Number)
  const total = h * 60 + m + mins
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

// ── OrderCard ─────────────────────────────────────────────────────────────────

export function OrderCard({
  order,
  truck,
  event,
  slots,
  actionLoading,
  onAction,
  onEdit,
  categoryOrder,
  itemCategoryMap,
  catConfigs,
  viewMode = 'solo',
  kdsMode = false,
  showCookingStep = false,
  effectiveOrderReady = false,
  pendingSync = false,
  anchorId,
  highlight = false,
  ledgerRows,
  hidePayments = false,
  pendingPayment,
  conflict,
  onBuzzer,
}: {
  order: Order
  truck: TruckData | null
  event?: TruckEvent | null
  slots: Slot[]
  actionLoading: string | null
  onAction: (action: string, orderKey: string) => void
  onEdit: (order: Order) => void
  categoryOrder?: string[]
  itemCategoryMap?: Record<string, string>
  /** Per-category cook config (prep_secs/batch_size, keyed by lowercased category name)
   *  — drives the PREP-AWARE green→amber threshold. Absent ⇒ the card falls back to the
   *  old fixed 5-min amber lead (getCombinedUrgency's default). */
  catConfigs?: Record<string, CatConfig>
  viewMode?: ViewMode
  kdsMode?: boolean
  /** Van "show cooking step" preference — when false the cook view skips the intermediate
   *  "Start cooking" stage (confirmed → ready directly). Defaults off. */
  showCookingStep?: boolean
  /** Order-ready redesign (stage 3): resolved server-side (effectiveOrderReady = event override ?? van
   *  default ?? false). Gates the orders-screen (solo) Ready button — NOT the email (model A: the email
   *  always fires on ready). Defaults off. */
  effectiveOrderReady?: boolean
  pendingSync?: boolean
  /** DEMO ONLY — DOM id on the card root so the loop-complete card can scroll to this order.
   *  Undefined everywhere else, and React omits the attribute entirely for undefined, so a live
   *  operator's card renders exactly the markup it always did. */
  anchorId?: string
  /** DEMO ONLY — the settled "this is the one" ring (app/globals.css .demo-order-highlight). Set by
   *  the demo dashboard once the scroll to this card has finished; false everywhere else, and false
   *  appends nothing to the class string. */
  highlight?: boolean
  /** ── OFFLINE PAYMENT OVERLAY ─────────────────────────────────────────────────────────────────────
   *  A queued-but-unsynced payment op for THIS order, from useOfflinePaymentOverlay. Undefined on web
   *  and whenever nothing is queued.
   *
   *  🔴 IT RENDERS EXACTLY AS A CONFIRMED PAYMENT — same chip, same colour, same buttons, same tap
   *  targets. THIS WAS BRIEFLY BUILT THE OTHER WAY (a dashed amber "⏳ PAID · SYNCING" chip and a
   *  non-interactive label) AND THAT WAS WRONG. Do not reintroduce it.
   *  WHY: OFFLINE_STATUS_MAP already makes offline STATUS changes indistinguishable from online ones —
   *  tap Ready offline and the card just advances. Making PAYMENT the one action in the same workflow
   *  that looks different is an inconsistency the operator has to learn, mid-service, on the one screen
   *  where they are busiest. The global OfflineBanner already tells them the state of the world; the
   *  card's job is to reflect their action. Their workflow must not change when the connection drops.
   *
   *  ⚠️ IT LAYERS ON TOP OF getOrderBalance — it never replaces or re-derives it. `balance` stays the
   *  CONFIRMED state and is what every other consumer reads; this only overrides the RENDERED paid-ness. */
  pendingPayment?: 'pending_paid' | 'pending_unpaid'
  /** ── THE PER-ORDER FAILURE MARKER ───────────────────────────────────────────────────────────────
   *  A FAILED (state 'conflict') outbox op for this order that the operator has not acknowledged, from
   *  the surface's useOutboxConflicts. Undefined on web and whenever nothing has failed.
   *
   *  🔴 THIS IS NOT THE PENDING/SYNCING DISTINCTION AND MUST NOT BECOME IT. A QUEUED op stays invisible —
   *  that decision stands and is argued at `pendingPayment` above. This marks a REJECTED one, which is a
   *  genuinely different state and is allowed to look different, because it is.
   *
   *  🔴 WHY IT LIVES ON THE CARD AT ALL. The banner names the order; the card is where the operator is
   *  already looking. Without this, a failed payment replay makes a green PAID chip silently revert on a
   *  grid of thirty and nothing marks the spot.
   *
   *  ⚠️ ITS STATE DOES NOT COME FROM THE ORDER. The payment overlay drops its entry the moment an op is
   *  flagged conflict, so by the time this renders there is nothing left in the overlay to read. It comes
   *  from the OUTBOX in Capacitor Preferences, polled independently of /api/dashboard — so a poll that
   *  replaces every order object cannot clear it. Only an acknowledgement clears it. */
  conflict?: 'payment' | 'status'
  /** This order's order_payments rows, supplied by /api/dashboard. Fed straight to getOrderBalance —
   *  the card NEVER derives payment state itself. Undefined/empty ⇒ nothing paid. */
  ledgerRows?: LedgerRow[]
  /** ── THIS DEVICE DOES NOT TAKE MONEY (KDS window devices only) ───────────────────────────────────
   *  Set by the KDS from its per-device "take payments on this device" toggle, and ONLY when the truck's
   *  paid step is on. DEFAULT FALSE, so the dashboard — which never passes it — is byte-identical.
   *
   *  🔴 IT IS NOT A CSS-LEVEL HIDE. It suppresses the paid chip AND swaps the window button set for the
   *  cook one, so the ticket's life on this screen ends at Ready. Hiding the chip while leaving a "Mark
   *  paid" button would be the worst of both: an operator taking money on a screen that will not show
   *  them whether it landed.
   *
   *  ⚠️ IT DOES NOT TOUCH `balance`, `effectivePaid` OR ANY ARITHMETIC. getOrderBalance still runs over
   *  the real ledger rows and still governs everything else — this decides only what is OFFERED. Payment
   *  state stays derived in one place; a device preference must never be able to change what is true. */
  hidePayments?: boolean
  /** Open the buzzer grid for this order. UNDEFINED ⇒ this van has no buzzers (or the surface has not
   *  wired it) and the chip is not rendered at all — the card is byte-identical to before. */
  onBuzzer?: (order: Order) => void
}) {
  // Cards always show their content — the collapse/triangle was removed (it only made the box look empty).
  const expanded = true

  /** Inline "Remove payment?" confirm, revealed by tapping the paid chip. Local and transient — it
   *  auto-clears whenever the order's payment state changes (see the effect below). */
  const [confirmRemovePayment, setConfirmRemovePayment] = useState(false)

  // ── PAID-STEP SETTINGS — RESOLVED BY THE SHARED HELPER, NEVER INLINE (V9.5) ─────────────────────
  // The card already receives `truck` and `event`, so it resolves its own settings rather than taking
  // them as props. That removes any chance of the card and the server disagreeing about whether the
  // paid step is split for THIS event — they run the same function over the same two inputs.
  const { showPaidStep, takesCash } = resolvePaidStep(truck, event)

  // ── PAYMENT STATE — DERIVED, NEVER RECOMPUTED HERE (V9.4) ───────────────────────────────────────
  // getOrderBalance is the SAME pure function the server rollup uses, so the card and orders.payment_status
  // can never disagree. Do not add arithmetic on amount_paid/total here: one derivation, one place.
  const balance = getOrderBalance(order as any, ledgerRows ?? [])
  const isPaid = balance.status === 'paid' || balance.status === 'refunded'
  const isPartPaid = balance.status === 'part_paid'

  // 🔴 THE OVERLAY FOLDS INTO THE RESOLVER'S BOOLEANS, RIGHT HERE, so EVERY consumer below — the chip,
  // the pay buttons, the primary action, the tap targets — reads ONE pair of values and CANNOT diverge
  // between the queued and the confirmed case. That is stronger than styling two paths to match: there is
  // no second path to keep in step, and a future button added below is consistent by default.
  // ⚠️ Declared immediately after `isPaid`/`isPartPaid` DELIBERATELY. They were briefly defined 90 lines
  // lower, below three consumers that therefore still read the raw values — the buttons disagreed with the
  // chip. Anything derived from paid-ness must come before the first thing that uses it.
  // ⚠️ `balance` is NOT touched: a part-paid chip still shows the resolver's real amounts.
  const effectivePaid = pendingPayment === 'pending_paid' ? true
    : pendingPayment === 'pending_unpaid' ? false
    : isPaid
  const effectivePartPaid = pendingPayment ? false : isPartPaid
  const money = (minor: number) => `£${(minor / 100).toFixed(2)}`

  // Dismiss the inline confirm whenever the payment state moves underneath it — the removal landed, or
  // another device changed it — so a stale "Remove payment?" can never sit over an order that is no
  // longer in that state.
  useEffect(() => { setConfirmRemovePayment(false) }, [balance.status, balance.paidMinor])

  const isLoading = (action: string) => actionLoading === `${action}-${order.order_key}`

  // ── THE COMPLETION BUTTON (V9.4) ────────────────────────────────────────────────────────────────
  // ONE button that RELABELS by payment state — not a second button, and not a double-tap gesture.
  // That matters for the fast-tap rule (§10): there is no timing window, no debounce and no delayed
  // first action. Two quick taps do paid-then-done naturally because the second tap lands on a button
  // that has already become "Done"; tapping once and stopping is a complete, valid action either way.
  //   showPaidStep OFF → "Paid & collected", firing 'collected' — the ACTION name is unchanged.
  //   unpaid           → "Mark paid"            → 'mark_paid'  (order stays put in the queue)
  //   part paid        → "Mark £X.XX paid"      → 'mark_paid'  (charges the outstanding balance only)
  //   paid             → "Collected"            → 'collected'
  const completionBtn = () => {
    if (!showPaidStep) {
      return <Btn label="Paid & collected" colour="dark" loading={isLoading('collected')} onClick={() => onAction('collected', order.order_key)} />
    }
    if (effectivePaid) {
      return <Btn label="Collected" colour="dark" loading={isLoading('collected')} onClick={() => onAction('collected', order.order_key)} />
    }
    // ORANGE — a MONEY action, in the page's own brand colour. GREEN means a KITCHEN state advancing
    // (Ready, ✓ Confirm) and SLATE means completion (Done). Blue was tried here and was foreign to a
    // page whose vocabulary is orange/slate/green. See lib/ui-tokens.ts.
    //
    // CASH/CARD SPLIT: both are the SAME solid orange, distinguished by ICON, not colour.
    // 🔴 COLOUR ENCODES WHAT KIND OF ACTION SOMETHING IS, NEVER WHICH VARIANT OF IT. Two near-identical
    // oranges would read as a rendering mistake; a third and fourth colour would make the row noisy.
    // Cash and card are a genuine either/or with no default, so parity is correct — and a thumb finds
    // an ICON faster than it reads a word.
    // Icons are EMOJI because that is the icon vocabulary this codebase already uses on buttons
    // (✓ Confirm, ✏ Edit, ↩ Undo, 🔥 Cooking) — there is no icon library in package.json and adding
    // one for two glyphs would be a dependency for nothing.
    // Two buttons, ONE TAP either way; deliberately NOT "Mark paid" → modal → choose (§10 fast-tap).
    // Distinct action names (mark_paid_cash / mark_paid_card) keep the pending state PER BUTTON — a
    // shared `mark_paid` key would grey out and spin both, the bug fixed on the confirm bar.
    // Labels are BARE on the card, no amounts: the amount already appears twice (the price, and the
    // part-paid chip's balance), and at the 240px KDS column an amount would not fit beside a second
    // button. Amounts belong in the Add Order confirm bar, which has the width for them.
    // ✅ THE PAY BUTTONS ARE UNCHANGED BY THE OVERLAY. They are already gated on the paid-ness above —
    // which now folds the queued state in — so a queued payment hides them for exactly the same reason a
    // confirmed one does. No offline-specific branch exists here, and that is the point.
    if (takesCash) {
      return (
        <>
          <Btn label="💷 Cash" colour="money" loading={isLoading('mark_paid_cash')}
            onClick={() => onAction('mark_paid_cash', order.order_key)} />
          <Btn label="💳 Card" colour="money" loading={isLoading('mark_paid_card')}
            onClick={() => onAction('mark_paid_card', order.order_key)} />
        </>
      )
    }
    return (
      <Btn
        label={effectivePartPaid ? `Mark ${money(balance.balanceMinor)} paid` : 'Mark paid'}
        colour="money" loading={isLoading('mark_paid')}
        onClick={() => onAction('mark_paid', order.order_key)}
      />
    )
  }

  // ── THE MONEY CHIP, AND THE PERSISTENT PAYMENT REVERSAL (V9.4) ──────────────────────────────────
  // The chip states the payment fact: paid at a glance, or the outstanding balance when part paid,
  // because that is the number the operator has to ask for. Nothing when the truck has not opted in or
  // nothing has been paid — an unpaid order is the norm and needs no decoration.
  //
  // 🔴 THE CHIP IS ALSO THE UNDO ROUTE AFTER THE TOAST HAS GONE. The 7-second toast is a mis-tap catch,
  // not a correction mechanism: an operator who realises ten minutes later that they marked the WRONG
  // order paid previously had no route at all. Tapping the chip reveals a small inline confirm.
  // WHY THIS INTERACTION:
  //   • It hangs off the thing it describes — you correct the payment by tapping the payment.
  //   • It is a CORRECTION, not a primary action, so it must not compete with the main button: it lives
  //     in the header beside the price, at 10px, while the primary action is a full-width button at the
  //     bottom of the card. The two are at opposite ends and cannot be confused.
  //   • TWO deliberate taps (chip → "Remove payment"), so a stray tap while scanning a card opens a
  //     dialog and nothing more. There is no destructive single-tap target anywhere on this path.
  //   • A MODAL, not an inline confirm — see removePaymentModal below for why that changed and why
  //     §10's fast-tap rule does not govern it.
  // It calls `undo_mark_paid`, which is the SAME server path the undo toast already uses: audit FIRST
  // (abort the delete if the audit write fails), then delete the ledger row, then recalc. No second
  // reversal implementation exists.
  // `hidePayments` sits alongside `!showPaidStep` rather than wrapping the render: both mean "this
  // surface has no business stating a payment fact", and folding them into the one null-gate keeps the
  // chip, its tap target and the remove-payment modal on a single switch. There is no second path.
  const paidChipStatic = !showPaidStep || hidePayments ? null
    : effectivePaid ? <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 flex-shrink-0">PAID</span>
    : effectivePartPaid ? <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 flex-shrink-0 whitespace-nowrap">{money(balance.paidMinor)} / {money(balance.balanceMinor)} due</span>
    : null

  // ✅ TAPPABLE IN BOTH CASES. An operator who mis-taps offline must be able to undo it exactly as
  // online. The queued undo is safe: the outbox coalesces only kind:'stock', so BOTH ops are sent, FIFO
  // (listOps sorts by seq), and an `undo_mark_paid` that finds no charge row returns reversal:'none' with
  // a 2xx — a no-op, not a failure. See docs/offline-coverage-report.md.
  const paidChip = paidChipStatic === null ? null : (
    <button onClick={() => setConfirmRemovePayment(true)} title="Tap to remove this payment" className="flex-shrink-0">
      {paidChipStatic}
    </button>
  )

  // ── THE REMOVE-PAYMENT MODAL ────────────────────────────────────────────────────────────────────
  // 🔴 §10's FAST-TAP RULE DOES NOT APPLY HERE, and that is a deliberate reading rather than an
  // oversight. That rule governs PRIMARY SERVICE actions — adding items, taking payment — where a popup
  // mid-transaction costs the operator time they do not have. Removing a payment is the opposite: a
  // deliberate CORRECTION, made after the fact, of a record that says money changed hands. A
  // confirmation step there is appropriate, not friction to be eliminated.
  // It replaced an INLINE two-tap confirm that physically did not fit: the card header already carries
  // the price and the PAID chip, so "Remove payment? Remove Keep" clipped off the card edge — the
  // "Keep" escape was unreachable, which is the worst possible thing to lose from a destructive confirm.
  // ⚠️ It calls `undo_mark_paid` — the SAME server path the undo toast uses. No third implementation:
  // audit FIRST, abort the delete if the audit write fails, then delete the ledger row, then recalc.
  const removePaymentModal = !confirmRemovePayment ? null : (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && setConfirmRemovePayment(false)}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Remove payment?</h3>
          <p className="text-sm text-slate-500 mt-2">
            This removes the <strong className="text-slate-700">{money(balance.paidMinor)}</strong> recorded
            against order <strong className="text-slate-700">#{order.id}</strong>. The order stays where it is;
            only the payment record is removed.
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setConfirmRemovePayment(false)}
            className="flex-1 border border-slate-200 text-slate-600 py-3 rounded-xl text-sm">Cancel</button>
          <button
            onClick={() => { setConfirmRemovePayment(false); onAction('undo_mark_paid', order.order_key) }}
            disabled={isLoading('undo_mark_paid')}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-50">
            {isLoading('undo_mark_paid') ? '…' : 'Remove payment'}
          </button>
        </div>
      </div>
    </div>
  )

  // ── THE BUZZER CHIP ─────────────────────────────────────────────────────────────────────────────
  // 🔴 IT LIVES IN HEADER ROW 1, IN ALL THREE VIEW MODES, AND THAT PLACEMENT IS LOAD-BEARING.
  // Row 1 is the IDENTITY cluster (#order, and in solo the collection time). A buzzer number IS
  // identity — "who is this food for" — so it belongs beside the order number, not in row 2 with the
  // metadata. Row 2 is also where the crowding fixes live: in solo the customer NAME is the only
  // flex-1 element and absorbs all pressure (the "Dom"→"D…" fix, see the note at the solo header),
  // and in window mode row 2 already carries name + Contact + time + late pill at a 240px column.
  // Adding a sixth shrink-0 chip there is what would force a THIRD ROW. Row 1 has slack in every mode:
  // solo has an ml-auto gap before the offset pill, window is justify-between with a short left side,
  // cook is #order + time only. NEITHER HEADER GREW A ROW.
  //
  // Sized on the paidChip's own metrics (text-[10px]/px-1.5/py-0.5/rounded-full) so the two chips read
  // as one family rather than two competing badges.
  //
  // ⚠️ COLOUR: white-on-slate, deliberately NOT the grid's green/red. In the grid those two mean
  // AVAILABLE and TAKEN; a green chip here would say "this number is free", the exact inverse of what
  // it means on a card. Neutral is also the only thing legible on all six getHeaderStyle backgrounds
  // (green-50 / amber-50 / red-50 / slate-50 / white). Family taken from getHeaderStyle's 'ok' state
  // (components/dashboard/helpers.ts:154 — bg-white, text-slate-900, slate border).
  //
  // Rendered ONLY when onBuzzer is supplied — a van with no buzzers gets the pre-existing card exactly.
  const buzzerChip = !onBuzzer ? null : (
    <button
      onClick={(e) => { e.stopPropagation(); onBuzzer(order) }}
      title={order.buzzer_number != null ? `Buzzer ${order.buzzer_number} — tap to change` : 'Tap to give a buzzer'}
      className={`flex-shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded-full border whitespace-nowrap transition-colors ${
        order.buzzer_number != null
          ? 'bg-white text-slate-900 border-slate-300 hover:border-slate-400'
          : 'bg-transparent text-slate-400 border-slate-200 hover:text-slate-600 hover:border-slate-300'
      }`}>
      {/* The number is ALWAYS spelled out beside the icon — the icon alone would be a second
          colour-only channel, and this chip is read at a glance next to a red/amber header. */}
      {order.buzzer_number != null ? `🔔 ${order.buzzer_number}` : '🔔'}
    </button>
  )

  /** The disabled placeholder shown while the cooking gate holds an order — same label logic, no action. */
  const completionBtnDisabled = () => (
    <button disabled className="flex-1 bg-slate-200 text-slate-400 font-bold py-3 rounded-xl text-sm cursor-not-allowed">
      {!showPaidStep ? 'Paid & collected' : effectivePaid ? 'Collected' : effectivePartPaid ? `Mark ${money(balance.balanceMinor)} paid` : 'Mark paid'}
    </button>
  )
  const [struckUnits, setStruckUnits] = useState<Record<number, number>>({})
  const [showContact, setShowContact] = useState(false)

  // Resolve the effective collection time via the shared resolver (Manual s.6):
  // an explicit slot for timed orders, the event-date-aware ASAP base for
  // null-slot (ASAP/walk-up) orders. Local-time construction lives in the helper
  // (Manual s.7). slotDt is now non-null for ASAP orders whenever the event is
  // known, so urgency and the displayed time become date-aware instead of falling
  // back to ticket age.
  const slotDt = resolveCollectionTime(order, event ?? null)

  // HH:MM to show on the card — the resolved time, so an ASAP order reads "17:00"
  // instead of nothing/"658m".
  const timeLabel = slotDt
    ? `${String(slotDt.getHours()).padStart(2, '0')}:${String(slotDt.getMinutes()).padStart(2, '0')}`
    : ''

  const computeOffset = () => slotDt ? getSlotOffset(slotDt) : -999

  const [slotOffset, setSlotOffset] = useState(computeOffset)

  // Client-side clock tick (ALL view modes incl. the orders-screen 'solo'): bump the
  // resolved "now" every 15s so the relative countdown ("in Xm") AND the prep-aware
  // green→amber→red colour advance in real time as the wall clock passes — no interaction,
  // no data refetch, no network. This lives INSIDE the card on purpose: it re-renders ONLY
  // this card, so the parent list / sort (sortByTimeThenId) / keys never recompute on a
  // tick → cards never reorder, flicker, or reload; only the time text + colour class
  // change. The 60s data poll (fetchAll) is separate and untouched — poll = data freshness,
  // tick = clock advance. 15s is ample for minute-granular display (≤15s threshold lag)
  // without re-rendering wastefully. Cleared on unmount (no leak).
  useEffect(() => {
    const id = setInterval(() => setSlotOffset(computeOffset()), 15000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.slot, order.event_date, event?.event_date, event?.start_time])

  // Prep-aware amber lead: amber fires when the slot is within (this order's cook time +
  // buffer) — so a long-cook order goes amber early enough to start it, and a no-cook one
  // only ~2 min out. Falls back to the helper's fixed 5-min default when configs aren't
  // supplied (cookSecs null) so colour never regresses if catConfigs is missing.
  const cookSecs = catConfigs ? getOrderCookSecs(order.items, itemCategoryMap ?? {}, catConfigs) : null
  const amberLeadMins = cookSecs == null ? undefined : cookAmberLeadMins(cookSecs)
  const urgencyState = order.status === 'ready'
    ? 'ready'   as const
    : order.status === 'cooking'
    ? 'cooking' as const
    : getCombinedUrgency(slotDt, order.created_at, amberLeadMins)
  const headerCls = getHeaderStyle(urgencyState)
  const s         = STATUS[order.status] || STATUS.pending
  const isPub     = truck?.mode === 'pub'

  const sortedItems = [...order.items].sort((a, b) =>
    getCategoryTime(b.name) - getCategoryTime(a.name)
  )

  const totalUnits = sortedItems.reduce((sum, item) => sum + item.quantity, 0)
  const struckTotal = sortedItems.reduce((sum, item, i) => sum + Math.min(struckUnits[i] || 0, item.quantity), 0)
  const allStruck = struckTotal >= totalUnits && totalUnits > 0

  const tapItem = (i: number, qty: number) => {
    setStruckUnits(prev => {
      const current = prev[i] || 0
      return { ...prev, [i]: current >= qty ? 0 : current + 1 }
    })
  }

  const showPrices = viewMode !== 'cook'

  type CookLine = { name: string; quantity: number; modifiers?: { name: string; price: number }[]; note?: string; dealName?: string; dealPrice?: number }
  const itemGroups: { cat: string; lines: CookLine[] }[] = (() => {
    const allLines: CookLine[] = [
      ...sortedItems.map(item => ({
        name: item.name, quantity: item.quantity,
        modifiers: item.modifiers, note: item.specialInstructions,
      })),
      ...(order.deals ?? []).flatMap(d =>
        Object.entries(d.slots)
          .filter(([, v]) => v)
          .map(([cat, itemName]) => ({
            name: itemName as string, quantity: 1,
            modifiers: (d.slotModifiers || {})[cat] || undefined,
            note: (d.slotNotes || {})[cat] || undefined,
            dealName: d.name,
            dealPrice: d.price,
          }))
      ),
    ]
    const buckets = new Map<string, CookLine[]>()
    ;(categoryOrder || []).forEach(cat => buckets.set(cat, []))
    buckets.set('__other__', [])
    allLines.forEach(line => {
      const cat = itemCategoryMap?.[line.name]
      const key = cat && buckets.has(cat) ? cat : '__other__'
      buckets.get(key)!.push(line)
    })
    buckets.forEach(lines => lines.sort((a, b) => a.name.localeCompare(b.name)))
    return [...buckets.entries()]
      .filter(([, lines]) => lines.length > 0)
      .map(([cat, lines]) => ({ cat, lines }))
  })()

  const standaloneGroups = (() => {
    const buckets = new Map<string, (typeof sortedItems)[number][]>()
    ;(categoryOrder || []).forEach(cat => buckets.set(cat, []))
    buckets.set('__other__', [])
    sortedItems.forEach(item => {
      const cat = itemCategoryMap?.[item.name]
      const key = cat && buckets.has(cat) ? cat : '__other__'
      buckets.get(key)!.push(item)
    })
    return [...buckets.entries()]
      .filter(([, lines]) => lines.length > 0)
      .map(([cat, lines]) => ({ cat, lines }))
  })()

  const offsetLabel = (() => {
    if (!slotDt) return `${getTicketAge(order.created_at)}m`
    if (slotOffset < -1440) return null
    if (slotOffset < -60) return `in ${Math.round(Math.abs(slotOffset) / 60)}h`
    if (slotOffset < 0) return `in ${Math.abs(slotOffset)}m`
    if (slotOffset === 0) return 'now'
    return `${slotOffset}m late`
  })()
  // Overdue (slot passed by ≥1 min) → the offset label renders as a RED PILL. Purely the lateness
  // indicator; the CARD background colour logic (§72) is unchanged (a ready card stays green).
  const isLate = !!slotDt && slotOffset >= 1

  // ── Button sets per viewMode ────────────────────────────────────────────────

  const renderButtons = () => {
    if (pendingSync) {
      return (
        <div className="flex items-center gap-2 py-3 text-slate-400 text-sm justify-center">
          <span>⏳</span>
          <span>Syncing…</span>
        </div>
      )
    }

    if (order.status === 'pending') {
      return (
        <>
          <Btn label="✓ Confirm" colour="green" loading={isLoading('confirm')} onClick={() => onAction('confirm', order.order_key)} />
          <Btn label="✗ Reject"  colour="red"   loading={isLoading('reject')}  onClick={() => onAction('reject', order.order_key)} />
        </>
      )
    }

    // ── COOK'S BUTTON SET, AND WINDOW'S WHEN THIS DEVICE DOES NOT TAKE MONEY ──────────────────────
    // 🔴 REUSED, NOT DUPLICATED. A window device with payments off has exactly the cook screen's job —
    // advance the food, stop at Ready — so it gets exactly the cook screen's controls. Inventing a
    // fourth button vocabulary for it would give the same operator two screens that behave nearly but
    // not quite alike, which is how a fast-tap surface (§10) gets someone paid twice.
    // ⚠️ EXPLICITLY `viewMode === 'window'`, never a bare `hidePayments`. Solo is the DASHBOARD's mode;
    // gating on the mode by name makes it structurally impossible for this prop to reach it, whatever a
    // future caller passes.
    if (viewMode === 'cook' || (viewMode === 'window' && hidePayments)) {
      if (['confirmed', 'modified'].includes(order.status)) {
        // Stage 1 (order-ready redesign): the cooking step is now ALWAYS on in cook mode — DE-COUPLED
        // from show_cooking_step (was `kdsMode && showCookingStep`). To re-add the "Show cooking step"
        // toggle later, restore `&& showCookingStep` here. Cook mode shows Start cooking → Ready.
        return kdsMode ? (
          <>
            <Btn label="Start cooking" colour="amber" loading={isLoading('cooking')} onClick={() => onAction('cooking', order.order_key)} />
            <Btn label="Ready"         colour="green" loading={isLoading('ready')}   onClick={() => onAction('ready', order.order_key)} />
          </>
        ) : (
          <Btn label="Ready" colour="green" loading={isLoading('ready')} onClick={() => onAction('ready', order.order_key)} />
        )
      }
      if (order.status === 'cooking') {
        return (
          <>
            <span className="flex-1 text-amber-700 font-bold text-sm flex items-center">🔥 Cooking…</span>
            <Btn label="Ready" colour="green" loading={isLoading('ready')} onClick={() => onAction('ready', order.order_key)} />
          </>
        )
      }
      return null
    }

    if (viewMode === 'window') {
      if (!kdsMode) {
        if (['confirmed', 'modified'].includes(order.status)) {
          return completionBtn()
        }
        if (order.status === 'ready') {
          return completionBtn()
        }
      } else {
        // Cooking gate active
        if (['confirmed', 'modified'].includes(order.status)) {
          return (
            <>
              <span className="text-xs font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-500">⏳ Waiting</span>
              {completionBtnDisabled()}
            </>
          )
        }
        if (order.status === 'cooking') {
          return (
            <>
              <span className="text-xs font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-700">🔥 Cooking…</span>
              {completionBtnDisabled()}
            </>
          )
        }
        if (order.status === 'ready') {
          return completionBtn()
        }
      }
    }

    // solo mode (default — the operator ORDERS screen). The order-READY step shows when pub mode OR the
    // resolved order-ready setting is on (effectiveOrderReady = event override ?? van default, computed in
    // /api/dashboard — stage 3 re-point off show_cooking_step). When enabled: confirmed → Ready (fires the
    // customer ready-email — model A: email ALWAYS fires on ready, NOT gated) → "Mark paid & done". When
    // off, the current one-tap complete is unchanged.
    const readyStepEnabled = isPub || effectiveOrderReady
    if (['confirmed', 'modified'].includes(order.status)) {
      return readyStepEnabled
        ? <Btn label={`${truck?.truck_emoji || "🍕"} Ready`} colour="green" loading={isLoading('ready')} onClick={() => onAction('ready', order.order_key)} />
        : completionBtn()
    }
    if (order.status === 'ready') {
      return completionBtn()
    }
    if (order.status === 'collected') {
      return <Btn label="↩ Undo" colour="slate" loading={isLoading('undo_collected')} onClick={() => onAction('undo_collected', order.order_key)} />
    }
    return null
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  // ── THE FAILURE MARKER ────────────────────────────────────────────────────────────────────────────
  // Above the header, inside the card, so it is visible without opening, expanding or scrolling anything.
  // 🔴 The money copy says what is UNTRUE ("not recorded") and what to DO, not "couldn't sync" — an
  // operator reading a sync error does not conclude that they are owed money. Persists until the operator
  // acknowledges it in the banner; see the `conflict` prop note for why a poll cannot clear it.
  const conflictMarker = conflict === 'payment' ? (
    <div className="w-full bg-red-700 text-white px-3 py-1.5 text-xs font-black tracking-wide text-center">
      ⚠ PAYMENT NOT RECORDED — check before releasing
    </div>
  ) : conflict === 'status' ? (
    <div className="w-full bg-amber-500 text-white px-3 py-1.5 text-xs font-bold text-center">
      ⚠ Last update didn&apos;t sync
    </div>
  ) : null

  return (
    <div id={anchorId} className={`w-full bg-white rounded-2xl overflow-hidden shadow-sm border transition-opacity flex flex-col ${allStruck ? 'opacity-50' : ''} ${conflict === 'payment' ? 'border-red-600 border-2' : conflict === 'status' ? 'border-amber-400' : pendingSync ? 'border-amber-300' : 'border-slate-200'}${highlight ? ' demo-order-highlight' : ''}`}>

      {conflictMarker}

      {/* Rendered from inside the card but positioned `fixed inset-0`, so it escapes the card's
          `overflow-hidden` and its grid cell entirely — it centres on the VIEWPORT and is therefore
          identical in solo, window and grid, at any column width. That is precisely what the inline
          confirm could not do. */}
      {removePaymentModal}

      {/* Full-width coloured header — age-driven */}
      {viewMode === 'cook' ? (
        /* Cook: non-interactive two-line header, no collapse */
        <div className={`w-full px-3 py-2 ${headerCls}`}>
          <div className="flex items-baseline justify-between gap-1">
            <span className="text-lg font-bold text-slate-900 truncate">#{order.id}</span>
            {/* Buzzer chip — row 1, beside the order number. See the buzzerChip note. */}
            {buzzerChip}
            <span className="text-xs text-slate-600 flex-shrink-0 inline-flex items-center gap-1 ml-auto">
              {timeLabel}
              {offsetLabel && (isLate
                ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-600 text-white">{offsetLabel}</span>
                : <>{` · ${offsetLabel}`}</>)}
            </span>
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-xs text-slate-600 truncate">{order.customer_name}</span>
            {(order.customer_email || order.customer_phone) && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowContact(v => !v) }}
                className="text-[11px] text-slate-400 hover:text-orange-500 border border-slate-200 rounded px-1.5 py-0.5 transition-colors">
                Contact
              </button>
            )}
            {allStruck && <span className="text-green-700 font-black text-xs ml-1">✓</span>}
          </div>
        </div>
      ) : (
        /* Window / solo: header (non-collapsing — content always shown). Window uses Cook's compact
           px-3 py-2 for KDS grid density; Solo keeps its roomier px-4 py-3 (gate is 'window'-only). */
        <div className={`w-full text-left ${viewMode === 'window' ? 'px-3 py-2' : 'px-4 py-3'} ${headerCls}`}>
          {viewMode === 'solo' ? (
            /* Solo (dashboard + mobile): two-row header. Row 1 is the identity+WHEN cluster — #order
               and the collection TIME together and prominent (the time is key info, so it sits beside
               the big order#, not demoted), then the status badge; offset/✓ go right. Row 2 gives the
               customer NAME the flex space (flex-1 min-w-0) so it shows in full and only ellipsis-
               truncates as a last resort — Contact + PRICE are flex-shrink-0 so they keep their size
               and never crowd the name out (the "Dom"→"D…" fix). Price is now the only number on the
               right of row 2, so time and price are no longer stacked in the same corner. */
            <>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold flex-shrink-0">#{order.id}</span>
                {timeLabel && <span className="text-lg font-bold flex-shrink-0">· {timeLabel}</span>}
                {/* Buzzer chip — the identity cluster, before the ml-auto offset group. See the
                    buzzerChip note for why this row and not row 2. */}
                {buzzerChip}
                {/* The status badge moved DOWN to row 2 (between channel/name and price) so this top
                    row has room for the lateness readout without clipping. Late = a RED PILL; otherwise
                    the plain "in Xm"/age readout. */}
                {(offsetLabel !== null || allStruck) && (
                  <div className="flex items-center gap-1.5 font-medium text-sm ml-auto flex-shrink-0">
                    {offsetLabel !== null && (isLate
                      ? <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-600 text-white">{offsetLabel}</span>
                      : <span className="opacity-70">{offsetLabel}</span>)}
                    {allStruck && <span className="font-black text-xs opacity-70">✓</span>}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm opacity-70 truncate min-w-0 flex-1">{order.customer_name}</span>
                {(order.customer_email || order.customer_phone) && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); setShowContact(v => !v) }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setShowContact(v => !v) } }}
                    className="text-[11px] text-slate-400 hover:text-orange-500 border border-slate-200 rounded px-1.5 py-0.5 transition-colors cursor-pointer flex-shrink-0">
                    Contact
                  </span>
                )}
                {/* Status BADGE (moved here from row 1) — sits between channel/name and price. Same
                    condition as before: shown for modified/cooking/ready (incl. the blue "Ready"),
                    suppressed for the baseline confirmed/pending the section heading already says. This
                    is the status BADGE, NOT the Ready ACTION button (that stays in the bottom row). */}
                {!['confirmed', 'pending'].includes(order.status) && (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${s.bg} ${s.text}`}>{s.label}</span>
                )}
                <span className="font-bold text-sm flex-shrink-0">£{Number(order.total).toFixed(2)}</span>
                {paidChip}
              </div>
            </>
          ) : (
            /* Window (KDS): TWO-ROW header (was a single cramped row that truncated name + clipped
               price at the dense 240px column). Row 1 = the glance numbers (#order / £total); Row 2 =
               metadata (name + Contact + time + lateness). */
            <>
              {/* Row 1 — order # (left) + total (right) */}
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-1.5 min-w-0">
                  <span className="text-3xl font-bold">#{order.id}</span>
                  {/* Buzzer chip — left cluster with the order number. At the 240px KDS column this is
                      the only row with slack; row 2 already carries name + Contact + time + late pill.
                      See the buzzerChip note. */}
                  {buzzerChip}
                </div>
                <div className="flex items-baseline gap-1.5 flex-shrink-0">
                  <span className="font-bold text-base">£{Number(order.total).toFixed(2)}</span>
                  {paidChip}
                  {allStruck && <span className="font-black text-xs opacity-70">✓</span>}
                </div>
              </div>
              {/* Row 2 — customer name + Contact + time + lateness */}
              <div className="flex items-center gap-2 font-medium text-sm mt-0.5">
                <span className="opacity-80 truncate min-w-0">{order.customer_name}</span>
                {(order.customer_email || order.customer_phone) && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); setShowContact(v => !v) }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setShowContact(v => !v) } }}
                    className="text-[11px] text-slate-400 hover:text-orange-500 border border-slate-200 rounded px-1.5 py-0.5 transition-colors font-normal cursor-pointer flex-shrink-0">
                    Contact
                  </span>
                )}
                {timeLabel && <span className="opacity-70 flex-shrink-0 ml-auto">{timeLabel}</span>}
                {offsetLabel !== null && (isLate
                  ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-600 text-white flex-shrink-0">{offsetLabel}</span>
                  : <span className="opacity-50 flex-shrink-0">· {offsetLabel}</span>)}
              </div>
            </>
          )}
        </div>
      )}

      {showContact && (
        <div className="px-4 py-2 bg-white border-t border-slate-100 text-xs space-y-0.5">
          {order.customer_email && (
            <a href={`mailto:${order.customer_email}`} className="block text-orange-500 hover:text-orange-600">
              ✉ {order.customer_email}
            </a>
          )}
          {order.customer_phone && (
            <a href={`tel:${order.customer_phone}`} className="block text-orange-500 hover:text-orange-600">
              📱 {order.customer_phone}
            </a>
          )}
        </div>
      )}

      {expanded && (
        <div className="px-4 pb-3 pt-2 bg-slate-50 flex flex-col flex-1">

          {/* ── Items: cook view vs window/solo view ── */}
          {viewMode === 'cook' ? (
            <div className="mb-2">
              {itemGroups.map(({ cat, lines }, gi) => (
                <div key={cat}>
                  <div className={`flex items-center gap-2 mb-1 ${gi > 0 ? 'mt-3' : ''}`}>
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-widest">
                      {cat === '__other__' ? 'Other' : cat}
                    </span>
                    <div className="flex-1 h-px bg-slate-200" />
                  </div>
                  {lines.map((line, j) => (
                    <div key={j} className="mb-0.5">
                      <p className="text-sm font-normal text-slate-900">{line.quantity}× {line.name}</p>
                      {(line.modifiers?.length || line.note) && (
                        <div className="pl-3">
                          {line.modifiers?.map(m => (
                            <p key={m.name} className="text-xs text-slate-500">+ {m.name}</p>
                          ))}
                          {line.note && <p className="text-xs text-slate-500 italic">📝 {line.note}</p>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            /* Window / solo: DEALS FIRST (deal blocks + leading "Deals" divider) THEN the standalone
               items by category. Cook view is untouched — it DISSOLVES deals into category batches via
               itemGroups (Section 8); this deals-first reorder is operator-order-card only. */
            <div className="mb-2">
              {standaloneGroups.length > 0 && (order.deals ?? []).length > 0 && (
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-widest">Deals</span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>
              )}

              {(order.deals ?? []).map((deal, di) => (
                <div key={di} className="mb-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-normal text-slate-900 flex-1">🎁 {deal.name}</span>
                    <span className="text-right tabular-nums w-16 flex-shrink-0 text-sm text-slate-900">
                      {deal.price != null ? `£${Number(deal.price).toFixed(2)}` : ''}
                    </span>
                  </div>
                  {Object.entries(deal.slots).filter(([, v]) => v).map(([slotCat, itemName]) => {
                    const mods = (deal.slotModifiers ?? {})[slotCat] ?? []
                    const note = (deal.slotNotes ?? {})[slotCat]
                    return (
                      <div key={slotCat} className="pl-4 mt-0.5">
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="flex-1 font-normal text-slate-900">1× {itemName}</span>
                          <span className="w-16 flex-shrink-0" />
                        </div>
                        {(mods.length > 0 || note) && (
                          <div className="pl-3 flex flex-col gap-y-0.5">
                            {mods.map(m => (
                              <div key={m.name} className="flex items-baseline justify-between gap-2">
                                <span className="flex-1 text-xs text-slate-500">+ {m.name}</span>
                                {m.price > 0 && <span className="text-right tabular-nums w-16 flex-shrink-0 text-sm text-slate-700">+£{m.price.toFixed(2)}</span>}
                              </div>
                            ))}
                            {note && <span className="text-xs text-slate-500 italic">📝 {note}</span>}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}

              {standaloneGroups.map(({ cat, lines }, gi) => (
                <div key={cat}>
                  <div className={`flex items-center gap-2 mb-1 ${gi > 0 || (order.deals ?? []).length > 0 ? 'mt-3' : ''}`}>
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-widest">
                      {cat === '__other__' ? 'Other' : cat}
                    </span>
                    <div className="flex-1 h-px bg-slate-200" />
                  </div>
                  {lines.map((line, j) => {
                    const itemIndex = sortedItems.findIndex(it => it.name === line.name)
                    // All struck/done state is gated on ITEM_TICK_ENABLED — when off these stay 0/false,
                    // so the item renders plain (name + price, no highlight/count/strike/✓) and the
                    // <button> is non-interactive. struckUnits/tapItem remain referenced (just unreached).
                    const struck = ITEM_TICK_ENABLED && itemIndex >= 0 ? Math.min(struckUnits[itemIndex] || 0, line.quantity) : 0
                    const allDone = ITEM_TICK_ENABLED && struck >= line.quantity
                    const partDone = ITEM_TICK_ENABLED && struck > 0 && !allDone
                    return (
                      <div key={j}>
                        <button
                          onClick={ITEM_TICK_ENABLED ? () => itemIndex >= 0 && tapItem(itemIndex, line.quantity) : undefined}
                          className={`w-full flex justify-between items-baseline gap-2 ${viewMode === 'solo' || viewMode === 'window' ? 'text-sm' : 'text-base'} rounded py-1.5 text-left ${
                            ITEM_TICK_ENABLED
                              ? `transition-all active:scale-[0.99] select-none ${allDone ? 'opacity-40' : partDone ? 'bg-orange-50' : 'hover:bg-orange-50'}`
                              : 'cursor-default'
                          }`}>
                          <span className={`flex-1 font-normal transition-all ${allDone ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                            {line.quantity}× {line.name}
                            {partDone && <span className="text-orange-500 text-xs font-black ml-1.5">({struck}/{line.quantity})</span>}
                          </span>
                          {allDone
                            ? <span className="text-right tabular-nums w-16 flex-shrink-0 text-xs text-green-500 font-bold">✓</span>
                            : <span className="text-right tabular-nums w-16 flex-shrink-0 text-sm text-slate-900">£{(line.unit_price * line.quantity).toFixed(2)}</span>
                          }
                        </button>
                        {(line.modifiers?.length || line.specialInstructions) && (
                          <div className="pl-4 -mt-0.5 mb-0.5 flex flex-col gap-y-0.5">
                            {line.modifiers?.map(m => (
                              <div key={m.name} className="flex items-baseline justify-between gap-2">
                                <span className="flex-1 text-xs text-slate-500">+ {m.name}</span>
                                {m.price > 0 && <span className="text-right tabular-nums w-16 flex-shrink-0 text-sm text-slate-700">+£{m.price.toFixed(2)}</span>}
                              </div>
                            ))}
                            {line.specialInstructions && (
                              <span className="text-xs text-slate-500 italic">📝 {line.specialInstructions}</span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}

          {/* Order notes.
              ⚠️ SPACING IS A SAFETY PROPERTY HERE, not a cosmetic one. A Square KDS complaint on record
              is operators accidentally COMPLETING an order while reaching in to read a note. In SOLO the
              ghost Edit/Cancel row sits between this block and the primary button and acts as a buffer —
              but in WINDOW/KDS mode those ghost buttons are not rendered (they are solo-gated), so the
              note sat mb-2 (8px) above "Mark paid & done" in the DENSEST layout, with nothing between
              them. Raised to mb-3 (12px) in window mode only; solo is untouched. Do not reduce it. */}
          {order.notes && (
            <div className={`bg-slate-50 border border-slate-200 text-slate-700 px-3 py-2 mx-3 rounded-md flex items-start gap-2 text-sm ${viewMode === 'solo' ? 'mb-2' : 'mb-3'}`}>
              <span className="flex-shrink-0 mt-0.5">📝</span>
              <span>{order.notes}</span>
            </div>
          )}

          {/* Quick time adjust — pending, non-cook only */}
          {order.status === 'pending' && order.slot && viewMode !== 'cook' && (
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-xs text-slate-400 font-medium shrink-0">Adjust time:</span>
              {[5, 10, 20].map(mins => (
                <button key={mins}
                  onClick={() => onAction(`adjust_slot_+${mins}`, order.order_key)}
                  className="text-xs bg-slate-100 hover:bg-orange-100 hover:text-orange-700 text-slate-600 font-bold px-2 py-1 rounded-lg transition-colors active:scale-95">
                  +{mins}m
                </button>
              ))}
              <span className="text-xs text-slate-300 ml-1">→ new time sent to customer</span>
            </div>
          )}

          {/* Action buttons — rarely-used Edit/Cancel sit ABOVE as de-emphasised GHOST buttons
              (transparent, light border, muted text — visually quiet but kept full-width + py-2.5
              so they stay iPad-tappable). The primary action (Mark paid & done / Ready / Confirm+
              Reject) is the prominent full-width button at the BOTTOM — the most-reachable target.
              Behaviour unchanged: same onEdit / onAction('cancel') / loading. */}
          <div className="flex flex-col gap-2 mt-auto">
            {viewMode === 'solo' && (['pending', 'confirmed', 'modified'].includes(order.status) || ['confirmed', 'modified', 'ready'].includes(order.status)) && (
              <div className="flex gap-2">
                {['pending', 'confirmed', 'modified'].includes(order.status) && (
                  <button onClick={() => onEdit(order)}
                    className="flex-1 font-semibold text-xs text-slate-500 bg-transparent border border-slate-200 hover:bg-slate-50 py-2.5 rounded-lg transition-colors active:scale-95">
                    ✏ Edit
                  </button>
                )}
                {['confirmed', 'modified', 'ready'].includes(order.status) && (
                  <button onClick={() => onAction('cancel', order.order_key)} disabled={isLoading('cancel')}
                    className="flex-1 font-semibold text-xs text-red-400 bg-transparent border border-red-100 hover:bg-red-50 py-2.5 rounded-lg transition-colors active:scale-95 disabled:opacity-50">
                    {isLoading('cancel') ? '...' : '✕ Cancel'}
                  </button>
                )}
              </div>
            )}
            <div className="flex gap-2">
              {renderButtons()}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
