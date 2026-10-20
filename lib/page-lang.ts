// lib/page-lang.ts — seo-fixes S4 (20 October 2026, docs/seo-fixes-report.md): the request header proxy.ts sets with the
// page's language, read by app/layout.tsx for <html lang>. Pure and edge-safe.
export const PAGE_LANG_HEADER = 'x-hg-page-lang'

/** The <html lang> for a request: the proxy's header when it is a well-formed language tag (en-GB, en-US), else "en". */
export function htmlLangOf(header: string | null | undefined): string {
  return header && /^[a-z]{2}(-[A-Z]{2})?$/.test(header) ? header : 'en'
}
