// lib/i18n/request.ts — next-intl's request configuration (Language Phase 0). NO URL ROUTING: nothing in a URL
// names a language. A server component asks `getTranslations({ locale, namespace })` with the locale it resolved
// (the truck's country's, or the visitor's); asked with none, it is en-GB. Registered in next.config.ts.
import { getRequestConfig } from 'next-intl/server'
import { resolveLocale } from './locales'
import { messagesFor } from './messages'

export default getRequestConfig(async ({ locale }) => {
  const l = resolveLocale(locale)
  return { locale: l, messages: messagesFor(l) }
})
