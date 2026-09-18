#!/usr/bin/env node
// scripts/slot-interval-event-override.cjs
//
// Proof of the EVENT layer: a dashboard change applies to that event only, and to nothing else.
//   node scripts/slot-interval-event-override.cjs
//
// 🔴 WHAT A FAILURE LOOKS LIKE: an event with no override behaving differently from before the layer
// existed (every truck, every event, every surface must be byte-identical with nothing stored); an
// event override of 15 still consulting its van's operator 5; unticking "Use different times for
// orders I add" KEEPING the 10 it had rather than clearing it; an operator override honoured with no
// customer override (a pair with no customer grid); the operator value reaching a customer surface;
// the offline cached grid on the wrong half of the pair; or a missing column taking the board down
// instead of the box.
//
// The resolver is COMPILED FROM THE WORKING TREE and driven through a fake supabase client, so the real
// branch order is under test rather than a re-description of it.

const fs = require('fs'); const path = require('path')
const { compile, REPO } = require('./_slot-interval-compile.cjs')
const src = (p) => fs.readFileSync(path.join(REPO, p), 'utf8')
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const IV = compile(REPO, ['lib/slot-interval.ts'], 'evov').req('lib/slot-interval.js')
const { generateCollectionTimes } = compile(REPO, ['lib/slot-generation.ts'], 'evov2').req('lib/slot-generation.js')
const { applyEventIntervals, hasEventOverride, readEventIntervals, resolveIntervalsFor, NO_VAN_INTERVALS } = IV

let fails = 0
const check = (ok, label) => { console.log(`  ${ok ? '✓' : '🔴'} ${label}`); if (!ok) fails++ }

// ── FIXTURES ────────────────────────────────────────────────────────────────────────────────────────
const VANS = {
  'van-gusto': { id: 'van-gusto', collection_interval_mins: 5,  operator_collection_interval_mins: null }, // Gusto-shaped
  'van-a':     { id: 'van-a',     collection_interval_mins: 15, operator_collection_interval_mins: 5 },
  'van-b':     { id: 'van-b',     collection_interval_mins: 30, operator_collection_interval_mins: null },
}
const EVENTS = {
  'ev-plain':    { id: 'ev-plain',    van_id: 'van-a',     collection_interval_mins_override: null, operator_collection_interval_mins_override: null },
  'ev-gusto':    { id: 'ev-gusto',    van_id: 'van-gusto', collection_interval_mins_override: null, operator_collection_interval_mins_override: null },
  'ev-novan':    { id: 'ev-novan',    van_id: null,        collection_interval_mins_override: null, operator_collection_interval_mins_override: null },
  'ev-cust15':   { id: 'ev-cust15',   van_id: 'van-a',     collection_interval_mins_override: 15,   operator_collection_interval_mins_override: null },
  'ev-5and10':   { id: 'ev-5and10',   van_id: 'van-a',     collection_interval_mins_override: 5,    operator_collection_interval_mins_override: 10 },
  'ev-unticked': { id: 'ev-unticked', van_id: 'van-a',     collection_interval_mins_override: 5,    operator_collection_interval_mins_override: null },
  'ev-invalid':  { id: 'ev-invalid',  van_id: 'van-a',     collection_interval_mins_override: null, operator_collection_interval_mins_override: 10 },
}
const fakeSupabase = ({ eventError = null } = {}) => ({
  from(table) {
    const q = {
      select(cols) { q._cols = cols; q._table = table; return q },
      eq(_c, v) { q._id = v; return q },
      async maybeSingle() {
        if (q._table === 'truck_events') {
          if (eventError) return { data: null, error: eventError }
          const e = EVENTS[q._id]
          return { data: e ? { collection_interval_mins_override: e.collection_interval_mins_override, operator_collection_interval_mins_override: e.operator_collection_interval_mins_override } : null, error: null }
        }
        const v = VANS[q._id]
        return { data: v ? { collection_interval_mins: v.collection_interval_mins, operator_collection_interval_mins: v.operator_collection_interval_mins } : null, error: null }
      },
    }
    return q
  },
})
const resolve = (evId, opts) => {
  const e = EVENTS[evId]
  return resolveIntervalsFor(fakeSupabase(opts), e?.van_id ?? null, e?.id ?? null)
}
const grid = (iv) => generateCollectionTimes('18:00', '20:00', iv, 10, 30).map(t => t.collection_time)
const E42703 = { code: '42703', message: 'column truck_events.collection_interval_mins_override does not exist' }

;(async () => {

console.log('── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────')
{
  // V1 — an operator override honoured with NO customer override.
  const brokenApply = (van, ov) => {
    const c = ov?.collection_interval_mins_override
    const o = ov?.operator_collection_interval_mins_override
    return { customer: c ?? van.customer, truck: o ?? c ?? van.truck }   // honours o regardless
  }
  const vanA = { customer: 15, truck: 5 }
  const broken = brokenApply(vanA, EVENTS['ev-invalid'])
  const real = applyEventIntervals(vanA, EVENTS['ev-invalid'])
  const differs = broken.truck === 10 && real.truck === 5
  console.log(`  ${differs ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 operator honoured with no customer override — gives ${broken.customer}/${broken.truck} (a pair whose customer grid came from the van and whose operator grid did not); the real rule gives ${real.customer}/${real.truck}`)
  if (!differs) process.exit(1)

  // V2 — untick writing the OLD operator value instead of null.
  const untickBroken = (cur) => ({ customer: cur.customer, operator: cur.operator })       // keeps it
  const untickReal   = (cur) => ({ customer: cur.customer, operator: null })
  const cur = { customer: 5, operator: 10 }
  const keptTen = applyEventIntervals(vanA, { collection_interval_mins_override: untickBroken(cur).customer, operator_collection_interval_mins_override: untickBroken(cur).operator }).truck === 10
  console.log(`  ${keptTen ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V2 untick writing the old value — the event keeps its operator 10 while the box says it follows customers`)
  if (!keptTen) process.exit(1)
  const cleared = applyEventIntervals(vanA, { collection_interval_mins_override: untickReal(cur).customer, operator_collection_interval_mins_override: untickReal(cur).operator })
  console.log(`  ⚠️ …the real untick gives ${cleared.customer}/${cleared.truck}`)

  // V3 — the new columns named on the dashboard's MAIN event select.
  const dashRoute = strip(src('app/api/dashboard/route.ts'))
  const mainSelect = (dashRoute.match(/\.from\('truck_events'\)\s*\n?\s*\.select\('([^']+)'/) || [])[1] || ''
  const wouldBreak = (mainSelect + ', collection_interval_mins_override')
  console.log(`  ${/collection_interval_mins_override/.test(wouldBreak) ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V3 override columns added to the dashboard's main event select → one absent column 42703s the whole statement onto the silent-empty-board path`)
}

console.log('\n── NO EVENT OVERRIDE ⇒ IDENTICAL TO THE VAN-LEVEL RESULT ───────────────────────────────')
for (const [id, expect] of [['ev-plain', [15, 5]], ['ev-gusto', [5, 5]], ['ev-novan', [5, 5]], ['ev-invalid', [15, 5]]]) {
  const r = await resolve(id)
  check(r.customer === expect[0] && r.truck === expect[1] && r.fromEvent === false,
    `${id}: ${r.customer}/${r.truck} (van-level), fromEvent=false${id === 'ev-invalid' ? ' — an operator value with no customer value is IGNORED, the van wins' : ''}`)
}
{
  const r = await resolve('ev-gusto')
  check(JSON.stringify(grid(r.truck)) === JSON.stringify(grid(5)), 'a Gusto-shaped event (van 5/null, no override) generates the identical 5-minute grid')
}

console.log('\n── AN EVENT OVERRIDE REPLACES THE VAN ENTIRELY ─────────────────────────────────────────')
{
  const r = await resolve('ev-cust15')
  check(r.customer === 15 && r.truck === 15,
    `🔴 event customer 15, operator null → ${r.customer}/${r.truck} — even though the VAN has operator 5. The van is ignored, not merged.`)
  check(r.fromEvent === true, '…and fromEvent is true')
  const r2 = await resolve('ev-5and10')
  check(r2.customer === 5 && r2.truck === 10, `event customer 5, operator 10 → ${r2.customer}/${r2.truck}`)
}

console.log('\n── THE UNTICK CASE: THE 10 IS NOT KEPT ─────────────────────────────────────────────────')
{
  // The dashboard untick writes { customer: <current>, operator: null } — modelled exactly.
  const before = await resolve('ev-5and10')
  const afterOv = { collection_interval_mins_override: before.customer, operator_collection_interval_mins_override: null }
  const after = applyEventIntervals({ customer: 15, truck: 5 }, afterOv)
  check(before.truck === 10 && after.truck === 5 && after.customer === 5,
    `🔴 5/10 → untick → ${after.customer}/${after.truck}. The 10 is gone, and the operator follows THIS EVENT'S customer value (5), not the van's 15.`)
  check(hasEventOverride(afterOv) === true, '…and the event still has its own pair — untick clears the operator half, not the override')
}

console.log('\n── TICKING PRE-SETS TO THE EFFECTIVE CUSTOMER VALUE ────────────────────────────────────')
{
  // The dashboard tick writes { customer, operator: customer }.
  const eff = await resolve('ev-cust15')
  const ticked = applyEventIntervals({ customer: 15, truck: 5 }, { collection_interval_mins_override: eff.customer, operator_collection_interval_mins_override: eff.customer })
  check(ticked.truck === eff.customer && ticked.truck === 15, `ticking on a 15 event pre-sets the operator to 15 (not the van's 5, not 5)`)
  const src2 = strip(src('app/dashboard/[token]/page.tsx'))
  check(/onChange=\{e=>saveCollectionIntervals\(customer,e\.target\.checked\?customer:null\)\}/.test(src2),
    '…and the control does exactly that: checked ? customer : null')
}

console.log('\n── REVERT: BOTH COLUMNS NULL ⇒ BACK TO THE VAN ─────────────────────────────────────────')
{
  const reverted = applyEventIntervals({ customer: 15, truck: 5 }, { collection_interval_mins_override: null, operator_collection_interval_mins_override: null })
  check(reverted.customer === 15 && reverted.truck === 5, `revert → ${reverted.customer}/${reverted.truck}, the van's pair`)
  const page = strip(src('app/dashboard/[token]/page.tsx'))
  check(/onClick=\{\(\)=>saveCollectionIntervals\(null,null\)\}/.test(page), '"Use my usual setting" calls the saver with (null, null)')
  check(/Use my usual setting/.test(page), '…and the control exists on the dashboard')
  check(/\{hasEventOv&&\(/.test(page), '…shown only when the event actually has an override')
}

console.log('\n── AN OPERATOR OVERRIDE WITHOUT A CUSTOMER ONE IS REJECTED ─────────────────────────────')
{
  const action = strip(src('app/api/dashboard/action/route.ts'))
  check(/if \(customer === null && operator !== null\) \{[\s\S]{0,200}status: 400/.test(action),
    '🔴 the save route refuses it with a 400 and a visible message')
  check(/Set the customer collection times before setting your own\./.test(action), '…and the message says what to do')
  check(applyEventIntervals({ customer: 15, truck: 5 }, EVENTS['ev-invalid']).truck === 5,
    '…and if such a row ever existed the resolver ignores it rather than inventing a customer grid')
}

console.log('\n── CUSTOMER PATHS NEVER RECEIVE THE OPERATOR VALUE ─────────────────────────────────────')
{
  const events = strip(src('app/api/events/route.ts'))
  const submit = strip(src('app/api/orders/submit/route.ts'))
  const promote = strip(src('lib/payments/promote-draft.ts'))
  const orderPage = strip(src('app/trucks/[slug]/order/page.tsx'))
  const menu = strip(src('app/api/menu/[truckId]/route.ts'))
  check(/\)\.customer,/.test(events) && !/\.truck\b/.test(events), '/api/events publishes only .customer')
  check(/const customerIntervalMins = \(vanId \|\| vanIv\.fromEvent\) \? vanIv\.customer :/.test(submit), 'submit uses .customer (event → van → legacy truck)')
  check(/const customerIntervalMins = \(vanId \|\| vanIv\.fromEvent\) \? vanIv\.customer :/.test(promote), 'promoteDraft uses .customer')
  check(!/vanIv\.truck/.test(submit) && !/vanIv\.truck/.test(promote), 'neither customer path reads .truck')
  check(!/operator_collection_interval_mins/.test(orderPage) && !/operator_collection_interval_mins/.test(menu), 'the customer page and /api/menu never see an operator column')
}

console.log('\n── THE OFFLINE CACHED GRID USES THE EVENT\'S EFFECTIVE TRUCK VALUE ──────────────────────')
{
  const dash = strip(src('app/api/dashboard/route.ts'))
  check(/const vanIntervals = await resolveIntervalsFor\(supabase, selectedEvent\?\.van_id \?\? null, selectedEvent\?\.id \?\? null\)/.test(dash),
    '/api/dashboard resolves the SELECTED EVENT\'S pair (van id + event id)')
  check(/const truckIntervalMins = vanIntervals\.truck/.test(dash), '…and takes .truck')
  for (const [id, expected] of [['ev-cust15', 15], ['ev-5and10', 10], ['ev-plain', 5], ['ev-gusto', 5]]) {
    const r = await resolve(id)
    const server = grid(r.truck)
    const cached = { slots: server, intervalMins: r.truck }
    check(r.truck === expected && JSON.stringify(cached.slots) === JSON.stringify(grid(cached.intervalMins)),
      `${id}: cached grid = dot grid = ${cached.slots.length} slots at the effective truck interval ${r.truck}`)
  }
}

console.log('\n── MANAGE RESETS THIS VAN\'S EVENTS (Dominic\'s R1(d) choice: the order-ready rule) ──────')
{
  const manage = strip(src('app/api/manage/route.ts'))
  check(/collection_interval_mins_override: null, operator_collection_interval_mins_override: null/.test(manage),
    '🔴 a Manage interval change CLEARS both event columns — so events follow the van\'s new value AND keep following it')
  check(/\.eq\('truck_id', truck\.id\)\s*\n\s*\.eq\('van_id', vanId\)/.test(manage),
    '…scoped to THIS VAN\'s events (the setting is per-van; truck-wide would reset another van\'s events)')
  check(/if \(Object\.keys\(intervalUpdates\)\.length\) \{[\s\S]{0,400}from\('truck_events'\)/.test(manage),
    '…and only when an interval actually changed')
  // The effective outcome, modelled.
  const afterReset = applyEventIntervals({ customer: 10, truck: 10 }, { collection_interval_mins_override: null, operator_collection_interval_mins_override: null })
  check(afterReset.customer === 10 && afterReset.truck === 10, 'after the reset an event that HAD 5/10 reads the van\'s new 10/10')
}

console.log('\n── A 42703 DISABLES ONLY THE BOX ───────────────────────────────────────────────────────')
{
  const r = await resolve('ev-cust15', { eventError: E42703 })
  check(r.customer === 15 && r.truck === 5, `the event falls back to its VAN (${r.customer}/${r.truck}) — ordering is unaffected`)
  check(r.eventReadOk === false, 'eventReadOk false, so the box can say so')
  const dashRoute = strip(src('app/api/dashboard/route.ts'))
  const mainSelect = (dashRoute.match(/\.from\('truck_events'\)\s*\n?\s*\.select\('([^']+)'/) || [])[1] || ''
  check(!/collection_interval_mins_override/.test(mainSelect), '🔴 the dashboard\'s MAIN event select names neither override column')
  check(/const eventIntervalOverrides = await readEventIntervalsForTruck\(supabase, truck\.id\)/.test(dashRoute), '…they come from a separate probed read')
  const page = strip(src('app/dashboard/[token]/page.tsx'))
  check(/\{!eventIntervalsAvailable \? \(/.test(page), 'the box branches on the flag')
  check(/Collection times are unavailable right now\./.test(page), '…showing exactly that one line')
  check(/setEventIntervalsAvailable\(data\.eventIntervalsAvailable !== false\)/.test(page), 'an absent flag reads as available')
  const boxStart = page.indexOf('Collection times are unavailable right now.')
  check(!/vanBuzzerCount|effectivePaidStep|effectiveTakesCash/.test(page.slice(boxStart - 200, boxStart + 200)), 'no other dashboard setting sits inside that branch')
  // The save route degrades visibly rather than silently.
  const action = strip(src('app/api/dashboard/action/route.ts'))
  check(/Collection times could not be saved right now\./.test(action) && /status: 500/.test(action), 'a save against the missing columns returns a visible error, never { success: true }')
}

console.log('\n── DASHBOARD ORDER: Collection times sits DIRECTLY ABOVE Kitchen capacity (17 Sep 2026) ──')
{
  // 🔴 FAILURE MODE: the box drifting away from the Kitchen capacity card — back to where it first
  // landed (above the buzzer card, four cards away), or anywhere else — so the dashboard stops matching
  // Manage, where the same box sits directly above the same card.
  const page = src('app/dashboard/[token]/page.tsx')
  // The Settings tab's card sequence, as the titles the operator reads, in source order.
  const TITLES = ['Collection times', 'Remind me to add a buzzer', 'Take card payments online', 'Sounds', 'Kitchen capacity']
  const tabStart = page.indexOf("{activeTab==='settings'&&(")
  const order = (text) => TITLES
    .map(t => ({ t, i: text.indexOf(`>${t}<`, tabStart) }))
    .filter(x => x.i >= 0)
    .sort((a, b) => a.i - b.i)
    .map(x => x.t)
  const directlyAbove = (seq) => seq.indexOf('Kitchen capacity') - seq.indexOf('Collection times') === 1
  // BROKEN VARIANT FIRST — the sequence as it was before the move (box above the buzzer card).
  const oldSeq = ['Collection times', 'Remind me to add a buzzer', 'Take card payments online', 'Sounds', 'Kitchen capacity']
  console.log(`  ${!directlyAbove(oldSeq) ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V4 the box in its ORIGINAL position (above the buzzer card): ${oldSeq.join(' → ')}`)
  if (directlyAbove(oldSeq)) process.exit(1)
  // REAL — the working tree.
  const seq = order(page)
  check(directlyAbove(seq), `🔴 the real page: Collection times immediately precedes Kitchen capacity — ${seq.join(' → ')}`)
  check(seq[seq.length - 1] === 'Kitchen capacity' && seq[seq.length - 2] === 'Collection times', 'no card title sits between them')
  // And the Manage page has the same adjacency (the thing this is matching).
  const manage = src('app/manage/[token]/page.tsx')
  const mStart = manage.indexOf('COLLECTION TIMES — PER VAN'), mKc = manage.indexOf('{/* Kitchen capacity — ONE aligned grid')
  check(mStart > 0 && mKc > mStart && !/font-semibold text-slate-800">(?!Customer Collection Times|Your Collection Times)[^<]+<\/span>/.test(manage.slice(manage.indexOf('</div>', mStart + 4000), mKc)), 'Manage: the same box sits directly above the same card')
  // Nothing but the position moved: the box\'s copy is intact.
  for (const t of ['Customer Collection Times', 'Use different times for orders I add', 'Your Collection Times', 'Use my usual setting', 'Collection times are unavailable right now.'])
    check(page.includes(t), `copy intact: "${t}"`)
  // 18 September 2026: the one conditional hint line exists on BOTH boxes, identically (scripts/collection-times-hint.cjs proves the rule).
  check((page.match(/collectionTimesHint\(mc\)/g) || []).length === 1 && (manage.match(/collectionTimesHint\(mc\)/g) || []).length === 1, 'the ONE conditional hint line is present once on each box')
}

console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ event override proven'}`)
process.exit(fails ? 1 : 0)
})()
