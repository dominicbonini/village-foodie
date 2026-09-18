#!/usr/bin/env node
// scripts/printing-failure-split.cjs — LIVE dev run: the wired transport against scripts/dev-virtual-printer.cjs.
//   node scripts/printing-failure-split.cjs
// The real lib/printing/netTransport.ts is driven end to end; the only stand-in is the native plugin, replaced
// by a Node TCP implementation of EXACTLY the Java/Swift contract (connect → write → close, bytesWritten exact).
// 🔴 FAILURE MODE: a failure AFTER a byte reported as ok:false. The watcher would read 'failed' — CERTAIN
// nothing printed — and retry, and a ticket that DID come out would print twice with no banner.
const net = require('net'); const path = require('path'); const fs = require('fs'); const os = require('os'); const { spawn } = require('child_process')
const { compile, REPO } = require('./_slot-interval-compile.cjs'); const { installMocks } = require('./_printing-mocks.cjs')
const c = compile(REPO, ['lib/printing/netTransport.ts', 'lib/printing/transport.ts', 'lib/printing/netAddress.ts', 'lib/printing/ticket.ts'], 'fsplit')
const g = installMocks(c.out, { native: true })
const NET = c.req('lib/printing/netTransport.js'), TK = c.req('lib/printing/ticket.js')
let fails = 0; const check = (ok, l) => { console.log(`  ${ok ? '✓' : '🔴'} ${l}`); if (!ok) fails++ }
// ── The plugin stand-in: the same contract as NetPrinterPlugin.java / .swift ──────────────────────────
function tcp(host, port, bytes, connectMs, writeMs) {
  return new Promise((resolve) => {
    let written = 0, done = false, connected = false
    const fin = (r) => { if (!done) { done = true; try { s.destroy() } catch {} ; resolve(r) } }
    const s = net.createConnection({ host, port })
    s.setTimeout(connectMs)
    s.on('connect', () => { connected = true; s.setTimeout(writeMs)
      if (!bytes || !bytes.length) { s.end(); return fin({ ok: true, bytesWritten: 0 }) }
      // 4096-byte chunks, exactly like NetPrinterPlugin.java's loop: a chunk counts once write() returns.
      let off = 0
      const next = () => {
        if (done) return
        if (off >= bytes.length) { s.end(); return fin({ ok: true, bytesWritten: written }) }
        const chunk = Buffer.from(bytes.subarray(off, off + 4096)); off += chunk.length
        s.write(chunk, (err) => { if (err || done) return; written += chunk.length; next() })
      }
      next()
    })
    s.on('error', (e) => fin({ ok: false, bytesWritten: written, error: e.message, errorCode: e.code === 'ECONNREFUSED' ? 'refused' : e.code === 'ECONNRESET' || e.code === 'EPIPE' ? 'reset' : 'unknown' }))
    s.on('timeout', () => fin({ ok: false, bytesWritten: written, error: connected ? 'write timed out' : 'connect timed out', errorCode: 'timeout' }))
  })
}
g.netProbe = (o) => tcp(o.host, o.port, new Uint8Array([0x1b, 0x40]), o.connectTimeoutMs, o.writeTimeoutMs)   // the real probe writes ESC @
g.netSend = (o) => tcp(o.host, o.port, Buffer.from(o.base64, 'base64'), o.connectTimeoutMs, o.writeTimeoutMs)
// A write "succeeds" when the bytes are HANDED TO THE KERNEL — OutputStream.write, NWConnection.send and
// Node's callback all mean that. So a printer that swallows a whole 600-byte ticket into its buffer and
// then dies is INVISIBLE to the sender (recorded below, not asserted); a printer that dies while a larger
// stream is still flowing is seen as a failure AFTER bytes — the 'unknown' case the watcher must banner.
function startPrinter(args, file) { return new Promise((res) => { const p = spawn('node', [path.join(REPO, 'scripts/dev-virtual-printer.cjs'), '--port', '9109', '--out', file, ...args], { stdio: ['ignore', 'pipe', 'inherit'] }); let buf = ''; p.stdout.on('data', d => { buf += d; if (/virtual printer on/i.test(buf)) res(p) }); p.stdout.on('data', d => process.stdout.write('    [printer] ' + String(d).trim() + '\n')) }) }
const kill = (p) => new Promise(r => { p.on('exit', r); p.kill('SIGINT') })
// ~8 MB: cannot fit in the loopback send+receive buffers even on a loaded machine, so the stream MUST
// stall until the printer reads — and the printer's RST then fails a write mid-stream. (~1 MB was
// observed to slip through entirely under load: the sender saw success before the RST arrived.)
const big = (t) => Buffer.concat(Array(Math.ceil(8 * 1024 * 1024 / t.length)).fill(Buffer.from(t)))
const ticket = TK.renderTicket({ id: '42', customer_name: 'Live run', collection_time: '18:30', items: [{ name: 'Margherita', quantity: 2, unit_price: 9 }], total: 18, truck_name: 'Test Kitchen', printedLabel: '18:20' }, { paper_width: 80 })
// Model of usePrinting.onPrint's mapping (lib/printing/usePrinting.ts): ok→printed, ok:false→failed, throw→unknown.
async function onPrint(t, bytes) { try { const r = await t.sendBytes(bytes); return r.ok ? { outcome: 'printed' } : { outcome: 'failed', error: r.error } } catch (e) { return { outcome: 'unknown', error: e.message } } }
;(async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-'))
  console.log('── BROKEN VARIANT: MUST report FAILURE ──────────────────────────────────────────────────')
  {
    // V1: a transport that maps EVERY plugin failure to ok:false, even after bytes were written.
    const v1 = { ...NET.createNetTransport(), async sendBytes(b) { const r = await g.netSend({ host: '127.0.0.1', port: 9109, base64: Buffer.from(b).toString('base64'), connectTimeoutMs: 2000, writeTimeoutMs: 2000 }); return r.ok ? { ok: true } : { ok: false, error: r.error } } }
    const p = await startPrinter(['--drop-after', '64'], path.join(outDir, 'v1.bin'))
    const r = await onPrint(v1, big(ticket)); await kill(p)
    console.log(`  ${r.outcome === 'failed' ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 drop-after-64 reported '${r.outcome}' — a partial print marked CERTAIN-not-printed`)
    if (r.outcome !== 'failed') process.exit(1)
  }
  const t = NET.createNetTransport()
  console.log('\n── 1. --refuse: nothing listening / connection refused → failed ─────────────────────────')
  {
    const p = await startPrinter(['--refuse'], path.join(outDir, 'refuse.bin'))
    const c1 = await t.connect('127.0.0.1:9109'); check(!c1.ok, `connect → ok:false "${c1.error}"`)
    check(!g.prefs.has('hg_net_printer_address'), 'no address stored')
    await kill(p)
    const r = await onPrint({ sendBytes: (b) => { g.prefs.set('hg_net_printer_address', '127.0.0.1:9109'); return t.sendBytes(b) } }, ticket)
    check(r.outcome === 'failed', `sendBytes with nothing listening → outcome '${r.outcome}' (${r.error})`)
  }
  console.log('\n── 2. healthy printer → printed, bytes on disk identical to renderTicket ────────────────')
  {
    const file = path.join(outDir, 'ok.bin'); const p = await startPrinter([], file)
    const c1 = await t.connect('127.0.0.1:9109'); check(c1.ok, 'connect (probe ESC @) → ok')
    const r = await onPrint(t, ticket); check(r.outcome === 'printed', `sendBytes → outcome '${r.outcome}'`)
    await new Promise(r => setTimeout(r, 150)); await kill(p)
    const files = fs.readdirSync(file).sort().map(f => fs.readFileSync(path.join(file, f)))   // one file per connection
    check(files.length === 2 && files[0].equals(Buffer.from([0x1b, 0x40])), `connection 1 (the probe) received exactly ESC @ (${files.length} connections)`)
    check(files.length === 2 && files[1].equals(Buffer.from(ticket)), `connection 2 received the ticket bytes exactly (${ticket.length} bytes)`)
    const s = await t.status(); check(s.connected, 'status → connected after a successful send')
  }
  console.log('\n── 3. --drop-after 64: printer dies mid-stream → THROW → unknown (banner) ──────────────')
  {
    const file = path.join(outDir, 'drop.bin'); const p = await startPrinter(['--drop-after', '64'], file)
    const r = await onPrint(t, big(ticket)); check(r.outcome === 'unknown', `~8 MB stream, RST after 64 bytes → outcome '${r.outcome}' — "${r.error}"`)
    await kill(p)
    const s = await t.status(); check(!s.connected, `status no longer connected: "${s.detail}"`)
    const p2 = await startPrinter(['--drop-after', '64'], path.join(outDir, 'drop-small.bin'))
    const r2 = await onPrint(t, ticket); await kill(p2)
    console.log(`  ℹ a single ${ticket.length}-byte ticket, RST after 64 bytes → outcome '${r2.outcome}' — the whole ticket was already in the kernel buffer, so the sender cannot see the drop. This is TCP, not the transport; the same is true of the hardware.`)
  }
console.log('\n── 4. a black-hole host: no route / connect timeout BEFORE any byte → ok:false ──────────')
  {
    // 10.255.255.1 is never on this LAN: the probe either times out (5000 ms) or gets EHOSTUNREACH at
    // once. Either way nothing was written, so connect() is ok:false and nothing is stored or changed.
    const before = global.__hg.prefs.get('hg_net_printer_address')
    const t0 = Date.now(); const r = await t.connect('10.255.255.1')
    check(r.ok === false, `connect('10.255.255.1') → ok:false after ${Date.now() - t0} ms — "${r.error}"`)
    check(global.__hg.prefs.get('hg_net_printer_address') === before, 'the stored address is untouched by a failed connect')
  }
console.log('\n── 5. the split, stated as the rule the code implements ─────────────────────────────────')
  {
    for (const [bw, expect] of [[0, 'failed'], [1, 'unknown'], [500, 'unknown']]) {
      g.netSend = async () => ({ ok: false, bytesWritten: bw, error: 'reset', errorCode: 'reset' })
      const r = await onPrint(t, ticket); check(r.outcome === expect, `bytesWritten=${bw} → '${r.outcome}'`)
    }
    g.netSend = async () => { throw new Error('bridge exploded') }
    const r = await onPrint(t, ticket); check(r.outcome === 'unknown', `plugin bridge throws → '${r.outcome}' (cannot know → banner)`)
  }
  console.log('\n── 6. unknown is STICKY in the watcher (source-level) ───────────────────────────────────')
  {
    const src = fs.readFileSync(path.join(REPO, 'lib/printing/printWatcher.ts'), 'utf8')
    check(/everUnknown: \(prior\?\.everUnknown \?\? false\) \|\| res\.outcome === 'unknown'/.test(src), "printWatcher: everUnknown = prior || outcome==='unknown' (never cleared by a later failure)")
    check(/mayDuplicate: prior\?\.everUnknown \?\? false/.test(src), 'printWatcher: mayDuplicate handed to the next attempt from everUnknown')
    check((src.match(/printed\.current\.add\(/g) || []).length === 1 && /if \(res\.outcome === 'printed'\) \{\s*\n\s*printed\.current\.add\(o\.order_key\)/.test(src), "the key enters the printed set ONLY on outcome 'printed'")
  }
  console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ failure split proven against the live virtual printer'}`)
  process.exit(fails ? 1 : 0)
})()
