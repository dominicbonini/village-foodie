// app/api/weekly-post/route.ts — the weekly post's own route.
//
// ── 🔴 WHY IT IS NOT AN ACTION ON /api/manage ──────────────────────────────────────────────────────
// Every other operator write goes through /api/manage, and this deliberately does not, for one reason:
// `render` returns a PNG. /api/manage is a JSON route whose every caller does `r.json()`, and bolting a
// binary response onto it would make the one path that must never surprise a caller surprise them.
// The auth is the same token + `resolveTruckAccess` pattern, lifted rather than reinvented.
//
// ── 🔴 THE FEATURE GATE IS SERVER-SIDE AS WELL AS IN THE UI ───────────────────────────────────────
// `FeatureGate` in the pane decides what is drawn; this decides what is DONE. Without the check here,
// the whole feature is reachable by anyone holding a dashboard token and posting to this URL — and the
// gate would be decoration. `canAccess` is the same function the UI gate uses.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { canAccess } from '@/lib/features'
import { scanUrl } from '@/lib/custom-domain/copy'
import type { Place } from '@/lib/schedule-graphics/places'
import { buildWeekData, busyWeekData, type WeekEvent } from '@/lib/weekly-post/week-data'
import { defaultLayout, rowsFitWarning, validateLayout, MAX_UPLOAD_BYTES, MIN_UPLOAD_SHORT_SIDE, type Layout } from '@/lib/weekly-post/layout'
import { checkUpload, readImageInfo, toDataUri } from '@/lib/weekly-post/image-info'
import { renderWeeklyPost } from '@/lib/weekly-post/render'
import { weekRange, defaultWeekChoice, type WeekChoice } from '@/lib/weekly-post/week'
import { eventPostText, weekCaption } from '@/lib/weekly-post/caption'

/** 🔴 THE RENDER IS THE SLOW PATH and it is ~40ms warm; 30s matches /api/manage and leaves room for a
 *  cold start that has to parse five font files. */
export const maxDuration = 30

const BUCKET = 'post-designs'
const KIND = 'week'
/** How long a browser's view of the blank stays valid. Long enough to design, short enough to matter. */
const SIGNED_URL_SECONDS = 60 * 60

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

type TruckRow = {
  id: string; name: string; slug: string | null
  plan: string | null
  feature_overrides: Record<string, boolean> | null
  trial_expires_at: string | null
}

async function getTruck(token: string): Promise<TruckRow | null> {
  const { data } = await supabase.from('trucks').select('*').eq('dashboard_token', token).single()
  return (data as TruckRow | null) ?? null
}

/** The gate. ⚠️ Returns the same message the UI shows, so a blocked call and a blocked screen agree. */
function gated(truck: TruckRow): NextResponse | null {
  const ok = canAccess(
    truck.plan as never,
    'schedule_graphics' as never,
    truck.feature_overrides ?? undefined,
    truck.trial_expires_at ?? undefined,
  )
  return ok ? null : NextResponse.json({ error: 'The weekly post is on Pro and Max' }, { status: 403 })
}

async function loadDesign(truckId: string) {
  const { data, error } = await supabase
    .from('truck_post_designs')
    .select('id, blank_path, example_path, width, height, layout, updated_at')
    .eq('truck_id', truckId).eq('kind', KIND).maybeSingle()
  if (error) {
    /* ⚠️ A MISSING TABLE IS REPORTED, NOT SWALLOWED. Before the migration this feature cannot work at
     * all, and "set up your weekly post" on a loop would be a maddening way to learn that. */
    const code = (error as { code?: string }).code
    if (code === 'PGRST205' || code === '42P01') {
      return { missingTable: true as const, design: null }
    }
    throw new Error(error.message)
  }
  return { missingTable: false as const, design: data }
}

/** The stored blank as bytes. Used by the renderer and by the dimension check. */
async function downloadObject(path: string): Promise<Buffer | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path)
  if (error || !data) return null
  return Buffer.from(await data.arrayBuffer())
}

async function signed(path: string | null | undefined): Promise<string | null> {
  if (!path) return null
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS)
  return data?.signedUrl ?? null
}

/** The week's events and the truck's places, for one date range. */
async function loadWeek(truckId: string, from: string, to: string) {
  const [{ data: events }, { data: places }] = await Promise.all([
    supabase.from('truck_events')
      .select('id, event_date, start_time, end_time, status, venue_name, venue_id, truck_place_id, town')
      .eq('truck_id', truckId).gte('event_date', from).lte('event_date', to),
    supabase.from('truck_places')
      .select('id, venue_id, name_key, name, short_name, area, merged_into_id, is_hidden')
      .eq('truck_id', truckId),
  ])
  return {
    events: (events ?? []) as WeekEvent[],
    places: (places ?? []) as Place[],
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }

  const token = String(body.token ?? '')
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 401 })
  const truck = await getTruck(token)
  if (!truck) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  const blocked = gated(truck)
  if (blocked) return blocked

  const action = String(body.action ?? '')

  // ── LOAD ────────────────────────────────────────────────────────────────────────────────────────
  if (action === 'load') {
    const { missingTable, design } = await loadDesign(truck.id)
    const which: WeekChoice = body.week === 'this' || body.week === 'next'
      ? body.week as WeekChoice
      : defaultWeekChoice()
    const range = weekRange(which)
    const { events, places } = await loadWeek(truck.id, range.start, range.end)
    const layout = (design?.layout ?? null) as Layout | null
    const week = buildWeekData(range, events, places, {
      timeStyle: layout?.timeStyle ?? '12h',
      showCancelled: layout?.showCancelled ?? true,
      excludedEventIds: Array.isArray(body.excluded) ? body.excluded.map(String) : [],
    })
    return NextResponse.json({
      missingTable,
      design: design ? {
        width: design.width, height: design.height, layout: design.layout,
        blankUrl: await signed(design.blank_path),
        exampleUrl: await signed(design.example_path),
        updatedAt: design.updated_at,
      } : null,
      week: {
        which: range.which, start: range.start, end: range.end,
        days: week.days,
      },
      /* ⚠️ THE EVENT LIST IS SEPARATE FROM THE DAYS so the screen can offer a tick per event without
       * re-deriving which events the days came from. */
      events: week.included.map(e => ({ id: e.id, date: e.event_date, status: e.status, venue: e.venue_name })),
      orderUrl: truck.slug ? scanUrl(truck.slug) : null,
      defaultWeek: defaultWeekChoice(),
    })
  }

  // ── AN UPLOAD SLOT ──────────────────────────────────────────────────────────────────────────────
  if (action === 'upload_url') {
    const which = body.which === 'example' ? 'example' : 'blank'
    const ext = String(body.ext ?? 'png').toLowerCase() === 'jpg' ? 'jpg' : String(body.ext ?? 'png').toLowerCase() === 'jpeg' ? 'jpg' : 'png'
    /* ⚠️ THE PATH IS BUILT SERVER-SIDE AND STARTS WITH THE TRUCK ID. A client-supplied path would let
     * one truck write into another's folder — the bucket is private, but a signed upload URL is
     * authority over exactly the path it names. */
    const path = `${truck.id}/${which}-${Date.now()}.${ext}`
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ uploadUrl: data.signedUrl, path })
  }

  // ── CONFIRM AN UPLOAD: read the real bytes, check them, save or discard ─────────────────────────
  if (action === 'confirm_upload') {
    const path = String(body.path ?? '')
    const which = body.which === 'example' ? 'example' : 'blank'
    if (!path.startsWith(`${truck.id}/`)) return NextResponse.json({ error: 'Unknown file' }, { status: 400 })
    const bytes = await downloadObject(path)
    if (!bytes) return NextResponse.json({ error: 'That upload did not arrive — please try again.' }, { status: 400 })

    /* 🔴 CHECKED FROM THE BYTES, NOT FROM WHAT THE CLIENT SAID. The dimensions decide every box's
     * bounds check later, so they are read here from the file's own header. */
    const check = checkUpload(bytes, { maxBytes: MAX_UPLOAD_BYTES, minShortSide: MIN_UPLOAD_SHORT_SIDE })
    if (!check.ok) {
      /* ⚠️ A REFUSED FILE IS REMOVED. Leaving it would accumulate unreferenced objects in a private
       * bucket that nothing ever lists. */
      await supabase.storage.from(BUCKET).remove([path])
      return NextResponse.json({ error: check.error }, { status: 400 })
    }

    const { design } = await loadDesign(truck.id)
    if (which === 'example') {
      if (!design) return NextResponse.json({ error: 'Upload the blank first.' }, { status: 400 })
      const old = design.example_path
      await supabase.from('truck_post_designs').update({ example_path: path, updated_at: new Date().toISOString() })
        .eq('truck_id', truck.id).eq('kind', KIND)
      if (old && old !== path) await supabase.storage.from(BUCKET).remove([old])
      return NextResponse.json({ ok: true, exampleUrl: await signed(path) })
    }

    /* 🔴 A NEW BLANK OF A DIFFERENT SIZE RESETS THE LAYOUT. Keeping the old boxes would leave them at
     * coordinates that mean something else on the new artwork — boxes landing in the wrong place with
     * no explanation. A same-size replacement keeps the design, which is the common case (they
     * re-exported the same template). */
    const sameSize = design && design.width === check.info.width && design.height === check.info.height
    const layout = sameSize && design?.layout
      ? design.layout
      : defaultLayout(check.info.width, check.info.height)
    const oldBlank = design?.blank_path
    const row = {
      truck_id: truck.id, kind: KIND, blank_path: path,
      width: check.info.width, height: check.info.height,
      layout, updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('truck_post_designs').upsert(row, { onConflict: 'truck_id,kind' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (oldBlank && oldBlank !== path) await supabase.storage.from(BUCKET).remove([oldBlank])
    return NextResponse.json({
      ok: true, width: check.info.width, height: check.info.height,
      layout, resetLayout: !sameSize, blankUrl: await signed(path),
    })
  }

  // ── SAVE THE DESIGN ─────────────────────────────────────────────────────────────────────────────
  if (action === 'save_design') {
    const { design } = await loadDesign(truck.id)
    if (!design) return NextResponse.json({ error: 'Upload your blank image first.' }, { status: 400 })
    /* 🔴 VALIDATED AGAINST THE STORED SIZE, never the payload's own width/height. */
    const v = validateLayout(body.layout, design.width ?? 0, design.height ?? 0)
    if (!v.ok || !v.layout) return NextResponse.json({ error: v.errors[0] ?? 'That design could not be saved.', errors: v.errors }, { status: 400 })
    const { error } = await supabase.from('truck_post_designs')
      .update({ layout: v.layout, updated_at: new Date().toISOString() })
      .eq('truck_id', truck.id).eq('kind', KIND)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, layout: v.layout, warning: rowsFitWarning(v.layout) })
  }

  // ── THE CAPTIONS ────────────────────────────────────────────────────────────────────────────────
  if (action === 'captions') {
    const { design } = await loadDesign(truck.id)
    const layout = (design?.layout ?? null) as Layout | null
    const which: WeekChoice = body.week === 'next' ? 'next' : body.week === 'this' ? 'this' : defaultWeekChoice()
    const range = weekRange(which)
    const { events, places } = await loadWeek(truck.id, range.start, range.end)
    const week = buildWeekData(range, events, places, {
      timeStyle: layout?.timeStyle ?? '12h',
      showCancelled: layout?.showCancelled ?? true,
      excludedEventIds: Array.isArray(body.excluded) ? body.excluded.map(String) : [],
    })
    const orderUrl = truck.slug ? scanUrl(truck.slug) : null
    const note = typeof body.note === 'string' ? body.note : null
    /* 🔴 `now` COMES FROM THE REQUEST. The per-event wording is relative to when the operator copies
     * it, and this route is called when they open the screen — so the server's clock at that moment is
     * the right one. The harness passes its own, which is why every function takes it. */
    const now = new Date()
    return NextResponse.json({
      caption: weekCaption({ truckName: truck.name, week, orderUrl, timeStyle: layout?.timeStyle ?? '12h', note }),
      perEvent: week.days.flatMap(d => d.entries.map(e => ({
        eventId: e.eventId,
        date: d.date,
        name: e.name,
        status: e.status,
        text: eventPostText({ truckName: truck.name, entry: e, date: d.date, orderUrl, timeStyle: layout?.timeStyle ?? '12h', now }),
      }))),
    })
  }

  // ── RENDER ──────────────────────────────────────────────────────────────────────────────────────
  if (action === 'render') {
    const { design } = await loadDesign(truck.id)
    if (!design) return NextResponse.json({ error: 'No design yet.' }, { status: 400 })
    /* ⚠️ THE LAYOUT IN THE REQUEST IS PREFERRED **AND STILL VALIDATED**, so the setup screen can
     * preview an unsaved drag. An unvalidated one would reach the renderer as `left: NaN`. */
    const v = validateLayout(body.layout ?? design.layout, design.width ?? 0, design.height ?? 0)
    if (!v.ok || !v.layout) return NextResponse.json({ error: v.errors[0] ?? 'That design could not be rendered.' }, { status: 400 })

    const bytes = await downloadObject(design.blank_path)
    if (!bytes) return NextResponse.json({ error: 'Your blank image could not be read.' }, { status: 500 })
    const info = readImageInfo(bytes)
    if (!info) return NextResponse.json({ error: 'Your blank image could not be read.' }, { status: 500 })

    const which: WeekChoice = body.week === 'next' ? 'next' : body.week === 'this' ? 'this' : defaultWeekChoice()
    const range = weekRange(which)
    const opts = {
      timeStyle: v.layout.timeStyle,
      showCancelled: v.layout.showCancelled,
      excludedEventIds: Array.isArray(body.excluded) ? body.excluded.map(String) : [],
    }
    /* 🔴 "PREVIEW A BUSY WEEK" IS WEEK DATA, NOT A SECOND DRAWING PATH. The setup screen needs the
     * operator to see the worst case — a 60-character place name, two events stacked on a Saturday, a
     * cancelled day — before they approve a design against whatever three short names next week
     * happens to hold. It goes through this same renderer, so what it shows is true. */
    const week = body.busy === true
      ? busyWeekData(range, opts)
      : await (async () => {
          const { events, places } = await loadWeek(truck.id, range.start, range.end)
          return buildWeekData(range, events, places, opts)
        })()

    const out = await renderWeeklyPost({
      layout: v.layout, week, blankDataUri: toDataUri(bytes, info),
      note: typeof body.note === 'string' ? body.note : null,
    })
    /* ⚠️ THE WARNINGS TRAVEL IN A HEADER because the body is the PNG. The screen reads them and names
     * the day whose text had to be shortened — the one failure an operator cannot see coming. */
    return new NextResponse(new Uint8Array(out.png), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `inline; filename="weekly-post-${range.start}.png"`,
        'Cache-Control': 'no-store',
        'X-Render-Ms': String(out.ms),
        'X-Render-Warnings': encodeURIComponent(JSON.stringify(out.warnings)),
      },
    })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
