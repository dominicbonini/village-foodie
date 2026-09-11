// app/api/discovery/ingest/route.ts
//
// 🔴 THE HTTP FACE OF THE GATE — nothing more. The scraper's Pass A and the hatches-up import POST here
// instead of writing `discovery_events` themselves; the route hands the rows to `admitDiscoveryEvents`
// (lib/discovery-gate) and returns one outcome per row. No matching, no dedup and no write logic lives
// in this file, so a second caller cannot drift from the first.
//
// AUTH: the same shared secret /api/inbound-schedule uses (INBOUND_SCHEDULE_SECRET), sent in the body.
// A missing or wrong secret is 401 and NOTHING is written. There is no per-user session — this is a
// machine endpoint called from GitHub Actions.
//
// ⚠️ DELIBERATELY NOT /api/inbound-schedule. That route also BRIDGES matching rows into `truck_events`
// and emails the operator. Pass A's ~750 rows a day must never enter that loop; this route has no
// bridge, no email, and never reads or writes `truck_events`.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { admitDiscoveryEvents, type IncomingEvent } from '@/lib/discovery-gate'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const SECRET = process.env.INBOUND_SCHEDULE_SECRET
const MAX_ROWS = 200   // callers chunk; a 750-row day is ~4 requests, each well inside a serverless budget

function toISODate(v: string): string | null {
  if (!v) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  const p = String(v).split('/'); if (p.length !== 3) return null
  let y = parseInt(p[2]); if (y < 100) y += 2000
  return `${y}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!SECRET || !body || body.secret !== SECRET) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const events = Array.isArray(body.events) ? body.events : []
  if (events.length === 0) return NextResponse.json({ error: 'No events provided' }, { status: 400 })
  if (events.length > MAX_ROWS) return NextResponse.json({ error: `Too many rows (${events.length} > ${MAX_ROWS}); chunk the request` }, { status: 413 })

  const rows: IncomingEvent[] = []
  const dropped: { row: unknown; reason: string }[] = []
  for (const e of events) {
    const date = toISODate(e?.event_date)
    if (!date) { dropped.push({ row: e, reason: 'no parseable event_date' }); continue }
    if (!e?.truck_name) { dropped.push({ row: e, reason: 'no truck_name' }); continue }
    rows.push({ event_date: date, start_time: e.start_time || null, end_time: e.end_time || null, truck_name: String(e.truck_name),
      venue_name: e.venue_name || null, village: e.village || null, event_notes: e.event_notes || null, source: e.source || null, ai_notes: e.ai_notes || null })
  }
  const dryRun = body.dry_run === true
  const result = await admitDiscoveryEvents(supabase, rows, { dryRun })
  const failed = result.outcomes.filter(o => o.wrote === 'failed').length
  // 🔴 A PARTIAL FAILURE IS NOT 200. The scraper's assertInboundOk treats any non-2xx as a failure it
  // must record, which is exactly right: a batch where 3 of 100 rows did not land is a red run.
  const status = failed > 0 ? 207 : 200
  return NextResponse.json({ ok: failed === 0, dryRun, received: events.length, dropped, written: rows.length - failed, failed,
    venuesCreated: result.created, superseded: result.superseded, markFailed: result.markFailed, rejectedByR5: result.rejectedByR5,
    outcomes: result.outcomes }, { status })
}
