#!/usr/bin/env node
// US layout audit, group A (customer) — step 1: server-render the REAL customer pages, GB and US, from fixtures.
//   node scripts/us-layout-audit/A-customer/render.cjs <workDir>
// The render kit's state patches start each page in a given state (scripts/screenshots/order-us.cjs's method);
// nothing reaches a database or the network (the kit stubs Supabase; the custom-domain page reads an in-memory
// table). Writes <workDir>/<state>-<gb|us>.html and manifest.json. Step 2 (shoot.cjs) paints them in WebKit.
//
// ⚠️ TWO "PROJECTION" STATES (sched-proj, domain-proj): the public truck page and the embed/custom-domain page
// pass NO time settings to TruckListCard, so a US truck's events print in the UK's 24-hour style there today.
// To show what the US style would do to those layouts, a BUNDLE-TIME patch (never the file on disk) passes the
// US settings to that one prop. Those shots are labelled as projections in the findings.
const fs = require('fs'); const path = require('path')
const F = require('./fixtures.cjs')
const { REPO, C } = F
const WORK = path.resolve(process.argv[2] || '')
if (!process.argv[2]) { console.error('usage: render.cjs <workDir>'); process.exit(2) }
fs.mkdirSync(WORK, { recursive: true })
const kit = require(path.join(REPO, 'scripts/_render-kit.cjs'))({ cacheTag: 'usaudit-A-customer' })

;(async () => {
  const OP = 'app/trucks/[slug]/order/page.tsx'
  const ORDER_STATES = ['truck', 'menu', 'events', 'event', 'eventLoading', 'loading', 'basket', 'appliedDeals', 'isScrolled', 'activeCategory', 'noEvents',
    'formSheetOpen', 'payByCard', 'tipSel', 'summaryExpanded', 'sheetSummaryExpanded', 'name', 'email', 'phone', 'slotHour', 'slotMinute', 'availableSlots', 'asapChosen',
    'submitted', 'submittedOrderId', 'submittedAutoAccepted', 'submittedConfirmedSlot', 'submittedRequestedSlot', 'submittedCharges', 'submittedTotal']
  const O = await kit.bundle('order', `export { default as OrderPage } from '@/${OP}'\nexport { I18nContext } from '@/lib/i18n/use-t'\nexport * as E from '@/lib/order-charges'\nexport * as R from '@/lib/order-charge-rules'`, {
    patches: [{ file: OP, states: ORDER_STATES }, { file: OP, from: 'const { slug } = use(params)', to: 'const { slug } = params' }],
  })
  const MP = 'app/order/[id]/manage/page.tsx'
  const M = await kit.bundle('manage', `export { default as ManagePage } from '@/${MP}'`, { patches: [{ file: MP, states: ['order', 'loading'] }] })
  const TC = 'app/trucks/[slug]/TruckClient.tsx'
  const T = await kit.bundle('truckclient', `export { default as TruckClient } from '@/${TC}'\nexport { createSlug } from '@/lib/utils'`, {
    patches: [{ file: TC, from: '<TruckListCard key={event.id} event={event} slug={slug} />', to: '<TruckListCard key={event.id} event={event} slug={slug} time={globalThis.__projTime} />' }],
    alias: { '@/hooks/useVillageData': 'scripts/us-layout-audit/A-customer/stub-village-data.cjs' },
    stubs: { 'posthog-js/react': 'export const usePostHog = () => null', 'next/script': 'export default function Script() { return null }', 'next/dynamic': 'export default function dynamic(_l, o) { return function D() { return o && o.loading ? o.loading() : null } }' },
  })
  const ES = 'app/embed/[slug]/EmbedSchedule.tsx'
  const D = await kit.bundle('domain', `export { default as DomainPage } from '@/app/domain/page'`, {
    patches: [{ file: ES, states: ['events'] }, { file: ES, from: 'orderOrigin={orderOrigin}\n        />', to: 'orderOrigin={orderOrigin}\n          time={globalThis.__projTime}\n        />' }],
    stubs: { 'next/headers': "export async function headers() { return new Map([['host', 'schedule.pizzakitchen.test']]) }" },
  })

  const manifest = []
  const write = (name, code, body, lang) => {
    fs.writeFileSync(path.join(WORK, `${name}-${code.toLowerCase()}.html`), body)
    manifest.push({ name, code, lang })
  }

  for (const code of ['GB', 'US']) {
    const c = C[code]
    kit.setNow(c.nowIso); kit.setDeviceTz(c.tz); kit.setDeviceLocale(c.locale)
    const rules = O.R.resolveChargeRules(F.countryRow(code), F.truckChargeFields(code))
    const checkout = O.E.checkoutRulesFrom(rules)   // null for GB, as /api/menu sends none for a UK truck
    const truck = { id: 'test-truck', name: 'Pizza Kitchen', logo: null, mode: 'village', venue_name: null, time_selection_enabled: true, paused: false, plan: 'pro',
      ordering_available: true, card_payments_ready: true, allergen_display_mode: 'per_dish', money: c.money, time: c.time, phone: c.phone, ...(checkout ? { checkout } : {}) }
    const E = F.events(c)
    const base = { truck, menu: F.menu, events: [E.window, E.third], event: E.window, eventLoading: false, loading: false, noEvents: false, isScrolled: false, activeCategory: 'Pizza',
      basket: F.basket, appliedDeals: [], summaryExpanded: true, sheetSummaryExpanded: true, formSheetOpen: false, payByCard: true, tipSel: code === 'US' ? 2000 : 'none',
      name: 'Ann Example', email: 'ann@example.test', phone: '', slotHour: '12', slotMinute: '45', availableSlots: F.slots, asapChosen: false, submitted: false }
    // What the server would store: the same engine on the same basket, card + 20 % tip (US).
    const foodMinor = Math.round(F.foodMajor * 100)
    const charges = O.E.computeOrderCharges({ foodMinor, rules, channel: 'online_card', tip: code === 'US' ? { kind: 'percent', bps: 2000 } : null })
    const snapshot = checkout ? charges.snapshot : null
    const totalMajor = charges.totalMinor / 100
    const order = st => {
      globalThis.__ms = st
      try { return kit.renderStatic(kit.h(O.I18nContext.Provider, { value: { locale: c.locale, setLocale() {} } }, kit.h(O.OrderPage, { params: { slug: 'test-kitchen' } }))) }
      finally { delete globalThis.__ms }
    }
    write('order-menu', code, order({ ...base, summaryExpanded: false }), c.locale)
    write('order-basket', code, order(base), c.locale)
    write('order-typical', code, order({ ...base, summaryExpanded: false, event: E.typical, events: [E.typical, E.window] }), c.locale)
    write('order-midnight', code, order({ ...base, summaryExpanded: false, event: E.midnight, events: [E.midnight, E.window] }), c.locale)
    write('order-chooser', code, order({ ...base, event: null, events: [E.window, E.third, E.midnight] }), c.locale)
    write('order-sheet', code, order({ ...base, formSheetOpen: true }), c.locale)
    write('order-sheet-asap', code, order({ ...base, formSheetOpen: true, asapChosen: true, slotHour: '', slotMinute: '' }), c.locale)
    const sub = { ...base, submitted: true, submittedOrderId: '1234', submittedAutoAccepted: true, submittedConfirmedSlot: '12:45', submittedRequestedSlot: '12:45', submittedCharges: snapshot, submittedTotal: totalMajor }
    write('order-confirm', code, order(sub), c.locale)
    write('order-confirm-pending', code, order({ ...sub, submittedAutoAccepted: false, submittedConfirmedSlot: null }), c.locale)

    // ── manage-my-order ──
    const items = F.basket.map(b => ({ name: b.menuItem.name, quantity: b.quantity, unit_price: b.menuItem.price + b.modifiers.reduce((s, m) => s + m.price, 0), modifiers: b.modifiers }))
    const mOrder = { money: c.money, time: c.time, id: '1234', status: 'confirmed', customer_name: 'Ann Example', slot: '12:45', event_date: '2026-09-30', items, deals: [],
      total: totalMajor, payment_status: 'paid', truck_name: 'Pizza Kitchen', venue_name: 'Riverside Park', allow_cancellation: true, cancellation_cutoff_mins: 30, ...(snapshot ? { charges: snapshot } : {}) }
    const manage = (o) => { globalThis.__ms = { order: o, loading: false }; try { return kit.renderStatic(kit.h(O.I18nContext.Provider, { value: { locale: c.locale, setLocale() {} } }, kit.h(M.ManagePage))) } finally { delete globalThis.__ms } }
    write('manage', code, manage(mOrder), c.locale)
    write('manage-longvenue', code, manage({ ...mOrder, venue_name: 'Pier 13 Waterfront Market' }), c.locale)

    // ── the public truck page (TruckClient) ──
    const slug = T.createSlug('Pizza Kitchen')
    const vEv = e => ({ id: e.id, date: e.date, startTime: e.start_time, endTime: e.end_time, truckName: 'Pizza Kitchen', venueName: e.venue_name, village: e.village, postcode: e.postcode, status: e.status, source: 'operator', orderLinkHg: true, orderLinkVf: true })
    globalThis.__vd = { loading: false, loadError: false, refetch() {}, mapEvents: [E.window, E.third, E.midnight].map(vEv),
      allTrucks: [{ cleanKey: slug, rawName: 'Pizza Kitchen', type: 'Pizza', logoUrl: null, menuUrl: 'https://example.test/menu', phoneNumber: code === 'US' ? '(201) 555-0123' : '07700 900123', websiteUrl: 'https://example.test', orderUrl: null }] }
    // The page passes discovery={country === 'GB'}; the truck's language is its country's.
    const tc = (proj) => { globalThis.__projTime = proj ? c.time : undefined; try { return kit.renderStatic(kit.h(T.TruckClient, { slug, locale: c.locale, discovery: code === 'GB' })) } finally { delete globalThis.__projTime } }
    write('sched', code, tc(false), c.locale)
    if (code === 'US') write('sched-proj', code, tc(true), c.locale)

    // ── the custom-domain page (its body is EmbedSchedule) ──
    globalThis.__harnessDb = kit.fakeDb({ trucks: [{ id: 'test-truck', name: 'Pizza Kitchen', slug: 'test-kitchen', logo_storage_path: null, plan: 'pro', feature_overrides: { embed_schedule: true }, trial_expires_at: null, active: true, custom_domain: 'schedule.pizzakitchen.test', custom_domain_verified_at: '2026-09-01T00:00:00Z' }] })
    const dom = async (proj) => {
      globalThis.__ms = { events: [E.window, E.third, E.midnight].map(vEv) }; globalThis.__projTime = proj ? c.time : undefined
      try { const el = await kit.quietAsync(() => D.DomainPage()); return kit.renderStatic(el) } finally { delete globalThis.__ms; delete globalThis.__projTime }
    }
    write('domain', code, await dom(false), c.locale)
    if (code === 'US') write('domain-proj', code, await dom(true), c.locale)
    delete globalThis.__harnessDb
    console.log(code, 'food', F.foodMajor.toFixed(2), 'total', totalMajor.toFixed(2), checkout ? JSON.stringify(snapshot) : '(no checkout)')
  }
  fs.writeFileSync(path.join(WORK, 'manifest.json'), JSON.stringify(manifest, null, 1))
  console.log('rendered', manifest.length, 'pages into', WORK)
})().catch(e => { console.error(e); process.exit(1) })
