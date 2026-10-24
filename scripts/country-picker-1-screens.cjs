#!/usr/bin/env node
// scripts/country-picker-1-screens.cjs — country-picker-1 (23 October 2026, docs/country-picker-1-report.md): the footer's
// country picker in WebKit (Safari's engine), with the real built CSS and fonts, photographed and measured.
//   node scripts/country-picker-1-screens.cjs     (needs `npm run build` for the CSS and fonts, and Playwright's WebKit)
//
// /uk, /de and /gr are server-rendered by the REAL pages (36 fixture countries switched on), then the footer's picker is
// brought to life with the REAL components/landing/CountryMenu.tsx (bundled for the browser, given the menu
// lib/visitor-country.ts would hand it; its links are checked equal to the server-rendered ones first).
// Writes into docs/country-picker-1/:
//   footer-1512.png, footer-390.png          the footer, closed — the trigger inline at the end of the link row
//   box-1512.png, box-390.png                the box open on /uk
//   box-de-1512.png, box-gr-1512.png         the box open on /de and /gr (own-language names, the German / Greek title)
//   box-390-scrolled.png                     the phone box scrolled inside itself to its end
// …and FAILS if: the trigger is not on the links' line (laptop) / is under 44px (phone); the box does not show every
// country without scrolling at 1512×945 in three columns; the phone box is not two columns scrolling inside itself; the
// page behind scrolls; Escape, ×, or a click outside does not close it; focus does not move in and come back; choosing a
// country does not keep the cookie and go to that country's address.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'country-picker-1-screens' })
const EF = require('./_europe-settings-fixtures.cjs')
const RF = require('./_real-fonts.cjs')
const CP = require('./_country-picker-1-fixtures.cjs')
const { REPO } = kit
const OUT = path.join(REPO, 'docs/country-picker-1')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 900)}` : '')) } }

// next/navigation for the browser: the router records where it was sent.
const NAV = "export const useRouter = () => ({ push(u){ (window.__nav = window.__nav || []).push(['push', u]) }, replace(u){ (window.__nav = window.__nav || []).push(['replace', u]) }, refresh(){ (window.__nav = window.__nav || []).push(['refresh']) }, back(){}, prefetch(){} }); export const usePathname = () => window.__PATH; export const useSearchParams = () => new URLSearchParams(location.search); export const useParams = () => ({})"
async function hydrator(dir) {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const entry = path.join(dir, 'cc.tsx')
  // As the page's PageLocale does: the language's words seeded into the registry, the locale given by the I18n context.
  fs.writeFileSync(entry, `import { createRoot } from 'react-dom/client'
import { CountryMenu } from '@/components/landing/CountryMenu'
import { I18nContext } from '@/lib/i18n/use-t'
import { seedLanguage } from '@/lib/i18n/registry'
const w = window as any
for (const [l, byNs] of Object.entries(w.__WORDS || {})) seedLanguage(l, byNs as any)
const el = document.querySelector('span.cc')
if (el) { const host = document.createElement('span'); host.style.display = 'contents'; el.replaceWith(host); createRoot(host).render(<I18nContext.Provider value={{ locale: w.__LOCALE, setLocale() {} }}><CountryMenu menu={w.__MENU} /></I18nContext.Provider>) }
setTimeout(() => document.documentElement.setAttribute('data-ready', '1'), 50)`)
  const r = await esbuild.build({
    entryPoints: [entry], bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', target: 'es2020', logLevel: 'error',
    alias: { '@': REPO }, nodePaths: [path.join(REPO, 'node_modules')], banner: { js: 'window.process = window.process || { env: {} };' },
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'nav', setup(b) {
      b.onResolve({ filter: /^next\/navigation$/ }, a => ({ path: a.path, namespace: 'stub' }))
      b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: NAV, loader: 'js', resolveDir: REPO }))
    } }],
  })
  return r.outputFiles[0].text
}

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const B = RF.built()
  if (!/\.cc-dlg-closed\{display:none\}/.test(B.css.replace(/\s+/g, ''))) throw new Error('the built CSS predates country-picker-1 — run `npm run build`')
  const R = EF.renderer(kit, 'cp1s')
  const rows = CP.ROWS()
  const L = await kit.bundle('cp1s-lib', "export { flagDataUri } from '@/lib/flags'\nexport { COUNTRY_PATH_SEGMENTS } from '@/lib/marketing-country'")
  const js = await hydrator(fs.mkdtempSync(path.join(os.tmpdir(), 'hg-cp1-')))
  const { webkit } = require(path.join(REPO, 'node_modules/playwright'))
  const browser = await webkit.launch()
  const linksOf = html => [...String(html).matchAll(/<a href="([^"]*)" lang="[^"]+"(?: aria-current="true")? class="cc-item">[\s\S]*?<span class="cc-item-name">([^<]*)<\/span>/g)].map(m => `${m[1]}|${m[2]}`)

  // The page at its own address (/uk, /de, /gr — so a choice takes the country-address branch, as on the site), the menu, the
  // locale, and the language's words for the two namespaces the picker reads (messages/ns, along the locale's chain).
  const pageScript = (seg, lang, menu) => {
    const words = {}
    for (const l of lang.startsWith('en') ? [] : [lang]) for (const ns of ['landingNav', 'demoUpload']) (words[l] ??= {})[ns] = JSON.parse(fs.readFileSync(path.join(REPO, `messages/ns/${l}/${ns}.json`), 'utf8'))
    const j = x => JSON.stringify(x).replace(/</g, '\\u003c')
    return `<script>history.replaceState(null, '', '/${seg}'); window.__PATH = '/${seg}'; window.__LOCALE = ${j(lang)}; window.__MENU = ${j(menu)}; window.__WORDS = ${j(words)};</script>`
  }
  const open = async (seg, code, lang, width, height) => {
    const P = await R.page('landing', seg, rows)
    const menu = CP.menuOf(L, rows, code)
    const html = P.html + pageScript(seg, lang, menu)
    const v = await RF.open(browser, { html, lang, width, height, B, script: js })
    await v.page.waitForSelector('html[data-ready]')
    const after = await v.page.evaluate(() => document.querySelector('footer').outerHTML)
    return { ...v, ssr: P.html, after }
  }
  const state = page => page.evaluate(() => {
    const dlg = document.querySelector('.cc-dlg'); const box = document.querySelector('.cc-box')
    const shown = dlg && getComputedStyle(dlg).display !== 'none'
    const items = [...document.querySelectorAll('.cc-item')].map(a => a.getBoundingClientRect())
    const r = box && box.getBoundingClientRect()
    return {
      shown, active: document.activeElement && (document.activeElement.className || document.activeElement.tagName),
      inBox: !!(box && box.contains(document.activeElement)), onTrigger: document.activeElement === document.querySelector('.cc-btn'),
      cols: new Set(items.map(i => Math.round(i.left))).size, n: items.length,
      allIn: shown && items.every(i => i.top >= 0 && i.bottom <= innerHeight && i.left >= 0 && i.right <= innerWidth),
      boxScrolls: box ? box.scrollHeight > box.clientHeight + 1 : null, box: r && { top: r.top, bottom: r.bottom, h: r.height, vh: innerHeight, w: r.width },
      htmlOverflow: document.documentElement.style.overflow, expanded: document.querySelector('.cc-btn').getAttribute('aria-expanded'),
    }
  })

  try {
    // ── laptop: /uk at 1512×945 ──────────────────────────────────────────────────────────────────────────────────────
    {
      const { page, ctx, ssr, after } = await open('uk', 'GB', 'en-GB', 1512, 945)
      t('1512: the browser picker\'s 36 links are exactly the server-rendered ones (same hrefs, same names, same order)', JSON.stringify(linksOf(after)) === JSON.stringify(linksOf(ssr)) && linksOf(ssr).length === 36)
      await page.locator('footer').scrollIntoViewIfNeeded()
      const pos = await page.evaluate(() => {
        const links = [...document.querySelectorAll('.foot-links > a')].map(a => a.getBoundingClientRect()); const b = document.querySelector('.cc-btn').getBoundingClientRect()
        const last = links[links.length - 1]; const cs = getComputedStyle(document.querySelector('.cc-btn')), ls = getComputedStyle(document.querySelector('.foot-links > a'))
        return { sameLine: Math.abs((b.top + b.bottom) / 2 - (last.top + last.bottom) / 2) < 3, after: b.left > last.right, color: cs.color === ls.color, smaller: parseFloat(cs.fontSize) < parseFloat(ls.fontSize), text: document.querySelector('.cc-btn').textContent }
      })
      t('1512: the trigger "GB ▾" sits on the links\' line, after the last link, in their colour and a touch smaller', pos.sameLine && pos.after && pos.color && pos.smaller && pos.text === 'GB', pos)
      await page.locator('footer').screenshot({ path: path.join(OUT, 'footer-1512.png') })
      // Keyboard: Tab from the last link reaches the trigger; Enter opens; focus moves in; Escape closes; focus returns.
      // ⚠️ WebKit (like Safari) moves Tab between form fields only; Option+Tab (Alt+Tab here) is how Safari reaches links and
      // buttons, so that is the key pressed in WebKit. A plain Tab is proved in Chromium below.
      await page.locator('.foot-links > a').last().focus()
      await page.keyboard.press('Alt+Tab')
      const onT = await state(page)
      await page.keyboard.press('Enter'); await page.waitForTimeout(150)
      const opened = await state(page)
      t('keyboard: Tab from the last footer link lands on the trigger; Enter opens the box and focus moves into it', onT.onTrigger && !onT.shown && opened.shown && opened.inBox && opened.expanded === 'true', { onT, opened })
      t('1512×945: all 36 countries visible at once in three columns — no scrolling of the box or the page', opened.n === 36 && opened.cols === 3 && opened.allIn && opened.boxScrolls === false, opened)
      t('…and the page behind cannot scroll while it is open (html overflow hidden)', opened.htmlOverflow === 'hidden' && await page.evaluate(() => { const y = scrollY; scrollBy(0, -400); return scrollY === y }))
      const tick = await page.evaluate(() => { const a = document.querySelector('.cc-item[aria-current="true"]'); return a && { name: a.querySelector('.cc-item-name').textContent, tick: !!a.querySelector('.cc-tick'), code: a.querySelector('.cc-item-code').textContent, codeShown: getComputedStyle(a.querySelector('.cc-item-code')).display !== 'none' } })
      t('1512: United Kingdom is highlighted with a tick; the codes show muted on the right', tick && tick.name === 'United Kingdom' && tick.tick && tick.code === 'GB' && tick.codeShown, tick)
      // Tab stays inside the box.
      for (let i = 0; i < 40; i++) await page.keyboard.press('Alt+Tab')
      t('keyboard: Tab keeps focus inside the open box', (await state(page)).inBox)
      await page.screenshot({ path: path.join(OUT, 'box-1512.png') })
      await page.keyboard.press('Escape'); await page.waitForTimeout(100)
      const esc = await state(page)
      t('keyboard: Escape closes it and focus returns to the trigger; the page can scroll again', !esc.shown && esc.onTrigger && esc.htmlOverflow === '' && esc.expanded === 'false', esc)
      // × closes; a click on the dimmed page outside the box closes.
      await page.locator('.cc-btn').click(); await page.locator('.cc-x').click(); await page.waitForTimeout(100)
      const x = await state(page)
      await page.locator('.cc-btn').click(); await page.mouse.click(8, 8); await page.waitForTimeout(100)
      const outside = await state(page)
      await page.locator('.cc-btn').click(); await page.locator('.cc-title').click(); await page.waitForTimeout(100)
      const inside = await state(page)
      t('× closes it (focus back on the trigger); a click outside the box closes it; a click inside does not', !x.shown && x.onTrigger && !outside.shown && outside.onTrigger && inside.shown, { x, outside, inside })
      // Choosing: the same as the old picker — the cookie, then the country's address.
      await page.locator('.cc-item', { hasText: 'Deutschland' }).click(); await page.waitForTimeout(100)
      const chose = await page.evaluate(() => ({ cookie: document.cookie, nav: window.__nav, shown: getComputedStyle(document.querySelector('.cc-dlg')).display !== 'none' }))
      t('choosing Deutschland: the box closes, hg_country=DE is kept, and the router goes to /de (as before)', !chose.shown && /(^|; )hg_country=DE/.test(chose.cookie) && JSON.stringify(chose.nav) === JSON.stringify([['push', '/de']]), chose)
      await ctx.close()
    }
    // ── the same keyboard walk in Chromium, with a plain Tab ──────────────────────────────────────────────────────────────
    {
      const { chromium } = require(path.join(REPO, 'node_modules/playwright'))
      const cb = await chromium.launch()
      try {
        const P = await R.page('landing', 'uk', rows)
        const html = P.html + pageScript('uk', 'en-GB', CP.menuOf(L, rows, 'GB'))
        const { page, ctx } = await RF.open(cb, { html, lang: 'en-GB', width: 1512, height: 945, B, script: js })
        await page.waitForSelector('html[data-ready]')
        await page.locator('.foot-links > a').last().focus()
        await page.keyboard.press('Tab'); const a1 = await state(page)
        await page.keyboard.press('Enter'); await page.waitForTimeout(150); const a2 = await state(page)
        for (let i = 0; i < 40; i++) await page.keyboard.press('Tab')
        const a3 = await state(page)
        await page.keyboard.press('Escape'); await page.waitForTimeout(100); const a4 = await state(page)
        t('Chromium, plain Tab: Tab reaches the trigger, Enter opens (focus inside), Tab stays inside, Escape closes, focus returns',
          a1.onTrigger && a2.shown && a2.inBox && a3.inBox && !a4.shown && a4.onTrigger, { a1, a2, a3, a4 })
        await ctx.close()
      } finally { await cb.close() }
    }
    // ── /de and /gr at 1512 ──────────────────────────────────────────────────────────────────────────────────────────
    for (const [seg, code, lang, title] of [['de', 'DE', 'de-DE', 'Wählen Sie Ihr Land'], ['gr', 'GR', 'el-GR', 'Επιλέξτε τη χώρα σας']]) {
      const { page, ctx } = await open(seg, code, lang, 1512, 945)
      await page.locator('footer').scrollIntoViewIfNeeded()
      await page.locator('.cc-btn').click(); await page.waitForTimeout(150)
      const s = await state(page)
      const w = await page.evaluate(() => ({ title: document.querySelector('.cc-title').textContent, cur: document.querySelector('.cc-item[aria-current="true"] .cc-item-name').textContent, gr: [...document.querySelectorAll('.cc-item-name')].map(e => e.textContent).includes('Ελλάδα') }))
      t(`/${seg} 1512: the box in ${lang} — "${title}", ${code} ticked, own-language names, all 36 in three columns without scrolling`, w.title === title && w.gr && s.n === 36 && s.cols === 3 && s.allIn && s.boxScrolls === false, { w, s })
      await page.screenshot({ path: path.join(OUT, `box-${seg}-1512.png`) })
      await ctx.close()
    }
    // ── phone: /uk at 390×844 ───────────────────────────────────────────────────────────────────────────────────────
    {
      const { page, ctx } = await open('uk', 'GB', 'en-GB', 390, 844)
      await page.locator('footer').scrollIntoViewIfNeeded()
      const b = await page.evaluate(() => { const r = document.querySelector('.cc-btn').getBoundingClientRect(); const l = [...document.querySelectorAll('.foot-links > a')].pop().getBoundingClientRect(); return { h: r.height, below: r.top >= l.bottom - 1, centred: Math.abs((r.left + r.right) / 2 - innerWidth / 2) < 3, sideways: document.documentElement.scrollWidth > innerWidth } })
      t('390: the trigger wraps under the links, centred, 44px tall; nothing scrolls sideways', b.h >= 44 && b.below && b.centred && !b.sideways, b)
      await page.locator('footer').screenshot({ path: path.join(OUT, 'footer-390.png') })
      const y0 = await page.evaluate(() => scrollY)
      await page.locator('.cc-btn').click(); await page.waitForTimeout(150)
      const s = await state(page)
      t('390: two columns, codes hidden, the box inside the window and scrolling inside itself', s.cols === 2 && s.boxScrolls === true && s.box.top >= 0 && s.box.bottom <= s.box.vh + 1
        && await page.evaluate(() => getComputedStyle(document.querySelector('.cc-item-code')).display === 'none'), s)
      await page.screenshot({ path: path.join(OUT, 'box-390.png') })
      await page.locator('.cc-box').evaluate(e => { e.scrollTop = e.scrollHeight })
      await page.mouse.move(195, 400); await page.mouse.wheel(0, 600); await page.waitForTimeout(200)
      const y1 = await page.evaluate(() => scrollY)
      t('390: scrolling inside the box never moves the page behind it', y1 === y0, { y0, y1 })
      await page.screenshot({ path: path.join(OUT, 'box-390-scrolled.png') })
      await page.mouse.click(10, 10); await page.waitForTimeout(100)
      t('390: a tap outside closes it', !(await state(page)).shown)
      await ctx.close()
    }
  } finally { await browser.close() }

  console.log(`\n${fail ? '🔴' : '✅'} country-picker-1-screens: ${pass} passed, ${fail} failed — screenshots in docs/country-picker-1/`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
