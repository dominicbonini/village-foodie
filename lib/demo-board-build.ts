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
  try {
    localStorage.setItem(demoBaselineKey(token), JSON.stringify(currentKeys))
    localStorage.removeItem(demoWelcomeKey(token))
  } catch { /* private mode — the flags simply stay as they were */ }
}
