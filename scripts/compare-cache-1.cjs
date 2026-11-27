#!/usr/bin/env node
// scripts/compare-cache-1.cjs — compare-cache-1 (Dominic, 27 November 2026; docs/compare-cache-1-report.md): the comparison pages and their
// .md / .json twins are CACHED for 30 days and refreshed only on demand, per country (tag comparison-<CC>). Proves, against the real modules
// (no network, no database):
//   1 · the page and twin route: no force-dynamic; revalidate = 2,592,000; rendered on first visit (no page built ahead); the public render
//       reads no header, cookie or query — the admin and ?view=… only in draft mode; the country's switches read through a cache tagged
//       ONLY comparison-<CC> (never marketing-countries);
//   2 · a page that is not live: a 404 for the public (what the cache keeps), the page for an admin in draft mode (never cached);
//   3 · the preview switch /api/compare/preview: admin only, a comparison address only, draft mode on / off, then the page;
//   4 · the host rule: a comparison address (page, twins, /api/compare/…) is a 404 on any host but HatchGrab's (proxy.ts);
//   5 · /api/revalidate: comparison-<CC> accepted and expired; anything else refused; the secret rules unchanged;
//   6 · the publish refreshes exactly the changed countries (changedCountries, shownFingerprint) — none when nothing changed;
//   7 · Admin › Countries saves refresh that country's page only; the callers post comparison-<CC> (+ marketing-countries on a live change).
require('./_harness-tmp.cjs') // tmp-cleanup-1
const fs = require('fs')
const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'compare-cache-1' })
const REPO = kit.REPO
const F = require('./_compare-de-1-fixtures.cjs')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const code = s => s.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
const PAGE = 'app/(public)/[country]/[section]/[slug]/page.tsx', TWIN = 'app/api/compare/[country]/[section]/[slug]/[format]/route.ts'

;(async () => {
  head('1 · the page and its twins: cached 30 days, the public render reads no request')
  const page = read(PAGE), twin = read(TWIN), server = read('lib/comparison-server.ts')
  t('the page is no longer force-dynamic; revalidate = 2592000 (30 days); dynamicParams true; no page built ahead (generateStaticParams → [])',
    !/force-dynamic/.test(code(page)) && /^export const revalidate = 2592000\b/m.test(page) && /^export const dynamicParams = true$/m.test(page) && /export function generateStaticParams\(\): Params\[\] \{ return \[\] \}/.test(page))
  t('the twin route too: no force-dynamic; revalidate = 2592000; no twin built ahead (generateStaticParams → [], which makes a GET handler cacheable in Next 16)',
    !/force-dynamic/.test(code(twin)) && /^export const revalidate = 2592000\b/m.test(twin) && /export function generateStaticParams\(\): \{ country: string; section: string; slug: string; format: string \}\[\] \{ return \[\] \}/.test(twin))
  t('the header and footer\'s country comes from the ADDRESS with no host read (resolveCountryAddress, as the built-ahead landing pages) — resolveVisitorCountry\'s host check read headers() and made every on-demand render fail (DYNAMIC_SERVER_USAGE) in the production build',
    /const visitor = await resolveCountryAddress\(p\.country, 'landing'\)/.test(page) && !/resolveVisitorCountry/.test(code(page)))
  t('the page reads no headers() or cookies(), and no host (proxy.ts has the host rule now)', !/\bheaders\(\)|\bcookies\(\)|isHatchGrabHost/.test(code(page)) && !/req\.headers\.get\('host'\)|isHatchGrabHost/.test(code(twin)))
  t('the admin is read ONLY in draft mode (page and twins)', /const preview = \(await draftMode\(\)\)\.isEnabled\n  return resolveComparison\(country, section, slug, async \(\) => preview && \(await adminUser\(\)\) !== null\)/.test(page)
    && /const preview = \(await draftMode\(\)\)\.isEnabled\n  const r = await resolveComparison\(country, section, slug, async \(\) => preview && \(await adminUser\(req\)\) !== null\)/.test(twin))
  t('…and the query only for an admin: the page awaits searchParams only after `!admin ||`; the twins read ?view only when admin and in draft mode',
    /const publicView = !admin \|\| \(await searchParams\)\.view === 'public'/.test(page) && (code(page).match(/searchParams\)/g) || []).length === 1
    && /r\.admin && preview && req\.nextUrl\.searchParams\.get\('view'\) === 'admin'/.test(twin) && (code(twin).match(/req\.nextUrl/g) || []).length === 1)
  t('the switches are read through a data cache tagged ONLY comparison-<CC> (so the cached page, a 404 included, carries that tag and no other)',
    /unstable_cache\(async \(\): Promise<ComparisonFlags> => \{[\s\S]{0,700}\}, \['compare-cache-1', 'flags', code, DEPLOYMENT_KEY\], \{ tags: \[comparisonTag\(code\)\], revalidate: COMPARISON_REVALIDATE_SECONDS \}\)\(\)/.test(server)
    && /const flags = await taggedFlags\(code\)/.test(server))
  t('no comparison route names marketing-countries (or any marketing tag), and the page never switches on the marketing render (whose reads carry marketing tags)',
    ![page, twin].some(s => /marketing-countries|MARKETING_TAGS|markMarketingRender/.test(code(s))) && !/markMarketingRender/.test(code(server)))
  t('outside Next (a harness, a script) the switches are read uncached; any real failure is thrown, so a cached page keeps its last good version',
    /if \(e instanceof Error && \/incrementalCache missing\/\.test\(e\.message\)\) return comparisonFlagsOf\(code\)\n    throw e/.test(server))

  head('2 · a page that is not live: 404 for the public (the cached answer), the page for an admin in draft mode')
  const R = await F.renderer(kit, 'cc1')
  const anon = await R.page({ status: 'admin' }), adm = await R.page({ status: 'admin', admin: true })
  t('status admin, the public render (no draft mode): 404 — the page is never served to the public', anon.notFound && !anon.html)
  t('status admin, an admin in draft mode: the page, with the admin banner', !adm.notFound && /data-admin-banner/.test(adm.html))
  const live = await R.page({ status: 'live' })
  t('status live, the public render: the page, with no admin banner', !live.notFound && !/data-admin-banner/.test(live.html))
  const tw = await R.twin('md', { status: 'admin' }), twA = await R.twin('md', { status: 'admin', admin: true })
  t('the .md twin: 404 for the public while not live; an admin in draft mode gets it, private, no-store', tw.status === 404 && twA.status === 200 && twA.headers['cache-control'] === 'private, no-store')

  head('3 · the preview switch: /api/compare/preview')
  const STATE = 'globalThis.__ccDraft ??= { on: false, calls: [] }'
  const P = await kit.bundle('cc1-preview', "export { GET } from '@/app/api/compare/preview/route'", { stubs: {
    'next/headers': `${STATE}\nexport async function draftMode() { const s = globalThis.__ccDraft; return { get isEnabled() { return s.on }, enable() { s.on = true; s.calls.push('enable') }, disable() { s.on = false; s.calls.push('disable') } } }\nexport async function headers() { return new Map() }\nexport async function cookies() { return { get() {}, getAll() { return [] } } }`,
    '@/lib/auth/admin': 'export async function adminUser() { return globalThis.__ccAdmin ? { id: "a", email: null } : null }\nexport async function verifyAdmin() { return !!globalThis.__ccAdmin }',
  } })
  const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
  const call = async (q, admin) => { globalThis.__ccAdmin = admin; globalThis.__ccDraft = { on: false, calls: [] }
    const r = await P.GET(new NextRequest(`http://hatchgrab.localhost:3000/api/compare/preview${q}`))
    return { status: r.status, location: r.headers.get('location'), cc: r.headers.get('cache-control'), calls: globalThis.__ccDraft.calls } }
  const no = await call('?to=/de/vergleich/foodtruck-bestellsystem', false)
  t('not an admin: 404 and NO draft cookie', no.status === 404 && no.calls.length === 0, no)
  const ok = await call('?to=/de/vergleich/foodtruck-bestellsystem', true)
  t('an admin, a comparison address: draft mode on, then 307 to that page (private, no-store)', ok.status === 307 && /\/de\/vergleich\/foodtruck-bestellsystem$/.test(ok.location) && ok.calls.join() === 'enable' && ok.cc === 'private, no-store', ok)
  const md = await call('?to=/de/vergleich/foodtruck-bestellsystem.md', true)
  t('…its .md twin is a comparison address too', md.status === 307 && md.calls.join() === 'enable', md)
  const bad = await Promise.all(['?to=https://evil.example/de/vergleich/x', '?to=//evil.example/de/vergleich/x', '?to=/trucks/a/b', '?to=/dashboard', ''].map(q => call(q, true)))
  t('an admin, anything but a comparison address (another site, //host, any other path, none): 400, no cookie — never an open redirect', bad.every(b => b.status === 400 && b.calls.length === 0), bad)
  const off = await call('?to=/de/vergleich/foodtruck-bestellsystem&off=1', true)
  t('?off=1: draft mode off, then the page (the public, cached view)', off.status === 307 && off.calls.join() === 'disable', off)

  head('4 · the host rule (proxy.ts): a comparison address exists only on a HatchGrab host')
  const H = await kit.bundle('cc1-host', "export { comparisonBlockedOnHost } from '@/lib/comparison-flags'")
  const cases = [
    ['www.villagefoodie.co.uk', '/de/vergleich/foodtruck-bestellsystem', true], ['villagefoodie.co.uk', '/uk/comparison/food-truck-ordering-system.md', true],
    ['www.villagefoodie.co.uk', '/uk/comparison/food-truck-ordering-system.json', true], ['www.villagefoodie.co.uk', '/api/compare/uk/comparison/food-truck-ordering-system/md', true],
    ['www.villagefoodie.co.uk', '/api/compare/preview', true], ['someone.example', '/fr/comparatif/logiciel-de-commande-food-truck', true],
    ['www.hatchgrab.com', '/de/vergleich/foodtruck-bestellsystem', false], ['hatchgrab.com', '/uk/comparison/food-truck-ordering-system.md', false],
    ['hatchgrab.localhost:3000', '/uk/comparison/food-truck-ordering-system', false], ['village-foodie-git-x-hatchgrab.vercel.app', '/api/compare/preview', false],
    ['www.villagefoodie.co.uk', '/venues/the-green', false], ['www.villagefoodie.co.uk', '/uk', false], ['www.villagefoodie.co.uk', '/uk/features', false], ['www.villagefoodie.co.uk', '/trucks/a/order', false],
  ]
  const wrong = cases.filter(([h, p, want]) => H.comparisonBlockedOnHost(h, p) !== want)
  t(`${cases.length} host × path cases: blocked exactly on a non-HatchGrab host for a comparison address, its twins and /api/compare/…`, !wrong.length, wrong)
  const proxy = read('proxy.ts')
  t('proxy.ts answers that with a bare 404, before the Village Foodie redirects', /if \(comparisonBlockedOnHost\(host, pathname\)\) return new NextResponse\('Not found', \{ status: 404 \}\)/.test(proxy)
    && proxy.indexOf('comparisonBlockedOnHost(host, pathname)') < proxy.indexOf('const isVillageFoodie ='))

  head('5 · /api/revalidate: the comparison tags, the same secret')
  const RV = await kit.bundle('cc1-revalidate', "export { POST } from '@/app/api/revalidate/route'", { stubs: {
    'next/cache': 'globalThis.__ccTags ??= []\nexport function revalidateTag(t) { globalThis.__ccTags.push(t) }\nexport function unstable_cache(f) { return f }\nexport function revalidatePath() {}',
  } })
  const post = async (body, secret = 's3cret') => { globalThis.__ccTags = []
    const r = await RV.POST(new NextRequest('http://hatchgrab.localhost:3000/api/revalidate', { method: 'POST', headers: { 'content-type': 'application/json', ...(secret ? { 'x-revalidate-secret': secret } : {}) }, body: JSON.stringify(body) }))
    return { status: r.status, tags: globalThis.__ccTags.slice() } }
  process.env.REVALIDATE_SECRET = 's3cret'
  const one = await post({ tags: ['comparison-GB'] })
  t('comparison-GB: 200, and only that tag expired', one.status === 200 && JSON.stringify(one.tags) === '["comparison-GB"]', one)
  const mix = await post({ tags: ['comparison-FR', 'marketing-countries', 'comparison-FR'] })
  t('…with a marketing tag: both expired, each once', mix.status === 200 && mix.tags.sort().join() === 'comparison-FR,marketing-countries', mix)
  const refused = await Promise.all([['comparison-gb'], ['comparison-GBR'], ['comparison-'], ['comparison-G1'], ['comparisonGB'], ['other'], []].map(tags => post({ tags })))
  t('refused (400, nothing expired): lower case, three letters, empty, a digit, no dash, any other tag, none', refused.every(r => r.status === 400 && !r.tags.length), refused)
  const many = await post({ tags: Array.from({ length: 301 }, () => 'comparison-GB') })
  t('more than 300 tags: 400', many.status === 400 && !many.tags.length)
  const wrongSecret = await post({ tags: ['comparison-GB'] }, 'nope'), noSecret = await post({ tags: ['comparison-GB'] }, null)
  delete process.env.REVALIDATE_SECRET
  const unset = await post({ tags: ['comparison-GB'] })
  t('a wrong or missing secret: 401; REVALIDATE_SECRET unset: 503 — nothing expired', wrongSecret.status === 401 && noSecret.status === 401 && unset.status === 503 && ![wrongSecret, noSecret, unset].some(r => r.tags.length))

  head('6 · the publish refreshes exactly the changed countries')
  const L = await kit.bundle('cc1-publish', "export { changedCountries, shownFingerprint } from '@/lib/comparison-publish-run'")
  const S = (id, planId, fp) => ({ competitorId: id, planId, ...(fp ? { fp } : {}) })
  const M = o => new Map(Object.entries(o))
  const base = { GB: { live: true, shown: [S('a', 'pa', 'f1'), S('b', 'pb', 'f2')] }, FR: { live: true, shown: [S('c', 'pc', 'f3')] }, DE: { live: false, shown: [] } }
  const same = L.changedCountries(M(base), M(base))
  t('nothing changed → no country refreshed, no live change', same.codes.length === 0 && same.liveChanged === false, same)
  const d = (gb, o = {}) => L.changedCountries(M(base), M({ ...base, GB: gb, ...o }))
  t('a price or answer changed (the fingerprint) → that country only', JSON.stringify(d({ live: true, shown: [S('a', 'pa', 'f1x'), S('b', 'pb', 'f2')] }).codes) === '["GB"]')
  t('another plan shown → that country', JSON.stringify(d({ live: true, shown: [S('a', 'pa2', 'f1'), S('b', 'pb', 'f2')] }).codes) === '["GB"]')
  t('the line-up changed (one out, or the order) → that country', JSON.stringify(d({ live: true, shown: [S('a', 'pa', 'f1')] }).codes) === '["GB"]' && JSON.stringify(d({ live: true, shown: [S('b', 'pb', 'f2'), S('a', 'pa', 'f1')] }).codes) === '["GB"]')
  const down = d({ live: false, shown: [] }), up = L.changedCountries(M(base), M({ ...base, DE: { live: true, shown: [S('d', 'pd', 'f4')] } }))
  t('a take-down (live → not live) → that country, at once, and liveChanged; a country going live the same', JSON.stringify(down.codes) === '["GB"]' && down.liveChanged && JSON.stringify(up.codes) === '["DE"]' && up.liveChanged, { down, up })
  const old = L.changedCountries(M({ GB: { live: true, shown: [S('a', 'pa'), S('b', 'pb')] } }), M({ GB: base.GB }))
  t('an earlier row with no fingerprint (written before compare-cache-1) and the same line-up → no change by itself', old.codes.length === 0, old)
  t('not live before and after → nothing (the page is a 404 either way)', L.changedCountries(M({ DE: { live: false, shown: [S('x', 'p')] } }), M({ DE: { live: false, shown: [] } })).codes.length === 0)
  const comp = { name: 'A', website: 'https://a.example', focus: 'food_truck', category: 'food_truck' }
  const plan = { planName: 'Free', currency: 'GBP', monthlyMinor: 0, yearlyOnly: false, priceHidden: false, setupMinor: 0, truckFeeBps: 0, truckFeeFixedMinor: 0, customerFeeBps: 0,
    customerFeeFixedMinor: 0, cardMode: 'bundled', cardBps: 140, cardFixedMinor: 25, vat: 'unknown', unclear: false, sourceUrl: 'https://a.example/p', checkedOn: '2026-11-26', notes: 'x' }
  const ans = [{ featureKey: 'ahead', countryCode: null, value: 'yes', note: null, quote: 'Order ahead.', sourceUrl: 'https://a.example', checkedOn: '2026-11-26', verifiedAt: null }]
  const fp = o => L.shownFingerprint({ competitor: comp, entry: { chooseWhen: null }, plan, answers: ans, shownAnswer: () => true, ...o })
  t('the fingerprint: stable for the same inputs; it changes with the price, the card rate, the checked date, an answer, or the answer being shown',
    fp() === fp() && fp() !== fp({ plan: { ...plan, monthlyMinor: 100 } }) && fp() !== fp({ plan: { ...plan, cardBps: 150 } }) && fp() !== fp({ plan: { ...plan, checkedOn: '2026-11-27' } })
    && fp() !== fp({ answers: [{ ...ans[0], value: 'partial' }] }) && fp() !== fp({ shownAnswer: () => false }))
  t('…and not with what the page never shows (the plan\'s internal note)', fp() === fp({ plan: { ...plan, notes: 'changed' } }))
  const run = read('lib/comparison-publish-run.ts')
  t('runPublish calls the refresh with exactly the changed countries that have a page — and not at all when none', /const refreshed = diff\.codes\.filter\(code => \{ const c = countries\.find\(x => x\.code === code\); return !!c && d\.hasPage\(code, c\.locale\) \}\)/.test(run)
    && /const revalidated = refreshed\.length && d\.revalidate \? await d\.revalidate\(refreshed, diff\.liveChanged\) : null/.test(run))

  head('7 · Admin › Countries saves; the callers')
  const ac = read('app/api/admin/countries/route.ts'), acc = read('app/api/admin/countries/comparison/route.ts')
  t('a country save, add or removal refreshes THAT country\'s comparison page (its code from the request body)', /if \(typeof code === 'string'\) revalidateComparison\(\[code\], 'admin\/countries'\)/.test(ac)
    && ['saveCountry', 'addCountry', 'removeCountry'].every(fn => new RegExp(`${fn}\\(serviceCountryStore, b[^)]*\\)[^\\n]*, true, b\\.code\\)`).test(ac)))
  t('the comparison switches (status, Admin\'s off, auto-publish) refresh that country\'s page', (acc.match(/revalidateComparison\(\[code\], /g) || []).length === 2)
  const CS = await kit.bundle('cc1-server', "export { revalidateComparison } from '@/lib/comparison-server'", { stubs: {
    'next/cache': 'globalThis.__ccTags ??= []\nexport function revalidateTag(t) { globalThis.__ccTags.push(t) }\nexport function unstable_cache(f) { return f }\nexport function revalidatePath() {}' } })
  globalThis.__ccTags = []; CS.revalidateComparison(['gb', 'GB', ' fr ', 'xx1', ''], 'test')
  t('revalidateComparison: each country once, upper-cased, only two-letter codes → comparison-GB, comparison-FR', JSON.stringify(globalThis.__ccTags) === '["comparison-GB","comparison-FR"]', globalThis.__ccTags)
  const pubMain = read('scripts/comparison-publish/main.ts'), ccMain = read('scripts/competitor-check/main.ts')
  t('both callers post comparison-<CC> for the changed countries, and marketing-countries only when a live status changed',
    [pubMain, ccMain].every(s => /tags: \[\.\.\.codes\.map\(comparisonTag\), \.\.\.\(liveChanged \? \['marketing-countries'\] : \[\]\)\]/.test(s)))
  t('the one-off publish: the dry run says which pages it WOULD refresh, and a real run refreshes only when there are some', /pages\$\{dryRun \? ' that would be' : ''\} refreshed: /.test(pubMain) && /if \(!dryRun && refresh\.length\) await revalidate\(refresh, p\.liveChanged === true, log\)/.test(pubMain))
  t('scripts/db-migrate.cjs refreshes no comparison page (it names only the marketing tags)', !/comparison-/.test(read('scripts/db-migrate.cjs')) && !/comparison-/.test(read('scripts/revalidate-pages.cjs').replace(/\/\/[^\n]*/g, '')))

  head('8 · Admin › Billing and Admin › Pricing check saves refresh their countries (appendix, Dominic 27 Nov)')
  const REFRESH = 'export function revalidateComparison(codes, why) { (globalThis.__ccRefresh ??= []).push(...codes) }\nexport async function liveComparisonCodes() { return ["GB", "FR", "DE", "US"] }'
  const ADMIN = 'export async function adminUser() { return globalThis.__ccAdmin ? { id: "a", email: "a@x" } : null }\nexport async function verifyAdmin() { return !!globalThis.__ccAdmin }'
  {
    const BI = await kit.bundle('cc1-billing', "export { PUT } from '@/app/api/admin/billing/route'", { stubs: {
      '@/lib/auth/admin': ADMIN, '@/lib/comparison-server': REFRESH,
      '@/lib/billing/store': 'export async function serverBillingStore() { return { countryBilling: async c => globalThis.__ccBillingRow ?? null, saveCountryBilling: async row => ({ ...row, updatedAt: "now" }) } }',
      '@/lib/country-settings': 'export async function listCountrySettings() { return [{ countryCode: "GB", name: "United Kingdom", platformFeeAllowed: true }, { countryCode: "FR", name: "France", platformFeeAllowed: true }] }\nexport function clearCountrySettingsCache() {}',
      '@/lib/marketing-cache': 'export function revalidateMarketing() {}',
    } })
    const put = async (body, { admin = true, row = null } = {}) => { globalThis.__ccAdmin = admin; globalThis.__ccRefresh = []; globalThis.__ccBillingRow = row
      const r = await BI.PUT(new NextRequest('http://hatchgrab.localhost:3000/api/admin/billing', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
      return { status: r.status, refreshed: globalThis.__ccRefresh.slice() } }
    const good = { countryCode: 'GB', paymentModel: 'fee_from_payment', postPaySurchargeBps: 0, postPaySurchargeFixedMinor: 0, minChargeMinor: 0, lateFeeMinor: 0 }
    const b1 = await put(good), b2 = await put({ ...good, countryCode: 'FR', paymentModel: 'billed_at_truck' })
    t('Admin › Billing: a saved country model refreshes THAT country\'s comparison page only (GB → comparison-GB; FR → comparison-FR)', b1.status === 200 && JSON.stringify(b1.refreshed) === '["GB"]' && b2.status === 200 && JSON.stringify(b2.refreshed) === '["FR"]', [b1, b2])
    const bad = await put({ ...good, postPaySurchargeBps: -1 }), anon = await put(good, { admin: false }), stale = await put(good, { row: { countryCode: 'GB' } })
    t('…nothing is refreshed when the save does not happen: invalid (400), not an admin (401), a stale row (409)', bad.status === 400 && anon.status === 401 && stale.status === 409 && ![bad, anon, stale].some(x => x.refreshed.length), [bad, anon, stale])
  }
  {
    const PC = await kit.bundle('cc1-pricing', "export { POST } from '@/app/api/admin/pricing-check/route'", { stubs: {
      '@/lib/auth/admin': ADMIN, '@/lib/comparison-server': REFRESH,
      '@/lib/admin/pricing-check-store': `export class TablesMissing extends Error {}
        export async function readDataImports() { return [] }
        const S = () => globalThis.__ccStore
        export const servicePricingStore = {
          async listEntries() { return S().entries.map(e => ({ ...e })) },
          async updateCompetitor(id, cols) { const c = S().competitors.find(x => x.id === id); return c ? { ...c, ...cols } : null },
          async updateEntry(id, cols) { const e = S().entries.find(x => x.id === id); if (!e) return null; Object.assign(e, cols); return { ...e } },
          async deleteEntry(id) { S().entries = S().entries.filter(e => e.id !== id) },
          async setPlanVerified(id, at, by) { const p = S().plans.find(x => x.id === id); return p ? { ...p, verified_at: at, verified_by: by } : null },
          async setPlanAutoBlocked(id, b) { const p = S().plans.find(x => x.id === id); return p ? { ...p, auto_blocked: b } : null },
          async currentBenchmark() { return null },
          async insertBenchmark(row) { return { id: 'b1', ...row, superseded_at: null, created_at: 'now' } },
          async features() { return [{ key: 'ahead', group_key: 'ordering', sort_order: 1, checked: true, show_scope: 'all', show_countries: [], hatchgrab_source: 'builtin', labels: {}, explanations: {}, updated_at: 'now' }] },
          async updateFeature(key, cols) { return key === 'ahead' ? { key, group_key: 'ordering', sort_order: 1, checked: true, show_scope: 'all', show_countries: [], hatchgrab_source: 'builtin', labels: {}, explanations: {}, ...cols } : null },
        }`,
    } })
    const plan = { id: 'p1', competitor_id: 'c1', country_code: 'GB', plan_name: 'Free', currency: 'GBP', price_hidden: false, monthly_minor: 0, yearly_only: false, setup_minor: 0,
      truck_fee_bps: 0, truck_fee_fixed_minor: 0, customer_fee_bps: 0, customer_fee_fixed_minor: 0, card_mode: 'unknown', card_bps: null, card_fixed_minor: null, card_rate_assumed: true,
      order_cap: null, included_orders: null, overage_fixed_minor: null, vat: 'unknown', status: 'counted', unclear: false, second_hand: false, source: 'research', source_url: null,
      checked_on: '2026-11-27', verified_at: null, verified_by: null, notes: null, superseded_at: null, created_at: 'now' }
    const fresh = () => ({ competitors: [{ id: 'c1', name: 'C1', website: 'https://c1.example', focus: 'food_truck', lifecycle: 'active' }, { id: 'c2', name: 'C2', website: 'https://c2.example', focus: 'food_truck', lifecycle: 'active' }],
      plans: [plan], entries: [{ id: 'e1', country_code: 'GB', competitor_id: 'c1', sort_order: 1 }, { id: 'e2', country_code: 'FR', competitor_id: 'c1', sort_order: 1 }, { id: 'e3', country_code: 'DE', competitor_id: 'c2', sort_order: 1 }] })
    const post = async (body, { admin = true } = {}) => { globalThis.__ccAdmin = admin; globalThis.__ccRefresh = []; globalThis.__ccStore = fresh()
      const r = await PC.POST(new NextRequest('http://hatchgrab.localhost:3000/api/admin/pricing-check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
      return { status: r.status, refreshed: [...new Set(globalThis.__ccRefresh)].sort() } }
    const cat = await post({ action: 'competitor_category', competitorId: 'c1', category: 'food_truck' })
    t('Pricing check, a competitor save (its category): every country where it has an entry — GB and FR, not DE', cat.status === 200 && JSON.stringify(cat.refreshed) === '["FR","GB"]', cat)
    const ver = await post({ action: 'verify', id: 'p1' })
    t('…a plan save (Mark verified): the plan\'s competitor\'s countries (GB, FR)', ver.status === 200 && JSON.stringify(ver.refreshed) === '["FR","GB"]', ver)
    const flags = await post({ action: 'entry_flags', id: 'e3', hidden: true })
    t('…an entry save (hide): that competitor\'s countries (DE)', flags.status === 200 && JSON.stringify(flags.refreshed) === '["DE"]', flags)
    const rm = await post({ action: 'entry_remove', id: 'e1' })
    t('…an entry removed (it returns no row): the countries it was in, read before the save (GB, FR)', rm.status === 200 && JSON.stringify(rm.refreshed) === '["FR","GB"]', rm)
    const bench = await post({ action: 'edit_benchmark', countryCode: 'GB', fields: { currency: 'GBP', mealMinor: 1600, eurRate: 0.84, eurRateDate: '2026-11-27' } })
    // ⚠️ RE-PINNED (compare-cache-1 appendix 2, Dominic 27 Nov): the country data now refreshes that country's page.
    t('…the country data (edit_benchmark: meal price, exchange rate) refreshes THAT country only (GB)', bench.status === 200 && JSON.stringify(bench.refreshed) === '["GB"]', bench)
    const feat = await post({ action: 'feature_update', key: 'ahead', showScope: 'hidden' })
    t('…a feature-list save refreshes EVERY live country\'s page (here GB FR DE US, from liveComparisonCodes)', feat.status === 200 && JSON.stringify(feat.refreshed) === '["DE","FR","GB","US"]', feat)
    const featBad = await post({ action: 'feature_update', key: 'nope', showScope: 'hidden' }), benchBad = await post({ action: 'edit_benchmark', countryCode: 'GB', fields: { currency: 'GBP' } })
    t('…and nothing when either fails (an unknown feature 404; a new country\'s data missing its meal price 400)', featBad.status === 404 && benchBad.status === 400 && !featBad.refreshed.length && !benchBad.refreshed.length, [featBad, benchBad])
    const gone = await post({ action: 'entry_update', id: 'nope', fields: { chooseWhen: 'x' } }), anonP = await post({ action: 'competitor_category', competitorId: 'c1', category: null }, { admin: false })
    t('…nothing refreshed when the save fails (an entry that is gone, 404) or the caller is not an admin (404)', gone.status === 404 && anonP.status === 404 && !gone.refreshed.length && !anonP.refreshed.length, [gone, anonP])
  }
  t('pricing-copy-4\'s rule holds: lib/comparison.ts names no paymentModel — buildFit takes the helper\'s own parameter type (offersOnlineCardPayments)',
    !/paymentModel/.test(read('lib/comparison.ts')) && /settings: Parameters<typeof offersOnlineCardPayments>\[0\] & Pick<CountrySettings, 'locale'>/.test(read('lib/comparison.ts')))
  t('both screens\' saves call the same refresh as Admin › Countries (revalidateComparison, lib/comparison-server.ts)',
    /revalidateComparison\(\[code as string\], 'admin\/billing country model'\)/.test(read('app/api/admin/billing/route.ts')) && /revalidateComparison\(codes, `admin\/pricing-check \$\{String\(body\.action\)\}`\)/.test(read('app/api/admin/pricing-check/route.ts')))

  console.log(`\n${fail ? '🔴' : '✓'} compare-cache-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
