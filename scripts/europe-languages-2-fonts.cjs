// scripts/europe-languages-2-fonts.cjs — GREEK AND CYRILLIC DRAW IN OUR FONT, AND LATIN PAGES PAY NOTHING FOR IT
// (europe-languages-2, 23 October 2026, docs/europe-languages-2-report.md §5). Needs `npm run build` (the real CSS and woff2).
//
// Geist (the app font) has Cyrillic but no Greek; Archivo and Public Sans (the landing page's) have neither. app/layout.tsx adds
// Noto Sans (subsets greek + cyrillic, preload: false) as a FALLBACK in the stacks — and only on an el / bg page does the body
// carry its variable class, so on every other page the stacks never name it. Fixtures only (the countries switched on here):
//   1  the build: Noto's @font-face blocks are all unicode-range-scoped, none is preloaded, and the variable class is the only
//      way the family enters a stack (app/globals.css and app/landing/landing.css name it under :lang(el) / :lang(bg) only);
//   2  /gr, /cy and /bg, in WebKit at 390 with the real fonts: the page's Greek / Cyrillic glyphs load a Noto file whose
//      unicode-range covers that script, the headline's computed stack carries Noto, and a screenshot is written;
//   3  /uk (Latin, the control): no Noto file is requested at all, and its stack does not name Noto;
//   4  URLs stay Latin: /gr /cy /bg are the pages' paths, canonicals and sitemap entries — no Greek or Cyrillic slug.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'europe-languages-2-fonts' })
const EF = require('./_europe-settings-fixtures.cjs')
const RF = require('./_real-fonts.cjs')
const { REPO } = kit
const OUT = path.join(REPO, 'docs/europe-languages-2')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 100 - s.length)))
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')

// unicode-range "U+0370-03FF, U+1F00-1FFF" → does it cover a code point?
const covers = (range, cp) => range.split(',').map(s => s.trim().replace(/^U\+/i, '')).some(r => {
  const [a, b] = r.includes('-') ? r.split('-') : r.includes('?') ? [r.replace(/\?/g, '0'), r.replace(/\?/g, 'F')] : [r, r]
  return cp >= parseInt(a, 16) && cp <= parseInt(b, 16)
})
const SCRIPT = { el: { name: 'Greek', cp: 0x03B1 /* α */ }, bg: { name: 'Cyrillic', cp: 0x0430 /* а */ } }

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const B = RF.built()

  head('1 · THE BUILD — the fallback is range-scoped, never preloaded, and named only on el / bg pages')
  const noto = B.faces.filter(f => f.family === B.scriptFamily)
  t(`the fallback's variable class is in the build (${B.scriptClass} → "${B.scriptFamily}")`, !!B.scriptClass && !!B.scriptFamily)
  t(`its ${noto.length} @font-face blocks each carry a unicode-range (Greek and Cyrillic among them)`, noto.length > 0 && noto.every(f => f.range)
    && noto.some(f => covers(f.range, SCRIPT.el.cp)) && noto.some(f => covers(f.range, SCRIPT.bg.cp)), noto.map(f => f.range.slice(0, 40)))
  const layout = read('app/layout.tsx')
  t('app/layout.tsx: Noto Sans with preload: false, subsets greek + cyrillic; its class only when the page language is el or bg',
    /Noto_Sans\(\{[^}]*subsets:\s*\["greek",\s*"cyrillic"\][^}]*preload:\s*false/.test(layout.replace(/'/g, '"')) && /NEEDS_SCRIPT_FALLBACK\.test\(lang\)\s*\?\s*` \$\{scriptFallback\.variable\}`\s*:\s*''/.test(layout))
  t('the stacks name it only under :lang(el) / :lang(bg) (app/globals.css, app/landing/landing.css)',
    [read('app/globals.css'), read('app/landing/landing.css')].every(c => c.split('\n').filter(l => l.includes('--font-script-fallback')).every(l => /:lang\((el|bg)\)/.test(l) || /^\s*(--display|--body|--font-geist-sans):/.test(l))))
  t('the layout regex: el-GR, el-CY, bg-BG need it; en-GB, de-DE, pl-PL, fi-FI do not',
    ['el-GR', 'el-CY', 'bg-BG'].every(l => RF.NEEDS_SCRIPT_FALLBACK.test(l)) && !['en-GB', 'de-DE', 'pl-PL', 'fi-FI'].some(l => RF.NEEDS_SCRIPT_FALLBACK.test(l)))

  head('2–3 · THE PAGES, WEBKIT 390, REAL FONTS — Greek / Cyrillic draw in Noto; the Latin page loads none of it')
  const R = EF.renderer(kit, 'el2f')
  const rows = EF.rowsWith(['GR', 'CY', 'BG'])
  const { webkit } = require(path.join(REPO, 'node_modules/playwright'))
  const browser = await webkit.launch()
  const pages = {}
  try {
    for (const [seg, lang, script] of [['gr', 'el-GR', 'el'], ['cy', 'el-CY', 'el'], ['bg', 'bg-BG', 'bg'], ['uk', 'en-GB', null]]) {
      const P = await R.page('landing', seg, rows); pages[seg] = P
      if (!P.html) { t(`/${seg}: renders`, false, P.redirectedTo); continue }
      const { page, ctx, fonts } = await RF.open(browser, { html: P.html, lang, width: 390, B })
      // The CSS names a font by a relative path ("../media/x.woff2"); a request is "/_next/static/media/x.woff2" — match by file.
      const base = s => String(s).split('/').pop()
      const notoOf = f => noto.find(n => n.src && base(n.src) === base(f))
      const loadedNoto = fonts.filter(f => notoOf(f))
      const stack = await page.evaluate(() => getComputedStyle(document.querySelector('h1') || document.body).fontFamily)
      if (script) {
        const want = SCRIPT[script]
        const ranges = loadedNoto.map(f => notoOf(f)?.range ?? '')
        t(`/${seg} (${lang}): a Noto file covering ${want.name} was loaded for the page's text; the headline's stack names "${B.scriptFamily}"`,
          ranges.some(r => covers(r, want.cp)) && stack.includes(B.scriptFamily), { loaded: loadedNoto, all: fonts, stack })
        const shot = path.join(OUT, `landing-${lang}-webkit-390.png`)
        await page.screenshot({ path: shot, fullPage: false })
        t(`/${seg}: screenshot ${path.relative(REPO, shot)}`, fs.existsSync(shot))
      } else {
        t(`/${seg} (${lang}, Latin control): no Noto file requested (${fonts.length} font file(s), all Latin faces); the stack does not name it`,
          loadedNoto.length === 0 && !stack.includes(B.scriptFamily), { fonts, stack })
      }
      await ctx.close()
    }
  } finally { await browser.close() }

  head('4 · URLS STAY LATIN — /gr /cy /bg in paths, canonicals and the sitemap')
  for (const seg of ['gr', 'cy', 'bg']) t(`/${seg}: canonical https://www.hatchgrab.com/${seg}`, pages[seg]?.meta?.alternates?.canonical === `https://www.hatchgrab.com/${seg}`, pages[seg]?.meta?.alternates)
  const sm = await R.sitemap(rows)
  const urls = sm.map(e => e.url)
  t('sitemap: /gr, /cy and /bg listed; no URL holds a Greek or Cyrillic letter', ['gr', 'cy', 'bg'].every(s => urls.includes(`https://www.hatchgrab.com/${s}`)) && !urls.some(u => /[Ͱ-ϿЀ-ӿ]/.test(decodeURIComponent(u))), urls.filter(u => /\/(gr|cy|bg)/.test(u)))

  console.log(`\n${fail ? '🔴' : '✅'} europe-languages-2-fonts: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
