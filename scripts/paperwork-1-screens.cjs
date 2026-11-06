#!/usr/bin/env node
// scripts/paperwork-1-screens.cjs — paperwork-1 (4 November 2026, docs/paperwork-1-report.md): Manage › Documents in WEBKIT, against
// the approved layout (docs/paperwork-1/paperwork-mockup.png). Needs a local WebKit (playwright); NO build: the stylesheet is
// compiled from app/globals.css with Tailwind's own PostCSS plugin, so every class the components use is in it.
//   node scripts/paperwork-1-screens.cjs
// The REAL components/manage/PaperworkTab.tsx is bundled for the browser and mounted with the truck's clock and country; every call
// to /api/manage/paperwork and the storage upload is answered here from fixtures (nothing reaches the database, the AI or Brevo).
// The organiser page is the REAL server render of app/docs/[token]/page.tsx over the in-memory database.
// Writes docs/paperwork-1/: list-390, check-390, send-390, organiser-390 (WebKit, 390 px) and list-ipad-820, check-ipad-820.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'paperwork-1-screens' })
const { fakeSupabase, TYPE_ROWS, STUBS } = require('./_paperwork-1-fixtures.cjs')
const { REPO } = kit
const OUT = path.join(REPO, 'docs/paperwork-1')
let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 900)}` : '')) } }
const ymd = d => d.toISOString().slice(0, 10)
const day = n => ymd(new Date(Date.now() + n * 86_400_000))

async function css() {
  const postcss = require(require.resolve('postcss', { paths: [REPO] }))
  const tw = require(require.resolve('@tailwindcss/postcss', { paths: [REPO] }))
  const src = fs.readFileSync(path.join(REPO, 'app/(app)/globals.css'), 'utf8').replace(/@import "leaflet[^"]*";\n?/, '')
  const out = await postcss([tw({ base: REPO })]).process(src, { from: path.join(REPO, 'app/(app)/globals.css') })
  return out.css
}
async function browserBundle() {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const r = await esbuild.build({
    stdin: { contents: [
      "import { createElement as h } from 'react'",
      "import { createRoot } from 'react-dom/client'",
      "import PaperworkTab from '@/components/manage/PaperworkTab'",
      "import { TruckTimeContext } from '@/components/TruckTimeContext'",
      "import { CountrySettingsProvider } from '@/components/CountrySettingsProvider'",
      "import { LEGACY_UK_TIME_SETTINGS } from '@/lib/time-utils'",
      "createRoot(document.getElementById('root')).render(h(CountrySettingsProvider, { settings: { countryCode: 'GB', currency: 'GBP', locale: 'en-GB' } },",
      "  h(TruckTimeContext.Provider, { value: LEGACY_UK_TIME_SETTINGS }, h('div', { className: 'min-h-screen bg-slate-50 px-4 py-6' }, h(PaperworkTab, { token: 'tok', showToast: () => {} })))))",
    ].join('\n'), resolveDir: REPO, loader: 'tsx' },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', alias: { '@': REPO }, define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
  })
  return r.outputFiles[0].text
}

// The load the screen gets: the GB list, five documents as in the mockup, one link sent.
const TYPES = TYPE_ROWS.filter(r => r.country_code === 'GB').sort((a, b) => a.position - b.position).map(r => ({ key: r.key, hasExpiry: r.has_expiry, dateLabel: r.date_label }))
const doc = (id, typeKey, more) => ({ id, typeKey, customName: null, issuer: null, issuedOn: null, expiresOn: null, nameOnDocument: 'Pizza Kitchen Ltd', coverAmountMinor: null, currency: null, mime: 'application/pdf', status: 'current', supersededBy: null, createdAt: new Date().toISOString(), ...more })
const LOAD = {
  today: ymd(new Date()), types: TYPES, currency: 'GBP', truckNames: ['Pizza Kitchen', 'Dominic Test'],
  documents: [
    doc('d1', 'public_liability', { issuer: 'Hiscox', coverAmountMinor: 500000000, currency: 'GBP', expiresOn: day(128) }),
    doc('d2', 'gas_safety', { issuer: 'Anglia Gas Services', expiresOn: day(17) }),
    doc('d3', 'pat_test', { expiresOn: day(-33) }),
    doc('d4', 'hygiene_rating', { issuer: 'Cambridge City Council', mime: 'image/jpeg' }),
    doc('d5', 'food_safety_plan', { expiresOn: day(209) }),
    doc('d6', 'food_registration', { issuer: 'Cambridge City Council' }),
    doc('d7', 'employers_liability', { issuer: 'Hiscox', expiresOn: day(128) }),
    doc('d8', 'fire_safety', { expiresOn: day(300) }),
    doc('d9', 'allergen_info', { expiresOn: day(200) }),
  ],
  events: [{ id: 'ev-1', date: day(32), name: 'Cambridge Christmas Market' }, { id: 'ev-2', date: day(40), name: 'Mill Road Winter Fair' }],
  shares: [{ id: 's1', emails: ['events@burymarket.co.uk'], createdAt: new Date(Date.now() - 6 * 86_400_000).toISOString(), expiresAt: new Date(Date.now() + 8 * 86_400_000).toISOString(), revokedAt: null, firstOpenedAt: new Date(Date.now() - 5 * 86_400_000).toISOString(), viewCount: 3, eventId: null, items: [] }],
}
const DRAFT = { typeKey: 'gas_safety', customName: null, issuer: 'Anglia Gas Services', issuedOn: day(-348), expiresOn: day(17), nameOnDocument: 'Pizza Kitchen Ltd', coverAmountMinor: null, currency: null }

;(async () => {
  const [style, bundle] = await Promise.all([css(), browserBundle()])
  // The organiser page: the real server render over the in-memory database.
  const L = await kit.bundle('pw1s', "export { default as OrganiserPage } from '@/app/(app)/docs/[token]/page'", { stubs: STUBS })
  const db = fakeSupabase({
    trucks: [{ id: 'test-truck', name: 'Pizza Kitchen', country: 'GB', timezone: 'Europe/London', logo_storage_path: null }],
    paperwork_document_types: TYPE_ROWS,
    truck_documents: [
      { id: 'o1', truck_id: 'test-truck', type_key: 'public_liability', issuer: 'Hiscox', expires_on: day(128), status: 'current', storage_path: 'test-truck/o1/a.pdf', mime: 'application/pdf' },
      { id: 'o2', truck_id: 'test-truck', type_key: 'gas_safety', issuer: 'Anglia Gas Services', expires_on: day(17), status: 'current', storage_path: 'test-truck/o2/b.pdf', mime: 'application/pdf' },
      { id: 'o3', truck_id: 'test-truck', type_key: 'hygiene_rating', issuer: 'Cambridge City Council', expires_on: null, status: 'current', storage_path: 'test-truck/o3/c.jpg', mime: 'image/jpeg' },
      { id: 'o4', truck_id: 'test-truck', type_key: 'food_safety_plan', expires_on: day(209), status: 'current', storage_path: 'test-truck/o4/d.pdf', mime: 'application/pdf' },
    ],
    document_shares: [{ id: 'sh', truck_id: 'test-truck', token: 'Q'.repeat(32), organiser_emails: ['events@cambridgemarket.co.uk'], expires_at: new Date(Date.now() + 33 * 86_400_000).toISOString(), revoked_at: null, view_count: 0, first_opened_at: null }],
    document_share_items: ['public_liability', 'gas_safety', 'hygiene_rating', 'food_safety_plan'].map((k, i) => ({ id: i + 1, share_id: 'sh', type_key: k, document_id: null, position: i })),
  })
  globalThis.__harnessDb = db
  const organiserHtml = kit.renderStatic(await kit.quietAsync(() => L.OrganiserPage({ params: Promise.resolve({ token: 'Q'.repeat(32) }) })))

  const { webkit } = require(path.join(REPO, 'node_modules/playwright'))
  const browser = await webkit.launch()
  fs.mkdirSync(OUT, { recursive: true })
  const page = async (width, height = 1100) => {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 })
    const p = await ctx.newPage()
    await p.route('**/api/manage/paperwork', async route => {
      const b = JSON.parse(route.request().postData() || '{}')
      const answer = b.action === 'load' ? LOAD : b.action === 'upload_url' ? { documentId: 'new1', uploadUrl: 'https://storage.example/upload/x' }
        : b.action === 'read' ? { documentId: 'new1', read: true, draft: DRAFT, confidence: {} } : b.action === 'file_url' ? { url: 'about:blank', mime: 'application/pdf' } : { ok: true }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(answer) })
    })
    await p.route('https://storage.example/**', route => route.fulfill({ status: 200, body: '{}' }))
    const shell = `<!doctype html><html lang="en-GB"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${style}</style></head><body><div id="root"></div></body></html>`
    await p.route('https://www.hatchgrab.test/manage', route => route.fulfill({ status: 200, contentType: 'text/html', body: shell }))
    p.on('pageerror', e => console.log('   [browser error]', e.message))
    await p.goto('https://www.hatchgrab.test/manage')
    return p
  }
  const mount = async p => { await p.addScriptTag({ content: bundle }); await p.waitForSelector('[data-tab="paperwork"]'); await p.waitForTimeout(200) }
  const noSideScroll = p => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  try {
    for (const [width, tag] of [[390, '390'], [820, 'ipad-820']]) {
      console.log(`\n── Manage › Documents at ${width} px (WebKit)`)
      const p = await page(width)
      await mount(p)
      const counts = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-count]')].map(e => [e.dataset.count, e.textContent.trim()])))
      t('the counts: 1 expired, 1 due soon, 2 missing, 7 up to date', counts.expired === '1 expired' && counts.due_soon === '1 due soon' && counts.missing === '2 missing' && counts.up_to_date === '7 up to date', counts)
      const rows = await p.evaluate(() => [...document.querySelectorAll('[data-row]')].map(r => ({ k: r.dataset.row, s: r.dataset.status, text: r.textContent })))
      t('each document\'s status and line (Hiscox · £5,000,000 cover · Expires …; Expires … · in 17 days; Expired …; No expiry; Review by …; Not uploaded yet)', rows.find(r => r.k === 't:public_liability').text.includes('Hiscox · £5,000,000 cover · Expires')
        && rows.find(r => r.k === 't:gas_safety').s === 'due_soon' && /in 17 days/.test(rows.find(r => r.k === 't:gas_safety').text) && rows.find(r => r.k === 't:pat_test').s === 'expired'
        && /No expiry/.test(rows.find(r => r.k === 't:hygiene_rating').text) && /Review by/.test(rows.find(r => r.k === 't:food_safety_plan').text) && /Not uploaded yet/.test(rows.find(r => r.k === 't:risk_assessment').text), rows.map(r => r.text))
      t('nothing scrolls sideways', await noSideScroll(p))
      for (const k of ['t:public_liability', 't:gas_safety', 't:hygiene_rating', 't:food_safety_plan']) await p.check(`[data-row="${k}"] input[type=checkbox]`)
      t('the bar: "4 selected" and Send to organiser enabled; a missing document cannot be ticked', (await p.textContent('[data-bar="send"]')).includes('4 selected') && await p.isEnabled('[data-bar="send"] button') && await p.isDisabled('[data-row="t:risk_assessment"] input[type=checkbox]'))
      t('every checkbox has its own label', await p.evaluate(() => [...document.querySelectorAll('[data-row] input[type=checkbox]')].every(c => /^Select /.test(c.getAttribute('aria-label') || ''))))
      await p.screenshot({ path: path.join(OUT, `list-${tag}.png`), fullPage: true })

      // Check the details: + Add a document → choose a file → the AI's draft
      await p.click('text=+ Add a document')
      await p.setInputFiles('input[type=file]:not([capture])', { name: 'gas-cert.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7 harness') })
      await p.waitForSelector('[data-form="details"]')
      const form = await p.evaluate(() => {
        const f = document.querySelector('[data-form="details"]')
        const labels = [...f.querySelectorAll('label')].map(l => [l.textContent, f.querySelector(`#${CSS.escape(l.htmlFor)}`)?.value])
        return { labels, warn: f.querySelector('[data-warnings]')?.dataset.warnings, text: f.textContent, dialog: !!f.closest('[role=dialog][aria-modal=true]') }
      })
      t('"Check the details": every field pre-filled from the draft, each with its label', form.labels.find(l => l[0] === 'Document')[1] === 'gas_safety' && form.labels.find(l => l[0] === 'Issued by')[1] === 'Anglia Gas Services'
        && form.labels.find(l => l[0] === 'Expires')[1] === day(17) && form.labels.find(l => l[0] === 'Name on the document')[1] === 'Pizza Kitchen Ltd', form.labels)
      t('…the banner, the 17-day warning, Save, and the history note; a modal dialog', /We read this from your document/.test(form.text) && form.warn === 'expiresSoon' && /This expires in 17 days/.test(form.text) && /The previous certificate is kept as history/.test(form.text) && form.dialog)
      t('nothing scrolls sideways', await noSideScroll(p))
      await p.screenshot({ path: path.join(OUT, `check-${tag}.png`), fullPage: false })
      await p.fill('[data-form="details"] input[maxlength="160"] >> nth=1', 'Smokey Joe’s BBQ Limited')
      t('typing another business\'s name on it shows the name warning at once', /doesn’t look like your business name/.test(await p.textContent('[data-form="details"]')))
      await p.keyboard.press('Escape')
      if (width === 390) {
        await p.click('[data-bar="send"] button')
        await p.waitForSelector('[data-form="send"]')
        await p.fill('[data-form="send"] input[inputmode="email"]', 'events@cambridgemarket.co.uk')
        await p.selectOption('[data-form="send"] select', 'ev-1')
        await p.waitForTimeout(150)
        const send = await p.evaluate(() => ({ text: document.querySelector('[data-form="send"]').textContent, until: document.querySelector('[data-form="send"] input[type=date]').value, chips: [...document.querySelectorAll('[data-form="send"] [aria-pressed="true"]')].length }))
        t('Send to organiser: the four documents, the event, and "the day after the event" as the default date', send.chips === 4 && send.until === day(33) && /the day after the event/.test(send.text) && /If you renew a certificate/.test(send.text), send)
        await p.screenshot({ path: path.join(OUT, `send-${tag}.png`), fullPage: false })
      }
      await p.context().close()
    }
    console.log('\n── the organiser page at 390 px (WebKit)')
    const o = await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 })
    const op = await o.newPage()
    await op.setContent(`<!doctype html><html lang="en-GB"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${style}</style></head><body>${organiserHtml}</body></html>`)
    const ot = await op.textContent('body')
    t('the organiser page: the truck, four documents with View and Download, Download all, the date it works until', /Documents from Pizza Kitchen/.test(ot) && (await op.$$('[data-doc]')).length === 4 && /Download all/.test(ot) && /This link works until/.test(ot))
    t('nothing scrolls sideways', await noSideScroll(op))
    await op.screenshot({ path: path.join(OUT, 'organiser-390.png'), fullPage: true })
    await o.close()
  } finally { await browser.close() }
  console.log(`\npaperwork-1-screens: ${pass} passed, ${fail} failed — screenshots in docs/paperwork-1/`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
