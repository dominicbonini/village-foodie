// scripts/_named-france-privacy-1.cjs — france-privacy-1's English edits (24 November 2026, docs/france-privacy-1-report.md), named so
// the byte-identity harnesses can take them back EXACTLY:
//   • content/legal/privacy-policy.md — one policy for every country: the intro paragraph ("This policy applies wherever you are."),
//     section 4's "Allergy and dietary notes.", section 6's transfer sentence, section 8 rewritten, the date 4 → 24 November 2026;
//   • content/legal/country-specific-terms.md — every "### Privacy, for everyone in …" part deleted (16), the three intro paragraphs
//     (the Privacy Policy is the same in every country), the date 1 → 24 November 2026;
//   • lib/legal.ts — PRIVACY_UPDATED, COUNTRY_TERMS_UPDATED, TERMS_VERSION ('2026-11-19' → '2026-11-24') and two doc comments.
// Pairs [now, before] in scripts/fixtures/france-privacy-1-legal-edits.json (generated from the diff against ec16f022, this prompt's
// starting commit, and checked to give it back byte for byte). CHAINED FIRST by scripts/_named-terms-postpay-1.cjs undoCode (newest
// change first), so every helper that takes the older rounds back takes this one back too. IDEMPOTENT, with the same rule: a pair whose
// `now` is there exactly once is put back; one that is not there is left alone; one there more than once → null.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'
const fs = require('fs'), path = require('path')
const EDITS = require('./fixtures/france-privacy-1-legal-edits.json')

function undoCode(file, src) {
  // ⚠️ RE-PINNED (till-pack-5-6, 25 November 2026, docs/till-pack-5-6-report.md §8): the newer round's legal edit (the Privacy Policy's
  // accounting-records line in English and the 54 used bases, its date, PRIVACY_UPDATED) is taken back FIRST, by name — newest change
  // first, the chain's own rule — so every helper that calls this one sees the legal files as they were before it.
  src = require('./_named-till-pack-5-6.cjs').undoCode(file, src)
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
  if (r === null) throw new Error(`france-privacy-1: ${file} — an edit is neither there exactly once nor already taken back`)
  return r
}

/** True on a tree with this round's legal change. */
const LANDED = (() => { try { return /export const COUNTRY_TERMS_UPDATED = '24 November 2026'/.test(fs.readFileSync(path.join(__dirname, '..', 'lib/legal.ts'), 'utf8')) } catch { return false } })()
const TERMS_VERSION_OLD = '2026-11-19', TERMS_VERSION_NEW = '2026-11-24'
const LASTMOD = {   // the sitemap's lastmod for the two documents (English and every translated address — they carry the English date)
  privacy: ['2026-11-04T00:00:00.000Z', '2026-11-24T00:00:00.000Z'],
  'country-terms': ['2026-11-01T00:00:00.000Z', '2026-11-24T00:00:00.000Z'],
}
/** A sitemap with this round's two lastmods moved (every other entry unchanged). */
function sitemapLegal(v) {
  if (!Array.isArray(v)) return v
  return v.map(e => {
    if (!e || typeof e.url !== 'string') return e
    for (const [doc, [was, now]] of Object.entries(LASTMOD)) {
      if (new RegExp(`/${doc}$`).test(e.url) && e.lastModified === was) return { ...e, lastModified: now }
    }
    return e
  })
}
/** Every `terms_version` field (at any depth, inside JSON strings too) '2026-11-19' → '2026-11-24'. */
function termsVersion(v) {
  if (typeof v === 'string') {
    if ((v[0] === '{' || v[0] === '[') && /[}\]]$/.test(v)) { try { const p = JSON.parse(v); if (JSON.stringify(p) === v) return JSON.stringify(termsVersion(p)) } catch { /* not JSON */ } }
    return v
  }
  if (Array.isArray(v)) return v.map(termsVersion)
  if (!v || typeof v !== 'object') return v
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'terms_version' && x === TERMS_VERSION_OLD ? TERMS_VERSION_NEW : termsVersion(x)]))
}
/** The named item for the harnesses that list one per view — PRECISE: it must change the view. */
const ITEMS = !LANDED ? [] : [{ id: 'france-privacy-1-legal-lastmod',
  what: '⚠️ RE-PINNED (france-privacy-1, 24 November 2026): the HatchGrab sitemap’s /privacy and /country-terms lastmod are 2026-11-24 (lib/legal.ts PRIVACY_UPDATED, COUNTRY_TERMS_UPDATED: one privacy policy for every country)',
  views: id => /^parts\/sitemap\|(GB|US)\|hatchgrab/.test(id),
  apply: (id, v) => { const r = sitemapLegal(v); if (JSON.stringify(r) === JSON.stringify(v)) throw new Error('france-privacy-1-legal-lastmod: nothing to change in ' + id); return r } }]

// ── the translations: france-privacy-1 changed privacy-policy.md and country-specific-terms.md in the 54 used bases (the parts named in
// scripts/france-privacy-1.cjs §C, which proves each file is START plus exactly those parts) and left the 5 unused bases on START's bytes ──
const START = 'ec16f022'
const UNUSED_BASES = ['vi-VN', 'hi-IN', 'ur-PK', 'fil-PH', 'ta-LK']
/** A translation as it was at START (null when it did not exist), for the harnesses that measure an older round's change in it. */
function translationAtStart(locale, file) {
  try { return require('child_process').execFileSync('git', ['show', `${START}:content/legal/${locale}/${file}`], { cwd: path.join(__dirname, '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) } catch { return null }
}
/** True for a line of today's translation that france-privacy-1 introduced (it is not in START's text of the file). */
const isNewLine = (locale, file, line) => { const t = translationAtStart(locale, file); return LANDED && t !== null && !t.split('\n').includes(line) }

module.exports = { START, UNUSED_BASES, translationAtStart, isNewLine, EDITED_FILES: Object.keys(EDITS), undoCode, asBefore, LANDED, LASTMOD, sitemapLegal, termsVersion, TERMS_VERSION_OLD, TERMS_VERSION_NEW, ITEMS }
