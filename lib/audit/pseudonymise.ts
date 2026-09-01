// lib/audit/pseudonymise.ts
//
// ── AN IDENTIFIER YOU CAN COUNT BUT NOT READ ─────────────────────────────────────────────────────
//
// 🔴 WHY THIS EXISTS. `action_audit_log` has NO foreign keys, nothing sweeps it, and the anonymisation
// pass nulls named COLUMNS on `orders` — it cannot reach inside a JSONB blob. lib/audit/actionAudit.ts
// states the consequence plainly: anything personal written into before_state/after_state is retained
// INDEFINITELY and would outlive the erasure the privacy policy promises. It also records a live check
// on 6 August 2026 finding no email-shaped string anywhere in the table.
//
// `domain_send_instructions` needs the OPPOSITE of readability and the SAME clustering: to see that one
// inbox received forty sends, you do not need to know which inbox. A stable pseudonym gives the count
// and withholds the address. Brevo holds the address itself, and the send limit is three per truck per
// day, so the trail there is short and bounded.
//
// ── WHY HMAC AND NOT A BARE SHA-256 ─────────────────────────────────────────────────────────────
// 🔴 AN EMAIL ADDRESS IS LOW-ENTROPY. An unkeyed digest is not a pseudonym — anyone holding the table
// and a candidate list confirms a guess in one hash. A keyed MAC makes the digest useless without the
// key, so the row survives as a COUNTER rather than as a lookup.
//
// ⚠️ ON THE KEY. `AUDIT_HASH_SECRET` if set; otherwise SUPABASE_SERVICE_ROLE_KEY, which this route
// cannot run without, so there is NO unset-variable failure mode and no silent downgrade to unkeyed.
// Reusing it is deliberate and bounded: the digest is never exposed to a caller, there is no verification
// oracle, and anyone holding that key already holds the database this table lives in — so it grants an
// attacker nothing they did not already have. ⚠️ SET `AUDIT_HASH_SECRET` ANYWAY before this ships; one
// secret per purpose is the rule, and rotating the service-role key would silently re-pseudonymise every
// future row (old and new rows for one address would stop clustering).
//
// ⚠️ TRUNCATED TO 32 HEX CHARACTERS — 128 bits. Collision-free at any volume this table will ever see,
// and it keeps the row readable as an identifier at a glance. Truncation does not weaken the preimage
// resistance that matters here; the key does that work.
import { createHmac } from 'node:crypto'

/**
 * A stable, keyed pseudonym for an email address.
 *
 * 🔴 NORMALISED BEFORE HASHING, AND THAT IS LOAD-BEARING FOR THE WHOLE POINT OF THIS FUNCTION.
 * `Web@Agency.co.uk` and ` web@agency.co.uk ` are one inbox. Hashing them unnormalised produces two
 * different pseudonyms, the cluster splits, and forty sends to one person read as forty sends to forty
 * people — which is exactly the signal this is meant to preserve.
 * ⚠️ Case-folding the LOCAL part is not universally correct per RFC 5321, but it is correct for every
 * mail provider in practice, and under-clustering is the failure that matters here.
 */
export function pseudonymiseEmail(address: string): string {
  const secret = process.env.AUDIT_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  return createHmac('sha256', secret).update(address.trim().toLowerCase(), 'utf8').digest('hex').slice(0, 32)
}
