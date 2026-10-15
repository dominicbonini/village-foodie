'use client'

// ── THE ONE GATE ON CANCELLING AN EVENT ────────────────────────────────────────────────────────────
// 🔴 ONE OPERATION HAD THREE GATES. Manage showed this modal — the venue, the date, a COUNT OF THE
// ORDERS ABOUT TO BE CANCELLED, a reason and a message to those customers. The dashboard and the KDS,
// the two screens an operator actually uses during service, showed:
//     window.confirm('Cancel this event? This cannot be undone.')
// whose two buttons are labelled by the operating system: OK and Cancel. 🔴 ON THAT DIALOG, "Cancel"
// MEANS "DO NOT CANCEL THE EVENT" — the exact ambiguity every styled confirm in this app was written to
// avoid ("Keep order"/"Cancel order", "Keep event"/"Cancel event"), on the one operation that cancels
// every live order and strands the card holds behind them.
// This component is manage's modal, lifted unchanged, so all three surfaces gate the operation the same
// way. It is not a reimplementation — see docs/overlay-fixes-report.md B3.
//
// ── ⚠️ IT OWNS THE REASON AND THE NOTE, AND THAT IS THE POINT ──────────────────────────────────────
// The sibling defect fixed in the same change (the dashboard's Cancel-order modal) was three call sites
// each clearing the form by hand, one of which cleared less than the others and leaked a refund decision
// between orders. This component cannot repeat it: the fields are its OWN state, and the caller mounts it
// conditionally, so every open is a fresh mount with empty fields. There is no reset to forget because
// there is nothing for a caller to reset.
//
// ⚠️ IT DECIDES NOTHING ABOUT MONEY. Cancelling an event still does exactly what it did — the caller owns
// the request. Held authorisations behind cancelled orders are still stranded; that is a separate, parked
// defect (docs/event-cancel-holds-report.md), and this modal is where its money summary will belong.
import { useState } from 'react'
import { formatTime, formatYmdShortMonth, type TimeSettings } from '@/lib/time-utils'
import type { TruckEvent } from '@/components/dashboard/types'
import { useT } from '@/lib/i18n/use-t'
import '@/lib/i18n/catalog/kitchenModals'

// Lifted verbatim from the manage page's local helper so the three surfaces render the date identically.
/** The event's date in the truck's words and order (Phase 2B). ⚠️ formatYmd pins the date to UTC, so a
 *  device in another zone can no longer shift it a day (`new Date('YYYY-MM-DD')` is UTC midnight). */
function fmtDate(d: string, time: TimeSettings | null | undefined) {
  // Language Phase 2: the short month by the product's rule — "Sep", never Intl's en-GB "Sept".
  return formatYmdShortMonth(d, time, { weekday: 'short', day: 'numeric', month: 'short' })
}

/** The reasons, in display order — as IDS (Language Phase 1b); the words are messages
 *  (kitchenModals.eventCancel.reason). ⚠️ onConfirm still receives the chosen reason's WORDS, exactly as before
 *  (today the en-GB label, 'Other' included) — the request and the customers' note are unchanged. */
export const EVENT_CANCEL_REASONS = [
  'vehicle_breakdown',
  'weather',
  'venue_issue',
  'personal_emergency',
  'other',
] as const
export type EventCancelReasonId = (typeof EVENT_CANCEL_REASONS)[number]

export function EventCancelModal({
  event,
  affectedOrderCount,
  busy = false,
  onKeep,
  onConfirm,
  time,
}: {
  /** The truck's time settings (truck.time) — how the date and times read. */
  time: TimeSettings | null | undefined
  /** The event being cancelled. The CALLER gates the mount — see the header. */
  event: TruckEvent
  /** From /api/events/affected-orders. 0 renders no line at all, which is also the value shown while the
   *  count is still in flight, so the modal never claims "0 orders" about an event it has not counted. */
  affectedOrderCount: number
  busy?: boolean
  /** The NON-COMMITTING arm. Wired to the button, and to the Android back button by every caller. */
  onKeep: () => void
  onConfirm: (reason: string, note: string) => void
}) {
  const t = useT('kitchenModals')
  const labelOf = (id: EventCancelReasonId) => t('eventCancel.reason', { reason: id })
  /** The <select>'s value: '' or the chosen reason's LABEL as rendered (the option values are unchanged). It is
   *  turned straight back into an id; what onConfirm receives is that id's label — exactly today's text. */
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const reasonId: EventCancelReasonId | null = EVENT_CANCEL_REASONS.find(id => labelOf(id) === reason) ?? null
  const reasonWords = reasonId ? labelOf(reasonId) : ''

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 flex flex-col gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{t('eventCancel.title')}</h3>
          <p className="text-sm text-slate-500 mt-1">
            {event.venue_name}{event.town ? `, ${event.town}` : ''}
            {' · '}
            {fmtDate(event.event_date, time)}
            {event.start_time && event.end_time
              ? ` · ${formatTime(event.start_time, time)}–${formatTime(event.end_time, time)}`
              : ''}
          </p>
          {affectedOrderCount > 0 && (
            <p className="text-sm font-medium text-red-600 mt-2">
              {t('eventCancel.affected', { n: affectedOrderCount, count: String(affectedOrderCount) })}
            </p>
          )}
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('eventCancel.reasonLabel')}</label>
          <select value={reason} onChange={e => setReason(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm">
            <option value="">{t('selectReason')}</option>
            {EVENT_CANCEL_REASONS.map(r => <option key={r} value={labelOf(r)}>{labelOf(r)}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('eventCancel.messageLabel')}</label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={t('eventCancel.messagePlaceholder')}
            rows={3}
            className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none"
          />
        </div>
        {/* ⚠️ SAFE ARM LEFT, DESTRUCTIVE ARM RIGHT, and NEITHER is the bare word "Cancel". "Keep event"
            says what it preserves; "Cancel event" names the operation it performs. That is the house
            pattern in eleven of the twelve styled confirms, and it is what the OS dialog could not do. */}
        <div className="flex gap-3">
          <button
            onClick={onKeep}
            disabled={busy}
            className="flex-1 border border-slate-200 text-slate-600 font-medium py-3 rounded-xl text-sm disabled:opacity-50"
          >
            {t('eventCancel.keep')}
          </button>
          <button
            onClick={() => onConfirm(reasonWords, note)}
            disabled={busy}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-50"
          >
            {busy ? t('eventCancel.cancelling') : t('eventCancel.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
