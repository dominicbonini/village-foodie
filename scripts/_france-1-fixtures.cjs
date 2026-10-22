// scripts/_france-1-fixtures.cjs — the France fixtures for france-1 (22 October 2026, docs/france-1-report.md). A MODULE,
// the same shape as scripts/_canada-1-fixtures.cjs.
//
// 🔴 THE FR ROW IS READ FROM THE NOT RUN SQL ITSELF (supabase/migrations/20261034_france_row.sql), not typed again here: the
// insert's columns and values are parsed, so every check that renders "France" proves the SQL Dominic will run. Switched ON
// here only (`enabled` overridden) — the SQL inserts it OFF.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
const fs = require('fs')
const path = require('path')
const LP1E = require('./_lp1e-fixtures.cjs')
const NP = require('./_native-prices-fixtures.cjs')

const REPO = path.resolve(__dirname, '..')
const SQL_FILE = 'supabase/migrations/20261034_france_row.sql'
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
/** One SQL literal → its JS value: 'text', numbers, true / false / null, array['a', 'b'], array[10, 15]::numeric[], '{}'::text[]. */
function literal(v) {
  v = v.replace(/::[a-z]+(\[\])?$/, '').trim()
  if (v === 'null') return null
  if (v === 'true') return true
  if (v === 'false') return false
  if (/^'.*'$/s.test(v)) { const s = v.slice(1, -1).replace(/''/g, "'"); return s === '{}' ? [] : s }
  if (/^array\[/i.test(v)) return splitTop(v.slice(6, -1)).map(literal)
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
  throw new Error(`[france-1 fixtures] cannot read the SQL value ${v}`)
}
const stripComments = s => s.replace(/--[^\n]*/g, '')

/** The country_settings row and the plan_prices rows exactly as the NOT RUN SQL inserts them (snake_case, as the table). */
function sqlRows() {
  const sql = fs.readFileSync(path.join(REPO, SQL_FILE), 'utf8')
  const ins = stripComments(sql.slice(sql.indexOf('insert into public.country_settings'), sql.indexOf('insert into public.plan_prices')))
  const cols = splitTop(ins.slice(ins.indexOf('(') + 1, ins.indexOf(') values')))
  const vals = splitTop(ins.slice(ins.indexOf(') values (') + ') values ('.length, ins.lastIndexOf(')')))
  if (cols.length !== vals.length) throw new Error(`[france-1 fixtures] ${cols.length} columns but ${vals.length} values`)
  const row = Object.fromEntries(cols.map((c, i) => [c, literal(vals[i])]))
  const pp = stripComments(sql.slice(sql.indexOf('insert into public.plan_prices')))
  const ppCols = splitTop(pp.slice(pp.indexOf('(') + 1, pp.indexOf(') values')))
  const tuples = [...pp.slice(pp.indexOf(' values') + 7).matchAll(/\(([^()]*)\)/g)].map(m => splitTop(m[1]).map(literal))
  const prices = tuples.map(t => Object.fromEntries(ppCols.map((c, i) => [c, t[i]])))
  return { row, prices, sql }
}

/** The FR row in the loader's camelCase (what LP1E's rows look like), with `enabled` as asked. */
function FR(enabled = true) {
  const { row } = sqlRows()
  const camel = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v]))
  return { ...camel, enabled, updatedAt: '2026-10-22T00:00:00Z' }
}

/** The catalogue with France's prices from the SQL, alongside the live countries' (scripts/_native-prices-fixtures.cjs). */
function CATALOG() {
  const cat = NP.CATALOG()
  cat.prices = cat.prices.filter(p => p.countryCode !== 'FR')   // native-prices' FR prices give way to the SQL's
  const template = cat.prices.find(p => p.countryCode === 'GB' && p.planKey === 'pro')
  for (const p of sqlRows().prices) {
    const base = cat.prices.find(x => x.countryCode === 'GB' && x.planKey === p.plan_key) ?? template
    cat.prices.push({ ...base, countryCode: 'FR', planKey: p.plan_key, monthlyMinor: p.monthly_minor, includedOnlineMinor: p.included_online_minor,
      feeBps: p.fee_bps, extraVanMonthlyMinor: p.extra_van_monthly_minor })
  }
  return cat
}
const tablesOf = c => ({ plans: c.plans.map(snake), plan_prices: c.prices.map(snake), plan_features: c.features.map(snake) })

/** The live countries as they are (GB, US, IE, AU, NZ and Canada on — 22 October 2026), with or without France. */
// Canada is the row its own NOT RUN SQL inserts (scripts/_canada-1-fixtures.cjs), switched on as it is live.
const LIVE = () => [LP1E.GB(), LP1E.US_ON(), NP.IE(), NP.AU(), NP.NZ(), require('./_canada-1-fixtures.cjs').CA(true)]
const ROWS = { frOn: () => [...LIVE(), FR(true)], frOff: () => [...LIVE(), FR(false)], noFr: () => LIVE() }
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
  const lib = () => (libP ||= ctx.bundle(`${tag}-lib`, [
    "export { buildPlansPdfHtml } from '@/lib/plans-pdf'",
    "export { llmsText } from '@/lib/llms-text'",
    "export { mapCountryRow } from '@/lib/country-settings'",
  ].join('\n')))
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

module.exports = { sqlRows, FR, CATALOG, ROWS, LIVE, renderer, SQL_FILE }
