#!/usr/bin/env node
// scripts/admin-speed-1.cjs — admin-speed-1 (16 November 2026, docs/admin-speed-1-report.md): /admin MUST NOT GO BACK TO
// ~15 SECONDS. Swept. No network, no database: lib/admin-payload.ts and lib/country-settings.ts are bundled with esbuild and
// run against a FAKE database whose every query takes DELAY ms and is recorded (table, filters, start, end).
//
// WHY: GET /api/admin read the settings of every priced country ONE BY ONE after everything else (208 sequential queries
// since the 210-country rollout, ~15 s on a cold instance), and the page asked check_admin first and demo_cleanup last.
//
// It fails if: the countries are read in more than ONE query, or one by one; the main payload takes more than a handful of
// queries or more than two "rounds" of them; trucks / operators / the plan catalogue stop running side by side; the payload's
// shape, key order or best-effort / fatal rules change; the route or the page go back to the old waterfall. Two broken
// variants (the per-country loop; sequential reads) are built and MUST fail the same checks.
//   node scripts/admin-speed-1.cjs
'use strict'
const fs = require('fs')
const path = require('path')
const Module = require('module')
const REPO = path.resolve(__dirname, '..')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : '')) } }
const DELAY = 15

// ── the fake database ───────────────────────────────────────────────────────────────────────────────────────────────────────
const IE = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/ie-row-2026-10-23.json'), 'utf8')).row
const row = (code, over = {}) => ({ ...IE, country_code: code, name: `Country ${code}`, ...over })
function makeDb(opts) {
  const log = []
  const t0 = Date.now()
  const tables = {
    trucks: opts.trucks,
    operators: [{ id: 'o1', signup_promo_code: 'SPRING' }, { id: 'o2', signup_promo_code: null }],
    country_settings: opts.countries,
    discovery_trucks: [{ id: 'd1', name: 'Disc', hatchgrab_truck_id: null, show_on_vf: true, show_on_hg: false, excluded: false }],
    demo_cleanup_log: [],
  }
  function builder(table) {
    const q = { table, select: null, filters: [] }
    const b = {
      select(c) { q.select = c; return b },
      order() { return b }, limit() { return b },
      eq(c, v) { q.filters.push(['eq', c, v]); return b },
      in(c, v) { q.filters.push(['in', c, [...v]]); return b },
      maybeSingle() { q.single = true; return b },
      then(res, rej) {
        const start = Date.now() - t0
        return new Promise(r => setTimeout(r, DELAY)).then(() => {
          log.push({ table, filters: q.filters, start, end: Date.now() - t0 })
          if (opts.failTable === table) return { data: null, error: { message: 'boom' } }
          let data = tables[table] || []
          for (const [op, c, v] of q.filters) data = data.filter(r => op === 'eq' ? r[c] === v : v.includes(r[c]))
          return { data: q.single ? (data[0] ?? null) : data, error: null }
        }).then(res, rej)
      },
    }
    return b
  }
  const db = { from: builder, log, t0, auth: {} }
  return db
}

// ── the bundle (rebuilt per variant), and a fresh module instance per scenario (the 60-second caches start empty) ────────────
async function bundle(patch) {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const stubs = {
    '@/lib/supabase': 'export const supabase = globalThis.__hgFakeDb',
    '@/lib/plans-server': `export async function getPlanCatalog() {
      const db = globalThis.__hgFakeDb, start = Date.now() - db.t0
      await new Promise(r => setTimeout(r, ${DELAY}))
      db.log.push({ table: 'plans (catalogue)', filters: [], start, end: Date.now() - db.t0 })
      if (globalThis.__hgPlansFail) throw new Error('plans boom')
      return globalThis.__hgPlans }`,
    'server-only': '',
  }
  const out = await esbuild.build({
    stdin: { contents: "export * as P from '@/lib/admin-payload'; export * as C from '@/lib/country-settings'", resolveDir: REPO, loader: 'ts' },
    bundle: true, write: false, platform: 'node', format: 'cjs', target: 'node20', alias: { '@': REPO }, logLevel: 'silent',
    plugins: [{ name: 'stubs', setup(b) {
      b.onResolve({ filter: /^(@\/lib\/supabase|@\/lib\/plans-server|server-only)$/ }, a => ({ path: a.path, namespace: 'stub' }))
      b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: stubs[a.path], loader: 'ts' }))
      if (patch) b.onLoad({ filter: new RegExp(patch.file.replace(/[./]/g, '\\$&') + '$') }, a => {
        const src = fs.readFileSync(a.path, 'utf8')
        if (!src.includes(patch.from)) throw new Error(`variant anchor not found in ${patch.file}`)
        return { contents: src.replace(patch.from, patch.to), loader: 'ts' }
      })
    } }],
  })
  return out.outputFiles[0].text
}
function instance(code) {
  const m = new Module(path.join(REPO, 'scripts/__admin-speed-bundle.cjs'))
  m.paths = Module._nodeModulePaths(REPO)
  m._compile(code, m.id)
  return m.exports
}

const PLANS = codes => ({ plans: [], prices: codes.map((c, i) => ({ countryCode: c, planKey: 'p', amountMinor: 1000 + i })), features: [] })

async function scenario(code, { trucks, countries, priced, failTable, plansFail }) {
  const db = makeDb({ trucks, countries, failTable })
  globalThis.__hgFakeDb = db
  globalThis.__hgPlans = PLANS(priced)
  globalThis.__hgPlansFail = !!plansFail
  const M = instance(code)
  const t0 = Date.now()
  let result, error
  try { result = await M.P.adminPayload() } catch (e) { error = e }
  return { M, db, result, error, ms: Date.now() - t0 }
}

/** The checks — run on the real code, and on each broken variant (which must FAIL at least one). */
async function checks(code, quiet) {
  const results = []
  const c = (label, ok, detail) => { results.push(ok); if (!quiet) t(label, ok, detail) }
  const trucks = [{ id: 't1', name: 'A', country: 'GB' }, { id: 't2', name: 'B', country: 'US' }]
  const countries = [row('GB'), row('US'), row('IE'), row('FR', { currency: 'XXX' })]   // FR unusable; DE has no row
  // 1. the shape, the order, the best-effort rule
  {
    const s = await scenario(code, { trucks, countries, priced: ['GB', 'US', 'IE', 'FR', 'DE'] })
    c('the main payload loads', !s.error, s.error && s.error.message)
    if (!s.error) {
      c('…with the same top-level keys in the same order (trucks, operators, countrySettings, plans)', JSON.stringify(Object.keys(s.result)) === '["trucks","operators","countrySettings","plans"]', Object.keys(s.result))
      c('…countrySettings: the marketing country and the trucks\' first, then the readable priced ones (FR unusable and DE missing are left out → "—")',
        JSON.stringify(Object.keys(s.result.countrySettings)) === '["GB","US","IE"]', Object.keys(s.result.countrySettings))
      c('…operators come through with their signup codes', s.result.operators.length === 2 && s.result.operators[0].signup_promo_code === 'SPRING')
    }
    const cs = s.db.log.filter(q => q.table === 'country_settings')
    c('🔴 every country is read in ONE query (in(country_code, …)), never one by one', cs.length === 1 && cs[0].filters[0] && cs[0].filters[0][0] === 'in', cs.map(q => q.filters))
    c('…and that query asks for all five codes', cs[0] && JSON.stringify([...cs[0].filters[0][2]].sort()) === '["DE","FR","GB","IE","US"]', cs[0] && cs[0].filters)
    c('🔴 a handful of queries in all (trucks, operators, the catalogue, the countries)', s.db.log.length <= 5, s.db.log.map(q => q.table))
    const first = s.db.log.filter(q => ['trucks', 'operators', 'plans (catalogue)'].includes(q.table))
    c('🔴 trucks, operators and the plan catalogue run side by side (they all start before any of them ends)',
      first.length === 3 && Math.max(...first.map(q => q.start)) < Math.min(...first.map(q => q.end)), first)
    c('🔴 two rounds of queries, not a chain: the payload takes under 3 × one query', s.ms < 3 * DELAY + 25, `${s.ms} ms (one query = ${DELAY} ms)`)
  }
  // 2. 208 priced countries (the real catalogue's size) — still one query, still two rounds
  {
    const codes = []
    for (let a = 65; a < 91 && codes.length < 208; a++) for (let b = 65; b < 91 && codes.length < 208; b++) codes.push(String.fromCharCode(a, b))
    const s = await scenario(code, { trucks, countries: [row('GB'), row('US'), ...codes.slice(0, 50).map(k => row(k))], priced: codes })
    const cs = s.db.log.filter(q => q.table === 'country_settings')
    c('🔴 208 priced countries: still ONE country query', cs.length === 1, `${cs.length} country queries`)
    c('🔴 208 priced countries: still under 3 × one query (it was 208 × before)', !s.error && s.ms < 3 * DELAY + 25, s.error ? s.error.message : `${s.ms} ms`)
  }
  // 3. FATAL as before: an unreadable marketing / truck country → 500 country; a failed catalogue → 500 plans; both → country
  {
    const s1 = await scenario(code, { trucks: [...trucks, { id: 't3', name: 'C', country: 'NZ' }], countries, priced: ['GB'] })
    c('a truck country with no row → 500 "Could not load country settings."', s1.error && s1.error.status === 500 && s1.error.message === 'Could not load country settings.', s1.error ? s1.error.message : 'no error')
    const s2 = await scenario(code, { trucks, countries, priced: ['GB'], plansFail: true })
    c('a failed plan catalogue → 500 "Could not load the plans."', s2.error && s2.error.status === 500 && s2.error.message === 'Could not load the plans.', s2.error ? s2.error.message : 'no error')
    const s3 = await scenario(code, { trucks, countries, priced: ['GB'], plansFail: true, failTable: 'country_settings' })
    c('both failing → the country error first, as the route always checked them', s3.error && s3.error.message === 'Could not load country settings.', s3.error ? s3.error.message : 'no error')
    const s4 = await scenario(code, { trucks, countries, priced: ['GB', 'US', 'IE'], failTable: 'operators' })
    c('operators unreadable (the J1 tolerance) → [] and the console still loads', !s4.error && Array.isArray(s4.result.operators) && s4.result.operators.length === 0, s4.error && s4.error.message)
  }
  // 4. the cache: a second load within 60 s reads no country again
  {
    const s = await scenario(code, { trucks, countries, priced: ['GB', 'US', 'IE'] })
    const before = s.db.log.length
    await s.M.P.adminPayload()
    c('a second load within the 60-second cache reads no country settings again', s.db.log.slice(before).every(q => q.table !== 'country_settings'), s.db.log.slice(before).map(q => q.table))
  }
  return results.every(Boolean)
}

;(async () => {
  console.log('── admin-speed-1: /api/admin\'s payload is built in parallel, every country in one query ──')
  const code = await bundle()
  await checks(code, false)

  console.log('\n── the route and the page (source) ──')
  const route = fs.readFileSync(path.join(REPO, 'app/api/admin/route.ts'), 'utf8')
  const get = route.slice(route.indexOf('export async function GET'), route.indexOf('/* ══ 🔴 THE TRUCK FIELDS ADMIN MAY WRITE'))
  t('GET /api/admin builds its payload with lib/admin-payload (adminPayload / adminDiscovery / adminDemoCleanup)', /adminPayload\(\)/.test(get) && /adminDiscovery\(\)/.test(get) && /adminDemoCleanup\(\)/.test(get))
  t('🔴 GET has no loop over countries and no getCountrySettings call', !/\bfor\s*\(/.test(get) && !/getCountrySettings/.test(get))
  t('…and still answers 401 to a non-admin before any section', /if \(!await verifyAdmin\(req\)\) return NextResponse\.json\(\{ error: 'Unauthorised' \}, \{ status: 401 \}\)/.test(get))
  const lib = fs.readFileSync(path.join(REPO, 'lib/admin-payload.ts'), 'utf8')
  const libCode = lib.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  t('🔴 lib/admin-payload.ts: no loop with an await in it, and getCountrySettingsMany called exactly once', !/for\s*\([^)]*\)\s*\{[^}]*await/.test(libCode) && (libCode.match(/getCountrySettingsMany\(/g) || []).length === 1, (libCode.match(/getCountrySettingsMany\(/g) || []).length)
  t('section=discovery sends only the six fields the page reads', /\.select\('id, name, hatchgrab_truck_id, show_on_vf, show_on_hg, excluded'\)/.test(lib))
  const page = fs.readFileSync(path.join(REPO, 'app/(app)/admin/page.tsx'), 'utf8')
  const load = page.slice(page.indexOf('  const load = async ('), page.indexOf('  const update = async (truckId'))
  t('🔴 the page no longer asks check_admin before loading', !/section=check_admin/.test(page))
  t('🔴 load() sends the main request, discovery and demo_cleanup BEFORE awaiting any of them',
    load.indexOf("fetch('/api/admin', ") > 0 && load.indexOf("section=discovery") > 0 && load.indexOf('section=demo_cleanup') > 0 &&
    Math.max(load.indexOf("fetch('/api/admin', "), load.indexOf('section=discovery'), load.indexOf('section=demo_cleanup')) < load.indexOf('await mainP'))
  t('…a 401 on the first load is "access denied", as check_admin\'s false was', /opts\.initial && res\.status === 401\) \{ setCheckingSession\(false\); setDenied\(true\); return \}/.test(load))

  console.log('\n── broken variants — each MUST fail ──')
  const variants = [
    { name: 'V1 the per-country loop comes back (the extra priced countries read one at a time after the rest)', file: 'lib/admin-payload.ts',
      from: "() => getCountrySettingsMany([MARKETING_COUNTRY, ...trucks.map(t => t.country as string)], { bestEffort: priced }),",
      to: "async () => { const cs = await getCountrySettingsMany([MARKETING_COUNTRY, ...trucks.map(t => t.country as string)]); for (const cc of priced) { if (cs[cc]) continue; try { Object.assign(cs, await getCountrySettingsMany([cc])) } catch {} } return cs }," },
    { name: 'V2 getCountrySettingsMany sends one query per code again', file: 'lib/country-settings.ts',
      from: '  if (misses.length) {', to: '  for (const misses of [...fatal, ...extra].filter(k => !found.has(k)).map(k => [k])) {' },
    { name: 'V3 trucks, operators and the catalogue wait for one another', file: 'lib/admin-payload.ts',
      from: '  if (!time) return f()',
      to: '  if (!time) { const g = globalThis as unknown as { __c?: Promise<void> }; const prev = g.__c ?? Promise.resolve(); let done = () => {}; g.__c = new Promise<void>(r => { done = r }); await prev; try { return await f() } finally { done() } }' },
  ]
  for (const v of variants) {
    let failed = false, why = ''
    try { failed = !(await checks(await bundle(v), true)) } catch (e) { failed = true; why = e.message }
    t(`${v.name} → fails`, failed, why)
  }

  console.log(fail ? `\n🔴 ${fail} CHECK(S) FAILED (${pass} passed)` : `\n✅ all ${pass} passed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
