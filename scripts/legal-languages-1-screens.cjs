#!/usr/bin/env node
// scripts/legal-languages-1-screens.cjs — legal-languages-1 (1 November 2026, docs/legal-languages-1-report.md §5): THE TRANSLATED
// PRIVACY POLICY AND TERMS IN WEBKIT, WITH THE REAL FONTS, in five scripts — Latin (fr-FR), Greek (el-GR), Cyrillic (bg-BG), CJK
// (ja-JP) and Arabic, right to left (ar-AE). Needs `npm run build` (the stylesheet and the font files come from .next/static).
//   node scripts/legal-languages-1-screens.cjs
// For each: the page renders through its real route (app/[country]/(legal)/…, every country switched on in fixtures), opens at 390
// wide, and is photographed from the top — the translation note, the title and the local date — into docs/legal-languages-1/
// (<doc>-<locale>-webkit-390.png). Checked: nothing scrolls sideways; the note is in the first screen; every script is set in the
// same font stack as the Latin page (the app's body stack — the operator and legal pages, unlike the landing page, name no
// Noto file, so WebKit draws Greek, Cyrillic, Japanese and Arabic from the system's fonts, as on every app page today); the
// Arabic page is dir="rtl" and its title is laid out right to left.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'legal-languages-1-screens' })
const LP1E = require('./_lp1e-fixtures.cjs')
const WF = require('./_world-countries-1-fixtures.cjs')
const RF = require('./_real-fonts.cjs')
const { REPO, h } = kit
const OUT = path.join(REPO, 'docs/legal-languages-1')
let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 900)}` : '')) } }
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
// public/ pictures inlined, as world-countries-1-screens does (RF.open serves only /_next/static).
const inlineImages = async (page, html) => page.evaluate(async files => { for (const img of document.querySelectorAll('img')) { const s = img.getAttribute('src') || ''; if (files[s]) img.src = files[s] } },
  Object.fromEntries([...html.matchAll(/src="(\/[^"]+\.(?:png|jpe?g|webp|svg))"/g)].map(m => m[1]).filter(s => fs.existsSync(path.join(REPO, 'public', s)))
    .map(s => [s, `data:image/${s.endsWith('.svg') ? 'svg+xml' : s.endsWith('.png') ? 'png' : s.endsWith('.webp') ? 'webp' : 'jpeg'};base64,${fs.readFileSync(path.join(REPO, 'public', s)).toString('base64')}`])))
const SHOTS = [
  { locale: 'fr-FR', cc: 'FR', script: 'Latin' },
  { locale: 'el-GR', cc: 'GR', script: 'Greek', cp: 0x03B1 /* α */ },
  { locale: 'bg-BG', cc: 'BG', script: 'Cyrillic', cp: 0x0434 /* д */ },
  { locale: 'ja-JP', cc: 'JP', script: 'CJK', cp: 0x3042 /* あ */ },
  { locale: 'ar-AE', cc: 'AE', script: 'Arabic', cp: 0x0639 /* ع */ },
]
const SEG = Object.fromEntries([...read('lib/marketing-country.ts').matchAll(/\b([A-Z]{2}): '([a-z]{2})'/g)].map(m => [m[1], m[2]]))

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const B = RF.built()
  const ctx = LP1E.context(kit, REPO)
  const rows = WF.rowsWith(WF.WORLD)
  const PAGE = {}
  for (const doc of ['privacy', 'terms']) {
    PAGE[doc] = await ctx.bundle(`ll1s-page-${doc}`, `export { default as Page } from '@/app/[country]/(legal)/${doc}/page'\nexport { default as Layout } from '@/app/[country]/(legal)/layout'\nexport { translatorFor } from '@/lib/i18n/translator'\nimport '@/lib/i18n/catalog/legalChrome'`)
  }
  const { webkit } = require(path.join(REPO, 'node_modules/playwright'))
  const browser = await webkit.launch()
  let latinStack = null
  try {
    for (const s of SHOTS) for (const doc of ['privacy', 'terms']) {
      const M = PAGE[doc], params = Promise.resolve({ country: SEG[s.cc] })
      const html = await ctx.withReq({ rows }, () => ctx.prerender(h(M.Layout, { params }, h(M.Page, { params }))))
      const { page, ctx: bctx } = await RF.open(browser, { html, lang: s.locale, width: 390, height: 844, B })
      await inlineImages(page, html); await page.waitForTimeout(300)
      const note = String(M.translatorFor(s.locale, 'legalChrome').raw('translationNote')).replace(/<\/?link>/g, '').replace(/\s+/g, '')
      const info = await page.evaluate(n => {
        const p = [...document.querySelectorAll('p')].find(e => e.textContent.replace(/\s+/g, '') === n)
        const h1 = document.querySelector('h1')
        const r = p?.getBoundingClientRect(), hr = h1?.getBoundingClientRect()
        return { stack: getComputedStyle(document.querySelector('article') || document.body).fontFamily, sideways: document.documentElement.scrollWidth > innerWidth + 1, dir: document.documentElement.dir, noteTop: r ? r.top : null, noteBottom: r ? r.bottom : null,
          h1: h1 ? { l: hr.left, r: hr.right, align: getComputedStyle(h1).textAlign, dir: getComputedStyle(h1).direction } : null, vh: innerHeight, vw: innerWidth }
      }, note)
      const file = `${doc}-${s.locale}-webkit-390.png`
      await page.screenshot({ path: path.join(OUT, file) })
      t(`/${SEG[s.cc]}/${doc} (${s.locale}, ${s.script}): nothing scrolls sideways; the translation note is in the first screen → ${file}`,
        !info.sideways && info.noteTop != null && info.noteBottom <= info.vh, info)
      if (!s.cp) latinStack = latinStack ?? info.stack
      else t(`/${SEG[s.cc]}/${doc}: ${s.script} is set in the same font stack as the Latin page (${info.stack.split(',')[0]} …)`, info.stack === latinStack, { stack: info.stack, latin: latinStack })
      if (s.locale === 'ar-AE') t(`/${SEG[s.cc]}/${doc}: dir="rtl", and the title is laid out right to left`, info.dir === 'rtl' && info.h1?.dir === 'rtl', info)
      await bctx.close()
    }
  } finally { await browser.close() }
  console.log(`\n${fail ? '🔴' : '✅'} legal-languages-1-screens: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
