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

export const URL_MALFORMED_MSG = "That doesn't look like a web address. Try something like yourtruck.co.uk/events"

export const VERIFY_MESSAGES: Record<string, string> = {
  malformed:     URL_MALFORMED_MSG,
  launch_failed: "Verification is temporarily unavailable. Please try again in a moment.",
  blocked:       "We couldn't access this site — it may be blocking automated checks. Try the page that lists your schedule, or add events manually.",
  unreachable:   "We couldn't reach this website. It may be down, or the address may be wrong.",
  no_content:    "We reached this page but couldn't read anything on it. Check it's publicly accessible.",
  no_events:     "We couldn't find any upcoming events on this page. Make sure the URL points directly to where your schedule is listed.",
}

/**
 * The one address we refuse before trying.
 *
 * ⚠️ IT EXISTED TWICE IN page.tsx AND STILL DOES ONCE: `SCHED_BLOCKED_DOMAIN_MSG` in the setup wizard
 * (line ~3449) is the same sentence under another name. Only the Settings copy moved here, because
 * only the Settings card moved — unifying the wizard's is a separate change with its own blast radius,
 * and is named in docs/manage-moves-2-report.md rather than done quietly.
 */
export const BLOCKED_DOMAIN_MSG = "Please use your website URL — Facebook and Instagram pages can't be scraped automatically."
