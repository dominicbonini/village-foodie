// lib/contact-topics.ts — 🔴 THE CONTACT FORM'S TOPICS, EACH WITH A CODE ID (Language Phase 0,
// docs/language-phase-0-report.md §2).
//
// PURE. A link to /contact names its topic in the URL (`?topic=General%20Enquiry`), and app/contact passes it
// straight to the Tally form, which matches it against its own option list. So the VALUE is an external key —
// it must stay exactly as Tally knows it, in every language — and it is NOT the link's visible text (a footer
// may say "General Enquiry" or "Contact"; that wording is free to change and to be translated). Callers build
// links with `contactHref(id)`; nobody types a topic string into an href any more.

/** id → the value the Tally form matches. ⛔ Never shown, never translated, never reworded. */
export const CONTACT_TOPIC = {
  general: 'General Enquiry',
  addBusiness: 'Add Business',
  reportIssue: 'Report Issue',
  claimVenue: 'ClaimVenue',
  costComparison: 'Cost Comparison',
} as const

export type ContactTopicId = keyof typeof CONTACT_TOPIC

/** "/contact?topic=General%20Enquiry", plus any extra fields ("&truck=…") in the order given. */
export function contactHref(id: ContactTopicId, extra?: Record<string, string>): string {
  let href = `/contact?topic=${encodeURIComponent(CONTACT_TOPIC[id])}`
  for (const [k, v] of Object.entries(extra ?? {})) href += `&${k}=${encodeURIComponent(v)}`
  return href
}
