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
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { createTranslator } from 'next-intl'
import { DEFAULT_LOCALE, resolveLocale, isLanguageBase, type AppLocale } from './locales'
import { messagesOf, subscribe, registryVersion, ensureLanguage } from './registry'
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
  // languages-1: a non-English language's words arrive after the first render in some screens (lib/i18n/registry.ts); the
  // version changes when they land, so the translator is rebuilt. It never changes for an English locale.
  const version = useSyncExternalStore(subscribe, registryVersion, registryVersion)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` is the registry's change signal, read inside messagesOf
  return useMemo(() => createTranslator({ locale, messages: messagesOf(locale, [namespace.split('.')[0]]), namespace }), [locale, namespace, version])
}

/** languages-1 (22 October 2026): the translator for a namespace in ANOTHER locale than the provider's — the demo wizard's chosen
 *  country — or null with no locale. A non-English language's words are fetched (lib/i18n/registry.ts) and the translator is
 *  rebuilt when they land; for English it is exactly `translatorFor(locale, namespace)`. */
export function useTIn<NS extends AppNamespace>(locale: string | null | undefined, namespace: NS) {
  const version = useSyncExternalStore(subscribe, registryVersion, registryVersion)
  useEffect(() => { if (locale && isLanguageBase(locale)) void ensureLanguage(locale) }, [locale])
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` is the registry's change signal
  return useMemo(() => (locale ? createTranslator({ locale: resolveLocale(locale), messages: messagesOf(locale, [namespace.split('.')[0]]), namespace }) : null), [locale, namespace, version])
}

/** languages-1 (22 October 2026): the locale of the page's <html lang> — for a component in the ROOT layout, outside every page's
 *  language provider (the session alert). It follows a change (a non-English truck's provider sets the attribute once the
 *  truck's language is known). Any English page resolves to its English locale or en-GB. */
export function useDocumentLocale(): AppLocale {
  const [lang, setLang] = useState<string | null>(null)
  useEffect(() => {
    const el = document.documentElement
    const read = () => setLang(el.getAttribute('lang'))
    read()
    const mo = new MutationObserver(read)
    mo.observe(el, { attributes: true, attributeFilter: ['lang'] })
    return () => mo.disconnect()
  }, [])
  return resolveLocale(lang)
}
