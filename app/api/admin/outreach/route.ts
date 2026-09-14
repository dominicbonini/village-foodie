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
import { scheduleNorm, scheduleKeys } from '@/lib/schedule-match'   // the SAME matcher the Schedule popup uses

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
// 🔴 MOVED to lib/schedule-match.ts so the events route can call the SAME function for the popup that
// this route uses for the count. Same rule, same behaviour — see that module's header.
const norm = scheduleNorm

// 🔴 `lastEventDate` IS THE MAX OVER ALL DATES — the FURTHEST future event, not the next one, and it
// carries no venue. The templates need the NEXT event (soonest date >= today) and its venue, so those are
// derived here as two more fields.
// ⚠️ NO EXTRA QUERY, AND NOT ONE PER ROW. The same single bulk read now also selects `venue_name`; the
// next-event fields are computed in the same in-memory pass that already builds futureCount.
type Schedule = {
  futureCount: number
  lastEventDate: string | null
  nextEventDate: string | null
  nextEventVenue: string | null
}

async function buildScheduleIndex(): Promise<Map<string, Schedule>> {
  const todayYMD = new Date().toISOString().slice(0, 10)
  // One bulk read of the events we need — name + date only. Paged to defeat PostgREST's 1000-row default
  // cap so a growing event table never silently truncates the schedule (737 today, but do not assume).
  const events: { truck_name: string | null; event_date: string | null; venue_name: string | null }[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('discovery_events')
      .select('truck_name, event_date, venue_name')
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
    const cur = idx.get(key) ?? { futureCount: 0, lastEventDate: null, nextEventDate: null, nextEventVenue: null }
    if (e.event_date) {
      // 🔴 TWO DIFFERENT PREDICATES ON PURPOSE — READ BOTH BEFORE CHANGING EITHER.
      //   futureCount uses `>= today` — it answers "is anything booked", and an event happening TODAY
      //     counts. This is the Schedule cell's `Y (n)` and the number the schedule popup must agree
      //     with, so it is deliberately UNCHANGED.
      //   nextEvent*  uses `>  today` — it feeds a sentence in an email ("your Friday pitch at X").
      //     An event happening as the email is written reads oddly, and an email composed today and
      //     sent tomorrow names an event that has already happened. So the templates name the next
      //     event AFTER today, or the line is dropped entirely.
      // 🧪 21 of 231 prospects are affected: 19 now name a later event, 2 now drop the line.
      if (e.event_date >= todayYMD) cur.futureCount += 1
      if (e.event_date > todayYMD) {
        // The soonest one strictly after today — `<` so the first row seen for a date keeps its venue.
        if (!cur.nextEventDate || e.event_date < cur.nextEventDate) {
          cur.nextEventDate = e.event_date
          cur.nextEventVenue = e.venue_name ?? null
        }
      }
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
  const keys = scheduleKeys(name, aliases)   // the shared rule; was these three lines inline
  let futureCount = 0
  let lastEventDate: string | null = null
  let nextEventDate: string | null = null
  let nextEventVenue: string | null = null
  for (const k of keys) {
    const s = idx.get(k)
    if (!s) continue
    futureCount += s.futureCount
    if (s.lastEventDate && (!lastEventDate || s.lastEventDate > lastEventDate)) lastEventDate = s.lastEventDate
    // Across a truck's name and aliases, the next event is the EARLIEST of their next events.
    if (s.nextEventDate && (!nextEventDate || s.nextEventDate < nextEventDate)) {
      nextEventDate = s.nextEventDate
      nextEventVenue = s.nextEventVenue
    }
  }
  return { futureCount, lastEventDate, nextEventDate, nextEventVenue }
}

// ── GET — the full list (prospects × their discovery truck × derived schedule × contact log summary) ───
export async function GET(req: NextRequest) {
  if (!(await verifyAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 404 })

  try {
    // Prospects joined to their discovery truck via PostgREST embedding (one round trip). The FK
    // discovery_truck_id → discovery_trucks makes the embed resolvable.
    // 🔴 SOME COLUMNS MAY NOT EXIST YET — migrations are applied by hand and this route cannot read
    // information_schema. So it PROBES each optional column (contact_name, the contact_first_name /
    // contact_last_name pair, do_not_contact, entity_type)
    // with a cheap select; a PostgREST undefined-column error means absent. Present ones join the main
    // select and their flag is reported to the page. This is a capability probe (did the select succeed?),
    // NOT an inference from row VALUES. Applying the migration and reloading flips a flag on the next load.
    const TRUCK_EMBED = `truck:discovery_trucks!outreach_prospects_discovery_truck_id_fkey (
          id, name, aliases, contact_email, phone, mobile, accepted_methods, order_url, excluded, logo_url, photo_url, website, schedule_url
        )`
    const BASE_COLS = `id, discovery_truck_id, stage, platform, hu_map, hu_ordering, whatsapp_number, whatsapp_confirmed,
        next_action_at, notes, created_at, updated_at`
    const columnExists = async (col: string): Promise<boolean> => {
      const { error } = await supabase.from('outreach_prospects').select(col).limit(1)
      return !error   // any error (undefined column) → treat as absent
    }
    // 🔴 ONE PROBE FOR THE PAIR. `columnExists` passes its argument straight to `.select()`, and a
    // PostgREST select of two columns fails if EITHER is missing — which is the question worth asking:
    // half a name split is not usable, so the UI must offer both fields or neither.
    const [hasContactName, hasContactNames, hasDoNotContact, hasEntityType] = await Promise.all([
      columnExists('contact_name'),
      columnExists('contact_first_name, contact_last_name'),
      columnExists('do_not_contact'), columnExists('entity_type'),
    ])
    const optionalCols = [
      // ⚠️ STILL SELECTED, DELIBERATELY, THOUGH NOTHING READS IT ANY MORE. The split moved every reader
      // to the two columns below and stopped WRITING this one; the column and this select stay for one
      // release so an old row is still inspectable and a missed reader fails loudly instead of silently
      // reading a field that vanished. Dropping it is a LATER, SEPARATE change.
      hasContactName && 'contact_name',
      hasContactNames && 'contact_first_name, contact_last_name',
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
        // 🔴 `created_at` IS THE TIE-BREAK, AND IT IS NOT DECORATION. `contacted_at` carries the DATE the
        // operator picked, so two contacts logged on the same day hold the identical midnight timestamp
        // and tie. Postgres does not promise an order for ties, so the pair came back in whatever order
        // the scan produced — which is how an inbound logged BEFORE an outbound displayed after it.
        // `created_at` is the insert time, already stored on every row, so it is the submission order.
        .order('contacted_at', { ascending: false })
        .order('created_at', { ascending: false })
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

    // ── THE PROSPECT'S LIVE DEMO (migration 20260912_demo_sessions_outreach) ──────────────────────
    // One bulk read keyed on the column that carries the link — demo_sessions.discovery_truck_id — so
    // the modal can show the /demo/<public_ref> URL that was sent, and when it expires.
    //
    // 🔴 GUARDED, BECAUSE THE MIGRATION IS APPLIED BY HAND AND MAY NOT BE. An unapplied migration makes
    // this select a PostgREST undefined-column error; letting that reach the outer catch would 500 the
    // WHOLE outreach page over a decoration. Same capability-probe posture as contact_name above, except
    // the probe IS the query: it either returns rows or it does not, and `hasDemoLinks` reports which.
    //
    // "LIVE" = a session row that has not expired. The row itself is the liveness signal — demo_sessions
    // .truck_id → trucks is ON DELETE CASCADE, so a swept demo takes its row with it — and `expires_at`
    // covers the window between expiry and the next hourly cleanup run.
    const demoByDiscovery = new Map<string, { publicRef: string | null; expiresAt: string | null; createdAt: string | null; liveCount: number }>()
    let hasDemoLinks = false
    {
      const ids = Array.from(new Set((prospects ?? [])
        .map((row) => (row as { discovery_truck_id?: unknown }).discovery_truck_id)
        .filter((v): v is string => typeof v === 'string' && v.length > 0)))
      if (ids.length > 0) {
        const { data: sessions, error: sErr } = await supabase
          .from('demo_sessions')
          .select('truck_id, discovery_truck_id, public_ref, expires_at, created_at')
          .in('discovery_truck_id', ids)
          .order('created_at', { ascending: false })
        if (sErr) {
          console.warn('[admin/outreach] demo_sessions read skipped (migration applied?):', sErr.message)
        } else {
          hasDemoLinks = true
          for (const row of sessions ?? []) {
            const key = row.discovery_truck_id as string
            const expiresAt = (row.expires_at as string | null) ?? null
            // Expired rows are not offered as a link — the cleanup is hourly, so they exist briefly.
            if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) continue
            const prev = demoByDiscovery.get(key)
            if (prev) { prev.liveCount += 1; continue }   // ordered newest-first, so the first wins
            demoByDiscovery.set(key, {
              publicRef: (row.public_ref as string | null) ?? null,
              expiresAt,
              createdAt: (row.created_at as string | null) ?? null,
              liveCount: 1,
            })
          }
        }
      }
    }

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
        photo_url: truck?.photo_url ?? null,
        contact_name: hasContactName ? (p.contact_name ?? null) : null,   // legacy, unread — see above
        contact_first_name: hasContactNames ? (p.contact_first_name ?? null) : null,
        contact_last_name: hasContactNames ? (p.contact_last_name ?? null) : null,
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
        nextEventDate: sched.nextEventDate,
        nextEventVenue: sched.nextEventVenue,
        outboundCount,
        lastContactedAt,
        contacts,
        // NEWEST live demo for this prospect, or null. `liveCount` > 1 means there are others and the
        // modal says so rather than silently picking one.
        demo: (p.discovery_truck_id && demoByDiscovery.get(p.discovery_truck_id)) || null,
      }
    })

    // Column-presence flags tell the page which fields it can offer as editable (rather than inferring
    // presence from data). Each flips to true on the load after its migration is applied.
    return NextResponse.json({ prospects: rows, hasContactName, hasContactNames, hasDoNotContact, hasEntityType, hasDemoLinks })
  } catch (e: any) {
    console.error('[admin/outreach] GET failed:', e?.message || e)
    return NextResponse.json({ error: 'Could not load outreach data' }, { status: 500 })
  }
}

// ── POST — mutations. One handler, an `action` discriminator, every write validated against the shared
// constants (the tables carry NO CHECK, so THIS is the enforcement). ─────────────────────────────────
// ── MEDIA UPLOAD CONSTANTS ───────────────────────────────────────────────────────────────────────────
// 🔴 `truck-media` IS THE ONLY RUNTIME-WRITABLE STORE. The `/logos/…` and `/photos/…` values that most
// discovery rows carry are STATIC FILES IN `public/`, tracked in git and shipped with the deploy — a
// serverless function cannot write one. So an upload here lands in the bucket and the column receives the
// ABSOLUTE public URL, which is the shape 44 rows already hold and which `formatImageUrl` passes through
// untouched. Both shapes therefore keep working and no consumer changes.
const MEDIA_BUCKET = 'truck-media'
const MAX_MEDIA_BYTES = 5 * 1024 * 1024        // 5 MB — a logo or a food photo, not a print master
// Only the two media columns are writable this way. A map, not string interpolation, so no caller can
// name an arbitrary column.
const MEDIA_COLUMN: Record<string, 'logo_url' | 'photo_url'> = { logo: 'logo_url', photo: 'photo_url' }
// Separated INSIDE the object path, not in the column value — the column holds a full URL either way.
const MEDIA_FOLDER: Record<string, string> = { logo: 'logos', photo: 'photos' }

export async function POST(req: NextRequest) {
  if (!(await verifyAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 404 })

  // ── UPLOAD A LOGO OR PHOTO (multipart) ─────────────────────────────────────────────────────────────
  // 🔴 A NEW SERVER ACTION, NOT A REUSE OF `get_upload_url`. That one is on /api/manage, gated by a
  // dashboard_token, keyed on an OPERATOR truck id, and is a signed-URL the CLIENT then PUTs to. All
  // three are wrong here: this is admin-gated, keyed on the DISCOVERY truck uuid, and the bytes go
  // through this server with the service role — no client-side storage call, no anon key.
  // ⚠️ Declared as new deliberately: app manual §51.7 records a "reuse" that was a fourth independent
  // implementation, and this must not be described that way.
  // 🔎 The COLUMN WRITE below is a genuine reuse — the same resolve-discovery_truck_id-then-update
  // pattern `update_prospect` already uses for contact_email/phone, on this route, with this gate.
  if ((req.headers.get('content-type') || '').startsWith('multipart/form-data')) {
    let form: FormData
    try { form = await req.formData() } catch { return NextResponse.json({ error: 'Bad form data' }, { status: 400 }) }

    const prospectId = String(form.get('prospect_id') ?? '')
    const kind = String(form.get('column') ?? '')
    const file = form.get('file')
    const column = MEDIA_COLUMN[kind]
    if (!prospectId || !column) return NextResponse.json({ error: 'prospect_id and a valid column are required' }, { status: 400 })
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'No file supplied' }, { status: 400 })

    // ⚠️ VALIDATE BEFORE A SINGLE BYTE REACHES A PUBLIC BUCKET. Both checks are here rather than only in
    // the browser: the browser's copy is a convenience, this one is the rule.
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: `That is not an image (${file.type || 'unknown type'})` }, { status: 400 })
    }
    if (file.size > MAX_MEDIA_BYTES) {
      return NextResponse.json({ error: `Too large — ${(file.size / 1048576).toFixed(1)} MB, limit ${MAX_MEDIA_BYTES / 1048576} MB` }, { status: 400 })
    }

    try {
      const { data: pr, error: prErr } = await supabase
        .from('outreach_prospects').select('discovery_truck_id').eq('id', prospectId).single()
      if (prErr || !pr?.discovery_truck_id) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 })
      const truckId = pr.discovery_truck_id as string

      // 🔴 EMPTY SLOTS ONLY, ENFORCED HERE AND NOT JUST IN THE UI. Replacing is out of scope, and the UI
      // not offering a drop target is a convention a direct POST could ignore. A filled column is refused.
      const { data: cur, error: curErr } = await supabase
        .from('discovery_trucks').select(column).eq('id', truckId).single()
      if (curErr) return NextResponse.json({ error: 'Could not read the truck row' }, { status: 500 })
      if ((cur as any)?.[column]) {
        return NextResponse.json({ error: 'That slot already has an image — replacing is not supported' }, { status: 409 })
      }

      // 🔴 THE FILENAME SCHEME. `<discovery_truck_id>/<logos|photos>/<timestamp>-<safe name>`:
      //   • the discovery truck UUID makes a collision BETWEEN trucks impossible — the failure that would
      //     otherwise put one business's logo on another's public listing;
      //   • the timestamp stops a re-upload silently overwriting the previous object;
      //   • the folder separates the two kinds inside the bucket (the column value is a full URL either
      //     way, so this is for humans reading the bucket, not for resolution).
      const safeName = (file.name || 'image').replace(/[^A-Za-z0-9._-]/g, '_').slice(-80)
      const path = `${truckId}/${MEDIA_FOLDER[kind]}/${Date.now()}-${safeName}`

      const buffer = Buffer.from(await file.arrayBuffer())
      const { error: upErr } = await supabase.storage.from(MEDIA_BUCKET)
        .upload(path, buffer, { contentType: file.type, upsert: false })
      if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 })

      const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL}/storage/v1/object/public/${MEDIA_BUCKET}/${path}`

      // 🔴 THE ORPHAN WINDOW, AND IT IS ONE-DIRECTIONAL. The bytes must exist before the column can point
      // at them, so the column write happens IMMEDIATELY here with nothing in between. If it fails, the
      // object is deleted — because a public file nothing references is the worst of both outcomes.
      // ⚠️ If the cleanup ALSO fails the path is logged EXPLICITLY rather than swallowed: an orphan that
      // nobody can name is one nobody will ever remove.
      const { error: dbErr } = await supabase
        .from('discovery_trucks').update({ [column]: publicUrl }).eq('id', truckId)
      if (dbErr) {
        const { error: rmErr } = await supabase.storage.from(MEDIA_BUCKET).remove([path])
        if (rmErr) {
          console.error(`[admin/outreach] 🔴 ORPHANED PUBLIC OBJECT — column write failed AND cleanup failed. Path: ${MEDIA_BUCKET}/${path} · db: ${dbErr.message} · cleanup: ${rmErr.message}`)
        }
        return NextResponse.json({ error: `Saved the file but could not update the truck — no change made${rmErr ? ' (and the file could not be removed; see server log)' : ''}` }, { status: 500 })
      }

      return NextResponse.json({ ok: true, column, url: publicUrl })
    } catch (e: any) {
      console.error('[admin/outreach] media upload failed:', e?.message || e)
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
    }
  }

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
      // 🔴 `contact_name` IS NO LONGER WRITTEN, AND ITS WRITER IS GONE RATHER THAN GUARDED. Leaving
      // `if ('contact_name' in body)` here would keep a live write path for a column the UI has stopped
      // maintaining, so the two names and the joined one would drift the first time anything posted the
      // old key. The column stays readable (see the select above); nothing updates it.
      if ('contact_first_name' in body) patch.contact_first_name = body.contact_first_name === '' ? null : body.contact_first_name
      if ('contact_last_name' in body) patch.contact_last_name = body.contact_last_name === '' ? null : body.contact_last_name
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
      // 🔴 `.select('id')` IS THE FIX FOR A DELETE THAT DELETED NOTHING. PostgREST returns NO error when
      // the filter matches zero rows — the statement ran, it just did not affect anything — so this
      // action used to answer `{ ok: true }` to an id that does not exist, and the UI said "removed"
      // about a row still in the table. Asking for the deleted rows back makes the count observable.
      // ⚠️ NOT A NEW ACTION and not a new delete path: same action name, same single statement, same
      // gate. What changed is that the answer now carries how many rows it actually removed.
      const { data, error } = await supabase
        .from('outreach_contacts').delete().eq('id', contact_id).select('id')
      if (error) throw error
      const deleted = data?.length ?? 0
      if (deleted === 0) {
        return NextResponse.json(
          { error: 'That contact no longer exists — it may already have been deleted.', deleted: 0 },
          { status: 404 })
      }
      return NextResponse.json({ ok: true, deleted })
    }

    // ── REMOVE A LOGO OR PHOTO ────────────────────────────────────────────────────────────────────
    // Clears the column so the slot becomes an empty drop target again. Used to correct a mistake or to
    // replace an image (upload refuses a filled slot, so clearing is how you replace).
    //
    // 🔴 THE COLUMN IS CLEARED FIRST, THEN THE OBJECT — THE EXACT REVERSE OF UPLOAD, AND DELIBERATELY.
    // On upload the bytes must exist before anything points at them, so a failed DB write leaves an
    // orphan to clean up. On delete the danger runs the other way: removing the file first and then
    // failing to clear the column would leave a row pointing at nothing — a broken image on a public
    // page. Clearing the column first means the worst case is an unreferenced file, which is invisible.
    //
    // 🔴 AND THE FILE IS ONLY DELETED WHEN IT IS PROVABLY OURS TO DELETE. `discovery_trucks.logo_url`
    // holds three kinds of value and only one of them is safe to remove from storage:
    //   • `<discovery_truck_id>/…`  — uploaded from THIS surface. Ours. Delete it.
    //   • `discovery-logos/…`       — the seeded discovery folder (🧪 49 of 50 absolute values today). Ours.
    //   • anything else             — 🔴 NEVER TOUCHED. That includes `/logos/…` static files committed in
    //     the repo (a function cannot delete one anyway) and, critically, paths inside an OPERATOR truck's
    //     own folder: 🧪 `Test Kitchen.logo_url` is `test-truck/1779807893924-theraclettetruck.jpg`, and
    //     `test-truck` is a `trucks.id`. Deleting that would reach into an operator's storage from a
    //     prospecting screen. The column still clears; the file is left exactly where it is.
    if (action === 'delete_media') {
      const id = String(body.id ?? '')
      const kind = String(body.column ?? '')
      const column = MEDIA_COLUMN[kind]
      if (!id || !column) return NextResponse.json({ error: 'id and a valid column are required' }, { status: 400 })

      const { data: pr, error: prErr } = await supabase
        .from('outreach_prospects').select('discovery_truck_id').eq('id', id).single()
      if (prErr || !pr?.discovery_truck_id) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 })
      const truckId = pr.discovery_truck_id as string

      const { data: cur, error: curErr } = await supabase
        .from('discovery_trucks').select(column).eq('id', truckId).single()
      if (curErr) return NextResponse.json({ error: 'Could not read the truck row' }, { status: 500 })
      const value: string | null = (cur as any)?.[column] ?? null
      if (!value) return NextResponse.json({ ok: true, alreadyEmpty: true, fileDeleted: false })

      // ── 🔴 REFUSE A PHOTO DELETE WHOSE VALUE IS A LIVE PUBLIC FALLBACK ──────────────────────────
      // 🔎 `app/api/discovery/events/route.ts:296-301` maps operator events with
      //      foodPhotoUrl: truck?.cover_image_path ? <operator upload> : formatImageUrl(linked.photo_url…)
      // so for a LINKED truck with no cover image of its own, THIS COLUMN IS WHAT THE PUBLIC MAP RENDERS.
      // Deleting it would change what a Village Foodie / HatchGrab visitor sees.
      //
      // 🔴 THE GATE IS MIRRORED FROM THAT FILE, NOT REIMPLEMENTED FROM MEMORY. There (`:252-257`) it is:
      //      if (!truck.active) return false
      //      if (truck.excluded) return false            // master hide
      //      if (!truck[showCol]) return false           // showCol = isHG ? 'show_on_hg' : 'show_on_vf'
      // `showCol` depends on which SITE is being served, so the same row is public if it passes for
      // EITHER — hence `show_on_vf || show_on_hg` here.
      //
      // 🔴 DELIBERATELY NOT PART OF THE CONDITION: whether the truck has a future event. An event-count
      // test would make the refusal flicker — the same click succeeding today and refused tomorrow with
      // nothing visible having changed. The condition is STRUCTURAL: is this column the live fallback for
      // a publicly-visible truck. That is either true or false regardless of this week's schedule.
      //
      // ⚠️ PHOTO ONLY. The logo has the same fallback shape but `logo_storage_path` is set on every linked
      // truck that is public, so the discovery logo is not a live source for any of them. No logo refusal.
      //
      // 🔴 EVERY INPUT IS RE-READ FROM THE DATABASE HERE. Nothing the client sent is trusted.
      if (column === 'photo_url') {
        const { data: dt, error: dtErr } = await supabase
          .from('discovery_trucks').select('name, hatchgrab_truck_id').eq('id', truckId).single()
        if (dtErr) return NextResponse.json({ error: 'Could not read the truck row' }, { status: 500 })
        if (dt?.hatchgrab_truck_id) {
          const { data: op } = await supabase
            .from('trucks')
            .select('name, active, excluded, show_on_vf, show_on_hg, cover_image_path')
            .eq('id', dt.hatchgrab_truck_id).maybeSingle()
          const publiclyVisible = !!op && !!op.active && !op.excluded && (!!op.show_on_vf || !!op.show_on_hg)
          if (publiclyVisible && !op!.cover_image_path) {
            const who = op!.name || dt.name || 'this truck'
            return NextResponse.json({
              error: `Refused: this photo is live on the public map. ${who} is a linked HatchGrab truck with no cover image of its own, so the discovery feed renders THIS photo for its events. Deleting it would change what visitors see. Set a cover image on the operator dashboard first, or delete the logo instead.`,
              refused: 'public_photo_fallback',
              truck: who,
            }, { status: 409 })
          }
        }
      }

      // 1. CLEAR THE COLUMN. If this fails nothing has been lost — the image still displays.
      const { error: dbErr } = await supabase
        .from('discovery_trucks').update({ [column]: null }).eq('id', truckId)
      if (dbErr) return NextResponse.json({ error: `Could not clear the column: ${dbErr.message}` }, { status: 500 })

      // 2. THEN the object, and only if the path is one of ours.
      let fileDeleted = false
      let fileNote: string | null = null
      const marker = `/storage/v1/object/public/${MEDIA_BUCKET}/`
      const at = value.indexOf(marker)
      if (at < 0) {
        fileNote = 'the stored value is not a truck-media URL (a static /logos or /photos file, or another host) — column cleared, file untouched'
      } else {
        const path = value.slice(at + marker.length)
        const firstSeg = path.split('/')[0]
        const ours = firstSeg === truckId || firstSeg === 'discovery-logos'
        if (!ours) {
          fileNote = `the file lives under "${firstSeg}/", which is not this truck's own folder — column cleared, file deliberately left in place`
          console.warn(`[admin/outreach] delete_media: NOT deleting ${MEDIA_BUCKET}/${path} — foreign folder "${firstSeg}"`)
        } else {
          const { error: rmErr } = await supabase.storage.from(MEDIA_BUCKET).remove([path])
          if (rmErr) {
            fileNote = 'column cleared, but the file could not be removed (see server log)'
            console.error(`[admin/outreach] 🔴 ORPHANED PUBLIC OBJECT — column cleared but delete failed. Path: ${MEDIA_BUCKET}/${path} · ${rmErr.message}`)
          } else {
            fileDeleted = true
          }
        }
      }
      return NextResponse.json({ ok: true, column, fileDeleted, fileNote })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    console.error('[admin/outreach] POST failed:', e?.message || e)
    return NextResponse.json({ error: 'Write failed' }, { status: 500 })
  }
}
