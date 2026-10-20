// app/api/cron/order-retention/route.ts — the daily retention run (19 October 2026; lib/order-retention.ts says what it
// removes and keeps, and why). Vercel Cron, daily (vercel.json); service role.
// 🔴 It removes customer details from orders more than 12 months old, as the privacy policy promises, and runs
// purge_order_drafts() — the erasure of abandoned card drafts, which nothing was calling — and deletes WhatsApp logs
// (`whatsapp_logs`, `messages`) more than 12 months old.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import { runOrderRetention } from '@/lib/order-retention'

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
  return NextResponse.json({ ok: result.failures.length === 0, ...result }, { status: result.failures.length ? 500 : 200 })
}
