// scripts/_europe-settings-fixtures.cjs — the europe-settings fixtures (22 October 2026, docs/europe-settings-report.md). A MODULE.
//
// 🔴 THE ROWS ARE READ FROM THE NOT RUN SQL ITSELF (supabase/migrations/20261036_europe_rows.sql): every insert's columns and
// values are parsed, so every check that renders a country proves the SQL Dominic will run. Switched ON here only.
// 🔴 THE LIVE CHECKS: scripts/fixtures/country-settings-checks-2026-10-22.json holds every CHECK on country_settings and
// plan_prices as the database defines them (read-only query, 22 October 2026), with the address-format CHECK replaced by the
// one block A (20261035_europe_address_formats.sql) installs. `checkRow` evaluates each one the way Postgres does: a CHECK is
// a conjunction of comparisons; a comparison with NULL is unknown, which passes; only a FALSE fails. A CHECK it cannot read
// is an error, never a pass.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
const fs = require('fs')
const path = require('path')
const LP1E = require('./_lp1e-fixtures.cjs')
const NP = require('./_native-prices-fixtures.cjs')

const REPO = path.resolve(__dirname, '..')
const SQL_A = 'supabase/migrations/20261035_europe_address_formats.sql'
const SQL_B = 'supabase/migrations/20261036_europe_rows.sql'
const snake = LP1E.snake

/** Splits a SQL list on its top-level commas (not inside quotes, parentheses or brackets). */
function splitTop(s) {
  const out = []; let depth = 0, cur = '', q = false
  for (const ch of s) {
    if (ch === "'") q = !q
    if (!q && (ch === '(' || ch === '[')) depth++
    if (!q && (ch === ')' || ch === ']')) depth--
    if (ch === ',' && depth === 0 && !q) { out.push(cur.trim()); cur = '' } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}
/** One SQL literal → its JS value. */
function literal(v) {
  v = v.replace(/::[a-z]+(\[\])?$/, '').trim()
  if (v === 'null') return null
  if (v === 'true') return true
  if (v === 'false') return false
  if (/^'.*'$/s.test(v)) { const s = v.slice(1, -1).replace(/''/g, "'"); return s === '{}' ? [] : s }
  if (/^array\[/i.test(v)) return splitTop(v.slice(6, -1)).map(literal)
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
  throw new Error(`[europe-settings fixtures] cannot read the SQL value ${v}`)
}
const stripComments = s => s.replace(/--[^\n]*/g, '')
/** The top-level parenthesised tuples of a VALUES list. */
function tuples(s) {
  const out = []; let depth = 0, q = false, start = -1
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === "'") q = !q
    if (q) continue
    if (ch === '(') { if (depth === 0) start = i + 1; depth++ }
    else if (ch === ')') { depth--; if (depth === 0) out.push(s.slice(start, i)) }
  }
  return out
}

/** Every country_settings row and plan_prices row block B inserts (snake_case, as the tables). */
function sqlRows() {
  const sql = fs.readFileSync(path.join(REPO, SQL_B), 'utf8')
  const ins = stripComments(sql.slice(sql.indexOf('insert into public.country_settings'), sql.indexOf('insert into public.plan_prices')))
  const cols = splitTop(ins.slice(ins.indexOf('(') + 1, ins.indexOf(') values')))
  const rows = tuples(ins.slice(ins.indexOf(') values') + ') values'.length)).map(t => {
    const vals = splitTop(t)
    if (vals.length !== cols.length) throw new Error(`[europe-settings fixtures] ${cols.length} columns but ${vals.length} values: ${t.slice(0, 60)}`)
    return Object.fromEntries(cols.map((c, i) => [c, literal(vals[i])]))
  })
  const pp = stripComments(sql.slice(sql.indexOf('insert into public.plan_prices'), sql.indexOf('commit;', sql.indexOf('insert into public.plan_prices'))))
  const ppCols = splitTop(pp.slice(pp.indexOf('(') + 1, pp.indexOf(') values')))
  const prices = tuples(pp.slice(pp.indexOf(') values') + ') values'.length)).map(t => Object.fromEntries(ppCols.map((c, i) => [c, literal(splitTop(t)[i])])))
  return { rows, prices, sql }
}

/** The CHECK definitions block A leaves in force: the live ones, the address-format list replaced by block A's. */
function checks() {
  const live = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/country-settings-checks-2026-10-22.json'), 'utf8'))
  const a = fs.readFileSync(path.join(REPO, SQL_A), 'utf8')
  const list = /check \(address_format in \(([^)]*)\)\)/.exec(a)[1]
  live.country_settings.country_settings_address_format_chk = `CHECK ((address_format = ANY (ARRAY[${list.split(',').map(x => `${x.trim()}::text`).join(', ')}])))`
  return live
}

/** Does `row` satisfy the CHECK `def`? Null when a part cannot be read. Each atom: true / false / null (unknown, i.e. a NULL). */
function evalCheck(def, row) {
  const body = def.replace(/^CHECK \(/, '').replace(/\)$/, '')
  const atoms = []
  const num = x => (x === null || x === undefined ? null : Number(x))
  let rest = body
  const used = []
  // col = ANY (ARRAY['a'::text, …])
  for (const m of body.matchAll(/(\w+) = ANY \(ARRAY\[([^\]]*)\]\)/g)) {
    const v = row[m[1]]; const list = [...m[2].matchAll(/'([^']*)'::text/g)].map(x => x[1])
    atoms.push(v === null || v === undefined ? null : list.includes(v)); used.push(m[0])
  }
  // col = ANY (other_col)
  for (const m of body.matchAll(/(\w+) = ANY \((\w+)\)/g)) {
    const v = row[m[1]], arr = row[m[2]]
    atoms.push(v === null || arr === null ? null : Array.isArray(arr) && arr.includes(v)); used.push(m[0])
  }
  // col ~ 'regex'::text
  for (const m of body.matchAll(/(\w+) ~ '([^']*)'::text/g)) {
    const v = row[m[1]]; atoms.push(v === null || v === undefined ? null : new RegExp(m[2]).test(v)); used.push(m[0])
  }
  // col >= (n)::numeric | col >= n | col <= …
  for (const m of body.matchAll(/(\w+) (>=|<=) \(?(-?\d+)\)?(?:::numeric)?/g)) {
    if (m[1] === 'numeric') continue
    const v = num(row[m[1]]); atoms.push(v === null ? null : m[2] === '>=' ? v >= Number(m[3]) : v <= Number(m[3])); used.push(m[0])
  }
  // tip presets: array_position(col, NULL::numeric) IS NULL, (0)::numeric <= ALL (col), (100)::numeric >= ALL (col)
  for (const m of body.matchAll(/array_position\((\w+), NULL::numeric\) IS NULL/g)) { const a = row[m[1]]; atoms.push(a === null ? null : !a.includes(null)); used.push(m[0]) }
  for (const m of body.matchAll(/\((\d+)\)::numeric (<=|>=) ALL \((\w+)\)/g)) {
    const a = row[m[3]]; atoms.push(a === null ? null : a.every(x => (m[2] === '<=' ? Number(m[1]) <= x : Number(m[1]) >= x))); used.push(m[0])
  }
  for (const m of body.matchAll(/\((\w+) IS NULL\)/g)) used.push(m[0])   // an OR with IS NULL: the comparison beside it decides
  // Everything in the definition must have been read: what is left is only brackets, AND / OR and casts.
  for (const u of used) rest = rest.split(u).join(' ')
  if (rest.replace(/[()\s]|AND|OR/g, '').length) return { ok: null, unread: rest.replace(/\s+/g, ' ').trim() }
  return { ok: !atoms.includes(false), atoms: atoms.length }
}

/** Every CHECK of a table against a row: [{ name, ok, unread? }]. */
const checkRow = (table, row) => Object.entries(checks()[table]).map(([name, def]) => ({ name, ...evalCheck(def, row) }))

/** A row in the loader's camelCase, with `enabled` as asked. */
function camelRow(row, enabled = true) {
  const camel = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v]))
  return { ...camel, enabled, updatedAt: '2026-10-22T00:00:00Z' }
}
const byCode = () => Object.fromEntries(sqlRows().rows.map(r => [r.country_code, r]))

/** The catalogue with every new country's prices from the SQL, alongside the live countries'. */
function CATALOG() {
  const cat = NP.CATALOG()
  const { prices } = sqlRows()
  const codes = new Set(prices.map(p => p.country_code))
  cat.prices = cat.prices.filter(p => !codes.has(p.countryCode))
  for (const p of prices) {
    const base = cat.prices.find(x => x.countryCode === 'GB' && x.planKey === p.plan_key)
    cat.prices.push({ ...base, countryCode: p.country_code, planKey: p.plan_key, monthlyMinor: p.monthly_minor, includedOnlineMinor: p.included_online_minor,
      feeBps: p.fee_bps, extraVanMonthlyMinor: p.extra_van_monthly_minor })
  }
  return cat
}
const tablesOf = c => ({ plans: c.plans.map(snake), plan_prices: c.prices.map(snake), plan_features: c.features.map(snake) })

/** The live countries as they are (GB, US, IE, AU, NZ, CA on; France has no row yet). */
const LIVE = () => [LP1E.GB(), LP1E.US_ON(), NP.IE(), NP.AU(), NP.NZ(), require('./_canada-1-fixtures.cjs').CA(true)]
/** The live rows plus the new countries — those named switched on, every other one off. */
const rowsWith = (on = []) => [...LIVE(), ...sqlRows().rows.map(r => camelRow(r, on.includes(r.country_code)))]

const ROUTE = { landing: 'app/[country]/page', features: 'app/[country]/features/page', compare: 'app/[country]/compare/page' }
/** Pages, PDF, sitemap and /llms.txt over one LP1E context, for a given set of rows. */
function renderer(kit, tag) {
  const { h } = kit
  const ctx = LP1E.context(kit, REPO)
  const catalog = CATALOG()
  const tables = tablesOf(catalog)
  const mods = {}
  const modOf = p => (mods[p] ||= ctx.bundle(`${tag}-${p}`,
    `export * from '@/${ROUTE[p]}'\nexport { default } from '@/${ROUTE[p]}'\nexport { clearPlanCatalogCache as __clearPlans } from '@/lib/plans-server'\nexport { clearCountrySettingsCache as __clearCs } from '@/lib/country-settings'`))
  async function page(p, seg, rows) {
    const M = await modOf(p)
    return ctx.withReq({ rows, tables }, async () => {
      M.__clearPlans(); M.__clearCs?.()
      const args = { params: Promise.resolve({ country: seg }), searchParams: Promise.resolve({}) }
      let html = null, meta = null, redirectedTo = null
      try { meta = await M.generateMetadata(args, Promise.resolve({ openGraph: {} })) } catch (e) { if (e?.message === 'redirect') redirectedTo = e.redirectTo ?? 'redirect'; else throw e }
      if (!redirectedTo) { try { html = await ctx.prerender(h(M.default, args)) } catch (e) { if (e?.message === 'redirect') redirectedTo = e.redirectTo ?? 'redirect'; else throw e } }
      return { html, meta, redirectedTo }
    })
  }
  let libP
  const lib = () => (libP ||= ctx.bundle(`${tag}-lib`, "export { mapCountryRow } from '@/lib/country-settings'\nexport { buildPlansPdfHtml } from '@/lib/plans-pdf'\nexport { llmsText } from '@/lib/llms-text'"))
  const rowOf = async (rows, cc) => { const L = await lib(); return L.mapCountryRow(snake(rows.find(r => r.countryCode === cc))) }
  async function pdf(rows, cc) { const L = await lib(); return L.buildPlansPdfHtml(await rowOf(rows, cc), catalog) }
  async function llms(rows) { const L = await lib(); return L.llmsText(await Promise.all(rows.filter(r => r.enabled).map(r => rowOf(rows, r.countryCode))), catalog) }
  let smP
  async function sitemap(rows) {
    const SM = await (smP ||= ctx.bundle(`${tag}-sitemap`, "export { default } from '@/app/sitemap'\nexport { clearCountrySettingsCache as __c } from '@/lib/country-settings'\nexport { clearPlanCatalogCache as __p } from '@/lib/plans-server'"))
    return ctx.withReq({ rows, tables }, async () => { SM.__c?.(); SM.__p?.(); return SM.default() })
  }
  return { ctx, catalog, tables, page, pdf, llms, sitemap, rowOf, lib }
}

module.exports = { sqlRows, checks, evalCheck, checkRow, camelRow, byCode, CATALOG, LIVE, rowsWith, renderer, SQL_A, SQL_B }
