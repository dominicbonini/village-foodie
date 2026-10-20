// scripts/_plans-catalog-fixture.cjs — the plan catalogue (public.plans / public.plan_prices) AS THE MIGRATION SEEDS IT,
// for harnesses (plans-data-model, Stage A; docs/plans-data-model-report.md). A MODULE, not a harness.
// 🔴 PARSED FROM supabase/migrations/20261024_plans.sql ITSELF — the two seed INSERTs — so a harness proves the code on
// the very rows the database will hold, and a change to the seed reaches every harness. Same shape as lib/plans.ts
// `PlanCatalog` (camelCase, the mapPlanRow / mapPriceRow output). Returns null when the migration file is absent (an
// older tree), so a fixture module that offers it can stay optional.
const fs = require('fs')
const path = require('path')

const MIGRATION = 'supabase/migrations/20261024_plans.sql'
// ⚠️ STAGE A2 (plan-features-config, 20 October 2026): the second migration ALTERS the plans (included_vans, trial_months,
// pay_at_hatch_allowed, descriptions) and seeds plan_features. Applied on top when the file exists, the same way the
// database applies it — so a harness sees the catalogue the two files produce together.
const MIGRATION_A2 = 'supabase/migrations/20261025_plan_features.sql'
// ⚠️ STAGE B (pricing-pages, 20 October 2026): the third migration changes prices (plan_prices updates), switches a
// feature (a plan_features upsert), shortens the trial, and adds plans.is_highlighted / plans.subtitle. Applied on top
// in the same way, so the harnesses see what the three files produce together.
const MIGRATION_B = 'supabase/migrations/20261026_pricing_pages.sql'

function valuesBlock(sql, table) {
  const m = sql.match(new RegExp(`insert into public\\.${table} \\(([^)]*)\\) values\\s*([\\s\\S]*?)\\non conflict`))
  if (!m) throw new Error(`[plans fixture] no seed insert for public.${table} in ${MIGRATION}`)
  const cols = m[1].split(',').map(s => s.trim())
  const rows = [...m[2].matchAll(/\(([^()]*)\)/g)].map(r => {
    const vals = []
    const re = /'((?:[^']|'')*)'|(-?\d+)|\b(true|false|null)\b/g
    let x
    while ((x = re.exec(r[1]))) vals.push(x[1] !== undefined ? x[1].replace(/''/g, "'") : x[2] !== undefined ? Number(x[2]) : x[3] === 'null' ? null : x[3] === 'true')
    if (vals.length !== cols.length) throw new Error(`[plans fixture] ${table}: ${vals.length} values for ${cols.length} columns in (${r[1]})`)
    return Object.fromEntries(cols.map((c, i) => [c, vals[i]]))
  })
  return rows
}

/** The seeded catalogue, or null if this tree has no plans migration. */
function seedCatalog(repo = path.resolve(__dirname, '..')) {
  const f = path.join(repo, MIGRATION)
  if (!fs.existsSync(f)) return null
  const sql = fs.readFileSync(f, 'utf8')
  const plans = valuesBlock(sql, 'plans').map(r => ({
    key: r.key, name: r.name, description: r.description, sortOrder: r.sort_order,
    isPublic: r.is_public, isInternal: r.is_internal, isTrial: r.is_trial, isSignupDefault: r.is_signup_default,
    isExpiryFallback: r.is_expiry_fallback, isDemo: r.is_demo, payAtHatchAllowed: r.pay_at_hatch_allowed, active: r.active,
  })).sort((a, b) => a.sortOrder - b.sortOrder)
  const prices = valuesBlock(sql, 'plan_prices').map(r => ({
    planKey: r.plan_key, countryCode: r.country_code, monthlyMinor: r.monthly_minor,
    includedOnlineMinor: r.included_online_minor, feeBps: r.fee_bps, extraVanMonthlyMinor: r.extra_van_monthly_minor,
  }))
  let features = []
  const a2 = path.join(repo, MIGRATION_A2)
  if (fs.existsSync(a2)) {
    const sql2 = fs.readFileSync(a2, 'utf8')
    // the added columns' defaults (included_vans not null default 1; trial_months nullable)
    const dflt = /add column if not exists included_vans integer not null default (\d+)/.exec(sql2)
    for (const p of plans) { p.includedVans = dflt ? Number(dflt[1]) : 1; p.trialMonths = null }
    // every `update public.plans set <col> = <value> where key = '<key>'` (and the `and trial_months is null` guard)
    const COL = { trial_months: 'trialMonths', pay_at_hatch_allowed: 'payAtHatchAllowed', description: 'description', included_vans: 'includedVans' }
    for (const m of sql2.matchAll(/update public\.plans set (\w+) = ('(?:[^']|'')*'|-?\d+|true|false) where key = '([a-z0-9_]+)'/g)) {
      const p = plans.find(x => x.key === m[3]); const col = COL[m[1]]
      if (!p || !col) throw new Error(`[plans fixture] cannot apply: ${m[0]}`)
      const raw = m[2]
      p[col] = raw.startsWith("'") ? raw.slice(1, -1).replace(/''/g, "'") : raw === 'true' ? true : raw === 'false' ? false : Number(raw)
    }
    features = valuesBlock(sql2, 'plan_features').map(r => ({ planKey: r.plan_key, feature: r.feature, enabled: r.enabled }))
  } else {
    for (const p of plans) { p.includedVans = 1; p.trialMonths = null }
  }
  for (const p of plans) { p.isHighlighted = false; p.subtitle = null }
  const b = path.join(repo, MIGRATION_B)
  if (fs.existsSync(b)) {
    const sqlB = fs.readFileSync(b, 'utf8')
    // `update public.plan_prices set <col> = <n|null> where plan_key = '<k>' and country_code in ('GB', 'US')`
    const PCOL = { fee_bps: 'feeBps', included_online_minor: 'includedOnlineMinor', monthly_minor: 'monthlyMinor', extra_van_monthly_minor: 'extraVanMonthlyMinor' }
    for (const m of sqlB.matchAll(/update public\.plan_prices set (\w+) = (-?\d+|null) where plan_key = '([a-z0-9_]+)' and country_code in \(([^)]*)\)/g)) {
      const col = PCOL[m[1]]; const ccs = [...m[4].matchAll(/'([A-Z]{2})'/g)].map(x => x[1])
      const rows = prices.filter(r => r.planKey === m[3] && ccs.includes(r.countryCode))
      if (!col || !rows.length) throw new Error(`[plans fixture] cannot apply: ${m[0]}`)
      for (const r of rows) r[col] = m[2] === 'null' ? null : Number(m[2])
    }
    // `update public.plans set <col> = <value> where key = '<key>'` (trial_months, subtitle)
    const COL = { trial_months: 'trialMonths', subtitle: 'subtitle', description: 'description', included_vans: 'includedVans' }
    for (const m of sqlB.matchAll(/update public\.plans set (\w+) = ('(?:[^']|'')*'|-?\d+|true|false) where key = '([a-z0-9_]+)'/g)) {
      const p = plans.find(x => x.key === m[3]); const col = COL[m[1]]
      if (!p || !col) throw new Error(`[plans fixture] cannot apply: ${m[0]}`)
      const raw = m[2]
      p[col] = raw.startsWith("'") ? raw.slice(1, -1).replace(/''/g, "'") : raw === 'true' ? true : raw === 'false' ? false : Number(raw)
    }
    // `update public.plans set is_highlighted = (key = '<key>') …`
    const hl = /update public\.plans set is_highlighted = \(key = '([a-z0-9_]+)'\)/.exec(sqlB)
    if (hl) for (const p of plans) p.isHighlighted = p.key === hl[1]
    // the plan_features upsert (on conflict … do update)
    for (const r of valuesBlock(sqlB, 'plan_features')) {
      const f = features.find(x => x.planKey === r.plan_key && x.feature === r.feature)
      if (f) f.enabled = r.enabled
      else features.push({ planKey: r.plan_key, feature: r.feature, enabled: r.enabled })
    }
  }
  return { plans, prices, features }
}

module.exports = { seedCatalog, MIGRATION }
