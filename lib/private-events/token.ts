// lib/private-events/token.ts — the private link's secret.
//
// 🔴 THE ONLY GENERATOR. The token is the whole of the access control on a private event's ordering
// page: there is no account, no code to type and no second factor, so its unguessability IS the
// feature. One function, one source of randomness, asserted by scripts/private-events.cjs to be the
// only thing in the repository that produces a value for `truck_events.private_token`.

import { randomBytes } from 'crypto'

/**
 * 24 bytes = 192 bits, rendered as 32 base64url characters.
 *
 * 🔴 WHY 192 AND NOT 128. The brief's floor is 128 bits; this is above it because the cost of the
 * extra eight characters is nothing (nobody types this — it is scanned or pasted) and the cost of
 * being wrong is a stranger ordering from a wedding. The migration's CHECK accepts 22-64 characters
 * so the floor is enforced by the TABLE as well, not only by this function.
 *
 * ⚠️ `randomBytes`, NOT `Math.random`, AND NOT `crypto.randomUUID`. `Math.random` is not a CSPRNG and
 * is a classic way to ship a guessable link. A v4 uuid would be fine on entropy (122 bits) but it is
 * 36 characters with hyphens that read as structure, and it is the shape used for row ids everywhere
 * else in this schema — a token that looks like an id invites someone to try it as one.
 *
 * ⚠️ BASE64URL, SO IT IS SAFE IN A PATH WITH NO ESCAPING. `+/=` would all need encoding in
 * `/p/<token>`; base64url's alphabet is `[A-Za-z0-9_-]`, which is exactly what the migration's shape
 * CHECK accepts and what survives a QR code, a copy-paste and an email client's link detector intact.
 */
export function newPrivateToken(): string {
  return randomBytes(24).toString('base64url')
}

/**
 * Is this string shaped like one of our tokens?
 *
 * 🔴 USED TO REFUSE EARLY, NOT TO AUTHORISE. A string that fails this is not looked up at all, which
 * keeps a flood of junk at `/p/<anything>` off the database — the route is public and rate-limited,
 * and the cheapest refusal is the one that never queries. Passing this proves NOTHING about whether
 * the token is real or current; only the lookup does that.
 * ⚠️ THE BOUNDS MATCH THE MIGRATION'S CHECK EXACTLY (22-64). If one moves, the other must.
 */
export function looksLikeToken(s: unknown): s is string {
  return typeof s === 'string' && s.length >= 22 && s.length <= 64 && /^[A-Za-z0-9_-]+$/.test(s)
}
