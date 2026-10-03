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
  group_post_wording?: string | null
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
  if (event.venue_id) {
    const anchored = places.find(p => p.venue_id === event.venue_id)
    if (anchored) return anchored
  }
  return places.find(p => eventMatchesPlace(event, p)) ?? null
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

/**
 * 🔴 A CANCELLED OR CLOSED DATE IS NOT A NEXT DATE. Both are explicit statements that the truck is not
 * trading, and offering one as "next" would send the operator to post about a pitch that is off.
 * ⚠️ `unconfirmed` IS INCLUDED. It means "not yet confirmed", not "not happening" — it is the normal
 * state of a scraped date the operator has not reviewed, which is most of them.
 */
export const NON_TRADING_STATUSES = ['cancelled', 'closed'] as const

export function isTradingStatus(status: string | null | undefined): boolean {
  const s = String(status ?? '').trim().toLowerCase()
  return !(NON_TRADING_STATUSES as readonly string[]).includes(s)
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
    .filter(e => isTradingStatus(e.status))
    .filter(e => typeof e.event_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.event_date) && e.event_date >= todayYmd)
    .sort((a, b) => String(a.event_date).localeCompare(String(b.event_date)))
  return upcoming[0] ?? null
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 4 · THE WORDING CHAIN
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** The tokens the wording may carry. Stage 2/3 substitute them; stage 1 only shows them. */
export const WORDING_TOKENS = ['{place}', '{day}', '{date}', '{times}', '{order link}'] as const

/**
 * The built-in wording — the last resort, used when neither the place nor the truck has one.
 * 🔴 IT IS A FALLBACK, NOT THE STORED DEFAULT. The truck's own default lives in
 * `trucks.default_group_post_wording`; this exists so a truck that has never set one still produces a
 * sensible post rather than an empty box in stage 3.
 */
export const DEFAULT_GROUP_POST_WORDING =
  'We\'re at {place} on {day} {date}, {times}. Pre-order here: {order link}'

/**
 * Place override → truck default → built-in.
 * 🔴 ONE FUNCTION FOR THE WHOLE CHAIN, so "blank means the truck default" is true on every surface that
 * asks. Blank means WHITESPACE-OR-EMPTY, not just null: an operator who selects the text and deletes it
 * leaves `''`, and that is the same intention as never having typed anything.
 */
export function effectiveGroupPostWording(
  place: { group_post_wording?: string | null } | null | undefined,
  truck: { default_group_post_wording?: string | null } | null | undefined,
): string {
  const atPlace = String(place?.group_post_wording ?? '').trim()
  if (atPlace) return atPlace
  const atTruck = String(truck?.default_group_post_wording ?? '').trim()
  if (atTruck) return atTruck
  return DEFAULT_GROUP_POST_WORDING
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
  fills: { placeId: string; address?: string; postcode?: string }[]
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
  // pitch the truck trades at, and its Facebook groups are still the right ones. Status decides the
  // "next" line, not whether the place exists.
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

  // ── WHAT ALREADY EXISTS ──────────────────────────────────────────────────────────────────────
  const byVenue = new Map<string, Place>()
  const byKey = new Map<string, Place>()
  for (const p of input.places) {
    if (p.venue_id) byVenue.set(p.venue_id, p)
    byKey.set(p.name_key, p)
  }
  /** Keys this plan has already claimed — an insert earlier in this same run counts. */
  const claimed = new Set<string>(input.places.map(p => p.name_key))

  const fillFrom = (place: Place, g: Group) => {
    const patch: { placeId: string; address?: string; postcode?: string } = { placeId: place.id }
    let any = false
    if (!String(place.address ?? '').trim()) {
      const a = firstNonBlank(...g.events.map(e => e.venue_address), ...g.events.map(e => e.address))
      if (a) { patch.address = a; any = true }
    }
    if (!String(place.postcode ?? '').trim()) {
      const pc = firstNonBlank(...g.events.map(e => e.postcode))
      if (pc) { patch.postcode = pc; any = true }
    }
    if (any) plan.fills.push(patch)
  }

  const seedOf = (g: Group): PlaceInsert => ({
    venue_id: g.venue_id,
    name_key: g.name_key,
    // ⚠️ THE RAW `venue_name`, NOT the key. `name_key` is for matching; `name` is what goes on a post,
    // so it keeps the capitals and the ampersand a person wrote.
    name: firstNonBlank(...g.events.map(e => e.venue_name)) ?? g.name_key,
    address: firstNonBlank(...g.events.map(e => e.venue_address), ...g.events.map(e => e.address)),
    postcode: firstNonBlank(...g.events.map(e => e.postcode)),
  })

  for (const g of anchored.values()) {
    if (!g.name_key) continue
    const existing = byVenue.get(g.venue_id!)
    if (existing) { fillFrom(existing, g); continue }

    // Not anchored to a place yet. Is there an unanchored place under this name to adopt?
    const sameKey = byKey.get(g.name_key)
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
    if (existing) { fillFrom(existing, g); continue }
    // ⚠️ AN ANCHORED INSERT EARLIER IN THIS RUN ALREADY COVERS THIS NAME. The same pitch appearing
    // once with a venue_id and once without is one place, and this is where the two are merged.
    if (claimed.has(g.name_key)) continue
    plan.inserts.push(seedOf(g))
    claimed.add(g.name_key)
  }

  return plan
}
