// lib/phone-message.ts — the phone box's refusal, in words (Language Phase 1a's `phone` messages; moved out of
// lib/phone.ts in Phase 1b so the pages that only CHECK a number carry no messages).
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/phone'
import type { PhoneCopy } from '@/lib/phone'

/**
 * The refusal, in each surface's own words with the country's name and example filled in. GB reads exactly
 * as each message did before Phase 2C:
 *   'mobile'       (order form)       "Please enter a valid UK mobile (e.g. 07700 900123)"
 *   'phone'        (Manage contact)   "Please enter a valid UK phone (e.g. 07700 900123)"
 *   'phone_number' (signup, setup API) "Enter a valid UK phone number (e.g. 07700 900123)."
 * Without a short name or example (a country whose row lacks them) the sentence drops that part rather
 * than inventing one.
 */
export function phoneErrorMessage(kind: 'mobile' | 'phone' | 'phone_number', copy: PhoneCopy | null | undefined, locale?: string | null): string {
  // The words: messages/en-GB.json `phone` (Language Phase 1a) — one whole sentence per kind, with and without
  // the country's name and example.
  const values = {
    withName: copy?.short_name ? 'yes' : 'no', name: copy?.short_name ?? '',
    withExample: copy?.phone_example ? 'yes' : 'no', example: copy?.phone_example ?? '',
  }
  const t = translatorFor(locale, 'phone')
  return t(kind === 'mobile' ? 'invalidMobile' : kind === 'phone' ? 'invalidPhone' : 'invalidPhoneNumber', values)
}

