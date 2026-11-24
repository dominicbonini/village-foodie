// scripts/_named-france-records-1.cjs (france-records-1, 24 November 2026, docs/france-records-1-report.md): the named change this work
// makes to what the language-phase harnesses record.
//   proveSettingsCard(exp, f)   Manage › Settings gains ONE "Business details" card (components/manage/BusinessDetailsCard.tsx), right
//                               after "Where you trade". STRUCTURAL: with exactly that one card taken out — the Card wrapper and its
//                               `data-business-details` block, matched by balanced <div>s — F equals the expected view byte for byte,
//                               and the card holds its en-GB title. Any other difference, a second card, or none at all fails.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'
const fs = require('fs'); const path = require('path')
const LANDED = (() => { try { return fs.readFileSync(path.join(__dirname, '..', 'components/manage/BusinessDetailsCard.tsx'), 'utf8').includes('data-business-details') } catch { return false } })()
const OPEN = '<div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4"><div data-business-details="true">'

/** The string with the one card cut out → { s, cut } (cut = how many were found; the cut text in `card`). */
function cutCard(s, problems) {
  const at = s.indexOf(OPEN)
  if (at < 0) return { s, cut: 0 }
  if (s.indexOf(OPEN, at + OPEN.length) >= 0) problems.push('more than one Business details card')
  let depth = 0, i = at
  const re = /<div\b|<\/div>/g
  re.lastIndex = at
  for (let m; (m = re.exec(s));) {
    depth += m[0] === '</div>' ? -1 : 1
    if (depth === 0) { i = m.index + m[0].length; break }
  }
  if (depth !== 0) { problems.push('the card is not closed'); return { s, cut: 0 } }
  const card = s.slice(at, i)
  if (!/<h3[^>]*>Business details<\/h3>/.test(card)) problems.push('the card does not carry its en-GB title "Business details"')
  return { s: s.slice(0, at) + s.slice(i), cut: 1 }
}

function proveSettingsCard(exp, f) {
  const problems = []
  let cuts = 0
  const walk = v => {
    if (typeof v === 'string') { if (!v.includes(OPEN)) return v; const r = cutCard(v, problems); cuts += r.cut; return r.s }
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
    return v
  }
  try {
    const rest = walk(f)
    if (cuts !== 1) problems.push(`expected exactly one Business details card, found ${cuts}`)
    if (JSON.stringify(rest) !== JSON.stringify(exp)) problems.push('with the Business details card taken out, the view differs from the expected one')
  } catch (e) { problems.push('threw: ' + e.message) }
  return { ok: problems.length === 0, problems }
}

module.exports = { LANDED, proveSettingsCard, OPEN }
