// lib/weekly-post/format.ts — the words that go in the boxes.
//
// Every string the renderer draws is produced here, so the setup preview, the weekly-post preview and
// the downloaded PNG cannot word anything differently. Pure functions over calendar dates and 'HH:MM'
// strings — no clock, no timezone, no `new Date()` on a date-only value (which is UTC midnight and
// shifts the day for anyone west of London).

import { WEEKDAY_NAMES, weekdayOf } from './week'

// ════════════════════════════════════════════════════════════════════════════════════════════════
// ORDINALS
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * 1st, 2nd, 3rd, 4th … and the three that catch everyone: 11th, 12th, 13th.
 *
 * 🔴 THE TEENS ARE CHECKED FIRST AND THAT IS THE WHOLE BUG. `n % 10 === 1 ? 'st'` gives "11st",
 * "12nd" and "13rd" — wrong three days in every month, on artwork a truck posts to its customers.
 * 21st/22nd/23rd and 31st must still take the short suffix, which is why the teen test is `n % 100`
 * between 11 and 13 rather than `n < 20`.
 */
export function ordinalSuffix(n: number): 'st' | 'nd' | 'rd' | 'th' {
  const mod100 = Math.abs(Math.trunc(n)) % 100
  if (mod100 >= 11 && mod100 <= 13) return 'th'
  switch (Math.abs(Math.trunc(n)) % 10) {
    case 1: return 'st'
    case 2: return 'nd'
    case 3: return 'rd'
    default: return 'th'
  }
}

export const ordinal = (n: number): string => `${n}${ordinalSuffix(n)}`

// ════════════════════════════════════════════════════════════════════════════════════════════════
// DATES
// ════════════════════════════════════════════════════════════════════════════════════════════════

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'] as const

const parts = (ymd: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m) throw new Error(`format: not a YYYY-MM-DD date: ${JSON.stringify(ymd)}`)
  return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) }
}

export interface TextCase {
  /** ALL CAPITALS. */
  caps: boolean
  /**
   * Raised ordinals — "28" with a superscript "TH".
   * ⚠️ RETURNED AS SEPARATE RUNS, never as a Unicode superscript character: the bundled families do
   * not all carry ᵉ/ᵗʰ glyphs, and a missing glyph is a blank box on a poster. The renderer draws the
   * suffix in a smaller size, raised.
   */
  raisedOrdinals: boolean
}

/** A piece of text the renderer can draw: a string, optionally raised and smaller. */
export interface TextRun {
  text: string
  /** true = superscript: drawn smaller and lifted. */
  raised?: boolean
}

const applyCaps = (s: string, caps: boolean) => (caps ? s.toUpperCase() : s)

/**
 * "28th September", as runs so a raised ordinal can be drawn.
 *
 * ⚠️ THE SUFFIX IS SPLIT OUT ONLY WHEN `raisedOrdinals` IS ON. With it off the whole thing is one run,
 * so the common case stays a single text node and measures as one string.
 */
export function dayAndMonthRuns(ymd: string, c: TextCase): TextRun[] {
  const { mo, d } = parts(ymd)
  const month = MONTHS[mo - 1]
  if (!c.raisedOrdinals) return [{ text: applyCaps(`${ordinal(d)} ${month}`, c.caps) }]
  return [
    { text: applyCaps(String(d), c.caps) },
    { text: applyCaps(ordinalSuffix(d), c.caps), raised: true },
    { text: applyCaps(` ${month}`, c.caps) },
  ]
}

/** "Monday". */
export function weekdayName(ymd: string, c: TextCase): string {
  return applyCaps(WEEKDAY_NAMES[weekdayOf(ymd)], c.caps)
}

/** "Monday 28th September" — the heading's date token, as runs. */
export function longDateRuns(ymd: string, c: TextCase): TextRun[] {
  return [{ text: applyCaps(`${WEEKDAY_NAMES[weekdayOf(ymd)]} `, c.caps) }, ...dayAndMonthRuns(ymd, c)]
}

/** Flatten runs for measuring and for anything that wants a plain string (captions, warnings). */
export const runsToPlain = (runs: readonly TextRun[]): string => runs.map(r => r.text).join('')

// ════════════════════════════════════════════════════════════════════════════════════════════════
// TIMES
// ════════════════════════════════════════════════════════════════════════════════════════════════

export type TimeStyle = '12h' | '24h'

const hhmm = (t: string): { h: number; m: number } | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t ?? '').trim())
  if (!m) return null
  const h = Number(m[1]), mi = Number(m[2])
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null
  return { h, m: mi }
}

/**
 * One time. 12-hour: "5pm", and "5:30pm" when there are minutes — never "5:00pm".
 *
 * ⚠️ MINUTES ONLY WHEN THEY ARE NOT :00, which is the brief's rule and also how a poster reads: a
 * truck trading 5–8 writes "5pm – 8pm", not "5:00pm – 8:00pm".
 * ⚠️ MIDNIGHT AND NOON ARE 12am/12pm, not 0am. `h % 12 || 12` is what gets that right.
 */
export function formatOneTime(t: string, style: TimeStyle): string {
  const p = hhmm(t)
  if (!p) return ''
  if (style === '24h') return `${String(p.h).padStart(2, '0')}:${String(p.m).padStart(2, '0')}`
  const suffix = p.h < 12 ? 'am' : 'pm'
  const h12 = p.h % 12 || 12
  return p.m === 0 ? `${h12}${suffix}` : `${h12}:${String(p.m).padStart(2, '0')}${suffix}`
}

/**
 * "5pm – 8pm" or "17:00 – 20:00".
 *
 * ⚠️ AN EN DASH WITH SPACES, not a hyphen. It is the typographically correct mark for a range and it
 * is in every one of the 21 bundled families (the metrics reader pre-measures it for exactly this).
 * ⚠️ A MISSING END TIME GIVES JUST THE START rather than "5pm – ". An unconfirmed event can have one
 * time, and a dangling dash on finished artwork reads as a fault.
 */
export function formatTimeRangeFor(
  start: string | null | undefined,
  end: string | null | undefined,
  style: TimeStyle,
): string {
  const s = start ? formatOneTime(start, style) : ''
  const e = end ? formatOneTime(end, style) : ''
  if (s && e) return `${s} – ${e}`
  return s || e || ''
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE HEADING'S TOKENS
// ════════════════════════════════════════════════════════════════════════════════════════════════

export const DEFAULT_HEADING = 'Week commencing {start} to {end}'

/**
 * Fill `{start}` and `{end}` in the heading, as runs so raised ordinals survive.
 *
 * ⚠️ AN UNKNOWN TOKEN IS LEFT ALONE, not blanked. An operator who types `{dates}` should see
 * `{dates}` on the preview and understand it did nothing — a silently empty heading looks like the
 * renderer failed.
 */
export function headingRuns(template: string, start: string, end: string, c: TextCase): TextRun[] {
  const text = template && template.trim() ? template : DEFAULT_HEADING
  const out: TextRun[] = []
  const re = /\{(start|end)\}/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: applyCaps(text.slice(last, m.index), c.caps) })
    out.push(...longDateRuns(m[1] === 'start' ? start : end, c))
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ text: applyCaps(text.slice(last), c.caps) })
  return out.filter(r => r.text !== '')
}
