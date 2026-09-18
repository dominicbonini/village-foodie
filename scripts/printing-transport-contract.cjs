#!/usr/bin/env node
// scripts/printing-transport-contract.cjs — every backend satisfies PrinterTransport AND its failure rules.
//   node scripts/printing-transport-contract.cjs
// 🔴 FAILURE MODE: a transport that says ok:true from sendBytes without sending, or reports `connected`
// without a live success — the Phase-A stub's lie, which §42 calls the dangerous one.
const { compile, REPO } = require('./_slot-interval-compile.cjs'); const { installMocks } = require('./_printing-mocks.cjs')
const c = compile(REPO, ['lib/printing/transport.ts', 'lib/printing/netTransport.ts', 'lib/printing/bleTransport.ts', 'lib/printing/netAddress.ts'], 'contract')
const g = installMocks(c.out, { native: true })
const T = c.req('lib/printing/transport.js'), NET = c.req('lib/printing/netTransport.js'), BLE = c.req('lib/printing/bleTransport.js')
let fails = 0; const check = (ok, l) => { console.log(`  ${ok ? '✓' : '🔴'} ${l}`); if (!ok) fails++ }
const METHODS = ['availability', 'scan', 'connect', 'disconnect', 'sendBytes', 'status']
const FOUR = ['available', 'unsupported', 'unauthorised', 'off']
;(async () => {
console.log('── BROKEN VARIANT: MUST report FAILURE ──────────────────────────────────────────────────')
{
  const liar = { ...NET.createNetTransport(), async sendBytes() { return { ok: true } } }   // says ok, sends nothing
  g.calls.length = 0
  const r = await liar.sendBytes(new Uint8Array([1, 2, 3]))
  const sent = g.calls.some(x => x[0] === 'send')
  console.log(`  ${r.ok && !sent ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 sendBytes ok:true with no send — the plugin was ${sent ? '' : 'NOT '}called`)
  if (!(r.ok && !sent)) process.exit(1)
}
console.log('\n── SHAPE ───────────────────────────────────────────────────────────────────────────────')
const stub = T.createStubTransport(() => {}), net = NET.createNetTransport(), ble = BLE.createBleTransport()
for (const [name, t] of [['stub', stub], ['net', net], ['ble', ble]]) {
  check(METHODS.every(m => typeof t[m] === 'function'), `${name}: implements ${METHODS.join('/')}`)
  const a = await t.availability(); check(FOUR.includes(a), `${name}: availability() = '${a}' ∈ {${FOUR.join(',')}}`)
  const s = await t.status(); check(s.connected === false, `${name}: status() before any success → connected=false ("${s.detail}")`)
}
check(typeof net.reconnect === 'function' && typeof ble.reconnect === 'function', 'net and ble expose reconnect(); the stub need not')
console.log('\n── NET: connect to an unreachable target ───────────────────────────────────────────────')
{
  g.netProbe = async () => ({ ok: false, error: 'refused', errorCode: 'refused' })
  const r = await net.connect('192.168.1.50'); check(r.ok === false && /Can't reach the printer at 192.168.1.50:9100/.test(r.error), `connect('192.168.1.50') → ok:false "${r.error}"`)
  check(!g.prefs.has('hg_net_printer_address'), 'nothing stored after a failed probe')
  const s = await net.status(); check(s.connected === false, 'status stays not connected')
  const bad = await net.connect('not an address!'); check(bad.ok === false && /192\.168\.1\.50/.test(bad.error), `invalid address → "${bad.error}"`)
  const r2 = await net.sendBytes(new Uint8Array([0x1b, 0x40])); check(r2.ok === false && r2.error === 'No printer connected', 'sendBytes with no address → ok:false "No printer connected"')
}
console.log('\n── NET: a successful probe, then status, then a failed send ────────────────────────────')
{
  g.netProbe = async (o) => ({ ok: true }); g.calls.length = 0
  const r = await net.connect('192.168.1.50:9100'); check(r.ok, 'probe ok → connect ok')
  check(g.calls.some(x => x[0] === 'probe' && x[1].host === '192.168.1.50' && x[1].port === 9100 && x[1].connectTimeoutMs === 5000 && x[1].writeTimeoutMs === 10000), 'probe called with host, port 9100, connect 5000 ms, write 10000 ms')
  check(g.prefs.get('hg_net_printer_address') === '192.168.1.50:9100', 'address stored ONLY after success, normalised')
  let s = await net.status(); check(s.connected === true && s.printerName === '192.168.1.50:9100', `status → connected, "${s.printerName}"`)
  g.netSend = async () => ({ ok: false, bytesWritten: 0, error: 'refused', errorCode: 'refused' })
  const r2 = await net.sendBytes(new Uint8Array([1])); check(r2.ok === false, 'a refused send → ok:false')
  s = await net.status(); check(s.connected === false && /Can't reach the printer at 192.168.1.50:9100/.test(s.detail), `…and status is no longer connected: "${s.detail}"`)
  await net.disconnect(); check(!g.prefs.has('hg_net_printer_address'), 'disconnect clears the stored address')
}
console.log('\n── NET: iOS Local Network refusal → availability unauthorised ──────────────────────────')
{
  g.netProbe = async () => ({ ok: false, error: 'Network is down', errorCode: 'permission' })
  const r = await net.connect('192.168.1.50'); check(!r.ok && /Turn on Local Network for HatchGrab in Settings/.test(r.error), `permission → "${r.error}"`)
  check((await net.availability()) === 'unauthorised', "availability() → 'unauthorised' after a permission refusal")
}
console.log('\n── WEB: every backend refuses ──────────────────────────────────────────────────────────')
{
  g.native = false
  check((await net.availability()) === 'unsupported' && (await stub.availability()) === 'unsupported', 'net + stub → unsupported on web')
  const r = await net.sendBytes(new Uint8Array([1])); check(r.ok === false, 'net.sendBytes on web → ok:false')
  g.native = true
}
console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ transport contract proven'}`)
process.exit(fails ? 1 : 0)
})()
