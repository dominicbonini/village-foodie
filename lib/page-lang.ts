// lib/page-lang.ts — seo-fixes S4 (20 October 2026, docs/seo-fixes-report.md): the request header proxy.ts sets with the
// page's language, read by app/layout.tsx for <html lang>. Pure and edge-safe.
import { isEnglish } from '@/lib/i18n/locales'

export const PAGE_LANG_HEADER = 'x-hg-page-lang'

/** The <html lang> for a request: the proxy's header when it is a well-formed language tag (en-GB, en-US), else "en". */
export function htmlLangOf(header: string | null | undefined): string {
  return header && /^[a-z]{2}(-[A-Z]{2})?$/.test(header) ? header : 'en'
}

/** languages-1 (22 October 2026): the <html lang> for a locale a page learned in the browser (a non-English truck's) — the
 *  tag itself when well formed (fr-FR, de-AT), else "en". */
export function htmlLangOfLocale(locale: string | null | undefined): string {
  return htmlLangOf(locale)
}

/** languages-1: ` lang="fr-FR"` for a document (an email, the plans PDF) in a non-English locale, and nothing for English —
 *  so every English document is byte-identical to before. */
export function langAttrOf(locale: string | null | undefined): string {
  return locale && !isEnglish(locale) ? ` lang="${htmlLangOf(locale)}"` : ''
}
