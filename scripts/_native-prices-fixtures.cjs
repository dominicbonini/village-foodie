// scripts/_native-prices-fixtures.cjs — the country rows, plan catalogue and page renderer for native-prices (22 October
// 2026, docs/native-prices-report.md). A MODULE: scripts/native-prices.cjs and the before / after snapshot read the SAME
// inputs from here.
//
// GB, US (switched on), IE, AU and NZ are the rows the existing harnesses use (scripts/_lp1e-fixtures.cjs, ireland-1, anz-1).
// CA and SE are FIXTURES ONLY: no such country row exists. ⚠️ RE-PINNED (canada-1, 22 October 2026): CA has its real page
// address now (/ca, lib/marketing-country.ts); SE still has none. `page(…, { extraSegments: true })`
// gives them one INSIDE THE HARNESS BUNDLE (a patch of lib/marketing-country.ts's COUNTRY_PATH_SEGMENTS), so the real
// landing, /features and /compare render for them; the app's own list is untouched. Their prices are illustrative (CAD 39,
// SEK 29 — the brief's examples), chosen to show the format, not proposed.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
const path = require('path')
const LP1E = require('./_lp1e-fixtures.cjs')
const { seedCatalog } = require('./_plans-catalog-fixture.cjs')

const snake = LP1E.snake

/** IE — scripts/ireland-1.cjs's row. */
const IE = () => ({
  ...LP1E.GB(), countryCode: 'IE', name: 'Ireland', enabled: true, currency: 'EUR', locale: 'en-IE', phoneCountryCode: '353',
  timezones: ['Europe/Dublin'], defaultTimezone: 'Europe/Dublin',
  starterMonthlyMinor: null, proMonthlyMinor: null, maxMonthlyMinor: null, proAllowanceMinor: null, maxAllowanceMinor: null, platformFeePct: null,
  cardFeeOnlinePct: 1.5, cardFeeOnlineFixedMinor: 25, cardFeeInPersonPct: 1.4, cardFeeInPersonFixedMinor: 10, tapToPayFixedMinor: 10,
  cardFeeRegionLabel: 'EEA cards', shortName: 'Ireland', phoneExample: '085 123 4567', updatedBy: 'europe-readiness draft',
})

/** AU / NZ — scripts/anz-1.cjs's rows. */
const ANZ_ROW = { starterMonthlyMinor: null, proMonthlyMinor: null, maxMonthlyMinor: null, proAllowanceMinor: null, maxAllowanceMinor: null, platformFeePct: null,
  timeFormat: '12h', dateOrder: 'dmy', weekStart: 'monday', addressFormat: 'postcode', pricesIncludeTax: true, taxLabel: 'GST', allergenSet: 'anz',
  cardSurchargeAllowed: false, cardSurchargeCapPct: null, cardSurchargeCreditOnly: false, cardSurchargeExcludedRegions: [], serviceFeeAllowed: false,
  tippingEnabledDefault: false, tipPresetsPct: [], phoneCheck: 'length', distanceUnit: 'km', serviceFeeRecipient: 'truck', platformFeeEnabled: false, feesTaxed: false,
  competitorName: null, competitorPct: null, competitorFixedMinor: null, supportHours: null, updatedBy: 'anz-1 draft' }
const AU = () => ({
  ...LP1E.GB(), ...ANZ_ROW, countryCode: 'AU', name: 'Australia', enabled: true, currency: 'AUD', locale: 'en-AU', phoneCountryCode: '61',
  timezones: ['Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Adelaide', 'Australia/Darwin', 'Australia/Perth', 'Australia/Hobart'],
  defaultTimezone: 'Australia/Sydney', cardFeeOnlinePct: 1.65, cardFeeOnlineFixedMinor: 30, cardFeeInPersonPct: 1.65, cardFeeInPersonFixedMinor: 10,
  tapToPayFixedMinor: 15, cardFeeRegionLabel: 'Australian cards', shortName: 'Australia', phoneExample: '0412 345 678',
})
const NZ = () => ({
  ...LP1E.GB(), ...ANZ_ROW, countryCode: 'NZ', name: 'New Zealand', enabled: true, currency: 'NZD', locale: 'en-NZ', phoneCountryCode: '64',
  timezones: ['Pacific/Auckland', 'Pacific/Chatham'], defaultTimezone: 'Pacific/Auckland',
  cardFeeOnlinePct: 2.65, cardFeeOnlineFixedMinor: 30, cardFeeInPersonPct: 2.6, cardFeeInPersonFixedMinor: 5,
  tapToPayFixedMinor: 15, cardFeeRegionLabel: 'New Zealand cards', shortName: 'New Zealand', phoneExample: '021 123 4567',
})
/** CA / SE — fixtures only (see the header). */
const CA = () => ({
  ...LP1E.GB(), ...ANZ_ROW, countryCode: 'CA', name: 'Canada', enabled: true, currency: 'CAD', locale: 'en-CA', phoneCountryCode: '1',
  timezones: ['America/Toronto'], defaultTimezone: 'America/Toronto', pricesIncludeTax: false, taxLabel: 'tax', allergenSet: 'uk14', addressFormat: 'ca',
  cardFeeOnlinePct: 2.9, cardFeeOnlineFixedMinor: 30, cardFeeInPersonPct: 2.6, cardFeeInPersonFixedMinor: 10,
  tapToPayFixedMinor: 15, cardFeeRegionLabel: 'Canadian cards', shortName: 'Canada', phoneExample: '416 555 0123', updatedBy: 'native-prices fixture',
})
const SE = () => ({
  ...LP1E.GB(), ...ANZ_ROW, countryCode: 'SE', name: 'Sweden', enabled: true, currency: 'SEK', locale: 'sv-SE', phoneCountryCode: '46', timeFormat: '24h',
  timezones: ['Europe/Stockholm'], defaultTimezone: 'Europe/Stockholm', taxLabel: 'moms', allergenSet: 'uk14', addressFormat: 'gb',
  cardFeeOnlinePct: 1.5, cardFeeOnlineFixedMinor: 180, cardFeeInPersonPct: 1.4, cardFeeInPersonFixedMinor: 100,
  tapToPayFixedMinor: 100, cardFeeRegionLabel: 'EEA cards', shortName: 'Sweden', phoneExample: '070 123 45 67', updatedBy: 'native-prices fixture',
})

/** [monthlyMinor, includedOnlineMinor, feeBps, extraVanMonthlyMinor] per plan, for the countries the seed does not price. */
const PRICES = {
  AU: { payg: [0, 0, 99, 0], pro: [3900, 550000, 99, 3900], unlimited: [9900, null, 0, 9900] },
  NZ: { payg: [0, 0, 99, 0], pro: [4900, 700000, 99, 4900], unlimited: [11900, null, 0, 11900] },
  CA: { payg: [0, 0, 99, 0], pro: [3900, 550000, 99, 3900], unlimited: [9900, null, 0, 9900] },
  SE: { payg: [0, 0, 99, 0], pro: [2900, 400000, 99, 2900], unlimited: [7900, null, 0, 7900] },
}
const CATALOG = () => {
  const c = seedCatalog(path.resolve(__dirname, '..'))
  for (const p of c.prices.filter(p => p.countryCode === 'GB')) {
    c.prices.push({ ...p, countryCode: 'IE' })
    for (const cc of Object.keys(PRICES)) {
      const [monthlyMinor, includedOnlineMinor, feeBps, extraVanMonthlyMinor] = PRICES[cc][p.planKey]
      c.prices.push({ ...p, countryCode: cc, monthlyMinor, includedOnlineMinor, feeBps, extraVanMonthlyMinor })
    }
  }
  return c
}
const tablesOf = c => ({ plans: c.plans.map(snake), plan_prices: c.prices.map(snake), plan_features: c.features.map(snake) })

/** The five live countries (all switched on — the live state, 21 October 2026) and the two fixtures. */
const LIVE = () => [LP1E.GB(), LP1E.US_ON(), IE(), AU(), NZ()]
const WITH_FIXTURES = () => [...LIVE(), CA(), SE()]
const SEG = { GB: 'uk', US: 'us', IE: 'ie', AU: 'au', NZ: 'nz', CA: 'ca', SE: 'se' }
const ROUTE = { landing: 'app/[country]/page', features: 'app/[country]/features/page', compare: 'app/[country]/compare/page' }
// ⚠️ RE-PINNED (canada-1, 22 October 2026): Canada has its real address now (/ca), so only the SE fixture is patched in.
const SEGMENTS_FROM = "export const COUNTRY_PATH_SEGMENTS: Readonly<Record<string, string>> = { GB: 'uk', US: 'us', IE: 'ie', AU: 'au', NZ: 'nz', CA: 'ca' }"
const SEGMENTS_TO = "export const COUNTRY_PATH_SEGMENTS: Readonly<Record<string, string>> = { GB: 'uk', US: 'us', IE: 'ie', AU: 'au', NZ: 'nz', CA: 'ca', SE: 'se' }"

/** A renderer over one LP1E context: `page(p, cc)` renders landing / features / compare for a country (HTML + metadata),
 *  `pdf(cc)` the plans PDF's HTML, `llms(ccs)` the /llms.txt body. Live countries render with the LIVE rows; CA and SE with
 *  the fixtures added and their segments patched in (their own bundles, so the live views never see the patch). */
function renderer(kit, REPO, tag) {
  const { h } = kit
  const ctx = LP1E.context(kit, REPO)
  const catalog = CATALOG()
  const tables = tablesOf(catalog)
  const mods = {}
  const extra = cc => cc === 'CA' || cc === 'SE'
  const modOf = (p, x) => (mods[p + x] ||= ctx.bundle(`${tag}-${p}${x ? '-x' : ''}`,
    `export * from '@/${ROUTE[p]}'\nexport { default } from '@/${ROUTE[p]}'\nexport { clearPlanCatalogCache as __clearPlans } from '@/lib/plans-server'\nexport { clearCountrySettingsCache as __clearCs } from '@/lib/country-settings'`,
    x ? { patches: [{ file: 'lib/marketing-country.ts', from: SEGMENTS_FROM, to: SEGMENTS_TO }] } : {}))
  const rowsOf = cc => (extra(cc) ? WITH_FIXTURES() : LIVE())
  async function page(p, cc) {
    const M = await modOf(p, extra(cc))
    return ctx.withReq({ rows: rowsOf(cc), tables }, async () => {
      M.__clearPlans(); M.__clearCs?.()
      const args = { params: Promise.resolve({ country: SEG[cc] }), searchParams: Promise.resolve({}) }
      const meta = await M.generateMetadata(args, Promise.resolve({ openGraph: {} }))
      const html = await ctx.prerender(h(M.default, args))
      return { html, meta }
    })
  }
  let libP
  const lib = () => (libP ||= ctx.bundle(`${tag}-lib`, [
    "export { buildPlansPdfHtml } from '@/lib/plans-pdf'",
    "export { llmsText } from '@/lib/llms-text'",
    "export { mapCountryRow } from '@/lib/country-settings'",
  ].join('\n')))
  const rowOf = async cc => { const L = await lib(); return L.mapCountryRow(snake(rowsOf(cc).find(r => r.countryCode === cc))) }
  async function pdf(cc) { const L = await lib(); return L.buildPlansPdfHtml(await rowOf(cc), catalog) }
  async function llms(ccs) { const L = await lib(); return L.llmsText(await Promise.all(ccs.map(rowOf)), catalog) }
  return { ctx, catalog, tables, page, pdf, llms, rowOf, lib }
}

module.exports = { IE, AU, NZ, CA, SE, LIVE, WITH_FIXTURES, PRICES, CATALOG, SEG, renderer }
