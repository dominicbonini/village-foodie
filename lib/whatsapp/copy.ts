// lib/whatsapp/copy.ts
// 🔴 THE WHATSAPP SETTINGS COPY AND ITS TWO LINKS, IN ONE PLACE. Meta's allowance is a NUMBER THAT WILL
// CHANGE and it appears in three sentences; a literal typed into markup is three places to miss.
// ⚠️ UK English. Straight apostrophes are fine in these strings — they are rendered through {' '} style
// expressions and JSX text where React escapes them, not as bare JSX apostrophes that the linter flags.

export const META_PRICING_URL = 'https://developers.facebook.com/docs/whatsapp/pricing'
export const WHATSAPP_MANAGER_URL = 'https://business.facebook.com/wa/manage/home/'

// ── 🔴 THE TWO DATES IN THE BILLING COPY. DECLARED, NEVER TYPED INTO A SENTENCE. ────────────────────
// They live HERE rather than beside META_FREE_REPLIES_PER_MONTH because they are COPY and nothing else:
// no branch reads them, no cap arithmetic uses them, and lib/whatsapp/reply-cap.ts documents itself as
// a pure decision module with no imports. The allowance NUMBER stays there because it is also the
// default the cap enforces; these two are only ever rendered.
// ⚠️ THEY APPEAR IN FOUR SENTENCES ACROSS TWO SURFACES (footnote 6 on the public pricing table, and the
// Settings billing summary and its expander). A literal typed into any one of them is a place to miss.

/**
 * 🔴 WHEN WE LAST CHECKED META'S PRICING PAGE. It is a claim about OUR diligence, not about Meta.
 * ⚠️ UPDATE IT ONLY WHEN SOMEBODY ACTUALLY RE-READS https://developers.facebook.com/docs/whatsapp/pricing.
 * Moving it forward without looking turns a verifiable statement into a false one, and it is printed on a
 * public pricing surface where "correct at <date>" is exactly the kind of sentence a buyer relies on.
 */
export const META_PRICING_CHECKED_ON = '16 September 2026'

/**
 * 🔴 WHEN META'S FREE ALLOWANCE BEGINS. From this date Meta charges per message for service messages —
 * the 24-hour customer-service window every auto-reply this platform sends falls inside — and includes
 * the first META_FREE_REPLIES_PER_MONTH per number each month.
 * ⚠️ THE COPY SAYS "From <this date>" AND NOT "currently", DELIBERATELY. "Currently includes" was true
 * of neither period: before the date the allowance had not started, and after it the word ages badly on
 * a page nobody re-reads. A date is checkable; "currently" is not.
 * 🔴 THIS IS THE SAME 1 October 2026 THAT lib/whatsapp/reply-cap.ts's header gives as the reason the cap
 * exists at all. If Meta moves it, both move.
 */
export const META_FREE_ALLOWANCE_FROM = '1 October 2026'

/** Formats 1000 → "1,000". One formatter so the select, the usage line and the copy agree. */
export const formatLimit = (n: number): string => n.toLocaleString('en-GB')

/** "2026-10-01" → "1 October". ⚠️ Day and month only: the year is noise on a date weeks away. */
export function formatResetDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  if (!y || !m || !d) return isoDate
  // Built from the parts, NOT `new Date(iso)` — that parses as UTC and can render the previous day.
  return `${d} ${['January','February','March','April','May','June','July','August','September','October','November','December'][m - 1]}`
}
