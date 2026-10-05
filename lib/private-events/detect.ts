// lib/private-events/detect.ts — "does this found event's text say it is private?"
//
// 🔴 PURE, AND DELIBERATELY TINY. The scraper, the inbound-schedule processor and the approval queue
// all have to answer the same question about the same text, and the answer must be identical in all
// three — so it is one function with no database, no clock and no network.
//
// ⚠️ THE SCRAPER IS NEVER RUN AGAINST PRODUCTION TO TEST THIS. scripts/private-events.cjs feeds this
// function FIXTURE strings, which is the whole reason the decision lives here rather than inside the
// scraper's loop: a detection rule you cannot test without a live site is a detection rule nobody
// tests.

/**
 * ⛔ ONE WORD, WHOLE, CASE-INSENSITIVE — AND THAT IS THE ENTIRE RULE (decision 9).
 *
 * `\b` on both sides, so:
 *   • "Private Hire", "private event", "PRIVATE PARTY", "Event — private" → private
 *   • "Privateer Brewery", "privately", "Privates" → NOT private
 *
 * 🔴 "WEDDING" IS NOT IN HERE, BY DECISION, AND THAT IS NOT AN OVERSIGHT. A wedding fair is a public
 * event a truck very much wants on the map, and a scraper that hid it would be hiding trade. The cost
 * of a miss is one tick in the approval queue; the cost of a false positive is a public event that
 * silently never appears. So the rule is the narrowest one that catches what Gusto's page actually
 * says, and the operator makes every other call.
 *
 * ⚠️ UNICODE-AWARE `\b` IS NOT NEEDED AND NOT USED. The word is ASCII and the surrounding text may be
 * anything; JavaScript's `\b` is an ASCII word boundary, which is exactly right for this needle —
 * "Private" preceded by an em dash or a bracket still matches.
 */
const PRIVATE_WORD = /\bprivate\b/i

/**
 * True when ANY of the supplied strings contains the whole word "private".
 *
 * Pass the venue name, the title and the notes — decision 9 names those three fields. Nulls and blanks
 * are ignored, so a caller may hand over whatever it has.
 */
export function looksPrivate(...texts: (string | null | undefined)[]): boolean {
  for (const t of texts) {
    if (typeof t === 'string' && PRIVATE_WORD.test(t)) return true
  }
  return false
}

/** The regexp itself, exported for the one harness that proves the word-boundary behaviour. */
export const PRIVATE_WORD_RE = PRIVATE_WORD
