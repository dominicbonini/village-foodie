// lib/outreach-filter.ts
//
// THE OUTREACH TABLE'S FILTER PREDICATE — one pure function, one place.
//
// 🔴 WHY THIS IS A MODULE AND NOT A useMemo IN THE PANEL. Two reasons, both practical:
//   1. Adding a filter later is ONE entry in `EMPTY_OUTREACH_FILTER` and ONE clause in
//      `matchesOutreachFilter` — not a new condition threaded through a render tree.
//   2. 🔴 NO ADMIN SESSION IS OBTAINABLE IN THIS ENVIRONMENT (manual V12.2, "NO ADMIN SURFACE CAN BE
//      VERIFIED BEFORE THE OPERATOR SEES IT"), so the panel itself cannot be driven end-to-end here.
//      A pure function over a plain row object CAN be, with no React, no network and no database.
//      That is the whole reason the logic lives outside the component.
//
// 🔴 IT FILTERS. IT NEVER WRITES. Nothing in this file mutates its input or calls anything — every
// function is a pure read of `row` and `f`. A filter that could alter a row would be able to destroy
// exactly the tri-state distinction described below.

import { isOverdue, type OutreachStage } from '@/lib/outreach'

// ── THE THREE-STATE PROBLEM, WHICH IS THE POINT OF THIS FILE ────────────────────────────────────────
// `hu_map`, `hu_ordering`, `whatsapp_confirmed` and `do_not_contact` are NULLABLE BOOLEANS, and the
// route writes only `true` or `NULL` — never `false` (app/api/admin/outreach/route.ts, update_prospect:
// `body.x === true ? true : null`).
//
//   true  = yes, someone checked and it is so
//   NULL  = NOBODY CHECKED. It is not "no".
//   false = checked and absent. Nothing writes it today; it may exist in data.
//
// 🔴 A CHECKBOX ON ANY OF THESE WOULD BE A BUG. A two-state control forces "not true" into one bucket,
// which conflates "checked and absent" with "never checked" — the exact distinction those columns exist
// to preserve. The manual is explicit: the source is one map viewport over a seven-day window, so
// ABSENCE FROM IT IS NEVER EVIDENCE AGAINST, and a truck trading fortnightly reads identically to one
// that has never used ordering.
//
// ⚠️ THREE POSITIONS, AND A DOCUMENTED FOURTH STATE. 'yes' matches true; 'unknown' matches NULL only.
// A `false` row (should one ever appear) matches NEITHER, and is reachable only via 'any'. That is
// deliberate: folding false into 'unknown' would silently re-create the conflation this file exists to
// prevent. If false ever starts being written, add a fourth position here — one entry, one clause.
export type TriFilter = 'any' | 'yes' | 'unknown'

// For fields where absence is a FACT rather than an unknown: we either hold an email address or we do
// not. 'no' here genuinely means "we have none", not "nobody looked".
export type PresenceFilter = 'any' | 'yes' | 'no'

// The merged Schedule column's three visible states (see MERGED SCHEDULE below).
export type ScheduleFilter = 'any' | 'upcoming' | 'stale' | 'none'

// ⚠️ `next_action_at` is a NULLABLE DATE, not a nullable boolean, so it does NOT take the tri-state
// treatment above: an absent date means NO NEXT ACTION IS SCHEDULED, which is a fact we hold, not an
// "unknown". Overdue vs scheduled is decided by `isOverdue` — the SAME helper the row's red ⚠ marker
// uses, so the filter and the cell can never disagree about what "overdue" means.
export type NextActionFilter = 'any' | 'overdue' | 'scheduled' | 'none'

export type OutreachFilterState = {
  search: string
  huOrdering: TriFilter
  huMap: TriFilter
  whatsapp: TriFilter
  email: PresenceFilter
  phone: PresenceFilter
  stage: 'any' | OutreachStage
  schedule: ScheduleFilter
  nextAction: NextActionFilter
  logo: PresenceFilter
  photo: PresenceFilter
}

export const EMPTY_OUTREACH_FILTER: OutreachFilterState = {
  search: '',
  huOrdering: 'any',
  huMap: 'any',
  whatsapp: 'any',
  email: 'any',
  phone: 'any',
  stage: 'any',
  schedule: 'any',
  nextAction: 'any',
  logo: 'any',
  photo: 'any',
}

// The row fields this module reads — structural, so the panel's richer `Prospect` satisfies it without
// importing anything from the component (and a test can build one by hand).
export type FilterableRow = {
  name: string
  contact_email: string | null
  phone: string | null
  stage: string
  hu_map: boolean | null
  hu_ordering: boolean | null
  whatsapp_confirmed: boolean | null
  do_not_contact: boolean | null
  futureEventCount: number
  lastEventDate: string | null
  next_action_at: string | null
  logo_url: string | null
  photo_url: string | null
}

// ── MERGED SCHEDULE ─────────────────────────────────────────────────────────────────────────────────
// 🔴 `hasSchedule` IS THE EXISTING TEST, MOVED, NOT A NEW ONE. It was `p.futureEventCount > 0 ||
// !!p.lastEventDate` inline in the Row component; nothing about what counts as a schedule changed.
// Y = at least one event known, past OR future. N = none known.
export const hasSchedule = (row: Pick<FilterableRow, 'futureEventCount' | 'lastEventDate'>): boolean =>
  row.futureEventCount > 0 || !!row.lastEventDate

// 🔴 THREE STATES, NOT TWO, AND Y(0) IS THE ONE THAT MATTERS. A truck with a schedule and nothing
// upcoming is a DIFFERENT PROSPECT from one with no schedule at all — the first has been seen trading
// and has gone quiet; the second we simply know nothing about. Rendering either as a bare "0" collapses
// them, which is why the cell renders `Y (n)` / `N` and never a naked number.
export type ScheduleState = 'upcoming' | 'stale' | 'none'
export function scheduleState(row: Pick<FilterableRow, 'futureEventCount' | 'lastEventDate'>): ScheduleState {
  if (!hasSchedule(row)) return 'none'          // N
  return row.futureEventCount > 0 ? 'upcoming'  // Y (n>0)
    : 'stale'                                   // Y (0)  ← the distinction being protected
}

// ── THE PREDICATES ──────────────────────────────────────────────────────────────────────────────────
const triMatch = (value: boolean | null | undefined, f: TriFilter): boolean => {
  if (f === 'any') return true
  if (f === 'yes') return value === true
  return value == null            // 'unknown' — NULL only; false is not "unknown"
}

const presenceMatch = (value: string | null | undefined, f: PresenceFilter): boolean => {
  if (f === 'any') return true
  const present = !!(value && value.trim())
  return f === 'yes' ? present : !present
}

/**
 * 🔴 THE ONE PREDICATE. Every filter the table offers is a clause in here, and they combine with AND.
 * Pure: reads `row` and `f`, returns a boolean, touches nothing.
 */
export function matchesOutreachFilter(row: FilterableRow, f: OutreachFilterState): boolean {
  const q = f.search.trim().toLowerCase()
  if (q && !row.name.toLowerCase().includes(q)) return false

  if (!triMatch(row.hu_ordering, f.huOrdering)) return false
  if (!triMatch(row.hu_map, f.huMap)) return false
  if (!triMatch(row.whatsapp_confirmed, f.whatsapp)) return false
  // 🔴 THE do_not_contact PREDICATE WAS REMOVED 16 September 2026. It is no longer a per-row filter:
  // flagged prospects are excluded from the POOL in OutreachPanel (`pool`), so they vanish from the
  // rows AND from every count, which a predicate here could never do — this function narrows rows and
  // the totals are computed elsewhere.

  if (!presenceMatch(row.contact_email, f.email)) return false
  if (!presenceMatch(row.phone, f.phone)) return false

  if (f.stage !== 'any' && row.stage !== f.stage) return false

  if (f.schedule !== 'any' && scheduleState(row) !== f.schedule) return false

  // Added at the operator's request after the first pass. A NEW clause — it does not touch any predicate
  // above it, and the counts every other filter returns are unchanged (proven by regression in the report).
  if (f.nextAction !== 'any') {
    const set = !!row.next_action_at
    const over = isOverdue(row.next_action_at)
    if (f.nextAction === 'overdue' && !over) return false
    if (f.nextAction === 'scheduled' && !(set && !over)) return false   // set, and today or later
    if (f.nextAction === 'none' && set) return false
  }

  // ⚠️ PRESENCE, NOT TRI-STATE. Unlike hu_map / hu_ordering, a null here means the column is genuinely
  // EMPTY — there is no "nobody checked" reading of a missing image, so Any / Has / Missing is the honest
  // shape and `presenceMatch` (already used by email and phone) is the right helper.
  // 🔎 These reuse presenceMatch unchanged; nothing above this line was touched.
  if (!presenceMatch(row.logo_url, f.logo)) return false
  if (!presenceMatch(row.photo_url, f.photo)) return false

  return true
}

/** Whether anything is narrowing the list — drives the "n of N" line and the Clear button. */
export function isFilterActive(f: OutreachFilterState): boolean {
  return (
    f.search.trim() !== '' ||
    f.huOrdering !== 'any' || f.huMap !== 'any' || f.whatsapp !== 'any' ||
    f.email !== 'any' || f.phone !== 'any' || f.stage !== 'any' || f.schedule !== 'any' ||
    f.nextAction !== 'any' || f.logo !== 'any' || f.photo !== 'any'
  )
}
