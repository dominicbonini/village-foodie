#!/usr/bin/env node
// scripts/badges-manual-1.cjs — badges-manual-1 (8 November 2026; docs/badges-manual-1-report.md). Every Google Play badge the same VISIBLE
// size as the App Store badge beside it, in every language.
//   node scripts/badges-manual-1.cjs            the checks (files, the one rule, the markup)
//   node scripts/badges-manual-1.cjs --shots    …and the measured proof: the REAL components/StoreBadges.tsx markup with the REAL footer
//                                               stylesheet (landing.css) in Chromium at 1280px and 390px for English and all 28 languages;
//                                               each pair photographed (docs/badges-manual-1/<locale>-<width>.png) and each badge's VISIBLE
//                                               height measured from the screenshot's own pixels (anything not the footer's background).
//                                               Needs a local Chromium (Playwright); not a build. By hand: harnesses.json's excluded group.
// Proves: 27 languages use Google's own full-bleed SVG (byte-for-byte as in the manifest, no script, no external reference); zh-HK's PNG
// keeps its transparent margin, cancelled in layout; ONE sizing rule in components/StoreBadges.tsx (used by the footer and Manage ›
// Settings); Apple's markup is exactly as before; with --shots, Apple and Google visible heights equal within 1px at both widths.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const http = require('http')
const crypto = require('crypto')
const kit = require('./_render-kit.cjs')({ cacheTag: 'badges-manual-1' })
const REPO = kit.REPO
const SHOTS = process.argv.includes('--shots')
const OUT = path.join(REPO, 'docs/badges-manual-1')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const sha = b => crypto.createHash('sha256').update(b).digest('hex')

;(async () => {
  const M = await kit.bundle('bm1-lib', [
    "export { StoreBadges } from '@/components/StoreBadges'",
    "export { badgeFor, GOOGLE_BADGES, APPLE_BADGES, GOOGLE_ENGLISH, APPLE_ENGLISH } from '@/lib/store-badge-files'",
    "export { LANGUAGE_BASES } from '@/lib/i18n/locales'",
  ].join('\n'))
  const MAN = JSON.parse(read('scripts/fixtures/store-badges-1-manifest.json'))
  const LOCALES = ['en-GB', ...M.LANGUAGE_BASES]
  const markup = (locale, apps = { ios: true, android: true }) => kit.renderStatic(kit.h(M.StoreBadges, { className: 'foot-apps', linkClassName: 'foot-badge', locale, countryCode: locale === 'en-GB' ? 'GB' : locale.slice(3), apps }))

  head('1 · the files: Google\'s own full-bleed SVG in 27 languages, zh-HK\'s PNG with its margin recorded')
  const g = MAN.files.filter(f => f.vendor === 'google')
  const svg = g.filter(f => f.file.endsWith('.svg')), png = g.filter(f => f.file.endsWith('.png'))
  t('27 SVGs and one PNG (zh-HK) — every one byte-for-byte as recorded', svg.length === 27 && png.length === 1 && png[0].locale === 'zh-HK'
    && g.every(f => { const b = fs.readFileSync(path.join(REPO, 'public', f.file)); return b.length === f.bytes && sha(b) === f.sha256 }))
  t('…each SVG from Google\'s Partner Marketing Hub, its original filename kept in the manifest, downloaded 2026-11-08', svg.every(f => f.source.startsWith('https://partnermarketinghub.withgoogle.com/brands/google-play/') && /^GetItOnGooglePlay_Badge_(Web|Print)_color_/.test(f.title) && f.downloaded === '2026-11-08'))
  t('…no script, no foreignObject, no external reference in any SVG (they are served as <img> in any case)', svg.every(f => !/<script|foreignObject|href="http|url\(http|@import/.test(read(`public${f.file}`))))
  t('no old PNG left beside its SVG', fs.readdirSync(path.join(REPO, 'public/badges/google')).filter(x => x.endsWith('.png')).join() === 'zh-HK.png')
  t('lib/store-badge-files.ts: the SVGs at their own viewBox, zh-HK with inset 29/29 (of 250)', svg.every(f => { const e = M.GOOGLE_BADGES[f.locale]; return e.src === f.file && e.width === f.width && e.height === f.height && !e.inset })
    && JSON.stringify(M.GOOGLE_BADGES['zh-HK']) === JSON.stringify({ src: '/badges/google/zh-HK.png', width: 646, height: 250, inset: { top: 29, bottom: 29 } }))

  head('2 · one rule, in one place; Apple unchanged')
  const comp = read('components/StoreBadges.tsx')
  t('the rule lives in components/StoreBadges.tsx (Google\'s visible height = `height`); the footer and Manage › Settings both render <StoreBadges>', /const playVisible = play\.inset \?/.test(comp) && /const playH = height \/ playVisible/.test(comp)
    && /<StoreBadges className="foot-apps"/.test(read('components/landing/LandingFooter.tsx')) && /<StoreBadges className="mt-3 flex flex-wrap items-center gap-3"/.test(read('app/(app)/manage/[token]/page.tsx')))
  const en = markup('en-GB')
  t('English: exactly the markup it had (Apple 120 × 40, Google 135 × 40, height-driven, no margin)', en.includes('src="/badges/Download_on_the_App_Store_Badge_US-UK_RGB_blk_092917.svg"') && /alt="[^"]*" width="120" height="40" loading="lazy" style="height:40px;width:auto;display:block"/.test(en)
    && /src="\/badges\/GetItOnGooglePlay_Badge_Web_color_English\.svg" alt="[^"]*" width="135" height="40" loading="lazy" style="height:40px;width:auto;display:block"/.test(en), en)
  const appleSame = LOCALES.every(l => { const a = M.badgeFor('apple', l); return new RegExp(`src="${a.src}" alt="[^"]*" width="${Math.round(a.width / a.height * 40)}" height="40" loading="lazy" style="height:40px;width:auto;display:block"`).test(markup(l)) })
  t('Apple\'s badge: the same src, width, height and style as before in every language (untouched)', appleSame)
  const fr = markup('fr-FR'), hk = markup('zh-HK')
  t('a full-bleed SVG (fr-FR): 40px tall, no margin', /src="\/badges\/google\/fr-FR\.svg" alt="[^"]*" width="135" height="40" loading="lazy" style="height:40px;width:auto;display:block"/.test(fr), fr)
  t('zh-HK\'s PNG: drawn 52.08px tall so its visible 192/250 is 40px, the transparent rows taken out by −6.04px margins', /src="\/badges\/google\/zh-HK\.png" alt="[^"]*" width="135" height="52" loading="lazy" style="height:52\.08333333333333\d*px;width:auto;display:block;margin:-6\.0416666666666\d*px 0 -6\.0416666666666\d*px"/.test(hk), hk)
  t('Apple first, then Google, in every language (Apple\'s rule)', LOCALES.every(l => { const m = markup(l); return m.indexOf('apps.apple.com') < m.indexOf('play.google.com') }))

  if (SHOTS) {
    head('3 · measured: the visible heights in Chromium, 1280px and 390px, every language')
    fs.mkdirSync(OUT, { recursive: true })
    const css = read('app/(public)/(site)/landing/landing.css')
    const server = http.createServer((req, res) => {
      const u = decodeURIComponent((req.url || '/').split('?')[0])
      if (u === '/page') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(globalThis.__page) }
      const f = path.join(REPO, 'public', u)
      if (!f.startsWith(path.join(REPO, 'public')) || !fs.existsSync(f)) { res.writeHead(404); return res.end() }
      res.writeHead(200, { 'content-type': f.endsWith('.svg') ? 'image/svg+xml' : 'image/png' }); fs.createReadStream(f).pipe(res)
    }).listen(0)
    const port = server.address().port
    const pw = require(path.join(REPO, 'node_modules/playwright'))
    const browser = await pw.chromium.launch()
    const rows = []
    try {
      for (const width of [1280, 390]) {
        const page = await browser.newPage({ viewport: { width, height: 400 }, deviceScaleFactor: 2 })
        for (const l of LOCALES) {
          // The footer's own wrapper and background (bg-slate-900), the real stylesheet, the real markup.
          globalThis.__page = `<!doctype html><html lang="${l}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style>
            <style>html,body{margin:0;background:#0f172a}</style></head><body><div class="hg-landing"><footer style="background:#0f172a;padding:24px 16px"><div class="foot-grid" style="justify-content:center">${markup(l)}</div></footer></div></body></html>`
          await page.goto(`http://127.0.0.1:${port}/page`, { waitUntil: 'load' })
          await page.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth > 0))
          const box = await page.locator('.foot-apps').boundingBox()
          const clip = { x: Math.max(0, box.x - 12), y: Math.max(0, box.y - 12), width: Math.min(width, box.width + 24), height: box.height + 24 }
          const file = path.join(OUT, `${l}-${width}.png`)
          await page.screenshot({ path: file, clip })
          // Each badge's visible box: within its link's column range, every pixel row that is not the background.
          const links = await page.locator('.foot-apps a').evaluateAll(as => as.map(a => { const r = a.getBoundingClientRect(); return { x: r.x, w: r.width } }))
          const sharp = require(path.join(REPO, 'node_modules/sharp'))
          const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true })
          const vis = links.map(lk => {
            const x0 = Math.max(0, Math.round((lk.x - clip.x) * 2)), x1 = Math.min(info.width - 1, Math.round((lk.x - clip.x + lk.w) * 2))
            let top = -1, bot = -1
            for (let y = 0; y < info.height; y++) for (let x = x0; x <= x1; x++) {
              const i = (y * info.width + x) * info.channels, d = Math.abs(data[i] - 15) + Math.abs(data[i + 1] - 23) + Math.abs(data[i + 2] - 42)
              if (d > 24) { if (top < 0) top = y; bot = y; break }
            }
            return top < 0 ? 0 : (bot - top + 1) / 2
          })
          rows.push({ locale: l, width, apple: vis[0], google: vis[1] })
        }
        await page.close()
      }
    } finally { await browser.close(); server.close() }
    const off = rows.filter(r => Math.abs(r.apple - r.google) > 1)
    t(`visible heights equal within 1px — ${rows.length} pairs (${LOCALES.length} languages × 1280 and 390)`, off.length === 0, off)
    t('…and every Google badge is at least the App Store badge\'s height less 1px (Google: "the same size or larger")', rows.every(r => r.google >= r.apple - 1))
    fs.writeFileSync(path.join(OUT, 'visible-heights.json'), JSON.stringify(rows, null, 1) + '\n')
    console.log('\n  | Language | 1280 App Store | 1280 Google Play | 390 App Store | 390 Google Play |\n  |---|---|---|---|---|')
    for (const l of LOCALES) { const a = rows.find(r => r.locale === l && r.width === 1280), b = rows.find(r => r.locale === l && r.width === 390); console.log(`  | ${l} | ${a.apple} | ${a.google} | ${b.apple} | ${b.google} |`) }
  }

  console.log(`\n${fail ? '🔴' : '✅'} badges-manual-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
