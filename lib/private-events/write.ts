// lib/private-events/write.ts — THE ONLY WRITER of an event's privacy.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 FOUR COLUMNS, ONE DOOR, AND THE DOOR IS WHY THIS FILE EXISTS
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
//     truck_events.is_private          — the visibility source of truth
//     truck_events.event_type_id       — set to the Private type when private (decision 2)
//     truck_events.private_name        — the guest-facing name
//     truck_events.private_token       — the link's secret
//
// They are FOUR FACTS ABOUT ONE STATE, and every inconsistent combination is a defect with teeth:
//   • `is_private` true with no token          ⇒ a private event nobody can order from
//   • a token with `is_private` false          ⇒ a private link to a public pitch (the migration's
//                                                 `truck_events_private_token_needs_private` CHECK
//                                                 refuses this outright, which is the backstop)
//   • `is_private` true with a CUSTOM type     ⇒ decision 2 broken; the grid shows the wrong column
//   • `private_name` left behind after untick  ⇒ a public event carrying a wedding's name
//
// So no handler writes any of them directly. `scripts/private-events.cjs` reads the whole repository
// and fails if a second writer appears — the same proof shape `schedule-graphics-places.cjs` uses for
// `truck_place_id`, and the reason that one caught an edit silently re-deriving a pitch.
//
// ⚠️ THE EVENT'S OTHER COLUMNS ARE NOT THIS FILE'S BUSINESS. Dates, times, venue and van are written
// by `upsert_event` exactly as before; this is called alongside it with the event id in hand.

import type { SupabaseClient } from '@supabase/supabase-js'
import { ensurePrivateType } from './type'
import { newPrivateToken } from './token'
import { resolveLinkOrdering } from './resolve'
import { looksPrivate } from './detect'

export interface PrivacyIntent {
  /** The tick. */
  isPrivate: boolean
  /** The operator's typed name. Trimmed and capped here; null/blank means "no name". */
  name?: string | null
  /**
   * Van 1's resolved service values, for the lazy creation of the Private type.
   * ⚠️ OPTIONAL: when the type already exists nothing is copied, which is every call after the first.
   */
  serviceValues?: Parameters<typeof ensurePrivateType>[2]
}

export interface PrivacyResult {
  ok: boolean
  isPrivate: boolean
  /** The live token, or null when the event is public or link ordering is off. */
  token: string | null
  typeId: string | null
  name: string | null
  /** Set when `ok` is false. */
  error?: string
}

/** 80 characters, matching `truck_events_private_name_shape`. If one moves, the other must. */
export const PRIVATE_NAME_MAX = 80

/**
 * 🔴 TRIMMED AND CAPPED HERE **AND** IN THE TABLE. The CHECK is what makes it true of the data; this
 * is what stops a long paste being a 400 the operator cannot explain. Two guards, one meaning — not
 * the stale-pair shape, because the CHECK cannot drift from itself.
 * ⚠️ A BLANK NAME IS NULL, NOT ''. The CHECK forbids '' (length >= 1), and "no name" is genuinely the
 * absence of one — the guest's page then shows "Private event".
 */
export function cleanPrivateName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.trim()
  if (!t) return null
  return t.slice(0, PRIVATE_NAME_MAX).trim() || null
}

/** Retire the event's current token, if it has one, so an old printed QR can still explain itself. */
async function retireToken(
  supabase: SupabaseClient,
  truckId: string,
  eventId: string,
  token: string | null,
  reason: 'replaced' | 'made_public',
): Promise<void> {
  if (!token) return
  /* ⚠️ A FAILURE HERE IS LOGGED AND SWALLOWED, DELIBERATELY. The new link must come into existence
   * even if the history row cannot be written; the cost of losing it is a worse MESSAGE on a dead
   * link, and the cost of throwing would be an operator unable to replace a leaked link. The error
   * direction is chosen on which failure hurts the truck more.
   * ⛔ NO `onConflict`. The token is the primary key and it is freshly random, so a collision is not
   * a state to merge — it is a 23505 that means something is very wrong, and it belongs in the log. */
  const { error } = await supabase
    .from('private_event_links')
    .insert({ token, truck_id: truckId, event_id: eventId, reason })
  if (error) {
    console.error(`[private-events] could not record retired token for ${eventId}: ${error.code} ${error.message}`)
  }
}

/**
 * Apply the operator's privacy intent to one event.
 *
 * Called by `upsert_event` (create and edit), by the approval queue's confirm, and by the dashboard's
 * "Make a new link" — every path that can change whether an event is private.
 *
 * 🔴 IT READS THE CURRENT ROW FIRST, so it can tell the three transitions apart. "Set these columns"
 * is not enough: going public has to RETIRE a token and clear a name, and staying private has to KEEP
 * the token the guests already have.
 */
export async function applyPrivacy(
  supabase: SupabaseClient,
  truckId: string,
  eventId: string,
  intent: PrivacyIntent,
): Promise<PrivacyResult> {
  const { data: cur, error: readErr } = await supabase
    .from('truck_events')
    .select('id, is_private, private_name, private_token, event_type_id, private_link_ordering_override')
    .eq('id', eventId)
    .eq('truck_id', truckId)
    .maybeSingle()

  if (readErr) return { ok: false, isPrivate: false, token: null, typeId: null, name: null, error: readErr.message }
  if (!cur) return { ok: false, isPrivate: false, token: null, typeId: null, name: null, error: 'Event not found' }

  const wasPrivate = cur.is_private === true
  const name = cleanPrivateName(intent.name)

  // ── GOING PUBLIC (or staying public) ──────────────────────────────────────────────────────────
  if (!intent.isPrivate) {
    if (!wasPrivate) {
      /* 🔴 NOTHING IS WRITTEN FOR A PUBLIC EVENT THAT STAYS PUBLIC. This is the byte-identity branch:
       * every event in the table today takes it, so adding this feature writes nothing to any of
       * them — which is what makes "a truck with no private events is untouched" a property of the
       * code rather than a claim in a report. */
      return { ok: true, isPrivate: false, token: null, typeId: cur.event_type_id ?? null, name: null }
    }

    await retireToken(supabase, truckId, eventId, cur.private_token, 'made_public')
    /* ⛔ THE TYPE IS CLEARED TOO. A public event whose type is Private would show the Private
     * column's settings on the grid and read as private to the operator while publishing its address.
     * Decision 8: "Unticking makes the event normal/public and clears its link." */
    const { error } = await supabase
      .from('truck_events')
      .update({
        is_private: false,
        private_name: null,
        private_token: null,
        event_type_id: null,
        private_link_ordering_override: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', eventId)
      .eq('truck_id', truckId)
    if (error) return { ok: false, isPrivate: true, token: cur.private_token ?? null, typeId: null, name: null, error: error.message }
    return { ok: true, isPrivate: false, token: null, typeId: null, name: null }
  }

  // ── BECOMING PRIVATE, OR STAYING PRIVATE ──────────────────────────────────────────────────────
  const type = await ensurePrivateType(supabase, truckId, intent.serviceValues)
  if (!type) {
    return {
      ok: false, isPrivate: wasPrivate, token: cur.private_token ?? null,
      typeId: cur.event_type_id ?? null, name: cur.private_name ?? null,
      error: 'Private events are not available yet — the database migration has not been applied.',
    }
  }

  /* Link ordering decides whether a token should exist at all: `event override ?? the type`. */
  const wantsLink = resolveLinkOrdering(cur, type)

  /* 🔴 THE EXISTING TOKEN IS KEPT. Guests may already have it on paper; re-rolling it on every save
   * of an unrelated field (a time change, a note) would silently break every printed card. A token
   * changes only when the operator presses "Make a new link". */
  let token: string | null = cur.private_token ?? null
  if (wantsLink && !token) token = newPrivateToken()
  if (!wantsLink && token) {
    /* Link ordering was switched off: the link stops working, and the old one can explain itself. */
    await retireToken(supabase, truckId, eventId, token, 'replaced')
    token = null
  }

  const { error } = await supabase
    .from('truck_events')
    .update({
      is_private: true,
      private_name: name,
      private_token: token,
      event_type_id: type.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', eventId)
    .eq('truck_id', truckId)

  if (error) {
    return {
      ok: false, isPrivate: wasPrivate, token: cur.private_token ?? null,
      typeId: cur.event_type_id ?? null, name: cur.private_name ?? null, error: error.message,
    }
  }
  return { ok: true, isPrivate: true, token, typeId: type.id, name }
}

/**
 * "Make a new link" — decision 7.
 *
 * ⛔ THE OLD TOKEN STOPS WORKING IMMEDIATELY. There is no grace period and there must not be one: the
 * reason an operator presses this is that the link got somewhere it should not have.
 * 🔴 AND THE OLD ONE IS RETIRED, NOT FORGOTTEN, so the printed cards say "replaced" rather than 404.
 */
export async function replacePrivateLink(
  supabase: SupabaseClient,
  truckId: string,
  eventId: string,
): Promise<PrivacyResult> {
  const { data: cur, error: readErr } = await supabase
    .from('truck_events')
    .select('id, is_private, private_name, private_token, event_type_id, private_link_ordering_override')
    .eq('id', eventId)
    .eq('truck_id', truckId)
    .maybeSingle()

  if (readErr || !cur) {
    return { ok: false, isPrivate: false, token: null, typeId: null, name: null, error: readErr?.message || 'Event not found' }
  }
  if (!cur.is_private) {
    return { ok: false, isPrivate: false, token: null, typeId: null, name: null, error: 'This event is not private.' }
  }

  const type = await ensurePrivateType(supabase, truckId)
  if (!resolveLinkOrdering(cur, type)) {
    return {
      ok: false, isPrivate: true, token: null, typeId: cur.event_type_id ?? null, name: cur.private_name ?? null,
      error: 'Ordering by private link is switched off for this event.',
    }
  }

  await retireToken(supabase, truckId, eventId, cur.private_token, 'replaced')
  const token = newPrivateToken()

  const { error } = await supabase
    .from('truck_events')
    .update({ is_private: true, private_token: token, updated_at: new Date().toISOString() })
    .eq('id', eventId)
    .eq('truck_id', truckId)

  if (error) {
    return { ok: false, isPrivate: true, token: cur.private_token ?? null, typeId: cur.event_type_id ?? null, name: cur.private_name ?? null, error: error.message }
  }
  return { ok: true, isPrivate: true, token, typeId: cur.event_type_id ?? null, name: cur.private_name ?? null }
}

/** The public URL for a token. One definition, so the QR, the Copy button and the cards agree. */
export function privateLinkUrl(token: string, origin?: string): string {
  const base = (origin || process.env.NEXT_PUBLIC_HATCHGRAB_URL || '').replace(/\/+$/, '')
  return `${base}/p/${token}`
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// SCRAPED EVENTS
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The privacy fields for an event being CREATED from scraped text (decision 9).
 *
 * 🔴 WHY THIS IS HERE AND NOT AT THE INSERT SITE. `is_private` has exactly one writer in this
 * repository, and `scripts/private-events.cjs` proves it by searching for the column name — so the
 * scraped insert spreads this object rather than naming the column itself. The decision stays in one
 * file and the proof stays exact.
 *
 * ⛔ `is_private` IS SET AT INSERT, BUT THE TYPE AND THE TOKEN ARE NOT. That split is deliberate:
 *   • VISIBILITY must be right from the instant the row exists. A scraped event is `unconfirmed`, and
 *     §15 says pending events are customer-invisible — but the discovery feed reads `status in
 *     ('confirmed','open')`, not "reviewed", so the margin is thinner than it sounds and the wrong
 *     default here would be a leak waiting on one approval.
 *   • THE TYPE AND THE TOKEN are decisions about SERVICE, and nobody has looked at this event yet.
 *     Issuing a working private link for an event the operator has not seen would mean a scraped
 *     guess had published an ordering page. They are written by `applyPrivacy` at CONFIRM.
 *
 * ⚠️ NO NAME, EVER, FROM A SCRAPE. "Private Hire" is the venue field of somebody's website, not the
 * name of a wedding, and putting it at the top of a guest's order page would be publishing scraped
 * text as if the operator had written it.
 */
export function scrapedPrivacyFields(
  ...texts: (string | null | undefined)[]
): { is_private: boolean } {
  return { is_private: looksPrivate(...texts) }
}
