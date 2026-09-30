// lib/outreach-events.ts — the one writer of `outreach_events`: stage changes and notes.
//
// 🔴 WHY A SECOND STREAM AND NOT MORE CONTACT ROWS. `outreach_contacts` is the LADDER, and §57 derives
// the next step from it: every row in it is a touch that moves or stops a sequence. A stage change is
// not a touch and a note is not a contact — writing either there would change what the work queue
// computes, which is the failure the manual records twice (a reply logged as `first_contact`, a rung
// logged under a retired name). This table is inert: the timeline reads it and nothing else does.
//
// 🔴 AND IT IS ONE WRITER, for the reason `logOutreachContact` is one writer. A stage move recorded at
// three call sites is three chances to record it differently, or not at all.
import type { SupabaseClient } from '@supabase/supabase-js'

export const EVENT_KINDS = ['stage_change', 'note'] as const
export type EventKind = (typeof EVENT_KINDS)[number]

/** What caused a stage change. Free text, but these are the phrases the code uses. */
export const STAGE_CAUSE = {
  firstEmail: 'First email sent',
  outboundContact: 'Contact logged',
  replyReceived: 'Reply received',
  byHand: 'Set by hand',
} as const

export interface StageChange {
  prospect_id: string
  from_stage: string | null
  to_stage: string
  /** WHY. "Reply received", "First email sent", "Set by hand" — never left empty. */
  body: string
}

/**
 * Record a stage change.
 *
 * ⚠️ CALL IT ONLY WHEN A ROW ACTUALLY CHANGED. Every stage write in this codebase is conditional —
 * `.eq('stage', DEFAULT_STAGE)`, `.in('stage', REPLY_MOVES_FROM)`, or a hand-set value that may equal
 * what is already there — so "we ran an UPDATE" is not "the stage moved". An event written on a
 * no-op update would put a line in the timeline saying something happened that did not.
 * ⚠️ IT NEVER FAILS THE CALLER. A missing history line is worth strictly less than the write it
 * follows; the result says whether it landed and the caller reports it as a warning at most.
 */
export async function recordStageChange(
  supabase: SupabaseClient, change: StageChange,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await supabase.from('outreach_events').insert({
    prospect_id: change.prospect_id,
    kind: 'stage_change',
    from_stage: change.from_stage,
    to_stage: change.to_stage,
    body: change.body,
  })
  return { ok: !error, error: error ? error.message : null }
}

/**
 * Record a note.
 * ⚠️ AN EMPTY NOTE IS REFUSED RATHER THAN STORED. A blank line in the timeline is noise that can only
 * be removed by hand.
 */
export async function addNote(
  supabase: SupabaseClient, prospectId: string, body: string,
): Promise<{ ok: boolean; id: string | null; error: string | null }> {
  const text = String(body ?? '').trim()
  if (!text) return { ok: false, id: null, error: 'A note needs some words in it.' }
  const { data, error } = await supabase.from('outreach_events')
    .insert({ prospect_id: prospectId, kind: 'note', body: text })
    .select('id').single()
  if (error) return { ok: false, id: null, error: error.message }
  return { ok: true, id: (data as { id?: string } | null)?.id ?? null, error: null }
}

/**
 * A send that went out with a guard waved through.
 *
 * 🔴 IT IS A `note`, NOT A NEW EVENT KIND, AND THAT IS A DELIBERATE CHOICE NOT TO MIGRATE. The
 * table's `kind` carries `check (kind in ('stage_change','note'))`; a third value would be a
 * migration for a row whose whole job is to be READ BY A HUMAN in the history. It is written with a
 * fixed prefix so it is greppable and so the timeline's filter treats it as what it is — something
 * Dominic did on purpose, recorded in words.
 * ⚠️ IT NEVER FAILS THE SEND. Like every other writer here, a missing history line is worth strictly
 * less than the thing it follows.
 */
export const OVERRIDE_PREFIX = 'Sent anyway:'

export async function recordSendOverride(
  supabase: SupabaseClient,
  prospectId: string,
  guards: readonly { id: string; message: string }[],
): Promise<{ ok: boolean; error: string | null }> {
  if (guards.length === 0) return { ok: true, error: null }
  const body = `${OVERRIDE_PREFIX} ${guards.map(g => `[${g.id}] ${g.message}`).join(' ')}`
  const { error } = await supabase.from('outreach_events')
    .insert({ prospect_id: prospectId, kind: 'note', body })
  return { ok: !error, error: error ? error.message : null }
}

/**
 * Edit a note.
 *
 * 🔴 ONLY A NOTE, AND THE `kind` IS CHECKED IN THE STATEMENT, NOT BEFORE IT. `.eq('kind', 'note')`
 * means a stage change cannot be edited even by an id that names one — there is no window between
 * reading the row and writing it in which the answer could change, and no second code path that
 * forgets the rule. A stage change is a record of something that happened; editing it would make
 * the timeline a story rather than a history.
 * ⚠️ AN EMPTY NOTE IS REFUSED, exactly as `addNote` refuses one: the way to remove a note is to
 * delete it, which asks first.
 * ⚠️ `updated_at` IS WRITTEN ONLY WHERE THE COLUMN EXISTS. Its migration is applied by hand; until
 * it is, the edit still lands and simply carries no "edited" mark. The caller passes the flag.
 */
export async function editNote(
  supabase: SupabaseClient, id: string, body: string, hasUpdatedAt: boolean,
): Promise<{ ok: boolean; updated: number; error: string | null }> {
  const text = String(body ?? '').trim()
  if (!text) return { ok: false, updated: 0, error: 'A note needs some words in it.' }
  const patch: Record<string, unknown> = { body: text }
  if (hasUpdatedAt) patch.updated_at = new Date().toISOString()
  // 🔴 `.select('id')` SO "IT CHANGED NOTHING" IS OBSERVABLE. PostgREST reports no error when a
  // filter matches zero rows — the same trap `delete_contact` records at length.
  const { data, error } = await supabase.from('outreach_events')
    .update(patch).eq('id', id).eq('kind', 'note').select('id')
  if (error) return { ok: false, updated: 0, error: error.message }
  return { ok: (data?.length ?? 0) > 0, updated: data?.length ?? 0, error: null }
}

/**
 * Delete a note, and hand back what was removed so an Undo can put it back exactly.
 * 🔴 `.eq('kind', 'note')` AGAIN, IN THE STATEMENT. A stage change cannot be deleted by any id.
 */
export async function deleteNote(
  supabase: SupabaseClient, id: string,
): Promise<{ ok: boolean; deleted: number; row: { body: string | null; created_at: string } | null; error: string | null }> {
  const { data, error } = await supabase.from('outreach_events')
    .delete().eq('id', id).eq('kind', 'note').select('body, created_at')
  if (error) return { ok: false, deleted: 0, row: null, error: error.message }
  const rows = (data ?? []) as { body: string | null; created_at: string }[]
  return { ok: rows.length > 0, deleted: rows.length, row: rows[0] ?? null, error: null }
}

/**
 * Put a deleted note back, with the day it was written.
 *
 * 🔴 THE ORIGINAL `created_at` IS RESTORED, AND THAT IS THE WHOLE POINT OF UNDO. A note re-added
 * with today's date would move in the history and stop explaining the day it was about — it would
 * be a new note that happens to have the same words. ⚠️ THE ID IS NEW, and that is the one thing
 * Undo cannot restore; nothing references a note's id, so nothing can notice.
 */
export async function restoreNote(
  supabase: SupabaseClient, prospectId: string, body: string, createdAt: string | null,
): Promise<{ ok: boolean; id: string | null; error: string | null }> {
  const text = String(body ?? '').trim()
  if (!text) return { ok: false, id: null, error: 'There was nothing to put back.' }
  const row: Record<string, unknown> = { prospect_id: prospectId, kind: 'note', body: text }
  if (createdAt && !Number.isNaN(new Date(createdAt).getTime())) row.created_at = createdAt
  const { data, error } = await supabase.from('outreach_events').insert(row).select('id').single()
  if (error) return { ok: false, id: null, error: error.message }
  return { ok: true, id: (data as { id?: string } | null)?.id ?? null, error: null }
}
