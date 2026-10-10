#!/usr/bin/env node
// scripts/schedules-country-screenshots.cjs — Admin › Screenshots' country picker and "Check country" row,
// in a real browser (Phase 2D-2 Part A, docs/schedules-country-report.md).
//   node scripts/schedules-country-screenshots.cjs      (needs `npx next build` for the app CSS, and local Chromium)
//
// The REAL components/admin/ScreenshotsPanel.tsx is bundled for a browser and mounted on a tiny local page.
// Its two requests (GET the log and the country list; POST a file or a decision) are answered by Playwright
// with fixtures — Gemini is never involved: the POST answer stands in for what the route returns. Every
// request the panel makes is recorded, so the proofs are about what it SENDS. The page clock is Playwright's
// fake clock, so the 30-minute reset is run, not waited for.
//
// Writes, at 1440×900, into docs/screenshots/:
//   schedules-country-1440-picker-before.png   the picker before a country is chosen (drop zone closed)
//   schedules-country-1440-picker-after.png    after choosing the United Kingdom
//   schedules-country-1440-held-row.png        a "Check country" row, with the chips
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http')
const REPO = path.resolve(__dirname, '..')
const OUT = path.join(REPO, 'docs/screenshots')
fs.mkdirSync(OUT, { recursive: true })
const kit = require('./_render-kit.cjs')({ cacheTag: 'schedules-country-shots' })

let failures = 0, checks = 0
const t = (name, cond, detail) => { checks++; if (cond) return; failures++; console.log(`  ✗ ${name}${detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }

function appCss() {
  const root = path.join(REPO, '.next/static')
  if (!fs.existsSync(root)) throw new Error('no .next/static — run `npx next build` first')
  const files = []
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.name.endsWith('.css')) files.push(f) } }
  walk(root)
  const css = files.map(f => fs.readFileSync(f, 'utf8')).join('\n')
  if (!css.includes('border-\\[\\#d97706\\]')) throw new Error('the compiled CSS predates Phase 2D-2 — run `npx next build`')
  return css
}

const STUBS = {
  'next/navigation': "export const useRouter = () => ({ push(){}, replace(){}, refresh(){}, back(){}, prefetch(){} }); export const usePathname = () => '/admin'; export const useSearchParams = () => new URLSearchParams(location.search); export const useParams = () => ({}); export const notFound = () => {}; export const redirect = () => {}",
  'next/link': "import React from 'react'; export default function Link(p) { const { href, children, prefetch, replace, scroll, ...rest } = p; return React.createElement('a', { href: typeof href === 'string' ? href : '#', ...rest }, children) }",
  'next/image': "import React from 'react'; export default function Image(p) { const { src, alt, fill, priority, ...rest } = p; return React.createElement('img', { src: typeof src === 'string' ? src : '', alt, ...rest }) }",
}
async function bundle(dir) {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const entry = path.join(dir, 'entry.tsx')
  fs.writeFileSync(entry, `import { createRoot } from 'react-dom/client'\nimport ScreenshotsPanel from '@/components/admin/ScreenshotsPanel'\ncreateRoot(document.getElementById('root')!).render(<div style={{ padding: 32 }}><h2 style={{ fontWeight: 800, fontSize: 20, marginBottom: 12 }}>Screenshots</h2><ScreenshotsPanel /></div>)\n`)
  await esbuild.build({
    entryPoints: [entry], bundle: true, outfile: path.join(dir, 'bundle.js'), format: 'iife', platform: 'browser',
    jsx: 'automatic', target: 'es2020', logLevel: 'error', alias: { '@': REPO }, nodePaths: [path.join(REPO, 'node_modules')],
    banner: { js: 'window.process = window.process || { env: {} };' },
    loader: { '.svg': 'text', '.png': 'empty' },
    define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_SUPABASE_URL': '"http://127.0.0.1:9"', 'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': '"harness"' },
    plugins: [{ name: 'stubs', setup(b) {
      b.onResolve({ filter: /^next\/(navigation|link|image)$/ }, a => ({ path: a.path, namespace: 'stub' }))
      b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: STUBS[a.path], loader: 'js', resolveDir: REPO }))
    } }],
  })
  return fs.readFileSync(path.join(dir, 'bundle.js'), 'utf8')
}

const AUSTIN = [
  { event_date: '12/10/2026', start_time: '17:00', end_time: '21:00', truck_name: 'Austin Eats', venue_name: 'Zilker Park', village: 'Austin', postcode: '78746', state: 'TX' },
  { event_date: '13/10/2026', start_time: '11:00', end_time: '14:00', truck_name: 'Austin Eats', venue_name: 'Rainey Street', village: 'Austin', postcode: '', state: 'TX' },
  { event_date: '14/10/2026', start_time: '17:00', end_time: '20:00', truck_name: 'Austin Eats', venue_name: 'South Congress', village: 'Austin', postcode: '', state: 'TX' },
  { event_date: '15/10/2026', start_time: '12:00', end_time: '14:00', truck_name: 'Austin Eats', venue_name: 'Domain Northside', village: 'Austin', postcode: '', state: 'TX' },
  { event_date: '17/10/2026', start_time: '18:00', end_time: '22:00', truck_name: 'Austin Eats', venue_name: 'East 6th', village: 'Austin', postcode: '', state: 'TX' },
]
const result = (fileName, over = {}) => ({ fileName, kind: 'schedule', outcome: 'schedule', summary: '3 events added', extracted: 3, kept: 3, dropped: [], written: 3, bridged: 0,
  prospectId: null, truckId: null, candidates: null, details: null, error: null, warnings: [], ...over })
const heldResult = fileName => result(fileName, { outcome: 'held_country', summary: 'Looks like United States, not United Kingdom — nothing added yet', extracted: 5, kept: 0, written: 0,
  held: { chosen: 'GB', chosenName: 'United Kingdom', detected: 'US', detectedName: 'United States', detectedKnown: true, confidence: 'high',
    reasons: 'prices in $, "Austin, TX", dates written 10/12', events: AUSTIN } })
const LOG = [
  ['schedule', 'pizzeria-gusto-week.png', '4 events added'], ['schedule', 'real-thai-oct.png', '2 events added'], ['schedule', 'burger-bros.jpg', '3 events added'],
  ['held_country', 'austin-eats.png', 'Looks like United States, not United Kingdom — nothing added yet'], ['needs_a_look', 'fb-page.png', 'Name is close to "Burger Bros" but nothing else matches'],
  ['nothing_new', 'quiz.png', 'Not a schedule or a contact-details screenshot — nothing to do'],
].map(([outcome, file_name, summary], i) => ({ id: `log-${i}`, created_at: `2026-10-12T1${i}:0${i}:00.000Z`, file_name, file_size: 1000, kind: 'schedule', outcome, summary, prospect_id: null, truck_id: null, events_written: 0, error: null, alerted_at: null }))

;(async () => {
  const css = appCss()
  const js = await bundle(fs.mkdtempSync(path.join(os.tmpdir(), 'hg-sc-panel-')))
  const flags = await kit.bundle('flags', `export { flagDataUri } from '@/lib/flags'`)
  const COUNTRIES = [{ code: 'GB', name: 'United Kingdom', flag: flags.flagDataUri('GB') }, { code: 'US', name: 'United States', flag: flags.flagDataUri('US') }]
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body style="background:#f8fafc"><div id="root"></div><script src="/bundle.js"></script></body></html>`
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/bundle.js')) { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(js) }
    res.writeHead(200, { 'content-type': 'text/html' }); res.end(html)
  })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}`
  const { chromium } = require('playwright')
  const browser = await chromium.launch()
  const sent = []
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  const file = name => ({ name, mimeType: 'image/png', buffer: png })
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    const errors = []; page.on('pageerror', e => errors.push(String(e)))
    await page.clock.install({ time: new Date('2026-10-12T15:12:00+01:00') })
    await page.route('**/api/admin/screenshot-events', async route => {
      const req = route.request()
      if (req.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, hasLog: true, hasSocial: true, rows: LOG, countries: COUNTRIES, migrationNotes: [] }) })
      const ct = req.headers()['content-type'] || ''
      if (ct.includes('application/json')) {
        const body = JSON.parse(req.postData() || '{}')
        sent.push({ kind: 'decision', ...body })
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, outcome: 'schedule', summary: `${body.events?.length ?? 0} events added · as ${body.country === 'US' ? 'United States' : 'United Kingdom'}`, dropped: [] }) })
      }
      const raw = (req.postDataBuffer() || Buffer.alloc(0)).toString('latin1')
      const fileName = (/filename="([^"]+)"/.exec(raw) || [])[1] || '?'
      const country = (/name="country"\r\n\r\n([A-Z]{2})/.exec(raw) || [])[1] || null
      sent.push({ kind: 'upload', fileName, country })
      if (/slow/.test(fileName)) await new Promise(r => setTimeout(r, 800))
      const r = /held/.test(fileName) ? heldResult(fileName) : result(fileName)
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, results: [r], paused: false, banner: null, hasLog: true, hasSocial: true, migrationNotes: [] }) })
    })
    await page.goto(base)
    await page.waitForSelector('[data-country-picker]')
    await page.waitForTimeout(150)

    // ── 1. before a country is chosen ──
    const before = await page.evaluate(() => {
      const zone = document.querySelector('[data-drop-zone]'), btn = document.querySelector('[data-country-picker] button')
      const bs = getComputedStyle(btn), zs = getComputedStyle(zone)
      return { zone: zone.getAttribute('data-drop-zone'), zoneText: zone.innerText, btnText: btn.innerText, border: bs.borderTopColor, bw: bs.borderTopWidth, bg: bs.backgroundColor,
        hint: document.querySelector('[data-country-picker]').innerText, inputDisabled: zone.querySelector('input').disabled, zoneBorder: zs.borderTopStyle, zoneBg: zs.backgroundColor,
        intro: document.body.innerText.includes('Drop, paste or pick screenshots'), hasIcon: !!zone.querySelector('svg') }
    })
    t('before: the drop zone is closed and says "Choose a country first" / "Then drop, paste or pick screenshots here"', before.zone === 'closed' && /Choose a country first/.test(before.zoneText) && /Then drop, paste or pick screenshots here/.test(before.zoneText) && before.hasIcon && before.zoneBorder === 'dashed', before)
    t('before: the button reads "Choose a country", amber — 2px #d97706 border on #fffbeb', /Choose a country/.test(before.btnText) && before.border === 'rgb(217, 119, 6)' && before.bw === '2px' && before.bg === 'rgb(255, 251, 235)', before)
    t('before: "These screenshots are from" and the amber "Choose before uploading. It resets after 30 minutes without an upload."', /These screenshots are from/.test(before.hint) && /Choose before uploading\. It resets after 30 minutes without an upload\./.test(before.hint), before.hint)
    t('before: the file input is disabled', before.inputDisabled)
    await page.evaluate(async ({ b64 }) => {
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
      const f = new File([bytes], 'dropped.png', { type: 'image/png' })
      const dt = new DataTransfer(); dt.items.add(f)
      const zone = document.querySelector('[data-drop-zone]')
      zone.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
      const ev = new Event('paste', { bubbles: true, cancelable: true }); Object.defineProperty(ev, 'clipboardData', { value: dt }); window.dispatchEvent(ev)
    }, { b64: png.toString('base64') })
    await page.waitForTimeout(200)
    t('before: a drop and a paste are both refused — nothing is sent', sent.length === 0, sent)
    await page.mouse.move(1400, 880); await page.waitForTimeout(80)
    await page.screenshot({ path: path.join(OUT, 'schedules-country-1440-picker-before.png') })

    // ── 2. choose the United Kingdom ──
    await page.click('[data-country-picker] button')
    const opts = await page.$$eval('[data-country-picker] [role="option"]', els => els.map(e => ({ text: e.innerText.trim(), flag: !!e.querySelector('img') })))
    t('the list shows every country we have, with flags (switched on or not)', opts.map(o => o.text).join('|') === 'United Kingdom|United States' && opts.every(o => o.flag), opts)
    await page.click('[data-country-picker] [role="option"]:has-text("United Kingdom") button')
    await page.waitForTimeout(100)
    const after = await page.evaluate(() => {
      const zone = document.querySelector('[data-drop-zone]'), btn = document.querySelector('[data-country-picker] button'), bs = getComputedStyle(btn)
      return { zone: zone.getAttribute('data-drop-zone'), zoneText: zone.innerText, strong: zone.querySelector('strong')?.innerText, btnText: btn.innerText, flag: !!btn.querySelector('img'), border: bs.borderTopColor, bw: bs.borderTopWidth,
        hint: document.querySelector('[data-country-picker]').innerText, stored: sessionStorage.getItem('hg_screenshot_country') }
    })
    t('after: the button shows the flag and "United Kingdom" with a neutral border', after.flag && /United Kingdom/.test(after.btnText) && after.bw === '1px' && after.border !== 'rgb(217, 119, 6)', after)
    t('after: "Resets at 15:42 unless you upload again." — 30 minutes on, in UK time', /Resets at 15:42 unless you upload again\./.test(after.hint), after.hint)
    t('after: the drop zone is open — "Drop, paste or pick screenshots from the United Kingdom", the country in bold', after.zone === 'open' && /Drop, paste or pick screenshots from the United Kingdom/.test(after.zoneText) && after.strong === 'the United Kingdom', after)
    t('the choice is kept in sessionStorage', /"code":"GB"/.test(after.stored || ''), after.stored)
    await page.mouse.move(1400, 880); await page.waitForTimeout(80)
    await page.screenshot({ path: path.join(OUT, 'schedules-country-1440-picker-after.png') })

    // ── 3. it survives a reload (the panel unmounts on a tab switch) ──
    await page.reload(); await page.waitForSelector('[data-country-picker]'); await page.waitForTimeout(150)
    t('a reload keeps the United Kingdom', /United Kingdom/.test(await page.innerText('[data-country-picker] button')) && (await page.getAttribute('[data-drop-zone]', 'data-drop-zone')) === 'open')

    // ── 4. each item keeps the country it was queued with ──
    await page.setInputFiles('[data-drop-zone] input', [file('slow-a.png'), file('b.png')])
    await page.click('[data-country-picker] button')
    await page.click('[data-country-picker] [role="option"]:has-text("United States") button')
    await page.setInputFiles('[data-drop-zone] input', [file('c.png')])
    await page.waitForFunction(() => document.querySelectorAll('[data-outcome]').length >= 3, null, { timeout: 15000 })
    const ups = sent.filter(s => s.kind === 'upload').map(s => `${s.fileName}:${s.country}`)
    t('a file keeps the country it was queued with: two queued as UK stay UK after the picker moves to US; the next is US', ups.join(',') === 'slow-a.png:GB,b.png:GB,c.png:US', ups)

    // ── 5. the 30-minute reset ──
    await page.clock.fastForward('20:00')
    t('20 minutes after the last upload: still chosen', (await page.getAttribute('[data-drop-zone]', 'data-drop-zone')) === 'open')
    await page.clock.fastForward('10:30')
    await page.waitForTimeout(100)
    const reset = await page.evaluate(() => ({ zone: document.querySelector('[data-drop-zone]').getAttribute('data-drop-zone'), btn: document.querySelector('[data-country-picker] button').innerText, stored: sessionStorage.getItem('hg_screenshot_country') }))
    t('30 minutes without an upload, decision or change: reset — the picker is required again and storage is cleared', reset.zone === 'closed' && /Choose a country/.test(reset.btn) && reset.stored === null, reset)

    // ── 6. a held row ──
    await page.evaluate(() => { document.querySelectorAll('[aria-label^="Remove "]').forEach(b => b.click()) })
    await page.click('[data-country-picker] button')
    await page.click('[data-country-picker] [role="option"]:has-text("United Kingdom") button')
    await page.setInputFiles('[data-drop-zone] input', [file('held-austin.png')])
    await page.waitForSelector('[data-outcome="held_country"] [data-held]', { timeout: 15000 })
    const held = await page.evaluate(() => {
      const row = document.querySelector('[data-outcome="held_country"]'), s = getComputedStyle(row)
      const chip = [...row.querySelectorAll('span')].find(x => x.innerText.trim() === 'Check country')
      return { text: row.innerText, border: s.borderTopColor, bw: s.borderTopWidth, bg: s.backgroundColor, chip: !!chip, chipBg: chip ? getComputedStyle(chip).backgroundColor : null,
        buttons: [...row.querySelectorAll('button')].map(b => b.innerText.trim()).filter(x => x && x !== '✕'),
        chips: [...document.querySelectorAll('button.rounded-full')].map(b => b.innerText.trim()) }
    })
    t('held row: 2px amber border on pale amber', held.border === 'rgb(217, 119, 6)' && held.bw === '2px' && held.bg === 'rgb(255, 251, 235)', held)
    t('held row: the truck name, an amber "Check country" chip and the file name', /Austin Eats/.test(held.text) && held.chip && /held-austin\.png/.test(held.text), held.text)
    t('held row: "This looks like the United States, not the United Kingdom: prices in $, "Austin, TX", dates written 10/12. Nothing has been added yet."', held.text.includes('This looks like the United States, not the United Kingdom: prices in $, "Austin, TX", dates written 10/12. Nothing has been added yet.'), held.text)
    t('held row: "5 events found:" and the first few', /5 events found:/.test(held.text) && /Zilker Park, Austin, TX/.test(held.text) && /and 2 more/.test(held.text), held.text)
    t('held row: "Add as United States", "Keep as United Kingdom", "Dismiss"', held.buttons.join('|') === 'Add as United States|Keep as United Kingdom|Dismiss', held.buttons)
    t('the chips: All 6 · Schedule 3 · Check country 1 · Needs a look 1 · Nothing new 1', ['All 6', 'Schedule 3', 'Check country 1', 'Needs a look 1', 'Nothing new 1'].every(c => held.chips.includes(c)) && held.chips.indexOf('Check country 1') === held.chips.indexOf('Schedule 3') + 1, held.chips)
    const before6 = sent.length
    t('nothing was sent for the held screenshot beyond the upload itself', sent.length === before6 && !sent.some(s => s.kind === 'decision'))
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    t('no sideways scroll at 1440', !sideways)
    await page.mouse.move(1400, 880); await page.waitForTimeout(80)
    await page.screenshot({ path: path.join(OUT, 'schedules-country-1440-held-row.png'), fullPage: true })

    // ── 7. Add / Keep / Dismiss ──
    await page.click('button:has-text("Add as United States")')
    await page.waitForTimeout(200)
    let dec = sent.filter(s => s.kind === 'decision')
    t('"Add as United States" re-submits the five events with country US', dec.length === 1 && dec[0].action === 'country_confirm' && dec[0].country === 'US' && dec[0].events.length === 5, dec)
    await page.setInputFiles('[data-drop-zone] input', [file('held-2.png')])
    await page.waitForSelector('[data-outcome="held_country"] [data-held]', { timeout: 15000 })
    await page.click('button:has-text("Keep as United Kingdom")')
    await page.waitForTimeout(200)
    dec = sent.filter(s => s.kind === 'decision')
    t('"Keep as United Kingdom" re-submits them with country GB', dec.length === 2 && dec[1].country === 'GB', dec.map(d => d.country))
    await page.setInputFiles('[data-drop-zone] input', [file('held-3.png')])
    await page.waitForSelector('[data-outcome="held_country"] [data-held]', { timeout: 15000 })
    await page.click('button:has-text("Dismiss")')
    await page.waitForTimeout(200)
    t('"Dismiss" sends nothing at all', sent.filter(s => s.kind === 'decision').length === 2)
    t('no page errors', errors.length === 0, errors)
  } finally { await browser.close(); server.close() }

  console.log(`\n${failures ? '🔴' : '✅'} schedules-country-screenshots: ${checks - failures}/${checks} checks passed`)
  if (failures) process.exit(1)
})().catch(e => { console.error('🔴', e && e.stack || e); process.exit(1) })
