'use client'
// lib/i18n/client.tsx — 🔴 THE PROVIDER (Language Phase 0, docs/language-phase-0-report.md §1), and the client
// hooks re-exported from lib/i18n/use-t.ts, where components import them from since Language Phase 1b.
//
// `I18nProvider` sits in the order, confirmation/status, dashboard, KDS, Manage and setup LAYOUTS, beside each
// page's existing country settings. It starts in en-GB and switches to the truck's country's locale when the page
// learns it (`useTruckLocale`) — before that the page is loading and shows no truck text. It renders next-intl's
// NextIntlClientProvider with ONLY the namespaces that surface needs (lib/i18n/namespaces.ts) — those of them the
// page's own files have loaded (lib/i18n/registry.ts).
// ⚠️ LANGUAGE PHASE 1e PART C: the browser loads a locale's overrides only when it is used. The provider switches
// AFTER `ensureLocale` has loaded them for every namespace on the page, so a US truck's screen goes from en-GB
// straight to en-US — never a mix (the brief en-GB moment before the switch is the existing behaviour). If a chunk
// fails to load it switches anyway and those namespaces read their en-GB base, useT's fallback; `version` re-renders
// every translator if overrides arrive later (a namespace registered after the switch).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { NextIntlClientProvider } from 'next-intl'
import { DEFAULT_LOCALE, resolveLocale, type AppLocale } from './locales'
import { ensureLocale, isLocaleLoaded, messagesOf, subscribeWords, wordsVersion } from './registry'
import { I18nContext } from './use-t'
import type { AppNamespace } from './translator'

export { useT, useTruckLocale, useAppLocale, useSeedWords, useLoadedLocale } from './use-t'

export function I18nProvider({ namespaces, children }: { namespaces: readonly AppNamespace[]; children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(DEFAULT_LOCALE)
  const [version, setVersion] = useState(0)
  const wanted = useRef<AppLocale>(DEFAULT_LOCALE)
  useEffect(() => subscribeWords(() => setVersion(wordsVersion())), [])
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `version`: new words for the same locale
  const messages = useMemo(() => messagesOf(locale, namespaces), [locale, namespaces, version])
  const setLocale = useCallback((tag: string | null | undefined) => {
    const l = resolveLocale(tag)
    wanted.current = l
    if (isLocaleLoaded(l)) { setLocaleState(l); return }
    const go = () => { if (wanted.current === l) setLocaleState(l) }
    ensureLocale(l).then(go, go)
  }, [])
  const value = useMemo(() => ({ locale, setLocale, version }), [locale, setLocale, version])
  return (
    <I18nContext.Provider value={value}>
      <NextIntlClientProvider locale={locale} messages={messages}>{children}</NextIntlClientProvider>
    </I18nContext.Provider>
  )
}
