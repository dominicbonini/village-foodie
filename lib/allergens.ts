// lib/allergens.ts — 🔴 THE ALLERGEN LIST A TRUCK USES, BY ITS COUNTRY (US readiness sweep, D35;
// docs/us-readiness-sweep-report.md).
//
// PURE AND CLIENT-SAFE. `country_settings.allergen_set` says which list a country uses ('uk14' | 'us9'); every
// place that offers, checks or asks an AI for allergens reads its list from here.
//
// ── 🔴 NO STORED DATA CHANGES ─────────────────────────────────────────────────────────────────────────────
// A menu item stores its allergens as the LABEL STRINGS themselves ("Dairy", "Gluten"). A US truck simply
// stores the US labels ("Milk", "Wheat"); a UK truck keeps storing the UK ones. Five labels are the same in
// both lists (Eggs, Fish, Peanuts, Tree nuts, Sesame). No US truck exists yet, so nothing needs converting.
//
// ⚠️ THE UK LIST IS COPIED HERE VERBATIM, IN ITS ORDER, from components/manage/primitives.tsx's
// `ALLERGEN_VOCAB` — which now re-exports it, so every UK screen and prompt reads exactly what it did.

export type AllergenSet = 'uk14' | 'us9'

/** The 14 allergens UK law requires a food business to declare. */
export const UK_14 = ['Gluten', 'Crustaceans', 'Eggs', 'Fish', 'Peanuts', 'Soy', 'Dairy', 'Tree nuts', 'Celery', 'Mustard', 'Sesame', 'Sulphites', 'Lupin', 'Molluscs'] as const
/** The 9 major food allergens of US law (FALCPA as amended by the FASTER Act, sesame from 2023). */
export const US_9 = ['Milk', 'Eggs', 'Fish', 'Crustacean shellfish', 'Tree nuts', 'Peanuts', 'Wheat', 'Soybeans', 'Sesame'] as const

/** The list for a country's set. Anything unrecognised is the UK list — the list every truck had before. */
export function allergenVocab(set: AllergenSet | null | undefined): readonly string[] {
  return set === 'us9' ? US_9 : UK_14
}

/**
 * The legacy GENERIC tags a stored item may still carry, and the precise allergens of that family in the
 * country's list. The review screen shows a generic and blocks confirming until the operator picks the
 * precise one(s) — dropping it without a replacement would under-warn.
 * UK: unchanged. US: "Shellfish" means crustacean shellfish (molluscs are not one of the US 9), and a bare
 * "Gluten" must be refined to "Wheat" or left unselected — gluten is not itself a US major allergen.
 */
export function genericReplacements(set: AllergenSet | null | undefined): Record<string, string[]> {
  return set === 'us9'
    ? { Nuts: ['Tree nuts', 'Peanuts'], Shellfish: ['Crustacean shellfish'], Gluten: ['Wheat'] }
    : { Nuts: ['Tree nuts', 'Peanuts'], Shellfish: ['Crustaceans', 'Molluscs'] }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE AI PROMPTS' ALLERGEN LINES. The UK lines are the existing prompts' text, character for character, so a
// UK prompt is byte-identical; the US lines name the US 9 and map menu wording onto them.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════

/** lib/menu-extract.ts — the allergen block of the importer prompt, after the "allergens:" rule line. */
export function menuExtractAllergenLines(set: AllergenSet | null | undefined): string {
  if (set === 'us9') {
    return `  The 9 major US food allergens (use these EXACT names): Milk, Eggs, Fish, Crustacean shellfish, Tree nuts, Peanuts, Wheat, Soybeans, Sesame
  Map common menu wording to these names:
  "dairy"/"lactose"/"cheese"/"cream"/"butter" → Milk; "nuts"/"almonds"/"cashews"/"walnuts"/"pecans"/"hazelnuts" → Tree nuts; "peanuts" → Peanuts;
  "prawn"/"shrimp"/"crab"/"lobster"/"crayfish"/"crawfish" → Crustacean shellfish; "soy"/"soya"/"tofu" → Soybeans; "flour"/"wheat" → Wheat.
  A bare "gluten" (no grain named) is NOT one of the 9 — leave it as "Gluten" (the operator refines it).
  Normalise prefixes — "Includes Milk" / "Contains Milk" both become "Milk"; "May Contain Peanuts" becomes "Peanuts".`
  }
  return `  The 14 UK statutory allergens (use these EXACT names): Gluten, Crustaceans, Eggs, Fish, Peanuts, Soy, Dairy, Tree nuts, Celery, Mustard, Sesame, Sulphites, Lupin, Molluscs
  (Also accept "Lactose" when the menu states it specifically.) Map common menu wording to these names:
  "milk" → Dairy; "nuts"/"almonds"/"cashews"/"walnuts"/"hazelnuts" → Tree nuts; "peanuts"/"groundnuts" → Peanuts;
  "prawn"/"shrimp"/"crab"/"lobster"/"crayfish" → Crustaceans; "mussels"/"clams"/"oysters"/"squid"/"octopus" → Molluscs;
  "soya"/"soybeans" → Soy; "sulphur dioxide"/"sulfites" → Sulphites.
  Normalise prefixes — "Includes Dairy" / "Contains Dairy" both become "Dairy"; "May Contain Peanuts" becomes "Peanuts".`
}

/** The importer prompt's example array for the "allergens:" rule line. */
export function menuExtractAllergenExample(set: AllergenSet | null | undefined): string {
  return set === 'us9' ? '["Milk", "Wheat", "Peanuts"]' : '["Dairy", "Gluten", "Peanuts"]'
}

/** app/api/manage/process-allergens — the card prompt's list block. */
export function allergenCardListLines(set: AllergenSet | null | undefined): string {
  if (set === 'us9') {
    return `Standard allergens to look for (the 9 major US food allergens — use these EXACT names):
Milk, Eggs, Fish, Crustacean shellfish, Tree nuts, Peanuts, Wheat, Soybeans, Sesame`
  }
  return `Standard allergens to look for (the 14 UK statutory allergens — use these EXACT names):
Gluten, Crustaceans, Eggs, Fish, Peanuts, Soy, Dairy, Tree nuts,
Celery, Mustard, Sesame, Sulphites, Lupin, Molluscs`
}

/** The card prompt's closing rule. */
export function allergenCardClosingRule(set: AllergenSet | null | undefined): string {
  if (set === 'us9') {
    return `If information is unclear or not present for a field, use an empty array or null. Be precise — the 9 EXACT
names only; map "dairy"→"Milk", "soy"→"Soybeans". Leave generic "Nuts"/"Shellfish"/"Gluten" as written (the operator refines them).`
  }
  return `If information is unclear or not present for a field, use an empty array or null. Be precise — the 14 EXACT
names only; map "milk"→"Dairy". Leave generic "Nuts"/"Shellfish" as written (the operator refines them).`
}

/** The card prompt's JSON example arrays. */
export function allergenCardExample(set: AllergenSet | null | undefined): { contains: string; mayContain: string; entry: string } {
  return set === 'us9'
    ? { contains: '["Milk", "Wheat", "Eggs"]', mayContain: '["Nuts", "Soybeans"]', entry: '["Peanuts", "Wheat", "Crustacean shellfish"]' }
    : { contains: '["Dairy", "Gluten", "Eggs"]', mayContain: '["Nuts", "Soy"]', entry: '["Peanuts", "Gluten", "Crustaceans"]' }
}
