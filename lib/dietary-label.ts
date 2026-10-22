// lib/dietary-label.ts — a STORED dietary tag shown in a locale's words (languages-1, 22 October 2026).
// The tags are stored as their English names (menu_items_db.dietary_info: "Vegetarian", "Gluten Free" — the vocabulary in
// components/manage/primitives.tsx DIETARY_VOCAB), and they stay so: the stored value is the code. A listed tag is SHOWN as
// `menuBadges.dietary.<id>` (the English name with everything but letters taken out); anything else is shown as stored. Every
// English locale shows exactly the stored name.
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/menuBadges'

type Loose = { has(key: string): boolean; (key: string): string }

export function dietaryLabel(value: string, locale: string | null | undefined): string {
  const t = translatorFor(locale, 'menuBadges') as unknown as Loose
  const key = `dietary.${value.replace(/[^A-Za-z]/g, '')}`
  return t.has(key) ? t(key) : value
}
