// scripts/_lp-gsc-index-2.cjs — gsc-index-2's NAMED CHANGES, for the harnesses that compare the legal pages' metadata and the sitemap
// with a tree from before it (9 November 2026; docs/gsc-index-2-report.md). A MODULE: scripts/gsc-index-2.cjs proves the work itself
// against a real build; this file lets every older comparison name exactly what changed, verify it, and map it back.
//
//   gsc-index-2-legal-hreflang   the English /privacy, /terms, /country-terms metadata gains alternates.languages: the document's
//                                cluster (components/legal/translated-legal.tsx legalLanguages). The canonical is unchanged.
//   gsc-index-2-legal-sitemap    the HatchGrab sitemap's three English legal entries gain the same alternates, and every translation
//                                the site serves is appended at the end.
// The views these harnesses render have only English-speaking countries switched on (GB, and the US where it is on), and those have
// no translated legal pages, so in them the cluster is exactly { en-GB, x-default } → the English page and nothing is appended.
// PRECISE: each change must be there exactly as named, or `must` throws (a stale anchor) and the view fails.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const ORIGIN = 'https://www.hatchgrab.com'
const DOCS = ['privacy', 'terms', 'country-terms']

/** True on a tree with gsc-index-2 (legalLanguages exists). */
const LANDED = (() => { try { return /export async function legalLanguages\(doc: LegalDoc\)/.test(fs.readFileSync(path.join(__dirname, '..', 'components/legal/translated-legal.tsx'), 'utf8')) } catch { return false } })()

/** The cluster when no translated country is switched on: the English page under en-GB and x-default. */
const englishOnly = doc => ({ 'en-GB': `${ORIGIN}/${doc}`, 'x-default': `${ORIGIN}/${doc}` })

/** A legal page's merged metadata from before → after: alternates gains `languages` (canonical first, as Next merges them). */
function legalMeta(v, doc) {
  if (!v || typeof v !== 'object') return v
  const c = JSON.parse(JSON.stringify(v))   // a copy: `must` compares the result with the value it was given
  const m = c.merged ? c.merged : c
  if (!m.alternates || m.alternates.canonical !== `${ORIGIN}/${doc}` || m.alternates.languages) return v
  m.alternates = { canonical: m.alternates.canonical, languages: englishOnly(doc) }
  return c
}
/** The HatchGrab sitemap from before → after: the three English legal entries (exactly three, none with alternates) gain theirs. */
function legalSitemap(v) {
  if (!Array.isArray(v)) return v
  const hits = v.filter(e => e && DOCS.some(d => e.url === `${ORIGIN}/${d}`))
  if (hits.length !== 3 || hits.some(e => e.alternates)) return v
  return v.map(e => {
    const doc = e && DOCS.find(d => e.url === `${ORIGIN}/${d}`)
    return doc ? { ...e, alternates: { languages: englishOnly(doc) } } : e
  })
}

/** The other way: a HatchGrab sitemap as it renders now → as it rendered before gsc-index-2, for the harnesses that pin the BEFORE side
 *  (a hash, or a view they do not transform). PRECISE, or it throws: each English legal entry carries a cluster naming it under en-GB
 *  and x-default; every translated legal entry is a member of its document's cluster and carries the same cluster; the translated
 *  entries are exactly the clusters' other members. They are cut, and the English entries lose `alternates`. */
function sitemapBack(v) {
  if (!LANDED || !Array.isArray(v)) return v
  const cluster = {}
  for (const doc of DOCS) {
    const e = v.filter(x => x && x.url === `${ORIGIN}/${doc}`)
    const l = e.length === 1 && e[0].alternates && e[0].alternates.languages
    if (!l || l['en-GB'] !== `${ORIGIN}/${doc}` || l['x-default'] !== `${ORIGIN}/${doc}` || Object.keys(e[0].alternates).length !== 1) throw new Error(`gsc-index-2: the sitemap's /${doc} does not carry its cluster as named`)
    cluster[doc] = l
  }
  const tr = v.filter(x => x && /^https:\/\/www\.hatchgrab\.com\/[a-z]{2}\/(privacy|terms|country-terms)$/.test(x.url))
  for (const doc of DOCS) {
    const want = [...new Set(Object.values(cluster[doc]))].filter(u => u !== `${ORIGIN}/${doc}`).sort()
    const got = tr.filter(x => x.url.endsWith(`/${doc}`))
    if (JSON.stringify(got.map(x => x.url).sort()) !== JSON.stringify(want) || got.some(x => JSON.stringify(x.alternates) !== JSON.stringify({ languages: cluster[doc] })))
      throw new Error(`gsc-index-2: the sitemap's translated /xx/${doc} entries are not exactly the cluster's other members`)
  }
  return v.filter(x => !tr.includes(x)).map(x => {
    if (!x || !DOCS.some(d => x.url === `${ORIGIN}/${d}`)) return x
    const r = { ...x }; delete r.alternates; return r
  })
}

// ── asBefore(file, text): a source file as gsc-index-2 found it, for the harnesses that pin source bytes (cwv-2 and every caller of
// scripts/_moved-paths.cjs changedSince). Each edit must be there EXACTLY once, or it throws.
//   proxy.ts                                the /support block (comment + rule + its blank line) cut
//   app/(app)/(legal)/<doc>/page.tsx        the legalLanguages import, `const own`, and the alternates line put back to the one spread
const once = (s, a, what) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`gsc-index-2: ${what} — expected once, found ${n}: ${a.slice(0, 80)}`) }
const PROXY_START = '  // ── gsc-index-2 (9 November 2026, docs/gsc-index-2-report.md): /support MOVED TO /contact, PERMANENTLY'
const PROXY_END = "    return NextResponse.redirect(to, 308)\n  }\n\n"
function proxyAsBefore(text) {
  once(text, PROXY_START, 'proxy.ts /support block')
  const s = text.indexOf(PROXY_START), e = text.indexOf(PROXY_END, s)
  const block = e < 0 ? '' : text.slice(s, e + PROXY_END.length)
  if (!block || block.length > 900 || (block.match(/pathname === '\/support'/g) || []).length !== 1) throw new Error('gsc-index-2: proxy.ts /support block is not the one named')
  return text.slice(0, s) + text.slice(e + PROXY_END.length)
}
const PAGE_CONST = { privacy: 'PRIVACY_PATH', terms: 'TERMS_PATH', 'country-terms': 'COUNTRY_TERMS_PATH' }
const pageEdits = doc => [
  ["import { ownUrlMetadata } from '@/lib/site-metadata'\n", "import { ownUrlMetadata } from '@/lib/site-metadata'\nimport { legalLanguages } from '@/components/legal/translated-legal'\n"],
  ['export async function generateMetadata(): Promise<Metadata> {\n  return {\n', `export async function generateMetadata(): Promise<Metadata> {\n  const own = await ownUrlMetadata(${PAGE_CONST[doc]})\n  return {\n`],
  [`    ...(await ownUrlMetadata(${PAGE_CONST[doc]})),\n`,
    '    ...own,\n'
    + '    // gsc-index-2 (9 November 2026): hreflang is the document\'s whole cluster, the English page and every translation, the same\n'
    + '    // set each translation declares (components/legal/translated-legal.tsx legalLanguages). The canonical stays its own.\n'
    + `    alternates: { ...own.alternates, languages: await legalLanguages('${doc}') },\n`],
]
function asBefore(file, text) {
  if (!LANDED || typeof text !== 'string') return text
  if (file === 'proxy.ts') return proxyAsBefore(text)
  const m = /^app\/\(app\)\/\(legal\)\/(privacy|terms|country-terms)\/page\.tsx$/.exec(file)
  if (m) return pageEdits(m[1]).reduce((s, [was, now]) => { once(s, now, `${file} edit`); return s.replace(now, was) }, text)
  return text
}
/** The files asBefore takes back. */
const FILES = ['proxy.ts', ...Object.keys(PAGE_CONST).map(d => `app/(app)/(legal)/${d}/page.tsx`)]

const { must } = require('./_lp-pricing-tidy.cjs')
const ITEMS = !LANDED ? [] : [
  { id: 'gsc-index-2-legal-hreflang', what: '⚠️ RE-PINNED (gsc-index-2, 9 November 2026): the English legal pages declare their hreflang cluster (en-GB and x-default → the English page, plus every translation the site serves: none where only English-speaking countries are on); canonical unchanged — PRECISE',
    views: id => /^parts\/legal\|(GB|US)\|meta-(privacy|terms|country-terms)$/.test(id),
    apply: (id, v) => must('gsc-index-2-legal-hreflang', x => legalMeta(x, id.split('|')[2].replace(/^meta-/, '')))(v) },
  { id: 'gsc-index-2-legal-sitemap', what: '⚠️ RE-PINNED (gsc-index-2, 9 November 2026): the HatchGrab sitemap’s /privacy, /terms and /country-terms carry the same cluster as xhtml:link alternates, and the translated legal pages follow at the end (none where only English-speaking countries are on) — PRECISE',
    views: id => /^parts\/sitemap\|(GB|US)\|hatchgrab/.test(id), apply: (id, v) => must('gsc-index-2-legal-sitemap', legalSitemap)(v) },
]

module.exports = { LANDED, ITEMS, legalMeta, legalSitemap, sitemapBack, englishOnly, asBefore, FILES }
