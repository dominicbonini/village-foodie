#!/usr/bin/env node
// scripts/partners-3-import.cjs — partners-3 (16 November 2026, docs/partners-3-report.md): turns verified partner rows into ONE
// committed migration of inserts into partner_orgs, with partners-2's verification rules plus partners-3's contact channels.
// Run by hand:
//   node scripts/partners-3-import.cjs lists          # the two second lists: docs/partners-3/input.json + verification-{a,b,c}.json
//   node scripts/partners-3-import.cjs research <CC>  # one researched country: docs/partners-3/research/<cc>.json
// It writes supabase/migrations/<next number>_partners_3_<batch>.sql and docs/partners-3/import-<batch>.json, and prints the counts.
// It never touches the database itself (the migration is run with scripts/db-migrate.cjs).
//
// THE RULES (partners-2's, and the partners-3 brief's):
//   • An email is stored only if it was SEEN published on the organisation's own site / page (verified: + MX) or at least has MX
//     (unverified, never sent automatically). A dropped address is never stored — it is named in verify_note.
//   • verify_status: ✓ verified (primary seen on their site + MX) / ? unverified (no verified email, but the organisation exists —
//     reached by hand: contact form, Facebook, Instagram…) / ✗ dropped (not found, or invented).
//   • channel: email only with a verified email; otherwise the organisation's own contact form / Facebook / Instagram / … page.
//     Anything without a verified email is "You send / DM" — never sent automatically.
//   • last_seen_active: the newest dated evidence (a post, news, an event). Before 2024-01-01 → status not_now, "inactive". No date
//     found = unknown, NOT inactive. A month or year is stored as its first day (the precision is named in verify_note).
//   • Software platforms: not_now, auto_send off. Dropped and inactive organisations: imported for the record, not_now, auto_send off.
//   • auto_send is on only for a ✓ verified email at an active / unknown organisation — and even then nothing goes out unless the
//     country is "allowed" (a country with no rule is manual_only), the partner has an offer (a code), and the queue is approved.
'use strict'
const fs = require('fs')
const path = require('path')
const REPO = path.resolve(__dirname, '..')
const [mode, ccArg] = process.argv.slice(2)
if (!['lists', 'research'].includes(mode) || (mode === 'research' && !/^[A-Za-z]{2}$/.test(ccArg || ''))) {
  console.error('usage: node scripts/partners-3-import.cjs lists | research <CC>'); process.exit(2)
}

const COUNTRY_TZ = {
  PT: 'Europe/Lisbon', AT: 'Europe/Vienna', DK: 'Europe/Copenhagen', NO: 'Europe/Oslo', PL: 'Europe/Warsaw', CZ: 'Europe/Prague',
  SK: 'Europe/Bratislava', HU: 'Europe/Budapest', RO: 'Europe/Bucharest', GR: 'Europe/Athens', SI: 'Europe/Ljubljana', FI: 'Europe/Helsinki',
  TR: 'Europe/Istanbul', IL: 'Asia/Jerusalem', AE: 'Asia/Dubai', SA: 'Asia/Riyadh', ZA: 'Africa/Johannesburg', MY: 'Asia/Kuala_Lumpur',
  SG: 'Asia/Singapore', PH: 'Asia/Manila', ID: 'Asia/Jakarta', TH: 'Asia/Bangkok', JP: 'Asia/Tokyo', KR: 'Asia/Seoul', IN: 'Asia/Kolkata',
  MX: 'America/Mexico_City', CO: 'America/Bogota', CL: 'America/Santiago', PE: 'America/Lima', AR: 'America/Argentina/Buenos_Aires',
  UY: 'America/Montevideo', CR: 'America/Costa_Rica', EC: 'America/Guayaquil', BR: 'America/Sao_Paulo', HK: 'Asia/Hong_Kong',
  GB: 'Europe/London', IE: 'Europe/Dublin', FR: 'Europe/Paris', BE: 'Europe/Brussels', CH: 'Europe/Zurich', DE: 'Europe/Berlin',
  NL: 'Europe/Amsterdam', ES: 'Europe/Madrid', IT: 'Europe/Rome', SE: 'Europe/Stockholm', US: 'America/New_York', AU: 'Australia/Sydney',
  NZ: 'Pacific/Auckland', CA: 'America/Toronto', BG: 'Europe/Sofia', HR: 'Europe/Zagreb', EE: 'Europe/Tallinn', LV: 'Europe/Riga',
  LT: 'Europe/Vilnius', LU: 'Europe/Luxembourg', MT: 'Europe/Malta', CY: 'Asia/Nicosia', IS: 'Atlantic/Reykjavik', QA: 'Asia/Qatar',
  KW: 'Asia/Kuwait', BH: 'Asia/Bahrain', OM: 'Asia/Muscat', JO: 'Asia/Amman', EG: 'Africa/Cairo', KE: 'Africa/Nairobi', NG: 'Africa/Lagos',
  GH: 'Africa/Accra', PY: 'America/Asuncion', BO: 'America/La_Paz', PA: 'America/Panama', DO: 'America/Santo_Domingo',
  GT: 'America/Guatemala', SV: 'America/El_Salvador', HN: 'America/Tegucigalpa', NI: 'America/Managua', TW: 'Asia/Taipei', VN: 'Asia/Ho_Chi_Minh',
}
const COUNTRY_LANG = {
  PT: 'pt', BR: 'pt', AT: 'de', DE: 'de', CH: 'de', DK: 'da', NO: 'nb', PL: 'pl', CZ: 'cs', SK: 'sk', HU: 'hu', RO: 'ro', GR: 'el', CY: 'el',
  SI: 'sl', FI: 'fi', TR: 'tr', IL: 'he', AE: 'ar', SA: 'ar', QA: 'ar', KW: 'ar', BH: 'ar', OM: 'ar', JO: 'ar', EG: 'ar', ZA: 'en', MY: 'ms',
  SG: 'en', PH: 'en', ID: 'id', TH: 'th', JP: 'ja', KR: 'ko', IN: 'en', HK: 'zh', TW: 'zh', VN: 'vi', MX: 'es', CO: 'es', CL: 'es', PE: 'es', AR: 'es',
  UY: 'es', CR: 'es', EC: 'es', PY: 'es', BO: 'es', PA: 'es', DO: 'es', GT: 'es', SV: 'es', HN: 'es', NI: 'es', ES: 'es', FR: 'fr', BE: 'fr',
  NL: 'nl', IT: 'it', SE: 'sv', GB: 'en', IE: 'en', US: 'en', AU: 'en', NZ: 'en', CA: 'en', KE: 'en', NG: 'en', GH: 'en', BG: 'bg', HR: 'hr',
  EE: 'et', LV: 'lv', LT: 'lt', LU: 'fr', MT: 'en', IS: 'is',
}
const REGION_TZ = [[/Sarawak|Sabah/i, 'Asia/Kuching'], [/Bali/i, 'Asia/Makassar'], [/Baja California|Tijuana/i, 'America/Tijuana'], [/Amazonas|Manaus/i, 'America/Manaus']]
// Verification found these are ONE business, not a network of traders: imported for the record, not_now.
const NOT_A_NETWORK = [[/^Turnup Food Truck SA$/i, 'one food truck business, not a network (verification, 16 Nov 2026)'],
  [/Jakarta Food Truck/i, '@jktfoodtruck is a single food truck business, not an association (verification, 16 Nov 2026)'],
  [/\bIPES\b/, 'a public agency (Bogotá\'s street-vendor institute) — the address is its official correspondence intake, not a partnership contact (research, 16 Nov 2026)'],
  [/^Futraki \/ Iskra Events$/i, 'a catering / events firm — futraki.pl redirects to iskra-events.pl and no "Futraki" festival was found (verification, 16 Nov 2026)']]
const TYPES = new Set(['association', 'collective', 'organiser', 'consultant', 'supplier', 'directory', 'media', 'press', 'software_platform', 'other'])
const CHANNELS = new Set(['email', 'contact_form', 'facebook', 'instagram', 'whatsapp', 'linkedin'])

// ── the rows ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
let batch, source, rows
const readJson = f => JSON.parse(fs.readFileSync(path.join(REPO, f), 'utf8'))
if (mode === 'lists') {
  batch = 'lists'; source = 'partners-3-lists-2026-11-16'
  const input = readJson('docs/partners-3/input.json').rows
  const ver = ['a', 'b', 'c'].flatMap(g => readJson(`docs/partners-3/verification-${g}.json`))
  const byIdx = new Map(ver.map(v => [v.idx, v]))
  rows = input.map(r => ({ ...r, v: byIdx.get(r.idx) || null }))
} else {
  const cc = ccArg.toUpperCase()
  batch = `research_${cc.toLowerCase()}`
  const r = readJson(`docs/partners-3/research/${cc.toLowerCase()}.json`)
  source = `partners-3-research-${cc.toLowerCase()}-${r.checked || '2026-11-16'}`
  rows = (r.orgs || []).map((o, idx) => ({ idx, name: o.name, type: o.type, country_code: cc, region: o.region || '', language: o.language || '', notes: o.notes || '', v: o }))
}

const q = v => (v === null || v === undefined || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`)
const arr = a => (a.length ? `array[${a.map(q).join(', ')}]::text[]` : `'{}'::text[]`)
/** "2025-03-14" / "2025-03" / "2025" → { date: first day, precision } (null when absent or unreadable). */
function seenDate(s) {
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(String(s || '').trim())
  if (!m) return null
  return { date: `${m[1]}-${m[2] || '01'}-${m[3] || '01'}`, precision: m[3] ? 'day' : m[2] ? 'month' : 'year', year: Number(m[1]) }
}

const out = []
const seenEmail = new Set(), seenName = new Set()
for (const r of rows) {
  const v = r.v
  const cc = String(r.country_code || '').toUpperCase()
  const nameKey = `${String(r.name).trim().toLowerCase()}|${cc}`
  if (seenName.has(nameKey)) { out.push({ name: r.name, cc, skipped: 'listed twice' }); continue }
  seenName.add(nameKey)
  const type = TYPES.has(r.type) ? r.type : 'other'
  const emails = (v && Array.isArray(v.emails) ? v.emails : []).filter(e => e && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.email || ''))
  const keep = emails.filter(e => e.verdict === 'verified' || (e.verdict === 'unverified' && e.domain_mx))
  const rank = e => (e.verdict === 'verified' ? 0 : 1) + (/^(info|hello|contact|kontakt|contacto|geral|ola|hola)@/i.test(e.email) ? 0 : 0.5)
  keep.sort((a, b) => rank(a) - rank(b))
  const fresh = keep.filter(e => !seenEmail.has(e.email.toLowerCase()))
  for (const e of fresh) seenEmail.add(e.email.toLowerCase())
  const primary = fresh[0] || null
  const dropped = emails.filter(e => !keep.includes(e)).map(e => `${e.email} (${e.reason || e.verdict})`)
  const found = v && v.org_verdict !== 'not_found'
  const seen = seenDate(v && v.last_seen_active)
  const inactive = !!(v && (v.org_verdict === 'inactive' || (seen && seen.year < 2024)))
  const verify = !v || !found ? 'dropped' : primary && primary.verdict === 'verified' ? 'verified' : 'unverified'
  // A non-email channel counts only with its link (a "facebook" with no page found is no channel).
  const linkOf = { contact_form: v && v.contact_form_url, facebook: v && v.facebook_url, instagram: v && v.instagram_url, whatsapp: v && v.whatsapp_url, linkedin: v && v.linkedin_url }
  let channel = primary && primary.verdict === 'verified' ? 'email' : (v && CHANNELS.has(v.channel) && v.channel !== 'email' && linkOf[v.channel] ? v.channel : null)
  if (!channel) channel = v && v.contact_form_url ? 'contact_form' : v && v.facebook_url ? 'facebook' : v && v.instagram_url ? 'instagram' : 'email'
  const software = type === 'software_platform'
  const single = (NOT_A_NETWORK.find(([re]) => re.test(String(r.name))) || [])[1] || null
  const status = software || verify === 'dropped' || inactive || single ? 'not_now' : 'to_contact'
  const autoSend = verify === 'verified' && !software && !inactive && !single
  const notes = []
  if (single) notes.push(`Not a network: ${single}.`)
  if (v && v.notes) notes.push(v.notes)
  if (inactive) notes.push(`Inactive: newest evidence ${v.last_seen_active || 'before 2024'}${v.last_seen_source ? ` (${v.last_seen_source})` : ''} — nothing since 2024.`)
  else if (seen) notes.push(`Last seen active ${v.last_seen_active}${seen.precision !== 'day' ? ` (${seen.precision} precision; stored as its first day)` : ''}${v.last_seen_source ? ` — ${v.last_seen_source}` : ''}.`)
  else if (found) notes.push('No dated activity found (unknown, not inactive).')
  if (dropped.length) notes.push(`Not stored: ${dropped.join('; ')}`)
  if (!found && v) notes.push('Organisation not found.')
  if (!v) notes.push('Not verified (no verification row).')
  if (software) notes.push('Software platform: not_now, never sent automatically.')
  const evidence = (primary && primary.found_on) || (v && (v.contact_form_url || v.facebook_url || v.instagram_url || v.last_seen_source)) || null
  const lang = (String(r.language || '').toLowerCase().replace(/^no$/, 'nb').slice(0, 2)) || COUNTRY_LANG[cc] || 'en'
  const tz = (REGION_TZ.find(([re]) => re.test(`${r.region || ''} ${r.name}`)) || [])[1] || COUNTRY_TZ[cc] || null
  const region = r.region && !/^(Europe|Latin America|Asia-Pacific|Middle East & Africa|National)$/i.test(r.region) ? r.region : (r.region === 'National' ? 'National' : null)
  out.push({
    name: String(r.name).replace(/\s+/g, ' ').trim(), type, cc, region, website: v && v.website ? v.website : (r.website || null),
    email: primary ? primary.email : null, alternates: fresh.slice(1).map(e => e.email), lang, tz, status, verify,
    verifyNote: notes.join(' ') || null, evidence, autoSend, channel,
    facebook: (v && v.facebook_url) || null, instagram: (v && v.instagram_url) || null, contactForm: (v && v.contact_form_url) || null,
    lastSeen: seen ? seen.date : null, members: (v && v.members_estimate) || r.members_estimate || null,
    inactive, found: !!found, single: !!single, list: r.list || null, idx: r.idx,
  })
}

// ── the migration ────────────────────────────────────────────────────────────────────────────────────────────────────────
const live = out.filter(r => !r.skipped)
const migDir = path.join(REPO, 'supabase/migrations')
const existing = fs.readdirSync(migDir).filter(f => new RegExp(`_partners_3_${batch}\\.sql$`).test(f))
const nums = fs.readdirSync(migDir).map(f => (/^(2026\d{4})_/.exec(f) || [])[1]).filter(Boolean).map(Number)
const file = existing[0] || `${Math.max(...nums) + 1}_partners_3_${batch}.sql`
const count = k => live.filter(k).length
const sql = [`-- ${file} — partners-3 (16 November 2026, docs/partners-3-report.md): ${mode === 'lists' ? 'the second partner lists (docs/partners-2/gemini-partner-list-2.md, docs/partners-2/claude-leads-2026-11-16.csv)' : `the slow research, ${ccArg.toUpperCase()}`}, verified, into partner_orgs.
-- GENERATED by scripts/partners-3-import.cjs (${mode}${ccArg ? ` ${ccArg.toUpperCase()}` : ''}) — do not edit by hand; change the rules in the script and regenerate.
--
-- ${live.length} organisations · ✓ ${count(r => r.verify === 'verified')} verified email · social / form ${count(r => r.verify !== 'verified' && (r.facebook || r.instagram || r.contactForm))} · ? unverified email ${count(r => r.verify === 'unverified' && r.email)} · inactive ${count(r => r.inactive && r.found)} · ✗ dropped ${count(r => r.verify === 'dropped')}
-- 🔴 INSERTS ONLY, and only where the organisation is not already there (same name and country, or same email). Nothing is sent:
-- no verified email → "You send / DM"; a country with no outreach_country_rules row is manual_only; no code → "Needs offer".
--
-- Run with: npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/${file} --approved-by-dominic
set lock_timeout = '3s';
begin;
`]
for (const r of live) {
  sql.push(`insert into public.partner_orgs (name, type, country_code, region, website, email, alternate_emails, language, timezone, source, status, priority, verify_status, verify_note, verify_evidence, verified_at, auto_send, channel, facebook_url, instagram_url, contact_form_url, last_seen_active, members_estimate)
select ${q(r.name)}, ${q(r.type)}, ${q(r.cc)}, ${q(r.region)}, ${q(r.website)}, ${q(r.email)}, ${arr(r.alternates)}, ${q(r.lang)}, ${q(r.tz)}, ${q(source)}, ${q(r.status)}, 'medium', ${q(r.verify)}, ${q(r.verifyNote)}, ${q(r.evidence)}, now(), ${r.autoSend}, ${q(r.channel)}, ${q(r.facebook)}, ${q(r.instagram)}, ${q(r.contactForm)}, ${r.lastSeen ? `${q(r.lastSeen)}::date` : 'null'}, ${q(r.members)}
where not exists (select 1 from public.partner_orgs p where (lower(p.name) = lower(${q(r.name)}) and p.country_code is not distinct from ${q(r.cc)})${r.email ? ` or lower(btrim(p.email)) = lower(${q(r.email)})` : ''});`)
}
sql.push(`\ncommit;\n\n-- VERIFY (read-only):\n-- select verify_status, channel, status, count(*) from public.partner_orgs where source = '${source}' group by 1, 2, 3 order by 1, 2, 3;\n`)
fs.writeFileSync(path.join(migDir, file), sql.join('\n'))
fs.writeFileSync(path.join(REPO, `docs/partners-3/import-${batch}.json`), JSON.stringify(out, null, 1))

// ── the counts per country: email ✓ / social-only / inactive / dropped ─────────────────────────────────────────────────────
const per = {}
for (const r of live) {
  const c = per[r.cc] = per[r.cc] || { email: 0, social: 0, unverified: 0, none: 0, inactive: 0, dropped: 0, software: 0, single: 0 }
  if (r.verify === 'dropped') c.dropped++
  else if (r.type === 'software_platform') c.software++
  else if (r.inactive) c.inactive++
  else if (r.single) c.single++
  else if (r.verify === 'verified') c.email++
  else if (r.facebook || r.instagram || r.contactForm) c.social++
  else if (r.email) c.unverified++
  else c.none++
}
fs.writeFileSync(path.join(REPO, `docs/partners-3/counts-${batch}.json`), JSON.stringify(per, null, 1))
console.log(`${live.length} rows (${out.length - live.length} skipped) → supabase/migrations/${file}`)
for (const [cc, c] of Object.entries(per).sort()) console.log(`  ${cc}  email ✓ ${c.email} · social-only ${c.social} · ? email ${c.unverified} · no contact route ${c.none} · inactive ${c.inactive} · dropped ${c.dropped}${c.software ? ` · software ${c.software}` : ''}${c.single ? ` · single business ${c.single}` : ''}`)
