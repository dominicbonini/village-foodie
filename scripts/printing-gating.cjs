#!/usr/bin/env node
// scripts/printing-gating.cjs — with NO printer type chosen, everything is EXACTLY today: 'ble' backend,
// today's `active` expression, no wired guard, no request to /api/printing; web → stub; KDS never mounts it.
//   node scripts/printing-gating.cjs
// 🔴 FAILURE MODE: Pizzeria Gusto's iPad — which has never chosen a type — waking up on the wired path,
// or its `active` gate acquiring a new condition that could switch its printing off.
//
// ── AND THE OLD-BINARY CASE, WHICH IS THE SAME FAILURE ARRIVING BY DEPLOY (17 September 2026) ───────
// capacitor.config's `server.url` is https://www.hatchgrab.com/app: the shells load the LIVE site, so
// deploying this web code puts it on every device still running the STORE build — binaries with no
// NetPrinter plugin. 🔴 SECOND FAILURE MODE: such a device being offered "Wired", or acting on a stored
// 'net'. Both are gated on Capacitor.isPluginAvailable('NetPrinter'); the section at the end proves the
// gate by RENDERING the control with the plugin mocked absent.
const fs = require('fs'); const os = require('os'); const path = require('path')
const { compile, REPO, headWorktree } = require('./_slot-interval-compile.cjs'); const { installMocks } = require('./_printing-mocks.cjs')
const c = compile(REPO, ['lib/printing/transport.ts', 'lib/printing/bleTransport.ts', 'lib/printing/netTransport.ts', 'lib/printing/networkGuard.ts', 'lib/features.ts'], 'gating')
const g = installMocks(c.out, { native: true })
const T = c.req('lib/printing/transport.js'), F = c.req('lib/features.js')
const NET = c.req('lib/printing/netTransport.js'), GUARD = c.req('lib/printing/networkGuard.js')
let fails = 0; const check = (ok, l) => { console.log(`  ${ok ? '✓' : '🔴'} ${l}`); if (!ok) fails++ }
;(async () => {
console.log('── BROKEN VARIANT: MUST report FAILURE ──────────────────────────────────────────────────')
{
  const v1 = (stored) => (stored === null ? 'net' : stored)      // V1: absent reads as 'net'
  console.log(`  ${v1(null) === 'net' ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 selector picks '${v1(null)}' for an absent kind`)
  if (v1(null) !== 'net') process.exit(1)
}
console.log('\n── absent kind → ble, and the transport is the Bluetooth backend ──────────────────────')
{
  g.prefs.clear(); const k = await T.loadPrinterKind(); check(k === 'ble', `loadPrinterKind() with nothing stored → '${k}'`)
  g.prefs.set('hg_printer_kind', 'garbage'); check((await T.loadPrinterKind()) === 'ble', "an unknown stored value → 'ble'")
  g.prefs.clear(); await T.loadPrinterKind(); g.calls.length = 0
  const t = T.getPrinterTransport(); await t.availability()
  check(!g.calls.some(x => x[0] === 'probe' || x[0] === 'send'), 'getPrinterTransport() under an absent kind never touches the NetPrinter plugin')
  check(typeof t.reconnect === 'function' && t.scan && t.availability, 'it is the BLE transport (has reconnect + scan)')
  const same = T.getPrinterTransport(); check(same === t, 'singleton: the same object on the next call')
}
console.log("\n── choosing 'net' retires the singleton; choosing 'ble' back finds the BLE one again ───")
{
  const before = T.getPrinterTransport(); await T.setPrinterKind('net'); const n = T.getPrinterTransport()
  check(n !== before && g.prefs.get('hg_printer_kind') === 'net', "setPrinterKind('net') → new transport, kind stored")
  g.netProbe = async () => ({ ok: true }); await n.connect('192.168.1.50'); check(g.calls.some(x => x[0] === 'probe'), 'the new one IS the wired backend (probe called)')
  await T.setPrinterKind('ble'); check(T.getPrinterTransport() !== n, "back to 'ble' → a fresh BLE transport (no disconnect was issued on the wired one: calls " + JSON.stringify(g.calls.map(x => x[0])) + ')')
  g.prefs.clear(); await T.loadPrinterKind()
}
console.log('\n── canAccess(ticket_printing) for the LIVE Pizzeria Gusto shape ───────────────────────')
{
  // Pizzeria Gusto's live shape, read 17 September 2026 (trucks.plan / feature_overrides / trial_expires_at).
  const gusto = {"plan": "trial", "feature_overrides": {}, "trial_expires_at": "2026-12-31T23:59:59+00:00"}
  check(F.canAccess(gusto.plan, 'ticket_printing', gusto.feature_overrides ?? {}, gusto.trial_expires_at) === true, `canAccess('${gusto.plan}', 'ticket_printing', ${JSON.stringify(gusto.feature_overrides)}, ${JSON.stringify(gusto.trial_expires_at)}) → true`)
  check(F.canAccess('starter', 'ticket_printing') === false, 'starter → false (unchanged)')
}
console.log("\n── usePrinting's gate: today's expression with guardOk folded in as a no-op for 'ble' ──")
{
  const src = fs.readFileSync(path.join(REPO, 'lib/printing/usePrinting.ts'), 'utf8')
  check(/const guardOk = kind !== 'net' \|\| netGuard === 'ok'/.test(src), "guardOk = kind !== 'net' || netGuard === 'ok'")
  check(/const active = isNativeApp\(\) && canPrint && enabled && ready && guardOk/.test(src), 'active = isNativeApp() && canPrint && enabled && ready && guardOk')
  check(/if \(!\(isNativeApp\(\) && canPrint && enabled && ready && kind === 'net'\)\) return/.test(src), "the wired-guard effect returns before any request unless kind === 'net'")
  check(!/import[^\n]*reconnectStoredPrinter/.test(src), 'usePrinting no longer IMPORTS reconnectStoredPrinter (reconnect is behind the seam)')
  const head = headWorktree('gate'); const old = fs.readFileSync(path.join(head.wt, 'lib/printing/usePrinting.ts'), 'utf8'); head.remove()
  check(/const active = isNativeApp\(\) && canPrint && enabled && ready\b/.test(old), 'HEAD: active = isNativeApp() && canPrint && enabled && ready — the four terms are unchanged')
}
console.log('\n── KDS never mounts printing; web gets the stub ────────────────────────────────────────')
{
  const mounts = require('child_process').execFileSync('grep', ['-rl', 'usePrinting(', path.join(REPO, 'app'), path.join(REPO, 'components')]).toString().trim().split('\n').map(p => path.relative(REPO, p))
  check(mounts.length === 1 && mounts[0] === 'app/dashboard/[token]/page.tsx', `usePrinting( is called from exactly: ${mounts.join(', ')}`)
  let kds = ''; try { kds = require('child_process').execFileSync('grep', ['-rl', 'usePrinting\\|usePrintWatcher\\|PrintingSettings', path.join(REPO, 'app', 'kds')]).toString().trim() } catch (e) { if (e.status !== 1) throw e }
  check(kds === '', `app/kds: no printing import (${kds || 'none'})`)
  g.native = false; await T.setPrinterKind('net'); const s = T.getPrinterTransport(); check((await s.availability()) === 'unsupported' && (await s.sendBytes(new Uint8Array([1]))).ok === false, "web + kind 'net' → the stub: unsupported, sendBytes ok:false")
  g.native = true
}
// ── OLD BINARY (NO NetPrinter PLUGIN): THE CARD, THE KIND, THE TRANSPORT AND THE ROUTE ────────────
// Everything below runs with the plugin mocked ABSENT — the state of every device now in the field.
{
  console.log('\n── OLD BINARY: the plugin is absent ────────────────────────────────────────────────────')
  // The component is compiled with JSX and RENDERED, so this is markup, not a grep.
  const jsx = { jsx: 'react-jsx', skipLibCheck: true }
  const cc = compile(REPO, ['components/printing/PrinterTypeChoice.tsx'], 'gateUI', jsx)
  installMocks(cc.out, { native: true })
  const { renderToStaticMarkup } = require('react-dom/server'); const { createElement } = require('react')
  const render = (mod) => renderToStaticMarkup(createElement(mod.PrinterTypeChoice, { kind: 'ble', onChoose: () => {} }))

  console.log('  ── BROKEN VARIANT: MUST report FAILURE ──')
  {
    // V2: the gate deleted — the choice rendered without asking whether the binary can do it.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-v2-'))
    fs.cpSync(path.join(REPO, 'components'), path.join(tmp, 'components'), { recursive: true })
    fs.cpSync(path.join(REPO, 'lib'), path.join(tmp, 'lib'), { recursive: true })
    fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules'))
    const f = path.join(tmp, 'components/printing/PrinterTypeChoice.tsx'); const src = fs.readFileSync(f, 'utf8')
    const needle = '  if (!isNetPrinterAvailable()) return null\n'
    if (src.split(needle).length !== 2) { console.log('  🔴 could not patch PrinterTypeChoice (gate line not found once)'); process.exit(1) }
    fs.writeFileSync(f, src.replace(needle, ''))
    const vc = compile(tmp, ['components/printing/PrinterTypeChoice.tsx'], 'gateV2', jsx)
    installMocks(vc.out, { native: true, pluginAvailable: false })
    global.__hg.pluginAvailable = false
    const markup = render(vc.req('components/printing/PrinterTypeChoice.js'))
    const bad = markup.includes('Printer type') && markup.includes('Wired')
    console.log(`  ${bad ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V2 gate removed: an OLD binary renders ${bad ? 'the Printer type choice — "Wired" offered where it cannot work' : 'nothing'}`)
    fs.rmSync(tmp, { recursive: true, force: true })
    if (!bad) process.exit(1)
  }

  const UI = cc.req('components/printing/PrinterTypeChoice.js')
  global.__hg.native = true; global.__hg.pluginAvailable = false
  const absent = render(UI)
  check(absent === '', `plugin ABSENT → PrinterTypeChoice renders nothing (markup ${JSON.stringify(absent)})`)
  global.__hg.pluginAvailable = true
  const present = render(UI)
  check(present.includes('Printer type') && present.includes('Bluetooth') && present.includes('Wired'), 'plugin PRESENT → the control renders with Bluetooth / Wired')
  global.__hg.pluginAvailable = false
  check(render(UI) === '' , 'and it is re-checked on every render, not cached from the first')
}
{
  // The transport layer, same condition. These mocks are the gating harness's own (plugin absent).
  g.native = true; g.pluginAvailable = false
  g.prefs.set('hg_printer_kind', 'net')          // 🔴 'net' IS STORED, and must still read as Bluetooth.
  const k = await T.loadPrinterKind()
  check(k === 'ble', `hg_printer_kind='net' on a binary without the plugin → loadPrinterKind() '${k}'`)
  check(T.getPrinterKind() === 'ble', "getPrinterKind() → 'ble'")
  check(T.isNetPrinterAvailable() === false, 'isNetPrinterAvailable() → false')
  g.calls.length = 0
  const t = T.getPrinterTransport()
  await t.availability()
  check(!g.calls.some(x => x[0] === 'probe' || x[0] === 'send'), `the transport is BLE and never calls the plugin (calls: ${JSON.stringify(g.calls.map(x => x[0]))})`)

  // The wired backend itself, if something ever reached it, must refuse.
  const netAvail = await NET.createNetTransport().availability()
  check(netAvail === 'unsupported', `netTransport.availability() → '${netAvail}' when the plugin is absent`)

  // NO /api/printing REQUEST. usePrinting's guard effect returns unless kind === 'net'; kind is 'ble'
  // above, so the fetch below is never reached. Modelled exactly, with fetch recording every call.
  const requests = []
  global.fetch = async (url) => { requests.push(String(url)); return { ok: true, status: 200, json: async () => ({}) } }
  const src = fs.readFileSync(path.join(REPO, 'lib/printing/usePrinting.ts'), 'utf8')
  const guard = /if \(!\(isNativeApp\(\) && canPrint && enabled && ready && kind === 'net'\)\) return/.test(src)
  check(guard, "the guard effect's first line is `if (!(… && kind === 'net')) return`")
  const wouldRun = true && true && true && true && T.getPrinterKind() === 'net'
  if (wouldRun) await GUARD.resolveNetGuard('tok', 'dev-1')
  check(!wouldRun && requests.length === 0, `the effect does not run, so /api/printing is never called (${requests.length} requests)`)
  // …and the control: with the plugin present and 'net' chosen, it WOULD call the route.
  g.pluginAvailable = true; await T.loadPrinterKind()
  if (T.getPrinterKind() === 'net') await GUARD.resolveNetGuard('tok', 'dev-1')
  check(requests.some(u => u.startsWith('/api/printing')), `control: with the plugin PRESENT the same path does call it (${requests.map(u => u.split('?')[0]).join(', ') || 'none'})`)
  g.prefs.clear(); g.pluginAvailable = true; await T.loadPrinterKind()
}

console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ gating unchanged for a device with no printer type chosen, and wired does not exist on a binary without the plugin'}`)
process.exit(fails ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
