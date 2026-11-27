// scripts/_named-till-pack-5-6.cjs — till-pack-5-6's legal edits (25 November 2026, docs/till-pack-5-6-report.md Part C), named so the
// byte-identity harnesses can take them back EXACTLY:
//   • content/legal/privacy-policy.md — section 7's accounting-records line ("at least six years … and ten years where the law requires
//     it", Dominic's approved wording) and the date 24 → 25 November 2026;
//   • content/legal/<locale>/privacy-policy.md, the 54 language bases an enabled country uses — the same line translated, and the source
//     stamp moved to the new English text's sha256;
//   • lib/legal.ts — PRIVACY_UPDATED '24 November 2026' → '25 November 2026' (TERMS_VERSION is NOT moved: "change nothing else").
// Pairs [now, before] in scripts/fixtures/till-pack-5-6-legal-edits.json (generated from the diff against 5b9aac85 and checked to give it
// back byte for byte). CHAINED FIRST by scripts/_named-france-privacy-1.cjs undoCode (newest change first), so every helper that takes the
// older rounds back takes this one back too. IDEMPOTENT, the chain's rule: a pair whose `now` is there exactly once is put back; one that is
// not there is left alone; one there more than once → null.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'
const fs = require('fs'), path = require('path')
const EDITS = require('./fixtures/till-pack-5-6-legal-edits.json')

function undoCode(file, src) {
  // ⚠️ RE-PINNED (privacy-processors-1, 27 November 2026, docs/privacy-processors-1-report.md): the newer round's legal edit (section 6's
  // Anthropic and Namecheap rows, the transfers clauses, the date 27 November 2026, TERMS_VERSION) is taken back FIRST — newest change first.
  src = require('./_named-privacy-processors-1.cjs').undoCode(file, src)
  if (src === null) return null
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
  if (r === null) throw new Error(`till-pack-5-6: ${file} — an edit is neither there exactly once nor already taken back`)
  return r
}
/** True on a tree with this round's legal change. */
// ⚠️ RE-PINNED (privacy-processors-1, 27 November 2026): this round's change is also there when a newer round has moved the date on (the
// shown date and lastmod below are then the newest round's, which carries this round's line too).
const PP1 = require('./_named-privacy-processors-1.cjs')
const LANDED = PP1.LANDED || (() => { try { return /export const PRIVACY_UPDATED = '25 November 2026'/.test(fs.readFileSync(path.join(__dirname, '..', 'lib/legal.ts'), 'utf8')) } catch { return false } })()
/** The sitemap's /privacy lastmod (English and every translated address carry the English date). */
const LASTMOD = { privacy: ['2026-11-24T00:00:00.000Z', PP1.LANDED ? PP1.LASTMOD.privacy[1] : '2026-11-25T00:00:00.000Z'] }
function sitemapLegal(v) {
  if (!Array.isArray(v)) return v
  return v.map(e => {
    if (!e || typeof e.url !== 'string') return e
    for (const [doc, [was, now]] of Object.entries(LASTMOD)) if (new RegExp(`/${doc}$`).test(e.url) && e.lastModified === was) return { ...e, lastModified: now }
    return e
  })
}
/** The shown date of /privacy (the English and every translation carry the English "Last updated"). */
const PRIVACY_DATE = ['24 November 2026', PP1.LANDED ? PP1.PRIVACY_DATE[1] : '25 November 2026']
/** The named item for the harnesses that list one per view — PRECISE: it must change the view. */
const ITEMS = !LANDED ? [] : [{ id: 'till-pack-5-6-privacy-lastmod',
  what: '⚠️ RE-PINNED (till-pack-5-6, 25 November 2026): the HatchGrab sitemap’s /privacy lastmod is 2026-11-25 (lib/legal.ts PRIVACY_UPDATED: section 7’s accounting-records line, Part C)',
  views: id => /^parts\/sitemap\|(GB|US)\|hatchgrab/.test(id),
  apply: (id, v) => { const r = sitemapLegal(v); if (JSON.stringify(r) === JSON.stringify(v)) throw new Error('till-pack-5-6-privacy-lastmod: nothing to change in ' + id); return r } }]

module.exports = { EDITED_FILES: Object.keys(EDITS), undoCode, asBefore, LANDED, LASTMOD, sitemapLegal, PRIVACY_DATE, ITEMS }
