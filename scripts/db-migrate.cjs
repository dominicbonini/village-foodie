#!/usr/bin/env node
// scripts/db-migrate.cjs — 🔴 RUNS ONE COMMITTED MIGRATION FILE AGAINST THE LIVE DATABASE (db-run-1, 2 November 2026, Dominic's
// decision Q1 → C). It WRITES TO PRODUCTION, so it is in harnesses.json's `operational_refused` group: no sweep ever runs it.
//
//   npx -y -p pg@8.13.1 node scripts/db-migrate.cjs --probe
//        read-only proof of the path: `select current_user, now()` inside a READ ONLY transaction, then rolled back
//   npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/<file>.sql
//        run that file as ONE transaction that stops on the first error (and rolls back), then verify read-only (the MCP)
//
// The `pg` driver comes from npx's cache (-p pg@8.13.1) and is NEVER added to the project's package.json or node_modules.
// The connection string is SUPABASE_DB_URL, read from .env.local (git-ignored) by this script alone: it is never printed, never
// written anywhere, and scrubbed from any error message. No other key of .env.local is read.
//
// 🔴 THE RULES IT ENFORCES (.cursor/rules/working-rules.mdc, "Running migrations"):
//   • only a file under supabase/migrations/, tracked by git and identical to HEAD (committed exactly);
//   • a file that UPDATEs, DELETEs FROM or TRUNCATEs trucks, orders, plans, plan_prices, plan_features or country_settings, or
//     names pizzeria-gusto, is REFUSED unless --approved-by-dominic is given — ask him first;
//   • never `supabase db push`; never ad-hoc write SQL (there is no "run this string" mode, only --probe and a file).
// ONE TRANSACTION: the whole file is sent as one simple query. Postgres runs a multi-statement simple query as a single
// transaction (or inside the file's own begin; … commit;), stops at the first error and runs nothing after it; the runner then
// sends ROLLBACK and exits non-zero. TLS: encrypted without certificate verification — what psql's sslmode=require does.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS operational script, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')

const PROTECTED = /\b(update|delete\s+from|truncate(\s+table)?)\s+(only\s+)?(public\.)?"?(trucks|orders|plans|plan_prices|plan_features|country_settings)"?\b/i
const GUSTO = /pizzeria-gusto/i

function die(msg, code = 2) { console.error(`db-migrate: ${msg}`); process.exit(code) }

/** SUPABASE_DB_URL from .env.local — that one line only. Never printed. */
function dbUrl() {
  let text
  try { text = fs.readFileSync(path.join(REPO, '.env.local'), 'utf8') } catch { die('.env.local could not be read') }
  const m = /^SUPABASE_DB_URL=(.*)$/m.exec(text)
  if (!m) die('SUPABASE_DB_URL is not in .env.local')
  const v = m[1].trim().replace(/^(['"])(.*)\1$/, '$2')
  if (!/^postgres(ql)?:\/\//.test(v)) die('SUPABASE_DB_URL is not a postgres:// URL')
  return v
}

/** Any message with the connection string, its password and its user@host part removed. */
function scrub(msg, url) {
  let s = String(msg ?? '')
  try {
    const u = new URL(url)
    for (const secret of [url, decodeURIComponent(u.password || ''), u.password, u.username && u.host ? `${u.username}@${u.host}` : '']) if (secret) s = s.split(secret).join('[redacted]')
  } catch { s = s.split(url).join('[redacted]') }
  return s
}

/** The pg driver from npx's cache (`npx -p pg@…` puts its node_modules/.bin on PATH), else a resolvable one. */
function loadPg() {
  for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
    if (/[\\/]_npx[\\/][^\\/]+[\\/]node_modules[\\/]\.bin$/.test(dir)) {
      const p = path.join(dir, '..', 'pg')
      if (fs.existsSync(p)) return require(p)
    }
  }
  try { return require('pg') } catch { die('the pg driver is not available — run through: npx -y -p pg@8.13.1 node scripts/db-migrate.cjs …') }
}

/** The connection string without sslmode (TLS is set below, as psql's sslmode=require: encrypted, not verified). */
function withoutSslmode(url) {
  try { const u = new URL(url); u.searchParams.delete('sslmode'); return u.toString() } catch { return url }
}

async function main() {
  const args = process.argv.slice(2)
  const probe = args.includes('--probe')
  const approved = args.includes('--approved-by-dominic')
  const files = args.filter(a => !a.startsWith('--'))
  if (probe === (files.length === 1) || files.length > 1) die('usage: --probe | <one supabase/migrations/*.sql file> [--approved-by-dominic]')

  let sql = null, rel = null
  if (!probe) {
    rel = path.relative(REPO, path.resolve(REPO, files[0])).split(path.sep).join('/')
    if (!/^supabase\/migrations\/[^/]+\.sql$/.test(rel)) die(`${rel} is not a file under supabase/migrations/`)
    if (!fs.existsSync(path.join(REPO, rel))) die(`${rel} does not exist`)
    try { execFileSync('git', ['ls-files', '--error-unmatch', rel], { cwd: REPO, stdio: 'ignore' }) } catch { die(`${rel} is not committed`) }
    try { execFileSync('git', ['diff', '--quiet', 'HEAD', '--', rel], { cwd: REPO, stdio: 'ignore' }) } catch { die(`${rel} differs from HEAD — commit it first`) }
    sql = fs.readFileSync(path.join(REPO, rel), 'utf8')
    const code = sql.replace(/--[^\n]*/g, '')
    const hits = [PROTECTED.test(code) && 'updates/deletes a protected table', GUSTO.test(sql) && 'names pizzeria-gusto'].filter(Boolean)
    if (hits.length && !approved) die(`${rel} ${hits.join(' and ')} — STOP and ask Dominic first (then pass --approved-by-dominic)`)
    console.log(`db-migrate: ${rel} · sha256 ${crypto.createHash('sha256').update(sql).digest('hex').slice(0, 16)} · committed at ${execFileSync('git', ['log', '-1', '--format=%h', '--', rel], { cwd: REPO, encoding: 'utf8' }).trim()}`)
  }

  const url = dbUrl()
  const { Client } = loadPg()
  const client = new Client({ connectionString: withoutSslmode(url), ssl: { rejectUnauthorized: false }, statement_timeout: 120000, application_name: 'db-migrate (Claude Code)' })
  client.on('notice', n => console.log(`  notice: ${scrub(n.message, url)}`))
  try {
    await client.connect()
    if (probe) {
      await client.query('begin read only')
      const r = await client.query('select current_user, now(), current_setting(\'transaction_read_only\') as read_only, current_setting(\'server_version\') as server_version')
      await client.query('rollback')
      const row = r.rows[0]
      console.log(`db-migrate --probe: current_user=${row.current_user} · now()=${new Date(row.now).toISOString()} · transaction_read_only=${row.read_only} · server ${row.server_version}`)
    } else {
      await client.query(sql)
      console.log(`db-migrate: ${rel} applied — one transaction, no error`)
    }
  } catch (e) {
    try { await client.query('rollback') } catch { /* no transaction left, or the connection failed */ }
    console.error(`db-migrate: FAILED — nothing after the error ran, and the transaction was rolled back: ${scrub(e && e.message, url)}`)
    process.exitCode = 1
  } finally {
    try { await client.end() } catch { /* already closed */ }
  }
}

main().catch(e => { console.error(`db-migrate: ${e && e.message ? e.message.replace(/postgres(ql)?:\/\/\S+/g, '[redacted]') : e}`); process.exit(1) })
