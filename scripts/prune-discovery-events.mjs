// scripts/prune-discovery-events.mjs — daily deletion of PAST-DATED discovery_events.
//
// Run by .github/workflows/discovery_prune.yml. Its own workflow, its own exit code, its own red.
//
//   node scripts/prune-discovery-events.mjs                     # 🔴 deletes (subject to every guard below)
//   node scripts/prune-discovery-events.mjs --dry-run           # prints what it would delete; writes nothing
//   ALLOW_BACKLOG=400 node scripts/…                            # one-off: accept a larger/older backlog
//   node scripts/… --simulate-broken-exclusion                  # TEST ONLY: pretends the exclusion matched nothing,
//                                                               # to prove the guards refuse (never deletes)
//
// 🔴 THE FOUR LINKED TRUCKS ARE EXCLUDED BY FK **OR** NAME — both, every run. 🧪 Name catches 23 rows the
// FK misses (rows whose discovery_truck_id was never set). A row is kept if EITHER test matches.
//
// ── THE GUARDS, AND WHY THE ORIGINAL ONE WAS REPLACED ────────────────────────────────────────────────
// 🔴 THE FIRST VERSION HAD ONE GUARD AND IT DEADLOCKED THE JOB. It refused when the candidate count
// exceeded max(3 × mean, 2 × max, 60) of rows CREATED per day over the last 14 days. Two faults:
//   1. IT COMPARED A STOCK TO A FLOW. Candidates accumulate as `event_date` rolls past; the ceiling
//      measured `created_at`. Those are different populations. 🧪 Measured 14 Sep 2026: rows went past
//      at ~36/day while created_at averaged 21.9/day, so the ceiling of 88 was ~2.4 days of headroom.
//   2. IT COULD ONLY RATCHET. Every refused run left the backlog one day bigger, so the next run was
//      further over the line. 🧪 It refused 5 days running (9–13 Sep, 178 rows) and could never have
//      recovered unattended. A guard that cannot clear itself is a deadlock, not a safety guard.
//
// The thing it was really protecting against is A BROKEN EXCLUSION, so that is now tested DIRECTLY and
// the size checks are shaped so they cannot deadlock:
//
//   GUARD A — EXCLUSION HEALTH, over the WHOLE table rather than only past rows, so an empty backlog
//             cannot make it vacuously true. The FK half and the NAME half must EACH still match rows.
//             🧪 Catches all three break modes (both halves dead / FK dead / name dead), and it is the
//             ONLY guard that catches an FK-only break — the name half hides that one from every
//             count-based test. This is the safety property; ALLOW_BACKLOG cannot switch it off.
//   GUARD B — BACKLOG AGE, not size. Under daily operation candidates are a few days old at most; a
//             broken exclusion immediately exposes linked rows going back months (🧪 oldest 115 days).
//             Absorbs an outage of up to MAX_BACKLOG_DAYS and then clears itself.
//   GUARD C — BLAST RADIUS PER DAY: no single `event_date` may contribute more than
//             max(60, 2 × the busiest upcoming day). Measured on the FUTURE side, which pruning never
//             touches, and scale-free in the number of days — so a long backlog still passes while a
//             single runaway date does not.
//
// ⚠️ NEVER reads or writes truck_events. NEVER deletes a row dated today or later.
import { createRequire } from 'node:module'
const require_ = createRequire(import.meta.url)
const { createClient } = require_('@supabase/supabase-js')
try { require_('dotenv').config({ path: '.env.local' }) } catch {}

const fail = (m) => { console.error('🔴 REFUSED: ' + m); process.exit(1) }

const DRY = process.argv.includes('--dry-run'), SIMULATE_BROKEN = process.argv.includes('--simulate-broken-exclusion')
// 🔴 VALIDATED, NOT parseInt'd AND HOPED FOR. `parseInt('yes')` is NaN, and `n > NaN` is false — so the
// old line turned a typo in a workflow input into "no size guard at all, delete everything". An empty
// string (the workflow passes one on every scheduled run) means "not set", which is the normal case.
const rawBacklog = (process.env.ALLOW_BACKLOG ?? '').trim()
if (rawBacklog && !/^\d+$/.test(rawBacklog)) fail(`ALLOW_BACKLOG must be a whole number of rows, got ${JSON.stringify(rawBacklog)} — refusing rather than running with the size guards silently disabled`)
const ALLOW_BACKLOG = rawBacklog ? parseInt(rawBacklog, 10) : null
const MAX_BACKLOG_DAYS = 30                           // Guard B: how long an outage may be absorbed unattended
const LINKED = [                                      // the four trading trucks — FK id AND name, both checked
  { name: 'Pizzeria Gusto', hg: 'pizzeria-gusto' }, { name: 'Real Thai Food', hg: 'real-thai-food' },
  { name: 'Tikka Tonic', hg: 'tikka-tonic' }, { name: 'Test Kitchen', hg: 'test-truck' },
]
const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')   // containment on the scraper-mirror shape (letters+digits)

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const all = async (t, sel, mod = q => q) => { const out = []; for (let from = 0; ; from += 1000) { const { data, error } = await mod(supabase.from(t).select(sel)).order('id').range(from, from + 999); if (error) throw error; out.push(...(data ?? [])); if (!data || data.length < 1000) break } return out }
const TODAY = new Date().toISOString().slice(0, 10)
const ageDays = d => Math.floor((Date.parse(TODAY) - Date.parse(d)) / 864e5)

// 1 ── resolve the four trucks' discovery ids from the live table (never hardcode a uuid)
const trucks = await all('discovery_trucks', 'id,name,hatchgrab_truck_id')
const linkedIds = new Set(), linkedNorms = []
for (const L of LINKED) { const t = trucks.find(x => x.hatchgrab_truck_id === L.hg); if (t) linkedIds.add(t.id); linkedNorms.push(norm(L.name)) }
if (linkedIds.size !== LINKED.length && !SIMULATE_BROKEN) fail(`only ${linkedIds.size} of ${LINKED.length} linked trucks resolved by hatchgrab_truck_id — the exclusion cannot be trusted; nothing deleted`)
if (SIMULATE_BROKEN) { linkedIds.clear(); linkedNorms.length = 0; console.log('⚠️ SIMULATING A BROKEN EXCLUSION (test): FK set and name list emptied') }

// 2 ── ONE read of the table, split in memory. The future half is not decoration: Guard A needs rows the
//      pruner never touches, and Guard C needs the upcoming per-day rate.
const events = await all('discovery_events', 'id,event_date,truck_name,discovery_truck_id,created_at')
const fkHit = e => linkedIds.has(e.discovery_truck_id)
const nameHit = e => linkedNorms.some(n => { const m = norm(e.truck_name); return !!n && !!m && (m === n || m.includes(n) || n.includes(m)) })
const isLinked = e => fkHit(e) || nameHit(e)
const past = events.filter(e => e.event_date < TODAY), future = events.filter(e => e.event_date >= TODAY)
const keep = past.filter(isLinked), cand = past.filter(e => !isLinked(e))
console.log(`past-dated rows ${past.length} · kept as linked (FK or name) ${keep.length} · candidates ${cand.length}`)

// 3 ── GUARD A — is the exclusion actually working? Measured table-wide, so it is true or false
//      independently of how big the backlog happens to be today.
// ⚠️ THE NAME HALF IS TESTED ON ITS OWN MATCHES, NOT ON "rows the FK missed". Those 23 rows exist only
// because some scraped rows never got a discovery_truck_id; if the scraper is ever fixed to set it
// everywhere that number legitimately becomes 0, and a guard keyed on it would then refuse for ever —
// the same deadlock shape this rewrite exists to remove.
const fkAll = events.filter(fkHit).length, nameAll = events.filter(nameHit).length
const nameOnlyAll = events.filter(e => !fkHit(e) && nameHit(e)).length
console.log(`exclusion health (whole table): FK half matches ${fkAll} · NAME half matches ${nameAll} (${nameOnlyAll} of them the FK missed)`)
if (fkAll === 0) fail(`the FK half of the exclusion matched NO row in the whole table — discovery_truck_id has stopped linking the four trucks. Nothing deleted.`)
if (nameAll === 0) fail(`the NAME half of the exclusion matched NO row in the whole table — norm()/truck_name matching has stopped working, and an FK-only break would then be invisible to every count-based check. Nothing deleted.`)

// 4 ── GUARD B (age) and GUARD C (per-day blast radius). ALLOW_BACKLOG relaxes these two only.
const perFuture = {}; for (const e of future) perFuture[e.event_date] = (perFuture[e.event_date] || 0) + 1
const peakDay = Math.max(0, ...Object.keys(perFuture).sort().slice(0, 14).map(d => perFuture[d]))
const perDayCeiling = Math.max(60, 2 * peakDay)
const perCand = {}; for (const e of cand) perCand[e.event_date] = (perCand[e.event_date] || 0) + 1
const worstDate = Object.keys(perCand).sort((a, b) => perCand[b] - perCand[a])[0] ?? null
const oldest = cand.length ? cand.map(e => e.event_date).sort()[0] : TODAY
const bypass = ALLOW_BACKLOG !== null && cand.length <= ALLOW_BACKLOG
console.log(`backlog: ${Object.keys(perCand).length} distinct dates, oldest ${oldest} (${ageDays(oldest)}d) · busiest candidate date ${worstDate ?? '—'} (${worstDate ? perCand[worstDate] : 0}) · upcoming peak ${peakDay}/day → per-day ceiling ${perDayCeiling}${ALLOW_BACKLOG !== null ? ` (ALLOW_BACKLOG=${ALLOW_BACKLOG}${bypass ? ', size guards bypassed' : ', too small to bypass'})` : ''}`)
if (!bypass) {
  if (ageDays(oldest) > MAX_BACKLOG_DAYS) fail(`the oldest candidate is dated ${oldest}, ${ageDays(oldest)} days ago, beyond the ${MAX_BACKLOG_DAYS}-day limit — under daily operation candidates are only a few days old, so this is either a long outage or rows that should have been excluded. Nothing deleted. For a known backlog re-run once with ALLOW_BACKLOG=${cand.length}.`)
  if (worstDate && perCand[worstDate] > perDayCeiling) fail(`${perCand[worstDate]} candidates on ${worstDate} alone exceeds the per-day ceiling of ${perDayCeiling} (busiest upcoming day is ${peakDay}) — one date is contributing far more than a day's events. Nothing deleted. For a known backlog re-run once with ALLOW_BACKLOG=${cand.length}.`)
}

// 5 ── delete (or report)
if (DRY || SIMULATE_BROKEN) { console.log(`🧪 ${SIMULATE_BROKEN ? 'simulation' : 'dry run'} — would delete ${cand.length}, keep ${keep.length}. Nothing written.`); process.exit(0) }
let deleted = 0
for (let i = 0; i < cand.length; i += 200) { const ids = cand.slice(i, i + 200).map(e => e.id); const { error } = await supabase.from('discovery_events').delete().in('id', ids).lt('event_date', TODAY); if (error) fail(`delete failed at chunk ${i}: ${error.message} (${deleted} already deleted)`); deleted += ids.length }
console.log(`✅ deleted ${deleted} past-dated rows · kept ${keep.length} linked-truck rows`)

// 6 ── discovery_run_log, its own guard: rows older than 30 days, refuse if more than 60 runs' worth
const cutoff = new Date(Date.now() - 30 * 864e5).toISOString()
const oldLog = await all('discovery_run_log', 'id', q => q.lt('run_at', cutoff))
const LOG_CEILING = 116 * 60
if (oldLog.length > LOG_CEILING) fail(`discovery_run_log: ${oldLog.length} rows older than 30 days exceeds ${LOG_CEILING}; refusing this step (events above were already pruned)`)
if (oldLog.length) { const { error } = await supabase.from('discovery_run_log').delete().lt('run_at', cutoff); if (error) fail(`run_log prune failed: ${error.message}`) }
console.log(`✅ discovery_run_log: pruned ${oldLog.length} rows older than 30 days`)
