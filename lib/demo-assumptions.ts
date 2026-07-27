// lib/demo-assumptions.ts
// The settings the import wizard would normally ASK for, decided silently for the demo (spec §5).
//
// 🔴 categoryPrep IS LOAD-BEARING. commit-menu defaults an absent category to
// `prep_secs: 0, batch_size: 0, counts_toward_capacity: false`, which means EVERY category is instant and
// nothing counts toward the ceiling → the capacity engine has nothing to enforce → every slot stays green
// and no order ever paces. "Adjust kitchen capacity and watch slots respond" is one of the four things the
// demo exists to show, so getting this wrong doesn't degrade the demo, it removes the headline benefit.

import { STANDARD_CATEGORIES, type ExtractedItem } from '@/lib/menu-extract'

/** What commit-menu expects, keyed by category NAME. */
export type CategoryPrep = Record<string, { prep_secs: number | null; batch_size: number | null; counts_toward?: boolean }>

/** §5: a cooked main. 5 minutes, four at a time. */
export const MAIN_PREP_SECS = 300
export const MAIN_BATCH_SIZE = 4

// The extractor is constrained to STANDARD_CATEGORIES, and a FRESH demo truck contributes no custom names
// of its own (the "existing menu" prompt block drops out when the truck is empty) — so for the demo path
// this really is a CLOSED vocabulary. That makes a lookup table strictly better than any price/count
// heuristic: it can't be fooled by a cheap main or a menu with more drinks than dishes.
const KNOWN_MAIN_CATEGORIES = new Set(['Mains', 'Burgers', 'Pizza', 'Wraps & Sandwiches'])
// Things that come out of a fridge or a bag: no cook time, no batch.
const KNOWN_INSTANT_CATEGORIES = new Set(['Sides', 'Dips & Sauces', 'Drinks', 'Desserts'])
// Escape hatches the model uses when a menu doesn't fit — they carry NO signal either way.
const NO_SIGNAL_CATEGORIES = new Set(['Specials', 'Other'])

export interface AssumptionResult {
  categoryPrep: CategoryPrep
  /** Which categories were treated as cooked mains. */
  mainCategories: string[]
  /** True when no category matched the known-mains vocabulary and we fell back to most-populated. */
  usedFallback: boolean
  /** Human-readable note for logs/telemetry — never shown to the visitor. */
  note: string
}

/**
 * Decide per-category prep from an extraction.
 *
 * PRIMARY SIGNAL: the closed STANDARD_CATEGORIES vocabulary.
 * FALLBACK: if nothing matched (a menu that landed mostly in "Specials"/"Other"), apply main-prep to the
 * MOST-POPULATED category rather than leaving everything instant. Rationale: being wrong about which
 * category is "mains" is nearly invisible to a first-time viewer — they see plausible pacing either way —
 * whereas no capacity model at all silently deletes a headline benefit. Never block the menu on this;
 * seeing their own food is the aha.
 */
export function buildDemoAssumptions(
  categories: string[],
  items: Pick<ExtractedItem, 'category'>[],
): AssumptionResult {
  const cats = categories.filter(Boolean)
  const prep: CategoryPrep = {}

  const counts = new Map<string, number>()
  for (const it of items) {
    const c = (it?.category ?? '').trim()
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1)
  }

  const mains = cats.filter(c => KNOWN_MAIN_CATEGORIES.has(c))
  let usedFallback = false
  let note: string

  if (mains.length > 0) {
    note = `matched known main categories: ${mains.join(', ')}`
  } else {
    // Most-populated category wins, excluding ones we KNOW are instant (a coffee van whose biggest
    // category is Drinks should not have its drinks "cooked"). Ties break on the extractor's own ordering,
    // which is stable enough for a demo.
    const candidates = cats.filter(c => !KNOWN_INSTANT_CATEGORIES.has(c))
    const pool = candidates.length > 0 ? candidates : cats
    let best: string | null = null
    let bestCount = -1
    for (const c of pool) {
      const n = counts.get(c) ?? 0
      if (n > bestCount) { best = c; bestCount = n }
    }
    if (best) {
      mains.push(best)
      usedFallback = true
      note = `no known main category (${cats.filter(c => NO_SIGNAL_CATEGORIES.has(c)).length} no-signal categories present) — fell back to most-populated: "${best}" (${bestCount} items)`
    } else {
      note = 'no categories at all — no prep applied'
    }
  }

  const mainSet = new Set(mains)
  for (const c of cats) {
    prep[c] = mainSet.has(c)
      // Cooked categories are auto-counted by the engine (prep_secs > 0 forces counts_toward_capacity),
      // so counts_toward is left alone here — commit-menu derives it.
      ? { prep_secs: MAIN_PREP_SECS, batch_size: MAIN_BATCH_SIZE }
      // Instant. counts_toward:false keeps sides/drinks out of the ceiling so the cooked items pace the
      // kitchen — which is what makes the traffic lights legible.
      : { prep_secs: 0, batch_size: 0, counts_toward: false }
  }

  return { categoryPrep: prep, mainCategories: mains, usedFallback, note }
}

/** Exposed for tests/inspection — the vocabulary the primary signal reads. */
export const DEMO_VOCAB = { STANDARD_CATEGORIES, KNOWN_MAIN_CATEGORIES, KNOWN_INSTANT_CATEGORIES, NO_SIGNAL_CATEGORIES }
