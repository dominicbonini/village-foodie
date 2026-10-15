'use client'
// lib/i18n/client.tsx — 🔴 THE PROVIDER AND THE ONE CLIENT HOOK (Language Phase 0, docs/language-phase-0-report.md §1).
//
// `I18nProvider` sits in the order, confirmation/status, dashboard, KDS, Manage and setup LAYOUTS, beside each
// page's existing country settings. It starts in en-GB and switches to the truck's country's locale when the page
// learns it (`useTruckLocale`) — before that the page is loading and shows no truck text. It renders next-intl's
// NextIntlClientProvider with ONLY the namespaces that surface needs (lib/i18n/namespaces.ts).
//
// 🔴 CLIENT COMPONENTS ASK `useT(namespace)`, NOT next-intl's `useTranslations`, FOR ONE REASON: a component
// rendered with no provider above it — a shared control on a page that has none, or a harness rendering it alone —
// gets en-GB, the agreed fallback, instead of throwing. Same messages, same ICU, same typed keys.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { NextIntlClientProvider, createTranslator, type Messages } from 'next-intl'
import { DEFAULT_LOCALE, resolveLocale, type AppLocale } from './locales'
import { BASE_MESSAGES, messagesFor, pickNamespaces } from './messages'
import type { AppNamespace } from './translator'

interface I18nState { locale: AppLocale; messages: Messages; setLocale: (tag: string | null | undefined) => void }
const I18nContext = createContext<I18nState>({ locale: DEFAULT_LOCALE, messages: BASE_MESSAGES, setLocale: () => {} })

export function I18nProvider({ namespaces, children }: { namespaces: readonly AppNamespace[]; children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(DEFAULT_LOCALE)
  const messages = useMemo(() => pickNamespaces(messagesFor(locale), namespaces), [locale, namespaces])
  const setLocale = useCallback((tag: string | null | undefined) => setLocaleState(resolveLocale(tag)), [])
  const value = useMemo(() => ({ locale, messages, setLocale }), [locale, messages, setLocale])
  return (
    <I18nContext.Provider value={value}>
      <NextIntlClientProvider locale={locale} messages={messages}>{children}</NextIntlClientProvider>
    </I18nContext.Provider>
  )
}

/** A page tells its layout's provider the truck's locale (its country's `locale`) once it has loaded it. */
export function useTruckLocale(tag: string | null | undefined): void {
  const { setLocale } = useContext(I18nContext)
  useEffect(() => { setLocale(tag) }, [setLocale, tag])
}

/** The provider's locale (en-GB with no provider) — for a shared library function that takes a locale. */
export function useAppLocale(): AppLocale {
  return useContext(I18nContext).locale
}

/** The translator for a namespace, in the provider's locale — or en-GB when there is no provider.
 *  ⚠️ A NAMESPACE THE PROVIDER DOES NOT SEND (Language Phase 1a): a shared control rendered under another
 *  surface's provider — the deals picker or a stock badge on the dashboard — reads the full catalogue for the
 *  provider's locale instead of printing its keys. Both message files are already in every client bundle
 *  (lib/i18n/messages.ts imports them), so this costs nothing; NAMESPACES still names what each surface reads. */
export function useT<NS extends AppNamespace>(namespace: NS) {
  const { locale, messages } = useContext(I18nContext)
  const root = namespace.split('.')[0]
  const source = root in (messages as Record<string, unknown>) ? messages : messagesFor(locale)
  return useMemo(() => createTranslator({ locale, messages: source, namespace }), [locale, source, namespace])
}
