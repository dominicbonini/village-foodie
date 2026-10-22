// scripts/canada-2.cjs — CANADA READY TO SWITCH ON (canada-2, 22 October 2026, docs/canada-2-report.md).
//
// LOCALHOST ONLY: the REAL /api/setup and /api/manage routes on an in-memory database (scripts/_fake-pg.cjs / the render kit's
// fakeDb), the CA row parsed from the NOT RUN SQL (scripts/_canada-1-fixtures.cjs) switched ON here only. Checks:
//   1  SIGNUP AND WHERE YOU TRADE — a base town in Quebec, Saskatchewan or Manitoba is refused, each with its reason said
//      plainly ("isn’t available in French yet" / "we’re adding separate GST and PST lines first"), by /api/setup (create_truck),
//      by Manage › Where you trade (update_trade_area) and by the signup step itself; Ontario, BC, Alberta and Nova Scotia sign
//      up and store their province; Saskatchewan and Manitoba keep their tax data, for when they open;
//   2  TIME ZONES — scripts/check-tzdata.cjs (run before every build) reports this runtime's Node and tz data, and whether the
//      2026 Canadian changes are in it, computed the same way as an independent check; it never fails a build;
//   3  THE TERMS — the Canada section after New Zealand: everything before it byte-identical (US, Ireland, Australia, New Zealand,
//      the intro), the Terms of Service and the Privacy Policy byte-identical; the section's shape, its points written out in
//      full, no [FLAG], the dates and TERMS_VERSION at the build date; the page renders it.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
const fs = require('fs')
const path = require('path')
const { execFileSync, spawnSync } = require('child_process')
const kit = require('./_render-kit.cjs')({ cacheTag: 'canada-2' })
const { REPO } = kit
const CF = require('./_canada-1-fixtures.cjs')
const LP1E = require('./_lp1e-fixtures.cjs')
const { makeFakePg } = require('./_fake-pg.cjs')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 100 - s.length)))
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const snake = LP1E.snake
const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
const post = (url, body) => new NextRequest(url, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })

/** A Canadian town picked from Places in each province (a place id and a point, so its province code is kept). */
const TOWN = {
  QC: ['Montréal', 'Quebec', 45.5019, -73.5674, 'America/Toronto'], SK: ['Saskatoon', 'Saskatchewan', 52.1332, -106.67, 'America/Regina'],
  MB: ['Winnipeg', 'Manitoba', 49.8954, -97.1385, 'America/Winnipeg'], ON: ['Toronto', 'Ontario', 43.6532, -79.3832, 'America/Toronto'],
  BC: ['Vancouver', 'British Columbia', 49.2827, -123.1207, 'America/Vancouver'], AB: ['Calgary', 'Alberta', 51.0447, -114.0719, 'America/Edmonton'],
  NS: ['Halifax', 'Nova Scotia', 44.6488, -63.5752, 'America/Halifax'],
}
const placeOf = rg => { const [name, region, lat, lng, tz] = TOWN[rg]; return { base_place_id: `ChIJ-ca-${rg.toLowerCase()}-00001`, base_place_name: name, base_region: region, base_region_code: rg, base_lat: lat, base_lng: lng, timezone: tz } }
const WORDS = {
  QC: 'Trucks based in Quebec can’t sign up yet: HatchGrab isn’t available in French yet. If your truck is based somewhere else, choose that town or city.',
  SK: 'Trucks based in Saskatchewan can’t sign up yet: we’re adding separate GST and PST lines first. If your truck is based somewhere else, choose that town or city.',
  MB: 'Trucks based in Manitoba can’t sign up yet: we’re adding separate GST and PST lines first. If your truck is based somewhere else, choose that town or city.',
}

;(async () => {
  const rows = CF.ROWS.caOn()
  const catalog = CF.CATALOG()
  const PLAN_TABLES = () => ({ plans: catalog.plans.map(snake), plan_prices: catalog.prices.map(snake), plan_features: catalog.features.map(snake) })
  const STUBS = {
    '@/lib/supabase/server': 'export async function createSupabaseServerClient() { return { auth: { getUser: async () => ({ data: { user: { id: \'auth-harness\' } }, error: null }) } } }',
    '@/lib/auth/admin': 'export async function verifyAdmin() { return true }',
    '@/lib/ratelimit': 'export const placesRatelimit = { limit: async () => ({ success: true }) }',
  }
  const clear = "\nexport { clearCountrySettingsCache } from '@/lib/country-settings'\nexport { clearPlanCatalogCache } from '@/lib/plans-server'"

  // ══ 1 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('1 · QUEBEC, SASKATCHEWAN AND MANITOBA REFUSED — the real routes and the signup step')
  const SETUP = await kit.bundle('ca2-setup', "export { POST } from '@/app/api/setup/route'" + clear, { stubs: STUBS })
  const createTruck = async rg => {
    const writes = []
    globalThis.__harnessDb = kit.fakeDb({ ...PLAN_TABLES(), operators: [{ id: 'op-harness', email: 'harness@example.test', auth_user_id: 'auth-harness' }],
      country_settings: rows.map(snake), trucks: [], truck_vans: [], demo_sessions: [], discovery_trucks: [] }, writes)
    SETUP.clearCountrySettingsCache(); SETUP.clearPlanCatalogCache?.()
    try {
      const res = await kit.quietAsync(() => SETUP.POST(post('http://localhost/api/setup', { action: 'create_truck', name: 'Harness Kitchen', country: 'CA', contact_phone: '416-555-0123', phone_is_whatsapp: false, ...placeOf(rg) })))
      const json = await res.json()
      const ins = writes.find(w => w.table === 'trucks' && w.op === 'insert')
      const regionWrite = writes.filter(w => w.table === 'trucks').map(w => (Array.isArray(w.patch) ? w.patch[0] : w.patch)).find(p => p && 'base_region_code' in p)
      return { status: res.status, json, truck: ins ? (Array.isArray(ins.patch) ? ins.patch[0] : ins.patch) : null, regionCode: regionWrite?.base_region_code }
    } finally { delete globalThis.__harnessDb }
  }
  for (const rg of ['QC', 'SK', 'MB']) {
    const r = await createTruck(rg)
    t(`signup (/api/setup, create_truck) in ${TOWN[rg][1]}: refused, 400 — "${WORDS[rg]}"`, r.status === 400 && r.json.ok === false && r.json.code === 'region_closed' && r.json.error === WORDS[rg] && !r.truck, { status: r.status, json: r.json })
  }
  for (const rg of ['ON', 'BC', 'AB', 'NS']) {
    const r = await createTruck(rg)
    t(`signup in ${TOWN[rg][1]} (${TOWN[rg][0]}): created — country CA, CAD, its zone, province "${rg}" stored`, r.status === 200 && r.json.ok === true && r.truck?.country === 'CA' && r.truck?.currency === 'CAD' && r.truck?.timezone === TOWN[rg][4] && r.regionCode === rg,
      { status: r.status, json: JSON.stringify(r.json).slice(0, 200), truck: r.truck && { country: r.truck.country, currency: r.truck.currency, tz: r.truck.timezone }, regionCode: r.regionCode })
  }
  // Manage › Settings › Where you trade (update_trade_area) — the real route, an owner's token.
  const ACCESS = { file: 'app/api/manage/route.ts', from: /const access = await resolveTruckAccess\(req, truck\)/g, to: "const access = { ok: true as const, role: 'owner' as const, userId: null, operatorId: null, via: 'harness' } as any" }
  const MANAGE = await kit.bundle('ca2-manage', "export { POST } from '@/app/api/manage/route'" + clear, { patches: [ACCESS],
    stubs: { '@/lib/supabase/server': 'export async function createSupabaseServerClient() { return { auth: { getUser: async () => ({ data: { user: null }, error: null }) } } }' } })
  const tradeArea = async rg => {
    const db = makeFakePg({ country_settings: rows.map(snake), trucks: [{ id: 'ca-truck', name: 'Pizza Kitchen', slug: 'pizza-kitchen', dashboard_token: 'tok', operator_id: 'op-1', country: 'CA', currency: 'CAD',
      timezone: 'America/Toronto', plan: 'pro', feature_overrides: {}, trial_expires_at: null, base_place_name: 'Toronto', base_region_code: 'ON', contact_email: 'k@example.test' }],
      operators: [{ id: 'op-1', auth_user_id: 'u-1', is_admin: false }], truck_users: [], audit_log: [], truck_vans: [], ...PLAN_TABLES() }, {})
    globalThis.__harnessDb = db; MANAGE.clearCountrySettingsCache?.(); MANAGE.clearPlanCatalogCache?.()
    try {
      const res = await kit.quietAsync(() => MANAGE.POST(post('http://127.0.0.1/api/manage', { token: 'tok', action: 'update_trade_area', ...placeOf(rg) })))
      return { status: res.status, body: await res.json().catch(() => null), truck: (db.tables?.trucks || db.trucks || [])[0] }
    } finally { delete globalThis.__harnessDb }
  }
  for (const rg of ['QC', 'SK', 'MB']) {
    const r = await tradeArea(rg)
    t(`Where you trade (update_trade_area): moving the base to ${TOWN[rg][0]} is refused with the same words, and the truck stays in Toronto, ON`, r.status === 400 && r.body?.error === WORDS[rg] && r.truck?.base_place_name === 'Toronto' && r.truck?.base_region_code === 'ON', { status: r.status, body: r.body, truck: r.truck && { n: r.truck.base_place_name, c: r.truck.base_region_code } })
  }
  for (const rg of ['BC', 'NS']) {
    const r = await tradeArea(rg)
    t(`Where you trade: moving the base to ${TOWN[rg][0]} is saved (${rg})`, r.status === 200 && r.truck?.base_place_name === TOWN[rg][0] && r.truck?.base_region_code === rg, { status: r.status, body: JSON.stringify(r.body).slice(0, 200) })
  }
  // The signup step itself (components/setup/WhereBasedStep.tsx) — the same check, before anything is sent.
  const STEP = await kit.bundle('ca2-step', "export { baseAnswerErrors } from '@/components/setup/WhereBasedStep'\nexport * as AF from '@/lib/address-formats'")
  const CA = rows.find(r => r.countryCode === 'CA')
  const sc = { code: 'CA', name: 'Canada', timezones: CA.timezones, defaultTimezone: CA.defaultTimezone, addressFormat: 'ca' }
  const step = rg => { const p = placeOf(rg); return STEP.baseAnswerErrors({ country: 'CA', timezone: p.timezone, place: { placeId: p.base_place_id, name: p.base_place_name, region: p.base_region, lat: p.base_lat, lng: p.base_lng, regionCode: rg } }, [sc]) }
  t('the signup step refuses QC (reason "language", French), SK and MB (reason "taxLines"), and accepts ON / BC / AB / NS',
    step('QC').town?.params?.reason === 'language' && step('QC').town?.params?.language === 'French' && ['SK', 'MB'].every(rg => step(rg).town?.code === 'region_closed' && step(rg).town?.params?.reason === 'taxLines')
    && ['ON', 'BC', 'AB', 'NS'].every(rg => !step(rg).town), ['QC', 'SK', 'MB', 'ON'].map(rg => step(rg).town))
  const ca = STEP.AF.ADDRESS_FORMATS.ca.regions.list
  t('the closures are DATA on the regions: QC { language, French }, SK and MB { taxLines }; nothing else in Canada is closed', JSON.stringify(ca.filter(r => r.signupClosed).map(r => [r.code, r.signupClosed])) === JSON.stringify([['MB', { reason: 'taxLines' }], ['QC', { reason: 'language', needsLanguage: 'French' }], ['SK', { reason: 'taxLines' }]]))
  t('Saskatchewan and Manitoba keep their tax data for when they open (GST + PST 11 %, GST + RST 12 %); the formats still validate',
    JSON.stringify(ca.find(r => r.code === 'SK').salesTax) === JSON.stringify({ label: 'GST + PST', milli: 11000 }) && JSON.stringify(ca.find(r => r.code === 'MB').salesTax) === JSON.stringify({ label: 'GST + RST', milli: 12000 }) && STEP.AF.validateAddressFormats().length === 0, STEP.AF.validateAddressFormats())
  const en = JSON.parse(read('messages/en-GB.json'))
  t('the reason is a message (en-GB base): a select on the region\'s reason — language / taxLines', /\{reason, select, language \{: HatchGrab isn’t available in \{language\} yet\} taxLines \{: we’re adding separate GST and PST lines first\} other \{\}\}/.test(en.tradeArea.region_closed))

  // ══ 2 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('2 · TIME ZONES — the build says which tz data it runs on')
  const TZ = require('./check-tzdata.cjs')
  const independent = zone => { const f = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }); const m = /GMT([+-])(\d\d):(\d\d)/.exec(f.format(TZ.AT)); return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0 }
  t('its offsets agree with an independent reading (Intl longOffset) for every probe zone', TZ.PROBES.every(p => TZ.offsetMinutes(p.zone) === independent(p.zone)), TZ.PROBES.map(p => [p.zone, TZ.offsetMinutes(p.zone), independent(p.zone)]))
  const verdict = TZ.missingCanada2026().length === 0
  t(`on this machine (Node ${process.version}, tz ${process.versions.tz}): the changes are ${verdict ? 'present' : 'missing'} — and the check says so`, verdict === TZ.PROBES.every(p => independent(p.zone) === p.want))
  const run = spawnSync(process.execPath, [path.join(REPO, 'scripts/check-tzdata.cjs')], { encoding: 'utf8' })
  t('run as a script it prints the Node version, ICU and tz data and the verdict, and exits 0 (it never fails a build)', run.status === 0 && new RegExp(`check-tzdata: Node ${process.version.replace(/\./g, '\\.')}, ICU [\\d.]+, tz data \\S+ — the 2026 Canadian time-zone changes are (present|MISSING)`).test(run.stdout), run.stdout)
  t('it runs before every build: package.json prebuild = split-messages, then check-tzdata', JSON.parse(read('package.json')).scripts.prebuild === 'node scripts/split-messages.cjs && node scripts/check-tzdata.cjs')
  t('no app code changed for it: the runtime\'s tz data is the fix (docs/canada-2-report.md §2); no engines field or Node pin added', !('engines' in JSON.parse(read('package.json'))) && !fs.existsSync(path.join(REPO, '.nvmrc')))

  // ══ 3 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · THE TERMS — the Canada section after New Zealand')
  const FILE = 'content/legal/country-specific-terms.md'
  const B = read('scripts/fixtures/country-terms-before-canada.md'), A = read(FILE)
  const at = A.indexOf('\n## Canada\n')
  t('the fixture is the page anz-terms published (US, Ireland, Australia, New Zealand; dated 22 October 2026)', JSON.stringify([...B.matchAll(/^## (.+)$/gm)].map(m => m[1])) === JSON.stringify(['United States', 'Ireland', 'Australia', 'New Zealand']) && B.includes('**Last updated:** 22 October 2026'))
  t('everything before `## Canada` — the intro, US, Ireland, Australia and New Zealand — is byte-identical (the date is already the build date)', at > 0 && A.slice(0, at) === B, `${at} vs ${B.length} bytes`)   // A[at] is the blank line before `## Canada`
  for (const f of ['content/legal/terms-and-conditions.md', 'content/legal/privacy-policy.md']) t(`${f} is byte-identical (7fcd4fc9)`, read(f) === execFileSync('git', ['show', `7fcd4fc9:${f}`], { cwd: REPO, encoding: 'utf8' }))
  // ⚠️ RE-PINNED (france-1, 22 October 2026, docs/france-1-report.md §11): France's section follows Canada's, so Canada's section
  // ends where France's begins; everything checked below is Canada's own text, as before.
  const frAt = A.indexOf('\n## France\n')
  const C = A.slice(at + 1, frAt > at ? frAt : undefined)
  t('headings: … New Zealand, then Canada (then France); Canada has "For food truck operators" then "Privacy, for everyone in Canada"', JSON.stringify([...A.matchAll(/^## (.+)$/gm)].map(m => m[1])) === JSON.stringify(['United States', 'Ireland', 'Australia', 'New Zealand', 'Canada', 'France'])
    && JSON.stringify([...C.matchAll(/^### (.+)$/gm)].map(m => m[1])) === JSON.stringify(['For food truck operators', 'Privacy, for everyone in Canada']))
  const paras = C.split(/\n\s*\n/).map(p => p.trim()).filter(p => p && !p.startsWith('#'))
  t(`every paragraph opens with a bold label (${paras.length})`, paras.every(p => /^\*\*[^*]+\.\*\* /.test(p)))
  t('"Notices and governing law" and "Contact" are written out in full (no "as the Australian section")', !/as the Australian section/i.test(C) && C.includes('**Notices and governing law.** Notices work as section 12 of the Terms of Service says') && C.includes('England and Wales') && C.includes('**Contact.** privacy@hatchgrab.com, or by post to HatchGrab Ltd, Rosedale, Bury Road, Wickham Street, CB8 8PD, United Kingdom.'))
  t('the Quebec line names Saskatchewan and Manitoba too, each with its reason', C.includes('**Quebec, Saskatchewan and Manitoba.** HatchGrab is not available yet to trucks based in Quebec, because it is not yet available in French, or to trucks based in Saskatchewan or Manitoba, because we are adding separate GST and PST lines first.'))
  const points = ['merchant of record', 'consumer protection law of the province or territory', 'shown before tax', 'does not offer an online service fee in Canada', 'Tips are optional', 'GST, HST, or GST and PST', 'soft drinks or alcohol in British Columbia',
    'Canadian dollars', 'does not add a card surcharge', 'prepackaged food', 'Health Canada\'s priority allergens', 'GST/HST, give us your registration number', 'PIPEDA', 'British Columbia and Alberta', '30 days', 'www.priv.gc.ca', '1-800-282-1376',
    'real risk of significant harm', '10 business days']
  t(`the canada-1 §6 draft's points are all there (${points.length})`, points.every(p => C.includes(p)), points.filter(p => !C.includes(p)))
  const files = fs.readdirSync(path.join(REPO, 'content/legal'))
  t(`no "[FLAG" in any of content/legal's ${files.length} files`, files.every(f => !read(`content/legal/${f}`).includes('[FLAG')))
  const L = read('lib/legal.ts')
  t('the dates and TERMS_VERSION are the build date — 22 October 2026, which anz-terms had already set: the page, COUNTRY_TERMS_UPDATED and TERMS_VERSION agree',
    A.includes('**Last updated:** 22 October 2026') && L.includes("export const COUNTRY_TERMS_UPDATED = '22 October 2026'") && L.includes("export const TERMS_VERSION = '2026-10-22'"))
  const R = await kit.bundle('ca2-md-html', "export { renderLegalMarkdownHtml } from '@/lib/legal-markdown-html'")
  // ⚠️ RE-PINNED (france-1): …then France's section (docs/france-1-report.md §11).
  t('the page renders: the before-page\'s HTML, then the Canada section\'s (then France\'s); the country headings in order', R.renderLegalMarkdownHtml(A) === R.renderLegalMarkdownHtml(B) + R.renderLegalMarkdownHtml(C) + (frAt > at ? R.renderLegalMarkdownHtml(A.slice(frAt + 1)) : '')
    && /<h2[^>]*>New Zealand<\/h2>[\s\S]*<h2[^>]*>Canada<\/h2>/.test(R.renderLegalMarkdownHtml(A)))

  console.log(`\n${fail ? '🔴' : '✅'} canada-2: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
