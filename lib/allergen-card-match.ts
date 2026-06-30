// lib/allergen-card-match.ts
// Deterministic card-entry → dish matcher + additive-union merge for the import Allergens step.
//
// SAFETY (the spine — see reference-manual §74, over-warn safe / under-warn fatal): a WRONG match writes a
// wrong allergen onto a dish (under-warn = fatal direction), so the bias is "when unsure, DON'T match":
//   • EXACT normalized-name match (exactly one dish) → proposed merge (still verified=false, still reviewed).
//   • NO match → unmatched (operator assigns/dismisses) — NEVER attached to a wrong dish.
//   • MULTI match (>1 dish) → ambiguous with candidates (operator resolves) — NEVER auto-pick one.
// This is the ONLY auto-proposing rule. No fuzzy/containment/threshold ever auto-applies a non-exact match
// (containment is the DEDUP's tool, where a false-positive is recoverable; here it is not). AI may SUGGEST
// assignments for the unmatched/ambiguous lists, but those are operator-CLICKED, never auto-applied.
//
// Reuses the existing exact-normalize primitive `normName` (lowercase, strip non-alphanumeric) — the same
// family used by venue matching — so "Green Curry" ≡ "green curry" but ≠ "Curry".

import { normName } from '@/lib/venue-matcher'

export type CardEntry = { name: string; allergens: string[]; confidence?: string }
export type DishRef = { id: string; name: string }

export type CardMatchResult = {
  // EXACTLY one dish matched (normalized-exact). dishId is the caller's opaque id (a uuid post-commit, or a
  // staged index-as-string during import — the matcher never interprets it).
  matched: Array<{ entry: CardEntry; dishId: string }>
  // Zero dishes matched — surfaced for manual assign/dismiss. Never attached to a dish automatically.
  unmatched: CardEntry[]
  // More than one dish matched — surfaced WITH the candidate dishIds for the operator to resolve.
  ambiguous: Array<{ entry: CardEntry; candidateDishIds: string[] }>
}

/** Stable identity for a card entry (for the resolved-set / React keys) — name + its allergen list. */
export const cardEntryKey = (e: CardEntry) => `${e.name}|${(e.allergens || []).join(',')}`

/** Deterministic exact-only match. Pure; no side effects. */
export function matchCardEntries(entries: CardEntry[], dishes: DishRef[]): CardMatchResult {
  const result: CardMatchResult = { matched: [], unmatched: [], ambiguous: [] }
  for (const entry of entries) {
    const key = normName(entry.name)
    if (!key) { result.unmatched.push(entry); continue }          // empty/garbage name → can't match
    const hits = dishes.filter(d => normName(d.name) === key)
    if (hits.length === 0) result.unmatched.push(entry)
    else if (hits.length === 1) result.matched.push({ entry, dishId: hits[0].id })
    else result.ambiguous.push({ entry, candidateDishIds: hits.map(d => d.id) })
  }
  return result
}

/** Additive UNION — menu-detected ∪ card. NEVER subtractive: a card omission is not evidence of absence, so
 *  a menu-detected allergen is never dropped. Order-preserving (existing first, then new), de-duped. Generics
 *  ("Nuts"/"Shellfish") pass through unchanged — the wizard's existing warn-not-block handling refines/drops
 *  them at confirm (identical to how menu-detected generics are handled). */
export function mergeAllergensUnion(existing: string[], incoming: string[]): string[] {
  const out = [...(existing || [])]
  const seen = new Set(out)
  for (const a of (incoming || [])) {
    if (!seen.has(a)) { out.push(a); seen.add(a) }
  }
  return out
}
