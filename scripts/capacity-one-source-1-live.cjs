#!/usr/bin/env node
// scripts/capacity-one-source-1-live.cjs (capacity-one-source-1, 13 November 2026): the LIVE half of the proof. BY HAND, NOT
// SWEPT: it needs the dev server on :3000 and it WRITES, through the app's own routes, to ONE demo truck.
//   DEMO_TOKEN=<that truck's dashboard token> node scripts/capacity-one-source-1-live.cjs
// ⚠️ WHY A DEMO TRUCK: Manage refuses without a signed-in owner, except for `demo-…` trucks (lib/truck-access.ts). Demo Kitchen
// (demo-mk65q66spjck0g9mxt50btfxtr) has one van, no orders and no events. Pizzeria Gusto and Le Roi du Churrasco are never
// touched. It creates two events tomorrow (one with the van, one without), edits Mains from both screens' paths, compares the
// customer slot grids, then puts Mains back to 5m / 4 and deletes the two events.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const BASE = process.env.BASE || 'http://localhost:3000'
const TRUCK = 'demo-mk65q66spjck0g9mxt50btfxtr'
const TOKEN = process.env.DEMO_TOKEN
if (!TOKEN) { console.log('DEMO_TOKEN is required'); process.exit(2) }
let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? '\n      ' + JSON.stringify(detail).slice(0, 700) : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const post = async (action, body = {}) => {
  const r = await fetch(`${BASE}/api/manage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: TOKEN, action, ...body }) })
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${action} ${r.status} ${JSON.stringify(j).slice(0, 300)}`); return j
}
const manage = async () => { const r = await fetch(`${BASE}/api/manage?token=${TOKEN}`); return r.json() }
const slots = async (eventId, date) => (await fetch(`${BASE}/api/slots/${TRUCK}?event_id=${eventId}&date=${date}`)).json()
const J = JSON.stringify
const { compile, REPO } = require('./_slot-interval-compile.cjs')
const I = compile(REPO, ['lib/slot-interval.ts'], 'cap1live').req('lib/slot-interval.js')

;(async () => {
  const tomorrow = new Date(Date.now() + 36 * 3600e3).toISOString().slice(0, 10)
  const m0 = await manage()
  const vans0 = await post('get_vans')
  const van = vans0.vans[0]
  const mains = m0.categories.find(c => c.name === 'Mains')
  head('§B0 · Demo Kitchen as it starts')
  console.log(`  van ${van.name} (${van.id.slice(0, 8)}), interval every ${van.collection_interval_mins}; Mains ${mains.prep_secs}s / ${mains.batch_size}; capacityView ${J(m0.capacityView)}`)
  t('the manage GET names the first van', m0.capacityView?.firstVanId === van.id && m0.capacityView.vanCount === 1)

  const evIds = []
  try {
    head('§B1 · two events tomorrow: one with the van, one with no van')
    for (const [name, vanId] of [['cap1 test (van)', van.id], ['cap1 test (no van)', null]]) {
      const ev = { venue_name: name, town: 'Test', postcode: '', address: '', event_date: tomorrow, start_time: '12:00', end_time: '14:00', notes: 'capacity-one-source-1 test, deleted at the end', van_id: vanId }
      const r = await post('upsert_event', ev)
      const id = r.event?.id
      evIds.push(id)
      /* ⚠️ A NEW EVENT ON A ONE-VAN TRUCK IS GIVEN THAT VAN (upsert_event: `van_id ?? getSoleActiveVanId`). The EDIT path
       * writes `van_id ?? null`, so editing it with no van is how an event with no van exists (the first run of this
       * script compared van against van because of this; the check below now proves which is which). */
      if (!vanId && id) await post('upsert_event', { id, ...ev })
    }
    const evs = (await manage()).events.filter(e => evIds.includes(e.id))
    const byId = Object.fromEntries(evs.map(e => [e.id, e.van_id]))
    t('both created: one on the van, one with NO van', evIds.length === 2 && byId[evIds[0]] === van.id && byId[evIds[1]] === null, byId)

    head('§B2 · Menu › Items: prep 10m on Mains (upsert_van_category for the first van, as saveCat sends it)')
    const r1 = await post('upsert_van_category', { vanId: m0.capacityView.firstVanId, categoryId: mains.id, prep_secs: 600 })
    t('saved and mirrored', r1.ok && r1.mirrored === true, r1)
    const v1 = (await post('get_vans')).vans[0].categorySettings.find(r => r.category_id === mains.id)
    t('Kitchen capacity (get_vans) shows Mains 10m / 4', v1 && v1.prep_secs === 600 && v1.batch_size === 4, v1)
    const c1 = (await manage()).categories.find(c => c.id === mains.id)
    t('the Items card (manage GET) shows Mains 10m / 4', c1.prep_secs === 600 && c1.batch_size === 4, c1)
    const w1 = I.misalignedCookingCategory(van.collection_interval_mins, (await manage()).categories)
    t(`the Settings warning at every ${van.collection_interval_mins}: "Mains takes 10 minutes"`, w1?.name === 'Mains' && w1.prepMins === 10, w1)
    const [a1, b1] = [await slots(evIds[0], tomorrow), await slots(evIds[1], tomorrow)]
    t(`slot grid: the van event and the no-van event are identical (${a1.slots?.length} slots each, + catConfigs)`, (a1.slots?.length ?? 0) > 0 && J(a1.slots) === J(b1.slots) && J(a1.catConfigs) === J(b1.catConfigs), { van: a1.catConfigs?.mains, novan: b1.catConfigs?.mains, nVan: a1.slots?.length, nNo: b1.slots?.length })
    t('…and both use 10m', a1.catConfigs?.mains?.secs === 600 && b1.catConfigs?.mains?.secs === 600)

    head('§B3 · Menu › Kitchen capacity: items per batch 6 on Mains (the same action, from that screen)')
    const r2 = await post('upsert_van_category', { vanId: van.id, categoryId: mains.id, batch_size: 6 })
    t('saved and mirrored', r2.ok && r2.mirrored === true)
    const c2 = (await manage()).categories.find(c => c.id === mains.id)
    t('the Items card shows Mains 10m / 6', c2.prep_secs === 600 && c2.batch_size === 6, c2)
    const [a2, b2] = [await slots(evIds[0], tomorrow), await slots(evIds[1], tomorrow)]
    t(`slot grid: van event = no-van event (${a2.slots?.length} slots), both batch 6`, (a2.slots?.length ?? 0) > 0 && J(a2.slots) === J(b2.slots) && J(a2.catConfigs) === J(b2.catConfigs) && a2.catConfigs.mains.batch === 6)

    head('§B4 · upsert_category with prep (any other client): routed through the same writer')
    const r3 = await post('upsert_category', { id: mains.id, name: mains.name, allow_notes: mains.allow_notes, default_stock: mains.default_stock, prep_secs: 300 })
    t('saved', !!r3.category && r3.category.prep_secs === 300, r3)
    const v3 = (await post('get_vans')).vans[0].categorySettings.find(r => r.category_id === mains.id)
    t('…it landed on the van (Kitchen capacity 5m / 6), not only on the category', v3.prep_secs === 300 && v3.batch_size === 6, v3)
    const w3 = I.misalignedCookingCategory(van.collection_interval_mins, (await manage()).categories)
    t('the Settings warning is gone (5m at every 5)', w3 === null, w3)
  } finally {
    head('§B5 · put it back, delete the test events')
    try { await post('upsert_van_category', { vanId: van.id, categoryId: mains.id, prep_secs: mains.prep_secs, batch_size: mains.batch_size }) } catch (e) { console.log('  restore failed: ' + e.message) }
    for (const id of evIds.filter(Boolean)) { try { await post('delete_event', { id }) } catch (e) { console.log('  delete failed: ' + e.message) } }
    const c = (await manage()).categories.find(x => x.id === mains.id)
    t(`Mains back to ${mains.prep_secs}s / ${mains.batch_size}`, c.prep_secs === mains.prep_secs && c.batch_size === mains.batch_size)
  }
  console.log(`\n${fail ? '🔴' : '✅'} capacity-one-source-1 live: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.log('🔴 threw: ' + (e.stack || e)); process.exit(1) })
