// lib/outreach-contact-log.ts — writing a rung onto the outreach ladder, in ONE place.
//
// 🔴 WHY THIS WAS EXTRACTED (28 September 2026). The `log_contact` action in
// app/api/admin/outreach/route.ts was the only server-side path that writes `outreach_contacts`, and the
// Log-only button drives it. Sending an email must produce the SAME rung — same kind, same stage move —
// or the ladder that §57's next step is derived from would disagree with itself depending on which
// button was pressed. Copying that block into the send route would have been a second implementation of
// the thing §57 says has no second implementation.
//
// The route's own behaviour is unchanged: it calls this with the side effects OFF, exactly as before,
// because its caller (the compose window) still drives the lead-type freeze and the follow-up date as
// separate patches from the client. The SEND route has no client to do that, so it asks for them here.
import type { SupabaseClient } from '@supabase/supabase-js'
import { followUpDateFor } from '@/lib/outreach'
import { shouldFreezeLeadType, leadTypeOf, type LeadTypeInput } from '@/lib/outreach-step'
import { recordStageChange, STAGE_CAUSE } from '@/lib/outreach-events'
import { handledBoundary } from '@/lib/outreach-attention'

/** `not_contacted` → `contacted`, conditionally. The values the route already uses. */
export const DEFAULT_STAGE = 'not_contacted'
export const CONTACTED_STAGE = 'contacted'
/** Where an INBOUND reply moves a prospect to. §57.1: this is also what exits its chase sequence. */
export const REPLIED_STAGE = 'replied'
/**
 * 🔴 THE ONLY TWO STAGES A REPLY MAY MOVE FROM. A stage Dominic has set by hand — `not_interested`,
 * `signed`, anything he has decided — is never overwritten by a machine reading his mailbox. The
 * filter is `.in('stage', …)` INSIDE the statement, so the condition is the write and not a read
 * followed by a hopeful update.
 */
export const REPLY_MOVES_FROM = [DEFAULT_STAGE, CONTACTED_STAGE] as const

export interface LogContactInput {
  prospect_id: string
  channel: string | null
  direction: string | null
  kind: string | null
  message: string | null
  contacted_at?: string | null
}

export interface LogContactResult {
  ok: boolean
  id: string | null
  stage: string | null
  /** Non-fatal: the rung was written but something after it was not. Shown to the operator. */
  warning: string | null
  /** Fatal: nothing was written. */
  error: string | null
}

/**
 * Write one rung.
 *
 * `ladderSideEffects` (the send route) additionally does what the compose window does from the client:
 * freezes `lead_type_at_first_contact` at rung 1 and sets `next_action_at` from the ladder's interval.
 * ⚠️ IT IS OPT-IN SO THE EXISTING ROUTE'S BEHAVIOUR IS UNTOUCHED. Turning it on there would double up
 * with the client's own patch, which is a different change and not this one.
 */
export async function logOutreachContact(
  supabase: SupabaseClient,
  input: LogContactInput,
  ladderSideEffects?: { prospect: LeadTypeInput; hasLeadTypeFreeze: boolean },
): Promise<LogContactResult> {
  const { data: inserted, error } = await supabase.from('outreach_contacts').insert({
    prospect_id: input.prospect_id,
    channel: input.channel ?? null,
    direction: input.direction ?? null,
    kind: input.kind ?? null,
    message: input.message ? String(input.message) : null,
    ...(input.contacted_at ? { contacted_at: input.contacted_at } : {}),
  }).select('id').single()
  if (error) return { ok: false, id: null, stage: null, warning: null, error: error.message }

  let stage: string | null = null
  let warning: string | null = null
  const nowIso = new Date().toISOString()
  // 🔴 THE INSTANT THIS CONTACT COUNTS AS HAVING HAPPENED. `contacted_at` is a DATE when a person
  // typed it and a full timestamp when the mail system wrote it; `handledBoundary` owns the
  // difference, and the whole reason it exists is that midnight is the wrong answer for a call
  // logged today.
  const happenedAt = handledBoundary(input.contacted_at, new Date(nowIso))

  // 🔴 CONDITIONAL, AND THE CONDITION IS IN THE STATEMENT. `.eq('stage', DEFAULT_STAGE)` means a prospect
  // an operator has already moved on by hand is never dragged back to `contacted` by a later log.
  if (input.direction === 'outbound') {
    // 🔴 ANSWERING IS HANDLING, AND IT IS IMPLEMENTED HERE AND NOWHERE ELSE. Every outbound touch
    // reaches this function — a send from the compose window, a call or a WhatsApp logged by hand,
    // and an Outlook reply the poll finds in Sent — so this one sweep covers all three. Written in
    // the send route instead, a logged phone call would leave the reply sitting in Today for ever,
    // and Dominic would learn not to trust the list.
    await markEarlierRepliesHandled(supabase, input.prospect_id, happenedAt, nowIso)
    const { data: moved, error: sErr } = await supabase
      .from('outreach_prospects')
      .update({ stage: CONTACTED_STAGE, updated_at: nowIso })
      .eq('id', input.prospect_id)
      .eq('stage', DEFAULT_STAGE)
      .select('id, stage')
    if (sErr) warning = 'Contact logged, but the stage could not be updated. Set it by hand if needed.'
    else stage = moved && moved.length > 0 ? (moved[0] as { stage: string }).stage : null
    // 🔴 ONLY WHEN A ROW ACTUALLY MOVED. The filter above means most logs update nothing, and an
    // event on every log would fill the timeline with stage changes that never happened.
    // ⚠️ `from_stage` IS CERTAIN HERE: the update's own filter is `stage = not_contacted`, so a row
    // that came back was on that stage a moment ago. It is not read separately, because a read would
    // be a guess where the filter is a fact.
    if (stage) {
      const ev = await recordStageChange(supabase, {
        prospect_id: input.prospect_id,
        from_stage: DEFAULT_STAGE,
        to_stage: stage,
        body: input.kind === '1_first_contact' ? STAGE_CAUSE.firstEmail : STAGE_CAUSE.outboundContact,
      })
      if (!ev.ok) warning = warning ?? 'Contact logged, but the stage change was not recorded in the timeline.'
    }
  } else if (input.direction === 'inbound') {
    // 🔴 A REPLY MOVES THE PROSPECT TO `replied` — AND THE POLL WRITES IT THROUGH HERE, not beside it.
    // Added 29 September 2026 for the reply poll. It is in this function rather than in the poll for
    // the reason the whole file exists: a rung written anywhere else would be a second implementation
    // of the ladder §57 derives from, and the two would eventually disagree about what a reply does.
    // ⚠️ THE SAME CONDITIONAL SHAPE AS THE OUTBOUND MOVE, widened to two source stages. A prospect
    // Dominic has marked `not_interested` stays `not_interested` however many emails they send.
    // ⚠️ READ BEFORE THE WRITE, FOR THE EVENT ONLY. The move may come from either of two stages, and
    // an UPDATE cannot return the value it replaced. The write itself is still the conditional
    // statement below — this read decides nothing, it only names what the timeline will say the
    // prospect moved FROM.
    const { data: before } = await supabase
      .from('outreach_prospects').select('stage').eq('id', input.prospect_id).maybeSingle()
    const fromStage = (before as { stage?: string | null } | null)?.stage ?? null
    const { data: moved, error: sErr } = await supabase
      .from('outreach_prospects')
      .update({ stage: REPLIED_STAGE, updated_at: nowIso })
      .eq('id', input.prospect_id)
      .in('stage', REPLY_MOVES_FROM as unknown as string[])
      .select('id, stage')
    if (sErr) warning = 'Reply logged, but the stage could not be updated. Set it by hand if needed.'
    else stage = moved && moved.length > 0 ? (moved[0] as { stage: string }).stage : null
    if (stage) {
      const ev = await recordStageChange(supabase, {
        prospect_id: input.prospect_id,
        from_stage: fromStage,
        to_stage: stage,
        body: STAGE_CAUSE.replyReceived,
      })
      if (!ev.ok) warning = warning ?? 'Reply logged, but the stage change was not recorded in the timeline.'
    }
  }

  if (ladderSideEffects && input.kind) {
    const contactedAt = (input.contacted_at ?? new Date().toISOString()).slice(0, 10)
    const patch: Record<string, unknown> = { next_action_at: followUpDateFor(input.kind, contactedAt) }
    // Rung 1 only, write-once — `shouldFreezeLeadType` owns both conditions, as it does for the client.
    if (shouldFreezeLeadType(input.kind, ladderSideEffects.prospect, ladderSideEffects.hasLeadTypeFreeze)) {
      patch.lead_type_at_first_contact = leadTypeOf(ladderSideEffects.prospect)
    }
    const { error: pErr } = await supabase
      .from('outreach_prospects').update(patch).eq('id', input.prospect_id)
    if (pErr) warning = warning ?? 'Contact logged, but the follow-up date could not be set.'
  }

  return { ok: true, id: (inserted as { id?: string } | null)?.id ?? null, stage, warning, error: null }
}

/**
 * Every inbound message that arrived BEFORE this outbound contact stops waiting for attention.
 *
 * 🔴 EARLIER ONLY, AND THAT IS THE WHOLE RULE. A reply that lands while Dominic is typing his answer
 * has not been answered by it. Marking every unhandled reply would silently clear the one thing Today
 * exists to show, and it would do so at the moment most likely to produce a second reply.
 * ⚠️ `handled_at is null` KEEPS IT IDEMPOTENT: a row already handled keeps the instant it was handled
 * at, so re-logging a contact cannot rewrite when a reply was dealt with.
 * ⚠️ A FAILURE HERE IS SILENT ON PURPOSE. The rung is written and the stage has moved; the worst case
 * is a reply still showing in Today, which Mark done fixes in one click.
 */
async function markEarlierRepliesHandled(
  supabase: SupabaseClient, prospectId: string, happenedAt: string, nowIso: string,
): Promise<void> {
  await supabase.from('outreach_messages')
    .update({ handled_at: nowIso, updated_at: nowIso })
    .eq('prospect_id', prospectId)
    .eq('direction', 'inbound')
    .is('handled_at', null)
    .lt('message_date', happenedAt)
}
