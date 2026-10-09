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
//   GUARD B — THE SIZE OF THE OLD TAIL: how many candidates are older than MAX_BACKLOG_DAYS, and how
//             many distinct dates they sit on. A broken exclusion exposes linked rows going back
//             months (🧪 ~179 rows across ~100 dates); a stale scrape is one row on one date.
//   GUARD C — BLAST RADIUS PER DAY: no single `event_date` may contribute more than
//             max(60, 2 × the busiest upcoming day). Measured on the FUTURE side, which pruning never
//             touches, and scale-free in the number of days — so a long backlog still passes while a
//             single runaway date does not.
//
// 🔴 GUARD B WAS "IS ANY CANDIDATE OLDER THAN 30 DAYS", AND IT DEADLOCKED THE JOB TOO — the second
//    time this file has shipped a guard that could only ratchet, and for the same reason: the quantity
//    it measured could not be reduced by anything the job was allowed to do.
//    🧪 9 OCTOBER 2026: refused with `the oldest candidate is dated 2026-05-22, 140 days ago`. The whole
//    tail was ONE row — `Smash and grab food truck`, event_date 22 May, **created 5 October**: a scrape
//    that picked up a historical listing. 🔴 THE AGE COULD NEVER FALL, because the only thing that
//    would remove that row is the delete the guard was blocking, so the job was red every night from
//    the day it arrived and would have stayed red for ever. ⚠️ AND THE BACKLOG BEHIND IT GREW: 7 dates
//    and 104 rows by the time it was looked at, none of which was the problem.
//    ⛔ AN "OUTAGE OF UP TO 30 DAYS" WAS NEVER WHAT IT ABSORBED. One past-dated row at any age jammed
//    it, whatever the rest of the table looked like.
//    🔴 SIZE CANNOT JAM. One stale row is deleted and the tail is empty again; a hundred old rows, or
//    ten old dates, still refuse — which is the thing the guard was for.
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
const MAX_BACKLOG_DAYS = 30                           // Guard B: beyond this a candidate counts as "old"
/* 🔴 HOW BIG AN OLD TAIL MAY BE BEFORE GUARD B REFUSES. ⛔ IT IS A SIZE, NOT A FLAG, AND THAT IS THE
 * WHOLE FIX — see the header. 🧪 The two populations this separates, measured 9 Oct 2026:
 *     a stale scrape   — 1 row, 1 date   (`Smash and grab food truck`, dated 22 May, created 5 Oct)
 *     a broken exclusion — ~179 rows across ~100 dates (the four trucks' entire past at once)
 * Twenty-five rows or ten distinct dates sits between them with room on both sides. ⚠️ EITHER TEST
 * ALONE REFUSES: a hundred rows on one date is a runaway, and ten old dates is history being exposed
 * however few rows each carries. */
const MAX_OLD_TAIL_ROWS = 25, MAX_OLD_TAIL_DATES = 10
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

// 🔴 THE OLD TAIL, NAMED ROW BY ROW — because "either a long outage or rows that should have been
//    excluded" is a refusal an operator cannot act on. Those two cases need opposite responses (clear
//    the backlog / fix the exclusion and delete NOTHING), and the message said which pair of
//    possibilities it was without saying which one it was looking at.
// 🧪 THE RUN THAT FORCED THIS: 9 Oct 2026, oldest candidate 2026-05-22, 140 days — and 2026-05-22 is
//    the first day of the Sheets migration, the floor of the whole table, which the scraper manual
//    recorded on 14 Sep as the oldest EXCLUDED row with the oldest CANDIDATE five days old. So a row
//    at that date had moved from the kept side to the delete side, and the one thing the message did
//    not print was the row. ⛔ ACTING ON THAT REFUSAL WITH THE `ALLOW_BACKLOG` IT SUGGESTS WOULD HAVE
//    DELETED IT UNEXAMINED.
// ⚠️ REPORTING ONLY — it changes no decision and deletes nothing. It prints on a refusal and on a dry
//    run, and stays quiet on a healthy scheduled run.
const closestLinked = (name) => {
  const m = norm(name)
  if (!m) return 'blank truck_name'
  /* ⚠️ THE LONGEST SHARED PREFIX against each linked name — enough to tell "nothing like it" from
   * "one character away", which is the difference between an unrelated trader and a renamed truck. */
  let best = '', bestN = ''
  for (const n of linkedNorms) {
    let i = 0
    while (i < n.length && i < m.length && n[i] === m[i]) i++
    if (i > best.length) { best = n.slice(0, i); bestN = n }
  }
  return best.length >= 3 ? `closest linked "${bestN}" shares "${best}"` : 'no linked name resembles it'
}
const reportOldTail = (rows, why) => {
  const perDate = {}
  for (const e of rows) perDate[e.event_date] = (perDate[e.event_date] || 0) + 1
  const dates = Object.keys(perDate).sort()
  /* ⚠️ THE DATE LIST IS CAPPED. A genuine outage has one date per day and would otherwise print 140
   * lines of noise above the rows that matter. */
  const shown = dates.slice(0, 12).map(d => `${d}×${perDate[d]}`).join(' · ')
  console.log(`\n🔎 ${why}: ${rows.length} row(s) on ${dates.length} date(s) — ${shown}${dates.length > 12 ? ` …+${dates.length - 12} more dates` : ''}`)
  /* ⚠️ CONSECUTIVE DATES READ AS AN OUTAGE; ISOLATED OLD ONES READ AS ROWS THAT SHOULD HAVE BEEN
   * EXCLUDED, or as a scrape that imported historical events. The span against the count says which
   * without anyone opening the table. */
  if (dates.length) {
    const span = ageDays(dates[0]) - ageDays(dates[dates.length - 1]) + 1
    console.log(`   ${dates.length} distinct date(s) across a ${span}-day span — ${dates.length >= span * 0.5
      ? 'contiguous, which is the shape of an OUTAGE' : 'sparse, which is the shape of STALE OR MIS-EXCLUDED rows'}`)
  }
  /* 🔴 **WHAT THE FK POINTS AT IS THE MOST DISCRIMINATING FACT HERE**, and it is the one the refusal
   * never showed. ⛔ `fk=miss name=miss` WOULD SAY NOTHING: every row in this list is a candidate, so
   * both halves missed it BY CONSTRUCTION — printing that would be printing the definition.
   * ⚠️ RESOLVING THE ID AGAINST `discovery_trucks` IS WHAT ANSWERS THE QUESTION: a candidate whose
   * `discovery_truck_id` resolves to one of the four named trucks means the FK exclusion has stopped
   * recognising its own id and NOTHING should be deleted; one that resolves to some other trader, or
   * to nothing at all, is an ordinary old row. */
  const truckById = new Map(trucks.map(t => [t.id, t]))
  for (const e of rows.slice(0, 20)) {
    const t = e.discovery_truck_id ? truckById.get(e.discovery_truck_id) : null
    const fk = !e.discovery_truck_id ? 'no discovery_truck_id'
      : t ? `discovery_truck_id → ${JSON.stringify(t.name)}${t.hatchgrab_truck_id ? ` (hatchgrab: ${t.hatchgrab_truck_id})` : ' (not linked to a HatchGrab truck)'}`
        : `discovery_truck_id ${e.discovery_truck_id} resolves to NO discovery_trucks row`
    console.log(`   ${e.event_date}  ${JSON.stringify(e.truck_name ?? null)}  ${fk}  ${closestLinked(e.truck_name)}`)
  }
  if (rows.length > 20) console.log(`   …and ${rows.length - 20} more`)
  console.log('')
}

// 4 ── GUARD B (age) and GUARD C (per-day blast radius). ALLOW_BACKLOG relaxes these two only.
const perFuture = {}; for (const e of future) perFuture[e.event_date] = (perFuture[e.event_date] || 0) + 1
const peakDay = Math.max(0, ...Object.keys(perFuture).sort().slice(0, 14).map(d => perFuture[d]))
const perDayCeiling = Math.max(60, 2 * peakDay)
const perCand = {}; for (const e of cand) perCand[e.event_date] = (perCand[e.event_date] || 0) + 1
const worstDate = Object.keys(perCand).sort((a, b) => perCand[b] - perCand[a])[0] ?? null
const oldest = cand.length ? cand.map(e => e.event_date).sort()[0] : TODAY
const bypass = ALLOW_BACKLOG !== null && cand.length <= ALLOW_BACKLOG
console.log(`backlog: ${Object.keys(perCand).length} distinct dates, oldest ${oldest} (${ageDays(oldest)}d) · busiest candidate date ${worstDate ?? '—'} (${worstDate ? perCand[worstDate] : 0}) · upcoming peak ${peakDay}/day → per-day ceiling ${perDayCeiling}${ALLOW_BACKLOG !== null ? ` (ALLOW_BACKLOG=${ALLOW_BACKLOG}${bypass ? ', size guards bypassed' : ', too small to bypass'})` : ''}`)
/* ⚠️ PRINTED WHENEVER THERE IS A TAIL AT ALL — on a refusal, on a dry run, and on a run that is about
 * to be waved through by ALLOW_BACKLOG. ⛔ THE BYPASS CASE IS THE ONE THAT MATTERS MOST: that is the
 * run that is about to DELETE these rows, and it is the last moment anyone can look at them. */
const oldTail = cand.filter(e => ageDays(e.event_date) > MAX_BACKLOG_DAYS)
if (oldTail.length) {
  reportOldTail(oldTail, bypass
    ? `ABOUT TO BE DELETED under ALLOW_BACKLOG — candidates older than ${MAX_BACKLOG_DAYS} days`
    : `THE ROWS THIS REFUSAL IS ABOUT — candidates older than ${MAX_BACKLOG_DAYS} days`)
}
const oldDates = new Set(oldTail.map(e => e.event_date)).size
if (!bypass) {
  /* ⚠️ THE SIZE OF THE OLD TAIL, NOT THE AGE OF ITS OLDEST ROW — see the header for why that one row
   * could jam this job for ever. The age is still printed, because it is what an operator reads first. */
  if (oldTail.length > MAX_OLD_TAIL_ROWS || oldDates > MAX_OLD_TAIL_DATES) fail(`${oldTail.length} candidate(s) across ${oldDates} date(s) are older than ${MAX_BACKLOG_DAYS} days (oldest ${oldest}, ${ageDays(oldest)} days ago), beyond the limit of ${MAX_OLD_TAIL_ROWS} rows / ${MAX_OLD_TAIL_DATES} dates — that is the shape of a long outage, or of linked rows that have stopped being excluded. Nothing deleted. Read the rows printed above FIRST: if any of them belongs to one of the four linked trucks the exclusion is what needs fixing and NOTHING should be deleted. Only once they are accounted for, re-run with ALLOW_BACKLOG=${cand.length}.`)
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
