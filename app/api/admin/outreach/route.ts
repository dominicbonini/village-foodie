// app/api/admin/outreach/route.ts
// The data + mutation route for the outreach admin page. Gated by the canonical verifyAdmin — the SAME
// gate every other admin route uses (app/api/admin/route.ts, create-truck, …). 🔴 THE GATE IS ON THIS
// ROUTE HANDLER, not on a layout: a layout wraps pages, never a route handler, so a route must guard
// itself. Uses the service-role client because the two outreach tables are service-role-only (RLS on, anon
// revoked) — anon/authenticated cannot reach them at all, which is the point.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import {
  isStage, isChannel, isDirection, isKind,
  canonicalisePlatform,
  type OutreachStage,
} from '@/lib/outreach'
import { phoneWhatsApp, type WhatsAppHint } from '@/lib/whatsapp-hint'   // shared derivation — same as the live button

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ── SCHEDULE DERIVATION — matched on NAME, not the foreign key (V12.1). ────────────────────────────────
// 🔴 discovery_events.discovery_truck_id is populated on only 81 of 737 future events, so an FK join
// reports "no schedule" for trucks that visibly have one (the FK finds 9 live schedules; name+alias finds
// 49). The match is lower(btrim(truck_name)) against lower(btrim(name)) AND each alias.
// ⚠️ NOT ONE QUERY PER ROW, and NOT a new DB view/function. Two BULK reads (all prospects' trucks; all
// events' name+date) run once each, then a single in-memory pass builds a name→{future_count, last_date}
// map. Expressing the name-OR-alias-array match as one SQL join would need a VIEW or FUNCTION, which is
// outside this task's "two new tables, change nothing else" scope — so this honours the real constraint
// (no per-row query; O(events)+O(trucks), fixed number of round-trips) without widening the change. Both
// derived values are computed at read time and NEVER stored. See docs/outreach-page-report.md.
const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

type Schedule = { futureCount: number; lastEventDate: string | null }

async function buildScheduleIndex(): Promise<Map<string, Schedule>> {
  const todayYMD = new Date().toISOString().slice(0, 10)
  // One bulk read of the events we need — name + date only. Paged to defeat PostgREST's 1000-row default
  // cap so a growing event table never silently truncates the schedule (737 today, but do not assume).
  const events: { truck_name: string | null; event_date: string | null }[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('discovery_events')
      .select('truck_name, event_date')
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    events.push(...data)
    if (data.length < PAGE) break
  }
  // name (normalised) → aggregate
  const idx = new Map<string, Schedule>()
  for (const e of events) {
    const key = norm(e.truck_name)
    if (!key) continue
    const cur = idx.get(key) ?? { futureCount: 0, lastEventDate: null }
    if (e.event_date) {
      if (e.event_date >= todayYMD) cur.futureCount += 1
      if (!cur.lastEventDate || e.event_date > cur.lastEventDate) cur.lastEventDate = e.event_date
    }
    idx.set(key, cur)
  }
  return idx
}

// Merge a truck's own name + all aliases into one schedule figure (a truck's events may be filed under any
// of its names). futureCount sums across the distinct name keys; lastEventDate is the max.
function scheduleFor(
  idx: Map<string, Schedule>,
  name: string | null,
  aliases: string[] | null,
): Schedule {
  const keys = new Set<string>()
  const n = norm(name); if (n) keys.add(n)
  for (const a of aliases ?? []) { const k = norm(a); if (k) keys.add(k) }
  let futureCount = 0
  let lastEventDate: string | null = null
  for (const k of keys) {
    const s = idx.get(k)
    if (!s) continue
    futureCount += s.futureCount
    if (s.lastEventDate && (!lastEventDate || s.lastEventDate > lastEventDate)) lastEventDate = s.lastEventDate
  }
  return { futureCount, lastEventDate }
}

// ── GET — the full list (prospects × their discovery truck × derived schedule × contact log summary) ───
export async function GET(req: NextRequest) {
  if (!(await verifyAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 404 })

  try {
    // Prospects joined to their discovery truck via PostgREST embedding (one round trip). The FK
    // discovery_truck_id → discovery_trucks makes the embed resolvable.
    // 🔴 SOME COLUMNS MAY NOT EXIST YET — migrations are applied by hand and this route cannot read
    // information_schema. So it PROBES each optional column (contact_name, do_not_contact, entity_type)
    // with a cheap select; a PostgREST undefined-column error means absent. Present ones join the main
    // select and their flag is reported to the page. This is a capability probe (did the select succeed?),
    // NOT an inference from row VALUES. Applying the migration and reloading flips a flag on the next load.
    const TRUCK_EMBED = `truck:discovery_trucks!outreach_prospects_discovery_truck_id_fkey (
          id, name, aliases, contact_email, phone, mobile, accepted_methods, order_url, excluded, logo_url, website, schedule_url
        )`
    const BASE_COLS = `id, discovery_truck_id, stage, platform, hu_map, hu_ordering, whatsapp_number, whatsapp_confirmed,
        next_action_at, notes, created_at, updated_at`
    const columnExists = async (col: string): Promise<boolean> => {
      const { error } = await supabase.from('outreach_prospects').select(col).limit(1)
      return !error   // any error (undefined column) → treat as absent
    }
    const [hasContactName, hasDoNotContact, hasEntityType] = await Promise.all([
      columnExists('contact_name'), columnExists('do_not_contact'), columnExists('entity_type'),
    ])
    const optionalCols = [
      hasContactName && 'contact_name',
      hasDoNotContact && 'do_not_contact',
      hasEntityType && 'entity_type',
    ].filter(Boolean).join(', ')
    const { data: prospects, error: pErr } = await supabase
      .from('outreach_prospects')
      .select(`${BASE_COLS}${optionalCols ? ', ' + optionalCols : ''}, ${TRUCK_EMBED}`)
    if (pErr) throw pErr

    // All contacts, one bulk read, newest first — grouped per prospect in memory (not a query per row).
    const contactsByProspect = new Map<string, any[]>()
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from('outreach_contacts')
        .select('id, prospect_id, contacted_at, channel, direction, kind, message, created_at')
        .order('contacted_at', { ascending: false })
        .range(from, from + 999)
      if (error) throw error
      if (!data || data.length === 0) break
      for (const c of data) {
        const arr = contactsByProspect.get(c.prospect_id) ?? []
        arr.push(c)
        contactsByProspect.set(c.prospect_id, arr)
      }
      if (data.length < 1000) break
    }

    const schedIdx = await buildScheduleIndex()

    const rows = (prospects ?? []).map((p: any) => {
      const truck = Array.isArray(p.truck) ? p.truck[0] : p.truck
      const sched = scheduleFor(schedIdx, truck?.name ?? null, truck?.aliases ?? null)
      const contacts = contactsByProspect.get(p.id) ?? []
      const outboundCount = contacts.filter((c: any) => c.direction === 'outbound').length
      const lastContactedAt = contacts.length ? contacts[0].contacted_at : null // newest-first
      return {
        id: p.id,
        discovery_truck_id: p.discovery_truck_id,
        name: truck?.name ?? '(unknown truck)',
        logo_url: truck?.logo_url ?? null,
        contact_name: hasContactName ? (p.contact_name ?? null) : null,
        do_not_contact: hasDoNotContact ? (p.do_not_contact ?? null) : null,
        entity_type: hasEntityType ? (p.entity_type ?? null) : null,
        contact_email: truck?.contact_email ?? null,
        phone: truck?.phone ?? null,
        mobile: truck?.mobile ?? null,
        website: truck?.website ?? null,
        schedule_url: truck?.schedule_url ?? null,
        order_url: truck?.order_url ?? null,
        excluded: truck?.excluded ?? false,
        // 🔴 THE SCRAPED WHATSAPP HINT — derived read-only from the SAME shared function the live call
        // button uses (lib/whatsapp-hint.ts), so the two can never disagree. Three states, never two: an
        // absent tag on a mobile is 'mobile_not_advertised', not 'no WhatsApp'. `phone` (not `mobile`) per
        // the diagnosis. NOTHING is written back — this is display only.
        whatsappHint: phoneWhatsApp(truck?.phone ?? null, truck?.accepted_methods ?? null).hint as WhatsAppHint,
        stage: p.stage as OutreachStage,
        platform: p.platform,
        hu_map: p.hu_map,
        hu_ordering: p.hu_ordering,
        whatsapp_number: p.whatsapp_number,
        whatsapp_confirmed: p.whatsapp_confirmed,
        next_action_at: p.next_action_at,
        notes: p.notes,
        futureEventCount: sched.futureCount,
        lastEventDate: sched.lastEventDate,
        outboundCount,
        lastContactedAt,
        contacts,
      }
    })

    // Column-presence flags tell the page which fields it can offer as editable (rather than inferring
    // presence from data). Each flips to true on the load after its migration is applied.
    return NextResponse.json({ prospects: rows, hasContactName, hasDoNotContact, hasEntityType })
  } catch (e: any) {
    console.error('[admin/outreach] GET failed:', e?.message || e)
    return NextResponse.json({ error: 'Could not load outreach data' }, { status: 500 })
  }
}

// ── POST — mutations. One handler, an `action` discriminator, every write validated against the shared
// constants (the tables carry NO CHECK, so THIS is the enforcement). ─────────────────────────────────
export async function POST(req: NextRequest) {
  if (!(await verifyAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 404 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }
  const action = body?.action

  try {
    // Update the editable prospect fields. Only allow-listed keys are written; an unknown key is ignored
    // rather than fatal (the update_settings allow-list lesson). stage is validated against the constant.
    if (action === 'update_prospect') {
      const id = String(body.id ?? '')
      if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
      const patch: Record<string, unknown> = {}
      if ('stage' in body) {
        if (!isStage(body.stage)) return NextResponse.json({ error: 'Invalid stage' }, { status: 400 })
        patch.stage = body.stage
      }
      // 🔴 CANONICALISE ON SAVE. A hand-typed 'Hatches up' / 'hatchesup' folds to the one canonical
      // spelling so the priority sort's match cannot silently miss it; blank folds to NULL. The literal
      // 'none' passes through unchanged and stays distinct from NULL. This is the single write path every
      // editable field already uses, so platform now round-trips exactly like stage/notes/etc.
      if ('platform' in body) patch.platform = canonicalisePlatform(body.platform)
      // 🔴 TRI-STATE WRITES (hu_map / hu_ordering / whatsapp_confirmed): only true or NULL is ever written
      // from the UI — ticking → true, unticking → NULL. NEVER false. false is a data-only state (this
      // backfill never sets it); writing false on untick would destroy the null-means-nobody-checked
      // distinction. `=== true ? true : null` collapses false/undefined/0/'' to NULL, so an untick clears.
      if ('hu_map' in body) patch.hu_map = body.hu_map === true ? true : null
      if ('hu_ordering' in body) patch.hu_ordering = body.hu_ordering === true ? true : null
      if ('contact_name' in body) patch.contact_name = body.contact_name === '' ? null : body.contact_name
      if ('whatsapp_number' in body) patch.whatsapp_number = body.whatsapp_number === '' ? null : body.whatsapp_number
      if ('whatsapp_confirmed' in body) patch.whatsapp_confirmed = body.whatsapp_confirmed === true ? true : null
      if ('do_not_contact' in body) patch.do_not_contact = body.do_not_contact === true ? true : null
      if ('entity_type' in body) patch.entity_type = body.entity_type === '' ? null : body.entity_type
      if ('next_action_at' in body) patch.next_action_at = body.next_action_at || null // '' → null
      if ('notes' in body) patch.notes = body.notes === '' ? null : body.notes

      // contact_email AND phone live on discovery_trucks, NOT on the prospect — write them there (still
      // service-role, still admin-only). Existing columns, not a schema change; edited here for convenience.
      const truckPatch: Record<string, unknown> = {}
      if ('contact_email' in body) truckPatch.contact_email = body.contact_email === '' ? null : body.contact_email
      if ('phone' in body) truckPatch.phone = body.phone === '' ? null : body.phone
      if (Object.keys(truckPatch).length > 0) {
        const { data: pr } = await supabase.from('outreach_prospects').select('discovery_truck_id').eq('id', id).single()
        if (pr?.discovery_truck_id) {
          const { error: dErr } = await supabase
            .from('discovery_trucks')
            .update(truckPatch)
            .eq('id', pr.discovery_truck_id)
          if (dErr) throw dErr
        }
      }

      if (Object.keys(patch).length > 0) {
        patch.updated_at = new Date().toISOString()
        const { error } = await supabase.from('outreach_prospects').update(patch).eq('id', id)
        if (error) throw error
      }
      return NextResponse.json({ ok: true })
    }

    // Log a contact. Validates channel/direction/kind; contacted_at defaults to now server-side.
    if (action === 'log_contact') {
      const prospect_id = String(body.prospect_id ?? '')
      if (!prospect_id) return NextResponse.json({ error: 'prospect_id required' }, { status: 400 })
      const { channel, direction, kind } = body
      if (channel != null && !isChannel(channel)) return NextResponse.json({ error: 'Invalid channel' }, { status: 400 })
      if (direction != null && !isDirection(direction)) return NextResponse.json({ error: 'Invalid direction' }, { status: 400 })
      if (kind != null && !isKind(kind)) return NextResponse.json({ error: 'Invalid kind' }, { status: 400 })

      // 🔴 RETURN THE INSERTED ROW'S id so the client's UNDO can delete THIS specific contact, not "the
      // most recent" — the double-submit case is exactly when those differ.
      const { data: inserted, error } = await supabase.from('outreach_contacts').insert({
        prospect_id,
        channel: channel ?? null,
        direction: direction ?? null,
        kind: kind ?? null,
        message: body.message ? String(body.message) : null,
        ...(body.contacted_at ? { contacted_at: body.contacted_at } : {}),
      }).select('id').single()
      if (error) throw error

      // 🔴 LOGGING WRITES A CONTACT ROW AND NOTHING ELSE. The old automatic next_action_at update (from the
      // now-deleted outbound-count/weekend-roll suggestion) was removed — no date is ever set automatically.
      // next_action_at is set only by hand via update_prospect.
      return NextResponse.json({ ok: true, id: inserted?.id ?? null })
    }

    // Undo a just-logged contact. Deletes ONE contact row by its id (the id returned by log_contact),
    // never "the latest" — the two diverge exactly when two writes land close together.
    if (action === 'delete_contact') {
      const contact_id = String(body.contact_id ?? '')
      if (!contact_id) return NextResponse.json({ error: 'contact_id required' }, { status: 400 })
      const { error } = await supabase.from('outreach_contacts').delete().eq('id', contact_id)
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    console.error('[admin/outreach] POST failed:', e?.message || e)
    return NextResponse.json({ error: 'Write failed' }, { status: 500 })
  }
}
