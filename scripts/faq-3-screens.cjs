#!/usr/bin/env node
// scripts/faq-3-screens.cjs — faq-3 (2 November 2026, docs/faq-3-report.md): THE LANDING PAGE'S FAQ IN WEBKIT, against Dominic's
// approved mockup (docs/faq-3/faq-public-mockup.png). Needs a build (`.next/static`, for landing.css and the real fonts) and a local
// WebKit; app/landing/faq.css is added to the page from the source, so a build from before faq-3 is enough.
//   node scripts/faq-3-screens.cjs
//   /uk at 1440 (the first question open, as the mockup's laptop) → docs/faq-3/faq-uk-1440.png
//   /us at 430  (the second question open, as the mockup's phone)  → docs/faq-3/faq-us-430.png
// Each over the FAQ rows read live (scripts/fixtures/faq-3-rows.json). Checks: nothing scrolls sideways; the heading is centred; every
// question row has its orange +, the open one its −; the labels are small capitals.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'faq-3-screens' })
const LP1E = require('./_lp1e-fixtures.cjs')
const WF = require('./_world-countries-1-fixtures.cjs')
const RF = require('./_real-fonts.cjs')
const FIX = require('./fixtures/faq-3-rows.json')
const { REPO } = kit
const OUT = path.join(REPO, 'docs/faq-3')
let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 900)}` : '')) } }

;(async () => {
  const ctx = LP1E.context(kit, REPO)
  const M = await ctx.bundle('faq3-screens', [
    "export { default as Landing } from '@/app/(public)/[country]/page'",
    "export { clearPublicFaqCache as __faq } from '@/lib/faq/public'",
    "export { clearPlanCatalogCache as __p } from '@/lib/plans-server'",
    "export { clearComparisonCache as __cmp } from '@/lib/comparison-flags'",
  ].join('\n'))
  const wf = WF.renderer(kit, 'faq3-screens-tables')
  const ROWS = WF.rowsWith(WF.WORLD).map(r => ({ ...r, iosAppAvailable: r.countryCode === 'GB', androidAppAvailable: r.countryCode === 'GB' }))
  const render = seg => kit.quietAsync(() => ctx.withReq({ rows: ROWS, tables: { ...wf.tables, faq_sections: FIX.faq_sections, faq_items: FIX.faq_items } }, async () => {
    M.__p(); M.__cmp(); M.__faq()
    return ctx.prerender(kit.h(M.Landing, { params: Promise.resolve({ country: seg }), searchParams: Promise.resolve({}) }))
  }))
  const B = RF.built()
  const faqCss = fs.readFileSync(path.join(REPO, 'app/(public)/(site)/landing/faq.css'), 'utf8')
  const { webkit } = require(path.join(REPO, 'node_modules/playwright'))
  const browser = await webkit.launch()
  fs.mkdirSync(OUT, { recursive: true })
  try {
    for (const { seg, width, open, file } of [{ seg: 'uk', width: 1440, open: 0, file: 'faq-uk-1440.png' }, { seg: 'us', width: 430, open: 1, file: 'faq-us-430.png' }]) {
      const html = await render(seg)
      const { page, ctx: bctx } = await RF.open(browser, { html, lang: seg === 'uk' ? 'en-GB' : 'en-US', width, height: 932, B })
      await page.addStyleTag({ content: faqCss })
      await page.addStyleTag({ content: 'nav{position:static!important}' })   // the sticky header out of the photograph only
      await page.evaluate(i => { document.querySelectorAll('#faq details')[i].open = true }, open)
      await page.waitForTimeout(200)
      const info = await page.evaluate(() => {
        const sec = document.querySelector('#faq'), h2 = sec.querySelector('h2'), r = h2.getBoundingClientRect()
        const marks = [...sec.querySelectorAll('details')].map(d => ({ open: d.open, mark: getComputedStyle(d.querySelector('summary'), '::after').content, color: getComputedStyle(d.querySelector('summary'), '::after').color }))
        const label = getComputedStyle(sec.querySelector('.faq-label'))
        return { sideways: document.documentElement.scrollWidth > innerWidth + 1, h2Mid: (r.left + r.right) / 2, vw: innerWidth, h2Align: getComputedStyle(h2.parentElement).textAlign,
          marks, labelCase: label.textTransform, labelSize: label.fontSize, after: sec.nextElementSibling?.id, before: sec.previousElementSibling?.id }
      })
      t(`/${seg} ${width}: nothing scrolls sideways`, !info.sideways, info)
      t(`/${seg} ${width}: between pricing and the final CTA`, info.before === 'pricing' && info.after === 'try', info)
      t(`/${seg} ${width}: heading centred`, info.h2Align === 'center' && Math.abs(info.h2Mid - info.vw / 2) < 24, info)
      t(`/${seg} ${width}: every row has its orange "+", the open one "−"`, info.marks.every(m => (m.open ? m.mark === '"−"' : m.mark === '"+"') && m.color === 'rgb(239, 139, 44)'), info.marks.slice(0, 3))
      t(`/${seg} ${width}: section labels in small capitals`, info.labelCase === 'uppercase', info)
      await page.locator('#faq').screenshot({ path: path.join(OUT, file) })
      console.log(`  → docs/faq-3/${file}`)
      await bctx.close()
    }
  } finally { await browser.close() }
  console.log(`\n${fail ? '🔴' : '✅'} faq-3-screens: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
