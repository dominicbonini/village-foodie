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
/* 🔴 THE PLAN SENTENCE, SHARED WITH THE SCREEN. See the note in that file for why it is not declared
 * here: the component needs it too, and a route file cannot be imported into the client bundle. */
import { WEEKLY_POST_PLAN_REFUSAL } from '@/lib/copy/weeklyPost'
import { scanUrl } from '@/lib/custom-domain/copy'
import type { Place } from '@/lib/schedule-graphics/places'
/* 🔴 THE SHARED PLACE RULES, for `social_overview`. `groupEventsByPlace` follows `merged_into_id`, so a
 * merged pitch's events land on its target here exactly as they do on every other screen; a second,
 * weaker match would give one place two different "next" events depending on which screen asked. */
import { groupEventsByPlace, placeForEvent, countsAsUpcoming } from '@/lib/schedule-graphics/places'
import { buildWeekData, busyWeekData, type WeekEvent } from '@/lib/weekly-post/week-data'
/* 🔴 ONE FUNCTION DECIDES THE COUNTRY, AND THIS ROUTE IS WHERE IT IS CALLED. It returns 'GB' for
 * everyone today because `trucks` has no country column; the point is that every date in the product
 * already asks it, so the day the column lands nothing else changes. ⛔ NO COMPONENT AND NO FORMATTER
 * MAY DEFAULT TO 'GB' ITSELF — that would be a second answer to the same question. */
import { countryForTruck } from '@/lib/weekly-post/locale'
import {
  defaultLayout, defaultEventLayout, rowsFitWarning, validateLayout, validateEventLayout,
  /* 🔴 THE ONE DOOR IN FOR A **STORED** LAYOUT (7 October 2026). The validators above guard every
   * WRITE; these two guard every READ, which is the half that was missing and that crashed the editor
   * on a design saved before part 1. See the note at the tail of lib/weekly-post/layout.ts. */
  readStoredLayout, readStoredEventLayout,
  scaleEventLayout, MAX_UPLOAD_BYTES, MIN_UPLOAD_SHORT_SIDE, type EventLayout, type Layout,
} from '@/lib/weekly-post/layout'
import {
  checkAspect, placePicturesThatNoLongerFit, resolveDesign, oneOffMustMatch,
  placePictureNeedsDefaultShape,
} from '@/lib/weekly-post/backgrounds'
import { renderEventPost } from '@/lib/weekly-post/render'
/* 🔴 PRIVATE EVENTS (20261014): "Private event" with the date and times, and no single-event post. */
import { readPrivateEventIds } from '@/lib/private-events/read'
import { PRIVATE_NO_SINGLE_POST } from '@/lib/private-events/copy'
import { entryFor } from '@/lib/weekly-post/week-data'
import { checkUpload, readImageInfo, toDataUri } from '@/lib/weekly-post/image-info'
/* 🔴 "IS THIS DESIGN SET UP?", ANSWERED ONCE. Four readers in this file were asking it four different
 * ways and the screens they feed applied a fifth — see the header of that file for the two directions
 * in which they disagreed. Every `design ? …` in this route goes through it now. */
import { designIsReady } from '@/lib/weekly-post/ready'
import { renderWeeklyPost } from '@/lib/weekly-post/render'
import { bundledFontFiles } from '@/lib/weekly-post/fonts'
/* ⚠️ A TYPE BRIDGE ONLY — the bundle holds `Uint8Array` so the live editor can build one in the
 * browser, and satori's own types ask for a `Buffer`. See its note in `font-bundle.ts`. */
import { asFontBuffer } from '@/lib/weekly-post/font-bundle'
import {
  cataloguePayload, catalogueFamily, isChoosableLibraryFont,
} from '@/lib/weekly-post/font-catalogue'
import {
  FONT_BUCKET, ensureLibraryFamily, fetchLibraryFaces, loadFontsForDesign, ownPath,
  type FontRegistry, type FontStorage, type LibraryFaceRow, type OwnFaceRow, type StoreDeps,
} from '@/lib/weekly-post/font-store'
import {
  FACES, MAX_FONT_BYTES, WOFF_REFUSAL, faceKey, ownFontId, parseFontId, slugOfFamily,
} from '@/lib/weekly-post/font-refs'
import { faceOfFont, lineHeightPx, measureText, readFontMetrics, readFontNames } from '@/lib/weekly-post/ttf-metrics'
import { ImageResponse } from 'next/og'
import { fontsUsedBy, fontsUsedByEvent } from '@/lib/weekly-post/layout'
import {
  LEGACY_PICTURE_LABEL, inGridOrder, isLegacyPictureId, labelOf, legacyMainPicture, mainPicture,
  usableAsWholeBackground, resolveSlots,
  /* ── 8 October 2026: the poster/picture model. ⛔ FOUR NAMES LEFT THIS IMPORT ON 9 OCTOBER:
   * `eventImageMode` (the design no longer decides what a location's image means — its own note at the
   * `event_post` branch says so), and `asPictureUse` / `PICTURE_USES` / `PictureUse`, which went with
   * `place_picture_use`. All four are still exported from place-pictures.ts; nothing on this route
   * reads or writes `picture_use` any more, which is what §7 asks for. */
  resolveLocationImages, planEventImages, weeklyPictureFor, eventPictureFor,
  type LocationImages,
} from '@/lib/weekly-post/place-pictures'
import { normaliseSocialTag } from '@/lib/weekly-post/social-tag'
import type { PictureSlot, PlacePicture, PlaceSlots } from '@/lib/weekly-post/place-pictures'

/** 🔴 THE THREE SLOT NAMES A REQUEST MAY NAME. ⚠️ `PictureSlot` is the LIBRARY's two; this is the
 *  wire's three, and the extra one is the weekly-only override added on 9 October. */
type SlotName = PictureSlot | 'event-photo'
/* ══ 🔴 THREE SLOT NAMES, ONE PER JOB (9 October 2026) ════════════════════════════════════════════
 * ⛔ `'weekly-only'` IS GONE AND `'event-photo'` REPLACES IT. The override it wrote is replaced by a
 * picture per surface, and 20261022 emptied its column — so a request naming it is now a request
 * against a column nothing reads, and the honest answer is the refusal below rather than a silent
 * write. ⚠️ A STALE BROWSER TAB IS EXACTLY THE CASE: it would post `'weekly-only'`, and "That is not a
 * picture slot." is both true and the right thing for the operator to see before they reload. */
const SLOT_NAMES = ['event', 'weekly', 'event-photo'] as const
/**
 * ══ 🔴 AN UNKNOWN SLOT NAME IS A REFUSAL, NOT A DEFAULT (9 October 2026) ═════════════════════════
 *
 * ⛔ IT RETURNED `'weekly'` FOR ANYTHING IT DID NOT RECOGNISE, and that was wrong in the quietest
 * possible way. `slot` arrives from a client; a typo, a stale build or a renamed constant therefore did
 * not fail — it hit the LOCATION PICTURE, the one slot used by every design on both surfaces. A local
 * check posted `slot: 'not-a-slot'` to `place_slot_clear` and got `200 {ok:true}` back having cleared a
 * real location's picture.
 * 🔴 IT WAS SURVIVABLE WITH TWO NAMES AND IS NOT WITH THREE. `'weekly-only'` and `'weekly'` differ by a
 * suffix, so the misspelling most likely to happen is the one that lands on the slot with the most to
 * lose — and an operator whose picture vanished would have no way to tell that from a bug in the
 * upload. ⚠️ A WRITE THAT CANNOT NAME ITS TARGET MUST NOT GUESS AT ONE.
 */
const asSlotName = (v: unknown): SlotName | null =>
  (SLOT_NAMES as readonly string[]).includes(String(v)) ? (String(v) as SlotName) : null
/** The refusal, in one place so all three call sites say the same thing. */
const badSlot = () =>
  NextResponse.json({ error: 'That is not a picture slot.' }, { status: 400 })
/* ── 8 October 2026: saved captions, with labels where the facts go. */
import {
  seedWeekTemplate, seedEventTemplate, fillCaptionTemplate,
  weekCaptionValues, eventCaptionValues,
} from '@/lib/weekly-post/caption-template'
import { weekRange, defaultWeekChoice, todayInWeekTz, type WeekChoice } from '@/lib/weekly-post/week'
import { eventPostText, shortDate } from '@/lib/weekly-post/caption'

/** 🔴 THE RENDER IS THE SLOW PATH and it is ~40ms warm; 30s matches /api/manage and leaves room for a
 *  cold start that has to parse five font files. */
export const maxDuration = 30

const BUCKET = 'post-designs'
const KIND = 'week'
/** 🔴 THE SECOND KIND (stage 2). `truck_post_designs`'s unique key is `(truck_id, kind)`, written
 *  that way in stage 1 so this could be added as one more row per truck rather than a parallel table. */
const EVENT_KIND = 'event'

/* 🔴 ONE SENTENCE FOR "the database has not been updated yet", NAMED BY FILE. A truck seeing "could
 * not save" has nothing to do; an operator seeing the file name forwards it to whoever runs SQL.
 * ⚠️ IT NAMES THE **NEWEST** MIGRATION THIS ROUTE NEEDS, which is the one that is actually missing when
 * this fires: the earlier ones are applied. ⛔ IT MOVED TO 20261022 ON 9 OCTOBER and the old text —
 * naming 20261020 — is why: a local check hit this sentence with 20261020 already run, and an operator
 * following it would have re-run a migration that was fine and still had a broken screen.
 * ⚠️ SHARED BY EVERY READER AND WRITER THAT NAMES A SLOT COLUMN, so they cannot drift into different
 * answers — including `social_overview`'s own read, which is the one that found this. */
const MIGRATION_NEEDED =
  'Location pictures need a database update — run '
  + 'supabase/migrations/20261022_three_location_pictures.sql first.'
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

/** The gate. ⚠️ Returns the same message the UI shows, so a blocked call and a blocked screen agree.
 *
 * ══ 🔴 ONE KEY, AND IT FOLLOWS THE PLAN (10 October 2026 · launch) ════════════════════════════════
 *
 * ⛔ **IT WAS TWO KEYS AND BOTH HAD TO PASS.** `places_posts_preview` asked "is this surface finished
 * for this truck?" — a Feature in no plan set, held only through `trucks.feature_overrides` and granted
 * to exactly one truck — and `schedule_graphics` asked "may this plan have social posts at all?".
 * Social media is launched, so the first question no longer exists, and the key that asked it is gone
 * from `lib/features.ts`. ⚠️ THE DATABASE ROW IS LEFT ALONE AND IS INERT: `canAccess` only looks up a
 * key it is given, so an override naming a key that is no longer a `Feature` changes nothing.
 *
 * 🔴 `schedule_graphics` MOVED FROM `MAX_FEATURES` TO `PRO_FEATURES` IN THE SAME EDIT, which is what
 * makes the comparison table's 'Social media posts' row (`pro: true, max: true`) true — and that row
 * is now mapped to this key, so `findPlanParityViolations()` checks the promise against this gate on
 * every module load.
 *
 * ⚠️ IT GUARDS EVERY ACTION IN THIS FILE, which is deliberate: `gated` is called once at the top of
 * POST **and** once at the top of GET, so the weekly render and save, the single event's `event_post`
 * / `event_render`, the uploads, the caption writes and the font file are all behind it. There is no
 * other entry point.
 */
function gated(truck: TruckRow): NextResponse | null {
  const ok = canAccess(
    truck.plan as never,
    'schedule_graphics' as never,
    truck.feature_overrides ?? undefined,
    truck.trial_expires_at ?? undefined,
  )
  /* ⚠️ THE SENTENCE NAMES **Pro**, AND IT IS SHARED. `schedule_graphics` is in `PRO_FEATURES` now, so
   * "The weekly post is on Max" became a lie the moment the key moved — it would send a Starter truck
   * to buy the wrong plan. ⛔ ONE COPY, IN `lib/copy/weeklyPost.ts`, because this claim was written out
   * twice once before and both copies were wrong the same way. ⚠️ TRIAL, TESTER AND DEMO ALSO PASS,
   * because `TRIAL_FEATURES` spreads `MAX_FEATURES`; the sentence names the plan a paying truck buys,
   * which is what an upgrade prompt is for. */
  return ok ? null : NextResponse.json({ error: WEEKLY_POST_PLAN_REFUSAL }, { status: 403 })
}

async function loadDesign(truckId: string, kind: DesignKind = KIND) {
  const { data, error } = await supabase
    .from('truck_post_designs')
    /* ⚠️ `caption_template` JOINED THE SELECT ON 8 OCTOBER. Every screen that needs a caption has
     * already loaded the design row it belongs to, which is the whole reason the column lives here
     * rather than in a table of its own — see the migration's header. */
    .select('id, blank_path, example_path, width, height, layout, updated_at, caption_template')
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

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 A PLACE'S PICTURE LIBRARY (18 October 2026, part 3)
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// A place HAS PICTURES; each design decides how it uses them. The reading is here because it is the
// one thing every surface needs — the Designs box, a place's pictures page, both renderers and the
// make-post modal — and because it has to merge TWO sources:
//
//   1. rows in `public.place_pictures`, and
//   2. 🔴 the LEGACY picture — `truck_places.event_bg_path` — which has no row and is MAPPED ON READ.
//
// ⛔ NOTHING WAS COPIED OR MOVED BY THE MIGRATION, AND THAT IS THE SAFER CHOICE, NOT A SHORTCUT. An
// `insert` would make the library a second source of truth for a picture `resolveDesign` still reads
// out of `truck_places`, so the two could disagree the moment either was edited. Mapping leaves exactly
// ONE source for today's behaviour until the operator touches that place's pictures, at which point
// `materialiseLegacy` writes the row and the library takes over. For any given place, only one of the
// two ever applies — so nothing can drift. The full argument is in docs/place-pictures-report.md §2.

/** A row as the table stores it. */
type PlacePictureRow = {
  id: string; place_id: string; path: string; file_name: string
  bytes: number; width: number | null; height: number | null
  is_main: boolean; label: string | null; sort_order: number; created_at: string
}

const PICTURE_COLS = 'id, place_id, path, file_name, bytes, width, height, is_main, label, sort_order, created_at'

const toPicture = (r: PlacePictureRow): PlacePicture => ({
  id: String(r.id),
  path: String(r.path),
  label: labelOf(r),
  fileName: String(r.file_name ?? ''),
  width: r.width ?? null,
  height: r.height ?? null,
  isMain: r.is_main === true,
  sortOrder: Number(r.sort_order ?? 0),
  createdAt: String(r.created_at ?? ''),
})

/**
 * Every picture for the given places, merged with the legacy one.
 *
 * 🔴 ONE READ FOR EVERY PLACE ASKED ABOUT — never one call per place. The Designs box lists twenty
 * places with a thumbnail each, and a loop there would be twenty round trips to draw twenty 28px
 * squares. `social_overview` already made that argument for the old single picture; this keeps it.
 *
 * ⚠️ A MISSING TABLE OR MISSING COLUMNS READS AS "no library". Before the migration the feature simply
 * does not work, and the existing place pictures still render through `truck_places` — which is
 * exactly what mapping-on-read buys: the screen degrades to today rather than breaking.
 */
async function readPlaceLibrary(
  truckId: string,
  places: readonly { id: string; event_bg_path?: string | null; event_bg_width?: number | null; event_bg_height?: number | null }[],
): Promise<Map<string, PlacePicture[]>> {
  const out = new Map<string, PlacePicture[]>()
  const ids = places.map(p => p.id)
  let rows: PlacePictureRow[] = []
  if (ids.length) {
    const { data, error } = await supabase.from('place_pictures')
      .select(PICTURE_COLS).eq('truck_id', truckId).in('place_id', ids)
    if (!error) rows = (data ?? []) as PlacePictureRow[]
  }
  for (const pl of places) {
    const mine = rows.filter(r => String(r.place_id) === pl.id).map(toPicture)
    /* 🔴 THE LEGACY PICTURE IS ADDED **ONLY** WHERE THE LIBRARY IS EMPTY. Once a real row exists for
     * that place the operator has taken charge of it — and `materialiseLegacy` put the old picture in
     * as one of those rows — so adding it again would show it twice. */
    if (!mine.length) {
      const legacy = legacyMainPicture(pl)
      if (legacy) mine.push(legacy)
    }
    out.set(pl.id, inGridOrder(mine))
  }
  return out
}

/* ⚠️ THE TWO SLOT COLUMNS, SPELLED ONCE. Every select that needs them names this constant, so a
 * screen cannot be given a place row whose slots read as empty because one query forgot them — which
 * is a failure that looks exactly like "this location has no images" and is not visibly a bug. */
/* ⚠️ `picture_use` AND `social_tag` JOINED IT ON 8 OCTOBER. The constant's job is unchanged and is the
 * reason it exists: a select that forgot one of these would make every location read as "no images, no
 * tag" — a failure that looks exactly like the truth and is not visibly a bug. */
/* ⚠️ `weekly_only_picture_id` JOINED IT ON 9 OCTOBER — the optional override weekly posts use instead
 * of the location picture. ⛔ `picture_use` IS STILL SELECTED AND NO LONGER READ: the column stays
 * (dropping one is irreversible) and taking it out of the select would be a second change for no
 * benefit, but nothing downstream branches on it. */
const SLOT_COLS =
  /* ⚠️ `event_photo_picture_id` JOINED ON 9 OCTOBER — the EVENT POST picture, so a location has three
   * with three jobs. ⛔ `weekly_only_picture_id` AND `picture_use` ARE STILL SELECTED AND READ BY
   * NOTHING. They are kept in the list deliberately: the schema census asserts what EXISTS, both
   * columns do, and a `select` that stopped naming them would make the next reader wonder whether they
   * had been dropped — which the rules forbid and nobody did. 20261022 EMPTIED `weekly_only_picture_id`
   * (its value moved into `weekly_picture_id`), so it is null on every row. */
  'event_picture_id, weekly_picture_id, event_photo_picture_id, weekly_only_picture_id, picture_use, social_tag'

/**
 * ══ 🔴 A LOCATION'S **TWO** IMAGES, FOR EVERY LOCATION ASKED ABOUT, IN ONE READ ═══════════════════
 *
 * This replaces "the library, then pick the Main" everywhere a SCREEN or a RENDER asks what to draw.
 * The library is still underneath — `readPlaceLibrary` is what it reads — but the answer it gives is
 * the two slots, because two slots is the question. See lib/weekly-post/place-pictures.ts.
 *
 * ⚠️ IT DEGRADES TO TODAY IF THE MIGRATION HAS NOT BEEN RUN. `resolveSlots` reads two columns that may
 * not exist yet; a missing column arrives as `undefined`, the references read as empty, and the EVENT
 * slot falls back to the legacy `event_bg_path` mapping — which is exactly how every place renders
 * now. ⛔ SO AN UNRUN MIGRATION COSTS THE NEW FEATURE AND NOT THE OLD BEHAVIOUR, which is the same
 * bargain `readPlaceLibrary` struck and the reason the selects below use `maybeSlotCols`.
 */
async function readPlaceSlots(
  truckId: string,
  places: readonly {
    id: string
    event_picture_id?: string | null
    weekly_picture_id?: string | null
    event_bg_path?: string | null
    event_bg_width?: number | null
    event_bg_height?: number | null
  }[],
): Promise<Map<string, PlaceSlots>> {
  const library = await readPlaceLibrary(truckId, places as never)
  const out = new Map<string, PlaceSlots>()
  for (const pl of places) {
    out.set(pl.id, resolveSlots(library.get(pl.id) ?? [], pl))
  }
  return out
}

/**
 * Point one of a location's two slots at a picture, or clear it.
 *
 * ⛔ IT WRITES **ONLY** THE ONE COLUMN. Not `is_main`, not `event_bg_path`, not the other slot — a
 * location's two images are independent, and "Replace the event photo" must not disturb a weekly
 * picture that happens to be the same row.
 * 🔴 AND A CLEAR DELETES NOTHING. `null` on the column is the whole of "Remove": the `place_pictures`
 * row stays, the stored object stays, and pointing the slot back at it later costs one update. That is
 * rule 6 of the brief, and it is also the only behaviour that makes "Remove" a safe press.
 */
async function setPlaceSlot(
  truckId: string, placeId: string, slot: SlotName, pictureId: string | null,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  /* ⚠️ `weekly-only` IS THE THIRD SLOT SINCE 9 OCTOBER — the optional override weekly posts use
   * instead of the location picture. ⛔ IT IS ITS OWN COLUMN AND NOT A FLAG, because the override is a
   * DIFFERENT PICTURE: no flag on one row can hold two files. */
  const column = slot === 'event' ? 'event_picture_id'
    : slot === 'event-photo' ? 'event_photo_picture_id'
    : 'weekly_picture_id'
  const { error } = await supabase.from('truck_places')
    .update({ [column]: pictureId } as never)
    .eq('id', placeId).eq('truck_id', truckId)
  if (error) {
    const code = (error as { code?: string }).code
    /* 🔴 THE MIGRATION'S OWN NAME IN THE SENTENCE. A truck seeing "could not save" has nothing to do;
     * an operator seeing the file name forwards it to whoever runs SQL. The same shape
     * `place_picture_confirm` uses for the library's table. */
    if (code === 'PGRST204' || code === 'PGRST205' || code === '42703' || code === '42P01') {
      return {
        ok: false, status: 503,
        error: 'Location images need a database update — run supabase/migrations/20261019_place_picture_slots.sql first.',
      }
    }
    return { ok: false, status: 500, error: error.message }
  }
  return { ok: true }
}

/**
 * Write the legacy picture in as a real row, so it can be renamed, re-ordered or replaced as Main.
 *
 * ⛔ CALLED BEFORE EVERY MUTATION ON A PLACE WHOSE LIBRARY IS EMPTY, and it is the moment the library
 * becomes that place's source of truth. It points at the SAME object — nothing is copied, nothing is
 * uploaded, and `truck_places.event_bg_path` is left exactly where it is so a rollback still renders.
 *
 * ⚠️ `bytes` IS NOT NULL IN THE TABLE AND WE DO NOT KNOW IT, so it is read from `storage.objects`'
 * own metadata through the storage API. A file whose size cannot be read is given 1 rather than
 * failing the operator's click — the column's only job is the "name · size" line.
 */
async function materialiseLegacy(truckId: string, place: {
  id: string; event_bg_path?: string | null; event_bg_width?: number | null; event_bg_height?: number | null
}): Promise<void> {
  const legacy = legacyMainPicture(place)
  if (!legacy) return
  const { data: existing } = await supabase.from('place_pictures')
    .select('id').eq('truck_id', truckId).eq('place_id', place.id).limit(1)
  if ((existing ?? []).length) return

  let bytes = 1
  try {
    const dir = legacy.path.includes('/') ? legacy.path.slice(0, legacy.path.lastIndexOf('/')) : ''
    const name = legacy.path.slice(legacy.path.lastIndexOf('/') + 1)
    const { data: listed } = await supabase.storage.from(BUCKET).list(dir, { search: name, limit: 1 })
    const size = (listed ?? [])[0]?.metadata?.size
    if (typeof size === 'number' && size > 0 && size <= MAX_UPLOAD_BYTES) bytes = size
  } catch { /* the size is a label, not a gate */ }

  /* ⚠️ `ignoreDuplicates` ON THE PATH KEY. The unique index on `path` is what makes this safe to call
   * from two actions racing on one place: the loser's insert is a no-op rather than an error. */
  await supabase.from('place_pictures').upsert({
    truck_id: truckId,
    place_id: place.id,
    path: legacy.path,
    file_name: legacy.fileName,
    bytes,
    width: legacy.width,
    height: legacy.height,
    is_main: true,
    label: LEGACY_PICTURE_LABEL,
    sort_order: 0,
  } as never, { onConflict: 'path', ignoreDuplicates: true })
}

/** One place row, by id, scoped to this truck. ⚠️ Every mutation below starts here. */
async function placeById(truckId: string, placeId: string) {
  const { data } = await supabase.from('truck_places')
    .select(`id, name, short_name, area, is_hidden, event_bg_path, event_bg_width, event_bg_height, event_layout, ${SLOT_COLS}`)
    .eq('id', placeId).eq('truck_id', truckId).maybeSingle()
  return (data ?? null) as Record<string, unknown> | null
}

/**
 * The place pictures a RENDER needs, as data URIs.
 *
 * 🔴 FETCHED BEFORE THE RENDER STARTS — the same discipline as the fonts and the background, and for
 * the same reason: the renderer is synchronous and a render that fetched could time out on somebody's
 * poster. ⚠️ ONE DOWNLOAD PER DISTINCT PLACE, not per row: a week with three events at the same pub
 * downloads that logo once.
 *
 * ⛔ A PRIVATE EVENT'S PLACE IS NEVER IN THE LIST IT IS ASKED FOR, because `entryFor` nulls a private
 * booking's `placeId` — and the renderer refuses again on `entry.isPrivate`. Two defences, both here
 * on the server.
 */
async function placePictureSources(
  truckId: string, placeIds: readonly (string | null)[], wantLogo: boolean,
  /* ══ 🔴 **WHICH SURFACE IS ASKING** — NOT WHICH SLOT (8 October 2026) ═══════════════════════════
   * ⛔ IT WAS `slot: PictureSlot`, AND THAT PARAMETER IS NOW VESTIGIAL: this function only ever
   * fetches the LOCATION PICTURE. The event POSTER never comes through here — it replaces the whole
   * background, which the caller does by swapping the bytes, not by handing the renderer a box image.
   * 🔴 SO WHAT THE CALLER HAS TO SAY IS WHICH POSTER IT IS DRAWING, because `picture_use` is applied
   * differently on each:
   *   • `'weekly'` ⇒ filter here. A picture set to "Single event posts" must not appear beside its
   *     row on the weekly poster, and this is the one place a caller could forget that.
   *   • `'event'`  ⇒ do NOT filter here. `planEventImages` has already applied `pictureOnEvent`, and
   *     filtering again on `pictureOnWeekly` would drop exactly the pictures the event post wants.
   * ⚠️ THAT SECOND CASE IS WHY THIS IS A SURFACE AND NOT A SLOT: the first version filtered on
   * `slot === 'weekly'`, and since BOTH callers pass the weekly slot it silently dropped every
   * event-only picture out of the photo space it had just been told to draw. */
  surface: 'weekly' | 'event',
): Promise<{ byPlaceId: Record<string, string>; logo: string | null }> {
  const ids = [...new Set(placeIds.filter((v): v is string => !!v))]
  const byPlaceId: Record<string, string> = {}
  if (ids.length) {
    const { data: places } = await supabase.from('truck_places')
      .select(`id, event_bg_path, event_bg_width, event_bg_height, ${SLOT_COLS}`)
      .eq('truck_id', truckId).in('id', ids)
    /* ══ 🔴 THE SURFACE PICKS THE PICTURE, THROUGH ONE RESOLVER (9 October 2026) ═══════════════════
     * ⛔ THIS LOOP USED TO FILTER ON `picture_use`, which no screen sets any more. The question it
     * answers now is WHICH picture, not WHETHER: a weekly poster takes the weekly-only override when
     * the location has one, and a single event post always takes the location picture. */
    const library = await readPlaceLibrary(truckId, (places ?? []) as never)
    for (const pl of ((places ?? []) as Record<string, unknown>[])) {
      const placeId = String(pl.id)
      const images = resolveLocationImages(library.get(placeId) ?? [], pl as never)
      const main = surface === 'weekly' ? weeklyPictureFor(images) : eventPictureFor(images)
      if (!main) continue
      const bytes = await downloadObject(main.path)
      if (!bytes) continue
      const info = readImageInfo(bytes)
      if (!info) continue
      byPlaceId[placeId] = toDataUri(bytes, info)
    }
  }

  let logo: string | null = null
  if (wantLogo) {
    /* 🔴 THE TRUCK'S OWN LOGO IS `trucks.logo_storage_path` IN THE **`truck-media`** BUCKET — a
     * different bucket from this feature's, and a PUBLIC one. ⚠️ IT IS STILL READ SERVER-SIDE AND
     * INLINED AS A DATA URI rather than linked: the renderer does no I/O and takes no URL, so handing
     * it a public link would be the one exception to a rule that is worth more than the bytes saved. */
    const { data: row } = await supabase.from('trucks')
      .select('logo_storage_path').eq('id', truckId).maybeSingle()
    const path = (row as { logo_storage_path?: string | null } | null)?.logo_storage_path ?? null
    if (path) {
      const { data: file } = await supabase.storage.from('truck-media').download(path)
      if (file) {
        const bytes = Buffer.from(await file.arrayBuffer())
        const info = readImageInfo(bytes)
        if (info) logo = toDataUri(bytes, info)
      }
    }
  }
  return { byPlaceId, logo }
}


/**
 * How many of a truck's visible places have no picture at all.
 *
 * 🔴 IT IS THE SENTENCE ON THE WEEKLY DESIGN'S PLACE-PICTURE TOOLBAR, and it is the honest answer to
 * "why is this box empty on six of my rows?" — the question that setting raises and nothing else on
 * the screen answers. ⚠️ ONE READ, counting the library the same way the Designs box does.
 */
async function placesWithoutPicturesFor(truckId: string): Promise<{ without: number; total: number }> {
  const { data } = await supabase.from('truck_places')
    .select('id, is_hidden, merged_into_id, event_bg_path, event_bg_width, event_bg_height')
    .eq('truck_id', truckId)
  const visible = ((data ?? []) as Record<string, unknown>[])
    .filter(p => p.is_hidden !== true && !p.merged_into_id)
  const library = await readPlaceLibrary(truckId, visible as never)
  let without = 0
  for (const pl of visible) if ((library.get(String(pl.id)) ?? []).length === 0) without++
  return { without, total: visible.length }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE FONT STORE'S THREE EDGES (6 October 2026, part 2)
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// `lib/weekly-post/font-store.ts` takes storage, the cache table and the network as INTERFACES — it
// never imports Supabase and never calls `fetch` itself. This is where they are plugged in, and it is
// the only place in the product that does. ⚠️ THAT SPLIT IS WHAT MAKES §5's "mock the network in the
// check" a real check: `scripts/design-fonts.cjs` drives the same store with all three replaced.

const fontStorage: FontStorage = {
  async download(path) {
    const { data, error } = await supabase.storage.from(FONT_BUCKET).download(path)
    if (error || !data) return null
    return Buffer.from(await data.arrayBuffer())
  },
  async upload(path, data) {
    /* ⚠️ `upsert: true`. Two trucks can choose the same library family in the same second, and a
     * re-uploaded face of a truck's own font replaces the old one at the same path. A duplicate-object
     * error here would fail the second truck's choice for no reason. */
    const { error } = await supabase.storage.from(FONT_BUCKET)
      .upload(path, data, { contentType: 'font/ttf', upsert: true })
    if (error) throw new Error(error.message)
  },
  async remove(paths) { await supabase.storage.from(FONT_BUCKET).remove(paths) },
}

const fontRegistry: FontRegistry = {
  async libraryFaces(family) {
    const { data, error } = await supabase.from('font_library_cache')
      .select('family, weight, style, storage_path, licence, source_url')
      .eq('family', family)
    /* ⚠️ A MISSING TABLE READS AS "NOTHING CACHED", NOT AS A CRASH. Before the migration the library
     * simply does not work; the 21 bundled families still do, and the screen says so rather than
     * refusing to open. ⛔ BUT A FETCH WOULD THEN HAPPEN ON EVERY RENDER, which is why the choose
     * action reports the missing table out loud — see `font_choose`. */
    if (error) return []
    return (data ?? []) as LibraryFaceRow[]
  },
  async saveLibraryFaces(rows) {
    if (!rows.length) return
    /* ⚠️ `ignoreDuplicates` ON THE UNIQUE FACE KEY. Two trucks racing on one family both insert; the
     * loser's rows are already there and identical. */
    await supabase.from('font_library_cache')
      .upsert(rows as never, { onConflict: 'family,weight,style', ignoreDuplicates: true })
  },
  async ownFaces(truckId, familySlug) {
    const { data, error } = await supabase.from('truck_fonts')
      .select('family, display_name, weight, style, storage_path')
      .eq('truck_id', truckId)
    if (error) return []
    /* 🔴 FILTERED BY SLUG **IN THE SERVER**, not in the query. The font id carries a slug
     * (`u:myshopfont`) and the column holds the font's real family name ("MyShopFont"); matching in
     * SQL would need a slug function in the database, which is a second implementation of
     * `slugOfFamily` that could disagree with the TypeScript one. ⚠️ A truck has at most a handful of
     * uploaded families, so this reads a handful of rows. */
    return ((data ?? []) as OwnFaceRow[]).filter(r => slugOfFamily(r.family) === familySlug)
  },
}

const fontDeps: StoreDeps = {
  storage: fontStorage,
  registry: fontRegistry,
  fetcher: fetchLibraryFaces,
  bundledFiles: bundledFontFiles,
}

/** Every font id a weekly layout names. ⚠️ Through `fontsUsedBy`, so there is one list. */
const idsOfLayout = (l: unknown, kind: 'week' | 'event'): string[] => {
  try {
    return (kind === 'week'
      ? fontsUsedBy(l as never)
      : fontsUsedByEvent(l as never)).map(f => f.id)
  } catch { return [] }
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
  /* ══ 🔴 PRIVATE EVENTS GET "Private event" AND NO LOCATION ON THE POSTER (20261014) ═════════════
   * `locationName` / `townLine` do the redacting; this attaches the flag they read.
   * ⚠️ A SEPARATE PROBED READ, NOT A COLUMN ON `EV_COLS`. The weekly post is the operator's own
   * poster — a missing migration must not stop them making one, and naming `is_private` in the select
   * above would fail the whole query. On a probe failure every row is flagged private, so the poster
   * says "Private event" for every day: wrong, obvious, and safe, rather than wrong and silent. */
  const rows = (events ?? []) as WeekEvent[]
  const privacy = await readPrivateEventIds(supabase, rows.map(e => e.id), 'weekly-post loadWeek')
  return {
    events: rows.map(e => ({ ...e, is_private: privacy.isPrivate(e.id) })) as WeekEvent[],
    places: (places ?? []) as Place[],
  }
}

/**
 * Is a single-event post refused for this event?
 *
 * ⛔ FAILS CLOSED, LIKE EVERY OTHER PRIVACY READ: a probe failure refuses the poster. The cost is an
 * operator who cannot make one until the migration is applied; the cost of the other direction is a
 * published poster for a wedding.
 */
async function isSinglePostBlocked(eventId: string): Promise<boolean> {
  if (!eventId) return false
  const privacy = await readPrivateEventIds(supabase, [eventId], 'weekly-post single')
  return privacy.isPrivate(eventId)
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
  /* ── 8 October 2026: the poster/picture model, resolved once for three callers. ───────────────── */
  locationImages: LocationImages | null
  designHasPhotoSpace: boolean
  socialTag: string | null
  town: string | null
}> {
  if (!design?.blank_path || !design.width || !design.height) {
    return { error: 'No event design yet.', status: 400 }
  }
  const { data: ev } = await supabase.from('truck_events')
    .select('id, event_date, start_time, end_time, status, venue_name, venue_id, truck_place_id, town')
    .eq('id', eventId).eq('truck_id', truck.id).maybeSingle()
  if (!ev) return { error: 'Event not found', status: 404 }

  const { data: places } = await supabase.from('truck_places')
    .select(`id, venue_id, name_key, name, short_name, area, merged_into_id, is_hidden, event_bg_path, event_bg_width, event_bg_height, event_layout, ${SLOT_COLS}`)
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

  /* ══ 🔴 THE LOCATION'S **EVENT** IMAGE, FROM ITS SLOT (7 October 2026) ══════════════════════════
   * ⛔ IT WAS `placeRow.event_bg_path` READ DIRECTLY, and that is now one of two sources rather than
   * the source. `resolveSlots` answers "what is this location's event image?" — the picture
   * `event_picture_id` names, or, when that is empty, the legacy `event_bg_*` columns mapped on read.
   * ⚠️ WHICH IS WHY LEGACY STILL RENDERS BYTE-IDENTICALLY: for a location nobody has touched, the slot
   * is null, the fallback fires, and this object holds exactly what the old line produced.
   * ⚠️ THE **WIDTH AND HEIGHT COME WITH THE PICTURE**, not from `event_bg_width/height`. Those two
   * columns describe the legacy object; a slot pointing at a different `place_pictures` row has that
   * row's own measurements, and using the old pair would check the wrong picture's shape. */
  /* ══ 🔴 AND AS OF 8 OCTOBER IT IS THE **EVENT POSTER**, EXPLICITLY ═══════════════════════════════
   * The slot is unchanged; what changed is that it is no longer ambiguous. It used to be "the event
   * image", and whether it was a photo in a box or the whole poster was decided by the DESIGN. It is
   * always the poster now, the truck chooses, and the LOCATION PICTURE is a separate thing with its
   * own `picture_use`. See lib/weekly-post/place-pictures.ts. */
  const locationImages: LocationImages | null = await (async () => {
    if (!placeRow) return null
    const library = await readPlaceLibrary(truck.id, [placeRow as never])
    return resolveLocationImages(library.get(String(placeRow.id)) ?? [], placeRow as never)
  })()
  const placeImgRaw = locationImages?.poster
    ? { path: locationImages.poster.path, width: locationImages.poster.width, height: locationImages.poster.height }
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
  /* ══ 🔴 THE LABELS BECAME AN "Image" CHOICE (7 October 2026, §6) ═══════════════════════════════
   * ⛔ THEY SAID "<Place> design" AND "Upload one for this event only", AND THE FIRST OF THOSE NAMED
   * THE WRONG THING. A location no longer has "a design" — it has at most two IMAGES, and the one this
   * choice is about is its event image. ⚠️ AND WHICH WORD IS RIGHT DEPENDS ON THE DESIGN: with a photo
   * space on the single event design that image is a PHOTO in a box; without one it is a POSTER that
   * replaces the standard design completely. `eventImageMode` decides, so the label and the render
   * cannot disagree.
   * ⚠️ "Standard design" IS UNCHANGED AND STILL MEANS BOTH HALVES — the standard picture AND the
   * standard text positions. Choosing it at a location with its own positions moves the text too,
   * which is why `layoutSource` crosses the wire beside it. */
  const photoSpace = standardLayout?.placePicture?.enabled === true
  if (usableOneOff) options.push({ source: 'event', path: usableOneOff.path, label: 'Upload one for this post only' })
  /* ══ ⛔ ALWAYS "poster" NOW — THE LABEL NO LONGER FOLLOWS THE DESIGN (8 October 2026) ═════════════
   * It read "<Location>'s photo" when the standard design had a photo space and "<Location>'s poster"
   * when it did not, because the slot meant two different things. The slot IS the poster now, so the
   * word is fixed — and `eventImageMode` is no longer consulted anywhere on this route. */
  if (usablePlace) {
    options.push({ source: 'place', path: usablePlace.path, label: `${entry.name}’s poster` })
  }
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
    /* 🔴 THE LOCATION'S TWO IMAGES AND THE CHOICE, RESOLVED ONCE AND SHARED. `event_post` shows the
     * options, `event_render` draws them, and the caption needs the tag — three callers, one answer.
     * ⛔ NULL FOR A PRIVATE BOOKING, because `placeRow` is undefined for one. */
    locationImages,
    /** Whether the standard single event design has a photo space. ⚠️ From the STORED layout. */
    designHasPhotoSpace: photoSpace,
    /** ⛔ The location's social tag — NEVER sent for a private booking, for the same reason. */
    socialTag: placeRow ? (String(placeRow.social_tag ?? '').trim() || null) : null,
    /** ⚠️ The town, so the caption's `{place}` reads as the poster's own location line does. */
    town: entry.town ?? null,
  }
}

/**
 * ══ 🔴 §2 · THE FONT FILE THE **LIVE EDITOR** MEASURES AND DRAWS WITH ═════════════════════════════
 *
 * `GET /api/weekly-post?font=<id>&w=400&s=normal&token=<token>` → the TTF bytes.
 *
 * ⛔ **WHY A GET AND WHY BYTES.** §2 makes the editor draw every word live, and "live" has two
 * requirements that both need the FILE: `fitLines` measures with the font's own advance widths
 * (`ttf-metrics.ts`), and the browser can only paint in a family it has been given. One fetch per face
 * answers both — the same `ArrayBuffer` is parsed for metrics and handed to `new FontFace(...)`.
 *
 * ⛔ **AND IT REFUSES AN UPLOADED FAMILY, DELIBERATELY.** `font_sample` in this file says why in its
 * own words: *"the browser must never be given a font file's URL — an uploaded font may be
 * commercially licensed, and a readable URL from our domain is redistribution of somebody else's paid
 * font."* That rule is older than §2 and §2 does not get to quietly reverse it. 🔴 SO A DESIGN THAT
 * NAMES AN UPLOADED FAMILY DRAWS **LIVE IN THE FALLBACK FACE**, and the PNG — which is what a truck
 * actually posts — is still in their own font. ⚠️ THAT IS A REAL LOSS AND IT IS IN THE REPORT.
 *
 * ⚠️ BUNDLED FAMILIES ARE COMMITTED, OPEN-LICENCE FILES and library ones are Google's, already public
 * and already served as web fonts from `fonts.gstatic.com`. Neither is redistribution.
 * ⚠️ IT IS BEHIND THE SAME TOKEN AND THE SAME GATE AS EVERY ACTION IN THIS FILE, through the same two
 * functions — so there is no second way in and no second answer about who may ask.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const token = String(url.searchParams.get('token') ?? '')
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 401 })
  const truck = await getTruck(token)
  if (!truck) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  const blocked = gated(truck)
  if (blocked) return blocked

  const id = String(url.searchParams.get('font') ?? '')
  if (!id) return NextResponse.json({ error: 'font required' }, { status: 400 })
  const ref = parseFontId(id)
  if (!ref) return NextResponse.json({ error: 'Unknown font' }, { status: 404 })
  /* 🔴 THE REFUSAL, AND IT IS THE FIRST THING CHECKED AFTER THE ID PARSES. See the note above. */
  if (ref.kind === 'own') {
    return NextResponse.json({ error: 'An uploaded font is not served to the browser.' }, { status: 403 })
  }

  /* ⚠️ `w` AND `s` NARROW TO THE FOUR FACES THIS PRODUCT HAS. Anything else is read as the regular,
   * which is what `FontBundle.resolve` would have done with it anyway. */
  const bold = url.searchParams.get('w') === '700'
  const italic = url.searchParams.get('s') === 'italic'

  /* ⚠️ THE SAME LOADER THE RENDERER USES, so the bytes the browser measures are the bytes satori will
   * measure. ⛔ NOT A SECOND PATH TO OBJECT STORAGE: `loadFontsForDesign` holds the library fetch, the
   * cache and the "this family is unreachable" answer, all of which this would otherwise repeat. */
  const loaded = await loadFontsForDesign([id], truck.id, fontDeps)
  const face = loaded.bundle.resolve(id, bold, italic)
  const file = loaded.bundle.satoriFonts()
    .find(f => f.name === face.family && f.weight === face.weight && f.style === face.style)
  if (!file) return NextResponse.json({ error: 'That font could not be loaded.' }, { status: 404 })

  return new NextResponse(new Uint8Array(file.data), {
    status: 200,
    headers: {
      /* ⚠️ `font/ttf` WHATEVER THE CONTAINER IS. The browser sniffs the real format from the bytes and
       * every file in this product is a TrueType or an OpenType one; `FontFace` takes the buffer
       * directly in any case, so this header is for the cache and for a human reading the network tab. */
      'Content-Type': 'font/ttf',
      /* 🔴 PRIVATE. One truck asked with one truck's token; it must not sit in a shared cache — the
       * same rule `font_sample` follows one screen away. */
      'Cache-Control': 'private, max-age=3600',
      /* ⚠️ THE FACE THAT WAS ACTUALLY RESOLVED, so the editor can see it took a fallback rather than
       * wondering why its measurements and the PNG's disagree. */
      'X-Hg-Font-Family': face.family,
      'X-Hg-Font-Face': `${face.weight}|${face.style}`,
    },
  })
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
  /* ══ 🔴 §9 · ONE READ OF `showPrivate`, FOR EVERY ACTION THAT BUILDS A WEEK ══════════════════════
   * ⚠️ `=== true`, NOT TRUTHINESS. The flag arrives as JSON from a browser; `"false"`, `1` and `[]`
   * are all truthy strings or values a hand-made payload could send, and every one of them would put a
   * private booking on a poster. The only value that turns this on is the boolean `true`.
   * ⚠️ READ HERE RATHER THAN IN THE THREE ACTIONS, so `load`, `captions` and `render` cannot disagree
   * about what the operator asked for — the tick list, the caption and the picture are one answer. */
  const showPrivate = body.showPrivate === true
  const country = countryForTruck(truck as { country?: string | null })

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
      showPrivate,
      excludedEventIds: Array.isArray(body.excluded) ? body.excluded.map(String) : [],
    })
    return NextResponse.json({
      missingTable,
      /* ⚠️ THE COUNTRY TRAVELS WITH THE DESIGN, so the editor's date-style picker and its grey samples
       * read the same table the renderer does. */
      country,
      /* 🔴 PART 3 · WHAT THE PLACE-PICTURE ITEM NEEDS. Both are facts about the TRUCK rather than the
       * design, and both are read here so the editor does not have to make a second request. */
      hasLogo: !!(truck as unknown as { logo_storage_path?: string | null }).logo_storage_path,
      placesWithout: await placesWithoutPicturesFor(truck.id),
      /* ⚠️ `designIsReady`, NOT `design ?`. A half-written row used to come back as a design, and
       * `WeeklyPostApp` then opened the POST screen — which has nothing to post from. It opens setup
       * now, which is where a half-written design belongs. */
      /* 🔴 THE SAME READ-TIME NORMALISE AS `event_load` — the weekly editor is the same component and
       * was one old saved design away from the same crash. */
      design: designIsReady(design) ? {
        width: design!.width, height: design!.height,
        layout: readStoredLayout(design!.layout, design!.width ?? 0, design!.height ?? 0).layout,
        blankUrl: await signed(design!.blank_path),
        exampleUrl: await signed(design!.example_path),
        updatedAt: design!.updated_at,
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

  /* ══ 🔴 `social_overview` — EVERYTHING THE SOCIAL POSTS PAGE NEEDS, IN ONE READ (6 Oct 2026) ══════
   *
   * ⛔ IT EXISTS TO STOP A LOOP. The Designs area lists every place with a thumbnail, and the only
   * action that signed a place's picture was `event_load` — which also reads up to 200 events in each
   * direction to build the setup screen's previews. One call per place would have been twenty-one
   * copies of that read to draw twenty-one 64px squares. One call, one signed URL each.
   *
   * ⚠️ READ-ONLY, AND BEHIND THE SAME GATE AS EVERY OTHER ACTION HERE. `gated` runs once at the top of
   * POST, so this needs no check of its own and cannot have been accidentally left open; it is scoped
   * to the token's truck by the same `truck.id` every other read uses.
   *
   * 🔴 IT ANSWERS FOUR QUESTIONS, AND THEY ARE FOUR BECAUSE THE SCREEN ASKS FOUR:
   *   `weekly`   — is the weekly design set up, and how many events are in each week
   *   `standard` — is the Standard single-event design set up, with its picture
   *   `upcoming` — the next few events, for "Single event post"
   *   `places`   — every non-hidden place, its own picture if it has one, and its next PUBLIC event
   *
   * ⛔ PRIVACY IS RESOLVED ONCE, FOR EVERY EVENT IN THE ANSWER, through the one reader. A private
   * event is returned with `isPrivate: true` and **no venue, no town and no place name** — the screen
   * draws it greyed as "Private event · no post" — and it is never a place's `next` event, because a
   * place's next event is the one its "Make post" button would post. §73's rule, applied here rather
   * than trusted to the client. */
  if (action === 'social_overview') {
    const today = todayInWeekTz()
    const [{ data: placeRows, error: placeErr }, { data: evRows }] = await Promise.all([
      supabase.from('truck_places')
        .select(`id, venue_id, name_key, name, short_name, area, merged_into_id, is_hidden, is_favourite, event_bg_path, event_bg_width, event_bg_height, event_layout, ${SLOT_COLS}`)
        .eq('truck_id', truck.id),
      /* ⚠️ BOUNDED AND FORWARD-ONLY. Both lists are about what is COMING, so nothing before today is
       * read at all — which is also what keeps this cheap enough to replace the per-place loop. */
      supabase.from('truck_events')
        .select('id, event_date, start_time, end_time, status, venue_name, venue_id, truck_place_id, town')
        .eq('truck_id', truck.id).gte('event_date', today)
        .order('event_date', { ascending: true }).order('start_time', { ascending: true })
        .limit(400),
    ])

    /* ══ 🔴 A MISSING COLUMN MUST NOT READ AS "YOU HAVE NO LOCATIONS" (9 October 2026) ════════════════
     *
     * ⛔ FOUND BY A LOCAL CHECK BEFORE THE MIGRATION WAS RUN, AND IT IS THE WORST KIND OF FAILURE: this
     * read names `event_photo_picture_id`, PostgREST answered `42703 column does not exist`, the error
     * was never looked at — and the screen drew **"No locations yet."** over a truck with twenty-one of
     * them. A wrong answer delivered confidently is worse than an error: an operator would reasonably
     * conclude their data was gone.
     * 🔴 SO THE ERROR IS READ AND THE ONE THAT MEANS "the migration has not run" IS SAID OUT LOUD. The
     * same four codes every other writer on this route already checks — PostgREST's two cache codes and
     * Postgres's two — through the same `MIGRATION_NEEDED` sentence.
     * ⚠️ AND ANY OTHER ERROR STILL FALLS THROUGH to `?? []`, which is deliberate: a transient read
     * failure should not take the whole screen down, and the two designs above it do not depend on this
     * list. ⛔ WHAT IS NOT ACCEPTABLE IS SILENCE ABOUT A **SCHEMA** FAILURE, because that one is not
     * transient — it will say "no locations" every time until somebody runs the SQL. */
    if (placeErr) {
      const code = (placeErr as { code?: string }).code
      if (code === 'PGRST204' || code === 'PGRST205' || code === '42703' || code === '42P01') {
        return NextResponse.json({ error: MIGRATION_NEEDED }, { status: 503 })
      }
    }
    const allPlaces = ((placeRows ?? []) as unknown as Place[])
    const upcomingRaw = ((evRows ?? []) as unknown as WeekEvent[])
      .filter(e => countsAsUpcoming((e as { status?: string | null }).status))
    const privacy = await readPrivateEventIds(
      supabase, upcomingRaw.map(e => e.id), 'weekly-post social_overview')
    for (const e of upcomingRaw) e.is_private = privacy.isPrivate(e.id)

    /* 🔴 THE SHARED GROUPING, so a MERGED place's events land on its target exactly as they do on
     * every other screen. A second, weaker match here would give one place two different "next"s. */
    const { byPlace } = groupEventsByPlace(
      upcomingRaw as unknown as Parameters<typeof groupEventsByPlace>[0], allPlaces)

    const { design: weekDesign } = await loadDesign(truck.id, KIND)
    const { design: evDesign } = await loadDesign(truck.id, EVENT_KIND)

    /* ⚠️ HOW MANY EVENTS ARE IN EACH WEEK, for the "Which week" line. Counted from the same forward
     * read rather than by loading both weeks' day grids, which is what `load` is for. */
    const inWeek = (from: string, to: string) =>
      upcomingRaw.filter(e => {
        const d = String(e.event_date ?? '')
        return d >= from && d <= to
      })
    /* 🔴 TWO NUMBERS, NOT ONE — "4 events · 1 private event left out". ⛔ `events` COUNTS THE **PUBLIC**
     * ONES, because that is what the poster will show; counting all of them and then saying one was
     * left out would make the two halves of that sentence contradict each other. */
    const countIn = (from: string, to: string) => inWeek(from, to).filter(e => e.is_private !== true).length
    const privateIn = (from: string, to: string) => inWeek(from, to).filter(e => e.is_private === true).length
    const thisWeek = weekRange('this')
    const nextWeek = weekRange('next')

    /**
     * ══ 🔴 §6 · THE WEEKLY CAPTION, **FILLED**, FOR BOTH WEEKS ════════════════════════════════════
     *
     * ⛔ THE CARD HELD THE **TEMPLATE** — tokens and all — so the box an operator read was not the
     * caption they would post. The single event card was fixed in round 4; this is the other half, and
     * the reason it was left was that filling a week needs the week's own rows and the overview sent
     * only its counts.
     *
     * 🔴 IT IS FILLED **HERE**, ON THE SERVER, AND NOT ON THE CLIENT — and that is a deliberate
     * departure from §6's wording ("add the week's entries to the overview payload and fill it" on the
     * screen). ⛔ FILLING A WEEK NEEDS `buildWeekData`: seven days, days off, stacked events, cancelled
     * ones, merged places and the design's own `showCancelled`. **Shipping that to the client would be
     * duplicating the exact function whose duplication §6 exists to prevent** — "so the two can't
     * differ" is the instruction, and one call site is the strongest form of it.
     * ⚠️ SO THE PAYLOAD CARRIES THE FINISHED STRING PER WEEK rather than the entries. The card's "Which
     * week" select then switches between two ready captions with no request, which is also what the
     * single event card does with its three facts.
     *
     * ⚠️ **THE SAME TWO FUNCTIONS THE MAKE SCREEN USES**, with the same inputs: `weekCaptionValues` over
     * `buildWeekData`, through `fillCaptionTemplate`, with the truck's own saved template or the seed.
     * ⛔ `showPrivate: false` — the weekly poster leaves private bookings out, so a caption that listed
     * one would describe a poster that does not exist.
     */
    const weekTplForCaption = String(weekDesign?.caption_template ?? '').trim() || seedWeekTemplate(truck.name)
    const weeklyTimeStyle = readStoredLayout(
      weekDesign?.layout, weekDesign?.width ?? 1080, weekDesign?.height ?? 1350,
    ).layout.timeStyle
    /* ⚠️ IT TAKES THE WHOLE `WeekRange`, not a start and an end: `buildWeekData` needs its seven `days`
     * to produce the days off, and `weekRange()` has already computed them. Passing two strings would
     * have meant recomputing the days here — a second source for "which seven dates is this week". */
    const captionForWeek = (range: ReturnType<typeof weekRange>): string => {
      const rows = inWeek(range.start, range.end)
      const wk = buildWeekData(range, rows as never, (placeRows ?? []) as never, {
        timeStyle: weeklyTimeStyle,
        showCancelled: true,
        showPrivate: false,
        excludedEventIds: [],
      })
      return fillCaptionTemplate(weekTplForCaption, weekCaptionValues({
        week: wk,
        orderUrl: truck.slug ? scanUrl(truck.slug) : null,
        timeStyle: weeklyTimeStyle,
        country,
      }))
    }

    /* 🔴 WHETHER THE SINGLE EVENT DESIGN HAS A PHOTO SPACE, resolved once for every row below. ⚠️ IT NO
     * LONGER DECIDES WHAT A LOCATION'S IMAGE **MEANS** — the truck does, through `picture_use`. What it
     * still decides is whether a location PICTURE can be drawn on an event post at all. */
    const evPhotoSpace = readStoredEventLayout(
      evDesign?.layout, evDesign?.width ?? 0, evDesign?.height ?? 0,
    ).layout.placePicture.enabled
    /* ⚠️ EVERY LOCATION'S TWO IMAGES AND ITS `picture_use`, IN ONE READ, so the per-row "which image"
     * answer is not twelve queries. `allPlaces` rather than `visible`: an event may sit at a hidden
     * location, and that post still draws that location's image. */
    const libraryByPlace = await readPlaceLibrary(truck.id, allPlaces as never)
    const imagesByPlace = new Map<string, LocationImages>(
      allPlaces.map(pl => [pl.id, resolveLocationImages(libraryByPlace.get(pl.id) ?? [], pl as never)]))

    /** One event, shaped for the screen. ⛔ A PRIVATE ONE CARRIES NO LOCATION OF ANY KIND. */
    const shapeEvent = (e: WeekEvent) => {
      const priv = e.is_private === true
      const place = priv ? null : placeForEvent(e as never, allPlaces)
      /* ══ 🔴 WHICH IMAGE THIS POST WILL ACTUALLY USE ═══════════════════════════════════════════
       * ⛔ A PRIVATE EVENT IS `none` AND IS NOT ASKED ABOUT. Its place never left the server.
       * ⚠️ THE ONE-OFF IS NOT CONSIDERED HERE. This list is about what a post WOULD use before the
       * modal is opened; an upload made inside the modal is the modal's own answer, and
       * `resolveDesign` is what reconciles the two when the post is rendered. */
      /* ⛔ `place-photo` AND `place-poster` NO LONGER MEAN "the design decided". A POSTER is a poster
       * because the truck uploaded it as one; a PHOTO is the location PICTURE drawn in the design's
       * photo space, which needs `picture_use` to allow it AND the design to have one. */
      const img = place ? (imagesByPlace.get(place.id) ?? null) : null
      const plan = priv || !img
        ? null
        : planEventImages({
          hasOneOff: false,
          images: img,
          designHasPhotoSpace: evPhotoSpace,
          isPrivate: false,
          /* ⚠️ THE SHAPE TEST IS THE REAL ONE, against the standard design's canvas — so a location
           * whose poster is the wrong shape says "standard" here, which is what the post will be. */
          posterFits: !!img.poster && usableAsWholeBackground(
            img.poster,
            { width: evDesign?.width ?? null, height: evDesign?.height ?? null },
            !!(place as { event_layout?: unknown } | null)?.event_layout,
          ),
        })
      const imageSource: 'place-photo' | 'place-poster' | 'standard' | 'none' =
        priv ? 'none'
          : plan?.background === 'poster' ? 'place-poster'
          : plan?.pictureInPhotoSpace ? 'place-photo'
          : 'standard'
      return {
        imageSource,
        /* ⚠️ THE NAME THE POSTER WOULD PRINT — `short_name` first, as `locationName` resolves it — so
         * the grey line and the poster say the same thing. */
        placeName: place ? (String(place.short_name ?? '').trim() || String(place.name ?? '')) : null,
        id: String(e.id),
        date: String(e.event_date ?? ''),
        startTime: (e as { start_time?: string | null }).start_time ?? null,
        endTime: (e as { end_time?: string | null }).end_time ?? null,
        isPrivate: priv,
        venue: priv ? null : (String(e.venue_name ?? '').trim() || null),
        town: priv ? null : ((e as { town?: string | null }).town ?? null),
        placeId: priv ? null : (place?.id ?? null),
        /* 🔴 WHICH DESIGN THIS POST WILL USE, so the row's colour bar is the truth rather than a
         * guess. `own` only when the place has a PICTURE of its own — a place with only its own text
         * positions is still drawing Standard's picture. */
        design: priv ? 'none' as const
          : (place && (place as { event_bg_path?: string | null }).event_bg_path ? 'own' as const : 'standard' as const),
      }
    }

    /* ══ 🔴 HIDDEN LOCATIONS ARE **LISTED** NOW, AND FLAGGED (7 October 2026) ══════════════════════
     * ⛔ THEY WERE FILTERED OUT HERE, and the Locations table's "Hidden n" chip cannot count rows the
     * server never sent. A merged location is still dropped — it is not a location any more, it is a
     * pointer at one, and listing it would offer two rows that write to the same images.
     * ⚠️ THE TABLE SHOWS A HIDDEN ROW **ONLY UNDER THE Hidden CHIP**; the flag is what lets it. */
    const visible = allPlaces.filter(p => !p.merged_into_id)
    visible.sort((a, b) => {
      /* ⚠️ HIDDEN LAST, THEN FAVOURITES FIRST, THEN BY NAME. A hidden location is behind a chip, so
       * its position in the full list barely matters — but sinking it keeps the default view the same
       * order it has always had. */
      const ha = a.is_hidden === true ? 1 : 0
      const hb = b.is_hidden === true ? 1 : 0
      if (ha !== hb) return ha - hb
      const fa = a.is_favourite === true ? 0 : 1
      const fb = b.is_favourite === true ? 0 : 1
      return fa !== fb ? fa - fb : String(a.name ?? '').localeCompare(String(b.name ?? ''))
    })

    /* 🔴 WHETHER "Show your logo" MAY BE OFFERED AT ALL. The truck's logo is
     * `trucks.logo_storage_path` in the PUBLIC `truck-media` bucket (lib/truck-logo.ts is the one
     * resolver). ⛔ AN OPTION THAT SILENTLY DRAWS NOTHING IS WORSE THAN AN OPTION THAT IS NOT THERE,
     * so the editor is told and hides it. */
    const hasLogo = !!(truck as unknown as { logo_storage_path?: string | null }).logo_storage_path

    return NextResponse.json({
      ok: true,
      hasLogo,
      weekly: {
        /* 🔴 THE SAME PREDICATE THE SETUP SCREEN APPLIES, so the badge and the screen its button opens
         * cannot disagree. `!!blank_path` said "✓ Set up" for a picture with no boxes placed on it. */
        ready: designIsReady(weekDesign),
        /* ⚠️ THE EXAMPLE FIRST, THE BLANK SECOND. The example is what the truck's post actually looks
         * like; the blank is the artwork with no text. Either is a true preview of the design. */
        previewUrl: await signed(weekDesign?.example_path ?? weekDesign?.blank_path ?? null),
        /* ⚠️ THE DESIGN'S OWN SHAPE, so the box draws a tile in it rather than guessing portrait. */
        width: weekDesign?.width ?? null,
        height: weekDesign?.height ?? null,
        thisWeek: {
          start: thisWeek.start, end: thisWeek.end,
          events: countIn(thisWeek.start, thisWeek.end),
          privateEvents: privateIn(thisWeek.start, thisWeek.end),
          /** 🔴 §6 · The FINISHED caption for this week. See `captionForWeek`. */
          caption: captionForWeek(thisWeek),
        },
        nextWeek: {
          start: nextWeek.start, end: nextWeek.end,
          events: countIn(nextWeek.start, nextWeek.end),
          privateEvents: privateIn(nextWeek.start, nextWeek.end),
          caption: captionForWeek(nextWeek),
        },
        defaultWeek: defaultWeekChoice(),
      },
      standard: {
        ready: designIsReady(evDesign),
        previewUrl: await signed(evDesign?.example_path ?? evDesign?.blank_path ?? null),
        width: evDesign?.width ?? null,
        height: evDesign?.height ?? null,
        /* ══ 🔴 WHETHER THE SINGLE EVENT DESIGN HAS A **PHOTO SPACE** ════════════════════════════
         * ⛔ IT DECIDES THE WORDING OF THE Locations SCREEN'S EVENT BOX, and the wording is not
         * cosmetic: with a photo space the screen asks for a PHOTO of any shape; without one it asks
         * for a POSTER the same shape as the standard design. Asking for the wrong one produces an
         * upload that cannot be used, which is why this flag crosses the wire rather than being
         * guessed from the preview. See `eventImageMode` in lib/weekly-post/place-pictures.ts.
         * ⚠️ READ THROUGH `readStoredEventLayout`, so a design whose stored layout no longer validates
         * reports "no photo space" rather than throwing — the read guard's whole purpose. */
        photoSpace: readStoredEventLayout(
          evDesign?.layout, evDesign?.width ?? 0, evDesign?.height ?? 0,
        ).layout.placePicture.enabled,
      },
      /* ══ 🔴 THE TWO SAVED CAPTION TEMPLATES — SEEDED ON READ, NOT ON WRITE (8 October 2026) ═══════
       * ⛔ THE SEED IS NOT WRITTEN TO THE DATABASE HERE, and that is deliberate. `null` means "nobody
       * has set one", and the moment this action wrote a seed that distinction would be gone — a truck
       * who later cleared their caption to empty would be indistinguishable from one who had never
       * touched it, and the next release's better default could never reach them.
       * 🔴 SO THE SEED IS COMPUTED ON EVERY READ and only becomes a row when the operator edits. The
       * editor sees text either way, so nothing about the screen gives it away.
       * ⚠️ `seeded: false` TELLS THE SCREEN WHICH IT IS LOOKING AT, so a "Saved" tick cannot appear
       * over a caption nobody has saved. */
      captions: {
        week: {
          template: String(weekDesign?.caption_template ?? '') || seedWeekTemplate(truck.name),
          saved: typeof weekDesign?.caption_template === 'string',
        },
        event: {
          template: String(evDesign?.caption_template ?? '') || seedEventTemplate(truck.name),
          saved: typeof evDesign?.caption_template === 'string',
        },
      },
      /* ══ 🔴 THE THREE FACTS THE SCREEN NEEDS TO **FILL** A TEMPLATE ITSELF (9 October 2026) ═════════
       *
       * ⛔ WITHOUT THEM THE CAPTION BOX WOULD BE A REQUEST PER EVENT. §5 puts a filled, editable caption
       * on the card and refreshes it when the operator picks a different event from the list — and
       * `eventCaptionValues` needs an order link, a clock style and a country on top of what each event
       * row already carries. Asking the server per pick would be a round trip for a value it could have
       * sent once, on a screen whose stated principle is ONE read for the whole page.
       * ⚠️ ALL THREE ARE PER TRUCK, NOT PER EVENT, which is why they belong here and not on each row:
       * the order link is the truck's scan URL, the clock style is the standard design's, and the
       * country is `countryForTruck`'s one answer. ⛔ THE PER-EVENT HALF — venue, area, date, times and
       * the location's tag — is already on the rows and in `places`, so nothing is duplicated.
       * 🔴 AND `fillCaptionTemplate` IS THE **SAME PURE FUNCTION** the renderer's own `event_post` uses,
       * so the caption on the card and the caption the modal would have written cannot drift. */
      captionBits: {
        orderUrl: truck.slug ? scanUrl(truck.slug) : null,
        timeStyle: (readStoredEventLayout(
          evDesign?.layout, evDesign?.width ?? 1080, evDesign?.height ?? 1350,
        ).layout.timeStyle),
        country,
      },
      /* 🔴 WHETHER THE **WEEKLY** DESIGN SHOWS A LOCATION PICTURE AT ALL. The Locations pane says so
       * under the weekly box: an image saved against a design that does not draw one is work that
       * produces nothing, and the screen is the only place that can say it before the truck finds out
       * from a finished poster. */
      weeklyPictureOn: readStoredLayout(
        weekDesign?.layout, weekDesign?.width ?? 0, weekDesign?.height ?? 0,
      ).layout.placePicture.enabled,
      /* ══ ⚠️ ELEVEN NOW, NOT SIX (7 October 2026) ═══════════════════════════════════════════════
       * "Single event post" shows the NEXT event in full plus "▾ More events (n)" — about ten — so the
       * payload carries one for the headline and ten for the list. ⛔ THE CAP STAYS ON THE SERVER so
       * the payload is the answer rather than a list to be trimmed, and a private event in that window
       * takes its place in it, greyed, rather than being skipped over for an eleventh. */
      upcoming: upcomingRaw.slice(0, 11).map(shapeEvent),
      /* 🔴 THE WHOLE LIBRARY FOR EVERY VISIBLE PLACE, IN **ONE** READ (part 3). The Place pictures box
       * shows a thumbnail and a count per place; a loop would be twenty round trips to draw twenty
       * 28px squares, which is the argument this action was created to settle for the single picture
       * and is the same argument now there are many. */
      ...(await (async () => {
        const library = await readPlaceLibrary(truck.id, visible as never)
        /* 🔴 THE TWO SLOTS, FROM THE SAME ONE READ. `readPlaceSlots` would re-read the library, so the
         * slots are resolved from the copy already in hand — one query for the whole screen stands. */
        return {
          places: await Promise.all(visible.map(async pl => {
            const pictures = library.get(pl.id) ?? []
            const slots = resolveSlots(pictures, pl as never)
            const main = mainPicture(pictures)
            const mine = (byPlace.get(pl.id) ?? []) as unknown as WeekEvent[]
            const next = mine.find(e => e.is_private !== true) ?? null
            const path = (pl as { event_bg_path?: string | null }).event_bg_path ?? null
            /* ⚠️ ONE SIGNED URL PER **SLOT**, never per library row. A truck with twenty locations and
             * sixty uploads gets forty thumbnails, which is what the table draws. */
            const slotOut = async (pic: PlacePicture | null) => pic ? {
              id: pic.id,
              url: await signed(pic.path),
              width: pic.width,
              height: pic.height,
              fileName: pic.fileName,
              /* ⚠️ `legacy` TRAVELS WITH IT. A legacy image has no `place_pictures` row yet, so the
               * screen must know that pointing the OTHER slot at it writes a row first. */
              legacy: pic.legacy === true,
            } : null
            return {
              id: pl.id,
              name: String(pl.name ?? ''),
              shortName: String(pl.short_name ?? '').trim() || null,
              area: pl.area ?? null,
              isFavourite: pl.is_favourite === true,
              /* 🔴 WHETHER THIS LOCATION IS HIDDEN, so the table's "Hidden n" chip has a number and
               * the default view can leave it out. */
              isHidden: pl.is_hidden === true,
              hasPicture: !!path,
              /* ⚠️ KEPT, AND NO LONGER READ BY ANY SCREEN. The library is the store behind the two
               * slots; `place-pictures.cjs` still drives the grid helpers and the weekly design's
               * "n locations have no image yet" line counts on it. */
              pictureCount: pictures.length,
              mainUrl: await signed(main?.path ?? null),
              mainLabel: main?.label ?? null,
              imageUrl: await signed(path),
              /* ══ 🔴 THE LOCATION'S THREE PICTURES — WHAT THE Location settings TABLE AND PANE DRAW ══
               * ⚠️ `eventImage` IS THE **POSTER** and `weeklyImage` the **WEEKLY POST** picture. The
               * payload keys kept their names for the same reason the columns did — a rename is a
               * breaking change to every reader for a word — and the SCREEN names them properly.
               * 🔴 `eventPhotoImage` IS THE NEW ONE: the EVENT POST picture, drawn in the single event
               * design's picture space. ⛔ `weeklyOnlyImage` IS GONE FROM THE PAYLOAD — the override and
               * its box are replaced by a picture per surface, and 20261022 emptied the column.
               * ⚠️ ALL THREE COME FROM ONE LIBRARY READ — `resolveLocationImages` answers them
               * together, so one query still serves the whole screen. */
              eventImage: await slotOut(slots.event),
              weeklyImage: await slotOut(slots.weekly),
              eventPhotoImage: await slotOut(
                resolveLocationImages(pictures, pl as never).eventPhoto),
              /** 🔴 The location's social handle, for the `{location-tag}` caption label. */
              socialTag: String((pl as { social_tag?: string | null }).social_tag ?? '').trim() || null,
              width: (pl as { event_bg_width?: number | null }).event_bg_width ?? null,
              height: (pl as { event_bg_height?: number | null }).event_bg_height ?? null,
              ownPositions: !!(pl as { event_layout?: unknown }).event_layout,
              next: next ? shapeEvent(next) : null,
              upcoming: mine.filter(e => e.is_private !== true).slice(0, 12).map(shapeEvent),
            }
          })),
        }
      })()),
    })
  }

  // ── AN UPLOAD SLOT ──────────────────────────────────────────────────────────────────────────────
  if (action === 'upload_url') {
    /* ⚠️ FOUR SLOTS NOW. `blank`/`example` are the week design's; `event-default` is the single-event
     * design's picture; `place` and `one-off` are stage 2's per-place and per-event pictures. The name
     * only shapes the stored path — what a file is allowed to BE is decided by `confirm_upload`, from
     * the bytes. */
    /* ⚠️ `place-picture` IS THE SIXTH SLOT (part 3) — a picture for a place's LIBRARY, which is not
     * tied to a post type. `place` (stage 2's single per-place background) still exists and still
     * writes `truck_places.event_bg_path`; the two are different things and both are kept. */
    const SLOTS = ['blank', 'example', 'event-default', 'place', 'one-off', 'place-picture'] as const
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
          .select(`id, event_bg_path, event_bg_width, event_bg_height, event_layout, ${SLOT_COLS}`)
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

      /* ══ 🔴 §6 · "Also save it for <location>" ═══════════════════════════════════════════════════
       * ⛔ IT IS A **SECOND** WRITE, NOT A REDIRECTION OF THE FIRST. The one-off row is still written
       * above, so this post keeps its own image even if the location's event image is changed again
       * tomorrow — which is what "for this post only" promised, and the tick is an addition to it
       * rather than a replacement of it.
       * ⚠️ THE SAME OBJECT, POINTED AT TWICE. A `place_pictures` row is inserted for the path that is
       * already stored; nothing is re-uploaded and nothing is copied. ⛔ `onConflict: 'path'` WITH
       * `ignoreDuplicates` BECAUSE `place_pictures_path_uidx` IS A FULL UNIQUE INDEX ON `path`: ticking
       * the box twice for the same upload must be a no-op, not a 23505.
       * ⚠️ A PRIVATE EVENT CANNOT REACH THIS. `eventPostContext` returns no `placeId` for one, so there
       * is no location to save against — the privacy rule holds without a second test.
       * ⚠️ A FAILURE HERE DOES NOT FAIL THE UPLOAD. The post has its image; what did not happen is the
       * extra save, and it is reported rather than rolled back. */
      let savedForPlace = false
      if (body.alsoSaveForPlace === true && target.placeId) {
        const placeRow = await placeById(truck.id, target.placeId)
        if (placeRow) {
          await materialiseLegacy(truck.id, placeRow as never)
          const { data: existing } = await supabase.from('place_pictures')
            .select('id').eq('truck_id', truck.id).eq('place_id', target.placeId)
          await supabase.from('place_pictures').upsert({
            truck_id: truck.id,
            place_id: target.placeId,
            path,
            file_name: String(body.fileName ?? '').trim().slice(0, 120) || path.split('/').pop() || 'picture',
            bytes: bytes.length,
            width: check.info.width,
            height: check.info.height,
            is_main: (existing ?? []).length === 0,
            label: null,
            sort_order: (existing ?? []).length,
          } as never, { onConflict: 'path', ignoreDuplicates: true })
          /* ⚠️ THE ROW IS FOUND BY **PATH** RATHER THAN BY THE UPSERT'S RETURN. `ignoreDuplicates`
           * returns nothing on a conflict, so the id has to be read back — and the path is unique, so
           * there is exactly one answer. */
          const { data: row } = await supabase.from('place_pictures')
            .select('id').eq('truck_id', truck.id).eq('place_id', target.placeId).eq('path', path).maybeSingle()
          const newId = String((row as { id?: string } | null)?.id ?? '')
          if (newId) {
            const r = await setPlaceSlot(truck.id, target.placeId, 'event', newId)
            savedForPlace = r.ok
          }
        }
      }
      return NextResponse.json({
        ok: true, url: await signed(path), width: check.info.width, height: check.info.height,
        savedForPlace,
      })
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
        .select(`id, name, event_bg_path, event_bg_width, event_bg_height, ${SLOT_COLS}`)
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
      showPrivate,
      excludedEventIds: Array.isArray(body.excluded) ? body.excluded.map(String) : [],
    })
    const orderUrl = truck.slug ? scanUrl(truck.slug) : null
    const note = typeof body.note === 'string' ? body.note : null
    /* 🔴 `now` COMES FROM THE REQUEST. The per-event wording is relative to when the operator copies
     * it, and this route is called when they open the screen — so the server's clock at that moment is
     * the right one. The harness passes its own, which is why every function takes it. */
    const now = new Date()
    /* ══ 🔴 THE WEEKLY CAPTION COMES FROM THE TRUCK'S SAVED TEMPLATE (8 October 2026) ════════════════
     * ⚠️ AND FALLS BACK TO THE SEED, WHICH FILLS TO EXACTLY WHAT `weekCaption` WROTE. A truck who has
     * never opened the editor sees the caption they have always seen — that is what "nothing changes
     * until the truck edits it" means, and it is driven in scripts/caption-template.cjs rather than
     * assumed.
     * ⛔ THE OPERATOR'S NOTE IS APPENDED, NOT TEMPLATED. It is a per-WEEK thing typed on the make
     * screen; a label for it would be a chip for something that changes every time. */
    const weekTpl = String(design?.caption_template ?? '').trim() || seedWeekTemplate(truck.name)
    const weekFilled = fillCaptionTemplate(
      weekTpl, weekCaptionValues({ week, orderUrl, timeStyle: layout?.timeStyle ?? '12h', country }))
    const trimmedNote = String(note ?? '').trim()
    return NextResponse.json({
      caption: trimmedNote ? `${weekFilled}\n\n${trimmedNote}` : weekFilled,
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
      showPrivate,
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

    /* 🔴 THE FONTS ARE LOADED BEFORE THE RENDER STARTS. `boxEl` is synchronous and `fitLines` measures
     * with the font's own metrics, so the bytes have to be in hand first — see the header of
     * `lib/weekly-post/font-bundle.ts`. ⚠️ A FONT THAT CANNOT BE LOADED IS REPORTED, NOT FATAL: the
     * poster renders in Oswald and the warning header says which box lost its font. */
    const fontsLoaded = await loadFontsForDesign(idsOfLayout(v.layout, 'week'), truck.id, fontDeps)
    /* ══ 🔴 THE PLACE PICTURES, FETCHED BEFORE THE RENDER ═════════════════════════════════════════
     * ⚠️ ONLY WHEN THE DESIGN ASKS FOR THEM. A design with the item switched off does no reads at all,
     * which is every design that existed before today.
     * ⛔ THE PLACE IDS COME OUT OF THE WEEK'S OWN ENTRIES, and `entryFor` has already nulled a PRIVATE
     * booking's — so a private event's venue is not even in the list this asks about. */
    const weekPics = v.layout.placePicture.enabled
      ? await placePictureSources(
          truck.id,
          week.days.flatMap(d => d.entries.map(e => e.placeId)),
          v.layout.placePicture.ifMissing === 'logo',
          /* ⚠️ THE **WEEKLY** SURFACE: `picture_use` is applied here, so a picture set to "Single
           * event posts" is not drawn beside its row. */
          'weekly',
        )
      : undefined
    const out = await renderWeeklyPost({
      layout: v.layout, week, blankDataUri: toDataUri(bytes, info),
      note: typeof body.note === 'string' ? body.note : null,
      country,
      fonts: fontsLoaded.bundle,
      placePictures: weekPics,
    })
    for (const id of fontsLoaded.missing) {
      out.warnings.push({ where: 'font', message: `A font this design uses (${id}) could not be loaded — those boxes are in Oswald.` })
    }
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
        .select(`id, venue_id, name_key, name, short_name, area, merged_into_id, is_hidden, is_favourite, event_bg_path, event_bg_width, event_bg_height, event_layout, ${SLOT_COLS}`)
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
    /* 🔴 THE SETUP PREVIEW DRAWS REAL EVENTS, so a private one previews as "Private event" here too —
     * otherwise the operator would place their text boxes against a venue name the poster will not
     * print. Same probed read, same fail-closed direction. */
    const previewRows = [...((upcoming ?? []) as WeekEvent[]), ...((past ?? []) as WeekEvent[])]
    const previewPrivacy = await readPrivateEventIds(
      supabase, previewRows.map(e => e.id), 'weekly-post event_load')
    for (const r of previewRows) r.is_private = previewPrivacy.isPrivate(r.id)
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
           * be handed Standard's dimensions for a canvas that is a different shape.
           * 🔴 AND IT IS NORMALISED FIRST (7 October 2026), by the same one door the standard design
           * uses. ⚠️ ONLY WHEN THE PLACE HAS ITS OWN PICTURE SIZE: with no `pw`/`ph` there is no canvas
           * to validate against, and `null` here means "this place is on Standard's positions", which
           * `layoutFor` in EventPost.tsx already handles. Defaulting it would invent positions for a
           * place that never had any. */
          layout: (ownPositions && pw && ph)
            ? readStoredEventLayout(pl.event_layout, pw, ph).layout
            : null,
          /* Kept for the existing "Background for each place" behaviour this list replaces. */
          fitsDefault: fits,
          status: placeDesignStatus({ hasPicture: !!pl.event_bg_path, ownPositions, fitsDefault: fits }),
          preview: previewFor(String(pl.id)),
        }
      }))

    return NextResponse.json({
      missingTable,
      /* ⛔ `designIsReady`, NOT `design ?`. This one was the worse of the two: a row with NO
       * `blank_path` came back as a design, `EventSetupScreen` skipped its "Set up your event post"
       * card on `!standard`, and the editor then read `standard.width` off a null. */
      /* 🔴 `readStoredEventLayout`, NOT `design!.layout` — 7 October 2026. This line sent the jsonb
       * column to the browser untouched, behind an `as EventLayout` cast that asserts nothing at
       * runtime, and the editor then read `placeStyle` off a design saved before that field existed.
       * ⛔ THE CANVAS IS THE DESIGN'S OWN, which is what proves a box sits inside the artwork. */
      design: designIsReady(design) ? {
        width: design!.width, height: design!.height,
        layout: readStoredEventLayout(design!.layout, design!.width ?? 0, design!.height ?? 0).layout,
        backgroundUrl: await signed(design!.blank_path),
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
      country,
      hasLogo: !!(truck as unknown as { logo_storage_path?: string | null }).logo_storage_path,
      placesWithout: await placesWithoutPicturesFor(truck.id),
      /* ══ 🔴 "Preview with": THE NEXT FEW EVENTS, LABELLED ════════════════════════════════════════
       * ⛔ BEFORE THIS, THE PREVIEW EVENT WAS NOT A CHOICE AT ALL — the server picked one and the
       * screen explained itself when the pick was odd. An operator designing for a festival in three
       * weeks could not see their design against it.
       * ⚠️ PUBLIC EVENTS ONLY, AND THAT IS NOT COSMETIC. A private booking previews as "Private event"
       * with no place, so offering it as a preview would mean choosing the one event that shows the
       * operator the least about their own place box. `is_private` was resolved above, fail-closed.
       * ⚠️ LABELLED WITH `shortDate`, THE CAPTION'S OWN FORMATTER, so a dropdown of dates is worded
       * the same way as everything else this feature writes — and in the truck's own country's order. */
      previewEvents: (upcoming ?? [])
        .filter((e: Record<string, unknown>) => e.is_private !== true)
        .slice(0, 8)
        .map((e: Record<string, unknown>) => {
          const entry = entryFor(e as never, allPlaces as never, ts)
          return {
            id: String(e.id),
            label: `${shortDate(String(e.event_date ?? ''), country)} · ${entry.name}`,
          }
        }),
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
    /* ⛔ NO SINGLE-EVENT POST FOR A PRIVATE EVENT (20261014, decision 4). A one-event poster exists to
     * be published — "we're at the Five Bells on Friday" — and there is nothing publishable about a
     * private booking: the poster would read "Private event" with a background and an Order link,
     * which is an advert for something nobody can come to.
     * ⚠️ REFUSED ON BOTH `event_post` AND `event_render`, not only in the UI. The screen does not
     * offer the button for a private event; this is what makes the absence true of the ROUTE, which
     * is the rule the event-types gate follows too ("the screen decides what is drawn, the route
     * decides what is done"). */
    if (await isSinglePostBlocked(eventId)) {
      return NextResponse.json({ error: PRIVATE_NO_SINGLE_POST }, { status: 400 })
    }
    const { design } = await loadDesign(truck.id, EVENT_KIND)
    const ctx = await eventPostContext(truck, eventId, design)
    if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
    const layout = (design?.layout ?? null) as EventLayout | null
    /* ══ 🔴 THE POST TEXT COMES FROM THE TRUCK'S SAVED TEMPLATE (8 October 2026) ════════════════════
     * ⚠️ AND FALLS BACK TO THE SEED, WHICH FILLS TO EXACTLY WHAT `eventPostText` WROTE — including the
     * relative "tonight"/"tomorrow"/"on Tue 13 Oct", because `{day-date}` carries `whenPhrase`. A
     * truck who has never opened the editor sees the text they have always seen.
     * ⛔ A CANCELLED EVENT IS THE ONE EXCEPTION AND KEEPS `eventPostText`. That branch is an APOLOGY
     * with no ordering link — sending customers to order from an event that is not happening is the
     * one thing this text must never do — and a truck's own template could not be trusted to say it.
     * 🔴 THE TAG NEVER REACHES A PRIVATE BOOKING: `ctx.socialTag` is null for one, and the label then
     * removes itself cleanly. */
    const now = new Date()
    const orderUrlForPost = truck.slug ? scanUrl(truck.slug) : null
    const eventTpl = String(design?.caption_template ?? '').trim() || seedEventTemplate(truck.name)
    const text = ctx.entry.status === 'cancelled'
      ? eventPostText({
        truckName: truck.name, entry: ctx.entry, date: ctx.date,
        orderUrl: orderUrlForPost, timeStyle: layout?.timeStyle ?? '12h', now,
      })
      : fillCaptionTemplate(eventTpl, eventCaptionValues({
        placeName: ctx.entry.name,
        town: ctx.town,
        date: ctx.date,
        startTime: ctx.entry.startTime,
        endTime: ctx.entry.endTime,
        orderUrl: orderUrlForPost,
        timeStyle: layout?.timeStyle ?? '12h',
        socialTag: ctx.socialTag,
        country,
        now,
      }))
    return NextResponse.json({
      /* 🔴 `designIsReady`, so the modal routes to setup rather than proceeding into
       * `eventPostContext`, which refuses a half-written row with "No event design yet." — a sentence
       * that reads like a bug to the operator who has just pressed Make post. */
      hasDesign: designIsReady(design),
      event: { id: eventId, date: ctx.date, name: ctx.entry.name, town: ctx.entry.town, time: ctx.entry.time, status: ctx.entry.status },
      options: ctx.options,
      chosen: ctx.chosen.source,
      /* ⚠️ THE MODAL IS TOLD WHOSE POSITIONS IT IS GETTING, not just whose picture. Choosing
       * "Standard design" at a place that has its own moves the text as well as the background, and a
       * screen that said only "Standard picture" would be describing half of what happened. */
      layoutSource: ctx.layoutSource,
      placeName: ctx.placeName,
      /* 🔴 §6 · WHETHER THERE IS A LOCATION TO SAVE AN UPLOAD AGAINST. ⛔ NULL FOR A PRIVATE BOOKING,
       * which is what keeps "Also save it for <location>" off that modal without a second test on the
       * client — the privacy rule is the server's, as it is everywhere else on this route. */
      placeId: ctx.placeId,
      text,
      /* ══ ⛔ THE PICTURE CHOOSER IS GONE — 7 October 2026, §6 ══════════════════════════════════════
        * It listed every picture in the location's library with the Main one ticked, and it existed
        * because a location could have several and only one was used automatically. A location now has
        * at most TWO images, one per job, so there is nothing to choose BETWEEN: the event image is the
        * event image. 🔴 WHAT REPLACED IT IS THE `options` ARRAY ABOVE — the location's photo or
        * poster, the standard design, or an upload for this post only — which is a choice about WHICH
        * SOURCE rather than which file, and is the choice an operator actually has.
        * ⚠️ `event_render` NO LONGER ACCEPTS `placePictureId` EITHER. Both halves went together; a
        * parameter nothing sends is a path nothing tests. */
    })
  }

  /**
   * ══ 🔴 §2 · WHAT THE LIVE EVENT TEXT SAYS ═════════════════════════════════════════════════════════
   *
   * ⛔ THE EDITOR CANNOT WORK IT OUT. It has the layout, so it knows where the venue box is and what it
   * looks like; it does not know that the chosen event is The Bull Inn, Cavendish, 17:00–21:00, nor
   * that a PLACE design previews with that place's own name in the venue box even when the preview
   * event belongs somewhere else.
   * 🔴 SO IT IS ANSWERED BY THE SAME TWO STEPS `event_render` USES — `eventPostContext`, then the
   * `designPlaceId` name substitution — and nothing else. ⚠️ A SECOND DERIVATION HERE WOULD BE A SECOND
   * ANSWER TO "whose name goes in that box", and the one on the poster would be the server's.
   * ⛔ IT RETURNS **NO PICTURE AND NO LAYOUT**: it is the words, for one event, and the private-booking
   * refusal above it is the same one `event_render` makes.
   * ⚠️ IT IS ASKED ONCE PER "Preview with" CHOICE, not once per edit — the whole point of §2 is that
   * moving a box costs no round trip.
   */
  if (action === 'event_preview_entry') {
    const eventId = String(body.eventId ?? '')
    if (!eventId) return NextResponse.json({ error: 'eventId required' }, { status: 400 })
    if (await isSinglePostBlocked(eventId)) {
      return NextResponse.json({ error: PRIVATE_NO_SINGLE_POST }, { status: 400 })
    }
    const { design } = await loadDesign(truck.id, EVENT_KIND)
    if (!design) return NextResponse.json({ error: 'No event design yet.' }, { status: 400 })
    const ctx = await eventPostContext(truck, eventId, design, null)
    if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

    let entry = ctx.entry
    const designPlaceId = typeof body.designPlaceId === 'string' && body.designPlaceId
      ? String(body.designPlaceId) : null
    if (designPlaceId) {
      /* ⚠️ THE SAME SUBSTITUTION AS `event_render`, AND FOR THE SAME REASON: a place's design previews
       * with that place's NAME in the venue box, which is the "no events here yet" fallback. ⛔ THE NAME
       * IS READ FROM THE ROW, server-side — a client-sent name would be arbitrary text drawn at any
       * size on a poster. */
      const { data: place } = await supabase.from('truck_places')
        .select('id, name, short_name')
        .eq('id', designPlaceId).eq('truck_id', truck.id).maybeSingle()
      if (!place) return NextResponse.json({ error: 'Place not found' }, { status: 404 })
      const row = place as Record<string, unknown>
      const nm = String(row.short_name ?? '').trim() || String(row.name ?? '')
      if (nm) entry = { ...entry, name: nm, placeId: designPlaceId }
    }
    return NextResponse.json({ ok: true, entry, date: ctx.date })
  }

  if (action === 'event_render') {
    const eventId = String(body.eventId ?? '')
    if (await isSinglePostBlocked(eventId)) {
      return NextResponse.json({ error: PRIVATE_NO_SINGLE_POST }, { status: 400 })
    }
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
        .select(`id, name, short_name, event_bg_path, event_bg_width, event_bg_height, ${SLOT_COLS}`)
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

    /* ══ 🔴 THE WHOLE POSTER — AND IT IS **`resolveDesign`'s** ANSWER NOW (7 October 2026) ════════
     *
     * ⛔ THIS BLOCK USED TO RESOLVE THE PLACE'S PICTURE A SECOND TIME, and that was a real defect, not
     * just duplication. It read the place's Main picture and assigned `picked2` whenever the design
     * said `placement: 'background'` — **unconditionally**, over whatever `eventPostContext` had
     * chosen. So a one-off image uploaded for this post was silently overridden by the location's
     * picture, which inverts the one order the brief states: this post's image > the location's event
     * image > the standard design.
     *
     * 🔴 THE ORDER NOW EXISTS EXACTLY ONCE, in `resolveDesign`, reading `eventPostContext`'s
     * `placeImgRaw` — which is the location's **event slot** (see the note there). `picked` already
     * holds the winner, including the 1% shape test, so there is nothing left to swap.
     *
     * ⚠️ WHAT SURVIVES IS THE **WARNING**, because that is the half `resolveDesign` cannot give: it
     * returns the picture it chose, not the picture it declined. An operator whose venue poster is a
     * different shape sees the standard background with no explanation unless this says so.
     * ⛔ AND IT IS SAID ONLY WHEN THE POSTER MODE IS IN FORCE. With a photo space on the design the
     * location's image goes in that box at any shape, so a shape complaint there would be about a rule
     * that does not apply.
     * ⚠️ `usableAsWholeBackground` IS THE SAME FUNCTION THE LOCATIONS SCREEN CALLS — one rule, two
     * readers — and a location with its OWN text positions is exempt, because its boxes were placed on
     * its own picture.
     * ⛔ A PRIVATE EVENT NEVER GETS HERE: `entry.placeId` is null for a private booking, and
     * `isSinglePostBlocked` refused the request above. Two defences, both on the server. */
    /* ══ 🔴 THE PLAN FOR THIS POST'S IMAGES — ONE FUNCTION, ONE ORDER (8 October 2026) ══════════════
     *
     * ⛔ THIS BLOCK HAS BEEN WRONG TWICE AND EACH FIX NARROWED IT. It once resolved the location's
     * picture a SECOND time and assigned the background unconditionally, silently overriding a one-off
     * upload. Then it asked `eventImageMode(placePicture.enabled)` — which made the DESIGN decide
     * whether a location's image was a photo or a poster.
     *
     * 🔴 NEITHER QUESTION IS ASKED HERE ANY MORE. `planEventImages` owns the whole order — this post's
     * own image > the location's event POSTER > the standard design, with the location PICTURE in the
     * design's photo space when `picture_use` allows it and the design has one. ⛔ AND A POSTER BEATS A
     * PICTURE on an event post: the poster IS the background, so its photo space would be a hole
     * punched in the truck's own artwork.
     *
     * ⚠️ WHAT SURVIVES HERE IS THE **WARNING**, because that is the half a resolver cannot give: it
     * returns the picture it chose, not the picture it declined. An operator whose poster is a
     * different shape sees the standard background with no explanation unless this says so.
     * ⛔ A PRIVATE EVENT NEVER GETS HERE: `entry.placeId` is null for a private booking, and
     * `isSinglePostBlocked` refused the request above. Two defences, both on the server. */
    const picked2 = picked
    const posterFits = (() => {
      const poster = ctx.locationImages?.poster ?? null
      if (!poster) return false
      /* ⚠️ `layoutSource === 'place'` IS "this location has its own text positions", which is the
       * exemption: its boxes were placed on its own picture, so any shape is allowed. ⛔ IT IS READ
       * FROM THE CONTEXT RATHER THAN RE-QUERIED — `eventPostContext` already validated that layout
       * against the poster's stored size, and a second read could disagree with the one that decided
       * the canvas this render is using. */
      return usableAsWholeBackground(
        poster, { width: canvas.width, height: canvas.height }, ctx.layoutSource === 'place')
    })()
    const plan = planEventImages({
      hasOneOff: picked.source === 'event',
      images: ctx.locationImages,
      designHasPhotoSpace: v.layout.placePicture.enabled,
      isPrivate: !entry.placeId,
      posterFits,
    })
    /* ⚠️ `used` IS REPORTED, NOT CAUSED. It is true when the resolver independently landed on that same
     * picture, which is what makes this a description of the render rather than a second decision
     * about it. A one-off wins, and then this correctly says `none`. */
    const wholeBackground: 'used' | 'wrong-shape' | 'none' =
      !ctx.locationImages?.poster ? 'none'
        : !posterFits ? 'wrong-shape'
        : plan.background === 'poster' ? 'used'
        : 'none'
    const bytes = await downloadObject(picked2.path)
    if (!bytes) return NextResponse.json({ error: 'That picture could not be read.' }, { status: 500 })
    const info = readImageInfo(bytes)
    if (!info) return NextResponse.json({ error: 'That picture could not be read.' }, { status: 500 })

    const eventFonts = await loadFontsForDesign(idsOfLayout(v.layout, 'event'), truck.id, fontDeps)
    /* ⛔ THE PLAN DECIDES, NOT THE DESIGN SWITCH. `plan.pictureInPhotoSpace` is already false when the
     * design has no photo space, when there is no picture, and when a poster won — three conditions in
     * one answer, so this call site cannot get one of them wrong.
     * ⚠️ IT WAS FOUR CONDITIONS UNTIL 9 OCTOBER: `picture_use` could say "weekly posts only", and that
     * was a fourth way for this to be false. The choice is gone — one picture is used wherever a design
     * has a space — so the column is no longer read by anything. ⚠️ `'event'` IS THE **SURFACE**, which
     * is what picks `eventPictureFor` over `weeklyPictureFor`; see the note in place-pictures.ts on why
     * the columns were not renamed. */
    const eventPics = plan.pictureInPhotoSpace
      ? await placePictureSources(truck.id, [entry.placeId], v.layout.placePicture.ifMissing === 'logo', 'event')
      : undefined
    /* ══ ⛔ `placePictureId` IS NO LONGER READ — 7 October 2026, §6 ═══════════════════════════════
     * This block downloaded whichever library picture the modal's chooser had ticked and substituted
     * it for this render. There is no chooser: a location has ONE event image, and `placePictureSources`
     * above fetched exactly that. ⚠️ THE OWNERSHIP CHECK THAT USED TO LIVE HERE — "a picture id is a
     * string a client sent, so a poster must not be able to draw any object in the bucket because a
     * caller named it" — is not lost; it moved to `place_slot_use`, which is now the only way a client
     * can name a picture at all. */
    const out = await renderEventPost({
      country,
      layout: v.layout, entry, date: ctx.date,
      backgroundDataUri: toDataUri(bytes, info),
      note: typeof body.note === 'string' ? body.note : null,
      fonts: eventFonts.bundle,
      placePictures: eventPics,
    })
    for (const id of eventFonts.missing) {
      out.warnings.push({ where: 'font', message: `A font this design uses (${id}) could not be loaded — those boxes are in Oswald.` })
    }
    /* ⚠️ SAID OUT LOUD ON THE SCREEN, not only on the picture's own tile. An operator previewing this
     * event needs to know WHY their venue's poster is not the background. */
    if (wholeBackground === 'wrong-shape') {
      out.warnings.push({ where: 'place-picture', message: 'This place’s picture is a different shape from your design, so the standard background is used.' })
    }
    return new NextResponse(new Uint8Array(out.png), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `inline; filename="event-post-${ctx.date}.png"`,
        'Cache-Control': 'no-store',
        'X-Render-Ms': String(out.ms),
        'X-Background-Source': picked2.source,
        /* ⚠️ FOR THE HARNESS AND THE REPORT: whether "Whole background" was used, refused for its
         * shape, or not asked for. A header, because the body is the PNG. */
        'X-Place-Background': wholeBackground,
        'X-Layout-Source': designPlaceId ? 'place' : ctx.layoutSource,
        'X-Render-Warnings': encodeURIComponent(JSON.stringify(out.warnings)),
      },
    })
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 PART 2 · FONTS — THE LIBRARY, AND A TRUCK'S OWN
  // ══════════════════════════════════════════════════════════════════════════════════════════

  /**
   * The catalogue, for the picker.
   *
   * ⚠️ IT IS SENT ONCE PER PAGE AND IS ~99KB OF TUPLES. The alternative — bundling it into the client
   * — would add 129KB to the first paint of `app/manage/[token]/page.tsx`, the largest client bundle in
   * this product, for a list most operators will never open. `lib/weekly-post/font-catalogue.ts`'s
   * header sets that out.
   * ⚠️ IT ALSO RETURNS THE TRUCK'S OWN FONTS AND THEIR RECENT ONES, so the picker opens complete
   * rather than in three states as three requests land.
   */
  if (action === 'font_catalogue') {
    const { data: mine } = await supabase.from('truck_fonts')
      .select('family, display_name, weight, style, created_at')
      .eq('truck_id', truck.id)
      .order('created_at', { ascending: true })
    /* ⚠️ GROUPED INTO FAMILIES HERE, NOT IN THE BROWSER. A family is up to three rows (Regular, Bold,
     * Italic) and the picker needs one entry with two flags — which is the same shape a library family
     * has, so the picker can draw both kinds with one row component. */
    const own = new Map<string, { id: string; family: string; displayName: string; hasBold: boolean; hasItalic: boolean; faces: string[] }>()
    for (const r of (mine ?? []) as Array<Record<string, unknown>>) {
      const family = String(r.family ?? '')
      if (!family) continue
      const id = ownFontId(family)
      const e = own.get(id) ?? { id, family, displayName: String(r.display_name ?? family), hasBold: false, hasItalic: false, faces: [] }
      const weight = Number(r.weight) === 700 ? 700 : 400
      const style = r.style === 'italic' ? 'italic' : 'normal'
      if (weight === 700 && style === 'normal') e.hasBold = true
      if (style === 'italic') e.hasItalic = true
      e.faces.push(faceKey({ weight, style }))
      own.set(id, e)
    }

    /* 🔴 "Recently used" IS READ OFF THE TRUCK'S OWN SAVED DESIGNS, not from a new table. The fonts a
     * truck has used ARE the fonts in their designs; a `font_recent` table would be a second record of
     * the same fact, and it would be wrong the moment anyone edited a design without going through the
     * picker. ⚠️ BOTH KINDS OF DESIGN ARE READ — weekly and single event — plus every place design. */
    const recent: string[] = []
    const pushIds = (ids: string[]) => { for (const id of ids) if (!recent.includes(id)) recent.push(id) }
    const { data: designs } = await supabase.from('truck_post_designs')
      .select('kind, layout').eq('truck_id', truck.id)
    for (const d of (designs ?? []) as Array<{ kind: string; layout: unknown }>) {
      pushIds(idsOfLayout(d.layout, d.kind === 'event' ? 'event' : 'week'))
    }
    const { data: placeLayouts } = await supabase.from('truck_places')
      .select('event_layout').eq('truck_id', truck.id).not('event_layout', 'is', null)
    for (const pl of (placeLayouts ?? []) as Array<{ event_layout: unknown }>) {
      pushIds(idsOfLayout(pl.event_layout, 'event'))
    }

    return NextResponse.json({
      ...cataloguePayload(),
      own: [...own.values()],
      /* ⚠️ A RECENT ID THAT NO LONGER RESOLVES IS DROPPED HERE. A truck who deleted an uploaded font
       * still has a design naming it; offering it again at the top of the picker would be offering a
       * font that cannot be loaded. */
      recent: recent.filter(id => {
        const ref = parseFontId(id)
        if (!ref) return false
        return ref.kind === 'own' ? own.has(id) : !!catalogueFamily(id)
      }).slice(0, 8),
    })
  }

  /**
   * Choose a library font — which is where the FETCH happens, once ever, for all trucks.
   *
   * 🔴 CALLED WHEN THE OPERATOR PICKS THE FONT, NOT WHEN THEY SAVE. Fetching at save time would put a
   * network round trip inside "Save design", and fetching at RENDER time is the thing this whole
   * feature is built not to do. By the time a design naming `g:lobster` is rendered, Lobster's files
   * are already in our storage.
   * ⚠️ IT IS IDEMPOTENT AND CHEAP ON EVERY CALL AFTER THE FIRST — a `select` on the cache table.
   */
  if (action === 'font_choose') {
    const id = String(body.fontId ?? '')
    const ref = parseFontId(id)
    if (!ref) return NextResponse.json({ error: 'That is not a font we know.' }, { status: 400 })
    /* ⚠️ A BUNDLED FONT NEEDS NOTHING DOING. Its file is committed; there is no fetch and no row. */
    if (ref.kind === 'bundled') return NextResponse.json({ ok: true, ready: true, fetched: false })
    if (ref.kind === 'own') {
      const faces = await fontRegistry.ownFaces(truck.id, ref.slug)
      return NextResponse.json({ ok: faces.length > 0, ready: faces.length > 0, fetched: false })
    }

    /* ⛔ THE LICENCE RULE IS ENFORCED HERE, AT THE POINT OF CHOOSING. `isChoosableLibraryFont` is
     * membership of `font-catalogue.json`, and that file admits only families whose licence comes from
     * the apache/, ofl/ or ufl/ directory of google/fonts AND that have been probed to yield a static
     * TTF. A family outside it is refused rather than attempted. */
    if (!isChoosableLibraryFont(ref.id)) {
      return NextResponse.json({ error: 'That font is not in the library.' }, { status: 400 })
    }
    const entry = catalogueFamily(ref.id)!
    try {
      const ensured = await ensureLibraryFamily(entry.family, fontDeps)
      return NextResponse.json({
        ok: true, ready: true, fetched: ensured.fetched,
        faces: ensured.faces.map(f => faceKey(f)),
      })
    } catch (e) {
      /* ⚠️ THE REASON IS SHOWN, because the two likely ones need different actions from the operator:
       * the migration has not been run, or the font source is unreachable right now. */
      return NextResponse.json({
        error: `${entry.family} could not be added: ${e instanceof Error ? e.message : 'unknown error'}`,
      }, { status: 502 })
    }
  }

  /** A signed URL to PUT a font file to. ⚠️ The same three-call flow as every picture upload. */
  if (action === 'font_upload_url') {
    const ext = String(body.ext ?? 'ttf').toLowerCase() === 'otf' ? 'otf' : 'ttf'
    /* ⚠️ A STAGING PATH UNDER THE TRUCK'S OWN FOLDER. The real path depends on the FAMILY and the
     * FACE, which are read from the bytes in `font_confirm` — so the file lands here first and is
     * copied into place once it has been parsed. ⛔ THE PATH IS BUILT SERVER-SIDE AND STARTS WITH THE
     * TRUCK ID: a client-supplied path would be authority to write into another truck's folder. */
    const path = `trucks/${truck.id}/incoming-${Date.now()}.${ext}`
    const { data, error } = await supabase.storage.from(FONT_BUCKET).createSignedUploadUrl(path)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ uploadUrl: data.signedUrl, path })
  }

  /**
   * Confirm an uploaded font: read the real bytes, decide what it IS, and keep it or throw it away.
   *
   * 🔴 EVERYTHING IS DECIDED FROM THE BYTES. The filename is whatever the file was called on the
   * operator's machine and is supplied by the browser; "Bold" in it may be a lie. The family and the
   * face come from the font's own `name`, `OS/2` and `head` tables.
   */
  if (action === 'font_confirm') {
    const path = String(body.path ?? '')
    /* ⛔ FIRST, BEFORE ANYTHING IS READ. A path outside this truck's folder is a request to parse — and
     * then publish under this truck's name — somebody else's file. */
    if (!path.startsWith(`trucks/${truck.id}/`)) return NextResponse.json({ error: 'Unknown file' }, { status: 400 })

    /* 🔴 THE TICK IS A PRECONDITION, NOT A FLAG. §3: a required tick, and when it was ticked. The
     * column is NOT NULL, so there is no way to store the file without it — and the file is removed
     * rather than left in the bucket unreferenced. */
    if (body.licenceConfirmed !== true) {
      await fontStorage.remove([path])
      return NextResponse.json({ error: 'Please tick to confirm you own or have a licence to use this font.' }, { status: 400 })
    }

    const bytes = await fontStorage.download(path)
    if (!bytes) return NextResponse.json({ error: 'That upload did not arrive — please try again.' }, { status: 400 })

    const discard = async (message: string, status = 400) => {
      /* ⚠️ A REFUSED FILE IS REMOVED. Leaving it would accumulate unreferenced objects in a private
       * bucket that nothing ever lists — the same rule `confirm_upload` follows for pictures. */
      await fontStorage.remove([path])
      return NextResponse.json({ error: message }, { status })
    }

    if (bytes.length > MAX_FONT_BYTES) {
      return discard(`That font is ${(bytes.length / 1024 / 1024).toFixed(1)}MB. The limit is 5MB.`)
    }

    /* ⛔ WOFF AND WOFF2 ARE NAMED SEPARATELY, IN THE BRIEF'S WORDS, BECAUSE THEY ARE THE COMMON
     * MISTAKE. A web font is what a browser downloads and what most "download your font" buttons on a
     * foundry's site give you second; satori cannot read either, and "unknown magic 0x774f4632" would
     * tell the operator nothing about what to do next. */
    const magic = bytes.slice(0, 4).toString('latin1')
    if (magic === 'wOFF' || magic === 'wOF2') return discard(WOFF_REFUSAL)

    let names, face, metrics
    try {
      names = readFontNames(bytes)
      face = faceOfFont(bytes, names)
      /* 🔴 PARSED WITH THE SAME READER THE RENDERER USES. A file that `readFontMetrics` cannot read is
       * a file that would lay out as nothing — so it is refused here rather than stored and discovered
       * on a poster. */
      metrics = readFontMetrics(bytes)
    } catch (e) {
      const why = e instanceof Error ? e.message.replace(/^font: /, '') : 'it could not be read'
      return discard(`That file could not be read as a font — ${why}.`)
    }
    if (!metrics.advance.size) return discard('That font has no letters we can measure — it may be an icon font.')

    const family = face.family
    const slug = slugOfFamily(family)
    if (!slug) return discard('That font does not say what family it belongs to.')

    /* ⚠️ THE OPERATOR MAY HAVE RENAMED IT ALREADY, from the first face's prompt. A later face of the
     * same family inherits the name they chose rather than resetting it to the font's own. */
    const { data: existing } = await supabase.from('truck_fonts')
      .select('family, display_name, weight, style, storage_path')
      .eq('truck_id', truck.id)
    const siblings = ((existing ?? []) as OwnFaceRow[]).filter(r => slugOfFamily(r.family) === slug)
    const asked = typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 60) : ''
    const displayName = asked || siblings[0]?.display_name || family

    const ext: 'ttf' | 'otf' = path.endsWith('.otf') ? 'otf' : 'ttf'
    const finalPath = ownPath(truck.id, slug, { weight: face.weight, style: face.style }, ext)
    try {
      /* ⚠️ COPIED TO ITS REAL PATH AND THE STAGING OBJECT REMOVED. The path encodes the family and the
       * face, which are only known now — and `upsert: true` means re-uploading a face replaces it. */
      await fontStorage.upload(finalPath, bytes)
      if (finalPath !== path) await fontStorage.remove([path])
    } catch (e) {
      return discard(`That font could not be stored: ${e instanceof Error ? e.message : 'unknown error'}`, 500)
    }

    const { error: insErr } = await supabase.from('truck_fonts').upsert({
      truck_id: truck.id,
      family,
      display_name: displayName,
      weight: face.weight,
      style: face.style,
      storage_path: finalPath,
      file_bytes: bytes.length,
      /* 🔴 WHEN THE TICK WAS TICKED — the server's clock, at the moment it accepted the file. Not a
       * timestamp the browser sent, which would be a claim about when somebody says they agreed. */
      licence_confirmed_at: new Date().toISOString(),
    } as never, { onConflict: 'truck_id,family,weight,style' })
    if (insErr) {
      const missing = (insErr as { code?: string }).code
      if (missing === 'PGRST205' || missing === '42P01') {
        return discard('Uploaded fonts need a database update — run supabase/migrations/20261017_post_fonts.sql first.', 503)
      }
      return discard(insErr.message, 500)
    }

    /* 🔴 WHAT THE FACE WAS DECIDED TO BE IS RETURNED, so the editor can SAY so. A font that calls
     * itself "SemiBold" lands on Bold, and an operator who uploaded it as their regular needs to see
     * that before they wonder why their text is heavy. */
    const have = new Set([...siblings.map(r => faceKey({ weight: r.weight, style: r.style })), faceKey(face)])
    return NextResponse.json({
      ok: true,
      fontId: ownFontId(family),
      family,
      displayName,
      face: faceKey(face),
      faceLabel: FACES.find(f => f.weight === face.weight && f.style === face.style)?.label ?? 'Regular',
      saidSubfamily: face.saidSubfamily,
      saidWeight: face.saidWeight,
      /* ⚠️ WHICH FACES ARE STILL MISSING, in the order the prompt offers them — this is what drives
       * "Add the bold version (optional)". */
      missingFaces: FACES.filter(f => !have.has(faceKey(f))).map(f => ({ face: faceKey(f), label: f.label })),
    })
  }

  /**
   * A tiny PNG of the sample text in one of THIS truck's uploaded fonts.
   *
   * 🔴 IT EXISTS BECAUSE THE BROWSER MUST NEVER BE GIVEN A FONT FILE'S URL. An uploaded font may be
   * commercially licensed; a readable URL from our domain is redistribution of somebody else's paid
   * font. A library family previews with Google's own web font CSS (they are open-licensed and already
   * public); an uploaded one previews as a picture.
   * ⚠️ IT IS ALSO THE TRUTH — the same satori that will draw the poster, with the same metrics.
   * ⛔ IT ONLY EVER DRAWS THE TRUCK'S **OWN** FONTS, and only a short sample. It is not a general text
   * renderer: the length is capped and the family must be one of theirs, so it cannot be used to
   * render arbitrary words at arbitrary size through a path with no layout validation.
   */
  if (action === 'font_sample') {
    const slug = slugOfFamily(String(body.family ?? ''))
    const faces = await fontRegistry.ownFaces(truck.id, slug)
    if (!faces.length) return NextResponse.json({ error: 'That font is not one of yours.' }, { status: 404 })
    const text = (typeof body.text === 'string' ? body.text : 'Wednesday 14th October').slice(0, 60)

    const id = `u:${slug}`
    const loaded = await loadFontsForDesign([id], truck.id, fontDeps)
    const face = loaded.bundle.resolve(id, false, false)
    const metrics = face.metrics
    /* ⚠️ THE SIZE IS DERIVED FROM THE MEASURED TEXT, not fixed. A condensed face and a wide one need
     * very different widths for the same words, and a fixed box would clip one and pad the other. */
    const size = 22
    const width = Math.min(560, Math.max(40, Math.ceil(measureText(text, metrics, size)) + 8))
    const height = Math.ceil(lineHeightPx(metrics, size)) + 4

    const el = {
      type: 'div',
      props: {
        style: {
          display: 'flex', width: `${width}px`, height: `${height}px`,
          alignItems: 'center', backgroundColor: '#ffffff',
        },
        children: {
          type: 'div',
          props: {
            style: {
              display: 'flex', fontFamily: face.family, fontWeight: face.weight,
              fontSize: `${size}px`, color: '#1e293b', whiteSpace: 'pre',
            },
            children: text,
          },
        },
      },
    }
    type OgElement = ConstructorParameters<typeof ImageResponse>[0]
    const res = new ImageResponse(el as unknown as OgElement, {
      /* ⚠️ `asFontBuffer` BRIDGES THE BUNDLE'S `Uint8Array` TO SATORI'S `Buffer` — no copy on the
       * server; see its note in `font-bundle.ts`. */
      width, height, fonts: loaded.bundle.satoriFonts().map(f => ({ ...f, data: asFontBuffer(f.data) })),
    })
    return new NextResponse(new Uint8Array(await res.arrayBuffer()), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        /* ⚠️ PRIVATE AND SHORT-LIVED. It is one truck's own font; it must not sit in a shared cache. */
        'Cache-Control': 'private, max-age=300',
      },
    })
  }

  /** Rename an uploaded family for display. ⚠️ `family` is untouched — it is the id's stable key. */
  if (action === 'font_rename') {
    const slug = slugOfFamily(String(body.family ?? ''))
    const name = String(body.displayName ?? '').trim().slice(0, 60)
    if (!slug || !name) return NextResponse.json({ error: 'A name is needed.' }, { status: 400 })
    const faces = await fontRegistry.ownFaces(truck.id, slug)
    if (!faces.length) return NextResponse.json({ error: 'That font is not one of yours.' }, { status: 404 })
    const { error } = await supabase.from('truck_fonts')
      .update({ display_name: name })
      .eq('truck_id', truck.id).eq('family', faces[0].family)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, displayName: name })
  }

  /**
   * Which of this truck's designs use an uploaded font — asked BEFORE it is removed.
   *
   * 🔴 §3: *"Removing an uploaded font that a design uses: a confirm naming the design(s)."* Naming
   * them is the whole point: "are you sure?" is a question nobody can answer, and "your weekly post
   * and 2 place designs use this font" is one they can.
   */
  if (action === 'font_usage') {
    const slug = slugOfFamily(String(body.family ?? ''))
    const id = `u:${slug}`
    const used: string[] = []
    const { data: designs } = await supabase.from('truck_post_designs')
      .select('kind, layout').eq('truck_id', truck.id)
    for (const d of (designs ?? []) as Array<{ kind: string; layout: unknown }>) {
      if (idsOfLayout(d.layout, d.kind === 'event' ? 'event' : 'week').includes(id)) {
        used.push(d.kind === 'event' ? 'your single event post design' : 'your weekly post design')
      }
    }
    const { data: places } = await supabase.from('truck_places')
      .select('name, short_name, event_layout').eq('truck_id', truck.id).not('event_layout', 'is', null)
    for (const pl of (places ?? []) as Array<Record<string, unknown>>) {
      if (idsOfLayout(pl.event_layout, 'event').includes(id)) {
        used.push(`your design for ${String(pl.short_name ?? '').trim() || String(pl.name ?? 'a place')}`)
      }
    }
    return NextResponse.json({ ok: true, used })
  }

  /**
   * Remove an uploaded family — every face of it, and its files.
   *
   * ⛔ THE DESIGNS ARE **NOT** REWRITTEN. A box that named this font keeps naming it, and
   * `FontBundle.resolve` falls back to Oswald when it cannot be loaded. Editing every saved layout
   * here would be a write across three tables in a path whose only job is a delete — and it would
   * destroy the operator's choice of font in designs they may be about to re-upload the font for.
   * ⚠️ IT IS SAID OUT LOUD in the confirm, and in docs/design-fonts-report.md.
   */
  if (action === 'font_remove') {
    const slug = slugOfFamily(String(body.family ?? ''))
    const faces = await fontRegistry.ownFaces(truck.id, slug)
    if (!faces.length) return NextResponse.json({ error: 'That font is not one of yours.' }, { status: 404 })
    /* ⚠️ THE FILES GO FIRST, THEN THE ROWS. The other order would leave a row pointing at an object
     * that is gone — which renders as a missing font with no way to tell it from a storage outage. */
    await fontStorage.remove(faces.map(f => f.storage_path))
    const { error } = await supabase.from('truck_fonts')
      .delete().eq('truck_id', truck.id).eq('family', faces[0].family)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, removed: faces.length, fallback: 'oswald' })
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 PART 3 · A PLACE'S PICTURE LIBRARY
  // ══════════════════════════════════════════════════════════════════════════════════════════

  /**
   * One place's pictures, with signed thumbnails. ⚠️ The pictures page's only read.
   *
   * ⛔ IT IS `place_picture_list` AND **NOT** `place_pictures`, WHICH IS WHAT IT WAS CALLED FIRST. The
   * table is `public.place_pictures`, and `scripts/places-tab.cjs` sweeps `app/`, `lib/` and
   * `components/` for that name to prove no browser code reaches the table — a sweep an ACTION of the
   * same name made impossible, because a string cannot say which of the two it is. The action name was
   * arbitrary; the sweep is not. ⚠️ It also matches its four siblings now (`place_picture_confirm`,
   * `_main`, `_rename`, `_remove`).
   */
  if (action === 'place_picture_list') {
    const placeId = String(body.placeId ?? '')
    const place = await placeById(truck.id, placeId)
    if (!place) return NextResponse.json({ error: 'Place not found' }, { status: 404 })
    const library = await readPlaceLibrary(truck.id, [place as never])
    const pictures = library.get(placeId) ?? []
    const { design: evDesign } = await loadDesign(truck.id, EVENT_KIND)
    const ownPositions = !!place.event_layout
    return NextResponse.json({
      ok: true,
      place: {
        id: placeId,
        name: String(place.name ?? ''),
        shortName: String(place.short_name ?? '').trim() || null,
        area: place.area ?? null,
        ownPositions,
      },
      /* ⚠️ ONE SIGNED URL PER PICTURE, IN THIS ONE CALL — the same short life every other thumbnail on
       * this route gets, and never a public URL. */
      pictures: await Promise.all(pictures.map(async pic => ({
        ...pic,
        url: await signed(pic.path),
        /* 🔴 WHETHER THIS ONE COULD BE A WHOLE BACKGROUND, decided HERE and shown on the picture — the
         * brief's "Different shape — can't be used as a whole background". An operator who has chosen
         * that placement needs to know which of their pictures will actually be used. */
        wholeBackgroundOk: usableAsWholeBackground(
          pic, { width: evDesign?.width ?? null, height: evDesign?.height ?? null }, ownPositions,
        ),
      }))),
      design: { width: evDesign?.width ?? null, height: evDesign?.height ?? null },
    })
  }

  /** Add a picture to a place's library. ⚠️ The same three-call upload flow as every picture here. */
  if (action === 'place_picture_confirm') {
    const placeId = String(body.placeId ?? '')
    const path = String(body.path ?? '')
    /* ⛔ FIRST, BEFORE THE BYTES ARE READ. A path outside this truck's folder is a request to adopt
     * somebody else's object under this truck's name. */
    if (!path.startsWith(`${truck.id}/`)) return NextResponse.json({ error: 'Unknown file' }, { status: 400 })
    const place = await placeById(truck.id, placeId)
    if (!place) return NextResponse.json({ error: 'Place not found' }, { status: 404 })

    const bytes = await downloadObject(path)
    if (!bytes) return NextResponse.json({ error: 'That upload did not arrive — please try again.' }, { status: 400 })
    /* 🔴 CHECKED FROM THE BYTES, exactly as `confirm_upload` does: PNG/JPG, 10MB, ≥600px short side.
     * ⛔ AND NO SHAPE RULE HERE. A library picture is a logo or a photo — it is only held to the
     * design's shape if the operator later asks for it as a WHOLE BACKGROUND, which is decided per
     * picture and shown on the picture. Refusing a pub's square logo for not matching a 4:5 poster
     * would refuse the commonest thing this feature is for. */
    const check = checkUpload(bytes, { maxBytes: MAX_UPLOAD_BYTES, minShortSide: MIN_UPLOAD_SHORT_SIDE })
    if (!check.ok) {
      await supabase.storage.from(BUCKET).remove([path])
      return NextResponse.json({ error: check.error }, { status: 400 })
    }

    /* ⚠️ THE LEGACY PICTURE IS WRITTEN IN FIRST, so this place's library stops being a mapping and
     * becomes rows — otherwise the old picture would vanish from the grid the moment a second one
     * arrived. */
    await materialiseLegacy(truck.id, place as never)

    const { data: existing } = await supabase.from('place_pictures')
      .select('id').eq('truck_id', truck.id).eq('place_id', placeId)
    const first = (existing ?? []).length === 0
    const label = typeof body.label === 'string' && body.label.trim()
      ? body.label.trim().slice(0, 60)
      : String(body.fileName ?? '').trim().slice(0, 60) || null

    const { data: inserted, error } = await supabase.from('place_pictures').insert({
      truck_id: truck.id,
      place_id: placeId,
      path,
      file_name: String(body.fileName ?? '').trim().slice(0, 120) || path.split('/').pop() || 'picture',
      bytes: bytes.length,
      width: check.info.width,
      height: check.info.height,
      /* 🔴 THE FIRST PICTURE A PLACE EVER GETS IS ITS MAIN. A library with no Main would draw nothing
       * until the operator went looking for a control they have no reason to expect. */
      is_main: first,
      label,
      sort_order: (existing ?? []).length,
      /* ⚠️ `.select('id').maybeSingle()` — AN INSERT RETURNS NO DATA WITHOUT IT, and the new row's id
       * is what `slot` below points at. Asked for here rather than re-read by path afterwards: a
       * second query by `path` would be a race with nothing, and the id is already on the wire. */
    } as never).select('id').maybeSingle()
    if (error) {
      await supabase.storage.from(BUCKET).remove([path])
      const code = (error as { code?: string }).code
      if (code === 'PGRST205' || code === '42P01' || code === '42703') {
        return NextResponse.json({ error: 'Place pictures need a database update — run supabase/migrations/20261018_place_picture_library.sql first.' }, { status: 503 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    /* ══ 🔴 `slot` — "UPLOAD AND USE IT HERE", IN ONE REQUEST (7 October 2026) ═════════════════════
     * ⛔ THE LOCATIONS SCREEN HAS NO OTHER WAY TO UPLOAD. Upload and Replace are the same press there:
     * a new row goes in and the slot is repointed at it, which is §4's "Replace = upload new row +
     * repoint" exactly. The row the slot pointed at before stays, unreferenced and undeleted.
     * ⚠️ THE SLOT IS OPTIONAL, so the part-3 library page — which uploads without choosing a use —
     * keeps working unchanged. A request without it behaves exactly as it did yesterday.
     * ⚠️ A FAILED REPOINT DOES **NOT** UNDO THE UPLOAD. The row is good and the object is good; what
     * failed is one column, and throwing the picture away over it would lose the operator's file. The
     * error says so and the screen offers the press again. */
    /* ⚠️ `null`/ABSENT MEANS "saved, not used anywhere yet" and is a legitimate call — the picture
     * library's own upload path. ⛔ A NAME THAT IS NOT ONE OF THE THREE IS NOT THAT CASE and is
     * refused: the two are told apart BEFORE `asSlotName`, so a typo cannot pass as an omission. */
    const slotGiven = body.slot !== undefined && body.slot !== null
    const slot: SlotName | null = slotGiven ? asSlotName(body.slot) : null
    if (slotGiven && !slot) return badSlot()
    if (slot) {
      const newId = String((inserted as { id?: string } | null)?.id ?? '')
      if (!newId) {
        return NextResponse.json({ error: 'That image was saved but could not be used here — try again.' }, { status: 500 })
      }
      const r = await setPlaceSlot(truck.id, placeId, slot, newId)
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    }
    return NextResponse.json({ ok: true, isMain: first })
  }

  /**
   * Make one picture the Main one.
   *
   * 🔴 TWO STATEMENTS, NEVER AN UPSERT — clear this place's Main, then set the new one. That is why
   * the database's "one Main per place" guard can be a PARTIAL unique index: a partial index cannot be
   * an `ON CONFLICT` target, and nothing here ever makes it one. The index is the guard that stops two
   * concurrent presses leaving a place with two Mains.
   */
  if (action === 'place_picture_main') {
    const placeId = String(body.placeId ?? '')
    const id = String(body.pictureId ?? '')
    const place = await placeById(truck.id, placeId)
    if (!place) return NextResponse.json({ error: 'Place not found' }, { status: 404 })
    /* ⚠️ A MAPPED LEGACY PICTURE HAS NO ROW TO UPDATE, so it is written in first — and then it IS the
     * row this call is about. */
    if (isLegacyPictureId(id)) {
      await materialiseLegacy(truck.id, place as never)
      return NextResponse.json({ ok: true })
    }
    await materialiseLegacy(truck.id, place as never)
    await supabase.from('place_pictures')
      .update({ is_main: false }).eq('truck_id', truck.id).eq('place_id', placeId)
    const { error } = await supabase.from('place_pictures')
      .update({ is_main: true }).eq('truck_id', truck.id).eq('place_id', placeId).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  /** Rename a picture for display. ⚠️ `file_name` is untouched — it is what a download is called. */
  if (action === 'place_picture_rename') {
    const placeId = String(body.placeId ?? '')
    const id = String(body.pictureId ?? '')
    const label = String(body.label ?? '').trim().slice(0, 60)
    if (!label) return NextResponse.json({ error: 'A name is needed.' }, { status: 400 })
    const place = await placeById(truck.id, placeId)
    if (!place) return NextResponse.json({ error: 'Place not found' }, { status: 404 })
    await materialiseLegacy(truck.id, place as never)
    if (isLegacyPictureId(id)) {
      const { error } = await supabase.from('place_pictures')
        .update({ label }).eq('truck_id', truck.id).eq('place_id', placeId)
        .eq('path', String(place.event_bg_path ?? ''))
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, label })
    }
    const { error } = await supabase.from('place_pictures')
      .update({ label }).eq('truck_id', truck.id).eq('place_id', placeId).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, label })
  }

  /**
   * Remove a picture.
   *
   * ⛔ THE STORED OBJECT IS DELETED ONLY WHEN NOTHING ELSE POINTS AT IT. A legacy picture's object is
   * ALSO `truck_places.event_bg_path`, and deleting it would break the place's existing event post —
   * which the rules forbid ("Never drop place_pictures or delete any stored picture" is about the
   * table; this is the same instinct about the file). So the row goes and the file stays whenever the
   * place still names it.
   * 🔴 REMOVING THE MAIN PROMOTES THE NEXT ONE, in the grid's own order, so a library is never left
   * with pictures and no Main.
   */
  if (action === 'place_picture_remove') {
    const placeId = String(body.placeId ?? '')
    const id = String(body.pictureId ?? '')
    const place = await placeById(truck.id, placeId)
    if (!place) return NextResponse.json({ error: 'Place not found' }, { status: 404 })
    await materialiseLegacy(truck.id, place as never)

    const { data: rows } = await supabase.from('place_pictures')
      .select(PICTURE_COLS).eq('truck_id', truck.id).eq('place_id', placeId)
    const all = ((rows ?? []) as never[]).map(r => toPicture(r as never))
    const legacyPath = String(place.event_bg_path ?? '')
    const target = isLegacyPictureId(id) ? all.find(p => p.path === legacyPath) : all.find(p => p.id === id)
    if (!target) return NextResponse.json({ error: 'That picture is not one of this place’s.' }, { status: 404 })

    const { error } = await supabase.from('place_pictures')
      .delete().eq('truck_id', truck.id).eq('place_id', placeId).eq('id', target.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    /* ⚠️ THE FILE SURVIVES WHEN THE PLACE STILL NAMES IT as its event background. Everything else is
     * this library's own object and goes with the row — leaving it would accumulate unreferenced files
     * in a bucket nothing ever lists, which is the rule `confirm_upload` already follows. */
    if (target.path !== legacyPath) {
      await supabase.storage.from(BUCKET).remove([target.path])
    }

    let promoted: string | null = null
    if (target.isMain) {
      const left = inGridOrder(all.filter(p => p.id !== target.id))
      if (left.length) {
        await supabase.from('place_pictures')
          .update({ is_main: true }).eq('truck_id', truck.id).eq('id', left[0].id)
        promoted = left[0].label
      }
    }
    return NextResponse.json({ ok: true, promoted })
  }

  // ════════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 A LOCATION'S TWO IMAGE SLOTS (7 October 2026, §4/§5)
  // ════════════════════════════════════════════════════════════════════════════════════════════
  //
  // ⛔ THREE ACTIONS AND NOT ONE OF THEM DELETES ANYTHING. Upload inserts a `place_pictures` row and
  // points a slot at it; Use-here points a slot at a row that already exists; Remove writes null. The
  // row and the stored object survive all three, which is rule 6 of the brief and also the only thing
  // that makes "Remove" a safe press on a screen with no undo.
  //
  // ⚠️ `place_picture_confirm` ABOVE IS STILL THE UPLOAD, and these do not duplicate it: `slot` was
  // added to it so one request covers "upload and use it here", which is the only way the Locations
  // screen ever uploads. A separate confirm action would have been a second copy of the byte checks.

  /** Point one slot at a picture that already exists. ⚠️ Used by "Use the event photo here too". */
  if (action === 'place_slot_use') {
    const placeId = String(body.placeId ?? '')
    const slot = asSlotName(body.slot)
    if (!slot) return badSlot()
    const rawId = String(body.pictureId ?? '')
    const place = await placeById(truck.id, placeId)
    if (!place) return NextResponse.json({ error: 'Location not found' }, { status: 404 })

    /* 🔴 A LEGACY IMAGE HAS NO ROW TO POINT AT, so it is written in first — and the id this call was
     * given is not the row's id, so the row is found by its PATH. ⛔ WITHOUT THIS, "Use the event photo
     * here too" on a location that has only ever had `event_bg_path` would store `legacy:<place id>` in
     * a uuid column and fail, or store nothing and silently do nothing. */
    let pictureId = rawId
    if (isLegacyPictureId(rawId)) {
      await materialiseLegacy(truck.id, place as never)
      const { data: row } = await supabase.from('place_pictures')
        .select('id').eq('truck_id', truck.id).eq('place_id', placeId)
        .eq('path', String(place.event_bg_path ?? '')).maybeSingle()
      pictureId = String((row as { id?: string } | null)?.id ?? '')
      if (!pictureId) return NextResponse.json({ error: 'That image could not be saved.' }, { status: 500 })
    }

    /* ⛔ THE PICTURE MUST BE **THIS LOCATION'S**. A picture id is a string a client sent; without this
     * check a caller could point a location at another truck's object and have it rendered onto a
     * poster. The same argument `event_render`'s own picture check makes. */
    const { data: owned } = await supabase.from('place_pictures')
      .select('id').eq('truck_id', truck.id).eq('place_id', placeId).eq('id', pictureId).maybeSingle()
    if (!owned) return NextResponse.json({ error: 'That image is not one of this location’s.' }, { status: 404 })

    const r = await setPlaceSlot(truck.id, placeId, slot, pictureId)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json({ ok: true })
  }

  /**
   * Stop using one slot's image.
   *
   * ⛔ IT CLEARS THE COLUMN AND NOTHING ELSE. No row is deleted, no object is removed, and the OTHER
   * slot is untouched even when it points at the same picture — which is exactly the case where a
   * cascade would be a disaster, because "Remove the weekly picture" would silently take the event
   * photo with it.
   * ⚠️ `event_bg_path` IS ALSO LEFT ALONE, and that has a visible consequence worth stating: clearing
   * the EVENT slot on a location whose image came from the legacy column puts it straight back, because
   * the fallback fires again. That is correct — the legacy column is the old setting, and Remove here
   * undoes the new one. Clearing the legacy column too would be deleting data this screen never wrote.
   */
  if (action === 'place_slot_clear') {
    const placeId = String(body.placeId ?? '')
    /* ⛔ THE REFUSAL COMES BEFORE THE LOOKUP, so a bad slot name cannot clear anything on the way to
     * being rejected. This is the call the defect was found on. */
    const slot = asSlotName(body.slot)
    if (!slot) return badSlot()
    const place = await placeById(truck.id, placeId)
    if (!place) return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    const r = await setPlaceSlot(truck.id, placeId, slot, null)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    /* ⚠️ THE SCREEN IS TOLD WHETHER THE LEGACY IMAGE CAME BACK, so it can say so rather than showing a
     * thumbnail the operator just pressed Remove on and calling it a bug. */
    const legacyReturned = slot === 'event' && !!String(place.event_bg_path ?? '').trim()
    return NextResponse.json({ ok: true, legacyReturned })
  }

  // ════════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 WHERE A LOCATION'S PICTURE IS USED (8 October 2026)
  // ════════════════════════════════════════════════════════════════════════════════════════════

  /* ══ ⛔ `place_picture_use` IS DELETED — 9 OCTOBER 2026 ════════════════════════════════════════════
   *
   * IT WAS THE "Use it on" RADIO'S WRITER: weekly / event / both, into `truck_places.picture_use`.
   * 🔴 THE RADIO WENT ON 9 OCTOBER AND THE ACTION OUTLIVED IT BY A FEW HOURS, which is the thing worth
   * recording here. An action with no caller is not harmless: it is a writeable column that nothing
   * reads, reachable by anyone holding a dashboard token, and the next reader of this file would have
   * had to work out whether `picture_use` was live by searching for callers rather than by reading it.
   * ⛔ §7 SAYS THE COLUMN IS NO LONGER READ **OR WRITTEN**, and deleting this is the second half.
   * ⚠️ THE COLUMN AND ITS `check` ARE LEFT IN PLACE — dropping one is irreversible and the rules forbid
   * it — and its comment says, in the database, that nothing reads it. */


  // ════════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE SOCIAL MEDIA TAG
  // ════════════════════════════════════════════════════════════════════════════════════════════

  /**
   * Save a location's handle.
   *
   * 🔴 `normaliseSocialTag` IS THE ONE RULE, and it lives in lib so the screen can show the operator
   * the same answer before they press Save. ⛔ THE COLUMN CARRIES NO `check`: a constraint would be a
   * second rule that could drift, and the one with the better message would not be the one that fired.
   */
  if (action === 'place_social_tag') {
    const placeId = String(body.placeId ?? '')
    const r = normaliseSocialTag(body.tag)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    const place = await placeById(truck.id, placeId)
    if (!place) return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    const { error } = await supabase.from('truck_places')
      .update({ social_tag: r.tag } as never)
      .eq('id', placeId).eq('truck_id', truck.id)
    if (error) {
      const code = (error as { code?: string }).code
      if (code === 'PGRST204' || code === 'PGRST205' || code === '42703' || code === '42P01') {
        return NextResponse.json({ error: MIGRATION_NEEDED }, { status: 503 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    /* ⚠️ THE NORMALISED VALUE COMES BACK, so the field shows what was stored rather than what was
     * typed — an operator who types `buresmusicfest` sees `@buresmusicfest` and learns the rule. */
    return NextResponse.json({ ok: true, tag: r.tag })
  }

  // ════════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE SAVED CAPTION TEMPLATE
  // ════════════════════════════════════════════════════════════════════════════════════════════

  /**
   * Save one post type's caption template.
   *
   * ⛔ IT UPSERTS ON `(truck_id, kind)` — the table's own unique key — so a truck whose design row
   * exists gets an update and one whose row does not yet exist is not an error the operator has to
   * understand. ⚠️ THE TEMPLATE IS STORED AS TYPED, tokens and all; nothing here parses it, because an
   * unknown token must render as nothing rather than fail a save.
   * ⚠️ A LENGTH CEILING, because this is free text from a browser and the column is unbounded. 4,000
   * characters is far beyond any caption and far below anything that would hurt.
   */
  if (action === 'caption_save') {
    const kind = body.kind === 'event' ? EVENT_KIND : KIND
    const template = String(body.template ?? '')
    if (template.length > 4000) {
      return NextResponse.json({ error: 'That caption is too long — 4,000 characters maximum.' }, { status: 400 })
    }
    /* ⛔ IT UPDATES AN EXISTING ROW RATHER THAN UPSERTING A NEW ONE. `truck_post_designs.blank_path` is
     * NOT NULL, so an upsert for a truck with no design would have to invent one — and a caption
     * without a design is a caption for a post that cannot be made. The screen only shows the editor
     * when the design is ready, so this is a state the UI does not produce; it is refused honestly
     * rather than papered over. */
    const { data: row, error } = await supabase.from('truck_post_designs')
      .update({ caption_template: template } as never)
      .eq('truck_id', truck.id).eq('kind', kind)
      .select('id').maybeSingle()
    if (error) {
      const code = (error as { code?: string }).code
      if (code === 'PGRST204' || code === 'PGRST205' || code === '42703' || code === '42P01') {
        return NextResponse.json({ error: MIGRATION_NEEDED }, { status: 503 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!row) {
      return NextResponse.json({ error: 'Set this design up first — a caption belongs to a design.' }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
