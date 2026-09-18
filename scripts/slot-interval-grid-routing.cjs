#!/usr/bin/env node
// scripts/slot-interval-grid-routing.cjs
//
// Proof of V2/V3 routing: which interval each order path reads, now that BOTH live on the VAN.
//   node scripts/slot-interval-grid-routing.cjs
//
// 🔴 WHAT A FAILURE LOOKS LIKE: an operator's Add Order list drawn from the CUSTOMER interval when the
// van has an override (or the reverse); /api/slots handing the operator grid to an unauthenticated
// caller; a customer placement checked against anything but the event's van's collection_interval_mins;
// an operator 18:05 on a van with override 5 / customer 15 treated as off-list; the truck override
// leaking onto a public customer endpoint; or any path still reading the dropped trucks column.
//
// Two layers. (1) SOURCE: the routes are read with comments stripped and the routing asserted on the
// executable text. (2) MODEL: the interval selection and the generator are run for real (compiled from
// the working tree) against FIXTURE vans.

const fs = require('fs'); const path = require('path')
const { compile, REPO } = require('./_slot-interval-compile.cjs')
const src = (p) => fs.readFileSync(path.join(REPO, p), 'utf8')
// Strip comments so a retired string quoted in prose can never satisfy an assertion.
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

let fails = 0
const check = (ok, label) => { console.log(`  ${ok ? '✓' : '🔴'} ${label}`); if (!ok) fails++ }

const slotsRoute  = strip(src('app/api/slots/[truckId]/route.ts'))
const dashRoute   = strip(src('app/api/dashboard/route.ts'))
const eventsRoute = strip(src('app/api/events/route.ts'))
const submit      = strip(src('app/api/orders/submit/route.ts'))
const promote     = strip(src('lib/payments/promote-draft.ts'))
const action      = strip(src('app/api/dashboard/action/route.ts'))
const panel       = strip(src('components/dashboard/AddOrderPanel.tsx'))
const placeIn     = strip(src('lib/orders/place-in-slot.ts'))
const orderPage   = strip(src('app/trucks/[slug]/order/page.tsx'))
const menuRoute   = strip(src('app/api/menu/[truckId]/route.ts'))

const { generateCollectionTimes } = compile(REPO, ['lib/slot-generation.ts'], 'routing').req('lib/slot-generation.js')
const { normaliseInterval } = compile(REPO, ['lib/slot-interval.ts'], 'routing2').req('lib/slot-interval.js')

// The routing model, lifted from /api/slots. `van` is the EVENT'S van row (null = no van resolved).
// Broken variant V1 = the operator is given the customer value even when the van has an override.
function chooseInterval(truck, van, operator, variantIgnoreOverride) {
  const customerFromVan = van ? normaliseInterval(van.collection_interval_mins) : null
  const truckFromVan = van
    ? (van.operator_collection_interval_mins == null || variantIgnoreOverride
        ? normaliseInterval(van.collection_interval_mins)
        : normaliseInterval(van.operator_collection_interval_mins))
    : null
  // No van ⇒ the legacy contract: the customer value still comes from trucks.collection_interval_mins,
  // keeping its 0-means-"use collection_times" meaning; the operator value is 5.
  const customerInterval = van ? customerFromVan : (truck.collection_interval_mins ?? 0)
  const intervalMins = operator ? (van ? truckFromVan : 5) : customerInterval
  return { intervalMins, displayIntervalMins: normaliseInterval(intervalMins) }
}
const gridFor = (iv) => generateCollectionTimes('18:00', '20:00', iv, 10, 30).map(t => t.collection_time)
const TRUCK = { collection_interval_mins: 5 }
const VAN_OVERRIDE = { collection_interval_mins: 15, operator_collection_interval_mins: 5 }  // customer 15, operator 5
const VAN_PLAIN    = { collection_interval_mins: 15, operator_collection_interval_mins: null } // customer 15, operator follows

console.log('── BROKEN VARIANT: MUST report FAILURE ──────────────────────────────────────────────────')
{
  const iv = chooseInterval(TRUCK, VAN_OVERRIDE, true, true).intervalMins
  const onList = gridFor(iv).includes('18:05')
  console.log(`  ${!onList ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 operator ignoring the van override — 18:05 ${onList ? 'on' : 'NOT on'} the operator list (interval ${iv})`)
  if (onList) process.exit(1)
}

console.log('\n── MODEL: interval selection as /api/slots does it, per van ─────────────────────────────')
check(chooseInterval(TRUCK, VAN_OVERRIDE, false, false).intervalMins === 15, 'customer caller, van customer 15 / override 5 → 15')
check(chooseInterval(TRUCK, VAN_OVERRIDE, true,  false).intervalMins === 5,  'authenticated operator, same van → 5 (the override)')
check(chooseInterval(TRUCK, VAN_PLAIN,    true,  false).intervalMins === 15, '🔴 NULL override → the operator FOLLOWS the customer value (15), not 5')
check(chooseInterval(TRUCK, VAN_PLAIN,    false, false).intervalMins === 15, '…and the customer on that van is 15 too')
check(gridFor(chooseInterval(TRUCK, VAN_OVERRIDE, true, false).intervalMins).includes('18:05'), 'operator 18:05 with override 5 / customer 15 IS on the operator list → capacity-checked, not off-list')
check(!gridFor(chooseInterval(TRUCK, VAN_OVERRIDE, false, false).intervalMins).includes('18:05'), '…and 18:05 is NOT on the customer list at 15')
check(chooseInterval(TRUCK, null, false, false).intervalMins === 5 && chooseInterval(TRUCK, null, true, false).intervalMins === 5, 'no van resolves → 5 for both (the truck value feeds the customer side)')
check(chooseInterval({ collection_interval_mins: 0 }, null, false, false).intervalMins === 0, 'no van + legacy truck interval 0 → 0 preserved, so the collection_times fallback still fires')

console.log('\n── SOURCE: /api/slots resolves the EVENT\'S VAN and gates the operator grid ──────────────')
// UPDATED for the event layer: the call is now resolveIntervalsFor(van_id, event_id) — the van half
// is unchanged and still comes from todayEvent.van_id, which is what this assertion protects.
check(/const vanIntervals = await resolveIntervalsFor\(supabase, todayEvent\?\.van_id \?\? null, todayEvent\?\.id \?\? null\)/.test(slotsRoute), 'resolveIntervalsFor is given todayEvent.van_id — the SAME van_id kitchen_capacity is read from — and todayEvent.id')
check(/\.select\('kitchen_capacity, capacity_window_mins'\)\s*\n\s*\.eq\('id', todayEvent\.van_id\)/.test(slotsRoute), '…and that van_id is exactly what the kitchen_capacity select uses')
check(/const operator = await isOperatorOf\(truckId, tokenParam\)/.test(slotsRoute), 'operator = isOperatorOf(truckId, token) — the dashboard token, verified server-side')
check(/const customerInterval = todayEvent\?\.van_id \? vanIntervals\.customer : \(truck\.collection_interval_mins \?\? 0\)/.test(slotsRoute), 'customer = the van\'s value; no van ⇒ the legacy trucks read, 0 contract intact')
check(/const intervalMins = operator \? vanIntervals\.truck : customerInterval/.test(slotsRoute), 'operator gets vanIntervals.truck (already the ?? -resolved effective value)')
check(/generateCollectionTimes\(eventStart, eventEnd, intervalMins, slotDurationMins, GRACE_MINS\)/.test(slotsRoute), 'the grid is generated from the CHOSEN interval')

console.log('\n── SOURCE: operator path (dashboard + Add Order) ────────────────────────────────────────')
// UPDATED for the event layer: same reason as above — the selected event supplies BOTH ids now.
check(/const vanIntervals = await resolveIntervalsFor\(supabase, selectedEvent\?\.van_id \?\? null, selectedEvent\?\.id \?\? null\)/.test(dashRoute), '/api/dashboard resolves intervals from the SELECTED EVENT (its van and its own override)')
check(/const truckIntervalMins = vanIntervals\.truck/.test(dashRoute), '…and uses the effective truck interval')
check(/generateCollectionTimes\(selectedEvent\.start_time, selectedEvent\.end_time, intervalMins, slotDurationMins, GRACE_MINS\)/.test(dashRoute) && /const intervalMins = truckIntervalMins/.test(dashRoute), 'the dashboard grid is generated at the effective truck interval')
// 18 September 2026: the panel's two /api/slots reads (list + fresh re-check) were FACTORED into one
// function, fetchFreshSlots, that both callers share — so there is now exactly ONE fetch site carrying the
// token, and the proof is that both callers go through it and nothing else reaches /api/slots.
check((panel.match(/p\.set\('token', token\)\s*\n\s*const res = await fetch\(`\/api\/slots\/\$\{truck\.id\}\?\$\{p\}`, \{ cache: 'no-store' \}\)/g) || []).length === 1, 'AddOrderPanel has exactly ONE /api/slots fetch site (fetchFreshSlots), and it sends the dashboard token with cache: no-store')
check((panel.match(/fetch\(`\/api\/slots\//g) || []).length === 1, '…and no other /api/slots fetch exists in the panel')
check(/applyFreshSlots\(await fetchFreshSlots\(\{ event_date: eventDate/.test(panel) && /const checkData = await fetchFreshSlots\(manualEvent\)/.test(panel), 'BOTH callers — the list (fetchManualSlots) and the fresh re-check (submitManual) — go through fetchFreshSlots')
check(/action === 'manual'/.test(action) && !/placeOrderInSlotLocked/.test(action), "the 'manual' branch never calls placeOrderInSlotLocked (operator placement bypasses the customer gate)")

console.log('\n── SOURCE: customer paths read the VAN\'s customer value, never the override ─────────────')
check(/const \{ kitchenCapacity, capacityWindowMins, vanId \} = await eventKitchenCapacity\(/.test(submit), 'submit takes vanId from eventKitchenCapacity — the same resolver capacity uses')
// UPDATED for the event layer: the condition gained `|| vanIv.fromEvent`, so an event override still
// applies on an event whose van cannot be resolved. The legacy truck fallback is otherwise untouched.
check(/const customerIntervalMins = \(vanId \|\| vanIv\.fromEvent\) \? vanIv\.customer : \(truck\.collection_interval_mins \?\? 0\)/.test(submit), 'submit: the event-or-van customer value, else the legacy truck read')
check(/customerIntervalMins,\s*\n\s*truck\.slot_duration_mins \?\? customerIntervalMins,/.test(submit), '…and that is what placeOrderInSlotLocked receives')
check(/const customerIntervalMins = \(vanId \|\| vanIv\.fromEvent\) \? vanIv\.customer : \(truck\.collection_interval_mins \?\? 0\)/.test(promote), 'promoteDraft applies the identical rule (a card order is placed on the same grid)')
check(!/\.truck\b/.test(submit.match(/vanIv[^\n]*/g)?.join('\n') || '') && !/vanIv\.truck/.test(promote), 'neither customer path ever reads vanIntervals.truck')
check(!/operator_collection_interval_mins/.test(orderPage) && !/operator_collection_interval_mins/.test(menuRoute), 'the customer page and /api/menu never see the override')
// UPDATED for the event layer: the map now holds the van PAIR and the published value comes from
// applyEventIntervals(...).customer, so the event override is honoured. Still customer-only.
check(/ONLY THE CUSTOMER VALUE IS EXPOSED/.test(src('app/api/events/route.ts')) && /\)\.customer,/.test(eventsRoute) && !/\.truck\b/.test(eventsRoute), '/api/events publishes only the customer half')
check(/collection_interval_mins: applyEventIntervals\(/.test(eventsRoute) && /eventOverrides\.byEventId\.get\(e\.id\)/.test(eventsRoute), '…attached PER EVENT: that event\'s own override, else its van\'s value')
check(/clockGridMinutes\(event\?\.collection_interval_mins \?\? 5\)/.test(orderPage), 'the fallback picker draws from the SELECTED EVENT\'S interval, not the truck\'s')

console.log('\n── SOURCE: the dropped truck column is read nowhere ─────────────────────────────────────')
for (const [label, text] of [['/api/slots', slotsRoute], ['/api/dashboard', dashRoute], ['submit', submit], ['promoteDraft', promote], ['place-in-slot', placeIn], ['order page', orderPage], ['/api/menu', menuRoute]]) {
  check(!/trucks[^\n]*operator_collection_interval_mins|from\('trucks'\)[\s\S]{0,120}operator_collection_interval_mins/.test(text), `${label} does not read trucks.operator_collection_interval_mins`)
}
check(!/readOperatorInterval/.test(slotsRoute + dashRoute + submit + promote), 'readOperatorInterval is gone from every route')

console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ grid routing proven at van level'}`)
process.exit(fails ? 1 : 0)
