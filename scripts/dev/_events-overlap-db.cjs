// scripts/dev/_events-overlap-db.cjs — shared by the events-overlap-2 dev scripts (a MODULE, never run on its own).
// The connection is the one scripts/db-migrate.cjs uses: SUPABASE_DB_URL, read from .env.local by this module alone (that
// one line only — no other key is read), never printed, scrubbed from any error. The pg driver comes from npx's cache:
//   npx -y -p pg@8.13.1 node scripts/dev/<script>.cjs …
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS dev script */
'use strict'
const fs = require('fs')
const path = require('path')
const REPO = path.resolve(__dirname, '..', '..')
/** The local record of every row the test-data script made. Git-ignored (scripts/dev/*.local.json). */
const RECORD = path.join(__dirname, 'events-overlap-testdata.local.json')
const TRUCK = 'test-truck'   // 🔴 THE ONLY TRUCK THESE SCRIPTS MAY TOUCH

function die(msg, code = 2) { console.error(`events-overlap: ${msg}`); process.exit(code) }
function dbUrl() {
  let text
  try { text = fs.readFileSync(path.join(REPO, '.env.local'), 'utf8') } catch { die('.env.local could not be read') }
  const m = /^SUPABASE_DB_URL=(.*)$/m.exec(text)
  if (!m) die('SUPABASE_DB_URL is not in .env.local')
  const v = m[1].trim().replace(/^(['"])(.*)\1$/, '$2')
  if (!/^postgres(ql)?:\/\//.test(v)) die('SUPABASE_DB_URL is not a postgres:// URL')
  return v
}
function scrub(msg, url) {
  let s = String(msg ?? '')
  try { const u = new URL(url); for (const x of [url, decodeURIComponent(u.password || ''), u.password, u.username && u.host ? `${u.username}@${u.host}` : '']) if (x) s = s.split(x).join('[redacted]') } catch { s = s.split(url).join('[redacted]') }
  return s
}
function loadPg() {
  for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
    if (/[\\/]_npx[\\/][^\\/]+[\\/]node_modules[\\/]\.bin$/.test(dir)) { const p = path.join(dir, '..', 'pg'); if (fs.existsSync(p)) return require(p) }
  }
  try { return require('pg') } catch { die('the pg driver is not available — run through: npx -y -p pg@8.13.1 node scripts/dev/<script>.cjs …') }
}
/** Run `fn(client)` on one connection; errors are scrubbed of the connection string. */
async function withDb(fn, appName) {
  const url = dbUrl()
  const { Client } = loadPg()
  let u = url; try { const x = new URL(url); x.searchParams.delete('sslmode'); u = x.toString() } catch { /* keep */ }
  const client = new Client({ connectionString: u, ssl: { rejectUnauthorized: false }, statement_timeout: 60000, application_name: appName })
  try { await client.connect(); return await fn(client) }
  catch (e) { die(scrub(e && e.message, url), 1) }
  finally { try { await client.end() } catch { /* closed */ } }
}
/** Print a statement exactly as sent, with its parameters, so the report can quote it. */
function show(sql, params) {
  console.log(`\n-- SQL\n${sql.trim()}${params && params.length ? `\n-- params: ${JSON.stringify(params)}` : ''}`)
}
function readRecord() { try { return JSON.parse(fs.readFileSync(RECORD, 'utf8')) } catch { return null } }
function writeRecord(r) { fs.writeFileSync(RECORD, JSON.stringify(r, null, 2) + '\n') }
module.exports = { REPO, RECORD, TRUCK, die, withDb, show, readRecord, writeRecord }
