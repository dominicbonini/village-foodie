// lib/whatsapp/copy.ts
// 🔴 THE WHATSAPP SETTINGS COPY AND ITS TWO LINKS, IN ONE PLACE. Meta's allowance is a NUMBER THAT WILL
// CHANGE and it appears in three sentences; a literal typed into markup is three places to miss.
// ⚠️ UK English. Straight apostrophes are fine in these strings — they are rendered through {' '} style
// expressions and JSX text where React escapes them, not as bare JSX apostrophes that the linter flags.

export const META_PRICING_URL = 'https://developers.facebook.com/docs/whatsapp/pricing'
export const WHATSAPP_MANAGER_URL = 'https://business.facebook.com/wa/manage/home/'

/** Formats 1000 → "1,000". One formatter so the select, the usage line and the copy agree. */
export const formatLimit = (n: number): string => n.toLocaleString('en-GB')

/** "2026-10-01" → "1 October". ⚠️ Day and month only: the year is noise on a date weeks away. */
export function formatResetDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  if (!y || !m || !d) return isoDate
  // Built from the parts, NOT `new Date(iso)` — that parses as UTC and can render the previous day.
  return `${d} ${['January','February','March','April','May','June','July','August','September','October','November','December'][m - 1]}`
}
