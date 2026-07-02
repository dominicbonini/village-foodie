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
    .select('id, event_date, truck_name, venue_name, village')
    .is('venue_id', null)
    .gte('event_date', today)
    .order('event_date') as { data: EventRow[] | null }

  const venues = allVenues ?? []
  const rows = events ?? []

  const approved: { e: EventRow; v: VenueRow }[] = []
  const suspicious: { e: EventRow; v: VenueRow; reason: string }[] = []

  for (const e of rows) {
    const m = findVenue(e.venue_name, e.village, venues)
    if (!m.venue || m.confidence !== 'low') continue           // only the 95 low-confidence rows
    if (m.venue.latitude == null || m.venue.longitude == null) continue // no coords → skip (not our tier)

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
