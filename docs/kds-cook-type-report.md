# KDS: Cook's large-type treatment, restored

**One file changed: `components/dashboard/OrderCard.tsx`.** `npx tsc --noEmit` passes with no output —
**which is not verification.**

**No commit, no stage, no revert, no stash, no clean.** 🔴 **No `git stash`, `checkout` or `restore` —
the only git commands run were `status` and `show`.** No build, no `next dev`, no `next build`, no
`cap sync`, no deploy, no SQL, no migration.

**Untouched:** the board filters, `boardMode`, `boardKeepsReady`, the two switches, `hideAmounts`,
`renderButtons`, `completionBtn`, the status badge, `RejectOrderModal`, the shared post-gate handler,
the toast system, the push work, the event bar, anything under `app/api` — EXECUTED: only
`OrderCard.tsx` appears in this task's diff.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

# ⚠️ Q4 DID NOT FIND A BREAKER — BUT IT DID REFUTE THE PREMISE THE STOP WAS WRITTEN AGAINST

**Your brief says *"`MAX_GRID_VISIBLE` is 8 with no scroll, so taller cards could push content out of
view"*. 🔴 THE QUEUE PANEL SCROLLS.** Details in Q4. **The cap is on COUNT, not on height, so nothing is
pushed out of view — it is pushed further down a scrollable region. No stop condition met, and I
proceeded.**

---

# STAGE 1

# Q1 — EVERY TEXT ELEMENT, PER SURFACE

**`I` = inherited from an ancestor rather than set. `DEAD` = set in a branch that surface never runs.**
**These are the BEFORE values.**

## Header

| Element | Dashboard `solo` | KDS `Full` (window) | KDS `Cook` |
|---|---|---|---|
| container padding | `px-4 py-3` | `px-3 py-2` | `px-3 py-2` |
| 🔴 **order number** | `text-2xl font-bold` | `text-3xl font-bold` | 🔴 **`text-lg font-bold`** |
| collection time | `text-lg font-bold` | `text-sm` **I** *(row 2's `font-medium text-sm`)* | `text-xs` |
| customer name | `text-sm` *(set on `nameEl`)* | `text-sm` **I** | 🔴 **`text-xs`** |
| "in Xh" / age readout | `text-sm` **I** | `text-sm` **I** | `text-xs` **I** |
| late pill | `text-xs` | `text-[10px]` | `text-[10px]` |
| order total | `text-sm font-bold` | `text-base font-bold` | ⚠️ **not rendered** |
| status badge | `text-xs` | `text-xs` | `text-xs` |
| buzzer chip | `text-[10px]` | `text-[10px]` | `text-[10px]` |
| paid chip | `text-[10px]` | `text-[10px]` | ⚠️ not rendered *(`hidePayments`)* |
| `✓` all-struck | `text-xs` | `text-xs` | `text-xs` |

## Items

| Element | `solo` | `Full` | `Cook` |
|---|---|---|---|
| category heading | `text-xs` | `text-xs` | `text-xs` |
| "Deals" heading | `text-xs` | `text-xs` | ⚠️ n/a — deals are dissolved |
| 🔴 **item line (`3× Name`)** | `text-sm` | `text-sm` | 🔴 **`text-sm`** |
| item name span | **I** from the button | **I** | **I** from the `<p>` |
| quantity | ⚠️ **same text run as the name** — no separate class, on any surface |
| line price | `text-sm` | `text-sm` | ⚠️ not rendered |
| deal name / price | `text-sm` | `text-sm` | ⚠️ n/a |
| modifier line | `text-xs` | `text-xs` | `text-xs` |
| modifier price | `text-sm` | `text-sm` | ⚠️ n/a |
| note / special instructions | `text-xs italic` | `text-xs italic` | `text-xs italic` |
| struck counter | `text-xs` | `text-xs` | ⚠️ n/a |
| **item-row type ternary** | `text-sm` | `text-sm` | 🔴 **`text-base` — DEAD** |

## Elsewhere

| Element | `solo` | `Full` | `Cook` |
|---|---|---|---|
| order-notes block | `text-sm`, `mb-2` | `text-sm`, `mb-3` | `text-sm`, `mb-3` |
| conflict markers | `text-xs` | `text-xs` | `text-xs` |
| `⏳ Syncing…` | `text-sm` | `text-sm` | `text-sm` |
| action buttons | 🔴 **`renderButtons`' own sizes — NOT gated on any mode and NOT touched** |

# 🔴 THE FINDING IN ONE LINE: COOK IS SMALLER THAN FULL ON THE ORDER NUMBER (`text-lg` vs `text-3xl`), THE NAME (`text-xs` vs `text-sm`) AND THE TIME — AND IDENTICAL ON THE ITEM LINES.

---

# Q2 — DEAD SIZE EXPRESSIONS: EXACTLY ONE

**EXECUTED — every size expression gated on `cardStyle` or `viewMode` in the file:**

```
1360:  ${cardStyle === 'solo' || cardStyle === 'window' ? 'text-sm' : 'text-base'}   ← DEAD ARM
1415:  ${cardStyle === 'solo' ? 'mb-2' : 'mb-3'}                                    ← a MARGIN, and live on all three
```

🔴 **ONE, AND IT IS THE ONE THE AXES REPORT NAMED.** The `text-base` arm is the cook arm of a ternary
that lives inside the **window/solo item renderer** — the arm Cook never runs, because Cook takes the
`itemGroups` block above it. ✅ **Both live values were `text-sm`, so it had no effect on any surface.**

✅ **No others.** `1415` is a margin, not a size, and every one of its arms is reachable.

---

# Q3 — WHAT COOK RENDERS THROUGH A DIFFERENT RENDERER, AND WHERE ITS SIZES COME FROM

**READ — the split:**

```tsx
          {cardStyle === 'cook' ? (
            <div className="mb-2">
              {itemGroups.map(({ cat, lines }, gi) => (
```

| | Cook | Full |
|---|---|---|
| data source | `itemGroups` — **deals DISSOLVED into category batches** | `standaloneGroups` **plus** deal blocks |
| line markup | a plain `<p>` | a `<button>` with a `w-16` price column |
| notes field | `line.note` | `line.specialInstructions` |
| 🔴 **where the size is set** | 🔴 **SET, on the `<p>` itself** (`text-sm`) | **SET on the `<button>`**, inherited by the name span |

✅ **Cook's item sizes are SET in its own renderer, not inherited from the card** — which is why raising
them cannot leak into Full: the two arms share no class string.

---

# Q4 — 🔴 NOTHING BREAKS WHEN A CARD GROWS. THE PANEL SCROLLS.

**READ — the queue panel:**

```tsx
        <div className="flex flex-col flex-1 min-w-0 overflow-y-auto">
```

# ✅ `overflow-y-auto`. TALLER CARDS SCROLL; THEY DO NOT PUSH CONTENT OUT OF VIEW.

**READ — and the cap is on COUNT, not on height:**

```tsx
  const MAX_GRID_VISIBLE = activeLayout === 'grid' ? 8 : 6
  const visibleOrders = activeLayout === 'grid'
    ? displayOrders.slice(0, MAX_GRID_VISIBLE)
    : displayOrders
```

⚠️ **`MAX_GRID_VISIBLE` slices an ARRAY. It knows nothing about pixels, and a card's height cannot
change how many it admits.** ✅ **`overflowCount` still reports the remainder as "+N more in queue".**

**EXECUTED — what does NOT exist anywhere on the KDS:**

```
offsetHeight · clientHeight · getBoundingClientRect · scrollHeight · ResizeObserver   →  0 occurrences
```

✅ **Nothing measures a card. No sticky offset is computed from one** — the only `sticky` in the file is
a comment about the dashboard. ✅ **The grid is `repeat(auto-fill, minmax(240px, 1fr))`, which is a WIDTH
rule; height plays no part in the column count.**

## ⚠️ THE REAL CONSEQUENCE, STATED BECAUSE IT IS A COST RATHER THAN A BREAK

**The grid is `items-stretch`, so a row is as tall as its tallest card — a long order enlarges its whole
row.** 🔴 **Bigger type means fewer cards visible without scrolling, and scrolling is a genuine cost on a
grill screen read from a metre away with hands full.** ✅ **That is the trade this task is asking for,
and it is bounded: the board never renders more than 8 in grid, and it scrolls.**

---

# Q5 — IS ANY SIZE SHARED WITH SOLO?

# ⚠️ ONE WAS, AND IT IS THE DEAD TERNARY. NOTHING ELSE.

| Expression | Shared with solo? |
|---|---|
| `cardStyle === 'solo' \|\| cardStyle === 'window' ? 'text-sm' : 'text-base'` | 🔴 **YES** — solo takes `text-sm` |
| the cook header block | ✗ — `cardStyle === 'cook'`, which solo never is |
| the cook item renderer | ✗ — same gate |
| `cardStyle === 'window' ? 'px-3 py-2' : 'px-4 py-3'` | ⚠️ **yes, and NOT TOUCHED** |
| `cardStyle === 'solo' ? 'mb-2' : 'mb-3'` | ⚠️ **yes, and NOT TOUCHED** |

✅ **The one shared expression was replaced with the literal `text-sm` — the exact value solo and Full
both already resolved to — so solo's output is character-identical.**

---

# STAGE 2 — THE TREATMENT

🔴 **EVERY SIZE CHANGE IS INSIDE A `cardStyle === 'cook'` BRANCH. Full renders the window header and its
own item renderer; solo renders its own header and the same item renderer as Full. Neither can reach
the changed lines — which is why this treatment needed no new gate and cannot regress the dashboard.**

## What moved

| Element | BEFORE | AFTER | Why |
|---|---|---|---|
| 🔴 **order number** | `text-lg` | 🔴 **`text-4xl`** | The one thing read across the room. A full step above Full's `text-3xl`, which is the ordering the two screens should always have had |
| 🔴 **item line — quantity AND name** | `text-sm` | 🔴 **`text-xl`** | The second thing read at distance. ⚠️ **Quantity and name are ONE TEXT RUN, so one class raises both** |
| category heading | `text-xs` | **`text-sm`** | One step, so the hierarchy survives the enlargement instead of the items swallowing it |
| modifier line | `text-xs` | **`text-sm`** | ⚠️ **NOT secondary detail — "no onions" is an instruction** |
| note | `text-xs` | **`text-sm`** | ⚠️ **An allergy note is the reason the card is held for review at all** |
| **customer name** | `text-xs` | ⚠️ **UNCHANGED at `text-xs`** | A cook does not read the name; it is the hatch's field. Left small so the enlargement above costs no extra height |
| **time / "in Xh"** | `text-xs` | ⚠️ **UNCHANGED** | Same reasoning. Cook works from the queue order, not the clock |
| late pill · buzzer chip · status badge · `✓` | — | ⚠️ **UNCHANGED** | Indicators, not reading matter |
| **buttons** | — | ⚠️ **UNCHANGED** — `renderButtons` is on your do-not list and was not opened |

⚠️ **NOTHING SHRANK. The brief permitted shrinking secondary detail to buy room; it was not needed —
the name and time were already at `text-xs`, the smallest step in use on the card.**

## The code

```tsx
            {/* 🔴 THE ORDER NUMBER IS THE ONE THING READ ACROSS THE ROOM. `text-4xl` puts it a full step
                above Full's `text-3xl`, which is the ordering the two screens should always have had. */}
            <span className="text-4xl font-bold text-slate-900 truncate">#{order.id}</span>
```

```tsx
                      {/* 🔴 THE QUANTITY AND THE NAME ARE ONE TEXT RUN, so one size raises both — and they
                          are the second thing a cook reads at distance after the order number. `text-xl`
                          against Full's `text-sm` item lines. */}
                      <p className="text-xl font-normal text-slate-900">{line.quantity}× {line.name}</p>
```

```tsx
                          {/* ⚠️ MODIFIERS AND NOTES ARE PART OF WHAT TO MAKE, not secondary detail — "no
                              onions" is an instruction, and an allergy note is the reason this card is
                              held for review at all. One step up, still below the item line. */}
                          {line.modifiers?.map(m => (
                            <p key={m.name} className="text-sm text-slate-500">+ {m.name}</p>
                          ))}
```

## The dead expression — REMOVED

**BEFORE:**
```tsx
${cardStyle === 'solo' || cardStyle === 'window' ? 'text-sm' : 'text-base'}
```
**AFTER:**
```tsx
                          className={`w-full flex justify-between items-baseline gap-2 text-sm rounded py-1.5 text-left ${
```

✅ **Character-identical for solo and for Full — both resolved to `text-sm` already.** ⚠️ **The removed
expression survives only inside the comment that records why it went.** ✅ **EXECUTED: `grep` for
`? 'text-sm' : 'text-base'` returns ONE hit, on a comment line.**

## 🔴 THE RESULTING ORDER — EXECUTED

```
cook   #id  text-4xl        FOUND
window #id  text-3xl        FOUND
solo   #id  text-2xl        FOUND
cook   item line  text-xl   FOUND
full   item line  text-sm   FOUND
cook   cat heading text-sm  FOUND
full   cat heading text-xs  FOUND
```

# ✅ COOK > FULL > SOLO ON THE ORDER NUMBER, AND COOK > FULL ON ITEM LINES AND HEADINGS.

## Solo, and the switches

✅ **EXECUTED — `grep -c cardStyle` on `app/dashboard/[token]/page.tsx` returns `0`.** The dashboard
passes neither prop, `cardStyle` defaults to `viewMode`, both resolve to `'solo'`, and every changed
line is behind `cardStyle === 'cook'`.

✅ **The switches change nothing here.** Every edit is gated on `cardStyle`, which comes from the
Full/Cook control alone; `viewMode` (the switches) appears in **zero** of them. **EXECUTED — the nine
`cardStyle` code references are unchanged in kind from the axes split, minus the two the dead ternary
held.**

---

# THE "TO MAKE" PILL BAR — REPORT ONLY. NOT CHANGED.

**READ — the gate:**

```tsx
      {allDayPills.length > 0 && boardMode === 'window' && (
```

⚠️ **AND ITS OWN COMMENT CLAIMS THE GATE IS DELIBERATE:** *"ON boardMode, DELIBERATELY — the card toggle
must not hide it"* — written when `cardMode` was the thing that might wrongly hide it.

**What it shows:** `allDayPills`, a per-item aggregate across the board — the outstanding count of each
item still to be made, as pills.
**When it renders:** only when there is at least one pill **and** `boardMode === 'window'`, i.e. only
when Payment/Collected is ON.

# 🔴 THE PARADOX WORTH NAMING: IT IS A MAKING AID, AND IT IS HIDDEN ON THE MAKING SCREEN.

`boardMode === 'window'` is the HANDOVER configuration. A Payment/Collected-**off** device — the one
whose whole job is making food — resolves `boardMode === 'cook'` and never sees it.

| Reading | What it would follow | Consequence |
|---|---|---|
| **Lifecycle** | `boardMode` — as today | ⚠️ **unchanged, and the paradox above stands.** Defensible only if the bar is understood as "what the hatch still owes", not "what the kitchen still has to make" |
| **Presentation** | `cardStyle` | 🔴 **INVERTS TODAY'S BEHAVIOUR**: it would show on a Cook-display device and hide on Full — which is at least the right way round for a making aid, but makes a DISPLAY control decide whether an aggregate exists |
| **Always-on** | nothing — render whenever `allDayPills.length > 0` | ✅ **Simplest, and removes the question.** ⚠️ Costs vertical space on the hatch screen, which is the screen with the least of it once the Done strip is also showing |

🔴 **RECOMMENDING NOTHING. Unchanged.**

---

# 🔴 VERIFICATION

| Item | Method |
|---|---|
| **Cook renders LARGER than Full on the order number, item names and quantities** | ✅ **EXECUTED as a class fact** — the seven-line grep table above; `text-4xl` > `text-3xl`, `text-xl` > `text-sm`. 🔴 **NOT RENDERED — no screen was measured, and no card was seen at any distance** |
| **Cook renders identically with Payment/Collected on and off** | 🔴 **SOURCE READ ONLY**, and structural: every changed line is inside `cardStyle === 'cook'`, and `cardStyle` comes from the Full/Cook control alone — `viewMode` appears in none of them |
| **Full renders identically on both switch settings, and is unchanged from before** | 🔴 **SOURCE READ ONLY.** Full takes the window header and the window/solo item renderer; the only edit either received was the dead ternary collapsing to the value it already produced |
| **The dashboard is unchanged in every branch** | ✅ **EXECUTED for the isolation** — `grep -c cardStyle` on the dashboard page returns `0`, and `cardStyle` defaults to `viewMode`. 🔴 **NO BROWSER WAS OPENED ON GUSTO'S DASHBOARD** |
| **No dead size expression remains** | ✅ **EXECUTED** — the only surviving occurrence of the removed ternary is a comment quoting it |
| **Nothing outside the card depends on card height** | ✅ **EXECUTED** — zero occurrences of `offsetHeight`, `clientHeight`, `getBoundingClientRect`, `scrollHeight` or `ResizeObserver` on the KDS; the panel is `overflow-y-auto`; the cap slices an array |
| lint | ✅ **EXECUTED** — the five findings in this file sit at lines 73–350, all above every edit, all pre-existing |

🔴 **NOT ONE RENDERING CLAIM WAS OBSERVED. The sizes are proven as classes, not as pixels — whether
`text-4xl` is actually legible at a metre is a device question this cannot answer.**

---

# INTEGRITY

## Non-ASCII class census — `components/dashboard/OrderCard.tsx`

# ✅ 31 CLASSES BEFORE, 31 AFTER. NO CLASS GAINED OR LOST.

| Class | BEFORE | AFTER | Δ | Explanation |
|---|---|---|---|---|
| U+2500 BOX DRAWINGS LIGHT HORIZONTAL | 1518 | 1534 | +16 | one comment banner |
| U+2014 EM DASH | 184 | 190 | +6 | comment prose |
| **U+26A0 WARNING SIGN** | 64 | 67 | **+3** | three new caveats — **all paired** |
| **U+FE0F** | 62 | 65 | **+3** | ✅ **matches the U+26A0 delta exactly** |
| U+1F534 LARGE RED CIRCLE | 61 | 64 | +3 | comment prose |
| *every other class* | — | — | **0** | 🔴 **including `U+00D7` at 5 — the `×` in `{line.quantity}× {line.name}` was not retyped, only its wrapper's class changed; and `U+1F4DD` at 4, the `📝` note glyph** |

⚠️ **bytes 103,048 → 105,328. The change itself is five class strings; the growth is the reasoning for
why Cook is now the larger screen, which is the part that stops the next split inverting it again.**

## 🔴 The 2 pre-existing bare `U+26A0`

| Base | BEFORE | AFTER |
|---|---|---|
| U+26A0 | 64 / 62 / **2 bare** | 67 / 65 / **2 bare** ✅ **UNCHANGED** |

**They are the two conflict markers. All three warning signs added this task are paired.**

## Byte-level scan — NUL and every control byte below 0x09, plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F

```
  components/dashboard/OrderCard.tsx                  105,328  offending=0  CR=0   (was 103,048)
  docs/kds-cook-type-report.md   (SEPARATE PASS)      19,651  offending=0  CR=0
TOTAL OFFENDING: 0
```

## 🔴 Carrier-aware variation-selector check on this report

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+1F534 LARGE RED CIRCLE | 41 | 0 | 41 |
| **U+26A0 WARNING SIGN** | **30** | **30** | ✅ **0** |
| U+2705 WHITE HEAVY CHECK MARK | 29 | 0 | 29 |
| U+2717 BALLOT X | 2 | 0 | 2 |
| U+2713 CHECK MARK | 2 | 0 | 2 |
| U+23F3 HOURGLASS WITH FLOWING SAND | 2 | 0 | 2 |
| U+1F4DD MEMO | 2 | 0 | 2 |

# ✅ EVERY WARNING SIGN IN THIS REPORT IS PAIRED — 30 OF 30, ZERO BARE.

⚠️ **`OrderCard.tsx` carries two bare `U+26A0` — the conflict markers — but this task neither touches
nor quotes them, so 0 is the correct number here rather than a suppressed one.**

✅ **The report's total `U+FE0F` count is 30, which exactly accounts for the 30 paired warning signs and
leaves none attached to any other base.** ✅ **The six unpaired bases are internally consistent — 0 of
41, 0 of 29, 0 of 2, 0 of 2, 0 of 2, 0 of 2 — so no base is split across two renderings.** ⚠️ **`U+23F3`
and `U+1F4DD` are bare because each is inside a verbatim quote of the card's own `⏳ Syncing…` and
`📝` note markup, which the source writes bare.

## `git status --porcelain`

```
$ git status --porcelain
 M components/dashboard/OrderCard.tsx
?? docs/kds-cook-type-report.md
```

**Which entries were already there before this task began:**

| Entry | Pre-existing? |
|---|---|
| 🔴 **`M components/dashboard/OrderCard.tsx`** | 🔴 **THIS TASK — it was CLEAN when this task began** |
| 🔴 **`?? docs/kds-cook-type-report.md`** | 🔴 **THIS TASK** |
| `M app/dashboard/[token]/page.tsx` · `M lib/useToasts.ts` · `M lib/native/push.ts` · `M components/native/OperatorDeviceConfig.tsx` · `M components/dashboard/helpers.ts` | ✅ pre-existing — the push-tap fix. 🔴 **NONE touched this task** |
| `?? docs/push-tap-fix-report.md` · `?? docs/push-tap-toast-report.md` · `?? docs/kds-notification-event-report.md` | ✅ pre-existing |
