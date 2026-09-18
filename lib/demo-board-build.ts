// lib/demo-board-build.ts — "is this the same demo board I saw last time?", and the two per-viewer flags
// that depend on the answer.
//
// ── 🔴 WHY (19 September 2026) ──────────────────────────────────────────────────────────────────────
// OBSERVED: Dominic rebuilt Between Buns Royston's demo and opened it. Instead of the welcome, the board
// greeted him with "That's exactly how a real order lands · Sign up for your free month now" — the panel
// that is supposed to fire the moment a PROSPECT places their own first order, on a demo where nobody had
// ordered anything.
//
// BOTH FLAGS WERE KEYED ON THE DASHBOARD TOKEN, WHICH SURVIVES A REBUILD:
//   • `hg_demo_seen_orders_<token>` is DemoLoopComplete's baseline — the order keys that were already on
//     the board when this viewer first loaded it. A rebuild deletes every order and seeds new ones with
//     fresh `order_key`s, so ALL of them read as "new since the baseline" and the panel fired on 25
//     seeded orders as though the visitor had placed them.
//   • `hg_demo_welcome_<token>` is DemoWelcome's "seen" flag. Still set from the previous build, so the
//     introduction — which exists, and is the thing that should have shown — was suppressed.
// One cause, two symptoms: a stored judgement about a board that no longer exists.
//
// THE TEST IS THE BOARD ITSELF, NOT A VERSION NUMBER. A rebuild replaces every order key, so a baseline
// that shares NOTHING with what is on screen describes a board that is gone. That needs no new column, no
// stamp threaded through the API, and it is true of the first-open auto-restart as well as of a rebuild —
// both replace the board, and both should re-introduce the demo rather than congratulate the viewer.

export const demoBaselineKey = (token: string) => `hg_demo_seen_orders_${token}`
export const demoWelcomeKey = (token: string) => `hg_demo_welcome_${token}`

// ── 🔴 THE WELCOME'S "SEEN" STATE MOVED TO sessionStorage (19 September 2026) ────────────────────────
// OBSERVED: Dominic opened the Between Buns demo and got no introduction at all.
//
// TWO FAULTS, ONE SYMPTOM:
//   1. THE KEY OUTLIVED THE DEMO. `hg_demo_welcome_<token>` is keyed on the DASHBOARD TOKEN, and a rebuild
//      keeps the token — `provisionDemo`'s existingTruckId path reuses the truck, the slug and the token.
//      So a flag set by a check of the PREVIOUS build silenced the introduction for the new one.
//   2. IT WAS READ ONE RENDER TOO EARLY TO BE RESCUED. `DemoWelcome` read the flag in a `useState`
//      initialiser — once, during first paint — while the self-heal that clears it lives in
//      `DemoLoopComplete`'s effect and is gated on `loaded`, i.e. after the orders fetch returns. By the
//      time the flag was cleared the welcome had already decided not to open, and nothing re-read it.
//      The introduction therefore appeared on the NEXT load, never the one that repaired it.
//
// 🔴 AND THE REQUIREMENT THAT DECIDES WHERE THE STATE LIVES: "I especially don't want to check the demo and
// have the flag showing someone's seen it when it was only me checking before sending." That rules out the
// obvious-looking fix of recording it on `demo_sessions` — a server-side stamp is exactly the thing that
// would let Dominic's own check consume the prospect's first open. It stays per-viewer.
//
// SO: sessionStorage, not localStorage. It survives a RELOAD of the tab (so the introduction does not
// reappear on every page load) and dies with the tab (so opening the link again shows it again, and
// nothing is left behind by a check). A rebuild mid-session is still caught by the self-heal below, which
// now NOTIFIES as well as clears — see `subscribeDemoWelcome`.

type Listener = () => void
const listeners = new Set<Listener>()
const notify = () => { for (const fn of listeners) fn() }

/** Subscribe to changes in the welcome's seen-state. Used with useSyncExternalStore so the panel re-opens
 *  the moment the self-heal clears the flag, rather than on the next load. */
export function subscribeDemoWelcome(fn: Listener): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** Has THIS viewer dismissed the introduction in THIS browser session? Guarded: a blocked store, a private
 *  window or the server all answer `false`, which shows the introduction — the safe direction. */
export function demoWelcomeSeen(token: string): boolean {
  if (typeof window === 'undefined') return false
  try { return sessionStorage.getItem(demoWelcomeKey(token)) === 'seen' } catch { return false }
}

/** Dismissal. Sticks for this tab, including across reloads, and for this build only. */
export function markDemoWelcomeSeen(token: string): void {
  if (typeof window === 'undefined') return
  try { sessionStorage.setItem(demoWelcomeKey(token), 'seen') } catch { /* private mode — it asks again */ }
  notify()
}

/** Forget the dismissal and tell the panel, so a rebuilt board re-introduces itself in the SAME session. */
export function clearDemoWelcomeSeen(token: string): void {
  if (typeof window === 'undefined') return
  try { sessionStorage.removeItem(demoWelcomeKey(token)) } catch { /* private mode */ }
  notify()
}

/**
 * Has the board been REPLACED since `baseline` was stored?
 *
 * `true` only when there is a stored baseline, there are orders on screen, and the two share no key at
 * all. Deliberately strict: a prospect placing orders ADDS keys, so an overlapping set is the normal case
 * and must never read as a replacement. An empty board answers `false` — nothing has been seen yet.
 */
export function boardWasReplaced(baseline: readonly string[] | null, current: readonly string[]): boolean {
  if (!baseline || baseline.length === 0 || current.length === 0) return false
  const now = new Set(current)
  return !baseline.some(k => now.has(k))
}

/**
 * Called when a replacement is detected: forget both judgements, so the rebuilt demo introduces itself
 * again and its seeded orders are the new baseline rather than the visitor's achievements.
 * Safe in private mode and on the server — every access is guarded.
 */
export function resetDemoBoardFlags(token: string, currentKeys: readonly string[]): void {
  if (typeof window === 'undefined') return
  // The BASELINE stays in localStorage: it answers "which orders were already here when this viewer first
  // saw the board", which must survive a reload and a tab close, or the signup prompt would fire on the
  // seeded board every time the demo is opened afresh.
  try { localStorage.setItem(demoBaselineKey(token), JSON.stringify(currentKeys)) } catch { /* private mode */ }
  // The welcome's flag is session-scoped and NOTIFIES, so a rebuild detected mid-session re-opens the
  // introduction immediately instead of waiting for the next load.
  clearDemoWelcomeSeen(token)
}
