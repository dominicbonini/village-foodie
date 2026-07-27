// lib/cuisines.ts
// ONE source of truth for the cuisine list + the cuisine→emoji map, shared by the signup wizard
// (components/DemoGetStarted.tsx) and — in a later diff — Settings, whose cuisine input is currently
// free-text (app/manage/[token]/page.tsx:6842 `<Input label="Cuisine type" … placeholder="e.g. Italian,
// Thai, Burgers" />`). Keeping the list here means the two surfaces can never drift.
//
// STORAGE FORMAT: cuisines are written to trucks.cuisine_type as a COMMA-JOINED string ("Pizza, Burgers").
// The live Village Foodie discovery filter splits that column on commas, so a truck tagged "Pizza, Burgers"
// correctly appears under BOTH filters. Do not change that format.

/** The selectable cuisines, ALPHABETICAL, with "Other" last (it reveals a free-text field in the UI). */
export const CUISINES = [
  'Asian',
  'BBQ',
  'Bakery',
  'Burgers',
  'Caribbean',
  'Chicken',
  'Chinese',
  'Coffee',
  'Desserts',
  'Fish & Chips',
  'Greek',
  'Hot Dogs',
  'Indian',
  'Italian',
  'Jacket Potatoes',
  'Kebab',
  'Korean',
  'Mexican',
  'Pie & Mash',
  'Pizza',
  'Seafood',
  'Tacos',
  'Thai',
  'Vegan',
  'Wraps',
  'Other',
] as const

export type Cuisine = (typeof CUISINES)[number]

/** The sentinel the "Other…" option carries in a <select>; a chosen "Other" swaps in a free-text input. */
export const CUISINE_OTHER = 'Other'

/** Cuisine → menu/marker emoji. Pizza defaults to 🍕 (the app's existing default menu icon,
 *  app/manage/[token]/page.tsx:362 `truck?.truck_emoji || '🍕'`). "Other" falls back to 🍽️. */
export const CUISINE_EMOJI: Record<string, string> = {
  'Pizza': '🍕',
  'Burgers': '🍔',
  'Fish & Chips': '🍟',
  'Chicken': '🍗',
  'BBQ': '🍖',
  'Kebab': '🥙',
  'Wraps': '🌯',
  'Tacos': '🌮',
  'Mexican': '🌮',
  'Thai': '🍜',
  'Indian': '🍛',
  'Chinese': '🥡',
  'Asian': '🥢',
  'Korean': '🍲',
  'Caribbean': '🍹',
  'Italian': '🍝',
  'Greek': '🥗',
  'Seafood': '🦞',
  'Hot Dogs': '🌭',
  'Pie & Mash': '🥧',
  'Jacket Potatoes': '🥔',
  'Bakery': '🥐',
  'Desserts': '🧁',
  'Coffee': '☕',
  'Vegan': '🥗',
  'Other': '🍽️',
}

/** The emoji for a cuisine name, or the "Other" fallback (🍽️) for a free-text / unknown cuisine. */
export function emojiForCuisine(name: string | null | undefined): string {
  if (!name) return CUISINE_EMOJI['Other']
  return CUISINE_EMOJI[name.trim()] ?? CUISINE_EMOJI['Other']
}
