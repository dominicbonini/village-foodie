// lib/weekly-post/days.ts — "The 7 days": ONE box on the poster, seven rows inside it, and the ONE
// function that decides where every part of every row goes.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHAT THIS REPLACES, AND WHY IT IS A NEW MODEL RATHER THAN A RENAME
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// The weekly design used to be THREE INDEPENDENT BOXES (`date`, `location`, `time`) plus a picture
// box, each placed by hand, and `rowSpacing` — a pixel distance that copied all four down six times.
// Five numbers an operator had to get right before the poster looked like a table:
//
//   • the three boxes had to be given the same height and the same top, or Monday's place name sat a
//     few pixels above Monday's time;
//   • their widths had to add up to less than the picture's width, with gaps the operator eyeballed;
//   • `rowSpacing` had to be larger than the tallest box or the rows overlapped, and small enough that
//     the seventh row stayed on the artwork — `rowsFitWarning` exists because it so often was not.
//
// 🔴 SO THE SEVEN DAYS ARE ONE BOX NOW. Drag it to move all seven rows; pull a corner to scale the
// rows AND the words inside them; pull a side to stretch. The rows share its height equally, so they
// cannot drift apart, and the parts of a row share its width by WEIGHT, so they cannot overlap.
// ⛔ "Gap between days" IS GONE AS A SETTING — it is `h / 7` now, which is not a thing to get wrong.
//
// ── 🔴 THE PARTS ARE LAID OUT HERE AND NOWHERE ELSE ────────────────────────────────────────────────
// `lib/weekly-post/render.ts` positions satori elements from `dayCells()`; `components/manage/
// DesignEditor.tsx` draws its click targets and its ⇔ handles from the SAME call. That is the brief's
// own requirement ("the editor preview and the satori renderer must keep resolving through shared
// functions so they can't drift") and it is the reason this file is pure, synchronous and free of any
// import that is not browser-safe: the editor is a client component.
//
// ⚠️ EVERY COORDINATE IS IN THE PICTURE'S OWN PIXELS, like every other box in `layout.ts`. The editor
// scales on the way in and out; the renderer draws at native size.

import type { BoxRect } from './layout'

/**
 * The four things a day's row can show.
 *
 * ⚠️ `dayDate`, `place` AND `times` ARE **STYLED** BY THE EXISTING `date`, `location` AND `time`
 * BOXES, and that is deliberate: their font, colour, capitals, date wording, time wording, effects and
 * "own style" flag are already there, already validated, already resolved through `resolveTextBox`,
 * and already what the settings panel edits. ⛔ GIVING THE PARTS THEIR OWN STYLE FIELDS WOULD HAVE
 * BEEN A SECOND SET OF TEXT SETTINGS on one design — two places for a font to be stored and one of
 * them wrong. What those boxes NO LONGER decide is their own x/y/w/h: this file does.
 */
export type DayPartKey = 'picture' | 'dayDate' | 'place' | 'times'

export const DAY_PART_KEYS: readonly DayPartKey[] = ['picture', 'dayDate', 'place', 'times']

/**
 * How one row is arranged. ⚠️ THE THREE "QUICK LAYOUTS" ARE THESE THREE VALUES plus a set of weights —
 * see `QUICK_LAYOUTS`.
 *
 * 🔴 `oneLine` IS WHAT EVERY DESIGN SAVED BEFORE TODAY CONVERTS TO, because a legacy row WAS one line:
 * three boxes side by side at the same height.
 */
export type DaysArrangement = 'oneLine' | 'dayOnTop' | 'bigPicture'

/** The picture's shape. ⚠️ `circle` is a radius of half the side — not a fourth drawing path. */
export type PictureShape = 'square' | 'rounded' | 'circle'

/**
 * What a day with no event shows.
 *
 * ⛔ `omit` LEAVES THE ROW'S **SLOT** WHERE IT IS and draws nothing in it. The other reading —
 * redistributing the height so six days fill the box — was rejected and the reason is the editor: the
 * outline shows seven equal rows, and a poster whose rows moved with the week's data would make that
 * outline a lie, and would move every other day away from where the operator put it. ⚠️ Said out loud
 * in docs/social-tab-6-report.md because the brief's two words do not choose between them.
 */
export type DaysOffMode = 'message' | 'omit'

/** One part, and how much room it asks for. ⚠️ A SHARE, NOT A PIXEL WIDTH — see `dayCells`. */
export interface DayPart {
  key: DayPartKey
  /** 1–100. Relative to the other parts on the same line; nothing on screen shows the number. */
  weight: number
}

export interface DaysBlock extends BoxRect {
  arrangement: DaysArrangement
  /**
   * The parts, in order. ⚠️ ALWAYS ALL FOUR, EXACTLY ONCE EACH — `normaliseParts` guarantees it, so
   * no reader has to handle a missing key and a part switched off keeps its place in the order.
   * ⛔ WHICH ONE IS **DRAWN** IS THE BOX'S OWN `enabled`, not a field here: the switch an operator
   * presses in WHAT'S IN EACH ROW is the same switch the renderer has always read.
   */
  parts: DayPart[]
  daysOff: DaysOffMode
  pictureShape: PictureShape
  /**
   * The height of a row's TEXT band, in native pixels. ⚠️ Capped at the row's own height.
   *
   * 🔴 IT EXISTS FOR TWO REASONS AND NEITHER IS DECORATIVE:
   *   1. ⛔ **A CONVERTED DESIGN MUST LOOK THE SAME.** A legacy row's boxes were (say) 70px tall with
   *      `rowSpacing` 150 — so the words occupied 70px of a 150px pitch. With the band equal to the
   *      whole row, every one of those boxes would suddenly have 150px of height to fit into and
   *      `fitLines` would draw them BIGGER than the truck approved. The band is set to the old row
   *      height on conversion, so nothing grows.
   *   2. ⚠️ **"Dragging a SIDE stretches in that direction only — text size stays."** Taller rows with
   *      the same words is exactly a taller row and an unchanged band.
   * ⛔ IT IS NOT A SETTING. Nothing in the UI shows it; a corner drag scales it with everything else.
   */
  textH: number
}

/** One laid-out part of one row, in native pixels. ⚠️ What the renderer draws and the editor clicks. */
export interface DayCell extends BoxRect {
  key: DayPartKey
  /** 0–6. */
  row: number
}

/** A ⇔ handle: the gap between two cells on the same line. ⚠️ Editor only; the renderer ignores it. */
export interface DayBoundary {
  /** The part that grows when the handle is dragged right. */
  left: DayPartKey
  /** The part that shrinks. */
  right: DayPartKey
  /** The handle's centre and extent, in native pixels. */
  x: number
  y: number
  h: number
}

export const DAYS_IN_WEEK = 7

/** Which parts are drawn. ⚠️ Taken from the BOXES' own `enabled`, never stored twice. */
export type DayPartsOn = Record<DayPartKey, boolean>

/**
 * All four parts, exactly once, in a sane order.
 *
 * 🔴 EVERY READER GOES THROUGH THIS, including the validator's own parse: a stored array from a build
 * that knew three parts, or a hand-made payload with `place` twice, must not be able to make a row
 * that draws a part twice or loses one. ⚠️ Unknown keys are dropped; missing ones are appended in
 * `DAY_PART_KEYS` order, which is the order a new design starts in.
 */
export function normaliseParts(parts: readonly DayPart[] | undefined): DayPart[] {
  const seen = new Set<DayPartKey>()
  const out: DayPart[] = []
  for (const p of parts ?? []) {
    if (!p || !DAY_PART_KEYS.includes(p.key) || seen.has(p.key)) continue
    seen.add(p.key)
    out.push({ key: p.key, weight: clampWeight(p.weight) })
  }
  for (const k of DAY_PART_KEYS) {
    if (!seen.has(k)) out.push({ key: k, weight: DEFAULT_WEIGHTS[k] })
  }
  return out
}

export const MIN_WEIGHT = 1
export const MAX_WEIGHT = 100

const clampWeight = (v: unknown): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0
  return Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, n || MIN_WEIGHT))
}

/**
 * The shares a new design starts with.
 *
 * ⚠️ MEASURED AGAINST THE OLD DEFAULT LAYOUT, not guessed: `defaultLayout` gave the date 30% of the
 * inner width, the time 26% and the place the rest, which is 30/44/26 — and the picture is square at
 * the row's height, so its weight only matters under "Big picture".
 */
export const DEFAULT_WEIGHTS: Record<DayPartKey, number> = {
  picture: 28,
  dayDate: 30,
  place: 44,
  times: 26,
}

/**
 * ══ 🔴 THE THREE QUICK LAYOUTS ════════════════════════════════════════════════════════════════════
 *
 * ⛔ THEY ARE **DATA**, NOT THREE CODE PATHS. Each one is an arrangement plus a set of weights and an
 * order, so "All on one line" and "Big picture" differ in what they store and not in what draws them —
 * which is what makes a layout the operator then adjusts by hand still a valid layout rather than a
 * fourth state nothing recognises.
 * ⚠️ PRESSING ONE **DOES NOT** SWITCH ANY PART ON OR OFF. A truck who has no location pictures and has
 * switched that part off would otherwise have it switched back on by pressing "All on one line", which
 * is not what the button says.
 */
export const QUICK_LAYOUTS: Record<DaysArrangement, { parts: DayPart[] }> = {
  oneLine: {
    parts: [
      { key: 'picture', weight: DEFAULT_WEIGHTS.picture },
      { key: 'dayDate', weight: DEFAULT_WEIGHTS.dayDate },
      { key: 'place', weight: DEFAULT_WEIGHTS.place },
      { key: 'times', weight: DEFAULT_WEIGHTS.times },
    ],
  },
  dayOnTop: {
    parts: [
      { key: 'picture', weight: 22 },
      { key: 'dayDate', weight: 100 },
      { key: 'place', weight: 60 },
      { key: 'times', weight: 40 },
    ],
  },
  bigPicture: {
    parts: [
      /* ⚠️ 90 AGAINST THE WORDS' 200, WHICH IS ABOUT A THIRD OF THE ROW — AND IT WAS MEASURED, NOT
       * PICKED. The picture's share is `pw / (pw + the words' weights)`, so a number that looks big on
       * its own (34) came out at 14% of the row and was indistinguishable from the square. */
      { key: 'picture', weight: 90 },
      { key: 'dayDate', weight: 100 },
      { key: 'place', weight: 60 },
      { key: 'times', weight: 40 },
    ],
  },
}

/** A first "7 days" block for a canvas with nothing to convert. ⚠️ Proportional, like `defaultLayout`. */
export function defaultDaysBlock(width: number, height: number): DaysBlock {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  const pad = Math.round(w * 0.06)
  const top = Math.round(h * 0.2)
  const blockH = Math.max(DAYS_IN_WEEK * 8, Math.round(h * 0.73) - top + Math.round(h * 0.2))
  const boxH = Math.min(h - top, blockH)
  return {
    x: pad,
    y: top,
    w: Math.max(DAYS_IN_WEEK, w - pad * 2),
    h: Math.max(DAYS_IN_WEEK * 8, boxH),
    arrangement: 'oneLine',
    parts: QUICK_LAYOUTS.oneLine.parts.map(p => ({ ...p })),
    daysOff: 'message',
    pictureShape: 'square',
    /* ⚠️ THE WHOLE ROW, so on a new design the band is a no-op and `textH` can only ever have been set
     * deliberately — by a conversion or by a corner drag. */
    textH: Math.max(8, Math.round(Math.max(DAYS_IN_WEEK * 8, boxH) / DAYS_IN_WEEK)),
  }
}

/** One row's vertical extent. 🔴 Rounded from the BLOCK's edges, so seven rows exactly fill it. */
export function rowBand(days: DaysBlock, row: number): { y: number; h: number } {
  const i = Math.max(0, Math.min(DAYS_IN_WEEK - 1, Math.round(row)))
  const top = days.y + Math.round((days.h * i) / DAYS_IN_WEEK)
  const bottom = days.y + Math.round((days.h * (i + 1)) / DAYS_IN_WEEK)
  return { y: top, h: Math.max(1, bottom - top) }
}

/** The gap between two parts. ⚠️ Derived from the row, not stored — one less number to get wrong. */
const gapFor = (rowH: number): number => Math.max(2, Math.round(rowH * 0.08))

/**
 * Which parts share the row left-to-right, and which share a line.
 *
 * 🔴 THE ORDER DECIDES THE LINE, NOT THE KEY. Under "Day on top" the FIRST text part in the operator's
 * own order goes on the top line and the rest share the second — so dragging ⋮⋮ to put Times first
 * actually does something. ⛔ KEYING IT TO `dayDate` would have made the reorder handle inert in two
 * of the three quick layouts, which is a control that does nothing in the place it is most likely to
 * be pressed.
 */
function linesOf(days: DaysBlock, on: DayPartsOn): DayPart[][] {
  const parts = normaliseParts(days.parts)
  const text = parts.filter(p => p.key !== 'picture' && on[p.key])
  if (!text.length) return []
  if (days.arrangement === 'oneLine' || text.length === 1) return [text]
  return [[text[0]], text.slice(1)]
}

/**
 * Is the picture drawn as a column of its own, before or after the words?
 *
 * ⛔ **ONLY THE TWO-LINE ARRANGEMENTS HAVE A PICTURE COLUMN.** Under "All on one line" the picture is
 * one cell in the sequence like any other, so ⋮⋮ can put it between the day and the place and that is
 * where it goes. 🔴 THAT WAS A REAL BUG AND A HARNESS FOUND IT: with a column, a picture dragged into
 * the middle of the order jumped to the far right — the list said one order and the poster drew
 * another, which is the one thing the reorder handle must not do.
 * ⚠️ A COLUMN IS UNAVOIDABLE WHERE THE WORDS ARE ON TWO LINES: the picture spans both, so it has a
 * side rather than a place in the sequence, and the side is the one its order implies.
 */
function pictureSide(days: DaysBlock, on: DayPartsOn): 'left' | 'right' | null {
  if (!on.picture || days.arrangement === 'oneLine') return null
  const parts = normaliseParts(days.parts)
  const pi = parts.findIndex(p => p.key === 'picture')
  const ti = parts.findIndex(p => p.key !== 'picture' && on[p.key])
  if (ti < 0) return 'left'
  return pi < ti ? 'left' : 'right'
}

/** The picture's own square, when it is one cell in a line rather than a column. */
const squareSide = (rowH: number, blockW: number): number =>
  Math.max(8, Math.min(rowH, Math.round(blockW * 0.4)))

/**
 * ══ 🔴 **THE** LAYOUT FUNCTION — one row, every part, in native pixels ════════════════════════════
 *
 * Called by the renderer for each of the seven rows and by the editor for its click targets, so a cell
 * the operator clicks is exactly the cell the PNG draws in.
 *
 * ⚠️ THE PICTURE IS A **SQUARE AT THE ROW'S HEIGHT** under "All on one line" and "Day on top", and a
 * WEIGHTED column under "Big picture". That is the whole difference between the last two, and it is
 * the brief's own wording: "a tall picture on the left".
 * ⛔ A CELL IS NEVER NARROWER THAN 8px — the validator's own floor for a box, so a cell this produces
 * can always be drawn and can always be saved.
 */
export function dayCells(days: DaysBlock, on: DayPartsOn, row: number): DayCell[] {
  const band = rowBand(days, row)
  const gap = gapFor(band.h)
  const bandH = Math.max(8, Math.min(band.h, Math.max(8, Math.round(days.textH))))
  const bandTop = band.y + Math.round((band.h - bandH) / 2)
  const lines = linesOf(days, on)
  const side = pictureSide(days, on)
  const parts = normaliseParts(days.parts)
  const weightOf = (k: DayPartKey) => parts.find(p => p.key === k)?.weight ?? DEFAULT_WEIGHTS[k]

  /* ══ 🔴 "ALL ON ONE LINE" — ONE SEQUENCE, IN THE OPERATOR'S OWN ORDER ═════════════════════════════
   * ⚠️ THE PICTURE IS A CELL HERE, NOT A COLUMN, so ⋮⋮ can place it anywhere in the row. Its width is
   * the row's height — a logo beside a line of words is as tall as the words — and the rest share what
   * is left by weight. */
  if (days.arrangement === 'oneLine') {
    const seq = parts.filter(p => on[p.key])
    if (!seq.length) return []
    const picW = on.picture ? squareSide(band.h, days.w) : 0
    const gaps = gap * Math.max(0, seq.length - 1)
    const textWeight = seq.filter(p => p.key !== 'picture').reduce((n, p) => n + p.weight, 0) || 1
    const usable = Math.max(8 * seq.length, days.w - gaps - picW)
    const out1: DayCell[] = []
    let x = days.x
    seq.forEach((p, i) => {
      const last = i === seq.length - 1
      const w = p.key === 'picture' ? picW
        /* ⚠️ THE LAST CELL TAKES WHAT IS LEFT, so rounding cannot leave a strip of the block unused. */
        : last ? Math.max(8, days.x + days.w - x)
          : Math.max(8, Math.round((usable * p.weight) / textWeight))
      out1.push(p.key === 'picture'
        ? { key: p.key, x, y: band.y + Math.round((band.h - Math.min(band.h, w)) / 2), w, h: Math.min(band.h, w), row }
        : { key: p.key, x, y: bandTop, w, h: bandH, row })
      x += w + gap
    })
    return out1
  }

  const out: DayCell[] = []
  let left = days.x
  let availW = Math.max(8, days.w)

  /* ── the picture column ──────────────────────────────────────────────────────────────────────── */
  let picW = 0
  if (side) {
    const textWeight = lines.flat().reduce((s, p) => s + p.weight, 0) || 1
    /* ══ 🔴 A CIRCLE IS A CIRCLE, SO ITS CELL IS A SQUARE ════════════════════════════════════════════
     * ⛔ **FOUND BY LOOKING AT THE PICTURE.** Under "Big picture" the cell is a weighted share — 291 ×
     * 140 on a 1080px poster — and a border radius of half the shorter side turns that into a STADIUM,
     * not a circle. The control said "the three layouts draw different posters" and it was right; no
     * check was ever going to say "that is not round".
     * ⚠️ A ROW IS THE CEILING ON A CIRCLE'S DIAMETER, so "Big picture · Circle" is as big as a circle
     * can be — the leftover width goes back to the words rather than to a wider oval. */
    picW = days.arrangement === 'bigPicture' && days.pictureShape !== 'circle'
      /* ⚠️ A SHARE OF THE ROW, against the sum of the words' weights — so the ⇔ handle beside it moves
       * the boundary rather than resizing one cell into the other's space. */
      ? Math.round((days.w - (lines.length ? gap : 0)) * (weightOf('picture') / (weightOf('picture') + textWeight)))
      /* 🔴 SQUARE, AT THE ROW'S OWN HEIGHT, under "Day on top". */
      : squareSide(band.h, days.w)
    picW = Math.max(8, Math.min(picW, days.w - (lines.length ? 8 + gap : 0)))
    const picH = days.arrangement === 'bigPicture' && days.pictureShape !== 'circle'
      ? band.h : Math.min(band.h, picW)
    const picX = side === 'left' ? left : days.x + days.w - picW
    out.push({
      key: 'picture',
      x: picX,
      y: band.y + Math.round((band.h - picH) / 2),
      w: picW,
      h: Math.max(8, picH),
      row,
    })
    if (side === 'left') left += picW + gap
    availW = Math.max(8, days.w - picW - gap)
  }

  /* ── the words ───────────────────────────────────────────────────────────────────────────────── */
  if (!lines.length) return out
  const lineH = Math.max(8, Math.floor(bandH / lines.length))
  lines.forEach((line, li) => {
    const total = line.reduce((s, p) => s + p.weight, 0) || 1
    const gaps = gap * Math.max(0, line.length - 1)
    const usable = Math.max(8 * line.length, availW - gaps)
    let x = left
    line.forEach((p, i) => {
      /* ⚠️ THE LAST CELL TAKES WHAT IS LEFT, so rounding cannot leave a one-pixel strip of the block
       * unused — the cells of a line add up to the line exactly. */
      const w = i === line.length - 1
        ? Math.max(8, left + availW - x)
        : Math.max(8, Math.round((usable * p.weight) / total))
      out.push({ key: p.key, x, y: bandTop + li * lineH, w, h: lineH, row })
      x += w + gap
    })
  })
  return out
}

/**
 * The ⇔ handles for one row. ⚠️ THE EDITOR DRAWS THEM ON ROW 1 ONLY — twenty-one handles over a
 * poster is the "second design on top of their design" problem this product has already fixed once.
 *
 * ⛔ NO HANDLE WHERE DRAGGING WOULD DO NOTHING. Under "All on one line" and "Day on top" the picture's
 * width is its row's height, so a handle beside it would move and change nothing — which is worse than
 * no handle at all.
 */
export function dayBoundaries(days: DaysBlock, on: DayPartsOn, row = 0): DayBoundary[] {
  const cells = dayCells(days, on, row)
  const byKey = new Map(cells.map(c => [c.key, c]))
  const lines = linesOf(days, on)
  const side = pictureSide(days, on)
  const out: DayBoundary[] = []
  const between = (a: DayCell, b: DayCell): DayBoundary => ({
    left: a.key, right: b.key,
    x: Math.round((a.x + a.w + b.x) / 2),
    y: Math.min(a.y, b.y),
    h: Math.max(a.h, b.h),
  })
  /* ⚠️ UNDER "All on one line" THE CELLS ARE ONE SEQUENCE, so the handles are between neighbouring
   * TEXT cells. ⛔ NOT BESIDE THE PICTURE: its width is the row's height there, so a handle would move
   * and change nothing — worse than no handle at all. */
  if (days.arrangement === 'oneLine') {
    const seq = cells.filter(c => c.key !== 'picture').sort((a, b) => a.x - b.x)
    for (let i = 0; i < seq.length - 1; i++) {
      /* ══ 🔴 A HANDLE EVEN WHERE THE PICTURE SITS BETWEEN THE TWO (10 October 2026) ════════════════
       * ⛔ **DOMINIC: "the additional column has been added but I'm unable to resize … the time width.
       * I can only adjust the date and location column widths."** With the picture between Place and
       * Time, this skipped that boundary — on the reasoning that *"dragging it would resize two cells
       * that are not touching"*. 🔴 THE COST OF THAT RULE WAS A COLUMN THE OPERATOR COULD NOT RESIZE
       * AT ALL: the only remaining handle was Date|Place, so Time's width was fixed for ever.
       * ⚠️ THE DRAG IS HONEST ABOUT WHAT IT DOES — `moveBoundary` takes the two PART KEYS and moves
       * weight from one to the other; it never needed them to be adjacent. The picture keeps its own
       * width (its row's height) and is not involved.
       * ⚠️ IT IS PLACED OVER THE PICTURE'S GAP, which is where the boundary between those two columns
       * visually is. */
      out.push(between(seq[i], seq[i + 1]))
    }
    return out
  }
  if (side === 'left' && days.arrangement === 'bigPicture') {
    const pic = byKey.get('picture')
    const first = lines[0]?.[0] ? byKey.get(lines[0][0].key) : undefined
    if (pic && first) out.push(between(pic, first))
  }
  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = byKey.get(line[i].key), b = byKey.get(line[i + 1].key)
      if (a && b) out.push(between(a, b))
    }
  }
  if (side === 'right' && days.arrangement === 'bigPicture') {
    const pic = byKey.get('picture')
    const lastLine = lines[lines.length - 1]
    const last = lastLine?.length ? byKey.get(lastLine[lastLine.length - 1].key) : undefined
    if (pic && last) out.push(between(last, pic))
  }
  return out
}

/**
 * Move one ⇔ handle: the part on the left grows by `deltaWeight`, the one on the right shrinks.
 *
 * ⚠️ THE SUM IS PRESERVED, so moving one boundary cannot change the width of a cell on the other side
 * of the row. ⛔ BOTH STAY ≥ `MIN_WEIGHT`: a cell dragged to zero would be a part the operator can no
 * longer find, and the only way back would be a quick layout.
 */
export function moveBoundary(
  days: DaysBlock, left: DayPartKey, right: DayPartKey, deltaWeight: number,
): DaysBlock {
  const parts = normaliseParts(days.parts)
  const a = parts.find(p => p.key === left), b = parts.find(p => p.key === right)
  if (!a || !b) return days
  const d = Math.round(deltaWeight)
  if (!d) return days
  const room = d > 0 ? Math.min(d, b.weight - MIN_WEIGHT, MAX_WEIGHT - a.weight)
    : Math.max(d, -(a.weight - MIN_WEIGHT), -(MAX_WEIGHT - b.weight))
  if (!room) return days
  return {
    ...days,
    parts: parts.map(p => (p.key === left ? { ...p, weight: p.weight + room }
      : p.key === right ? { ...p, weight: p.weight - room } : p)),
  }
}

/** Drag ⋮⋮: `from` lands at `to`, everything else keeps its order. */
export function reorderParts(parts: readonly DayPart[], from: number, to: number): DayPart[] {
  const list = normaliseParts(parts)
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
  const next = list.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/** The corner radius a shape asks for, given the cell. ⚠️ `circle` is half the shorter side. */
export function shapeRadius(shape: PictureShape, w: number, h: number): number {
  const side = Math.max(1, Math.min(w, h))
  if (shape === 'circle') return Math.round(side / 2)
  if (shape === 'rounded') return Math.max(2, Math.round(side * 0.12))
  return 0
}

/**
 * ══ 🔴 AN OLD WEEKLY DESIGN, AS "THE 7 DAYS" ══════════════════════════════════════════════════════
 *
 * The brief: *"Opening an old weekly design in the editor converts it to the closest new equivalent."*
 * This is that conversion, and every line of it is about one promise — **the rows stay where they are.**
 *
 * 🔴 THE BLOCK'S PITCH IS `rowSpacing`, SO `h = rowSpacing × 7`. That is what makes row *i* land on the
 * old row *i*: seven equal rows of `rowSpacing` reproduce `date.y + rowSpacing × i` exactly.
 * ⛔ AND THE TOP IS LIFTED BY HALF THE DIFFERENCE — `y = row1Top + rowH/2 − rowSpacing/2` — because a
 * cell CENTRES its words. Without the lift every row's text would drop by `(rowSpacing − rowH) / 2`,
 * which on a typical design is ten to twenty pixels, seven times, on artwork a truck has approved.
 * ⚠️ `textH` IS THE OLD ROW'S HEIGHT, so `fitLines` is given the same height it had and nothing that
 * used to shrink suddenly draws bigger. See `DaysBlock.textH`.
 * ⚠️ THE ORDER COMES FROM THE BOXES' OWN `x`, so a design with the time on the left converts with the
 * time on the left. THE WEIGHTS COME FROM THEIR WIDTHS, for the same reason.
 * ⛔ WHAT CANNOT BE REPRODUCED IS LISTED IN docs/social-tab-6-report.md rather than hidden here: the
 * gaps between the parts become one even gap, and the picture becomes a square at the row's height.
 */
export function daysFromLegacy(l: {
  width: number
  height: number
  rowSpacing: number
  date: BoxRect & { enabled: boolean }
  location: BoxRect & { enabled: boolean }
  time: BoxRect & { enabled: boolean }
  placePicture: BoxRect & { enabled: boolean; corners: string }
}): DaysBlock {
  const W = Math.max(1, Math.round(l.width))
  const H = Math.max(1, Math.round(l.height))
  const S = Math.max(1, Math.round(l.rowSpacing))
  /* ⚠️ EVERY BOX COUNTS TOWARDS THE EXTENT, SWITCHED OFF OR NOT. A design whose Time is off still has
   * a Time box with coordinates, and switching it back on after the conversion must not put it outside
   * the block. ⛔ The PICTURE only counts when it is ON, because `defaultPlacePictureBox` parks an
   * unused one to the LEFT of the date box — including it would widen every converted block. */
  const geo = [l.date, l.location, l.time, ...(l.placePicture.enabled ? [l.placePicture] : [])]
  const x = Math.max(0, Math.min(...geo.map(b => b.x)))
  const right = Math.min(W, Math.max(...geo.map(b => b.x + b.w)))
  const rowTop = Math.min(...geo.map(b => b.y))
  const rowBottom = Math.max(...geo.map(b => b.y + b.h))
  const rowH = Math.max(8, rowBottom - rowTop)
  const h = Math.min(H, Math.max(DAYS_IN_WEEK * 8, S * DAYS_IN_WEEK))
  const y = Math.max(0, Math.min(H - h, rowTop + Math.round(rowH / 2 - S / 2)))

  /* ⚠️ ORDERED BY `x`, AND TIES BROKEN BY THE DEFAULT ORDER. Two boxes at the same x is a design where
   * one is stacked on the other, which the legacy model allowed and the new one cannot — the default
   * order is then as good an answer as any and is at least stable. */
  const seq: Array<{ key: DayPartKey; x: number; w: number }> = ([
    { key: 'dayDate', x: l.date.x, w: l.date.w },
    { key: 'place', x: l.location.x, w: l.location.w },
    { key: 'times', x: l.time.x, w: l.time.w },
    { key: 'picture', x: l.placePicture.enabled ? l.placePicture.x : x - 1, w: l.placePicture.w },
  ] as Array<{ key: DayPartKey; x: number; w: number }>).sort((a, b) => (a.x - b.x) || DAY_PART_KEYS.indexOf(a.key) - DAY_PART_KEYS.indexOf(b.key))

  const totalW = Math.max(1, l.date.w + l.location.w + l.time.w)
  const weightFor = (k: DayPartKey, wPx: number): number =>
    k === 'picture' ? DEFAULT_WEIGHTS.picture
      : Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, Math.round((wPx / totalW) * 100)))

  return {
    x,
    y,
    w: Math.max(DAYS_IN_WEEK, Math.min(W - x, right - x)),
    h,
    arrangement: 'oneLine',
    parts: seq.map(s => ({ key: s.key, weight: weightFor(s.key, s.w) })),
    /* 🔴 `message` IS WHAT A LEGACY DESIGN DID: the Location box drew `daysOffText` on a day with no
     * event, and the Date box took its day-off band. Converting to `omit` would silently empty rows
     * that have always said "No trading today". */
    daysOff: 'message',
    pictureShape: l.placePicture.corners === 'rounded' ? 'rounded' : 'square',
    textH: Math.max(8, Math.min(Math.round(h / DAYS_IN_WEEK), rowH)),
  }
}
