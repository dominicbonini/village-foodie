// lib/allergen-kitchen.ts — 🔴 "THE ALLERGENS YOUR KITCHEN HANDLES", THE ONE DEFINITION (allergen-kitchen-1, 13 November 2026,
// docs/allergen-kitchen-1-report.md). Client-safe: pure functions only.
//
// A dish keeps ONE allergen list — what its recipe CONTAINS (menu_items_db.allergens). A truck's kitchen list is:
//     the allergens of every CONFIRMED, ACTIVE dish   (allergens_verified !== false, is_active !== false)
//   ∪ the allergens of every AVAILABLE extra          (modifier_options.available !== false, is_active !== false)
//   ∪ the allergens the truck ADDED                   (trucks.allergen_kitchen_extra — incl. an allergen card's "may be present in
//                                                       all dishes" / "may contain" lines and a menu's "may contain" note)
// Only labels in the truck's country list count (lib/allergens.ts allergenVocab); dietary tags never do. Only the ADDED part is
// stored; the rest is computed here, live, so it follows the dishes on its own. Every reader uses THIS — the customer pop-up
// (app/api/menu/[truckId]/route.ts → kitchen_allergens), the wizard's last page and the Menu tab's "Kitchen also handles" line.
import { allergenVocab, type AllergenSet } from '@/lib/allergens'
import { allergenLabel } from '@/lib/allergen-label'
import { isEnglish } from '@/lib/i18n/locales'

export interface KitchenDish { allergens?: readonly string[] | null; allergens_verified?: boolean | null; is_active?: boolean | null }
export interface KitchenOption { allergens?: readonly string[] | null; available?: boolean | null; is_active?: boolean | null }

/** The labels of `values` that are in the country's list, each once, in the LIST's order. Anything else (a dietary tag, a
 *  generic such as "Nuts", another country's label) is dropped. */
export function onlyListed(values: readonly unknown[] | null | undefined, allergenSet: AllergenSet | null | undefined): string[] {
  const have = new Set((values || []).filter((v): v is string => typeof v === 'string'))
  return allergenVocab(allergenSet).filter(a => have.has(a))
}

/** The kitchen list in its two parts: `fromMenu` (confirmed active dishes ∪ available extras — locked on the wizard's last page)
 *  and `added` (the truck's own list, as stored), and `all` (their union). Each in the country list's order. */
export function kitchenAllergens({ dishes, options, extra, allergenSet }: {
  dishes: readonly KitchenDish[]
  options: readonly KitchenOption[]
  extra: readonly unknown[] | null | undefined
  allergenSet: AllergenSet | null | undefined
}): { fromMenu: string[]; added: string[]; all: string[] } {
  const menu: string[] = []
  for (const d of dishes) if (d.allergens_verified !== false && d.is_active !== false) menu.push(...(d.allergens || []))
  for (const o of options) if (o.available !== false && o.is_active !== false) menu.push(...(o.allergens || []))
  const fromMenu = onlyListed(menu, allergenSet)
  const added = onlyListed(extra || [], allergenSet)
  return { fromMenu, added, all: onlyListed([...fromMenu, ...added], allergenSet) }
}

/** A list of stored labels as a CUSTOMER reads it: each in the locale's words, sorted exactly as the order page's allergen pop-up
 *  has always sorted (English: the stored labels' own order — A→Z by stored label; any other language: by the shown name). */
export function kitchenNames(values: readonly string[], locale: string | null | undefined): string[] {
  const shown = [...new Set(values)].sort().map(a => allergenLabel(a, locale))
  return isEnglish(locale ?? 'en') ? shown : shown.sort((x, y) => x.localeCompare(y, locale ?? undefined))
}
