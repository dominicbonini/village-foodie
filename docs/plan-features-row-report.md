# Plan features — renaming, moving and enabling the custom-domain row

**Workstream:** plan-features — rename and move the custom domain row
**Date:** 29 August 2026
**Deploys:** frozen. Nothing deployed, no migration run, no column dropped, no domain removed from Vercel, no credential added.
**Manual read first:** §4 / §27 / V11.45–V11.49 (`docs/reference-manual.md:218`, `:1323`, `:4794-4816`) — which record this rename as *"the intended resolution and is NOT DONE"*, and the trap in doing it.

## Scope, and how it changed twice mid-workstream

The brief scoped this to `lib/plan-features.ts` and said **"🔴 IT STAYS coming_soon. Do NOT flip it to available in this change."** Two instructions then arrived while I was working:

1. *"its also mentioned in the pricing area under max. take off the coming soon badge and again move it above kitchen ticket printing"* → `app/landing/page.tsx` came into scope.
2. *"it still shows coming soon in the features table. needs a tick"* → **this reverses item 3 of the brief.** I have done it. §5 records what the tick does and does not prove, because that is the part the brief was protecting against.

Two files changed: `lib/plan-features.ts` and `app/landing/page.tsx`. Nothing else.

---

## 1. The row, before and after

**Before** — `lib/plan-features.ts:261`, position **28 of 29** overall, **6 of 7** in "Max tier":

```ts
{ name: 'Order page on your own website', detail: 'Your ordering page available at your own web address, under your own name.', starter: false, pro: false, max: 'coming_soon' },
```

**After** — position **25 of 29** overall, **3 of 7** in "Max tier":

```ts
{ name: 'Your schedule at your own website', detail: 'Your upcoming dates on a page at your own address, under your own name.', starter: false, pro: false, max: true },
```

Name and detail exactly as specified. `max` flipped on your instruction; `starter` and `pro` untouched.

**New position, by execution of the module:**

```
Max tier section, in data order:
   1  Multi-device kitchen sync             max=true
   2  Multi-user access                     max=true
   3  Your schedule at your own website     max=true    ← moved here
   4  Kitchen ticket printing               max=true
   5  Customer-facing display               max="coming_soon"
   6  Event & festival pricing              max="coming_soon"
   7  Digital loyalty stamp cards           max="coming_soon"
```

Directly above `Kitchen ticket printing`, as asked. ✅ **A side effect worth noting:** the move alone put a `coming_soon` row above a hard-`true` one, breaking this file's *"coming-soon rows ordered last, in the data itself"* convention (both renderers rely on the data being pre-sorted; neither sorts at render time). The flip to `true` restored it — the section is a clean block of four ticks then three Coming-soons, not an interleave.

---

## 2. The label is the join key — what keys off it

`FeatureRow` has no `id` (`lib/plan-features.ts:6-13`). I grepped the whole tree for label-keyed lookups rather than assuming `ROW_FEATURE_MAP` was the only one. **There are four**, and the row appeared in **none** of them at the time of the rename:

| # | Lookup | Location | Carried the old label? |
|---|---|---|---|
| 1 | `ROW_FEATURE_MAP[row.name]` | `lib/plan-features.ts:349-376`, read at `:385` | **No** — never had an entry, which is why the checker `continue`d past it. **Now added** — see §3 |
| 2 | `isRowComingSoon(rowName)` → `rows.find(r => r.name === rowName)` | `app/manage/[token]/page.tsx:8380-8392` | **No** — only ever called with `MESSENGER_INSTAGRAM_ROW` (`:9698`, the single call site) |
| 3 | `trialFeatureValue(row)` → `row.name === …` | `app/landing/page.tsx:63-67` | **No** — only `'Online ordering — Pay at Hatch'` and `'SMS order alerts'` |
| 4 | `DETAIL_OVERRIDES[row.name]` | `app/landing/page.tsx:87-89`, read at `:395` | **No** — only `'Offline Order Protection'` |

Admin's and Billing's Pay-at-Hatch special-cases (`app/admin/page.tsx:909`, `app/manage/[token]/page.tsx:11307`) are the same pattern and likewise do not name this row.

**Nothing keyed off the old label, so the rename moved no key and no STOP condition was reached.**

### Remaining textual references

- **`app/landing/page.tsx:337`** — a hand-written bullet whose own comment (`:296-298`) warns it *"is a literal twin of the matrix row… and nothing checks the two against each other, so it must be changed in the SAME commit or the same page shows two different claims."* **Updated** on your instruction.
- **`lib/features.ts:66`** — a code comment naming the row and predicting this rename (*"is renamed in a later stage"*). ⚠️ **NOT changed — outside scope.** Now stale by one tense; one-line fix whenever you want it.
- **`docs/reference-manual.md` ×3 and six `docs/*.md` reports** — historical records of past states, dated. **Deliberately not rewritten**: editing a report to match today's code destroys the record of what was true when it was written.

---

## 3. 🔴 The flip and the map entry had to land together

Flipping the cell to `true` is what *arms* the parity checker on this row. Before the flip it was skipped twice over — `'coming_soon'` is not `true`, and the row had no `ROW_FEATURE_MAP` entry. So the flip alone would have advertised the row as included **with nothing verifying it**, which is exactly the trap the manual records at `:4811`.

Added in the same change:

```ts
'Your schedule at your own website': 'embed_schedule',
```

`embed_schedule` is not a new `Feature` — `lib/features.ts:69` already carries it in `MAX_FEATURES`, and the comment beside it predicted this rename. Keyed on the **new** row name. Gate confirmed by execution:

```
canAccess(starter , embed_schedule) = false
canAccess(pro     , embed_schedule) = false
canAccess(max     , embed_schedule) = true      ← the cell that is now true
canAccess(trial   , embed_schedule) = true
```

Marketing and gate agree, and now do so under supervision rather than by luck.

---

## 4. What trial shows — the convention, unchanged

There is no `trial` field on `FeatureRow`. All three surfaces derive it, and all three use the same rule — *trial takes Max's value* — with named exceptions:

| Renderer | Rule | Exceptions |
|---|---|---|
| Landing (`app/landing/page.tsx:63-67`) | `return row.max` | Pay at Hatch → `true`; **SMS order alerts → `false`** |
| Billing (`app/manage/[token]/page.tsx:11306-11308`) | `row.max` | Pay at Hatch → `true` |
| Admin (`app/admin/page.tsx:909-912`) | `row.max` | Pay at Hatch → `true` (trial **and** tester) |

Every Max-only row (`starter: false, pro: false`), as the table stood **when you asked** (before the flip):

```
row                                   max           trial: landing / billing / admin
Multi-device kitchen sync             ✓             ✓            ✓            ✓
Multi-user access                     ✓             ✓            ✓            ✓
Your schedule at your own website     Coming soon   Coming soon  Coming soon  Coming soon  ←
Kitchen ticket printing               ✓             ✓            ✓            ✓
Customer-facing display               Coming soon   Coming soon  Coming soon  Coming soon
Event & festival pricing              Coming soon   Coming soon  Coming soon  Coming soon
Digital loyalty stamp cards           Coming soon   Coming soon  Coming soon  Coming soon

CONVENTION: trial === max for EVERY Max-only row, on all three renderers?  ✅ yes, without exception
```

**The row did not differ from the convention, and I changed nothing about trial.** The convention is: *a Max-only row shows trial exactly what it shows Max.* The only two rows in the whole matrix that break it are Pay-at-Hatch and SMS order alerts, both by explicit name-match. After the flip this row now shows **✓ for trial**, still by the same rule, with no special case added.

⚠️ **A divergence worth knowing, not touched:** the SMS exception exists **only on the landing page**. Billing and Admin have no such branch, so `SMS order alerts` shows `Coming soon` for trial there and `—` on landing. Same class as the label-as-key fragility: three copies of one rule kept in step by hand.

---

## 5. 🔴 What the tick does not prove

You asked for the tick and you have it. Recording the limits, because the brief's item 3 existed to guard them:

1. **The checker binds marketing to the gate, never either to reality** (manual `:2928`). `findPlanParityViolations()` passing means *"Max is allowed this"*, not *"this works"*. The brief's own words: the feature **"has never served a page from a real domain in production."**
2. **There is a second gate the matrix cannot see.** `trucks.embed_enabled`, `NOT NULL DEFAULT false` (`lib/features.ts:64`), is enforced at `app/api/embed/events/route.ts:70`. A Max truck reading this tick still gets the fallback page until `domain_provision` sets that column for them. The plan gate is the weaker half, and it is the half the matrix reflects.
3. **`/landing` is not published.** The manual (`:2959`) records it on branch `landing-v32`, unpushed, with four other blockers.

Both facts are now written into the file beside the row, so the next person to read it meets them.

---

## 6. Verification

I performed **parse**, **typecheck** and **execution**. All three, in those words.

**Parse.** Every edit was applied by anchored, asserted string replacement — each script asserts its anchor occurs exactly once before writing. ⚠️ **One assertion fired and prevented a bad edit:** `// Coming soon (kept at the bottom of the section)` appears **twice** (once per section). The write aborted with the file untouched; I re-anchored on the comment *plus the row that follows it* to hit the Max-tier one only. Without the assert, both sections would have been rewritten.

**Typecheck.** `npx tsc --noEmit` — clean after each of the three edits.

**Execution.** The real `lib/plan-features.ts` was transpiled with `ts.transpileModule` and run in a `vm` with the real `lib/features.ts` supplied as its import. No reimplementation, and no reading values off the source text — every number and string below came out of the executed module.

### The parity checker, and proof it now actually inspects this row

```
findPlanParityViolations() → 0 []   ✅ PASSING
```

A pass is worthless unless the row is being looked at, and until today it was not. Two deliberate probes on throwaway copies:

**Probe A — map re-pointed at a Feature no tier grants.** If the row were still being skipped, this would report nothing:

```
1 violation(s):
  🔴 "Your schedule at your own website" advertised for max but canAccess('max','a_feature_max_does_not_have') is false
```

The row **is** inspected. (A first probe using `multi_device_kds` correctly found nothing — that is also a Max feature, so there was no drift to detect. Replaced with a Feature Max genuinely lacks.)

**Probe B — map entry deleted, cell left `true`.** The exact trap the manual names:

```
0 violation(s) — the row is advertised true and checked by NOTHING.
```

That is why the map entry had to land in the same change as the flip.

### No other row moved

Row lists captured by execution before and after. Removing only the moved row from each and diffing:

```
✅ IDENTICAL — all 28 other rows hold their exact relative order
moved row index:  before 28 of 29  →  after 25 of 29
```

Re-verified after the flip as well: still identical.

### Cell values

```
starter false → false                  ✅ unchanged
pro     false → false                  ✅ unchanged
max     "coming_soon" → true           🔵 changed, on your explicit instruction
old label present anywhere in FEATURE_SECTIONS: ✅ no
```

### Rendered in a real browser

`http://hatchgrab.localhost:3000/landing` → HTTP 200, both surfaces read out of the live DOM:

```
── MAX PRICING CARD ──
  1. Everything in Pro, plus
  2. Multi-device kitchen sync
  3. Multi-staff logins
  4. Your schedule at your own website      ← renamed, moved, no badge
  5. Kitchen ticket printing
  6. Event & festival pricing COMING SOON
  7. Digital loyalty stamp cards COMING SOON

── COMPARISON TABLE, Max tier (trial | starter | pro | max) ──
  Multi-device kitchen sync           ||  ✓ | — | — | ✓
  Multi-user access                   ||  ✓ | — | — | ✓
  Your schedule at your own website   ||  ✓ | — | — | ✓     ← the tick
  Kitchen ticket printing5            ||  ✓ | — | — | ✓
  Customer-facing display             ||  Coming soon | — | — | Coming soon
  Event & festival pricing            ||  Coming soon | — | — | Coming soon
  Digital loyalty stamp cards         ||  Coming soon | — | — | Coming soon
```

Card and table agree. Manage → Billing and Admin render from the same source and now show the tick too.

---

## 7. One thing I found but did not touch

`lib/plan-features.ts:240-251` is a twelve-line comment headed **`🔴 'coming_soon', NOT true — 14 August 2026. A TICK IS A CLAIM THAT IT WORKS, AND IT DOES NOT.`**, explaining at length why kitchen ticket printing must not be `true`. The row immediately below it reads **`max: true`**.

Someone flipped it back and left the comment standing. The row **is** in `ROW_FEATURE_MAP`, so the checker inspects it — and passes, because the *gate* allows it, while `PrintingSettings.tsx` still has no real transport. It is the same "checker binds marketing to gate, not reality" limit as §5, sitting in the row directly below the one this workstream touched. **Out of scope, unchanged, reported.**

---

**No span of this prompt arrived garbled.** The brief's own instructions did not contradict each other. The reversal of item 3 came from you directly, after seeing the card/table disagreement the earlier instruction created, and is recorded as your decision in both the report and the file.
