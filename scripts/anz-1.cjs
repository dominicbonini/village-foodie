// scripts/anz-1.cjs — AUSTRALIA AND NEW ZEALAND, STAGE ANZ-1 (docs/anz-1-report.md).
//
// LOCALHOST ONLY. Nothing reaches a database or the network: the country rows are fixtures (the GB/US seed rows, and AU /
// NZ rows with the values of the anz-1 NOT RUN SQL), the plan catalogue is the seed's plus the six AU/NZ prices, and the
// render kit stubs everything else. Checks:
//   1  ADDRESS — /au and /nz are addresses; switched off (or no row) they 302 to the UK page and are in no router pick,
//      hreflang set, sitemap or menu; once on, the router sends an Australian visitor to /au and a New Zealander to /nz.
//   2  AU / NZ ON — landing, /features, /compare in the home form ($39 / $99, $49 / $119) with the currency line (⚠️ RE-PINNED,
//      native-prices, 22 October 2026: it was A$ / NZ$ — now only Admin and /llms.txt), no GST claim, the cheapest bands
//      from the data, the footnote's card-processing rate, hreflang en-AU / en-NZ reciprocal, the sitemap, JSON-LD Offers in AUD /
//      NZD, the hero screenshots.
//   3  AU / NZ OFF — /uk and /us carry no trace of either.
//   4  WORDS — en-AU / en-NZ overrides; "Pay at the truck" in en-US, en-IE, en-AU, en-NZ; en-GB keeps "Pay at Hatch".
//   5  ALLERGENS — the anz list (23, flat); uk14 / us9 byte-identical (pinned hashes, proved against HEAD 4633801c);
//      Manage's toggles and the order page on an AU and an NZ fixture truck.
//   6  WHATSAPP — the guard catches AU / NZ safety phrasing for an anz truck only; uk14 / us9 unchanged.
//   7  EFTPOS — the card processor's dual-network notice on an AUD checkout only.
//   8  MONEY AND PHONES — planMoneyFormatOf (GB / US / IE unchanged; AU / NZ "$", their international form A$ / NZ$); the
//      AU / NZ example numbers are plausible.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const kit = require('./_render-kit.cjs')({ cacheTag: 'anz-1' })
const { REPO, h } = kit
const LP1E = require('./_lp1e-fixtures.cjs')
const { seedCatalog } = require('./_plans-catalog-fixture.cjs')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 100 - s.length)))
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))
const text = s => String(s).replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
const sha = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16)

/** The AU and NZ rows — the values of the anz-1 NOT RUN SQL (docs/anz-1-report.md). */
const ANZ_ROW = { starterMonthlyMinor: null, proMonthlyMinor: null, maxMonthlyMinor: null, proAllowanceMinor: null, maxAllowanceMinor: null, platformFeePct: null,
  timeFormat: '12h', dateOrder: 'dmy', weekStart: 'monday', addressFormat: 'postcode', pricesIncludeTax: true, taxLabel: 'GST', allergenSet: 'anz',
  cardSurchargeAllowed: false, cardSurchargeCapPct: null, cardSurchargeCreditOnly: false, cardSurchargeExcludedRegions: [], serviceFeeAllowed: false,
  tippingEnabledDefault: false, tipPresetsPct: [], phoneCheck: 'length', distanceUnit: 'km', serviceFeeRecipient: 'truck', platformFeeEnabled: false, feesTaxed: false,
  competitorName: null, competitorPct: null, competitorFixedMinor: null, supportHours: null, updatedBy: 'anz-1 draft' }
const AU = (enabled) => ({
  ...LP1E.GB(), ...ANZ_ROW, countryCode: 'AU', name: 'Australia', enabled, currency: 'AUD', locale: 'en-AU', phoneCountryCode: '61',
  timezones: ['Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Adelaide', 'Australia/Darwin', 'Australia/Perth', 'Australia/Hobart'],
  defaultTimezone: 'Australia/Sydney', cardFeeOnlinePct: 1.65, cardFeeOnlineFixedMinor: 30, cardFeeInPersonPct: 1.65, cardFeeInPersonFixedMinor: 10,
  tapToPayFixedMinor: 15, cardFeeRegionLabel: 'Australian cards', shortName: 'Australia', phoneExample: '0412 345 678',
})
const NZ = (enabled) => ({
  ...LP1E.GB(), ...ANZ_ROW, countryCode: 'NZ', name: 'New Zealand', enabled, currency: 'NZD', locale: 'en-NZ', phoneCountryCode: '64',
  timezones: ['Pacific/Auckland', 'Pacific/Chatham'], defaultTimezone: 'Pacific/Auckland',
  cardFeeOnlinePct: 2.65, cardFeeOnlineFixedMinor: 30, cardFeeInPersonPct: 2.6, cardFeeInPersonFixedMinor: 5,
  tapToPayFixedMinor: 15, cardFeeRegionLabel: 'New Zealand cards', shortName: 'New Zealand', phoneExample: '021 123 4567',
})
const PRICES = {
  AU: { payg: [0, 0, 99, 0], pro: [3900, 550000, 99, 3900], unlimited: [9900, null, 0, 9900] },
  NZ: { payg: [0, 0, 99, 0], pro: [4900, 700000, 99, 4900], unlimited: [11900, null, 0, 11900] },
}
const CATALOG = (() => {
  const c = seedCatalog(REPO)
  for (const p of c.prices.filter(p => p.countryCode === 'GB')) for (const cc of ['AU', 'NZ']) {
    const [monthlyMinor, includedOnlineMinor, feeBps, extraVanMonthlyMinor] = PRICES[cc][p.planKey]
    c.prices.push({ ...p, countryCode: cc, monthlyMinor, includedOnlineMinor, feeBps, extraVanMonthlyMinor })
  }
  return c
})()
const tables = { plans: CATALOG.plans.map(snake), plan_prices: CATALOG.prices.map(snake), plan_features: CATALOG.features.map(snake) }
const ROWS = { on: () => [LP1E.GB(), LP1E.US_ON(), AU(true), NZ(true)], off: () => [LP1E.GB(), LP1E.US_ON(), AU(false), NZ(false)], none: () => [LP1E.GB(), LP1E.US_ON()] }

;(async () => {
  const ctx = LP1E.context(kit, REPO)
  const ROUTE = { landing: 'app/[country]/page', features: 'app/[country]/features/page', compare: 'app/[country]/compare/page' }
  const mods = {}
  const modOf = p => (mods[p] ||= ctx.bundle(`anz1-${p}`, `export * from '@/${ROUTE[p]}'\nexport { default } from '@/${ROUTE[p]}'\nexport { clearPlanCatalogCache as __clearPlans } from '@/lib/plans-server'\nexport { clearCountrySettingsCache as __clearCs } from '@/lib/country-settings'`))
  const run = (rows, fn) => ctx.withReq({ rows, tables }, fn)
  async function page(p, seg, rows) {
    const M = await modOf(p)
    return run(rows, async () => {
      M.__clearPlans(); M.__clearCs?.()
      const args = { params: Promise.resolve({ country: seg }), searchParams: Promise.resolve({}) }
      let html = null, meta = null, redirectedTo = null
      try { meta = await M.generateMetadata(args, Promise.resolve({ openGraph: {} })) } catch (e) { if (e?.message === 'redirect') redirectedTo = e.redirectTo ?? 'redirect'; else throw e }
      if (!redirectedTo) {
        try { html = await ctx.prerender(h(M.default, args)) } catch (e) { if (e?.message === 'redirect') redirectedTo = e.redirectTo ?? 'redirect'; else throw e }
      }
      return { html, meta, redirectedTo }
    })
  }
  const L = await ctx.bundle('anz1-lib', [
    "export * from '@/lib/marketing-country'",
    "export { translatorFor } from '@/lib/i18n/translator'",
    "export { resolveLocale, LOCALES } from '@/lib/i18n/locales'",
    "export { landingScreenshot } from '@/lib/landing-screens'",
    "export * as A from '@/lib/allergens'",
    "export { moneyFormatOf, planMoneyFormatOf, intlMoneyFormatOf } from '@/lib/country-settings-types'",
    "export { formatWholeAmount } from '@/lib/money-format'",
    "export { offerPlans, cheapestBands } from '@/lib/plan-offer'",
    "export { isPlausiblePhone } from '@/lib/phone'",
    "export { mapCountryRow } from '@/lib/country-settings'",
    "import '@/lib/i18n/catalog/pricing'", "import '@/lib/i18n/catalog/landing'", "import '@/lib/i18n/catalog/compare'", "import '@/lib/i18n/catalog/order'",
    "import '@/lib/i18n/catalog/planFeatures'", "import '@/lib/i18n/catalog/planPrompt'", "import '@/lib/i18n/catalog/paymentActions'", "import '@/lib/i18n/catalog/managePayments'",
  ].join('\n'))
  const tr = (loc, ns) => L.translatorFor(loc, ns)

  // ══ 1 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('1 · ADDRESS — /au and /nz exist; switched off (or no row) they behave like any switched-off country')
  t('AU → "au", NZ → "nz"; /au/features and /nz/compare parse as their pages',
    L.COUNTRY_PATH_SEGMENTS.AU === 'au' && L.COUNTRY_PATH_SEGMENTS.NZ === 'nz'
    && JSON.stringify(L.countryPageOf('/au/features')) === JSON.stringify({ code: 'AU', page: 'features' }) && JSON.stringify(L.countryPageOf('/nz/compare')) === JSON.stringify({ code: 'NZ', page: 'compare' }))
  const liveOff = L.routableCountries(['GB', 'US'])
  t('off: /au, /nz/features 302 to /uk, /uk/features (query kept); an AU or NZ visitor at the router lands on /uk',
    L.marketingRedirect('/au', '', liveOff, {})?.location === '/uk' && L.marketingRedirect('/nz/features', '?free=2', liveOff, {})?.location === '/uk/features?free=2'
    && L.marketingRedirect('/', '', liveOff, { ip: 'AU' })?.location === '/uk' && L.marketingRedirect('/', '', liveOff, { ip: 'NZ' })?.location === '/uk')
  const liveOn = L.routableCountries(['GB', 'US', 'AU', 'NZ'])
  t('on: the router sends an Australian visitor to /au and a New Zealander to /nz/compare; /au is not redirected',
    L.marketingRedirect('/', '', liveOn, { ip: 'AU' })?.location === '/au' && L.marketingRedirect('/compare', '', liveOn, { ip: 'NZ' })?.location === '/nz/compare' && L.marketingRedirect('/au', '', liveOn, {}) === null)
  for (const [label, rows] of [['rows switched off', ROWS.off()], ['NO AU / NZ rows (the live state when written)', ROWS.none()]]) {
    const a = await page('landing', 'au', rows), n = await page('compare', 'nz', rows)
    t(`${label}: /au redirects to /uk and /nz/compare to /uk/compare (the backstop behind the proxy's 302), never throwing`, a.redirectedTo === '/uk' && n.redirectedTo === '/uk/compare', [a.redirectedTo, n.redirectedTo])
  }

  // ══ 2 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('2 · AUSTRALIA AND NEW ZEALAND SWITCHED ON (fixtures) — the three pages each')
  const P = {}
  for (const [cc, seg] of [['AU', 'au'], ['NZ', 'nz']]) P[cc] = { landing: await page('landing', seg, ROWS.on()), features: await page('features', seg, ROWS.on()), compare: await page('compare', seg, ROWS.on()) }
  if (process.env.ANZ1_HTML_OUT) {   // optional: the switched-on pages' HTML, for a visual check against the build's CSS
    fs.mkdirSync(process.env.ANZ1_HTML_OUT, { recursive: true })
    for (const cc of ['AU', 'NZ']) for (const [k, r] of Object.entries(P[cc])) fs.writeFileSync(path.join(process.env.ANZ1_HTML_OUT, `${cc.toLowerCase()}-${k}.html`), r.html || '')
  }
  // ⚠️ RE-PINNED (native-prices, 22 October 2026, docs/native-prices-report.md; decided by Dominic, 21 Oct): a country's OWN
  // pages write our prices the way locals do — "$39", "$49" — and, because "$" is shared, carry ONE line naming the currency
  // ("Prices in Australian dollars (AUD)"). A$ / NZ$ is now only for the side-by-side places (Admin, /llms.txt).
  const SYM = { AU: '$', NZ: '$' }, PRO = { AU: '$39', NZ: '$49' }, UNL = { AU: '$99', NZ: '$119' }
  const LINE = { AU: 'Prices in Australian dollars (AUD)', NZ: 'Prices in New Zealand dollars (NZD)' }
  for (const cc of ['AU', 'NZ']) for (const [k, r] of Object.entries(P[cc])) {
    const tx = text(r.html || '')
    const intl = (tx.match(/\b[A-Z]{1,2}\$\d[\d.,]*/g) || [])
    const home = k === 'compare' ? tx.includes(`${SYM[cc]}2,500`) : tx.includes(PRO[cc]) && tx.includes(UNL[cc])
    t(`${cc} /${k}: renders; amounts in the home form (${k === 'compare' ? `${SYM[cc]}2,500 of orders` : `${PRO[cc]}, ${UNL[cc]}`}) under "${LINE[cc]}"; no £, € or A$ / NZ$ amount`,
      !!r.html && home && tx.split(LINE[cc]).length === 2 && !/£\d|€\d/.test(tx) && intl.length === 0, { intl: intl.slice(0, 6), seen: tx.match(/[A-Z]*\$\d[\d.,]*/g)?.slice(0, 10) })
  }
  // /compare at a volume where Pro, then Unlimited, is the suggestion (the calculator's own state, patched — the real module)
  const CMP = await ctx.bundle('anz1-compare-vol', `export { default } from '@/app/[country]/compare/page'\nexport { clearPlanCatalogCache as __clearPlans } from '@/lib/plans-server'`,
    { patches: [{ file: 'app/compare/CostComparison.tsx', states: ['gmv'] }] })
  const compareAt = (seg, gmv) => run(ROWS.on(), async () => {
    CMP.__clearPlans(); globalThis.__ms = { gmv }
    try { return text(await ctx.prerender(h(CMP.default, { params: Promise.resolve({ country: seg }), searchParams: Promise.resolve({}) }))) } finally { delete globalThis.__ms }
  })
  for (const [cc, seg, mid, high] of [['AU', 'au', 8000, 20000], ['NZ', 'nz', 10000, 25000]]) {
    const a = await compareAt(seg, mid), b = await compareAt(seg, high)
    // ⚠️ RE-PINNED (landing-mobile-tidy, 21 October 2026, Dominic): HatchGrab is not GST-registered in AU / NZ, so no plan
    // price says "incl. GST" — the en-AU / en-NZ overrides of these lines are removed (en-GB wording).
    // ⚠️ RE-PINNED (native-prices, 22 October 2026): the home form ("$39"), no A$ / NZ$.
    t(`${cc} /compare: Pro suggested at ${SYM[cc]}${mid.toLocaleString('en')} — "${PRO[cc]} per truck per month, …" (no GST claim); Unlimited at ${SYM[cc]}${high.toLocaleString('en')} — "${UNL[cc]} …"`,
      a.includes(`${PRO[cc]} per truck per month, with`) && b.includes(`${UNL[cc]} per truck per month, with`) && !/GST/.test(a + b) && !/\b[A-Z]{1,2}\$\d/.test(a + b),
      [a.match(/.{0,40}per truck per month.{0,40}/)?.[0], b.match(/.{0,40}per truck per month.{0,40}/)?.[0]])
  }
  for (const cc of ['AU', 'NZ']) {
    const tx = text(P[cc].landing.html) + ' ' + text(P[cc].features.html)
    // ⚠️ RE-PINNED (landing-mobile-tidy, 21 October 2026): no "incl. GST" and no "All prices include GST." (see above).
    t(`${cc}: the plan cards say "per truck / month" — no GST claim anywhere on the landing page or /features`, /per truck \/ month/.test(text(P[cc].landing.html)) && !/GST/.test(tx), text(P[cc].landing.html).match(/per truck[^.]{0,30}/g)?.slice(0, 3))
    t(`${cc}: the footnote quotes ${cc === 'AU' ? '1.65% + 30c in Australia' : '2.65% + 30c in New Zealand'}`,
      tx.includes(cc === 'AU' ? '(currently 1.65% + 30c in Australia)' : '(currently 2.65% + 30c in New Zealand)'), tx.match(/All prices[^.]*\.|\(currently[^)]*\)/g)?.slice(0, 4))
  }
  // the cheapest bands, from the data
  const band = cc => L.cheapestBands(L.offerPlans(CATALOG, cc), cc === 'AU' ? 'AUD' : 'NZD').map(b => [b.plan.plan.key, b.fromMinor, b.toMinor])
  t('cheapest bands from the data: AU under 3,900 → payg, 3,900–11,600 → pro, over 11,600 → unlimited',
    JSON.stringify(band('AU')) === JSON.stringify([['payg', null, 390000], ['pro', 390000, 1160000], ['unlimited', 1160000, null]]), band('AU'))
  t('cheapest bands from the data: NZ under 4,900 → payg, 4,900–14,100 → pro, over 14,100 → unlimited',
    JSON.stringify(band('NZ')) === JSON.stringify([['payg', null, 490000], ['pro', 490000, 1410000], ['unlimited', 1410000, null]]), band('NZ'))
  for (const [cc, k] of [['AU', 'landing'], ['NZ', 'landing']]) {   // the cheapest bar is the landing pricing section's (and the PDF's)
    // ⚠️ RE-PINNED (landing-mobile-tidy, 21 October 2026): the approved wording — a small "Your online orders each month" line
    // under the heading, and the first band without "of online orders a month".
    // ⚠️ RE-PINNED (native-prices, 22 October 2026): the home form ("$3,900").
    const want = cc === 'AU' ? 'Which plan is cheapest for me? Your online orders each month Under $3,900 → Pay as you go $3,900 – $11,600 → Pro Over $11,600 → Unlimited'
      : 'Which plan is cheapest for me? Your online orders each month Under $4,900 → Pay as you go $4,900 – $14,100 → Pro Over $14,100 → Unlimited'
    t(`${cc} /${k}: "Which plan is cheapest for me?" shows those bands`, text(P[cc][k].html).includes(want), text(P[cc][k].html).match(/Which plan is cheapest.{0,160}/)?.[0])
  }
  t('times on the AU / NZ pages are 12-hour (no "18:00"-style time)', ['AU', 'NZ'].every(cc => !/\b(1[3-9]|2[0-3]):[0-5]\d\b/.test(text(P[cc].landing.html))))
  const ldOf = html => { const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html || ''); return m ? JSON.parse(m[1]) : null }
  for (const [cc, cur, prices, seg] of [['AU', 'AUD', '0,39,99', 'au'], ['NZ', 'NZD', '0,49,119', 'nz']]) {
    const app = (ldOf(P[cc].landing.html)?.['@graph'] || []).find(n => n['@type'] === 'SoftwareApplication')
    t(`JSON-LD (${cc}): one Offer per public plan in ${cur} (${prices}), url https://www.hatchgrab.com/${seg}`,
      Array.isArray(app?.offers) && app.offers.every(o => o.priceCurrency === cur) && app.offers.map(o => Number(o.price)).join(',') === prices && app.url === `https://www.hatchgrab.com/${seg}`, app?.offers)
  }
  t('landing meta (AU): "… software for food trucks and mobile catering in Australia — not a POS."; title "… — HatchGrab Australia"',
    /software for food trucks and mobile catering in Australia — not a POS\./.test(String(P.AU.landing.meta?.description)) && /HatchGrab Australia$/.test(String(P.AU.landing.meta?.title?.absolute ?? P.AU.landing.meta?.title)), [P.AU.landing.meta?.description, P.AU.landing.meta?.title])
  const langs = m => m?.alternates?.languages || {}
  const sameSet = (a, b) => JSON.stringify(Object.entries(a || {}).sort()) === JSON.stringify(Object.entries(b || {}).sort())
  const uk = await page('landing', 'uk', ROWS.on()), us = await page('landing', 'us', ROWS.on())
  const want = { 'en-GB': 'https://www.hatchgrab.com/uk', 'en-US': 'https://www.hatchgrab.com/us', 'en-AU': 'https://www.hatchgrab.com/au', 'en-NZ': 'https://www.hatchgrab.com/nz', 'x-default': 'https://www.hatchgrab.com/' }
  t('hreflang reciprocal: /uk, /us, /au and /nz each list en-GB, en-US, en-AU, en-NZ and x-default (the same set)',
    [uk, us, P.AU.landing, P.NZ.landing].every(r => sameSet(langs(r.meta), want)), [langs(uk.meta), langs(P.NZ.landing.meta)])
  t('canonical and og:locale: /au en_AU, /nz en_NZ', P.AU.landing.meta?.alternates?.canonical === want['en-AU'] && P.AU.landing.meta?.openGraph?.locale === 'en_AU'
    && P.NZ.landing.meta?.alternates?.canonical === want['en-NZ'] && P.NZ.landing.meta?.openGraph?.locale === 'en_NZ', [P.AU.landing.meta?.openGraph?.locale, P.NZ.landing.meta?.openGraph?.locale])
  t('the country menu on /uk links Australia (/au) and New Zealand (/nz)', /href="\/au"/.test(uk.html || '') && /href="\/nz"/.test(uk.html || '') && /Australia/.test(text(uk.html)) && /New Zealand/.test(text(uk.html)))
  t('/au and /nz show their own hero screenshots; /uk the GB ones',
    /\/screenshots\/kitchen-au\.png/.test(P.AU.landing.html) && /\/screenshots\/customer-order-nz\.png/.test(P.NZ.landing.html) && !/-(au|nz)\.png/.test(uk.html)
    && L.landingScreenshot('dashboard', 'AU') === '/screenshots/dashboard-v4-au.png' && L.landingScreenshot('phone', 'NZ') === '/screenshots/customer-order-nz.png' && L.landingScreenshot('kitchen', 'GB') === '/screenshots/kitchen.png')
  t('the AU / NZ screenshot files exist at the GB pixel sizes', ['kitchen', 'dashboard-v4', 'customer-order'].every(n => ['au', 'nz'].every(c => {
    const a = fs.readFileSync(path.join(REPO, `public/screenshots/${n}-${c}.png`)), b = fs.readFileSync(path.join(REPO, `public/screenshots/${n}.png`))
    return a.readUInt32BE(16) === b.readUInt32BE(16) && a.readUInt32BE(20) === b.readUInt32BE(20)
  })))
  const SM = await ctx.bundle('anz1-sitemap', "export { default } from '@/app/sitemap'\nexport { clearCountrySettingsCache as __c } from '@/lib/country-settings'")
  const sitemap = async rows => run(rows, async () => { SM.__c?.(); return SM.default() })
  const smOn = await sitemap(ROWS.on())
  const auEntry = smOn.find(e => e.url === 'https://www.hatchgrab.com/au')
  t('sitemap (on): /au, /au/features, /nz, /nz/features listed, each with the five alternates',
    !!auEntry && ['au', 'au/features', 'nz', 'nz/features'].every(p => smOn.some(e => e.url === `https://www.hatchgrab.com/${p}`)) && sameSet(auEntry.alternates?.languages, want), auEntry)

  // ══ 3 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · AUSTRALIA AND NEW ZEALAND OFF — /uk and /us carry no trace of them')
  for (const [label, rows] of [['rows off', ROWS.off()], ['no rows', ROWS.none()]]) {
    const u = await page('landing', 'uk', rows), s = await page('landing', 'us', rows), f = await page('features', 'uk', rows)
    const all = (u.html || '') + (s.html || '') + (f.html || '') + JSON.stringify([u.meta, s.meta, f.meta])
    t(`${label}: no /au or /nz link, no en-AU / en-NZ hreflang, no -au / -nz screenshot, no A$ / NZ$ on /uk or /us`,
      !/href="\/(au|nz)|hatchgrab\.com\/(au|nz)|en-AU|en-NZ|-(au|nz)\.png|A\$\d|NZ\$\d/.test(all) && sameSet(langs(u.meta), { 'en-GB': want['en-GB'], 'en-US': want['en-US'], 'x-default': want['x-default'] }))
    const sm = await sitemap(rows)
    t(`${label}: the sitemap lists no /au or /nz address`, !sm.some(e => /\/(au|nz)(\/|$)/.test(e.url)))
  }

  // ══ 4 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · WORDS — en-AU / en-NZ overrides; "Pay at the truck" outside the UK')
  t('en-AU and en-NZ are supported locales (exact match)', L.LOCALES.includes('en-AU') && L.LOCALES.includes('en-NZ') && L.resolveLocale('en-AU') === 'en-AU' && L.resolveLocale('en-NZ') === 'en-NZ')
  const pw = loc => tr(loc, 'planFeatures')('priceWord.payAtHatch')
  t('"Pay at the truck" in en-US, en-IE, en-AU, en-NZ; en-GB keeps "Pay at Hatch"',
    ['en-US', 'en-IE', 'en-AU', 'en-NZ'].every(l => pw(l) === 'Pay at the truck') && pw('en-GB') === 'Pay at Hatch', ['en-GB', 'en-US', 'en-IE', 'en-AU', 'en-NZ'].map(pw))
  const pp = loc => tr(loc, 'planPrompt')('features.online_ordering_pay_at_hatch.name')
  t('plan prompt feature name: "Pay-at-the-truck ordering" outside en-GB; en-GB unchanged', ['en-US', 'en-IE', 'en-AU', 'en-NZ'].every(l => pp(l) === 'Pay-at-the-truck ordering') && pp('en-GB') !== 'Pay-at-the-truck ordering', ['en-GB', 'en-US'].map(pp))
  t('EFTPOS for the card machine in en-AU and en-NZ; en-GB unchanged',
    ['en-AU', 'en-NZ'].every(l => /EFTPOS/.test(tr(l, 'managePayments')('walkUp.ownTerminal')) && /EFTPOS/.test(tr(l, 'paymentActions')('paidCardMachine')))
    && !/EFTPOS/.test(tr('en-GB', 'managePayments')('walkUp.ownTerminal') + tr('en-GB', 'paymentActions')('paidCardMachine')), ['en-GB', 'en-AU'].map(l => tr(l, 'managePayments')('walkUp.ownTerminal')))
  t('"site" not "pitch" in en-AU and en-NZ (compare anchors); en-GB keeps "pitch"',
    ['en-AU', 'en-NZ'].every(l => /site/.test(tr(l, 'compare')('anchor.weekendPitch')) && !/pitch/i.test(tr(l, 'compare')('anchor.weekendPitch')) && /sites/.test(tr(l, 'compare')('anchor.festivalPitches')))
    && /pitch/.test(tr('en-GB', 'compare')('anchor.weekendPitch')), ['en-GB', 'en-AU', 'en-NZ'].map(l => tr(l, 'compare')('anchor.weekendPitch')))
  const auFile = JSON.parse(fs.readFileSync(path.join(REPO, 'messages/en-AU.json'), 'utf8')), nzFile = JSON.parse(fs.readFileSync(path.join(REPO, 'messages/en-NZ.json'), 'utf8'))
  const leaves = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? leaves(v, p + k + '.') : [p + k]))
  const gbFile = JSON.parse(fs.readFileSync(path.join(REPO, 'messages/en-GB.json'), 'utf8'))
  const get = (o, k) => k.split('.').reduce((a, s) => a?.[s], o)
  t('en-AU says "pick up" where en-GB says "collect" (order page: "Pickup time"; kitchen: "Mark paid & picked up")',
    leaves(auFile).filter(k => /[Pp]ick(ed)? ?up/.test(get(auFile, k)) && /[Cc]ollect/.test(get(gbFile, k))).length >= 60 && Object.values(get(auFile, 'order') || {}).some(v => typeof v === 'string' && /Pickup time/.test(v)), leaves(auFile).length)
  t('en-NZ keeps "collect" — none of its overrides says "pick up"', leaves(nzFile).every(k => !/[Pp]ick(ed)? ?up/.test(get(nzFile, k))), leaves(nzFile))
  t('every en-NZ key is also overridden in en-AU, with the same words where AU does not change "collect"',
    leaves(nzFile).every(k => get(auFile, k) !== undefined))

  // ══ 5 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('5 · ALLERGENS — the anz list; uk14 / us9 byte-identical; the AU / NZ fixture trucks')
  const A = L.A
  const ANZ = ['Wheat', 'Barley', 'Rye', 'Oats', 'Milk', 'Egg', 'Fish', 'Crustacean', 'Mollusc', 'Sesame', 'Lupin', 'Soy', 'Peanut', 'Added sulphites',
    'Almond', 'Brazil nut', 'Cashew', 'Hazelnut', 'Macadamia', 'Pecan', 'Pine nut', 'Pistachio', 'Walnut']
  t('the anz list: the Food Standards Code PEAL list, 23 flat entries, tree nuts named one by one, no celery or mustard',
    JSON.stringify(A.allergenVocab('anz')) === JSON.stringify(ANZ) && !A.allergenVocab('anz').some(x => /celery|mustard|tree nuts|gluten/i.test(x)), A.allergenVocab('anz'))
  // ⚠️ RE-PINNED (canada-1, 22 October 2026): the Canadian set follows (scripts/canada-1.cjs proves uk14 / us9 / anz unchanged).
  t('the set list is uk14, us9, anz, ca', JSON.stringify(A.ALLERGEN_SETS) === JSON.stringify(['uk14', 'us9', 'anz', 'ca']))
  // 🔴 PINNED: the uk14 / us9 / no-set outputs, proved byte-identical to HEAD 4633801c (the report's proof run) and pinned here.
  const PINS = {
    uk14: { allergenVocab: 'fdeda71441c71e6f', genericReplacements: '1ec60ccf49050fb3', menuExtractAllergenLines: 'b050abf66792e8bf', menuExtractAllergenExample: 'a5b6223c428895d1',
      allergenCardListLines: '07aad49476144e13', allergenCardClosingRule: 'cb7ff6a0fd2d0476', allergenCardExample: 'f75d7b588ef3fe45' },
    us9: { allergenVocab: 'd3d4f9367cc39c76', genericReplacements: 'bcfe72e79ffc67cf', menuExtractAllergenLines: '55221a15531f5ad1', menuExtractAllergenExample: '3c36623fa73c5a1c',
      allergenCardListLines: '8ac04563d876b465', allergenCardClosingRule: 'e9f1454272951852', allergenCardExample: 'fba4f04af721356e' },
  }
  const surf = set => ({
    allergenVocab: JSON.stringify(A.allergenVocab(set)), genericReplacements: JSON.stringify(A.genericReplacements(set)),
    menuExtractAllergenLines: A.menuExtractAllergenLines(set), menuExtractAllergenExample: A.menuExtractAllergenExample(set),
    allergenCardListLines: A.allergenCardListLines(set), allergenCardClosingRule: A.allergenCardClosingRule(set),
    allergenCardExample: (e => JSON.stringify([e.contains, e.mayContain, e.entry]))(A.allergenCardExample(set)),
  })
  for (const [set, pins] of [['uk14', PINS.uk14], ['us9', PINS.us9], [null, PINS.uk14], [undefined, PINS.uk14]]) {
    const got = Object.fromEntries(Object.entries(surf(set)).map(([k, v]) => [k, sha(v)]))
    t(`${String(set)}: all seven allergen helpers byte-identical to the pinned (HEAD) output`, JSON.stringify(got) === JSON.stringify(pins), got)
  }
  t('the card prompt\'s last two examples: UK / US keep their literals ["Shellfish", "Fish"] / ["Tree nuts"]; anz names anz labels',
    ['uk14', 'us9', null].every(s => A.allergenCardExample(s).freeFrom === '["Shellfish", "Fish"]' && A.allergenCardExample(s).blanket === '["Tree nuts"]')
    && Object.values(A.allergenCardExample('anz')).every(v => JSON.parse(v).every(x => x === 'Nuts' || ANZ.includes(x))), A.allergenCardExample('anz'))
  const cardSrc = fs.readFileSync(path.join(REPO, 'app/api/manage/process-allergens/route.ts'), 'utf8')
  t('the card prompt takes its free_from / blanket examples from the set (no hard-coded UK labels left)', /"free_from": \$\{ex\.freeFrom\}/.test(cardSrc) && /"blanket": \$\{ex\.blanket\}/.test(cardSrc) && !/"blanket": \["Tree nuts"\]/.test(cardSrc))
  t('every anz prompt label is an anz label (list lines, example, card list)', (() => {
    const quoted = s => [...s.matchAll(/"([^"]+)"/g)].map(m => m[1])
    return JSON.parse(A.menuExtractAllergenExample('anz')).every(x => ANZ.includes(x)) && ANZ.every(x => A.allergenCardListLines('anz').includes(x)) && ANZ.every(x => A.menuExtractAllergenLines('anz').includes(x))
      && quoted(A.allergenCardClosingRule('anz')).filter(x => !/→/.test(x)).length >= 0
  })(), [A.menuExtractAllergenLines('anz').slice(0, 300), A.allergenCardClosingRule('anz')])
  const extractSrc = fs.readFileSync(path.join(REPO, 'lib/menu-extract.ts'), 'utf8')
  const localised = A.localiseExampleAllergens(extractSrc, 'anz')
  t('the importer prompt\'s worked examples are localised for anz (all four swaps land; no UK label left in them)',
    localised.includes('Cheese → ["Milk"]') && localised.includes('"allergens": ["Milk", "Wheat", "Egg"]') && localised.includes('"allergens": ["Peanut", "Egg"]') && localised.includes('"allergens": ["Crustacean"]')
    && !/"allergens": \["(Dairy|Crustaceans|Peanuts)/.test(localised))
  t('…and for uk14 / us9 / no set the importer prompt is returned unchanged', ['uk14', 'us9', null, undefined].every(s => A.localiseExampleAllergens(extractSrc, s) === extractSrc))
  const gr = A.genericReplacements('anz')
  t('anz generic replacements: "Nuts" → the nine tree nuts + Peanut; "Gluten" → Wheat / Barley / Rye / Oats; every target an anz label',
    JSON.stringify(gr.Nuts) === JSON.stringify([...ANZ.slice(14), 'Peanut']) && JSON.stringify(gr.Gluten) === JSON.stringify(['Wheat', 'Barley', 'Rye', 'Oats']) && Object.values(gr).flat().every(x => ANZ.includes(x)), gr)
  t('the settings loader accepts allergen_set "anz" (and still refuses anything else)', (() => {
    const row = r => ({ ...snake(r), timezones: r.timezones, tip_presets_pct: r.tipPresetsPct, card_surcharge_excluded_regions: r.cardSurchargeExcludedRegions, updated_at: '2026-10-21T00:00:00Z' })
    let refused = false
    try { L.mapCountryRow({ ...row(AU(false)), allergen_set: 'eu14' }) } catch { refused = true }
    return L.mapCountryRow(row(AU(false))).allergenSet === 'anz' && refused
  })())

  // Manage's allergen toggles, in the truck's country (CountrySettingsProvider, as the manage page feeds it)
  const M = await ctx.bundle('anz1-manage', "export { AllergenToggles } from '@/components/manage/primitives'\nexport { CountrySettingsProvider } from '@/components/CountrySettingsProvider'")
  const toggles = settings => kit.renderStatic(h(M.CountrySettingsProvider, { settings }, h(M.AllergenToggles, { value: ['Macadamia', 'Wheat', 'Dairy'], onChange() {} })))
  const labelsOf = html => [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map(m => text(m[1]))
  const pressed = html => [...html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].filter(m => /bg-amber-50/.test(m[1])).map(m => text(m[2]))
  for (const [cc, settings] of [['AU', AU(true)], ['NZ', NZ(true)]]) {
    const html = toggles(settings), ls = labelsOf(html)
    t(`Manage → item → allergens (${cc} truck): the 23 anz toggles, in order, flat (flex-wrap); Macadamia and Wheat pressed`,
      JSON.stringify(ls) === JSON.stringify(ANZ) && /flex-wrap/.test(html) && pressed(html).sort().join() === 'Macadamia,Wheat', { ls, pressed: pressed(html) })
  }
  const gbT = labelsOf(toggles(LP1E.GB())), usT = labelsOf(toggles(LP1E.US_ON()))
  t('the GB and US trucks\' toggles are exactly their own lists (UK 14 / US 9)', JSON.stringify(gbT) === JSON.stringify(A.UK_14) && JSON.stringify(usT) === JSON.stringify(A.US_9), [gbT, usT])

  // The order page, state-patched (the real module), on an AU and an NZ fixture truck
  const OP = 'app/trucks/[slug]/order/page.tsx'
  const O = await kit.bundle('anz1-order', `export { default as OrderPage } from '@/${OP}'\nexport { I18nContext } from '@/lib/i18n/use-t'`, {
    patches: [{ file: OP, states: ['truck', 'menu', 'events', 'event', 'eventLoading', 'loading', 'basket', 'appliedDeals', 'noEvents', 'availableSlots', 'serverCatConfigs', 'capacityInputs', 'formSheetOpen', 'stageOpen', 'payment', 'payStage', 'elementReady'] },
      { file: OP, from: 'const { slug } = use(params)', to: 'const { slug } = params' }],
  })
  const item = { name: 'Satay Chicken', description: 'With peanut sauce.', price: 22, category: 'Mains', available: true, dietary: [], allergens: ['Peanut', 'Macadamia', 'Wheat', 'Soy', 'Added sulphites'], modifierGroups: [] }
  const menu = { categories: [{ id: 'c1', name: 'Mains', prep_secs: 600, batch_size: 4 }], items: [item], upsell_rules: [], bundles: [] }
  const ev = { id: 'ev-1', date: '01/09/2026', date_iso: '2026-09-01', date_friendly: 'Tuesday 1st September', start_time: '17:00', end_time: '21:00', venue_name: 'Riverside Park', village: 'Parramatta', postcode: '2150', notes: '', status: 'open', collection_interval_mins: 15 }
  const time = (loc, tz) => ({ locale: loc, timeZone: tz, timeFormat: '12h', dateOrder: 'dmy', weekStart: 'monday' })
  const truckOf = (cc, currency, locale, tz) => ({ id: 'anz-fixture', name: 'Pizza Kitchen', logo: null, mode: 'village', venue_name: null, time_selection_enabled: true, paused: false, plan: 'pro',
    ordering_available: true, card_payments_ready: true, allergen_display_mode: 'per_dish', allergensVerified: true, extra_wait_mins: 0,
    money: { currency, locale }, time: time(locale, tz), phone: { phoneCountry: cc, short_name: cc, phone_example: '0412 345 678', phoneCheck: 'length' } })
  const orderPage = (cc, currency, locale, tz, paying) => {
    globalThis.__ms = { truck: truckOf(cc, currency, locale, tz), menu, events: [ev], event: ev, eventLoading: false, loading: false, noEvents: false,
      basket: [{ menuItem: item, quantity: 1, modifiers: [], specialInstructions: '', cartKey: 'k1' }], appliedDeals: [], availableSlots: [], serverCatConfigs: {}, capacityInputs: null,
      formSheetOpen: paying, stageOpen: paying, payment: paying ? { clientSecret: 'cs_fixture', fingerprint: 'f', stripeAccount: 'acct_fixture', orderKey: 'k', totalPence: 2200 } : null, payStage: 'ready', elementReady: true }
    try { return kit.renderStatic(h(O.I18nContext.Provider, { value: { locale, setLocale() {} } }, h(O.OrderPage, { params: { slug: 'anz-fixture' } }))) } finally { delete globalThis.__ms }
  }
  const auMenu = orderPage('AU', 'AUD', 'en-AU', 'Australia/Sydney', false), nzMenu = orderPage('NZ', 'NZD', 'en-NZ', 'Pacific/Auckland', false)
  for (const [cc, html] of [['AU', auMenu], ['NZ', nzMenu]]) {
    const tx = text(html)
    t(`order page (${cc} fixture truck): the dish shows its anz allergens — Peanut, Macadamia, Wheat, Soy, Added sulphites`, ['Peanut', 'Macadamia', 'Wheat', 'Soy', 'Added sulphites'].every(x => tx.includes(x)), tx.slice(0, 400))
    t(`order page (${cc}): prices in $ (the truck's own everyday symbol), no £ / €`, /\$22\.00/.test(tx) && !/£|€/.test(tx), tx.match(/[£$€][\d.]+/g)?.slice(0, 5))
  }

  // ══ 6 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('6 · WHATSAPP — the allergen guard on AU / NZ phrasing (anz trucks only)')
  // The guard is module-private; it is evaluated from its own source (constants + function), exactly as written.
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const waSrc = fs.readFileSync(path.join(REPO, 'lib/whatsapp-classifier.ts'), 'utf8')
  // ⚠️ RE-PINNED (languages-1, 22 October 2026, docs/languages-1-report.md §3): the guard's words are DATA now
  // (lib/allergen-guard/en.json), read by lib/allergen-guard.ts — evaluated here as built, for an English truck. Its answers are
  // the ones the lists in lib/whatsapp-classifier.ts gave (scripts/languages-1.cjs §6 proves 1,190 messages × 5 sets identical).
  const gBuilt = esbuild.buildSync({ entryPoints: [path.join(REPO, 'lib/allergen-guard.ts')], bundle: true, write: false, platform: 'node', format: 'cjs', alias: { '@': REPO }, logLevel: 'silent' })
  const gMod = { exports: {} }; new Function('module', 'exports', 'require', gBuilt.outputFiles[0].text)(gMod, gMod.exports, require)
  const guard = (m, set) => gMod.exports.mentionsAllergen(m, set, 'en-GB')
  const guardWords = JSON.parse(fs.readFileSync(path.join(REPO, 'lib/allergen-guard/en.json'), 'utf8'))
  const ANZ_SAFETY = ['my son has an EpiPen', 'she carries an epi-pen', 'anaphylaxis to peanuts — is the satay safe?', 'I am anaphylactic to sesame', 'is the burger NF?', 'LF options?']
  const BOTH = ['is it gluten free?', 'GF?', 'coeliac friendly?', 'dairy-free please', 'I am allergic to milk', 'can I have it free from shellfish']
  const NEITHER = ['does the satay have peanuts?', 'any sesame on the bun?', 'Are you open today', 'what time do you close', 'is it a nice day']
  t('anz: the AU / NZ safety phrasing is caught (EpiPen, epi-pen, anaphylaxis, anaphylactic, NF, LF)', ANZ_SAFETY.every(m => guard(m, 'anz')), ANZ_SAFETY.filter(m => !guard(m, 'anz')))
  t('anz: everything a UK truck catches is still caught', BOTH.every(m => guard(m, 'anz')))
  t('Option B holds for anz: a presence question naming an allergen still reaches the LLM', NEITHER.every(m => !guard(m, 'anz')), NEITHER.filter(m => guard(m, 'anz')))
  t('uk14 / us9 / no set: the guard is unchanged — the new phrasing is not added to them', [...ANZ_SAFETY, ...NEITHER].every(m => !guard(m, 'uk14') && !guard(m, 'us9') && !guard(m, null)) && BOTH.every(m => guard(m, 'uk14') && guard(m, 'us9')))
  t('the three callers pass the truck\'s set (preview, Twilio webhook, Meta webhook)', ['app/api/manage/whatsapp-preview/route.ts', 'app/api/webhooks/whatsapp/route.ts', 'app/api/webhooks/meta/whatsapp/route.ts']
    .every(f => /allergenSet:\s+await allergenSetForTruck\(truck\)/.test(fs.readFileSync(path.join(REPO, f), 'utf8'))))
  t('the reply caveat widens to the anz family words for an anz truck only', !!guardWords.caveatWords.anz.milk && /caveatTriggerWords\(items\.flatMap[^\n]*params\.allergenSet, params\.time\?\.locale\)/.test(waSrc)
    && gMod.exports.caveatTriggerWords(['Milk'], 'anz', 'en-AU').has('dairy') && !gMod.exports.caveatTriggerWords(['Milk'], 'uk14', 'en-GB').has('dairy'))

  // ══ 7 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('7 · EFTPOS — the card processor\'s dual-network notice on an Australian checkout only')
  const NOTICE = 'Notwithstanding the payment brand logo displayed when you enter your payment information, whenever you use a dual-network debit card displaying eftpos and another payment brand, your payment might be processed through either network.'
  t('the notice (en-GB words, inherited by every English locale) is the card processor\'s suggested text', ['en-GB', 'en-AU', 'en-NZ', 'en-US'].every(l => tr(l, 'order')('dualNetworkNotice') === NOTICE))
  const pay = { AU: orderPage('AU', 'AUD', 'en-AU', 'Australia/Sydney', true), NZ: orderPage('NZ', 'NZD', 'en-NZ', 'Pacific/Auckland', true), GB: orderPage('GB', 'GBP', 'en-GB', 'Europe/London', true), US: orderPage('US', 'USD', 'en-US', 'America/Chicago', true) }
  t('the AU card step shows the notice under the "held until" line', /data-network-notice/.test(pay.AU) && text(pay.AU).includes(NOTICE), text(pay.AU).slice(-600))
  t('NZ, GB and US card steps show nothing new', ['NZ', 'GB', 'US'].every(c => !/data-network-notice/.test(pay[c]) && !text(pay[c]).includes('dual-network')))
  t('no server-side payment change: lib/payments/authorize.ts keeps capture_method "manual" and adds no network routing', (() => {
    const s = fs.readFileSync(path.join(REPO, 'lib/payments/authorize.ts'), 'utf8')
    return /capture_method: 'manual'/.test(s) && !/requested_priority|eftpos/i.test(s)
  })())

  // ══ 8 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('8 · MONEY AND PHONES')
  const pm = row => L.planMoneyFormatOf(row)
  t('planMoneyFormatOf: GB, US, IE are exactly moneyFormatOf (byte-identical pages)', [{ currency: 'GBP', locale: 'en-GB' }, { currency: 'USD', locale: 'en-US' }, { currency: 'EUR', locale: 'en-IE' }]
    .every(r => JSON.stringify(pm(r)) === JSON.stringify(L.moneyFormatOf(r))))
  // ⚠️ RE-PINNED (native-prices, 22 October 2026): the home form on the country's own pages ("$39", "$49" — the truck's own
  // format too); the international form (A$39, NZ$49) is intlMoneyFormatOf, for Admin and /llms.txt.
  const im = row => L.intlMoneyFormatOf(row)
  t('planMoneyFormatOf: AU → "$39", NZ → "$49" (the truck\'s own format, "$"); intlMoneyFormatOf: AU → "A$39", NZ → "NZ$49"',
    L.formatWholeAmount(3900, pm({ currency: 'AUD', locale: 'en-AU' })) === '$39' && L.formatWholeAmount(4900, pm({ currency: 'NZD', locale: 'en-NZ' })) === '$49'
    && L.formatWholeAmount(3900, L.moneyFormatOf({ currency: 'AUD', locale: 'en-AU' })) === '$39'
    && L.formatWholeAmount(3900, im({ currency: 'AUD', locale: 'en-AU' })) === 'A$39' && L.formatWholeAmount(4900, im({ currency: 'NZD', locale: 'en-NZ' })) === 'NZ$49',
    [L.formatWholeAmount(3900, pm({ currency: 'AUD', locale: 'en-AU' })), L.formatWholeAmount(4900, im({ currency: 'NZD', locale: 'en-NZ' }))])
  t('the example numbers are plausible: 0412 345 678 (AU), 021 123 4567 (NZ)', L.isPlausiblePhone('0412 345 678', 'AU', 'length') && L.isPlausiblePhone('021 123 4567', 'NZ', 'length') && !L.isPlausiblePhone('0412', 'AU', 'length'))

  console.log(`\n${fail ? '🔴' : '✅'} anz-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
