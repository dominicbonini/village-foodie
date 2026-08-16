// ── META WEBHOOK SIGNATURE VERIFICATION ─────────────────────────────────────────────────────────────
// 🔴 THE THREE META ENDPOINTS AUTHENTICATED NOTHING ON POST. They checked a shared verify token on the
// GET subscription handshake and then acted on the POST body unverified — so anything that learned the
// URL could cause a real WhatsApp send (a Meta conversation charge) and a real Gemini call (a Google
// charge), with no metering, no rate limit and no counter. This module closes that.
//
// ✅ DELIBERATELY THE SAME SHAPE AS lib/stripe/webhook-signature.ts, WHICH IS THE FILE THIS FIXES
// AGAINST — its own header says so: "this file is deliberately written to be the thing they are
// eventually fixed against". Same pure dependency-free module, same closed union of failure reasons,
// same timing-safe comparison, same fail-closed-on-missing-secret decision. Do not invent a second
// approach here; if that file's shape changes, change this one with it.
//
// ── THE ALGORITHM, AND IT IS SIMPLER THAN STRIPE'S ──────────────────────────────────────────────────
// ⚠️ INFERRED from Meta's documented behaviour, not read from our code — we have never received a
// signed delivery, so this is written against the specification and is unproven against real traffic.
//   1. Meta sends `X-Hub-Signature-256: sha256=<hex>`.
//   2. expected = HMAC-SHA256(app_secret, rawBody), hex.
//   3. Constant-time compare.
// 🔴 THAT IS THE WHOLE SCHEME. THERE IS NO TIMESTAMP, so there is NO REPLAY WINDOW to check — the
// difference from Stripe that matters most. A captured genuine delivery stays valid forever as far as
// this check is concerned, and nothing here can change that. Replay protection, if it is ever wanted,
// has to come from idempotency on the message id, NOT from this file.
//
// ⚠️ `X-Hub-Signature` (the older SHA-1 header) IS DELIBERATELY IGNORED. Meta still sends it alongside
// the SHA-256 one for compatibility. Accepting it would let a caller choose the weaker algorithm, which
// is the same downgrade-attack reasoning that makes the Stripe module discard every non-`v1` scheme.
import { createHmac, timingSafeEqual } from 'node:crypto'

/** Why a request was refused. A CLOSED union rather than free text, for the same reason as Stripe's:
 *  these strings are logged and are the first thing read when the endpoint starts refusing everything,
 *  so they must be greppable and stable. None is ever returned to the caller — see the routes. */
export type MetaSignatureFailureReason =
  | 'no_secret_configured'
  | 'missing_signature_header'
  | 'malformed_signature_header'
  | 'signature_mismatch'

export type MetaSignatureVerification =
  | { ok: true }
  | { ok: false; reason: MetaSignatureFailureReason }

/**
 * Parse the configured app secret(s).
 *
 * ⚠️ PLURAL, AND THE REASON IS DIFFERENT FROM STRIPE'S. Stripe needs a list because one URL receives
 * both live and test events and because rolling a secret keeps the old one valid for 24 hours. Meta
 * does neither of those. The reason here is that THE THREE PRODUCTS NEED NOT SHARE A META APP:
 * WhatsApp, Messenger and Instagram can each sit under a different app with a different secret, and a
 * single-secret implementation would verify one product and reject the other two as forged.
 * ✅ It also makes an app-secret reset a config change rather than a cutover.
 *
 * Comma-separated, whitespace tolerated, empties dropped. Order is irrelevant — every secret is tried.
 */
export function parseMetaAppSecrets(raw: string | undefined | null): string[] {
  if (!raw) return []
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

/** Constant-time hex comparison. Length is compared first and in variable time deliberately: both sides
 *  are fixed-width SHA-256 hex (64 chars), so the length carries no secret, and timingSafeEqual THROWS
 *  on a length mismatch rather than returning false. Copied from the Stripe module on purpose. */
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
  } catch {
    return false
  }
}

/**
 * Verify a Meta webhook signature.
 *
 * 🔴 `rawBody` MUST BE THE EXACT BYTES META SENT. Not a re-serialised object, not a parsed-then-
 * stringified copy. `JSON.stringify(JSON.parse(body))` is a DIFFERENT STRING — key order, whitespace,
 * unicode escaping and number formatting all drift — so the HMAC differs and verification fails 100% of
 * the time with a perfectly correct secret. That is the single most common way this check silently
 * fails, and it presents as "my app secret must be wrong". See the routes for how the raw body is
 * obtained, and note that all three previously called `req.json()` FIRST, which both consumes the
 * stream and discards the exact bytes.
 *
 * Pure: no I/O, no clock read, no throw. Every failure is a return value.
 */
export function verifyMetaSignature(input: {
  rawBody: string
  /** The `X-Hub-Signature-256` header, verbatim. The SHA-1 `X-Hub-Signature` must NOT be passed here. */
  signatureHeader: string | null | undefined
  secrets: string[]
}): MetaSignatureVerification {
  const { rawBody, signatureHeader, secrets } = input

  // 🔴 NO SECRET ⇒ REJECT. NOT "skip verification". An unset secret is a broken deployment, not a
  // permission to accept anything from anyone, and this endpoint spends money on two vendors per
  // request. The same decision the Stripe module makes, for the same reason, and it is the one place
  // this file could have been written to fail open — see the route logs, which name this case first.
  if (secrets.length === 0) return { ok: false, reason: 'no_secret_configured' }
  if (!signatureHeader) return { ok: false, reason: 'missing_signature_header' }

  // Meta's format is `sha256=<hex>`. Anything else is malformed — including a bare hex string with no
  // prefix, which is refused rather than guessed at.
  const [scheme, offered] = signatureHeader.split('=', 2)
  if (scheme !== 'sha256' || !offered) return { ok: false, reason: 'malformed_signature_header' }

  // Every configured secret is tried, and the loop runs to completion rather than short-circuiting.
  let matched = false
  for (const secret of secrets) {
    const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
    if (safeEqualHex(expected, offered)) matched = true
  }
  if (!matched) return { ok: false, reason: 'signature_mismatch' }

  return { ok: true }
}

/**
 * The one log line for a refusal, shared by all three routes so they cannot drift apart.
 *
 * 🔴 IT NAMES THE CAUSE rather than saying "unauthorised", because this is the artefact somebody reads
 * when the endpoint starts refusing everything:
 *   no_secret_configured       → META_APP_SECRET is missing in this environment. THE LOUD ONE.
 *   missing_signature_header   → something that is not Meta is POSTing here (a scanner, a probe).
 *   malformed_signature_header → a header that is not `sha256=<hex>`.
 *   signature_mismatch         → wrong app secret for this Meta app, or a genuine forgery.
 * ⚠️ `secretsConfigured` is a COUNT, never the values. `bodyBytes` distinguishes an empty probe from a
 * real payload without logging a single byte of an unverified body.
 */
export function metaRefusalLog(
  surface: 'meta-whatsapp' | 'messenger' | 'instagram',
  reason: MetaSignatureFailureReason,
  secretsConfigured: number,
  hasSignature: boolean,
  bodyBytes: number,
): string {
  return (
    `[webhook/${surface}] REFUSED reason=${reason} ` +
    `secretsConfigured=${secretsConfigured} hasSignature=${hasSignature} bodyBytes=${bodyBytes}`
  )
}
