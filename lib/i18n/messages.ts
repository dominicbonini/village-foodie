// lib/i18n/messages.ts — 🔴 HOW THE MESSAGE FILES LOAD (Language Phase 0, docs/language-phase-0-report.md §1).
//
// PURE AND CLIENT-SAFE. messages/en-GB.json is the FULL base. messages/en-US.json holds ONLY the keys whose US
// wording differs, and is deep-merged OVER en-GB here — so a key the US file lacks shows the UK text, never a
// raw key. A later language is a full file of its own, checked for completeness by scripts/messages-parity.cjs.
import enGB from '@/messages/en-GB.json'
import enUS from '@/messages/en-US.json'
import type { Messages } from 'next-intl'
import { DEFAULT_LOCALE, resolveLocale, type AppLocale } from './locales'

type Tree = { [k: string]: string | Tree }

const isBranch = (x: unknown): x is Tree => typeof x === 'object' && x !== null && !Array.isArray(x)

/** `over` laid onto `base`, branch by branch. A string in `over` replaces the base's; anything `over` lacks stays. */
export function deepMerge(base: Tree, over: Tree): Tree {
  const out: Tree = { ...base }
  for (const [k, v] of Object.entries(over)) {
    const b = out[k]
    // An ARRAY is a leaf: with the build's message precompile (Language Phase 1a) a message can be a compiled
    // array rather than a string, and merging two of those index by index would corrupt both.
    out[k] = isBranch(v) && isBranch(b) ? deepMerge(b, v) : v
  }
  return out
}

const OVERRIDES: Record<AppLocale, Tree | null> = { 'en-GB': null, 'en-US': enUS as Tree }
const CACHE = new Map<AppLocale, Messages>()

/** Every message for a locale: en-GB itself, or en-GB with that locale's file merged over it. */
export function messagesFor(locale: string | null | undefined): Messages {
  const l = resolveLocale(locale)
  let m = CACHE.get(l)
  if (!m) {
    const over = OVERRIDES[l]
    m = (over ? deepMerge(enGB as Tree, over) : enGB) as Messages
    CACHE.set(l, m)
  }
  return m
}

/** Only the namespaces a screen needs — what a layout's provider sends to the browser. */
export function pickNamespaces(messages: Messages, namespaces: readonly string[]): Messages {
  const all = messages as unknown as Tree
  return Object.fromEntries(namespaces.filter(n => n in all).map(n => [n, all[n]])) as unknown as Messages
}

export const BASE_MESSAGES: Messages = messagesFor(DEFAULT_LOCALE)
