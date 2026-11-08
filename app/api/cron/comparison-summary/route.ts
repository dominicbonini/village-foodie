// app/api/cron/comparison-summary/route.ts — compare-autopublish-1 §5 (7 November 2026, docs/compare-autopublish-1-report.md).
// THE WEEKLY COMPARISON SUMMARY TO DOMINIC, Mondays 08:00 UTC (vercel.json crons): the countries live now, and the last 7 days' automatic
// decisions (comparison_publish_events) — competitors newly published, changed, held back or taken down, each with its reason, and every
// finding accepted or rejected (counted by reason). Through the internal admin email path (lib/email.ts sendConfirmationEmail →
// ADMIN_ALERT_TO, as the checker's own summary) — NEVER an outreach template. Nothing changed → no email. It only reads.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import { sendConfirmationEmail } from '@/lib/email'
import { ADMIN_ALERT_TO } from '@/lib/custom-domain/alert'
import { weeklySummary, type PublishEvent } from '@/lib/comparison-publish'
import { flagsFromRows } from '@/lib/comparison-flags'

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
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString()
    const [ev, cs, pub, comps] = await Promise.all([
      db.from('comparison_publish_events').select('at, country_code, competitor_id, kind, detail').gte('at', since).order('at').limit(20000),
      db.from('country_settings').select('country_code, comparison_status, ios_app_available, android_app_available'),
      db.from('comparison_publish').select('country_code, auto_publish, auto_live, admin_off'),
      db.from('competitors').select('id, name'),
    ])
    for (const r of [ev, cs, pub, comps]) if (r.error) throw new Error(r.error.message)
    const live = [...flagsFromRows(cs.data ?? [], pub.data ?? []).values()].filter(f => f.status === 'live').map(f => f.countryCode).sort()
    const names = new Map(((comps.data ?? []) as { id: string; name: string }[]).map(c => [c.id, c.name]))
    const mail = weeklySummary((ev.data ?? []) as PublishEvent[], live, names, 'https://www.hatchgrab.com/admin?tab=pricing')
    if (!mail) return NextResponse.json({ sent: false, reason: 'nothing changed this week', live })
    await sendConfirmationEmail({ to: ADMIN_ALERT_TO, subject: mail.subject, html: mail.html, text: mail.text, senderName: 'HatchGrab' })
    return NextResponse.json({ sent: true, events: (ev.data ?? []).length, live })
  } catch (e) {
    console.error('[comparison-summary] the weekly summary was not sent:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'comparison summary failed' }, { status: 500 })
  }
}
