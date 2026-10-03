#!/usr/bin/env node
// scripts/schedule-graphics-places.cjs — matching an event to a place, and seeding places once.
//   node scripts/schedule-graphics-places.cjs   (≈ 4 s: one compile, NO NETWORK, NO DATABASE)
//
// ── 🔴 FAILURE MODE, in the order it would hurt ────────────────────────────────────────────────────
//    A DUPLICATE PLACE. Two rows for one pitch means stages 2 and 3 produce two graphics and two
//    posting rows for the same evening, and the operator posts twice in the same village group — which
//    is exactly what those groups ban businesses for.
//    AN OPERATOR EDIT SILENTLY REVERTED. They rename "Lavenham V Hall" to "Lavenham Village Hall" for
//    the public to read, refresh the tab, and the seeder writes the event's name back over it. Nothing
//    errors; the work is just gone, and it goes again every refresh.
//    A PLACE WITH NO DATES UNDER IT. If the normaliser and the stored `name_key` ever disagree, events
//    stop finding their place. There is no error for this — the graphic comes out with a correct
//    heading and an empty week.
//    TWO VENUES MERGED INTO ONE PLACE. "Village Hall" exists in more than one village; letting a name
//    override a venue anchor would put two villages' dates on one poster.
//
// ── WHAT IS ASSERTED ──────────────────────────────────────────────────────────────────────────────
//   1 · THE NORMALISER AND THE MATCHING, on the brief's own cases plus the ones that break naive
//       implementations (apostrophes, hyphens, accents, "&" with no spaces around it).
//   2 · THE SEED, run TWICE, including two runs that both planned against the same "before" state —
//       which is what two browser tabs opening the tab at the same moment actually do.
//   3 · THE WIRING, because the planner cannot prove the DATABASE-level guarantee: the unique index in
//       the migration and `ignoreDuplicates` at the call site are what make concurrent seeds safe, and
//       they are asserted from source.
//   4 · THE BROKEN VARIANTS — eight, each of which must fail.
const fs = require('fs')
const path = require('path')
const os = require('os')
const { compile, REPO } = require('./_slot-interval-compile.cjs')

let fails = 0
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')

const LIB = 'lib/schedule-graphics/places.ts'
const ROUTE = 'app/api/manage/route.ts'
const MIGRATION = 'supabase/migrations/20261003_truck_places.sql'
const TAB = 'components/manage/ScheduleGraphicsTab.tsx'

function buildLib(root, tag) {
  const { out, req } = compile(root, [LIB], tag)
  try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(out, 'node_modules')) } catch { /* already */ }
  return req('lib/schedule-graphics/places.js')
}

// 🧪 REAL-LOOKING ROWS. The villages and the pub are the shape of this truck's actual schedule; the
// venue uuids are obviously fake and are never sent anywhere.
const V_HALL = '11111111-1111-4111-8111-111111111111'
const V_HALL_OTHER = '22222222-2222-4222-8222-222222222222'
const V_PUB = '33333333-3333-4333-8333-333333333333'

const ev = (over = {}) => ({
  venue_id: null, venue_name: 'Lavenham Village Hall', event_date: '2026-10-13',
  start_time: '17:00', end_time: '20:00', status: 'confirmed',
  venue_address: null, address: null, postcode: null, ...over,
})

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1 · THE NORMALISER AND THE MATCHING
// ════════════════════════════════════════════════════════════════════════════════════════════════
function runMatchingSuite(P) {
  const ok = [], bad = []
  const t = (n, c) => (c ? ok : bad).push(n)
  const k = P.normalisePlaceName

  // ── THE BRIEF'S OWN CASES ────────────────────────────────────────────────────────────────────
  t('🔴 "Lavenham Village Hall" and "lavenham village hall " are one place',
    k('Lavenham Village Hall') === k('lavenham village hall ') && k('Lavenham Village Hall') === 'lavenham village hall')
  t('🔴 "Bull & Butcher" and "Bull and Butcher" are one place',
    k('Bull & Butcher') === k('Bull and Butcher') && k('Bull & Butcher') === 'bull and butcher')

  // ── THE CASES A NAIVE NORMALISER GETS WRONG ──────────────────────────────────────────────────
  t('⚠️ an ampersand with NO spaces still separates — "B&B" is "b and b", never "band"',
    k('B&B Yard') === 'b and b yard')
  t('⚠️ an apostrophe VANISHES rather than splitting a word — "Bull\'s Head" is "bulls head"',
    k("Bull's Head") === 'bulls head' && k('Bull’s Head') === 'bulls head')
  t('⚠️ a hyphen or a full stop SEPARATES — deleting it would join two words into one',
    k('Bull-and-Butcher') === 'bull and butcher' && k('St.Marys Hall') === 'st marys hall')
  t('⚠️ accents fold, because the source decides which spelling arrives', k('Café Verde') === 'cafe verde')
  t('⚠️ collapsed internal whitespace, tabs and newlines included',
    k('Lavenham   Village\tHall\n') === 'lavenham village hall')
  t('⚠️ nothing readable gives an EMPTY key, which matches nothing — not a key that matches everything',
    k('') === '' && k(null) === '' && k(undefined) === '' && k('!!! ???') === '')

  // ── MATCHING ─────────────────────────────────────────────────────────────────────────────────
  const anchored = { id: 'p-anchored', venue_id: V_HALL, name_key: 'lavenham village hall' }
  const byName = { id: 'p-named', venue_id: null, name_key: 'lavenham village hall' }
  const pub = { id: 'p-pub', venue_id: V_PUB, name_key: 'bull and butcher' }

  t('🔴 an unanchored event matches on the normalised name',
    P.eventMatchesPlace(ev(), byName) === true)
  t('🔴 THE VENUE ANCHOR BEATS THE NAME: both sides anchored and DIFFERENT ids do not match, though the names are identical',
    P.eventMatchesPlace(ev({ venue_id: V_HALL_OTHER }), anchored) === false
    && k('Lavenham Village Hall') === anchored.name_key)
  t('🔴 …and both sides anchored and the SAME id matches, though the names differ',
    P.eventMatchesPlace(ev({ venue_id: V_HALL, venue_name: 'Lavenham Vill. Hall (rear car park)' }), anchored) === true)
  t('⚠️ an anchored event against an UNANCHORED place falls back to the name — the anchor proves nothing about a place that has none',
    P.eventMatchesPlace(ev({ venue_id: V_HALL }), byName) === true)

  t('🔴 placeForEvent prefers the ANCHORED place when both could match by name', (() => {
    // ⚠️ THE ANCHORED PLACE IS SECOND IN THE LIST, deliberately: a single-pass `find` would return
    // the unanchored one and the test would pass for the wrong reason.
    const got = P.placeForEvent(ev({ venue_id: V_HALL }), [byName, anchored])
    return got && got.id === 'p-anchored'
  })())
  t('⚠️ …and falls back to the name when the event carries no anchor',
    P.placeForEvent(ev(), [byName, anchored])?.id === 'p-named')
  t('⚠️ an event at a place that does not exist matches nothing rather than the first row',
    P.placeForEvent(ev({ venue_name: 'Somewhere Else' }), [byName, anchored, pub]) === null)

  t('⚠️ grouping keeps every event and reports the unmatched ones separately', (() => {
    const r = P.groupEventsByPlace(
      [ev(), ev({ venue_name: 'Bull & Butcher' }), ev({ venue_name: 'Nowhere' })],
      [byName, pub])
    return r.byPlace.get('p-named')?.length === 1 && r.byPlace.get('p-pub')?.length === 1 && r.unmatched.length === 1
  })())

  // ── "NEXT" ───────────────────────────────────────────────────────────────────────────────────
  const TODAY = '2026-10-03'
  t('🔴 next is the SOONEST upcoming date', (() => {
    const n = P.nextEventAt([ev({ event_date: '2026-11-01' }), ev({ event_date: '2026-10-13' })], TODAY)
    return n?.event_date === '2026-10-13'
  })())
  t('🔴 a CANCELLED date is never next — it would send the operator to post about a pitch that is off',
    P.nextEventAt([ev({ event_date: '2026-10-10', status: 'cancelled' }), ev({ event_date: '2026-10-20' })], TODAY)?.event_date === '2026-10-20')
  t('🔴 …and neither is a CLOSED one',
    P.nextEventAt([ev({ event_date: '2026-10-10', status: 'closed' }), ev({ event_date: '2026-10-20' })], TODAY)?.event_date === '2026-10-20')
  t('⚠️ an UNCONFIRMED date IS next — it means "not reviewed yet", not "not happening"',
    P.nextEventAt([ev({ event_date: '2026-10-10', status: 'unconfirmed' })], TODAY)?.event_date === '2026-10-10')
  t('⚠️ TODAY counts as upcoming — the operator standing at tonight\'s pitch should not be shown next week',
    P.nextEventAt([ev({ event_date: TODAY })], TODAY)?.event_date === TODAY)
  t('⚠️ a past-only place has no next date', P.nextEventAt([ev({ event_date: '2026-09-01' })], TODAY) === null)
  t('⚠️ status matching is case- and space-insensitive, because it is free text in the table',
    P.isTradingStatus(' Cancelled ') === false && P.isTradingStatus('CLOSED') === false && P.isTradingStatus('confirmed') === true)

  // ── THE WORDING CHAIN ────────────────────────────────────────────────────────────────────────
  t('🔴 place wording wins; blank falls to the truck default; blank again falls to the built-in',
    P.effectiveGroupPostWording({ group_post_wording: 'At {place}!' }, { default_group_post_wording: 'truck words' }) === 'At {place}!'
    && P.effectiveGroupPostWording({ group_post_wording: null }, { default_group_post_wording: 'truck words' }) === 'truck words'
    && P.effectiveGroupPostWording(null, null) === P.DEFAULT_GROUP_POST_WORDING)
  t('⚠️ WHITESPACE IS BLANK. Selecting the text and deleting it leaves "   ", which means the same as never typing anything',
    P.effectiveGroupPostWording({ group_post_wording: '   ' }, { default_group_post_wording: 'truck words' }) === 'truck words')
  t('⚠️ the built-in default carries every token the card advertises',
    P.WORDING_TOKENS.every(tok => P.DEFAULT_GROUP_POST_WORDING.includes(tok)))

  // ── THE WINDOW ───────────────────────────────────────────────────────────────────────────────
  t('⚠️ the seed window starts 12 months back', P.seedWindowStart(new Date('2026-10-03T12:00:00Z')) === '2025-10-03')

  return { ok, bad }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2 · THE SEED, RUN TWICE
// ════════════════════════════════════════════════════════════════════════════════════════════════
/**
 * 🔴 A STAND-IN FOR THE DATABASE, ENFORCING THE ONE CONSTRAINT THAT MATTERS. `unique (truck_id,
 * name_key)` with `on conflict do nothing` is what the migration and the route actually rely on, so
 * this applier enforces exactly that and silently drops a colliding insert — as Postgres would. A
 * simulation that accepted every insert would prove the planner tidy and the product broken.
 */
function applyPlan(places, plan) {
  const next = places.map(p => ({ ...p }))
  const keys = new Set(next.map(p => p.name_key))
  let inserted = 0, dropped = 0
  for (const i of plan.inserts) {
    if (keys.has(i.name_key)) { dropped++; continue }   // ← on conflict do nothing
    keys.add(i.name_key)
    next.push({ id: `new-${i.name_key.replace(/\s/g, '-')}`, ...i, short_name: null, group_post_wording: null })
    inserted++
  }
  for (const a of plan.adopts) {
    const row = next.find(p => p.id === a.placeId)
    // ⚠️ `.is('venue_id', null)` AT THE CALL SITE IS MODELLED HERE: an already-adopted row is skipped.
    if (row && !row.venue_id) row.venue_id = a.venue_id
  }
  for (const f of plan.fills) {
    const row = next.find(p => p.id === f.placeId)
    if (!row) continue
    // ⚠️ BLANK-ONLY, as the two `.is(col, null)` statements in the route are.
    if (f.address !== undefined && !String(row.address ?? '').trim()) row.address = f.address
    if (f.postcode !== undefined && !String(row.postcode ?? '').trim()) row.postcode = f.postcode
  }
  return { places: next, inserted, dropped }
}

function runSeedSuite(P) {
  const ok = [], bad = []
  const t = (n, c) => (c ? ok : bad).push(n)
  const NOW = new Date('2026-10-03T12:00:00Z')

  // 🧪 A schedule shaped like the real one: an anchored hall, the same hall under a scruffier name on
  // another row, an unanchored pub, and a pitch outside the 12-month window.
  const SCHEDULE = [
    ev({ venue_id: V_HALL, event_date: '2026-10-13', venue_address: 'Church St, Lavenham', postcode: 'CO10 9QT' }),
    ev({ venue_id: V_HALL, event_date: '2026-10-20', venue_name: 'Lavenham Vill. Hall' }),
    ev({ venue_name: 'Bull & Butcher', event_date: '2026-10-15', address: 'The Green', postcode: 'CO10 1AA' }),
    ev({ venue_name: 'Long Gone Field', event_date: '2024-06-01' }),
  ]

  // ── RUN ONE ──────────────────────────────────────────────────────────────────────────────────
  const plan1 = P.planPlaceSeed({ events: SCHEDULE, places: [], now: NOW })
  const r1 = applyPlan([], plan1)
  t('🔴 a first run creates one place per distinct pitch in the window', r1.places.length === 2)
  t('⚠️ …an event OUTSIDE the 12-month window creates nothing',
    !r1.places.some(p => p.name_key === 'long gone field'))
  t('⚠️ …the anchored hall carries its venue_id, and its name is the one a person wrote',
    (() => { const h = r1.places.find(p => p.venue_id === V_HALL); return !!h && h.name === 'Lavenham Village Hall' })())
  t('⚠️ …address and postcode are seeded, venue_address preferred over address',
    (() => { const h = r1.places.find(p => p.venue_id === V_HALL); return h?.address === 'Church St, Lavenham' && h?.postcode === 'CO10 9QT' })())
  t('⚠️ …and the unanchored pub is keyed on the normalised name',
    r1.places.some(p => p.venue_id === null && p.name_key === 'bull and butcher' && p.name === 'Bull & Butcher'))

  // ── RUN TWO: THE REFRESH ─────────────────────────────────────────────────────────────────────
  const plan2 = P.planPlaceSeed({ events: SCHEDULE, places: r1.places, now: NOW })
  const r2 = applyPlan(r1.places, plan2)
  t('🔴 RUNNING IT TWICE CREATES NO DUPLICATES — the second run plans nothing at all',
    plan2.inserts.length === 0 && plan2.adopts.length === 0 && plan2.fills.length === 0 && r2.places.length === 2)
  const plan3 = P.planPlaceSeed({ events: SCHEDULE, places: r2.places, now: NOW })
  t('⚠️ …and a third run is still empty, so it is settled rather than alternating',
    plan3.inserts.length === 0 && plan3.adopts.length === 0 && plan3.fills.length === 0)

  // ── TWO TABS AT ONCE ─────────────────────────────────────────────────────────────────────────
  /* 🔴 BOTH TABS PLAN AGAINST THE SAME "BEFORE" STATE, which is the whole point: they read, then both
   * write. A check-then-insert in the route would produce two rows here. The unique index is what
   * makes the second insert a no-op, and `applyPlan` enforces it exactly as Postgres does. */
  const tabA = P.planPlaceSeed({ events: SCHEDULE, places: [], now: NOW })
  const tabB = P.planPlaceSeed({ events: SCHEDULE, places: [], now: NOW })
  const afterA = applyPlan([], tabA)
  const afterB = applyPlan(afterA.places, tabB)
  t('🔴 TWO TABS SEEDING AT ONCE PRODUCE ONE ROW EACH — the loser\'s inserts are dropped by the constraint',
    afterB.places.length === 2 && afterB.dropped === 2 && afterB.inserted === 0)

  // ── THE OPERATOR'S EDITS SURVIVE ─────────────────────────────────────────────────────────────
  /* 🔴 THE REQUIREMENT, STATED AS THE OPERATOR WOULD: they rename the hall for the public to read,
   * give it a short name, correct the address, and write their own wording. Then they refresh. */
  const edited = r2.places.map(p => p.venue_id === V_HALL
    ? { ...p, name: 'Lavenham Village Hall (back door)', short_name: 'Lavenham', address: '2 Church Street', group_post_wording: 'Our words' }
    : p)
  const planAfterEdit = P.planPlaceSeed({ events: SCHEDULE, places: edited, now: NOW })
  const afterEdit = applyPlan(edited, planAfterEdit)
  const hall = afterEdit.places.find(p => p.venue_id === V_HALL)
  t('🔴 AN OPERATOR-EDITED NAME SURVIVES A RE-RUN', hall?.name === 'Lavenham Village Hall (back door)')
  t('🔴 …and so does the SHORT NAME', hall?.short_name === 'Lavenham')
  t('🔴 …and the corrected ADDRESS is not overwritten by the event\'s', hall?.address === '2 Church Street')
  t('⚠️ …and the wording they typed is untouched', hall?.group_post_wording === 'Our words')
  t('🔴 …and the re-run plans NO write against that place at all — which is why the edit survives',
    !planAfterEdit.inserts.length
    && !planAfterEdit.adopts.some(a => a.placeId === hall?.id)
    && !planAfterEdit.fills.some(f => f.placeId === hall?.id))
  t('⚠️ a CLEARED optional field is not refilled on the next run either', (() => {
    const cleared = r2.places.map(p => p.venue_id === V_HALL ? { ...p, postcode: null } : p)
    const pl = P.planPlaceSeed({ events: SCHEDULE, places: cleared, now: NOW })
    // ⚠️ IT IS REFILLED, AND THAT IS THE DOCUMENTED LIMIT OF THE BLANK-ONLY RULE: with only the
    // brief's columns there is nowhere to record "deliberately empty". The NAME is what the
    // requirement protects and the name is never written twice. Asserted so the behaviour is a
    // decision on the record rather than a surprise.
    return pl.fills.some(f => f.placeId === cleared.find(p => p.venue_id === V_HALL).id && f.postcode === 'CO10 9QT')
  })())

  // ── A MANUAL PLACE IS ADOPTED, NOT DUPLICATED ────────────────────────────────────────────────
  const manual = [{ id: 'p-manual', venue_id: null, name_key: 'lavenham village hall', name: 'Lavenham Village Hall', short_name: 'Lavenham', address: null, postcode: null, group_post_wording: null }]
  const planAdopt = P.planPlaceSeed({ events: SCHEDULE, places: manual, now: NOW })
  const afterAdopt = applyPlan(manual, planAdopt)
  t('🔴 A HAND-TYPED PLACE THE SCHEDULE LATER ANCHORS IS ADOPTED, not duplicated',
    planAdopt.adopts.length === 1 && planAdopt.adopts[0].placeId === 'p-manual'
    && afterAdopt.places.filter(p => p.name_key === 'lavenham village hall').length === 1
    && afterAdopt.places.find(p => p.id === 'p-manual').venue_id === V_HALL)
  t('⚠️ …and the name they typed is still theirs after the adoption',
    afterAdopt.places.find(p => p.id === 'p-manual').name === 'Lavenham Village Hall'
    && afterAdopt.places.find(p => p.id === 'p-manual').short_name === 'Lavenham')
  t('⚠️ …and re-running after an adoption plans nothing', (() => {
    const again = P.planPlaceSeed({ events: SCHEDULE, places: afterAdopt.places, now: NOW })
    return !again.inserts.length && !again.adopts.length
  })())

  // ── THE SAME PITCH WITH AND WITHOUT AN ANCHOR IS ONE PLACE ───────────────────────────────────
  t('🔴 one pitch appearing once anchored and once not is ONE place, not two', (() => {
    const mixed = [ev({ venue_id: V_HALL, event_date: '2026-10-13' }), ev({ venue_id: null, event_date: '2026-10-27' })]
    const pl = P.planPlaceSeed({ events: mixed, places: [], now: NOW })
    const r = applyPlan([], pl)
    return r.places.length === 1 && r.places[0].venue_id === V_HALL
  })())

  // ── TWO VENUES, ONE NAME ─────────────────────────────────────────────────────────────────────
  t('🔴 TWO DIFFERENT VENUES WHOSE NAMES NORMALISE THE SAME keep ONE place and REPORT the other', (() => {
    const clash = [
      ev({ venue_id: V_HALL, venue_name: 'Village Hall', event_date: '2026-10-13' }),
      ev({ venue_id: V_HALL_OTHER, venue_name: 'Village hall', event_date: '2026-10-14' }),
    ]
    const pl = P.planPlaceSeed({ events: clash, places: [], now: NOW })
    const r = applyPlan([], pl)
    // 🔴 ONE place, and the collision is RECORDED rather than guessed at — merging two villages onto
    // one poster is the failure this refuses, and inventing a suffix would name a place the operator
    // never chose.
    return r.places.length === 1 && pl.collisions.length === 1 && pl.collisions[0].name_key === 'village hall'
  })())

  // ── AN UNUSABLE EVENT CREATES NOTHING ────────────────────────────────────────────────────────
  t('⚠️ an event with no readable venue name creates no place — an empty key would match everything', (() => {
    const pl = P.planPlaceSeed({ events: [ev({ venue_name: '   ' }), ev({ venue_name: '???' })], places: [], now: NOW })
    return pl.inserts.length === 0
  })())
  t('⚠️ a cancelled-only pitch STILL becomes a place — its groups are still the right ones', (() => {
    const pl = P.planPlaceSeed({ events: [ev({ venue_name: 'Off Pitch', status: 'cancelled' })], places: [], now: NOW })
    return pl.inserts.length === 1
  })())

  return { ok, bad }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 3 · THE WIRING — what the planner cannot prove
// ════════════════════════════════════════════════════════════════════════════════════════════════
function runWiringSuite() {
  const ok = [], bad = []
  const t = (n, c) => (c ? ok : bad).push(n)
  const SQL = read(MIGRATION)
  const R = stripComments(read(ROUTE))
  const T = stripComments(read(TAB))

  // ── THE DATABASE-LEVEL GUARANTEE ─────────────────────────────────────────────────────────────
  t('🔴 the migration declares the unique index the seed resolves against',
    /create unique index if not exists truck_places_truck_name_key_uidx\s+on public\.truck_places \(truck_id, name_key\)/.test(SQL))
  t('🔴 …and the per-anchor unique index, partial on venue_id',
    /create unique index if not exists truck_places_truck_venue_uidx[\s\S]{0,120}\(truck_id, venue_id\)[\s\S]{0,60}where venue_id is not null/.test(SQL))
  t('🔴 THE SEED IS `do nothing`, NOT `do update` — an update on conflict would overwrite the operator\'s name every refresh',
    /onConflict: 'truck_id,name_key', ignoreDuplicates: true/.test(R))
  t('🔴 the adopt is guarded by `.is(\'venue_id\', null)`, so a second tab cannot overwrite an anchor',
    /\.update\(\{ venue_id: a\.venue_id[\s\S]{0,140}\.is\('venue_id', null\)/.test(R))
  t('🔴 the two fills are blank-only, each with its own `.is(col, null)`',
    /update\(\{ address: f\.address[\s\S]{0,140}\.is\('address', null\)/.test(R)
    && /update\(\{ postcode: f\.postcode[\s\S]{0,140}\.is\('postcode', null\)/.test(R))

  // ── 🔴 `truck_events` AND `venues` ARE READ-ONLY ──────────────────────────────────────────────
  // The hard boundary of this stage, asserted from BOTH sides: no SQL statement against either table
  // in the migration, and no write builder against either in the route's schedule-graphics block.
  t('🔴 THE MIGRATION TOUCHES NEITHER `truck_events` NOR `venues`',
    !/\b(alter|insert|update|delete|drop)\b[\s\S]{0,40}\b(truck_events|venues)\b/i.test(stripSqlComments(SQL)))
  t('🔴 …and it references `venues` only as a FOREIGN KEY', /references public\.venues\(id\) on delete set null/.test(SQL))
  const sgBlock = R.slice(R.indexOf("const SG_FORBIDDEN"), R.indexOf("return NextResponse.json({ error: 'Unknown action' }"))
  t('🔴 NOTHING IN THE SCHEDULE-GRAPHICS ACTIONS WRITES `truck_events` OR `venues`',
    sgBlock.length > 500
    && !/from\('truck_events'\)\s*\n?\s*\.(insert|update|upsert|delete)/.test(sgBlock)
    && !/from\('venues'\)/.test(sgBlock))
  t('⚠️ …and the only `truck_events` access in that block is a select', (() => {
    const hits = [...sgBlock.matchAll(/from\('truck_events'\)([\s\S]{0,40})/g)].map(m => m[1])
    return hits.length === 1 && /\.select\(/.test(hits[0])
  })())

  // ── THE PLAN GATE ────────────────────────────────────────────────────────────────────────────
  t('🔴 EVERY schedule-graphics action checks the gate server-side',
    (sgBlock.match(/if \(!sgAllowed\(\)\) return SG_FORBIDDEN/g) || []).length === 4
    && (sgBlock.match(/if \(action === 'sg_/g) || []).length === 4)
  t('🔴 …through `canAccess` with the truck\'s overrides and trial expiry, not the plan alone',
    /canAccess\(truck\.plan, 'schedule_graphics', truck\.feature_overrides \?\? \{\}, truck\.trial_expires_at\)/.test(R))
  t('🔴 the Feature is on Pro, so Max and trial inherit it',
    /'schedule_graphics',/.test(read('lib/features.ts'))
    && read('lib/features.ts').indexOf("'schedule_graphics',") > read('lib/features.ts').indexOf('const PRO_FEATURES')
    && read('lib/features.ts').indexOf("'schedule_graphics',") < read('lib/features.ts').indexOf('const MAX_FEATURES'))
  t('🔴 a locked plan sees the TAB with an upgrade message — the gate wraps the content, not the nav entry',
    /<FeatureGate/.test(T) && /feature="schedule_graphics"/.test(T)
    && !/roles: \['owner', 'manager'\] \}.*graphics/.test(read('app/manage/[token]/page.tsx').replace(/\n/g, ' ').replace(/.*graphics'/, 'graphics\'')))
  t('⚠️ the writes are on the staff-blocked list, including the seeding read',
    /'sg_places', 'sg_upsert_place', 'sg_upsert_group', 'sg_delete_group',/.test(R))

  // ── THE NAV ENTRY ────────────────────────────────────────────────────────────────────────────
  const PAGE = read('app/manage/[token]/page.tsx')
  t('🔴 the nav entry exists, beside Schedule, for owner and manager',
    /\{ id: 'graphics',\s+label: 'Schedule graphics', icon: '🎨', roles: \['owner', 'manager'\] \}/.test(PAGE)
    && PAGE.indexOf("id: 'graphics'") > PAGE.indexOf("id: 'schedule'")
    && PAGE.indexOf("id: 'graphics'") < PAGE.indexOf("id: 'deals'"))
  t('⚠️ …and it renders the tab', /activeTab === 'graphics'\s+&& <ScheduleGraphicsTab/.test(PAGE))
  t('⚠️ the existing nav order is NOT reorganised — the other eight ids keep their relative order', (() => {
    const order = ['menu', 'schedule', 'deals', 'modifiers', 'reports', 'team', 'settings', 'payments', 'billing']
    const at = order.map(id => PAGE.indexOf(`id: '${id}'`))
    return at.every(i => i > 0) && at.every((v, i) => i === 0 || v > at[i - 1])
  })())

  // ── ONE NORMALISER ───────────────────────────────────────────────────────────────────────────
  t('🔴 THE ROUTE IMPORTS THE NORMALISER RATHER THAN RE-IMPLEMENTING IT',
    /from '@\/lib\/schedule-graphics\/places'/.test(R)
    && /normalisePlaceName/.test(R)
    && !/toLowerCase\(\)[\s\S]{0,80}replace\(\/&/.test(R))
  t('🔴 …and `name_key` is NOT re-derived when the operator renames a place — that would orphan every event at it',
    /patch\.name = name/.test(R) && !/patch\.name_key/.test(R))
  t('⚠️ exactly one module defines the normaliser, across lib/, app/ and components/', (() => {
    const hits = require('child_process').execFileSync('grep',
      ['-rl', '--include=*.ts', '--include=*.tsx', 'export function normalisePlaceName', 'lib', 'app', 'components'],
      { cwd: REPO, encoding: 'utf8' }).trim().split('\n')
    return hits.length === 1 && hits[0] === LIB
  })())

  // ── THE ACCESS PATTERN ───────────────────────────────────────────────────────────────────────
  t('🔴 both new tables are RLS-on, service-role-only, with the default grants REVOKED',
    ['truck_places', 'truck_place_groups'].every(tb =>
      new RegExp(`alter table public\\.${tb} enable row level security`).test(SQL)
      && new RegExp(`create policy "service_role only" on public\\.${tb}`).test(SQL)
      && new RegExp(`revoke all on public\\.${tb} from anon, authenticated, public`).test(SQL)))
  t('⚠️ the truck FK is TEXT on both, because trucks.id is text',
    (SQL.match(/truck_id text not null references public\.trucks\(id\) on delete cascade/g) || []).length === 2)
  t('🔴 the venue FK is `on delete set null`, so a shared venue row being deleted cannot take an operator\'s place with it',
    /venue_id uuid references public\.venues\(id\) on delete set null/.test(SQL))
  t('⚠️ the migration reloads the PostgREST schema cache', /notify pgrst, 'reload schema'/.test(SQL))
  t('⚠️ the truck-level default is a column on `trucks`, the house settings pattern',
    /alter table public\.trucks\s+add column if not exists default_group_post_wording text/.test(SQL))

  // ── SCOPING ──────────────────────────────────────────────────────────────────────────────────
  t('🔴 every write is scoped by truck_id as well as id, so knowing a uuid is not enough', (() => {
    const writes = [...sgBlock.matchAll(/from\('truck_place(?:s|_groups)'\)\s*\n?\s*\.(update|delete)\([\s\S]{0,320}?(?=\n\s*(?:if|const|return|\}|await|for))/g)]
    return writes.length >= 4 && writes.every(m => /\.eq\('truck_id', truck\.id\)/.test(m[0]))
  })())
  t('⚠️ a group insert verifies the place belongs to this truck first',
    /from\('truck_places'\)[\s\S]{0,160}\.eq\('id', placeId\)\.eq\('truck_id', truck\.id\)[\s\S]{0,200}if \(!owns\)/.test(sgBlock))

  // ── THE SHELL ────────────────────────────────────────────────────────────────────────────────
  t('⚠️ three sections, with Design and This week as placeholders',
    /\['design', 'Design'\], \['week', 'This week'\], \['places', 'Places & groups'\]/.test(T)
    && /Coming next/.test(T))
  t('⚠️ stage 2 and 3 are NOT started — no upload, no canvas, no checklist',
    !/<input[^>]*type="file"/.test(T) && !/canvas|toDataURL|html2canvas/i.test(T) && !/checklist/i.test(T))
  t('⚠️ one column until `lg`, two after — the brief\'s phone requirement',
    /grid-cols-1 lg:grid-cols-\[18rem_1fr\]/.test(T))
  t('⚠️ the group link opens in a new tab with `noopener`',
    /target="_blank" rel="noopener noreferrer"/.test(T))

  return { ok, bad }
}

/** `--` and `/* *\/` out of SQL, so a comment naming a table is not read as a statement against it. */
function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*--.*$/gm, '').replace(/--.*$/gm, '')
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 4 · THE BROKEN VARIANTS
// ════════════════════════════════════════════════════════════════════════════════════════════════
function changed(src, from, to, tag) {
  if (!src.includes(from)) { console.log(`🔴 ${tag}: THE ANCHOR IS GONE — \`${from.slice(0, 70)}\``); process.exit(1) }
  return src.split(from).join(to)
}

function runVariants() {
  const LIB_SRC = read(LIB)
  const NOW = new Date('2026-10-03T12:00:00Z')
  const SCHEDULE = [
    ev({ venue_id: V_HALL, event_date: '2026-10-13' }),
    ev({ venue_name: 'Bull & Butcher', event_date: '2026-10-15' }),
  ]

  // ── BEHAVIOURAL: the library is recompiled with one line broken ──────────────────────────────
  const libVariants = [
    ['W1 🔴 the normaliser stops collapsing whitespace',
      changed(LIB_SRC, "    .replace(/\\s+/g, ' ')\n    .trim()", "    .trim()", 'W1'),
      P => P.normalisePlaceName('Lavenham Village Hall') !== P.normalisePlaceName('lavenham   village hall ')],

    ['W2 🔴 the normaliser stops turning & into "and"',
      changed(LIB_SRC, "    .replace(/&/g, ' and ')\n", "", 'W2'),
      P => P.normalisePlaceName('Bull & Butcher') !== P.normalisePlaceName('Bull and Butcher')],

    ['W3 🔴 punctuation is DELETED rather than spaced, joining two words into one',
      changed(LIB_SRC, ".replace(/[^a-z0-9\\s]/g, ' ')", ".replace(/[^a-z0-9\\s]/g, '')", 'W3'),
      P => P.normalisePlaceName('Bull-and-Butcher') !== 'bull and butcher'],

    ['W4 🔴 THE NAME BEATS THE VENUE ANCHOR — two villages merged onto one poster',
      changed(LIB_SRC,
        '  if (event.venue_id && place.venue_id) return event.venue_id === place.venue_id',
        '  if (event.venue_id && place.venue_id && event.venue_id === place.venue_id) return true', 'W4'),
      P => P.eventMatchesPlace(ev({ venue_id: V_HALL_OTHER }), { id: 'x', venue_id: V_HALL, name_key: 'lavenham village hall' }) === true],

    ['W5 🔴 a cancelled date is offered as "next"',
      changed(LIB_SRC, "export const NON_TRADING_STATUSES = ['cancelled', 'closed'] as const",
        "export const NON_TRADING_STATUSES = ['closed'] as const", 'W5'),
      P => P.nextEventAt([ev({ event_date: '2026-10-10', status: 'cancelled' })], '2026-10-03') !== null],

    ['W6 🔴 THE SEEDER REWRITES `name` ON EVERY RUN — the operator\'s edit is reverted',
      changed(LIB_SRC,
        "    const existing = byVenue.get(g.venue_id!)\n    if (existing) { fillFrom(existing, g); continue }",
        "    const existing = byVenue.get(g.venue_id!)\n    if (existing) { plan.fills.push({ placeId: existing.id, address: seedOf(g).name ?? undefined }); fillFrom(existing, g); continue }", 'W6'),
      P => {
        const first = P.planPlaceSeed({ events: SCHEDULE, places: [], now: NOW })
        const r = applyPlan([], first)
        const edited = r.places.map(p => p.venue_id === V_HALL ? { ...p, name: 'MY NAME', address: null } : p)
        const again = P.planPlaceSeed({ events: SCHEDULE, places: edited, now: NOW })
        // The broken seeder plans a write against a place a second run should leave entirely alone.
        return again.fills.some(f => f.placeId === edited.find(p => p.venue_id === V_HALL).id)
      }],

    ['W7 🔴 a hand-typed place is DUPLICATED instead of adopted when the schedule anchors it',
      changed(LIB_SRC,
        "    if (sameKey && !sameKey.venue_id) {\n      plan.adopts.push({ placeId: sameKey.id, venue_id: g.venue_id! })\n      fillFrom(sameKey, g)\n      continue\n    }",
        "    if (sameKey && !sameKey.venue_id) { plan.inserts.push(seedOf(g)); continue }", 'W7'),
      P => {
        const manual = [{ id: 'p-manual', venue_id: null, name_key: 'lavenham village hall', name: 'Mine', address: null, postcode: null }]
        const pl = P.planPlaceSeed({ events: SCHEDULE, places: manual, now: NOW })
        return pl.adopts.length === 0 && pl.inserts.some(i => i.name_key === 'lavenham village hall')
      }],

    /* ⚠️ A VARIANT MUST STILL COMPILE. An earlier draft of this one wrapped the filter in `true || (`
     * and produced a syntax error — which `buildLib` exits on, so the harness reported a compile
     * failure instead of proving anything. The window is dropped by neutering its COMPARISON. */
    ['W8 🔴 the 12-month window is dropped, so a pitch from three years ago comes back as a place',
      changed(LIB_SRC, "e.event_date >= windowStart)", "e.event_date >= '0000-00-00')", 'W8'),
      P => {
        const pl = P.planPlaceSeed({ events: [ev({ venue_name: 'Long Gone Field', event_date: '2023-06-01' })], places: [], now: NOW })
        return pl.inserts.some(i => i.name_key === 'long gone field')
      }],
  ]

  let caughtAll = true
  for (const [label, src, detect] of libVariants) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sgplaces-'))
    fs.mkdirSync(path.join(root, path.dirname(LIB)), { recursive: true })
    fs.writeFileSync(path.join(root, LIB), src)
    let caught = false
    try { caught = detect(buildLib(root, label.slice(0, 2))) } catch { caught = true }
    console.log(`  ${caught ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  ${label}`)
    if (!caught) caughtAll = false
  }

  // ── SOURCE: the database-level guarantees the planner cannot express ─────────────────────────
  const srcVariants = [
    ['W9 🔴 `ignoreDuplicates` is dropped, so a conflict UPDATES and the operator\'s name is overwritten',
      changed(read(ROUTE), "{ onConflict: 'truck_id,name_key', ignoreDuplicates: true },", "{ onConflict: 'truck_id,name_key' },", 'W9'),
      s => /onConflict: 'truck_id,name_key', ignoreDuplicates: true/.test(stripComments(s))],
    ['W10 🔴 the unique index is removed from the migration, so two tabs make two places',
      changed(read(MIGRATION), 'create unique index if not exists truck_places_truck_name_key_uidx', 'create index if not exists truck_places_truck_name_key_uidx', 'W10'),
      s => /create unique index if not exists truck_places_truck_name_key_uidx/.test(s)],
    ['W11 🔴 a schedule-graphics action loses its plan gate',
      changed(read(ROUTE), "  if (action === 'sg_upsert_group') {\n    if (!sgAllowed()) return SG_FORBIDDEN", "  if (action === 'sg_upsert_group') {", 'W11'),
      s => (stripComments(s).match(/if \(!sgAllowed\(\)\) return SG_FORBIDDEN/g) || []).length === 4],
    ['W12 🔴 renaming a place re-derives `name_key`, orphaning every event at it',
      changed(read(ROUTE), '      patch.name = name', '      patch.name = name; patch.name_key = normalisePlaceName(name)', 'W12'),
      s => !/patch\.name_key/.test(stripComments(s))],
    ['W13 🔴 the RLS revoke is dropped from a new table, leaving it reachable with the anon key',
      changed(read(MIGRATION), 'revoke all on public.truck_place_groups from anon, authenticated, public;', '', 'W13'),
      s => /revoke all on public\.truck_place_groups from anon, authenticated, public/.test(s)],
    ['W14 🔴 a write loses its truck_id scope, so knowing a uuid is enough to delete another truck\'s group',
      changed(read(ROUTE), ".delete().eq('id', String(body.id ?? '')).eq('truck_id', truck.id)", ".delete().eq('id', String(body.id ?? ''))", 'W14'),
      s => /\.delete\(\)\.eq\('id', String\(body\.id \?\? ''\)\)\.eq\('truck_id', truck\.id\)/.test(stripComments(s))],
  ]
  for (const [label, src, stillTrue] of srcVariants) {
    const caught = !stillTrue(src)
    console.log(`  ${caught ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  ${label}`)
    if (!caught) caughtAll = false
  }

  if (!caughtAll) { console.log('\n🔴 A BROKEN VARIANT PASSED.'); process.exit(1) }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
;(function main() {
  console.log('── THE BROKEN VARIANTS — each must FAIL ────────────────────────────────────────────────')
  runVariants()

  const P = buildLib(REPO, 'real')
  const show = (title, r) => {
    console.log(`\n${title}`)
    for (const n of r.ok) console.log('  ✓ ' + n)
    for (const n of r.bad) console.log('  🔴 ' + n)
    fails += r.bad.length
    return r
  }
  const a = show('── 1 · THE NORMALISER AND THE MATCHING ─────────────────────────────────────────────────', runMatchingSuite(P))
  const b = show('── 2 · THE SEED, RUN TWICE (and by two tabs at once) ───────────────────────────────────', runSeedSuite(P))
  const c = show('── 3 · THE WIRING — gate, access pattern, nav, read-only boundary ──────────────────────', runWiringSuite())

  console.log(`\n${fails === 0 ? `✅ all ${a.ok.length + b.ok.length + c.ok.length} passed` : `🔴 ${fails} CHECK(S) FAILED`}`)
  process.exit(fails === 0 ? 0 : 1)
})()
