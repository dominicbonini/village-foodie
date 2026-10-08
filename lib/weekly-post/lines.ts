// lib/weekly-post/lines.ts — WHAT EACH BOX SAYS. Shared by the satori renderer and the live editor.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHY THESE MOVED OUT OF `render.ts` (10 October 2026)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// §2 of the 10 October brief makes the EDITOR draw its own text, live, so a box's words move in the
// same frame as its outline instead of waiting for the server's PNG. ⛔ THE BRIEF'S CONDITION IS THAT
// IT USES **THE SAME FUNCTIONS**: "resolveTextBox, dayCells, the same fitting rules". These three are
// the rest of that list — what a date, a place and a time actually SAY — and they lived in `render.ts`,
// which imports `next/og` and therefore cannot be imported by a client component.
//
// 🔴 SO THEY ARE HERE, PURE, AND `render.ts` IMPORTS THEM. Nothing about them changed in the move:
// the cancelled strike, the town's second line, the spacer that keeps the Time column level with a
// Location column that has towns under it, and the "a day off has no time at all" rule are the same
// code, in one place, called by both. ⚠️ A COPY IN THE EDITOR WOULD BE THE SECOND ANSWER TO "what does
// this box say", and this product has shipped that class of bug twice.

import type { FitLine } from './fit'
import type { TextBox } from './layout'
import { joinNameTown, type PlaceStyleId } from './locale'
import type { DayEntry } from './week-data'

/**
 * "Words before" — the operator's lead-in, on the FIRST line of whatever the item says.
 *
 * ⚠️ IT IS PREPENDED TO THE RUNS, NOT DRAWN AS ITS OWN BOX, so it shrinks with the text and can never
 * end up in a different size from the name it introduces. ⚠️ FIRST LINE ONLY: a Location box showing
 * two stacked events must say "Find us at The Kings Arms / Market Square", not "Find us" twice.
 * ⚠️ AND IT TAKES THE BOX'S CAPITALS, because it is part of the same sentence.
 */
export function withWordsBefore(lines: FitLine[], box: TextBox): FitLine[] {
  const words = String(box.wordsBefore ?? '').trim()
  if (!words || !lines.length) return lines
  const text = box.caps ? words.toUpperCase() : words
  const [first, ...rest] = lines
  return [{ ...first, runs: [{ text: `${text} ` }, ...first.runs] }, ...rest]
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
/**
 * ⚠️ `placeStyle` DECIDES WHETHER THE TOWN IS A SECOND LINE, THE SAME LINE, OR ABSENT — and nothing
 * else about the place changes. `nameTownBelow` is what this function has always drawn and is the
 * default, so a design that has never been opened in the new editor renders identically.
 * ⛔ THE SUPPRESSION RULE IS NOT REPEATED HERE. `townLine` in week-data.ts has already decided whether
 * there IS a town (it is null when the name contains it, and null for a private event); this function
 * only decides where to put one that exists.
 */
export function locationLinesFor(
  entries: readonly DayEntry[], daysOffText: string | null, placeStyle: PlaceStyleId,
): FitLine[] {
  if (entries.length === 0) return daysOffText ? [{ runs: [{ text: daysOffText }] }] : []
  const out: FitLine[] = []
  for (const e of entries) {
    const strike = e.status === 'cancelled'
    const town = placeStyle === 'nameOnly' ? null : e.town
    const name = placeStyle === 'nameTown' ? joinNameTown(e.name, town) : e.name
    out.push({ runs: [{ text: name }], strike })
    /* ⚠️ PER ENTRY, NOT PER DAY. A day with one cancelled event and one going ahead must strike
     * only the cancelled one — striking the whole box would tell customers the truck is not coming
     * when it is. */
    if (town && placeStyle === 'nameTownBelow') out.push({ runs: [{ text: town }], scale: 0.62, strike })
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
export const timeLinesFor = (
  entries: readonly DayEntry[], textOf: (e: DayEntry) => string, placeStyle: PlaceStyleId,
): FitLine[] => {
  if (entries.length === 0) return []
  /* 🔴 THE SPACER FOLLOWS THE PLACE STYLE, AND FORGETTING THAT WAS THE OBVIOUS BUG HERE. The blank
   * line exists to keep the Time column level with a Location column that has a town line under each
   * name. Under "Name, town" and "Name only" there IS no town line — so a spacer would push every
   * time down by one line against nothing, and on a stacked day the second event's time would sit
   * beside the first event's name. */
  const townLines = placeStyle === 'nameTownBelow'
  const out: FitLine[] = []
  for (const e of entries) {
    /* 🔴 "CANCELLED" WINS OVER ANY TIME FORMAT, on both posters. Each poster passes its own `textOf`,
     * and this branch is above it — so a cancelled event can never be given a time by a formatter. */
    out.push({ runs: [{ text: e.status === 'cancelled' ? 'CANCELLED' : textOf(e) }] })
    if (e.town && townLines) out.push({ runs: [{ text: ' ' }], scale: 0.62 })
  }
  // every entry had an empty time and no town ⇒ nothing to draw
  return out.some(l => l.runs.some(r => r.text.trim() !== '')) ? out : []
}
