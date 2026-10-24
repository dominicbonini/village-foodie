// scripts/_country-picker-1-fixtures.cjs — country-picker-1 (23 October 2026, docs/country-picker-1-report.md). A MODULE.
//
// The 36 countries as the box lists them once France is switched on: scripts/_admin-countries-1-fixtures.cjs (the live 35
// and France from 20261040), every one switched on. `menuOf` builds the picker's menu the way lib/visitor-country.ts does
// on a country page (switched-on rows with an address; ownName from Intl in the row's locale; the flag data URI), for
// bringing the REAL CountryMenu to life in a browser; the harnesses check its links equal the server-rendered ones.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
const AC = require('./_admin-countries-1-fixtures.cjs')

const ROWS = () => AC.liveRows({ franceOn: true })

/** The menu lib/visitor-country.ts hands the footer on country page `code`. `L` = a bundle exporting flagDataUri and
 *  COUNTRY_PATH_SEGMENTS. */
function menuOf(L, rows, code) {
  const ownName = c => { try { return new Intl.DisplayNames([c.locale], { type: 'region' }).of(c.countryCode) || c.name } catch { return c.name } }
  const opt = c => ({ code: c.countryCode, name: c.name, shortName: c.shortName ?? c.name, ownName: ownName(c), lang: c.locale, flag: L.flagDataUri(c.countryCode) })
  const live = rows.filter(c => c.enabled && c.countryCode in L.COUNTRY_PATH_SEGMENTS)
  return { current: opt(rows.find(c => c.countryCode === code)), options: live.map(opt), remember: null }
}

module.exports = { ROWS, menuOf }
