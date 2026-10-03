// lib/weekly-post/layout.ts — the shape of a saved design, and the only thing that decides a design
// is valid.
//
// ── 🔴 WHY THIS IS VALIDATED SERVER-SIDE AND NOT TRUSTED ────────────────────────────────────────────
// The layout is a `jsonb` column written from the browser and then read by a RENDERER that positions
// text from it. An unchecked number reaches satori as `left: NaN` (silently nothing drawn), a negative
// font size throws inside the layout engine, and a 10,000px box turns a 40ms render into a timeout.
// None of those show up as "invalid design" — they show up as a blank or failed post, later, with no
// clue why. So every field is parsed, bounded and defaulted here, and `validateLayout` is the only way
// a layout enters the system.
//
// 🔴 COORDINATES ARE IN THE BLANK IMAGE'S OWN PIXELS, always. The editor shows the blank scaled down
// and converts on the way in and out; the renderer draws at native size. One coordinate space means a
// design made on a phone renders identically to one made on a desktop — the scale factor never
// reaches storage, so it can never be stored wrong.

// ⚠️ `./font-list`, NOT `./fonts`. This module is imported by the EDITOR, which is a client
// component; `./fonts` reads the filesystem and pulling it into the browser bundle fails the build.
import { DEFAULT_FONT_ID, FONT_BY_ID } from './font-list'
import { DEFAULT_HEADING } from './format'
import type { TimeStyle } from './format'

export const LAYOUT_VERSION = 1 as const

/** The largest side the renderer will produce. Anything bigger is scaled on upload. */
export const MAX_RENDER_SIDE = 2160
/** Uploads below this on the short side are refused: text on a 300px-wide blank cannot be read. */
export const MIN_UPLOAD_SHORT_SIDE = 600
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export type Align = 'left' | 'center' | 'right'

export interface BoxRect {
  /** Native-pixel offsets from the blank's top-left. */
  x: number
  y: number
  w: number
  h: number
}

export interface TextStyle {
  fontId: string
  /** Native pixels. The renderer shrinks DOWN from this to fit; it never grows past it. */
  fontSize: number
  bold: boolean
  /** '#rrggbb'. */
  color: string
  align: Align
  caps: boolean
  raisedOrdinals: boolean
}

export interface TextBox extends BoxRect, TextStyle {
  /**
   * The averaged colour of the blank under this box, written by the editor's canvas sampler.
   *
   * 🔴 IT IS STORED RATHER THAN COMPUTED AT RENDER TIME because sampling needs to decode a PNG **or
   * a JPG** and nothing on the server can: no sharp, no canvas, no jpeg library, and satori takes an
   * image in without exposing pixels. The browser has a decoder for both, so the editor samples when
   * a box is placed or moved and stores the answer. lib/weekly-post/contrast.ts explains the split.
   * ⚠️ NULL IS A REAL STATE and means "not sampled" — the renderer then adds no shadow at all rather
   * than guessing a background and altering someone's artwork on no evidence.
   */
  bgSample: { r: number; g: number; b: number } | null
}

export interface DateBox extends TextBox {
  /** Two lines ("MONDAY" / "28TH SEPTEMBER") or one. */
  twoLines: boolean
  /** Optional panel behind the date on a trading day. null = none. */
  bgTrading: string | null
  /** Optional panel behind the date on a day off. null = none. */
  bgDayOff: string | null
}

export interface HeadingBox extends TextBox {
  /** Supports {start} and {end}. */
  text: string
}

/**
 * The note box has no fields of its own — it is a text box, named.
 * ⚠️ A TYPE ALIAS RATHER THAN AN EMPTY INTERFACE: an interface with no members is identical to its
 * supertype and the linter says so. The NAME is the point — `Layout.note` reading `NoteBox | null`
 * says what it is, where `TextBox | null` would not.
 */
export type NoteBox = TextBox

export interface Layout {
  version: typeof LAYOUT_VERSION
  /** The blank's native size, stored so a reopened design does not depend on re-reading the image. */
  width: number
  height: number
  heading: HeadingBox
  /** Row 1's three boxes. Rows 2–7 are these, offset by `rowSpacing` × n. */
  date: DateBox
  location: TextBox
  time: TextBox
  /** Optional. Only rendered when the week actually has a note. */
  note: NoteBox | null
  /** Vertical distance between one row's top and the next's, in native pixels. */
  rowSpacing: number
  /** What Location shows on a day with no event. */
  daysOffText: string
  timeStyle: TimeStyle
  /** Add a shadow/outline where the chosen colour would be unreadable. Never changes the colour. */
  keepReadable: boolean
  /** Show cancelled events (crossed out, "CANCELLED"). */
  showCancelled: boolean
  /** The filled example shown faintly under the editor, 0–1. 0 = off. */
  exampleOpacity: number
}

export const DEFAULT_DAYS_OFF_TEXT = 'No trading today'

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE DEFAULT DESIGN
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * A first layout for a freshly uploaded blank.
 *
 * 🔴 PROPORTIONAL TO THE IMAGE, not fixed pixels, because blanks range from 1080×1080 to 1080×1920 to
 * whatever Canva exported. The numbers below put the heading across the top and row 1 in the upper
 * third with seven rows fitting inside the frame — a starting point the operator drags, not a guess
 * at their artwork.
 * ⚠️ `rowSpacing` IS DERIVED FROM THE HEIGHT so seven rows always fit on first open. A fixed 120px
 * would run off the bottom of a square blank and the operator's first impression would be a broken
 * preview.
 */
export function defaultLayout(width: number, height: number): Layout {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  const pad = Math.round(w * 0.06)
  const headingH = Math.round(h * 0.08)
  const top = Math.round(h * 0.2)
  const bottom = Math.round(h * 0.93)
  const spacing = Math.max(24, Math.floor((bottom - top) / 7))
  const rowH = Math.max(18, Math.round(spacing * 0.78))
  const inner = w - pad * 2
  const dateW = Math.round(inner * 0.3)
  const timeW = Math.round(inner * 0.26)
  const locW = inner - dateW - timeW - Math.round(w * 0.03)

  const base = {
    fontId: DEFAULT_FONT_ID,
    bold: false,
    color: '#ffffff',
    caps: true,
    raisedOrdinals: false,
    // ⚠️ UNSAMPLED UNTIL THE EDITOR SAMPLES IT. A default design has never been shown a blank's
    // pixels, so claiming a background here would be inventing one.
    bgSample: null as { r: number; g: number; b: number } | null,
  }
  return {
    version: LAYOUT_VERSION,
    width: w,
    height: h,
    heading: {
      ...base, x: pad, y: Math.round(h * 0.07), w: inner, h: headingH,
      fontSize: Math.round(headingH * 0.5), align: 'center', caps: true,
      text: DEFAULT_HEADING,
    },
    date: {
      ...base, x: pad, y: top, w: dateW, h: rowH,
      fontSize: Math.round(rowH * 0.34), align: 'left',
      twoLines: true, bgTrading: null, bgDayOff: null,
    },
    location: {
      ...base, x: pad + dateW + Math.round(w * 0.015), y: top, w: locW, h: rowH,
      fontSize: Math.round(rowH * 0.4), align: 'left', caps: false,
    },
    time: {
      ...base, x: w - pad - timeW, y: top, w: timeW, h: rowH,
      fontSize: Math.round(rowH * 0.4), align: 'right',
    },
    note: null,
    rowSpacing: spacing,
    daysOffText: DEFAULT_DAYS_OFF_TEXT,
    timeStyle: '12h',
    keepReadable: true,
    showCancelled: true,
    exampleOpacity: 0,
  }
}

/** A note box, when the operator adds one. Placed under row 7 so it does not land on a day. */
export function defaultNoteBox(l: Layout): NoteBox {
  const lastRowBottom = l.date.y + l.rowSpacing * 6 + l.date.h
  const pad = l.heading.x
  return {
    bgSample: null,
    fontId: l.location.fontId,
    fontSize: Math.max(10, Math.round(l.location.fontSize * 0.85)),
    bold: false,
    color: l.location.color,
    align: 'center',
    caps: false,
    raisedOrdinals: false,
    x: pad,
    y: Math.min(l.height - 40, lastRowBottom + Math.round(l.rowSpacing * 0.2)),
    w: l.width - pad * 2,
    h: Math.max(24, Math.round(l.date.h * 0.7)),
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// VALIDATION
// ════════════════════════════════════════════════════════════════════════════════════════════════

export interface ValidationResult {
  ok: boolean
  /** Present when ok. Fully normalised — every field bounded, no NaN, no missing key. */
  layout?: Layout
  /** Plain sentences, safe to show an operator. */
  errors: string[]
}

const HEX = /^#[0-9a-fA-F]{6}$/

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * A finite number within bounds, or null.
 *
 * 🔴 `Number.isFinite`, NOT `typeof === 'number'`. `NaN` and `Infinity` are both numbers and both
 * reach satori as a silently undrawn element — the single most likely way a bad layout produces a
 * blank poster rather than an error.
 * ⚠️ STRINGS ARE REJECTED, not coerced. `"120"` from a hand-edited payload should fail loudly rather
 * than work by accident and then stop working when something compares it to a number.
 */
function num(v: unknown, min: number, max: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  const r = Math.round(v)
  return r >= min && r <= max ? r : null
}

function str(v: unknown, maxLen: number): string | null {
  if (typeof v !== 'string') return null
  const s = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim()
  return s.length <= maxLen ? s : null
}

const bool = (v: unknown, dflt: boolean): boolean => (typeof v === 'boolean' ? v : dflt)

const align = (v: unknown): Align => (v === 'left' || v === 'center' || v === 'right' ? v : 'left')

const colour = (v: unknown, dflt: string): string => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : dflt)

const optColour = (v: unknown): string | null =>
  v === null || v === undefined ? null : (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : null)

/**
 * Parse one text box.
 *
 * ⚠️ THE BOX MUST BE INSIDE THE IMAGE, and that is checked rather than clamped for position: a box at
 * x = 5000 on a 1080 blank is not a near-miss to be nudged, it is a payload that did not come from the
 * editor. Sizes ARE clamped, because a one-pixel-tall box is a plausible drag.
 */
function parseBox(
  v: unknown,
  path: string,
  W: number,
  H: number,
  errors: string[],
  dfltColour: string,
): TextBox | null {
  if (!isObj(v)) { errors.push(`${path} is missing.`); return null }
  const x = num(v.x, 0, W)
  const y = num(v.y, 0, H)
  const w = num(v.w, 8, W)
  const h = num(v.h, 8, H)
  if (x === null || y === null || w === null || h === null) {
    errors.push(`${path} has a position or size that is not a number inside the image.`)
    return null
  }
  if (x + w > W + 1 || y + h > H + 1) {
    errors.push(`${path} reaches outside the image.`)
    return null
  }
  const fontId = typeof v.fontId === 'string' && FONT_BY_ID.has(v.fontId) ? v.fontId : DEFAULT_FONT_ID
  /* ⚠️ THE FONT SIZE CEILING IS THE IMAGE HEIGHT. Bigger than the whole poster is meaningless, and it
   * is the value that most affects render time, because satori lays out every glyph. */
  const fontSize = num(v.fontSize, 6, H) ?? Math.max(10, Math.round(h * 0.5))
  return {
    x, y, w, h,
    fontId,
    fontSize,
    bold: bool(v.bold, false),
    color: colour(v.color, dfltColour),
    align: align(v.align),
    caps: bool(v.caps, false),
    raisedOrdinals: bool(v.raisedOrdinals, false),
    bgSample: parseSample(v.bgSample),
  }
}

/**
 * A stored background sample, or null.
 *
 * ⚠️ OUT-OF-RANGE CHANNELS MAKE THE WHOLE SAMPLE NULL rather than being clamped. A clamped bad
 * sample is a confident wrong answer about readability; no sample is an honest "we do not know", and
 * the renderer's behaviour for that is to leave the artwork alone.
 */
function parseSample(v: unknown): { r: number; g: number; b: number } | null {
  if (!isObj(v)) return null
  const r = num(v.r, 0, 255), g = num(v.g, 0, 255), b = num(v.b, 0, 255)
  return r === null || g === null || b === null ? null : { r, g, b }
}

/**
 * The gate. Returns a fully normalised layout or a list of plain errors.
 *
 * ⚠️ IT NEEDS THE IMAGE SIZE and takes it as an argument rather than trusting the payload's own
 * `width`/`height`. The size is a fact about the stored file; letting a client declare it would let a
 * payload claim a 10,000px blank and have every box pass the bounds check.
 */
export function validateLayout(input: unknown, width: number, height: number): ValidationResult {
  const errors: string[] = []
  const W = num(width, 1, 20000)
  const H = num(height, 1, 20000)
  if (W === null || H === null) return { ok: false, errors: ['The design image size is not known.'] }
  if (!isObj(input)) return { ok: false, errors: ['The design is missing.'] }
  if (input.version !== LAYOUT_VERSION) {
    errors.push(`This design was saved by a different version of the editor (expected ${LAYOUT_VERSION}).`)
    return { ok: false, errors }
  }

  const heading = parseBox(input.heading, 'The heading box', W, H, errors, '#ffffff')
  const date = parseBox(input.date, 'The date box', W, H, errors, '#ffffff')
  const location = parseBox(input.location, 'The location box', W, H, errors, '#ffffff')
  const time = parseBox(input.time, 'The time box', W, H, errors, '#ffffff')
  const noteRaw = input.note
  const note = noteRaw === null || noteRaw === undefined
    ? null
    : parseBox(noteRaw, 'The note box', W, H, errors, '#ffffff')

  /* 🔴 ROW SPACING HAS A FLOOR AND A CEILING, AND THE CEILING IS THE IMAGE HEIGHT. 0 would stack all
   * seven days on one line (unreadable, and the operator cannot tell why); a huge value pushes six
   * rows off the bottom, which renders fine and looks like the renderer dropped them. */
  const rowSpacing = num(input.rowSpacing, 1, H)
  if (rowSpacing === null) errors.push('The row spacing must be a number of pixels.')

  const headingText = str(isObj(input.heading) ? input.heading.text : undefined, 200)
  if (headingText === null) errors.push('The heading text is too long (200 characters maximum).')
  const daysOffText = str(input.daysOffText, 60)
  if (daysOffText === null) errors.push('The days-off text is too long (60 characters maximum).')

  const timeStyle: TimeStyle = input.timeStyle === '24h' ? '24h' : '12h'
  const exampleOpacity = typeof input.exampleOpacity === 'number' && Number.isFinite(input.exampleOpacity)
    ? Math.min(1, Math.max(0, input.exampleOpacity))
    : 0

  if (errors.length || !heading || !date || !location || !time || rowSpacing === null) {
    return { ok: false, errors: errors.length ? errors : ['The design could not be read.'] }
  }

  /* ⚠️ THE SEVEN ROWS ARE CHECKED AGAINST THE BOTTOM OF THE IMAGE — a warning, not an error. The
   * operator may genuinely want the last row near the edge, and refusing to save would be worse than
   * telling them. The renderer draws whatever fits and the weekly-post screen reports the rest. */
  const layout: Layout = {
    version: LAYOUT_VERSION,
    width: W,
    height: H,
    heading: { ...heading, text: headingText || '' },
    date: {
      ...date,
      twoLines: bool(isObj(input.date) ? input.date.twoLines : undefined, true),
      bgTrading: optColour(isObj(input.date) ? input.date.bgTrading : null),
      bgDayOff: optColour(isObj(input.date) ? input.date.bgDayOff : null),
    },
    location,
    time,
    note,
    rowSpacing,
    daysOffText: daysOffText || DEFAULT_DAYS_OFF_TEXT,
    timeStyle,
    keepReadable: bool(input.keepReadable, true),
    showCancelled: bool(input.showCancelled, true),
    exampleOpacity,
  }
  return { ok: true, layout, errors: [] }
}

/** Does the seventh row fit inside the image? Reported to the operator, never used to refuse a save. */
export function rowsFitWarning(l: Layout): string | null {
  const bottom = Math.max(
    l.date.y + l.rowSpacing * 6 + l.date.h,
    l.location.y + l.rowSpacing * 6 + l.location.h,
    l.time.y + l.rowSpacing * 6 + l.time.h,
  )
  return bottom > l.height
    ? `The last day falls ${Math.round(bottom - l.height)}px below the bottom of the image — reduce the row spacing or move row 1 up.`
    : null
}

/** Every (font, bold) pair a layout uses, for the renderer's font list. */
export function fontsUsedBy(l: Layout): Array<{ id: string; bold: boolean }> {
  const boxes: TextStyle[] = [l.heading, l.date, l.location, l.time]
  if (l.note) boxes.push(l.note)
  return boxes.map(b => ({ id: b.fontId, bold: b.bold }))
}
