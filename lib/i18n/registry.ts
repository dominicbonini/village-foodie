// lib/i18n/registry.ts — 🔴 THE CLIENT-SAFE CATALOGUE: ONE NAMESPACE AT A TIME (Language Phase 1b,
// docs/language-phase-1b-report.md Part 1).
//
// Phase 0 imported BOTH whole message files wherever a single message was read, so every client bundle that
// showed one word carried every word (Phase 1a measured ~11 KB gzip on pages with no provider at all). Now each
// namespace is its own pair of files — messages/ns/<locale>/<namespace>.json, GENERATED from messages/en-GB.json
// and messages/en-US.json by scripts/split-messages.cjs — and its own module, lib/i18n/catalog/<namespace>.ts,
// which registers the pair here when it is imported.
//
// 🔴 THE RULE: A FILE THAT READS A NAMESPACE IMPORTS ITS CATALOG MODULE (`import '@/lib/i18n/catalog/<ns>'`) — the
// bundler then carries exactly the namespaces a bundle's files read, and nothing else. scripts/messages-split.cjs
// fails if any file reads a namespace it does not import, so a missing import can never reach a screen as a key.
// The authored files stay the single source; the server's next-intl request config still loads them whole
// (lib/i18n/messages.ts), which costs no browser anything.
import type { Messages } from 'next-intl'
import { deepMerge, type Tree } from './merge'
import { overrideChain, resolveLocale, type AppLocale } from './locales'

interface Entry { base: Tree; overrides: Partial<Record<AppLocale, Tree>> }
const ENTRIES = new Map<string, Entry>()
const MERGED = new Map<string, Tree>()

/** Called once per namespace, by its generated catalog module. A second call (a hot reload) replaces the first. */
export function registerNamespace(namespace: string, base: unknown, overrides: Partial<Record<AppLocale, unknown>>): void {
  ENTRIES.set(namespace, { base: base as Tree, overrides: overrides as Partial<Record<AppLocale, Tree>> })
  for (const k of [...MERGED.keys()]) if (k.endsWith(`|${namespace}`)) MERGED.delete(k)
}

/** One namespace in one locale: en-GB itself, or en-GB with that locale's file merged over it (canada-1: after its
 *  parent's — en-CA reads en-US's file, then its own; lib/i18n/locales.ts LOCALE_PARENT). Undefined when the namespace's
 *  catalog module was never imported (scripts/messages-split.cjs makes that a failed check). */
export function namespaceMessages(locale: string | null | undefined, namespace: string): Tree | undefined {
  const l = resolveLocale(locale)
  const key = `${l}|${namespace}`
  let m = MERGED.get(key)
  if (!m) {
    const e = ENTRIES.get(namespace)
    if (!e) return undefined
    const overs = overrideChain(l).map(x => e.overrides[x]).filter((o): o is Tree => !!o && Object.keys(o).length > 0)
    m = overs.length ? overs.reduce((acc, o) => deepMerge(acc, o), e.base) : e.base
    MERGED.set(key, m)
  }
  return m
}

/** The registered namespaces among `namespaces`, as one Messages object — what a translator or provider is given. */
export function messagesOf(locale: string | null | undefined, namespaces: readonly string[]): Messages {
  const out: Tree = {}
  for (const ns of namespaces) { const m = namespaceMessages(locale, ns); if (m) out[ns] = m }
  return out as unknown as Messages
}
