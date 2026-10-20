// scripts/_lp-pricing-tidy.cjs — ⚠️ RE-PINNED (pricing-tidy, 20 October 2026): THE NAMED CHANGES OF pricing-tidy, shared by
// the language-phase harnesses (1c, 1d2, 1e, 1e-tidy, 2) and messages-parity. A MODULE.
//
// pricing-tidy changed, ON PURPOSE:
//   1. the Terms of Service: re-dated 20 October 2026 (§4 edited) — lib/legal.ts TERMS_UPDATED '20 October 2026',
//      TERMS_VERSION '2026-10-20' (privacy and country terms stay 19 October 2026). So signup records terms_version
//      '2026-10-20', and the sitemap's /terms lastmod is 2026-10-20;
//   2. the one plan table: "Kitchen ticket printing" ¹ and "WhatsApp auto-replies" ² carry a superscript marker, and two
//      footnotes follow the card-fee footnote (planTable.notes.printing / .whatsapp) on /features, Manage › Billing and
//      the plans PDF; ⚠️ RE-PINNED (compare-tidy, 20 October 2026): the markers follow ROW POSITION (lib/feature-table.ts
//      noteOrder()) — printing (the earlier row) 1, WhatsApp 2, footnotes in that order (pricing-tidy had WhatsApp 1);
//   3. Manage › Billing "not started" (a trial with no end date): the body <p> is gone, the heading alone
//      (manageBilling.notStarted.body deleted);
//   4. /contact on Village Foodie: self-canonical (https://www.villagefoodie.co.uk/contact).
// Each a PRECISE transform (exact strings; each must apply where named — a no-op is a failure where `must` is used).
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')

/** True on a tree with pricing-tidy (lib/legal.ts's Terms version 2026-10-20). */
const LANDED = (() => { try { return /TERMS_VERSION\s*=\s*'2026-10-20'/.test(fs.readFileSync(path.join(REPO, 'lib/legal.ts'), 'utf8')) } catch { return false } })()
const must = (id, f) => (v, ...a) => { const out = f(v, ...a); if (JSON.stringify(out) === JSON.stringify(v)) throw new Error(`${id}: nothing to change in the BEFORE value (stale anchor)`); return out }

// ── 1 · the Terms' version and date ───────────────────────────────────────────────────────────────────────────────────
const TERMS_VERSION_OLD = '2026-10-19', TERMS_VERSION_NEW = '2026-10-20'
/** Every `terms_version` field (at any depth, inside JSON strings too, each re-encoded as it was) '2026-10-19' → '2026-10-20'. */
function termsVersion(v) {
  if (typeof v === 'string') {
    if ((v[0] === '{' || v[0] === '[') && /[}\]]$/.test(v)) { try { const p = JSON.parse(v); if (JSON.stringify(p) === v) return JSON.stringify(termsVersion(p)) } catch { /* not JSON */ } }
    return v
  }
  if (Array.isArray(v)) return v.map(termsVersion)
  if (!v || typeof v !== 'object') return v
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'terms_version' && x === TERMS_VERSION_OLD ? TERMS_VERSION_NEW : termsVersion(x)]))
}
const TERMS_LASTMOD_OLD = '2026-10-19T00:00:00.000Z', TERMS_LASTMOD_NEW = '2026-10-20T00:00:00.000Z'
/** The HatchGrab sitemap's /terms entry: lastmod 2026-10-19 → 2026-10-20 (/privacy and /country-terms unchanged). */
function sitemapTerms(v) {
  if (!Array.isArray(v)) return v
  return v.map(e => (e && e.url === 'https://www.hatchgrab.com/terms' && e.lastModified === TERMS_LASTMOD_OLD ? { ...e, lastModified: TERMS_LASTMOD_NEW } : e))
}

// ── 2 · the plan table's row footnotes (components/pricing/PlanTable.tsx, lib/feature-table.ts `note`) ─────────────────
// Two rows carry a superscript marker, and two footnotes follow the card-fee footnote ("* …") in the surface's own style —
// /features, Manage › Billing and the plans PDF. The words are planTable.notes.* (en-GB; en-US has no override).
const NOTE_TEXT = {
  whatsapp: 'WhatsApp auto-replies need a WhatsApp Business account. Meta may charge for some messages; replies are generated automatically.',
  printing: 'Kitchen ticket printing needs a compatible Bluetooth or wired printer (not supplied).',
}
const reEsc = x => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const SEP = '(?:<!-- -->)?'   // React's text separator between the marker and the words (a server render)
// ⚠️ RE-PINNED (compare-tidy, 20 October 2026): the markers follow ROW POSITION (lib/feature-table.ts noteOrder(),
// scripts/_lp-compare-tidy.cjs NOTES_LANDED) — "Kitchen ticket printing" (the earlier row) ¹ and its footnote first,
// "WhatsApp auto-replies" ² second. Before compare-tidy (NOTE_ORDER) it was WhatsApp ¹, printing ².
const ROW_LABEL = { whatsapp: 'WhatsApp auto-replies', printing: 'Kitchen ticket printing' }
const NOTE_ORDER = (() => { try { return require('./_lp-compare-tidy.cjs').NOTES_LANDED } catch { return false } })() ? ['printing', 'whatsapp'] : ['whatsapp', 'printing']
const SURFACE = {
  features: { fee: '<p class="price-note">* ', note: '<p class="price-note">', row: (l, n) => `<span>${l}<sup class="pt-sup">${n}</sup></span>`, marker: /<sup class="pt-sup">/g },
  billing: { fee: '<p class="text-xs text-slate-500 mt-3 px-1">* ', note: '<p class="text-xs text-slate-500 mt-1 px-1">', row: (l, n) => `<span>${l}<sup class="pt-sup">${n}</sup></span>`, marker: /<sup class="pt-sup">/g },
  pdf: { fee: '<p>* ', note: '<p>', row: (l, n) => `<span class="f-name">${l}<sup>${n}</sup></span>`, marker: /<span class="f-name">[^<]*<sup>/g },
}
/** The plan table's markers and footnotes on `surface` ('features' | 'billing' | 'pdf') → problems (exact strings). */
function tableNotesProblems(html, surface) {
  const S = SURFACE[surface], p = []
  if (typeof html !== 'string') return [`pricing-tidy ${surface}: not HTML`]
  const rows = NOTE_ORDER.map((k, i) => S.row(ROW_LABEL[k], i + 1))
  for (const r of rows) { const n = html.split(r).length - 1; if (n !== 1) p.push(`pricing-tidy ${surface}: the row label ${JSON.stringify(r)} shows ${n} times, not once`) }
  const m = (html.match(S.marker) || []).length
  if (m !== rows.length) p.push(`pricing-tidy ${surface}: ${m} rows carry a footnote marker, not ${rows.length}`)
  const f = html.indexOf(S.fee)
  if (f < 0) return [...p, `pricing-tidy ${surface}: no card-fee footnote`]
  const end = html.indexOf('</p>', f) + 4
  const want = new RegExp(`^${NOTE_ORDER.map((k, i) => `${reEsc(S.note)}<sup>${i + 1}</sup> ${SEP}${reEsc(NOTE_TEXT[k])}</p>`).join('')}`)
  if (!want.test(html.slice(end))) p.push(`pricing-tidy ${surface}: the card-fee footnote is not followed by ${NOTE_ORDER.map((k, i) => `footnote ${i + 1} (${ROW_LABEL[k]})`).join(' and ')} exactly — got ${JSON.stringify(html.slice(end, end + 200))}`)
  return p
}

// ── 3 · Manage › Billing "not started" (a trial with no end date): the heading alone ───────────────────────────────────
const NOT_STARTED_HEADING = '<div><p class="text-sm font-bold text-slate-900">Your free trial has not started yet</p></div>'
function notStartedProblems(html) {
  const p = []
  if (typeof html !== 'string') return ['pricing-tidy not-started: not HTML']
  if (html.split(NOT_STARTED_HEADING).length - 1 !== 1) p.push('pricing-tidy not-started: the heading is not shown once, alone in its block (the body <p> must be gone)')
  if (/hasn(’|&#x27;|')t started yet/.test(html)) p.push('pricing-tidy not-started: the deleted body (“Your free trial hasn’t started yet.”) still shows')
  return p
}

// ── the items, over the Phase 1e view ids (`<area>/<part>|<CC>|<variant>`), applied after seo-fixes's (scripts/_lp-seo-fixes.cjs)
const ITEMS = !LANDED ? [] : [
  { id: 'pricing-tidy-terms-lastmod', what: '⚠️ RE-PINNED (pricing-tidy, 20 October 2026): the HatchGrab sitemap’s /terms lastmod is 2026-10-20 (lib/legal.ts TERMS_UPDATED, the re-dated Terms); /privacy and /country-terms stay 2026-10-19 — PRECISE, the one entry',
    views: id => /^parts\/sitemap\|(GB|US)\|hatchgrab/.test(id), apply: (id, v) => must('pricing-tidy-terms-lastmod', sitemapTerms)(v) },
]

module.exports = { ITEMS, LANDED, must, NOTE_TEXT, tableNotesProblems, notStartedProblems, NOT_STARTED_HEADING, termsVersion, TERMS_VERSION_OLD, TERMS_VERSION_NEW, sitemapTerms, TERMS_LASTMOD_OLD, TERMS_LASTMOD_NEW }
