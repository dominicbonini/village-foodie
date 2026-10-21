#!/usr/bin/env node
// scripts/demo-rebuild-replace.cjs — an admin REBUILD of an outreach demo replaces the old demo: a new menu
// replaces the old menu, and every old event and order goes, whatever its date (14 October 2026).
//   node scripts/demo-rebuild-replace.cjs      (≈ 10 s: one bundle, an in-memory Supabase with real writes)
//
// 🔴 FAILURE MODE (Tacoman, 14 October 2026): the rebuild window says "Add a menu below only to replace it",
//    but `provisionDemo` skipped the menu step on every rebuild — a new menu photo was silently ignored, and
//    the demo link kept showing the old menu. And `provisionDemoEvent` only cleared the NEW event's date, so a
//    demo first built on another day kept its old event and orders beside the new ones.
// 🔴 AND THE TWO THINGS THE FIX MUST NOT DO: wipe a demo whose new photo could not be read (the old demo must
//    survive an unreadable upload untouched), and clear anything on a truck that is not a demo.
//
// HOW: the REAL `provisionDemo` (menu commit, event, seeder, the new clear steps) bundled from lib/, run
// against scripts/_fake-pg.cjs, which STORES rows. Only the logo copy and the AI menu reader are stubbed.
// Nothing here touches the database, storage or the network.
const kit = require('./_render-kit.cjs')({ cacheTag: 'demo-rebuild-replace' })
const { makeFakePg } = require('./_fake-pg.cjs')
const SEEDS = require('./_country-settings-gb.cjs')
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))

let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${String(detail).slice(0, 400)}` : ''}`) } }
const head = s => console.log(`\n── ${s}`)

const TRUCK = 'demo-tacoman'
const NOW = new Date('2026-10-14T10:00:00Z')
// ⚠️ RE-PINNED (features-followups, 20 October 2026): THE WHOLE PROCESS RUNS AT `NOW`, NOT AT THE REAL DATE.
// `provisionDemo` is handed `now: NOW`, but the demo event's DATE comes from `demoEventWindow` → `getLocalDateInTz(tz)`
// (lib/provision-demo-event.ts:87), which reads the clock, not `now`. So on the real 20 October the new event landed on
// 2026-10-20 — the date of this fixture's "another date" event (ev-old-b) — and §5's "an event on ANOTHER date is kept"
// failed every time the real date matched a fixture date. Pinning the render kit's clock to NOW makes the new event
// 2026-10-14 on any day the harness runs, so it can never collide with ev-old-a (10-01) or ev-old-b (10-20).
// (The time/date split inside demoEventWindow is reported in docs/features-followups-report.md; not changed here.)
kit.setNow(NOW.toISOString())
function seed({ session = true } = {}) {
  return {
    country_settings: [snake(SEEDS.gbFromSeed())],
    trucks: [{ id: TRUCK, name: 'Tacoman', slug: 'demo-tacoman', dashboard_token: 'tok-demo', country: 'GB', currency: 'GBP', plan: 'demo', timezone: null, logo_storage_path: null }],
    truck_vans: [{ id: 'van-1', truck_id: TRUCK, name: 'Van 1', active: true, collection_interval_mins: 5 }],
    demo_sessions: session ? [{ truck_id: TRUCK, public_ref: 'tacoman', discovery_truck_id: 'dt-1', extraction: { old: true }, extraction_source: 'upload' }] : [],
    menu_categories: [
      { id: 'cat-old-1', truck_id: TRUCK, name: 'Old Tacos', is_active: true, prep_secs: 300, batch_size: 4, sort_order: 1 },
      { id: 'cat-old-2', truck_id: TRUCK, name: 'Old Drinks', is_active: true, prep_secs: 0, batch_size: 0, sort_order: 2 },
    ],
    menu_items_db: [
      { id: 'item-old-1', truck_id: TRUCK, name: 'Old Carnitas Taco', price: 4.5, category_id: 'cat-old-1', is_active: true },
      { id: 'item-old-2', truck_id: TRUCK, name: 'Old Horchata', price: 3, category_id: 'cat-old-2', is_active: true },
    ],
    modifier_groups: [{ id: 'grp-old', truck_id: TRUCK, name: 'Old Salsa' }],
    menu_subcategories: [{ id: 'sub-old', truck_id: TRUCK, name: 'Old Specials' }],
    bundles_db: [{ id: 'deal-old', truck_id: TRUCK, name: 'Old Taco Deal' }],
    upsell_rules: [{ id: 'up-old', truck_id: TRUCK }],
    truck_events: [
      { id: 'ev-old-a', truck_id: TRUCK, event_date: '2026-10-01', start_time: '11:00:00', end_time: '14:00:00', status: 'closed' },
      { id: 'ev-old-b', truck_id: TRUCK, event_date: '2026-10-20', start_time: '11:00:00', end_time: '14:00:00', status: 'confirmed' },
    ],
    orders: [
      { id: 'ord-old-1', truck_id: TRUCK, event_id: 'ev-old-a', customer_name: 'Old Alice', total: 9 },
      { id: 'ord-old-2', truck_id: TRUCK, event_id: 'ev-old-b', customer_name: 'Old Bob', total: 4.5 },
    ],
    slot_capacity: [{ id: 'cap-old', truck_id: TRUCK, event_date: '2026-10-20' }],
    production_slot_usage: [{ id: 'psu-old', truck_id: TRUCK, event_date: '2026-10-20' }],
    slot_bookings: [{ truck_id: TRUCK, event_date: '2026-10-20', collection_time: '12:00', order_count: 1 }],
    item_overrides: [{ id: 'ovr-old', truck_id: TRUCK, item_name: 'Old Carnitas Taco', sold_out: true }],
    category_stock: [{ id: 'cs-old', truck_id: TRUCK, category: 'Old Tacos', stock: 2 }],
  }
}
const SAMPLE = { name: 'Sample pizza', categories: ['Pizza', 'Drinks'], items: [{ name: 'Margherita', price: 9.5, category: 'Pizza' }, { name: 'Cola', price: 2, category: 'Drinks' }] }
const PHOTO_MENU = { categories: ['Tacos', 'Drinks'], items: [
  { name: 'Birria Taco', description: null, price: 5, price_missing: false, category: 'Tacos', allergens: [], dietary: [], spiciness: null },
  { name: 'Jarritos', description: null, price: 2.5, price_missing: false, category: 'Drinks', allergens: [], dietary: [], spiciness: null },
], existing_categories: [] }

;(async () => {
  const m = await kit.bundle('drr', "export { provisionDemo } from '@/lib/provision-demo'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'", {
    stubs: {
      '@/lib/demo-logo': `export async function copyDemoLogo() { return { logoStoragePath: null, source: { kind: 'none' }, error: null, cleared: false } }
        export function demoLogoUpToDate() { return true }`,
    },
    // The AI menu reader: a harness hook, so a "photo" can be readable or unreadable without any network.
    patches: [{ file: 'lib/menu-extract.ts', from: 'export async function extractMenu(', to: 'export async function extractMenu(...__a: any[]): Promise<any> { const f = (globalThis as any).__extract; if (f) return f(...__a); return (__realExtractMenu as any)(...__a) }\nasync function __realExtractMenu(' }],
  })
  const run = async (input, fixture = seed()) => {
    const pg = makeFakePg(fixture)
    globalThis.__harnessDb = pg; m.clearCountrySettingsCache?.()
    let result = null, error = null
    try { result = await kit.quietAsync(() => m.provisionDemo(pg, { now: NOW, existingTruckId: TRUCK, discoveryTruckId: 'dt-1', name: 'Tacoman', ...input })) }
    catch (e) { error = e }
    finally { delete globalThis.__harnessDb }
    const rows = tb => pg.tables[tb] || []
    const names = tb => rows(tb).map(r => r.name).sort()
    return { result, error, pg, rows, names }
  }
  const hasOld = (r, tb, id) => r.rows(tb).some(x => x.id === id)

  head('1 · rebuild with the sample menu — the old menu, deals, upsells, subcategories and every old order and event are gone')
  globalThis.__extract = null
  {
    const r = await run({ template: SAMPLE, replaceBoard: true })
    t('rebuild succeeded', !r.error && r.result?.menu?.kind === 'template', r.error?.message || JSON.stringify(r.result?.menu))
    t('old menu items gone; only the new ones remain', JSON.stringify(r.names('menu_items_db')) === JSON.stringify(['Cola', 'Margherita']), JSON.stringify(r.names('menu_items_db')))
    t('old categories gone', !r.names('menu_categories').some(n => n.startsWith('Old')), JSON.stringify(r.names('menu_categories')))
    for (const [tb, id] of [['modifier_groups', 'grp-old'], ['menu_subcategories', 'sub-old'], ['bundles_db', 'deal-old'], ['upsell_rules', 'up-old'], ['item_overrides', 'ovr-old'], ['category_stock', 'cs-old'], ['slot_capacity', 'cap-old'], ['production_slot_usage', 'psu-old']]) {
      t(`old ${tb} row gone`, !hasOld(r, tb, id))
    }
    t('EVERY old event gone — the past one AND the one on another future date', !hasOld(r, 'truck_events', 'ev-old-a') && !hasOld(r, 'truck_events', 'ev-old-b'), JSON.stringify(r.rows('truck_events').map(e => e.id)))
    t('every old order gone', !r.rows('orders').some(o => String(o.customer_name).startsWith('Old')), JSON.stringify(r.rows('orders').map(o => o.customer_name)))
    t('old slot bookings gone', !r.rows('slot_bookings').some(b => b.event_date === '2026-10-20'))
    t('exactly one event now — the new one', r.rows('truck_events').length === 1 && r.rows('truck_events')[0].id === r.result?.event?.id)
    t('any orders on the board belong to the new event only', r.rows('orders').every(o => o.event_id === r.result?.event?.id))
    t('the link and the dashboard token are unchanged', r.result?.publicRef === 'tacoman' && r.result?.dashboardToken === 'tok-demo' && r.rows('trucks')[0].slug === 'demo-tacoman')
    t('the stored extraction is the new menu (signup and return visits use it)', r.rows('demo_sessions')[0].extraction_source === 'template' && !r.rows('demo_sessions')[0].extraction?.old)
  }

  head('2 · rebuild with a new menu PHOTO that reads — it replaces the old menu')
  globalThis.__extract = async () => PHOTO_MENU
  {
    const r = await run({ file: new File(['x'], 'tacoman.png', { type: 'image/png' }), replaceBoard: true })
    t('rebuild succeeded with the photo\'s menu', !r.error && r.result?.menu?.kind === 'imported', r.error?.message || JSON.stringify(r.result?.menu))
    t('the demo now serves the new menu, and nothing of the old', JSON.stringify(r.names('menu_items_db')) === JSON.stringify(['Birria Taco', 'Jarritos']), JSON.stringify(r.names('menu_items_db')))
    t('every old event and order gone', !hasOld(r, 'truck_events', 'ev-old-a') && !hasOld(r, 'truck_events', 'ev-old-b') && !r.rows('orders').some(o => String(o.customer_name).startsWith('Old')))
    t('the stored extraction is the photo\'s, tagged as their own menu', r.rows('demo_sessions')[0].extraction_source === 'upload' && r.rows('demo_sessions')[0].extraction?.items?.[0]?.name === 'Birria Taco')
  }

  head('3 · a photo that CANNOT be read leaves the old demo exactly as it was')
  globalThis.__extract = async () => { throw new Error('unreadable') }
  {
    const r = await run({ file: new File(['x'], 'blurry.png', { type: 'image/png' }), replaceBoard: true })
    t('the rebuild reports the menu failure (the modal shows "We couldn\'t read that menu")', !r.error && r.result?.menu?.kind === 'failed', r.error?.message || JSON.stringify(r.result?.menu))
    t('old menu untouched', JSON.stringify(r.names('menu_items_db')) === JSON.stringify(['Old Carnitas Taco', 'Old Horchata']))
    t('old events and orders untouched', hasOld(r, 'truck_events', 'ev-old-a') && hasOld(r, 'truck_events', 'ev-old-b') && hasOld(r, 'orders', 'ord-old-1') && hasOld(r, 'orders', 'ord-old-2'))
    t('old deals, upsells and stock untouched', hasOld(r, 'bundles_db', 'deal-old') && hasOld(r, 'upsell_rules', 'up-old') && hasOld(r, 'item_overrides', 'ovr-old'))
    t('no write of any kind reached the menu or board tables', !r.pg.writes.some(w => ['menu_items_db', 'menu_categories', 'truck_events', 'orders', 'bundles_db'].includes(w.table)), JSON.stringify(r.pg.writes.map(w => `${w.table}:${w.op}`)))
  }

  head('4 · a settings-only rebuild (no new menu) keeps the menu and clears every old event and order')
  globalThis.__extract = null
  {
    const r = await run({ replaceBoard: true, kitchen: { intervalMins: 10, prepSecs: 360, batchSize: 3 } })
    t('rebuild succeeded', !r.error && r.result?.event, r.error?.message)
    t('the menu is kept (same items, same ids)', hasOld(r, 'menu_items_db', 'item-old-1') && hasOld(r, 'menu_items_db', 'item-old-2'))
    t('every old event and order gone; one new event', !hasOld(r, 'truck_events', 'ev-old-a') && !hasOld(r, 'truck_events', 'ev-old-b') && r.rows('truck_events').length === 1 && !r.rows('orders').some(o => String(o.customer_name).startsWith('Old')))
    t('old sold-out overrides cleared', !hasOld(r, 'item_overrides', 'ovr-old') && !hasOld(r, 'category_stock', 'cs-old'))
  }

  head('5 · the landing page\'s return visit (no replaceBoard, no menu) behaves exactly as before')
  {
    const r = await run({ discoveryTruckId: null, name: null })
    t('menu kept', hasOld(r, 'menu_items_db', 'item-old-1'))
    t('an event on ANOTHER date is kept, as before (only the new event\'s date is replaced)', hasOld(r, 'truck_events', 'ev-old-a') && hasOld(r, 'truck_events', 'ev-old-b') && hasOld(r, 'orders', 'ord-old-1'))
    t('deals and overrides untouched', hasOld(r, 'bundles_db', 'deal-old') && hasOld(r, 'item_overrides', 'ovr-old'))
  }

  head('6 · a truck that is NOT a demo is refused before anything is cleared')
  {
    const r = await run({ template: SAMPLE, replaceBoard: true }, seed({ session: false }))
    t('the rebuild is refused', !!r.error && /no demo session/.test(r.error.message), r.error?.message)
    t('nothing was deleted', !r.pg.writes.some(w => w.op === 'delete'), JSON.stringify(r.pg.writes.filter(w => w.op === 'delete').map(w => w.table)))
  }

  console.log(`\n${fail ? '✗' : '✓'} demo-rebuild-replace: ${pass} passed, ${fail} failed`)
  if (fail) process.exit(1)
})().catch(e => { console.error(e); process.exit(1) })
