// scripts/_lp-demo2b.cjs — ⚠️ RE-PINNED (demo-2b, 31 October 2026): THE NAMED DATE CHANGES OF demo-2b, shared by the
// language-phase harnesses (1c and 2 through scripts/_lp2-named.cjs; 1e through scripts/_lp1e-named.cjs; 1e-tidy) and
// plans-data-model. A MODULE.
//
// demo-2b changed, ON PURPOSE (docs/demo-2b-report.md):
//   1. the Privacy Policy: the "If you try the HatchGrab demo" section added (scripts/_demo2b-privacy.cjs names the text),
//      re-dated 31 October 2026 — lib/legal.ts PRIVACY_UPDATED '31 October 2026', so the sitemap's /privacy lastmod is
//      2026-10-31;
//   2. TERMS_VERSION '2026-10-31' (the latest of the three documents' dates), so signup records terms_version '2026-10-31'.
// Each a PRECISE transform, applied AFTER anz-terms' (scripts/_lp-anz-terms.cjs), which takes terms_version to 2026-10-22.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')
const { must } = require('./_lp-pricing-tidy.cjs')

/** True on a tree with demo-2b (lib/legal.ts's Terms version 2026-10-31 or later). */
const LANDED = (() => { try { const m = /TERMS_VERSION\s*=\s*'(\d{4}-\d{2}-\d{2})'/.exec(fs.readFileSync(path.join(REPO, 'lib/legal.ts'), 'utf8')); return !!m && m[1] >= '2026-10-31' } catch { return false } })()

// ── 1 · the Terms' version ────────────────────────────────────────────────────────────────────────────────────────────
const TERMS_VERSION_OLD = '2026-10-22', TERMS_VERSION_NEW = '2026-10-31'
/** Every `terms_version` field (at any depth, inside JSON strings too, each re-encoded as it was) '2026-10-22' → '2026-10-31'. */
function termsVersion(v) {
  if (typeof v === 'string') {
    if ((v[0] === '{' || v[0] === '[') && /[}\]]$/.test(v)) { try { const p = JSON.parse(v); if (JSON.stringify(p) === v) return JSON.stringify(termsVersion(p)) } catch { /* not JSON */ } }
    return v
  }
  if (Array.isArray(v)) return v.map(termsVersion)
  if (!v || typeof v !== 'object') return v
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'terms_version' && x === TERMS_VERSION_OLD ? TERMS_VERSION_NEW : termsVersion(x)]))
}

// ── 2 · the Privacy Policy's date ─────────────────────────────────────────────────────────────────────────────────────
const PRIVACY_LASTMOD_OLD = '2026-10-19T00:00:00.000Z', PRIVACY_LASTMOD_NEW = '2026-10-31T00:00:00.000Z'
/** The HatchGrab sitemap's /privacy entry: lastmod 2026-10-19 → 2026-10-31 (/terms and /country-terms unchanged). */
function sitemapPrivacy(v) {
  if (!Array.isArray(v)) return v
  return v.map(e => (e && e.url === 'https://www.hatchgrab.com/privacy' && e.lastModified === PRIVACY_LASTMOD_OLD ? { ...e, lastModified: PRIVACY_LASTMOD_NEW } : e))
}

/** The sitemap item, for the harnesses that list named items per view (1e, 1e-tidy) — after anz-terms'. */
const ITEMS = !LANDED ? [] : [
  { id: 'demo-2b-privacy-lastmod', what: '⚠️ RE-PINNED (demo-2b, 31 October 2026): the HatchGrab sitemap’s /privacy lastmod is 2026-10-31 (lib/legal.ts PRIVACY_UPDATED, the demo section added); /terms and /country-terms keep theirs — PRECISE, the one entry',
    views: id => /^parts\/sitemap\|(GB|US)\|hatchgrab/.test(id), apply: (id, v) => must('demo-2b-privacy-lastmod', sitemapPrivacy)(v) },
]

module.exports = { ITEMS, LANDED, termsVersion, TERMS_VERSION_OLD, TERMS_VERSION_NEW, sitemapPrivacy, PRIVACY_LASTMOD_OLD, PRIVACY_LASTMOD_NEW }
