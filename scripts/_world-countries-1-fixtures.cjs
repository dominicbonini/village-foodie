// scripts/_world-countries-1-fixtures.cjs — world-countries-1 (31 October 2026, docs/world-countries-1-report.md). A MODULE.
//
// 🔴 THE EIGHT ROWS AND THEIR PRICES ARE READ FROM THE NOT RUN SQL ITSELF (supabase/migrations/20261055_world_countries_1_rows.sql,
// block B): every insert's columns and values are parsed, `offered` and `is_trial_end` included — so every check that renders a
// country proves the SQL Dominic will run. They are SWITCHED ON here only. Around them: the live countries as the database holds
// them today (GB US IE AU NZ CA, France and the 29 European rows — all switched on).
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
const fs = require('fs')
const path = require('path')
const LP1E = require('./_lp1e-fixtures.cjs')
const NP = require('./_native-prices-fixtures.cjs')
const EF = require('./_europe-settings-fixtures.cjs')

const REPO = path.resolve(__dirname, '..')
const SQL_A = 'supabase/migrations/20261054_world_countries_1_schema.sql'
const SQL_B = 'supabase/migrations/20261055_world_countries_1_rows.sql'
const snake = LP1E.snake
const WORLD = ['BR', 'MX', 'JP', 'SG', 'HK', 'MY', 'TH', 'AE']

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
function literal(v) {
  v = v.replace(/::[a-z]+(\[\])?$/, '').trim()
  if (v === 'null') return null
  if (v === 'true') return true
  if (v === 'false') return false
  if (/^'.*'$/s.test(v)) { const s = v.slice(1, -1).replace(/''/g, "'"); return s === '{}' ? [] : s }
  if (/^array\[/i.test(v)) return splitTop(v.slice(6, -1)).map(literal)
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
  throw new Error(`[world-countries-1 fixtures] cannot read the SQL value ${v}`)
}
const stripComments = s => s.replace(/--[^\n]*/g, '')
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
function insertOf(sql, table, endMarker) {
  const at = sql.indexOf(`insert into public.${table}`)
  const body = stripComments(sql.slice(at, sql.indexOf(endMarker, at + 10)))
  const cols = splitTop(body.slice(body.indexOf('(') + 1, body.indexOf(') values')))
  return tuples(body.slice(body.indexOf(') values') + ') values'.length)).map(t => {
    const vals = splitTop(t)
    if (vals.length !== cols.length) throw new Error(`[world-countries-1 fixtures] ${cols.length} columns but ${vals.length} values: ${t.slice(0, 60)}`)
    return Object.fromEntries(cols.map((c, i) => [c, literal(vals[i])]))
  })
}
/** Block B's country_settings rows and plan_prices rows (snake_case, as the tables). */
function sqlRows() {
  const sql = fs.readFileSync(path.join(REPO, SQL_B), 'utf8')
  return { rows: insertOf(sql, 'country_settings', 'insert into public.plan_prices'), prices: insertOf(sql, 'plan_prices', 'commit;'), sql }
}

/** A row in the loader's camelCase, with `enabled` as asked. */
function camelRow(row, enabled) {
  const camel = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v]))
  return { ...camel, enabled, updatedAt: '2026-10-31T00:00:00Z' }
}

/** The live countries (GB US IE AU NZ CA, France, the 29 European rows — all on), plus the eight: those named ON, the rest off. */
const EUROPE = () => EF.sqlRows().rows.map(r => r.country_code)
const rowsWith = (on = []) => [...EF.rowsWith(EUROPE()), NP.FR(), ...sqlRows().rows.map(r => camelRow(r, on.includes(r.country_code)))]

/** The catalogue: the live prices (europe-settings' and France's) plus block B's, with `offered` and `trialEnd` from the SQL. */
function CATALOG() {
  const cat = EF.CATALOG()
  for (const p of NP.CATALOG().prices.filter(p => p.countryCode === 'FR')) cat.prices.push(p)
  for (const p of cat.prices) { if (p.offered === undefined) p.offered = true; if (p.trialEnd === undefined) p.trialEnd = false }
  for (const p of sqlRows().prices) {
    cat.prices.push({ planKey: p.plan_key, countryCode: p.country_code, monthlyMinor: p.monthly_minor, includedOnlineMinor: p.included_online_minor,
      feeBps: p.fee_bps, extraVanMonthlyMinor: p.extra_van_monthly_minor, offered: p.offered, trialEnd: p.is_trial_end })
  }
  return cat
}
const tablesOf = c => ({ plans: c.plans.map(snake), plan_prices: c.prices.map(p => ({ ...snake(p), is_trial_end: p.trialEnd })), plan_features: c.features.map(snake) })

const ROUTE = { landing: 'app/[country]/page', features: 'app/[country]/features/page', compare: 'app/[country]/compare/page' }
/** Pages, PDF, sitemap and /llms.txt over one LP1E context (europe-settings' renderer, with this catalogue). */
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

module.exports = { WORLD, SQL_A, SQL_B, sqlRows, camelRow, rowsWith, CATALOG, renderer, splitTop }
