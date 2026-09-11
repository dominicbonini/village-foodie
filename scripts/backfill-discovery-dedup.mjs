// scripts/backfill-discovery-dedup.mjs
//
// ONE-OFF BACKFILL over existing FUTURE discovery_events: R5-checked venue enrichment, then the duplicate
// rule — same date, same truck, then gate.duplicateVerdict (same postcode, OR ≤ 500 m, OR identical
// coordinates, OR contained venue names at the same start time within 1,500 m). Newest wins.
//
// 🔴 DRY RUN BY DEFAULT. It reads, computes, prints what it WOULD change, and writes NOTHING.
//     node scripts/backfill-discovery-dedup.mjs            # dry run (default) — no database write
//     node scripts/backfill-discovery-dedup.mjs --apply    # 🔴 writes: sets venue_id on accepted rows, marks losers
// The flag is `--apply` and nothing else enables writing — not an env var, not a prompt.
//
// 🔴 IT USES THE SHIPPED GATE, NOT A COPY OF ITS RULES. lib/discovery-gate.ts (and its three lib
// dependencies) are compiled here with the repository's own TypeScript package and executed — so the
// backfill cannot drift from what the ingest route does. Nothing is installed: `typescript` is already a
// dependency and `@supabase/supabase-js` is already a dependency.
//
// ⚠️ NEVER touches truck_events. ⚠️ Marks need supabase/migrations/20260911_discovery_events_superseded.sql
// applied; with --apply and the migration absent, marks fail loudly and are counted, venue_id updates still land.
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm'; import { createRequire } from 'node:module'
const require_ = createRequire(import.meta.url)
const ts = require_('typescript'); const { createClient } = require_('@supabase/supabase-js')
const dotenv = require_('dotenv'); dotenv.config({ path: '.env.local' })

const APPLY = process.argv.includes('--apply')
const TODAY = new Date().toISOString().slice(0, 10)

// ── load the gate from source (path alias '@/lib/…' → ./lib/…) ────────────────────────────────────
const cache = new Map()
function loadTs(rel) {
  if (cache.has(rel)) return cache.get(rel)
  const file = path.resolve(rel)
  const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const mod = { exports: {} }
  const req = (id) => id.startsWith('@/lib/') ? loadTs(id.replace('@/', '') + '.ts') : require_(id)
  vm.runInNewContext(out, { module: mod, exports: mod.exports, require: req, console, process, URL, fetch, Date, Math, Number, String, Set, Map, JSON, Promise, Array, Object, RegExp })
  cache.set(rel, mod.exports); return mod.exports
}
const gate = loadTs('lib/discovery-gate.ts')

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const all = async (t, sel, extra = '') => { const out = []; for (let from = 0; ; from += 1000) {
  const { data, error } = await supabase.from(t).select(sel).order('id').range(from, from + 999); if (error) throw error; out.push(...(data ?? [])); if (!data || data.length < 1000) break } return out }

const events = (await all('discovery_events', 'id,event_date,start_time,end_time,truck_name,venue_name,village,event_notes,source,ai_notes,venue_id,discovery_truck_id,created_at,superseded_by')).filter(e => e.event_date >= TODAY)
const trucks = await all('discovery_trucks', 'id,name,aliases')
const venues = await all('venues', 'id,name,village,latitude,longitude,postcode')
console.log(`${APPLY ? '🔴 APPLY' : '🧪 DRY RUN'} · future events ${events.length} · trucks ${trucks.length} · venues ${venues.length}`)

// ── step 1: R5 enrichment for rows with no venue_id ──────────────────────────────────────────────
const { findVenue, normName } = loadTs('lib/venue-matcher.ts')
const anchors = gate.villageAnchors(venues)
const enrich = [], rejected = []
for (const e of events) {
  if (e.venue_id) continue
  const m = findVenue(e.venue_name, e.village, venues)
  if (!m.venue) continue
  const r5 = gate.r5Accept(e, m.venue, m.confidence, anchors)
  ;(r5.ok ? enrich : rejected).push({ e, v: m.venue, conf: m.confidence, reason: r5.reason })
}
console.log(`\n── STEP 1 · R5 enrichment: would set venue_id on ${enrich.length} rows · rejects ${rejected.length} ──`)
const grp = (list) => { const m = {}; for (const r of list) { const k = `${r.e.venue_name} [${r.e.village || '—'}] → ${r.v.name} [${r.v.village || '—'}]`; (m[k] = m[k] || { n: 0, r: r.reason, t: r.e.truck_name }); m[k].n++ } return Object.entries(m).sort((a, b) => b[1].n - a[1].n) }
console.log('  ACCEPT:'); grp(enrich).forEach(([k, v]) => console.log(`   ${String(v.n).padStart(3)}× ${k}  — ${v.r}  (${v.t})`))
console.log('  REJECT (venue_id stays NULL):'); grp(rejected).forEach(([k, v]) => console.log(`   ${String(v.n).padStart(3)}× ${k}  — ${v.r}  (${v.t})`))

// apply enrichment in memory so step 2 sees it
const venueById = new Map(venues.map(v => [v.id, v]))
for (const r of enrich) r.e.venue_id = r.v.id

// ── step 2: the duplicate rule over same-date, same-truck pairs ──────────────────────────────────
const { normalizeVenue } = loadTs('lib/venue-signature.ts')
// 🔴 THE GROUP KEY WAS THE BUG, AND THIS IS THE FIX.
// It was `event_date + '|' + (discovery_truck_id || normalizeVenue(truck_name))` — ONE key per ROW,
// mixing two identifier namespaces. A truck with one linked row and one unlinked row produced
// "2026-09-20|aeddc37a-…" and "2026-09-20|forgekitchen": two groups, so the pair was never compared and
// no rule ever ran on it. That is why The Forge Kitchen's Debenham pair sat unmarked at 0 m.
// ✅ NOW: the bucket is the DATE ALONE, and the truck test is made PER PAIR by `sameTruck` below —
// byte-identical in behaviour to the shipped gate's own test (lib/discovery-gate.ts, step 3). Deciding
// per pair is what makes it correct in both directions: when BOTH rows are linked the ids are
// authoritative and two different trucks can never merge on a similar name; when EITHER row is
// unlinked there is no id to compare, so it falls back to the normalised name, which every row has.
// The old key had to choose one namespace per row BEFORE any comparison, and rows that chose
// differently could never meet.
// ⚠️ DATE-ONLY BUCKETS DO NOT MEAN "COMPARE EVERYTHING": every pair still passes sameTruck, and a pair
// that fails it is skipped before any venue is looked at.
const sameTruck = (a, b) => (a.discovery_truck_id && b.discovery_truck_id)
  ? a.discovery_truck_id === b.discovery_truck_id
  : normalizeVenue(a.truck_name) === normalizeVenue(b.truck_name)

const groups = new Map()
for (const e of events) { const k = e.event_date; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e) }
const marks = [], unjudgeable = []
let pairsTested = 0, pairsSameTruck = 0
for (const [, rows] of groups) {
  rows.sort((a, b) => a.created_at < b.created_at ? 1 : -1)       // newest first
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const winner = rows[i], loser = rows[j]                          // winner is newer by the sort
    pairsTested++
    if (!sameTruck(winner, loser)) continue
    pairsSameTruck++
    if (marks.some(m => m.loser.id === loser.id)) continue           // already superseded by something newer
    const va = venueById.get(winner.venue_id), vb = venueById.get(loser.venue_id)
    if (!va || !vb) { unjudgeable.push([winner, loser]); continue }
    const v = gate.duplicateVerdict(winner, loser, va, vb)
    if (!v) continue
    const ta = /^(\d{1,2}):(\d{2})/.exec(winner.start_time || ''), tb = /^(\d{1,2}):(\d{2})/.exec(loser.start_time || '')
    marks.push({ winner, loser, rule: v.rule, metres: v.metres == null ? null : Math.round(v.metres), postcode: v.postcode, gap: ta && tb ? Math.abs((+ta[1] * 60 + +ta[2]) - (+tb[1] * 60 + +tb[2])) : null })
  }
}

// 🔴 CHAIN RESOLUTION. The pairwise loop can mark A against B while B is itself marked against C — a
// loser pointing at a loser, which is what the 13 rows applied on 11 September recorded three times
// (Pig-Casso's "foodPark" points at "FoodPark Biomedical", which points at "Biomedical Campus
// Cambridge"). "Newest wins" means the SURVIVOR of the cluster wins, so each winner is walked to the
// row that is not itself a loser. The rule that fired for the original pair is kept.
const loserIds = new Map(marks.map(m => [m.loser.id, m]))
for (const m of marks) {
  let w = m.winner, hops = 0
  while (loserIds.has(w.id) && hops++ < 20) w = loserIds.get(w.id).winner
  if (w.id !== m.winner.id) { m.chainedFrom = m.winner; m.winner = w }
}
const byRule = {}; for (const m of marks) byRule[m.rule] = (byRule[m.rule] || 0) + 1
console.log(`\n── STEP 2 · duplicate rule: would mark ${marks.length} rows superseded · unjudgeable pairs ${unjudgeable.length} ──`)
console.log(`   pairs on the same date ${pairsTested} → same truck ${pairsSameTruck} (${pairsTested - pairsSameTruck} different trucks, never compared)`)
console.log(`   by rule: ${Object.entries(byRule).map(([k, v]) => k + ' ' + v).join(' · ') || 'none'}`)
const ALREADY = new Set(events.filter(e => e.superseded_by).map(e => e.id))
for (const tag of ['🔴 NEW', 'already applied']) {
  const list = marks.filter(m => (tag === '🔴 NEW') === !ALREADY.has(m.loser.id))
  console.log(`\n   ── ${tag}: ${list.length} ──`)
  for (const m of list) console.log(`   ${m.loser.event_date} ${(m.loser.truck_name || '').padEnd(18)} LOSER "${m.loser.venue_name}" (${m.loser.start_time || '—'})  ←  WINNER "${m.winner.venue_name}" (${m.winner.start_time || '—'})  [${m.rule}]${m.metres != null ? ' ' + m.metres + ' m' : ''}${m.postcode ? ' ' + m.postcode : ''} · gap ${m.gap == null ? '?' : m.gap + ' min'}${m.chainedFrom ? `  ⚠️ chain: was "${m.chainedFrom.venue_name}"` : ''}`)
}

if (!APPLY) { console.log('\n🧪 DRY RUN — nothing written. Re-run with --apply to write the above.'); process.exit(0) }

// ── apply ────────────────────────────────────────────────────────────────────────────────────────
let setVid = 0, marked = 0, markFailed = 0
for (const r of enrich) { const { error } = await supabase.from('discovery_events').update({ venue_id: r.v.id }).eq('id', r.e.id).is('venue_id', null); if (!error) setVid++; else console.warn('venue_id update failed', r.e.id, error.message) }
for (const m of marks) {
  const { error } = await supabase.from('discovery_events').update({ superseded_by: m.winner.id, superseded_reason: m.rule, superseded_at: new Date().toISOString(),
    superseded_meta: { rule: m.rule, metres: m.metres, postcode: m.postcode, time_gap_min: m.gap, winner_source: m.winner.source, loser_source: m.loser.source, winner_key: `${m.winner.event_date}|${m.winner.truck_name}|${m.winner.venue_name}`, chained_from: m.chainedFrom ? m.chainedFrom.id : null },
    show_on_vf: false, show_on_hg: false }).eq('id', m.loser.id).is('superseded_by', null)
  if (error) { markFailed++; console.warn('mark failed', m.loser.id, error.message) } else marked++
}
console.log(`\n🔴 APPLIED · venue_id set ${setVid} · superseded marked ${marked} · mark failures ${markFailed}${markFailed ? ' (is 20260911_discovery_events_superseded.sql applied? notify pgrst reload schema?)' : ''}`)
process.exit(markFailed ? 1 : 0)
