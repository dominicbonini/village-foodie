// lib/i18n/intl-locale.ts — THE ONE MAPPING from an app locale to the tag Intl formats DATES with (pricing-copy-3, 11 November 2026;
// docs/pricing-copy-3-report.md).
//
// Serbian is written in LATIN script in this app (messages/sr-RS.json, content/legal/sr-RS/ — languages-world-1, 92cb875b), but Intl's
// default script for Serbian is CYRILLIC: `sr-RS` formats 4 November 2026 as "4. новембар 2026.", "среда", "сутра". Every date, month,
// weekday and relative-day name is therefore formatted with `sr-Latn-RS` instead ("4. novembar 2026.", "sreda", "sutra"), so the dates
// match the text around them — on the legal pages, in Manage, in emails and on receipts. Any Serbian tag with no script subtag gets the
// Latin script (sr → sr-Latn, sr-RS → sr-Latn-RS); a tag that names its script keeps it; every other locale is returned unchanged.
// The function itself lives in lib/time-utils.ts, which must stay import-free (the engine harnesses compile it alone); this module is
// the name everything else imports. ⚠️ Use it wherever Intl formats a DATE for a locale that can be a truck's or a reader's
// (DateTimeFormat, toLocaleDateString, toLocaleString with date parts, RelativeTimeFormat). Numbers are not affected.
export { intlDateLocale } from '@/lib/time-utils'
