// app/api/cron/order-retention/route.ts — the daily retention run (19 October 2026; lib/order-retention.ts says what it
// removes and keeps, and why). Vercel Cron, daily (vercel.json); service role.
// 🔴 It removes customer details from orders more than 12 months old, as the privacy policy promises, and runs
// purge_order_drafts() — the erasure of abandoned card drafts, which nothing was calling — and deletes WhatsApp logs
// (`whatsapp_logs`, `messages`) more than 12 months old — and (contact-1) the contact form's messages (`contact_messages`) more than
// 24 months old.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import { runOrderRetention } from '@/lib/order-retention'
// paperwork-1 (4 November 2026): the daily Paperwork run — expiry reminders and abandoned uploads — after the retention work.
import { runPaperworkDaily } from '@/lib/paperwork/reminders'

export const runtime = 'nodejs'

const supabase = createClient(
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Admins may also trigger it by hand — the same gate the other
 *  crons use (app/api/cron/cancel-stale-authorizations). */
async function authorised(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  const authz = req.headers.get('authorization') || ''
  if (secret && authz === `Bearer ${secret}`) return true
  return verifyAdmin(req)
}

export async function GET(req: NextRequest) {
  if (!await authorised(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const result = await runOrderRetention(supabase)
  if (result.failures.length) console.error('[cron/order-retention] failures:', result.failures.slice(0, 20).join(' | '))
  // paperwork-1: its own step — a failure here is logged and reported, and never stops or hides the retention result.
  let paperwork: Awaited<ReturnType<typeof runPaperworkDaily>> | { failures: string[] }
  try { paperwork = await runPaperworkDaily(supabase) } catch (e) { paperwork = { failures: [e instanceof Error ? e.message : String(e)] } }
  if (paperwork.failures.length) console.error('[cron/order-retention] paperwork failures:', paperwork.failures.slice(0, 20).join(' | '))
  const failed = result.failures.length > 0 || paperwork.failures.length > 0
  return NextResponse.json({ ok: !failed, ...result, paperwork }, { status: failed ? 500 : 200 })
}
