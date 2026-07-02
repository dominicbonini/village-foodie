// scripts/backfill-venue-id.ts
// Backfill discovery_events.venue_id for null-venue events via the shared findVenue matcher
// (lib/venue-matcher.ts — the same resolver inbound-schedule uses). Recovers map coordinates for
// events that were written WITHOUT a venue link (run-scraper.js Pass-A DB-mirror + Manual Entry).
//
// EMIT-ONLY by default — this script NEVER writes to the database. It reads discovery_events +
// venues, computes matches in JS, and writes three artifacts to scripts/backfill-output/:
//   1. backfill-venue-id.sql        — guarded per-event UPDATEs, HIGH-confidence only. YOU run this by
//                                     hand in the Supabase SQL editor after review.
//   2. backfill-snapshot-<ts>.json  — { generatedAt, appliedIds:[...], updates:[...] } for reversal.
//   3. review-low-confidence.csv    — the LOW-confidence matches (NOT in the .sql) for manual review.
//                                     Pimp My Fish's "Off The Beaten Truck" low matches are flagged.
//
// Reversal (fully reversible — every target is currently venue_id IS NULL, so nothing is overwritten):
//   UPDATE discovery_events SET venue_id = NULL WHERE id = ANY('{<appliedIds from snapshot>}');
//
// Scope: FUTURE events only (event_date >= today) — that is all the map reads. Past events are left
// untouched (harmless, and out of scope for the map-coords fix).
//
// Usage:
//   npx tsx scripts/backfill-venue-id.ts            # emit artifacts only (default; no DB writes)
//   npx tsx scripts/backfill-venue-id.ts --apply    # ALSO apply the high-confidence UPDATEs directly
//                                                    # (optional convenience; the .sql is the by-hand path)

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { findVenue, type VenueRow } from '../lib/venue-matcher'

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

// SQL string literal escape (single-quote doubling) — venue_id/id are uuids but names go in comments.
const sq = (s: string) => s.replace(/'/g, "''")
const csvCell = (s: string) => `"${(s ?? '').replace(/"/g, '""')}"`

async function main() {
  const apply = process.argv.includes('--apply')
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

  const high: { e: EventRow; v: VenueRow }[] = []
  const low: { e: EventRow; v: VenueRow }[] = []
  const none: EventRow[] = []

  for (const e of rows) {
    const m = findVenue(e.venue_name, e.village, venues)
    // Only accept a match that carries coordinates — a venue_id with null lat/long buys no map pin.
    if (!m.venue || m.venue.latitude == null || m.venue.longitude == null) {
      if (!m.venue) none.push(e)
      else none.push(e) // venue-with-null-coords: treat as unusable (dataset shows 0 of these today)
      continue
    }
    if (m.confidence === 'high') high.push({ e, v: m.venue })
    else low.push({ e, v: m.venue })
  }

  // ── 1. backfill-venue-id.sql (HIGH only, guarded + idempotent) ──
  const sqlLines = [
    `-- backfill-venue-id.sql — generated ${new Date().toISOString()}`,
    `-- ${high.length} high-confidence venue links. Guarded (AND venue_id IS NULL) → idempotent + safe to re-run.`,
    `-- Reversal: UPDATE discovery_events SET venue_id = NULL WHERE id = ANY('{<appliedIds from snapshot json>}');`,
    `BEGIN;`,
    ...high.map(({ e, v }) =>
      `UPDATE discovery_events SET venue_id = '${v.id}' WHERE id = '${e.id}' AND venue_id IS NULL;` +
      `  -- ${sq(e.truck_name ?? '')} @ ${sq(e.venue_name ?? '')} -> ${sq(v.name)}`,
    ),
    `COMMIT;`,
    '',
  ]
  writeFileSync(`${OUT_DIR}/backfill-venue-id.sql`, sqlLines.join('\n'))

  // ── 2. snapshot json (reversibility) ──
  const snapshot = {
    generatedAt: new Date().toISOString(),
    scope: `discovery_events WHERE venue_id IS NULL AND event_date >= ${today}`,
    counts: { total: rows.length, high: high.length, low: low.length, none: none.length },
    appliedIds: high.map(({ e }) => e.id),
    updates: high.map(({ e, v }) => ({
      event_id: e.id, venue_id: v.id, truck_name: e.truck_name, venue_name: e.venue_name, matched: v.name,
    })),
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  writeFileSync(`${OUT_DIR}/backfill-snapshot-${stamp}.json`, JSON.stringify(snapshot, null, 2))

  // ── 3. review-low-confidence.csv (95 low; PMF "Off The Beaten Truck" flagged) ──
  const csvHeader = 'flag,event_id,event_date,truck_name,venue_name,village,matched_venue_id,matched_venue_name,matched_village'
  const csvRows = low.map(({ e, v }) => {
    const isPmf = (e.truck_name ?? '').toLowerCase().includes('pimp')
    const isOtbt = (e.venue_name ?? '').toLowerCase().includes('off the beaten truck')
    const flag = isPmf && isOtbt ? 'PMF_OTBT_REVIEW' : (isPmf ? 'PMF' : 'low')
    return [
      flag, e.id, e.event_date, e.truck_name ?? '', e.venue_name ?? '', e.village ?? '',
      v.id, v.name, v.village ?? '',
    ].map(c => csvCell(String(c))).join(',')
  })
  writeFileSync(`${OUT_DIR}/review-low-confidence.csv`, [csvHeader, ...csvRows].join('\n') + '\n')

  console.log(`Scope: ${rows.length} null-venue future events (>= ${today})`)
  console.log(`  HIGH (in .sql): ${high.length}`)
  console.log(`  LOW  (in .csv): ${low.length}`)
  console.log(`  NONE (no coord-bearing venue): ${none.length}`)
  console.log(`Artifacts written to ${OUT_DIR}/`)
  console.log(`  - backfill-venue-id.sql        (run by hand)`)
  console.log(`  - backfill-snapshot-${stamp}.json`)
  console.log(`  - review-low-confidence.csv`)

  if (apply) {
    console.log(`\n--apply: writing ${high.length} high-confidence links directly...`)
    let ok = 0
    for (const { e, v } of high) {
      const { error } = await sb
        .from('discovery_events')
        .update({ venue_id: v.id })
        .eq('id', e.id)
        .is('venue_id', null)
      if (error) console.warn(`  fail ${e.id}: ${error.message}`)
      else ok++
    }
    console.log(`Applied ${ok}/${high.length}.`)
  } else {
    console.log(`\n(emit-only — no DB writes. Run the .sql by hand, or re-run with --apply.)`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
