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
import { safeHref } from '@/lib/safe-href'
import ConfirmDeleteDialog from '@/components/admin/ConfirmDeleteDialog'   // MOVED here too; the events table uses the same dialog
import ScheduleEventsPopup from '@/components/admin/ScheduleEventsPopup'
import ComposeWindow from '@/components/admin/ComposeWindow'
import CreateDemoModal from '@/components/admin/CreateDemoModal'   // the outreach "Create Demo" — stacked ABOVE the prospect modal
// Only the two GATING helpers are needed here now; the picker, the renderer, the footer and the
// copy action all live in ComposeWindow.
// 🔴 TEMPLATES COME FROM THE DATABASE NOW. This module holds the MECHANISM only — no message copy.
import { templatesFor, suggestTemplateId, contextFromProspect, type MessageTemplate } from '@/lib/outreach-template-render'
import type { Snippet } from '@/lib/outreach-snippets'
import { formatImageUrl } from '@/lib/image-utils'   // shared resolver — the SAME one /api/discovery/events uses
import { phoneWhatsApp } from '@/lib/whatsapp-hint'   // pure — used only to build the wa.me link
// 🔴 THE DERIVED STEP. Pure, no I/O, no stored state — see lib/outreach-step.ts. Imported here rather
// than reimplemented so the queue, the row label and the composer's pre-selection read ONE answer.
import {
  nextStep, templateForStep, needsAttention, LEAD_TYPE_LABELS, LEAD_TYPES,
  leadTypeOf, isLeadType, shouldFreezeLeadType, channelFor, hasValue,
  type Step,
} from '@/lib/outreach-step'
import {
  OUTREACH_STAGES, CONTACT_CHANNELS, CONTACT_DIRECTIONS,
  REPLY_KIND, kindsForDirection, defaultKindFor, kindOrder,
  contactDay,
  kindLabel, channelLabel, directionLabel, followUpDateFor,
  type OutreachStage,
  isOverdue,
  isHatchesUp,
  toYMD,
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

type Contact = {
  id: string; contacted_at: string; channel: string | null; direction: string | null
  kind: string | null; message: string | null
  /** Insert time. The ONLY thing that separates two contacts logged on the same day — see HistoryTable. */
  created_at: string
}
type Prospect = {
  id: string; discovery_truck_id: string; name: string
  /** The NEWEST live demo built for this prospect (/api/admin/outreach), or null when there is none —
   *  and null too when the demo_sessions migration is not applied yet (the route degrades rather than
   *  500ing the page). `liveCount` > 1 means older live demos exist behind this one. */
  demo?: {
    publicRef: string | null; expiresAt: string | null; createdAt: string | null; liveCount: number
    /** The truck the demo runs as. Present ⇒ it can be REBUILT over itself with new kitchen settings;
     *  a demo cannot be un-created. Already returned by /api/admin/outreach — nothing was added there. */
    truckId?: string | null
  } | null
  logo_url: string | null; photo_url: string | null
  // 🔴 OPTION A — WHOSE LOGO THIS ACTUALLY IS. `logo_url` above is now the AUTHORITATIVE value the route
  // resolved (trucks.logo_storage_path for a linked prospect, discovery_trucks.logo_url otherwise), so the
  // cell renders one candidate and never has to choose. These three say what a WRITE would touch.
  logo_target?: 'truck' | 'demo' | 'prospect'
  logo_truck_name?: string | null
  /** True when a write would change a live truck's order page, confirmation email and QR poster. */
  logo_needs_confirm?: boolean
  /** 🔴 LEGACY AND UNREAD. Kept on the type because the route still returns it for one release — see
   *  the note in app/api/admin/outreach/route.ts. The two fields below are what the form and the
   *  template substitution use. */
  contact_name: string | null
  contact_first_name: string | null; contact_last_name: string | null
  do_not_contact: boolean | null; entity_type: string | null
  contact_email: string | null; phone: string | null; mobile: string | null
  website: string | null; schedule_url: string | null
  order_url: string | null; excluded: boolean
  /** discovery_trucks.show_on_vf — NOT NULL DEFAULT true. Part of the lead-type derivation. */
  show_on_vf: boolean
  /** discovery_trucks.hatchgrab_truck_id — non-null ⇒ converted; the queue stops chasing. */
  hatchgrab_truck_id: string | null
  /** 🔴 outreach_prospects.lead_type_at_first_contact — the FROZEN lead type, or null.
   *  Null (including while the migration is unapplied) ⇒ derive live. See effectiveLeadType. */
  lead_type_at_first_contact: string | null
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
// ── MEDIA UPLOAD ──────────────────────────────────────────────────────────────────────────────────
// 🔴 NO OPTIMISTIC UPDATE HERE, DELIBERATELY, and this is the opposite choice to patchProspect above.
// patchProspect writes a value the client already knows; an upload's result is a URL only the SERVER
// can produce, and the row must not show an image until the column actually holds one. Showing it
// early would make a failed DB write look like a success — the precise failure this flow guards.
// The row is patched ONLY from the URL the server returns, after it has written the column.
// ⚠️ Throws on failure so the cell can render the message; the cell owns that display, not a toast,
// because the failure belongs to one slot.
// 🔴 THE GUSTO CONFIRMATION. Returns the truck name to echo back, or null to proceed, or false to
// abandon. The SERVER demands the name too — this is the sentence a person reads, not the enforcement.
function confirmLogoWrite(p: Prospect, verb: string): string | null | false {
  if (!p.logo_needs_confirm) return null
  const name = (p.logo_truck_name ?? p.name ?? 'this truck').trim()
  const ok = window.confirm(
    [
      `${verb} the logo for ${name}?`,
      '',
      `${name} is a LIVE HatchGrab truck. This changes what its customers see:`,
      'its order page, its order confirmation email and its QR poster.',
      '',
      'Press OK to continue.',
    ].join('\n'))
  return ok ? name : false
}

const mediaSrc = (u: string | null, folder: 'logos' | 'photos'): string | null =>
  formatImageUrl(u, folder) || null

export default function OutreachPanel() {
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
  // Whether each hand-applied column exists yet (probed by the route, not inferred from row values).
  /** Whether BOTH name columns exist — one probe, because half a split is not usable. */
  const [hasContactNames, setHasContactNames] = useState(false)
  /** Whether 20260914_outreach_lead_type_freeze.sql has been applied. False ⇒ never write the column. */
  const [hasLeadTypeFreeze, setHasLeadTypeFreeze] = useState(false)
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
  // The "Create Demo" modal, stacked above the prospect modal. Keyed by the PROSPECT ID it was opened
  // for, not a boolean: it is open only while `createDemoForId === modalId`, so any change of prospect
  // (Close, ←/→, filter) drops it with no reset effect and no stale flag popping it open on the next
  // prospect. The REF mirrors that predicate at commit for the Escape listener below, which must not
  // close the prospect modal while this one is open (see CreateDemoModal's header, rule 2).
  const [createDemoForId, setCreateDemoForId] = useState<string | null>(null)
  const createDemoOpen = createDemoForId !== null && createDemoForId === modalId
  const createDemoOpenRef = useRef(false)
  useEffect(() => { createDemoOpenRef.current = createDemoOpen }, [createDemoOpen])
  // The prospect whose schedule popup is open — state of its own, because the schedule popup and the
  // prospect modal are independent surfaces and opening one must never imply the other.
  // 🔴 LOADED FROM `outreach_templates`, NOT FROM CODE. `null` means "not loaded yet or unreachable" and
  // is deliberately distinct from `[]`, which means "the table is there and has none" — the compose
  // window says something different for each.
  const [templates, setTemplates] = useState<MessageTemplate[] | null>(null)
  /** 🔴 THE SNIPPET LIBRARY. Loaded once beside the templates and handed to the compose window, so a
   *  value set on the Templates tab reaches every message without the window reading storage itself —
   *  which is what the layer it replaces did, and why that layer only worked in one browser.
   *  ⚠️ An empty array is the honest degrade: before the migration is applied the route answers 200
   *  with `{ snippets: [], hasSnippets: false }`, and every field prompts exactly as it does today. */
  const [snippets, setSnippets] = useState<Snippet[]>([])
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
      setHasContactNames(!!data.hasContactNames)
      setHasLeadTypeFreeze(!!data.hasLeadTypeFreeze)
      setHasDoNotContact(!!data.hasDoNotContact)
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
          servesKind: r.serves_kind ?? null, servesLeadType: r.serves_lead_type ?? null,
          defaults: Object.fromEntries(Object.entries(r.placeholder_defaults ?? {})
            .map(([k, v]: [string, any]) => [k, { value: v?.value ?? '', updatedAt: v?.updated_at ?? null }])),
        })))
      } catch { if (alive) setTemplates(null) }
      // 🔴 A SEPARATE, NON-FATAL FETCH. The snippet library failing must never stop templates loading —
      // it is a convenience over a tier that has always worked by prompting.
      try {
        const h2 = await nativeAuthHeader()
        const r2 = await fetch('/api/admin/outreach-snippets', { headers: h2, credentials: 'same-origin' })
        if (r2.ok && alive) { const d2 = await r2.json(); setSnippets(d2.snippets ?? []) }
      } catch { /* the tier prompts, as it always has */ }
    })()
    return () => { alive = false }
  }, [])

  // Escape closes the modal (the backdrop still does NOT — no outside-click close). Belt-and-braces with
  // the always-visible Close button, since the modal can be tall.
  // 🔴 GATED while the Create Demo modal is open: both listeners are bubble-phase on window and BOTH fire
  // on one Escape; this one declines and the child closes itself. No capture phase, no stopPropagation,
  // no registration-order dependence — the C15 trap (two capture listeners on one node) is avoided by
  // not having two capture listeners.
  useEffect(() => {
    if (!modalId) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !createDemoOpenRef.current) setModalId(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modalId])

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
        return reachable && needsAttention(steps.get(p.id)!)
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
  const [confirmKind, setConfirmKind] = useState<'logo' | 'photo' | null>(null)
  const visible = computedVisible

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

  // ── REMOVE A LOGO OR PHOTO ────────────────────────────────────────────────────────────────────────
  // 🔴 NO OPTIMISTIC CLEAR, for the same reason uploadMedia has no optimistic set: the row must not show
  // an empty slot until the column is actually empty, or a failed delete would look like a success and
  // invite an upload that then hits the "slot already filled" refusal with no explanation.
  // ⚠️ The server reports whether the FILE was removed as well as the column; when it deliberately left a
  // file alone (a static /logos asset, or one inside an operator truck's folder) it says so, and that
  // note is surfaced in the toast rather than swallowed.
  const deleteMedia = useCallback(async (prospectId: string, kind: 'logo' | 'photo', confirmTruck?: string) => {
    const h = await nativeAuthHeader()
    const res = await fetch('/api/admin/outreach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...h },
      credentials: 'same-origin',
      body: JSON.stringify({ action: 'delete_media', id: prospectId, column: kind, confirm_truck: confirmTruck ?? null }),
    })
    const data = await res.json().catch(() => ({} as any))
    if (!res.ok) throw new Error(data?.error || `Remove failed (${res.status})`)
    // 🔴 THIS ONE STAYS AN OPTIMISTIC CLEAR, AND THE REASON IS MEASURED, NOT ASSUMED (round 3).
    // The upload path above now re-reads instead of merging, so the obvious move would be to do the same
    // here. It is not needed, because null is exactly what a reload WOULD return in every case:
    //   • demo-backed or linked prospect — the delete route clears `trucks.logo_storage_path`, and the
    //     list route computes `logoTarget.truckId ? resolveTruckLogo(…, null) : …`. `resolveTruckLogo`
    //     returns null for a null path and 🔴 ADDS NO FALLBACK to `discovery_trucks.logo_url` — its own
    //     comment says so: "an operator who cleared their logo sees it cleared here too".
    //   • unlinked prospect — the discovery column itself is cleared, so `truck?.logo_url ?? null` is null.
    //   • photo — always `discovery_trucks.photo_url`, cleared, so null.
    // ⚠️ SO THERE IS NO CASE WHERE A RELOAD WOULD RETURN A NON-NULL LOGO FOR A ROW JUST CLEARED, which is
    // the condition that would have forced a load() here. Leaving it optimistic also keeps the delete
    // feeling instant, and `deleteMedia` is called from a confirm dialog where a re-read would be visible.
    setProspects(ps => ps.map(x => x.id === prospectId
      ? ({ ...x, [kind === 'logo' ? 'logo_url' : 'photo_url']: null } as Prospect) : x))
    showToast(data?.fileNote ? `${kind} cleared — ${data.fileNote}` : `${kind} removed`)
  }, [showToast])

  // Undo of a just-logged contact — deletes THAT row by id (never "the latest"; see item 4).
  // 🔴 SIGNATURES OF WHAT THIS SESSION HAS ALREADY WRITTEN, as a backstop for the guard below.
  // `logContact` awaits `load()` before it returns, so `p.contacts` is normally fresh by the time a
  // second click is possible — but a failed or slow refetch would leave the guard reading stale rows,
  // and a guard that silently stops guarding is the failure mode this whole task is about.

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
  const deleteContact = useCallback(async (contactId: string, prospectId?: string) => {
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

    await deleteContact(c.id, pr.id)   // throws → nothing below runs

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
    // ── 🔴 THERE IS NO DUPLICATE GUARD HERE, AND ITS ABSENCE IS DELIBERATE (12 September 2026) ─────
    // A "you already logged that" rule was removed from this writer and from the form above it. Two
    // contacts of the same kind, on the same channel, on the same day are ORDINARY in outreach — a
    // reply out and a reply in, or two calls — and refusing the second one made the operator edit the
    // date to record something that really happened. Logging is an append-only record of events, not a
    // uniqueness constraint. ⚠️ Double-SUBMIT is still handled: `submitLog` returns early while
    // `logging` is true and the button is disabled for that window.
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
      // ⚠️ `warning` ARRIVES ON A SUCCESSFUL LOG. The route returns it when the contact was written but
      // the not_contacted → contacted advance failed. The contact is real, so this must NOT be reported
      // as a failure — but it must be SEEN, or the operator is left with a stage that silently disagrees
      // with the history. `stage` is the resulting stage when this call moved it, and null otherwise
      // (already past not_contacted, inbound, or the update failed) — never treat null as not_contacted.
      const { id: newId, warning } = await res.json().catch(() => ({ id: null, warning: null }))
      if (warning) showToast(String(warning))
      showToast('Logged', newId
        // 🔴 `.catch` IS REQUIRED NOW: deleteContact REJECTS on failure so the confirm dialog can show
        // the reason. The toast has nowhere to show one, and an unhandled rejection helps nobody —
        // the toast raised by deleteContact itself is what reports the failure on this path.
        ? () => { void deleteContact(newId).catch(() => {}) }
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
        <div className="overflow-auto rounded-xl border border-slate-200 bg-white max-h-[calc(100vh-9rem)]">
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
                <Row key={p.id} p={p} step={steps.get(p.id)} onOpen={openModal} onOpenSchedule={openSchedule} onPatch={patchProspect} onUpload={uploadMedia} isCountStale={staleCountIds.has(p.id)} refreshNonce={refreshNonce} />
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
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 max-sm:p-2">
          {/* 🔴 THE MODAL ITSELF NO LONGER SCROLLS — `overflow-hidden`, and the ONLY scrollable region
              inside it is contact history. History holds full email bodies and is unbounded; when it
              shared the modal's scroll, reading an old email pushed the form off screen. Everything else
              is sized to fit, so the fields stay put no matter how long the history is.
              ⚠️ DESKTOP ONLY, as briefed — no sm: breakpoints, no mobile stacking. max-w-6xl (1152px)
              carries two working columns on a laptop. Backdrop still has NO onClick: Close or Escape. */}
          <div className="bg-white rounded-2xl w-full max-w-6xl flex flex-col max-h-[calc(100vh-2rem)] max-sm:max-h-[calc(100dvh-1rem)] overflow-hidden">

            {/* ── (1) HEADER — ONE LINE ──────────────────────────────────────────────────────────── */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 flex-shrink-0 max-sm:flex-wrap max-sm:gap-y-1 max-sm:px-4 max-sm:py-2">
              <ModalThumb value={modalProspect.logo_url} folder="logos" label="logo"
                onRequestDelete={() => setConfirmKind('logo')}
                refreshNonce={refreshNonce} name={modalProspect.name} />
              <ModalThumb value={modalProspect.photo_url} folder="photos" label="photo"
                onRequestDelete={() => setConfirmKind('photo')}
                refreshNonce={refreshNonce} name={modalProspect.name} />
              <h3 className="text-lg font-semibold text-slate-900 truncate min-w-0 max-sm:w-full max-sm:order-first">{modalProspect.name}</h3>
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
            <div className="flex items-center gap-5 px-5 py-2 bg-slate-50 border-b border-slate-100 flex-shrink-0 text-xs max-sm:flex-wrap max-sm:gap-x-4 max-sm:gap-y-1 max-sm:px-4 max-sm:py-1.5">
              <label className="flex items-center gap-2">
                <span className="uppercase tracking-wide font-bold text-slate-400">Stage</span>
                <select value={modalProspect.stage} onChange={e => patchProspect(modalProspect.id, { stage: e.target.value })}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white max-sm:text-base max-sm:py-1.5">
                  {OUTREACH_STAGES.map(st => <option key={st} value={st}>{stageLabel(st)}</option>)}
                </select>
              </label>
              {/* 🔴 `contents`, NOT a wrapper with layout. `display: contents` makes this div generate NO
                  BOX, so its children participate in the strip's flex row exactly as they did when they
                  were written here directly — the desktop row is unchanged, not merely similar.
                  🧪 Compiled with the repo's own Tailwind: `.contents` is emitted with the base display
                  utilities and `.max-sm\:hidden` inside `@media (width < 40rem)` AFTER all of them.
                  Equal specificity, so ORDER decides and the `hidden` wins below 40rem — the whole group
                  disappears there; STAGE above stays.
                  ⚠️ THE ORDER IS THE CLAIM, NOT A LINE NUMBER. An earlier version of this comment cited
                  absolute line numbers; those move with whatever classes the project happens to use, so
                  they looked like facts about the build and were facts about a probe.
                  Its phone counterpart is the `sm:hidden` block at the top of the scrolling body. */}
              <div className="contents max-sm:hidden">
                <ProspectMetaFacts p={modalProspect} hasDoNotContact={hasDoNotContact}
                  onPatch={patchProspect} onCreateDemo={() => setCreateDemoForId(modalProspect.id)} />
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
            <div className="flex-1 min-h-0 grid gap-5 p-5 max-sm:flex max-sm:flex-col max-sm:overflow-y-auto max-sm:p-4" style={{ gridTemplateColumns: '45fr 55fr' }}>
              {/* 🔴 THE PHONE COPY — INSIDE THE SCROLLER, SO IT SCROLLS AWAY. Same component, same props,
                  same handlers as the strip copy above; exactly one of the two is ever displayed.
                  ⚠️ IT DOES NOT DISTURB THE DESKTOP GRID. At >= 40rem `sm:hidden` makes this
                  `display: none`, and an element with `display: none` generates no box and is therefore
                  NOT a grid item — so the 45fr/55fr track assignment of the two real columns is
                  untouched. Below `sm` the body is a flex COLUMN (the round-one `max-sm:flex` override),
                  so this is simply the first stacked block.
                  DOM order is the reading order: the prospect's facts, then their contact details, then
                  the log form. No `order-*` anywhere. */}
              <div className="sm:hidden flex flex-wrap items-center gap-x-4 gap-y-2 text-xs pb-1 border-b border-slate-100">
                <ProspectMetaFacts p={modalProspect} hasDoNotContact={hasDoNotContact}
                  onPatch={patchProspect} onCreateDemo={() => setCreateDemoForId(modalProspect.id)} />
              </div>
              <Detail p={modalProspect} step={steps.get(modalProspect.id)} hasContactNames={hasContactNames}
                hasLeadTypeFreeze={hasLeadTypeFreeze}
                onPatch={patchProspect} onLog={logContact} templates={templates} snippets={snippets}
                onDeleteContact={deleteContactRow} />
            </div>
          </div>
        </div>
      )}

      {/* Layered ABOVE the prospect modal (inline zIndex 95, portaled), and only while that modal is open. */}
      {modalProspect && createDemoOpen && (
        <CreateDemoModal
          prospect={{ id: modalProspect.id, discovery_truck_id: modalProspect.discovery_truck_id, name: modalProspect.name, logo_url: modalProspect.logo_url,
            // Present only when this prospect already HAS a live demo, which is what puts the modal into
            // rebuild mode. Read from the row the list route returned; never inferred from the link.
            demoTruckId: modalProspect.demo?.truckId ?? null }}
          onClose={() => setCreateDemoForId(null)}
          onCreated={ref => {
            showToast(ref ? `Demo ready: /demo/${ref}` : 'Demo ready')
            // Re-read so this prospect's row carries its new `demo` and the header swaps the Create
            // button for the link — without it the admin would have to reload to see what they built.
            load()
          }}
        />
      )}

      {/* Layered ABOVE the prospect modal, and only while that modal is open. */}
      {modalProspect && confirmKind && (
        <ConfirmDeleteDialog
          title={`Delete the ${confirmKind} for ${modalProspect.name}?`}
          confirmLabel={`Delete ${confirmKind}`}
          onCancel={() => setConfirmKind(null)}
          onConfirm={async () => {
            // 🔴 A SECOND, NAMED CONFIRMATION FOR A LIVE TRUCK. The generic delete dialog says "remove this
            // logo"; it cannot say WHOSE, and under Option A that is the only thing that matters here.
            let confirmTruck: string | undefined
            if (confirmKind === 'logo') {
              const c = confirmLogoWrite(modalProspect, 'Remove')
              if (c === false) { setConfirmKind(null); return }
              confirmTruck = c ?? undefined
            }
            await deleteMedia(modalProspect.id, confirmKind, confirmTruck); setConfirmKind(null)
          }}
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
function ProspectMetaFacts({ p, hasDoNotContact, onPatch, onCreateDemo }: {
  p: Prospect
  hasDoNotContact: boolean
  onPatch: (id: string, patch: Record<string, unknown>) => void
  onCreateDemo: () => void
}) {
  return (
    <>
      <span className="text-slate-500">
        <span className="uppercase tracking-wide font-bold text-slate-400 mr-1.5">Upcoming</span>
        <span className="font-semibold text-slate-700">{p.futureEventCount}</span>
        {p.lastEventDate && <span className="text-slate-400"> · last {fmtDate(p.lastEventDate)}</span>}
      </span>
      <span className="text-slate-500">
        <span className="uppercase tracking-wide font-bold text-slate-400 mr-1.5">Last contacted</span>
        {fmtDate(p.lastContactedAt) ?? <span className="text-slate-400">never</span>}
      </span>
      {/* DEMO — the LINK when this prospect already has one, the CREATE button when it does not.
          🔴 BOTH ARE INLINE IN THIS MODAL — NO SECOND OVERLAY, NO NEW KEY LISTENER. The link is the
          state that is read most often and adding a layer to read it would be the modal-on-modal trap
          for nothing. (The Create flow still opens CreateDemoModal, which already handles its own
          stacking and Escape — see that file's header.)
          /api/admin/provision-demo with the discovery id; name and logo are read server-side. */}
      <div className="ml-auto flex items-center gap-3 max-sm:ml-0 max-sm:w-full max-sm:flex-wrap max-sm:gap-y-2">
        {p.demo
          ? <>
              <DemoLinkChip demo={p.demo} />
              {/* 🔴 A DEMO CANNOT BE UN-CREATED, so the way to change its kitchen is to build it again
                  over the same truck. Same link, same menu, new settings and a fresh board. Quiet
                  styling: it sits beside the link an admin reads far more often than they rebuild. */}
              {p.demo.truckId && (
                <button type="button" onClick={onCreateDemo}
                  title="Build this demo again with different collection times, cook time or batch size"
                  className="text-xs font-semibold px-3 py-1 rounded-lg border border-orange-200 text-orange-700 hover:bg-orange-50 whitespace-nowrap">
                  Rebuild
                </button>
              )}
            </>
          : <button type="button" onClick={onCreateDemo}
              className="text-xs font-semibold px-3 py-1 rounded-lg bg-orange-500 text-white hover:bg-orange-600">
              Create demo
            </button>}
        <DoNotContactToggle p={p} enabled={hasDoNotContact} onPatch={onPatch} />
      </div>
    </>
  )
}

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
/**
 * 🔴 THE THUMBNAIL ERROR LATCH, IN ONE PLACE FOR BOTH THUMBS (round 3, 16 September 2026).
 *
 * ── THE DEFECT IT FIXES ─────────────────────────────────────────────────────────────────────────────
 * Both thumbs latched `broken` on `<img onError>` and reset it with `useEffect(…, [value])` — i.e. ONLY
 * when the URL string CHANGED. `load()` re-reads the list route, which for an unchanged row returns the
 * IDENTICAL string, so refreshing the data could never clear the latch. One transient image failure
 * therefore hid a logo until the page was RELOADED, which remounts the component. 🧪 Reproduced in
 * scripts/outreach-logo-latch.cjs, whose control proved the latch is the mechanism.
 *
 * ── WHAT IS DELIBERATELY KEPT ───────────────────────────────────────────────────────────────────────
 * 🔴 THE LATCH ITSELF. After a real failure the ⚠ marker still shows — never an inviting empty slot,
 * which is the behaviour the surrounding comments were written to protect. A value that fails AGAIN
 * after a refresh latches again, and shows ⚠ again.
 * 🔴 AT MOST ONE FRESH ATTEMPT PER REFRESH, so this cannot become a retry loop: `refreshNonce` only
 * changes when `load()` SUCCEEDS, and nothing here schedules a retry of its own.
 *
 * ⚠️ NO CACHE-BUSTER. The `src` is untouched — no query parameter is appended. Clearing the flag lets
 * React render the <img> again; whether the browser re-requests it is the browser's business.
 *
 * @param refreshNonce bumped by `load()` on success. Its VALUE is meaningless; only that it changes.
 */
function useThumbLatch(input: {
  value: string | null
  src: string | null
  refreshNonce: number
  kind: string
  name: string
}): { broken: boolean; onError: () => void } {
  const { value, src, refreshNonce, kind, name } = input
  const [broken, setBroken] = useState(false)
  // 🔴 `refreshNonce` IS THE SECOND DEPENDENCY AND IT IS THE ENTIRE FIX. `value` alone could not clear a
  // latch for a row whose URL had not changed — which is every row a refresh returns.
  useEffect(() => { setBroken(false) }, [value, refreshNonce])
  const onError = useCallback(() => {
    setBroken(true)
    // 🔴 ONE LINE, SO THE ORIGINAL TRANSIENT FAILURE CAN BE SEEN IN SAFARI'S CONSOLE. Until now the
    // failure left no trace at all: the symptom was reported as "the logo vanished", with nothing to say
    // whether the request 404'd, timed out or was blocked. Prefix, kind, name, the exact src, and an ISO
    // timestamp — and nothing else is logged anywhere in this path.
    console.warn(`[outreach-thumb] ${kind} failed to load for ${name} — src=${src ?? ''} at ${new Date().toISOString()}`)
  }, [kind, name, src])
  return { broken, onError }
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


// ── One prospect row (opens the detail MODAL via onOpen) ─────────────────────────────────────────────
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
function ModalThumb({ value, folder, label, onRequestDelete, refreshNonce, name }: {
  value: string | null
  folder: 'logos' | 'photos'
  label: string
  onRequestDelete: () => void
  /** Bumped by load() on success. Only that it CHANGES matters — see useThumbLatch. */
  refreshNonce: number
  /** The prospect's name, for the [outreach-thumb] warning only. */
  name: string
}) {
  const src = mediaSrc(value, folder)
  // 🔴 THE SAME SHARED LATCH THE ROW THUMB USES — one implementation, not two copies that must agree.
  const { broken, onError: onThumbError } = useThumbLatch({ value, src, refreshNonce, kind: label, name })
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
          <img src={src} alt={label} onError={onThumbError}
            className={`${box} ${folder === 'logos' ? 'object-contain p-0.5' : 'object-cover'} border border-slate-200 bg-white hover:ring-2 hover:ring-orange-400`} />
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
// ── THE DEMO LINK CHIP ────────────────────────────────────────────────────────────────────────────
// Shown in the prospect modal's header when this prospect already has a live demo. Read-only: the URL
// that was (or can be) sent, its expiry, and a Copy button matching CreateDemoModal's affordance.
//
// 🔴 NO PORTAL, NO OVERLAY, NO KEY LISTENER. It renders inside the prospect modal that is already open,
// so there is no second layer to stack and nothing new for Escape to hit — which is the only way to be
// certain Escape still closes exactly one thing (C15: two capture listeners on one node, where
// stopPropagation stops nothing).
//
// The origin is read at CLICK time, not at render: the copied link must be absolute (it is pasted into
// an email) and `window` is not available during SSR.
function DemoLinkChip({ demo }: { demo: NonNullable<Prospect['demo']> }) {
  const [copied, setCopied] = useState(false)
  if (!demo.publicRef) {
    // A live demo with no readable segment — provisioned before public_ref, or its mint failed. Say so
    // rather than rendering a broken link.
    return <span className="text-xs text-slate-400" title="This prospect has a live demo but no readable URL">demo · no link</span>
  }
  const path = `/demo/${demo.publicRef}`
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`)
      setCopied(true); setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard blocked — the path is on screen to copy by hand */ }
  }
  return (
    <span className="flex items-center gap-2 max-sm:flex-wrap max-sm:gap-y-1">
      <a href={path} target="_blank" rel="noreferrer"
        className="text-xs font-mono text-orange-700 hover:underline max-w-[18rem] truncate" title={path}>{path}</a>
      <button type="button" onClick={copy}
        className="text-xs font-semibold px-2 py-1 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50">
        {copied ? 'Copied' : 'Copy'}
      </button>
      {/* The expiry is the point of showing it: an outreach demo lives 30 days and a link sent three
          weeks ago has a week left. fmtDate is the same formatter every other date on this page uses. */}
      <span className="text-xs text-slate-400 whitespace-nowrap">
        {demo.expiresAt ? `expires ${fmtDate(demo.expiresAt)}` : 'no expiry recorded'}
        {demo.liveCount > 1 ? ` · newest of ${demo.liveCount}` : ''}
      </span>
    </span>
  )
}

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
  //
  // 🔴 AND `created_at` BREAKS THE SAME-DAY TIE. `contacted_at` holds the DATE the operator picked, so
  // every contact logged on one day carries the identical midnight timestamp. Comparing that column
  // alone leaves those rows tied; a stable sort then preserves whatever order they arrived in, which is
  // the server's newest-first — so an inbound logged BEFORE an outbound on the same day displayed
  // AFTER it. `created_at` is the insert time and is therefore the order they were submitted in.
  // ⚠️ Both keys ascend: older day first, and within a day, first-logged first.
  const rows = useMemo(
    () => [...contacts].sort((a, b) =>
      a.contacted_at < b.contacted_at ? -1 : a.contacted_at > b.contacted_at ? 1
      : a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0),
    [contacts])

  if (contacts.length === 0) {
    // 🔴 An empty history is still ONE line — no header, no empty table furniture.
    return <p className="text-xs text-slate-400 px-1 py-0.5">No contacts yet.</p>
  }

  return (
    <>
      <table className="w-full table-fixed text-xs border-collapse max-sm:w-auto">
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

function Detail({ p, step, hasContactNames, hasLeadTypeFreeze, onPatch, onLog, templates, snippets, onDeleteContact }: {
  p: Prospect
  /** The derived next step — passed in, never recomputed here, so the modal and the row agree. */
  step?: Step
  hasContactNames: boolean
  /** False until the freeze migration is applied; gates both the write and the control. */
  hasLeadTypeFreeze: boolean
  onPatch: (id: string, patch: Record<string, unknown>) => void
  /** Deletes ONE contact row. Rejects on failure so the confirm dialog can show why and stay open. */
  onDeleteContact: (pr: Prospect, c: Contact) => Promise<void>
  onLog: (p: Prospect, f: { channel: string; direction: string; kind: string; message: string; contacted_at: string }) => Promise<boolean>
  /** Loaded templates, or null when the table is unreachable. */
  templates: MessageTemplate[] | null
  /** The snippet library, passed through to the compose window. Display/pre-fill only. */
  snippets: Snippet[]
}) {
  const [firstName, setFirstName] = useState(p.contact_first_name ?? '')
  const [lastName, setLastName] = useState(p.contact_last_name ?? '')
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
    setFirstName(p.contact_first_name ?? ''); setLastName(p.contact_last_name ?? '')
    setEmail(p.contact_email ?? ''); setPhone(p.phone ?? '')
    setNotes(p.notes ?? ''); setNextAt(p.next_action_at ?? ''); setNextTouched(false)
    setChannel('email'); setDirection('outbound'); setKind(defaultKindFor('outbound'))
    setMessage(''); setContactedAt(today)
    // 🔴 AN UNLOGGED PRE-FILL MUST NOT FOLLOW ME TO THE NEXT TRUCK. Same reset as every other
    // field: prev/next changes `p` without remounting, so this effect is the only thing
    // clearing a rendered-but-never-logged template.
    setComposeOpen(false)
  }, [p.id])   // eslint-disable-line react-hooks/exhaustive-deps

  const fieldCls = 'w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm max-sm:text-base max-sm:py-2'
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
    const patch: Record<string, unknown> = { next_action_at: due }

    // ── 🔴 FREEZE THE LEAD TYPE ON THE RUNG-1 LOG, AND ONLY THERE ──────────────────────────────────
    // WHERE: this function is the ONE place both logging paths converge — the modal's own Log button
    // (`submitLog`) and the compose window's log control both call it, and both only on a write that
    // SUCCEEDED. Putting the freeze anywhere else would repeat the bug this function was created to fix,
    // where the compose path logged a contact and set no follow-up date at all.
    //
    // 🔴 THREE CONDITIONS, ALL NECESSARY:
    //   • `k === CONTACT_KINDS[0]` — the rung-1 log, not any log. A chase must not re-stamp the framing
    //     the approach was written in; that is the whole point of freezing.
    //   • `!isLeadType(p.lead_type_at_first_contact)` — WRITE ONCE. Re-logging a first contact later, or
    //     logging it on a second channel, must not overwrite a value already set (by an earlier log or
    //     by hand in the control below).
    //   • `hasLeadTypeFreeze` — the column exists. Until the migration is applied this is false and the
    //     write is skipped entirely, so the console behaves exactly as it did before.
    //
    // ⚠️ `leadTypeOf`, NOT `effectiveLeadType`. Every READER uses the effective value; this is the one
    // WRITER, and it must capture what the prospect is RIGHT NOW. (With the column null they return the
    // same thing — but the intent differs, and the next person reading this should see which is which.)
    if (shouldFreezeLeadType(k, p, hasLeadTypeFreeze)) {
      patch.lead_type_at_first_contact = leadTypeOf(p)
    }
    onPatch(p.id, patch)
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
  const submitLog = async () => {
    if (logging) return
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
      <div className="flex flex-col gap-3 min-h-0 pr-1 max-sm:shrink-0 max-sm:pr-0">
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

        {/* (4) 🔴 THREE CELLS IN A TWO-COLUMN GRID — FIRST | LAST, THEN PHONE UNDER THEM.
            The name split needs two boxes where there was one, and the obvious move — widening this row
            to `grid-cols-3` — REPRODUCES THE ROUND-TWO DEFECT ON THE DESKTOP. Arithmetic, not a guess:
            the panel is max-w-6xl (1152), the body has p-5 and gap-5, so the 45fr column is
            (1152 - 40 - 20) x 0.45 = 491px, less `pr-1` = 487px. At `grid-cols-3` each track is
            (487 - 16)/3 = 157px, and the PHONE cell holds an input plus the "WA" tick: an <input> has an
            intrinsic min-content width of roughly 177px, a grid item's min-width computes to `auto`, so
            that cell would refuse to shrink and would overlap its neighbour — which is exactly the
            CONTACTED ON / CHANNEL overlap that round two diagnosed and fixed.
            Keeping TWO columns and letting the third cell wrap to its own row leaves every track at
            (487 - 8)/2 = 239px — the width the phone field has TODAY, unchanged.
            ⚠️ BELOW `sm` the body is a flex COLUMN, so this column is the full panel width: at 390px
            that is 390 - 16 (overlay p-2) - 32 (panel max-sm:p-4) = 342, i.e. tracks of (342 - 8)/2 =
            167px — BELOW the ~177px intrinsic width above, so each cell needs `max-sm:min-w-0` or it
            overflows its track by ~10px. That is round two's remedy applied to a row round two did not
            touch, and the phone cell needed it already. */}
        <div className="grid grid-cols-2 gap-2 flex-shrink-0">
          <label className="block max-sm:min-w-0">
            <span className={labelCls}>First name</span>
            <input className={fieldCls} value={firstName} disabled={!hasContactNames}
              placeholder={hasContactNames ? 'First name' : 'needs the name-split migration'}
              onChange={e => setFirstName(e.target.value)}
              onBlur={() => hasContactNames && firstName !== (p.contact_first_name ?? '') && onPatch(p.id, { contact_first_name: firstName })} />
          </label>
          <label className="block max-sm:min-w-0">
            <span className={labelCls}>Last name</span>
            <input className={fieldCls} value={lastName} disabled={!hasContactNames}
              placeholder={hasContactNames ? 'Last name' : 'needs the name-split migration'}
              onChange={e => setLastName(e.target.value)}
              onBlur={() => hasContactNames && lastName !== (p.contact_last_name ?? '') && onPatch(p.id, { contact_last_name: lastName })} />
          </label>
          <label className="block max-sm:min-w-0">
            <span className={labelCls}>Phone</span>
            <div className="flex items-center gap-2 max-sm:flex-wrap max-sm:gap-y-1">
              <input className={fieldCls} value={phone} onChange={e => setPhone(e.target.value)}
                onBlur={() => phone !== (p.phone ?? '') && onPatch(p.id, { phone })} />
              <span className="flex items-center gap-1 text-xs text-slate-500 whitespace-nowrap"><WhatsAppBox p={p} onPatch={onPatch} /> WA</span>
            </div>
          </label>
          {/* ── 🔴 (5) THE FROZEN LEAD TYPE — VISIBLE, AND CORRECTABLE ──────────────────────────────
              A wrong freeze is otherwise INVISIBLE AND PERMANENT: it would quietly pick the wrong
              `?lead_*` line in every remaining message of the sequence, and nothing on any screen would
              say why. So it is shown, and it can be changed.
              🔴 A FOURTH CELL IN THE SAME TWO-COLUMN GRID, NOT A THIRD COLUMN. The arithmetic is the one
              round two established and the name split re-used: the panel is max-w-6xl (1152), the body
              has p-5 and gap-5, so the 45fr column is (1152 - 40 - 20) x 0.45 = 491px, less `pr-1` =
              487px, and each track is (487 - 8)/2 = 239px — the width Phone already has. Going to
              `grid-cols-3` would give (487 - 16)/3 = 157px, under the ~177px intrinsic width of an
              <input>, and a grid item's min-width computes to `auto` — the CONTACTED ON / CHANNEL
              overlap all over again. A fourth cell simply wraps to row two beside Phone.
              ⚠️ BELOW `sm` the body is a flex COLUMN, so this column is the full panel width: at 390px
              that is 390 - 16 (overlay p-2) - 32 (panel max-sm:p-4) = 342, i.e. tracks of
              (342 - 8)/2 = 167px. A <select>'s min-content width is its longest option — "Hatches Up —
              map only" is wider than 167px — so `max-sm:min-w-0` is REQUIRED here exactly as it is on
              the three cells beside it, or this cell overflows its track.
              🔴 `fieldCls` carries `max-sm:text-base` (16px), which is what stops iOS zooming on focus.
              Rounds 1-3 are untouched: no cell was removed, no class was dropped, and the grid is still
              `grid-cols-2`. */}
          <label className="block max-sm:min-w-0">
            <span className={labelCls}>Lead type {step?.leadTypeFrozen ? '(frozen)' : '(live)'}</span>
            <select className={fieldCls} disabled={!hasLeadTypeFreeze}
              value={isLeadType(p.lead_type_at_first_contact) ? p.lead_type_at_first_contact : ''}
              title={hasLeadTypeFreeze
                ? (step?.leadTypeFrozen
                  ? 'Frozen when the first contact was logged. Every remaining rung reads this value.'
                  : 'Not frozen yet — derived live from HU flags, visibility and upcoming events. It freezes when a first contact is logged.')
                : 'Needs the 20260914_outreach_lead_type_freeze migration'}
              onChange={e => onPatch(p.id, { lead_type_at_first_contact: e.target.value })}>
              {/* 🔴 THE EMPTY OPTION IS "DERIVE LIVE", NOT "UNKNOWN", and choosing it CLEARS the column
                  back to null — which is how a wrong freeze is undone rather than merely re-pointed. */}
              {/* 🔴 SHOWS THE LIVE DERIVATION, NOT `step.leadType`. On a frozen row those differ —
                  `step.leadType` IS the frozen value — and labelling this option with it would promise
                  that clearing the freeze changes nothing, which is exactly backwards. */}
              <option value="">— derive live ({LEAD_TYPE_LABELS[leadTypeOf(p)]}) —</option>
              {LEAD_TYPES.map(lt => <option key={lt} value={lt}>{LEAD_TYPE_LABELS[lt]}</option>)}
            </select>
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
          <div className="min-h-0 shrink overflow-y-auto border border-slate-300 rounded-lg bg-white max-sm:overflow-x-auto">
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
      <div className="flex flex-col gap-2 min-h-0 max-sm:shrink-0">
        {/* 🔴 THE COMPOSE WINDOW — portalled to <body>, layered above this modal. It writes NOTHING until
          its own log control is pressed, and its `onLog` is the SAME `log_contact` writer this modal's
          Log button uses; there is no second write path. */}
      {/* 🔴 PRE-SELECTION COMES FROM THE DERIVED STEP, NOT FROM `suggestedId`. `templateForStep`
          resolves against the LOADED list, so a retired or renamed slug yields null and the picker
          opens empty — the historical behaviour — rather than selecting the wrong row.
          ⚠️ It is null whenever the step is 'unknown', because `nextStep` produces no rung there: a
          history nobody can read must never pre-load a chase.
          🔴 `doNotContact` is what finally makes that flag block something. See ComposeWindow. */}
      {composeOpen && (
        <ComposeWindow
          truckName={p.name}
          toEmail={p.contact_email}
          offerable={offerable}
          suggestedId={suggestedId}
          initialTemplateId={step ? templateForStep(step, offerable).slug : null}
          doNotContact={p.do_not_contact === true}
          ctx={tplCtx}
          whatsappConfirmed={p.whatsapp_confirmed === true}
          templatesLoaded={templates !== null}
          logFormKind={kind}
          snippets={snippets}
          onClose={() => setComposeOpen(false)}
          onLog={async (editedBody, ch, servesKind) => {
            // 🔴 `editedBody` IS THE TEXTAREA'S CURRENT VALUE, passed straight through to the writer.
            // It is never re-rendered from the template here — if the two diverge, what was edited is
            // what gets stored. `contacted_at` still comes from the log form.
            //
            // 🔴 BUT `kind` NO LONGER DOES, WHEN THE TEMPLATE HAS AN OPINION. This block used to read
            // "respects what is already selected there rather than inventing its own", and that is
            // exactly how a chaser sent to Pizza Mondo was logged as a FIRST CONTACT: the dropdown had
            // not been touched, so the history recorded an approach that never happened — and the
            // derived step, the follow-up interval and the whole queue read that history.
            // A TAGGED template states its own rung and wins. An UNTAGGED one passes null and the
            // dropdown governs, byte for byte as before — which is every template today.
            const effectiveKind = servesKind ?? kind
            const ok = await onLog(p, {
              channel: ch, direction: 'outbound', kind: effectiveKind,
              message: editedBody, contacted_at: contactedAt,
            })
            // 🔴 THE BUG THIS FIXES: this path logged a contact and set NO follow-up date, because the
            // populate lived inside `submitLog` and the compose window does not call it. Logging from
            // the compose window is the path actually used to send, so the feature never fired there.
            // 🔴 AND IT RESPECTS A REFUSAL. `false` leaves the window un-logged, so the compose window
            // does not mark a send that was never recorded; the reason arrives as the writer's toast.
            // 🔴 THE SAME effective kind, or the follow-up date would be counted from a rung that
            // was never logged — 3 days for a "first contact" that was actually a final chase.
            if (ok) persistFollowUpAfterLog(effectiveKind)
            return ok
          }}
        />
      )}


        <p className={`${sectionCls} flex-shrink-0`}>Log a contact</p>
        {/* (6) FOUR CONTROLS ON ONE ROW — they fit at this width (the modal is max-w-6xl, so a column is
            ~540px and each control gets ~130px). Date first: it is the one most often changed. */}
        <div className="grid grid-cols-4 gap-2 flex-shrink-0 max-sm:grid-cols-2">
          {/* 🔴 CAPPED AT TODAY. A contact cannot have happened in the future, and a mistyped future date
              would sort to the top of history and take `last contacted` with it. Past dates are free. */}
          {/* 🔴 LABELLED, AND THIS IS THE ACTUAL FIX FOR THE "next action shows today" REPORT. This input
              defaults to today BY DESIGN (a contact almost always happened today) and was the only
              UNLABELLED control in the modal — two bare date boxes, one showing today. `nextAt` never
              held today; this did. Both now say which is which. */}
          <label className="block max-sm:min-w-0">
            <span className={labelCls}>Contacted on</span>
            <input type="date" className={fieldCls} value={contactedAt} max={today}
              onChange={e => setContactedAt(e.target.value)} title="When this contact happened (cannot be in the future)" />
          </label>
          <label className="block max-sm:min-w-0"><span className={labelCls}>Channel</span>
            <select className={fieldCls} value={channel} onChange={e => setChannel(e.target.value)}>
              {CONTACT_CHANNELS.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
            </select>
          </label>
          <label className="block max-sm:min-w-0"><span className={labelCls}>Direction</span>
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
          <label className="block max-sm:min-w-0"><span className={labelCls}>Kind</span>
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
            <input type="date" className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm max-sm:text-base max-sm:py-2" value={nextAt}
              onChange={e => { setNextAt(e.target.value); setNextTouched(true) }}
              onBlur={() => nextAt !== (p.next_action_at ?? '') && onPatch(p.id, { next_action_at: nextAt || null })} />
            <button onClick={() => setNext(1)} className={quickCls}>Tomorrow</button>
            <button onClick={() => setNext(3)} className={quickCls}>+3 days</button>
            <button onClick={() => setNext(7)} className={quickCls}>+1 week</button>
            <button onClick={() => { setNextAt(''); setNextTouched(true); onPatch(p.id, { next_action_at: null }) }}
              className={quickCls}>Clear</button>
          </div>
        </div>

        <button onClick={submitLog} disabled={logging}
          className="w-full bg-orange-600 hover:bg-orange-700 text-white text-sm font-bold py-1.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0">
          {logging ? 'Logging…' : 'Log contact'}
        </button>


      </div>
    </>
  )
}
