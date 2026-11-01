#!/usr/bin/env node
// scripts/world-countries-1-screens.cjs — world-countries-1 (31 October 2026, docs/world-countries-1-report.md §3–§4): THE NEW
// LANDING PAGES IN WEBKIT, WITH THE REAL FONTS — and the four new scripts load only where they belong. Needs `npm run build`.
//   node scripts/world-countries-1-screens.cjs
// For every language built (lib/i18n/locales.ts), its country switched ON in fixtures (scripts/_world-countries-1-fixtures.cjs):
//   1  THE FONTS — each Noto family (Japanese, Traditional Chinese, Thai, Arabic) is in the build, every @font-face range-scoped,
//      never preloaded; on its own page a file covering its script is loaded and the headline's stack names it FIRST after the
//      brand face (before the size-adjusted fallback — the Greek bug); on /uk and on every Latin page none is requested;
//   2  THE PAGES — WebKit 390: the landing page's top (landing-<cc>-390.png) and its pricing section (pricing-<cc>-390.png); where
//      only Unlimited is offered, the pricing section at 1440 too (pricing-<cc>-1440.png), the one card centred; no page scrolls
//      sideways; an Arabic page is dir="rtl" and lays out right to left.
// Writes into docs/world-countries-1/.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'world-countries-1-screens' })
const WF = require('./_world-countries-1-fixtures.cjs')
const RF = require('./_real-fonts.cjs')
const { REPO } = kit
const OUT = path.join(REPO, 'docs/world-countries-1')
const PUBLIC = path.join(REPO, 'public')
let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 100 - s.length)))
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const covers = (range, cp) => String(range).split(',').map(s => s.trim().replace(/^U\+/i, '')).some(r => {
  const [a, b] = r.includes('-') ? r.split('-') : r.includes('?') ? [r.replace(/\?/g, '0'), r.replace(/\?/g, 'F')] : [r, r]
  return cp >= parseInt(a, 16) && cp <= parseInt(b, 16)
})
const COUNTRIES = [
  { cc: 'MX', locale: 'es-MX' }, { cc: 'BR', locale: 'pt-BR' }, { cc: 'MY', locale: 'ms-MY' }, { cc: 'SG', locale: 'en-SG' },
  { cc: 'JP', locale: 'ja-JP', script: 'ja', cp: 0x3042 /* あ */ }, { cc: 'HK', locale: 'zh-HK', script: 'zh-hk', cp: 0x9910 /* 餐 */ },
  { cc: 'TH', locale: 'th-TH', script: 'th', cp: 0x0E01 /* ก */ }, { cc: 'AE', locale: 'ar-AE', script: 'ar', cp: 0x0639 /* ع */ },
]
const UNLIMITED_ONLY = ['BR', 'MX', 'MY', 'SG', 'TH']
const LOCALES = JSON.parse('[' + /export const LOCALES = \[([^\]]*)\]/.exec(read('lib/i18n/locales.ts'))[1].replace(/'/g, '"') + ']')
const SEG = Object.fromEntries([...read('lib/marketing-country.ts').matchAll(/\b([A-Z]{2}): '([a-z]{2})'/g)].map(m => [m[1], m[2]]))
const BUILT = COUNTRIES.filter(c => LOCALES.includes(c.locale))

// public/ pictures inlined, as the hero script does (RF.open serves only /_next/static).
const inlineImages = async (page, html) => page.evaluate(async files => { for (const img of document.querySelectorAll('img')) { const s = img.getAttribute('src') || ''; if (files[s]) img.src = files[s] } },
  Object.fromEntries([...html.matchAll(/src="(\/[^"]+\.(?:png|jpe?g|webp|svg))"/g)].map(m => m[1]).filter(s => fs.existsSync(path.join(PUBLIC, s)))
    .map(s => [s, `data:image/${s.endsWith('.svg') ? 'svg+xml' : s.endsWith('.png') ? 'png' : s.endsWith('.webp') ? 'webp' : 'jpeg'};base64,${fs.readFileSync(path.join(PUBLIC, s)).toString('base64')}`])))

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const B = RF.built()
  head('1 · THE FONTS IN THE BUILD — range-scoped, never preloaded, named only under their own :lang()')
  const familyOf = v => { const m = new RegExp(`--${v}:\\s*['"]?([^'",;}]+)`).exec(B.css); return m ? m[1].trim() : null }
  const FAM = Object.fromEntries(['ja', 'zh-hk', 'th', 'ar'].map(s => [s, familyOf(`font-script-${s}`)]))
  for (const [s, fam] of Object.entries(FAM)) {
    const faces = B.faces.filter(f => f.family === fam)
    t(`--font-script-${s} → "${fam}": ${faces.length} @font-face blocks, each with a unicode-range`, !!fam && faces.length > 0 && faces.every(f => f.range), faces.slice(0, 3))
  }
  // ⚠️ RE-PINNED (world-countries-2, 1 November 2026): lib/script-fonts.ts also holds the Greek / Cyrillic Noto Sans now (moved from
  // app/layout.tsx) — five definitions, every one preload: false.
  t('no new Noto file is preloaded (no <link rel=preload> for them in the build\'s font CSS; preload: false in lib/script-fonts.ts)', (read('lib/script-fonts.ts').match(/preload: false/g) || []).length === 5)

  head('2 · THE PAGES, WEBKIT, REAL FONTS — each script draws in its Noto; Latin pages load none of it; one centred card where only Unlimited is offered')
  const R = WF.renderer(kit, 'wc1s')
  const rows = WF.rowsWith(BUILT.map(c => c.cc))
  const { webkit } = require(path.join(REPO, 'node_modules/playwright'))
  const browser = await webkit.launch()
  const base = s => String(s).split('/').pop()
  const newNoto = B.faces.filter(f => Object.values(FAM).includes(f.family))
  try {
    for (const c of [{ cc: 'GB', locale: 'en-GB' }, ...BUILT]) {
      const seg = c.cc === 'GB' ? 'uk' : SEG[c.cc]
      const P = await R.page('landing', seg, rows)
      if (!P.html) { t(`/${seg}: renders`, false, P.redirectedTo); continue }
      for (const width of c.cc === 'GB' ? [390] : UNLIMITED_ONLY.includes(c.cc) ? [390, 1440] : [390]) {
        const { page, ctx, fonts } = await RF.open(browser, { html: P.html, lang: c.locale, width, height: width === 390 ? 844 : 900, B })
        await inlineImages(page, P.html); await page.waitForTimeout(250)
        const loaded = fonts.filter(f => newNoto.some(n => n.src && base(n.src) === base(f)))
        const info = await page.evaluate(() => ({ stack: getComputedStyle(document.querySelector('h1')).fontFamily, dir: document.documentElement.dir, sideways: document.documentElement.scrollWidth > innerWidth + 1,
          cards: [...document.querySelectorAll('#pricing .plan')].map(e => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right } }), vw: innerWidth,
          h1Right: (() => { const r = document.querySelector('h1').getBoundingClientRect(); return { l: r.left, r: r.right } })() }))
        if (c.script) {
          const fam = FAM[c.script]
          const ranges = loaded.map(f => newNoto.find(n => base(n.src) === base(f))?.range ?? '')
          t(`/${seg} ${width} (${c.locale}): a "${fam}" file covering the script loaded; the headline's stack names it right after the brand face`, ranges.some(r => covers(r, c.cp)) && new RegExp(`^[^,]+,\\s*"?${fam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(info.stack), { loaded, stack: info.stack })
        } else t(`/${seg} ${width} (${c.locale}): no Japanese, Chinese, Thai or Arabic Noto file requested`, loaded.length === 0, loaded)
        t(`/${seg} ${width}: nothing scrolls sideways${c.locale.startsWith('ar') ? '; dir="rtl"' : '; no dir attribute'}`, !info.sideways && (c.locale.startsWith('ar') ? info.dir === 'rtl' : info.dir === ''), info)
        if (c.cc === 'GB') { await ctx.close(); continue }
        if (width === 390) await page.screenshot({ path: path.join(OUT, `landing-${c.cc.toLowerCase()}-390.png`) })
        const pricing = page.locator('#pricing')
        // The sticky header would sit over the section in an element shot; it is taken out of the flow for the photograph only.
        await page.addStyleTag({ content: 'nav{position:static!important}' })
        await pricing.scrollIntoViewIfNeeded()
        await pricing.screenshot({ path: path.join(OUT, `pricing-${c.cc.toLowerCase()}-${width}.png`) })
        if (UNLIMITED_ONLY.includes(c.cc)) {
          const card = info.cards[0]
          t(`/${seg} ${width}: ONE plan card, centred (its middle ${Math.round((card.l + card.r) / 2)} vs the page's ${Math.round(info.vw / 2)})`, info.cards.length === 1 && Math.abs((card.l + card.r) / 2 - info.vw / 2) < 4, info.cards)
        }
        await ctx.close()
      }
    }
  } finally { await browser.close() }
  console.log(`\n${fail ? '🔴' : '✅'} world-countries-1-screens: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
