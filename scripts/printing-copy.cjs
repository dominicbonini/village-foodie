#!/usr/bin/env node
// scripts/printing-copy.cjs — the words: no "thermal" anywhere an operator or customer reads; every
// marketing mention that NAMES a printer says "Bluetooth or wired"; Bluetooth-only sentences live ONLY in
// the Bluetooth branch; the iOS Local Network string is exact and there is no NSBonjourServices.
//
// ⚠️ THE PRICING CARD NAMES THE FEATURE AND SAYS NOTHING ABOUT PRINTERS (19 September 2026). It read
// "Kitchen ticket printing (Bluetooth or wired printer)" — the longest bullet in the list, for the least
// useful reason, and a second copy of a detail the comparison table lower down the SAME page already
// carries in the row's `detail` and footnote 5. Which printers it works with is a detail; the card lists
// what you get. So the bullet is now byte-identical to the row's `name`, which is also what the landing
// page's own "card and table must agree" rule asks for, and the "Bluetooth or wired" requirement applies
// to the mentions that still name a printer.
//   node scripts/printing-copy.cjs
// 🔴 FAILURE MODE: an operator with a wired printer reading "Bluetooth is switched off", or a customer
// reading "thermal printer" — a word this product has never asked them to know.
const fs = require('fs'); const path = require('path'); const REPO = path.join(__dirname, '..')
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8')
/** Strip TS/TSX comments so only what is RENDERED or shown is judged. */
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
let fails = 0; const check = (ok, l) => { console.log(`  ${ok ? '✓' : '🔴'} ${l}`); if (!ok) fails++ }
const FACING = ['components/printing/PrintingSettings.tsx', 'components/printing/PrinterTypeChoice.tsx', 'lib/printing/netTransport.ts', 'lib/printing/networkGuard.ts', 'lib/printing/netAddress.ts', 'lib/printing/usePrinting.ts', 'lib/plan-features.ts', 'app/landing/page.tsx', 'content/store-listing.md', 'app/api/printing/route.ts']
console.log('── BROKEN VARIANT: MUST report FAILURE ──────────────────────────────────────────────────')
{
  // Re-based 19 September 2026: this replaced "Bluetooth or wired printer" on the landing page, a phrase
  // the pricing card no longer carries, so the replace became a no-op and the variant stopped proving
  // anything. It now reinstates the word in the bullet that IS there.
  const v1 = noComments(read('app/landing/page.tsx')).replace('Kitchen ticket printing', 'Kitchen thermal ticket printing')
  const hit = /thermal/i.test(v1)
  console.log(`  ${hit ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 "thermal" reinstated on the landing page is caught`)
  if (!hit) process.exit(1)
}
console.log('\n── no "thermal" in rendered/returned strings ────────────────────────────────────────────')
for (const f of FACING) { const s = f.endsWith('.md') ? read(f) : noComments(read(f)); const m = s.match(/.*thermal.*/i); check(!m, `${f}${m ? ' — ' + m[0].trim() : ''}`) }
console.log('\n── marketing mentions say "Bluetooth or wired" ──────────────────────────────────────────')
{
  const pf = read('lib/plan-features.ts')
  // 🔴 THE CARD NAMES THE FEATURE; THE TABLE CARRIES THE DETAIL. Asserted as AGREEMENT with the row's own
  // `name` rather than as a literal, so the two cannot drift — which is exactly what the landing page's
  // own comment warns about ("this bullet is hand-written and nothing checks it"). Now something does.
  const rowName = (pf.match(/\{ name: '(Kitchen ticket printing)',/) || [])[1]
  const landing = noComments(read('app/landing/page.tsx'))
  check(!!rowName, `the comparison table still has a row named ${JSON.stringify(rowName ?? null)}`)
  check(landing.includes(`<li>${rowName}</li>`), `the pricing card's bullet is that name exactly: "${rowName}"`)
  check(!/Kitchen ticket printing \(/.test(landing),
    'and carries no parenthetical — which printers it works with is the table\'s job, not the card\'s')
  check(/Print order tickets to a Bluetooth or wired printer in the kitchen\./.test(pf), 'plan-features row detail')
  check(/compatible Bluetooth or wired printer \(neither supplied\)/.test(pf), 'plan-features footnote')
  check(!/Bluetooth receipt printer/.test(read('content/store-listing.md')) && /Bluetooth or wired printer/.test(read('content/store-listing.md')), 'store listing')
  const mentions = FACING.filter(f => /landing|plan-features|store-listing/.test(f)).flatMap(f => (noComments(read(f)).match(/[^.\n]*printer[^.\n]*/gi) || []).map(x => f + ': ' + x.trim()))
  for (const m of mentions) check(/Bluetooth or wired|wired printer|Bluetooth printer|the printer|your printer|a printer|no printer|kitchen printer|Compatible printers|physical printer/i.test(m), m.slice(0, 140))
}
console.log('\n── Bluetooth-only sentences appear ONLY inside the Bluetooth branch of the card ──────────')
{
  const card = read('components/printing/PrintingSettings.tsx')
  const open = card.indexOf("{kind !== 'net' ? ("); check(open > 0, "the branch marker {kind !== 'net' ? ( exists")
  // the else-branch begins at the matching `) : (` that follows; find it by walking the JSX for the first
  // top-level `) : (` after the marker at the same nesting depth
  let depth = 0, i = open + "{kind !== 'net' ? (".length, close = -1
  for (; i < card.length; i++) { const ch = card[i]; if (ch === '(') depth++; else if (ch === ')') { if (depth === 0) { close = i; break } depth-- } }
  check(close > open, 'the branch closes')
  const bleBranch = card.slice(open, close), rest = card.slice(0, open) + card.slice(close)
  // 🔴 HEAD'S EXACT WORDING, RESTORED 17 September 2026. The wired build had tightened two of these
  // sentences ("Bluetooth receipt printer" → "Bluetooth printer", "most receipt printers" → "most
  // printers"). The shells load the live site, so a device on the STORE build renders this card the
  // moment the code deploys — and FIX 1 requires that such a device sees the Bluetooth card it already
  // had, unchanged to the byte. Tidier copy is not worth a diff on a shipped screen; it can ride with
  // the next binary. If you change one of these, change HEAD's too.
  for (const s of ['Bluetooth is switched off', 'Connect a Bluetooth receipt printer', 'cannot reach a Bluetooth printer', 'most receipt printers only appear', 'Scan for printers']) {
    check(bleBranch.includes(s), `"${s}" is in the Bluetooth branch`)
    check(!noComments(rest).includes(s), `…and nowhere else`)
  }
  const wiredBranch = card.slice(close)
  for (const s of ['Turn on Local Network for HatchGrab in Settings', 'Print test ticket', "Can't reach the printer"]) check(!bleBranch.includes(s) || s === "Can't reach the printer", `"${s}" is not in the Bluetooth branch`)
  // The PIN refusal is wired-only copy and says what IS true, not what cannot be checked.
  const guardSrc = read('lib/printing/networkGuard.ts')
  check(/pin: "Wired printing isn't available on dashboards with a PIN yet\.",/.test(guardSrc), 'NET_GUARD_COPY.pin — the exact sentence')
  check(!bleBranch.includes('NET_GUARD_COPY.pin'), 'the PIN sentence never appears in the Bluetooth branch')
  // The choice itself lives in its own file BECAUSE it is gated on the running binary carrying the
  // plugin — scripts/printing-gating.cjs renders it both ways. Here we only check its words.
  const choice = read('components/printing/PrinterTypeChoice.tsx')
  check(/Printer type/.test(choice) && /'Bluetooth'/.test(choice) && /'Wired'/.test(choice), 'PrinterTypeChoice.tsx: the choice reads Bluetooth / Wired')
  check(!/Printer type/.test(noComments(card)), 'the card itself renders no Printer type markup — it delegates to the gated component')
  check(/isNetPrinterAvailable\(\)/.test(choice), 'and it is gated on isNetPrinterAvailable()')
  check(!/Bluetooth thermal|thermal/.test(noComments(card)), 'the card never says "thermal"')
}
console.log('\n── iOS Info.plist ──────────────────────────────────────────────────────────────────────')
{
  const p = read('ios/App/App/Info.plist')
  check(p.includes('<key>NSLocalNetworkUsageDescription</key>\n\t<string>HatchGrab connects to your kitchen printer on your local network so order tickets can print automatically. It is not used for anything else.</string>'), 'NSLocalNetworkUsageDescription — exact text')
  check(!p.includes('NSBonjourServices'), 'no NSBonjourServices (no Bonjour is used)')
  check(p.includes('NSBluetoothAlwaysUsageDescription'), 'the existing Bluetooth string is still there')
}
console.log('\n── Android manifest: the plugin adds no permission ─────────────────────────────────────')
{
  const m = read('plugins/hatchgrab-net-printer/android/src/main/AndroidManifest.xml'); check(!/uses-permission/.test(m), 'plugin manifest declares no <uses-permission>')
}
console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ copy rules hold'}`)
process.exit(fails ? 1 : 0)
