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
//
// 🔴 languages-1 (22 October 2026, docs/languages-1-report.md §1): A NON-ENGLISH LANGUAGE IS NOT IN THE BUNDLE. Its catalog
// lines (scripts/split-messages.cjs) call registerLanguage(): on the server with the namespace itself; in the browser with a
// LOADER, which runs only once a page is in that language — ensureLanguage() (lib/i18n/client.tsx, when a truck's locale
// arrives) or seedLanguage() (lib/i18n/page-locale.tsx, with the words the server rendered, so the first browser render
// matches). Until a namespace's words arrive it reads its en-GB fallback, and the hooks re-render when they land
// (subscribe / registryVersion). English locales work exactly as before: nothing here runs for them.
import type { Messages } from 'next-intl'
import { deepMerge, type Tree } from './merge'
import { overrideChain, resolveLocale, LANGUAGE_BASES, type AppLocale } from './locales'

interface Entry { base: Tree; overrides: Partial<Record<AppLocale, Tree>> }
const ENTRIES = new Map<string, Entry>()
const MERGED = new Map<string, Tree>()

type Loader = () => Promise<unknown>
/** languages-1: locale → namespace → its words (a Tree) or, in the browser until it is needed, a loader. */
const LANGUAGES = new Map<string, Map<string, Tree | Loader>>()
const LOADING = new Map<string, Promise<void>>()
/** languages-1: the languages a page in this browser has asked for — a namespace registered later (a lazily loaded screen)
 *  loads at once if its language is one of them. */
const ACTIVE = new Set<string>()
let version = 0
const listeners = new Set<() => void>()

const isBranch = (x: unknown): x is Tree => typeof x === 'object' && x !== null && !Array.isArray(x)
/** A JSON module as a bundler hands it over: the tree itself, or `{ default: tree }`. */
const treeOf = (m: unknown): Tree => (isBranch(m) && isBranch((m as { default?: unknown }).default) && Object.keys(m).every(k => k === 'default' || k === '__esModule') ? (m as { default: Tree }).default : m as Tree)

function invalidate(namespace: string) {
  for (const k of [...MERGED.keys()]) if (k.endsWith(`|${namespace}`)) MERGED.delete(k)
}
function bump() {
  version++
  for (const l of [...listeners]) l()
}

/** Called once per namespace, by its generated catalog module. A second call (a hot reload) replaces the first. */
export function registerNamespace(namespace: string, base: unknown, overrides: Partial<Record<AppLocale, unknown>>): void {
  ENTRIES.set(namespace, { base: base as Tree, overrides: overrides as Partial<Record<AppLocale, Tree>> })
  invalidate(namespace)
}

/** languages-1: a non-English language's words for one namespace — the words themselves (the server; a seeded page) or a
 *  loader (the browser). A loader never replaces words already there. */
export function registerLanguage(namespace: string, locale: string, words: unknown): void {
  let byNs = LANGUAGES.get(locale)
  if (!byNs) { byNs = new Map(); LANGUAGES.set(locale, byNs) }
  if (typeof words === 'function') {
    if (!isBranch(byNs.get(namespace))) byNs.set(namespace, words as Loader)
    if (ACTIVE.has(locale)) void loadNamespace(locale, namespace)
  } else {
    byNs.set(namespace, treeOf(words))
    invalidate(namespace)
  }
}

function loadNamespace(locale: string, namespace: string): Promise<void> {
  const src = LANGUAGES.get(locale)?.get(namespace)
  if (typeof src !== 'function') return Promise.resolve()
  const key = `${locale}|${namespace}`
  let p = LOADING.get(key)
  if (!p) {
    p = src().then(m => {
      LANGUAGES.get(locale)?.set(namespace, treeOf(m))
      invalidate(namespace)
      bump()
    }, () => { /* a failed chunk keeps the en-GB fallback; the next ensureLanguage tries again */ LOADING.delete(key) })
    LOADING.set(key, p)
  }
  return p
}

/** languages-1: load every registered namespace of a locale's languages (its chain), and every one registered later. Resolves
 *  at once for an English locale. */
export function ensureLanguage(tag: string | null | undefined): Promise<void> {
  const langs = overrideChain(resolveLocale(tag)).filter(x => (LANGUAGE_BASES as readonly string[]).includes(x) || LANGUAGES.has(x))
  for (const l of langs) ACTIVE.add(l)
  return Promise.all(langs.flatMap(l => [...(LANGUAGES.get(l)?.keys() ?? [])].map(ns => loadNamespace(l, ns)))).then(() => undefined)
}

/** languages-1: the words a server render used, handed to the browser so its first render is the same (PageLocale). */
export function seedLanguage(locale: string, byNamespace: Record<string, unknown>): void {
  ACTIVE.add(locale)
  let changed = false
  for (const [ns, words] of Object.entries(byNamespace)) {
    if (isBranch(LANGUAGES.get(locale)?.get(ns))) continue
    registerLanguage(ns, locale, words)
    changed = true
  }
  if (changed) version++
}

/** languages-1: the words of a language for `namespaces`, as the server holds them — what a page seeds the browser with.
 *  Empty for an English locale (its words are in the bundle). */
export function languageWords(tag: string | null | undefined, namespaces: readonly string[]): Record<string, Record<string, Tree>> {
  const out: Record<string, Record<string, Tree>> = {}
  for (const l of overrideChain(resolveLocale(tag))) {
    const byNs = LANGUAGES.get(l)
    if (!byNs) continue
    for (const ns of namespaces) { const w = byNs.get(ns); if (isBranch(w)) (out[l] ??= {})[ns] = w }
  }
  return out
}

/** languages-1: for useSyncExternalStore — a hook re-renders when a language's words arrive. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export const registryVersion = (): number => version

/** One namespace in one locale: en-GB itself, or en-GB with that locale's file merged over it (canada-1: after its
 *  parent's — en-CA reads en-US's file, then its own; lib/i18n/locales.ts LOCALE_PARENT). Undefined when the namespace's
 *  catalog module was never imported (scripts/messages-split.cjs makes that a failed check). languages-1: a non-English
 *  language's words are merged in once they are here; until then this is its en-GB fallback (and the result is not cached). */
export function namespaceMessages(locale: string | null | undefined, namespace: string): Tree | undefined {
  const l = resolveLocale(locale)
  const key = `${l}|${namespace}`
  let m = MERGED.get(key)
  if (!m) {
    const e = ENTRIES.get(namespace)
    if (!e) return undefined
    let complete = true
    const overs = overrideChain(l).map(x => {
      const english = e.overrides[x]
      if (english) return english
      const lang = LANGUAGES.get(x)?.get(namespace)
      if (typeof lang === 'function') { complete = false; if (ACTIVE.has(x)) void loadNamespace(x, namespace); return undefined }
      return lang
    }).filter((o): o is Tree => !!o && Object.keys(o).length > 0)
    m = overs.length ? overs.reduce((acc, o) => deepMerge(acc, o), e.base) : e.base
    if (complete) MERGED.set(key, m)
  }
  return m
}

/** The registered namespaces among `namespaces`, as one Messages object — what a translator or provider is given. */
export function messagesOf(locale: string | null | undefined, namespaces: readonly string[]): Messages {
  const out: Tree = {}
  for (const ns of namespaces) { const m = namespaceMessages(locale, ns); if (m) out[ns] = m }
  return out as unknown as Messages
}
