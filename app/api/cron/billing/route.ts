// app/api/cron/billing/route.ts — billing-1 (10 November 2026; corrected the same day): THE BILLING RUN. Vercel Cron, HOURLY
// (vercel.json), so each truck is handled within the hour of its own local events:
//   • the 1st's charge, as soon as the month has started in the truck's own zone — this month's plan fee and extra vans IN
//     ADVANCE + last month's billed usage IN ARREARS + surcharge + anything carried (once per truck per month);
//   • mid-month charges: the trial's end (the rest of that month's plan, pro rata) and upgrades (the pro-rata difference);
//   • the late-payment fee (0 everywhere — none) once an invoice is still unpaid when online ordering pauses;
//   • the status refresh: trial ended without a payment method, the 5-day unpaid pause.
// All of it idempotent (lib/billing/engine.ts runBillingAll), so a failed or missed hour is completed by the next.
// 🔴 SWITCH OFF (platform_switches.billing_enabled false — today): returns `skipped: switch_off` and touches nothing.
// The same auth as the other crons: Vercel's `Bearer $CRON_SECRET`, or an admin by hand.
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth/admin'
import { serverBillingStore } from '@/lib/billing/store'
import { runBillingAll } from '@/lib/billing/engine'
import { stripeBillingProcessor, type BillingProcessor } from '@/lib/billing/processor'
import { getPlanCatalog } from '@/lib/plans-server'

export const runtime = 'nodejs'
export const maxDuration = 300

async function authorised(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  const authz = req.headers.get('authorization') || ''
  if (secret && authz === `Bearer ${secret}`) return true
  return verifyAdmin(req)
}

export async function GET(req: NextRequest) {
  if (!await authorised(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const store = await serverBillingStore()
  if (!(await store.switches()).enabled) return NextResponse.json({ ok: true, skipped: 'switch_off' })
  // The processor is Stripe TEST mode only in this build; without the test key nothing can be invoiced (each owed month
  // reports `no_processor` and stays open for the next run).
  let processor: BillingProcessor | null = null
  try { processor = stripeBillingProcessor() } catch (e) { console.error('[cron/billing]', e instanceof Error ? e.message : e) }
  const result = await runBillingAll(store, processor, await getPlanCatalog(), new Date(), 'cron')
  const failed = result.outcomes.filter(o => o.outcome === 'failed')
  if (failed.length) console.error('[cron/billing] failures:', failed.slice(0, 20).map(f => `${f.truckId} ${f.period}: ${'reason' in f ? f.reason : ''}`).join(' | '))
  const counts = result.outcomes.reduce<Record<string, number>>((m, o) => ({ ...m, [o.outcome]: (m[o.outcome] ?? 0) + 1 }), {})
  return NextResponse.json({ ok: failed.length === 0, counts, lateFees: result.lateFees, outcomes: result.outcomes.map(o => ({ truckId: o.truckId, period: o.period, kind: o.kind, outcome: o.outcome, ...('reason' in o ? { reason: o.reason } : {}) })) },
    { status: failed.length ? 500 : 200 })
}
