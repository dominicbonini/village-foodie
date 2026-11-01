// scripts/_lp-world-countries-2.cjs — ⚠️ RE-PINNED (world-countries-2, 1 November 2026): THE NAMED LEGAL CHANGES OF
// world-countries-2 (docs/world-countries-2-report.md §1), shared by every harness that pins the legal documents' bytes or
// dates (legal-follow-ups, anz-terms, canada-2, europe-settings, france-1, ireland-3, us-legal-draft), the language-phase
// harnesses (1c and 2 through scripts/_lp2-named.cjs; 1e through scripts/_lp1e-named.cjs; 1e-tidy), plans-data-model and
// world-countries-1-identity. A MODULE.
//
// world-countries-2 changed, ON PURPOSE (Dominic's decision on world-countries-1 flag F2):
//   1. the Terms of Service §4: wherever it promised "our plan with no monthly fee" (one plan has none; a finished trial,
//      a cancellation and a failed payment move to it), it now says the account moves to the plan shown for its country on
//      our pricing page, which in most countries has no monthly fee — still naming no plan or price (the V16.2 rule). Six
//      sentences (TERMS_EDITS, written out so a later edit shows up as a failure), and the date: 20 October → 1 November 2026;
//   2. the Country-specific terms: eight sections appended after Gibraltar — Brazil, Mexico, Japan, Singapore, Hong Kong,
//      Malaysia, Thailand, the United Arab Emirates — and the date: 22 October → 1 November 2026;
//   3. lib/legal.ts: TERMS_UPDATED and COUNTRY_TERMS_UPDATED '1 November 2026' (the legal-date rule moves each with its
//      document's own line), TERMS_VERSION '2026-11-01' (the latest of the three documents' dates); PRIVACY_UPDATED unchanged.
//      So signup records terms_version '2026-11-01', and the sitemap's /terms and /country-terms lastmod are 2026-11-01.
// Each a PRECISE transform, applied AFTER demo-2b's (scripts/_lp-demo2b.cjs), which takes terms_version to 2026-10-31.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')
const { must } = require('./_lp-pricing-tidy.cjs')

/** True on a tree with world-countries-2 (lib/legal.ts's Terms version 2026-11-01 or later). */
const LANDED = (() => { try { const m = /TERMS_VERSION\s*=\s*'(\d{4}-\d{2}-\d{2})'/.exec(fs.readFileSync(path.join(REPO, 'lib/legal.ts'), 'utf8')); return !!m && m[1] >= '2026-11-01' } catch { return false } })()

const NEW_DATE = '1 November 2026'
const TERMS_DATE_OLD = '20 October 2026', COUNTRY_TERMS_DATE_OLD = '22 October 2026'

// ── 1 · the Terms of Service ──────────────────────────────────────────────────────────────────────────────────────────
/** [before, after] — each applied exactly once. */
const TERMS_EDITS = [
  [`**Last updated:** ${TERMS_DATE_OLD}`, `**Last updated:** ${NEW_DATE}`],
  ['are shown on our website and in the app. One plan has no monthly fee. Prices are in your local currency.',
    'are shown on our website and in the app. Which plans we offer depends on your country, and in most countries one of them has no monthly fee. Prices are in your local currency.'],
  ['At the end of the trial your account moves to our plan with no monthly fee unless you have chosen another plan.',
    'At the end of the trial your account moves to the plan shown for your country on our pricing page, unless you have chosen another plan. In most countries that plan has no monthly fee.'],
  ['You keep full access until the end of the period you have paid for, then move to our plan with no monthly fee.',
    'You keep full access until the end of the period you have paid for, then move to the plan shown for your country on our pricing page, which in most countries has no monthly fee.'],
  ['**If a payment fails or is not made, your account moves to our plan with no monthly fee.** We do not lock you out.',
    '**If a payment fails or is not made, your account moves to the plan shown for your country on our pricing page, which in most countries has no monthly fee.** We do not lock you out.'],
  ['If a payment is not made within **7 days** of its due date, your account moves to the plan with no monthly fee. You keep your account, your menu, your orders and your data, and you can carry on taking orders and using the kitchen screen and dashboard. You lose the features that plan does not include, and that plan\'s fee on online card orders applies.',
    'If a payment is not made within **7 days** of its due date, your account moves to that plan. You keep your account, your menu, your orders and your data, and you can carry on taking orders and using the kitchen screen and dashboard. You lose any features that plan does not include, and that plan\'s fee on online card orders applies, if it has one.'],
]
const once = (s, a, what) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`world-countries-2: ${what} — expected once, found ${n}: ${a.slice(0, 80)}`) }
/** The Terms of Service as world-countries-2 left it, from its text before (throws on a stale anchor). */
function applyTerms(text) {
  return TERMS_EDITS.reduce((s, [a, b]) => { once(s, a, 'Terms edit'); return s.replace(a, b) }, text)
}
/** The other way: today's Terms back to their text before world-countries-2 (for a harness that pins the older bytes). */
function unapplyTerms(text) {
  return TERMS_EDITS.reduce((s, [a, b]) => { once(s, b, 'Terms edit (reverse)'); return s.replace(b, a) }, text)
}

// ── 2 · the Country-specific terms ────────────────────────────────────────────────────────────────────────────────────
const COUNTRIES = ['Brazil', 'Mexico', 'Japan', 'Singapore', 'Hong Kong', 'Malaysia', 'Thailand', 'United Arab Emirates']
const UNLIMITED_ONLY = ['Brazil', 'Mexico', 'Singapore', 'Malaysia', 'Thailand']
const FIRST = '\n\n## Brazil\n'
/** The eight sections exactly as today's page carries them (from "## Brazil" to the end). */
function sectionsOf(text) { once(text, FIRST, 'the eight sections'); return text.slice(text.indexOf(FIRST) + 2) }
/** BEFORE (a page that ends at Gibraltar, dated 22 October 2026) → today's page: the date moved, the eight sections appended
 *  (the sections themselves are checked by scripts/world-countries-2.cjs, not here). */
function applyCountryTerms(before, today) {
  once(before, `**Last updated:** ${COUNTRY_TERMS_DATE_OLD}`, 'Country-specific terms date (before)')
  return before.replace(`**Last updated:** ${COUNTRY_TERMS_DATE_OLD}`, `**Last updated:** ${NEW_DATE}`).replace(/\n*$/, '\n') + '\n' + sectionsOf(today)
}

// ── 3 · the Terms' version ────────────────────────────────────────────────────────────────────────────────────────────
const TERMS_VERSION_OLD = '2026-10-31', TERMS_VERSION_NEW = '2026-11-01'
/** Every `terms_version` field (at any depth, inside JSON strings too, each re-encoded as it was) '2026-10-31' → '2026-11-01'. */
function termsVersion(v) {
  if (typeof v === 'string') {
    if ((v[0] === '{' || v[0] === '[') && /[}\]]$/.test(v)) { try { const p = JSON.parse(v); if (JSON.stringify(p) === v) return JSON.stringify(termsVersion(p)) } catch { /* not JSON */ } }
    return v
  }
  if (Array.isArray(v)) return v.map(termsVersion)
  if (!v || typeof v !== 'object') return v
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'terms_version' && x === TERMS_VERSION_OLD ? TERMS_VERSION_NEW : termsVersion(x)]))
}

// ── 4 · the sitemap's /terms and /country-terms lastmod ───────────────────────────────────────────────────────────────
const LASTMOD_NEW = '2026-11-01T00:00:00.000Z'
const TERMS_LASTMOD_OLD = '2026-10-20T00:00:00.000Z', COUNTRY_TERMS_LASTMOD_OLD = '2026-10-22T00:00:00.000Z'
/** The HatchGrab sitemap: /terms 2026-10-20 → 2026-11-01 and /country-terms 2026-10-22 → 2026-11-01 (/privacy unchanged). */
function sitemapLegal(v) {
  if (!Array.isArray(v)) return v
  return v.map(e => !e ? e
    : e.url === 'https://www.hatchgrab.com/terms' && e.lastModified === TERMS_LASTMOD_OLD ? { ...e, lastModified: LASTMOD_NEW }
    : e.url === 'https://www.hatchgrab.com/country-terms' && e.lastModified === COUNTRY_TERMS_LASTMOD_OLD ? { ...e, lastModified: LASTMOD_NEW }
    : e)
}

/** The sitemap item, for the harnesses that list named items per view (1e, 1e-tidy) — after demo-2b's. */
const ITEMS = !LANDED ? [] : [
  { id: 'world-countries-2-legal-lastmod', what: '⚠️ RE-PINNED (world-countries-2, 1 November 2026): the HatchGrab sitemap’s /terms and /country-terms lastmod are 2026-11-01 (lib/legal.ts TERMS_UPDATED — Terms §4 — and COUNTRY_TERMS_UPDATED — the eight new countries); /privacy keeps its own — PRECISE, the one named sitemap change',
    views: id => /^parts\/sitemap\|(GB|US)\|hatchgrab/.test(id), apply: (id, v) => must('world-countries-2-legal-lastmod', sitemapLegal)(v) },
]

// ── 5 · any of the three files, back to its bytes before world-countries-2 ────────────────────────────────────────────
/** lib/legal.ts: [before, after], each exactly once — the two dates, the version, and its doc comment's newest line. */
const LEGAL_TS_EDITS = [
  [`export const TERMS_UPDATED = '${TERMS_DATE_OLD}'`, `export const TERMS_UPDATED = '${NEW_DATE}'`],
  [`export const COUNTRY_TERMS_UPDATED = '${COUNTRY_TERMS_DATE_OLD}'`, `export const COUNTRY_TERMS_UPDATED = '${NEW_DATE}'`],
  [` *  terms dated above — the latest of them; 31 October 2026 since the Privacy Policy's demo section (demo-2b),\n`,
    ` *  terms dated above — the latest of them; 1 November 2026 since the Terms' §4 (a finished trial moves to the plan shown for the\n *  country) and the Country-specific terms' eight new countries (world-countries-2), 31 October 2026 for the Privacy Policy's\n *  demo section (demo-2b) before that,\n`],
  [`export const TERMS_VERSION = '${TERMS_VERSION_OLD}'`, `export const TERMS_VERSION = '${TERMS_VERSION_NEW}'`],
]
/** Today's text of one of the three files world-countries-2 changed, back to its bytes before it — for a harness that pins the
 *  older bytes (each still proves "its old self", now as "its old self + exactly world-countries-2's named change"). Throws
 *  when the named change is not there exactly; any other file is returned as it is. */
function asBefore(file, text) {
  // ⚠️ RE-PINNED (world-countries-3, 1 November 2026): three later sentences (Mexico's authority, Terms §3's section number,
  // Canada's French line — scripts/_lp-world-countries-3.cjs) are taken back first, exactly, so "before world-countries-2" is
  // still every other byte of HEAD's text.
  text = require('./_lp-world-countries-3.cjs').asBefore(file, text)
  if (!LANDED) return text
  if (file === 'content/legal/terms-and-conditions.md') return unapplyTerms(text)
  if (file === 'content/legal/country-specific-terms.md') {
    once(text, FIRST, 'the eight sections'); once(text, `**Last updated:** ${NEW_DATE}`, 'Country-specific terms date')
    return text.slice(0, text.indexOf(FIRST)).replace(`**Last updated:** ${NEW_DATE}`, `**Last updated:** ${COUNTRY_TERMS_DATE_OLD}`) + '\n'
  }
  if (file === 'lib/legal.ts') return LEGAL_TS_EDITS.reduce((s, [a, b]) => { once(s, b, 'lib/legal.ts edit'); return s.replace(b, a) }, text)
  return text
}

module.exports = {
  asBefore,
  LANDED, NEW_DATE, TERMS_DATE_OLD, COUNTRY_TERMS_DATE_OLD, TERMS_EDITS, applyTerms, unapplyTerms, COUNTRIES, UNLIMITED_ONLY,
  sectionsOf, applyCountryTerms, termsVersion, TERMS_VERSION_OLD, TERMS_VERSION_NEW, sitemapLegal, LASTMOD_NEW,
  TERMS_LASTMOD_OLD, COUNTRY_TERMS_LASTMOD_OLD, ITEMS,
}
