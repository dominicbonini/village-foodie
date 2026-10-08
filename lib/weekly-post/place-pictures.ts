// lib/weekly-post/place-pictures.ts — a place's picture library: the rules, as pure functions.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE MODEL, AND IT IS A CHANGE OF MODEL RATHER THAN A FEATURE
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// Until today a place had ONE picture and it meant one thing: `truck_places.event_bg_path` WAS the
// background of a single-event post at that place. The picture and the use were the same fact, so a
// truck who wanted a pub's logo in the corner of their weekly poster had nowhere to put it.
//
// 🔴 NOW A PLACE SIMPLY **HAS PICTURES** — a logo, a photo, a venue's poster — and one is marked Main.
// **The pictures are not tied to a post type.** Each DESIGN decides how it uses them, through the
// "Place picture" item in the shared editor: in a box on the weekly post, in a box on a single event
// post, or as that event's whole background.
//
// ⛔ WHICH MEANS THE OLD BEHAVIOUR IS NOW A *SETTING*, NOT A SHAPE OF THE DATA. "This place's picture
// is the background" is `placement: 'background'` on the single event design — see `layout.ts`. That
// is what lets today's designs keep rendering exactly as they do: the mapping in `legacyMainPicture()`
// below, plus that placement, reproduce it exactly.
//
// ⚠️ PURE AND BROWSER-SAFE. No `fs`, no Supabase, no `fetch` — the editor imports it for the toolbar's
// wording and the server imports it for the rules, and `scripts/place-pictures.cjs` drives all of it
// with plain objects.

import { checkAspect } from './backgrounds'

/** One picture in a place's library, as every layer of the product sees it. */
export interface PlacePicture {
  id: string
  /** The object path inside the private `post-designs` bucket. */
  path: string
  /** What the operator called it. ⚠️ Already resolved from `label ?? file_name` — see `labelOf`. */
  label: string
  /** The original upload name. Kept because it is what a download is called. */
  fileName: string
  width: number | null
  height: number | null
  isMain: boolean
  sortOrder: number
  createdAt: string
  /**
   * 🔴 SYNTHESISED FROM `truck_places.event_bg_path` RATHER THAN READ FROM A ROW.
   *
   * A place that had a picture before today has no library row for it — nothing was copied or moved
   * (see the report's §2). It is mapped on read, and this flag is what says so: the UI must materialise
   * it before it can be renamed, reordered or un-mained, because there is nothing to UPDATE yet.
   */
  legacy?: boolean
}

/** `label ?? file_name`, in one place. ⚠️ A blank label is treated as absent, as the CHECK allows. */
export const labelOf = (row: { label?: string | null; file_name?: string | null }): string =>
  String(row.label ?? '').trim() || String(row.file_name ?? '').trim() || 'Picture'

/**
 * ══ 🔴 WHICH PICTURE IS THE MAIN ONE ══════════════════════════════════════════════════════════════
 *
 * ⚠️ THE DATABASE GUARANTEES **AT MOST** ONE `is_main` PER PLACE, NOT AT LEAST ONE. A library whose
 * rows are all `false` is a real state — every row predates the column, or the Main was removed and
 * the route's "promote the next one" failed halfway. A poster must still have a picture to draw.
 *
 * 🔴 SO THE FALLBACK IS THE ORDER THE GRID SHOWS: sort order, then oldest first. Falling back to
 * "whichever row the database returned first" would make a poster change between renders with nothing
 * changed — the one failure an operator stops trusting a feature for.
 */
export function mainPicture(pictures: readonly PlacePicture[]): PlacePicture | null {
  if (!pictures.length) return null
  return pictures.find(p => p.isMain) ?? inGridOrder(pictures)[0] ?? null
}

/** The order the grid draws them in: Main first, then sort order, then oldest. */
export function inGridOrder(pictures: readonly PlacePicture[]): PlacePicture[] {
  return pictures.slice().sort((a, b) => {
    if (a.isMain !== b.isMain) return a.isMain ? -1 : 1
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
  })
}

/**
 * The library a place with ONLY a legacy `event_bg_path` has.
 *
 * ⛔ THIS IS THE WHOLE OF §2's "MOVE EXISTING DATA", AND IT MOVES NOTHING. The picture is pointed at,
 * not copied: the same object path, the same stored width and height. It is labelled **"Event poster"**
 * and is Main, which is what it has always effectively been.
 *
 * 🔴 WHY MAPPED ON READ RATHER THAN INSERTED BY THE MIGRATION — the full argument is in the report, but
 * the short form is: an `insert` makes the library the new source of truth for a picture that
 * `resolveDesign` still reads out of `truck_places`, so the two could disagree the moment either is
 * edited. Mapping leaves exactly one source of truth for today's behaviour (the old columns) until the
 * operator does something, at which point the route materialises the row and the library takes over.
 * **Nothing can drift, because for any given place only one of the two ever applies.**
 *
 * ⚠️ `id` IS DERIVED FROM THE PLACE so the UI has a stable key, and it is prefixed so it can never be
 * mistaken for a real row id in a request.
 */
export const LEGACY_PICTURE_LABEL = 'Event poster'
export const LEGACY_ID_PREFIX = 'legacy:'

export function legacyMainPicture(place: {
  id: string
  event_bg_path?: string | null
  event_bg_width?: number | null
  event_bg_height?: number | null
}): PlacePicture | null {
  const path = String(place.event_bg_path ?? '').trim()
  if (!path) return null
  return {
    id: `${LEGACY_ID_PREFIX}${place.id}`,
    path,
    label: LEGACY_PICTURE_LABEL,
    /* ⚠️ THE BASENAME OF THE STORED PATH. It is what the file is called in the bucket, which is the
     * closest thing to an upload name that survives — the original was never recorded for these. */
    fileName: path.split('/').pop() || path,
    width: place.event_bg_width ?? null,
    height: place.event_bg_height ?? null,
    isMain: true,
    sortOrder: 0,
    /* ⚠️ THE EPOCH, SO IT SORTS FIRST. It genuinely is the place's oldest picture — it is the only one
     * they had — and a synthesised "now" would float it to the end of the grid after a real upload. */
    createdAt: '1970-01-01T00:00:00.000Z',
    legacy: true,
  }
}

/** Is this id one of the synthesised ones? ⛔ The route refuses to UPDATE or DELETE one. */
export const isLegacyPictureId = (id: string): boolean => String(id ?? '').startsWith(LEGACY_ID_PREFIX)

/**
 * ══ 🔴 "Whole background" AND THE SHAPE RULE ══════════════════════════════════════════════════════
 *
 * A place's Main picture may replace the design's background for that event — which is exactly what
 * `event_bg_path` has always done. ⛔ AND IT IS HELD TO THE SAME 1% SHAPE RULE, because the design's
 * text boxes were placed on the design's canvas: a differently shaped picture puts every box somewhere
 * else, on artwork that goes straight to customers.
 *
 * ⚠️ A PLACE WITH ITS **OWN POSITIONS** IS NOT HELD TO IT — its boxes were placed on its own picture.
 * That is `placePictureNeedsDefaultShape` in `backgrounds.ts` and it is unchanged; this function is
 * the library's half of the same question, and it DEFERS to that one rather than restating it.
 *
 * 🔴 A PICTURE THAT FAILS IS NOT USED AND IS NOT SILENT: that event falls back to the standard
 * background, and the place's pictures page marks the picture itself. A background that quietly moved
 * every box is the failure this rule exists to prevent.
 */
export const WRONG_SHAPE_NOTE = 'Different shape — can’t be used as a whole background'

export function usableAsWholeBackground(
  picture: Pick<PlacePicture, 'width' | 'height'>,
  design: { width: number | null; height: number | null },
  /** true = this place has its own text positions, so any shape is allowed. */
  placeHasOwnPositions: boolean,
): boolean {
  if (placeHasOwnPositions) return true
  if (!picture.width || !picture.height || !design.width || !design.height) {
    /* ⚠️ AN UNMEASURED PICTURE IS REFUSED, NOT ASSUMED TO FIT. `fitsDefault` in backgrounds.ts makes
     * the same call for the same reason: a picture whose shape was never recorded is a picture whose
     * boxes nobody has checked. */
    return false
  }
  return checkAspect(picture.width, picture.height, design.width, design.height).ok
}

/**
 * ══ 🔴 WHAT TO DRAW WHERE A PLACE HAS NO PICTURE ══════════════════════════════════════════════════
 *
 * ⚠️ THE DEFAULT IS `omit`, AND THAT IS THE ONLY SAFE DEFAULT. A design that left a hole on every row
 * whose place has no picture would look broken on a poster the truck never previewed — and most trucks
 * will have a library for two venues out of twenty.
 */
export type NoPictureBehaviour = 'omit' | 'blank' | 'logo'

export const NO_PICTURE_LABELS: Record<NoPictureBehaviour, string> = {
  omit: 'Leave it out',
  blank: 'Leave a blank space',
  logo: 'Show your logo',
}

/**
 * How many of a truck's places still have nothing.
 *
 * 🔴 IT IS A SENTENCE ON THE WEEKLY DESIGN'S TOOLBAR, and it is the honest answer to "why is this box
 * empty on six of my rows?" — which is the question the setting raises and nothing else on the screen
 * answers.
 */
export function placesWithoutPictures(
  places: readonly { id: string; pictureCount: number }[],
): { without: number; total: number } {
  const total = places.length
  return { without: places.filter(p => p.pictureCount === 0).length, total }
}

/* ⚠️ "locations", "image" — WORDING ONLY (7 October 2026). The identifiers around it
 * (`noPicturesLine`, `placesWithoutPictures`, `pictureCount`) keep their names; see the note at the
 * head of lib/copy/socialPosts.ts's Location images block for why the rename stops at the strings. */
export const noPicturesLine = (without: number, total: number): string =>
  without === 0
    ? `All ${total} of your locations have an image.`
    : `${without} of your ${total} locations have no image yet`

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 TWO SLOTS, ONE JOB EACH (7 October 2026) — THE SECOND CHANGE OF MODEL
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// The library above is still the STORE. What changed is how a screen asks it a question. "A library
// with a Main" turned out to be the wrong shape for the question every surface actually has, which is
// never "show me this venue's pictures" but one of exactly two:
//
//   • **EVENT** — what a single event post at this location uses.
//   • **WEEKLY** — what sits beside this location's row on the weekly post.
//
// 🔴 SO A LOCATION HAS AT MOST **TWO** IMAGES, held as two nullable references on `truck_places`
// (`event_picture_id`, `weekly_picture_id` — see supabase/migrations/20261019_place_picture_slots.sql).
// ⚠️ ONE IMAGE MAY FILL BOTH. That is why they are references rather than a `slot` column on the
// picture row: `place_pictures_path_uidx` is a FULL unique index on `path`, so a slot column would
// need the same object stored twice to appear in both places — which that index forbids outright.
//
// ⛔ `is_main`, `label` AND `sort_order` ARE NO LONGER READ BY ANY SCREEN. They are not dropped (the
// migration says why) and `mainPicture`/`inGridOrder` above are still exported, because the legacy
// mapping and the renderers' fallback both go through them. Nothing an operator sees reads them.

/** Which of a location's two images is being asked about. */
export type PictureSlot = 'event' | 'weekly'

/** A location's two images. Either may be null; both may be the SAME picture. */
export interface PlaceSlots {
  event: PlacePicture | null
  weekly: PlacePicture | null
}

export const SLOT_LABELS: Record<PictureSlot, string> = { event: 'Event', weekly: 'Weekly' }

/**
 * Resolve a location's two slots out of its pictures and its two reference columns.
 *
 * 🔴 THE EVENT SLOT FALLS BACK TO THE LEGACY PICTURE AND THE WEEKLY SLOT DOES NOT, and that asymmetry
 * is the whole of "legacy `event_bg_*` keeps working". `truck_places.event_bg_path` has always meant
 * "the background of a single event post here" — which is precisely the EVENT slot's job — so a
 * location with a legacy background and an empty event slot reads as having that image, and renders
 * byte-identically. There was never a weekly picture, so inventing one would put an image on a poster
 * the truck has not asked to change.
 *
 * ⚠️ IT IS PURE AND TOTAL. A reference pointing at a picture that is not in the list reads as empty
 * rather than throwing — which is the state between `ON DELETE SET NULL` firing and a cache expiring.
 */
export function resolveSlots(
  pictures: readonly PlacePicture[],
  place: {
    id: string
    event_picture_id?: string | null
    weekly_picture_id?: string | null
    event_bg_path?: string | null
    event_bg_width?: number | null
    event_bg_height?: number | null
  },
): PlaceSlots {
  const byId = new Map(pictures.map(p => [p.id, p]))
  const pick = (id: string | null | undefined): PlacePicture | null => {
    const key = String(id ?? '').trim()
    return key ? (byId.get(key) ?? null) : null
  }
  /* ⚠️ THE REFERENCE WINS OVER THE LEGACY COLUMN. An operator who has chosen an event image has
   * overruled whatever `event_bg_path` said, and the legacy column is deliberately left in place
   * (nothing clears it) so a rollback still renders — which only works if the new value is read first. */
  return {
    event: pick(place.event_picture_id) ?? legacyMainPicture(place),
    weekly: pick(place.weekly_picture_id),
  }
}

/**
 * ══ 🔴 WHERE A LOCATION'S EVENT IMAGE GOES — AND IT IS NOT A CHOICE ANY MORE ══════════════════════
 *
 * ⛔ "WHERE IT GOES" WAS REMOVED FROM THE EDITOR ON 7 OCTOBER, AND THE RULE REPLACED IT. The toolbar
 * offered "In a box" / "Whole background" beside a switch that already said whether there was a box —
 * so two controls described one thing and could contradict each other: a design with the item OFF and
 * `placement: 'box'` had a choice recorded about a box that was not drawn.
 *
 * 🔴 THE RULE, WHICH IS DERIVED FROM THE SWITCH ALONE:
 *   • **photo space ON**  → the location's event image is drawn in that box, cropped to fill.
 *   • **photo space OFF** → the location's event image is the WHOLE POSTER, replacing the standard
 *     background, and is held to the same-shape 1% rule (`usableAsWholeBackground` above).
 *
 * ⚠️ IT IS BYTE-COMPATIBLE WITH TODAY FOR EVERY DESIGN THAT HAS NOT ASKED FOR A BOX, which is every
 * design saved before 6 October: they have `placePicture.enabled === false`, and "off ⇒ whole poster"
 * is exactly what `truck_places.event_bg_path` has always done through `resolveDesign`.
 *
 * ⚠️ THE STORED `placement` FIELD IS NOT DROPPED — the validator still reads and normalises it, so an
 * old design loads unchanged — but nothing offers it and nothing branches on it. See layout.ts.
 */
export type EventImageMode = 'photo' | 'poster'

export function eventImageMode(photoSpaceOn: boolean): EventImageMode {
  return photoSpaceOn ? 'photo' : 'poster'
}

/**
 * How many of these locations are missing an image — the "Missing images n" chip's number.
 *
 * ⛔ "MISSING" MEANS **EITHER** SLOT IS EMPTY, NOT BOTH. A location with an event photo and no weekly
 * picture has something still to do, and a chip that only counted locations with nothing at all would
 * report zero for a truck whose weekly post is drawing twenty blank boxes.
 */
export function missingImages(
  places: readonly { weekly: unknown | null; eventPhoto: unknown | null }[],
): number {
  /* ══ ⚠️ IT COUNTS THE TWO **PICTURES**, NOT EVERY SLOT — 9 October 2026 ════════════════════════════
   * ⛔ IT WAS `!p.event || !p.weekly`, WHERE `event` WAS THE POSTER. With three slots the same shape
   * would mean "the poster is missing too", and that would put nearly every location on the list: a
   * location poster is a finished design for one venue and most trucks will never make one. A chip that
   * matches almost everything sorts nothing.
   * 🔴 SO IT IS THE TWO PICTURES, which are the two an ordinary location wants, and the chip says "No
   * pictures". ⚠️ "EITHER", NOT "BOTH", IS STILL THE RULE: a location with a weekly picture and no event
   * one has something left to do, and counting only the locations with nothing at all would report zero
   * for a truck whose event posts are drawing twenty blank spaces. */
  return places.filter(p => !p.weekly || !p.eventPhoto).length
}


// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 ROUND 2 — AN EVENT POSTER AND A LOCATION PICTURE (8 October 2026)
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ THE TWO SLOTS ABOVE KEEP THEIR COLUMNS AND CHANGE THEIR MEANING. Under the first model they were
// "what an EVENT post uses" and "what the WEEKLY post uses" — and the first was ambiguous by
// construction, because whether the event image was a PHOTO in a box or the WHOLE POSTER was decided
// by the DESIGN. A truck who added a photo space to their single event design silently changed what
// every location's uploaded image meant.
//
// 🔴 SO THEY ARE TWO KINDS OF THING NOW, AND THE TRUCK CHOOSES:
//
//   `event_picture_id`  ⇒ the **EVENT POSTER**  — a full poster that REPLACES the standard single event
//                         design as the whole background. Held to the 1% shape rule.
//   `weekly_picture_id` ⇒ the **LOCATION PICTURE** — a logo or a photo, ANY shape.
//   `picture_use`       ⇒ where the PICTURE is drawn: 'weekly' | 'event' | 'both'.
//
// ⚠️ THE COLUMN NAMES ARE NOT RENAMED — a rename is a drop-and-add, which the rules forbid. The names
// are slightly behind the meanings and this note is the record of it; the migration's column comments
// say the same thing at the database.
//
// ⛔ `picture_use` DOES NOT AFFECT THE POSTER. A poster is always the whole background for events at
// that location; there is nothing to choose.

/* ══ ⛔ `PictureUse` IS NO LONGER READ BY ANYTHING — 9 October 2026 ════════════════════════════════
 * It held weekly / event / both for a choice the screen no longer asks. ⛔ THAT CHOICE WAS A REQUIRED
 * STEP BETWEEN UPLOADING A PICTURE AND SEEING IT USED, about a question most trucks have no opinion
 * on: a pub's logo is the pub's logo, and it belongs wherever a design has room for one.
 * 🔴 THE DEFAULT IS "EVERYWHERE" NOW, AND THE EXCEPTION IS OPT-IN — `weeklyOnly` below.
 * ⚠️ THE TYPE AND `asPictureUse` ARE KEPT because the COLUMN is kept (dropping one is irreversible)
 * and a reader may still want to name what is in it. Nothing in the product calls either. */
export type PictureUse = 'weekly' | 'event' | 'both'

export const PICTURE_USES: readonly PictureUse[] = ['weekly', 'event', 'both']

/**
 * Normalise whatever the database or a request produced.
 *
 * ⛔ IT FALLS BACK TO `'weekly'` AND NEVER THROWS. That is the column's own default and the behaviour
 * every row had before this model existed, so an unreadable value degrades to today rather than to an
 * error on a screen the operator cannot fix.
 */
export function asPictureUse(v: unknown): PictureUse {
  return (PICTURE_USES as readonly string[]).includes(String(v)) ? (v as PictureUse) : 'weekly'
}

/**
 * ══ 🔴 THREE PICTURES, THREE JOBS, NO INHERITANCE (9 October 2026) ════════════════════════════════
 *
 * ⛔ IT WAS ONE PICTURE PLUS AN OPT-IN OVERRIDE, and that shape had two consequences nobody could see
 * on the screen: a LOGO chosen because it suits a 180px line on a weekly poster was also the PHOTO
 * cropped into a 1080px space on an event post, and the only way out was an override box behind a
 * link that had to be found first.
 * 🔴 SO THERE ARE THREE FIELDS AND **NO FALLBACK BETWEEN ANY OF THEM.** A weekly post draws `weekly`
 * or nothing; an event post draws `eventPhoto` or nothing. ⚠️ THE CONVENIENCE THE OVERRIDE EXISTED FOR
 * IS NOW A LINK IN EACH EMPTY BOX — "Use the event post picture" — which points the other slot at the
 * SAME stored row. That is the same outcome with no model to learn and no file copied.
 */
export interface LocationImages {
  poster: PlacePicture | null
  /** 🔴 The WEEKLY POST picture. ⛔ Weekly posts read ONLY this. */
  weekly: PlacePicture | null
  /** 🔴 The EVENT POST picture — the single event design's picture space. ⛔ No fallback to `weekly`. */
  eventPhoto: PlacePicture | null
}

/**
 * ══ 🔴 WHICH PICTURE EACH SURFACE DRAWS — AND BOTH ANSWERS ARE NOW ONE FIELD ══════════════════════
 *
 * ⛔ `weeklyPictureFor` WAS A COALESCE (`weeklyOnly ?? picture`) AND `eventPictureFor` WAS `picture`.
 * Both are a direct read now, because there are three columns with three jobs and no inheritance.
 * ⚠️ THEY ARE KEPT AS FUNCTIONS RATHER THAN INLINED AT THE TWO CALL SITES, even though each is one
 * property access: they are the two places the question "which picture does this surface draw" is
 * answered, and a model that has changed four times in four days is one whose answers should stay
 * findable by name.
 */
export const weeklyPictureFor = (i: LocationImages | null): PlacePicture | null => i ? i.weekly : null
export const eventPictureFor = (i: LocationImages | null): PlacePicture | null => i ? i.eventPhoto : null

/**
 * The two images and the choice, out of the library and the row.
 *
 * 🔴 IT WRAPS `resolveSlots` RATHER THAN REPLACING IT. The slot reading — including the legacy
 * `event_bg_*` fallback, which still fills the POSTER role exactly as it always has — is unchanged;
 * what is new is the NAMES and the third field.
 */
export function resolveLocationImages(
  pictures: readonly PlacePicture[],
  place: {
    id: string
    event_picture_id?: string | null
    weekly_picture_id?: string | null
    event_photo_picture_id?: string | null
    event_bg_path?: string | null
    event_bg_width?: number | null
    event_bg_height?: number | null
  },
): LocationImages {
  const slots = resolveSlots(pictures, place)
  const byId = new Map(pictures.map(p => [p.id, p]))
  const eventPhotoId = String(place.event_photo_picture_id ?? '').trim()
  return {
    poster: slots.event,
    weekly: slots.weekly,
    /* ⚠️ A REFERENCE POINTING AT A PICTURE THAT IS NOT IN THE LIST READS AS EMPTY rather than throwing
     * — the state between `ON DELETE SET NULL` firing and a cache expiring, and the same rule
     * `resolveSlots` applies to the other two.
     * ⛔ `weekly_only_picture_id` IS NO LONGER READ. 20261022 moved its value into `weekly_picture_id`
     * and emptied it; reading it here would be reading a column the migration guarantees is null. */
    eventPhoto: eventPhotoId ? (byId.get(eventPhotoId) ?? null) : null,
  }
}

/* ⛔ `pictureOnWeekly` AND `pictureOnEvent` ARE GONE — 9 October 2026. They answered "does
 * `picture_use` allow this surface?", and no surface asks any more: a location picture is drawn
 * wherever a design has a space for it. ⚠️ WHAT REPLACED THEM IS `weeklyPictureFor` /
 * `eventPictureFor` above, which answer the question that is actually left — WHICH picture. */

/**
 * ══ 🔴 WHAT A SINGLE EVENT POST AT THIS LOCATION DRAWS ════════════════════════════════════════════
 *
 * ⛔ THE ORDER THE BRIEF STATES, AND IT EXISTS EXACTLY ONCE: **this post's own image > the location's
 * event poster > the standard design**, with the location PICTURE in the design's photo space when
 * `picture_use` is event/both AND the design has one.
 *
 * 🔴 AND THE POSTER BEATS THE PICTURE ON AN EVENT POST. A poster replaces the whole background, so
 * there is no photo space left to draw a picture into — drawing both would put the location's logo on
 * top of the location's own artwork. The screen says so in one grey line rather than leaving the truck
 * to notice.
 *
 * ⛔ A PRIVATE EVENT GETS NEITHER, EVER. The server never sends a private booking's place, so this is
 * called with `null` and the answer is the standard design — but the flag is taken explicitly too,
 * because "the caller will not do that" is not a guarantee a renderer should rely on.
 */
export interface EventImagePlan {
  /** What the whole background is. */
  background: 'one-off' | 'poster' | 'standard'
  /** Whether the location's PICTURE is drawn in the design's photo space. */
  pictureInPhotoSpace: boolean
}

export function planEventImages(input: {
  hasOneOff: boolean
  images: LocationImages | null
  /** Whether the standard single event design has a photo space (`placePicture.enabled`). */
  designHasPhotoSpace: boolean
  /** ⛔ A private booking gets no location image of any kind. */
  isPrivate: boolean
  /** Whether the poster passes the 1% shape rule. ⚠️ Decided by `usableAsWholeBackground` above. */
  posterFits: boolean
}): EventImagePlan {
  if (input.isPrivate) {
    return { background: input.hasOneOff ? 'one-off' : 'standard', pictureInPhotoSpace: false }
  }
  const images = input.images
  const poster = images?.poster ?? null
  /* ⚠️ A POSTER THAT DOES NOT FIT IS NOT USED AND IS NOT SILENT — the caller warns. Here it simply
   * does not win, which is what lets the picture still be drawn in the photo space below. */
  const posterWins = !!poster && input.posterFits

  const background: EventImagePlan['background'] =
    input.hasOneOff ? 'one-off' : posterWins ? 'poster' : 'standard'

  /* ⛔ NO PHOTO SPACE SURVIVES A POSTER. The poster IS the background; the design's boxes are drawn on
   * top of it, and its photo space would be a hole punched in the truck's own artwork.
   * ⚠️ A **ONE-OFF** IS NOT THE SAME CASE AND THE PICTURE DOES STILL DRAW ON IT. A one-off replaces the
   * picture, never the design — `resolveDesign`'s own note says it "uses whichever positions it would
   * otherwise have had" — so the date, the time, the place and the photo space are all drawn on top of
   * it, and singling the photo box out would make it the one box a one-off silently removes. The brief
   * states the poster rule explicitly and is silent on this one, so it takes the consistent answer.
   * ══ ⛔ `pictureOnEvent(images.pictureUse)` IS GONE FROM THIS LINE — 9 October 2026 ═══════════════
   * The picture is used wherever a design has a space for one, so the only remaining conditions are
   * "the design has a space" and "the location has a picture". ⚠️ THE WEEKLY-ONLY OVERRIDE IS NOT
   * CONSULTED EITHER: `eventPictureFor` is always the location picture, which is the whole point of
   * the override being weekly-only. */
  const pictureInPhotoSpace =
    background !== 'poster'
    && input.designHasPhotoSpace
    && !!eventPictureFor(images)

  return { background, pictureInPhotoSpace }
}
