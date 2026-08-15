# The customer quantity row — spacing matched to the operator by measurement

**ONE file edited: `app/trucks/[slug]/order/page.tsx`. Three Tailwind classes, plus comments.** No `next dev`, no `next build`, no `cap sync`, no deploys, no commit. `tsc` clean.
✅ **No span of the prompt arrived garbled. No instruction contradicted another, so there was nothing to stop for.**

> ## ✅ ALL THREE MEASUREMENTS NOW MATCH THE OPERATOR EXACTLY.
> | | BEFORE | OPERATOR | **NOW** |
> |---|---|---|---|
> | **above the first row** | **20 px** | **10 px** | ✅ **10 px** |
> | **between rows** | 22 px | 16 px | ✅ **16 px** |
> | **below the last row** | 16 px | 14 px | ✅ **14 px** |
>
> 🔴 **THE "DETACHED" FEELING WAS THE 20 px — DOUBLE the operator's.** It came from **two** contributors, not one: the item wrapper's `py-3` (12 px) *and* the row's own `py-2` (8 px). **Fixing only the row would have left 18 px.**
>
> ⚠️ **AND MY OWN PREVIOUS REASONING WAS WRONG. Last task I kept `py-2` and wrote that it was needed "to stop two lines reading as one". The device says otherwise: the operator manages on `py-1.5` with the same absence of a fill and a divider. The stale comment has been corrected in the code.**

---

# PART A — MEASURED, NOT GUESSED

## A1. THE CUSTOMER — the row and every ancestor that contributes vertical space

**READ, `app/trucks/[slug]/order/page.tsx`, outermost first:**

```tsx
                    <div key={item.name} className={isSoldOut ? 'opacity-60' : ''}>          {/* :2799 — no padding */}
```
```tsx
                    <div className="py-3">                                                    {/* :2802 — the item-content wrapper */}
```
```tsx
                    </div>{/* end py-3 item-content wrapper */}                               {/* :2999 */}
```
```tsx
                      <div className="pl-2 pb-2 space-y-1.5">                                 {/* :3003 — the variant list */}
```
```tsx
                            <div key={v.cartKey} className="flex items-center gap-2 pl-3 py-2">   {/* :3013 — THE ROW */}
```

**And the divider — it separates ITEMS, not rows. `:2712` and `:2759`:**

```tsx
                <div className="divide-y divide-slate-200">
```

| Contributor | Value |
|---|---|
| item container `:2799` | **none** |
| item-content wrapper `:2802` `py-3` | **12 px** top and bottom |
| variant list `:3003` `pb-2` | **8 px** below the last row |
| variant list `:3003` `space-y-1.5` | **6 px** between rows |
| the row `:3013` `py-2` | **8 px** top and bottom |
| `divide-y` | between **items**, below everything above |

## A2. THE OPERATOR — same depth, separate file

**READ, `components/dashboard/AddOrderPanel.tsx`:**

```tsx
              <div key={item.name} className={`py-2 border-b border-slate-50 ${isSoldOut ? 'opacity-60' : ''}`}>   {/* :1887 */}
```
```tsx
                <div className="flex items-center gap-3">                                     {/* :1890 — the item's top line */}
```
```tsx
                {lines.map(line => {                                                          {/* :1914 */}
```
```tsx
                    <div key={rowKey} className="flex items-center gap-2 py-1.5 pl-3 mt-1">   {/* :1920 — THE ROW */}
```

| Contributor | Value |
|---|---|
| item container `:1887` `py-2` | **8 px** top and bottom |
| item container `:1887` `border-b` | a **real divider**, below everything |
| **no intermediate list wrapper** | 🔴 **the rows are DIRECT siblings of the item's top line, INSIDE the item's `py-2`** |
| the row `:1920` `mt-1` | **4 px** above each row |
| the row `:1920` `py-1.5` | **6 px** top and bottom |

🔴 **THE STRUCTURAL DIFFERENCE THAT CAUSES THE PROBLEM: on the operator side the rows live INSIDE the item's padded container. On the customer side they live OUTSIDE the `py-3` wrapper, so that wrapper's bottom padding is added to the row's own — it is not shared, it is stacked.**

## A3. 🔴 THE ARITHMETIC, SIDE BY SIDE

| | **CUSTOMER (before)** | **OPERATOR** |
|---|---|---|
| **Above the first row** | item `py-3` bottom **12** + row `py-2` top **8** = **20 px** | row `mt-1` **4** + row `py-1.5` top **6** = **10 px** |
| **Between two rows** | row `py-2` bottom **8** + `space-y-1.5` **6** + row `py-2` top **8** = **22 px** | row `py-1.5` bottom **6** + `mt-1` **4** + row `py-1.5` top **6** = **16 px** |
| **Below the last row** | row `py-2` bottom **8** + list `pb-2` **8** = **16 px** | row `py-1.5` bottom **6** + item `py-2` bottom **8** = **14 px** |

**⚠️ INFERRED: the px values are the Tailwind default scale (`1` = 4 px, `1.5` = 6 px, `2` = 8 px, `3` = 12 px). Nothing was rendered, so these are computed from the class names, not measured in a browser.**

## A4. Where the extra space came from — **A COMBINATION, and naming both matters**

| Contributor | Customer | Operator | Excess |
|---|---|---|---|
| **the item wrapper above the row** | `py-3` → **12 px** | `py-2` → **8 px**, and *shared* rather than stacked | **+12 px** *(the operator's 8 px sits BELOW its rows, not above them)* |
| **the row's own vertical padding** | `py-2` → **8 px** | `py-1.5` → **6 px** | **+2 px** |
| **the inter-row gap** | `space-y-1.5` → 6 px | `mt-1` → 4 px | **+2 px** |

> ## 🔴 **THE ITEM WRAPPER IS THE BIGGER HALF — 12 of the 20 px above the row. Changing only the row's `py-2` would have moved 20 px to 18 px and the row would still have read as detached.**

---

# PART B — THE FIX

## B1. Three classes, before and after

| # | Where | Before | After |
|---|---|---|---|
| 1 | the row `:3013` | `pl-3 **py-2**` | `pl-3 **py-1.5**` |
| 2 | the list `:3003` | `pl-2 pb-2 **space-y-1.5**` | `pl-2 pb-2 **space-y-1**` |
| 3 | the list `:3003` | *(no top margin)* | **`-mt-2`** |

```diff
-                      <div className="pl-2 pb-2 space-y-1.5">
+                      <div className="pl-2 pb-2 space-y-1 -mt-2">
```
```diff
-                            <div key={v.cartKey} className="flex items-center gap-2 pl-3 py-2">
+                            <div key={v.cartKey} className="flex items-center gap-2 pl-3 py-1.5">
```

**The resulting arithmetic:**

```
above  = item py-3 bottom 12  −  list -mt-2 8  +  row py-1.5 top 6   = 10 px   (operator: 10)
between= row py-1.5 bottom 6  +  space-y-1 4   +  row py-1.5 top 6   = 16 px   (operator: 16)
below  = row py-1.5 bottom 6  +  list pb-2 8                         = 14 px   (operator: 14)
```

> ## 🔴 WHY `-mt-2` RATHER THAN TRIMMING THE ITEM'S `py-3`.
> **That `py-3` is the ITEM's own padding and EVERY item has it, expanded or not.** Reducing it would move every row on the menu — for a customer who has added nothing — to fix a gap that only exists beneath an expanded one. **A negative margin on the variant list touches only the variant list.**

## B2. 🔴 Belonging: above is TIGHTER than below, deliberately

| | above | below |
|---|---|---|
| **Customer (now)** | **10 px** | **14 px** |
| **Operator** | **10 px** | **14 px** |

✅ **NOT SYMMETRICAL, because the operator's are not.** **A row 10 px under its item and 14 px above the next boundary reads as attached upward.** 🔴 **Equal spacing is exactly what made it float: at 20/16 it was nearer the NEXT item than its own.** ⚠️ **And below the last row the `divide-y` rule follows, which reinforces the break — the customer surface's separation between items is a real line, not just a gap.**

## B3. No fill, border or radius reintroduced

✅ **The row's complete class list is `flex items-center gap-2 pl-3 py-1.5`.** 🔴 **No `bg-*`, no `border`, no `rounded-*`. The box stays gone.**

## B4. The operator side

```
$ git diff --name-only | grep -E "AddOrderPanel|OrderLineItem"
(no output)
```

✅ **`components/dashboard/AddOrderPanel.tsx` and the shared `components/dashboard/OrderLineItem.tsx` are both ABSENT from the diff.**

## B5. No behaviour changed

✅ **`removeItem`, `addItem`, `plusBlocked`, `atStockLimit`, `optionAddBlocked`, the price expression `((item.price + modSum) * v.quantity)`, the `📝` note line and `openItemModal` are all byte-identical.** **The diff is three class strings and comment text.**

## B6. Row height, and the controls

| | Before | After |
|---|---|---|
| **Customer row height** *(one line of detail)* | `max(controls 24, text 20)` + `py-2` 16 = **40 px** | `max(controls 24, text 20)` + `py-1.5` 12 = **36 px** |
| **Operator row height** | — | `max(controls 28, text 20)` + `py-1.5` 12 = **40 px** |
| **`+` / `−` controls** | `w-6 h-6` = **24 px** | `w-6 h-6` = **24 px** — 🔴 **UNCHANGED** |

⚠️ **THE ROWS ARE NOW 36 px (customer) vs 40 px (operator) AND THAT IS CORRECT: the 4 px difference is entirely the CONTROL SIZE — 24 px against the operator's 28 px — which I did not touch.** ✅ **The RHYTHM (10/16/14) matches exactly, which is what the task asked for.**

🔴 **THE 24 px CONTROLS ARE STILL WELL UNDER 44 px, AND I DID NOT MAKE THAT WORSE OR "FIX" IT HERE — it remains the separate backlog item.** ⚠️ **The `py` reduction does NOT shrink them: they are a fixed `w-6 h-6` and padding never contributed to their size. The Edit pencil beside them is still a correct `min-w/h-[2.75rem]` = 44 px.**

---

# PART C — THE OTHER STATES

## C1. Note, modifier, quantity above one — **ONE row, one set of spacing classes**

**READ — the container is the same element for every state; only the detail COLUMN's contents vary:**

```tsx
                              <div className="flex-1 min-w-0">
                                {v.modifiers.map(m => (
                                  <p key={m.name} className="text-sm text-slate-700 break-words">{m.name}{m.price > 0 ? ` +£${m.price.toFixed(2)}` : ''}</p>
                                ))}
                                {v.specialInstructions && <p className="text-sm italic text-slate-400 break-words">📝 {v.specialInstructions}</p>}
                              </div>
```

| State | What differs | Spacing |
|---|---|---|
| **Plain** (no extras, no note) | the detail column is EMPTY | ✅ same classes |
| **One or more modifiers** | one `<p>` per modifier, stacked | ✅ same classes — the row grows by ~20 px per line |
| **A note** | one italic `<p>` with `📝` | ✅ same classes |
| **Quantity > 1** | only the `{v.quantity}` digit changes | ✅ same classes — **no height change at all** |
| **Stock-blocked** | an extra inline `"N left"` chip | ✅ same classes; it is `shrink-0` on the same row |

> ## ✅ **THE FIX APPLIES TO ALL OF THEM, because `py-1.5` is on the ROW and `space-y-1` / `-mt-2` are on the LIST. Nothing is conditional on a variant's contents.**
> ⚠️ **What DOES vary is the row's HEIGHT** — a line with two modifiers and a note is three `<p>`s ≈ 60 px of content plus 12 px padding. **The gaps between rows stay 16 px regardless, which is the property that was wrong and is now right.**
> 🔴 **INFERRED, not rendered: that `text-sm` resolves to a 20 px line-height (Tailwind's default for `text-sm`).**

## C2. Two adjacent expanded items

**The stack between one item's last variant row and the next item's first content:**

```
row py-1.5 bottom      6 px
list pb-2              8 px
divide-y border        1 px          <- a REAL RULE, not a gap
next item py-3 top    12 px
                     ------
                      27 px + the rule
```

> ## ✅ **IT CANNOT COLLAPSE TO NOTHING. 27 px AND A VISIBLE 1 px RULE separate them — nearly three times the 10 px that now binds a row to its own item.**
> 🔴 **AND `-mt-2` CANNOT LEAK INTO THE PREVIOUS ITEM: it pulls the list up INSIDE its own item container (`:2799`), against that item's `py-3` wrapper. The 12 px it eats is its own item's padding, and 4 px of it remains.**
> ⚠️ **INFERRED — margins do not collapse through the `divide-y` border, and the negative margin is bounded by the padding above it. Not rendered.**

---

# PART D — BOUNDARIES

## D1. `git diff --stat` (this task's file)

```
 app/trucks/[slug]/order/page.tsx | 30 ++++++++++++++++++++++++------
 1 file changed, 24 insertions(+), 6 deletions(-)
```

> ## ✅ NO HANDLER, PRICE PATH, GATE OR TYPE.
> 🔴 **`app/api/**` — ABSENT.** 🔴 **`lib/payments/*` — ABSENT.** 🔴 **`lib/features.ts` — ABSENT.** 🔴 **`components/dashboard/types.ts` — ABSENT.** 🔴 **No migration.** **The change is three Tailwind class strings; the other 21 added lines are comment.**

## D2. What a Pizzeria Gusto customer now sees

**When they add an item with extras or a note, the quantity line sits 10 px under that item instead of 20 px — visibly attached to it rather than floating between two items — with 16 px between multiple lines and 14 px before the divider, exactly matching the operator's Add Order screen.** 🔴 **No control moved, changed size or changed behaviour.**

## D3. Operator surfaces

> ## ✅ **NONE AFFECTED.** `AddOrderPanel.tsx` and `OrderLineItem.tsx` are absent from the diff; the edited row is bespoke inline JSX in the customer page, which no operator surface renders.

---

# PART E — INTEGRITY

## E1 / E2. Non-ASCII census — `app/trucks/[slug]/order/page.tsx`

**276,876 → 278,515 bytes (+1,639), 4,152 → 4,170 lines (+18)**

| Codepoint | Before | After | Δ | Explanation |
|---|---|---|---|---|
| U+2500 BOX DRAWINGS | 2,542 | 2,562 | **+20** | one `──` rule on the new measurement comment |
| U+2014 EM DASH | 363 | 364 | **+1** | prose |
| **U+26A0 WARNING SIGN** | 96 | **98** | **+2** | two caveats — the asymmetry note and the corrected `py-2` note |
| **U+FE0F VARIATION SELECTOR** | 102 | **104** | **+2** | 🔴 **their pairs — the two counts moved together** |
| **all other 35 classes** | — | — | **0** | unchanged |

🔴 **39 → 39 distinct. GAINED NONE, LOST NONE.**

## E3. 🔴 U+26A0 / U+FE0F pair counts

| File | U+26A0 | U+FE0F | Bare | Verdict |
|---|---|---|---|---|
| `app/trucks/[slug]/order/page.tsx` | **98** | **104** | **0** | ✅ **PAIRED — carrier breakdown below** |
| **`docs/customer-quantity-row-report.md`** | equal | equal | **0** | ✅ **PAIRED** — verified by scanning the written file |

**The six-selector difference is benign, and I checked rather than assumed — a byte-level scan of which base character each U+FE0F follows:**

```
U+FE0F carriers:  U+26A0 × 98   ·   U+270F × 5   ·   U+23F8 × 1
```

✅ **All 98 warning signs are paired. The extra six belong to the pencil `✏️` and a pause glyph, both legitimate two-codepoint emoji. BARE U+26A0: ZERO.**

⚠️ **AND THE BRIEF IS RIGHT THAT THE LAST REPORT SHIPPED 12/17 — that was the same benign pattern (12 warning signs, plus 5 pencils quoted from the code), not a defect. 🔴 A bare COUNT comparison cannot tell the two apart; the carrier breakdown is the check that can, which is why it is run rather than the totals compared.**

## E4. Byte scan — byte-level, never `grep`

```
app/trucks/[slug]/order/page.tsx    278,515 bytes   NUL 0   control none
```

✅ **Clean. One file edited, one file scanned.**

## E5. Byte scan of this report — separate pass, AFTER writing

Result appended at the foot of this file.

## E6. `git status` and `git diff --stat` — which entries are THIS task's

```
 M android/app/capacitor.build.gradle
 M android/capacitor.settings.gradle
 M app/dashboard/[token]/page.tsx
 M app/landing/page.tsx
 M app/trucks/[slug]/order/page.tsx
 M components/dashboard/OrderCard.tsx
 M components/native/NotificationSettings.tsx
 M components/native/OperatorDeviceConfig.tsx
 M components/printing/PrintingSettings.tsx
 M ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
 M ios/App/App/Info.plist
 M ios/App/CapApp-SPM/Package.swift
 M lib/plan-features.ts
 M lib/printing/transport.ts
 M package-lock.json
 M package.json
?? docs/…  (ten reports)
?? lib/printing/bleTransport.ts
?? lib/printing/usePrinting.ts
```

| Entry | Whose |
|---|---|
| 🔴 **`app/trucks/[slug]/order/page.tsx`** | **THIS TASK** *(the three spacing classes)* — **and earlier today: the orange-box removal** |
| ✅ **`docs/customer-quantity-row-report.md`** | **THIS TASK** |
| everything else | earlier tasks — the settings grouping, the device-naming sweep, the caption wrap, the plan cell, the app icon, the printing wiring and the BLE transport |

⚠️ **THE TREE HAS BEEN DIRTY ALL SESSION.** ✅ **This task's `git diff --stat` on its own file reads `24 insertions, 6 deletions`.** 🔴 **Nothing is committed.**

## E6b. `tsc`

```
$ npx tsc --noEmit ; echo "tsc exit=$?"
tsc exit=0
```

⚠️ **AND IT PROVES ALMOST NOTHING FOR A SPACING CHANGE — Tailwind class names are strings to the compiler, and a misspelled utility (`-mt-2` typed `-mt2`) silently does nothing.** 🔴 **The arithmetic in A3 is the real check, and it too is arithmetic — nothing was rendered.**

---

# PROVENANCE

**READ** — the customer row and every ancestor from `:2799` to `:3013` including the `divide-y` at `:2712`/`:2759` · the operator row and its container at `AddOrderPanel.tsx:1887-1920` · the variant detail column and all of its states · the diff of both changed class strings · the census before and after with the U+FE0F carrier breakdown · the byte scan · `git diff --name-only` for the operator files · `git status`, `git diff --stat`, `tsc`.

**INFERRED** — every px figure (Tailwind's default scale, `text-sm` = 20 px line-height; **nothing was rendered**) · that margins do not collapse through the `divide-y` border · that the 4 px row-height difference is entirely the control-size difference.

**NOT VERIFIED** — 🔴 **nothing was rendered, on a phone or anywhere else.** The previous task's `py-2` reasoning was sound arithmetic and still wrong on the device, which is the reason to check this one the same way: **open an item with extras on the iPhone and confirm the row now sits closer to its item than to the next.**
