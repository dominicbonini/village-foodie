#!/usr/bin/env node
// scripts/capacity-one-source-1.cjs (capacity-one-source-1, 13 November 2026, docs/capacity-one-source-1-report.md).
// Prep time / items per batch / "counts" must agree everywhere: Menu › Items, Menu › Kitchen capacity, the Settings
// warning and every event, with or without a van.
//   node scripts/capacity-one-source-1.cjs     §A, swept: no server, no database. The ONE writer
//                                              (lib/category-capacity-write.ts) is compiled and driven against an
//                                              in-memory stand-in for the four tables it touches.
// 🔴 FAILURE MODE: the two stores disagree again (Pizza Kitchen, 13 Nov: Items 15m / 8, Kitchen capacity 5m / 4), so
// the Items card or the Settings warning shows numbers the van's orders are not using, or an event with no van runs
// different numbers from an event with one.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const { compile, REPO } = require('./_slot-interval-compile.cjs')
let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? '\n      ' + JSON.stringify(detail).slice(0, 600) : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)

const c = compile(REPO, ['lib/category-capacity-write.ts', 'lib/slot-interval.ts', 'lib/prep-utils.ts'], 'cap1src')
const W = c.req('lib/category-capacity-write.js')
const V = c.req('lib/van-category-settings.js')
const I = c.req('lib/slot-interval.js')

// ── THE STAND-IN DATABASE ─────────────────────────────────────────────────────────────────────────────────────────
// Just enough of supabase-js for the writer: select/eq/maybeSingle, update/eq, upsert(onConflict). Every write is logged.
function db(seed) {
  const T = JSON.parse(JSON.stringify(seed)); const log = []
  const from = table => {
    const q = { table, filters: [], op: 'select', vals: null, cols: '*' }
    const rows = () => (T[table] ||= []).filter(r => q.filters.every(([k, v]) => r[k] === v))
    const run = () => {
      if (q.op === 'select') return { data: rows(), error: null }
      if (q.op === 'update') { const rs = rows(); rs.forEach(r => Object.assign(r, q.vals)); log.push({ table, op: 'update', filters: q.filters, vals: q.vals, n: rs.length }); return { data: null, error: null } }
      if (q.op === 'upsert') {
        const keys = q.onConflict.split(',')
        const hit = (T[table] ||= []).find(r => keys.every(k => r[k] === q.vals[k]))
        if (hit) Object.assign(hit, q.vals); else T[table].push({ ...q.vals })
        log.push({ table, op: 'upsert', vals: q.vals }); return { data: null, error: null }
      }
    }
    const b = {
      select(cols) { q.cols = cols; return b },
      eq(k, v) { q.filters.push([k, v]); return b },
      update(vals) { q.op = 'update'; q.vals = vals; return b },
      upsert(vals, o) { q.op = 'upsert'; q.vals = vals; q.onConflict = o.onConflict; return Promise.resolve(run()) },
      maybeSingle() { const r = run(); return Promise.resolve({ data: r.data[0] ?? null, error: null }) },
      then(res, rej) { return Promise.resolve(run()).then(res, rej) },
    }
    return b
  }
  return { client: { from }, T, log }
}

// Pizza Kitchen as it stood on 13 Nov before the sync (docs/capacity-one-source-1/backup.json), plus a second ACTIVE van
// following the first van's capacity, so the fan-out is exercised (Pizza Kitchen's own Van2 is retired).
const PIZZA = '0662c2a3-73c6-4101-a132-a6a06d301de7', DRINKS = 'cb2845fd-4ee2-4b2a-98ee-1fc87202a2b5'
const VAN1 = '8e38901e-113f-42fc-ac60-11cf1360212b', VAN2 = 'van-2-following', VAN3 = 'van-3-own'
const seed = () => ({
  menu_categories: [
    { id: PIZZA, truck_id: 'test-truck', name: 'Pizza', prep_secs: 900, batch_size: 8, counts_toward_capacity: true },
    { id: DRINKS, truck_id: 'test-truck', name: 'Drinks', prep_secs: 0, batch_size: 0, counts_toward_capacity: false },
  ],
  truck_vans: [
    { id: VAN1, truck_id: 'test-truck', created_at: '2026-05-25T14:37:59Z', active: true, same_as_first_van: false, capacity_same_as_first_van: false },
    { id: VAN2, truck_id: 'test-truck', created_at: '2026-07-30T13:43:41Z', active: true, same_as_first_van: false, capacity_same_as_first_van: true },
    { id: VAN3, truck_id: 'test-truck', created_at: '2026-08-01T10:00:00Z', active: true, same_as_first_van: false, capacity_same_as_first_van: false },
  ],
  van_category_settings: [
    { truck_id: 'test-truck', van_id: VAN1, category_id: PIZZA, prep_secs: 300, batch_size: 4, counts_toward_capacity: true },
    { truck_id: 'test-truck', van_id: VAN2, category_id: PIZZA, prep_secs: 300, batch_size: 4, counts_toward_capacity: true },
  ],
})
const vcs = (T, van, cat) => T.van_category_settings.find(r => r.van_id === van && r.category_id === cat)
const mc = (T, cat) => T.menu_categories.find(r => r.id === cat)
const three = r => r && [r.prep_secs, r.batch_size, !!r.counts_toward_capacity]
const J = JSON.stringify
/** What Manage shows: the categories as the first van resolves them (the GET's own pure function). */
const shown = T => W.resolveForFirstVan(T.menu_categories, T.truck_vans,
  new Map(T.truck_vans.map(v => [v.id, T.van_category_settings.filter(r => r.van_id === v.id)])))
/** What Kitchen capacity shows for a van: its own row, else the category (KitchenCapacitySection.effectiveVanCat). */
const kc = (T, van, cat) => { const own = vcs(T, van, cat); return three(own ?? mc(T, cat)) }
/** catConfigs exactly as /api/slots builds them (`batch: c.batch_size || 1`), for a van or for no van. */
const catConfigs = (T, vanId) => {
  const rows = new Map(T.van_category_settings.filter(r => r.van_id === vanId).map(r => [r.category_id, r]))
  const out = {}
  for (const c of V.resolveCategories(T.menu_categories, vanId ? rows : null)) out[c.name.toLowerCase()] = { secs: c.prep_secs || 0, batch: c.batch_size || 1, countsToCapacity: !!c.counts_toward_capacity }
  return out
}

;(async () => {
  head('§A0 · the bug, as it stood (Pizza Kitchen before the sync)')
  {
    const T = seed().van_category_settings && seed()
    t('the stores disagree: menu_categories Pizza 15m / 8, Van 1 5m / 4', J(three(mc(T, PIZZA))) === J([900, 8, true]) && J(three(vcs(T, VAN1, PIZZA))) === J([300, 4, true]))
    t('🔴 the old Settings warning read menu_categories: "Pizza takes 15 minutes" at every 5 — a prep the orders were not using',
      I.misalignedCookingCategory(5, T.menu_categories)?.prepMins === 15)
    t('🔴 an event with no van and an event with Van 1 got DIFFERENT catConfigs', J(catConfigs(T, null)) !== J(catConfigs(T, VAN1)))
    t('the Items card now shows the FIRST van\'s numbers anyway (5m / 4), before any write', J(three(shown(T).categories.find(c => c.id === PIZZA))) === J([300, 4, true]))
  }

  head('§A1 · Items › edit prep → Kitchen capacity shows it (the Items card writes upsert_van_category for the first van)')
  {
    const { client, T, log } = db(seed())
    // Menu › Items' saveCat sends exactly this: api('upsert_van_category', { vanId: firstVanId, categoryId, prep_secs }).
    const r = await W.writeVanCategoryCapacity(client, 'test-truck', VAN1, PIZZA, W.capacityPatchOf({ prep_secs: 600 }))
    t('the write succeeds, fans out to the following van, and mirrors', r.ok && J(r.fannedTo) === J([VAN2]) && r.mirrored === true, r)
    t('Kitchen capacity, Van 1: 10m / 4 (batch kept: seeded from what the van resolved)', J(kc(T, VAN1, PIZZA)) === J([600, 4, true]))
    t('Kitchen capacity, Van 2 (follows Van 1): 10m / 4', J(kc(T, VAN2, PIZZA)) === J([600, 4, true]))
    t('Van 3 (does NOT follow Van 1, had no row): KEEPS what it ran, 15m / 8, now on a row of its own', J(three(vcs(T, VAN3, PIZZA))) === J([900, 8, true]) && J(kc(T, VAN3, PIZZA)) === J([900, 8, true]))
    t('menu_categories Pizza = 10m / 4 (the mirror)', J(three(mc(T, PIZZA))) === J([600, 4, true]))
    t('the Items card shows 10m / 4', J(three(shown(T).categories.find(c => c.id === PIZZA))) === J([600, 4, true]))
    t('Drinks untouched everywhere', J(three(mc(T, DRINKS))) === J([0, 0, false]) && !log.some(l => (l.vals?.category_id ?? l.filters?.find(f => f[0] === 'id')?.[1]) === DRINKS))
  }

  head('§A2 · Kitchen capacity › edit batch → the Items card shows it')
  {
    const { client, T } = db(seed())
    const r = await W.writeVanCategoryCapacity(client, 'test-truck', VAN1, PIZZA, W.capacityPatchOf({ batch_size: 6 }))
    t('the write succeeds and mirrors', r.ok && r.mirrored)
    const s = shown(T).categories.find(c => c.id === PIZZA)
    t('the Items card\'s chips: "5m prep" / "6 at a time"', s.prep_secs === 300 && s.batch_size === 6, s)
    t('menu_categories Pizza = 5m / 6', J(three(mc(T, PIZZA))) === J([300, 6, true]))
  }

  head('§A3 · a NON-first van\'s edit stays on that van (no mirror, no fan-out)')
  {
    const { client, T } = db(seed())
    const r = await W.writeVanCategoryCapacity(client, 'test-truck', VAN3, PIZZA, W.capacityPatchOf({ prep_secs: 1200 }))
    t('Van 3 = 20m / 8: seeded from what Van 3 resolved (menu_categories 15m / 8), prep changed to 20m', r.ok && J(kc(T, VAN3, PIZZA)) === J([1200, 8, true]), kc(T, VAN3, PIZZA))
    t('not mirrored, not fanned out; menu_categories and Van 1 unchanged', r.mirrored === false && r.fannedTo.length === 0 && J(three(mc(T, PIZZA))) === J([900, 8, true]) && J(kc(T, VAN1, PIZZA)) === J([300, 4, true]))
    const v = shown(T)
    t('the Items card shows Van 1 (5m / 4) and flags Pizza: another van runs it differently', J(three(v.categories.find(c => c.id === PIZZA))) === J([300, 4, true]) && v.vansDiffer.includes(PIZZA) && !v.vansDiffer.includes(DRINKS) && v.vanCount === 3)
  }

  head('§A4 · upsert_category (the server path for any client that sends prep) goes through the same writer')
  {
    const { client, T } = db(seed())
    const r = await W.writeCategoryCapacityForTruck(client, 'test-truck', PIZZA, W.capacityPatchOf({ prep_secs: 900, batch_size: 8 }))
    t('it writes the FIRST van (and its follower), and mirrors', r.ok && r.vanId === VAN1 && J(kc(T, VAN1, PIZZA)) === J([900, 8, true]) && J(kc(T, VAN2, PIZZA)) === J([900, 8, true]) && J(three(mc(T, PIZZA))) === J([900, 8, true]))
    const { client: c2, T: T2 } = db({ ...seed(), truck_vans: [], van_category_settings: [] })
    const r2 = await W.writeCategoryCapacityForTruck(c2, 'test-truck', PIZZA, W.capacityPatchOf({ batch_size: 3 }))
    t('a truck with NO van writes menu_categories directly (nothing to resolve through)', r2.ok && r2.vanId === null && J(three(mc(T2, PIZZA))) === J([900, 3, true]) && T2.van_category_settings.length === 0)
    const r3 = await W.writeVanCategoryCapacity(client, 'other-truck', VAN1, PIZZA, {})
    t('⛔ another truck\'s van / category is refused (ownership on both ids)', r3.ok === false && r3.code === 'van_not_found')
    t('⚠️ prep 0 and counts false are settable (`!== undefined`, not truthiness)', J(W.capacityPatchOf({ prep_secs: 0, counts_toward_capacity: false })) === J({ prep_secs: 0, counts_toward_capacity: false }))
    t('a menu-only save (name / notes) carries no capacity fields', W.hasCapacityFields({ id: PIZZA, name: 'Pizza', allow_notes: true }) === false)
  }

  head('§A5 · the Settings warning follows the edited value')
  {
    const { client, T } = db(seed())
    const warn = (iv, van) => I.misalignedCookingCategory(iv, T.menu_categories.map(c => ({ ...c, ...(vcs(T, van, c.id) ?? {}) })))
    t('Van 1 at every 5 with 5m prep: no warning', warn(5, VAN1) === null)
    await W.writeVanCategoryCapacity(client, 'test-truck', VAN1, PIZZA, { prep_secs: 900 })
    t('after Items sets 15m: "Pizza takes 15 minutes" at every 5', warn(5, VAN1)?.prepMins === 15)
    await W.writeVanCategoryCapacity(client, 'test-truck', VAN1, PIZZA, { prep_secs: 300 })
    t('back to 5m from Kitchen capacity: the warning goes', warn(5, VAN1) === null)
  }

  head('§A6 · an event with no van and an event with Van 1 give the same slot inputs after an edit')
  {
    const { client, T } = db(seed())
    await W.writeVanCategoryCapacity(client, 'test-truck', VAN1, PIZZA, { prep_secs: 600, batch_size: 5 })
    const a = catConfigs(T, null), b = catConfigs(T, VAN1)
    t('catConfigs (the only capacity input the two differ in) are byte-identical', J(a) === J(b), { a, b })
    t('…and they are the edited 10m / 5', a.pizza.secs === 600 && a.pizza.batch === 5)
  }

  head('§A7 · removing the first van: the next-oldest is first, and menu_categories follows it')
  {
    const { client, T } = db(seed())
    T.truck_vans.find(v => v.id === VAN1).active = false
    T.van_category_settings.find(r => r.van_id === VAN2).prep_secs = 420
    const n = await W.mirrorFirstVanToMenuCategories(client, 'test-truck')
    t('Van 2 is first; its Pizza row (7m / 4) is copied into menu_categories', n === 1 && J(three(mc(T, PIZZA))) === J([420, 4, true]))
  }

  head('§A7b · a truck answering "No" (separate capacities): Van 1\'s edit never moves another van')
  {
    const { client, T } = db(seed())
    T.truck_vans.find(v => v.id === VAN2).capacity_same_as_first_van = false
    T.van_category_settings = T.van_category_settings.filter(r => r.van_id === VAN1)
    const before = { v2: kc(T, VAN2, PIZZA), v3: kc(T, VAN3, PIZZA) }
    await W.writeVanCategoryCapacity(client, 'test-truck', VAN1, PIZZA, { prep_secs: 1500, batch_size: 2 })
    t(`Van 2 and Van 3 still run ${J(before.v2)} after Van 1 → 25m / 2`, J(kc(T, VAN2, PIZZA)) === J(before.v2) && J(kc(T, VAN3, PIZZA)) === J(before.v3), { before, v2: kc(T, VAN2, PIZZA), v3: kc(T, VAN3, PIZZA) })
    t('…while menu_categories (no-van events) follows Van 1', J(three(mc(T, PIZZA))) === J([1500, 2, true]))
    t('…and the Items card flags Pizza (the other vans differ)', shown(T).vansDiffer.includes(PIZZA))
  }

  head('§A8 · broken variants: each must FAIL')
  {
    // V0: without keeping the other vans' values, an independent van moves with Van 1.
    {
      const { client, T } = db(seed())
      const realFrom = client.from
      client.from = tbl => { const b = realFrom(tbl); if (tbl !== 'van_category_settings') return b; const up = b.upsert; b.upsert = (v, o) => (v.van_id === VAN3 ? Promise.resolve({ error: null }) : up(v, o)); return b }
      await W.writeVanCategoryCapacity(client, 'test-truck', VAN1, PIZZA, { prep_secs: 600 })
      const moved = J(kc(T, VAN3, PIZZA)) !== J([900, 8, true])
      console.log(`  ${moved ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V0 no pin: Van 3 (independent) moves with Van 1`); if (!moved) fail++
    }
    // V1: the mirror removed. The Items card would still show the van value (it resolves), but no-van events drift.
    const { client, T } = db(seed())
    const real = W.writeVanCategoryCapacity
    const noMirror = async (...a) => { const before = J(T.menu_categories); const r = await real(...a); T.menu_categories = JSON.parse(before); return r }
    await noMirror(client, 'test-truck', VAN1, PIZZA, { prep_secs: 600 })
    const broken = J(catConfigs(T, null)) !== J(catConfigs(T, VAN1))
    console.log(`  ${broken ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 no mirror: a no-van event runs different numbers`); if (!broken) fail++
    // V2: the Items card reads menu_categories raw (no first-van resolution): it shows 15m / 8 on the pre-sync data.
    const raw = three(seed().menu_categories.find(c => c.id === PIZZA))
    const b2 = J(raw) !== J(three(shown(seed()).categories.find(c => c.id === PIZZA)))
    console.log(`  ${b2 ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V2 the Items card reads the raw row: it shows 15m / 8 while orders use 5m / 4`); if (!b2) fail++
  }

  console.log(`\n${fail ? '🔴' : '✅'} capacity-one-source-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.log('🔴 threw: ' + (e.stack || e)); process.exit(1) })
