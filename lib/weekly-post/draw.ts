// lib/weekly-post/draw.ts — THE POSTER, AS A TREE. Built once, painted twice.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHY THE DRAWING LEFT `render.ts` (10 October 2026 · §2)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ **DOMINIC:** *"when i move a box the text stays in its old position for seconds."* The stage showed
// the server's PNG, so every move, resize and restyle waited ~400ms of debounce plus a render before
// the WORDS caught up with the OUTLINE the finger was dragging. §2's instruction is exact: the editor
// *"draws ALL the writing live in the browser, using the same layout functions as the renderer
// (`resolveTextBox`, `dayCells`, the same fitting rules) and the same font files"*.
//
// 🔴 **"THE SAME FUNCTIONS" IS TAKEN LITERALLY HERE, AND THAT IS THE WHOLE DESIGN.** The renderer never
// built HTML — it built a tree of `{ type, props: { style } }` objects and handed them to satori, which
// is a flexbox engine reading CSS. So the tree does not need to be translated for a browser: it needs
// to be MOUNTED in one. This module builds that tree and knows nothing about who paints it:
//   • `render.ts` passes it to satori and gets a PNG (the file a truck posts).
//   • `components/manage/LivePoster.tsx` turns the same objects into real DOM, in the same frame as
//     the drag, with no network and no debounce.
// ⛔ **A SECOND IMPLEMENTATION IN THE EDITOR WAS THE OBVIOUS ROUTE AND IT IS THE ONE THIS PRODUCT HAS
// ALREADY BEEN BURNED BY.** "What does this box look like" and "what does this box say" each had two
// answers once before, and both drifted. One tree cannot drift from itself.
//
// ⚠️ WHAT IS **NOT** IN HERE: `next/og`, satori, resvg, `ImageResponse`, and reading a file. This module
// is pure — data in, objects out — which is precisely what lets a client component import it. The one
// call to satori stays in `render.ts`, where the I/O is.
//
// ⚠️ **THE KNOWN DIFFERENCES BETWEEN THE TWO PAINTERS ARE LISTED IN docs/social-tab-7-report.md**, as
// §2 asks. They are small and they are real: satori's yoga and a browser's flexbox are two engines,
// `letterSpacing` is added after the last glyph by one and not the other, and a font the browser has
// not finished loading draws in a fallback for a frame.

import { fitLines, RAISED_SCALE, type FitLine } from './fit'
/* ⚠️ §2 · THE LINE'S OWN HEIGHT, FROM THE FONT'S METRICS — the same function `fit.ts` measures with.
 * See the note on `lineHeight` in `lineEl`: it is what makes "Line spacing" real and what makes a
 * browser stack the lines where satori does. */
import { lineHeightPx } from './ttf-metrics'
import { readabilityFor, textShadowFor, withAlpha } from './contrast'
import { formatTimeRangeFor, headingRuns, type TextCase, type TextRun } from './format'
import { dateLinesFor, type CountryCode, type DateStyleId } from './locale'
import {
  MAX_DARKEN, MAX_RENDER_SIDE, NOTE_TOKEN,
  /* 🔴 **THE ONE STYLE RESOLVER** — the brief's requirement, and the import that makes it true rather
   * than claimed. The editor's panel calls the same function. */
  resolveTextBox,
  type DateBox, type EventLayout, type Layout, type NoteBox, type PlacePictureBox, type TextBox,
  type TextLook,
} from './layout'
import type { DayEntry, WeekData } from './week-data'
import { dayCells, shapeRadius, type DayPartsOn, type DaysBlock } from './days'
import { locationLinesFor, timeLinesFor, withWordsBefore } from './lines'
import type { FontBundle, ResolvedFace } from './font-bundle'
import { DEFAULT_FONT_ID } from './font-list'


export interface RenderWarning {
  /** 'YYYY-MM-DD' for a day row, or 'heading' / 'note' / 'powered-by'. */
  where: string
  message: string
}
export const POWERED_BY = 'Powered by HatchGrab'

/* 🔴 RAISED ORDINALS ARE ALWAYS ON (6 October 2026). The per-box setting is gone, so every `TextCase`
 * this renderer builds says `true` — and it says it through ONE constant helper rather than at six
 * call sites, so there is nowhere for a `false` to survive. ⛔ A DESIGN SAVED WITH THEM OFF NOW DRAWS A
 * RAISED SUFFIX; that is one of the two deliberate breaks, and it is in docs/design-editor-report.md. */
const caseOf = (box: { caps: boolean }): TextCase => ({ caps: box.caps, raisedOrdinals: true })

/**
 * One node of the poster tree.
 *
 * 🔴 IT IS DELIBERATELY THE SHAPE SATORI ALREADY TOOK — `{ type, props: { style, children } }` — and
 * that shape is also, to within a cast, a React element's. ⚠️ `style` IS CSS, with CSS's own units as
 * strings, because that is what satori reads and what the browser reads. Nothing here is translated.
 */
export type El = { type: string; props: Record<string, unknown> }
export const div = (style: Record<string, unknown>, children?: unknown): El =>
  ({ type: 'div', props: children === undefined ? { style } : { style, children } })

/**
 * The scale applied to everything.
 *
 * 🔴 THE LONGEST SIDE IS CAPPED AT 2160px (the brief's number) and the whole design is scaled by one
 * factor — never the image alone. Scaling the background and drawing the text at native coordinates
 * is the obvious bug here: the text would land in the wrong place on anything oversized, and only on
 * oversized blanks, so it would pass every test made with a 1080px one.
 */
/**
 * 🔴 HOW MUCH SMALLER THAN ITS CELL A DAY ROW'S LOCATION PICTURE IS DRAWN — Dominic's 15%.
 *
 * ⛔ IT EXISTS SO SEVEN ROWS OF PICTURES DO NOT TOUCH. A cell is the full height of its band, so at
 * 0 the pictures form one unbroken column down the poster — over artwork whose own table rows are
 * separated by gaps. ⚠️ A SHARE, NOT A PIXEL COUNT, so it holds at every poster size and row height.
 */
export const PICTURE_INSET = 0.15

export function renderScale(width: number, height: number): number {
  const longest = Math.max(width, height)
  return longest > MAX_RENDER_SIDE ? MAX_RENDER_SIDE / longest : 1
}

const justify = (a: TextBox['align']) =>
  a === 'center' ? 'center' : a === 'right' ? 'flex-end' : 'flex-start'

/** One fitted line, as a row of runs. Raised runs are smaller and lifted. */
function lineEl(
  line: FitLine, box: TextBox, size: number, shadow: string | undefined, letterSpacing: number,
  /** 🔴 RESOLVED ONCE BY `boxEl` AND PASSED DOWN. Resolving per line — or per run — would re-parse the
   *  font's metrics for every line of every box, and could in principle answer differently twice. */
  face: ResolvedFace,
  /**
   * The line height multiplier `fitLines` MEASURED with — `LINE_GAP` times "Line spacing".
   *
   * ⛔ **PASSED IN, NEVER RECOMPUTED, AND IT CLOSES A SETTING THAT DREW NOTHING.** `lineSpacing` was
   * measured by `fit.ts` and never reached the tree, so satori stacked every line at the font's
   * natural height whatever the operator chose: a box made tall enough for 150% and drawn at 100%.
   */
  lineGap: number,
): El {
  const lineSize = size * (line.scale ?? 1)
  /* 🔴 `flex-start`, NOT `baseline`. With baseline alignment satori puts a smaller run ON the same
   * baseline as the big one, which is correct for ordinary text and is NOT a superscript — the "TH"
   * came out sitting at the foot of the "28" instead of raised above it. Aligning the row to the TOP
   * puts the smaller run at the top of the line box, which IS the superscript position. Runs of equal
   * size are unaffected: for one size, flex-start and baseline are the same alignment. */
  return div(
    { display: 'flex', flexDirection: 'row', alignItems: 'flex-start', justifyContent: justify(box.align), width: '100%' },
    line.runs.map((r: TextRun) => div({
      display: 'flex',
      fontFamily: face.family,
      fontWeight: face.weight,
      /* 🔴 A REAL ITALIC FACE WHERE ONE EXISTS. `fontStyle: 'italic'` only works when an italic FILE
       * has been registered under this family name, which is exactly what `face.style` records — so
       * this is set from the bundle's answer and never from `box.italic`. */
      ...(face.style === 'italic' ? { fontStyle: 'italic' as const } : {}),
      fontSize: `${(r.raised ? lineSize * RAISED_SCALE : lineSize).toFixed(2)}px`,
      /* ══ 🔴 THE LINE'S HEIGHT, SPELLED OUT — AND IT MAKES "Line spacing" REAL ════════════════════
       *
       * ⛔ **"Line spacing" MEASURED AND NEVER DREW, AND THAT IS THE BUG THIS LINE FIXES.** `fit.ts`
       * has always multiplied the line height by the operator's percentage when deciding whether text
       * FITS — and this tree carried no `lineHeight` at all, so satori stacked every line at the font's
       * natural height whatever they chose. A box was made tall enough for 160% and drawn at 100%.
       * 🔴 MEASURED BOTH WAYS IN `scripts/live-poster.cjs`: 160% now stands 36px taller than 100% on a
       * two-line heading, and with this one property stripped out of the tree the two become identical.
       *
       * ⚠️ **IT COSTS THE PNG NOTHING AT 100%**, which is what made it safe to add rather than a change
       * to every poster this product has ever made: the value is exactly what satori computes for
       * itself, and the full default design renders with 7 pixels of antialiasing difference out of
       * 1,458,000. Every design saved before today is unchanged unless its owner had moved Line
       * spacing — in which case it now does what its label says.
       *
       * ⚠️ IT ALSO KEEPS §2's LIVE STAGE HONEST ACROSS FONTS. A browser's `line-height: normal` adds
       * the font's line GAP; Oswald's is zero, so the two agree there anyway — a font whose gap is not
       * zero would have stacked differently in the editor than in the PNG.
       * ⚠️ PER **RUN**, AT THE RUN'S OWN SIZE, so a raised ordinal keeps the smaller line box that puts
       * it at the top of the row. Giving it the big line's height would centre it and undo the
       * superscript. */
      lineHeight: `${(lineHeightPx(face.metrics, r.raised ? lineSize * RAISED_SCALE : lineSize) * lineGap).toFixed(2)}px`,
      color: box.color,
      /* ⚠️ NO LIFT IS APPLIED TO THE RUN ITSELF. The row above is top-aligned, so a smaller run is
       * already raised by the difference in line heights — which is the superscript. A `marginBottom`
       * was tried first and did nothing visible inside a baseline-aligned row; `RAISED_LIFT` is kept
       * because `fit.ts` uses it to reason about the raised run's extent when measuring. */
      ...(shadow ? { textShadow: shadow } : {}),
      /* 🔴 THE STRIKE IS A PROPERTY OF THE LINE, set where the data says the event is cancelled.
       * It was briefly applied afterwards by reaching into `children[children.length - 2]`, which is
       * wrong the moment a day has a background panel — `boxEl` then pushes TWO elements and the
       * index points at the panel. Index arithmetic over a built tree is not a way to say "this
       * event is cancelled". */
      ...(line.strike ? { textDecoration: 'line-through' } : {}),
      /* ⚠️ APPLIED PER RUN, NOT ON THE ROW. satori does not inherit `letterSpacing` from a flex
       * container to the text nodes inside it, so setting it on the row above would measure here (in
       * `fit.ts`) and draw nowhere. */
      ...(letterSpacing !== 0 ? { letterSpacing: `${letterSpacing.toFixed(2)}px` } : {}),
      /* ══ ⛔ THE FAUX ITALIC IS NOW THE **FALLBACK ONLY** (6 October 2026, part 2) ═══════════════
       * None of the 21 committed families has an italic file, so part 1 sheared the upright face by
       * 12° — what a word processor does when a family has no italic. A LIBRARY or UPLOADED family
       * often does have one, and `FontBundle.resolve` says which case this is.
       * 🔴 SO THE SHEAR IS APPLIED **ONLY** WHEN `fauxItalic` IS SET. Applying it as well as a real
       * italic face would double the slant — a genuine italic sheared another 12° on top. */
      ...(face.fauxItalic ? { transform: 'skewX(-12deg)' } : {}),
      whiteSpace: 'pre',
    }, r.text)),
  )
}

/**
 * Draw one text box: its optional panel, then the fitted lines.
 *
 * ⚠️ `overflow: hidden` IS A BELT, NOT THE BRACES. `fitLines` has already guaranteed the text fits;
 * this is here so that if it is ever wrong the poster clips rather than spills over the next day's
 * row — a bounded failure instead of an unbounded one.
 */
function boxEl(
  box: TextBox,
  lines: FitLine[],
  scale: number,
  /**
   * The band colour forced by the DATA rather than by the style — a day off, or a cancelled event.
   * ⚠️ `undefined` MEANS "USE THE BOX'S OWN BAND"; `null` MEANS "NO BAND, WHATEVER THE STYLE SAYS".
   * The two are different states and collapsing them is what would draw a trading day's band colour
   * behind a day off.
   */
  forcedBand: string | null | undefined,
  where: string,
  warnings: RenderWarning[],
  label: string,
  fonts: FontBundle,
): El[] {
  /* 🔴 RESOLVED ONCE PER BOX. The face answers four questions at the same time — which family name
   * satori is told, which weight, whether a REAL italic file exists, and which metrics `fitLines`
   * must measure with — and they have to be one answer: measuring with the regular's metrics and
   * drawing with the italic's would make shrink-to-fit wrong for every italic box. */
  const face = fonts.resolve(box.fontId, box.bold, box.italic)
  const metrics = face.metrics
  const fx = box.effects
  const fit = fitLines({
    lines, w: box.w, h: box.h, fontSize: box.fontSize, metrics,
    letterSpacing: box.letterSpacing,
    lineSpacing: box.lineSpacing,
    wrapToTwo: box.ifTooLong === 'twoLines',
  })
  if (fit.truncated) {
    warnings.push({ where, message: `${label} did not fit and was shortened.` })
  }
  /* 🔴 THE AUTOMATIC RULE IS PER BOX NOW. `effects.keepReadable` defaults to the design's old
   * design-wide flag (see `parseEffects`), so an old design behaves exactly as it did. */
  const read = readabilityFor(box.color, box.bgSample, fx.keepReadable)
  const shadow = textShadowFor(fx, box.color, fit.fontSize * scale, read.outline)

  /* ⚠️ ONE ROTATION, APPLIED TO THE BAND AND TO THE TEXT SEPARATELY, AND THEY STAY ALIGNED BECAUSE
   * THEY ARE CONCENTRIC. The band is the box grown by `bandPadding` on every side, so both rectangles
   * share a centre; rotating each about its own centre by the same angle is the same transform.
   * Nesting them would have been tidier and would also have put the band in the text's flow, where a
   * `justifyContent` would move it. */
  const spin = box.tilt !== 0
    ? { transform: `rotate(${box.tilt}deg)`, transformOrigin: 'center' }
    : {}

  const out: El[] = []
  const bandColour = forcedBand === undefined
    ? (fx.band ? withAlpha(fx.bandColour, fx.bandOpacity) : null)
    : (forcedBand === null ? null : withAlpha(forcedBand, 100))
  if (bandColour) {
    const pad = forcedBand === undefined ? fx.bandPadding : 0
    out.push(div({
      position: 'absolute',
      left: `${(box.x - pad) * scale}px`, top: `${(box.y - pad) * scale}px`,
      width: `${(box.w + pad * 2) * scale}px`, height: `${(box.h + pad * 2) * scale}px`,
      backgroundColor: bandColour,
      ...(fx.bandRadius > 0 && forcedBand === undefined
        ? { borderRadius: `${fx.bandRadius * scale}px` } : {}),
      display: 'flex',
      ...spin,
    }))
  }
  out.push(div({
    position: 'absolute',
    left: `${box.x * scale}px`, top: `${box.y * scale}px`,
    width: `${box.w * scale}px`, height: `${box.h * scale}px`,
    display: 'flex', flexDirection: 'column',
    justifyContent: 'center',
    alignItems: box.align === 'center' ? 'center' : box.align === 'right' ? 'flex-end' : 'flex-start',
    overflow: 'hidden',
    ...spin,
  }, fit.lines.map(l => lineEl(l, box, fit.fontSize * scale, shadow, fit.letterSpacing * scale, face, fit.lineGap))))
  return out
}



/**
 * Every "Your own text" box, with `{note}` filled in.
 *
 * 🔴 ONE FUNCTION FOR BOTH POSTERS. The weekly post and the single-event post draw these boxes
 * identically — the only thing either knows is the note that was typed — so a copy in each would be
 * two places for the token substitution to drift.
 * ⚠️ A BOX WHOSE TEXT IS EMPTY AFTER SUBSTITUTION DRAWS NOTHING, band included. That is what makes a
 * migrated legacy box (`text: '{note}'`) behave exactly as the old note box did: nothing typed, nothing
 * drawn. ⛔ AND THE CHECK IS ON THE SUBSTITUTED STRING, not on the raw one: testing `box.text` would
 * find '{note}' non-empty and draw an empty box on every poster made without a note.
 */
function noteEls(
  notes: readonly NoteBox[], typed: string | null | undefined, scale: number, warnings: RenderWarning[],
  fonts: FontBundle,
  /** 🔴 The design's shared look. ⚠️ Threaded in rather than read off a layout, because this function
   *  is the one piece of box drawing shared by BOTH posters and neither layout type is in scope. */
  look: TextLook,
): El[] {
  const note = String(typed ?? '').trim()
  const out: El[] = []
  notes.forEach((raw, i) => {
    if (!raw.enabled) return
    /* ⛔ RESOLVED BEFORE ANYTHING READS A LOOK FIELD. `withWordsBefore` asks for `caps`, which is a
     * SHARED field — so resolving after it would upper-case the note and not the words in front of it. */
    const box = resolveTextBox(look, raw)
    const text = box.text.split(NOTE_TOKEN).join(note).trim()
    if (!text) return
    out.push(...boxEl(box, withWordsBefore([{ runs: [{ text }] }], box), scale, undefined,
      `note-${i + 1}`, warnings, 'Your own text', fonts))
  })
  return out
}

/**
 * ══ 🔴 THE PLACE'S PICTURE, IN A BOX (part 3) ════════════════════════════════════════════════════
 *
 * A pub's logo in the corner of the weekly post, a venue's photo on a single event post. The picture
 * arrives as a DATA URI the caller has already fetched — the same discipline as the background and the
 * fonts, and for the same reason: this function is synchronous, and a render that fetched would be a
 * render that can time out on somebody's poster.
 *
 * ⛔ A PRIVATE EVENT NEVER REACHES HERE. `entryFor` nulls a private booking's `placeId` AND sets
 * `isPrivate`, and `pictureForEntry` below checks both — so the refusal is made server-side, twice,
 * before this function is asked for anything.
 *
 * ⛔ IT IS AN `<img>` WITH `objectFit`, AND **NOT** A `backgroundImage` WITH `backgroundSize` — WHICH
 * WAS MEASURED, NOT ASSUMED. satori renders `backgroundSize: 'cover'` and `backgroundSize: 'contain'`
 * **IDENTICALLY**: a 400×100 picture in a 60×60 box came out byte-for-byte the same both ways, while
 * an explicit `60px 15px` differed from both. So "Fill the box" and "Fit inside" would have been one
 * setting with two labels — the exact "a setting that does nothing" failure part 2's font checks exist
 * to catch. An `<img>` with `objectFit: cover` vs `contain` DOES differ, measured the same way.
 *
 * ⚠️ `paint` ARGUES THE OPPOSITE FOR THE POSTER'S OWN BACKDROP — "an `<img>` participates in layout and
 * could be displaced by a sibling" — and that argument does not reach here: this `<img>` is the ONLY
 * child of an absolutely positioned, fixed-size div, so there is no sibling and nothing to displace it.
 * The div keeps the clipping, the corners and the border; the img is only the pixels.
 */
function placePictureEl(
  box: PlacePictureBox,
  /** The picture's bytes as a data URI, or null when this place has none. */
  dataUri: string | null,
  /** The truck's own logo, for `ifMissing: 'logo'`. null when they have not uploaded one. */
  logoUri: string | null,
  scale: number,
): El | null {
  /* 🔴 WHAT TO DRAW WHEN THE PLACE HAS NOTHING, AND `omit` IS THE DEFAULT. Most trucks will have a
   * library for two venues out of twenty, so a design that left a hole on every other row would look
   * broken on a poster they never previewed. */
  let src = dataUri
  if (!src) {
    if (box.ifMissing === 'omit') return null
    /* ⚠️ `logo` FALLS BACK TO DRAWING NOTHING WHEN THERE IS NO LOGO. The editor only offers the option
     * to a truck that has one, but a stored design can say `logo` after the logo was removed in
     * Settings — and an empty bordered square is not what they asked for either. */
    if (box.ifMissing === 'logo') src = logoUri
  }
  /* ⚠️ `blank` REACHES HERE WITH NO `src` ON PURPOSE: the box is drawn — its border and its space —
   * and nothing is put in it. That is what "Leave a blank space" means, and it is the option for a
   * design whose layout depends on the gap being there. */
  if (!src && box.ifMissing !== 'blank') return null

  const border = box.borderColour && box.borderWidth > 0
    ? {
        borderWidth: `${Math.max(1, Math.round(box.borderWidth * scale))}px`,
        borderStyle: 'solid',
        borderColor: box.borderColour,
      }
    : {}
  const w = Math.max(1, Math.round(box.w * scale))
  const h = Math.max(1, Math.round(box.h * scale))
  return div(
    {
      position: 'absolute',
      left: `${box.x * scale}px`, top: `${box.y * scale}px`,
      width: `${w}px`, height: `${h}px`,
      display: 'flex',
      /* ⚠️ `overflow: hidden` IS WHAT MAKES "Fill the box" A CROP rather than a spill, and what makes
       * the rounded corners clip the picture rather than just the box. */
      overflow: 'hidden',
      ...(box.corners === 'rounded' ? { borderRadius: `${box.radius * scale}px` } : {}),
      ...border,
    },
    src
      ? [{
          type: 'img',
          props: {
            src,
            width: w,
            height: h,
            style: {
              width: `${w}px`, height: `${h}px`,
              /* 🔴 `cover` CROPS TO FILL, `contain` LETTERBOXES. Both centre, so a logo wider than its
               * box loses its edges evenly rather than its right-hand side. */
              objectFit: box.fit === 'fit' ? 'contain' : 'cover',
            },
          },
        } as El]
      : undefined,
  )
}

/** What a render knows about place pictures. ⚠️ Fetched by the CALLER, before the render starts. */
export interface PlacePictureSources {
  /**
   * placeId → that place's Main picture, as a data URI.
   *
   * ⛔ KEYED BY PLACE ID, AND A PRIVATE EVENT HAS NONE. `entryFor` nulls it, so a private row cannot
   * look anything up even if this map held every place the truck has.
   */
  byPlaceId: Record<string, string>
  /** The truck's own logo, for `ifMissing: 'logo'`. */
  logo?: string | null
}

/** The picture for one entry, or null. ⛔ The one place the private-event refusal is written. */
function pictureForEntry(
  entry: DayEntry | undefined, sources: PlacePictureSources | undefined,
): string | null {
  if (!entry || entry.isPrivate || !entry.placeId || !sources) return null
  return sources.byPlaceId[entry.placeId] ?? null
}

/**
 * "Darken the picture" — one dark layer over the background and under every box.
 *
 * ⚠️ PUSHED BEFORE THE TEXT CHILDREN AND NEVER AFTER. satori paints in document order, so a layer
 * appended at the end would darken the words as well as the picture, which is the opposite of what the
 * setting is for.
 * ⚠️ 0 PUSHES NOTHING AT ALL rather than a transparent rectangle, so an untouched design's element
 * tree is byte-identical to what it was before this existed.
 */
function darkenEl(percent: number, W: number, H: number): El | null {
  if (!(percent > 0)) return null
  return div({
    position: 'absolute', left: 0, top: 0, width: `${W}px`, height: `${H}px`,
    /* ⚠️ THE SAME CEILING THE VALIDATOR ENFORCES, imported rather than written twice — 60 here and 70
     * there would be a slider whose top third did nothing. */
    backgroundColor: withAlpha('#000000', Math.min(MAX_DARKEN, percent)),
    display: 'flex',
  })
}

/**
 * The Date box's lines.
 *
 * 🔴 IT ASKS `locale.ts` AND SPELLS NOTHING OUT. It used to build "MONDAY" + "28TH SEPTEMBER" here —
 * the weekday, a space, the day, the suffix, the month, in the UK's order — which made this function
 * the second place the product decided how a date is written. The style id and the country go in; the
 * lines come back, already split where that country allows a break.
 * ⚠️ TAKES THE DATE, NOT THE DAY, so the single-event post uses this exact function rather than a copy
 * with the same ordinal and capitals logic in it.
 */
function dateLines(
  dateYmd: string, box: DateBox, style: DateStyleId, country: CountryCode,
): FitLine[] {
  return dateLinesFor(dateYmd, style, country, caseOf(box), box.twoLines).map(runs => ({ runs }))
}

/* ⛔ `locationLinesFor` AND `timeLinesFor` MOVED TO `lib/weekly-post/lines.ts` ON 10 OCTOBER 2026,
 * with `withWordsBefore`. ⚠️ NOT TIDINESS: §2 makes the EDITOR draw its own text live, and the brief's
 * condition is that it uses the same functions — which it cannot, from a module that imports
 * `next/og`. Nothing about them changed in the move and both are imported back in above. */
/**
 * ══ 🔴 "THE 7 DAYS" — THE SEVEN ROWS, DRAWN FROM ONE BLOCK (10 October 2026) ══════════════════════
 *
 * ⛔ WHAT THIS REPLACES IS **BELOW**, NOT DELETED: the legacy loop that offset three boxes by
 * `rowSpacing × i` is still there and still runs for every design that has not been opened in the new
 * editor. The brief's rule is exact — *"existing saved designs must render exactly as today until
 * their owner opens and saves them"* — so this renderer supports BOTH models and the presence of
 * `layout.days` is what chooses.
 *
 * 🔴 EVERY RECTANGLE COMES FROM `dayCells`, WHICH THE EDITOR ALSO CALLS. Nothing about the geometry is
 * decided here; this function turns cells into satori elements and nothing else.
 * ⚠️ `on` IS COMPUTED **ONCE**, FROM THE BOXES' OWN SWITCHES, and is the same for all seven rows — so
 * the columns line up down the poster. ⛔ A PER-DAY `on` WOULD BE A RAGGED TABLE: a day with no times
 * would widen its place name and the whole grid would step in and out.
 * ⚠️ WHAT EACH PART SAYS IS DECIDED BY THE SAME THREE FUNCTIONS THE LEGACY PATH USES — `dateLines`,
 * `locationLinesFor`, `timeLinesFor` — so the two models cannot word a poster differently.
 */
function daysEls(
  l: Layout,
  days: DaysBlock,
  week: WeekData,
  rb: <T extends TextBox>(b: T) => T,
  scale: number,
  warnings: RenderWarning[],
  fonts: FontBundle,
  country: CountryCode,
  pictures: PlacePictureSources | undefined,
): El[] {
  const on: DayPartsOn = {
    picture: l.placePicture.enabled,
    dayDate: l.date.enabled,
    place: l.location.enabled,
    times: l.time.enabled,
  }
  const out: El[] = []
  week.days.forEach((day, i) => {
    /* 🔴 "Leave them out" DRAWS NOTHING FOR THAT DAY — not the date, not the days-off message, not a
     * band. ⚠️ ITS **SLOT** STAYS: the other six days do not move, and the editor's seven equal rows
     * stay true. See `DaysOffMode`. */
    if (day.isDayOff && days.daysOff === 'omit') return
    for (const cell of dayCells(days, on, i)) {
      const rect = { x: cell.x, y: cell.y, w: cell.w, h: cell.h }
      if (cell.key === 'dayDate') {
        /* ⚠️ RESOLVED FIRST, THEN GIVEN THE CELL. `caseOf` and `withWordsBefore` read `caps`, which is
         * a SHARED field — resolving after either would capitalise half a row. */
        const box = { ...rb(l.date), ...rect }
        /* ⚠️ THE DAY-OFF BAND IS THE SAME `undefined`-vs-`null` RULE AS THE LEGACY PATH: a day off
         * takes `bgDayOff` if there is one, and a trading day hands the band back to the box's style. */
        const band = day.isDayOff ? (l.date.bgDayOff ?? null) : undefined
        out.push(...boxEl(box, withWordsBefore(dateLines(day.date, box, l.dateStyle, country), box),
          scale, band, day.date, warnings, 'The date', fonts))
        continue
      }
      if (cell.key === 'place') {
        const box = { ...rb(l.location), ...rect }
        /* ⛔ `null` UNDER "Leave them out" IS UNREACHABLE — a day off has already returned above — but
         * it is passed rather than assumed, so the one place the days-off wording is decided is the
         * mode and not the control flow. */
        const daysOffText = days.daysOff === 'message' ? l.daysOffText : null
        out.push(...boxEl(box,
          withWordsBefore(locationLinesFor(day.entries, daysOffText, l.placeStyle), box),
          scale, undefined, day.date, warnings,
          day.isDayOff ? 'The days-off text' : 'The place name', fonts))
        continue
      }
      if (cell.key === 'times') {
        const lines = timeLinesFor(day.entries, e => e.time, l.placeStyle)
        if (!lines.length) continue
        const box = { ...rb(l.time), ...rect }
        out.push(...boxEl(box, withWordsBefore(lines, box), scale, undefined, day.date, warnings,
          'The time', fonts))
        continue
      }
      /* ══ 🔴 THE LOCATION PICTURE, IN ITS CELL ═══════════════════════════════════════════════════
       * ⛔ A DAY OFF HAS NO ENTRY AND THEREFORE NO PICTURE. `ifMissing` does not apply: there is no
       * place to have one, which is a different thing from a place that has none.
       * ⚠️ THE **FIRST** ENTRY'S PLACE on a stacked day — the one whose name and time are at the top
       * of the row, so it is the one the picture belongs beside. */
      if (!day.entries.length) continue
      const shape = days.pictureShape
      /* ══ 🔴 THE PICTURE IS DRAWN INSIDE ITS CELL, NOT EDGE TO EDGE (10 October 2026) ═══════════════
       * ⛔ **DOMINIC: "when location images are used they should be 15% smaller than the box … the
       * tables it's overlaid on have gaps between, and I don't want the images on each row touching."**
       * A row's cell runs the full height of its band, so seven pictures drawn at the cell's size form
       * one unbroken column down the poster — against artwork whose own rows are separated.
       * 🔴 `PICTURE_INSET` IS A SHARE OF THE CELL, NOT A PIXEL GAP, so it holds at every poster size and
       * at every row height. ⚠️ CENTRED: half the shrink comes off each edge, so the picture stays where
       * the operator put the cell rather than drifting to one corner.
       * ⛔ IT IS THE DAY ROW'S PICTURE ONLY. The single event design's picture box is one the operator
       * sized themselves on a canvas with nothing under it, and shrinking that would be moving their
       * work; `placePictureEl` is therefore left alone and the inset is applied to the RECT here. */
      const inset = {
        x: rect.x + (rect.w * PICTURE_INSET) / 2,
        y: rect.y + (rect.h * PICTURE_INSET) / 2,
        w: rect.w * (1 - PICTURE_INSET),
        h: rect.h * (1 - PICTURE_INSET),
      }
      const pic = {
        ...l.placePicture,
        ...inset,
        /* 🔴 THE SHAPE IS THE BLOCK'S, NOT THE LEGACY BOX'S `corners`. "Circle" is a radius of half
         * the side — the same rounded-corner path, so there is no fourth way to draw a picture. */
        corners: (shape === 'square' ? 'square' : 'rounded') as PlacePictureBox['corners'],
        /* ⚠️ THE RADIUS FOLLOWS THE **DRAWN** SIZE, not the cell's — "Circle" is half the shorter side
         * of what is actually painted, so an inset picture is still a circle and not a stadium. */
        radius: shapeRadius(shape, inset.w, inset.h),
      }
      const el = placePictureEl(
        pic, pictureForEntry(day.entries[0], pictures), pictures?.logo ?? null, scale,
      )
      if (el) out.push(el)
    }
  })
  return out
}

/**
 * "Powered by HatchGrab".
 *
 * 🔴 ALWAYS, bottom centre, small, and under the SAME readability rule as everything else — so it
 * is legible on a white blank and on a dark one without being configurable. It is sampled against
 * nothing, so it carries its own shadow unconditionally when `keepReadable` is on: it is our mark on
 * someone else's artwork and it must not be the one illegible thing on the poster.
 * 🔴 EXTRACTED IN STAGE 2 so the single-event post carries the identical mark rather than a second
 * one that could drift in size, position or opacity.
 */
function poweredByEl(W: number, H: number, keepReadable: boolean, fonts: FontBundle): El {
  /* ⚠️ THE MARK'S FAMILY COMES FROM THE BUNDLE, not from `FONT_BY_ID`. The bundle always holds the
   * default family (see `paint`), and asking it means the mark is drawn in a family satori has
   * definitely been given — rather than a name that happens to match one. */
  const mark = fonts.resolve(DEFAULT_FONT_ID, false, false)
  const pbSize = Math.max(9, Math.round(H * 0.013))
  return div({
    position: 'absolute',
    left: 0, top: `${H - Math.round(pbSize * 2.1)}px`, width: `${W}px`,
    display: 'flex', justifyContent: 'center',
  }, [div({
    display: 'flex',
    fontFamily: mark.family,
    fontWeight: 400,
    fontSize: `${pbSize}px`,
    color: '#ffffff',
    opacity: 0.85,
    ...(keepReadable ? { textShadow: `0px 1px ${Math.max(1, Math.round(pbSize * 0.18))}px #0b0b0bcc` } : {}),
    whiteSpace: 'pre',
  }, POWERED_BY)])
}
// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE WHOLE TREE — ONE FUNCTION PER POSTER, CALLED BY THE RENDERER AND BY THE EDITOR
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ THE RENDER FUNCTIONS USED TO BUILD THESE LISTS IN THEIR OWN BODIES, and that is exactly why the
// editor could not draw the same poster: the assembly — which boxes are drawn, in which order, with
// which bands and which words — was locked inside a function that also loaded fonts off disk and
// called satori. 🔴 THE ASSEMBLY IS THE PART THAT HAS TO BE SHARED. What is left in `render.ts` is the
// I/O and the one call to satori, which is all that was ever server-only.
// ⚠️ NOTHING IN EITHER BODY CHANGED IN THE MOVE except `input.note` → `note` and
// `input.placePictures` → `placePictures`, which are now parameters instead of fields of a render
// request. The PNG is byte-identical and `scripts/weekly-post.cjs` is what says so.

/** What both tree builders hand back. ⚠️ The warnings are the renderer's and the editor's alike. */
export interface PosterTree {
  children: El[]
  warnings: RenderWarning[]
  /** The painted size, after `renderScale`. The editor draws at CSS size and scales this tree. */
  W: number
  H: number
  scale: number
}

export interface WeeklyTreeInput {
  layout: Layout
  week: WeekData
  fonts: FontBundle
  country?: CountryCode
  note?: string | null
  placePictures?: PlacePictureSources
}

/** The weekly poster's children, in paint order. */
export function weeklyTree(input: WeeklyTreeInput): PosterTree {
  const { layout: l, week, fonts, placePictures } = input
  const note = input.note
  const keepReadable = l.keepReadable
  const country: CountryCode = input.country ?? 'GB'
  /* 🔴 **THE ONE RESOLVER, BOUND ONCE PER TREE.** Every box below goes through it, so no call site can
   * read a stale `fontId` or `color` off a box that follows "Style all the writing".
   * ⛔ IT IS THE SAME EXPORTED FUNCTION THE EDITOR'S PANEL CALLS — `resolveTextBox` in layout.ts. */
  const rb = <T extends TextBox>(b: T): T => resolveTextBox(l.textStyle, b)
  const scale = renderScale(l.width, l.height)
  const W = Math.round(l.width * scale)
  const H = Math.round(l.height * scale)
  const warnings: RenderWarning[] = []
  const children: El[] = []

  // ── "Darken the picture" ────────────────────────────────────────────────────────────────────────
  const dark = darkenEl(l.darken, W, H)
  if (dark) children.push(dark)

  // ── the heading ─────────────────────────────────────────────────────────────────────────────────
  /* ⚠️ THE DATE FORMATTER IS HANDED TO `headingRuns`, which takes one rather than importing `locale`
   * (that would close a cycle — see its own note). This is the only place the heading's `{start}` and
   * `{end}` wording is decided, and it is the design's own date style. */
  /* 🔴 A SWITCHED-OFF BOX DRAWS NOTHING — not an empty box, not its band. "Place off" means the venue
   * name is already printed on the truck's own artwork, so anything drawn there would be a second copy
   * of it. The box keeps its coordinates in the design; only this skips it. ⚠️ EVERY ONE OF THE FIVE
   * BOXES IS GUARDED, because the switch is on every item in the left-hand list now. */
  if (l.heading.enabled) {
    /* 🔴 RESOLVED FIRST, AND EVERY READ GOES THROUGH THE RESOLVED BOX. `caseOf` and `withWordsBefore`
     * both ask for `caps`, which is a SHARED field — resolving after either would capitalise half a
     * heading. ⚠️ `rb` IS DEFINED ONCE AT THE TOP OF THIS FUNCTION, so no call site here can forget. */
    const hb = rb(l.heading)
    const hRuns = headingRuns(hb.text, week.range.start, week.range.end, caseOf(hb),
      (ymd, c) => dateLinesFor(ymd, l.dateStyle, country, c, false)[0])
    children.push(...boxEl(hb, withWordsBefore([{ runs: hRuns }], hb), scale, undefined, 'heading', warnings, 'The heading', fonts))
  }

  // ── the seven rows ──────────────────────────────────────────────────────────────────────────────
  /* ══ 🔴 TWO MODELS, ONE RENDERER (10 October 2026) ═════════════════════════════════════════════════
   * ⛔ `l.days` IS THE SWITCH, AND ITS ABSENCE IS NOT A DEFAULT — it is the fact that this design has
   * not been opened in the new editor. The brief: *"existing saved designs must render exactly as
   * today until their owner opens and saves them in the new editor."* So the legacy loop below is
   * untouched, down to the comment, and the new path is an `if` in front of it rather than a rewrite
   * of it. ⚠️ THE TWO SHARE EVERY FUNCTION THAT DECIDES WHAT A ROW **SAYS** — only the rectangles
   * differ. */
  if (l.days) {
    children.push(...daysEls(l, l.days, week, rb, scale, warnings, fonts, country, placePictures))
  } else {
  /* 🔴 ROWS 2–7 ARE ROW 1'S BOXES, OFFSET. The operator places three outlines once; the other six days
   * are the same three boxes plus `rowSpacing × n`. Storing seven sets would let them drift apart and
   * would make "the other six days copy it" a promise the data could break. */
  week.days.forEach((day, i) => {
    const dy = l.rowSpacing * i
    /* ⚠️ `off` AND `rb` COMPOSE IN EITHER ORDER — one changes `y`, the other changes look fields, and
     * they touch no field in common. ⛔ BUT `rb` MUST COME BEFORE ANY READ OF A LOOK FIELD, which is
     * why the resolved box is what is handed to `withWordsBefore` as well as to `boxEl`. */
    const off = <T extends TextBox>(b: T): T => ({ ...b, y: b.y + dy })
    const dateBox = off(rb(l.date))
    /* 🔴 A DAY OFF TAKES `bgDayOff` AND NOTHING ELSE — the post-type add-on (§7), not the style. On a
     * trading day `undefined` hands the decision back to the box's own band, which is where an old
     * `bgTrading` colour was mapped. ⚠️ `?? null` MATTERS: with no day-off colour the band must be
     * OFF on that row, not fall through to the trading one. */
    const dayOffBand = day.isDayOff ? (l.date.bgDayOff ?? null) : undefined
    if (l.date.enabled) {
      children.push(...boxEl(dateBox, withWordsBefore(dateLines(day.date, dateBox, l.dateStyle, country), dateBox), scale, dayOffBand, day.date, warnings, 'The date', fonts))
    }
    if (l.location.enabled) {
      /* 🔴 THE PLACE TEXT IN A DAY ROW FOLLOWS "All text" LIKE EVERY OTHER TEXT BOX. There is one
       * `l.location` box repeated seven times, so one resolve covers all seven rows — which is also why
       * the weekly design needs no second rule for its rows. */
      const lb = off(rb(l.location))
      children.push(...boxEl(lb, withWordsBefore(locationLinesFor(day.entries, l.daysOffText, l.placeStyle), lb), scale, undefined, day.date, warnings,
        day.isDayOff ? 'The days-off text' : 'The place name', fonts))
    }
    const tl = l.time.enabled ? timeLinesFor(day.entries, e => e.time, l.placeStyle) : []
    if (tl.length) {
      const tb = off(rb(l.time))
      children.push(...boxEl(tb, withWordsBefore(tl, tb), scale, undefined, day.date, warnings, 'The time', fonts))
    }
    /* ══ 🔴 THE PLACE PICTURE, REPEATED PER ROW — exactly as the three text boxes are ═══════════
     * ⚠️ THE **FIRST** ENTRY'S PLACE. A stacked day has two events at two venues and one picture box;
     * the first is the one whose name and time are at the top of the row, so it is the one the picture
     * belongs beside. ⛔ A DAY OFF HAS NO ENTRY AND THEREFORE NO PICTURE — `ifMissing` does not apply,
     * because there is no place to have one, which is a different thing from a place with none. */
    if (l.placePicture.enabled && day.entries.length > 0) {
      /* ⚠️ ITS OWN OFFSET, NOT `off()`. That helper is typed to a `TextBox` because it is used for the
       * three text boxes; a picture box has no font and no colour, so widening it would have meant
       * giving this box fields nothing would ever read. */
      const pic = { ...l.placePicture, y: l.placePicture.y + dy }
      const el = placePictureEl(
        pic, pictureForEntry(day.entries[0], placePictures),
        placePictures?.logo ?? null, scale,
      )
      if (el) children.push(el)
    }
  })
  }

  // ── the note ────────────────────────────────────────────────────────────────────────────────────
  /* 🔴 THE NOTE BOX RENDERS ONLY WHEN THERE IS A NOTE — the brief's rule. An empty bordered area on
   * finished artwork looks like a mistake, and the operator placed the box for the weeks they have
   * something to say. */
  children.push(...noteEls(l.notes, note, scale, warnings, fonts, l.textStyle))

  children.push(poweredByEl(W, H, keepReadable, fonts))
  return { children, warnings, W, H, scale }
}

export interface EventTreeInput {
  layout: EventLayout
  entry: DayEntry
  /** 'YYYY-MM-DD' — the event's own date. */
  date: string
  fonts: FontBundle
  country?: CountryCode
  note?: string | null
  placePictures?: PlacePictureSources
}

/**
 * The single event poster's children, in paint order.
 *
 * 🔴 IT IS THE SAME DRAWING, NOT A SECOND ONE. `boxEl` (which runs `fitLines` and the readability
 * rule), `dateLines`, `locationLinesFor`, `timeLinesFor`, `noteEls` and `poweredByEl` are the weekly
 * poster's own functions. What differs is what this function passes them — one entry instead of seven
 * days, no row offset, and the cancelled look on the date box.
 */
export function eventTree(input: EventTreeInput): PosterTree {
  const { layout: l, entry, date, fonts, placePictures } = input
  const note = input.note
  const country: CountryCode = input.country ?? 'GB'
  /* 🔴 THE SAME ONE RESOLVER AS THE WEEKLY TREE AND AS THE EDITOR. See the note there. */
  const rb = <T extends TextBox>(b: T): T => resolveTextBox(l.textStyle, b)
  const scale = renderScale(l.width, l.height)
  const W = Math.round(l.width * scale)
  const H = Math.round(l.height * scale)
  const warnings: RenderWarning[] = []
  const children: El[] = []
  const entries = [entry]

  const dark = darkenEl(l.darken, W, H)
  if (dark) children.push(dark)

  /* 🔴 A SWITCHED-OFF BOX DRAWS NOTHING — not an empty box, not its panel. "Location off" means the
   * venue name is already printed on the truck's own picture, so anything drawn there would be a second
   * copy of it. The box keeps its coordinates in the design; only this skips it. */
  /* ⚠️ THE CANCELLED LOOK IS THE SAME ADD-ON AS THE WEEKLY POST'S DAY OFF, through the same field and
   * the same `undefined`-vs-`null` rule: a cancelled event takes `bgDayOff` if there is one, and an
   * ordinary event hands the band back to the box's own style. */
  const cancelledBand = entry.status === 'cancelled' ? (l.date.bgDayOff ?? null) : undefined
  if (l.date.enabled) {
    const db = rb(l.date)
    children.push(...boxEl(db, withWordsBefore(dateLines(date, db, l.dateStyle, country), db), scale, cancelledBand, date, warnings, 'The date', fonts))
  }
  /* ══ 🔴 VENUE AND TOWN ARE TWO BOXES ON A SINGLE EVENT POST (9 October 2026) ═══════════════════════
   * ⛔ THEY WERE ONE BOX AND A `placeStyle`, which drew the town as a second line inside it. That made
   * the town's position, size and colour un-editable — they were the venue's, scaled — so a truck who
   * wanted the town smaller, paler or somewhere else had no way to say so.
   * ⚠️ `'nameOnly'` IS PASSED TO `locationLinesFor` DELIBERATELY: the venue box must now print the NAME
   * and nothing else, whatever the stored `placeStyle` says, because the town has its own box. Passing
   * the stored style would draw the town twice on every design saved before the split.
   * ⛔ AND THE STRIKE-THROUGH STAYS ON THE VENUE. `locationLinesFor` applies it from `entry.status`,
   * and a cancelled event's crossed-out NAME is half of what says it is cancelled. */
  if (l.location.enabled) {
    const vb = rb(l.location)
    children.push(...boxEl(vb, withWordsBefore(locationLinesFor(entries, null, 'nameOnly'), vb), scale, undefined, date, warnings, 'The venue', fonts))
  }
  /* 🔴 THE TOWN'S OWN BOX. ⚠️ IT DRAWS NOTHING WHEN THE EVENT HAS NO TOWN — an empty bordered area on
   * finished artwork looks like a mistake, and the same rule the note box follows. */
  if (l.town.enabled) {
    const townLines = entries
      .map(e => e.town)
      .filter((t): t is string => !!t && !!t.trim())
      .map(t => ({ runs: [{ text: t }], strike: entries[0]?.status === 'cancelled' }))
    if (townLines.length) {
      const wb = rb(l.town)
      children.push(...boxEl(wb, withWordsBefore(townLines, wb), scale, undefined, date, warnings, 'The area', fonts))
    }
  }

  /* ⛔ THE FORMATTER IS STILL PASSED IN, AND IT IS NOW THE SAME ONE THE WEEKLY POST USES. `entry.time`
   * already carries the range form, built by `entryFor`; this re-formats from `startTime`/`endTime`
   * because THIS design's `timeStyle` decides the clock and `entryFor` was given the weekly design's.
   * ⚠️ A cancelled event still reads CANCELLED — `timeLinesFor` decides that before this is reached.
   * ⛔ `'nameOnly'` HERE TOO, AND FOR A DIFFERENT REASON. `timeLinesFor`'s `placeStyle` only controls a
   * blank SPACER line that kept the Time column level with a venue column that had a town under each
   * name. The town is its own box now, so the venue column has no second line and a spacer would push
   * the time down against nothing. */
  const tl = l.time.enabled
    ? timeLinesFor(entries, e => formatTimeRangeFor(e.startTime, e.endTime, l.timeStyle), 'nameOnly')
    : []
  if (tl.length) {
    const tb = rb(l.time)
    children.push(...boxEl(tb, withWordsBefore(tl, tb), scale, undefined, date, warnings, 'The time', fonts))
  }

  /* ══ 🔴 THE PLACE PICTURE, IN A BOX ═══════════════════════════════════════════════════════════
   * ⛔ ONLY FOR `placement: 'box'`. "Whole background" is not drawn here at all — it is the CALLER
   * choosing the place's Main picture as `backgroundDataUri`, which is the same mechanism a place's
   * own picture has always used (`resolveDesign`). Drawing it twice would put the venue's poster on
   * top of itself. */
  if (l.placePicture.enabled && l.placePicture.placement === 'box') {
    const el = placePictureEl(
      l.placePicture, pictureForEntry(entry, placePictures),
      placePictures?.logo ?? null, scale,
    )
    if (el) children.push(el)
  }

  /* ⚠️ THE NOTE IS FOR THIS POST ONLY and is not stored on the event — the same rule as the weekly
   * post's note, and the same "only render the box when there is something to put in it". */
  children.push(...noteEls(l.notes, note, scale, warnings, fonts, l.textStyle))

  children.push(poweredByEl(W, H, l.keepReadable, fonts))
  return { children, warnings, W, H, scale }
}
