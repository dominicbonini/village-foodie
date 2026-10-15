'use client'
// lib/i18n/use-t.ts — 🔴 THE CLIENT HOOKS, AND NOTHING ELSE (Language Phase 1b; they were in lib/i18n/client.tsx,
// which re-exports them). A component that reads words imports from here, so its bundle carries the hooks and
// the namespaces it imports — not the provider and its next-intl machinery, which only a layout needs.
//
// 🔴 CLIENT COMPONENTS ASK `useT(namespace)`, NOT next-intl's `useTranslations`, FOR ONE REASON: a component
// rendered with no provider above it — a shared control on a page that has none, or a harness rendering it alone —
// gets en-GB, the agreed fallback, instead of throwing. Same messages, same ICU, same typed keys.
// ⚠️ A NAMESPACE THE PROVIDER DOES NOT SEND (Language Phase 1a) still reads its words: the namespace comes from the
// registry (its catalog module, which the component imports), never from what the provider chose to send.
import { createContext, useContext, useEffect, useMemo } from 'react'
import { createTranslator } from 'next-intl'
import { DEFAULT_LOCALE, type AppLocale } from './locales'
import { messagesOf } from './registry'
import type { AppNamespace } from './translator'

export interface I18nState { locale: AppLocale; setLocale: (tag: string | null | undefined) => void }
export const I18nContext = createContext<I18nState>({ locale: DEFAULT_LOCALE, setLocale: () => {} })

/** A page tells its layout's provider the truck's locale (its country's `locale`) once it has loaded it. */
export function useTruckLocale(tag: string | null | undefined): void {
  const { setLocale } = useContext(I18nContext)
  useEffect(() => { setLocale(tag) }, [setLocale, tag])
}

/** The provider's locale (en-GB with no provider) — for a shared library function that takes a locale. */
export function useAppLocale(): AppLocale {
  return useContext(I18nContext).locale
}

/** The translator for a namespace, in the provider's locale — or en-GB when there is no provider. The file that
 *  calls this imports the namespace's catalog module (`import '@/lib/i18n/catalog/<namespace>'`). */
export function useT<NS extends AppNamespace>(namespace: NS) {
  const { locale } = useContext(I18nContext)
  return useMemo(() => createTranslator({ locale, messages: messagesOf(locale, [namespace.split('.')[0]]), namespace }), [locale, namespace])
}
