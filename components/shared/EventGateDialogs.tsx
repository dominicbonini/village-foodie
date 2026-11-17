'use client'
// components/shared/EventGateDialogs.tsx — 🔴 THE THREE ONE-TIME QUESTIONS A STAFF SCREEN ASKS ABOUT AN EVENT
// (events-overlap-2, 17 November 2026; the incident is docs/events-overlap-1-report.md).
//
//   ApproveEventDialog — tapping an UNAPPROVED event. Three shapes (events-overlap-4 wording):
//     • it overlaps an approved or started event, "Keep" not yet chosen: "{event} is a possible duplicate of {other}
//       ({start}–{end}), which is already approved and has {n} orders." — main "Keep {other}", secondary "Approve {event} anyway";
//     • it overlaps, "Keep" already chosen (overlap_dismissed_at): "{event} is a possible duplicate of {other}, which is
//       already approved. Approve it to take orders? Customers will see it too." — Approve / Cancel;
//     • nothing overlaps: "{event} isn't approved yet. Approve it to take orders? Customers will see it too." — Approve / Cancel.
//   StartEventDialog — Start on an event that has NEVER been started (opened_at is null). Never again once started.
//   SwitchEventDialog — choosing another event while the started one is selected.
// Presentation only: every write is the caller's (the dashboard page and the KDS own their actions). The card is the same
// shape and palette as EventActionsModal so the screens read as one set.
import { useT } from '@/lib/i18n/use-t'
import '@/lib/i18n/catalog/kitchenModals'
import { formatTime, type TimeSettings } from '@/lib/time-utils'
import { eventDateLabel } from '@/lib/event-display'

export type GateEvent = { id: string; venue_name?: string | null; town?: string | null; event_date: string; start_time?: string | null; end_time?: string | null }

/** The name a dialog uses for an event: its venue, else its town. */
export function gateEventName(e: Pick<GateEvent, 'venue_name' | 'town'> | null | undefined): string {
  return (e?.venue_name || e?.town || '').trim() || '—'
}

function Card({ onClose, children, testId }: { onClose: () => void; children: React.ReactNode; testId: string }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-end sm:items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()} data-testid={testId}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl" role="dialog" aria-modal="true">{children}</div>
    </div>
  )
}

const primary = 'w-full bg-orange-600 text-white font-bold py-2.5 rounded-xl hover:bg-orange-700 text-sm disabled:opacity-50'
const secondary = 'w-full bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl hover:bg-slate-200 text-sm disabled:opacity-50'
const quiet = 'w-full text-sm text-slate-500 hover:text-slate-700 py-2'

export function ApproveEventDialog({ event, overlap, overlapOrders, dismissed = false, time, busy, onKeep, onApprove, onCancel }: {
  event: GateEvent
  /** The approved/started event it overlaps (the one with the most orders) — null when nothing overlaps. */
  overlap: GateEvent | null
  /** events-overlap-4: "Keep {other}" was already chosen for this event (overlap_dismissed_at). The question is then the
   *  plain Approve / Cancel one, still naming the event it probably duplicates. */
  dismissed?: boolean
  /** Orders on `overlap`, not cancelled. */
  overlapOrders: number
  time: TimeSettings | null | undefined
  busy?: boolean
  onKeep: () => void
  onApprove: () => void
  onCancel: () => void
}) {
  const t = useT('kitchenModals')
  const name = gateEventName(event)
  if (overlap && dismissed) {
    return (
      <Card onClose={onCancel} testId="approve-dismissed-dialog">
        <h3 className="font-black text-slate-900 mb-2">{t('eventGate.approveTitle', { event: name })}</h3>
        <p className="text-sm text-slate-600 mb-4">{t('eventGate.dismissedText', { event: name, other: gateEventName(overlap) })}</p>
        <div className="space-y-2">
          <button onClick={onApprove} disabled={busy} className={primary}>{t('eventGate.approve')}</button>
          <button onClick={onCancel} disabled={busy} className={quiet}>{t('cancel')}</button>
        </div>
      </Card>
    )
  }
  if (overlap) {
    const other = gateEventName(overlap)
    return (
      <Card onClose={onCancel} testId="approve-overlap-dialog">
        <h3 className="font-black text-slate-900 mb-2">{t('eventGate.approveTitle', { event: name })}</h3>
        <p className="text-sm text-slate-600 mb-4">{t('eventGate.overlapText', {
          event: name, other, start: formatTime(overlap.start_time ?? '', time), end: formatTime(overlap.end_time ?? '', time),
          n: overlapOrders, count: String(overlapOrders),
        })}</p>
        <div className="space-y-2">
          <button onClick={onKeep} disabled={busy} className={primary}>{t('eventGate.keep', { other })}</button>
          <button onClick={onApprove} disabled={busy} className={secondary}>{t('eventGate.approveAnyway', { event: name })}</button>
        </div>
      </Card>
    )
  }
  return (
    <Card onClose={onCancel} testId="approve-plain-dialog">
      <h3 className="font-black text-slate-900 mb-2">{t('eventGate.approveTitle', { event: name })}</h3>
      <p className="text-sm text-slate-600 mb-4">{t('eventGate.plainText', { event: name })}</p>
      <div className="space-y-2">
        <button onClick={onApprove} disabled={busy} className={primary}>{t('eventGate.approve')}</button>
        <button onClick={onCancel} disabled={busy} className={quiet}>{t('cancel')}</button>
      </div>
    </Card>
  )
}

export function StartEventDialog({ event, orders, time, busy, onStart, onCancel }: {
  event: GateEvent
  /** Orders on this event so far, not cancelled. */
  orders: number
  time: TimeSettings | null | undefined
  busy?: boolean
  onStart: () => void
  onCancel: () => void
}) {
  const t = useT('kitchenModals')
  return (
    <Card onClose={onCancel} testId="start-event-dialog">
      <h3 className="font-black text-slate-900">{t('eventGate.startTitle')}</h3>
      <p className="text-sm font-bold text-slate-800 mt-2">{gateEventName(event)}</p>
      <p className="text-sm text-slate-600 mb-4">{t('eventGate.startDetails', {
        day: eventDateLabel(event.event_date, time, 'compact'),
        start: formatTime(event.start_time ?? '', time), end: formatTime(event.end_time ?? '', time),
        n: orders, count: String(orders),
      })}</p>
      <div className="space-y-2">
        <button onClick={onStart} disabled={busy} className={primary}>{t('actions.startEvent', { restart: 'no' })}</button>
        <button onClick={onCancel} disabled={busy} className={quiet}>{t('cancel')}</button>
      </div>
    </Card>
  )
}

export function SwitchEventDialog({ event, onSwitch, onCancel }: { event: GateEvent; onSwitch: () => void; onCancel: () => void }) {
  const t = useT('kitchenModals')
  return (
    <Card onClose={onCancel} testId="switch-event-dialog">
      <h3 className="font-black text-slate-900 mb-4">{t('eventGate.switchTitle', { event: gateEventName(event) })}</h3>
      <div className="space-y-2">
        <button onClick={onSwitch} className={primary}>{t('eventGate.switch')}</button>
        <button onClick={onCancel} className={quiet}>{t('cancel')}</button>
      </div>
    </Card>
  )
}
