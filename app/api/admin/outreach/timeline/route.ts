// app/api/admin/outreach/timeline/route.ts — one prospect's whole conversation, and the four writes
// that change what is waiting.
//
// 🔴 THREE TABLES, ONE ROUND TRIP, NO MAILBOX. `outreach_messages` (what was sent and what arrived),
// the contact rows that are NOT emails (calls, WhatsApp, hand-logged), and `outreach_events` (stage
// changes and notes). Opening a prospect used to cost an IMAP connection per email opened; the bodies
// are stored now, so this is Postgres and nothing else.
//
// ⚠️ THE FULL BODY IS NOT IN THIS RESPONSE. A preview of the first few lines is; the body itself is
// fetched by the existing `view` action when a row is expanded, which serves it from the same stored
// columns. Sending every body of every email in one payload would make opening a prospect slower than
// the IMAP fetch this replaced.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import { isSnoozeOption, snoozeUntil } from '@/lib/outreach-attention'
import { addNote } from '@/lib/outreach-events'
import { previewOf, type TimelineMessage, type TimelineContact, type TimelineEvent } from '@/lib/outreach-timeline'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export interface TimelineResponse {
  ok: true
  /** False when the CRM migration has not been applied. The panel degrades rather than breaking. */
  migrationApplied: boolean
  messages: TimelineMessage[]
  contacts: TimelineContact[]
  events: TimelineEvent[]
}

export async function GET(req: NextRequest) {
  if (!(await verifyAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 404 })
  const prospectId = req.nextUrl.searchParams.get('prospect_id')
  if (!prospectId) return NextResponse.json({ error: 'prospect_id required' }, { status: 400 })

  // ⚠️ `html_body` IS DELIBERATELY NOT SELECTED. It is capped at a megabyte a row; the preview comes
  // from `text_body`, which is the flattened text the poll already extracted.
  const { data: mRows, error: mErr } = await supabase
    .from('outreach_messages')
    .select('id, direction, status, is_test, source, subject, message_date, created_at, sent_copy, attempts, last_error, text_body, attachments, handled_at, snoozed_until, contact_id')
    .eq('prospect_id', prospectId)
    .order('created_at', { ascending: false })
    .limit(400)
  // A missing CRM column is the one error worth naming: everything else here predates this build.
  if (mErr) return NextResponse.json({ ok: true, migrationApplied: false, messages: [], contacts: [], events: [] } satisfies TimelineResponse)

  type Raw = TimelineMessage & { text_body?: string | null; attachments?: unknown; contact_id?: string | null }
  const messages: TimelineMessage[] = ((mRows ?? []) as Raw[]).map(r => ({
    id: r.id,
    direction: r.direction,
    status: r.status,
    is_test: r.is_test ?? false,
    source: r.source ?? null,
    subject: r.subject ?? null,
    message_date: r.message_date ?? null,
    created_at: r.created_at ?? null,
    handled_at: r.handled_at ?? null,
    snoozed_until: r.snoozed_until ?? null,
    sent_copy: r.sent_copy ?? null,
    last_error: r.last_error ?? null,
    attempts: r.attempts ?? null,
    preview: previewOf(r.text_body),
    attachment_count: Array.isArray(r.attachments) ? r.attachments.length : 0,
  }))

  // 🔴 `contact_id` IS THE LINK THAT DE-DUPLICATES. It lives on the message; the timeline reads it off
  // the CONTACT (as `email_message_id`), which is the direction the panel's existing type already
  // uses, so this inverts the map here rather than teaching the builder a second shape.
  const messageOfContact = new Map<string, string>()
  for (const r of (mRows ?? []) as Raw[]) if (r.contact_id) messageOfContact.set(r.contact_id, r.id)

  const { data: cRows } = await supabase
    .from('outreach_contacts')
    .select('id, contacted_at, created_at, channel, direction, kind, message')
    .eq('prospect_id', prospectId)
    .order('contacted_at', { ascending: false })
    .limit(400)
  const contacts: TimelineContact[] = ((cRows ?? []) as TimelineContact[]).map(c => ({
    ...c, email_message_id: messageOfContact.get(c.id) ?? null,
  }))

  const { data: eRows } = await supabase
    .from('outreach_events')
    .select('id, kind, from_stage, to_stage, body, created_at')
    .eq('prospect_id', prospectId)
    .order('created_at', { ascending: false })
    .limit(400)

  return NextResponse.json({
    ok: true, migrationApplied: true,
    messages, contacts, events: (eRows ?? []) as TimelineEvent[],
  } satisfies TimelineResponse)
}

/**
 * The four writes: Mark done, Snooze, Mark as needing reply, Add note.
 *
 * 🔴 NONE OF THEM TOUCHES A MAILBOX AND NONE OF THEM SENDS ANYTHING. They move two nullable columns
 * and insert one row. ⚠️ AND NONE OF THEM WRITES A CONTACT ROW: marking a reply done is not a touch,
 * and putting it on the ladder would change what §57 derives as the next step.
 */
export async function POST(req: NextRequest) {
  if (!(await verifyAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 404 })
  let body: Record<string, unknown>
  try { body = (await req.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }
  const action = String(body.action ?? '')
  const nowIso = new Date().toISOString()

  const patchMessage = async (patch: Record<string, unknown>, ok: string) => {
    const id = String(body.message_id ?? '')
    if (!id) return NextResponse.json({ error: 'message_id required' }, { status: 400 })
    const { data, error } = await supabase.from('outreach_messages')
      .update({ ...patch, updated_at: nowIso }).eq('id', id).select('id, handled_at, snoozed_until')
    if (error) return NextResponse.json({ ok: false, refusal: `That could not be saved (${error.message}).` })
    if (!data || data.length === 0) return NextResponse.json({ ok: false, refusal: 'That message is not in the log any more.' })
    return NextResponse.json({ ok: true, message: ok, row: data[0] })
  }

  // Done is done: a handled reply is not also snoozed, or it would come back.
  if (action === 'mark_handled') return patchMessage({ handled_at: nowIso, snoozed_until: null }, 'Marked done.')

  if (action === 'snooze') {
    const option = body.option
    if (!isSnoozeOption(option)) return NextResponse.json({ error: 'Invalid snooze option' }, { status: 400 })
    // ⚠️ `handled_at` STAYS NULL. "Not now" is not "done" — that is the whole difference between the
    // two columns, and setting both would mean the reply never came back.
    return patchMessage({ snoozed_until: snoozeUntil(option, new Date()).toISOString() }, 'Snoozed.')
  }

  // 🔴 BOTH CLEARED. This is the undo for either of the two above, so it has to undo either of them.
  if (action === 'needs_reply') return patchMessage({ handled_at: null, snoozed_until: null }, 'Back on the list.')

  if (action === 'add_note') {
    const prospectId = String(body.prospect_id ?? '')
    if (!prospectId) return NextResponse.json({ error: 'prospect_id required' }, { status: 400 })
    const res = await addNote(supabase, prospectId, String(body.body ?? ''))
    if (!res.ok) return NextResponse.json({ ok: false, refusal: res.error ?? 'That note could not be saved.' })
    return NextResponse.json({ ok: true, id: res.id, message: 'Note added.' })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
