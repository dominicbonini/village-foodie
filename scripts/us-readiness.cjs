#!/usr/bin/env node
// scripts/us-readiness.cjs — the US readiness sweep (docs/us-readiness-sweep-report.md): allergen lists by
// country, landing and features metadata by country, Manage placeholders by address style, the plans PDF by
// prospect country.
//
//   node scripts/us-readiness.cjs                    compare against the committed BEFORE snapshot
//   node scripts/us-readiness.cjs --capture <file>   snapshot the current code's GB answers
//
// ── 🔴 THE METHOD ─────────────────────────────────────────────────────────────────────────────────────────
// BEFORE was captured on the checkpoint e54c7ea, before any edit of this sweep. It holds the GB answers this
// sweep could change that other harnesses do not already pin: the allergen card prompt as sent, the menu
// importer's prompt as sent, the landing and features metadata objects, the three Manage placeholders, the
// country the plans PDF is generated for, and the allergen toggles as rendered. (The landing, features and
// compare pages' rendered HTML — JSON-LD included — stay pinned by scripts/marketing-country-parity.cjs, and
// every CSV by scripts/money-sweep-parity.cjs.) AFTER, every one is byte-identical for GB; the US side runs on
// fixtures (the US stays switched off in the database).

const fs = require('fs'); const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'us-readiness' })
const { REPO } = kit
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const argv = process.argv.slice(2)
const CAPTURE = argv.includes('--capture') ? argv[argv.indexOf('--capture') + 1] : null
const BEFORE_FILE = 'scripts/fixtures/us-readiness-before.json'
const SEEDS = require('./_country-settings-gb.cjs')
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))
const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
const AFTER_CODE = fs.existsSync(path.join(REPO, 'lib/allergens.ts'))

let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${String(detail).slice(0, 500)}` : ''}`) } }
const head = s => console.log(`\n── ${s}`)

const GB = snake(SEEDS.gbFromSeed())
const US_ON = snake({ ...SEEDS.usFromSeed(), enabled: true, starterMonthlyMinor: 0, proMonthlyMinor: 3900, maxMonthlyMinor: 6900, proAllowanceMinor: 200000, maxAllowanceMinor: 300000, platformFeePct: 0.99 })
const FONTS = { 'next/font/google': ['Archivo', 'Public_Sans', 'Courier_Prime'].map(n => `export const ${n} = () => ({ variable: 'font-${n}', className: 'font-${n}', style: {} })`).join('\n'),
  'next/headers': `
    const H = () => globalThis.__urReq || { headers: {}, cookies: {} }
    export async function headers() { const r = H(); return { get: k => r.headers[k.toLowerCase()] ?? null, has: k => k.toLowerCase() in r.headers } }
    export async function cookies() { const r = H(); return { get: k => (k in r.cookies ? { name: k, value: r.cookies[k] } : undefined), has: k => k in r.cookies, getAll: () => [] } }` }

/* ── 1 · the two AI prompts, as sent ── */
async function captureFetch(fn, answer) {
  const sent = []
  const real = globalThis.fetch
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body)
    sent.push(body.contents[0].parts[0].text)
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: answer }] } }] }), text: async () => answer }
  }
  try { await kit.quietAsync(fn) } finally { globalThis.fetch = real }
  return sent
}
async function allergenPrompts(truck, rows) {
  const m = await kit.bundle('ur-allergens', "export { POST } from '@/app/api/manage/process-allergens/route'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'")
  const out = {}
  for (const mode of ['structure', 'transcribe']) {
    globalThis.__harnessDb = kit.fakeDb({ trucks: [truck], country_settings: rows }); m.clearCountrySettingsCache?.()
    try {
      const fd = new FormData(); fd.set('token', 'tok-test'); fd.set('text', 'Margherita contains milk and wheat.')
      if (mode === 'transcribe') fd.set('mode', 'transcribe')
      const sent = await captureFetch(() => m.POST(new NextRequest('http://127.0.0.1/api/manage/process-allergens', { method: 'POST', body: fd })),
        JSON.stringify({ summary: 'x', contains: [], may_contain: [], free_from: [], dietary_options: [], formatted_text: 'x', entries: [], blanket: [], cross_contamination: [] }))
      out[mode] = sent[0] ?? null
    } finally { delete globalThis.__harnessDb }
  }
  return out
}
async function menuPrompt(truckArg) {
  const m = await kit.bundle('ur-menu', "export { extractMenu } from '@/lib/menu-extract'")
  const db = kit.fakeDb({ menu_categories: [], menu_items_db: [], modifier_groups: [], modifier_options: [] })
  const sent = await captureFetch(() => m.extractMenu(db, truckArg, { text: 'Margherita 9.50' }), JSON.stringify({ categories: ['Pizzas'], items: [] }))
  return sent[0] ?? null
}

/* ── 2 · landing and features metadata ── */
async function metadataOf(file, query, rows = [GB, US_ON]) {
  const m = await kit.bundle(`ur-meta-${file.replace(/\W/g, '')}`, `export * from '@/${file}'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'`, { stubs: FONTS })
  if (typeof m.generateMetadata === 'function') {
    globalThis.__harnessDb = kit.fakeDb({ country_settings: rows }); m.clearCountrySettingsCache?.()
    try { return JSON.parse(JSON.stringify(await kit.quietAsync(() => m.generateMetadata({ searchParams: Promise.resolve(query ? { country: query } : {}) })))) }
    finally { delete globalThis.__harnessDb }
  }
  return JSON.parse(JSON.stringify(m.metadata))
}

/* ── 3 · the three Manage placeholders, as the page renders them for GB ── */
function placeholdersFromSource() {
  const P = read('app/manage/[token]/page.tsx')
  const grab = re => (P.match(re) || [])[1] ?? null
  return {
    address: grab(/label="Full address \(optional\)"[^\n]*placeholder="([^"]+)"/),
    area: grab(/label="Area \(village, town or city\)"[^\n]*placeholder="([^"]+)"/),
    paste: grab(/placeholder="(Paste your schedule here e\.g\. [^"]+)"/),
  }
}

/* ── 4 · the plans PDF: which country it is generated for ── */
async function plansCountry(tables, prospectId = 'pr-1') {
  const m = await kit.bundle('ur-plans', "export { POST } from '@/app/api/admin/outreach/attachments/route'", {
    stubs: { '@/lib/auth/admin': 'export async function verifyAdmin() { return true }',
      '@/lib/plans-pdf': 'export async function generatePlansPdf(c) { (globalThis.__urPdf ||= []).push(c); return Buffer.from("%PDF-harness") }' },
  })
  globalThis.__urPdf = []
  const db = kit.fakeDb(tables)
  globalThis.__harnessDb = { ...db, storage: { from: () => ({ upload: async () => ({ error: null }) }) } }
  try {
    const res = await kit.quietAsync(() => m.POST(new NextRequest('http://127.0.0.1/api/admin/outreach/attachments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'plans_pdf', prospect_id: prospectId }) })))
    return { status: res.status, ok: (await res.json()).ok, countries: globalThis.__urPdf }
  } finally { delete globalThis.__harnessDb }
}
const PROSPECTS = (country) => ({
  outreach_prospects: [{ id: 'pr-1', discovery_truck_id: 'dt-1' }],
  discovery_trucks: [{ id: 'dt-1', name: 'Austin Eats', ...(country === undefined ? {} : { country }) }],
  country_settings: [GB, US_ON],
})

/* ── 5 · the allergen toggles, as rendered ── */
async function togglesView(settings) {
  const m = await kit.bundle('ur-toggles', "export { AllergenToggles } from '@/components/manage/primitives'\nexport { CountrySettingsProvider } from '@/components/CountrySettingsProvider'")
  const el = kit.h(m.AllergenToggles, { value: ['Eggs'], onChange() {} })
  return kit.textOf(kit.renderStatic(settings ? kit.h(m.CountrySettingsProvider, { settings }, el) : el)).text
}

const GB_TRUCK = { id: 'test-truck', name: 'Pizza Kitchen', dashboard_token: 'tok-test', country: 'GB', currency: 'GBP' }
async function gbViews() {
  globalThis.__urReq = { headers: { host: 'www.hatchgrab.com' }, cookies: {} }
  return {
    allergenPrompts: await allergenPrompts(GB_TRUCK, [GB, US_ON]),
    menuPrompt: await menuPrompt({ id: 'test-truck', name: 'Pizza Kitchen', money: { currency: 'GBP', locale: 'en-GB' } }),
    landingMeta: await metadataOf('app/landing/page.tsx', null),
    featuresMeta: await metadataOf('app/features/page.tsx', null),
    placeholders: placeholdersFromSource(),
    plans: await plansCountry(PROSPECTS('GB')),
    togglesNoProvider: await togglesView(null),
    togglesGb: await togglesView(SEEDS.gbFromSeed()),
  }
}

function diffJson(a, b, p = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return null
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = diffJson(a[k], b[k], `${p}.${k}`); if (d) return d }
  }
  return `${p}: BEFORE ${JSON.stringify(a)?.slice(0, 220)} · AFTER ${JSON.stringify(b)?.slice(0, 220)}`
}

async function main() {
  kit.setNow('2026-10-13T12:00:00.000Z')
  const got = await gbViews()
  if (CAPTURE) {
    fs.writeFileSync(path.resolve(REPO, CAPTURE), JSON.stringify({ captured_on: 'checkpoint e54c7ea, before any edit of this sweep', views: got }, null, 1) + '\n')
    for (const [k, v] of Object.entries(got)) console.log(`  ${k}: ${JSON.stringify(v).slice(0, 140)}`)
    console.log(`captured → ${CAPTURE}`)
    return
  }
  head('1 · GB: every answer this sweep touches is byte-identical to BEFORE')
  const before = JSON.parse(read(BEFORE_FILE)).views
  for (const [k, b] of Object.entries(before)) {
    if (k === 'placeholders') continue   // compared in §4 against the copy module (the page reads them from it now)
    const d = diffJson(b, got[k])
    t(`${k}: byte-identical to BEFORE`, d === null, d)
  }
  if (AFTER_CODE) await require('./_us-readiness-us.cjs')({ kit, t, head, read, REPO, before, got, allergenPrompts, menuPrompt, metadataOf, plansCountry, togglesView, PROSPECTS, GB, US_ON, SEEDS, snake })
  console.log(`\n${fail ? '✗' : '✓'} us-readiness: ${pass} passed, ${fail} failed`)
  if (fail) process.exit(1)
}
main().catch(e => { console.error(e); process.exit(1) })
