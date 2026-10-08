// lib/weekly-post/fit.ts — make the text fit the box, and say so when it could not.
//
// ── 🔴 THE PROMISE THIS FILE KEEPS ─────────────────────────────────────────────────────────────────
// Text NEVER overflows a box and is NEVER clipped mid-glyph. The operator drags three outlines onto
// their own artwork once; from then on seven days of real place names go into those outlines
// unattended, and "Great Waldingfield Recreation Ground" is four times the width of "Lavenham".
//
// THE ORDER OF DEFENCES, and each exists because the one before it runs out:
//   1. SHRINK. Step the font size down until the longest line fits the width and every line fits the
//      height. This is what handles nearly all real names.
//   2. A FLOOR. Below ~35% of the chosen size the poster looks broken rather than tidy, so shrinking
//      stops there. Without a floor a 60-character name would render at 4px — technically inside the
//      box, and useless.
//   3. TRUNCATE with an ellipsis, measured so the ellipsis itself fits.
//   4. TELL THE OPERATOR. Any truncation is reported, naming the day, on the weekly-post screen —
//      because a silently shortened place name is the one failure they cannot see coming.
//
// ⚠️ MEASURED WITH THE FONT'S OWN METRICS (lib/weekly-post/ttf-metrics.ts), not estimated from
// character counts. "MONDAY" in Bebas Neue and in Merriweather differ by more than 40% at the same
// size; a per-character guess would either overflow or waste half the box.

import { lineHeightPx, measureText, type FontMetrics } from './ttf-metrics'
import type { TextRun } from './format'

/** One visual line: a sequence of runs drawn left to right. */
export interface FitLine {
  runs: TextRun[]
  /** Relative size for this line, e.g. the town line under a place name. Default 1. */
  scale?: number
  /** Drawn struck through — a cancelled event's place name. Carried through fitting untouched. */
  strike?: boolean
}

export interface FitInput {
  lines: FitLine[]
  /** The box, in native pixels. */
  w: number
  h: number
  /** The operator's chosen size — the ceiling. Fitting never grows past it. */
  fontSize: number
  metrics: FontMetrics

  /* ══ 🔴 THE THREE ADVANCED FIELDS THAT CHANGE WHAT "FITS" MEANS (6 October 2026) ═══════════════
   * ⛔ THEY ARE NOT COSMETIC AND THEY CANNOT BE APPLIED IN THE RENDERER ALONE. Letter spacing makes
   * every line wider, line spacing makes the block taller, and "use two lines" changes how many lines
   * there are. Drawing any of them without measuring them is how text that "fitted" lands outside its
   * box — the one thing this module promises never to happen. */

  /**
   * Native pixels between letters at `fontSize`. 0 = the font's own spacing.
   * ⚠️ IT SHRINKS WITH THE TEXT. When fitting steps the size down, the spacing steps down in
   * proportion, because it is a typographic measure and not a gap: 8px of tracking on 80px text is
   * elegant and on 20px text is a word puzzle.
   */
  letterSpacing?: number
  /** Percent of the font's natural line height. 100 = the spacing this renderer has always used. */
  lineSpacing?: number
  /**
   * "Use two lines" instead of shrinking.
   *
   * 🔴 IT IS TRIED BEFORE THE SIZE SEARCH, NOT AFTER IT. Wrapping a line that has already been shrunk
   * to fit would produce two small lines where one large one was possible — the operator asked for two
   * lines so the text could stay BIG, which only works if the wrap happens first and the search then
   * runs on the wrapped lines.
   */
  wrapToTwo?: boolean
}

export interface FitResult {
  /** The size to draw at, ≤ the chosen size and ≥ the floor. */
  fontSize: number
  /**
   * The letter spacing to DRAW at, already scaled to `fontSize`.
   *
   * 🔴 RETURNED RATHER THAN RECOMPUTED BY THE CALLER. If `boxEl` scaled the operator's value by its own
   * arithmetic and this module scaled it by a different one, every line would measure as fitting and
   * draw a little wider — the exact drift this module exists to prevent, and invisible until a long
   * place name.
   */
  letterSpacing: number
  /** The lines to draw, with any truncation already applied. */
  lines: FitLine[]
  /** true when at least one line had to be shortened. */
  truncated: boolean
  /**
   * The line height multiplier the lines were measured with — `LINE_GAP` times the operator's
   * "Line spacing", clamped.
   *
   * 🔴 RETURNED FOR THE SAME REASON `letterSpacing` IS, AND IT FIXED A SETTING THAT DREW NOTHING.
   * ⛔ `lineSpacing` WAS MEASURED HERE AND NEVER DRAWN: the element tree carried no `lineHeight` at
   * all, so satori stacked every line at the font's natural height whatever the operator had chosen.
   * A box would be made tall enough for 150% spacing and then drawn at 100% — the "a setting that does
   * nothing" failure this product's harnesses exist to catch, hiding inside the one module that
   * measures. 🔴 `draw.ts` NOW PUTS THIS ON EVERY RUN, which both makes the setting real and makes a
   * browser draw the lines where satori does (measured: at 100% the PNG is unchanged).
   */
  lineGap: number
  /** The height the lines will occupy at `fontSize`. */
  usedHeight: number
  /** The widest line at `fontSize`. */
  usedWidth: number
}

/**
 * A raised ordinal is drawn at this fraction of the line's size, lifted by `RAISED_LIFT` of it.
 * ⚠️ SHARED WITH THE RENDERER rather than duplicated: if measuring used 0.6 and drawing used 0.7, a
 * heading with a raised ordinal would measure as fitting and render one pixel over the edge.
 */
export const RAISED_SCALE = 0.6
export const RAISED_LIFT = 0.32

/** Lines are set this much apart, as a fraction of the font's natural line height. */
export const LINE_GAP = 1.0

/** The hard floor in native pixels, and the proportional one. See defence 2 above. */
export const ABSOLUTE_MIN_FONT = 8
export const MIN_FONT_FRACTION = 0.35

export const ELLIPSIS = '…'

const widthOfRuns = (runs: readonly TextRun[], m: FontMetrics, size: number, ls = 0): number => {
  let total = 0
  for (const r of runs) total += measureText(r.text, m, r.raised ? size * RAISED_SCALE : size, ls)
  return total
}

const heightOfLines = (lines: readonly FitLine[], m: FontMetrics, size: number, gap = LINE_GAP): number => {
  let total = 0
  for (const l of lines) total += lineHeightPx(m, size * (l.scale ?? 1)) * gap
  return total
}

/**
 * ══ 🔴 "USE TWO LINES": SPLIT ONE LINE AT A WORD BOUNDARY ════════════════════════════════════════
 *
 * ⚠️ SPLIT BY MEASURED WIDTH, NOT BY CHARACTER COUNT. "Great Waldingfield Recreation Ground" halved by
 * characters puts "Great Waldingfield Rec" over "reation Ground"; halved by width it breaks between
 * words and the two lines come out close to even, which is what makes it read as a deliberate wrap
 * rather than an accident.
 *
 * ⚠️ IT WORKS ACROSS RUNS. A date is three runs ("14", raised "th", " October"), so splitting the
 * first run's text alone would be unable to break "14th October" at all. Tokens carry their run's
 * `raised` flag and are regrouped afterwards, so a raised ordinal stays raised on whichever line it
 * lands on.
 *
 * ⛔ IT RETURNS THE LINE UNTOUCHED WHEN THERE IS NO SPACE TO BREAK AT. One long word cannot be wrapped
 * without hyphenating it, and inventing a hyphen in "Waldingfield" on someone's poster is worse than
 * shrinking it — so the size search takes over, which is the documented fallback and not a failure.
 */
export function splitRunsInTwo(
  runs: readonly TextRun[], m: FontMetrics, size: number, ls = 0,
): TextRun[][] | null {
  type Token = { text: string; raised: boolean; space: boolean }
  const tokens: Token[] = []
  for (const r of runs) {
    for (const piece of r.text.split(/(\s+)/)) {
      if (piece === '') continue
      tokens.push({ text: piece, raised: r.raised === true, space: /^\s+$/.test(piece) })
    }
  }
  /* ⚠️ A BREAK IS ONLY LEGAL AT A RUN OF WHITESPACE, and the whitespace itself is DROPPED — a trailing
   * space at the end of line one would be invisible but would still be measured and still shift a
   * centred line off centre. */
  const breaks = tokens.map((t, i) => (t.space ? i : -1)).filter(i => i > 0 && i < tokens.length - 1)
  if (!breaks.length) return null

  const regroup = (slice: readonly Token[]): TextRun[] => {
    const out: TextRun[] = []
    for (const t of slice) {
      const last = out[out.length - 1]
      if (last && (last.raised === true) === t.raised) last.text += t.text
      else out.push(t.raised ? { text: t.text, raised: true } : { text: t.text })
    }
    return out
  }

  let best: { at: number; diff: number } | null = null
  for (const at of breaks) {
    const left = regroup(tokens.slice(0, at))
    const right = regroup(tokens.slice(at + 1))
    const diff = Math.abs(widthOfRuns(left, m, size, ls) - widthOfRuns(right, m, size, ls))
    if (!best || diff < best.diff) best = { at, diff }
  }
  if (!best) return null
  return [regroup(tokens.slice(0, best.at)), regroup(tokens.slice(best.at + 1))]
}

/**
 * Shorten one line to `maxWidth`, by code point, keeping the ellipsis inside.
 *
 * 🔴 TRUNCATED BY CODE POINT, NEVER BY UTF-16 UNIT. Slicing a surrogate pair in half produces an
 * invalid string — which is the literal "clip mid-glyph" the brief forbids, in its worst form.
 * ⚠️ THE ELLIPSIS IS MEASURED FIRST and its width reserved, so the result including the ellipsis fits.
 * Appending it afterwards is how "shortened to fit" still overflows.
 * ⚠️ IT TRUNCATES THE LAST RUN THAT STILL HAS ROOM and drops the runs after it, so a raised ordinal at
 * the end of a heading disappears with the text it belonged to rather than floating alone.
 */
/** ⚠️ `ls` IS NOT OPTIONAL-BY-ACCIDENT: truncating without it over-fills a tracked line by one
 *  character per letter, so the ellipsis lands outside the box it was reserved space inside. */
export function truncateRuns(runs: readonly TextRun[], m: FontMetrics, size: number, maxWidth: number, ls = 0): { runs: TextRun[]; truncated: boolean } {
  if (widthOfRuns(runs, m, size, ls) <= maxWidth) return { runs: runs.slice(), truncated: false }
  const ellipsisW = measureText(ELLIPSIS, m, size, ls)
  const budget = maxWidth - ellipsisW
  if (budget <= 0) return { runs: [{ text: ELLIPSIS }], truncated: true }

  const out: TextRun[] = []
  let used = 0
  for (const r of runs) {
    const runSize = r.raised ? size * RAISED_SCALE : size
    const full = measureText(r.text, m, runSize, ls)
    if (used + full <= budget) { out.push({ ...r }); used += full; continue }
    // this run has to be cut
    let kept = ''
    for (const ch of r.text) {
      const next = kept + ch
      if (used + measureText(next, m, runSize, ls) > budget) break
      kept = next
    }
    if (kept) out.push({ ...r, text: kept })
    break                                  // everything after the cut run is dropped
  }
  out.push({ text: ELLIPSIS })
  return { runs: out, truncated: true }
}

/**
 * Fit `lines` into the box.
 *
 * ⚠️ IT STEPS DOWN IN WHOLE PIXELS rather than binary-searching a fractional size. Font sizes land on
 * integers in the stored design and in the renderer, so searching fractions would find a size that
 * then gets rounded — back to one that may not fit.
 */
export function fitLines(input: FitInput): FitResult {
  const { w, h, metrics: m } = input
  const asked = Math.max(ABSOLUTE_MIN_FONT, Math.round(input.fontSize))
  const askedLs = Number.isFinite(input.letterSpacing) ? (input.letterSpacing as number) : 0
  /* ⚠️ A NON-FINITE OR MISSING `lineSpacing` IS 100%, NOT `undefined * LINE_GAP`. That multiplication
   * gives NaN, every line height becomes NaN, `maxByHeight` becomes NaN, and the box renders at the
   * absolute minimum font — a bug that would look like "the renderer made my text tiny". */
  const lineSpacing = Number.isFinite(input.lineSpacing) ? (input.lineSpacing as number) : 100
  const gap = LINE_GAP * (Math.min(300, Math.max(50, lineSpacing)) / 100)
  /* 🔴 THE LETTER SPACING SHRINKS WITH THE FONT. One function, used by the search AND returned, so
   * what was measured is what is drawn. */
  const lsAt = (size: number) => (askedLs === 0 ? 0 : askedLs * (size / asked))

  /* ══ 🔴 "USE TWO LINES" RUNS FIRST — see `FitInput.wrapToTwo` ══════════════════════════════════
   * ⚠️ ONLY LINES THAT DO NOT ALREADY FIT ARE WRAPPED. Wrapping a short place name because the setting
   * is on would turn "Lavenham" into "Laven" / "ham"-shaped nonsense — well, into one word on a line
   * and nothing on the next — on every row that was never the problem. */
  const lines: FitLine[] = []
  for (const l of (input.lines)) {
    const lineAsked = asked * (l.scale ?? 1)
    if (!input.wrapToTwo || widthOfRuns(l.runs, m, lineAsked, lsAt(asked)) <= w) { lines.push(l); continue }
    const split = splitRunsInTwo(l.runs, m, lineAsked, lsAt(asked))
    if (!split) { lines.push(l); continue }
    lines.push({ ...l, runs: split[0] }, { ...l, runs: split[1] })
  }

  /* ══ 🔴 HEIGHT IS SOLVED FIRST, AND IT OVERRIDES THE FLOOR ═════════════════════════════
   * THE BUG THIS FIXES, found by the all-families sweep: "Great Waldingfield Recreation Ground" in a
   * 160×28 box. The width search stepped down to the proportional floor (20px) and truncated, which
   * fixed the WIDTH — but one line of Oswald at 20px is 29.6px tall, so it still overflowed the box
   * VERTICALLY. Truncation cannot fix height, and the floor was being applied to a dimension it cannot
   * help with.
   *
   * 🔴 SO THE CEILING IS CLAMPED TO WHAT THE HEIGHT ALLOWS BEFORE THE SEARCH BEGINS, and when that
   * is below the proportional floor, HEIGHT WINS. A line taller than its box is clipped — the one
   * thing this module promises never to do — and small-but-whole beats large-and-cut-off. Bounded
   * below by `ABSOLUTE_MIN_FONT`: past that the caller's box is simply too short for any text, the
   * renderer's `overflow: hidden` contains it, and the truncation flag reports it. */
  const perUnit = lines.reduce((sum, l) => sum + (lineHeightPx(m, 1) * (l.scale ?? 1) * gap), 0)
  const maxByHeight = perUnit > 0 ? Math.floor(h / perUnit) : asked
  const ceiling = Math.max(ABSOLUTE_MIN_FONT, Math.min(asked, maxByHeight))
  const floor = Math.max(ABSOLUTE_MIN_FONT, Math.min(ceiling, Math.round(asked * MIN_FONT_FRACTION)))

  const fitsAt = (size: number) => {
    let widest = 0
    for (const l of lines) {
      const lw = widthOfRuns(l.runs, m, size * (l.scale ?? 1), lsAt(size))
      if (lw > widest) widest = lw
    }
    return { ok: widest <= w && heightOfLines(lines, m, size, gap) <= h, widest }
  }

  for (let size = ceiling; size >= floor; size--) {
    const f = fitsAt(size)
    if (f.ok) {
      return {
        fontSize: size,
        letterSpacing: lsAt(size),
        lines: lines.map(l => ({ ...l, runs: l.runs.slice() })),
        truncated: false,
        lineGap: gap,
        usedHeight: heightOfLines(lines, m, size, gap),
        usedWidth: f.widest,
      }
    }
  }

  /* ── AT THE FLOOR AND STILL TOO BIG ───────────────────────────────────────────────────────────────
   * 🔴 HEIGHT IS SOLVED BY DROPPING LINES, WIDTH BY TRUNCATING THEM, and in that order. A box that
   * cannot hold four stacked events at the floor must show the first ones rather than overflow; the
   * dropped ones are reported like a truncation, so the operator is told either way. */
  let kept = lines.slice()
  while (kept.length > 1 && heightOfLines(kept, m, floor, gap) > h) kept = kept.slice(0, -1)
  let truncated = kept.length !== lines.length
  const out = kept.map(l => {
    const size = floor * (l.scale ?? 1)
    const t = truncateRuns(l.runs, m, size, w, lsAt(floor))
    if (t.truncated) truncated = true
    return { ...l, runs: t.runs }
  })
  let widest = 0
  for (const l of out) {
    const lw = widthOfRuns(l.runs, m, floor * (l.scale ?? 1), lsAt(floor))
    if (lw > widest) widest = lw
  }
  return {
    fontSize: floor, letterSpacing: lsAt(floor), lines: out, truncated,
    lineGap: gap,
    usedHeight: heightOfLines(out, m, floor, gap), usedWidth: widest,
  }
}
