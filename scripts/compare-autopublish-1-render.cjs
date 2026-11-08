#!/usr/bin/env node
// scripts/compare-autopublish-1-render.cjs — compare-autopublish-1 §7 (7 November 2026, docs/compare-autopublish-1-report.md): the GB, US and DE
// comparison pages AS THE PUBLIC SEES THEM after the one-off automatic publishing run — rendered from a READ-ONLY EXPORT of the real rows
// (country_settings and comparison_publish as they are: NOTHING overridden) by the real page route and twins, on the render kit's stand-in.
//   node scripts/compare-autopublish-1-render.cjs <tables.json> <outdir>
// <tables.json>: compare-suits-1-render.cjs's tables plus comparison_publish. A country that is live is rendered for an ANONYMOUS visitor; one
// that is not (404 for the public) is rendered as an admin's "public view" preview instead, and the summary says so.
// By hand only (it needs an export): listed in harnesses.json's excluded group, like compare-suits-1-render.cjs.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS script, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'compare-autopublish-1-render' })
const FX = require('./_compare-de-1-fixtures.cjs')
const { REPO } = kit
const [file, outdir] = process.argv.slice(2)
if (!file || !outdir) { console.error('usage: node scripts/compare-autopublish-1-render.cjs <tables.json> <outdir>'); process.exit(2) }

const PAGES = [
  { code: 'GB', params: { country: 'uk', section: 'comparison', slug: 'food-truck-ordering-system' } },
  { code: 'US', params: { country: 'us', section: 'comparison', slug: 'food-truck-ordering-system' } },
  { code: 'DE', params: { country: 'de', section: 'vergleich', slug: 'foodtruck-bestellsystem' } },
]

;(async () => {
  fs.mkdirSync(outdir, { recursive: true })
  const tables = JSON.parse(fs.readFileSync(file, 'utf8'))
  const R = await FX.renderer(kit, 'ap1real')
  kit.setNow(process.env.AP1_NOW || new Date().toISOString()); kit.setNow = () => {}
  const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
  const own = Object.fromEntries(tables.country_settings.map(r => [r.country_code, r.comparison_status]))
  const summary = {}
  for (const p of PAGES) {
    const cc = p.code.toLowerCase()
    // The stand-in's own country row (getCountrySettings) follows the real status; the switches are read from the real tables.
    const status = own[p.code] ?? 'off'
    let view = 'public (anonymous visitor)'
    let r = await R.page({ status, admin: false, tables, params: p.params })
    let tbl = tables
    if (r.notFound) {
      // Not live: a 404 for everyone (Off is a 404 for admins too). The admin's "public view" preview, with the status 'admin' IN THE STAND-IN
      // ONLY (the real row is untouched) — what the public would see if it went live today.
      view = 'NOT LIVE — a 404 for the public; shown: the admin preview\u2019s "public view" (status admin in the stand-in only)'
      tbl = { ...tables, country_settings: tables.country_settings.map(x => (x.country_code === p.code ? { ...x, comparison_status: 'admin' } : x)) }
      r = await R.page({ status: 'admin', admin: true, tables: tbl, params: p.params, search: { view: 'public' } })
    }
    if (r.notFound) { summary[p.code] = { view: 'no page at all' }; continue }
    fs.writeFileSync(path.join(outdir, `${cc}-public.html`), r.html)
    const admin = view.startsWith('public')
    const md = await R.req({ status: admin ? status : 'admin', admin: !admin, tables: tbl }, async () => (await R.M.twinGET(new NextRequest(`http://hatchgrab.localhost:3000/${p.params.country}/${p.params.section}/${p.params.slug}.md${admin ? '' : '?view=public'}`, { headers: { host: 'hatchgrab.localhost:3000' } }), { params: Promise.resolve({ ...p.params, format: 'md' }) })).text())
    fs.writeFileSync(path.join(outdir, `${cc}-public.md`), md)
    const rows = [...r.html.matchAll(/<tr data-row="([a-z_]+)"><th scope="row">([^<]+)<\/th>([\s\S]*?)<\/tr>/g)].map(m => ({ key: m[1], label: m[2], cells: [...m[3].matchAll(/data-value="([a-z_]+)"><span class="cmp-tri[^"]*">([^<]*)</g)].map(c => c[2]) }))
    // The rows hidden publicly (not yet checked for every competitor shown), from the admin's full view of the same data.
    const full = await R.page({ status: admin ? status : 'admin', admin: true, tables: tbl, params: p.params })
    const unchecked = [...(full.html || '').matchAll(/<tr data-row="([a-z_]+)"><th scope="row">((?:(?!<\/th>)[\s\S])*)<\/th>/g)].filter(m => /data-unchecked/.test(m[2])).map(m => m[1])
    const fullRows = (full.html || '').match(/<tr data-row=/g)?.length ?? 0
    summary[p.code] = { unchecked, fullRows,
      view, status: own[p.code], shown: [...r.html.matchAll(/<th scope="col"[^>]*data-tool="([^"]+)"/g)].map(m => m[1]),
      rowsVisible: rows.length, rows,
      suits: [...r.html.matchAll(/data-suit="([^"]+)"/g)].map(m => m[1]),
      reportLink: /data-report-error/.test(r.html),
    }
  }
  fs.writeFileSync(path.join(outdir, 'summary.json'), JSON.stringify(summary, null, 1))
  for (const [k, v] of Object.entries(summary)) console.log(`${k}: ${v.view} · shown ${(v.shown ?? []).join(', ')} · ${v.rowsVisible ?? 0} rows · ${(v.suits ?? []).length} "which suits" answers`)
})().catch(e => { console.error(e); process.exit(1) })
