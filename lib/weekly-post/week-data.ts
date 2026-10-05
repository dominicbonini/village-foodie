// lib/weekly-post/week-data.ts — the week's events, as the seven rows of the poster.
//
// 🔴 ONE PLACE DECIDES WHAT EACH DAY SAYS. The setup preview, the weekly-post preview, the downloaded
// PNG and the captions all read this structure, so there is no way for the image and the caption to
// disagree about which day a truck is trading.
//
// 🔴 THE PLACE NAME COMES FROM `placeForEvent`, THE EXISTING RESOLVER, and nothing here re-implements
// it. `truck_places.name_key`'s column comment defines the matching key as "whatever
// `normalisePlaceName` returns", and a second matcher would mean events stop finding their place and
// the poster comes out saying the wrong village with no error anywhere.
//
// ⚠️ PURE. Events and places in, seven days out. No clock beyond the week it is handed, no database.

import { placeForEvent, type Place, type PlaceEvent } from '@/lib/schedule-graphics/places'
/* 🔴 ONE DEFINITION OF THE PUBLIC LABEL, shared with every feed. */
import { PRIVATE_PUBLIC_LABEL } from '@/lib/private-events/resolve'
import { formatTimeRangeFor, type TimeStyle } from './format'
import type { WeekRange } from './week'

/** An event as this module needs it: `PlaceEvent` plus the id, so one can be left off the image. */
export interface WeekEvent extends PlaceEvent {
  id: string
  /**
   * 🔴 PRIVATE EVENTS GO ON THE POSTER AS "Private event" WITH NO LOCATION (20261014, decision 4).
   *
   * ⚠️ OPTIONAL, AND ABSENT MEANS PUBLIC. Every existing caller and every fixture omits it, so a
   * poster for a truck with no private events is byte-identical — the two functions below take the
   * same branch they always did.
   * ⚠️ IT IS SET ON THE ROW BY THE ROUTE, FROM A SEPARATE PROBED READ — not selected alongside
   * `venue_name`. The weekly post is the operator's own poster, and a missing migration must not stop
   * them making one; see the note at `loadWeek`.
   */
  is_private?: boolean | null
}

export type TradingStatus = 'trading' | 'cancelled'

export interface DayEntry {
  eventId: string
  /**
   * The place this event resolved to, or null.
   *
   * 🔴 ADDED SO THE DESIGN CAN BE FOUND BY ID (stage 2b). docs/event-post-stage2-report.md §8.3
   * recorded that the single-event post matched a place's picture by its NAME, because that was all
   * `entryFor` returned — correct, but correct by coincidence. Two places whose names resolve to the
   * same string would share a picture, and now a whole DESIGN, which decides where the text goes.
   * The id is what `placeForEvent` actually resolved; carrying it makes the match structural.
   */
  placeId: string | null
  /** The place's "Name on posts", else the event's venue_name. Never blank — see `locationName`. */
  name: string
  /**
   * The town, on a second smaller line. Null when it is unknown, or when it is already in the name —
   * "Lavenham Village Hall / Lavenham" is noise on a poster with seven rows.
   */
  town: string | null
  /** Formatted per the design's time style. '' when the event has no usable times. */
  time: string
  status: TradingStatus
  /** For sorting and for the per-event captions. */
  startTime: string | null
  endTime: string | null
}

export interface WeekDay {
  /** 'YYYY-MM-DD'. */
  date: string
  /** Sorted by start time. Empty = a day off. */
  entries: DayEntry[]
  /** No entries at all — the Date box takes the days-off background and Location shows the days-off text. */
  isDayOff: boolean
}

export interface WeekData {
  range: WeekRange
  days: WeekDay[]
  /** Every event the week contains, after the status and exclusion filters — for the captions. */
  included: WeekEvent[]
}

/**
 * Which statuses appear on the poster.
 *
 * 🔴 `closed` TRADES. It is the status an event takes once its day is done or its orders are shut —
 * the truck WAS there. The places feature already draws this line ("a closed event is the clearest
 * evidence of which van actually traded there") and this agrees with it: a poster for the current week
 * must still show Monday if Monday has closed.
 * 🔴 `cancelled` IS NOT A DAY OFF. It is a crossed-out location and the word CANCELLED where the time
 * goes, because "we are not coming after all" is different information from "we never were".
 */
export function tradingStatusOf(status: string | null | undefined): TradingStatus {
  const s = String(status ?? '').trim().toLowerCase()
  if (s === 'cancelled') return 'cancelled'
  if (s === 'confirmed' || s === 'unconfirmed' || s === 'closed' || s === '') return 'trading'
  /* ⚠️ AN UNKNOWN STATUS TRADES rather than vanishing. A status this code has not met is far more
   * likely to be a new flavour of "on" than a new flavour of cancelled, and a silently missing day on
   * finished artwork is the worse failure. */
  return 'trading'
}

/**
 * The place's name for the poster.
 *
 * ⚠️ `short_name` FIRST WHEN IT EXISTS. It is the field an operator fills in precisely because the
 * full name does not fit on a poster — ignoring it here would make them fight the shrink-to-fit.
 * ⚠️ NEVER BLANK. A place row with an empty name falls through to the event's own venue_name, and an
 * event with neither gets a dash rather than an empty box, so the row still reads as a row.
 */
export function locationName(ev: WeekEvent, place: Place | null): string {
  /* ⛔ FIRST, AND BEFORE THE PLACE IS CONSULTED AT ALL (20261014). A private event's row says
   * "Private event" and nothing else — not the place's "Name on posts", not its short name, not the
   * venue. Returning early is what makes that true however the place resolved: a private booking at
   * a pitch the truck uses publicly would otherwise print that pitch's name. */
  if (ev.is_private) return PRIVATE_PUBLIC_LABEL
  const short = String(place?.short_name ?? '').trim()
  if (short) return short
  const name = String(place?.name ?? '').trim()
  if (name) return name
  const venue = String(ev.venue_name ?? '').trim()
  return venue || '—'
}

/**
 * The town line, or null.
 *
 * 🔴 SUPPRESSED WHEN THE NAME ALREADY CONTAINS IT. "Lavenham Village Hall" in Lavenham needs no second
 * line, and seven redundant lines is what makes a poster look automated. Compared case-insensitively
 * on whole words so "Hall" in "Halltown" does not count as a match.
 */
export function townLine(ev: WeekEvent, place: Place | null, name: string): string | null {
  /* ⛔ AND NO TOWN LINE EITHER. The brief's "date and times only" means the second line goes too —
   * "Private event / Lavenham" would publish the village. */
  if (ev.is_private) return null
  const town = String(place?.area ?? '').trim() || String(ev.town ?? '').trim()
  if (!town) return null
  const inName = new RegExp(`\\b${town.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(name)
  return inName ? null : town
}

/** Minutes from midnight, for sorting. A missing time sorts last within its day. */
const startMins = (t: string | null | undefined): number => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t ?? '').trim())
  return m ? Number(m[1]) * 60 + Number(m[2]) : 24 * 60 + 1
}

/**
 * ONE EVENT, AS A ROW OF A POSTER — the shared rule for both the weekly post and the single-event post.
 *
 * 🔴 EXTRACTED SO THERE IS ONE OF IT (stage 2). The single-event post needs exactly this: the place
 * name through `placeForEvent`, the town line with the same suppression rule, the cancelled handling.
 * Writing it again in an event module would be a second answer to "what does this poster say about this
 * event", and the two would drift the first time either rule changed.
 *
 * ⚠️ THE TIME IS THE RANGE FORM HERE. The single-event post's "From 5pm" is applied by its own
 * renderer through `formatEventTime`, because the display choice belongs to that design, not to the
 * event; `startTime`/`endTime` travel untouched so it can.
 */
export function entryFor(ev: WeekEvent, places: readonly Place[], timeStyle: TimeStyle): DayEntry {
  const place = placeForEvent(ev, places)
  const name = locationName(ev, place)
  const status = tradingStatusOf(ev.status)
  return {
    eventId: ev.id,
    placeId: place?.id ?? null,
    name,
    town: townLine(ev, place, name),
    /* ⚠️ A CANCELLED EVENT'S TIME IS NOT FORMATTED. The Time box reads "CANCELLED"; computing the
     * range and then throwing it away would leave two sources for what that box says. */
    time: status === 'cancelled' ? '' : formatTimeRangeFor(ev.start_time, ev.end_time, timeStyle),
    status,
    startTime: ev.start_time ?? null,
    endTime: ev.end_time ?? null,
  }
}

export interface BuildWeekOptions {
  timeStyle: TimeStyle
  /** Default on. Off hides cancelled events entirely, which can turn a day into a day off. */
  showCancelled: boolean
  /** Event ids the operator ticked off this image. */
  excludedEventIds?: readonly string[]
}

/**
 * The seven days.
 *
 * ⚠️ EVENTS OUTSIDE THE WEEK ARE DROPPED HERE, not assumed absent. The caller fetches by date range,
 * but a range query that is off by a day at either end would otherwise put an eighth day's event into
 * Monday's row — silently, because every row would still look plausible.
 */
export function buildWeekData(
  range: WeekRange,
  events: readonly WeekEvent[],
  places: readonly Place[],
  opts: BuildWeekOptions,
): WeekData {
  const excluded = new Set(opts.excludedEventIds ?? [])
  const byDate = new Map<string, DayEntry[]>()
  const included: WeekEvent[] = []
  for (const d of range.days) byDate.set(d, [])

  for (const ev of events) {
    const date = String(ev.event_date ?? '')
    const bucket = byDate.get(date)
    if (!bucket) continue                                 // not in this week
    if (excluded.has(ev.id)) continue
    const status = tradingStatusOf(ev.status)
    if (status === 'cancelled' && !opts.showCancelled) continue
    bucket.push(entryFor(ev, places, opts.timeStyle))
    included.push(ev)
  }

  const days: WeekDay[] = range.days.map(date => {
    const entries = (byDate.get(date) ?? []).slice().sort((a, b) => {
      const d = startMins(a.startTime) - startMins(b.startTime)
      /* ⚠️ TIE-BROKEN BY NAME, THEN BY ID, so two events starting at the same minute do not swap
       * order between renders. A poster that changes when nothing changed is a poster an operator
       * stops trusting. */
      return d !== 0 ? d : (a.name.localeCompare(b.name) || a.eventId.localeCompare(b.eventId))
    })
    return { date, entries, isDayOff: entries.length === 0 }
  })

  return { range, days, included }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE BUSY-WEEK FIXTURE
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * A deliberately demanding week, for the setup screen's "Preview a busy week".
 *
 * 🔴 IT EXISTS BECAUSE A QUIET WEEK PROVES NOTHING. An operator places their boxes against whatever
 * next week happens to hold — often three short names — approves it, and then a week arrives with two
 * events on a Saturday and "Great Waldingfield Recreation Ground" on the Wednesday, and the design
 * they approved cannot hold it. This is the worst case they can check against BEFORE it happens: a
 * 60-character place name, a stacked day, a cancelled day and a day off.
 *
 * ⚠️ IT IS NOT RANDOM AND IT IS NOT REAL. Fixed strings, so the same design always produces the same
 * busy preview, and no live truck's data is involved in a check about layout.
 * ⚠️ IT GOES THROUGH THE SAME RENDERER as everything else — it is week DATA, not a second drawing path.
 */
export function busyWeekData(range: WeekRange, opts: BuildWeekOptions): WeekData {
  const d = range.days
  const events: WeekEvent[] = [
    { id: 'busy-1', event_date: d[0], start_time: '17:00', end_time: '20:00', venue_name: 'Lavenham Village Hall', town: 'Lavenham', status: 'confirmed' },
    { id: 'busy-2', event_date: d[2], start_time: '17:30', end_time: '20:30', venue_name: 'Great Waldingfield Recreation Ground and Playing Field', town: 'Great Waldingfield', status: 'confirmed' },
    { id: 'busy-3', event_date: d[3], start_time: '12:00', end_time: '14:00', venue_name: 'Market Square', town: 'Sudbury', status: 'cancelled' },
    { id: 'busy-4', event_date: d[5], start_time: '11:00', end_time: '14:30', venue_name: 'Food Festival', town: 'Bury St Edmunds', status: 'confirmed' },
    { id: 'busy-5', event_date: d[5], start_time: '17:00', end_time: '21:00', venue_name: 'The Bull Inn', town: 'Cavendish', status: 'confirmed' },
    { id: 'busy-6', event_date: d[6], start_time: '12:00', end_time: '16:00', venue_name: 'Church Green', town: 'Long Melford', status: 'unconfirmed' },
  ]
  // ⚠️ Tuesday and Friday are left empty on purpose — the days-off text has to be checked too.
  return buildWeekData(range, events, [], opts)
}
