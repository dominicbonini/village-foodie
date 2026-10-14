#!/usr/bin/env node
// scripts/ui-literals.cjs — 🔴 NEW FILES USE MESSAGES (Language Phase 0, docs/language-phase-0-report.md §4;
// .cursor/rules/language.mdc rule 1).
//
//   node scripts/ui-literals.cjs                      check against the committed baseline
//   node scripts/ui-literals.cjs --capture <file>     write a baseline of today's counts
//
// Counts, per .tsx file, the user-facing text written inline: JSX text with a letter in it, and a string literal
// given to placeholder, title, label, aria-label or alt. The BASELINE (scripts/fixtures/ui-literals-baseline.json,
// captured when Phase 0 was built) lists every file that existed then, with its count.
//   • A file NOT in the baseline must count ZERO — new screens put their words in messages/en-GB.json. FAILS.
//   • A file IN the baseline may keep what it has; phases 1a–1e bring the counts down. Growth is PRINTED (so a
//     reviewer sees it), not failed: the brief keeps existing files' counts where they are rather than freezing them.
// Out of scope, as in the language audit: admin-only screens (app/admin, components/admin), app/dev, and the
// native developer panels (components/native/Dev*), which only Dominic sees.

const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')
const ts = require(path.join(REPO, 'node_modules/typescript'))
const BASELINE = 'scripts/fixtures/ui-literals-baseline.json'
const PROPS = new Set(['placeholder', 'title', 'label', 'aria-label', 'alt'])
const OUT_OF_SCOPE = /^(app\/admin\/|components\/admin\/|app\/dev\/|components\/native\/Dev)/

function files() {
  return require('child_process').execSync("git ls-files --cached --others --exclude-standard -- 'app/*.tsx' 'components/*.tsx' 'lib/*.tsx' 'hooks/*.tsx'", { cwd: REPO, encoding: 'utf8' })
    .split('\n').filter(f => f && fs.existsSync(path.join(REPO, f)) && !OUT_OF_SCOPE.test(f)).sort()
}
function countOf(f) {
  const sf = ts.createSourceFile(f, fs.readFileSync(path.join(REPO, f), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let n = 0
  const literal = e => e && (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) && /[A-Za-z]/.test(e.text)
  const visit = node => {
    if (ts.isJsxText(node) && /[A-Za-z]/.test(node.getText())) n++
    else if (ts.isJsxAttribute(node) && PROPS.has(node.name.getText())) {
      const v = node.initializer
      if (literal(v) || (v && ts.isJsxExpression(v) && literal(v.expression))) n++
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return n
}

const argv = process.argv.slice(2)
const CAPTURE = argv.includes('--capture') ? argv[argv.indexOf('--capture') + 1] : null
const now = Object.fromEntries(files().map(f => [f, countOf(f)]))
if (CAPTURE) {
  fs.writeFileSync(path.resolve(REPO, CAPTURE), JSON.stringify({ captured: 'Language Phase 0, 14 October 2026', counts: now }, null, 1) + '\n')
  console.log(`captured ${Object.keys(now).length} files, ${Object.values(now).reduce((a, b) => a + b, 0)} inline strings → ${CAPTURE}`)
  process.exit(0)
}
const base = JSON.parse(fs.readFileSync(path.join(REPO, BASELINE), 'utf8')).counts
const fresh = Object.entries(now).filter(([f, n]) => !(f in base) && n > 0)
const grew = Object.entries(now).filter(([f, n]) => f in base && n > base[f])
const fell = Object.entries(now).filter(([f, n]) => f in base && n < base[f])
const total = o => Object.values(o).reduce((a, b) => a + b, 0)
console.log(`  ${Object.keys(now).length} files in scope · ${total(now)} inline strings now · baseline ${total(base)}`)
for (const [f, n] of grew) console.log(`  ⚠️ ${f}: ${base[f]} → ${n} (an existing file grew — move new words to messages/)`)
if (fell.length) console.log(`  ${fell.length} file(s) went down since the baseline (good): ${fell.slice(0, 6).map(([f, n]) => `${f} ${base[f]}→${n}`).join(' · ')}`)
for (const [f, n] of fresh) console.log(`  ✗ ${f}: a NEW file with ${n} inline user-facing string(s) — its words belong in messages/en-GB.json`)
if (fresh.length) { console.log(`\n✗ ui-literals: ${fresh.length} new file(s) carry inline text`); process.exit(1) }
console.log('\n✓ ui-literals: no new file carries inline user-facing text')
