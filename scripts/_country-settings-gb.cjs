// scripts/_country-settings-gb.cjs — the GB country_settings row, PARSED FROM THE SEED THAT WAS RUN.
// Shared by the harnesses that need a CountrySettings object (country-settings-parity, compare-no-system).
// ⚠️ Read from supabase/migrations/20261010_03_country_settings_seed_gb.sql, never typed out: a hand copy
// would prove the code agrees with the hand copy. Column names are camelCased exactly as the loader
// (lib/country-settings.ts) maps them.
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')

function splitTop(src) {
  const out = []; let cur = ''; let depth = 0; let q = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (q) { cur += c; if (c === "'") { if (src[i + 1] === "'") { cur += "'"; i++ } else q = false } continue }
    if (c === "'") { q = true; cur += c; continue }
    if (c === '[' || c === '(') depth++
    if (c === ']' || c === ')') depth--
    if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue }
    cur += c
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}
function sqlValue(tok) {
  const t = tok.replace(/::[a-z0-9_(),\s]+(\[\])?$/i, '').trim()
  if (/^null$/i.test(t)) return null
  if (/^true$/i.test(t)) return true
  if (/^false$/i.test(t)) return false
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t)
  if (t === "'{}'") return []
  if (/^array\[/i.test(t)) return splitTop(t.slice(6, -1)).map(sqlValue)
  if (t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1).replace(/''/g, "'")
  throw new Error(`the GB seed holds a value this parser does not understand: ${tok}`)
}
function rowFromSeed(file) {
  const sql = read(file).replace(/--.*$/gm, '')
  const cols = sql.match(/insert into public\.country_settings \(([\s\S]*?)\)\s*values/i)
  const vals = sql.match(/\)\s*values \(([\s\S]*?)\)\s*on conflict/i)
  if (!cols || !vals) throw new Error('the GB seed file no longer has the shape this parser reads')
  const names = splitTop(cols[1]); const values = splitTop(vals[1])
  if (names.length !== values.length) throw new Error(`GB seed: ${names.length} columns but ${values.length} values`)
  const row = {}
  names.forEach((n, i) => { row[n.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = sqlValue(values[i]) })
  row.updatedAt = '2026-10-10T00:00:00Z'
  // The competitor_* columns are retired and unread (20261010_10), so the loader's shape no longer has them.
  delete row.competitorName; delete row.competitorPct; delete row.competitorFixedMinor
  return row
}

// Phase 2C: short_name and phone_example arrive in a later migration as UPDATEs of the seeded rows. They
// are read from THAT file, so the harnesses' rows are the database's rows after every migration.
function phoneCopyFromMigration() {
  const sql = read('supabase/migrations/20261010_11_country_settings_phone_copy.sql')
  const out = {}
  for (const m of sql.matchAll(/set (short_name|phone_example)\s*=\s*'([^']*)'\s*where country_code = '([A-Z]{2})'/g)) {
    (out[m[3]] ??= {})[m[1] === 'short_name' ? 'shortName' : 'phoneExample'] = m[2]
  }
  return out
}
// …and phone_check is added by 20261010_12 as NOT NULL with a default every existing row takes.
function phoneCheckDefault() {
  const m = read('supabase/migrations/20261010_12_country_settings_phone_check.sql').match(/add column if not exists phone_check text not null default '([a-z]+)'/)
  if (!m) throw new Error('20261010_12 no longer has the shape this parser reads')
  return m[1]
}
// Phase 3: 20261010_17 adds seven columns, each NULL or with a default that every existing row takes. Read
// from THAT file, so the harnesses' rows are the database's rows after every migration.
function chargeDefaultsFromMigration() {
  const sql = read('supabase/migrations/20261010_17_order_charges.sql')
  const out = {}
  for (const m of sql.matchAll(/alter table public\.country_settings add column if not exists (\w+)\s+(\w+)(?:\s+not null default ([^;]+?))?\s*;/g)) {
    const key = m[1].replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    out[key] = m[3] === undefined ? null : sqlValue(m[3].trim())
  }
  if (Object.keys(out).length !== 7) throw new Error(`20261010_17 no longer has the shape this parser reads (${Object.keys(out).length} columns)`)
  return out
}
const withPhoneCopy = (row) => ({ ...row, shortName: null, phoneExample: null, ...(phoneCopyFromMigration()[row.countryCode] || {}), phoneCheck: phoneCheckDefault(), ...chargeDefaultsFromMigration() })
const gbFromSeed = () => withPhoneCopy(rowFromSeed('supabase/migrations/20261010_03_country_settings_seed_gb.sql'))
const usFromSeed = () => withPhoneCopy(rowFromSeed('supabase/migrations/20261010_04_country_settings_seed_us.sql'))
module.exports = { gbFromSeed, usFromSeed, phoneCopyFromMigration, phoneCheckDefault, chargeDefaultsFromMigration }
