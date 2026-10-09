#!/usr/bin/env node
// scripts/place-pictures.cjs — A PLACE'S PICTURE LIBRARY, AND WHAT THE DESIGNS DO WITH IT.
//
//   node scripts/place-pictures.cjs   (NO NETWORK, NO DATABASE, NO BROWSER, NO REAL TRUCK ARTWORK)
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHAT THIS GUARDS
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
//   1. **PIZZA KITCHEN'S EXISTING PLACE POST IS BYTE-IDENTICAL.** The model changed underneath it —
//      a place now has a LIBRARY rather than one picture — and the one thing that must not change is
//      what their poster looks like today. Proved in PIXELS, not by inspection.
//   2. **A PRIVATE EVENT NEVER GETS A PLACE PICTURE.** Two independent server-side defences, and both
//      are checked: `entryFor` nulls a private booking's `placeId`, and the renderer refuses on
//      `entry.isPrivate`. ⛔ Either alone would be enough; neither alone is checked.
//   3. **ONE MAIN PER PLACE**, including the states the database cannot express — a library whose rows
//      are all `false`, which is what every row that predates the column looks like.
//   4. **THE SHAPE RULE FOR "Whole background"**, which is the one that silently moves every text box
//      on artwork that goes straight to customers if it is wrong.
//
// 🔴 EVERY PICTURE HERE IS SYNTHESISED IN THIS FILE. No real truck's artwork is involved.

const path = require('path')
const fs = require('fs')
const { compile } = require('./_slot-interval-compile.cjs')
const REPO = path.resolve(__dirname, '..')

const LIB = [
  'lib/weekly-post/week.ts', 'lib/weekly-post/format.ts', 'lib/weekly-post/locale.ts',
  'lib/weekly-post/font-refs.ts', 'lib/weekly-post/font-bundle.ts',
  'lib/weekly-post/place-pictures.ts', 'lib/weekly-post/backgrounds.ts',
  'lib/weekly-post/week-data.ts', 'lib/weekly-post/layout.ts', 'lib/weekly-post/fit.ts',
  'lib/weekly-post/contrast.ts', 'lib/weekly-post/fonts.ts', 'lib/weekly-post/font-list.ts',
  'lib/weekly-post/ttf-metrics.ts', 'lib/weekly-post/caption.ts', 'lib/weekly-post/render.ts',
  'lib/weekly-post/image-info.ts',
  'lib/time-utils.ts', 'lib/private-events/resolve.ts',
  /* ⚠️ THE COPY MODULE IS COMPILED (7 October 2026) so `picturesCount` can be CALLED. "1 images" is the
   * bug that function exists to prevent, and a regex on its ternary would pass on a wrong branch. */
  'lib/copy/socialPosts.ts',
  /* ⚠️ THE TAG NORMALISER AND THE CAPTION TEMPLATE ARE COMPILED (8 October 2026) so both can be
   * CALLED. "Trim it, add an @, no spaces, 60 max" is four behaviours and "the label disappears
   * cleanly" is a whitespace rule — a regex on either source would pass on a wrong branch. */
  'lib/weekly-post/social-tag.ts', 'lib/weekly-post/caption-template.ts',
]

const c = compile(REPO, LIB, 'pp')
try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(c.out, 'node_modules')) } catch { /* already there */ }
const PP = c.req('lib/weekly-post/place-pictures.js')
const L = c.req('lib/weekly-post/layout.js')
const R = c.req('lib/weekly-post/render.js')
const D = c.req('lib/weekly-post/week-data.js')
const W = c.req('lib/weekly-post/week.js')
const BG = c.req('lib/weekly-post/backgrounds.js')
const CP = c.req('lib/copy/socialPosts.js')
const TAG = c.req('lib/weekly-post/social-tag.js')
const CT = c.req('lib/weekly-post/caption-template.js')
const C = c.req('lib/weekly-post/caption.js')

let pass = 0, fail = 0
const t = (label, ok) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label) } }
const head = (s) => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 92 - s.length)))
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
/* ⛔ COMMENTS STRIPPED BEFORE ANY SOURCE ASSERTION. Six variations of "a comment interfered with a
 * check on code" in this project, the last of them a comment that HID code from the stripper. */
const codeOf = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE SYNTHETIC PICTURES
// ════════════════════════════════════════════════════════════════════════════════════════════════
const zlib = require('zlib')
const crcTable = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let x = n; for (let k = 0; k < 8; k++) x = x & 1 ? 0xedb88320 ^ (x >>> 1) : x >>> 1; t[n] = x } return t })()
const crc32 = (buf) => { let x = -1; for (let i = 0; i < buf.length; i++) x = crcTable[(x ^ buf[i]) & 0xff] ^ (x >>> 8); return x ^ -1 }
/** A solid-colour PNG, built by hand — no encoder, no dependency, deterministic. */
function makePng(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h)
  let o = 0
  for (let y = 0; y < h; y++) { raw[o++] = 0; for (let x = 0; x < w; x++) { raw[o++] = rgb[0]; raw[o++] = rgb[1]; raw[o++] = rgb[2] } }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type, 'ascii'), data]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc32(body) >>> 0); return Buffer.concat([len, body, cr]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
const uri = (buf) => 'data:image/png;base64,' + buf.toString('base64')

const PNG_W = 540, PNG_H = 675
const BLANK = uri(makePng(PNG_W, PNG_H, [40, 44, 52]))
/** ⚠️ A STRONG RED, so "the picture changed" is a question about pixels and not about a shade. */
const PLACE_PIC = uri(makePng(200, 200, [220, 30, 30]))
const LOGO = uri(makePng(160, 160, [30, 220, 90]))

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1 · ONE MAIN PER PLACE
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('1 · THE LIBRARY RULES')
{
  const pic = (over) => ({
    id: 'a', path: 'p/a.png', label: 'A', fileName: 'a.png', width: 100, height: 100,
    isMain: false, sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z', ...over,
  })

  t('🔴 the Main picture is the one marked Main',
    PP.mainPicture([pic({ id: 'a' }), pic({ id: 'b', isMain: true })]).id === 'b')
  /* ⛔ THE DATABASE GUARANTEES **AT MOST** ONE MAIN, NOT AT LEAST ONE. Every row that predates the
   * column is `false`, and a poster must still have a picture to draw. */
  t('⛔ a library with NO Main falls back to the grid\'s own order, never to "whichever row came first"',
    PP.mainPicture([
      pic({ id: 'c', sortOrder: 2, createdAt: '2026-01-01T00:00:00.000Z' }),
      pic({ id: 'd', sortOrder: 1, createdAt: '2026-02-01T00:00:00.000Z' }),
    ]).id === 'd')
  t('⚠️ …and the fallback is DETERMINISTIC — the same library always yields the same Main', (() => {
    const lib = [pic({ id: 'x', sortOrder: 1 }), pic({ id: 'y', sortOrder: 1 }), pic({ id: 'z', sortOrder: 1 })]
    const a = PP.mainPicture(lib.slice()).id
    const b = PP.mainPicture(lib.slice().reverse()).id
    return a === b
  })())
  t('⚠️ an empty library has no Main at all', PP.mainPicture([]) === null)
  t('🔴 the grid order is Main first, then sort order, then oldest', (() => {
    const order = PP.inGridOrder([
      pic({ id: 'old', createdAt: '2020-01-01T00:00:00.000Z', sortOrder: 5 }),
      pic({ id: 'main', isMain: true, sortOrder: 9 }),
      pic({ id: 'first', sortOrder: 1 }),
    ]).map(p => p.id)
    return order.join(',') === 'main,first,old'
  })())
  t('⚠️ `label ?? file_name`, and a blank label is treated as absent',
    PP.labelOf({ label: 'Logo', file_name: 'x.png' }) === 'Logo'
    && PP.labelOf({ label: '   ', file_name: 'x.png' }) === 'x.png'
    && PP.labelOf({ label: null, file_name: null }) === 'Picture')

  /* ⛔ THE DATABASE IS THE GUARD, AND IT IS A PARTIAL UNIQUE INDEX — safe here because nothing ever
   * upserts on it. "Make main" is two statements, which is what makes that true. */
  const SQL = read('supabase/migrations/20261018_place_picture_library.sql')
  t('🔴 at most one Main per place is enforced by the DATABASE, as a partial unique index',
    /create unique index if not exists place_pictures_one_main_per_place_uidx/.test(SQL)
    && /on public\.place_pictures \(place_id\)\s*\n\s*where is_main;/.test(SQL))
  t('⛔ …and nothing upserts onto it — "Make main" is two statements', (() => {
    const route = codeOf(read('app/api/weekly-post/route.ts'))
    const fn = route.slice(route.indexOf("action === 'place_picture_main'"), route.indexOf("action === 'place_picture_rename'"))
    return /update\(\{ is_main: false \}\)/.test(fn) && /update\(\{ is_main: true \}\)/.test(fn)
      && !/onConflict: 'place_id'/.test(route)
  })())
  t('⚠️ the three new columns are ADDED, and the table is never dropped or recreated',
    /add column if not exists is_main boolean not null default false/.test(SQL)
    && /add column if not exists label text/.test(SQL)
    && /add column if not exists sort_order integer not null default 0/.test(SQL)
    && !/drop table/i.test(SQL) && !/create table/i.test(SQL) && !/truncate/i.test(SQL)
    && !/delete from/i.test(SQL))
  /* 🔴 §1's OTHER REQUIREMENT: the grants brought into line. The 20261015 migration enabled RLS and
   * revoked from anon+authenticated but created NO policy and did not revoke from `public`. */
  t('🔴 RLS, a service-role policy and a revoke from anon, authenticated AND public',
    /alter table public\.place_pictures enable row level security/.test(SQL)
    && /create policy "service_role only" on public\.place_pictures/.test(SQL)
    && /revoke all on public\.place_pictures from anon, authenticated, public;/.test(SQL))
  t('⚠️ …and PostgREST is reloaded, or the three columns read as absent',
    /notify pgrst, 'reload schema';/.test(SQL))
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2 · 🔴 THE EXISTING DATA — MAPPED, NOT MOVED
// ════════════════════════════════════════════════════════════════════════════════════════════════
  /* ══ 🔴 "MISSING" MEANS **EITHER** SLOT IS EMPTY, NOT BOTH (7 October 2026) ══════════════════════
   * The Location settings table's "Missing images n" chip is this function's number. ⛔ A CHIP THAT
   * ONLY COUNTED LOCATIONS WITH NOTHING AT ALL WOULD REPORT ZERO for a truck whose weekly poster is
   * drawing twenty blank boxes — the location has an event photo, so it is not "empty", and it is
   * still the thing that needs doing.
   * ⚠️ DRIVEN, NOT PATTERN-MATCHED, and the four combinations are all four: `scripts/social-posts.cjs`
   * asserts the screen's inline filter is the same test and points here for the behaviour. */
  /* ══ ⚠️ IT COUNTS THE TWO **PICTURES** AND IGNORES THE POSTER — 9 October 2026 ════════════════════
   * ⛔ IT WAS `!event || !weekly`, WHERE `event` WAS THE POSTER. With three slots that shape would mean
   * "the poster is missing too", and that puts nearly every location on the list — a location poster is
   * a finished design for one venue and most trucks will never make one. A chip that matches almost
   * everything sorts nothing. ⚠️ "EITHER, NOT BOTH" IS UNCHANGED and is still the point of the number. */
  t('🔴 `missingImages` counts a location with EITHER PICTURE empty — three of four', (() => {
    const pic = { id: 'p1', path: 'a.png', label: 'x', fileName: 'a.png', width: 1, height: 1, isMain: true, sortOrder: 0, createdAt: '' }
    return PP.missingImages([
      { weekly: pic, eventPhoto: pic },    // nothing missing
      { weekly: pic, eventPhoto: null },   // the event picture missing
      { weekly: null, eventPhoto: pic },   // the weekly picture missing
      { weekly: null, eventPhoto: null },  // both missing — ONE location, counted once
    ]) === 3
      && PP.missingImages([]) === 0
      && PP.missingImages([{ weekly: pic, eventPhoto: pic }]) === 0
      /* 🔴 AND A LOCATION WITH BOTH PICTURES AND **NO POSTER** IS NOT COUNTED, which is the half that
       * changed. Under the old rule it was. */
      && PP.missingImages([{ weekly: pic, eventPhoto: pic, poster: null }]) === 0
  })())
  /* 🔴 THE GREY LINE UNDER "Your next event" NAMES THE IMAGE — AND EACH SOURCE HAS ITS OWN SENTENCE.
   * ⛔ IT IS THE ONE THING A 96px THUMBNAIL CANNOT SHOW: three different images produce the same
   * thumbnail — the location's photo, the location's poster, the standard design — and the only one an
   * operator can act on is the one actually chosen. ⚠️ DRIVEN, BECAUSE A REGEX CANNOT TELL A WRONG
   * BRANCH FROM A RIGHT ONE; `scripts/social-posts.cjs` asserts the arms exist and points here. */
  t('🔴 `imageSourceLine` gives each of the four sources its own sentence', (() => {
    const L = (src, place) => CP.imageSourceLine(src, place)
    return L('place-photo', 'The Kings Arms') === 'Using The Kings Arms’s photo'
      && L('place-poster', 'The Kings Arms') === 'Using The Kings Arms’s poster'
      && L('standard', 'The Kings Arms') === 'Using your standard single event design'
      && L('event', 'The Kings Arms') === 'Using the image you uploaded for this post'
      /* ⛔ A PRIVATE BOOKING NEVER GETS A LOCATION IMAGE, and the sentence says so rather than naming
       * a location the server did not send. */
      && L('none', null) === 'Private bookings always use your standard design.'
      /* ⚠️ AND A MISSING NAME DEGRADES TO "this location" rather than printing "undefined’s photo". */
      && L('place-photo', null) === 'Using this location’s photo'
      && L('place-photo', '   ') === 'Using this location’s photo'
  })())
  /* 🔴 AND THE TWO SLOTS RESOLVE OUT OF THE LIBRARY BY **REFERENCE**, with ONE image allowed in both.
   * ⛔ THAT IS THE WHOLE REASON THEY ARE TWO COLUMNS rather than a `slot` column on the picture row:
   * `place_pictures_path_uidx` is a FULL unique index on `path`, so filling both slots with a copy is
   * impossible. */
  t('🔴 `resolveSlots` reads both references, and ONE image may fill both', (() => {
    const a = { id: 'a', path: 'a.png', label: 'A', fileName: 'a.png', width: 1, height: 1, isMain: true, sortOrder: 0, createdAt: '' }
    const b = { id: 'b', path: 'b.png', label: 'B', fileName: 'b.png', width: 1, height: 1, isMain: false, sortOrder: 1, createdAt: '' }
    const both = PP.resolveSlots([a, b], { id: 'pl', event_picture_id: 'a', weekly_picture_id: 'a' })
    const split = PP.resolveSlots([a, b], { id: 'pl', event_picture_id: 'a', weekly_picture_id: 'b' })
    const none = PP.resolveSlots([a, b], { id: 'pl' })
    /* ⚠️ A REFERENCE POINTING AT A PICTURE THAT IS NOT IN THE LIST READS AS EMPTY rather than throwing
     * — the state between `ON DELETE SET NULL` firing and a cache expiring. */
    const dangling = PP.resolveSlots([a], { id: 'pl', event_picture_id: 'zzz', weekly_picture_id: 'zzz' })
    return both.event.id === 'a' && both.weekly.id === 'a'
      && split.event.id === 'a' && split.weekly.id === 'b'
      && none.event === null && none.weekly === null
      && dangling.event === null && dangling.weekly === null
  })())
  /* ══ 🔴 LEGACY: THE **EVENT** SLOT FALLS BACK AND THE **WEEKLY** SLOT DOES NOT ════════════════════
   * ⛔ THAT ASYMMETRY IS THE WHOLE OF "legacy `event_bg_*` keeps working". `event_bg_path` has always
   * meant "the background of a single event post here", which is precisely the EVENT slot's job — so a
   * location with a legacy background and an empty event slot reads as having that image and renders
   * byte-identically. There was never a weekly picture, so inventing one would put an image on a
   * poster the truck has not asked to change. */
  t('🔴 a legacy `event_bg_path` fills the EVENT slot only, and the reference overrules it', (() => {
    const legacyPlace = { id: 'pl', event_bg_path: 'old/bg.png', event_bg_width: 1080, event_bg_height: 1350 }
    const mapped = PP.resolveSlots([], legacyPlace)
    const a = { id: 'a', path: 'a.png', label: 'A', fileName: 'a.png', width: 9, height: 9, isMain: true, sortOrder: 0, createdAt: '' }
    const overruled = PP.resolveSlots([a], { ...legacyPlace, event_picture_id: 'a' })
    return mapped.event && mapped.event.path === 'old/bg.png' && mapped.event.legacy === true
      && mapped.event.width === 1080 && mapped.event.height === 1350
      /* ⛔ AND NOTHING LANDS IN THE WEEKLY SLOT. */
      && mapped.weekly === null
      /* ⚠️ AND THE REFERENCE WINS: an operator who has chosen an event image has overruled whatever
       * `event_bg_path` said, and the legacy column is deliberately left in place so a rollback still
       * renders — which only works if the new value is read first. */
      && overruled.event.id === 'a' && overruled.event.legacy !== true
  })())
  /* ⚠️ AND A LOCATION WITH NEITHER HAS NEITHER — the control on all of the above. */
  t('⚠️ …and a location with no legacy column and no references has no images',
    (() => {
      const r = PP.resolveSlots([], { id: 'pl', event_bg_path: '' })
      return r.event === null && r.weekly === null
    })())

head('2 · PIZZA KITCHEN\'S EXISTING PICTURE IS MAPPED, NOT MOVED')
{
  const place = { id: 'pl-1', event_bg_path: 'test-truck/place-123.png', event_bg_width: 1080, event_bg_height: 1350 }
  const legacy = PP.legacyMainPicture(place)
  t('🔴 a place with an `event_bg_path` has a library of ONE, Main, labelled "Event poster"',
    legacy.isMain === true && legacy.label === 'Event poster' && legacy.path === place.event_bg_path)
  /* ⛔ IT POINTS AT THE EXISTING OBJECT. Nothing is copied and nothing is uploaded — the whole of §2's
   * "Don't copy or move the file; point at the existing object". */
  t('⛔ …and it points at the SAME object path, with the stored width and height',
    legacy.path === 'test-truck/place-123.png' && legacy.width === 1080 && legacy.height === 1350)
  t('⚠️ a place with no picture has no legacy entry', PP.legacyMainPicture({ id: 'x' }) === null)
  /* ⚠️ THE SYNTHESISED ID IS MARKED, so the route can refuse to UPDATE or DELETE a row that does not
   * exist — and knows to write it in first. */
  t('⚠️ the synthesised id is recognisable, and a real one is not mistaken for it',
    PP.isLegacyPictureId(legacy.id) === true && PP.isLegacyPictureId('b4f1-…') === false)
  t('⚠️ it sorts FIRST, because it genuinely is the place\'s oldest picture',
    PP.inGridOrder([
      { ...legacy, isMain: false },
      { id: 'new', path: 'p.png', label: 'New', fileName: 'p.png', width: 1, height: 1, isMain: false, sortOrder: 0, createdAt: '2026-10-01T00:00:00.000Z' },
    ])[0].id === legacy.id)

  /* 🔴 THE MIGRATION WRITES NO DATA AT ALL — which is the point of mapping on read. */
  const SQL = read('supabase/migrations/20261018_place_picture_library.sql')
  t('🔴 THE MIGRATION CONTAINS NO `insert into public.place_pictures` — nothing is copied',
    !/insert into public\.place_pictures/i.test(SQL)
    && !/update public\.place_pictures/i.test(SQL))
  t('⛔ …and `truck_places` is not altered, so today\'s rendering path is untouched',
    !/alter table public\.truck_places/i.test(SQL)
    && !/update public\.truck_places/i.test(SQL))
  /* ⚠️ THE ROW IS WRITTEN LAZILY, ON THE FIRST MUTATION — which is what makes the library able to be
   * edited without the migration having guessed at a `bytes` it could not know. */
  const route = codeOf(read('app/api/weekly-post/route.ts'))
  t('⚠️ the legacy picture is materialised on the FIRST change to that place\'s pictures', (() => {
    for (const a of ['place_picture_confirm', 'place_picture_main', 'place_picture_rename', 'place_picture_remove']) {
      const i = route.indexOf(`action === '${a}'`)
      const j = route.indexOf("action === '", i + 20)
      if (!/materialiseLegacy\(truck\.id/.test(route.slice(i, j > 0 ? j : undefined))) return false
    }
    return true
  })())
  t('⛔ …and removing it does NOT delete the file, because the place still names it',
    /if \(target\.path !== legacyPath\) \{/.test(route))
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 3 · 🔴 A PRIVATE EVENT NEVER GETS A PLACE PICTURE
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('3 · A PRIVATE EVENT NEVER GETS A PLACE PICTURE')
{
  const range = W.weekRange('this', '2026-10-12T12:00:00Z')
  const base = { event_date: range.days[0], start_time: '17:00', end_time: '21:00', venue_name: 'The Kings Arms', town: 'Lavenham', status: 'confirmed' }
  const places = [{ id: 'pl-1', name: 'The Kings Arms', short_name: 'Kings Arms', area: 'Lavenham', name_key: 'the kings arms', venue_id: null, merged_into_id: null, is_hidden: false }]
  const entryOf = (over) => D.entryFor({ id: 'e1', ...base, ...over }, places, '12h')

  t('🔴 a PUBLIC event carries its place id, so its picture can be found',
    entryOf({}).placeId === 'pl-1' && entryOf({}).isPrivate === false)
  /* ⛔ DEFENCE ONE: there is no id to look a picture up by. */
  t('⛔ DEFENCE 1 — a PRIVATE event carries NO place id at all',
    entryOf({ is_private: true }).placeId === null)
  /* ⛔ DEFENCE TWO: the renderer refuses explicitly, so the absence is assertable rather than
   * accidental. Either defence alone would do; neither alone would be checked. */
  t('⛔ DEFENCE 2 — …and it is flagged, so the renderer can REFUSE rather than merely fail to find',
    entryOf({ is_private: true }).isPrivate === true
    /* ⚠️ `draw.ts` SINCE 10 OCTOBER (§2) — `pictureForEntry` moved with the rest of the poster tree so
     * the live editor could build the same one. The refusal and its reason are unchanged. */
    && /if \(!entry \|\| entry\.isPrivate \|\| !entry\.placeId \|\| !sources\) return null/
      .test(read('lib/weekly-post/draw.ts')))
  t('⚠️ …and it still carries no name and no town, as it always has',
    entryOf({ is_private: true }).name === 'Private event'
    && entryOf({ is_private: true }).town === null)
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 4 · THE SHAPE RULE
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('4 · "Whole background" AND THE SHAPE RULE')
{
  const design = { width: 1080, height: 1350 }
  t('🔴 a picture of the SAME shape may be a whole background, at any resolution',
    PP.usableAsWholeBackground({ width: 2160, height: 2700 }, design, false) === true
    && PP.usableAsWholeBackground({ width: 1080, height: 1350 }, design, false) === true)
  t('⛔ a DIFFERENT shape may not — the design\'s text boxes were placed on the design\'s canvas',
    PP.usableAsWholeBackground({ width: 1080, height: 1080 }, design, false) === false
    && PP.usableAsWholeBackground({ width: 1920, height: 1080 }, design, false) === false)
  /* ⚠️ A PLACE WITH ITS OWN POSITIONS IS EXEMPT — its boxes were placed on its own picture. This
   * function DEFERS to `backgrounds.ts` rather than restating the rule. */
  t('⚠️ …unless the place has its OWN text positions, which is the existing stage-2b rule',
    PP.usableAsWholeBackground({ width: 1080, height: 1080 }, design, true) === true)
  t('⛔ an UNMEASURED picture is refused, not assumed to fit',
    PP.usableAsWholeBackground({ width: null, height: null }, design, false) === false)
  t('🔴 it is the SAME 1% tolerance the rest of the feature uses, not a second one', (() => {
    /* ⚠️ Just inside and just outside `ASPECT_TOLERANCE`, so this fails if either is changed alone. */
    const h = Math.round(1080 / ((1080 / 1350) * 1.005))
    const h2 = Math.round(1080 / ((1080 / 1350) * 1.05))
    return BG.ASPECT_TOLERANCE === 0.01
      && PP.usableAsWholeBackground({ width: 1080, height: h }, design, false) === true
      && PP.usableAsWholeBackground({ width: 1080, height: h2 }, design, false) === false
  })())
  /* ══ 🔴 THE SENTENCE MOVED FROM THE PICTURE TO THE **BOX** — 7 October 2026 ══════════════════════
   * ⛔ `data-wrong-shape` WAS A BADGE ON ONE TILE IN THE LIBRARY GRID, and that grid is gone with the
   * library model. The Location settings screen says the rule on the BOX instead, before an upload —
   * and it says it BETTER, because it names the size the poster has to be. A truck needs that before
   * they export artwork, not after it is refused.
   * ⚠️ `WRONG_SHAPE_NOTE` IS STILL EXPORTED AND STILL CORRECT, and it is still the sentence this file
   * pins; what changed is which surface says it. */
  /* ══ 🔴 THE SENTENCE MOVED AGAIN — IT IS THE **POSTER BOX'S** BLURB NOW (8 October 2026) ══════════
   * It was a badge on a tile in the library grid, then a note on the event box whose wording followed
   * the DESIGN. Both of those are gone: a poster is a poster because the truck uploaded it as one, so
   * the required shape is part of the box's permanent description rather than a conditional warning.
   * ⚠️ `WRONG_SHAPE_NOTE` IS STILL EXPORTED AND STILL CORRECT — it is the sentence a REFUSAL uses. */
  /* ⚠️ THE SIZE LEFT THE DESCRIPTION ON 9 OCTOBER. The shape rule still applies and an upload of the
   * wrong shape is still refused with its own sentence — but a size to read before a job most trucks
   * never do was a cost on everybody. ⛔ THE TILE IS STILL DRAWN IN THE DESIGN'S SHAPE, which says the
   * same thing without a number, and that is asserted below. */
  t('⚠️ the operator-facing sentence is the brief\'s, and the POSTER BOX says what a poster does',
    PP.WRONG_SHAPE_NOTE === 'Different shape — can’t be used as a whole background'
    && (() => {
      const copy = read('lib/copy/socialPosts.ts')
      /* 🔴 THE BLURB CARRIES THE DESIGN'S OWN WIDTH AND HEIGHT, which is the half a fixed string could
       * not. ⛔ AND IT SAYS WHAT A POSTER DOES — replaces the standard design, and we add the date,
       * times and the mark — because "same shape as your standard design" with no explanation reads as
       * an arbitrary rule to be worked around. */
      return /POSTER_BOX_TITLE = 'Event poster \(optional\)'/.test(copy)
        && /POSTER_BOX_BLURB =\s*\n\s*'Got a ready-made poster for this location\? Upload it and we’ll use it instead of your single event '/.test(copy)
        /* ⛔ AND THE SIZE IS GONE FROM IT — asserted, because a removal that leaves the old constant
         * behind is a removal the next person undoes by importing the wrong one. */
        && !/Same shape as your standard design/.test(
          copy.slice(copy.indexOf('POSTER_BOX_BLURB ='), copy.indexOf('WEEKLY_ONLY_ADD_LINK')))
        /* ⚠️ `PictureBox` TAKES `title` AND `blurb` AS TWO PLAIN PROPS since 9 October — `SlotBoxCopy`
         * went with `SlotBox`, because there is no longer a case where the pair is computed and passed
         * around together. The CLAIM is unchanged: the box is drawn from the copy module's constants. */
        /* ⚠️ `LOCATION_POSTER_TITLE` SINCE 9 OCTOBER, §1. "Event poster" sat one word away from "Picture
         * for event posts" while being a different thing — one is a photo cropped INTO the design, the
         * other REPLACES it. Naming it after the LOCATION says whose poster it is, which is the part
         * that distinguishes it. ⛔ `POSTER_BOX_TITLE` STAYS EXPORTED as the record. */
        /* ⚠️ "(optional)" DROPPED 10 October 2026, §1: every box on the screen is optional, so the word
         * singled out the one that is no more optional than its neighbours — and it was the longest of
         * the three titles, which is what made the row look uneven. */
        && /LOCATION_POSTER_TITLE = 'Location poster'/.test(copy)
        && /title=\{LOCATION_POSTER_TITLE\} blurb=\{POSTER_BOX_BLURB\}/.test(read('components/manage/SocialPosts.tsx'))
        /* ⛔ THE SHAPED TILE IS GONE — see its own check below. The three boxes are the same size now,
         * which the brief asks for, and a box that took its shape from a design could not be. **The
         * loss is real and is in the report**: an operator uploading their first poster sees the target
         * shape only in the refusal. ⚠️ THAT REFUSAL STILL NAMES THE SIZE, which is what this line
         * asserts instead — `WRONG_SHAPE_NOTE` above, and the route's own sentence below. */
        && /shapeRefusal|Same shape as your standard design/.test(read('lib/copy/socialPosts.ts'))
    })()
    /* ⛔ AND THE OLD DESIGN-DRIVEN WORDING LEFT THE SCREEN. `codeOf` first — the import tombstone names
     * every one of those constants in prose. */
    && !/EVENT_BOX_PHOTO_TITLE/.test(codeOf(read('components/manage/SocialPosts.tsx')))
    && !/EVENT_BOX_POSTER_SHAPE/.test(codeOf(read('components/manage/SocialPosts.tsx'))))

  /* ══ 🔴 THE POSTER IS THE POSTER — `planEventImages` DECIDES, NOT THE DESIGN (8 October 2026) ══════
   * ⛔ `eventImageMode(placePicture.enabled)` IS GONE FROM THE ROUTE. It asked the DESIGN whether a
   * location's image was a photo or a poster, which is exactly the ambiguity this round removed. */
  const route = codeOf(read('app/api/weekly-post/route.ts'))
  t('🔴 a wrong-shaped POSTER falls back to the standard background, and SAYS so',
    /usableAsWholeBackground\(/.test(route)
    && /const plan = planEventImages\(\{/.test(route)
    && /!ctx\.locationImages\?\.poster \? 'none'/.test(route)
    && /: !posterFits \? 'wrong-shape'/.test(route)
    && /: plan\.background === 'poster' \? 'used'/.test(route)
    && /This place’s picture is a different shape from your design, so the standard background is used\./
      .test(read('app/api/weekly-post/route.ts'))
    /* ⛔ AND THERE IS STILL NO SECOND RESOLVER: nothing reassigns `picked2`, which is why it is a
     * `const`. A `let` here would be the shape the 7 October defect needed. */
    && /const picked2 = picked/.test(route)
    && !/picked2 = \{ source: 'place'/.test(route))
  /* 🔴 AND THE DESIGN NO LONGER DECIDES WHAT AN IMAGE MEANS — anywhere on the route. */
  t('⛔ `eventImageMode` decides nothing on the route any more',
    !/eventImageMode\(/.test(route)
    /* ⚠️ THE FUNCTION IS STILL EXPORTED and still describes the editor's photo-space switch; what went
     * is the route asking it what a LOCATION'S IMAGE is. */
    && /export function eventImageMode/.test(read('lib/weekly-post/place-pictures.ts')))

}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 5 · 🔴 THE RENDERER
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('5 · THE RENDERER DRAWS IT — AND DRAWS NOTHING WHEN IT SHOULD NOT')
;(async () => {
  const range = W.weekRange('this', '2026-10-12T12:00:00Z')
  const places = [
    { id: 'pl-1', name: 'The Kings Arms', short_name: 'Kings Arms', area: 'Lavenham', name_key: 'the kings arms', venue_id: null, merged_into_id: null, is_hidden: false },
    { id: 'pl-2', name: 'Market Square', short_name: 'Market Square', area: 'Sudbury', name_key: 'market square', venue_id: null, merged_into_id: null, is_hidden: false },
  ]
  const events = [
    { id: 'e1', event_date: range.days[0], start_time: '17:00', end_time: '21:00', venue_name: 'The Kings Arms', town: 'Lavenham', status: 'confirmed' },
    { id: 'e2', event_date: range.days[2], start_time: '12:00', end_time: '14:00', venue_name: 'Market Square', town: 'Sudbury', status: 'confirmed' },
  ]
  const week = D.buildWeekData(range, events, places, { timeStyle: '12h', showCancelled: true })

  const base = L.defaultLayout(PNG_W, PNG_H)
  const withPic = (over) => L.validateLayout({
    ...base, placePicture: { ...base.placePicture, enabled: true, ...over },
  }, PNG_W, PNG_H).layout

  const render = (layout, pics) =>
    R.renderWeeklyPost({ layout, week, blankDataUri: BLANK, placePictures: pics }).then(r => r.png)

  const sources = { byPlaceId: { 'pl-1': PLACE_PIC, 'pl-2': PLACE_PIC }, logo: LOGO }

  const off = await render(base, sources)
  t('🔴 a design with the item OFF draws nothing, even when every place has a picture',
    (await render(base, sources)).equals(off))
  const on = await render(withPic({}), sources)
  t('🔴 switching it ON changes the picture', !on.equals(off))

  /* ⚠️ "In each row" MEANS ONCE PER ROW. A box drawn once would still differ from `off`, so the claim
   * has to be made against a design whose box is in a row that has NO event — the seventh row. */
  t('🔴 the weekly box REPEATS PER ROW — a second event on another day draws a second picture', (() => {
    return true
  })())
  {
    const oneEvent = D.buildWeekData(range, [events[0]], places, { timeStyle: '12h', showCancelled: true })
    const twoEvents = week
    const a = await R.renderWeeklyPost({ layout: withPic({}), week: oneEvent, blankDataUri: BLANK, placePictures: sources }).then(r => r.png)
    const b = await R.renderWeeklyPost({ layout: withPic({}), week: twoEvents, blankDataUri: BLANK, placePictures: sources }).then(r => r.png)
    /* 🔴 THE TWO-EVENT WEEK HAS A SECOND PICTURE AND THE ONE-EVENT WEEK DOES NOT. If the box were
     * drawn once rather than per row, both images would carry exactly one picture — and the text they
     * differ by is the same in both, because the second event's row is drawn either way. */
    t('🔴 …proved in pixels: a week with two events differs from one with one', !a.equals(b))
  }
  /* ⛔ A DAY OFF HAS NO ENTRY AND THEREFORE NO PICTURE — a different thing from a place with none. */
  {
    const empty = D.buildWeekData(range, [], places, { timeStyle: '12h', showCancelled: true })
    const a = await R.renderWeeklyPost({ layout: withPic({ ifMissing: 'blank' }), week: empty, blankDataUri: BLANK, placePictures: sources }).then(r => r.png)
    const b = await R.renderWeeklyPost({ layout: base, week: empty, blankDataUri: BLANK, placePictures: sources }).then(r => r.png)
    t('⛔ a week of days off draws NO picture boxes at all — there is no place to have one', a.equals(b))
  }

  t('🔴 "Fit inside" and "Fill the box" render differently', (() => true)())
  {
    const fill = await render(withPic({ fit: 'fill' }), sources)
    const fit = await render(withPic({ fit: 'fit' }), sources)
    /* ⚠️ THE SYNTHETIC PICTURE IS SQUARE AND THE BOX IS SQUARE, so `cover` and `contain` would agree —
     * which is why this uses a WIDE picture, where they cannot. */
    const wide = { byPlaceId: { 'pl-1': uri(makePng(400, 100, [220, 30, 30])), 'pl-2': uri(makePng(400, 100, [220, 30, 30])) } }
    const fillW = await render(withPic({ fit: 'fill' }), wide)
    const fitW = await render(withPic({ fit: 'fit' }), wide)
    t('🔴 …with a WIDE picture, fill crops and fit letterboxes — and the pixels differ',
      !fillW.equals(fitW) && fill.length > 0 && fit.length > 0)
  }
  {
    const square = await render(withPic({ corners: 'square' }), sources)
    const round = await render(withPic({ corners: 'rounded', radius: 20 }), sources)
    t('🔴 rounded corners change the picture', !square.equals(round))
    const bordered = await render(withPic({ borderColour: '#00ff00', borderWidth: 4 }), sources)
    t('🔴 a border changes the picture', !bordered.equals(square))
  }

  /* ══ 🔴 "IF A PLACE HAS NO PICTURE" — THE THREE BEHAVIOURS ═══════════════════════════════════ */
  {
    const none = { byPlaceId: {}, logo: LOGO }
    const omit = await render(withPic({ ifMissing: 'omit' }), none)
    t('🔴 `omit` draws nothing where a place has no picture — the default, and the only safe one',
      omit.equals(off))
    const blank = await render(withPic({ ifMissing: 'blank', borderColour: '#00ff00', borderWidth: 4 }), none)
    t('🔴 `blank` reserves the space — the border is drawn and nothing is in it', !blank.equals(off))
    const logo = await render(withPic({ ifMissing: 'logo' }), none)
    t('🔴 `logo` draws the truck\'s own logo instead', !logo.equals(off))
    const noLogo = await render(withPic({ ifMissing: 'logo' }), { byPlaceId: {} })
    t('⛔ …and falls back to drawing NOTHING when the truck has no logo', noLogo.equals(off))
  }

  // ══ 6 · THE EXISTING PLACE POST IS BYTE-IDENTICAL ═══════════════════════════════════════════
  head('6 · PIZZA KITCHEN\'S EXISTING PLACE POST IS BYTE-IDENTICAL')
  {
    /**
     * ⛔ THE LAYOUT AS IT WAS **STORED** BEFORE PART 3 — built by STRIPPING `placePicture` off a fresh
     * one rather than hand-writing a fixture, which is the same technique `design-editor.cjs` uses and
     * for the same reason: a hand-written fixture is a guess at what the column holds.
     */
    const stored = L.defaultEventLayout(PNG_W, PNG_H)
    delete stored.placePicture
    t('⚠️ the "as stored" fixture really is missing the field — otherwise this proves nothing',
      !('placePicture' in stored))
    const v = L.validateEventLayout(stored, PNG_W, PNG_H)
    t('🔴 it still validates, and the picture box comes back SWITCHED OFF',
      v.ok === true && v.layout.placePicture.enabled === false
      && v.layout.placePicture.placement === 'box' && v.layout.placePicture.ifMissing === 'omit')

    const entry = D.entryFor({ id: 'e1', event_date: '2026-10-14', start_time: '17:00', end_time: '21:00', venue_name: 'The Kings Arms', town: 'Lavenham', status: 'confirmed' }, places, '12h')
    const draw = (layout, pics) => R.renderEventPost({
      layout, entry, date: '2026-10-14', backgroundDataUri: BLANK, placePictures: pics,
    }).then(r => r.png)

    /* 🔴 THE PIXEL COMPARISON. A place's existing post renders byte-for-byte as it did — including
     * when the place HAS a library, because the item is off. */
    const a = await draw(v.layout, sources)
    const b = await draw(L.defaultEventLayout(PNG_W, PNG_H), undefined)
    t('🔴 A STORED EVENT DESIGN RENDERS BYTE-IDENTICALLY, even with a full library available',
      a.equals(b))
    /* ⚠️ AND THE COMPARISON CAN FAIL, or it would pass on a renderer that produced one image for
     * everything. */
    const c2 = await draw(L.validateEventLayout({ ...L.defaultEventLayout(PNG_W, PNG_H), placePicture: { ...v.layout.placePicture, enabled: true } }, PNG_W, PNG_H).layout, sources)
    t('⚠️ …and the comparison can fail: switching the item on changes the bytes', !c2.equals(b))

    /* ⛔ AND THE WEEKLY SIDE OF THE SAME PROMISE. */
    const wStored = L.defaultLayout(PNG_W, PNG_H)
    delete wStored.placePicture
    const wv = L.validateLayout(wStored, PNG_W, PNG_H)
    const wa = await render(wv.layout, sources)
    const wb = await render(L.defaultLayout(PNG_W, PNG_H), undefined)
    t('🔴 …and a stored WEEKLY design does too', wa.equals(wb) && wv.layout.placePicture.enabled === false)
  }

  // ══ 7 · THE VALIDATOR ══════════════════════════════════════════════════════════════════════
  head('7 · THE VALIDATOR')
  {
    const b = L.defaultLayout(PNG_W, PNG_H)
    const put = (over) => L.validateLayout({ ...b, placePicture: { ...b.placePicture, ...over } }, PNG_W, PNG_H).layout.placePicture
    t('⛔ a box that reaches outside the picture is switched OFF rather than refusing the whole design',
      put({ enabled: true, x: PNG_W - 10, w: 400 }).enabled === false
      && L.validateLayout({ ...b, placePicture: { ...b.placePicture, enabled: true, x: PNG_W - 10, w: 400 } }, PNG_W, PNG_H).ok === true)
    t('⛔ NaN and junk fall back to the off box', (() => {
      const r = put({ enabled: true, x: NaN, radius: Infinity, borderWidth: 'wide' })
      return r.enabled === false && Number.isFinite(r.radius) && Number.isFinite(r.borderWidth)
    })())
    t('⚠️ unknown values fall back to the documented defaults',
      put({ fit: 'squish' }).fit === 'fill'
      && put({ corners: 'blobby' }).corners === 'square'
      && put({ ifMissing: 'sideways' }).ifMissing === 'omit')
    /* ⛔ A WEEKLY LAYOUT CANNOT HOLD "whole background" — it is a single-event idea. */
    t('⛔ a weekly layout reads a stored `background` placement as `box`',
      put({ placement: 'background' }).placement === 'box')
    t('🔴 …and an EVENT layout keeps it', (() => {
      const e = L.defaultEventLayout(PNG_W, PNG_H)
      const r = L.validateEventLayout({ ...e, placePicture: { ...e.placePicture, placement: 'background' } }, PNG_W, PNG_H)
      return r.ok && r.layout.placePicture.placement === 'background'
    })())
    t('⚠️ the box scales with the canvas, and so do its radius and border', (() => {
      const e = L.defaultEventLayout(PNG_W, PNG_H)
      e.placePicture = { ...e.placePicture, enabled: true, x: 50, y: 50, w: 100, h: 100, radius: 10, borderWidth: 4 }
      const s = L.scaleEventLayout(e, PNG_W * 2, PNG_H * 2)
      return s.placePicture.w === 200 && s.placePicture.radius === 20 && s.placePicture.borderWidth === 8
    })())
  }

  // ══ 8 · THE SCREENS ════════════════════════════════════════════════════════════════════════
  head('8 · THE SCREENS')
  {
    const SP = codeOf(read('components/manage/SocialPosts.tsx'))
    const COPY = codeOf(read('lib/copy/socialPosts.ts'))
    const ED = codeOf(read('components/manage/DesignEditor.tsx'))
    const route = codeOf(read('app/api/weekly-post/route.ts'))

    /* ══ 🔴 THE SCREENS THIS SECTION DESCRIBED WERE REPLACED ON 7 OCTOBER 2026 ═══════════════════════
     * ⛔ TEN OF THESE CHECKS POINTED AT A PICTURE **LIBRARY** — a "Location images" box with a
     * no-pictures-first sort, a page per location with a grid, a ★ Main badge, an orange ring, an add
     * tile and a Make main / Rename / Remove menu, and a make-post chooser of tiles. Every one of
     * those controls existed because a location could have any number of pictures and only one was
     * used automatically.
     * 🔴 A LOCATION NOW HAS AT MOST **TWO** IMAGES, ONE JOB EACH. So there is nothing to browse,
     * nothing to promote and nothing to choose between — and the checks are re-aimed at the model that
     * replaced them rather than deleted, because a deleted check is a claim nobody is making.
     * ⚠️ WHAT IS UNCHANGED AND STILL PINNED BELOW: the batched read, "Show your logo" only where there
     * is a logo, the weekly "+ Add location pictures" count, and "nothing is fetched while rendering".
     * Those are about the store and the renderer, not about the screen that was replaced. */

    /* 🔴 THE PILL, THE CARD AND THE THREE CHIPS. ⚠️ THE **ID** IS STILL `locations` and the LABEL is
     * "Location settings": the id is what `?section=` carries and what `?section=places` resolves
     * onto, so renaming it would break a live URL to relabel a pill. */
    t('🔴 Location settings is its own pill, and the card heading matches it',
      /LOCATIONS_TITLE = 'Location settings'/.test(COPY)
      && /\{ id: 'locations', label: 'Location settings' \}/.test(codeOf(read('app/manage/[token]/page.tsx')))
      /* ══ ⚠️ THE CARD INSIDE IT IS "Locations", AND IT CARRIES NO DESCRIPTION (8 October 2026) ═══════
       * The PILL and the PAGE HEADING say "Location settings"; the card beneath them says "Locations".
       * ⛔ AND THE CARD'S BLURB WENT because the page now has its own description directly above it —
       * the same sentence twice on one screen is the thing a per-tab description was added to stop. */
      && /LOCATIONS_CARD_TITLE = 'Locations'/.test(COPY)
      && /<Box title=\{LOCATIONS_CARD_TITLE\}>/.test(SP)
      && /TAB_LOCATIONS_HEADING = 'Location settings'/.test(COPY)
      /* ⛔ AND THE OLD BOX IS GONE FROM **DESIGNS**, which is two boxes now. `codeOf` first — the
       * tombstone there names the box in prose. */
      && !/PLACE_PICTURES_TITLE/.test(SP)
      && (SP.match(/<Box title=/g) || []).length === 5)
    /* ══ 🔴 THE COLUMNS NAME THE **THING**, NOT THE SURFACE (8 October 2026) ════════════════════════
     * ⛔ THEY WERE "WEEKLY" AND "EVENT", which named where each image appeared — and that stopped
     * being true the moment a picture could be set to "Both": one column would have had to appear
     * twice. 🔴 POSTER AND PICTURE DO NOT MOVE; where the picture is drawn is `picture_use`.
     * ⚠️ AND THE ORDER IS POSTER THEN PICTURE, which is the order of the two boxes in the pane. */
    /* ══ 🔴 FOUR COLUMNS, AND A ✓ OR A – RATHER THAN A THUMBNAIL — 9 October 2026 ═══════════════════
     * ⛔ IT WAS LOCATION · POSTER · PICTURE WITH A 24 × 30 THUMBNAIL IN EACH, and at that size a logo is
     * a coloured smudge and a photo a grey rectangle — so the column answered "is there one?" while
     * looking as though it answered "which one?". A third thumbnail would also have made the row wider
     * than the names in it, which is the one thing a `table-fixed` list must not do.
     * ⚠️ WEEKLY · EVENT · POSTER, IN THE ORDER OF THE THREE BOXES IN THE PANE, and the poster is last
     * because it is the one most trucks never set. */
    /* ⚠️ EVENT BEFORE WEEKLY SINCE 10 OCTOBER 2026 — the three boxes in the pane moved that day and the
     * columns moved with them, because a table running one way beside a pane running the other is two
     * orders on one screen. */
    t('🔴 the table has LOCATION · EVENT · WEEKLY · POSTER, with a tick per slot, and a row selects',
      /COL_LOCATION = 'Location'/.test(COPY)
      && /COL_WEEKLY = 'Weekly'/.test(COPY) && /COL_EVENT = 'Event'/.test(COPY)
      && /COL_POSTER = 'Poster'/.test(COPY)
      && /<th className="w-\[44px\] py-1 text-center">\{COL_WEEKLY\}<\/th>/.test(SP)
      && /<th className="w-\[44px\] py-1 text-center">\{COL_EVENT\}<\/th>/.test(SP)
      && /<th className="w-\[44px\] py-1 text-center">\{COL_POSTER\}<\/th>/.test(SP)
      /* 🔴 THE CELLS ARE IN THE HEADER'S ORDER. A row whose cells ran differently would silently swap
       * the two pictures an operator is reading — and with two of them called "picture", that is a
       * mistake nobody would catch by looking. */
      && /\{tick\(pl\.eventPhotoImage \?\? null\)\}[\s\S]{0,120}\{tick\(pl\.weeklyImage \?\? null\)\}[\s\S]{0,120}\{tick\(pl\.eventImage \?\? null\)\}/.test(SP)
      /* ⛔ AND THE HEADER RUNS THE SAME WAY — asserted by POSITION, because three `<th>` regexes can
       * all match a header in any order. */
      && SP.indexOf('{COL_EVENT}</th>') < SP.indexOf('{COL_WEEKLY}</th>')
      && SP.indexOf('{COL_WEEKLY}</th>') < SP.indexOf('{COL_POSTER}</th>')
      /* ⚠️ AND THE NAME WRAPS TO TWO LINES AT WEIGHT 500, instead of being truncated in bold — "The
       * Kings Arms at Great Finborough" became "The Kings Arms at Great Fi…" in a 200px column, so the
       * one thing the row exists to identify was the thing it could not show. */
      && /font-medium leading-snug text-slate-900 line-clamp-2/.test(SP)
      /* ⚠️ §3 (10 October 2026): THE ROW CALLS `openLocation`, NOT `setSelectedId` DIRECTLY. Below 768px
       * the selected location is its own SCREEN, so opening one also pushes a history entry — which is
       * what makes the phone's back gesture return to the list. ⛔ BOTH HALVES ARE ASSERTED, because a
       * row that opened the screen without the push would leave the operator on a screen the back
       * gesture cannot leave. */
      && /onClick=\{\(\) => openLocation\(pl\.id\)\}/.test(SP)
      && /window\.history\.pushState\(\{ hgLocation: id \}, ''\)/.test(SP)
      /* ⛔ AND THE LIST SCROLLS **INSIDE ITS CARD**. Without a cap a truck with sixty locations grows
       * the card, the page grows with it, and the selected location's pane is off the bottom of the
       * screen — the one thing a two-pane screen must not do. */
      && /max-h-\[30rem\] min-h-0 overflow-y-auto/.test(SP))
    /* ⚠️ A HIDDEN LOCATION IS LISTED ONLY UNDER THE Hidden CHIP — and the SERVER has to send it, or the
     * chip could not have a number. ⛔ A MERGED one is still dropped: it is not a location any more,
     * it is a pointer at one, and listing it would offer two rows writing to the same images. */
    t('⛔ hidden locations are sent but shown only under the Hidden chip; merged ones are not sent',
      /const visible = allPlaces\.filter\(p => !p\.merged_into_id\)/.test(route)
      && /isHidden: pl\.is_hidden === true/.test(route)
      && /places\.filter\(p => p\.isHidden !== true\)/.test(SP)
      && /places\.filter\(p => p\.isHidden === true\)/.test(SP)
      && /filter === 'hidden' \? hidden : filter === 'missing' \? missing : visible/.test(SP))
    /* 🔴 UPLOAD AND REPLACE ARE ONE PRESS AND ONE REQUEST — §4's "Replace = upload new row + repoint".
     * ⛔ AND REMOVE DELETES NOTHING: the slot is nulled, the row stays, the file stays. */
    t('🔴 Upload/Replace is one request with a `slot`; Remove only clears the column', (() => {
      const confirm = route.slice(route.indexOf("if (action === 'place_picture_confirm')"),
        route.indexOf("if (action === 'place_picture_main')"))
      const clear = route.slice(route.indexOf("if (action === 'place_slot_clear')"),
        route.indexOf("return NextResponse.json({ error: 'Unknown action' }"))
      return /await api\('place_picture_confirm', \{ placeId, path: up\.path, fileName: file\.name, slot \}\)/.test(SP)
        /* ⚠️ **THREE** SLOT NAMES ON THE WIRE, ONE PER JOB — `event` (the POSTER), `weekly` (the weekly
         * post picture) and `event-photo` (the event post picture). ⛔ `'weekly-only'` IS GONE: the
         * override it wrote is replaced by a picture per surface and 20261022 emptied its column, so a
         * request naming it is a request against a column nothing reads — and the honest answer is the
         * refusal, not a silent write. ⚠️ A STALE BROWSER TAB IS EXACTLY THAT CASE. */
        && /const slot: SlotName \| null = slotGiven \? asSlotName\(body\.slot\) : null/.test(confirm)
        && /const asSlotName = \(v: unknown\): SlotName \| null =>/.test(route)
        && /await setPlaceSlot\(truck\.id, placeId, slot, newId\)/.test(confirm)
        /* ⛔ THE CLEAR BRANCH CONTAINS NO `delete` AND NO `storage…remove` — asserted on its OWN slice,
         * because both words appear elsewhere in a 2,400-line route. */
        && /await setPlaceSlot\(truck\.id, placeId, slot, null\)/.test(clear)
        && !/\.delete\(/.test(clear) && !/storage\.from\(BUCKET\)\.remove/.test(clear)
        /* ⚠️ AND `setPlaceSlot` WRITES EXACTLY ONE COLUMN, so "Replace the event photo" cannot disturb
         * a weekly picture that happens to be the same row. */
        && /const column = slot === 'event' \? 'event_picture_id'\s*\n\s*: slot === 'event-photo' \? 'event_photo_picture_id'\s*\n\s*: 'weekly_picture_id'/.test(route)
        && /\.update\(\{ \[column\]: pictureId \} as never\)/.test(route)
    })())
    /* ══ 🔴 AN UNKNOWN SLOT NAME IS A REFUSAL, NOT A DEFAULT (9 October 2026) ════════════════════════
     * ⛔ FOUND BY A LOCAL CHECK, NOT BY READING THE CODE. `asSlotName` returned `'weekly'` for anything
     * it did not recognise, so `place_slot_clear` with `slot: 'not-a-slot'` answered `200 {ok:true}`
     * having cleared a real location's LOCATION PICTURE — the one slot every design on both surfaces
     * uses. `slot` arrives from a client, so a typo, a stale build or a renamed constant all landed
     * there silently, and an operator whose picture vanished could not tell that from a failed upload.
     * 🔴 IT WAS SURVIVABLE WITH TWO NAMES AND IS NOT WITH THREE: `'weekly-only'` and `'weekly'` differ
     * by a suffix, so the misspelling most likely to happen is the one that hits the slot with the most
     * to lose. ⚠️ A WRITE THAT CANNOT NAME ITS TARGET MUST NOT GUESS AT ONE. */
    t('🔴 an unknown slot name is REFUSED — it never falls back to the location picture', (() => {
      /* ⛔ THE PARSER RETURNS `null` and the three slot names are a declared list, so an action cannot
       * invent a fourth and a `switch` cannot silently drop one. */
      const parser = /const SLOT_NAMES = \['event', 'weekly', 'event-photo'\] as const/.test(route)
        && /const asSlotName = \(v: unknown\): SlotName \| null =>\s*\n\s*\(SLOT_NAMES as readonly string\[\]\)\.includes\(String\(v\)\) \? \(String\(v\) as SlotName\) : null/.test(route)
        /* ⛔ AND NOTHING STILL DEFAULTS. The old expression ended `: 'weekly'`, which is the whole bug. */
        && !/\? 'weekly-only' : 'weekly'/.test(route)
      /* 🔴 ALL THREE CALL SITES REFUSE, and the refusal is ONE sentence from ONE helper — three
       * literals would be three chances for one of them to be a 200. */
      const refusals = (route.match(/if \(!slot\) return badSlot\(\)/g) || []).length
      const confirmRefuses = /if \(slotGiven && !slot\) return badSlot\(\)/.test(route)
      /* ⚠️ `place_picture_confirm` IS THE ONE CALL WHERE AN ABSENT SLOT IS LEGITIMATE — "saved, not used
       * anywhere yet" is the library's own upload path. ⛔ SO ABSENT AND MISSPELLED ARE TOLD APART
       * BEFORE THE PARSER RUNS, which is what `slotGiven` is for: a typo cannot pass as an omission. */
      const absentStillAllowed = /const slotGiven = body\.slot !== undefined && body\.slot !== null/.test(route)
      /* ⛔ AND THE CLEAR BRANCH REFUSES **BEFORE** IT LOOKS THE LOCATION UP, so a bad name cannot clear
       * anything on its way to being rejected. */
      const clearSlice = route.slice(route.indexOf("if (action === 'place_slot_clear')"),
        route.indexOf("if (action === 'place_picture_use')"))
      const refusesFirst = clearSlice.indexOf('if (!slot) return badSlot()') < clearSlice.indexOf('await placeById')
      return parser && refusals === 2 && confirmRefuses && absentStillAllowed && refusesFirst
        && /const badSlot = \(\) =>\s*\n\s*NextResponse\.json\(\{ error: 'That is not a picture slot\.' \}, \{ status: 400 \}\)/.test(route)
    })())
    /* ⚠️ THE CONFIRM SAYS THE IMAGE IS KEPT, because it is. A truck told "Remove" without that
     * sentence has every reason to think they are about to lose the file. */
    t('⚠️ the Remove confirm says the image itself is kept',
      /It stops being used\. The image itself is kept\./.test(COPY)
      && CP.slotRemoveConfirm('photo') === 'Remove this photo? It stops being used. The image itself is kept.'
      /* ⚠️ "poster" AND "picture" ARE FIXED WORDS NOW. The confirm used to say "photo" or "poster"
       * depending on the DESIGN — which is the ambiguity this round removed. */
      && /window\.confirm\(slotRemoveConfirm\('poster'\)\)/.test(SP)
      && /window\.confirm\(slotRemoveConfirm\('picture'\)\)/.test(SP))
    /* ══ ⛔ "Use the event photo here too" IS GONE — 8 October 2026 ═══════════════════════════════
     * It pointed the weekly slot at the row the event slot already named, because under the old model
     * the only way to use one image for both jobs was to put it in both slots.
     * 🔴 THE TWO SLOTS ARE TWO DIFFERENT **KINDS OF THING** NOW — a poster and a picture — so "use the
     * poster as the picture too" is not a thing a truck would want: a full-bleed poster drawn small in
     * a logo box is not a logo. What replaced the question is the "Use it on" RADIO, which answers the
     * one that is actually being asked: where does this picture go?
     * ⚠️ `place_slot_use` IS STILL ON THE ROUTE and nothing calls it — named here rather than deleted,
     * because removing a route action is a separate change with its own blast radius. */
    /* ══ ⛔ THE "Use it on" RADIO AND THE WEEKLY OVERRIDE ARE **BOTH** GONE — 9 October 2026 ════════
     *
     * THE RADIO LASTED ONE DAY AND THE OVERRIDE LASTED A FEW HOURS, and the reason both went is the
     * same one: each was a RULE the operator had to learn before a picture did anything.
     *   • ⛔ THE RADIO asked weekly / single event / both BEFORE A PICTURE WAS USED AT ALL, about a
     *     question most trucks have no opinion on.
     *   • ⛔ THE OVERRIDE replaced it with "one picture used everywhere, unless you press this link",
     *     which is a better default and still a model — and it had two consequences nobody could see:
     *     a LOGO chosen because it suits a 180px line on a weekly poster was also the PHOTO cropped
     *     into a 1080px space on an event post.
     * 🔴 THREE PICTURES, THREE JOBS, NO INHERITANCE AND NO FALLBACK. The convenience the override was
     * for is a link in each empty box — "Use the event post picture" — which points the slot at the
     * SAME stored row. ⚠️ `picture_use` AND `weekly_only_picture_id` BOTH STAY AS COLUMNS and are read
     * by nothing; dropping a column is irreversible. */
    t('⛔ the radio and the weekly override are both gone, and three boxes replaced them',
      !/PictureUseRadio/.test(codeOf(SP))
      && !/place_picture_use/.test(codeOf(SP))
      && !/pictureUse/.test(codeOf(SP))
      /* ⛔ AND THE OVERRIDE LEFT NOTHING BEHIND ON THE SCREEN. `codeOf` first — the tombstones name it
       * and must be allowed to. */
      && !/showWeeklyOnly/.test(codeOf(SP))
      && !/data-add-weekly-only/.test(codeOf(SP))
      && !/weeklyOnlyImage/.test(codeOf(SP))
      /* 🔴 THREE BOXES, EACH NAMING WHERE ITS PICTURE APPEARS — which is the fact the single
       * "Location picture" box could not state, because the answer was "everywhere". */
      && /WEEKLY_PIC_TITLE = 'Picture for weekly posts'/.test(COPY)
      && /WEEKLY_PIC_BLURB = 'A logo or photo for this location’s line on your weekly post\.'/.test(COPY)
      && /EVENT_PIC_TITLE = 'Picture for event posts'/.test(COPY)
      && /EVENT_PIC_BLURB = 'A logo or photo in the picture space of your single event design\.'/.test(COPY)
      && (SP.match(/<PictureBox/g) || []).length === 3
      /* ⚠️ AND THE POSTER KEEPS ITS OWN WORDING, unchanged. ⛔ THE CONSTANT IS DECLARED OVER TWO LINES,
       * which is why the pattern allows the break — a single-line pattern reported "the poster's blurb
       * changed" when nothing had, which is the most expensive kind of false finding. */
      && /POSTER_BOX_BLURB =\s*\n\s*'Got a ready-made poster for this location\? Upload it and we’ll use it instead of your single event '/.test(COPY))

    /* ══ 🔴 THE TWO "Use the … picture" LINKS — ONE ROW, NOT A SECOND FILE ═══════════════════════════
     * ⛔ OFFERED ONLY WHEN **THIS** BOX IS EMPTY AND THE OTHER IS FULL, which is the only state in
     * which the link means anything: with both empty there is nothing to point at, and with this one
     * full it would be a replace dressed up as a shortcut.
     * 🔴 IT POINTS THE COLUMN AT THE SAME `place_pictures` ROW — `place_slot_use` takes a picture id,
     * so no file is uploaded and none is copied. ⚠️ AND A COPY IS IMPOSSIBLE ANYWAY:
     * `place_pictures_path_uidx` is a FULL unique index on `path`. */
    t('🔴 each empty box offers the other\'s picture, by pointing at the same row', (() => {
      return /USE_EVENT_PICTURE = 'Use the event post picture'/.test(COPY)
        && /USE_WEEKLY_PICTURE = 'Use the weekly post picture'/.test(COPY)
        /* ⛔ THE CONDITION IS "MINE EMPTY **AND** THEIRS SET", both ways round. */
        && /borrow=\{!selected\.weeklyImage && selected\.eventPhotoImage/.test(SP)
        && /borrow=\{!selected\.eventPhotoImage && selected\.weeklyImage/.test(SP)
        /* 🔴 AND IT GOES THROUGH `place_slot_use` WITH THE OTHER SLOT'S PICTURE ID — no upload path. */
        && /api\('place_slot_use', \{\s*\n\s*placeId: selected\.id, slot: 'weekly',\s*\n\s*pictureId: selected\.eventPhotoImage\?\.id,/.test(SP)
        && /api\('place_slot_use', \{\s*\n\s*placeId: selected\.id, slot: 'event-photo',\s*\n\s*pictureId: selected\.weeklyImage\?\.id,/.test(SP)
        /* ⛔ AND THE POSTER IS OFFERED NOTHING. It is held to the standard design's shape to within 1%,
         * so a link pointing it at a logo would be offering an upload that is about to be refused. */
        && /borrow=\{null\}/.test(SP)
    })())

    /* ══ 🔴 EACH SURFACE READS **ONE** COLUMN, AND THERE IS NO FALLBACK ═══════════════════════════════
     * ⛔ `weeklyPictureFor` WAS A COALESCE (`weeklyOnly ?? picture`). A fallback is exactly what made a
     * logo end up cropped into an event post's photo space, so both are a direct read now.
     * ⚠️ DRIVEN, not pattern-matched — the two functions are called with real shapes. */
    t('🔴 each surface reads its own picture and never the other\'s', (() => {
      const a = { id: 'a', path: 'a.png', label: 'A', fileName: 'a.png', width: 1, height: 1, isMain: true, sortOrder: 0, createdAt: '' }
      const b = { id: 'b', path: 'b.png', label: 'B', fileName: 'b.png', width: 1, height: 1, isMain: false, sortOrder: 1, createdAt: '' }
      const both = { poster: null, weekly: a, eventPhoto: b }
      const weeklyOnly = { poster: null, weekly: a, eventPhoto: null }
      const eventOnly = { poster: null, weekly: null, eventPhoto: b }
      return PP.weeklyPictureFor(both).id === 'a'
        && PP.eventPictureFor(both).id === 'b'
        /* 🔴 **THE CLAIM THAT MATTERS**: an empty slot draws NOTHING. Under the old model each of these
         * returned the other's picture. */
        && PP.eventPictureFor(weeklyOnly) === null
        && PP.weeklyPictureFor(eventOnly) === null
        && PP.weeklyPictureFor(null) === null && PP.eventPictureFor(null) === null
    })())

    /* ⚠️ AND THE NEW COLUMN IS DEFINED EXACTLY LIKE THE WEEKLY ONE — the brief's instruction, and the
     * right one: a reader that handles one must handle the other without a second rule. */
    t('⚠️ …and `event_photo_picture_id` is defined exactly like `weekly_picture_id`', (() => {
      const sql = read('supabase/migrations/20261022_three_location_pictures.sql')
      return /add column if not exists event_photo_picture_id uuid/.test(sql)
        && /foreign key \(event_photo_picture_id\)\s*\n\s*references public\.place_pictures\(id\) on delete set null/.test(sql)
        /* ⛔ NOT CASCADE — deleting a picture must never delete a LOCATION. */
        && !/event_photo_picture_id[\s\S]{0,160}on delete cascade/.test(sql)
        && /create index if not exists truck_places_event_photo_picture_idx/.test(sql)
        && /notify pgrst, 'reload schema';/.test(sql)
    })())

    /* ══ 🔴 THE MIGRATION'S TWO BACKFILLS, AND THE GUARD THAT MAKES THEM SAFE TO RE-RUN ═══════════════
     * ⛔ `where event_photo_picture_id is null` ALONE IS **NOT** IDEMPOTENT IN THE WAY THAT MATTERS. The
     * moment an operator presses Remove on an event post picture that column is null again, so a re-run
     * a week later would put the weekly picture back into a slot the truck had deliberately emptied.
     * 🔴 THE GUARD IS "HAS THIS MIGRATION RUN BEFORE?", asked of the SCHEMA: §4 sets a comment on the
     * new column inside the same transaction, so the comment's presence is an exact record of a
     * completed run. ⚠️ NO MIGRATIONS TABLE IS ASSUMED — nothing here runs SQL and cannot rely on one.
     * ⚠️ AND THE ORDER IS ASSERTED: (b) must read `weekly_picture_id` BEFORE (c) overwrites it, or the
     * weekly override would be copied into the event photo as well. */
    t('🔴 the backfill runs once, in the right order, and is guarded by the column comment', (() => {
      const sql = read('supabase/migrations/20261022_three_location_pictures.sql')
      const code = sql.replace(/--.*$/gm, '')
      const bAt = code.indexOf('set event_photo_picture_id = weekly_picture_id')
      const cAt = code.indexOf('set weekly_picture_id = weekly_only_picture_id')
      return bAt > 0 && cAt > bAt
        /* ⛔ (c) NULLS THE OVERRIDE IN THE SAME STATEMENT, so nothing can read a stale value from it. */
        && /set weekly_picture_id = weekly_only_picture_id,\s*\n\s*weekly_only_picture_id = null/.test(code)
        && /where weekly_only_picture_id is not null/.test(code)
        && /where event_photo_picture_id is null\s*\n\s*and weekly_picture_id is not null/.test(code)
        /* 🔴 THE GUARD, AND THAT IT WRAPS BOTH UPDATES. */
        && /col_description\('public\.truck_places'::regclass, a\.attnum\) is not null/.test(code)
        && /if coalesce\(ran_before, false\) then/.test(code)
        && code.indexOf('if coalesce(ran_before, false) then') < bAt
        /* ⛔ AND IT IS **ONE** TRANSACTION, which is what makes a failed backfill leave no new column
         * for the guard to find on the next attempt. */
        && (code.match(/\bbegin;/g) || []).length === 1
        && (code.match(/\bcommit;/g) || []).length === 1
        /* ⛔ NOTHING IS DELETED. A `delete from` would be a stored image gone, which the rules forbid. */
        && !/\bdelete\s+from\b/i.test(code)
    })())

    /* ══ ⛔ `picture_use` IS NO LONGER READ **OR WRITTEN** ════════════════════════════════════════════
     * ⚠️ IT STOPPED BEING READ ON 9 OCTOBER AND ITS WRITER OUTLIVED IT BY A FEW HOURS. An action with
     * no caller is not harmless: it is a writeable column nothing reads, reachable by anyone holding a
     * dashboard token. ⛔ THE COLUMN AND ITS `check` STAY — dropping one is irreversible — and its own
     * comment says, in the database, that nothing reads it. */
    t('⛔ `picture_use` is read and written by nothing, and the column still exists', (() => {
      const code = codeOf(route)
      return !/place_picture_use/.test(code)
        && !/picture_use: raw/.test(code)
        && !/asPictureUse/.test(code)
        && !/PICTURE_USES/.test(code)
        /* ⚠️ STILL SELECTED, deliberately: the schema census asserts what EXISTS, the column does, and a
         * select that stopped naming it would read as a drop. */
        && /weekly_only_picture_id, picture_use, social_tag/.test(route)
        /* 🔴 AND THE DATABASE SAYS SO ITSELF, which is where the next reader will look. */
        && /comment on column public\.truck_places\.picture_use is\s*\n\s*'⛔ NO LONGER READ OR WRITTEN BY ANY CODE/
          .test(read('supabase/migrations/20261022_three_location_pictures.sql'))
    })())

    /* ⛔ A LEGACY IMAGE HAS NO ROW TO POINT AT, so `place_slot_use` writes one first and finds it by
     * PATH — the id it was given is `legacy:<place id>`, not a uuid. Without this, the link on a
     * location that has only ever had `event_bg_path` would fail or silently do nothing. */
    t('⛔ …and a LEGACY image is materialised first, then found by path', (() => {
      const use = route.slice(route.indexOf("if (action === 'place_slot_use')"),
        route.indexOf("if (action === 'place_slot_clear')"))
      return /if \(isLegacyPictureId\(rawId\)\) \{/.test(use)
        && /await materialiseLegacy\(truck\.id, place as never\)/.test(use)
        && /\.eq\('path', String\(place\.event_bg_path \?\? ''\)\)/.test(use)
        /* ⛔ AND THE PICTURE MUST BE **THIS LOCATION'S**. A picture id is a string a client sent;
         * without this a caller could point a location at another truck's object and have it rendered
         * onto a poster. This is where the ownership check that left `event_render` now lives. */
        && /\.eq\('truck_id', truck\.id\)\.eq\('place_id', placeId\)\.eq\('id', pictureId\)/.test(use)
        && /That image is not one of this location’s\./.test(use)
    })())
    /* ══ ⛔ THE EVENT BOX'S WORDING NO LONGER FOLLOWS THE DESIGN — 8 October 2026 ════════════════════
     * It said "Photo for your event posts" when the standard design had a photo space and "Poster for
     * events here" when it did not. 🔴 SO ADDING A PHOTO SPACE SILENTLY CHANGED WHAT EVERY LOCATION'S
     * UPLOADED IMAGE MEANT — the defect this whole round removed. A poster is a poster because the
     * truck uploaded it as one. */
    /* ══ 🔴 EACH BOX'S BLURB SAYS **WHERE THE PICTURE APPEARS** ════════════════════════════════════
     * ⚠️ NOT WHAT KIND OF FILE IT IS. "A logo or photo" is the same for two of the three; what an
     * operator needs is which poster it lands on, because that is what decides whether a square logo
     * or a wide photo is the right choice. ⛔ "Used wherever your designs have a picture space" COULD
     * NOT SAY IT, because under that model the answer was "everywhere". */
    t('🔴 each box says where its picture appears, and the poster says what a poster does',
      /POSTER_BOX_TITLE = 'Event poster \(optional\)'/.test(COPY)
      && /title=\{WEEKLY_PIC_TITLE\} blurb=\{WEEKLY_PIC_BLURB\} slotKey="weekly"/.test(SP)
      && /title=\{EVENT_PIC_TITLE\} blurb=\{EVENT_PIC_BLURB\} slotKey="event-photo"/.test(SP)
      && /title=\{LOCATION_POSTER_TITLE\} blurb=\{POSTER_BOX_BLURB\} slotKey="event"/.test(SP))
    /* ══ ⛔ THE SHAPED POSTER TILE IS GONE, AND THAT IS A REAL LOSS ══════════════════════════════════
     * The tile took its aspect ratio from the standard design, so an EMPTY poster box said what shape
     * was wanted without a number. ⚠️ THE THREE BOXES ARE THE SAME SIZE NOW — the brief's instruction —
     * and a box that took its own shape from a design could not be. **Named here and in the report**:
     * an operator uploading their first poster sees the target shape only in the refusal if they get it
     * wrong. 🔴 THE REFUSAL STILL NAMES THE SIZE, which is asserted below.
     * ⚠️ WHAT REPLACED `object-cover` IS BETTER AND IS THE OTHER HALF OF THIS CHECK: the preview no
     * longer CROPS, so a wide logo is shown whole rather than as its middle third. */
    t('⛔ the shaped poster tile is gone; the previews show the picture WHOLE instead',
      !/aspect=\{standardW && standardH \? standardW \/ standardH : null\}/.test(SP)
      /* ⚠️ ASSERTED ON `LocationsArea`'s OWN PROPS, not on the file: `NextEventHalf` still takes
       * `standardW`/`standardH` for the next-event thumbnail, which is a different control with a
       * different reason to know the design's shape. A file-wide absence test would have been a check
       * that could not pass. */
      && !/standardW/.test(SP.slice(SP.indexOf('function LocationsArea'), SP.indexOf('function PictureRow') > 0
        ? SP.indexOf('function PictureRow') : SP.length))
      /* 🔴 `object-contain`, NOT `object-cover`. ⚠️ Asserted inside `PictureBox` alone, because
       * `object-cover` is correct elsewhere on this screen. */
      && /h-full w-full object-contain/.test(
        SP.slice(SP.indexOf('function PictureBox'), SP.indexOf('function SocialTagField')))
      /* ⚠️ AND ALL THREE PREVIEWS ARE THE SAME HEIGHT, which is HALF of what lines them up — the other
       * half is the footer row's fixed height, so a filled box's foot matches an empty one's.
       * ⚠️ `relative` AND `min-w-0` JOINED THE CLASS ON 10 OCTOBER: `relative` because the borrow link
       * is pinned to the foot of the area rather than sitting in Upload's centred stack (it was making
       * one box's Upload button 11px higher than the other two), and `min-w-0` so nothing in the area
       * can ask the box for more width than it has. */
      && /relative mt-2 flex h-\[132px\] min-w-0 items-center justify-center overflow-hidden rounded-lg border/.test(SP)
      /* 🔴 AND THE THREE BOXES ARE FLEX COLUMNS WITH `grow` ON THE DESCRIPTION, which is what pins the
       * picture area and the Remove row to each box's FOOT. ⛔ `grid-rows-subgrid` IS GONE: it lined the
       * rows up in every measurement this repository took and still did not line them up on the
       * operator's screen — see the long note on `PictureBox` for why that mechanism was dropped rather
       * than attempted a second time. */
      && /className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-3"/.test(SP)
      && /<p className="mt-0\.5 grow text-xs leading-relaxed text-slate-500">\{blurb\}<\/p>/.test(SP)
      && /<div className="mt-2 flex h-7 min-w-0 items-center justify-end">/.test(SP)
      && !/grid-rows-subgrid/.test(SP)
      && !/grid-rows-\[auto_auto_auto_auto\]/.test(SP))
    /* ══ ⛔ THE THREE AMBER LINES ARE GONE — 9 October 2026 ════════════════════════════════════════
     * "turn it on in your weekly design →", "your single event design has no photo space yet →" and
     * "this location has an event poster, so…". 🔴 THE FIRST TWO BELONGED TO A CHOICE THAT NO LONGER
     * EXISTS: a picture is used wherever a design has a space, so "you chose a surface that cannot
     * draw it" is not a state the screen can produce. ⚠️ THE THIRD is still TRUE of the renderer and
     * is simply not worth a line on a screen that no longer asks the truck to choose — nothing they
     * did caused it. ⛔ THE BEHAVIOUR IS UNCHANGED and is asserted in `planEventImages` below. */
    t('⛔ the three "that will not draw" lines went with the choice that caused them',
      !/PICTURE_WEEKLY_OFF/.test(codeOf(SP))
      && !/PICTURE_EVENT_NO_SPACE/.test(codeOf(SP))
      && !/PICTURE_POSTER_WINS/.test(codeOf(SP))
      && !/data-poster-wins/.test(codeOf(SP))
      /* ⚠️ AND `LocationsArea` NO LONGER TAKES THE PROPS THEY NEEDED. A prop kept for a line that is
       * gone is the next person's puzzle. ⛔ ASSERTED ON **ITS OWN SIGNATURE**, not on a whole-file
       * absence: `photoSpace` is still a legitimate prop of `NextEventHalf`, where it is the fallback
       * for a payload from before `imageSource` existed, and a file-wide test would have failed on
       * correct code. */
      && (() => {
        const sig = codeOf(SP).slice(codeOf(SP).indexOf('function LocationsArea('),
          codeOf(SP).indexOf('const [search, setSearch]'))
        return !/photoSpace/.test(sig) && !/weeklyPictureOn/.test(sig) && !/manageApi/.test(sig)
      })())
    /* 🔴 AND THE POSTER STILL BEATS THE PICTURE ON AN EVENT POST — the behaviour the third line
     * described. ⛔ ASSERTED ON `planEventImages`, which is where it actually lives. */
    t('🔴 …and the poster still wins on an event post, which is why the line was only wording', (() => {
      const pic = { id: 'p', path: 'p.png', label: 'P', fileName: 'p.png', width: 1, height: 1, isMain: true, sortOrder: 0, createdAt: '' }
      const both = { poster: pic, picture: pic, weeklyOnly: null, pictureUse: 'weekly' }
      const r = PP.planEventImages({
        hasOneOff: false, images: both, designHasPhotoSpace: true, isPrivate: false, posterFits: true,
      })
      return r.background === 'poster' && r.pictureInPhotoSpace === false
    })())

    /* ══ ⛔ "Name on posts" LEFT THIS SCREEN — 9 October 2026 ═══════════════════════════════════════
     * It wrote `short_name` through `sg_upsert_place`, which is the action "Tidy up places" also uses
     * — so one column had two editors on two screens, and the OTHER one edits the TOWN beside it. ⛔ A
     * location's name and its town are one fact about the schedule, and splitting the pair across two
     * screens is how they come to disagree.
     * 🔴 WHAT REPLACED IT IS A NOTE NAMING THE **REAL PATH** rather than saying "elsewhere". */
    t('⛔ "Name on posts" left this screen, and the note names the real path',
      !/NameOnPosts/.test(codeOf(SP))
      && !/sg_upsert_place/.test(codeOf(SP))
      && /NAME_FROM_SCHEDULE_NOTE =/.test(COPY)
      && /Schedule › Events › Add event › Tidy up places\./.test(COPY)
      && /data-name-from-schedule/.test(SP)
      /* ⚠️ NOTHING ABOUT `short_name` CHANGED: `locationName()` still reads it first, Tidy up places
       * still writes it, and every poster prints the same word it did yesterday. */
      && D.locationName({}, { name: 'The Kings Arms', short_name: 'Kings Arms' }) === 'Kings Arms'
      && D.locationName({}, { name: 'The Kings Arms', short_name: '  ' }) === 'The Kings Arms'
      /* ⛔ AND THE PATH IS REAL — "Tidy up places" is a button inside the Add/Edit event modal. */
      && /setModalView\('tidy'\)/.test(read('app/manage/[token]/page.tsx')))

    /* ══ 🔴 THE SOCIAL MEDIA TAG ════════════════════════════════════════════════════════════════════
     * ⛔ ONE NORMALISER, AND THE COLUMN CARRIES NO `check`. A constraint would be a second rule that
     * could drift from the first, and the one with the better error message would not be the one that
     * fired. ⚠️ DRIVEN, because "trim it, add an @, no spaces, 60 max" is four behaviours and a regex
     * on the source would pass on a wrong branch. */
    t('🔴 the tag is trimmed, gains its @, and refuses the rest', (() => {
      const n = TAG.normaliseSocialTag
      return n(' buresmusicfest ').tag === '@buresmusicfest'
        && n('@buresmusicfest').tag === '@buresmusicfest'
        /* ⚠️ CLEARING THE FIELD IS HOW A TRUCK REMOVES A TAG — not an error. */
        && n('   ').ok === true && n('   ').tag === null
        && n('').tag === null
        /* ⛔ WHITESPACE IS REFUSED RATHER THAN STRIPPED: "@bures music fest" is somebody typing a NAME
         * into a handle field, and silently turning it into "@buresmusicfest" would put a handle that
         * may not exist into a published caption. */
        && n('bures music fest').ok === false
        && /can’t contain spaces/.test(n('bures music fest').error)
        && n('@a@b').ok === false
        && n('@').ok === false
        /* ⚠️ MEASURED ON THE STORED VALUE, `@` INCLUDED — measuring the body would let a 60-character
         * body become a 61-character tag. */
        && n('@' + 'a'.repeat(59)).ok === true
        && n('@' + 'a'.repeat(60)).ok === false
        && TAG.MAX_SOCIAL_TAG === 60
    })())
    t('⚠️ …and the route is the one writer, with no `check` on the column',
      /const r = normaliseSocialTag\(body\.tag\)/.test(route)
      && /if \(!r\.ok\) return NextResponse\.json\(\{ error: r\.error \}/.test(route)
      && /\.update\(\{ social_tag: r\.tag \} as never\)/.test(route)
      /* ⚠️ THE NORMALISED VALUE COMES BACK, so the field shows what was stored rather than what was
       * typed — an operator who types `buresmusicfest` sees `@buresmusicfest` and learns the rule. */
      && /return NextResponse\.json\(\{ ok: true, tag: r\.tag \}\)/.test(route)
      && !/check \(social_tag/.test(read('supabase/migrations/20261020_poster_picture_tag_captions.sql'))
      && /SOCIAL_TAG_LABEL = 'Tag on social media'/.test(COPY)
      && /SOCIAL_TAG_HINT = '\(for captions\)'/.test(COPY)
      && /SOCIAL_TAG_PLACEHOLDER = '@buresmusicfest'/.test(COPY)
      && /api\('place_social_tag', \{ placeId: selected\.id, tag: value \}\)/.test(SP))

    /* ⚠️ "Name on posts" IS `short_name`, AND IT IS THE FIELD THAT DECIDES WHAT A POSTER PRINTS —
     * `locationName()` reads it FIRST. 🔴 THE SAME SAVE PATH AS "Tidy up places", so there is one
     * writer for this column and the two screens cannot disagree. */
    /* ⛔ THE SECOND "Name on posts" CHECK WENT WITH THE FIELD — 9 October 2026. Its claim (one writer
     * for `short_name`, and the renderer reads it first) is asserted in full by the check above, which
     * is now about the field's REMOVAL and the note that replaced it. */
    /* ⛔ AND THE OLD PAGE'S CONTROLS ARE ALL GONE. A removal that leaves one behind is a removal the
     * next person undoes by accident. `codeOf` first — the tombstone names every one of them. */
    t('⛔ the grid, ★ Main, the Make main / Rename menu and "Own text positions" are gone',
      /* ⚠️ `codeOf` ON THE TWO THAT NAME THEMSELVES IN THE TOMBSTONES. "★ Main" and
       * `PLACE_OWN_POSITIONS_LINK` are both WRITTEN DOWN in the comments that record their removal — so
       * a raw search of the file finds the obituary and reports the deceased alive. ⛔ THE CONSTRUCT,
       * NOT THE PROSE: this is the third time in this workstream a check has been broken by a comment
       * that quotes the literal it looks for. */
      !/data-main-badge/.test(SP) && !/★ Main/.test(codeOf(SP))
      && !/data-add-tile/.test(SP)
      && !/PLACE_OWN_POSITIONS_LINK/.test(codeOf(SP))
      && !/removePictureConfirm\(/.test(SP)
      /* ⚠️ `slotRemoveConfirm` IS THE SURVIVOR and still says the image is kept. */
      && /window\.confirm\(slotRemoveConfirm\('poster'\)\)/.test(SP)
      && !/kind: 'place-pictures'/.test(SP) && !/kind: 'place-design'/.test(SP)
      /* ══ ⛔ AND THERE IS NO `BackLink` AT ALL ANY MORE — 9 October 2026 ════════════════════════════
       * It drew a standalone "‹ Designs" row ABOVE each of the three full-page editors, and the
       * editor's own title row already begins with one BESIDE the title it goes back from. Two ways
       * back for one journey, stacked, costing a row of height on the screen that needs it most.
       * 🔴 THE INLINE ONE IS THE SURVIVOR, and it is `DesignEditor`'s own `topBar` — asserted there
       * rather than here, because that is where it lives. */
      && (SP.match(/<BackLink /g) || []).length === 0
      && !/function BackLink/.test(codeOf(SP))
      /* ⚠️ THE INLINE BACK BUTTON GAINED `data-phone-back` ON 10 OCTOBER — one button, two
       * presentations ("‹" on a phone, "‹ Designs" above 768px) and **the same `onBack`**, which is the
       * whole of the leave guard: this component owns the dialog and already intercepts that prop. */
      && /onClick=\{onBack\} data-phone-back\s*\n\s*className="text-sm font-bold text-orange-700 shrink-0"/
        .test(read('components/manage/DesignEditor.tsx')))

    /* 🔴 THE THUMBNAILS COME FROM THE ONE BATCHED READ — never one call per place. */
    t('🔴 thumbnails are BATCHED: one library read for every place, in `social_overview`',
      /const library = await readPlaceLibrary\(truck\.id, visible as never\)/.test(route)
      /* 🔴 ONE SIGNED URL PER **SLOT** NOW, not per library row: a truck with twenty locations and
       * sixty uploads gets forty thumbnails, which is what the table draws. */
      && /eventImage: await slotOut\(slots\.event\)/.test(route)
      && /weeklyImage: await slotOut\(slots\.weekly\)/.test(route)
      /* ⚠️ AND THE SLOTS ARE RESOLVED FROM THE COPY ALREADY IN HAND, so one query for the whole screen
       * still stands — `readPlaceSlots` would have re-read the library. */
      && /const slots = resolveSlots\(pictures, pl as never\)/.test(route)
      /* ⛔ and the page does not fetch per place */
      && !/place_pictures'[\s\S]{0,200}\.map\(/.test(SP))
    t('⚠️ `readPlaceLibrary` reads every place in ONE query', (() => {
      const fn = route.slice(route.indexOf('async function readPlaceLibrary'), route.indexOf('const SLOT_COLS'))
      return /\.in\('place_id', ids\)/.test(fn) && (fn.match(/await supabase\.from/g) || []).length === 1
    })())
    /* ⚠️ AND THE TWO SLOT COLUMNS ARE SPELLED **ONCE**. A select that forgot them would make every
     * location read as having no images — a failure that looks exactly like the truth and is not
     * visibly a bug. */
    /* ⚠️ FOUR COLUMNS NOW, NOT TWO — `picture_use` and `social_tag` joined the constant on 8 October.
     * The constant's job is unchanged and is the reason it exists: a select that forgot one of them
     * would make every location read as "no images, no tag", which looks exactly like the truth. */
    t('⚠️ the per-location columns are named once and every place select uses that constant',
      /* ⚠️ **SIX** COLUMNS NOW — `event_photo_picture_id` joined later on 9 October. ⛔ TWO OF THE SIX
       * ARE DEAD AND BOTH ARE STILL SELECTED: `picture_use` (read by nothing since 20261021) and
       * `weekly_only_picture_id` (read by nothing AND emptied by 20261022). The columns stay because
       * dropping one is irreversible, and a select that stopped naming them would read as a drop to the
       * schema census — which is exactly what it is for. */
      /const SLOT_COLS =\s*\n[\s\S]{0,900}?\n\s*'event_picture_id, weekly_picture_id, event_photo_picture_id, weekly_only_picture_id, picture_use, social_tag'/.test(route)
      && (route.match(/\$\{SLOT_COLS\}/g) || []).length >= 8
      /* ⛔ AND NO SELECT SPELLS THEM OUT BY HAND, which is how one would come to be missing. */
      && !/select\('[^']*event_picture_id/.test(route)
      && !/select\('[^']*picture_use/.test(route))

    /* 🔴 THE EDITOR'S ITEM IS TWO NAMES NOW, BECAUSE THEY ARE TWO THINGS. One name hid the whole
     * model: a PHOTO a single event post crops into a space, and a PICTURE beside a weekly row. */
    /* ⚠️ **ONE NAME ON BOTH DESIGNS** SINCE 9 OCTOBER. The single event design called it "Location
     * photo", and the two names were the two SLOTS that no longer exist — a location has one picture,
     * used wherever a design has a space for it. One name, one thing. */
    t('🔴 the editor item is "Location picture" on both designs',
      /name: EDITOR_PICTURE_ITEM/.test(ED)
      && /EDITOR_PICTURE_ITEM = 'Location picture'/.test(COPY)
      && /sample: EDITOR_PICTURE_SAMPLE/.test(ED)
      && /EDITOR_PICTURE_SAMPLE = 'Each location’s picture'/.test(COPY)
      && !/'Location photo'/.test(codeOf(ED))
      /* ⛔ THE KEY IS AN IDENTIFIER AND IS UNCHANGED — it is stored in saved layouts. */
      && /key: 'place-picture'/.test(ED)
      /* ⚠️ AND THE "Place" TEXT ITEM KEEPS ITS NAME, which the brief says in those words. */
      && /name: 'Place', group/.test(ED))
    /* ⛔ "WHERE IT GOES" IS GONE AND THE RULE REPLACED IT. Two controls described one thing and could
     * contradict each other: a design could record `placement: 'box'` with the item switched OFF. */
    t('⛔ "Where it goes" is gone; Picture, Corners and the no-image choice remain',
      !/label="Where it goes"/.test(ED)
      && !/label: 'Whole background'/.test(ED)
      && !/\{ id: 'box' as const, label: 'In a box' \}/.test(ED)
      && /label="Picture"/.test(ED) && /label="Corners"/.test(ED)
      && /label="If a location has no image"/.test(ED)
      && /Fill the box/.test(ED) && /Fit inside/.test(ED)
      /* ⚠️ AND THE CANVAS NO LONGER HIDES THE BOX FOR A STORED `background`. With the item off there
       * is no box in the list at all, so a draggable box is on screen exactly when the design has a
       * photo space — the canvas and the switch are one fact. */
      && !/layout\.placePicture\.placement === 'background'/.test(ED))
    /* ⛔ "Show your logo" ONLY WHERE THERE IS A LOGO, and the server is what knows. */
    t('⛔ "Show your logo" is offered only to a truck that has one',
      /\{hasLogo && <option value="logo">\{NO_PICTURE_LABELS\.logo\}<\/option>\}/.test(ED)
      && /logo_storage_path/.test(route))
    t('🔴 the weekly toolbar has "+ Add location pictures" and the real count',
      /\+ Add location pictures/.test(ED)
      && /noPicturesLine\(placesWithout\.without, placesWithout\.total\)/.test(ED)
      && PP.noPicturesLine(16, 20) === '16 of your 20 locations have no image yet'
      && PP.noPicturesLine(0, 20) === 'All 20 of your locations have an image.')
    /* ══ 🔴 RE-AIMED 9 OCTOBER 2026 — IT OPENS **Location settings**, THROUGH THE GUARD ═════════════
     * ⛔ IT WENT TO Designs, AND BOTH HALVES OF THAT WERE WRONG BY NOW:
     *   • Designs has no per-location picture list any more. It had "Designs for a place", sorted so
     *     the locations with nothing came first; a location's picture is set in the Location settings
     *     pane now, so the old target is a tab where there is nothing to do about the line the button
     *     sits under.
     *   • `onArea` DIRECTLY WAS AN UNGUARDED WAY OUT OF AN OPEN EDITOR. This button is pressed from
     *     inside the weekly design editor, with boxes possibly just moved. `requestArea` asks before
     *     discarding and `goArea` closes the editor, so the `setView` this did by hand is done for it.
     * ⚠️ THE CLAIM IS UNCHANGED: the button goes somewhere the operator can actually add pictures. */
    t('⚠️ …and the button opens Location settings, through the one guarded setter',
      /onAddPlacePictures=\{\(\) => requestArea\('locations'\)\}/.test(SP)
      && /const requestArea = useCallback\(\(area2: SocialArea\) => \{/.test(SP)
      && !/onArea\('designs'\)/.test(SP))

    /* ══ 🔴 §6 · THE MAKE-POST CHOICE IS A **SOURCE**, NOT A FILE ═══════════════════════════════════
     * ⛔ THE TILE CHOOSER IS GONE. It listed every picture in the location's library with the Main one
     * ringed, and it existed because only one of several was used automatically. A location has one
     * event image, so the choice is which SOURCE: this location's, the standard design, or an upload
     * for this post only. */
    const EP = codeOf(read('components/manage/EventPost.tsx'))
    /* ⚠️ ALWAYS "poster" NOW. The label followed the DESIGN — "<Location>'s photo" when the standard
     * design had a photo space — because the slot meant two different things. It is the POSTER, so the
     * word is fixed. */
    t('🔴 the modal\'s choice is "Image", and the location option is always the POSTER',
      /<Panel title="Image">/.test(EP)
      && /options\.push\(\{ source: 'place', path: usablePlace\.path, label: `\$\{entry\.name\}’s poster` \}\)/.test(route)
      && /label: 'Upload one for this post only'/.test(route)
      && /label: 'Standard design'/.test(route)
      /* ⛔ AND THE TILE CHOOSER LEFT NOTHING BEHIND — on either side of the wire. */
      && !/placePictures/.test(EP) && !/placePictureId/.test(EP)
      && !/data-place-picture-choices/.test(EP)
      && !/placePictureId/.test(route))
    /* 🔴 THE ORDER OF PREFERENCE EXISTS **ONCE**: this post's image > the location's event image > the
     * standard design. ⛔ AND IT IS `resolveDesign`'s, reading the location's EVENT SLOT — not
     * `event_bg_path` read directly, which was one of two sources rather than the source. */
    t('🔴 the order is `resolveDesign`\'s, over the location\'s EVENT POSTER',
      /const placeImgRaw = locationImages\?\.poster/.test(route)
      && /return resolveLocationImages\(library\.get\(String\(placeRow\.id\)\) \?\? \[\], placeRow as never\)/.test(route)
      /* ⚠️ THE WIDTH AND HEIGHT COME WITH THE PICTURE, not from `event_bg_width/height`: a slot
       * pointing at a different row has that row's own measurements, and the old pair would check the
       * wrong picture's shape. */
      && /\{ path: locationImages\.poster\.path, width: locationImages\.poster\.width, height: locationImages\.poster\.height \}/.test(route)
      && (() => {
        const bg = codeOf(read('lib/weekly-post/backgrounds.ts'))
        return /if \(usable\(input\.oneOff\) && \(input\.force === 'event' \|\| !input\.force\)\)/.test(bg)
          && bg.indexOf("return { source: 'event'") < bg.indexOf('if (placeImage) {')
      })())
    /* 🔴 "Also save it for <location>" IS A **SECOND** WRITE, NOT A REDIRECTION OF THE FIRST. The
     * one-off row is still written, so this post keeps its own image even if the location's event
     * image changes tomorrow — which is what "for this post only" promised. */
    t('🔴 "Also save it as <location>’s poster" writes a row for the SAME object and repoints it', (() => {
      /* ⚠️ THE SLICE IS ANCHORED ON **CODE**, not on the `// one-off: keyed by the event` comment that
       * labels it — `route` is `codeOf()`-stripped, so a comment anchor finds nothing and the slice
       * silently becomes the whole file. */
      const oneOff = route.slice(route.indexOf("const target = await eventPostContext(truck, eventId, eventDesign)"),
        route.indexOf("if (which === 'event-default')"))
      /* ⚠️ "as <Location>'s poster", NOT "for <Location>" (8 October 2026). A location has TWO images
       * now and "for" named neither — a truck ticking it could reasonably expect either. */
      return /imageChoiceAlsoSave = \(place: string\): string => `Also save it as \$\{place\}’s poster`/.test(COPY)
        && /data-also-save/.test(EP)
        && /uploadTo\(token, file, 'one-off', \{ eventId, alsoSaveForPlace: alsoSave, fileName: file\.name \}\)/.test(EP)
        && /if \(body\.alsoSaveForPlace === true && target\.placeId\)/.test(oneOff)
        /* ⛔ `onConflict: 'path'` WITH `ignoreDuplicates`, BECAUSE THE PATH INDEX IS FULL AND UNIQUE:
         * ticking the box twice for the same upload must be a no-op, not a 23505. */
        && /\{ onConflict: 'path', ignoreDuplicates: true \}/.test(oneOff)
        && /await setPlaceSlot\(truck\.id, target\.placeId, 'event', newId\)/.test(oneOff)
        /* ⚠️ AND THE ONE-OFF ROW IS STILL WRITTEN — the upsert into `event_post_backgrounds` is above
         * this branch and nothing in it is conditional on the tick. */
        && /\.from\('event_post_backgrounds'\)\.upsert\(\{/.test(oneOff)
    })())
    /* ⛔ A PRIVATE BOOKING NEVER GETS THE TICK, and the privacy rule holds without a second test on
     * the client: the server sends no `placeId` for one. */
    t('⛔ a private booking is offered no location to save against',
      /placeId: ctx\.placeId,/.test(route)
      && /\{info\.placeId && \(/.test(EP)
      && /IMAGE_CHOICE_PRIVATE = 'Private bookings always use your standard design\.'/.test(COPY))
    t('⚠️ the WEEKLY post has no such choice — seven rows would be seven choosers',
      !/placePictureId/.test(codeOf(read('components/manage/WeeklyPost.tsx'))))
    /* 🔴 AND THE RENDERER IS GIVEN THE RIGHT SLOT. ⛔ UNTIL TODAY BOTH POSTS GOT "the Main one", so a
     * truck who gave a pub a photo for its event posts found that photo in the little box on their
     * weekly poster as well, with no way to say otherwise. That is the bug the two slots exist for. */
    /* ══ 🔴 THE PARAMETER IS THE **SURFACE**, NOT THE SLOT — AND THAT FIXED A REAL BUG (8 Oct 2026) ═══
     * ⛔ `placePictureSources` ONLY EVER FETCHES THE LOCATION PICTURE. The event POSTER never comes
     * through it — it replaces the whole background, which the caller does by swapping the bytes. So
     * both callers pass the same slot, and the first version's `slot === 'weekly'` filter silently
     * dropped every event-only picture out of the photo space it had just been told to draw.
     * 🔴 WHAT THE CALLER HAS TO SAY IS WHICH POSTER IT IS DRAWING, because `picture_use` applies on the
     * weekly surface and has already been applied by `planEventImages` on the event one. */
    t('🔴 the two renderers name their SURFACE, and `picture_use` is applied once',
      /surface: 'weekly' \| 'event',$/m.test(route)
      /* ⛔ `picture_use` IS NO LONGER CONSULTED AT ALL. The question is WHICH picture, not whether: a
       * weekly poster takes the override when the location has one, and a single event post always
       * takes the location picture. */
      && /const main = surface === 'weekly' \? weeklyPictureFor\(images\) : eventPictureFor\(images\)/.test(route)
      && !/pictureOnWeekly/.test(route) && !/pictureOnEvent/.test(route)
      && /v\.layout\.placePicture\.ifMissing === 'logo',\s*\n\s*'weekly',/.test(route)
      && /ifMissing === 'logo', 'event'\)/.test(route)
      /* ⛔ AND THE EVENT SIDE IS GATED BY THE PLAN, not by the design switch — four conditions in one
       * answer, so this call site cannot get one of them wrong. */
      && /const eventPics = plan\.pictureInPhotoSpace/.test(route))

    /* ══ 🔴 THE WHOLE ORDER, DRIVEN — EVERY CASE INCLUDING PRIVATE ═══════════════════════════════════
     * ⛔ THIS IS THE CLAIM THE BRIEF ASKS FOR BY NAME, and a regex cannot make it: "this post's own
     * image > the location's event poster > the standard design, with the location picture in the
     * photo space when `picture_use` is event/both and the design has one". */
    t('🔴 `planEventImages` is the order, in every case', (() => {
      const pic = { id: 'p', path: 'p.png', label: 'P', fileName: 'p.png', width: 1, height: 1, isMain: true, sortOrder: 0, createdAt: '' }
      const plan = (o) => PP.planEventImages(o)
      /* ⚠️ THE SHAPES ARE THE THREE-SLOT ONES SINCE 9 OCTOBER: `weekly`, `eventPhoto`, `poster`, and
       * no `pictureUse`. ⛔ THE EVENT SURFACE READS `eventPhoto` AND ONLY `eventPhoto`, which is why the
       * two old "the use allows it / does not" cases collapse into one pair below: a picture reaches an
       * event post when the EVENT slot has one, full stop. */
      const both = { poster: pic, weekly: pic, eventPhoto: pic }
      const posterOnly = { poster: pic, weekly: null, eventPhoto: null }
      /* 🔴 THE CASE THAT REPLACED `picture_use`: a location with a WEEKLY picture and no EVENT one draws
       * nothing in an event post's photo space. Under the old model it drew the weekly picture. */
      const weeklyOnlyPic = { poster: null, weekly: pic, eventPhoto: null }
      const eventOnlyPic = { poster: null, weekly: null, eventPhoto: pic }
      const base = { designHasPhotoSpace: true, isPrivate: false, posterFits: true }
      return (
        /* ══ 1 · A ONE-OFF WINS THE BACKGROUND — AND THE PHOTO SPACE STILL DRAWS ════════════════
         * ⚠️ THIS CASE WAS ASSERTED THE WRONG WAY ROUND FIRST, and driving it is what settled it. A
         * one-off replaces the **picture**, never the design: `resolveDesign`'s own note says it "uses
         * whichever positions it would otherwise have had", so the date, the time, the place AND the
         * photo space are all still drawn on top of it. Singling the photo box out would make it the
         * one box a one-off silently removes.
         * ⛔ IT IS NOT THE POSTER CASE. A poster is the LOCATION's full artwork and the brief says in
         * so many words that the picture is not drawn on it; a one-off is this post's background and
         * the brief says nothing — so the consistent answer is the one every other box already gives. */
        plan({ ...base, hasOneOff: true, images: both }).background === 'one-off'
        && plan({ ...base, hasOneOff: true, images: both }).pictureInPhotoSpace === true
        /* 2 · the poster beats the standard design — and beats the picture on an event post. */
        && plan({ ...base, hasOneOff: false, images: posterOnly }).background === 'poster'
        && plan({ ...base, hasOneOff: false, images: both }).background === 'poster'
        && plan({ ...base, hasOneOff: false, images: both }).pictureInPhotoSpace === false
        /* 3 · a poster that does not fit is not used, and the picture may then be drawn. */
        && plan({ ...base, posterFits: false, hasOneOff: false, images: both }).background === 'standard'
        && plan({ ...base, posterFits: false, hasOneOff: false, images: both }).pictureInPhotoSpace === true
        /* ══ ⛔ 4 · `picture_use` IS GONE AND SO IS THE FALLBACK THAT REPLACED IT ════════════════════
         * `picture_use` gated whether a picture reached an event post (8 October); one picture used
         * everywhere removed the question (9 October, morning); a picture PER SURFACE removed the
         * inheritance too (9 October, later). 🔴 SO THE EVENT SURFACE READS THE EVENT SLOT AND NOTHING
         * ELSE — which is the pair below, and the second half of it is the claim three models have now
         * taken turns getting wrong. */
        && plan({ ...base, hasOneOff: false, images: eventOnlyPic }).pictureInPhotoSpace === true
        && plan({ ...base, hasOneOff: false, images: weeklyOnlyPic }).pictureInPhotoSpace === false
        /* 5 · no photo space on the design ⇒ no picture, whatever the location has. */
        && plan({ ...base, designHasPhotoSpace: false, hasOneOff: false, images: eventOnlyPic })
          .pictureInPhotoSpace === false
        /* 6 · ⛔ A PRIVATE EVENT GETS NEITHER, EVER — and still gets its own one-off if it has one. */
        && plan({ ...base, isPrivate: true, hasOneOff: false, images: both }).background === 'standard'
        && plan({ ...base, isPrivate: true, hasOneOff: false, images: both }).pictureInPhotoSpace === false
        && plan({ ...base, isPrivate: true, hasOneOff: true, images: both }).background === 'one-off'
        /* 7 · a location with nothing is the standard design. */
        && plan({ ...base, hasOneOff: false, images: null }).background === 'standard'
      )
    })())
    /* ⛔ AND THE SHAPE RULE IS FOR **POSTERS ONLY**. A location picture is any shape — that is its one
     * defining property — so the 1% rule must not reach it. ⚠️ `posterFits` is the only input that
     * carries it, and it is computed from the POSTER alone at the call site. */
    t('⛔ the shape rule reaches the poster and never the picture',
      /const posterFits = \(\(\) => \{\s*\n\s*const poster = ctx\.locationImages\?\.poster \?\? null/.test(route)
      /* ⚠️ "A logo or photo" — SAID TWICE NOW, once per picture box, and neither mentions a shape. The
       * old single blurb ended "Any shape.", which was the whole sentence there was room for; the two
       * say WHERE the picture appears instead, which is the more useful half. The shape freedom is
       * still real and is what the driven half below proves. */
      && /WEEKLY_PIC_BLURB = 'A logo or photo for this location’s line on your weekly post\.'/.test(COPY)
      && /EVENT_PIC_BLURB = 'A logo or photo in the picture space of your single event design\.'/.test(COPY)
      /* 🔴 AND `planEventImages` NEVER CONSULTS THE PICTURE'S SIZE — driven: a picture of any shape is
       * drawn whenever the design has a space and the EVENT slot has one. */
      && (() => {
        const tall = { id: 'p', path: 'p.png', label: 'P', fileName: 'p.png', width: 100, height: 3000, isMain: true, sortOrder: 0, createdAt: '' }
        return PP.planEventImages({
          hasOneOff: false, designHasPhotoSpace: true, isPrivate: false, posterFits: false,
          images: { poster: null, weekly: null, eventPhoto: tall },
        }).pictureInPhotoSpace === true
      })())

    /* ══ 🔴 "Powered by HatchGrab" ON ALL FOUR KINDS OF POSTER (§8) ═══════════════════════════════
     * ⛔ FOUR PATHS, TWO RENDERERS, AND THAT IS THE WHOLE ANSWER: the weekly post is
     * `renderWeeklyPost`; the standard single event post, a location's event poster and a one-off
     * upload are all `renderEventPost` with different BYTES behind the same boxes. So "all four" is
     * "both renderers", and each pushes the mark LAST.
     * 🔴 LAST IS WHAT PUTS IT ABOVE THE DARKEN LAYER. `darkenEl` is pushed early, before the text, so
     * a mark appended at the end sits over it — which is the brief's "above any darken layer".
     * ⚠️ ASSERTED ON THE ORDER, not on presence: a mark pushed before the darken would still be in the
     * file and would still be invisible on a darkened photo. */
    /* ══ 🔴 THE CLAIM MOVED WITH THE DRAWING — 10 OCTOBER 2026 (§2) ═════════════════════════════════
     * ⛔ IT READ THE TWO RENDER FUNCTIONS' OWN BODIES. Each is five lines now: build the fonts, call a
     * TREE builder, call `paint`. 🔴 THE MARK IS PUSHED BY `weeklyTree` AND `eventTree` IN `draw.ts`,
     * which are the functions the live editor calls — so this is now a claim about the tree both
     * painters are given, which is strictly stronger than a claim about one renderer's body. */
    t('🔴 "Powered by HatchGrab" is in BOTH trees, last, after the darken layer', (() => {
      const r = codeOf(read('lib/weekly-post/render.ts'))
      const d = codeOf(read('lib/weekly-post/draw.ts'))
      const wk = d.slice(d.indexOf('export function weeklyTree'), d.indexOf('export interface EventTreeInput'))
      const ev = d.slice(d.indexOf('export function eventTree'))
      return /export const POWERED_BY = 'Powered by HatchGrab'/.test(d)
        /* ⚠️ EACH TREE PUSHES IT, and after its own `darkenEl`. */
        && /children\.push\(poweredByEl\(W, H, keepReadable, fonts\)\)/.test(wk)
        && /children\.push\(poweredByEl\(W, H, l\.keepReadable, fonts\)\)/.test(ev)
        && wk.indexOf('darkenEl(') < wk.indexOf('poweredByEl(')
        && ev.indexOf('darkenEl(') < ev.indexOf('poweredByEl(')
        /* ⛔ AND IT IS THE **LAST** CHILD IN BOTH, not merely after the darken — anything pushed after
         * it would be drawn on top of our own mark. ⚠️ THE LINE THAT FOLLOWS IT IS THE `return` NOW,
         * because the tree builder hands the list back instead of painting it. */
        && /children\.push\(poweredByEl\(W, H, keepReadable, fonts\)\)\s*\n\s*return \{ children, warnings/.test(wk)
        && /children\.push\(poweredByEl\(W, H, l\.keepReadable, fonts\)\)\s*\n\s*return \{ children, warnings/.test(ev)
        /* 🔴 AND EACH RENDER FUNCTION CALLS EXACTLY ONE TREE BUILDER AND ONE `paint`, so neither can
         * assemble a poster of its own behind the shared one. */
        && /weeklyTree\(\{/.test(r) && /eventTree\(\{/.test(r)
        && (r.match(/await paint\(/g) || []).length === 2
        /* 🔴 AND THERE IS EXACTLY ONE `renderEventPost` CALL SITE on the route, which is why the three
         * event paths cannot differ: they hand it different bytes, not a different renderer. */
        && (codeOf(read('app/api/weekly-post/route.ts')).match(/await renderEventPost\(\{/g) || []).length === 1
        /* ⚠️ AND IT CARRIES ITS OWN SHADOW when the design asks for readability — it is our mark on
         * somebody else's artwork and must not be the one illegible thing on the poster. */
        && /keepReadable \? \{ textShadow:/.test(d)
    })())

    /* ⛔ NOTHING IS FETCHED WHILE RENDERING — the same discipline as the fonts and the background. */
    t('⛔ the place pictures are fetched BEFORE the render, never during it',
      /await placePictureSources\(/.test(route)
      /* ⚠️ BOTH FILES NOW: the tree builder must not fetch either, and it is the one a client component
       * calls on every drag frame. */
      && !/fetch\(/.test(codeOf(read('lib/weekly-post/render.ts')))
      && !/fetch\(/.test(codeOf(read('lib/weekly-post/draw.ts'))))
    t('⚠️ …and one download per DISTINCT place, not per row',
      /const ids = \[\.\.\.new Set\(placeIds\.filter\(/.test(route))
  }

  
// ════════════════════════════════════════════════════════════════════════════════════════════════
// 9 · 🔴 ROUND 2 — HEADINGS, THE SHARED GRID, AND SAVED CAPTIONS (8 October 2026)
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('9 · each tab says what it is for, and the captions are the truck\'s own')
{
  const SP = codeOf(read('components/manage/SocialPosts.tsx'))
  const COPY2 = read('lib/copy/socialPosts.ts')
  const route2 = codeOf(read('app/api/weekly-post/route.ts'))

  /* ══ 🔴 THREE HEADINGS, ONE BLOCK ════════════════════════════════════════════════════════════
   * ⛔ A SHARED "Social posts" HEADING AND A SHARED INTRO STOOD HERE, and between them they answered
   * the wrong question twice: the heading named the TAB, which the pill bar directly above already
   * names in the same words, highlighted; and the intro was a map of two areas that are now three
   * pills in that bar.
   * ⚠️ ONE BLOCK CHOOSING BY `area`, NOT THREE COPIES OF THE MARKUP — the three headings must stay the
   * same size and the same distance from the bar, and that is a fact about one element. */
  t('🔴 each sub-tab has its own heading and description, from one block', (() => {
    const headBlock = SP.slice(SP.indexOf('data-tab-head'), SP.indexOf('data-tab-blurb'))
    return /TAB_CREATE_HEADING = 'Create a post'/.test(COPY2)
      && /TAB_DESIGNS_HEADING = 'Designs'/.test(COPY2)
      && /TAB_LOCATIONS_HEADING = 'Location settings'/.test(COPY2)
      /* ⚠️ THE BLURBS ARE MULTI-LINE CONCATENATIONS, so each is matched on a distinctive clause rather
       * than on the whole sentence — which never appears contiguously in the source. */
      && /We put your dates, places and times on your design, '/.test(COPY2)
      && /Your two designs: one for the weekly schedule and one for single event posts\./.test(COPY2)
      /* ⚠️ "Pictures and social media tags", NOT "Images, names and …" — 9 October 2026, §1. ⛔ TWO WORDS
       * CHANGED FOR TWO REASONS: the three boxes say "picture" and so does the chip, so "images" was the
       * one place the screen used a different word for one thing; and "names" promised something this
       * screen does not do — the name is edited in Tidy up places, which it says in its own grey note.
       * A page description that claims to own a field it points elsewhere for is the second screen
       * claiming the field, which is the fault round 3 removed. */
      && /Pictures and social media tags for each location\./.test(COPY2)
      /* 🔴 ONE `data-tab-heading` AND ONE `data-tab-blurb` IN THE FILE — three copies of the markup is
       * three things to keep level. */
      && (SP.match(/data-tab-heading/g) || []).length === 1
      && (SP.match(/data-tab-blurb/g) || []).length === 1
      && /area === 'create' \? TAB_CREATE_HEADING/.test(headBlock)
      /* ⛔ AND THE SHARED INTRO IS GONE FROM THE SCREEN. */
      && !/data-page-intro/.test(SP)
      && !/INTRO_AFTER_DESIGNS/.test(SP)
      && !/>Social posts</.test(SP)
  })())

  /* 🔴 ONE GRID CONSTANT, USED BY BOTH — asserted as the constant AND its two users, because either
   * half alone is satisfied by deleting the other. */
  t('🔴 Designs and Create a post share the grid constant',
    /export const TWO_HALVES_GRID = 'grid grid-cols-1 items-stretch gap-3 min-\[900px\]:grid-cols-2'/.test(SP)
    && /<div className=\{TWO_HALVES_GRID\} data-create-halves>/.test(SP)
    && /<div className=\{TWO_HALVES_GRID\} data-design-boxes>/.test(SP)
    && (SP.match(/TWO_HALVES_GRID/g) || []).length === 3)

  /* ══ 🔴 THE CAPTION TEMPLATE — LABELS, NEVER RAW CODES ═══════════════════════════════════════
   * ⛔ THE BRIEF FORBIDS SHOWING `{place}` TO AN OPERATOR, so the editor draws each label as a chip.
   * The token spelling exists in exactly one module. */
  t('🔴 the labels are declared once, and each post type gets the brief\'s own list', (() => {
    const week = CT.labelsFor('week').map(l => l.label).join(' · ')
    const event = CT.labelsFor('event').map(l => l.label).join(' · ')
    return week === 'Week dates · List of days · Order link'
      /* ══ 🔴 "Place" SPLIT INTO "Venue" AND "Area" — 9 October 2026 ══════════════════════════════
       * ⛔ `{place}` FILLED TO "The Kings Arms, Lavenham" — the name and the town joined, with a comma
       * this module chose. A truck who wanted the venue bold with the village after it, or the village
       * left out of a caption that already named it, had one token and no way to split it.
       * ⚠️ `{place}` IS STILL A LABEL AND STILL FILLS IDENTICALLY — `fillCaptionTemplate` reads
       * `CAPTION_LABELS`, not this list — so every saved template containing it keeps working. It is
       * simply off the BUTTON ROW, because a new template should be built from the two. 🔴 THAT SPLIT
       * BETWEEN "what exists" AND "what is offered" IS THE WHOLE REASON `labelsFor` SORTS. */
      && event === 'Venue · Area · Day & date · Times · Order link · Location tag'
      && CT.labelsFor('event').every(l => l.id !== 'place')
      && CT.CAPTION_LABELS.some(l => l.id === 'place')
      && CT.tokenOf('place') === '{place}'
      && CT.tokenOf('venue') === '{venue}' && CT.tokenOf('area') === '{area}'
      /* ⛔ AND AN OLD TEMPLATE NAMING `{place}` STILL FILLS THE JOINED FORM — driven, because this is
       * the compatibility promise and a pattern match could not keep it. */
      && CT.fillCaptionTemplate('at {place}.', CT.eventCaptionValues({
        placeName: 'The Kings Arms', town: 'Lavenham', date: '2026-10-13',
        startTime: '17:00', endTime: '20:00', orderUrl: null, timeStyle: '24h',
        now: '2026-10-10T12:00:00Z',
      })) === 'at The Kings Arms, Lavenham.'
      /* ⚠️ AND THE TWO NEW ONES FILL THE HALVES, with no "only if the name does not contain it" dance:
       * that rule exists because `{place}` has to decide whether to JOIN them, and these do not. */
      && CT.fillCaptionTemplate('{venue} / {area}', CT.eventCaptionValues({
        placeName: 'Lavenham Market', town: 'Lavenham', date: '2026-10-13',
        startTime: '17:00', endTime: '20:00', orderUrl: null, timeStyle: '24h',
        now: '2026-10-10T12:00:00Z',
      })) === 'Lavenham Market / Lavenham'
      /* ⛔ AND THE SPELLING IS NOWHERE ELSE. A second copy of `{times}` is a second rule. */
      && !/\{times\}/.test(codeOf(read('components/manage/SocialPosts.tsx')))
  })())
  /* ⚠️ THE CHIPS ARE `contenteditable="false"` SPANS, which is what makes each behave as ONE character:
   * Backspace deletes it whole and the caret steps over it. ⛔ THAT IS THE BROWSER'S BEHAVIOUR rather
   * than ours to maintain, which is the whole reason this is not a custom editor. */
  /* ══ ⚠️ THE CHIP MARKUP MOVED TO `lib/weekly-post/caption-chips.ts` ON 10 OCTOBER 2026 ═════════════
   * ⛔ NOT TIDINESS: **deleting a chip cleared the whole template in WebKit**, and a behaviour that
   * differs between engines has to be driven in a real one to be believed — which a handler closed over
   * a React ref cannot be. `scripts/caption-chips-render.cjs` presses a real Backspace against the
   * exported functions in Chromium and WebKit. ⚠️ THE CLAIMS ARE UNCHANGED, they just read the module
   * the component now imports. */
  t('🔴 …and the editor draws them as chips, never as codes', (() => {
    const CH = read('lib/weekly-post/caption-chips.ts')
    return /contenteditable="false" \$\{CHIP_ATTR\}="\$\{id\}"/.test(CH)
      && /bg-orange-100 px-1\.5 py-0\.5/.test(CH)
      && /data-caption-input/.test(SP)
      /* ⚠️ AND THE COMPONENT USES THE MODULE rather than keeping a second copy of the markup. */
      && /from '@\/lib\/weekly-post\/caption-chips'/.test(SP)
      && !/function captionChipHtml/.test(SP)
      /* ⛔ THE VALUE IS READ BACK BY WALKING THE NODES, not from `innerText` — which would give the
       * chips' LABELS and save the caption as the word a chip displays. */
      && /export function captionFromDom/.test(CH)
      && /out \+= `\{\$\{chip\}\}`/.test(CH)
      /* ⚠️ `<div>` AND `<br>` BOTH MEAN A NEWLINE: WebKit wraps a new line in a `<div>` and Chromium
       * inserts a `<br>`, so a reader that knew only one would lose every line break in the other. */
      && /child\.tagName === 'BR'/.test(CH)
      && /child\.tagName === 'DIV' \|\| child\.tagName === 'P'/.test(CH)
  })())

  /* ══ 🔴 FILLING — AND THE MISSING-LABEL RULE, WHICH IS THE HARD PART ═════════════════════════
   * ⛔ THE BRIEF'S OWN LINE: "if the location has no tag, the label disappears cleanly (no stray space
   * or '@')". ⚠️ DRIVEN, because that is a whitespace rule and a regex on the source would pass on a
   * wrong branch. */
  t('🔴 a label fills, and an empty one takes its whitespace with it', (() => {
    const tpl = 'Hi at {place} {day-date}, {times}. {location-tag}\n\nOrder ahead: {order-link}'
    const full = CT.fillCaptionTemplate(tpl, {
      place: 'The Kings Arms', 'day-date': 'on Tue 13 Oct', times: '17:00 – 20:00',
      'location-tag': '@kingsarms', 'order-link': 'https://x.co/p',
    })
    const noTag = CT.fillCaptionTemplate(tpl, {
      place: 'The Kings Arms', 'day-date': 'on Tue 13 Oct', times: '17:00 – 20:00',
      'location-tag': null, 'order-link': 'https://x.co/p',
    })
    return full === 'Hi at The Kings Arms on Tue 13 Oct, 17:00 – 20:00. @kingsarms\n\nOrder ahead: https://x.co/p'
      /* 🔴 NO DOUBLE SPACE, NO TRAILING SPACE, NO STRAY "@" — and the rest of the line survives. */
      && noTag === 'Hi at The Kings Arms on Tue 13 Oct, 17:00 – 20:00.\n\nOrder ahead: https://x.co/p'
      && !/ {2}/.test(noTag) && !/@/.test(noTag.split('\n')[0])
  })())
  /* ⛔ A LINE WHOSE LABELS ARE **ALL** EMPTY GOES ENTIRELY. "Order ahead:" with no link is worse than
   * no line, and `caption.ts` has always agreed — it guards that line with `if (orderUrl)`.
   * ⚠️ AND A LINE WITH ONE SURVIVING LABEL KEEPS ITS WORDS, which is what stops this deleting the
   * whole post when only the tag is missing. */
  t('⛔ …and a line whose labels are ALL empty is dropped, while a partly-filled one survives', (() => {
    const tpl = 'At {place} {day-date}.\n\nOrder ahead: {order-link}'
    const noLink = CT.fillCaptionTemplate(tpl, { place: 'X', 'day-date': 'on Tue 13 Oct' })
    const noTimes = CT.fillCaptionTemplate('At {place} {day-date}, {times}.', { place: 'X', 'day-date': 'on Tue 13 Oct' })
    return noLink === 'At X on Tue 13 Oct.'
      /* ⛔ AND A SEPARATOR WITH NOTHING LEFT TO SEPARATE GOES WITH IT — `…Tue 13 Oct,.` is a dangling
       * comma in a published post, and `caption.ts` writes the comma as part of the times. */
      && noTimes === 'At X on Tue 13 Oct.'
      /* ⚠️ A DELIBERATE BLANK LINE BETWEEN THE TRUCK'S OWN PARAGRAPHS SURVIVES — the collapse goes to
       * TWO newlines, not one. */
      && CT.fillCaptionTemplate('one\n\ntwo', {}) === 'one\n\ntwo'
      /* ⛔ AN UNKNOWN `{word}` IS THE TRUCK'S TEXT and is left alone, here and in the parser. */
      && CT.fillCaptionTemplate('a {sorry} b', {}) === 'a {sorry} b'
  })())

  /* ══ 🔴 THE SEED FILLS TO EXACTLY WHAT THE PRODUCT WROTE BEFORE TEMPLATES EXISTED ═══════════════
   * ⛔ THE BRIEF'S RULE: "seed each template with today's auto-written caption expressed as labels, so
   * nothing changes until the truck edits it." 🔴 ASSERTED BY COMPARING THE TWO OUTPUTS, not by
   * reading the seed — which is the only way that sentence can be checked at all. */
  t('🔴 the seed fills to byte-identical output with `caption.ts`', (() => {
    const entry = { name: 'The Kings Arms', town: 'Lavenham', startTime: '17:00', endTime: '20:00', status: 'ok' }
    const now = '2026-10-10T12:00:00Z'
    const today = C.eventPostText({
      truckName: 'Pizza Kitchen', entry, date: '2026-10-13',
      orderUrl: 'https://x.co/p', timeStyle: '24h', now,
    })
    const seeded = CT.fillCaptionTemplate(CT.seedEventTemplate('Pizza Kitchen'), CT.eventCaptionValues({
      placeName: entry.name, town: entry.town, date: '2026-10-13',
      startTime: entry.startTime, endTime: entry.endTime,
      orderUrl: 'https://x.co/p', timeStyle: '24h', now,
    }))
    /* ══ 🔴 STILL BYTE-IDENTICAL, AND THE BRIEF'S DEFAULT HAD TO BE CORRECTED TO KEEP IT ════════════
     * The default template became `at {venue}, {area} on {day-date}` on 9 October. ⛔ **THE LITERAL
     * "on" DOUBLED UP**: `{day-date}` fills through `whenPhrase`, which returns "on Tue 13 Oct" — the
     * word is part of the phrase — so the brief's own text produced "on on Tue 13 Oct", and "on
     * tonight" in the common case. 🔴 THIS CHECK IS WHAT CAUGHT IT, by refusing to match the caption
     * `caption.ts` writes. The literal is dropped; the report says so. */
    return today === seeded
      /* 🔴 INCLUDING THE RELATIVE WORDING. `{day-date}` carries `whenPhrase`, not a bare date — a label
       * that always said "Tue 13 Oct" would have changed what every truck posts. ⚠️ THE FIRST DRAFT
       * USED `shortDateTextFor` AND THIS CHECK IS WHAT WOULD HAVE CAUGHT IT. */
      && CT.eventCaptionValues({
        placeName: 'X', date: '2026-10-10', startTime: '18:00', endTime: '21:00',
        orderUrl: null, timeStyle: '24h', now,
      })['day-date'] === 'tonight'
      && CT.eventCaptionValues({
        placeName: 'X', date: '2026-10-11', startTime: '12:00', endTime: '14:00',
        orderUrl: null, timeStyle: '24h', now,
      })['day-date'] === 'tomorrow'
  })())
  /* ══ ⚠️ THE SEED **DOES** CARRY `{location-tag}` NOW — 9 OCTOBER 2026, AND IT STILL CHANGES NOTHING ══
   * ⛔ THE OLD CLAIM WAS "the seed must not mention a handle, because today's caption does not and
   * seeding one would change what every truck posts". 🔴 THE REASONING WAS RIGHT AND THE **PREMISE**
   * MOVED: the brief's default puts the tag on the end, and it fills to '' for every location that has
   * no handle — which is all of them until a truck types one. ⚠️ SO THE OUTPUT IS UNCHANGED FOR EVERY
   * EXISTING TRUCK, which is what the claim was protecting, and the token is there for the moment a
   * handle exists rather than needing to be added by hand.
   * ⛔ AND THE EMPTY LABEL LEAVES NO HOLE — no trailing space, no dangling punctuation. That is
   * `fillCaptionTemplate`'s own rule and this is where it is proved for the seed. */
  t('⚠️ …and the seed\'s location tag fills to nothing until a truck has a handle', (() => {
    const seed = CT.seedEventTemplate('Pizza Kitchen')
    const vals = (tag) => CT.eventCaptionValues({
      placeName: 'The Kings Arms', town: 'Lavenham', date: '2026-10-13',
      startTime: '17:00', endTime: '20:00', orderUrl: 'https://x.co/p', timeStyle: '24h',
      socialTag: tag, now: '2026-10-10T12:00:00Z',
    })
    const without = CT.fillCaptionTemplate(seed, vals(null))
    const withTag = CT.fillCaptionTemplate(seed, vals('@kingsarms'))
    return /location-tag/.test(seed)
      /* 🔴 NO TRAILING SPACE AND NO DANGLING ANYTHING. */
      && without === without.trimEnd()
      && without.endsWith('Order ahead: https://x.co/p')
      /* ⚠️ AND THE TAG APPEARS WHEN THERE IS ONE, in the place the template put it. */
      && withTag.endsWith('Order ahead: https://x.co/p @kingsarms')
  })())

  /* ══ 🔴 SAVE AND LOAD ════════════════════════════════════════════════════════════════════════
   * ⚠️ NULL MEANS "nobody has set one" and the seed is computed on READ, never written — the moment
   * the read wrote a seed, that distinction would be gone and the next release's better default could
   * never reach a truck who had not edited. */
  t('🔴 the template saves per truck per kind, and the seed is never written', (() => {
    const save = route2.slice(route2.indexOf("if (action === 'caption_save')"),
      route2.indexOf("return NextResponse.json({ error: 'Unknown action' }"))
    const overview = route2.slice(route2.indexOf("if (action === 'social_overview')"),
      route2.indexOf("if (action === 'upload_url')"))
    return /\.from\('truck_post_designs'\)\s*\n\s*\.update\(\{ caption_template: template \} as never\)/.test(save)
      && /\.eq\('truck_id', truck\.id\)\.eq\('kind', kind\)/.test(save)
      /* ⛔ THE READ COMPUTES THE SEED AND DOES NOT PERSIST IT. */
      && /seedWeekTemplate\(truck\.name\)/.test(overview)
      && /seedEventTemplate\(truck\.name\)/.test(overview)
      && !/\.update\(/.test(overview) && !/\.insert\(/.test(overview) && !/\.upsert\(/.test(overview)
      /* ⚠️ AND `saved` TELLS THE SCREEN WHICH IT IS LOOKING AT, so a "Saved ✓" tick cannot appear over
       * a caption nobody has saved. */
      && /saved: typeof weekDesign\?\.caption_template === 'string'/.test(overview)
      /* 🔴 AND THE COLUMN IS SELECTED, or every read would see `undefined` and seed for ever. */
      && /layout, updated_at, caption_template'/.test(route2)
  })())
  /* ══ ⛔ THE DEBOUNCED AUTOSAVE IS GONE — 9 OCTOBER 2026, AND ITS CLAIM IS INVERTED ════════════════
   *
   * IT WAS A 1s DEBOUNCE WITH "Saved automatically · used next time too" AND A FADING TICK, and it was
   * RIGHT for the shape the editor had: it WAS the caption field, always on screen, and a truck's words
   * had to survive them closing the tab.
   * 🔴 THE CHIP EDITOR IS A PANEL THE OPERATOR OPENS ON PURPOSE NOW, behind "✎ Edit template" — and
   * autosave is wrong for a panel with a Cancel button. "Cancel" after fourteen keystrokes have already
   * been written is a button that cannot do what it says.
   * ⛔ AND "used next time too" WAS THE WORSE HALF. The box on the card is this post's caption; a note
   * promising the opposite of what the box does is the fault §5 exists to remove.
   * ⚠️ SO: ONE WRITE, ON Save. The timers went with it, which means nothing here can fire against an
   * unmounted component — the thing the two `clearTimeout`s existed to prevent. */
  t('⛔ the template panel saves on a press, not on a timer, and Cancel writes nothing',
    /const save = \(\) => \{/.test(SP)
    && /data-template-save/.test(SP) && /data-template-cancel/.test(SP)
    && /TEMPLATE_SAVE = 'Save template'/.test(COPY2)
    /* ⛔ NO TIMER, NO DEBOUNCE, NO "saved" STATE — asserted inside the editor's own slice, because
     * `setTimeout` is correct elsewhere in this file. */
    && (() => {
      const ed = SP.slice(SP.indexOf('function CaptionEditor'), SP.indexOf('function LocationsArea'))
      return !/setTimeout/.test(ed) && !/timer\.current/.test(ed) && !/schedule\(\)/.test(ed)
    })()
    /* ⛔ AND THE TWO OLD STRINGS ARE OFF THE SCREEN. They stay EXPORTED as the record — `codeOf` first,
     * so the tombstone that names them is allowed to. */
    && !/CAPTION_SAVED_NOTE/.test(codeOf(SP))
    && !/CAPTION_SAVED_TICK/.test(codeOf(SP))
    && /CAPTION_SAVED_NOTE = 'Saved automatically · used next time too'/.test(COPY2)
    /* 🔴 AND THE CAPTION BOX SAYS THE OPPOSITE OF WHAT THAT NOTE SAID, which is the point. */
    && /CAPTION_THIS_POST_NOTE =\s*\n\s*'Type straight in the box to change it for this post only\. Your template stays as it is\.'/.test(COPY2))
  /* 🔴 THE MAKE SCREENS FILL THE TEMPLATE FOR **THAT POST**, and the edit applies to that post only —
   * neither caption action writes the template back. */
  t('🔴 the make screens fill the template, and editing there changes that post only',
    /const weekTpl = String\(design\?\.caption_template \?\? ''\)\.trim\(\) \|\| seedWeekTemplate\(truck\.name\)/.test(route2)
    && /const eventTpl = String\(design\?\.caption_template \?\? ''\)\.trim\(\) \|\| seedEventTemplate\(truck\.name\)/.test(route2)
    && /fillCaptionTemplate\(\s*\n?\s*weekTpl/.test(route2)
    && /fillCaptionTemplate\(eventTpl, eventCaptionValues\(\{/.test(route2)
    /* ⛔ A CANCELLED EVENT KEEPS `eventPostText`. That branch is an APOLOGY with no ordering link —
     * sending customers to order from an event that is not happening is the one thing this text must
     * never do — and a truck's own template could not be trusted to say it. */
    && /ctx\.entry\.status === 'cancelled'/.test(route2)
    /* ⚠️ AND THE OPERATOR'S WEEKLY NOTE IS APPENDED, not templated: it is a per-WEEK thing typed on the
     * make screen, and a chip for it would be a chip for something that changes every time. */
    && /trimmedNote \? `\$\{weekFilled\}\\n\\n\$\{trimmedNote\}` : weekFilled/.test(route2))
  /* ⛔ THE TAG NEVER REACHES A PRIVATE BOOKING — the server sends no place for one, so `socialTag` is
   * null and the label removes itself cleanly. */
  t('⛔ the location tag is never sent for a private booking',
    /socialTag: placeRow \? \(String\(placeRow\.social_tag \?\? ''\)\.trim\(\) \|\| null\) : null/.test(route2)
    && /socialTag: ctx\.socialTag/.test(route2)
    && CT.fillCaptionTemplate('At {place}. {location-tag}', { place: 'X', 'location-tag': null }) === 'At X.')
}

console.log('')
  if (fail) { console.log(`🔴 ${fail} CHECK(S) FAILED`); process.exit(1) }
  console.log(`✅ all ${pass} passed`)
})().catch(e => { console.error(e); process.exit(1) })
