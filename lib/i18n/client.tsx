'use client'
// lib/i18n/client.tsx — 🔴 THE PROVIDER (Language Phase 0, docs/language-phase-0-report.md §1), and the client
// hooks re-exported from lib/i18n/use-t.ts, where components import them from since Language Phase 1b.
//
// `I18nProvider` sits in the order, confirmation/status, dashboard, KDS, Manage and setup LAYOUTS, beside each
// page's existing country settings. It starts in en-GB and switches to the truck's country's locale when the page
// learns it (`useTruckLocale`) — before that the page is loading and shows no truck text. It renders next-intl's
// NextIntlClientProvider with ONLY the namespaces that surface needs (lib/i18n/namespaces.ts) — those of them the
// page's own files have loaded (lib/i18n/registry.ts).
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { NextIntlClientProvider } from 'next-intl'
import { DEFAULT_LOCALE, resolveLocale, isLanguageBase, type AppLocale } from './locales'
import { messagesOf, ensureLanguage, subscribe, registryVersion } from './registry'
import { htmlLangOfLocale } from '@/lib/page-lang'
import { I18nContext } from './use-t'
import type { AppNamespace } from './translator'

export { useT, useTruckLocale, useAppLocale } from './use-t'

export function I18nProvider({ namespaces, children }: { namespaces: readonly AppNamespace[]; children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(DEFAULT_LOCALE)
  const version = useSyncExternalStore(subscribe, registryVersion, registryVersion)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` is the registry's change signal (languages-1)
  const messages = useMemo(() => messagesOf(locale, namespaces), [locale, namespaces, version])
  // languages-1: a non-English language is fetched FIRST (its words are not in the bundle — lib/i18n/registry.ts), then the
  // screen switches, so it never shows half one language and half the other. An English locale switches at once, as before.
  const setLocale = useCallback((tag: string | null | undefined) => {
    const l = resolveLocale(tag)
    if (!isLanguageBase(l)) { setLocaleState(l); return }
    void ensureLanguage(l).then(() => setLocaleState(l))
  }, [])
  // languages-1: <html lang> follows a non-English truck's language once it is known (the server rendered "en" before it
  // knew the truck). English pages keep the server's value, exactly as before.
  useEffect(() => {
    if (isLanguageBase(locale) && typeof document !== 'undefined') document.documentElement.lang = htmlLangOfLocale(locale)
  }, [locale])
  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale])
  return (
    <I18nContext.Provider value={value}>
      <NextIntlClientProvider locale={locale} messages={messages}>{children}</NextIntlClientProvider>
    </I18nContext.Provider>
  )
}
