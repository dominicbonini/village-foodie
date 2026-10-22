// scripts/europe-settings.cjs — THE REST OF EUROPE AS DATA, SWITCHED OFF (europe-settings, 22 October 2026,
// docs/europe-settings-report.md). 29 countries: AT BE BG HR CY CZ DK EE FI DE GI GR HU IT LV LI LT LU MT NL NO PL PT RO SK
// SI ES SE CH. No new language.
//
// LOCALHOST ONLY: the rows and prices are PARSED FROM the NOT RUN SQL (scripts/_europe-settings-fixtures.cjs) and the real
// pages, PDF, sitemap and /llms.txt are rendered by the render kit. No database, no network. Checks:
//   1  THE ROWS — 29, each passes every live CHECK (block A's address-format list in force); the values the report sources:
//      currency (Bulgaria EUR, Gibraltar GBP), locale, 24h / dmy / Monday, phone code and an example the app accepts, time
//      zones, uk14, prices include VAT, no surcharge, no service fee, tipping off, the allergen-card rule, card fees;
//   2  THE ADDRESS FORMATS — 29, the validator clean, the order the CHECK lists; each example passes its own pattern and
//      normalises to itself; the code before or after the town; the takeaway VAT as data (none for Gibraltar);
//   3  CHARGES — each country's rules: VAT included at its rate, labelled as locals write it, nothing added; the truck's
//      own rate wins; no surcharge, no service fee, no tip;
//   4  SWITCHED ON (fixture), ONE COUNTRY PER CURRENCY — landing, PDF: the native price form; the currency line only where
//      the symbol is shared (kr); JSON-LD in the ISO code; Gibraltar "£29", never "GB£29";
//   5  SWITCHED OFF (the SQL as written) — every /<code> 302s to /uk; in no hreflang set, sitemap or /llms.txt;
//   6  MALTA AND GIBRALTAR IN ENGLISH — en-MT and en-GI over en-IE: cents in Malta, pence in Gibraltar; "£" in en-GI everywhere;
//   7  THE NOT RUN SQL — block A's list is the formats' keys; block B: 29 rows off, 87 prices, the non-euro ones awaiting approval;
//   8  THE TERMS — one "European Economic Area and Switzerland" section with every regulator; Gibraltar's own.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
const fs = require('fs')
const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'europe-settings' })
const { REPO } = kit
const F = require('./_europe-settings-fixtures.cjs')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 100 - s.length)))
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const text = s => String(s ?? '').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim()
const count = (s, x) => s.split(x).length - 1

// The decided values, written out independently of the SQL generator (each sourced in the report §2):
// [currency, locale, default time zone, phone code, VAT label, takeaway rate (thousandths of a %), allergen card alone allowed, code before town]
const EXP = {
  AT: ['EUR', 'de-AT', 'Europe/Vienna', '43', 'USt.', 10000, true, true],
  BE: ['EUR', 'nl-BE', 'Europe/Brussels', '32', 'btw', 6000, true, true],
  BG: ['EUR', 'bg-BG', 'Europe/Sofia', '359', 'ДДС', 20000, true, true],
  HR: ['EUR', 'hr-HR', 'Europe/Zagreb', '385', 'PDV', 13000, true, true],
  CY: ['EUR', 'el-CY', 'Asia/Nicosia', '357', 'ΦΠΑ', 5000, true, true],
  CZ: ['CZK', 'cs-CZ', 'Europe/Prague', '420', 'DPH', 12000, true, true],
  DK: ['DKK', 'da-DK', 'Europe/Copenhagen', '45', 'moms', 25000, true, true],
  EE: ['EUR', 'et-EE', 'Europe/Tallinn', '372', 'km', 24000, true, true],
  FI: ['EUR', 'fi-FI', 'Europe/Helsinki', '358', 'ALV', 13500, true, true],
  DE: ['EUR', 'de-DE', 'Europe/Berlin', '49', 'MwSt.', 7000, true, true],
  GI: ['GBP', 'en-GI', 'Europe/Gibraltar', '350', null, null, true, false],
  GR: ['EUR', 'el-GR', 'Europe/Athens', '30', 'ΦΠΑ', 13000, true, true],
  HU: ['HUF', 'hu-HU', 'Europe/Budapest', '36', 'ÁFA', 27000, true, true],
  IT: ['EUR', 'it-IT', 'Europe/Rome', '39', 'IVA', 10000, true, true],
  LV: ['EUR', 'lv-LV', 'Europe/Riga', '371', 'PVN', 21000, false, false],
  LI: ['CHF', 'de-LI', 'Europe/Vaduz', '423', 'MWST', 2600, true, true],
  LT: ['EUR', 'lt-LT', 'Europe/Vilnius', '370', 'PVM', 21000, true, true],
  LU: ['EUR', 'fr-LU', 'Europe/Luxembourg', '352', 'TVA', 3000, true, true],
  MT: ['EUR', 'en-MT', 'Europe/Malta', '356', 'VAT', 18000, true, false],
  NL: ['EUR', 'nl-NL', 'Europe/Amsterdam', '31', 'btw', 9000, true, true],
  NO: ['NOK', 'nb-NO', 'Europe/Oslo', '47', 'MVA', 15000, true, true],
  PL: ['PLN', 'pl-PL', 'Europe/Warsaw', '48', 'VAT', 8000, false, true],
  PT: ['EUR', 'pt-PT', 'Europe/Lisbon', '351', 'IVA', 13000, true, true],
  RO: ['RON', 'ro-RO', 'Europe/Bucharest', '40', 'TVA', 11000, false, true],
  SK: ['EUR', 'sk-SK', 'Europe/Bratislava', '421', 'DPH', 19000, false, true],
  SI: ['EUR', 'sl-SI', 'Europe/Ljubljana', '386', 'DDV', 9500, true, true],
  ES: ['EUR', 'es-ES', 'Europe/Madrid', '34', 'IVA', 10000, true, true],
  SE: ['SEK', 'sv-SE', 'Europe/Stockholm', '46', 'moms', 6000, true, true],
  CH: ['CHF', 'de-CH', 'Europe/Zurich', '41', 'MWST', 2600, true, true],
}
const CODES = Object.keys(EXP)
const NAMES = { AT: 'Austria', BE: 'Belgium', BG: 'Bulgaria', HR: 'Croatia', CY: 'Cyprus', CZ: 'Czech Republic', DK: 'Denmark', EE: 'Estonia', FI: 'Finland', DE: 'Germany', GI: 'Gibraltar', GR: 'Greece', HU: 'Hungary', IT: 'Italy', LV: 'Latvia', LI: 'Liechtenstein', LT: 'Lithuania', LU: 'Luxembourg', MT: 'Malta', NL: 'Netherlands', NO: 'Norway', PL: 'Poland', PT: 'Portugal', RO: 'Romania', SK: 'Slovakia', SI: 'Slovenia', ES: 'Spain', SE: 'Sweden', CH: 'Switzerland' }

;(async () => {
  const { rows, prices, sql } = F.sqlRows()
  const by = F.byCode()
  const R = F.renderer(kit, 'eus')

  // ══ 1 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('1 · THE ROWS — 29, every live CHECK, the sourced values')
  t('29 rows, one per country in the brief (verified against the processor\'s country list: no other European country)', rows.length === 29 && JSON.stringify(rows.map(r => r.country_code).sort()) === JSON.stringify([...CODES].sort()), rows.map(r => r.country_code))
  const bad = []
  for (const r of rows) for (const c of F.checkRow('country_settings', r)) if (c.ok !== true) bad.push([r.country_code, c.name, c.unread])
  for (const p of prices) for (const c of F.checkRow('plan_prices', p)) if (c.ok !== true) bad.push([p.country_code, p.plan_key, c.name, c.unread])
  const nChecks = Object.keys(F.checks().country_settings).length + Object.keys(F.checks().plan_prices).length
  t(`every row and price passes every live CHECK (${nChecks} definitions, each read in full — none skipped)`, bad.length === 0, bad)
  const de = by.DE
  const neg = [['address_format', 'xx'], ['currency', 'BGN'], ['default_timezone', 'Europe/London'], ['week_start', 'friday'], ['tip_presets_pct', [120]], ['allergen_set', 'eu14']]
    .map(([k, v]) => [k, F.checkRow('country_settings', { ...de, [k]: v }).some(c => c.ok === false)])
  t('…and the evaluator is not a rubber stamp: a bad format, BGN, a time zone outside the list, a Friday week, a 120 % tip and an unknown allergen set each fail a CHECK', neg.every(([, f]) => f), neg)
  const L = await R.lib()
  const mapped = {}
  for (const r of rows) mapped[r.country_code] = L.mapCountryRow({ ...r, updated_at: '2026-10-22T00:00:00Z' })   // the column's default
  t('every row loads through the app\'s own mapper (mapCountryRow), switched off', CODES.every(c => mapped[c] && mapped[c].countryCode === c && mapped[c].enabled === false), CODES.filter(c => !mapped[c]))
  const vals = CODES.map(c => { const r = by[c], e = EXP[c]; return [c, r.currency === e[0] && r.locale === e[1] && r.default_timezone === e[2] && r.phone_country_code === e[3] && r.address_format === c.toLowerCase()] })
  t('currency, locale, default time zone, phone code and address format as decided — Bulgaria in euros (since 1 January 2026), Gibraltar in pounds sterling, Malta en-MT, Gibraltar en-GI, Cyprus el-CY',
    vals.every(([, ok]) => ok), vals.filter(([, ok]) => !ok).map(([c]) => [c, by[c].currency, by[c].locale, by[c].default_timezone, by[c].phone_country_code]))
  t('each locale is a canonical language-REGION tag (no CHECK holds it, so this does)', rows.every(r => /^[a-z]{2}-[A-Z]{2}$/.test(r.locale) && Intl.getCanonicalLocales(r.locale)[0] === r.locale))
  t('everywhere: 24-hour clock, day-month-year, weeks start Monday, km, the phone check by length, a short name',
    rows.every(r => r.time_format === '24h' && r.date_order === 'dmy' && r.week_start === 'monday' && r.distance_unit === 'km' && r.phone_check === 'length' && r.short_name))
  t('…the short names read in a sentence: "the Czech Republic", "the Netherlands"', by.CZ.short_name === 'the Czech Republic' && by.NL.short_name === 'the Netherlands' && by.DE.short_name === 'Germany')
  const tzBad = rows.filter(r => !r.timezones.includes(r.default_timezone) || r.timezones.some(z => { try { new Intl.DateTimeFormat('en', { timeZone: z }); return false } catch { return true } }))
  t('every time zone is real (Intl), the default among them; Portugal adds Madeira and the Azores, Spain the Canaries', tzBad.length === 0
    && JSON.stringify(by.PT.timezones) === JSON.stringify(['Europe/Lisbon', 'Atlantic/Madeira', 'Atlantic/Azores']) && JSON.stringify(by.ES.timezones) === JSON.stringify(['Europe/Madrid', 'Atlantic/Canary']), tzBad.map(r => r.country_code))
  const Ph = await kit.bundle('eus-phone', "export { isPlausiblePhone } from '@/lib/phone'")
  const phoneBad = rows.filter(r => !Ph.isPlausiblePhone(r.phone_example, r.country_code, r.phone_check) || Ph.isPlausiblePhone(r.phone_example.slice(0, 3), r.country_code, r.phone_check))
  t('each phone example passes the app\'s phone check for its country; its first three characters do not (Austria and Germany have numbers as short as four digits)', phoneBad.length === 0, phoneBad.map(r => [r.country_code, r.phone_example]))
  t('VAT: prices include it everywhere; the row\'s label as locals write it (Gibraltar has no VAT: "Tax")',
    rows.every(r => r.prices_include_tax === true && r.tax_label === (EXP[r.country_code][4] ?? 'Tax')), rows.filter(r => r.tax_label !== (EXP[r.country_code][4] ?? 'Tax')).map(r => [r.country_code, r.tax_label]))
  t('no card surcharge, no service fee, tipping off with no presets, no platform fee; the retired plan columns empty',
    rows.every(r => r.card_surcharge_allowed === false && r.service_fee_allowed === false && r.tipping_enabled_default === false && r.tip_presets_pct.length === 0 && r.platform_fee_enabled === false
      && r.starter_monthly_minor === null && r.pro_monthly_minor === null && r.max_monthly_minor === null && r.pro_allowance_minor === null && r.max_allowance_minor === null && r.platform_fee_pct === null))
  t('allergens: the EU 14 (uk14) everywhere; the allergen card on its own NOT allowed where each dish needs written information (Poland, Romania, Slovakia, Latvia), allowed elsewhere',
    rows.every(r => r.allergen_set === 'uk14' && r.allergen_card_only_allowed === EXP[r.country_code][6]), rows.filter(r => r.allergen_card_only_allowed !== EXP[r.country_code][6]).map(r => r.country_code))
  const eurFees = r => r.card_fee_online_pct === 1.5 && r.card_fee_online_fixed_minor === 25 && r.card_fee_in_person_pct === 1.4 && r.card_fee_in_person_fixed_minor === 10 && r.tap_to_pay_fixed_minor === 10 && r.card_fee_region_label === 'EEA cards'
  t('card fees: every euro country 1.5 % + €0.25 online, 1.4 % + €0.10 in person, €0.10 Tap to Pay, "EEA cards"', rows.filter(r => r.currency === 'EUR').every(eurFees), rows.filter(r => r.currency === 'EUR' && !eurFees(r)).map(r => r.country_code))
  const fee = c => { const r = by[c]; return [r.card_fee_online_pct, r.card_fee_online_fixed_minor, r.card_fee_in_person_pct, r.card_fee_in_person_fixed_minor, r.tap_to_pay_fixed_minor, r.card_fee_region_label] }
  const FEES = { CH: [2.9, 30, 2.9, 10, 10, 'Swiss cards'], LI: [1.5, 30, 1.4, 10, 10, 'EEA cards'], NO: [2.4, 200, 1.4, 100, 105, 'Norwegian and EEA cards'], SE: [1.5, 180, 1.4, 100, 105, 'EEA cards'],
    DK: [1.5, 180, 1.4, 75, 70, 'EEA cards'], CZ: [1.5, 650, 1.4, 225, 220, 'EEA cards'], HU: [1.5, 8500, 1.4, 2000, 4000, 'EEA cards'], PL: [1.5, 100, 1.4, 0, 40, 'EEA cards'], RO: [1.5, 100, 1.4, 25, 50, 'EEA cards'],
    GI: [1.5, 20, 1.4, 10, 10, 'Gibraltar cards'] }
  t('…and the others in their own currency, as each country\'s pricing page lists them (CH 2.9 % + CHF 0.30, NO 2.4 % + NOK 2, GI 1.5 % + 20p …)', Object.entries(FEES).every(([c, f]) => JSON.stringify(fee(c)) === JSON.stringify(f)), Object.keys(FEES).filter(c => JSON.stringify(fee(c)) !== JSON.stringify(FEES[c])).map(c => [c, fee(c)]))
  const segs = await kit.bundle('eus-mc', "export { COUNTRY_PATH_SEGMENTS } from '@/lib/marketing-country'")
  const segVals = Object.values(segs.COUNTRY_PATH_SEGMENTS)
  t('each has its address at its ISO code (COUNTRY_PATH_SEGMENTS: /at … /ch, /gi, /mt); no two countries share one', CODES.every(c => segs.COUNTRY_PATH_SEGMENTS[c] === c.toLowerCase()) && new Set(segVals).size === segVals.length)

  // ══ 2 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('2 · THE ADDRESS FORMATS — one per country, each example passing its own pattern')
  const AF = await kit.bundle('eus-af', "export * from '@/lib/address-formats'")
  t('every format validates (validateAddressFormats: no problem)', AF.validateAddressFormats().length === 0, AF.validateAddressFormats())
  t('the format keys, in the order the CHECK lists them: gb us ie au nz ca fr, then the 29', AF.ADDRESS_FORMAT_KEYS.join(' ') === ['gb', 'us', 'ie', 'au', 'nz', 'ca', 'fr', ...CODES.map(c => c.toLowerCase())].join(' '), AF.ADDRESS_FORMAT_KEYS.join(' '))
  const pc = CODES.map(c => { const f = AF.ADDRESS_FORMATS[c.toLowerCase()]; const ex = f.postalCode.example; return [c, ex, AF.isValidPostalCode(f, ex) && AF.normalisePostalCode(f, ex) === ex && new RegExp(f.postalCode.pattern).test(ex) && !AF.isValidPostalCode(f, 'ABC') && f.postalCode.identifiesPremises === false] })
  t('each format\'s example passes its own pattern and normalises to itself; "ABC" passes none; no code identifies one premises', pc.every(([, , ok]) => ok), pc.filter(([, , ok]) => !ok))
  const NORM = { CZ: ['11000', '110 00'], SE: ['11129', '111 29'], GR: ['10557', '105 57'], SK: ['81101', '811 01'], PL: ['31042', '31-042'], PT: ['1100148', '1100-148'], NL: ['1012js', '1012 JS'], LU: ['1648', 'L-1648'], LV: ['1050', 'LV-1050'], LT: ['01143', 'LT-01143'], MT: ['vlt1117', 'VLT 1117'], GI: ['gx111aa', 'GX11 1AA'] }
  const normBad = Object.entries(NORM).filter(([c, [a, b]]) => AF.normalisePostalCode(AF.ADDRESS_FORMATS[c.toLowerCase()], a) !== b)
  t('the normalisers write a typed code the local way: 11000 → "110 00", 31042 → "31-042", 1012js → "1012 JS", 1648 → "L-1648", gx111aa → "GX11 1AA" …', normBad.length === 0, normBad.map(([c, [a]]) => [c, AF.normalisePostalCode(AF.ADDRESS_FORMATS[c.toLowerCase()], a)]))
  t('Liechtenstein\'s codes are 9485–9498 only (9490 Vaduz yes; 9499 and Swiss 8001 no)', AF.isValidPostalCode(AF.ADDRESS_FORMATS.li, '9490') && !AF.isValidPostalCode(AF.ADDRESS_FORMATS.li, '9499') && !AF.isValidPostalCode(AF.ADDRESS_FORMATS.li, '8001'))
  const tpl = CODES.map(c => { const f = AF.ADDRESS_FORMATS[c.toLowerCase()]; const v = { venue: 'Marktplatz', locality: 'Town', postalCode: f.postalCode.example, region: f.regions ? 'MI' : '', country: NAMES[c] }
    const line = AF.renderTemplate(f.templates.line, v); return [c, line, line === (EXP[c][7] ? `Marktplatz, ${f.postalCode.example} Town${c === 'IT' ? ' MI' : ''}` : c === 'LV' ? 'Marktplatz, Town, LV-1050' : `Marktplatz, Town ${f.postalCode.example}`)] })
  t('the code before the town everywhere but Gibraltar and Malta ("Town GX11 1AA") and Latvia ("Town, LV-1050"): "Marktplatz, 10117 Town"', tpl.every(([, , ok]) => ok), tpl.filter(([, , ok]) => !ok))
  const lv = AF.ADDRESS_FORMATS.lv
  t('Latvia without a code leaves no stray comma ("Doma laukums, Rīga"); its geocode line "Doma laukums, Rīga, LV-1050, Latvia"', AF.renderTemplate(lv.templates.line, { venue: 'Doma laukums', locality: 'Rīga' }) === 'Doma laukums, Rīga'
    && AF.renderTemplate(lv.templates.geocode, { venue: 'Doma laukums', locality: 'Rīga', postalCode: 'LV-1050', country: 'Latvia' }) === 'Doma laukums, Rīga, LV-1050, Latvia' && JSON.stringify(lv.ai).includes('Rīga, LV-1050'))
  const it = AF.ADDRESS_FORMATS.it
  t('Italy alone keeps a region — the province code after the town ("20122 Milano MI"), from Places\' level 2; the others none', !!it.regions && it.regions.list.length === 107 && AF.renderFirst(it.templates.area, { locality: 'Milano', postalCode: '20122', region: 'MI' }) === '20122 Milano MI'
    && JSON.stringify(it.places.regionFrom) === JSON.stringify(['administrative_area_level_2']) && CODES.filter(c => c !== 'IT').every(c => AF.ADDRESS_FORMATS[c.toLowerCase()].regions === null))
  const tax = CODES.map(c => [c, JSON.stringify(AF.includedTaxOf(c.toLowerCase())) === JSON.stringify(EXP[c][4] ? { label: EXP[c][4], milli: EXP[c][5] } : null)])
  t('the takeaway VAT each price includes is DATA on the format (includedTax), as decided — Germany MwSt. 7 %, Finland ALV 13.5 %, Switzerland MWST 2.6 %, Hungary ÁFA 27 % …; Gibraltar none', tax.every(([, ok]) => ok), tax.filter(([, ok]) => !ok).map(([c]) => [c, AF.includedTaxOf(c.toLowerCase())]))
  t('GB and IE are as before: inclusive with no rate on their formats', AF.includedTaxOf('gb') === null && AF.includedTaxOf('ie') === null)
  const aiOk = CODES.filter(c => { const f = AF.ADDRESS_FORMATS[c.toLowerCase()]; return !(f.adminLabel.startsWith(NAMES[c] === 'Czech Republic' ? 'Czech' : NAMES[c]) && AF.fillAiText(f.ai.importer.knowledge, { country: NAMES[c], year: 2026 }).includes(NAMES[c]) && JSON.stringify(f.ai).includes(f.postalCode.example)) })
  t('each has its admin label, and AI rules (importer, screenshot, scraper) that name the country and its code\'s shape', aiOk.length === 0, aiOk)

  // ══ 3 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · CHARGES — VAT included at the country\'s rate and never added; nothing else')
  const ENG = await kit.bundle('eus-engine', "export * as E from '@/lib/order-charges'\nexport * as RU from '@/lib/order-charge-rules'\nexport * as Ln from '@/lib/order-charge-lines'")
  const ch = CODES.map(c => { const r = ENG.RU.resolveChargeRules(mapped[c], { country: c }); const x = ENG.E.computeOrderCharges({ foodMinor: 2400, rules: r, channel: 'online_pay_at_truck' })
    return [c, r.taxInclusive === true && r.taxRateMilli === EXP[c][5] && x.totalMinor === 2400 && x.taxMinor === 0 && x.snapshot.tax_rate_milli === EXP[c][5] && r.surcharge === null && r.serviceFee === null && r.tipping === null] })
  t('each country: inclusive at its rate (Gibraltar none), 24.00 of food is a 24.00 total, no surcharge, service fee or tip', ch.every(([, ok]) => ok), ch.filter(([, ok]) => !ok).map(([c]) => c))
  const deR = ENG.RU.resolveChargeRules(mapped.DE, { country: 'DE' })
  const deSnap = ENG.E.computeOrderCharges({ foodMinor: 2400, rules: deR, channel: 'online_pay_at_truck' }).snapshot
  t('the receipt line in the country\'s own label ("MwSt. 7 %" in Germany); a truck\'s own rate wins (19 %); asking for a service fee changes nothing',
    deR.taxLabel === 'MwSt.' && /MwSt\./.test(JSON.stringify(ENG.Ln.includedTaxLine(deSnap, 'de-DE'))) && ENG.RU.resolveChargeRules(mapped.DE, { country: 'DE', tax_rate_milli: 19000 }).taxRateMilli === 19000
    && ENG.RU.resolveChargeRules(mapped.DE, { country: 'DE', service_fee_enabled: true, service_fee_bps: 300 }).serviceFee === null, ENG.Ln.includedTaxLine(deSnap, 'de-DE'))
  t('Gibraltar: no tax line on a receipt', ENG.Ln.includedTaxLine(ENG.E.computeOrderCharges({ foodMinor: 2400, rules: ENG.RU.resolveChargeRules(mapped.GI, { country: 'GI' }), channel: 'online_pay_at_truck' }).snapshot, 'en-GI') === null)

  // ══ 4 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · SWITCHED ON (fixture), one country per currency — the native price form')
  const ON = { DE: ['29 €', '69 €'], CH: ['CHF 27', 'CHF 65'], CZ: ['699 Kč', '1 690 Kč'], DK: ['219 kr.', '519 kr.'], HU: ['10 990 Ft', '24 990 Ft'], NO: ['299 kr', '729 kr'],
    PL: ['129 zł', '299 zł'], RO: ['149 lei', '369 lei'], SE: ['329 kr', '769 kr'], GI: ['£29', '£69'] }
  const LINE = { DK: 'Prices in Danish kroner (DKK)', NO: 'Prices in Norwegian kroner (NOK)', SE: 'Prices in Swedish kronor (SEK)' }
  const onRows = F.rowsWith(Object.keys(ON))
  for (const [c, want] of Object.entries(ON)) {
    const p = await R.page('landing', c.toLowerCase(), onRows), tx = text(p.html)
    const line = LINE[c]
    t(`/${c.toLowerCase()} (${by[c].currency}): renders; Pro and Unlimited as "${want.join('", "')}"; ${line ? `"${line}" once, before the first price` : 'no currency line'}; no "GB£", "EUR 29" or "RON"`,
      !p.redirectedTo && want.every(w => tx.includes(w)) && (line ? count(tx, line) === 1 && count(tx, 'Prices in ') === 1 && tx.indexOf(line) < tx.indexOf(want[0]) : !tx.includes('Prices in '))
      && !/GB£|EUR \d|\d RON\b/.test(tx) && p.html.includes(`"priceCurrency":"${by[c].currency}"`), { redirect: p.redirectedTo, seen: tx.match(/Pro .{0,60}/)?.[0] })
  }
  const pdf = text(await R.pdf(onRows, 'CH'))
  t('the plans PDF in Switzerland: CHF 27 and CHF 65', pdf.includes('CHF 27') && pdf.includes('CHF 65'), pdf.slice(0, 200))
  const deOn = await R.page('landing', 'de', onRows)
  t('switched on, a country\'s page lists it in hreflang under its locale (de-DE → /de)', deOn.meta?.alternates?.languages?.['de-DE'] === 'https://www.hatchgrab.com/de', deOn.meta?.alternates?.languages)

  // ══ 5 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('5 · SWITCHED OFF — the rows as the SQL writes them: invisible')
  const offRows = F.rowsWith([])
  const redirects = []
  for (const c of CODES) { const p = await R.page('landing', c.toLowerCase(), offRows); if (p.redirectedTo !== '/uk') redirects.push([c, p.redirectedTo]) }
  t('every one of the 29 /<code> pages 302s to /uk', redirects.length === 0, redirects)
  const cmp = await R.page('compare', 'ch', offRows)
  t('/ch/compare → /uk/compare', cmp.redirectedTo === '/uk/compare', cmp.redirectedTo)
  const uk = await R.page('landing', 'uk', offRows)
  const langs = Object.keys(uk.meta?.alternates?.languages || {}).sort()
  t('/uk\'s hreflang set is the live six and x-default only; no link to any new country', JSON.stringify(langs) === JSON.stringify(['en-AU', 'en-CA', 'en-GB', 'en-IE', 'en-NZ', 'en-US', 'x-default'].sort()) && !CODES.some(c => uk.html.includes(`href="/${c.toLowerCase()}"`)), langs)
  const sm = await R.sitemap(offRows)
  t('the sitemap names none of them', !sm.some(e => CODES.some(c => new RegExp(`hatchgrab\\.com/${c.toLowerCase()}(/|$)`).test(e.url))))
  const llms = await R.llms(offRows)
  t('/llms.txt names none of them', !CODES.some(c => llms.includes(`### ${NAMES[c]}`)) && llms.includes('### United Kingdom'))

  // ══ 6 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('6 · MALTA AND GIBRALTAR — ready in English')
  const Lc = read('lib/i18n/locales.ts')
  t('en-MT and en-GI are locales, each a sparse English override over en-IE (LOCALE_PARENT)', /'en-MT'/.test(Lc) && /'en-GI'/.test(Lc) && /'en-MT': 'en-IE'/.test(Lc) && /'en-GI': 'en-IE'/.test(Lc))
  const Tr = await kit.bundle('eus-tr', "export { translatorFor } from '@/lib/i18n/translator'\nimport '@/lib/i18n/catalog/compare'")
  t('the fixed fee reads "Cents per order" in Malta, "Pence per order" in Gibraltar (en-GI\'s one override)', Tr.translatorFor('en-MT', 'compare')('fee.fixedAria') === 'Cents per order' && Tr.translatorFor('en-GI', 'compare')('fee.fixedAria') === 'Pence per order'
    && JSON.stringify(JSON.parse(read('messages/en-GI.json'))) === '{"compare":{"fee":{"fixedAria":"Pence per order"}}}' && read('messages/en-MT.json').trim() === '{}')
  const M = await kit.bundle('eus-money', "export * from '@/lib/money-format'")
  const gi = { currency: 'GBP', locale: 'en-GI' }, gb = { currency: 'GBP', locale: 'en-GB' }
  t('money in Gibraltar is "£8.50" (Intl alone writes "GB£", since Gibraltar\'s own pound is GIP): menus, orders and the tip box\'s symbol', M.formatAmount(850, gi) === '£8.50' && M.currencySymbol(gi) === '£' && new Intl.NumberFormat('en-GI', { style: 'currency', currency: 'GBP' }).format(8.5) === 'GB£8.50')
  t('…the same registry entry writes Romania\'s "8,50 lei" (not "RON"); the UK, Malta and every other format exactly as Intl writes them', M.formatAmount(850, { currency: 'RON', locale: 'ro-RO' }).replace(/ /g, ' ') === '8,50 lei'
    && M.formatAmount(850, gb) === new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(8.5) && M.formatAmount(850, { currency: 'EUR', locale: 'en-MT' }) === '€8.50'
    && /narrowIn: \['en-GI'\]/.test(read('lib/currencies.ts')) && !/style: 'currency', currency: m\.currency/.test(read('app/trucks/[slug]/order/page.tsx')))

  // ══ 7 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('7 · THE NOT RUN SQL — block A "run now", block B "run after deploy"')
  const A = read(F.SQL_A)
  const aList = /check \(address_format in \(([^)]*)\)\)/.exec(A)?.[1].split(',').map(x => x.trim().replace(/'/g, ''))
  t('block A widens the address-format CHECK to exactly the formats\' keys, in their order (France\'s fr kept)', JSON.stringify(aList) === JSON.stringify([...AF.ADDRESS_FORMAT_KEYS]) && /^begin;$/m.test(A) && /^commit;$/m.test(A) && /NOT RUN/.test(A))
  t('…and nothing else: one drop and one add, no other table touched', count(A, 'alter table') === 2 && !/insert|update |delete/i.test(A.replace(/^--.*$/gm, '')))
  t('block B: begin … commit; rows before prices; every row switched off; written by "europe-settings draft"', /^begin;$/m.test(sql) && /^commit;$/m.test(sql) && sql.indexOf('insert into public.country_settings') < sql.indexOf('insert into public.plan_prices')
    && rows.every(r => r.enabled === false && r.updated_by === 'europe-settings draft') && /NOT RUN/.test(sql.slice(0, 400)))
  t('87 prices: Pay as you go, Pro and Unlimited for each of the 29; an extra van costs the plan\'s own price; Pay as you go free at 0.99 %',
    prices.length === 87 && CODES.every(c => JSON.stringify(prices.filter(p => p.country_code === c).map(p => p.plan_key)) === '["payg","pro","unlimited"]')
    && prices.every(p => p.extra_van_monthly_minor === p.monthly_minor) && prices.filter(p => p.plan_key === 'payg').every(p => p.monthly_minor === 0 && p.fee_bps === 99))
  const eur = prices.filter(p => by[p.country_code].currency === 'EUR')
  t('the euro countries at the brief\'s prices: €29 Pro with €4,000 included, €69 Unlimited', eur.every(p => p.plan_key === 'payg' || (p.plan_key === 'pro' ? p.monthly_minor === 2900 && p.included_online_minor === 400000 : p.monthly_minor === 6900 && p.included_online_minor === null)))
  const lines = sql.split('\n').filter(l => /^\s*\('(payg|pro|unlimited)'/.test(l))
  const nonEur = lines.filter(l => by[/'([A-Z]{2})'/.exec(l)[1]].currency !== 'EUR')
  t(`every non-euro price line (${nonEur.length}: CHF, CZK, DKK, GBP, HUF, NOK, PLN, RON, SEK) is marked "AWAITING DOMINIC'S APPROVAL"; no euro line is`,
    nonEur.length === 30 && nonEur.every(l => l.includes("AWAITING DOMINIC'S APPROVAL")) && lines.filter(l => !nonEur.includes(l)).every(l => !l.includes('AWAITING')))
  t('the proposed prices (report §8): CHF 27/65, 699/1,690 Kč, 219/519 kr., 10,990/24,990 Ft, 299/729 kr, 129/299 zł, 149/369 lei, 329/769 kr, £29/£69',
    JSON.stringify(Object.fromEntries(['CH', 'CZ', 'DK', 'HU', 'NO', 'PL', 'RO', 'SE', 'GI', 'LI'].map(c => [c, prices.filter(p => p.country_code === c && p.plan_key !== 'payg').map(p => p.monthly_minor / 100)])))
    === JSON.stringify({ CH: [27, 65], CZ: [699, 1690], DK: [219, 519], HU: [10990, 24990], NO: [299, 729], PL: [129, 299], RO: [149, 369], SE: [329, 769], GI: [29, 69], LI: [27, 65] }))

  // ══ 8 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('8 · THE TERMS — one section for the EEA and Switzerland; Gibraltar\'s own')
  const terms = read('content/legal/country-specific-terms.md')
  const eea = terms.slice(terms.indexOf('## European Economic Area and Switzerland'), terms.indexOf('\n## Gibraltar'))
  const gis = terms.slice(terms.indexOf('\n## Gibraltar'))
  t('"## European Economic Area and Switzerland" with "For food truck operators" and "Privacy, for everyone in the European Economic Area and Switzerland"',
    eea.length > 1000 && JSON.stringify([...eea.matchAll(/^### (.+)$/gm)].map(m => m[1])) === JSON.stringify(['For food truck operators', 'Privacy, for everyone in the European Economic Area and Switzerland']))
  const listed = CODES.filter(c => c !== 'GI').map(c => (c === 'CZ' ? 'the Czech Republic' : c === 'NL' ? 'the Netherlands' : NAMES[c]))
  t('it names every one of the 28 countries it covers', listed.every(n => eea.split('\n### ')[0].includes(n)), listed.filter(n => !eea.split('\n### ')[0].includes(n)))
  t('the truck as seller under local consumer law; VAT; the EU 14 allergens; payments in local currency; no surcharge or service fee; GDPR; notices; governing law',
    ['**You are the seller.**', 'consumer law of your country', 'including VAT', 'Regulation (EU) No 1169/2011', 'Swiss Ordinance on Food Information', "your country's currency", 'no card surcharge', '**No service fee.**', 'GDPR', 'Federal Act on Data Protection', '**Notices and governing law.**', 'law of England and Wales'].every(s => eea.includes(s)))
  const table = eea.split('\n').filter(l => /^\| [A-Z]/.test(l) && !l.startsWith('| Country'))
  t('the regulators: one row per country (28), Switzerland the FDPIC, and the EDPB\'s list linked for the rest', table.length === 28 && table.some(l => /Switzerland.*edoeb\.admin\.ch/.test(l)) && eea.includes('www.edpb.europa.eu'), table.length)
  t('Malta: the pages are in English, one of its official languages', eea.includes("In Malta, HatchGrab's pages for your customers are in English"))
  t('"## Gibraltar": pounds sterling, no VAT, the 14 allergens, the Gibraltar Regulatory Authority (www.gra.gi), GDPR as it applies there, England and Wales',
    ['in pounds sterling', 'Gibraltar has no VAT', 'Regulation (EU) No 1169/2011', 'Gibraltar Regulatory Authority', 'www.gra.gi', 'as it applies in Gibraltar', 'law of England and Wales'].every(s => gis.includes(s))
    && JSON.stringify([...gis.matchAll(/^### (.+)$/gm)].map(m => m[1])) === JSON.stringify(['For food truck operators', 'Privacy, for everyone in Gibraltar']))
  const paras = (eea + gis).split(/\n\s*\n/).map(p => p.trim()).filter(p => p && !p.startsWith('#') && !p.startsWith('|'))
  t(`every paragraph opens with a bold label, as the other sections do (${paras.length})`, paras.every(p => /^\*\*[^*]+\.\*\* /.test(p)) || paras.every(p => /^\*\*/.test(p) || /^This section applies/.test(p)))
  const legal = read('lib/legal.ts')
  t('the page\'s date and TERMS_VERSION stay 22 October 2026 (the same day as France\'s amendment)', /COUNTRY_TERMS_UPDATED = '22 October 2026'/.test(legal) && /TERMS_VERSION = '2026-10-22'/.test(legal) && terms.includes('**Last updated:** 22 October 2026'))
  const LT = await kit.bundle('eus-legal', "export { renderLegalMarkdown } from '@/lib/legal-markdown'\nexport { staticMarkup } from '@/lib/static-markup'")
  const html = LT.staticMarkup(LT.renderLegalMarkdown(terms))
  t('the page renders the regulators as a table (no "|" left in the text)', /<table[\s\S]*Liechtenstein[\s\S]*<\/table>/.test(html) && !/\|\s*Austria/.test(text(html)))

  console.log(`\n${fail ? '🔴' : '✅'} europe-settings: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
