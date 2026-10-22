// scripts/_lp-anz-terms.cjs — ⚠️ RE-PINNED (anz-terms, 22 October 2026): THE NAMED DATE CHANGES OF anz-terms, shared by the
// language-phase harnesses (1c and 2 through scripts/_lp2-named.cjs; 1e through scripts/_lp1e-named.cjs; 1e-tidy) and
// plans-data-model. A MODULE.
//
// anz-terms changed, ON PURPOSE (docs/anz-terms-report.md):
//   1. the Country-specific terms: the Australia and New Zealand sections added, re-dated 22 October 2026 — lib/legal.ts
//      COUNTRY_TERMS_UPDATED '22 October 2026', so the sitemap's /country-terms lastmod is 2026-10-22;
//   2. TERMS_VERSION '2026-10-22' (the latest of the three documents' dates), so signup records terms_version '2026-10-22'.
// Each a PRECISE transform, applied AFTER ireland-3's (scripts/_lp-ireland-3.cjs), which takes the values to 2026-10-21 first.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')
const { must } = require('./_lp-pricing-tidy.cjs')

/** True on a tree with anz-terms (lib/legal.ts's Terms version 2026-10-22 or later). */
const LANDED = (() => { try { const m = /TERMS_VERSION\s*=\s*'(\d{4}-\d{2}-\d{2})'/.exec(fs.readFileSync(path.join(REPO, 'lib/legal.ts'), 'utf8')); return !!m && m[1] >= '2026-10-22' } catch { return false } })()

// ── 1 · the Terms' version ────────────────────────────────────────────────────────────────────────────────────────────
const TERMS_VERSION_OLD = '2026-10-21', TERMS_VERSION_NEW = '2026-10-22'
/** Every `terms_version` field (at any depth, inside JSON strings too, each re-encoded as it was) '2026-10-21' → '2026-10-22'. */
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
const COUNTRY_TERMS_LASTMOD_OLD = '2026-10-21T00:00:00.000Z', COUNTRY_TERMS_LASTMOD_NEW = '2026-10-22T00:00:00.000Z'
/** The HatchGrab sitemap's /country-terms entry: lastmod 2026-10-21 → 2026-10-22 (/privacy and /terms unchanged). */
function sitemapCountryTerms(v) {
  if (!Array.isArray(v)) return v
  return v.map(e => (e && e.url === 'https://www.hatchgrab.com/country-terms' && e.lastModified === COUNTRY_TERMS_LASTMOD_OLD ? { ...e, lastModified: COUNTRY_TERMS_LASTMOD_NEW } : e))
}

/** The sitemap item, for the harnesses that list named items per view (1e, 1e-tidy) — after ireland-3's. */
const ITEMS = !LANDED ? [] : [
  { id: 'anz-terms-country-terms-lastmod', what: '⚠️ RE-PINNED (anz-terms, 22 October 2026): the HatchGrab sitemap’s /country-terms lastmod is 2026-10-22 (lib/legal.ts COUNTRY_TERMS_UPDATED, the Australia and New Zealand sections added); /privacy and /terms keep theirs — PRECISE, the one entry',
    views: id => /^parts\/sitemap\|(GB|US)\|hatchgrab/.test(id), apply: (id, v) => must('anz-terms-country-terms-lastmod', sitemapCountryTerms)(v) },
]

module.exports = { ITEMS, LANDED, termsVersion, TERMS_VERSION_OLD, TERMS_VERSION_NEW, sitemapCountryTerms, COUNTRY_TERMS_LASTMOD_OLD, COUNTRY_TERMS_LASTMOD_NEW }
