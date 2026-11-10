#!/usr/bin/env node
// scripts/billing-1-db-read.cjs — billing-1 (10 November 2026): the DATABASE BillingStore and the live-path GATE against the real
// database, READ ONLY. BY HAND ONLY (harnesses.json `operational_read_only`: it reads production).
//   node scripts/billing-1-db-read.cjs
// It proves the store's reads on the shapes the migration created (the switch, 44 country rows, a test truck's October
// pre-orders against a direct count), the month a test truck WOULD owe (computed in memory, never saved), and that the real gate
// on Pizzeria Gusto answers exactly "billing off" — and it proves nothing was written: every billing table's row count is the same
// after as before. The environment is loaded by Next's own loader (@next/env); no value is ever printed.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const REPO = path.resolve(__dirname, '..')
require(path.join(REPO, 'node_modules/@next/env')).loadEnvConfig(REPO, false, { info() {}, error() {} })

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 900)}` : '')) } }

;(async () => {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const out = path.join(REPO, 'node_modules/.cache', `billing-1-db-read-${process.pid}.cjs`)   // inside the repo, so its externals resolve
  await esbuild.build({
    stdin: { contents: "export * as St from '@/lib/billing/store'; export * as E from '@/lib/billing/engine'; export * as G from '@/lib/billing/gate'; export * as R from '@/lib/billing/rules'; export * as PS from '@/lib/plans-server'", resolveDir: REPO, loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', outfile: out, logLevel: 'silent', alias: { '@': REPO }, external: ['@supabase/supabase-js', 'stripe'],
    plugins: [{ name: 'server-only', setup(b) { b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'so', namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: '' })) } }],
  })
  const M = require(out)
  const { createClient } = require(path.join(REPO, 'node_modules/@supabase/supabase-js'))
  const db = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const TABLES = ['country_billing', 'operator_billing', 'truck_billing', 'billing_usage', 'billing_usage_orders', 'billing_invoices', 'billing_charges', 'truck_plan_history']
  const counts = async () => Object.fromEntries(await Promise.all(TABLES.map(async x => [x, (await db.from(x).select('*', { count: 'exact', head: true })).count])))
  const before = await counts()

  const store = M.St.supabaseBillingStore(db)
  const sw = await store.switches()
  t('the switch: off, pause after 5 days', sw.enabled === false && sw.pauseAfterDays === 5, sw)
  const cbs = await store.listCountryBilling()
  t('44 country rows; BR MX MY SG TH are (b)', cbs.length === 44 && cbs.filter(c => c.paymentModel === 'billed_online').map(c => c.countryCode).join(' ') === 'BR MX MY SG TH', cbs.length)
  const gb = await store.countryFacts('GB')
  t('GB facts: GBP, en-GB, the platform fee allowed and (today) off', gb.currency === 'GBP' && gb.locale === 'en-GB' && gb.platformFeeAllowed && !gb.platformFeeEnabled, gb)
  const truck = await store.truck('test-truck-us')
  t('the US test truck reads (US, USD, a trial)', truck && truck.country === 'US' && truck.currency === 'USD' && truck.plan === 'trial', truck && { country: truck.country, plan: truck.plan })
  t('no billing row for it (defaults apply)', (await store.truckBilling('test-truck-us')) === null)
  const tz = truck.timezone || 'Europe/London'
  const { start, end } = M.R.periodBounds('2026-10-01', tz)
  const orders = await store.usageOrders('test-truck-us', start, end)
  const { data: direct } = await db.from('orders').select('order_key, placed_at, created_at, status').eq('truck_id', 'test-truck-us').eq('source', 'web')
  const directN = (direct || []).filter(o => { const p = Date.parse(o.placed_at || o.created_at); return p >= Date.parse(start) && p < Date.parse(end) }).length
  t(`October (${tz}) pre-orders read for it: ${orders.length}, a direct count says ${directN}; each with its food amount`, orders.length === directN && orders.length > 0 && orders.every(o => typeof o.foodMinor === 'number'), orders.length)
  const catalog = await M.PS.getPlanCatalog()
  const asEnded = { ...truck, trial_expires_at: '2026-09-30T23:59:59Z' }
  const ctx = { ...(await M.E.billingContextFor(store, asEnded, catalog, new Date())), switchOn: true, truckBilling: { postPay: false, billingTest: true, paymentMethodState: 'valid', paymentMethodType: 'card' } }
  const c = await M.E.computeUsage(store, catalog, asEnded, ctx, '2026-10-01', new Date())
  const counted = orders.filter(o => M.R.countsAsPreorder(o)).reduce((s2, o) => s2 + M.R.countedValueOf(o), 0)
  t('its October usage computed in memory (as if its trial had ended on 30 September; NOT saved): Pay as you go, 0.99% of every counted pre-order',
    c.ok && c.usage.planKey === 'payg' && c.usage.countedMinor === counted && c.usage.feeDueMinor === c.lines.reduce((s2, l) => s2 + l.feeMinor, 0), c.ok ? c.usage : c)
  const pm = M.R.planMonth({ truck: asEnded, history: await store.planHistory('test-truck-us'), catalog, countryCode: 'US', tz, period: '2026-11-01', vanCount: await store.vanCount('test-truck-us'), upTo: Date.now() })
  const fig = M.R.settleCharge({ planMinor: pm.advance.monthlyMinor, vansMinor: pm.advance.vansMinor, usageFeeMinor: c.ok ? c.usage.feeBilledMinor : 0, minChargeMinor: (await store.countryBilling('US')).minChargeMinor })
  t('its 1 November charge as it would be: November\'s plan in advance + October\'s fee in arrears', fig.amountDueMinor === pm.advance.monthlyMinor + pm.advance.vansMinor + (c.ok ? c.usage.feeBilledMinor : 0), fig)
  console.log(`      1 November as if billed: plan ${pm.advance.planKey} ${pm.advance.monthlyMinor} + October's fee ${c.ok ? c.usage.feeBilledMinor : '?'} (${c.ok ? c.usage.preorderCount : '?'} counted of ${orders.length}) → ${fig.outcome} ${fig.amountDueMinor} USD (minimum ${fig.minChargeMinor})`)
  t('no plan history for it (nothing recorded while billing is off)', (await store.planHistory('test-truck-us')).length === 0)
  const ids = await store.candidateTruckIds()
  t(`billing candidates (customers + billing test trucks): ${ids.length}`, Array.isArray(ids))
  M.G.__resetBillingSwitchCache()
  const gusto = await M.G.billingGateForTruck({ id: 'pizzeria-gusto' }, catalog)
  t('the real gate on Pizzeria Gusto: exactly "billing off" (nothing paused, Pay at Hatch as its plan says)', JSON.stringify(gusto) === JSON.stringify(M.G.BILLING_GATE_OFF), gusto)
  t('the real capture fee on Gusto: none', (await M.G.applicationFeeAtCapture({ orderKey: '00000000-0000-0000-0000-000000000000', truckId: 'pizzeria-gusto', captureMinor: 1000, catalog })) === null)
  const after = await counts()
  t('NOTHING WRITTEN: every billing table has the same row count after as before', JSON.stringify(before) === JSON.stringify(after), { before, after })
  fs.rmSync(out, { force: true })
  console.log(`\n${fail === 0 ? '✅' : '🔴'} billing-1 (database, read only): ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})().catch(e => { console.error('🔴 crashed:', e.message); process.exit(1) })
