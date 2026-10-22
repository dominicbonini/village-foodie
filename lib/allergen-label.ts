// lib/allergen-label.ts — a STORED allergen label shown in a locale's words (france-1, 22 October 2026).
// A menu item stores its allergens as the English LABEL strings of its country's set (lib/allergens.ts: "Dairy", "Tree nuts"),
// and they stay so: the stored value is the code, the AI prompts and the WhatsApp caveat read it, and France uses the uk14 set.
// A listed label is SHOWN, in a language other than English, as `menuBadges.allergen.<id>` (the English label with
// everything but letters taken out: "Tree nuts" → `Treenuts`); anything else is shown as stored. ⛔ EVERY ENGLISH LOCALE
// SHOWS EXACTLY THE STORED LABEL — nothing is looked up, so no English byte can change.
import { translatorFor } from '@/lib/i18n/translator'
import { isEnglish } from '@/lib/i18n/locales'
import '@/lib/i18n/catalog/menuBadges'

type Loose = { has(key: string): boolean; (key: string): string }

export function allergenLabel(value: string, locale: string | null | undefined): string {
  if (isEnglish(locale ?? 'en')) return value
  const t = translatorFor(locale, 'menuBadges') as unknown as Loose
  const key = `allergen.${value.replace(/[^A-Za-z]/g, '')}`
  return t.has(key) ? t(key) : value
}

/** A list of stored labels, each in the locale's words, joined as the caller always joined them. */
export const allergenList = (values: readonly string[], locale: string | null | undefined, sep = ', '): string =>
  values.map(v => allergenLabel(v, locale)).join(sep)
