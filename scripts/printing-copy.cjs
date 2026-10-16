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
// ⚠️ RE-PINNED (Language Phase 1e): the landing's and the plan table's words are MESSAGES now (`landing.*`, `planFeatures.*`
// in messages/en-GB.json, US overrides in messages/en-US.json). The message files join the list, and "the landing page"
// below is its source PLUS those messages (both languages) — the words a visitor reads, wherever they are written.
const MSG = loc => JSON.parse(read(`messages/${loc}.json`))
const leaves = (o, p = '') => Object.entries(o || {}).flatMap(([k, v]) => (v && typeof v === 'object' ? leaves(v, `${p}${k}.`) : [[`${p}${k}`, v]]))
const MARKETING_NS = /^(landing|landingNav|landingFooter|planFeatures|planMeta|featuresPage|plansPdf|compare)\./
const marketingWords = () => ['en-GB', 'en-US'].flatMap(loc => leaves(MSG(loc)).filter(([k]) => MARKETING_NS.test(k)).map(([k, v]) => `${loc}:${k} = ${v}`)).join('\n')
const landingText = () => noComments(read('app/landing/page.tsx')) + '\n' + marketingWords()
const FACING = ['messages/en-GB.json', 'messages/en-US.json', 'components/printing/PrintingSettings.tsx', 'components/printing/PrinterTypeChoice.tsx', 'lib/printing/netTransport.ts', 'lib/printing/networkGuard.ts', 'lib/printing/netAddress.ts', 'lib/printing/usePrinting.ts', 'lib/plan-features.ts', 'app/landing/page.tsx', 'content/store-listing.md', 'app/api/printing/route.ts']
console.log('── BROKEN VARIANT: MUST report FAILURE ──────────────────────────────────────────────────')
{
  // Re-based 19 September 2026: this replaced "Bluetooth or wired printer" on the landing page, a phrase
  // the pricing card no longer carries, so the replace became a no-op and the variant stopped proving
  // anything. It now reinstates the word in the bullet that IS there.
  // ⚠️ RE-PINNED (Language Phase 1e): the bullet is the message landing.pricing.max.printing — the variant reinstates the
  // word THERE (in the words the landing renders), and the same scan as below must catch it.
  const v1 = landingText().replace('landing.pricing.max.printing = Kitchen ticket printing', 'landing.pricing.max.printing = Kitchen thermal ticket printing')
  if (v1 === landingText()) { console.log('  🔴 V1: THE MUTATION DID NOT APPLY'); process.exit(1) }
  const hit = /thermal/i.test(v1)
  console.log(`  ${hit ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 "thermal" reinstated on the landing page is caught`)
  if (!hit) process.exit(1)
}
console.log('\n── no "thermal" in rendered/returned strings ────────────────────────────────────────────')
for (const f of FACING) { const s = f.endsWith('.md') || f.endsWith('.json') ? read(f) : noComments(read(f)); const m = s.match(/.*thermal.*/i); check(!m, `${f}${m ? ' — ' + m[0].trim() : ''}`) }
console.log('\n── marketing mentions say "Bluetooth or wired" ──────────────────────────────────────────')
{
  const pf = read('lib/plan-features.ts')
  // 🔴 THE CARD NAMES THE FEATURE; THE TABLE CARRIES THE DETAIL. Asserted as AGREEMENT with the row's own
  // `name` rather than as a literal, so the two cannot drift — which is exactly what the landing page's
  // own comment warns about ("this bullet is hand-written and nothing checks it"). Now something does.
  // Language Phase 0 (14 October 2026): each row now opens with its code id, `{ id: 'ticket_printing', name: … }`.
  // ⚠️ RE-PINNED (Language Phase 1e): the row is `{ id: 'ticket_printing', … }` and its words are the messages
  // planFeatures.row.ticket_printing.*; the card's bullet is landing.pricing.max.printing, rendered as <li>{t('pricing.max.printing')}</li>.
  // The claims are unchanged: the bullet IS the row's name (in both languages), with no parenthetical; the detail and
  // footnote 5 say "Bluetooth or wired".
  const gbW = Object.fromEntries(leaves(MSG('en-GB'))), usW = { ...gbW, ...Object.fromEntries(leaves(MSG('en-US'))) }
  const rowName = /\{ id: 'ticket_printing',/.test(pf) ? gbW['planFeatures.row.ticket_printing.name'] : undefined
  const landing = noComments(read('app/landing/page.tsx'))
  check(!!rowName, `the comparison table still has a row named ${JSON.stringify(rowName ?? null)}`)
  check(/<li>\{t\('pricing\.max\.printing'\)\}<\/li>/.test(landing) && gbW['landing.pricing.max.printing'] === rowName && usW['landing.pricing.max.printing'] === usW['planFeatures.row.ticket_printing.name'],
    `the pricing card's bullet is that name exactly: "${rowName}" (GB and US)`)
  check(![gbW, usW].some(w => /\(/.test(w['landing.pricing.max.printing'] || '')),
    'and carries no parenthetical — which printers it works with is the table\'s job, not the card\'s')
  check([gbW, usW].every(w => /Print order tickets to a Bluetooth or wired printer in the kitchen\./.test(w['planFeatures.row.ticket_printing.detail'] || '')), 'plan-features row detail (GB and US)')
  check([gbW, usW].every(w => /compatible Bluetooth or wired printer \(neither supplied\)/.test(w['planFeatures.footnote.n5'] || '')), 'plan-features footnote (GB and US)')
  check(!/Bluetooth receipt printer/.test(read('content/store-listing.md')) && /Bluetooth or wired printer/.test(read('content/store-listing.md')), 'store listing')
  const mentions = [...FACING.filter(f => /landing|plan-features|store-listing/.test(f)).flatMap(f => (noComments(read(f)).match(/[^.\n]*printer[^.\n]*/gi) || []).map(x => f + ': ' + x.trim())),
    ...(marketingWords().match(/[^.\n]*printer[^.\n]*/gi) || []).map(x => 'messages: ' + x.trim())]
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
  // ⚠️ LANGUAGE PHASE 1b (docs/language-phase-1b-report.md): the card's words are messages (`printing.card.*` in
  // messages/en-GB.json, read with `useT('printing.card')`). So each sentence is checked twice: its WORDS in the
  // message (exact, as before), and its KEY's use — referenced inside the Bluetooth branch and nowhere else.
  const CARD = JSON.parse(read('messages/en-GB.json')).printing.card
  const keysFor = s => Object.entries(CARD).filter(([, v]) => typeof v === 'string' && v.includes(s)).map(([k]) => k)
  const usesKey = (src, k) => new RegExp(`\\bt(?:\\.rich)?\\('${k}'`).test(src)
  for (const s of ['Bluetooth is switched off', 'Connect a Bluetooth receipt printer', 'cannot reach a Bluetooth printer', 'most receipt printers only appear', 'Scan for printers']) {
    const keys = keysFor(s)
    check(keys.length > 0 && keys.some(k => usesKey(bleBranch, k)), `"${s}" is in the Bluetooth branch (printing.card.${keys.join('/') || '?'})`)
    check(!keys.some(k => usesKey(noComments(rest), k)), `…and nowhere else`)
  }
  const wiredBranch = card.slice(close)
  for (const s of ['Turn on Local Network for HatchGrab in Settings', 'Print test ticket']) check(!keysFor(s).some(k => usesKey(bleBranch, k)), `"${s}" is not in the Bluetooth branch`)
  // The PIN refusal is wired-only copy and says what IS true, not what cannot be checked. Its words are
  // `printing.say.guard.pin`, reached through the guard code — which the Bluetooth branch never renders.
  const SAY = JSON.parse(read('messages/en-GB.json')).printing.say
  // ⚠️ RE-PINNED (Language Phase 2, Part 3 — the wrong-English fixes, scripts/fixtures/language-phase-2-gb-named.json): typographic apostrophe.
  check(SAY.guard && SAY.guard.pin === "Wired printing isn’t available on dashboards with a PIN yet.", 'printing.say.guard.pin — the exact sentence (was NET_GUARD_COPY.pin)')
  check(!/code: 'guard'|guard\b/.test(noComments(bleBranch)), 'the PIN sentence never appears in the Bluetooth branch')
  // The choice itself lives in its own file BECAUSE it is gated on the running binary carrying the
  // plugin — scripts/printing-gating.cjs renders it both ways. Here we only check its words.
  const choice = read('components/printing/PrinterTypeChoice.tsx')
  // Language Phase 1b: the words are printing.card.printerType / typeBluetooth / typeWired, read by the choice.
  check(CARD.printerType === 'Printer type' && CARD.typeBluetooth === 'Bluetooth' && CARD.typeWired === 'Wired'
    && /t\('printerType'\)/.test(choice) && /t\('typeBluetooth'\)/.test(choice) && /t\('typeWired'\)/.test(choice), 'PrinterTypeChoice.tsx: the choice reads Bluetooth / Wired')
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
