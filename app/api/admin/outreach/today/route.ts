// app/api/admin/outreach/today/route.ts — the mail half of the Today screen.
//
// 🔴 WHAT THIS ROUTE DOES AND DOES NOT DO. It returns the two sections that come out of
// `outreach_messages`: replies waiting for an answer, and outbound emails that went wrong. The other
// two — chases due and follow-ups due — are derived by `nextStep` from data the page has already
// loaded, and deriving them again here would be the second derivation §57.1 says does not exist.
//
// 🔴 NO IMAP. Everything below is Postgres. The bodies were stored when the messages were recorded
// (see docs/outreach-mail-import-view-report.md), so the snippet on a waiting reply costs nothing.
//
// ⚠️ READS ONLY. No column is written here; Mark done, Snooze and Mark as needing reply are POSTs to
// the timeline route.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import { needsAttention, replySnippet } from '@/lib/outreach-attention'
import { PROBLEM_STATUSES, type WaitingReply, type ProblemEmail } from '@/lib/outreach-today'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export interface TodayResponse {
  ok: true
  /** False when the CRM migration has not been applied; the panel degrades instead of breaking. */
  migrationApplied: boolean
  waiting: WaitingReply[]
  problems: ProblemEmail[]
}

export async function GET(req: NextRequest) {
  // 🔴 404, NOT 401 — an admin route does not confirm its own existence to an unauthenticated caller.
  if (!(await verifyAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 404 })
  const now = new Date()

  // ── THE INBOUND SIDE ────────────────────────────────────────────────────────────────────────────
  // ⚠️ THE COLUMNS ARE NAMED IN THE SELECT, so a missing migration fails here — once, with a clear
  // answer — rather than silently returning rows with `handled_at: undefined`, which the predicate
  // would read as "never handled" and put the whole history on screen as work.
  const { data: inbound, error: inErr } = await supabase
    .from('outreach_messages')
    .select('id, prospect_id, status, is_test, direction, message_date, text_body, handled_at, snoozed_until')
    .eq('direction', 'inbound')
    .eq('status', 'received')
    .is('handled_at', null)
    .order('message_date', { ascending: true })
    .limit(200)
  if (inErr) {
    return NextResponse.json({
      ok: true, migrationApplied: false, waiting: [], problems: [],
    } satisfies TodayResponse)
  }

  const { data: problemRows } = await supabase
    .from('outreach_messages')
    .select('id, prospect_id, status, subject, message_date, last_error, is_test')
    .eq('direction', 'outbound')
    .in('status', PROBLEM_STATUSES as unknown as string[])
    .order('message_date', { ascending: false })
    .limit(100)

  type MsgRow = {
    id: string; prospect_id: string; status: string; is_test: boolean | null; direction: string | null
    message_date: string | null; text_body?: string | null; subject?: string | null
    last_error?: string | null; handled_at?: string | null; snoozed_until?: string | null
  }
  const inboundRows = (inbound ?? []) as MsgRow[]
  const problemsRaw = ((problemRows ?? []) as MsgRow[]).filter(r => r.is_test !== true)

  // ── WHO THEY BELONG TO, AND WHICH OF THEM ARE CUSTOMERS ────────────────────────────────────────
  // 🔴 A LINKED HATCHGRAB TRUCK IS NOT A PROSPECT (§52). The poll already refuses to log for one; the
  // queue already skips it; this excludes it from the screen. One rule, three places, same answer.
  const ids = Array.from(new Set([...inboundRows, ...problemsRaw].map(r => r.prospect_id).filter(Boolean)))
  const names = new Map<string, string | null>()
  const linked = new Set<string>()
  if (ids.length) {
    const { data: pRows } = await supabase
      .from('outreach_prospects')
      .select('id, discovery_trucks(name, hatchgrab_truck_id)')
      .in('id', ids)
    type P = { id: string; discovery_trucks: { name: string | null; hatchgrab_truck_id: string | null } | null }
    for (const p of (pRows ?? []) as unknown as P[]) {
      names.set(p.id, p.discovery_trucks?.name ?? null)
      if (p.discovery_trucks?.hatchgrab_truck_id) linked.add(p.id)
    }
  }

  // 🔴 THE SHARED PREDICATE, NOT A SECOND SET OF CONDITIONS. The query above narrows what has to be
  // read; `needsAttention` decides. The snooze test in particular is deliberately NOT in the SQL —
  // one place owns "waiting", and it is the one the timeline's badge asks too.
  const waiting: WaitingReply[] = inboundRows
    .filter(r => needsAttention(r, { now, linkedTruck: linked.has(r.prospect_id) }))
    .map(r => ({
      id: r.id,
      prospect_id: r.prospect_id,
      prospect_name: names.get(r.prospect_id) ?? null,
      snippet: replySnippet(r.text_body),
      message_date: r.message_date,
    }))

  const problems: ProblemEmail[] = problemsRaw
    .filter(r => !linked.has(r.prospect_id))
    .map(r => ({
      id: r.id,
      prospect_id: r.prospect_id,
      prospect_name: names.get(r.prospect_id) ?? null,
      status: r.status,
      subject: r.subject ?? null,
      message_date: r.message_date,
      last_error: r.last_error ?? null,
    }))

  return NextResponse.json({ ok: true, migrationApplied: true, waiting, problems } satisfies TodayResponse)
}
