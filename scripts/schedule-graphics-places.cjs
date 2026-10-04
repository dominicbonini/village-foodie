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
const { codeColumns } = require('./_outreach-schema-census.cjs')

let fails = 0
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
/* 🔴 A LINE-BASED COMMENT FILTER, AND IT IS NOT THE SAME TOOL AS `stripComments`. That one pairs each
 * `/*` with the next `*\/` non-greedily, which MIS-PAIRS on app/manage/[token]/page.tsx — regex
 * literals and strings in there contain those characters — and silently swallows whole regions. It
 * cost three false failures in this file. This drops whole comment LINES only: enough to answer "is
 * this name mentioned in code or only in prose", and it cannot eat a region. */
const codeOnly = src => src.split('\n')
  .filter(l => { const t = l.trim(); return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*') })
  .join('\n')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')

const LIB = 'lib/schedule-graphics/places.ts'
const ROUTE = 'app/api/manage/route.ts'
const MIGRATION1 = 'supabase/migrations/20261003_truck_places.sql'
const MIGRATION2 = 'supabase/migrations/20261004_schedule_places_stage2.sql'
const PLACES_UI = 'components/manage/SchedulePlaces.tsx'
const PAGE = 'app/manage/[token]/page.tsx'
const EVENTS_ACTION = 'app/api/events/action/route.ts'
const PREVIEW_LIB = 'lib/schedule-graphics/event-preview.ts'
/** The eight section labels — the ONLY new user-visible words Settings is allowed to have gained. */
/* 🔴 THE ORDER CHANGED 3 October 2026 (operator request): Order settings and Truck settings moved
 * up to just after Contact, and Auto-replies moved down to just after QR code. The list, the markup
 * and this array are the three places the order is written, and the two checks below pin all three
 * to each other — the bug this guards is a tab that jumps to the wrong part of the page. */
const SETTINGS_LABELS = ['Truck details', 'Contact', 'Order settings', 'Truck settings',
  'Schedule', 'QR code', 'Auto-replies', 'Account deletion']
const SETTINGS_IDS = ['truck-details', 'contact', 'order-settings', 'truck-settings',
  'schedule', 'qr-code', 'auto-replies', 'account-deletion']
const DASH_ACTION = 'app/api/dashboard/action/route.ts'

/** Every TS file the suites need compiled. ⚠️ The variant loop copies the unpatched ones verbatim. */
const LIB_FILES = [LIB, PREVIEW_LIB]
/** Files the compiled ones IMPORT. `@/types` is mapped to the root, so it has to be there. */
const LIB_DEPS = ['types.ts']

function buildLib(root, tag) {
  const { out, req } = compile(root, LIB_FILES, tag)
  try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(out, 'node_modules')) } catch { /* already */ }
  const P = req('lib/schedule-graphics/places.js')
  // ⚠️ ATTACHED RATHER THAN RETURNED SEPARATELY, so every existing `runXSuite(P)` keeps its one
  // argument and the broken variants keep their one-module `detect(P)` signature.
  P.__preview = req('lib/schedule-graphics/event-preview.js')
  return P
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
  const TODAY = '2026-10-03'
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

  // ── THE MERGE RESOLUTION ─────────────────────────────────────────────────────────────────────
  const P_A = { id: 'a', name_key: 'a', name: 'A' }
  const P_B = { id: 'b', name_key: 'b', name: 'B' }
  const P_C = { id: 'c', name_key: 'c', name: 'C' }
  const ids = (arr) => P.placesById(arr)

  t('🔴 a merged place resolves to its target', (() => {
    const a = { ...P_A, merged_into_id: 'b', is_hidden: true }
    return P.resolvePlaceMerge(a, ids([a, P_B])).id === 'b'
  })())
  t('🔴 A CHAIN IS FOLLOWED TO THE END — A→B→C resolves to C, because nothing rewrites A when B moves', (() => {
    const a = { ...P_A, merged_into_id: 'b' }
    const b = { ...P_B, merged_into_id: 'c' }
    return P.resolvePlaceMerge(a, ids([a, b, P_C])).id === 'c'
  })())
  t('🔴 A CYCLE DOES NOT HANG — A→B→A returns a real place instead of looping for ever', (() => {
    const a = { ...P_A, merged_into_id: 'b' }
    const b = { ...P_B, merged_into_id: 'a' }
    const got = P.resolvePlaceMerge(a, ids([a, b]))
    return !!got && (got.id === 'a' || got.id === 'b')
  })())
  t('🔴 …and a chain longer than the cap stops rather than running away', (() => {
    // 🧪 Twelve places in a line, cap is 10. The answer is "as far as it got", never a throw.
    const chain = Array.from({ length: 12 }, (_, i) => ({
      id: `p${i}`, name_key: `p${i}`, name: `P${i}`,
      merged_into_id: i < 11 ? `p${i + 1}` : null,
    }))
    const got = P.resolvePlaceMerge(chain[0], ids(chain))
    return !!got && got.id === `p${P.MERGE_MAX_DEPTH}`
  })())
  t('⚠️ a pointer that cannot be followed keeps the place in hand rather than returning null', (() => {
    const a = { ...P_A, merged_into_id: 'gone' }
    return P.resolvePlaceMerge(a, ids([a])).id === 'a'
  })())

  t('🔴 MERGING A PLACE INTO ITSELF IS REFUSED', (() => {
    const r = P.mergeRefusal({ fromId: 'a', intoId: 'a', places: [P_A, P_B] })
    return typeof r === 'string' && /itself/.test(r)
  })())
  t('🔴 …and so is merging B into A when A is already merged into B (the cycle, before it is written)', (() => {
    const a = { ...P_A, merged_into_id: 'b' }
    return typeof P.mergeRefusal({ fromId: 'b', intoId: 'a', places: [a, P_B] }) === 'string'
  })())
  t('⚠️ a merge into a place that is gone is refused rather than written',
    typeof P.mergeRefusal({ fromId: 'a', intoId: 'nope', places: [P_A] }) === 'string')
  t('🔴 a legitimate merge is allowed, and the patch hides the merged place in the same write', (() => {
    const patch = P.mergePatch({ fromId: 'a', intoId: 'b', places: [P_A, P_B] })
    return P.mergeRefusal({ fromId: 'a', intoId: 'b', places: [P_A, P_B] }) === null
      && patch.placeId === 'a' && patch.merged_into_id === 'b' && patch.is_hidden === true
  })())
  t('🔴 MERGING INTO AN ALREADY-MERGED PLACE LANDS ON THE FINAL TARGET, not on the middle one', (() => {
    const b = { ...P_B, merged_into_id: 'c' }
    const patch = P.mergePatch({ fromId: 'a', intoId: 'b', places: [P_A, b, P_C] })
    // ⚠️ Otherwise the chain grows a step every merge and the depth cap gets closer for no reason.
    return patch.merged_into_id === 'c'
  })())

  // ── MATCHING THROUGH A MERGE, AND `truck_place_id` FIRST ─────────────────────────────────────
  t('🔴 `truck_place_id` OUTRANKS EVERYTHING — including a venue anchor pointing elsewhere', (() => {
    const picked = { id: 'picked', venue_id: null, name_key: 'somewhere else' }
    const anchored = { id: 'anchored', venue_id: V_HALL, name_key: 'lavenham village hall' }
    const e = ev({ truck_place_id: 'picked', venue_id: V_HALL })
    return P.placeForEvent(e, [anchored, picked])?.id === 'picked'
  })())
  t('⚠️ …and a link to a place that is no longer there falls back to the anchor rather than to null', (() => {
    const anchored = { id: 'anchored', venue_id: V_HALL, name_key: 'lavenham village hall' }
    return P.placeForEvent(ev({ truck_place_id: 'deleted', venue_id: V_HALL }), [anchored])?.id === 'anchored'
  })())
  t('🔴 B GAINS A\'S EVENTS THROUGH MATCHING, with no event row touched', (() => {
    const a = { id: 'a', venue_id: null, name_key: 'bull and butcher', merged_into_id: 'b', is_hidden: true }
    const b = { id: 'b', venue_id: null, name_key: 'the bull' }
    // The old name still resolves — which is the entire point of merging.
    return P.placeForEvent(ev({ venue_name: 'Bull & Butcher' }), [a, b])?.id === 'b'
  })())
  t('⚠️ …including when the event was LINKED to the merged place', (() => {
    const a = { id: 'a', venue_id: null, name_key: 'a', merged_into_id: 'b', is_hidden: true }
    const b = { id: 'b', venue_id: null, name_key: 'b' }
    return P.placeForEvent(ev({ truck_place_id: 'a' }), [a, b])?.id === 'b'
  })())
  t('⚠️ …and when it was ANCHORED to it', (() => {
    const a = { id: 'a', venue_id: V_HALL, name_key: 'a', merged_into_id: 'b', is_hidden: true }
    const b = { id: 'b', venue_id: null, name_key: 'b' }
    return P.placeForEvent(ev({ venue_id: V_HALL }), [a, b])?.id === 'b'
  })())

  // ── LAST, THE COUNT, AND THE LIST ORDER ──────────────────────────────────────────────────────
  t('🔴 "Last" is the most recent PAST trading date', (() => {
    const l = P.lastEventAt([ev({ event_date: '2026-09-01' }), ev({ event_date: '2026-09-22' }), ev({ event_date: '2026-10-20' })], TODAY)
    return l?.event_date === '2026-09-22'
  })())
  t('🔴 …and Next and Last never both claim today — Next takes it, Last is strictly before', (() => {
    const only = [ev({ event_date: TODAY })]
    return P.nextEventAt(only, TODAY)?.event_date === TODAY && P.lastEventAt(only, TODAY) === null
  })())
  t('⚠️ a cancelled past date is not a time the truck traded there',
    P.lastEventAt([ev({ event_date: '2026-09-22', status: 'cancelled' })], TODAY) === null)
  t('🔴 the count is the last 365 days, past and today, never the future', (() => {
    const evs = [
      ev({ event_date: '2025-09-01' }),  // older than a year — out
      ev({ event_date: '2026-01-10' }),
      ev({ event_date: '2026-09-22' }),
      ev({ event_date: TODAY }),
      ev({ event_date: '2026-11-01' }),  // future — out of a past-tense count
      // 🔴 CLOSED COUNTS, and this line used to expect it OUT — which was bug 3 written into the
      // harness. A closed event is the clearest evidence the truck traded there.
      ev({ event_date: '2026-09-23', status: 'closed' }),
      ev({ event_date: '2026-09-24', status: 'cancelled' }),  // cancelled — out
    ]
    return P.tradedCountInLastYear(evs, TODAY) === 4
  })())

  // ── 🔴 BUG 3: TWO STATUS RULES, NAMED SEPARATELY ─────────────────────────────────────────────
  t('🔴 `closed` COUNTS AS TRADED — it is the normal end state of an event that happened',
    P.countsAsTraded('closed') === true && P.countsAsTraded('confirmed') === true
    && P.countsAsTraded('unconfirmed') === true && P.countsAsTraded('cancelled') === false)
  t('🔴 …and `closed` is NOT upcoming — a pitch that is over is never "next"',
    P.countsAsUpcoming('closed') === false && P.countsAsUpcoming('cancelled') === false
    && P.countsAsUpcoming('confirmed') === true && P.countsAsUpcoming('unconfirmed') === true)
  t('🔴 THE REPORTED SYMPTOM, END TO END: a place whose only event is a CLOSED past one shows it as Last',
    P.lastEventAt([ev({ event_date: '2026-09-22', status: 'closed' })], TODAY)?.event_date === '2026-09-22')
  t('⚠️ both rules are case- and space-insensitive, because status is free text in the table',
    P.countsAsTraded(' Cancelled ') === false && P.countsAsUpcoming('CLOSED') === false)

  // ── 🔴 BUG 4: THE MUTED LINE ───────────────────────────────────────────────────────────────────
  const day = (d) => (d === '2026-10-06' ? 'Mon 6 Oct' : d === '2026-10-20' ? 'Tue 20 Oct' : String(d))
  t('🔴 THE LINE CARRIES THE TIMES, 24-hour and trimmed to HH:MM',
    P.placeWhenLine({ last_event_date: '2026-10-06', last_start_time: '17:00:00', last_end_time: '20:00:00' }, day)
      === 'Last: Mon 6 Oct · 17:00–20:00')
  t('🔴 LAST FIRST. A place with both a past and a future date shows the PAST one — it is the visit whose times picking the place will copy',
    P.placeWhenLine({ last_event_date: '2026-10-06', last_start_time: '17:00:00', last_end_time: '20:00:00', next_event_date: '2026-10-20' }, day)
      .startsWith('Last: Mon 6 Oct'))
  t('⚠️ …and Next only when there is no past visit',
    P.placeWhenLine({ next_event_date: '2026-10-20', next_start_time: '12:00:00', next_end_time: '15:00:00' }, day)
      === 'Next: Tue 20 Oct · 12:00–15:00')
  t('⚠️ an event with no times shows the date alone rather than a dangling separator',
    P.placeWhenLine({ last_event_date: '2026-10-06' }, day) === 'Last: Mon 6 Oct')
  t('⚠️ "No events yet" only when there is genuinely neither',
    P.placeWhenLine({}, day) === 'No events yet')
  t('⚠️ `timeRangeLabel` trims seconds and handles a missing end time',
    P.timeRangeLabel('17:00:00', '20:00:00') === '17:00–20:00'
    && P.timeRangeLabel('17:00:00', null) === '17:00'
    && P.timeRangeLabel(null, null) === '')
  t('⚠️ the 365-day boundary is computed in UTC, not through a local timezone',
    P.ymdMinusDays('2026-10-03', 365) === '2025-10-03' && P.ymdMinusDays('2026-03-01', 1) === '2026-02-28')

  t('🔴 FAVOURITES FIRST, each group alphabetical', (() => {
    const list = [
      { id: '1', name_key: 'z', name: 'Zebra Field', is_favourite: false },
      { id: '2', name_key: 'b', name: 'Bull & Butcher', is_favourite: true },
      { id: '3', name_key: 'a', name: 'Ash Green', is_favourite: false },
      { id: '4', name_key: 'l', name: 'Lavenham Hall', is_favourite: true },
    ]
    return P.visiblePlaces(list).map(x => x.name).join('|') === 'Bull & Butcher|Lavenham Hall|Ash Green|Zebra Field'
  })())
  t('🔴 a HIDDEN or MERGED place is not in the list, and `showHidden` brings it back', (() => {
    const list = [
      { id: '1', name_key: 'a', name: 'A', is_favourite: false },
      { id: '2', name_key: 'b', name: 'B', is_favourite: false, is_hidden: true },
      { id: '3', name_key: 'c', name: 'C', is_favourite: false, merged_into_id: '1' },
    ]
    return P.visiblePlaces(list).length === 1 && P.visiblePlaces(list, true).length === 3
  })())

  // ── 🔴 THE LIVE PREVIEW, AS A RULE ───────────────────────────────────────────────────────────
  const EP = P.__preview
  // ⚠️ `pDay`, not `day` — the bug-4 suite above already declares a `day` in this scope.
  const pDay = (d) => (d === '2026-10-13' ? 'Tue 13 Oct' : String(d))

  t('🔴 A HALF-EMPTY FORM NEVER YIELDS "undefined" OR "Invalid date"', (() => {
    const ev0 = EP.previewEventFromForm({ form: {}, truckName: '' })
    const vals = Object.values(ev0).filter(v => typeof v === 'string')
    return vals.every(v => !/undefined|Invalid|NaN|null/i.test(v))
      && ev0.venueName === EP.PREVIEW_PLACEHOLDERS.venue
      && ev0.date === EP.PREVIEW_PLACEHOLDERS.date
      && ev0.startTime === EP.PREVIEW_PLACEHOLDERS.time
      && ev0.endTime === EP.PREVIEW_PLACEHOLDERS.time
  })())
  /* ⚠️ A COMPLETE DATE NOW COMES OUT AS 'DD/MM/YYYY', NOT 'YYYY-MM-DD' (corrected 5 October 2026).
   * This check used to assert the ISO string went straight through, which was the bug: the card splits
   * on '/' and printed "2026-10-13" verbatim. The PARTIAL half of the check is unchanged — a
   * half-typed date must still become the prompt rather than be handed over to parse. */
  t('🔴 …and a PARTIAL date is the placeholder, never handed to the card to parse',
    EP.previewEventFromForm({ form: { event_date: '2026-10' }, truckName: 'T' }).date === EP.PREVIEW_PLACEHOLDERS.date
    && EP.previewEventFromForm({ form: { event_date: '2026-10-13' }, truckName: 'T' }).date === '13/10/2026')
  t('⚠️ a filled form maps straight through', (() => {
    const e = EP.previewEventFromForm({
      form: { venue_name: 'Lavenham Village Hall', town: 'Lavenham', postcode: 'CO10 9QT', event_date: '2026-10-13', start_time: '17:00', end_time: '20:00' },
      truckName: 'Village Spice',
    })
    return e.venueName === 'Lavenham Village Hall' && e.town === 'Lavenham'
      && e.postcode === 'CO10 9QT' && e.startTime === '17:00' && e.truckName === 'Village Spice'
  })())
  t('🔴 the preview is never ORDERABLE — an unsaved event must not offer a working CTA',
    EP.previewEventFromForm({ form: {}, truckName: 'T' }).status === 'unconfirmed')
  t('⚠️ the `id` is a FIXED sentinel, so typing does not remount the card',
    EP.previewEventFromForm({ form: { venue_name: 'a' }, truckName: 'T' }).id
      === EP.previewEventFromForm({ form: { venue_name: 'b' }, truckName: 'T' }).id)
  t('⚠️ `previewIsComplete` needs all four of venue, date and both times',
    EP.previewIsComplete({ venue_name: 'X', event_date: '2026-10-13', start_time: '17:00', end_time: '20:00' }) === true
    && EP.previewIsComplete({ venue_name: 'X', event_date: '2026-10-13', start_time: '17:00' }) === false
    && EP.previewIsComplete({}) === false)

  t('🔴 THE PHONE LINE DROPS EMPTY PARTS rather than printing separators around them', (() => {
    const only = EP.previewLine({ form: { venue_name: 'Lavenham Village Hall' }, fmtDay: pDay, fmtTimes: P.timeRangeLabel })
    return only === 'Lavenham Village Hall'
  })())
  t('⚠️ …and builds the whole line when the form is filled',
    EP.previewLine({
      form: { venue_name: 'Lavenham Village Hall', event_date: '2026-10-13', start_time: '17:00:00', end_time: '20:00:00' },
      vanName: 'Van 2', fmtDay: pDay, fmtTimes: P.timeRangeLabel,
    }) === 'Lavenham Village Hall · Tue 13 Oct · 17:00–20:00 · Van 2')
  t('⚠️ …with the venue placeholder when nothing is typed yet',
    EP.previewLine({ form: {}, fmtDay: pDay, fmtTimes: P.timeRangeLabel }) === EP.PREVIEW_PLACEHOLDERS.venue)

  // ── 🔴 THE VAN DEFAULT ───────────────────────────────────────────────────────────────────────
  const VA = 'van-a', VB = 'van-b', VGONE = 'van-gone'
  t('🔴 the van is the one used at the MOST RECENT non-cancelled event here',
    EP.vanForPlace({
      events: [
        { event_date: '2026-09-01', status: 'closed', van_id: VA },
        { event_date: '2026-09-22', status: 'closed', van_id: VB },
      ],
      activeVanIds: [VA, VB],
    }) === VB)
  t('🔴 A CANCELLED EVENT NEVER DECIDES IT',
    EP.vanForPlace({
      events: [
        { event_date: '2026-09-30', status: 'cancelled', van_id: VA },
        { event_date: '2026-09-01', status: 'closed', van_id: VB },
      ],
      activeVanIds: [VA, VB],
    }) === VB)
  t('🔴 AN INACTIVE VAN IS NEVER PRE-SELECTED — a new event must not land on a screen nobody watches',
    EP.vanForPlace({
      events: [{ event_date: '2026-09-30', status: 'closed', van_id: VGONE }],
      activeVanIds: [VA],
    }) === null)
  t('🔴 …and no history at all returns null, so the field stays "Select a van"',
    EP.vanForPlace({ events: [], activeVanIds: [VA] }) === null
    && EP.vanForPlace({ events: [{ event_date: '2026-09-30', status: 'closed', van_id: null }], activeVanIds: [VA] }) === null)
  t('⚠️ `closed` DOES decide it — the same split as Last/Next: a closed event is what actually traded',
    EP.vanForPlace({ events: [{ event_date: '2026-09-30', status: 'closed', van_id: VA }], activeVanIds: [VA] }) === VA)
  /* ⚠️ CODE ONLY: the comment inside `vanForPlace` explains why `new Date()` is wrong, so it contains
   * the very string being searched for. A comment is not a call. */
  t('⚠️ the ordering is string comparison on the date, never `new Date()` on a date-only value',
    (() => {
      const src = read(PREVIEW_LIB)
      const fn = codeOnly(src.slice(src.indexOf('export function vanForPlace')))
      return !/new Date\(/.test(fn) && /localeCompare\(String\(a\.event_date\)\)/.test(fn)
    })())

  // ── WHAT PICKING A PLACE FILLS ───────────────────────────────────────────────────────────────
  const emptyForm = { venue_name: '', address: '', town: '', postcode: '', start_time: '', end_time: '' }
  t('🔴 PICKING A PLACE FILLS THE FIVE FIELDS, AND THE TIMES COME FROM ITS LAST EVENT', (() => {
    const f = P.fillFromPlace({
      name: 'Lavenham Village Hall', address: 'Church St', area: 'Lavenham', postcode: 'CO10 9QT',
      last_start_time: '17:00:00', last_end_time: '20:00:00',
    }, emptyForm)
    return f.venue_name === 'Lavenham Village Hall' && f.address === 'Church St'
      && f.town === 'Lavenham' && f.postcode === 'CO10 9QT'
      && f.start_time === '17:00' && f.end_time === '20:00'
  })())
  t('🔴 THE DATE IS NEVER FILLED — a past event\'s date is how tonight\'s pitch lands in September',
    !('event_date' in P.fillFromPlace({ name: 'X' }, emptyForm)))
  t('🔴 A BLANK FIELD ON THE PLACE KEEPS WHAT IS ALREADY TYPED', (() => {
    const typed = { venue_name: 'typed', address: '12 High St', town: 'Clare', postcode: 'CO10 8NY', start_time: '18:00', end_time: '21:00' }
    const f = P.fillFromPlace({ name: 'The Crown', address: null, area: '', postcode: null, last_start_time: null, last_end_time: null }, typed)
    return f.venue_name === 'The Crown' && f.address === '12 High St' && f.town === 'Clare'
      && f.postcode === 'CO10 8NY' && f.start_time === '18:00' && f.end_time === '21:00'
  })())
  t('⚠️ seconds are trimmed off the times, because the form holds HH:MM',
    P.fillFromPlace({ last_start_time: '09:30:00' }, emptyForm).start_time === '09:30')

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

  // ── 🔴 THE SEEDER RESPECTS WHAT THE OPERATOR DECIDED ─────────────────────────────────────────
  /* These four are the rules that stop the seeder undoing a person's work on the next refresh. Each
   * one is "the seeder found the row and left it alone", which is a different outcome from both
   * "created a duplicate" and "wrote to it". */
  const HIDDEN_SCHEDULE = [ev({ venue_name: 'Bull & Butcher', event_date: '2026-10-15', postcode: 'CO10 1AA', town: 'Clare' })]

  t('🔴 A HIDDEN PLACE IS NOT RE-CREATED, and is not written to either', (() => {
    const hidden = [{ id: 'h', venue_id: null, name_key: 'bull and butcher', name: 'Bull & Butcher', is_hidden: true, address: null, postcode: null, area: null }]
    const pl = P.planPlaceSeed({ events: HIDDEN_SCHEDULE, places: hidden, now: NOW })
    const r = applyPlan(hidden, pl)
    return pl.inserts.length === 0 && pl.fills.length === 0 && pl.adopts.length === 0
      && r.places.length === 1 && r.places[0].is_hidden === true
  })())
  t('🔴 A MERGED PLACE IS NOT RE-CREATED, and its pointer is never cleared', (() => {
    const merged = [
      { id: 'a', venue_id: null, name_key: 'bull and butcher', name: 'Bull & Butcher', merged_into_id: 'b', is_hidden: true },
      { id: 'b', venue_id: null, name_key: 'the bull', name: 'The Bull' },
    ]
    const pl = P.planPlaceSeed({ events: HIDDEN_SCHEDULE, places: merged, now: NOW })
    const r = applyPlan(merged, pl)
    return pl.inserts.length === 0 && pl.fills.length === 0
      && r.places.find(x => x.id === 'a').merged_into_id === 'b'
      && r.places.find(x => x.id === 'a').is_hidden === true
  })())
  t('🔴 …AND NOTHING THE SEEDER PLANS EVER NAMES `is_hidden` OR `merged_into_id`', (() => {
    // The structural version of the two above: whatever the schedule says, those two columns are not
    // in the seeder's vocabulary at all. A new event arriving is not new information about a decision.
    const pl = P.planPlaceSeed({ events: SCHEDULE, places: [], now: NOW })
    const json = JSON.stringify(pl)
    return !json.includes('is_hidden') && !json.includes('merged_into_id')
  })())
  t('⚠️ an ANCHORED event whose name_key belongs to a hidden place does not adopt it either', (() => {
    const hidden = [{ id: 'h', venue_id: null, name_key: 'lavenham village hall', name: 'Lavenham Village Hall', is_hidden: true }]
    const pl = P.planPlaceSeed({ events: [ev({ venue_id: V_HALL, event_date: '2026-10-13' })], places: hidden, now: NOW })
    // 🔴 Adopting would quietly attach a venue anchor to a row the operator removed from view, and an
    // insert would collide on the unique key. It is reported instead.
    return pl.adopts.length === 0 && pl.inserts.length === 0 && pl.collisions.length === 1
  })())
  t('🔴 A FAVOURITE SURVIVES A RE-SEED — nothing the seeder plans mentions it', (() => {
    const fav = [{ id: 'f', venue_id: null, name_key: 'bull and butcher', name: 'Bull & Butcher', is_favourite: true, address: null, postcode: null, area: null }]
    const pl = P.planPlaceSeed({ events: HIDDEN_SCHEDULE, places: fav, now: NOW })
    const r = applyPlan(fav, pl)
    return !JSON.stringify(pl).includes('is_favourite') && r.places[0].is_favourite === true
  })())
  t('⚠️ …while its blank address and area ARE filled, because those are not decisions', (() => {
    const fav = [{ id: 'f', venue_id: null, name_key: 'bull and butcher', name: 'Bull & Butcher', is_favourite: true, address: null, postcode: null, area: null }]
    const pl = P.planPlaceSeed({ events: HIDDEN_SCHEDULE, places: fav, now: NOW })
    const f = pl.fills.find(x => x.placeId === 'f')
    return !!f && f.postcode === 'CO10 1AA' && f.area === 'Clare'
  })())
  t('🔴 `area` IS SEEDED FROM THE EVENT\'S `town` on a fresh insert', (() => {
    const pl = P.planPlaceSeed({ events: HIDDEN_SCHEDULE, places: [], now: NOW })
    return pl.inserts.length === 1 && pl.inserts[0].area === 'Clare'
  })())

  return { ok, bad }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 3 · THE WIRING — what the planner cannot prove
// ════════════════════════════════════════════════════════════════════════════════════════════════
/* ⚠️ `lib` IS THE COMPILED LIBRARY, PASSED IN. This suite's own `P` is the PAGE'S SOURCE TEXT, so the
 * date check below — which has to RUN `previewEventFromForm` rather than grep for it — needs the real
 * module. The other two suites already take it; this one did not until the date fix needed it. */
function runWiringSuite(lib) {
  const ok = [], bad = []
  const t = (n, c) => (c ? ok : bad).push(n)
  const SQL1 = read(MIGRATION1)
  const SQL2 = read(MIGRATION2)
  const R = stripComments(read(ROUTE))
  const U = stripComments(read(PLACES_UI))
  const P = stripComments(read(PAGE))

  // ════════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE `truck_events` AUDIT — the one that matters, because that table runs live ordering
  // ════════════════════════════════════════════════════════════════════════════════════════════
  /* Read off the TypeScript AST by the schema census's own payload reader, over `truck_events`
   * specifically. ⚠️ `truck_events` IS NOT IN THE CENSUS'S `TABLES` and must not be — it predates
   * supabase/migrations/ and has no `create table` there, so censusing it would report every column
   * it names as missing. This asks the reader about its WRITES; it checks nothing against SQL. */
  const ev = codeColumns(REPO, ['app', 'lib', 'components'], { tables: ['truck_events'] })
  const writes = ev.named.filter(n => ['insert', 'update', 'upsert'].includes(n.method))
  const placeWrites = writes.filter(n => n.col === 'truck_place_id')

  t('🔴 EXACTLY ONE WRITE PATH NAMES `truck_place_id`, and it is an INSERT',
    placeWrites.length === 1 && placeWrites[0].method === 'insert' && placeWrites[0].file === ROUTE)
  for (const w of placeWrites) console.log(`      · ${w.method} ${w.file}:${w.line}`)
  t('🔴 NO `update` OR `upsert` ANYWHERE NAMES IT — an edit cannot move an event\'s place',
    writes.filter(n => n.col === 'truck_place_id' && n.method !== 'insert').length === 0)

  /* 🔴 THE FOUR PAYLOADS THE AST READER CANNOT FULLY RESOLVE, CHECKED BY HAND AND NAMED. A reader
   * that cannot read a payload proves nothing about it, so each is asserted on its own terms. These
   * are listed in the report as the paths that were checked. */
  const unread = ev.unreadWrites.filter(w => w.method !== 'insert')
  t(`⚠️ exactly ${unread.length} truck_events write payloads are not literal, and each is checked below`,
    unread.length === 3)
  for (const u of unread) console.log(`      ? ${u.file}:${u.line} .${u.method}() — ${u.parts.join('; ').slice(0, 60)}`)

  const D = stripComments(read(DASH_ACTION))
  const E = stripComments(read(EVENTS_ACTION))
  t('🔴 (1) dashboard set_paused — a ternary of two LITERAL objects, neither naming the column',
    /const patch = resuming\s*\n?\s*\? \{ paused_until: null, online_paused_until: null \}\s*\n?\s*: \{ paused_until \}/.test(D))
  t('🔴 (2) events/action van backfill — a ternary of literals, neither naming the column',
    /\(!ev\?\.van_id\) \? \{ van_id: soleVanId \} :/.test(E) && !/truck_place_id/.test(E))
  t('🔴 (3) events/action `update` — an ALLOWLIST of 8 columns, and `truck_place_id` is not one',
    (() => {
      const m = E.match(/const allowed = \[([\s\S]*?)\]/)
      if (!m) return false
      const cols = m[1].split(',').map(x => x.trim().replace(/^'|'$/g, '')).filter(Boolean)
      return cols.length === 8 && !cols.includes('truck_place_id')
    })())
  t('🔴 …so a client PATCHing `truck_place_id` is DROPPED, not written',
    /Object\.fromEntries\(\s*\n?\s*Object\.entries\(payload\)\.filter\(\(\[k\]\) => allowed\.includes\(k\)\)/.test(E))

  t('🔴 THE EVENT EDIT BRANCH NAMES ITS COLUMNS AND `truck_place_id` IS NOT AMONG THEM',
    /from\('truck_events'\)\.update\(\{ venue_name, town: town \?\? null[^}]*\}\)/.test(R)
    && !/from\('truck_events'\)\.update\(\{[^}]*truck_place_id/.test(R))
  t('⚠️ …and the handler destructures a FIXED list, so nothing spreads `body` into a write',
    /const \{ id, venue_name, town, postcode, address, event_date, start_time, end_time, notes, latitude, longitude, van_id \} = body/.test(R)
    && !/from\('truck_events'\)\.(update|insert)\(\{ \.\.\.body/.test(R))
  t('🔴 NOTHING IN THE TREE UPDATES `truck_events` FROM A SPREAD OF THE REQUEST BODY',
    !/from\('truck_events'\)[\s\S]{0,60}\.update\(\{?\s*\.\.\.(body|payload)\b/.test(R + D + E))

  /* 🔴 THE INSERT PAYLOAD IS TODAY'S PLUS EXACTLY ONE KEY — compared against the commit this branch
   * started from, not against a list typed out here. A hand-written expectation would drift. */
  t('🔴 THE ADD-EVENT INSERT IS BYTE-FOR-BYTE TODAY\'S PLUS `truck_place_id` AND NOTHING ELSE', (() => {
    const keysOf = (src) => {
      const i = src.indexOf("from('truck_events').insert({ truck_id: targetTruckId")
      if (i === -1) return null
      const open = src.indexOf('{', src.indexOf('insert(', i))
      let depth = 0, end = open
      for (let j = open; j < src.length; j++) {
        if (src[j] === '{') depth++
        else if (src[j] === '}') { depth--; if (depth === 0) { end = j; break } }
      }
      return [...src.slice(open + 1, end).matchAll(/(?:^|,)\s*([a-z_]+)\s*:/g)].map(m => m[1])
    }
    const now = keysOf(R)
    let before = null
    try {
      before = keysOf(stripComments(require('child_process')
        .execFileSync('git', ['show', 'cebc78e:app/api/manage/route.ts'], { cwd: REPO, encoding: 'utf8', maxBuffer: 32e6 })))
    } catch { return false }
    if (!now || !before) return false
    const added = now.filter(k => !before.includes(k))
    const gone = before.filter(k => !now.includes(k))
    console.log(`      insert keys: ${before.length} before → ${now.length} now · added [${added.join(', ')}] · removed [${gone.join(', ')}]`)
    return gone.length === 0 && added.length === 1 && added[0] === 'truck_place_id'
  })())

  t('🔴 THE STAGE-2 MIGRATION ADDS ONE NULLABLE COLUMN TO `truck_events` AND NOTHING ELSE', (() => {
    const sql = stripSqlComments(SQL2)
    const evStmts = [...sql.matchAll(/alter table public\.truck_events([\s\S]*?);/g)].map(m => m[1])
    return evStmts.length === 1
      && /add column if not exists truck_place_id uuid references public\.truck_places\(id\) on delete set null/.test(evStmts[0])
      && !/\bdefault\b/.test(evStmts[0])
      && !/not null/.test(evStmts[0])
  })())
  t('🔴 …and NO update/insert/delete against `truck_events` or `venues` in either migration',
    !/\b(insert into|update|delete from)\b[\s\S]{0,40}\b(truck_events|venues)\b/i.test(stripSqlComments(SQL1 + SQL2)))
  t('🔴 `on delete set null`, never cascade — deleting a place must not delete a trading record',
    /truck_place_id uuid references public\.truck_places\(id\) on delete set null/.test(SQL2)
    && !/truck_place_id[^;]*on delete cascade/.test(SQL2))
  t('⚠️ …and the index is on the new column only, so no existing query plan can change',
    /create index if not exists truck_events_truck_place_idx\s+on public\.truck_events \(truck_place_id\)/.test(SQL2))

  // ════════════════════════════════════════════════════════════════════════════════════════════
  // THE MIGRATION'S OTHER HALF
  // ════════════════════════════════════════════════════════════════════════════════════════════
  t('🔴 groups are dropped completely — the table and the per-place wording column',
    /drop table if exists public\.truck_place_groups/.test(SQL2)
    && /drop column if exists group_post_wording/.test(SQL2))
  t('🔴 the four new place columns, with the favourite/hidden booleans NOT NULL DEFAULT false',
    /add column if not exists area text/.test(SQL2)
    && /add column if not exists is_favourite boolean not null default false/.test(SQL2)
    && /add column if not exists is_hidden boolean not null default false/.test(SQL2)
    && /add column if not exists merged_into_id uuid references public\.truck_places\(id\) on delete set null/.test(SQL2))
  t('🔴 a place cannot be merged into itself — the one cycle the database CAN forbid',
    /check \(merged_into_id is null or merged_into_id <> id\)/.test(SQL2)
    && /drop constraint if exists truck_places_no_self_merge/.test(SQL2))
  t('🔴 the wording column is RENAMED, guarded both ways so re-running is safe',
    /rename column default_group_post_wording to event_post_wording/.test(SQL2)
    && /add column if not exists event_post_wording text/.test(SQL2))
  t('⚠️ `set lock_timeout` at the top and `notify pgrst` at the end',
    /^set lock_timeout = '3s';/m.test(SQL2) && /notify pgrst, 'reload schema';\s*$/.test(SQL2.trim() + '\n'))
  t('⚠️ the stage-2 file sorts AFTER stage 1, so it alters tables that exist',
    'supabase/migrations/20261004_schedule_places_stage2.sql' > 'supabase/migrations/20261003_truck_places.sql')

  // ════════════════════════════════════════════════════════════════════════════════════════════
  // THE PLAN GATE MOVED
  // ════════════════════════════════════════════════════════════════════════════════════════════
  const sgBlock = R.slice(R.indexOf("if (action === 'sg_places')"), R.indexOf("return NextResponse.json({ error: 'Unknown action' }"))
  t('🔴 NO PLACES ACTION IS PLAN-GATED ANY MORE — Places is on every plan',
    sgBlock.length > 500 && !/canAccess\(truck\.plan, 'schedule_graphics'/.test(sgBlock)
    && !/sgAllowed/.test(R) && !/SG_FORBIDDEN/.test(R))
  /* 🔴 THE FEATURE IS DECLARED IN ONE PLACE AND CONSUMED IN ONE PLACE. Checked over CODE LINES only —
   * route.ts still explains in a comment that the gate used to be here, and a comment is not a gate. */
  /* 🔴 THE FEATURE IS NAMED IN THREE PLACES NOW, AND THE THIRD IS THE IMPORTANT ONE (5 October
   * 2026). It used to be two — the declaration and the UI gate — and the weekly post added
   * app/api/weekly-post/route.ts, which gates the SERVER. Without it the whole feature is reachable by
   * posting to that route with a dashboard token and the UI gate is decoration. The count is pinned at
   * three so a FOURTH consumer still has to be deliberate. */
  t('🔴 …and the Feature gates the Weekly post pane AND its route, and nothing else',
    (U.match(/feature="schedule_graphics"/g) || []).length === 1
    && /WeeklyPostPane/.test(U)
    && (() => {
      const files = require('child_process').execFileSync('grep',
        ['-rl', '--include=*.ts', '--include=*.tsx', 'schedule_graphics', 'app', 'lib', 'components'],
        { cwd: REPO, encoding: 'utf8' }).trim().split('\n')
      const inCode = files.filter(f => /schedule_graphics/.test(codeOnly(read(f))))
      return inCode.length === 3
        && inCode.includes('lib/features.ts')
        && inCode.includes(PLACES_UI)
        && inCode.includes('app/api/weekly-post/route.ts')
    })())
  t('⚠️ `resolveTruckAccess` and the staff gate are UNCHANGED — widening plans never widened roles',
    /'sg_places', 'sg_upsert_place', 'sg_merge_place',/.test(R)
    && /const access = await resolveTruckAccess\(req, truck\)/.test(R)
    && !/sg_upsert_group|sg_delete_group/.test(R))
  /* 🔴 GONE FROM THE CODE, not from the history. The removal notes in places.ts and the migration
   * deliberately NAME what was removed — that is the record. What must not exist is a reader. */
  t('🔴 FACEBOOK GROUPS ARE GONE FROM THE CODE ENTIRELY',
    (() => {
      const files = require('child_process').execFileSync('grep',
        ['-rl', '--include=*.ts', '--include=*.tsx', '-e', 'truck_place_groups', '-e', 'group_post_wording', '-e', 'Facebook group', 'app', 'lib', 'components'],
        { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
      const files2 = files ? files.split('\n') : []
      const inCode = files2.filter(f => /truck_place_groups|group_post_wording|Facebook group/.test(codeOnly(read(f))))
      if (inCode.length) console.log('      still referenced in code: ' + inCode.join(', '))
      return inCode.length === 0
    })())

  // ════════════════════════════════════════════════════════════════════════════════════════════
  // THE NAVIGATION
  // ════════════════════════════════════════════════════════════════════════════════════════════
  t('🔴 THE SEPARATE TOP-LEVEL TAB IS GONE', !/id: 'graphics'/.test(P)
    && !/ScheduleGraphicsTab/.test(P)
    && !fs.existsSync(path.join(REPO, 'components/manage/ScheduleGraphicsTab.tsx')))
  /* 🔴 TWO PILLS NOW. The Places pill went when the list moved into the Add event modal; a third
   * pill would be a route to a screen that is part of adding an event. */
  t('🔴 the Schedule tab has TWO pills — Events, then Weekly post — and no Places pill',
    /\{ id: 'events', label: 'Events' \}/.test(P)
    && /\{ id: 'weekly', label: 'Weekly post' \}/.test(P)
    && !/id: 'places'/.test(P)
    && P.indexOf("id: 'events'") < P.indexOf("id: 'weekly'")
    && /type ScheduleSection = 'events' \| 'weekly'/.test(P))
  t("🔴 an old `?section=places` link falls through to Events and does NOT force Tidy up open",
    /v === 'events' \|\| v === 'weekly'/.test(P)
    && !/section === 'places'/.test(P)
    && !/setModalView\('tidy'\)[\s\S]{0,40}sectionParam/.test(P))
  t('⚠️ …and `?section=` still works for the two that remain',
    /qs\.get\('section'\)/.test(P) && /url\.searchParams\.delete\('section'\)/.test(P))
  /* ⚠️ ASSERTED ON THE RAW SOURCE, not the stripped one — see `codeOnly`'s note. The loads this checks
   * are one-liners that no comment contains, so raw is both safe and exact here. */
  t("🔴 THE EVENTS SECTION IS THE EXISTING COMPONENT, UNCHANGED — `isActive` still means \"the tab is open\"",
    (() => {
      const RAW = read(PAGE)
      return /isActive: boolean; section: ScheduleSection/.test(RAW)
        && /useEffect\(\(\) => \{ if \(isActive\) loadEvents\(\) \}, \[isActive, loadEvents\]\)/.test(RAW)
        && /\{isActive && section === 'events' && \(/.test(RAW)
        // the vans read and the conflict scan still key off the TAB, not the section
        && /if \(isActive\) api\('get_vans'\)/.test(RAW)
    })())
  t('⚠️ …so the "Schedule (n)" badge keeps updating while the operator stands on Places',
    /onPendingCount/.test(P) && !/section === 'events' && loadEvents/.test(P))
  t('🔴 the section is in the URL, and `events` does not write a param',
    /qs\.get\('section'\)/.test(P)
    && /url\.searchParams\.delete\('section'\)/.test(P)
    && /window\.history\.replaceState/.test(P)
    && !/pushState/.test(P))
  /* ⚠️ SEVEN TABS NOW — Deals and Extras & Upsells became Menu pills. The surviving seven keep their
   * relative order, which is what "do not reorganise existing navigation" means. Matched inside the
   * `allTabs` array only, because `id: 'deals'` also appears in `MENU_SECTIONS`. */
  t('⚠️ the seven remaining top-level tabs keep their relative order', (() => {
    const RAW = read(PAGE)
    const arr = RAW.slice(RAW.indexOf('const allTabs:'), RAW.indexOf('const tabs = allTabs.filter'))
    const order = ['menu', 'schedule', 'reports', 'team', 'settings', 'payments', 'billing']
    const at = order.map(id => arr.indexOf(`id: '${id}'`))
    return at.every(i => i > 0) && at.every((v, i) => i === 0 || v > at[i - 1])
      && !arr.includes("id: 'deals'") && !arr.includes("id: 'modifiers'")
  })())

  // ════════════════════════════════════════════════════════════════════════════════════════════
  // THE PICKER
  // ════════════════════════════════════════════════════════════════════════════════════════════
  t('🔴 "COPY A RECENT EVENT" IS REPLACED BY THE PLACE LIST IN THE LEFT PANE',
    !/Copy a recent event/.test(P)
    && /<PlaceList/.test(P)
    && /label="Search places"/.test(read(PLACES_UI)))
  /* 🔴 BUG 2: BOTH SECTIONS ALWAYS. There is no `showAll` state and no "No places match" on an empty
   * search — the only empty states are "nothing matches <typed>" and "no places yet". */
  /* ⚠️ CODE-ONLY, AND `showAllPlaces` NOT `showAll`. The removal notes in SchedulePlaces.tsx NAME the
   * old control — that is the record — and `showAll` also matches `showAllergenModal`, which is a
   * different feature entirely. An earlier draft of this line failed on correct code for both reasons. */
  t('🔴 BUG 2 CANNOT RETURN: no "Show all places" gate and no favourites-only default',
    !/Show all places/.test(codeOnly(read(PAGE))) && !/showAllPlaces/.test(codeOnly(read(PAGE)))
    && !/Show all places/.test(codeOnly(read(PLACES_UI))) && !/showAllPlaces/.test(codeOnly(read(PLACES_UI))))
  t('🔴 …and FAVOURITES and ALL PLACES are both rendered unconditionally', (() => {
    const U2 = read(PLACES_UI)
    return /favourites\.length > 0 && \(/.test(U2) && /others\.length > 0 && \(/.test(U2)
      && />Favourites</.test(U2) && />All places</.test(U2)
      // the only "nothing matches" line is behind a typed search
      && /Nothing matches/.test(U2) && /nothingAtAll \?/.test(U2)
  })())
  /* 🔴 BUG 1: THE STAR TOGGLES IN PLACE. The write is optimistic, there is no refetch on either
   * outcome, and a failure reverts the star and shows one line. */
  t('🔴 BUG 1 CANNOT RETURN: the star is optimistic and never reloads the list', (() => {
    const U2 = stripComments(read(PLACES_UI))
    const fav = U2.slice(U2.indexOf('const setFavourite'), U2.indexOf('return { places:'))
    return /patchLocal\(p\.id, \{ is_favourite: next \}\)/.test(fav)     // optimistic, before the await
      && /patchLocal\(p\.id, \{ is_favourite: p\.is_favourite \}\)/.test(fav)  // reverted on failure
      && /setStarError\(/.test(fav)
      && !/reload\(/.test(fav)                                            // and NO refetch, either way
  })())
  t('⚠️ …and the error is one line in the pane, not a toast that disappears',
    /\{starError && <p className="text-xs text-red-500/.test(read(PLACES_UI)))
  t('⚠️ …and `handleCopyEvent` SURVIVES for the per-event Copy button in the list',
    /const handleCopyEvent = /.test(P) && /handleCopyEvent\(event\)/.test(P))
  t('🔴 the fill rule is the SHARED function, not a copy in the component',
    /\.\.\.fillFromPlace\(pl, p\)/.test(P) && /from '@\/lib\/schedule-graphics\/places'/.test(P)
    && /export function fillFromPlace/.test(read(LIB)))
  t('🔴 the picker is NEW EVENTS ONLY, and sets `truck_place_id` nowhere else',
    /const showPicker = !!editingEvent && !editingEvent\.id && addMode === 'manual' && modalView === 'add'/.test(P)
    && (P.match(/truck_place_id: pl\.id/g) || []).length === 1)
  t('⚠️ a hidden or merged place is never offered — the list filters them unless asked',
    /showHidden \|\| !isRetired\(p\)/.test(read(PLACES_UI))
    && !/showHidden/.test(P.slice(P.indexOf('<PlaceList'), P.indexOf('<PlaceList') + 600)))
  t('⚠️ "+ New place" creates nothing until save, and opens the address fields to type into',
    /\+ New place/.test(P)
    && /const startNewPlace = \(\) => \{[\s\S]{0,200}truck_place_id: null[\s\S]{0,200}setAddrOpen\(true\)/.test(P))
  t('⚠️ the one muted line, only when a place was picked, in the sticky footer',
    /Filled from \$\{pickedPlace\?\.name \?\? 'that place'\}/.test(P))
  /* ⚠️ RE-POINTED: "Upload schedule" is no longer a label in this modal — the flow lives behind the
   * Schedule header's own "✨ Import schedule" button. The FORM's fields are unchanged. */
  t('⚠️ every existing form field is still there, and the upload flow still exists',
    ['Venue name', 'Full address (optional)', 'Area (village, town or city)', 'Postcode', 'Start time', 'End time', 'Notes']
      .every(f => P.includes(f))
    && /✨ Import schedule/.test(P) && /process-schedule/.test(P))
  t('⚠️ …and the form\'s validation is untouched',
    /const errors = validateEventForm\(editingEvent\)/.test(P) && /hasValidEventTimes/.test(R))

  // ════════════════════════════════════════════════════════════════════════════════════════════
  // PLACES: ONE MODULE, AND THE SHAPE OF THE PANE
  // ════════════════════════════════════════════════════════════════════════════════════════════
  t('⚠️ exactly one module defines the normaliser, across lib/, app/ and components/', (() => {
    const hits = require('child_process').execFileSync('grep',
      ['-rl', '--include=*.ts', '--include=*.tsx', 'export function normalisePlaceName', 'lib', 'app', 'components'],
      { cwd: REPO, encoding: 'utf8' }).trim().split('\n')
    return hits.length === 1 && hits[0] === LIB
  })())
  t('🔴 the route imports the merge rules rather than re-implementing them',
    /mergeRefusal, mergePatch, resolvePlaceMerge, placesById/.test(R)
    && /const refusal = mergeRefusal\(\{ fromId, intoId, places: all \}\)/.test(R))
  t('🔴 a merge writes ONE row — the merged place — and no event',
    (() => {
      const blk = R.slice(R.indexOf("action === 'sg_merge_place'"), R.indexOf("return NextResponse.json({ error: 'Unknown action' }"))
      return /from\('truck_places'\)\s*\n?\s*\.update\(\{ merged_into_id: patch\.merged_into_id, is_hidden: true/.test(blk)
        && !/from\('truck_events'\)/.test(blk)
    })())
  t('⚠️ restoring a merged place un-merges it, so it comes back with its own events',
    /if \(body\.is_hidden === false\) patch\.merged_into_id = null/.test(R))
  t('⚠️ the list has both groups, the star toggle and the Show-hidden escape',
    /Favourites/.test(U) && /All places/.test(U)
    && /is_favourite \? '★' : '☆'/.test(U)
    && /Show hidden places \(\$\{hiddenCount\}\)/.test(U))
  /* ⚠️ TWO CONTROLS NOW, NOT THREE (October 2026). "Merge into another place" was removed from this
   * screen on instruction; the SERVER's `sg_merge_place` and `merged_into_id` resolution are untouched
   * and are asserted in scripts/weekly-post.cjs §9c, so the capability is still covered — what changed
   * is that the button is gone. The five fields are the point of this line and are unchanged. */
  t('⚠️ the two controls, and Card 1\'s five fields including Area',
    /Hide this place/.test(U) && /Restore this place/.test(U)
    && !/Merge into another place/.test(U)
    && ['Name on posts', 'Short name', 'Address', 'Area', 'Postcode'].every(f => U.includes(`label="${f}"`)))
  t('⚠️ Card 2 names both lines and the count',
    /Events here/.test(U) && /Next: \$\{shortDay/.test(U) && /time\$\{place\.traded_last_year === 1 \? '' : 's'\} in the last year/.test(U))
  /* 🔴 THE BREAKPOINT IS `md` (768px) NOW, NOT `lg`. Measured: at 820px (iPad portrait) the 380px
   * list sits beside the form with no horizontal scroll, so an iPad gets the two-pane layout the
   * mockup asks for. See scripts/schedule-places-render.cjs and the report. */
  t('🔴 the modal is two-pane from `md` (768px), one column below it',
    /md:grid md:grid-cols-\[380px_minmax\(0,1fr\)\]/.test(P))
  t('🔴 THE FOOTER IS A FLEX SIBLING, NOT `position: sticky` — which needs a scroll ancestor and would be a no-op here',
    /shrink-0 border-t border-slate-200 bg-white/.test(P)
    && /flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y/.test(P)
    && /flex flex-col min-h-0 overflow-x-hidden/.test(P))
  t('⚠️ the header is the title and a labelled close button — no switch, no "Add manually"',
    /aria-label="Close"/.test(P)
    && !/Add manually<\/button>/.test(P)
    && !/'One event'/.test(codeOnly(read(PAGE))))
  /* ⚠️ MATCHED ON THE SPECIFIC HANDLER, on RAW source. The file has three other Escape handlers
   * (category and subcategory inline edits), the first of them 2,300 lines ABOVE `closeAddModal`, so
   * `indexOf("if (e.key === 'Escape')")` found the wrong one and the ordering check failed on correct
   * code. And `stripComments` is unreliable on this file — see `codeOnly`'s note. */
  t('⚠️ Escape closes the modal, and the handler is declared after `closeAddModal`', (() => {
    const RAW = read(PAGE)
    const handler = "if (e.key === 'Escape') closeAddModal()"
    return RAW.includes(handler) && RAW.indexOf('const closeAddModal') < RAW.indexOf(handler)
  })())
  t('🔴 the phone layout is two steps, and the address fields collapse behind one control',
    /setPhoneStep\(2\)/.test(P) && /phoneStep === 1 \? 'max-md:hidden' : ''/.test(P)
    && /md:contents max-md:order-5/.test(P) && />Address details</.test(P))
  t('⚠️ …and the collapsed fields stay in the DOM, so validation still sees them',
    /\$\{addrOpen \? 'max-md:grid max-md:gap-3 max-md:mt-3' : 'max-md:hidden'\}/.test(P))
  t('🔴 "Tidy up places" opens the existing place detail inside the modal, reusing the components',
    /Tidy up places/.test(P) && /<TidyUpPlaces ctl=\{placesCtl\}/.test(P)
    && /export function TidyUpPlaces/.test(U) && /<PlaceDetail/.test(U))
  t('⚠️ ONE hook owns the list, so Tidy up and the picker cannot seed twice on one screen',
    (P.match(/usePlaces\(/g) || []).length === 1
    && /ctl=\{placesCtl\}/.test(P)
    && (U.match(/api\('sg_places'\)/g) || []).length === 1)
  // ════════════════════════════════════════════════════════════════════════════════════════════
  // THE QUICK FIXES (3 October 2026): the pane scroll, the upload switch, Van, the Menu pills
  // ════════════════════════════════════════════════════════════════════════════════════════════
  /* 🔴 THE SCROLL FIX. `max-h` alone leaves a flex container's height INDEFINITE, so `h-full` below
   * it cannot resolve and the pane sizes to its content. The measurement is in
   * scripts/schedule-places-render.cjs (with a broken variant); this pins the class that fixes it. */
  /* ⚠️ THE CLASS MOVED INTO A CONSTANT (October 2026) so Add event and Tidy up places could share one
   * size; the assertion followed it. The intent is unchanged — a DEFINITE height on the two-pane case
   * — and it is now additionally asserted that Tidy up gets it, which is the whole reason it moved. */
  t('🔴 the two-pane modal has a DEFINITE height, so the places pane can be constrained and scroll',
    /^const EVENT_MODAL_WIDE = 'md:h-\[90vh\]/m.test(P)
    && /sm:max-h-\[90vh\]/.test(P)
    && /const wideShell = showPicker \|\| modalView === 'tidy'/.test(P)
    && /\$\{EVENT_MODAL_SHELL\} \$\{wideShell \? EVENT_MODAL_WIDE : EVENT_MODAL_NARROW\}/.test(P))
  /* ⚠️ THE DEFINITE HEIGHT IS CONDITIONAL. A short modal (the edit form) must stay short, and the
   * import modal is a different element entirely — it keeps `max-h-[90vh]` with no `h-`. */
  t('⚠️ …and only where two panes need one — the edit form and the import modal keep `max-h` alone',
    (() => {
      const RAW = read(PAGE)
      /* ⚠️ MATCHED AS `md:h-[90vh]`, NOT `h-[90vh]`. The latter is a SUBSTRING of `max-h-[90vh]`,
       * which appears sixteen times across this file's unrelated modals — the first draft of this
       * line counted those and failed on correct code. */
      // ⚠️ CODE ONLY: the comment explaining the fix names the class too, and a comment is not a class.
      const definite = codeOnly(RAW).match(/md:h-\[90vh\]/g) || []
      const i = RAW.indexOf('{showImportModal && (')
      const importShell = RAW.slice(i, i + 400)
      return definite.length === 1
        && /max-h-\[90vh\]/.test(importShell)
        && !/(^|[^-])\bh-\[90vh\]/.test(importShell.replace(/max-h-\[90vh\]/g, ''))
    })())
  t('🔴 the list keeps its own scroller between a `min-h-0` pane and a `min-h-0` wrapper',
    /<div className="flex-1 min-h-0">\s*\n\s*<PlaceList/.test(read(PAGE))
    && /<div className="flex flex-col min-h-0 h-full">/.test(U)
    && /<div className="flex-1 min-h-0 overflow-y-auto px-3 pb-2">/.test(U))
  t('⚠️ …with the search box `shrink-0` at the top and the footer `shrink-0` at the bottom',
    /<div className="p-3 pb-2 shrink-0">/.test(U)
    && /<div className="shrink-0 border-t border-slate-100 p-3">\{footer\}<\/div>/.test(U))

  /* 🔴 THE UPLOAD SWITCH IS GONE, AND SO IS THE SECOND COPY OF THE FLOW IT REVEALED. */
  t('🔴 THE One event | Upload schedule SWITCH IS GONE from the Add event modal',
    !/'One event'/.test(codeOnly(read(PAGE)))
    && !/\[\['manual', 'One event'\]/.test(codeOnly(read(PAGE))))
  t('🔴 …and the duplicate upload branch inside that modal with it',
    !/addMode === 'upload' && \(/.test(codeOnly(read(PAGE))))
  t('🔴 THE SURVIVING UPLOAD PATH IS THE SCHEDULE HEADER\'S OWN BUTTON, untouched',
    /onClick=\{\(\) => setShowImportModal\(true\)\}/.test(P)
    && /✨ Import schedule/.test(P)
    && /\{showImportModal && \(/.test(P)
    && /process-schedule/.test(P))
  t('⚠️ …and it still carries the whole flow: drop zone, paste box and review',
    (() => {
      const RAW = read(PAGE)
      const i = RAW.indexOf('{showImportModal && (')
      const blk = RAW.slice(i, i + 6000)
      return /type="file" accept="image\/\*,\.pdf"/.test(blk)
        && /Or paste schedule text/.test(blk)
        && /renderScheduleReview/.test(blk)
    })())
  /* ⚠️ THE TWO WIDTHS ARE CONSTANTS NOW (October 2026), for the same reason as the height above. The
   * original point of this line — the width does not depend on how many events an import extracted —
   * is still asserted, and the inline ternary it used to read is gone rather than changed. */
  t('🔴 the Add event modal is ONE SIZE — its width no longer depends on `extractedEvents`',
    /^const EVENT_MODAL_WIDE = 'md:h-\[90vh\] md:max-w-\[1040px\]'$/m.test(P)
    && /^const EVENT_MODAL_NARROW = 'sm:max-w-lg lg:max-w-2xl'$/m.test(P)
    && !/extractedEvents\.length > 0 \? 'md:max-w-\[980px\]' : showPicker/.test(P))

  /* 🔴 "VAN", WHEREVER A VAN IS CHOSEN. Copy only — the column, the options and the predicate are
   * untouched, which is what these assert alongside the labels. */
  t('🔴 the event form\'s van picker says "Van", and still writes `van_id`',
    /<label className="block text-xs font-bold text-slate-600 mb-1">Van <span className="text-red-500">\*<\/span><\/label>/.test(P)
    && /<option value="">Select a van<\/option>/.test(P)
    && /setEditingEvent\(p => \(\{ \.\.\.p!, van_id: e\.target\.value \|\| null \}\)\)/.test(P))
  t('🔴 the van FILTER says "vans" — it predicates on `van_id`, so "All trucks" was simply wrong',
    (() => {
      const V = read('components/manage/VanFilter.tsx')
      return /return 'All vans'/.test(V) && /\?\? 'Unknown van'/.test(V)
        && /<option value=\{VAN_FILTER_ALL\}>All vans<\/option>/.test(V)
        && /aria-label="Filter by van"/.test(V)
        && !/All trucks<\/option>/.test(V)
        // and the LOGIC is untouched
        && /if \(filter === VAN_FILTER_ALL\) return true/.test(V)
        && /return vanId === filter/.test(V)
    })())
  t('⚠️ nothing that genuinely means a TRUCK was renamed',
    /per truck \/ month/.test(P) && /Truck details/.test(P) && /Truck access/.test(P))

  /* 🔴 THE MENU PILLS. */
  /* ⚠️ MATCHED INSIDE `allTabs` ONLY. `{ id: 'deals', label: 'Deals' }` is the new PILL, so a
   * file-wide search for it fails on correct code — which it did on the first draft of this line. */
  t('🔴 the Deals and Extras & Upsells TOP-LEVEL TABS ARE GONE', (() => {
    const RAW = read(PAGE)
    const arr = RAW.slice(RAW.indexOf('const allTabs:'), RAW.indexOf('const tabs = allTabs.filter'))
    return !arr.includes("id: 'deals'") && !arr.includes("id: 'modifiers'")
      && !/type Tab = [^\n]*'modifiers'/.test(RAW)
  })())
  t('🔴 …replaced by three pills inside Menu, Items first and default',
    /\{ id: 'items', label: 'Items' \}/.test(P)
    && /\{ id: 'extras', label: 'Extras & upsells' \}/.test(P)
    && /\{ id: 'deals', label: 'Deals' \}/.test(P)
    && /useState<MenuSection>\('items'\)/.test(P))
  t('🔴 each pill renders THE EXISTING COMPONENT, props unchanged',
    /menuSection === 'items' && <MenuTab/.test(P)
    && /menuSection === 'extras' && <ModifiersTab/.test(P)
    && /menuSection === 'deals' && <DealsTab/.test(P))
  t('🔴 `?tab=deals` AND `?tab=modifiers` LAND ON MENU WITH THE RIGHT PILL',
    /LEGACY_TAB_TO_MENU_SECTION: Record<string, MenuSection> = \{\s*\n\s*deals: 'deals',\s*\n\s*modifiers: 'extras',/.test(P)
    && /setActiveTab\('menu'\)\s*\n\s*setMenuSection\(LEGACY_TAB_TO_MENU_SECTION\[tabParam\]\)/.test(P))
  t('🔴 THE WALKTHROUGH STOP SURVIVES — it pointed at two tabs that no longer exist', (() => {
    const W = read('lib/walkthrough.ts')
    // `Walkthrough` DROPS any stop whose tabIds resolve to nothing, so a stale id here is a silently
    // missing step rather than an error.
    return /tabIds: \['menu'\],\s*\n\s*title: 'Deals and Extras & upsells'/.test(W)
      && !/tabIds: \['deals', 'modifiers'\]/.test(W)
      && /live under Menu/.test(W)
      && /stops\.filter\(s => measure\(s\.tabIds\) !== null\)/.test(read('components/manage/Walkthrough.tsx'))
  })())
  t('⚠️ neither retired tab carried a badge, so nothing moved with them',
    /t\.id === 'schedule' && pendingApprovalCount > 0/.test(P)
    && /t\.id === 'payments' && stripeActionRequired/.test(P)
    && /t\.id === 'menu' && allergensUnverified/.test(P)
    && !/t\.id === 'deals'/.test(P) && !/t\.id === 'modifiers'/.test(P))
  t('🔴 ONE `?section=` PARAM SERVES BOTH TABS, and the values cannot collide',
    /v === 'events' \|\| v === 'weekly'/.test(P)
    && /v === 'items' \|\| v === 'extras' \|\| v === 'deals'/.test(P)
    && /isMenuSection\(sectionParam\)/.test(P)
    && /window\.history\.replaceState/.test(P) && !/pushState/.test(P))
  t('⚠️ …and a tab with no sections CLEARS the param, so one cannot follow the operator onto Reports',
    /: null\s*\n\s*const url = new URL\(window\.location\.href\)/.test(P))
  t('⚠️ no internal link or tab-switch still targets the retired tabs',
    !/setActiveTab\('deals'\)/.test(P) && !/setActiveTab\('modifiers'\)/.test(P)
    && !/onSwitchTab\('deals'\)/.test(P) && !/onSwitchTab\('modifiers'\)/.test(P))

  // ════════════════════════════════════════════════════════════════════════════════════════════
  // PART A · SETTINGS AS ONE LIST WITH STICKY JUMP TABS
  // ════════════════════════════════════════════════════════════════════════════════════════════
  const RAWP = read(PAGE)

  t('🔴 eight sections, in the brief\'s order, each id matching its label',
    /const SETTINGS_SECTIONS: \{ id: string; label: string \}\[\] = \[/.test(P)
    && SETTINGS_IDS.every((id, i) => P.includes(`{ id: '${id}', label: '${SETTINGS_LABELS[i]}' }`))
    /* ⚠️ AND IN THAT ORDER IN THE SOURCE, not merely all present — the eight entries must appear in
     * the array in the same sequence, or the bar would read in one order and the page in another. */
    && (() => {
      const at = SETTINGS_IDS.map(id => P.indexOf(`{ id: '${id}',`))
      return at.every(i => i > 0) && at.every((v, i) => i === 0 || v > at[i - 1])
    })()
    && (RAWP.match(/══ SECTION: /g) || []).length === 8)
  t('⚠️ …and the eight `<section id>` elements are in that same order in the markup', (() => {
    const at = SETTINGS_IDS.map(id => RAWP.indexOf(`id="${id}"`))
    return at.every(i => i > 0) && at.every((v, i) => i === 0 || v > at[i - 1])
  })())

  /* 🔴 ONE MEASURED NUMBER, TWO CONSUMERS — the rule taken from
   * docs/customer-one-page-build-report.md. If the jump used CSS and the spy used a different
   * number, a re-measure would move one and not the other. */
  t('🔴 `pinnedTop` is MEASURED, and is both the scroll-margin and the spy\'s pin line',
    /const h = barRef\.current\?\.getBoundingClientRect\(\)\.height \?\? 0/.test(P)
    && /style=\{\{ scrollMarginTop: pinnedTop/.test(P)
    && /spyRef\.current\.pinnedTop = next/.test(P)
    && /const line = spyRef\.current\.pinnedTop/.test(P))
  t('🔴 THE SPY READS THE `<main>` SCROLLER, NOT THE WINDOW — `window.scrollY` is always 0 on this page',
    /document\.getElementById\(MANAGE_SCROLLER_ID\)/.test(P)
    && /el\.scrollTop \+ el\.clientHeight >= el\.scrollHeight - 2/.test(P)
    && /el\.addEventListener\('scroll', onScroll, \{ passive: true \}\)/.test(P)
    && (() => {
      // no window-scroll reads inside the hook
      const i = RAWP.indexOf('function useSettingsJumpBar')
      const hook = RAWP.slice(i, RAWP.indexOf('function SettingsTab', i))
      return !/window\.scrollY|document\.documentElement\.scrollHeight/.test(hook)
    })())
  t('🔴 the bar is `sticky top-0` and is NOT wrapped in a div of its own',
    /const SUBTAB_BAR = 'sticky top-0 z-30 -mx-4 px-4 bg-slate-50 border-b border-slate-200 min-w-0 overflow-x-auto'/.test(P)
    && /data-subtab-bar\n        className=\{SUBTAB_BAR\}/.test(P)
    && /ref=\{barRef\}/.test(P)
    && /<main id=\{MANAGE_SCROLLER_ID\}/.test(P)
    // `<main>` must keep NO padding-top, or a sticky child pins 24px down
    && !/<main id=\{MANAGE_SCROLLER_ID\}[^>]*\bpt-/.test(P))
  t('⚠️ the jump uses `scrollIntoView` so the BROWSER applies each section\'s own margin',
    /node\.scrollIntoView\(\{ behavior: reduce \? 'auto' : 'smooth', block: 'start' \}\)/.test(P))
  t('⚠️ the spy is LOCKED during our own smooth scroll, so the tapped tab does not flicker',
    /if \(spyRef\.current\.target !== null\)/.test(P) && /releaseLock/.test(P))
  t('🔴 the LAST section becomes active at the bottom even though it is short',
    /if \(atBottom\(\)\) \{ setActiveId\(SETTINGS_SECTIONS\[SETTINGS_SECTIONS\.length - 1\]\.id\); return \}/.test(P)
    && /minHeight: lastSectionMinHeight/.test(P))
  t('🔴 …and that floor is MEASURED PIXELS, not a percentage that would compute to 0',
    /const lastSectionMinHeight = scrollerH > 0 \? `\$\{Math\.max\(0, scrollerH - pinnedTop\)\}px` : undefined/.test(P)
    && !/calc\(100% - \$\{Math\.round\(pinnedTop\)\}px\)/.test(P))
  t('🔴 `#hash` deep links are handled in JS, because a fragment scrolls the DOCUMENT and it never scrolls here',
    /window\.location\.hash\.replace\(\/\^#\/, ''\)/.test(P)
    && /SETTINGS_SECTIONS\.some\(sec => sec\.id === id\)/.test(P)
    && /didHash/.test(P))
  t('⚠️ the active tab scrolls ITSELF into view on a phone, by the BAR\'s own scrollLeft',
    /data-settings-tab="\$\{activeId\}"/.test(P)
    && /bar\.scrollLeft = Math\.max\(0, left\)/.test(P))
  t('⚠️ the jump bar scrolls sideways inside its row; the page does not',
    /min-w-0 overflow-x-auto/.test(P) && /const SUBTAB_ROW = 'flex gap-4 w-max'/.test(P)
    && (P.match(/className=\{SUBTAB_ROW\}/g) || []).length === 3)

  /* 🔴 NO SETTINGS WORDING CHANGED. Asserted by DIFFING EVERY QUOTED STRING in SettingsTab against
   * the commit this build started from — not by reading. The only additions allowed are the eight
   * section labels. */
  t('🔴 NOT ONE WORD OF SETTINGS COPY CHANGED, beyond the eight new headings', (() => {
    const base = require('child_process')
      .execFileSync('git', ['show', '197cb8c:app/manage/[token]/page.tsx'], { cwd: REPO, encoding: 'utf8', maxBuffer: 64e6 })
    const strings = (src) => {
      const i = src.indexOf('function SettingsTab({ userRole, truck,')
      const seg = src.slice(i, src.indexOf('\nfunction ', i + 50))
      // user-visible text: JSX text nodes and quoted strings, comments stripped first
      return new Set((codeOnly(seg).match(/>[^<>{}\n]{3,}</g) || []).map(x => x.slice(1, -1).trim()).filter(Boolean))
    }
    const before = strings(base), after = strings(RAWP)
    const added = [...after].filter(x => !before.has(x))
    const allowed = new Set(SETTINGS_LABELS)
    /* ⚠️ THE THREE REMOVALS THAT ARE ALLOWED, AND ONLY THOSE THREE: a card title that said exactly
     * what its section's new `<h2>` says. The words did not leave Settings — they moved up one level.
     * Any OTHER removal is a wording change and fails. */
    /* ⚠️ "Settings" IS ALSO AN ALLOWED REMOVAL: it was a page title duplicating the tab the operator
     * just pressed to get here. Every OTHER removal is a wording change and fails. */
    const removable = new Set([...allowed, 'Settings'])
    const removed = [...before].filter(x => !after.has(x)).filter(x => !removable.has(x))
    const badAdded = added.filter(x => !allowed.has(x))
    if (badAdded.length || removed.length) {
      console.log('      added: ' + JSON.stringify(badAdded.slice(0, 6)))
      console.log('      removed: ' + JSON.stringify(removed.slice(0, 6)))
    }
    return badAdded.length === 0 && removed.length === 0
  })())

  /* ══ ⛔ NOTHING WENT MISSING ═══════════════════════════════════════════════════════
   * ⛔ THE BUG THIS EXISTS FOR, 3 October 2026. Reordering the eight sections was done by cutting
   * each block from its `══ SECTION ══` marker to its own `</section>` and re-joining them in the new
   * order. Everything BETWEEN one `</section>` and the next marker — content belonging to no section —
   * was dropped on the floor: 189 lines, including the remove-van confirmation, the van billing and
   * van upgrade modals, the emoji picker and the website-embed card.
   * ⛔ IT TYPE-CHECKED AND IT RENDERED. Everything lost was a modal (invisible until its state is
   * set) or a card below the fold, so every other check in this file still passed.
   * 🔴 THE CHECK: every LINE of the page as it stood at the start of this work must still be
   * present, except an explicit allowlist of the lines this work deliberately changed. Line-level and
   * whole-file, because the loss was in the gaps BETWEEN the things the other checks look at. */
  t('⛔ NO LINE OF THE PAGE WAS LOST — the reorder dropped 189 of them once', (() => {
    /* 🔴 RE-PINNED TO 719ac91, THE COMMIT THIS BUILD STARTED FROM (5 October 2026). It was pinned
     * at 197cb8c, the start of the Settings build; that build is committed and its own report records
     * what it changed, so keeping the old pin meant carrying its replacements in this allowlist
     * forever and re-reading them on every run. The guard means the same thing — "this build lost
     * nothing" — against the tree it actually started from. */
    const base = require('child_process')
      .execFileSync('git', ['show', '719ac91:app/manage/[token]/page.tsx'],
        { cwd: REPO, encoding: 'utf8', maxBuffer: 64e6 })
    /* ══ ⚠️ COMMENT PROSE IS STRIPPED FIRST, AND THAT IS A DELIBERATE NARROWING ═══════════════
     * This file's own `codeOnly` only drops lines that BEGIN with a comment marker, so every
     * CONTINUATION line of a multi-line comment survived it — and moving one commented block (the
     * preview, footer → form pane) produced twenty-one "lost lines" that were all prose. Listing each
     * in the allowlist would have turned this guard into a changelog.
     * 🔴 WHAT IT STILL CATCHES IS WHAT IT EXISTS FOR: lost CODE. The 189 lines this check was built
     * after were a confirmation modal, two billing modals, an emoji picker and a card — every one of
     * them code. A comment-only deletion is no longer caught here, and that is the trade. */
    const blockStrip = (src) => {
      const out = []
      let inBlock = false
      for (const raw of src.split('\n')) {
        let line = raw
        if (inBlock) {
          const end = line.indexOf('*/')
          if (end < 0) { out.push(''); continue }
          line = line.slice(end + 2); inBlock = false
        }
        for (;;) {
          const a = line.indexOf('/*')
          if (a < 0) break
          const b = line.indexOf('*/', a + 2)
          if (b < 0) { line = line.slice(0, a); inBlock = true; break }
          line = line.slice(0, a) + line.slice(b + 2)
        }
        const sl = line.indexOf('//')
        if (sl >= 0 && !/https?:$/.test(line.slice(0, sl))) line = line.slice(0, sl)
        out.push(line)
      }
      return out
    }
    const now = blockStrip(RAWP)
    /* ⚠️ A MULTISET, NOT A SET. `</div>` appears hundreds of times; counting occurrences means a line
     * deleted from one place is not excused by an identical line somewhere else. */
    /* ⚠️ TRIMMED, SO RE-INDENTATION IS NOT A DELETION. Moving the preview block from the footer into
     * the form pane re-indented eleven lines of real code, and an exact-string multiset read every one
     * of them as lost. Indentation is not what this guard protects; a line that genuinely goes still
     * goes, at any indentation. */
    const left = new Map()
    for (const l of now.map(x => x.trim()).filter(Boolean)) left.set(l, (left.get(l) || 0) + 1)
    const gone = []
    for (const l of blockStrip(base).map(x => x.trim()).filter(Boolean)) {
      const n = left.get(l) || 0
      if (n > 0) left.set(l, n - 1)
      else gone.push(l)
    }
    /* ⚠️ THE ALLOWLIST IS WHAT THIS WORK MEANT TO CHANGE, each one asserted on its own elsewhere in
     * this file: the removed page title, the two de-duplicated card titles, the old pill rows, the
     * logo's card-title treatment, the cancellation group's stray divider and duplicate label, and the
     * lines that gained an id/import. Anything NOT on it is a loss. */
    const allowed = [
      /* ⚠️ WHAT THIS BUILD DELIBERATELY REPLACED, each asserted on its own elsewhere:
       *   • `Van` gained `categorySettings` and `same_as_first_van` (per-van settings);
       *   • the van card's capacity grid now reads THIS van's values, not the truck's;
       *   • the Add event preview moved from the footer into the form pane.
       * Anything NOT listed here is a loss. */
      'interface Van { id: string; truck_id: string; name: string; kds_token: string; active: boolean; auto_pause_on_offline: boolean; offline_protection_mode?: \'pause\' | \'no_auto_accept\'; offline_auto_reject_mins?: number | null; show_cooking_step: boolean; order_ready_enabled: boolean; kitchen_capacity: number | null; capacity_window_mins?: number | null; buzzer_count?: number | null; collection_interval_mins?: number | null; operator_collection_interval_mins?: number | null }',
      'const locked = cat.prep_secs > 0',
      'const capDisabled = locked || !hasCap',
      'batchSize={cat.batch_size}',
      'prepSecs={cat.prep_secs}',
      'countsToward={cat.counts_toward_capacity}',
      'onBatchChange={val => updateCatField(cat, { batch_size: val ?? 0 })}',
      'onPrepChange={secs => updateCatField(cat, { prep_secs: secs })}',
      'onCountsChange={() => { if (!locked && hasCap) toggleCatCapacity(cat, !cat.counts_toward_capacity) }}',
      '// is preserved. RPC writes stay HERE (updateCatField / toggleCatCapacity).',
      '<div className="shrink-0 flex gap-2">',
      '<div className="min-w-0 flex-1 max-md:hidden">',
      '<div className="max-h-[4.75rem] overflow-hidden">',
      /* ⚠️ the muted "Filled from" line kept its words and changed its MARGIN: in the footer it needed
       * `mt-0.5` under a capped card; in the pane the card already carries `mb-2`, so it pulls up. */
      '<p className="text-[11px] text-slate-400 truncate mt-0.5">',
      /* ⚠️ the Weekly post pane gained the `token` it needs to call its own route. */
      "{isActive && section === 'weekly' && <WeeklyPostPane truck={truck} />}",
      'picked. It answers the question the filled fields raise — "will editing this',
      'change the place?" — and the answer is no: nothing below writes back to the place.',
      /* ⚠️ THE EVENT MODAL'S SHELL MOVED INTO CONSTANTS (October 2026). These four lines were the
       * inline `className={...}` on the modal; they are now `EVENT_MODAL_SHELL`, `EVENT_MODAL_WIDE`
       * and `EVENT_MODAL_NARROW`, which the three assertions above read. The move is what makes Tidy
       * up places the same size as Add event — the two had drifted because the numbers were written
       * out at the call site and only one branch was ever updated. */
      'className={`bg-white w-full shadow-2xl flex flex-col min-h-0 overflow-x-hidden',
      'max-sm:h-dvh sm:rounded-2xl sm:max-h-[90vh]',
      "${showPicker ? 'md:h-[90vh]' : ''}",
      "${showPicker ? 'md:max-w-[1040px]' : 'sm:max-w-lg lg:max-w-2xl'}`}>",
    ]
    const unexplained = gone.filter(l => {
      if (!l) return false
      if (allowed.includes(l)) return false
      // the two pill rows and their button classes, replaced by the shared bar
      if (/rounded-full text-sm font-bold whitespace-nowrap transition-colors/.test(l)) return false
      if (/role="tablist" aria-label="(Menu|Schedule) sections"/.test(l)) return false
      if (/^(bg-slate-900 text-white|\? 'bg-slate-900 text-white')/.test(l)) return false
      if (/'bg-slate-100 text-slate-600 hover:bg-slate-200'\}`\}>?$/.test(l)) return false
      if (/^<div className="flex gap-2 w-max">$/.test(l)) return false
      // comment lines and the import/`<main>` lines that gained a token
      if (/^(\/\/|\*|\{\/\*|\u2500|\u26a0|\U0001f534)/.test(l)) return false
      if (/^(THE PILLS|three pills|because the bar|level of underlined|by scripts\/)/.test(l)) return false
      if (/^import \{ useState/.test(l) || /^import \{ fillFromPlace/.test(l)) return false
      if (/^<main className=/.test(l)) return false
      if (/^(uses for explanatory|and "Upgrade to add more vans")/.test(l)) return false
      if (/^(<span className="min-w-0 flex-1 text-sm|<p className="min-w-0 flex-1 text-xs)/.test(l)) return false
      if (/^(\{(place|ev)|\{timeRangeLabel|\)\}|<\/(span|p)>)$/.test(l)) return false
      return true
    })
    if (unexplained.length) {
      console.log('      LINES LOST: ' + unexplained.length)
      for (const l of unexplained.slice(0, 8)) console.log('        • ' + l.slice(0, 96))
    }
    return unexplained.length === 0
  })())

  t('🔴 THE CANCELLATION GROUP MOVED TO ORDER SETTINGS, UNCHANGED', (() => {
    const i = RAWP.indexOf('id="order-settings"')
    const j = RAWP.indexOf('id="truck-settings"')
    const sec = RAWP.slice(i, j)
    /* ⚠️ THE SLICE ENDS AT WHATEVER SECTION NOW FOLLOWS CONTACT, read from SETTINGS_IDS. It was
     * hard-coded to `auto-replies`, and when the 3 October reorder moved Auto-replies to seventh this
     * "Contact" slice silently grew to cover four sections — so the check that the group had LEFT
     * Contact started reading the group in its new home and failed. */
    const after = SETTINGS_IDS[SETTINGS_IDS.indexOf('contact') + 1]
    const contact = RAWP.slice(RAWP.indexOf('id="contact"'), RAWP.indexOf(`id="${after}"`))
    return /\{\/\* Cancellation policy \*\/\}/.test(sec)
      && /allow_customer_cancellation/.test(sec)
      && /SETTING_COPY\.allowCancellation\.label/.test(sec)      // the wording is the same constant
      && !/Cancellation policy/.test(contact)                    // and it is no longer in Contact
      && i > 0 && j > i
  })())
  /* 🔴 IT HAS ITS OWN HEADING, AND IT COMES FROM THE SAME CONSTANT. Asked for 3 October 2026:
   * moved into a box of its own the group had no title, just a sentence starting "Customers can cancel
   * up to". The heading is `SETTING_COPY.allowCancellation.label`, so it is the setting's OWN words and
   * no new wording was invented — and the duplicate label line inside the row went with it, so the
   * words appear exactly once. */
  t('🔴 "Allow customers to cancel orders" HAS ITS OWN HEADING, from SETTING_COPY', (() => {
    const sec = RAWP.slice(RAWP.indexOf('id="order-settings"'), RAWP.indexOf('id="truck-settings"'))
    const head = /<p className="text-base font-bold text-slate-800">\{SETTING_COPY\.allowCancellation\.label\}<\/p>/
    return head.test(sec)
      // ⚠️ ONCE, not twice — the row's own duplicate label line is gone.
      && (sec.match(/SETTING_COPY\.allowCancellation\.label/g) || []).length === 1
  })())
  /* ⛔ THE STRAY LINE ABOVE THE WORDING. `pt-3 border-t border-slate-100` was a DIVIDER separating
   * this group from the contact fields above it in its old home. Carried into a card of its own it drew
   * a rule across the top of the box, above the first words — which is what the operator reported. */
  t('⛔ NO LEFTOVER DIVIDER ABOVE THE CANCELLATION WORDING', (() => {
    /* ⚠️ SCOPED TO THE CANCELLATION CARD, NOT THE SECTION. `pt-3 border-t border-slate-100` is the
     * ordinary row divider used four more times inside the main Order settings box, where it is doing
     * its job. Only THIS group's copy was stray, because it had nothing above it to divide from.
     * ⚠️ `codeOnly` — the comment recording the removal names the class it removed. */
    const a = RAWP.indexOf('MOVED HERE FROM Contact Details')
    const b = RAWP.indexOf('{/* ── PRE-ORDERS (V7.8 global-config)', a)
    if (a < 0 || b < a) return false
    return !/pt-3 border-t border-slate-100/.test(codeOnly(RAWP.slice(a, b)))
  })())
  /* 🔴 AND IT SITS BELOW THE MAIN ORDER SETTINGS BOX, not above it ("put it in the section
   * below", 3 October 2026). Still inside the Order settings SECTION — the brief puts it there — just
   * past the box it was sitting on top of. */
  t('🔴 THE CANCELLATION BOX IS BELOW THE MAIN ORDER SETTINGS BOX', (() => {
    const sec = RAWP.slice(RAWP.indexOf('id="order-settings"'), RAWP.indexOf('id="truck-settings"'))
    const mainCard = sec.indexOf('<Card className="p-4 space-y-3">')
    const cancel = sec.indexOf('MOVED HERE FROM Contact Details')
    return mainCard > 0 && cancel > mainCard
  })())
  /* 🔴 EVERY SECTION HAS ITS OWN HEADER. The first pass dropped the `<h2>` for the three sections
   * whose card title already said the same words — which left Auto-replies with no header at all.
   * Corrected: the HEADING stays on all eight and the duplicate CARD TITLE goes, so each wording
   * appears exactly once. */
  t('🔴 ALL EIGHT SECTIONS CARRY THEIR OWN `<h2>`, none missing',
    (RAWP.match(/<h2 className="text-lg font-black text-slate-900">/g) || []).length === 8
    && SETTINGS_LABELS.every(l => RAWP.includes(`<h2 className="text-lg font-black text-slate-900">${l}</h2>`)))
  t('⚠️ …and the two card titles that duplicated a heading are gone, so nothing reads twice',
    (RAWP.match(/THE CARD TITLE "/g) || []).length === 2
    && !/<p className="text-base font-bold text-slate-800">Truck details<\/p>/.test(RAWP)
    && !/<p className="text-base font-bold text-slate-800">Order settings<\/p>/.test(RAWP))
  /* 🔴 AUTO-REPLIES IS THE DELIBERATE EXCEPTION (asked for 3 October 2026). Its card title was
   * removed with the other two; the operator asked for it back, repeat and all. That card is hidden in
   * the native app and sits among other cards, so without its own title nothing names the box — the
   * duplication is the lesser cost, and it is the operator's call rather than a tidiness rule.
   * ⚠️ THIS ASSERTION EXISTS SO A LATER "de-duplicate" PASS CANNOT QUIETLY TAKE IT AGAIN. */
  t('🔴 THE AUTO-REPLIES CARD KEEPS ITS OWN TITLE, repeating the heading on purpose',
    /<p className="text-base font-bold text-slate-800">Auto-replies<\/p>/.test(RAWP)
    && /DELIBERATELY REPEATS THE SECTION'S `<h2>`/.test(RAWP))
  /* 🔴 THE BAR HAS ONE RESTING POSITION, NOT TWO. THE BUG (reported 3 October 2026): on load the
   * bar sat 24px down the page and snapped flush the instant you scrolled or tapped a tab. THE CAUSE:
   * sticky can only hold an element at or BELOW its position IN FLOW, and that position is 24px down
   * because every tab's content sits in a shared `pt-6` wrapper — so at scrollTop 0 the pin had
   * nothing to do. THE FIX: the wrapper gives up its padding when a sub-tab bar is the first thing in
   * it. Measured in both engines by scripts/schedule-places-render.cjs AT scrollTop 0. */
  t('🔴 THE JUMP BAR IS FLUSH AT THE TOP ON LOAD, not only after scrolling', (() => {
    const css = read('app/globals.css')
    return /data-subtab-bar\n        className=\{SUBTAB_BAR\}/.test(P)
      && /<div className="pt-6 manage-tab-pad">/.test(RAWP)
      && /\.manage-tab-pad:has\(> \[data-subtab-bar\]:first-child\)/.test(css)
      && /\.manage-tab-pad:has\(> \*:first-child > \[data-subtab-bar\]:first-child\)/.test(css)
      /* ⛔ AND NOT BY A NEGATIVE MARGIN. `-mt-6` was the first fix and it was wrong: SIX different
       * banners can render above the tab content in that wrapper, and the margin pulled the bar up
       * through whichever one was showing. The `:has()` rule applies only when the bar really is
       * first, so a banner day degrades to the ordinary padded layout instead of an overlap. */
      && !/sticky top-0 z-30 -mt-6/.test(P)
  })())
  /* 🔴 ALL THREE SUB-TAB ROWS ARE THE SAME CONTROL (3 October 2026 request). Menu and Schedule were
   * pills; the operator asked for Settings' underlined treatment everywhere. ONE definition, so a
   * restyle cannot leave three rows looking like three different things. */
  t('🔴 MENU AND SCHEDULE USE THE SHARED BAR, not their old pills', (() => {
    const shared = (RAWP.match(/className=\{`\$\{SUBTAB_BAR\} mb-4`\}/g) || []).length
    return shared === 2
      && /data-subtab-bar className=\{`\$\{SUBTAB_BAR\} mb-4`\}/.test(P)
      && (P.match(/className=\{subtabBtn\(/g) || []).length === 3
      /* ⚠️ THE PILL CLASS IS CHECKED, NOT `bg-slate-900 text-white` — that one is still used
       * legitimately by the walkthrough's step chips, so asserting its absence would fail on code this
       * work never touched. */
      && !/px-3\.5 py-1\.5 rounded-full text-sm font-bold whitespace-nowrap transition-colors/.test(P)
  })())
  /* 🔴 …BUT MENU AND SCHEDULE STILL SWITCH PAGES. "they have separate pages though keep that dont
   * have the scrolling like settings" — the style came across and the scroll-spy did NOT. This check
   * is what stops a later tidy-up "unifying" them into Settings' one-long-page behaviour. */
  t('🔴 MENU AND SCHEDULE DID NOT GAIN SETTINGS\' SCROLL BEHAVIOUR', (() => {
    const menu = RAWP.slice(RAWP.indexOf('THE MENU SUB-TABS'), RAWP.indexOf("{activeTab === 'menu' && menuSection === 'items'"))
    const sched = RAWP.slice(RAWP.indexOf('THE SCHEDULE SUB-TABS'), RAWP.indexOf("{isActive && section === 'events' && ("))
    const clean = (seg) => !/useSettingsJumpBar|scrollMarginTop|scrollIntoView|data-settings-tab|jumpTo\(/.test(codeOnly(seg))
    return menu.length > 100 && sched.length > 100 && clean(menu) && clean(sched)
      && /onClick=\{\(\) => setMenuSection\(sec\.id\)\}/.test(P)
      && /onClick=\{\(\) => onSectionChange\(sec\.id\)\}/.test(P)
  })())
  /* 🔴 THE LOGO IS IN THE TRUCK DETAILS BOX (3 October 2026 request). It had a card of its own
   * directly above, so Settings opened with two boxes that are both "what my truck is". */
  t('🔴 THE LOGO IS COMBINED INTO THE TRUCK DETAILS CARD', (() => {
    const sec = RAWP.slice(RAWP.indexOf('id="truck-details"'), RAWP.indexOf('id="contact"'))
    return (sec.match(/<Card className="p-4/g) || []).length === 1
      && /Upload logo/.test(sec) && /logo_storage_path/.test(sec)
      && /label="Truck name"/.test(sec)
      // ⚠️ A MOVE, NOT A REWRITE — the same handlers, still exactly once each.
      && (sec.match(/void uploadLogo\(f\)/g) || []).length === 1
      && (sec.match(/void removeLogo\(\)/g) || []).length === 1
  })())
  t('🔴 THE JUMP TABS ARE NOT GREYED OUT LIKE DISABLED CONTROLS',
    /border-transparent text-slate-600 hover:text-slate-900/.test(P)
    && !/border-transparent text-slate-400 hover:text-slate-600/.test(P))
  /* 🔴 ONE PRESS, NOT TWO. `scrollIntoView` on the tab BUTTON walked every scrollable ancestor —
   * `<main>` included — so keeping the tab in view scrolled the page back and undid the jump that had
   * just started. The bar's own `scrollLeft` is set directly now: one axis, one element. */
  t('🔴 A TAB TAKES ONE PRESS: keeping it in view cannot move the page',
    /bar\.scrollLeft = Math\.max\(0, left\)/.test(P)
    && /bar\.scrollLeft = right - bar\.clientWidth/.test(P)
    && (() => {
      // ⚠️ CODE ONLY — the comment above the effect explains the `scrollIntoView` bug by name.
      const i = RAWP.indexOf('KEEP THE ACTIVE TAB IN VIEW')
      const eff = codeOnly(RAWP.slice(i, RAWP.indexOf('}, [active, activeId])', i)))
      return !/scrollIntoView/.test(eff)
    })())
  /* 🔴 THE BAR IS THE FIRST THING ON THE PAGE (corrected 3 October 2026). It was below the two
   * one-time prompt cards, so the navigation sat under them. The cards are still above section 1 and
   * still outside the tabs — no tab points at them — but the bar comes first. */
  t('🔴 THE JUMP BAR IS THE FIRST CHILD, above the two intro cards',
    RAWP.indexOf('THE STICKY JUMP BAR') < RAWP.indexOf('New to HatchGrab?')
    && RAWP.indexOf('THE STICKY JUMP BAR') < RAWP.indexOf('Get the app'))
  t('⚠️ …and the two intro cards are still above section 1, with no tab pointing at them',
    RAWP.indexOf('New to HatchGrab?') < RAWP.indexOf('══ SECTION: Truck details')
    && RAWP.indexOf('Get the app') < RAWP.indexOf('══ SECTION: Truck details')
    && !/id: 'new-to-hatchgrab'|id: 'get-the-app'/.test(P))
  /* 🔴 THE WORD "Settings" APPEARED THREE TIMES before the operator read a setting: the tab, a page
   * title, and the section headings. The page title is gone. */
  t('🔴 the duplicate "Settings" page title is gone',
    !/<h2 className="font-black text-slate-900 text-lg">Settings<\/h2>/.test(RAWP))
  t('⚠️ the walkthrough and `onSwitchTab(\'settings\')` still reach Settings unchanged',
    /tabIds: \['settings'\]/.test(read('lib/walkthrough.ts'))
    && /data-tab-id=\{t\.id\}/.test(P)
    && /onSwitchTab\('settings'\)/.test(P))

  // ════════════════════════════════════════════════════════════════════════════════════════════
  // PART A.4 · "SAME AS VAN1" — NOT BUILT, AND THE HARNESS PINS THAT
  // ════════════════════════════════════════════════════════════════════════════════════════════
  /* 🔴 STOPPED, NOT SKIPPED. Three fields rendered inside every van's card are TRUCK-level, not
   * per-van — `menu_categories.prep_secs`, `.batch_size` and `.counts_toward_capacity`, all written by
   * `upsert_category` scoped `.eq('truck_id', …)`. The brief says STOP in that case. This asserts
   * nothing was half-built, so the report's claim is checkable rather than trusted. */
  /* ══ 🔴 A.4 WAS STOPPED ON 3 OCTOBER AND BUILT ON 5 OCTOBER ════════════════════════════
   * This check used to assert that NOTHING of "Same as Van1" existed — because the three fields on each
   * van's card were truck-level (`menu_categories` has no `van_id`), so the switch would have collapsed
   * controls that were not that van's. That finding is docs/settings-and-preview-report.md §4.
   * 🔴 IT HAS SINCE BEEN FIXED PROPERLY: `van_category_settings` makes the three fields per van, and
   * the switch is a write fan-out. So the assertion INVERTS — and the real guarding lives in
   * scripts/van-category-settings.cjs, which proves equivalence by compiling both trees. What this
   * check keeps is the boundary that must not move: the MENU tab still writes the truck default. */
  t('🔴 A.4 IS NOW BUILT, and its own harness exists to guard it',
    /same_as_first_van/.test(read('supabase/migrations/20261005_van_category_settings.sql'))
    && fs.existsSync(path.join(REPO, 'scripts/van-category-settings.cjs'))
    && /"van-category-settings\.cjs"/.test(read('scripts/harnesses.json')))
  t('🔴 …and the MENU tab still writes the three fields truck-scoped, as the DEFAULT for every van',
    /api\('upsert_category', \{/.test(P)
    && /counts_toward_capacity: newVal,/.test(P)
    && /from\('menu_categories'\)[\s\S]{0,200}\.eq\('truck_id', truck\.id\)/.test(stripComments(read(ROUTE))))

  // ════════════════════════════════════════════════════════════════════════════════════════════
  // PART B · THE LIVE PREVIEW AND THE VAN DEFAULT
  // ════════════════════════════════════════════════════════════════════════════════════════════
  t('🔴 THE PREVIEW RENDERS THE PUBLIC PAGE\'S OWN CARD, not a copy of its markup',
    /import TruckListCard from '@\/components\/TruckListCard'/.test(P)
    && /<TruckListCard\s*\n?\s*event=\{previewEvent\}/.test(P)
    && /<TruckListCard key=\{event\.id\} event=\{event\} slug=\{slug\} \/>/.test(read('app/trucks/[slug]/TruckClient.tsx')))
  t('⚠️ …in the `compact` variant with no Order CTA — an unsaved event must not offer one',
    /compact\s*\n?\s*hideOrderButton/.test(P)
    && /status: 'unconfirmed'/.test(read(PREVIEW_LIB)))
  /* 🔴 MOVED OUT OF THE FOOTER INTO THE FORM PANE, 5 October 2026. In the footer it shared a row
   * with the buttons and had to be capped at `max-h-[4.75rem]`, so a long venue name was CLIPPED — a
   * preview that could not show the thing it previews. This check inverted with the move: the card must
   * now be in the PANE, below Notes, and must NOT be in the footer. */
  t('🔴 the preview is in the FORM PANE below Notes, at the pane\'s full width', (() => {
    const pane = RAWP.indexOf('data-preview-pane')
    const notes = RAWP.indexOf('<label className="block text-xs font-bold text-slate-600 mb-1">Notes</label>')
    return pane > 0 && notes > 0 && pane > notes
      && /<div className="sm:col-span-2 max-md:hidden" data-preview-pane>/.test(RAWP)
      && /<p className="block text-xs font-bold text-slate-400 mb-1">Preview<\/p>/.test(RAWP)
      // the muted "Filled from" line lives inside the preview, as the brief asks
      && /Filled from \{pickedPlace\?\.name/.test(RAWP.slice(pane, pane + 1400))
  })())
  t('⛔ …and the FOOTER is back to just Cancel and Add event', (() => {
    const i = RAWP.indexOf('shrink-0 border-t border-slate-200 bg-white px-5')
    const foot = RAWP.slice(i, i + 2600)
    return i > 0
      /* ⚠️ MATCHED AS JSX, NOT AS PROSE. This file's `codeOnly` only drops lines that BEGIN with a
       * comment marker, so the continuation lines of the ⛔ note below — which names
       * `max-h-[4.75rem]` to record its removal — survive stripping. Matching the class WITH its
       * closing `">` matches only a real className and never the backticked mention. */
      && !/<TruckListCard/.test(foot)                        // the card has gone
      && !/max-h-\[4\.75rem\] overflow-hidden">/.test(foot) // and so has its height cap
      && /label="Cancel"/.test(foot) && /Add event/.test(foot)
      // ⚠️ the buttons must still sit at the RIGHT: nothing is flex-1 beside them at ≥768 now
      && /<div className="shrink-0 ml-auto flex gap-2">/.test(foot)
  })())
  /* 🔴 THE VAN SHOWS IN THE PREVIEW (the brief's explicit requirement), through the card's own
   * documented `cornerAction` slot — not smuggled into `truckName` or `village`, which the public card
   * uses for other things and renders elsewhere. */
  t('🔴 the preview SHOWS THE VAN when one is chosen, via the card\'s own corner slot',
    /cornerAction=\{previewVanName/.test(P)
    && /cornerAction\?: ReactNode/.test(read('components/TruckListCard.tsx'))
    && /const previewVanName = editingEvent\?\.van_id/.test(P))
  t('⚠️ the phone\'s pinned card IS the preview line, and it updates live',
    /data-preview-line/.test(P) && /\{previewOneLine\}/.test(P)
    && /const previewOneLine = editingEvent/.test(P))
  /* ══ 🔴 THE PREVIEW'S DATE IS IN THE CARD'S OWN FORMAT ═════════════════════════════════
   * THE BUG (reported 5 October 2026): the preview showed "2026-10-22" where every other surface shows
   * "Thu 22 Oct". THE CAUSE: `TruckListCard.formatStandardDate` SPLITS ON '/', and handed anything else
   * falls through to `return dateStr` — printing the database's format, with no error and no warning.
   * The adapter was passing the form's `event_date` straight through.
   * 🔴 'DD/MM/YYYY' IS AN EXISTING CONTRACT, not a new convention: /api/events, /api/embed/events and
   * /api/discovery/events all build their events with `date: toddmmyyyy(e.event_date)`. This asserts
   * the adapter against the SAME formatter the card uses, lifted from the component so the two cannot
   * drift. */
  t('🔴 THE PREVIEW HANDS THE CARD A DATE IT CAN ACTUALLY FORMAT', (() => {
    const card = read('components/TruckListCard.tsx')
    // the card really does split on '/' and fall through — if that changes, this check should be revisited
    if (!/const parts = dateStr\.split\('\/'\)/.test(card) || !/\n    return dateStr;/.test(card)) return false
    const fmt = (dateStr) => {
      const parts = dateStr.split('/')
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]))
        if (!isNaN(d.getTime())) return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
      }
      return dateStr
    }
    const ev = lib.__preview.previewEventFromForm({
      form: { venue_name: 'Lavenham Village Hall', event_date: '2026-10-22', start_time: '17:00', end_time: '20:00' },
      truckName: 'Village Spice',
    })
    const shown = fmt(ev.date)
    /* ⛔ THE RAW ISO STRING MUST NOT SURVIVE TO THE SCREEN — that is the whole bug. */
    return ev.date === '22/10/2026' && shown === 'Thu 22 Oct' && !/\d{4}-\d{2}-\d{2}/.test(shown)
  })())
  t('⚠️ …and an unfilled date is still the prompt, which the card passes through unchanged', (() => {
    const ev = lib.__preview.previewEventFromForm({ form: { venue_name: '', event_date: '' }, truckName: 'V' })
    return ev.date === 'Pick a date'
  })())
  /* ⚠️ THE CONVERSION IS STRING SURGERY, NEVER `new Date()`. A date-only value parsed as a Date is UTC
   * midnight, which is the PREVIOUS DAY for anyone west of London — so the fix for a formatting bug
   * must not introduce an off-by-one-day bug. */
  t('⛔ the conversion never parses the date-only value as a Date', (() => {
    const lib = read(PREVIEW_LIB)
    const fn = lib.slice(lib.indexOf('const toDdMmYyyy'), lib.indexOf('const toDdMmYyyy') + 200)
    return /ymd\.split\('-'\)/.test(fn) && !/new Date\(/.test(fn)
  })())
  t('🔴 nothing unfilled can render as "undefined" or "Invalid date"',
    /export const PREVIEW_PLACEHOLDERS/.test(read(PREVIEW_LIB))
    && /const date = isYmd\(form\.event_date\) \? toDdMmYyyy\(form\.event_date\) : PREVIEW_PLACEHOLDERS\.date/.test(read(PREVIEW_LIB))
    && !/new Date\(form\./.test(read(PREVIEW_LIB)))
  t('🔴 THE VAN DEFAULT NEVER PRE-SELECTS AN INACTIVE VAN, and never overrides a chosen one',
    /activeVanIds: vans\.map\(v => v\.id\)/.test(P)
    && /van_id: p\.van_id \?\? vanDefault/.test(P)
    && /const active = new Set\(input\.activeVanIds\)/.test(read(PREVIEW_LIB)))
  t('⚠️ …and only when the truck has more than one van',
    /const vanDefault = vans\.length > 1/.test(P))
  t('⚠️ "which events happened at this place" uses the SHARED rule, not a weaker local copy',
    /placeForEvent\(e as unknown/.test(P)
    && /name_key: p\.name_key,/.test(read(ROUTE))
    && /name_key: string/.test(read(PLACES_UI)))

  t('⚠️ stage 2 and 3 are still NOT started — no upload, no canvas, no checklist',
    !/<input[^>]*type="file"/.test(U) && !/canvas|toDataURL|html2canvas/i.test(U) && !/checklist/i.test(U))

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
  const SCHEDULE_FOR_VARIANTS = [ev({ venue_id: V_HALL, event_date: '2026-10-13', postcode: 'CO10 9QT' })]

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
      changed(LIB_SRC, "export const NOT_UPCOMING_STATUSES = ['cancelled', 'closed'] as const",
        "export const NOT_UPCOMING_STATUSES = ['closed'] as const", 'W5'),
      P => P.nextEventAt([ev({ event_date: '2026-10-10', status: 'cancelled' })], '2026-10-03') !== null],

    /* ── 🔴 BUG 3's VARIANT. The single status rule is restored: `closed` excluded from "Last" too.
     * That is the bug exactly as reported — a place seeded from a real (and therefore closed) event
     * read "No events yet". */
    ['W5a 🔴 BUG 3 RETURNS: a CLOSED past event stops counting as "Last"',
      changed(LIB_SRC, "export const CANCELLED_STATUSES = ['cancelled'] as const",
        "export const CANCELLED_STATUSES = ['cancelled', 'closed'] as const", 'W5a'),
      P => P.lastEventAt([ev({ event_date: '2026-09-22', status: 'closed' })], '2026-10-03') === null],
    ['W5b 🔴 …and stops counting towards "n times in the last year"',
      changed(LIB_SRC, "export const CANCELLED_STATUSES = ['cancelled'] as const",
        "export const CANCELLED_STATUSES = ['cancelled', 'closed'] as const", 'W5b'),
      P => P.tradedCountInLastYear([ev({ event_date: '2026-09-22', status: 'closed' })], '2026-10-03') === 0],
    ['W5c 🔴 a CLOSED future date is offered as "next" — a pitch that is already over',
      changed(LIB_SRC, "export const NOT_UPCOMING_STATUSES = ['cancelled', 'closed'] as const",
        "export const NOT_UPCOMING_STATUSES = ['cancelled'] as const", 'W5c'),
      P => P.nextEventAt([ev({ event_date: '2026-10-20', status: 'closed' })], '2026-10-03') !== null],

    /* ── 🔴 BUG 4's VARIANTS — the times, and the Last-before-Next order. ── */
    ['W5d 🔴 BUG 4 RETURNS: the muted line loses the times',
      changed(LIB_SRC, "    return `Last: ${fmtDay(p.last_event_date)}${t ? ` \u00b7 ${t}` : ''}`",
        "    return `Last: ${fmtDay(p.last_event_date)}`", 'W5d'),
      P => !P.placeWhenLine({ last_event_date: '2026-10-06', last_start_time: '17:00:00', last_end_time: '20:00:00' }, d => d).includes('17:00')],
    ['W5e 🔴 …and goes back to preferring Next over Last',
      changed(LIB_SRC, "export function placeWhenLine(p: PlaceWhen, fmtDay: (ymd: string | null) => string): string {\n  if (p.last_event_date) {",
        "export function placeWhenLine(p: PlaceWhen, fmtDay: (ymd: string | null) => string): string {\n  if (p.next_event_date) {\n    const tn = timeRangeLabel(p.next_start_time, p.next_end_time)\n    return `Next: ${fmtDay(p.next_event_date)}${tn ? ` \u00b7 ${tn}` : ''}`\n  }\n  if (p.last_event_date) {", 'W5e'),
      P => P.placeWhenLine({ last_event_date: '2026-10-06', next_event_date: '2026-10-20' }, d => d).startsWith('Next')],

    /* ⚠️ RE-ANCHORED (3 October 2026): the line now carries the retired-row guard
     * (`if (!isRetired(existing)) fillFrom(...)`). Same variant, same meaning — the seeder is made to
     * plan a write against a place a second run must leave entirely alone. */
    ['W6 🔴 THE SEEDER REWRITES `name` ON EVERY RUN — the operator\'s edit is reverted',
      changed(LIB_SRC,
        "    if (existing) { if (!isRetired(existing)) fillFrom(existing, g); continue }\n\n    // Not anchored",
        "    if (existing) { plan.fills.push({ placeId: existing.id, address: seedOf(g).name ?? undefined }); continue }\n\n    // Not anchored", 'W6'),
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
    ['W8a 🔴 THE SEEDER STOPS RESPECTING A HIDDEN PLACE and re-creates it every refresh',
      changed(LIB_SRC, "  const isRetired = (p: Place): boolean => p.is_hidden === true || !!p.merged_into_id",
        "  const isRetired = (p: Place): boolean => false", 'W8a'),
      P => {
        const hidden = [{ id: 'h', venue_id: null, name_key: 'lavenham village hall', name: 'Lavenham Village Hall', is_hidden: true }]
        const pl = P.planPlaceSeed({ events: [ev({ venue_id: V_HALL, event_date: '2026-10-13' })], places: hidden, now: NOW })
        // The broken version adopts the hidden row — quietly putting a venue anchor on a row the
        // operator removed from view.
        return pl.adopts.length > 0 || pl.inserts.length > 0
      }],
    ['W8b 🔴 the seeder starts writing `is_hidden`, so hiding is undone by the next refresh',
      // ⚠️ `Object.assign` RATHER THAN A SPREAD LITERAL: a spread into the typed `fills` array is an
      // excess-property error, and a variant that does not compile proves nothing (see W8's own note).
      changed(LIB_SRC, "    if (any) plan.fills.push(patch)",
        "    plan.fills.push(Object.assign({}, patch, { is_hidden: false }))", 'W8b'),
      P => JSON.stringify(P.planPlaceSeed({ events: SCHEDULE_FOR_VARIANTS, places: [{ id: 'x', venue_id: V_HALL, name_key: 'lavenham village hall', name: 'X' }], now: NOW })).includes('is_hidden')],
    ['W8c 🔴 `area` stops being seeded from the event town',
      changed(LIB_SRC, "    area: firstNonBlank(...g.events.map(e => e.town)),", "    area: null,", 'W8c'),
      P => {
        const pl = P.planPlaceSeed({ events: [ev({ venue_name: 'Bull & Butcher', town: 'Clare', event_date: '2026-10-15' })], places: [], now: NOW })
        return pl.inserts.length === 1 && pl.inserts[0].area !== 'Clare'
      }],
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
    /* ⚠️ EVERY FILE `buildLib` COMPILES MUST EXIST IN THE VARIANT ROOT, not just the patched one.
     * `LIB_FILES` gained event-preview.ts and this loop wrote only places.ts, so the compile died
     * with MODULE_NOT_FOUND — which a `catch` would have counted as "caught as required" and passed
     * every variant for the wrong reason. The unpatched siblings are copied verbatim. */
    for (const f of [...LIB_FILES.filter(f => f !== LIB), ...LIB_DEPS]) {
      fs.mkdirSync(path.join(root, path.dirname(f)), { recursive: true })
      fs.copyFileSync(path.join(REPO, f), path.join(root, f))
    }
    let caught = false
    // ⚠️ THE TAG IS THE WHOLE LABEL PREFIX, not `slice(0, 2)`: W8a/W8b/W8c/W8 all read as 'W8'
    // under that, so a compile failure named the wrong variant.
    const tag = label.split(' ')[0]
    try { caught = detect(buildLib(root, tag)) } catch { caught = true }
    console.log(`  ${caught ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  ${label}`)
    if (!caught) caughtAll = false
  }

  // ── SOURCE: the guarantees the planner cannot express ───────────────────────────────────────
  const srcVariants = [
    ['W9 🔴 `ignoreDuplicates` is dropped, so a conflict UPDATES and the operator\'s name is overwritten',
      changed(read(ROUTE), "{ onConflict: 'truck_id,name_key', ignoreDuplicates: true },", "{ onConflict: 'truck_id,name_key' },", 'W9'),
      s => (stripComments(s).match(/onConflict: 'truck_id,name_key', ignoreDuplicates: true/g) || []).length === 2],
    ['W10 🔴 the unique index is removed from the stage-1 migration, so two tabs make two places',
      changed(read(MIGRATION1), 'create unique index if not exists truck_places_truck_name_key_uidx', 'create index if not exists truck_places_truck_name_key_uidx', 'W10'),
      s => /create unique index if not exists truck_places_truck_name_key_uidx/.test(s)],
    ['W11 🔴 renaming a place re-derives `name_key`, orphaning every event at it',
      changed(read(ROUTE), '      patch.name = name', '      patch.name = name; patch.name_key = normalisePlaceName(name)', 'W11'),
      s => !/patch\.name_key/.test(stripComments(s))],
    ['W12 🔴 a write loses its truck_id scope, so knowing a uuid is enough to touch another truck\'s place',
      changed(read(ROUTE), ".update(patch).eq('id', id).eq('truck_id', truck.id)", ".update(patch).eq('id', id)", 'W12'),
      s => /\.update\(patch\)\.eq\('id', id\)\.eq\('truck_id', truck\.id\)/.test(stripComments(s))],

    /* ── 🔴 THE truck_events RULES. These are the ones that matter: that table runs live ordering. ── */
    ['W13 🔴 THE EVENT EDIT PATH STARTS WRITING `truck_place_id` — an edit moves the pitch\'s history',
      changed(read(ROUTE),
        "      const { data, error } = await supabase.from('truck_events').update({ venue_name, town: town ?? null",
        "      const { data, error } = await supabase.from('truck_events').update({ truck_place_id: pickedPlaceId, venue_name, town: town ?? null", 'W13'),
      s => !/from\('truck_events'\)\.update\(\{[^}]*truck_place_id/.test(stripComments(s))],
    ['W14 🔴 the event-update allowlist admits `truck_place_id`, so a client can move a pitch by PATCH',
      changed(read(EVENTS_ACTION),
        "      'customer_note', 'auto_open', 'auto_close', 'notes'",
        "      'customer_note', 'auto_open', 'auto_close', 'notes', 'truck_place_id'", 'W14'),
      s => !/'truck_place_id'/.test(stripComments(s))],
    ['W15 🔴 the insert stops naming the place at all — nothing is ever linked',
      changed(read(ROUTE), 'auto_close: truck.default_auto_close ?? true, truck_place_id: resolvedPlaceId }',
        'auto_close: truck.default_auto_close ?? true }', 'W15'),
      s => /truck_place_id: resolvedPlaceId/.test(stripComments(s))],
    ['W16 🔴 a place-lookup failure takes the SEND down with it',
      changed(read(ROUTE), "  } catch (e) {\n    console.warn('[resolveEventPlaceId] no place linked:'",
        "  } catch (e) {\n    throw e\n    console.warn('[resolveEventPlaceId] no place linked:'", 'W16'),
      s => !/\n    throw e\n/.test(stripComments(s).slice(stripComments(s).indexOf('resolveEventPlaceId')))],

    /* ── THE PLAN GATE MOVED, AND BOTH HALVES OF THAT ARE VARIANTS ── */
    ['W17 🔴 Places is gated again, so a Starter truck cannot tidy its own schedule',
      changed(read(ROUTE), "  if (action === 'sg_places') {", "  if (action === 'sg_places') {\n    if (!canAccess(truck.plan, 'schedule_graphics', truck.feature_overrides ?? {}, truck.trial_expires_at)) return NextResponse.json({ error: 'x' }, { status: 403 })", 'W17'),
      s => !/action === 'sg_places'\) \{\s*\n\s*if \(!canAccess/.test(stripComments(s))],
    ['W18 🔴 the Weekly post pane loses its gate, so it is free on every plan',
      changed(read(PLACES_UI), 'feature="schedule_graphics"', 'feature={undefined as never}', 'W18'),
      s => /feature="schedule_graphics"/.test(stripComments(s))],
    ['W19 🔴 the staff gate loses the places writes',
      changed(read(ROUTE), "    'sg_places', 'sg_upsert_place', 'sg_merge_place',", "", 'W19'),
      s => /'sg_places', 'sg_upsert_place', 'sg_merge_place',/.test(stripComments(s))],
    /* ── 🔴 THE FOUR BUGS, EACH WITH A VARIANT THAT REINSTATES IT ───────────────────────────────── */
    ['W21 🔴 BUG 1 RETURNS: the star refetches the whole list instead of toggling in place',
      changed(read(PLACES_UI), "      patchLocal(p.id, { is_favourite: p.is_favourite })\n      setStarError(",
        "      reload()\n      setStarError(", 'W21'),
      src => { const f = stripComments(src).slice(stripComments(src).indexOf('const setFavourite')); return !/reload\(/.test(f.slice(0, f.indexOf('return { places:') >= 0 ? f.indexOf('}, [api, patchLocal])') : 400)) }],
    ['W21b 🔴 …or writes first and paints after, so the star lags the tap',
      changed(read(PLACES_UI),
        "    patchLocal(p.id, { is_favourite: next })\n    try {\n      await api('sg_upsert_place', { id: p.id, is_favourite: next })",
        "    try {\n      await api('sg_upsert_place', { id: p.id, is_favourite: next })\n      patchLocal(p.id, { is_favourite: next })", 'W21b'),
      src => {
        const f = stripComments(src)
        const i = f.indexOf('const setFavourite')
        const body = f.slice(i, i + 500)
        // the optimistic write must come BEFORE the await
        return body.indexOf('patchLocal(p.id, { is_favourite: next })') < body.indexOf("await api('sg_upsert_place'")
      }],
    ['W22 🔴 BUG 2 RETURNS: the list hides non-favourites behind a flag',
      changed(read(PLACES_UI), "            {others.length > 0 && (", "            {others.length > 0 && showHidden && (", 'W22'),
      src => /\{others\.length > 0 && \(/.test(src)],
    ['W23 🔴 the Places pill comes back, so there are two routes to one screen',
      changed(read(PAGE), "  { id: 'weekly', label: 'Weekly post' },\n]",
        "  { id: 'weekly', label: 'Weekly post' },\n  { id: 'places', label: 'Places' },\n]", 'W23'),
      src => !/id: 'places'/.test(codeOnly(src))],
    ['W24 🔴 the sticky footer becomes part of the scrolling body again',
      changed(read(PAGE), '              <div className="shrink-0 border-t border-slate-200 bg-white px-5',
        '              <div className="border-t border-slate-200 bg-white px-5', 'W24'),
      src => /shrink-0 border-t border-slate-200 bg-white/.test(src)],

    /* ── 🔴 PART A · THE SETTINGS JUMP BAR ──────────────────────────────────────────────────────── */
    ['W25 🔴 the spy goes back to reading the WINDOW, which never scrolls on this page',
      changed(read(PAGE), 'const atBottom = () => el.scrollTop + el.clientHeight >= el.scrollHeight - 2',
        'const atBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2', 'W25'),
      src => {
        const i = src.indexOf('function useSettingsJumpBar')
        const hook = src.slice(i, src.indexOf('function SettingsTab', i))
        return !/window\.scrollY|document\.documentElement\.scrollHeight/.test(hook)
      }],
    ['W26 🔴 the jump offset becomes a GUESSED constant instead of the measured bar height',
      changed(read(PAGE), 'const h = barRef.current?.getBoundingClientRect().height ?? 0',
        'const h = 44', 'W26'),
      src => /const h = barRef\.current\?\.getBoundingClientRect\(\)\.height \?\? 0/.test(src)],
    ['W27 🔴 the scroll-margin and the spy stop sharing one number',
      changed(read(PAGE), 'style={{ scrollMarginTop: pinnedTop, minHeight: lastSectionMinHeight }}',
        'style={{ scrollMarginTop: 60, minHeight: lastSectionMinHeight }}', 'W27'),
      src => (src.match(/scrollMarginTop: pinnedTop/g) || []).length === 8],
    ['W28 🔴 the last section loses its floor, so its tab can never light from the heading rule',
      changed(read(PAGE), ', minHeight: lastSectionMinHeight }}', ' }}', 'W28'),
      src => /minHeight: lastSectionMinHeight/.test(src)],
    ['W29 🔴 the floor goes back to a percentage, which has nothing to resolve against',
      changed(read(PAGE), 'const lastSectionMinHeight = scrollerH > 0 ? `${Math.max(0, scrollerH - pinnedTop)}px` : undefined',
        'const lastSectionMinHeight = `calc(100% - ${Math.round(pinnedTop)}px)`', 'W29'),
      src => /scrollerH > 0 \? `\$\{Math\.max\(0, scrollerH - pinnedTop\)\}px`/.test(src)],
    ['W30 🔴 `<main>` gains a padding-top, so every sticky child pins 24px down the page',
      changed(read(PAGE), '<main id={MANAGE_SCROLLER_ID} className={"w-full min-[1400px]:max-w-5xl min-[1400px]:mx-auto flex-1 min-h-0 overflow-y-auto px-4 pb-6"}>',
        '<main id={MANAGE_SCROLLER_ID} className={"w-full min-[1400px]:max-w-5xl min-[1400px]:mx-auto flex-1 min-h-0 overflow-y-auto px-4 pt-6 pb-6"}>', 'W30'),
      src => !/<main id=\{MANAGE_SCROLLER_ID\}[^>]*\bpt-/.test(src)],
    ['W31 🔴 the `#hash` deep link is dropped — a fragment cannot scroll a non-document scroller',
      changed(read(PAGE), "    const id = typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, '')",
        "    const id = ''", 'W31'),
      src => /window\.location\.hash\.replace\(\/\^#\/, ''\)/.test(src)],
    /* 🔴 THE WORDING GUARD. One word changed in Settings must fail, or "no wording changed" is a
     * claim rather than a check. */
    ['W32 🔴 ONE WORD OF SETTINGS COPY IS CHANGED',
      changed(read(PAGE), '>New to HatchGrab?<', '>New to Hatchgrab?<', 'W32'),
      src => {
        const base = require('child_process')
          .execFileSync('git', ['show', '197cb8c:app/manage/[token]/page.tsx'], { cwd: REPO, encoding: 'utf8', maxBuffer: 64e6 })
        const strings = (x) => {
          const i = x.indexOf('function SettingsTab({ userRole, truck,')
          const seg = x.slice(i, x.indexOf('\nfunction ', i + 50))
          return new Set((codeOnly(seg).match(/>[^<>{}\n]{3,}</g) || []).map(y => y.slice(1, -1).trim()).filter(Boolean))
        }
        const before = strings(base), after = strings(src)
        const allowed = new Set(SETTINGS_LABELS)
        return [...after].filter(y => !before.has(y) && !allowed.has(y)).length === 0
          && [...before].filter(y => !after.has(y)).length === 0
      }],
    ['W33 🔴 the cancellation group is left in Contact instead of moving to Order settings',
      changed(read(PAGE), '      {/* Cancellation policy */}', '      {/* Cancellation policy (moved) */}', 'W33'),
      src => /\{\/\* Cancellation policy \*\/\}/.test(src)],

    /* ── 🔴 THE THREE CORRECTIONS FROM THE OPERATOR, each with the bug it reinstates ────────────── */
    ['W40 🔴 THE DOUBLE-CLICK RETURNS: keeping the tab in view scrolls the page back',
      changed(read(PAGE), "    const pad = 16",
        "    btn.scrollIntoView({ block: 'nearest', inline: 'nearest' })\n    const pad = 16", 'W40'),
      src => {
        const i = src.indexOf('KEEP THE ACTIVE TAB IN VIEW')
        const eff = codeOnly(src.slice(i, src.indexOf('}, [active, activeId])', i)))
        return !/scrollIntoView/.test(eff)
      }],
    ['W41 🔴 a section loses its own header — which is how Auto-replies ended up with none',
      changed(read(PAGE), '        <h2 className="text-lg font-black text-slate-900">Auto-replies</h2>\n', '', 'W41'),
      src => (src.match(/<h2 className="text-lg font-black text-slate-900">/g) || []).length === 8],
    ['W42 🔴 the jump bar drops back below the two intro cards',
      (() => {
        const src = read(PAGE)
        const a = src.indexOf('      {/* ── 🔴 THE STICKY JUMP BAR ──')
        const b = src.indexOf('      {/* ── K4: THE WALKTHROUGH RE-OPEN ENTRY POINT', a)
        const bar = src.slice(a, b)
        const rest = src.slice(0, a) + src.slice(b)
        const at = rest.indexOf('      {/* ══ SECTION: Truck details ══ */}')
        return rest.slice(0, at) + bar + rest.slice(at)
      })(),
      src => src.indexOf('THE STICKY JUMP BAR') < src.indexOf('New to HatchGrab?')],
    ['W43 🔴 the tabs go back to looking disabled',
      changed(read(PAGE), 'border-transparent text-slate-600 hover:text-slate-900',
        'border-transparent text-slate-400 hover:text-slate-600', 'W43'),
      src => /border-transparent text-slate-600 hover:text-slate-900/.test(src)],

    ['W44 🔴 the jump bar goes back to resting 24px down and snapping flush on first scroll',
      changed(read(PAGE), '        data-subtab-bar\n        className={SUBTAB_BAR}',
        '        className={SUBTAB_BAR}', 'W44'),
      src => /data-subtab-bar\n        className=\{SUBTAB_BAR\}/.test(src)],
    ['W48 🔴 Menu and Schedule go back to pills, so the three rows look like two controls',
      changed(read(PAGE), '          <div role="tablist" aria-label="Menu sections" data-subtab-bar className={`${SUBTAB_BAR} mb-4`}>',
        '          <div role="tablist" aria-label="Menu sections" className="min-w-0 overflow-x-auto -mx-1 px-1 pb-1 mb-4">', 'W48'),
      src => (src.match(/className=\{`\$\{SUBTAB_BAR\} mb-4`\}/g) || []).length === 2],
    ['W49 🔴 the Settings section order is scrambled, so a tab jumps to the wrong part of the page',
      changed(read(PAGE), "  { id: 'order-settings', label: 'Order settings' },\n  { id: 'truck-settings', label: 'Truck settings' },\n",
        '', 'W49'),
      src => {
        const ids = ['truck-details', 'contact', 'order-settings', 'truck-settings',
          'schedule', 'qr-code', 'auto-replies', 'account-deletion']
        const at = ids.map(id => src.indexOf(`{ id: '${id}',`))
        return at.every(i => i > 0) && at.every((v, i) => i === 0 || v > at[i - 1])
      }],
    ['W50 🔴 the logo gets its own card back, above truck details',
      changed(read(PAGE), '        <div className="border-t border-slate-100" />\n        {/* ⛔ THE CARD TITLE "Truck details" IS GONE',
        '        </Card>\n      <Card className="p-4 space-y-3">\n        {/* ⛔ THE CARD TITLE "Truck details" IS GONE', 'W50'),
      src => {
        const sec = src.slice(src.indexOf('id="truck-details"'), src.indexOf('id="contact"'))
        return (sec.match(/<Card className="p-4/g) || []).length === 1
      }],
    ['W45 🔴 the Auto-replies card title is "de-duplicated" away again',
      changed(read(PAGE), '          <p className="text-base font-bold text-slate-800">Auto-replies</p>\n', '', 'W45'),
      src => /<p className="text-base font-bold text-slate-800">Auto-replies<\/p>/.test(src)],
    ['W46 🔴 the stray divider returns above the cancellation wording',
      changed(read(PAGE), '        <div className="flex items-center justify-between mt-1">',
        '        <div className="flex items-center justify-between pt-3 border-t border-slate-100">', 'W46'),
      src => {
        const a = src.indexOf('MOVED HERE FROM Contact Details')
        const b = src.indexOf('{/* ── PRE-ORDERS (V7.8 global-config)', a)
        return a >= 0 && b > a && !/pt-3 border-t border-slate-100/.test(codeOnly(src.slice(a, b)))
      }],
    ['W47 🔴 the cancellation box goes back on TOP of the main Order settings box',
      (() => {
        const src = read(PAGE)
        const a = src.indexOf('      {/* 🔴 MOVED HERE FROM Contact Details')
        const b = src.indexOf('      {/* ── PRE-ORDERS (V7.8 global-config)', a)
        const blk = src.slice(a, b)
        const rest = src.slice(0, a) + src.slice(b)
        const at = rest.indexOf('      <Card className="p-4 space-y-3">')
        return rest.slice(0, at) + blk + rest.slice(at)
      })(),
      src => {
        const sec = src.slice(src.indexOf('id="order-settings"'), src.indexOf('id="truck-settings"'))
        return sec.indexOf('MOVED HERE FROM Contact Details') > sec.indexOf('<Card className="p-4 space-y-3">')
      }],

    /* ── 🔴 PART B · THE PREVIEW AND THE VAN DEFAULT ─────────────────────────────────────────────── */
    ['W34 🔴 the preview stops using the public page\'s card',
      changed(read(PAGE), "import TruckListCard from '@/components/TruckListCard'", '', 'W34'),
      src => /import TruckListCard from '@\/components\/TruckListCard'/.test(src)],
    ['W35 🔴 the preview offers an Order button on an event that does not exist',
      changed(read(PAGE), '                      compact\n                      hideOrderButton',
        '                      compact', 'W35'),
      src => /compact\s*\n?\s*hideOrderButton/.test(src)],
    ['W36 🔴 an unfilled date is handed to the card raw, so it renders "Invalid Date"',
      changed(read(PREVIEW_LIB), "  const date = isYmd(form.event_date) ? toDdMmYyyy(form.event_date) : PREVIEW_PLACEHOLDERS.date",
        "  const date = String(form.event_date ?? '')", 'W36'),
      src => /isYmd\(form\.event_date\) \? toDdMmYyyy\(form\.event_date\) : PREVIEW_PLACEHOLDERS\.date/.test(src)],
    ['W51 🔴 the preview hands the card a raw ISO date again — "2026-10-22" on screen',
      changed(read(PREVIEW_LIB), 'isYmd(form.event_date) ? toDdMmYyyy(form.event_date) : PREVIEW_PLACEHOLDERS.date',
        'isYmd(form.event_date) ? form.event_date : PREVIEW_PLACEHOLDERS.date', 'W51'),
      src => /toDdMmYyyy\(form\.event_date\)/.test(src)],

    ['W37 🔴 the van default overrides a van the operator already chose',
      changed(read(PAGE), 'van_id: p.van_id ?? vanDefault,', 'van_id: vanDefault,', 'W37'),
      src => /van_id: p\.van_id \?\? vanDefault,/.test(src)],
    ['W38 🔴 the van default stops checking that the van is still ACTIVE',
      changed(read(PREVIEW_LIB), "    .filter(e => !!e.van_id && active.has(e.van_id as string))",
        "    .filter(e => !!e.van_id)", 'W38'),
      src => /active\.has\(e\.van_id as string\)/.test(src)],
    ['W39 🔴 a CANCELLED event is allowed to decide the van',
      changed(read(PREVIEW_LIB), "    .filter(e => String(e.status ?? '').trim().toLowerCase() !== 'cancelled')",
        '    .filter(() => true)', 'W39'),
      src => /!== 'cancelled'\)/.test(src)],

    ['W20 🔴 the stage-2 migration starts touching existing event rows',
      changed(read(MIGRATION2), 'add column if not exists truck_place_id uuid references public.truck_places(id) on delete set null',
        'add column if not exists truck_place_id uuid references public.truck_places(id) on delete cascade', 'W20'),
      s => /truck_place_id uuid references public\.truck_places\(id\) on delete set null/.test(s)],
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
  const c = show('── 3 · THE WIRING — gate, access pattern, nav, read-only boundary ──────────────────────', runWiringSuite(P))

  console.log(`\n${fails === 0 ? `✅ all ${a.ok.length + b.ok.length + c.ok.length} passed` : `🔴 ${fails} CHECK(S) FAILED`}`)
  process.exit(fails === 0 ? 0 : 1)
})()
