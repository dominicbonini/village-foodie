#!/usr/bin/env node
// scripts/compare-suits-1-render.cjs — compare-suits-1 (6 November 2026, docs/compare-suits-1-report.md): the GB, US and DE comparison
// pages rendered from a READ-ONLY EXPORT of the real rows, by the REAL page route and twins, on the render kit's in-memory stand-in.
//   node scripts/compare-suits-1-render.cjs <tables.json> <outdir> [--shots]
// <tables.json>: { "<table>": [rows…] } — country_settings, plans, plan_prices, plan_features, comparison_entries, competitors,
// competitor_plans, comparison_features, competitor_feature_values, country_benchmarks, competitor_feature_checks, competitor_check_findings
// (exported with SELECTs only). 🔴 GB, US and DE are set to comparison_status 'admin' IN THE STAND-IN ONLY — the real rows are
// untouched (GB and US are 'off' there, DE 'admin'), so this is the ADMIN PREVIEW of pages nobody can see yet, every column unverified.
// Writes <outdir>/<cc>-admin.html|.md|.json and the public view's .html; --shots also photographs the UK page at 390 and 1280 (Chromium,
// the built fonts and CSS — needs a completed `npm run build`). By hand only (it needs an export): listed in harnesses.json's excluded group.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS script, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'compare-suits-1-render' })
const FX = require('./_compare-de-1-fixtures.cjs')
const { REPO } = kit
const [file, outdir] = process.argv.slice(2)
if (!file || !outdir) { console.error('usage: node scripts/compare-suits-1-render.cjs <tables.json> <outdir> [--shots]'); process.exit(2) }

const PAGES = [
  { code: 'GB', params: { country: 'uk', section: 'comparison', slug: 'food-truck-ordering-system' }, lang: 'en-GB' },
  { code: 'US', params: { country: 'us', section: 'comparison', slug: 'food-truck-ordering-system' }, lang: 'en-US' },
  { code: 'DE', params: { country: 'de', section: 'vergleich', slug: 'foodtruck-bestellsystem' }, lang: 'de-DE' },
]

;(async () => {
  fs.mkdirSync(outdir, { recursive: true })
  const real = JSON.parse(fs.readFileSync(file, 'utf8'))
  const tables = { ...real, country_settings: real.country_settings.map(r => (['GB', 'US', 'DE'].includes(r.country_code) ? { ...r, comparison_status: 'admin' } : r)) }
  const R = await FX.renderer(kit, 'cs1real')
  // The render's "today" (HatchGrab's own cells are checked today). The fixture context sets its own fixed clock on every request,
  // so the clock is set once here and then held.
  kit.setNow(process.env.CS1_NOW || new Date().toISOString()); kit.setNow = () => {}
  const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
  const summary = {}
  for (const p of PAGES) {
    const cc = p.code.toLowerCase()
    const admin = await R.page({ status: 'admin', admin: true, tables, params: p.params })
    const pub = await R.page({ status: 'admin', admin: true, tables, params: p.params, search: { view: 'public' } })
    if (admin.notFound) throw new Error(`${p.code}: the page answered 404`)
    fs.writeFileSync(path.join(outdir, `${cc}-admin.html`), admin.html)
    fs.writeFileSync(path.join(outdir, `${cc}-public.html`), pub.html)
    for (const format of ['md', 'json']) {
      const body = await R.req({ status: 'admin', admin: true, tables }, async () => {
        const url = `http://hatchgrab.localhost:3000/${p.params.country}/${p.params.section}/${p.params.slug}.${format}?view=admin`
        const r = await R.M.twinGET(new NextRequest(url, { headers: { host: 'hatchgrab.localhost:3000' } }), { params: Promise.resolve({ ...p.params, format }) })
        return r.text()
      })
      fs.writeFileSync(path.join(outdir, `${cc}-admin.${format}`), body)
      if (format === 'json') {
        const j = JSON.parse(body)
        summary[p.code] = {
          shown: j.tools.filter(x => !x.isPublisher).map(x => x.name),
          notListedCells: j.rows.reduce((n, r) => n + r.cells.filter(c => c.value === 'not_listed').length, 0),
          notMentionedCells: j.rows.reduce((n, r) => n + r.cells.filter(c => c.value === 'not_mentioned').length, 0),
          answers: (j.suits?.answers ?? []).map(a => a.key),
          publicTools: (pub.html.match(/data-tool="[^"]+"/g) || []).map(s => s.slice(11, -1)),
        }
      }
    }
  }
  fs.writeFileSync(path.join(outdir, 'summary.json'), JSON.stringify(summary, null, 1))
  if (process.argv.includes('--shots')) {
    // The UK page, admin preview (every column unverified): full page, the "Which suits" section and the table, at 390 and 1280.
    const RF = require('./_real-fonts.cjs')
    const B = RF.built()
    const css = `<style>${fs.readFileSync(path.join(REPO, 'app/[country]/[section]/[slug]/comparison.css'), 'utf8')}</style>`
    const html = fs.readFileSync(path.join(outdir, 'gb-admin.html'), 'utf8')
    const pw = require(path.join(REPO, 'node_modules/playwright'))
    const browser = await pw.chromium.launch()
    try {
      for (const width of [390, 1280]) {
        const v = await RF.open(browser, { html: css + html, lang: 'en-GB', width, height: width > 500 ? 900 : 844, B })
        const m = await v.page.evaluate(() => ({ sideways: document.documentElement.scrollWidth > innerWidth + 1, suits: !!document.querySelector('[data-suits]'), cols: document.querySelectorAll('.cmp-table thead th[data-tool]').length }))
        console.log(`uk ${width}: page scrolls sideways ${m.sideways}; section ${m.suits}; columns ${m.cols}`)
        await v.page.screenshot({ path: path.join(outdir, `uk-admin-${width}.png`), fullPage: true })
        // The crops below: the site header stays where it is instead of floating over them (the full-page shot above is untouched).
        await v.page.evaluate(() => { for (const e of document.querySelectorAll('body *')) { const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') e.style.setProperty('position', 'static', 'important') } })
        const suits = v.page.locator('[data-suits]'); if (await suits.count()) await suits.screenshot({ path: path.join(outdir, `uk-suits-${width}.png`) })
        await v.page.locator('[data-table]').locator('xpath=ancestor::section[1]').screenshot({ path: path.join(outdir, `uk-table-${width}.png`) })
        await v.ctx.close()
      }
    } finally { await browser.close() }
  }
  console.log(JSON.stringify(summary, null, 1))
})().catch(e => { console.error(e); process.exit(1) })
