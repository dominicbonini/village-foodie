// app/api/admin/outreach/mail-poll/route.ts — "Check for replies now".
//
// 🔴 THE SAME ROUTINE THE CRON RUNS, and the same lock. Pressing the button while the ten-minute cron
// happens to be mid-run does nothing rather than logging every new reply twice — see `takeLock`.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import { runReplyPoll } from '@/lib/outreach-mail-poll'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function POST(req: NextRequest) {
  // 🔴 404, NOT 401 — an admin route does not confirm its own existence to an unauthenticated caller.
  if (!(await verifyAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 404 })
  return NextResponse.json(await runReplyPoll(supabase))
}
