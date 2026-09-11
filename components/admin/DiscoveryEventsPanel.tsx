'use client'

// components/admin/DiscoveryEventsPanel.tsx
//
// A table of `discovery_events` — the pipeline's output — so it can be read and corrected the way the
// Google Sheet used to allow. VIEW AND AMEND ONLY.
//
// 🔴 THERE IS NO DELETE, not even a disabled one. Nothing in this repository deletes from
// `discovery_events`, and whether a deletion would survive the next 06:00 scrape is unresolved. A control
// that looks like it deletes and does not is worse than its absence.
// 🔴 IT NEVER TOUCHES `truck_events` — the operator table Pizzeria Gusto trades on. This file names
// `/api/admin/discovery-events` and nothing else.
// ⚠️ The outreach tab, its filters, chips, media cells and predicate are untouched; the only thing shared
// with it is `InlineField`, which MOVED to its own module so both use one copy rather than two.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { nativeAuthHeader } from '@/lib/native/session'
import InlineField from '@/components/admin/InlineField'
import ConfirmDeleteDialog from '@/components/admin/ConfirmDeleteDialog'
import { EventRowCells, UpsertWarning, postEventUpdate, byDateThenTime, fmtEventDate as fmtDate, hhmm } from '@/components/admin/EventRowCells'

type DiscoveryEvent = {
  id: string
  event_date: string | null
  start_time: string | null
  end_time: string | null
  truck_name: string | null
  venue_name: string | null
  village: string | null
  event_notes: string | null
  source: string | null
  discovery_truck_id: string | null
  venue_id: string | null
  created_at: string | null
  isOrphan: boolean        // 🔴 derived server-side by the scraper's own matcher; never stored
  unlinkedVenue: boolean   // 🔴 derived: venue_id IS NULL
}

// ── COLUMNS, AND THE FILTER BAR MIRRORS THIS ORDER ───────────────────────────────────────────────────
// The same convention the outreach tab uses: the bar reads left-to-right in the table's column order, and
// a filter with no column sorts to the end. Declared once so the two cannot drift.
type SortKey = 'truck_name' | 'event_date' | 'start_time' | 'venue_name' | 'village' | 'source' | 'flags' | 'delete'
const COLUMNS: { key: SortKey; label: string; width: string; title?: string }[] = [
  { key: 'truck_name', label: 'Truck', width: '190px', title: 'discovery_events.truck_name — editable. This is the field the ORPHAN flag is computed from.' },
  { key: 'event_date', label: 'Date', width: '110px', title: 'Not editable: it is part of the upsert identity (event_date, truck_name, venue_name).' },
  { key: 'start_time', label: 'Time', width: '120px', title: 'start–end, both editable.' },
  { key: 'venue_name', label: 'Venue', width: '200px', title: 'discovery_events.venue_name — editable.' },
  { key: 'village', label: 'Village', width: '140px', title: 'discovery_events.village — editable.' },
  { key: 'source', label: 'Source', width: '150px', title: 'PROVENANCE — deliberately read-only.' },
  { key: 'flags', label: 'Flags', width: '150px', title: 'Derived, never stored: ORPHAN = the truck name matches no discovery_trucks row; NO VENUE = venue_id is null.' },
  // 🔴 NOT SORTABLE and deliberately last. 56px, and `minWidth` below rises by exactly 56 with it:
  // `table-fixed` distributes any surplus of minWidth over the colgroup sum across EVERY column, so a
  // column added without moving minWidth silently widens all seven others. That has happened here before.
  { key: 'delete', label: '', width: '56px', title: 'Delete this event row.' },
]

type TriFilter = 'any' | 'yes' | 'no'
type FilterState = {
  truck: string
  dateFrom: string
  dateTo: string
  venue: string
  source: string
  orphan: TriFilter
  unlinked: TriFilter
}
const EMPTY: FilterState = { truck: '', dateFrom: '', dateTo: '', venue: '', source: 'any', orphan: 'any', unlinked: 'any' }

const triMatch = (v: boolean, f: TriFilter) => f === 'any' || (f === 'yes' ? v : !v)
const has = (hay: string | null, needle: string) =>
  !needle.trim() || (hay ?? '').toLowerCase().includes(needle.trim().toLowerCase())

/**
 * 🔴 THE PREDICATE, IN ONE PLACE. Pure: reads a row and the filter state, returns a boolean, writes
 * nothing. Adding a filter later is one entry here and one control in the bar.
 * ⚠️ Deliberately NOT `matchesOutreachFilter` and deliberately not shared with it — that predicate is
 * signed off, answers a different question about a different table, and must not move.
 */
function matches(e: DiscoveryEvent, f: FilterState): boolean {
  if (!has(e.truck_name, f.truck)) return false
  if (!has(e.venue_name, f.venue)) return false
  if (f.dateFrom && (e.event_date ?? '') < f.dateFrom) return false
  if (f.dateTo && (e.event_date ?? '') > f.dateTo) return false
  if (f.source !== 'any' && (e.source ?? '') !== f.source) return false
  if (!triMatch(e.isOrphan, f.orphan)) return false
  if (!triMatch(e.unlinkedVenue, f.unlinked)) return false
  return true
}
const isActive = (f: FilterState) =>
  f.truck.trim() !== '' || f.venue.trim() !== '' || f.dateFrom !== '' || f.dateTo !== '' ||
  f.source !== 'any' || f.orphan !== 'any' || f.unlinked !== 'any'

// fmtDate / hhmm now come from EventRowCells — one definition, both tables.

export default function DiscoveryEventsPanel() {
  const [events, setEvents] = useState<DiscoveryEvent[]>([])
  const [scope, setScope] = useState<'future' | 'all'>('future')
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterState>(EMPTY)
  const [toast, setToast] = useState<string | null>(null)
  const [heldOrder, setHeldOrder] = useState<string[] | null>(null)
  // 🔴 THE SERVER'S today, NOT THE BROWSER'S. The GET already computes it (`new Date().toISOString()`
  // server-side) and returns it; the past/future warning is chosen from THIS against the row's stored
  // event_date. A client clock that is wrong, or a browser in a timezone a day ahead, must not be what
  // decides whether the operator is told the row can come back. Null until the first load lands.
  const [serverToday, setServerToday] = useState<string | null>(null)
  // The row awaiting confirmation. Held here, not in the row, so the dialog outlives the row's hover
  // state and so only one can ever be open.
  const [pendingDelete, setPendingDelete] = useState<DiscoveryEvent | null>(null)

  const load = useCallback(async (s: 'future' | 'all') => {
    setLoading(true); setError(null)
    try {
      const h = await nativeAuthHeader()
      const res = await fetch(`/api/admin/discovery-events?scope=${s}`, { headers: h, credentials: 'same-origin' })
      if (res.status === 404 || res.status === 401) { setDenied(true); setLoading(false); return }
      if (!res.ok) { setError(`Could not load (${res.status})`); setLoading(false); return }
      const data = await res.json()
      setEvents(data.events || [])
      setServerToday(typeof data.today === 'string' ? data.today : null)
    } catch { setError('Could not load') }
    setLoading(false)
  }, [])
  useEffect(() => { load(scope) }, [load, scope])

  // 🔴 SAME SINGLE WRITER FOR EVERY EDITABLE COLUMN — one action on one route. No optimistic write before
  // the response: a failed amend must not look like a success.
  const patchEvent = useCallback(async (id: string, patch: Record<string, unknown>) => {
    try {
      const h = await nativeAuthHeader()
      // 🔴 THE SHARED WRITER — the SAME request the Schedule popup sends, so the two callers of
      // `update_event` cannot drift in body shape or headers.
      const res = await postEventUpdate(h, id, patch)
      if (!res.ok) { setToast('Save failed — reloading'); load(scope); return }
      setEvents(es => es.map(e => e.id === id ? { ...e, ...patch } as DiscoveryEvent : e))
      setToast('Saved')
      setTimeout(() => setToast(null), 1500)
    } catch { setToast('Save failed — reloading'); load(scope) }
  }, [load, scope])

  // 🔴 DELETE — AND THE ROW ONLY LEAVES THE SCREEN IF THE SERVER SAYS IT LEFT THE DATABASE.
  // The route returns `deletedCount` from `.delete().select()`. Anything that is not a 2xx with a count
  // of at least 1 THROWS, which leaves the dialog open showing the server's sentence and leaves the row
  // in place. This is the whole guard against the failure this table is most likely to have: dropping a
  // row from local state after a write that never happened looks exactly like success until a reload.
  const deleteEvent = useCallback(async (id: string) => {
    const h = await nativeAuthHeader()
    const res = await fetch(`/api/admin/discovery-events?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: h,
      credentials: 'same-origin',
    })
    let payload: any = null
    try { payload = await res.json() } catch { /* a body-less failure is still a failure */ }
    if (!res.ok) throw new Error(payload?.error || `Delete failed (${res.status})`)
    if (!payload?.deletedCount) throw new Error('The server did not confirm a row was deleted.')
    // 🔴 THE COUNTS ARE NOT UPDATED SEPARATELY, AND THAT IS THE POINT. `events.length`, `orphanCount`
    // and `unlinkedCount` are all useMemo over THIS array, so removing the row here is the single edit
    // that moves the list and all three counts together. A second counter would be a second source of
    // truth and could disagree with the list.
    setEvents(es => es.filter(e => e.id !== id))
    setToast('Event deleted')
    setTimeout(() => setToast(null), 2000)
  }, [])

  // Same freeze the outreach table uses: while an inline box has focus, the row set and order are pinned
  // so nothing can move or vanish under the cursor mid-edit.
  const holdList = useCallback((hold: boolean) => {
    setHeldOrder(cur => hold ? (cur ?? null) : null)
  }, [])

  const sources = useMemo(
    () => [...new Set(events.map(e => e.source).filter(Boolean) as string[])].sort(),
    [events])

  const computed = useMemo(() => {
    const rows = events.filter(e => matches(e, filter))
    // Soonest first — the default the brief asks for; stable tiebreak on id.
    // 🔴 date, then START TIME, then id — the shared comparator, so this tab and the Schedule
    // popup order identically. Blank times sort last within their day.
    return [...rows].sort(byDateThenTime)
  }, [events, filter])

  const visible = useMemo(() => {
    if (!heldOrder) return computed
    const byId = new Map(events.map(e => [e.id, e]))
    return heldOrder.map(id => byId.get(id)).filter(Boolean) as DiscoveryEvent[]
  }, [computed, heldOrder, events])
  useEffect(() => { if (heldOrder === null) return; }, [heldOrder])

  const orphanCount = useMemo(() => events.filter(e => e.isOrphan).length, [events])
  const unlinkedCount = useMemo(() => events.filter(e => e.unlinkedVenue).length, [events])

  if (denied) return <div className="text-slate-900 p-6"><p className="text-sm text-slate-500">/api/admin/discovery-events refused this session.</p></div>

  const selCls = 'text-xs border rounded-lg px-2 py-1 bg-white'
  const labCls = 'text-[10px] uppercase tracking-wide font-bold text-slate-400'
  const setF = <K extends keyof FilterState>(k: K, v: FilterState[K]) => setFilter(f => ({ ...f, [k]: v }))

  return (
    <div className="text-slate-900">
      <div className="max-w-[1800px] mx-auto">
        <div className="flex items-baseline justify-between gap-4 mb-2">
          <p className="text-sm text-slate-500">
            {isActive(filter)
              ? <><span className="font-semibold text-slate-700">{visible.length}</span> of {events.length} events</>
              : <>{events.length} events</>}
            {/* (4) both derived counts against the total, the way the outreach tab shows n of N */}
            <span className="ml-3 text-amber-700">{orphanCount} orphan</span>
            <span className="ml-3 text-slate-500">{unlinkedCount} with no venue</span>
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => setScope('future')}
              className={`text-xs font-semibold px-2 py-1 rounded-lg border ${scope === 'future' ? 'border-orange-400 text-orange-700 bg-orange-50' : 'border-slate-200 text-slate-600'}`}>Future</button>
            <button onClick={() => setScope('all')}
              className={`text-xs font-semibold px-2 py-1 rounded-lg border ${scope === 'all' ? 'border-orange-400 text-orange-700 bg-orange-50' : 'border-slate-200 text-slate-600'}`}>All dates</button>
          </div>
        </div>

        {/* ⚠️ THE ONE THING THAT MUST BE SAID ON THIS SCREEN. Both writers upsert on
            (event_date, truck_name, venue_name) with DO UPDATE, so an amendment to a row the scraper still
            produces does not last: editing a NAME changes the row's identity and the next run re-inserts
            the original alongside it; editing anything else is overwritten by the next run. Corrections
            stick on rows the scraper no longer emits — past events, and trucks off the site list. */}
        {/* 🔴 MOVED to EventRowCells so the Schedule popup shows the SAME sentence. Wording unchanged. */}
        <UpsertWarning />

        {/* FILTER BAR — mirrors the column order above; flag filters map to the Flags column and come last */}
        <div className="mb-3 flex flex-wrap items-end gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
          <label className="flex flex-col gap-0.5"><span className={labCls}>Truck</span>
            <input type="search" value={filter.truck} onChange={e => setF('truck', e.target.value)} placeholder="Search truck…"
              className={`w-44 ${selCls} ${filter.truck.trim() ? 'border-orange-400 text-orange-700 font-semibold' : 'border-slate-200'}`} /></label>
          <label className="flex flex-col gap-0.5"><span className={labCls}>Date from</span>
            <input type="date" value={filter.dateFrom} onChange={e => setF('dateFrom', e.target.value)}
              className={`${selCls} ${filter.dateFrom ? 'border-orange-400' : 'border-slate-200'}`} /></label>
          <label className="flex flex-col gap-0.5"><span className={labCls}>Date to</span>
            <input type="date" value={filter.dateTo} onChange={e => setF('dateTo', e.target.value)}
              className={`${selCls} ${filter.dateTo ? 'border-orange-400' : 'border-slate-200'}`} /></label>
          <label className="flex flex-col gap-0.5"><span className={labCls}>Venue</span>
            <input type="search" value={filter.venue} onChange={e => setF('venue', e.target.value)} placeholder="Search venue…"
              className={`w-44 ${selCls} ${filter.venue.trim() ? 'border-orange-400 text-orange-700 font-semibold' : 'border-slate-200'}`} /></label>
          <label className="flex flex-col gap-0.5"><span className={labCls}>Source</span>
            <select value={filter.source} onChange={e => setF('source', e.target.value)}
              className={`max-w-[220px] ${selCls} ${filter.source !== 'any' ? 'border-orange-400 text-orange-700 font-semibold' : 'border-slate-200'}`}>
              <option value="any">Any</option>
              {sources.map(s => <option key={s} value={s}>{s.length > 40 ? s.slice(0, 40) + '…' : s}</option>)}
            </select></label>
          <label className="flex flex-col gap-0.5"><span className={labCls}>Orphan</span>
            <select value={filter.orphan} onChange={e => setF('orphan', e.target.value as TriFilter)}
              title="ORPHAN = truck_name matches no discovery_trucks row by name or alias, using the scraper's own matcher."
              className={`${selCls} ${filter.orphan !== 'any' ? 'border-orange-400 text-orange-700 font-semibold' : 'border-slate-200'}`}>
              <option value="any">Any</option><option value="yes">Orphans only</option><option value="no">Matched only</option>
            </select></label>
          <label className="flex flex-col gap-0.5"><span className={labCls}>Venue link</span>
            <select value={filter.unlinked} onChange={e => setF('unlinked', e.target.value as TriFilter)}
              title="venue_id IS NULL — a known open item, not something this tool fixes."
              className={`${selCls} ${filter.unlinked !== 'any' ? 'border-orange-400 text-orange-700 font-semibold' : 'border-slate-200'}`}>
              <option value="any">Any</option><option value="yes">No venue only</option><option value="no">Linked only</option>
            </select></label>
          {isActive(filter) && (
            <button onClick={() => setFilter(EMPTY)}
              className="ml-auto text-xs font-semibold text-orange-600 hover:underline px-2 py-1.5 rounded focus:outline-none focus:ring-2 focus:ring-orange-400">Clear all</button>
          )}
        </div>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        {loading && <p className="text-sm text-slate-400 mb-3">Loading…</p>}

        <div className="overflow-auto rounded-xl border border-slate-200 bg-white max-h-[calc(100vh-14rem)]">
          <table className="table-fixed text-sm w-full" style={{ minWidth: '1116px' }}>
            <colgroup>{COLUMNS.map(c => <col key={c.key} style={{ width: c.width }} />)}</colgroup>
            <thead className="bg-slate-100 text-slate-600 text-xs uppercase tracking-wide sticky top-0 z-10">
              <tr>{COLUMNS.map(c => (
                <th key={c.key} className="px-2 py-2 text-center" title={c.title}>
                  <span className="inline-flex items-center justify-center font-bold">{c.label}</span>
                </th>))}
              </tr>
            </thead>
            <tbody>
              {visible.map(e => (
                <tr key={e.id} className={`border-t border-slate-100 ${e.isOrphan ? 'bg-amber-50/40' : ''}`}>
                  <EventRowCells e={e} onCommit={patchEvent} onHold={holdList} />
                  {/* 🔴 NOTHING DELETES FROM HERE. This only OPENS the dialog; the dialog's own confirm is
                      the single caller of deleteEvent. There is no onClick that deletes, and no modifier
                      key or shift-click shortcut that skips the confirmation. */}
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
              {!loading && visible.length === 0 && (
                <tr><td colSpan={COLUMNS.length} className="px-3 py-8 text-center text-slate-400">
                  {isActive(filter) ? 'No events match these filters.' : 'No events.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {/* 🔴 THE WARNING DIFFERS BY DATE, AND THAT IS THE POINT OF THE CONTROL.
          `isFuture` compares the row's STORED event_date against the SERVER's today (from the GET), not
          against the browser's clock. If the server date has not arrived we say so and warn as though the
          row were future-dated — the cautious side, because the harm of a silent overnight resurrection is
          worse than the harm of an over-warning. */}
      {pendingDelete && (() => {
        const d = pendingDelete
        const known = serverToday != null
        const isFuture = known ? (d.event_date ?? '') >= serverToday! : true
        const when = fmtDate(d.event_date) ?? d.event_date ?? 'an unknown date'
        return (
          <ConfirmDeleteDialog
            title={`Delete ${d.truck_name || 'this event'} on ${when}?`}
            confirmLabel="Delete event"
            onCancel={() => setPendingDelete(null)}
            onConfirm={async () => { await deleteEvent(d.id); setPendingDelete(null) }}
          >
            <p className="text-sm text-slate-600 mt-2">
              <span className="font-semibold text-slate-800">{d.truck_name || '(no truck name)'}</span>
              {' at '}
              <span className="font-semibold text-slate-800">{d.venue_name || '(no venue)'}</span>
              {' on '}
              <span className="font-semibold text-slate-800">{when}</span>.
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
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg z-[60]">{toast}</div>
      )}
    </div>
  )
}
