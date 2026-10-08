// lib/weekly-post/render.ts — THE renderer. (design, week) → PNG.
//
// ── 🔴 ONE RENDERER, AND THAT IS THE POINT ─────────────────────────────────────────────────────────
// The setup preview, the weekly-post preview and the file the operator downloads are all THIS
// function's output. Nothing imitates it in HTML. The brief's reason is exact: what they see must be
// what they download — and a CSS imitation drifts the first time either side is touched, silently, on
// artwork that then goes out to a truck's customers.
//
// ── 🔴 WHY satori/resvg (via `next/og`) AND NOT SOMETHING ELSE ─────────────────────────────────────
// Measured and chosen, not assumed:
//   • It is ALREADY A DEPENDENCY. `next/og` ships inside Next 16; nothing was added to package.json.
//   • NO NATIVE BINARIES. resvg and yoga are WASM, shipped as .wasm files under
//     `next/dist/compiled/@vercel/og/`, so there is
//     no per-platform build to go wrong on Vercel — the trap `@sparticuz/chromium` needs a
//     `serverExternalPackages` entry for in this very repo's next.config.
//   • CUSTOM FONTS, absolute positioning and a background image are all first-class.
//   • 1080×1920 renders in ~40ms warm, measured in the harness. The brief's ceiling is 2s.
// `sharp` compositing SVG text was the alternative and was rejected: it is a native binary, it would
// be a new dependency, and text layout would become our own problem (no shrink-to-fit, no line
// breaking) on top of the font metrics we already have to own.
//
// ⚠️ THE ELEMENT TREE IS BUILT BY HAND, NOT WITH JSX. This file is imported by API routes and by the
// harness, which compiles plain TypeScript — a .tsx here would mean a JSX pragma and a second compile
// configuration for no gain. satori takes the same object shape either way.
//
// ⚠️ EVERY POSITION IS ABSOLUTE AND IN THE BLANK'S OWN PIXELS. No flex layout decides where anything
// goes, because the operator placed the boxes on their own artwork and "near enough" is not a thing
// they can correct afterwards.

import { ImageResponse } from 'next/og'
import { bundledFontFiles, DEFAULT_FONT_ID } from './fonts'
import { asFontBuffer, makeFontBundle, type FontBundle } from './font-bundle'
/* ══ 🔴 THE DRAWING LEFT THIS FILE ON 10 OCTOBER 2026 (§2) ════════════════════════════════════════
 * ⛔ `lineEl`, `boxEl`, `noteEls`, `placePictureEl`, `darkenEl`, `dateLines`, `daysEls`,
 * `poweredByEl` AND THE TWO TREE ASSEMBLIES are in `./draw` now, which imports no `next/og` and can
 * therefore be imported by a client component. §2's instruction is that the editor draws its text
 * live *"using the same layout functions as the renderer"*, and the only way for that to be true
 * rather than claimed is for there to be ONE tree builder. ⚠️ WHAT IS LEFT HERE IS THE I/O AND THE ONE
 * CALL TO SATORI — the parts that were ever server-only. See the header of `./draw`. */
import {
  div, eventTree, weeklyTree,
  type El, type PlacePictureSources, type RenderWarning,
} from './draw'
export { renderScale, POWERED_BY, type PlacePictureSources, type RenderWarning } from './draw'
import { type CountryCode } from './locale'
import { fontsUsedBy, fontsUsedByEvent, type EventLayout, type Layout } from './layout'
import type { DayEntry, WeekData } from './week-data'

export interface RenderInput {
  layout: Layout
  week: WeekData
  /** The blank, as a data URI. ⚠️ A URI, not a path — satori fetches nothing from disk. */
  blankDataUri: string
  /** The week's note, if the operator wrote one. The note box renders only when this is non-empty. */
  note?: string | null
  /**
   * The truck's country, for the date wording.
   *
   * 🔴 IT COMES IN FROM THE CALLER, through `countryForTruck()`, rather than being read here. This
   * module has no truck row and no database; the one function that decides a country is in
   * `locale.ts` and the route calls it. ⚠️ ABSENT MEANS GB, which is what every existing caller means.
   */
  country?: CountryCode
  /**
   * The fonts this render may draw with.
   *
   * ⚠️ OPTIONAL. Absent means "the committed files for whatever families this design names", which is
   * exactly what this renderer did before part 2 — so every existing caller is unchanged. A design
   * that names a LIBRARY or an UPLOADED font needs a bundle, because those bytes come from storage and
   * fetching them is `await`; `loadFontsForDesign()` in `./font-store` builds one.
   */
  fonts?: FontBundle
  /**
   * The place pictures this poster may draw (part 3).
   *
   * ⚠️ OPTIONAL. Absent means "no place has a picture", which is exactly what a design that has not
   * switched the item on renders anyway — so every existing caller is unchanged.
   */
  placePictures?: PlacePictureSources
}

export interface RenderResult {
  png: Buffer
  width: number
  height: number
  /** Truncations and dropped stacked events, for the weekly-post screen. */
  warnings: RenderWarning[]
  ms: number
}



/**
 * ══ 🔴 THE FONTS A RENDER HAS — HANDED IN, OR BUILT FROM THE COMMITTED FILES ══════════════════════
 *
 * ⚠️ OPTIONAL, AND THE DEFAULT IS EXACTLY WHAT THIS RENDERER DID BEFORE 6 OCTOBER 2026: the design's
 * own bundled families, read off disk. That is what keeps every existing caller — and the whole of
 * `scripts/weekly-post.cjs` — working with no change, and it is what makes a library or an uploaded
 * font an ADDED capability rather than a new requirement.
 *
 * 🔴 A CALLER THAT WANTS A LIBRARY OR UPLOADED FONT MUST PASS A BUNDLE, because getting those bytes
 * is `await` and `boxEl` is synchronous — see the header of `font-bundle.ts`. The route builds one
 * with `loadFontsForDesign()` before it calls either render function.
 */
function bundleFor(ids: readonly string[], given: FontBundle | undefined): FontBundle {
  if (given) return given
  return makeFontBundle(bundledFontFiles([DEFAULT_FONT_ID, ...ids]))
}



/**
 * Build the whole poster and render it.
 *
 * ⚠️ IT RETURNS WARNINGS RATHER THAN THROWING on a design that does not quite work. A truncated place
 * name still makes a usable poster; refusing to render would leave the operator with nothing and no
 * idea which day was at fault.
 */
export async function renderWeeklyPost(input: RenderInput): Promise<RenderResult> {
  const t0 = Date.now()
  const l = input.layout
  /* ⛔ THE **TREE** IS NOT BUILT HERE ANY MORE — `weeklyTree` in `./draw` builds it, and the editor
   * calls the same function. See the header of that file: the assembly is the part that has to be
   * shared, and this function is what was ever server-only. */
  const fonts = bundleFor(fontsUsedBy(l).map(f => f.id), input.fonts)
  const { children, warnings, W, H } = weeklyTree({
    layout: l, week: input.week, fonts,
    country: input.country, note: input.note, placePictures: input.placePictures,
  })
  const png = await paint(children, W, H, input.blankDataUri, fonts)
  return { png, width: W, height: H, warnings, ms: Date.now() - t0 }
}

/* ⛔ `fontsUsed(l)` LIVED HERE AND IS GONE. It answered "which (family, bold) pairs does this design
 * use" so `paint` could load exactly those files. The BUNDLE answers that now — and it has to, because
 * it also holds library and uploaded faces that `fontsForDesign` could not reach. `fontsUsedBy` in
 * `layout.ts` is still the list of ids, and `bundleFor` turns it into files when no bundle is passed. */

// ════════════════════════════════════════════════════════════════════════════════════════════════
// SHARED BY BOTH POSTERS
// ════════════════════════════════════════════════════════════════════════════════════════════════


/**
 * The frame, the background and the one call to satori — shared by both posters.
 *
 * 🔴 EXTRACTED IN STAGE 2. Both posters are "a picture with absolutely positioned text on it", and
 * the parts that make that work — the background as a `backgroundImage` rather than an `<img>`, the
 * floor colour under it, the font list, the cast past React's types — are decisions that must be the
 * same for both. A second copy would be a second set of those decisions.
 */
async function paint(
  children: El[],
  W: number,
  H: number,
  backgroundDataUri: string,
  fonts: FontBundle,
): Promise<Buffer> {
  const root = div({
    display: 'flex',
    position: 'relative',
    width: `${W}px`,
    height: `${H}px`,
    /* ⚠️ THE PICTURE IS A BACKGROUND IMAGE SIZED TO THE WHOLE FRAME, not an <img> in flow. An <img>
     * would participate in layout and could be displaced by a sibling; a background cannot move. */
    backgroundImage: `url(${backgroundDataUri})`,
    backgroundSize: `${W}px ${H}px`,
    backgroundRepeat: 'no-repeat',
    /* ⚠️ A FLOOR COLOUR UNDER THE IMAGE. If the data URI ever fails to decode, the poster comes out
     * dark with legible text rather than transparent-on-nothing. */
    backgroundColor: '#111827',
  }, children)

  /* ⚠️ THE BUNDLE ALREADY HOLDS THE DEFAULT FAMILY — `loadFontsForDesign` and `bundleFor` both put
   * `DEFAULT_FONT_ID` in unconditionally, because "Powered by HatchGrab" is drawn in it and
   * `FontBundle.resolve` needs it as the fallback. There is nothing to add here. */
  /* ⚠️ `asFontBuffer` IS A TYPE BRIDGE AND NOT A CONVERSION — see its note in `font-bundle.ts`. The
   * bundle holds `Uint8Array` so a browser can build one; satori's types ask for a `Buffer`. */
  const loaded = fonts.satoriFonts().map(f => ({ ...f, data: asFontBuffer(f.data) }))

  /* ⚠️ CAST THROUGH `ConstructorParameters`, NOT THROUGH `React.ReactElement`. This file is plain
   * TypeScript compiled by the harness without a JSX configuration, so naming a React type here would
   * drag the React types into a module that has no other reason to want them. satori accepts the same
   * object shape; the cast says "this is the element argument" without importing React to say it. */
  type OgElement = ConstructorParameters<typeof ImageResponse>[0]
  const res = new ImageResponse(root as unknown as OgElement, { width: W, height: H, fonts: loaded })
  return Buffer.from(await res.arrayBuffer())
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE SINGLE-EVENT POST (stage 2)
// ════════════════════════════════════════════════════════════════════════════════════════════════

export interface EventRenderInput {
  layout: EventLayout
  /** The one event, built by `entryFor` — the same rule the weekly post uses. */
  entry: DayEntry
  /** 'YYYY-MM-DD'. */
  date: string
  /** The background, as a data URI. One-off → place → default, resolved by the caller. */
  backgroundDataUri: string
  /** Typed in the modal for this post only; never saved to the event. */
  note?: string | null
  /** The truck's country, for the date wording. Absent = GB. */
  country?: CountryCode
  /** The fonts this render may draw with. Absent = the committed files. See `RenderInput.fonts`. */
  fonts?: FontBundle
  /** The place pictures this poster may draw. See `RenderInput.placePictures`. */
  placePictures?: PlacePictureSources
}

/**
 * One event, on the truck's own picture.
 *
 * 🔴 IT IS THE SAME RENDERER, NOT A SECOND ONE. Every piece that decides what the poster looks like is
 * shared with the weekly post and called from here: `boxEl` (which runs `fitLines` and the readability
 * rule), `dateLines`, `locationLinesFor`, `timeLinesFor`, `noteEls`, `poweredByEl` and `paint`. What
 * differs is what this file passes them — one entry instead of seven days, no row offset, and the
 * cancelled look on the date box. A fork would have been two answers to "does this text fit", on
 * artwork a truck posts.
 * ⛔ AND THE TIME FORM IS NO LONGER ONE OF THE DIFFERENCES (6 October 2026). It used to be "From 5pm";
 * both posters state a start and a finish now, through `formatTimeRangeFor`.
 *
 * ⚠️ NO DAYS-OFF TEXT. A single-event post is made *for* an event, so "no trading today" has no meaning
 * here; `locationLinesFor` is passed `null` and renders nothing if the entry is somehow empty.
 */
export async function renderEventPost(input: EventRenderInput): Promise<RenderResult> {
  const t0 = Date.now()
  const l = input.layout
  const fonts = bundleFor(fontsUsedByEvent(l).map(f => f.id), input.fonts)
  const { children, warnings, W, H } = eventTree({
    layout: l, entry: input.entry, date: input.date, fonts,
    country: input.country, note: input.note, placePictures: input.placePictures,
  })
  const png = await paint(children, W, H, input.backgroundDataUri, fonts)
  return { png, width: W, height: H, warnings, ms: Date.now() - t0 }
}
