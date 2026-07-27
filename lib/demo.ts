// lib/demo.ts
// ONE source of truth for "is this a demo truck?".
//
// A demo truck's id, slug AND dashboard_token are ALL generated with the same `demo-` prefix by
// lib/provision-truck.ts (demoIdentity), and assertReservedPrefix() guarantees no operator truck can ever
// carry that prefix on any of the three. So the same check works from whichever identifier a given surface
// happens to hold:
//
//   • proxy.ts              → the dashboard_token in the URL path (its own inline regex — edge middleware,
//                             deliberately dependency-free)
//   • dashboard page        → the token route param
//   • customer order page   → the slug route param
//   • server routes         → truck.id
//
// Keeping it in a tiny leaf module (no imports) means hot paths like /api/orders/submit can use it without
// pulling in provision-truck's crypto/supabase dependency graph.
//
// ⚠️ The `demo-` prefix is load-bearing security, not a naming convention: it is what waives the
// /dashboard session gate in proxy.ts. Do not reuse it for anything else.

export const DEMO_PREFIX = 'demo-'

/**
 * True when the given truck identifier (id, slug or dashboard_token) belongs to a demo truck.
 * Null/undefined-safe so callers can pass an optional field directly.
 */
export function isDemoIdentifier(identifier?: string | null): boolean {
  return typeof identifier === 'string' && identifier.startsWith(DEMO_PREFIX)
}

/**
 * The truck name as a CUSTOMER should see it — the trailing parenthesised code stripped off.
 *
 * A demo truck is STORED as `Demo Kitchen (ce1kh2)` (lib/provision-truck.ts:264 — six chars of the
 * truck id). That suffix is what makes concurrent demo trucks tellable apart in admin, in the trucks
 * table and in support, so THE STORED NAME MUST NOT BE REWRITTEN. It just has no business on a
 * customer-facing surface, where "Order from Demo Kitchen (ce1kh2)" reads as a serial number stamped
 * on a business.
 *
 * Display-only, and deliberately narrow:
 *   • only a TRAILING `(...)` group, only with optional surrounding whitespace — `Bill's (Fish) Bar`
 *     keeps its middle parenthesis, because that one is part of the trading name.
 *   • no demo check. A real truck that genuinely trades as "Something (Ltd)" would also lose the
 *     suffix, which is why this is only applied where the CUSTOMER reads the name, never in admin,
 *     never in the operator console, and never on a write path.
 */
export function displayTruckName(name?: string | null): string {
  return typeof name === 'string' ? name.replace(/\s*\([^()]*\)\s*$/, '').trim() : ''
}
