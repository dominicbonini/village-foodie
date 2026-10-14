// lib/category-key.ts — 🔴 THE CATEGORY AN ITEM WITH NO CATEGORY IS COUNTED UNDER (Language Phase 0,
// docs/language-phase-0-report.md §2).
//
// PURE. Cook-time and capacity configs are keyed by the LOWER-CASED category name ("mains" for a truck's
// "Mains"), and an item whose category is missing is counted as a main. That fallback was the literal 'mains'
// typed at eight call sites; it is one constant now. ⛔ It is a config KEY, never shown, never translated.
export const DEFAULT_CATEGORY_KEY = 'mains'
