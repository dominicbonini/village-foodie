#!/usr/bin/env node
// scripts/address-formats-2-screens.cjs — the screenshots of address-formats-2 (docs/address-formats-2-report.md).
//   node scripts/address-formats-2-screens.cjs      (needs `npx next build` for the app CSS, and Playwright)
//
// Like scripts/allergen-card-country-screens.cjs: the REAL components are bundled for a browser with esbuild and served
// from a tiny local server; nothing reaches a database or the network. Not a registered harness: it photographs;
// scripts/address-formats-2.cjs proves. Each page is the address section of Manage › Schedule › Add event —
// components/manage/AddressFields.tsx, in the form's own two-column grid — under the country's providers, with the
// truck's format; then the Places editor for the same country. The script TYPES into it as an operator would:
//   IE  "d02x963" into Eircode, then leaves the box → "D02 X963"; Co. Kerry chosen
//   AU  "NSW" chosen in the State dropdown (the box that used to cut it to "NS")
//   NZ  a suburb and a town; CA a province
// Writes docs/address-formats-2/<cc>-form-<w>[-chromium].png and <cc>-places-<w>[-chromium].png, for ie/au/nz/ca and,
// for comparison, gb/us — at 390 and 1280, in WebKit and Chromium.
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http')
const REPO = path.resolve(__dirname, '..')
const { gbFromSeed, usFromSeed } = require('./_country-settings-gb.cjs')
const OUT = path.join(REPO, 'docs/address-formats-2')
fs.mkdirSync(OUT, { recursive: true })

function appCss() {
  const root = path.join(REPO, '.next/static')
  if (!fs.existsSync(root)) throw new Error('no .next/static — run `npx next build` first')
  const files = []
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.name.endsWith('.css')) files.push(f) } }
  walk(root)
  return files.map(f => fs.readFileSync(f, 'utf8')).join('\n')
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
    define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_SUPABASE_URL': '"http://127.0.0.1:9"', 'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': '"harness"' },
  })
  return fs.readFileSync(path.join(dir, 'bundle.js'), 'utf8')
}

function serve(css, js) {
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/bundle.js')) { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(js) }
    const q = new URL(req.url, 'http://x').searchParams
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}</style></head><body class="bg-slate-50"><script id="settings" type="application/json">${JSON.stringify(SETTINGS[q.get('cc')] ?? null)}</script><script id="view" type="application/json">${JSON.stringify(q.get('view'))}</script><div id="root"></div><script src="/bundle.js"></script></body></html>`
    res.writeHead(200, { 'content-type': 'text/html' }); res.end(html)
  })
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)))
}

const ENTRY = `import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nContext } from '@/lib/i18n/use-t'
import { CountrySettingsProvider } from '@/components/CountrySettingsProvider'
import { EventAddressFields, useAddressFormat } from '@/components/manage/AddressFields'
import { PlaceDetail } from '@/components/manage/SchedulePlaces'
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/manageScheduleEvent'
const settings = JSON.parse(document.getElementById('settings').textContent)
const view = JSON.parse(document.getElementById('view').textContent)
function Form() {
  const format = useAddressFormat()
  const tE = translatorFor(settings.locale, 'manageScheduleEvent')
  const [v, setV] = useState({ address: '', town: '', suburb: '', region: '', postcode: '' })
  const [venue, setVenue] = useState('')
  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <p className="text-base font-bold text-slate-800 mb-3">{settings.name} — {tE('addressDetails')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-slate-600 mb-1">{tE('venueName')} <span className="text-red-400">*</span></label>
            <input data-venue value={venue} onChange={e => setVenue(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-sm text-slate-900 bg-white border-slate-200" />
          </div>
          <EventAddressFields format={format} venueName={venue} addressLabel={tE('address')} value={v} onChange={p => setV(o => ({ ...o, ...p }))} />
        </div>
      </div>
    </div>)
}
function Places() {
  const place = { id: 'p1', name: settings.place.name, short_name: null, address: null, area: settings.place.area, postcode: settings.place.postcode, region: settings.place.region ?? null, suburb: settings.place.suburb ?? null, is_favourite: false, is_hidden: false }
  return <div className="max-w-2xl mx-auto p-4"><PlaceDetail place={place} api={async () => ({})} showToast={() => {}} onChanged={() => {}} /></div>
}
createRoot(document.getElementById('root')).render(
  <I18nContext.Provider value={{ locale: settings.locale, setLocale() {} }}>
    <CountrySettingsProvider settings={settings}>{view === 'places' ? <Places /> : <Form />}</CountrySettingsProvider>
  </I18nContext.Provider>)
`

const stamp = { updatedAt: '2026-10-21T08:12:00.000000+00:00', updatedBy: 'migration' }
const SETTINGS = {
  gb: { ...gbFromSeed(), ...stamp, addressFormat: 'gb', place: { name: 'The Bell', area: 'Castle Hedingham', postcode: 'CO9 3EJ' } },
  us: { ...usFromSeed(), ...stamp, addressFormat: 'us', enabled: true, place: { name: 'Pier A Park', area: 'Hoboken', postcode: '07030' } },
  ie: { ...gbFromSeed(), ...stamp, countryCode: 'IE', name: 'Ireland', shortName: 'Ireland', currency: 'EUR', locale: 'en-IE', addressFormat: 'ie', place: { name: 'Market Square', area: 'Listowel', postcode: 'V31 X2T6', region: 'KY' } },
  au: { ...gbFromSeed(), ...stamp, countryCode: 'AU', name: 'Australia', shortName: 'Australia', currency: 'AUD', locale: 'en-AU', addressFormat: 'au', place: { name: 'Bondi Pavilion', area: 'Bondi Beach', postcode: '2026', region: 'NSW' } },
  nz: { ...gbFromSeed(), ...stamp, countryCode: 'NZ', name: 'New Zealand', shortName: 'NZ', currency: 'NZD', locale: 'en-NZ', addressFormat: 'nz', place: { name: 'Western Park', area: 'Auckland', postcode: '1011', suburb: 'Ponsonby' } },
  ca: { ...gbFromSeed(), ...stamp, countryCode: 'CA', name: 'Canada', shortName: 'Canada', currency: 'CAD', locale: 'en-GB', addressFormat: 'ca', place: { name: 'Trinity Bellwoods Park', area: 'Toronto', postcode: 'M6J 1A1', region: 'ON' } },
}

// What the operator types, by country: [label, value] into the input under that label, or [label, value, 'select'].
const TYPING = {
  gb: [['Venue name', 'The Bell'], ['Area (village, town or city)', 'Castle Hedingham'], ['Postcode', 'CO9 3EJ']],
  us: [['Venue name', 'Pier A Park'], ['City or town', 'Hoboken'], ['State', 'nj'], ['ZIP code', '07030']],
  ie: [['Venue name', 'Market Square'], ['Town or area', 'Listowel'], ['County', 'KY', 'select'], ['Eircode', 'd02x963']],
  au: [['Venue name', 'Bondi Pavilion'], ['Suburb', 'Bondi Beach'], ['State or territory', 'NSW', 'select'], ['Postcode', '2026']],
  nz: [['Venue name', 'Western Park'], ['Suburb', 'Ponsonby'], ['Town or city', 'Auckland'], ['Postcode', '1011']],
  ca: [['Venue name', 'Trinity Bellwoods Park'], ['City', 'Toronto'], ['Province', 'ON', 'select'], ['Postal code', 'm6j1a1']],
}

;(async () => {
  const css = appCss()
  const js = await bundle(fs.mkdtempSync(path.join(os.tmpdir(), 'hg-af2-')), ENTRY)
  const server = await serve(css, js)
  const base = `http://127.0.0.1:${server.address().port}`
  const { chromium, webkit } = require('playwright')
  const shots = []
  for (const [engine, launcher] of [['webkit', webkit], ['chromium', chromium]]) {
    const browser = await launcher.launch()
    for (const cc of Object.keys(SETTINGS)) for (const [w, h] of [[390, 844], [1280, 800]]) {
      // ── the Add event form, typed into ──────────────────────────────────────────────────────────────────────
      const page = await browser.newPage({ viewport: { width: w, height: h } })
      const errors = []; page.on('pageerror', e => errors.push(String(e)))
      await page.goto(`${base}/?cc=${cc}&view=form`)
      await page.waitForSelector('[data-venue]', { timeout: 20000 })
      for (const [label, value, kind] of TYPING[cc]) {
        const box = label === 'Venue name' ? page.locator('[data-venue]')
          : page.locator(`label:text-is("${label}"), label:text-is("${label}*")`).first().locator('xpath=..').locator(kind === 'select' ? 'select' : 'input')
        if (kind === 'select') await box.selectOption(value)
        else { await box.fill(value); await box.blur() }
      }
      await page.waitForTimeout(200)
      const seen = await page.evaluate(() => ({
        text: document.body.innerText,
        values: [...document.querySelectorAll('input, select')].map(e => e.value),
        heights: [...document.querySelectorAll('input, select')].map(e => `${e.tagName[0]}${Math.round(e.getBoundingClientRect().height)}@${Math.round(e.getBoundingClientRect().top)}`),
      }))
      const file = `${cc}-form-${w}${engine === 'chromium' ? '-chromium' : ''}.png`
      await page.screenshot({ path: path.join(OUT, file), fullPage: true })
      shots.push({ file, errors: errors.length, values: seen.values, heights: seen.heights, customersSee: (seen.text.match(/Customers see:.*/) || [null])[0] })
      await page.close()
      // ── the Places editor ───────────────────────────────────────────────────────────────────────────────────
      const p2 = await browser.newPage({ viewport: { width: w, height: h } })
      const e2 = []; p2.on('pageerror', e => e2.push(String(e)))
      await p2.goto(`${base}/?cc=${cc}&view=places`)
      await p2.waitForSelector('input', { timeout: 20000 })
      await p2.waitForTimeout(200)
      const pfile = `${cc}-places-${w}${engine === 'chromium' ? '-chromium' : ''}.png`
      await p2.screenshot({ path: path.join(OUT, pfile), fullPage: true })
      shots.push({ file: pfile, errors: e2.length })
      await p2.close()
    }
    await browser.close()
  }
  server.close()
  console.log(JSON.stringify(shots, null, 1))
  const form = (cc, w = 390) => shots.find(s => s.file === `${cc}-form-${w}.png`)
  const bad = shots.filter(s => s.errors)
  if (!form('ie').values.includes('D02 X963')) bad.push({ why: 'IE: d02x963 was not tidied to D02 X963', ...form('ie') })
  if (!form('au').values.includes('NSW')) bad.push({ why: 'AU: NSW not kept', ...form('au') })
  if (form('gb').customersSee || form('us').customersSee) bad.push({ why: 'GB/US show "Customers see:"' })
  if (!form('us').values.includes('NJ')) bad.push({ why: 'US: the State box did not upper-case "nj"', ...form('us') })
  if (bad.length) { console.error('🔴 unexpected:', JSON.stringify(bad)); process.exit(1) }
  console.log(`✅ ${shots.length} screenshots in docs/address-formats-2/`)
})().catch(e => { console.error(e); process.exit(1) })
