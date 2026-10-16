'use client'
// lib/i18n/locale-words.tsx — 🔴 THE CLIENT BOUNDARY FOR A PAGE WHOSE LOCALE THE SERVER ALREADY KNOWS (Language Phase 1e
// Part C). The marketing pages (/landing, /features, /compare and their /uk, /us addresses) resolve the visitor's
// country on the server; their client components (the country menu, the demo modal and its CTAs) read words with
// `useT`, which with no provider is en-GB. This wraps the page's tree: it sets that locale for everything below it
// and registers the locale's overrides (`words`, from lib/i18n/server-words.ts — null for en-GB) BEFORE any child
// renders, so the first browser render matches the server's and a US page hydrates in US words.
// It is not lib/i18n/client.tsx's provider: the locale is fixed by the page (no switching, no next-intl provider).
// scripts/messages-split.cjs proves the page's NAMESPACES entry covers every namespace its client components read.
import { useMemo, type ReactNode } from 'react'
import { DEFAULT_LOCALE, type AppLocale } from './locales'
import type { SeedWords } from './registry'
import { I18nContext, useSeedWords } from './use-t'

export function LocaleWords({ locale, words, children }: { locale: AppLocale | null | undefined; words: SeedWords | null; children: ReactNode }) {
  useSeedWords(words)
  const value = useMemo(() => ({ locale: locale ?? DEFAULT_LOCALE, setLocale: () => {} }), [locale])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
