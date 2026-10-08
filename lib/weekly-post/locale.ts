// lib/weekly-post/locale.ts — how a date, a place and a time are worded, per country, in ONE table.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHY THIS EXISTS: THE UK WAS WRITTEN INTO THE FORMATTERS
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// `format.ts` produced "Monday 28th September" and nothing else, because that is what a Suffolk food
// truck writes. The moment a truck is anywhere else, "28th September" is wrong — an American operator
// writes "September 28th", and a numeric date reverses (14/10 vs 10/14) in a way that is not a style
// preference but a different date.
//
// ⛔ SO THE RULE IS: NO COMPONENT, AND NO FORMATTER, SPELLS A DATE ORDER OUT. They take a style id and
// ask this table. A hard-coded "th" or a `${day}/${month}` anywhere else is the bug this file exists to
// make impossible, and `scripts/design-editor.cjs` sweeps for both.
//
// 🔴 THE COUNTRY COMES THROUGH ONE FUNCTION — `countryForTruck()` — WHICH RETURNS 'GB' TODAY.
// `trucks` has no country column yet. When it gains one, THAT FUNCTION is the only thing that changes;
// every caller already asks it rather than assuming. ⚠️ This is deliberate over-plumbing: the
// alternative is finding every date in the product on the day the column lands.

import { WEEKDAY_NAMES, weekdayOf } from './week'
import { ordinal, ordinalSuffix, type TextCase, type TextRun } from './format'

/** The countries this table knows. ⚠️ A string union, not `string` — an unknown code is a bug, and
 *  `localeFor()` falls back to GB rather than producing an empty date. */
export type CountryCode = 'GB' | 'US'

export const DEFAULT_COUNTRY: CountryCode = 'GB'

/**
 * How a date is worded.
 *
 * ⚠️ THE IDS ARE SHARED ACROSS COUNTRIES and name the SHAPE, not the words: `long` is "the weekday,
 * the day and the month in full", whichever order that country writes them in. A US truck switching
 * to 'long' gets "Wednesday, October 14th"; a GB truck gets "Wednesday 14th October". ⛔ IDS LIKE
 * `'wednesday-14th-october'` WOULD HAVE MADE THE SAVED VALUE COUNTRY-SPECIFIC, so a truck that moved
 * country would carry the old country's wording in its design for ever.
 */
export type DateStyleId = 'long' | 'short' | 'dayMonth' | 'numeric'

/** How a place is worded. ⚠️ `nameTownBelow` is today's behaviour and the default. */
export type PlaceStyleId = 'nameTownBelow' | 'nameTown' | 'nameOnly'

export type TimeStyleId = '12h' | '24h'

export interface DateStyleOption {
  id: DateStyleId
  /** What the picker shows — and it is a REAL DATE in that style, not a description of one. */
  sample: string
}

export interface LocaleSpec {
  country: CountryCode
  /** The four date styles this country offers, in the order the picker lists them. */
  dateStyles: DateStyleOption[]
  /** `d/m` or `m/d` — the ONE fact that makes a numeric date mean different days in two countries. */
  numericOrder: 'dmy' | 'mdy'
  /** 12h or 24h by default. ⚠️ A DEFAULT, not a lock: the operator can still choose. */
  defaultTimeStyle: TimeStyleId
}

/* ══ 🔴 THE TABLE ════════════════════════════════════════════════════════════════════════════════
 * ⚠️ THE SAMPLES ARE WEDNESDAY 14 OCTOBER IN EVERY COUNTRY, so the picker's four lines differ only
 * by the thing being chosen. A different date per style would make the list a reading comprehension
 * test rather than a choice. */
export const LOCALES: Record<CountryCode, LocaleSpec> = {
  GB: {
    country: 'GB',
    dateStyles: [
      { id: 'long', sample: 'Wednesday 14th October' },
      { id: 'short', sample: 'Wed 14th Oct' },
      { id: 'dayMonth', sample: '14th October' },
      { id: 'numeric', sample: 'Wed 14/10' },
    ],
    numericOrder: 'dmy',
    defaultTimeStyle: '12h',
  },
  US: {
    country: 'US',
    dateStyles: [
      { id: 'long', sample: 'Wednesday, October 14th' },
      { id: 'short', sample: 'Wed, Oct 14th' },
      { id: 'dayMonth', sample: 'October 14th' },
      { id: 'numeric', sample: 'Wed 10/14' },
    ],
    numericOrder: 'mdy',
    defaultTimeStyle: '12h',
  },
}

/** ⚠️ AN UNKNOWN CODE FALLS BACK TO GB rather than throwing. A design must still render for a truck
 *  whose country column says something this build has not met. */
export const localeFor = (c: CountryCode | string | null | undefined): LocaleSpec =>
  LOCALES[(c as CountryCode)] ?? LOCALES[DEFAULT_COUNTRY]

/**
 * ══ 🔴 THE ONE PLACE THE COUNTRY IS DECIDED ═══════════════════════════════════════════════════════
 *
 * It returns 'GB' for everyone, because `trucks` has no country column. ⛔ THAT IS THE POINT: every
 * caller asks this instead of assuming, so the day the column exists this function reads it and
 * nothing else in the product changes. A `?? 'GB'` scattered at twelve call sites would be twelve
 * places to find.
 *
 * ⚠️ IT TAKES THE TRUCK ROW LOOSELY — callers hold different shapes of it (the full row on the
 * server, a handful of fields on the client) and none of them should have to widen a type to ask a
 * question about a column that does not exist yet.
 */
export function countryForTruck(truck?: { country?: string | null } | null): CountryCode {
  const c = truck?.country
  return c && (c in LOCALES) ? (c as CountryCode) : DEFAULT_COUNTRY
}

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'] as const
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

const parts = (ymd: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m) throw new Error(`locale: not a YYYY-MM-DD date: ${JSON.stringify(ymd)}`)
  return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) }
}

const caps = (s: string, on: boolean) => (on ? s.toUpperCase() : s)

/** The day with its ordinal suffix, as runs so the suffix can be raised. */
function dayRuns(d: number, c: TextCase): TextRun[] {
  /* 🔴 RAISED ORDINALS ARE ALWAYS ON NOW (6 October 2026) — the setting was removed from the editor,
   * so `TextCase.raisedOrdinals` is `true` at every call site in the product. The flag survives on the
   * type because `fit.ts` and the harness both need to measure the un-raised form, and because an
   * ordinal drawn as one run is the correct answer for a caption, which cannot draw a superscript. */
  if (!c.raisedOrdinals) return [{ text: caps(ordinal(d), c.caps) }]
  return [
    { text: caps(String(d), c.caps) },
    { text: caps(ordinalSuffix(d), c.caps), raised: true },
  ]
}

/**
 * One date, split where a line break may go.
 *
 * 🔴 TWO PARTS AND A SEPARATOR, NOT ONE STRING, BECAUSE "Day on its own line" IS A COUNTRY QUESTION.
 * GB writes "Wednesday 14th October", so the break is after a space. The US writes "Wednesday, October
 * 14th", so the break is after a COMMA — and the comma must then disappear, because a line ending in a
 * dangling comma on a poster reads as a mistake. A component that split a finished string on its first
 * space would get the GB case right and put "Wednesday," on its own line for an American truck.
 *
 * ⚠️ `weekday` IS EMPTY FOR THE `dayMonth` STYLE, which has no weekday in it. "Day on its own line"
 * then has nothing to split and the renderer draws one line — said here rather than left for each
 * caller to rediscover.
 */
export interface DateParts {
  weekday: TextRun[]
  /** What goes between them on ONE line. ⚠️ Never drawn when they are on two. */
  separator: string
  rest: TextRun[]
}

export function datePartsFor(
  ymd: string,
  style: DateStyleId,
  country: CountryCode,
  c: TextCase,
): DateParts {
  const { mo, d } = parts(ymd)
  const spec = localeFor(country)
  const us = spec.country === 'US'
  const weekdayLong = WEEKDAY_NAMES[weekdayOf(ymd)]
  const weekdayShort = weekdayLong.slice(0, 3)
  const monthLong = MONTHS_LONG[mo - 1]
  const monthShort = MONTHS_SHORT[mo - 1]
  const sep = us ? ', ' : ' '

  if (style === 'numeric') {
    /* 🔴 THE ONE STYLE WHERE THE ORDER CHANGES THE MEANING. 14/10 and 10/14 are both "the fourteenth
     * of October" to the truck that wrote them and two different days to a reader from the other
     * country. It is the reason this table is keyed by country rather than by taste.
     * ⚠️ AND NO COMMA IN EITHER COUNTRY: "Wed 10/14" is how a numeric date is written in the US too. */
    const dd = String(d).padStart(2, '0')
    const mm = String(mo).padStart(2, '0')
    const num = spec.numericOrder === 'dmy' ? `${dd}/${mm}` : `${mm}/${dd}`
    return {
      weekday: [{ text: caps(weekdayShort, c.caps) }],
      separator: ' ',
      rest: [{ text: caps(num, c.caps) }],
    }
  }

  const dayAndMonth = (month: string): TextRun[] => us
    ? [{ text: caps(`${month} `, c.caps) }, ...dayRuns(d, c)]
    : [...dayRuns(d, c), { text: caps(` ${month}`, c.caps) }]

  if (style === 'dayMonth') {
    return { weekday: [], separator: '', rest: dayAndMonth(monthLong) }
  }
  if (style === 'short') {
    return {
      weekday: [{ text: caps(weekdayShort, c.caps) }],
      separator: sep,
      rest: dayAndMonth(monthShort),
    }
  }
  // 'long'
  return {
    weekday: [{ text: caps(weekdayLong, c.caps) }],
    separator: sep,
    rest: dayAndMonth(monthLong),
  }
}

/** The date on one line, as runs. */
export function dateRunsFor(
  ymd: string, style: DateStyleId, country: CountryCode, c: TextCase,
): TextRun[] {
  const p = datePartsFor(ymd, style, country, c)
  if (!p.weekday.length) return p.rest
  return [...p.weekday, { text: caps(p.separator, c.caps) }, ...p.rest]
}

/**
 * The date as the lines the renderer draws — one, or two with the weekday on its own.
 *
 * ⚠️ IT RETURNS LINES OF RUNS AND NOTHING ELSE. `FitLine` lives in `fit.ts`, which this module must
 * not import (it reads font metrics); the renderer wraps these.
 */
export function dateLinesFor(
  ymd: string, style: DateStyleId, country: CountryCode, c: TextCase, dayOnOwnLine: boolean,
): TextRun[][] {
  const p = datePartsFor(ymd, style, country, c)
  if (dayOnOwnLine && p.weekday.length) return [p.weekday, p.rest]
  return [dateRunsFor(ymd, style, country, c)]
}

/** The same date as one plain string — for captions, samples and anything that cannot draw runs. */
export const dateTextFor = (
  ymd: string, style: DateStyleId, country: CountryCode, c: TextCase,
): string => dateRunsFor(ymd, style, country, c).map(r => r.text).join('')

/**
 * "Tue 13 Oct" — the compact, ordinal-free form a CAPTION uses.
 *
 * ⛔ A SEPARATE FUNCTION AND NOT A FIFTH `DateStyleId`, because it is not a style a truck can choose:
 * it is what a line of caption text looks like, and offering it in the picker would put a date with no
 * ordinal on a poster where every other option has one.
 * ⚠️ IT STILL ASKS THIS MODULE FOR THE ORDER. "Tue 13 Oct" and "Tue Oct 13" are the same day written
 * two ways, so a caption built with the UK order hard-coded would be wrong for an American truck in
 * exactly the way the poster no longer is.
 */
export function shortDateTextFor(ymd: string, country: CountryCode): string {
  const { mo, d } = parts(ymd)
  const weekday = WEEKDAY_NAMES[weekdayOf(ymd)].slice(0, 3)
  const month = MONTHS_SHORT[mo - 1]
  return localeFor(country).numericOrder === 'mdy'
    ? `${weekday} ${month} ${d}`
    : `${weekday} ${d} ${month}`
}

/**
 * A place name and its town on ONE line.
 *
 * ⚠️ THE SEPARATOR LIVES HERE WITH THE REST OF THE WORDING rather than in the renderer, so the one
 * module that decides how a country writes things decides this too. A comma and a space is correct in
 * both countries this build knows; it is a `locale` function so that stops being an assumption the
 * moment a third one is added.
 */
export const joinNameTown = (name: string, town: string | null | undefined): string => {
  const t = String(town ?? '').trim()
  return t ? `${name}, ${t}` : name
}

/**
 * ══ ⛔ WHAT AN OLD SAVED DESIGN BECOMES ═══════════════════════════════════════════════════════════
 *
 * Before today a date box had one boolean, `twoLines`, and always rendered the GB long form. There was
 * no style id, so every saved design maps to **`'long'`** — which reproduces exactly what it renders
 * now. ⚠️ `twoLines` SURVIVES as "Day on its own line" (§3 WORDING); it is a different question from
 * the wording and the two are not merged.
 */
export const LEGACY_DATE_STYLE: DateStyleId = 'long'

/** The style ids, for validators. ⚠️ Derived from GB's list so the two cannot drift. */
export const DATE_STYLE_IDS: readonly DateStyleId[] =
  LOCALES.GB.dateStyles.map(s => s.id)

export const PLACE_STYLE_IDS: readonly PlaceStyleId[] = ['nameTownBelow', 'nameTown', 'nameOnly']

/** What the Place picker shows against each option. ⚠️ Country-independent: a place name is a place
 *  name everywhere; what differs is only whether the town is shown and where. */
export const PLACE_STYLE_SAMPLES: Record<PlaceStyleId, string> = {
  nameTownBelow: 'The Kings Arms\nLavenham',
  nameTown: 'The Kings Arms, Lavenham',
  nameOnly: 'The Kings Arms',
}

/** The style a layout falls back to when it names none — the same default `validateEventLayout` uses. */
export const DEFAULT_PLACE_STYLE: PlaceStyleId = 'nameTownBelow'

/**
 * The sample for a style, SAFE on an unknown or missing one.
 *
 * ⛔ WHY IT IS A FUNCTION AND NOT A BARE INDEX. `PLACE_STYLE_SAMPLES[l.placeStyle]` is what crashed the
 * design editor on 7 October 2026: a design saved before part 1 has no `placeStyle`, the index returned
 * `undefined`, and the caller did `.split('\n')` on it. The read path that fed it is fixed at source
 * (`readStoredEventLayout`), and this is the second line of defence — a lookup that cannot throw
 * whatever reaches it.
 * ⚠️ IT TAKES `unknown` DELIBERATELY. Typing the parameter `PlaceStyleId` would make TypeScript say the
 * fallback is unreachable, which is exactly the false comfort that let the bug ship: the value comes
 * out of a jsonb column, where the type system has no reach.
 */
export function placeStyleSample(style: unknown): string {
  return (PLACE_STYLE_IDS as readonly string[]).includes(style as string)
    ? PLACE_STYLE_SAMPLES[style as PlaceStyleId]
    : PLACE_STYLE_SAMPLES[DEFAULT_PLACE_STYLE]
}
