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

export interface DemoTemplate {
  /** Stable key used by the API and the UI. */
  id: 'pizza' | 'burgers' | 'curries'
  /** Shown on the fallback chooser. */
  label: string
  /** Passed to provisionDemo as template.name; surfaces in the result for logging. */
  name: string
  categories: string[]
  items: { name: string; price: number; category: string }[]
}

// Pizza FIRST (§11) — build order and the order the chooser offers them in.
export const DEMO_TEMPLATES: DemoTemplate[] = [
  {
    id: 'pizza',
    label: '🍕 Pizza van',
    name: 'Pizza',
    categories: ['Pizza', 'Sides', 'Drinks'],
    items: [
      { name: 'Margherita',            price: 9.00,  category: 'Pizza' },
      { name: 'Pepperoni',             price: 10.50, category: 'Pizza' },
      { name: 'Nduja & Honey',         price: 12.00, category: 'Pizza' },
      { name: 'Four Cheese',           price: 11.50, category: 'Pizza' },
      { name: 'Garden Veg',            price: 10.00, category: 'Pizza' },
      { name: 'Garlic Bread',          price: 5.00,  category: 'Sides' },
      { name: 'Rocket & Parmesan',     price: 4.50,  category: 'Sides' },
      { name: 'Olives',                price: 3.50,  category: 'Sides' },
      { name: 'San Pellegrino',        price: 2.50,  category: 'Drinks' },
      { name: 'Coke',                  price: 2.00,  category: 'Drinks' },
    ],
  },
  {
    id: 'burgers',
    label: '🍔 Burger van',
    name: 'Burgers',
    categories: ['Burgers', 'Sides', 'Drinks'],
    items: [
      { name: 'Classic Cheeseburger',  price: 8.50,  category: 'Burgers' },
      { name: 'Double Bacon',          price: 11.00, category: 'Burgers' },
      { name: 'Buttermilk Chicken',    price: 9.50,  category: 'Burgers' },
      { name: 'Halloumi Stack',        price: 9.00,  category: 'Burgers' },
      { name: 'Smash Burger',          price: 8.00,  category: 'Burgers' },
      { name: 'Skin-on Fries',         price: 4.00,  category: 'Sides' },
      { name: 'Loaded Cheese Fries',   price: 6.00,  category: 'Sides' },
      { name: 'Onion Rings',           price: 4.50,  category: 'Sides' },
      { name: 'Craft Lemonade',        price: 3.00,  category: 'Drinks' },
      { name: 'Coke',                  price: 2.00,  category: 'Drinks' },
    ],
  },
  {
    id: 'curries',
    label: '🍛 Curry van',
    name: 'Curries',
    categories: ['Mains', 'Sides', 'Drinks'],
    items: [
      { name: 'Chicken Tikka Masala',  price: 10.50, category: 'Mains' },
      { name: 'Lamb Rogan Josh',       price: 11.50, category: 'Mains' },
      { name: 'Chana Masala',          price: 9.00,  category: 'Mains' },
      { name: 'Butter Chicken',        price: 10.50, category: 'Mains' },
      { name: 'Saag Paneer',           price: 9.50,  category: 'Mains' },
      { name: 'Pilau Rice',            price: 3.50,  category: 'Sides' },
      { name: 'Garlic Naan',           price: 3.50,  category: 'Sides' },
      { name: 'Onion Bhaji',           price: 4.00,  category: 'Sides' },
      { name: 'Mango Lassi',           price: 3.50,  category: 'Drinks' },
      { name: 'Coke',                  price: 2.00,  category: 'Drinks' },
    ],
  },
]

export function getDemoTemplate(id: string | null | undefined): DemoTemplate | null {
  if (!id) return null
  return DEMO_TEMPLATES.find(t => t.id === id) ?? null
}
