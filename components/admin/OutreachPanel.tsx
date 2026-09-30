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

import { useEffect, useMemo, useState, useCallback, useRef, memo } from 'react'
import { useRouter } from 'next/navigation'
import { nativeAuthHeader } from '@/lib/native/session'
import ScheduleEventsPopup from '@/components/admin/ScheduleEventsPopup'
import type { MailImportResult, MailImportResponse } from '@/lib/outreach-mail-import-result'
// Only the two GATING helpers are needed here now; the picker, the renderer, the footer and the
// copy action all live in ComposeWindow.
// 🔴 TEMPLATES COME FROM THE DATABASE NOW. This module holds the MECHANISM only — no message copy.
// ── 🔴 THE SHARED PIECES MOVED OUT (30 September 2026) ─────────────────────────────────────────────
// The prospect view is a PAGE now, not a modal inside this file, and a page cannot import a private
// function out of a component. Everything both surfaces render — the email viewer, the attachment
// list, the contact popout, the thumbnails, the prospect types — lives in `outreach-shared.tsx`,
// unchanged. What stayed here is what only the LIST uses.
import {
  type Prospect,
  STATUS_LABEL, fmtDate, mediaSrc, confirmLogoWrite,
  TriStateBox, WhatsAppBox, useThumbLatch, INBOUND_BG,
} from '@/components/admin/outreach-shared'
import { phoneWhatsApp } from '@/lib/whatsapp-hint'   // pure — used only to build the wa.me link
// 🔴 THE DERIVED STEP. Pure, no I/O, no stored state — see lib/outreach-step.ts. Imported here rather
// than reimplemented so the queue, the row label and the composer's pre-selection read ONE answer.
import {
  nextStep, needsAttention as stepNeedsAttention, LEAD_TYPE_LABELS,
  channelFor, hasValue,
  type Step,
} from '@/lib/outreach-step'
// ── 🔴 THE CRM RULES LIVE IN lib/, NOT IN THIS FILE ────────────────────────────────────────────────
// "Is this reply waiting for me", "when does a snooze come back", "what order does the timeline go
// in" and "what is on the Today screen" are all decisions, and a decision written inside a component
// cannot be tested without a browser. Each of these is pure and has a harness standing on it.
import { SNOOZE_OPTIONS, SNOOZE_LABELS } from '@/lib/outreach-attention'
import {
  buildToday, PROBLEM_LABEL,
  type WaitingReply, type ProblemEmail, type TodayProspect, type TodayView, type SnoozedReply,
} from '@/lib/outreach-today'
import { getLocalDateInTz } from '@/lib/time-utils'
// 🔴 THE QUEUE A PROSPECT PAGE IS OPENED FROM. A modal could walk `visible` directly; a route cannot,
// so the list it came from is recorded on the way out. See that module's header.
import { saveQueue, saveReturn, readReturn, prospectPath } from '@/lib/outreach-queue'

/** What `/api/admin/outreach/today` returns. */
interface TodayPayload {
  ok: boolean
  migrationApplied: boolean
  waiting: WaitingReply[]
  problems: ProblemEmail[]
  /** Snoozed replies — listed under their own collapsed heading, never counted as work. */
  snoozed?: SnoozedReply[]
}

import {
  OUTREACH_STAGES,
  kindOrder,
  isOverdue,
  isHatchesUp,
  // ⚠️ `LEAD_LABELS` IMPORT REMOVED 16 September 2026 — its only reader here was the Contact cell's
  // tooltip. It is still exported from lib/outreach.ts for any future reader; nothing there changed.
  leadOf,
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


// ── SORTABLE COLUMNS ─────────────────────────────────────────────────────────────────────────────────
// Each column exposes one comparable value (or null). 🔴 NULL ALWAYS SORTS LAST, in both directions — it
// is not "the smallest value", it is "no value", so it is pinned to the bottom regardless of asc/desc.
// The Hatches Up column sorts by the tick state; Schedule by upcoming-event count, with "no schedule at
// all" (no upcoming and no past) treated as null → last.
type SortKey = 'logo' | 'photo' | 'name' | 'email' | 'mobile' | 'whatsapp' | 'hu_map' | 'hu_ordering' | 'schedule' | 'stage' | 'last_contacted' | 'next_action' | 'next_step'
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
  { key: 'logo', label: 'Logo', title: "The truck's logo. Once a prospect has a HatchGrab truck or a live demo this IS that truck's own logo (trucks.logo_storage_path) — changing it changes what its customers see. Until then it is the prospect's scraped logo (discovery_trucks.logo_url). Drop an image on an EMPTY slot to upload. A broken marker means the stored value does not resolve." },
  { key: 'photo', label: 'Photo', title: 'discovery_trucks.photo_url. Drop an image on an EMPTY slot to upload it.' },
  { key: 'name', label: 'Truck' },
  // 🔴 ONE DERIVED COLUMN REPLACING THE PHONE AND EMAIL VALUE COLUMNS. It answers the only question the
  // list can act on: can I reach this truck, and if not, what is the lead worth chasing?
  //   reachable  → the channel a message would go out on — "Email" or "WhatsApp"
  //   NOT        → the LEAD host instead — hatchesup.app, a real site, a Facebook page, or nothing
  // 🔴 THE PREDICATE IS `channelFor`, REUSED, NOT REWRITTEN. 🧪 It already computes exactly the operator's
  // rule (an email, OR whatsapp_confirmed with a usable discovery_trucks.phone) and therefore exactly his
  // 76/155 split — see the queue report. A second copy here would be a second definition of "contactable".
  // ⚠️ IT CALLS `channelFor(p)` DIRECTLY AND DELIBERATELY IGNORES `step.channel`. 🧪 `nextStep` builds its
  // `base` with `channel: null` and every STOP returns that base, so a do-not-contact prospect WITH an
  // email reports `step.channel === null`. Reading the step here would file 6 reachable trucks under
  // "no lead" — proved before this column was written, not after.
  // 🔴 THE DERIVED "Contact" COLUMN WAS REPLACED BY TWO PRESENCE TICKS (16 September 2026). It printed
  // either the channel a message would go out on or the best lead host to chase instead — one cell doing
  // two unrelated jobs, neither of which answered the question actually asked of the list ("do we hold an
  // address / a number for this truck?").
  // 🔴 `channelFor` IS UNTOUCHED AND STILL GATES THE WORK QUEUE (§57.2). Only this COLUMN went; the
  // derivation and the queue still call it. These two columns share `channelFor`'s own presence test via
  // the extracted `hasValue`, so a tick and the queue can never disagree.
  // ⚠️ READ-ONLY GLYPHS, NOT INPUTS. Every other tick in this table (WhatsApp, HU ordering, HU map) IS an
  // editor, so these two deliberately render a character rather than a checkbox — a disabled checkbox
  // still reads as "a control you may not use" rather than "a fact".
  { key: 'email', label: 'Email', title: 'discovery_trucks.contact_email — ✓ when an address is stored. READ-ONLY here; the value is edited in the prospect panel. Same presence test the work queue gates on (non-blank after trimming).' },
  { key: 'mobile', label: 'Mobile', title: 'discovery_trucks.phone — ✓ when a number is stored. READ-ONLY here; the value is edited in the prospect panel. Same presence test the work queue gates on (non-blank after trimming). ⚠️ This is `phone`, the column the prospect modal shows — NOT `mobile`, which the modal does not display.' },
  { key: 'whatsapp', label: 'WhatsApp', title: 'MY confirmation the number works on WhatsApp (outreach_prospects.whatsapp_confirmed). Ticked = confirmed; empty = not confirmed. Untick clears to "not checked".' },
  // ⚠️ ORDERING BEFORE MAP, at the operator's request: "seen USING online ordering" is the stronger
  // buying signal, so it reads first. The FILTER BAR follows this array, so swapping these two moves the
  // matching filters as well — that is the point of driving both from one declared order.
  { key: 'hu_ordering', label: 'HU ordering', title: 'Seen USING Hatches Up online ordering. Tri-state: ✓ = yes, blank = not checked, ✗ = checked & absent. Untick clears to "not checked", never false.' },
  { key: 'hu_map', label: 'HU map', title: 'On the Hatches Up map / holds an HU ordering page. Tri-state: ✓ = yes, blank = not checked, ✗ = checked & absent. Untick clears to "not checked", never false.' },
  { key: 'schedule', label: 'Schedule', title: 'Y (n) = we hold a schedule and n future events. Y (0) = we hold a schedule but NOTHING is booked ahead — a different prospect from N, which is no events known at all. Hover a cell for the last event date.' },
  { key: 'stage', label: 'Stage' },
  { key: 'last_contacted', label: 'Last contacted' },
  { key: 'next_action', label: 'Next action' },
  // 🔴 DERIVED, NOT STORED. Read from the contact ladder by `nextStep` every render — there is no
  // column behind it and nothing writes it. It sorts by the ladder's own order (KIND_ORDER), so the
  // work reads First contact → Chase 1 → Chase 2 → Final chase rather than alphabetically.
  { key: 'next_step', label: 'Next step', title: 'DERIVED from the contact history — the next rung of the sequence, its due date, and the lead type. Nothing stores this; correct the contact log and it changes. "Can\'t tell" means a logged contact carries a kind outside the vocabulary.' },
]
// A tri-state → sortable rank: true=2, false=1, null→null (sorts LAST both directions via compareBySort).
const triRank = (v: boolean | null): number | null => v === true ? 2 : v === false ? 1 : null
// number | string | null. isHatchesUp kept in the signature for the (unchanged) default priority sort.
function sortValue(p: Prospect, key: SortKey, _hatchesUp: (v: string | null) => boolean, step?: Step): number | string | null {
  switch (key) {
    // Present sorts before absent; null last, as everywhere else on this table.
    // 🔴 SORTED BY WHAT THE OPERATOR IS LOOKING FOR: work first, then unreadable history, then the
    // rest. Within "due" the ladder's own order applies, so a screen of due work reads in sequence.
    // Anything with no step sorts LAST, like every other null on this table.
    case 'next_step': {
      if (!step) return null
      if (step.state === 'due') return `1${step.kind ? kindOrder(step.kind) : 9}`
      if (step.state === 'unknown') return '2'
      if (step.state === 'scheduled') return `3${step.dueOn ?? ''}`
      return null       // stopped / complete — nothing to do, sorts last
    }
    case 'logo': return p.logo_url ? 1 : null
    case 'photo': return p.photo_url ? 1 : null
    case 'name': return p.name || null
    // 🔴 SORTS REACHABLE FIRST, THEN BY LEAD QUALITY. Two groups in one key so a single click gives the
    // order the work is actually done in: everyone you can message, then everyone you cannot, best lead
    // first. `channelFor`, never `step.channel` — see the COLUMNS note.
    // 🔴 PRESENCE SORTS, AND IT USES THE SAME PREDICATE THE CELL RENDERS. Held first (1), absent last
    // (null sorts to the end by the comparator's existing rule), so one click groups the rows you can
    // actually reach. ⚠️ `hasValue`, not truthiness — a whitespace-only value must sort as absent
    // because that is how the queue treats it.
    case 'email': return hasValue(p.contact_email) ? 1 : null
    case 'mobile': return hasValue(p.phone) ? 1 : null
    // WhatsApp confirmation: confirmed (true) sorts first, not-confirmed (null) last. Two states only.
    case 'whatsapp':
      return p.whatsapp_confirmed === true ? 1 : null
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
function compareBySort(a: Prospect, b: Prospect, s: SortState, hatchesUp: (v: string | null) => boolean, steps?: Map<string, Step>): number {
  if (!s) return 0
  const va = sortValue(a, s.key, hatchesUp, steps?.get(a.id)), vb = sortValue(b, s.key, hatchesUp, steps?.get(b.id))
  // Nulls last, ALWAYS — independent of direction.
  if (va == null && vb == null) return 0
  if (va == null) return 1
  if (vb == null) return -1
  let cmp: number
  if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb
  else cmp = String(va).localeCompare(String(vb))
  return s.dir === 'asc' ? cmp : -cmp
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
    title: "The truck's logo, wherever it is authoritative — the linked truck's own logo if it has one, else the prospect's scraped logo. Has = a value is stored, Missing = none (an empty drop target)." },
  { key: 'photo', label: 'Photo',
    options: [['any', 'Any'], ['yes', 'Has'], ['no', 'Missing']],
    title: 'discovery_trucks.photo_url — Has = a value is stored, Missing = the column is null (an empty drop target).' },
  // 🔴 THE SEARCH BOX NOW SITS IN THE ARRAY rather than being rendered ahead of it, because Logo and
  // Photo come BEFORE Truck in the table and the bar must follow the columns. Keeping it outside would
  // have pinned it first and broken the one invariant this array exists to hold.
  { key: 'search', label: 'Truck', kind: 'text', options: [],
    title: 'Free-text match on the truck name.' },
  // 🔴 A FILTER THAT OUTLIVED ITS COLUMN. The Phone and Email VALUE columns were cut; these two
  // presence filters are untouched and keep working, because FILTER_CONTROLS is a separate array from
  // COLUMNS and `noColumn` already existed for exactly this (🧪 `doNotContact` has used it since it was
  // added). They sort to the end of the bar, after every filter that still has a column.
  { key: 'phone', label: 'Phone', noColumn: true,
    options: [['any', 'Any'], ['yes', 'Yes'], ['no', 'No']],
    title: 'discovery_trucks.phone. Yes = we hold a number, No = we hold none. Genuinely two-valued — presence is a fact. The VALUE is edited in the prospect panel; this column was removed, the filter was not.' },
  // ⚠️ "No" is fair HERE, unlike the two HU columns below: whatsapp_confirmed is Dominic's OWN
  // hand-entered confirmation, so an absent value genuinely means "I have not confirmed this works".
  { key: 'whatsapp', label: 'WhatsApp',
    options: [['any', 'Any'], ['yes', 'Yes'], ['unknown', 'No']],
    title: 'outreach_prospects.whatsapp_confirmed — your own hand-entered confirmation. Yes = confirmed working. No = not confirmed by you (stored as NULL; nothing ever writes false).' },
  { key: 'email', label: 'Email', noColumn: true,
    options: [['any', 'Any'], ['yes', 'Yes'], ['no', 'No']],
    title: 'discovery_trucks.contact_email. Yes = we hold an address, No = we hold none. Genuinely two-valued — presence is a fact. The VALUE is edited in the prospect panel; this column was removed, the filter was not.' },
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
  // 🔴 THE `doNotContact` TRI-STATE FILTER WAS REMOVED 16 September 2026 and replaced by the
  // "Show do not contact" TICKBOX rendered beside this bar. It read:
  //     options: [['any','Any'], ['yes','Yes'], ['unknown','No']]
  // and defaulted to 'any', i.e. FLAGGED PROSPECTS WERE SHOWN UNLESS THE OPERATOR OPTED OUT. That is the
  // wrong default for a suppression list: the safe state has to be the one you get by doing nothing.
  // ⚠️ THE TICKBOX IS NOT A FILTER AND DELIBERATELY NOT IN THIS ARRAY. Everything here is a per-row
  // predicate ANDed inside `matchesOutreachFilter`; the tickbox instead chooses the POOL those
  // predicates run over, which is what makes it narrow the counts as well as the rows.
]




export default function OutreachPanel() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [denied, setDenied] = useState(false)
  const [prospects, setProspects] = useState<Prospect[]>([])
  /**
   * 🔴 THE REFRESH NONCE. Incremented by `load()` on success and passed to both thumbnails, whose shared
   * `useThumbLatch` clears its `broken` flag when it changes. Its VALUE means nothing; only that it
   * changes. It exists because `load()` returns an IDENTICAL `logo_url` string for an unchanged row, so
   * the thumbs' old `[value]`-only reset could never fire on a refresh — see useThumbLatch.
   */
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [error, setError] = useState<string | null>(null)
  /* 🔴 THE THREE MIGRATION PROBES MOVED TO THE PAGE with the fields they gate (the name split, the
   * lead-type freeze, do-not-contact). The route still returns all three; this surface has nothing
   * left that reads them, and holding a copy nobody reads is how a flag goes stale. */
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
  /* 🔴 `modalId` AND THE WHOLE MODAL STATE WENT WITH THE MODAL (30 September 2026): the prospect
   * opens at its own route now. What replaces it is one navigation and two writes to sessionStorage —
   * the QUEUE the prospect was opened from, and where to scroll back to. See `lib/outreach-queue.ts`
   * for why that is session state and not a query string.
   * ⚠️ The Create-Demo modal, its `createDemoOpen` predicate and the Escape listener that had to
   * decline while it was open all moved to the page as well; none of them has anything to gate here
   * any more. */
  /* 🔴 THE TEMPLATE AND SNIPPET FETCHES MOVED TO THE PAGE. Their only reader was the compose window,
   * which opens there now — and loading 20 templates on a list nobody is going to compose from was
   * work this surface did on every visit for the benefit of one click on another one. */
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
  // 🔴 THE DEFAULT SORT IS NEXT ACTION, NEWEST FIRST — the operator's choice, recorded with what it
  // actually does. 🧪 Against today's data (231 prospects, 9 with a date: 6 overdue, 1 today, 2 ahead,
  // 222 null) 'asc' puts the MOST OVERDUE row at the top — the work-queue convention, and the operator's
  // choice. The previous default was 'desc', which put the furthest-future date first and buried the
  // most overdue row NINTH; that was the wrong end of the list to be looking at.
  //
  // ⚠️ THE 222 NULLS LAND AT THE BOTTOM, AND THAT IS NOT A PROPERTY OF THIS LINE. 🔎 `compareBySort`
  // tests for null BEFORE it applies the direction and returns 1 / -1 directly, so the `s.dir === 'asc'
  // ? cmp : -cmp` negation never reaches a null. A naive comparator flipped to ascending WOULD raise
  // nulls to the top and bury all 9 dated rows under 222 blanks — a null `next_action_at` means "no
  // action scheduled", not "overdue since the beginning of time". This one cannot, by construction.
  // 🧪 Driven over a fixture of Dominic's exact shape: the top five rows are the 2026-09-13 overdue row
  // and its four successors, and the first null appears at position 10.
  //
  // 🔴 ONE LINE FLIPS IT BACK: 'asc' → 'desc'. Nothing else needs to change, and nothing else did.
  // ⚠️ THE HEADER CYCLE FROM THIS DEFAULT IS: oldest → newest → the PRIORITY sort → oldest. The third
  // position is `sort = null`, which is the 5-way ready-to-send rank, NOT the state the page loaded in —
  // so "clear" lands somewhere the operator never saw on load. That is pre-existing `toggleSort`
  // behaviour and is deliberately NOT changed here; see the report if it should be.
  const [sort, setSort] = useState<SortState>({ key: 'next_action', dir: 'asc' })

  // Stable callbacks so React.memo'd rows don't all re-render on every edit (item 5 responsiveness).
  const showToast = useCallback((message: string, undo?: () => void) => {
    setToast({ message, undo })
    // Give an undo toast longer to act on than a plain one.
    setTimeout(() => setToast(null), undo ? 6000 : 3000)
  }, [])
  /** 🔴 "Today asked for the compose window on this truck." Declared here, beside the modal id it
   *  shadows, because every path that changes one must change the other. */
  /**
   * Open a prospect's page, recording the queue it was opened FROM.
   *
   * 🔴 THE QUEUE IS WRITTEN HERE AND NOWHERE ELSE, because here is the only place that knows what the
   * operator was looking at: the filtered, sorted list, or one section of Today. The page reads it for
   * ‹ ›, J/K, "3 of 12" and the "Done. Next" bar; without it the page would have to guess an order,
   * and a guessed order in a work queue is worse than none.
   * ⚠️ `intent` OPENS A COMPOSER, IT DOES NOT SEND ANYTHING. It travels in the URL because it is about
   * this navigation rather than about the prospect.
   */
  const openProspect = useCallback((
    id: string,
    queue?: { label: string; ids: string[] },
    intent?: { compose?: boolean; replyTo?: string },
  ) => {
    const store = typeof window === 'undefined' ? null : window.sessionStorage
    saveQueue(store, {
      label: queue?.label ?? 'the list',
      ids: queue?.ids ?? [],
      returnTo: '/admin?tab=outreach',
    })
    // ⚠️ THE SCROLL POSITION IS READ AT THE MOMENT OF LEAVING, not remembered as it changes: a scroll
    // listener writing storage on every frame is a cost paid by everyone to help the few who come back.
    saveReturn(store, { tab: tabRef.current, scrollY: typeof window === 'undefined' ? 0 : window.scrollY })
    const q = new URLSearchParams()
    if (intent?.compose) q.set('compose', '1')
    if (intent?.replyTo) q.set('reply', intent.replyTo)
    const qs = q.toString()
    router.push(`${prospectPath(id)}${qs ? `?${qs}` : ''}`)
  }, [router])
  /** ⚠️ Read inside `openProspect` without making it a dependency — the callback must stay stable for
   *  `Row`'s `memo`, and the tab is only ever read at the moment of navigating. */
  const tabRef = useRef<'today' | 'all'>('today')
  /** The ids currently on screen, for the queue. ⚠️ A REF for the same reason: `Row` is memoised on a
   *  stable `onOpen`, and rebuilding that callback whenever a filter changes would re-render all 231. */
  const visibleIdsRef = useRef<string[]>([])
  const openFromList = useCallback((id: string) => {
    openProspect(id, { label: 'the list', ids: visibleIdsRef.current })
  }, [openProspect])
  const openSchedule = useCallback((pr: Prospect) => setSchedFor(pr), [])

  const load = useCallback(async () => {
    try {
      const h = await nativeAuthHeader()
      const res = await fetch('/api/admin/outreach', { headers: h, credentials: 'same-origin' })
      if (res.status === 404 || res.status === 401) { setDenied(true); setChecking(false); return }
      if (!res.ok) { setError(`Could not load (${res.status})`); setChecking(false); return }
      const data = await res.json()
      setProspects(data.prospects || [])
      // 🔴 BUMPED ONLY ON A SUCCESSFUL READ, AND AFTER THE ROWS ARE SET. Every early return above leaves
      // it alone, so a 401, a 404, a non-ok status or a thrown fetch does NOT clear a thumbnail's broken
      // latch — there is no fresh data to justify a fresh attempt. That is what stops this becoming a
      // retry loop: the nonce changes at most once per SUCCESSFUL refresh.
      setRefreshNonce(x => x + 1)
      setChecking(false)
    } catch {
      setError('Could not reach the server')
      setChecking(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  /**
   * 🔴 BACK PUTS THE LIST WHERE IT WAS. A modal left the page underneath it untouched; a route change
   * reloads this component at the top of the document, which on a 231-row table means hunting for the
   * row you just came from.
   * ⚠️ AFTER THE ROWS EXIST, NOT ON MOUNT. Scrolling to 4,000px before the table has rendered scrolls
   * nothing at all, so this waits for `prospects` to arrive — the frame the rows are painted in.
   * ⚠️ ONCE. `restoredScroll` makes it a one-shot: re-running it on a later load would yank the page
   * back while somebody was reading it.
   */
  const restoredScroll = useRef(false)
  useEffect(() => {
    if (restoredScroll.current || checking || !prospects.length) return
    restoredScroll.current = true
    const r = readReturn(typeof window === 'undefined' ? null : window.sessionStorage)
    if (r && r.scrollY > 0) window.scrollTo({ top: r.scrollY })
  }, [checking, prospects.length])


  // 🔴 GATED while the Create Demo modal is open: both listeners are bubble-phase on window and BOTH fire
  // on one Escape; this one declines and the child closes itself. No capture phase, no stopPropagation,
  // no registration-order dependence — the C15 trap (two capture listeners on one node) is avoided by
  // not having two capture listeners.
  /* 🔴 THE ESCAPE LISTENER WENT WITH THE MODAL. There is nothing on this surface for Escape to close
   * any more — the prospect is a page, and Back is the browser's own. */

  // ── SORT ───────────────────────────────────────────────────────────────────────────────────────────
  // ALL rows are shown, always — no filter, no paging. `excluded` is NOT surfaced on this page at all
  // (item 2); discovery_trucks.excluded is untouched and still gates the public site elsewhere. When
  // `sort` is null, the DEFAULT priority sort applies: Hatches Up trucks that have an email and are not yet
  // contacted, first. When the user picks a column, that column's asc/desc sort applies (nulls last).
  // 🔴 THE DUE-WORK QUEUE, AS A NARROWING OF THIS TABLE — decision D3. Not a tab, not a page, not an
  // endpoint: the rows are already loaded and the step is already derived, so the queue is one boolean.
  // ⚠️ IT IS NOT PART OF `OutreachFilterState`, deliberately. That object feeds `matchesOutreachFilter`,
  // which is pure over ONE ROW and has neither the contact ladder nor a clock; putting a step-aware key
  // in it would make that pure function ignore one of its own fields, which is worse than a second flag.
  // 🔴 THREE VIEWS OVER ONE TABLE, not three pages — decision D3 of the queue report, widened by one
  // value. The rows are already loaded and every step is already derived, so a view is a narrowing.
  //   'all'    — everything, as before
  //   'due'    — 🔴 work that can ACTUALLY BE DONE: due or unreadable, AND reachable
  //   'leads'  — the prospects with no contact route, best lead first (Phase 4)
  // ⚠️ STILL NOT PART OF `OutreachFilterState`. That object feeds `matchesOutreachFilter`, which is pure
  // over ONE ROW and has neither a clock nor `waPhone`; a view-aware key in it would make that function
  // ignore one of its own fields.
  const [listView, setListView] = useState<'all' | 'due' | 'leads'>('all')

  // 🔴 ONE STEP PER PROSPECT, COMPUTED ONCE. `nextStep` is pure and cheap, but the queue, the row label
  // and the composer's pre-selection all ask for it, and computing it three times would let them
  // disagree if the clock ticked across midnight between calls. One Map, one answer.
  // ⚠️ `waPhone` comes from the SHARED `phoneWhatsApp` — the same function the CUSTOMER-FACING live
  // button uses. It is READ here and nothing else; lib/whatsapp-hint.ts is not modified by this change.
  // ── 🔴 DO-NOT-CONTACT IS HIDDEN BY DEFAULT (item 5, 16 September 2026) ────────────────────────────
  // 🔴 NOT PERSISTED, BY INSTRUCTION AND FOR A REASON. No localStorage, no URL state: this suppresses
  // people who have asked not to be contacted, and a remembered "show" would mean an operator opening
  // the console tomorrow sees them without having chosen to today. It resets on every load — the safe
  // direction.
  const [showDoNotContact, setShowDoNotContact] = useState(false)

  /**
   * 🔴 THE ONE POOL EVERY COUNT AND THE LIST READ FROM. It exists so the exclusion happens in exactly
   * ONE place. The alternative — filtering inside `computedVisible`, again inside `dueCounts`, and again
   * at each `prospects.length` — is four copies of one rule, and V13.2's lesson is that guards which
   * must agree by hand eventually do not. `steps`, `channels`, `dueCounts`, `computedVisible` and every
   * displayed total derive from this, so a flagged prospect cannot appear in one number and not another.
   * ⚠️ `=== true` IS THE TEST, matching `nextStep`'s own first stop. The column is nullable and nothing
   * ever writes `false`, so null and false both mean NOT flagged.
   * ⚠️ `prospects` ITSELF IS NEVER FILTERED — the modal resolves a prospect by id from `prospects`, so a
   * row flagged while its modal is open keeps rendering rather than blanking.
   */
  const pool = useMemo(
    () => (showDoNotContact ? prospects : prospects.filter(p => p.do_not_contact !== true)),
    [prospects, showDoNotContact])
  /** How many the tickbox is currently hiding. 0 when it is ticked, so the note disappears. */
  const hiddenDnc = useMemo(
    () => (showDoNotContact ? 0 : prospects.filter(p => p.do_not_contact === true).length),
    [prospects, showDoNotContact])

  const steps = useMemo(() => {
    const m = new Map<string, Step>()
    for (const p of pool) {
      m.set(p.id, nextStep({ ...p, waPhone: phoneWhatsApp(p.phone, null).waPhone }, p.contacts))
    }
    return m
  }, [pool])

  /** 🔴 CONTACTABILITY, FROM THE SHARED PREDICATE, FOR EVERY ROW — independent of step state.
   *  `channelFor` and not `step.channel`: 🧪 `nextStep` returns its `base` (channel: null) for every
   *  STOP, so a do-not-contact prospect holding an email reports null. Using the step would have made
   *  the Due gate look right while quietly filing reachable trucks under "no lead". */
  const channels = useMemo(() => {
    const m = new Map<string, 'email' | 'whatsapp' | null>()
    for (const p of pool) {
      m.set(p.id, channelFor({ ...p, waPhone: phoneWhatsApp(p.phone, null).waPhone }))
    }
    return m
  }, [pool])

  // 🔴 COUNTED FROM THE SAME MAP THE ROWS READ, over ALL prospects rather than the filtered set — the
  // badge answers "how much work is there", not "how much work is on screen".
  // 🔴 THE GATE. Before this, the button counted every `state === 'due'` row whether or not anyone could
  // be reached — 🧪 the channel was computed by `channelFor`, carried on the step, and then never
  // consulted. That is how it read 224 when the operator's actionable figure is 70: 154 of those rows
  // have no email and no confirmed WhatsApp number, so "do the next step" is not an instruction that can
  // be followed. `due` now requires a channel; the unreachable ones are counted as `leads` instead and
  // are one click away rather than hidden.
  const dueCounts = useMemo(() => {
    let due = 0, unknown = 0, leads = 0
    for (const [id, st] of steps) {
      const reachable = channels.get(id) != null
      if (!reachable) { leads++; continue }
      if (st.state === 'due') due++
      else if (st.state === 'unknown') unknown++
    }
    return { due, unknown, leads, total: due + unknown }
  }, [steps, channels])

  // ── 🔴 TODAY: THE DEFAULT SCREEN ────────────────────────────────────────────────────────────────
  // The table answers "what do we know about this truck". Nothing answered "what do I do this
  // morning", so the answer was 231 rows and a memory. This tab is that answer, and it is the one
  // that opens.
  /**
   * 🔴 THE TAB IS RESTORED FROM THE RETURN STATE, ON THE FIRST RENDER, NOT IN AN EFFECT. Coming back
   * from a prospect page must land on the tab it was opened from; an effect would paint Today for one
   * frame and then swap, which reads as a flicker and loses the scroll restore's anchor.
   * ⚠️ `useState(initialiser)` RUNS ONCE, and the guard is for the server render where there is no
   * sessionStorage at all.
   */
  const [tab, setTab] = useState<'today' | 'all'>(() => {
    if (typeof window === 'undefined') return 'today'
    const r = readReturn(window.sessionStorage)
    return r?.tab === 'all' ? 'all' : 'today'
  })
  const [todayData, setTodayData] = useState<TodayPayload | null>(null)

  // 🔴 RE-READ WHENEVER THE PAGE IS. `refreshNonce` is bumped by every successful `load()`, which is
  // what "Check for replies now" and every action in the modal call — so a reply logged anywhere
  // leaves this list without anyone pressing anything.
  // ⚠️ THE `live` GUARD IS NOT DECORATION. The fetch outlives a fast tab switch, and a late answer
  // setting state on an unmounted panel is the React warning nobody can then locate.
  useEffect(() => {
    let live = true
    void (async () => {
      const j = await fetchToday()
      if (live && j) setTodayData(j)
    })()
    return () => { live = false }
  }, [refreshNonce])

  // 🔴 THE STEPS COME FROM THE MAP ABOVE. `buildToday` sorts and buckets; it derives nothing, and a
  // second `nextStep` call here would be the second derivation §57.1 says does not exist.
  const todayView = useMemo(() => buildToday({
    waiting: todayData?.waiting ?? [],
    problems: todayData?.problems ?? [],
    snoozed: todayData?.snoozed ?? [],
    prospects: pool
      .map((p): TodayProspect | null => {
        const st = steps.get(p.id)
        return st ? { id: p.id, name: p.name, step: st, channel: channels.get(p.id) ?? null, next_action_at: p.next_action_at } : null
      })
      .filter((v): v is TodayProspect => v !== null),
    // ⚠️ LONDON, NOT THE DEVICE. "Overdue by one day" must not depend on where the laptop thinks it is.
    today: getLocalDateInTz('Europe/London'),
  }), [todayData, pool, steps, channels])

  const computedVisible = useMemo(() => {
    // 🔴 (1) CLIENT-SIDE OVER THE ROWS ALREADY LOADED. No endpoint, no query param, no refetch — this
    // is a pure narrowing of `prospects`, which is why changing a filter cannot alter a row or lose an
    // optimistic edit. All predicates combine with AND inside matchesOutreachFilter.
    // 🔴 TWO STAGES, AND THE SPLIT IS DELIBERATE. `matchesOutreachFilter` is a PURE function of one row
    // — no contacts, no clock — which is why it is testable with no React and no database, and that
    // property is worth keeping. "Due" is not a property of a row: it needs the contact ladder AND
    // today's date. So the row filters run first, unchanged, and the queue narrows what survives.
    // ⚠️ A prospect never contacted has NO next_action_at, so the existing date filters cannot see that
    // it is due at all. The derived step can — which is the whole reason the queue is not just 'overdue'.
    // ⚠️ `pool`, NOT `prospects` — the do-not-contact exclusion happens once, above. Because `visible`
    // is what prev/next walks, hidden rows are skipped by navigation for free.
    const rows = pool
      .filter(p => matchesOutreachFilter(p, filter))
      .filter(p => {
        if (listView === 'all') return true
        const reachable = channels.get(p.id) != null
        // 🔴 'leads' IS EVERY UNREACHABLE PROSPECT, whatever its step state. 🧪 The operator's data says
        // all 155 are `not_contacted`, so no state filter is needed today — and adding one would hide a
        // row the day that stops being true, which is the opposite of what this view is for.
        if (listView === 'leads') return !reachable
        return reachable && stepNeedsAttention(steps.get(p.id)!)
      })
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
      // 🔴 AN EXPLICIT COLUMN SORT ALWAYS WINS, IN EVERY VIEW. The view decides which rows; the header
      // decides their order. Making a view override a click the operator just made would be the kind of
      // invisible override this table has avoided everywhere else.
      if (sort) {
        const c = compareBySort(a, b, sort, isHatchesUp, steps)
        if (c !== 0) return c
        return a.name.localeCompare(b.name)   // stable tiebreak by name
      }
      // 🔴 THE LEADS VIEW HAS ITS OWN DEFAULT ORDER — best lead first (Phase 4). The normal priority
      // rank is useless here by construction: it ranks on `hasEmail`, and every row in this view has no
      // email. So it would collapse to one bucket and leave 155 rows in arbitrary order.
      // ⚠️ Ordering is `leadOf().order`, the array position in LEAD_RANKS, so the sequence
      // hatchesup → other ordering page → real website → Facebook → nothing is declared in one place
      // and never retyped here.
      if (listView === 'leads') {
        const la = leadOf(a.order_url, a.website).order, lb = leadOf(b.order_url, b.website).order
        if (la !== lb) return la - lb
        return a.name.localeCompare(b.name)
      }
      const r = rank(a) - rank(b)
      if (r !== 0) return r
      return a.name.localeCompare(b.name)
    })
  }, [pool, sort, filter, listView, steps, channels])

  // ── 🔴 THE LIST-FREEZE MECHANISM IS GONE, AND THIS RECORDS WHY RATHER THAN DELETING IT SILENTLY ──
  // It pinned the row set and its order while an inline input had focus, so a row could not move or
  // vanish under the cursor mid-edit, and released a tick late so tabbing Phone → Email did not unmount
  // the row focus was travelling to. It existed for exactly two controls: the inline Phone and Email
  // editors in the table.
  // 🔴 BOTH COLUMNS WERE CUT IN THIS CHANGE, SO NOTHING IN A ROW TAKES TEXT FOCUS ANY MORE — 🧪 `Row`
  // was the only consumer of `onHold`, and with no inline input left, `holdList` could never be called,
  // `heldOrder` was permanently null and `visible` was always `computedVisible`. It was unreachable
  // code, not merely unused, so removing it changes nothing observable.
  // ⚠️ IF AN INLINE EDITOR EVER RETURNS TO THIS TABLE, BRING THIS BACK WITH IT. The reasoning is in
  // docs/outreach-list-columns-report.md and the implementation is in this file's history.
  // Which media slot is awaiting confirmation. Held HERE rather than in the thumbnail so the dialog can
  // render at the top of the tree, above the prospect modal, instead of inside a 44px box.

  const visible = computedVisible
  // 🔴 THE REF THE QUEUE IS BUILT FROM, kept in step with what is on screen by an EFFECT — writing a
  // ref during render is what `react-hooks/refs` forbids, and it forbids it for a reason: a render
  // that React throws away would still have written it. The effect runs after the rows are committed,
  // which is before any click on one of them can happen.
  const visibleIds = useMemo(() => visible.map(p => p.id), [visible])
  useEffect(() => { visibleIdsRef.current = visibleIds }, [visibleIds])
  useEffect(() => { tabRef.current = tab }, [tab])

  // Click a header: none → asc → desc → back to default. The active column + direction show at a glance
  // via the ▲/▼ marker rendered on that header.
  const toggleSort = (key: SortKey) => {
    setSort(cur =>
      !cur || cur.key !== key ? { key, dir: 'asc' }
        : cur.dir === 'asc' ? { key, dir: 'desc' }
          : null)   // third click clears back to the default priority sort
  }



  // ── PREV / NEXT ───────────────────────────────────────────────────────────────────────────────────
  // 🔴 BOUND TO `visible`, NOT `prospects`. `visible` IS the array the tbody maps over — the same
  // filtered set in the same sort order — so navigation walks exactly what is on screen. Deriving the
  // index from it each render (rather than storing a position) means the pair cannot drift out of step
  // when a filter changes or a column is re-sorted while the modal is open.
  /* 🔴 ‹ › MOVED TO THE PAGE, AND WITH THEM THE ONLY THING THIS BLOCK DID. It resolved the modal's
   * position in `visible` so the arrows could step through it; the page gets the same list as a
   * QUEUE (`lib/outreach-queue.ts`) written at the moment a row is opened, which is what lets the
   * arrows keep working after a navigation that leaves this component behind entirely. */

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


  const uploadMedia = useCallback(async (prospectId: string, kind: 'logo' | 'photo', file: File, confirmTruck?: string) => {
    const h = await nativeAuthHeader()
    const fd = new FormData()
    fd.append('prospect_id', prospectId)
    fd.append('column', kind)
    fd.append('file', file)
    if (confirmTruck) fd.append('confirm_truck', confirmTruck)
    // ⚠️ NO Content-Type header — the browser must set the multipart boundary itself.
    const res = await fetch('/api/admin/outreach', { method: 'POST', headers: { ...h }, credentials: 'same-origin', body: fd })
    const data = await res.json().catch(() => ({} as any))
    if (!res.ok) throw new Error(data?.error || `Upload failed (${res.status})`)
    if (!data?.url || !data?.column) throw new Error('Upload returned no URL')
    // 🔴 RE-READ, DO NOT HAND-MERGE (round 3, 16 September 2026). This used to spread the UPLOAD route's
    // `data.url` over the row:
    //     setProspects(ps => ps.map(x => x.id === prospectId ? { ...x, [data.column]: data.url } : x))
    // 🧪 Measured: for a demo-backed prospect the two strings are EQUAL TODAY — the upload returns
    // `${SUPABASE_URL}/storage/v1/object/public/truck-media/${path}` and the list route returns
    // `resolveTruckLogo(...)` = `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/truck-media/${path}`
    // over the path it just wrote. So this is NOT a bug fix for a wrong value.
    // 🔴 IT IS THE REMOVAL OF A SECOND BUILDER OF ONE STRING. `logo_url` is DERIVED by the list route
    // (resolveLogoTarget → resolveTruckLogo) and the client has no business reconstructing it: the two
    // already differ in which env var they read (the route falls back to SUPABASE_URL, the resolver uses
    // NEXT_PUBLIC_SUPABASE_URL only), and for a LINKED prospect the upload writes a bucket PATH to
    // `trucks.logo_storage_path` while returning a URL — two shapes the client would have to know about.
    // Re-reading means the client never holds a value the server did not derive.
    // ⚠️ `load()` also bumps `refreshNonce`, which clears any thumbnail error latch — so a retried upload
    // after a failed load shows the new image rather than a stale ⚠.
    await load()
  }, [load])


  // Undo of a just-logged contact — deletes THAT row by id (never "the latest"; see item 4).
  // 🔴 SIGNATURES OF WHAT THIS SESSION HAS ALREADY WRITTEN, as a backstop for the guard below.
  // `logContact` awaits `load()` before it returns, so `p.contacts` is normally fresh by the time a
  // second click is possible — but a failed or slow refetch would leave the guard reading stale rows,
  // and a guard that silently stops guarding is the failure mode this whole task is about.




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
        {/* ── 🔴 TWO TABS, AND TODAY IS THE ONE THAT OPENS ──────────────────────────────────────────
            The count is on the tab because it is the number Dominic wants before he has decided to
            look: "is there anything?" is answered by the tab, not by clicking it. It counts all four
            sections, because all four are work. */}
        <div className="flex items-center gap-2 mb-3 border-b border-slate-200">
          {([
            ['today', `Today${todayView.total ? ` (${todayView.total})` : ''}`,
              'Replies waiting, chases due, follow-ups due and emails that went wrong.'],
            ['all', 'All prospects', 'The full table, its filters and its views.'],
          ] as const).map(([v, label, title]) => (
            <button key={v} type="button" onClick={() => setTab(v)} aria-pressed={tab === v} title={title}
              className={`text-sm font-bold px-3 py-2 -mb-px border-b-2 ${tab === v
                ? 'border-orange-600 text-orange-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              {label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 pb-1">
            {/* 🔴 ON BOTH TABS. Checking for replies is the thing most likely to change what Today
                says, so it must not be buried behind the tab that does not show it. */}
            <CheckRepliesNow onDone={load} />
            <ImportPastEmails onDone={load} />
          </div>
        </div>

        {tab === 'today' && (
          <TodayScreen
            view={todayView}
            loaded={todayData !== null}
            migrationApplied={todayData?.migrationApplied !== false}
            // 🔴 EACH SECTION IS ITS OWN QUEUE, and the label is what the end-of-queue line reads:
            // "That's everything in Replies waiting." A single queue over all four sections would
            // walk from a reply into an unrelated bounced email and call it the next one.
            onOpen={(id, queue) => openProspect(id, queue)}
            onCompose={(id, queue) => openProspect(id, queue, { compose: true })}
            onReply={(id, messageId, queue) => openProspect(id, queue, { replyTo: messageId })}
            onAction={load}
          />
        )}

        <div className={tab === 'all' ? 'flex items-center justify-between gap-4 mb-4' : 'hidden'}>
          <div>
            {/* No <h1> — the tab bar above already names this surface, and a second title under it read as
                a duplicate. The count line stays: it is the only place the loaded-row total appears. */}
            {/* 🔴 THE FILTERED COUNT AGAINST THE TOTAL. Shown as "n of N" whenever anything is narrowing
                the list, so a filter that matches everything is still visibly a filter, and a filter that
                matches nothing reads as 0 of N rather than as an empty page. */}
            <p className="text-sm text-slate-500">
              {isFilterActive(filter) || listView !== 'all'
                ? <><span className="font-semibold text-slate-700">{visible.length}</span> of {pool.length} trucks</>
                : <>{pool.length} trucks</>}
            </p>
          </div>
          {/* 🔴 THREE VIEWS OVER THE TABLE THAT IS ALREADY THERE. Not tabs, not pages: every row is
              loaded and every step derived, so a view is a narrowing. Counts come from the SAME `steps`
              and `channels` maps the rows render from, so a badge and its list cannot disagree.
              ⚠️ "Needs a look" stays counted SEPARATELY from "due" and is NOT a subset of it — an
              unreadable history is work, but it needs the contact log corrected, not a message sent.
              🔴 AND "NEEDS DETAILS" IS NOT HIDDEN WORK. The 155 with no contact route used to be folded
              into Due work, where they made the number meaningless; they are now their own view with
              their own count, one click away. Hiding them was never the alternative. */}
          <div className="flex items-center gap-2">
            {dueCounts.unknown > 0 && (
              <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1"
                title="Reachable prospects whose logged contacts carry a kind outside the vocabulary, so the next step cannot be derived. Open one and check its history.">
                ⚠ {dueCounts.unknown} need{dueCounts.unknown === 1 ? 's' : ''} a look
              </span>
            )}
            {([
              ['all', `All (${pool.length})`, 'Every prospect, unfiltered by view.'],
              ['due', `Due work (${dueCounts.total})`,
                'Work that can actually be done: due today or overdue, AND reachable by email or a confirmed WhatsApp number. Prospects with no contact route are in Needs details instead.'],
              ['leads', `Needs details (${dueCounts.leads})`,
                'No email and no confirmed WhatsApp number. The Contact column shows the best lead to chase instead — a Hatches Up storefront first, then a real website, then a Facebook page. Sorted best-first.'],
            ] as const).map(([v, label, title]) => (
              <button key={v} type="button" onClick={() => setListView(v)}
                aria-pressed={listView === v} title={title}
                className={`text-sm rounded-lg px-3 py-1.5 border font-semibold ${listView === v
                  ? 'bg-orange-600 border-orange-600 text-white'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                {label}
              </button>
            ))}
            {/* 🔴 THE TWO MAILBOX BUTTONS MOVED TO THE TAB BAR, because they belong to both tabs.
                `load()` re-reads the prospects, their contact history and the stage each one is on,
                and bumps `refreshNonce` — which re-reads Today and any open prospect's timeline. */}
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
        {/* ⚠️ HIDDEN, NOT UNMOUNTED, ON THE TODAY TAB. The filters, the sort and the scroll position
            are state; unmounting would throw them away every time Dominic looked at Today. */}
        <div className={tab === 'all' ? 'mb-3 rounded-xl border border-slate-200 bg-white px-3 py-2' : 'hidden'}>
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

            {/* ── 🔴 "SHOW DO NOT CONTACT" — A TICKBOX, NOT A FILTER (item 5, 16 September 2026) ────────
                It replaced the `doNotContact` tri-state select, which defaulted to 'any' and therefore
                SHOWED flagged prospects unless the operator opted out. The safe state has to be the one
                you get by doing nothing.
                🔴 IT IS DELIBERATELY A CHECKBOX WHERE EVERY OTHER CONTROL IN THIS BAR IS A <select>, and
                that breaks the bar's own stated rule on purpose. That rule exists because the nullable
                booleans are THREE-valued (true / NULL-meaning-nobody-checked / absent) and a checkbox
                would conflate two of them. This control is not reading a three-valued column: it is a
                two-position choice about MY OWN VIEW — show them or do not — and it writes nothing.
                ⚠️ NOT IN `FILTER_CONTROLS`. Everything in that array is a per-row predicate ANDed inside
                `matchesOutreachFilter`; this instead chooses the POOL those predicates run over, which is
                what lets it narrow the counts as well as the rows.
                ⚠️ NOT PERSISTED — no localStorage, no URL state, unticked on every load. */}
            <label className="flex items-center gap-1.5 self-end pb-1 cursor-pointer"
              title="Prospects flagged do_not_contact are hidden from the list and from every count. Tick to show them; they appear with a 🚫 DNC marker. This resets every time the page loads.">
              <input type="checkbox" checked={showDoNotContact}
                onChange={e => setShowDoNotContact(e.target.checked)}
                className="h-3.5 w-3.5 accent-orange-600" />
              <span className="text-xs font-semibold text-slate-600">Show do not contact</span>
            </label>

            {/* 🔴 THE COUNT IS SHOWN WHILE THEY ARE HIDDEN, so the suppression is never silent. An
                operator who cannot see a truck they expect gets told why, here, rather than concluding
                the row was lost. It disappears when the tickbox is on, because then nothing is hidden. */}
            {hiddenDnc > 0 && (
              <span className="text-xs text-slate-500 self-end pb-1"
                title="Flagged do_not_contact, and excluded from every count on this view.">
                {hiddenDnc} hidden — do not contact
              </span>
            )}

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
        <div className={tab === 'all' ? 'overflow-auto rounded-xl border border-slate-200 bg-white max-h-[calc(100vh-9rem)]' : 'hidden'}>
          <table className="table-fixed text-sm w-full" style={{ minWidth: '1321px' }}>
            {/* 🔴 THE SUM OF THESE EQUALS `minWidth` EXACTLY (1321px), AND THAT IS THE POINT.
                🧪 RE-DERIVED, NOT TRANSCRIBED:
                  64 + 64 + 210 + 150 + 72 + 76 + 68 + 78 + 125 + 112 + 112 + 190 = 1321
                Keeping the two in step means a column is exactly the width written here at the floor,
                and above it `table-fixed` widens every column PROPORTIONALLY — at 1440px each renders
                x1.090, so nothing that fits here starts truncating as the window grows.

                🔴 THE INVARIANT WAS BROKEN AND THIS IS THE REPAIR, RECORDED RATHER THAN QUIETLY FIXED.
                The queue task added a 13th column (NEXT STEP) and NO 13th <col>. Under `table-fixed` a
                column with no declared width absorbs ALL the surplus, so the twelve declared columns
                stayed pinned at 115/210/88… at every window width while NEXT STEP took up to ~600px in
                an 1800px container. That is why email, phone and every date truncated mid-value on a
                wide screen — it was never the columns being too narrow for the content.
                ⚠️ THE COUNT IS THE CHECK: this colgroup must have EXACTLY as many <col> as COLUMNS has
                entries, because <thead> maps over COLUMNS. 12 and 12.

                Widths are set by whichever is larger: the widest unbreakable word in the heading
                (headings wrap on spaces) plus 16px of px-2 padding, or the widest cell content at
                text-sm plus 24px of px-3. 🧪 Two of the old values were simply too small for their own
                content and are corrected here: `stage` held "not contacted" (13 chars ≈ 94px + 24 = 118)
                in 105px, and the date columns hold `fmtDate`'s "10 Sept 2026" (12 chars ≈ 86 + 24 = 110)
                in 88px. Both truncated at ANY width, independently of the missing <col>. */}
            <colgroup>
              <col style={{ width: '64px' }} />{/* logo — 40px thumb, 12px gap each side */}
              <col style={{ width: '64px' }} />{/* photo */}
              <col style={{ width: '210px' }} />{/* name — was 170; took part of the 325px freed by phone+email */}
              <col style={{ width: '76px' }} />{/* email — a ✓ or a dash; "EMAIL" is the binding word */}
              <col style={{ width: '82px' }} />{/* mobile — a ✓ or a dash; "MOBILE" is the binding word */}
              <col style={{ width: '72px' }} />{/* whatsapp — a checkbox; "WHATSAPP" is the binding word */}
              <col style={{ width: '76px' }} />{/* hu_ordering — "ORDERING" is the binding word */}
              <col style={{ width: '68px' }} />{/* hu_map */}
              <col style={{ width: '78px' }} />{/* schedule — "SCHEDULE" binds, content is "Y (11)" */}
              <col style={{ width: '125px' }} />{/* stage — was 105, which truncated "not contacted" */}
              <col style={{ width: '112px' }} />{/* last_contacted — was 88; "10 Sept 2026" needs ~110 */}
              <col style={{ width: '112px' }} />{/* next_action — same */}
              <col style={{ width: '190px' }} />{/* next_step — "Chase 2 · 10 Sept 2026" ≈ 158 + 24 = 182 */}
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
                <Row key={p.id} p={p} step={steps.get(p.id)} onOpen={openFromList} onOpenSchedule={openSchedule} onPatch={patchProspect} onUpload={uploadMedia} isCountStale={staleCountIds.has(p.id)} refreshNonce={refreshNonce} />
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

      {/* 🔴 THE PROSPECT MODAL WAS HERE AND IS GONE (30 September 2026). It is a full page now —
          `app/admin/outreach/p/[prospectId]`, rendered by `components/admin/ProspectWorkspace.tsx`.
          Opening a row navigates there and records the queue it came from; Back returns to this list
          with its tab, filters and scroll position. The modal's own comments about backdrops, stacking
          and the 45/55 split went with it: a page has no backdrop, nothing stacks above it, and it has
          the width the modal never had, which was the complaint.
          ⚠️ THE MEDIA THUMBNAILS AND THEIR DELETE, "Create demo" and "Do not contact" moved with it —
          nothing the modal could do was dropped. `ScheduleEventsPopup` below stays, because it is
          opened from a CELL in this table and not from the prospect view. */}

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
/**
 * "Import past emails" — reads the mailbox and records what is ALREADY there.
 *
 * 🔴 IT WRITES NOTHING BUT `outreach_messages`. No contact is logged, no stage is moved, no prospect or
 * truck row is touched: the import's job is to give a chase something to reply TO, and to show which
 * hand-sent emails the contact log never recorded. Deciding what those mismatches mean is a person's
 * job, which is why they are REPORTED rather than reconciled.
 * ⚠️ IT OPENS EVERY MAILBOX READ-ONLY (IMAP EXAMINE). Nothing is marked read and no flag changes, so
 * running it cannot alter what Outlook shows. The ONE thing it edits is a row it wrote itself: an
 * imported row whose `in_reply_to` / `references` are null gets them filled in, never overwritten.
 */
interface FolderReportUI {
  folder: string
  mode: 'first_look' | 'incremental' | 'rescan' | 'none' | 'empty'
  /** Messages handed to the matcher — after the first-look date filter. */
  examined: number
  before: number | null
  after: number | null
  since: string | null
}

interface PollSummaryUI {
  ok: boolean; skipped?: string
  repliesLogged: number; autoReplies: number; bounces: number; outlookSentRecorded: number
  retried: number; markedUncertain: number; copiesFiled: number
  ambiguous: number; unmatched: number
  repliesToTest?: number; textsFilled?: number
  /** Rows the importer had taken and the poll took over. Optional: an older route would not send it. */
  adopted?: number
  /** Rows given their stored bodies this run, so View opens them without the mailbox. */
  bodiesFilled?: number
  rescanned: string[]; baselined: string[]
  /** 🔴 One line per folder, so a run that found nothing can say why. Optional: an older deployment
   *  of the routes would not send it, and the panel must not blank out if it is missing. */
  folders?: FolderReportUI[]
  errors: { step: string; error: string }[]
}

/**
 * "Check for replies now" — the manual half of the reply poll.
 *
 * 🔴 IT RUNS THE SAME ROUTINE AS THE TEN-MINUTE CRON, and shares its lock, so pressing it during a
 * scheduled run does nothing rather than logging every new reply twice.
 * ⚠️ READ-ONLY IN THE MAILBOX. Every folder is opened with EXAMINE and every fetch is a peek, so a
 * reply Dominic has not opened yet is still unread in Outlook afterwards.
 */
function CheckRepliesNow({ onDone }: {
  /** 🔴 Re-reads the list and any open modal. See the note where it is called. */
  onDone: () => void | Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<PollSummaryUI | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)          // the same synchronous guard as everywhere else
  const run = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true); setResult(null); setError(null)
    try {
      const r = await fetch('/api/admin/outreach/mail-poll', { method: 'POST' })
      const j = (await r.json().catch(() => null)) as PollSummaryUI | null
      if (!j) { setError('The check did not return a readable answer.'); return }
      setResult(j)
      // 🔴 THE PAGE REFRESHES ITSELF. The check logs contacts and moves stages, and until this line
      // the screen went on showing what it had loaded before the check ran — Dominic pressed the
      // button, was told "1 reply logged", and had to reload the page to see it. A button that
      // changes the data owns showing the change.
      await onDone()
    } catch {
      setError('The check did not finish — try again. It only ever reads the mailbox.')
    } finally { inFlight.current = false; setBusy(false) }
  }
  return (
    <>
      <button type="button" onClick={() => void run()} disabled={busy}
        title="Reads your mailbox read-only for replies, auto-replies and bounces, and records what it finds. Nothing is sent and nothing is marked read."
        className="text-sm rounded-lg px-3 py-1.5 border font-semibold bg-white border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40">
        {busy ? 'Checking…' : 'Check for replies now'}
      </button>
      {error && <span className="text-[11px] text-red-700 max-w-md">{error}</span>}
      {result && (
        <div className="basis-full flex flex-col gap-1 mt-1">
          {result.skipped
            ? <p className="text-[11px] text-slate-600">{result.skipped}</p>
            : (
              <p className="text-[11px] text-slate-600">
                <span className="font-bold">{result.repliesLogged}</span> repl{result.repliesLogged === 1 ? 'y' : 'ies'} logged,
                {' '}<span className="font-bold">{result.autoReplies}</span> auto-repl{result.autoReplies === 1 ? 'y' : 'ies'},
                {' '}<span className="font-bold">{result.bounces}</span> bounce{result.bounces === 1 ? '' : 's'},
                {' '}<span className="font-bold">{result.outlookSentRecorded}</span> sent from Outlook recorded,
                {' '}<span className="font-bold">{result.retried}</span> retried,
                {' '}<span className="font-bold">{result.markedUncertain}</span> marked uncertain,
                {' '}<span className="font-bold">{result.copiesFiled}</span> cop{result.copiesFiled === 1 ? 'y' : 'ies'} filed
                {/* Shown only when non-zero: a repair is an exceptional thing, not a running total. */}
                {!!result.textsFilled && <>, <span className="font-bold">{result.textsFilled}</span> reply text{result.textsFilled === 1 ? '' : 's'} filled in</>}
                {/* 🔴 MAIL THE IMPORTER HAD TAKEN, NOW HANDLED. Shown only when it happened, because
                    it is a recovery and not a running total. */}
                {!!result.adopted && <>, <span className="font-bold">{result.adopted}</span> adopted from import</>}
                {!!result.bodiesFilled && <>, <span className="font-bold">{result.bodiesFilled}</span> email{result.bodiesFilled === 1 ? '' : 's'} stored for instant viewing</>}
                .{' '}
                {/* 🔴 A REPLY TO A TEST IS DOMINIC ANSWERING HIMSELF. Counted so a run that looks
                    like it missed something can say it did not. */}
                {!!result.repliesToTest && (
                  <span className="text-slate-500">
                    {result.repliesToTest} repl{result.repliesToTest === 1 ? 'y' : 'ies'} to a test send (ignored).{' '}
                  </span>
                )}
                {/* ⚠️ AMBIGUOUS AND UNMATCHED ARE COUNTS AND NOTHING MORE. Unmatched mail is not
                    outreach — hello@ takes order and support mail too — and is never stored. */}
                <span className="text-slate-400">
                  {result.ambiguous} ambiguous, {result.unmatched} not outreach.
                </span>
                {result.baselined.length > 0 && (
                  <span className="text-slate-400"> First look at {result.baselined.join(', ')} — older mail was left alone; use Import past emails for history.</span>
                )}
                {result.rescanned.length > 0 && (
                  <span className="text-slate-400"> {result.rescanned.join(', ')} was rebuilt by the mail server, so the last 7 days were re-read.</span>
                )}
              </p>
            )}
          {/* 🔴 PER FOLDER, BECAUSE "FOUND NOTHING" HAS TO BE DIAGNOSABLE. On 29 September this button
              reported all zeros and there was no way to tell from the screen whether the reply had not
              arrived, had not matched, or had been skipped by a watermark the cron had set a few
              minutes earlier. It was the third. This says which. */}
          {result.folders && result.folders.length > 0 && (
            <details className="text-[11px] text-slate-600">
              <summary className="cursor-pointer select-none text-slate-500 hover:text-slate-700">
                What each folder did
              </summary>
              <div className="mt-1 border border-slate-200 rounded bg-white divide-y divide-slate-100">
                {result.folders.map(f => (
                  <p key={f.folder} className="px-2 py-1 flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-slate-700 w-40 shrink-0 truncate">{f.folder}</span>
                    <span className={`font-semibold ${f.mode === 'first_look' ? 'text-amber-800' : 'text-slate-500'}`}>
                      {f.mode === 'first_look' ? 'first look' : f.mode === 'empty' ? 'empty' : f.mode}
                    </span>
                    <span className="text-slate-500">
                      examined <span className="font-bold text-slate-700">{f.examined}</span>
                    </span>
                    <span className="text-slate-400">uid {f.before ?? '—'} → {f.after ?? '—'}</span>
                    {f.since && <span className="text-slate-400">from {fmtDate(f.since)}</span>}
                  </p>
                ))}
              </div>
            </details>
          )}
          {result.errors.length > 0 && (
            <p className="text-[11px] text-red-700">{result.errors.map(e => `${e.step}: ${e.error}`).join(' · ')}</p>
          )}
        </div>
      )}
    </>
  )
}

function ImportPastEmails({ onDone }: {
  /** 🔴 The same refresh as the reply check: an import records rows the Emails list must show. */
  onDone: () => void | Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<MailImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openList, setOpenList] = useState<null | 'unmatched' | 'replies'>(null)
  const inFlight = useRef(false)          // the same synchronous guard as everywhere else
  const run = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true); setResult(null); setError(null); setOpenList(null)
    try {
      const r = await fetch('/api/admin/outreach/mail-import', { method: 'POST' })
      // 🔴 TYPED, NOT `Record<string, unknown>`. The first version read `j.walked` as a number when the
      // route returns an array, and both mismatch lists as numbers when the route returns rows — three
      // NaNs on screen, and nothing in the type system to catch it because everything was `unknown`.
      const j = (await r.json().catch(() => null)) as MailImportResponse | null
      if (!j) { setError('The import did not return a readable answer.'); return }
      if (j.ok !== true) { setError(j.refusal); return }
      setResult(j)
      await onDone()
    } catch {
      setError('The import did not finish — check the connection and run it again. It only ever adds, so running it twice is safe.')
    } finally { inFlight.current = false; setBusy(false) }
  }
  const list = openList === 'unmatched' ? result?.mismatches.loggedButUnmatched
    : openList === 'replies' ? result?.mismatches.repliesNotLogged
    : null
  return (
    <>
      <button type="button" onClick={() => void run()} disabled={busy}
        title="Reads your mailbox read-only and records the outreach emails already in it, so a chase can reply to the right thread. Nothing is sent and no flag is changed."
        className="text-sm rounded-lg px-3 py-1.5 border font-semibold bg-white border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40">
        {busy ? 'Importing…' : 'Import past emails'}
      </button>
      {error && <span className="text-[11px] text-red-700 max-w-md">{error}</span>}
      {result && (
        <div className="basis-full flex flex-col gap-1 mt-1">
          <p className="text-[11px] text-slate-600">
            Read <span className="font-bold">{result.read}</span>,
            {' '}matched <span className="font-bold">{result.matched}</span>,
            {' '}recorded <span className="font-bold">{result.recorded}</span> new
            {/* 🔴 SHOWN SEPARATELY FROM "recorded". A re-run records 0 and may still UPDATE rows whose
                thread headers were never captured — reporting them as one number would hide that. */}
            {result.updated > 0 && <>, filled in the missing reply headers on <span className="font-bold">{result.updated}</span></>}
            {result.bodiesStored > 0 && <>, stored <span className="font-bold">{result.bodiesStored}</span> for instant viewing</>}
            .
            {/* 🔴 THE IMPORTER IS HISTORY ONLY. New mail is left where reply pickup can find it —
                recording it here would take it out of the poll's reach, which is exactly how a real
                reply went unlogged on 29 September. */}
            {result.leftForPoll > 0 && (
              <> <span className="font-bold">{result.leftForPoll}</span> left for reply pickup.</>
            )}
            {' '}
            {result.walked.filter(w => w.skipped).length > 0 && (
              <span className="text-slate-400">
                Empty: {result.walked.filter(w => w.skipped).map(w => w.mailbox).join(', ')}.
              </span>
            )}
          </p>
          {/* 🔴 NAMES, NOT COUNTS. "12 logged contacts have no email in the mailbox" is a number nobody
              can act on; a truck name is a row Dominic can open. Both lists are questions for him —
              nothing here reconciles them. */}
          <p className="text-[11px] text-slate-600 flex flex-wrap items-center gap-x-3">
            <button type="button" onClick={() => setOpenList(o => o === 'unmatched' ? null : 'unmatched')}
              className="underline font-semibold text-slate-700 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400 rounded">
              {result.mismatches.loggedButUnmatched.length} logged as emailed with no email found
            </button>
            <button type="button" onClick={() => setOpenList(o => o === 'replies' ? null : 'replies')}
              className="underline font-semibold text-slate-700 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400 rounded">
              {result.mismatches.repliesNotLogged.length} replies not in the contact log
            </button>
          </p>
          {list && (
            <div className="border border-slate-200 rounded-lg bg-white max-h-40 overflow-y-auto divide-y divide-slate-100">
              {list.length === 0
                ? <p className="px-2 py-1.5 text-[11px] text-slate-500">Nothing on this list.</p>
                : list.map(m => (
                  <p key={m.prospect_id} className="px-2 py-1 text-[11px] text-slate-700">
                    <span className="font-semibold">{m.name ?? '(no truck name)'}</span>
                    <span className="text-slate-500"> — {m.reason}</span>
                  </p>
                ))}
            </div>
          )}
          {result.errors.length > 0 && (
            <p className="text-[11px] text-red-700">
              {result.errors.map(e => `${e.step}: ${e.error}`).join(' · ')}
            </p>
          )}
        </div>
      )}
    </>
  )
}



// ── DO-NOT-CONTACT (item 5) — prominent toggle over the nullable do_not_contact column ───────────────
// Checked → true; unchecked → NULL (never false), same rule as the other tri-state fields. Disabled with
// a note until the column is applied (the route reports `enabled`), so it is never edited into the void.
// ── 🔴 THE READ-ONCE META FACTS — ONE DEFINITION, RENDERED IN TWO PLACES ─────────────────────────
// Below `sm` these four must SCROLL AWAY while STAGE stays locked, and no CSS can reparent a node: the
// meta strip is a `flex-shrink-0` SIBLING of the scroller, not an ancestor of it. So the group is
// rendered twice — once in the strip (`contents max-sm:hidden`, desktop) and once inside the scrolling
// body (`sm:hidden`, phone) — and exactly one of the two is ever displayed.
//
// 🔴 EXTRACTED RATHER THAN COPY-PASTED, AND THAT IS THE POINT. `components/DemoModeBanner.tsx` records
// what happens otherwise: "three separate copies that had ALREADY drifted — same strip, three different
// sentences". Two call sites, one definition, nothing to drift.
//
// ⚠️ WHY DUPLICATE RENDERING IS SAFE HERE, CHECKED RATHER THAN ASSUMED (see the report):
//   • NO `id`/`htmlFor` anywhere in this file — every label uses IMPLICIT association (the input is a
//     child of the label), so two copies cannot collide on an id or break a label pairing.
//   • `DoNotContactToggle` holds NO state, effect or ref: `on = p.do_not_contact === true` is a pure
//     function of props, so both copies always agree by construction and both call the SAME `onPatch`.
//   • `DemoLinkChip` holds only its own `copied` flag. Two instances hold two independent flags; the
//     hidden one is never set, because a `display:none` element cannot be clicked or focused.
//   • Nothing here registers a document/window listener or an effect, so there is no double fire.


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


function MediaCell({ p, kind, onUpload, refreshNonce }: {
  p: Prospect
  kind: 'logo' | 'photo'
  onUpload: (prospectId: string, kind: 'logo' | 'photo', file: File, confirmTruck?: string) => Promise<void>
  /** Bumped by load() on success. Only that it CHANGES matters — see useThumbLatch. */
  refreshNonce: number
}) {
  const value = kind === 'logo' ? p.logo_url : p.photo_url
  const src = mediaSrc(value, kind === 'logo' ? 'logos' : 'photos')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  // 🔴 THE LATCH MOVED INTO THE SHARED HOOK — see useThumbLatch. `broken` now also clears on a refresh,
  // not only on a changed value.
  const { broken, onError: onThumbError } = useThumbLatch({
    value, src, refreshNonce, kind, name: p.name,
  })

  // A new value deserves a fresh verdict for the ERROR TEXT too — otherwise a successful upload would
  // inherit the previous value's message. ⚠️ `broken` is no longer reset here; the hook owns it.
  useEffect(() => { setErr(null) }, [value])

  const accept = async (files: FileList | null) => {
    const file = Array.from(files ?? [])[0]
    if (!file) return
    // ⚠️ The browser-side copy of the type check. The SERVER enforces it too — this one only saves a
    // pointless round trip and gives an instant reason.
    if (!file.type.startsWith('image/')) { setErr(`Not an image (${file.type || 'unknown'})`); return }
    setBusy(true); setErr(null)
    // 🔴 THE CONFIRMATION HAPPENS BEFORE A BYTE IS SENT. Logos only: a photo never reaches a truck row.
    let confirmTruck: string | undefined
    if (kind === 'logo') {
      const c = confirmLogoWrite(p, 'Replace')
      if (c === false) { setBusy(false); return }        // he said no — nothing uploaded, nothing written
      confirmTruck = c ?? undefined
    }
    try { await onUpload(p.id, kind, file, confirmTruck) }
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
      <img src={src} alt="" onError={onThumbError}
        title={`${kind} — ${value}`}
        // 🔴 LOGOS ARE CONTAINED, PHOTOS ARE COVERED. `object-cover` fills the box and crops the overflow,
        // which for a WIDE WORDMARK in a 40px circle can crop away every letter and render as a blank disc —
        // a logo that is present looking exactly like one that is missing. A brand mark must be shown whole.
        // A food photo is a scene and still wants `cover`, or it letterboxes into a strip.
        className={`${box} ${kind === 'logo' ? 'object-contain p-0.5' : 'object-cover'} border border-slate-200 bg-white`} />
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


// ── One prospect row (opens the prospect PAGE via onOpen) ─────────────────────────────────────────────
// 🔴 React.memo (item 5): with stable onOpen/onPatch, a row re-renders only when its OWN `p` changes, so a
// single-cell edit does not re-render all 231 rows. Truncation (`truncate`) plus the fixed <colgroup>
// keeps every cell within its column width, so content never widens a column on sort (item 4).
const Row = memo(function Row({ p, step, onOpen, onOpenSchedule, onPatch, onUpload, isCountStale, refreshNonce }: {
  p: Prospect
  /** The derived next step for this row. Passed IN rather than computed here so every consumer of it —
   *  the queue filter, this cell and the composer — reads the identical object. */
  step?: Step
  onOpen: (id: string) => void
  onOpenSchedule: (p: Prospect) => void
  isCountStale: boolean
  onPatch: (id: string, patch: Record<string, unknown>) => void
  onUpload: (prospectId: string, kind: 'logo' | 'photo', file: File, confirmTruck?: string) => Promise<void>
  /** 🔴 PASSED THROUGH TO BOTH MEDIA CELLS. `Row` is `memo`-wrapped, so this must be a prop rather than
   *  read from a context — a context read would not re-render a memoised row when the nonce changed. */
  refreshNonce: number
}) {
  const overdue = isOverdue(p.next_action_at)
  // 🔴 `contactChannel`, `lead` AND `contactTitle` WENT WITH THE CONTACT CELL (16 September 2026).
  // All three existed ONLY to render that one cell and its tooltip; lint confirmed each had no other
  // reader in this row once the cell was removed. `channelFor`, `leadOf` and `phoneWhatsApp` themselves
  // are untouched and still used elsewhere — the work queue gates on `channelFor` (§57.2) and the
  // needs-details list ranks on `leadOf`.
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
      <td className="px-2 py-2 text-center"><div className="flex items-center justify-center"><MediaCell p={p} kind="logo" onUpload={onUpload} refreshNonce={refreshNonce} /></div></td>
      <td className="px-2 py-2 text-center"><div className="flex items-center justify-center"><MediaCell p={p} kind="photo" onUpload={onUpload} refreshNonce={refreshNonce} /></div></td>
      {/* 🔴 (4) THE TRUCK NAME IS THE CONTROL. The dedicated "Open" column is gone and the name opens the
          page, using the SAME `onOpen(p.id)` handler the Open link used — nothing about opening changed.
          🔴 A REAL <button>, NOT AN onClick ON A DIV OR A SPAN: it is in the tab order, takes focus, and
          activates on Enter and Space for free. A div with a handler is none of those things.
          ⚠️ The DNC chip stays OUTSIDE the button — it is a status marker, not part of the control's
          label, and reading "🚫 DNC Pizza Mondo" as a button name is worse than reading "Pizza Mondo". */}
      <td className="px-3 py-2 font-medium truncate text-center">
        {p.do_not_contact === true && (
          <span className="mr-1 align-middle text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-700" title="Do not contact">🚫 DNC</span>
        )}
        {/* ⚠️ A STATUS MARKER, OUTSIDE THE BUTTON, for the same reason the DNC chip is: it is not part
            of the control's name. A bounced address is why a prospect has gone quiet, and it has to be
            visible without opening every row. */}
        {p.emailBounced === true && (
          <span className="mr-1 align-middle text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-700"
            title="An email to this prospect bounced — check the address on the truck row.">Email bounced</span>
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
      {/* ── 🔴 CONTACT — ONE DERIVED CELL REPLACING THE PHONE AND EMAIL VALUE COLUMNS ────────────────
          Reachable → the channel a message would actually go out on. Not reachable → the lead to chase
          instead, shown as its HOST because that is the signal; the full URL is in the title.
          🔴 NO <a href> IS ADDED. Nothing in a row has ever linked anywhere — 🧪 zero href / mailto: /
          tel: / wa.me in this component's rows — and everything is still "open the modal". A host
          rendered as TEXT says which lead to chase without changing what a row DOES; making these
          clickable is a deliberate decision for another day, not a side effect of a column swap. */}
      {/* 🔴 TWO READ-ONLY PRESENCE TICKS, replacing the derived Contact cell. A glyph, never an <input>:
          these are facts about the row, and a checkbox — even disabled — reads as a control.
          ⚠️ The VALUES are still edited in the prospect panel; nothing here writes. */}
      <td className="px-3 py-2 text-center" title={hasValue(p.contact_email) ? 'An email address is stored' : 'No email address stored'}>
        {hasValue(p.contact_email)
          ? <span className="text-slate-700 font-semibold" aria-label="has email">✓</span>
          : <span className="text-slate-300" aria-label="no email">—</span>}
      </td>
      <td className="px-3 py-2 text-center" title={hasValue(p.phone) ? 'A phone number is stored' : 'No phone number stored'}>
        {hasValue(p.phone)
          ? <span className="text-slate-700 font-semibold" aria-label="has mobile">✓</span>
          : <span className="text-slate-300" aria-label="no mobile">—</span>}
      </td>
      {/* item 3: checkbox centred. step E: reflects MY confirmation (whatsapp_confirmed). */}
      <td className="px-3 py-2 text-center"><WhatsAppBox p={p} onPatch={onPatch} /></td>

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
      {/* 🔴 THE DATE OPENS THE PROSPECT, LIKE THE TRUCK NAME DOES — the same `onOpen(p.id)` handler and
          the same reason it is a real <button>: it is in the tab order, takes focus, and activates on
          Enter and Space for free, which an onClick on a <span> does none of.
          ⚠️ THE BUTTON WRAPS ONLY THE DATE, NOT THE CELL. An empty cell (🧪 222 of 231 rows today) stays
          inert — a full-width target on a dash would be 222 rows of clickable nothing — and the <tr>
          still carries no onClick, so a mis-click while scanning cannot open a modal.
          🧪 IT ADDS NO LINK. There is still no href / mailto: / tel: / wa.me anywhere in a row; opening
          the modal is what every other interactive cell in this table already does. */}
      <td className="px-3 py-2 truncate text-center">
        {p.next_action_at
          ? <button type="button" onClick={() => onOpen(p.id)}
              title={`Open ${p.name}`}
              className={`rounded focus:outline-none focus:ring-2 focus:ring-orange-400 hover:underline ${
                overdue ? 'text-red-600 font-semibold' : 'text-slate-600'}`}>
              {fmtDate(p.next_action_at)}{overdue && ' ⚠'}
            </button>
          : <span className="text-slate-300">—</span>}
      </td>
      {/* 🔴 THE DERIVED NEXT STEP. Four visual states, and "can't tell" is one of them ON PURPOSE —
          decision D1. A prospect whose logged contacts carry a kind outside the vocabulary must read as
          unreadable, never as "first contact", or the queue would tell the operator to introduce himself
          to someone he has already chased. The amber ⚠ is the same marker the history table uses for the
          same reason. */}
      <td className="px-3 py-2 truncate text-center" title={step ? `${step.label}${step.dueOn ? ` · due ${fmtDate(step.dueOn)}` : ''} · ${LEAD_TYPE_LABELS[step.leadType]}` : undefined}>
        {!step ? <span className="text-slate-300">—</span>
          : step.state === 'unknown'
            ? <span className="text-amber-700 font-semibold">⚠ Can&rsquo;t tell</span>
            : step.state === 'due'
              ? <span className="text-orange-700 font-semibold">{step.label}</span>
              : step.state === 'scheduled'
                ? <span className="text-slate-500">{step.label}{step.dueOn ? ` · ${fmtDate(step.dueOn)}` : ''}</span>
                : <span className="text-slate-400">{step.label}</span>}
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
// 🔴 `safeHref` MOVED to lib/safe-href.ts on 12 September 2026 — byte-identical, imported above, and now
// also guarding the four public sinks and the admin schedule link. Do not re-add a local copy here.




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
/* 🔴 `HDR_CELL` WENT WITH THE HISTORY TABLE that was the only thing sticky-heading. */





/**
 * ONE CONVERSATION WITH ONE TRUCK: emails, calls, stage changes and notes, newest first.
 *
 * 🔴 WHAT THIS REPLACED, AND WHY. The modal showed a Contact-history TABLE and, under it, an Emails
 * list. The same email appeared in both — once as the rung it wrote, once as the message it was — and
 * the two lists sorted independently, so "what happened with this truck" meant reading two lists and
 * merging them by eye. `buildTimeline` merges them once, in a pure function that is tested, and the
 * de-duplication rule is explicit: an email linked to a contact row is shown as the EMAIL, because the
 * email carries the subject, the status, the body and the actions, and the rung carries a label.
 *
 * 🔴 THE THREE STATES THAT NEED A PERSON, AND WHY EACH GETS THE ACTION IT DOES — unchanged from the
 * Emails list this absorbed:
 *   failed     — the server refused it. Nothing reached anyone, so Retry is offered plainly.
 *   uncertain  — the data went and nothing came back. Retry is offered ONLY behind a confirm that says
 *                what to check, because the alternative is a prospect receiving a cold email twice.
 *   sent, not logged — the email HAS gone and the contact log missed it. The fix is a log row, never a
 *                second send, so the only button here is "log it".
 *
 * ⚠️ NO IMAP. The list is one query; expanding an email asks the `view` action, which serves the
 * stored body. Opening a prospect connects to no mailbox at all.
 * ⚠️ AND TEST SENDS ARE HIDDEN. A test is Dominic emailing himself; it is not correspondence with this
 * truck. The toggle shows them without making them part of the story by default.
 */
/** The list a Today section hands the page: its label, and the prospects in it, in order. */
interface TodayQueue { label: string; ids: string[] }

/** One section of the Today screen. ⚠️ AT MODULE SCOPE, not inside `TodayScreen`: a component
 *  declared inside another is a NEW component type on every render, so React unmounts and remounts
 *  its whole subtree — every list below would lose its state on each keystroke elsewhere. */
function TodaySection({ title, hint, count, children }: {
  title: string; hint: string; count: number; children: React.ReactNode
}) {
  return (
    <section className="mb-4">
      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1" title={hint}>
        {title} <span className="text-slate-400">({count})</span>
      </h3>
      <div className="border border-slate-200 rounded-xl bg-white divide-y divide-slate-100 overflow-hidden">
        {children}
      </div>
    </section>
  )
}

/**
 * TODAY — the four things that are actually waiting, in the order they should be done.
 *
 * 🔴 IT IS THE DEFAULT TAB, AND THAT IS THE POINT OF THE WHOLE BUILD. The prospect table answers
 * "what do we know about this truck"; nothing answered "what do I do this morning", so the answer was
 * 231 rows and a memory. Four sections, each hidden when it is empty, and an empty screen that says
 * so in words.
 *
 * 🔴 IT DERIVES NOTHING. `buildToday` sorts and buckets; the STEPS come from `nextStep` upstream —
 * the same map the table's rows and the Due-work count render from — so a chase cannot be due here
 * and not there. §57.1: one derivation, no second one.
 * ⚠️ AND `channelFor`, NOT `step.channel`: every stopped step carries `channel: null`, so reading the
 * step would file reachable trucks as unreachable. The map is built with `channelFor` upstream.
 */
function TodayScreen({ view, loaded, migrationApplied, onOpen, onCompose, onReply, onAction }: {
  view: TodayView
  /** False until the first fetch answers — an empty screen and an unloaded one look identical. */
  loaded: boolean
  /** 🔴 False when the CRM columns are not applied. "Nothing waiting" would then be a LIE — the
   *  screen has no way to know what is waiting — so it says what is actually wrong instead. */
  migrationApplied: boolean
  /** 🔴 Opens the prospect's PAGE, carrying the section it came from as the queue. */
  onOpen: (prospectId: string, queue: TodayQueue) => void
  /** Opens the page with the composer already up, on the step's own template. */
  onCompose: (prospectId: string, queue: TodayQueue) => void
  /** 🔴 Opens the page with the composer ANSWERING this message. */
  onReply: (prospectId: string, messageId: string, queue: TodayQueue) => void
  onAction: () => void | Promise<void>
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [snoozeFor, setSnoozeFor] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [snoozedOpen, setSnoozedOpen] = useState(false)
  const inFlight = useRef(false)

  // 🔴 ONE QUEUE PER SECTION, in the order the section is displayed in. The page walks these with
  // ‹ › and J/K, and names them at the end: "That's everything in Replies waiting."
  const repliesQueue = { label: 'Replies waiting', ids: view.replies.map(r => r.prospect_id) }
  const chasersQueue = { label: 'Chasers due', ids: view.chasers.map(c => c.prospect_id) }
  const followUpsQueue = { label: 'Follow-ups due', ids: view.followUps.map(f => f.prospect_id) }
  const problemsQueue = { label: 'Emails needing a look', ids: view.problems.map(e => e.prospect_id) }

  const act = async (body: Record<string, unknown>, id: string) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusyId(id); setMsg(null); setSnoozeFor(null)
    try {
      const r = await fetch('/api/admin/outreach/timeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await nativeAuthHeader()) },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      })
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
      setMsg(j.ok === true ? String(j.message ?? 'Done.') : String(j.refusal ?? j.error ?? 'That did not work.'))
      // 🔴 THE LIST RE-READS ITSELF. A queue that still shows the thing you just dealt with is a
      // queue you stop believing.
      await onAction()
    } catch { setMsg('The connection dropped before the server answered.') }
    finally { inFlight.current = false; setBusyId(null) }
  }

  if (!loaded) return <p className="py-10 text-center text-sm text-slate-400">Loading today…</p>
  if (!migrationApplied) {
    return (
      <div className="py-12 text-center">
        <p className="font-bold text-slate-900">Today cannot be built yet.</p>
        <p className="text-sm text-slate-500 mt-1">
          `outreach_messages.handled_at` / `snoozed_until` are missing — apply
          `supabase/migrations/20260929_outreach_crm_today_timeline.sql`.
        </p>
      </div>
    )
  }
  if (view.total === 0 && view.snoozed.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-lg font-bold text-slate-800">Nothing waiting. Nice.</p>
        <p className="text-sm text-slate-500 mt-1">No replies to answer, no chases due, no follow-ups, no emails to look at.</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      {/* ⚠️ "Nothing waiting" WITH SOMETHING SNOOZED is not an empty screen — the heading below says
          how many are put off, which is exactly the fact that would otherwise be invisible. */}
      {view.total === 0 && (
        <p className="mb-4 text-lg font-bold text-slate-800">Nothing waiting. Nice.</p>
      )}
      {/* (a) 🔴 REPLIES FIRST, OLDEST FIRST. Someone is waiting on an answer; nothing else on this
          screen has a person at the other end of it. */}
      {view.replies.length > 0 && (
        <TodaySection title="Replies waiting" count={view.replies.length}
          hint="Inbound emails that have not been answered or marked done. Oldest first — the one that has waited longest is the one to answer.">
          {view.replies.map(r => (
            <div key={r.id} className="px-3 py-2 flex items-start gap-3" style={{ background: INBOUND_BG }}>
              <div className="flex-1 min-w-0">
                <button type="button" onClick={() => onOpen(r.prospect_id, repliesQueue)}
                  className="font-bold text-slate-900 hover:underline text-sm text-left">
                  {r.prospect_name ?? '(no truck name)'}
                </button>
                <p className="text-[12px] text-slate-700 mt-0.5 break-words">{r.snippet}</p>
              </div>
              <span className="text-[11px] text-slate-500 whitespace-nowrap pt-0.5">{fmtDate(r.message_date)}</span>
              <div className="flex flex-wrap items-center gap-1 justify-end">
                {/* 🔴 REPLY IS THE FIRST BUTTON, because answering is the thing this row is asking
                    for. It opens the prospect with the composer already up on THIS message, the
                    conversation visible below the editor. Nothing is sent until Send is pressed. */}
                <button type="button"
                  onClick={() => onReply(r.prospect_id, r.id, repliesQueue)}
                  title="Answer this reply, with the conversation quoted underneath."
                  className="text-[11px] font-bold px-2 py-0.5 rounded border border-orange-300 text-orange-800 bg-orange-50 hover:bg-orange-100">
                  Reply
                </button>
                <button type="button" onClick={() => onOpen(r.prospect_id, repliesQueue)}
                  className="text-[11px] font-bold px-2 py-0.5 rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-50">
                  Open
                </button>
                <button type="button" onClick={() => void act({ action: 'mark_handled', message_id: r.id }, r.id)}
                  disabled={busyId === r.id}
                  title="Dealt with. It leaves this list; nothing is sent and nothing is logged."
                  className="text-[11px] font-bold px-2 py-0.5 rounded border border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-40">
                  Mark done
                </button>
                <button type="button" onClick={() => setSnoozeFor(snoozeFor === r.id ? null : r.id)}
                  title="Hide it until a chosen morning. It comes back on its own."
                  className="text-[11px] font-bold px-2 py-0.5 rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-50">
                  Snooze
                </button>
                {snoozeFor === r.id && SNOOZE_OPTIONS.map(o => (
                  <button key={o} type="button" disabled={busyId === r.id}
                    onClick={() => void act({ action: 'snooze', message_id: r.id, option: o }, r.id)}
                    className="text-[11px] font-bold px-2 py-0.5 rounded border border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 disabled:opacity-40">
                    {SNOOZE_LABELS[o]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </TodaySection>
      )}

      {/* (b) 🔴 THE DERIVED QUEUE, MOST OVERDUE FIRST. */}
      {view.chasers.length > 0 && (
        <TodaySection title="Chasers due" count={view.chasers.length}
          hint="Derived from the contact ladder by nextStep (§57): reachable prospects whose next rung is due today or overdue. Correct the contact log and this changes.">
          {view.chasers.map(c => (
            <div key={c.prospect_id} className="px-3 py-2 flex items-center gap-3">
              <button type="button" onClick={() => onOpen(c.prospect_id, chasersQueue)}
                className="flex-1 min-w-0 text-left font-bold text-slate-900 hover:underline text-sm truncate">
                {c.name ?? '(no truck name)'}
              </button>
              <span className="text-[12px] font-semibold text-slate-700 whitespace-nowrap">{c.label}</span>
              <span className="text-[11px] text-slate-500 whitespace-nowrap">
                {c.dueOn ? `due ${fmtDate(c.dueOn)}` : 'never contacted'}
                {c.daysOverdue > 0 && (
                  <span className="text-amber-800 font-bold"> · {c.daysOverdue} day{c.daysOverdue === 1 ? '' : 's'} overdue</span>
                )}
              </span>
              <span className="text-[10px] font-bold uppercase text-slate-400 w-16 text-right">{c.channel}</span>
              {/* 🔴 COMPOSE OPENS THE PROSPECT WITH THE WINDOW ALREADY UP, and the template comes from
                  `templateForStep` inside the modal — the one pre-selection rule, not a second one. */}
              <button type="button" onClick={() => onCompose(c.prospect_id, chasersQueue)}
                title="Opens the prospect and the compose window, with this step's template pre-selected. Nothing is sent until you press send."
                className="text-[11px] font-bold px-2 py-0.5 rounded border border-orange-300 text-orange-800 bg-orange-50 hover:bg-orange-100">
                Compose
              </button>
            </div>
          ))}
        </TodaySection>
      )}

      {/* (c) The date Dominic wrote down himself, for everyone not already above. */}
      {view.followUps.length > 0 && (
        <TodaySection title="Follow-ups due" count={view.followUps.length}
          hint="next_action_at is today or in the past. Prospects already listed under Replies waiting or Chasers due are not repeated here.">
          {view.followUps.map(f => (
            <div key={f.prospect_id} className="px-3 py-2 flex items-center gap-3">
              <button type="button" onClick={() => onOpen(f.prospect_id, followUpsQueue)}
                className="flex-1 min-w-0 text-left font-bold text-slate-900 hover:underline text-sm truncate">
                {f.name ?? '(no truck name)'}
              </button>
              <span className="text-[11px] text-slate-500 whitespace-nowrap">
                {fmtDate(f.due)}
                {f.daysOverdue > 0 && <span className="text-amber-800 font-bold"> · {f.daysOverdue} day{f.daysOverdue === 1 ? '' : 's'} overdue</span>}
              </span>
              <button type="button" onClick={() => onOpen(f.prospect_id, followUpsQueue)}
                className="text-[11px] font-bold px-2 py-0.5 rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-50">
                Open
              </button>
            </div>
          ))}
        </TodaySection>
      )}

      {/* (d) ⚠️ NOT WORK ON A PROSPECT — WORK ON AN EMAIL. A bounce needs the address looking at, and
          `uncertain` needs the Sent folder checked before anything is re-sent. */}
      {view.problems.length > 0 && (
        <TodaySection title="Emails needing a look" count={view.problems.length}
          hint="Outbound emails that failed, may have been sent, or bounced. Open the prospect to retry, file a copy, or fix the address.">
          {view.problems.map(e => (
            <div key={e.id} className="px-3 py-2 flex items-center gap-3">
              <button type="button" onClick={() => onOpen(e.prospect_id, problemsQueue)}
                className="flex-1 min-w-0 text-left font-bold text-slate-900 hover:underline text-sm truncate">
                {e.prospect_name ?? '(no truck name)'}
              </button>
              <span className="flex-1 min-w-0 truncate text-[12px] text-slate-600" title={e.subject ?? ''}>{e.subject ?? '—'}</span>
              <span className={`text-[11px] font-bold whitespace-nowrap ${e.status === 'uncertain' ? 'text-amber-800' : 'text-red-700'}`}>
                {PROBLEM_LABEL[e.status] ?? e.status}
              </span>
              <span className="text-[11px] text-slate-400 whitespace-nowrap">{fmtDate(e.message_date)}</span>
              <button type="button" onClick={() => onOpen(e.prospect_id, problemsQueue)}
                className="text-[11px] font-bold px-2 py-0.5 rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-50">
                Open
              </button>
            </div>
          ))}
        </TodaySection>
      )}
      {/* ── 🔴 SNOOZED — COLLAPSED, BUT THERE ────────────────────────────────────────────────
          A snooze hides a reply from the four sections above, which is what it is for. It must not
          hide it from the SCREEN: "put off until Tuesday" and "lost" look identical if nothing lists
          them, and the first time Dominic discovers a snoozed reply he had forgotten, he stops
          trusting the button. Collapsed because it is not today's work; counted in its own heading
          rather than in the tab, for the same reason. */}
      {view.snoozed.length > 0 && (
        <section className="mb-4">
          <button type="button" onClick={() => setSnoozedOpen(o => !o)}
            className="text-xs font-bold uppercase tracking-wide text-slate-500 hover:text-slate-700">
            {snoozedOpen ? '▾' : '▸'} Snoozed <span className="text-slate-400">({view.snoozed.length})</span>
          </button>
          {snoozedOpen && (
            <div className="mt-1 border border-slate-200 rounded-xl bg-white divide-y divide-slate-100 overflow-hidden">
              {view.snoozed.map(r => (
                <div key={r.id} className="px-3 py-2 flex items-center gap-3">
                  <button type="button" onClick={() => onOpen(r.prospect_id, { label: 'Snoozed', ids: view.snoozed.map(x => x.prospect_id) })}
                    className="flex-1 min-w-0 text-left font-bold text-slate-900 hover:underline text-sm truncate">
                    {r.prospect_name ?? '(no truck name)'}
                  </button>
                  <span className="flex-1 min-w-0 truncate text-[12px] text-slate-500">{r.snippet}</span>
                  <span className="text-[11px] text-slate-500 whitespace-nowrap">
                    back {fmtDate(r.snoozed_until)}
                  </span>
                  {/* ⚠️ UNSNOOZE IS "Mark as needing reply" — the SAME action the timeline offers, by
                      the same route. It clears both columns, so the reply is back on the list now. */}
                  <button type="button" disabled={busyId === r.id}
                    onClick={() => void act({ action: 'needs_reply', message_id: r.id }, r.id)}
                    title="Bring this reply back to Replies waiting now."
                    className="text-[11px] font-bold px-2 py-0.5 rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40">
                    Unsnooze
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      {msg && <p className="text-[11px] text-slate-600">{msg}</p>}
    </div>
  )
}

/** 🔴 ONE FETCHER PER ROUTE, AT MODULE SCOPE. Both the mount effect and the after-an-action reload
 *  call it, so there is no second copy of the URL, the parse or the ok-check. A failed request
 *  returns null and the caller keeps what it had — a network blip must not blank the screen. */
async function fetchToday(): Promise<TodayPayload | null> {
  // ⚠️ THE NATIVE HEADER, like `load()`. The web app authenticates by cookie; the native shell sends
  // its Supabase session as a Bearer, and `verifyAdmin` only consults that when there is no cookie
  // user. A plain fetch would 404 inside the app while working perfectly in a browser.
  const h = await nativeAuthHeader()
  const r = await fetch('/api/admin/outreach/today', { headers: h, credentials: 'same-origin' }).catch(() => null)
  if (!r) return null
  const j = (await r.json().catch(() => null)) as TodayPayload | null
  return j && j.ok ? j : null
}
/* 🔴 `HistoryTable` WAS HERE AND IS GONE (29 September 2026), with `HISTORY_COLS` and the separate
 * `EmailViewer` popout. It rendered `outreach_contacts` as a four-column table while the Emails list
 * rendered `outreach_messages` underneath it, and an email that had been logged appeared in both.
 * `Timeline` replaces both; `ContactPopout` — where Delete lives — is unchanged and is opened from a
 * contact row there. The `MailMessage` type went with the list that owned it. */
