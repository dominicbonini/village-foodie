#!/usr/bin/env node
// scripts/signup-landing-screenshots.cjs — Phase 2D-1's new screens, rendered for real, photographed and measured.
//   node scripts/signup-landing-screenshots.cjs   (needs `npx next build` for the app CSS, and local Chromium)
//
// ── WHAT IS PHOTOGRAPHED ──────────────────────────────────────────────────────────────────────────────────
// • The LANDING page, server-rendered by the REAL page module exactly as marketing-country-parity.cjs renders it
//   (fixture country rows from the seed migrations, GB and a switched-on US), then its two country menus brought
//   to life in the browser with the REAL components/landing/CountryMenu.tsx so the menu can be opened.
// • The SETUP step, "Where's your truck based?" — the REAL app/setup/page.tsx and the REAL demo modal
//   (components/DemoGetStarted.tsx), bundled for a browser. Every /api/* call is answered by Playwright with
//   fixtures (the countries list is built by the REAL lib/signup-countries.ts from the seed rows).
// Nothing reaches a database, Google or the network. Fonts are the system fallback (next/font is Next's own).
//
// It writes, into docs/screenshots/ (1440×900 and 390×844):
//   signup-country-<w>-setup-step.png        /setup, first step, as a visitor from the UK first sees it
//   signup-country-<w>-setup-suggestions.png the town box with suggestions open
//   signup-country-<w>-setup-us-zone.png     United States chosen: the time zone select appears
//   signup-country-<w>-demo-modal-step.png   the demo modal's wizard on the same step
//   landing-country-1440-header.png          the header: nav links, the country button, the CTA
//   landing-country-1440-header-menu.png     the header menu open
//   landing-country-<w>-footer.png           the footer with its country button
//   landing-country-390-footer-menu.png      the footer menu open on a phone
//   landing-country-390-header.png           the phone header — no country button
// …and FAILS on overlap or cut-off: a sideways-scrolling page, header items overlapping or wrapping, a button
// or menu item under 44px, a menu running off the screen.
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http')
const REPO = path.resolve(__dirname, '..')
const OUT = path.join(REPO, 'docs/screenshots')
fs.mkdirSync(OUT, { recursive: true })
const MC = require('./marketing-country-parity.cjs')
const kit = require('./_render-kit.cjs')({ cacheTag: 'signup-landing-shots' })

let failures = 0, checks = 0
const t = (name, cond, detail) => { checks++; if (cond) return; failures++; console.log(`  ✗ ${name}${detail !== undefined ? `\n      ${JSON.stringify(detail)}` : ''}`) }

function appCss() {
  const root = path.join(REPO, '.next/static')
  if (!fs.existsSync(root)) throw new Error('no .next/static — run `npx next build` first')
  const files = []
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.name.endsWith('.css')) files.push(f) } }
  walk(root)
  const css = files.map(f => fs.readFileSync(f, 'utf8')).join('\n')
  if (!css.includes('.cc-menu') || !css.includes('min-h-\\[44px\\]')) throw new Error('the compiled CSS predates Phase 2D-1 — run `npx next build`')
  return css
}

const NAV = "export const useRouter = () => ({ push(){}, replace(){}, refresh(){}, back(){}, prefetch(){} }); export const usePathname = () => location.pathname; export const useSearchParams = () => new URLSearchParams(location.search); export const useParams = () => ({}); export const notFound = () => {}; export const redirect = () => {}"
const BROWSER_STUBS = {
  'next/navigation': NAV,
  'next/link': "import React from 'react'; export default function Link(p) { const { href, children, prefetch, replace, scroll, ...rest } = p; return React.createElement('a', { href: typeof href === 'string' ? href : '#', ...rest }, children) }",
  'next/image': "import React from 'react'; export default function Image(p) { const { src, alt, fill, priority, quality, placeholder, blurDataURL, unoptimized, loader, sizes, ...rest } = p; return React.createElement('img', { src: typeof src === 'string' ? src : (src && src.src) || '', alt, ...rest }) }",
}
async function browserBundle(dir, name, source) {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const entry = path.join(dir, `${name}.tsx`)
  fs.writeFileSync(entry, source)
  await esbuild.build({
    entryPoints: [entry], bundle: true, outfile: path.join(dir, `${name}.js`), format: 'iife', platform: 'browser',
    jsx: 'automatic', target: 'es2020', logLevel: 'error', alias: { '@': REPO }, nodePaths: [path.join(REPO, 'node_modules')],
    banner: { js: 'window.process = window.process || { env: {} };' },
    loader: { '.svg': 'text', '.png': 'empty', '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_SUPABASE_URL': '"http://127.0.0.1:9"', 'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': '"harness"', 'process.env.NEXT_PUBLIC_PRICING_PUBLISHED': '"true"' },
    plugins: [{ name: 'stubs', setup(b) {
      b.onResolve({ filter: /^next\/(navigation|link|image)$/ }, a => ({ path: a.path, namespace: 'stub' }))
      b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: BROWSER_STUBS[a.path], loader: 'js', resolveDir: REPO }))
    } }],
  })
  return fs.readFileSync(path.join(dir, `${name}.js`), 'utf8')
}

;(async () => {
  const css = appCss()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-2d1-'))
  const GB = MC.SEEDS.gbFromSeed()
  const US = { ...MC.SEEDS.usFromSeed(), enabled: true, starterMonthlyMinor: 3900, proMonthlyMinor: 5900, maxMonthlyMinor: 9900, proAllowanceMinor: 30000, maxAllowanceMinor: 100000, platformFeePct: 1.5 }

  // ── the landing, server-rendered, and the menu the server handed its two buttons ──────────────────────
  const landing = await MC.visit('landing', { rows: [GB, US], ip: 'GB' })
  const marked = await MC.visit('landing', { rows: [GB, US], ip: 'GB', build: 'marked' })
  const menu = marked.menus[0].menu
  // ── the signup countries, built by the real module from the same rows ──────────────────────────────────
  const sc = await kit.bundle('sc', `export { signupCountries, guessSignupCountry } from '@/lib/signup-countries'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'`, { stubs: MC.STUBS })
  globalThis.__harnessDb = kit.fakeDb({ country_settings: [GB, US].map(MC.snake) }); sc.clearCountrySettingsCache()
  const countries = await sc.signupCountries()
  const guess = sc.guessSignupCountry(countries, 'GB')
  delete globalThis.__harnessDb

  const menuJs = await browserBundle(dir, 'menus', `import { createRoot } from 'react-dom/client'
import { CountryMenu } from '@/components/landing/CountryMenu'
const menu = (window as any).__MENU
for (const el of Array.from(document.querySelectorAll('div.cc'))) {
  const host = document.createElement('span'); host.style.display = 'contents'; el.replaceWith(host)
  createRoot(host).render(<CountryMenu menu={menu} variant={el.classList.contains('cc-head') ? 'header' : 'footer'} />)
}
document.documentElement.setAttribute('data-ready', '1')`)
  const setupJs = await browserBundle(dir, 'setup', `import { createRoot } from 'react-dom/client'
import SetupPage from '@/app/setup/page'
createRoot(document.getElementById('root')!).render(<SetupPage />)`)
  const demoJs = await browserBundle(dir, 'demo', `import { createRoot } from 'react-dom/client'
import { DemoGetStarted } from '@/components/DemoGetStarted'
createRoot(document.getElementById('root')!).render(<div style={{ padding: 24 }}><DemoGetStarted token="demo-harness" isAdmin /></div>)`)

  const doc = (body, script, extra = '') => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style>${extra}</head><body>${body}<script src="/${script}.js"></script></body></html>`
  const PAGES = {
    '/landing': doc(landing.html, 'menus', `<script>window.__MENU = ${JSON.stringify(menu)}</script>`),
    '/setup': doc('<div id="root"></div>', 'setup'),
    '/demo': doc('<div id="root"></div>', 'demo'),
  }
  const JS = { '/menus.js': menuJs, '/setup.js': setupJs, '/demo.js': demoJs }
  const server = http.createServer((req, res) => {
    const p = req.url.split('?')[0]
    if (JS[p]) { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(JS[p]) }
    if (PAGES[p]) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(PAGES[p]) }
    const pub = path.join(REPO, 'public', decodeURIComponent(p))
    if (pub.startsWith(path.join(REPO, 'public') + path.sep) && fs.existsSync(pub) && fs.statSync(pub).isFile()) {
      const type = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' }[path.extname(pub)] || 'application/octet-stream'
      res.writeHead(200, { 'content-type': type }); return res.end(fs.readFileSync(pub))
    }
    res.writeHead(404); res.end()
  })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}`
  const SUGGEST = { state: 'ok', suggestions: [
    { placeId: 'ChIJharnessSudbury01', name: 'Sudbury', detail: 'Suffolk, UK' },
    { placeId: 'ChIJharnessSudbury02', name: 'Sudbury', detail: 'Derbyshire, UK' },
    { placeId: 'ChIJharnessSudbrook1', name: 'Sudbrook', detail: 'Lincolnshire, UK' },
  ] }
  const apis = async page => page.route('**/api/**', route => {
    const u = new URL(route.request().url())
    const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (u.pathname === '/api/setup/countries') return json({ ok: true, countries, guess })
    if (u.pathname === '/api/setup') return json({ ok: true, truck: null })
    if (u.pathname === '/api/places/suggest') return json(SUGGEST)
    if (u.pathname === '/api/places/details') return json({ state: 'ok', place: { placeId: 'ChIJharnessSudbury01', name: 'Sudbury', region: 'Suffolk', lat: 52.038912, lng: 0.730711 } })
    return json({})
  })

  const { chromium } = require('playwright')
  const browser = await chromium.launch()
  const box = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom, display: cs.display } }, sel)
  const sideways = page => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  try {
    // ════════════ SETUP STEP ════════════
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      const page = await browser.newPage({ viewport: { width: w, height: h } })
      const errors = []; page.on('pageerror', e => errors.push(String(e)))
      await apis(page)
      await page.goto(`${base}/setup`)
      await page.waitForSelector('#base-country', { timeout: 20000 })
      await page.waitForTimeout(200)
      const m = await page.evaluate(() => {
        const txt = document.body.innerText
        const fields = [...document.querySelectorAll('#base-country, #base-town, #base-zone, [role="radio"], [role="radiogroup"]')].map(e => e.id || e.getAttribute('role'))
        const cont = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Continue').getBoundingClientRect()
        const card = document.querySelector('#base-country').closest('.rounded-2xl').getBoundingClientRect()
        return { txt, fields, cont: { w: cont.width, h: cont.height }, cardW: card.width, zone: !!document.querySelector('#base-zone'), country: document.querySelector('#base-country').value }
      })
      const tag = `${w}`
      t(`setup ${tag}: no page errors`, errors.length === 0, errors.slice(0, 3))
      t(`setup ${tag}: the heading, the intro and the three questions`, /Where’s your truck based\?/.test(m.txt) && /This sets your currency, prices, time zone and phone format\. The country can’t be changed later, because it’s tied to your card payments\./.test(m.txt)
        && /Town or city you’re based in/i.test(m.txt))
      t(`setup ${tag}: pre-filled GB with the "we guessed" hint (the visitor is in the UK)`, m.country === 'GB' && /We guessed this from where you are\. Change it if it’s wrong\./.test(m.txt))
      t(`setup ${tag}: only country and town for the UK — no travel question, no hint, no choice buttons`, m.fields.join() === 'base-country,base-town' && !/travel|How far/i.test(m.txt), m.fields)
      t(`setup ${tag}: no zone select for the UK (one zone)`, !m.zone)
      t(`setup ${tag}: the stepper names the new first step`, /1\. Where you’re based/.test(m.txt) && /2\. Your truck/.test(m.txt))
      t(`setup ${tag}: Continue is full width and at least 44px`, m.cont.h >= 44 && m.cont.w >= Math.min(w, 512) - 40, m.cont)
      t(`setup ${tag}: no sideways scroll`, !(await sideways(page)))
      t(`setup ${tag}: no phone box on this step`, !(await page.$('#setup-phone')))
      await page.screenshot({ path: path.join(OUT, `signup-country-${tag}-setup-step.png`), fullPage: true })

      await page.fill('#base-town', 'Sud')
      await page.waitForSelector('#base-town-list', { timeout: 5000 })
      const list = await page.evaluate(() => { const l = document.querySelector('#base-town-list').getBoundingClientRect(); const items = [...document.querySelectorAll('#base-town-list button')].map(b => b.getBoundingClientRect().height); return { r: l.right, l: l.left, items } })
      t(`setup ${tag}: suggestions open under the box, inside the screen, items at least 44px`, list.items.length === 3 && list.items.every(x => x >= 44) && list.l >= 0 && list.r <= w, list)
      await page.screenshot({ path: path.join(OUT, `signup-country-${tag}-setup-suggestions.png`), fullPage: true })
      await page.click('#base-town-list button')
      await page.waitForTimeout(200)
      t(`setup ${tag}: picking a suggestion fills the box`, (await page.inputValue('#base-town')) === 'Sudbury')

      await page.selectOption('#base-country', 'US')
      await page.waitForSelector('#base-zone', { timeout: 5000 })
      const us = await page.evaluate(() => ({ txt: document.body.innerText, zone: document.querySelector('#base-zone').value, town: document.querySelector('#base-town').value, hint: document.body.innerText.includes('We guessed this') }))
      t(`setup ${tag}: United States → the zone select appears (7 zones), pre-filled; the town is cleared`, us.zone === 'America/New_York' && us.town === '' && /Time zone/i.test(us.txt), us)
      t(`setup ${tag}: the "we guessed" hint stays only for the guessed country`, !us.hint)
      t(`setup ${tag}: no sideways scroll with the zone select`, !(await sideways(page)))
      await page.screenshot({ path: path.join(OUT, `signup-country-${tag}-setup-us-zone.png`), fullPage: true })

      // Continue with nothing chosen → every problem at once, in the server's words.
      await page.selectOption('#base-country', 'GB')
      await page.getByRole('button', { name: 'Continue' }).click()
      const errs = await page.evaluate(() => document.body.innerText)
      t(`setup ${tag}: Continue with no town → "Tell us the town…", still on the step`, /Tell us the town or city you’re based in\./.test(errs) && !(await page.$('#setup-phone')))
      // A full answer → the truck step, whose phone box is the chosen country's.
      await page.fill('#base-town', 'Little Snoring')
      await page.getByRole('button', { name: 'Continue' }).click()
      await page.waitForSelector('#setup-phone', { timeout: 5000 })
      t(`setup ${tag}: then the truck step, its phone box worded for the UK`, (await page.getAttribute('#setup-phone', 'placeholder')) === '07700 900123')
      await page.close()
    }
    // ════════════ THE DEMO MODAL, SAME STEP ════════════
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      const page = await browser.newPage({ viewport: { width: w, height: h } })
      const errors = []; page.on('pageerror', e => errors.push(String(e)))
      await apis(page)
      await page.goto(`${base}/demo`)
      await page.getByRole('button').first().click()
      await page.locator('[role="dialog"] input[type="email"]:visible').first().fill('harness@example.test')
      await page.getByRole('button', { name: 'Set up my truck →' }).click()
      await page.waitForSelector('#base-country', { timeout: 20000 })
      await page.waitForTimeout(200)
      const m = await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"]').getBoundingClientRect()
        return { txt: document.querySelector('[role="dialog"]').innerText, inView: d.top >= 0 && d.bottom <= window.innerHeight + 1 && d.left >= 0 && d.right <= window.innerWidth + 1 }
      })
      t(`demo modal ${w}: no page errors`, errors.length === 0, errors.slice(0, 3))
      t(`demo modal ${w}: header "Where’s your truck based?", the step, a Continue`, /Where’s your truck based\?/.test(m.txt) && /Town or city you’re based in/i.test(m.txt) && !/How far/i.test(m.txt) && /Continue/.test(m.txt))
      t(`demo modal ${w}: the modal fits the screen`, m.inView)
      t(`demo modal ${w}: no sideways scroll`, !(await sideways(page)))
      await page.screenshot({ path: path.join(OUT, `signup-country-${w}-demo-modal-step.png`) })
      // Through to the details step: the phone box is the chosen country's (US here).
      await page.selectOption('#base-country', 'US')
      await page.fill('#base-town', 'Austin')
      await page.getByRole('button', { name: 'Continue' }).click()
      await page.waitForTimeout(150)
      const onTruck = await page.evaluate(() => document.querySelector('[role="dialog"]').innerText)
      t(`demo modal ${w}: Continue → "About your truck"`, /About your truck/.test(onTruck))
      await page.close()
    }

    // ════════════ LANDING ════════════
    for (const [w, h] of [[1440, 900], [1024, 768], [390, 844]]) {
      const page = await browser.newPage({ viewport: { width: w, height: h } })
      const errors = []; page.on('pageerror', e => errors.push(String(e)))
      await page.goto(`${base}/landing`)
      await page.waitForSelector('html[data-ready="1"]', { timeout: 20000 })
      await page.waitForTimeout(300)
      t(`landing ${w}: no page errors`, errors.length === 0, errors.slice(0, 3))
      t(`landing ${w}: no sideways scroll`, !(await sideways(page)))
      const head = await box(page, '.cc-head'), headBtn = await box(page, '.cc-head .cc-btn')
      if (w >= 1024) {
        const row = await page.evaluate(() => {
          const kids = [...document.querySelector('nav .nav-r').children].map(e => (getComputedStyle(e).display === 'contents' ? e.firstElementChild : e)).filter(e => e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0)
          const rs = kids.map(e => { const r = e.getBoundingClientRect(); return { cls: e.className, text: e.textContent.trim().slice(0, 24), l: r.left, r: r.right, t: r.top, b: r.bottom } })
          const overlap = rs.some((a, i) => rs.some((b, j) => j > i && !(a.r <= b.l || b.r <= a.l)))
          const nav = document.querySelector('nav').getBoundingClientRect()
          return { rs, overlap, oneLine: new Set(rs.map(x => Math.round((x.t + x.b) / 2))).size === 1, navH: nav.height, inside: rs.every(x => x.r <= window.innerWidth && x.b <= nav.bottom) }
        })
        const texts = row.rs.map(x => x.text)
        const cc = texts.findIndex(x => /^UK/.test(x)), login = texts.indexOf('Log in'), cta = row.rs.findIndex(x => /nav-cta/.test(x.cls))
        t(`landing ${w}: the header country button is shown, between the nav links and the CTA`, head?.display === 'flex' || head?.display === 'inline-flex' ? (login >= 0 && cc > login && cta > cc) : false, texts)
        t(`landing ${w}: header items on one line, none overlapping, inside the bar`, row.oneLine && !row.overlap && row.inside, row)
        t(`landing ${w}: header button at least 44px tall`, headBtn && headBtn.h >= 44, headBtn)
        const label = await page.getAttribute('.cc-head .cc-btn', 'aria-label')
        t(`landing ${w}: aria-label "Country: United Kingdom. Change country"`, label === 'Country: United Kingdom. Change country', label)
        if (w === 1440) {
          await page.locator('nav').screenshot({ path: path.join(OUT, 'landing-country-1440-header.png') })
          await page.click('.cc-head .cc-btn')
          await page.waitForSelector('.cc-head .cc-menu')
          const mm = await page.evaluate(() => {
            const m = document.querySelector('.cc-head .cc-menu').getBoundingClientRect()
            const items = [...document.querySelectorAll('.cc-head .cc-item')].map(i => ({ h: i.getBoundingClientRect().height, text: i.textContent, checked: i.getAttribute('aria-checked'), tick: !!i.querySelector('.cc-tick'), flag: !!i.querySelector('img.cc-flag') }))
            return { inView: m.left >= 0 && m.right <= window.innerWidth && m.top >= 0 && m.bottom <= window.innerHeight, items, expanded: document.querySelector('.cc-head .cc-btn').getAttribute('aria-expanded') }
          })
          t('landing 1440: the menu opens in view, lists the switched-on countries with flags, UK ticked', mm.inView && mm.expanded === 'true' && mm.items.map(i => i.text).join('|') === 'United Kingdom|United States' && mm.items[0].checked === 'true' && mm.items[0].tick && !mm.items[1].tick && mm.items.every(i => i.flag), mm)
          t('landing 1440: menu items at least 44px tall', mm.items.every(i => i.h >= 44), mm.items)
          const clip = await page.evaluate(() => { const n = document.querySelector('nav').getBoundingClientRect(); const m = document.querySelector('.cc-head .cc-menu').getBoundingClientRect(); const x = Math.max(0, Math.min(n.right - 560, m.left - 24)); return { x, y: 0, width: Math.min(n.right, window.innerWidth) - x, height: m.bottom + 16 } })
          await page.screenshot({ path: path.join(OUT, 'landing-country-1440-header-menu.png'), clip })
          await page.keyboard.press('Escape')
          t('landing 1440: Escape closes it', !(await page.$('.cc-head .cc-menu')))
        }
      } else {
        t(`landing ${w}: no country button in the phone header`, head?.display === 'none', head)
        await page.locator('nav').screenshot({ path: path.join(OUT, `landing-country-${w}-header.png`) })
      }
      // footer, every width
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      await page.waitForTimeout(150)
      const footBtn = await box(page, '.cc-foot .cc-btn')
      t(`landing ${w}: the footer country button is shown, at least 44px tall, full name`, footBtn && footBtn.h >= 44 && (await page.textContent('.cc-foot .cc-btn')).trim() === 'United Kingdom', footBtn)
      const fo = await page.evaluate(() => {
        const f = document.querySelector('footer'); const kids = [...f.querySelectorAll('.foot-links a, .foot-apps a, .cc-foot')].map(e => e.getBoundingClientRect())
        const overlap = kids.some((a, i) => kids.some((b, j) => j > i && !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top)))
        return { overlap, inside: kids.every(k => k.left >= 0 && k.right <= window.innerWidth) }
      })
      t(`landing ${w}: footer links, badges and the country button don't overlap and fit`, !fo.overlap && fo.inside, fo)
      if (w !== 1024) await page.locator('footer').screenshot({ path: path.join(OUT, `landing-country-${w}-footer.png`) })
      await page.click('.cc-foot .cc-btn')
      await page.waitForSelector('.cc-foot .cc-menu')
      const fm = await page.evaluate(() => { const m = document.querySelector('.cc-foot .cc-menu').getBoundingClientRect(); const b = document.querySelector('.cc-foot .cc-btn').getBoundingClientRect(); return { inView: m.left >= 0 && m.right <= window.innerWidth && m.top >= 0, above: m.bottom <= b.top + 1 } })
      t(`landing ${w}: the footer menu opens upward, inside the screen`, fm.inView && fm.above, fm)
      if (w === 390) await page.screenshot({ path: path.join(OUT, 'landing-country-390-footer-menu.png') })
      await page.close()
    }
  } finally { await browser.close(); server.close() }

  console.log(`\n${failures ? '🔴' : '✅'} signup-landing-screenshots: ${checks - failures}/${checks} checks passed`)
  if (failures) process.exit(1)
})().catch(e => { console.error('🔴', e && e.stack || e); process.exit(1) })
