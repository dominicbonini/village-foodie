#!/usr/bin/env node
// scripts/compare-languages-1-render.cjs — compare-languages-1 §5 (8 November 2026, docs/compare-languages-1-report.md): countries' comparison
// pages in their own languages — the ADMIN PREVIEW, rendered from a READ-ONLY EXPORT of the real rows by the real page route and twins, on
// the render kit's stand-in (each named country's status set to 'admin' IN THE STAND-IN ONLY; the real rows are untouched).
//   node scripts/compare-languages-1-render.cjs <tables.json> <outdir> FR ES IT JP PL BR
// For each: <outdir>/<cc>-admin.html, .md, .json, and in summary.json the ENGLISH LEFT — every en-GB string of the page's own words
// (comparison, comparisonSuits; two words or more once placeholders and tags are taken out) found in the page's visible text, its
// Markdown or its JSON. Admin-only words are reported apart (they may stay English). The competitors' own notes are DATA (the checker
// writes them in English) and are counted separately, never as a translation gap.
// By hand only (it needs an export): listed in harnesses.json's excluded group.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS script, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'compare-languages-1-render' })
const FX = require('./_compare-de-1-fixtures.cjs')
const { REPO } = kit
const [file, outdir, ...codes] = process.argv.slice(2)
if (!file || !outdir || !codes.length) { console.error('usage: node scripts/compare-languages-1-render.cjs <tables.json> <outdir> <CC…>'); process.exit(2) }

const leaves = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? leaves(v, p ? `${p}.${k}` : k) : [[p ? `${p}.${k}` : k, v]]))
const ents = s => s.replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;| /g, ' ')
const visible = html => ents(html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ')
const BRANDS = /^(HatchGrab|PayPal|Klarna|Apple Pay|Google Pay|WhatsApp|iPad|Android|iOS|BLIK|iDEAL|Swish|MobilePay|Stripe|SumUp|Square|Village Foodie|Markdown|JSON)$/

;(async () => {
  fs.mkdirSync(outdir, { recursive: true })
  const tables = JSON.parse(fs.readFileSync(file, 'utf8'))
  const R = await FX.renderer(kit, 'cl1real')
  const L = await kit.bundle('cl1-lib', ["export { COUNTRY_PATH_SEGMENTS } from '@/lib/marketing-country'", "export { translatorFor } from '@/lib/i18n/translator'", "import '@/lib/i18n/catalog/comparison'"].join('\n'))
  kit.setNow(process.env.CL1_NOW || new Date().toISOString()); kit.setNow = () => {}
  const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
  const en = JSON.parse(fs.readFileSync(path.join(REPO, 'messages/en-GB.json'), 'utf8'))
  // The page's own English words: each string with placeholders, ICU and tags taken out, split into its literal runs of two words or more.
  const runs = (ns, adminOnly) => leaves(en[ns]).filter(([k]) => (k.startsWith('admin.') || k === 'adminPreview') === adminOnly && !k.startsWith('path.'))
    .flatMap(([k, v]) => String(v).replace(/<\/?[a-z]+>/g, '|').replace(/\{[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, '|').split('|').map(x => x.trim()).filter(x => x.split(/\s+/).length >= 2 && !BRANDS.test(x)).map(x => ({ key: `${ns}.${k}`, text: x })))
  const PAGE = [...runs('comparison', false), ...runs('comparisonSuits', false)], ADMIN = [...runs('comparison', true), ...runs('comparisonSuits', true)]
  const notesOf = cc => new Set(tables.competitor_feature_values.map(v => v.note).filter(Boolean).concat(tables.competitor_plans.filter(p => p.country_code === cc).map(p => p.notes).filter(Boolean)))
  const summary = {}
  for (const cc of codes) {
    const cs = tables.country_settings.find(r => r.country_code === cc)
    const t = L.translatorFor(cs.locale, 'comparison')
    const params = { country: L.COUNTRY_PATH_SEGMENTS[cc], section: t('path.section'), slug: t('path.slug') }
    const tbl = { ...tables, country_settings: tables.country_settings.map(r => (r.country_code === cc ? { ...r, comparison_status: 'admin' } : r)) }
    const page = await R.page({ status: 'admin', admin: true, tables: tbl, params })
    if (page.notFound) { summary[cc] = { error: '404' }; continue }
    const twin = async format => R.req({ status: 'admin', admin: true, tables: tbl }, async () =>
      (await R.M.twinGET(new NextRequest(`http://hatchgrab.localhost:3000/${params.country}/${params.section}/${params.slug}.${format}?view=admin`, { headers: { host: 'hatchgrab.localhost:3000' } }), { params: Promise.resolve({ ...params, format }) })).text())
    const md = await twin('md'), js = await twin('json')
    const lc = cc.toLowerCase()
    fs.writeFileSync(path.join(outdir, `${lc}-admin.html`), page.html); fs.writeFileSync(path.join(outdir, `${lc}-admin.md`), md); fs.writeFileSync(path.join(outdir, `${lc}-admin.json`), js)
    const text = `${visible(page.html)} \n ${md} \n ${js}`
    const notes = notesOf(cc)
    const hit = list => [...new Map(list.filter(r => text.includes(r.text) && ![...notes].some(n => n.includes(r.text))).map(r => [r.key + r.text, r])).values()]
    const j = JSON.parse(js)
    summary[cc] = {
      locale: cs.locale, address: `/${params.country}/${params.section}/${params.slug}`, lang: /<html[^>]* lang="([^"]+)"/.exec(page.html)?.[1] ?? null, dir: /<html[^>]* dir="([^"]+)"/.exec(page.html)?.[1] ?? 'ltr',
      title: /<title>([^<]*)<\/title>/.exec(page.html)?.[1] ?? null, h1: ents(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(page.html)?.[1]?.replace(/<[^>]+>/g, '') ?? ''),
      columns: (page.html.match(/data-tool="[^"]+"/g) || []).length, jsonLanguage: j.language ?? null,
      englishLeftPage: hit(PAGE), englishLeftAdminOnly: hit(ADMIN).length,
      competitorNotesShown: [...notes].filter(n => text.includes(n)).length,
    }
    console.log(`${cc} ${summary[cc].address} · lang ${summary[cc].lang} · English left (page words): ${summary[cc].englishLeftPage.length} · admin-only: ${summary[cc].englishLeftAdminOnly} · competitor notes (data): ${summary[cc].competitorNotesShown}`)
  }
  fs.writeFileSync(path.join(outdir, 'summary.json'), JSON.stringify(summary, null, 1))
})().catch(e => { console.error(e); process.exit(1) })
