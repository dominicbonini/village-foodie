// app/api/cron/loyalty-stamps/route.ts — loyalty-1 (5 November 2026, docs/loyalty-1-report.md).
// The loyalty stamping job, every 10 minutes (vercel.json crons): stamps newly collected orders and takes back the stamps of orders since
// cancelled or fully refunded (lib/loyalty/run.ts). It ONLY READS orders and their payment rows.
// ⚠️ SWITCHED OFF: platform_switches.loyalty_enabled is false, so a run reads that one row and returns `{ enabled: false, … }` before
// reading any order. Safe to run twice or in parallel (a stamp is unique per order; every write is an atomic database function).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import { isDemoIdentifier } from '@/lib/demo'
import { supabaseLoyaltyStore } from '@/lib/loyalty/store'
import { runLoyaltyStamps } from '@/lib/loyalty/run'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Admins may also run it by hand (the other crons' gate). */
async function authorised(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  const authz = req.headers.get('authorization') || ''
  if (secret && authz === `Bearer ${secret}`) return true
  return verifyAdmin(req)
}

export async function GET(req: NextRequest) {
  if (!await authorised(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const db = createClient((process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  try {
    return NextResponse.json(await runLoyaltyStamps(supabaseLoyaltyStore(db), { now: () => new Date(), isDemo: isDemoIdentifier }))
  } catch (e) {
    console.error('[loyalty] the stamping run stopped (the next run retries):', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'loyalty run failed' }, { status: 500 })
  }
}
