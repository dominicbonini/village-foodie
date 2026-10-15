// lib/demo-templates.ts
// Sample menus for the extraction-failure fallback (spec §11).
//
// 🔴 THESE ARE NEVER PRESENTED AS THE VISITOR'S OWN MENU. The UI must say plainly that we couldn't read
// their photo before offering one of these. For a trust-led product aimed at cautious operators, a
// discovered deception is far more damaging than a visible fallback — that is the whole point of §11.
//
// Each is a PER-VISITOR CLONE through the same provisionDemo path, never one shared demo truck: shared
// state would leak one visitor's test orders into another's board.
//
// Shaped exactly like an extraction result (categories + items with a `category` naming one of them) so it
// flows through the SAME commitExtraction path — which means it also gets buildDemoAssumptions() and
// therefore a real categoryPrep. A template with no prep would be exactly as broken as a failed import:
// everything instant, nothing counting toward the ceiling, every slot permanently green.
//
// Category names are drawn from STANDARD_CATEGORIES (lib/menu-extract) so the main-category lookup hits its
// primary signal rather than falling back to most-populated.
//
// 🔴 THE WORDS ARE THE DEMO TRUCK'S COUNTRY'S (Language Phase 2). Every name a template writes into a truck's menu
// — category, item, and the chooser label — is a message in `provisionContent.demo…` (messages/en-GB.json, with the
// US words in messages/en-US.json), read in the truck's locale: a US demo's curry truck sells "Pulao Rice" under
// "Entrées". Only ids, prices and order live here. en-GB is today's exact words, so a GB demo stores the same bytes.
// ⚠️ A CATEGORY IS RECOGNISED BY ITS ID, NEVER ITS WORD: `demoTemplateIn` hands provisionDemo each category name's
// standard id, and buildDemoAssumptions (lib/demo-assumptions.ts) decides which ones cook from the id — so "Entrées"
// cooks exactly as "Mains" does.
import '@/lib/i18n/catalog/provisionContent'
import { translatorFor } from '@/lib/i18n/translator'
import { DEFAULT_LOCALE } from '@/lib/i18n/locales'
import type { StandardCategoryId } from '@/lib/menu-extract'
import type { Messages } from 'next-intl'

export type DemoTemplateId = 'pizza' | 'burgers' | 'curries'
/** The standard categories the templates use — their words are `provisionContent.demoCategories.<id>`. */
export type DemoCategoryId = Extract<StandardCategoryId, 'pizza' | 'burgers' | 'mains' | 'sides' | 'drinks'>

export interface DemoTemplate {
  /** Stable key used by the API and the UI. */
  id: DemoTemplateId
  /** Shown on the fallback chooser. */
  label: string
  /** Passed to provisionDemo as template.name; surfaces in the result for logging. */
  name: string
  categories: string[]
  items: { name: string; price: number; category: string }[]
}

/** A template as ids: each item's key is its message key under `provisionContent.demoTemplates.<id>.items` (typed,
 *  so a key with no message fails the type check). */
type ItemKey<T extends DemoTemplateId> = keyof Messages['provisionContent']['demoTemplates'][T]['items'] & string
type DemoTemplateSpec = { [T in DemoTemplateId]: {
  id: T
  name: string
  categories: DemoCategoryId[]
  items: { key: ItemKey<T>; price: number; category: DemoCategoryId }[]
} }[DemoTemplateId]

// Pizza FIRST (§11) — build order and the order the chooser offers them in.
const SPECS: DemoTemplateSpec[] = [
  {
    id: 'pizza',
    name: 'Pizza',
    categories: ['pizza', 'sides', 'drinks'],
    items: [
      { key: 'margherita',          price: 9.00,  category: 'pizza' },
      { key: 'pepperoni',           price: 10.50, category: 'pizza' },
      { key: 'ndujaHoney',          price: 12.00, category: 'pizza' },
      { key: 'fourCheese',          price: 11.50, category: 'pizza' },
      { key: 'gardenVeg',           price: 10.00, category: 'pizza' },
      { key: 'garlicBread',         price: 5.00,  category: 'sides' },
      { key: 'rocketParmesan',      price: 4.50,  category: 'sides' },
      { key: 'olives',              price: 3.50,  category: 'sides' },
      { key: 'sanPellegrino',       price: 2.50,  category: 'drinks' },
      { key: 'coke',                price: 2.00,  category: 'drinks' },
    ],
  },
  {
    id: 'burgers',
    name: 'Burgers',
    categories: ['burgers', 'sides', 'drinks'],
    items: [
      { key: 'classicCheeseburger', price: 8.50,  category: 'burgers' },
      { key: 'doubleBacon',         price: 11.00, category: 'burgers' },
      { key: 'buttermilkChicken',   price: 9.50,  category: 'burgers' },
      { key: 'halloumiStack',       price: 9.00,  category: 'burgers' },
      { key: 'smashBurger',         price: 8.00,  category: 'burgers' },
      { key: 'skinOnFries',         price: 4.00,  category: 'sides' },
      { key: 'loadedCheeseFries',   price: 6.00,  category: 'sides' },
      { key: 'onionRings',          price: 4.50,  category: 'sides' },
      { key: 'craftLemonade',       price: 3.00,  category: 'drinks' },
      { key: 'coke',                price: 2.00,  category: 'drinks' },
    ],
  },
  {
    id: 'curries',
    name: 'Curries',
    categories: ['mains', 'sides', 'drinks'],
    items: [
      { key: 'chickenTikkaMasala',  price: 10.50, category: 'mains' },
      { key: 'lambRoganJosh',       price: 11.50, category: 'mains' },
      { key: 'chanaMasala',         price: 9.00,  category: 'mains' },
      { key: 'butterChicken',       price: 10.50, category: 'mains' },
      { key: 'saagPaneer',          price: 9.50,  category: 'mains' },
      { key: 'pilauRice',           price: 3.50,  category: 'sides' },
      { key: 'garlicNaan',          price: 3.50,  category: 'sides' },
      { key: 'onionBhaji',          price: 4.00,  category: 'sides' },
      { key: 'mangoLassi',          price: 3.50,  category: 'drinks' },
      { key: 'coke',                price: 2.00,  category: 'drinks' },
    ],
  },
]

/** One template in one locale's words, with the standard id of each category name it uses. */
function build(spec: DemoTemplateSpec, locale: string): { template: DemoTemplate; categoryIds: Record<string, DemoCategoryId> } {
  const t = translatorFor(locale, 'provisionContent')
  const cat = (id: DemoCategoryId) => t(`demoCategories.${id}`)
  const categoryIds: Record<string, DemoCategoryId> = {}
  for (const id of spec.categories) categoryIds[cat(id)] = id
  return {
    template: {
      id: spec.id,
      label: t(`demoTemplates.${spec.id}.label`),
      name: spec.name,
      categories: spec.categories.map(cat),
      // (the key is checked by ItemKey above; the per-template path is beyond what the translator's key type can follow)
      items: (spec.items as { key: string; price: number; category: DemoCategoryId }[])
        .map(i => ({ name: t(`demoTemplates.${spec.id}.items.${i.key}` as never), price: i.price, category: cat(i.category) })),
    },
    categoryIds,
  }
}

/** The templates in en-GB — the chooser's list (components/landing/DemoUpload.tsx reads only the ids). */
export const DEMO_TEMPLATES: DemoTemplate[] = SPECS.map(s => build(s, DEFAULT_LOCALE).template)

/** A template by id, in `locale`'s words (en-GB when none is given). */
export function getDemoTemplate(id: string | null | undefined, locale: string = DEFAULT_LOCALE): DemoTemplate | null {
  return demoTemplateIn(id, locale)?.template ?? null
}

/** A template by id in `locale`'s words, and each of its category names → its standard category id (for code that
 *  must recognise a category: key by the id, never by the word). Null for an unknown id. */
export function demoTemplateIn(id: string | null | undefined, locale: string):
  { template: DemoTemplate; categoryIds: Record<string, DemoCategoryId> } | null {
  if (!id) return null
  const spec = SPECS.find(s => s.id === id)
  return spec ? build(spec, locale) : null
}
