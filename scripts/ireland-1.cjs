// scripts/ireland-1.cjs — IRELAND, STAGE IE-1 (docs/ireland-1-report.md; docs/europe-readiness-report.md §A, §G).
//
// LOCALHOST ONLY. Nothing reaches a database or the network: the country rows are fixtures (the GB seed row, and an IE
// row with the values of the europe-readiness draft SQL), the plan catalogue is the seed's plus three IE prices, and the
// render kit stubs everything else. Checks:
//   1  ADDRESS — /ie, /ie/features, /ie/compare are addresses; while IE is off (or has no row) they 302 to the UK page and
//      IE is in no router pick, hreflang set, sitemap or menu; once on, the router sends an Irish visitor to /ie.
//   2  IE ON — the three pages in €, the footnote "1.5% + €0.25 in Ireland", hreflang en-IE reciprocal with en-GB/en-US,
//      the sitemap, JSON-LD Offers in EUR, the country menu link, the IE hero screenshots.
//   3  IE OFF — /uk and /us carry no trace of Ireland (no /ie link, no en-IE, no € screenshots).
//   4  WORDS — en-IE overrides only the four sentences it must; en-GB and en-US words for those keys are unchanged; the
//      sign-up refusals no longer put a country name after "in".
//   5  OUTREACH — a prospect's phone is read in its own country: GB exactly as before, US and IE numbers in theirs.
//   6  AI PROMPTS — GB/US location lines unchanged; IE gets its own postal-code lines; every prompt names its language.
//   7  DEMO — demoEventWindow takes its date from `now`; for the current time it equals the real-clock date.
//   8  PLANS PDF (IE) — masked while IE is off, € and the footnote once on.
const fs = require('fs')
const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'ireland-1' })
const { REPO, h } = kit
const LP1E = require('./_lp1e-fixtures.cjs')
const { seedCatalog } = require('./_plans-catalog-fixture.cjs')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 100 - s.length)))
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))
const text = s => String(s).replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

/** The IE row — the values of docs/europe-readiness-report.md §A.13's draft (NOT RUN when this was written). */
const IE = (enabled) => ({
  ...LP1E.GB(), countryCode: 'IE', name: 'Ireland', enabled, currency: 'EUR', locale: 'en-IE', phoneCountryCode: '353',
  timezones: ['Europe/Dublin'], defaultTimezone: 'Europe/Dublin',
  starterMonthlyMinor: null, proMonthlyMinor: null, maxMonthlyMinor: null, proAllowanceMinor: null, maxAllowanceMinor: null, platformFeePct: null,
  cardFeeOnlinePct: 1.5, cardFeeOnlineFixedMinor: 25, cardFeeInPersonPct: 1.4, cardFeeInPersonFixedMinor: 10, tapToPayFixedMinor: 10,
  cardFeeRegionLabel: 'EEA cards', shortName: 'Ireland', phoneExample: '085 123 4567', updatedBy: 'europe-readiness draft',
})
const CATALOG = (() => {
  const c = seedCatalog(REPO)
  for (const p of c.prices.filter(p => p.countryCode === 'GB')) c.prices.push({ ...p, countryCode: 'IE' })
  return c
})()
const tables = { plans: CATALOG.plans.map(snake), plan_prices: CATALOG.prices.map(snake), plan_features: CATALOG.features.map(snake) }
const ROWS = { ieOn: () => [LP1E.GB(), LP1E.US_ON(), IE(true)], ieOff: () => [LP1E.GB(), LP1E.US_ON(), IE(false)], noIe: () => [LP1E.GB(), LP1E.US_ON()] }

;(async () => {
  const ctx = LP1E.context(kit, REPO)
  const ROUTE = { landing: 'app/[country]/page', features: 'app/[country]/features/page', compare: 'app/[country]/compare/page' }
  const mods = {}
  const modOf = p => (mods[p] ||= ctx.bundle(`ie1-${p}`, `export * from '@/${ROUTE[p]}'\nexport { default } from '@/${ROUTE[p]}'\nexport { clearPlanCatalogCache as __ieClearPlans } from '@/lib/plans-server'\nexport { clearCountrySettingsCache as __ieClearCs } from '@/lib/country-settings'`))
  const run = (rows, fn) => ctx.withReq({ rows, tables }, fn)
  async function page(p, seg, rows) {
    const M = await modOf(p)
    return run(rows, async () => {
      M.__ieClearPlans(); M.__ieClearCs?.()
      const args = { params: Promise.resolve({ country: seg }), searchParams: Promise.resolve({}) }
      let html = null, meta = null, redirectedTo = null
      try { meta = await M.generateMetadata(args, Promise.resolve({ openGraph: {} })) } catch (e) { if (e?.message === 'redirect') redirectedTo = e.redirectTo ?? 'redirect'; else throw e }
      if (!redirectedTo) {
        try { html = await ctx.prerender(h(M.default, args)) } catch (e) { if (e?.message === 'redirect') redirectedTo = e.redirectTo ?? 'redirect'; else throw e }
      }
      return { html, meta, redirectedTo }
    })
  }
  const L = await ctx.bundle('ie1-lib', [
    "export * from '@/lib/marketing-country'",
    "export { translatorFor } from '@/lib/i18n/translator'",
    "export { resolveLocale, LOCALES } from '@/lib/i18n/locales'",
    "export { phoneWhatsApp } from '@/lib/whatsapp-hint'",
    "export { prospectPhoneCountry } from '@/lib/outreach-country'",
    "export { buildScheduleExtractionPrompt } from '@/lib/schedule-extract'",
    "export { buildScreenshotPrompt } from '@/lib/admin/screenshot-events'",
    "export { demoEventWindow } from '@/lib/provision-demo-event'",
    "export { getLocalDateInTz } from '@/lib/time-utils'",
    "export { landingScreenshot } from '@/lib/landing-screens'",
    "export { outputLanguageName } from '@/lib/ai-language'",
    "import '@/lib/i18n/catalog/pricing'", "import '@/lib/i18n/catalog/landing'", "import '@/lib/i18n/catalog/compare'", "import '@/lib/i18n/catalog/tradeArea'",
  ].join('\n'))

  // ══ 1 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('1 · ADDRESS — /ie exists; switched off (or no row) it behaves like any switched-off country')
  t('IE → "ie" in the address table; /ie, /ie/features, /ie/compare parse as IE pages',
    L.COUNTRY_PATH_SEGMENTS.IE === 'ie' && ['/ie', '/ie/features', '/ie/compare'].every((p, i) => JSON.stringify(L.countryPageOf(p)) === JSON.stringify({ code: 'IE', page: ['landing', 'features', 'compare'][i] })))
  const liveOff = L.routableCountries(['GB', 'US'])   // IE off or missing: not in the enabled list
  t('IE off: /ie, /ie/features, /ie/compare 302 to /uk, /uk/features, /uk/compare (query kept)',
    L.marketingRedirect('/ie', '', liveOff, {})?.location === '/uk' && L.marketingRedirect('/ie/features', '?free=2', liveOff, {})?.location === '/uk/features?free=2' && L.marketingRedirect('/ie/compare', '', liveOff, {})?.location === '/uk/compare')
  t('IE off: an Irish visitor (IP IE) at the router lands on /uk, as before', L.marketingRedirect('/', '', liveOff, { ip: 'IE' })?.location === '/uk')
  const liveOn = L.routableCountries(['GB', 'US', 'IE'])
  t('IE on: it is routable; the router sends an Irish visitor to /ie and /features to /ie/features; /ie is not redirected',
    liveOn.includes('IE') && L.marketingRedirect('/', '', liveOn, { ip: 'IE' })?.location === '/ie' && L.marketingRedirect('/features', '', liveOn, { ip: 'IE' })?.location === '/ie/features' && L.marketingRedirect('/ie', '', liveOn, {}) === null)
  t('the country menu maps /uk/compare → /ie/compare', L.switchCountryPath('/uk/compare', 'IE') === '/ie/compare')
  for (const [label, rows] of [['IE row switched off', ROWS.ieOff()], ['NO IE row at all (the live state when written)', ROWS.noIe()]]) {
    const r = await page('landing', 'ie', rows)
    t(`${label}: the /ie page itself redirects to /uk (the backstop behind the proxy's 302) and never throws`, r.redirectedTo === '/uk', r)
  }

  // ══ 2 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('2 · IRELAND SWITCHED ON (fixture) — /ie, /ie/features, /ie/compare in €')
  const ie = { landing: await page('landing', 'ie', ROWS.ieOn()), features: await page('features', 'ie', ROWS.ieOn()), compare: await page('compare', 'ie', ROWS.ieOn()) }
  if (process.env.IE1_HTML_OUT) {   // optional: the three switched-on pages' HTML, for a visual check against the build's CSS
    fs.mkdirSync(process.env.IE1_HTML_OUT, { recursive: true })
    for (const [k, r] of Object.entries(ie)) fs.writeFileSync(path.join(process.env.IE1_HTML_OUT, `ie-${k}.html`), r.html || '')
  }
  for (const [k, r] of Object.entries(ie)) {
    const tx = text(r.html || '')
    t(`/ie${k === 'landing' ? '' : '/' + k}: renders in €, no £ or $ amount`, !!r.html && /€\d/.test(tx) && !/£\d|\$\d/.test(tx), tx.match(/[£$€]\d[\d.,]*/g)?.slice(0, 8))
  }
  const ld = (() => { const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(ie.landing.html || ''); return m ? JSON.parse(m[1]) : null })()
  const offers = ld && (ld['@graph'] || []).find(n => n['@type'] === 'SoftwareApplication')?.offers
  t('JSON-LD: one Offer per public plan, priceCurrency EUR (0 / 29 / 69), url https://www.hatchgrab.com/ie',
    Array.isArray(offers) && offers.length === 3 && offers.every(o => o.priceCurrency === 'EUR') && offers.map(o => Number(o.price)).join(',') === '0,29,69'
    && (ld['@graph'] || []).find(n => n['@type'] === 'SoftwareApplication')?.url === 'https://www.hatchgrab.com/ie', offers)
  const fn = s => (text(s || '').match(/\* Plus \w+’s card processing on online card orders \(currently [^)]*\)/) || [''])[0]
  t('the footnote reads "(currently 1.5% + €0.25 in Ireland)" — landing and /features — never "in the Ireland"',
    fn(ie.landing.html).endsWith('(currently 1.5% + €0.25 in Ireland)') && fn(ie.features.html).endsWith('(currently 1.5% + €0.25 in Ireland)') && !/in the Ireland/.test(text(ie.landing.html) + text(ie.features.html)), [fn(ie.landing.html), fn(ie.features.html)])
  t('landing meta description reads "… for food trucks and mobile catering in Ireland — not a POS." (not "Ireland food trucks")',
    /software for food trucks and mobile catering in Ireland — not a POS\./.test(String(ie.landing.meta?.description)) && !/Ireland food trucks/.test(JSON.stringify(ie.landing.meta) + JSON.stringify(ld)), ie.landing.meta?.description)
  t('JSON-LD description: "… for food trucks and mobile catering in Ireland."', (ld?.['@graph'] || []).some(n => n.description === 'Ordering, pre-orders and a kitchen screen for food trucks and mobile catering in Ireland.'))
  t('titles: "… — HatchGrab Ireland"', /HatchGrab Ireland$/.test(String(ie.landing.meta?.title?.absolute ?? ie.landing.meta?.title)) && /HatchGrab Ireland$/.test(String(ie.compare.meta?.title?.absolute ?? ie.compare.meta?.title)), [ie.landing.meta?.title, ie.compare.meta?.title])
  const langs = m => m?.alternates?.languages || {}
  const sameSet = (a, b) => JSON.stringify(Object.entries(a || {}).sort()) === JSON.stringify(Object.entries(b || {}).sort())   // the same set, any order
  const uk = await page('landing', 'uk', ROWS.ieOn()), us = await page('landing', 'us', ROWS.ieOn())
  const want = { 'en-GB': 'https://www.hatchgrab.com/uk', 'en-US': 'https://www.hatchgrab.com/us', 'en-IE': 'https://www.hatchgrab.com/ie', 'x-default': 'https://www.hatchgrab.com/' }
  t('hreflang reciprocal: /uk, /us and /ie each list en-GB, en-US, en-IE and x-default (the same set)',
    [uk, us, ie.landing].every(r => sameSet(langs(r.meta), want)), [langs(uk.meta), langs(ie.landing.meta)])
  t('canonical and og:locale on /ie: https://www.hatchgrab.com/ie, en_IE', ie.landing.meta?.alternates?.canonical === 'https://www.hatchgrab.com/ie' && ie.landing.meta?.openGraph?.locale === 'en_IE', [ie.landing.meta?.alternates?.canonical, ie.landing.meta?.openGraph?.locale])
  t('/ie/features hreflang: en-IE → /ie/features', langs(ie.features.meta)['en-IE'] === 'https://www.hatchgrab.com/ie/features')
  t('the country menu on /uk has an "Ireland" link to /ie', /href="\/ie"/.test(uk.html || '') && /Ireland/.test(text(uk.html)))
  t('/ie shows the IE hero screenshots (€), /uk the GB ones', /\/screenshots\/kitchen-ie\.png/.test(ie.landing.html) && /\/screenshots\/customer-order-ie\.png/.test(ie.landing.html) && !/-ie\.png/.test(uk.html) && L.landingScreenshot('dashboard', 'IE') === '/screenshots/dashboard-v4-ie.png')
  t('the IE screenshot files exist at the GB pixel sizes', ['kitchen', 'dashboard-v4', 'customer-order'].every(n => {
    const a = fs.readFileSync(path.join(REPO, `public/screenshots/${n}-ie.png`)), b = fs.readFileSync(path.join(REPO, `public/screenshots/${n}.png`))
    return a.readUInt32BE(16) === b.readUInt32BE(16) && a.readUInt32BE(20) === b.readUInt32BE(20)
  }))
  const SM = await ctx.bundle('ie1-sitemap', "export { default } from '@/app/sitemap'\nexport { clearCountrySettingsCache as __c } from '@/lib/country-settings'")
  const sitemap = async rows => run(rows, async () => { SM.__c?.(); return SM.default() })
  const smOn = await sitemap(ROWS.ieOn())
  const ieEntry = smOn.find(e => e.url === 'https://www.hatchgrab.com/ie')
  t('sitemap (IE on): /ie and /ie/features listed, each with en-GB / en-US / en-IE / x-default alternates',
    !!ieEntry && smOn.some(e => e.url === 'https://www.hatchgrab.com/ie/features') && sameSet(ieEntry.alternates?.languages, want), ieEntry)

  // ══ 3 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · IRELAND OFF — /uk and /us carry no trace of it')
  for (const rows of [ROWS.ieOff(), ROWS.noIe()]) {
    const u = await page('landing', 'uk', rows), s = await page('landing', 'us', rows), f = await page('features', 'uk', rows)
    const all = (u.html || '') + (s.html || '') + (f.html || '') + JSON.stringify([u.meta, s.meta, f.meta])
    t(`${rows.length === 3 ? 'IE row off' : 'no IE row'}: no /ie link, no en-IE hreflang, no -ie screenshot, no € on /uk or /us`,
      !/href="\/ie|hatchgrab\.com\/ie|en-IE|-ie\.png|€\d/.test(all) && sameSet(langs(u.meta), { 'en-GB': want['en-GB'], 'en-US': want['en-US'], 'x-default': want['x-default'] }))
    const sm = await sitemap(rows)
    t(`${rows.length === 3 ? 'IE row off' : 'no IE row'}: the sitemap lists no /ie address`, !sm.some(e => /\/ie(\/|$)/.test(e.url)))
  }

  // ══ 4 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · WORDS — en-IE overrides four sentences; en-GB and en-US unchanged; sign-up refusals name-free')
  t('en-IE is a supported locale (exact match, no longer en-GB)', L.LOCALES.includes('en-IE') && L.resolveLocale('en-IE') === 'en-IE')
  const tr = (loc, ns) => L.translatorFor(loc, ns)
  const fee = { cardFee: '1.5% + 20p', country: 'UK' }
  t('en-GB footnote unchanged: "(currently 1.5% + 20p in the UK)"', tr('en-GB', 'pricing')('footnote', fee).includes('(currently 1.5% + 20p in the UK)'))
  t('en-US footnote unchanged: "(currently 2.9% + 30¢ in the US)"', tr('en-US', 'pricing')('footnote', { cardFee: '2.9% + 30¢', country: 'US' }).includes('(currently 2.9% + 30¢ in the US)'))
  t('en-IE footnote: "(currently 1.5% + €0.25 in Ireland)"', tr('en-IE', 'pricing')('footnote', { cardFee: '1.5% + €0.25', country: 'Ireland' }).includes('(currently 1.5% + €0.25 in Ireland)'))
  t('en-GB / en-US landing meta still "{country} food trucks" ("UK food trucks", "US food trucks"); en-IE "food trucks … in Ireland"',
    tr('en-GB', 'landing')('meta.description', { country: 'UK' }).includes('software for UK food trucks and mobile catering')
    && tr('en-US', 'landing')('meta.description', { country: 'US' }).includes('US food trucks')
    && tr('en-IE', 'landing')('meta.description', { country: 'Ireland' }).includes('software for food trucks and mobile catering in Ireland'))
  t('en-IE compare: "Cents per order" (en-GB keeps "Pence per order")', tr('en-IE', 'compare')('fee.fixedAria') === 'Cents per order' && tr('en-GB', 'compare')('fee.fixedAria') === 'Pence per order')
  t('every other en-IE word is en-GB (e.g. landing hero, pricing card words)', tr('en-IE', 'landing')('meta.title', { country: 'Ireland' }) === tr('en-GB', 'landing')('meta.title', { country: 'Ireland' }))
  const ieFile = JSON.parse(fs.readFileSync(path.join(REPO, 'messages/en-IE.json'), 'utf8'))
  const leaves = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? leaves(v, p + k + '.') : [p + k]))
  // ⚠️ RE-PINNED (anz-1, 21 October 2026): + the two approved "Pay at the truck" words (planFeatures.priceWord.payAtHatch,
  // planPrompt.features.online_ordering_pay_at_hatch.name) — en-GB alone keeps "Pay at Hatch"; scripts/anz-1.cjs §4 holds their text.
  t('messages/en-IE.json holds exactly six keys (ireland-1\'s four + anz-1\'s two "Pay at the truck" words)', JSON.stringify(leaves(ieFile).sort()) === JSON.stringify(['compare.fee.fixedAria', 'landing.jsonLd.description', 'landing.meta.description', 'planFeatures.priceWord.payAtHatch', 'planPrompt.features.online_ordering_pay_at_hatch.name', 'pricing.footnote']), leaves(ieFile))
  t('sign-up refusals are name-free ("Trucks in that country can’t sign up yet." / "… for that country.")',
    tr('en-GB', 'tradeArea')('country_off', { country: 'United States' }) === 'Trucks in that country can’t sign up yet. Choose another country.'
    && tr('en-GB', 'tradeArea')('zone_unknown', { country: 'United Kingdom' }) === 'That time zone isn’t one we offer for that country. Choose one from the list.')

  // ══ 5 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('5 · OUTREACH — a prospect\'s phone is read in its own country')
  const wa = (phone, country, methods = null) => L.phoneWhatsApp(phone, methods, L.prospectPhoneCountry({ country }))
  t('a prospect with no country (or a bad one) is read in GB, as every prospect was', L.prospectPhoneCountry({}) === 'GB' && L.prospectPhoneCountry({ country: 'gb' }) === 'GB' && L.prospectPhoneCountry({ country: 'Ireland' }) === 'GB' && L.prospectPhoneCountry(null) === 'GB')
  const gbCases = ['07700 900123', '+44 7700 900123', '01638 123456', '+44 (0)7700 900123', '0044 7700 900123', '', null]
  t('GB prospect: every case gives exactly what the old GB-only call gave', gbCases.every(p => JSON.stringify(wa(p, 'GB', 'whatsapp')) === JSON.stringify(L.phoneWhatsApp(p, 'whatsapp', 'GB'))))
  t('GB mobile → waPhone 447700900123, hint "advertises"; GB landline → hint "none"', wa('07700 900123', 'GB', 'whatsapp').waPhone === '447700900123' && wa('07700 900123', 'GB', 'whatsapp').hint === 'advertises' && wa('01638 123456', 'GB').hint === 'none')
  const ieMob = wa('087 123 4567', 'IE', 'WhatsApp, cash')
  t('IE prospect: "087 123 4567" → waPhone 353871234567, a mobile, hint "advertises"', ieMob.waPhone === '353871234567' && ieMob.isMobileNumber && ieMob.hint === 'advertises', ieMob)
  t('IE prospect: "+353 87 123 4567" → the same', wa('+353 87 123 4567', 'IE', 'whatsapp').waPhone === '353871234567')
  t('IE landline "01 234 5678" → waPhone 35312345678, not a mobile (hint "none")', wa('01 234 5678', 'IE').waPhone === '35312345678' && wa('01 234 5678', 'IE').hint === 'none')
  const oldIe = L.phoneWhatsApp('087 123 4567', null, 'GB').waPhone
  t('the same Irish number read in GB (the old behaviour) gave a WRONG number — +44 87… — the bug this fixes', oldIe !== '353871234567' && !oldIe.startsWith('353'), oldIe)
  t('US prospect: "(201) 555-0123" → waPhone 12015550123 (read in the US); "+1 201 555 0123" the same', wa('(201) 555-0123', 'US').waPhone === '12015550123' && wa('+1 201 555 0123', 'US').waPhone === '12015550123')
  t('US: no mobile/landline split (hint "none"), as before for every +1 number', wa('(201) 555-0123', 'US', 'whatsapp').hint === 'none' && L.phoneWhatsApp('+1 201 555 0123', 'whatsapp', 'GB').hint === 'none')

  // ══ 6 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('6 · AI PROMPTS — country-aware postcodes, an output language in each')
  const ts = (tz, loc) => ({ timeZone: tz, locale: loc, timeFormat: '24h', dateOrder: 'dmy', weekStart: 'monday' })
  const ctxOf = (code, name, fmt) => ({ truckName: 'Pizza Kitchen', countryName: name, countryCode: code, addressFormat: fmt })
  const pGB = L.buildScheduleExtractionPrompt('x', ts('Europe/London', 'en-GB'), ctxOf('GB', 'United Kingdom', 'postcode'))
  // ⚠️ RE-PINNED (address-formats-2, 21 October 2026): the location lines come from the truck's ADDRESS FORMAT now, not a
  // `code !== 'GB'` branch — Ireland's row holds 'ie' (address-formats-1's SQL), so the prompt is asked with it; Ireland's
  // lines are its own Eircode rules (lib/address-formats.ts IE_AI), still no UK postcode or UK example.
  const pIE = L.buildScheduleExtractionPrompt('x', ts('Europe/Dublin', 'en-IE'), ctxOf('IE', 'Ireland', 'ie'))
  const pUS = L.buildScheduleExtractionPrompt('x', { ...ts('America/Chicago', 'en-US'), timeFormat: '12h', dateOrder: 'mdy' }, ctxOf('US', 'United States', 'zip_state'))
  t('GB import prompt keeps its UK lines (UK venues, UK postcodes, the Burwell examples)', /knowledge of UK venues and locations/.test(pGB) && /UK postcodes follow the format/.test(pGB) && /The Fox Burwell/.test(pGB))
  t('IE import prompt: venues in Ireland, its own postal codes, no UK postcode, no UK example', /knowledge of venues and locations in Ireland/.test(pIE) && /"postcode" holds the Eircode/.test(pIE) && !/UK postcodes follow|Burwell|CB25|UK venue|valid UK postcode/.test(pIE))
  t('every import prompt names its output language ("Write anything else in English.")', [pGB, pIE, pUS].every(p => /OUTPUT LANGUAGE: copy venue names, towns and addresses exactly as the source writes them — never translate them\. Write anything else in English\./.test(p)))
  t('outputLanguageName: en-* → English; de-AT → German; nl-BE → Dutch; nonsense → English', L.outputLanguageName('en-IE') === 'English' && L.outputLanguageName('de-AT') === 'German' && L.outputLanguageName('nl-BE') === 'Dutch' && L.outputLanguageName('??') === 'English' && L.outputLanguageName(null) === 'English')
  const now = new Date('2026-10-20T10:00:00Z')
  const sGB = L.buildScreenshotPrompt(now, { code: 'GB', name: 'United Kingdom', addressFormat: 'postcode', dateOrder: 'dmy' })
  // ⚠️ RE-PINNED (address-formats-2, 21 October 2026): as above — Ireland's format, and its own Eircode lines.
  const sIE = L.buildScreenshotPrompt(now, { code: 'IE', name: 'Ireland', addressFormat: 'ie', dateOrder: 'dmy' })
  t('screenshot prompt: GB keeps "UK postcodes look like…"; IE names its Eircodes and no UK postcode', /UK postcodes look like "CB25 0BA"/.test(sGB) && /Eircodes look like "D02 X963", "V94 X2T6" — never a UK postcode/.test(sIE) && !/CB25/.test(sIE))
  t('screenshot prompts name their output language', [sGB, sIE, L.buildScreenshotPrompt(now)].every(p => /OUTPUT LANGUAGE: copy truck names, venue names and towns exactly as the screenshot writes them — never translate them\./.test(p)))

  // ══ 7 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('7 · DEMO — the demo event\'s date comes from `now`')
  kit.setNow('2026-10-20T12:00:00Z')
  t('a `now` on another day gives THAT day (23:30Z on 14 Oct is 15 Oct in London), whatever the clock says', L.demoEventWindow(new Date('2026-10-14T23:30:00Z'), 'Europe/London').date === '2026-10-15')
  let same = true
  for (const iso of ['2026-10-20T12:00:00Z', '2026-10-20T22:59:59Z', '2026-10-20T23:00:00Z', '2026-12-31T23:59:59Z', '2026-03-29T00:30:00Z', '2026-07-04T04:59:00Z']) {
    kit.setNow(iso)
    for (const tz of ['Europe/London', 'Europe/Dublin', 'America/Chicago', 'Pacific/Honolulu']) if (L.demoEventWindow(new Date(), tz).date !== L.getLocalDateInTz(tz)) same = false
  }
  t('every production caller passes the current time: then the date equals the real-clock date (6 instants × 4 zones, incl. midnight and DST edges)', same)

  // ══ 8 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('8 · PLANS PDF (IE) — masked while off, € and the footnote once on')
  const PDF = await ctx.bundle('ie1-pdf', "export { generatePlansPdf } from '@/lib/plans-pdf'\nexport { clearPlanCatalogCache as __p } from '@/lib/plans-server'\nexport { clearCountrySettingsCache as __c } from '@/lib/country-settings'")
  const pdf = rows => run(rows, async () => { PDF.__p(); PDF.__c?.(); globalThis.__pdfRec = {}; await PDF.generatePlansPdf('IE'); return globalThis.__pdfRec.html })
  const off = text(await pdf(ROWS.ieOff())), on = text(await pdf(ROWS.ieOn()))
  t('IE off: every amount masked ("TBC"), no €, no £', /TBC/.test(off) && !/€\d|£\d/.test(off), off.slice(0, 300))
  t('IE on: €0 / €29 / €69, €4,000 included, A4, no £ or $', /€0/.test(on) && /€29/.test(on) && /€69/.test(on) && /€4,000/.test(on) && !/£\d|\$\d/.test(on))
  t('IE on: the footnote "(currently 1.5% + €0.25 in Ireland)"', /\(currently 1\.5% \+ €0\.25 in Ireland\)/.test(on), on.match(/\(currently[^)]*\)/))
  for (const [n, html] of [['ie-off', await pdf(ROWS.ieOff())], ['ie-on', await pdf(ROWS.ieOn())]]) {
    const out = process.env.IE1_PDF_OUT
    if (out) { fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, `plans-pdf-${n}.html`), html) }
  }

  console.log(`\n${fail ? '🔴' : '✅'} ireland-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
