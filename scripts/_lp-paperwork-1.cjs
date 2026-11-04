// scripts/_lp-paperwork-1.cjs — paperwork-1's named change to the legal files (4 November 2026; docs/paperwork-1-report.md), for the
// harnesses that compare them, or what is rendered from them, with a tree from before it. scripts/paperwork-1.cjs proves the change.
//
//   the Privacy Policy's "Compliance documents" paragraph (section 3, after biometric unlock), its date 3 → 4 November 2026,
//   PRIVACY_UPDATED and TERMS_VERSION ('2026-11-03' → '2026-11-04'):
//   asBefore(file, text) the English Privacy Policy or lib/legal.ts back to its bytes before paperwork-1 (throws if a change is not there
//                   exactly once); chained FIRST by scripts/_lp-tidy-1.cjs asBefore (newest change first), so every harness that pins the
//                   legal files' older bytes takes paperwork-1 back exactly, by name.
//   termsVersion    a new account's terms_version, the same move.  sitemapPrivacy / ITEMS  the HatchGrab sitemap's /privacy lastmod
//                   2026-11-03 → 2026-11-04.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')

const PARA = "**Compliance documents.** If you keep your certificates, insurance and other compliance documents in HatchGrab, we store the files and the details you save with them. When you upload one, we send it to Google's Gemini service, the same one that reads menus, to fill in details such as who issued it and when it expires; you check them before anything is saved. Your documents are shared only with the people you choose to send them to, through links that expire, and we keep them until you delete them or close your account."
const BIOMETRIC_END = 'We never receive, see or store biometric data. We only receive a yes-or-no result.\n'
const PRIVACY_DATE_OLD = '3 November 2026', PRIVACY_DATE_NEW = '4 November 2026', TERMS_VERSION_OLD = '2026-11-03', TERMS_VERSION_NEW = '2026-11-04'
const PRIVACY_EDITS = [
  [BIOMETRIC_END, `${BIOMETRIC_END}\n${PARA}\n`],
  [`**Last updated:** ${PRIVACY_DATE_OLD}`, `**Last updated:** ${PRIVACY_DATE_NEW}`],
]
const LEGAL_TS_EDITS = [
  [`export const PRIVACY_UPDATED = '${PRIVACY_DATE_OLD}'`, `export const PRIVACY_UPDATED = '${PRIVACY_DATE_NEW}'`],
  ["the latest of them; 3 November 2026 since the Privacy Policy's demo-section wording",
    "the latest of them; 4 November 2026 since the Privacy Policy's compliance-documents paragraph (paperwork-1: stored, read by\n *  Gemini to fill in the details, shared only through expiring links, kept until deleted), 3 November 2026 for its demo-section wording"],
  [`export const TERMS_VERSION = '${TERMS_VERSION_OLD}'`, `export const TERMS_VERSION = '${TERMS_VERSION_NEW}'`],
]
/** True on a tree with paperwork-1's legal change. */
const LEGAL_LANDED = (() => { try { const m = /TERMS_VERSION\s*=\s*'(\d{4}-\d{2}-\d{2})'/.exec(fs.readFileSync(path.join(__dirname, '..', 'lib/legal.ts'), 'utf8')); return !!m && m[1] >= TERMS_VERSION_NEW } catch { return false } })()
const once = (s, a, what) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`paperwork-1: ${what} — expected once, found ${n}: ${a.slice(0, 80)}`) }
const back = (edits, what) => text => edits.reduce((s, [a, b]) => { once(s, b, what); return s.replace(b, a) }, text)
function asBefore(file, text) {
  if (!LEGAL_LANDED) return text
  if (file === 'content/legal/privacy-policy.md') return back(PRIVACY_EDITS, 'Privacy Policy edit')(text)
  if (file === 'lib/legal.ts') return back(LEGAL_TS_EDITS, 'lib/legal.ts edit')(text)
  return text
}
/** Every `terms_version` field (at any depth, inside JSON strings too) '2026-11-03' → '2026-11-04'. */
function termsVersion(v) {
  if (typeof v === 'string') {
    if ((v[0] === '{' || v[0] === '[') && /[}\]]$/.test(v)) { try { const p = JSON.parse(v); if (JSON.stringify(p) === v) return JSON.stringify(termsVersion(p)) } catch { /* not JSON */ } }
    return v
  }
  if (Array.isArray(v)) return v.map(termsVersion)
  if (!v || typeof v !== 'object') return v
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'terms_version' && x === TERMS_VERSION_OLD ? TERMS_VERSION_NEW : termsVersion(x)]))
}
const PRIVACY_LASTMOD_OLD = '2026-11-03T00:00:00.000Z', PRIVACY_LASTMOD_NEW = '2026-11-04T00:00:00.000Z'
function sitemapPrivacy(v) {
  if (!Array.isArray(v)) return v
  return v.map(e => (e && e.url === 'https://www.hatchgrab.com/privacy' && e.lastModified === PRIVACY_LASTMOD_OLD ? { ...e, lastModified: PRIVACY_LASTMOD_NEW } : e))
}
const { must } = require('./_lp-pricing-tidy.cjs')
const ITEMS = !LEGAL_LANDED ? [] : [{ id: 'paperwork-1-privacy-lastmod', what: '⚠️ RE-PINNED (paperwork-1, 4 November 2026): the HatchGrab sitemap’s /privacy lastmod is 2026-11-04 (lib/legal.ts PRIVACY_UPDATED, the compliance-documents paragraph); /terms and /country-terms keep theirs — PRECISE, the one entry',
  views: id => /^parts\/sitemap\|(GB|US)\|hatchgrab/.test(id), apply: (id, v) => must('paperwork-1-privacy-lastmod', sitemapPrivacy)(v) }]

// lib/i18n/namespaces.ts: `paperwork` joins Manage's list — taken back exactly (for the harnesses that pin that file's bytes).
const NAMESPACES_ADD = "    // paperwork-1 (4 November 2026): Manage › Documents (components/manage/PaperworkTab.tsx).\n    'paperwork',\n"
function namespacesAsBefore(text) { once(text, NAMESPACES_ADD, 'lib/i18n/namespaces.ts edit'); return text.replace(NAMESPACES_ADD, '') }
/** In a TRANSLATED Privacy Policy: is `line` paperwork-1's paragraph — the one new paragraph in section 3, naming Gemini? */
function isTranslationParagraph(text, line) {
  const lines = text.split('\n'), at = lines.indexOf(line), s3 = lines.findIndex(l => /^## 3\./.test(l)), s4 = lines.findIndex(l => /^## 4\./.test(l))
  return at > s3 && at < s4 && /Gemini/.test(line) && /^\*\*/.test(line)
}
// ── Manage's tab bar: the Documents tab (📄) just before Settings, for whoever sees Settings (owners and managers — the same roles).
/** True on a tree with the Documents tab. */
const TAB_LANDED = (() => { try { return /\{ id: 'paperwork', label: t\('tabs\.paperwork'\)/.test(fs.readFileSync(path.join(__dirname, '..', 'app/manage/[token]/page.tsx'), 'utf8')) } catch { return false } })()
const SETTINGS_BUTTON = /<button data-tab-id="settings" class="([^"]*)">([\s\S]*?)<\/button>/
/** A rendered Manage page from before paperwork-1 → as it renders now: the Documents button inserted before Settings', unselected.
 *  PRECISE: the Settings button must be there exactly once (else the string is returned as it is — a view without the bar). */
function tabBar(html, words = { settings: 'Settings', paperwork: 'Documents' }) {
  if (typeof html !== 'string' || (html.match(/<button data-tab-id="settings" /g) || []).length !== 1) return html
  return html.replace(SETTINGS_BUTTON, (all, cls, inner) => {
    const off = cls.replace('border-orange-500 text-white', 'border-transparent text-slate-400 hover:text-white')
    const docs = inner.replace('<span>🔧</span>', '<span>📄</span>').split(words.settings).join(words.paperwork)
    if (docs === inner) throw new Error('paperwork-1: the Settings button\'s icon and label were not found')
    return `<button data-tab-id="paperwork" class="${off}">${docs}</button>${all}`
  })
}
module.exports = { TAB_LANDED, tabBar, namespacesAsBefore, NAMESPACES_ADD, isTranslationParagraph, LEGAL_LANDED, asBefore, termsVersion, sitemapPrivacy, ITEMS, PARA, PRIVACY_EDITS, LEGAL_TS_EDITS, PRIVACY_DATE_OLD, PRIVACY_DATE_NEW, TERMS_VERSION_OLD, TERMS_VERSION_NEW, PRIVACY_LASTMOD_OLD, PRIVACY_LASTMOD_NEW }
