// scripts/longer-intervals-1.cjs — 12 November 2026: LONGER COLLECTION TIMES (45, 60) AND LONGER KITCHEN-CAPACITY STEPS.
//   node scripts/longer-intervals-1.cjs
//
// What changed, and what this proves:
//   1. Collection times: INTERVAL_CHOICES gains 45 and 60 (lib/slot-interval-core.ts); the DB CHECKs widen with it
//      (supabase/migrations/20261092_longer_intervals_and_capacity_window.sql).
//   2. 45 is the one choice that does not divide an hour. The grid is clock-anchored from midnight, so its minutes differ
//      hour to hour (18:00, 18:45, 19:30). `clockGridMinutes(interval, hour)` now takes the hour, and the customer page's
//      fallback picker asks it per hour. 🔴 THE PROOF: for every choice and every 5-minute start, the picker's list equals
//      the server's generator exactly — the V11.15 outage class (picker offers a time the server never makes) cannot recur.
//      At every interval that divides 60, the hour changes nothing (byte-identical to the one-argument form).
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

/** The customer page's fallback list, composed exactly as the page does it now: hours start→end, EACH hour's own
 *  minutes from `minutesFor(interval, hour)`, the first hour narrowed ≥ startM, the last ≤ endM. */
function fallbackList(minutesFor, iv, start, end) {
  const [sH, sM] = start.split(':').map(Number); const [eH, eM] = end.split(':').map(Number)
  const L = []
  for (let h = sH; h <= eH; h++) for (const m of minutesFor(iv, h)) {
    const mm = Number(m)
    if (h === sH && mm < sM) continue
    if (h === eH && mm > eM) continue
    L.push(`${String(h).padStart(2, '0')}:${m}`)
  }
  return L
}
/** Picker ⇔ server for every choice and every 5-minute start 00:00–20:55, a three-hour event, no grace. */
function pickerAgrees(minutesFor) {
  const bad = []
  for (const iv of IV.INTERVAL_CHOICES) for (let s = 0; s <= 20 * 60 + 55; s += 5) {
    const start = toStr(s), end = toStr(s + 180)
    const server = GEN.generateCollectionTimes(start, end, iv, iv, 0).map(r => r.collection_time)
    const picker = fallbackList(minutesFor, iv, start, end)
    if (!eq(server, picker)) bad.push(`${iv} @ ${start}: server ${server.slice(0, 4).join(',')}… picker ${picker.slice(0, 4).join(',')}…`)
  }
  return bad
}

console.log('\n── 1 · THE CHOICES ──────────────────────────────────────────────────────────────────────')
check(eq([...IV.INTERVAL_CHOICES], [5, 10, 15, 20, 30, 45, 60]), 'INTERVAL_CHOICES = 5, 10, 15, 20, 30, 45, 60')
check([45, 60].every(IV.isIntervalChoice) && ![40, 50, 90, 120].some(IV.isIntervalChoice), '45 and 60 accepted; 40, 50, 90, 120 still refused')
check(IV.normaliseInterval(60) === 60 && IV.normaliseInterval(45) === 45, 'a stored 45 / 60 reads back as itself, not as 5')

console.log('\n── 2 · THE FALLBACK PICKER EQUALS THE SERVER, AT EVERY CHOICE ──────────────────────────────')
const bad = pickerAgrees((iv, h) => GEN.clockGridMinutes(iv, h))
check(bad.length === 0, `picker ≡ server for ${IV.INTERVAL_CHOICES.length} intervals × 252 starts${bad.length ? ' — ' + bad.slice(0, 3).join(' | ') : ''}`)
check([5, 10, 15, 20, 30, 60].every(iv => Array.from({ length: 24 }, (_, h) => h).every(h => eq(GEN.clockGridMinutes(iv, h), GEN.clockGridMinutes(iv)))),
  'every interval that divides 60: the hour changes nothing (byte-identical to the one-argument form)')
check(eq(GEN.clockGridMinutes(5), ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']), '5: the twelve minutes, as ever')
check(eq(GEN.clockGridMinutes(45, 18), ['00', '45']) && eq(GEN.clockGridMinutes(45, 19), ['30']) && eq(GEN.clockGridMinutes(45, 20), ['15']),
  '45: 18 → :00 :45 · 19 → :30 · 20 → :15 (midnight-anchored)')
check(eq(GEN.clockGridMinutes(45), ['00', '15', '30', '45']) && eq(GEN.clockGridMinutes(60), ['00']), 'no hour chosen: 45 → every minute on the grid in some hour; 60 → :00')
check(GEN.intervalExample(45) === '18:00, 18:45, 19:30…' && GEN.intervalExample(60) === '18:00, 19:00, 20:00…', 'Manage\'s example under the select: 18:00, 18:45, 19:30… / 18:00, 19:00, 20:00…')

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
check(/availableHours\.flatMap\(h =>[\s\S]{0,600}60 % \(event\?\.collection_interval_mins \?\? 5\) === 0 \? availableMinutes : minutesForHour\(h\)\)/.test(order),
  'the order page\'s fallback list: at 45 each hour\'s own minutes; at every other interval the list it always had')
const mig = src('supabase/migrations/20261092_longer_intervals_and_capacity_window.sql')
const LIST = /in \(5, 10, 15, 20, 30, 45, 60\)/g
check((mig.match(LIST) || []).length === 5, 'the migration widens all five interval CHECKs to 5 … 60')
for (const c of ['trucks_collection_interval_mins_check', 'truck_vans_collection_interval_mins_check', 'truck_vans_operator_collection_interval_mins_check',
  'truck_events_collection_interval_mins_override_check', 'truck_events_operator_collection_interval_mins_override_check', 'truck_vans_capacity_window_mins_check'])
  check(mig.includes(`drop constraint if exists ${c}`) && mig.includes(`add constraint ${c}`), `…${c} dropped and re-added`)
check(/capacity_window_mins between 1 and 60/.test(mig), 'the window CHECK is a RANGE 1–60, so a saved 16–19 stays valid')
check(/^begin;/m.test(mig) && /^commit;/m.test(mig) && !/\b(update|delete|insert)\b/i.test(mig.replace(/--.*$/gm, '')), 'one transaction; no row is written')

console.log('\n── 6 · BROKEN VARIANT — must FAIL ───────────────────────────────────────────────────────')
// The old picker: ONE minute list for every hour (the unhoured form). At 45 it offers 17:00/17:45 on a 17:00 event the
// server starts at 17:15 — the outage class this work had to avoid.
const v1 = pickerAgrees((iv) => GEN.clockGridMinutes(iv))
check(v1.length > 0 && v1.every(b => b.startsWith('45 ')), `V1 one minute list for every hour → FAILS, and only at 45 (${v1.length} starts)`)

console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ longer-intervals-1: collection times to 60, prep and capacity window to 60 — picker ≡ server at every choice'}`)
process.exit(fails ? 1 : 0)
