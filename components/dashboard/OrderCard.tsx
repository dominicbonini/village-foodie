'use client'
// components/dashboard/OrderCard.tsx

import { useState, useEffect } from 'react'
import type { Order, TruckData, Slot, TruckEvent } from './types'
import { STATUS } from './types'
import { getCategoryTime, getTicketAge, getSlotOffset, getCombinedUrgency, getHeaderStyle, resolveCollectionTime, getOrderCookSecs, cookAmberLeadMins } from './helpers'
import type { CatConfig } from '@/lib/prep-utils'
import { getOrderBalance, type LedgerRow } from '@/lib/payments/ledger'
import { PaymentActionsModal, type RefundSubmit } from '@/components/dashboard/PaymentActionsModal'
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
  onRefund,
  onEdit,
  categoryOrder,
  itemCategoryMap,
  catConfigs,
  viewMode = 'solo',
  // ⚠️ DEFAULTS TO `viewMode`, WHICH IS WHAT KEEPS EVERY EXISTING CALLER BYTE-IDENTICAL. The dashboard
  // passes neither, so both resolve to 'solo' and every branch below behaves exactly as it did.
  cardStyle = viewMode,
  hideAmounts = false,
  kdsMode = false,
  showCookingStep = false,
  effectiveOrderReady = false,
  readyStepOn = false,
  pendingSync = false,
  anchorId,
  highlight = false,
  ledgerRows,
  hidePayments = false,
  offline = false,
  heldAuthorisation = false,
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
  /** 🔴 ISSUE A REFUND. Optional: a surface that has not wired one gets the modal exactly as it read
   *  before the refund form existed. NOT routed through `onAction` — that goes through the offline
   *  outbox, and a Stripe refund replayed blind against a position that has since moved is the one
   *  thing this must never be. */
  onRefund?: RefundSubmit
  onEdit: (order: Order) => void
  categoryOrder?: string[]
  itemCategoryMap?: Record<string, string>
  /** Per-category cook config (prep_secs/batch_size, keyed by lowercased category name)
   *  — drives the PREP-AWARE green→amber threshold. Absent ⇒ the card falls back to the
   *  old fixed 5-min amber lead (getCombinedUrgency's default). */
  catConfigs?: Record<string, CatConfig>
  /** ── THE LIFECYCLE AXIS: WHICH BUTTONS EXIST ────────────────────────────────────────────────────
   *  🔴 BUTTONS AND STATUS BRANCHES ONLY. On the KDS this is `boardMode`, derived from the two switches,
   *  and it decides which button set `renderButtons` produces and when an order leaves the board. It
   *  decides NOTHING about appearance — that is `cardStyle`. */
  viewMode?: ViewMode
  /** ── THE PRESENTATION AXIS: WHAT THE CARD LOOKS LIKE ────────────────────────────────────────────
   *  🔴 WHY THIS EXISTS. `viewMode` used to do both jobs, so a LIFECYCLE switch was choosing the header,
   *  the type size and the item renderer. A Payment-&-handover-off device resolves `boardMode` to 'cook',
   *  so it rendered the COOK card — a `text-lg` order number instead of `text-3xl`, a `text-xs` customer
   *  name, no prices — EVEN WITH `Full` SELECTED. The display control was being overruled by a switch
   *  that is supposed to decide nothing about appearance.
   *
   *  🔴 THE TWO AXES, AND NOTHING MAY CROSS THEM:
   *    `viewMode`  — Payment & handover. When the order leaves, and therefore which buttons exist.
   *    `cardStyle` — Full / Cook. What the card shows. Full shows everything; Cook hides amounts.
   *
   *  ⚠️ DEFAULTS TO `viewMode`, so a caller that passes only `viewMode` gets exactly today's behaviour.
   *  The dashboard passes neither and both resolve to 'solo'. */
  cardStyle?: ViewMode
  /** ── THE DISPLAY CHOICE: HIDE EVERY MONETARY AMOUNT ─────────────────────────────────────────────
   *  🔴 MONEY ONLY, AND THAT BOUNDARY IS THE WHOLE POINT OF THIS PROP. It hides line prices, the order
   *  total, the part-paid row and the refund amount. It appears in NO button branch, NO status test and
   *  NO layout rule — `viewMode` still owns all three, and `viewMode` is driven by the KDS's two
   *  SWITCHES, never by this.
   *
   *  🔴 WHY IT EXISTS AS A SECOND PROP INSTEAD OF A THIRD `viewMode` VALUE. The KDS's Full/Cook control
   *  used to be fed into `viewMode` directly. `renderButtons` reads `viewMode`, so a display toggle was
   *  choosing the button set — and at status 'ready' it chose the cook branch, which has no 'ready'
   *  case and returns null: a card on a live board with no way to advance it. A display control must
   *  not be able to do that, and the only structural guarantee is that it never reaches the same value.
   *
   *  ⚠️ `PAID` AND `CARD HELD` SURVIVE IN COOK, DELIBERATELY. They are STATES, not amounts, and they
   *  tell the operator whether to take money — which is exactly the question a hatch is asking. The
   *  part-refund chip is hidden entirely rather than reworded: a refund is not actionable at a hatch,
   *  and inventing a new string to avoid printing a number is the wrong trade.
   *
   *  ⚠️ DEFAULTS FALSE, so the DASHBOARD — which passes nothing — is character-identical. */
  hideAmounts?: boolean
  kdsMode?: boolean
  /** Van "show cooking step" preference — when false the cook view skips the intermediate
   *  "Start cooking" stage (confirmed → ready directly). Defaults off. */
  showCookingStep?: boolean
  /** Order-ready redesign (stage 3): resolved server-side (effectiveOrderReady = event override ?? van
   *  default ?? false). Gates the orders-screen (solo) Ready button — NOT the email (model A: the email
   *  always fires on ready). Defaults off. */
  effectiveOrderReady?: boolean
  /** KDS PER-DEVICE "Marks ready" switch, ON. Window view only, and only meaningful alongside
   *  handover — a handover-off device takes the cook branch above and never reaches it. True renders
   *  Ready on confirmed/modified/cooking and the completion control on 'ready', which also DERIVES the
   *  wait away (Invariant A): a screen that marks ready never shows the waiting treatment.
   *  Deliberately NOT the same prop as `effectiveOrderReady` — that one is the DASHBOARD's
   *  server-resolved event/van setting, read only in solo mode, so the two surfaces stay independent by
   *  construction. Defaults false = today's behaviour everywhere. */
  readyStepOn?: boolean
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
  /** 🔴 THIS DEVICE CANNOT REACH THE SERVER. Forwarded to PaymentActionsModal, which replaces every
   *  money-CHANGING branch with an explanation. DEFAULT FALSE ⇒ a surface that does not pass it (the KDS,
   *  which never renders that modal anyway) is byte-identical.
   *  ⚠️ IT DOES NOT TOUCH `balance`, `effectivePaid` OR ANY ARITHMETIC, and it does NOT gate the Mark
   *  paid / collected buttons — recording a NEW payment offline is queued through the gate exactly as
   *  before. Only MODIFICATION of an existing payment is restricted. */
  offline?: boolean
  /** 🔴 THIS ORDER HAS A LIVE, UNCAPTURED CARD AUTHORISATION. Resolved ONCE server-side
   *  (lib/payments/held-authorisation.ts) and shipped by /api/dashboard — never worked out here.
   *  ⚠️ IT IS NOT "paid". The order is genuinely unpaid, no money has moved and getOrderBalance is
   *  untouched. It says only that the money is HELD and must not be collected at the hatch: capture
   *  follows confirmation. */
  heldAuthorisation?: boolean
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
  // 🔴 `showPaidStep` IS DELIBERATELY NOT DESTRUCTURED — THIS CARD NO LONGER READS IT AT ALL.
  // It had three consumers here and all three left: the PAID chip (un-gated, because whether money has
  // been recorded is a fact about the ORDER), and completionBtn / completionBtnDisabled (moved to
  // `completionPresses`, because how an order is handed over is a different question from whether the
  // Add Order panel can place one unpaid). An unpaid order reaches this card from the customer path on
  // every truck, whatever that setting says — so nothing about a CARD should depend on it. If you find
  // yourself adding it back, that is the thing to re-examine first.
  const { takesCash, completionPresses } = resolvePaidStep(truck, event)

  // ── PAYMENT STATE — DERIVED, NEVER RECOMPUTED HERE (V9.4) ───────────────────────────────────────
  // getOrderBalance is the SAME pure function the server rollup uses, so the card and orders.payment_status
  // can never disagree. Do not add arithmetic on amount_paid/total here: one derivation, one place.
  const balance = getOrderBalance(order as any, ledgerRows ?? [])
  // ── 🔴 EVERY PAYMENT STATE IN WHICH THE ORDER DOES NOT OWE MONEY, IN ONE PLACE. ─────────────────
  // The test this list answers is "would recording another payment be wrong?", and for all four the
  // answer is yes. It is an ALLOW-list, so a status added to the CHECK in future keeps offering the
  // button until someone decides otherwise — the safe direction, because the cost of asking for money
  // that is owed is one tap and the cost of taking money that is not is a refund.
  //   'paid'           balance zero. The ordinary settled order.
  //   'refunded'       charged and fully given back. Closed; nothing to collect at the hatch.
  //   'part_refunded'  charged in full, some given back. The remainder is the truck's, not owed.
  //   'refund_due'     🔴 MORE THAN THE BALANCE HAS BEEN TAKEN. Offering to record a further payment
  //                    on an order that is already over-paid is the worst member of this list, and it
  //                    was the one missing: `mark_paid` on order 18 produced a green "marked paid"
  //                    toast, wrote nothing (recordCollectionPayment's `balanceMinor <= 0` guard), and
  //                    offered an Undo that would have deleted a real cash payment.
  // ⚠️ 'part_paid' AND 'unpaid' ARE DELIBERATELY ABSENT — those orders genuinely owe money.
  // ⚠️ 'failed' IS ABSENT AND UNREACHABLE. getOrderBalance never returns it; it exists on the column's
  // CHECK only, and its meaning — a payment attempt failed — is "money IS owed" anyway.
  const SETTLED_STATUSES = ['paid', 'refunded', 'part_refunded', 'refund_due'] as const
  const isPaid = (SETTLED_STATUSES as readonly string[]).includes(balance.status)
  const isPartPaid = balance.status === 'part_paid'

  // ── 🔴 IS THERE AN IN-PERSON PAYMENT THAT `undo_mark_paid` COULD ACTUALLY REMOVE? ───────────────
  // A MIRROR OF reverseCollectionPayment's OWN LOOKUP, condition for condition — it selects
  //     .eq('kind', 'charge').neq('channel', 'online').eq('livemode', true)
  // and returns `reversal: 'none'` when that finds nothing. The dashboard already ships every one of
  // those columns in LEDGER_ROW_COLUMNS, so the card can answer the same question without a round trip.
  // 🔴 THIS IS WHY THE UNDO CONTROL LIED. A card payment writes `channel: 'online'`, so the lookup can
  // never select it: nothing is deleted, the route discards `reversal: 'none'`, and the operator is told
  // "Undone — payment removed" about a payment that is still on the customer's card.
  // ⚠️ IT IS A ROW TEST, NOT AN ORDER TEST, and that distinction is load-bearing: an order paid partly by
  // card and partly in cash HAS a reversible row, and undo must keep working for it exactly as today.
  const hasReversibleInPersonPayment = (ledgerRows ?? []).some(
    r => r.kind === 'charge' && r.channel !== 'online' && r.livemode === true,
  )

  // ── THE TWO FIGURES A REFUND NEEDS, FROM THE ROWS THIS CARD ALREADY HAS. ───────────────────────
  // ⚠️ A SUGGESTION, NOT AN AUTHORITY. lib/payments/refund recomputes both — the refunded half from
  // STRIPE, because a pending refund writes no ledger row and ours would be blind to one in flight.
  const cardChargeMinor = (ledgerRows ?? [])
    .filter(r => r.kind === 'charge' && r.channel === 'online')
    .reduce((sum, r) => sum + r.amount_minor, 0)
  const refundedMinor = (ledgerRows ?? [])
    .filter(r => r.kind === 'refund')
    .reduce((sum, r) => sum + r.amount_minor, 0)
  // HOW the money arrived, one entry per charge row — the modal describes what happened rather than
  // picking one. ⚠️ `method` is NULL on almost every in-person row; the modal says so rather than guess.
  const chargeBreakdown = (ledgerRows ?? [])
    .filter(r => r.kind === 'charge')
    .map(r => ({ channel: r.channel, method: (r as { method?: string | null }).method ?? null, amountMinor: r.amount_minor }))

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
  //   ONE press → "Mark paid & collected", firing 'collected' — the ACTION name is unchanged.
  // ⚠️ THE LABEL IS LENGTH-CONSTRAINED, NOT FREE COPY. It shares a flex row with a status chip in the
  // cooking-gate case (completionBtnDisabled beside "⏳ Waiting"), inside a KDS grid column whose FLOOR
  // is 240px, and `Btn` sets no `whitespace-nowrap` or `truncate` — so an over-long label WRAPS and the
  // button grows taller than the chip beside it. "Mark paid and collected" measured ~177px against
  // ~130px of usable width in that slot; "&" saves ~14px and restores the slack. Measurements and the
  // shorter/longer options are in docs/payments-report.md. Do not lengthen this without re-measuring.
  // ⚠️ THE ENABLED BUTTON SPELLED IT "and" UNTIL 10 August 2026 while the disabled placeholder below
  // said "&" — a shortening pass matched only the single-quoted string and missed this JSX attribute,
  // so the two disagreed and Manage advertised a label the card never rendered. If you change the
  // wording, change it in THREE places: here, completionBtnDisabled, and the Manage radio's button line.
  //
  // ── 🔴 DO NOT DROP THE WORD "MARK". IT IS WHAT MAKES THESE READ AS ACTIONS. ─────────────────────
  // The Add Order bar's secondary was shortened on 10 August ("Place order, pay later" → "Place order")
  // and these are the obvious next thing to shorten. They must not be. **"Mark paid" is an instruction;
  // "Paid" is a status** — and this card already carries a PAID CHIP a few lines up, so a button reading
  // `Paid & collected` beside a chip reading `PAID` would read as a state the card is reporting rather
  // than a thing the operator can press. That ambiguity is worse here than anywhere else in the product,
  // because the press books money.
  // ⚠️ The Add Order case is the opposite and that is why it could be shortened: "Place order" sits
  // beside "Take payment £10.00", so the CONTRAST carries the meaning. Nothing on this card supplies
  // that contrast — the completion button is frequently the only control on the row.
  //   unpaid    → "Mark paid"            → 'mark_paid'  (order stays put in the queue)
  //   part paid → "Mark £X.XX paid"      → 'mark_paid'  (charges the outstanding balance only)
  //   paid      → "Collected"            → 'collected'
  //
  // ── 🔴 THE ONE-PRESS PATH IS ONE SERVER ACTION, ONE REQUEST, ONE OUTBOX OP. DO NOT SPLIT IT. ─────
  // It fires the EXISTING 'collected' action, unchanged — the server books the full outstanding balance
  // and writes the status inside one handler (app/api/dashboard/action/route.ts). Only the LABEL is new.
  // ⚠️ NEVER dispatch 'mark_paid' AND 'collected' from here to "do both". The outbox marks a conflicted
  // op `conflict` and SKIPS it, then CONTINUES with the rest (lib/native/orderGate.ts) — and it has no
  // dependency ordering — so a conflicting 'mark_paid' would be dropped while 'collected' replayed, and
  // the order would complete with no payment recorded. The safety is in there being exactly one op.
  // 🔴 GATED ON completionPresses, NOT ON showPaidStep (10 August 2026). Those were the same boolean
  // until the settings were split. `showPaidStep` now answers "can this truck place an order unpaid?",
  // which is a question about ORDER ENTRY and says nothing about how an order is handed over — and an
  // unpaid order reaches this button from the customer path whatever that setting says.
  //
  // ── 🔴 PAYMENT STATE IS TESTED FIRST. THE SETTING ONLY DECIDES WHAT AN *UNPAID* ORDER OFFERS. ────
  // WHETHER MONEY HAS BEEN RECORDED AGAINST THIS ORDER IS A FACT ABOUT THE ORDER, NOT A PREFERENCE OF
  // THE TRUCK — the same rule that un-gated the PAID chip earlier today, applied to the action instead
  // of the decoration. A truck setting can decide HOW payment is taken; it cannot decide whether £10
  // has already changed hands, and it must never offer to take it again.
  //
  // ⚠️ THE BUG THIS FIXES, OBSERVED ON test-kitchen (10 August 2026): `completionPresses === 'one'` was
  // tested BEFORE `effectivePaid`, so an order that was already paid — marked paid at order time, PAID
  // chip rendering correctly beside it — was offered "Mark paid & collected". The ledger was right and
  // the button was wrong, because the branch never asked about the order.
  // 🔴 AND IT GETS WORSE WITH STRIPE. An online order arriving ALREADY PAID would land on that same
  // branch and invite a second recording of money already taken. Testing paid-ness first makes the
  // route the payment arrived by irrelevant: ledger, walk-up, Mark paid, or a webhook that does not
  // exist yet — a settled order is offered COLLECTED and nothing else.
  // (The server has always been safe here: recordCollectionPayment short-circuits on a zero balance, so
  // the second press would have booked nothing. This is about not ASKING an operator to do it — a
  // button that invites a duplicate payment is a defect even when the duplicate cannot land.)
  //
  // ⚠️ PART-PAID DELIBERATELY DOES NOT TAKE THIS BRANCH and falls through to the setting. Money is still
  // outstanding, so a payment action is still the right offer: one press charges the remainder and
  // collects, two presses offers "Mark £X.XX paid" first. `effectivePaid` is paid-or-refunded only.
  //
  // ⚠️ READ THROUGH THE EXISTING RESOLVER, NO ARITHMETIC. `effectivePaid` is declared once near the top
  // of this component from getOrderBalance(order, ledgerRows) — the same pure function the server rollup
  // and the PAID chip use — with the offline payment overlay already folded in. Nothing is re-derived
  // here and nothing may be: one derivation, one place.
  const completionBtn = () => {
    // 🔴 A HELD AUTHORISATION TAKES THE SAME BRANCH AS PAID: COMPLETE, DO NOT COLLECT. That is the whole
    // point of this change — an operator must never be offered `Mark paid` for money that is already
    // held, because pressing it books a SECOND payment at the hatch for an order the customer has
    // already authorised.
    // ⚠️ IT DOES NOT CLAIM THE ORDER IS PAID. The chip above says CARD HELD, the balance still reads
    // unpaid, and `Collected` is a KITCHEN action — it advances handover and books no money.
    // ⚠️ Capture happens at CONFIRMATION, not here, so by the time a held order reaches this button in
    // the ordinary flow it has usually already become paid. This branch covers the window where it has
    // not: a confirmed order whose capture failed or is still in flight.
    if (effectivePaid || heldAuthorisation) {
      return <Btn label="Collected" colour="dark" loading={isLoading('collected')} onClick={() => onAction('collected', order.order_key)} />
    }
    if (completionPresses === 'one') {
      // ── 🔴 A ONE-PRESS TRUCK THAT TAKES CASH CAN NOW SAY WHICH IT WAS. ────────────────────────
      // ── THE GAP THIS CLOSES ──────────────────────────────────────────────────────────────────
      // This branch RETURNED BEFORE the `takesCash` split fifteen lines below, so a truck that had
      // explicitly opted into distinguishing cash from its own card machine had no way to record it:
      // every one-press completion wrote `method: null`, and no setting the operator could change
      // would fix it. 165 of 166 in-person rows in the live data carry NULL.
      // ⚠️ THE SPLIT IS THE ONE TEN LINES BELOW, NOT A NEW SHAPE — same icons, same solid orange, same
      // one-tap-either-way rule, same per-button pending state from distinct action names. The only
      // difference is the label, because this button also completes the order.
      // 🔴 "CARD" MEANS THE TRUCK'S OWN CARD MACHINE, NEVER AN ONLINE PAYMENT. Both buttons book the
      // same `channel: 'in_person_other'` row — the money arrived at the hatch either way, outside the
      // platform — and `method` records only what the customer physically handed over. An online card
      // payment is a different channel entirely and never reaches this button.
      // ⚠️ GATED ON takesCash, so a truck that does not distinguish is NEVER asked: with the setting
      // off this returns the single button below, byte for byte as it always has.
      if (takesCash) {
        return (
          <>
            <Btn label="💷 Cash & collected" colour="money" loading={isLoading('collected_cash')}
              onClick={() => onAction('collected_cash', order.order_key)} />
            <Btn label="💳 Card & collected" colour="money" loading={isLoading('collected_card')}
              onClick={() => onAction('collected_card', order.order_key)} />
          </>
        )
      }
      return <Btn label="Mark paid & collected" colour="dark" loading={isLoading('collected')} onClick={() => onAction('collected', order.order_key)} />
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
  // because that is the number the operator has to ask for. Nothing when nothing has been paid — an
  // unpaid order is the norm and needs no decoration.
  //
  // ── 🔴 ORDER-KEYED, NOT SETTING-KEYED. DO NOT RE-GATE THIS ON `showPaidStep`. ────────────────────
  // WHETHER MONEY HAS BEEN RECORDED AGAINST THIS ORDER IS A FACT ABOUT THE ORDER, NOT A PREFERENCE OF
  // THE TRUCK. A truck setting can decide how payment is TAKEN — one press or two, at the hatch or when
  // the order is typed in. It cannot decide whether £10 has already changed hands, and it must not be
  // able to hide that it has. The chip already answers the right question below (`effectivePaid` /
  // `effectivePartPaid`, both derived from getOrderBalance over this order's own ledger rows), so an
  // unpaid order shows nothing whatever the truck is configured to do, and a paid one shows PAID.
  //
  // ⚠️ THE GATE THAT USED TO BE HERE — `!showPaidStep ||` — WAS REMOVED DELIBERATELY (10 August 2026).
  // Why it looked harmless: on a truck whose paid step is off, no path books a payment before collection
  // (Add Order cannot take payment, there is no `Mark paid` button, a collected order has left the
  // board), so the chip was empty by construction and the gate appeared to remove nothing.
  // 🔴 THAT REASONING HAS A HOLE, AND IT WAS FOUND IN LIVE DATA. It holds for a truck whose DEFAULT is
  // off; it does NOT hold for a truck whose default is ON and whose EVENT overrides it to off. Payments
  // booked while the paid step applied stay on the order, and flipping `show_paid_step_override` to false
  // afterwards HID THEM: six open, fully-paid orders on test-kitchen's 2026-07-30 event were carrying a
  // settled balance the operator could not see. A truck setting was concealing a money fact.
  // It also blocked the one configuration the completion setting will make reachable — paid step off with
  // a two-press completion — where `Mark paid` exists but its result would be invisible.
  // And it is what would hide a Stripe-paid order from a truck that takes payment at the hatch, the day
  // that writer lands (lib/payments/ledger.ts reserves the seat).
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
  // ── 🔴 THIS ALSO UN-GATES THE REMOVE-PAYMENT MODAL, AND THAT WAS ACCEPTED, NOT OVERLOOKED ───────
  // The chip IS the modal's only entry point (see `paidChip` below), so the two share one switch by
  // construction — there is no way to widen one without the other except by ADDING a condition, which
  // would produce a card that states a payment the operator cannot correct. Ruled on 10 August 2026:
  //   • A visible PAID state with no way to correct a mistaken one is WORSE than the alternative.
  //   • `undo_mark_paid` reverses a RECORDING, not a refund. No money moves. It deletes a row that says
  //     money was taken; it does not take money back.
  //   • There is a trail: reverseCollectionPayment writes its audit row BEFORE deleting the charge
  //     (logActionOrThrow — a failed audit ABORTS the delete), with the full row contents in
  //     before_state, so the deletion is reconstructable from the log alone.
  //   • This WIDENS an existing capability rather than introducing one. Every truck whose gate already
  //     resolved open — Gusto, village-spice, test-kitchen — has had exactly this since V9.4.
  //
  // ⚠️ `hidePayments` STAYS, and is now the only thing in this gate. It is a PER-DEVICE preference
  // ("this screen does not handle money"), which is a different kind of fact from a truck setting: it
  // describes where the operator is standing, not what is true of the order. A grill screen not showing
  // a money chip is not the product concealing a payment. Keeping it here also keeps the chip, its tap
  // target and the remove-payment modal on a single switch — there is still no second path.
  // 🔴 THE HELD CHIP SITS BETWEEN "paid" AND "owes money", BECAUSE THAT IS WHERE THE ORDER IS.
  // Tested AFTER effectivePaid — a captured order is paid and says PAID, and the resolver already
  // excludes captured intents, so the two can never both be true. Tested BEFORE part-paid, which is an
  // in-person state that a card-held order cannot be in.
  // ⚠️ INDIGO, NOT GREEN AND NOT AMBER. Green means money received; amber means money outstanding. This
  // is neither, and giving it either colour would be the whole defect again in a different form.
  // ⚠️ THE WORD "PAID" IS DELIBERATELY ABSENT. Nothing has been charged.
  // 🔴 THE REFUND CHIPS SIT BEFORE THE GREEN PAID CHIP, because both are `effectivePaid` and the more
  // specific fact wins. Slate, not green and not amber: green says money received, amber says money
  // outstanding, and a refund is neither. The partial one carries the AMOUNT GIVEN BACK, because
  // "part refunded" without a figure sends an operator to Stripe to find out how much.
  const paidChipStatic = hidePayments ? null
    : balance.status === 'refunded' ? <span title="Refunded in full. Nothing to collect." className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700 flex-shrink-0 whitespace-nowrap">REFUNDED</span>
    // 🔴 THE ONE ARM OF THIS CHAIN THAT CARRIES AN AMOUNT, AND THE ONLY ONE `hideAmounts` TOUCHES.
    // Hidden ENTIRELY in Cook rather than reworded to a bare "REFUNDED": that would make a part-refunded
    // order read identically to a fully refunded one, and the second still has money outstanding. A
    // refund is not actionable at a hatch, so nothing is lost by its absence and a new string invented
    // to avoid printing a number would be the wrong trade.
    // ⚠️ NULL HERE DOES NOT FALL THROUGH TO `PAID`. This is a ternary cascade: a part_refunded order
    // matches HERE and stops, so hiding the chip shows no chip, never a different one.
    : balance.status === 'part_refunded' ? (hideAmounts ? null : <span title="Charged in full, then partly refunded. Nothing to collect." className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700 flex-shrink-0 whitespace-nowrap">{money(balance.balanceMinor)} REFUNDED</span>)
    : effectivePaid ? <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 flex-shrink-0">PAID</span>
    : heldAuthorisation ? <span title="Card authorised — do not collect. Payment is taken when you confirm." className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 flex-shrink-0 whitespace-nowrap">CARD HELD</span>
    // 🔴 PART-PAID HAS LEFT THE HEADER ROW ENTIRELY — see `partPaidRow` below. It read
    // "£6.50 / £6.50 due", which parses as a fraction rather than as two amounts, and it was
    // `whitespace-nowrap` + `flex-shrink-0` at three to four times the width of PAID on the busiest row
    // of the card, so it overflowed. Returning null here is what frees that row; nothing else on it
    // moved, and PAID / CARD HELD / REFUNDED are untouched.
    : null

  // ✅ TAPPABLE IN BOTH CASES. An operator who mis-taps offline must be able to undo it exactly as
  // online. The queued undo is safe: the outbox coalesces only kind:'stock', so BOTH ops are sent, FIFO
  // (listOps sorts by seq), and an `undo_mark_paid` that finds no charge row returns reversal:'none' with
  // a 2xx — a no-op, not a failure. See docs/offline-coverage-report.md.
  // ⚠️ THE HELD CHIP IS NOT TAPPABLE, AND THAT IS DELIBERATE. The remove-payment modal reverses a
  // RECORDING; a held authorisation has no ledger row to remove, so the modal would offer to undo
  // something that does not exist and `undo_mark_paid` would find nothing. Releasing a hold is a
  // different action entirely and is not built here.
  const paidChip = paidChipStatic === null ? null : heldAuthorisation && !effectivePaid ? (
    <span className="flex-shrink-0">{paidChipStatic}</span>
  ) : (
    <button onClick={() => setConfirmRemovePayment(true)}
      title={hasReversibleInPersonPayment ? 'Tap to remove this payment' : 'Tap for how to refund this'}
      className="flex-shrink-0">
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
  // ── 🔴 A CARD PAYMENT CANNOT BE UNDONE HERE, AND THE MODAL NOW SAYS SO INSTEAD OF PRETENDING. ───
  // ── WHY IT STILL OPENS RATHER THAN GOING DEAD ──────────────────────────────────────────────────
  // Making the chip inert for a card-paid order was the other option and it was rejected: an operator
  // who taps a PAID chip is asking a question, and a control that does nothing answers it with silence.
  // They would tap it again, then look for the setting they think they are missing. The held chip is
  // inert because there is genuinely nothing to say beyond the chip's own word; here there is — the
  // money is real, it is on the customer's card, and getting it back is a different action.
  // 🔴 SO THERE IS NO DESTRUCTIVE BUTTON ON THIS BRANCH. `undo_mark_paid` is not offered, because it is
  // a guaranteed no-op that would return "Undone — payment removed" and change nothing.
  // ⚠️ IT NAMES THE REAL ROUTE, WHICH IS STRIPE, BECAUSE THE REFUND UI IS NOT BUILT. When it is, this is
  // the sentence that changes and the only one — the branch itself stays.
  // 🔴 THE MODAL IS NOW components/dashboard/PaymentActionsModal — SHARED WITH THE COMPLETED LIST.
  // The JSX that stood here moved out whole; every word of the "Remove payment?" branch and every word of
  // the "Paid by card" branch went with it, along with the condition that chooses between them. What is
  // NEW there is the third branch — the refund form — which renders only when the caller supplies
  // `onRefund`. The card supplies it when the dashboard passes one down, so a surface that has not wired
  // a refund gets exactly the two branches it had before.
  // ⚠️ The card still owns the STATE and the tap targets: `confirmRemovePayment` is unchanged, the effect
  // that clears it when the payment state moves is unchanged, and both triggers below are untouched.
  const removePaymentModal = (
    <PaymentActionsModal
      open={confirmRemovePayment}
      onClose={() => setConfirmRemovePayment(false)}
      orderId={String(order.id)}
      orderKey={order.order_key}
      paidMinor={balance.paidMinor}
      cardChargeMinor={cardChargeMinor}
      refundedMinor={refundedMinor}
      charges={chargeBreakdown}
      hasReversibleInPersonPayment={hasReversibleInPersonPayment}
      onUndoPayment={() => onAction('undo_mark_paid', order.order_key)}
      undoLoading={isLoading('undo_mark_paid')}
      onRefund={onRefund}
      offline={offline}
    />
  )

  // ── 🔴 THE PART-PAID LINE. ITS OWN ROW, ABOVE THE ITEMS, BELOW THE HEADER. ──────────────────────
  // ── WHY IT IS NOT A CHIP ────────────────────────────────────────────────────────────────────────
  // Every other payment state is one word — PAID, CARD HELD, REFUNDED — and fits beside the price.
  // Part-paid is TWO AMOUNTS and cannot be, so it stopped being a chip rather than being shrunk into
  // one. `w-full` with no `whitespace-nowrap` is the whole fix for the overflow: at a narrow viewport
  // it WRAPS instead of pushing the row wider, which is what an unshrinkable chip could never do.
  //
  // ⚠️ THE STRING SAYS WHICH NUMBER IS WHICH. "£6.50 / £6.50 due" reads as a fraction — six-fifty out
  // of six-fifty — and on an order edited from £6.50 to £13.00 the two happen to be equal, which is the
  // worst case for a reader. "£6.50 paid, £6.50 due" cannot be misread.
  //
  // ⚠️ NOT IN COOK MODE, NOT WHEN `hidePayments`, AND NOT WHEN `hideAmounts`. Cook's header carries no
  // payment chip today; adding a money line would put money on the one screen deliberately without it.
  // It is absent there rather than overflowing there.
  // 🔴 `hideAmounts` IS THE THIRD DISJUNCT AND IT IS NOT REDUNDANT: a HANDOVER device (viewMode
  // 'window') whose display is set to Cook has neither of the first two true, and this row is a pure
  // monetary amount — "£6.50 paid, £6.50 due" — so it must go with the rest of the money.
  // ⚠️ The old clause here cited `showPrices` as the reason cook shows no prices. That variable had
  // ZERO consumers and has been deleted; the cook item renderer below is what omits prices.
  //
  // ⚠️ IT KEEPS THE CHIP'S TAP TARGET, so the correction path is unchanged: the same modal, the same
  // card-vs-cash branch. Moving the information must not remove the way to fix it.
  const partPaidRow = (hidePayments || cardStyle === 'cook' || hideAmounts || !effectivePartPaid) ? null : (
    <button
      onClick={() => setConfirmRemovePayment(true)}
      title={hasReversibleInPersonPayment ? 'Tap to remove this payment' : 'Tap for how to refund this'}
      className="w-full mb-2 rounded-md bg-amber-100 text-amber-800 px-2 py-1 text-xs font-black text-center">
      {money(balance.paidMinor)} paid, {money(balance.balanceMinor)} due
    </button>
  )

  // ── THE BUZZER CHIP ─────────────────────────────────────────────────────────────────────────────
  // 🔴 IT LIVES IN HEADER ROW 1, IN ALL THREE VIEW MODES, AND THAT PLACEMENT IS LOAD-BEARING.
  // Row 1 is the IDENTITY cluster (#order, and in solo the collection time). A buzzer number IS
  // identity — "who is this food for" — so it belongs beside the order number, not in row 2 with the
  // metadata. Row 2 is also where the crowding fixes live: in solo the customer NAME is the only
  // flex-1 element and absorbs all pressure (the "Dom"→"D…" fix, see the note at the solo header),
  // and in window mode row 2 already carries name + time + late pill at a 240px column.
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

  /** The disabled placeholder shown while the cooking gate holds an order — same label logic, no action.
   *  ⚠️ IT DUPLICATES completionBtn's BRANCH AND WILL DRIFT IF ONLY ONE IS CHANGED. Both moved from
   *  `showPaidStep` to `completionPresses` together on 10 August 2026; keep them in step. */
  const completionBtnDisabled = () => (
    <button disabled className="flex-1 bg-slate-200 text-slate-400 font-bold py-3 rounded-xl text-sm cursor-not-allowed">
      {/* 🔴 SAME BRANCH ORDER AS completionBtn: effectivePaid FIRST, the setting second. A paid order
          reads "Collected" here too, whatever the truck is configured to do. Keep these in step. */}
      {/* 🔴 heldAuthorisation FOLDED IN ALONGSIDE effectivePaid, exactly as in completionBtn. These two
          branches are documented as drifting if only one is changed — they are changed together. */}
      {effectivePaid || heldAuthorisation ? 'Collected' : completionPresses === 'one' ? 'Mark paid & collected' : effectivePartPaid ? `Mark ${money(balance.balanceMinor)} paid` : 'Mark paid'}
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

  // ── THE STATUS BADGE — COMPUTED ONCE, PLACED THREE TIMES ────────────────────────────────────────
  // 🔴 THIS IS `paidChipStatic`'s PATTERN, AND REPRODUCING IT IS THE POINT OF THE CHANGE. The paid chip
  // survived into both KDS headers because it is computed once here and PLACED by each header that
  // wants it. The status badge did not, because it was written INLINE inside the `viewMode === 'solo'`
  // branch — so the KDS, which never renders 'solo', silently had no badge at all, in every value it
  // can take: Modified, Cooking, Ready, Collected, Rejected, Cancelled. That was an absence, not a
  // gate; no comment anywhere recorded a decision to omit it.
  //
  // ⚠️ IT SITS HERE RATHER THAN BESIDE `paidChipStatic` FOR ONE REASON: it needs `s`, and `s` is
  // declared on the line above. Moving `s` up to reach the chip would be a change nobody asked for.
  // Same SHAPE, same "computed outside every branch" property — one expression, three placements.
  //
  // ⚠️ NOT MONEY, SO `hideAmounts` DOES NOT GATE IT. A status is not an amount. It renders in Cook
  // exactly as `PAID` and `CARD HELD` do, and for the same reason: it tells the operator what the order
  // is doing. The only "not in cook" rule in this file is about money.
  const statusBadgeStatic = !['confirmed', 'pending'].includes(order.status) ? (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${s.bg} ${s.text}`}>{s.label}</span>
  ) : null

  // ── 🔴 THE KDS SUPPRESSES ONE VALUE, AND `Cooking` IS NOT A REDUNDANT LABEL — READ BEFORE "FIXING" ──
  // The two elements are not two labels for one thing. `🔥 Cooking…` sits in the ACTION ROW, where it
  // stands in for a button the operator cannot press yet; the badge is a HEADER LABEL. On the DASHBOARD
  // nothing else states the cooking state, so the badge carries it and still does. On the KDS the action
  // row already says it — and in the `kds_mode`-true window case it says it in the SAME PILL CLASSES
  // (`text-xs font-bold px-2 rounded-full bg-amber-100 text-amber-700`, differing only in py-1 vs
  // py-0.5), a card's height apart, with no collapse between them. Two identical amber pills reading
  // the same word is what this suppression exists to prevent.
  // 🔴 IT IS A DELIBERATE PER-SURFACE DIVERGENCE. This comment is here so the next reader does not
  // "restore" the missing value and re-create the duplicate.
  // ⚠️ LATENT, NOT OBSERVABLE, TODAY: `kds_mode` is false on all thirteen trucks and gates the only
  // Start cooking button, so nothing can currently reach status 'cooking'. That is why this costs
  // nothing now and why it must be written down rather than discovered later.
  const statusBadgeKds = order.status === 'cooking' ? null : statusBadgeStatic

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
      // ── 🔴 THIS SCREEN MARKS READY *AND* HANDS OVER — the KDS's "Marks ready" + "Takes payment" ────
      // The third configuration, and the only NEW one: reachable only by deliberately turning READY on
      // while HANDOVER is also on. It renders the sequence the DASHBOARD's solo mode has always
      // rendered — Ready on confirmed/modified, then the completion control once the order is ready.
      //
      // 🔴 INVARIANT A — THE WAIT IS DERIVED, AND THIS BRANCH IS WHERE IT IS DERIVED AWAY. Returning
      // here for confirmed/modified/cooking means the `kdsMode` "⏳ Waiting" + disabled treatment below
      // is UNREACHABLE whenever this screen marks ready itself. A screen never waits for a ready it
      // produces. There is no stored value for the wait and there must not be one.
      //
      // ⚠️ 'cooking' IS LISTED so a truck whose cooking gate is on can still advance an order this
      // screen (or a cook screen) put into it — without it, such an order would fall past the window
      // block into the solo block, which has no 'cooking' case, and reach `return null`.
      // ⚠️ NO TRUCK EMOJI, unlike solo's Ready. The KDS has never carried it on this control and the
      // cook branch above does not either; this matches the cook branch, not solo.
      // ⚠️ DEFAULTS FALSE, so every existing caller — the dashboard (solo) included — is byte-identical.
      // The dashboard never reaches this branch at all: it renders viewMode 'solo'.
      if (readyStepOn) {
        if (['confirmed', 'modified'].includes(order.status)) {
          return <Btn label="Ready" colour="green" loading={isLoading('ready')} onClick={() => onAction('ready', order.order_key)} />
        }
        if (order.status === 'cooking') {
          return (
            <>
              <span className="flex-1 text-amber-700 font-bold text-sm flex items-center">🔥 Cooking…</span>
              <Btn label="Ready" colour="green" loading={isLoading('ready')} onClick={() => onAction('ready', order.order_key)} />
            </>
          )
        }
        if (order.status === 'ready') {
          return completionBtn()
        }
      }
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

  // ── 🔴 THE CUSTOMER NAME IS THE CONTACT CONTROL ────────────────────────────────────────────────
  // There used to be a separate "Contact" chip beside the name. At the KDS's 240px column and on a
  // phone it competed with the name for the same row and won — the name truncated to "D…" so a bordered
  // box could say a word the operator already knew. Space there is tight and the box was the thing to
  // remove, not the name.
  // ✉ THE AFFORDANCE IS THIS FILE'S OWN, NOT A NEW ONE. InlinePriceEditor (top of this file) is the
  // established pattern for tappable text on this card: a <button> wrapping the value, a small trailing
  // glyph, and a `title` saying what a tap does. This copies that shape.
  // 🔴 THE UNDERLINE IS GONE, AND THE GLYPH NOW CARRIES THE AFFORDANCE ON ITS OWN. An underline is this
  // app's NAVIGATION idiom — `text-orange-600 hover:underline` on the access-denied link, `underline` on
  // "Edit categories" — so underlining a name promised a page that does not exist, and read as a
  // hyperlink dropped into a card of chips and pills.
  // 🔴 AND THE GLYPH IS PERMANENTLY COLOURED, NOT HOVER-REVEALED. That is the part that keeps this
  // honest on a touch screen. InlinePriceEditor's ✏ sits at `text-slate-300` until a pointer hovers it,
  // which on the tablets this card is used on means it is never seen at all — the flaw the underline was
  // added to paper over. Fixing the glyph is the better answer than keeping a second signal: `✉` renders
  // at the card's own interactive orange from the first paint, beside a name and nowhere else, with a
  // `title` behind it. Hover only DARKENS it, so pointer users get the usual feedback and touch users
  // lose nothing.
  // ⚠️ THE SIZE AND SPACING ARE UNCHANGED — `text-[10px]`, `gap-1`, `flex-shrink-0`. Colour is the only
  // thing that moved, so no element on this card changes width or position in any view mode.
  // ⚠️ NO CONTACT DETAILS ⇒ THE PLAIN SPAN, BYTE-IDENTICAL TO BEFORE. A walk-up with no email and no
  // phone gets no glyph and nothing to tap — never an affordance that leads nowhere.
  const nameEl = (className: string) => (
    (order.customer_email || order.customer_phone) ? (
      <button
        onClick={(e) => { e.stopPropagation(); setShowContact(v => !v) }}
        title="Tap for contact details"
        className={`group inline-flex items-baseline gap-1 text-left ${className}`}>
        <span className="truncate">{order.customer_name}</span>
        <span className="text-orange-500 group-hover:text-orange-600 transition-colors text-[10px] flex-shrink-0" aria-hidden>✉</span>
      </button>
    ) : (
      <span className={`truncate ${className}`}>{order.customer_name}</span>
    )
  )

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
      {cardStyle === 'cook' ? (
        /* ── COOK: non-interactive two-line header, no collapse. ───────────────────────────────────
           🔴 COOK AND FULL CARRY IDENTICAL TYPE. `cardStyle` decides WHETHER an element renders here —
           no amount does — and it decides which item renderer runs below. It decides NO size, NO weight
           and NO padding, in this block or anywhere else on the card. Every class below is Full's own
           value, taken from the window arm a few lines down; the two are compared row by row in
           docs/kds-type-equalise-report.md.
           ⚠️ THIS BLOCK HAS BEEN WRONG IN BOTH DIRECTIONS. It carried `text-lg` against Full's
           `text-3xl` (Cook smaller), then `text-4xl` against it (Cook larger). Neither was designed;
           both were a size branching on a PRESENTATION flag. If a size here ever differs from the
           window arm again, that is the defect — do not "rebalance" it, match it. */
        <div className={`w-full px-3 py-2 ${headerCls}`}>
          {/* 🔴 `font-medium text-sm` SITS ON THE ROW, NOT ON THE CHILD — the same place Full's window
              arm puts it. The time readout below used to SET `text-xs` while Full's INHERITED `text-sm`,
              and that inherit-vs-set asymmetry is what let the two drift apart unnoticed. Both now
              INHERIT from their row. Every other child of this row states its own size (`text-3xl`
              order number, `text-[10px]` buzzer chip, `text-xs` status badge, `text-[10px]` late pill),
              so none of them can see this declaration. */}
          <div className="flex items-baseline justify-between gap-1 font-medium text-sm">
            {/* Full's window arm renders `text-3xl font-bold` for the order number. So does this. */}
            <span className="text-3xl font-bold text-slate-900 truncate">#{order.id}</span>
            {/* Buzzer chip — row 1, beside the order number. See the buzzerChip note. */}
            {buzzerChip}
            {/* The status badge — the same row that already carries the buzzer chip and the late pill,
                which is this header's small-indicator row. It sits before the ml-auto time group, so
                that group stays hard right and nothing below row 1 moves. `Cooking` is suppressed here
                — see statusBadgeKds. ⚠️ A STATUS IS NOT AN AMOUNT: this renders in Cook, where no
                monetary element does. */}
            {statusBadgeKds}
            {/* Time — INHERITS `font-medium text-sm` from the row, exactly as Full's does. */}
            <span className="text-slate-600 flex-shrink-0 inline-flex items-center gap-1 ml-auto">
              {timeLabel}
              {offsetLabel && (isLate
                ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-600 text-white">{offsetLabel}</span>
                : <>{` · ${offsetLabel}`}</>)}
            </span>
          </div>
          {/* Row 2 — `font-medium text-sm` on the row, the same as Full's row 2. The customer name
              INHERITS it (it used to set `text-xs`, a step BELOW Full); the ✓ states `font-black
              text-xs`, which is character-for-character what Full's ✓ states. */}
          <div className="flex items-center gap-1 font-medium text-sm mt-0.5">
            {nameEl('text-slate-600 min-w-0')}
            {allStruck && <span className="text-green-700 font-black text-xs ml-1">✓</span>}
          </div>
        </div>
      ) : (
        /* Window / solo: header (non-collapsing — content always shown). Window uses Cook's compact
           px-3 py-2 for KDS grid density; Solo keeps its roomier px-4 py-3 (gate is 'window'-only). */
        <div className={`w-full text-left ${cardStyle === 'window' ? 'px-3 py-2' : 'px-4 py-3'} ${headerCls}`}>
          {cardStyle === 'solo' ? (
            /* Solo (dashboard + mobile): two-row header. Row 1 is the identity+WHEN cluster — #order
               and the collection TIME together and prominent (the time is key info, so it sits beside
               the big order#, not demoted), then the status badge; offset/✓ go right. Row 2 gives the
               customer NAME the flex space (flex-1 min-w-0) so it shows in full and only ellipsis-
               truncates as a last resort — the PRICE is flex-shrink-0 so it keeps its size
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
                {nameEl('text-sm opacity-70 min-w-0 flex-1')}
                {/* Status BADGE (moved here from row 1) — sits between channel/name and price. Same
                    condition as before: shown for modified/cooking/ready (incl. the blue "Ready"),
                    suppressed for the baseline confirmed/pending the section heading already says. This
                    is the status BADGE, NOT the Ready ACTION button (that stays in the bottom row).
                    ⚠️ THE MARKUP MOVED, IT WAS NOT REWRITTEN. `statusBadgeStatic` holds the identical
                    span under the identical condition, so this renders the same element or nothing —
                    `false` and `null` are both skipped by React. Solo is unchanged. */}
                {statusBadgeStatic}
                {/* ⚠️ SOLO IS THE DASHBOARD AND `hideAmounts` DEFAULTS FALSE THERE, so this guard is a
                    constant-false test and this span renders exactly as it always has. The gate is here
                    only because the same header serves any future caller that sets the prop. */}
                {!hideAmounts && <span className="font-bold text-sm flex-shrink-0">£{Number(order.total).toFixed(2)}</span>}
                {paidChip}
              </div>
            </>
          ) : (
            /* Window (KDS): TWO-ROW header (was a single cramped row that truncated name + clipped
               price at the dense 240px column). Row 1 = the glance numbers (#order / £total); Row 2 =
               metadata (name + time + lateness). */
            <>
              {/* Row 1 — order # (left) + total (right) */}
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-1.5 min-w-0">
                  {/* 🔴 `text-slate-900` IS STATED, NOT INHERITED — and it is COOK'S value, adopted here
                      on purpose. Without it this span inherits `headerCls`, which tints the number with
                      the urgency state (text-green-900 / text-amber-900 / text-red-900 / text-slate-900,
                      helpers.ts:149). Cook has always overridden that to slate-900, so the SAME ticket
                      read the same number in two colours depending on which display the device was set
                      to. It is now slate-900 on both.
                      ⚠️ THE URGENCY SIGNAL IS NOT LOST — it was never carried by this glyph alone. The
                      header keeps its coloured ground and its 4px coloured top border, and the name and
                      time on row 2 still inherit the tint. Only the ticket number goes neutral.
                      ⚠️ SOLO IS NOT THIS BRANCH. The dashboard's `text-2xl` order number is in the solo
                      arm above and still inherits headerCls exactly as it always has. */}
                  <span className="text-3xl font-bold text-slate-900">#{order.id}</span>
                  {/* Buzzer chip — left cluster with the order number. At the 240px KDS column this is
                      the only row with slack; row 2 already carries name + time + late pill.
                      See the buzzerChip note. */}
                  {buzzerChip}
                </div>
                <div className="flex items-baseline gap-1.5 flex-shrink-0">
                  {/* The status badge — FIRST in this cluster, mirroring solo, where it precedes the
                      price and the paid chip. This is the row that already carries the small
                      indicators (paidChip, ✓) and is already flex-shrink-0, which the badge is sized
                      for. `Cooking` is suppressed here — see statusBadgeKds. */}
                  {statusBadgeKds}
                  {/* 🔴 THIS IS THE ONE THAT MATTERS. With `viewMode` back on `boardMode`, a HANDOVER
                      device renders this header even when its display is set to Cook — so without this
                      guard the order total would print on a Cook card, which is the first thing Cook
                      exists to remove. */}
                  {!hideAmounts && <span className="font-bold text-base">£{Number(order.total).toFixed(2)}</span>}
                  {paidChip}
                  {allStruck && <span className="font-black text-xs opacity-70">✓</span>}
                </div>
              </div>
              {/* Row 2 — customer name + time + lateness */}
              <div className="flex items-center gap-2 font-medium text-sm mt-0.5">
                {nameEl('opacity-80 min-w-0')}
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

          {/* 🔴 DIRECTLY ABOVE THE ITEMS AND BELOW THE HEADER. It sits INSIDE this block's existing
              `pt-2`, so nothing above it moves — the header row, the time label, the order number and
              the buzzer chip are all untouched. Null in every state but part-paid. */}
          {partPaidRow}

          {/* ── Items: cook view vs window/solo view ─────────────────────────────────────────────────
              🔴 THIS TEST DECIDES THE RENDERING, NOT THE MONEY. It used to decide both at once — the cook
              arm hid every price AND changed what an item IS — which made it impossible to hide money
              without also changing the layout. The two were separated by hand:
                • WHICH ARM RUNS follows `viewMode` (the two switches). The kitchen rendering —
                  `itemGroups`, deals DISSOLVED into category batches, `line.note`, the plain <p> — is the
                  right rendering for a kitchen screen and is kept exactly as it was.
                • WHETHER PRICES PRINT inside whichever arm runs follows `hideAmounts` (the Full/Cook
                  control). The cook arm has never printed a price, so the gate appears only in the arm
                  below, at its four price sites.
              ⚠️ Both arms remain inert for ticking: ITEM_TICK_ENABLED is false, so the <button> in the
              window/solo arm has an undefined onClick and neither arm is an action. That is unchanged. */}
          {cardStyle === 'cook' ? (
            <div className="mb-2">
              {itemGroups.map(({ cat, lines }, gi) => (
                <div key={cat}>
                  {/* Category heading — Full's own `text-xs font-bold … uppercase tracking-widest`,
                      character-identical to the window/solo arm's heading below. */}
                  <div className={`flex items-center gap-2 mb-1 ${gi > 0 ? 'mt-3' : ''}`}>
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-widest">
                      {cat === '__other__' ? 'Other' : cat}
                    </span>
                    <div className="flex-1 h-px bg-slate-200" />
                  </div>
                  {lines.map((line, j) => (
                    <div key={j} className="mb-0.5">
                      {/* 🔴 FULL'S ITEM ROW IS `text-sm … py-1.5` ON THE ROW, with `font-normal` on the
                          name run. This <p> is that row: same size, same weight, same vertical padding.
                          It is a <p> and not a <button> because Full's row is a tick target carrying a
                          price column and this one is neither — that is the ITEM RENDERER differing,
                          which is deliberate and stays. The TYPE does not differ. */}
                      <p className="text-sm font-normal text-slate-900 py-1.5">{line.quantity}× {line.name}</p>
                      {(line.modifiers?.length || line.note) && (
                        /* `pl-4` is Full's indent for this block (it read `pl-3` here). */
                        <div className="pl-4">
                          {/* Modifiers and notes — Full's `text-xs text-slate-500`, and the note keeps
                              its `italic`, which is a style and not a size. */}
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
                    {/* 🔴 THE COLUMN GOES WITH THE AMOUNT — CORRECTED. It was first written to stay and
                        render empty, on the reasoning that the `w-16` span is LAYOUT and removing it
                        would re-flow the list. Re-flowing the list is exactly what was wanted: with the
                        column reserved, a name kept its narrower width and wrapped to two lines beside
                        64px of nothing. The name span is `flex-1`, so removing this sibling hands it the
                        w-16 plus the `gap-2` and it reflows into the space. Nothing else in the row is
                        sized against this column — see the report.
                        ⚠️ THE FALSE ARM IS THE ORIGINAL SPAN, CHILD FOR CHILD, so solo is untouched. */}
                    {!hideAmounts && (
                      <span className="text-right tabular-nums w-16 flex-shrink-0 text-sm text-slate-900">
                        {deal.price != null ? `£${Number(deal.price).toFixed(2)}` : ''}
                      </span>
                    )}
                  </div>
                  {Object.entries(deal.slots).filter(([, v]) => v).map(([slotCat, itemName]) => {
                    const mods = (deal.slotModifiers ?? {})[slotCat] ?? []
                    const note = (deal.slotNotes ?? {})[slotCat]
                    return (
                      <div key={slotCat} className="pl-4 mt-0.5">
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="flex-1 font-normal text-slate-900">1× {itemName}</span>
                          {/* ⚠️ THIS SPAN IS THE PRICE COLUMN, ALREADY EMPTY — a deal slot never carries
                              a price and this reserves the width so its name lines up with the priced
                              rows above. With every price gone there is nothing left to line up with, so
                              it goes too; leaving it would reserve the column this task exists to
                              reclaim. */}
                          {!hideAmounts && <span className="w-16 flex-shrink-0" />}
                        </div>
                        {(mods.length > 0 || note) && (
                          <div className="pl-3 flex flex-col gap-y-0.5">
                            {mods.map(m => (
                              <div key={m.name} className="flex items-baseline justify-between gap-2">
                                <span className="flex-1 text-xs text-slate-500">+ {m.name}</span>
                                {!hideAmounts && m.price > 0 && <span className="text-right tabular-nums w-16 flex-shrink-0 text-sm text-slate-700">+£{m.price.toFixed(2)}</span>}
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
                      /* ⚠️ THE TYPE SIZE BELOW WAS
                         `cardStyle === 'solo' || cardStyle === 'window' ? 'text-sm' : 'text-base'`.
                         The `text-base` arm was DEAD — it is the cook arm of a ternary inside the renderer
                         COOK NEVER RUNS, since Cook takes the itemGroups block above. Both live values
                         were `text-sm`, so the literal is character-identical for solo and for Full and
                         the misleading branch is gone. */
                      <div key={j}>
                        <button
                          onClick={ITEM_TICK_ENABLED ? () => itemIndex >= 0 && tapItem(itemIndex, line.quantity) : undefined}
                          className={`w-full flex justify-between items-baseline gap-2 text-sm rounded py-1.5 text-left ${
                            ITEM_TICK_ENABLED
                              ? `transition-all active:scale-[0.99] select-none ${allDone ? 'opacity-40' : partDone ? 'bg-orange-50' : 'hover:bg-orange-50'}`
                              : 'cursor-default'
                          }`}>
                          <span className={`flex-1 font-normal transition-all ${allDone ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                            {line.quantity}× {line.name}
                            {partDone && <span className="text-orange-500 text-xs font-black ml-1.5">({struck}/{line.quantity})</span>}
                          </span>
                          {/* ⚠️ THE `✓` ARM IS NOT MONEY AND IS UNTOUCHED — it is the all-struck mark,
                              which the brief lists as UNCHANGED. It keeps its own w-16 column, because a
                              tick is not a price and is not what Cook removes.
                              🔴 THE HIDDEN ARM IS NOW `null`, NOT AN EMPTY SPAN. This is the row the
                              defect was observed on: "1× Chicken wings Thai style" wrapped to two lines
                              with 64px of nothing beside it. The name span is `flex-1`; deleting this
                              sibling gives it the w-16 and the `gap-2` back, so a name that fits renders
                              on one line and the card gets shorter. `justify-between` with one flex-1
                              child is a no-op, so no other child moves.
                              ⚠️ THE PRICE ARM IS BYTE-IDENTICAL, which is what keeps solo unchanged. */}
                          {allDone
                            ? <span className="text-right tabular-nums w-16 flex-shrink-0 text-xs text-green-500 font-bold">✓</span>
                            : hideAmounts
                              ? null
                              : <span className="text-right tabular-nums w-16 flex-shrink-0 text-sm text-slate-900">£{(line.unit_price * line.quantity).toFixed(2)}</span>
                          }
                        </button>
                        {(line.modifiers?.length || line.specialInstructions) && (
                          <div className="pl-4 -mt-0.5 mb-0.5 flex flex-col gap-y-0.5">
                            {line.modifiers?.map(m => (
                              <div key={m.name} className="flex items-baseline justify-between gap-2">
                                <span className="flex-1 text-xs text-slate-500">+ {m.name}</span>
                                {!hideAmounts && m.price > 0 && <span className="text-right tabular-nums w-16 flex-shrink-0 text-sm text-slate-700">+£{m.price.toFixed(2)}</span>}
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
            <div className={`bg-slate-50 border border-slate-200 text-slate-700 px-3 py-2 mx-3 rounded-md flex items-start gap-2 text-sm ${cardStyle === 'solo' ? 'mb-2' : 'mb-3'}`}>
              <span className="flex-shrink-0 mt-0.5">📝</span>
              <span>{order.notes}</span>
            </div>
          )}

          {/* ── 🔴 THE QUICK TIME-ADJUST ROW (+5m/+10m/+20m) WAS REMOVED HERE, 16 August 2026 ────────
              It rendered on `order.status === 'pending' && order.slot && viewMode !== 'cook'` and each
              button fired `onAction('adjust_slot_+N')`, which is NOT a display action: it writes
              `status: 'confirmed'` unconditionally, calls `moveSlotBooking`, and calls
              `captureOnConfirmation(trigger: 'time_adjust')` — capture site 3 of 4, and the ONLY site
              that ever fires on a 'pending' order.
              🔴 IT WAS DELIBERATELY KEPT ONCE BEFORE, and the thing that changed is not this file.
              The reason for keeping it was that removing it would route every time change through EDIT,
              whose capture arrives via the stranded-authorisation backstop — and that backstop skipped
              'modified' orders, which is what Edit writes. All four of those omissions are now closed
              (the sweep's allow-list, printWatcher's DEFAULT_ELIGIBLE, the customer cancel path and the
              due-alert scan all name 'modified'), so Edit's capture is now collected rather than
              stranded. Re-verified from those four files before this row was deleted, not from a report.
              ⚠️ THE ACCEPTED COST, STATED RATHER THAN DISCOVERED LATER: Edit's capture is deferred up
              to ~25 minutes (a 10-minute grace plus a 15-minute cron) and arrives through a mechanism
              whose own comments call a recovery "a defect report, not a success story". Removing this
              row makes that path ROUTINE rather than exceptional, which degrades the alarm value of a
              sweep hit. That is a known trade, not an oversight.
              ⚠️ NOTHING ELSE WAS DELETED. `adjust_slot_+N` still exists server-side, and both
              `moveSlotBooking` and `captureOnConfirmation` keep every other call site. */}

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
