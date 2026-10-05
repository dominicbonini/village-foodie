// lib/private-events/read.ts — reading privacy, and resolving a private link.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 EVERY READ HERE IS CAPABILITY-PROBED, AND EVERY ONE FAILS **CLOSED**
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// The columns this reads are added by 20261014_private_events.sql. Postgres answers 42703/42P01 and
// PostgREST answers PGRST204/PGRST205 for something it cannot see, and a NAMED select that hits one
// FAILS THE WHOLE STATEMENT. So these reads are SEPARATE from the selects the public surfaces already
// run — the same two-reads-one-blast-radius shape as lib/event-pricing/read.ts.
//
// ⛔ BUT THE FAILURE DIRECTION IS THE OPPOSITE ONE, AND THE DIFFERENCE IS THE WHOLE POINT.
// Event pricing fails OPEN (charge the menu price) because open equals today's behaviour and the
// worst case is a price that did not move. Privacy has no such luck: "I could not read `is_private`"
// must mean "treat it as private", because the alternative is publishing a wedding's address.
//
// 🔴 SO A CODE-BEFORE-MIGRATION DEPLOY IS NOT A NO-OP HERE. Until 20261014 is applied, every probe
// fails, every event is treated as private, and the public feeds show "Private event" with no venue —
// or nothing at all on the map. That is the SAFE direction and it is still a visible regression, so:
// ⚠️ RUN THE MIGRATION BEFORE DEPLOYING THIS. The report says so; this comment says so; and
// `scripts/private-events.cjs` asserts the direction so nobody "fixes" it to fail open.

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveLinkOrdering, PRIVATE_PUBLIC_LABEL } from './resolve'
import { looksLikeToken } from './token'

/** The codes that mean "the migration has not been applied". Anything else is a real failure. */
const NOT_THERE = new Set(['42703', '42P01', 'PGRST204', 'PGRST205'])

const why = (code: string | undefined): string =>
  code && NOT_THERE.has(code)
    ? `the private-event columns are absent (${code}) — migration 20261014 has not been applied`
    : `read failed (${code ?? 'no code'})`

/** One warning line per process per reason, so a missing migration is not a log flood. */
const warned = new Set<string>()
const warnOnce = (where: string, code: string | undefined) => {
  const key = `${where}:${code ?? '-'}`
  if (warned.has(key)) return
  warned.add(key)
  console.warn(`[private-events] ${where}: ${why(code)} — FAILING CLOSED (every event treated as private)`)
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1 · WHICH OF THESE EVENTS ARE PRIVATE
// ════════════════════════════════════════════════════════════════════════════════════════════════

export interface PrivacyRead {
  /** false when the probe failed. `isPrivate` then answers true for EVERYTHING. */
  ok: boolean
  /** The ids that are private. Empty and `ok` means "none of them are". */
  ids: ReadonlySet<string>
  /** The one predicate every public surface calls. ⛔ Fails closed: `!ok` ⇒ always true. */
  isPrivate: (id: string) => boolean
}

/** Nothing to ask about: a successful read of an empty set. */
const NONE: PrivacyRead = { ok: true, ids: new Set(), isPrivate: () => false }

/** The state a failed probe produces: everything is private. */
const ALL: PrivacyRead = { ok: false, ids: new Set(), isPrivate: () => true }

/**
 * 🔴 THE ONE FUNCTION EVERY PUBLIC SURFACE USES.
 *
 * Give it the event ids a feed is about to publish; it tells you which to drop or redact.
 *
 * ⚠️ IT ASKS ONLY FOR THE PRIVATE ONES (`.eq('is_private', true)`), SO THE ANSWER IS USUALLY EMPTY.
 * Today no event is private, so this is one indexed read returning zero rows — which is what makes
 * "every public feed is byte-identical for a truck with no private events" true by construction
 * rather than by a claim: an empty set removes nothing and redacts nothing.
 *
 * ⚠️ AND IT IS A SEPARATE READ RATHER THAN A COLUMN ON THE CALLER'S SELECT, for the blast-radius
 * reason in the header: adding `is_private` to the discovery feed's select would make a missing
 * migration break the WHOLE feed, including every public truck's events, rather than this one probe.
 */
export async function readPrivateEventIds(
  supabase: SupabaseClient,
  ids: readonly string[],
  where = 'readPrivateEventIds',
): Promise<PrivacyRead> {
  const unique = Array.from(new Set(ids.filter(Boolean)))
  if (unique.length === 0) return NONE

  const { data, error } = await supabase
    .from('truck_events')
    .select('id')
    .in('id', unique)
    .eq('is_private', true)

  if (error) {
    warnOnce(where, error.code)
    return ALL
  }

  const set = new Set((data || []).map((r: { id: string }) => r.id))
  if (set.size === 0) return NONE
  return { ok: true, ids: set, isPrivate: (id: string) => set.has(id) }
}

/**
 * The same question for one event, for the surfaces that have exactly one in hand (the menu API's
 * auto-detect, the submit route's gate).
 * ⛔ FAILS CLOSED: a read failure answers `true`.
 */
export async function isEventPrivate(
  supabase: SupabaseClient,
  eventId: string | null | undefined,
  where = 'isEventPrivate',
): Promise<boolean> {
  if (!eventId) return false
  const r = await readPrivateEventIds(supabase, [eventId], where)
  return r.isPrivate(eventId)
}

/**
 * 🔴 REDACT A LIST OF ROWS IN ONE CALL — for the surfaces that hand their rows to something else.
 *
 * The WhatsApp auto-reply grounds a language model on the truck's upcoming events; the model is then
 * asked to answer "where are you this week?" in prose. A private event's venue reaching that prompt
 * would be published in a sentence nobody wrote and nobody reviewed, which is the worst shape a leak
 * can take — there is no field to audit afterwards, only a message already sent.
 *
 * ⚠️ IT REPLACES THE THREE LOCATION FIELDS IN PLACE rather than dropping the row, because the truck
 * IS busy that day and "we're out at a private event on Saturday" is the right answer. Dropping it
 * would have the model say the truck is free.
 * ⛔ FAILS CLOSED: on a probe failure every row is redacted, so the model is told "Private event" for
 * the whole week rather than being handed a venue we could not check.
 */
export async function redactPrivateRows<T extends {
  id: string
  venue_name?: string | null
  town?: string | null
  postcode?: string | null
}>(
  supabase: SupabaseClient,
  rows: readonly T[],
  where: string,
): Promise<T[]> {
  if (rows.length === 0) return [...rows]
  const privacy = await readPrivateEventIds(supabase, rows.map(r => r.id), where)
  if (privacy.ok && privacy.ids.size === 0) return [...rows]
  return rows.map(r => privacy.isPrivate(r.id)
    ? { ...r, venue_name: PRIVATE_PUBLIC_LABEL, town: null, postcode: null }
    : r)
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2 · RESOLVING A PRIVATE LINK
// ════════════════════════════════════════════════════════════════════════════════════════════════

export type LinkOutcome =
  /** A live token for an open private event. */
  | { kind: 'ok'; event: PrivateEventRow; truck: PrivateLinkTruck; linkOrdering: true }
  /** The token is current but ordering by link is switched off for this event. */
  | { kind: 'ordering_off'; event: PrivateEventRow; truck: PrivateLinkTruck }
  /** The token was replaced or cleared. We know whose it was, so we can say so. */
  | { kind: 'replaced'; truckName: string; reason: 'replaced' | 'made_public' }
  /** No such token, ever — or it is not even shaped like one. */
  | { kind: 'unknown' }
  /** The probe itself failed. ⛔ Treated as "no access", never as "let them in". */
  | { kind: 'unavailable' }

export interface PrivateEventRow {
  id: string
  truck_id: string
  event_date: string
  start_time: string | null
  end_time: string | null
  status: string | null
  is_private: boolean
  private_name: string | null
  private_link_ordering_override: boolean | null
  event_type_id: string | null
}

export interface PrivateLinkTruck {
  id: string
  name: string
  slug: string | null
  active: boolean | null
  logo_storage_path: string | null
}

const EVENT_COLS =
  'id, truck_id, event_date, start_time, end_time, status, is_private, private_name, ' +
  'private_link_ordering_override, event_type_id'

/**
 * 🔴 THE WHOLE OF THE ACCESS CONTROL ON A PRIVATE EVENT'S ORDERING PAGE.
 *
 * Resolves a token to its event and truck, or says exactly why it will not.
 *
 * ⚠️ SHAPE IS CHECKED BEFORE THE DATABASE IS TOUCHED. `/p/<anything>` is public and rate-limited, so
 * a string that cannot be one of our tokens is refused without a query. That is a cost control, not
 * a security boundary — see `looksLikeToken`.
 *
 * ⛔ `is_private` IS RE-CHECKED ON THE ROW EVEN THOUGH A TOKEN IMPLIES IT. The migration's
 * `truck_events_private_token_needs_private` CHECK already guarantees it, so this is belt-and-braces
 * — but it is one `&&` against a row we have already fetched, and the thing it guards is a public
 * event being served through a private link with a redacted heading. Free, and the failure it
 * prevents is silent.
 */
export async function resolvePrivateLink(
  supabase: SupabaseClient,
  token: string,
): Promise<LinkOutcome> {
  if (!looksLikeToken(token)) return { kind: 'unknown' }

  const { data: ev, error } = await supabase
    .from('truck_events')
    .select(EVENT_COLS)
    .eq('private_token', token)
    .maybeSingle()

  if (error) {
    warnOnce('resolvePrivateLink', error.code)
    return { kind: 'unavailable' }
  }

  if (!ev) {
    /* ── 🔴 NOT FOUND AS THE LIVE TOKEN — SO WAS IT ONE OF OURS ONCE? ────────────────────────────
     * This is why public.private_event_links exists. A printed QR code cannot be recalled, so the
     * honest answer to an old one is "that link was replaced", not "not found". */
    const { data: retired, error: rErr } = await supabase
      .from('private_event_links')
      .select('reason, truck_id')
      .eq('token', token)
      .maybeSingle()

    if (rErr) {
      /* ⚠️ A FAILED HISTORY LOOKUP IS 'unknown', NOT 'unavailable'. The live-token read above
       * SUCCEEDED and said no — so we know the token does not work. All we have lost is the nicer
       * wording, and reporting "temporarily unavailable" would invite the guest to retry a link
       * that is dead for good. */
      return { kind: 'unknown' }
    }
    if (!retired) return { kind: 'unknown' }

    const { data: tr } = await supabase
      .from('trucks').select('name').eq('id', retired.truck_id).maybeSingle()
    return {
      kind: 'replaced',
      truckName: tr?.name || 'The food truck',
      reason: retired.reason === 'made_public' ? 'made_public' : 'replaced',
    }
  }

  const row = ev as unknown as PrivateEventRow
  if (!row.is_private) return { kind: 'unknown' }

  const { data: tr, error: tErr } = await supabase
    .from('trucks')
    .select('id, name, slug, active, logo_storage_path')
    .eq('id', row.truck_id)
    .maybeSingle()

  if (tErr || !tr || tr.active === false) return { kind: 'unknown' }
  const truck = tr as unknown as PrivateLinkTruck

  /* The Private type's switch, for the `event override ?? type` resolution. A failure here resolves
   * through `resolveLinkOrdering`'s default (true), which is the state of a truck whose Private type
   * row has not been created yet — the same answer, not a new one. */
  let typeRow: { private_link_ordering: boolean | null } | null = null
  if (row.event_type_id) {
    const { data: t } = await supabase
      .from('event_types')
      .select('private_link_ordering')
      .eq('id', row.event_type_id)
      .maybeSingle()
    typeRow = (t as { private_link_ordering: boolean | null } | null) ?? null
  }

  if (!resolveLinkOrdering(row, typeRow)) return { kind: 'ordering_off', event: row, truck }
  return { kind: 'ok', event: row, truck, linkOrdering: true }
}

/**
 * The submit route's gate: is this token the CURRENT one for this event, with ordering on?
 *
 * ⛔ TOKEN **AND** EVENT ID, BOTH, MATCHED IN ONE QUERY. Checking the token and then separately
 * trusting the posted event id would let a guest use a valid token for event A to order against
 * event B — the token proves access to one event, not to the truck.
 * ⛔ FAILS CLOSED. A read failure refuses the order, which is the only safe direction: the
 * alternative accepts an unauthenticated order against a private event.
 */
export async function tokenAdmitsOrder(
  supabase: SupabaseClient,
  eventId: string,
  token: string | null | undefined,
): Promise<boolean> {
  if (!eventId || !token || !looksLikeToken(token)) return false

  const { data, error } = await supabase
    .from('truck_events')
    .select('id, is_private, private_link_ordering_override, event_type_id')
    .eq('id', eventId)
    .eq('private_token', token)
    .maybeSingle()

  if (error) { warnOnce('tokenAdmitsOrder', error.code); return false }
  if (!data || !data.is_private) return false

  let typeRow: { private_link_ordering: boolean | null } | null = null
  if (data.event_type_id) {
    const { data: t } = await supabase
      .from('event_types').select('private_link_ordering').eq('id', data.event_type_id).maybeSingle()
    typeRow = (t as { private_link_ordering: boolean | null } | null) ?? null
  }
  return resolveLinkOrdering(data as { private_link_ordering_override: boolean | null }, typeRow)
}
