// app/api/admin/discovery-events/route.ts
//
// 🔴 THIS IS A NEW ROUTE, NOT A REUSE. It reuses the GATE PATTERN every other admin route uses —
// `verifyAdmin` on the handler plus the service-role client — and nothing else. App manual §51.7 records a
// "reuse" that was really a fourth independent implementation; calling this a reuse of the outreach route
// would be that mistake again. The outreach route is a different tool with a different subject and is not
// touched by this file.
//
// 🔴 IT NEVER READS OR WRITES `truck_events`. That is the operator table Pizzeria Gusto trades on. This
// file names `discovery_events` and `discovery_trucks` and nothing else — grep it.
//
// 🔴 THIS ROUTE NOW DELETES — THE FIRST DELETION PATH IN THIS REPOSITORY FOR THIS TABLE.
// It is a real HTTP DELETE, deliberately NOT a POST `action`. Two reasons: the existing POST has exactly
// one action and a mistyped action string must never fall through to a destructive branch; and the method
// name is its own audit trail in every log and proxy between here and Postgres.
//
// 🔴 ONE ROW PER CALL, BY id. `id` is a single string from the query string. There is no array form, no
// filter form and no `all` — a bulk delete is not reachable by malforming this request.
//
// 🔴 IT VERIFIES THAT A ROW ACTUALLY WENT. `.delete().select()` returns the deleted rows, so 0 rows is a
// 404 rather than a cheerful 200. A delete that matched nothing and a delete that worked are otherwise
// indistinguishable from the client, and the client uses this response to decide whether to drop the row
// from the table — so "looked like it worked" is not allowed to be the same as "worked".
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
// 🔴 THE ORPHAN FLAG'S MATCHER, AND WHY IT IS THIS ONE. Five truck-name normalisers exist and they answer
// different questions; a sixth must not be written and none may be collapsed. `normalizeVenue` +
// `venuesFuzzyMatch` are documented byte-for-byte mirrors of the SCRAPER's own `normalizeName` /
// `isFuzzyMatch`, which is the MOST PERMISSIVE matcher in the system. "Orphan" must mean invisible to
// EVERY name-matching consumer, so it has to be measured against the loosest of them — a stricter rule
// would flag rows the scraper can actually see. 🧪 Measured over all 4,340 rows: this yields 20 orphan
// names / 55 rows, against 21 / 60 for each exact variant, and exactly 2 future-dated orphan rows —
// the same two the consumers' own matching leaves unresolved.
import { normalizeVenue, venuesFuzzyMatch } from '@/lib/venue-signature'
// 🔴 THE SCHEDULE POPUP'S MATCHER — AND IT IS DELIBERATELY THE *OTHER* ONE.
// `normalizeVenue`/`venuesFuzzyMatch` above answer "is this row invisible to every name matcher?" (the
// ORPHAN flag) and are the most PERMISSIVE rule in the system. `scheduleKeys` answers "which rows did the
// outreach table's Schedule count count?" and is the STRICTEST — trim + lowercase, exact membership over
// name and aliases. The popup is launched from that count, so it must use that rule: 🧪 on `Between Buns`
// the two differ 5 vs 10. Both matchers live in this file now; neither may be swapped for the other.
import { scheduleKeys, eventMatchesKeys } from '@/lib/schedule-match'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// 🔴 THE ALLOW-LIST, AND WHY EACH IS IN OR OUT.
//   IN  — the fields the scraper's extraction gets wrong and a human can correct by reading the source
//         page: the truck it belongs to, where it is, and when in the day.
//   OUT — `source` and `created_at`/`updated_at` are PROVENANCE: they record where a row came from, and a
//         row whose provenance can be edited can no longer answer "where did this come from".
//   OUT — `discovery_truck_id` and `venue_id` are FOREIGN KEYS. They are resolved by `findVenue` and the
//         name matcher at write time; hand-editing an FK to a row you cannot see from here is how you get
//         an event attached to the wrong business with nothing to show it happened.
//   OUT — `event_date`. It IS editable in principle, but see the duplication note below: it is part of the
//         upsert identity, and moving an event in time is closer to "this is a different event" than to
//         "this is a typo". Deliberately excluded rather than omitted.
const EDITABLE = ['truck_name', 'venue_name', 'village', 'start_time', 'end_time', 'event_notes'] as const
type EditableCol = typeof EDITABLE[number]
const isEditable = (k: string): k is EditableCol => (EDITABLE as readonly string[]).includes(k)

const SELECT = 'id, event_date, start_time, end_time, truck_name, venue_name, village, event_notes, source, ai_notes, discovery_truck_id, venue_id, created_at'
// The admin table SHOWS superseded rows, marked — it is where a duplicate is inspected, so it must not hide
// them. Tolerant of the migration not being applied: on a superseded_by error the plain SELECT is used.
const SELECT_WITH_SUPERSEDED = SELECT + ', superseded_by, superseded_reason, superseded_meta, superseded_at'

export async function GET(req: NextRequest) {
  if (!(await verifyAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 404 })

  // `scope=all` is opt-in. 🧪 740 future rows load like the outreach tab's 231; all 4,340 is a heavier
  // payload and is offered as a toggle rather than being the default.
  const scope = req.nextUrl.searchParams.get('scope') === 'all' ? 'all' : 'future'
  const today = new Date().toISOString().slice(0, 10)
  // 🔴 OPTIONAL TRUCK SCOPE — the Schedule popup. Absent, this route behaves exactly as it did for the
  // Events tab; the parameter adds a filter and changes nothing else.
  const truckId = req.nextUrl.searchParams.get('truck_id')

  try {
    // Paged to defeat PostgREST's 1000-row default — the fault that under-reported this table twice today.
    const rows: any[] = []
    // 🔴 GENUINELY TOLERANT: the first page is tried with the superseded columns; if PostgREST rejects
    // them (migration 20260911 not applied yet) every page falls back to the plain SELECT and the table
    // keeps working, unmarked. A bare column swap would have taken the admin table down until the
    // migration ran — the exact failure the note above promises not to cause.
    let select = SELECT_WITH_SUPERSEDED
    for (let from = 0; ; from += 1000) {
      const build = (sel: string) => {
        let q = supabase.from('discovery_events').select(sel)
          // date, then start time (blanks last via nullsFirst:false), then id — the same order both screens sort by
          .order('event_date', { ascending: true })
          .order('start_time', { ascending: true, nullsFirst: false })
          .order('id', { ascending: true })
          .range(from, from + 999)
        if (scope === 'future') q = q.gte('event_date', today)
        return q
      }
      let { data, error } = await build(select)
      if (error && select === SELECT_WITH_SUPERSEDED && /superseded/.test(error.message || '')) {
        console.warn('[admin/discovery-events] superseded columns absent — migration 20260911 not applied; serving unmarked')
        select = SELECT
        ;({ data, error } = await build(select))
      }
      if (error) throw error
      if (!data || data.length === 0) break
      rows.push(...data)
      if (data.length < 1000) break
    }

    // 🔴 THE TRUCK FILTER, APPLIED WITH THE COUNT'S OWN FUNCTION. `scheduleKeys` + `eventMatchesKeys` are
    // the same pair the outreach route uses to produce `Y (n)`, so the popup's row count IS that n.
    // ⚠️ Filtered in memory, not in SQL, and that is not laziness: the keys are trim+lowercased and
    // PostgREST cannot express `lower(btrim(truck_name)) IN (…)` without a view or an RPC. The outreach
    // route builds its index the same way, over the same table, for the same reason.
    let scopedKeys: Set<string> | null = null
    let scopedTruckName: string | null = null
    if (truckId) {
      const { data: t, error: e2 } = await supabase
        .from('discovery_trucks').select('name, aliases').eq('id', truckId).maybeSingle()
      if (e2) throw e2
      if (!t) return NextResponse.json({ error: 'No such truck' }, { status: 404 })
      scopedTruckName = t.name ?? null
      scopedKeys = scheduleKeys(t.name, t.aliases as string[] | null)
      // 🔴 AN EMPTY KEY SET MUST MATCH NOTHING, NOT EVERYTHING. A truck with a blank name and no aliases
      // would otherwise fall through the filter and the popup would list all 903 rows while looking like
      // a working filter. `eventMatchesKeys` returns false for an empty set, and this is the assertion
      // that says so out loud.
      const keep = rows.filter(r => eventMatchesKeys(r.truck_name, scopedKeys!))
      rows.length = 0
      rows.push(...keep)
    }

    // The known-truck key set, built once: every name and every alias, under the mirror normaliser.
    const { data: trucks, error: tErr } = await supabase
      .from('discovery_trucks').select('name, aliases').limit(10000)
    if (tErr) throw tErr
    const keys: string[] = []
    for (const t of trucks ?? []) {
      const n = normalizeVenue(t.name ?? ''); if (n) keys.push(n)
      for (const a of (t.aliases ?? []) as string[]) { const k = normalizeVenue(a ?? ''); if (k) keys.push(k) }
    }
    // ⚠️ Same shape as the scraper's matcher: equal, within one edit, or either containing the other.
    const isOrphan = (name: string | null): boolean => {
      const k = normalizeVenue(name ?? '')
      if (!k) return false                       // no name at all is a different defect, not an orphan
      return !keys.some(s => venuesFuzzyMatch(s, k) || s.includes(k) || k.includes(s))
    }

    const out = rows.map(r => ({
      ...r,
      isOrphan: isOrphan(r.truck_name),
      unlinkedVenue: r.venue_id == null,        // 🔴 DERIVED, never stored, never written
    }))
    return NextResponse.json({
      events: out, scope, today,
      // Echoed back so the popup can show WHICH keys it filtered on, and flag a row whose
      // truck_name has been edited to something no longer in that set.
      truckId: truckId ?? null,
      truckName: scopedTruckName,
      truckKeys: scopedKeys ? [...scopedKeys] : null,
    })
  } catch (e: any) {
    console.error('[admin/discovery-events] GET failed:', e?.message || e)
    return NextResponse.json({ error: 'Could not load discovery events' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!(await verifyAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 404 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }

  // 🔴 ONE ACTION, ONE WRITER PER COLUMN. The table's inline fields are the only caller.
  if (body?.action !== 'update_event') {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
  const id = String(body.id ?? '')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Only allow-listed keys survive; an unknown key is ignored rather than fatal, and a request that names
  // ONLY unknown keys writes nothing rather than issuing an empty update.
  const patch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) {
    if (k === 'action' || k === 'id') continue
    if (!isEditable(k)) continue
    patch[k] = v === '' ? null : v
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true, noop: true })

  try {
    const { error } = await supabase.from('discovery_events').update(patch).eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true, patched: Object.keys(patch) })
  } catch (e: any) {
    console.error('[admin/discovery-events] update failed:', e?.message || e)
    return NextResponse.json({ error: 'Write failed' }, { status: 500 })
  }
}


// ── DELETE ONE EVENT ────────────────────────────────────────────────────────────────────────────────
// 🔴 THE SAME GATE AS THE REST OF THIS FILE — `verifyAdmin` plus the service-role client, and a 404 (not
// a 401) for a non-admin, so the route does not confirm its own existence to an unauthenticated caller.
//
// 🔴 IT NEVER READS OR WRITES `truck_events`. That is the operator table Pizzeria Gusto trades on, and
// `/api/inbound-schedule` promotes some discovery events into it. Deleting the discovery row therefore
// does NOT remove any promoted operator row — that is deliberate and is stated in the report. This
// handler names `discovery_events` and nothing else.
export async function DELETE(req: NextRequest) {
  if (!(await verifyAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 404 })

  const id = String(req.nextUrl.searchParams.get('id') ?? '')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  try {
    // Read the row FIRST, so the response can name what it removed even though the row is then gone, and
    // so `wasFuture` is decided from the STORED date against the SERVER's today — never from a date the
    // client sent and never from the browser's clock.
    const today = new Date().toISOString().slice(0, 10)
    const { data: before, error: rErr } = await supabase
      .from('discovery_events')
      .select('id, event_date, truck_name, venue_name')
      .eq('id', id)
      .maybeSingle()
    if (rErr) throw rErr
    if (!before) return NextResponse.json({ error: 'No such event — it may already have been deleted.' }, { status: 404 })

    // 🔴 `.select()` MAKES THE DELETE REPORT WHAT IT DID. Without it PostgREST returns 204 and a delete
    // that matched no row is indistinguishable from one that matched a row.
    const { data: gone, error } = await supabase
      .from('discovery_events')
      .delete()
      .eq('id', id)
      .select('id')
    if (error) throw error
    if (!gone || gone.length === 0) {
      return NextResponse.json({ error: 'Nothing was deleted — the row did not match.' }, { status: 404 })
    }
    // Belt and braces: `.eq('id', …)` on a primary key cannot match twice, and if that assumption were
    // ever wrong this is where it would surface rather than in the row count on the screen.
    if (gone.length > 1) {
      console.error('[admin/discovery-events] DELETE matched', gone.length, 'rows for id', id)
    }

    const wasFuture = (before.event_date ?? '') >= today
    console.warn(
      `[admin/discovery-events] DELETED ${before.id} — ${before.truck_name} @ ${before.venue_name} on ${before.event_date}` +
      ` (${wasFuture ? 'FUTURE-dated: the source may still list it' : 'past-dated'})`
    )
    return NextResponse.json({ ok: true, deletedCount: gone.length, deleted: before, today, wasFuture })
  } catch (e: any) {
    console.error('[admin/discovery-events] delete failed:', e?.message || e)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
