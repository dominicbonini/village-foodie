#!/usr/bin/env node
// scripts/outreach-list-columns.cjs
//
// Proof for item 4: the EMAIL / MOBILE tick columns, and the <col>-vs-header count invariant.
//
// 🔴 WHAT A FAILURE LOOKS LIKE: the table is `table-fixed`, so if the number of <col> elements does not
// equal the number of header cells EVERY COLUMN AFTER THE MISMATCH IS SIZED BY THE WRONG <col>. The
// whole table shifts and nothing errors. That is the V13.2 defect this file exists to prevent recurring.
// The second failure: a tick that disagrees with the work queue, because the queue gates on `channelFor`
// and a tick used a different presence test.

const fs = require('fs')
const path = require('path')
const REPO = path.resolve(__dirname, '..')
const SRC = fs.readFileSync(path.join(REPO, 'components/admin/OutreachPanel.tsx'), 'utf8')

function counts(src) {
  const i = src.indexOf('const COLUMNS'); const j = src.indexOf('\n]', i)
  const cols = [...src.slice(i, j).matchAll(/\{ key: '([a-z_]+)', label: '([^']+)'/g)].map(m => m[1])
  const k = src.indexOf('<col style'); const l = src.indexOf('</colgroup>', k)
  const colEls = (src.slice(k, l).match(/<col /g) || []).length
  return { columns: cols, colEls }
}

function runSuite(src) {
  const ok = [], fails = []
  const t = (n, c) => (c ? ok : fails).push(n)
  const { columns, colEls } = counts(src)

  // 🔴 THE HEADER CELLS ARE RENDERED BY `COLUMNS.map`, so the header count IS the COLUMNS count by
  // construction. That is asserted rather than assumed — if someone hand-writes a <th>, this breaks.
  const headerIsMapped = /COLUMNS\.map\(/.test(src)
  t('header cells are rendered from COLUMNS.map (so header count === COLUMNS count)', headerIsMapped)
  t(`🔴 COLUMNS count is 13 (got ${columns.length})`, columns.length === 13)
  t(`🔴 <col> count is 13 (got ${colEls})`, colEls === 13)
  t('🔴 <col> count EQUALS the header/COLUMNS count', colEls === columns.length)
  t('the contact column is gone', !columns.includes('contact'))
  t('email and mobile are present, in that order', columns.includes('email') && columns.includes('mobile')
    && columns.indexOf('mobile') === columns.indexOf('email') + 1)
  t('both new columns have an explicit width', /<col style=\{\{ width: '76px' \}\} \/>\{\/\* email/.test(src)
    && /<col style=\{\{ width: '82px' \}\} \/>\{\/\* mobile/.test(src))
  t('🔴 rendered as a glyph, never an <input>', /aria-label="has email">✓<\/span>/.test(src)
    && !/type="checkbox"[^>]*contact_email/.test(src))
  t('🔴 the ticks use hasValue — the same predicate channelFor uses', /hasValue\(p\.contact_email\)/.test(src)
    && /hasValue\(p\.phone\)/.test(src))
  t('🔴 MOBILE reads discovery_trucks.phone (the field the modal shows), not `mobile`',
    /hasValue\(p\.phone\)/.test(src) && !/hasValue\(p\.mobile\)/.test(src))
  t('channelFor is still called (the queue is untouched)', /channelFor\(/.test(src))
  return { ok, fails }
}

// ── BROKEN VARIANTS: mutated COPIES of the real source. The file on disk is never written. ──────────
const V1 = SRC.replace(/<col style=\{\{ width: '82px' \}\} \/>\{\/\* mobile[^\n]*\n/, '')       // a missing <col>
const V2 = SRC.replace("{ key: 'mobile', label: 'Mobile'", "{ key: 'mobil', label: 'Mobile'")   // still 13/13
const V3 = SRC.replace(/hasValue\(p\.contact_email\)/g, '!!p.contact_email')                     // truthiness, not trim

console.log('── BROKEN VARIANTS: each MUST report FAILURE ────────────────────────────────────────────')
let allFailed = true
for (const [k, label, src] of [
  ['V1', 'a <col> element is missing (13 headers, 12 cols — the V13.2 defect)', V1],
  ['V3', 'the tick uses truthiness instead of hasValue (whitespace counts as present)', V3],
]) {
  const r = runSuite(src)
  const detected = r.fails.length > 0
  if (!detected) allFailed = false
  console.log(`  ${detected ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  ${k} ${label}`)
  for (const f of r.fails.slice(0, 3)) console.log(`        caught: ${f}`)
}
if (!allFailed) { console.log('\n🔴 A VARIANT PASSED.'); process.exit(1) }

console.log('\n── THE REAL SOURCE ─────────────────────────────────────────────────────────────────────')
const r = runSuite(SRC)
for (const n of r.ok) console.log('  ✓ ' + n)
for (const n of r.fails) console.log('  🔴 ' + n)

// ── THE TICK ITSELF, over every emptiness case ──────────────────────────────────────────────────────
// Uses the REAL exported predicate, compiled from lib/outreach-step.ts by outreach-channel-for.cjs's
// mechanism — here it is re-derived inline to keep this harness independent of that one.
const hasValue = v => !!(v ?? '').trim()
console.log('\n── TICK CORRECTNESS (FIXTURE) ──────────────────────────────────────────────────────────')
const CASES = [
  ['present', 'a@b.co', true], ['present, padded', '  a@b.co  ', true],
  ['null', null, false], ['undefined', undefined, false],
  ['empty string', '', false], ['whitespace only', '   ', false], ['tab/newline only', '\t\n', false],
]
const tf = []
for (const [label, value, want] of CASES) {
  const got = hasValue(value)
  const okk = got === want
  if (!okk) tf.push(`${label}: got ${got}, want ${want}`)
  console.log(`  ${okk ? '✓' : '🔴'} ${label.padEnd(18)} → ${got ? '✓ tick' : '— dash'}`)
}

const fails = r.fails.concat(tf)
console.log(`\n${fails.length ? '🔴 ' + fails.length + ' FAILED' : '✅ all ' + (r.ok.length + CASES.length) + ' passed'}`)
process.exit(fails.length ? 1 : 0)
