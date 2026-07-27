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
