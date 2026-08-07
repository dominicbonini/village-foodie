// ── STRIPE WEBHOOK SIGNATURE VERIFICATION ───────────────────────────────────────────────────────────
// 🔴 THIS IS THE FIRST SIGNATURE-VERIFYING INBOUND PATH IN THIS CODEBASE. There was nothing to copy:
// `grep -rn "createHmac|timingSafeEqual|X-Hub-Signature|constructEvent"` returned ZERO matches before
// this file. The four existing webhook routes (meta/whatsapp, messenger, instagram, twilio-whatsapp)
// authenticate NOTHING on POST — the Meta ones check a shared token on the GET subscription handshake
// only, and act on the POST body unverified. Those routes are out of scope here, but this file is
// deliberately written to be the thing they are eventually fixed against, which is why the verification
// lives in a pure, dependency-free module rather than inline in the route.
//
// ── 🔴 WHY HAND-ROLLED AND NOT `stripe.webhooks.constructEvent` ─────────────────────────────────────
// The Stripe Node SDK is NOT a dependency of this project and installing it is explicitly out of scope
// for this pass. Stripe documents manual verification as a supported path ("you can create a custom
// solution by following this section") and the steps below are that section, implemented literally.
// ✅ A HAPPY SIDE EFFECT WORTH KEEPING EVEN AFTER THE SDK LANDS: `new Stripe(...)` requires an API key,
// so importing the SDK here would mean this route needed STRIPE_SECRET_KEY in its environment purely to
// construct a client it never calls the API with. This way the webhook endpoint holds NO API KEY AT ALL
// — only the signing secret, which is useless for anything except verifying signatures. That is a real
// reduction in blast radius for the most publicly-reachable route in the app.
// WHEN THE SDK ARRIVES: swapping this for constructEvent is behaviour-identical and this module can be
// deleted. Do not swap it for anything else.
//
// ── THE ALGORITHM, FROM STRIPE'S DOCUMENTED MANUAL PROCEDURE ────────────────────────────────────────
//   1. Split the `Stripe-Signature` header on `,`, then each element on `=`, giving prefix/value pairs.
//   2. `t` is the timestamp. `v1` is the signature (there may be MORE THAN ONE — see the roll note).
//   3. signed_payload = `${t}.${rawBody}`  — the RAW body, byte for byte.
//   4. expected = HMAC-SHA256(signing_secret, signed_payload), hex.
//   5. Constant-time compare against each supplied v1. Then check the timestamp is within tolerance.
//
// ⚠️ `v1` ONLY. Stripe also sends a `v0` scheme on test events, and their docs are explicit: "To prevent
// downgrade attacks, ignore all schemes that aren't `v1`." Every non-v1 element is discarded here.
import { createHmac, timingSafeEqual } from 'node:crypto'

/** Stripe's own libraries default to five minutes between the signed timestamp and now. Matched.
 *  ⚠️ NEVER 0 — Stripe: "Using a tolerance value of `0` disables the recency check entirely." */
export const DEFAULT_TOLERANCE_SECONDS = 300

/** Why a request was refused. Deliberately a CLOSED union rather than a free-text message: these strings
 *  are logged and are the first thing read when the endpoint starts refusing everything at 7pm, so they
 *  must be greppable and stable. None of them is ever returned to the caller — see the route. */
export type SignatureFailureReason =
  | 'no_secret_configured'
  | 'missing_signature_header'
  | 'malformed_signature_header'
  | 'no_v1_signature'
  | 'signature_mismatch'
  | 'timestamp_outside_tolerance'

export type SignatureVerification =
  | { ok: true; timestamp: number }
  | { ok: false; reason: SignatureFailureReason }

/**
 * Parse the configured signing secret(s).
 *
 * 🔴 PLURAL, AND THAT IS NOT OVER-ENGINEERING — IT IS REQUIRED BY TWO SEPARATE STRIPE BEHAVIOURS:
 *
 *   1. ONE URL, TWO MODES. A production Connect webhook URL receives BOTH live and test events (Stripe:
 *      "your production webhook URLs receive both live and test webhooks"). Registering the same URL in
 *      test mode and in live mode produces TWO endpoint objects with TWO DIFFERENT signing secrets —
 *      "if you use the same endpoint for both test and live API keys, the secret is different for each
 *      one". A single-secret implementation would verify one mode and reject the other as forged.
 *   2. SECRET ROLLING. When a secret is rolled, Stripe keeps the previous one active for up to 24 hours
 *      and "generates one signature for each secret". Accepting a list is what makes a roll a
 *      zero-downtime config change instead of a cutover.
 *
 * Comma-separated, whitespace tolerated, empties dropped. Order is irrelevant — every secret is tried.
 */
export function parseSigningSecrets(raw: string | undefined | null): string[] {
  if (!raw) return []
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

/** Split `t=123,v1=abc,v1=def,v0=ghi` into its timestamp and its v1 signatures. */
function parseSignatureHeader(header: string): { timestamp: number | null; v1: string[] } {
  let timestamp: number | null = null
  const v1: string[] = []
  for (const element of header.split(',')) {
    const idx = element.indexOf('=')
    if (idx === -1) continue
    const prefix = element.slice(0, idx).trim()
    const value = element.slice(idx + 1).trim()
    if (prefix === 't') {
      const parsed = Number(value)
      // Integer seconds. A non-numeric or fractional `t` is malformed, not merely stale.
      if (Number.isInteger(parsed)) timestamp = parsed
    } else if (prefix === 'v1') {
      v1.push(value)
    }
    // Every other scheme (notably v0) is DISCARDED — see the downgrade-attack note in the header.
  }
  return { timestamp, v1 }
}

/** Constant-time hex comparison. Length is compared first and in variable time deliberately: both sides
 *  are fixed-width SHA-256 hex (64 chars), so the length carries no secret, and timingSafeEqual THROWS
 *  on a length mismatch rather than returning false. */
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
  } catch {
    return false
  }
}

/**
 * Verify a Stripe webhook signature.
 *
 * 🔴 `rawBody` MUST BE THE EXACT BYTES STRIPE SENT. Not a re-serialised object, not a parsed-then-
 * stringified copy. `JSON.stringify(JSON.parse(body))` is a DIFFERENT STRING — key order, whitespace,
 * unicode escaping and number formatting all drift — so the HMAC differs and verification fails 100% of
 * the time with a perfectly correct secret. That is the single most common way this check silently
 * fails, and it presents as "my secret must be wrong". See the route for how the raw body is obtained.
 *
 * Pure: no I/O, no clock read unless `nowSeconds` is omitted, no throw. Every failure is a return value.
 */
export function verifyStripeSignature(input: {
  rawBody: string
  signatureHeader: string | null | undefined
  secrets: string[]
  /** Injectable for tests. Defaults to the real clock. */
  nowSeconds?: number
  toleranceSeconds?: number
}): SignatureVerification {
  const { rawBody, signatureHeader, secrets } = input
  const tolerance = input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS

  // 🔴 NO SECRET ⇒ REJECT. NOT "skip verification". Stripe's own quickstart sample is written as
  // `if (endpointSecret) { verify }`, which means a misconfigured deployment silently accepts ANY body
  // from ANYONE. That sample is written for a tutorial; this is a route on the public internet attached
  // to a payment ledger. An unset secret is a broken deployment and must fail closed, loudly.
  if (secrets.length === 0) return { ok: false, reason: 'no_secret_configured' }
  if (!signatureHeader) return { ok: false, reason: 'missing_signature_header' }

  const { timestamp, v1 } = parseSignatureHeader(signatureHeader)
  if (timestamp === null) return { ok: false, reason: 'malformed_signature_header' }
  if (v1.length === 0) return { ok: false, reason: 'no_v1_signature' }

  const signedPayload = `${timestamp}.${rawBody}`

  // Try every configured secret against every offered v1. Both loops are small (1–2 secrets, 1–2
  // signatures) and both run to completion rather than short-circuiting on the first mismatch.
  let matched = false
  for (const secret of secrets) {
    const expected = createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex')
    for (const candidate of v1) {
      if (safeEqualHex(expected, candidate)) matched = true
    }
  }
  if (!matched) return { ok: false, reason: 'signature_mismatch' }

  // ── REPLAY WINDOW, CHECKED AFTER THE SIGNATURE AND NOT BEFORE ────────────────────────────────────
  // Order matters for what the logs mean. The timestamp is inside the signed payload, so an attacker
  // cannot alter it without invalidating the signature — which means a 'timestamp_outside_tolerance'
  // result is only ever reachable by something holding a GENUINE Stripe signature that is simply old
  // (a very delayed retry, or a replay of a captured request). Checking freshness first would let a
  // forged body with a stale timestamp produce that same log line, and the two are worth telling apart.
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000)
  if (Math.abs(now - timestamp) > tolerance) return { ok: false, reason: 'timestamp_outside_tolerance' }

  return { ok: true, timestamp }
}
