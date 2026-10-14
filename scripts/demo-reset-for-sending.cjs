#!/usr/bin/env node
// scripts/demo-reset-for-sending.cjs — "Reset for sending" on an outreach demo (14 October 2026).
//   node scripts/demo-reset-for-sending.cjs      (≈ 8 s: one bundle, an in-memory Supabase with real writes)
//
// WHAT DOMINIC ASKED FOR: he builds a demo, checks the link and changes a few settings, and sends it later.
// Whenever the truck opens it, the demo event and orders must start fresh, as if built at that moment — with
// every setting he changed kept.
// 🔴 FAILURE MODE: the first-open restart (T2) is claimed by the FIRST non-admin open. A preview on a phone or
//    in a private window wins it, so the truck's open hours later restarts nothing and shows late orders.
//    And a restart built a bare new event, so the per-event choices made while checking it were lost.
//
// HOW: the REAL `rearmDemoFirstOpen`, `claimDemoFirstOpen`, `restartDemoService` and `provisionDemo` bundled
// from lib/, against scripts/_fake-pg.cjs, which stores rows. Nothing touches the database or the network.
const kit = require('./_render-kit.cjs')({ cacheTag: 'demo-reset-for-sending' })
const { makeFakePg } = require('./_fake-pg.cjs')
const SEEDS = require('./_country-settings-gb.cjs')
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))

let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${String(detail).slice(0, 400)}` : ''}`) } }
const head = s => console.log(`\n── ${s}`)

const TRUCK = 'demo-tacoman'
const BUILT = '2026-10-14T12:00:00.000Z'      // built and checked at 13:00 London
const OPENED = new Date('2026-10-14T14:10:00Z') // the truck opens it at 15:10 London
const fixture = (over = {}) => ({
  country_settings: [snake(SEEDS.gbFromSeed())],
  trucks: [{ id: TRUCK, name: 'Tacoman', slug: 'demo-tacoman', dashboard_token: 'tok-demo', country: 'GB', currency: 'GBP', plan: 'demo', timezone: null, auto_accept: true }],
  truck_vans: [{ id: 'van-1', truck_id: TRUCK, name: 'Van 1', active: true, collection_interval_mins: 10 }],
  demo_sessions: [{ truck_id: TRUCK, public_ref: 'tacoman', discovery_truck_id: 'dt-1', first_opened_at: '2026-10-14T12:20:00.000Z' }],
  menu_categories: [{ id: 'cat-1', truck_id: TRUCK, name: 'Tacos', slug: 'tacos', is_active: true, prep_secs: 360, batch_size: 3, counts_toward_capacity: true, sort_order: 1 }],
  menu_items_db: [{ id: 'item-1', truck_id: TRUCK, name: 'Birria Taco', price: 5, category_id: 'cat-1', is_active: true, is_available: true, stock_count: null }],
  bundles_db: [{ id: 'deal-1', truck_id: TRUCK, name: 'Taco Tuesday', apply_to_new_events: false }],
  truck_events: [{
    id: 'ev-checked', truck_id: TRUCK, event_date: '2026-10-14', start_time: '13:00:00', end_time: '16:00:00', status: 'open',
    venue_name: 'Tacoman at the Market', venue_address: '1 Market Sq', customer_note: 'Look for the green van',
    event_type_id: 'type-market', order_ready_override: 'collect', buzzer_prompt: true, takes_cash_override: false,
    offline_protection_override: true, offline_protection_mode_override: 'reject', offline_auto_reject_mins_override: 10,
    collection_interval_mins_override: 10, price_mode: 'percent', price_amount: 10, price_rounding: 'nearest_50',
    opened_at: BUILT, confirmed_at: BUILT,
  }],
  event_deals: [{ id: 'ed-1', event_id: 'ev-checked', bundle_id: 'deal-1', active: true }],
  event_item_prices: [{ id: 'eip-1', event_id: 'ev-checked', item_id: 'item-1', price: 5.5 }],
  orders: [{ id: 'ord-1', order_key: 'ok-1', truck_id: TRUCK, event_id: 'ev-checked', customer_name: 'Preview order', collection_time: '13:30', total: 5 }],
  slot_capacity: [], production_slot_usage: [],
  ...over,
})

;(async () => {
  const m = await kit.bundle('drs', [
    "export { rearmDemoFirstOpen, claimDemoFirstOpen } from '@/lib/demo-session'",
    "export { restartDemoService } from '@/lib/demo-restart'",
    "export { clearCountrySettingsCache } from '@/lib/country-settings'",
  ].join('\n'))
  const db = (fx = fixture()) => { const pg = makeFakePg(fx); globalThis.__harnessDb = pg; m.clearCountrySettingsCache?.(); return pg }
  const rows = (pg, tb) => pg.tables[tb] || []

  head('1 · Reset for sending re-arms the first-open restart')
  {
    const pg = db()
    const r = await m.rearmDemoFirstOpen(pg, TRUCK)
    t('an opened outreach demo is re-armed', r.rearmed === true && rows(pg, 'demo_sessions')[0].first_opened_at === null, JSON.stringify(r))
    const claim = await m.claimDemoFirstOpen(pg, TRUCK, OPENED)
    t('…so the truck\'s next open wins the claim (and restarts the service)', claim.claimed === true, JSON.stringify(claim))
    const again = await m.claimDemoFirstOpen(pg, TRUCK, new Date(OPENED.getTime() + 60_000))
    t('…once: the open after that does not restart again', again.claimed === false && again.reason === 'already-opened', JSON.stringify(again))
    const anon = db(fixture({ demo_sessions: [{ truck_id: TRUCK, discovery_truck_id: null, first_opened_at: BUILT }] }))
    t('an anonymous landing-page demo is not re-armed (its first open is never a restart)', (await m.rearmDemoFirstOpen(anon, TRUCK)).rearmed === false)
    const real = db(fixture({ demo_sessions: [{ truck_id: 'pizza-kitchen', discovery_truck_id: 'dt-9', first_opened_at: BUILT }] }))
    t('a truck id without the demo- prefix is refused', (await m.rearmDemoFirstOpen(real, 'pizza-kitchen')).rearmed === false && rows(real, 'demo_sessions')[0].first_opened_at === BUILT)
  }

  head('2 · when the truck opens it at 15:10, the event and orders start fresh — and every setting is kept')
  {
    const pg = db()
    const before = { trucks: JSON.stringify(rows(pg, 'trucks')), vans: JSON.stringify(rows(pg, 'truck_vans')), cats: JSON.stringify(rows(pg, 'menu_categories')), items: JSON.stringify(rows(pg, 'menu_items_db')), deals: JSON.stringify(rows(pg, 'bundles_db')) }
    const r = await kit.quietAsync(() => m.restartDemoService(pg, TRUCK, { now: OPENED }))
    const evs = rows(pg, 'truck_events')
    t('one event, the new one', evs.length === 1 && evs[0].id === r.event.id && evs[0].id !== 'ev-checked', JSON.stringify(evs.map(e => e.id)))
    t('it starts around the moment they opened it (15:00 London, the demo window\'s half-hour floor), not when it was built', r.event.start_time.startsWith('15:00') && r.event.end_time > '18:00', `${r.event.start_time}–${r.event.end_time}`)
    t('the preview\'s orders are gone', !rows(pg, 'orders').some(o => o.customer_name === 'Preview order'))
    t('any orders on the board are on the new event', rows(pg, 'orders').every(o => o.event_id === r.event.id))
    const ev = evs[0]
    const KEPT = ['venue_name', 'venue_address', 'customer_note', 'event_type_id', 'order_ready_override', 'buzzer_prompt', 'takes_cash_override', 'offline_protection_override', 'offline_protection_mode_override', 'offline_auto_reject_mins_override', 'collection_interval_mins_override', 'price_mode', 'price_amount', 'price_rounding']
    const old = fixture().truck_events[0]
    const lost = KEPT.filter(k => JSON.stringify(ev[k]) !== JSON.stringify(old[k]))
    t('every per-event setting made while checking the demo is on the new event', lost.length === 0, `lost: ${lost.join(', ')}`)
    t('the deal switched on for the old event is switched on for the new one', rows(pg, 'event_deals').some(d => d.event_id === r.event.id && d.bundle_id === 'deal-1' && d.active === true), JSON.stringify(rows(pg, 'event_deals')))
    t('the event\'s own item price is carried', rows(pg, 'event_item_prices').some(p => p.event_id === r.event.id && p.item_id === 'item-1' && p.price === 5.5), JSON.stringify(rows(pg, 'event_item_prices')))
    t('the truck, its van, the menu and the deals are untouched',
      JSON.stringify(rows(pg, 'trucks')) === before.trucks && JSON.stringify(rows(pg, 'truck_vans')) === before.vans && JSON.stringify(rows(pg, 'menu_categories')) === before.cats
      && JSON.stringify(rows(pg, 'menu_items_db')) === before.items && JSON.stringify(rows(pg, 'bundles_db')) === before.deals)
    t('state is NOT carried: the new event is open now, with fresh open/confirm stamps', ev.status === 'open' && ev.opened_at !== BUILT && ev.start_time !== old.start_time)
  }

  head('3 · a demo with no event yet restarts with the defaults, as before')
  {
    const pg = db(fixture({ truck_events: [], event_deals: [], event_item_prices: [], orders: [] }))
    const r = await kit.quietAsync(() => m.restartDemoService(pg, TRUCK, { now: OPENED }))
    t('a new event is built', rows(pg, 'truck_events').length === 1 && r.event.start_time.startsWith('15:00'))
  }

  head('4 · the wiring: an admin-only route, the button, and a rebuild that re-arms')
  const read = f => require('fs').readFileSync(require('path').join(kit.REPO, f), 'utf8')
  const route = read('app/api/admin/demo-reset/route.ts')
  t('POST /api/admin/demo-reset checks verifyAdmin first, re-arms (the outreach-demo check), THEN starts the service afresh now',
    /if \(!await verifyAdmin\(req\)\)/.test(route) && route.indexOf('rearmDemoFirstOpen(supabase, truckId)') > 0
    && route.indexOf('restartDemoService(supabase, truckId)') > route.indexOf('rearmDemoFirstOpen(supabase, truckId)')
    && /if \(!r\.rearmed\) return/.test(route) && !/\.delete\(\)/.test(route))
  const ws = read('components/admin/ProspectWorkspace.tsx')
  t('the prospect page has "Reset for sending" beside Rebuild, and shows whether the next open is fresh', /'Reset for sending'/.test(ws) && /Fresh on their first open/.test(ws) && /fetch\('\/api\/admin\/demo-reset'/.test(ws))
  t('the prospect list carries first_opened_at', /first_opened_at'\)/.test(read('app/api/admin/outreach/route.ts')) || /public_ref, expires_at, created_at, first_opened_at/.test(read('app/api/admin/outreach/route.ts')))
  t('an admin rebuild re-arms the first open too', /if \(input\.replaceBoard\) \{\s*const r = await rearmDemoFirstOpen\(supabase, truckId\)/.test(read('lib/provision-demo.ts')))

  head('5 · while a demo is being set up, the old board is not shown and the "real order" prompt cannot fire')
  const dash = read('app/dashboard/[token]/page.tsx')
  t('one "setting up" flag: a restart in flight, or a first-open claim not yet answered',
    /const demoSettingUp=!!\(isDemo&&\(restarting\|\|\(demoFirstOpenPending&&!firstOpenChecked\)\)\)/.test(dash))
  t('…the "This service has ended" card stands down while it is set', /const demoEndedCard=demoServiceEnded&&!demoSettingUp\?\(/.test(dash))
  t('…the welcome stands down while it is set', /\{isDemo&&!demoSettingUp&&<DemoWelcome/.test(dash))
  t('…the loop-complete prompt is not "loaded", so it writes no baseline mid-restart', /loaded=\{!loading&&!!truck&&!demoSettingUp\}/.test(dash))
  t('…and one full-screen "Setting up your demo…" panel is shown instead, from messages/', /\{demoSettingUp&&\(\s*<div className="fixed inset-0 z-\[90\][^>]*>\s*<p[^>]*>\{tDash\('demoSettingUp'\)\}<\/p>/.test(dash)
    && JSON.parse(read('messages/en-GB.json')).dashboard.demoSettingUp === 'Setting up your demo…')

  t('a successful restart clears the welcome\'s "seen" flag before reloading, so the new service introduces itself',
    /clearDemoWelcomeSeen\(token\)\s*\n[\s\S]{0,800}?window\.location\.reload\(\)/.test(dash))

  // The prompt itself, mounted for real (react-dom/client on the mini DOM, effects running), replaying what
  // Chrome did: the first seeded orders ARRIVE on the old page mid-restart, then the reload shows them all.
  const { installMiniDom } = require('./_mini-dom.cjs')
  const React = require(require('path').join(kit.REPO, 'node_modules/react')); const { act } = React
  const { createRoot } = require(require('path').join(kit.REPO, 'node_modules/react-dom/client'))
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const L = await kit.bundle('drs-loop', "export { DemoLoopComplete } from '@/components/dashboard/DemoLoopComplete'\nexport { markDemoWelcomeSeen } from '@/lib/demo-board-build'")
  const replay = async (loadedMidRestart) => {
    const dom = installMiniDom(); localStorage.clear()
    L.markDemoWelcomeSeen && sessionStorage?.setItem?.('hg_demo_welcome_tok-demo', 'seen')
    const root = createRoot(dom.container)
    const order = k => ({ order_key: k, id: k, customer_name: k, total: 5, items: [], status: 'pending' })
    const mount = async (keys, loaded) => { await act(async () => { root.render(React.createElement(L.DemoLoopComplete, { token: 'tok-demo', orderKeys: keys, orders: keys.map(order), loaded, onHighlight() {} })) }); await act(async () => { await new Promise(r => setTimeout(r, 5)) }) }
    await mount(['s1'], loadedMidRestart)                 // mid-restart: the first seeded order has arrived
    await act(async () => root.unmount())                // the reload
    const root2 = createRoot(dom.container)
    await act(async () => { root2.render(React.createElement(L.DemoLoopComplete, { token: 'tok-demo', orderKeys: ['s1', 's2', 's3'], orders: ['s1', 's2', 's3'].map(order), loaded: true, onHighlight() {} })) })
    await act(async () => { await new Promise(r => setTimeout(r, 5)) })
    const text = dom.container.textContent
    await act(async () => root2.unmount()); dom.teardown()
    return text
  }
  globalThis.sessionStorage = globalThis.sessionStorage || (() => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear() } })()
  const before = await kit.quietAsync(() => replay(true))
  const after = await kit.quietAsync(() => replay(false))
  t('CONTROL — fed the arriving orders mid-restart (the old wiring), the prompt fires on the seeded board', /exactly how a real order lands/.test(before), before.slice(0, 160))
  t('with the setting-up gate, the reloaded seeded board is just the baseline — no prompt', !/exactly how a real order lands/.test(after), after.slice(0, 160))

  delete globalThis.__harnessDb
  console.log(`\n${fail ? '✗' : '✓'} demo-reset-for-sending: ${pass} passed, ${fail} failed`)
  if (fail) process.exit(1)
})().catch(e => { console.error(e); process.exit(1) })
