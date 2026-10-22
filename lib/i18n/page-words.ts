// lib/i18n/page-words.ts — 🔴 THE WORDS A SERVER-RENDERED PAGE HANDS ITS BROWSER, FOR A NON-ENGLISH LANGUAGE (languages-1,
// 22 October 2026, docs/languages-1-report.md §1).
//
// A non-English language is not in any bundle (lib/i18n/registry.ts): the browser fetches it only when a page is in that
// language. A page the SERVER renders (marketing, the public truck page) must hydrate with the same words, so it passes them
// — only its client components' namespaces (lib/i18n/namespaces.ts `marketing` / `truckPage`), only in its language — as
// <PageLocale seed> / <TruckClient seed>. For an English locale this returns NO prop at all, so those pages' payloads are
// exactly as before.
// ⚠️ The catalog modules are imported HERE because a server component and a client component do not share module instances:
// the server half must register the words itself before it can hand them over.
import '@/lib/i18n/catalog/compare'
import '@/lib/i18n/catalog/demoUpload'
import '@/lib/i18n/catalog/errorsOnboarding'
import '@/lib/i18n/catalog/landingNav'
import '@/lib/i18n/catalog/planFeatures'
import '@/lib/i18n/catalog/planTable'
import '@/lib/i18n/catalog/provisionContent'
import '@/lib/i18n/catalog/eventCard'
import '@/lib/i18n/catalog/siteFooter'
import '@/lib/i18n/catalog/truckPage'
import '@/lib/i18n/catalog/embed'
import { NAMESPACES } from './namespaces'
import { isLanguageBase } from './locales'
import { languageWords } from './registry'
import type { LanguageSeed } from './page-locale'

/** `{ seed }` for a non-English page of this kind, `{}` otherwise — spread into the client root's props. */
export function pageSeedProps(locale: string | null | undefined, page: 'marketing' | 'truckPage' | 'embed'): { seed?: LanguageSeed } {
  if (!isLanguageBase(locale)) return {}
  return { seed: languageWords(locale, NAMESPACES[page]) }
}
