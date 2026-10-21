// scripts/currency-registry.cjs — THE CURRENCY REGISTRY STAYS THE ONE LIST (currency-registry, 21 October 2026;
// docs/currency-registry-report.md).
//
// LOCALHOST ONLY. Nothing reaches a database or the network: the country rows are fixtures, the admin page is rendered by
// the render kit. Checks:
//   1  THE REGISTRY — every currency has a code, a name, a symbol, its decimals and a minor-unit sign; the decimals are the
//      card processor's (two-decimal unless its own zero- / three-decimal lists say otherwise, HUF two-decimal for charges).
//   2  THE DATABASE LIST — the CHECK in supabase/migrations/20261027_currency_registry.sql names exactly the registry's codes.
//   3  THE FORMATTER READS IT — minor signs, small fees, plan symbols, decimals; GB / US / IE output unchanged (pinned).
//   4  THE LOADER — a row with a currency the registry lacks is refused, and a LIST leaves that row out (the others load).
//   5  NO "minor units" ANYWHERE — the rendered admin Countries tab (GB, IE, US, AU, NZ) shows p / c / ¢ / c / c beside the
//      fixed-fee boxes and a currency dropdown, and no app source writes "minor units" for a person to read.
const fs = require('fs')
const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'currency-registry' })
const { REPO, h } = kit
const LP1E = require('./_lp1e-fixtures.cjs')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 100 - s.length)))
const text = s => String(s).replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

// The card processor's currency page (cited in the report and in lib/currencies.ts): every currency is two-decimal
// "unless otherwise specified"; these are the ones it specifies. HUF is listed as a special case for PAYOUTS only.
const ZERO_DECIMAL = ['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']
const THREE_DECIMAL = ['BHD', 'JOD', 'KWD', 'OMR', 'TND']

;(async () => {
  const R = await kit.bundle('cr-reg', [
    "export * from '@/lib/currencies'",
    "export * from '@/lib/money-format'",
    "export { moneyFormatOf, planMoneyFormatOf } from '@/lib/country-settings-types'",
  ].join('\n'))

  // ══ 1 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('1 · THE REGISTRY — every currency complete, decimals as the card processor takes them')
  const MUST = ['GBP', 'USD', 'EUR', 'CAD', 'AUD', 'NZD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON']
  t(`it lists at least ${MUST.join(', ')}`, MUST.every(c => R.CURRENCY_CODES.includes(c)), R.CURRENCY_CODES)
  t('codes are unique, three capital letters', new Set(R.CURRENCY_CODES).size === R.CURRENCY_CODES.length && R.CURRENCY_CODES.every(c => /^[A-Z]{3}$/.test(c)))
  const incomplete = R.CURRENCIES.filter(c => !c.name || !c.symbol || !Number.isInteger(c.decimals) || !c.minorSign || !['minor', 'amount'].includes(c.shortFee) || !c.locale)
  t('every currency has a name, a symbol, its decimals, a minor-unit sign, a short-fee style and a home locale', incomplete.length === 0, incomplete.map(c => c.code))
  const wrongDecimals = R.CURRENCIES.filter(c => c.decimals !== (ZERO_DECIMAL.includes(c.code) ? 0 : THREE_DECIMAL.includes(c.code) ? 3 : 2))
  t('every currency\'s decimals are the card processor\'s (none of ours is zero- or three-decimal; HUF charges are two-decimal)', wrongDecimals.length === 0, wrongDecimals.map(c => `${c.code} ${c.decimals}`))
  t('the signs asked for: GBP p; USD and CAD ¢; EUR, AUD and NZD c', JSON.stringify(['GBP', 'USD', 'CAD', 'EUR', 'AUD', 'NZD'].map(c => R.currencyInfo(c).minorSign)) === JSON.stringify(['p', '¢', '¢', 'c', 'c', 'c']))
  t('currencyInfo is case-insensitive and null for an unlisted code', R.currencyInfo('eur')?.code === 'EUR' && R.currencyInfo('JPY') === null && R.currencyInfo(null) === null && !R.isSupportedCurrency('XYZ'))

  // ══ 2 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('2 · THE DATABASE LIST — the CHECK names exactly the registry\'s codes')
  const sql = fs.readFileSync(path.join(REPO, 'supabase/migrations/20261027_currency_registry.sql'), 'utf8')
  const m = /add constraint country_settings_currency_chk\s+check \(currency in \(([^)]*)\)\)/.exec(sql)
  const checkList = m ? [...m[1].matchAll(/'([A-Z]{3})'/g)].map(x => x[1]) : null
  t('the migration adds country_settings_currency_chk as an IN list', !!checkList && checkList.length > 0, sql.slice(0, 300))
  t('the CHECK list and the registry are the same codes, in the same order', JSON.stringify(checkList) === JSON.stringify([...R.CURRENCY_CODES]), { check: checkList, registry: R.CURRENCY_CODES })

  // ══ 3 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · THE FORMATTER READS IT — signs, small fees, plan symbols, decimals')
  const F = (currency, locale) => ({ currency, locale })
  t('admin sign (minorUnitSign): p / c / ¢ / c / c for GBP / EUR / USD / AUD / NZD — never null for a registry currency',
    ['GBP', 'EUR', 'USD', 'AUD', 'NZD'].map(R.minorUnitSign).join(' ') === 'p c ¢ c c' && R.CURRENCY_CODES.every(c => R.minorUnitSign(c)))
  t('sentence suffix (minorUnitSuffix): GBP p, USD ¢, CAD ¢, AUD c, NZD c — EUR none (it writes "€0.25"), as before',
    JSON.stringify(['GBP', 'USD', 'CAD', 'AUD', 'NZD', 'EUR'].map(R.minorUnitSuffix)) === JSON.stringify(['p', '¢', '¢', 'c', 'c', null]))
  // 🔴 PINNED: GB / US / IE output, byte-identical to before the registry (scratchpad snapshot, docs/currency-registry-report.md §5).
  const PIN = {
    'GBP|en-GB': ['20p', '1.5% + 20p', '£1.20', '£29', '£4,000', '£29.50', '£1,234.56'],
    'USD|en-US': ['30¢', '2.9% + 30¢', '$1.20', '$29', '$4,000', '$29.50', '$1,234.56'],
    'EUR|en-IE': ['€0.20', '1.5% + €0.25', '€1.20', '€29', '€4,000', '€29.50', '€1,234.56'],
  }
  for (const [k, want] of Object.entries(PIN)) {
    const [cur, loc] = k.split('|'); const f = F(cur, loc)
    const got = [R.smallFeeLabel(20, cur === 'USD' ? f : f), R.feeLabel({ pct: cur === 'USD' ? 2.9 : 1.5, fixedMinor: cur === 'USD' ? 30 : cur === 'EUR' ? 25 : 20 }, f), R.smallFeeLabel(120, f),
      R.formatWholeAmount(2900, R.planMoneyFormatOf(f)), R.formatWholeAmount(400000, R.planMoneyFormatOf(f)), R.formatAmount(2950, f), R.formatMinor(123456, f)]
    if (cur === 'USD') got[0] = R.smallFeeLabel(30, f)
    t(`${k}: small fee, card fee, plan prices and amounts unchanged (${want.join(' · ')})`, JSON.stringify(got) === JSON.stringify(want), got)
  }
  t('plan prices: GB / US / IE keep their own format (planMoneyFormatOf = moneyFormatOf)', ['GBP|en-GB', 'USD|en-US', 'EUR|en-IE'].every(k => { const [c, l] = k.split('|'); return JSON.stringify(R.planMoneyFormatOf(F(c, l))) === JSON.stringify(R.moneyFormatOf(F(c, l))) }))
  const symOk = R.CURRENCIES.filter(c => !R.formatWholeAmount(2900, R.planMoneyFormatOf(F(c.code, c.locale))).includes(c.symbol))
  t('every currency\'s plan price carries the registry\'s symbol in its home locale (A$29, NZ$29, CA$29, SEK 29…)', symOk.length === 0, symOk.map(c => `${c.code}: ${R.formatWholeAmount(2900, R.planMoneyFormatOf(F(c.code, c.locale)))} ≠ ${c.symbol}`))
  t('decimals come from the registry: HUF 2 (Intl says 0 — the card processor takes HUF in two-decimal units), GBP / USD / EUR 2',
    R.minorDigits('HUF') === 2 && ['GBP', 'USD', 'EUR'].every(c => R.minorDigits(c) === 2) && R.toMajor(2900, 'HUF') === 29)
  t('a code outside the registry still formats through Intl (JPY 0 decimals) — the formatter never throws on one', R.minorDigits('JPY') === 0)

  // ══ 4 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · THE LOADER — an unlisted currency is refused; a list leaves that one row out')
  const ctx = LP1E.context(kit, REPO)
  const L = await ctx.bundle('cr-loader', "export { mapCountryRow, listCountrySettings, readAllCountryRows, getCountrySettings, clearCountrySettingsCache } from '@/lib/country-settings'")
  const rowOf = r => ({ ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v])), updated_at: '2026-10-21T00:00:00Z' })
  const bad = { ...LP1E.GB(), countryCode: 'XX', name: 'Badland', currency: 'XYZ' }
  let refused = null; try { L.mapCountryRow(rowOf(bad)) } catch (e) { refused = e.message }
  t('mapCountryRow refuses a currency the registry does not list ("XX.currency has an unusable value")', /XX\.currency has an unusable value \("XYZ"\)/.test(refused || ''), refused)
  t('…and accepts every registry currency', R.CURRENCY_CODES.every(c => { try { return L.mapCountryRow(rowOf({ ...LP1E.GB(), currency: c })).currency === c } catch { return false } }))
  const listed = await ctx.withReq({ rows: [LP1E.GB(), LP1E.US_ON(), bad] }, async () => { L.clearCountrySettingsCache?.(); return kit.quietAsync(() => L.readAllCountryRows()) })
  t('a list with one bad row: the good rows load, the bad one is reported, nothing throws', JSON.stringify(listed.countries.map(c => c.countryCode).sort()) === '["GB","US"]'
    && listed.unreadable.length === 1 && listed.unreadable[0].code === 'XX' && /currency/.test(listed.unreadable[0].reason), listed.unreadable)
  const plain = await ctx.withReq({ rows: [LP1E.GB(), LP1E.US_ON(), bad] }, async () => kit.quietAsync(() => L.listCountrySettings()))
  t('listCountrySettings (the country menu, router, signup list) leaves it out too', plain.map(c => c.countryCode).sort().join() === 'GB,US')
  let direct = null
  await ctx.withReq({ rows: [LP1E.GB(), LP1E.US_ON(), bad] }, async () => { try { L.clearCountrySettingsCache?.(); await L.getCountrySettings('XX') } catch (e) { direct = e.message } })
  t('a direct read of THAT country still throws, loudly (its own pages and trucks never run on a guessed currency)', /unusable value/.test(direct || ''), direct)
  const badAllergen = { ...LP1E.GB(), countryCode: 'YY', name: 'Yonder', allergenSet: 'eu14' }
  const listed2 = await ctx.withReq({ rows: [LP1E.GB(), badAllergen] }, async () => { L.clearCountrySettingsCache?.(); return kit.quietAsync(() => L.readAllCountryRows()) })
  t('the same for an unknown allergen set (it used to make every list throw)', listed2.countries.length === 1 && listed2.unreadable[0]?.code === 'YY')

  // ══ 5 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('5 · NO "minor units" — the rendered admin Countries tab, and the app source')
  const CT = 'components/admin/CountriesTab.tsx'
  const A = await kit.bundle('cr-admin', `export { default as CountriesTab } from '@/${CT}'\nexport { rowToForm } from '@/lib/admin/country-form'`, {
    patches: [{ file: CT, states: ['rows', 'counts', 'forms', 'cols', 'loaded', 'unreadable'] }],
    stubs: { '@/lib/native/session': 'export async function nativeAuthHeader() { return {} }' },
  })
  const nul = { starterMonthlyMinor: null, proMonthlyMinor: null, maxMonthlyMinor: null, proAllowanceMinor: null, maxAllowanceMinor: null, platformFeePct: null }
  const rows = [
    { ...LP1E.GB(), updatedAt: '2026-10-21T00:00:00Z' },
    { ...LP1E.GB(), ...nul, countryCode: 'IE', name: 'Ireland', currency: 'EUR', locale: 'en-IE', cardFeeOnlineFixedMinor: 25, cardFeeInPersonFixedMinor: 10, tapToPayFixedMinor: 10, enabled: false, updatedAt: '2026-10-21T00:00:00Z' },
    { ...LP1E.US_ON(), updatedAt: '2026-10-21T00:00:00Z' },
    { ...LP1E.GB(), ...nul, countryCode: 'AU', name: 'Australia', currency: 'AUD', locale: 'en-AU', allergenSet: 'anz', cardFeeOnlineFixedMinor: 30, cardFeeInPersonFixedMinor: 10, tapToPayFixedMinor: 15, enabled: false, updatedAt: '2026-10-21T00:00:00Z' },
    { ...LP1E.GB(), ...nul, countryCode: 'NZ', name: 'New Zealand', currency: 'NZD', locale: 'en-NZ', allergenSet: 'anz', cardFeeOnlineFixedMinor: 30, cardFeeInPersonFixedMinor: 5, tapToPayFixedMinor: 15, enabled: false, updatedAt: '2026-10-21T00:00:00Z' },
  ]
  globalThis.__ms = { rows, counts: { GB: 14, US: 1, IE: 0, AU: 0, NZ: 0 }, forms: Object.fromEntries(rows.map(r => [r.countryCode, A.rowToForm(r)])), cols: {}, loaded: true, unreadable: [] }
  let adminHtml = ''
  try { adminHtml = kit.renderStatic(h(A.CountriesTab)) } finally { delete globalThis.__ms }
  if (process.env.CR_ADMIN_HTML) fs.writeFileSync(process.env.CR_ADMIN_HTML, adminHtml)
  const adminText = text(adminHtml)
  t('the admin Countries tab renders all five countries', ['United Kingdom', 'Ireland', 'United States', 'Australia', 'New Zealand'].every(n => adminText.includes(n)), adminText.slice(0, 200))
  t('no "minor units" anywhere on it', !/minor units/i.test(adminText), adminText.match(/.{40}minor units.{20}/i)?.[0])
  // The sign beside each fixed-fee box, per country column, in column order (online, in person, Tap to Pay).
  const signs = {}
  for (const r of rows) {
    const re = new RegExp(`aria-label="(cardFeeOnlineFixed|cardFeeInPersonFixed|tapToPayFixed) for ${r.countryCode}"[^>]*/><span[^>]*>([^<]*)</span>`, 'g')
    signs[r.countryCode] = [...adminHtml.matchAll(re)].map(x => x[2])
  }
  t('beside the online / in-person / Tap to Pay fee boxes: GB p, IE c, US ¢, AU c, NZ c', Object.entries({ GB: 'p', IE: 'c', US: '¢', AU: 'c', NZ: 'c' }).every(([cc, s]) => signs[cc].length === 3 && signs[cc].every(x => x === s)), signs)
  const sel = [...adminHtml.matchAll(/<select[^>]*aria-label="currency for (\w\w)"[^>]*>([\s\S]*?)<\/select>/g)].map(x => ({ cc: x[1], opts: [...x[2].matchAll(/<option[^>]*value="([^"]*)"/g)].map(o => o[1]) }))
  t('the currency is a dropdown of the registry\'s codes for a country no truck uses (IE, AU, NZ) — never free text', ['IE', 'AU', 'NZ'].every(cc => { const s = sel.find(x => x.cc === cc); return s && JSON.stringify(s.opts) === JSON.stringify([...R.CURRENCY_CODES]) })
    && !/aria-label="currency for (IE|AU|NZ)"[^>]*type="text"|<input[^>]*aria-label="currency for/.test(adminHtml), sel)
  t('…and stays locked for a country trucks use (GB, US show "🔒 … use it")', /GBP<\/span><span[^>]*>🔒 14 trucks use it/.test(adminHtml) && /USD<\/span><span[^>]*>🔒 1 truck uses it/.test(adminHtml))
  // The app source: no string a person reads says "minor units" (comments are fine).
  const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1').replace(/\{\s*\}/g, '')
  const offenders = []
  const walk = d => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) {
    const p = path.join(d, e.name); if (e.isDirectory()) { if (!/node_modules|i18n\/catalog/.test(p)) walk(p) } else if (/\.(tsx?|json)$/.test(e.name) && !/messages\/ns/.test(p)) {
      const s = /\.json$/.test(p) ? fs.readFileSync(path.join(REPO, p), 'utf8') : stripComments(fs.readFileSync(path.join(REPO, p), 'utf8'))
      if (/minor units/i.test(s)) offenders.push(p)
    } } }
  for (const d of ['app', 'components', 'lib', 'messages']) walk(d)
  t('no app, component, lib or message file says "minor units" outside a comment', offenders.length === 0, offenders)
  const adminRoute = fs.readFileSync(path.join(REPO, 'app/api/admin/route.ts'), 'utf8')
  t('/api/admin sends the settings of every country the plans table prices (Ireland has prices and no trucks)', /for \(const cc of new Set\(plans\.prices\.map\(p => p\.countryCode\)\)\)/.test(adminRoute))
  t('the order page\'s eftpos notice follows the registry (no currency code written in the page)', /currencyInfo\(truck\?\.money\?\.currency\)\?\.eftposNotice/.test(fs.readFileSync(path.join(REPO, 'app/trucks/[slug]/order/page.tsx'), 'utf8')))

  console.log(`\n${fail ? '🔴' : '✅'} currency-registry: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
