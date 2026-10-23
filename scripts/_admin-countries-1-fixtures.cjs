// scripts/_admin-countries-1-fixtures.cjs — the Admin › Countries rows as they are live on 23 October 2026, for
// admin-countries-1 (docs/admin-countries-1-report.md). A MODULE.
//
// 🔴 EVERY ROW IS READ FROM SQL OR AN EXISTING FIXTURE, never typed again here:
//   · the six live English-speaking-and-Canada rows (scripts/_europe-settings-fixtures.cjs LIVE), Ireland replaced by its
//     LIVE row (scripts/fixtures/ie-row-2026-10-23.json, read-only) — the row the page's Ireland save is tested on;
//   · the 29 European rows from 20261036 (all switched on, as live), with 20261037's short names applied (it has run) and
//     20261038's NOT applied (it has not) — parsed from the two migrations;
//   · France from 20261040 (NOT RUN), switched OFF as it inserts it.
// That is 36 rows: the live 35 plus France.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
const fs = require('fs')
const path = require('path')
const EF = require('./_europe-settings-fixtures.cjs')
const FR1 = require('./_france-1-fixtures.cjs')

const REPO = path.resolve(__dirname, '..')

/** `update … set short_name = 'X' where country_code = 'YY'` lines of a migration → { YY: 'X' }. */
function shortNamesOf(file) {
  const sql = fs.readFileSync(path.join(REPO, file), 'utf8')
  return Object.fromEntries([...sql.matchAll(/set short_name = '((?:[^']|'')*)'\s+where country_code = '([A-Z]{2})'/g)].map(m => [m[2], m[1].replace(/''/g, "'")]))
}
const RAN_37 = () => shortNamesOf('supabase/migrations/20261037_europe_language_short_names.sql')
const NOT_RUN_38 = () => shortNamesOf('supabase/migrations/20261038_europe_language_short_names_2.sql')

/** Ireland's live row (read-only, 23 Oct), as the loader returns it: camelCase, numerics as numbers. */
function IE_LIVE() {
  const snake = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/ie-row-2026-10-23.json'), 'utf8')).row
  const camel = Object.fromEntries(Object.entries(snake).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), /_pct$/.test(k) && typeof v === 'string' ? Number(v) : v]))
  for (const k of ['starterMonthlyMinor', 'proMonthlyMinor', 'maxMonthlyMinor', 'proAllowanceMinor', 'maxAllowanceMinor', 'platformFeePct', 'competitorName', 'competitorPct', 'competitorFixedMinor', 'distanceUnit']) delete camel[k]
  return camel
}

/** The live rows (as the loader returns them), plus France off. `with38` applies 20261038 too (after Dominic runs it). */
function liveRows({ with38 = false, franceOn = false } = {}) {
  const europe = EF.sqlRows().rows.map(r => r.country_code)
  const names = { ...RAN_37(), ...(with38 ? NOT_RUN_38() : {}) }
  const rows = EF.rowsWith(europe).map(r => (r.countryCode === 'IE' ? IE_LIVE() : names[r.countryCode] ? { ...r, shortName: names[r.countryCode] } : r))
  return [...rows, FR1.FR(franceOn)]
}

module.exports = { liveRows, IE_LIVE, RAN_37, NOT_RUN_38, shortNamesOf }
