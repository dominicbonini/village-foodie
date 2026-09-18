#!/usr/bin/env node
// scripts/dev-virtual-printer.cjs — a kitchen printer that isn't one.
//
//   node scripts/dev-virtual-printer.cjs [--host 127.0.0.1] [--port 9100] [--out /tmp/hg-printer]
//                                        [--refuse] [--drop-after N] [--delay MS]
//
// A plain TCP listener (no third-party packages). Every connection's bytes are written to a file and a
// one-line summary is printed: length, whether it starts with ESC @ (0x1B 0x40), whether it contains a
// cut (GS V — 0x1D 0x56). The three options exist to exercise the transport's FAILURE paths:
//   --refuse         refuse every connection      → nothing written  → the transport must report 'failed'
//   --drop-after N   close after N bytes arrive   → a partial write   → the transport must report 'unknown'
//   --delay MS       wait MS before reading       → exercises the write timeout
//
// --host BINDS THE LISTENER, and the default stays 127.0.0.1 — loopback only, invisible to the network,
// which is what every harness wants. Pass `--host 0.0.0.0` to accept from the LAN so an iPad or an
// Android tablet on the same Wi-Fi can print to this Mac and you can test wired printing WITH NO
// PRINTER. macOS will ask to allow incoming connections the first time; you must allow it.
// ⚠️ 0.0.0.0 means any device on that Wi-Fi can connect. Use it on a network you trust, and stop the
// process (Ctrl-C) when you are done. See docs/wired-printing-followup-report.md for the full steps.
const net = require('net'); const fs = require('fs'); const path = require('path')
const args = process.argv.slice(2)
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? (args[i + 1] ?? dflt) : dflt }
const HOST = opt('--host', '127.0.0.1')
const PORT = parseInt(opt('--port', '9100'), 10)
const OUT = opt('--out', path.join(require('os').tmpdir(), 'hg-virtual-printer'))
const REFUSE = args.includes('--refuse')
const DROP_AFTER = args.includes('--drop-after') ? parseInt(opt('--drop-after', '0'), 10) : null
const DELAY = parseInt(opt('--delay', '0'), 10)
fs.mkdirSync(OUT, { recursive: true })
let n = 0
const server = net.createServer(sock => {
  const id = ++n; const chunks = []; let total = 0
  const handle = (buf) => {
    chunks.push(buf); total += buf.length
    // resetAndDestroy = TCP RST, so the sender's NEXT write fails (a plain FIN can leave a small ticket
    // sitting happily in the kernel buffer with no error ever reported — see printing-failure-split.cjs).
    if (DROP_AFTER !== null && total >= DROP_AFTER) { (sock.resetAndDestroy ? sock.resetAndDestroy() : sock.destroy()); done('DROPPED after ' + total + ' bytes') }
  }
  sock.on('data', buf => { if (DELAY > 0) setTimeout(() => handle(buf), DELAY); else handle(buf) })
  let finished = false
  const done = (how) => {
    if (finished) return; finished = true
    const data = Buffer.concat(chunks)
    const file = path.join(OUT, `ticket-${Date.now()}-${id}.bin`); fs.writeFileSync(file, data)
    const escAt = data.length >= 2 && data[0] === 0x1B && data[1] === 0x40
    const cut = data.includes(Buffer.from([0x1D, 0x56]))
    console.log(`#${id} ${how}: ${data.length} bytes  ESC@=${escAt ? 'yes' : 'no'}  cut=${cut ? 'yes' : 'no'}  → ${file}`)
  }
  sock.on('end', () => done('received'))
  sock.on('close', () => done('closed'))
  sock.on('error', () => done('error'))
})
if (REFUSE) {
  // Refuse = DO NOT LISTEN. The port is closed, every connect is ECONNREFUSED, and nothing can ever be
  // written — the one failure that is certain before a byte. (Accept-then-destroy was tried first and is
  // a race: a 2-byte probe can land in the kernel before the RST arrives and look like a success.)
  console.log(`virtual printer on ${HOST}:${PORT}  REFUSING (port closed → ECONNREFUSED)`)
  setInterval(() => {}, 1 << 30)
} else
server.listen(PORT, HOST, () => console.log(`virtual printer on ${HOST}:${PORT}  out=${OUT}  ${REFUSE ? 'REFUSING' : ''}${DROP_AFTER !== null ? ' DROP-AFTER ' + DROP_AFTER : ''}${DELAY ? ' DELAY ' + DELAY + 'ms' : ''}`))
process.on('SIGTERM', () => { server.close(); process.exit(0) })
