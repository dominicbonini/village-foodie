/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
// scripts/world-countries-5.cjs — world-countries-5 (12 November 2026, docs/world-countries-5-report.md): the 167 new countries
// as data (generator, migrations), the region blocks (lib/region-blocks.ts through lib/trade-area.ts), the region-tabbed
// country selector (components/landing/CountryMenu.tsx + lib/country-regions.ts) and its messages in every language.
// No database: the migrations are read as files; the switch-on migration (20261095) must stay unrun until Dominic deploys.
const fs = require('fs')
const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'world-countries-5' })
const { REPO } = kit
const G = require('./_world-countries-5-rows.cjs')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 100 - s.length)))
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const BLOCKED = 'Sorry, HatchGrab isn’t available in your region yet.'

;(async () => {
  // ══ 1 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('1 · THE 167 COUNTRIES AS DATA — the generator, the migrations')
  const csv = G.GO_LIVE
  t('go-live.csv: 210 rows; MX not in it', csv.length === 210 && !csv.some(r => r.code === 'MX'), csv.length)
  t('the generator makes 167 new rows (every go-live country without a row before)', G.ROWS.length === 167, G.ROWS.length)
  const OWN = { UA: 'uk-UA', KG: 'ru-KZ', KZ: 'kk-KZ', UZ: 'uz-UZ', AZ: 'az-AZ', GE: 'ka-GE', AM: 'hy-AM', MN: 'mn-MN', BD: 'bn-BD', NP: 'ne-NP', IN: 'en-GB', PK: 'en-GB' }
  const loc = Object.fromEntries(G.ROWS.map(r => [r.code, r.locale]))
  t('locale: the country’s own language only for the committed ones (UA KG KZ UZ AZ GE AM MN BD NP); India and Pakistan en-GB',
    Object.entries(OWN).every(([c, l]) => loc[c] === l), Object.fromEntries(Object.keys(OWN).map(c => [c, loc[c]])))
  const csvLoc = Object.fromEntries(csv.map(r => [r.code, r.launch_locale]))
  const other = G.ROWS.filter(r => !OWN[r.code] && r.locale !== csvLoc[r.code])
  t('every other new country: the CSV’s launch_locale', other.length === 0, other.map(r => [r.code, r.locale, csvLoc[r.code]]))
  const rowsSql = read('supabase/migrations/20261094_world_countries_5_rows.sql')
  t('rows migration: 167 country_settings rows, every one enabled = false', (rowsSql.match(/'world-countries-5'\)/g) || []).length >= 167 && !/\btrue, *'world-countries-5'/.test(rowsSql) && G.ROWS.every(r => rowsSql.includes(`'${r.code}'`)))
  const sw = read('supabase/migrations/20261095_world_countries_5_switch_on.sql')
  const swCodes = (sw.match(/where country_code in \(([^)]*)\)\s+and enabled = false/) || [, ''])[1].match(/'[A-Z]{2}'/g) || []
  t('switch-on migration: enables exactly the 167, turns MX off, sets the VAT flag on AE and BR — in one transaction',
    swCodes.length === 167 && new Set(swCodes).size === 167 && G.ROWS.every(r => swCodes.includes(`'${r.code}'`)) && /set enabled = false[^;]*where country_code = 'MX'/.test(sw) && /vat_number_required = true[^;]*\('AE', 'BR'\)/.test(sw) && /^begin;/m.test(sw) && /^commit;/m.test(sw), swCodes.length)
  const vat = csv.filter(r => r.tax === 'vat_number_required').map(r => r.code)
  t(`VAT-number flag = the CSV’s vat_number_required (${vat.length}): the 39 new in the rows, AE and BR (live) in the switch-on`,
    G.ROWS.filter(r => r.vatNumberRequired).length === vat.filter(c => G.ROWS.some(r => r.code === c)).length && vat.includes('AE') && vat.includes('BR'))
  const MC = read('lib/marketing-country.ts')
  t('every new country has a landing segment (/xx, its ISO code) — shown only once it is enabled', G.ROWS.every(r => new RegExp(`\\b${r.code}: '${r.code.toLowerCase()}'`).test(MC)), G.ROWS.filter(r => !new RegExp(`\\b${r.code}: '${r.code.toLowerCase()}'`).test(MC)).map(r => r.code))

  // Dominic's §9 answers (12 November 2026): the app in every App Store storefront, so iOS badges on for every go-live country (switch-on);
  // Iceland's week starts on Monday (switch-on); menus in local money in 11 countries (20261096, RUN).
  const IOS56 = 'AD AS AW AX BD BI BL BQ CC CF CK CW CX DJ ER ET FK FO GF GG GL GN GP GQ GU IM JE KI KM LS MC MF MH MP MQ NC NF NU PF PM PN PR RE SH SJ SM SX TG TK TL TV VA VI WF WS YT'.split(' ')
  const iosIn = ((/set ios_app_available = true[^;]*where country_code in \(([^)]*)\)/.exec(sw) || [, ''])[1].match(/'[A-Z]{2}'/g) || []).map(x => x.slice(1, -1))
  t('switch-on: ios_app_available on for the 56 new countries that had it off (the app is in every storefront now); Iceland\'s week starts Monday',
    iosIn.length === 56 && IOS56.every(c => iosIn.includes(c)) && G.ROWS.filter(r => !r.iosApp).every(r => iosIn.includes(r.code)) && /set week_start = 'monday'[^;]*where country_code = 'IS'/.test(sw), iosIn.length)
  // (Dominic, 12 Nov, correction to §9 answer 1) android_app_available on for the 17 with no Play storefront — same reasoning as iOS.
  const A17 = 'AD BD BI CF DJ ER ET GN GQ KI KM LS MH TG TL TV WS'.split(' ')
  const andIn = ((/set android_app_available = true[^;]*where country_code in \(([^)]*)\)/.exec(sw) || [, ''])[1].match(/'[A-Z]{2}'/g) || []).map(x => x.slice(1, -1))
  t('switch-on: android_app_available on for the 17 new countries with no Google Play storefront (every new row has both flags on after it)',
    andIn.length === 17 && A17.every(c => andIn.includes(c)) && G.ROWS.filter(r => !r.androidApp).every(r => andIn.includes(r.code)), andIn)
  const asc = JSON.parse(read('docs/world-countries-5/app-store-go-live.json')).countries
  t('App Store: the wanted list is exactly the 210 go-live countries (alpha-3), none of the excluded / held / cannot-sell ones',
    Object.keys(asc).length === 210 && csv.every(r => asc[r.code]) && ['RU', 'BY', 'CN', 'MX', 'KE', 'GH', 'VN', 'PH', 'AF', 'YE', 'IQ', 'MM', 'VE'].every(c => !(c in asc)) && asc.UA === 'UKR' && asc.MD === 'MDA')
  const mc = read('supabase/migrations/20261096_world_countries_5_menu_currency.sql')
  const MENU = { BH: 'BHD', JO: 'JOD', KW: 'KWD', OM: 'OMR', TN: 'TND', BT: 'BTN', TM: 'TMT', ER: 'ERN', MR: 'MRU', ST: 'STN', ZW: 'ZWG' }
  const regCodes = [...read('lib/currencies.ts').matchAll(/\{ code: '([A-Z]{3})',/g)].map(m => m[1])
  const mcList = ((/menu_currency is null or menu_currency in \(([^)]*)\)/.exec(mc) || [, ''])[1].match(/'[A-Z]{3}'/g) || []).map(x => x.slice(1, -1))
  t('20261096: menu_currency (NULL = currency) checked against the registry\'s 127 codes; set to local money in exactly the 11 billed in USD/EUR',
    regCodes.length === 127 && mcList.join() === regCodes.join() && Object.entries(MENU).every(([c, m]) => mc.includes(`set menu_currency = '${m}', updated_at = now(), updated_by = 'world-countries-5' where country_code = '${c}' and enabled = false;`))
    && (mc.match(/set menu_currency =/g) || []).length === 11 && Object.keys(MENU).every(c => ['USD', 'EUR'].includes(G.ROWS.find(r => r.code === c).currency)))
  const LP1E = require('./_lp1e-fixtures.cjs')
  const ctx = LP1E.context(kit, REPO)
  const CS = await ctx.bundle('wc5-cs', "export { mapCountryRow } from '@/lib/country-settings'\nexport { moneyFormatOf, planMoneyFormatOf, intlMoneyFormatOf } from '@/lib/country-settings-types'\nexport { regionNameIn } from '@/lib/region-name'\nexport { minorDigits } from '@/lib/money-format'")
  const rowOf = r => ({ ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v])), updated_at: '2026-11-12T00:00:00Z' })
  const bh = CS.mapCountryRow({ ...rowOf({ ...LP1E.GB(), countryCode: 'BH', name: 'Bahrain', currency: 'USD', locale: 'ar-BH' }), menu_currency: 'BHD' })
  const gb = CS.mapCountryRow(rowOf(LP1E.GB()))
  t('the loader: Bahrain prices its menu in BHD (three decimals) — moneyFormatOf, what provisioning, Manage and the reports use — and its plans in USD (planMoneyFormatOf / intlMoneyFormatOf, what Billing and the pricing pages use)',
    bh.menuCurrency === 'BHD' && CS.moneyFormatOf(bh).currency === 'BHD' && CS.minorDigits('BHD') === 3 && CS.planMoneyFormatOf(bh).currency === 'USD' && CS.intlMoneyFormatOf(bh).currency === 'USD', { bh: bh.menuCurrency })
  t('…a row with no menu_currency (every other country) is unchanged: menuCurrency = currency, and both formats are its currency', gb.menuCurrency === 'GBP' && CS.moneyFormatOf(gb).currency === 'GBP' && CS.planMoneyFormatOf(gb).currency === 'GBP')
  let refusedMenu = null; try { CS.mapCountryRow({ ...rowOf(LP1E.GB()), menu_currency: 'XYZ' }) } catch (e) { refusedMenu = e.message }
  t('…and a menu currency the registry does not list is refused, like an unknown currency', /menu_currency has an unusable value/.test(refusedMenu || ''), refusedMenu)
  t('a new truck is written with the MENU currency (lib/provision-truck.ts); Billing keeps the billing currency (BillingScreen)',
    /currency: countrySettings\.menuCurrency \?\? countrySettings\.currency,/.test(read('lib/provision-truck.ts')) && /const money = \{ currency: country\.currency, locale: country\.locale \}/.test(read('components/manage/BillingScreen.tsx')))
  t('Serbian in Latin script: Srbija and Crna Gora in sr-RS (Intl alone writes Србија); the selector, the FAQ values and /compare all name countries through it',
    CS.regionNameIn('sr-RS', 'RS') === 'Srbija' && CS.regionNameIn('sr-RS', 'ME') === 'Crna Gora' && CS.regionNameIn('de-DE', 'RS') === 'Serbien'
    && ['lib/visitor-country.ts', 'lib/faq/live-values.ts', 'lib/comparison-server.ts'].every(f => /regionNameIn\(/.test(read(f))), [CS.regionNameIn('sr-RS', 'RS'), CS.regionNameIn('sr-RS', 'ME')])

  // ══ 2 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('2 · REGION BLOCKS — lib/region-blocks.ts through checkTradeArea (signup, provisioning, Where you trade)')
  const M = await kit.bundle('wc5-ta', "export { checkTradeArea } from '@/lib/trade-area'\nexport { REGION_BLOCKS, blockedRegionOf } from '@/lib/region-blocks'")
  const facts = (code, tz, fmt = 'intl') => ({ countryCode: code, name: code, enabled: true, timezones: [tz], defaultTimezone: tz, addressFormat: fmt })
  const picked = (town, region, extra = {}) => ({ base_place_id: 'ChIJ-harness-0000000001', base_place_name: town, base_region: region, base_lat: 45, base_lng: 34, ...extra })
  const typed = town => ({ base_place_name: town })
  const UA = facts('UA', 'Europe/Kyiv'), GE = facts('GE', 'Asia/Tbilisi'), MD = facts('MD', 'Europe/Chisinau')
  const NO = [
    ['UA', UA, picked('Simferopol', 'Crimea')], ['UA', UA, picked('Сімферополь', 'Автономна Республіка Крим')], ['UA', UA, picked('Симферополь', 'Республика Крым')],
    ['UA', UA, typed('Yalta')], ['UA', UA, picked('Sevastopol', 'Sevastopol')], ['UA', UA, typed('Севастополь')],
    ['UA', UA, picked('Luhansk', "Luhans'ka oblast")], ['UA', UA, picked('Луганськ', 'Луганська область')], ['UA', UA, typed('Alchevsk')],
    ['UA', UA, picked('Mariupol', "Donets'ka oblast")], ['UA', UA, picked('Донецк', 'Донецкая область')], ['UA', UA, typed('Kramatorsk')],
    ['UA', UA, picked('Melitopol', "Zaporiz'ka oblast")], ['UA', UA, picked('Запоріжжя', 'Запорізька область')], ['UA', UA, typed('Berdiansk')],
    ['UA', UA, picked('Kherson', "Khersons'ka oblast")], ['UA', UA, picked('Херсон', 'Херсонська область')], ['UA', UA, typed('Nova Kakhovka')],
    ['GE', GE, picked('Sukhumi', 'Abkhazia')], ['GE', GE, picked('სოხუმი', 'აფხაზეთის ავტონომიური რესპუბლიკა')], ['GE', GE, typed('Gagra')],
    ['GE', GE, picked('Tskhinvali', 'Shida Kartli')], ['GE', GE, picked('Akhalgori', 'Mtskheta-Mtianeti')], ['GE', GE, picked('Java', 'Shida Kartli')],
    ['GE', GE, typed('Znauri')], ['GE', GE, picked('Kvaisi', 'Racha-Lechkhumi and Kvemo Svaneti')], ['GE', GE, typed('ცხინვალი')], ['GE', GE, typed('Цхинвал')],
    ['MD', MD, picked('Tiraspol', 'Transnistria')], ['MD', MD, picked('Rîbnița', 'Unitatea Teritorială din Stînga Nistrului')], ['MD', MD, typed('Тирасполь')], ['MD', MD, typed('Bender')],
    ['CA', facts('CA', 'America/Regina', 'ca'), picked('Saskatoon', 'Saskatchewan', { base_region_code: 'SK' })],
  ]
  const refused = NO.filter(([, f, i]) => { const r = M.checkTradeArea(i, f); return r.ok === false && r.code === 'region_blocked' })
  t(`refused, code region_blocked: all ${NO.length} towns in a blocked region (picked by region name in English / Ukrainian / Russian / Georgian / Romanian, typed by town name, Canada by code)`,
    refused.length === NO.length, NO.filter(x => !refused.includes(x)).map(([c, , i]) => [c, i.base_place_name, i.base_region]))
  const OK = [
    [UA, picked('Kyiv', 'Kyiv City')], [UA, picked('Lviv', "L'vivs'ka oblast")], [UA, picked('Одеса', 'Одеська область')], [UA, typed('Dnipro')], [UA, picked('Kharkiv', "Kharkivs'ka oblast")],
    [GE, picked('Tbilisi', 'Tbilisi')], [GE, picked('Batumi', 'Adjara')], [GE, picked('Gori', 'Shida Kartli')], [GE, typed('Kutaisi')],
    [MD, picked('Chișinău', 'Chișinău')], [MD, picked('Bălți', 'Bălți')], [MD, typed('Cahul')],
    [facts('CA', 'America/Winnipeg', 'ca'), picked('Calgary', 'Alberta', { base_region_code: 'AB' })],
    [facts('ID', 'Asia/Jakarta'), picked('Jakarta', 'Java')], [facts('RU', 'Europe/Moscow'), typed('Donetsk')], [facts('US', 'America/New_York', 'us'), typed('Kherson')],
  ]
  const passed = OK.filter(([f, i]) => M.checkTradeArea(i, f).ok === true)
  t(`accepted: ${OK.length} towns outside them — Kyiv, Lviv, Odesa, Kharkiv; Tbilisi, Batumi, Gori (Shida Kartli outside South Ossetia); Chișinău, Bălți; Calgary; and the same names in another country (Java in Indonesia)`,
    passed.length === OK.length, OK.filter(x => !passed.includes(x)).map(([f, i]) => [f.countryCode, i.base_place_name, M.checkTradeArea(i, f)]))
  t('the blocks are data, in one place: UA ×6, GE ×2, MD ×1, CA ×1', JSON.stringify(M.REGION_BLOCKS.map(b => b.iso)) === JSON.stringify(['UA-43', 'UA-40', 'UA-09', 'UA-14', 'UA-23', 'UA-65', 'GE-AB', 'GE-SK (part): South Ossetia', 'MD-SN', 'CA-SK']))
  t('no block in a live country other than Canada (GB — Pizzeria Gusto — untouched)', M.REGION_BLOCKS.every(b => ['UA', 'GE', 'MD', 'CA'].includes(b.country)))
  const AF = read('lib/address-formats.ts')
  t('the shared intl format keeps the Places top-level region name (regionName: true → regionFrom admin-1); SK no longer has its own closure; QC and MB keep theirs',
    /key: 'intl'[^\n]*regionName: true/.test(AF) && /\{ code: 'SK', name: 'Saskatchewan', salesTax: CA_TAX\.gstPstSk \}/.test(AF) && /code: 'QC'[^\n]*signupClosed/.test(AF) && /code: 'MB'[^\n]*signupClosed/.test(AF))
  t('Ukraine’s time zones leave out Europe/Simferopol', !G.ROWS.find(r => r.code === 'UA').timezones.includes('Europe/Simferopol'))

  // ══ 3 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · THE COUNTRY SELECTOR — regions, grid, phone panel')
  const CM = read('components/landing/CountryMenu.tsx'), CSS = read('app/(public)/(site)/landing/landing.css'), CR = read('lib/country-regions.ts')
  t('regions: Europe, Americas, Asia Pacific, Middle East, Africa — a tablist at the top; one panel per region; opens on the visitor’s region',
    /REGIONS = \['europe', 'americas', 'asiaPacific', 'middleEast', 'africa'\]/.test(CR) && /role="tablist"/.test(CM) && /'tabpanel'/.test(CM) && /setRegion\(home\)/.test(CM))
  const R = await kit.bundle('wc5-cr', "export * from '@/lib/country-regions'")
  const unplaced = [...csv.map(r => r.code), 'MX'].filter(c => !R.REGIONS.some(k => R.BY_REGION?.[k]?.includes?.(c)))
  t('every go-live country (and MX) is in exactly one region, as the CSV says', unplaced.length === 0 && csv.every(r => R.regionOfCountry(r.code) === { Europe: 'europe', Americas: 'americas', 'Asia Pacific': 'asiaPacific', 'Middle East': 'middleEast', Africa: 'africa' }[r.region]), unplaced)
  const item = (CM.match(/className="cc-item"[\s\S]*?<\/a>/) || [''])[0]
  t('each country in the list: flag, its own-language name and a tick — no code (the closed button keeps its code chip, as before)', /Flag|cc-flag/.test(item) && /ownName/.test(item) && /<Tick \/>/.test(item) && !/\.code\}/.test(item), item.slice(0, 400))
  t('laptop: a 5-column grid (4 at ≤1100px), wide box; phone (≤720px): full-screen, regions scroll sideways, one country per row, 44px targets',
    /\.cc-list\s*\{[^}]*repeat\(5/.test(CSS) && /max-width:\s*1100px\)[\s\S]{0,200}repeat\(4/.test(CSS) && /max-width:\s*720px\)[\s\S]{0,1500}100dvh[\s\S]{0,1500}overflow-x:\s*auto[\s\S]{0,1500}44px/.test(CSS), null)

  // ══ 4 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · MESSAGES — the five region names and the blocked sentence, in every language')
  const en = JSON.parse(read('messages/en-GB.json'))
  t(`en-GB: tradeArea.region_blocked = "${BLOCKED}" (Dominic’s approved wording)`, en.tradeArea.region_blocked === BLOCKED)
  t('en-GB: landingNav.country.regions = Europe / Americas / Asia Pacific / Middle East / Africa', JSON.stringify(en.landingNav.country.regions) === JSON.stringify({ europe: 'Europe', americas: 'Americas', asiaPacific: 'Asia Pacific', middleEast: 'Middle East', africa: 'Africa' }))
  const tr = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/world-countries-5-strings.json'), 'utf8'))
  const bases = Object.keys(tr).filter(l => l !== 'en-GB')
  const bad = bases.filter(l => { const j = JSON.parse(read(`messages/${l}.json`)); const v = [...['europe', 'americas', 'asiaPacific', 'middleEast', 'africa'].map(k => j.landingNav?.country?.regions?.[k]), j.tradeArea?.region_blocked]
    return v.some(x => !x || /'/.test(x) || /[\u202A-\u202E\u2066-\u2069]/.test(x)) || !v[5].includes('HatchGrab') || JSON.stringify(v) !== JSON.stringify(tr[l]) })
  t(`all ${bases.length} language bases carry the six strings (no straight apostrophe, no bidi controls, HatchGrab named)`, bases.length === 48 && bad.length === 0, bad)
  const backBad = bases.filter(l => { const f = path.join(REPO, `docs/i18n/back/${l}.json`); if (!fs.existsSync(f)) return false; const b = JSON.parse(fs.readFileSync(f, 'utf8')); return b['tradeArea.region_blocked'] !== BLOCKED || b['landingNav.country.regions.asiaPacific'] !== 'Asia Pacific' })
  t('back-translations (docs/i18n/back): the English, for every base that has a back file', backBad.length === 0, backBad)

  console.log(`\n${fail ? '🔴' : '✅'} world-countries-5: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
