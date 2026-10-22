// scripts/_lp-about-page.cjs — THE ABOUT-PAGE NAMED CHANGES, for the harnesses that compare a marketing page with an older
// snapshot (about-page, 22 October 2026; docs/about-page-report.md). A MODULE: scripts/about-page.cjs proves the page itself;
// this file lets every older comparison name exactly what the work changed on the OTHER pages, verify it, and map it back —
// so every other byte is still compared.
//
// The named changes (each verified before it is mapped back; a view that does not carry it EXACTLY is left as it is and fails):
//   ABOUT-link     the HatchGrab footers (LandingFooter, HatchGrabContact) gain <a href="/about">About</a> — once per page;
//   ABOUT-founder  the Organization JSON-LD gains "founder": { "@type": "Person", "name": "Dominic Bonini" } (no image: no photo
//                  is committed) — last key of the Organization object;
//   ABOUT-sitemap  the HatchGrab sitemap gains one last entry, /about (lastmod 2026-10-22, yearly, 0.3);
//   ABOUT-llms     /llms.txt gains "## About" + its one line before "## Links", and "- About: …/about" as the last line;
//   NAV-menu       Dominic, 22 October 2026: the country menu left the NAV (it is in the footer only). On BEFORE's side the
//                  header's <div class="cc cc-head">…</div> is cut (verified: exactly one, inside <nav>), so the rest compares.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const REPO = path.resolve(__dirname, '..')

/** True on a tree with the about-page work (the route exists). */
const LANDED = fs.existsSync(path.join(REPO, 'app/about/page.tsx'))

const ABOUT_A = '<a href="/about">About</a>'
const FOUNDER = { '@type': 'Person', name: 'Dominic Bonini' }
const FOUNDER_JSON = ',"founder":{"@type":"Person","name":"Dominic Bonini"}'
const SITEMAP_ENTRY = { url: 'https://www.hatchgrab.com/about', lastModified: '2026-10-22T00:00:00.000Z', changeFrequency: 'yearly', priority: 0.3 }
const LLMS_SECTION = '## About\n\nHatchGrab is run by its founder, Dominic Bonini, from the UK.\n\n'
const LLMS_LINK = '- About: https://www.hatchgrab.com/about\n'

const count = (s, x) => s.split(x).length - 1

/** ABOUT-link: the html with its one footer About link cut; null if it is not there exactly once, inside a <footer>. */
function dropLink(html) {
  if (typeof html !== 'string' || count(html, ABOUT_A) !== 1) return null
  const at = html.indexOf(ABOUT_A), f0 = html.lastIndexOf('<footer', at), f1 = html.indexOf('</footer>', at)
  if (f0 < 0 || f1 < 0 || html.lastIndexOf('</footer>', at) > f0) return null
  return html.replace(ABOUT_A, '')
}
/** ABOUT-link, on textOf's output: "… Terms About Contact …" → "… Terms Contact …" and the href=/about attribute dropped. */
function dropLinkText({ text, attrs }) {
  if (count(text, ' Terms About Contact ') !== 1 || attrs.filter(a => a === 'href=/about').length !== 1) return null
  const i = attrs.indexOf('href=/about')
  return { text: text.replace(' Terms About Contact ', ' Terms Contact '), attrs: [...attrs.slice(0, i), ...attrs.slice(i + 1)] }
}
/** ABOUT-founder, in serialised JSON (a page's <script type="application/ld+json">): cut exactly one founder. */
function dropFounderJson(s) {
  if (typeof s !== 'string' || count(s, FOUNDER_JSON) !== 1) return null
  return s.replace(FOUNDER_JSON, '')
}
/** ABOUT-founder, on a parsed graph (or graph list): every Organization's founder verified and removed (a copy). */
function dropFounderLd(g) {
  const c = JSON.parse(JSON.stringify(g))
  let n = 0, bad = false
  const walk = x => {
    if (Array.isArray(x)) return x.forEach(walk)
    if (!x || typeof x !== 'object') return
    if (x['@type'] === 'Organization') {
      const keys = Object.keys(x)
      if (JSON.stringify(x.founder) === JSON.stringify(FOUNDER) && keys[keys.length - 1] === 'founder') { delete x.founder; n++ } else bad = true
    }
    Object.values(x).forEach(walk)
  }
  walk(c)
  return n && !bad ? c : null
}
/** ABOUT-link + ABOUT-founder on a page's html (the founder only where the page has a JSON-LD Organization). */
function pageBack(html) {
  let x = dropLink(html); if (x === null) return null
  if (x.includes('"@type":"Organization"')) { x = dropFounderJson(x); if (x === null) return null }
  return x
}
/** ABOUT-sitemap: the HatchGrab sitemap's last entry verified and cut; null if it is not exactly /about. */
function dropSitemap(entries) {
  if (!Array.isArray(entries) || !entries.length) return null
  const last = JSON.parse(JSON.stringify(entries[entries.length - 1]))
  return JSON.stringify(last) === JSON.stringify(SITEMAP_ENTRY) ? entries.slice(0, -1) : null
}
/** ABOUT-llms: both additions verified and cut. */
function dropLlms(s) {
  if (typeof s !== 'string' || count(s, LLMS_SECTION) !== 1 || !s.includes(LLMS_SECTION + '## Links\n') || !s.endsWith(LLMS_LINK) || count(s, LLMS_LINK) !== 1) return null
  return s.replace(LLMS_SECTION, '').slice(0, -LLMS_LINK.length)
}
/** NAV-menu, BEFORE's side: the header country menu (a balanced <div class="cc cc-head">) cut from <nav>; null if not exactly one. */
function cutHeaderMenu(html) {
  if (typeof html !== 'string') return null
  const open = '<div class="cc cc-head">'
  if (count(html, open) !== 1) return null
  const s0 = html.indexOf(open), n0 = html.lastIndexOf('<nav', s0), n1 = html.indexOf('</nav>', s0)
  if (n0 < 0 || n1 < 0 || html.lastIndexOf('</nav>', s0) > n0) return null
  const re = /<div\b|<\/div>/g; re.lastIndex = s0; let d = 0, e0 = -1
  for (let m; (m = re.exec(html));) { d += m[0] === '</div>' ? -1 : 1; if (d === 0) { e0 = m.index + 6; break } }
  return e0 < 0 ? null : html.slice(0, s0) + html.slice(e0)
}
/** NAV-menu, AFTER's side: true when the nav has no country menu at all. */
const navHasNoMenu = html => { const n = (String(html).match(/<nav[\s\S]*?<\/nav>/) || [''])[0]; return !!n && !/class="cc[ "]|cc-btn|cc-head/.test(n) }

/** Every about-page named change on ONE captured view (AFTER `a`, BEFORE `b`): [after', before', names] with each change verified
 *  and mapped back, or null when a change is present but not EXACTLY the named one (the caller then compares as it is). */
function viewBack(a, b) {
  const names = []
  if (typeof a === 'string') {
    let x = a, y = b
    if (x.includes(ABOUT_A)) { x = dropLink(x); if (x === null) return null; names.push('ABOUT-link') }
    if (x.includes('"founder"')) { x = dropFounderJson(x); if (x === null) return null; names.push('ABOUT-founder') }
    if (x.includes(LLMS_LINK)) { x = dropLlms(x); if (x === null) return null; names.push('ABOUT-llms') }
    if (typeof y === 'string' && y.includes('<div class="cc cc-head">') && !x.includes('cc-head')) { y = cutHeaderMenu(y); if (y === null) return null; names.push('NAV-menu') }
    return [x, y, names]
  }
  if (Array.isArray(a) && a.length && a[a.length - 1] && a[a.length - 1].url === SITEMAP_ENTRY.url) {
    const x = dropSitemap(a); return x ? [x, b, ['ABOUT-sitemap']] : null
  }
  if (a && typeof a === 'object' && JSON.stringify(a).includes('"founder"')) {
    const x = dropFounderLd(a); return x ? [x, b, ['ABOUT-founder']] : null
  }
  return [a, b, names]
}
/** viewBack over whole capture areas, IN PLACE: A[area][k] / B[area][k] replaced by the mapped-back pair. Returns which
 *  views each named change was found on, and the views where a change was present but not exactly the named one. */
function applyViews(A, B, areas) {
  const byName = new Map(), bad = []
  for (const area of areas) for (const k of Object.keys(A[area] || {})) {
    if (!(k in (B[area] || {}))) continue
    const r = viewBack(A[area][k], B[area][k])
    if (!r) { bad.push(`${area}/${k}`); continue }
    A[area][k] = r[0]; B[area][k] = r[1]
    for (const n of r[2]) byName.set(n, [...(byName.get(n) || []), `${area}/${k}`])
  }
  return { byName, bad }
}
/** One line per named change for a harness's log: "ABOUT-link 12 views (pages/landing|GB|html, …)". */
const summary = ({ byName }) => [...byName].map(([n, ks]) => `${n} ${ks.length} view(s) (${ks.slice(0, 4).join(', ')}${ks.length > 4 ? ', …' : ''})`).join('; ')

// ── FORWARD: BEFORE → BEFORE + the named change, for the harnesses that list named items per view (language-phase-1e through
//    scripts/_lp1e-named.cjs, language-phase-1e-tidy). Each is PRECISE: it applies at exactly one place or not at all, and
//    `must` makes a no-op throw. Applied after every earlier item (seo-m1-country-menu has already put its list in the header).
const LINK_BEFORE_CONTACT = '<a href="/terms">Terms</a><a href="/contact?topic=General%20Enquiry">Contact</a>'
const CONTACT_FOOT = '<div class="foot-links"><a href="/privacy">Privacy</a><a href="/terms">Terms</a></div>'
/** ABOUT-link forward: LandingFooter (About before Contact) or HatchGrabContact's footer (About after Terms). */
function linkForward(html) {
  if (typeof html !== 'string' || html.includes(ABOUT_A)) return html
  if (count(html, LINK_BEFORE_CONTACT) === 1) return html.replace(LINK_BEFORE_CONTACT, '<a href="/terms">Terms</a>' + ABOUT_A + '<a href="/contact?topic=General%20Enquiry">Contact</a>')
  if (count(html, CONTACT_FOOT) === 1) return html.replace(CONTACT_FOOT, CONTACT_FOOT.replace('</div>', ABOUT_A + '</div>'))
  return html
}
/** ABOUT-founder forward: the Organization node gains `founder` as its last key (after sameAs) — in serialised JSON or a value. */
function founderForward(v) {
  if (typeof v === 'string') {
    if (count(v, '"@type":"Organization"') !== 1 || v.includes('"founder"')) return v
    const o = v.indexOf('"@type":"Organization"'), sa = v.indexOf('"sameAs":[', o), end = sa < 0 ? -1 : v.indexOf(']', sa)
    if (sa < 0 || end < 0 || v[end + 1] !== '}' || v.slice(o, sa).includes('"@type":"WebSite"')) return v
    return v.slice(0, end + 1) + FOUNDER_JSON + v.slice(end + 1)
  }
  if (Array.isArray(v)) return v.map(founderForward)
  if (!v || typeof v !== 'object') return v
  const out = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, founderForward(x)]))
  if (out['@type'] === 'Organization' && !('founder' in out)) out.founder = { ...FOUNDER }
  return out
}
/** ABOUT-sitemap forward: the HatchGrab sitemap's last entry, /about. */
const sitemapForward = v => (Array.isArray(v) && !v.some(e => e && e.url === SITEMAP_ENTRY.url) ? [...v, { ...SITEMAP_ENTRY }] : v)
/** NAV-menu forward: the header's country menu cut (cutHeaderMenu; unchanged when it is not exactly one, inside <nav>). */
const navForward = v => (typeof v === 'string' ? cutHeaderMenu(v) ?? v : v)

// A page's rendered HTML — not a `-usOff` view, which is the page's own redirect ("REDIRECT …", no HTML at all).
const PAGE_HTML = /^pages\/(landing|features|compare)\|(GB|US)\|html(?!.*-usOff)/
const ITEMS = !LANDED ? [] : (() => {
  const { must } = require('./_lp-pricing-tidy.cjs')
  return [
    { id: 'about-page-nav-menu', what: '⚠️ RE-PINNED (about-page, 22 October 2026, Dominic): the country menu left the nav — the header’s <div class="cc cc-head"> (button + closed list) is gone; the footer keeps its menu — PRECISE, the one block inside <nav>',
      views: id => PAGE_HTML.test(id), apply: (id, v) => must('about-page-nav-menu', navForward)(v) },
    { id: 'about-page-footer-link', what: '⚠️ RE-PINNED (about-page, 22 October 2026): the HatchGrab footers gain <a href="/about">About</a> (LandingFooter: before Contact; /contact’s footer: after Terms) — PRECISE, once',
      views: id => PAGE_HTML.test(id) || /^parts\/contact\|(GB|US)\|html$/.test(id), apply: (id, v) => must('about-page-footer-link', linkForward)(v) },
    { id: 'about-page-founder', what: '⚠️ RE-PINNED (about-page, 22 October 2026): the Organization JSON-LD gains founder { Person, "Dominic Bonini" } (no image: no photo committed) — PRECISE, its last key',
      views: id => /^pages\/landing\|(GB|US)\|(html|meta)(?!.*-usOff)/.test(id), apply: (id, v) => must('about-page-founder', founderForward)(v) },
    { id: 'about-page-sitemap', what: '⚠️ RE-PINNED (about-page, 22 October 2026): the HatchGrab sitemap gains /about last (lastmod 2026-10-22, yearly, 0.3) — PRECISE, the one entry',
      views: id => /^parts\/sitemap\|(GB|US)\|hatchgrab/.test(id), apply: (id, v) => must('about-page-sitemap', sitemapForward)(v) },
  ]
})()

module.exports = { LANDED, ABOUT_A, FOUNDER, FOUNDER_JSON, SITEMAP_ENTRY, LLMS_SECTION, LLMS_LINK, dropLink, dropLinkText, dropFounderJson, dropFounderLd, pageBack, dropSitemap, dropLlms, cutHeaderMenu, navHasNoMenu, viewBack, applyViews, summary, ITEMS, linkForward, founderForward, sitemapForward, navForward }
