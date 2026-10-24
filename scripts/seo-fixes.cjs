#!/usr/bin/env node
// scripts/seo-fixes.cjs — THE PROOF FOR seo-fixes (docs/seo-fixes-report.md): the invisible SEO fixes from the audit.
//
//   node scripts/seo-fixes.cjs        (≈ 1–2 min: esbuild bundles; NO NETWORK, NO DATABASE)
//
// LOCALHOST ONLY. Country rows are the seed migrations' (scripts/_country-settings-gb.cjs), the plan catalogue the plan
// migrations' (scripts/_plans-catalog-fixture.cjs); pages render on the render kit's in-memory database with the request
// (host, cookie) stubbed. The visible-change proof (before/after screenshots) and the curl head diff are in the report.
//
//   1  M1  the country switcher: real <a href> per option, in the server HTML while closed (hidden by CSS); US on →
//          /us links on /uk; US off → none
//   2  M4  the proxy matcher skips /_next/static and /_next/image, and still runs for every page and API path
//   3  M5 + S9  JSON-LD parses; Organization (logo, sameAs = the store links), WebSite, SoftwareApplication with
//          url = the page's own address; Offers per public plan in GBP on /uk, USD on /us (US on), from plan_prices
//   4  hreflang (US on): /uk and /us reciprocal and self-canonical; US off: no US alternate, /us is not served
//   5  S1 + S2 + N6  canonicals and og:url on the legal, contact, signup, login pages on BOTH hosts; signup/login noindex,
//          titles unchanged; the Village Foodie og:url is its www host (the sitemap's)
//   6  S3 + N3  robots per host: every old rule kept, Crawl-delay gone, each host's own sitemap
//   7  S5  sitemap: real lastmod (plan data / copy date / legal dates), legal + contact listed (HatchGrab host only),
//          xhtml alternates on the country pages
//   8  S4  <html lang>: the proxy's header (country page → its locale, legal → en-GB, nothing else), never trusted from
//          the client; the root layout falls back to "en"
//   9  S7  the static-markup serializer is byte-identical to react-dom/server for every legal document (and the plan
//          table as a wider fixture); one priority image; font preloads
//  10  N1  /compare's own title and description per country, still noindex
const fs = require('fs')
const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'seo-fixes' })
const { REPO, h } = kit
const LP1E = require('./_lp1e-fixtures.cjs')
const { seedCatalog } = require('./_plans-catalog-fixture.cjs')
// ⚠️ RE-PINNED (about-page, 22 October 2026, docs/about-page-report.md): the country menu is in the FOOTER only (Dominic took it
// out of the nav), so each page carries ONE menu list, not two; and the HatchGrab sitemap ends with /about.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS harness module (about-page)
const AP = require('./_lp-about-page.cjs')
const MENUS = AP.LANDED ? 1 : 2
const twice = xs => (MENUS === 2 ? [...xs, ...xs] : xs)

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 100 - s.length)))
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))
const HG = 'www.hatchgrab.com', VF = 'www.villagefoodie.co.uk'

const CATALOG = seedCatalog(REPO)
// The plan rows with the updated_at the sitemap reads (the migrations' tables carry it; the fixture rows did not).
const PLAN_AT = '2026-10-20T10:21:00.000Z', PRICE_US_AT = '2026-10-18T09:00:00.000Z'
const tablesAt = () => ({
  plans: CATALOG.plans.map(p => ({ ...snake(p), updated_at: '2026-10-19T12:00:00.000Z' })),
  plan_prices: CATALOG.prices.map(p => ({ ...snake(p), updated_at: p.countryCode === 'US' ? PRICE_US_AT : PLAN_AT })),
  plan_features: CATALOG.features.map(f => ({ ...snake(f), updated_at: '2026-10-17T08:00:00.000Z' })),
})

;(async () => {
  const ctx = LP1E.context(kit, REPO)
  const NAV = `export const useRouter = () => ({ push(){}, replace(){}, refresh(){}, back(){}, prefetch(){} })
export const usePathname = () => globalThis.__kitPathname ?? '/'
export const useSearchParams = () => new URLSearchParams('')
export function notFound() { throw new Error('notFound') }
export function redirect(to) { const e = new Error('redirect'); e.to = to; throw e }
export function permanentRedirect(to) { const e = new Error('redirect'); e.to = to; throw e }`
  const STUB = { stubs: { 'next/navigation': NAV } }
  const ROUTE = { landing: 'app/[country]/page', features: 'app/[country]/features/page', compare: 'app/[country]/compare/page' }
  const mods = {}
  const modOf = p => (mods[p] ||= ctx.bundle(`seo-${p}`, `export * from '@/${ROUTE[p]}'\nexport { default } from '@/${ROUTE[p]}'\nexport { clearPlanCatalogCache as __clearPlans } from '@/lib/plans-server'`, STUB))
  const slug = cc => (cc === 'GB' ? 'uk' : 'us')
  const props = cc => ({ params: Promise.resolve({ country: slug(cc) }), searchParams: Promise.resolve({}) })
  async function page(p, cc, usOn) {
    const M = await modOf(p)
    globalThis.__kitPathname = `/${slug(cc)}${p === 'landing' ? '' : '/' + p}`
    try {
      return await ctx.withReq({ rows: usOn ? ctx.ROWS.on() : ctx.ROWS.off(), tables: tablesAt() }, async () => { M.__clearPlans(); return ctx.prerender(h(M.default, props(cc))) })
    } catch (e) { return e && e.message === 'redirect' ? `REDIRECT ${e.to}` : `ERROR ${e && e.message}` }
  }
  async function meta(p, cc, usOn, host = HG) {
    const M = await modOf(p)
    try {
      return await ctx.withReq({ host, rows: usOn ? ctx.ROWS.on() : ctx.ROWS.off(), tables: tablesAt() }, async () => { M.__clearPlans(); return M.generateMetadata(props(cc), Promise.resolve({ openGraph: { siteName: 'HatchGrab' }, twitter: { card: 'summary_large_image' } })) })
    } catch (e) { return e && e.message === 'redirect' ? `REDIRECT ${e.to}` : `ERROR ${e && e.message}` }
  }

  // ══ 1 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('1 · M1 — the country switcher is crawlable')
  const ukOn = await page('landing', 'GB', true)
  const ukOff = await page('landing', 'GB', false)
  const featUkOn = await page('features', 'GB', true)
  // ⚠️ RE-PINNED (country-picker-1, 23 October 2026, docs/country-picker-1-report.md): the footer's picker is a trigger + a
  // closed "Choose your country" dialog — each country still a real <a href class="cc-item"> in the server HTML (now with its
  // lang, the current one aria-current, sorted by the English name: United Kingdom, United States), hidden by `.cc-dlg-closed`.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS harness module (country-picker-1)
  const PICKER = require('./_lp-country-picker.cjs')
  const items = html => [...String(html).matchAll(PICKER.LANDED ? /<a href="([^"]*)" lang="[^"]+"(?: aria-current="true")? class="cc-item"/g : /<a href="([^"]*)" role="menuitemradio"[^>]*class="cc-item"/g)].map(m => m[1])
  t(`US on: /uk carries <a href="/us"> (and /uk) as menu options, in the server HTML, ${MENUS === 2 ? 'in header AND footer' : 'in the footer (the nav has none)'}`, JSON.stringify(items(ukOn)) === JSON.stringify(twice(['/uk', '/us'])) && (!AP.LANDED || AP.navHasNoMenu(ukOn)), items(ukOn))
  t('…on /uk/features the options point at the EQUIVALENT page (/us/features)', JSON.stringify(items(featUkOn)) === JSON.stringify(twice(['/uk/features', '/us/features'])), items(featUkOn))
  t(PICKER.LANDED ? '…the closed box is hidden by CSS (`cc-dlg-closed`), not absent' : '…the closed menu is hidden by CSS (`cc-menu-closed`), not absent', PICKER.LANDED
    ? (String(ukOn).match(/class="cc-dlg cc-dlg-closed"/g) || []).length === 1 && /\.hg-landing \.cc-dlg-closed \{ display: none; \}/.test(read('app/landing/landing.css'))
    : (String(ukOn).match(/class="cc-menu cc-menu-closed"/g) || []).length === MENUS && /\.hg-landing \.cc-menu-closed \{ display: none; \}/.test(read('app/landing/landing.css')))
  t('US off: no /us link anywhere on /uk', JSON.stringify(items(ukOff)) === JSON.stringify(twice(['/uk'])) && !/href="\/us/.test(String(ukOff)), items(ukOff))
  const cm = read('components/landing/CountryMenu.tsx')
  t('the click is unchanged: it prevents the default navigation and runs the same `choose` (cookie + router)', /e\.preventDefault\(\); choose\(o\.code\)/.test(cm) && /keepCountry\(code\)/.test(cm) && /router\.push\(there \+ url\.search \+ url\.hash, \{ scroll: false \}\)/.test(cm))

  // ══ 2 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('2 · M4 — the proxy matcher')
  const src = /matcher: \[\s*'([^']+)'/.exec(read('proxy.ts'))[1]
  const re = new RegExp('^' + src + '$')
  t(`matcher is ${src}`, src === '/((?!_next/static|_next/image|favicon.ico|apple-touch-icon.png|logos|photos|sw.js|manifest.json|offline.html).*)')
  t('static assets and the image optimiser SKIP the proxy', ['/_next/static/chunks/a.js', '/_next/static/css/b.css', '/_next/static/media/c.woff2', '/_next/image'].every(p => !re.test(p)))
  t('every page and API path still RUNS it (so the session check and auth guards run)', ['/manage/tok', '/dashboard', '/dashboard/x', '/login', '/admin', '/api/manage', '/uk', '/', '/robots.txt', '/sitemap.xml', '/privacy'].every(p => re.test(p)))
  t('the auth guards are unchanged (/dashboard and /manage protected)', /pathname\.startsWith\('\/dashboard'\) && !isDemoDashboard\(pathname\)\) \|\|\s*pathname\.startsWith\('\/manage'\)/.test(read('proxy.ts')))

  // ══ 3 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · M5 + S9 — JSON-LD, from data')
  const usOnPage = await page('landing', 'US', true)
  const graphOf = html => { const ld = ctx.jsonLd(html); return { ld, g: (ld[0] && ld[0]['@graph']) || [] } }
  const uk = graphOf(ukOn), us = graphOf(usOnPage)
  // every JSON-LD block on every page rendered here parses (ctx.jsonLd returns the raw string when JSON.parse fails)
  const blocks = [ukOn, ukOff, usOnPage, featUkOn].flatMap(h2 => ctx.jsonLd(h2))
  t(`every JSON-LD block parses as JSON (${blocks.length} blocks)`, blocks.length >= 3 && blocks.every(b => typeof b === 'object' && b['@context'] === 'https://schema.org'))
  const byType = (g, ty) => g.find(n => n['@type'] === ty)
  const badges = read('lib/app-badges.ts')
  const APP_GB = /export const APP_STORE_URL = '([^']+)'/.exec(badges)[1], APP_ANY = /export const APP_STORE_URL_ANY_STOREFRONT = '([^']+)'/.exec(badges)[1], PLAY = /export const GOOGLE_PLAY_URL = '([^']+)'/.exec(badges)[1]
  const org = byType(uk.g, 'Organization')
  t('Organization: name, url, logo (the HatchGrab logo PNG), sameAs = the App Store (GB storefront) and Google Play links the site links', org && org.name === 'HatchGrab' && org.url === 'https://www.hatchgrab.com/' && org.logo === 'https://www.hatchgrab.com/logos/hatchgrab-logo.png'
    && JSON.stringify(org.sameAs) === JSON.stringify([APP_GB, PLAY]), org)
  t('…on /us the App Store link is the any-storefront one (as the US footer badge)', JSON.stringify(byType(us.g, 'Organization')?.sameAs) === JSON.stringify([APP_ANY, PLAY]))
  t('WebSite: name and url', (w => w && w.name === 'HatchGrab' && w.url === 'https://www.hatchgrab.com/')(byType(uk.g, 'WebSite')))
  const appUk = byType(uk.g, 'SoftwareApplication'), appUs = byType(us.g, 'SoftwareApplication')
  t('M5: SoftwareApplication url = the page\'s own address (/uk, /us), not the root', appUk?.url === 'https://www.hatchgrab.com/uk' && appUs?.url === 'https://www.hatchgrab.com/us', [appUk?.url, appUs?.url])
  const offers = a => (a?.offers || []).map(o => `${o.name}|${o.price}|${o.priceCurrency}|${o.priceSpecification?.unitCode}`)
  const want = (cc, cur) => CATALOG.plans.filter(p => p.isPublic && p.active).sort((a, b) => a.sortOrder - b.sortOrder)
    .map(p => { const pr = CATALOG.prices.find(x => x.planKey === p.key && x.countryCode === cc); return pr ? `${p.name}|${(pr.monthlyMinor / 100).toFixed(2)}|${cur}|MON` : null }).filter(Boolean)
  t('/uk Offers: one per public plan, GBP, the plan_prices amounts', JSON.stringify(offers(appUk)) === JSON.stringify(want('GB', 'GBP')), offers(appUk))
  t('/us (US on) Offers: USD, the US plan_prices amounts', JSON.stringify(offers(appUs)) === JSON.stringify(want('US', 'USD')), offers(appUs))
  t('/uk never carries a USD Offer, /us never a GBP one', !offers(appUk).some(o => /USD/.test(o)) && !offers(appUs).some(o => /GBP/.test(o)))
  t('US off: /us is not served (redirect) — so no USD Offer exists anywhere', /^REDIRECT/.test(await page('landing', 'US', false)) && !JSON.stringify(graphOf(ukOff).ld).includes('USD'))
  const sd = read('lib/structured-data.ts')
  t('no Offer for a price the page does not show (`pricesShown` false → none)', /if \(!pricesShown\) return \[\]/.test(sd) && /pricesShown: s\.enabled/.test(read('app/landing/page.tsx')))
  t('nothing typed: the graph reads BRANDS, HATCHGRAB_ORIGIN, HATCHGRAB_LOGO_PNG, the app-badge URLs and offerPlans', ['BRANDS.HATCHGRAB.name', 'HATCHGRAB_ORIGIN', 'HATCHGRAB_LOGO_PNG', 'appStoreUrlFor(countryCode)', 'GOOGLE_PLAY_URL', 'offerPlans(catalog, countryCode)'].every(x => sd.includes(x)) && !/['"](GBP|USD|Pro|Unlimited|Pay as you go|29|69)['"]/.test(sd))

  // ══ 4 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · hreflang — reciprocal and self-canonical')
  for (const p of ['landing', 'features']) {
    const mUk = await meta(p, 'GB', true), mUs = await meta(p, 'US', true), mOff = await meta(p, 'GB', false)
    const sfx = p === 'landing' ? '' : '/' + p
    t(`${p}: /uk self-canonical, /us self-canonical (US on)`, mUk?.alternates?.canonical === `https://www.hatchgrab.com/uk${sfx}` && mUs?.alternates?.canonical === `https://www.hatchgrab.com/us${sfx}`, [mUk?.alternates?.canonical, mUs?.alternates?.canonical])
    t(`${p}: both carry the same en-GB / en-US / x-default set (reciprocal)`, JSON.stringify(mUk?.alternates?.languages) === JSON.stringify(mUs?.alternates?.languages)
      && mUk?.alternates?.languages?.['en-GB'] === `https://www.hatchgrab.com/uk${sfx}` && mUk?.alternates?.languages?.['en-US'] === `https://www.hatchgrab.com/us${sfx}`, mUk?.alternates?.languages)
    t(`${p}: US off → no en-US alternate`, mOff?.alternates?.languages && !('en-US' in mOff.alternates.languages), mOff?.alternates?.languages)
  }

  // ══ 5 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('5 · S1 + S2 + N6 — canonicals, og:url, noindex')
  const P = {
    '/privacy': "app/(legal)/privacy/page", '/terms': "app/(legal)/terms/page", '/country-terms': "app/(legal)/country-terms/page",
    '/contact': 'app/contact/page', '/signup': 'app/signup/layout', '/login': 'app/login/layout',
  }
  const root = await ctx.bundle('seo-root', "export { generateMetadata } from '@/app/layout'", STUB)
  for (const [p, file] of Object.entries(P)) {
    const M = await ctx.bundle(`seo-meta-${p.slice(1)}`, `export * from '@/${file}'`, STUB)
    for (const host of [HG, VF]) {
      const m = await ctx.withReq({ host }, async () => M.generateMetadata({ searchParams: Promise.resolve({}) }))
      const r = await ctx.withReq({ host }, async () => root.generateMetadata())
      const label = `${p} on ${host === HG ? 'HatchGrab' : 'Village Foodie'}`
      // ⚠️ RE-PINNED (pricing-tidy, 20 October 2026 — decision 2): /contact on the Village Foodie host is a different, VF-branded
      // page, so it is SELF-canonical (https://www.villagefoodie.co.uk/contact); every other page keeps the HatchGrab URL.
      const own = p === '/contact' && host === VF ? `https://www.villagefoodie.co.uk${p}` : `https://www.hatchgrab.com${p}`
      t(`${label}: canonical and og:url = ${own}`, m?.alternates?.canonical === own && m?.openGraph?.url === own, { c: m?.alternates?.canonical, og: m?.openGraph?.url })
      const { url: _a, ...ogRest } = m.openGraph, { url: _b, ...rootRest } = r.openGraph
      t(`${label}: every other og field is the host's default, unchanged`, JSON.stringify(ogRest) === JSON.stringify(rootRest))
      if (p === '/signup' || p === '/login') t(`${label}: noindex (follow), and NO title or description of its own`, m.robots?.index === false && m.robots?.follow === true && !('title' in m) && !('description' in m))
    }
  }
  const vfRoot = await ctx.withReq({ host: VF }, async () => root.generateMetadata())
  t('N6: the Village Foodie og:url is https://www.villagefoodie.co.uk — the host its sitemap lists', vfRoot.openGraph.url === 'https://www.villagefoodie.co.uk')
  const hgRoot = await ctx.withReq({ host: HG }, async () => root.generateMetadata())
  t('the HatchGrab root og:url is unchanged (https://www.hatchgrab.com)', hgRoot.openGraph.url === 'https://www.hatchgrab.com')

  // ══ 6 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('6 · S3 + N3 — robots per host')
  const RB = await ctx.bundle('seo-robots', "export { default } from '@/app/robots'", STUB)
  // The static file as it stood before seo-fixes — pinned to c6c44c9e (the commit that work started from; HEAD no longer has it).
  const old = require('child_process').execSync('git show c6c44c9e:public/robots.txt', { cwd: REPO, encoding: 'utf8' })
  const oldRules = []; let ua = null
  for (const line of old.split('\n')) { const m = /^(User-agent|Disallow|Crawl-delay):\s*(.*)$/.exec(line.trim()); if (!m) continue; if (m[1] === 'User-agent') ua = m[2]; else oldRules.push(`${ua}|${m[1]}|${m[2]}`) }
  for (const [host, sm] of [[HG, 'https://www.hatchgrab.com/sitemap.xml'], [VF, 'https://www.villagefoodie.co.uk/sitemap.xml']]) {
    const r = await ctx.withReq({ host }, async () => RB.default())
    const now = r.rules.flatMap(x => [].concat(x.disallow).map(d => `${x.userAgent}|Disallow|${d}`))
    // ⚠️ RE-PINNED (ai-search-1, 21 October 2026, docs/ai-search-1-report.md): the HatchGrab host now ALLOWS the answer /
    // search bots and the training bots (Dominic's decision) — scripts/ai-search-1.cjs proves that policy exactly. Here:
    // every old rule it did not decide is still there (Bytespider, FacebookBot, anthropic-ai blocked; `*` keeps /api/ and
    // /trucks/), and the five training bots' old `Disallow: /` is gone. The Village Foodie host is checked as before.
    const AI1 = host === HG && fs.existsSync(path.join(REPO, 'lib/robots-policy.ts'))
    const nowFlat = r.rules.flatMap(x => [].concat(x.userAgent).flatMap(u => [].concat(x.disallow).map(d => `${u}|Disallow|${d}`)))
    const TRAIN = ['GPTBot', 'ClaudeBot', 'CCBot', 'Applebot-Extended', 'Google-Extended']
    if (AI1) t(`${host}: ai-search-1's named change — the old rules it did not decide are kept; the training bots are no longer blocked`,
      oldRules.filter(x => !/Crawl-delay/.test(x) && !TRAIN.some(b => x.startsWith(b + '|'))).every(x => nowFlat.includes(x)) && TRAIN.every(b => !nowFlat.includes(`${b}|Disallow|/`)), { now: nowFlat, old: oldRules })
    else t(`${host}: every old rule except Crawl-delay is kept, nothing added`, JSON.stringify(now) === JSON.stringify(oldRules.filter(x => !/Crawl-delay/.test(x))), { now, old: oldRules })
    t(`${host}: no Crawl-delay; Sitemap: ${sm}`, !JSON.stringify(r).includes('crawlDelay') && r.sitemap === sm)
  }
  t('public/robots.txt is gone (it would shadow app/robots.ts)', !fs.existsSync(path.join(REPO, 'public/robots.txt')))

  // ══ 7 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('7 · S5 — the sitemap')
  const SM = await ctx.bundle('seo-sitemap', "export { default } from '@/app/sitemap'", STUB)
  const smOn = await ctx.withReq({ host: HG, rows: ctx.ROWS.on(), tables: tablesAt() }, async () => SM.default())
  const smOff = await ctx.withReq({ host: HG, rows: ctx.ROWS.off(), tables: tablesAt() }, async () => SM.default())
  const smVf = await ctx.withReq({ host: VF, rows: ctx.ROWS.off(), tables: tablesAt() }, async () => SM.default())
  const urls = s => s.map(e => e.url)
  t(`HatchGrab (US off): /uk, /uk/features, /privacy, /terms, /country-terms, /contact${AP.LANDED ? ', /about (about-page)' : ''}`, JSON.stringify(urls(smOff)) === JSON.stringify(['/uk', '/uk/features', '/privacy', '/terms', '/country-terms', '/contact', ...(AP.LANDED ? ['/about'] : [])].map(p => 'https://www.hatchgrab.com' + p)), urls(smOff))
  t('US on: /us and /us/features join', urls(smOn).includes('https://www.hatchgrab.com/us') && urls(smOn).includes('https://www.hatchgrab.com/us/features'))
  const iso = d => (d instanceof Date ? d.toISOString() : d)
  const ukE = smOn.find(e => e.url.endsWith('/uk')), usE = smOn.find(e => e.url.endsWith('/us'))
  const copy = /MARKETING_COPY_UPDATED = '([^']+)'/.exec(read('lib/marketing-meta.ts'))[1]
  const latest = (...xs) => new Date(Math.max(...xs.map(x => Date.parse(x)))).toISOString()
  const settingsAt = cc => ctx.ROWS.on().find(r => r.countryCode === cc).updatedAt
  t(`/uk lastmod = the latest of the copy date, GB's plan data and its settings row (${iso(ukE.lastModified)})`, iso(ukE.lastModified) === latest(copy, PLAN_AT, settingsAt('GB')), [iso(ukE.lastModified), copy, PLAN_AT, settingsAt('GB')])
  t(`/us lastmod uses the US plan_prices date, not GB's (${iso(usE.lastModified)})`, iso(usE.lastModified) === latest(copy, PRICE_US_AT, '2026-10-19T12:00:00.000Z', '2026-10-17T08:00:00.000Z', settingsAt('US')))
  const lp = /export const PRIVACY_UPDATED = '([^']+)'/.exec(read('lib/legal.ts'))[1]
  t(`legal lastmod = the document's own "Last updated" (${lp})`, iso(smOff.find(e => e.url.endsWith('/privacy')).lastModified).startsWith('2026-10-19'))
  t('/contact has no lastmod (no content date exists) rather than request time', !('lastModified' in smOff.find(e => e.url.endsWith('/contact'))))
  t('no lastmod is the request time', smOn.every(e => !e.lastModified || iso(e.lastModified) !== new Date().toISOString()))
  t('country pages carry xhtml alternates — the same set as their <head> (US on: en-GB, en-US, x-default)', JSON.stringify(ukE.alternates?.languages) === JSON.stringify({ 'en-GB': 'https://www.hatchgrab.com/uk', 'en-US': 'https://www.hatchgrab.com/us', 'x-default': 'https://www.hatchgrab.com/' }), ukE.alternates)
  // ⚠️ RE-PINNED (compare-tidy F2, 20 October 2026): the VF sitemap also lists its self-canonical /contact (no lastmod).
  t('Village Foodie: its root and its /contact, on the www host (= its og:url host), no lastmod', JSON.stringify(smVf) === JSON.stringify([{ url: 'https://www.villagefoodie.co.uk/', changeFrequency: 'daily', priority: 1 }, { url: 'https://www.villagefoodie.co.uk/contact', changeFrequency: 'yearly', priority: 0.3 }]), smVf)

  // ══ 8 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('8 · S4 — <html lang>')
  const PL = await kit.bundle('seo-lang', "export { htmlLangOf, PAGE_LANG_HEADER } from '@/lib/page-lang'")
  t('the header value becomes lang when well formed; anything else → "en"', PL.htmlLangOf('en-GB') === 'en-GB' && PL.htmlLangOf('en-US') === 'en-US' && PL.htmlLangOf(null) === 'en' && PL.htmlLangOf('"><script>') === 'en' && PL.htmlLangOf('EN') === 'en')
  const px = read('proxy.ts')
  t('the proxy deletes any client-sent header FIRST, then sets it for a country page (its locale) or a legal document (en-GB)',
    px.indexOf('request.headers.delete(PAGE_LANG_HEADER)') > 0 && px.indexOf('request.headers.delete(PAGE_LANG_HEADER)') < px.indexOf('request.headers.set(PAGE_LANG_HEADER, row.locale)')
    && /if \(LEGAL_DOCUMENT_PATHS\.has\(pathname\)\) request\.headers\.set\(PAGE_LANG_HEADER, DEFAULT_LOCALE\)/.test(px)
    && px.indexOf('request.headers.delete(PAGE_LANG_HEADER)') < px.indexOf('let supabaseResponse = NextResponse.next({ request })'))
  t('the root layout reads it: <html lang={lang}>', /const lang = htmlLangOf\(requestHeaders\.get\(PAGE_LANG_HEADER\)\)/.test(read('app/layout.tsx')) && /<html lang=\{lang\} data-brand=\{brand\}>/.test(read('app/layout.tsx')))

  // ══ 9 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('9 · S7 — page weight')
  const SMK = await kit.bundle('seo-static', "export { staticMarkup } from '@/lib/static-markup'\nexport { renderLegalMarkdown } from '@/lib/legal-markdown'\nexport { PlanTable } from '@/components/pricing/PlanTable'")
  for (const f of ['privacy-policy', 'terms-and-conditions', 'country-specific-terms']) {
    const nodes = SMK.renderLegalMarkdown(read(`content/legal/${f}.md`))
    const mine = SMK.staticMarkup(nodes), react = kit.renderStatic(h('div', null, ...nodes)).replace(/^<div>|<\/div>$/g, '')
    t(`${f}: the serializer's HTML is byte-identical to react-dom/server's (${mine.length} chars)`, mine === react, (() => { let i = 0; const n = Math.min(mine.length, react.length); while (i < n && mine[i] === react[i]) i++; return [mine.slice(i - 40, i + 60), react.slice(i - 40, i + 60)] })())
  }
  const S2 = require('./_country-settings-gb.cjs')
  for (const [label, pr] of [['GB, Pro highlighted', { catalog: CATALOG, settings: S2.gbFromSeed(), highlight: 'pro' }], ['US, masked', { catalog: CATALOG, settings: { ...S2.usFromSeed(), enabled: true }, highlight: null, px: () => 'TBD' }]]) {
    const el = h(SMK.PlanTable, pr)
    t(`plan table (${label}) — a wider fixture: byte-identical too`, SMK.staticMarkup(el) === kit.renderStatic(el))
  }
  t('the legal pages render the static HTML into the SAME content div (no wrapper element)', ['privacy', 'terms', 'country-terms'].every(f => /<LegalPage html=\{renderLegalMarkdownHtml\(SOURCE\)\} \/>/.test(read(`app/(legal)/${f}/page.tsx`)))
    && /dangerouslySetInnerHTML=\{\{ __html: html \}\}/.test(read('components/legal/LegalPage.tsx')))
  const lp2 = read('app/landing/page.tsx')
  t('exactly ONE priority image on the landing — the dashboard screenshot (the LCP)', (lp2.match(/\bpriority \/>/g) || []).length === 1 && /landingScreenshot\('dashboard'[^\n]*priority \/>/.test(lp2))
  t('…the other two hero shots load eagerly at LOW fetch priority (React emits no preload for them)', ['kitchen', 'phone'].every(k => new RegExp(`landingScreenshot\\('${k}'[^\\n]*loading="eager" fetchPriority="low" />`).test(lp2)))
  t('the store badges are lazy (not preloaded)', (read('components/StoreBadges.tsx').match(/loading="lazy"/g) || []).length >= 2)
  t('fonts: Geist Mono and Courier Prime are not preloaded (still declared, so still loaded where used); Archivo, Public Sans and Geist are',
    /Geist_Mono\(\{[^}]*preload: false/.test(read('app/layout.tsx')) && !/Geist\(\{[^}]*preload: false/.test(read('app/layout.tsx'))
    && ['app/landing/page.tsx', 'app/features/page.tsx', 'app/compare/page.tsx', 'app/contact/HatchGrabContact.tsx'].every(f => /Courier_Prime\(\{[^}]*preload: false/.test(read(f)) && !/Archivo\(\{[^}]*preload: false/.test(read(f))))

  // ══ 10 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('10 · N1 — /compare\'s title and description')
  const cUk = await meta('compare', 'GB', false), cUs = await meta('compare', 'US', true)
  t('GB: "Cost calculator — HatchGrab UK", its own description, og/twitter the same', cUk?.title?.absolute === 'Cost calculator — HatchGrab UK' && typeof cUk.description === 'string' && cUk.description.length > 20 && cUk.openGraph?.title === cUk.title.absolute && cUk.twitter?.title === cUk.title.absolute, cUk?.title)
  t('US (on): "Cost calculator — HatchGrab US"', cUs?.title?.absolute === 'Cost calculator — HatchGrab US', cUs?.title)
  t('still noindex, nofollow', cUk?.robots?.index === false && cUk?.robots?.follow === false && cUs?.robots?.index === false)

  console.log(`\n${fail ? '🔴' : '✅'} seo-fixes: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
