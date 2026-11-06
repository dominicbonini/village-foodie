#!/usr/bin/env node
// scripts/site-chrome-1-screens.cjs — site-chrome-1 (5 November 2026, docs/site-chrome-1-report.md): the before / after photographs and
// the phone footer's measurements. By hand (needs a local WebKit — playwright; NO build: Tailwind is compiled from app/globals.css with
// its own PostCSS plugin, and the pages are the server renders of scripts/_site-chrome-1-render.cjs over the fixture world).
//   node scripts/site-chrome-1-screens.cjs capture <file>          in EACH tree (a HEAD worktree, then here): the pages' HTML and CSS
//   node scripts/site-chrome-1-screens.cjs shoot <before> <after>  here: the screenshots into docs/site-chrome-1/ and the checks
// ⚠️ The fonts are the browser's fallbacks (next/font is stubbed in the renders), so letter widths differ slightly from the live site;
// the same fallback is used for before and after, and the overflow check is done with it in all 28 languages.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs'); const path = require('path'); const http = require('http')
const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const OUT = path.join(REPO, 'docs/site-chrome-1')
let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 900)}` : '')) } }

// One country per language base (and en-GB) — the footer in every language; and the pages the brief photographs.
const LANG_SEG = { 'en-GB': 'uk', 'fr-FR': 'fr', 'de-DE': 'de', 'es-ES': 'es', 'it-IT': 'it', 'pt-PT': 'pt', 'nl-NL': 'nl', 'sv-SE': 'se', 'da-DK': 'dk', 'nb-NO': 'no', 'pl-PL': 'pl',
  'cs-CZ': 'cz', 'hu-HU': 'hu', 'sk-SK': 'sk', 'ro-RO': 'ro', 'hr-HR': 'hr', 'sl-SI': 'si', 'fi-FI': 'fi', 'et-EE': 'ee', 'lv-LV': 'lv', 'lt-LT': 'lt', 'el-GR': 'gr', 'bg-BG': 'bg',
  'pt-BR': 'br', 'ms-MY': 'my', 'ja-JP': 'jp', 'zh-HK': 'hk', 'th-TH': 'th', 'ar-AE': 'ae' }
const SHOTS = { uk: 'landing:uk', contact: 'contact', privacy: 'legal:privacy', terms: 'legal:terms', 'country-terms': 'legal:countryTerms', about: 'about', 'fr-privacy': 'legalIn:fr:privacy' }

async function capture(file) {
  const kit = require('./_render-kit.cjs')({ cacheTag: 'site-chrome-1' })
  const { renderer } = require('./_site-chrome-1-render.cjs')
  const R = renderer(kit, REPO)
  const pages = {}
  for (const [loc, seg] of Object.entries(LANG_SEG)) pages[`landing:${seg}`] = { html: await R.PAGES.landing(seg), lang: loc }
  pages.contact = { html: await R.PAGES.contact(), lang: 'en-GB' }
  pages.about = { html: await R.PAGES.about(), lang: 'en-GB' }
  for (const [k, doc] of [['legal:privacy', 'privacy'], ['legal:terms', 'terms'], ['legal:countryTerms', 'countryTerms']]) pages[k] = { html: await R.PAGES.legal(doc), lang: 'en-GB' }
  pages['legalIn:fr:privacy'] = { html: await R.PAGES.legalIn('fr', 'privacy'), lang: 'fr-FR' }
  const postcss = require(require.resolve('postcss', { paths: [REPO] }))
  const tw = require(require.resolve('@tailwindcss/postcss', { paths: [REPO] }))
  const src = fs.readFileSync(path.join(REPO, 'app/(app)/globals.css'), 'utf8').replace(/@import "leaflet[^"]*";\n?/, '')
  const tailwind = (await postcss([tw({ base: REPO })]).process(src, { from: path.join(REPO, 'app/(app)/globals.css') })).css
  const css = [tailwind, ...['app/(public)/(site)/landing/landing.css', 'app/(app)/contact/contact-form.css'].map(f => fs.readFileSync(path.join(REPO, f), 'utf8'))].join('\n')
  const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO }).toString().trim()
  fs.writeFileSync(file, JSON.stringify({ commit, css, pages }))
  console.log(`captured ${Object.keys(pages).length} pages at ${commit}${execFileSync('git', ['status', '--short'], { cwd: REPO }).toString().trim() ? ' (with uncommitted changes)' : ''}`)
}

function doc(side, key) {
  const p = side.pages[key]
  const dir = p.lang.startsWith('ar') ? ' dir="rtl"' : ''
  return `<!doctype html><html lang="${p.lang}"${dir}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${side.css}</style></head><body>${p.html}</body></html>`
}

async function shoot(beforeFile, afterFile) {
  fs.mkdirSync(OUT, { recursive: true })
  const sides = { before: JSON.parse(fs.readFileSync(beforeFile, 'utf8')), after: JSON.parse(fs.readFileSync(afterFile, 'utf8')) }
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x')
    const m = /^\/__page\/(before|after)\/(.+)$/.exec(u.pathname)
    if (m) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(doc(sides[m[1]], decodeURIComponent(m[2]))) }
    const f = path.join(REPO, 'public', decodeURIComponent(u.pathname))
    if (f.startsWith(path.join(REPO, 'public')) && fs.existsSync(f) && fs.statSync(f).isFile()) { res.writeHead(200, { 'content-type': f.endsWith('.svg') ? 'image/svg+xml' : f.endsWith('.png') ? 'image/png' : 'application/octet-stream' }); return res.end(fs.readFileSync(f)) }
    res.writeHead(404); res.end()
  })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}`
  const { webkit } = require('playwright')
  const browser = await webkit.launch()
  const open = async (side, key, width, height = 900) => {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })
    const page = await ctx.newPage()
    await page.goto(`${base}/__page/${side}/${encodeURIComponent(key)}`, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts && document.fonts.ready)
    return { page, ctx }
  }
  const footerOf = page => page.$('footer')

  console.log(`\n── 1 · the pages, before (${sides.before.commit}) and after (${sides.after.commit}): the top of the page and the footer, 1280px and 390px`)
  for (const [name, key] of Object.entries(SHOTS)) for (const width of [1280, 390]) for (const side of ['before', 'after']) {
    const { page, ctx } = await open(side, key, width, width === 1280 ? 800 : 844)
    await page.screenshot({ path: path.join(OUT, `${name}-${width}-top-${side}.jpg`), type: 'jpeg', quality: 75 })
    const f = await footerOf(page)
    if (f) await f.screenshot({ path: path.join(OUT, `${name}-${width}-footer-${side}.png`) })
    await ctx.close()
  }
  t('photographed: 7 pages × 1280 / 390 × before / after (the top of each page, and its footer)', fs.readdirSync(OUT).filter(f => /-(top|footer)-(before|after)\./.test(f)).length >= 7 * 2 * 2 * 2 - 0)

  console.log('\n── 2 · desktop (1280px): the landing\'s footer is unchanged')
  const px = async (side, key, width) => { const { page, ctx } = await open(side, key, width); const f = await footerOf(page); const buf = await f.screenshot(); const box = await f.boundingBox(); await ctx.close(); return { buf, h: Math.round(box.height) } }
  for (const seg of ['uk', 'fr', 'de', 'jp', 'ae']) {
    const a = await px('before', `landing:${seg}`, 1280), b = await px('after', `landing:${seg}`, 1280)
    t(`/${seg} at 1280px: the footer is pixel-identical before and after (${a.h}px tall)`, Buffer.compare(a.buf, b.buf) === 0 && a.h === b.h, { before: a.h, after: b.h })
  }

  console.log('\n── 3 · the phone footer at 360px and 430px — en-GB, fr-FR, de-DE, ja-JP, ar-AE (right to left): heights before / after')
  const heights = []
  for (const [loc, seg] of [['en-GB', 'uk'], ['fr-FR', 'fr'], ['de-DE', 'de'], ['ja-JP', 'jp'], ['ar-AE', 'ae']]) for (const width of [360, 430]) {
    const row = { loc, width }
    for (const side of ['before', 'after']) {
      const { page, ctx } = await open(side, `landing:${seg}`, width, 844)
      const f = await footerOf(page)
      await f.screenshot({ path: path.join(OUT, `footer-${loc}-${width}-${side}.png`) })
      row[side] = Math.round((await f.boundingBox()).height)
      if (side === 'after') row.order = await page.$$eval('footer .foot-links > *', els => els.map(e => ({ t: (e.textContent || '').trim(), x: Math.round(e.getBoundingClientRect().left), y: Math.round(e.getBoundingClientRect().top) })).sort((p, q) => p.y - q.y || (document.dir === 'rtl' ? q.x - p.x : p.x - q.x)).map(e => e.t))
      await ctx.close()
    }
    heights.push(row)
  }
  for (const r of heights) t(`${r.loc} at ${r.width}px: the footer is shorter — ${r.before}px → ${r.after}px; reads ${JSON.stringify(r.order)}`, r.after < r.before, r)
  const uk = heights.find(r => r.loc === 'en-GB' && r.width === 360)
  t('English reads "Features · Pricing · FAQ · About / Privacy · Terms · Contact · GB ⌄"', JSON.stringify(uk.order.slice(0, 7)) === JSON.stringify(['Features', 'Pricing', 'FAQ', 'About', 'Privacy', 'Terms', 'Contact']) && /GB/.test(uk.order[7] || ''), uk.order)
  fs.writeFileSync(path.join(OUT, 'footer-heights.json'), JSON.stringify(heights.map(({ order, ...r }) => r), null, 1) + '\n')

  console.log('\n── 4 · all 28 languages (+ en-GB) at 360px: no sideways overflow, every footer item ≥ 44px tall, four to a row')
  const pageWidth = {}
  for (const [loc, seg] of Object.entries(LANG_SEG)) {
    const { page, ctx } = await open('before', `landing:${seg}`, 360, 844)
    pageWidth[loc] = await page.evaluate(() => document.documentElement.scrollWidth)
    await ctx.close()
  }
  const lang = []
  for (const [loc, seg] of Object.entries(LANG_SEG)) {
    const { page, ctx } = await open('after', `landing:${seg}`, 360, 844)
    lang.push(await page.evaluate(loc => {
      const f = document.querySelector('footer'), links = [...f.querySelectorAll('.foot-links > *')], btn = f.querySelector('.cc-btn')
      const items = links.map(e => ({ t: (e.textContent || '').trim(), w: e.clientWidth, sw: e.scrollWidth, h: Math.round(e.getBoundingClientRect().height), top: Math.round(e.getBoundingClientRect().top) }))
      const rows = [...new Set(items.map(i => i.top))].length
      return { loc, footer: { sw: f.scrollWidth, cw: f.clientWidth }, page: { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth },
        overflow: items.filter(i => i.sw > i.w).map(i => i.t), short: items.filter(i => i.h < 44).map(i => `${i.t} ${i.h}px`), btn: btn ? Math.round(btn.getBoundingClientRect().height) : null, n: items.length, rows }
    }, loc))
    await ctx.close()
  }
  fs.writeFileSync(path.join(OUT, 'overflow-360.json'), JSON.stringify(lang, null, 1) + '\n')
  t('no footer is wider than the phone (scrollWidth ≤ clientWidth) in any language', lang.every(l => l.footer.sw <= l.footer.cw), lang.filter(l => l.footer.sw > l.footer.cw))
  // ⚠️ Two landing pages ALREADY scroll sideways at 360px before this work, in their body, not the footer (cs-CZ: the pricing
  // section's "cheap-head" heading; el-GR: the hero's h1) — reported, not this work's to change. The check is that nothing got wider.
  const wider = lang.filter(l => l.page.sw > Math.max(l.page.cw, pageWidth[l.loc]))
  t(`no page scrolls sideways at 360px more than it did before, in any language (already wider before: ${lang.filter(l => pageWidth[l.loc] > l.page.cw).map(l => `${l.loc} ${pageWidth[l.loc]}px`).join(', ') || 'none'})`, !wider.length, wider.map(l => [l.loc, l.page, pageWidth[l.loc]]))
  t('no footer item overflows its column in any language (labels wrap instead)', lang.every(l => !l.overflow.length), lang.filter(l => l.overflow.length).map(l => [l.loc, l.overflow]))
  t('every footer link and the country button is at least 44px tall, in every language', lang.every(l => !l.short.length && l.btn >= 44), lang.filter(l => l.short.length || l.btn < 44).map(l => [l.loc, l.short, l.btn]))
  t('four to a row: 7 or 8 items in two rows in every language', lang.every(l => l.rows === 2 && (l.n === 7 || l.n === 8)), lang.map(l => [l.loc, l.n, l.rows]))

  await browser.close(); server.close()
  console.log(`\nsite-chrome-1-screens: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}

const [mode, a, b] = process.argv.slice(2)
;(mode === 'capture' ? capture(a) : mode === 'shoot' ? shoot(a, b) : Promise.reject(new Error('usage: capture <file> | shoot <before> <after>'))).catch(e => { console.error(e); process.exit(1) })
