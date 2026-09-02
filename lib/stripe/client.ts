import Stripe from 'stripe'

/**
 * 🔴 THE ONE PLACE A STRIPE CLIENT IS BUILT, AND THE ONE PLACE ITS BOUNDS ARE SET.
 *
 * Every construction in this codebase was `new Stripe(key)` with NO options, so each took the SDK's
 * own defaults — read from node_modules/stripe/cjs/stripe.core.js:
 *     DEFAULT_TIMEOUT   = 80000   (:99)
 *     maxNetworkRetries = 2       (:171, the default argument to validateInteger)
 * i.e. ONE call could legitimately run 80s, and with retries roughly 240s, before the SDK gave up. That
 * is why both payment routes are pinned at a 300s maxDuration: a lower ceiling would have killed the
 * invocation while the operation completed at Stripe — money moved, no local record.
 *
 * ── THE VALUES, AND WHY ────────────────────────────────────────────────────────────────────────────
 *   timeout: 20_000        the top of the 15-20s band. A card authorisation on a poor mobile network is
 *                          the operation we least want to cut short, and 20s is already far beyond the
 *                          point (~10s) at which a customer has decided the page is broken.
 *   maxNetworkRetries: 1   one retry, not two. The SDK only retries on connection errors and 5xx/429 —
 *                          never on a definite answer — so a second retry buys little and doubles the
 *                          tail.
 * 🔴 WORST CASE ≈ 40s (2 attempts x 20s), against ~240s before. Well inside any ceiling worth setting.
 *
 * ⚠️ THIS IS ONLY SAFE BECAUSE EVERY MUTATING CALL NOW SENDS AN IDEMPOTENCY KEY. A bounded client means
 * we stop listening while Stripe may still be completing the work; without a stable key a retry would
 * create a SECOND intent, capture or refund. See lib/payments/{authorize,capture,refund}.ts — each key
 * is derived from the order key or the payment-intent id, never from a timestamp or a random value.
 *
 * ⚠️ NO `apiVersion` IS PASSED, deliberately: that keeps the SDK's own pinned version, which is what
 * every one of these call sites already had. Changing it here would be a silent API-version migration.
 */
export const STRIPE_TIMEOUT_MS = 20_000
export const STRIPE_MAX_NETWORK_RETRIES = 1
/** Worst-case wall time for one bounded call — the number any future route ceiling must clear. */
export const STRIPE_WORST_CASE_MS = STRIPE_TIMEOUT_MS * (1 + STRIPE_MAX_NETWORK_RETRIES)

export function stripeSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  return key
}

/** Bounded platform client. Built per call, not module-scoped, so a rotated key is picked up and so the
 *  mode check in lib/stripe/connect.ts keeps running on every request — the behaviour every existing
 *  call site already had. */
export function stripeClient(secret?: string): Stripe {
  return new Stripe(secret ?? stripeSecretKey(), {
    timeout: STRIPE_TIMEOUT_MS,
    maxNetworkRetries: STRIPE_MAX_NETWORK_RETRIES,
  })
}
