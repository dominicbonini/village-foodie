#!/usr/bin/env node
// scripts/legacy-pricing-imports.cjs — 🔴 THE FROZEN PRICING DISPLAY IS GONE AND STAYS GONE (pricing-pages, Stage B;
// docs/pricing-pages-report.md).
//
// Stage A (plans-data-model) froze the old Starter / Pro / Max display in lib/legacy-pricing-display.ts and allowed
// six files to import it. Stage B rebuilt every public pricing surface from public.plans / plan_prices / plan_features
// (lib/plans.ts, through lib/plan-offer.ts) and deleted it. This check now asserts:
//   1. lib/legacy-pricing-display.ts (and its retired neighbours lib/landing-table.ts, components/landing/
//      FeatureComparison.tsx) do not exist;
//   2. nothing imports any of them (a static import, export-from, dynamic import or require);
//   3. nothing READS the retired country_settings plan columns — starter_monthly_minor, pro_monthly_minor,
//      max_monthly_minor, pro_allowance_minor, max_allowance_minor, platform_fee_pct — by column name or by their old
//      camelCase field names. The COLUMNS stay in the database; only code may not read them. A mention inside a comment
//      is allowed (the files that explain the retirement name them).
//
// Scope: every .ts/.tsx/.js/.jsx/.mjs/.cjs file under app/, components/, lib/, plus proxy.ts and middleware.ts.
// scripts/ and supabase/ are out of scope (migrations and harness fixtures create and seed those columns).
//
//   node scripts/legacy-pricing-imports.cjs
// Pure file reading — no network, no database.
const fs = require('fs')
const path = require('path')

const REPO = path.resolve(__dirname, '..')
const GONE = ['lib/legacy-pricing-display.ts', 'lib/landing-table.ts', 'components/landing/FeatureComparison.tsx']
const RETIRED = [
  'starter_monthly_minor', 'pro_monthly_minor', 'max_monthly_minor', 'pro_allowance_minor', 'max_allowance_minor', 'platform_fee_pct',
  'starterMonthlyMinor', 'proMonthlyMinor', 'maxMonthlyMinor', 'proAllowanceMinor', 'maxAllowanceMinor', 'platformFeePct',
]

const EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/
function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (EXT.test(e.name)) out.push(p)
  }
  return out
}

// Any static import / export-from / dynamic import / require whose specifier resolves to a retired file.
const SPEC = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)(['"])([^'"]+)\1/gm
const GONE_STEMS = new Set(GONE.map(g => g.replace(/\.(ts|tsx)$/, '')))
function importsGone(file, src) {
  const hits = []
  for (const m of src.matchAll(SPEC)) {
    const spec = m[2]
    let resolved = null
    if (spec.startsWith('@/')) resolved = spec.slice(2)
    else if (spec.startsWith('.')) resolved = path.relative(REPO, path.resolve(path.dirname(file), spec))
    if (!resolved) continue
    resolved = resolved.replace(/\\/g, '/').replace(/\.(ts|tsx|js)$/, '')
    if (GONE_STEMS.has(resolved)) hits.push({ spec, line: src.slice(0, m.index).split('\n').length })
  }
  return hits
}

/** The source with comments blanked (line structure kept), so a column named in a note is not a read. */
function stripComments(src) {
  let out = ''
  let i = 0
  let mode = null   // null | 'line' | 'block' | quote char
  while (i < src.length) {
    const c = src[i], n = src[i + 1]
    if (mode === 'line') { if (c === '\n') { mode = null; out += c } else out += ' '; i++; continue }
    if (mode === 'block') { if (c === '*' && n === '/') { mode = null; out += '  '; i += 2 } else { out += c === '\n' ? c : ' '; i++ } continue }
    if (mode) { out += c; if (c === '\\') { out += n ?? ''; i += 2; continue } if (c === mode) mode = null; i++; continue }
    if (c === '/' && n === '/') { mode = 'line'; out += '  '; i += 2; continue }
    if (c === '/' && n === '*') { mode = 'block'; out += '  '; i += 2; continue }
    if (c === '"' || c === "'" || c === '`') mode = c
    out += c; i++
  }
  return out
}

const failures = []
for (const g of GONE) if (fs.existsSync(path.join(REPO, g))) failures.push(`${g} still exists — Stage B deletes it`)

const files = [...walk(path.join(REPO, 'app'), []), ...walk(path.join(REPO, 'components'), []), ...walk(path.join(REPO, 'lib'), [])]
for (const f of ['proxy.ts', 'middleware.ts']) if (fs.existsSync(path.join(REPO, f))) files.push(path.join(REPO, f))

let scanned = 0
for (const abs of files) {
  const rel = path.relative(REPO, abs).replace(/\\/g, '/')
  const src = fs.readFileSync(abs, 'utf8')
  scanned++
  for (const h of importsGone(abs, src)) failures.push(`${rel}:${h.line} imports ${h.spec} — a retired module`)
  const code = stripComments(src)
  for (const col of RETIRED) {
    const re = new RegExp(`\\b${col}\\b`, 'g')
    for (const m of code.matchAll(re)) failures.push(`${rel}:${code.slice(0, m.index).split('\n').length} reads the retired column ${col}`)
  }
}

console.log(`legacy-pricing-imports: ${scanned} files scanned under app/, components/, lib/ (+ proxy.ts, middleware.ts)`)
console.log(`  retired files absent: ${GONE.filter(g => !fs.existsSync(path.join(REPO, g))).length}/${GONE.length}`)
if (failures.length) {
  console.log(`FAIL — ${failures.length} problem(s):`)
  for (const f of failures) console.log('  ✗ ' + f)
  process.exit(1)
}
console.log('PASS — the frozen pricing display is gone, nothing imports it, and nothing reads the retired plan columns.')
