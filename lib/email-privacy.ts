// lib/email-privacy.ts — the privacy-policy link in a customer email's footer, beside "Powered by HatchGrab" (legal
// follow-ups, 19 October 2026; docs/legal-follow-ups-report.md). ONE place for the address and its words, used by every
// customer email that carries that footer: lib/email.ts (confirmation and "ready", cancellation, event cancellation,
// refund), lib/orders/reject-order.ts and the operator-cancel email in app/api/dashboard/action. The words are
// `emailCustomer.common.privacyLink` / `common.privacyText`.
import { HATCHGRAB_ORIGIN } from '@/lib/marketing-country'
import { PRIVACY_PATH, legalUrl } from '@/lib/legal'
import { translatorLocale } from '@/lib/i18n/translator'

/** The privacy policy's absolute address (an email has no page to be relative to). */
export const PRIVACY_URL = `${HATCHGRAB_ORIGIN}${PRIVACY_PATH}`

type EmailT = (key: never, values?: never) => string
const call = (t: EmailT, key: string, values?: Record<string, string>) => (t as unknown as (k: string, v?: Record<string, string>) => string)(key, values)

/** legal-languages-1 (1 November 2026): the policy in the email's own language — the translator's locale (lib/i18n/translator.ts
 *  translatorLocale): /fr/privacy for a French email, the English PRIVACY_URL for an English one, exactly as before. */
const urlFor = (t: EmailT) => legalUrl('privacy', { locale: translatorLocale(t) })

/** " · Privacy" as a link — appended inside the footer paragraph that holds "Powered by HatchGrab". */
export function privacyFooterHtml(t: EmailT, style = 'color:inherit;text-decoration:underline'): string {
  return ` · <a href="${urlFor(t)}" style="${style}">${call(t, 'common.privacyLink')}</a>`
}

/** "Privacy: https://www.hatchgrab.com/privacy" — the plain-text footer's line. */
export function privacyFooterText(t: EmailT): string {
  return call(t, 'common.privacyText', { url: urlFor(t) })
}
