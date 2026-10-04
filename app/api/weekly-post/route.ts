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
import {
  defaultLayout, defaultEventLayout, rowsFitWarning, validateLayout, validateEventLayout,
  scaleEventLayout, MAX_UPLOAD_BYTES, MIN_UPLOAD_SHORT_SIDE, type EventLayout, type Layout,
} from '@/lib/weekly-post/layout'
import {
  checkAspect, placePicturesThatNoLongerFit, resolveDesign, oneOffMustMatch,
  placePictureNeedsDefaultShape,
} from '@/lib/weekly-post/backgrounds'
import { renderEventPost } from '@/lib/weekly-post/render'
import { entryFor } from '@/lib/weekly-post/week-data'
import { checkUpload, readImageInfo, toDataUri } from '@/lib/weekly-post/image-info'
import { renderWeeklyPost } from '@/lib/weekly-post/render'
import { weekRange, defaultWeekChoice, todayInWeekTz, type WeekChoice } from '@/lib/weekly-post/week'
import { eventPostText, weekCaption } from '@/lib/weekly-post/caption'

/** 🔴 THE RENDER IS THE SLOW PATH and it is ~40ms warm; 30s matches /api/manage and leaves room for a
 *  cold start that has to parse five font files. */
export const maxDuration = 30

const BUCKET = 'post-designs'
const KIND = 'week'
/** 🔴 THE SECOND KIND (stage 2). `truck_post_designs`'s unique key is `(truck_id, kind)`, written
 *  that way in stage 1 so this could be added as one more row per truck rather than a parallel table. */
const EVENT_KIND = 'event'
type DesignKind = typeof KIND | typeof EVENT_KIND
const kindOf = (v: unknown): DesignKind => (v === EVENT_KIND ? EVENT_KIND : KIND)
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

async function loadDesign(truckId: string, kind: DesignKind = KIND) {
  const { data, error } = await supabase
    .from('truck_post_designs')
    .select('id, blank_path, example_path, width, height, layout, updated_at')
    .eq('truck_id', truckId).eq('kind', kind).maybeSingle()
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

type DesignRow = { blank_path: string; width: number | null; height: number | null; layout: unknown } | null

/**
 * One event, its three possible backgrounds and which one wins — resolved ONCE and shared by
 * `event_post` (which shows the choice) and `event_render` (which draws it).
 *
 * 🔴 ONE PLACE DECIDES, so the picture the modal says is selected is the picture that is drawn. Two
 * copies of "one-off beats place beats default" would disagree the first time either was touched, and
 * the operator would be looking at a label that did not match the poster.
 *
 * ⚠️ A PICTURE WHOSE SHAPE NO LONGER MATCHES IS NOT OFFERED. The boxes were placed on the default; a
 * differently shaped picture would put them somewhere else. `fitsDefault` is what keeps it out, and the
 * place keeps its file so the truck can replace it rather than lose it.
 */
/**
 * The status line under a design's name in the setup list.
 *
 * 🔴 ONE FUNCTION, SERVER-SIDE, so the list and the right-hand column cannot disagree about what a
 * place currently has. The three wordings the brief names are the three that matter; the two extra
 * ones exist because a design can be selected before it has been given anything of its own, and
 * "Own picture, standard positions" would be a lie at that moment.
 */
function placeDesignStatus(a: {
  hasPicture: boolean
  ownPositions: boolean
  fitsDefault: boolean
}): string {
  if (a.hasPicture && a.ownPositions) return 'Own picture and text positions'
  /* ⚠️ THE SHAPE WARNING ONLY APPLIES TO A PLACE ON STANDARD'S POSITIONS. A place with its own
   * positions may be any shape, so "different shape" is not a fault there. */
  if (a.hasPicture && !a.fitsDefault) return 'Different shape — not used until replaced'
  if (a.hasPicture) return 'Own picture, standard positions'
  if (a.ownPositions) return 'Standard picture, own text positions'
  return 'No picture yet — using Standard'
}

/** The refusal when a place with a differently shaped picture is switched back to Standard positions. */
const BACK_TO_STANDARD_REFUSAL =
  'This place’s picture is a different shape from your Standard one, so the standard text positions would not fit it. Replace the picture with one the same shape as your Standard picture first, or keep this place’s own positions.'

async function eventPostContext(
  truck: TruckRow,
  eventId: string,
  design: DesignRow,
  force?: string | null,
): Promise<{ error: string; status: number } | {
  entry: ReturnType<typeof entryFor>
  date: string
  placeId: string | null
  placeName: string
  options: Array<{ source: 'event' | 'place' | 'default'; path: string; label: string }>
  chosen: { source: 'event' | 'place' | 'default'; path: string }
  /** The positions to draw with — the place's own, or Standard's. */
  layout: EventLayout | null
  layoutSource: 'standard' | 'place'
  /** The canvas `layout` was validated against. The place's picture size when the layout is the
   *  place's own; the design's otherwise. */
  canvas: { width: number; height: number }
}> {
  if (!design?.blank_path || !design.width || !design.height) {
    return { error: 'No event design yet.', status: 400 }
  }
  const { data: ev } = await supabase.from('truck_events')
    .select('id, event_date, start_time, end_time, status, venue_name, venue_id, truck_place_id, town')
    .eq('id', eventId).eq('truck_id', truck.id).maybeSingle()
  if (!ev) return { error: 'Event not found', status: 404 }

  const { data: places } = await supabase.from('truck_places')
    .select('id, venue_id, name_key, name, short_name, area, merged_into_id, is_hidden, event_bg_path, event_bg_width, event_bg_height, event_layout')
    .eq('truck_id', truck.id)

  const standardLayout = (design.layout ?? null) as EventLayout | null
  const entry = entryFor(ev as never, (places ?? []) as never, standardLayout?.timeStyle ?? '12h')
  const date = String((ev as { event_date?: string }).event_date ?? '')

  /* 🔴 THE PLACE IS FOUND BY ID, NOT BY NAME (stage 2 report §8.3, corrected here). `entryFor` runs
   * `placeForEvent` — which follows `merged_into_id` and knows about hidden places — and now returns
   * that place's id alongside the name it printed. Matching on the printed name happened to work while
   * the name was only used for a picture, but it is wrong in two ways that now cost a truck real
   * artwork: two places may share a short name ("Sudbury" the market and "Sudbury" the pub), so the
   * wrong design could be attached; and a place whose `short_name` is blank prints its `name`, so any
   * later change to either column would silently detach the design. The id cannot drift. */
  const placeRow = entry.placeId
    ? (places ?? []).find((pl: Record<string, unknown>) => String(pl.id) === entry.placeId) as Record<string, unknown> | undefined
    : undefined

  const placeImgRaw = placeRow?.event_bg_path
    ? { path: String(placeRow.event_bg_path), width: (placeRow.event_bg_width as number) ?? null, height: (placeRow.event_bg_height as number) ?? null }
    : null

  /* ── THE PLACE'S OWN POSITIONS ────────────────────────────────────────────────────────────────
   * ⚠️ VALIDATED AGAINST THE PLACE'S **STORED** PICTURE SIZE, never against anything a caller sent.
   * The size is what proves a box sits inside the picture, so taking it from a request body would let
   * any caller claim a 9000px canvas and place text outside the artwork.
   * ⚠️ A STORED LAYOUT THAT NO LONGER VALIDATES IS TREATED AS "same as Standard" rather than as an
   * error. The column is jsonb with no CHECK constraint (by design — see the migration), the renderer
   * must not be able to throw on data that is already saved, and falling back to Standard's positions
   * is the behaviour this place had before it was given its own. */
  const placeLayout = (() => {
    const raw = placeRow?.event_layout
    if (!raw || !placeImgRaw?.width || !placeImgRaw.height) return null
    const v = validateEventLayout(raw, placeImgRaw.width, placeImgRaw.height)
    return v.ok && v.layout ? v.layout : null
  })()

  const { data: oneOff } = await supabase.from('event_post_backgrounds')
    .select('path, width, height').eq('event_id', eventId).maybeSingle()

  const sized = (i: { width: number | null; height: number | null } | null | undefined):
    i is { width: number; height: number } => !!i && !!i.width && !!i.height

  /* 🔴 THE SHAPE RULE NOW DEPENDS ON WHOSE POSITIONS ARE USED.
   *   • A place on STANDARD's positions keeps stage 2's 1% rule: the boxes were placed on the
   *     default, so a differently shaped picture would move them.
   *   • A place with its OWN positions may be any shape — the boxes were placed on that very picture —
   *     and is bounded only by the ≥600px short side every upload already has. */
  const placeOwnPositions = !!placeLayout
  const placeUsable = sized(placeImgRaw) && (placeOwnPositions
    ? Math.min(placeImgRaw.width!, placeImgRaw.height!) >= MIN_UPLOAD_SHORT_SIDE
    : checkAspect(placeImgRaw.width!, placeImgRaw.height!, design.width, design.height).ok)
  const usablePlace = placeUsable ? placeImgRaw : null

  /* ⚠️ A ONE-OFF IS CHECKED AGAINST THE DESIGN IT WOULD INHERIT POSITIONS FROM, which is the place's
   * picture when the place has its own positions — not always the default. Checking it against the
   * default would accept a picture whose inherited boxes then land in the wrong place. */
  const oneOffTarget = oneOffMustMatch({
    standard: { path: design.blank_path, width: design.width, height: design.height },
    place: placeRow ? { placeId: String(placeRow.id), image: usablePlace, layout: placeLayout } : null,
  })
  const usableOneOff = sized(oneOff as never) && sized(oneOffTarget)
    && checkAspect((oneOff as { width: number }).width, (oneOff as { height: number }).height,
      oneOffTarget.width!, oneOffTarget.height!).ok
    ? (oneOff as { path: string; width: number | null; height: number | null })
    : null

  const forced: 'event' | 'place' | 'default' | null =
    force === 'event' || force === 'place' || force === 'default' ? force : null

  const resolved = resolveDesign({
    standard: {
      image: { path: design.blank_path, width: design.width, height: design.height },
      layout: standardLayout,
    },
    place: placeRow
      ? { placeId: String(placeRow.id), image: usablePlace, layout: placeLayout }
      : null,
    oneOff: usableOneOff,
    force: forced,
  })

  const options: Array<{ source: 'event' | 'place' | 'default'; path: string; label: string }> = []
  /* 🔴 THE LABELS ARE THE BRIEF'S WORDS, and they name the DESIGN rather than the picture, because
   * choosing "Standard design" now changes the text positions as well as the background. */
  if (usableOneOff) options.push({ source: 'event', path: usableOneOff.path, label: 'Upload one for this event only' })
  if (usablePlace) options.push({ source: 'place', path: usablePlace.path, label: `${entry.name} design` })
  options.push({ source: 'default', path: design.blank_path, label: 'Standard design' })

  const canvas = resolved.layoutSource === 'place' && sized(placeImgRaw)
    ? { width: placeImgRaw.width!, height: placeImgRaw.height! }
    : { width: design.width, height: design.height }

  return {
    entry, date,
    placeId: placeRow ? String(placeRow.id) : null,
    placeName: entry.name,
    options,
    chosen: { source: resolved.source, path: resolved.image.path },
    layout: (resolved.layout ?? null) as EventLayout | null,
    layoutSource: resolved.layoutSource,
    canvas,
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
    const { missingTable, design } = await loadDesign(truck.id, KIND)
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
    /* ⚠️ FOUR SLOTS NOW. `blank`/`example` are the week design's; `event-default` is the single-event
     * design's picture; `place` and `one-off` are stage 2's per-place and per-event pictures. The name
     * only shapes the stored path — what a file is allowed to BE is decided by `confirm_upload`, from
     * the bytes. */
    const SLOTS = ['blank', 'example', 'event-default', 'place', 'one-off'] as const
    const which = (SLOTS as readonly string[]).includes(String(body.which)) ? String(body.which) : 'blank'
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
    const which = String(body.which ?? 'blank')
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

    /* ══ 🔴 STAGE 2b · THE SHAPE RULE, WHICH NOW DEPENDS ON WHOSE POSITIONS ARE USED ══════════════
     * Stage 2 required every place and one-off picture to match the event default within 1%, because
     * the boxes were placed once on that default and a box at (x, y) is perfectly valid — and
     * perfectly wrong — on a different canvas.
     *
     * A place with its OWN positions breaks that premise: its boxes were placed on its own picture, so
     * its picture may be any shape, bounded only by the ≥600px short side `checkUpload` already
     * enforced. That is the whole point of this stage — a truck whose per-venue artwork is a different
     * shape, with the venue name already printed on it, could not use it before.
     *
     * Checked here from the real bytes, before anything is stored against a place or an event. */
    if (which === 'place' || which === 'one-off') {
      const { design: eventDesign } = await loadDesign(truck.id, EVENT_KIND)
      if (!eventDesign?.width || !eventDesign?.height) {
        await supabase.storage.from(BUCKET).remove([path])
        return NextResponse.json({ error: 'Set up your event post design first.' }, { status: 400 })
      }

      if (which === 'place') {
        const placeId = String(body.placeId ?? '')
        const { data: place } = await supabase.from('truck_places')
          .select('id, event_bg_path, event_bg_width, event_bg_height, event_layout')
          .eq('id', placeId).eq('truck_id', truck.id).maybeSingle()
        if (!place) { await supabase.storage.from(BUCKET).remove([path]); return NextResponse.json({ error: 'Place not found' }, { status: 404 }) }
        const row = place as {
          event_bg_path?: string | null; event_bg_width?: number | null
          event_bg_height?: number | null; event_layout?: unknown
        }
        const ownPositions = !placePictureNeedsDefaultShape({ layout: row.event_layout ?? null })

        /* 🔴 ONLY A PLACE ON STANDARD'S POSITIONS IS HELD TO THE DEFAULT'S SHAPE. */
        if (!ownPositions) {
          const aspect = checkAspect(check.info.width, check.info.height, eventDesign.width, eventDesign.height)
          if (!aspect.ok) {
            await supabase.storage.from(BUCKET).remove([path])
            return NextResponse.json({ error: aspect.error }, { status: 400 })
          }
        }

        /* 🔴 REPLACING AN OWN-POSITIONS PICTURE WITH A DIFFERENT SHAPE RESETS THAT PLACE'S BOXES, for
         * the same reason the Standard design resets its own: coordinates measured on one canvas are
         * meaningless on another, and a box can now sit outside the picture entirely.
         *
         * ⚠️ IT RESETS TO DEFAULT BOXES FOR THE NEW SIZE, NOT TO NULL. Null would mean "same as
         * Standard", which would silently undo the truck's choice of own positions AND would then fail
         * the 1% rule against the very picture just accepted — leaving a place with a picture it is not
         * allowed to use. Default boxes on the new canvas are drawable, obviously-not-final, and keep
         * the place in the mode the truck put it in.
         * ⚠️ THE SAME SHAPE KEEPS THE BOXES even at a different resolution: a re-export at 2× is the
         * same poster, and the layout is stored at the picture's own size, so only the stored size
         * changes. */
        let nextLayout: unknown = row.event_layout ?? null
        if (ownPositions) {
          const sameShape = !!row.event_bg_width && !!row.event_bg_height
            && checkAspect(check.info.width, check.info.height, row.event_bg_width, row.event_bg_height).ok
          nextLayout = sameShape
            ? scaleEventLayout(row.event_layout, check.info.width, check.info.height)
            : defaultEventLayout(check.info.width, check.info.height)
        }

        const old = row.event_bg_path
        const { error } = await supabase.from('truck_places')
          .update({
            event_bg_path: path, event_bg_width: check.info.width, event_bg_height: check.info.height,
            event_layout: nextLayout,
          })
          .eq('id', placeId).eq('truck_id', truck.id)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        if (old && old !== path) await supabase.storage.from(BUCKET).remove([old])
        return NextResponse.json({
          ok: true, url: await signed(path), width: check.info.width, height: check.info.height,
          layout: nextLayout,
        })
      }

      // one-off: keyed by the event
      const eventId = String(body.eventId ?? '')
      const { data: ev } = await supabase.from('truck_events')
        .select('id').eq('id', eventId).eq('truck_id', truck.id).maybeSingle()
      if (!ev) { await supabase.storage.from(BUCKET).remove([path]); return NextResponse.json({ error: 'Event not found' }, { status: 404 }) }

      /* 🔴 A ONE-OFF MUST MATCH THE SHAPE OF THE DESIGN IT WOULD OTHERWISE HAVE USED, which is this
       * place's design when the place has its own positions — not always the Standard one. A one-off
       * replaces the picture and inherits the positions, so it is those positions' canvas it has to
       * fit. `eventPostContext` already decides that, and `canvas` is its answer; re-deriving it here
       * would be a second copy of the rule. `oneOffMustMatch` is the same rule as a pure function, and
       * is what the harness drives. */
      const target = await eventPostContext(truck, eventId, eventDesign)
      if ('error' in target) {
        await supabase.storage.from(BUCKET).remove([path])
        return NextResponse.json({ error: target.error }, { status: target.status })
      }
      const aspect = checkAspect(check.info.width, check.info.height, target.canvas.width, target.canvas.height)
      if (!aspect.ok) {
        await supabase.storage.from(BUCKET).remove([path])
        return NextResponse.json({ error: aspect.error }, { status: 400 })
      }

      const { data: prior } = await supabase.from('event_post_backgrounds')
        .select('path').eq('event_id', eventId).maybeSingle()
      const { error } = await supabase.from('event_post_backgrounds').upsert({
        event_id: eventId, truck_id: truck.id, path,
        width: check.info.width, height: check.info.height, updated_at: new Date().toISOString(),
      }, { onConflict: 'event_id' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      const oldPath = (prior as { path?: string } | null)?.path
      if (oldPath && oldPath !== path) await supabase.storage.from(BUCKET).remove([oldPath])
      return NextResponse.json({ ok: true, url: await signed(path), width: check.info.width, height: check.info.height })
    }

    /* ══ THE EVENT DESIGN'S OWN DEFAULT PICTURE ═══════════════════════════════════════
     * 🔴 REPLACING IT WITH A DIFFERENT SHAPE RESETS THE BOXES, exactly as the week design does — and
     * additionally reports which PLACE pictures no longer fit. Those are kept, not deleted: a truck who
     * re-exported their default has not asked to throw away per-place artwork, and deleting it on their
     * behalf cannot be undone. */
    if (which === 'event-default') {
      const { design: prior } = await loadDesign(truck.id, EVENT_KIND)
      const sameSize = prior && prior.width === check.info.width && prior.height === check.info.height
      const layout = sameSize && prior?.layout ? prior.layout : defaultEventLayout(check.info.width, check.info.height)
      const oldPath = prior?.blank_path
      const { error } = await supabase.from('truck_post_designs').upsert({
        truck_id: truck.id, kind: EVENT_KIND, blank_path: path,
        width: check.info.width, height: check.info.height, layout,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'truck_id,kind' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (oldPath && oldPath !== path) await supabase.storage.from(BUCKET).remove([oldPath])
      const { data: places } = await supabase.from('truck_places')
        .select('id, name, event_bg_path, event_bg_width, event_bg_height')
        .eq('truck_id', truck.id)
      const stranded = placePicturesThatNoLongerFit(
        (places ?? []).map((pl: Record<string, unknown>) => ({
          id: String(pl.id), name: String(pl.name ?? ''),
          image: pl.event_bg_path ? { path: String(pl.event_bg_path), width: (pl.event_bg_width as number) ?? null, height: (pl.event_bg_height as number) ?? null } : null,
        })),
        check.info.width, check.info.height)
      return NextResponse.json({
        ok: true, width: check.info.width, height: check.info.height,
        layout, resetLayout: !sameSize, blankUrl: await signed(path),
        strandedPlaces: stranded,
      })
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

  // ══════════════════════════════════════════════════════════════════════════════════════════
  // STAGE 2 · THE SINGLE-EVENT POST
  // ══════════════════════════════════════════════════════════════════════════════════════════

  /** The event design, the places and their pictures — everything the setup screen needs. */
  if (action === 'event_load') {
    const { missingTable, design } = await loadDesign(truck.id, EVENT_KIND)
    const today = todayInWeekTz()
    const EV_COLS = 'id, event_date, start_time, end_time, status, venue_name, venue_id, truck_place_id, town'
    const [{ data: places }, { data: upcoming }, { data: past }] = await Promise.all([
      supabase.from('truck_places')
        .select('id, venue_id, name_key, name, short_name, area, merged_into_id, is_hidden, is_favourite, event_bg_path, event_bg_width, event_bg_height, event_layout')
        .eq('truck_id', truck.id),
      /* 🔴 THE SETUP PREVIEW USES THE TRUCK'S OWN REAL EVENTS, so what they are placing boxes on is
       * their own poster rather than invented words of a length nothing will ever be.
       * ⚠️ BOTH DIRECTIONS ARE LOADED, because a design for a place with nothing coming up previews on
       * the LAST event there. Bounded at 200 each: a truck with more than 200 events on one side of
       * today still gets a preview, just possibly from the generic fallback. */
      supabase.from('truck_events').select(EV_COLS)
        .eq('truck_id', truck.id).gte('event_date', today)
        .order('event_date', { ascending: true }).limit(200),
      supabase.from('truck_events').select(EV_COLS)
        .eq('truck_id', truck.id).lt('event_date', today)
        .order('event_date', { ascending: false }).limit(200),
    ])
    const allPlaces = (places ?? []) as Record<string, unknown>[]
    const visible = allPlaces.filter(pl => pl.is_hidden !== true)
    /* ⚠️ FAVOURITES FIRST, then by name — the order the places list and the Add event picker use, so
     * the three screens do not present the same list in three orders. */
    visible.sort((a, b) => {
      const fa = a.is_favourite === true ? 0 : 1
      const fb = b.is_favourite === true ? 0 : 1
      return fa !== fb ? fa - fb : String(a.name ?? '').localeCompare(String(b.name ?? ''))
    })
    const W = design?.width ?? 0, H = design?.height ?? 0
    const standardLayout = (design?.layout ?? null) as EventLayout | null
    const ts = standardLayout?.timeStyle ?? '12h'

    /* 🔴 THE PREVIEW EVENT IS CHOSEN BY THE SAME PLACE RESOLVER THE POSTER USES — `entryFor`, which
     * follows `truck_place_id`, then the venue anchor, then the normalised name, and now returns the
     * place's id. Matching the preview by name here while the poster matched by id would preview one
     * place's design on another place's event. */
    const placeIdOfEvent = (e: Record<string, unknown>) =>
      entryFor(e as never, allPlaces as never, ts).placeId
    const firstAt = (rows: Record<string, unknown>[] | null, placeId: string) =>
      (rows ?? []).find(e => placeIdOfEvent(e) === placeId) ?? null

    /** The generic fallback: the truck's next event anywhere, whoever it belongs to. */
    const anyNext = (upcoming ?? [])[0] ?? (past ?? [])[0] ?? null

    const previewFor = (placeId: string | null) => {
      if (!placeId) {
        return { eventId: anyNext ? String(anyNext.id) : null, label: null as string | null, substituteName: false }
      }
      const next = firstAt(upcoming as never, placeId)
      if (next) return { eventId: String(next.id), label: null as string | null, substituteName: false }
      const last = firstAt(past as never, placeId)
      /* 🔴 THE LABEL IS NOT DECORATION. Previewing a design on an event that already happened, with no
       * sign of it, would have a truck checking their artwork against a date in the past and believing
       * it is what they are about to post. */
      if (last) return { eventId: String(last.id), label: 'Preview uses your last event here', substituteName: false }
      /* ⚠️ NO EVENT HERE AT ALL ⇒ the next event ANYWHERE, with this place's name put in, so the boxes
       * can still be judged against text of a realistic length. Flagged, because the date and time on
       * screen belong to a different booking. */
      return {
        eventId: anyNext ? String(anyNext.id) : null,
        label: 'No events here yet — preview shows your next event with this place’s name',
        substituteName: true,
      }
    }

    const designs = await Promise.all(visible
      /* 🔴 A PLACE IS IN THE DESIGNS LIST ONLY IF IT HAS SOMETHING OF ITS OWN — a picture or its own
       * positions. "+ Add a design for a place" picks from the full list; nothing is written until the
       * truck actually gives that place a picture or switches it to its own positions, so cancelling
       * halfway leaves no half-design behind and this list never names one that does not exist. */
      .filter(pl => !!pl.event_bg_path || !!pl.event_layout)
      .map(async pl => {
        const pw = (pl.event_bg_width as number) ?? null
        const ph = (pl.event_bg_height as number) ?? null
        const ownPositions = !!pl.event_layout
        const fits = !!(W && H && pw && ph && checkAspect(pw, ph, W, H).ok)
        return {
          placeId: String(pl.id),
          name: String(pl.short_name ?? '').trim() || String(pl.name ?? ''),
          fullName: String(pl.name ?? ''),
          area: pl.area ?? null,
          mode: ownPositions ? 'own' as const : 'standard' as const,
          imageUrl: pl.event_bg_path ? await signed(String(pl.event_bg_path)) : null,
          width: pw, height: ph,
          /* ⚠️ THE PLACE'S LAYOUT IS SENT AT ITS OWN SIZE. The editor scales for display; it must not
           * be handed Standard's dimensions for a canvas that is a different shape. */
          layout: (pl.event_layout ?? null),
          /* Kept for the existing "Background for each place" behaviour this list replaces. */
          fitsDefault: fits,
          status: placeDesignStatus({ hasPicture: !!pl.event_bg_path, ownPositions, fitsDefault: fits }),
          preview: previewFor(String(pl.id)),
        }
      }))

    return NextResponse.json({
      missingTable,
      design: design ? {
        width: design.width, height: design.height, layout: design.layout,
        backgroundUrl: await signed(design.blank_path),
        status: 'Used at every other place',
        preview: previewFor(null),
      } : null,
      designs,
      /* The picker's list: every visible place, favourites first — the same list Add event offers. */
      places: visible.map(pl => ({
        id: pl.id,
        name: String(pl.short_name ?? '').trim() || String(pl.name ?? ''),
        fullName: String(pl.name ?? ''),
        area: pl.area ?? null,
        isFavourite: pl.is_favourite === true,
        hasDesign: !!pl.event_bg_path || !!pl.event_layout,
        /* ⚠️ EVERY VISIBLE PLACE CARRIES ITS PREVIEW, not just the ones with a design, so picking a
         * place from "+ Add a design for a place" can show its preview immediately rather than after a
         * second round trip — and before anything has been written for it. */
        preview: previewFor(String(pl.id)),
      })),
      nextEvents: (upcoming ?? []).map((e: Record<string, unknown>) => ({ id: e.id, date: e.event_date })),
    })
  }

  /* ── A PLACE'S TEXT POSITIONS: SAME AS STANDARD, OR ITS OWN ─────────────────────────────────── */
  if (action === 'event_place_mode') {
    const placeId = String(body.placeId ?? '')
    const mode = body.mode === 'own' ? 'own' : 'standard'
    const { design } = await loadDesign(truck.id, EVENT_KIND)
    if (!design?.width || !design.height) return NextResponse.json({ error: 'Set up your event post design first.' }, { status: 400 })
    const { data: place } = await supabase.from('truck_places')
      .select('id, event_bg_width, event_bg_height, event_layout')
      .eq('id', placeId).eq('truck_id', truck.id).maybeSingle()
    if (!place) return NextResponse.json({ error: 'Place not found' }, { status: 404 })
    const row = place as { event_bg_width?: number | null; event_bg_height?: number | null; event_layout?: unknown }

    if (mode === 'standard') {
      /* 🔴 REFUSED WHEN THE SHAPES DO NOT MATCH, with a sentence that says what to do. Standard's boxes
       * were measured on Standard's canvas; dropping them onto a differently shaped picture puts text
       * off the edge of artwork the truck is about to post. Silently scaling them would be worse than
       * refusing: it would look like it worked. */
      const differs = !!row.event_bg_width && !!row.event_bg_height
        && !checkAspect(row.event_bg_width, row.event_bg_height, design.width, design.height).ok
      if (differs) return NextResponse.json({ error: BACK_TO_STANDARD_REFUSAL }, { status: 400 })
      const { error } = await supabase.from('truck_places')
        .update({ event_layout: null }).eq('id', placeId).eq('truck_id', truck.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, mode, layout: null })
    }

    /* 🔴 OWN POSITIONS START FROM STANDARD'S BOXES, SCALED, not from the generic defaults. The truck
     * has already arranged those three boxes once; the reason to switch is almost always to move one
     * of them on this one picture. Scaling is proportional, which is right here because the canvas is
     * either the same shape or the boxes are about to be dragged anyway. */
    const w = row.event_bg_width || design.width
    const h = row.event_bg_height || design.height
    const scaled = scaleEventLayout(design.layout ?? defaultEventLayout(w, h), w, h)
      ?? defaultEventLayout(w, h)
    const { error } = await supabase.from('truck_places')
      .update({ event_layout: scaled }).eq('id', placeId).eq('truck_id', truck.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, mode, layout: scaled })
  }

  /** Save one place's own boxes. */
  if (action === 'event_place_save_layout') {
    const placeId = String(body.placeId ?? '')
    const { design } = await loadDesign(truck.id, EVENT_KIND)
    if (!design?.width || !design.height) return NextResponse.json({ error: 'Set up your event post design first.' }, { status: 400 })
    const { data: place } = await supabase.from('truck_places')
      .select('id, event_bg_width, event_bg_height, event_layout')
      .eq('id', placeId).eq('truck_id', truck.id).maybeSingle()
    if (!place) return NextResponse.json({ error: 'Place not found' }, { status: 404 })
    const row = place as { event_bg_width?: number | null; event_bg_height?: number | null; event_layout?: unknown }
    if (!row.event_layout) return NextResponse.json({ error: 'This place uses the standard text positions.' }, { status: 400 })

    /* 🔴 THE CANVAS COMES FROM THE STORED PICTURE SIZE, NEVER FROM THE REQUEST. The size is the only
     * thing that proves a box sits inside the picture; taking it from the body would let a caller
     * claim any canvas and place text outside the artwork, and the bounds check would pass. */
    const w = row.event_bg_width || design.width
    const h = row.event_bg_height || design.height
    const v = validateEventLayout(body.layout, w, h)
    if (!v.ok || !v.layout) return NextResponse.json({ error: v.errors[0] ?? 'That design could not be saved.', errors: v.errors }, { status: 400 })
    const { error } = await supabase.from('truck_places')
      .update({ event_layout: v.layout }).eq('id', placeId).eq('truck_id', truck.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, layout: v.layout })
  }

  if (action === 'event_save_design') {
    const { design } = await loadDesign(truck.id, EVENT_KIND)
    if (!design) return NextResponse.json({ error: 'Upload your event picture first.' }, { status: 400 })
    const v = validateEventLayout(body.layout, design.width ?? 0, design.height ?? 0)
    if (!v.ok || !v.layout) return NextResponse.json({ error: v.errors[0] ?? 'That design could not be saved.', errors: v.errors }, { status: 400 })
    const { error } = await supabase.from('truck_post_designs')
      .update({ layout: v.layout, updated_at: new Date().toISOString() })
      .eq('truck_id', truck.id).eq('kind', EVENT_KIND)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, layout: v.layout })
  }

  /**
   * Remove this place's design.
   *
   * 🔴 IT REMOVES THE PICTURE **AND** THE POSITIONS, because the list offers one thing — "this place's
   * design" — and leaving the positions behind would keep the place in the designs list with nothing in
   * it, still overriding Standard's boxes on Standard's picture. The stored object is deleted too: it
   * is private, unreferenced from that moment, and nothing else ever lists the bucket.
   * ⚠️ THE OLD ACTION NAME IS STILL ACCEPTED (`event_remove_place_bg`) so a browser left open on the
   * previous build does not get "Unknown action" from a button that used to work.
   */
  if (action === 'event_remove_place_design' || action === 'event_remove_place_bg') {
    const placeId = String(body.placeId ?? '')
    const { data: place } = await supabase.from('truck_places')
      .select('id, event_bg_path').eq('id', placeId).eq('truck_id', truck.id).maybeSingle()
    if (!place) return NextResponse.json({ error: 'Place not found' }, { status: 404 })
    const old = (place as { event_bg_path?: string | null }).event_bg_path
    const { error } = await supabase.from('truck_places')
      .update({ event_bg_path: null, event_bg_width: null, event_bg_height: null, event_layout: null })
      .eq('id', placeId).eq('truck_id', truck.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (old) await supabase.storage.from(BUCKET).remove([old])
    return NextResponse.json({ ok: true })
  }

  /** One event's post: which designs it can use, which is chosen, and the text. */
  if (action === 'event_post') {
    const eventId = String(body.eventId ?? '')
    const { design } = await loadDesign(truck.id, EVENT_KIND)
    const ctx = await eventPostContext(truck, eventId, design)
    if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
    const layout = (design?.layout ?? null) as EventLayout | null
    const text = eventPostText({
      truckName: truck.name, entry: ctx.entry, date: ctx.date,
      orderUrl: truck.slug ? scanUrl(truck.slug) : null,
      timeStyle: layout?.timeStyle ?? '12h', now: new Date(),
    })
    return NextResponse.json({
      hasDesign: !!design,
      event: { id: eventId, date: ctx.date, name: ctx.entry.name, town: ctx.entry.town, time: ctx.entry.time, status: ctx.entry.status },
      options: ctx.options,
      chosen: ctx.chosen.source,
      /* ⚠️ THE MODAL IS TOLD WHOSE POSITIONS IT IS GETTING, not just whose picture. Choosing
       * "Standard design" at a place that has its own moves the text as well as the background, and a
       * screen that said only "Standard picture" would be describing half of what happened. */
      layoutSource: ctx.layoutSource,
      placeName: ctx.placeName,
      text,
    })
  }

  if (action === 'event_render') {
    const eventId = String(body.eventId ?? '')
    const { design } = await loadDesign(truck.id, EVENT_KIND)
    if (!design) return NextResponse.json({ error: 'No event design yet.' }, { status: 400 })

    const forced = String(body.background ?? '')
    const ctx = await eventPostContext(truck, eventId, design, forced || null)
    if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

    /* ── WHICH DESIGN IS BEING DRAWN ──────────────────────────────────────────────────────────────
     * 🔴 THREE CALLERS, ONE RENDERER.
     *   • The setup screen previewing STANDARD: sends `layout` (the live, unsaved boxes) and no place.
     *   • The setup screen previewing a PLACE's design: sends `layout` and `designPlaceId`, and gets
     *     that place's picture, that place's canvas, and that place's NAME in the location box — even
     *     when the preview event belongs elsewhere, which is the "no events here yet" fallback.
     *   • The make-post modal: sends neither, and gets exactly what `eventPostContext` resolved.
     *
     * ⚠️ THE NAME SUBSTITUTION IS DECIDED FROM THE PLACE ID, SERVER-SIDE. Letting the client send the
     * name would put arbitrary text on a poster through a path that renders it at any size. */
    const designPlaceId = typeof body.designPlaceId === 'string' && body.designPlaceId ? String(body.designPlaceId) : null
    let canvas = ctx.canvas
    let picked = ctx.chosen
    let entry = ctx.entry

    if (designPlaceId) {
      const { data: place } = await supabase.from('truck_places')
        .select('id, name, short_name, event_bg_path, event_bg_width, event_bg_height')
        .eq('id', designPlaceId).eq('truck_id', truck.id).maybeSingle()
      if (!place) return NextResponse.json({ error: 'Place not found' }, { status: 404 })
      const row = place as Record<string, unknown>
      const pw = (row.event_bg_width as number) ?? null
      const ph = (row.event_bg_height as number) ?? null
      if (row.event_bg_path && pw && ph) {
        picked = { source: 'place', path: String(row.event_bg_path) }
        canvas = { width: pw, height: ph }
      } else {
        /* ⚠️ A DESIGN WITH NO PICTURE OF ITS OWN PREVIEWS ON STANDARD'S, which is what it will render
         * on. Showing nothing would leave the truck dragging boxes over a blank rectangle. */
        picked = { source: 'default', path: design.blank_path! }
        canvas = { width: design.width ?? 0, height: design.height ?? 0 }
      }
      const nm = String(row.short_name ?? '').trim() || String(row.name ?? '')
      if (nm) entry = { ...entry, name: nm, placeId: designPlaceId }
    }

    /* 🔴 THE LAYOUT IS VALIDATED AGAINST THE CANVAS IT WILL BE DRAWN ON — the place's picture size for a
     * place design, the design's for Standard. Validating a place's boxes against Standard's size is
     * how text ends up outside a differently shaped picture. */
    const v = validateEventLayout(
      body.layout ?? ctx.layout ?? design.layout,
      canvas.width, canvas.height,
    )
    if (!v.ok || !v.layout) return NextResponse.json({ error: v.errors[0] ?? 'That design could not be rendered.' }, { status: 400 })

    const bytes = await downloadObject(picked.path)
    if (!bytes) return NextResponse.json({ error: 'That picture could not be read.' }, { status: 500 })
    const info = readImageInfo(bytes)
    if (!info) return NextResponse.json({ error: 'That picture could not be read.' }, { status: 500 })

    const out = await renderEventPost({
      layout: v.layout, entry, date: ctx.date,
      backgroundDataUri: toDataUri(bytes, info),
      note: typeof body.note === 'string' ? body.note : null,
    })
    return new NextResponse(new Uint8Array(out.png), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `inline; filename="event-post-${ctx.date}.png"`,
        'Cache-Control': 'no-store',
        'X-Render-Ms': String(out.ms),
        'X-Background-Source': picked.source,
        'X-Layout-Source': designPlaceId ? 'place' : ctx.layoutSource,
        'X-Render-Warnings': encodeURIComponent(JSON.stringify(out.warnings)),
      },
    })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
