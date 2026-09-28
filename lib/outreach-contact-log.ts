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

/** `not_contacted` → `contacted`, conditionally. The values the route already uses. */
export const DEFAULT_STAGE = 'not_contacted'
export const CONTACTED_STAGE = 'contacted'

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

  // 🔴 CONDITIONAL, AND THE CONDITION IS IN THE STATEMENT. `.eq('stage', DEFAULT_STAGE)` means a prospect
  // an operator has already moved on by hand is never dragged back to `contacted` by a later log.
  if (input.direction === 'outbound') {
    const { data: moved, error: sErr } = await supabase
      .from('outreach_prospects')
      .update({ stage: CONTACTED_STAGE, updated_at: new Date().toISOString() })
      .eq('id', input.prospect_id)
      .eq('stage', DEFAULT_STAGE)
      .select('id, stage')
    if (sErr) warning = 'Contact logged, but the stage could not be updated. Set it by hand if needed.'
    else stage = moved && moved.length > 0 ? (moved[0] as { stage: string }).stage : null
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
