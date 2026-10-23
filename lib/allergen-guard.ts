// lib/allergen-guard.ts — 🔴 THE WHATSAPP ALLERGEN GUARD'S WORDS, AS DATA PER LANGUAGE (languages-1, 22 October 2026,
// docs/languages-1-report.md §3). FOOD SAFETY.
//
// lib/whatsapp-classifier.ts sends an allergen/safety question to the fixed allergen reply (never to the AI) when it matches
// these words, and appends the allergen caveat to an AI reply that states a tagged allergen. Until languages-1 both lists were
// English code; now each language is a data file, lib/allergen-guard/<language>.json (stems, whole tokens, per-allergen-set
// additions, caveat families), chosen by the truck's language (its country's locale). ENGLISH IS BYTE-IDENTICAL: en.json is
// the old lists verbatim, matched with the old ASCII normaliser.
//
// 🔴 FAIL SAFE: a truck whose language has NO word list here
//   • is matched against EVERY language's list, with a Unicode-aware normaliser (accents folded, any script), and
//   • never gets the AI's menu answer at all — every menu question goes to the allergen reply (lib/whatsapp-classifier.ts)
// — and the gap is logged once per language and listed by scripts/languages-1.cjs and scripts/translation-check.cjs, so it
// cannot ship unnoticed. Adding the file closes it.
import type { AllergenSet } from '@/lib/allergens'
import { languageOf } from '@/lib/i18n/locales'
import en from './allergen-guard/en.json'
import fr from './allergen-guard/fr.json'   // france-1 (22 October 2026)
import de from './allergen-guard/de.json'   // europe-languages-1 (22 October 2026)
import es from './allergen-guard/es.json'   // europe-languages-1
import it from './allergen-guard/it.json'   // europe-languages-1
import pt from './allergen-guard/pt.json'   // europe-languages-1
import nl from './allergen-guard/nl.json'   // europe-languages-1
import sv from './allergen-guard/sv.json'   // europe-languages-1
import da from './allergen-guard/da.json'   // europe-languages-1
import nb from './allergen-guard/nb.json'   // europe-languages-1
import pl from './allergen-guard/pl.json'   // europe-languages-2
import cs from './allergen-guard/cs.json'   // europe-languages-2
import sk from './allergen-guard/sk.json'   // europe-languages-2
import hu from './allergen-guard/hu.json'   // europe-languages-2
import ro from './allergen-guard/ro.json'   // europe-languages-2
import hr from './allergen-guard/hr.json'   // europe-languages-2
import sl from './allergen-guard/sl.json'   // europe-languages-2
import fi from './allergen-guard/fi.json'   // europe-languages-2
import et from './allergen-guard/et.json'   // europe-languages-2
import lv from './allergen-guard/lv.json'   // europe-languages-2
import lt from './allergen-guard/lt.json'   // europe-languages-2
import el from './allergen-guard/el.json'   // europe-languages-2
import bg from './allergen-guard/bg.json'   // europe-languages-2

export interface GuardWords {
  language: string
  /** 'ascii': English's original normaliser (non a-z0-9 runs → a space). 'unicode': accents folded, letters of any script kept. */
  normalise: 'ascii' | 'unicode'
  /** Substrings (absence / safety words) that send a message to the allergen reply. */
  stems: string[]
  /** Whole words that do the same ("gf", "free"). */
  tokens: string[]
  /** Extra stems / tokens for a country's allergen set (its customers' own safety words). */
  bySet?: Partial<Record<AllergenSet, { stems?: string[]; tokens?: string[] }>>
  /** For the caveat: a tagged label → the everyday words a reply may use for it, per allergen set. */
  caveatWords?: Partial<Record<AllergenSet, Record<string, string[]>>>
}

/** Every language with a list. A new language's file is imported and added here (docs/i18n/add-a-country.md). */
export const GUARD_WORDS: Record<string, GuardWords> = { en: en as GuardWords, fr: fr as GuardWords, de: de as GuardWords,
  es: es as GuardWords, it: it as GuardWords, pt: pt as GuardWords, nl: nl as GuardWords, sv: sv as GuardWords, da: da as GuardWords, nb: nb as GuardWords,
  pl: pl as GuardWords, cs: cs as GuardWords, sk: sk as GuardWords, hu: hu as GuardWords, ro: ro as GuardWords, hr: hr as GuardWords, sl: sl as GuardWords, fi: fi as GuardWords, et: et as GuardWords, lv: lv as GuardWords, lt: lt as GuardWords, el: el as GuardWords, bg: bg as GuardWords }

const asciiNorm = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()} `
const unicodeNorm = (s: string) => ` ${s.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim()} `
const normOf = (w: GuardWords) => (w.normalise === 'ascii' ? asciiNorm : unicodeNorm)

/** The list for a locale's language, or null when that language has none (→ fail safe). */
export function guardWordsFor(locale: string | null | undefined): GuardWords | null {
  return GUARD_WORDS[languageOf(locale)] ?? null
}

const warned = new Set<string>()
function warnMissing(lang: string) {
  if (warned.has(lang)) return
  warned.add(lang)
  console.warn(`[allergen-guard] no word list for language "${lang}" (lib/allergen-guard/${lang}.json) — FAILING SAFE: every menu question goes to the allergen reply`)
}

function matches(w: GuardWords, message: string, set: AllergenSet | null | undefined, normalise = normOf(w)): boolean {
  const normalised = normalise(message)
  // A list's words go through the same normaliser (English's are already in that form, so they are unchanged).
  const word = (x: string) => normalise(x).trim()
  const tokens = normalised.trim().split(' ')
  const extra = set ? w.bySet?.[set] : undefined
  return w.stems.some(stem => normalised.includes(word(stem))) || w.tokens.some(tok => tokens.includes(word(tok)))
    || (extra?.stems ?? []).some(stem => normalised.includes(word(stem))) || (extra?.tokens ?? []).some(tok => tokens.includes(word(tok)))
}

/** Does the message ask an allergen / dietary-SAFETY question (absence, intolerance, "free from")? Over-triggering on purpose:
 *  a false positive is a safe redirect. A language with no list is matched against every list, Unicode-aware. */
export function mentionsAllergen(message: string, set?: AllergenSet | null, locale?: string | null): boolean {
  const w = guardWordsFor(locale ?? 'en')
  if (w) return matches(w, message, set)
  warnMissing(languageOf(locale))
  return Object.values(GUARD_WORDS).some(x => matches(x, message, set, unicodeNorm))
}

/** True when the truck's language has a word list. False → the classifier never lets the AI answer a menu question. */
export const hasGuardWords = (locale: string | null | undefined): boolean => {
  const ok = !!guardWordsFor(locale ?? 'en')
  if (!ok) warnMissing(languageOf(locale))
  return ok
}

/** The words that mark a reply as STATING an allergen this truck has tagged: each tag (lower case), plus its everyday family
 *  words for the allergen set in the truck's language. */
export function caveatTriggerWords(tags: string[], set: AllergenSet | null | undefined, locale?: string | null): Set<string> {
  const out = new Set<string>()
  const fam = set ? guardWordsFor(locale ?? 'en')?.caveatWords?.[set] : undefined
  for (const a of tags) {
    const w = String(a).trim().toLowerCase()
    if (!w) continue
    out.add(w)
    for (const x of fam?.[w] ?? []) out.add(x)
  }
  return out
}
