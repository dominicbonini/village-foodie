// scripts/longer-intervals-1.cjs — 12 November 2026: LONGER COLLECTION TIMES (45, 60) AND LONGER KITCHEN-CAPACITY STEPS.
//   node scripts/longer-intervals-1.cjs
//
// What changed, and what this proves:
//   1. Collection times: INTERVAL_CHOICES gains 45 and 60 (lib/slot-interval-core.ts); the DB CHECKs widen with it
//      (supabase/migrations/20261092_longer_intervals_and_capacity_window.sql).
//   2. ⚠️ RE-PINNED (collection-anchor-1, 12 November 2026): every grid is counted FROM THE EVENT'S START (start, start +
//      interval, …), 45 included, by ONE function — generateCollectionTimes — which the server's lists, server placement,
//      the customer page's backup picker, the operator's list and the demo seeder (firstGridTimeAtOrAfter) all use. The
//      hour-by-hour workaround for 45 is gone. 🔴 THE PROOF (§2): every interval × every 5-minute start, on and off the hour
//      (17:00, 17:10, 19:00, 19:45 named), the backup picker ≡ the customer list ≡ placement, the customer's times sit on the
//      operator's grid, and the first time offered is the first grid time at or after the earliest possible time.
//   3. Prep time: 20–60 minutes in 5-minute steps after 15 (PREP_TIME_OPTIONS); the first 20 options unchanged.
//   4. Capacity window: 1–15 then every 5 to 60 (CAPACITY_WINDOW_OPTIONS), one list for the three selects that each had
//      their own 1…20; an off-list stored value (16–19) is kept as an extra option, never snapped.
// ⚠️ Compiles the TypeScript with the repo's own tsc (no test framework here), the slot-interval-generator.cjs way.

const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const REPO = path.resolve(__dirname, '..')
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'longer-iv-'))
const cfg = path.join(out, 'tsconfig.json')
fs.writeFileSync(cfg, JSON.stringify({
  compilerOptions: {
    module: 'commonjs', target: 'es2020', outDir: out, rootDir: REPO, skipLibCheck: true, resolveJsonModule: true,
    esModuleInterop: true, moduleResolution: 'node', baseUrl: REPO, paths: { '@/*': ['./*'] }, jsx: 'react-jsx',
    types: ['node'], typeRoots: [path.join(REPO, 'node_modules/@types')],
  },
  files: ['lib/slot-generation.ts', 'lib/slot-interval-core.ts', 'lib/kitchen-capacity.ts'].map(f => path.join(REPO, f)),
}))
try { execFileSync(path.join(REPO, 'node_modules/.bin/tsc'), ['-p', cfg], { stdio: 'pipe' }) }
catch (e) { console.log('🔴 COMPILE FAILED:\n' + (e.stdout ? e.stdout.toString() : e.message)); process.exit(1) }
const Module = require('module')
const realResolve = Module._resolveFilename
Module._resolveFilename = function (req, ...rest) {
  if (req.startsWith('@/')) {
    const js = path.join(out, req.slice(2))
    const json = path.join(REPO, req.slice(2))
    return realResolve.call(this, fs.existsSync(js + '.js') || fs.existsSync(path.join(js, 'index.js')) ? js : json, ...rest)
  }
  // a package (next-intl …): the compiled files sit in a temp dir, so look it up from the repo's node_modules
  if (!req.startsWith('.') && !path.isAbsolute(req)) { try { return realResolve.call(this, req, ...rest) } catch { return require.resolve(req, { paths: [REPO] }) } }
  return realResolve.call(this, req, ...rest)
}
const GEN = require(path.join(out, 'lib/slot-generation.js'))
const IV = require(path.join(out, 'lib/slot-interval-core.js'))
const KC = require(path.join(out, 'lib/kitchen-capacity.js'))
const src = (f) => fs.readFileSync(path.join(REPO, f), 'utf8')

let fails = 0
const check = (ok, label) => { console.log(`  ${ok ? '✓' : '🔴'} ${label}`); if (!ok) fails++ }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const toStr = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

const GRACE = 30   // /api/slots and /api/dashboard (truck-only grace times); placement and the backup picker use none
/** The customer page's BACKUP picker, composed exactly as the page does it: the event's times from the shared function
 *  at the event's interval, from the ASAP time on. */
const backupPicker = (gen, iv, start, end, asap) => gen(start, end, iv, iv, 0).map(r => r.collection_time).filter(t => !asap || toMinsH(t) >= toMinsH(asap))
const toMinsH = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
/** Every interval × every 5-minute start 00:00–20:55 (three-hour events) → the disagreements found. `gen` is the grid
 *  function the pickers use; the server side is always the real generateCollectionTimes. */
function agreement(gen) {
  const bad = []
  for (const iv of IV.INTERVAL_CHOICES) for (let s = 0; s <= 20 * 60 + 55; s += 5) {
    const start = toStr(s), end = toStr(s + 180)
    const server = GEN.generateCollectionTimes(start, end, iv, iv, 0).map(r => r.collection_time)        // placement's list
    const customer = GEN.generateCollectionTimes(start, end, iv, iv, GRACE).map(r => r.collection_time)  // /api/slots
    const picker = backupPicker(gen, iv, start, end, null)
    if (!eq(picker, server)) { bad.push(`${iv} @ ${start}: picker ${picker.slice(0, 3).join(',')}… server ${server.slice(0, 3).join(',')}…`); continue }
    if (!eq(customer.filter(t => toMinsH(t) <= s + 180), server)) bad.push(`${iv} @ ${start}: /api/slots (before grace) ≠ placement`)
    if (server[0] !== start || !server.every((t, i) => toMinsH(t) === s + i * iv)) bad.push(`${iv} @ ${start}: not start + k×${iv}`)
    for (const op of IV.INTERVAL_CHOICES) if (iv % op === 0) {
      const opList = GEN.generateCollectionTimes(start, end, op, op, GRACE).map(r => r.collection_time)
      if (!server.every(t => opList.includes(t))) bad.push(`${iv} @ ${start}: a customer time is off the operator's ${op} grid`)
    }
    for (let f = s - 10; f <= s + 190; f += 7) {                                     // the earliest possible time, on and off the grid
      const want = server.find(t => toMinsH(t) >= f) ?? null
      const got = GEN.firstGridTimeAtOrAfter(s, f, iv)
      if (want !== null && toStr(got) !== want) { bad.push(`${iv} @ ${start}: first ≥ ${toStr(f)} is ${want}, helper says ${toStr(got)}`); break }
      if (want === null) continue                                                     // past the end: nothing to offer
      const offered = backupPicker(gen, iv, start, end, want)[0] ?? null
      if (offered !== want) { bad.push(`${iv} @ ${start}: picker offers ${offered} from ${want}`); break }
    }
  }
  return bad
}

console.log('\n── 1 · THE CHOICES ──────────────────────────────────────────────────────────────────────')
check(eq([...IV.INTERVAL_CHOICES], [5, 10, 15, 20, 30, 45, 60]), 'INTERVAL_CHOICES = 5, 10, 15, 20, 30, 45, 60')
check([45, 60].every(IV.isIntervalChoice) && ![40, 50, 90, 120].some(IV.isIntervalChoice), '45 and 60 accepted; 40, 50, 90, 120 still refused')
check(IV.normaliseInterval(60) === 60 && IV.normaliseInterval(45) === 45, 'a stored 45 / 60 reads back as itself, not as 5')

console.log('\n── 2 · ONE GRID, FROM THE EVENT\'S START, FOR SERVER AND EVERY PICKER (collection-anchor-1) ───')
const bad = agreement(GEN.generateCollectionTimes)
check(bad.length === 0, `every interval × 252 starts: backup picker ≡ /api/slots ≡ placement, start + k×interval, customer ⊂ operator, first offered = first grid time ≥ the earliest${bad.length ? ' — ' + bad.slice(0, 3).join(' | ') : ''}`)
const T = (iv, a, b) => GEN.generateCollectionTimes(a, b, iv, iv, 0).map(r => r.collection_time)
check(eq(T(45, '19:00', '21:30'), ['19:00', '19:45', '20:30', '21:15']), '19:00 at 45 → 19:00, 19:45, 20:30, 21:15 (the brief\'s example)')
for (const [iv, a, want] of [[15, '17:00', ['17:00', '17:15', '17:30']], [15, '17:10', ['17:10', '17:25', '17:40']], [60, '19:00', ['19:00', '20:00', '21:00']],
  [60, '19:45', ['19:45', '20:45', '21:45']], [45, '17:10', ['17:10', '17:55', '18:40']], [20, '19:45', ['19:45', '20:05', '20:25']], [30, '17:10', ['17:10', '17:40', '18:10']]])
  check(eq(T(iv, a, '22:00').slice(0, 3), want), `${a} at ${iv} → ${want.join(', ')}…`)
check(GEN.intervalExample(45) === '18:00, 18:45, 19:30…' && GEN.intervalExample(60) === '18:00, 19:00, 20:00…', 'Manage\'s example under the select (an 18:00 start): 18:00, 18:45, 19:30… / 18:00, 19:00, 20:00…')
// 🔴 EVERY CALL SITE builds from the one function; none rounds to a multiple of the interval from midnight any more.
const SITES = { '/api/slots': 'app/api/slots/[truckId]/route.ts', '/api/dashboard': 'app/api/dashboard/route.ts', 'placement': 'lib/orders/place-in-slot.ts', 'demo seeder': 'lib/seed-demo-orders.ts' }
for (const [label, f] of Object.entries(SITES)) check(/generateCollectionTimes\(/.test(src(f)), `${label} builds its times with generateCollectionTimes`)
check(/firstGridTimeAtOrAfter\(toMinsLocal\(args\.startTime\), floorMins, gridMins\)/.test(src('lib/seed-demo-orders.ts')), 'the demo seeder\'s first time is firstGridTimeAtOrAfter (start-anchored)')
check(!/Math\.ceil\(\w+ \/ (gridMins|intervalMins|iv)\) \* (gridMins|intervalMins|iv)/.test(Object.values(SITES).map(src).join('\n') + src('lib/slot-generation.ts')), 'no midnight rounding (ceil(x / interval) × interval) is left at any site')
check(!/clockGridMinutes|firstClockSlotAtOrAfter/.test(src('lib/slot-generation.ts')), 'clockGridMinutes and firstClockSlotAtOrAfter are gone')

console.log('\n── 3 · PREP TIME ────────────────────────────────────────────────────────────────────────')
const OLD_PREP = [...Array.from({ length: 10 }, (_, i) => (i + 1) * 30), ...Array.from({ length: 10 }, (_, i) => 360 + i * 60)]
check(eq(KC.PREP_TIME_OPTIONS.slice(0, 20), OLD_PREP), 'the first 20 options are unchanged (30s … 15m)')
check(eq(KC.PREP_TIME_OPTIONS.slice(20), [1200, 1500, 1800, 2100, 2400, 2700, 3000, 3300, 3600]), 'then 20m, 25m … 60m')
check(KC.prepTimeOptionsFor(1200).filter(o => o.secs === 1200).length === 1, 'a category already at 20m is on the grid now (no duplicate extra)')
check(KC.prepTimeOptionsFor(1260).some(o => o.secs === 1260), 'an off-grid stored value (21m) is still kept as an extra, never snapped')

console.log('\n── 4 · CAPACITY WINDOW ──────────────────────────────────────────────────────────────────')
check(eq(KC.CAPACITY_WINDOW_OPTIONS, [...Array.from({ length: 15 }, (_, i) => i + 1), 20, 25, 30, 35, 40, 45, 50, 55, 60]), '1 … 15, then 20, 25 … 60')
check(KC.capacityWindowOptionsFor(17).includes(17) && KC.capacityWindowOptionsFor(17).length === 25, 'a van saved at 17 keeps 17 as an extra option')
check(eq(KC.capacityWindowOptionsFor(null), KC.CAPACITY_WINDOW_OPTIONS) && eq(KC.capacityWindowOptionsFor(30), KC.CAPACITY_WINDOW_OPTIONS), 'no extra when the value is on the list or unset')
const section = src('components/manage/KitchenCapacitySection.tsx'), dash = src('app/(app)/dashboard/[token]/page.tsx'), manage = src('app/(app)/manage/[token]/page.tsx')
check(/capacityWindowOptionsFor\(van\.capacity_window_mins \?\? 5\)\.map/.test(section), 'Manage › Settings window select reads the shared list')
check(/capacityWindowOptionsFor\(capacityWindowMins\)\.map/.test(dash), 'the dashboard\'s window select reads the shared list')
check(/capacityWindowOptionsFor\(importKitchenCapacity\.capacity_window_mins \?\? 5\)\.map/.test(manage), 'the menu-import wizard\'s window select reads the shared list')
check(!/windowAria[\s\S]{0,700}length: ?20/.test(section + dash + manage), 'no window select keeps its own 1…20')

console.log('\n── 5 · THE PAGE AND THE DATABASE ────────────────────────────────────────────────────────')
const order = src('app/(app)/trucks/[slug]/order/page.tsx')
check(/generateCollectionTimes\(from, to, iv, iv, 0\)/.test(order) && /: backupTimes\s*\n[\s\S]{0,200}\.filter\(time => !asapTime \|\| evMins\(time\) >= evMins\(asapTime\)\)/.test(order),
  'the order page\'s backup picker lists generateCollectionTimes\' own times, from the ASAP time on')
check(/firstGridTimeAtOrAfter\(eventStartMins, asapMins, event\.collection_interval_mins \?\? 5\)/.test(order), '…and its "Around HH:MM" estimate rounds UP onto the same grid')
const mig = src('supabase/migrations/20261092_longer_intervals_and_capacity_window.sql')
const LIST = /in \(5, 10, 15, 20, 30, 45, 60\)/g
check((mig.match(LIST) || []).length === 5, 'the migration widens all five interval CHECKs to 5 … 60')
for (const c of ['trucks_collection_interval_mins_check', 'truck_vans_collection_interval_mins_check', 'truck_vans_operator_collection_interval_mins_check',
  'truck_events_collection_interval_mins_override_check', 'truck_events_operator_collection_interval_mins_override_check', 'truck_vans_capacity_window_mins_check'])
  check(mig.includes(`drop constraint if exists ${c}`) && mig.includes(`add constraint ${c}`), `…${c} dropped and re-added`)
check(/capacity_window_mins between 1 and 60/.test(mig), 'the window CHECK is a RANGE 1–60, so a saved 16–19 stays valid')
check(/^begin;/m.test(mig) && /^commit;/m.test(mig) && !/\b(update|delete|insert)\b/i.test(mig.replace(/--.*$/gm, '')), 'one transaction; no row is written')

console.log('\n── 6 · BROKEN VARIANT — must FAIL ───────────────────────────────────────────────────────')
// A picker on the OLD rule — multiples of the interval from MIDNIGHT — against the start-anchored server: it must disagree
// wherever a start is off its interval, and nowhere else.
const clock = (a, b, iv, d, g) => { const st = toMinsH(a), en = toMinsH(b), out = []
  for (let m = Math.ceil(st / iv) * iv; m <= en + g; m += iv) out.push({ collection_time: toStr(m), production_slot: toStr(m) }); return out }
const v1 = agreement(clock)
check(v1.length > 0 && v1.every(b => { const [iv, , st] = b.split(' '); return toMinsH(st) % Number(iv) !== 0 }), `V1 a midnight-anchored picker → FAILS, and only on starts off the interval (${v1.length} found)`)

console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ longer-intervals-1: collection times to 60 counted from the event start, prep and capacity window to 60 — picker ≡ server at every choice'}`)
process.exit(fails ? 1 : 0)
