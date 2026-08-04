// lib/go-live-checks.ts
// 🔴 STATUS, 3 AUGUST 2026: UNWIRED. `checkGoLive` has ZERO call sites and this module is imported by no
// file, so NOTHING in the running product is gated by it — not email verification, not capacity, not
// allergens. Two comments elsewhere used to assert otherwise and have been corrected. Keep this module:
// it is intended for nomination (Phase 5). Until it is called, treat every rule below as a specification,
// not as a control that is in force.
//
// The conditions a truck must satisfy before it can be nominated for its first event (spec Stage 8).
//
// ── WHY THIS EXISTS NOW, WITH NO CONSUMERS ─────────────────────────────────────────────────────────
// Nomination is Phase 5. This module is Phase 4 — deliberately. The hazard it guards was found during
// Phase 4's design (see docs/onboarding-flow.md §9.4): resetting `allergen_display_mode` to null on a
// migrated truck recreates the empty-menu trap on a REAL truck, invisibly, until the day it goes live.
// Writing it down as "Phase 5 must remember to check this" is the same shape as every incident this
// codebase has already had — a note is not a mechanism. So the check exists as CODE from the moment the
// hazard was understood, and Phase 5 consumes it rather than re-deriving it.
//
// Phase 4 renders these as a standing, non-dismissible checklist on the dashboard. Phase 5 turns the same
// function into a hard gate on nomination. Same predicate, two consumers, no chance of the visible list
// and the actual gate disagreeing.
//
// ── FAIL-SAFE: UNKNOWN BLOCKS ──────────────────────────────────────────────────────────────────────
// A check that cannot be evaluated is NOT a pass. `unknown` is reported separately from `blockers` (so a
// UI can say "we can't tell yet" rather than "you've done something wrong"), but `ok` requires both to be
// empty. Going live is the moment a truck starts taking money from real customers; "we couldn't check" is
// not a reason to let it through.
//
// ── PURE BY DESIGN ─────────────────────────────────────────────────────────────────────────────────
// No imports, no Supabase, no Next. The caller fetches; this decides. That keeps it trivially testable,
// runnable from a standalone audit script, and impossible to accidentally couple to a request context.

export type GoLiveCode =
  | 'allergens_unanswered'
  | 'allergens_card_missing'
  | 'allergens_items_unverified'
  | 'no_van'
  | 'kitchen_capacity_unset'
  | 'no_prep_bearing_category'
  | 'email_unverified'

export interface GoLiveIssue {
  code: GoLiveCode
  /** Short, operator-facing. Names the thing, not the rule. */
  title: string
  /** The CONSEQUENCE of ignoring it, in the operator's terms — not a restatement of the check. Someone
   *  who understands what breaks will fix it; someone told "this field is required" will resent it. */
  detail: string
  /** Where they go to resolve it. */
  where: string
}

export interface GoLiveInput {
  truck: {
    allergen_display_mode: 'per_dish' | 'card' | 'both' | null
    allergen_info_url?: string | null
    allergen_info_text?: string | null
  }
  /** Every menu item on the truck. Only `allergens_verified` is read. */
  items: { allergens_verified: boolean | null }[]
  /** Every van on the truck. */
  vans: { name?: string | null; kitchen_capacity: number | null }[]
  /** Every menu category. `is_active === false` rows are ignored. */
  categories: {
    name?: string | null
    prep_secs: number | null
    batch_size?: number | null
    counts_toward_capacity: boolean | null
    is_active?: boolean | null
  }[]
  /** Whether the operator's email has been confirmed. `undefined`/`null` ⇒ not yet knowable (the
   *  verification table lands in Phase 4 Step 2) and is reported as UNKNOWN, which blocks. */
  operatorEmailVerified?: boolean | null
}

export interface GoLiveResult {
  ok: boolean
  blockers: GoLiveIssue[]
  unknown: GoLiveIssue[]
}

export function checkGoLive(input: GoLiveInput): GoLiveResult {
  const blockers: GoLiveIssue[] = []
  const unknown: GoLiveIssue[] = []

  // ── ALLERGENS ────────────────────────────────────────────────────────────────────────────────────
  const mode = input.truck.allergen_display_mode ?? null
  const hasCard = !!(input.truck.allergen_info_url || input.truck.allergen_info_text)

  // MIRRORS THE RENDERER EXACTLY. api/menu/[truckId]/route.ts:490 hides on `allergens_verified !== false`
  // — i.e. ONLY an explicit false hides; null (legacy, never touched) and true both stay visible. This
  // count must use the same test, or the checklist and the customer menu disagree about what is hidden,
  // which is worse than either being wrong on its own.
  const unverified = input.items.filter(i => i.allergens_verified === false).length

  if (mode === null) {
    // Null is UNANSWERED, not "per-dish". The renderer treats it as per-dish (correctly — hiding is the
    // over-warn-safe direction), which means a truck that skipped the allergen step behaves identically
    // to one that deliberately chose per-dish. That ambiguity is exactly what this check resolves: an
    // operator who has genuinely chosen per-dish has 'per_dish' stored, and passes below.
    blockers.push({
      code: 'allergens_unanswered',
      title: 'Choose how you show allergen info',
      detail:
        'Until you choose, customers see none of your dishes — the menu protects itself by hiding ' +
        'anything whose allergens are unconfirmed, and right now that is everything.',
      where: 'Menu → Allergens',
    })
  } else {
    if ((mode === 'card' || mode === 'both') && !hasCard) {
      blockers.push({
        code: 'allergens_card_missing',
        title: 'Add your allergen card',
        detail:
          'You have chosen to show an allergen card, but none is saved — so customers would be told ' +
          'allergen info is available and then find nothing.',
        where: 'Menu → Allergens',
      })
    }
    if ((mode === 'per_dish' || mode === 'both') && unverified > 0) {
      blockers.push({
        code: 'allergens_items_unverified',
        title: `Confirm allergens on ${unverified} dish${unverified === 1 ? '' : 'es'}`,
        detail:
          `${unverified} of your ${input.items.length} dishes are hidden from customers until you ` +
          'confirm their allergens. A dish shown without confirmed allergens reads as "contains none", ' +
          'so the menu hides it rather than risk that.',
        where: 'Menu → Allergens',
      })
    }
  }

  // ── KITCHEN CAPACITY ─────────────────────────────────────────────────────────────────────────────
  // null is not "unset, apply a default" — it removes the GLOBAL concurrency ceiling entirely. Per-category
  // batch sizes still pace individual dishes, so the traffic lights keep working and nothing looks broken;
  // what breaks is the promise. With no ceiling the engine will keep issuing collection times it has no
  // way to honour, and the operator finds out at the hatch. This is the single failure the capacity engine
  // exists to prevent, so a truck must not reach its first real service having never answered it.
  if (input.vans.length === 0) {
    blockers.push({
      code: 'no_van',
      title: 'Add a van',
      detail: 'Events run against a van — without one there is nothing to take orders through.',
      where: 'Settings → Vans',
    })
  } else {
    const uncapped = input.vans.filter(v => v.kitchen_capacity == null)
    if (uncapped.length > 0) {
      // Every van, not just one: an event scheduled on an uncapped van is uncapped, regardless of what
      // the others are set to.
      const which = uncapped.map(v => v.name || 'unnamed van').join(', ')
      blockers.push({
        code: 'kitchen_capacity_unset',
        title: 'Set your kitchen capacity',
        detail:
          `No capacity is set for ${which}. Without it we will keep promising customers collection ` +
          'times your kitchen has no way to hit.',
        where: 'Settings → Kitchen capacity',
      })
    }
  }

  // ── SOMETHING FOR THE CEILING TO CONSTRAIN ───────────────────────────────────────────────────────
  // A capacity number with nothing prep-bearing under it is not a capacity model — it is a number.
  //
  // Found on a LIVE truck (real-thai-food, 2026-07-23): kitchen_capacity NULL *and* all four categories
  // at prep_secs 0 / batch_size 0 / counts_toward_capacity false. buildCatConfigs (lib/prep-utils.ts:182)
  // turns batch_size 0 into batch 999, so nothing paces and nothing occupies. Setting kitchen_capacity
  // alone would have satisfied the check above while leaving the truck exactly as unable to pace — the
  // gate would have certified it. That is the whole reason this check exists: the ceiling and the thing
  // it constrains have to be verified together, or passing the gate means nothing.
  //
  // `counts_toward_capacity` is included because a 0-prep category can still legitimately occupy the
  // kitchen (plating, assembling). prep_secs > 0 alone would miss those trucks. Note the engine IGNORES
  // this flag when secs > 0 (prep-bearing always counts) — so `||` matches the engine, not just the column.
  const activeCats = input.categories.filter(c => c.is_active !== false)
  const prepBearing = activeCats.filter(c => (c.prep_secs ?? 0) > 0 || c.counts_toward_capacity === true)
  if (prepBearing.length === 0) {
    blockers.push({
      code: 'no_prep_bearing_category',
      title: 'Tell us how long your food takes',
      detail: activeCats.length === 0
        ? 'You have no menu categories yet, so we have no way to work out how long an order takes.'
        : 'None of your categories has a cooking time set, so every order looks instant to us. We would ' +
          'keep giving customers collection times your kitchen has no chance of hitting, and the busier ' +
          'you get the further out they would be.',
      where: 'Menu → Categories → Kitchen setup',
    })
  }

  // ── OPERATOR EMAIL ───────────────────────────────────────────────────────────────────────────────
  // Not urgent during setup — nothing is public, so an unreachable operator harms nobody. It becomes
  // urgent at exactly this moment: go-live is when real customers start placing real orders, and every
  // recovery path we have (order notifications, password reset, anything going wrong) runs through email.
  if (input.operatorEmailVerified === true) {
    // pass
  } else if (input.operatorEmailVerified === false) {
    blockers.push({
      code: 'email_unverified',
      title: 'Confirm your email address',
      detail:
        'We send order notifications and account recovery to this address. If it is wrong, you find ' +
        'out when something has already gone wrong.',
      where: 'Check your inbox for our confirmation link',
    })
  } else {
    unknown.push({
      code: 'email_unverified',
      title: 'Email confirmation status unknown',
      detail:
        'Email verification is not wired up yet (Phase 4 Step 2), so this cannot be evaluated. It blocks ' +
        'by design rather than passing silently.',
      where: '—',
    })
  }

  return { ok: blockers.length === 0 && unknown.length === 0, blockers, unknown }
}
