'use client'

// components/admin/OutreachPanel.tsx
// Outreach tracking console (manual V12.1 outreach section). Reads and writes through /api/admin/outreach,
// which is gated by the canonical verifyAdmin — the SAME protection pattern the other admin surfaces use
// (app/admin/page.tsx bootstraps against a verifyAdmin route; the gate lives on the route handler, never on
// a layout). This panel holds NO gate of its own beyond deferring to that route: a non-admin GET returns
// 404 and the panel says so.
//
// 🔴 THIS WAS A PAGE (app/admin/outreach/page.tsx) AND IS NOW A TAB on /admin. What changed and what did
// not:
//   • It is mounted by app/admin/page.tsx when adminTab === 'outreach', so IT FETCHES ON FIRST SELECTION,
//     not on every /admin visit. Switching tabs unmounts it and re-selecting refetches — 231 rows in one
//     request, which is why that is acceptable rather than worth caching.
//   • It no longer paints a screen: no min-h-screen, no background, no <h1> (the tab bar names it) and no
//     back link (there is nowhere to go back TO now). The count line and the search box stay.
//   • 🔴 IT KEEPS ITS OWN WIDTH. The admin body container is max-w-6xl (1152px) and this table's colgroup
//     carries minWidth:1510px, so rendering it inside that container would put the last columns off-screen
//     on every monitor — the exact arithmetic fault that container note below describes. app/admin/page.tsx
//     renders this tab OUTSIDE the max-w-6xl wrapper, in a max-w-[1800px] one. Do not move it back in.
//   • The route still exists at app/admin/outreach/page.tsx as a REDIRECT to /admin?tab=outreach, so old
//     links and bookmarks keep working.
//
// 🔴 THE ENUMS AND THE NEXT-ACTION MATH COME FROM lib/outreach.ts, imported by BOTH this page and the
// route, so neither the tables' missing CHECK constraints nor a second copy of the interval rule can drift.

import { useEffect, useMemo, useState, useCallback, useRef, memo, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'   // the contact popout — same portal-to-<body> rule as ScheduleEventsPopup
import { nativeAuthHeader } from '@/lib/native/session'
import InlineField from '@/components/admin/InlineField'   // MOVED here from this file; same component, one copy
import ConfirmDeleteDialog from '@/components/admin/ConfirmDeleteDialog'   // MOVED here too; the events table uses the same dialog
import ScheduleEventsPopup from '@/components/admin/ScheduleEventsPopup'
import ComposeWindow from '@/components/admin/ComposeWindow'
// Only the two GATING helpers are needed here now; the picker, the renderer, the footer and the
// copy action all live in ComposeWindow.
// 🔴 TEMPLATES COME FROM THE DATABASE NOW. This module holds the MECHANISM only — no message copy.
import { templatesFor, suggestTemplateId, contextFromProspect, type MessageTemplate } from '@/lib/outreach-template-render'
import { formatImageUrl } from '@/lib/image-utils'   // shared resolver — the SAME one /api/discovery/events uses
import { phoneWhatsApp } from '@/lib/whatsapp-hint'   // pure — used only to build the wa.me link
import {
  OUTREACH_STAGES, CONTACT_CHANNELS, CONTACT_DIRECTIONS,
  REPLY_KIND, kindsForDirection, defaultKindFor, kindOrder,
  findDuplicateContact, contactSignature, contactDay,
  kindLabel, channelLabel, directionLabel, followUpDateFor,
  type OutreachStage,
  isOverdue,
  isHatchesUp,
  toYMD,
} from '@/lib/outreach'
// 🔴 (1) THE FILTER PREDICATE LIVES OUTSIDE THIS COMPONENT — one pure function, testable with no React,
// no network and no admin session (which is not obtainable here at all). Adding a filter is one entry in
// EMPTY_OUTREACH_FILTER and one clause in matchesOutreachFilter. `scheduleState`/`hasSchedule` come from
// the same module so the merged Schedule CELL and the Schedule FILTER cannot drift apart.
import {
  matchesOutreachFilter, isFilterActive, scheduleState, hasSchedule,
  EMPTY_OUTREACH_FILTER,
  type OutreachFilterState,
} from '@/lib/outreach-filter'

type Contact = {
  id: string; contacted_at: string; channel: string | null; direction: string | null
  kind: string | null; message: string | null
}
type Prospect = {
  id: string; discovery_truck_id: string; name: string
  logo_url: string | null; photo_url: string | null; contact_name: string | null
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
  // 🔴 THE *NEXT* EVENT, not the last. Derived server-side in the same bulk read that builds
  // futureEventCount — no extra query, and none per row. Used by the conditional template lines.
  nextEventDate: string | null; nextEventVenue: string | null
  outboundCount: number; lastContactedAt: string | null
  whatsappHint: 'advertises' | 'mobile_not_advertised' | 'none'   // scraped, read-only — the live-button derivation
  contacts: Contact[]
}

// ── SORTABLE COLUMNS ─────────────────────────────────────────────────────────────────────────────────
// Each column exposes one comparable value (or null). 🔴 NULL ALWAYS SORTS LAST, in both directions — it
// is not "the smallest value", it is "no value", so it is pinned to the bottom regardless of asc/desc.
// The Hatches Up column sorts by the tick state; Schedule by upcoming-event count, with "no schedule at
// all" (no upcoming and no past) treated as null → last.
type SortKey = 'logo' | 'photo' | 'name' | 'phone' | 'whatsapp' | 'email' | 'hu_map' | 'hu_ordering' | 'schedule' | 'stage' | 'last_contacted' | 'next_action'
type SortDir = 'asc' | 'desc'
type SortState = { key: SortKey; dir: SortDir } | null
// 🔴 THE WHATSAPP COLUMN IS TICKABLE (step E): it reflects MY confirmation (whatsapp_confirmed). Two states
// only — ticked (true) or empty (NULL); the amber "?" suggested state was removed (item 1). Ticking → true,
// unticking → NULL (never false). 🔴 TWO HATCHES UP COLUMNS (step D): 'HU map' (hu_map) and 'HU ordering'
// (hu_ordering), each independently tickable and tri-state — tick → true, untick → NULL, and a distinct
// mark if false ever appears, so NULL (nobody checked) and false (checked, absent) never look alike. The
// single 'Hatches Up' platform tickbox is RETIRED; platform + its values stay in the DB, untouched.
const COLUMNS: { key: SortKey; label: string; title?: string }[] = [
  // 🔴 MEDIA FIRST. These are the two columns being filled in, so they lead; the filter bar follows this
  // array, so adding them here moves their filters to the front of the bar too.
  { key: 'logo', label: 'Logo', title: 'discovery_trucks.logo_url. Drop an image on an EMPTY slot to upload it. A slot showing a broken marker has a value that does not resolve — it is not a drop target, because replacing is out of scope.' },
  { key: 'photo', label: 'Photo', title: 'discovery_trucks.photo_url. Drop an image on an EMPTY slot to upload it.' },
  { key: 'name', label: 'Truck' },
  { key: 'phone', label: 'Phone', title: 'discovery_trucks.phone — read-only, not editable here' },
  { key: 'whatsapp', label: 'WhatsApp', title: 'MY confirmation the number works on WhatsApp (outreach_prospects.whatsapp_confirmed). Ticked = confirmed; empty = not confirmed. Untick clears to "not checked".' },
  { key: 'email', label: 'Email' },
  // ⚠️ ORDERING BEFORE MAP, at the operator's request: "seen USING online ordering" is the stronger
  // buying signal, so it reads first. The FILTER BAR follows this array, so swapping these two moves the
  // matching filters as well — that is the point of driving both from one declared order.
  { key: 'hu_ordering', label: 'HU ordering', title: 'Seen USING Hatches Up online ordering. Tri-state: ✓ = yes, blank = not checked, ✗ = checked & absent. Untick clears to "not checked", never false.' },
  { key: 'hu_map', label: 'HU map', title: 'On the Hatches Up map / holds an HU ordering page. Tri-state: ✓ = yes, blank = not checked, ✗ = checked & absent. Untick clears to "not checked", never false.' },
  { key: 'schedule', label: 'Schedule', title: 'Y (n) = we hold a schedule and n future events. Y (0) = we hold a schedule but NOTHING is booked ahead — a different prospect from N, which is no events known at all. Hover a cell for the last event date.' },
  { key: 'stage', label: 'Stage' },
  { key: 'last_contacted', label: 'Last contacted' },
  { key: 'next_action', label: 'Next action' },
]
// A tri-state → sortable rank: true=2, false=1, null→null (sorts LAST both directions via compareBySort).
const triRank = (v: boolean | null): number | null => v === true ? 2 : v === false ? 1 : null
// number | string | null. isHatchesUp kept in the signature for the (unchanged) default priority sort.
function sortValue(p: Prospect, key: SortKey, _hatchesUp: (v: string | null) => boolean): number | string | null {
  switch (key) {
    // Present sorts before absent; null last, as everywhere else on this table.
    case 'logo': return p.logo_url ? 1 : null
    case 'photo': return p.photo_url ? 1 : null
    case 'name': return p.name || null
    case 'phone': return p.phone || null
    // WhatsApp confirmation: confirmed (true) sorts first, not-confirmed (null) last. Two states only.
    case 'whatsapp':
      return p.whatsapp_confirmed === true ? 1 : null
    case 'email': return p.contact_email || null
    case 'hu_map': return triRank(p.hu_map)          // true > false > null(last)
    case 'hu_ordering': return triRank(p.hu_ordering)
    // 🔴 SPLIT 8 September 2026. This column used to render "N upcoming · last <date>" and sort by the
    // count; it now answers one question — do we hold a schedule at all — and the COUNT moved to its
    // own 'upcoming' column below. Same two underlying fields, no new data.
    // Y = at least one event known, future OR past. That is exactly what the old string called
    // "no schedule" when both were absent, so the meaning is unchanged, only the presentation.
    // 🔴 ONE TOTAL ORDER OVER THE THREE VISIBLE STATES, so the merged column stays sortable and N never
    // collides with Y (0):   N = 0  <  Y (0) = 1  <  Y (1) = 2  <  Y (2) = 3 …
    // Ascending therefore reads N, then the schedules that have gone quiet, then by how much is booked.
    // ⚠️ NOT `futureEventCount` alone — that returned 0 for BOTH N and Y (0), which is the collapse this
    // change exists to undo. Never null, so this column never sorts to the bottom as "no value".
    case 'schedule':
      return hasSchedule(p) ? p.futureEventCount + 1 : 0
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

// ── THE FILTER BAR'S CONTENTS AND ORDER, DECLARED ONCE ───────────────────────────────────────────────
// 🔴 DECLARED IN TABLE-COLUMN ORDER, and the bar and the active-filter chips BOTH map over this one
// array. That is the only reason the two can never disagree, and the only reason the bar cannot drift
// out of step with the table when someone edits JSX.
//
// THE ORDERING RULE, in full:
//   • a filter that HAS a column sits in that column's position — Truck, Phone, WhatsApp, Email, HU map,
//     HU ordering, Schedule, Stage, Next action;
//   • a column with NO filter is simply skipped (Last contacted is the only one);
//   • a filter with NO column goes at the END, after every filter that has one (`noColumn: true`).
//     🧪 do_not_contact is the ONLY such filter — it has no header at all, rendering instead as the
//     🚫 DNC chip inside the Truck cell.
//
// ⚠️ `search` is NOT in here. It is the Truck column's filter and renders first, but it is a text input
// rather than a <select>, so it is rendered explicitly and chipped explicitly.
// ── FILTER PERSISTENCE ───────────────────────────────────────────────────────────────────────────────
// The last-used filter is remembered so returning to the tab picks up where you left off.
//
// 🔴 VALIDATED, NEVER TRUSTED. localStorage is user-editable and survives deploys, so a stored blob can
// name a filter that no longer exists or a value that was never legal. `FILTER_CONTROLS` is the authority
// on what is legal — the SAME array the bar and the chips render from — so a value can only survive if a
// control could actually have produced it.
// ⚠️ MISSING keys fall back to their default (a blob written before a filter was added stays usable);
// an UNKNOWN key or an ILLEGAL value rejects the whole object, because that means the blob is from a
// shape this code does not understand and picking through it would be guesswork.
const FILTER_STORAGE_KEY = 'hg.outreach.filter.v1'

function sanitiseFilter(raw: unknown): OutreachFilterState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const known = new Set<string>(FILTER_CONTROLS.map(c => String(c.key)))
  for (const k of Object.keys(raw as object)) if (!known.has(k)) return null   // unknown key -> reject
  const out: OutreachFilterState = { ...EMPTY_OUTREACH_FILTER }
  for (const c of FILTER_CONTROLS) {
    const v = (raw as Record<string, unknown>)[String(c.key)]
    if (v === undefined) continue                                             // missing -> default
    if (c.kind === 'text') {
      if (typeof v !== 'string') return null
      out.search = v
      continue
    }
    if (typeof v !== 'string' || !c.options.some(([val]) => val === v)) return null   // illegal -> reject
    ;(out as Record<string, unknown>)[String(c.key)] = v
  }
  return out
}

type FilterSelectKey = keyof OutreachFilterState
const FILTER_CONTROLS: {
  key: FilterSelectKey
  label: string            // 🔴 THE COLUMN'S OWN LABEL, so a chip reads as the column the user sees.
  options: [string, string][]
  title?: string
  noColumn?: true
  kind?: 'text'            // the free-text search; everything else is a <select>
}[] = [
  // ⚠️ Logo and Photo are PRESENCE filters, not tri-state: a null column is genuinely an ABSENT image,
  // not "nobody checked". Any / Has / Missing is the honest shape and reuses the same `presenceMatch`
  // as Email and Phone.
  { key: 'logo', label: 'Logo',
    options: [['any', 'Any'], ['yes', 'Has'], ['no', 'Missing']],
    title: 'discovery_trucks.logo_url — Has = a value is stored, Missing = the column is null (an empty drop target).' },
  { key: 'photo', label: 'Photo',
    options: [['any', 'Any'], ['yes', 'Has'], ['no', 'Missing']],
    title: 'discovery_trucks.photo_url — Has = a value is stored, Missing = the column is null (an empty drop target).' },
  // 🔴 THE SEARCH BOX NOW SITS IN THE ARRAY rather than being rendered ahead of it, because Logo and
  // Photo come BEFORE Truck in the table and the bar must follow the columns. Keeping it outside would
  // have pinned it first and broken the one invariant this array exists to hold.
  { key: 'search', label: 'Truck', kind: 'text', options: [],
    title: 'Free-text match on the truck name.' },
  { key: 'phone', label: 'Phone',
    options: [['any', 'Any'], ['yes', 'Yes'], ['no', 'No']],
    title: 'discovery_trucks.phone. Yes = we hold a number, No = we hold none. Genuinely two-valued — presence is a fact.' },
  // ⚠️ "No" is fair HERE, unlike the two HU columns below: whatsapp_confirmed is Dominic's OWN
  // hand-entered confirmation, so an absent value genuinely means "I have not confirmed this works".
  { key: 'whatsapp', label: 'WhatsApp',
    options: [['any', 'Any'], ['yes', 'Yes'], ['unknown', 'No']],
    title: 'outreach_prospects.whatsapp_confirmed — your own hand-entered confirmation. Yes = confirmed working. No = not confirmed by you (stored as NULL; nothing ever writes false).' },
  { key: 'email', label: 'Email',
    options: [['any', 'Any'], ['yes', 'Yes'], ['no', 'No']],
    title: 'discovery_trucks.contact_email. Yes = we hold an address, No = we hold none. Genuinely two-valued — presence is a fact.' },
  // 🔴 THE LABEL SAYS "No"; THE DATA MEANS "no record that anyone checked". Changed on request — but
  // hu_ordering was backfilled from ONE Hatches Up map capture over a seven-day window, so absence from
  // it is NOT evidence against (manual V12.2). The predicate is unchanged: 'unknown' still matches NULL
  // ONLY, and nothing ever writes false. The tooltip carries the caveat at the point of use, because the
  // one-word label cannot.
  { key: 'huOrdering', label: 'HU ordering',
    options: [['any', 'Any'], ['yes', 'Yes'], ['unknown', 'No']],
    title: '⚠️ No = NOT CHECKED, not "does not use it". hu_ordering was backfilled from a single Hatches Up capture over seven days, so absence is not evidence against — a truck trading fortnightly reads the same as one that has never used ordering. Stored as NULL; nothing ever writes false.' },
  // 🔴 Same caveat as hu_ordering above.
  { key: 'huMap', label: 'HU map',
    options: [['any', 'Any'], ['yes', 'Yes'], ['unknown', 'No']],
    title: '⚠️ No = NOT CHECKED, not "absent from the map". hu_map was backfilled from a single Hatches Up capture, so absence from it is never evidence against. Stored as NULL; nothing ever writes false.' },
  { key: 'schedule', label: 'Schedule',
    options: [['any', 'Any'], ['upcoming', 'Y — events ahead'], ['stale', 'Y (0) — none ahead'], ['none', 'N — no schedule']],
    title: 'The merged Schedule column\'s three states. Y (0) is a truck we hold a schedule for with nothing booked ahead — deliberately NOT the same as N.' },
  { key: 'stage', label: 'Stage',
    options: [['any', 'Any'], ...OUTREACH_STAGES.map(st => [st, stageLabel(st)] as [string, string])],
    title: 'outreach_prospects.stage — the five stored values, shown with their display labels.' },
  // Added at the operator's request. ⚠️ NOT tri-state: a missing date means no next action is scheduled,
  // which is a fact, not an unknown. "Overdue" uses the SAME isOverdue helper as the row's red ⚠ marker.
  { key: 'nextAction', label: 'Next action',
    options: [['any', 'Any'], ['overdue', 'Overdue'], ['scheduled', 'Scheduled'], ['none', 'None set']],
    title: 'outreach_prospects.next_action_at. Overdue = dated before today (the same test as the row\'s red ⚠). Scheduled = today or later. None set = no date.' },
  // ── filters with NO column, last ──────────────────────────────────────────────────────────────────
  // ⚠️ "No" is fair here too — do_not_contact is a flag YOU set, so an absent value means "not flagged",
  // which is operationally the same as no.
  { key: 'doNotContact', label: 'Do not contact', noColumn: true,
    options: [['any', 'Any'], ['yes', 'Yes'], ['unknown', 'No']],
    title: 'outreach_prospects.do_not_contact — a flag you set. Yes = flagged do-not-contact. No = not flagged (stored as NULL; nothing ever writes false). No table column; shows as the 🚫 DNC chip on the Truck cell.' },
]

const fmtDate = (d: string | null) => {
  if (!d) return null
  const dt = new Date(d.length <= 10 ? d + 'T00:00:00Z' : d)
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

// 🔴 RESOLUTION GOES THROUGH THE SHARED HELPER, NOT A LOCAL COPY. `logo_url` / `photo_url` hold TWO
// shapes: an absolute `truck-media` URL (what an upload here writes) and a leading-slash `/logos/…` path
// (a STATIC FILE in public/, shipped with the deploy — a running function cannot write one). Both are
// valid <img src> values and `formatImageUrl` passes both through untouched.
// ⚠️ THIS REPLACES A LOCAL `logoSrc` THAT DID THE SAME JOB SLIGHTLY DIFFERENTLY. App manual §51.7 records
// a "reuse" that was really a fourth independent implementation; a second private copy of image
// resolution in this file is the same mistake one size down, so the duplicate is gone.
const mediaSrc = (u: string | null, folder: 'logos' | 'photos'): string | null =>
  formatImageUrl(u, folder) || null

export default function OutreachPanel() {
  const [checking, setChecking] = useState(true)
  const [denied, setDenied] = useState(false)
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [error, setError] = useState<string | null>(null)
  // Whether each hand-applied column exists yet (probed by the route, not inferred from row values).
  const [hasContactName, setHasContactName] = useState(false)
  const [hasDoNotContact, setHasDoNotContact] = useState(false)
  // item 1: client-side name filter over the already-loaded rows — no server round trip, no paging.
  // 🔴 ONE FILTER OBJECT, not nine useStates — so `visible` has one dependency and the Clear button is
  // one assignment. The free-text search lives inside it (it is a filter like any other).
  const [filter, setFilter] = useState<OutreachFilterState>(EMPTY_OUTREACH_FILTER)
  // 🔴 RESTORED IN AN EFFECT, NOT IN THE useState INITIALISER. This is a 'use client' component, but Next
  // still renders it on the SERVER for the initial HTML — reading localStorage there would throw, and
  // seeding from it would make the server and client markup disagree. Restoring after mount costs one
  // extra render and avoids both.
  // ⚠️ `restored` is STATE, not a ref, on purpose: the persist effect below must not run until the restore
  // has actually landed, and a ref set inside the first effect would still be true when the persist effect
  // ran later in that same commit — writing the empty default over the stored value.
  const [restored, setRestored] = useState(false)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FILTER_STORAGE_KEY)
      if (raw) {
        const parsed = sanitiseFilter(JSON.parse(raw))
        if (parsed) setFilter(parsed)
        else window.localStorage.removeItem(FILTER_STORAGE_KEY)   // unusable blob — do not keep re-reading it
      }
    } catch { /* private mode, quota, bad JSON — fall through to the default */ }
    setRestored(true)
  }, [])
  useEffect(() => {
    if (!restored) return
    try { window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filter)) } catch { /* ignore */ }
  }, [filter, restored])
  const setF = <K extends keyof OutreachFilterState>(k: K, v: OutreachFilterState[K]) =>
    setFilter(f => ({ ...f, [k]: v }))
  // "Open" shows a MODAL for one prospect (by id, so optimistic edits stay live), not an inline expansion.
  const [modalId, setModalId] = useState<string | null>(null)
  // The prospect whose schedule popup is open — state of its own, because the schedule popup and the
  // prospect modal are independent surfaces and opening one must never imply the other.
  // 🔴 LOADED FROM `outreach_templates`, NOT FROM CODE. `null` means "not loaded yet or unreachable" and
  // is deliberately distinct from `[]`, which means "the table is there and has none" — the compose
  // window says something different for each.
  const [templates, setTemplates] = useState<MessageTemplate[] | null>(null)
  const [schedFor, setSchedFor] = useState<Prospect | null>(null)
  // 🔴 (4) Prospect ids whose Schedule count is known to be out of date. See the popup's onEdited.
  const [staleCountIds, setStaleCountIds] = useState<Set<string>>(new Set())
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
  const openSchedule = useCallback((pr: Prospect) => setSchedFor(pr), [])

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

  // One read, on mount. The compose window filters this list; it never fetches templates itself.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const h = await nativeAuthHeader()
        const res = await fetch('/api/admin/outreach-templates', { headers: h, credentials: 'same-origin' })
        if (!res.ok) { if (alive) setTemplates(null); return }
        const data = await res.json()
        const rows = (data.templates ?? []) as any[]
        if (!alive) return
        setTemplates(rows.map(r => ({
          id: r.slug, label: r.label, channel: r.channel,
          subject: r.subject ?? undefined, body: r.body,
          sortOrder: r.sort_order, active: r.active,
          defaults: Object.fromEntries(Object.entries(r.placeholder_defaults ?? {})
            .map(([k, v]: [string, any]) => [k, { value: v?.value ?? '', updatedAt: v?.updated_at ?? null }])),
        })))
      } catch { if (alive) setTemplates(null) }
    })()
    return () => { alive = false }
  }, [])

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
  const computedVisible = useMemo(() => {
    // 🔴 (1) CLIENT-SIDE OVER THE ROWS ALREADY LOADED. No endpoint, no query param, no refetch — this
    // is a pure narrowing of `prospects`, which is why changing a filter cannot alter a row or lose an
    // optimistic edit. All predicates combine with AND inside matchesOutreachFilter.
    const rows = prospects.filter(p => matchesOutreachFilter(p, filter))
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
  }, [prospects, sort, filter])

  // ── 🔴 THE LIST IS FROZEN WHILE AN INLINE INPUT HAS FOCUS ────────────────────────────────────────
  // WHAT HAPPENS, PLAINLY: focus an inline Phone or Email box and the set of rows and their order are
  // pinned exactly as they are. Nothing can move or vanish under the cursor while you type — not a
  // filter that the edit stops matching, not a re-sort of the column being edited. On blur the freeze
  // lifts and the list recomputes: if your edit means the row no longer matches an active filter it
  // disappears THEN, with the change saved, which is the moment you can see it happen.
  // ⚠️ Data stays LIVE while frozen — the ids are pinned, the objects are re-read from `prospects` — so
  // the cell shows the value you just committed rather than a stale snapshot.
  // Which media slot is awaiting confirmation. Held HERE rather than in the thumbnail so the dialog can
  // render at the top of the tree, above the prospect modal, instead of inside a 44px box.
  const [confirmKind, setConfirmKind] = useState<'logo' | 'photo' | null>(null)
  const [heldOrder, setHeldOrder] = useState<string[] | null>(null)
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const visible = useMemo(() => {
    if (!heldOrder) return computedVisible
    const byId = new Map(prospects.map(p => [p.id, p]))
    return heldOrder.map(id => byId.get(id)).filter(Boolean) as Prospect[]
  }, [computedVisible, heldOrder, prospects])

  // ⚠️ THE RELEASE IS DEFERRED BY A TICK ON PURPOSE. Tabbing from Phone to Email fires blur then focus;
  // releasing synchronously on that blur would recompute the list between the two and could unmount the
  // row the focus was travelling to. The pending release is cancelled if another input takes focus.
  const holdList = useCallback((hold: boolean) => {
    if (releaseTimer.current) { clearTimeout(releaseTimer.current); releaseTimer.current = null }
    if (hold) setHeldOrder(cur => cur ?? computedVisible.map(p => p.id))
    else releaseTimer.current = setTimeout(() => setHeldOrder(null), 0)
  }, [computedVisible])
  useEffect(() => () => { if (releaseTimer.current) clearTimeout(releaseTimer.current) }, [])

  // Click a header: none → asc → desc → back to default. The active column + direction show at a glance
  // via the ▲/▼ marker rendered on that header.
  const toggleSort = (key: SortKey) => {
    setSort(cur =>
      !cur || cur.key !== key ? { key, dir: 'asc' }
        : cur.dir === 'asc' ? { key, dir: 'desc' }
          : null)   // third click clears back to the default priority sort
  }

  const modalProspect = modalId ? prospects.find(p => p.id === modalId) ?? null : null

  // ── PREV / NEXT ───────────────────────────────────────────────────────────────────────────────────
  // 🔴 BOUND TO `visible`, NOT `prospects`. `visible` IS the array the tbody maps over — the same
  // filtered set in the same sort order — so navigation walks exactly what is on screen. Deriving the
  // index from it each render (rather than storing a position) means the pair cannot drift out of step
  // when a filter changes or a column is re-sorted while the modal is open.
  // ⚠️ `modalProspect` still resolves from `prospects`, deliberately: if an edit inside the modal makes
  // the row fail the active filter, the modal stays open on the truck you are looking at rather than
  // vanishing mid-edit. In that case findIndex returns -1 and BOTH arrows disable, which is the honest
  // state — there is no "next" from a row that is no longer in the list.
  // ⚠️ A pending confirmation must not survive the modal closing or prev/next moving to another truck —
  // otherwise it would reopen naming the wrong one.
  useEffect(() => { setConfirmKind(null) }, [modalId])
  const modalIndex = modalId ? visible.findIndex(p => p.id === modalId) : -1
  const canPrev = modalIndex > 0
  const canNext = modalIndex >= 0 && modalIndex < visible.length - 1
  const gotoPrev = () => { if (canPrev) setModalId(visible[modalIndex - 1].id) }
  const gotoNext = () => { if (canNext) setModalId(visible[modalIndex + 1].id) }

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

  // ── MEDIA UPLOAD ──────────────────────────────────────────────────────────────────────────────────
  // 🔴 NO OPTIMISTIC UPDATE HERE, DELIBERATELY, and this is the opposite choice to patchProspect above.
  // patchProspect writes a value the client already knows; an upload's result is a URL only the SERVER
  // can produce, and the row must not show an image until the column actually holds one. Showing it
  // early would make a failed DB write look like a success — the precise failure this flow guards.
  // The row is patched ONLY from the URL the server returns, after it has written the column.
  // ⚠️ Throws on failure so the cell can render the message; the cell owns that display, not a toast,
  // because the failure belongs to one slot.
  const uploadMedia = useCallback(async (prospectId: string, kind: 'logo' | 'photo', file: File) => {
    const h = await nativeAuthHeader()
    const fd = new FormData()
    fd.append('prospect_id', prospectId)
    fd.append('column', kind)
    fd.append('file', file)
    // ⚠️ NO Content-Type header — the browser must set the multipart boundary itself.
    const res = await fetch('/api/admin/outreach', { method: 'POST', headers: { ...h }, credentials: 'same-origin', body: fd })
    const data = await res.json().catch(() => ({} as any))
    if (!res.ok) throw new Error(data?.error || `Upload failed (${res.status})`)
    if (!data?.url || !data?.column) throw new Error('Upload returned no URL')
    setProspects(ps => ps.map(x => x.id === prospectId ? { ...x, [data.column]: data.url } as Prospect : x))
  }, [])

  // ── REMOVE A LOGO OR PHOTO ────────────────────────────────────────────────────────────────────────
  // 🔴 NO OPTIMISTIC CLEAR, for the same reason uploadMedia has no optimistic set: the row must not show
  // an empty slot until the column is actually empty, or a failed delete would look like a success and
  // invite an upload that then hits the "slot already filled" refusal with no explanation.
  // ⚠️ The server reports whether the FILE was removed as well as the column; when it deliberately left a
  // file alone (a static /logos asset, or one inside an operator truck's folder) it says so, and that
  // note is surfaced in the toast rather than swallowed.
  const deleteMedia = useCallback(async (prospectId: string, kind: 'logo' | 'photo') => {
    const h = await nativeAuthHeader()
    const res = await fetch('/api/admin/outreach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...h },
      credentials: 'same-origin',
      body: JSON.stringify({ action: 'delete_media', id: prospectId, column: kind }),
    })
    const data = await res.json().catch(() => ({} as any))
    if (!res.ok) throw new Error(data?.error || `Remove failed (${res.status})`)
    setProspects(ps => ps.map(x => x.id === prospectId
      ? ({ ...x, [kind === 'logo' ? 'logo_url' : 'photo_url']: null } as Prospect) : x))
    showToast(data?.fileNote ? `${kind} cleared — ${data.fileNote}` : `${kind} removed`)
  }, [showToast])

  // Undo of a just-logged contact — deletes THAT row by id (never "the latest"; see item 4).
  // 🔴 SIGNATURES OF WHAT THIS SESSION HAS ALREADY WRITTEN, as a backstop for the guard below.
  // `logContact` awaits `load()` before it returns, so `p.contacts` is normally fresh by the time a
  // second click is possible — but a failed or slow refetch would leave the guard reading stale rows,
  // and a guard that silently stops guarding is the failure mode this whole task is about.
  const writtenRef = useRef<Map<string, number>>(new Map())

  // ── 🔴 ONE DELETE PATH, TWO CALLERS — NOT TWO PATHS ────────────────────────────────────────────
  // The toast's Undo (immediately after logging) and the per-row Delete in the contact popout both come
  // through here and both hit the SAME `delete_contact` action. The only difference is the second
  // argument: given a `prospectId`, the row is spliced out of local state and the derived values are
  // recomputed in place; without it, the old Undo behaviour — refetch everything — is kept unchanged.
  //
  // 🔴 IT THROWS ON FAILURE, AND THAT IS LOAD-BEARING. `ConfirmDeleteDialog` catches, shows the message
  // in place and STAYS OPEN. A version that swallowed the error would close the dialog and remove the
  // row from the screen while the database still held it — indistinguishable from success until reload.
  // 🔴 `deleted !== 1` IS TREATED AS FAILURE. The route now reports how many rows it removed; a delete
  // that matched nothing answers 404, and nothing is spliced out of state.
  const deleteContact = useCallback(async (contactId: string, prospectId?: string, sigKey?: string) => {
    let res: Response
    try {
      const h = await nativeAuthHeader()
      res = await fetch('/api/admin/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...h },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'delete_contact', contact_id: contactId }),
      })
    } catch {
      const msg = 'Could not reach the server. Nothing was deleted.'
      showToast(msg); throw new Error(msg)
    }
    const data = await res.json().catch(() => ({} as { error?: string; deleted?: number }))
    if (!res.ok || data?.deleted !== 1) {
      const msg = data?.error || `Delete failed (${res.status}).`
      showToast(msg); throw new Error(msg)
    }

    if (!prospectId) { showToast('Contact removed'); await load(); return }

    // 🔴 THE DERIVED VALUES ARE RECOMPUTED HERE, FROM THE REMAINING ROWS — not left to disagree and not
    // marked stale. `lastContactedAt` and `outboundCount` are pure functions of the contact list on the
    // server (route.ts:177-178), so the exact new values are computable locally; `stale` is the right
    // convention only for a value that CANNOT be recomputed without the server, which is why the
    // Schedule count uses it and this does not.
    // ⚠️ NOT `contacts[0]` — the server's array happens to be newest-first, and relying on that here
    // would put a silent ordering assumption in a second place. The max is taken explicitly.
    setProspects(ps => ps.map(x => {
      if (x.id !== prospectId) return x
      const contacts = x.contacts.filter(c => c.id !== contactId)
      return {
        ...x,
        contacts,
        outboundCount: contacts.filter(c => c.direction === 'outbound').length,
        lastContactedAt: contacts.reduce<string | null>(
          (best, c) => (!best || c.contacted_at > best ? c.contacted_at : best), null),
      }
    }))
    // 🔴 AND THE DOUBLE-LOG GUARD HAS TO FORGET IT. `writtenRef` remembers what this session wrote so a
    // second identical log is refused; without this, deleting a contact would leave the session unable
    // to log that same contact again — the guard would be defending a row that no longer exists. The
    // Undo path already did this at its call site; the row path passes the same key here.
    if (sigKey) writtenRef.current.delete(sigKey)
    showToast('Contact deleted')
  }, [load, showToast])

  // ── 🔴 DELETING A CONTACT ALSO UNDOES WHAT LOGGING IT WROTE ────────────────────────────────────
  // Logging a contact does two things: it inserts the row AND it writes `next_action_at` from the
  // stage's interval (persistFollowUpAfterLog). Deleting the row undid only the first, which left a
  // follow-up date behind for a contact that no longer exists. 🧪 Bonnefirebox is exactly that case:
  // one contact on 10 Sep at `1_first_contact` (+3) and `next_action_at = 2026-09-13`.
  //
  // 🔴 "THE PREVIOUS DATE" IS DERIVED, NOT REMEMBERED — THERE IS NO HISTORY OF next_action_at.
  // The column holds one value and nothing records what it held before. So the revert is computed: the
  // date the NEWEST REMAINING outbound contact implies, or null when none remains.
  //
  // 🔴 AND IT ONLY FIRES WHEN THE STORED DATE IS THE ONE THAT CONTACT WROTE. If `next_action_at` does
  // not equal the date the deleted contact implies, it was set by hand (or by a quick-set button) after
  // the log, and overwriting a date the operator chose would be a second bug wearing the first one's
  // clothes. In that case it is left exactly as it is.
  const deleteContactRow = useCallback(async (pr: Prospect, c: Contact) => {
    const impliedByDeleted = followUpDateFor(c.kind ?? '', contactDay(c.contacted_at))

    await deleteContact(c.id, pr.id, `${pr.id}|${contactSignature(c)}`)   // throws → nothing below runs

    if (pr.next_action_at && pr.next_action_at === impliedByDeleted) {
      const remaining = pr.contacts.filter(x => x.id !== c.id && x.direction === 'outbound')
      const newest = remaining.reduce<Contact | null>(
        (best, x) => (!best || x.contacted_at > best.contacted_at ? x : best), null)
      const revertTo = newest ? followUpDateFor(newest.kind ?? '', contactDay(newest.contacted_at)) : null
      if (revertTo !== pr.next_action_at) patchProspect(pr.id, { next_action_at: revertTo })
    }
  }, [deleteContact, patchProspect])

  const logContact = useCallback(async (
    p: Prospect,
    fields: { channel: string; direction: string; kind: string; message: string; contacted_at: string },
  ): Promise<boolean> => {
    // ── 🔴 THE DOUBLE-LOG GUARD LIVES IN THE WRITER, NOT IN THE FORM ──────────────────────────────
    // There are two logging paths (the Log button and the compose window) and exactly one writer. A
    // guard in either form would have to be written twice and could be true in one and false in the
    // other — the same shape of bug as the follow-up date that only fired on one path.
    // It refuses; it never silently succeeds and it never writes anything.
    const sig = contactSignature({ ...fields })
    const dup = findDuplicateContact(p.contacts, fields)
    const seen = writtenRef.current.get(`${p.id}|${sig}`)
    if (dup || seen) {
      showToast(`Not logged — ${kindLabel(fields.kind)} by ${channelLabel(fields.channel)} is already recorded for that date`)
      return false
    }
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
          // ⚠️ Sent only when set. The route already accepts this key and defaults to now() without it,
          // so this needed NO route change — `...(body.contacted_at ? {…} : {})` was already there.
          ...(fields.contacted_at ? { contacted_at: fields.contacted_at } : {}),
        }),
      })
      if (!res.ok) { showToast(`Log failed (${res.status})`); return false }
      // 🔴 UNDO targets the id the route just returned — the specific row, not "the most recent".
      const { id: newId } = await res.json().catch(() => ({ id: null }))
      // Recorded only AFTER the write succeeded, and dropped again by Undo, so an undone contact can be
      // logged again immediately — a guard that outlived the row it guards would be a new bug.
      writtenRef.current.set(`${p.id}|${sig}`, Date.now())
      showToast('Logged', newId
        // 🔴 `.catch` IS REQUIRED NOW: deleteContact REJECTS on failure so the confirm dialog can show
        // the reason. The toast has nowhere to show one, and an unhandled rejection helps nobody —
        // the toast raised by deleteContact itself is what reports the failure on this path.
        ? () => { writtenRef.current.delete(`${p.id}|${sig}`); void deleteContact(newId).catch(() => {}) }
        : undefined)
      await load()
      return true
    } catch { showToast('Log failed'); return false }
  }, [load, showToast, deleteContact])

  // 🔴 IN-PANEL STATES, NOT FULL-SCREEN ONES. As a page these each painted a centred min-h-screen; inside
  // a tab that would push the admin header and tab bar off the top of a blank screen. They now occupy the
  // panel and leave the surrounding chrome alone.
  if (checking) return <div className="py-16 grid place-items-center text-slate-500 text-sm">Loading…</div>
  if (denied) return (
    <div className="py-16 grid place-items-center">
      <div className="text-center"><p className="font-bold text-slate-900 mb-1">Access denied</p>
        {/* The /admin gate let you in and THIS route's gate did not — worth saying, because the two are
            separate verifyAdmin checks and a reader would otherwise assume one covers both. */}
        <p className="text-slate-500 text-sm">/api/admin/outreach refused this session.</p></div>
    </div>
  )

  return (
    <div className="text-slate-900">
      {/* 🔴 THE PANEL KEEPS ITS OWN WIDTH, AND THIS IS THE REASON. The table's colgroup sums to 1510px and
          the table carries minWidth:1510px, so ANY container narrower than that puts the last columns
          off-screen — that is arithmetic, not a small-screen problem. The admin body wrapper is
          max-w-6xl (1152px), which is why app/admin/page.tsx renders this tab OUTSIDE that wrapper.
          1800px clears the table with room for the columns to breathe on a wide window, and still stops
          the rows stretching to absurd line lengths on an ultrawide.
          ⚠️ The table stays `w-full` with a minWidth floor: above 1510px the browser distributes the
          spare width across the columns (which is what un-truncates EMAIL and SCHEDULE), and below it
          the wrapper's overflow-auto scrolls rather than crushing the cells. */}
      <div className="max-w-[1800px] mx-auto">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            {/* No <h1> — the tab bar above already names this surface, and a second title under it read as
                a duplicate. The count line stays: it is the only place the loaded-row total appears. */}
            {/* 🔴 THE FILTERED COUNT AGAINST THE TOTAL. Shown as "n of N" whenever anything is narrowing
                the list, so a filter that matches everything is still visibly a filter, and a filter that
                matches nothing reads as 0 of N rather than as an empty page. */}
            <p className="text-sm text-slate-500">
              {isFilterActive(filter)
                ? <><span className="font-semibold text-slate-700">{visible.length}</span> of {prospects.length} trucks</>
                : <>{prospects.length} trucks</>}
            </p>
          </div>
        </div>

        {/* ── (1) THE FILTER BAR — ORDERED TO MATCH THE TABLE COLUMNS ────────────────────────────────
            🔴 THE ORDER IS NOT HAND-MAINTAINED. `FILTER_CONTROLS` (above) is declared in COLUMN order and
            this bar simply maps over it, so the bar cannot drift out of step with the table by anyone
            editing JSX. Columns with no filter (Last contacted) are skipped; filters with no column
            (Do not contact) sort to the END via `noColumn`, after every filter that has one.
            🔴 CONTROLS ARE NOT IN THE COLUMN HEADERS, DELIBERATELY. The table scrolls horizontally, so a
            control in an off-screen header would be invisible while still changing the row count — its
            effect unattributable. The headers stay the SORT control and nothing else.
            🔴 EVERY CONTROL IS A <select>, INCLUDING THE FOUR NULLABLE BOOLEANS, AND THAT IS THE POINT.
            hu_map / hu_ordering / whatsapp_confirmed / do_not_contact are written only as true or NULL —
            never false — so NULL means NOBODY CHECKED, not "no". A checkbox has two positions and would
            force "not true" into one bucket, conflating "checked and absent" with "never checked".
            ⚠️ Email, Phone and Next action are DIFFERENT and labelled differently on purpose — absence of
            an address or a date is a fact we hold, not an unknown.
            🔴 Filtering writes NOTHING. Every control calls setF, which is React state only. */}
        <div className="mb-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
          <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
            {/* 🔴 ONE MAP OVER THE ORDERED ARRAY, INCLUDING THE SEARCH BOX. The search used to be rendered
                ahead of this loop, which pinned it first — fine while Truck was column 1, wrong now that
                Logo and Photo precede it. Ordering lives in ONE place and the bar cannot drift from the
                table. The only difference between entries is which control they render. */}
            {FILTER_CONTROLS.map(c => c.kind === 'text' ? (
              <label key={c.key} className="flex flex-col gap-0.5" title={c.title}>
                <span className="text-[10px] uppercase tracking-wide font-bold text-slate-400">{c.label}</span>
                <input type="search" value={filter.search} onChange={e => setF('search', e.target.value)}
                  placeholder="Search trucks…"
                  className={`w-48 border rounded-lg px-2 py-1 text-xs bg-white ${filter.search.trim() ? 'border-orange-400 text-orange-700 font-semibold' : 'border-slate-200 text-slate-600'}`} />
              </label>
            ) : (
              <FilterSelect key={c.key} label={c.label} title={c.title}
                value={filter[c.key] as string}
                onChange={v => setF(c.key, v as never)}
                options={c.options} />
            ))}

            {isFilterActive(filter) && (
              <button onClick={() => setFilter(EMPTY_OUTREACH_FILTER)}
                className="ml-auto text-xs font-semibold text-orange-600 hover:underline px-2 py-1.5 rounded focus:outline-none focus:ring-2 focus:ring-orange-400">
                Clear all
              </button>
            )}
          </div>

          {/* ── (2) ACTIVE-FILTER CHIPS ───────────────────────────────────────────────────────────────
              🔴 A DISPLAY OF FILTER STATE, NOT A SECOND SOURCE OF TRUTH. Each chip is DERIVED from the
              same `filter` object the controls above are bound to, and its dismiss calls the SAME setter
              a control would (`setF(key, 'any')`). There is no chip state, no effect syncing the two, and
              therefore no path by which a chip and its control can disagree — a chip cannot exist for a
              filter that is not set, and cannot fail to exist for one that is.
              ⚠️ Rendered only when something is active, via the existing `isFilterActive`. */}
          {isFilterActive(filter) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-slate-100">
              <span className="text-[10px] uppercase tracking-wide font-bold text-slate-400 mr-0.5">Active</span>
              {filter.search.trim() && (
                <FilterChip label="Truck" value={`“${filter.search.trim()}”`} onDismiss={() => setF('search', '')} />
              )}
              {FILTER_CONTROLS.filter(c => c.kind !== 'text' && filter[c.key] !== 'any').map(c => (
                <FilterChip key={c.key} label={c.label}
                  value={c.options.find(([v]) => v === filter[c.key])?.[1] ?? String(filter[c.key])}
                  onDismiss={() => setF(c.key, 'any' as never)} />
              ))}
            </div>
          )}
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
          <table className="table-fixed text-sm w-full" style={{ minWidth: '1198px' }}>
            {/* 🔴 THE SUM OF THESE EQUALS `minWidth` EXACTLY (1198px), AND THAT IS THE POINT.
                Every previous version had minWidth ABOVE the colgroup sum (1510 vs 1348, then 1638 vs
                1476), and `table-fixed` distributes that surplus across every column — so each one
                rendered WIDER than its declared value and the table sprawled. Keeping the two in step
                means a column is exactly the width written here.
                Widths are set by whichever is larger: the widest unbreakable word in the heading
                (headings wrap on spaces) plus 16px of px-2 padding, or the widest cell content. */}
            <colgroup>
              <col style={{ width: '64px' }} />{/* logo — 40px thumb, 12px gap each side */}
              <col style={{ width: '64px' }} />{/* photo */}
              <col style={{ width: '170px' }} />{/* name — truncates */}
              <col style={{ width: '115px' }} />{/* phone — "01223 360747" */}
              <col style={{ width: '72px' }} />{/* whatsapp — a checkbox; "WHATSAPP" is the binding word */}
              <col style={{ width: '210px' }} />{/* email — truncates; the longest content on the row */}
              <col style={{ width: '76px' }} />{/* hu_ordering — "ORDERING" is the binding word */}
              <col style={{ width: '68px' }} />{/* hu_map */}
              <col style={{ width: '78px' }} />{/* schedule — "SCHEDULE" binds, content is "Y (11)" */}
              <col style={{ width: '105px' }} />{/* stage — "not contacted" */}
              <col style={{ width: '88px' }} />{/* last_contacted — "CONTACTED" binds */}
              <col style={{ width: '88px' }} />{/* next_action */}
            </colgroup>
            <thead className="bg-slate-100 text-slate-600 text-xs uppercase tracking-wide sticky top-0 z-10">
              <tr>
                {/* 🔴 THE SORT MARKER IS ABSOLUTELY POSITIONED, AND THAT IS LOAD-BEARING FOR THE LAYOUT.
                    It used to sit in the button's flow with a matching spacer opposite it to keep the
                    label centred — 24px of width spent on two glyphs. On a 210px column that is free; on
                    a 64px media column it OVERFLOWED the cell and shoved the heading sideways, which is
                    what read as "the images aren't centred" for four rounds. Out of flow it costs the
                    layout nothing, the label is exactly centred with no spacer to balance, and the media
                    columns can be as narrow as their thumbnail needs.
                    ⚠️ Rendered only when the column IS the active sort, so nothing reserves space — and
                    because it is absolute, appearing causes NO layout shift. */}
                {COLUMNS.map(col => {
                  const active = sort?.key === col.key
                  return (
                    <th key={col.key} className="px-2 py-2 text-center relative">
                      <button onClick={() => toggleSort(col.key)} title={col.title}
                        className={`inline-flex items-center justify-center uppercase tracking-wide font-bold hover:text-slate-900 ${active ? 'text-orange-600' : ''}`}>
                        {col.label}
                      </button>
                      {active && (
                        <span aria-hidden="true"
                          className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-orange-600 pointer-events-none">
                          {sort!.dir === 'asc' ? '▲' : '▼'}
                        </span>
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {visible.map(p => (
                <Row key={p.id} p={p} onOpen={openModal} onOpenSchedule={openSchedule} onPatch={patchProspect} onUpload={uploadMedia} onHold={holdList} isCountStale={staleCountIds.has(p.id)} />
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={12} className="px-3 py-8 text-center text-slate-400">
                  {isFilterActive(filter) ? 'No trucks match these filters.' : 'No prospects.'}
                </td></tr>
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
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          {/* 🔴 THE MODAL ITSELF NO LONGER SCROLLS — `overflow-hidden`, and the ONLY scrollable region
              inside it is contact history. History holds full email bodies and is unbounded; when it
              shared the modal's scroll, reading an old email pushed the form off screen. Everything else
              is sized to fit, so the fields stay put no matter how long the history is.
              ⚠️ DESKTOP ONLY, as briefed — no sm: breakpoints, no mobile stacking. max-w-6xl (1152px)
              carries two working columns on a laptop. Backdrop still has NO onClick: Close or Escape. */}
          <div className="bg-white rounded-2xl w-full max-w-6xl flex flex-col max-h-[calc(100vh-2rem)] overflow-hidden">

            {/* ── (1) HEADER — ONE LINE ──────────────────────────────────────────────────────────── */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 flex-shrink-0">
              <ModalThumb value={modalProspect.logo_url} folder="logos" label="logo"
                onRequestDelete={() => setConfirmKind('logo')} />
              <ModalThumb value={modalProspect.photo_url} folder="photos" label="photo"
                onRequestDelete={() => setConfirmKind('photo')} />
              <h3 className="text-lg font-semibold text-slate-900 truncate min-w-0">{modalProspect.name}</h3>
              {/* (4) The label says what the link OPENS. `safeHref` also rescues the one scheme-less value. */}
              {safeHref(modalProspect.website) && (
                <a href={safeHref(modalProspect.website)!} target="_blank" rel="noreferrer" className={linkCls}
                  title={modalProspect.website ?? undefined}>{linkLabel(modalProspect.website, 'Website')} ↗</a>
              )}
              {safeHref(modalProspect.schedule_url) && (
                <a href={safeHref(modalProspect.schedule_url)!} target="_blank" rel="noreferrer" className={linkCls}
                  title={modalProspect.schedule_url ?? undefined}>{linkLabel(modalProspect.schedule_url, 'Schedule')} ↗</a>
              )}
              <div className="ml-auto flex items-center gap-1 flex-shrink-0">
                {/* (8) walks the on-screen list; position shown so the end of the list is not a surprise */}
                <button onClick={gotoPrev} disabled={!canPrev} aria-label="Previous truck"
                  className="text-sm font-semibold px-2 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed">←</button>
                <span className="text-xs text-slate-400 tabular-nums px-1">
                  {modalIndex >= 0 ? `${modalIndex + 1} / ${visible.length}` : 'filtered out'}
                </span>
                <button onClick={gotoNext} disabled={!canNext} aria-label="Next truck"
                  className="text-sm font-semibold px-2 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed">→</button>
                <button onClick={() => setModalId(null)}
                  className="ml-2 text-sm font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50" aria-label="Close">✕ Close</button>
              </div>
            </div>

            {/* ── (2) STATUS STRIP — ONE LINE ────────────────────────────────────────────────────────
                🔴 THE STAGE SELECT MOVES HERE and nothing about it changes: same onChange, same
                `patchProspect(id, { stage })`, same OUTREACH_STAGES, same stageLabel. Position only.
                Three previously separate lines (stage, the upcoming/last-event line, last contacted)
                collapse into this one. */}
            <div className="flex items-center gap-5 px-5 py-2 bg-slate-50 border-b border-slate-100 flex-shrink-0 text-xs">
              <label className="flex items-center gap-2">
                <span className="uppercase tracking-wide font-bold text-slate-400">Stage</span>
                <select value={modalProspect.stage} onChange={e => patchProspect(modalProspect.id, { stage: e.target.value })}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white">
                  {OUTREACH_STAGES.map(st => <option key={st} value={st}>{stageLabel(st)}</option>)}
                </select>
              </label>
              <span className="text-slate-500">
                <span className="uppercase tracking-wide font-bold text-slate-400 mr-1.5">Upcoming</span>
                <span className="font-semibold text-slate-700">{modalProspect.futureEventCount}</span>
                {modalProspect.lastEventDate && <span className="text-slate-400"> · last {fmtDate(modalProspect.lastEventDate)}</span>}
              </span>
              <span className="text-slate-500">
                <span className="uppercase tracking-wide font-bold text-slate-400 mr-1.5">Last contacted</span>
                {fmtDate(modalProspect.lastContactedAt) ?? <span className="text-slate-400">never</span>}
              </span>
              <div className="ml-auto">
                <DoNotContactToggle p={modalProspect} enabled={hasDoNotContact} onPatch={patchProspect} />
              </div>
            </div>

            {/* ── (3) TWO COLUMNS. `min-h-0` on the flex parent is what lets the history pane shrink and
                scroll instead of pushing the modal taller — without it a long history would overflow. */}
            {/* 🔴 THE SPLIT IS AN INLINE STYLE, NOT `grid-cols-[38fr_62fr]`. An arbitrary Tailwind value
                used by exactly one file may have NO GENERATED RULE AT ALL — that is what left the compose
                window painting under its own modal yesterday — and if this one went missing the columns
                would fall back to `grid-cols-2`, i.e. the 50/50 split being corrected.
                ⚠️ `fr`, NOT `%`: percentages resolve against the content box and would overflow by the
                20px gap.
                🔴 45/55, WAS 38/62. History moved to the left column and it needs width for four
                columns; the right column lost its least interactive block and no longer needs 62%. */}
            <div className="flex-1 min-h-0 grid gap-5 p-5" style={{ gridTemplateColumns: '45fr 55fr' }}>
              <Detail p={modalProspect} hasContactName={hasContactName}
                onPatch={patchProspect} onLog={logContact} templates={templates}
                onDeleteContact={deleteContactRow} />
            </div>
          </div>
        </div>
      )}

      {/* Layered ABOVE the prospect modal, and only while that modal is open. */}
      {modalProspect && confirmKind && (
        <ConfirmDeleteDialog
          title={`Delete the ${confirmKind} for ${modalProspect.name}?`}
          confirmLabel={`Delete ${confirmKind}`}
          onCancel={() => setConfirmKind(null)}
          onConfirm={async () => { await deleteMedia(modalProspect.id, confirmKind); setConfirmKind(null) }}
        >
          {/* 🔴 THE STRICT SENTENCE, NO PER-ROW VARIATION. For a file this surface uploaded, the object is
              removed from storage and there is no restore. Saying "usually recoverable" would be true for
              some rows and false for exactly the ones where it matters. */}
          <p className="text-sm text-slate-500 mt-2">This cannot be undone.</p>
        </ConfirmDeleteDialog>
      )}

      {schedFor && (
        <ScheduleEventsPopup
          truckId={schedFor.discovery_truck_id}
          truckName={schedFor.name}
          futureCount={schedFor.futureEventCount}
          onClose={() => setSchedFor(null)}
          onEdited={changedTruckName => {
            // 🔴 (4) HOW THE COUNT AND THE POPUP ARE KEPT FROM SILENTLY DISAGREEING.
            // `futureEventCount` is derived on the SERVER from the whole events table. This client cannot
            // recompute it without re-reading that table, and guessing it would be a second source of
            // truth that could be wrong. So it is NOT live-updated: an edit that can change which truck a
            // row belongs to marks THIS row's count stale and the cell says "stale" until the next load.
            // An out-of-date number that admits it is out of date is safe; one that quietly disagrees
            // with the popup is exactly the failure being avoided.
            if (changedTruckName) setStaleCountIds(prev => new Set(prev).add(schedFor.id))
          }}
        />
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

// ── One labelled filter dropdown ─────────────────────────────────────────────────────────────────────
// Deliberately dumb: a label, a <select>, an onChange. It holds no state and knows nothing about which
// field it drives — the meaning lives in lib/outreach-filter.ts, and the OPTIONS are passed in, so a
// three-position tri-state and a two-position presence filter use the same control without the control
// needing to know the difference.
function FilterSelect({ label, value, onChange, options, title }: {
  label: string
  value: string
  onChange: (v: string) => void
  options: [string, string][]
  title?: string
}) {
  const active = value !== 'any'
  return (
    <label className="flex flex-col gap-0.5" title={title}>
      <span className="text-[10px] uppercase tracking-wide font-bold text-slate-400">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`text-xs border rounded-lg px-2 py-1 bg-white ${active ? 'border-orange-400 text-orange-700 font-semibold' : 'border-slate-200 text-slate-600'}`}
      >
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  )
}

// ── One active-filter chip ───────────────────────────────────────────────────────────────────────────
// 🔴 A REAL <button>, not a div with an onClick: focusable, in the tab order, and activating on BOTH
// Enter and Space for free. It holds no state — the label and value are passed in, derived from the
// filter object, so the chip is a projection of that state and never a copy of it.
function FilterChip({ label, value, onDismiss }: {
  label: string
  value: string
  onDismiss: () => void
}) {
  return (
    <button
      onClick={onDismiss}
      title={`Clear the ${label} filter`}
      aria-label={`Clear filter ${label}: ${value}`}
      className="group inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 pl-2 pr-1.5 py-0.5 text-[11px] font-semibold text-orange-700 hover:bg-orange-100 focus:outline-none focus:ring-2 focus:ring-orange-400"
    >
      <span className="text-orange-500/80 font-bold uppercase tracking-wide text-[9px]">{label}</span>
      <span>{value}</span>
      <span aria-hidden="true" className="ml-0.5 text-orange-400 group-hover:text-orange-700">✕</span>
    </button>
  )
}

// ── ONE MEDIA SLOT (logo or photo) ───────────────────────────────────────────────────────────────────
// 🔴 THREE STATES, AND CONFLATING ANY TWO OF THEM IS THE BUG THIS COMPONENT EXISTS TO AVOID:
//
//   1. PRESENT  — a value that loads. A thumbnail. Not a drop target (replacing is out of scope).
//   2. EMPTY    — the column is NULL. A dashed drop target reading "+". This is the ONLY droppable state.
//   3. BROKEN   — a value is stored but does NOT load (a 404). 🔴 NOT a drop target, and visually
//                 distinct from EMPTY: an amber ⚠ on a solid border, never a dashed "+".
//
// ⚠️ WHY 3 MUST NOT LOOK LIKE 2. A resolved image and a 404 both render as an empty box in a browser, so
// a naive cell would show a broken value as an inviting empty slot — and dropping on it would look like
// filling a gap while actually being a REPLACE, which is out of scope and which the server refuses (409).
// The operator would see a rejection they could not explain. `Chai Stall`'s photo_url is a live instance:
// a `/photos/…` path with no file behind it. It is NOT fixed here — out of scope, flagged separately.
//
// 🔴 BROKENNESS IS DETECTED, NOT ASSUMED. There is no way to know from the string whether it resolves, so
// the <img> reports it via onError. State 3 is therefore reachable only after a real load failure.
function MediaCell({ p, kind, onUpload }: {
  p: Prospect
  kind: 'logo' | 'photo'
  onUpload: (prospectId: string, kind: 'logo' | 'photo', file: File) => Promise<void>
}) {
  const value = kind === 'logo' ? p.logo_url : p.photo_url
  const src = mediaSrc(value, kind === 'logo' ? 'logos' : 'photos')
  const [broken, setBroken] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [over, setOver] = useState(false)

  // A new value deserves a fresh verdict — otherwise a successful upload would inherit the previous
  // value's broken flag and show the ⚠ over an image that loads perfectly well.
  useEffect(() => { setBroken(false); setErr(null) }, [value])

  const accept = async (files: FileList | null) => {
    const file = Array.from(files ?? [])[0]
    if (!file) return
    // ⚠️ The browser-side copy of the type check. The SERVER enforces it too — this one only saves a
    // pointless round trip and gives an instant reason.
    if (!file.type.startsWith('image/')) { setErr(`Not an image (${file.type || 'unknown'})`); return }
    setBusy(true); setErr(null)
    try { await onUpload(p.id, kind, file) }
    catch (e: any) { setErr(e?.message || 'Upload failed') }
    finally { setBusy(false) }
  }

  // ⚠️ LOGOS ARE CIRCLES, PHOTOS ARE SQUARES — applied to ALL THREE states, not just the image, so an
  // empty logo slot and a broken logo slot are still recognisably the logo column at a glance.
  // A logo is a brand mark and reads as one in a circle; a food photo is a scene and would be cropped
  // badly by one.
  const shape = kind === 'logo' ? 'rounded-full' : 'rounded-md'
  // 🔴 inline-flex, NOT flex. `display:flex` makes the element a BLOCK-LEVEL flex container that fills
  // the cell, so the <td>'s `text-center` has nothing to centre and `mx-auto` is a no-op — the box sat
  // hard left. `inline-flex` keeps it inline-level and shrink-to-fit, so the parent's text-align centres
  // it. This is the pattern WhatsAppBox and TriStateBox already use, which is why the tick columns
  // looked right while these two did not.
  // Size and shape ONLY. Horizontal placement belongs to the flex wrapper in the cell; the two glyph
  // states add their own `inline-flex` to centre their own content, and the <img> needs neither.
  const box = `w-10 h-10 ${shape} shrink-0 mx-auto`

  // ── STATE 3: BROKEN ──────────────────────────────────────────────────────────────────────────────
  if (src && broken) {
    return (
      <span className={`${box} inline-flex items-center justify-center text-[10px] border border-amber-300 bg-amber-50 text-amber-600 cursor-help`}
        title={`Stored value does not load: ${value}\nNot a drop target — replacing an existing value is out of scope.`}>
        <span aria-hidden="true">⚠</span>
        <span className="sr-only">Image does not load</span>
      </span>
    )
  }

  // ── STATE 1: PRESENT ─────────────────────────────────────────────────────────────────────────────
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" onError={() => setBroken(true)}
        title={`${kind} — ${value}`}
        className={`${box} object-cover border border-slate-200 bg-white`} />
    )
  }

  // ── STATE 2: EMPTY — the drop target ─────────────────────────────────────────────────────────────
  // A <label> wrapping a hidden input, so the whole square is the input's own click target as well as a
  // drop zone: dragging is the primary gesture, but a click still works on a trackpad.
  return (
    <label
      onDragOver={e => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); accept(e.dataTransfer.files) }}
      title={err ?? `Drop an image here to set this truck's ${kind}`}
      className={`${box} inline-flex items-center justify-center text-[10px] cursor-pointer border-2 border-dashed transition-colors ${
        err ? 'border-red-300 bg-red-50 text-red-600'
          : busy ? 'border-orange-300 bg-orange-50 text-orange-600'
          // 🟢 GREEN WHILE A FILE IS OVER THE SLOT — the one state that says "let go and this lands here".
          // Orange was the same colour as busy and as every other accent on the page, so hovering a file
          // over a slot looked no different from one already uploading. Green is used NOWHERE else here,
          // which is what makes it read instantly.
          : over ? 'border-green-500 bg-green-50 text-green-700 ring-2 ring-green-300'
          : 'border-slate-300 bg-slate-50 text-slate-400 hover:border-orange-400'}`}
    >
      <input type="file" accept="image/*" className="hidden" disabled={busy}
        onChange={e => { accept(e.target.files); e.currentTarget.value = '' }} />
      <span aria-hidden="true">{busy ? '…' : err ? '!' : '+'}</span>
      <span className="sr-only">{err ? `Upload failed: ${err}` : `Upload a ${kind}`}</span>
    </label>
  )
}


// ── One prospect row (opens the detail MODAL via onOpen) ─────────────────────────────────────────────
// 🔴 React.memo (item 5): with stable onOpen/onPatch, a row re-renders only when its OWN `p` changes, so a
// single-cell edit does not re-render all 231 rows. Truncation (`truncate`) plus the fixed <colgroup>
// keeps every cell within its column width, so content never widens a column on sort (item 4).
const Row = memo(function Row({ p, onOpen, onOpenSchedule, onPatch, onUpload, onHold, isCountStale }: {
  p: Prospect
  onOpen: (id: string) => void
  onOpenSchedule: (p: Prospect) => void
  isCountStale: boolean
  onPatch: (id: string, patch: Record<string, unknown>) => void
  onUpload: (prospectId: string, kind: 'logo' | 'photo', file: File) => Promise<void>
  onHold: (hold: boolean) => void
}) {
  const overdue = isOverdue(p.next_action_at)
  // 🔴 TWO CELLS, ONE QUESTION EACH. Was a single string, "N upcoming · last <date>", which truncated
  // at 150px so neither half was reliably readable. `hasSchedule` is the same test the old string used
  // for "no schedule" — nothing about what counts as a schedule changed.
  // ⚠️ THE LAST-EVENT DATE IS NOT LOST: it moves to the Schedule cell's tooltip, which is where the
  // detail belonged — it was never the answer to "do they have a schedule".
  // 🔴 THE MERGED SCHEDULE CELL. `scheduleState` and `hasSchedule` come from lib/outreach-filter.ts so
  // the CELL and the FILTER cannot drift apart — the same function decides what the eye sees and what
  // the dropdown selects. `hasSchedule` is the identical test that was inline here before.
  const schedState = scheduleState(p)
  const schedTitle = schedState === 'none'
    ? 'No events known, past or future'
    : (p.lastEventDate
        ? `Last event ${fmtDate(p.lastEventDate)}${p.futureEventCount === 0 ? ' — nothing booked ahead' : ''}`
        : 'Upcoming events only — no past event recorded')

  return (
    <tr className="border-t border-slate-100">
      {/* NO excluded chip. item 5: a do-not-contact flag shows clearly on the row when set. */}
      {/* 🔴 MEDIA CELLS. Three states, and the middle one is the whole point — see MediaCell. */}
      {/* 🔴 A FLEX CONTAINER CENTRES ITS CHILD WHATEVER THE CHILD'S `display` IS — which `text-center`
          does not. `text-align` only moves INLINE-level content, and Tailwind's preflight sets
          `img { display: block }`, so the thumbnail was a block box sitting hard left inside a cell that
          is ALWAYS wider than it (the colgroup sums to 1460px under a 1622px minWidth, so table-fixed
          distributes the surplus and a 56px column renders ~62px at minimum and ~69px on a wide window —
          6-13px of slack around a 40px box). This stops depending on the child at all. */}
      {/* 🔴 CENTRED THREE WAYS, ON PURPOSE, BECAUSE I CANNOT RENDER THIS TO CHECK.
          Two attempts at a single mechanism each looked right in the source and wrong on screen, so this
          no longer relies on any one of them being the operative rule:
            1. `text-center` on the <td>      — centres INLINE-level children;
            2. `flex justify-center` wrapper  — centres ANY child, whatever its display;
            3. `mx-auto` on the box itself    — centres a BLOCK-level child of definite width.
          A block image ignores (1); an inline-flex box ignores (3); (2) covers both. Any ONE suffices and
          they cannot conflict — they all resolve to the same position. */}
      <td className="px-2 py-2 text-center"><div className="flex items-center justify-center"><MediaCell p={p} kind="logo" onUpload={onUpload} /></div></td>
      <td className="px-2 py-2 text-center"><div className="flex items-center justify-center"><MediaCell p={p} kind="photo" onUpload={onUpload} /></div></td>
      {/* 🔴 (4) THE TRUCK NAME IS THE CONTROL. The dedicated "Open" column is gone and the name opens the
          modal, using the SAME `onOpen(p.id)` handler the Open link used — nothing about opening changed.
          🔴 A REAL <button>, NOT AN onClick ON A DIV OR A SPAN: it is in the tab order, takes focus, and
          activates on Enter and Space for free. A div with a handler is none of those things.
          ⚠️ The DNC chip stays OUTSIDE the button — it is a status marker, not part of the control's
          label, and reading "🚫 DNC Pizza Mondo" as a button name is worse than reading "Pizza Mondo". */}
      <td className="px-3 py-2 font-medium truncate text-center">
        {p.do_not_contact === true && (
          <span className="mr-1 align-middle text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-700" title="Do not contact">🚫 DNC</span>
        )}
        <button
          onClick={() => onOpen(p.id)}
          title={p.do_not_contact === true ? `Do not contact — ${p.name}` : `Open ${p.name}`}
          className="text-center font-medium text-orange-700 hover:underline focus:outline-none focus:ring-2 focus:ring-orange-400 rounded max-w-full truncate align-middle mx-auto"
        >{p.name}</button>
      </td>
      {/* discovery_trucks.phone, READ-ONLY (not editable here, not `mobile`) */}
      {/* 🔴 SAME WRITE PATH AS THE MODAL — `onPatch(id, { phone })` -> update_prospect -> the route
          resolves discovery_truck_id and updates discovery_trucks with the SERVICE ROLE behind
          verifyAdmin. No new action, no second branch: two writers for one column is how they drift. */}
      <td className="px-2 py-1">
        <InlineField value={p.phone} type="text" placeholder="—" onHold={onHold}
          onCommit={v => onPatch(p.id, { phone: v })} />
      </td>
      {/* item 3: checkbox centred. step E: reflects MY confirmation (whatsapp_confirmed). */}
      <td className="px-3 py-2 text-center"><WhatsAppBox p={p} onPatch={onPatch} /></td>
      {/* Same single write path. 🧪 The column is 210px (186px of content) and the median stored address
          is 25 characters, so ~63% fit untruncated at rest; the full value is in the title and the box
          switches to left-aligned on focus so a long address reads from the start while editing. */}
      <td className="px-2 py-1">
        <InlineField value={p.contact_email} type="email" placeholder="—" onHold={onHold}
          title={p.contact_email ?? undefined}
          onCommit={v => onPatch(p.id, { contact_email: v })} />
      </td>
      {/* item 3: checkboxes centred. step D: two independent tri-state columns. */}
      <td className="px-3 py-2 text-center"><TriStateBox value={p.hu_ordering} onSet={v => onPatch(p.id, { hu_ordering: v })} label="HU ordering" /></td>
      <td className="px-3 py-2 text-center"><TriStateBox value={p.hu_map} onSet={v => onPatch(p.id, { hu_map: v })} label="HU map" /></td>
      {/* 🔴 (2) SCHEDULE AND UPCOMING, MERGED — and Y (0) MUST NOT LOOK LIKE N.
          Y (3) → dark, the count in normal weight beside a bold Y.
          Y (0) → the Y stays dark and bold (we DO hold a schedule) and the (0) is amber: it is a live
                  signal, not an absence — this truck has been seen trading and has gone quiet.
          N     → grey, and NO number at all.
          ⚠️ A bare number would render both N and Y (0) as "0", which is the collapse this avoids. */}
      <td className="px-3 py-2 text-center tabular-nums" title={schedTitle}>
        {schedState === 'none'
          ? <span className="font-bold text-slate-300">N</span>
          : <>
              <span className="font-bold text-slate-700">Y</span>
              {/* 🔴 ONLY THE NUMBER IS THE CONTROL, AND IT IS A REAL <button> — in the tab order, takes
                  focus, activates on Enter and Space for free. A div with an onClick is none of those.
                  🔴 IT MUST NOT OPEN THE PROSPECT MODAL. That modal is opened ONLY by the truck-name
                  button, which is a different <td>; the <tr> carries no onClick and there is no ancestor
                  click handler between here and the table, so there is nothing for a click to bubble
                  into. `stopPropagation` is belt-and-braces against a row handler being added later —
                  today the separation does not depend on it.
                  🔴 Y (0) IS STILL CLICKABLE. Those trucks have gone quiet and their past events are the
                  reason to look; the popup opens on "all dates" for them. Only N — nothing known at all,
                  past or future — opens nothing, because there is nothing to show. */}
              <button
                onClick={ev => { ev.stopPropagation(); onOpenSchedule(p) }}
                title={`Show ${p.name}'s events`}
                aria-label={`Show ${p.name}'s events (${p.futureEventCount} upcoming)`}
                className={`ml-1 rounded px-0.5 hover:underline focus:outline-none focus:ring-2 focus:ring-orange-400 ${
                  schedState === 'stale' ? 'text-amber-600 font-semibold' : 'text-slate-600'}`}>
                ({p.futureEventCount})
              </button>
              {isCountStale && (
                <span className="ml-1 text-[10px] font-bold uppercase text-orange-700" title="A truck name was edited in the schedule popup, so this count is out of date until the list is reloaded.">stale</span>
              )}
            </>}
      </td>
      {/* 🔴 (3) STAGE IS READ-ONLY HERE. The select moved OUT of the table; stage is edited in the modal
          only, so a mis-click while scanning 231 rows cannot silently re-stage a prospect. The COLUMN
          STAYS — stage is the thing being scanned for — and the five stored values and their display
          labels are untouched (same `stageLabel`, same `OUTREACH_STAGES`). */}
      <td className="px-3 py-2 text-slate-600 truncate text-center" title={`Stage: ${stageLabel(p.stage)} — edit in the truck's panel`}>
        {stageLabel(p.stage)}
      </td>
      <td className="px-3 py-2 text-slate-600 truncate text-center">{fmtDate(p.lastContactedAt) || <span className="text-slate-300">—</span>}</td>
      <td className="px-3 py-2 truncate text-center">
        {p.next_action_at
          ? <span className={overdue ? 'text-red-600 font-semibold' : 'text-slate-600'}>{fmtDate(p.next_action_at)}{overdue && ' ⚠'}</span>
          : <span className="text-slate-300">—</span>}
      </td>
    </tr>
  )
})

// ── (4) WHAT DOES THIS LINK ACTUALLY OPEN? ──────────────────────────────────────────────────────────
// 🧪 64 of 102 `website` values and 4 of 26 `schedule_url` values are facebook.com. A button reading
// "Website" opened Facebook for 64 trucks with nothing saying so. The label is DERIVED from the host —
// the same principle as the competitor tag, which is read from `order_url`'s host rather than typed.
// 🔴 NO Instagram or X COLUMNS ADDED. 🧪 There are ZERO instagram and ZERO twitter/x URLs in either
// column today, so those arms exist only to label data that already arrives; nothing is hand-entered.
//
// 🔴 AND ONE REAL BUG FOUND WHILE DOING IT. 🧪 `shikashack.co.uk` is stored in `website` with NO SCHEME.
// `new URL()` throws on it, and — worse — `<a href="shikashack.co.uk">` is a RELATIVE link, so the
// existing button navigates to /admin/shikashack.co.uk instead of the site. `safeHref` prefixes https://
// when a scheme is absent, which turns that one dead button into a working one. Display only; nothing is
// written and the stored value is untouched.
function safeHref(raw: string | null | undefined): string | null {
  const v = String(raw ?? '').trim()
  if (!v) return null
  // 🔴 A RELATIVE PATH IS NOT A WEBSITE. Prefixing "https://" onto "/foo/bar" invents the host
  // `https://foo/bar`, which is worse than doing nothing — it looks like a working link.
  if (v.startsWith('/')) return null
  // 🔴 http(s) ONLY. These columns are written by the scraper and are anon-readable, so the value is
  // untrusted input: `javascript:alert(1)` in an <a href> executes on click. Caught by testing edge
  // cases rather than the 231 live rows, every one of which is already http(s).
  const ok = (u: URL) => (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : null
  try { return ok(new URL(v)) } catch { /* fall through */ }
  // No scheme: try it as https, and only use it if THAT parses to an http(s) URL.
  try { return ok(new URL(`https://${v}`)) } catch { return null }
}

/** The host-derived label. Falls back to `fallback` for anything that is not a known social host. */
function linkLabel(raw: string | null | undefined, fallback: string): string {
  const href = safeHref(raw)
  if (!href) return fallback
  let host = ''
  try { host = new URL(href).hostname.replace(/^www\./, '').toLowerCase() } catch { return fallback }
  if (host === 'facebook.com' || host.endsWith('.facebook.com') || host === 'fb.com') return 'Facebook'
  if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'Instagram'
  if (host === 'x.com' || host === 'twitter.com' || host.endsWith('.twitter.com')) return 'X'
  return fallback
}

const linkCls = 'text-xs px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-orange-600 font-semibold whitespace-nowrap'

// ── ONE HEADER THUMBNAIL — three states, clickable to full size ──────────────────────────────────────
// 🔴 MISSING AND BROKEN ARE DIFFERENT THINGS AND LOOK DIFFERENT. A null column is an empty labelled box
// ("no logo"); a value that 404s is an amber ⚠ that names the failure. `Chai Stall` proves the column can
// hold a path with no file behind it, and rendering that as "empty" would say the data is missing when it
// is actually wrong — a different problem with a different fix.
// ⚠️ Detected, not assumed: nothing in the string says whether it resolves, so <img onError> decides.
// ── THE DELETE CONFIRMATION ─────────────────────────────────────────────────────────────────────────
// 🔴 MOVED, NOT COPIED. This dialog now lives in components/admin/ConfirmDeleteDialog.tsx so the events
// table uses the SAME one rather than a second implementation. Behaviour here is unchanged: same focus,
// same capture-phase Escape, same backdrop-cancels, same in-place error, same rendered markup. The only
// difference is that the title/label/sentence now arrive as props instead of being derived from `kind`.
function ModalThumb({ value, folder, label, onRequestDelete }: {
  value: string | null
  folder: 'logos' | 'photos'
  label: string
  onRequestDelete: () => void
}) {
  const src = mediaSrc(value, folder)
  const [broken, setBroken] = useState(false)
  useEffect(() => { setBroken(false) }, [value])
  const box = 'w-11 h-11 rounded-lg flex-shrink-0 flex items-center justify-center text-[9px] text-center leading-tight'

  // ⚠️ The badge now only ASKS. The confirmation, the busy state and the error all moved to the dialog,
  // which is why this component no longer carries any of them.
  const removeBadge = (
    <button onClick={e => { e.preventDefault(); e.stopPropagation(); onRequestDelete() }}
      title={`Remove this ${label}`} aria-label={`Remove this ${label}`}
      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white border border-slate-300 text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-400 text-[9px] leading-none flex items-center justify-center shadow-sm">✕</button>
  )

  if (src && !broken) {
    return (
      <span className="relative flex-shrink-0 inline-flex">
        <a href={src} target="_blank" rel="noreferrer" title={`Open full-size ${label}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={label} onError={() => setBroken(true)}
            className={`${box} object-cover border border-slate-200 bg-white hover:ring-2 hover:ring-orange-400`} />
        </a>
        {removeBadge}
      </span>
    )
  }
  if (src && broken) {
    return (
      <span className="relative flex-shrink-0 inline-flex">
        <span className={`${box} border border-amber-300 bg-amber-50 text-amber-700 cursor-help`}
          title={`${label}: stored value does not load — ${value}`}>⚠ broken</span>
        {removeBadge}
      </span>
    )
  }
  // Empty: nothing to remove, so no badge. Filling it is done by dropping on the table cell.
  return (
    <span className={`${box} border border-dashed border-slate-300 bg-slate-50 text-slate-400`}
      title={`No ${label} stored`}>no {label}</span>
  )
}

// ── (3) ONE CONTACT-HISTORY ENTRY, COLLAPSED BY DEFAULT ──────────────────────────────────────────────
// 🧪 All three stored bodies are real emails — 295, 584 and 801 characters, with 7, 13 and 15 line breaks.
// Rendered in full they made the modal enormous, which is what this fixes.
//
// 🔴 THE EXPAND CONTROL APPEARS ONLY WHEN IT WOULD DO SOMETHING. `needsClamp` is decided from the TEXT,
// not from measuring the rendered box: two or more line breaks, or more than 160 characters. A short
// body ("Called, no answer") gets no control at all, because a control that expands nothing is worse
// than none. ⚠️ A text rule is approximate at the margin — a 150-character single-line body that happens
// to wrap to three lines would clamp with no way to expand. Chosen anyway over measuring `scrollHeight`,
// which needs a layout pass I cannot verify from here and fails silently in the wrong direction.
//
// 🔴 WHITESPACE SURVIVES BOTH STATES: `whitespace-pre-wrap` is on the body in collapsed AND expanded
// form, so the paragraph breaks in these emails are preserved either way.
// ⚠️ INERTNESS CHECKED: `line-clamp-2` needs `display:-webkit-box`, and the unlayered `!important` rule
// in globals.css targets `input[type=…]`, `select` and `textarea` — this is a <p>, so nothing overrides it.
// ── 🔴 CONTACT HISTORY AS A REAL TABLE ──────────────────────────────────────────────────────────────
// The previous pass aligned the metadata but kept a one-line body preview under every entry, so each
// contact still occupied two lines and the metadata still read as a heading above prose. A thing cannot
// look like a table while every row carries text beneath it. So: a header row, ONE line per contact,
// four columns, and NOTHING else on the row. The body moved out of the row entirely.
//
// 🔴 COLUMN POSITIONS ARE FIXED BY A <colgroup> ON A `table-fixed` TABLE, not by flex or grid guesswork.
// ⚠️ NO `minWidth` IS SET, deliberately: `table-fixed` distributes any surplus of minWidth over the
// colgroup sum across EVERY column, which is how a previous table here silently widened all of its
// columns. With `w-full` and three fixed widths, the surplus lands in the one auto column (channel).
//
// 🔴 ACCORDION — ONE ROW OPEN AT A TIME. Chosen over independent toggles because this table's job is
// comparison down a column; two bodies open at once pushes the rows apart and re-creates the wall of
// prose being removed. The open row is held HERE, in the table, so opening a second closes the first.
const HISTORY_COLS = [
  // 🔴 104, NOT 76 — MEASURED, NOT CHOSEN. At 76 the inner width is 64px and "10 Sept 2026" renders
  // 78.3px wide, so a two-digit day overran its own column and sat 2.3px INSIDE the Direction text.
  // 104 with px-2 leaves 84px of inner width for a 78.3px string, and a ~14px gap to the next column.
  { key: 'date', label: 'Date', width: 104 },
  // 🔴 WAS A 26px ARROW COLUMN WITH A BLANK HEADER. The arrow made the column self-explanatory only to
  // whoever wrote it: → and ← carry no direction without a legend. The word carries it, and a titled
  // column is what makes this read as a table rather than as decorated prose.
  { key: 'dir', label: 'Direction', width: 86 },
  { key: 'stage', label: 'Stage', width: 132 },
  { key: 'channel', label: 'Channel', width: undefined }, // auto: absorbs the remainder
  { key: 'view', label: '', width: 46 },
] as const

// 🔴 STICKY HEADER AND ROW TINTS ARE INLINE STYLES, NOT UTILITIES. The container scrolls, so the header
// has to stay put and must paint an opaque band over the rows sliding under it — a utility that failed to
// generate would leave the header transparent and the rows would smear through it. The z-[85] lesson.
const HDR_CELL: CSSProperties = { position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }
const INBOUND_BG = '#ecfdf5'

/** 🔴 THE FULL MESSAGE, IN A POPOUT — NOT EXPANDED IN PLACE.
 *  This replaces the click-to-expand accordion. The reason is the left column: it measures 491px at
 *  1440px and it SHRINKS, so an email body rendered inside a row turned the four-column table straight
 *  back into the wall of prose that the table was built to replace, and pushed every later row out of
 *  view. A popout gets the full window width and leaves the table's geometry untouched.
 *  Escape closes THIS and nothing else: capture phase + stopPropagation beats the prospect modal's
 *  bubble-phase window listener regardless of registration order. Same rule as ScheduleEventsPopup. */
function ContactPopout({ contact, onClose, onDelete }: {
  contact: Contact
  onClose: () => void
  /** Rejects on failure — the confirm dialog shows the reason and stays open. */
  onDelete: () => Promise<void>
}) {
  const [mounted, setMounted] = useState(false)
  const [confirming, setConfirming] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // 🔴 WHILE THE CONFIRMATION IS OPEN, ESCAPE IS NOT THIS WINDOW'S TO HANDLE. Both listeners are
      // registered on `window` in the CAPTURE phase, and two capture listeners on the same target BOTH
      // fire — `stopPropagation` does not stop a sibling on the same node, only `stopImmediatePropagation`
      // would. Without this guard one Escape would close the dialog AND this popout underneath it.
      // Guarding here rather than changing ConfirmDeleteDialog keeps a dialog shared with the media and
      // event deletes untouched.
      if (confirming) return
      e.stopPropagation(); e.preventDefault(); onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose, confirming])
  if (!mounted) return null
  const inbound = contact.direction === 'inbound'
  return createPortal(
    // 🔴 90, ABOVE THE COMPOSE WINDOW'S 85 — and inline, for the reason recorded on that file: an
    // arbitrary z-index used by exactly one file may have no generated rule at all.
    <div style={{ zIndex: 90 }} className="fixed inset-0 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose} role="presentation">
      <div role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[calc(100vh-6rem)] flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200 flex-shrink-0">
          <span className="text-sm font-semibold text-slate-900 tabular-nums">{fmtDate(contact.contacted_at)}</span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded"
            style={{ background: inbound ? INBOUND_BG : '#f1f5f9', color: inbound ? '#065f46' : '#334155' }}>
            {directionLabel(contact.direction)}
          </span>
          <span className="text-xs text-slate-500" title={contact.kind ?? undefined}>{kindLabel(contact.kind)}</span>
          <span className="text-xs text-slate-400">{channelLabel(contact.channel)}</span>
          <button onClick={onClose} autoFocus
            className="ml-auto text-sm font-semibold px-3 py-1 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-400">
            Close
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">
          {contact.message
            ? <p className="text-sm text-slate-800 whitespace-pre-wrap break-words">{contact.message}</p>
            : <p className="text-sm text-slate-400 italic">No message was recorded with this contact.</p>}
        </div>

        {/* 🔴 THE DELETE LIVES HERE, NOT ON THE TABLE ROW. The history table's five columns and their
            measured widths are settled; the last one is 46px and holds View, with no room for a second
            affordance. This window already displays the four facts the confirmation has to name, so
            opening the row IS the disambiguation step. */}
        <div className="px-5 py-3 border-t border-slate-200 flex items-center gap-3 flex-shrink-0">
          <span className="text-[11px] text-slate-500">Logged by mistake?</span>
          <button onClick={() => setConfirming(true)}
            className="ml-auto text-sm font-semibold px-3 py-1 rounded-lg border border-red-300 text-red-700 bg-red-50 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-400">
            Delete this contact
          </button>
        </div>

        {/* 🔴 REUSED, NOT REBUILT — the SAME dialog the media and event deletes use. It already gives
            Cancel-focused-on-open, Escape, backdrop-cancel, a busy lock and the server's own message
            shown in place. A second confirmation would be the fourth-independent-copy mistake the
            file's own header warns about.
            🔴 RENDERED INSIDE THE POPOUT'S PANEL, not beside it: the panel stops click propagation, so
            a click on the dialog's backdrop cancels the DIALOG without also reaching this window's
            backdrop and closing it. Its `z-[70]` resolves inside this window's zIndex:90 stacking
            context, so it paints above this content and above the modal underneath. */}
        {confirming && (
          <ConfirmDeleteDialog
            title="Delete this contact?"
            confirmLabel="Delete contact"
            onCancel={() => setConfirming(false)}
            onConfirm={onDelete}>
            <div className="mt-2 text-sm text-slate-700 space-y-2">
              <p>This row will be removed from the contact history:</p>
              <ul className="text-[13px] bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 space-y-0.5">
                <li><span className="text-slate-400">Date </span>{fmtDate(contact.contacted_at)}</li>
                <li><span className="text-slate-400">Direction </span>{directionLabel(contact.direction)}</li>
                <li><span className="text-slate-400">Stage </span>{kindLabel(contact.kind)}</li>
                <li><span className="text-slate-400">Channel </span>{channelLabel(contact.channel)}</li>
              </ul>
              <p className="font-semibold text-red-800">This cannot be undone. There is no recovery.</p>
              <p className="text-[13px] text-slate-500">
                “Last contacted” is recalculated from the rows that remain. The follow-up date is cleared
                or moved back to the one the previous contact implies — unless you set it by hand, in
                which case it is left alone. The stage on the prospect is not changed.
              </p>
            </div>
          </ConfirmDeleteDialog>
        )}
      </div>
    </div>, document.body)
}

function HistoryTable({ contacts, onDelete }: {
  contacts: Contact[]
  /** Rejects on failure. Passed through to the popout, which owns the confirmation. */
  onDelete: (c: Contact) => Promise<void>
}) {
  const [viewing, setViewing] = useState<Contact | null>(null)

  // 🔴 OLDEST AT THE TOP — and sorted HERE, not upstream. /api/admin/outreach returns contacts
  // newest-first and `lastContactedAt` is read off contacts[0], so reversing the fetch would silently
  // change the table's "Last contacted" column. Sorting a copy at the point of display cannot.
  // Array.prototype.sort is stable, so same-day rows keep the server's order rather than shuffling.
  const rows = useMemo(
    () => [...contacts].sort((a, b) => (a.contacted_at < b.contacted_at ? -1 : a.contacted_at > b.contacted_at ? 1 : 0)),
    [contacts])

  if (contacts.length === 0) {
    // 🔴 An empty history is still ONE line — no header, no empty table furniture.
    return <p className="text-xs text-slate-400 px-1 py-0.5">No contacts yet.</p>
  }

  return (
    <>
      <table className="w-full table-fixed text-xs border-collapse">
        <colgroup>
          {HISTORY_COLS.map(c => <col key={c.key} style={c.width ? { width: c.width } : undefined} />)}
        </colgroup>
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-slate-500">
            {HISTORY_COLS.map(c => (
              <th key={c.key} style={HDR_CELL}
                className="text-left font-bold px-2 py-1.5 border-b border-slate-300">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(c => {
            const inbound = c.direction === 'inbound'
            const open = () => setViewing(c)
            // 🔴 AN INBOUND ROW IS A REPLY, WHATEVER IT HAPPENS TO STORE. `kind` records which rung of
            // MY ladder a touch was; an inbound row is not my touch, so the stored value cannot be
            // right and the column renders the only thing an inbound row can mean.
            // 🔴 NO MARKER ON A LEGACY VALUE. There was one — a ⚠ on any stored value outside the
            // vocabulary — and it fired on 8 of the 10 live rows, which is not a flag, it is wallpaper.
            // The humanised label carries the whole job: the row reads as words ("Follow up"), and the
            // `title` still names the exact stored string for anyone who needs it.
            return (
              // 🔴 THE WHOLE ROW IS THE CONTROL, and it is keyboard-reachable — a <tr> with an onClick
              // alone is not. An inbound row is tinted with an INLINE background: `border-sky-200` has
              // zero other users in this repo, and a colour class that failed to resolve would remove
              // the distinction silently, which is the failure this is guarding against.
              <tr key={c.id}
                onClick={open}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() } }}
                tabIndex={0} role="button" title="Open this contact"
                style={{ backgroundColor: inbound ? INBOUND_BG : undefined }}
                className={`border-b border-slate-100 align-baseline cursor-pointer ${
                  inbound ? 'hover:brightness-95' : 'hover:bg-slate-50'} focus:outline-none focus:ring-2 focus:ring-orange-400`}>
                {/* The inbound accent is an INSET BOX-SHADOW, not a border: `border-collapse` on the
                    table drops a border set on a single cell, and box-shadow is not collapsed. */}
                <td className="px-2 py-1 text-slate-500 tabular-nums whitespace-nowrap"
                  style={{ boxShadow: inbound ? 'inset 3px 0 0 #10b981' : undefined }}>{fmtDate(c.contacted_at)}</td>
                <td className={`px-2 py-1 font-semibold whitespace-nowrap ${inbound ? 'text-emerald-700' : 'text-slate-500'}`}>
                  {directionLabel(c.direction)}
                </td>
                {/* Same weight and colour as Direction — it was reading a shade heavier than the rest
                    of the row (text-slate-700 / text-emerald-900 against 500 / 700). */}
                <td className={`px-2 py-1 font-semibold truncate ${inbound ? 'text-emerald-700' : 'text-slate-500'}`}
                  title={c.kind ?? undefined}>
                  {inbound ? kindLabel(REPLY_KIND) : kindLabel(c.kind)}
                </td>
                <td className="px-2 py-1 text-slate-500 truncate">{channelLabel(c.channel)}</td>
                <td className="px-2 py-1 text-right">
                  <span className="text-orange-600 font-semibold underline decoration-dotted">View</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {viewing && (
        <ContactPopout contact={viewing} onClose={() => setViewing(null)}
          onDelete={async () => { await onDelete(viewing); setViewing(null) }} />
      )}
    </>
  )
}

function Detail({ p, hasContactName, onPatch, onLog, templates, onDeleteContact }: {
  p: Prospect
  hasContactName: boolean
  onPatch: (id: string, patch: Record<string, unknown>) => void
  /** Deletes ONE contact row. Rejects on failure so the confirm dialog can show why and stay open. */
  onDeleteContact: (pr: Prospect, c: Contact) => Promise<void>
  onLog: (p: Prospect, f: { channel: string; direction: string; kind: string; message: string; contacted_at: string }) => Promise<boolean>
  /** Loaded templates, or null when the table is unreachable. */
  templates: MessageTemplate[] | null
}) {
  const [contactName, setContactName] = useState(p.contact_name ?? '')
  const [email, setEmail] = useState(p.contact_email ?? '')
  const [phone, setPhone] = useState(p.phone ?? '')
  const [notes, setNotes] = useState(p.notes ?? '')
  // 🔴 NO DEFAULT, EVER. Seeded from the STORED value and nothing else: if the column is null this is ''.
  // The manual's standing rule is that no date is suggested or written automatically, and next_action_at
  // drives the overdue flag — a date nobody chose becomes an overdue prospect indistinguishable from a
  // real one across 231 rows. Showing a value that IS stored is not a suggestion; inventing one is.
  const [nextAt, setNextAt] = useState(p.next_action_at ?? '')

  const [channel, setChannel] = useState<string>('email')
  const [direction, setDirection] = useState<string>('outbound')
  const [kind, setKind] = useState<string>('1_first_contact')
  const [message, setMessage] = useState('')
  const [composeOpen, setComposeOpen] = useState(false)
  const today = toYMD(new Date())
  // ⚠️ A DEFAULT HERE IS CORRECT AND IS NOT THE THING THE MANUAL FORBIDS. This is when a contact
  // HAPPENED — a fact about the past, almost always today, and it writes only when Log is pressed. The
  // forbidden default is on next_action_at, which is a future commitment driving a work queue.
  const [contactedAt, setContactedAt] = useState(today)
  const [logging, setLogging] = useState(false)

  // 🔴 EVERY FIELD RESETS WHEN THE MODAL MOVES TO ANOTHER TRUCK. Without this, prev/next would carry the
  // previous truck's typed-but-unsaved email into the next truck's form — the component is not remounted
  // because only `p` changes.
  useEffect(() => {
    setContactName(p.contact_name ?? ''); setEmail(p.contact_email ?? ''); setPhone(p.phone ?? '')
    setNotes(p.notes ?? ''); setNextAt(p.next_action_at ?? ''); setNextTouched(false)
    setChannel('email'); setDirection('outbound'); setKind(defaultKindFor('outbound'))
    setMessage(''); setContactedAt(today)
    // 🔴 AN UNLOGGED PRE-FILL MUST NOT FOLLOW ME TO THE NEXT TRUCK. Same reset as every other
    // field: prev/next changes `p` without remounting, so this effect is the only thing
    // clearing a rendered-but-never-logged template.
    setComposeOpen(false)
  }, [p.id])   // eslint-disable-line react-hooks/exhaustive-deps

  const fieldCls = 'w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm'
  const labelCls = 'block text-[10px] uppercase tracking-wide font-bold text-slate-400 mb-0.5'
  const sectionCls = 'text-xs font-bold uppercase text-slate-500'
  const quickCls = 'text-xs px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold text-slate-600'
  const waPhone = phoneWhatsApp(p.phone, null).waPhone

  // ── TEMPLATE DERIVATIONS ────────────────────────────────────────────────────────────────────────
  // 🔴 WHATSAPP IS GATED ON `whatsapp_confirmed === true` — the SAME condition the live WhatsApp link
  // already uses on this row, so the two cannot disagree. 🧪 30 of 231 rows qualify.
  // ⚠️ Those 30 are a backfill that took the SCRAPED hint as confirmation: all 30 carry the hint
  // 'advertises', and there are exactly 30 'advertises' trucks — a 1:1 match. So "confirmed" here means
  // "the truck's own listing advertises WhatsApp", NOT that anyone verified it personally. The data is
  // not changed by this feature; the gate simply reads it.
  const offerable = useMemo(() => templatesFor(templates ?? [], p), [templates, p])
  // A SUGGESTION ONLY — rendered as a "(suggested)" marker on the option. Never auto-selected.
  const suggestedId = useMemo(() => suggestTemplateId(p), [p])
  // The substitution context for THIS row, built once and handed to the compose window. Everything is
  // nullable; the template mechanism decides what to fill, what to drop and what to leave visible.
  // 🔴 THE SHARED MAPPING — the Templates tab's preview builds its context with this same function, so
  // the two surfaces cannot render different emails for the same prospect.
  const tplCtx = useMemo(() => contextFromProspect(p), [p])

  // Quick-set: a button press IS the decision, so it writes — exactly like Clear already does. Nothing
  // is written by opening the modal, only by pressing something.
  const setNext = (days: number) => {
    const d = new Date(); d.setDate(d.getDate() + days)
    const ymd = toYMD(d)
    setNextAt(ymd); setNextTouched(true); onPatch(p.id, { next_action_at: ymd })
  }

  // 🔴 WHY THE DATE IS SET IN TWO PLACES, AND WHAT STOPS THEM FIGHTING.
  // (a) CHOOSING A STAGE fills the field immediately, so the date is VISIBLE before committing rather
  //     than appearing after. This is an onChange handler, NOT an effect — opening the modal fires
  //     nothing, so "the field is empty on open" is untouched.
  // (b) LOGGING persists it, because a stage chosen and never logged is not a commitment to anything.
  // 🔴 `nextTouched` is what stops (b) clobbering a hand-typed date. It is set by any manual edit — the
  // date input, a quick-set button, Clear — and reset whenever a stage is chosen. On log: touched means
  // "the operator decided", so their value is persisted verbatim, INCLUDING an empty one they cleared.
  const [nextTouched, setNextTouched] = useState(false)

  /** Local-only: fill the field from a stage. Never writes — see (a) above. */
  const fillNextFromKind = (k: string) => {
    setNextAt(followUpDateFor(k, contactedAt) ?? '')
    setNextTouched(false)
  }

  /** 🔴 THE ONE PLACE THE FOLLOW-UP DATE IS PERSISTED ON LOG — called by BOTH logging paths.
   *  It used to live only inside `submitLog`, so logging from the COMPOSE WINDOW — the path actually
   *  used to send — wrote a contact row and no date at all. That was a real bug; both callers now go
   *  through here. */
  const persistFollowUpAfterLog = (k: string) => {
    const due = nextTouched ? (nextAt || null) : followUpDateFor(k, contactedAt)
    setNextAt(due ?? '')
    setNextTouched(false)
    onPatch(p.id, { next_action_at: due })
  }

  // 🔴 LOGGING NOW SETS THE FOLLOW-UP DATE — A DELIBERATE REVERSAL OF THE MANUAL'S STANDING RULE.
  // The rule ("no date is ever suggested or written automatically") was written against a date derived
  // from the COUNT of outbound contacts, and both of its recorded failures were properties of counting:
  // a double-click made a first approach look like a third, and a count cannot tell chasing silence from
  // following up an engaged prospect. 🔴 A SELECTED STAGE HAS NEITHER PROBLEM — logging the same stage
  // twice yields the SAME date rather than a compounding one, and engagement is recorded by an inbound
  // row ending the ladder rather than inferred from a tally.
  //
  // 🔴 THE OTHER HALF OF THE RULE STANDS: THIS FIRES ON LOG, NEVER ON OPEN. `nextAt` is still seeded only
  // from `p.next_action_at ?? ''`, so the field is empty when the column is null and stays empty until
  // this function runs.
  //
  // ⚠️ THE DATE ALWAYS MATCHES THE STAGE JUST LOGGED, INCLUDING WHEN THAT MEANS CLEARING IT. One rule,
  // no hidden state: +3 / +7 / none. An existing date is overwritten because the ladder's whole point is
  // that the latest step governs — leaving a first-contact date in place after logging a chase would
  // leave a past date driving the work queue. And `3_chase_2` CLEARS rather than leaving a stale date
  // behind, because a finished sequence must not sit in the overdue queue for ever. Both are visible in
  // the field immediately and can be overridden or cleared by hand afterwards.
  // 🔴 THE REFUSAL IS VISIBLE BEFORE THE CLICK, NOT ONLY AFTER IT. Same pure function the writer uses,
  // over the rows already loaded for this prospect — so the button and the guard cannot disagree.
  const duplicate = useMemo(
    () => findDuplicateContact(p.contacts, { contacted_at: contactedAt, direction, kind, channel }),
    [p.contacts, contactedAt, direction, kind, channel])

  const submitLog = async () => {
    if (logging || duplicate) return
    setLogging(true)
    try {
      // 🔴 NOTHING ELSE HAPPENS IF THE WRITE WAS REFUSED. Clearing the textarea or moving the
      // follow-up date after a refusal would show the user the shape of a successful log.
      const ok = await onLog(p, { channel, direction, kind, message, contacted_at: contactedAt })
      if (!ok) return
      setMessage('')
      persistFollowUpAfterLog(kind)
    }
    finally { setLogging(false) }
  }

  return (
    <>
      {/* ── LEFT COLUMN — the fields I edit ───────────────────────────────────────────────────────── */}
      {/* 🔴 THE COLUMN NO LONGER SCROLLS — THE HISTORY TABLE INSIDE IT DOES.
          It was `self-start max-h-full overflow-y-auto`: sized to its content, with a scrollbar as a
          safety valve. Now that history lives here it must be the shrinkable child, so the column takes
          the full height (`min-h-0`, no `self-start`) and every sibling is `flex-shrink-0`. All of the
          shrinkage therefore lands on history, exactly as it did in the right column. */}
      <div className="flex flex-col gap-3 min-h-0 pr-1">
        {/* 🔴 EMAIL FIRST, on its own line with its own button: addresses are long and pairing one with
            anything else truncates it. Editable — writes discovery_trucks.contact_email on blur. */}
        <label className="block flex-shrink-0">
          <span className={labelCls}>Email</span>
          <div className="flex items-center gap-1">
            <input className={fieldCls} value={email} onChange={e => setEmail(e.target.value)}
              onBlur={() => email !== (p.contact_email ?? '') && onPatch(p.id, { contact_email: email })} />
            {p.contact_email && <a href={`mailto:${p.contact_email}`} className={linkCls}>Email</a>}
          </div>
        </label>

        {/* (4) PAIRED: contact name + phone (with the WhatsApp tick) share one line. Both short. */}
        <div className="grid grid-cols-2 gap-2 flex-shrink-0">
          <label className="block">
            <span className={labelCls}>Contact name</span>
            <input className={fieldCls} value={contactName} disabled={!hasContactName}
              placeholder={hasContactName ? 'Contact person' : 'needs the contact_name migration'}
              onChange={e => setContactName(e.target.value)}
              onBlur={() => hasContactName && contactName !== (p.contact_name ?? '') && onPatch(p.id, { contact_name: contactName })} />
          </label>
          <label className="block">
            <span className={labelCls}>Phone</span>
            <div className="flex items-center gap-2">
              <input className={fieldCls} value={phone} onChange={e => setPhone(e.target.value)}
                onBlur={() => phone !== (p.phone ?? '') && onPatch(p.id, { phone })} />
              <span className="flex items-center gap-1 text-xs text-slate-500 whitespace-nowrap"><WhatsAppBox p={p} onPatch={onPatch} /> WA</span>
            </div>
          </label>
        </div>

        {(p.phone || (p.whatsapp_confirmed === true && waPhone)) && (
          <div className="flex flex-wrap gap-1 -mt-1 flex-shrink-0">
            {p.phone && <a href={`tel:${p.phone}`} className={linkCls}>Call</a>}
            {p.whatsapp_confirmed === true && waPhone && <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noreferrer" className={linkCls}>WhatsApp</a>}
          </div>
        )}

        {/* ── 🔴 CONTACT HISTORY — MOVED TO THE LEFT COLUMN, ABOVE NOTES ─────────────────────────────
            🔴 THIS REVERSES AN EARLIER DECISION, DELIBERATELY, AND THE REVERSAL IS RECORDED RATHER THAN
            MADE QUIETLY. History was put directly above "Log a contact" so that what was last sent could
            be read immediately before writing the next message. That reasoning was about a PROSE
            PREVIEW — two clamped lines of the last email, which you read. It is now a four-column table
            you GLANCE at, and a glance does not need to be adjacent to the compose box. Meanwhile the
            right column was carrying history, four log fields, the compose entry, the body, the
            follow-up date and the button, while the left held three fields and a notes box.
            ⚠️ The full body is still one click away, in place, for when reading IS what is wanted.
            🔴 STILL THE ONLY SCROLLING REGION IN THE MODAL: `min-h-0 shrink overflow-y-auto`, with
            `flex-shrink:1 / flex-basis:auto` and NO flex-grow — so an empty history collapses to its
            one-line "No contacts yet." instead of reserving the leftover height, and a long one absorbs
            the shrinkage rather than pushing Notes off screen. */}
        <div className="flex flex-col min-h-0 shrink">
          <span className={labelCls}>Contact history</span>
          {/* 🔴 WHITE, NOT THE GREY CARD. The grey ground + 4px inset padding made this read as a
              boxed note; a table reads as a table on paper-white with a ruled header. The container
              is still the ONLY scroller in the modal, and it is still the only shrinkable child. */}
          <div className="min-h-0 shrink overflow-y-auto border border-slate-300 rounded-lg bg-white">
            <HistoryTable contacts={p.contacts} onDelete={c => onDeleteContact(p, c)} />
          </div>
        </div>

        {/* ── NOTES ───────────────────────────────────────────────────────────────────────────────── */}
        <label className="block flex-shrink-0">
          <span className={labelCls}>Notes</span>
          <textarea rows={3} className={`${fieldCls} resize-y`} value={notes}
            onChange={e => setNotes(e.target.value)}
            onBlur={() => notes !== (p.notes ?? '') && onPatch(p.id, { notes })} />
        </label>
      </div>

      {/* ── RIGHT COLUMN — history, then log a contact, then follow up ────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 min-h-0">
        {/* 🔴 THE COMPOSE WINDOW — portalled to <body>, layered above this modal. It writes NOTHING until
          its own log control is pressed, and its `onLog` is the SAME `log_contact` writer this modal's
          Log button uses; there is no second write path. */}
      {composeOpen && (
        <ComposeWindow
          truckName={p.name}
          toEmail={p.contact_email}
          offerable={offerable}
          suggestedId={suggestedId}
          ctx={tplCtx}
          whatsappConfirmed={p.whatsapp_confirmed === true}
          templatesLoaded={templates !== null}
          onClose={() => setComposeOpen(false)}
          onLog={async (editedBody, ch) => {
            // 🔴 `editedBody` IS THE TEXTAREA'S CURRENT VALUE, passed straight through to the writer.
            // It is never re-rendered from the template here — if the two diverge, what was edited is
            // what gets stored. `kind` and `contacted_at` come from the log form so the compose window
            // respects what is already selected there rather than inventing its own.
            const ok = await onLog(p, {
              channel: ch, direction: 'outbound', kind,
              message: editedBody, contacted_at: contactedAt,
            })
            // 🔴 THE BUG THIS FIXES: this path logged a contact and set NO follow-up date, because the
            // populate lived inside `submitLog` and the compose window does not call it. Logging from
            // the compose window is the path actually used to send, so the feature never fired there.
            // 🔴 AND IT RESPECTS A REFUSAL. `false` leaves the window un-logged, so the compose window
            // does not mark a send that was never recorded; the reason arrives as the writer's toast.
            if (ok) persistFollowUpAfterLog(kind)
            return ok
          }}
        />
      )}


        <p className={`${sectionCls} flex-shrink-0`}>Log a contact</p>
        {/* (6) FOUR CONTROLS ON ONE ROW — they fit at this width (the modal is max-w-6xl, so a column is
            ~540px and each control gets ~130px). Date first: it is the one most often changed. */}
        <div className="grid grid-cols-4 gap-2 flex-shrink-0">
          {/* 🔴 CAPPED AT TODAY. A contact cannot have happened in the future, and a mistyped future date
              would sort to the top of history and take `last contacted` with it. Past dates are free. */}
          {/* 🔴 LABELLED, AND THIS IS THE ACTUAL FIX FOR THE "next action shows today" REPORT. This input
              defaults to today BY DESIGN (a contact almost always happened today) and was the only
              UNLABELLED control in the modal — two bare date boxes, one showing today. `nextAt` never
              held today; this did. Both now say which is which. */}
          <label className="block">
            <span className={labelCls}>Contacted on</span>
            <input type="date" className={fieldCls} value={contactedAt} max={today}
              onChange={e => setContactedAt(e.target.value)} title="When this contact happened (cannot be in the future)" />
          </label>
          <label className="block"><span className={labelCls}>Channel</span>
            <select className={fieldCls} value={channel} onChange={e => setChannel(e.target.value)}>
              {CONTACT_CHANNELS.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
            </select>
          </label>
          <label className="block"><span className={labelCls}>Direction</span>
            {/* 🔴 CHANGING DIRECTION CHANGES KIND, because the two are not independent: an inbound row
                can only be a reply, and a reply is not a rung of the outbound ladder. Switching to
                inbound selects Reply (and clears the follow-up date, since a reply ends the sequence);
                switching back to outbound restores the first rung rather than leaving Reply selected
                on an outbound row, which is exactly the mislabelled state the live Azahar rows are in. */}
            <select className={fieldCls} value={direction}
              onChange={e => {
                const d = e.target.value
                setDirection(d)
                const k = kindsForDirection(d).includes(kind) ? kind : defaultKindFor(d)
                if (k !== kind) { setKind(k); fillNextFromKind(k) }
              }}>
              {CONTACT_DIRECTIONS.map(d => <option key={d} value={d}>{directionLabel(d)}</option>)}
            </select>
          </label>
          <label className="block"><span className={labelCls}>Kind</span>
            {/* 🔴 CHOOSING A STAGE FILLS THE FOLLOW-UP DATE IMMEDIATELY (local only, not written). */}
            <select className={fieldCls} value={kind}
              onChange={e => { setKind(e.target.value); fillNextFromKind(e.target.value) }}>
              {/* 🔴 SORTED BY kindOrder, NOT BY LABEL. The labels lost their numeric prefix, so
                  alphabetical order would now read Chase 1, Chase 2, First contact. The order is the
                  array position in CONTACT_KINDS, exported as kindOrder. */}
              {[...kindsForDirection(direction)].sort((a, b) => kindOrder(a) - kindOrder(b))
                .map(k => <option key={k} value={k}>{kindLabel(k)}</option>)}
            </select>
          </label>
        </div>
        {/* ── COMPOSE FROM TEMPLATE ────────────────────────────────────────────────────────────────
            🔴 THE PICKER, THE SUBJECT PREVIEW, THE "STILL TO FILL" BANNER AND THE FOOTER PREVIEW ALL
            MOVED OUT of this block into ComposeWindow. This block was too small to read an email in,
            which was the whole complaint. What is left here is the log form itself.
            🔴 THIS BUTTON OPENS A WINDOW. It writes nothing. */}
        <button
          onClick={() => setComposeOpen(true)}
          className="w-full text-sm font-semibold px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-400 flex-shrink-0">
          Compose from template…
        </button>

        {/* ~8 rows at rest (was 2 — too small to paste an email into), still resizable. */}
        <textarea className={`${fieldCls} resize-y flex-shrink-0`} rows={8} placeholder="Message body (optional)"
          value={message} onChange={e => setMessage(e.target.value)} />

        {/* ── FOLLOW UP ON — 🔴 MOVED ABOVE THE BUTTON (was directly under it). The order of the controls now
            matches the order of the work: read the history, write the message, set the date, then commit.
            A control that sits BELOW the button that commits is a control you find after committing.
            ⚠️ Logging also writes this field — see submitLog — so what is shown here immediately after a
            log is the date that stage implies, and it can be overridden or cleared right here.
            🔴 THE FIELD IS EMPTY WHEN THE COLUMN IS NULL. `nextAt` is seeded from `p.next_action_at ?? ''`
            and re-seeded from the same expression on every prev/next — there is no path that puts today
            in it except pressing a button. 🧪 230 of 231 rows are null and render blank; Tikka Tonic
            (2026-09-14) still renders its stored date. The write behaviour is UNCHANGED. */}
        <div className="flex-shrink-0 border-t border-slate-100 pt-2">
          <span className={labelCls}>Follow up on</span>
          <div className="flex flex-wrap items-center gap-1.5">
            <input type="date" className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm" value={nextAt}
              onChange={e => { setNextAt(e.target.value); setNextTouched(true) }}
              onBlur={() => nextAt !== (p.next_action_at ?? '') && onPatch(p.id, { next_action_at: nextAt || null })} />
            <button onClick={() => setNext(1)} className={quickCls}>Tomorrow</button>
            <button onClick={() => setNext(3)} className={quickCls}>+3 days</button>
            <button onClick={() => setNext(7)} className={quickCls}>+1 week</button>
            <button onClick={() => { setNextAt(''); setNextTouched(true); onPatch(p.id, { next_action_at: null }) }}
              className={quickCls}>Clear</button>
          </div>
        </div>

        {/* 🔴 WHAT THE UI DOES WHEN IT REFUSES: it says which row it would duplicate and what to change,
            and the button is disabled rather than clickable-then-rejected. Nothing is written, nothing
            is cleared, and the message is not a toast that scrolls away — it stays until the stage, the
            channel, the direction or the date changes, because those are the four things that would
            make this a different contact. */}
        {duplicate && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 flex-shrink-0"
            role="status">
            Already logged on {fmtDate(duplicate.contacted_at)}: <b>{kindLabel(kind)}</b> by <b>{channelLabel(channel)}</b>.
            Change the stage, the channel or the date to log a different contact.
          </p>
        )}
        <button onClick={submitLog} disabled={logging || !!duplicate}
          title={duplicate ? 'An identical contact is already recorded for that date' : undefined}
          className="w-full bg-orange-600 hover:bg-orange-700 text-white text-sm font-bold py-1.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0">
          {logging ? 'Logging…' : duplicate ? 'Already logged' : 'Log contact'}
        </button>


      </div>
    </>
  )
}
