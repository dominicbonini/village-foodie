// scripts/_compare-de-1-fixtures.cjs — compare-de-1's fixtures and renderer (a MODULE, not a harness): fictional competitors
// "Testanbieter A/B/C" (A fully verified; B's plan unverified; C nothing verified), country rows with the comparison switches,
// and the real page / twin / sitemap / llms / landing rendered over them. Shared by scripts/compare-de-1.cjs and
// scripts/compare-de-1-screens.cjs, so the screenshots show exactly what the harness proves. No real competitor, no network.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS module, like every scripts/*.cjs */
'use strict'
const path = require('path')
const LP1E = require('./_lp1e-fixtures.cjs')
const EF = require('./_europe-settings-fixtures.cjs')

const A = 'c0000000-0000-4000-8000-00000000000a', B = 'c0000000-0000-4000-8000-00000000000b', C = 'c0000000-0000-4000-8000-00000000000c'
const comp = (id, name, over = {}) => ({
  id, name, website: `https://${name.toLowerCase().replace(/[^a-z]/g, '')}.example`, focus: 'food_truck', payment_providers: null,
  pre_orders: 'yes', whatsapp: 'no', social_posts: 'unknown', own_domain: 'yes', ios_app: 'no', android_app: 'no',
  capacity_slots: 'yes', multi_location_schedule: 'unknown', kds: 'yes', pay_at_truck: 'yes', payment_methods: 'Karte, PayPal; bar', min_term: 'Keine',
  features_checked_on: '2026-10-20', features_verified_at: '2026-10-21T09:00:00Z', notes: null, updated_at: '2026-10-21T09:00:00Z', ...over,
})
const plan = (id, cid, name, over = {}) => ({
  id, competitor_id: cid, country_code: 'DE', plan_name: name, currency: 'EUR', price_hidden: false, monthly_minor: 4900, yearly_only: false,
  setup_minor: 0, truck_fee_bps: 0, truck_fee_fixed_minor: 0, customer_fee_bps: 0, customer_fee_fixed_minor: 0, card_mode: 'unknown', card_bps: null,
  card_fixed_minor: null, card_rate_assumed: true, order_cap: null, included_orders: null, overage_fixed_minor: null, vat: 'excl', status: 'counted',
  unclear: false, second_hand: false, source: 'research', source_url: `https://example.test/${id}`, checked_on: '2026-10-19', verified_at: '2026-10-21T09:00:00Z',
  verified_by: 'admin-1', notes: null, superseded_at: null, created_at: '2026-10-19T09:00:00Z', ...over,
})
const entry = (id, cid, pid, n, over = {}) => ({ id, country_code: 'DE', competitor_id: cid, primary_plan_id: pid, choose_when: `Sie Testfall ${n} sind.`,
  sort_order: n, verified_at: '2026-10-22T09:00:00Z', verified_by: 'admin-1', created_at: '2026-10-18T09:00:00Z', ...over })
const PA = 'p0000000-0000-4000-8000-00000000000a', PB = 'p0000000-0000-4000-8000-00000000000b', PC = 'p0000000-0000-4000-8000-00000000000c'
/** A verified (entry, plan, features); B's plan unverified; C nothing verified. */
const CMP_TABLES = () => ({
  competitors: [comp(A, 'Testanbieter A'), comp(B, 'Testanbieter B', { pre_orders: 'unknown' }), comp(C, 'Testanbieter C', { features_verified_at: null })],
  competitor_plans: [plan(PA, A, 'Basis', { truck_fee_bps: 250 }), plan(PB, B, 'Start', { verified_at: null, monthly_minor: 1900 }), plan(PC, C, 'Flat', { verified_at: null, monthly_minor: 9900, setup_minor: 29900 })],
  comparison_entries: [entry('e1', A, PA, 1), entry('e2', B, PB, 2), entry('e3', C, PC, 3, { verified_at: null, verified_by: null })],
})
/** global-players-1: CMP_TABLES plus till / POS players — P and R verified (R's entry has its own group label), Q a
 *  still-candidate POS player whose automatically added entry is unverified, and L a local-restaurant tool. */
const P = 'c0000000-0000-4000-8000-0000000000a1', Q = 'c0000000-0000-4000-8000-0000000000a2', RR = 'c0000000-0000-4000-8000-0000000000a3', L = 'c0000000-0000-4000-8000-0000000000a4'
const GLOBAL_TABLES = () => {
  const base = CMP_TABLES(), pos = { focus: 'pos', lifecycle: 'active', added_as_candidate: false }
  return {
    competitors: [...base.competitors, comp(P, 'Testkasse P', pos), comp(RR, 'Testkasse R', pos),
      comp(Q, 'Testkasse Q', { focus: 'pos', lifecycle: 'candidate', added_as_candidate: true, features_verified_at: null }), comp(L, 'Testlokal L', { focus: 'nearest_local' })],
    competitor_plans: [...base.competitor_plans, plan('pp', P, 'Kasse Plus', { monthly_minor: 3900 }), plan('pr', RR, 'Shop', { monthly_minor: 6900 }),
      plan('pq', Q, 'Kasse', { verified_at: null }), plan('pl', L, 'Lokal')],
    comparison_entries: [...base.comparison_entries, entry('e4', P, 'pp', 4), entry('e6', RR, 'pr', 6, { group_label: 'Kasse mit Online-Shop' }),
      entry('e5', Q, 'pq', 5, { verified_at: null, verified_by: null }), entry('e7', L, 'pl', 7)],
  }
}
const rowsWith = (status, apps = false) => EF.rowsWith(['DE']).map(r => r.countryCode === 'DE'
  ? { ...r, comparisonStatus: status, iosAppAvailable: apps, androidAppAvailable: apps }
  : { ...r, comparisonStatus: 'off', iosAppAvailable: r.countryCode === 'GB', androidAppAvailable: r.countryCode === 'GB' })


/** The bundle (page, twin route, sitemap, llms, landing) and one-request helpers, with admin as a switch. */
async function renderer(kit, tag = 'cde1') {
  const { REPO, h } = kit
  const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
  const ctx = LP1E.context(kit, REPO)
  const catalog = EF.CATALOG()
  const planTables = { plans: catalog.plans.map(LP1E.snake), plan_prices: catalog.prices.map(LP1E.snake), plan_features: catalog.features.map(LP1E.snake) }
  const ADMIN_STUB = "export async function adminUser() { return globalThis.__cmpAdmin ? { id: 'admin-1', email: null } : null }\nexport async function verifyAdmin() { return !!globalThis.__cmpAdmin }"
  const M = await ctx.bundle(tag, [
    "export { default, generateMetadata } from '@/app/[country]/[section]/[slug]/page'",
    "export { GET as twinGET } from '@/app/api/compare/[country]/[section]/[slug]/[format]/route'",
    "export { default as sitemap } from '@/app/sitemap'",
    "export { GET as llmsGET } from '@/app/llms.txt/route'",
    "export { default as Landing } from '@/app/[country]/page'",
    "export { clearPlanCatalogCache as __p } from '@/lib/plans-server'",
    "export { clearComparisonCache as __cmp, comparisonAddressOf } from '@/lib/comparison-flags'",
    "export { comparisonFooter } from '@/lib/comparison-server'",
    "export { loadState } from '@/lib/admin/pricing-check-actions'",
    // competitor-check-2: the German research is imported by lib/data-import (the button and importCompareResearch are gone).
    "export { importResearch, researchProblems } from '@/lib/data-import/research'",
    "export { PLACEHOLDER } from '@/lib/comparison'",
  ].join('\n'), { stubs: { '@/lib/auth/admin': ADMIN_STUB } })
  const SEG = { country: 'de', section: 'vergleich', slug: 'foodtruck-bestellsystem' }
  async function req({ status = 'admin', apps = false, admin = false, tables = {} }, fn) {
    globalThis.__cmpAdmin = admin
    try {
      return await ctx.withReq({ rows: rowsWith(status, apps), tables: { ...planTables, ...CMP_TABLES(), ...tables } }, async () => { M.__p(); M.__cmp(); return fn() })
    } finally { delete globalThis.__cmpAdmin }
  }
  async function page(o = {}) {
    return req(o, async () => {
      const args = { params: Promise.resolve(o.params ?? SEG), searchParams: Promise.resolve(o.search ?? {}) }
      let meta = null, html = null, notFound = false
      try { meta = await M.generateMetadata(args) } catch (e) { if (e?.message === 'notFound') notFound = true; else throw e }
      if (!notFound) { try { html = await ctx.prerender(h(M.default, args)) } catch (e) { if (e?.message === 'notFound') notFound = true; else throw e } }
      return { meta, html, notFound }
    })
  }
  async function twin(format, o = {}) {
    return req(o, async () => {
      const q = o.query ? `?${o.query}` : ''
      const r = await M.twinGET(new NextRequest(`http://hatchgrab.localhost:3000/de/vergleich/foodtruck-bestellsystem.${format}${q}`, { headers: { host: 'hatchgrab.localhost:3000' } }), { params: Promise.resolve({ ...SEG, format }) })
      return { status: r.status, headers: Object.fromEntries(r.headers.entries()), body: await r.text() }
    })
  }
  const landing = (status, seg = 'de') => req({ status }, async () => ctx.prerender(h(M.Landing, { params: Promise.resolve({ country: seg }), searchParams: Promise.resolve({}) })))
  return { M, ctx, catalog, SEG, req, page, twin, landing, sitemap: o => req(o, () => M.sitemap()), llms: o => req(o, async () => (await M.llmsGET()).text()) }
}

module.exports = { A, B, C, PA, PB, PC, comp, plan, entry, CMP_TABLES, GLOBAL_TABLES, rowsWith, renderer }
