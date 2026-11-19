// scripts/_named-terms-postpay-1.cjs — terms-postpay-1's English edits (19 November 2026, docs/terms-postpay-1-report.md), named so the
// byte-identity harnesses can take them back EXACTLY: the Terms of Service's post-pay wording (content/legal/terms-and-conditions.md:
// the fee on every pre-order, monthly billing where it can't be taken from the payment, a card on file at the trial's end, the 5-day
// pause, the trial ending on Pay as you go, 30 days' notice, the date) and lib/legal.ts's TERMS_UPDATED / TERMS_VERSION / doc comment.
// Pairs [now, before] in scripts/fixtures/terms-postpay-1-code-edits.json (generated from the diff against the commit before this one).
// IDEMPOTENT, because several helpers in the chain call it (scripts/_lp-world-countries-2/-3, _lp-contact-1, _lp-tidy-1, _lp-paperwork-1):
// a pair whose `now` is there exactly once is put back; one that isn't there (already taken back, or a text from another ref) is left
// alone; one there more than once → null (the caller fails rather than guessing). Any other file is returned as it is.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'
const EDITS = require('./fixtures/terms-postpay-1-code-edits.json')

function undoCode(file, src) {
  const pairs = EDITS[file]
  if (!pairs || typeof src !== 'string') return src
  let out = src
  for (const [now, before] of pairs) {
    const n = out.split(now).length - 1
    if (n === 1) { out = out.replace(now, () => before); continue }
    if (n === 0) continue   // already taken back, or a text from before this round (another ref) — nothing of ours to take back
    return null             // there more than once: can't tell which
  }
  return out
}
/** For the helpers' asBefore: the text with this round's edits taken back, THROWING when they can't be accounted for. */
function asBefore(file, text) {
  const r = undoCode(file, text)
  if (r === null) throw new Error(`terms-postpay-1: ${file} — an edit is neither there exactly once nor already taken back`)
  return r
}

// ── the sitemap's /terms lastmod (lib/legal.ts TERMS_UPDATED 1 → 19 November 2026) ──────────────────────────────────────────
const fs = require('fs'), path = require('path')
/** True on a tree with this round's terms (TERMS_UPDATED '19 November 2026'). */
const LANDED = (() => { try { return /export const TERMS_UPDATED = '19 November 2026'/.test(fs.readFileSync(path.join(__dirname, '..', 'lib/legal.ts'), 'utf8')) } catch { return false } })()
const TERMS_LASTMOD_OLD = '2026-11-01T00:00:00.000Z', TERMS_LASTMOD_NEW = '2026-11-19T00:00:00.000Z'
/** The HatchGrab sitemap: /terms 2026-11-01 → 2026-11-19 (everything else unchanged). */
function sitemapTerms(v) {
  if (!Array.isArray(v)) return v
  return v.map(e => (e && e.url === 'https://www.hatchgrab.com/terms' && e.lastModified === TERMS_LASTMOD_OLD ? { ...e, lastModified: TERMS_LASTMOD_NEW } : e))
}
/** The named item for the harnesses that list one per view (language-phase-1e-tidy) — PRECISE: it must change the view. */
const ITEMS = !LANDED ? [] : [{ id: 'terms-postpay-1-terms-lastmod',
  what: '⚠️ RE-PINNED (terms-postpay-1, 19 November 2026): the HatchGrab sitemap’s /terms lastmod is 2026-11-19 (lib/legal.ts TERMS_UPDATED, the post-pay Terms)',
  views: id => /^parts\/sitemap\|(GB|US)\|hatchgrab/.test(id),
  apply: (id, v) => { const r = sitemapTerms(v); if (JSON.stringify(r) === JSON.stringify(v)) throw new Error('terms-postpay-1-terms-lastmod: nothing to change in ' + id); return r } }]

module.exports = { EDITED_FILES: Object.keys(EDITS), undoCode, asBefore, LANDED, TERMS_LASTMOD_OLD, TERMS_LASTMOD_NEW, sitemapTerms, ITEMS }
