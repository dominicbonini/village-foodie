// lib/allergens.ts — 🔴 THE ALLERGEN LIST A TRUCK USES, BY ITS COUNTRY (US readiness sweep, D35;
// docs/us-readiness-sweep-report.md).
//
// PURE AND CLIENT-SAFE. `country_settings.allergen_set` says which list a country uses ('uk14' | 'us9' | 'anz' | 'ca' | 'jp' | 'br' |
// 'codex'); every
// place that offers, checks or asks an AI for allergens reads its list from here.
//
// ── 🔴 NO STORED DATA CHANGES ─────────────────────────────────────────────────────────────────────────────
// A menu item stores its allergens as the LABEL STRINGS themselves ("Dairy", "Gluten"). A US truck simply
// stores the US labels ("Milk", "Wheat"); a UK truck keeps storing the UK ones. Five labels are the same in
// both lists (Eggs, Fish, Peanuts, Tree nuts, Sesame). No US truck exists yet, so nothing needs converting.
//
// ⚠️ THE UK LIST IS COPIED HERE VERBATIM, IN ITS ORDER, from components/manage/primitives.tsx's
// `ALLERGEN_VOCAB` — which now re-exports it, so every UK screen and prompt reads exactly what it did.

export type AllergenSet = 'uk14' | 'us9' | 'anz' | 'ca' | 'jp' | 'br' | 'codex'
/** Every allergen set, for validation (lib/country-settings.ts, lib/admin/country-form.ts). world-countries-1: jp, br, codex. */
export const ALLERGEN_SETS: readonly AllergenSet[] = ['uk14', 'us9', 'anz', 'ca', 'jp', 'br', 'codex']

/** The 14 allergens UK law requires a food business to declare. */
export const UK_14 = ['Gluten', 'Crustaceans', 'Eggs', 'Fish', 'Peanuts', 'Soy', 'Dairy', 'Tree nuts', 'Celery', 'Mustard', 'Sesame', 'Sulphites', 'Lupin', 'Molluscs'] as const
/** The 9 major food allergens of US law (FALCPA as amended by the FASTER Act, sesame from 2023). */
export const US_9 = ['Milk', 'Eggs', 'Fish', 'Crustacean shellfish', 'Tree nuts', 'Peanuts', 'Wheat', 'Soybeans', 'Sesame'] as const
/** anz-1 (21 October 2026): the allergens Australia and New Zealand require a food business to declare — Food Standards
 *  Code, plain English allergen labelling (PEAL): the cereals and the tree nuts are each NAMED (no "Gluten", no "Tree
 *  nuts"), sulphites only when ADDED (10 mg/kg or more); no celery, no mustard. Singular, as the Code writes them.
 *  A flat list like the other two — every surface renders it as ordinary entries (chips wrap; the wizard table is sized
 *  from the list's length). */
export const ANZ = ['Wheat', 'Barley', 'Rye', 'Oats', 'Milk', 'Egg', 'Fish', 'Crustacean', 'Mollusc', 'Sesame', 'Lupin', 'Soy', 'Peanut',
  'Added sulphites', 'Almond', 'Brazil nut', 'Cashew', 'Hazelnut', 'Macadamia', 'Pecan', 'Pine nut', 'Pistachio', 'Walnut'] as const
/** canada-1 (22 October 2026): Health Canada's PRIORITY FOOD ALLERGENS — peanuts, tree nuts, sesame, milk, eggs, fish,
 *  crustaceans, molluscs, soy, wheat and triticale, mustard and sulphites (added, 10 ppm or more) — and the other gluten
 *  sources (barley, oats, rye) as one entry. Health Canada groups "Crustaceans and molluscs" as one priority allergen; they
 *  are two entries here, as in the UK list, so a menu can say which. A flat list like the others.
 *  https://www.canada.ca/en/health-canada/services/food-allergies-intolerances/avoiding-allergens-food/allergen-labelling.html
 *  https://inspection.canada.ca/en/food-labels/labelling/industry/list-ingredients-and-allergens */
export const CA = ['Peanuts', 'Tree nuts', 'Sesame', 'Milk', 'Eggs', 'Fish', 'Crustaceans', 'Molluscs', 'Soy', 'Wheat and triticale', 'Mustard',
  'Added sulphites', 'Gluten (barley, oats, rye)'] as const
/** world-countries-1 (31 October 2026, docs/world-countries-1-report.md §2): JAPAN — the Consumer Affairs Agency's list under the
 *  Food Labeling Standards (食品表示基準): the 8 SPECIFIED RAW MATERIALS a label must declare (特定原材料: えび, かに, くるみ — mandatory
 *  since April 2025 —, 小麦, そば, 卵, 乳, 落花生) first, then the 20 RECOMMENDED ones (特定原材料に準ずるもの, as revised in 2024:
 *  macadamia added, matsutake removed). Declaring allergens is not mandatory for food service (外食) in Japan; this is the list a
 *  Japanese diner expects to see. Flat, like the others; the eight come first so a menu shows them first. ⚠️ Flagged for Dominic. */
export const JP = ['Shrimp', 'Crab', 'Walnut', 'Wheat', 'Buckwheat', 'Egg', 'Milk', 'Peanut',
  'Almond', 'Abalone', 'Squid', 'Salmon roe', 'Orange', 'Cashew', 'Kiwi fruit', 'Beef', 'Sesame', 'Salmon', 'Mackerel', 'Soybean',
  'Chicken', 'Banana', 'Pork', 'Macadamia', 'Peach', 'Yam', 'Apple', 'Gelatin'] as const
/** world-countries-1: BRAZIL — ANVISA RDC 26/2015 (the 17 groups of its annex, the cereals and tree nuts named one by one, and
 *  natural latex) plus LACTOSE (RDC 136/2017, declared on its own). Packaged-food law; food service follows it in practice.
 *  ⚠️ Flagged for Dominic. */
export const BR = ['Wheat', 'Rye', 'Barley', 'Oats', 'Crustaceans', 'Eggs', 'Fish', 'Peanuts', 'Soy', 'Milk', 'Almond', 'Hazelnut',
  'Cashew', 'Brazil nut', 'Macadamia', 'Walnut', 'Pecan', 'Pistachio', 'Pine nut', 'Chestnut', 'Natural latex', 'Lactose'] as const
/** world-countries-1: THE CODEX LIST (Codex General Standard for the Labelling of Prepackaged Foods, CXS 1-1985 §4.2.1.4) — cereals
 *  containing gluten, crustacea, eggs, fish, peanuts, soybeans, milk, tree nuts and sulphites of 10 mg/kg or more — which
 *  Mexico (NOM-051-SCFI/SSA1-2010), Singapore (Food Regulations), Hong Kong (Food and Drugs (Composition and Labelling)
 *  Regulations), Malaysia (Food Regulations 1985), Thailand (MOPH Notification 367) and the UAE (GSO 9/2013) each adopt for
 *  packaged food. The labels are the ones the other lists already use, so nothing new is translated. ⚠️ Flagged for Dominic. */
export const CODEX = ['Gluten', 'Crustaceans', 'Eggs', 'Fish', 'Peanuts', 'Soy', 'Milk', 'Tree nuts', 'Sulphites'] as const
const BR_TREE_NUTS = ['Almond', 'Hazelnut', 'Cashew', 'Brazil nut', 'Macadamia', 'Walnut', 'Pecan', 'Pistachio', 'Pine nut', 'Chestnut'] as const

/** The nine tree nuts the ANZ list names one by one. */
export const ANZ_TREE_NUTS = ['Almond', 'Brazil nut', 'Cashew', 'Hazelnut', 'Macadamia', 'Pecan', 'Pine nut', 'Pistachio', 'Walnut'] as const

/** The list for a country's set. Anything unrecognised is the UK list — the list every truck had before. */
export function allergenVocab(set: AllergenSet | null | undefined): readonly string[] {
  return set === 'us9' ? US_9 : set === 'anz' ? ANZ : set === 'ca' ? CA : set === 'jp' ? JP : set === 'br' ? BR : set === 'codex' ? CODEX : UK_14
}

/**
 * The legacy GENERIC tags a stored item may still carry, and the precise allergens of that family in the
 * country's list. The review screen shows a generic and blocks confirming until the operator picks the
 * precise one(s) — dropping it without a replacement would under-warn.
 * UK: unchanged. US: "Shellfish" means crustacean shellfish (molluscs are not one of the US 9), and a bare
 * "Gluten" must be refined to "Wheat" or left unselected — gluten is not itself a US major allergen.
 */
export function genericReplacements(set: AllergenSet | null | undefined): Record<string, string[]> {
  // anz: the Code names cereals and tree nuts one by one, so "Gluten", "Tree nuts" and "Nuts" are generics here, and so
  // are the UK/US labels a copied or imported menu may carry ("Dairy", "Eggs", …) — each must be refined to the ANZ
  // label(s) before it is confirmed, never dropped (dropping would under-warn).
  // canada-1: the UK / US / ANZ labels a copied or imported menu may carry, refined to the Canadian ones. "Gluten" may be
  // either cereal entry; "Shellfish" either of crustaceans and molluscs.
  // world-countries-1: the other lists' labels a copied or imported menu may carry, refined to each new list's own (never dropped).
  if (set === 'jp') {
    return {
      Nuts: ['Walnut', 'Almond', 'Cashew', 'Macadamia', 'Peanut'], 'Tree nuts': ['Walnut', 'Almond', 'Cashew', 'Macadamia'], Gluten: ['Wheat'],
      Shellfish: ['Shrimp', 'Crab', 'Abalone', 'Squid'], Crustaceans: ['Shrimp', 'Crab'], Crustacean: ['Shrimp', 'Crab'], 'Crustacean shellfish': ['Shrimp', 'Crab'],
      Molluscs: ['Abalone', 'Squid'], Mollusc: ['Abalone', 'Squid'], Dairy: ['Milk'], Eggs: ['Egg'], Peanuts: ['Peanut'], Soy: ['Soybean'], Soybeans: ['Soybean'],
      'Wheat and triticale': ['Wheat'],
    }
  }
  if (set === 'br') {
    return {
      Nuts: [...BR_TREE_NUTS, 'Peanuts'], 'Tree nuts': [...BR_TREE_NUTS], Gluten: ['Wheat', 'Rye', 'Barley', 'Oats'], Shellfish: ['Crustaceans'],
      Crustacean: ['Crustaceans'], 'Crustacean shellfish': ['Crustaceans'], Dairy: ['Milk'], Egg: ['Eggs'], Peanut: ['Peanuts'], Soybeans: ['Soy'],
      'Wheat and triticale': ['Wheat'], 'Gluten (barley, oats, rye)': ['Barley', 'Oats', 'Rye'],
    }
  }
  if (set === 'codex') {
    return {
      Nuts: ['Tree nuts', 'Peanuts'], Shellfish: ['Crustaceans'], Crustacean: ['Crustaceans'], 'Crustacean shellfish': ['Crustaceans'],
      Dairy: ['Milk'], Egg: ['Eggs'], Peanut: ['Peanuts'], Soybeans: ['Soy'], Wheat: ['Gluten'], Barley: ['Gluten'], Rye: ['Gluten'], Oats: ['Gluten'],
      'Wheat and triticale': ['Gluten'], 'Gluten (barley, oats, rye)': ['Gluten'], 'Added sulphites': ['Sulphites'],
      Almond: ['Tree nuts'], 'Brazil nut': ['Tree nuts'], Cashew: ['Tree nuts'], Hazelnut: ['Tree nuts'], Macadamia: ['Tree nuts'], Pecan: ['Tree nuts'],
      'Pine nut': ['Tree nuts'], Pistachio: ['Tree nuts'], Walnut: ['Tree nuts'],
    }
  }
  if (set === 'ca') {
    return {
      Nuts: ['Tree nuts', 'Peanuts'], Shellfish: ['Crustaceans', 'Molluscs'], Gluten: ['Wheat and triticale', 'Gluten (barley, oats, rye)'],
      Dairy: ['Milk'], Wheat: ['Wheat and triticale'], 'Crustacean shellfish': ['Crustaceans'], Crustacean: ['Crustaceans'], Mollusc: ['Molluscs'],
      Egg: ['Eggs'], Peanut: ['Peanuts'], Soybeans: ['Soy'], Sulphites: ['Added sulphites'], Barley: ['Gluten (barley, oats, rye)'], Oats: ['Gluten (barley, oats, rye)'],
      Rye: ['Gluten (barley, oats, rye)'],
    }
  }
  if (set === 'anz') {
    return {
      Nuts: [...ANZ_TREE_NUTS, 'Peanut'], 'Tree nuts': [...ANZ_TREE_NUTS], Gluten: ['Wheat', 'Barley', 'Rye', 'Oats'],
      Shellfish: ['Crustacean', 'Mollusc'], Crustaceans: ['Crustacean'], 'Crustacean shellfish': ['Crustacean'], Molluscs: ['Mollusc'],
      Dairy: ['Milk'], Eggs: ['Egg'], Peanuts: ['Peanut'], Soybeans: ['Soy'], Sulphites: ['Added sulphites'],
    }
  }
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
  if (set === 'jp') {
    return `  The allergens of Japanese food labelling — the 8 specified raw materials, then the 20 recommended (use these EXACT names): ${JP.join(', ')}
  Map common menu wording to these names:
  "prawn"/"shrimp"/"ebi" → Shrimp; "crab"/"kani" → Crab; "flour"/"wheat"/"udon"/"ramen noodles" → Wheat; "soba"/"buckwheat" → Buckwheat; "eggs"/"tamago" → Egg;
  "dairy"/"cheese"/"butter"/"cream"/"lactose" → Milk; "peanuts"/"groundnuts" → Peanut; "soy"/"soya"/"tofu"/"miso"/"soy sauce"/"edamame" → Soybean; "ikura" → Salmon roe;
  "sesame seeds"/"goma" → Sesame; "saba" → Mackerel; "squid"/"ika" → Squid; "nagaimo"/"yamaimo"/"yam" → Yam.
  A bare "nuts"/"tree nuts" (no nut named), a bare "gluten" or a bare "shellfish" is NOT one of these names — leave it as written (the operator refines it).
  Normalise prefixes — "Includes Milk" / "Contains Milk" both become "Milk"; "May Contain Peanut" becomes "Peanut".`
  }
  if (set === 'br') {
    return `  The allergens Brazilian food law requires to be declared (ANVISA RDC 26/2015, and lactose) (use these EXACT names): ${BR.join(', ')}
  Map common menu wording to these names:
  "dairy"/"cheese"/"cream"/"butter" → Milk; "lactose" → Lactose; "egg" → Eggs; "peanut"/"groundnuts" → Peanuts; "soya"/"soybeans"/"tofu" → Soy;
  "prawn"/"shrimp"/"crab"/"lobster" → Crustaceans; "flour"/"wheat" → Wheat; "almonds" → Almond, "cashews" → Cashew, "Brazil nuts"/"Pará nuts" → Brazil nut (each tree nut by its own name); "latex" → Natural latex.
  A bare "nuts"/"tree nuts" (no nut named) or a bare "gluten" (no grain named) is NOT one of these names — leave it as "Nuts"/"Tree nuts"/"Gluten" (the operator refines it).
  Normalise prefixes — "Includes Milk" / "Contains Milk" both become "Milk"; "May Contain Peanuts" becomes "Peanuts".`
  }
  if (set === 'codex') {
    return `  The allergens of the Codex labelling standard your country follows (use these EXACT names): ${CODEX.join(', ')}
  Map common menu wording to these names:
  "dairy"/"lactose"/"cheese"/"cream"/"butter" → Milk; "egg" → Eggs; "peanut"/"groundnuts" → Peanuts; "nuts"/"almonds"/"cashews"/"walnuts"/"pecans"/"hazelnuts" → Tree nuts;
  "soya"/"soybeans"/"tofu" → Soy; "prawn"/"shrimp"/"crab"/"lobster"/"crayfish" → Crustaceans; "flour"/"wheat"/"barley"/"rye"/"oats" → Gluten; "sulphur dioxide"/"sulfites" → Sulphites.
  Normalise prefixes — "Includes Milk" / "Contains Milk" both become "Milk"; "May Contain Peanuts" becomes "Peanuts".`
  }
  if (set === 'ca') {
    return `  The priority food allergens of Canadian food law (use these EXACT names): ${CA.join(', ')}
  Map common menu wording to these names:
  "dairy"/"lactose"/"cheese"/"cream"/"butter" → Milk; "egg" → Eggs; "peanut"/"groundnuts" → Peanuts; "nuts"/"almonds"/"cashews"/"walnuts"/"pecans"/"hazelnuts" → Tree nuts;
  "soya"/"soybeans"/"tofu" → Soy; "shrimp"/"prawn"/"crab"/"lobster" → Crustaceans; "mussels"/"clams"/"oysters"/"scallops"/"squid" → Molluscs;
  "sulphur dioxide"/"sulfites"/"sulphites" → Added sulphites; "flour"/"wheat"/"triticale" → Wheat and triticale; "barley"/"oats"/"rye" → Gluten (barley, oats, rye).
  A bare "gluten" (no grain named) is NOT one of these names — leave it as "Gluten" (the operator refines it).
  Normalise prefixes — "Includes Milk" / "Contains Milk" both become "Milk"; "May Contain Peanuts" becomes "Peanuts".`
  }
  if (set === 'anz') {
    return `  The allergens Australian and New Zealand food law requires to be declared (use these EXACT names): ${ANZ.join(', ')}
  Map common menu wording to these names:
  "dairy"/"lactose"/"cheese"/"cream"/"butter" → Milk; "eggs" → Egg; "peanuts"/"groundnuts" → Peanut; "soya"/"soybeans"/"tofu" → Soy;
  "prawn"/"shrimp"/"crab"/"lobster"/"crayfish"/"bugs" → Crustacean; "mussels"/"clams"/"oysters"/"pipis"/"squid"/"octopus" → Mollusc;
  "sulphur dioxide"/"sulfites"/"sulphites" → Added sulphites; "flour"/"wheat" → Wheat; "almonds" → Almond, "cashews" → Cashew (each tree nut by its own name).
  A bare "nuts"/"tree nuts" (no nut named) or a bare "gluten" (no grain named) is NOT one of these names — leave it as "Nuts"/"Tree nuts"/"Gluten" (the operator refines it).
  Normalise prefixes — "Includes Milk" / "Contains Milk" both become "Milk"; "May Contain Peanut" becomes "Peanut".`
  }
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
  if (set === 'jp') return '["Milk", "Wheat", "Peanut"]'
  if (set === 'br') return '["Milk", "Wheat", "Peanuts"]'
  if (set === 'codex') return '["Milk", "Gluten", "Peanuts"]'
  if (set === 'ca') return '["Milk", "Wheat and triticale", "Peanuts"]'
  if (set === 'anz') return '["Milk", "Wheat", "Peanut"]'
  return set === 'us9' ? '["Milk", "Wheat", "Peanuts"]' : '["Dairy", "Gluten", "Peanuts"]'
}

/** app/api/manage/process-allergens — the card prompt's list block. */
export function allergenCardListLines(set: AllergenSet | null | undefined): string {
  if (set === 'jp') {
    return `Standard allergens to look for (Japanese food labelling: the 8 specified raw materials, then the 20 recommended — use these EXACT names):
${JP.slice(0, 8).join(', ')},
${JP.slice(8).join(', ')}`
  }
  if (set === 'br') {
    return `Standard allergens to look for (the allergens Brazilian food law requires to be declared — use these EXACT names):
${BR.slice(0, 10).join(', ')},
${BR.slice(10).join(', ')}`
  }
  if (set === 'codex') {
    return `Standard allergens to look for (the Codex labelling standard's allergens — use these EXACT names):
${CODEX.join(', ')}`
  }
  if (set === 'ca') {
    return `Standard allergens to look for (the priority food allergens of Canadian food law — use these EXACT names):
${CA.slice(0, 7).join(', ')},
${CA.slice(7).join(', ')}`
  }
  if (set === 'anz') {
    return `Standard allergens to look for (the allergens Australian and New Zealand food law requires to be declared — use these EXACT names):
${ANZ.slice(0, 14).join(', ')},
${ANZ.slice(14).join(', ')}`
  }
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
  if (set === 'jp') {
    return `If information is unclear or not present for a field, use an empty array or null. Be precise — the EXACT names
only; map "dairy"→"Milk", "eggs"→"Egg", "prawn"→"Shrimp", "soy"→"Soybean", "soba"→"Buckwheat". Leave generic
"Nuts"/"Tree nuts"/"Shellfish"/"Gluten" as written (the operator refines them).`
  }
  if (set === 'br') {
    return `If information is unclear or not present for a field, use an empty array or null. Be precise — the EXACT names
only; map "dairy"→"Milk", and name each tree nut and each cereal on its own. Leave generic "Nuts"/"Tree nuts"/"Shellfish"/"Gluten"
as written (the operator refines them).`
  }
  if (set === 'codex') {
    return `If information is unclear or not present for a field, use an empty array or null. Be precise — the 9 EXACT
names only; map "dairy"→"Milk", "wheat"→"Gluten", "sulfites"→"Sulphites". Leave generic "Nuts"/"Shellfish" as written (the operator refines them).`
  }
  if (set === 'ca') {
    return `If information is unclear or not present for a field, use an empty array or null. Be precise — the EXACT names
only; map "dairy"→"Milk", "sulphites"→"Added sulphites", "wheat"→"Wheat and triticale", and "barley"/"oats"/"rye"→"Gluten (barley, oats, rye)".
Leave generic "Nuts"/"Shellfish"/"Gluten" as written (the operator refines them).`
  }
  if (set === 'anz') {
    return `If information is unclear or not present for a field, use an empty array or null. Be precise — the EXACT names
only; map "dairy"→"Milk", "eggs"→"Egg", "sulphites"→"Added sulphites", and name each tree nut and each cereal on its own. Leave generic
"Nuts"/"Tree nuts"/"Shellfish"/"Gluten" as written (the operator refines them).`
  }
  if (set === 'us9') {
    return `If information is unclear or not present for a field, use an empty array or null. Be precise — the 9 EXACT
names only; map "dairy"→"Milk", "soy"→"Soybeans". Leave generic "Nuts"/"Shellfish"/"Gluten" as written (the operator refines them).`
  }
  return `If information is unclear or not present for a field, use an empty array or null. Be precise — the 14 EXACT
names only; map "milk"→"Dairy". Leave generic "Nuts"/"Shellfish" as written (the operator refines them).`
}

/** The card prompt's JSON example arrays. */
export function allergenCardExample(set: AllergenSet | null | undefined): { contains: string; mayContain: string; entry: string; freeFrom: string; blanket: string } {
  // freeFrom / blanket (anz-1): the card prompt's two remaining example arrays — the UK/US prompt's own literals, so those
  // prompts are byte-identical; an ANZ prompt names ANZ labels ("Tree nuts" is not one).
  if (set === 'jp') return { contains: '["Milk", "Wheat", "Egg"]', mayContain: '["Nuts", "Soybean"]', entry: '["Peanut", "Wheat", "Shrimp"]', freeFrom: '["Crab", "Salmon"]', blanket: '["Peanut"]' }
  if (set === 'br') return { contains: '["Milk", "Wheat", "Eggs"]', mayContain: '["Nuts", "Soy"]', entry: '["Peanuts", "Wheat", "Crustaceans"]', freeFrom: '["Crustaceans", "Fish"]', blanket: '["Peanuts"]' }
  if (set === 'codex') return { contains: '["Milk", "Gluten", "Eggs"]', mayContain: '["Nuts", "Soy"]', entry: '["Peanuts", "Gluten", "Crustaceans"]', freeFrom: '["Shellfish", "Fish"]', blanket: '["Tree nuts"]' }
  if (set === 'ca') return { contains: '["Milk", "Wheat and triticale", "Eggs"]', mayContain: '["Nuts", "Soy"]', entry: '["Peanuts", "Wheat and triticale", "Crustaceans"]', freeFrom: '["Shellfish", "Fish"]', blanket: '["Tree nuts"]' }
  if (set === 'anz') return { contains: '["Milk", "Wheat", "Egg"]', mayContain: '["Nuts", "Soy"]', entry: '["Peanut", "Wheat", "Crustacean"]', freeFrom: '["Crustacean", "Fish"]', blanket: '["Peanut"]' }
  return set === 'us9'
    ? { contains: '["Milk", "Wheat", "Eggs"]', mayContain: '["Nuts", "Soybeans"]', entry: '["Peanuts", "Wheat", "Crustacean shellfish"]', freeFrom: '["Shellfish", "Fish"]', blanket: '["Tree nuts"]' }
    : { contains: '["Dairy", "Gluten", "Eggs"]', mayContain: '["Nuts", "Soy"]', entry: '["Peanuts", "Gluten", "Crustaceans"]', freeFrom: '["Shellfish", "Fish"]', blanket: '["Tree nuts"]' }
}

/**
 * anz-1 (21 October 2026): the importer prompt's WORKED EXAMPLES name UK labels ("Dairy", "Crustaceans", …) in its
 * example JSON. For an ANZ truck those labels are not in the list, so they are swapped for the ANZ ones, exactly and
 * only where the examples write them. Any other set gets the text back unchanged — a UK or US prompt is byte-identical.
 */
export function localiseExampleAllergens(text: string, set: AllergenSet | null | undefined): string {
  // canada-1: the same four swaps for a Canadian truck, onto the Canadian labels.
  if (set === 'ca') {
    return text
      .replace('(e.g. Prawn →\n  ["Crustaceans"], Cheese → ["Dairy"], Halloumi → ["Dairy"])', '(e.g. Prawn →\n  ["Crustaceans"], Cheese → ["Milk"], Halloumi → ["Milk"])')
      .replace('"allergens": ["Dairy", "Lactose", "Gluten", "Eggs"]', '"allergens": ["Milk", "Wheat and triticale", "Eggs"]')
  }
  // world-countries-1: the same swaps for the three new lists, onto their own labels.
  if (set === 'jp') {
    return text
      .replace('(e.g. Prawn →\n  ["Crustaceans"], Cheese → ["Dairy"], Halloumi → ["Dairy"])', '(e.g. Prawn →\n  ["Shrimp"], Cheese → ["Milk"], Halloumi → ["Milk"])')
      .replace('"allergens": ["Dairy", "Lactose", "Gluten", "Eggs"]', '"allergens": ["Milk", "Wheat", "Egg"]')
      .replace('"allergens": ["Peanuts", "Eggs"]', '"allergens": ["Peanut", "Egg"]')
      .replace('"allergens": ["Crustaceans"]', '"allergens": ["Shrimp"]')
  }
  if (set === 'br') {
    return text
      .replace('(e.g. Prawn →\n  ["Crustaceans"], Cheese → ["Dairy"], Halloumi → ["Dairy"])', '(e.g. Prawn →\n  ["Crustaceans"], Cheese → ["Milk"], Halloumi → ["Milk"])')
      .replace('"allergens": ["Dairy", "Lactose", "Gluten", "Eggs"]', '"allergens": ["Milk", "Lactose", "Wheat", "Eggs"]')
  }
  if (set === 'codex') {
    return text
      .replace('(e.g. Prawn →\n  ["Crustaceans"], Cheese → ["Dairy"], Halloumi → ["Dairy"])', '(e.g. Prawn →\n  ["Crustaceans"], Cheese → ["Milk"], Halloumi → ["Milk"])')
      .replace('"allergens": ["Dairy", "Lactose", "Gluten", "Eggs"]', '"allergens": ["Milk", "Gluten", "Eggs"]')
  }
  if (set !== 'anz') return text
  return text
    .replace('(e.g. Prawn →\n  ["Crustaceans"], Cheese → ["Dairy"], Halloumi → ["Dairy"])', '(e.g. Prawn →\n  ["Crustacean"], Cheese → ["Milk"], Halloumi → ["Milk"])')
    .replace('"allergens": ["Dairy", "Lactose", "Gluten", "Eggs"]', '"allergens": ["Milk", "Wheat", "Egg"]')
    .replace('"allergens": ["Peanuts", "Eggs"]', '"allergens": ["Peanut", "Egg"]')
    .replace('"allergens": ["Crustaceans"]', '"allergens": ["Crustacean"]')
}
