// lib/copy/scheduleVerify.ts
// The messages the "Verify" button on the schedule URL can produce, and the one malformed-address
// sentence two of them share.
//
// ── 🔴 WHY THIS LEFT app/manage/[token]/page.tsx (4 October 2026) ────────────────────────────────
// The "Your schedule" card moved into a Schedule settings MODAL, in its own file — so the card and
// these messages ended up on opposite sides of a file boundary. They were module-scope constants in
// page.tsx with a comment calling them "the one shared definition at module scope"; a route file is
// not a place to import copy from, so they moved here rather than being exported from there.
//
// ⚠️ THE WORDING IS UNCHANGED, DELIBERATELY. The move was asked for; a rewrite was not. The five
// reasons below are distinct on purpose, and the comment that explains why travelled with them.
//
//   malformed   — nothing was fetched. The address never parsed, so blaming the network is a lie.
//   unreachable — a real fetch failed: DNS, connection, certificate.
//   blocked     — the site answered and refused us.
//   no_content  — we loaded it and got nothing readable.
//   no_events   — we read it fine; the thing we were looking for was not on it.

// ── 🔴 LANGUAGE PHASE 1d: THE WORDS ARE IN MESSAGES (`manageScheduleVerify`, one key per code below) ─────────
// A screen reads that namespace and shows `t(verifyCode(reason))`, and `t('blockedDomain')` for the one
// address refused before trying. The GB words are the sentences below with curly apostrophes (named fixes); the
// US says yourtruck.com.
// ⛔ THE ENGLISH CONSTANTS (URL_MALFORMED_MSG, VERIFY_MESSAGES, BLOCKED_DOMAIN_MSG) ARE GONE: their last readers,
// the setup wizard and Manage › Settings, read the namespace by code now (Language Phase 1d).

/** The reasons the verify route can give, each a key in `manageScheduleVerify`. */
export const VERIFY_CODES = ['malformed', 'launch_failed', 'blocked', 'unreachable', 'no_content', 'no_events'] as const
export type VerifyCode = typeof VERIFY_CODES[number]

/** The route's `reason`, as a message key. Anything unknown reads as `unreachable`, as `VERIFY_MESSAGES` always did. */
export function verifyCode(reason: unknown): VerifyCode {
  return (VERIFY_CODES as readonly unknown[]).includes(reason) ? reason as VerifyCode : 'unreachable'
}
