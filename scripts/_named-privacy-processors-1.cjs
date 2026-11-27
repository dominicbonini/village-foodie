// scripts/_named-privacy-processors-1.cjs — privacy-processors-1's legal edits (27 November 2026, docs/privacy-processors-1-report.md), named
// so the byte-identity harnesses can take them back EXACTLY:
//   • content/legal/privacy-policy.md — section 6's two rows (Anthropic (Claude); Namecheap), the international-transfers sentence's two
//     clauses (Dominic's approved wording) and the date 25 → 27 November 2026;
//   • content/legal/<locale>/privacy-policy.md, the 54 language bases an enabled country uses — the same rows and clauses translated, and
//     the source stamp moved to the new English text's sha256;
//   • lib/legal.ts — PRIVACY_UPDATED '25 November 2026' → '27 November 2026', TERMS_VERSION '2026-11-24' → '2026-11-27' and its comment.
// Pairs [now, before] in scripts/fixtures/privacy-processors-1-legal-edits.json (generated from the diff against 2d2119f4 and checked to
// give it back byte for byte). CHAINED FIRST by scripts/_named-till-pack-5-6.cjs undoCode (newest change first), so every helper that
// takes the older rounds back takes this one back too. IDEMPOTENT, the chain's rule: a pair whose `now` is there exactly once is put back;
// one that is not there is left alone; one there more than once → null.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'
const fs = require('fs'), path = require('path')
const EDITS = require('./fixtures/privacy-processors-1-legal-edits.json')

function undoCode(file, src) {
  const pairs = EDITS[file]
  if (!pairs || typeof src !== 'string') return src
  let out = src
  for (const [now, before] of pairs) {
    const n = out.split(now).length - 1
    if (n === 1) { out = out.replace(now, () => before); continue }
    if (n === 0) continue
    return null
  }
  return out
}
function asBefore(file, text) {
  const r = undoCode(file, text)
  if (r === null) throw new Error(`privacy-processors-1: ${file} — an edit is neither there exactly once nor already taken back`)
  return r
}
/** True on a tree with this round's legal change. */
const LANDED = (() => { try { return /export const PRIVACY_UPDATED = '27 November 2026'/.test(fs.readFileSync(path.join(__dirname, '..', 'lib/legal.ts'), 'utf8')) } catch { return false } })()
/** The sitemap's /privacy lastmod (English and every translated address carry the English date). */
const LASTMOD = { privacy: ['2026-11-25T00:00:00.000Z', '2026-11-27T00:00:00.000Z'] }
/** The shown date of /privacy (the English and every translation carry the English "Last updated"). */
const PRIVACY_DATE = ['25 November 2026', '27 November 2026']
/** TERMS_VERSION, written at signup (operators.terms_version). */
const TERMS_VERSION = ['2026-11-24', '2026-11-27']

module.exports = { EDITED_FILES: Object.keys(EDITS), undoCode, asBefore, LANDED, LASTMOD, PRIVACY_DATE, TERMS_VERSION }
