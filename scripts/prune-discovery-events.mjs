// scripts/prune-discovery-events.mjs — daily deletion of PAST-DATED discovery_events.
//
// Run by .github/workflows/discovery_prune.yml. Its own workflow, its own exit code, its own red.
//
//   node scripts/prune-discovery-events.mjs                     # 🔴 deletes (subject to every guard below)
//   node scripts/prune-discovery-events.mjs --dry-run           # prints what it would delete; writes nothing
//   ALLOW_BACKLOG=230 node scripts/…                            # one-off: raise the floor for a known backlog
//   node scripts/… --simulate-broken-exclusion                  # TEST ONLY: pretends the exclusion matched nothing,
//                                                               # to prove the floor refuses (never deletes)
//
// 🔴 THE FOUR LINKED TRUCKS ARE EXCLUDED BY FK **OR** NAME — both, every run. 🧪 Name catches 24 rows the
// FK misses (rows whose discovery_truck_id was never set). A row is kept if EITHER test matches.
// 🔴 THE COUNT FLOOR. Before deleting anything the script measures recent daily creation volume
// (rows created per day over the last 14 days) and REFUSES — exit 1, red — if the candidate count exceeds
// max(3 × mean, 2 × max, 60). 🧪 Measured 11 Sep: mean 17.8, max 44 → ceiling 88; 230 past rows of which
// 158 belong to the four linked trucks, so the first run's candidates are 72 — UNDER the ceiling. A run
// whose exclusion silently broke would see all 230 and be refused (🧪 proved with
// --simulate-broken-exclusion: exit 1). If a later backlog exceeds the ceiling, pass ALLOW_BACKLOG=<n>
// once, deliberately, to clear it.
// ⚠️ NEVER reads or writes truck_events. NEVER deletes a row dated today or later.
import { createRequire } from 'node:module'
const require_ = createRequire(import.meta.url)
const { createClient } = require_('@supabase/supabase-js')
try { require_('dotenv').config({ path: '.env.local' }) } catch {}

const DRY = process.argv.includes('--dry-run'), SIMULATE_BROKEN = process.argv.includes('--simulate-broken-exclusion')
const ALLOW_BACKLOG = process.env.ALLOW_BACKLOG ? parseInt(process.env.ALLOW_BACKLOG, 10) : null
const LINKED = [                                      // the four trading trucks — FK id AND name, both checked
  { name: 'Pizzeria Gusto', hg: 'pizzeria-gusto' }, { name: 'Real Thai Food', hg: 'real-thai-food' },
  { name: 'Tikka Tonic', hg: 'tikka-tonic' }, { name: 'Test Kitchen', hg: 'test-truck' },
]
const fail = (m) => { console.error('🔴 REFUSED: ' + m); process.exit(1) }
const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')   // containment on the scraper-mirror shape (letters+digits)

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const all = async (t, sel, mod = q => q) => { const out = []; for (let from = 0; ; from += 1000) { const { data, error } = await mod(supabase.from(t).select(sel)).order('id').range(from, from + 999); if (error) throw error; out.push(...(data ?? [])); if (!data || data.length < 1000) break } return out }
const TODAY = new Date().toISOString().slice(0, 10)

// 1 ── resolve the four trucks' discovery ids from the live table (never hardcode a uuid)
const trucks = await all('discovery_trucks', 'id,name,hatchgrab_truck_id')
const linkedIds = new Set(), linkedNorms = []
for (const L of LINKED) { const t = trucks.find(x => x.hatchgrab_truck_id === L.hg); if (t) linkedIds.add(t.id); linkedNorms.push(norm(L.name)) }
if (linkedIds.size !== LINKED.length && !SIMULATE_BROKEN) fail(`only ${linkedIds.size} of ${LINKED.length} linked trucks resolved by hatchgrab_truck_id — the exclusion cannot be trusted; nothing deleted`)
if (SIMULATE_BROKEN) { linkedIds.clear(); linkedNorms.length = 0; console.log('⚠️ SIMULATING A BROKEN EXCLUSION (test): FK set and name list emptied') }

// 2 ── candidates: past-dated, not linked by FK OR name
const past = await all('discovery_events', 'id,event_date,truck_name,discovery_truck_id,created_at', q => q.lt('event_date', TODAY))
const isLinked = e => linkedIds.has(e.discovery_truck_id) || linkedNorms.some(n => { const m = norm(e.truck_name); return !!n && !!m && (m === n || m.includes(n) || n.includes(m)) })
const keep = past.filter(isLinked), cand = past.filter(e => !isLinked(e))
console.log(`past-dated rows ${past.length} · kept as linked (FK or name) ${keep.length} · candidates ${cand.length}`)

// 3 ── the count floor, from recent daily creation volume
const recent = await all('discovery_events', 'created_at', q => q.gte('created_at', new Date(Date.now() - 14 * 864e5).toISOString()))
const perDay = {}; for (const r of recent) { const d = r.created_at.slice(0, 10); perDay[d] = (perDay[d] || 0) + 1 }
const vals = Object.values(perDay), mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0, max = vals.length ? Math.max(...vals) : 0
const ceiling = Math.max(Math.round(3 * mean), 2 * max, 60)
console.log(`recent volume: ${vals.length} days, mean ${mean.toFixed(1)}/day, max ${max}/day → ceiling ${ceiling}${ALLOW_BACKLOG ? ` (ALLOW_BACKLOG=${ALLOW_BACKLOG})` : ''}`)
if (cand.length > (ALLOW_BACKLOG ?? ceiling)) fail(`${cand.length} candidates exceed the ceiling of ${ALLOW_BACKLOG ?? ceiling} — far more than recent daily volume; either the exclusion is broken or this is a backlog. Nothing deleted. For a known backlog re-run once with ALLOW_BACKLOG=${cand.length}.`)
if (keep.length === 0 && past.some(e => linkedNorms.length === 0 ? false : true) && !SIMULATE_BROKEN) console.warn('⚠️ no past row matched a linked truck — unusual; proceeding because the count floor passed')

// 4 ── delete (or report)
if (DRY || SIMULATE_BROKEN) { console.log(`🧪 ${SIMULATE_BROKEN ? 'simulation' : 'dry run'} — would delete ${cand.length}, keep ${keep.length}. Nothing written.`); process.exit(0) }
let deleted = 0
for (let i = 0; i < cand.length; i += 200) { const ids = cand.slice(i, i + 200).map(e => e.id); const { error } = await supabase.from('discovery_events').delete().in('id', ids).lt('event_date', TODAY); if (error) fail(`delete failed at chunk ${i}: ${error.message} (${deleted} already deleted)`); deleted += ids.length }
console.log(`✅ deleted ${deleted} past-dated rows · kept ${keep.length} linked-truck rows`)

// 5 ── discovery_run_log, its own guard: rows older than 30 days, refuse if more than 60 runs' worth
const cutoff = new Date(Date.now() - 30 * 864e5).toISOString()
const oldLog = await all('discovery_run_log', 'id', q => q.lt('run_at', cutoff))
const LOG_CEILING = 116 * 60
if (oldLog.length > LOG_CEILING) fail(`discovery_run_log: ${oldLog.length} rows older than 30 days exceeds ${LOG_CEILING}; refusing this step (events above were already pruned)`)
if (oldLog.length) { const { error } = await supabase.from('discovery_run_log').delete().lt('run_at', cutoff); if (error) fail(`run_log prune failed: ${error.message}`) }
console.log(`✅ discovery_run_log: pruned ${oldLog.length} rows older than 30 days`)
