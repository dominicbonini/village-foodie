// FIX 1 — order-lifecycle integrity: version-guarded merge (replaces blind setOrders(data.orders)).
//
// PROBLEM (audit): the client did `setOrders(data.orders)` on every read (fetchAll / realtime / poll)
// with NO version guard. A stale or out-of-order read therefore overwrote a newer local status →
// an order that was marked ready could revert to confirmed (online: an in-flight read that started
// before the write resolving after a post-write read; offline: the SW cache re-serving a pre-change
// snapshot). Lifecycle must be forward-only unless an explicit undo occurs.
//
// FIX: merge per order_key. Keep whichever row has the NEWER `updated_at` — an OLDER-timestamped read
// can never overwrite a NEWER local status. Undo works naturally: undo_collected / undo_ready bump
// updated_at (via the orders_set_updated_at trigger), so the read reflecting the undo is NEWER and is
// accepted. Membership = the READ's membership (an order absent from the read is dropped — identical
// to today's blind replace, so no lingering removed orders).
//
// BEHAVIOUR-PRESERVING when updated_at is present and monotonic (post-trigger): the normal
// confirm→cooking→ready→collected flow is unchanged (each forward read has a newer ts → accepted);
// only STALE reads (older ts) are rejected. When updated_at is missing/equal (pre-trigger, or two
// same-status reads), it falls back to read-wins for forward/lateral/known-undo moves — today's
// behaviour — with a minimal monotonic BACKSTOP (FIX 3) that blocks only bogus multi-step regressions
// the server never emits (e.g. collected→pending).

/** Minimal shape the merge needs. The dashboard/KDS `Order` satisfies this (order_key + status +
 *  the optional updated_at surfaced from select('*')). Generic so both surfaces reuse it as-is. */
export interface MergeableOrder {
  order_key: string
  status: string
  updated_at?: string | null
}

// Lifecycle rank — forward-only order. Terminal (cancelled/rejected) sit ABOVE the active flow so a
// stale ACTIVE read can never resurrect a terminal order. modified is a confirmed-tier lateral state.
const RANK: Record<string, number> = {
  pending: 0,
  confirmed: 1,
  modified: 1,
  cooking: 2,
  ready: 3,
  collected: 4,
  cancelled: 5,
  rejected: 5,
}
const rankOf = (s: string): number => RANK[s] ?? 0

// The ONLY legitimate backward transitions in the system (explicit operator undo). Whitelisted so the
// monotonic backstop never blocks a real undo:
//   • undo_collected: collected → confirmed | ready | modified
//   • undo_ready:     ready     → confirmed | modified
// Post-trigger these are decided by the version guard (undo bumps updated_at → newer → accepted); the
// whitelist only governs the equal/missing-timestamp fallback.
function isKnownUndo(fromStatus: string, toStatus: string): boolean {
  if (fromStatus === 'collected') return toStatus === 'confirmed' || toStatus === 'ready' || toStatus === 'modified'
  if (fromStatus === 'ready') return toStatus === 'confirmed' || toStatus === 'modified'
  return false
}

/** ms since epoch, or null when the timestamp is absent/unparseable (→ equal/missing branch). */
function parseTs(ts: string | null | undefined): number | null {
  if (!ts) return null
  const t = Date.parse(ts)
  return Number.isNaN(t) ? null : t
}

/** Equal-or-missing timestamp resolution (FIX 3 monotonic backstop + undo whitelist). Returns the
 *  row to keep. Forward/lateral → read wins (today's behaviour). Backward → read wins ONLY if it's a
 *  known undo; otherwise keep local (block a bogus regression / apparent stale revert). */
function reconcileEqual<T extends MergeableOrder>(local: T, read: T): T {
  const rLocal = rankOf(local.status)
  const rRead = rankOf(read.status)
  if (rRead >= rLocal) return read                          // forward or lateral → read wins (unchanged)
  if (isKnownUndo(local.status, read.status)) return read   // legitimate undo → allow the backward move
  return local                                              // bogus regression → backstop keeps local
}

/**
 * Merge a fresh READ (`incoming`) over current local state (`prev`), guarding against a stale/older
 * read overwriting a newer local status. Membership = `incoming`. Pure; returns a new array.
 */
export function mergeOrders<T extends MergeableOrder>(prev: T[], incoming: T[]): T[] {
  if (!Array.isArray(incoming)) return prev
  if (!Array.isArray(prev) || prev.length === 0) return incoming
  const prevByKey = new Map<string, T>()
  for (const o of prev) if (o && o.order_key) prevByKey.set(o.order_key, o)

  return incoming.map(read => {
    const local = read && read.order_key ? prevByKey.get(read.order_key) : undefined
    if (!local) return read                                 // new to us → take the read
    const tRead = parseTs(read.updated_at)
    const tLocal = parseTs(local.updated_at)
    if (tRead !== null && tLocal !== null && tRead !== tLocal) {
      return tRead > tLocal ? read : local                  // VERSION GUARD (primary): newer wins, older rejected
    }
    return reconcileEqual(local, read)                      // equal/missing ts → monotonic backstop
  })
}
