// app/api/admin/billing/route.ts — billing-1 (10 November 2026). 🔴 ADMIN ONLY (verifyAdmin first, bare 401 otherwise).
//   GET                         the switch, the billing key's state (test / missing / refused — never the key), every country's
//                               billing row, and every truck billing could ever touch (customers and billing-test trucks) with
//                               its status as it is now AND as it would be with the switch on.
//   GET ?truckId=…              one truck: its facts, its months (ledger), the open month's lines, its invoices.
//   PUT {country row}           save one country's payment model, post-pay surcharge and minimum (stale-save guarded).
//   POST {action:'preview_month', truckId, period}    compute a month without saving anything.
//   POST {action:'run_month_end_test', truckId, period}  run the month-end for ONE billing-TEST truck on Stripe TEST mode.
// Nothing here turns the global switch on — that is a migration, by decision.
import { NextRequest, NextResponse } from 'next/server'
import { adminUser } from '@/lib/auth/admin'
import { serverBillingStore } from '@/lib/billing/store'
import { billingContextFor, computeMonth, runMonth } from '@/lib/billing/engine'
import { billingKeyState, stripeBillingProcessor } from '@/lib/billing/processor'
import { billingStatusOf, arrangementOf, billableOf, isPaymentModel, isPeriod, trialEndOf, periodOf, previousPeriod } from '@/lib/billing/rules'
import { getPlanCatalog } from '@/lib/plans-server'
import { listCountrySettings } from '@/lib/country-settings'

export const runtime = 'nodejs'
export const maxDuration = 120

const intIn = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : null)

export async function GET(req: NextRequest) {
  if (!(await adminUser(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const store = await serverBillingStore()
  const catalog = await getPlanCatalog()
  const now = new Date()
  const truckId = req.nextUrl.searchParams.get('truckId')

  if (truckId) {
    const truck = await store.truck(truckId)
    if (!truck) return NextResponse.json({ error: 'No such truck' }, { status: 404 })
    const [ctx, ctxOn, tb, usage, invoices] = await Promise.all([
      billingContextFor(store, truck, catalog, now), billingContextFor(store, truck, catalog, now, { forceSwitch: true }),
      store.truckBilling(truckId), store.listUsage(truckId), store.listInvoices(truckId),
    ])
    const open = usage.find(u => u.state === 'open')
    return NextResponse.json({
      truck: { id: truck.id, name: truck.name, country: truck.country, currency: truck.currency, plan: truck.plan, trialEndsAt: trialEndOf(truck, catalog), timezone: truck.timezone, isCustomer: truck.is_customer === true },
      billing: tb, statusNow: billingStatusOf(ctx), statusIfOn: billingStatusOf({ ...ctxOn, switchOn: true }),
      billableIfOn: billableOf({ ...ctxOn, switchOn: true }), arrangement: arrangementOf(ctx),
      lastEndedPeriod: previousPeriod(periodOf(now, truck.timezone || 'Europe/London')),
      usage, openLines: open ? await store.usageLines(truckId, open.period) : [], invoices,
    })
  }

  const [sw, countryRows, settings, ids] = await Promise.all([store.switches(), store.listCountryBilling(), listCountrySettings(), store.candidateTruckIds()])
  const byCode = new Map(settings.map(s => [s.countryCode, s]))
  const trucks = []
  for (const id of ids) {
    const t = await store.truck(id)
    if (!t) continue
    const [ctx, tb] = await Promise.all([billingContextFor(store, t, catalog, now), store.truckBilling(id)])
    trucks.push({
      id, name: t.name, country: t.country, currency: t.currency, plan: t.plan, isCustomer: t.is_customer === true,
      billingTest: tb?.billingTest === true, postPay: tb?.postPay === true, paymentMethod: tb?.paymentMethodLabel ?? null,
      paymentMethodState: tb?.paymentMethodState ?? 'none', statusNow: billingStatusOf(ctx), statusIfOn: billingStatusOf({ ...ctx, switchOn: true }),
    })
  }
  return NextResponse.json({
    switch: sw, keyState: billingKeyState(),
    countries: countryRows.map(r => ({ ...r, name: byCode.get(r.countryCode)?.name ?? r.countryCode, currency: byCode.get(r.countryCode)?.currency ?? null, platformFeeAllowed: byCode.get(r.countryCode)?.platformFeeAllowed !== false })),
    missingCountries: settings.filter(s => !countryRows.some(r => r.countryCode === s.countryCode)).map(s => ({ countryCode: s.countryCode, name: s.name, currency: s.currency })),
    trucks,
  })
}

export async function PUT(req: NextRequest) {
  const admin = await adminUser(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  let b: Record<string, unknown>
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }
  const code = typeof b.countryCode === 'string' && /^[A-Z]{2}$/.test(b.countryCode) ? b.countryCode : null
  const model = isPaymentModel(b.paymentModel) ? b.paymentModel : null
  const bps = intIn(b.postPaySurchargeBps, 0, 10000)
  const fixed = intIn(b.postPaySurchargeFixedMinor, 0, 100_000_000)
  const min = intIn(b.minChargeMinor, 0, 100_000_000)
  const errors: string[] = []
  if (!code) errors.push('Choose a country.')
  if (!model) errors.push('Choose a payment model.')
  if (bps === null) errors.push('The post-pay surcharge percentage must be a whole number of basis points from 0 to 10000 (100 = 1%).')
  if (fixed === null) errors.push('The post-pay monthly surcharge must be a whole number of minor units, 0 or more.')
  if (min === null) errors.push('The minimum charge must be a whole number of minor units, 0 or more.')
  if (errors.length) return NextResponse.json({ error: errors.join(' '), errors }, { status: 400 })
  const settings = (await listCountrySettings()).find(s => s.countryCode === code)
  if (!settings) return NextResponse.json({ error: `${code} is not a country in Admin › Countries.` }, { status: 400 })
  if (model === 'fee_from_payment' && settings.platformFeeAllowed === false) {
    return NextResponse.json({ error: `${settings.name} cannot take the fee from each payment: Stripe does not allow an application fee there. Choose (b) or (c).` }, { status: 400 })
  }
  const store = await serverBillingStore()
  const existing = await store.countryBilling(code as string)
  const expected = typeof b.expectedUpdatedAt === 'string' ? b.expectedUpdatedAt : null
  if (existing && !expected) return NextResponse.json({ error: 'Reload the page — this row was not loaded.' }, { status: 409 })
  const saved = await store.saveCountryBilling({ countryCode: code as string, paymentModel: model!, postPaySurchargeBps: bps!, postPaySurchargeFixedMinor: fixed!, minChargeMinor: min! },
    admin.email ?? admin.id, existing ? expected : null)
  if (!saved) return NextResponse.json({ error: 'Someone else saved this country since you loaded it. Reload the page.' }, { status: 409 })
  return NextResponse.json({ row: saved })
}

export async function POST(req: NextRequest) {
  const admin = await adminUser(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  let b: Record<string, unknown>
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }
  const truckId = typeof b.truckId === 'string' ? b.truckId : null
  const period = isPeriod(b.period) ? b.period : null
  if (!truckId || !period) return NextResponse.json({ error: 'Give a truck and a month (YYYY-MM-01).' }, { status: 400 })
  const store = await serverBillingStore()
  const catalog = await getPlanCatalog()
  const now = new Date()
  const truck = await store.truck(truckId)
  if (!truck) return NextResponse.json({ error: 'No such truck' }, { status: 404 })

  if (b.action === 'preview_month') {
    const ctx = await billingContextFor(store, truck, catalog, now, { forceSwitch: true })
    const c = await computeMonth(store, catalog, truck, { ...ctx, switchOn: true }, period, now)
    return NextResponse.json(c.ok ? { preview: c.usage, lines: c.result.lines } : { error: `Not billable: ${c.reason}` }, { status: c.ok ? 200 : 400 })
  }

  if (b.action === 'run_month_end_test') {
    const tb = await store.truckBilling(truckId)
    if (!tb?.billingTest) return NextResponse.json({ error: 'Only a billing TEST truck can be run by hand (truck_billing.billing_test).' }, { status: 403 })
    let processor = null
    try { processor = stripeBillingProcessor() } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 }) }
    const out = await runMonth(store, processor, catalog, { truckId, period, now, by: admin.email ?? admin.id, testRun: true })
    return NextResponse.json({ outcome: out })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
