#!/usr/bin/env node
// scripts/admin-countries-1-screens.cjs — admin-countries-1 (23 October 2026): Admin › Countries and two other admin tabs,
// rendered for real in WebKit (Safari's engine), photographed and measured at 1512×945 (a 14in MacBook Pro) and 1920×1080.
//   node scripts/admin-countries-1-screens.cjs     (needs `npx next build` for the app CSS, and Playwright's WebKit)
//
// The REAL admin page (app/admin/page.tsx) is bundled with esbuild and served locally; every /api/* call is answered with
// fixtures — the 36 rows of scripts/_admin-countries-1-fixtures.cjs (the live 35 as on 23 Oct, and France off from 20261040).
// Nothing reaches a database or the network. A Save is answered by the route stub and never written anywhere.
//
// Writes into docs/admin-countries-1/:
//   countries-<w>-top.png            the tab as an admin first sees it
//   countries-<w>-rows-<n>.png       the table scrolled down, step by step, until the last row (all 36 rows)
//   countries-<w>-frozen.png         scrolled right and down: the Country column and both header rows stay put
//   countries-<w>-info-popover.png   an ⓘ tapped open
//   countries-<w>-ireland-changed.png  Ireland changed — highlighted, with its own Save button
//   trucks-<w>.png, domains-<w>.png  two other admin tabs, full width
// …and FAILS if: the page scrolls sideways; the frozen column or header moves; the popover is not shown; the changed row
// has no Save or another row gets one; a row is missing; the admin body is not full width with 32px side padding; or the
// PUT body of the new page differs from the OLD page's (git HEAD CountriesTab.tsx) for the same edit.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http')
const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const AC = require('./_admin-countries-1-fixtures.cjs')
const OUT = path.join(REPO, 'docs/admin-countries-1')
fs.mkdirSync(OUT, { recursive: true })

const ok = [], bad = []
const t = (name, cond, detail) => { (cond ? ok : bad).push(name); if (!cond && detail !== undefined) console.log('      ' + name + ': ' + JSON.stringify(detail).slice(0, 400)) }

function appCss() {
  const root = path.join(REPO, '.next/static')
  if (!fs.existsSync(root)) throw new Error('no .next/static — run `npx next build` first')
  const files = []
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.name.endsWith('.css')) files.push(f) } }
  walk(root)
  const css = files.map(f => fs.readFileSync(f, 'utf8')).join('\n')
  if (!css.includes('w-\\[15rem\\]') || !css.includes('border-spacing-0')) throw new Error('the compiled CSS predates the new Countries table — run `npx next build`')
  return css
}

const STUBS = {
  'next/navigation': "export const useRouter = () => ({ push(){}, replace(){}, refresh(){}, back(){}, prefetch(){} }); export const usePathname = () => '/admin'; export const useSearchParams = () => new URLSearchParams(location.search); export const redirect = () => {}; export const notFound = () => {}",
  'next/link': "import React from 'react'; export default function Link(p) { const { href, children, prefetch, replace, scroll, ...rest } = p; return React.createElement('a', { href: typeof href === 'string' ? href : '#', ...rest }, children) }",
  'next/image': "import React from 'react'; export default function Image(p) { const { src, alt, fill, priority, quality, placeholder, blurDataURL, unoptimized, loader, ...rest } = p; return React.createElement('img', { src: typeof src === 'string' ? src : '', alt, ...rest }) }",
}

async function bundle(dir, entrySrc) {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const entry = path.join(dir, 'entry.tsx')
  fs.writeFileSync(entry, entrySrc)
  await esbuild.build({
    entryPoints: [entry], bundle: true, outfile: path.join(dir, 'bundle.js'), format: 'iife', platform: 'browser',
    jsx: 'automatic', target: 'es2020', logLevel: 'error', alias: { '@': REPO }, nodePaths: [path.join(REPO, 'node_modules')],
    banner: { js: 'window.process = window.process || { env: {} };' },
    loader: { '.svg': 'text', '.png': 'empty' },
    define: {
      'process.env.NODE_ENV': '"production"',
      'process.env.NEXT_PUBLIC_SUPABASE_URL': '"http://127.0.0.1:9"', 'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': '"harness"',
      'process.env.NEXT_PUBLIC_PRICING_PUBLISHED': '"true"',
    },
    plugins: [{ name: 'stubs', setup(b) {
      b.onResolve({ filter: /^next\/(navigation|link|image)$/ }, a => ({ path: a.path, namespace: 'stub' }))
      b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: STUBS[a.path], loader: 'js', resolveDir: REPO }))
    } }],
  })
  return fs.readFileSync(path.join(dir, 'bundle.js'), 'utf8')
}

function serve(css, scripts) {
  const html = name => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}</style></head><body class="bg-white"><div id="root"></div><script src="/${name}.js"></script></body></html>`
  const server = http.createServer((req, res) => {
    const u = req.url.split('?')[0]
    const m = /^\/(\w+)\.js$/.exec(u)
    if (m && scripts[m[1]]) { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(scripts[m[1]]) }
    const pub = path.join(REPO, 'public', decodeURIComponent(u))
    if (pub.startsWith(path.join(REPO, 'public') + path.sep) && fs.existsSync(pub) && fs.statSync(pub).isFile()) {
      const type = { '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.webp': 'image/webp' }[path.extname(pub)] || 'application/octet-stream'
      res.writeHead(200, { 'content-type': type }); return res.end(fs.readFileSync(pub))
    }
    const page = /^\/(old|new)-tab/.exec(u)?.[1]
    res.writeHead(200, { 'content-type': 'text/html' }); res.end(html(page ? `${page}tab` : 'admin'))
  })
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)))
}

;(async () => {
  const css = appCss()
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-ac1-'))
  const sub = n => { const d = path.join(tmp, n); fs.mkdirSync(d); return d }
  // The OLD tab (git HEAD) beside the new one, each mounted alone, for the PUT-body comparison.
  const oldFile = path.join(sub('oldsrc'), 'CountriesTabOld.tsx')
  fs.writeFileSync(oldFile, execFileSync('git', ['show', 'HEAD:components/admin/CountriesTab.tsx'], { cwd: REPO }).toString())
  const mount = imp => `import { createRoot } from 'react-dom/client'\nimport Tab from '${imp}'\ncreateRoot(document.getElementById('root')!).render(<div style={{ padding: 24 }}><Tab /></div>)\n`
  const scripts = {
    admin: await bundle(sub('admin'), `import { createRoot } from 'react-dom/client'\nimport AdminPage from '@/app/admin/page'\ncreateRoot(document.getElementById('root')).render(<AdminPage />)\n`),
    oldtab: await bundle(sub('old'), mount(oldFile.replace(/\.tsx$/, ''))),
    newtab: await bundle(sub('new'), mount('@/components/admin/CountriesTab')),
  }
  const server = await serve(css, scripts)
  const base = `http://127.0.0.1:${server.address().port}`

  const rows = AC.liveRows().map(r => (r.countryCode === 'IE' ? { ...r, updatedBy: 'allergen-card-country', updatedAt: '2026-10-22 10:26:51.320563+00' } : { ...r, updatedBy: r.updatedBy ?? 'migration' }))
  const counts = Object.fromEntries(rows.map(r => [r.countryCode, r.countryCode === 'GB' ? 14 : r.countryCode === 'US' ? 1 : 0]))
  const GB = rows.find(r => r.countryCode === 'GB')

  const { webkit } = require('playwright')
  const browser = await webkit.launch()
  const route = (page, puts) => page.route('**/api/**', r => {
    const u = new URL(r.request().url())
    const json = body => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (u.pathname === '/api/admin/countries') {
      if (r.request().method() === 'PUT') { const b = JSON.parse(r.request().postData()); puts.push(b); return json({ country: { ...rows.find(x => x.countryCode === b.code), updatedAt: '2026-10-23T12:00:00Z' } }) }
      return json({ countries: rows, truckCounts: counts })
    }
    if (u.pathname === '/api/admin') {
      const s = u.searchParams.get('section')
      if (s === 'check_admin') return json({ isAdmin: true })
      if (s === 'discovery') return json({ discoveryTrucks: [] })
      if (s === 'demo_cleanup') return json({ lastRun: null })
      return json({ trucks: [], operators: [], countrySettings: { GB } })
    }
    if (u.pathname === '/api/auth/me') return json({ first_name: 'Dominic' })
    return json({})
  })

  try {
    // ── the PUT body: the old page and the new one, the same edit on Ireland ───────────────────────────────────────
    const bodies = {}
    for (const which of ['old', 'new']) {
      const page = await browser.newPage({ viewport: { width: 1512, height: 945 } })
      const puts = []; await route(page, puts)
      await page.goto(`${base}/${which}-tab`)
      await page.waitForSelector('[data-country-head="IE"]', { timeout: 20000 })
      await page.getByRole('switch', { name: 'Take our fee, IE' }).click()
      await page.locator('[data-country-head="IE"]').getByRole('button', { name: 'Save', exact: true }).click()
      await page.waitForTimeout(300)
      bodies[which] = puts
      await page.close()
    }
    t('the old page and the new one each send ONE PUT for Ireland', bodies.old.length === 1 && bodies.new.length === 1, { old: bodies.old.length, new: bodies.new.length })
    t('🔴 …and the two bodies are identical, byte for byte (code, expectedUpdatedAt, form)', JSON.stringify(bodies.old[0]) === JSON.stringify(bodies.new[0]))
    fs.writeFileSync(path.join(OUT, 'put-body-old-vs-new.json'), JSON.stringify(bodies, null, 1) + '\n')

    for (const [w, hgt] of [[1512, 945], [1920, 1080]]) {
      const tag = String(w)
      const page = await browser.newPage({ viewport: { width: w, height: hgt } })
      const errors = []; page.on('pageerror', e => errors.push(String(e)))
      const puts = []; await route(page, puts)
      await page.goto(`${base}/admin?tab=countries`)
      await page.waitForSelector('[data-country-row="FR"]', { timeout: 20000 })
      await page.waitForTimeout(400)
      await page.screenshot({ path: path.join(OUT, `countries-${tag}-top.png`) })

      const m = await page.evaluate(() => {
        const body = document.querySelector('[data-countries-page]').closest('.w-full')
        const cs = getComputedStyle(body)
        const tabRow = document.querySelector('.sticky.top-\\[51px\\] > div')
        return {
          sideways: document.documentElement.scrollWidth > window.innerWidth,
          rows: document.querySelectorAll('[data-country-row]').length,
          padL: cs.paddingLeft, padR: cs.paddingRight, bodyW: body.getBoundingClientRect().width, vw: window.innerWidth,
          tabPad: tabRow && getComputedStyle(tabRow).paddingLeft, tabW: tabRow && tabRow.getBoundingClientRect().width,
          headerInner: (() => { const hd = document.querySelector('header > div > div'); return hd && hd.getBoundingClientRect().width })(),
        }
      })
      t(`${tag}: no page errors`, errors.length === 0, errors.slice(0, 3))
      t(`${tag}: the page never scrolls sideways`, !m.sideways)
      t(`${tag}: all 36 rows are in the table`, m.rows === 36, m.rows)
      t(`${tag}: the admin body is full width with 32px side padding; the tab row and the header too`, m.padL === '32px' && m.padR === '32px' && Math.abs(m.bodyW - m.vw) < 2
        && m.tabPad === '32px' && Math.abs(m.tabW - m.vw) < 2 && Math.abs(m.headerInner - (m.vw - 64)) < 2, m)

      // ── every row, by scrolling the box ──
      const seen = new Set()
      for (let n = 1; n < 20; n++) {
        const vis = await page.evaluate(() => {
          const box = document.querySelector('[data-countries-grid]'); const b = box.getBoundingClientRect()
          const headH = box.querySelector('thead').getBoundingClientRect().height
          return [...box.querySelectorAll('[data-country-row]')].filter(tr => { const r = tr.getBoundingClientRect(); return r.top >= b.top + headH - 1 && r.bottom <= b.bottom + 1 }).map(tr => tr.dataset.countryRow)
        })
        vis.forEach(c => seen.add(c))
        await page.screenshot({ path: path.join(OUT, `countries-${tag}-rows-${n}.png`) })
        const done = await page.evaluate(() => { const box = document.querySelector('[data-countries-grid]'); const end = box.scrollTop + box.clientHeight >= box.scrollHeight - 1; box.scrollTop += box.clientHeight - box.querySelector('thead').getBoundingClientRect().height - 40; return end })
        if (done) break
        await page.waitForTimeout(150)
      }
      t(`${tag}: scrolling the box shows every one of the 36 rows`, seen.size === 36, [...seen])

      // ── frozen column and header ──
      const frozen = await page.evaluate(() => {
        const box = document.querySelector('[data-countries-grid]')
        box.scrollTop = 0; box.scrollLeft = 0
        const corner = box.querySelector('[data-countries-corner]'), cell = box.querySelector('[data-country-head="DE"]'), th = box.querySelector('th[data-col="Currency"]')
        const b0 = { corner: corner.getBoundingClientRect(), cellLeft: cell.getBoundingClientRect().left, thTop: th.getBoundingClientRect().top }
        box.scrollTop = 700; box.scrollLeft = 1400
        const b1 = { corner: corner.getBoundingClientRect(), cellLeft: cell.getBoundingClientRect().left, thTop: th.getBoundingClientRect().top }
        return { moved: box.scrollTop > 0 && box.scrollLeft > 0, corner: Math.abs(b0.corner.left - b1.corner.left) + Math.abs(b0.corner.top - b1.corner.top),
          cell: Math.abs(b0.cellLeft - b1.cellLeft), th: Math.abs(b0.thTop - b1.thTop), sl: box.scrollLeft, st: box.scrollTop }
      })
      t(`${tag}: scrolled right and down, the Country column and both header rows stay put`, frozen.moved && frozen.corner < 1 && frozen.cell < 1 && frozen.th < 1, frozen)
      await page.waitForTimeout(150)
      await page.screenshot({ path: path.join(OUT, `countries-${tag}-frozen.png`) })

      // ── an ⓘ, tapped open ──
      await page.evaluate(() => { const box = document.querySelector('[data-countries-grid]'); box.scrollTop = 0; box.scrollLeft = 0 })
      await page.waitForTimeout(150)
      await page.getByRole('button', { name: 'About Take our fee' }).click()
      const pop = await page.evaluate(() => { const p = document.querySelector('[data-info-pop]'); return p && { text: p.textContent, r: p.getBoundingClientRect().toJSON(), vw: innerWidth } })
      t(`${tag}: the ⓘ popover opens with the column's help, inside the window`, !!pop && pop.text.includes("each plan's fee is shown on plans but never charged") && pop.text.includes('Not charged yet') && pop.r.right <= pop.vw && pop.r.left >= 0, pop)
      await page.screenshot({ path: path.join(OUT, `countries-${tag}-info-popover.png`) })
      await page.keyboard.press('Escape')
      t(`${tag}: Escape closes it`, await page.evaluate(() => !document.querySelector('[data-info-pop]')))

      // ── Ireland changed ──
      await page.locator('[data-country-row="IE"]').getByRole('switch', { name: 'Take our fee, IE' }).click()
      await page.locator('[data-country-row="IE"]').getByLabel('supportHours for IE').fill('Mon–Fri 9am–5pm')
      const dirty = await page.evaluate(() => ({
        dirty: [...document.querySelectorAll('[data-country-row][data-dirty]')].map(r => r.dataset.countryRow),
        saves: [...document.querySelectorAll('[data-country-head]')].filter(c => [...c.querySelectorAll('button')].some(b => b.textContent.trim() === 'Save')).map(c => c.dataset.countryHead),
        bg: getComputedStyle(document.querySelector('[data-country-row="IE"]')).backgroundColor,
      }))
      t(`${tag}: only Ireland is highlighted and only Ireland has a Save button`, dirty.dirty.join() === 'IE' && dirty.saves.join() === 'IE' && dirty.bg !== 'rgb(255, 255, 255)', dirty)
      await page.locator('[data-country-row="IE"]').scrollIntoViewIfNeeded()
      await page.screenshot({ path: path.join(OUT, `countries-${tag}-ireland-changed.png`) })
      await page.locator('[data-country-head="IE"]').getByRole('button', { name: 'Save', exact: true }).click()
      await page.waitForTimeout(300)
      t(`${tag}: saving Ireland sends one PUT, for Ireland alone`, puts.length === 1 && puts[0].code === 'IE' && puts[0].form.supportHours === 'Mon–Fri 9am–5pm' && puts[0].form.platformFeeEnabled === true, puts.map(p => p.code))
      t(`${tag}: …and no other row changes`, await page.evaluate(() => [...document.querySelectorAll('[data-country-row][data-dirty]')].length === 0))

      // ── search and chips ──
      await page.getByLabel('Search countries').fill('lux')
      t(`${tag}: search "lux" leaves Luxembourg`, await page.evaluate(() => [...document.querySelectorAll('[data-country-row]')].map(r => r.dataset.countryRow).join() === 'LU'))
      await page.getByLabel('Search countries').fill('')
      await page.getByRole('button', { name: /^Switched off/ }).click()
      t(`${tag}: "Switched off" leaves France`, await page.evaluate(() => [...document.querySelectorAll('[data-country-row]')].map(r => r.dataset.countryRow).join() === 'FR'))
      await page.getByRole('button', { name: /^Needs attention/ }).click()
      t(`${tag}: "Needs attention" leaves the 14 English short names`, await page.evaluate(() => document.querySelectorAll('[data-country-row]').length === 14))
      await page.getByRole('button', { name: /^All/ }).click()

      // ── two other admin tabs ──
      for (const tab of ['Trucks', 'Domains']) {
        await page.getByRole('button', { name: new RegExp(tab) }).first().click()
        await page.waitForTimeout(400)
        const w2 = await page.evaluate(() => {
          const body = [...document.querySelectorAll('div.w-full')].find(d => /px-8/.test(d.className) && /py-6/.test(d.className) && d.offsetParent)
          return body && { w: body.getBoundingClientRect().width, pad: getComputedStyle(body).paddingLeft, vw: innerWidth, sideways: document.documentElement.scrollWidth > innerWidth }
        })
        t(`${tag}: ${tab} is full width with 32px side padding`, !!w2 && Math.abs(w2.w - w2.vw) < 2 && w2.pad === '32px' && !w2.sideways, w2)
        await page.screenshot({ path: path.join(OUT, `${tab.toLowerCase()}-${tag}.png`) })
      }
      await page.close()
    }
  } finally { await browser.close(); server.close() }

  for (const n of ok) console.log('  ✓ ' + n)
  for (const n of bad) console.log('  ✗ ' + n)
  console.log(bad.length ? `\n🔴 ${bad.length} CHECK(S) FAILED` : `\n✅ admin-countries-1-screens: all ${ok.length} passed — screenshots in docs/admin-countries-1/`)
  process.exit(bad.length ? 1 : 0)
})().catch(e => { console.error('🔴', e && e.stack || e); process.exit(1) })
