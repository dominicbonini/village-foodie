// lib/i18n/translator.ts — 🔴 THE ONE HELPER FOR CODE WITH NO REQUEST AND NO REACT (Language Phase 0).
// ⚠️ Since Language Phase 1b it reads ONE namespace from lib/i18n/registry.ts: the calling file imports that
// namespace's catalog module (`import '@/lib/i18n/catalog/<namespace>'`), so a client bundle that builds a ticket
// or a charge line carries only those words (docs/language-phase-1b-report.md Part 1).
//
// Emails, PDFs, API responses, tickets and crons ask `translatorFor(locale, namespace)` for a translator in the
// resolved locale (lib/i18n/locales.ts): the truck's country's for its own and its customers' text, the visitor's
// for marketing. CLIENT-SAFE (a ticket is built in the browser). Server components use next-intl's
// `getTranslations({ locale, namespace })` instead (lib/i18n/request.ts); client components use `useT`
// (lib/i18n/use-t.ts).
// ⚠️ Dates, times, numbers and money are NEVER formatted by a message: they go through lib/time-utils.ts and
// lib/money-format.ts and are passed in as ready-made strings.
import { createTranslator, type Messages, type NamespaceKeys, type NestedKeyOf } from 'next-intl'
import { resolveLocale } from './locales'
import { messagesOf } from './registry'

export type AppNamespace = NamespaceKeys<Messages, NestedKeyOf<Messages>>

export function translatorFor<NS extends AppNamespace>(locale: string | null | undefined, namespace: NS) {
  const l = resolveLocale(locale)
  return createTranslator({ locale: l, messages: messagesOf(l, [namespace.split('.')[0]]), namespace })
}
