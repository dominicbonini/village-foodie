// lib/private-events/resolve.ts — link ordering, resolved. PURE.
//
// Same rule and the same reasoning as lib/event-types/resolve.ts §70.3:
//
//     effective = the event's own hand change  ??  the Private type's value
//
// ⚠️ TWO LEVELS, NOT THREE, AND THE BOTTOM IS NOT A VAN DEFAULT. Link ordering is a property of being
// private; a van has no opinion about it and neither does the truck. So the chain stops at the type,
// and when there is no Private type row yet the answer is the migration's default (true) — which is
// decision 1's "switch, default ON".
//
// ⚠️ `??` AND NEVER `||`. `false` is the real instruction "no link for THIS event" and `||` would read
// it as unset and silently re-grant the link. Same trap, same rule, as every other resolver here.

/** The Private type's one extra column, for callers that hold the row. */
export type PrivateTypeFor = { private_link_ordering: boolean | null }

/** The event's one extra column. */
export type PrivateEventFor = { private_link_ordering_override: boolean | null }

/**
 * The migration's default, named once so this file and the SQL cannot drift.
 * 🔴 TRUE because a truck that marks an event private should get a working link without a second
 * decision. The row is created lazily, so "no Private type yet" and "the Private type says yes" must
 * give the same answer — otherwise the first private event of a truck's life would behave differently
 * from its second.
 */
export const LINK_ORDERING_DEFAULT = true

/**
 * Does this private event take orders by its private link?
 *
 * ⛔ THIS DOES NOT ASK WHETHER THE EVENT IS PRIVATE. A public event has no link at all, and calling
 * this for one is a caller error — `is_private` is checked first, by the caller, because that is the
 * column every public surface already has in hand. Keeping the two questions apart is what stops
 * "has a link" being mistaken for "is hidden": an event with link ordering OFF is still private, and
 * still shows on the schedule as "Private event" with no Order button.
 */
export function resolveLinkOrdering(
  event: PrivateEventFor | null | undefined,
  type: PrivateTypeFor | null | undefined,
): boolean {
  return event?.private_link_ordering_override ?? type?.private_link_ordering ?? LINK_ORDERING_DEFAULT
}

/**
 * What the public schedule calls this event.
 *
 * 🔴 ONE FUNCTION, SO THE SUBSTITUTION CANNOT BE SPELT TWO WAYS ACROSS SIX SURFACES. Every public feed
 * calls this instead of writing the string, which is what makes "the public name of a private event"
 * one decision rather than six.
 * ⛔ IT TAKES NO NAME ARGUMENT, ON PURPOSE. `private_name` must never reach a public surface, so the
 * function that produces the public label is not given the opportunity to leak it.
 */
export const PRIVATE_PUBLIC_LABEL = 'Private event'

export function publicVenueName(isPrivate: boolean, venueName: string | null | undefined): string {
  return isPrivate ? PRIVATE_PUBLIC_LABEL : (venueName || '')
}

/**
 * The operator-facing name: the event's own name, or the generic label.
 * ⚠️ OPERATOR AND GUEST SURFACES ONLY — the Events list, the dashboard card, the private order page.
 * Never a public feed; that is `publicVenueName`.
 */
export function privateDisplayName(privateName: string | null | undefined): string {
  const n = (privateName || '').trim()
  return n || PRIVATE_PUBLIC_LABEL
}

/**
 * ⛔ THE REDACTION, IN ONE PLACE, AS A WHITELIST OF WHAT SURVIVES — NOT A BLACKLIST OF WHAT GOES.
 *
 * 🔴 THIS IS THE MOST IMPORTANT TEN LINES IN THE FEATURE. The brief lists what a private event may
 * never publish: venue, address, town, postcode, coordinates. A function that DELETED those five
 * would be correct today and wrong the first time someone adds a sixth location-ish field to
 * `truck_events` — the new column would publish by default, silently, and nothing would fail.
 *
 * So this returns a NEW object built from the fields that are allowed out, and anything it does not
 * know about is simply absent. A field added to the table is invisible here until somebody adds it
 * here, which is the correct default for a privacy rule.
 *
 * ⚠️ `notes` IS REDACTED TOO, AND THE BRIEF DOES NOT LIST IT. Decision 4 says "date and times only",
 * and an operator's note on a private event ("ring the bell at the side gate, ask for Sarah") is
 * exactly the kind of thing that must not be published. The brief's list is of location fields; this
 * is the same rule applied to the field that most often CONTAINS a location in prose.
 */
export interface PublicEventShape {
  id: string
  event_date: string
  start_time: string | null
  end_time: string | null
  status?: string | null
  [k: string]: unknown
}

export function redactPrivate<T extends PublicEventShape>(e: T): T {
  return {
    ...e,
    venue_name: PRIVATE_PUBLIC_LABEL,
    town: null,
    postcode: null,
    address: null,
    latitude: null,
    longitude: null,
    venue_id: null,
    truck_place_id: null,
    notes: '',
    /* ⛔ AND THE NAME IS NOT PASSED THROUGH. Explicitly nulled rather than merely "not added", because
     * the spread above carries the whole row and `private_name` is ON that row. */
    private_name: null,
    private_token: null,
  }
}
