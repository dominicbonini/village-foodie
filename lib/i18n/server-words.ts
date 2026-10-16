// lib/i18n/server-words.ts — 🔴 WHAT A SERVER-RENDERED PAGE HANDS ITS CLIENT COMPONENTS (Language Phase 1e Part C).
//
// The browser carries only the en-GB base of each namespace; another locale's overrides load when used
// (lib/i18n/registry.ts). A client component the SERVER renders in that locale — the public truck page of a US
// truck, the /us calculator, a US operator's verify-email screen — must hydrate with the words the server used, so
// its server page passes `wordsFor(locale, NAMESPACES.<surface>)` down and the component calls `useSeedWords(words)`
// before its children render. The words are the same JSON as everywhere else (messages/en-US.json, which
// scripts/split-messages.cjs splits into messages/ns/en-US/<ns>.json): this is transport, never a second copy.
// Null for en-GB (the base is already in the bundle) and when none of the namespaces has an override.
// ⚠️ SERVER-ONLY: it reads the whole catalogue (lib/i18n/messages.ts). scripts/messages-split.cjs check 4 proves each
// surface's NAMESPACES entry names every namespace its client component graph reads.
import 'server-only'
import { DEFAULT_LOCALE, resolveLocale } from './locales'
import { overridesFor } from './messages'
import type { SeedWords } from './registry'

export function wordsFor(locale: string | null | undefined, namespaces: readonly string[]): SeedWords | null {
  const l = resolveLocale(locale)
  if (l === DEFAULT_LOCALE) return null
  const all = overridesFor(l)
  const overrides: Record<string, unknown> = {}
  for (const ns of namespaces) { const o = all[ns]; if (o && typeof o === 'object' && Object.keys(o).length) overrides[ns] = o }
  return Object.keys(overrides).length ? { locale: l, overrides } : null
}
