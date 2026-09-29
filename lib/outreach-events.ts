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
