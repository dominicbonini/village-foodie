'use client'
// lib/i18n/page-locale.tsx — THE LOCALE OF A PAGE WHOSE LANGUAGE THE SERVER ALREADY KNOWS (Language Phase 1e).
// The marketing pages (/landing, /features, /compare and their /uk, /us addresses) resolve the visitor's country on the
// server; their client components (the country menu, the demo modal and its CTAs) read words with `useT`, which with
// no provider is en-GB. This wraps the page's tree and sets that locale for everything below it. Every locale's words
// are in the bundle (lib/i18n/registry.ts), so the first browser render matches the server's.
// It is not lib/i18n/client.tsx's provider: the locale is fixed by the page (no switching, no next-intl provider).
// languages-1 (22 October 2026): a NON-ENGLISH language is not in the bundle (lib/i18n/registry.ts), so the server passes the
// words its client components read as `seed` (lib/i18n/page-words.ts pageSeed) and they are registered before the first
// browser render — which therefore matches the server's. English pages pass no seed and are exactly as before.
import { useMemo, type ReactNode } from 'react'
import { DEFAULT_LOCALE, type AppLocale } from './locales'
import { I18nContext } from './use-t'
import { seedLanguage } from './registry'

export type LanguageSeed = Record<string, Record<string, unknown>>

export function PageLocale({ locale, seed, children }: { locale: AppLocale | null | undefined; seed?: LanguageSeed; children: ReactNode }) {
  if (seed) for (const [l, words] of Object.entries(seed)) seedLanguage(l, words)
  const value = useMemo(() => ({ locale: locale ?? DEFAULT_LOCALE, setLocale: () => {} }), [locale])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
