'use client'
// components/admin/EventRowCells.tsx
//
// 🔴 WHAT IS SHARED AND WHAT IS DELIBERATELY NOT — the §51.7 judgement, both directions.
//
// §51.7 records two opposite mistakes: a "reuse" that was really a fourth independent implementation, and
// collapsing two things that should have stayed separate. Both risks are live here, and they apply to
// DIFFERENT parts of the Events tab, so the split is drawn between them:
//
//   SHARED (this file) — the seven cells of an event row. The Events tab and the Schedule popup show the
//     SAME columns, edit the SAME six fields through the SAME route action, and render the SAME orphan /
//     no-venue flags. Two copies of that would drift: someone adds a column to one table and the other
//     silently disagrees about what an event is. This is genuine duplication, so it is extracted.
//
//   NOT SHARED — the filter bar, the source dropdown, the n-of-N counts, the scope toggle, the sticky
//     header, the column widths and the DELETE column. Those belong to the full-page tab. The popup is a
//     narrow list scoped to one truck; it has no filters, and delete is explicitly out of its scope. A
//     component that took `showFilters`, `showDelete`, `showCounts` booleans to serve both would be the
//     collapse §51.7 warns about — one component with two personalities and a flag for each.
//
// 🔴 THIS FILE NEVER NAMES `truck_events`. It edits `discovery_events` rows only.
import type { ReactNode } from 'react'
import InlineField from '@/components/admin/InlineField'

// The row shape both tables use. Fields beyond these are ignored here.
export type EditableEventRow = {
  id: string
  event_date: string | null
  start_time: string | null
  end_time: string | null
  truck_name: string | null
  venue_name: string | null
  village: string | null
  event_notes: string | null
  source: string | null
  isOrphan: boolean
  unlinkedVenue: boolean
}

export const fmtEventDate = (d: string | null) => {
  if (!d) return null
  const dt = new Date(d.length <= 10 ? d + 'T00:00:00Z' : d)
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
export const hhmm = (t: string | null) => (t ?? '').slice(0, 5)

// 🔴 THE EDITABLE SET, AND IT MATCHES THE ROUTE'S ALLOW-LIST EXACTLY.
// truck_name · venue_name · village · start_time · end_time · event_notes.
// `source` renders read-only (provenance), `event_date` renders read-only (part of the upsert identity),
// and the two FKs are not rendered at all. The SERVER is still the authority: the route filters the body
// against its own EDITABLE list and ignores anything else, so this component cannot widen what is
// writable even if it rendered a field it should not.

// 🔴 ONE ORDERING FOR BOTH SCREENS — date, then start time, then id.
// Two events on the same day must read in the order they happen, so the earlier start comes first.
// ⚠️ A MISSING start_time SORTS LAST WITHIN ITS DAY, not first: '' would compare below every real time
// and float unscheduled rows to the top of the day, which is the opposite of useful. '99:99' is above any
// real "HH:MM" string, so blanks fall to the end of their date. Times are compared as strings, which is
// correct for zero-padded 24-hour "HH:MM" — the shape hhmm() already renders.
// `id` is the final tiebreak so the order is total and stable across reloads.
export const byDateThenTime = (a: EditableEventRow, b: EditableEventRow): number =>
  (a.event_date ?? '').localeCompare(b.event_date ?? '')
  || (hhmm(a.start_time) || '99:99').localeCompare(hhmm(b.start_time) || '99:99')
  || a.id.localeCompare(b.id)

export function EventRowCells({ e, onCommit, onHold, trailingFlag }: {
  e: EditableEventRow
  onCommit: (id: string, patch: Record<string, unknown>) => void
  /** Required: both tables freeze their row list while an input has focus. See each caller. */
  onHold: (hold: boolean) => void
  /** An extra marker rendered in the Flags cell — the popup uses it for "no longer matches this truck". */
  trailingFlag?: ReactNode
}) {
  return (
    <>
      <td className="px-2 py-1">
        <InlineField value={e.truck_name} type="text" placeholder="—" onHold={onHold}
          onCommit={v => onCommit(e.id, { truck_name: v })} />
      </td>
      {/* Read-only: part of the upsert identity (event_date, truck_name, venue_name). */}
      <td className="px-2 py-2 text-center text-slate-600 text-xs whitespace-nowrap">{fmtEventDate(e.event_date) ?? '—'}</td>
      <td className="px-2 py-1">
        <div className="flex items-center gap-0.5">
          <InlineField value={hhmm(e.start_time)} type="text" placeholder="--:--" onHold={onHold}
            onCommit={v => onCommit(e.id, { start_time: v })} />
          <span className="text-slate-300 text-xs">–</span>
          <InlineField value={hhmm(e.end_time)} type="text" placeholder="--:--" onHold={onHold}
            onCommit={v => onCommit(e.id, { end_time: v })} />
        </div>
      </td>
      <td className="px-2 py-1">
        <InlineField value={e.venue_name} type="text" placeholder="—" onHold={onHold}
          onCommit={v => onCommit(e.id, { venue_name: v })} />
      </td>
      <td className="px-2 py-1">
        <InlineField value={e.village} type="text" placeholder="—" onHold={onHold}
          onCommit={v => onCommit(e.id, { village: v })} />
      </td>
      {/* 🔴 PROVENANCE — read-only by design, not by omission. */}
      <td className="px-2 py-2 text-center text-[11px] text-slate-400 truncate" title={e.source ?? undefined}>{e.source ?? '—'}</td>
      <td className="px-2 py-2 text-center whitespace-nowrap">
        {e.isOrphan && (
          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 mr-1"
            title="truck_name matches no discovery_trucks row by name or alias — invisible to every name-matching consumer">orphan</span>
        )}
        {e.unlinkedVenue && (
          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-500"
            title="venue_id is null — no venue anchor. A known open item; this tool does not fix it.">no venue</span>
        )}
        {trailingFlag}
        {!e.isOrphan && !e.unlinkedVenue && !trailingFlag && <span className="text-slate-300 text-xs">—</span>}
      </td>
    </>
  )
}

// 🔴 ONE WRITER. Both tables send the SAME action to the SAME route; no second update path exists for
// `discovery_events`. Extracted so the request body cannot drift between the two callers.
export async function postEventUpdate(
  authHeader: Record<string, string>,
  id: string,
  patch: Record<string, unknown>,
): Promise<Response> {
  return fetch('/api/admin/discovery-events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader },
    credentials: 'same-origin',
    body: JSON.stringify({ action: 'update_event', id, ...patch }),
  })
}

// 🔴 THE UPSERT WARNING — ONE SENTENCE, BOTH SURFACES.
// A correction to a row the scraper still emits does not last: both writers upsert on
// (event_date, truck_name, venue_name). Editing truck_name or venue_name changes the row's IDENTITY, so
// the next run re-inserts the original ALONGSIDE the corrected row; editing anything else is overwritten
// by the next run's DO UPDATE. Corrections stick only on rows the scraper no longer emits. Shared so the
// two surfaces cannot say different things about the same risk.
export function UpsertWarning({ className = 'mb-3' }: { className?: string }) {
  return (
    <p className={`text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 ${className}`}>
      ⚠️ Edits to events the scraper still produces are temporary — the 06:00 run upserts on
      (date, truck, venue). Changing a name makes the next run re-add the original; changing anything
      else is overwritten. Fix the source page for a permanent change.
    </p>
  )
}
