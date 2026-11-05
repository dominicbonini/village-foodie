// app/api/cron/review-requests/route.ts — reviews-weather-1 (5 November 2026, docs/reviews-weather-1-report.md).
// The Google review request job: schedule, send what is due, prune (lib/reviews/run.ts).
// ⚠️ SWITCHED OFF: platform_switches.review_requests_enabled is false, so a run reads that one row and returns
// `{ enabled: false }`. It is NOT registered in vercel.json's crons yet; add it when the flow is agreed and switched on
// (every 15 minutes: a delay of N minutes then means N to N+15).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import { isDemoIdentifier } from '@/lib/demo'
import { moneyFormatForOrder } from '@/lib/money-server'
import { supabaseReviewStore } from '@/lib/reviews/store'
import { runReviewRequests } from '@/lib/reviews/run'
import { reviewEmail, sendReviewEmail } from '@/lib/reviews/email'

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
  const base = process.env.NEXT_PUBLIC_HATCHGRAB_URL ?? 'https://www.hatchgrab.com'
  const result = await runReviewRequests(supabaseReviewStore(db), {
    now: () => new Date(),
    localeOf: async o => (await moneyFormatForOrder(o)).locale,
    isDemo: isDemoIdentifier,
    baseUrl: base,
    send: async m => {
      const e = reviewEmail({ locale: m.locale, truckName: m.truckName, reviewUrl: m.reviewUrl, unsubscribeUrl: m.unsubscribeUrl })
      return sendReviewEmail({ to: m.to, truckName: m.truckName, replyTo: m.replyTo, subject: e.subject, html: e.html, text: e.text, unsubscribeUrl: m.unsubscribeUrl })
    },
  })
  return NextResponse.json(result)
}
