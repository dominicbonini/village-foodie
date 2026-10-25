#!/usr/bin/env node
// scripts/compare-de-1-screens.cjs — compare-de-1 (24 October 2026, docs/compare-de-1-report.md): the German comparison
// page photographed in WebKit (Safari's engine) and Chromium at 1512 and 390, FIXTURE DATA ONLY (scripts/_compare-de-1-
// fixtures.cjs: fictional "Testanbieter A/B/C" — no real competitor, no database, no network).
//   node scripts/compare-de-1-screens.cjs     (needs a completed `npm run build` for the fonts and base CSS, and Playwright)
//
// The page is server-rendered by the REAL route (the render kit), served with the built CSS and fonts (_real-fonts.cjs),
// plus this change's own stylesheet from source (app/[country]/[section]/[slug]/comparison.css and the footer's new
// `.foot-col` rules) — so it does not depend on a build made after this change. Writes into docs/compare-de-1/:
//   <engine>-admin-<w>.png     the admin view (status 'admin', a verified admin): banner, checklist, every entry badged
//   <engine>-public-<w>.png    the public view (status 'live', anonymous): HatchGrab + the verified competitor only
//   <engine>-footer-<w>.png    the /de landing footer with the "Vergleich" column (status 'live')
// …and FAILS if: the page scrolls sideways at 390 (only the table's own box may); the table box does not scroll sideways at
// 390; the "Vergleich" column is missing from the footer; an unverified competitor shows in the public view.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'compare-de-1-screens' })
const RF = require('./_real-fonts.cjs')
const F = require('./_compare-de-1-fixtures.cjs')
const { REPO } = kit
const OUT = path.join(REPO, 'docs/compare-de-1')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 900)}` : '')) } }

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const B = RF.built()
  // This change's CSS from source: the comparison page's file and the footer's "Vergleich" block in landing.css.
  const landingCss = fs.readFileSync(path.join(REPO, 'app/landing/landing.css'), 'utf8')
  const footCol = (/\/\* compare-de-1 \(24 October 2026\): the "Vergleich" column[\s\S]*?\.hg-landing \.foot-col a:hover \{[^}]*\}/.exec(landingCss) || [''])[0]
  const css = `<style>${fs.readFileSync(path.join(REPO, 'app/[country]/[section]/[slug]/comparison.css'), 'utf8')}\n${footCol}</style>`
  if (!footCol) throw new Error('the footer\'s .foot-col rules are not in app/landing/landing.css')
  const R = await F.renderer(kit, 'cde1s')
  const views = {
    admin: (await R.page({ status: 'admin', admin: true })).html,
    public: (await R.page({ status: 'live' })).html,
    footer: await R.landing('live'),
  }
  t('fixtures: the public view holds Testanbieter A and not B or C; the admin view holds all three', /Testanbieter A/.test(views.public) && !/Testanbieter [BC]/.test(views.public) && /Testanbieter C/.test(views.admin))
  const pw = require(path.join(REPO, 'node_modules/playwright'))
  for (const engine of ['webkit', 'chromium']) {
    const browser = await pw[engine].launch()
    try {
      for (const width of [1512, 390]) {
        for (const [name, html] of Object.entries(views)) {
          const v = await RF.open(browser, { html: css + html, lang: 'de-DE', width, height: width > 500 ? 945 : 844, B })
          const m = await v.page.evaluate(() => {
            const box = document.querySelector('.cmp-scroll')
            return { pageScrollsSideways: document.documentElement.scrollWidth > innerWidth + 1, boxScrolls: box ? box.scrollWidth > box.clientWidth + 1 : null,
              footCol: !!document.querySelector('[data-footer-comparison="live"]') }
          })
          if (name === 'footer') {
            t(`${engine} ${width}: the footer shows the "Vergleich" column`, m.footCol, m)
            await v.page.locator('footer').screenshot({ path: path.join(OUT, `${engine}-footer-${width}.png`) })
          } else {
            t(`${engine} ${width} ${name}: the page never scrolls sideways`, !m.pageScrollsSideways, m)
            if (width === 390) t(`${engine} 390 ${name}: the table scrolls sideways inside its own box`, m.boxScrolls === true, m)
            await v.page.screenshot({ path: path.join(OUT, `${engine}-${name}-${width}.png`), fullPage: true })
          }
          await v.ctx.close()
        }
      }
    } finally { await browser.close() }
  }
  console.log(`\n${fail ? '🔴' : '✅'} compare-de-1-screens: ${pass} passed, ${fail} failed — ${OUT}`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
