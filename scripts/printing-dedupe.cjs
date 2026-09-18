#!/usr/bin/env node
// scripts/printing-dedupe.cjs — a ticket prints once per device; the test ticket never enters dedupe;
// two wired devices on one van print ONCE because the guard lets only the holder run.
//   node scripts/printing-dedupe.cjs
// 🔴 FAILURE MODE: two devices both wired to the same printer each printing every ticket — the kitchen
// gets everything twice and nobody is told.
const fs = require('fs'); const path = require('path')
const { compile, REPO } = require('./_slot-interval-compile.cjs'); const { installMocks } = require('./_printing-mocks.cjs')
const c = compile(REPO, ['lib/printing/printWatcher.ts', 'lib/printing/networkGuard.ts', 'lib/printing/testTicket.ts', 'lib/printing/ticket.ts'], 'dedupe')
installMocks(c.out, { native: true })
const W = c.req('lib/printing/printWatcher.js'), G = c.req('lib/printing/networkGuard.js')
let fails = 0; const check = (ok, l) => { console.log(`  ${ok ? '✓' : '🔴'} ${l}`); if (!ok) fails++ }
const orders = [{ order_key: 'A', status: 'confirmed', collection_time: '18:00' }, { order_key: 'B', status: 'confirmed', collection_time: '18:05' }]
// A device = its own printed set + its own active flag. One tick: print everything due, add printed keys.
function device(id) { return { id, printed: new Set(), prints: [] } }
function tick(d, active) {
  if (!active) return
  const due = W.selectDueToPrint(orders, { mode: 'on_confirmed', nowMins: 17 * 60, leadMins: 0, printed: d.printed, eligible: ['confirmed'] })
  for (const o of due) { d.prints.push(o.order_key); d.printed.add(o.order_key) }
}
console.log('── BROKEN VARIANT: MUST report FAILURE ──────────────────────────────────────────────────')
{
  const d1 = device('dev-1'), d2 = device('dev-2')
  tick(d1, true); tick(d2, true)     // V1: guard bypassed — both active
  const total = d1.prints.length + d2.prints.length
  console.log(`  ${total === 4 ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 both devices active → ${total} prints for 2 orders`)
  if (total !== 4) process.exit(1)
}
console.log('\n── one device, three ticks: each order once ───────────────────────────────────────────')
{ const d = device('dev-1'); tick(d, true); tick(d, true); tick(d, true); check(d.prints.join('') === 'AB', `prints = ${JSON.stringify(d.prints)}`) }
console.log('\n── two wired devices, one van: the guard lets ONLY the holder be active ───────────────')
{
  const d1 = device('dev-1'), d2 = device('dev-2')
  const van = { columnsAvailable: true, vanId: 'v1', address: '192.168.1.50:9100', printingDeviceId: 'dev-1' }
  const dec = (info, id) => G.decideNetPrinting({ deviceId: id, info, cachedHolder: null }).state
  const a1 = dec(van, 'dev-1'), a2 = dec(van, 'dev-2')
  check(a1 === 'ok' && a2 === 'other', `decideNetPrinting → dev-1 '${a1}', dev-2 '${a2}'`)
  tick(d1, a1 === 'ok'); tick(d2, a2 === 'ok')
  check(d1.prints.length === 2 && d2.prints.length === 0, `prints: dev-1 ${d1.prints.length}, dev-2 ${d2.prints.length} — 2 orders, 2 prints`)
  const moved = { ...van, printingDeviceId: 'dev-2' }
  tick(d1, dec(moved, 'dev-1') === 'ok'); tick(d2, dec(moved, 'dev-2') === 'ok')
  check(d1.prints.length === 2 && d2.prints.length === 2, `after "Move printing to this device": dev-2 prints its own copy ONCE (its dedupe set was empty — ${d2.prints.length}); dev-1 stops`)
}
console.log('\n── the test ticket never touches dedupe (source-level) ────────────────────────────────')
{
  const tt = fs.readFileSync(path.join(REPO, 'lib/printing/testTicket.ts'), 'utf8'), card = fs.readFileSync(path.join(REPO, 'components/printing/PrintingSettings.tsx'), 'utf8')
  check(!/import[^\n]*(printWatcher|usePrinting|preferences)/i.test(tt), `testTicket.ts imports nothing from the watcher or its storage (imports: ${(tt.match(/^import[^\n]*/gm) || []).map(x => x.replace(/^import .* from /, '')).join(', ')})`)
  const m = card.match(/renderTestTicket\([^\n]*\n[^\n]*sendBytes\(bytes\)/)
  check(!!m, 'the card sends the test ticket straight to transport.sendBytes — not through onPrint/the watcher')
  check(!/hg_printed_keys|savePrinted|printed\.current/.test(card), 'the card never writes the printed set')
  const T = c.req('lib/printing/testTicket.js'); const b = T.renderTestTicket({ truckName: 'Test Kitchen', paper: 58 })
  check(b instanceof Uint8Array && b[0] === 0x1b && b[1] === 0x40 && Buffer.from(b).includes(Buffer.from('Test ticket')), `renderTestTicket → ${b.length} ESC/POS bytes starting ESC @, containing "Test ticket"`)
}
console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ dedupe + one-device-per-van proven'}`)
process.exit(fails ? 1 : 0)
