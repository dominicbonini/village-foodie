// lib/stripe-locale.ts — legal-languages-1 (1 November 2026): THE LANGUAGE STRIPE'S OWN SCREENS SPEAK on a page in a language
// other than English — the order page's card form (Payment Element) and Manage › Payments' embedded Connect onboarding — so
// they match the page around them. Stripe's codes (docs.stripe.com/js/appendix/supported_locales): the language, except
// Brazilian Portuguese (pt-BR), Hong Kong Chinese (zh-HK) and Latin-American Spanish (es-419, for Mexico).
// ⛔ ENGLISH RETURNS NOTHING: an English page leaves Stripe on its default ('auto', the browser's language), exactly as before.
import { isEnglish, languageOf } from '@/lib/i18n/locales'

const OWN: Readonly<Record<string, string>> = { 'pt-BR': 'pt-BR', 'zh-HK': 'zh-HK', 'es-MX': 'es-419', 'nb-NO': 'nb' }

export function stripeLocaleOf(locale: string | null | undefined): string | undefined {
  if (!locale || isEnglish(locale)) return undefined
  return OWN[locale] ?? languageOf(locale)
}
