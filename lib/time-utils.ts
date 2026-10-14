// lib/time-utils.ts — THE ONE MODULE FOR A TRUCK'S TIME: "now", "today", and how a time or a date LOOKS.
// Client-safe, no imports.
//
// ══ 🔴 PHASE 2B (10 October 2026): EVERY TIME AND DATE IS THE TRUCK'S ═════════════════════════════════════
// A truck's time zone is `trucks.timezone`, else its country's `default_timezone` (country_settings). The
// server resolves it once (lib/truck-time.ts) and hands browsers a `TimeSettings` in the payloads they
// already receive — never the settings row, never a browser read of country_settings.
//   • NOW / TODAY take the zone EXPLICITLY. There is no default zone any more: a helper that silently
//     answered for London is how a US truck would have got the wrong "today" every evening.
//   • DISPLAY takes the whole TimeSettings: 24h/12h (`time_format`), d/m or m/d (`date_order`), the
//     locale, and the week's first day. GB renders exactly what it always has — "18:30", "Fri 9 Oct",
//     "09/10/2026"; a US truck gets "6:30pm", "Fri, Oct 9", "10/09/2026".
//   • 🔴 ONE 12-HOUR STYLE: `clockOf` is the weekly post's own ("6pm", "6:30pm" — minutes only when not
//     :00), moved here so the app and the poster cannot word a time two ways.
// Storage is untouched: times stay "HH:MM:SS", instants stay UTC.

/** A truck's time, as the screens need it. From country_settings + trucks.timezone (lib/truck-time.ts). */
export type TimeFormat = '24h' | '12h'
export type DateOrder = 'dmy' | 'mdy'
export type WeekStart = 'monday' | 'sunday'
export interface TimeSettings {
  /** IANA zone — the truck's wall clock. */
  timeZone: string
  /** BCP 47 locale for words ("Friday", "October"). */
  locale: string
  timeFormat: TimeFormat
  dateOrder: DateOrder
  weekStart: WeekStart
}

/**
 * ══ ⚠️ THE ONE PLACE A ZONE IS NAMED WITHOUT A TRUCK — AND WHY IT IS GB ══════════════════════════════════
 * A payload that carries no TimeSettings can only be an OFFLINE SNAPSHOT saved before this build (the
 * native dashboard / KDS keep the last truck object they loaded). Every truck that existed before this
 * build is a UK truck — Dominic, 10 October 2026: "existing trucks are UK. when a truck is created a
 * country will be set. that will define what settings apply in the dashboard/KDS". So that one case
 * gets GB's settings — this is a mirror of the GB country_settings row, not a default for any truck —
 * and `timeSettingsOr` logs a warning each time a screen falls back to it. Keep it equal to the GB row.
 */
export const LEGACY_UK_TIME_SETTINGS: TimeSettings = Object.freeze({
  timeZone: 'Europe/London', locale: 'en-GB', timeFormat: '24h', dateOrder: 'dmy', weekStart: 'monday',
})

/** The public DISCOVERY pages — the map, the home page, a truck's public profile and its embed — list
 *  scraped and multi-truck events for the marketing country (GB), and the ADMIN screens are HatchGrab's own
 *  (UK). Both are on Phase 2B's "staying as they are" list (docs/time-and-dates-report.md), so they keep the
 *  UK's settings by name, not by accident. */
export const DISCOVERY_TIME_SETTINGS: TimeSettings = LEGACY_UK_TIME_SETTINGS

const warned = new Set<string>()
/** The settings a screen was given, or (only for a pre-build offline snapshot) GB's, with one warning. */
export function timeSettingsOr(ts: TimeSettings | null | undefined, where: string): TimeSettings {
  if (ts && ts.timeZone && ts.locale) return ts
  if (!warned.has(where)) {
    warned.add(where)
    console.warn(`[time] ${where}: no time settings in this payload (an offline snapshot from before 10 October 2026?) — using the UK's, as every pre-existing truck is`)
  }
  return LEGACY_UK_TIME_SETTINGS
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// HOW A TIME LOOKS
// ════════════════════════════════════════════════════════════════════════════════════════════════════════

/** "18:30" — the storage form with the seconds trimmed. For LOGIC and comparisons, never for display. */
export function hhmm(time: string | null | undefined): string {
  return time?.slice(0, 5) ?? ''
}

/**
 * One time in a style. 24h: "18:30". 12h: "6pm", and "6:30pm" when there are minutes — never "6:00pm";
 * midnight and noon are 12am / 12pm. ⚠️ The weekly post's style (lib/weekly-post/format.ts calls this).
 */
export function clockOf(t: string | null | undefined, style: TimeFormat): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t ?? '').trim())
  if (!m) return ''
  const h = Number(m[1]), mi = Number(m[2])
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return ''
  if (style === '24h') return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`
  const suffix = h < 12 ? 'am' : 'pm'
  const h12 = h % 12 || 12
  return mi === 0 ? `${h12}${suffix}` : `${h12}:${String(mi).padStart(2, '0')}${suffix}`
}

/** A stored time ("HH:MM[:SS]") for a screen, in the truck's style. GB: "18:30" exactly as before. */
export function formatTime(time: string, ts: TimeSettings | null | undefined): string {
  const s = timeSettingsOr(ts, 'formatTime')
  if (s.timeFormat === '24h') return hhmm(time)
  return clockOf(time, '12h') || hhmm(time)
}

/**
 * A slot string as stored or passed around ("18:30") for a screen, an email or a ticket. 24h: EXACTLY the
 * string given — these surfaces have always printed the value as it arrived, and a GB byte must not move.
 * 12h: the one 12-hour style ("6:30pm").
 */
export function formatSlot<T extends string | null | undefined>(slot: T, ts: TimeSettings | null | undefined): T | string {
  if (!slot) return slot
  const s = timeSettingsOr(ts, 'formatSlot')
  return s.timeFormat === '24h' ? slot : (clockOf(slot, '12h') || slot)
}

/**
 * "HH:MM – HH:MM" for display — the canonical event-time range. Always trims seconds (never raw).
 * Both empty → ''; no end → just the start; no start → just the end. Use this everywhere a
 * start–end pair is shown so no surface re-introduces seconds (the recurring bug).
 */
export function formatTimeRange(start: string | null | undefined, end: string | null | undefined, ts: TimeSettings | null | undefined): string {
  const s = formatTime(start ?? '', ts)
  const e = formatTime(end ?? '', ts)
  if (!s && !e) return ''
  if (!e) return s
  if (!s) return e
  return `${s} – ${e}`
}

// TIMEZONE ARCHITECTURE (V7.x, finished Phase 2B) — the TRUCK's wall clock, not the device's or the
// server's (UTC on Vercel). All "now"/"today" decisions run in the truck's zone so the server and every
// client agree. ⛔ NO DEFAULT ZONE: every caller names it (the truck's, from TimeSettings.timeZone).

/** Current minute-of-day (hour*60+min) in the given timezone, regardless of device/server tz. */
export function getNowMinsInTz(tz: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date())
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? '0')
  return get('hour') * 60 + get('minute')
}

/** Both event times present + valid HH:MM — the precondition for an event going LIVE (confirmed/open). The
 *  slot/collection/capacity engine needs BOTH (start = floor, end = the slot-range/"available until" bound);
 *  a null time can't project slots. DRAFTS (unconfirmed) may omit them — this gates only the live transition.
 *
 *  V11.15 - IT NOW ALSO REQUIRES end > start, AND THAT IS A NEW RULE, NOT A CLARIFICATION.
 *  Until the operator time control was split into hour + minute selects, the ONLY thing enforcing
 *  ordering anywhere in the product was a UI option filter (SCHEDULE_TIME_OPTIONS.filter(t => t > start))
 *  in one component. Nothing server-side checked it, so any path that did not go through that component -
 *  the schedule importer, the inbound-schedule route, the scraper - could store an end at or before its
 *  own start. A split control cannot express "later than the start" as a flat filter, so the rule moves
 *  here, where every save path already passes.
 *  WHY IT MATTERS BEYOND TIDINESS: the customer order page builds its collection hours as
 *  `for (h = startH; h <= endH; h++)`, which yields an EMPTY list when endH < startH - an event nobody
 *  can order from, with no error anywhere to say why. Refusing the row is how that stays impossible.
 *  NOT AN OVERNIGHT-EVENT GATE. Overnight events are unbuilt (they need a date on each end, not just
 *  a time); this refuses to let one be half-expressed.
 *  CHECKED AGAINST LIVE DATA BEFORE SHIPPING: of 97 truck_events rows, 81 hold both times and ZERO
 *  have end <= start, so no existing row - Pizzeria Gusto's included - is newly refused.
 *  Times are compared as MINUTES, not strings: the seconds a `time` column returns ('17:00:00') make
 *  a string compare against 'HH:MM' silently wrong, which is a live bug elsewhere in this repo. */
export function hasValidEventTimes(start?: string | null, end?: string | null): boolean {
  const ok = (t?: string | null) => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d/.test(t)
  if (!ok(start) || !ok(end)) return false
  const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
  return mins(end as string) > mins(start as string)
}

/** Calendar date 'YYYY-MM-DD' in the given timezone (the tz-aware localToday). */
export function getLocalDateInTz(tz: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Calendar date 'YYYY-MM-DD' of an ARBITRARY instant (Date or ISO string) in the given timezone.
 *  Same tz-aware Intl pattern as getLocalDateInTz — just formatting a passed-in instant instead of
 *  now — so the two produce directly comparable strings (e.g. a log row's created_at vs today's
 *  local date). The shared primitive: never hand-roll a parallel Intl call / UTC-offset math at the
 *  call site (Section 7 UTC-vs-local discipline). */
export function localDateOfInstant(instant: Date | string, tz: string): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

// ⛔ `localTodayIso()` IS GONE (Phase 2B). It answered "today" for London whatever the truck; every
// caller now asks getLocalDateInTz(truck zone). Section 7: never use toISOString() (UTC) for "today".

/**
 * Status-INDEPENDENT default event pick (cross-event resolution fix). Given a list of
 * events, return the one to default to WITHOUT ever keying on status ('open'/'live') or a
 * UTC "today" lookup — so a stale-live event (auto-close failed) can NEVER hijack the
 * resolution of a different selected/viewed event. Order:
 *   1. the event currently in progress BY TIME (start <= now <= end), else
 *   2. the earliest upcoming event by start datetime, else
 *   3. the most recent past event by start datetime (so something sensible still shows).
 * Times are parsed as LOCAL wall-clock (`${event_date}T${time}`), matching localTodayIso().
 * Callers should always prefer an explicit event_id; this is only the no-selection default.
 */
export function pickDefaultEventByTime<
  T extends { event_date: string; start_time: string | null; end_time: string | null }
>(events: T[], tz: string): T | null {
  if (!events?.length) return null
  // Wall-clock keys "YYYY-MM-DDTHH:MM:SS" compared as strings — the event's own date and time against
  // the truck's now, in the truck's zone (was: the DEVICE's zone, via `new Date(\`${date}T${time}\`)`).
  const sec = (t: string) => (t.length === 5 ? `${t}:00` : t.slice(0, 8))
  const nowKey = `${getLocalDateInTz(tz)}T${clockSecondsInTz(new Date(), tz)}`
  const startKey = (e: T) => e.start_time ? `${e.event_date}T${sec(e.start_time)}` : '\uffff'
  const endKey = (e: T) => e.end_time ? `${e.event_date}T${sec(e.end_time)}` : '\uffff'
  const current = events.find(e => startKey(e) <= nowKey && nowKey <= endKey(e))
  if (current) return current
  const upcoming = events.filter(e => startKey(e) >= nowKey).sort((a, b) => (startKey(a) < startKey(b) ? -1 : startKey(a) > startKey(b) ? 1 : 0))
  if (upcoming.length) return upcoming[0]
  return [...events].sort((a, b) => (startKey(b) < startKey(a) ? -1 : startKey(b) > startKey(a) ? 1 : 0))[0] ?? null
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE TRUCK'S CLOCK — instants in its zone
// ════════════════════════════════════════════════════════════════════════════════════════════════════════

const partsIn = (d: Date, tz: string) => {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(d)
  const g = (t: string) => p.find(x => x.type === t)?.value ?? '00'
  return { y: g('year'), mo: g('month'), d: g('day'), h: g('hour'), mi: g('minute'), s: g('second') }
}

/** "HH:MM" of an instant on the truck's clock. */
export function clockOfInstantInTz(instant: Date | string | number, tz: string): string {
  const p = partsIn(new Date(instant), tz)
  return `${p.h}:${p.mi}`
}

/** "HH:MM:SS" of an instant on the truck's clock. */
export function clockSecondsInTz(instant: Date | string | number, tz: string): string {
  const p = partsIn(new Date(instant), tz)
  return `${p.h}:${p.mi}:${p.s}`
}

/** Minute-of-day of an instant on the truck's clock. */
export function minsOfInstantInTz(instant: Date | string | number, tz: string): number {
  const p = partsIn(new Date(instant), tz)
  return Number(p.h) * 60 + Number(p.mi)
}

/** 'YYYY-MM-DD' plus n days — calendar arithmetic, no zone involved. */
export function addDaysYmd(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + n)).toISOString().slice(0, 10)
}

/** The UTC instant (ms) of a wall-clock date and time on the truck's clock. */
export function instantOfLocal(ymd: string, time: string, tz: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  const [hh, mm, ss] = (time || '00:00').split(':').map(Number)
  const wall = Date.UTC(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, ss || 0)
  // The zone's offset at that wall time: guess, measure, correct once (enough away from a DST jump).
  const offsetAt = (t: number) => {
    const p = partsIn(new Date(t), tz)
    return Date.UTC(+p.y, +p.mo - 1, +p.d, +p.h, +p.mi, +p.s) - t
  }
  let t = wall - offsetAt(wall)
  t = wall - offsetAt(t)
  return t
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// HOW A DATE LOOKS — by the country's locale and date order
// ════════════════════════════════════════════════════════════════════════════════════════════════════════

/** A calendar date ('YYYY-MM-DD') through Intl in the truck's locale. ⚠️ Pinned to UTC on purpose: a DATE
 *  has no zone, and formatting its UTC midnight in UTC can never shift it a day. */
export function formatYmd(ymd: string, ts: TimeSettings | null | undefined, opts: Intl.DateTimeFormatOptions): string {
  const s = timeSettingsOr(ts, 'formatYmd')
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1)).toLocaleDateString(s.locale, { ...opts, timeZone: 'UTC' })
}

/** An INSTANT's date or time through Intl in the truck's locale AND zone. */
export function formatInstant(instant: Date | string | number, ts: TimeSettings | null | undefined, opts: Intl.DateTimeFormatOptions): string {
  const s = timeSettingsOr(ts, 'formatInstant')
  return new Date(instant).toLocaleString(s.locale, { ...opts, timeZone: s.timeZone })
}

/** An instant's clock time in the truck's style: GB "15:20:00" (with seconds) / "15:20"; US "3:20pm". */
export function formatInstantClock(instant: Date | string | number, ts: TimeSettings | null | undefined, withSeconds = false): string {
  const s = timeSettingsOr(ts, 'formatInstantClock')
  if (s.timeFormat === '24h') return withSeconds ? clockSecondsInTz(instant, s.timeZone) : clockOfInstantInTz(instant, s.timeZone)
  return clockOf(clockOfInstantInTz(instant, s.timeZone), '12h')
}

/** "09/10/2026" (d/m) or "10/09/2026" (m/d). `short` gives the two-digit year: "09/10/26". */
export function formatNumericDate(ymd: string, ts: TimeSettings | null | undefined, short = false): string {
  const s = timeSettingsOr(ts, 'formatNumericDate')
  const [y, m, d] = ymd.split('-')
  const yy = short ? y.slice(2) : y
  return s.dateOrder === 'mdy' ? `${m}/${d}/${yy}` : `${d}/${m}/${yy}`
}

/** "09/10" (d/m) or "10/09" (m/d). */
export function formatNumericDayMonth(ymd: string, ts: TimeSettings | null | undefined): string {
  const s = timeSettingsOr(ts, 'formatNumericDayMonth')
  const [, m, d] = ymd.split('-')
  return s.dateOrder === 'mdy' ? `${m}/${d}` : `${d}/${m}`
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE ONE PATH FOR A DATE'S WORDS (Language Phase 0, docs/language-phase-0-report.md §3)
// Weekday and month names come from Intl in the locale given; the ordinal and the short month are the two
// rules Intl has no answer for. Every date word in the product goes through these four functions — the hand-
// written name arrays (here, lib/preorder.ts, lib/weekly-post/{week,locale}.ts, lib/whatsapp/copy.ts) and the
// two other ordinal implementations (lib/weekly-post/format.ts, lib/utils.ts) are gone.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════

/** "st" | "nd" | "rd" | "th". 🔴 THE TEENS ARE CHECKED FIRST: `n % 10 === 1 ? 'st'` gives "11st", "12nd",
 *  "13rd". ⚠️ ENGLISH ONLY — the product's ordinals are English in every country it serves today; a language
 *  that writes ordinals ("1er", "1.") gets its own form when it is added (.cursor/rules/language.mdc). */
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

/** "9th", "22nd" — English ordinals, as every date in the product writes them. */
export function ordinalDay(d: number): string {
  return `${d}${ordinalSuffix(d)}`
}

const nameFormats = new Map<string, Intl.DateTimeFormat>()
/** One part of a calendar date ('YYYY-MM-DD') from Intl.formatToParts, in UTC so a date can never shift a day. */
function datePart(ymd: string, locale: string, opts: Intl.DateTimeFormatOptions, type: 'weekday' | 'month'): string {
  const key = `${locale}|${JSON.stringify(opts)}`
  let f = nameFormats.get(key)
  if (!f) { f = new Intl.DateTimeFormat(locale, { ...opts, timeZone: 'UTC' }); nameFormats.set(key, f) }
  const [y, m, d] = ymd.split('-').map(Number)
  return f.formatToParts(new Date(Date.UTC(y, (m || 1) - 1, d || 1))).find(p => p.type === type)?.value ?? ''
}

/** The weekday's name in the locale: "Saturday" / "Sat". Straight from Intl, long and short. */
export function weekdayName(ymd: string, locale: string, width: 'long' | 'short'): string {
  return datePart(ymd, locale, { weekday: width }, 'weekday')
}

/**
 * The month's name in the locale: "September" / "Sep".
 * 🔴 THE SHORT FORM IS A RULE, NOT Intl's, FOR ENGLISH (Dominic, 14 October 2026, option A): the first three
 * letters of Intl's FULL name. Intl's own short form is "Sept" in en-GB, every screen has always written
 * "Sep", and the browser's data differs by device (an older iPad may say "Sep", a newer one "Sept") — the full
 * names are the same everywhere, so three letters of them is the same everywhere.
 * ⛔ THREE-LETTER TRUNCATION IS ENGLISH-ONLY. It fails in other languages (French "juin" and "juillet" are both
 * "jui"). EACH LATER LANGUAGE MUST DEFINE ITS SHORT MONTH FORM WHEN IT IS ADDED — add it to SHORT_MONTH_RULES.
 * Until it does, a non-English locale gets Intl's own short form rather than a guess.
 */
const SHORT_MONTH_RULES: Record<string, (long: string) => string> = {
  en: long => long.slice(0, 3),
}
export function monthName(ymd: string, locale: string, width: 'long' | 'short'): string {
  if (width === 'short') {
    const rule = SHORT_MONTH_RULES[locale.split('-')[0].toLowerCase()]
    if (rule) return rule(datePart(ymd, locale, { month: 'long' }, 'month'))
  }
  return datePart(ymd, locale, { month: width }, 'month')
}

/**
 * "Friday 9th October" (d/m) or "Friday, October 9th" (m/d) — the long form with an ordinal, the order
 * the weekly post's 'long' style writes. `weekday: false` drops the day name ("9th October").
 */
export function formatOrdinalDate(ymd: string, ts: TimeSettings | null | undefined, weekday = true): string {
  const s = timeSettingsOr(ts, 'formatOrdinalDate')
  const d = Number(ymd.split('-')[2])
  const day = formatYmd(ymd, s, { weekday: 'long' })
  const month = formatYmd(ymd, s, { month: 'long' })
  if (s.dateOrder === 'mdy') return weekday ? `${day}, ${month} ${ordinalDay(d)}` : `${month} ${ordinalDay(d)}`
  return weekday ? `${day} ${ordinalDay(d)} ${month}` : `${ordinalDay(d)} ${month}`
}

/**
 * "Fri 9th Oct" (d/m) or "Fri, Oct 9th" (m/d) — Manage's schedule cards. The short month is `monthName`'s
 * rule ("Sep", never Intl's en-GB "Sept"), so these cards read as they always have.
 */
export function formatShortOrdinalDate(ymd: string, ts: TimeSettings | null | undefined): string {
  const s = timeSettingsOr(ts, 'formatShortOrdinalDate')
  const d = Number(ymd.split('-')[2])
  const wd = weekdayName(ymd, s.locale, 'short')
  const mo = monthName(ymd, s.locale, 'short')
  return s.dateOrder === 'mdy' ? `${wd}, ${mo} ${ordinalDay(d)}` : `${wd} ${ordinalDay(d)} ${mo}`
}

/** The week's first day as an index Monday=0 … Sunday=6 (the weekly post's convention). */
export const weekStartIndex = (ts: TimeSettings | null | undefined): 0 | 6 =>
  timeSettingsOr(ts, 'weekStartIndex').weekStart === 'sunday' ? 6 : 0
