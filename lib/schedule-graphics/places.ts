// lib/schedule-graphics/places.ts — one definition of "which place is this event at", and the
// idempotent plan that turns a truck's schedule into its list of places.
//
// 🔴 THIS IS THE MODULE STAGES 2 AND 3 IMPORT. The image generator has to put the right dates under the
// right place name, and the posting checklist has to know which groups a given event's post belongs in.
// Both answer the same question this file answers. A second normaliser or a second matching rule
// anywhere would not throw and would not warn — events would simply stop finding their place, and the
// graphic would come out with an empty week under a correct heading.
//
// ⚠️ PURE AND SYNCHRONOUS THROUGHOUT. Nothing here reads the network, the clock or the database: every
// function takes rows and returns rows, and the caller has already done the reading. That is what lets
// the harness test the seeding PLAN — the decision — without a database to seed.
//
// 🔴 READ-ONLY ABOUT `truck_events` AND `venues`. This module is handed event rows and returns
// intentions about `truck_places`. It describes no write to either source table, and the route that
// applies these intentions touches neither.

// ── THE ROW SHAPES, AS NARROW AS THE WORK NEEDS ──────────────────────────────────────────────────
// ⚠️ DELIBERATELY NOT the full table types. These are the columns the matching actually reads, so a
// caller can pass an event row from any select that includes them, and a harness can build one by hand
// without inventing thirty irrelevant fields.

/** One `truck_events` row, as the matching reads it. */
export interface PlaceEvent {
  /** 🔴 THE OPERATOR'S OWN ANSWER, and the strongest identity there is. Written only on insert by the
   *  Add event modal, so it is null on every scraped event and on everything created before
   *  3 October 2026 — which is the normal case, not a gap. */
  truck_place_id?: string | null
  /** The scraper's / operator's anchor to the shared `venues` row, when there is one. */
  venue_id?: string | null
  /** 🔴 NOT NULL in the table, so this is always something — but '' is possible and matches nothing. */
  venue_name?: string | null
  /** 'YYYY-MM-DD'. */
  event_date?: string | null
  start_time?: string | null
  end_time?: string | null
  /** Seen in production: closed | cancelled | confirmed | unconfirmed. */
  status?: string | null
  /** Preferred over `address` when seeding, because it is the venue's address rather than the pitch's. */
  venue_address?: string | null
  address?: string | null
  postcode?: string | null
  /** The village/town. ⚠️ THE SAME FACT AS `truck_places.area`, under the name the events table uses —
   *  it is what the Add event form's "Area" field already writes. */
  town?: string | null
}

/** One `truck_places` row, as the matching reads it. */
export interface Place {
  id: string
  venue_id?: string | null
  name_key: string
  name?: string | null
  short_name?: string | null
  address?: string | null
  postcode?: string | null
  /** The village, town or city. Seeded from the event's `town`. */
  area?: string | null
  is_favourite?: boolean | null
  /** Out of the list unless "Show hidden places" is on. Still matches its events. */
  is_hidden?: boolean | null
  /** Set when this place has been merged into another — its events resolve to the target. */
  merged_into_id?: string | null
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1 · THE NORMALISER
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The matching key for a venue name. 🔴 THE ONLY IMPLEMENTATION — `truck_places.name_key` is defined as
 * "whatever this function returns", and its column comment says so.
 *
 * Lower-case, accents folded, `&` → `and`, apostrophes removed, every other punctuation mark → a space,
 * whitespace collapsed, trimmed.
 *
 * ⚠️ THE ORDER OF THOSE STEPS IS LOAD-BEARING, in three places:
 *   • `&` becomes ` and ` BEFORE punctuation is stripped. Stripped first, "Bull & Butcher" would be
 *     "bull butcher" and would never meet "Bull and Butcher". The spaces around it are what make
 *     "B&B" → "b and b" rather than "band".
 *   • APOSTROPHES ARE DELETED, not spaced. "Bull's Head" → "bulls head"; spaced, it would be
 *     "bull s head", which matches nothing a person would type.
 *   • EVERY OTHER MARK BECOMES A SPACE, not nothing. "Bull-and-Butcher" and "St.Mary's Hall" are
 *     separator cases: deleting the mark would give "bullandbutcher" and "stmarys hall".
 *
 * ⚠️ ACCENTS ARE FOLDED (`Café` → `cafe`) because the two spellings are one place and the scraper's
 * source decides which one arrives. This is the one rule not in the brief's list; it can only merge
 * names a person would call identical, never split one.
 */
export function normalisePlaceName(input: string | null | undefined): string {
  return String(input ?? '')
    .toLowerCase()
    // Accents → base letters. NFD splits "é" into "e" + a combining mark; the mark is then removed.
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    // Apostrophes vanish (straight, curly and backtick — the scraper sees all three).
    .replace(/['‘’`]/g, '')
    // Everything that is not a letter, a digit or whitespace becomes a separator.
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2 · MATCHING AN EVENT TO A PLACE
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** How far a merge chain is followed before it is treated as broken. */
export const MERGE_MAX_DEPTH = 10

/**
 * Follow `merged_into_id` to the place a place really is.
 *
 * 🔴 A CHAIN IS LEGITIMATE. Merge A into B on Monday and B into C on Tuesday, and A's events belong to
 * C — nothing rewrites A's pointer when B moves, so the chain has to be walked.
 *
 * 🔴 AND A CYCLE IS NOT, SO IT IS CAPPED RATHER THAN TRUSTED. The database forbids the one-step case
 * (`truck_places_no_self_merge`) but cannot forbid A→B→A across rows. An uncapped walk there is an
 * infinite loop inside a render or a route — a hung page, not a wrong answer. At the cap this RETURNS
 * THE LAST PLACE IT REACHED rather than throwing or returning null: a slightly wrong place in a list
 * is recoverable, a 500 on the Schedule tab is not.
 * ⚠️ IT ALSO STOPS ON A POINTER IT CANNOT FOLLOW — a target on another truck, or one already deleted —
 * for the same reason: the place in hand is a better answer than nothing.
 */
export function resolvePlaceMerge(place: Place, byId: ReadonlyMap<string, Place>): Place {
  let cur = place
  const seen = new Set<string>([cur.id])
  for (let i = 0; i < MERGE_MAX_DEPTH; i++) {
    const next = cur.merged_into_id
    if (!next) return cur
    const target = byId.get(next)
    if (!target) return cur          // pointer we cannot follow — keep what we have
    if (seen.has(target.id)) return cur   // a cycle, caught before the cap
    seen.add(target.id)
    cur = target
  }
  return cur
}

/** Index by id, for `resolvePlaceMerge`. */
export const placesById = (places: readonly Place[]): Map<string, Place> =>
  new Map(places.map(p => [p.id, p]))

/**
 * Why a merge is refused, or null when it is allowed.
 * 🔴 REFUSED RATHER THAN SILENTLY CORRECTED. "Merge into itself" is what a double-tap looks like, and
 * a merge that quietly did nothing would leave the operator believing two places had become one.
 */
export function mergeRefusal(input: {
  fromId: string
  intoId: string
  places: readonly Place[]
}): string | null {
  const { fromId, intoId, places } = input
  if (!fromId || !intoId) return 'Pick a place to merge into.'
  const byId = placesById(places)
  const from = byId.get(fromId)
  const into = byId.get(intoId)
  if (!from) return 'That place is no longer here.'
  if (!into) return 'The place you picked is no longer here.'
  if (fromId === intoId) return "A place can't be merged into itself."
  /* 🔴 THE TARGET IS RESOLVED FIRST. Merging into a place that is itself merged must land on the FINAL
   * place, or the chain grows a step every time and the depth cap gets closer for no reason. */
  const finalInto = resolvePlaceMerge(into, byId)
  if (finalInto.id === fromId) {
    // Merging B into A when A is already merged into B — the cycle, refused before it is written.
    return "Those two are already merged the other way round."
  }
  return null
}

/** `A merged into B` as the write it becomes: A points at B's FINAL target and leaves the list. */
export function mergePatch(input: {
  fromId: string
  intoId: string
  places: readonly Place[]
}): { placeId: string; merged_into_id: string; is_hidden: true } | null {
  if (mergeRefusal(input)) return null
  const byId = placesById(input.places)
  const into = byId.get(input.intoId)!
  const finalInto = resolvePlaceMerge(into, byId)
  // ⚠️ HIDDEN IN THE SAME WRITE. A merged place that stayed in the list would be a row the operator
  // just told us is the same as another one, sitting next to it.
  return { placeId: input.fromId, merged_into_id: finalInto.id, is_hidden: true }
}

/**
 * Does this event belong to this place?
 *
 * 🔴 THE ANCHOR WINS WHEN BOTH SIDES HAVE ONE. With `event.venue_id` and `place.venue_id` both set, the
 * comparison is the ids and the name is not consulted at all — including when the ids DISAGREE, which
 * is a deliberate `false`. Two venue rows that happen to share a name are two places; letting the name
 * override the anchor would merge them, and merging is the direction that loses information.
 * ⚠️ When either side lacks an anchor, the normalised name is the only identity available, so that is
 * what is compared. An event with no readable name matches nothing — `''` is not a key.
 */
export function eventMatchesPlace(event: PlaceEvent, place: Place): boolean {
  // 🔴 THE OPERATOR'S OWN ANSWER FIRST, AND IT IS FINAL. If they picked this place in Add event, no
  // name and no anchor gets to disagree — including when they then edited the venue name for that one
  // date, which the form explicitly allows.
  if (event.truck_place_id) return event.truck_place_id === place.id
  if (event.venue_id && place.venue_id) return event.venue_id === place.venue_id
  const key = normalisePlaceName(event.venue_name)
  if (!key) return false
  return key === place.name_key
}

/**
 * The place an event belongs to, or null.
 *
 * 🔴 TWO PASSES, ANCHOR FIRST, and the order is the whole point. A truck can have an anchored place and
 * an unanchored place whose names normalise the same way (one seeded from an anchored event, one typed
 * by hand). Scanning in list order would hand the event to whichever happened to be first; scanning
 * anchors first gives it to the place that can prove it.
 */
export function placeForEvent(event: PlaceEvent, places: readonly Place[]): Place | null {
  const byId = placesById(places)
  /* 🔴 THREE PASSES, STRONGEST IDENTITY FIRST, AND THE ORDER IS THE WHOLE RULE:
   *   1. `truck_place_id` — the operator picked it. Nothing outranks that.
   *   2. the `venues` anchor — the scraper resolved it to a shared venue row.
   *   3. the normalised name — all that is left for most events, and all stage 1 had.
   * Scanning the list once in array order would hand an event to whichever row happened to come
   * first, which is a different answer on a different day for the same data. */
  if (event.truck_place_id) {
    const picked = byId.get(event.truck_place_id)
    // ⚠️ A LINK TO A PLACE THAT IS NO LONGER IN THE LIST FALLS THROUGH rather than returning null.
    // The event still happened somewhere, and the name still says where.
    if (picked) return resolvePlaceMerge(picked, byId)
  }
  if (event.venue_id) {
    const anchored = places.find(p => p.venue_id === event.venue_id)
    if (anchored) return resolvePlaceMerge(anchored, byId)
  }
  const key = normalisePlaceName(event.venue_name)
  if (!key) return null
  const named = places.find(p => p.name_key === key)
  // 🔴 AND THE MERGE IS FOLLOWED LAST, NOT FIRST. A merged place keeps its `name_key`, so this is how
  // the old name's events reach the place the operator merged it into — which is the point of merging.
  return named ? resolvePlaceMerge(named, byId) : null
}

/** placeId → its events, in the order given. Events that match no place are returned separately. */
export function groupEventsByPlace(
  events: readonly PlaceEvent[],
  places: readonly Place[],
): { byPlace: Map<string, PlaceEvent[]>; unmatched: PlaceEvent[] } {
  const byPlace = new Map<string, PlaceEvent[]>()
  const unmatched: PlaceEvent[] = []
  for (const e of events) {
    const p = placeForEvent(e, places)
    if (!p) { unmatched.push(e); continue }
    byPlace.set(p.id, [...(byPlace.get(p.id) ?? []), e])
  }
  return { byPlace, unmatched }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 3 · "NEXT" — THE MUTED LINE IN THE LIST
// ════════════════════════════════════════════════════════════════════════════════════════════════

/* ── 🔴 TWO STATUS RULES, NOT ONE. THIS WAS BUG 3 AND IT HID ALMOST EVERY PLACE'S HISTORY ─────────
 * There used to be a single `isTradingStatus` excluding BOTH 'cancelled' and 'closed', and both
 * `lastEventAt` and `nextEventAt` used it. 🔴 `closed` IS THE NORMAL END STATE OF AN EVENT THAT
 * TRADED — the operator closes it at the end of service — so excluding it from "Last" excluded
 * essentially every past event, and a place seeded from a real event read "No events yet".
 *
 * "Did it happen" and "is it still to come" are DIFFERENT QUESTIONS and need different answers:
 *   • LAST / the count  → anything not 'cancelled'. A closed event is the clearest possible evidence
 *     that the truck traded there.
 *   • NEXT              → not 'cancelled' AND not 'closed'. Offering a closed date as the next one
 *     would send the operator to post about a pitch that is already over.
 * ⚠️ `unconfirmed` COUNTS FOR BOTH. It means "not reviewed yet", not "not happening" — the normal
 * state of a scraped date, which is most of them.
 */

/** Never counts as anything: the operator said it is off. */
export const CANCELLED_STATUSES = ['cancelled'] as const
/** Cannot be a FUTURE date, on top of the above: it is already over. */
export const NOT_UPCOMING_STATUSES = ['cancelled', 'closed'] as const

const statusOf = (status: string | null | undefined): string => String(status ?? '').trim().toLowerCase()

/** Did the truck trade here? Used by "Last" and by the count. */
export function countsAsTraded(status: string | null | undefined): boolean {
  return !(CANCELLED_STATUSES as readonly string[]).includes(statusOf(status))
}

/** Could this still be the next visit? Used by "Next" only. */
export function countsAsUpcoming(status: string | null | undefined): boolean {
  return !(NOT_UPCOMING_STATUSES as readonly string[]).includes(statusOf(status))
}

/**
 * ⚠️ KEPT AS AN ALIAS OF THE UPCOMING RULE, because that is what every existing caller meant by it.
 * @deprecated Name the question: `countsAsTraded` or `countsAsUpcoming`.
 */
export function isTradingStatus(status: string | null | undefined): boolean {
  return countsAsUpcoming(status)
}

/**
 * The soonest upcoming trading event, or null.
 * ⚠️ TODAY COUNTS AS UPCOMING. The label reads "next: Tue 13 Oct", and today's pitch is the next one —
 * excluding it would show the operator next week while they are standing at this week's event.
 * ⚠️ STRING COMPARISON, NOT `Date`. `event_date` is a date column serialised as 'YYYY-MM-DD', which
 * sorts correctly as text and carries no timezone to shift it across a day boundary. Parsing it into a
 * `Date` is how a date-only value becomes yesterday for anyone west of London.
 */
export function nextEventAt(events: readonly PlaceEvent[], todayYmd: string): PlaceEvent | null {
  const upcoming = events
    // 🔴 `countsAsUpcoming` — a closed date is over, so it is never "next".
    .filter(e => countsAsUpcoming(e.status))
    .filter(e => typeof e.event_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.event_date) && e.event_date >= todayYmd)
    .sort((a, b) => String(a.event_date).localeCompare(String(b.event_date)))
  return upcoming[0] ?? null
}

/**
 * The most recent PAST trading event, or null — the "Last: Tue 22 Sep" line.
 * ⚠️ STRICTLY BEFORE TODAY, so a place with an event today reads as "Next", never both. The two
 * functions partition the same list on the same boundary, which is why neither can disagree.
 * ⚠️ SAME STATUS RULE AS "NEXT": a cancelled or closed date is not a time the truck traded there.
 */
export function lastEventAt(events: readonly PlaceEvent[], todayYmd: string): PlaceEvent | null {
  const past = events
    // 🔴 `countsAsTraded` — a CLOSED event is the clearest evidence the truck traded here. This line
    // read `isTradingStatus` and that was bug 3: it hid almost every place's history.
    .filter(e => countsAsTraded(e.status))
    .filter(e => typeof e.event_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.event_date) && e.event_date < todayYmd)
    .sort((a, b) => String(b.event_date).localeCompare(String(a.event_date)))
  return past[0] ?? null
}

/**
 * How many times the truck has traded here in the last 365 days — the "· 7 times in the last year"
 * clause. ⚠️ IT COUNTS PAST AND TODAY, NOT THE FUTURE: "times in the last year" is a statement about
 * what has happened, and including booked dates would make it a forecast under a past-tense label.
 */
export function tradedCountInLastYear(events: readonly PlaceEvent[], todayYmd: string): number {
  const from = ymdMinusDays(todayYmd, 365)
  return events.filter(e =>
    // 🔴 `countsAsTraded`, for the same reason as "Last": closed visits are the ones that happened.
    countsAsTraded(e.status)
    && typeof e.event_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.event_date)
    && e.event_date >= from && e.event_date <= todayYmd).length
}

/** 'YYYY-MM-DD' minus n days, in UTC. ⚠️ Date-only arithmetic never goes through a local timezone. */
export function ymdMinusDays(ymd: string, days: number): string {
  const [y, m, d] = String(ymd).split('-').map(Number)
  const t = Date.UTC(y, (m || 1) - 1, d || 1) - days * 86_400_000
  return new Date(t).toISOString().slice(0, 10)
}

/**
 * The list order the mockup asks for: favourites first, then the rest, each alphabetical by name.
 * 🔴 MERGED AND HIDDEN PLACES ARE NOT IN THE LIST. A merged place is the same pitch as its target, so
 * showing both is showing one thing twice; `showHidden` brings hidden ones back so a hide can be
 * undone, which is the only reason that toggle exists.
 */
export function visiblePlaces(places: readonly Place[], showHidden = false): Place[] {
  return places
    .filter(p => showHidden ? true : (!p.is_hidden && !p.merged_into_id))
    .slice()
    .sort((a, b) => {
      const fa = a.is_favourite ? 0 : 1
      const fb = b.is_favourite ? 0 : 1
      if (fa !== fb) return fa - fb
      return String(a.name ?? '').localeCompare(String(b.name ?? ''), 'en-GB', { sensitivity: 'base' })
    })
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 4 · THE PER-EVENT POST WORDING — REMOVED, AND THE COLUMN IS DORMANT ON PURPOSE
// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 `WORDING_TOKENS`, `DEFAULT_GROUP_POST_WORDING` AND `effectiveGroupPostWording` ARE GONE
// (3 October 2026). Facebook groups were removed from the product, and with them the per-place
// "Wording for group posts" card — the only caller of the resolution chain. The brief offered a rename
// instead; removal is the right half of that choice, because a renamed resolver with no caller is an
// export nothing exercises, and the next person cannot tell whether it is load-bearing.
//
// ⚠️ `trucks.event_post_wording` STILL EXISTS and is deliberately dormant: it is renamed from
// `default_group_post_wording` by 20261004_schedule_places_stage2.sql and keeps whatever it held.
// Nothing in this build reads or writes it. When the per-event post text ships it gets a resolver
// back — with a caller, a test, and a two-level chain (truck → built-in), since the per-place override
// column is dropped.

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 4b · THE ONE MUTED LINE UNDER A PLACE'S NAME
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** A place row as the list and the picker read it — the dates and times already resolved. */
export interface PlaceWhen {
  next_event_date?: string | null
  next_start_time?: string | null
  next_end_time?: string | null
  last_event_date?: string | null
  last_start_time?: string | null
  last_end_time?: string | null
}

/**
 * "17:00–20:00", or '' when the event carries no times.
 * ⚠️ 24-HOUR, AND TRIMMED TO HH:MM, to match the form's own time controls. `start_time` comes back as
 * '17:00:00'; showing the seconds beside a form that does not have them reads as a different value.
 */
export function timeRangeLabel(start: string | null | undefined, end: string | null | undefined): string {
  const t = (v: string | null | undefined) => (v ? String(v).slice(0, 5) : '')
  const a = t(start), b = t(end)
  if (!a && !b) return ''
  return b ? `${a}–${b}` : a
}

/**
 * The muted line: "Last: Tue 6 Oct · 17:00–20:00", or "Next: …", or "No events yet".
 *
 * 🔴 LAST FIRST, NEXT ONLY WHEN THERE IS NO PAST VISIT — and that order is bug 4's other half. It was
 * Next-first, which is wrong for what this line is FOR: in the Add event picker the operator is
 * choosing a place to repeat, and "when was I last here, and at what times" is the question. A future
 * date tells them nothing about the times they are about to copy.
 *
 * 🔴 AND IT CARRIES THE TIMES. It did not — `Last: Tue 22 Sep` and nothing else — which is bug 4 as
 * reported. The times are the whole reason the line is worth reading: they are what picking the place
 * will put in the form.
 *
 * ⚠️ "No events yet" ONLY WHEN THERE IS GENUINELY NEITHER. With bug 3 unfixed almost every place said
 * this, which is what made the line look broken rather than empty.
 */
export function placeWhenLine(p: PlaceWhen, fmtDay: (ymd: string | null) => string): string {
  if (p.last_event_date) {
    const t = timeRangeLabel(p.last_start_time, p.last_end_time)
    return `Last: ${fmtDay(p.last_event_date)}${t ? ` · ${t}` : ''}`
  }
  if (p.next_event_date) {
    const t = timeRangeLabel(p.next_start_time, p.next_end_time)
    return `Next: ${fmtDay(p.next_event_date)}${t ? ` · ${t}` : ''}`
  }
  return 'No events yet'
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 5 · WHAT PICKING A PLACE FILLS INTO THE ADD-EVENT FORM
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** The form fields the picker may fill. Everything else on the form is untouched. */
export interface PlaceFillTarget {
  venue_name: string
  address: string
  town: string
  postcode: string
  start_time: string
  end_time: string
}

/** A place as the picker reads it — the row plus the times of its last event. */
export interface PlaceForFill {
  name?: string | null
  address?: string | null
  area?: string | null
  postcode?: string | null
  last_start_time?: string | null
  last_end_time?: string | null
}

/**
 * What the form becomes when a place is picked.
 *
 * 🔴 A RULE, NOT A COMPONENT, so it can be tested. The times come from the LAST event at that place,
 * which is what the operator is almost always repeating — it is what "copy a recent event" was really
 * for, without a date attached that they then had to clear.
 *
 * 🔴 `event_date` IS NOT IN `PlaceFillTarget` AND NEVER WILL BE. It is the one thing that differs every
 * time, and pre-filling it from a past event is how tonight's pitch gets added to a date in September.
 *
 * ⚠️ A BLANK FIELD ON THE PLACE KEEPS WHAT IS ALREADY TYPED. An operator who has typed a postcode and
 * then picks a place that has none must not lose it — the same rule the venue-suggestions dropdown
 * already follows. `firstNonBlank` semantics, one field at a time.
 *
 * ⚠️ EVERY FIELD STAYS EDITABLE AFTERWARDS. This returns a new form state and nothing else; no caller
 * writes back to the place, which is what makes "change anything for this date only" literally true.
 */
export function fillFromPlace(place: PlaceForFill, current: PlaceFillTarget): PlaceFillTarget {
  const keep = (from: string | null | undefined, now: string): string => {
    const v = String(from ?? '').trim()
    return v || now
  }
  const hhmm = (from: string | null | undefined, now: string): string => {
    const v = String(from ?? '').trim()
    return v ? v.slice(0, 5) : now
  }
  return {
    venue_name: keep(place.name, current.venue_name),
    address: keep(place.address, current.address),
    // ⚠️ `area` ON THE PLACE IS `town` ON THE EVENT. Same fact, the name each table uses.
    town: keep(place.area, current.town),
    postcode: keep(place.postcode, current.postcode),
    start_time: hhmm(place.last_start_time, current.start_time),
    end_time: hhmm(place.last_end_time, current.end_time),
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 5 · THE SEED PLAN
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** How far back the seeder looks. The brief's window: the last 12 months, plus every future date. */
export const SEED_LOOKBACK_MONTHS = 12

/** The earliest `event_date` the seeder considers, as 'YYYY-MM-DD'. */
export function seedWindowStart(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  d.setUTCMonth(d.getUTCMonth() - SEED_LOOKBACK_MONTHS)
  return d.toISOString().slice(0, 10)
}

export interface PlaceInsert {
  venue_id: string | null
  name_key: string
  name: string
  address: string | null
  postcode: string | null
  area: string | null
}

export interface SeedPlan {
  /** New places to create. Applied with `on conflict (truck_id, name_key) do nothing`. */
  inserts: PlaceInsert[]
  /**
   * An existing UNANCHORED place that an anchored event now identifies — set its `venue_id`.
   * 🔴 THIS IS WHY A MANUAL PLACE IS NOT DUPLICATED. The operator types "Lavenham Village Hall" by
   * hand; a scraped event later arrives anchored to that venue with the same name. Without this the
   * insert would collide on `name_key` and the anchor would be lost for ever.
   */
  adopts: { placeId: string; venue_id: string }[]
  /**
   * Fill a BLANK address/postcode on an existing place from an event.
   * ⚠️ BLANK ONLY, AND THAT IS THE WHOLE "never overwrite an operator edit" RULE for these two fields.
   * `name` and `short_name` are not in this list at all: the seeder writes them once, on insert, and
   * never again — which makes an operator's edit survive structurally rather than by comparing it
   * against what the event says.
   */
  fills: { placeId: string; address?: string; postcode?: string; area?: string }[]
  /**
   * Two different anchors wanting one `name_key`. Kept for the report and the log; nothing is written.
   * 🔴 REPORTED RATHER THAN RESOLVED. Guessing would either merge two real places or invent a
   * distinguishing suffix the operator never chose. One place appears, the collision is logged, and the
   * operator can add the second by hand with a name that tells them apart.
   */
  collisions: { name_key: string; venue_id: string; keptPlaceId: string | null }[]
}

const firstNonBlank = (...vals: (string | null | undefined)[]): string | null => {
  for (const v of vals) { const s = String(v ?? '').trim(); if (s) return s }
  return null
}

/**
 * What the seeder should do, given this truck's events and the places it already has.
 *
 * 🔴 A PLAN, NOT A WRITE, and that split is what makes this testable. The route applies it with
 * conflict-tolerant statements; everything decided is decided here, where a harness can read it.
 *
 * ⚠️ IDEMPOTENT BY CONSTRUCTION: run it against the places its own last run produced and every list
 * comes back empty. The harness asserts exactly that, because "no duplicates on refresh" is the
 * requirement and a second run is how you find out.
 */
export function planPlaceSeed(input: {
  events: readonly PlaceEvent[]
  places: readonly Place[]
  now?: Date
}): SeedPlan {
  const plan: SeedPlan = { inserts: [], adopts: [], fills: [], collisions: [] }
  const windowStart = seedWindowStart(input.now ?? new Date())

  // ── WHICH EVENTS COUNT ───────────────────────────────────────────────────────────────────────
  // ⚠️ THE WINDOW IS APPLIED HERE AS WELL AS IN SQL. The route filters by date so it does not read a
  // truck's whole history; this filters again so the plan is the same whatever the caller passed —
  // a harness, a later stage, or a route whose `.gte` was dropped in an edit.
  // ⚠️ CANCELLED AND CLOSED EVENTS STILL CREATE A PLACE. A pitch that was cancelled once is still a
  // pitch the truck trades at, and the operator still wants it in the list and in the Add event
  // picker. Status decides the "Next" and "Last" lines, not whether the place exists.
  const events = input.events.filter(e =>
    typeof e.event_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.event_date) && e.event_date >= windowStart)

  // ── DISTINCT PLACES IN THE SCHEDULE ──────────────────────────────────────────────────────────
  // 🔴 ANCHORED GROUPS FIRST, THEN NAME-ONLY GROUPS, because an anchored group claims the `name_key`
  // that a name-only group would otherwise take. Processing them together in event order would make
  // the outcome depend on which event the scraper happened to write first.
  interface Group { venue_id: string | null; name_key: string; events: PlaceEvent[] }
  const anchored = new Map<string, Group>()
  const named = new Map<string, Group>()
  for (const e of events) {
    const key = normalisePlaceName(e.venue_name)
    if (e.venue_id) {
      const g = anchored.get(e.venue_id) ?? { venue_id: e.venue_id, name_key: key, events: [] }
      // ⚠️ A GROUP'S KEY IS THE FIRST NON-BLANK NAME ITS EVENTS CARRY. One venue can appear with a
      // blank name on some rows; taking the blank one would produce a place with no key at all.
      if (!g.name_key && key) g.name_key = key
      g.events.push(e)
      anchored.set(e.venue_id, g)
      continue
    }
    if (!key) continue   // nothing to identify it by; a place with no key cannot be matched later
    const g = named.get(key) ?? { venue_id: null, name_key: key, events: [] }
    g.events.push(e)
    named.set(key, g)
  }

  /* ── WHAT ALREADY EXISTS ──────────────────────────────────────────────────────────────────────
   * 🔴 HIDDEN AND MERGED PLACES ARE IN THESE MAPS, AND THAT IS THE POINT. They still hold their
   * `name_key` and their `venue_id`, so the seeder FINDS them and therefore does not create a second
   * place with the same key. A seeder that filtered them out would re-create, on the next refresh,
   * exactly the place the operator just hid or merged away — and would do it every refresh for ever.
   * ⚠️ NOTHING BELOW EVER WRITES `is_hidden` OR `merged_into_id`. The only outcome for a hidden or
   * merged match is "leave it alone" (or fill a blank address), never "un-hide" and never "un-merge":
   * those are decisions a person made, and new events arriving is not new information about them. */
  const byVenue = new Map<string, Place>()
  const byKey = new Map<string, Place>()
  for (const p of input.places) {
    if (p.venue_id) byVenue.set(p.venue_id, p)
    byKey.set(p.name_key, p)
  }
  /** Keys this plan has already claimed — an insert earlier in this same run counts. */
  const claimed = new Set<string>(input.places.map(p => p.name_key))
  /** Hidden or merged ⇒ matched, left exactly as it is. Not filled, not adopted, not re-created. */
  const isRetired = (p: Place): boolean => p.is_hidden === true || !!p.merged_into_id

  const fillFrom = (place: Place, g: Group) => {
    const patch: { placeId: string; address?: string; postcode?: string; area?: string } = { placeId: place.id }
    let any = false
    if (!String(place.address ?? '').trim()) {
      const a = firstNonBlank(...g.events.map(e => e.venue_address), ...g.events.map(e => e.address))
      if (a) { patch.address = a; any = true }
    }
    if (!String(place.postcode ?? '').trim()) {
      const pc = firstNonBlank(...g.events.map(e => e.postcode))
      if (pc) { patch.postcode = pc; any = true }
    }
    // ⚠️ `area` IS THE EVENT'S `town`. Same fact, the name each table uses for it.
    if (!String(place.area ?? '').trim()) {
      const ar = firstNonBlank(...g.events.map(e => e.town))
      if (ar) { patch.area = ar; any = true }
    }
    if (any) plan.fills.push(patch)
  }

  const seedOf = (g: Group): PlaceInsert => ({
    venue_id: g.venue_id,
    name_key: g.name_key,
    area: firstNonBlank(...g.events.map(e => e.town)),
    // ⚠️ THE RAW `venue_name`, NOT the key. `name_key` is for matching; `name` is what goes on a post,
    // so it keeps the capitals and the ampersand a person wrote.
    name: firstNonBlank(...g.events.map(e => e.venue_name)) ?? g.name_key,
    address: firstNonBlank(...g.events.map(e => e.venue_address), ...g.events.map(e => e.address)),
    postcode: firstNonBlank(...g.events.map(e => e.postcode)),
  })

  for (const g of anchored.values()) {
    if (!g.name_key) continue
    const existing = byVenue.get(g.venue_id!)
    // ⚠️ A RETIRED MATCH IS A MATCH. Nothing is written to it — not even a blank fill, because the
    // operator has taken it out of the list and a write would be work on a row nobody is looking at.
    if (existing) { if (!isRetired(existing)) fillFrom(existing, g); continue }

    // Not anchored to a place yet. Is there an unanchored place under this name to adopt?
    const sameKey = byKey.get(g.name_key)
    if (sameKey && isRetired(sameKey)) {
      /* 🔴 NEVER ADOPT, NEVER RE-CREATE OVER A RETIRED ROW. The key is taken by a place the operator
       * hid or merged; inserting would collide on `unique (truck_id, name_key)` anyway, and adopting
       * would quietly attach a venue anchor to a row they removed from view. Recorded as a collision
       * so it is visible rather than silent. */
      plan.collisions.push({ name_key: g.name_key, venue_id: g.venue_id!, keptPlaceId: sameKey.id })
      continue
    }
    if (sameKey && !sameKey.venue_id) {
      plan.adopts.push({ placeId: sameKey.id, venue_id: g.venue_id! })
      fillFrom(sameKey, g)
      continue
    }
    if (sameKey && sameKey.venue_id && sameKey.venue_id !== g.venue_id) {
      plan.collisions.push({ name_key: g.name_key, venue_id: g.venue_id!, keptPlaceId: sameKey.id })
      continue
    }
    if (claimed.has(g.name_key)) {
      plan.collisions.push({ name_key: g.name_key, venue_id: g.venue_id!, keptPlaceId: sameKey?.id ?? null })
      continue
    }
    plan.inserts.push(seedOf(g))
    claimed.add(g.name_key)
  }

  for (const g of named.values()) {
    const existing = byKey.get(g.name_key)
    // ⚠️ Same rule as above: a hidden or merged place under this name is found, and left alone.
    if (existing) { if (!isRetired(existing)) fillFrom(existing, g); continue }
    // ⚠️ AN ANCHORED INSERT EARLIER IN THIS RUN ALREADY COVERS THIS NAME. The same pitch appearing
    // once with a venue_id and once without is one place, and this is where the two are merged.
    if (claimed.has(g.name_key)) continue
    plan.inserts.push(seedOf(g))
    claimed.add(g.name_key)
  }

  return plan
}
