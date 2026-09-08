'use client'

// app/admin/outreach/page.tsx
// Outreach tracking console (manual V12.1 outreach section). A CLIENT page that reads and writes through
// /api/admin/outreach, which is gated by the canonical verifyAdmin — the SAME protection pattern the other
// admin surfaces use (app/admin/page.tsx bootstraps against a verifyAdmin route; the gate lives on the
// route handler, never on a layout). This page holds NO gate of its own beyond deferring to that route:
// a non-admin GET returns 404 and the page shows "denied".
//
// 🔴 THE ENUMS AND THE NEXT-ACTION MATH COME FROM lib/outreach.ts, imported by BOTH this page and the
// route, so neither the tables' missing CHECK constraints nor a second copy of the interval rule can drift.

import { useEffect, useMemo, useState, useCallback, memo } from 'react'
import { nativeAuthHeader } from '@/lib/native/session'
import { phoneWhatsApp } from '@/lib/whatsapp-hint'   // pure — used only to build the wa.me link
import {
  OUTREACH_STAGES, CONTACT_CHANNELS, CONTACT_DIRECTIONS, CONTACT_KINDS,
  type OutreachStage,
  isOverdue,
  isHatchesUp,
} from '@/lib/outreach'

type Contact = {
  id: string; contacted_at: string; channel: string | null; direction: string | null
  kind: string | null; message: string | null
}
type Prospect = {
  id: string; discovery_truck_id: string; name: string
  logo_url: string | null; contact_name: string | null
  do_not_contact: boolean | null; entity_type: string | null
  contact_email: string | null; phone: string | null; mobile: string | null
  website: string | null; schedule_url: string | null
  order_url: string | null; excluded: boolean
  stage: OutreachStage; platform: string | null
  // 🔴 TRI-STATE: true = yes, false = checked-and-absent, null = nobody checked. NULL ≠ false.
  hu_map: boolean | null; hu_ordering: boolean | null
  whatsapp_number: string | null; whatsapp_confirmed: boolean | null
  next_action_at: string | null; notes: string | null
  futureEventCount: number; lastEventDate: string | null
  outboundCount: number; lastContactedAt: string | null
  whatsappHint: 'advertises' | 'mobile_not_advertised' | 'none'   // scraped, read-only — the live-button derivation
  contacts: Contact[]
}

// ── SORTABLE COLUMNS ─────────────────────────────────────────────────────────────────────────────────
// Each column exposes one comparable value (or null). 🔴 NULL ALWAYS SORTS LAST, in both directions — it
// is not "the smallest value", it is "no value", so it is pinned to the bottom regardless of asc/desc.
// The Hatches Up column sorts by the tick state; Schedule by upcoming-event count, with "no schedule at
// all" (no upcoming and no past) treated as null → last.
type SortKey = 'name' | 'phone' | 'whatsapp' | 'email' | 'hu_map' | 'hu_ordering' | 'schedule' | 'stage' | 'last_contacted' | 'next_action'
type SortDir = 'asc' | 'desc'
type SortState = { key: SortKey; dir: SortDir } | null
// 🔴 THE WHATSAPP COLUMN IS TICKABLE (step E): it reflects MY confirmation (whatsapp_confirmed). Two states
// only — ticked (true) or empty (NULL); the amber "?" suggested state was removed (item 1). Ticking → true,
// unticking → NULL (never false). 🔴 TWO HATCHES UP COLUMNS (step D): 'HU map' (hu_map) and 'HU ordering'
// (hu_ordering), each independently tickable and tri-state — tick → true, untick → NULL, and a distinct
// mark if false ever appears, so NULL (nobody checked) and false (checked, absent) never look alike. The
// single 'Hatches Up' platform tickbox is RETIRED; platform + its values stay in the DB, untouched.
const COLUMNS: { key: SortKey; label: string; title?: string }[] = [
  { key: 'name', label: 'Truck' },
  { key: 'phone', label: 'Phone', title: 'discovery_trucks.phone — read-only, not editable here' },
  { key: 'whatsapp', label: 'WhatsApp', title: 'MY confirmation the number works on WhatsApp (outreach_prospects.whatsapp_confirmed). Ticked = confirmed; empty = not confirmed. Untick clears to "not checked".' },
  { key: 'email', label: 'Email' },
  { key: 'hu_map', label: 'HU map', title: 'On the Hatches Up map / holds an HU ordering page. Tri-state: ✓ = yes, blank = not checked, ✗ = checked & absent. Untick clears to "not checked", never false.' },
  { key: 'hu_ordering', label: 'HU ordering', title: 'Seen USING Hatches Up online ordering. Tri-state: ✓ = yes, blank = not checked, ✗ = checked & absent. Untick clears to "not checked", never false.' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'stage', label: 'Stage' },
  { key: 'last_contacted', label: 'Last contacted' },
  { key: 'next_action', label: 'Next action' },
]
// A tri-state → sortable rank: true=2, false=1, null→null (sorts LAST both directions via compareBySort).
const triRank = (v: boolean | null): number | null => v === true ? 2 : v === false ? 1 : null
// number | string | null. isHatchesUp kept in the signature for the (unchanged) default priority sort.
function sortValue(p: Prospect, key: SortKey, _hatchesUp: (v: string | null) => boolean): number | string | null {
  switch (key) {
    case 'name': return p.name || null
    case 'phone': return p.phone || null
    // WhatsApp confirmation: confirmed (true) sorts first, not-confirmed (null) last. Two states only.
    case 'whatsapp':
      return p.whatsapp_confirmed === true ? 1 : null
    case 'email': return p.contact_email || null
    case 'hu_map': return triRank(p.hu_map)          // true > false > null(last)
    case 'hu_ordering': return triRank(p.hu_ordering)
    case 'schedule':
      return p.futureEventCount > 0 ? p.futureEventCount : (p.lastEventDate ? 0 : null)  // no schedule → null → last
    case 'stage': return p.stage || null
    case 'last_contacted': return p.lastContactedAt || null    // ISO/date string sorts lexically
    case 'next_action': return p.next_action_at || null        // 'YYYY-MM-DD' sorts lexically
  }
}
function compareBySort(a: Prospect, b: Prospect, s: SortState, hatchesUp: (v: string | null) => boolean): number {
  if (!s) return 0
  const va = sortValue(a, s.key, hatchesUp), vb = sortValue(b, s.key, hatchesUp)
  // Nulls last, ALWAYS — independent of direction.
  if (va == null && vb == null) return 0
  if (va == null) return 1
  if (vb == null) return -1
  let cmp: number
  if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb
  else cmp = String(va).localeCompare(String(vb))
  return s.dir === 'asc' ? cmp : -cmp
}

// item 2: DISPLAY labels for the stage. Stored values are unchanged; only not_interested reads
// differently ("no sale"). contacted and replied stay distinct (not collapsed).
const STATUS_LABEL: Record<string, string> = {
  not_contacted: 'not contacted',
  contacted: 'contacted',
  replied: 'replied',
  signed: 'signed',
  not_interested: 'no sale',
}
const stageLabel = (s: string) => STATUS_LABEL[s] ?? s.replace(/_/g, ' ')

const fmtDate = (d: string | null) => {
  if (!d) return null
  const dt = new Date(d.length <= 10 ? d + 'T00:00:00Z' : d)
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

// 🔴 LOGO RESOLUTION (the bug the diagnosis found): logo_url is EITHER an absolute storage URL (44 rows,
// public bucket, 200 OK) OR a relative '/logos/…' path (109 rows, served from public/logos). BOTH are
// valid <img src> values; the previous `https?://`-only guard skipped every relative one — i.e. most
// trucks. Accept http(s) and leading-slash paths; anything else → no logo (render nothing).
const logoSrc = (u: string | null): string | null =>
  u && (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('/')) ? u : null

export default function OutreachPage() {
  const [checking, setChecking] = useState(true)
  const [denied, setDenied] = useState(false)
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [error, setError] = useState<string | null>(null)
  // Whether each hand-applied column exists yet (probed by the route, not inferred from row values).
  const [hasContactName, setHasContactName] = useState(false)
  const [hasDoNotContact, setHasDoNotContact] = useState(false)
  // item 1: client-side name filter over the already-loaded rows — no server round trip, no paging.
  const [search, setSearch] = useState('')
  // "Open" shows a MODAL for one prospect (by id, so optimistic edits stay live), not an inline expansion.
  const [modalId, setModalId] = useState<string | null>(null)
  // A toast that can carry an optional Undo action (the page had only a string toast before — extended
  // minimally, no library, following the same bottom-centre toast it already rendered).
  const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null)
  // 🔴 null = the DEFAULT priority sort (ready-to-send list first). A user's explicit column choice lives
  // here and HOLDS across edits — an optimistic patch re-runs the memo but reads THIS state, so a chosen
  // sort is never silently reset to the default. See the report on what happens to the sort when a row is
  // edited.
  const [sort, setSort] = useState<SortState>(null)

  // Stable callbacks so React.memo'd rows don't all re-render on every edit (item 5 responsiveness).
  const showToast = useCallback((message: string, undo?: () => void) => {
    setToast({ message, undo })
    // Give an undo toast longer to act on than a plain one.
    setTimeout(() => setToast(null), undo ? 6000 : 3000)
  }, [])
  const openModal = useCallback((id: string) => setModalId(id), [])

  const load = useCallback(async () => {
    try {
      const h = await nativeAuthHeader()
      const res = await fetch('/api/admin/outreach', { headers: h, credentials: 'same-origin' })
      if (res.status === 404 || res.status === 401) { setDenied(true); setChecking(false); return }
      if (!res.ok) { setError(`Could not load (${res.status})`); setChecking(false); return }
      const data = await res.json()
      setProspects(data.prospects || [])
      setHasContactName(!!data.hasContactName)
      setHasDoNotContact(!!data.hasDoNotContact)
      setChecking(false)
    } catch {
      setError('Could not reach the server')
      setChecking(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Escape closes the modal (the backdrop still does NOT — no outside-click close). Belt-and-braces with
  // the always-visible Close button, since the modal can be tall.
  useEffect(() => {
    if (!modalId) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setModalId(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modalId])

  // ── SORT ───────────────────────────────────────────────────────────────────────────────────────────
  // ALL rows are shown, always — no filter, no paging. `excluded` is NOT surfaced on this page at all
  // (item 2); discovery_trucks.excluded is untouched and still gates the public site elsewhere. When
  // `sort` is null, the DEFAULT priority sort applies: Hatches Up trucks that have an email and are not yet
  // contacted, first. When the user picks a column, that column's asc/desc sort applies (nulls last).
  const visible = useMemo(() => {
    // item 1: filter by truck name over the already-loaded rows (client-side, no fetch).
    const q = search.trim().toLowerCase()
    const rows = q ? prospects.filter(p => p.name.toLowerCase().includes(q)) : prospects
    const rank = (p: Prospect) => {
      // 🔴 CASE-INSENSITIVE BACKSTOP (isHatchesUp) rather than `=== HATCHES_UP`: a value that somehow
      // escaped canonicalisation on save (e.g. seeded before this existed) still sorts to the top.
      const hatchesUp = isHatchesUp(p.platform)
      const hasEmail = !!p.contact_email
      const notContacted = p.stage === 'not_contacted'
      // Lower sorts first.
      if (hatchesUp && hasEmail && notContacted) return 0
      if (hatchesUp && hasEmail) return 1
      if (hasEmail && notContacted) return 2
      if (hasEmail) return 3
      return 4
    }
    return [...rows].sort((a, b) => {
      if (sort) {
        const c = compareBySort(a, b, sort, isHatchesUp)
        if (c !== 0) return c
        return a.name.localeCompare(b.name)   // stable tiebreak by name
      }
      const r = rank(a) - rank(b)
      if (r !== 0) return r
      return a.name.localeCompare(b.name)
    })
  }, [prospects, sort, search])

  // Click a header: none → asc → desc → back to default. The active column + direction show at a glance
  // via the ▲/▼ marker rendered on that header.
  const toggleSort = (key: SortKey) => {
    setSort(cur =>
      !cur || cur.key !== key ? { key, dir: 'asc' }
        : cur.dir === 'asc' ? { key, dir: 'desc' }
          : null)   // third click clears back to the default priority sort
  }

  const modalProspect = modalId ? prospects.find(p => p.id === modalId) ?? null : null

  // ── MUTATIONS ────────────────────────────────────────────────────────────────────────────────────
  const patchProspect = useCallback(async (id: string, patch: Record<string, unknown>) => {
    // optimistic
    setProspects(ps => ps.map(p => p.id === id ? { ...p, ...patch } as Prospect : p))
    try {
      const h = await nativeAuthHeader()
      const res = await fetch('/api/admin/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...h },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'update_prospect', id, ...patch }),
      })
      if (!res.ok) { showToast('Save failed — reloading'); load() }
    } catch { showToast('Save failed — reloading'); load() }
  }, [load, showToast])

  // Undo of a just-logged contact — deletes THAT row by id (never "the latest"; see item 4).
  const deleteContact = useCallback(async (contactId: string) => {
    try {
      const h = await nativeAuthHeader()
      const res = await fetch('/api/admin/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...h },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'delete_contact', contact_id: contactId }),
      })
      if (!res.ok) { showToast(`Undo failed (${res.status})`); return }
      showToast('Contact removed')
      await load()
    } catch { showToast('Undo failed') }
  }, [load, showToast])

  const logContact = useCallback(async (
    p: Prospect,
    fields: { channel: string; direction: string; kind: string; message: string },
  ) => {
    // 🔴 LOGGING WRITES A CONTACT ROW AND NOTHING ELSE — no next_action_at is suggested, computed or sent.
    // Every next-action date is set by hand via the date picker.
    try {
      const h = await nativeAuthHeader()
      const res = await fetch('/api/admin/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...h },
        credentials: 'same-origin',
        body: JSON.stringify({
          action: 'log_contact', prospect_id: p.id,
          channel: fields.channel, direction: fields.direction, kind: fields.kind,
          message: fields.message || null,
        }),
      })
      if (!res.ok) { showToast(`Log failed (${res.status})`); return }
      // 🔴 UNDO targets the id the route just returned — the specific row, not "the most recent".
      const { id: newId } = await res.json().catch(() => ({ id: null }))
      showToast('Logged', newId ? () => deleteContact(newId) : undefined)
      await load()
    } catch { showToast('Log failed') }
  }, [load, showToast, deleteContact])

  if (checking) return <div className="min-h-screen grid place-items-center text-slate-500 text-sm">Loading…</div>
  if (denied) return (
    <div className="min-h-screen grid place-items-center">
      <div className="text-center"><p className="font-bold text-slate-900 mb-1">Access denied</p>
        <p className="text-slate-500 text-sm">Admin only.</p></div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-xl font-black">Outreach</h1>
            {/* the truck count ALONE — no excluded figure; reflects the search filter when active. */}
            <p className="text-sm text-slate-500">
              {search.trim() ? `${visible.length} of ${prospects.length}` : prospects.length} trucks
            </p>
          </div>
          {/* item 1: search box — filters the loaded rows by name as you type. */}
          <input type="search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search trucks…"
            className="w-56 border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white" />
        </div>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        {/* item 5: NO PAGINATION — all rows render. Kept responsive by a single vertical scroll container
            (max-height + overflow-y-auto) with a STICKY header, so the browser paints one scroll region
            rather than the whole page growing; Row is React.memo'd with stable callbacks so a single-row
            edit re-renders only that row, not all 231. 231 rows sits well inside the DOM's comfort zone,
            so no virtualisation is needed (and paging is explicitly not reintroduced).
            item 4: `table-fixed` + an explicit <colgroup> — column widths come from the colgroup, NOT cell
            content, so they DO NOT reflow when rows reorder on sort. */}
        <div className="overflow-auto rounded-xl border border-slate-200 bg-white max-h-[calc(100vh-9rem)]">
          <table className="table-fixed text-sm w-full" style={{ minWidth: '1460px' }}>
            <colgroup>
              <col style={{ width: '210px' }} />{/* name */}
              <col style={{ width: '120px' }} />{/* phone */}
              <col style={{ width: '96px' }} />{/* whatsapp */}
              <col style={{ width: '230px' }} />{/* email */}
              <col style={{ width: '92px' }} />{/* hu_map */}
              <col style={{ width: '110px' }} />{/* hu_ordering */}
              <col style={{ width: '150px' }} />{/* schedule */}
              <col style={{ width: '130px' }} />{/* stage */}
              <col style={{ width: '120px' }} />{/* last_contacted */}
              <col style={{ width: '120px' }} />{/* next_action */}
              <col style={{ width: '82px' }} />{/* actions */}
            </colgroup>
            <thead className="bg-slate-100 text-slate-600 text-xs uppercase tracking-wide sticky top-0 z-10">
              <tr>
                {COLUMNS.map(col => {
                  const active = sort?.key === col.key
                  const centred = col.key === 'whatsapp' || col.key === 'hu_map' || col.key === 'hu_ordering'
                  return (
                    <th key={col.key} className={`px-3 py-2 ${centred ? 'text-center' : 'text-left'}`}>
                      <button onClick={() => toggleSort(col.key)} title={col.title}
                        className={`flex items-center gap-1 uppercase tracking-wide font-bold hover:text-slate-900 ${centred ? 'mx-auto' : ''} ${active ? 'text-orange-600' : ''}`}>
                        {col.label}
                        <span className="text-[10px] w-2">{active ? (sort!.dir === 'asc' ? '▲' : '▼') : ''}</span>
                      </button>
                    </th>
                  )
                })}
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(p => (
                <Row key={p.id} p={p} onOpen={openModal} onPatch={patchProspect} />
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={11} className="px-3 py-8 text-center text-slate-400">No prospects.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* item 6: the row-detail MODAL. Follows the project's shared-modal convention (RejectOrderModal,
          EventCancelModal, …): conditionally mounted, backdrop `fixed inset-0 bg-black/50 z-50 flex …`
          with NO onClick, so an OUTSIDE CLICK DOES NOT CLOSE it — dismissal is the explicit Close button
          only. No in-component focus-trap or scroll-lock, matching those modals. */}
      {modalProspect && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4">
          {/* Panel scrolls INTERNALLY with a PINNED header, so the Close button is always reachable even
              when the content is tall (the "couldn't get out" fix). Backdrop still has NO onClick — no
              outside-click close; Escape also closes. */}
          <div className="bg-white rounded-2xl w-full max-w-3xl my-8 flex flex-col max-h-[calc(100vh-4rem)]">
            {/* header: logo + truck name + STATUS. Pinned (does not scroll). Status = the same stage
                select as the row, options unchanged. */}
            <div className="flex items-start justify-between gap-3 p-6 pb-3 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                {logoSrc(modalProspect.logo_url) && (
                  <img src={logoSrc(modalProspect.logo_url)!} alt=""
                    onError={e => { e.currentTarget.style.display = 'none' }}
                    className="w-10 h-10 rounded-lg object-cover flex-shrink-0 bg-slate-50" />
                )}
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-slate-900 truncate">{modalProspect.name}</h3>
                  <select value={modalProspect.stage} onChange={e => patchProspect(modalProspect.id, { stage: e.target.value })}
                    className="mt-1 text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white">
                    {OUTREACH_STAGES.map(s => <option key={s} value={s}>{stageLabel(s)}</option>)}
                  </select>
                </div>
              </div>
              <button onClick={() => setModalId(null)}
                className="flex-shrink-0 text-sm font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50" aria-label="Close">✕ Close</button>
            </div>

            {/* scrollable body */}
            <div className="overflow-y-auto p-6 pt-4 flex flex-col gap-4">
              <Detail p={modalProspect} hasContactName={hasContactName}
                onPatch={patchProspect} onLog={logContact} />
              {/* do-not-contact — at the BOTTOM (per your note). */}
              <DoNotContactToggle p={modalProspect} enabled={hasDoNotContact} onPatch={patchProspect} />
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg z-[60] flex items-center gap-3">
          <span>{toast.message}</span>
          {toast.undo && (
            <button onClick={() => { toast.undo!(); setToast(null) }}
              className="text-orange-300 font-bold hover:text-orange-200 underline">Undo</button>
          )}
        </div>
      )}
    </div>
  )
}

// ── TRI-STATE BOX (step D) — hu_map / hu_ordering, a real three-state control over a nullable boolean ──
// 🔴 THREE STATES, NEVER COLLAPSED. true → a filled ✓ box (checked). null → an EMPTY box ("not checked").
// false → a distinct ✗ mark, deliberately NOT the same as the empty box, so "nobody looked" (null) and
// "looked, absent" (false) read apart at a glance. 🔴 CLICKING NEVER WRITES false: ticking writes true,
// unticking writes null. false can arrive only from the data (this backfill never sets it); a click on a
// false box promotes it to true, a second click clears it to null — it is never re-written as false here.
function TriStateBox({ value, onSet, label }: {
  value: boolean | null
  onSet: (v: boolean | null) => void
  label: string
}) {
  const isTrue = value === true
  const isFalse = value === false
  const title = isTrue ? `${label}: yes` : isFalse ? `${label}: checked, absent (false)` : `${label}: not checked`
  return (
    <label className="inline-flex items-center gap-1.5 cursor-pointer" title={title}>
      <input type="checkbox" checked={isTrue} className="w-4 h-4 accent-orange-600"
        // ticked → true; unticked → null (NEVER false)
        onChange={e => onSet(e.target.checked ? true : null)} />
      {isFalse && <span className="text-[11px] font-semibold text-rose-600" title={`${label}: checked, absent`}>✗</span>}
    </label>
  )
}

// ── WHATSAPP BOX (step E, item 1) — MY confirmation, TWO states only ──────────────────────────────────
// 🔴 WRITES outreach_prospects.whatsapp_confirmed ONLY — never a new field, never the scraped hint. The
// former amber "?" suggested state is REMOVED (item 1): rows the scraper marked 'advertises' were set
// true in a one-off backfill, so a scraped WhatsApp now shows as a plain tick. Two states:
//   • ticked (whatsapp_confirmed === true) · empty (NULL, not confirmed).
// Ticking → true. Unticking → null (the column is nullable). No false is ever written from here.
function WhatsAppBox({ p, onPatch }: {
  p: Prospect
  onPatch: (id: string, patch: Record<string, unknown>) => void
}) {
  const confirmed = p.whatsapp_confirmed === true
  return (
    <label className="inline-flex items-center justify-center cursor-pointer"
      title={confirmed ? 'WhatsApp confirmed' : 'WhatsApp: not confirmed'}>
      <input type="checkbox" checked={confirmed} className="w-4 h-4 accent-orange-600"
        onChange={e => onPatch(p.id, { whatsapp_confirmed: e.target.checked ? true : null })} />
    </label>
  )
}

// ── DO-NOT-CONTACT (item 5) — prominent toggle over the nullable do_not_contact column ───────────────
// Checked → true; unchecked → NULL (never false), same rule as the other tri-state fields. Disabled with
// a note until the column is applied (the route reports `enabled`), so it is never edited into the void.
function DoNotContactToggle({ p, enabled, onPatch }: {
  p: Prospect
  enabled: boolean
  onPatch: (id: string, patch: Record<string, unknown>) => void
}) {
  const on = p.do_not_contact === true
  return (
    <label className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold cursor-pointer border
      ${on ? 'bg-red-50 border-red-200 text-red-700' : 'bg-slate-50 border-slate-200 text-slate-600'}
      ${enabled ? '' : 'opacity-60 cursor-not-allowed'}`}
      title={enabled ? undefined : 'Apply the do_not_contact migration to enable'}>
      <input type="checkbox" checked={on} disabled={!enabled} className="w-4 h-4 accent-red-600"
        onChange={e => onPatch(p.id, { do_not_contact: e.target.checked ? true : null })} />
      🚫 Do not contact{on ? ' — set' : ''}
    </label>
  )
}

// ── One prospect row (opens the detail MODAL via onOpen) ─────────────────────────────────────────────
// 🔴 React.memo (item 5): with stable onOpen/onPatch, a row re-renders only when its OWN `p` changes, so a
// single-cell edit does not re-render all 231 rows. Truncation (`truncate`) plus the fixed <colgroup>
// keeps every cell within its column width, so content never widens a column on sort (item 4).
const Row = memo(function Row({ p, onOpen, onPatch }: {
  p: Prospect
  onOpen: (id: string) => void
  onPatch: (id: string, patch: Record<string, unknown>) => void
}) {
  const overdue = isOverdue(p.next_action_at)
  const sched = p.futureEventCount > 0
    ? `${p.futureEventCount} upcoming${p.lastEventDate ? ` · last ${fmtDate(p.lastEventDate)}` : ''}`
    : p.lastEventDate ? `none upcoming · last ${fmtDate(p.lastEventDate)}` : 'no schedule'

  return (
    <tr className="border-t border-slate-100">
      {/* NO excluded chip. item 5: a do-not-contact flag shows clearly on the row when set. */}
      <td className="px-3 py-2 font-medium truncate" title={p.do_not_contact === true ? `Do not contact — ${p.name}` : p.name}>
        {p.do_not_contact === true && (
          <span className="mr-1 align-middle text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-700" title="Do not contact">🚫 DNC</span>
        )}
        {p.name}
      </td>
      {/* discovery_trucks.phone, READ-ONLY (not editable here, not `mobile`) */}
      <td className="px-3 py-2 text-slate-600 truncate">{p.phone || <span className="text-slate-300">—</span>}</td>
      {/* item 3: checkbox centred. step E: reflects MY confirmation (whatsapp_confirmed). */}
      <td className="px-3 py-2 text-center"><WhatsAppBox p={p} onPatch={onPatch} /></td>
      <td className="px-3 py-2 text-slate-600 truncate" title={p.contact_email ?? undefined}>{p.contact_email || <span className="text-slate-300">—</span>}</td>
      {/* item 3: checkboxes centred. step D: two independent tri-state columns. */}
      <td className="px-3 py-2 text-center"><TriStateBox value={p.hu_map} onSet={v => onPatch(p.id, { hu_map: v })} label="HU map" /></td>
      <td className="px-3 py-2 text-center"><TriStateBox value={p.hu_ordering} onSet={v => onPatch(p.id, { hu_ordering: v })} label="HU ordering" /></td>
      <td className="px-3 py-2 text-slate-600 truncate" title={sched}>{sched}</td>
      <td className="px-3 py-2">
        <select value={p.stage} onChange={e => onPatch(p.id, { stage: e.target.value })}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white max-w-full">
          {OUTREACH_STAGES.map(s => <option key={s} value={s}>{stageLabel(s)}</option>)}
        </select>
      </td>
      <td className="px-3 py-2 text-slate-600 truncate">{fmtDate(p.lastContactedAt) || <span className="text-slate-300">—</span>}</td>
      <td className="px-3 py-2 truncate">
        {p.next_action_at
          ? <span className={overdue ? 'text-red-600 font-semibold' : 'text-slate-600'}>{fmtDate(p.next_action_at)}{overdue && ' ⚠'}</span>
          : <span className="text-slate-300">—</span>}
      </td>
      <td className="px-3 py-2 text-right">
        <button onClick={() => onOpen(p.id)} className="text-orange-600 text-xs font-semibold hover:underline">Open</button>
      </td>
    </tr>
  )
})

const linkCls = 'text-xs px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-orange-600 font-semibold whitespace-nowrap'

function Detail({ p, hasContactName, onPatch, onLog }: {
  p: Prospect
  hasContactName: boolean
  onPatch: (id: string, patch: Record<string, unknown>) => void
  onLog: (p: Prospect, f: { channel: string; direction: string; kind: string; message: string }) => void | Promise<void>
}) {
  const [contactName, setContactName] = useState(p.contact_name ?? '')
  const [email, setEmail] = useState(p.contact_email ?? '')
  const [phone, setPhone] = useState(p.phone ?? '')
  const [notes, setNotes] = useState(p.notes ?? '')
  const [nextAt, setNextAt] = useState(p.next_action_at ?? '')

  const [channel, setChannel] = useState<string>('email')
  const [direction, setDirection] = useState<string>('outbound')
  const [kind, setKind] = useState<string>('first_contact')
  const [message, setMessage] = useState('')
  // 🔴 item 4: double-submit guard. True from click until the write resolves; the button is disabled the
  // whole time, closing the click→response window that let a second submit through.
  const [logging, setLogging] = useState(false)

  const fieldCls = 'w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm'
  const sectionCls = 'text-xs font-bold uppercase text-slate-500'

  // wa.me number derives from the phone alone (same normalisation as the live button); shown only when I
  // have confirmed WhatsApp works. accepted_methods is irrelevant to the number itself, so pass null.
  const waPhone = phoneWhatsApp(p.phone, null).waPhone

  const submitLog = async () => {
    if (logging) return
    setLogging(true)
    try { await onLog(p, { channel, direction, kind, message }); setMessage('') }
    finally { setLogging(false) }
  }

  return (
    <div className="space-y-6">
      {/* CONTACT — name, entity type, email, phone (editable, WA tick + quick links), links, event count. */}
      <div className="space-y-2">
        <p className={sectionCls}>Contact</p>
        <label className="block text-xs text-slate-500">Contact name
          <input className={fieldCls} value={contactName} disabled={!hasContactName}
            placeholder={hasContactName ? 'Contact person' : 'Apply the contact_name migration to enable'}
            onChange={e => setContactName(e.target.value)}
            onBlur={() => hasContactName && contactName !== (p.contact_name ?? '') && onPatch(p.id, { contact_name: contactName })} />
        </label>
        <label className="block text-xs text-slate-500">Email
          <div className="flex items-center gap-1">
            <input className={fieldCls} value={email} onChange={e => setEmail(e.target.value)}
              onBlur={() => email !== (p.contact_email ?? '') && onPatch(p.id, { contact_email: email })} />
            {p.contact_email && <a href={`mailto:${p.contact_email}`} className={linkCls}>Email</a>}
          </div>
        </label>
        {/* item 3: phone is EDITABLE now (writes discovery_trucks.phone). The WhatsApp tick sits beside it,
            plus tel: and wa.me quick links. The separate WhatsApp-number field and "use phone" are gone. */}
        <label className="block text-xs text-slate-500">Phone
          <div className="flex items-center gap-2">
            <input className={fieldCls} value={phone} onChange={e => setPhone(e.target.value)}
              onBlur={() => phone !== (p.phone ?? '') && onPatch(p.id, { phone })} />
            <span className="flex items-center gap-1 text-xs text-slate-500 whitespace-nowrap"><WhatsAppBox p={p} onPatch={onPatch} /> WhatsApp</span>
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {p.phone && <a href={`tel:${p.phone}`} className={linkCls}>Call</a>}
            {p.whatsapp_confirmed === true && waPhone && <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noreferrer" className={linkCls}>WhatsApp</a>}
          </div>
        </label>
        {/* item 5: website + schedule as clickable links (only when present). */}
        {(p.website || p.schedule_url) && (
          <div className="flex flex-wrap gap-1">
            {p.website && <a href={p.website} target="_blank" rel="noreferrer" className={linkCls}>Website ↗</a>}
            {p.schedule_url && <a href={p.schedule_url} target="_blank" rel="noreferrer" className={linkCls}>Schedule ↗</a>}
          </div>
        )}
        {/* item 5: upcoming-event count (the row shows a schedule summary; the modal now shows the count). */}
        <p className="text-xs text-slate-500">
          Upcoming events: <span className="font-semibold text-slate-700">{p.futureEventCount}</span>
          {p.lastEventDate ? <span className="text-slate-400"> · last {fmtDate(p.lastEventDate)}</span> : null}
        </p>
        {/* item 5: provenance — there is NO field recording where/when a contact detail came from, so this
            says so rather than inventing it. (discovery_trucks has only row created_at/updated_at, which is
            not contact-detail provenance.) */}
        <p className="text-[11px] text-slate-400">Contact source/date: not recorded (no such field exists).</p>
      </div>

      {/* c. LOG A CONTACT */}
      <div className="space-y-2">
        <p className={sectionCls}>Log a contact</p>
        <div className="grid grid-cols-3 gap-2">
          <select className={fieldCls} value={channel} onChange={e => setChannel(e.target.value)}>
            {CONTACT_CHANNELS.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
          </select>
          <select className={fieldCls} value={direction} onChange={e => setDirection(e.target.value)}>
            {CONTACT_DIRECTIONS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select className={fieldCls} value={kind} onChange={e => setKind(e.target.value)}>
            {CONTACT_KINDS.map(k => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <textarea className={fieldCls} rows={2} placeholder="Message body (optional)"
          value={message} onChange={e => setMessage(e.target.value)} />
        <button onClick={submitLog} disabled={logging}
          className="w-full bg-orange-600 hover:bg-orange-700 text-white text-sm font-bold py-1.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">
          {logging ? 'Logging…' : 'Log contact'}
        </button>
      </div>

      {/* d. NEXT ACTION — after logging, since logging is what suggests the date. */}
      <div className="space-y-2">
        <p className={sectionCls}>Next action</p>
        <input type="date" className={fieldCls} value={nextAt}
          onChange={e => setNextAt(e.target.value)}
          onBlur={() => nextAt !== (p.next_action_at ?? '') && onPatch(p.id, { next_action_at: nextAt || null })} />
        <div className="flex flex-wrap gap-2">
          {/* item 3: "Park until February" removed. Clear + the date picker kept. */}
          <button onClick={() => { setNextAt(''); onPatch(p.id, { next_action_at: null }) }}
            className="text-xs px-2 py-1 rounded-lg border border-slate-200 hover:bg-white">Clear</button>
        </div>
      </div>

      {/* e. NOTES */}
      <div className="space-y-2">
        <p className={sectionCls}>Notes</p>
        <textarea className={fieldCls} rows={3} value={notes} onChange={e => setNotes(e.target.value)}
          onBlur={() => notes !== (p.notes ?? '') && onPatch(p.id, { notes })} />
      </div>

      {/* f. CONTACT HISTORY — most recent first (already ordered by the route). */}
      <div className="space-y-2">
        <p className={sectionCls}>Contact history</p>
        <div className="max-h-48 overflow-y-auto space-y-1">
          {p.contacts.length === 0 && <p className="text-xs text-slate-400">No contacts yet.</p>}
          {p.contacts.map(c => (
            <div key={c.id} className="text-xs border border-slate-100 rounded-lg px-2 py-1 bg-white">
              <div className="flex justify-between text-slate-500">
                <span>{fmtDate(c.contacted_at)} · {c.direction} · {c.channel} · {c.kind}</span>
              </div>
              {c.message && <p className="text-slate-700 mt-0.5 whitespace-pre-wrap">{c.message}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
