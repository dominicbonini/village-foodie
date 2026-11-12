#!/usr/bin/env node
// scripts/ios/availability.cjs — ios-intl-1 Part 1 (9 November 2026): the app's App Store availability = EXACTLY the country_settings
// countries that are App Store territories (stated 9 Nov: Moldova and Ukraine removed; "available in new territories" stays off).
//   node scripts/ios/availability.cjs            show what would change
//   node scripts/ios/availability.cjs --apply    change it
//   node scripts/ios/availability.cjs --all [--apply]   world-countries-5 (12 November 2026, Dominic): EVERY App Store territory, not just
//     the country_settings ones — people anywhere can get the app from their own storefront. Availability only; "available in new
//     territories" is still never changed.
// The country list is lib/marketing-country.ts COUNTRY_PATH_SEGMENTS (the 44 country_settings rows, read-only checked 9 Nov).
'use strict'
const fs = require('fs')
const path = require('path')
const A = require('./asc.cjs')
// ISO 3166 alpha-2 → Apple's alpha-3 territory ids.
const A3 = { GB: 'GBR', US: 'USA', IE: 'IRL', AU: 'AUS', NZ: 'NZL', CA: 'CAN', FR: 'FRA', AT: 'AUT', BE: 'BEL', BG: 'BGR', HR: 'HRV', CY: 'CYP', CZ: 'CZE', DK: 'DNK',
  EE: 'EST', FI: 'FIN', DE: 'DEU', GI: 'GIB', GR: 'GRC', HU: 'HUN', IT: 'ITA', LV: 'LVA', LI: 'LIE', LT: 'LTU', LU: 'LUX', MT: 'MLT', NL: 'NLD', NO: 'NOR', PL: 'POL', PT: 'PRT',
  RO: 'ROU', SK: 'SVK', SI: 'SVN', ES: 'ESP', SE: 'SWE', CH: 'CHE', BR: 'BRA', MX: 'MEX', JP: 'JPN', SG: 'SGP', HK: 'HKG', MY: 'MYS', TH: 'THA', AE: 'ARE' }
;(async () => {
  const apply = process.argv.includes('--apply'), all = process.argv.includes('--all')
  const src = fs.readFileSync(path.join(__dirname, '../../lib/marketing-country.ts'), 'utf8')
  const codes = [...(/export const COUNTRY_PATH_SEGMENTS[^=]*= \{([\s\S]*?)\}/.exec(src)?.[1] ?? '').matchAll(/\b([A-Z]{2}): '/g)].map(m => m[1])
  if (!all && (codes.length !== 44 || codes.some(c => !A3[c]))) throw new Error(`expected the 44 countries, found ${codes.length}`)   // world-countries-5: 170 segments now — the list form needs A3 codes for them; --all does not
  const territories = new Set((await A.all('/v1/territories?limit=200')).data.map(t => t.id))
  const want = all ? new Set(territories) : new Set(codes.map(c => A3[c]).filter(t => territories.has(t)))
  const notTerritories = all ? [] : codes.filter(c => !territories.has(A3[c]))
  const av = A.must(await A.get(`/v1/apps/${A.APP_ID}/appAvailabilityV2`), 'availability')
  if (av.data.attributes.availableInNewTerritories !== false) throw new Error('"available in new territories" is on — this script never changes it; stop and ask')
  const ta = await A.all(`/v2/appAvailabilities/${av.data.id}/territoryAvailabilities?include=territory&limit=200`)
  const terr = t => t.relationships.territory.data.id
  const on = ta.data.filter(t => t.attributes.available).map(terr)
  const add = [...want].filter(t => !on.includes(t)), remove = on.filter(t => !want.has(t))
  console.log(all ? `App Store territories: ${territories.size}; wanted: all ${want.size}` : `country_settings: ${codes.length}; App Store territories among them: ${want.size}; not territories: ${notTerritories.join(', ') || 'none'}`)
  console.log(`available now: ${on.length}; to add: ${add.join(', ') || 'none'}; to remove: ${remove.join(', ') || 'none'}`)
  if (!apply || (!add.length && !remove.length)) return
  for (const t of ta.data.filter(x => add.includes(terr(x)) || remove.includes(terr(x)))) {
    A.must(await A.req('PATCH', `/v1/territoryAvailabilities/${t.id}`, { data: { type: 'territoryAvailabilities', id: t.id, attributes: { available: add.includes(terr(t)) } } }), `territory ${terr(t)}`)
    console.log(`  ${terr(t)} → ${add.includes(terr(t)) ? 'available' : 'removed'}`)
  }
  const after = (await A.all(`/v2/appAvailabilities/${av.data.id}/territoryAvailabilities?include=territory&limit=200`)).data.filter(t => t.attributes.available).map(terr).sort()
  console.log(`available after: ${after.length} — ${after.join(', ')}; exactly the wanted set: ${after.length === want.size && after.every(t => want.has(t))}`)
})().catch(e => { console.error(e.message); process.exit(1) })
