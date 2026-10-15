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
//
// ── CODES, NOT WORDS (Language Phase 1c, docs/language-phase-1c-report.md) ────────────────────────────
// An issue is a CODE and its values. The words an operator reads — title, detail, where — come from ONE
// renderer, `goLiveIssueText(issue, locale)` in lib/go-live-text.ts (messages/en-GB.json `goLive`), in the
// truck's language. The gate (Phase 5) needs only the code; the checklist (Phase 4) asks the renderer. So
// this module stays import-free and the words can never be decided in two places.

export type GoLiveCode =
  | 'allergens_unanswered'
  | 'allergens_card_missing'
  | 'allergens_items_unverified'
  | 'no_van'
  | 'kitchen_capacity_unset'
  | 'no_prep_bearing_category'
  | 'email_unverified'

/** One go-live issue: its code and the values its words need. `goLiveIssueText` (lib/go-live-text.ts) turns it
 *  into the operator's words — a short title that names the thing, not the rule; a detail that gives the
 *  CONSEQUENCE of ignoring it in the operator's terms (someone who understands what breaks will fix it; someone
 *  told "this field is required" will resent it); and where they go to resolve it. */
export type GoLiveIssue =
  | { code: 'allergens_unanswered' | 'allergens_card_missing' | 'no_van'; params: Record<string, never> }
  /** `unverified` of the truck's `total` dishes are hidden from customers. */
  | { code: 'allergens_items_unverified'; params: { unverified: number; total: number } }
  /** Each uncapped van's name, in order; null for a van with no name. */
  | { code: 'kitchen_capacity_unset'; params: { vans: (string | null)[] } }
  /** 'none': no active categories at all; 'noPrep': categories, none of them prep-bearing. */
  | { code: 'no_prep_bearing_category'; params: { categories: 'none' | 'noPrep' } }
  /** 'unconfirmed': known not to be confirmed (a blocker); 'unknown': cannot be evaluated yet. */
  | { code: 'email_unverified'; params: { status: 'unconfirmed' | 'unknown' } }

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
    // Words: until they choose, customers see none of their dishes (goLive.allergensUnanswered).
    blockers.push({ code: 'allergens_unanswered', params: {} })
  } else {
    if ((mode === 'card' || mode === 'both') && !hasCard) {
      // Words: customers would be told allergen info is available and find nothing (goLive.allergensCardMissing).
      blockers.push({ code: 'allergens_card_missing', params: {} })
    }
    if ((mode === 'per_dish' || mode === 'both') && unverified > 0) {
      // Words: those dishes are hidden until confirmed, because unconfirmed reads as "contains none"
      // (goLive.allergensItemsUnverified).
      blockers.push({ code: 'allergens_items_unverified', params: { unverified, total: input.items.length } })
    }
  }

  // ── KITCHEN CAPACITY ─────────────────────────────────────────────────────────────────────────────
  // null is not "unset, apply a default" — it removes the GLOBAL concurrency ceiling entirely. Per-category
  // batch sizes still pace individual dishes, so the traffic lights keep working and nothing looks broken;
  // what breaks is the promise. With no ceiling the engine will keep issuing collection times it has no
  // way to honour, and the operator finds out at the hatch. This is the single failure the capacity engine
  // exists to prevent, so a truck must not reach its first real service having never answered it.
  if (input.vans.length === 0) {
    // Words: events run against a van (goLive.noVan).
    blockers.push({ code: 'no_van', params: {} })
  } else {
    const uncapped = input.vans.filter(v => v.kitchen_capacity == null)
    if (uncapped.length > 0) {
      // Every van, not just one: an event scheduled on an uncapped van is uncapped, regardless of what
      // the others are set to.
      // A van with no name (null or '') is null here; the renderer names it ("unnamed van").
      /* ⚠️ RE-POINTED (October 2026): the capacity table moved from Settings › Kitchen to
       * Menu › Kitchen capacity, so a blocker that still said "Settings" would send an operator
       * to a screen that now only carries a pointer. The words a go-live blocker uses are the
       * only directions it gives (goLive.kitchenCapacityUnset.where). */
      blockers.push({ code: 'kitchen_capacity_unset', params: { vans: uncapped.map(v => v.name || null) } })
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
    // Words: with no cooking time, every order looks instant (goLive.noPrepBearingCategory).
    blockers.push({ code: 'no_prep_bearing_category', params: { categories: activeCats.length === 0 ? 'none' : 'noPrep' } })
  }

  // ── OPERATOR EMAIL ───────────────────────────────────────────────────────────────────────────────
  // Not urgent during setup — nothing is public, so an unreachable operator harms nobody. It becomes
  // urgent at exactly this moment: go-live is when real customers start placing real orders, and every
  // recovery path we have (order notifications, password reset, anything going wrong) runs through email.
  if (input.operatorEmailVerified === true) {
    // pass
  } else if (input.operatorEmailVerified === false) {
    blockers.push({ code: 'email_unverified', params: { status: 'unconfirmed' } })    // goLive.emailUnverified
  } else {
    unknown.push({ code: 'email_unverified', params: { status: 'unknown' } })         // goLive.emailUnknown
  }

  return { ok: blockers.length === 0 && unknown.length === 0, blockers, unknown }
}
