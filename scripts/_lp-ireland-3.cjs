// scripts/_lp-ireland-3.cjs — ⚠️ RE-PINNED (ireland-3, 21 October 2026): THE NAMED CHANGES OF ireland-3, shared by the
// language-phase harnesses (1c and 2 through scripts/_lp2-named.cjs; 1e through scripts/_lp1e-named.cjs; 1e-tidy). A MODULE.
//
// ireland-3 changed, ON PURPOSE (docs/ireland-3-report.md):
//   1. the Country-specific terms: the Ireland section added, re-dated 21 October 2026 — lib/legal.ts
//      COUNTRY_TERMS_UPDATED '21 October 2026', so the sitemap's /country-terms lastmod is 2026-10-21;
//   2. TERMS_VERSION '2026-10-21' (the latest of the three documents' dates), so signup records terms_version
//      '2026-10-21'.
// Each a PRECISE transform, applied AFTER pricing-tidy's (scripts/_lp-pricing-tidy.cjs), which takes the BEFORE values
// to 2026-10-20 first.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')
const { must } = require('./_lp-pricing-tidy.cjs')

/** True on a tree with ireland-3 (lib/legal.ts's Terms version 2026-10-21 or later). */
const LANDED = (() => { try { const m = /TERMS_VERSION\s*=\s*'(\d{4}-\d{2}-\d{2})'/.exec(fs.readFileSync(path.join(REPO, 'lib/legal.ts'), 'utf8')); return !!m && m[1] >= '2026-10-21' } catch { return false } })()

// ── 1 · the Terms' version ────────────────────────────────────────────────────────────────────────────────────────────
const TERMS_VERSION_OLD = '2026-10-20', TERMS_VERSION_NEW = '2026-10-21'
/** Every `terms_version` field (at any depth, inside JSON strings too, each re-encoded as it was) '2026-10-20' → '2026-10-21'. */
function termsVersion(v) {
  if (typeof v === 'string') {
    if ((v[0] === '{' || v[0] === '[') && /[}\]]$/.test(v)) { try { const p = JSON.parse(v); if (JSON.stringify(p) === v) return JSON.stringify(termsVersion(p)) } catch { /* not JSON */ } }
    return v
  }
  if (Array.isArray(v)) return v.map(termsVersion)
  if (!v || typeof v !== 'object') return v
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'terms_version' && x === TERMS_VERSION_OLD ? TERMS_VERSION_NEW : termsVersion(x)]))
}

// ── 2 · the Country-specific terms' date ──────────────────────────────────────────────────────────────────────────────
const COUNTRY_TERMS_LASTMOD_OLD = '2026-10-19T00:00:00.000Z', COUNTRY_TERMS_LASTMOD_NEW = '2026-10-21T00:00:00.000Z'
/** The HatchGrab sitemap's /country-terms entry: lastmod 2026-10-19 → 2026-10-21 (/privacy and /terms unchanged). */
function sitemapCountryTerms(v) {
  if (!Array.isArray(v)) return v
  return v.map(e => (e && e.url === 'https://www.hatchgrab.com/country-terms' && e.lastModified === COUNTRY_TERMS_LASTMOD_OLD ? { ...e, lastModified: COUNTRY_TERMS_LASTMOD_NEW } : e))
}

/** The sitemap item, for the harnesses that list named items per view (1e, 1e-tidy) — after pricing-tidy's. */
const ITEMS = !LANDED ? [] : [
  { id: 'ireland-3-country-terms-lastmod', what: '⚠️ RE-PINNED (ireland-3, 21 October 2026): the HatchGrab sitemap’s /country-terms lastmod is 2026-10-21 (lib/legal.ts COUNTRY_TERMS_UPDATED, the Ireland section added); /privacy and /terms keep theirs — PRECISE, the one entry',
    views: id => /^parts\/sitemap\|(GB|US)\|hatchgrab/.test(id), apply: (id, v) => must('ireland-3-country-terms-lastmod', sitemapCountryTerms)(v) },
]

module.exports = { ITEMS, LANDED, termsVersion, TERMS_VERSION_OLD, TERMS_VERSION_NEW, sitemapCountryTerms, COUNTRY_TERMS_LASTMOD_OLD, COUNTRY_TERMS_LASTMOD_NEW }
