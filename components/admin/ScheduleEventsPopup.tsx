'use client'
// components/admin/ScheduleEventsPopup.tsx
//
// The popup behind the outreach table's Schedule number. It lists THAT truck's `discovery_events` rows,
// editable exactly as they are on the Events tab.
//
// 🔴 IT NEVER READS OR WRITES `truck_events`. That is the operator table Pizzeria Gusto trades on. This
// file names `discovery_events` nowhere except through /api/admin/discovery-events — grep it.
//
// 🔴 THE ROWS COME FROM THE SAME FUNCTION THE COUNT CAME FROM. The server filters with `scheduleKeys` +
// `eventMatchesKeys` (lib/schedule-match), which is the outreach route's own schedule-key rule. Using the
// Events tab's ORPHAN matcher instead would have been the obvious mistake: 🧪 on `Between Buns` the count
// rule yields 5 rows and the fuzzy rule 10, so clicking "5" would have listed 10.
//
// 🔴 ONE WRITER. Edits go through `postEventUpdate` → the SAME `update_event` action the Events tab uses.
// No second update path for discovery_events exists.
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { nativeAuthHeader } from '@/lib/native/session'
import { EventRowCells, UpsertWarning, postEventUpdate, byDateThenTime, fmtEventDate, type EditableEventRow } from '@/components/admin/EventRowCells'
import ConfirmDeleteDialog from '@/components/admin/ConfirmDeleteDialog'

type Row = EditableEventRow & { event_date: string | null }

// Same seven columns as the Events tab, same order. No delete column — out of scope here.
const COLS: { label: string; width: string }[] = [
  { label: 'Truck', width: '170px' },
  { label: 'Date', width: '110px' },
  { label: 'Time', width: '116px' },
  { label: 'Venue', width: '180px' },
  { label: 'Village', width: '130px' },
  { label: 'Source', width: '130px' },
  { label: 'Flags', width: '150px' },
  // 🔴 NOT sortable, deliberately last. `table-fixed` spreads any surplus of minWidth over the colgroup
  // sum across EVERY column, so this 56px column and COLGROUP_SUM below move together.
  { label: '', width: '56px' },
]
const COLGROUP_SUM = 1042   // 170+110+116+180+130+130+150+56 — re-derived in the report; minWidth matches

export default function ScheduleEventsPopup({ truckId, truckName, futureCount, onClose, onEdited }: {
  truckId: string
  truckName: string
  /** The number rendered in the cell. Decides the opening scope and is checked against what arrives. */
  futureCount: number
  onClose: () => void
  /** Called after any committed edit, so the outreach table can mark its Schedule count stale. */
  onEdited: (changedTruckName: boolean) => void
}) {
  // 🔴 Y (0) OPENS ON "ALL DATES". A truck with a schedule and nothing ahead has, by definition, zero
  // future rows — opening on the future view would show an empty list and explain nothing, and those are
  // exactly the trucks whose past events are the reason to look. 🧪 Test Kitchen is the live case: 0
  // future, 50 past. Any other truck opens on the future view, matching the Events tab's default.
  const [scope, setScope] = useState<'future' | 'all'>(futureCount === 0 ? 'all' : 'future')
  const [rows, setRows] = useState<Row[]>([])
  const [keys, setKeys] = useState<string[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  // The row awaiting delete confirmation, and the SERVER's today for the past/future warning — the same
  // pair the Events tab uses, and the same dialog. Nothing deletes without the explicit confirm.
  const [pendingDelete, setPendingDelete] = useState<Row | null>(null)
  const [serverToday, setServerToday] = useState<string | null>(null)
  // 🔴 THE FREEZE, AND WHY IT IS NEEDED HERE. Editing truck_name changes which truck the row belongs to,
  // so a re-filter would make the row vanish under the cursor mid-edit. This is the same problem the
  // outreach table solves by freezing its row list while an input has focus, and it is solved the same
  // way — except that here the membership set is frozen for the whole life of the popup (see below).
  const [, setHeld] = useState(false)
  const holdList = useCallback((hold: boolean) => setHeld(hold), [])
  const closeRef = useRef<HTMLButtonElement>(null)

  // 🔴 PORTALLED TO <body>, AND THAT IS A BUG FIX, NOT TIDINESS. Rendered in place, this popup is a
  // descendant of the outreach panel, so its z-index competes only INSIDE whatever stacking context its
  // ancestors establish — and the admin tab bar (`sticky top-[51px] z-40`, app/admin/page.tsx:838) and
  // the outreach table's own `sticky top-0 z-10` header were painting OVER it. A portal makes the popup a
  // direct child of <body>, so its z-index is compared at the root against those, and it wins.
  // ⚠️ `mounted` exists because document.body does not exist during the server render; portalling
  // unconditionally would throw on the server and break hydration.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // 🔴 BACKGROUND SCROLL LOCK. Without this the page behind scrolls under the popup — the wheel lands on
  // <body> wherever the cursor is outside the list. The previous overflow value is captured and restored
  // rather than being reset to '', so a caller that had already locked the body is not silently unlocked.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => { closeRef.current?.focus() }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Capture phase + stopPropagation: the prospect modal (if ever open behind this) listens on window
      // in the bubble phase, so this always sees Escape first and closes only the popup.
      e.stopPropagation(); e.preventDefault(); onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const load = useCallback(async (s: 'future' | 'all') => {
    setLoading(true); setError(null)
    try {
      const h = await nativeAuthHeader()
      const res = await fetch(`/api/admin/discovery-events?scope=${s}&truck_id=${encodeURIComponent(truckId)}`,
        { headers: h, credentials: 'same-origin' })
      if (!res.ok) { setError(`Could not load (${res.status})`); setLoading(false); return }
      const data = await res.json()
      setRows(data.events || [])
      setKeys(Array.isArray(data.truckKeys) ? data.truckKeys : null)
      setServerToday(typeof data.today === 'string' ? data.today : null)
    } catch { setError('Could not load') }
    setLoading(false)
  }, [truckId])
  useEffect(() => { load(scope) }, [load, scope])

  // 🔴 ONE WRITER, AND NO OPTIMISTIC WRITE. The row is updated locally only after the server accepts it,
  // so a failed amend cannot look like a success.
  const patch = useCallback(async (id: string, p: Record<string, unknown>) => {
    try {
      const h = await nativeAuthHeader()
      const res = await postEventUpdate(h, id, p)
      if (!res.ok) { setToast('Save failed'); setTimeout(() => setToast(null), 2000); return }
      // 🔴 THE ROW IS UPDATED IN PLACE AND IS **NOT** RE-FILTERED OUT.
      // Editing truck_name can move the row outside this truck's key set. Re-filtering would delete it
      // from the list the instant it was corrected — the row would vanish mid-edit and the operator would
      // not see what they had typed. Instead the membership set is frozen for the life of the popup: the
      // row stays, and the Flags cell gains a "moved" marker (below) so the change is VISIBLE rather than
      // silent. Re-opening the popup applies the filter again and the row is correctly gone.
      setRows(rs => rs.map(r => r.id === id ? { ...r, ...p } as Row : r))
      setToast('Saved'); setTimeout(() => setToast(null), 1200)
      onEdited(Object.prototype.hasOwnProperty.call(p, 'truck_name'))
    } catch { setToast('Save failed'); setTimeout(() => setToast(null), 2000) }
  }, [onEdited])

  // 🔴 DELETE — THE SAME ROUTE AND THE SAME GUARD THE EVENTS TAB USES. The row leaves this list only if
  // the server confirms it left the database: anything that is not a 2xx with deletedCount >= 1 THROWS,
  // which leaves the dialog open showing the server's sentence and leaves the row in place.
  // 🔴 A DELETE ALWAYS INVALIDATES THE SCHEDULE COUNT — it removes a row the count counted — so this
  // reports `true` to onEdited unconditionally, not only for a truck_name change.
  const removeEvent = useCallback(async (id: string) => {
    const h = await nativeAuthHeader()
    const res = await fetch(`/api/admin/discovery-events?id=${encodeURIComponent(id)}`, {
      method: 'DELETE', headers: h, credentials: 'same-origin',
    })
    let payload: any = null
    try { payload = await res.json() } catch { /* a body-less failure is still a failure */ }
    if (!res.ok) throw new Error(payload?.error || `Delete failed (${res.status})`)
    if (!payload?.deletedCount) throw new Error('The server did not confirm a row was deleted.')
    setRows(rs => rs.filter(r => r.id !== id))
    setToast('Event deleted'); setTimeout(() => setToast(null), 2000)
    onEdited(true)
  }, [onEdited])

  // Does this row still belong to the truck the popup was opened for? Compared with the SAME rule the
  // server filtered on — trim + lowercase, exact membership — re-applied to the edited value.
  const stillMatches = (r: Row) =>
    keys == null || keys.includes((r.truck_name ?? '').trim().toLowerCase())

  const futureShown = rows.length
  if (!mounted) return null
  return createPortal(
    // 🔴 SAME HARDENING AS ComposeWindow, SAME VALUE (80 — unchanged, so the paint order is identical).
    // `z-[80]` currently resolves only because two UNRELATED pre-existing files (AppLockGate,
    // DemoWelcome) also use it, so the rule happens to already be in the stylesheet. That is luck, not
    // design: if either stopped using it, this popup would silently drop to `z-index: auto` and paint
    // under the page exactly as the compose window did. An inline style cannot go missing from a
    // stylesheet, because it is not in one.
    <div style={{ zIndex: 80 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose} role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="sched-pop-title"
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[calc(100vh-4rem)] flex flex-col overflow-hidden">

        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 flex-shrink-0">
          <h4 id="sched-pop-title" className="text-base font-semibold text-slate-900 truncate">
            {truckName} — schedule
          </h4>
          <span className="text-xs text-slate-400 tabular-nums">
            {loading ? 'loading…' : `${futureShown} ${futureShown === 1 ? 'event' : 'events'}`}
            {scope === 'future' && !loading && ` · cell shows Y (${futureCount})`}
          </span>
          <div className="ml-auto flex items-center gap-2 flex-shrink-0">
            {/* Matches the Events tab's own default + toggle, so the two never disagree about the view. */}
            <button onClick={() => setScope(scope === 'future' ? 'all' : 'future')}
              className="text-xs font-semibold px-2 py-1 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400">
              {scope === 'future' ? 'All dates' : 'Future only'}
            </button>
            <button ref={closeRef} onClick={onClose}
              className="text-sm font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400">
              Close
            </button>
          </div>
        </div>

        <div className="px-5 pt-3 flex-shrink-0">
          <UpsertWarning />
          {/* 🔴 THE Y (0) EXPLANATION, ON SCREEN. Without this the operator sees a past-dated list and no
              reason for it. */}
          {futureCount === 0 && (
            <p className="text-[11px] text-slate-500 mb-3">
              Nothing is booked ahead for this truck, so the list opens on <b>all dates</b> — these are its
              past events.
            </p>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-auto px-5 pb-5">
          {error && <p className="text-sm text-red-600 py-4">{error}</p>}
          {!error && (
            <table className="table-fixed text-sm w-full" style={{ minWidth: `${COLGROUP_SUM}px` }}>
              <colgroup>{COLS.map(c => <col key={c.label} style={{ width: c.width }} />)}</colgroup>
              <thead className="bg-slate-100 text-slate-600 text-xs uppercase tracking-wide sticky top-0 z-10">
                <tr>{COLS.map(c => (
                  <th key={c.label} className="px-2 py-2 text-center">
                    <span className="inline-flex items-center justify-center font-bold">{c.label}</span>
                  </th>))}
                </tr>
              </thead>
              <tbody>
                {[...rows].sort(byDateThenTime).map(e => (
                  <tr key={e.id} className={`border-t border-slate-100 ${e.isOrphan ? 'bg-amber-50/40' : ''}`}>
                    <EventRowCells
                      e={e}
                      onCommit={patch}
                      onHold={holdList}
                      trailingFlag={!stillMatches(e) ? (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-orange-100 text-orange-800 ml-1"
                          title={`The truck name no longer matches ${truckName}. This row will not appear here when the popup is re-opened, and the Schedule count on the outreach row is now out of date.`}>moved</span>
                      ) : undefined}
                    />
                    {/* 🔴 THIS ONLY OPENS THE DIALOG. The dialog's confirm is the single caller of
                        removeEvent; there is no click path that deletes directly. */}
                    <td className="px-2 py-2 text-center">
                      <button
                        onClick={() => setPendingDelete(e)}
                        title={`Delete this event: ${e.truck_name || 'unnamed truck'} on ${e.event_date}`}
                        aria-label={`Delete event: ${e.truck_name || 'unnamed truck'} on ${e.event_date}`}
                        className="text-xs font-bold px-2 py-1 rounded-lg border border-slate-200 text-slate-400 hover:text-red-700 hover:border-red-300 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-400">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={COLS.length} className="px-3 py-8 text-center text-slate-400">
                    {scope === 'future' ? 'No future events. Switch to “All dates” to see past ones.' : 'No events for this truck.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* 🔴 THE SAME DIALOG AND THE SAME DATE-DEPENDENT WARNING AS THE EVENTS TAB. `isFuture` compares
            the row's STORED event_date against the SERVER's today (from this GET), never the browser
            clock; if the server date has not arrived it warns as though the row were future-dated. */}
        {pendingDelete && (() => {
          const dRow = pendingDelete
          const known = serverToday != null
          const isFuture = known ? (dRow.event_date ?? '') >= serverToday! : true
          const when = fmtEventDate(dRow.event_date) ?? dRow.event_date ?? 'an unknown date'
          return (
            <ConfirmDeleteDialog
              title={`Delete ${dRow.truck_name || 'this event'} on ${when}?`}
              confirmLabel="Delete event"
              onCancel={() => setPendingDelete(null)}
              onConfirm={async () => { await removeEvent(dRow.id); setPendingDelete(null) }}
            >
              <p className="text-sm text-slate-600 mt-2">
                <span className="font-semibold text-slate-800">{dRow.truck_name || '(no truck name)'}</span>
                {' at '}<span className="font-semibold text-slate-800">{dRow.venue_name || '(no venue)'}</span>
                {' on '}<span className="font-semibold text-slate-800">{when}</span>.
              </p>
              <p className="text-sm text-slate-500 mt-2">This cannot be undone.</p>
              {isFuture && (
                <p className="mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                  <span className="font-bold">This event is in the future.</span> The source page may still
                  list it, so a later scrape can re-create it. If it comes back, the source is still
                  publishing it — deleting it again will not keep it away.
                </p>
              )}
              {!known && (
                <p className="mt-2 text-xs text-slate-400">
                  (The server date has not loaded, so the future-dated warning is shown to be safe.)
                </p>
              )}
            </ConfirmDeleteDialog>
          )
        })()}

        {toast && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg">{toast}</div>
        )}
      </div>
    </div>,
    document.body,
  )
}
