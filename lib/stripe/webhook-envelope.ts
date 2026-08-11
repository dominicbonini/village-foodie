// ── STRIPE WEBHOOK ENVELOPE EXTRACTION ──────────────────────────────────────────────────────────────
// Pulling the few scalar fields /api/webhooks/stripe records out of an event envelope, for BOTH event
// formats that arrive at that one URL.
//
// ── 🔴 WHY THIS MODULE EXISTS: TWO COLUMNS WERE BEING SILENTLY DROPPED ──────────────────────────────
// A probe on 10 August 2026 captured real v2 thin events and ran the route's own field logic against
// them. Two columns came back NULL on every single thin event, with no error and a 200 response:
//   stripe_created_at — because `created` is a NUMBER on v1 and an ISO-8601 STRING on v2, and the
//                       guard was `typeof created === 'number'`. A string simply failed the test.
//   connected_account — because `account` is a TOP-LEVEL field on v1 Connect events and DOES NOT EXIST
//                       on thin events, where the account is `related_object.id`.
// This is the silent-empty-board family: the data arrived, was discarded, and nothing anywhere said so.
// 🔴 connected_account is the one that matters — it is how a row is attributed to a truck, and it was
// null on exactly the events that are about a connected account.
//
// ── 🔴 WHY EACH EXTRACTOR RETURNS A `source`, NOT JUST A VALUE ──────────────────────────────────────
// A NULL that means "this event genuinely has no connected account" and a NULL that means "we failed to
// read one" must not be the same NULL. The route cannot tell them apart from the value alone, so it is
// not asked to: every extractor returns a CLOSED UNION saying which shape it matched, and the route logs
// it. `not_applicable` is normal; `unreadable` is a defect and is logged at error level.
// The closed-union-of-stable-slugs idiom is deliberately the same one SignatureFailureReason uses in
// lib/stripe/webhook-signature.ts — these strings are read in logs at 7pm and must be greppable.
//
// ⚠️ PURE. No I/O, no clock, no throw. Every failure is a return value, so both extractors can be — and
// are — exercised directly against captured payloads.

/** A thin event (v2) states its own format. v1 snapshot events carry `object: "event"`. */
export function isThinEvent(event: { object?: unknown }): boolean {
  return event.object === 'v2.core.event'
}

// ── created ─────────────────────────────────────────────────────────────────────────────────────────

export type CreatedSource =
  /** v1 snapshot: unix SECONDS as a number. e.g. 1786323355 */
  | 'v1_unix_seconds'
  /** v2 thin: an ISO-8601 string. e.g. "2026-08-10T16:24:41.328027017Z" */
  | 'v2_iso_string'
  /** No `created` field at all. Not reachable for a real Stripe event of either format. */
  | 'absent'
  /** Present but neither shape, or not a real date. 🔴 A DROP — logged loudly by the route. */
  | 'unreadable'

export interface CreatedExtraction {
  /** Ready for a timestamptz column, or null. */
  value: string | null
  source: CreatedSource
}

/**
 * Read an event's creation time from either format.
 *
 * 🔴 THE TWO SHAPES ARE DETECTED AND HANDLED SEPARATELY — neither is coerced into the other's
 * assumption. That is the whole defect being fixed: the old code applied v1's `* 1000` arithmetic as the
 * ONLY path, so a v2 string fell off the end. `Number(created)` would have been the tempting one-line
 * "fix" and it is wrong twice over: it turns the ISO string into NaN, and it would silently accept a
 * numeric string that neither format ever sends.
 *
 * ⚠️ THE v2 STRING IS PASSED THROUGH VERBATIM, NOT ROUND-TRIPPED THROUGH `Date`. Stripe sends
 * NANOSECOND precision ("…41.328027017Z") and JavaScript's Date holds only milliseconds, so
 * `new Date(s).toISOString()` would quietly truncate it to "…41.328Z". Postgres timestamptz stores
 * microseconds, so passing the original string keeps three digits that a round-trip would throw away.
 * `Date.parse` is still used — but only to VALIDATE, never to reformat.
 */
export function extractStripeCreatedAt(created: unknown): CreatedExtraction {
  if (created === undefined || created === null) return { value: null, source: 'absent' }

  // v1 — unix seconds. Finite guard because a NaN or Infinity would become "Invalid Date" and poison
  // the delivery-delay figure this column exists to give.
  if (typeof created === 'number') {
    if (!Number.isFinite(created)) return { value: null, source: 'unreadable' }
    return { value: new Date(created * 1000).toISOString(), source: 'v1_unix_seconds' }
  }

  // v2 — ISO-8601. Validate only; emit the original bytes.
  if (typeof created === 'string') {
    if (Number.isNaN(Date.parse(created))) return { value: null, source: 'unreadable' }
    return { value: created, source: 'v2_iso_string' }
  }

  return { value: null, source: 'unreadable' }
}

// ── connected account ───────────────────────────────────────────────────────────────────────────────

export type AccountSource =
  /** v1 Connect: the top-level `account` field Stripe sets on connected-account events. */
  | 'v1_envelope_account'
  /** v2 thin event ABOUT an account: `related_object.id`, with `related_object.type` proving it. */
  | 'v2_related_object'
  /** v2 thin event FROM an account: the `context` field. ⚠️ Inferred from docs, not probe-proven. */
  | 'v2_context'
  /** No connected account, correctly. A platform-scoped v1 event, or a thin event about a non-account. */
  | 'not_applicable'
  /** The event claims an account and we could not read it. 🔴 A DROP — logged loudly by the route. */
  | 'unreadable'

export interface AccountExtraction {
  /** An `acct_...` id, or null. */
  value: string | null
  source: AccountSource
}

/** The `related_object.type` a thin event uses when the related object IS the connected account. */
const V2_ACCOUNT_TYPE = 'v2.core.account'

/**
 * Find which connected account an event belongs to, in either format.
 *
 * ── 🔴 WHERE THE ACCOUNT ID ACTUALLY LIVES, ESTABLISHED FROM CAPTURED PAYLOADS ────────────────────
 * v1 Connect event — a top-level `account`, per Stripe: "Each event for a connected account contains a
 * top-level `account` property that identifies the connected account."
 *
 * v2 thin event — NO top-level `account` field exists. The captured
 * `v2.core.account[configuration.merchant].capability_status_updated` body was, in full:
 *   {"id":"evt_test_65VCJxaUR4…","object":"v2.core.event",
 *    "type":"v2.core.account[configuration.merchant].capability_status_updated",
 *    "livemode":false,"created":"2026-08-10T16:24:41.328027017Z",
 *    "related_object":{"id":"acct_1U2vgMGhodqxYjqN","type":"v2.core.account",
 *                      "url":"/v2/core/accounts/acct_1U2vgMGhodqxYjqN?include=configuration.merchant"}}
 * 🔴 SO IT IS PRESENT, in `related_object.id` — the column was never unfillable, it was unfilled.
 *
 * ⚠️ `related_object.type` IS CHECKED, NOT ASSUMED. A thin event's related object is whatever the event
 * is about — a meter, a payment — and its `id` is then NOT an account. Taking `related_object.id`
 * unconditionally would file a `mtr_…` under connected_account, which is worse than the NULL it
 * replaced: a wrong attribution reads as a real one.
 *
 * ⚠️ THE `context` ARM IS DOCS-DERIVED AND NOT PROBE-PROVEN. Every event captured on 10 August was
 * ABOUT an account, so the second arm never fired and none carried a `context` at all. Stripe documents
 * `context` as identifying which account an event came from, which is the shape a thin event about a
 * PAYMENT on a connected account would use. It is guarded on the `acct_` prefix so it cannot contribute
 * an organisation context string or anything else that is not an account id. If a future probe shows
 * `context` carries something else, this arm is the one to change — the two above it are proven.
 */
export function extractConnectedAccount(event: {
  account?: unknown
  related_object?: unknown
  context?: unknown
}): AccountExtraction {
  // 1. v1 Connect. Unchanged behaviour, and deliberately first: v1 events still arrive at this URL.
  if (typeof event.account === 'string' && event.account) {
    return { value: event.account, source: 'v1_envelope_account' }
  }

  // 2. v2 thin event about an account.
  const related = event.related_object
  if (related !== null && typeof related === 'object') {
    const { id, type } = related as { id?: unknown; type?: unknown }
    if (type === V2_ACCOUNT_TYPE) {
      if (typeof id === 'string' && id) return { value: id, source: 'v2_related_object' }
      // It says it is about an account and will not say which. That is a drop, not an absence.
      return { value: null, source: 'unreadable' }
    }
  }

  // 3. v2 thin event from an account. See the caveat above.
  if (typeof event.context === 'string' && event.context.startsWith('acct_')) {
    return { value: event.context, source: 'v2_context' }
  }

  return { value: null, source: 'not_applicable' }
}
