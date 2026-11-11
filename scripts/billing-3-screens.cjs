#!/usr/bin/env node
// scripts/billing-3-screens.cjs — billing-3 (11 November 2026): the three new Billing views, rendered for real in WebKit (Safari's
// engine) on a localhost server and photographed for docs/billing-3-report.md — billing-2-screens.cjs's method, unchanged. BY HAND
// (needs a local WebKit; NOT a build — the app's Tailwind is compiled from app/(app)/globals.css):  node scripts/billing-3-screens.cjs
// The REAL components/manage/BillingScreen.tsx is bundled with esbuild and mounted with the real providers. Every screen's data is
// built by the REAL engine and view (lib/billing/*) over the in-memory store for a billing_test truck — no database, no network;
// the page's /api/manage/billing calls (the plan-change preview) are answered from the same fixtures.
// Writes docs/billing-3/<state>-<width>.png at 390 (phone) and 1280 (desktop):
//   trial-ended (notice F above the tab, the Payment method card's new line) · trial-change-plan (the trial's Change plan window, Pro
//   selected) · pay-at-hatch (a paying truck that chose Pay at Hatch, the "How customers pay for pre-orders" card)
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http')
const REPO = path.resolve(__dirname, '..')
const OUT = path.join(REPO, 'docs/billing-3')
fs.mkdirSync(OUT, { recursive: true })
const kit = require('./_render-kit.cjs')({ cacheTag: 'billing-3-screens' })

async function css() {
  const postcss = require(require.resolve('postcss', { paths: [REPO] }))
  const tw = require(require.resolve('@tailwindcss/postcss', { paths: [REPO] }))
  const src = fs.readFileSync(path.join(REPO, 'app/(app)/globals.css'), 'utf8').replace(/@import "leaflet[^"]*";\n?/, '')
  return (await postcss([tw({ base: REPO })]).process(src, { from: path.join(REPO, 'app/(app)/globals.css') })).css
}

async function bundleBrowser(dir, entrySrc) {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const entry = path.join(dir, 'entry.tsx')
  fs.writeFileSync(entry, entrySrc)
  await esbuild.build({
    entryPoints: [entry], bundle: true, outfile: path.join(dir, 'bundle.js'), format: 'iife', platform: 'browser', jsx: 'automatic', target: 'es2020',
    logLevel: 'error', alias: { '@': REPO }, nodePaths: [path.join(REPO, 'node_modules')], banner: { js: 'window.process = window.process || { env: {} };' },
    define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_SUPABASE_URL': '"http://127.0.0.1:9"', 'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': '"harness"' },
    plugins: [{ name: 'stubs', setup(b) {
      b.onResolve({ filter: /^next\/(navigation|link|image)$/ }, a => ({ path: a.path, namespace: 'stub' }))
      b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const useRouter = () => ({ push(){}, replace(){} }); export const usePathname = () => "/"; export const useSearchParams = () => new URLSearchParams(""); export default function X(p){ return p.children ?? null }', loader: 'js' }))
    } }],
  })
  return fs.readFileSync(path.join(dir, 'bundle.js'), 'utf8')
}

;(async () => {
  // ── the fixtures, from the real engine ──
  const B = await kit.bundle('billing-3-screens-data', ["export * as V from '@/lib/billing/view'", "export * as S from '@/lib/billing/memory-store'", "export * as SS from '@/lib/billing/screen-server'"].join('\n'))
  const plan = (key, name, sortOrder, o = {}) => ({ key, name, description: '', sortOrder, isPublic: false, isInternal: false, isTrial: false, isSignupDefault: false,
    isExpiryFallback: false, isDemo: false, payAtHatchAllowed: true, active: true, includedVans: 1, trialMonths: null, isHighlighted: false, subtitle: null, ...o })
  const CATALOG = { plans: [plan('payg', 'Pay as you go', 1, { isPublic: true, isExpiryFallback: true }), plan('pro', 'Pro', 2, { isPublic: true }), plan('unlimited', 'Unlimited', 3, { isPublic: true }),
    plan('trial', 'Free trial', 4, { isInternal: true, isTrial: true, trialMonths: 3 })], features: [],
    prices: [['payg', 0, 0, 99], ['pro', 2900, 400000, 99], ['unlimited', 6900, null, 0]].map(([k, m, inc, fee]) => ({ planKey: k, countryCode: 'GB', monthlyMinor: m, includedOnlineMinor: inc, feeBps: fee, extraVanMonthlyMinor: m, offered: true, trialEnd: false })) }
  const world = (planKey, trialEnd, tb = {}) => {
    const d = B.S.emptyMemoryData()
    d.switches = { enabled: false, pauseAfterDays: 5, suspendWarningDays: 6 }
    d.countryFacts = [{ countryCode: 'GB', currency: 'GBP', locale: 'en-GB', platformFeeEnabled: false, platformFeeAllowed: true }]
    d.countryBilling = [{ countryCode: 'GB', paymentModel: 'fee_from_payment', postPaySurchargeBps: 0, postPaySurchargeFixedMinor: 0, minChargeMinor: 500, lateFeeMinor: 0, updatedAt: 'x' }]
    d.trucks = [{ id: 'test-truck', name: 'Pizza Kitchen', slug: 'test-kitchen', country: 'GB', currency: 'GBP', timezone: 'Europe/London', plan: planKey, trial_expires_at: trialEnd, is_customer: false, operator_id: 'op' }]
    d.operators = [{ id: 'op', email: 'owner@example.test', name: 'Sam', firstName: 'Sam' }]
    d.truckBilling = [{ truckId: 'test-truck', postPay: false, billingTest: true, paymentMethodState: 'none', paymentMethodType: null, stripePaymentMethodId: null, stripeSetupIntentId: null,
      paymentMethodLabel: null, paymentMethodUpdatedAt: null, paymentMethodLivemode: null, status: null, statusReason: null, statusChangedAt: null, pendingPlanKey: null, pendingPlanFrom: null, trialEndPlanKey: null, ...tb }]
    return d
  }
  const card = { paymentMethodState: 'valid', paymentMethodType: 'card', stripePaymentMethodId: 'pm_x', paymentMethodLabel: 'visa •••• 4242' }
  const inv = (d, o) => {
    const id = `inv-${d.invoices.length + 1}`
    d.charges.push({ id: `c-${id}`, truckId: 'test-truck', period: o.period, kind: o.kind ?? 'monthly', ref: o.kind && o.kind !== 'monthly' ? 'r' : '', currency: 'GBP', planKey: o.planKey ?? 'pro', fromPlanKey: null,
      planMinor: o.amount, planDays: 30, periodDays: 30, vansMinor: 0, usagePeriod: o.usage ?? null, usageFeeMinor: o.usage ? 495 : 0, surchargeMinor: 0, carriedInMinor: 0, amountDueMinor: o.amount,
      chargedMinor: o.amount, carriedOutMinor: 0, carriedInto: null, minChargeMinor: 500, state: 'invoiced', inputsDigest: 'x', computedAt: o.at })
    d.invoices.push({ id, chargeId: `c-${id}`, truckId: 'test-truck', period: o.period, currency: 'GBP', amountMinor: o.amount, livemode: false, stripeInvoiceId: `in_${id}`, status: o.status,
      dueAt: o.at, attemptCount: o.failed ? 1 : 0, lastError: null, hostedInvoiceUrl: '#pay', createdAt: o.at, finalizedAt: o.at, paidAt: o.status === 'paid' ? o.at : null, lateFeeMinor: null,
      replacedStripeInvoiceId: null, firstFailedAt: o.failed ? o.at : null, invoicePdfUrl: '#pdf' })
  }
  const history = d => d.invoices.length
  void history
  const paying = (status, tb = {}) => {
    const d = world('pro', null, { ...card, ...tb })
    inv(d, { period: '2026-10-01', amount: 2900, status: 'paid', at: '2026-10-01T09:00:00Z' })
    inv(d, { period: '2026-11-01', amount: 3395, status: 'paid', at: '2026-11-01T09:00:00Z', usage: '2026-10-01' })
    inv(d, { period: '2026-11-01', amount: 1933, status: 'paid', at: '2026-11-11T12:00:00Z', kind: 'upgrade', planKey: 'unlimited' })
    if (status) inv(d, { period: '2026-12-01', amount: 2900, status: 'failed', failed: true, at: '2026-12-01T09:00:00Z', usage: '2026-11-01' })
    return d
  }
  const view = async (d, iso) => (await B.SS.loadBillingScreen(B.S.memoryBillingStore(d), CATALOG, 'test-truck', new Date(iso)))
  const states = {
    // The trial ended 31 Dec; no card; 3 January — online ordering paused (notice F).
    'trial-ended': await view(world('trial', '2026-12-31T23:59:59Z'), '2027-01-03T12:00:00Z'),
    // On the trial, 11 November, a card added — the Change plan window opens on the trial's plan; the shot selects Pro.
    'trial-change-plan': await view(world('trial', '2026-12-31T23:59:59Z', card), '2026-11-11T12:00:00Z'),
    // A paying truck that chose Pay at Hatch (post-pay).
    'pay-at-hatch': await view(paying(false, { postPay: true }), '2026-11-20T12:00:00Z'),
  }
  const previews = {}
  const notices = [states['trial-ended'].view.notice]
  // ── the page ──
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-b3-'))
  const js = await bundleBrowser(tmp, `
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { BillingScreen, BillingNoticeStrip } from '@/components/manage/BillingScreen'
import { CountrySettingsProvider } from '@/components/CountrySettingsProvider'
import { TruckTimeContext } from '@/components/TruckTimeContext'
import { PlanCatalogProvider } from '@/components/PlanCatalogProvider'
import { I18nContext } from '@/lib/i18n/use-t'
const D = (window as any).__DATA
const settings: any = { countryCode: 'GB', name: 'United Kingdom', currency: 'GBP', locale: 'en-GB' }
const time = { timeZone: 'Europe/London', locale: 'en-GB', timeFormat: '24h', dateOrder: 'dmy', weekStart: 'monday' } as any
function App() {
  const which = new URLSearchParams(location.search).get('s') || 'paying'
  const [v, setV] = useState(D.views[which])
  return (
    <I18nContext.Provider value={{ locale: 'en-GB', setLocale: () => {} }}>
      <CountrySettingsProvider settings={settings}><TruckTimeContext.Provider value={time}><PlanCatalogProvider catalog={D.catalog}>
        <div style={{ padding: 16, maxWidth: 760 }}>
          {v.notice && <BillingNoticeStrip notice={v.notice} onOpen={() => {}} />}
          <BillingScreen token="harness" view={v} setView={setV} />
        </div>
      </PlanCatalogProvider></TruckTimeContext.Provider></CountrySettingsProvider>
    </I18nContext.Provider>
  )
}
createRoot(document.getElementById('root')!).render(<App />)
`)
  const data = { views: Object.fromEntries(Object.entries(states).map(([k, s]) => [k, s.view])), catalog: CATALOG, notices }
  const styles = await css()
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/app.js')) { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(js) }
    if (req.url.startsWith('/api/manage/billing')) {
      let body = ''; req.on('data', c => { body += c }); req.on('end', () => {
        const b = JSON.parse(body || '{}')
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify(b.action === 'plan_preview' ? previews[b.planKey] ?? { direction: 'in_trial' } : { error: 'harness' }))
      }); return
    }
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${styles}</style></head><body class="bg-slate-50"><div id="root"></div><script>window.__DATA=${JSON.stringify(data)}</script><script src="/app.js"></script></body></html>`)
  })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}`
  const { webkit } = require('playwright')
  const browser = await webkit.launch()
  const shots = []
  let bad = 0
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    for (const s of ['trial-ended', 'pay-at-hatch']) {
      await page.goto(`${base}/?s=${s}`); await page.waitForTimeout(150)
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      if (scroll > 0) { bad++; console.log(`  🔴 ${s} @${width}: the page scrolls sideways by ${scroll}px`) }
      const file = `${s}-${width}.png`; await page.screenshot({ path: path.join(OUT, file), fullPage: true }); shots.push(file)
    }
    // the pre-orders card on its own, as well as in the whole page above
    await page.goto(`${base}/?s=pay-at-hatch`); await page.waitForTimeout(150)
    { const file = `pay-at-hatch-card-${width}.png`; await page.locator('[data-billing-card="pre-orders"]').screenshot({ path: path.join(OUT, file) }); shots.push(file) }
    await page.goto(`${base}/?s=trial-change-plan`); await page.waitForTimeout(150)
    await page.click('text=Change plan'); await page.click('[data-plan-choice="pro"]'); await page.waitForTimeout(200)
    { const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      if (scroll > 0) { bad++; console.log(`  🔴 trial-change-plan @${width}: the page scrolls sideways by ${scroll}px`) }
      const file = `trial-change-plan-${width}.png`; await page.screenshot({ path: path.join(OUT, file), fullPage: true }); shots.push(file) }
    // what the page says, for the report
    const words = await page.evaluate(() => document.querySelector('[data-billing-modal="change-plan"]')?.innerText ?? '')
    if (width === 390) console.log('  · the trial window reads: ' + words.replace(/\n+/g, ' | '))
    await page.close()
  }
  await browser.close(); server.close()
  console.log(`${bad ? '🔴' : '✅'} billing-3-screens: ${shots.length} screenshots in docs/billing-3/ (${bad} problems)`)
  process.exit(bad ? 1 : 0)
})().catch(e => { console.error('🔴 crashed:', e); process.exit(1) })
