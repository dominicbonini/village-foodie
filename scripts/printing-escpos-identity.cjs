#!/usr/bin/env node
// scripts/printing-escpos-identity.cjs — renderTicket is BYTE-IDENTICAL to HEAD over every content branch.
//   node scripts/printing-escpos-identity.cjs
// 🔴 FAILURE MODE: any byte of any ticket differing from HEAD — the wired build must not change what a
// ticket looks like on paper. Every review of the ticket since 6 August was made against these bytes.
const fs = require('fs'); const path = require('path'); const os = require('os')
const { compile, headWorktree, REPO } = require('./_slot-interval-compile.cjs')
const head = headWorktree('escpos')
const H = compile(head.wt, ['lib/printing/ticket.ts'], 'escHEAD').req('lib/printing/ticket.js')
const N = compile(REPO, ['lib/printing/ticket.ts'], 'escNOW').req('lib/printing/ticket.js')
let fails = 0; const check = (ok, l) => { console.log(`  ${ok ? '✓' : '🔴'} ${l}`); if (!ok) fails++ }
const base = { id: '17', customer_name: 'Jamie', customer_phone: '07700 900123', collection_time: '18:45', buzzer_number: 12,
  items: [{ name: 'Sesame Prawn Toast', quantity: 1, unit_price: 6.5, modifiers: [{ name: 'extra chilli', price: 0.5 }] },
          { name: 'Chicken wings Thai style', quantity: 2, unit_price: 7, specialInstructions: 'no peanuts' },
          { name: 'José\'s Spring Rolls £', quantity: 1, unit_price: 4.5, modifiers: [{ name: 'sweet chilli dip', price: 0 }] }],
  deals: [{ name: 'Two mains + drink', price: 18, slots: { main: 'Pad Thai', drink: 'Coke' }, slotModifiers: { main: [{ name: 'extra chilli', price: 0.5 }] }, slotNotes: { main: 'no peanuts - severe allergy' } }],
  notes: 'SEVERE PEANUT ALLERGY for one of the mains - please use clean oil and a clean pan, and keep it away from the wings. Also no coriander on anything. Thank you!',
  total: 42.5, truck_name: 'Test Kitchen', printedLabel: '18:37',
  // Phase 2A (10 October 2026): the mapper hands the renderer the ORDER's money format; a UK order's is
  // this. HEAD ignores the field, so the bytes must still be identical. (With none, the renderer prints
  // bare figures by design — never a £ nobody vouched for.)
  money: { currency: 'GBP', locale: 'en-GB' } }
const FIX = [
  ['full order, unpaid, paid step on', { ...base, showPaidStep: true, paymentStatus: 'unpaid' }],
  ['paid', { ...base, showPaidStep: true, paymentStatus: 'paid' }],
  ['part paid', { ...base, showPaidStep: true, paymentStatus: 'part_paid', balanceMinor: 1250 }],
  ['no paid step', { ...base, showPaidStep: false }],
  ['held authorisation', { ...base, showPaidStep: true, heldAuthorisation: true }],
  ['possible duplicate', { ...base, reprint: { reason: 'possible_duplicate', attempt: 2 } }],
  ['reprint', { ...base, reprint: { reason: 'reprint' } }],
  ['ASAP, no phone, no notes, no deals', { ...base, collection_time: null, customer_phone: null, notes: null, deals: null, buzzer_number: null }],
  ['test-ticket shape', { id: 'TEST', customer_name: 'Test ticket', collection_time: '12:00', items: [{ name: 'Test ticket', quantity: 1 }], total: 0, truck_name: 'Pizza Kitchen', printedLabel: '12:00', money: { currency: 'GBP', locale: 'en-GB' } }],
]
console.log('── BROKEN VARIANT: MUST report FAILURE ──────────────────────────────────────────────────')
{
  const src = fs.readFileSync(path.join(REPO, 'lib/printing/ticket.ts'), 'utf8').replace('const TICKET_LEADING_FEED_LINES = 2', 'const TICKET_LEADING_FEED_LINES = 3')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'escV1-')); fs.mkdirSync(path.join(tmp, 'lib/printing'), { recursive: true })
  fs.writeFileSync(path.join(tmp, 'lib/printing/ticket.ts'), src)
  for (const f of ['prep-utils.ts', 'slot-capacity.ts', 'slot-indicator.ts', 'money-format.ts']) if (fs.existsSync(path.join(REPO, 'lib', f))) fs.copyFileSync(path.join(REPO, 'lib', f), path.join(tmp, 'lib', f))
  const V = compile(tmp, ['lib/printing/ticket.ts'], 'escV1').req('lib/printing/ticket.js')
  const a = JSON.stringify(Array.from(H.renderTicket(FIX[0][1], { paper_width: 80 }))), b = JSON.stringify(Array.from(V.renderTicket(FIX[0][1], { paper_width: 80 })))
  console.log(`  ${a !== b ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 TICKET_LEADING_FEED_LINES 2→3 changes the bytes`)
  if (a === b) { head.remove(); process.exit(1) }
}
console.log('\n── HEAD vs WORKING TREE ────────────────────────────────────────────────────────────────')
/* ⚠️ AUDIT D38 (docs/audit-fixes-report.md) — THE ONE NAMED CHANGE. The fixture's "José" now prints "Jose"
 * (accents fold to plain letters) where HEAD printed "Jos?". So HEAD is fed the already-folded text and the
 * working tree the original: if the fold is the ONLY change, the two byte streams are identical. Every other
 * byte — ASCII, "£" at 0xA3, ESC t 16, layout — is still compared exactly. */
/* ⚠️ ONCE D38 IS COMMITTED (the checkpoint 3033a53, docs/phase-3-foundations-report.md Step 0), HEAD FOLDS TOO, and
 * the comparison is plain HEAD vs working tree again. Which case applies is read off HEAD itself — its own
 * printableText — never assumed, so this stays right whichever side of that commit it runs on. */
const headFolds = typeof H.printableText === 'function' && H.printableText('José') === 'Jose'
const foldForHead = o => (headFolds ? o : JSON.parse(JSON.stringify(o).replace(/José/g, 'Jose')))
for (const [label, order] of FIX) for (const w of [58, 80]) {
  const a = JSON.stringify(Array.from(H.renderTicket(foldForHead(order), { paper_width: w }))), b = JSON.stringify(Array.from(N.renderTicket(order, { paper_width: w })))
  check(a === b, `${label} @${w}mm — ${JSON.parse(a).length} bytes, identical (with "José" printing "Jose", audit D38${headFolds ? ', now in HEAD' : ''})`)
}
if (headFolds) {
  // The control the D38 note relied on is restated: the working tree must fold exactly as HEAD does, and a
  // ticket fed the UNFOLDED fixture to an unfolded renderer would differ — proven by refusing the fold by hand.
  const raw = JSON.stringify(Array.from(N.renderTicket(FIX[0][1], { paper_width: 58 })))
  check(raw.includes('74,111,115,101,39,115') && !raw.includes('74,111,115,63,39,115'),   // "Jose's", never "Jos?'s"
    'CONTROL: HEAD already folds (D38 committed) — the working tree prints "Jose", never "Jos?", on the raw fixture')
  check(JSON.stringify(Array.from(H.renderTicket(FIX[0][1], { paper_width: 58 }))) !== JSON.stringify(Array.from(H.renderTicket(JSON.parse(JSON.stringify(FIX[0][1]).replace(/José/g, 'Jos\u00bf')), { paper_width: 58 }))),
    'CONTROL: a changed name changes the bytes — so the comparison above is really comparing')
} else {
  check(JSON.stringify(Array.from(H.renderTicket(FIX[0][1], { paper_width: 58 }))) !== JSON.stringify(Array.from(N.renderTicket(FIX[0][1], { paper_width: 58 }))),
    'CONTROL: without the fold, HEAD and the working tree differ — so the check above is really comparing')
}
head.remove()
console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ renderTicket byte-identical to HEAD on ' + FIX.length * 2 + ' fixtures'}`)
process.exit(fails ? 1 : 0)
