// lib/i18n/registry.ts — 🔴 THE CLIENT-SAFE CATALOGUE: ONE NAMESPACE AT A TIME (Language Phase 1b,
// docs/language-phase-1b-report.md Part 1), AND ONLY THE ACTIVE LANGUAGE IN THE BROWSER (Language Phase 1e Part C).
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
// ── LANGUAGE PHASE 1e PART C: THE en-US OVERRIDES ARE LOADED ONLY WHERE en-US IS USED ──────────────────────
// A catalog module registers its en-GB base statically and each other locale's overrides as EITHER the data itself
// (on the server — emails, routes, server components, SSR, and the node harnesses: `typeof window === 'undefined'`
// takes a synchronous `require`) OR a loader (in the browser: `() => import(…)`, its own small chunk). Next replaces
// `typeof window` at compile time, so the browser bundle never contains the require and the server never the
// loader (proved on the built chunks, docs/language-phase-1e-report.md Part C).
//   • Until a locale's overrides are loaded, a namespace in that locale reads its en-GB base — useT's fallback, the
//     same merge. Nothing ever shows a key.
//   • `ensureLocale(locale)` loads that locale for every registered namespace (and for any registered later). The
//     provider (lib/i18n/client.tsx) switches only after it resolves, so a screen never mixes the two languages.
//   • A page SERVER-RENDERED in a non-base locale hands the browser that locale's overrides for the namespaces its
//     client components read (lib/i18n/server-words.ts → `seedWords`), so hydration sees the server's words.
//     That is transport of the same JSON, not a second copy.
import type { Messages } from 'next-intl'
import { deepMerge, type Tree } from './merge'
import { DEFAULT_LOCALE, resolveLocale, type AppLocale } from './locales'

/** A locale's overrides for one namespace, as a catalog module hands them over: the data, a loader for its chunk,
 *  or nothing (no overrides). */
export type OverrideSource = unknown | (() => Promise<unknown>) | null | undefined
/** What a server-rendered page sends the browser: one locale's overrides for the namespaces it reads. */
export interface SeedWords { locale: AppLocale; overrides: Record<string, unknown> }

interface Entry {
  base: Tree
  overrides: Partial<Record<AppLocale, Tree>>
  loaders: Partial<Record<AppLocale, () => Promise<unknown>>>
}
const ENTRIES = new Map<string, Entry>()
const MERGED = new Map<string, Tree>()
const PENDING = new Map<string, Promise<void>>()   // `${locale}|${namespace}` → its load in flight
const WANTED = new Set<AppLocale>()                 // locales asked for by ensureLocale — later namespaces load them too
const SEEDS = new Map<string, Tree>()               // `${locale}|${namespace}` seeded before its catalog registered
const LISTENERS = new Set<() => void>()
let VERSION = 0

/** A required or imported JSON module → its object (a bundler's ESM namespace carries it as `default`). */
const unwrap = (m: unknown): Tree => {
  const o = m as { __esModule?: boolean; default?: unknown } | null
  return ((o && o.__esModule) || (o && typeof o === 'object' && Object.prototype.toString.call(o) === '[object Module]') ? o.default : o) as Tree
}
const forget = (locale: AppLocale, namespace: string) => MERGED.delete(`${locale}|${namespace}`)
const changed = () => { VERSION++; for (const f of [...LISTENERS]) f() }

/** Called once per namespace, by its generated catalog module. A second call (a hot reload) replaces the first. */
export function registerNamespace(namespace: string, base: unknown, overrides: Partial<Record<AppLocale, OverrideSource>>): void {
  const e: Entry = { base: unwrap(base), overrides: {}, loaders: {} }
  for (const [l, src] of Object.entries(overrides) as [AppLocale, OverrideSource][]) {
    if (typeof src === 'function') e.loaders[l] = src as () => Promise<unknown>
    else if (src != null) e.overrides[l] = unwrap(src)
  }
  for (const [k, tree] of SEEDS) {
    const [l, ns] = k.split('|') as [AppLocale, string]
    if (ns === namespace && !e.overrides[l]) { e.overrides[l] = tree; delete e.loaders[l] }
  }
  ENTRIES.set(namespace, e)
  for (const k of [...MERGED.keys()]) if (k.endsWith(`|${namespace}`)) MERGED.delete(k)
  for (const l of WANTED) if (e.loaders[l]) void loadOverrides(namespace, l)
}

/** Whether `locale`'s words are all here for every registered namespace (the base always is). */
export function isLocaleLoaded(locale: string | null | undefined): boolean {
  const l = resolveLocale(locale)
  if (l === DEFAULT_LOCALE) return true
  for (const e of ENTRIES.values()) if (e.loaders[l] && !e.overrides[l]) return false
  return true
}

function loadOverrides(namespace: string, l: AppLocale): Promise<void> {
  const key = `${l}|${namespace}`
  const e = ENTRIES.get(namespace)
  const load = e?.loaders[l]
  if (!e || !load || e.overrides[l]) return Promise.resolve()
  let p = PENDING.get(key)
  if (!p) {
    p = load().then(m => {
      const now = ENTRIES.get(namespace)
      if (now && !now.overrides[l]) { now.overrides[l] = unwrap(m); forget(l, namespace); changed() }
    }).finally(() => PENDING.delete(key))
    PENDING.set(key, p)
  }
  return p
}

/** Load `locale`'s overrides for every registered namespace (and remember it, so a namespace registered later loads
 *  them too). Resolves at once for en-GB, on the server, and when everything is here. Rejects if a chunk fails. */
export function ensureLocale(locale: string | null | undefined): Promise<void> {
  const l = resolveLocale(locale)
  if (l === DEFAULT_LOCALE) return Promise.resolve()
  WANTED.add(l)
  return Promise.all([...ENTRIES.keys()].map(ns => loadOverrides(ns, l))).then(() => undefined)
}

/** A server-rendered page's overrides (lib/i18n/server-words.ts), registered SYNCHRONOUSLY before its client
 *  components render — so the browser's first render (hydration) reads exactly what the server rendered. Silent:
 *  it is the same data the server used, so nothing already on screen changes. */
export function seedWords(seed: SeedWords | null | undefined): void {
  if (!seed) return
  const l = resolveLocale(seed.locale)
  if (l === DEFAULT_LOCALE) return
  for (const [namespace, over] of Object.entries(seed.overrides)) {
    const e = ENTRIES.get(namespace)
    if (e?.overrides[l]) continue
    const tree = unwrap(over)
    if (!e) { SEEDS.set(`${l}|${namespace}`, tree); continue }
    e.overrides[l] = tree
    forget(l, namespace)
  }
}

/** Something to re-render when overrides arrive after a screen first read a namespace (the provider subscribes). */
export function subscribeWords(listener: () => void): () => void {
  LISTENERS.add(listener)
  return () => { LISTENERS.delete(listener) }
}
export const wordsVersion = (): number => VERSION

/** One namespace in one locale: en-GB itself, or en-GB with that locale's file merged over it — the base alone
 *  while that locale's overrides are still loading (and the load is started). Undefined when the namespace's
 *  catalog module was never imported (scripts/messages-split.cjs makes that a failed check). */
export function namespaceMessages(locale: string | null | undefined, namespace: string): Tree | undefined {
  const l = resolveLocale(locale)
  const key = `${l}|${namespace}`
  let m = MERGED.get(key)
  if (!m) {
    const e = ENTRIES.get(namespace)
    if (!e) return undefined
    const over = e.overrides[l]
    if (!over && e.loaders[l]) { void loadOverrides(namespace, l).catch(() => {}); return e.base }
    m = over && Object.keys(over).length ? deepMerge(e.base, over) : e.base
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
