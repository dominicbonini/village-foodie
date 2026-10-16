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
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { createTranslator } from 'next-intl'
import { DEFAULT_LOCALE, resolveLocale, type AppLocale } from './locales'
import { ensureLocale, isLocaleLoaded, messagesOf, seedWords, type SeedWords } from './registry'
import type { AppNamespace } from './translator'

/** `version` (Language Phase 1e Part C) changes when a locale's overrides arrive after first render — the provider
 *  bumps it, so every translator below it is rebuilt with the new words. */
export interface I18nState { locale: AppLocale; setLocale: (tag: string | null | undefined) => void; version?: number }
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
  const { locale, version } = useContext(I18nContext)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` is the registry's: new words for the same locale
  return useMemo(() => createTranslator({ locale, messages: messagesOf(locale, [namespace.split('.')[0]]), namespace }), [locale, namespace, version])
}

/** Language Phase 1e Part C — a component SERVER-RENDERED in a non-base locale (its server page passed `words`, from
 *  lib/i18n/server-words.ts) registers that locale's overrides before anything below it reads them, so hydration
 *  renders exactly the server's words. Call it at the top of the component, before its children render. */
export function useSeedWords(words: SeedWords | null | undefined): void {
  seedWords(words)   // idempotent and synchronous: the same data the server rendered with
}

/** Language Phase 1e Part C — `tag` once its words are loaded in the browser, and until then the last locale that
 *  was (`null` before any, and whenever `tag` is null). For a translator a component builds for a locale of its own
 *  choosing (not the provider's), so it never shows a mix of the two languages while the overrides load. */
export function useLoadedLocale(tag: string | null | undefined): AppLocale | null {
  const want = tag ? resolveLocale(tag) : null
  const [ready, setReady] = useState<AppLocale | null>(() => (want && isLocaleLoaded(want) ? want : null))
  useEffect(() => {
    if (!want || want === ready) return
    let live = true
    const done = () => { if (live) setReady(want) }
    if (isLocaleLoaded(want)) done(); else ensureLocale(want).then(done, done)   // a failed chunk: the base words
    return () => { live = false }
  }, [want, ready])
  if (!want) return null
  return want === ready || isLocaleLoaded(want) ? want : ready
}
