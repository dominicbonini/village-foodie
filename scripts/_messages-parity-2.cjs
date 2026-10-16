// scripts/_messages-parity-2.cjs — messages-parity AREA for Language Phase 2 (docs/language-phase-2-report.md): US
// English (messages/en-US.json) and the wrong-English fixes (messages/en-GB.json).
//   1. every en-US key exists in en-GB and DIFFERS from it — en-US holds only what the US says differently, never a copy;
//   2. every en-US message is valid ICU, takes the same arguments as its en-GB key (a select's or plural's own
//      variable included), and renders (messages-parity §3–§4 render the merged en-US catalogue);
//   3. every `ticket` message, en-GB and en-US, is plain printable ASCII — the printer has no other characters;
//   4. every en-GB key that changed since 460ba55 is in scripts/fixtures/language-phase-2-gb-named.json with exactly
//      that before and after — so the report's list and the catalogue can never disagree.
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')
const { parse, TYPE } = require(path.join(REPO, 'node_modules/@formatjs/icu-messageformat-parser'))
const LP2 = require('./_lp2-frozen.cjs')

function args(ast, out = new Set()) {
  for (const el of ast) {
    if ([TYPE.argument, TYPE.number, TYPE.date, TYPE.time, TYPE.select, TYPE.plural].includes(el.type)) out.add(el.value)
    if (el.type === TYPE.tag) { out.add(`<${el.value}>`); args(el.children, out) }
    if (el.options) for (const o of Object.values(el.options)) args(o.value, out)
  }
  return out
}

/** en-US messages that leave out an en-GB argument ON PURPOSE (Language Phase 1d Part 2): key → { drop, reason }. */
const ARG_DROPS = { 'posterWords.heading': { drop: ['end'], reason: 'approved US wording (audit §4.4 row 25): "Week commencing {start} to {end}" → "Week of {start}" — the US heading names the week by its first day only' } }

module.exports = function area({ t, head, msgs }) {
  head('Phase 2 · US English and the wrong-English fixes')
  const gb = Object.fromEntries(LP2.leaves(msgs['en-GB'])), us = LP2.leaves(msgs['en-US'] || {})
  const copies = us.filter(([k, v]) => gb[k] === v).map(([k]) => k)
  t(`en-US: every key differs from en-GB — no copies (${us.length} US messages)`, copies.length === 0, copies.join(', '))
  const orphans = us.filter(([k]) => !(k in gb)).map(([k]) => k)
  t('en-US: every key exists in en-GB', orphans.length === 0, orphans.join(', '))
  for (const [k, v] of us) {
    let a, b
    try { a = args(parse(v)) } catch (e) { t(`en-US · ${k}: valid ICU`, false, e.message); continue }
    try { b = args(parse(gb[k] ?? '')) } catch { continue }
    // ⚠️ RE-PINNED (Language Phase 1d Part 2): an en-US message may DROP an argument only where ARG_DROPS names it, with
    // its reason — every other argument must still be the same.
    const drop = ARG_DROPS[k] ? new Set(ARG_DROPS[k].drop) : new Set()
    const same = [...a].sort().join(',') === [...b].filter(x => !drop.has(x)).sort().join(',')
    t(`en-US · ${k}: takes the same arguments as en-GB (${[...b].join(', ') || 'none'})`, same, `en-US ${[...a].join(', ')} · en-GB ${[...b].join(', ')}`)
  }
  for (const [loc, m] of [['en-GB', msgs['en-GB']], ['en-US', msgs['en-US'] || {}]]) {
    const bad = LP2.leaves(m.ticket || {}).filter(([, v]) => /[^\x20-\x7e]/.test(v))
    t(`${loc}: every ticket message is plain ASCII (${LP2.leaves(m.ticket || {}).length})`, bad.length === 0, bad.map(([k, v]) => `${k}: ${v}`).join(' · '))
  }
  for (const [key, { source, text }] of Object.entries(LP2.FROZEN_INLINE)) {
    const f = source.split(' ')[0]
    let src = ''; try { src = require('child_process').execSync(`git show ${LP2.FROZEN_REF}:${f}`, { cwd: REPO, encoding: 'utf8' }) } catch { /* reported below */ }
    const flat = src.replace(/"\s*\+\s*\n\s*"/g, '')
    t(`${key}: its frozen text is ${f}'s at ${LP2.FROZEN_REF}, verbatim`, flat.includes(JSON.stringify(text).slice(1, -1)), text)
  }
  const file = path.join(REPO, 'scripts/fixtures/language-phase-2-gb-named.json')
  const named = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null
  t('scripts/fixtures/language-phase-2-gb-named.json exists', !!named)
  if (named) {
    const diff = LP2.gbKeyDiff()
    const unnamed = Object.keys(diff).filter(k => !named[k] || named[k].before !== diff[k].before || named[k].after !== diff[k].after)
    const stale = Object.keys(named).filter(k => !diff[k])
    t(`every en-GB key changed since ${LP2.FROZEN_REF} is named, as it changed (${Object.keys(diff).length})`, unnamed.length === 0, unnamed.join(', '))
    t('every named key did change', stale.length === 0, stale.join(', '))
  }
}
