// lib/dashboard-read.ts — the dashboard's ONE /api/dashboard read slot, and what a failed read MEANS.
//
// ── WHY THIS EXISTS (19 September 2026) ─────────────────────────────────────────────────────────────
// 🔴 THE BUG: "Can't reach the server" flashed on the dashboard header after almost every operator
// action — a Ready press, an order placed — and cleared itself a few seconds later. The server was never
// unreachable. The sequence was:
//   1. the action writes a row, so Postgres realtime fires and the client starts a dashboard read (A);
//   2. the action's POST returns, and its own refetch SUPERSEDES — it aborts A and starts read B, so the
//      operator's own action is never the thing that gets discarded;
//   3. A's catch saw `signal.aborted` and raised the degraded banner, because it could not tell a
//      deliberate supersede from the 10-second read TIMEOUT that shares the same AbortController;
//   4. B succeeded and cleared the banner. Hence "flashes, then clears itself".
// A superseded read is not a failure. It is a read we deliberately replaced with a newer one, and the
// newer one is already in flight. It must be silent.
//
// 🔴 AND THE SECOND HALF: a read that the server ANSWERED with an error (500, 503, 404) also raised
// "Can't reach the server". That is an application error wearing a connectivity error's clothes, and it
// is the more dangerous direction: an operator told the connection is bad will move the till, check the
// wifi, walk outside — none of which addresses a failing backend. The two now have different words.
//
// Extracted from the page so the rules can be tested without mounting a 4,500-line component; proven by
// scripts/ready-press-one-press.cjs.

/** What a read slot holds while a read is running. `superseded` is set by the call that abORTS it. */
export type ReadSlot = { controller: AbortController; superseded: boolean }

/** What to do when a new read is asked for while `current` is running. */
export type ReadDecision = 'start' | 'drop' | 'supersede'

/**
 * THE IN-FLIGHT RULE. Exactly one /api/dashboard read at a time — the amplifier guard that halved the
 * observed latency during the 1 September outage, unchanged in substance.
 *
 * 🔴 WHO MAY TAKE AN OUTSTANDING READ'S PLACE, AND WHO MAY NOT:
 *   • the 60-second POLL and realtime → 'drop'. Queueing them rebuilds the very backlog this prevents,
 *     and the next tick is a minute away.
 *   • `forceSeed` (event switch, trucks-realtime, reconnect) → 'supersede'. The operator has changed
 *     what they are looking at; leaving the board on the previous event for up to 60s is not an option.
 *   • `supersede` (an operator action's own post-write refetch) → 'supersede', for the same reason and
 *     WITHOUT forceSeed's config re-seed, which would undo operator-edited settings.
 * Either way exactly one read is in flight; only a poll is ever discarded.
 */
export function decideRead(
  current: ReadSlot | null,
  opts: { forceSeed?: boolean; supersede?: boolean } = {},
): ReadDecision {
  if (!current) return 'start'
  return opts.forceSeed || opts.supersede ? 'supersede' : 'drop'
}

/** Why a read did not produce data. */
export type ReadFailure =
  /** We aborted it ourselves because a newer read took its place. NOT a failure; a newer read is running. */
  | { kind: 'superseded' }
  /** The read hit READ_TIMEOUT_MS with no answer. The server is not responding in a usable time. */
  | { kind: 'timeout' }
  /** `fetch` threw: DNS, connection refused, TLS, offline. There is no HTTP status because none arrived. */
  | { kind: 'offline' }
  /** The server ANSWERED, with an error status. Connectivity is fine; the backend is not. */
  | { kind: 'server-error'; status: number }

/**
 * Classify one failed read. `superseded` is the flag the superseding caller set on the slot BEFORE
 * calling abort() — it is the only way to tell our own abort from the timeout's, because both reject the
 * same signal with the same DOMException.
 */
export function classifyReadFailure(input: {
  /** true when this read's own AbortController fired, whatever the reason. */
  aborted: boolean
  /** true when the flag on this read's slot says a later call replaced it. */
  superseded: boolean
  /** An HTTP status, when the server answered at all. */
  status?: number
}): ReadFailure {
  if (input.aborted) return input.superseded ? { kind: 'superseded' } : { kind: 'timeout' }
  if (typeof input.status === 'number') return { kind: 'server-error', status: input.status }
  return { kind: 'offline' }
}

/** What the header is saying, and since when. `null` = the board is current. */
export type Degraded = { since: Date; kind: 'unreachable' | 'server-error'; status?: number } | null

/**
 * Fold one failure into the degraded state. The FIRST failure's time is kept (the banner names when the
 * data on screen is from, not when we last retried), and a 'superseded' read changes nothing at all.
 */
export function nextDegraded(prev: Degraded, failure: ReadFailure, now: Date): Degraded {
  if (failure.kind === 'superseded') return prev
  if (failure.kind === 'server-error') {
    return prev ?? { since: now, kind: 'server-error', status: failure.status }
  }
  return prev ?? { since: now, kind: 'unreachable' }
}

/**
 * The header sentence, or null for no banner. Says three things and all three are load-bearing: WHAT is
 * wrong, WHEN the data on screen is from, and that the list may be INCOMPLETE — stale-and-complete and
 * stale-and-incomplete are different risks and only the second costs a customer their food.
 *
 * 🔴 THE TWO KINDS NEVER SHARE A SENTENCE. "Can't reach the server" tells an operator to check their
 * connection. If the connection is fine and the backend is failing, that sentence sends them to fix the
 * wrong thing, and they cannot tell the difference from the hatch.
 */
export function degradedBanner(d: Degraded, lastRefresh: Date): string | null {
  if (!d) return null
  const at = lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (d.kind === 'server-error') {
    const code = typeof d.status === 'number' ? ` (error ${d.status})` : ''
    return `The server couldn't load orders${code}. Showing orders from ${at}. New orders may be missing.`
  }
  return `Can't reach the server. Showing orders from ${at}. New orders may be missing.`
}
