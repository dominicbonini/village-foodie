// lib/modifier-rules.ts
// Pure modifier-group selection rules — the single source of truth for required / single-select
// enforcement. No React, no server imports, so it's shared by the customer order modal (A1), and
// (A2) the operator AddOrderPanel modal + a submit-side guard.
//
// MATCHING KEY (decision): the selection is the existing basket modifier shape — { name, price } —
// which carries NO group or option id. So group membership + sibling matching here is by NAME,
// SCOPED to a group's own option list (we only treat a selected entry as belonging to a group if
// its name appears in that group's options). This does NOT assume globally-unique option names;
// the one residual ambiguity is the SAME option name appearing in TWO different groups and selected
// in both (rare). If that ever occurs, the hardening path (A2) is to thread option id into the
// selection. Within-group, option names are assumed distinct (a sane editor constraint).

export interface ModRuleOption {
  id: string
  name: string
  price_adjustment: number
  available?: boolean
  // D2: out-of-stock derived from stock_count===0 (mirrors isModifierAvailable). Included in the
  // "selectable" check below so a required group whose only option is sold-out (manual OR stock-0)
  // is treated as not-enforceable → no dead-end.
  stock_count?: number | null
  // Per-option allergens/dietary (Stage C) — carried onto the selection so they reach the
  // basket line / ticket / email (the option object is the only source those surfaces have).
  allergens?: string[]
  dietary?: string[]
}

export interface ModRuleGroup {
  id: string
  name: string
  is_required?: boolean
  min_choices?: number
  max_choices?: number
  options: ModRuleOption[]
}

export interface SelectedMod {
  name: string
  price: number
  // Frozen onto the order at selection time (Stage C) — order-time allergens persist even if the
  // menu later changes (correct for a safety field). Optional: absent for options without allergens.
  allergens?: string[]
  dietary?: string[]
}

/** Build a selection entry from an option, carrying its allergen/dietary fields (Stage C). */
function selectedFromOption(option: ModRuleOption): SelectedMod {
  const entry: SelectedMod = { name: option.name, price: option.price_adjustment }
  if (option.allergens && option.allergens.length) entry.allergens = option.allergens
  if (option.dietary && option.dietary.length) entry.dietary = option.dietary
  return entry
}

/** Names of a group's options — the scope for membership/sibling matching. */
function groupOptionNames(group: ModRuleGroup): Set<string> {
  return new Set((group.options || []).map(o => o.name))
}

/** How many currently-selected entries belong to this group (by name-within-group). */
export function selectedCountForGroup(group: ModRuleGroup, selected: SelectedMod[]): number {
  const names = groupOptionNames(group)
  return selected.filter(s => names.has(s.name)).length
}

/**
 * Toggle an option, applying the group's selection rules.
 * - Already selected → deselect it.
 * - Single-select (max_choices === 1) → remove any OTHER selected option of THIS group, then add
 *   (radio behaviour).
 * - Multi-select → additive, but if max_choices is set < 99 and the group is already at that cap,
 *   the toggle is ignored (no-op) rather than exceeding the cap.
 */
export function toggleWithGroupRules(
  selected: SelectedMod[],
  option: ModRuleOption,
  group: ModRuleGroup,
): SelectedMod[] {
  const already = selected.some(s => s.name === option.name)
  if (already) return selected.filter(s => s.name !== option.name)

  const max = group.max_choices ?? 99

  if (max === 1) {
    const names = groupOptionNames(group)
    const withoutSiblings = selected.filter(s => !names.has(s.name))
    return [...withoutSiblings, selectedFromOption(option)]
  }

  if (max < 99 && selectedCountForGroup(group, selected) >= max) {
    return selected // at the multi-select cap — ignore
  }
  return [...selected, selectedFromOption(option)]
}

/** Effective minimum required selections for a group (0 = not required). */
export function minRequiredForGroup(group: ModRuleGroup): number {
  const required = !!group.is_required || (group.min_choices ?? 0) >= 1
  if (!required) return 0
  return Math.max(group.min_choices ?? 0, group.is_required ? 1 : 0)
}

/** REQUIRED groups first (then optional), preserving relative order within each (stable sort). The
 *  single source of group ordering — used by the customer/operator item modals AND the deal modal so
 *  every surface shows required groups (e.g. Protein) before optional (e.g. Extras), consistently. */
export function sortGroupsRequiredFirst<T extends ModRuleGroup>(groups: T[]): T[] {
  return [...groups].sort((a, b) => (minRequiredForGroup(b) > 0 ? 1 : 0) - (minRequiredForGroup(a) > 0 ? 1 : 0))
}

/**
 * True if ANY REQUIRED group has ZERO selectable options (all manual-sold-out or stock-0). Such an
 * item is UNORDERABLE — there's a mandatory choice with nothing to pick — so callers mark it SOLD OUT
 * (rather than `validateModifierSelection` skipping the group, which would let it through unchosen).
 * Keys ONLY on required groups (optional all-sold-out just hides that extra). Reuses the same
 * selectable predicate as validateModifierSelection (:options available !== false && stock_count !== 0).
 */
export function hasUnsatisfiableRequiredGroup(groups: ModRuleGroup[]): boolean {
  return (groups || []).some(g =>
    minRequiredForGroup(g) > 0 &&
    (g.options || []).filter(o => o.available !== false && o.stock_count !== 0).length === 0)
}

/**
 * Which required groups are UNMET by the current selection. A required group with ZERO selectable
 * (available) options is treated as NOT enforceable (skipped) so it can't block add-to-basket forever.
 */
export function validateModifierSelection(
  groups: ModRuleGroup[],
  selected: SelectedMod[],
): { unmetGroupIds: string[]; unmetGroupNames: string[] } {
  const unmet = (groups || []).filter(g => {
    const min = minRequiredForGroup(g)
    if (min <= 0) return false
    const selectable = (g.options || []).filter(o => o.available !== false && o.stock_count !== 0)
    if (selectable.length === 0) return false // required but unsatisfiable (manual sold-out or stock-0) → skip
    return selectedCountForGroup(g, selected) < min
  })
  return { unmetGroupIds: unmet.map(g => g.id), unmetGroupNames: unmet.map(g => g.name) }
}
