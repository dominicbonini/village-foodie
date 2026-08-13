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
  open, onClose, orderId, orderKey, paidMinor, cardChargeMinor, refundedMinor,
  hasReversibleInPersonPayment, onUndoPayment, undoLoading, onRefund,
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
  hasReversibleInPersonPayment: boolean
  onUndoPayment: () => void
  undoLoading?: boolean
  /** Absent ⇒ no refund form. The caller has not wired one, and the modal reads as it always did. */
  onRefund?: RefundSubmit
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

  const shell = (children: React.ReactNode) => (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && !busy && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
        {children}
      </div>
    </div>
  )

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

  // ── BRANCH 1 — AN IN-PERSON PAYMENT. UNCHANGED, CHARACTER FOR CHARACTER. ───────────────────────
  if (hasReversibleInPersonPayment) {
    return shell(
      <>
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
