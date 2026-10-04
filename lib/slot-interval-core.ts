// lib/slot-interval-core.ts — the interval VOCABULARY, with no dependencies of its own.
//
// ── 🔴 WHY THIS FILE EXISTS: TO BREAK AN IMPORT CYCLE, NOT TO ADD A LAYER ─────────────────────────
// `lib/slot-interval.ts` now resolves an event's TYPE (October 2026), so it imports
// `lib/event-types/resolve.ts`. That module needs `normaliseInterval` and `VanIntervals` — and
// importing them back from `lib/slot-interval.ts` would be a cycle.
//
// A cycle between two modules that only call each other from inside function bodies happens to work,
// and that is exactly why it is not left in place: it works until somebody evaluates one of these
// consts at module scope, and then a `normaliseInterval` that is `undefined` at the moment of use
// silently becomes a 5-minute grid on a van configured for 15. The vocabulary has no dependencies, so
// it can be a leaf, and a leaf cannot take part in a cycle.
//
// ⚠️ EVERY NAME HERE IS RE-EXPORTED BY `lib/slot-interval.ts`, so every existing import of it is
// unchanged and no call site moved. This file is not the public door; that one still is.
//
// ⚠️ THE DATABASE HAS A CHECK ON BOTH COLUMNS AND THIS LIST MUST MATCH IT
// (20260917_van_collection_intervals). The CHECK is the backstop; this is the layer that can say
// something useful in an error message.

export const INTERVAL_CHOICES = [5, 10, 15, 20, 30] as const
export type IntervalChoice = (typeof INTERVAL_CHOICES)[number]

export const DEFAULT_INTERVAL: IntervalChoice = 5

/** The one validator — used by the settings route and by every reader that normalises a stored value. */
export const isIntervalChoice = (v: unknown): v is IntervalChoice =>
  typeof v === 'number' && Number.isInteger(v) && (INTERVAL_CHOICES as readonly number[]).includes(v)

/**
 * A stored value → a usable interval. 🔴 NEVER RETURNS ANYTHING OUTSIDE THE VOCABULARY. Null (the
 * customer column is nullable), undefined (the column is absent from a select), 0, or a value the
 * CHECK would refuse all read as 5 — the value every row holds today, so an unexpected shape can only
 * ever reproduce today's behaviour, never invent a new grid.
 */
export const normaliseInterval = (v: unknown): IntervalChoice => (isIntervalChoice(v) ? v : DEFAULT_INTERVAL)

/**
 * One van's pair.
 *
 * 🔴 `truck` IS THE OPERATOR GRID AND IT IS ALREADY RESOLVED. `readVanIntervals` applies
 * `operator_collection_interval_mins ?? collection_interval_mins` before building this, so no caller
 * has to remember the `?? customer` rule — which is the one arithmetic mistake that file exists to
 * make impossible.
 */
export interface VanIntervals {
  /** truck_vans.collection_interval_mins — what a CUSTOMER is offered. */
  customer: IntervalChoice
  /** operator_collection_interval_mins ?? collection_interval_mins — what the operator may pick. */
  truck: IntervalChoice
}

/** No van, or a van whose intervals could not be read: the value every row held before the columns. */
export const NO_VAN_INTERVALS: VanIntervals = { customer: DEFAULT_INTERVAL, truck: DEFAULT_INTERVAL }
