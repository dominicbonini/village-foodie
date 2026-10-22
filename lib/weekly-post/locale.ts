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

import { ordinal, ordinalSuffix, type TextCase, type TextRun } from './format'
import { weekdayName, monthName } from '@/lib/time-utils'
import { isEnglish, isLanguageBase } from '@/lib/i18n/locales'   // languages-1
/* ⚠️ `./words` imports THIS file as a type only, so this closes no cycle at run time. */
import { posterWordsFor } from './words'

/** The countries this table knows. ⚠️ A string union, not `string` — an unknown code is a bug, and
 *  `localeFor()` falls back to GB rather than producing an empty date.
 *  languages-1 (22 October 2026): or a NON-ENGLISH LANGUAGE's locale tag ('fr-FR') — a truck in a language that is not English
 *  has no row in the GB/US table: its dates, separators and words come from Intl and its own messages (`languageSpec`). */
export type LanguageKey = `${string}-${string}`
export type CountryCode = 'GB' | 'US' | LanguageKey

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
  (c === 'GB' || c === 'US' ? LOCALES[c] : isLanguageKey(c) ? languageSpec(c) : undefined) ?? LOCALES[DEFAULT_COUNTRY]

/** languages-1: is this poster key a non-English language's locale tag (rather than GB / US)? */
export const isLanguageKey = (c: unknown): c is LanguageKey => typeof c === 'string' && /^[a-z]{2,3}-[A-Z]{2}$/.test(c) && !isEnglish(c)
const languageSpecs = new Map<string, LocaleSpec>()
/** languages-1: the spec a non-English language's posters use — its numeric order from Intl, a 24-hour default, and each
 *  style's sample a real date (Wednesday 14 October) written by Intl, no English ordinal. */
function languageSpec(key: LanguageKey): LocaleSpec {
  let spec = languageSpecs.get(key)
  if (!spec) {
    const order = new Intl.DateTimeFormat(key, { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).formatToParts(new Date(Date.UTC(2026, 9, 14))).filter(p => p.type === 'day' || p.type === 'month').map(p => p.type)
    const sample = (id: DateStyleId) => dateTextFor('2026-10-14', id, key, { caps: false, raisedOrdinals: true })
    spec = { country: key, numericOrder: order[0] === 'month' ? 'mdy' : 'dmy', defaultTimeStyle: '24h',
      dateStyles: (['long', 'short', 'dayMonth', 'numeric'] as DateStyleId[]).map(id => ({ id, sample: '' })) }
    languageSpecs.set(key, spec)
    spec.dateStyles = spec.dateStyles.map(d => ({ ...d, sample: sample(d.id) }))
  }
  return spec
}

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
export function countryForTruck(truck?: { country?: string | null } | null, locale?: string | null): CountryCode {
  // languages-1: a truck whose language is not English (its country's locale, a LANGUAGE_BASES entry) words its posters in it.
  if (locale && isLanguageBase(locale)) return locale as LanguageKey
  const c = truck?.country
  return c && (c in LOCALES) ? (c as CountryCode) : DEFAULT_COUNTRY
}

/* 🔴 THE WORDS COME FROM Intl NOW (Language Phase 0, 14 October 2026) — weekday and month names through
 * lib/time-utils.ts (`weekdayName`, `monthName`, Intl.formatToParts) in the country's locale, the short month
 * by its English rule ("Sep", never en-GB Intl's "Sept"). The hand-written month arrays that lived here are
 * gone; the ORDER, the separator and the ordinal stay this table's business. */
const INTL_LOCALE: Record<'GB' | 'US', string> = { GB: 'en-GB', US: 'en-US' }
/** The Intl locale a country's dates are worded in. ⚠️ Unknown → GB's, as `localeFor` does. languages-1: a language key's own. */
export const intlLocaleFor = (c: CountryCode | string | null | undefined): string => {
  const country = localeFor(c).country
  return isLanguageKey(country) ? country : INTL_LOCALE[country as 'GB' | 'US']
}

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
  if (isLanguageKey(spec.country)) return languageDateParts(ymd, style, spec.country, c)
  const us = spec.country === 'US'
  const loc = INTL_LOCALE[spec.country as 'GB' | 'US']
  const weekdayLong = weekdayName(ymd, loc, 'long')
  const weekdayShort = weekdayName(ymd, loc, 'short')
  const monthLong = monthName(ymd, loc, 'long')
  const monthShort = monthName(ymd, loc, 'short')
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

/** languages-1: a non-English language's date, split the same way — the parts Intl writes for the style (its own order,
 *  punctuation and words; no ordinal), the weekday first where the language puts it first. */
function languageDateParts(ymd: string, style: DateStyleId, key: LanguageKey, c: TextCase): DateParts {
  const { y, mo, d } = parts(ymd)
  const opts: Intl.DateTimeFormatOptions = style === 'long' ? { weekday: 'long', day: 'numeric', month: 'long' }
    : style === 'short' ? { weekday: 'short', day: 'numeric', month: 'short' }
      : style === 'dayMonth' ? { day: 'numeric', month: 'long' } : { weekday: 'short', day: '2-digit', month: '2-digit' }
  const ps = new Intl.DateTimeFormat(key, { ...opts, timeZone: 'UTC' }).formatToParts(new Date(Date.UTC(y, mo - 1, d)))
  const w = ps.findIndex(p => p.type === 'weekday')
  if (w !== 0) return { weekday: [], separator: '', rest: [{ text: caps(ps.map(p => p.value).join(''), c.caps) }] }
  const sepEnd = ps.findIndex((p, i) => i > 0 && p.type !== 'literal')
  return {
    weekday: [{ text: caps(ps[0].value, c.caps) }],
    separator: ps.slice(1, sepEnd).map(p => p.value).join(''),
    rest: [{ text: caps(ps.slice(sepEnd).map(p => p.value).join(''), c.caps) }],
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
  const { y, mo, d } = parts(ymd)
  // languages-1: a non-English language's compact date is Intl's own.
  if (isLanguageKey(country)) return new Intl.DateTimeFormat(country, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, mo - 1, d)))
  const loc = intlLocaleFor(country)
  const weekday = weekdayName(ymd, loc, 'short')
  const month = monthName(ymd, loc, 'short')
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

/** What the Place picker shows against each option, in a country's words (`posterWords.placeSample`, Language Phase
 *  1d Part 2): "The Kings Arms / Lavenham" for GB, "Main Street Brewery / Austin" for the US — the same three shapes.
 *  ⚠️ What differs between the options is only whether the town is shown and where. */
export const placeStyleSamplesFor = (country: CountryCode | string | null | undefined): Record<PlaceStyleId, string> => {
  const t = posterWordsFor(country)
  return { nameTownBelow: t('placeSample.nameTownBelow'), nameTown: t('placeSample.nameTown'), nameOnly: t('placeSample.nameOnly') }
}
/** GB's samples — the export every existing caller reads. ⚠️ A screen in the truck's language asks `placeStyleSample(style, country)`. */
export const PLACE_STYLE_SAMPLES: Record<PlaceStyleId, string> = placeStyleSamplesFor('GB')

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
export function placeStyleSample(style: unknown, country: CountryCode | string | null = DEFAULT_COUNTRY): string {
  const samples = country === DEFAULT_COUNTRY ? PLACE_STYLE_SAMPLES : placeStyleSamplesFor(country)
  return (PLACE_STYLE_IDS as readonly string[]).includes(style as string)
    ? samples[style as PlaceStyleId]
    : samples[DEFAULT_PLACE_STYLE]
}
