// scripts/_lp-contact-1.cjs — contact-1's named legal change (2 November 2026; docs/contact-1-report.md), for the harnesses that
// compare the legal documents or dates with a tree from before it. scripts/contact-1.cjs §8 proves it is the whole English change.
//
//   PARA                 the Privacy Policy's new paragraph, the end of section 5 ("If you use our contact form")
//   privacyAsBefore(md)  today's English Privacy Policy back to its text before contact-1: the paragraph out, the date back to
//                        31 October 2026 (throws if either is not there exactly once)
//   the dates            PRIVACY_UPDATED 31 October → 2 November 2026; TERMS_VERSION '2026-11-01' → '2026-11-02' (it moves with the
//                        latest document — lib/legal.ts)
//   asBefore(file, text) either file contact-1 changed (the English Privacy Policy, lib/legal.ts) back to its bytes before it; any
//                        other file as it is. Chained FIRST by scripts/_lp-world-countries-2.cjs asBefore (newest change first), so
//                        every harness that pins the legal files' older bytes takes contact-1 back exactly, by name.
//   ITEMS                for the harnesses that list named items per view (1e, 1e-tidy): the HatchGrab sitemap's /privacy lastmod
//                        2026-10-31 → 2026-11-02 (PRECISE); and HatchGrab's /contact (GB, US) — STRUCTURAL (contactProof): the
//                        Tally script and the region from the form heading to the section's end (the Tally iframe) leave, the
//                        new form takes that region, and every other byte of the page is the same
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'

const PARA = '**If you use our contact form**\n\nIf you send us a message through the contact form on the HatchGrab website, we handle it ourselves: we keep your message and the details you enter, and send them to our team by email through Brevo. We use them only to reply to you, and keep them for up to 24 months. To stop the form being misused, we also keep a scrambled version of your IP address with your message.'
const PRIVACY_DATE_OLD = '31 October 2026', PRIVACY_DATE_NEW = '2 November 2026'
const TERMS_VERSION_OLD = '2026-11-01', TERMS_VERSION_NEW = '2026-11-02'

const once = (s, a, what) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`contact-1: ${what} — expected once, found ${n}: ${a.slice(0, 80)}`) }
function privacyAsBefore(md) {
  // ⚠️ RE-PINNED (tidy-1, 3 November 2026): tidy-1's later demo-section wording and date are taken back first (newest change first).
  md = require('./_lp-tidy-1.cjs').asBefore('content/legal/privacy-policy.md', md)
  once(md, `\n\n${PARA}\n\n---\n\n## 6.`, 'the contact-form paragraph')
  once(md, `**Last updated:** ${PRIVACY_DATE_NEW}`, 'the Privacy Policy date')
  return md.replace(`\n\n${PARA}\n\n---\n\n## 6.`, '\n\n---\n\n## 6.').replace(`**Last updated:** ${PRIVACY_DATE_NEW}`, `**Last updated:** ${PRIVACY_DATE_OLD}`)
}

/** lib/legal.ts: [before, after], each exactly once — the Privacy date, the version, and its doc comment's newest lines. */
const LEGAL_TS_EDITS = [
  [`export const PRIVACY_UPDATED = '${PRIVACY_DATE_OLD}'`, `export const PRIVACY_UPDATED = '${PRIVACY_DATE_NEW}'`],
  [` *  terms dated above — the latest of them; 1 November 2026 since the Terms' §4 (a finished trial moves to the plan shown for the\n *  country) and the Country-specific terms' eight new countries (world-countries-2), 31 October 2026 for the Privacy Policy's\n`,
    ` *  terms dated above — the latest of them; 2 November 2026 since the Privacy Policy's contact-form paragraph (contact-1: HatchGrab's\n *  own form, emailed through Brevo, kept up to 24 months), 1 November 2026 for the Terms' §4 (a finished trial moves to the plan shown for the\n *  country) and the Country-specific terms' eight new countries (world-countries-2) before that, 31 October 2026 for the Privacy Policy's\n`],
  [`export const TERMS_VERSION = '${TERMS_VERSION_OLD}'`, `export const TERMS_VERSION = '${TERMS_VERSION_NEW}'`],
]
/** True on a tree with contact-1 (lib/legal.ts's Terms version 2026-11-02 or later). */
const LANDED = (() => { try { const m = /TERMS_VERSION\s*=\s*'(\d{4}-\d{2}-\d{2})'/.exec(require('fs').readFileSync(require('path').join(__dirname, '..', 'lib/legal.ts'), 'utf8')); return !!m && m[1] >= TERMS_VERSION_NEW } catch { return false } })()
function asBefore(file, text) {
  if (!LANDED) return text
  if (file === 'content/legal/privacy-policy.md') return privacyAsBefore(text)   // tidy-1's change first, inside it
  if (file === 'lib/legal.ts') text = require('./_lp-tidy-1.cjs').asBefore(file, text)   // ⚠️ RE-PINNED (tidy-1): newest first
  if (file === 'lib/legal.ts') return LEGAL_TS_EDITS.reduce((s, [a, b]) => { once(s, b, 'lib/legal.ts edit'); return s.replace(b, a) }, text)
  return text
}

// ── the 1e views ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const PRIVACY_LASTMOD_OLD = '2026-10-31T00:00:00.000Z', PRIVACY_LASTMOD_NEW = '2026-11-02T00:00:00.000Z'
/** The HatchGrab sitemap's /privacy entry: lastmod 2026-10-31 → 2026-11-02 (/terms and /country-terms unchanged). */
function sitemapPrivacy(v) {
  if (!Array.isArray(v)) return v
  return v.map(e => (e && e.url === 'https://www.hatchgrab.com/privacy' && e.lastModified === PRIVACY_LASTMOD_OLD ? { ...e, lastModified: PRIVACY_LASTMOD_NEW } : e))
}
const TALLY_SCRIPT = '<script data-src="https://tally.so/widgets/embed.js" data-strategy="lazyOnload"></script>'
/** From the second "does-item" (the form heading) to the end of its section: the part of /contact contact-1 replaced. */
function formRegion(html) {
  const first = html.indexOf('<div class="does-item">'), start = first < 0 ? -1 : html.indexOf('<div class="does-item">', first + 1)
  const end = start < 0 ? -1 : html.indexOf('</section>', start)
  return start < 0 || end < 0 ? null : { start, end, text: html.slice(start, end) }
}
/** HatchGrab's /contact, BEFORE (+ its named items) against AFTER → { ok, problems }. */
function contactProof(before, after) {
  const problems = []
  if (typeof before !== 'string' || typeof after !== 'string') return { ok: false, problems: ['not HTML'] }
  // ⚠️ RE-PINNED (site-chrome-1, 5 November 2026): /contact wears the ONE shared header and footer. Its chrome is swapped back to BEFORE's
  // (scripts/_lp-site-chrome-1.cjs contactChromeBack, which checks it is the shared frame's) so this proof still compares every byte of
  // the page's body.
  const SC1 = require('./_lp-site-chrome-1.cjs')   // eslint-disable-line @typescript-eslint/no-require-imports -- CommonJS harness module (site-chrome-1)
  if (SC1.LANDED) { const sw = SC1.contactChromeBack(before, after, TALLY_SCRIPT); problems.push(...sw.problems); after = sw.after }
  if (before.split(TALLY_SCRIPT).length !== 2) problems.push('BEFORE: the Tally script is not there exactly once')
  const b = formRegion(before.replace(TALLY_SCRIPT, '')), a = formRegion(after)
  if (!b || !a) return { ok: false, problems: [...problems, 'the form region (the second .does-item to </section>) was not found'] }
  if (!/<iframe[^>]+src="https:\/\/tally\.so\/embed\/7R2Ra2/.test(b.text)) problems.push('BEFORE: no Tally iframe in the region')
  if (/tally/i.test(after)) problems.push('AFTER: Tally is still on the page')
  if (!a.text.startsWith('<div class="does-item"><h3>Or send us a message</h3></div></div>')) problems.push('AFTER: the heading is not "Or send us a message"')
  if (!/<form class="cf"/.test(a.text) || /<iframe/.test(a.text)) problems.push('AFTER: the region is not the form')
  const cutB = before.replace(TALLY_SCRIPT, '').slice(0, b.start) + '[form]' + before.replace(TALLY_SCRIPT, '').slice(b.end)
  const cutA = after.slice(0, a.start) + '[form]' + after.slice(a.end)
  if (cutB !== cutA) { let i = 0; while (i < cutB.length && cutB[i] === cutA[i]) i++; problems.push(`outside the form, the page differs @${i}: ${JSON.stringify(cutB.slice(i - 40, i + 80))} → ${JSON.stringify(cutA.slice(i - 40, i + 80))}`) }
  return { ok: problems.length === 0, problems }
}
const { must } = require('./_lp-pricing-tidy.cjs')
const CONTACT_VIEWS = /^parts\/contact\|(GB|US)\|html$/
const ITEMS = !LANDED ? [] : [
  { id: 'contact-1-privacy-lastmod', what: '⚠️ RE-PINNED (contact-1, 2 November 2026): the HatchGrab sitemap’s /privacy lastmod is 2026-11-02 (lib/legal.ts PRIVACY_UPDATED, the contact-form paragraph added); /terms and /country-terms keep theirs — PRECISE, the one entry',
    views: id => /^parts\/sitemap\|(GB|US)\|hatchgrab/.test(id), apply: (id, v) => must('contact-1-privacy-lastmod', sitemapPrivacy)(v) },
  { id: 'contact-1-form', what: '⚠️ RE-PINNED (contact-1, 2 November 2026): HatchGrab’s /contact — the Tally script and iframe leave, HatchGrab’s own form ("Or send us a message") takes the region from the form heading to the section’s end; every other byte the same — STRUCTURAL (contactProof); scripts/contact-1.cjs proves the form',
    views: id => CONTACT_VIEWS.test(id), apply: (id, v) => v, proveWith: (exp, f) => contactProof(exp, f) },
]

/** Every `terms_version` field (at any depth, inside JSON strings too, each re-encoded as it was) '2026-11-01' → '2026-11-02' — what a
 *  new account records since contact-1 moved TERMS_VERSION. */
function termsVersion(v) {
  if (typeof v === 'string') {
    if ((v[0] === '{' || v[0] === '[') && /[}\]]$/.test(v)) { try { const p = JSON.parse(v); if (JSON.stringify(p) === v) return JSON.stringify(termsVersion(p)) } catch { /* not JSON */ } }
    return v
  }
  if (Array.isArray(v)) return v.map(termsVersion)
  if (!v || typeof v !== 'object') return v
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'terms_version' && x === TERMS_VERSION_OLD ? TERMS_VERSION_NEW : termsVersion(x)]))
}

/** The en-GB keys contact-1 deleted with the Tally embed (its loading line and the iframe's accessible name) — in every language. */
const REMOVED_KEYS = ['contactPage.loadingForm', 'contactPage.formTitle']

module.exports = { termsVersion, REMOVED_KEYS, ITEMS, CONTACT_VIEWS, contactProof, sitemapPrivacy, PRIVACY_LASTMOD_OLD, PRIVACY_LASTMOD_NEW, LANDED, asBefore, LEGAL_TS_EDITS, PARA, privacyAsBefore, PRIVACY_DATE_OLD, PRIVACY_DATE_NEW, TERMS_VERSION_OLD, TERMS_VERSION_NEW }
