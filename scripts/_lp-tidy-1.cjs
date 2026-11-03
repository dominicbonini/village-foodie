// scripts/_lp-tidy-1.cjs — tidy-1's named change to the public truck page ON THE HATCHGRAB HOST (3 November 2026; docs/tidy-1-report.md),
// for the harnesses that compare that page with a tree from before it. scripts/tidy-1.cjs §1 proves it, and that Village Foodie's truck
// page is byte-identical.
//
//   hgTruck(html)   the truck page as served on hatchgrab.com before tidy-1 → as served after it: the Tally script goes, and where Village
//                   Foodie's prompts showed (a UK truck), so do the floating weekly-schedule button and the footer's newsletter block
//                   (its title, text, call to action and "no spam" line) — every piece exactly once, or it throws. The footer's links stay.
//   ITEMS           for the harnesses that list named items per view (1e, 1e-tidy): parts/truck|<CC>|html* — PRECISE (hgTruck); and
//                   (item 3) the HatchGrab sitemap's /privacy lastmod 2026-11-02 → 2026-11-03
//   item 3 — the Privacy Policy's demo-section wording ("simple counts"; the two "If you sign up" sentences merged), its date
//   2 → 3 November 2026, PRIVACY_UPDATED and TERMS_VERSION ('2026-11-02' → '2026-11-03'):
//   asBefore(file, text) the English Privacy Policy or lib/legal.ts back to its bytes before tidy-1 (throws if a change is not there
//                   exactly once); chained FIRST by scripts/_lp-contact-1.cjs (newest change first), so every harness that pins the legal
//                   files' older bytes takes tidy-1 back exactly, by name. termsVersion: a new account's terms_version, the same move.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'
// The Tally script as next/script prerenders it — with its data-strategy, or without it where a harness's next/script stub omits it.
const TALLY_SCRIPT = /<script data-src="https:\/\/tally\.so\/widgets\/embed\.js"(?: data-strategy="afterInteractive")?><\/script>/g
const FLOATING = /<div class="fixed bottom-6 left-0 right-0 flex justify-center z-40 pointer-events-none"><button class="pointer-events-auto[^"]*">[\s\S]*?<\/button><\/div>/g
const NEWSLETTER = /<h3 class="text-white font-bold text-lg mb-2">[^<]*<\/h3><p class="text-sm mb-4">[^<]*<\/p><button class="inline-block bg-orange-600 hover:bg-orange-500 text-white font-bold py-2 px-6 rounded-full transition-colors">[^<]*<\/button>/g
const NO_SPAM = /(<div class="text-\[10px\] mt-2 flex flex-col gap-2 items-center">)<p>[^<]*<\/p>/g

/** True on a tree with tidy-1 (the truck page takes `tally`). */
const LANDED = (() => { try { return /tally = true \}: \{/.test(require('fs').readFileSync(require('path').join(__dirname, '..', 'app/trucks/[slug]/TruckClient.tsx'), 'utf8')) } catch { return false } })()

// ── item 3 · the Privacy Policy's demo-section wording ─────────────────────────────────────────────────────────────────────────
const PRIVACY_EDITS = [
  ["If you sign up, we keep the demo record for up to 30 days so your menu can move into your account, then delete it. If you sign up, your menu moves into your account, and your account's privacy terms apply from then on.",
    "If you sign up, your menu moves into your account and your account's privacy terms apply from then on; we keep the demo record for up to 30 days so the menu can move across, then delete it."],
  ['We keep anonymous counts of how far demos get', 'We keep simple counts of how far demos get'],
  ['**Last updated:** 2 November 2026', '**Last updated:** 3 November 2026'],
]
const PRIVACY_DATE_OLD = '2 November 2026', PRIVACY_DATE_NEW = '3 November 2026', TERMS_VERSION_OLD = '2026-11-02', TERMS_VERSION_NEW = '2026-11-03'
const LEGAL_TS_EDITS = [
  [`export const PRIVACY_UPDATED = '${PRIVACY_DATE_OLD}'`, `export const PRIVACY_UPDATED = '${PRIVACY_DATE_NEW}'`],
  [` *  terms dated above — the latest of them; 2 November 2026 since the Privacy Policy's contact-form paragraph (contact-1: HatchGrab's\n *  own form, emailed through Brevo, kept up to 24 months), 1 November 2026`,
    ` *  terms dated above — the latest of them; 3 November 2026 since the Privacy Policy's demo-section wording (tidy-1: "simple counts",\n *  the two "If you sign up" sentences merged), 2 November 2026 for its contact-form paragraph (contact-1: HatchGrab's\n *  own form, emailed through Brevo, kept up to 24 months) before that, 1 November 2026`],
  [`export const TERMS_VERSION = '${TERMS_VERSION_OLD}'`, `export const TERMS_VERSION = '${TERMS_VERSION_NEW}'`],
]
const LEGAL_LANDED = (() => { try { const m = /TERMS_VERSION\s*=\s*'(\d{4}-\d{2}-\d{2})'/.exec(require('fs').readFileSync(require('path').join(__dirname, '..', 'lib/legal.ts'), 'utf8')); return !!m && m[1] >= TERMS_VERSION_NEW } catch { return false } })()
const once = (s, a, what) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`tidy-1: ${what} — expected once, found ${n}: ${a.slice(0, 80)}`) }
const back = (edits, what) => text => edits.reduce((s, [a, b]) => { once(s, b, what); return s.replace(b, a) }, text)
function asBefore(file, text) {
  if (!LEGAL_LANDED) return text
  if (file === 'content/legal/privacy-policy.md') return back(PRIVACY_EDITS, 'Privacy Policy edit')(text)
  if (file === 'lib/legal.ts') return back(LEGAL_TS_EDITS, 'lib/legal.ts edit')(text)
  return text
}
/** Every `terms_version` field (at any depth, inside JSON strings too) '2026-11-02' → '2026-11-03'. */
function termsVersion(v) {
  if (typeof v === 'string') {
    if ((v[0] === '{' || v[0] === '[') && /[}\]]$/.test(v)) { try { const p = JSON.parse(v); if (JSON.stringify(p) === v) return JSON.stringify(termsVersion(p)) } catch { /* not JSON */ } }
    return v
  }
  if (Array.isArray(v)) return v.map(termsVersion)
  if (!v || typeof v !== 'object') return v
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'terms_version' && x === TERMS_VERSION_OLD ? TERMS_VERSION_NEW : termsVersion(x)]))
}
const PRIVACY_LASTMOD_OLD = '2026-11-02T00:00:00.000Z', PRIVACY_LASTMOD_NEW = '2026-11-03T00:00:00.000Z'
function sitemapPrivacy(v) {
  if (!Array.isArray(v)) return v
  return v.map(e => (e && e.url === 'https://www.hatchgrab.com/privacy' && e.lastModified === PRIVACY_LASTMOD_OLD ? { ...e, lastModified: PRIVACY_LASTMOD_NEW } : e))
}

const count = (s, re) => (s.match(re) || []).length
function hgTruck(html) {
  if (typeof html !== 'string') return html
  if (count(html, TALLY_SCRIPT) !== 1) throw new Error('tidy-1: the truck page\'s Tally script is not there exactly once')
  const prompts = count(html, FLOATING)
  if (prompts > 1 || count(html, NEWSLETTER) !== prompts || count(html, NO_SPAM) !== prompts) throw new Error(`tidy-1: the weekly-schedule button, the newsletter block and the "no spam" line are not there together (${prompts} / ${count(html, NEWSLETTER)} / ${count(html, NO_SPAM)})`)
  return html.replace(TALLY_SCRIPT, '').replace(FLOATING, '').replace(NEWSLETTER, '').replace(NO_SPAM, '$1')
}

const { must } = require('./_lp-pricing-tidy.cjs')
const TRUCK_VIEWS = /^parts\/truck\|(GB|US)\|html/
const ITEMS = !LANDED ? [] : [
  { id: 'tidy-1-hg-truck-no-tally', what: '⚠️ RE-PINNED (tidy-1, 3 November 2026): the truck page on the HatchGrab host loads no Tally — its script goes, and on a UK truck so do Village Foodie’s floating weekly-schedule button and the footer’s newsletter block (form 81xAKx); the footer’s links stay — PRECISE (hgTruck); Village Foodie’s own truck page is byte-identical (scripts/tidy-1.cjs)',
    views: id => TRUCK_VIEWS.test(id), apply: (id, v) => must('tidy-1-hg-truck-no-tally', hgTruck)(v) },
  ...(!LEGAL_LANDED ? [] : [{ id: 'tidy-1-privacy-lastmod', what: '⚠️ RE-PINNED (tidy-1, 3 November 2026): the HatchGrab sitemap’s /privacy lastmod is 2026-11-03 (lib/legal.ts PRIVACY_UPDATED, the demo-section wording tidied); /terms and /country-terms keep theirs — PRECISE, the one entry',
    views: id => /^parts\/sitemap\|(GB|US)\|hatchgrab/.test(id), apply: (id, v) => must('tidy-1-privacy-lastmod', sitemapPrivacy)(v) }]),
]

module.exports = { LANDED, hgTruck, TRUCK_VIEWS, ITEMS, TALLY_SCRIPT, LEGAL_LANDED, asBefore, termsVersion, sitemapPrivacy, PRIVACY_EDITS, LEGAL_TS_EDITS,
  PRIVACY_DATE_OLD, PRIVACY_DATE_NEW, TERMS_VERSION_OLD, TERMS_VERSION_NEW, PRIVACY_LASTMOD_OLD, PRIVACY_LASTMOD_NEW }
