// lib/i18n/auth-locale.tsx — legal-languages-1 (1 November 2026): THE ACCOUNT PAGES' LANGUAGE (signup, login, forgot / reset
// password). No truck is known on them, so proxy.ts decides it — the language an email link asked for (?lang=), else the
// visitor's country's — and hands it over in the page-language header. This server wrapper sets it for the page's client
// components (<PageLocale>, its words seeded so the first browser render matches the server's). An English language, or no
// header, renders the page exactly as before: no wrapper at all.
import 'server-only'
import { headers } from 'next/headers'
import { PAGE_LANG_HEADER } from '@/lib/page-lang'
import { PageLocale } from '@/lib/i18n/page-locale'
import { pageSeedProps } from '@/lib/i18n/page-words'
import { isEnglish, resolveLocale } from '@/lib/i18n/locales'

export async function AuthLocale({ children }: { children: React.ReactNode }) {
  const tag = (await headers()).get(PAGE_LANG_HEADER)
  if (!tag || isEnglish(tag)) return <>{children}</>
  const locale = resolveLocale(tag)
  return <PageLocale locale={locale} {...pageSeedProps(locale, 'auth')}>{children}</PageLocale>
}
