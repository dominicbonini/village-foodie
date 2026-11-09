// lib/menu-import-review.ts — demo-claim-2 (9 November 2026, docs/demo-claim-2-report.md).
//
// The import review's PURE passes, moved here VERBATIM from app/(app)/manage/[token]/page.tsx so that two callers
// share one copy:
//   • the Manage import wizard (unchanged behaviour — it imports these instead of defining them), and
//   • the server-side demo carry-over (lib/demo-menu-carry.ts), which commits a claimed demo's menu at account
//     creation with exactly the decisions the review makes when the operator accepts it without changes.
// This is the "extract the wizard's grouping pass to lib/" fix lib/provision-demo.ts's commitExtraction asks for.
//
// 🔴 NOTHING HERE MAY TOUCH REACT STATE. Every function is pure over its arguments. `buildGroupedItems` takes the
// grouping choices as an argument (the page passes its `groupingChoice` state); everything else was already pure.
// The bodies are byte-for-byte the page's, re-indented and exported; only `buildGroupedItems` gained a parameter.
/* eslint-disable @typescript-eslint/no-explicit-any -- the review's items are the AI extraction's loose shape, exactly as the page typed them (moved verbatim) */

/** Case- and whitespace-insensitive identity used throughout the review (the page keeps its own copy too). */
const normName = (s: string) => String(s ?? '').trim().toLowerCase()

// ── Variant-axis vocabulary for the deterministic regroup pass ───────────────────────────────
// The single varying token that makes two same-base dishes a VARIANT of one item (vs two different
// dishes). ONLY protein/size tokens qualify — a dish-TYPE word (e.g. Green/Red curry, a topping) does
// NOT, so those stay separate. Named + extensible: add a token here to teach the regroup detector a
// new variant word. Keys are lowercase single tokens; value is the axis they belong to.
export const VARIANT_AXIS_TOKENS: Record<string, 'protein' | 'size'> = {
  beef: 'protein', chicken: 'protein', prawn: 'protein', prawns: 'protein', duck: 'protein',
  veg: 'protein', vegetable: 'protein', vegetarian: 'protein', tofu: 'protein', lamb: 'protein',
  pork: 'protein', fish: 'protein', salmon: 'protein', paneer: 'protein', halloumi: 'protein',
  mushroom: 'protein', shrimp: 'protein',
  small: 'size', regular: 'size', medium: 'size', large: 'size', sm: 'size', reg: 'size', lg: 'size',
}

// §66: dissolve a group across ALL carrying dishes into per-variant items (name = dish + option,
// price = base + surcharge, allergens/dietary merged, group removed). PURE over an items array.
// markConflict tags produced items so step 1 can show a subtle "kept separate — prices differed" note.
export const dissolveGroupInItems = (items: any[], normGroup: string, markConflict = false): any[] => {
  const out: any[] = []
  for (const it of items) {
    const gi = (it.modifierGroups || []).findIndex((g: any) => normName(g.name) === normGroup)
    if (gi < 0) { out.push(it); continue }
    const grp = (it.modifierGroups || [])[gi]
    for (const o of grp.options) {
      out.push({ ...it, name: `${it.name} ${o.name}`.trim(), price: Number(((it.price || 0) + (o.price || 0)).toFixed(2)),
        allergens: Array.from(new Set([...(it.allergens || []), ...(o.allergens || [])])),
        dietary: Array.from(new Set([...(it.dietary || []), ...(o.dietary || [])])),
        modifierGroups: (it.modifierGroups || []).filter((_: any, gj: number) => gj !== gi),
        _allergensChecked: false, ...(markConflict ? { _splitFromConflict: true } : {}) })
    }
  }
  return out
}
// §66: a PRICE CONFLICT = the SAME option name carrying DIFFERENT surcharges across the dishes that
// share it → the conflicted GROUP names. Used to AUTO-split (no operator decision, no gate).
export const detectConflictGroups = (items: any[]): string[] => {
  const perKey = new Map<string, Set<number>>()
  const groupOfKey = new Map<string, string>()
  for (const it of items) {
    if (it._skip) continue
    for (const g of (it.modifierGroups || [])) {
      for (const o of (g.options || [])) {
        const ng = normName(g.name), key = `${ng} ${normName(o.name)}`
        if (!perKey.has(key)) perKey.set(key, new Set())
        perKey.get(key)!.add(typeof o.price === 'number' ? o.price : 0)
        groupOfKey.set(key, ng)
      }
    }
  }
  const groups = new Set<string>()
  for (const [key, set] of perKey) if (set.size > 1) groups.add(groupOfKey.get(key)!)
  return [...groups]
}
// §66: AUTO-resolve price conflicts to SEPARATE ITEMS at load — price-faithful, no gate. Consistent
// options (same surcharge everywhere) stay as shared extras.
export const autoSplitConflicts = (data: any) => {
  const conflictGroups = detectConflictGroups(data?.items || [])
  if (conflictGroups.length === 0) return data
  let items = data.items
  for (const ng of conflictGroups) items = dissolveGroupInItems(items, ng, true)
  return { ...data, items }
}

// ── DETERMINISTIC REGROUP PASS — detects variant sets the AI emitted as SEPARATE items ──────────
// (e.g. "Tom Yum Prawn" + "Tom Yum Chicken" instead of one dish + a protein choice). STRUCTURAL predicate:
// within ONE category, two+ UNGROUPED items whose names differ by EXACTLY ONE token, that token a
// known protein/size axis token (VARIANT_AXIS_TOKENS) of the SAME axis. (No price cap — these are
// SUGGESTIONS the operator confirms.) A dish-TYPE differing token (Green/Red curry) is NOT in the axis
// list → NOT a candidate (verified non-merge).
// Pure over a given items array (no React state) so the grouping chooser + commit can re-run it on
// the latest items atomically.
export type RegroupMember = { idx: number; token: string; item: any }
export type RegroupCandidate = { key: string; baseName: string; category: string; axis: 'protein' | 'size'; members: RegroupMember[] }
export const computeRegroupCandidates = (items: any[]): RegroupCandidate[] => {
  const buckets = new Map<string, { baseTokens: string[]; category: string; axis: 'protein' | 'size'; members: RegroupMember[] }>()
  items.forEach((it: any, idx: number) => {
    if (it._skip) return
    if (it._variantOf) return // already reconstructed as an AI-origin grouping row — don't double-detect
    if ((it.modifierGroups || []).length > 0) return // already a grouped dish — not a loose variant
    const tokens = String(it.name || '').trim().split(/\s+/).filter(Boolean)
    if (tokens.length < 2) return // need a base + a varying token
    tokens.forEach((tok: string, i: number) => {
      const axis = VARIANT_AXIS_TOKENS[tok.toLowerCase()]
      if (!axis) return
      const baseTokens = tokens.filter((_: string, j: number) => j !== i)
      if (baseTokens.length === 0) return // base can't be empty (item literally named "Chicken")
      const key = `${normName(it.category || '')}|${baseTokens.join(' ').toLowerCase()}|${axis}`
      let b = buckets.get(key)
      if (!b) { b = { baseTokens, category: it.category, axis, members: [] }; buckets.set(key, b) }
      b.members.push({ idx, token: tok, item: it })
    })
  })
  const out: RegroupCandidate[] = []
  for (const [key, b] of buckets) {
    const byTok = new Map<string, RegroupMember>()
    for (const m of b.members) { const k = m.token.toLowerCase(); if (!byTok.has(k)) byTok.set(k, m) }
    const members = [...byTok.values()]
    if (members.length < 2) continue
    // No price-spread cap: the £1 cap was a guard from when regroup merged SILENTLY. It's now a
    // SUGGESTION on the two-box chooser (operator confirms each), so confirmation is the safety net —
    // any spread is safe to suggest (e.g. Springrolls Chicken/Veg/Prawn/Duck across £5.50–£7). The
    // STRUCTURAL guards (same base, single differing token, token in VARIANT_AXIS_TOKENS, same
    // category) still exclude non-variants like Green/Red Curry. Confirm math uses cheapest=base.
    out.push({ key, baseName: b.baseTokens.join(' '), category: b.category, axis: b.axis, members })
  }
  return out
}

// ── UN-GROUP AI VARIANT GROUPS FOR REVIEW ───────────────────────────────────────────────────────
// Page 1 shows EVERY dish as a flat separate item. So at load we DISSOLVE each AI-detected variant
// group (_inferredFromVariants) into its constituent items, TAGGING each with `_variantOf` (the
// original group identity) so page 2 can reconstruct the grouped choice — regardless of whether the
// variant token is a known protein/size word. importResult thus holds everything SEPARATE during
// review (Back-stable; grouping is re-derived on page 2 + applied only at commit). Any OTHER (non-
// variant "extras") groups stay on each constituent item untouched.
export const ungroupAiVariantsForReview = (data: any) => {
  if (!data || !Array.isArray(data.items)) return data
  const out: any[] = []
  for (const it of data.items) {
    const vg = (it.modifierGroups || []).find((g: any) => g._inferredFromVariants === true)
    if (!vg) { out.push(it); continue }
    // Rare: a dish carrying a variant group AND other (non-variant "extras") groups. Dissolving +
    // re-grouping would drop the extras, so leave such a dish grouped (it just isn't split on page 1).
    if ((it.modifierGroups || []).some((g: any) => g !== vg)) { out.push(it); continue }
    const baseName = it.name
    const basePrice = Number(it.price) || 0
    const groupKey = `${normName(it.category || '')}|${normName(baseName)}|${normName(vg.name)}`
    for (const o of (vg.options || [])) {
      out.push({
        name: `${baseName} ${o.name}`.trim(),
        description: it.description || undefined,
        price: Number((basePrice + (Number(o.price) || 0)).toFixed(2)),
        category: it.category,
        allergens: Array.from(new Set([...(it.allergens || []), ...(o.allergens || [])])),
        dietary: Array.from(new Set([...(it.dietary || []), ...(o.dietary || [])])),
        spiciness: it.spiciness ?? null,
        _allergensChecked: false,
        _variantOf: { key: groupKey, baseName, groupName: vg.name, optionName: o.name },
        modifierGroups: (it.modifierGroups || []).filter((g: any) => g !== vg), // keep any OTHER groups
      })
    }
  }
  return { ...data, items: out }
}

// ── GROUPING CHOOSER (step 2) — every row is a set of SEPARATE items that CAN be grouped into one
// customisable dish. Sources: (1) AI-origin (items tagged `_variantOf`, reconstructed by tag) and
// (2) regroup CANDIDATES (untagged separate items matched by base + protein/size axis token). Both
// render identically (two boxes). The choice is tracked in `groupingChoice` (default 'grouped');
// importResult is NEVER mutated by the chooser — buildGroupedItems() applies selections PURELY when
// building the commit payload. computeGroupingRows is pure over an items array (render + commit), so
// base/surcharge math always reads the CURRENT (page-1-edited) prices — never cached.
export type GroupingOpt = { name: string; surcharge: number; allergens: string[]; dietary: string[] }
export type GroupingRow = {
  key: string; source: 'ai' | 'candidate'; category: string; baseName: string; axisLabel: string
  basePrice: number; options: GroupingOpt[]; separateItems: { name: string; price: number }[]
  memberIdxs: number[]; groupedItem: any
}
// Build a row from a set of member indices that should group under one base name. Members are sorted
// by price ASCENDING (cheapest/base first), ties broken alphabetically by option name — the SAME order
// flows to the grouped chips, the separate-items list, AND the committed group's option order.
export const makeGroupingRow = (
  items: any[], key: string, source: 'ai' | 'candidate', category: string, baseName: string,
  axisLabel: string, groupName: string, members: { idx: number; optionName: string }[],
): GroupingRow => {
  const sorted = [...members].sort((a, b) => {
    const pa = Number(items[a.idx].price) || 0, pb = Number(items[b.idx].price) || 0
    if (pa !== pb) return pa - pb
    return a.optionName.localeCompare(b.optionName)
  })
  const memberItems = sorted.map(m => items[m.idx])
  const basePrice = Math.min(...memberItems.map((it: any) => Number(it.price) || 0))
  const base = memberItems.find((it: any) => (Number(it.price) || 0) === basePrice) || memberItems[0]
  const options: GroupingOpt[] = sorted.map(m => ({
    name: m.optionName,
    surcharge: Number(((Number(items[m.idx].price) || 0) - basePrice).toFixed(2)),
    // Options carry NO allergen/dietary data on import: per-option allergens are a FUTURE feature
    // (modifier_options has no verified flag), and copying the member item's allergens here BLED the
    // parent dish's tags onto every protein option (Chicken→Gluten/Molluscs/Vegetarian). Leave BLANK —
    // the dish-level union below (over-warn-safe) still warns for everything the dish can contain.
    allergens: [], dietary: [],
  }))
  const groupedItem = {
    name: baseName, description: base.description || undefined, price: basePrice,
    // ALLERGENS/DIETARY = UNION of ALL members (not base-only) — §74 over-warn-safe: a statutory allergen
    // on a non-cheapest member must NOT be dropped from the dish (base-only WAS an under-warn bug). Mirrors
    // the option→item union elsewhere (:1442/:1473/:1524/:1635). Base still drives PRICE only.
    category,
    allergens: [...new Set(memberItems.flatMap((it: any) => it.allergens || []))],
    dietary:   [...new Set(memberItems.flatMap((it: any) => it.dietary || []))],
    spiciness: base.spiciness ?? null,
    // ── 🔴 M1: THE PARENT'S CONFIRMATION IS DERIVED FROM ITS MEMBERS ─────────────────────────
    // This was the literal `false`, and it silently discarded real human work. The allergen step
    // reviews the UN-GROUPED rows; grouping happens later, in buildGroupedItems, which DELETES the
    // confirmed members and inserts this object in their place. With `false` hardcoded, every
    // grouped dish committed unverified however carefully its members had been checked — confirmed
    // in production on truck "village spice": 29 items committed, the 24 standalone ones verified,
    // and exactly the 5 grouped parents unverified and corrected by hand 23 minutes later.
    //
    // 🔴 THE SAFETY PROPERTY, WHICH THIS PRESERVES: nothing is ever marked verified that a human did
    // not verify. `every(… === true)` is an AND over the members, and each member's flag was set by
    // the operator confirming that row in the allergen step. So a true here means every dish folded
    // into this parent was individually confirmed by a person. A single unconfirmed member — or one
    // whose flag is undefined — makes the whole thing false. It cannot invent a confirmation.
    // Strict `=== true`, not truthiness, for exactly that reason.
    //
    // ⚠️ `memberItems.length > 0 &&` IS LOAD-BEARING, NOT DEFENSIVE PADDING. `[].every(...)` is
    // TRUE by definition, so without this guard a group that somehow arrived with no members would
    // commit as verified — a confirmation asserted about nothing at all. The one case where the
    // vacuous-truth default is exactly backwards from the safe one.
    //
    // Derived like every other field on this object — the allergens union two lines above is built
    // from the same memberItems, for the same reason: the parent must represent ALL of them.
    _allergensChecked: memberItems.length > 0 && memberItems.every(it => it._allergensChecked === true),
    modifierGroups: [{
      name: groupName,
      options: options.map(o => ({ name: o.name, price: o.surcharge, allergens: o.allergens, dietary: o.dietary })),
      // Inferred variant groups (protein/size) are structurally a MUST-CHOOSE-ONE → default required +
      // single-select (→ is_required / min_choices=1 / max_choices=1 at commit). A default, not a lock —
      // the operator can amend in the editor. Also makes the consolidation key uniform so groups that
      // differ only by (now-removed) bled option tags merge.
      isRequired: true, singleSelect: true, _inferredFromVariants: true,
    }],
  }
  return {
    key, source, category, baseName, axisLabel, basePrice, options,
    separateItems: sorted.map(m => ({ name: items[m.idx].name, price: Number(items[m.idx].price) || 0 })),
    memberIdxs: sorted.map(m => m.idx), groupedItem,
  }
}
export const computeGroupingRows = (items: any[]): GroupingRow[] => {
  const rows: GroupingRow[] = []
  // (1) AI-origin: items tagged `_variantOf`, grouped by their stored group key.
  const aiBuckets = new Map<string, { idx: number; optionName: string }[]>()
  const aiMeta = new Map<string, { baseName: string; groupName: string; category: string }>()
  items.forEach((it: any, idx: number) => {
    if (it._skip || !it._variantOf) return
    const k = it._variantOf.key
    if (!aiBuckets.has(k)) { aiBuckets.set(k, []); aiMeta.set(k, { baseName: it._variantOf.baseName, groupName: it._variantOf.groupName, category: it.category }) }
    aiBuckets.get(k)!.push({ idx, optionName: it._variantOf.optionName })
  })
  for (const [k, members] of aiBuckets) {
    if (members.length < 2) continue
    const meta = aiMeta.get(k)!
    rows.push(makeGroupingRow(items, `ai|${k}`, 'ai', meta.category, meta.baseName, meta.groupName, meta.groupName, members))
  }
  // (2) Regroup CANDIDATES (untagged separate items the AI never grouped).
  for (const cand of computeRegroupCandidates(items)) {
    const members = cand.members.map(m => ({ idx: m.idx, optionName: m.token }))
    rows.push(makeGroupingRow(items, `cand|${cand.key}`, 'candidate', cand.category, cand.baseName, cand.axis, cand.axis === 'protein' ? 'Protein' : 'Size', members))
  }
  // ── CONTENT-CONSOLIDATION + STRUCTURED NAMING (import-grouping only) ───────────────────────────
  // The import models ONE inferred modifier group PER base dish, so N dishes offering the SAME options
  // at the SAME prices yield N near-duplicate groups. Consolidate by EXACT CONTENT: rows whose group is
  // identical on (category, option SET + per-option price, rules, per-option allergens/dietary) are ONE
  // logical group and get the SAME final name → commit-menu's name-dedup then collapses them into a
  // SINGLE modifier_groups row that every matching dish links to. Groups that differ on ANY of those
  // (e.g. Beef free vs Beef +£0.50) keep DISTINCT signatures and are numbered apart so they stay
  // separate — never the old name-collision over-merge across different prices.
  //
  // Allergens/dietary are PART of the key (stricter than options+price alone): a merge can therefore
  // NEVER drop an option's allergen onto another dish (over-warn-safe — worst case leaves a near-dup
  // unmerged, which is cosmetic). NAME is NOT part of the key — consolidation is by content, not by the
  // AI's group name. Each dish keeps its own option set intact (no superset / no cross-dish option
  // mixing). The operator sees none of this (machinery beneath the grouped/separate choice).
  const sortJoin = (xs: any) => (Array.isArray(xs) ? xs : []).map((s: any) => normName(String(s))).sort().join(',')
  const contentSig = (row: GroupingRow): string => {
    const g = row.groupedItem.modifierGroups[0]
    const opts = (g.options || []).map((o: any) => `${normName(o.name)}#${Number(o.price) || 0}#${sortJoin(o.allergens)}#${sortJoin(o.dietary)}`).sort()
    return JSON.stringify({ cat: normName(row.category || ''), opts, req: g.isRequired === true, single: g.singleSelect === true })
  }
  // (1) CONSOLIDATE — bucket rows by content signature; each DISTINCT signature = one logical shared group.
  const bySig = new Map<string, GroupingRow[]>()
  const sigOrder: string[] = []
  for (const row of rows) {
    const sig = contentSig(row)
    const arr = bySig.get(sig)
    if (arr) arr.push(row); else { bySig.set(sig, [row]); sigOrder.push(sig) }
  }
  // (2) NAME the distinct signatures: bucket by (category, base axis name). A lone signature → "Category -
  // Name"; 2+ DISTINCT signatures sharing a base name → "Category - Name 1/2/…" (first-seen order). All
  // rows of a signature get the SAME name → one shared group at commit.
  const sigBuckets = new Map<string, string[]>()   // (cat|baseName) → signatures, first-seen order
  for (const sig of sigOrder) {
    const r0 = bySig.get(sig)![0]
    const bkey = `${normName(r0.category || '')}|${normName(r0.groupedItem.modifierGroups[0].name)}`
    const arr = sigBuckets.get(bkey)
    if (arr) arr.push(sig); else sigBuckets.set(bkey, [sig])
  }
  for (const sigs of sigBuckets.values()) {
    const numbered = sigs.length > 1
    sigs.forEach((sig, i) => {
      const bucketRows = bySig.get(sig)!
      const cat = String(bucketRows[0].category || '').trim()
      const base = bucketRows[0].groupedItem.modifierGroups[0].name
      const prefix = cat ? `${cat} - ` : ''
      const finalName = `${prefix}${base}${numbered ? ` ${i + 1}` : ''}`
      bucketRows.forEach(r => { r.groupedItem.modifierGroups[0].name = finalName })
    })
  }
  return rows
}

// Build the COMMIT payload's items by applying every chooser selection — PURELY (returns a new array,
// never mutates importResult). importResult always holds SEPARATE items during review (Back-stable),
// so the only action is SYNTHESISE for rows chosen 'grouped' (default): remove the member items, add
// the grouped item. 'separate' rows are left as-is (no-op). Base/surcharge are computed from the
// CURRENT item prices, so page-1 price edits flow straight into the committed group.
// demo-claim-2: the page's `groupingChoice` state is now the second argument (absent row → 'grouped', as before).
export const buildGroupedItems = (items: any[], groupingChoice: Record<string, 'grouped' | 'separate'> = {}): any[] => {
  const rows = computeGroupingRows(items)
  const toRemove = new Set<number>()
  const toAdd: any[] = []
  for (const row of rows) {
    const choice = groupingChoice[row.key] ?? 'grouped'
    if (choice === 'grouped') {
      row.memberIdxs.forEach(i => toRemove.add(i))
      toAdd.push(row.groupedItem)
    }
  }
  const kept = items.filter((_, i) => !toRemove.has(i))
  return [...kept, ...toAdd]
}

// ── THE REVIEW, ACCEPTED WITHOUT CHANGES ───────────────────────────────────────────────────────────────────────
// What the Manage import wizard sends to commit-menu when the operator opens a menu and presses through every step
// changing nothing (the ?import=demo bootstrap → "Use this menu" → Next … → Save):
//   • load:      autoSplitConflicts → ungroupAiVariantsForReview (handleProcessMenu / the bootstrap, same order);
//   • grouping:  every chooser row left at its default, 'grouped' (setGroupingChoice({}));
//   • commit:    buildGroupedItems → drop blank names (handleCommitMenu);
//   • kitchen:   every NEW category seeded `{ prep_secs: null, batch_size: null }` (goToKitchen), so commit-menu writes
//                prep 0 / batch 0 / not counted — capacity stays an active decision, as /api/setup leaves the van's;
//   • allergens: `_allergensChecked` is never set → every item commits allergens_verified = false, so Manage shows
//                the existing "allergens not set" warnings until the operator confirms them;
//   • the van's total capacity, the blanket "may contain" and the allergen display mode are written only when the
//                operator changes them — so accepting without changes writes none of them, and nor does this.
// ⚠️ ONE CASE HAS NO "WITHOUT CHANGES": the PRICE GATE. The review will not commit an item with no price unless the
// operator types one or marks it free. A caller with nobody to ask gets the names in `unpricedNames` and decides
// (lib/demo-menu-carry.ts commits them HIDDEN — never on sale at 0).
export interface ReviewDefaults {
  categories: string[]
  items: Record<string, any>[]
  categoryPrep: Record<string, { prep_secs: number | null; batch_size: number | null }>
  /** Names of committed items with no positive price and no "free" decision — the review's price gate would stop. */
  unpricedNames: string[]
}

/** The review's own price-gate predicate (page.tsx `priceUnresolved`), over the items about to be committed. */
const priceUnresolved = (it: { name?: string; price?: number; _skip?: boolean; _free?: boolean }) =>
  !it._skip && !!String(it.name || '').trim() && !(Number(it.price) > 0) && it._free !== true

export function acceptReviewDefaults(extraction: any): ReviewDefaults {
  const data = ungroupAiVariantsForReview(autoSplitConflicts(extraction)) || {}
  const categories: string[] = Array.isArray(data.categories) ? data.categories.filter((c: unknown) => typeof c === 'string' && c) : []
  const existing: string[] = Array.isArray(data.existing_categories) ? data.existing_categories : []
  const items = buildGroupedItems(Array.isArray(data.items) ? data.items : [], {}).filter(it => String(it.name || '').trim())
  const categoryPrep: ReviewDefaults['categoryPrep'] = {}
  for (const cat of categories) if (!existing.includes(cat)) categoryPrep[cat] = { prep_secs: null, batch_size: null }
  const unpricedNames = [...new Set(items.filter(priceUnresolved).map(it => String(it.name)))]
  return { categories, items, categoryPrep, unpricedNames }
}
