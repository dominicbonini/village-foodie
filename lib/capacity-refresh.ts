// lib/capacity-refresh.ts — the Add Order time list's SAFETY NET, as a pure object the panel owns.
//
// ── WHY (18 September 2026) ──────────────────────────────────────────────────────────────────────────
// The Add Order time list draws its dots and its "Not enough time" labels from `capacityInputs`, which
// prefers the panel's own /api/slots snapshot (`apiCapacityInputs`) over the dashboard's cached view.
// That snapshot was taken when the tab was shown or the event changed, and NOTHING invalidated it: a
// customer order placed in another tab reached the dashboard within a second (orders realtime →
// fetchAll → new `offlineCapacity` prop), but the panel kept showing "17:30 🟢" with no count and no
// label until the submit's own fresh re-check raised the popup. The list and the popup disagreed.
//
// This object makes every trigger — the dashboard's refetched data changing, the tab being shown, the
// operator opening the time dropdown — call ONE fresh read, the same authenticated no-store /api/slots
// read `submitManual` re-checks with, and apply its result to the list. Rules, each proven by
// scripts/add-order-refresh.cjs:
//   • at most one fetch every `minIntervalMs` (5 s). A request inside the window is NOT dropped: it
//     becomes ONE trailing fetch at the window's end, so a change that arrives 1 s after the last read
//     is still picked up, just not immediately;
//   • `request()` never blocks: it returns synchronously; the fetch runs in the background;
//   • a failed fetch applies nothing — the last data stays, silently;
//   • offline (`isOnline()` false) → no fetch at all; the panel keeps using its cached view exactly as
//     before this change.
// It is a plain object rather than a hook so that the rules can be tested without a DOM and so that the
// component's own wiring stays four one-liners.

export type CapacityRefresher = {
  /** Ask for a fresh read. Returns true if a fetch was STARTED now (false: throttled, in flight, offline). */
  request(reason: string): boolean
  /** Cancels a pending trailing fetch. Call on unmount. */
  dispose(): void
  /** True while a read is running OR a trailing read is already scheduled — i.e. the work WILL happen.
   *  A caller holding a "something changed" flag clears it only when `request()` started a read or this
   *  is true; otherwise (offline, disposed) the refresher REFUSED and the flag must be held, not eaten. */
  readonly pending: boolean
  /** For diagnostics/tests. */
  readonly stats: { started: number; applied: number; failed: number; skippedOffline: number; deferred: number }
}

export function createCapacityRefresher<T>(opts: {
  fetchFresh: () => Promise<T>
  apply: (data: T) => void
  isOnline: () => boolean
  minIntervalMs?: number
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}): CapacityRefresher {
  const minInterval = opts.minIntervalMs ?? 5000
  const now = opts.now ?? (() => Date.now())
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = opts.clearTimer ?? (h => clearTimeout(h as ReturnType<typeof setTimeout>))
  const stats = { started: 0, applied: 0, failed: 0, skippedOffline: 0, deferred: 0 }
  let lastStart = Number.NEGATIVE_INFINITY
  let inFlight = false
  let trailing: unknown = null
  let trailingWanted = false
  let disposed = false

  const start = () => {
    lastStart = now()
    inFlight = true
    stats.started++
    opts.fetchFresh().then(
      data => { if (!disposed) { opts.apply(data); stats.applied++ } },
      () => { stats.failed++ },                  // 🔴 nothing applied: the last data stays, silently
    ).then(() => {
      inFlight = false
      if (trailingWanted && !disposed) { trailingWanted = false; schedule() }
    })
  }
  const schedule = () => {
    if (trailing !== null || disposed) return
    const wait = Math.max(0, lastStart + minInterval - now())
    stats.deferred++
    trailing = setTimer(() => {
      trailing = null
      if (disposed) return
      if (!opts.isOnline()) { stats.skippedOffline++; return }
      if (inFlight) { trailingWanted = true; return }
      start()
    }, wait)
  }
  return {
    request() {
      if (disposed) return false
      if (!opts.isOnline()) { stats.skippedOffline++; return false }     // offline: cached view, no fetch
      if (inFlight) { trailingWanted = true; return false }                // one at a time
      if (now() - lastStart < minInterval) { schedule(); return false }    // inside the window: ONE trailing read
      start()
      return true
    },
    dispose() { disposed = true; if (trailing !== null) { clearTimer(trailing); trailing = null } },
    // 🔴 THE DIFFERENCE BETWEEN "DEFERRED" AND "DROPPED", MADE READABLE. `request()` returns false for
    // three unlike reasons: throttled (a trailing read is scheduled), in flight (a trailing read is
    // wanted), and offline (nothing will happen). Only the third loses the change, so a caller that
    // consumes a dirty flag on `request()` alone silently drops offline edits. Reading `pending`
    // alongside the return value separates them.
    get pending() { return inFlight || trailing !== null || trailingWanted },
    stats,
  }
}
