// lib/i18n/messages.ts — 🔴 HOW THE MESSAGE FILES LOAD (Language Phase 0, docs/language-phase-0-report.md §1).
//
// ⚠️ THE WHOLE CATALOGUE — FOR THE SERVER'S next-intl REQUEST CONFIG (lib/i18n/request.ts) AND THE HARNESSES. Since
// Language Phase 1b no client module imports this file: the browser reads one namespace at a time through
// lib/i18n/registry.ts, so a bundle carries only the words its files use (docs/language-phase-1b-report.md).
// messages/en-GB.json is the FULL base. messages/en-US.json holds ONLY the keys whose US
// wording differs, and is deep-merged OVER en-GB here — so a key the US file lacks shows the UK text, never a
// raw key. A later language is a full file of its own, checked for completeness by scripts/messages-parity.cjs.
import enGB from '@/messages/en-GB.json'
import enUS from '@/messages/en-US.json'
import enIE from '@/messages/en-IE.json'
import enAU from '@/messages/en-AU.json'
import enNZ from '@/messages/en-NZ.json'
import type { Messages } from 'next-intl'
import { DEFAULT_LOCALE, resolveLocale, type AppLocale } from './locales'
import { deepMerge, type Tree } from './merge'

export { deepMerge }

const OVERRIDES: Record<AppLocale, Tree | null> = { 'en-GB': null, 'en-US': enUS as Tree, 'en-IE': enIE as Tree, 'en-AU': enAU as Tree, 'en-NZ': enNZ as Tree }
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
