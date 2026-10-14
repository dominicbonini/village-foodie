// lib/i18n/translator.ts — 🔴 THE ONE HELPER FOR CODE WITH NO REQUEST AND NO REACT (Language Phase 0).
//
// Emails, PDFs, API responses, tickets and crons ask `translatorFor(locale, namespace)` for a translator in the
// resolved locale (lib/i18n/locales.ts): the truck's country's for its own and its customers' text, the visitor's
// for marketing. CLIENT-SAFE (a ticket is built in the browser). Server components use next-intl's
// `getTranslations({ locale, namespace })` instead (lib/i18n/request.ts); client components use `useT`
// (lib/i18n/client.tsx).
// ⚠️ Dates, times, numbers and money are NEVER formatted by a message: they go through lib/time-utils.ts and
// lib/money-format.ts and are passed in as ready-made strings.
import { createTranslator, type Messages, type NamespaceKeys, type NestedKeyOf } from 'next-intl'
import { resolveLocale } from './locales'
import { messagesFor } from './messages'

export type AppNamespace = NamespaceKeys<Messages, NestedKeyOf<Messages>>

export function translatorFor<NS extends AppNamespace>(locale: string | null | undefined, namespace: NS) {
  const l = resolveLocale(locale)
  return createTranslator({ locale: l, messages: messagesFor(l), namespace })
}
