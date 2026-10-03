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
}

export interface FitResult {
  /** The size to draw at, ≤ the chosen size and ≥ the floor. */
  fontSize: number
  /** The lines to draw, with any truncation already applied. */
  lines: FitLine[]
  /** true when at least one line had to be shortened. */
  truncated: boolean
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

const widthOfRuns = (runs: readonly TextRun[], m: FontMetrics, size: number): number => {
  let total = 0
  for (const r of runs) total += measureText(r.text, m, r.raised ? size * RAISED_SCALE : size)
  return total
}

const heightOfLines = (lines: readonly FitLine[], m: FontMetrics, size: number): number => {
  let total = 0
  for (const l of lines) total += lineHeightPx(m, size * (l.scale ?? 1)) * LINE_GAP
  return total
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
export function truncateRuns(runs: readonly TextRun[], m: FontMetrics, size: number, maxWidth: number): { runs: TextRun[]; truncated: boolean } {
  if (widthOfRuns(runs, m, size) <= maxWidth) return { runs: runs.slice(), truncated: false }
  const ellipsisW = measureText(ELLIPSIS, m, size)
  const budget = maxWidth - ellipsisW
  if (budget <= 0) return { runs: [{ text: ELLIPSIS }], truncated: true }

  const out: TextRun[] = []
  let used = 0
  for (const r of runs) {
    const runSize = r.raised ? size * RAISED_SCALE : size
    const full = measureText(r.text, m, runSize)
    if (used + full <= budget) { out.push({ ...r }); used += full; continue }
    // this run has to be cut
    let kept = ''
    for (const ch of r.text) {
      const next = kept + ch
      if (used + measureText(next, m, runSize) > budget) break
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
  const { lines, w, h, metrics: m } = input
  const asked = Math.max(ABSOLUTE_MIN_FONT, Math.round(input.fontSize))

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
  const perUnit = lines.reduce((sum, l) => sum + (lineHeightPx(m, 1) * (l.scale ?? 1) * LINE_GAP), 0)
  const maxByHeight = perUnit > 0 ? Math.floor(h / perUnit) : asked
  const ceiling = Math.max(ABSOLUTE_MIN_FONT, Math.min(asked, maxByHeight))
  const floor = Math.max(ABSOLUTE_MIN_FONT, Math.min(ceiling, Math.round(asked * MIN_FONT_FRACTION)))

  const fitsAt = (size: number) => {
    let widest = 0
    for (const l of lines) {
      const lw = widthOfRuns(l.runs, m, size * (l.scale ?? 1))
      if (lw > widest) widest = lw
    }
    return { ok: widest <= w && heightOfLines(lines, m, size) <= h, widest }
  }

  for (let size = ceiling; size >= floor; size--) {
    const f = fitsAt(size)
    if (f.ok) {
      return {
        fontSize: size,
        lines: lines.map(l => ({ ...l, runs: l.runs.slice() })),
        truncated: false,
        usedHeight: heightOfLines(lines, m, size),
        usedWidth: f.widest,
      }
    }
  }

  /* ── AT THE FLOOR AND STILL TOO BIG ───────────────────────────────────────────────────────────────
   * 🔴 HEIGHT IS SOLVED BY DROPPING LINES, WIDTH BY TRUNCATING THEM, and in that order. A box that
   * cannot hold four stacked events at the floor must show the first ones rather than overflow; the
   * dropped ones are reported like a truncation, so the operator is told either way. */
  let kept = lines.slice()
  while (kept.length > 1 && heightOfLines(kept, m, floor) > h) kept = kept.slice(0, -1)
  let truncated = kept.length !== lines.length
  const out = kept.map(l => {
    const size = floor * (l.scale ?? 1)
    const t = truncateRuns(l.runs, m, size, w)
    if (t.truncated) truncated = true
    return { ...l, runs: t.runs }
  })
  let widest = 0
  for (const l of out) {
    const lw = widthOfRuns(l.runs, m, floor * (l.scale ?? 1))
    if (lw > widest) widest = lw
  }
  return { fontSize: floor, lines: out, truncated, usedHeight: heightOfLines(out, m, floor), usedWidth: widest }
}
