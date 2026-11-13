// scripts/offline-start-1.cjs — 13 November 2026: OFFLINE ORDER PROTECTION STARTS AT THE EVENT'S START TIME.
//   node scripts/offline-start-1.cjs
//
// The rule (supabase/functions/heartbeat-monitor/index.ts): an event is protected only when it is OPEN and its scheduled
// start has passed on the truck's clock — so protection starts at the LATER of the two. Opened early (auto-open the day
// before; Start at 14:00 for a 19:00 event) → it waits for 19:00. Opened late (Start at 19:05) → it starts at 19:05.
// The edge function runs on Deno and has no tests of its own, so this harness takes its gate and its copy of
// instantOfLocal OUT OF THE SOURCE, transpiles them with the repo's TypeScript, and proves:
//   1. the copy gives the same instant as lib/time-utils.ts instantOfLocal, across zones and DST days;
//   2. the gate, on the scenarios above (and a US zone, and the fallbacks);
//   3. the monitor still selects only OPEN events, reads the zone by lib/truck-time.ts's rule, and calls the gate after
//      the on/off decision and before any write.

const fs = require('fs')
const path = require('path')
const ts = require('typescript')
const REPO = path.resolve(__dirname, '..')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
let fails = 0
const check = (ok, label, detail) => { console.log(`  ${ok ? '✓' : '🔴'} ${label}${!ok && detail ? `\n      ${detail}` : ''}`); if (!ok) fails++ }
const load = (code, names) => { const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText; const m = { exports: {} }; new Function('module', 'exports', js + `\nmodule.exports = { ${names.join(', ')} }`)(m, m.exports); return m.exports }

const MON = read('supabase/functions/heartbeat-monitor/index.ts')
const cut = (from, to) => { const i = MON.indexOf(from), j = MON.indexOf(to, i); if (i < 0 || j < 0) throw new Error(`marker missing: ${from}`); return MON.slice(i, j) }
const E = load(cut('function instantOfLocal(', 'Deno.serve(').replace('export function protectionStarted', 'function protectionStarted'), ['instantOfLocal', 'validZone', 'protectionStarted'])
const TU = read('lib/time-utils.ts')
const libSrc = TU.slice(TU.indexOf('const partsIn = '), TU.indexOf('\n}\n', TU.indexOf('const partsIn = ')) + 3) + '\n' + TU.slice(TU.indexOf('export function instantOfLocal'), TU.indexOf('\n}\n', TU.indexOf('export function instantOfLocal')) + 3)
const L = load(libSrc.replace(/^export /gm, ''), ['instantOfLocal'])

console.log('\n── 1 · THE COPY OF instantOfLocal EQUALS lib/time-utils.ts ───────────────────────────────')
const ZONES = ['Europe/London', 'Europe/Paris', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland', 'Asia/Kolkata']
const DATES = ['2026-01-15', '2026-03-29', '2026-03-08', '2026-06-21', '2026-10-25', '2026-11-01', '2026-11-13', '2026-12-31']
const TIMES = ['00:00', '00:30:00', '07:45', '12:00:00', '17:00', '19:00:00', '23:55']
let n = 0, bad = []
for (const z of ZONES) for (const d of DATES) for (const t of TIMES) { n++; const a = E.instantOfLocal(d, t, z), b = L.instantOfLocal(d, t, z); if (a !== b) bad.push(`${z} ${d} ${t}: ${a} vs ${b}`) }
check(bad.length === 0, `${n} zone × date × time cases, incl. DST change days: identical`, bad.slice(0, 3).join(' | '))

console.log('\n── 2 · THE GATE ─────────────────────────────────────────────────────────────────────────')
const ev = { event_date: '2026-11-13', start_time: '19:00:00' }
const at = iso => Date.parse(iso)
// London, 13 Nov = GMT (UTC+0): 19:00 local = 19:00Z
check(!E.protectionStarted(ev, 'Europe/London', at('2026-11-12T18:00:00Z')), 'opened the day before (auto-open) → NOT protected the day before')
check(!E.protectionStarted(ev, 'Europe/London', at('2026-11-13T14:00:00Z')), 'opened at 14:00 on the day → NOT protected at 14:00')
check(!E.protectionStarted(ev, 'Europe/London', at('2026-11-13T18:59:59Z')), '…nor one second before 19:00')
check(E.protectionStarted(ev, 'Europe/London', at('2026-11-13T19:00:00Z')), 'protected from 19:00, the scheduled start')
check(E.protectionStarted(ev, 'Europe/London', at('2026-11-13T19:05:00Z')), 'opened late at 19:05 → protected at 19:05 (the monitor only sees it once it is open)')
// New York, 13 Nov = EST (UTC−5): 19:00 local = 00:00Z on the 14th — the truck's clock, never UTC's
check(!E.protectionStarted(ev, 'America/New_York', at('2026-11-13T23:30:00Z')), 'New York: 23:30 UTC is 18:30 local → not yet')
check(E.protectionStarted(ev, 'America/New_York', at('2026-11-14T00:00:00Z')), 'New York: 00:00 UTC on the 14th is 19:00 local → protected')
// Summer time: London 1 July = BST (UTC+1): 19:00 local = 18:00Z
check(!E.protectionStarted({ event_date: '2026-07-01', start_time: '19:00' }, 'Europe/London', at('2026-07-01T17:59:00Z')) && E.protectionStarted({ event_date: '2026-07-01', start_time: '19:00' }, 'Europe/London', at('2026-07-01T18:00:00Z')), 'London in summer time: 18:00 UTC is 19:00 local')
// An overnight event's start is on its own date (only its END runs into the next day)
check(!E.protectionStarted({ event_date: '2026-11-13', start_time: '20:00:00' }, 'Europe/London', at('2026-11-13T19:59:00Z')) && E.protectionStarted({ event_date: '2026-11-13', start_time: '20:00:00' }, 'Europe/London', at('2026-11-14T00:15:00Z')), 'an event 20:00 → 00:30: protected from 20:00, still at 00:15')
// Fallbacks: no readable zone or start → the old behaviour (protected while open), never unprotected
check(E.protectionStarted(ev, null, at('2026-11-12T18:00:00Z')), 'no readable zone → protected while open (the old rule), not left unprotected')
check(E.protectionStarted({ event_date: '2026-11-13', start_time: null }, 'Europe/London', at('2026-11-12T18:00:00Z')), 'no start time → protected while open (the old rule)')
check(E.validZone('Europe/London') && !E.validZone('Mars/Base') && !E.validZone(''), 'validZone accepts a real zone, refuses a made-up or empty one')

console.log('\n── 3 · THE MONITOR ──────────────────────────────────────────────────────────────────────')
check(/\.eq\('status', 'open'\)/.test(MON), 'still selects only OPEN events (a late-opened event is unprotected until it is opened)')
check(/\.select\('id, name, truck_id, auto_pause_on_offline, offline_protection_mode, last_heartbeat_at'\)/.test(MON), 'the stale-van select reads each van\'s truck_id')
check(/from\('trucks'\)\.select\('timezone, country'\)/.test(MON) && /from\('country_settings'\)\.select\('default_timezone'\)/.test(MON), 'the zone is trucks.timezone, else the country\'s default_timezone (lib/truck-time.ts\'s rule)')
const iEff = MON.indexOf('if (!effective) {'), iGate = MON.indexOf('if (!protectionStarted(ev, await truckZone(van.truck_id), now.getTime()))'), iWrite = MON.indexOf(".from('truck_events')\n        .update(patch)")
check(iEff > 0 && iGate > iEff && iWrite > iGate, 'the gate runs after the on/off decision and before any write', `effective@${iEff} gate@${iGate} write@${iWrite}`)
check(!/Europe\/London|America\/|Asia\//.test(MON), 'no zone is named for a truck in the monitor')

console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ offline-start-1: protection starts at the later of the event\'s start and its opening, on the truck\'s clock'}`)
process.exit(fails ? 1 : 0)
