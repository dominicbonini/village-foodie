#!/usr/bin/env node
// scripts/printing-network-guard.cjs — one printing device per van: decideNetPrinting's every branch, the
// route's validation, the probed read of the two new columns, and the named-select rule.
//   node scripts/printing-network-guard.cjs
// 🔴 FAILURE MODE: a select that another surface depends on naming truck_vans.network_printer_address
// before the migration is applied — that select fails on production TODAY and takes its surface with it.
//
// 🔴 SECOND FAILURE MODE (17 September 2026): a CLAIM ATTEMPTED ON A PIN-PROTECTED TRUCK. /api/printing
// authenticates with the dashboard token AND the PIN when the truck has one; the card has no PIN (the
// dashboard page keeps it in React state and stores it nowhere), so every claim would 401. The old
// lib/printing/dashboardPin.ts GUESSED at four storage keys and always returned undefined, which turned
// a knowable "not supported yet" into "Can't check which device is printing right now." The PIN
// requirement is now OBSERVED from the route's own 401 + requiresPin, and nothing is ever claimed.
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process')
const { compile, REPO } = require('./_slot-interval-compile.cjs'); const { installMocks } = require('./_printing-mocks.cjs')
const c = compile(REPO, ['lib/printing/networkGuard.ts', 'lib/printing/netAddress.ts'], 'guard')
installMocks(c.out, { native: true })
const G = c.req('lib/printing/networkGuard.js'), A = c.req('lib/printing/netAddress.js')
let fails = 0; const check = (ok, l) => { console.log(`  ${ok ? '✓' : '🔴'} ${l}`); if (!ok) fails++ }
const NEW_COLS = /network_printer_address|network_print_device_id/
/** Every .select('…') string in app/ lib/ components/ that names a new column — must be the route's probe only. */
function namedSelects() {
  const files = execFileSync('grep', ['-rl', '--include=*', 'network_printer_address\\|network_print_device_id', path.join(REPO, 'app'), path.join(REPO, 'lib'), path.join(REPO, 'components')]).toString().trim().split('\n').filter(Boolean)
  const hits = []
  for (const f of files) { const src = fs.readFileSync(f, 'utf8'); for (const m of src.matchAll(/\.select\(\s*(['"`])([\s\S]*?)\1/g)) if (NEW_COLS.test(m[2])) hits.push(path.relative(REPO, f)) }
  return hits
}
console.log('── BROKEN VARIANT: MUST report FAILURE ──────────────────────────────────────────────────')
{
  // V1: the two columns added to a select another surface depends on (get_vans in app/api/manage/route.ts).
  const v1 = "supabase.from('truck_vans').select('id, name, network_printer_address, network_print_device_id')"
  const hit = [...v1.matchAll(/\.select\(\s*(['"`])([\s\S]*?)\1/g)].some(m => NEW_COLS.test(m[2]))
  console.log(`  ${hit ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 a shared select naming the new columns is caught`)
  if (!hit) process.exit(1)
}
console.log('\n── decideNetPrinting: every branch ──────────────────────────────────────────────────────')
{
  const base = { columnsAvailable: true, vanId: 'v1', vanName: 'Van 1', truckName: 'T', address: '192.168.1.50:9100', printingDeviceId: null }
  const d = (info, cachedHolder = null) => G.decideNetPrinting({ deviceId: 'me', info, cachedHolder })
  let r = d({ ...base, printingDeviceId: null }); check(r.state === 'ok' && r.shouldClaim === true, "unheld → 'ok' + shouldClaim (auto-claim)")
  r = d({ ...base, printingDeviceId: 'me' }); check(r.state === 'ok' && !r.shouldClaim, "held by this device → 'ok', no claim")
  r = d({ ...base, printingDeviceId: 'them' }); check(r.state === 'other' && !r.shouldClaim, "held by another device → 'other' (never a silent take-over)")
  r = d({ ...base, vanId: null }); check(r.state === 'unbound', "device not bound to a van → 'unbound'")
  check(G.NET_GUARD_COPY.other === 'Printing is on another device. Move printing to this device?' && G.NET_GUARD_COPY.unknown === "Can't check which device is printing right now.", 'the two required sentences, verbatim')
  check(G.NET_GUARD_MOVE_BUTTON === 'Move printing to this device', 'the button label')
}
console.log('\n── cached claim: unreadable → the LAST KNOWN answer, never a new one ───────────────────')
{
  const d = (info, cachedHolder) => G.decideNetPrinting({ deviceId: 'me', info, cachedHolder })
  check(d(null, null).state === 'unknown', "route unreachable, no cache → 'unknown' (printing stays off)")
  check(d(null, 'me').state === 'ok' && d(null, 'me').shouldClaim === false, "route unreachable, cache says THIS device held it → 'ok' — keeps printing, claims nothing")
  check(d(null, 'them').state === 'unknown', "route unreachable, cache says another device → 'unknown'")
  const cols = { columnsAvailable: false, vanId: 'v1', vanName: null, truckName: null, address: null, printingDeviceId: null }
  check(d(cols, null).state === 'unknown' && d(cols, 'me').state === 'ok', "columns unreadable (PGRST204/42703) → same rule: cached 'me' → ok, else unknown")
  ;(async () => { const g = global.__hg; g.prefs.clear(); await G.writeCachedClaim('v1', 'me'); check((await G.readCachedClaim('v1')) === 'me' && g.prefs.has('hg_net_claim_v1'), 'cache stored under hg_net_claim_<vanId>'); await G.writeCachedClaim('v1', null); check((await G.readCachedClaim('v1')) === null, 'release clears it') })()
}
console.log('\n── parseNetAddress ─────────────────────────────────────────────────────────────────────')
{
  const ok = (s, h, p) => { const r = A.parseNetAddress(s); check(r && r.host === h && r.port === p, `'${s}' → ${r ? r.normalised : 'null'}`) }
  ok('192.168.1.50', '192.168.1.50', 9100); ok(' 192.168.1.50:9100 ', '192.168.1.50', 9100); ok('printer.local:9101', 'printer.local', 9101)
  for (const bad of ['', 'not an address!', '192.168.1.50:0', '192.168.1.50:70000', 'http://192.168.1.50', '192.168.1.50 9100']) check(A.parseNetAddress(bad) === null, `'${bad}' → null`)
}
console.log('\n── the route (source-level): validation, auth split, probed read ───────────────────────')
{
  const r = fs.readFileSync(path.join(REPO, 'app/api/printing/route.ts'), 'utf8')
  check(/status: 503/.test(r) && /status: 401/.test(r), 'verifyToken keeps the 503 (cannot check) / 401 (refused) split')
  check(/action !== 'claim' && action !== 'release' && action !== 'set_address'/.test(r), 'POST action allow-list')
  check(/device_id required/.test(r), 'device_id required on GET and POST')
  check(/parseNetAddress\(body\.address\)/.test(r) && /NET_ADDRESS_HELP/.test(r), 'set_address validates through parseNetAddress and answers with the help line')
  check(/PGRST204/.test(r) && /42703/.test(r), 'PGRST204 and 42703 logged distinguishably')
  check(/\.eq\('network_print_device_id', deviceId\)/.test(r), 'release only clears the claim if THIS device holds it')
  check(/\.eq\('truck_id', auth\.truck\.id\)/.test(r), 'every write is scoped to the authenticated truck')
  const selects = [...r.matchAll(/\.select\('([^']+)'\)/g)].map(m => m[1]); const probe = selects.filter(x => NEW_COLS.test(x)); check(probe.length === 1 && probe[0] === 'network_printer_address, network_print_device_id', `the ONE select naming the new columns is exactly: ${JSON.stringify(probe)} (all selects: ${JSON.stringify(selects)})`)
}
console.log('\n── named-select rule across app/ lib/ components/ ───────────────────────────────────────')
{
  const hits = namedSelects(); check(hits.length === 1 && hits[0] === 'app/api/printing/route.ts', `selects naming the new columns: ${JSON.stringify(hits)} — the probe only`)
  const forbidden = ['app/dashboard/[token]/page.tsx', 'app/api/manage/route.ts', 'app/api/dashboard/action/route.ts', 'app/api/dashboard/route.ts', 'lib/supabase.ts']
  for (const f of forbidden) check(!NEW_COLS.test(fs.readFileSync(path.join(REPO, f), 'utf8')), `${f} does not mention the new columns`)
}
console.log('\n── the migration (NOT applied): nullable, additive, reloads the cache ───────────────────')
{
  const m = fs.readFileSync(path.join(REPO, 'supabase/migrations/20260919_van_network_printer.sql'), 'utf8')
  check(/add column if not exists network_printer_address text/i.test(m) && /add column if not exists network_print_device_id text/i.test(m), 'two nullable text columns, if not exists')
  check(!/not null|default/i.test(m.replace(/--.*$/gm, '')), 'no NOT NULL, no default')
  check(/notify pgrst, 'reload schema'/.test(m), "ends with notify pgrst, 'reload schema'")
}
// ── THE PIN TRUCK: OBSERVED, NEVER GUESSED, AND NEVER CLAIMED ───────────────────────────────────────
;(async () => {
  console.log('\n── PIN-PROTECTED TRUCK ─────────────────────────────────────────────────────────────────')
  // The route as a PIN truck answers it: GET without a pin → 401 { requiresPin: true }. Every POST is
  // recorded so "no claim was attempted" is a fact about traffic, not about reading the code.
  const posts = []
  const pinTruckFetch = async (url, init) => {
    if (init && init.method === 'POST') { posts.push(JSON.parse(init.body)); return { ok: false, status: 401, json: async () => ({ error: 'Unauthorised', requiresPin: true }) } }
    return { ok: false, status: 401, json: async () => ({ error: 'Unauthorised', requiresPin: true }) }
  }

  console.log('  ── BROKEN VARIANT: MUST report FAILURE ──')
  {
    // V2: the pre-fix behaviour — a PIN truck reads as "route unreachable", so an unheld van looks
    // claimable and the card fires a claim that can only 401.
    global.fetch = pinTruckFetch; posts.length = 0
    const guessedPin = undefined                       // what readDashboardPin() always returned
    const info = guessedPin === undefined ? null : null // 401 swallowed as null — the old fetchNetPrinting
    const d = G.decideNetPrinting({ deviceId: 'me', info: info ?? { columnsAvailable: true, vanId: 'v1', vanName: 'V', truckName: 'T', address: null, printingDeviceId: null }, cachedHolder: null })
    if (d.state === 'ok' && d.shouldClaim) await G.claimNetPrinting('tok', 'me')
    const bad = posts.length > 0
    console.log(`  ${bad ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V2 a PIN truck treated as claimable: ${posts.length} claim POST(s) sent, each of which can only 401`)
    if (!bad) process.exit(1)
  }

  global.fetch = pinTruckFetch; posts.length = 0
  const read = await G.fetchNetPrinting('tok', 'me')
  check(read === 'pin', `fetchNetPrinting on a 401 + requiresPin → ${JSON.stringify(read)}`)
  const d = G.decideNetPrinting({ deviceId: 'me', info: 'pin', cachedHolder: null })
  check(d.state === 'pin' && d.shouldClaim === false, `decideNetPrinting → '${d.state}', shouldClaim ${d.shouldClaim}`)
  check(G.decideNetPrinting({ deviceId: 'me', info: 'pin', cachedHolder: 'me' }).state === 'pin', "a cached claim does NOT override 'pin' — the route would still refuse")
  const st = await G.resolveNetGuard('tok', 'me')
  check(st === 'pin', `resolveNetGuard → '${st}'`)
  check(posts.length === 0, `NO claim was attempted (${posts.length} POSTs)`)
  check(G.NET_GUARD_COPY.pin === "Wired printing isn't available on dashboards with a PIN yet.", `the one sentence: "${G.NET_GUARD_COPY.pin}"`)

  // A 401 WITHOUT requiresPin is a different thing (bad token) and must NOT read as 'pin'.
  global.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: 'Unauthorised', requiresPin: false }) })
  check((await G.fetchNetPrinting('tok', 'me')) === null, "401 without requiresPin → null (not 'pin')")

  console.log('\n── THE GUESSWORK IS GONE ───────────────────────────────────────────────────────────────')
  check(!fs.existsSync(path.join(REPO, 'lib/printing/dashboardPin.ts')), 'lib/printing/dashboardPin.ts no longer exists')
  // An IMPORT or a CALL, not the word: networkGuard.ts names the deleted file in the comment that
  // records why it went, and that history is the point of the comment.
  const refs = execFileSync('bash', ['-c', `grep -rlE "from '[^']*dashboardPin'|readDashboardPin\\(" ${JSON.stringify(path.join(REPO, 'lib'))} ${JSON.stringify(path.join(REPO, 'app'))} ${JSON.stringify(path.join(REPO, 'components'))} || true`]).toString().trim()
  check(refs === '', `nothing imports or calls it any more (${refs || 'no importers, no callers'})`)
  for (const f of ['lib/printing/networkGuard.ts', 'lib/printing/usePrinting.ts', 'components/printing/PrintingSettings.tsx']) {
    const src = fs.readFileSync(path.join(REPO, f), 'utf8')
    check(!/sessionStorage|localStorage/.test(src), `${f} reads no browser storage for a PIN`)
  }
  // The card shows the ONE sentence and nothing else on a PIN truck.
  const card = fs.readFileSync(path.join(REPO, 'components/printing/PrintingSettings.tsx'), 'utf8')
  check(/\{netInfo === 'pin' \? \(\s*\n\s*<p className="text-amber-800">\{NET_GUARD_COPY\.pin\}<\/p>\s*\n\s*\) : \(/.test(card), "the wired branch opens `netInfo === 'pin' ? <the sentence> : (everything else)`")
  check(!/claimNetPrinting\([^)]*readDashboardPin/.test(card) && !/setNetPrinterAddress\([^)]*readDashboardPin/.test(card), 'no claim or address write carries a guessed PIN')

  console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ network guard + named-select rule + PIN refusal proven'}`)
  process.exit(fails ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
