#!/usr/bin/env node
// scripts/admin-countries-1.cjs — admin-countries-1 (23 October 2026, docs/admin-countries-1-report.md).
//   node scripts/admin-countries-1.cjs          (NO NETWORK, NO DATABASE — esbuild bundles and fixtures)
//
// 1 · France's row (20261040, NOT RUN): every column exists live and no required one is missing; every value passes the
//     CHECKs; one plan_prices row per active public plan at Ireland's live euro prices; the loader reads it and the admin
//     form round-trips it; it inserts OFF with short_name 'France' and is safe to run twice.
// 2 · Admin › Countries, rendered: one row per country (36), every old setting in its own column (the map is the report's
//     §2 table, checked control by control), the Extra van line gone, data-derived sections, the Status badges.
// 3 · Saving Ireland unchanged writes back exactly the live row: the live IE row (read-only, 23 Oct) through the REAL
//     loader, form and lib/admin/country-actions.ts saveCountry into an in-memory table; before and after compared column
//     by column. The page sends the same body as before (scripts/admin-countries-1-screens.cjs proves that in WebKit).
// 4 · The server side of saving is untouched (git), and the small fixes (fr-FR, ro-RO, fr-LU).
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const kit = require('./_render-kit.cjs')({ cacheTag: 'admin-countries-1' })
const { REPO, h } = kit
const LP1E = require('./_lp1e-fixtures.cjs')
const EF = require('./_europe-settings-fixtures.cjs')
const FR1 = require('./_france-1-fixtures.cjs')
const AC = require('./_admin-countries-1-fixtures.cjs')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 600) : JSON.stringify(detail).slice(0, 600)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const COLS = JSON.parse(read('scripts/fixtures/country-settings-columns-2026-10-23.json'))
const IE_LIVE = JSON.parse(read('scripts/fixtures/ie-row-2026-10-23.json')).row
// Ireland's live plan_prices (read-only, 23 Oct 2026): what France copies.
const IE_PRICES = { payg: [0, 0, 99, 0], pro: [2900, 400000, 99, 2900], unlimited: [6900, null, 0, 6900] }
const ACTIVE_PUBLIC_PLANS = ['payg', 'pro', 'unlimited']   // public.plans where is_public and active (read-only, 23 Oct)

;(async () => {
  const ctx = LP1E.context(kit, REPO)
  const L = await ctx.bundle('ac1-lib', [
    "export { mapCountryRow } from '@/lib/country-settings'",
    "export * as F from '@/lib/admin/country-form'",
    "export * as A from '@/lib/admin/country-actions'",
  ].join('\n'))

  // ══ 1 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('1 · France — 20261040 (NOT RUN, run after deploy)')
  const { row: fr, prices: frPrices, sql: frSql } = FR1.sqlRows()
  t('the fixtures read 20261040, not 20261034', FR1.SQL_FILE === 'supabase/migrations/20261040_france_row_recheck.sql')
  const live = COLS.country_settings.map(c => c.column)
  t('every column it inserts exists in the live country_settings', Object.keys(fr).every(c => live.includes(c)), Object.keys(fr).filter(c => !live.includes(c)))
  const required = COLS.country_settings.filter(c => !c.nullable && !c.hasDefault).map(c => c.column)
  t('…and no NOT NULL column without a default is missing', required.every(c => c in fr), required.filter(c => !(c in fr)))
  const chk = EF.checkRow('country_settings', fr)
  t('every value passes every CHECK on country_settings (live definitions, address format list incl. "fr")', chk.every(c => c.ok === true), chk.filter(c => c.ok !== true))
  t('switched OFF, short_name "France", fr-FR, EUR, address format fr', fr.enabled === false && fr.short_name === 'France' && fr.locale === 'fr-FR' && fr.currency === 'EUR' && fr.address_format === 'fr')
  t('plan_prices: exactly one row per active public plan (payg, pro, unlimited)', frPrices.map(p => p.plan_key).sort().join() === ACTIVE_PUBLIC_PLANS.join())
  t("…at Ireland's live euro prices (monthly · included online · fee bps · extra van)",
    frPrices.every(p => JSON.stringify([p.monthly_minor, p.included_online_minor, p.fee_bps, p.extra_van_monthly_minor]) === JSON.stringify(IE_PRICES[p.plan_key])), frPrices)
  const ppCols = COLS.plan_prices.map(c => c.column)
  t('every plan_prices column it writes exists, and every required one is given', frPrices.every(p => Object.keys(p).every(c => ppCols.includes(c)))
    && COLS.plan_prices.filter(c => !c.nullable && !c.hasDefault).every(c => frPrices.every(p => c.column in p)))
  const ppChk = frPrices.flatMap(p => EF.checkRow('plan_prices', p))
  t('every plan_prices row passes every CHECK on plan_prices', ppChk.every(c => c.ok === true), ppChk.filter(c => c.ok !== true))
  t('safe to run twice: on conflict (country_code) do nothing, and on conflict do nothing for the prices',
    /\)\s*on conflict \(country_code\) do nothing;/.test(frSql) && /\)\s*on conflict do nothing;/.test(frSql) && /^begin;/m.test(frSql) && /^commit;/m.test(frSql))
  let frRow = null
  try { frRow = L.mapCountryRow({ ...fr, updated_at: '2026-10-23T00:00:00Z' }) } catch (e) { frRow = String(e) }
  t('the loader reads it (mapCountryRow refuses nothing)', typeof frRow === 'object' && frRow.countryCode === 'FR' && frRow.addressFormat === 'fr', frRow)
  const frBack = L.F.formToValues(L.F.rowToForm(frRow), { truckCount: 0, storedCurrency: 'EUR', countryCode: 'FR' })
  const frCols = frBack.ok ? L.A.valuesToColumns(frBack.values) : null
  const same = (a, b) => (a === null || b === null || typeof a !== 'number' && typeof b !== 'number') ? JSON.stringify(a) === JSON.stringify(b) : Number(a) === Number(b)
  t('…and the admin form round-trips it: every column the form writes comes back as the SQL inserts it',
    frBack.ok && Object.entries(frCols).every(([c, v]) => same(v, fr[c])), frBack.ok ? Object.entries(frCols).filter(([c, v]) => !same(v, fr[c])) : frBack.errors)
  t('20261034 is left exactly as it was (never edited)', execFileSync('git', ['diff', '--stat', 'HEAD', '--', 'supabase/migrations/20261034_france_row.sql'], { cwd: REPO }).toString() === '')

  // 20261038 guards every update with `enabled = false`; all 14 rows are on now, so it would update nothing. 20261041 carries the
  // same names, guarded by the live English short name instead.
  const s38 = AC.NOT_RUN_38(), s41 = AC.shortNamesOf('supabase/migrations/20261041_europe_short_names_2_recheck.sql'), sql41 = read('supabase/migrations/20261041_europe_short_names_2_recheck.sql')
  t('20261038 as written updates no switched-on row (every update guarded by enabled = false) — the 14 are on', [...read('supabase/migrations/20261038_europe_language_short_names_2.sql').matchAll(/^update [^\n]+$/gm)].every(m => /and enabled = false;$/.test(m[0]))
    && AC.liveRows().filter(r => r.countryCode in s38).every(r => r.enabled))
  t('20261041: the same 14 names as 20261038, each guarded by the row\'s LIVE English short name (so twice changes nothing)', JSON.stringify(s41) === JSON.stringify(s38)
    && [...sql41.matchAll(/where country_code = '([A-Z]{2})' and short_name = '([^']+)';/g)].every(m => AC.liveRows().find(r => r.countryCode === m[1])?.shortName === m[2])
    && (sql41.match(/^update /gm) || []).length === 14 && (sql41.match(/\bbegin;/g) || []).length === 1 && !/\b(insert|delete|alter|drop)\b/i.test(sql41.replace(/--[^\n]*/g, '')))

  // ══ 2 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('2 · Admin › Countries — countries as rows, settings as columns')
  const CT = 'components/admin/CountriesTab.tsx'
  const T = await kit.bundle('ac1-tab', `export { default as CountriesTab, statusOf } from '@/${CT}'\nexport { rowToForm } from '@/lib/admin/country-form'`, {
    patches: [{ file: CT, states: ['rows', 'counts', 'forms', 'cols', 'loaded', 'unreadable'] }],
    stubs: { '@/lib/native/session': 'export async function nativeAuthHeader() { return {} }' },
  })
  const rows = AC.liveRows()
  // Ireland with every conditional box showing: the card fee on the bill and the service fee allowed (HatchGrab keeps it),
  // prices NOT including tax — so every one of its controls is on the page.
  const ieAll = { ...rows.find(r => r.countryCode === 'IE'), cardSurchargeAllowed: true, serviceFeeAllowed: true, serviceFeeRecipient: 'hatchgrab', pricesIncludeTax: false }
  const render = list => {
    globalThis.__ms = { rows: list, counts: Object.fromEntries(list.map(r => [r.countryCode, r.countryCode === 'GB' ? 14 : r.countryCode === 'US' ? 1 : 0])),
      forms: Object.fromEntries(list.map(r => [r.countryCode, T.rowToForm(r)])), cols: {}, loaded: true, unreadable: [] }
    try { return kit.renderStatic(h(T.CountriesTab)) } finally { delete globalThis.__ms }
  }
  const html = render(rows.map(r => (r.countryCode === 'IE' ? ieAll : r)))
  fs.mkdirSync(path.join(REPO, 'node_modules/.cache'), { recursive: true }); fs.writeFileSync(path.join(REPO, 'node_modules/.cache/admin-countries-1.html'), html)
  const trs = [...html.matchAll(/<tr data-country-row="([A-Z]{2})"[^>]*>([\s\S]*?)<\/tr>/g)].map(m => ({ code: m[1], body: m[2] }))
  t('one row per country: all 36 (the live 35 and France)', trs.length === 36 && new Set(trs.map(r => r.code)).size === 36, trs.length)
  const heads = [...html.matchAll(/<th data-col="([^"]+)"/g)].map(m => m[1].replace(/&#x27;/g, "'"))
  const EXPECTED = ['Switched on', 'Trucks', 'Country name', 'Take our fee', 'Online %', 'Online fixed (p/c)', 'In person %', 'In person fixed (p/c)',
    'Tap to Pay extra (p/c)', 'Which cards these rates are for', 'Menu prices include tax', 'Tax name', "Card fee can go on the customer's bill",
    'Card fee cap %', 'Credit cards only', 'Card fee not allowed in', 'Tipping on for new trucks', 'Tip choices %', 'Allowed in this country', 'Who keeps it',
    "HatchGrab's fee %", "HatchGrab's fee fixed (p/c)", 'Most a truck can charge %', 'Most a truck can charge fixed (p/c)', 'Service fee and card fee are taxed',
    'Currency', 'Language style', 'Times', 'Dates', 'Week starts', 'Phone country code', 'Short name', 'Example phone number', 'Phone number check', 'Addresses',
    'Time zones offered at signup', 'Default time zone', 'Allergen list', 'Allergen card on its own', 'Support hours']
  t('the setting columns, in the approved order, units in the header', heads.join('|') === EXPECTED.join('|'), heads)
  const groups = [...html.matchAll(/<th colSpan="(\d+)"[^>]*>(?:<span[^>]*>)?([^<]*)/g)].map(m => `${m[2]}:${m[1]}`)
  // The group names are read from the component's own `{ group: '…' }` entries (the sweep refuses a harness naming the card
  // processor, and the third group is named after it); the column counts are pinned.
  const srcGroups = [...read(CT).matchAll(/\{ group: '([^']+)'/g)].map(m => m[1])
  t('the grouped header: the page\'s own groups, in order, spanning their columns (Status also spans the badge column)',
    groups.join('|') === srcGroups.map((g, i) => `${g}:${[4, 1, 6, 8, 6, 1, 12, 3][i]}`).join('|') && srcGroups.length === 8, groups)
  t('the Extra van line is gone (display only — plan_prices.extra_van_monthly_minor is untouched)', !/Extra van|Same as the plan/.test(html) && !read(CT).includes("label: 'Extra van'"))
  t('no help text in a header or a cell: every hint is behind an ⓘ (no hint paragraph is rendered)', !html.includes('Trucks can sign up from this country') && !html.includes('Not charged yet') && (html.match(/data-info-tip/g) || []).length > 50)
  t('"Last saved … by …" is behind the ⓘ beside each country (36 of them), not printed', !/Last saved/.test(html) && (html.match(/aria-label="About [^"]*, last saved"/g) || []).length === 36)

  // Every old field → its new column, control by control, in Ireland's row.
  const FIELD = {
    enabled: ['Switched on', 'aria-label="Switched on, IE"'], name: ['Country name', 'aria-label="name for IE"'],
    platformFeeEnabled: ['Take our fee', 'aria-label="Take our fee, IE"'],
    cardFeeOnlinePct: ['Online %'], cardFeeOnlineFixed: ['Online fixed (p/c)'], cardFeeInPersonPct: ['In person %'], cardFeeInPersonFixed: ['In person fixed (p/c)'],
    tapToPayFixed: ['Tap to Pay extra (p/c)'], cardFeeRegionLabel: ['Which cards these rates are for'],
    pricesIncludeTax: ['Menu prices include tax', 'aria-label="Menu prices include tax, IE"'], taxLabel: ['Tax name'],
    cardSurchargeAllowed: ["Card fee can go on the customer's bill", 'aria-label="Card fee can go on the customer&#x27;s bill, IE"'],
    cardSurchargeCapPct: ['Card fee cap %'], cardSurchargeCreditOnly: ['Credit cards only'], cardSurchargeExcludedRegions: ['Card fee not allowed in', 'aria-label="Add to cardSurchargeExcludedRegions for IE"'],
    tippingEnabledDefault: ['Tipping on for new trucks', 'aria-label="Tipping on for new trucks, IE"'], tipPresetsPct: ['Tip choices %', 'aria-label="Add to tipPresetsPct for IE"'],
    serviceFeeAllowed: ['Allowed in this country', 'aria-label="Online service fee allowed, IE"'], serviceFeeRecipient: ['Who keeps it'],
    serviceFeeHatchgrabPct: ["HatchGrab's fee %"], serviceFeeHatchgrabFixed: ["HatchGrab's fee fixed (p/c)"], serviceFeeTruckMaxPct: ['Most a truck can charge %'], serviceFeeTruckMaxFixed: ['Most a truck can charge fixed (p/c)'],
    feesTaxed: ['Service fee and card fee are taxed', 'aria-label="Service fee and card fee are taxed, IE"'],
    currency: ['Currency'], locale: ['Language style'], timeFormat: ['Times'], dateOrder: ['Dates'], weekStart: ['Week starts'], phoneCountryCode: ['Phone country code'],
    shortName: ['Short name'], phoneExample: ['Example phone number'], phoneCheck: ['Phone number check'], addressFormat: ['Addresses'],
    timezones: ['Time zones offered at signup', 'aria-label="Add to timezones for IE"'], defaultTimezone: ['Default time zone'], allergenSet: ['Allergen list'],
    allergenCardOnlyAllowed: ['Allergen card on its own', 'aria-label="Allergen card on its own, IE"'], supportHours: ['Support hours'],
  }
  const formFields = Object.keys(T.rowToForm(ieAll))
  t('the map names every field of the form, and nothing else', formFields.slice().sort().join() === Object.keys(FIELD).sort().join(), formFields.filter(f => !(f in FIELD)))
  const ieTr = trs.find(r => r.code === 'IE')
  const tds = ieTr.body.split(/<td\b/).slice(1)
  const misplaced = Object.entries(FIELD).filter(([field, [col, needle]]) => {
    const i = heads.indexOf(col); if (i < 0) return true
    return !tds[i + 2]?.includes(needle ?? `aria-label="${field} for IE"`)   // td 0 the country, td 1 the status
  }).map(([f]) => f)
  t('🔴 every old setting has its own column, and its control sits in that column of Ireland\'s row', misplaced.length === 0, misplaced)
  t('the country column: flag, name and code for every row; Save shows only on a changed row (none here)', /🇮🇪<\/span>Ireland/.test(ieTr.body) && !/>Save</.test(html))
  t('numbers right-aligned (text-right on every % and fixed box)', (html.match(/aria-label="cardFeeOnlinePct for [A-Z]{2}"/g) || []).length === 36 && /class="[^"]*text-right[^"]*" inputMode="decimal" aria-label="cardFeeOnlinePct for IE"/.test(html))
  t('the fee boxes keep the currency\'s sign beside them (GB p · IE c · US ¢ · CH Rp · SE öre)', [['GB', 'p'], ['IE', 'c'], ['US', '¢'], ['CH', 'Rp'], ['SE', 'öre']]
    .every(([cc, s]) => new RegExp(`aria-label="cardFeeOnlineFixed for ${cc}"[^>]*/><span[^>]*>${s}</span>`).test(html)))

  // Sections, from data.
  const secs = Object.fromEntries([...html.matchAll(/<tbody data-countries-section="([^"]+)">([\s\S]*?)<\/tbody>/g)].map(m => [m[1], [...m[2].matchAll(/data-country-row="([A-Z]{2})"/g)].map(x => x[1])]))
  t('sections from each row\'s locale and zone: English-speaking GB US IE AU NZ CA GI MT (GB first, the loader\'s order)', (secs['English-speaking'] || []).join() === 'GB,US,IE,AU,NZ,CA,GI,MT', secs['English-speaking'])
  t('…Europe: the 27 European-language countries and France (Cyprus by its euro — its zone is Asia/Nicosia); no "Other countries" section', (secs.Europe || []).length === 28 && secs.Europe.includes('FR') && secs.Europe.includes('LU') && !secs['Other countries'], secs)
  t('…a row with a non-European zone and a non-English locale would go to "Other countries"', (() => {
    const odd = { ...rows.find(r => r.countryCode === 'DE'), countryCode: 'BR', name: 'Brazil', locale: 'pt-BR', defaultTimezone: 'America/Sao_Paulo', timezones: ['America/Sao_Paulo'], currency: 'USD' }
    return /data-countries-section="Other countries"[\s\S]*data-country-row="BR"/.test(render([...rows.slice(0, 3), odd]))
  })())

  // Status.
  const st = (cc, patch = {}) => T.statusOf(cc, T.rowToForm({ ...rows.find(r => r.countryCode === cc), ...patch }))
  const enLive = Object.keys(AC.NOT_RUN_38())
  t('Name in English: the 14 countries 20261038 renames (live English short names, e.g. Poland, the Czech Republic)', enLive.length === 14 && enLive.every(cc => st(cc) === 'Name in English'), enLive.map(cc => `${cc}:${st(cc)}`))
  t('Ready: the 12 renamed by 20261037 (Deutschland … Norge), and LU, LI, PT whose own name is the English one', Object.keys(AC.RAN_37()).every(cc => st(cc) === 'Ready') && ['LU', 'LI', 'PT'].every(cc => st(cc) === 'Ready'))
  t('…and after 20261038 runs, none of the 14 is flagged', AC.liveRows({ with38: true }).filter(r => enLive.includes(r.countryCode)).every(r => T.statusOf(r.countryCode, T.rowToForm(r)) === 'Ready'))
  t('Ready: every English-speaking row (an English short name is right there), and France', ['GB', 'US', 'IE', 'AU', 'NZ', 'CA', 'GI', 'MT', 'FR'].every(cc => st(cc) === 'Ready'))
  t('Language not built: a locale not in LOCALES (e.g. lb-LU)', st('LU', { locale: 'lb-LU' }) === 'Language not built' && st('LU') === 'Ready')
  const badges = [...html.matchAll(/text-\[11px\] font-bold (?:bg-\w+-100 text-\w+-\d+)">([^<]+)</g)].map(m => m[1])
  t('the Status column on the page: 14 "Name in English", 22 "Ready", none "Language not built" (fr-LU is built)',
    badges.filter(b => b === 'Name in English').length === 14 && badges.filter(b => b === 'Ready').length === 22 && !badges.includes('Language not built'), badges.join(','))
  t('the filter chips: All 36 · Switched on 35 · Switched off 1 · Needs attention 14', /All <span[^>]*>36<\/span>/.test(html) && /Switched on <span[^>]*>35<\/span>/.test(html) && /Switched off <span[^>]*>1<\/span>/.test(html) && /Needs attention <span[^>]*>14<\/span>/.test(html))
  t('the search box and "+ Add country" are there', /aria-label="Search countries"/.test(html) && html.includes('+ Add country'))

  // ══ 3 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · Saving Ireland unchanged writes exactly what was there')
  const ieRow = L.mapCountryRow(IE_LIVE)
  const COL_OF = Object.fromEntries(Object.keys(IE_LIVE).map(c => [c, c]))
  let table = { ...IE_LIVE }, written = null
  const store = {
    async list() { return [L.mapCountryRow(table)] },
    async get(code) { return code === 'IE' ? L.mapCountryRow(table) : null },
    async truckCounts(codes) { return Object.fromEntries(codes.map(c => [c, 0])) },
    async update(code, expected, cols) {
      if (code !== 'IE' || L.mapCountryRow(table).updatedAt !== expected) return null
      for (const c of Object.keys(cols)) if (!(c in COL_OF)) throw new Error('unknown column ' + c)
      written = cols; table = { ...table, ...cols }; return L.mapCountryRow(table)
    },
    async insert() { throw new Error('no insert') }, async remove() { throw new Error('no remove') },
  }
  // The body the page sends: { code, expectedUpdatedAt: row.updatedAt, form: forms[code] } with forms[code] = rowToForm(row).
  const body = { code: 'IE', expectedUpdatedAt: ieRow.updatedAt, form: L.F.rowToForm(ieRow) }
  t('the page\'s save sends that body, unchanged from before (the same line in the old and new CountriesTab)',
    read(CT).includes("const r = await call('PUT', { code, expectedUpdatedAt: row.updatedAt, form: forms[code] })")
    && execFileSync('git', ['show', `HEAD:${CT}`], { cwd: REPO }).toString().includes("const r = await call('PUT', { code, expectedUpdatedAt: row.updatedAt, form: forms[code] })"))
  const before = { ...table }
  const r = await L.A.saveCountry(store, body, { by: 'admin@example.test', at: '2026-10-23T12:00:00.000Z' })
  const after = { ...table }
  const diff = Object.keys(before).filter(c => !['updated_at', 'updated_by'].includes(c) && !same(before[c], after[c]))
  t('🔴 the save succeeds and every column but updated_at / updated_by is exactly as before', r.ok && diff.length === 0, r.ok ? diff.map(c => `${c}: ${JSON.stringify(before[c])} → ${JSON.stringify(after[c])}`) : r)
  t('…numerics equal as numbers (the live "1.50" is written 1.5 — numeric(…,2) stores 1.50 again)', same(before.card_fee_online_pct, after.card_fee_online_pct) && same(before.card_fee_in_person_pct, after.card_fee_in_person_pct))
  t('…only the columns the form owns are written (no retired plan price column, no distance_unit, no competitor_*)', !!written
    && !Object.keys(written).some(c => /^(starter|pro|max)_|platform_fee_pct|distance_unit|competitor_/.test(c)))
  fs.mkdirSync(path.join(REPO, 'docs/admin-countries-1'), { recursive: true })
  fs.writeFileSync(path.join(REPO, 'docs/admin-countries-1/ie-save-before-after.json'), JSON.stringify({ before, written, after, differs: diff }, null, 1) + '\n')
  t('the save path is untouched: no change to lib/admin/*, the route, or the loader', execFileSync('git', ['diff', '--stat', 'HEAD', '--', 'lib/admin', 'app/api/admin/countries', 'lib/country-settings.ts'], { cwd: REPO }).toString() === '')

  // ══ 4 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · The small fixes')
  const msg = l => JSON.parse(read(`messages/${l}.json`))
  const fr_ = msg('fr-FR'), ro = msg('ro-RO'), lu = msg('fr-LU')
  t('fr-FR: the team phone example is French, +33 6 12 34 56 78', fr_.manageTeam.phonePlaceholder === '+33 6 12 34 56 78')
  t('ro-RO: the order button reads „Comandă ce implică o obligație de plată", and the busy notice quotes it',
    ro.order.placeOrder === 'Comandă ce implică o obligație de plată' && ro.order.busyNotice.includes('„Comandă ce implică o obligație de plată”'))
  const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v, p + k + '.') : [[p + k, v]]))
  t('fr-LU: a sparse override of fr-FR (20 keys), with the +352 phone example and .lu addresses', flat(lu).length === 20 && lu.manageTeam.phonePlaceholder === '+352 621 123 456'
    && flat(lu).every(([k]) => flat(fr_).some(([k2]) => k2 === k)))
  const LOC = await kit.bundle('ac1-loc', "export * from '@/lib/i18n/locales'")
  t('fr-LU is a locale, its parent fr-FR (LOCALE_PARENT)', LOC.LOCALES.includes('fr-LU') && LOC.LOCALE_PARENT['fr-LU'] === 'fr-FR')
  t("Luxembourg's TVA is data on its address format: 3 % (the super-reduced rate for food and restaurant services)", /const TAX_LU: RegionSalesTax \| undefined = \{ label: 'TVA', milli: 3000 \}/.test(read('lib/address-formats.ts')))

  console.log(`\n${fail ? '🔴' : '✅'} admin-countries-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
