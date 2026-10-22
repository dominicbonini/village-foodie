// scripts/canada-1.cjs — CANADA, BUILT SWITCHED OFF, QUEBEC EXCLUDED (canada-1, 22 October 2026, docs/canada-1-report.md).
//
// LOCALHOST ONLY: fixture rows (the CA row PARSED FROM the NOT RUN SQL, scripts/_canada-1-fixtures.cjs), the real pages, PDF,
// sitemap, /llms.txt, order page, emails, ticket and order card rendered by the render kit. No database, no network. Checks:
//   1  CA SWITCHED ON (fixture) — /ca landing, /features, /compare and the PDF native in CAD ("$39", "$99") with the currency
//      line, 12-hour, en-CA words, JSON-LD in CAD, hreflang en-CA reciprocal, og:locale en_CA, the sitemap, /llms.txt (CA$39);
//   2  CA OFF / NO ROW (the live state) — /ca 302s to /uk and Canada is in no hreflang set, sitemap, menu or /llms.txt;
//   3  en-CA — written over en-US (LOCALE_PARENT): Canadian spelling, postal code, "in Canada", card terminal; every other
//      locale reads exactly its own chain, as before;
//   4  TAX BY PROVINCE (data on the address format) — the rules, the engine, the order page's checkout, the confirmation and
//      truck emails, the 58 / 80 mm ticket and the order card (the KDS) for ON (HST 13%), BC (GST 5%), AB (GST 5%) and SK
//      (GST + PST 11%); the truck's own rate still wins; no service fee in Canada; a US truck exactly as before;
//   5  ALLERGENS — the Canadian set (Health Canada's priority allergens), the loader, the CHECK SQL, the prompts, the WhatsApp
//      guard and caveat; uk14 / us9 / anz / no set byte-identical (hash pins taken before the change);
//   6  QUEBEC — a town picked in Quebec is refused at signup and in Where you trade, said plainly; elsewhere accepted;
//   7  MANAGE › TAX — the province's default shown under the rate box; a US truck's card unchanged;
//   8  THE RULE — no country-code or province-code check in the new code; the province data lives on the address format;
//   9  THE SQL — block A widens the CHECK, block B inserts CA switched off with the service fee off (and says why).
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const kit = require('./_render-kit.cjs')({ cacheTag: 'canada-1' })
const { REPO, h } = kit
const CF = require('./_canada-1-fixtures.cjs')
const LP1E = require('./_lp1e-fixtures.cjs')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 100 - s.length)))
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const text = s => String(s ?? '').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim()
const sha = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16)
const has = (s, ...parts) => parts.every(p => s.includes(p))
const code = f => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

;(async () => {
  const R = CF.renderer(kit, 'ca1')
  const caOn = CF.ROWS.caOn(), caOff = CF.ROWS.caOff(), noCa = CF.ROWS.noCa()
  const CA = await R.rowOf(caOn, 'CA')

  // ══ 1 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('1 · CANADA SWITCHED ON (fixture — the SQL\'s row with enabled = true)')
  const P = { landing: await R.page('landing', 'ca', caOn), features: await R.page('features', 'ca', caOn), compare: await R.page('compare', 'ca', caOn) }
  for (const [k, r] of Object.entries(P)) {
    const tx = text(r.html)
    const want = k === 'compare' ? ['$2,500'] : ['$39', '$99']
    t(`/ca${k === 'landing' ? '' : '/' + k}: renders in CAD's home form (${want.join(', ')}), under "Prices in Canadian dollars (CAD)"; no CA$, £ or € amount`,
      !!r.html && want.every(w => tx.includes(w)) && tx.split('Prices in Canadian dollars (CAD)').length === 2 && !/CA\$\d|£\d|€\d/.test(tx), { redirect: r.redirectedTo, seen: tx.match(/[A-Z]*\$\d[\d,.]*/g)?.slice(0, 8) })
  }
  const land = text(P.landing.html)
  t('the landing says "Pay at the truck" (not "Pay at Hatch") and the footnote "(currently 2.9% + 30¢ in Canada)"', has(land, 'Pay at the truck', '(currently 2.9% + 30¢ in Canada)') && !land.includes('Pay at Hatch'), land.match(/\(currently[^)]*\)/)?.[0])
  t('the cheapest bands from the data: Under $3,900 → Pay as you go · $3,900 – $11,600 → Pro · Over $11,600 → Unlimited', has(land, 'Under $3,900', '$3,900 – $11,600', 'Over $11,600'), land.match(/Which plan is cheapest.{0,160}/)?.[0])
  t('times on the page are 12-hour (no "18:00"-style time)', !/\b(1[3-9]|2[0-3]):[0-5]\d\b/.test(land))
  const meta = P.landing.meta
  t('landing meta: "… for food trucks and catering in Canada — not a POS."; title "… — HatchGrab Canada"; og:locale en_CA; canonical /ca',
    /for food trucks and catering in Canada — not a POS\./.test(String(meta?.description)) && /HatchGrab Canada$/.test(String(meta?.title?.absolute ?? meta?.title))
    && meta?.openGraph?.locale === 'en_CA' && meta?.alternates?.canonical === 'https://www.hatchgrab.com/ca', [meta?.description, meta?.title, meta?.openGraph?.locale])
  const ldOf = html => { const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html || ''); return m ? JSON.parse(m[1]) : null }
  const app = (ldOf(P.landing.html)?.['@graph'] || []).find(n => n['@type'] === 'SoftwareApplication')
  t('JSON-LD: one Offer per public plan in CAD (0, 39, 99), url https://www.hatchgrab.com/ca, Canada among countriesSupported',
    Array.isArray(app?.offers) && app.offers.every(o => o.priceCurrency === 'CAD') && app.offers.map(o => Number(o.price)).join(',') === '0,39,99' && app.url === 'https://www.hatchgrab.com/ca'
    && JSON.stringify(app.countriesSupported ?? '').includes('CA'), app?.offers)
  const uk = await R.page('landing', 'uk', caOn)
  const want = { 'en-GB': '/uk', 'en-US': '/us', 'en-IE': '/ie', 'en-AU': '/au', 'en-NZ': '/nz', 'en-CA': '/ca', 'x-default': '/' }
  const langsOf = m => Object.fromEntries(Object.entries(m?.alternates?.languages || {}).map(([k, v]) => [k, String(v).replace('https://www.hatchgrab.com', '')]))
  t('hreflang reciprocal: /uk and /ca both list en-GB, en-US, en-IE, en-AU, en-NZ, en-CA and x-default', [uk.meta, meta].every(m => JSON.stringify(Object.entries(langsOf(m)).sort()) === JSON.stringify(Object.entries(want).sort())), [langsOf(uk.meta), langsOf(meta)])
  t('/ca shows its own hero screenshots (Toronto fixture truck); /uk the GB ones; each file is the GB image\'s pixel size',
    /\/screenshots\/kitchen-ca\.png/.test(P.landing.html) && /\/screenshots\/customer-order-ca\.png/.test(P.landing.html) && !/-ca\.png/.test(uk.html)
    && ['kitchen', 'dashboard-v4', 'customer-order'].every(n => { const a = fs.readFileSync(path.join(REPO, `public/screenshots/${n}-ca.png`)), b = fs.readFileSync(path.join(REPO, `public/screenshots/${n}.png`)); return a.readUInt32BE(16) === b.readUInt32BE(16) && a.readUInt32BE(20) === b.readUInt32BE(20) }))
  t('the country menu on /uk links Canada (/ca)', /href="\/ca"/.test(uk.html) && text(uk.html).includes('Canada'))
  const pdf = await R.pdf(caOn, 'CA'), pdfTx = text(pdf)
  t('the plans PDF: $39 / $99, the line once in the small print, "in Canada", no CA$', has(pdfTx, '$39', '$99', 'in Canada') && pdf.split('Prices in Canadian dollars (CAD)').length === 2 && !/CA\$\d/.test(pdfTx))
  const sm = await R.sitemap(caOn)
  const caEntry = sm.find(e => e.url === 'https://www.hatchgrab.com/ca')
  t('sitemap: /ca and /ca/features listed, /ca with en-CA among its alternates', !!caEntry && sm.some(e => e.url === 'https://www.hatchgrab.com/ca/features') && caEntry.alternates?.languages?.['en-CA'] === 'https://www.hatchgrab.com/ca', caEntry)
  const llms = await R.llms(caOn)
  t('/llms.txt: "### Canada (CAD)", Pro CA$39 and Unlimited CA$99 — the international form, as Admin', has(llms, '### Canada (CAD)', 'Pro: CA$39 per truck per month', 'Unlimited: CA$99 per truck per month'), llms.slice(llms.indexOf('### Canada'), llms.indexOf('### Canada') + 300))

  // ══ 2 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('2 · CANADA OFF OR NO ROW (the live state today) — invisible')
  for (const [label, rows] of [['switched off', caOff], ['no CA row (live)', noCa]]) {
    const a = await R.page('landing', 'ca', rows), b = await R.page('compare', 'ca', rows)
    const u = await R.page('landing', 'uk', rows)
    const s = await R.sitemap(rows)
    t(`${label}: /ca → /uk and /ca/compare → /uk/compare; /uk has no en-CA hreflang and no /ca link; the sitemap has no /ca; /llms.txt no Canada`,
      a.redirectedTo === '/uk' && b.redirectedTo === '/uk/compare' && !('en-CA' in (u.meta?.alternates?.languages || {})) && !/href="\/ca"/.test(u.html) && !s.some(e => /\/ca(\/|$)/.test(e.url))
      && !(await R.llms(rows)).includes('Canada'), [a.redirectedTo, b.redirectedTo])
  }

  // ══ 3 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · en-CA — Canadian English, written over en-US')
  const I = await kit.bundle('ca1-i18n', "export { messagesFor } from '@/lib/i18n/messages'\nexport * from '@/lib/i18n/locales'\nexport { deepMerge } from '@/lib/i18n/merge'\nexport { translatorFor } from '@/lib/i18n/translator'\nimport '@/lib/i18n/catalog/privateEvents'\nimport '@/lib/i18n/catalog/posterWords'\nimport '@/lib/i18n/catalog/paymentActions'\nimport '@/lib/i18n/catalog/tradeArea'")
  t('en-CA is a locale, written over en-US (LOCALE_PARENT); every other locale\'s chain is itself alone', I.LOCALES.includes('en-CA') && JSON.stringify(I.overrideChain('en-CA')) === JSON.stringify(['en-US', 'en-CA'])
    && ['en-US', 'en-IE', 'en-AU', 'en-NZ'].every(l => JSON.stringify(I.overrideChain(l)) === JSON.stringify([l])) && JSON.stringify(I.overrideChain('en-GB')) === '[]')
  const J = f => JSON.parse(read(f))
  const enGB = J('messages/en-GB.json')
  t('every other locale reads exactly en-GB with its own file merged over it (the loader), as before', ['en-US', 'en-IE', 'en-AU', 'en-NZ'].every(l => JSON.stringify(I.messagesFor(l)) === JSON.stringify(I.deepMerge(enGB, J(`messages/${l}.json`))))
    && JSON.stringify(I.messagesFor('en-GB')) === JSON.stringify(enGB))
  t('en-CA reads en-GB, then en-US, then en-CA', JSON.stringify(I.messagesFor('en-CA')) === JSON.stringify(I.deepMerge(I.deepMerge(enGB, J('messages/en-US.json')), J('messages/en-CA.json'))))
  const flat = (o, p = '', out = {}) => { for (const [k, v] of Object.entries(o)) { const q = p ? p + '.' + k : k; if (v && typeof v === 'object') flat(v, q, out); else out[q] = v } return out }
  const ca = flat(I.messagesFor('en-CA')), us = flat(I.messagesFor('en-US'))
  const allCa = Object.values(ca).join('\n')
  t('Canadian spelling: no "canceled", "color", "favorite", "gray", "organised"; and "cancelled", "colour", "centre" are there',
    !/\bcanceled\b|\bcanceling\b|\bcolor\b|\bfavorite|\bgray\b|\borganised\b/.test(allCa.replace(/Austin Community Center|Round Rock Memorial Park Recreation Center/g, '').replace(ca['landing.testimonial.quote'], '')) && has(allCa, 'cancelled', 'colour', 'Centre'))
  t('…North American usage kept from en-US: "pickup", "window", "cart", "TBD", "Pay at the truck"', has(allCa, 'pickup', 'window', 'cart', 'TBD') && ca['planFeatures.priceWord.payAtHatch'] === 'Pay at the truck')
  t('"postal code" (not ZIP) in the private-event note; "card terminal" (not reader); "in Canada"-shaped frames', /no venue, town or postal code\./.test(ca['privateEvents.form.previewNote']) && !/card reader/.test(allCa) && /card terminal/.test(ca['paymentActions.paidCardMachine'])
    && /in \{country\}/.test(ca['pricing.footnote']) && /for food trucks and catering in \{country\}/.test(ca['landing.meta.description']) && /in \{country\}\.$/.test(ca['landing.jsonLd.description']))
  t('a customer\'s own words are never respelled: the testimonial keeps "organised"; real US venue names keep "Center"', ca['landing.testimonial.quote'] === us['landing.testimonial.quote'] && ca['posterWords.busyWeek.venue1'] === us['posterWords.busyWeek.venue1'])
  const CA_FILE = flat(J('messages/en-CA.json'))
  // The message's ICU skeleton — every argument, select / plural key and tag, the literal text removed (the real parser).
  const ICU = require(path.join(REPO, 'node_modules/@formatjs/icu-messageformat-parser'))
  const icuSkeleton = s => { const strip = n => Array.isArray(n) ? n.filter(x => x.type !== 0).map(strip) : n && typeof n === 'object' ? Object.fromEntries(Object.entries(n).filter(([k]) => k !== 'location').map(([k, v]) => [k, strip(v)])) : n
    try { return JSON.stringify(strip(ICU.parse(String(s), { ignoreTag: false }))) } catch (e) { return 'UNPARSEABLE ' + e.message } }
  t(`messages/en-CA.json is sparse: ${Object.keys(CA_FILE).length} keys, every one a key en-GB has, every ICU argument as en-US has it`,
    Object.keys(CA_FILE).length < 120 && Object.keys(CA_FILE).every(k => k in flat(enGB))
    && Object.keys(CA_FILE).every(k => icuSkeleton(CA_FILE[k]) === icuSkeleton(flat(I.deepMerge(enGB, J('messages/en-US.json')))[k])))
  const caNs = Object.keys(J('messages/en-CA.json')).sort(), caFiles = fs.readdirSync(path.join(REPO, 'messages/ns/en-CA')).map(f => f.replace(/\.json$/, '')).sort()
  t(`the client catalogue carries en-CA only where it overrides (${caNs.length} of ${Object.keys(enGB).length} namespaces); a namespace it does not touch imports no en-CA file`,
    JSON.stringify(caNs) === JSON.stringify(caFiles) && /'en-CA': enCA/.test(read('lib/i18n/catalog/pricing.ts'))
    && Object.keys(enGB).filter(ns => !caNs.includes(ns)).every(ns => !/en-CA/.test(read(`lib/i18n/catalog/${ns}.ts`))), { caNs, caFiles })

  // ══ 4 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · TAX BY PROVINCE — data on the address format; checkout, emails, ticket and order card')
  const ENG = await kit.bundle('ca1-engine', "export * as E from '@/lib/order-charges'\nexport * as L from '@/lib/order-charge-lines'\nexport * as R from '@/lib/order-charge-rules'\nexport * as AF from '@/lib/address-formats'\nexport * as Mail from '@/lib/email'\nexport * as T from '@/lib/printing/ticket'\nexport { mapOrderToTicket } from '@/lib/printing/mapOrderToTicket'")
  const { E, AF, Mail, T } = ENG
  const rules = (region, over = {}) => ENG.R.resolveChargeRules(CA, { country: 'CA', base_region_code: region, ...over })
  const CASES = [['ON', 'HST', 13000, 312], ['BC', 'GST', 5000, 120], ['AB', 'GST', 5000, 120], ['SK', 'GST + PST', 11000, 264], ['NS', 'HST', 14000, 336], ['NB', 'HST', 15000, 360]]
  for (const [rg, label, milli, taxMinor] of CASES) {
    const r = rules(rg)
    const c = E.computeOrderCharges({ foodMinor: 2400, rules: r, channel: 'online_pay_at_truck' })
    t(`${rg}: "${label}" at ${milli / 1000}% by default — $24.00 of food → ${label} $${(taxMinor / 100).toFixed(2)}`, r.taxInclusive === false && r.taxLabel === label && r.taxRateMilli === milli && c.taxMinor === taxMinor && c.snapshot.tax_label === label, [r.taxLabel, r.taxRateMilli, c.taxMinor])
  }
  t('the truck\'s own rate still wins (ON truck with 5%: "HST" at 5%); an unknown or missing province: the country\'s "Sales tax", no default rate',
    rules('ON', { tax_rate_milli: 5000 }).taxRateMilli === 5000 && rules('ON', { tax_rate_milli: 5000 }).taxLabel === 'HST' && rules(null).taxLabel === 'Sales tax' && rules(null).taxRateMilli === null && rules('ZZ').taxRateMilli === null)
  t('no service fee in Canada (the row says off — Competition Act s. 74.01(1.1)); tipping on, 10 / 15 / 20%', rules('ON', { service_fee_enabled: true, service_fee_bps: 300 }).serviceFee === null && JSON.stringify(rules('ON').tipping) === JSON.stringify({ presetsBps: [1000, 1500, 2000] }))
  const usRow = (await R.rowOf(caOn, 'US'))
  const usR = ENG.R.resolveChargeRules(usRow, { country: 'US', base_region_code: 'NJ', tax_rate_milli: 6625 })
  t('a US truck is exactly as before: its own rate, "Sales tax" (US states carry no tax data)', usR.taxLabel === 'Sales tax' && usR.taxRateMilli === 6625 && ENG.R.resolveChargeRules(usRow, { country: 'US', base_region_code: 'NJ' }).taxRateMilli === null)
  t('every Canadian province has its tax data except Quebec (closed); every US state none', AF.ADDRESS_FORMATS.ca.regions.list.every(r => (r.code === 'QC') === !r.salesTax) && AF.ADDRESS_FORMATS.us.regions.list.every(r => !r.salesTax && !r.signupClosed))
  t('the address formats still validate (sales tax named, 0–100 %, whole thousandths; a closed region has no tax)', AF.validateAddressFormats().length === 0, AF.validateAddressFormats())
  // the order page's checkout (390 first) — the real page with its states patched, as scripts/_phase3-screens-us.cjs does
  const OP = 'app/trucks/[slug]/order/page.tsx'
  const page = await kit.bundle('ca1-orderpage', `export { default as OrderPage } from '@/${OP}'\nexport { I18nContext } from '@/lib/i18n/use-t'`, {
    patches: [{ file: OP, states: ['truck', 'menu', 'events', 'event', 'eventLoading', 'loading', 'basket', 'appliedDeals', 'formSheetOpen', 'payByCard', 'tipSel', 'tipOther',
      'summaryExpanded', 'sheetSummaryExpanded', 'name', 'email'] }, { file: OP, from: 'const { slug } = use(params)', to: 'const { slug } = params' }],
  })
  const CAD = { currency: 'CAD', locale: 'en-CA' }
  const TIME = { timeZone: 'America/Toronto', locale: 'en-CA', timeFormat: '12h', dateOrder: 'mdy', weekStart: 'sunday' }
  const PHONE = { phoneCountry: 'CA', short_name: 'Canada', phone_example: '416-555-0123', phoneCheck: 'length' }
  const pizza = { id: 'p1', name: 'Margherita', price: 12, category: 'Pizza', available: true, modifierGroups: [], allergens: ['Milk', 'Wheat and triticale', 'Mustard'], dietary: ['Vegetarian'] }
  const OP_TRUCK = checkout => ({ id: 'ca-fixture', name: 'Pizza Kitchen', logo: null, mode: 'village', venue_name: null, time_selection_enabled: true, paused: false, plan: 'pro',
    ordering_available: true, card_payments_ready: true, money: CAD, phone: PHONE, time: TIME, allergen_display_mode: 'per_dish', ...(checkout ? { checkout } : {}) })
  const EV = { id: 'ev-1', date: '10/09/2026', date_iso: '2026-10-09', date_friendly: 'Friday, October 9', start_time: '17:00', end_time: '21:00', venue_name: 'Trinity Bellwoods Park', village: 'Toronto', notes: '', status: 'open', collection_interval_mins: 10 }
  const MENU = { categories: [{ id: 'c1', name: 'Pizza' }], items: [pizza], upsell_rules: [], bundles: [] }
  const view = (region, over = {}) => {
    const st = { truck: OP_TRUCK(E.checkoutRulesFrom(rules(region))), menu: MENU, events: [EV], event: EV, eventLoading: false, loading: false,
      basket: [{ menuItem: pizza, quantity: 2, modifiers: [], specialInstructions: '', cartKey: 'k1' }], appliedDeals: [],
      formSheetOpen: true, sheetSummaryExpanded: true, summaryExpanded: true, name: 'Ann', email: 'ann@example.test', ...over }
    return kit.renderWith(st, h(page.I18nContext.Provider, { value: { locale: 'en-CA', setLocale() {} } }, h(page.OrderPage, { params: { slug: 'ca-fixture' } }))).text.replace(/[  ]/g, ' ')
  }
  const CHECKOUT = { ON: 'Subtotal $24.00 HST 13% $3.12 Total $27.12', BC: 'Subtotal $24.00 GST 5% $1.20 Total $25.20', AB: 'Subtotal $24.00 GST 5% $1.20 Total $25.20', SK: 'Subtotal $24.00 GST + PST 11% $2.64 Total $26.64' }
  const pages = {}
  for (const [rg, line] of Object.entries(CHECKOUT)) {
    pages[rg] = view(rg, { payByCard: false })
    t(`order page, ${rg} truck (pay at the truck): "${line}"`, pages[rg].includes(line), pages[rg].match(/Subtotal.{0,80}/)?.[0])
  }
  const card = view('ON', { payByCard: true, tipSel: 1500 })
  t('order page, ON by card with a 15% tip: "Subtotal $24.00 HST 13% $3.12 Tip 15% $3.60 Total $30.72" — no service fee line', card.includes('Subtotal $24.00 HST 13% $3.12 Tip 15% $3.60 Total $30.72') && !card.includes('service fee $'), card.match(/Subtotal.{0,120}/)?.[0])
  t('order page: the menu shows the dish\'s Canadian allergens (Milk, Wheat and triticale, Mustard) and $12.00, no £ / €', has(pages.ON, 'Milk', 'Wheat and triticale', 'Mustard', '$12.00') && !/£|€/.test(pages.ON))
  t('order page: "Menu prices don’t include HST. It’s added below." (the acronym as written — "SK": "GST + PST"); times in 12-hour form',
    pages.ON.includes('Menu prices don’t include HST. It’s added below.') && pages.SK.includes('Menu prices don’t include GST + PST.') && /\b5:\d\dpm\b/.test(pages.ON) && !/\b(17|21):\d\d\b/.test(pages.ON), [pages.ON.match(/Menu prices[^.]*\./)?.[0], pages.ON.match(/\d{1,2}:\d\d ?[apAP]\.?[mM]\.?/g)?.slice(0, 3)])
  const usPage = kit.renderWith({ truck: { ...OP_TRUCK(E.checkoutRulesFrom(usR)), money: { currency: 'USD', locale: 'en-US' } }, menu: MENU, events: [EV], event: EV, eventLoading: false, loading: false,
    basket: [{ menuItem: pizza, quantity: 2, modifiers: [], specialInstructions: '', cartKey: 'k1' }], appliedDeals: [], formSheetOpen: true, sheetSummaryExpanded: true, summaryExpanded: true, name: 'Ann', email: 'a@b.test' },
    h(page.I18nContext.Provider, { value: { locale: 'en-US', setLocale() {} } }, h(page.OrderPage, { params: { slug: 'ca-fixture' } }))).text
  t('…a US truck\'s notice is unchanged: "Menu prices don’t include sales tax."', usPage.includes('Menu prices don’t include sales tax. It’s added below.'))
  // the emails, the ticket and the order card (the KDS shows the same card)
  const snap = rg => E.computeOrderCharges({ foodMinor: 2400, rules: rules(rg), channel: 'online_pay_at_truck' }).snapshot
  const base = { orderId: '41', orderKey: 'ok-1', truckName: 'Pizza Kitchen', customerName: 'Ann', slot: '12:30', items: [{ name: 'Margherita', quantity: 2, unit_price: 12, modifiers: [] }],
    deals: [], discountAmt: 0, notes: null, autoAccepted: true, phoneCountry: 'CA', money: CAD, time: TIME }
  for (const [rg, label, total] of [['ON', 'HST 13%: $3.12', '27.12'], ['BC', 'GST 5%: $1.20', '25.20'], ['AB', 'GST 5%: $1.20', '25.20'], ['SK', 'GST + PST 11%: $2.64', '26.64']]) {
    const conf = Mail.formatConfirmationEmail({ ...base, total: Number(total), charges: snap(rg) })
    t(`confirmation email, ${rg}: "Subtotal: $24.00 / ${label} / Total: $${total}"`, conf.text.includes(`Subtotal: $24.00\n${label}\nTotal: $${total}`), conf.text.match(/Subtotal[\s\S]{0,80}/)?.[0])
  }
  const truckMail = Mail.formatNewOrderEmail({ orderId: '41', customerName: 'Ann', slot: '12:30', items: base.items, deals: [], total: 27.12, notes: null, money: CAD, time: TIME, charges: snap('ON') })
  t('the truck\'s new-order email (ON): "Subtotal: $24.00. HST 13%: $3.12. Total $27.12."', truckMail.text.includes('Subtotal: $24.00. HST 13%: $3.12. Total $27.12.'), truckMail.text.slice(0, 300))
  for (const [rg, label, total] of [['ON', 'HST 13%', '27.12'], ['BC', 'GST 5%', '25.20'], ['AB', 'GST 5%', '25.20']]) {
    const order = { id: '41', order_key: 'ok-1', customer_name: 'Ann', customer_phone: null, slot: '12:30', buzzer_number: null, items: base.items, deals: [], notes: null,
      total: Number(total), total_minor: Math.round(Number(total) * 100), currency: 'CAD', country: 'CA', status: 'confirmed', ...snap(rg) }
    const truck = { name: 'Pizza Kitchen', money: { ...CAD, localeByCountry: { CA: 'en-CA' } }, time: TIME }
    const ticket = ENG.mapOrderToTicket({ order, truck, event: null, ledgerRows: [], printedLabel: '12:01' })
    for (const w of [58, 80]) {
      const lines = T.buildTicketLines(ticket, { paper_width: w }).map(l => l.text ?? (l.divider ? '----' : ''))
      const i = lines.findIndex(l => /^TOTAL/.test(l))
      t(`ticket ${w} mm, ${rg}: Subtotal $24.00 · ${label} · TOTAL $${total}, right-aligned`, new RegExp(`^${label.replace(/[+%]/g, m => '\\' + m)}\\s+\\$\\d+\\.\\d\\d$`).test(lines[i - 1]) && /^Subtotal\s+\$24\.00$/.test(lines[i - 2]) && new RegExp(`^TOTAL\\s+\\$${total.replace('.', '\\.')}$`).test(lines[i]) && lines[i].length === (w === 58 ? 32 : 48), lines.slice(i - 3, i + 1))
    }
  }
  const cards = await kit.bundle('ca1-cards', "export * from '@/components/dashboard/OrderCard'\nexport { MoneyProvider } from '@/components/MoneyContext'\nexport { I18nContext } from '@/lib/i18n/use-t'", { patches: [{ file: 'components/dashboard/OrderCard.tsx', states: ['chargesOpen'] }] })
  const ocOrder = { id: '41', order_key: 'ok-1', customer_name: 'Ann', customer_phone: null, customer_email: 'ann@example.test', slot: '12:30', event_date: '2026-10-09', event_id: 'ev-1',
    status: 'confirmed', items: base.items, deals: [], total: 27.12, total_minor: 2712, currency: 'CAD', country: 'CA', created_at: '2026-10-09T16:00:00Z', payment_status: 'unpaid', ...snap('ON') }
  let ocText = ''
  try {
    globalThis.__ms = { chargesOpen: true }
    ocText = text(kit.renderStatic(h(cards.I18nContext.Provider, { value: { locale: 'en-CA', setLocale() {} } }, h(cards.MoneyProvider, { fmt: CAD }, h(cards.OrderCard, { order: ocOrder, onAction() {}, onStatusChange() {}, time: TIME, truck: { time: TIME, money: CAD } })))))
  } catch (e) { ocText = 'ERROR ' + e.message } finally { delete globalThis.__ms }
  t('the order card (dashboard and KDS), ON, in en-CA: the "HST 13%" line and $3.12 under the items, and "Mark paid & picked up"', has(ocText, 'HST 13%', '$3.12', 'Mark paid & picked up'), ocText.slice(0, 400))

  // ══ 5 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('5 · ALLERGENS — the Canadian set; every other set byte-identical')
  const A = await kit.bundle('ca1-allergens', "export * from '@/lib/allergens'")
  const CA_LIST = ['Peanuts', 'Tree nuts', 'Sesame', 'Milk', 'Eggs', 'Fish', 'Crustaceans', 'Molluscs', 'Soy', 'Wheat and triticale', 'Mustard', 'Added sulphites', 'Gluten (barley, oats, rye)']
  t('the set list is uk14, us9, anz, ca; the ca list is Health Canada\'s priority allergens (13 entries)', JSON.stringify(A.ALLERGEN_SETS) === JSON.stringify(['uk14', 'us9', 'anz', 'ca']) && JSON.stringify(A.allergenVocab('ca')) === JSON.stringify(CA_LIST))
  const extractSrc = read('lib/menu-extract.ts')
  const surf = set => ({
    allergenVocab: JSON.stringify(A.allergenVocab(set)), genericReplacements: JSON.stringify(A.genericReplacements(set)),
    menuExtractAllergenLines: A.menuExtractAllergenLines(set), menuExtractAllergenExample: A.menuExtractAllergenExample(set),
    allergenCardListLines: A.allergenCardListLines(set), allergenCardClosingRule: A.allergenCardClosingRule(set),
    allergenCardExample: JSON.stringify(A.allergenCardExample(set)), localiseExampleAllergens: A.localiseExampleAllergens(extractSrc, set),
  })
  // 🔴 PINNED before the change (canada-1, at fadb352f): every helper's output for the existing sets, and the guard's answers.
  const PIN_HELPERS = {
    uk14: ['fdeda71441c71e6f', '1ec60ccf49050fb3', 'b050abf66792e8bf', 'a5b6223c428895d1', '07aad49476144e13', 'cb7ff6a0fd2d0476', 'f9b41d0e25ee5bb0', 'cba23472980b35ba'],
    us9: ['d3d4f9367cc39c76', 'bcfe72e79ffc67cf', '55221a15531f5ad1', '3c36623fa73c5a1c', '8ac04563d876b465', 'e9f1454272951852', '17e043915796b436', 'cba23472980b35ba'],
    anz: ['2847fabfc17ddd1f', 'e93c604979ec3f00', '349a05d12bce86fd', 'd9d661e59235ddfe', '1b0d70d4c28b2f28', '87dc6635d80e6f97', '688f89402b0a735d', '47533616ddc933e9'],
  }
  for (const [set, pins] of [['uk14', PIN_HELPERS.uk14], ['us9', PIN_HELPERS.us9], ['anz', PIN_HELPERS.anz], [null, PIN_HELPERS.uk14]]) {
    const got = Object.values(surf(set)).map(sha)
    t(`${String(set)}: all eight allergen helpers byte-identical to before (hash pins)`, JSON.stringify(got) === JSON.stringify(pins), got)
  }
  t('every ca prompt label is a ca label; the generic refinements land only on ca labels', JSON.parse(A.menuExtractAllergenExample('ca')).every(x => CA_LIST.includes(x)) && CA_LIST.every(x => A.allergenCardListLines('ca').includes(x) && A.menuExtractAllergenLines('ca').includes(x))
    && Object.values(A.genericReplacements('ca')).flat().every(x => CA_LIST.includes(x)) && Object.values(A.allergenCardExample('ca')).every(v => JSON.parse(v).every(x => ['Nuts', 'Shellfish'].includes(x) || CA_LIST.includes(x))))
  const loc = A.localiseExampleAllergens(extractSrc, 'ca')
  t('the importer\'s worked examples are localised for ca (Dairy → Milk, Gluten → Wheat and triticale; no UK-only label left)', loc.includes('Cheese → ["Milk"]') && loc.includes('"allergens": ["Milk", "Wheat and triticale", "Eggs"]') && !/"allergens": \["Dairy|Halloumi → \["Dairy"\]/.test(loc))
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  // ⚠️ RE-PINNED (languages-1, 22 October 2026, docs/languages-1-report.md §3): the guard's words are DATA now
  // (lib/allergen-guard/en.json), read by lib/allergen-guard.ts — evaluated here as built, for an English truck. Its answers are
  // the ones the lists in lib/whatsapp-classifier.ts gave (scripts/languages-1.cjs §6 proves 1,190 messages × 5 sets identical).
  const gBuilt = esbuild.buildSync({ entryPoints: [path.join(REPO, 'lib/allergen-guard.ts')], bundle: true, write: false, platform: 'node', format: 'cjs', alias: { '@': REPO }, logLevel: 'silent' })
  const gMod = { exports: {} }; new Function('module', 'exports', 'require', gBuilt.outputFiles[0].text)(gMod, gMod.exports, require)
  const guard = (m, set) => gMod.exports.mentionsAllergen(m, set, 'en-GB')
  const guardWords = JSON.parse(fs.readFileSync(path.join(REPO, 'lib/allergen-guard/en.json'), 'utf8'))
  const CORPUS = ['my son has an EpiPen', 'she carries an epi-pen', 'anaphylaxis to peanuts — is the satay safe?', 'I am anaphylactic to sesame', 'is the burger NF?', 'LF options?',
    'is it gluten free?', 'GF?', 'coeliac friendly?', 'celiac?', 'dairy-free please', 'I am allergic to milk', 'can I have it free from shellfish', 'is it peanut-free?', 'nut free?',
    'does the satay have peanuts?', 'any sesame on the bun?', 'Are you open today', 'what time do you close', 'is it a nice day', 'any mustard in the sauce?', 'does it contain sulphites?']
  const PIN_GUARD = { uk14: '77c6fab357f4855d', us9: '77c6fab357f4855d', anz: '9c1006e0007ce1d5', null: '77c6fab357f4855d' }
  t('the WhatsApp guard: uk14 / us9 / anz / no set answer the 22-message corpus exactly as before', Object.entries(PIN_GUARD).every(([s, pin]) => sha(JSON.stringify(CORPUS.map(m => guard(m, s === 'null' ? null : s)))) === pin))
  t('ca: the safety phrasing is caught (EpiPen, epi-pen, anaphylaxis, peanut-free); a presence question still reaches the AI (Option B)',
    ['my son has an EpiPen', 'she carries an epi-pen', 'anaphylaxis to peanuts — is the satay safe?', 'is it peanut-free?', 'is it gluten free?', 'celiac?'].every(m => guard(m, 'ca'))
    && ['does the satay have peanuts?', 'any mustard in the sauce?', 'Are you open today'].every(m => !guard(m, 'ca')))
  t('the reply caveat widens to the Canadian family words for a ca truck only (its own list, beside anz\'s)', !!guardWords.caveatWords.ca.milk && !!guardWords.caveatWords.anz.milk
    && gMod.exports.caveatTriggerWords(['Crustaceans'], 'ca', 'en-CA').has('shrimp') && !gMod.exports.caveatTriggerWords(['Crustaceans'], 'anz', 'en-AU').has('shrimp') && !gMod.exports.caveatTriggerWords(['Crustaceans'], 'uk14', 'en-GB').has('shrimp'))
  const Lo = await R.lib()
  t('the settings loader accepts allergen_set "ca" (the SQL\'s row loads) and the admin form offers "Canada 13"', CA.allergenSet === 'ca' && /\['ca', 'Canada 13'\]/.test(read('components/admin/CountriesTab.tsx')) && /f\.allergenSet !== 'ca'/.test(read('lib/admin/country-form.ts')) && typeof Lo.mapCountryRow === 'function')

  // ══ 6 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('6 · QUEBEC — refused at signup and in Where you trade, said plainly')
  const TA = await kit.bundle('ca1-trade', "export * from '@/lib/trade-area'\nexport { baseAnswerErrors } from '@/components/setup/WhereBasedStep'\nexport { translatorFor } from '@/lib/i18n/translator'\nimport '@/lib/i18n/catalog/tradeArea'")
  const pick = (code, name) => ({ base_place_id: 'gp-1', base_place_name: name, base_region: code === 'QC' ? 'Quebec' : 'Ontario', base_lat: 45.5, base_lng: -73.6, base_region_code: code, timezone: 'America/Toronto' })
  const qc = TA.checkTradeArea(pick('QC', 'Montréal'), CA), on = TA.checkTradeArea(pick('ON', 'Toronto'), CA)
  const words = r => TA.translatorFor('en-CA', 'tradeArea')(r.code, r.params)
  t('a town picked in Quebec is refused: "Trucks based in Quebec can’t sign up yet: HatchGrab isn’t available in French yet. If your truck is based somewhere else, choose that town or city."',
    qc.ok === false && qc.code === 'region_closed' && words(qc) === 'Trucks based in Quebec can’t sign up yet: HatchGrab isn’t available in French yet. If your truck is based somewhere else, choose that town or city.', qc.ok === false ? words(qc) : qc)
  t('…a town in Ontario is accepted, with its province code kept', on.ok === true && on.values.base_region_code === 'ON')
  const sc = { code: 'CA', name: 'Canada', timezones: CA.timezones, defaultTimezone: CA.defaultTimezone, addressFormat: 'ca' }
  const stepErr = TA.baseAnswerErrors({ country: 'CA', timezone: 'America/Toronto', place: { placeId: 'gp-1', name: 'Montréal', region: 'Quebec', lat: 45.5, lng: -73.6, regionCode: 'QC' } }, [sc])
  t('the signup step itself refuses it (the same check, the same code) before anything is sent', stepErr.town?.code === 'region_closed' && stepErr.town?.params?.region === 'Quebec')
  t('/api/setup, provisioning and Manage › Where you trade all run checkTradeArea with the country row (so its address format)', /checkTradeArea\(\{[\s\S]{0,300}base_region_code: body\.base_region_code,[\s\S]{0,20}\}, countryRow\)/.test(read('app/api/setup/route.ts'))
    && /checkTradeArea\(body, cs\)/.test(read('app/api/manage/route.ts')) && /checkTradeArea\(\{ \.\.\.opts\.tradeArea/.test(read('lib/provision-truck.ts')))
  t('Quebec\'s closure is DATA on the region (signupClosed, needsLanguage "French"), not a code check', AF.ADDRESS_FORMATS.ca.regions.list.find(r => r.code === 'QC').signupClosed?.needsLanguage === 'French'
    && !/'QC'/.test(code('lib/trade-area.ts')) && !/'QC'/.test(code('components/setup/WhereBasedStep.tsx')))
  t('a typed town with no pick has no province, so it is not refused (named in the report: Places is how a province is known)', TA.checkTradeArea({ base_place_name: 'Montréal', timezone: 'America/Toronto' }, CA).ok === true)

  // ══ 7 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('7 · MANAGE › PAYMENTS › TAX — the province\'s default, under the box')
  const CC = await LP1E.context(kit, REPO).bundle('ca1-charges', "export { ChargesCard } from '@/components/manage/ChargesCard'\nexport { CountrySettingsProvider } from '@/components/CountrySettingsProvider'\nexport { I18nContext } from '@/lib/i18n/use-t'")
  const chargesHtml = (settings, truck, locale) => kit.renderStatic(h(CC.I18nContext.Provider, { value: { locale, setLocale() {} } }, h(CC.CountrySettingsProvider, { value: settings, settings }, h(CC.ChargesCard, { truck, api: async () => null, showToast() {}, onTruckUpdate() {} }))))
  let onHtml = '', usHtml = ''
  try { onHtml = chargesHtml(CA, { base_region_code: 'ON', tax_rate_milli: null }, 'en-CA'); usHtml = chargesHtml(usRow, { base_region_code: 'NJ', tax_rate_milli: 6625 }, 'en-US') } catch (e) { onHtml = 'ERROR ' + e.message }
  t('an Ontario truck with no rate: the box\'s placeholder is 13, and under it "Leave it empty to charge HST at 13%, the rate on prepared food in Ontario."',
    /placeholder="13"/.test(onHtml) && text(onHtml).includes('Leave it empty to charge HST at 13%, the rate on prepared food in Ontario.'), text(onHtml).slice(0, 400))
  t('a US truck: placeholder "0" and no province line (its card as before)', /placeholder="0"/.test(usHtml) && !/data-region-tax/.test(usHtml))

  // ══ 8 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('8 · THE RULE — data, not country-code checks')
  const changed = ['lib/order-charge-rules.ts', 'lib/trade-area.ts', 'components/manage/ChargesCard.tsx', 'components/setup/WhereBasedStep.tsx', 'lib/i18n/messages.ts', 'lib/i18n/registry.ts', 'lib/whatsapp-classifier.ts']
  const cc = changed.filter(f => /(===|!==)\s*'(CA|QC|ON|BC|AB|SK|MB)'|'(CA|QC)'\s*(===|!==)|countryCode\s*===/.test(code(f)))
  t('no country- or province-code comparison in the changed code', cc.length === 0, cc)
  t('the per-province tax and Quebec\'s closure live on the address format\'s region list (lib/address-formats.ts), and the CA row picks that format', /salesTax: CA_TAX\.hst13/.test(read('lib/address-formats.ts')) && CA.addressFormat === 'ca')
  // ⚠️ RE-PINNED (france-1, 22 October 2026): France's /fr follows Canada's entry in the same table.
  t('Canada has its address /ca (COUNTRY_PATH_SEGMENTS) — the one table that gives a country a page', /CA: 'ca'(, FR: 'fr')? \}/.test(read('lib/marketing-country.ts')))
  t('the CA phone example passes the app\'s phone check (416-555-0123, NANPA\'s fictional range)', await (async () => { const Ph = await kit.bundle('ca1-phone', "export { isPlausiblePhone } from '@/lib/phone'"); return Ph.isPlausiblePhone('416-555-0123', 'CA', 'length') && !Ph.isPlausiblePhone('416-555', 'CA', 'length') })())

  // ══ 9 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('9 · THE NOT RUN SQL')
  const A_SQL = read('supabase/migrations/20261031_canada_allergen_set.sql'), { row, prices, sql } = CF.sqlRows()
  t('block A widens the allergen CHECK to uk14, us9, anz, ca (and says it runs before block B)', /check \(allergen_set in \('uk14', 'us9', 'anz', 'ca'\)\)/.test(A_SQL) && /BEFORE block B/.test(A_SQL))
  t('block B inserts CA switched OFF: CAD, en-CA, 12h, mdy, Sunday, km, +1, format ca, prices exclude tax, Toronto first', row.enabled === false && row.currency === 'CAD' && row.locale === 'en-CA' && row.time_format === '12h' && row.date_order === 'mdy'
    && row.week_start === 'sunday' && row.distance_unit === 'km' && row.phone_country_code === '1' && row.address_format === 'ca' && row.prices_include_tax === false && row.default_timezone === 'America/Toronto' && row.timezones[0] === 'America/Toronto')
  t('…the card processor\'s Canadian fees (2.9% + 30¢ online, 2.7% + 5¢ in person, Tap to Pay +15¢, "Canadian cards"), surcharges off, allergen set ca, card mode allowed', row.card_fee_online_pct === 2.9 && row.card_fee_online_fixed_minor === 30 && row.card_fee_in_person_pct === 2.7
    && row.card_fee_in_person_fixed_minor === 5 && row.tap_to_pay_fixed_minor === 15 && row.card_fee_region_label === 'Canadian cards' && row.card_surcharge_allowed === false && row.allergen_set === 'ca' && row.allergen_card_only_allowed === true)
  t('…SERVICE FEE OFF, and the row\'s comment says why (Competition Act s. 74.01(1.1), drip pricing) so it is not switched on by accident; tipping on, 10 / 15 / 20',
    row.service_fee_allowed === false && /SERVICE FEE OFF — DO NOT SWITCH ON WITHOUT LEGAL ADVICE/.test(sql) && /Competition Act s\. 74\.01\(1\.1\)/.test(sql) && row.tipping_enabled_default === true && JSON.stringify(row.tip_presets_pct) === '[10,15,20]')
  t('…plan_prices: payg 0 / 0 / 99 bps / 0 · pro 3900 incl. 550000, 99 bps, van 3900 · unlimited 9900, no fee, van 9900',
    JSON.stringify(prices.map(p => [p.plan_key, p.monthly_minor, p.included_online_minor, p.fee_bps, p.extra_van_monthly_minor])) === JSON.stringify([['payg', 0, 0, 99, 0], ['pro', 3900, 550000, 99, 3900], ['unlimited', 9900, null, 0, 9900]]))
  t('…the current tzdb Canadian zones (no Yellowknife: an alias of Edmonton since tzdb 2023)', JSON.stringify(row.timezones) === JSON.stringify(['America/Toronto', 'America/Vancouver', 'America/Edmonton', 'America/Winnipeg', 'America/Regina', 'America/Halifax', 'America/St_Johns', 'America/Moncton', 'America/Whitehorse', 'America/Iqaluit']))

  console.log(`\n${fail ? '🔴' : '✅'} canada-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
