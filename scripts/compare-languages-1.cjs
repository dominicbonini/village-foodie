#!/usr/bin/env node
// scripts/compare-languages-1.cjs — compare-languages-1 (8 November 2026; docs/compare-languages-1-report.md). The comparison page in every
// language base, for every country but AE. Proves, against the real modules and messages (no network, no database):
//   1 · the words: every language base has the whole `comparison` namespace (no key falls back to English), every string has en-GB's
//       placeholders / select options / exact cases / tags and parses; the variants (en-US, es-MX, fr-LU, de-CH, de-LI) override only
//       existing keys; a back-translation for every key of every base; the namespace is no longer scoped to English and German
//   2 · the addresses: every country with an address has one, in its language's words (lowercase ASCII), never colliding with another
//       page; AE has none (and its page is a 404); the checker's "has a page" test is the same rule
//   3 · a French page on fixtures (live through auto-publish): French words, the French address, French Markdown and JSON twins; hreflang
//       names every live comparison page (DE and FR) and only those; the sitemap lists exactly the live ones with that set; a page not
//       live is a 404 and in no sitemap
//   4 · number and currency formats come from the formatters (no amount typed into any translation)
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'compare-languages-1' })
const REPO = kit.REPO
const { parse, TYPE } = require(path.join(REPO, 'node_modules/@formatjs/icu-messageformat-parser'))

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const leaves = (o, p = '') => Object.entries(o ?? {}).flatMap(([k, v]) => (v && typeof v === 'object' ? leaves(v, p ? `${p}.${k}` : k) : [[p ? `${p}.${k}` : k, v]]))
const BASES = ['fr-FR', 'de-DE', 'es-ES', 'it-IT', 'pt-PT', 'nl-NL', 'sv-SE', 'da-DK', 'nb-NO', 'pl-PL', 'cs-CZ', 'hu-HU', 'sk-SK', 'ro-RO', 'hr-HR', 'sl-SI', 'fi-FI', 'et-EE', 'lv-LV', 'lt-LT', 'el-GR', 'bg-BG', 'pt-BR', 'ms-MY', 'ja-JP', 'zh-HK', 'th-TH', 'ar-AE']
const VARIANTS = ['en-US', 'es-MX', 'fr-LU', 'de-CH', 'de-LI', 'en-CA']

function shape(ast, acc = { args: new Set(), opts: new Set(), tags: new Set() }) {
  for (const n of ast) {
    if ([TYPE.argument, TYPE.number, TYPE.date, TYPE.time].includes(n.type)) acc.args.add(n.value)
    if (n.type === TYPE.plural || n.type === TYPE.select) { acc.args.add(n.value); for (const [k, o] of Object.entries(n.options)) { if (n.type === TYPE.select || k.startsWith('=') || k === 'other') acc.opts.add(`${n.value}:${k}`); shape(o.value, acc) } }
    if (n.type === TYPE.tag) { acc.tags.add(n.value); shape(n.children, acc) }
  }
  return acc
}
const sig = s => { const a = shape(parse(s, { ignoreTag: false })); return JSON.stringify([[...a.args].sort(), [...a.opts].sort(), [...a.tags].sort()]) }

;(async () => {
  const en = Object.fromEntries(leaves(JSON.parse(read('messages/en-GB.json')).comparison))
  // ══ 1 · words ══
  head('1 · the words: every language base, whole and well-formed')
  const bad = [], missing = [], noBack = []
  for (const l of BASES) {
    const m = Object.fromEntries(leaves(JSON.parse(read(`messages/${l}.json`)).comparison))
    for (const k of Object.keys(en)) if (typeof m[k] !== 'string' || !m[k].trim()) missing.push(`${l} ${k}`)
    for (const [k, v] of Object.entries(m)) { if (!(k in en)) { bad.push(`${l} extra ${k}`); continue } try { if (sig(v) !== sig(en[k])) bad.push(`${l} ${k}`) } catch (e) { bad.push(`${l} ${k} does not parse`) } }
    if (l !== 'de-DE') { const back = JSON.parse(read(`docs/i18n/back/${l}.json`)); for (const k of Object.keys(en)) if (typeof back[`comparison.${k}`] !== 'string') noBack.push(`${l} ${k}`) }
  }
  t(`all ${BASES.length} language bases have every one of the ${Object.keys(en).length} comparison strings (none falls back to English)`, !missing.length, missing.slice(0, 20))
  t('…each with en-GB\'s placeholders, select options, exact plural cases and tags, and each parses', !bad.length, bad.slice(0, 20))
  t('…and a back-translation for every key (docs/i18n/back)', !noBack.length, noBack.slice(0, 20))
  const vbad = []
  for (const l of VARIANTS) for (const [k, v] of leaves(JSON.parse(read(`messages/${l}.json`)).comparison)) { if (!(k in en)) vbad.push(`${l} ${k}`); else try { if (sig(v) !== sig(en[k])) vbad.push(`${l} ${k}`) } catch { vbad.push(`${l} ${k} parse`) } }
  t('the variants (en-US, es-MX, fr-LU, de-CH, de-LI, en-CA) override only existing keys, well-formed', !vbad.length, vbad)
  const lu = JSON.parse(read('messages/fr-LU.json')).comparison, ch = JSON.parse(read('messages/de-CH.json')).comparison, li = JSON.parse(read('messages/de-LI.json')).comparison
  t('…fr-LU says "au {country}", de-CH "in der {country}", de-LI "in {country}" (the country names\' own grammar)', /au \{country\}/.test(lu.faq.costQ) && /in der \{country\}/.test(ch.faq.costQ) && /in \{country\}/.test(li.faq.costQ) && !/der/.test(li.faq.costQ))
  t('the namespace is no longer scoped to English and German (docs/i18n/scoped-namespaces.json)', !('comparison' in JSON.parse(read('docs/i18n/scoped-namespaces.json'))))
  const typed = BASES.flatMap(l => leaves(JSON.parse(read(`messages/${l}.json`)).comparison).filter(([k, v]) => /[€$£¥]|\b(EUR|USD|GBP|CHF|PLN|JPY|BRL)\b/.test(v) && !/[€$£¥]|\b(EUR|USD|GBP)\b/.test(en[k])).map(([k]) => `${l} ${k}`))
  t('4 · no currency typed into any translation that the English does not have (amounts come from the formatters)', !typed.length, typed)

  // ══ 2 · addresses ══
  head('2 · the addresses: every country but AE, in its own words')
  const L = await kit.bundle('cl1-lib', [
    "export { comparisonPath } from '@/lib/comparison-server'", "export { COUNTRY_PATH_SEGMENTS } from '@/lib/marketing-country'",
    "export { NO_COMPARISON_PAGE } from '@/lib/comparison-types'", "export { LOCALES } from '@/lib/i18n/locales'",
  ].join('\n'))
  const rows = require('./_europe-settings-fixtures.cjs').rowsWith([])
  const codes = Object.keys(L.COUNTRY_PATH_SEGMENTS)
  // A country's locale: the fixture's row, else the authored locale whose region is the country (lib/i18n/locales.ts LOCALES).
  // ⚠️ RE-PINNED (world-countries-5, 12 November 2026): the 167 new countries (segments added, rows switched off) take their row's locale
  // from scripts/_world-countries-5-rows.cjs — the fixture rows predate them.
  const WC5 = Object.fromEntries(require('./_world-countries-5-rows.cjs').ROWS.map(r => [r.code, r.locale]))   // eslint-disable-line @typescript-eslint/no-require-imports -- CommonJS harness module
  const localeOf = c => rows.find(r => r.countryCode === c)?.locale ?? WC5[c] ?? L.LOCALES.find(l => l.endsWith(`-${c}`)) ?? null
  const addr = codes.map(c => [c, localeOf(c), localeOf(c) ? L.comparisonPath(c, localeOf(c)) : 'no-locale'])
  const none = addr.filter(([c, , p]) => c !== 'AE' && !p)
  t(`every country with an address has a comparison address but AE (${addr.filter(a => a[2] && a[2] !== 'no-locale').length} of ${codes.length})`, !none.length && L.comparisonPath('AE', 'ar-AE') === null && L.NO_COMPARISON_PAGE.includes('AE'), none)
  const shapeBad = addr.filter(([, , p]) => p && !/^\/[a-z]{2}\/[a-z0-9]+(-[a-z0-9]+)*\/[a-z0-9]+(-[a-z0-9]+)*$/.test(p))
  t('…each lowercase ASCII words, /<country>/<section>/<slug>', !shapeBad.length, shapeBad)
  const taken = addr.filter(([, , p]) => p && /^\/[a-z]{2}\/(features|compare|faq|privacy|terms)\//.test(p))
  t('…never a section another page uses (features, compare, faq, privacy, terms)', !taken.length, taken)
  t('…in the language\'s own words where it is written in Latin script (FR comparatif, PL porownanie, ES comparativa, NL vergelijking)',
    ['FR:/fr/comparatif/', 'IT:/it/confronto/', 'PL:/pl/porownanie/', 'ES:/es/comparativa/', 'NL:/nl/vergelijking/', 'DE:/de/vergleich/', 'GB:/uk/comparison/'].every(x => { const [c, p] = x.split(':'); return (addr.find(a => a[0] === c)?.[2] ?? '').startsWith(p) }), addr.filter(a => ['FR', 'IT', 'PL', 'ES', 'NL', 'DE', 'GB'].includes(a[0])))
  t('the checker\'s "has a page" test is the same rule (every address but AE)', /hasPage: code => !!COUNTRY_PATH_SEGMENTS\[code\] && !NO_COMPARISON_PAGE\.includes\(code\)/.test(read('scripts/competitor-check/main.ts')))
  t('no code limits comparison pages to English and German any more', !/\(de\|en\)\(-\|\$\)/.test(read('lib/comparison-server.ts') + read('scripts/competitor-check/main.ts')))

  // ══ 3 · a French page ══
  head('3 · an Italian page on fixtures (live through auto-publish): words, address, twins, hreflang, sitemap')
  const FX = require('./_compare-de-1-fixtures.cjs')
  const R = await FX.renderer(kit, 'cl1r')
  const cmp = FX.CMP_TABLES()
  const toFR = rows => rows.flatMap(r => [r, { ...r, id: `${r.id}-fr`, country_code: 'IT', ...(r.primary_plan_id ? { primary_plan_id: `${r.primary_plan_id}-fr` } : {}) }])
  const auto = { auto_verified_at: '2026-11-08T09:00:00Z', auto_blocked: false }
  const tables = {
    competitor_plans: toFR(cmp.competitor_plans).map(p => ({ ...p, ...auto })),
    comparison_entries: toFR(cmp.comparison_entries).map(e => ({ ...e, ...auto, pinned: false, hidden: false })),
    comparison_publish: [{ country_code: 'DE', auto_publish: true, auto_live: true, admin_off: false, shown: [] }, { country_code: 'IT', auto_publish: true, auto_live: true, admin_off: false, shown: [] }],
  }
  const fr = JSON.parse(read('messages/it-IT.json')).comparison
  const FRP = { country: 'it', section: fr.path.section, slug: fr.path.slug }
  const page = await R.page({ status: 'admin', tables, params: FRP, enable: ['IT'] })
  const html = page.html || ''
  t(`the Italian page renders at /it/${fr.path.section}/${fr.path.slug} for an anonymous visitor (live)`, !page.notFound && !!html, page.notFound)
  t('…its heading, methodology and FAQ title in Italian', html.includes(fr.h1.replace(/'/g, '&#x27;').split('{')[0].slice(0, 20)) && html.includes(fr.method.title.replace(/'/g, '&#x27;')) && html.includes(fr.faq.title.replace(/'/g, '&#x27;')))
  t('…"Report an error" in Italian, opening the comparison-correction topic', html.includes(`<a href="/contact?topic=comparison">${fr.method.reportError.replace(/<\/?link>/g, '')}</a>`))
  t('…amounts written the Italian way by the formatter (a comma decimal, e.g. 49,00 €)', /\d+,\d{2}\s?€/.test(html.replace(/ | /g, ' ')))
  const meta = page.meta ?? {}
  const langs = meta.alternates?.languages ?? {}
  t('hreflang names every live comparison page — de-DE and it-IT — and nothing else', Object.keys(langs).sort().join() === 'de-DE,it-IT' && langs['it-IT'].endsWith(`/it/${fr.path.section}/${fr.path.slug}`) && langs['de-DE'].endsWith('/de/vergleich/foodtruck-bestellsystem'), langs)
  t('…canonical is the page itself; the title and description are Italian', meta.alternates?.canonical?.endsWith(`/it/${fr.path.section}/${fr.path.slug}`) && meta.title?.absolute === fr.meta.title && meta.description === fr.meta.description, { c: meta.alternates?.canonical, title: meta.title })
  const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
  const twin = format => R.req({ status: 'admin', tables, enable: ['IT'] }, async () => (await R.M.twinGET(new NextRequest(`http://hatchgrab.localhost:3000/it/${FRP.section}/${FRP.slug}.${format}`, { headers: { host: 'hatchgrab.localhost:3000' } }), { params: Promise.resolve({ ...FRP, format }) })).text())
  const md = await twin('md'), js = JSON.parse(await twin('json'))
  t('the Markdown twin is Italian (its title, its methodology)', md.startsWith(`# ${fr.h1.split('{')[0].trim().slice(0, 15)}`) && md.includes(`## ${fr.method.title}`), md.slice(0, 200))
  t('the JSON twin says its language is it-IT and carries the Italian words', js.language === 'it-IT' && js.method.includes(fr.method.prices), js.language)
  const sm = await R.sitemap({ status: 'admin', tables, enable: ['IT'] })
  const cmpUrls = sm.filter(e => /\/(vergleich|confronto)\//.test(e.url))
  t('the sitemap lists the two live comparison pages, each with the whole live hreflang set', cmpUrls.length === 2 && cmpUrls.every(e => Object.keys(e.alternates?.languages ?? {}).sort().join() === 'de-DE,it-IT'), cmpUrls.map(e => [e.url, e.alternates]))
  const offTables = { ...tables, comparison_publish: [tables.comparison_publish[0]] }
  const off = await R.page({ status: 'admin', tables: offTables, params: FRP, enable: ['IT'] })
  const sm2 = await R.sitemap({ status: 'admin', tables: offTables, enable: ['IT'] })
  t('a page not live (IT without auto-live): a 404, absent from the sitemap and from DE\'s hreflang', off.notFound === true && !sm2.some(e => /confronto/.test(e.url)) && !Object.keys((await R.page({ status: 'admin', tables: offTables })).meta?.alternates?.languages ?? {}).includes('it-IT'))
  const ae = await R.page({ status: 'admin', admin: true, tables, params: { country: 'ae', section: 'comparison', slug: 'food-truck-ordering-system' } })
  t('AE: no comparison page, even for an admin (404)', ae.notFound === true)

  console.log(`\n${fail ? '🔴' : '✅'} compare-languages-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
