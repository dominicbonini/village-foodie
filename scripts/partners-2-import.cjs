#!/usr/bin/env node
// scripts/partners-2-import.cjs — partners-2 (16 November 2026, docs/partners-2-report.md §2): turns the Gemini partner list and
// its verification (docs/partners-2/verification.json — every organisation checked on the web: the site, the exact address on
// it, the domain's MX) into ONE committed migration, supabase/migrations/20261105_partners_2_import.sql. Run by hand:
//   node scripts/partners-2-import.cjs            # writes the SQL and prints the counts
// It never touches the database itself (the migration is run with scripts/db-migrate.cjs).
//
// THE RULES (the brief's, as data here):
//   • type: association / collective / directory / media / software_platform / other, per organisation (TYPE below).
//   • the primary email: the best VERIFIED listed address, else the best unverified one; every other listed address that is not
//     dropped becomes an alternate. A dropped address (no MX, junk, a typo domain, a duplicate alias, the wrong organisation) is
//     never stored as an address — it is named in verify_note.
//   • verify_status per organisation: ✓ verified (an address on their site + MX) / ? unverified (MX, not on the site) / ✗ dropped.
//   • language from the country (BE: Flanders nl, otherwise fr; CH: de unless the region says otherwise); time zone from the US
//     state / the region, else the country's.
//   • software platforms: status not_now, auto_send false. The US "metro FTA" sites are ONE company's network (fta.team): the hub
//     is the contact; each city site is imported as a network member, not_now, auto_send false — never 18 emails to one firm.
//   • dropped organisations: imported for the record, status not_now, auto_send false.
'use strict'
const fs = require('fs')
const path = require('path')
const REPO = path.resolve(__dirname, '..')
const V = JSON.parse(fs.readFileSync(path.join(REPO, 'docs/partners-2/verification.json'), 'utf8'))
const SOURCE = 'gemini-2026-11-16'

const SOFTWARE = /Street Food Finder|Roaming Hunger|Food Truck Club|StreetFoodApp|FoodtruckBooking\.nl|Moblz/i
const MEDIA = /FoodTruckr|Mobile Cuisine|Food Truck Empire/i
const DIRECTORY = /Directory|Foodtruck\.be|Foodtruckbestellen|Foodtruckya|Food Truck Finder USA|Food Truck Company UK/i
const COLLECTIVE = /Collective|KERB|Digbeth|GRUB|Real Food Festival|Carnivale|Thornbury|British Street Food|Scottish Street Food|Street Food Convention/i
function typeOf(o) {
  if (SOFTWARE.test(o.name)) return 'software_platform'
  if (MEDIA.test(o.name)) return 'media'
  if (o.section === 4) return 'directory'          // commercial booking sites of one network, not member-run associations
  if (DIRECTORY.test(o.name)) return 'directory'
  if (COLLECTIVE.test(o.name)) return 'collective'
  return 'association'
}

const US_STATE_TZ = {
  California: 'America/Los_Angeles', Georgia: 'America/New_York', Ohio: 'America/New_York', Washington: 'America/Los_Angeles',
  Minnesota: 'America/Chicago', Missouri: 'America/Chicago', Kentucky: 'America/New_York', 'North Carolina': 'America/New_York',
  Virginia: 'America/New_York', DC: 'America/New_York', Maryland: 'America/New_York', Pennsylvania: 'America/New_York',
  'New York': 'America/New_York', 'New Jersey': 'America/New_York', Massachusetts: 'America/New_York', Tennessee: 'America/Chicago',
  Florida: 'America/New_York', Texas: 'America/Chicago', Michigan: 'America/Detroit', Arizona: 'America/Phoenix',
  Wisconsin: 'America/Chicago', Illinois: 'America/Chicago',
}
const US_CITY = {   // section 4: city → [state, zone]
  'Los Angeles': ['CA', 'America/Los_Angeles'], 'New York City': ['NY', 'America/New_York'], 'San Antonio': ['TX', 'America/Chicago'],
  Austin: ['TX', 'America/Chicago'], Atlanta: ['GA', 'America/New_York'], 'San Francisco / Bay Area': ['CA', 'America/Los_Angeles'],
  'San Diego': ['CA', 'America/Los_Angeles'], 'Orange County': ['CA', 'America/Los_Angeles'], Seattle: ['WA', 'America/Los_Angeles'],
  Portland: ['OR', 'America/Los_Angeles'], Denver: ['CO', 'America/Denver'], Chicago: ['IL', 'America/Chicago'],
  'Miami / South Florida': ['FL', 'America/New_York'], Orlando: ['FL', 'America/New_York'], Tampa: ['FL', 'America/New_York'],
  Dallas: ['TX', 'America/Chicago'], Houston: ['TX', 'America/Chicago'], Phoenix: ['AZ', 'America/Phoenix'],
  'Las Vegas': ['NV', 'America/Los_Angeles'], Nashville: ['TN', 'America/Chicago'], Charlotte: ['NC', 'America/New_York'],
  Boston: ['MA', 'America/New_York'], Philadelphia: ['PA', 'America/New_York'], 'Washington DC': ['DC', 'America/New_York'],
}
const COUNTRY_TZ = { GB: 'Europe/London', IE: 'Europe/Dublin', FR: 'Europe/Paris', BE: 'Europe/Brussels', CH: 'Europe/Zurich', DE: 'Europe/Berlin',
  NL: 'Europe/Amsterdam', ES: 'Europe/Madrid', IT: 'Europe/Rome', SE: 'Europe/Stockholm', US: 'America/New_York', AU: 'Australia/Sydney',
  NZ: 'Pacific/Auckland', CA: 'America/Toronto' }
const COUNTRY_LANG = { GB: 'en', IE: 'en', US: 'en', AU: 'en', NZ: 'en', CA: 'en', FR: 'fr', DE: 'de', NL: 'nl', ES: 'es', IT: 'it', SE: 'sv', CH: 'de', BE: 'fr' }

/** country, region, time zone and language of one organisation, from its section and the list's region text. */
function placeOf(o) {
  const r = o.region || ''
  let cc = null, region = null, tz = null
  if (o.section === 1) cc = /Ireland/.test(r) && !/UK/.test(r) ? 'IE' : 'GB'
  else if (o.section === 2) cc = { France: 'FR', Belgium: 'BE', Switzerland: 'CH', Germany: 'DE', Netherlands: 'NL', Spain: 'ES', Italy: 'IT', Sweden: 'SE' }[r.split(' ')[0]] || null
  else if (o.section === 3 || o.section === 4) cc = 'US'
  else if (o.section === 5) cc = /Australia/.test(r) ? 'AU' : /New Zealand/.test(r) ? 'NZ' : /Canada/.test(r) ? 'CA' : null
  else if (o.section === 6) cc = /Netherlands|\.nl/i.test(o.name) ? 'NL' : 'US'
  const paren = (r.match(/\(([^)]+)\)/) || [])[1] || null
  if (o.section === 3) {
    const state = r.split(' (')[0].split(' / ')[0].trim()
    region = r
    tz = US_STATE_TZ[state] || (/DC/.test(r) ? 'America/New_York' : COUNTRY_TZ.US)
  } else if (o.section === 4) {
    const city = o.name.replace(/\s*\(.*$/, '').trim()
    const hit = US_CITY[city]
    region = hit ? `${city}, ${hit[0]}` : 'USA (national)'
    tz = hit ? hit[1] : COUNTRY_TZ.US
  } else {
    region = paren || (r && !/^(UK|Ireland|France|Belgium|Switzerland|Germany|Netherlands|Spain|Italy|Sweden|Australia|New Zealand|Canada)$/.test(r) ? r : null)
    if (cc === 'AU') tz = /QLD/.test(r) ? 'Australia/Brisbane' : /VIC/.test(r) ? 'Australia/Melbourne' : /South Aus/.test(r) ? 'Australia/Adelaide' : 'Australia/Sydney'
    else if (cc === 'CA') tz = /BC/.test(r) ? 'America/Vancouver' : /Calgary|AB/.test(r) ? 'America/Edmonton' : 'America/Toronto'
    else tz = COUNTRY_TZ[cc] || null
  }
  let lang = COUNTRY_LANG[cc] || 'en'
  if (cc === 'BE') lang = /Flanders|Vlaanderen|bestellen/i.test(r + ' ' + o.name) ? 'nl' : 'fr'
  if (cc === 'CH') lang = /Romandie|Genève|Geneva|Lausanne|Vaud|Ticino/i.test(r) ? (/Ticino/i.test(r) ? 'it' : 'fr') : 'de'
  if (cc === 'CA') lang = /Quebec|Québec|Montr/i.test(r + ' ' + o.name) ? 'fr' : 'en'
  return { cc, region, tz, lang }
}

const isNetworkMember = o => o.section === 4 && !/Central Network/i.test(o.name)
const q = v => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`)
const arr = a => (a.length ? `array[${a.map(q).join(', ')}]::text[]` : `'{}'::text[]`)

const rows = []
const seenEmail = new Set()
for (const o of V.orgs) {
  const v = o.verification
  const place = placeOf(o)
  const type = typeOf(o)
  const emails = (v && v.emails) || o.emails.map(e => ({ email: e, verdict: 'dropped', reason: 'not checked' }))
  const keep = emails.filter(e => e.verdict !== 'dropped')
  const rank = e => (e.verdict === 'verified' ? 0 : 1) + (/^(info|hello|contact|support)@/i.test(e.email) ? 0 : 0.5)
  keep.sort((a, b) => rank(a) - rank(b))
  const fresh = keep.filter(e => !seenEmail.has(e.email.toLowerCase()))
  const primary = fresh[0] ? fresh[0].email : null
  for (const e of fresh) seenEmail.add(e.email.toLowerCase())
  const alternates = fresh.slice(1).map(e => e.email)
  const dropped = emails.filter(e => e.verdict === 'dropped').map(e => `${e.email} (${e.reason})`)
  const verify = v ? (primary ? (fresh[0].verdict === 'verified' ? 'verified' : 'unverified') : 'dropped') : 'dropped'
  const notes = []
  if (v && v.org_reason) notes.push(v.org_reason)
  if (dropped.length) notes.push(`Not stored: ${dropped.join('; ')}`)
  if (v && v.suggested_primary && !o.emails.map(e => e.toLowerCase()).includes(String(v.suggested_primary).toLowerCase())) notes.push(`Their site publishes ${v.suggested_primary} (not on the list) — switch the primary if you want it.`)
  if (isNetworkMember(o)) notes.push('One of the fta.team network\'s city sites (one New York operator runs them all): contact the hub, not each city.')
  const software = type === 'software_platform'
  const autoSend = !software && !isNetworkMember(o) && verify !== 'dropped'
  const status = software || isNetworkMember(o) || verify === 'dropped' ? 'not_now' : 'to_contact'
  const evidence = v ? (emails.find(e => e.email === primary) || {}).found_on || v.website || null : null
  const displayName = o.section === 4
    ? (isNetworkMember(o) ? `FTA network — ${o.name}` : 'US Food Truck Association (fta.team hub)')
    : o.name.replace(/\s+/g, ' ').trim()
  rows.push({ name: displayName, type, ...place, website: v && v.website_ok ? v.website : (v && v.website) || null,
    email: primary, alternates, verify, verifyNote: notes.join(' ') || null, evidence, autoSend, status, section: o.section })
}

const sql = [`-- 20261105_partners_2_import.sql — partners-2 (16 November 2026): the Gemini partner list, verified, into partner_orgs.
-- GENERATED by scripts/partners-2-import.cjs from docs/partners-2/gemini-partner-list.md and docs/partners-2/verification.json —
-- do not edit by hand; change the rules in the script and regenerate.
--
-- ${rows.length} organisations · ✓ ${rows.filter(r => r.verify === 'verified').length} verified · ? ${rows.filter(r => r.verify === 'unverified').length} unverified · ✗ ${rows.filter(r => r.verify === 'dropped').length} dropped
-- 🔴 INSERTS ONLY, and only where the organisation is not already there (same name and country, or same email). Nothing is sent.
-- Software platforms, the fta.team network's city sites and dropped organisations: status not_now, auto_send false.
--
-- Run with: npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261105_partners_2_import.sql --approved-by-dominic
set lock_timeout = '3s';
begin;
`]
for (const r of rows) {
  sql.push(`insert into public.partner_orgs (name, type, country_code, region, website, email, alternate_emails, language, timezone, source, status, priority, verify_status, verify_note, verify_evidence, verified_at, auto_send)
select ${q(r.name)}, ${q(r.type)}, ${q(r.cc)}, ${q(r.region)}, ${q(r.website)}, ${q(r.email)}, ${arr(r.alternates)}, ${q(r.lang)}, ${q(r.tz)}, ${q(SOURCE)}, ${q(r.status)}, 'medium', ${q(r.verify)}, ${q(r.verifyNote)}, ${q(r.evidence)}, '2026-11-16T12:00:00Z', ${r.autoSend}
where not exists (select 1 from public.partner_orgs p where (lower(p.name) = lower(${q(r.name)}) and p.country_code is not distinct from ${q(r.cc)})${r.email ? ` or lower(btrim(p.email)) = lower(${q(r.email)})` : ''});`)
}
sql.push(`\ncommit;\n\n-- VERIFY (read-only):\n-- select verify_status, count(*) from public.partner_orgs where source = '${SOURCE}' group by 1 order by 1;\n`)
const out = path.join(REPO, 'supabase/migrations/20261105_partners_2_import.sql')
fs.writeFileSync(out, sql.join('\n'))
const by = k => rows.reduce((m, r) => (m[r[k]] = (m[r[k]] || 0) + 1, m), {})
console.log(`${rows.length} rows → ${path.relative(REPO, out)}`)
console.log('verify', by('verify'), '\ntype', by('type'), '\ncountry', by('cc'), '\nlanguage', by('lang'), '\nauto-send eligible', rows.filter(r => r.autoSend).length)
fs.writeFileSync(path.join(REPO, 'docs/partners-2/import-rows.json'), JSON.stringify(rows, null, 1))
