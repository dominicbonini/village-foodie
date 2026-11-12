#!/usr/bin/env node
// scripts/_world-countries-5-rows.cjs — world-countries-5 (12 November 2026, docs/world-countries-5-report.md): THE ONE GENERATOR for the
// 167 new countries' data. A module (the harness and the writers read it) and a command:
//   node scripts/_world-countries-5-rows.cjs --summary      print every row's derived values, for review
// Sources, all offline and committed: docs/world-countries-4/go-live.csv (the agreed list: region, tax, launch locale, payment
// model, billing currency, prices), docs/world-countries-4/countries.csv (app stores), docs/world-countries-5/fx-gbp.json (open.er-api.com,
// 12 Nov 2026 — only for the "about £5" minimum charge), the OS tz database's zone.tab (timezones), libphonenumber-js (calling
// code and a mobile example) and Intl/CLDR (time format, date order, week start, the country's name in its language, currency
// names and symbols).
'use strict'
const fs = require('fs'), path = require('path')
const REPO = path.resolve(__dirname, '..')
const lp = require(path.join(REPO, 'node_modules/libphonenumber-js/max'))
const examples = require(path.join(REPO, 'node_modules/libphonenumber-js/mobile/examples'))

function csv(file) {
  const text = fs.readFileSync(path.join(REPO, file), 'utf8'), rows = []
  let row = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ } else if (ch === '"') q = false; else cell += ch }
    else if (ch === '"') q = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else if (ch !== '\r') cell += ch
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  const [head, ...body] = rows.filter(r => r.length > 1)
  return body.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])))
}

const GO_LIVE = csv('docs/world-countries-4/go-live.csv')
const ALL = Object.fromEntries(csv('docs/world-countries-4/countries.csv').map(r => [r.alpha2, r]))
const NEW = GO_LIVE.filter(r => r.status === 'new')
const FX = JSON.parse(fs.readFileSync(path.join(REPO, 'docs/world-countries-5/fx-gbp.json'), 'utf8')).rates

/** Dominic's brief: a country's own language ONLY where languages-world-2 has committed it; India and Pakistan in English for now. */
const OWN_LANGUAGE = { UA: 'uk-UA', KG: 'ru-KZ', KZ: 'kk-KZ', UZ: 'uz-UZ', AZ: 'az-AZ', GE: 'ka-GE', AM: 'hy-AM', MN: 'mn-MN', BD: 'bn-BD', NP: 'ne-NP', IN: 'en-GB', PK: 'en-GB' }
/** The countries that should move to their own language when languages-world-2's remaining 11 land (report §3). */
const LATER_LANGUAGE = { BA: 'bs-BA', AD: 'ca-AD', AL: 'sq-AL', MK: 'mk-MK', LK: 'si-LK (or ta-LK)', KH: 'km-KH', LA: 'lo-LA', TZ: 'sw-TZ', ET: 'am-ET', PH: 'fil-PH (research: en-PH may stay the default)', KE: 'sw-TZ (as a second language only)', UG: 'sw-TZ (second language)' }

/** Territories Stripe onboards under a parent: their parent's settings (address format, allergen list, card fees, tax habit). */
const AS_PARENT = { GP: 'FR', MQ: 'FR', GF: 'FR', RE: 'FR', YT: 'FR', MF: 'FR', PR: 'US' }
/** Shared address formats: a territory on its parent's postal system; everyone else on the generic world format. */
const ADDRESS = { GP: 'fr', MQ: 'fr', GF: 'fr', RE: 'fr', YT: 'fr', MF: 'fr', PR: 'us', JE: 'gb', GG: 'gb', IM: 'gb', AX: 'fi' }
/** The EU 14 for the EU's outermost regions and Åland, and the UK's list for the Crown Dependencies; the US list for Puerto Rico. */
const ALLERGEN = { GP: 'uk14', MQ: 'uk14', GF: 'uk14', RE: 'uk14', YT: 'uk14', MF: 'uk14', AX: 'uk14', JE: 'uk14', GG: 'uk14', IM: 'uk14', PR: 'us9' }
/** Miles where road distances are signed in miles. */
const MILES = new Set(['JE', 'GG', 'IM', 'PR', 'VI', 'GU', 'AS', 'MP', 'LR', 'MM', 'FK', 'SH', 'AI', 'VG', 'KY', 'MS', 'TC', 'BS', 'BZ', 'AG', 'DM', 'GD', 'KN', 'LC', 'VC'])
/** The default timezone where zone.tab lists several and its first is not the main one. */
const DEFAULT_TZ = { ID: 'Asia/Jakarta', KZ: 'Asia/Almaty', MN: 'Asia/Ulaanbaatar', AR: 'America/Argentina/Buenos_Aires', CL: 'America/Santiago',
  EC: 'America/Guayaquil', PG: 'Pacific/Port_Moresby', CD: 'Africa/Kinshasa', PF: 'Pacific/Tahiti', KI: 'Pacific/Tarawa', FM: 'Pacific/Pohnpei',
  UA: 'Europe/Kyiv', UZ: 'Asia/Tashkent', PS: 'Asia/Hebron', MH: 'Pacific/Majuro', CY: 'Asia/Nicosia', ES: 'Europe/Madrid', PT: 'Europe/Lisbon',
  KI2: '', CR: 'America/Costa_Rica', NZ: 'Pacific/Auckland', AU: 'Australia/Sydney', CA: 'America/Toronto', US: 'America/New_York', BR: 'America/Sao_Paulo' }
/** Stripe's zero-decimal currencies (docs.stripe.com/currencies) among the new ones. ISK/UGX/HUF/TWD are two-decimal for Stripe. */
const ZERO_DECIMAL = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX_', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'])

const zoneTab = (() => {
  const m = {}
  for (const l of fs.readFileSync('/usr/share/zoneinfo/zone.tab', 'utf8').split('\n')) {
    if (!l || l.startsWith('#')) continue
    const [cc, , tz] = l.split('\t'); (m[cc] ??= []).push(tz)
  }
  return m
})()
const TZ_ALIAS = { 'Europe/Kiev': 'Europe/Kyiv' }
/** Zones only in a blocked region (report §3): never offered as a truck's timezone. */
const BLOCKED_TZ = new Set(['Europe/Simferopol'])
/** Where Intl's name is not the one a sentence in the country's language uses. */
const SHORT_NAME = { KG: 'Кыргызстан', MO: '澳門' }

const decimalsOf = cur => (ZERO_DECIMAL.has(cur) ? 0 : 2)
/** "UAH 80,000" → minor units in the currency's Stripe decimals. */
function minorOf(text, cur) {
  const m = /^([A-Z]{3})\s+([\d,.]+)$/.exec(String(text).trim())
  if (!m || m[1] !== cur) throw new Error(`price "${text}" is not in ${cur}`)
  const major = Number(m[2].replace(/,/g, ''))
  if (!Number.isFinite(major)) throw new Error(`price "${text}" is not a number`)
  return Math.round(major * 10 ** decimalsOf(cur))
}
/** About £5 in the currency, as billing-1 set the live ones, rounded to two significant figures (minor units). */
function minChargeOf(cur) {
  const r = FX[cur]; if (!r) throw new Error(`no exchange rate for ${cur}`)
  const major = 5 * r, mag = 10 ** Math.max(0, Math.floor(Math.log10(major)) - 1)
  return Math.round(Math.ceil(major / mag) * mag * 10 ** decimalsOf(cur))
}
const likely = cc => { try { return new Intl.Locale(`und-${cc}`).maximize() } catch { return null } }
function clock(cc, locale) {
  const L = likely(cc), tag = L ? `${L.language}-${cc}` : locale
  const hc = new Intl.DateTimeFormat(tag, { hour: 'numeric' }).resolvedOptions().hourCycle
  const parts = new Intl.DateTimeFormat(tag, { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(2026, 10, 12)).map(p => p.type)
  const di = parts.indexOf('day'), mi = parts.indexOf('month'), yi = parts.indexOf('year')
  const order = mi < di && !(yi < mi) ? 'mdy' : 'dmy'   // year-first (ymd) is stored as dmy: the CHECK allows dmy | mdy only
  let first = 1
  try { const loc = new Intl.Locale(tag); const w = loc.getWeekInfo ? loc.getWeekInfo() : loc.weekInfo; first = w?.firstDay ?? 1 } catch { /* keep Monday */ }
  return { timeFormat: hc === 'h11' || hc === 'h12' ? '12h' : '24h', dateOrder: order, weekStart: first === 7 || first === 6 ? 'sunday' : 'monday', intlTag: tag }
}
/** Calling codes libphonenumber has no metadata for (Pitcairn shares New Zealand's +64 by satellite): no example, phone check off. */
const PHONE_FALLBACK = { PN: '64' }
function phone(cc) {
  if (PHONE_FALLBACK[cc]) return { code: PHONE_FALLBACK[cc], example: null }
  const code = lp.getCountryCallingCode(cc)
  const ex = lp.getExampleNumber(cc, examples)
  return { code: String(code), example: ex ? ex.formatNational() : null }
}
function stores(cc) {
  const a = ALL[cc]?.app_store ?? ''
  // countries.csv `app_store`: "yes" = both storefronts; "parent:XX?" = Apple/Google list it under its parent, unconfirmed; "no".
  return { ios: a === 'yes', android: a === 'yes' || a.startsWith('parent:'), raw: a }
}

function rowOf(g) {
  const cc = g.code, cur = g.billing_currency, parent = AS_PARENT[cc]
  const locale = OWN_LANGUAGE[cc] ?? g.launch_locale
  const c = clock(cc, locale)
  const tz = (zoneTab[cc] ?? []).map(t => TZ_ALIAS[t] ?? t).filter(t => !BLOCKED_TZ.has(t))
  if (!tz.length) throw new Error(`${cc}: no timezone in zone.tab`)
  const defTz = DEFAULT_TZ[cc] && tz.includes(DEFAULT_TZ[cc]) ? DEFAULT_TZ[cc] : tz[0]
  const ph = phone(cc)
  const model = /online \+ monthly/.test(g.payment_model) ? 'fee_from_payment' : 'billed_at_truck'
  const feeAllowed = model === 'fee_from_payment'
  // Serbian is written in Latin script here (as sr-RS's messages are), so Intl is asked for sr-Latn.
  const nameLocale = locale.startsWith('sr') ? 'sr-Latn' : locale
  let shortName = cc; try { shortName = SHORT_NAME[cc] ?? new Intl.DisplayNames([nameLocale], { type: 'region' }).of(cc) } catch { /* the code */ }
  const englishName = new Intl.DisplayNames(['en'], { type: 'region' }).of(cc)
  const s = stores(cc)
  const asUS = parent === 'US', asFR = parent === 'FR'
  return {
    code: cc, name: englishName, csvName: g.name, region: g.region, tax: g.tax, vatNumberRequired: g.tax === 'vat_number_required',
    currency: cur, locale, ...c, phoneCode: ph.code, phoneExample: ph.example, phoneCheck: ph.example ? 'length' : 'off', timezones: tz, defaultTimezone: defTz,
    addressFormat: ADDRESS[cc] ?? 'intl', allergenSet: ALLERGEN[cc] ?? 'codex',
    pricesIncludeTax: !asUS, taxLabel: asUS ? 'Sales tax' : asFR ? 'TVA' : 'Tax',
    tipPresets: asUS ? [10, 15, 20] : [], tippingDefault: false,
    distanceUnit: MILES.has(cc) ? 'miles' : 'km',
    // Card fees: a territory pays its parent's Stripe rates; a country billed at the truck takes no online card payments at all.
    cardOnlinePct: asFR ? 1.5 : asUS ? 2.9 : 0, cardOnlineFixed: asFR ? 25 : asUS ? 30 : 0,
    cardInPersonPct: asFR ? 1.5 : asUS ? 2.9 : 0, cardInPersonFixed: asFR ? 25 : asUS ? 30 : 0, tapToPayFixed: asFR || asUS ? 10 : 0,
    cardRegionLabel: asFR ? 'EEA cards' : asUS ? 'US cards' : `${englishName} cards`,
    paymentModel: model, platformFeeAllowed: feeAllowed, shortName,
    proMinor: minorOf(g.pro_monthly, cur), proIncludesMinor: minorOf(g.pro_includes, cur), unlimitedMinor: minorOf(g.unlimited_monthly, cur),
    // Never above the plan a truck here is on (Unlimited, the only one offered where we bill at the truck): a full month always bills.
    minChargeMinor: Math.min(minChargeOf(cur), minorOf(g.unlimited_monthly, cur)), iosApp: s.ios, androidApp: s.android, storeRaw: s.raw, regionBlock: g.region_block,
    laterLanguage: LATER_LANGUAGE[cc] ?? null,
  }
}

const ROWS = NEW.map(rowOf)
module.exports = { GO_LIVE, NEW, ROWS, OWN_LANGUAGE, LATER_LANGUAGE, decimalsOf, ZERO_DECIMAL, csv }

if (require.main === module && process.argv.includes('--summary')) {
  for (const r of ROWS) console.log([r.code, r.name, r.region, r.currency, r.locale, r.timeFormat, r.dateOrder, r.weekStart, `+${r.phoneCode} ${r.phoneExample}`,
    r.defaultTimezone, `${r.timezones.length}tz`, r.addressFormat, r.allergenSet, r.paymentModel, `pro ${r.proMinor}/${r.proIncludesMinor} unl ${r.unlimitedMinor} min ${r.minChargeMinor}`,
    r.shortName, r.vatNumberRequired ? 'VATNO' : '', `ios ${r.iosApp} and ${r.androidApp}`].join(' | '))
  console.log(ROWS.length, 'rows')
}

// ── the SQL (node scripts/_world-countries-5-rows.cjs --write-sql writes the three migrations) ─────────────────────────────────────────
const q = v => (v === null || v === undefined ? 'null' : typeof v === 'number' ? String(v) : typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`)
const arr = (xs, t = 'text') => (xs.length ? `array[${xs.map(q).join(', ')}]` : `'{}'::${t}[]`)
function schemaSql(currencyCodes, formatKeys) {
  return `-- supabase/migrations/20261093_world_countries_5_schema.sql — world-countries-5 BLOCK A (12 November 2026, docs/world-countries-5-report.md).
-- Run by Claude (Dominic approved, 12 Nov) with scripts/db-migrate.cjs, BEFORE block B (20261094). Widens what a country_settings row may
-- name; changes no existing row.
-- 1 · country_settings_currency_chk — the registry's ${currencyCodes.length} codes (lib/currencies.ts): + the 94 of the 167 new countries.
-- 2 · country_settings_address_format_chk — + 'intl' (lib/address-formats.ts: the generic format the new countries share).
-- 3 · country_settings.vat_number_required — DATA ONLY, nothing reads it yet: true where docs/world-countries-4/go-live.csv's tax is
--     vat_number_required (we must hold the truck's VAT/tax number to bill it without local tax). Default false.
begin;

alter table public.country_settings drop constraint if exists country_settings_currency_chk;
alter table public.country_settings add constraint country_settings_currency_chk
  check (currency in (${currencyCodes.map(q).join(', ')}));

alter table public.country_settings drop constraint if exists country_settings_address_format_chk;
alter table public.country_settings add constraint country_settings_address_format_chk
  check (address_format in (${formatKeys.map(q).join(', ')}));

alter table public.country_settings add column if not exists vat_number_required boolean not null default false;
comment on column public.country_settings.vat_number_required is 'world-countries-5: B2B billing here needs the truck''s VAT/tax number (go-live.csv tax = vat_number_required). Data only.';

commit;
`
}
function rowsSql() {
  const cols = `country_code, name, enabled, currency, locale, time_format, date_order, week_start,
  phone_country_code, address_format, timezones, default_timezone,
  prices_include_tax, tax_label,
  card_surcharge_allowed, card_surcharge_cap_pct, card_surcharge_credit_only, card_surcharge_excluded_regions,
  service_fee_allowed, tipping_enabled_default, tip_presets_pct, allergen_set,
  starter_monthly_minor, pro_monthly_minor, max_monthly_minor, pro_allowance_minor, max_allowance_minor, platform_fee_pct,
  card_fee_online_pct, card_fee_online_fixed_minor, card_fee_in_person_pct, card_fee_in_person_fixed_minor,
  tap_to_pay_fixed_minor, card_fee_region_label,
  competitor_name, competitor_pct, competitor_fixed_minor, support_hours, updated_by,
  short_name, phone_example, phone_check, distance_unit,
  service_fee_recipient, service_fee_hatchgrab_bps, service_fee_hatchgrab_fixed_minor,
  service_fee_truck_max_bps, service_fee_truck_max_fixed_minor,
  platform_fee_enabled, fees_taxed, allergen_card_only_allowed, platform_fee_allowed, ios_app_available, android_app_available, vat_number_required`
  const vals = ROWS.map(r => `  -- ${r.name}: ${r.currency}, ${r.locale}, ${r.paymentModel}${r.vatNumberRequired ? ', VAT number required' : ''}
  (${[r.code, r.name, false, r.currency, r.locale, r.timeFormat, r.dateOrder, r.weekStart, r.phoneCode, r.addressFormat].map(q).join(', ')}, ${arr(r.timezones)}, ${q(r.defaultTimezone)},
   ${q(r.pricesIncludeTax)}, ${q(r.taxLabel)}, false, null, false, '{}'::text[], false, ${q(r.tippingDefault)}, ${r.tipPresets.length ? `array[${r.tipPresets.join(', ')}]::numeric[]` : `'{}'::numeric[]`}, ${q(r.allergenSet)},
   null, null, null, null, null, null, ${r.cardOnlinePct.toFixed(2)}, ${r.cardOnlineFixed}, ${r.cardInPersonPct.toFixed(2)}, ${r.cardInPersonFixed}, ${r.tapToPayFixed}, ${q(r.cardRegionLabel)},
   null, null, null, null, 'world-countries-5', ${q(r.shortName)}, ${q(r.phoneExample)}, ${q(r.phoneCheck)}, ${q(r.distanceUnit)},
   'truck', null, null, null, null, false, false, true, ${q(r.platformFeeAllowed)}, ${q(r.iosApp)}, ${q(r.androidApp)}, ${q(r.vatNumberRequired)})`)
  const priceRows = ROWS.flatMap(r => {
    const off = r.paymentModel === 'billed_at_truck'
    return [
      [`(${q('payg')}, ${q(r.code)}, 0, 0, 99, 0, ${!off}, false)`, off ? 'not offered: no fee can be taken from a payment here' : ''],
      [`(${q('pro')}, ${q(r.code)}, ${r.proMinor}, ${r.proIncludesMinor}, 99, ${r.proMinor}, ${!off}, false)`, off ? 'not offered (as BR/MX/TH): kept with its research price' : ''],
      [`(${q('unlimited')}, ${q(r.code)}, ${r.unlimitedMinor}, null, 0, ${r.unlimitedMinor}, true, ${off})`, off ? 'the trial-end plan: a finished trial drops to Unlimited' : ''],
    ]
  })
  const prices = priceRows.map(([v, c], i) => `  ${v}${i < priceRows.length - 1 ? ',' : ''}${c ? `   -- ${c}` : ''}`)
  const billing = ROWS.map(r => `  (${q(r.code)}, ${q(r.paymentModel)}, 0, 0, ${r.minChargeMinor}, 'world-countries-5')`)
  return `-- supabase/migrations/20261094_world_countries_5_rows.sql — world-countries-5 BLOCK B (12 November 2026, docs/world-countries-5-report.md §1).
-- Run by Claude AFTER block A (20261093), Dominic approved (12 Nov). GENERATED by scripts/_world-countries-5-rows.cjs from
-- docs/world-countries-4/go-live.csv — edit the generator, never this file.
-- The 167 "new" countries of the agreed list, EVERY ONE SWITCHED OFF (enabled = false): each /<code> 302s to /uk and the country is in no
-- router pick, hreflang set, sitemap, menu, signup list or country selector until the switch-on migration (20261095, NOT RUN) runs.
-- Rows before prices and billing (both reference country_settings).
-- 🔴 The pattern where no fee can be taken from a payment (as BR, MX and TH): country_billing.payment_model = 'billed_at_truck'
--    (customers pay at the truck; we bill the truck's card monthly), platform_fee_allowed = false, Pay as you go and Pro kept as rows but
--    NOT OFFERED, Unlimited offered and the trial-end plan. The 7 territories Stripe onboards under a parent (GP MQ GF RE YT MF as France,
--    PR as the US) take online payments with the fee from each payment, every plan offered, exactly as their parent.
-- Prices are go-live.csv's (pro_monthly / pro_includes / unlimited_monthly) in its billing_currency, in Stripe minor units (zero-decimal
-- currencies are whole units). min_charge_minor = about £5 (open.er-api.com, 12 Nov 2026, docs/world-countries-5/fx-gbp.json), never
-- above the country's Unlimited price.
begin;

insert into public.country_settings (
  ${cols}
) values
${vals.join(',\n')};

insert into public.plan_prices (plan_key, country_code, monthly_minor, included_online_minor, fee_bps, extra_van_monthly_minor, offered, is_trial_end) values
${prices.join('\n')};

insert into public.country_billing (country_code, payment_model, post_pay_surcharge_bps, post_pay_surcharge_fixed_minor, min_charge_minor, updated_by) values
${billing.join(',\n')};

commit;
`
}
function switchOnSql() {
  const codes = ROWS.map(r => r.code)
  return `-- supabase/migrations/20261095_world_countries_5_switch_on.sql — world-countries-5 BLOCK C (12 November 2026, docs/world-countries-5-report.md).
-- ⛔ NOT RUN. Dominic asks for it AFTER the code is deployed. It needs --approved-by-dominic (it UPDATEs country_settings).
-- 1 · switches ON the ${codes.length} new countries (enabled = true) — each then has its /<code> page, its place in the sitemap, hreflang, the
--     country selector (under its region) and signup;
-- 2 · switches OFF Mexico (no truck has ever been in MX — checked 12 Nov 2026, report §2);
-- 3 · sets vat_number_required on the two LIVE countries the list marks (AE, BR) — the 39 new ones already have it from block B.
begin;

update public.country_settings set enabled = true, updated_at = now(), updated_by = 'world-countries-5 switch-on'
 where country_code in (${codes.map(q).join(', ')})
   and enabled = false;

update public.country_settings set enabled = false, updated_at = now(), updated_by = 'world-countries-5 switch-on (Mexico off)'
 where country_code = 'MX';

update public.country_settings set vat_number_required = true, updated_at = now(), updated_by = 'world-countries-5'
 where country_code in ('AE', 'BR');

commit;
`
}
module.exports.sql = { schemaSql, rowsSql, switchOnSql }
if (require.main === module && process.argv.includes('--write-sql')) {
  const ts = require(path.join(REPO, 'node_modules/typescript'))
  const load = f => { const m = { exports: {} }; new Function('module', 'exports', 'require', ts.transpileModule(fs.readFileSync(path.join(REPO, f), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(m, m.exports, require); return m.exports }
  const codes = load('lib/currencies.ts').CURRENCY_CODES
  const prev = fs.readFileSync(path.join(REPO, 'supabase/migrations/20261054_world_countries_1_schema.sql'), 'utf8').match(/address_format in \(([^)]*)\)/)[1]
  const keys = [...new Set([...prev.matchAll(/'([a-z]+)'/g)].map(m => m[1]).concat('intl'))]
  const dir = path.join(REPO, 'supabase/migrations')
  fs.writeFileSync(path.join(dir, '20261093_world_countries_5_schema.sql'), schemaSql(codes, keys))
  fs.writeFileSync(path.join(dir, '20261094_world_countries_5_rows.sql'), rowsSql())
  fs.writeFileSync(path.join(dir, '20261095_world_countries_5_switch_on.sql'), switchOnSql())
  console.log('wrote 20261093/94/95;', codes.length, 'currencies,', keys.length, 'address formats,', ROWS.length, 'rows')
}
