#!/usr/bin/env node
// scripts/_perf-1-standin.cjs — perf-1 (5 November 2026, docs/perf-1-report.md): A STAND-IN FOR THE DATABASE'S REST API, so a local
// production build (`next build && next start`) renders the marketing pages from fixtures. NOT a harness (it serves); run by hand:
//   node scripts/_perf-1-standin.cjs --port 54399 [--log <file>] [--tables <file.json>]
// Point the app at it through the PROCESS environment (never a .env file): NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL =
// http://127.0.0.1:<port>, and any key. It answers PostgREST reads (/rest/v1/<table>?select=…&col=eq.v&…&order=…&limit=…, the
// object Accept header for .single()/.maybeSingle()) over the tables of scripts/_perf-1-tables.cjs, and every auth call with "no
// session". 🔴 IT NEVER TALKS TO THE REAL DATABASE and it refuses every write (POST/PATCH/DELETE on /rest) with 405 — the app's
// writes are not part of these pages. Two control routes simulate a change made in the database:
//   POST /__standin/set   {"table","match":{col:value},"set":{col:value}}  — change rows, as a migration or the dashboard would
//   POST /__standin/fail  {"table","on":true|false}  — make every read of that table fail (500), as an outage would
//   GET  /__standin/log   every query since the start (or the last POST /__standin/log/reset), one line each
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS script, like every scripts/*.cjs */
'use strict'
const http = require('http')
const fs = require('fs')
const path = require('path')

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d }
const PORT = Number(arg('port', '54399'))
const LOG_FILE = arg('log', null)

/** One PostgREST filter value → a predicate. Supports what these pages send: eq, neq, gt, gte, lt, lte, is, in, like, ilike, not.<op>. */
function predicate(col, expr) {
  let neg = false
  if (expr.startsWith('not.')) { neg = true; expr = expr.slice(4) }
  const dot = expr.indexOf('.')
  const op = expr.slice(0, dot), raw = expr.slice(dot + 1)
  const val = v => (v === 'null' ? null : v === 'true' ? true : v === 'false' ? false : v)
  const cmp = (a, b) => (a == null || b == null ? NaN : (typeof a === 'number' ? a - Number(b) : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0))
  const list = () => raw.replace(/^\(|\)$/g, '').split(',').map(s => s.replace(/^"|"$/g, ''))
  const f = {
    eq: r => String(r[col]) === String(val(raw)), neq: r => String(r[col]) !== String(val(raw)),
    gt: r => cmp(r[col], raw) > 0, gte: r => cmp(r[col], raw) >= 0, lt: r => cmp(r[col], raw) < 0, lte: r => cmp(r[col], raw) <= 0,
    is: r => (val(raw) === null ? r[col] == null : r[col] === val(raw)),
    in: r => list().includes(String(r[col])),
    like: r => new RegExp('^' + raw.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*') + '$').test(String(r[col] ?? '')),
    ilike: r => new RegExp('^' + raw.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*') + '$', 'i').test(String(r[col] ?? '')),
  }[op]
  if (!f) throw new Error(`unsupported filter ${col}=${expr}`)
  return neg ? r => !f(r) : f
}
/** or=(a.eq.1,b.is.null) */
function orPredicate(expr) {
  const parts = expr.replace(/^\(|\)$/g, '').split(',')
  const preds = parts.map(p => { const d = p.indexOf('.'); return predicate(p.slice(0, d), p.slice(d + 1)) })
  return r => preds.some(fn => fn(r))
}
/** select=a,b,c → only those columns (a `*` or an embedded resource keeps the row whole; embeds are logged). */
function project(rows, select) {
  if (!select || select === '*' || /[(*]/.test(select)) return rows
  const cols = select.split(',').map(c => c.trim().split(':').pop()).filter(Boolean)
  return rows.map(r => Object.fromEntries(cols.filter(c => c in r).map(c => [c, r[c]])))
}

async function main() {
  let TABLES
  const tFile = arg('tables', null)
  if (tFile) TABLES = JSON.parse(fs.readFileSync(tFile, 'utf8'))
  else {
    const kit = require('./_render-kit.cjs')({ cacheTag: 'perf-1-standin' })
    TABLES = await require('./_perf-1-tables.cjs').tables(kit)
  }
  const log = []
  const failing = new Set()
  const note = line => { log.push(line); if (LOG_FILE) fs.appendFileSync(LOG_FILE, line + '\n') }
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x')
    const send = (status, body, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json', ...headers }); res.end(typeof body === 'string' ? body : JSON.stringify(body)) }
    let body = ''
    req.on('data', c => { body += c })
    req.on('end', () => {
      try {
        if (u.pathname === '/__standin/set' && req.method === 'POST') {
          const { table, match = {}, set = {} } = JSON.parse(body)
          let n = 0
          for (const r of TABLES[table] || []) if (Object.entries(match).every(([k, v]) => String(r[k]) === String(v))) { Object.assign(r, set); n++ }
          note(`SET ${table} ${JSON.stringify(match)} ${JSON.stringify(set)} → ${n}`)
          return send(200, { changed: n })
        }
        if (u.pathname === '/__standin/fail' && req.method === 'POST') {
          const { table, on } = JSON.parse(body)
          if (on) failing.add(table); else failing.delete(table)
          note(`FAIL ${table} ${on ? 'on' : 'off'}`)
          return send(200, { failing: [...failing] })
        }
        if (u.pathname === '/__standin/log') return send(200, log)
        if (u.pathname === '/__standin/log/reset') { log.length = 0; return send(200, { ok: true }) }
        if (u.pathname.startsWith('/auth/v1/')) return send(401, { message: 'no session (stand-in)' })
        const m = /^\/rest\/v1\/([a-z0-9_]+)$/.exec(u.pathname)
        if (!m) { note(`UNKNOWN ${req.method} ${u.pathname}`); return send(404, { message: 'stand-in: unknown path' }) }
        if (req.method !== 'GET' && req.method !== 'HEAD') { note(`REFUSED-WRITE ${req.method} ${m[1]}`); return send(405, { message: 'stand-in: read-only' }) }
        const table = m[1]
        if (failing.has(table)) { note(`FAILED ${table}`); return send(500, { code: 'XX000', message: `stand-in: ${table} is failing`, details: null, hint: null }) }
        let rows = TABLES[table]
        if (!rows) { note(`MISSING-TABLE ${table} ${u.search}`); rows = [] }
        const preds = []
        let order = null, limit = null, offset = 0
        for (const [k, v] of u.searchParams) {
          if (k === 'select') continue
          if (k === 'order') { order = v.split(',').map(s => { const [c, dir, nulls] = s.split('.'); return { c, desc: dir === 'desc', nullsFirst: nulls === 'nullsfirst' } }); continue }
          if (k === 'limit') { limit = Number(v); continue }
          if (k === 'offset') { offset = Number(v); continue }
          if (k === 'or') { preds.push(orPredicate(v)); continue }
          preds.push(predicate(k, v))
        }
        let out = rows.filter(r => preds.every(p => p(r)))
        if (order) out = out.slice().sort((a, b) => { for (const o of order) { const x = a[o.c], y = b[o.c]; if (x === y) continue; if (x == null) return o.nullsFirst ? -1 : 1; if (y == null) return o.nullsFirst ? 1 : -1; const c = x < y ? -1 : 1; return o.desc ? -c : c } return 0 })
        const range = /^(\d+)-(\d+)$/.exec(req.headers.range || '')
        if (range) { offset = Number(range[1]); limit = Number(range[2]) - offset + 1 }
        out = out.slice(offset, limit != null ? offset + limit : undefined)
        out = project(out, u.searchParams.get('select'))
        note(`GET ${table}${u.search}`)
        if (/vnd\.pgrst\.object/.test(req.headers.accept || '')) {
          if (out.length !== 1) return send(406, { code: 'PGRST116', message: `JSON object requested, multiple (or no) rows returned`, details: `${out.length} rows`, hint: null })
          return send(200, out[0])
        }
        return send(200, out, { 'content-range': `${offset}-${offset + Math.max(out.length - 1, 0)}/*` })
      } catch (e) { note(`ERROR ${req.method} ${req.url} ${e.message}`); send(400, { message: e.message }) }
    })
  })
  server.listen(PORT, '127.0.0.1', () => console.log(`stand-in on http://127.0.0.1:${PORT} — ${Object.keys(TABLES).length} tables`))
}
main().catch(e => { console.error(e); process.exit(1) })
