// scripts/_lp-seo-fixes.cjs — ⚠️ RE-PINNED (seo-fixes, 20 October 2026): THE NAMED CHANGES OF seo-fixes
// (docs/seo-fixes-report.md), shared by the language-phase harnesses (0, 1d, 1d2, 1e, 1e-tidy). A MODULE.
//
// seo-fixes changed nothing a visitor SEES (before/after screenshots pixel-identical), but it changed markup and tags the
// byte-identical harnesses read. Each change is a PRECISE transform of the BEFORE value (exact strings, built from the
// BEFORE view itself and the fixtures — never "accept the new value"); a transform that finds nothing to change returns
// its input unchanged, so a stale anchor shows as a mismatch where the item is named (and `must` turns it into a throw).
//
//   seo-m1-country-menu      components/landing/CountryMenu.tsx: the menu <ul> is ALWAYS rendered (closed: class
//                            `cc-menu cc-menu-closed`), right after its trigger button; each option an
//                            <a href role="menuitemradio" aria-checked class="cc-item"> (flag, name, the tick on the
//                            current one). href = switchCountryPath(pathname) ?? the country's landing — the harness
//                            renders have no pathname (the render kit's usePathname → '/'), so every href is /uk or /us.
//   seo-s7-badges-lazy       components/StoreBadges.tsx: both badge <img>s gain loading="lazy" (after height), so React
//                            no longer emits their <link rel="preload" as="image"> (landing footer, Manage › Settings).
//   seo-m5-s9-json-ld        app/landing/page.tsx + lib/structured-data.ts: ONE block { @context, @graph: [Organization,
//                            WebSite, SoftwareApplication] }; the SoftwareApplication keeps BEFORE's fields and words, its
//                            url is the page's own country address, publisher an @id, and one Offer per public plan
//                            priced in the country (the migrations' seed catalogue, the rows the cards render).
//   seo-s1-canonical         /privacy, /terms, /country-terms, /contact: og:url = https://www.hatchgrab.com<path> (was the
//                            host default) and alternates.canonical the same, last.
//   seo-n1-compare-meta      /compare (country address): title { absolute: 'Cost calculator — HatchGrab UK' | '… US' } and
//                            the compare.meta description, in og and twitter too.
//   seo-s5-sitemap           app/sitemap.ts: country entries carry alternates.languages (the hreflang set) and lastmod =
//                            MARKETING_COPY_UPDATED (2026-10-20 — later than the fixtures' plan data and country rows;
//                            never request time); then /privacy, /terms, /country-terms (lastmod = lib/legal.ts's dates,
//                            19 October 2026) and /contact (no lastmod). Village Foodie: its one entry loses lastmod.
const path = require('path')
const REPO = path.resolve(__dirname, '..')
const ORIGIN = 'https://www.hatchgrab.com'
const SEG = { GB: 'uk', US: 'us' }
const NAME = { GB: 'United Kingdom', US: 'United States' }
const CODE_OF_NAME = Object.fromEntries(Object.entries(NAME).map(([k, v]) => [v, k]))
const APP_STORE = { GB: 'https://apps.apple.com/gb/app/hatchgrab/id6803543106', US: 'https://apps.apple.com/app/id6803543106' }
const GOOGLE_PLAY = 'https://play.google.com/store/apps/details?id=com.hatchgrab.app&hl=en'
const CURRENCY = { GB: 'GBP', US: 'USD' }
const clone = v => JSON.parse(JSON.stringify(v))
const must = (id, f) => (v, ...a) => { const out = f(v, ...a); if (JSON.stringify(out) === JSON.stringify(v)) throw new Error(`${id}: nothing to change in the BEFORE value (stale anchor)`); return out }

// ── seo-m1-country-menu ─────────────────────────────────────────────────────────────────────────────────────────────
const flag = code => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(require(path.join(REPO, 'node_modules/country-flag-icons/string/3x2'))[code])}`
const TICK = '<svg class="cc-tick" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>'
const TRIGGER = /<button type="button" class="cc-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="([^"]+)" aria-label="Country: ([^".]+)\. Change country">/g
/** The closed menu, as CountryMenu renders it: `options` = the switched-on countries (codes, in order), `current` ticked. */
function menuHtml(listId, options, current, label = 'Country') {
  const items = options.map(c => `<li role="none"><a href="/${SEG[c]}" role="menuitemradio" aria-checked="${c === current}" class="cc-item"><img class="cc-flag" src="${flag(c)}" alt="" width="21" height="14"/><span class="cc-item-name">${NAME[c]}</span>${c === current ? TICK : ''}</a></li>`).join('')
  return `<ul id="${listId}" role="menu" aria-label="${label}" class="cc-menu cc-menu-closed">${items}</ul>`
}
/** Every closed country-menu trigger in `html` gains its menu right after </button>. */
function countryMenu(html, { options }) {
  if (typeof html !== 'string') return html
  let out = '', at = 0
  for (let m; (m = TRIGGER.exec(html));) {
    const end = html.indexOf('</button>', m.index); if (end < 0) break
    const close = end + '</button>'.length
    if (html.startsWith('<ul id=', close)) continue   // already open / already there: leave it, the comparison decides
    out += html.slice(at, close) + menuHtml(m[1], options, CODE_OF_NAME[m[2]]); at = close
  }
  TRIGGER.lastIndex = 0
  return out + html.slice(at)
}

// ── seo-s7-badges-lazy ──────────────────────────────────────────────────────────────────────────────────────────────
const BADGE_IMG = /<img src="(\/badges\/[^"]+)"([^>]*?) height="(\d+)"( style=)/g
function badgesLazy(html) {
  if (typeof html !== 'string') return html
  const srcs = new Set()
  let x = html.replace(BADGE_IMG, (m, src, mid, h, st) => (/loading=/.test(mid) ? m : (srcs.add(src), `<img src="${src}"${mid} height="${h}" loading="lazy"${st}`)))
  for (const src of srcs) x = x.split(`<link rel="preload" as="image" href="${src}"/>`).join('')
  return x
}

// ── seo-m5-s9-json-ld ───────────────────────────────────────────────────────────────────────────────────────────────
const SB = () => require('./_lp-stage-b.cjs')
function offers(cc, pageUrl) {
  const cat = SB().catalog(), cur = CURRENCY[cc]
  return SB().publicPlans().map(p => [p, cat.prices.find(r => r.planKey === p.key && r.countryCode === cc)]).filter(([, pr]) => pr).map(([p, pr]) => {
    const price = (pr.monthlyMinor / 100).toFixed(2)
    return { '@type': 'Offer', name: p.name, url: `${pageUrl}#pricing`, price, priceCurrency: cur, priceSpecification: { '@type': 'UnitPriceSpecification', price, priceCurrency: cur, unitCode: 'MON' } }
  })
}
/** BEFORE's single SoftwareApplication block → seo-fixes's graph for the page of country `cc`. */
function landingGraph(app0, cc, { pricesShown = true } = {}) {
  const pageUrl = `${ORIGIN}/${SEG[cc]}`, ORG = `${ORIGIN}/#organization`
  const { '@context': ctx, url: _u, publisher, ...app } = app0
  if (ctx !== 'https://schema.org' || app['@type'] !== 'SoftwareApplication' || !publisher) throw new Error('seo-m5-s9-json-ld: BEFORE is not the single SoftwareApplication block')
  const o = pricesShown ? offers(cc, pageUrl) : []
  return {
    '@context': ctx,
    '@graph': [
      { '@type': 'Organization', '@id': ORG, name: publisher.name, url: publisher.url, logo: `${ORIGIN}/logos/hatchgrab-logo.png`, sameAs: [APP_STORE[cc], GOOGLE_PLAY] },
      { '@type': 'WebSite', '@id': `${ORIGIN}/#website`, name: publisher.name, url: publisher.url, publisher: { '@id': ORG } },
      { ...app, url: pageUrl, publisher: { '@id': ORG }, ...(o.length ? { offers: o } : {}) },
    ],
  }
}
/** The landing HTML: the ld+json script's text. */
function jsonLdHtml(html, cc, opts) {
  if (typeof html !== 'string') return html
  return html.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/, (m, a, j, b) => { const o = JSON.parse(j); return o['@graph'] ? m : a + JSON.stringify(landingGraph(o, cc, opts)) + b })
}
/** A captured metadata view's `ld` array (or the object holding it). */
function jsonLdMeta(v, cc, opts) {
  if (!v || typeof v !== 'object' || !Array.isArray(v.ld) || !v.ld[0] || v.ld[0]['@graph']) return v
  return { ...v, ld: [landingGraph(v.ld[0], cc, opts), ...v.ld.slice(1)] }
}

// ── seo-s1-canonical ────────────────────────────────────────────────────────────────────────────────────────────────
function canonicalMeta(v, pagePath) {
  const m = v && v.merged ? v.merged : v
  if (!m || typeof m !== 'object' || !m.openGraph || (m.alternates && m.alternates.canonical)) return v
  m.openGraph.url = ORIGIN + pagePath
  m.alternates = { canonical: ORIGIN + pagePath }
  return v
}

// ── seo-n1-compare-meta ─────────────────────────────────────────────────────────────────────────────────────────────
const COMPARE_DESCRIPTION = 'Compare what your online orders cost you now with a year on HatchGrab — an estimate in a minute.'
function compareMeta(v, cc) {
  const m = v && v.merged ? v.merged : v
  if (!m || typeof m !== 'object') return v
  const title = `Cost calculator — HatchGrab ${cc === 'US' ? 'US' : 'UK'}`
  m.title = title; m.description = COMPARE_DESCRIPTION
  for (const k of ['openGraph', 'twitter']) if (m[k]) { m[k].title = title; m[k].description = COMPARE_DESCRIPTION }
  return v
}

// ── seo-s5-sitemap ──────────────────────────────────────────────────────────────────────────────────────────────────
const COPY_UPDATED = '2026-10-20T00:00:00.000Z'   // lib/marketing-meta.ts MARKETING_COPY_UPDATED
const LEGAL_UPDATED = '2026-10-19T00:00:00.000Z'  // lib/legal.ts PRIVACY_UPDATED / TERMS_UPDATED / COUNTRY_TERMS_UPDATED ('19 October 2026')
/** The HatchGrab sitemap (as the earlier named items leave it: the switched-on countries' landing + features). */
function sitemapHG(v) {
  if (!Array.isArray(v) || v.some(e => e.alternates)) return v
  const ccs = [...new Set(v.map(e => /^https:\/\/www\.hatchgrab\.com\/(uk|us)(\/|$)/.exec(e.url)).filter(Boolean).map(m => m[1]))]
  const langs = page => Object.fromEntries([...ccs.map(s => [s === 'uk' ? 'en-GB' : 'en-US', `${ORIGIN}/${s}${page}`]), ['x-default', `${ORIGIN}${page || '/'}`]])
  const out = v.map(e => {
    const m = /^https:\/\/www\.hatchgrab\.com\/(?:uk|us)(\/features)?$/.exec(e.url)
    return m ? { ...e, lastModified: COPY_UPDATED, alternates: { languages: langs(m[1] || '') } } : e
  })
  const legal = p => ({ url: ORIGIN + p, lastModified: LEGAL_UPDATED, changeFrequency: 'yearly', priority: 0.3 })
  return [...out, legal('/privacy'), legal('/terms'), legal('/country-terms'), { url: `${ORIGIN}/contact`, changeFrequency: 'yearly', priority: 0.3 }]
}
const sitemapVF = v => (Array.isArray(v) ? v.map(e => { const { lastModified, ...r } = e; return r }) : v)

// ── the items, over the Phase 1e view ids (`<area>/<part>|<CC>|<variant>`) ─────────────────────────────────────────────
const parseId = id => { const rest = id.split('/').slice(1).join('/'); const [part, cc, variant] = rest.split('|'); return { part, cc, variant: variant || '' } }
/** Which countries are switched on in a Phase 1e view (the variant names it: GB `-usOn` / `-cookieUS`; US unless `-usOff`). */
const usOnOf = p => (p.cc === 'US' ? !/usOff/.test(p.variant) : /usOn|cookieUS/.test(p.variant))
const optionsOf = id => ['GB', ...(usOnOf(parseId(id)) ? ['US'] : [])]
// ── copy-trust-line ────────────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ RE-PINNED (copy, Dominic, 20 October 2026 — asked during seo-fixes; a VISIBLE copy change, not an SEO one): the
// landing's trust line (hero + final CTA) read "First month 100% free, everything unlocked"; it now names the trial's
// length from the data — plans.trial_months of the seed (3) — "First 3 months completely free, everything unlocked".
const TRUST_OLD = 'First month 100% free, everything unlocked'
const trialMonthsSeed = () => require('./_plans-catalog-fixture.cjs').seedCatalog(REPO).plans.find(p => p.isTrial && p.trialMonths).trialMonths
const trustNew = () => { const n = trialMonthsSeed(); return n === 1 ? 'First month completely free, everything unlocked' : `First ${n} months completely free, everything unlocked` }
const trustLine = v => (typeof v === 'string' ? v.split(TRUST_OLD).join(trustNew()) : v)

const ITEMS = [
  { id: 'seo-m1-country-menu', what: '⚠️ RE-PINNED (seo-fixes M1, 20 October 2026): the country menu is always in the HTML (closed: .cc-menu-closed), its options crawlable <a href> (/uk, /us) — PRECISE: the closed menu built from the trigger’s own id and label, the switched-on countries, the flags and the tick',
    views: id => /^pages\/(landing|features|compare)\|(GB|US)\|html(?!-usOff)/.test(id), apply: (id, v) => countryMenu(v, { options: optionsOf(id) }) },
  { id: 'seo-s7-badges-lazy', what: '⚠️ RE-PINNED (seo-fixes S7, 20 October 2026): the App Store / Google Play badges load lazily — loading="lazy" on both <img>s, and their two <link rel="preload" as="image"> gone',
    views: id => /^pages\/(landing|features|compare)\|(GB|US)\|html(?!-usOff)/.test(id), apply: (id, v) => badgesLazy(v) },
  { id: 'seo-m5-s9-json-ld', what: '⚠️ RE-PINNED (seo-fixes M5 + S9, 20 October 2026): the landing’s JSON-LD is one @graph — Organization, WebSite, and BEFORE’s SoftwareApplication with url = the page’s country address, publisher by @id, and an Offer per public plan priced in the country',
    views: id => /^pages\/landing\|(GB|US)\|(html|meta)(?!-usOff)/.test(id),
    apply: (id, v) => { const p = parseId(id); return typeof v === 'string' ? jsonLdHtml(v, p.cc) : jsonLdMeta(v, p.cc) } },
  { id: 'seo-n1-compare-meta', what: '⚠️ RE-PINNED (seo-fixes N1, 20 October 2026): /compare’s title is “Cost calculator — HatchGrab UK” (US: “… US”) with the compare.meta description, in og and twitter too (still noindex)',
    views: id => /^pages\/compare\|(GB|US)\|meta(?!-usOff)/.test(id), apply: (id, v) => compareMeta(v, parseId(id).cc) },
  { id: 'seo-s1-canonical', what: '⚠️ RE-PINNED (seo-fixes S1, 20 October 2026): /contact, /privacy, /terms carry their own canonical, and og:url names the page (https://www.hatchgrab.com<path>, was the host default)',
    views: id => /^parts\/(contact\|(GB|US)\|meta|legal\|(GB|US)\|meta-(privacy|terms|country-terms))$/.test(id),
    apply: (id, v) => { const p = parseId(id); return canonicalMeta(v, p.part === 'contact' ? '/contact' : `/${p.variant.replace(/^meta-/, '')}`) } },
  { id: 'copy-trust-line', what: '⚠️ RE-PINNED (copy, Dominic, 20 October 2026): the landing trust line reads “First 3 months completely free, everything unlocked” (the seed trial length), was “First month 100% free, everything unlocked” — both places (hero, final CTA)',
    views: id => /^pages\/landing\|(GB|US)\|html(?!-usOff)/.test(id), apply: (id, v) => must('copy-trust-line', trustLine)(v) },
  { id: 'seo-s5-sitemap', what: '⚠️ RE-PINNED (seo-fixes S5, 20 October 2026): the HatchGrab sitemap — country entries with their hreflang alternates and lastmod = the copy date (2026-10-20), then /privacy, /terms, /country-terms (19 October 2026) and /contact (no lastmod); Village Foodie’s one entry has no lastmod',
    views: id => /^parts\/sitemap\|(GB|US)\|/.test(id), apply: (id, v) => (/villagefoodie/.test(parseId(id).variant) ? sitemapVF(v) : sitemapHG(v)) },
]

module.exports = { ITEMS, must, trustLine, countryMenu, menuHtml, badgesLazy, landingGraph, jsonLdHtml, jsonLdMeta, canonicalMeta, compareMeta, sitemapHG, sitemapVF, optionsOf, usOnOf, parseId, clone }
