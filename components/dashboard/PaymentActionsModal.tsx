'use client'

// components/dashboard/PaymentActionsModal.tsx
// 🔴 THE ONE MODAL BEHIND EVERY PAID CONTROL, ON BOTH ORDER LISTS.
//
// ── WHY IT LEFT OrderCard ───────────────────────────────────────────────────────────────────────────
// It was a private block inside the card, so it existed only for orders the ACTIVE list renders. The
// completed list is inline JSX — no card, no chip, no payment control — and a collected order is exactly
// the one an operator comes back to when money needs correcting. Rather than write a second modal for
// that row, the one that already exists moved out. Nothing else moved with it: the extraction is this
// file plus an import at two call sites.
//
// ── THE THREE THINGS IT CAN SAY, AND THE ONE INPUT THAT DECIDES ────────────────────────────────────
//   in-person payment on the order  -> "Remove payment?" — reverses a RECORDING, no money moves
//   card payment                    -> the refund form — money moves, at Stripe, once
//   neither                         -> the explanation. A control that does nothing answers with silence
// `hasReversibleInPersonPayment` is a ROW test, not an order test, and is computed by the caller from the
// same ledger rows the server's own lookup reads.
//
// ⚠️ EVERY AMOUNT HERE IS A SUGGESTION. The refundable figure shown is derived from the ledger for the
// operator's benefit; lib/payments/refund recomputes it from Stripe and refuses anything that does not
// fit. Nothing this component sends decides how much money moves.
import { useState } from 'react'
import { createPortal } from 'react-dom'

/** Our seven, mirrored from lib/payments/refund — the labels an operator reads are only here. */
const REASONS: { value: string; label: string }[] = [
  { value: 'item_unavailable',     label: 'Item unavailable' },
  { value: 'not_collected',        label: 'Order not collected' },
  { value: 'wrong_or_missing_item',label: 'Wrong or missing item' },
  { value: 'quality_issue',        label: 'Quality issue' },
  { value: 'duplicate_payment',    label: 'Duplicate payment' },
  { value: 'customer_cancelled',   label: 'Customer cancelled' },
  { value: 'other',                label: 'Other' },
]

export type RefundSubmit = (args: {
  orderKey: string
  amountMinor: number
  reason: string
  note: string
}) => Promise<{ ok: boolean; message: string }>

export function PaymentActionsModal({
  open, onClose, orderId, orderKey, paidMinor, cardChargeMinor, refundedMinor, charges,
  hasReversibleInPersonPayment, onUndoPayment, undoLoading, onRefund, offline = false,
}: {
  open: boolean
  onClose: () => void
  orderId: string
  orderKey: string
  /** getOrderBalance's paidMinor — what the "Remove payment?" copy has always quoted. */
  paidMinor: number
  /** Sum of ONLINE charge rows. Zero on a cash-only order, which is what selects the branch. */
  cardChargeMinor: number
  /** Sum of refund rows we know about. ⚠️ Blind to a PENDING refund by design — see lib/payments/online. */
  refundedMinor: number
  /** 🔴 HOW THE MONEY ACTUALLY ARRIVED, one entry per CHARGE row, in the ledger's own vocabulary.
   *  The modal describes what happened rather than picking one; a mixed order has more than one. */
  charges?: { channel: string; method: string | null; amountMinor: number }[]
  hasReversibleInPersonPayment: boolean
  onUndoPayment: () => void
  undoLoading?: boolean
  /** Absent ⇒ no refund form. The caller has not wired one, and the modal reads as it always did. */
  onRefund?: RefundSubmit
  /** 🔴 PAYMENT MODIFICATION REQUIRES CONNECTIVITY (14 August 2026).
   *  True ⇒ this device cannot reach the server, so every branch below that CHANGES money is replaced by
   *  an explanation. DEFAULT FALSE, so a caller that does not pass it is byte-identical to before — and
   *  the KDS never renders this modal at all.
   *  🔴 WHY MODIFICATION IS NEVER QUEUED. Every other offline op fails SAFE: a queued order that does
   *  not land is visible as unsynced. A queued REFUND fails toward "money shown as returned that has not
   *  been" — the customer walks away believing they have been refunded, and nobody investigates an order
   *  that looks settled. Manual section 37 forbids that direction. There is no refund op kind in the
   *  outbox and none is being added.
   *  ⚠️ THIS RESTRICTS MODIFICATION ONLY. Recording a NEW payment offline is untouched — that is the
   *  card's own Mark paid / collected buttons, which queue through the gate exactly as they did. */
  offline?: boolean
}) {
  const [mode, setMode] = useState<'full' | 'partial'>('full')
  const [amountInput, setAmountInput] = useState('')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  if (!open) return null

  const money = (minor: number) => `£${(minor / 100).toFixed(2)}`
  // What the operator is shown as refundable. The server re-derives this from Stripe.
  const refundableMinor = Math.max(0, cardChargeMinor - refundedMinor)

  // ── 🔴 HOW THIS CUSTOMER PAID, SAID PLAINLY, AND NO FURTHER THAN THE ROW CAN CARRY. ───────────
  // ── WHAT THE DATA ACTUALLY SUPPORTS (measured, 13 August 2026) ────────────────────────────────
  // 183 ledger rows: 16 `online`/method=card · 166 `in_person_other`, of which 165 carry method=NULL
  // and ONE carries 'cash'. So an ONLINE payment is unambiguous, and an in-person one usually is not:
  // cash and the truck's own card machine are the same row. The mechanism to record it exists — the
  // card's Cash/Card buttons and the walk-up panel's both send a method — but it is gated on the
  // truck's `takesCash` setting and 165 rows show the single "Mark paid" button was used instead.
  // 🔴 SO THE NULL CASE SAYS "in person" AND SAYS WHY IT CANNOT SAY MORE. Inventing "cash" for a row
  // that does not know would be worse than a vaguer sentence an operator can trust.
  // ⚠️ A MIXED ORDER GETS BOTH LINES WITH THEIR AMOUNTS — 3 orders in the live data have charges on
  // both channels — because "picking one" would describe half of what happened.
  const chargeRows = (charges ?? []).filter(c => c.amountMinor > 0)
  const howPaid: { label: string; hint?: string }[] = (() => {
    if (!chargeRows.length) return []
    const online = chargeRows.filter(c => c.channel === 'online')
    const inPerson = chargeRows.filter(c => c.channel !== 'online')
    const sum = (rows: typeof chargeRows) => rows.reduce((t, c) => t + c.amountMinor, 0)
    const mixed = online.length > 0 && inPerson.length > 0
    const out: { label: string; hint?: string }[] = []
    if (online.length) {
      out.push({ label: `Paid online by card${mixed ? ` — ${money(sum(online))}` : ''}` })
    }
    if (inPerson.length) {
      const methods = new Set(inPerson.map(c => c.method))
      const amount = mixed ? ` — ${money(sum(inPerson))}` : ''
      if (methods.size === 1 && methods.has('cash')) out.push({ label: `Paid in cash${amount}` })
      else if (methods.size === 1 && methods.has('card')) out.push({ label: `Paid on your card machine${amount}` })
      else out.push({ label: `Paid in person${amount}`, hint: 'Cash or your card machine — not recorded' })
    }
    return out
  })()

  // ⚠️ IT SITS ABOVE EVERY BRANCH, INCLUDING THE REFUND FORM, so it cannot contradict the refund
  // figures below it: this says HOW the money arrived, those say how much is left to send back.
  const howPaidBlock = howPaid.length === 0 ? null : (
    <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
      {howPaid.map(h => (
        <p key={h.label} className="text-sm font-medium text-slate-700">
          {h.label}
          {h.hint && <span className="block text-xs font-normal text-slate-400">{h.hint}</span>}
        </p>
      ))}
    </div>
  )
  const canRefund = !!onRefund && cardChargeMinor > 0 && refundableMinor > 0
  const partialMinor = Math.round((parseFloat(amountInput) || 0) * 100)
  const amountMinor = mode === 'full' ? refundableMinor : partialMinor
  const noteRequired = reason === 'other'
  const submittable = !!reason && amountMinor > 0 && amountMinor <= refundableMinor && (!noteRequired || note.trim().length > 0)

  const submit = async () => {
    if (!onRefund || !submittable || busy) return
    setBusy(true); setError(null)
    const res = await onRefund({ orderKey, amountMinor, reason, note: note.trim() })
    setBusy(false)
    if (res.ok) setDone(res.message)
    else setError(res.message)
  }

  // ── 🔴 PORTALLED TO <body>, AND THAT IS THE BACKDROP FIX — NOT A Z-INDEX CHANGE ─────────────────
  // 🔴 THE DEFECT: on the dashboard at `lg:` and up, the Orders list lives inside
  // `<div className="@container lg:flex-1 …">` (app/dashboard/[token]/page.tsx). Tailwind's
  // `@container` is `container-type: inline-size`, which applies `contain: layout style inline-size` —
  // and LAYOUT CONTAINMENT MAKES THAT ELEMENT THE CONTAINING BLOCK FOR ITS FIXED-POSITION DESCENDANTS.
  // This modal is rendered FROM INSIDE an OrderCard, so `fixed inset-0` resolved against the orders
  // COLUMN rather than the viewport: the dim stopped at the column's right edge and the `lg:w-48`
  // Kitchen capacity sidebar beside it stayed undimmed — the lighter vertical strip reported from an
  // iPad. Portrait and phone never showed it, because the sidebar and the `lg:` column only exist above
  // that breakpoint.
  // ⚠️ THE COMMENT IN OrderCard THAT SAYS THIS "centres on the VIEWPORT" WAS WRITTEN BEFORE
  // `@container` WAS ADDED TO THAT COLUMN, and stopped being true when it was. It is left as it is —
  // this is the fix that makes it true again.
  // 🔴 WHY A PORTAL AND NOT A HIGHER Z-INDEX. Nothing is painting OVER the backdrop; the backdrop is
  // not reaching. No z-index can extend an element beyond its own containing block, so raising it would
  // have changed nothing while looking like a fix — and the containment is deliberate (the order-card
  // grids size their columns off that container), so removing `@container` would change the grid
  // layout. Moving the modal out of the container is the only change that fixes the cause and touches
  // no layout.
  // ⚠️ NOTHING ELSE MOVES. Same markup, same classes, same z-50, same opacity, same handlers. React
  // events still bubble through the REACT tree, not the DOM tree, so every parent handler behaves
  // exactly as before; only the DOM node's position changes.
  // ⚠️ NULL ON THE SERVER, NOT RENDERED IN PLACE. This component already returns null unless `open`,
  // and `open` is only ever true after a client interaction — so the server never emits this shell and
  // there is nothing for hydration to mismatch against.
  const shell = (children: React.ReactNode) => {
    const overlay = (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        onClick={e => e.target === e.currentTarget && !busy && onClose()}>
        <div className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
          {children}
        </div>
      </div>
    )
    return typeof document === 'undefined' ? null : createPortal(overlay, document.body)
  }

  // ── AFTER A REFUND: ONE SCREEN, AND IT SAYS WHICH OF THE TWO THINGS HAPPENED. ───────────────────
  // 🔴 "Refund sent" AND "Refunded" ARE NOT THE SAME SENTENCE. Stripe accepts a refund on a Connect
  // direct charge as `pending` when the account's balance is short, and the money has not moved then.
  // The caller composes the words; this only renders them.
  if (done) {
    return shell(
      <>
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Order #{orderId}</h3>
          <p className="text-sm text-slate-500 mt-2">{done}</p>
        </div>
        <button onClick={onClose}
          className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-3 rounded-xl text-sm">Done</button>
      </>
    )
  }

  // ── 🔴 BRANCH 0 — OFFLINE. TESTED BEFORE EVERY OTHER BRANCH, AND THAT ORDER IS LOAD-BEARING. ──
  // Offline the ledger rows this modal reasons from are STALE OR ABSENT: `payments` comes from
  // /api/dashboard, and an order paid offline has no ledger row at all. So `hasReversibleInPersonPayment`
  // resolves false and `cardChargeMinor` resolves 0, and the modal fell through to Branch 3 — which told
  // the operator the order "was paid by card, so there is no payment record to remove here".
  // 🔴 THAT SENTENCE WAS FALSE FOR A CASH ORDER TAKEN AT THE HATCH, and it was indistinguishable from
  // the same sentence said truthfully about a real card order. This branch exists so an operator can tell
  // "not while offline" from "not possible for this order".
  // ⚠️ IT IS VISIBLE AND EXPLAINS ITSELF — not hidden, not a disabled button that swallows a tap, and NOT
  // a control that lets the tap through and fails. There is nothing to press but Got it.
  if (offline) {
    return shell(
      <>
        {howPaidBlock}
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Payment changes need a connection</h3>
          <p className="text-sm text-slate-500 mt-2">
            Payment changes can&apos;t be made while offline. Refunds and removing a recorded payment both
            have to reach the payment provider, so they can&apos;t be saved on this device and sent later.
          </p>
          <p className="text-sm text-slate-500 mt-2">
            Order <strong className="text-slate-700">#{orderId}</strong> is unchanged. Reconnect and open
            this again.
          </p>
        </div>
        <button onClick={onClose}
          className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-3 rounded-xl text-sm">Got it</button>
      </>
    )
  }

  // ── BRANCH 1 — AN IN-PERSON PAYMENT. UNCHANGED, CHARACTER FOR CHARACTER. ───────────────────────
  if (hasReversibleInPersonPayment) {
    return shell(
      <>
        {howPaidBlock}
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Remove payment?</h3>
          <p className="text-sm text-slate-500 mt-2">
            This removes the <strong className="text-slate-700">{money(paidMinor)}</strong> recorded
            against order <strong className="text-slate-700">#{orderId}</strong>. The order stays where it is;
            only the payment record is removed.
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 border border-slate-200 text-slate-600 py-3 rounded-xl text-sm">Cancel</button>
          <button onClick={() => { onClose(); onUndoPayment() }} disabled={undoLoading}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-50">
            {undoLoading ? '…' : 'Remove payment'}
          </button>
        </div>
      </>
    )
  }

  // ── BRANCH 3 — NOTHING TO ACT ON. The pre-refund explanation, minus the sentence about Stripe. ──
  if (!canRefund) {
    return shell(
      <>
        {howPaidBlock}
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Paid by card</h3>
          <p className="text-sm text-slate-500 mt-2">
            Order <strong className="text-slate-700">#{orderId}</strong> was paid by card, so there is no
            payment record to remove here — the money is already on the customer&apos;s card.
          </p>
          {cardChargeMinor > 0 && refundedMinor > 0 && (
            <p className="text-sm text-slate-500 mt-2">
              {money(refundedMinor)} of {money(cardChargeMinor)} has already been refunded, so there is
              nothing left to refund on this order.
            </p>
          )}
        </div>
        <button onClick={onClose}
          className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-3 rounded-xl text-sm">Got it</button>
      </>
    )
  }

  // ── BRANCH 2 — THE REFUND FORM. ────────────────────────────────────────────────────────────────
  return shell(
    <>
      {howPaidBlock}
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Refund order #{orderId}</h3>
        <p className="text-sm text-slate-500 mt-1">
          {money(cardChargeMinor)} was paid by card{refundedMinor > 0 ? `, ${money(refundedMinor)} already refunded` : ''}.
          <span className="text-slate-700 font-medium"> {money(refundableMinor)} can be refunded.</span>
        </p>
      </div>

      <div className="flex gap-2">
        {([['full', `Full · ${money(refundableMinor)}`], ['partial', 'Part']] as const).map(([v, label]) => (
          <button key={v} type="button" onClick={() => { setMode(v); setError(null) }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border ${mode === v ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 text-slate-600'}`}>
            {label}
          </button>
        ))}
      </div>

      {mode === 'partial' && (
        <label className="block">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Amount</span>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-slate-500 text-sm">£</span>
            <input type="number" inputMode="decimal" step="0.01" min="0.01" max={(refundableMinor / 100).toFixed(2)}
              value={amountInput} onChange={e => { setAmountInput(e.target.value); setError(null) }}
              placeholder={(refundableMinor / 100).toFixed(2)}
              className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
          </div>
          {partialMinor > refundableMinor && (
            <span className="text-xs text-red-600 mt-1 block">Only {money(refundableMinor)} can be refunded.</span>
          )}
        </label>
      )}

      <label className="block">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Reason</span>
        <select value={reason} onChange={e => { setReason(e.target.value); setError(null) }}
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm mt-1 bg-white">
          <option value="">Choose a reason…</option>
          {REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </label>

      <label className="block">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
          Note {noteRequired ? '(required)' : '(optional)'}
        </span>
        <textarea value={note} onChange={e => { setNote(e.target.value); setError(null) }} rows={2}
          placeholder={noteRequired ? 'What happened?' : 'Anything worth recording'}
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm mt-1" />
      </label>

      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

      <div className="flex gap-3">
        <button onClick={onClose} disabled={busy}
          className="flex-1 border border-slate-200 text-slate-600 py-3 rounded-xl text-sm disabled:opacity-50">Cancel</button>
        <button onClick={submit} disabled={!submittable || busy}
          className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-40">
          {busy ? 'Refunding…' : `Refund ${money(Math.max(0, Math.min(amountMinor, refundableMinor)))}`}
        </button>
      </div>
      <p className="text-[11px] text-slate-400 text-center leading-relaxed">
        This sends the money back to the customer&apos;s card. It cannot be undone from here.
      </p>
    </>
  )
}
