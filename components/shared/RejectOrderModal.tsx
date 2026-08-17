'use client'
// ── THE REJECT-REASON GATE — ONE MODAL, BOTH SURFACES ───────────────────────────────────────────────
// 🔴 WHY THIS EXISTS, AND IT IS NOT A TIDY-UP. The dashboard intercepted `reject` BEFORE `gatedAction`
// and opened this modal; the KDS had no interception at all, so its Reject button rejected immediately.
// The `pending` Confirm/Reject pair sits ABOVE every `viewMode` branch in OrderCard, so it renders on
// every surface — the KDS could always dispatch it, and did.
//
// 🔴 THE ARTEFACT IS OUTWARD-FACING. `reject` emails the customer, and the server composes that email as
//     const reasonLine = rejectionReason ? `<p…>Reason: …</p>` : ''
// so a reasonless rejection does not fail — it silently drops the line. A KDS rejection therefore told a
// customer their order was refused and gave no reason, and `orders.rejection_reason` was left NULL, so
// nothing after the fact could reconstruct what the operator meant. There is no undo for a rejection the
// way there is for `ready`.
//
// ── WHAT THIS COMPONENT OWNS, AND WHAT IT DELIBERATELY DOES NOT ─────────────────────────────────────
// OWNS — everything that must not differ between two surfaces: the reason options, their ORDER, their
// exact labels, the "Other promotes the note to required" rule, the fullReason composition, and BOTH
// layers of the mandatory-reason enforcement.
// DOES NOT OWN — the request. Each surface keeps its own confirm callback, because each has its own
// token, its own toasts and its own post-gate handler. Same shape as EventActionsModal and
// EventFinishTimeModal: per-surface callbacks, and an omitted callback omits that item.
//
// 🔴 IT IS MOUNTED CONDITIONALLY, AND THAT IS LOAD-BEARING. The caller renders it only while open, so it
// UNMOUNTS on every exit — confirm, "Keep order", and the Android back button alike — and its internal
// reason/note die with it. That reproduces the dashboard's `resetRejectModal` clearing of those two
// fields BY CONSTRUCTION rather than by three arms remembering to call one function, which is the defect
// the dashboard's own comment records having fixed once already.
//
// ⚠️ THE ANDROID BACK ENTRY STAYS IN EACH PAGE'S ORDERED LIST — see the note on `onDismiss`.
import { useState } from 'react'

/** The reasons, in display order. 🔴 EXPORTED SO NOTHING RESTATES THEM. `Other` is last and is the one
 *  that promotes the free-text note from optional to required. */
export const REJECT_REASONS = [
  'Sold out of an item',
  "Too busy — can't make it in time",
  'Closing soon',
  'Other',
] as const

/**
 * Compose what the customer will read. 🔴 THE ONE PLACE THIS RULE LIVES.
 *   a concrete preset  → "preset" or "preset — note"
 *   'Other' or nothing → the note alone, which is why the note is mandatory in that case
 * Returns '' when there is nothing to say, which is what both enforcement layers test.
 */
export function composeRejectReason(reason: string, note: string): string {
  const n = note.trim()
  return (reason && reason !== 'Other') ? [reason, n].filter(Boolean).join(' — ') : n
}

export function RejectOrderModal({
  orderId,
  customerName,
  totalLabel,
  onConfirm,
  onDismiss,
}: {
  /** Display number, e.g. 12 or 'A13'. */
  orderId: string | number
  customerName: string
  /** Already formatted by the caller — the KDS and the dashboard differ on whether money is shown. */
  totalLabel: string
  /** 🔴 Receives the COMPOSED reason, never the raw fields. Never called with an empty string. */
  onConfirm: (fullReason: string) => void
  /** "Keep order", and the same closer each page registers with the hardware back button.
   *  ⚠️ THE BACK REGISTRATION IS NOT DONE HERE, DELIBERATELY. `useAndroidBack` takes ONE ORDERED list per
   *  surface and the order IS the nesting — a registration made from inside this component would join the
   *  module's LIFO stack at its own position instead of the page's chosen one, which would change which
   *  overlay the dashboard dismisses when a screen-off or offline-paused notice is open at the same time.
   *  Each page therefore keeps `[open, dismiss]` in its own list, at the position it already occupies. */
  onDismiss: () => void
}) {
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')

  const fullReason = composeRejectReason(reason, note)
  // ── 🔴 ENFORCEMENT LAYER 1 OF 2: THE BUTTON. Layer 2 is the caller's own `if (!fullReason) return`,
  // which is kept on both surfaces. Two layers, deliberately — this is the last gate before an email
  // reaches a customer, and a disabled attribute is a UI fact rather than a guarantee.
  const canConfirm = fullReason !== ''

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 flex flex-col gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Reject order #{orderId}?</h3>
          <p className="text-sm text-slate-500 mt-1">{customerName}{totalLabel}</p>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Reason — required (shown to the customer)</label>
          <select value={reason} onChange={e => setReason(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm">
            <option value="">Select a reason</option>
            {REJECT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{reason === 'Other' ? 'Reason — required' : 'Additional note — optional'}</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Add more detail for the customer..." rows={2} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none"/>
        </div>
        <div className="flex gap-3">
          <button onClick={onDismiss} className="flex-1 border border-slate-200 text-slate-600 font-medium py-3 rounded-xl text-sm">Keep order</button>
          <button onClick={() => { if (canConfirm) onConfirm(fullReason) }} disabled={!canConfirm} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-50 disabled:cursor-not-allowed">Reject order</button>
        </div>
      </div>
    </div>
  )
}
