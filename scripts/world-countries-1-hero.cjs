#!/usr/bin/env node
// scripts/world-countries-1-hero.cjs — world-countries-1 (31 October 2026, docs/world-countries-1-report.md §0): the /uk hero in
// WebKit, before and after the tagline ("Less time booking. More time cooking.") was removed.
//   node scripts/world-countries-1-hero.cjs before|after     (needs `npm run build` for the CSS and fonts, and Playwright's WebKit)
// The REAL /uk page is server-rendered (the live countries, as europe-settings' fixtures hold them), opened with the built CSS
// and fonts (scripts/_real-fonts.cjs, plus public/ so the hero's pictures load), and the top of the page is photographed at 390
// and 1440 wide into docs/world-countries-1/hero-uk-<width>-<before|after>.png. It also prints where the hero's lines sit, so
// the report can say what moved.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'world-countries-1-hero' })
const EF = require('./_europe-settings-fixtures.cjs')
const RF = require('./_real-fonts.cjs')
const { REPO } = kit
const OUT = path.join(REPO, 'docs/world-countries-1')
const PUBLIC = path.join(REPO, 'public')
const which = process.argv[2]
if (!['before', 'after'].includes(which)) { console.error('usage: node scripts/world-countries-1-hero.cjs before|after'); process.exit(2) }

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const R = EF.renderer(kit, 'wc1hero')
  const P = await R.page('landing', 'uk', EF.rowsWith([]))
  const { webkit } = require(path.join(REPO, 'node_modules/playwright'))
  const browser = await webkit.launch()
  try {
    for (const [width, height] of [[390, 844], [1440, 900]]) {
      const B = RF.built()
      const { page, ctx } = await RF.open(browser, { html: P.html, lang: 'en-GB', width, height, B })
      // public/ (the hero's phone pictures): RF.open serves only /_next/static, so the pictures are loaded here and swapped in.
      await page.evaluate(async files => {
        for (const img of document.querySelectorAll('img')) {
          const src = img.getAttribute('src') || ''
          if (files[src]) img.src = files[src]
        }
      }, Object.fromEntries([...P.html.matchAll(/src="(\/[^"]+\.(?:png|jpe?g|webp|svg))"/g)].map(m => m[1]).filter(s => fs.existsSync(path.join(PUBLIC, s)))
        .map(s => [s, `data:image/${s.endsWith('.svg') ? 'svg+xml' : s.endsWith('.png') ? 'png' : s.endsWith('.webp') ? 'webp' : 'jpeg'};base64,${fs.readFileSync(path.join(PUBLIC, s)).toString('base64')}`])))
      await page.waitForTimeout(300)
      const pos = await page.evaluate(() => {
        const box = s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return getComputedStyle(e).display === 'none' ? 'hidden' : Math.round(r.top) + '–' + Math.round(r.bottom) }
        return { h1: box('.hg-landing h1'), sub: box('.hero-sub-sm'), tag: box('.hero-tag'), cta: box('.hero-cta-row'), scrollW: document.documentElement.scrollWidth }
      })
      console.log(`${which} ${width}: ${JSON.stringify(pos)}`)
      await page.screenshot({ path: path.join(OUT, `hero-uk-${width}-${which}.png`) })
      await ctx.close()
    }
  } finally { await browser.close() }
})().catch(e => { console.error(e); process.exit(1) })
