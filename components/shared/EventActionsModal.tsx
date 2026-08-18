'use client'

// ── THE EVENT ACTIONS MENU — ONE MODAL, BOTH SURFACES ──────────────────────────────────────────────
// 🔴 ONE MENU HAD TWO VERSIONS, AND THEY HAD DRIFTED. Both screens open a modal titled with the venue
// name offering the same job — change event, note, adjust the finish, finish, cancel — but the KDS's
// was missing START / RESTART EVENT entirely, so a truck whose event had not auto-opened could not
// start it from the kitchen screen at all. It also styled "Change event" as a bordered list row while
// every sibling was a filled button, so the menu read as a row and then a set.
// This component is the DASHBOARD's modal, lifted, because it was the more complete of the two.
//
// ── ⚠️ THE CALLER OWNS EVERY ACTION; THIS OWNS THE MENU ────────────────────────────────────────────
// Each item is a callback, and an OMITTED callback hides that item. That is what lets two surfaces that
// do the same thing DIFFERENTLY still share the menu: "change event" opens a tab on the dashboard and a
// picker overlay on the KDS; pausing goes through a duration modal on one and a toggle on the other.
// What must NOT differ — the order of the items, their labels, their colours, and which statuses reveal
// which — lives here and only here.
//
// ⚠️ `extraWaitControl` is a ReactNode rather than a callback because each surface already renders its
// own extra-wait control with its own state, holds its own `waitMinutes`, and performs its own write.
// Passing the node keeps that surface-specific markup where it belongs while fixing its POSITION here.
// 🔴 IT IS NOW A BUTTON ON BOTH SURFACES, NOT A <select>. Every row in this menu is a filled button;
// the add direction opens components/shared/ExtraWaitModal, which offers the SAME 10/20/30 and writes
// nothing itself. The options, the values and the write are unchanged — only the control is.
import type { ReactNode } from 'react'
// ⚠️ IMPORTED, NEVER REWRITTEN. `fmtVenue` and `eventDateLabel` are the SAME formatters both
// event bars already use (lib/event-display), and `formatTimeRange` is the one both surfaces use
// for a start-to-finish pair (lib/time-utils). A second formatter here is how the menu's header comes
// to read a date differently from the bar that opened it.
import { fmtVenue, eventDateLabel } from '@/lib/event-display'
import { formatTimeRange } from '@/lib/time-utils'

export function EventActionsModal({
  event,
  noteValue,
  onNoteChange,
  onSaveNote,
  onStartEvent,
  onChangeEvent,
  paused = false,
  onPause,
  onResume,
  extraWaitControl,
  onChangeFinishTime,
  onFinishEvent,
  onCancelEvent,
  onClose,
}: {
  /** The event this menu acts on. The CALLER gates the mount.
   *  ⚠️ THE FOUR DETAIL FIELDS ARE OPTIONAL, AND THE HEADER DEGRADES FIELD BY FIELD. A caller that
   *  passes none renders exactly the venue name it rendered before this change — no empty line, no
   *  dangling separator — so adding them cannot break a third caller that has not been updated. */
  event: {
    id: string
    venue_name: string
    status: string
    town?: string | null
    event_date?: string | null
    start_time?: string | null
    end_time?: string | null
  }
  noteValue: string
  onNoteChange: (v: string) => void
  onSaveNote: () => void
  /** Start / Restart. Omit to hide. Only rendered for `confirmed` or `closed`. */
  onStartEvent?: () => void
  /** Switch to a different event. Omit to hide — the KDS hides it when there is only one. */
  onChangeEvent?: () => void
  paused?: boolean
  /** Omit BOTH to hide the pause row. Only rendered for a LIVE (`open`) event. */
  onPause?: () => void
  onResume?: () => void
  /** The surface's own extra-wait control, already styled full-width. Omit to hide. */
  extraWaitControl?: ReactNode
  onChangeFinishTime: () => void
  onFinishEvent: () => void
  onCancelEvent: () => void
  /** The NON-COMMITTING arm. Wired to the ×, the backdrop, and Android back by both callers. */
  onClose: () => void
}) {
  const canStart = event.status === 'confirmed' || event.status === 'closed'

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
        {/* ── 🔴 THE FULL EVENT, NOT JUST THE VENUE ───────────────────────────────────────────────
            The title was `event.venue_name` alone, so a truck with two events at the same venue on
            different days opened a menu that could finish, cancel or re-time EITHER of them and looked
            identical for both. The date and the times are the two facts that tell them apart, and they
            are the facts every destructive button below acts on.
            ⚠️ THE VENUE LINE IS `fmtVenue`, WHICH IS WHY THE TOWN IS NOT A THIRD LINE. That formatter
            already appends "— Town" and already suppresses it when the town is inside the venue name,
            so both event bars read "The Bell — Castle Hedingham" and this now reads the same. Writing
            the town separately here would have produced "The Bell, Castle Hedingham, Castle
            Hedingham" on exactly the trucks the containment test exists for.
            ⚠️ NOTHING BELOW MOVED. This replaces the title's text and adds one line under it; the ×,
            every button, their order, their colours and their gates are untouched. */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h3 className="font-black text-slate-900 truncate">{fmtVenue(event.venue_name, event.town) || event.venue_name}</h3>
            {(event.event_date || event.start_time || event.end_time) && (
              <p className="text-xs font-medium text-slate-500 mt-0.5">
                {event.event_date ? eventDateLabel(event.event_date) : ''}
                {event.event_date && (event.start_time || event.end_time) ? ', ' : ''}
                {formatTimeRange(event.start_time, event.end_time)}
              </p>
            )}
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700 text-xl font-bold w-8 h-8 flex items-center justify-center shrink-0">×</button>
        </div>

        {/* Start / Restart — visible whenever the event isn't live yet (confirmed) or has finished
            (closed), on ALL viewports incl. mobile. 🔴 THE KDS HAD NO EQUIVALENT AT ALL: a truck whose
            event had not auto-opened could not start it from the kitchen screen. */}
        {canStart && onStartEvent && (
          <button onClick={onStartEvent}
            className="w-full bg-orange-600 text-white font-bold py-2.5 rounded-xl hover:bg-orange-700 text-sm mb-3">
            {event.status === 'closed' ? 'Restart Event' : 'Start Event'}
          </button>
        )}

        {/* ⚠️ FILLED, NOT A BORDERED LIST ROW. Both surfaces styled this one item differently from its
            siblings; it is now the same `bg-slate-100 … font-bold … text-sm` as every other button here,
            so the menu reads as one set of controls. */}
        {onChangeEvent && (
          <button onClick={onChangeEvent}
            className="w-full bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl hover:bg-slate-200 text-sm mb-4">
            Change event
          </button>
        )}

        <div className="mb-4">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Note for customers</label>
          <input type="text" value={noteValue} onChange={e => onNoteChange(e.target.value)}
            placeholder="e.g. Park in the main car park, look for the orange gazebo"
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
          <p className="text-xs text-slate-500 mt-1.5">Shown to customers on the order page below your event details.</p>
          <button onClick={onSaveNote} className="mt-2 w-full bg-slate-100 text-slate-700 font-bold py-2 rounded-xl hover:bg-slate-200 text-sm">Save note</button>
        </div>

        <div className="space-y-2 border-t border-slate-100 pt-3">
          {/* Pause / Resume orders. Only for a LIVE event.
              ⚠️ RESUME IS RENDERED WHENEVER IT APPLIES, even where Pause is withheld (demo): recovery must
              always be reachable, and only the trap is removed. The caller decides by passing or omitting
              onPause while still passing onResume. */}
          {event.status === 'open' && (paused
            ? (onResume && (
              <button onClick={onResume}
                className="w-full bg-red-600 text-white font-bold py-2.5 rounded-xl hover:bg-red-700 text-sm">▶ Resume orders</button>
            ))
            : (onPause && (
              <button onClick={onPause}
                className="w-full bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl hover:bg-slate-200 text-sm">⏸ Pause orders</button>
            ))
          )}

          {/* Add extra wait — an event-level buffer on NEW-order time quotes, NOT the finish time. */}
          {extraWaitControl}

          {/* ⚠️ NO "(now HH:MM)" SUFFIX. The finish-time modal states the current time in its first
              sentence and again as the select's starting value; a third copy here was the only one that
              could go stale against a change made on the other surface. */}
          <button onClick={onChangeFinishTime}
            className="w-full bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl hover:bg-slate-200 text-sm">Change event finish time</button>
          <button onClick={onFinishEvent}
            className="w-full bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl hover:bg-slate-200 text-sm">Finish event</button>
          <button onClick={onCancelEvent}
            className="w-full bg-red-50 text-red-600 font-bold py-2.5 rounded-xl hover:bg-red-100 border border-red-200 text-sm">Cancel event</button>
        </div>
      </div>
    </div>
  )
}
