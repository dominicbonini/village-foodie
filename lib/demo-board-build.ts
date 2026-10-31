// lib/demo-board-build.ts — THE ONE OWNER OF THE DEMO'S BROWSER STATE (demo-2, 30 October 2026; docs/demo-2-report.md).
//
// ── WHAT IT HOLDS NOW ────────────────────────────────────────────────────────────────────────────────
// The demo walkthrough (/try/<slug>) needs two things to survive a reload of THIS tab and nothing more:
//   • which orders THIS visitor placed — the kitchen screen shows those and only those (`hg_demo_walk_orders_<slug>`);
//   • the email they typed before the build, so "Start free" can prefill it (`hg_demo_walk_email_<slug>`).
// Both live in sessionStorage, keyed on the demo's SLUG (the walkthrough never holds the dashboard token): they survive
// a reload of the tab and die with it, so nothing is left behind on a shared computer, and a person who opens the
// emailed link on another device simply starts without them (an empty kitchen, an empty email box) — never with
// someone else's.
// 🔴 THE EMAIL IS NEVER READ FROM THE SERVER for the prefill. Anyone the visitor shares the order link with has the
// slug; a server read would hand them the visitor's address. Only the browser that typed it can prefill it.
//
// ── WHAT IT USED TO HOLD (retired with DemoWelcome and DemoLoopComplete) ─────────────────────────────
// `hg_demo_welcome_<token>` (the welcome popup's "seen") and `hg_demo_seen_orders_<token>` (the "your order arrived"
// baseline over a SEEDED board). With no seeded orders and no welcome popup there is no board to compare against and
// nothing to re-introduce; `forgetRetiredDemoFlags` clears both names wherever the old dashboard code used to.
// Every access is guarded: a private window, a blocked store or the server reads as "nothing stored".

const walkOrdersKey = (slug: string) => `hg_demo_walk_orders_${slug}`
const emailKey = (slug: string) => `hg_demo_walk_email_${slug}`
/** The retired names — kept only so they can be cleared. */
export const RETIRED_DEMO_FLAG_KEYS = (token: string) => [`hg_demo_welcome_${token}`, `hg_demo_seen_orders_${token}`]

const MAX_ORDERS = 20

/** The order keys this visitor placed on this demo, oldest first. */
export function demoWalkOrders(slug: string): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = JSON.parse(sessionStorage.getItem(walkOrdersKey(slug)) ?? '[]')
    return Array.isArray(raw) ? raw.filter((k): k is string => typeof k === 'string').slice(-MAX_ORDERS) : []
  } catch { return [] }
}
/** Remembers an order this visitor placed. Idempotent. */
export function addDemoWalkOrder(slug: string, orderKey: string): void {
  if (typeof window === 'undefined' || !orderKey) return
  try {
    const keys = demoWalkOrders(slug).filter(k => k !== orderKey)
    keys.push(orderKey)
    sessionStorage.setItem(walkOrdersKey(slug), JSON.stringify(keys.slice(-MAX_ORDERS)))
  } catch { /* private mode — the kitchen shows the order in this page's memory only */ }
}
/** Forgets the placed orders — after a restart wiped them on the server. */
export function clearDemoWalkOrders(slug: string): void {
  if (typeof window === 'undefined') return
  try { sessionStorage.removeItem(walkOrdersKey(slug)) } catch { /* private mode */ }
}

/** The email this browser typed before building this demo (for the "Start free" prefill), or ''. */
export function demoEmailFor(slug: string): string {
  if (typeof window === 'undefined') return ''
  try { return sessionStorage.getItem(emailKey(slug)) ?? '' } catch { return '' }
}
export function rememberDemoEmail(slug: string, email: string): void {
  if (typeof window === 'undefined' || !slug || !email) return
  try { sessionStorage.setItem(emailKey(slug), email.trim()) } catch { /* private mode — no prefill */ }
}

/** Clears the two retired flags for a dashboard token (the old welcome / baseline). Safe anywhere. */
export function forgetRetiredDemoFlags(token: string): void {
  if (typeof window === 'undefined') return
  const [welcome, baseline] = RETIRED_DEMO_FLAG_KEYS(token)
  try { sessionStorage.removeItem(welcome) } catch { /* private mode */ }
  try { localStorage.removeItem(baseline) } catch { /* private mode */ }
}
