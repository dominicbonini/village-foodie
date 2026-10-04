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
//   • NO NATIVE BINARIES. resvg and yoga are WASM (`next/dist/compiled/@vercel/og/*.wasm`), so there is
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
import { fontsForDesign, loadFontMetrics, resolveWeight, FONT_BY_ID, DEFAULT_FONT_ID } from './fonts'
import { fitLines, RAISED_LIFT, RAISED_SCALE, type FitLine } from './fit'
import { outlineShadow, readabilityFor } from './contrast'
import { dayAndMonthRuns, formatEventTime, headingRuns, weekdayName, type TextRun } from './format'
import { fontsUsedByEvent, MAX_RENDER_SIDE, type DateBox, type EventLayout, type Layout, type TextBox } from './layout'
import type { DayEntry, WeekData, WeekDay } from './week-data'

export const POWERED_BY = 'Powered by HatchGrab'

export interface RenderInput {
  layout: Layout
  week: WeekData
  /** The blank, as a data URI. ⚠️ A URI, not a path — satori fetches nothing from disk. */
  blankDataUri: string
  /** The week's note, if the operator wrote one. The note box renders only when this is non-empty. */
  note?: string | null
}

export interface RenderWarning {
  /** 'YYYY-MM-DD' for a day row, or 'heading' / 'note' / 'powered-by'. */
  where: string
  message: string
}

export interface RenderResult {
  png: Buffer
  width: number
  height: number
  /** Truncations and dropped stacked events, for the weekly-post screen. */
  warnings: RenderWarning[]
  ms: number
}

type El = { type: string; props: Record<string, unknown> }
const div = (style: Record<string, unknown>, children?: unknown): El =>
  ({ type: 'div', props: children === undefined ? { style } : { style, children } })

/**
 * The scale applied to everything.
 *
 * 🔴 THE LONGEST SIDE IS CAPPED AT 2160px (the brief's number) and the whole design is scaled by one
 * factor — never the image alone. Scaling the background and drawing the text at native coordinates
 * is the obvious bug here: the text would land in the wrong place on anything oversized, and only on
 * oversized blanks, so it would pass every test made with a 1080px one.
 */
export function renderScale(width: number, height: number): number {
  const longest = Math.max(width, height)
  return longest > MAX_RENDER_SIDE ? MAX_RENDER_SIDE / longest : 1
}

const familyOf = (fontId: string): string =>
  (FONT_BY_ID.get(fontId) ?? FONT_BY_ID.get(DEFAULT_FONT_ID)!).family

const justify = (a: TextBox['align']) =>
  a === 'center' ? 'center' : a === 'right' ? 'flex-end' : 'flex-start'

/** One fitted line, as a row of runs. Raised runs are smaller and lifted. */
function lineEl(line: FitLine, box: TextBox, size: number, shadow: string | undefined): El {
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
      fontFamily: familyOf(box.fontId),
      fontWeight: resolveWeight(box.fontId, box.bold),
      fontSize: `${(r.raised ? lineSize * RAISED_SCALE : lineSize).toFixed(2)}px`,
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
  keepReadable: boolean,
  panel: string | null,
  where: string,
  warnings: RenderWarning[],
  label: string,
): El[] {
  const metrics = loadFontMetrics(box.fontId, box.bold)
  const fit = fitLines({ lines, w: box.w, h: box.h, fontSize: box.fontSize, metrics })
  if (fit.truncated) {
    warnings.push({ where, message: `${label} did not fit and was shortened.` })
  }
  const read = readabilityFor(box.color, box.bgSample, keepReadable)
  const shadow = outlineShadow(read.outline, fit.fontSize * scale)
  const out: El[] = []
  if (panel) {
    out.push(div({
      position: 'absolute',
      left: `${box.x * scale}px`, top: `${box.y * scale}px`,
      width: `${box.w * scale}px`, height: `${box.h * scale}px`,
      backgroundColor: panel,
      display: 'flex',
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
  }, fit.lines.map(l => lineEl(l, box, fit.fontSize * scale, shadow))))
  return out
}

/** The Date box's lines: two ("MONDAY" / "28TH SEPTEMBER") or one. */
/** ⚠️ TAKES THE DATE, NOT THE DAY, so the single-event post uses this exact function rather than a
 *  copy with the same ordinal and capitals logic in it. */
function dateLines(dateYmd: string, box: DateBox): FitLine[] {
  const c = { caps: box.caps, raisedOrdinals: box.raisedOrdinals }
  const name = weekdayName(dateYmd, c)
  const dm = dayAndMonthRuns(dateYmd, c)
  if (box.twoLines) return [{ runs: [{ text: name }] }, { runs: dm }]
  return [{ runs: [{ text: name + ' ' }, ...dm] }]
}

/**
 * The Location box's lines for one day.
 *
 * 🔴 A CANCELLED EVENT'S NAME IS CROSSED OUT. satori supports `textDecoration: 'line-through'`, so
 * this is the real thing rather than a drawn line that would have to be positioned per font.
 * ⚠️ THE TOWN IS A SMALLER SECOND LINE (`scale`), and only when `townLine` kept it — the suppression
 * rule lives in week-data.ts so the caption and the poster agree.
 */
/** ⚠️ TAKES ENTRIES, NOT A DAY. One event is a list of one, so the single-event post gets the same
 *  strike-through rule and the same town-line treatment without a second implementation. */
function locationLinesFor(entries: readonly DayEntry[], daysOffText: string | null): FitLine[] {
  if (entries.length === 0) return daysOffText ? [{ runs: [{ text: daysOffText }] }] : []
  const out: FitLine[] = []
  for (const e of entries) {
    const strike = e.status === 'cancelled'
    out.push({ runs: [{ text: e.name }], strike })
    /* ⚠️ PER ENTRY, NOT PER DAY. A day with one cancelled event and one going ahead must strike
     * only the cancelled one — striking the whole box would tell customers the truck is not coming
     * when it is. */
    if (e.town) out.push({ runs: [{ text: e.town }], scale: 0.62, strike })
  }
  return out
}

/**
 * The Time box's lines.
 *
 * ⚠️ ONE LINE PER ENTRY, PLUS A SPACER WHERE THE LOCATION HAS A TOWN LINE, so the two boxes stay in
 * step down a stacked day. Without the spacer the second event's time sits beside the first event's
 * town, which reads as the wrong time against the wrong place — on a poster, that is worse than no
 * time at all.
 * ⚠️ A DAY OFF HAS NO TIME BOX AT ALL (the brief: "Time empty"), so this returns nothing and the
 * caller skips the box rather than drawing an empty one.
 */
const timeLinesFor = (entries: readonly DayEntry[], textOf: (e: DayEntry) => string): FitLine[] => {
  if (entries.length === 0) return []
  const out: FitLine[] = []
  for (const e of entries) {
    /* 🔴 "CANCELLED" WINS OVER ANY TIME FORMAT, on both posters. The single-event post passes its own
     * `textOf` for the "From 5pm" form; this branch is above it so a cancelled event can never be given
     * a time by a display setting. */
    out.push({ runs: [{ text: e.status === 'cancelled' ? 'CANCELLED' : textOf(e) }] })
    if (e.town) out.push({ runs: [{ text: ' ' }], scale: 0.62 })
  }
  // every entry had an empty time and no town ⇒ nothing to draw
  return out.some(l => l.runs.some(r => r.text.trim() !== '')) ? out : []
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
  const { layout: l, week } = input
  const keepReadable = l.keepReadable
  const scale = renderScale(l.width, l.height)
  const W = Math.round(l.width * scale)
  const H = Math.round(l.height * scale)
  const warnings: RenderWarning[] = []

  const children: El[] = []

  // ── the heading ─────────────────────────────────────────────────────────────────────────────────
  const hRuns = headingRuns(l.heading.text, week.range.start, week.range.end,
    { caps: l.heading.caps, raisedOrdinals: l.heading.raisedOrdinals })
  children.push(...boxEl(l.heading, [{ runs: hRuns }], scale, l.keepReadable, null, 'heading', warnings, 'The heading'))

  // ── the seven rows ──────────────────────────────────────────────────────────────────────────────
  /* 🔴 ROWS 2–7 ARE ROW 1'S BOXES, OFFSET. The operator places three outlines once; the other six days
   * are the same three boxes plus `rowSpacing × n`. Storing seven sets would let them drift apart and
   * would make "the other six days copy it" a promise the data could break. */
  week.days.forEach((day, i) => {
    const dy = l.rowSpacing * i
    const off = <T extends TextBox>(b: T): T => ({ ...b, y: b.y + dy })
    const dateBox = off(l.date)
    const panel = day.isDayOff ? l.date.bgDayOff : l.date.bgTrading
    children.push(...boxEl(dateBox, dateLines(day.date, l.date), scale, l.keepReadable, panel, day.date, warnings, 'The date'))
    children.push(...boxEl(off(l.location), locationLinesFor(day.entries, l.daysOffText), scale, l.keepReadable, null, day.date, warnings,
      day.isDayOff ? 'The days-off text' : 'The place name'))
    const tl = timeLinesFor(day.entries, e => e.time)
    if (tl.length) {
      children.push(...boxEl(off(l.time), tl, scale, l.keepReadable, null, day.date, warnings, 'The time'))
    }
  })

  // ── the note ────────────────────────────────────────────────────────────────────────────────────
  /* 🔴 THE NOTE BOX RENDERS ONLY WHEN THERE IS A NOTE — the brief's rule. An empty bordered area on
   * finished artwork looks like a mistake, and the operator placed the box for the weeks they have
   * something to say. */
  const note = String(input.note ?? '').trim()
  if (l.note && note) {
    children.push(...boxEl(l.note, [{ runs: [{ text: note }] }], scale, l.keepReadable, null, 'note', warnings, 'The note'))
  }

  children.push(poweredByEl(W, H, keepReadable))
  const png = await paint(children, W, H, input.blankDataUri, fontsUsed(l))
  return { png, width: W, height: H, warnings, ms: Date.now() - t0 }
}

function fontsUsed(l: Layout): Array<{ id: string; bold: boolean }> {
  const boxes: TextBox[] = [l.heading, l.date, l.location, l.time]
  if (l.note) boxes.push(l.note)
  return boxes.map(b => ({ id: b.fontId, bold: b.bold }))
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// SHARED BY BOTH POSTERS
// ════════════════════════════════════════════════════════════════════════════════════════════════

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
function poweredByEl(W: number, H: number, keepReadable: boolean): El {
  const pbSize = Math.max(9, Math.round(H * 0.013))
  return div({
    position: 'absolute',
    left: 0, top: `${H - Math.round(pbSize * 2.1)}px`, width: `${W}px`,
    display: 'flex', justifyContent: 'center',
  }, [div({
    display: 'flex',
    fontFamily: familyOf(DEFAULT_FONT_ID),
    fontWeight: 400,
    fontSize: `${pbSize}px`,
    color: '#ffffff',
    opacity: 0.85,
    ...(keepReadable ? { textShadow: `0px 1px ${Math.max(1, Math.round(pbSize * 0.18))}px #0b0b0bcc` } : {}),
    whiteSpace: 'pre',
  }, POWERED_BY)])
}

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
  fonts: Array<{ id: string; bold: boolean }>,
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

  const loaded = fontsForDesign([
    ...fonts,
    // the mark always needs the default family available
    { id: DEFAULT_FONT_ID, bold: false },
  ])

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
}

/**
 * One event, on the truck's own picture.
 *
 * 🔴 IT IS THE SAME RENDERER, NOT A SECOND ONE. Every piece that decides what the poster looks like is
 * shared with the weekly post and called from here: `boxEl` (which runs `fitLines` and the readability
 * rule), `dateLines`, `locationLinesFor`, `timeLinesFor`, `poweredByEl` and `paint`. What differs is
 * what this file passes them — one entry instead of seven days, no row offset, and the "From 5pm" time
 * form. A fork would have been two answers to "does this text fit", on artwork a truck posts.
 *
 * ⚠️ NO DAYS-OFF TEXT. A single-event post is made *for* an event, so "no trading today" has no meaning
 * here; `locationLinesFor` is passed `null` and renders nothing if the entry is somehow empty.
 */
export async function renderEventPost(input: EventRenderInput): Promise<RenderResult> {
  const t0 = Date.now()
  const { layout: l, entry, date } = input
  const scale = renderScale(l.width, l.height)
  const W = Math.round(l.width * scale)
  const H = Math.round(l.height * scale)
  const warnings: RenderWarning[] = []
  const children: El[] = []
  const entries = [entry]

  /* 🔴 A SWITCHED-OFF BOX DRAWS NOTHING — not an empty box, not its panel. "Location off" means the
   * venue name is already printed on the truck's own picture, so anything drawn there would be a second
   * copy of it. The box keeps its coordinates in the design; only this skips it. */
  const panel = entry.status === 'cancelled' ? l.date.bgDayOff : l.date.bgTrading
  if (l.date.enabled) {
    children.push(...boxEl(l.date, dateLines(date, l.date), scale, l.keepReadable, panel, date, warnings, 'The date'))
  }
  if (l.location.enabled) {
    children.push(...boxEl(l.location, locationLinesFor(entries, null), scale, l.keepReadable, null, date, warnings, 'The place name'))
  }

  /* 🔴 THE TIME FORM IS THIS DESIGN'S CHOICE, APPLIED HERE. `entry.time` already carries the range form
   * (built by `entryFor` for the weekly post); passing a formatter lets the event design say "From 5pm"
   * without `entryFor` having to know which poster is asking. A cancelled event still reads CANCELLED —
   * `timeLinesFor` decides that before this formatter is reached. */
  const tl = l.time.enabled
    ? timeLinesFor(entries, e => formatEventTime(e.startTime, e.endTime, l.timeStyle, l.timeDisplay))
    : []
  if (tl.length) {
    children.push(...boxEl(l.time, tl, scale, l.keepReadable, null, date, warnings, 'The time'))
  }

  /* ⚠️ THE NOTE IS FOR THIS POST ONLY and is not stored on the event — the same rule as the weekly
   * post's note, and the same "only render the box when there is something to put in it". */
  const note = String(input.note ?? '').trim()
  if (l.note && note) {
    children.push(...boxEl(l.note, [{ runs: [{ text: note }] }], scale, l.keepReadable, null, 'note', warnings, 'The note'))
  }

  children.push(poweredByEl(W, H, l.keepReadable))
  const png = await paint(children, W, H, input.backgroundDataUri, fontsUsedByEvent(l))
  return { png, width: W, height: H, warnings, ms: Date.now() - t0 }
}
