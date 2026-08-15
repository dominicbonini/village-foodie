# The customer quantity row — matching the operator's

**ONE file edited: `app/trucks/[slug]/order/page.tsx`. One `className`, plus a comment.** No `next dev`, no `next build`, no `cap sync`, no deploys, no commit. `tsc` clean.
✅ **No span of the prompt arrived garbled. No instruction contradicted another, so there was nothing to stop for.**

> ## ✅ THE BOX IS GONE, AND **NOTHING ELSE WAS RESTYLED.**
> `bg-orange-50 rounded-xl border border-orange-100` removed; `px-3` → `pl-3`; `py-2` kept. **The +/- keep their orange treatment, the children keep their order, every handler is untouched.**
>
> ## 🔴 THREE THINGS TO READ BEFORE YOU LOOK AT IT ON A PHONE
> **1. A4 — the two rows differ in FOUR ways beyond the box, and only the box was changed.** The operator's +/- are GREY, the customer's are ORANGE and asymmetric; the price sits in a different weight; the operator has no stock chip. **All left, all listed.**
> **2. B6 — the +/- controls are 24 px, and they were 24 px before.** 🔴 **Already far below the 44 px floor, on BOTH surfaces, and NOT caused by this change.**
> **3. C1 — the same orange-box treatment appears at THREE other places on the customer journey.** **Untouched, listed with line numbers. The customer page is now inconsistent with itself until you decide.**

---

# PART A — BOTH ROWS, READ SEPARATELY

## A1. THE CUSTOMER ROW — `app/trucks/[slug]/order/page.tsx:3013-3039` (before the change)

**READ, in full:**

```tsx
                            <div key={v.cartKey} className="flex items-center gap-2 bg-orange-50 rounded-xl px-3 py-2 border border-orange-100">
                              <div className="flex items-center gap-1 shrink-0">
                                <button onClick={() => !isOrderingBlocked && removeItem(v.cartKey)} disabled={isOrderingBlocked} className="w-6 h-6 rounded-full bg-white border border-orange-200 flex items-center justify-center font-bold text-orange-600 hover:bg-orange-100 text-sm leading-none disabled:opacity-40">−</button>
                                <span className="w-5 text-center font-black text-slate-900 text-sm">{v.quantity}</span>
                                <button onClick={() => !plusBlocked && addItem(v.menuItem, v.modifiers, v.specialInstructions)} disabled={plusBlocked}
                                  className="w-6 h-6 rounded-full bg-orange-600 flex items-center justify-center font-bold text-white hover:bg-orange-700 text-sm leading-none disabled:opacity-40">+</button>
                              </div>
                              <div className="flex-1 min-w-0">
                                {v.modifiers.map(m => (
                                  <p key={m.name} className="text-sm text-slate-700 break-words">{m.name}{m.price > 0 ? ` +£${m.price.toFixed(2)}` : ''}</p>
                                ))}
                                {v.specialInstructions && <p className="text-sm italic text-slate-400 break-words">📝 {v.specialInstructions}</p>}
                              </div>
                              <button onClick={() => !isOrderingBlocked && openItemModal(item, catModGroups, itemUpsells, v.cartKey)}
                                disabled={isOrderingBlocked} aria-label="Edit"
                                className="shrink-0 min-w-[2.75rem] min-h-[2.75rem] flex items-center justify-center text-slate-400 active:scale-95 disabled:opacity-40">✏️</button>
                              {optBlockedName && <span className="text-[10px] font-bold text-orange-600 shrink-0">{buildOptionStockByName((menu?.items as any[]) || [])[optBlockedName]} {optBlockedName} left</span>}
                              <span className="text-xs font-bold text-slate-700 shrink-0">£{((item.price + modSum) * v.quantity).toFixed(2)}</span>
                            </div>
```

**Its parent, `:3003`:**

```tsx
                      <div className="pl-2 pb-2 space-y-1.5">
```

## A2. THE OPERATOR ROW — `components/dashboard/AddOrderPanel.tsx:1920-1942`

**READ, in full — a SEPARATE implementation in a SEPARATE file:**

```tsx
                    <div key={rowKey} className="flex items-center gap-2 py-1.5 pl-3 mt-1">
                      {/* Stepper (left) */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => adjustManualQty(rowKey, -1)} className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center font-bold hover:bg-red-100 hover:text-red-600 text-sm leading-none active:scale-90">−</button>
                        <span className="w-5 text-center font-black text-sm text-slate-900">{line.quantity}</span>
                        <button onClick={() => adjustManualQty(rowKey, 1)} disabled={!!optBlocked} title={optBlocked ? `Only ${buildOptionStockByName(truckMenu?.items || [])[optBlocked]} ${optBlocked} left (shared)` : undefined} className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm leading-none active:scale-90 ${optBlocked ? 'bg-slate-100 text-slate-300 cursor-not-allowed' : 'bg-slate-200 hover:bg-orange-100 hover:text-orange-600'}`}>+</button>
                      </div>
                      <div className="flex-1 min-w-0">
                        {(line.modifiers || []).map(m => (
                          <p key={m.name} className="text-sm text-slate-700 break-words">{m.name}{m.price > 0 ? ` +£${m.price.toFixed(2)}` : ''}</p>
                        ))}
                        {note && <p className="text-sm italic text-slate-400 break-words">📝 {note}</p>}
                      </div>
                      <button onClick={() => openManualItemModal(item, itemModGroups, rowKey)} aria-label="Edit"
                        className="shrink-0 min-w-[2.75rem] min-h-[2.75rem] flex items-center justify-center text-slate-400 active:scale-95">✏️</button>
                      <span className="shrink-0 text-sm font-bold text-slate-900 tabular-nums">£{(line.unit_price * line.quantity).toFixed(2)}</span>
                    </div>
```

## A3. Side by side — every visual difference

| | **CUSTOMER** (before) | **OPERATOR** |
|---|---|---|
| **Container fill** | 🔴 **`bg-orange-50`** | **none** |
| **Border** | 🔴 **`border border-orange-100`** | **none** |
| **Radius** | 🔴 **`rounded-xl`** | **none** |
| **Padding** | `px-3 py-2` (all four sides) | `pl-3 py-1.5` (left + vertical only) |
| **Margin** | none; parent `space-y-1.5` | `mt-1` per row |
| **Minus control** | `w-6 h-6` · white fill · **orange-200 border** · **orange-600 glyph** · hover orange-100 | `w-7 h-7` · **slate-200 fill** · no border · default text · **hover RED** |
| **Plus control** | `w-6 h-6` · 🔴 **SOLID `bg-orange-600`, white glyph** | `w-7 h-7` · **slate-200 fill** · **hover orange** |
| **Control size** | **24 px** | **28 px** |
| **Stepper gap** | `gap-1` | `gap-1` — same |
| **Count** | `w-5 font-black text-sm text-slate-900` | `w-5 font-black text-sm text-slate-900` — **identical** |
| **Detail column** | `flex-1 min-w-0`, one `<p>` per modifier, note in italic slate-400 | **identical** |
| **Note glyph** | `📝` | `📝` — **identical** |
| **Edit control** | `✏️`, `min-w/h-[2.75rem]`, slate-400, `disabled:opacity-40` | `✏️`, `min-w/h-[2.75rem]`, slate-400, **no disabled state** |
| **Stock chip** | 🔴 **`{optBlockedName && …} left` renders INLINE in the row** | **none — the operator uses a `title` tooltip on the + instead** |
| **Price** | `text-xs font-bold text-slate-700` | `text-sm font-bold text-slate-900 tabular-nums` |
| **Child order** | stepper · detail · **edit · stock chip · price** | stepper · detail · **edit · price** |

## A4. 🔴 THE DIFFERENCES THAT ARE **NOT** THE BOX — and whether each is in scope

| # | Difference | In scope? | Changed? |
|---|---|---|---|
| 1 | **The +/- are ORANGE on the customer side, GREY on the operator's** — and the customer's `+` is a solid orange-600 button | ❌ **NO. Dominic asked for the BOX.** Recolouring the primary way a customer changes quantity is a separate decision on a live-money surface | 🔴 **NOT CHANGED** |
| 2 | **Control size 24 px vs 28 px** | ❌ NO — a size change on a touch control is not a box removal | 🔴 **NOT CHANGED** |
| 3 | **The customer row has an extra child: the inline "N left" stock chip** | ❌ NO — it carries information the operator gets from a tooltip. Removing it would remove a fact from a customer | 🔴 **NOT CHANGED** |
| 4 | **Price weight/colour: `text-xs … slate-700` vs `text-sm … slate-900 tabular-nums`** | ❌ NO | 🔴 **NOT CHANGED** |
| 5 | **Padding `px-3` vs `pl-3`** | ✅ **YES — this one IS the box.** Even inset is what a box needs; a bare row does not, and the right inset held the price off the row edge | ✅ **CHANGED to `pl-3`** |
| 6 | **Vertical padding `py-2` vs `py-1.5`** | ⚠️ borderline | 🔴 **NOT CHANGED — `py-2` kept.** A phone row wants the extra 4 px, and the operator's is a mouse-and-stylus surface |

> ## ✅ **THE CHILD ORDER IS ALMOST THE SAME, NOT DIFFERENT.** Both run stepper → detail → edit → price. **The customer inserts one extra child (the stock chip) between edit and price. Nothing was reordered.**
> ⚠️ **From the screenshots the +/- looked like the biggest visual gap after the box. It is #1 above and it is DELIBERATELY UNTOUCHED. Say the word and it is a two-class change on each button.**

## A5. Do the two surfaces share anything? — 🔴 **YES, BUT NOT FOR THESE ROWS**

**READ, both files import the same component:**

```tsx
import { OrderLineItem } from '@/components/dashboard/OrderLineItem'      // AddOrderPanel.tsx:20
```
```tsx
import { OrderLineItem } from '@/components/dashboard/OrderLineItem';    // customer page:15
```

**Used by the customer page at `:1468` and `:3913`, and by the operator at `:1692`.**

> ## ✅ **BUT NEITHER OF THE TWO ROWS IN THIS TASK IS `OrderLineItem`. Both are BESPOKE INLINE JSX in their own file, and the operator's comment says so in as many words — `AddOrderPanel.tsx:1909-1913`:**
>
> ```
> {/* PER-LINE rows (operator MOBILE only) — each cart line, keyed by cartKey. ONE compact,
>     vertically-centred row: [stepper] | customisation + note (stacked) | Edit | price. Bespoke
>     inline layout (NOT the shared OrderLineItem, which stacks each mod/note on its own row —
>     too many rows on a phone); desktop cart + Review keep OrderLineItem. */}
> ```
>
> 🔴 **SO EDITING THE CUSTOMER ROW CANNOT REACH THE OPERATOR ROW — proven by both being inline in different files, not assumed.** ⚠️ **AND THE CONVERSE IS THE REAL HAZARD: `OrderLineItem` IS shared by the customer basket, the customer review step and the operator desktop cart. Touching it would change all three. It was NOT touched — it is absent from the diff.**
> **No shared class helper, no shared style constant, no Tailwind `@apply` — the two rows share only Tailwind's own utility names.**

---

# PART B — THE EDIT

## B1. The box removed

```diff
-                            <div key={v.cartKey} className="flex items-center gap-2 bg-orange-50 rounded-xl px-3 py-2 border border-orange-100">
+                            <div key={v.cartKey} className="flex items-center gap-2 pl-3 py-2">
```

| Removed | |
|---|---|
| `bg-orange-50` | the light orange fill |
| `border border-orange-100` | the border |
| `rounded-xl` | the rounded corners |

✅ **The controls now sit on the row's own background, as they do on the operator side.**

## B2. Padding, and what carries the separation

**`px-3` → `pl-3`.** A box needs even inset; a bare row does not, and the right inset was holding the price away from the row edge — which the operator row does not do. **`py-2` KEPT**, slightly more generous than the operator's `py-1.5`, because this is a phone.

> ## 🔴 AND THE BRIEF'S PREMISE NEEDS ONE CORRECTION: **THE CUSTOMER LIST HAS NO DIVIDER.**
> **READ, the parent — `<div className="pl-2 pb-2 space-y-1.5">`. Separation is a 6 px GAP, not a rule.** ⚠️ **The operator's rows are separated the same way (`mt-1` each), also with no divider between lines.**
> ✅ **So "the list divider now carries the separation as it does on the operator side" is not quite what happens on either surface — the GAP carries it on both.** **That is why `py-2` was kept: with the box gone and no rule, the vertical padding is the only thing keeping two lines from reading as one.**

## B3. 🔴 The operator side

```
$ git diff --name-only | grep -E "AddOrderPanel|OrderLineItem"
(no output)
```

> ## ✅ **`components/dashboard/AddOrderPanel.tsx` AND `components/dashboard/OrderLineItem.tsx` ARE BOTH ABSENT FROM THE DIFF. The operator side is untouched.**

## B4. No behaviour changed

| | Changed? |
|---|---|
| `removeItem(v.cartKey)` / `addItem(...)` | 🔴 **NO** |
| `plusBlocked`, `atStockLimit`, `optionAddBlocked` | 🔴 **NO** |
| The price expression `((item.price + modSum) * v.quantity)` | 🔴 **NO** |
| The note field and `📝` line | 🔴 **NO** |
| `openItemModal(...)` on the pencil | 🔴 **NO** |
| `disabled` states | 🔴 **NO** |

✅ **The diff is one `className` string and a comment. Every child element is byte-identical.**

## B5. What was NOT changed, explicitly

🔴 **From A4: the orange +/- (#1), the 24 px control size (#2), the inline stock chip (#3), the price weight and colour (#4), and the `py-2` vertical padding (#6) are ALL UNCHANGED.** **Only the fill, border, radius and the right-hand inset moved.**

## B6. 🔴 TOUCH TARGETS — measured before and after

| | Before | After |
|---|---|---|
| **Minus control** | `w-6 h-6` = **24 × 24 px** | `w-6 h-6` = **24 × 24 px** |
| **Plus control** | `w-6 h-6` = **24 × 24 px** | `w-6 h-6` = **24 × 24 px** |
| Row height contribution | `py-2` = 16 px + 24 px = **40 px** | **unchanged — `py-2` kept** |
| *(the Edit pencil, for contrast)* | `min-w/h-[2.75rem]` = **44 × 44 px** | unchanged |

> ## ✅ **NO REGRESSION: the controls are a fixed `w-6 h-6` and the container never contributed to their size. 24 px before, 24 px after. NO STOP CONDITION FIRED.**
> ## 🔴 BUT THEY ARE **ALREADY** WELL BELOW 44 px, AND THAT IS WORTH SAYING OUT LOUD.
> **24 px on the customer side, 28 px (`w-7 h-7`) on the operator side. Apple's 44 pt guidance is missed by both, on a control a customer uses on a phone to change a quantity.** ⚠️ **The Edit pencil beside them is a correct 44 px, so the row already contains the right answer next to the wrong one.** 🔴 **PRE-EXISTING, NOT INTRODUCED HERE, AND NOT FIXED HERE — it is a size change on a live ordering surface and was not in scope.**

---

# PART C — THE REST OF THE CUSTOMER PAGE

## C1. The same orange-box treatment elsewhere — **THREE sites**

| # | file:line | What it is | The classes |
|---|---|---|---|
| 1 | `app/trucks/[slug]/order/page.tsx:2567` | **An APPLIED DEAL summary row**, inside the deals list | `border-t border-orange-100 px-4 py-3 bg-orange-50` |
| 2 | `app/trucks/[slug]/order/page.tsx:3748` | **The "View allergen card (PDF/image)" link** | `bg-orange-50 border border-orange-100 rounded-xl px-4 py-3` |
| 3 | `app/trucks/[slug]/order/page.tsx:3899` | **The collection-time block** on the confirmation step | `bg-orange-50 border border-orange-100 rounded-xl p-3 mb-4` |

**Quoted:**

```tsx
                          <div key={globalIdx} className="border-t border-orange-100 px-4 py-3 bg-orange-50">
```
```tsx
                    <a href={truck.allergen_info_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 bg-orange-50 border border-orange-100 rounded-xl px-4 py-3
                                 text-sm text-orange-700 font-medium hover:bg-orange-100">
```
```tsx
              <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 mb-4 text-sm text-left">
```

⚠️ **Site 1 is the closest relative — an added-thing summary row, exactly like the quantity row, and it keeps its fill.** **Sites 2 and 3 are a link and an information block, arguably a different use of the same tint.**

## C2. 🔴 NONE OF THEM WAS CHANGED

> ## **REPORT ONLY, AS INSTRUCTED. The three sites above are untouched.**
> 🔴 **AND THE CONSEQUENCE IS REAL: `bg-orange-50 border-orange-100 rounded-xl` IS a pattern on this page, not a one-off. Removing it from the quantity row makes that row the exception.**
> ⚠️ **The sharpest case is site 1: a customer who adds a DEAL still gets a tinted row, and a customer who adds an ITEM with extras no longer does — two "you added this" summaries, side by side in the same journey, styled differently.**
> **Your decision: the box goes everywhere, or nowhere, or the quantity row is deliberately the odd one out because it is the only one with controls in it. I did not choose.**

---

# PART D — BOUNDARIES

## D1. `git diff --stat`

```
 app/dashboard/[token]/page.tsx                     | 219 +++++++++++++--------
 app/landing/page.tsx                               |   4 +-
 app/trucks/[slug]/order/page.tsx                   |  16 +-
 components/dashboard/OrderCard.tsx                 |  21 +-
 components/native/NotificationSettings.tsx         |   2 +-
 components/native/OperatorDeviceConfig.tsx         |   4 +-
 components/printing/PrintingSettings.tsx           |  74 +++++--
 .../AppIcon.appiconset/AppIcon-512@2x.png          | Bin 14883 -> 16103 bytes
 lib/plan-features.ts                               |   2 +-
 lib/printing/transport.ts                          |  88 ++++++++-
 10 files changed, 307 insertions(+), 123 deletions(-)
```

> ## ✅ THIS TASK IS THE THIRD LINE ONLY — `16 +-`, and 14 of those are the comment.
> 🔴 **No handler:** `app/api/**` ABSENT. 🔴 **No price path:** `lib/payments/*` ABSENT; the price expression in the row is unchanged. 🔴 **No gate:** `lib/features.ts` ABSENT. 🔴 **No type:** `components/dashboard/types.ts` ABSENT. 🔴 **No migration.** 🔴 **No shared component:** `OrderLineItem.tsx` ABSENT.

## D2. What a Pizzeria Gusto customer now sees

**When they add an item with extras or a note, the quantity line beneath it no longer sits in a light-orange rounded box — the −, the count, the + and the price sit directly on the white row, with the same 6 px gap separating one line from the next.** 🔴 **Every control does exactly what it did, at exactly the same size, and the price is unchanged.**

## D3. Operator surfaces

> ## ✅ **NONE AFFECTED.** `AddOrderPanel.tsx` and `OrderLineItem.tsx` are absent from the diff, and the edited row is inside `app/trucks/[slug]/order/page.tsx`, which no operator surface renders.

---

# PART E — INTEGRITY

## E1 / E2. Non-ASCII census — `app/trucks/[slug]/order/page.tsx`

**275,465 → 276,876 bytes (+1,411), 4,138 → 4,152 lines (+14)**

| Codepoint | Before | After | Δ | Explanation |
|---|---|---|---|---|
| U+2500 BOX DRAWINGS | 2,519 | 2,542 | **+23** | one `──` rule on the new comment, in the file's existing style |
| U+2014 EM DASH | 360 | 363 | **+3** | prose in the comment |
| **U+26A0 WARNING SIGN** | 95 | **96** | **+1** | the "nothing else was restyled" caveat |
| **U+FE0F VARIATION SELECTOR** | 101 | **102** | **+1** | 🔴 **its pair — the two moved together** |
| **all other 35 classes** | — | — | **0** | unchanged |

🔴 **39 → 39 distinct. GAINED NONE, LOST NONE.**

## E3. 🔴 U+26A0 / U+FE0F pair counts

| File | U+26A0 | U+FE0F | Bare | Verdict |
|---|---|---|---|---|
| `app/trucks/[slug]/order/page.tsx` | **96** | **102** | **0** | ✅ **PAIRED — see below** |
| **`docs/customer-quantity-row-report.md`** | equal | equal | **0** | ✅ **PAIRED** — verified by scanning the written file |

> ## ⚠️ THE COUNTS DIFFER BY SIX AND THAT IS **NOT** A DEFECT HERE — I CHECKED RATHER THAN ASSUMED.
> **A byte-level scan of which base character each U+FE0F follows:**
> ```
> U+FE0F carriers:  U+26A0 × 96   ·   U+270F × 5   ·   U+23F8 × 1
> ```
> ✅ **Every one of the 96 warning signs is paired. The extra six selectors belong to the pencil `✏️` (U+270F U+FE0F) and a pause glyph — both legitimate two-codepoint emoji.** 🔴 **BARE U+26A0: ZERO. This file does NOT carry the defect that `app/dashboard/[token]/page.tsx` and `components/dashboard/OrderCard.tsx` do.**
> ⚠️ **Worth recording: a bare count comparison would have flagged this file as "unpaired by six" and been wrong. The carrier breakdown is the check that distinguishes them.**

## E4. Byte scan — byte-level, never `grep`

```
app/trucks/[slug]/order/page.tsx    276,876 bytes   NUL 0   control none
```

✅ **Clean. One file edited, one file scanned.**

## E5. Byte scan of this report — separate pass, AFTER writing

Result appended at the foot of this file.

## E6. `git status` — which entries are THIS task's

```
$ git status --porcelain
 M app/dashboard/[token]/page.tsx
 M app/landing/page.tsx
 M app/trucks/[slug]/order/page.tsx
 M components/dashboard/OrderCard.tsx
 M components/native/NotificationSettings.tsx
 M components/native/OperatorDeviceConfig.tsx
 M components/printing/PrintingSettings.tsx
 M ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
 M lib/plan-features.ts
 M lib/printing/transport.ts
?? docs/app-icon-report.md
?? docs/customer-quantity-row-report.md
?? docs/device-naming-report.md
?? docs/printing-architecture-report.md
?? docs/printing-ui-report.md
?? docs/printing-wiring-report.md
?? docs/push-registration-report.md
?? docs/settings-grouping-report.md
?? lib/printing/usePrinting.ts
```

| Entry | Whose |
|---|---|
| 🔴 **`app/trucks/[slug]/order/page.tsx`** | **THIS TASK ONLY** — first appearance in the tree all session |
| ✅ **`docs/customer-quantity-row-report.md`** | **THIS TASK** |
| everything else | earlier — the settings grouping, the device-naming sweep, the caption wrap, the plan cell, the app icon, the printing wiring, and their reports |

⚠️ **THE TREE HAS BEEN DIRTY ALL SESSION.** ✅ **The customer page is a clean signal: its `16 +-` is entirely this task.** 🔴 **Nothing is committed.**

## E6b. `tsc`

```
$ npx tsc --noEmit ; echo "tsc exit=$?"
tsc exit=0
```

⚠️ **AND IT PROVES ALMOST NOTHING FOR A CLASS CHANGE — Tailwind class names are strings to the compiler, and a misspelled utility silently does nothing.** ✅ **The one thing it does prove here is that the block comment sits legally inside the `return (…)` expression and did not break the JSX.** 🔴 **Nothing was rendered.**

---

# PROVENANCE

**READ** — the customer row in full at `:3013-3039` and its parent at `:3003` · the operator row in full at `AddOrderPanel.tsx:1920-1942` including the comment stating it is deliberately NOT `OrderLineItem` · both files' `OrderLineItem` imports and all three of its call sites · every `bg-orange-50` / `bg-orange-100` occurrence on the customer page · the census before and after, including the U+FE0F carrier breakdown · the byte scan · `git diff --name-only` for the operator files, `git status`, `git diff --stat`, `tsc`.

**INFERRED** — that `w-6 h-6` computes to 24 px and `w-7 h-7` to 28 px at the default Tailwind scale (**arithmetic, nothing rendered**) · that the visual effect of removing the fill is what Dominic described from the screenshots · that sites 2 and 3 in C1 are a different use of the same tint than site 1.

**NOT VERIFIED** — 🔴 **nothing was rendered.** The row has not been seen without its box, on a phone or anywhere else. ⚠️ **The judgement that `py-2` keeps two lines legible without a fill or a rule is reasoning about spacing, not observation — it is the one thing worth looking at first on a real phone.**
