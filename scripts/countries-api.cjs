#!/usr/bin/env node
// scripts/countries-api.cjs — the admin Countries routes' rules, round trip, stale refusal, add and remove.
//   node scripts/countries-api.cjs          (≈ 2 s — one esbuild bundle, NO NETWORK, NO DATABASE)
//
// ── WHAT RUNS ─────────────────────────────────────────────────────────────────────────────────────────
// The REAL lib/admin/country-actions.ts (what app/api/admin/countries/route.ts calls) and the REAL
// lib/admin/country-form.ts, bundled with esbuild. Only the CountryStore is swapped: an in-memory table,
// seeded from the GB and US seed migrations that were run, which behaves like the service-role store —
// one row per write, the stale-save condition in its WHERE — and which ALSO enforces every CHECK on
// public.country_settings (20261010_02). 🔴 THAT IS THE POINT OF THE SECOND HALF: each bad input must be
// refused by the actions with a plain sentence BEFORE the table's CHECK could fire, so a run where any
// CHECK fires is a failure even if the request was refused.
//
// ⚠️ WHAT THIS CANNOT PROVE: that PostgREST's `.eq('updated_at', …)` matches the string the loader read
// back (the live stale condition). That needs an admin session against the real table; the report gives
// the by-hand steps. Everything else the routes do is here.

const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')
const { gbFromSeed, usFromSeed } = require('./_country-settings-gb.cjs')
const { seedCatalog } = require('./_plans-catalog-fixture.cjs')
// ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): the enabled rule is no longer a CHECK on
// country_settings but the trigger country_settings_require_plan_prices (20261024_plans.sql) — a country can be
// switched on only when every ACTIVE PUBLIC plan has a plan_prices row for it. The store below models that trigger
// on the SEEDED catalogue (GB and US priced; a new country such as ZZ is not), with the trigger's own message.
const CATALOG = seedCatalog()
if (!CATALOG) { console.error('🔴 no plans migration (supabase/migrations/20261024_plans.sql) — this harness needs it'); process.exit(1) }

const ok = [], bad = []
const t = (name, cond) => (cond ? ok : bad).push(name)

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// THE IN-MEMORY TABLE — and the database's CHECKs, as a second line that must never be reached
// ══════════════════════════════════════════════════════════════════════════════════════════════════
const COL = { // column → field, exactly lib/admin/country-form.ts valuesToColumns + the identity columns
  country_code: 'countryCode', name: 'name', enabled: 'enabled', currency: 'currency', locale: 'locale',
  time_format: 'timeFormat', date_order: 'dateOrder', week_start: 'weekStart', phone_country_code: 'phoneCountryCode',
  short_name: 'shortName', phone_example: 'phoneExample', // Phase 2C (20261010_11)
  phone_check: 'phoneCheck', // 20261010_12
  address_format: 'addressFormat', timezones: 'timezones', default_timezone: 'defaultTimezone',
  prices_include_tax: 'pricesIncludeTax', tax_label: 'taxLabel', card_surcharge_allowed: 'cardSurchargeAllowed',
  card_surcharge_cap_pct: 'cardSurchargeCapPct', card_surcharge_credit_only: 'cardSurchargeCreditOnly',
  card_surcharge_excluded_regions: 'cardSurchargeExcludedRegions', service_fee_allowed: 'serviceFeeAllowed',
  tipping_enabled_default: 'tippingEnabledDefault', tip_presets_pct: 'tipPresetsPct', allergen_set: 'allergenSet',
  starter_monthly_minor: 'starterMonthlyMinor', pro_monthly_minor: 'proMonthlyMinor', max_monthly_minor: 'maxMonthlyMinor',
  pro_allowance_minor: 'proAllowanceMinor', max_allowance_minor: 'maxAllowanceMinor', platform_fee_pct: 'platformFeePct',
  card_fee_online_pct: 'cardFeeOnlinePct', card_fee_online_fixed_minor: 'cardFeeOnlineFixedMinor',
  card_fee_in_person_pct: 'cardFeeInPersonPct', card_fee_in_person_fixed_minor: 'cardFeeInPersonFixedMinor',
  tap_to_pay_fixed_minor: 'tapToPayFixedMinor', card_fee_region_label: 'cardFeeRegionLabel', support_hours: 'supportHours',
  updated_at: 'updatedAt', updated_by: 'updatedBy',
  // Phase 3 (20261010_17)
  service_fee_recipient: 'serviceFeeRecipient', service_fee_hatchgrab_bps: 'serviceFeeHatchgrabBps',
  service_fee_hatchgrab_fixed_minor: 'serviceFeeHatchgrabFixedMinor', service_fee_truck_max_bps: 'serviceFeeTruckMaxBps',
  service_fee_truck_max_fixed_minor: 'serviceFeeTruckMaxFixedMinor', platform_fee_enabled: 'platformFeeEnabled', fees_taxed: 'feesTaxed',
}
let checkFired = []
let triggerFired = []
/** 20261024_plans.sql's country_settings_require_plan_prices, one for one: BEFORE INSERT OR UPDATE, when the row is
 *  switched on, every active public plan (by sort order) must have a plan_prices row for its code — else it raises. */
function requirePlanPrices(r, prices) {
  if (!r.enabled) return
  const missing = CATALOG.plans.filter(p => p.active && p.isPublic)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter(p => !prices.some(pp => pp.planKey === p.key && pp.countryCode === r.countryCode))
    .map(p => p.key)
  if (missing.length) {
    triggerFired.push(r.countryCode)
    throw new Error(`country_settings: ${r.countryCode} cannot be switched on — no plan_prices row for: ${missing.join(', ')}`)
  }
}
/** Retired plan price columns: still on the table (nullable, no default), never written by the form any more. */
const RETIRED = ['starterMonthlyMinor', 'proMonthlyMinor', 'maxMonthlyMinor', 'proAllowanceMinor', 'maxAllowanceMinor', 'platformFeePct']
const RETIRED_COLS = ['starter_monthly_minor', 'pro_monthly_minor', 'max_monthly_minor', 'pro_allowance_minor', 'max_allowance_minor', 'platform_fee_pct']
/** 20261010_02's CHECKs, one for one. */
function dbChecks(r) {
  const v = []
  const pct = x => x === null || (x >= 0 && x <= 100)
  if (!/^[A-Z]{2}$/.test(r.countryCode)) v.push('code_chk')
  if (!/^[A-Z]{3}$/.test(r.currency)) v.push('currency_chk')
  if (!/^[1-9][0-9]{0,2}$/.test(r.phoneCountryCode)) v.push('phone_chk')
  if (!['24h', '12h'].includes(r.timeFormat)) v.push('time_format_chk')
  if (!['dmy', 'mdy'].includes(r.dateOrder)) v.push('date_order_chk')
  if (!['monday', 'sunday'].includes(r.weekStart)) v.push('week_start_chk')
  // ⚠️ RE-PINNED (address-formats-1, 21 October 2026): the CHECK of supabase/migrations/20261028_address_formats.sql — the
  // keys of lib/address-formats.ts (was 'postcode' | 'zip_state'). A save now writes the format KEY the form picked.
  if (!['gb', 'us', 'ie', 'au', 'nz', 'ca'].includes(r.addressFormat)) v.push('address_format_chk')
  if (!['uk14', 'us9'].includes(r.allergenSet)) v.push('allergen_set_chk')
  if (!['length', 'strict', 'off'].includes(r.phoneCheck)) v.push('phone_check_chk')   // 20261010_12
  if (!r.timezones.includes(r.defaultTimezone)) v.push('default_tz_chk')
  for (const k of ['cardSurchargeCapPct', 'platformFeePct', 'cardFeeOnlinePct', 'cardFeeInPersonPct']) if (!pct(r[k])) v.push(k + '_pct_chk')
  if (!r.tipPresetsPct.every(x => x !== null && x >= 0 && x <= 100)) v.push('tip_presets_chk')
  for (const k of ['starterMonthlyMinor', 'proMonthlyMinor', 'maxMonthlyMinor', 'proAllowanceMinor', 'maxAllowanceMinor',
    'cardFeeOnlineFixedMinor', 'cardFeeInPersonFixedMinor', 'tapToPayFixedMinor']) if (r[k] !== null && !(r[k] >= 0)) v.push('minor_nonneg_chk')
  // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): country_settings_enabled_needs_prices_chk is DROPPED —
  // its rule is now the trigger modelled in makeStore (requirePlanPrices), not a CHECK.
  if (typeof r.name !== 'string' || typeof r.taxLabel !== 'string' || typeof r.cardFeeRegionLabel !== 'string') v.push('not_null')
  // 20261010_17's three country_settings CHECKs (a NULL passes each), and its NOT NULL booleans.
  if (!['truck', 'hatchgrab'].includes(r.serviceFeeRecipient)) v.push('service_fee_recipient_chk')
  if (![r.serviceFeeHatchgrabBps, r.serviceFeeTruckMaxBps].every(x => x === null || (x >= 0 && x <= 10000))) v.push('service_fee_bps_chk')
  if (![r.serviceFeeHatchgrabFixedMinor, r.serviceFeeTruckMaxFixedMinor].every(x => x === null || x >= 0)) v.push('service_fee_fixed_chk')
  if (typeof r.platformFeeEnabled !== 'boolean' || typeof r.feesTaxed !== 'boolean') v.push('not_null')
  return v
}
function makeStore(seed, trucks, opts = {}) {
  const rows = new Map(seed.map(r => [r.countryCode, structuredClone(r)]))
  const s = {
    writes: 0, raceOnce: null,
    rows,
    prices: structuredClone(CATALOG.prices), // public.plan_prices, as seeded
    lastColumns: null,                       // the columns the last update/insert was asked to write
    async list() { return [...rows.values()].map(r => structuredClone(r)).sort((a, b) => a.name.localeCompare(b.name)) },
    async get(code) { return rows.has(code) ? structuredClone(rows.get(code)) : null },
    async truckCounts(codes) { return Object.fromEntries(codes.map(c => [c, trucks[c] ?? 0])) },
    async update(code, expected, cols) {
      if (s.raceOnce) { const f = s.raceOnce; s.raceOnce = null; f() }   // someone else saves in between
      const row = rows.get(code)
      if (!row || row.updatedAt !== expected) return null               // 🔴 WHERE updated_at = expected
      const next = { ...row }
      s.lastColumns = Object.keys(cols)
      for (const [c, v] of Object.entries(cols)) { if (!(c in COL)) throw new Error('unknown column ' + c); next[COL[c]] = v }
      if (!opts.noTrigger) requirePlanPrices(next, s.prices)   // BEFORE UPDATE trigger
      const v = dbChecks(next); if (v.length) { checkFired.push(...v); throw new Error('CHECK ' + v.join(',')) }
      rows.set(code, next); s.writes++
      return structuredClone(next)
    },
    async insert(cols) {
      const next = Object.fromEntries(RETIRED.map(k => [k, null]))  // a column not written is NULL
      s.lastColumns = Object.keys(cols)
      for (const [c, v] of Object.entries(cols)) { if (!(c in COL)) throw new Error('unknown column ' + c); next[COL[c]] = v }
      if (rows.has(next.countryCode)) { checkFired.push('pkey'); throw new Error('duplicate key') }
      if (!opts.noTrigger) requirePlanPrices(next, s.prices)   // BEFORE INSERT trigger
      const v = dbChecks(next); if (v.length) { checkFired.push(...v); throw new Error('CHECK ' + v.join(',')) }
      rows.set(next.countryCode, next); s.writes++
      return structuredClone(next)
    },
    async remove(code) { const had = rows.delete(code); if (had) s.writes++; return had ? 1 : 0 },
  }
  return s
}

;(async () => {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const out = await esbuild.build({
    stdin: { contents: "export * as A from '@/lib/admin/country-actions'\nexport * as F from '@/lib/admin/country-form'", resolveDir: REPO, loader: 'ts' },
    bundle: true, write: false, platform: 'node', format: 'cjs', target: 'node20', alias: { '@': REPO }, logLevel: 'silent',
  })
  const file = path.join(REPO, 'node_modules/.cache/countries-api.cjs')
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, out.outputFiles[0].text)
  const { A, F } = require(file)

  // ⚠️ RE-PINNED (address-formats-1, 21 October 2026): the store holds rows AS THE LOADER RETURNS THEM, and the loader now
  // reads the seeds' legacy address_format as its format key ('postcode' → gb, 'zip_state' → us; lib/country-settings.ts).
  const asLoaded = r => ({ ...r, addressFormat: ({ postcode: 'gb', zip_state: 'us' })[r.addressFormat] ?? r.addressFormat })
  const GB = asLoaded(gbFromSeed()), US = asLoaded(usFromSeed())
  GB.updatedAt = '2026-10-10T08:00:00.000000+00:00'; US.updatedAt = '2026-10-10T08:00:00.000000+00:00'
  let n = 0
  const stamp = () => ({ by: 'admin@example.test', at: `2026-10-10T09:00:${String(n++).padStart(2, '0')}.000Z` })
  const fresh = () => makeStore([GB, US], { GB: 14, US: 0 })
  const messages = []
  const save = async (store, code, mutate, opts = {}) => {
    const row = await store.get(code)
    const form = F.rowToForm(row); mutate && mutate(form)
    const r = await A.saveCountry(store, { code, expectedUpdatedAt: opts.expected ?? row.updatedAt, form: opts.raw ?? form }, stamp())
    if (!r.ok) messages.push(r.error, ...(r.errors ?? []).map(e => e.message))
    return r
  }

  console.log('── 1 · LIST ──────────────────────────────────────────────────────────────────────────────')
  {
    const s = fresh()
    const r = await A.listCountries(s, 'GB')
    t('the marketing country first, then by name, with truck counts',
      r.ok && r.data.countries.map(c => c.countryCode).join() === 'GB,US' && r.data.truckCounts.GB === 14 && r.data.truckCounts.US === 0)
  }

  console.log('── 2 · A SAVE ROUND-TRIPS EXACTLY (major ↔ minor) ───────────────────────────────────────')
  {
    const s = fresh()
    // GB, unchanged: every stored value comes back byte for byte.
    const r0 = await save(s, 'GB')
    const keys = Object.keys(GB).filter(k => !['updatedAt', 'updatedBy'].includes(k))
    t('🔴 saving GB unchanged writes back EXACTLY what was there — every one of its values',
      r0.ok && keys.every(k => JSON.stringify(r0.data.country[k]) === JSON.stringify(GB[k])))
    t('…and stamps who and when', r0.ok && r0.data.country.updatedBy === 'admin@example.test' && r0.data.country.updatedAt !== GB.updatedAt)
    // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): the six plan price boxes are GONE from the form
    // (plans and prices are public.plans / public.plan_prices). Was: GB's price boxes read 29.00 · 49.00 · 1,500 ·
    // 2,000 · 0.99. Now: the form has NO plan price box, and the card fee boxes still read as typed.
    const PRICE_BOXES = ['starterMonthly', 'proMonthly', 'maxMonthly', 'proAllowance', 'maxAllowance', 'platformFeePct']
    t('🔴 the form has NO plan price box; GB\'s card fee boxes read as typed: 1.5 + 20 · 1.4 + 10 · 10', (() => {
      const f = F.rowToForm(GB)
      return PRICE_BOXES.every(k => !(k in f)) && !('PLAN_PRICE_FORM_FIELDS' in F) && !('emptyPlanPrices' in F)
        && f.cardFeeOnlinePct === '1.5' && f.cardFeeOnlineFixed === '20'
        && f.cardFeeInPersonPct === '1.4' && f.cardFeeInPersonFixed === '10' && f.tapToPayFixed === '10'
    })())
    // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): was "US prices typed in major units are stored in
    // minor units". Now: plan prices smuggled into a save are IGNORED — no retired column is written, and the
    // stored retired values (still read by the frozen display copy) are left exactly as they were.
    const usBefore = await s.get('US')
    const r1 = await save(s, 'US', f => Object.assign(f, {
      starterMonthly: '0', proMonthly: '19.99', maxMonthly: '1,234.56', proAllowance: '1,500', maxAllowance: '2000.5', platformFeePct: '0.95',
    }))
    const c = r1.ok && r1.data.country
    t('🔴 plan prices smuggled into a save are ignored: the save is OK and writes NO retired column',
      r1.ok && Array.isArray(s.lastColumns) && RETIRED_COLS.every(col => !s.lastColumns.includes(col)))
    t('…and the stored retired values are untouched', c && RETIRED.every(k => JSON.stringify(c[k]) === JSON.stringify(usBefore[k])))
    t('…and a save of what was read back changes nothing', await (async () => {
      const again = await save(s, 'US')
      return again.ok && Object.keys(c).filter(k => !['updatedAt', 'updatedBy'].includes(k)).every(k => JSON.stringify(again.data.country[k]) === JSON.stringify(c[k]))
    })())
    t('🔴 US is still OFF — a save never switches a country on', c && c.enabled === false)
    t('🔴 …and valuesToColumns names no retired column', (() => {
      const cols = Object.keys(A.valuesToColumns(F.formToValues(F.rowToForm(GB), { truckCount: 0, storedCurrency: 'GBP', countryCode: 'GB' }).values))
      return cols.length > 30 && RETIRED_COLS.every(col => !cols.includes(col))
    })())
    // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): was "the decimals come from the column's currency —
    // 2900 typed in JPY is 2900 stored; 29.5 in JPY refused". No box is typed in major units any more, so a JPY
    // country saves with its retired prices untouched, and a smuggled '29.5' is neither refused nor stored.
    // ⚠️ RE-PINNED (currency-registry, 21 October 2026): a country may only hold a currency lib/currencies.ts lists, so
    // the JPY country is REFUSED now (the registry has no JPY); the smuggled-price rule is proven on a registry currency
    // (CHF) instead — it saves, and a smuggled '29.5' is neither refused nor stored.
    const s2 = makeStore([GB, US, { ...US, countryCode: 'JP', name: 'Japan', currency: 'JPY', locale: 'ja-JP' }], { GB: 14 })
    const rj = await save(s2, 'JP', f => Object.assign(f, { proMonthly: '29.5' }))
    t('🔴 a JPY country is refused — JPY is not a currency we support', !rj.ok && JSON.stringify(rj.errors ?? rj).includes('Currency must be one we support'), rj)
    const s3 = makeStore([GB, US, { ...US, countryCode: 'CH', name: 'Switzerland', currency: 'CHF', locale: 'de-CH', phoneCountryCode: '41', phoneExample: '044 668 18 00' }], { GB: 14 })
    const rc = await save(s3, 'CH', f => Object.assign(f, { proMonthly: '29.5' }))
    t('🔴 a CHF country saves; a smuggled 29.5 plan price is neither refused nor stored', rc.ok && rc.data.country.proMonthlyMinor === US.proMonthlyMinor)
  }

  console.log('── 3 · EVERY RULE REFUSES WITH ITS PLAIN MESSAGE, BEFORE ANY CHECK ───────────────────────')
  const RULES = [
    // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): 'switching on with a plan price missing' is no longer
    // a form rule refused BEFORE the database — it IS the database trigger's rule now; see section 3b.
    ['changing the currency while trucks use the country', 'GB', f => { f.currency = 'USD' }, "The currency can't change while 14 trucks use this country."],
    // ⚠️ RE-PINNED (currency-registry, 21 October 2026): the message names the registry's currencies (lib/currencies.ts).
    ['a currency that is not a code', 'US', f => { f.currency = 'Dollars' }, 'Currency must be one we support: GBP, USD, EUR, CAD, AUD, NZD, CHF, SEK, NOK, DKK, PLN, CZK, HUF, RON.'],
    ['a currency code that does not exist', 'US', f => { f.currency = 'QQQ' }, 'Currency must be one we support: GBP, USD, EUR, CAD, AUD, NZD, CHF, SEK, NOK, DKK, PLN, CZK, HUF, RON.'],
    ['a real currency we do not support', 'US', f => { f.currency = 'JPY' }, 'Currency must be one we support: GBP, USD, EUR, CAD, AUD, NZD, CHF, SEK, NOK, DKK, PLN, CZK, HUF, RON.'],
    ['an empty country name', 'US', f => { f.name = '  ' }, 'Give the country a name.'],
    // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): the three plan price box rules (not an amount, three
    // decimals, our fee above 100) are gone with the boxes — section 2 asserts such values are ignored, never written.
    ['a percentage with three decimals', 'US', f => { f.cardFeeOnlinePct = '2.905' }, 'Online card payments (%) must be a percentage between 0 and 100, with at most 2 decimal places.'],
    ['an empty card percentage', 'US', f => { f.cardFeeInPersonPct = '' }, "In-person card payments (%) can't be empty."],
    ['a fixed fee that is not a whole number', 'US', f => { f.cardFeeOnlineFixed = '30.5' }, "Online card payments (fixed part) must be a whole number of the currency's smallest unit, like 20."],
    ['an empty fixed fee', 'US', f => { f.tapToPayFixed = '' }, "Extra for Tap to Pay can't be empty — type 0 for none."],
    ['an empty tax name', 'US', f => { f.taxLabel = '' }, 'Give the tax a name, like VAT or Sales tax.'],
    ['an empty card description', 'US', f => { f.cardFeeRegionLabel = '' }, 'Say which cards these rates are for, like UK cards.'],
    ['a card fee cap above 100', 'US', f => { f.cardSurchargeCapPct = '101' }, 'Card fee cap must be a percentage between 0 and 100, with at most 2 decimal places.'],
    ['a region that is not a code', 'US', f => { f.cardSurchargeExcludedRegions = ['Connecticut'] }, "“CONNECTICUT” isn't a region code — use a short code like CT or MA."],
    ['a region twice', 'US', f => { f.cardSurchargeExcludedRegions = ['CT', 'ct'] }, 'Each region can only appear once.'],
    ['a tip above 100', 'US', f => { f.tipPresetsPct = ['10', '150'] }, 'Tip choices must be percentages between 0 and 100, with at most 2 decimal places.'],
    ['a tip twice', 'US', f => { f.tipPresetsPct = ['10', '10'] }, 'Each tip choice can only appear once.'],
    ['a language style that is not one', 'US', f => { f.locale = 'english please' }, 'Language style must look like en-GB or en-US.'],
    ['a phone code that is too long', 'US', f => { f.phoneCountryCode = '1234' }, 'Phone country code must be 1 to 3 digits, like 44 or 1.'],
    ['a phone code starting 0', 'US', f => { f.phoneCountryCode = '044' }, 'Phone country code must be 1 to 3 digits, like 44 or 1.'],
    ['no time zones', 'US', f => { f.timezones = []; f.defaultTimezone = '' }, 'Offer at least one time zone.'],
    ['a time zone that does not exist', 'US', f => { f.timezones = [...f.timezones, 'Mars/Base_One'] }, "“Mars/Base_One” isn't a time zone we recognise."],
    ['a default zone that is not offered', 'US', f => { f.defaultTimezone = 'Europe/London' }, 'The default time zone has to be one of the zones offered.'],
    ['an unknown time format', 'US', f => { f.timeFormat = 'metric' }, 'Choose 24-hour or 12-hour times.'],
    ['an unknown date order', 'US', f => { f.dateOrder = 'ymd' }, 'Choose day first or month first.'],
    ['an unknown week start', 'US', f => { f.weekStart = 'friday' }, 'Choose Monday or Sunday.'],
    ['an unknown address style', 'US', f => { f.addressFormat = 'grid' }, 'Choose how addresses are written.'],
    ['an unknown allergen list', 'US', f => { f.allergenSet = 'eu14' }, 'Choose an allergen list.'],
    ['support hours that are too long', 'US', f => { f.supportHours = 'x'.repeat(201) }, 'Support hours are too long (200 characters at most).'],
  ]
  for (const [what, code, mutate, want] of RULES) {
    const s = fresh(); checkFired = []
    const before = JSON.stringify(await s.get(code))
    const r = await save(s, code, mutate)
    const unchanged = JSON.stringify(await s.get(code)) === before && s.writes === 0
    const got = !r.ok && (r.errors ?? []).some(e => e.message === want)
    t(`🔴 ${what} → “${want}”`, got && r.status === 400 && unchanged && checkFired.length === 0)
    if (!got) console.log(`      got: ${JSON.stringify(r.ok ? 'SAVED' : r.errors)}`)
  }
  {
    const s = fresh()
    const row = await s.get('US')
    const r = await A.saveCountry(s, { code: 'US', expectedUpdatedAt: row.updatedAt, form: { ...F.rowToForm(row), countryCode: 'XX' } }, stamp())
    messages.push(r.ok ? '' : r.error)
    t("🔴 the country code cannot change after creation → “The country code can't change after the country is created.”",
      !r.ok && r.error === "The country code can't change after the country is created." && s.writes === 0)
    const r2 = await A.saveCountry(s, { code: 'US', expectedUpdatedAt: row.updatedAt, form: { name: 'x' } }, stamp())
    t('…and a malformed save is refused whole, never half-applied', !r2.ok && r2.status === 400 && s.writes === 0)
  }

  console.log('── 3b · SWITCHING ON NEEDS EVERY PUBLIC PLAN PRICED — the trigger\'s rule, in the page\'s words ──')
  // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): was RULES' "switching on with a plan price missing →
  // Can't switch on until the 6 plan prices are filled in." (a form rule, before any CHECK). The rule is now the
  // trigger country_settings_require_plan_prices; saveCountry maps its error ("cannot be switched on") to a 400
  // with ENABLE_NEEDS_PRICES on the field 'enabled'.
  {
    const WANT = "Can't switch on until every public plan has a price for this country (see Plans)."
    t('the page\'s sentence is the exported ENABLE_NEEDS_PRICES', F.ENABLE_NEEDS_PRICES + '.' === WANT)
    const s = fresh(); checkFired = []; triggerFired = []
    const z = await A.addCountry(s, { code: 'ZZ', name: 'Zedland', copyFrom: 'US' }, stamp())
    const before = JSON.stringify(await s.get('ZZ')); const w0 = s.writes
    const r = await save(s, 'ZZ', f => { f.enabled = true })
    t(`🔴 switching on a country with no plan_prices rows (ZZ) → “${WANT}” on 'enabled', 400, nothing written`,
      z.ok && !r.ok && r.status === 400 && r.error === WANT && (r.errors ?? []).length === 1
      && r.errors[0].field === 'enabled' && r.errors[0].message === WANT
      && JSON.stringify(await s.get('ZZ')) === before && s.writes === w0)
    t('…refused by the TRIGGER (the only thing that knows the catalogue), and no CHECK fired', triggerFired.join() === 'ZZ' && checkFired.length === 0)
    t('…and the database\'s own words never reach the page', !messages.some(m => /cannot be switched on|plan_prices/.test(m)))
    // One public plan priced is not enough — every ACTIVE PUBLIC plan must be.
    s.prices.push({ ...CATALOG.prices.find(p => p.countryCode === 'US' && p.planKey === 'pro'), countryCode: 'ZZ' })
    const r2 = await save(s, 'ZZ', f => { f.enabled = true })
    t('🔴 …still refused with only Pro priced (payg and unlimited missing)', !r2.ok && r2.errors?.[0]?.field === 'enabled' && (await s.get('ZZ')).enabled === false)
    // Internal plans (trial, demo, tester) are not needed.
    for (const k of ['payg', 'unlimited']) s.prices.push({ ...CATALOG.prices.find(p => p.countryCode === 'US' && p.planKey === k), countryCode: 'ZZ' })
    const r3 = await save(s, 'ZZ', f => { f.enabled = true })
    t('🔴 …and switched on once every public plan (payg, pro, unlimited) has a row — internal plans not needed', r3.ok && r3.data.country.enabled === true)
    // GB and US are priced in the seed: switching US on passes the trigger.
    const s2 = fresh(); triggerFired = []
    const rUS = await save(s2, 'US', f => { f.enabled = true })
    t('🔴 US (priced in the seed) can be switched on', rUS.ok && rUS.data.country.enabled === true && triggerFired.length === 0)
    const rGB = await save(s2, 'GB')
    t('…and GB (switched on, priced) saves', rGB.ok && rGB.data.country.enabled === true)
    // Any other database error is NOT mapped to the sentence: it is thrown, for the route's generic message.
    const s3 = fresh()
    s3.update = async () => { throw new Error('connection reset') }
    let thrown = null
    try { await save(s3, 'US', f => { f.enabled = true }) } catch (e) { thrown = e }
    t('…and any other database error is thrown, not dressed up as the switch-on sentence', thrown && thrown.message === 'connection reset')
  }

  console.log('── 4 · A STALE SAVE IS REFUSED ───────────────────────────────────────────────────────────')
  {
    const s = fresh()
    const loaded = await s.get('US')
    await save(s, 'US', f => { f.supportHours = 'Someone else, 9–5' })                // another admin saves first
    const r = await save(s, 'US', f => { f.name = 'United States of America' }, { expected: loaded.updatedAt })
    t('🔴 a save from a page loaded BEFORE someone else saved is refused — “This country was changed elsewhere. Reload to see the latest.”',
      !r.ok && r.status === 409 && r.error === 'This country was changed elsewhere. Reload to see the latest.')
    t('…and the other admin\'s change stands, untouched', (await s.get('US')).supportHours === 'Someone else, 9–5' && (await s.get('US')).name === 'United States')
    // The race the early check cannot see: the row changes between the read and the write.
    const s2 = fresh()
    s2.raceOnce = () => { const r0 = s2.rows.get('US'); s2.rows.set('US', { ...r0, updatedAt: '2026-10-10T09:59:59.000Z' }) }
    const r2 = await save(s2, 'US', f => { f.name = 'USA' })
    t('🔴 …and so is one that loses the race between read and write — the WHERE clause writes nothing',
      !r2.ok && r2.status === 409 && s2.writes === 0 && s2.rows.get('US').name === 'United States')
  }

  console.log('── 4b · THE PHONE NUMBER CHECK (20261010_12) ────────────────────────────────────────────')
  {
    const s = fresh()
    const gb0 = await s.get('GB')
    t('every seeded row starts on "length" — today\'s behaviour', gb0.phoneCheck === 'length' && (await s.get('US')).phoneCheck === 'length')
    t('…and the box reads it back as the form\'s value', F.rowToForm(gb0).phoneCheck === 'length')
    t('🔴 the row is on the page, under Example phone number, with the three choices in plain words', (() => {
      const tab = fs.readFileSync(path.join(REPO, 'components/admin/CountriesTab.tsx'), 'utf8')
      const ex = tab.indexOf("label: 'Example phone number'"), pc = tab.indexOf("label: 'Phone number check'")
      return ex > 0 && pc > ex && tab.slice(ex, pc).split("label: '").length === 2
        && tab.includes("['length', 'Standard — right length for the country']") && tab.includes("['strict', 'Strict — real numbers only']") && tab.includes("['off', 'Off — accept anything']")
    })())
    const rS = await save(s, 'GB', f => { f.phoneCheck = 'strict' })
    t('🔴 GB cannot go STRICT while its example (07700 900123) fails the strict check — “The example number isn\'t accepted by the strict check — change the example first”',
      !rS.ok && (rS.errors ?? []).some(e => e.field === 'phoneExample' && e.message === "The example number isn't accepted by the strict check — change the example first") && (await s.get('GB')).phoneCheck === 'length')
    const rS2 = await save(s, 'GB', f => { f.phoneCheck = 'strict'; f.phoneExample = '07380 736226' })
    t('…with a real example it can, and both are stored', rS2.ok && rS2.data.country.phoneCheck === 'strict' && rS2.data.country.phoneExample === '07380 736226')
    const rS3 = await save(s, 'GB', f => { f.phoneExample = '07700 900123' })
    t('🔴 …and while STRICT, the example cannot be changed to one the strict check refuses', !rS3.ok && (rS3.errors ?? []).some(e => e.message === "The example number isn't accepted by the strict check — change the example first") && (await s.get('GB')).phoneExample === '07380 736226')
    const rO = await save(s, 'GB', f => { f.phoneCheck = 'off'; f.phoneExample = '07700 900123' })
    t('OFF accepts any example, and is stored', rO.ok && rO.data.country.phoneCheck === 'off')
    const rL = await save(s, 'GB', f => { f.phoneCheck = 'length' })
    t('…and back to Standard, 07700 900123 passes the length check again', rL.ok && rL.data.country.phoneCheck === 'length')
    const rBad = await save(s, 'GB', f => { f.phoneCheck = 'loose' })
    t('🔴 an unknown choice is refused in words, before any CHECK — “Choose how phone numbers are checked.”', !rBad.ok && (rBad.errors ?? []).some(e => e.message === 'Choose how phone numbers are checked.') && checkFired.length === 0)
  }

  console.log('── 4c · NO DISTANCE UNIT (retired 10 October 2026, 20261010_14) ─────────────────────────')
  {
    const s = fresh(); checkFired = []
    const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
    const NAMES = /distance_unit|distanceUnit|Distance unit/
    t('🔴 the page, the loader, the types, the form and the save code never name it', ['components/admin/CountriesTab.tsx', 'lib/country-settings.ts',
      'lib/country-settings-types.ts', 'lib/admin/country-form.ts', 'lib/admin/country-actions.ts'].every(f => !NAMES.test(read(f))))
    t('…so a row read back has no such field, and the form has none', !('distanceUnit' in (await s.get('GB'))) && !('distanceUnit' in F.rowToForm(await s.get('GB'))))
    const r = await save(s, 'GB', f => { f.taxLabel = f.taxLabel })
    t('…and a save of an unchanged form still works', r.ok || (r.errors ?? []).length === 0)
  }

  console.log('── 5 · ADD AND REMOVE, ON A THROWAWAY CODE, LEAVE NOTHING BEHIND ─────────────────────────')
  {
    const s = fresh(); checkFired = []
    const startRows = JSON.stringify([...s.rows.entries()])
    const bad = [
      [{ code: '1A', name: 'X', copyFrom: 'US' }, 'The country code must be two letters, like FR or IE.'],
      [{ code: 'GB', name: 'X', copyFrom: 'US' }, 'There is already a country with the code GB.'],
      [{ code: 'ZZ', name: '', copyFrom: 'US' }, 'Give the country a name.'],
      [{ code: 'ZZ', name: 'Zedland', copyFrom: '' }, 'Choose a country to copy the settings from.'],
    ]
    for (const [body, want] of bad) {
      const r = await A.addCountry(s, body, stamp()); messages.push(r.ok ? '' : r.error)
      t(`🔴 add: ${JSON.stringify(body)} → “${want}”`, !r.ok && (r.errors ?? []).some(e => e.message === want) && s.writes === 0)
    }
    const r = await A.addCountry(s, { code: 'zz', name: 'Zedland', copyFrom: 'US' }, stamp())
    const z = r.ok && r.data.country
    // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): "all six plan prices EMPTY" now means the insert
    // writes NO retired price column (so they are NULL), and the new country has no plan_prices row.
    t('🔴 a new country is created OFF, writing no retired plan price column (all NULL), with no plan_prices row, everything else copied',
      z && z.countryCode === 'ZZ' && z.name === 'Zedland' && z.enabled === false
      && RETIRED.every(k => z[k] === null) && RETIRED_COLS.every(col => !s.lastColumns.includes(col))
      && !s.prices.some(p => p.countryCode === 'ZZ')
      && z.currency === 'USD' && z.cardFeeOnlinePct === US.cardFeeOnlinePct && JSON.stringify(z.timezones) === JSON.stringify(US.timezones))
    // It cannot be removed while switched on…
    // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): was "type the six prices and switch on". Prices are
    // plan_prices rows now (added on the Plans page) — add ZZ's rows for every public plan, then switch it on.
    for (const k of ['payg', 'pro', 'unlimited']) s.prices.push({ ...CATALOG.prices.find(p => p.countryCode === 'US' && p.planKey === k), countryCode: 'ZZ' })
    const rEn = await save(s, 'ZZ', f => { f.enabled = true })
    t('…priced on every public plan, ZZ switches on', rEn.ok && rEn.data.country.enabled === true)
    const rOn = await A.removeCountry(s, { code: 'ZZ' }, ['GB']); messages.push(rOn.ok ? '' : rOn.error)
    t("🔴 remove refuses a country that is switched on → “Switch Zedland off before removing it.”", !rOn.ok && rOn.error === 'Switch Zedland off before removing it.')
    const sT = makeStore([GB, US, { ...US, countryCode: 'CA', name: 'Canada' }], { GB: 14, CA: 2 })
    const rT = await A.removeCountry(sT, { code: 'CA' }, ['GB']); messages.push(rT.ok ? '' : rT.error)
    t("🔴 …or one that trucks use → “Canada can't be removed while 2 trucks use it.”", !rT.ok && rT.error === "Canada can't be removed while 2 trucks use it." && sT.rows.has('CA'))
    const rG = await A.removeCountry(s, { code: 'GB' }, ['GB']); messages.push(rG.ok ? '' : rG.error)
    t('🔴 …and NEVER the public pages\' country', !rG.ok && s.rows.has('GB'))
    await save(s, 'ZZ', f => { f.enabled = false })
    const rRm = await A.removeCountry(s, { code: 'ZZ' }, ['GB'])
    t('🔴 switched off with no trucks, it is removed', rRm.ok && !s.rows.has('ZZ'))
    t('🔴 …and NOTHING IS LEFT BEHIND: GB and US exactly as they started', JSON.stringify([...s.rows.entries()]) === startRows)
    t('…and no database CHECK fired anywhere in this section', checkFired.length === 0)
  }

  console.log('── 6 · PLAIN WORDS, AND THE ROUTE AROUND IT ──────────────────────────────────────────────')
  {
    const all = messages.filter(Boolean)
    t(`🔴 no message names a column (${all.length} messages checked)`, all.length > 30 && all.every(m => !/\b[a-z]+_[a-z_]+\b/.test(m) && !/country_settings|minor|_pct/.test(m)))
    const route = fs.readFileSync(path.join(REPO, 'app/api/admin/countries/route.ts'), 'utf8').replace(/\/\/.*$/gm, '')
    t('🔴 the route answers a non-admin with 404 before anything else', /const user = await adminUser\(req\)\s*\n\s*if \(!user\) return notFound\(\)/.test(route))
    t('🔴 …clears the loader\'s cache after every successful write', /if \(writes && r\.ok\) clearCountrySettingsCache\(\)/.test(route)
      && (route.match(/, true\)/g) || []).length === 3)
    t('…never passes a database error through', /That could not be saved just now\. Nothing was changed/.test(route))
    t('…and the store it uses is the service-role one, server-only', /import 'server-only'/.test(fs.readFileSync(path.join(REPO, 'lib/admin/country-store.ts'), 'utf8')))
  }

  console.log('── 7 · THE CONTROL — a broken rule must be caught ───────────────────────────────────────')
  {
    // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): was "the switch-on rule DELETED from
    // lib/admin/country-form.ts → the table's CHECK enabled_needs_prices_chk stops it". That form rule no longer exists
    // (the trigger is the rule). Three controls now, one per claim this harness makes:
    const brokenBuild = async (file, find, repl) => {
      let applied = false
      const out = await esbuild.build({
        stdin: { contents: "export * as A from '@/lib/admin/country-actions'\nexport * as F from '@/lib/admin/country-form'", resolveDir: REPO, loader: 'ts' },
        bundle: true, write: false, platform: 'node', format: 'cjs', target: 'node20', alias: { '@': REPO }, logLevel: 'silent',
        plugins: [{ name: 'break', setup(b) { b.onLoad({ filter: new RegExp(file.replace(/[./]/g, '\\$&') + '$') }, () => {
          const src = fs.readFileSync(path.join(REPO, file), 'utf8'); const o = src.replace(find, repl)
          applied = o !== src; return { contents: o, loader: 'ts' } }) } }],
      })
      const bfile = path.join(REPO, `node_modules/.cache/countries-api-broken-${Math.random().toString(36).slice(2)}.cjs`)
      fs.writeFileSync(bfile, out.outputFiles[0].text)
      const B = require(bfile); fs.unlinkSync(bfile)
      return { B, applied }
    }
    // (a) section 3's "refused BEFORE any CHECK": with the phone code rule deleted from the form, the bad save gets
    //     past the actions and the table's CHECK is what stops it.
    {
      const { B, applied } = await brokenBuild('lib/admin/country-form.ts',
        "if (!/^[1-9][0-9]{0,2}$/.test(phoneCountryCode)) err(", "if (false) err(")
      const s = fresh(); checkFired = []
      const row = await s.get('US'); const form = B.F.rowToForm(row); form.phoneCountryCode = '1234'
      let threw = false
      try { await B.A.saveCountry(s, { code: 'US', expectedUpdatedAt: row.updatedAt, form }, stamp()) } catch { threw = true }
      t('CONTROL (a): with a form rule removed, the save reaches the table and its CHECK is what stops it',
        applied && threw && checkFired.includes('phone_chk'))
    }
    // (b) section 3b's mapping: with the "cannot be switched on" catch removed from saveCountry, the trigger's raw
    //     error escapes instead of the page's sentence.
    {
      const { B, applied } = await brokenBuild('lib/admin/country-actions.ts',
        "e.message.includes('cannot be switched on')", "e.message.includes('__never__')")
      const s = fresh()
      await B.A.addCountry(s, { code: 'ZZ', name: 'Zedland', copyFrom: 'US' }, stamp())
      const row = await s.get('ZZ'); const form = B.F.rowToForm(row); form.enabled = true
      let err = null, r = null
      try { r = await B.A.saveCountry(s, { code: 'ZZ', expectedUpdatedAt: row.updatedAt, form }, stamp()) } catch (e) { err = e }
      t('CONTROL (b): with the trigger-error mapping removed, the raw trigger message escapes (no ENABLE_NEEDS_PRICES)',
        applied && r === null && err && /^country_settings: ZZ cannot be switched on — no plan_prices row for: payg, pro, unlimited$/.test(err.message))
    }
    // (c) the in-memory trigger is what refuses: without it, the REAL actions switch ZZ on unpriced.
    {
      const s = makeStore([GB, US], { GB: 14, US: 0 }, { noTrigger: true })
      await A.addCountry(s, { code: 'ZZ', name: 'Zedland', copyFrom: 'US' }, stamp())
      const r = await save(s, 'ZZ', f => { f.enabled = true })
      t('CONTROL (c): without the trigger, an unpriced ZZ is switched on — the trigger, not the form, is the rule',
        r.ok && r.data.country.enabled === true)
    }
  }

  for (const n of ok) console.log('  ✓ ' + n)
  for (const n of bad) console.log('  ✗ ' + n)
  console.log(bad.length ? `\n🔴 ${bad.length} CHECK(S) FAILED` : `\n✅ all ${ok.length} passed`)
  process.exit(bad.length ? 1 : 0)
})().catch(e => { console.error('🔴', e && e.stack || e); process.exit(1) })
