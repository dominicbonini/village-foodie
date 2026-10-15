// scripts/audit-go-live.mjs
// READ-ONLY audit: run lib/go-live-checks.ts against every truck in the database.
//
//   node scripts/audit-go-live.mjs
//
// WHY IT EXISTS: the go-live predicate gates nomination (Phase 5), but the conditions it checks can drift
// into EXISTING trucks at any time — a bulk import leaves every new item allergens_verified=false, a new
// van arrives with no kitchen_capacity. This turns "is any truck in a state that would break at go-live?"
// into one command instead of a reasoning exercise. Worth re-running after any import and before Phase 5.
//
// IT COMPILES AND IMPORTS THE REAL MODULE rather than reimplementing the rules. A second copy of the
// predicate would answer a different question from the one the product actually enforces, which is worse
// than having no audit — it would report "all clear" against rules nobody uses. There is no ts-node/tsx in
// this project, so it bundles the module with the installed esbuild and loads the output.
// ⚠️ Language Phase 1c (docs/language-phase-1c-report.md, 15 October 2026): an issue is now a code and its values,
// and its words come from lib/go-live-text.ts (the message files). That module imports the i18n catalogue, which a
// single-file `tsc` cannot resolve, so the compile moved from tsc to an esbuild bundle of both modules. The lines
// printed below are the same words as before.
//
// GET requests only. This script performs no writes of any kind.

import { readFileSync, mkdtempSync, writeFileSync } from 'fs'
import { createRequire } from 'module'
import { tmpdir } from 'os'
import { join } from 'path'

const ROOT = new URL('..', import.meta.url).pathname

// ── Bundle lib/go-live-checks.ts and its words (lib/go-live-text.ts) → CommonJS, then load it ──────────
const require = createRequire(import.meta.url)
const { build } = require(join(ROOT, 'node_modules/esbuild'))
const bundled = await build({
  stdin: { contents: "export { checkGoLive } from '@/lib/go-live-checks'\nexport { goLiveIssueText } from '@/lib/go-live-text'", resolveDir: ROOT, loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'cjs', target: 'node20', alias: { '@': ROOT }, logLevel: 'silent',
})
const out = join(mkdtempSync(join(tmpdir(), 'golive-')), 'go-live.cjs')
writeFileSync(out, bundled.outputFiles[0].text)
const { checkGoLive, goLiveIssueText } = require(out)

// ── Supabase (service role, read-only usage) ─────────────────────────────────────────────────────────
const env = Object.fromEntries(readFileSync(join(ROOT, '.env.local'), 'utf8')
  .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))

const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
const get = async (path) => {
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, { headers: H })
  const body = await r.text()
  if (r.status !== 200) throw new Error(`${path} → ${r.status} ${body.slice(0, 200)}`)
  return JSON.parse(body)
}

const trucks = await get('trucks?select=id,name,allergen_display_mode,allergen_info_url,allergen_info_text,excluded,show_on_hg,show_on_vf&order=id')
const items = await get('menu_items_db?select=truck_id,allergens_verified&limit=10000')
const vans = await get('truck_vans?select=truck_id,name,kitchen_capacity')
const cats = await get('menu_categories?select=truck_id,name,prep_secs,batch_size,counts_toward_capacity,is_active')

const group = (rows) => rows.reduce((m, r) => ((m[r.truck_id] ??= []).push(r), m), {})
const I = group(items), V = group(vans), C = group(cats)

// Demo trucks are reported but flagged: they are card-mode with no card BY DESIGN (to avoid the empty-menu
// trap), and their capacity is deliberately left unset — so their blockers are expected, not findings.
const isDemo = (id) => id.startsWith('demo-')
const isLive = (t) => !t.excluded && (t.show_on_hg || t.show_on_vf)

console.log(`\n════ GO-LIVE AUDIT — ${trucks.length} trucks ════`)
console.log('operatorEmailVerified is passed as undefined until Phase 4 Step 2 wires verification, so it')
console.log('reports as UNKNOWN for every truck (unknown blocks by design). Blocker counts below exclude it.\n')

const results = trucks.map(t => ({
  t,
  res: checkGoLive({ truck: t, items: I[t.id] ?? [], vans: V[t.id] ?? [], categories: C[t.id] ?? [], operatorEmailVerified: undefined }),
}))

for (const { t, res } of results) {
  const tag = res.blockers.length === 0 ? '✅ would pass' : `🔴 ${res.blockers.length} blocker(s)`
  console.log(`${t.id.padEnd(30)} ${isLive(t) ? 'LIVE   ' : 'hidden '}${isDemo(t.id) ? '[demo] ' : '       '}` +
    `mode=${String(t.allergen_display_mode).padEnd(9)} items=${String((I[t.id] ?? []).length).padStart(3)} ` +
    `vans=${(V[t.id] ?? []).length}  ${tag}`)
  for (const b of res.blockers) console.log(`      • [${b.code}] ${goLiveIssueText(b).title}`)
}

// The section that matters: a LIVE, non-demo truck with a blocker is a problem TODAY, not at Phase 5.
const urgent = results.filter(({ t, res }) => isLive(t) && !isDemo(t.id) && res.blockers.length > 0)
console.log(`\n──── ${results.filter(r => !r.res.blockers.length).length} would pass · ` +
  `${results.filter(r => r.res.blockers.length).length} blocked ────`)

if (urgent.length === 0) {
  console.log('\n✅ No LIVE operator truck has a go-live blocker.')
} else {
  console.log(`\n🔴 ${urgent.length} LIVE operator truck(s) with blockers — these are live issues, not Phase 5 work:`)
  for (const { t, res } of urgent) {
    console.log(`\n  ${t.id} (${t.name})`)
    for (const b of res.blockers) { const w = goLiveIssueText(b); console.log(`     • ${w.title}\n       ${w.detail}`) }
  }
}
