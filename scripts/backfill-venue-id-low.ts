// scripts/backfill-venue-id-low.ts
// Triage the LOW-confidence venue matches (the 95 findVenue() left as 'low') into two tiers so
// low-confidence rows never blind-plot a truck at the wrong location on the public map:
//
//   LIKELY-CORRECT (approve) → scripts/backfill-output/backfill-low-approved.sql
//     - exact normalised name match (matcher only marked it 'low' because the name is multi-branch), OR
//     - the event village AGREES with the matched venue's village (token-subset either direction).
//       A right-town multi-branch match (e.g. "foodPark (CB1)" -> "foodPark (Cambridge)") is safe.
//
//   SUSPICIOUS (eyeball) → scripts/backfill-output/review-suspicious.csv
//     - village DISAGREES (event village present, venue village present, neither is a subset of the other), OR
//     - bare/ambiguous event name where the matcher picked a MORE-SPECIFIC sub-venue (matched name strictly
//       contains the event name, e.g. "Off The Beaten Truck" -> "...The Common") — could be the wrong branch, OR
//     - event has NO village to corroborate a non-exact name match.
//   Each suspicious row carries a `reason`.
//
// EMIT-ONLY — never writes to the DB. Same guarded shape as the high-confidence file
// (UPDATE … WHERE id=… AND venue_id IS NULL, BEGIN;…COMMIT;). Reversal: every target is still
// venue_id IS NULL, so revert = UPDATE … SET venue_id = NULL WHERE id = ANY('{approvedIds}').
//
// Usage:  npx tsx scripts/backfill-venue-id-low.ts

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { findVenue, toks, normName, type VenueRow } from '../lib/venue-matcher'
// 🔴 The same two refusal guards the high-confidence script uses — ONE implementation, imported twice,
// so the two scripts cannot drift. lib/venue-matcher.ts is unchanged.
import { applyGuards, buildCategoryIndex, buildSentinelSet } from './linking-guards'
// 🔴 GUARD THREE — FLAG ONLY. It refuses nothing and substitutes nothing; see linking-guards.ts.
import { buildPostcodeIndex, checkPostcode, POSTCODE_CONFIRM_KM, POSTCODE_FLAG_KM } from './linking-guards'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const OUT_DIR = 'scripts/backfill-output'

type EventRow = {
  id: string
  event_date: string
  truck_name: string | null
  venue_name: string | null
  village: string | null
  ai_notes: string | null
}

const sq = (s: string) => s.replace(/'/g, "''")
const csvCell = (s: string) => `"${(s ?? '').replace(/"/g, '""')}"`

// Do the two villages agree? token-subset in either direction (so "Clare" ≈ "Clare Castle Country Park").
function villagesAgree(evVillage: string | null, venueVillage: string | null): boolean {
  const a = toks(evVillage), b = toks(venueVillage)
  if (a.length === 0 || b.length === 0) return false
  return a.every(t => b.includes(t)) || b.every(t => a.includes(t))
}

async function main() {
  const today = new Date().toISOString().slice(0, 10)
  mkdirSync(OUT_DIR, { recursive: true })

  const { data: allVenues } = await sb
    .from('venues')
    .select('id, name, village, latitude, longitude, postcode') as { data: VenueRow[] | null }

  const { data: events } = await sb
    .from('discovery_events')
    .select('id, event_date, truck_name, venue_name, village, ai_notes')
    .is('venue_id', null)
    .gte('event_date', today)
    .order('event_date') as { data: EventRow[] | null }

  const venues = allVenues ?? []
  const rows = events ?? []

  // Derived from the live table on every run — see scripts/linking-guards.ts.
  const categories = buildCategoryIndex(venues)
  const sentinels = buildSentinelSet(venues)

  const approved: { e: EventRow; v: VenueRow }[] = []
  const suspicious: { e: EventRow; v: VenueRow; reason: string }[] = []
  // 🔴 Three buckets, never merged into `suspicious`: a REFUSAL is a different statement from "eyeball
  // this", and an UNCHECKABLE coordinate is a different statement from a bad one.
  const refusedCategory: { e: EventRow; v: VenueRow; reason: string }[] = []
  const refusedBadCoord: { e: EventRow; v: VenueRow; reason: string }[] = []
  const heldUncheckable: { e: EventRow; v: VenueRow }[] = []

  for (const e of rows) {
    const m = findVenue(e.venue_name, e.village, venues)
    if (!m.venue || m.confidence !== 'low') continue           // only the low-confidence rows
    if (m.venue.latitude == null || m.venue.longitude == null) continue // no coords → skip (not our tier)

    // ── THE GUARDS, BEFORE ANY TRIAGE. A category target cannot be rescued by village agreement — that
    //    is precisely the case the Pizza Mondo foodPark error came from.
    const g = applyGuards(m.venue, categories, sentinels)
    if (!g.ok) {
      const rec = { e, v: m.venue, reason: g.reason }
      if (g.guard === 'CATEGORY') refusedCategory.push(rec); else refusedBadCoord.push(rec)
      continue
    }
    if (g.coordState === 'UNCHECKABLE') { heldUncheckable.push({ e, v: m.venue }); continue }

    const v = m.venue
    const exactName = normName(e.venue_name) === normName(v.name)
    const evVilToks = toks(e.village)
    const agree = villagesAgree(e.village, v.village)
    // "matcher picked a MORE-specific sub-venue": venue name strictly contains the (shorter) event name.
    const evTok = new Set(toks(e.venue_name))
    const vTok = new Set(toks(v.name))
    const subVenue = !exactName && evTok.size > 0 &&
      [...evTok].every(t => vTok.has(t)) && vTok.size > evTok.size
    // How many venues could this bare event name expand to? >1 ⇒ the branch is ambiguous and village
    // agreement does NOT disambiguate (e.g. two "Off The Beaten Truck - …" sites in the same town).
    const branchCount = subVenue
      ? venues.filter(v2 => { const t = new Set(toks(v2.name)); return t.size > 0 && [...evTok].every(x => t.has(x)) }).length
      : 0

    // ---- APPROVE (exact name = same place, just multi-branch label) ----
    if (exactName) { approved.push({ e, v }); continue }

    // ---- SUSPICIOUS: ambiguous sub-venue takes PRIORITY over village agreement ----
    // A bare name that expands to one of several branches could plot the wrong branch even in the right town.
    if (subVenue && branchCount > 1) {
      suspicious.push({ e, v, reason: `bare name -> 1 of ${branchCount} branches ("${e.venue_name}" -> "${v.name}") — could be the wrong branch` })
      continue
    }

    // ---- APPROVE: right town corroborates a non-exact / single-branch match ----
    if (agree) { approved.push({ e, v }); continue }
    if (subVenue && branchCount === 1) { approved.push({ e, v }); continue } // only one possible branch → forced

    // ---- SUSPICIOUS (remaining) ----
    let reason: string
    if (evVilToks.length > 0 && toks(v.village).length > 0 && !agree) {
      reason = `village mismatch: event "${e.village}" vs venue "${v.village}"`
    } else if (evVilToks.length === 0) {
      reason = `no event village to corroborate non-exact name match ("${e.venue_name}" -> "${v.name}")`
    } else {
      reason = `non-exact name, village uncorroborated ("${e.venue_name}" -> "${v.name}")`
    }
    suspicious.push({ e, v, reason })
  }

  // ── backfill-low-approved.sql ──
  const sqlLines = [
    `-- backfill-low-approved.sql — generated ${new Date().toISOString()}`,
    `-- ${approved.length} LOW-confidence but LIKELY-CORRECT venue links (exact-name multi-branch, or village agrees).`,
    `-- Guarded (AND venue_id IS NULL) → idempotent. Reversal: SET venue_id = NULL WHERE id = ANY('{appliedIds}').`,
    `BEGIN;`,
    ...approved.map(({ e, v }) =>
      `UPDATE discovery_events SET venue_id = '${v.id}' WHERE id = '${e.id}' AND venue_id IS NULL;` +
      `  -- ${sq(e.truck_name ?? '')} @ ${sq(e.venue_name ?? '')} [${sq(e.village ?? '')}] -> ${sq(v.name)} [${sq(v.village ?? '')}]`,
    ),
    `COMMIT;`,
    '',
  ]
  writeFileSync(`${OUT_DIR}/backfill-low-approved.sql`, sqlLines.join('\n'))

  // ── snapshot ──
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  writeFileSync(`${OUT_DIR}/backfill-low-snapshot-${stamp}.json`, JSON.stringify({
    generatedAt: new Date().toISOString(),
    scope: `LOW-confidence discovery_events WHERE venue_id IS NULL AND event_date >= ${today}`,
    counts: { low_total: approved.length + suspicious.length, approved: approved.length, suspicious: suspicious.length },
    approvedIds: approved.map(({ e }) => e.id),
    approved: approved.map(({ e, v }) => ({ event_id: e.id, venue_id: v.id, truck_name: e.truck_name, venue_name: e.venue_name, village: e.village, matched: v.name, matched_village: v.village })),
    suspicious: suspicious.map(({ e, v, reason }) => ({ event_id: e.id, venue_name: e.venue_name, village: e.village, proposed_venue: v.name, proposed_village: v.village, reason })),
  }, null, 2))

  // ── review-suspicious.csv ──
  const csvHeader = 'event_id,event_date,truck_name,venue_name,village,proposed_venue_id,proposed_venue,proposed_village,reason'
  const csvRows = suspicious.map(({ e, v, reason }) => [
    e.id, e.event_date, e.truck_name ?? '', e.venue_name ?? '', e.village ?? '', v.id, v.name, v.village ?? '', reason,
  ].map(c => csvCell(String(c))).join(','))
  writeFileSync(`${OUT_DIR}/review-suspicious.csv`, [csvHeader, ...csvRows].join('\n') + '\n')

  // ── guard outputs — LOUD, and separate from the suspicious CSV ──
  const refHeader = 'guard,event_id,event_date,truck_name,venue_name,village,refused_venue_id,refused_venue,refused_village,reason'
  const refRows = [
    ...refusedCategory.map(r => ['CATEGORY', r.e.id, r.e.event_date, r.e.truck_name ?? '', r.e.venue_name ?? '', r.e.village ?? '', r.v.id, r.v.name, r.v.village ?? '', r.reason]),
    ...refusedBadCoord.map(r => ['BAD_COORD', r.e.id, r.e.event_date, r.e.truck_name ?? '', r.e.venue_name ?? '', r.e.village ?? '', r.v.id, r.v.name, r.v.village ?? '', r.reason]),
  ].map(c => c.map(x => csvCell(String(x))).join(','))
  writeFileSync(`${OUT_DIR}/guard-refusals-low.csv`, [refHeader, ...refRows].join('\n') + '\n')

  const candMap = new Map<string, { venue_name: string; village: string; events: number; trucks: Set<string> }>()
  for (const r of [...refusedCategory, ...refusedBadCoord]) {
    const k = `${r.e.venue_name ?? ''}|${r.e.village ?? ''}`
    const c = candMap.get(k) ?? { venue_name: r.e.venue_name ?? '', village: r.e.village ?? '', events: 0, trucks: new Set<string>() }
    c.events++; if (r.e.truck_name) c.trucks.add(r.e.truck_name); candMap.set(k, c)
  }
  writeFileSync(`${OUT_DIR}/create-candidates-low.csv`,
    ['venue_name,village,events,trucks',
      ...[...candMap.values()].sort((a, b) => b.events - a.events)
        .map(c => [c.venue_name, c.village, c.events, [...c.trucks].join('; ')].map(x => csvCell(String(x))).join(','))].join('\n') + '\n')

  writeFileSync(`${OUT_DIR}/held-uncheckable-coord-low.csv`,
    ['event_id,event_date,truck_name,venue_name,village,venue_id,venue,venue_village',
      ...heldUncheckable.map(({ e, v }) => [e.id, e.event_date, e.truck_name ?? '', e.venue_name ?? '', e.village ?? '', v.id, v.name, v.village ?? ''].map(x => csvCell(String(x))).join(','))].join('\n') + '\n')

  // ── GUARD THREE — POSTCODE DISAGREEMENT. 🔴 REPORT ONLY: this block changes no bucket above, refuses
  //    no link and writes no coordinate anywhere. It resolves each DISTINCT postcode once and reports.
  const pcCandidates = [...approved.map(x => ({ e: x.e, v: x.v })), ...suspicious.map(x => ({ e: x.e, v: x.v }))]
  const pcIndex = await buildPostcodeIndex(pcCandidates.map(c => c.e.ai_notes))
  const pcBuckets = { CONFIRMED: 0, NOTED: 0, FLAGGED: 0, UNCHECKED: 0 }
  const pcUncheckedWhy: Record<string, number> = {}
  const pcFlagged: string[][] = []
  for (const { e, v } of pcCandidates) {
    const r = checkPostcode(e.ai_notes, v, pcIndex)
    pcBuckets[r.state]++
    if (r.state === 'UNCHECKED') pcUncheckedWhy[r.reason] = (pcUncheckedWhy[r.reason] ?? 0) + 1
    else if (r.state === 'FLAGGED') pcFlagged.push([
      e.id, e.event_date, e.truck_name ?? '', e.venue_name ?? '', e.village ?? '', r.postcode,
      r.km.toFixed(2), String(r.pcLat), String(r.pcLng), v.id, v.name, String(v.latitude), String(v.longitude),
    ])
  }
  writeFileSync(`${OUT_DIR}/guard-postcode-flags-low.csv`, [
    'event_id,event_date,truck_name,event_venue_name,village,postcode,km_apart,postcode_lat,postcode_lng,matched_venue_id,matched_venue,venue_lat,venue_lng',
    ...pcFlagged.map(r => r.map(x => csvCell(String(x))).join(',')),
  ].join('\n') + '\n')
  console.log(`\n── GUARD THREE (postcode, FLAG ONLY — no link changed) over ${pcCandidates.length} candidate links ──`)
  console.log(`   ✅ CONFIRMED (< ${POSTCODE_CONFIRM_KM} km) : ${pcBuckets.CONFIRMED}`)
  console.log(`   ·  NOTED     (${POSTCODE_CONFIRM_KM}–${POSTCODE_FLAG_KM} km) : ${pcBuckets.NOTED}`)
  console.log(`   🔴 FLAGGED   (> ${POSTCODE_FLAG_KM} km)   : ${pcBuckets.FLAGGED}  (guard-postcode-flags-low.csv)`)
  console.log(`   ⚠️  UNCHECKED — NOT a pass       : ${pcBuckets.UNCHECKED}  ${JSON.stringify(pcUncheckedWhy)}`)
  console.log(`   postcodes.io: ${pcIndex.stats.distinct} distinct postcodes, ${pcIndex.stats.resolved} resolved, ${pcIndex.stats.apiCalls} API call(s)${pcIndex.stats.outage ? ' 🔴 OUTAGE — batches unresolved, counted UNCHECKED' : ''}`)
  if (pcIndex.stats.unresolved.length) console.log(`   unresolved: ${JSON.stringify(pcIndex.stats.unresolved)}`)

  console.log(`🔴 REFUSED — category target: ${refusedCategory.length}  (guard-refusals-low.csv)`)
  for (const r of refusedCategory) console.log(`     ${r.e.event_date} ${r.e.truck_name} @ "${r.e.venue_name}" [${r.e.village ?? '—'}] -> "${r.v.name}" :: ${r.reason}`)
  console.log(`🔴 REFUSED — bad coordinate on target: ${refusedBadCoord.length}`)
  for (const r of refusedBadCoord) console.log(`     ${r.e.event_date} ${r.e.truck_name} @ "${r.e.venue_name}" -> "${r.v.name}" :: ${r.reason}`)
  console.log(`⚠️  HELD — coordinate UNCHECKABLE (no postcode): ${heldUncheckable.length}  (held-uncheckable-coord-low.csv)`)
  console.log(`create-candidates emitted: ${candMap.size}  (create-candidates-low.csv)`)
  console.log(`LOW-confidence rows triaged: ${approved.length + suspicious.length}`)
  console.log(`  APPROVE (backfill-low-approved.sql): ${approved.length}`)
  console.log(`  SUSPICIOUS (review-suspicious.csv):  ${suspicious.length}`)
  console.log(`\nSuspicious detail:`)
  for (const { e, v, reason } of suspicious) {
    console.log(`  - "${e.venue_name}" [${e.village ?? '—'}]  ->  "${v.name}" [${v.village ?? '—'}]  (${e.truck_name})`)
    console.log(`      ${reason}`)
  }
  console.log(`\n(emit-only — no DB writes.)`)
}

main().catch(e => { console.error(e); process.exit(1) })
