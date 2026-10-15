// lib/admin/truck-details-write.ts
//
// The WRITES for the truck-details path: filling a matched truck, and creating a hidden truck with its
// prospect. Sequencing and rollback live here; the pure rules live in `./truck-details.ts`.
//
// ── 🔴 WHY AN ADAPTER AND NOT A SUPABASE CLIENT ──────────────────────────────────────────────────────
// Every function here takes a small `TruckWriteDb`. Two reasons, and neither is style:
//   1. The two-table create must be PROVED to leave nothing behind when the second insert fails. That is
//      a sequencing property, and the only way to test it is to make the second insert fail on demand —
//      which a real client cannot be asked to do, and which `run-harnesses.cjs` forbids reaching for
//      (its source screen bans `createClient` and the service-role key outright).
//   2. This module then contains no credential, no table name the harness has to mock, and no network.
// The route builds the adapter in one place, from the client it already holds.

import {
  type TruckDetails, type FillPlan, type MatchRow, type Conflict,
  hiddenTruckInsert, newTruckNotes, matchProspect, planFill, planIsEmpty, updatedSummary, newTruckSummary,
  conflictsToConfirm, planReplace, replacedSummary,
} from './truck-details'
import type { PhoneCountry } from '@/lib/phone'

export type DbResult = { error: string | null }
export type DbInsert = { id: string | null; error: string | null }

export type TruckWriteDb = {
  insertTruck(row: Record<string, unknown>): Promise<DbInsert>
  /** Only ever called to undo an insert this module just made. */
  deleteTruck(id: string): Promise<DbResult>
  insertProspect(row: Record<string, unknown>): Promise<DbInsert>
  updateTruck(id: string, patch: Record<string, unknown>): Promise<DbResult>
  getProspectNotes(id: string): Promise<{ notes: string | null; error: string | null }>
  setProspectNotes(id: string, notes: string): Promise<DbResult>
  /** The timeline note — `addNote` in lib/outreach-events.ts, the one writer of `outreach_events`. */
  recordHistory(prospectId: string, body: string): Promise<DbResult>
}

/* ─────────────────────────── THE NOTES COLUMN ─────────────────────────── */

/**
 * Append lines to `outreach_prospects.notes`, skipping any already there.
 *
 * 🔴 "ONCE" IS ENFORCED BY READING, NOT BY HOPING. The brief says the area note is written once; dropping
 * the same screenshot twice must not produce two identical lines. The comparison is on the trimmed line,
 * so indentation differences do not defeat it.
 * 🔴 EXISTING NOTES ARE NEVER REWRITTEN. Dominic's own words are in this column; this only ever appends.
 * ⚠️ Returns null when there is nothing to add, so the caller can skip the write entirely rather than
 * re-writing the column with its own contents.
 */
export function appendNotes(existing: string | null | undefined, lines: string[]): string | null {
  const current = String(existing ?? '')
  const have = new Set(current.split('\n').map(l => l.trim()).filter(Boolean))
  const add = lines.map(l => l.trim()).filter(l => l && !have.has(l))
  if (add.length === 0) return null
  return current.trim() ? `${current.trim()}\n${add.join('\n')}` : add.join('\n')
}

/* ─────────────────────────── FILLING A MATCHED TRUCK ─────────────────────────── */

export type ApplyResult = {
  ok: boolean
  /** Columns actually written on `discovery_trucks`. */
  filled: string[]
  /** Non-fatal problems worth showing, e.g. the history line not landing. */
  warnings: string[]
  error: string | null
}

/**
 * Fill the empty columns of an already-matched truck, note the area on its prospect, and record what
 * happened in the timeline.
 *
 * 🔴 THE TRUCK WRITE IS THE ONLY FAILURE THAT FAILS THE CALL. The notes column and the timeline line are
 * records ABOUT the write; losing one is worth strictly less than the write itself, which is the rule
 * `recordStageChange` states in lib/outreach-events.ts:39. They come back as warnings.
 * ⚠️ AN EMPTY PLAN IS NOT AN ERROR AND WRITES NOTHING — that is the "Nothing new" outcome, and sending
 * an empty patch to PostgREST would be a pointless round trip that touches `updated_at`.
 */
export async function applyFill(
  db: TruckWriteDb, row: MatchRow, plan: FillPlan, historyLine: string,
): Promise<ApplyResult> {
  const filled = Object.keys(plan.fills)
  const warnings: string[] = []

  if (filled.length > 0) {
    const { error } = await db.updateTruck(row.truck_id, plan.fills)
    if (error) return { ok: false, filled: [], warnings, error }
  }

  if (plan.areaNote) {
    const { notes, error } = await db.getProspectNotes(row.prospect_id)
    if (error) warnings.push(`the area note could not be added: ${error}`)
    else {
      const next = appendNotes(notes, [plan.areaNote])
      if (next !== null) {
        const { error: sErr } = await db.setProspectNotes(row.prospect_id, next)
        if (sErr) warnings.push(`the area note could not be added: ${sErr}`)
      }
    }
  }

  if (filled.length > 0 || plan.areaNote) {
    const { error } = await db.recordHistory(row.prospect_id, historyLine)
    if (error) warnings.push(`the history line could not be written: ${error}`)
  }

  return { ok: true, filled, warnings, error: null }
}

/* ─────────────────────────── CREATING A HIDDEN TRUCK ─────────────────────────── */

export type CreateResult = {
  ok: boolean
  truckId: string | null
  prospectId: string | null
  warnings: string[]
  error: string | null
}

/**
 * Create the `discovery_trucks` row and its `outreach_prospects` row.
 *
 * 🔴 ONE FUNCTION, BOTH INSERTS, AND IF EITHER FAILS NOTHING IS LEFT BEHIND — the brief's requirement.
 * `outreach_prospects.discovery_truck_id` is `not null unique`, so the truck must exist first and the
 * order cannot be swapped. If the prospect insert then fails, the truck row is an orphan that would
 * appear in no outreach list and be invisible to every surface except the scraper's name lookups, so it
 * is deleted.
 * ⚠️ IF THE ROLLBACK ITSELF FAILS the error names the truck id, because at that point only a human can
 * finish the job and they need to know which row to remove.
 * ⚠️ NO TRANSACTION IS AVAILABLE. PostgREST gives one statement per request; a real transaction would
 * need an RPC, which is a migration and a second place for this logic to live. Delete-on-failure is the
 * honest alternative and its one weakness is stated above rather than hidden.
 *
 * 🔴 `stage` IS THE DEFAULT AND LEAD TYPE IS NOT SET AT ALL. The brief: stage = not_contacted (which is
 * the column's own default — written explicitly so the row does not depend on it), and the lead type is
 * left to the existing derivation. Nothing here writes `lead_type_at_first_contact`, `do_not_contact` or
 * `platform`.
 */
export async function createHiddenTruckWithProspect(
  db: TruckWriteDb, details: TruckDetails, historyLine: string,
  /** Phase 2D-2: the screenshot's chosen country — stamped on the new truck (its prospect reads it there). */
  country?: string,
): Promise<CreateResult> {
  const warnings: string[] = []

  const truck = await db.insertTruck(hiddenTruckInsert(details, country))
  if (truck.error || !truck.id) {
    return { ok: false, truckId: null, prospectId: null, warnings, error: truck.error ?? 'the truck row was not created' }
  }

  const prospect = await db.insertProspect({ discovery_truck_id: truck.id, stage: 'not_contacted' })
  if (prospect.error || !prospect.id) {
    const undo = await db.deleteTruck(truck.id)
    const base = prospect.error ?? 'the prospect row was not created'
    if (undo.error) {
      return {
        ok: false, truckId: truck.id, prospectId: null, warnings,
        error: `${base} — and the new truck row could not be removed either (${undo.error}). `
          + `Delete discovery_trucks id ${truck.id} by hand.`,
      }
    }
    return { ok: false, truckId: null, prospectId: null, warnings, error: `${base} — nothing was left behind.` }
  }

  const notes = newTruckNotes(details)
  if (notes.length > 0) {
    const next = appendNotes(null, notes)
    if (next !== null) {
      const { error } = await db.setProspectNotes(prospect.id, next)
      if (error) warnings.push(`the screenshot notes could not be saved: ${error}`)
    }
  }

  const { error: hErr } = await db.recordHistory(prospect.id, historyLine)
  if (hErr) warnings.push(`the history line could not be written: ${hErr}`)

  return { ok: true, truckId: truck.id, prospectId: prospect.id, warnings, error: null }
}

/* ─────────────────────────── FILING ONE SCREENSHOT'S DETAILS ─────────────────────────── */

/** What one truck-details screenshot came to. The route turns it into its row and its log line. */
export type Filed = {
  ok: boolean
  outcome: 'updated' | 'nothing_new' | 'needs_a_look' | 'new_truck'
  summary: string | null
  prospectId: string | null
  truckId: string | null
  /** 'needs_a_look' only: what the admin chooses between. */
  candidates: MatchRow[] | null
  /** 'phone_only' when the number matched and the name did not — the row asks the phone question. */
  ask: 'phone_only' | null
  /** Saved emails and social links that differ from the screenshot — kept, and asked about (old → new). */
  conflicts: Conflict[]
  warnings: string[]
  error: string | null
}

const filed = (f: Partial<Filed> & Pick<Filed, 'outcome'>): Filed => ({
  ok: true, summary: null, prospectId: null, truckId: null, candidates: null, ask: null,
  conflicts: [], warnings: [], error: null, ...f,
})

const savedOf = (r: MatchRow) => ({
  contact_email: r.contact_email, mobile: r.mobile, phone: r.phone,
  website: r.website, facebook_url: r.facebook_url, instagram_url: r.instagram_url,
})

/**
 * Match the details to a prospect and act on the answer — the route's whole truck-details step, here so the
 * harness can drive it against a fake adapter and count the writes.
 *   definite      → fill the EMPTY fields (applyFill); differing emails/social links come back as conflicts
 *   needs a look  → 🔴 WRITES NOTHING. Two prospects, a near name, or a phone-only match: the admin decides.
 *   none          → a hidden new truck and its prospect
 * ⚠️ The error strings keep the route's own wording ("could not be updated" / "could not be created"):
 * `classifyFailure` reads them to tell a database outage from one bad file.
 */
export async function fileTruckDetails(
  db: TruckWriteDb, details: TruckDetails, rows: MatchRow[], country: PhoneCountry,
): Promise<Filed> {
  const match = matchProspect(details, rows, country)

  if (match.kind === 'definite') {
    const plan = planFill(details, savedOf(match.row))
    const ids = { prospectId: match.row.prospect_id, truckId: match.row.truck_id }
    if (planIsEmpty(plan) && plan.kept.length === 0) {
      return filed({ outcome: 'nothing_new', summary: `Already had everything this screenshot shows · ${match.why}`, ...ids })
    }
    const summary = updatedSummary(plan, match.on)
    const applied = await applyFill(db, match.row, plan, `Filled from a screenshot — ${summary}`)
    if (!applied.ok) return filed({ ok: false, outcome: 'updated', error: `The prospect could not be updated: ${applied.error}` })
    return filed({
      outcome: Object.keys(plan.fills).length > 0 || plan.areaNote ? 'updated' : 'nothing_new',
      summary, ...ids, warnings: applied.warnings, conflicts: conflictsToConfirm(plan),
    })
  }

  if (match.kind === 'needs_a_look') {
    return filed({ outcome: 'needs_a_look', summary: match.why, candidates: match.candidates, ask: match.ask ?? null })
  }

  return addAsNewTruck(db, details, country)
}

/** "Add as new" / "Different truck — add as new": a hidden truck and its prospect. */
export async function addAsNewTruck(db: TruckWriteDb, details: TruckDetails, country: PhoneCountry): Promise<Filed> {
  const summary = newTruckSummary(details)
  const created = await createHiddenTruckWithProspect(db, details, `Added from a screenshot — ${summary}`, country)
  if (!created.ok) return filed({ ok: false, outcome: 'new_truck', error: `The new truck could not be created: ${created.error}` })
  return filed({ outcome: 'new_truck', summary, prospectId: created.prospectId, truckId: created.truckId, warnings: created.warnings })
}

/**
 * "Same truck — update <prospect>": the admin asserted the identity, so the details are applied to that row
 * — still EMPTY fields only, and differing emails/social links still come back as conflicts to confirm.
 */
export async function fillConfirmedTruck(db: TruckWriteDb, row: MatchRow, details: TruckDetails): Promise<Filed> {
  const plan = planFill(details, savedOf(row))
  const ids = { prospectId: row.prospect_id, truckId: row.truck_id }
  if (planIsEmpty(plan) && plan.kept.length === 0) {
    return filed({ outcome: 'nothing_new', summary: 'Already had everything this screenshot shows · confirmed by hand', ...ids })
  }
  // ⚠️ 'name' as the key: the admin asserted the identity, so the summary says so rather than naming a
  // field that did not actually match.
  const summary = `${updatedSummary(plan, 'name').replace(/ · matched on name$/, '')} · confirmed by hand`
  const applied = await applyFill(db, row, plan, `Filled from a screenshot — ${summary}`)
  if (!applied.ok) return filed({ ok: false, outcome: 'updated', error: applied.error })
  return filed({ outcome: 'updated', summary, ...ids, warnings: applied.warnings, conflicts: conflictsToConfirm(plan) })
}

/**
 * "Replace" on an old → new line. 🔴 THE ONLY PATH THAT CHANGES A SAVED EMAIL OR SOCIAL LINK, and only for
 * what `planReplace` re-derives as still in conflict with the value the admin was shown.
 */
export async function replaceConfirmed(
  db: TruckWriteDb, row: MatchRow, asked: { field: string; saved: string }[], details: TruckDetails,
): Promise<Filed & { refused: string[] }> {
  const { patch, changes, refused } = planReplace(asked, savedOf(row), details)
  const ids = { prospectId: row.prospect_id, truckId: row.truck_id }
  if (changes.length === 0) return { ...filed({ outcome: 'nothing_new', summary: refused.join(' · ') || 'Nothing to replace', ...ids }), refused }
  const { error } = await db.updateTruck(row.truck_id, patch)
  if (error) return { ...filed({ ok: false, outcome: 'updated', error }), refused }
  const summary = `${replacedSummary(changes)} · confirmed by hand`
  const warnings: string[] = []
  const h = await db.recordHistory(row.prospect_id, `Filled from a screenshot — ${summary}`)
  if (h.error) warnings.push(`the history line could not be written: ${h.error}`)
  return { ...filed({ outcome: 'updated', summary, ...ids, warnings }), refused }
}
