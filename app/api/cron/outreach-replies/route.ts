// app/api/cron/outreach-replies/route.ts — the scheduled half of the reply poll.
//
// 🔴 IT RUNS THE SAME ROUTINE AS THE BUTTON. `runReplyPoll` is the whole job; this file is a cron
// entry point and an auth gate and nothing else. A scheduled copy that drifted from the manual one is
// how "it works when I press it" becomes a bug report nobody can reproduce.
//
// ⚠️ A JOB THAT NEVER RUNS CANNOT REPORT THAT IT NEVER RAN. The recorded failure mode applies here as
// it does to every cron in this app: when the Vault service_role_key was deleted, every scheduled
// invocation 401'd and nothing surfaced it. The mitigation is that the work is INCREMENTAL and
// idempotent — a resumed poll catches up from its watermark rather than losing anything — and that
// Dominic has a button that reports exactly what a run did.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import { runReplyPoll } from '@/lib/outreach-mail-poll'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. An admin may also trigger it by hand —
 *  the same gate every other cron route in this app uses. */
async function authorised(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  const authz = req.headers.get('authorization') || ''
  if (secret && authz === `Bearer ${secret}`) return true
  return verifyAdmin(req)
}

export async function GET(req: NextRequest) {
  if (!await authorised(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const summary = await runReplyPoll(supabase)
  // ⚠️ COUNTS ONLY. No address, no subject, no body — a cron log is the last place message content
  // should end up, and this response is what Vercel records.
  return NextResponse.json(summary)
}
