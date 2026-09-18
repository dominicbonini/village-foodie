# Add Order — clearer "Order won't fit" popup and time labels

18 September 2026. **Display and wording only.** Localhost only; nothing deployed, nothing staged or
committed. No live truck was called, and no order was created anywhere.

## 0. The prompt

No span arrived garbled and no instruction contradicted another. One point needed care rather than a
question: the hard constraints freeze six engine outputs while B1 permits a new descriptive field on
`fitOrderBackward`'s result. Those are consistent — the new field is additive and every pre-existing field
is proven byte-identical against the committed golden (§7) — so I proceeded.

## 1. `git status`

**Before** — HEAD `fc0fddc outreach`; 32 modified, 45 untracked (the collection-times work, the rolling
fix, the durable harness and wired printing, all uncommitted).

**After** — the same, plus this work:

| | |
|---|---|
| `M lib/slot-availability.ts` | already modified (rolling fix); this work adds `why` + the types + `peakDetailOver` |
| `M components/dashboard/AddOrderPanel.tsx` | already modified (collection-times); this work rewrites the popup and adds the label |
| `M scripts/batch-rolling-check.cjs`, `M scripts/batch-rolling-identity.cjs`, `M scripts/_batch-rolling-snapshot.cjs`, `M scripts/slot-interval-engine-identity.cjs` | strip the one added key before comparing (§7) |
| `?? lib/slot-fit-message.ts` | **new** — the words |
| `?? scripts/add-order-fit-message.cjs` | **new** — popup + label harness |
| `?? scripts/customer-path-identity.cjs` | **new** — the customer-path proof |
| `?? docs/add-order-fit-message-report.md` | this report |

83 entries in total. Nothing staged, committed, stashed, reset or restored. Diffstat for the two edited
source files: `AddOrderPanel.tsx` 234 lines changed, `slot-availability.ts` +301/−2.

## 2. R1 — the current over-capacity confirm

`submitManual` (AddOrderPanel) re-reads `/api/slots` with `cache:'no-store'`, projects, and calls
`fitOrderBackward`. On `!fit.fits` it then **re-derived its own figures from the one string the engine
left behind**:

```ts
const bb = fit.bound_by ?? ''                       // "Pizza 16/8" | "global ceiling" | "too soon (…)"
const catMatch = bb.match(/^(.+?) (\d+)\/(\d+)$/)
const bind = bb.startsWith('too soon') ? { kind: 'lead' }
  : catMatch ? { kind: 'category', cat: catMatch[1], limit: Number(catMatch[3]), needed: Number(catMatch[2]) }
  : { kind: 'ceiling', limit: ci.kitchenCapacity ?? 0, needed: fit.peak }
```

and rendered:

```tsx
`${bind.cat} can be made ${bind.limit} at a time.${windowFrom ? ` Around ${windowFrom}–${slot}` : ' Here'} it would need ${bind.needed}.`
```

**That `needed` is the bug.** `bound_by` is built inside the engine as
`` `${capWord(cat)} ${Math.round(combined)}/${Math.round(batch)}` `` where `combined = existing + this
order's share **in one window**`. For Dominic's case it is `Pizza 16/8`, so the popup said *"Around
18:15–18:45 it would need 16."* 🔴 **Sixteen pizzas is not a thing that exists** — it is 8 already cooking
in the 18:15 window plus the 8 this order needs in that same window, summed into a figure no oven holds
and no operator can act on. Worse, it hid the real answer: of the **two** batches this order needs, one is
completely free and the other is completely full.

The `#4 · 18:30 · 8` rows came from a second, separate scan — `contributingProductionSlots(...)` over the
window span, filtered to occupying orders, each with its own quantity, plus a `This order · n` footer
using `thisOrderQty`. Its own comment conceded it *"never says which order supplied which unit"*, so it
listed orders that may have had nothing to do with the collision.

## 3. R2 — how the Add Order time list gets its dots today

`slotIndicators` is `buildSlotIndicators(manualSlots, productionSlotUnits, catConfigs, kitchenCapacity,
eventStartMins, categoryOrder, capacityWindowMins, intervalMins)` — **no basket argument**. It answers
*"how busy is this window"*, which is the right question with an empty order and the wrong one with a
basket in hand: Dominic's 18:45 is **green and empty** on the board, and impossible for 9 pizzas.

**There was no basket-aware per-time fit for the operator.** The only basket-aware call in the panel was
`manualPlacement`, which uses `earliestBackwardFitSlot` to find **one** slot (the ASAP/placement answer).

**The customer picker has had exactly the right shape since Stage 3** — `unfittableSlots` in
`app/trucks/[slug]/order/page.tsx`:

```ts
const unfittableSlots = useMemo(() => {
  const out = new Set<string>()
  if (!capacityInputs || Object.keys(basketByCat).length === 0) return out
  const back = projectBackwardOccupancy(...)
  for (const s of availableSlots) {
    const fit = fitOrderBackward(back, toMins(s.collection_time), basketByCat, serverCatConfigs,
      capacityInputs.kitchenCapacity, capacityInputs.eventStartMins, capacityInputs.capacityWindowMins ?? 5,
      nowClamp, (capacityInputs.productionSlotUnits || {})[s.collection_time] || {})
    if (!fit.fits) out.add(s.collection_time)
  }
  return out
}, [...])
```

B3 is that memo, mirrored into the operator panel. The customer has been told which times will not work
for a year; the operator could only find out by placing the order and meeting the popup.

## 4. R3 — where each blocking reason is decided, inside `fitOrderBackward`

There are exactly **three** `consider('red', …)` calls, and nothing else can make a slot not fit.

**(a) Category batch, rolling** — the per-window loop:
```ts
for (const [ws, ord] of orderLoad) {
  for (const [cat, add] of Object.entries(ord)) {
    const combined = categoryLoadOver(back.intervals, cat, ws, ws + prep) + add
    const t: SlotTone = combined > batch + EPS ? 'red' : combined >= batch - EPS ? 'amber' : 'green'
    consider(t, `${capWord(cat)} ${Math.round(combined)}/${Math.round(batch)}`)
```

**(b) Kitchen ceiling** — `windowScopedPeak` over existing ⊕ order intervals, then the instant placement:
```ts
const cookingPeak = windowScopedPeak(realIntervals, orderCookIntervals)
if (cookingPeak > kitchenCapacity + EPS) { consider('red', 'global ceiling') }
else { const { points, runsOffFront: instantOff } = placeInstantPoints(...)
       if (instantOff) { consider('red', 'global ceiling') } … }
```

**(c) Pre-open lead** — `loadRunsOffFront` on the **combined** (existing at slot + new) load:
```ts
if (loadRunsOffFront({ [cat]: (Number(existingAtSlot[cat]) || 0) + M }, catConfigs, slotMins, eventStartMins, nowMins)) runsOffFront = true
…
if (runsOffFront) consider('red', 'too soon (insufficient lead)')
```

**(d) Anything else — none.** Those three are the complete set.

## 5. What changed, by symbol

### `lib/slot-availability.ts`

| Symbol | Change |
|---|---|
| `FitWhyWindow`, `FitWhyBatch`, `FitWhyKitchen`, `FitWhyPreOpen`, `FitWhy` | **new** exported types — the shape below |
| `peakDetailOver` | **new**, module-private. Records **where** the window-scoped peak happened and how it splits. Same instant set as `windowScopedPeak`, same `concurrencyAt` primitive — see the note below |
| `fitOrderBackward` | result gains **`why: FitWhy`**, populated at R3's three decision points. `tone`, `bound_by`, `fits`, `peak`, `spanFromMins` unchanged for every input |

The `why` shape:

```ts
type FitWhy = Array<FitWhyBatch | FitWhyKitchen | FitWhyPreOpen>          // batch, then kitchen, then pre-open
FitWhyBatch   = { kind:'batch',   cat, batch, prepMins, windows: FitWhyWindow[] }   // windows earliest-first
FitWhyWindow  = { startMins, endMins, existing, free, share }
FitWhyKitchen = { kind:'kitchen', cap, startMins, endMins, existing, add }          // existing+add === fit.peak
FitWhyPreOpen = { kind:'preopen', cat, eventStartMins }
```

- **batch** is filled inside the very loop that computes `combined`: `existing` is that loop's own
  `categoryLoadOver` result (extracted to a `const`, not read a second time), `free = max(0, batch −
  existing)`, `share = add`. A category is listed only if one of its windows was `red`.
- **kitchen** is filled at both `consider('red','global ceiling')` sites. `existing = total − add` where
  both come from `peakDetailOver` at the argmax instant.
- **pre-open** is pushed where `runsOffFront = true` is set, carrying the category that caused it.
- `why` is **empty whenever `fits` is true** (asserted over 304 fitting slots in §7).
- `cat` is the engine's **lowercase key**, deliberately: the stored display name lives in
  `menu_categories.name`, which this module has never seen. The caller maps it.

**One judgement call, declared.** `windowScopedPeak` is a frozen §31 symbol (byte-identical to HEAD is
asserted by `slot-interval-engine-identity.cjs`), so it could not be taught to report its argmax.
`peakDetailOver` therefore repeats its instant set and calls the same `concurrencyAt`. That is a second
traversal of the same data, and the risk is drift — so `add-order-fit-message.cjs` asserts
**`why.kitchen.existing + why.kitchen.add === fit.peak`**, which fails the moment the two disagree.

### `lib/slot-fit-message.ts` (new)

`buildFitMessage({ slotLabel, why, catLabel })` → `{ title, lines }`, plus `fitMins`. It formats and
pluralises; **it performs no arithmetic on the capacity figures** (asserted). `catLabel` maps the engine
key to the stored display name.

### `components/dashboard/AddOrderPanel.tsx`

| Symbol | Change |
|---|---|
| `capacityConfirm` state | `bind`, `unitWord`, `windowFrom`, `contributors`, `thisOrderQty` **removed**; `message: FitMessage` added |
| `submitManual` | the whole re-derivation block deleted — `capWord`, `isCounted`, the `bound_by` regex, `unitWord`, `contributingProductionSlots`, `normaliseOrderLines`, `fmtMins`, `fit.peak`. It now calls `buildFitMessage({ slotLabel: effectiveSlot, why: fit.why, catLabel: catLabelFor })`. `seenTone`/`freshTone` stay (they decide the "filled" note, which is about the board moving, not arithmetic) |
| `catLabelFor` | **new** memo — inverts `categoryOrder` + `itemCategoryMap` to key → stored display name |
| `manualFitWhy` | **new** memo — B3's per-time fit, the customer memo's exact shape |
| the time `<option>` | appends `· Order won't fit` and greys, after the existing dot and label |
| the modal body | renders `message.title` + `message.lines`; the contributors block is gone; buttons unchanged |

Two imports became unused and were removed (`contributingProductionSlots`, `normaliseOrderLines`).

## 6. The screens, as text — generated from the real code

**Dominic's case** (batch 8, prep 15, 15-minute grid, 8 @18:30 and 8 @19:00, order 9 pizzas at 18:45):

```
┌─────────────────────────────────────────────────────┐
  Order won't fit at 18:45
  Pizza: 8 at a time, every 15 minutes.
  This order needs 2 batches to be ready by 18:45, but only 1 has room.
    18:15–18:30 · Pizza · Full
    18:30–18:45 · Pizza · 8 free
  [ Pick another time ]   [ Place it anyway ]
└─────────────────────────────────────────────────────┘
```

Every figure is a real thing in the kitchen: the batch size, the cadence, how many batches this order
needs, and for each one what is in it. **No 16.**

**The time list for the same 9-pizza order** (a 17:00–21:00 event; greyed rows still selectable):

```
  17:00 🟢 · Order won’t fit      ← cooking would start before the doors open
  17:15 🟢
  17:30 🟢          ⋮ (17:45, 18:00, 18:15 likewise unlabelled)
  18:30 🔴 8 Pizzas · Order won’t fit
  18:45 🟢 · Order won’t fit      ← the dot is GREEN and empty; only the basket makes it impossible
  19:00 🔴 8 Pizzas · Order won’t fit
  19:15 🟢 · Order won’t fit
  19:30 🟢                        ⋮ (19:45 … 21:30 all fine)
```

18:45 and 19:15 are the point of the whole change: a green, empty-looking window that this order cannot
use. The dot's colour and its `8 Pizzas` label are untouched.

## 7. Each harness — failure mode, broken variant first, then the real result

### `scripts/add-order-fit-message.cjs` (new)
**Failure mode:** the popup printing a combined total no oven can hold (the 16), or the time list
labelling a slot that fits / missing one that does not.

| Broken variant | Result |
|---|---|
| V1 — the popup re-deriving its own total from `bound_by`, as the old code did | **✓ FAILED as required**: produced *"Pizza can be made 8 at a time. Around 18:15–18:45 it would need 16."* |
| V2 — the label driven by the basket-agnostic dot | **✓ FAILED as required**: 18:45's dot is `green` ⇒ no label, while the real fit refuses it |
| V3 — the label with no capacity data (guard skipped) | **✓ FAILED as required**: 1 time labelled from data that does not exist |

**Real result — `✅` 28 checks, 0 🔴.** Dominic's popup is **exactly** the five specified lines; no "16";
every printed quantity of food ≤ the batch of 8 (clock times and the cadence excluded from that check).
N=1 full; N>1 none-has-room (both lines `Full`); `18:15–18:30 · Pizza · 5 free, needs 8` with the matching
`but only 1 has room`; the kitchen sentence with `existing 2 + add 2 === fit.peak 4`; the pre-open
sentence; the two-reason case ordered `["batch","kitchen"]`; a fitting slot yields an empty `why` and no
lines. Sweep: **60 fixture order/basket combinations × ~34 times = 2,040 times, 1,185 labelled, 0 where
the label and the popup disagree**; an empty order labels nothing; no capacity data labels nothing. Nine
source-level assertions pin the shipped memo to what was modelled.

### `scripts/batch-rolling-identity.cjs` (extended, golden **not** regenerated)
**Failure mode:** a capacity verdict moving under cover of a display change.

| Broken variant | Result |
|---|---|
| V1 — off-by-one in `categoryLoadOver`'s overlap test (pre-existing) | **✓ FAILED as required** |
| V2 — `fits` inverted on one fixture (**new, as the brief requires**) | **✓ FAILED as required**: digest differs from the golden |

**Real result — `✅` 0 🔴 across all 20,554 golden fixtures.** New assertions: the result carries exactly
`["bound_by","fits","peak","spanFromMins","tone"]` **plus `why` and nothing else** (checked on three
fixture kinds), and `why` is empty on all **304** fitting slots of the §31 fixtures.
`scripts/fixtures/batch-rolling-golden.json` was **not regenerated or edited** — `_batch-rolling-snapshot.cjs`
strips the one added key before digesting.

### `scripts/customer-path-identity.cjs` (new)
**Failure mode:** a customer being offered, or refused, a time they would not have been before.

| Broken variant | Result |
|---|---|
| V1 — one slot forced into the customer's unfittable set | **✓ FAILED as required**: 1 → 2 |

**Real result — `✅` 9 checks, 0 🔴.** A "before this work" engine is reconstructed by mechanically
removing this work's additions from a copy (each fragment must match exactly once, or the harness stops),
compiled alongside the current one, and both run over the same 60-basket sweep: **1,185 unfittable slots,
0 differ**. All seven ring-fenced customer files carry no reference to this work, and the customer page
never reads `why`.

### `scripts/batch-rolling-check.cjs` and `scripts/slot-interval-engine-identity.cjs` (adjusted)
Both compare whole `fitOrderBackward` results against a pre-`why` baseline (the golden's recorded verdicts,
and a HEAD worktree). Both now strip **only** `why`, with the same rationale as above; their own broken
variants are untouched and still fail first. Engine-identity still asserts the seven §31 symbols —
`windowScopedPeak` included — byte-identical to HEAD.

## 8. Verification

| Step | Result |
|---|---|
| `npx tsc --noEmit` | rc 0 |
| `npx next build` | rc 0 — `✓ Compiled successfully` |
| **All harnesses** (`add-order-fit-message`, `customer-path-identity`, `batch-*`, `slot-interval-*`, `printing-*`, `outreach-*`, `whatsapp-*`) | **31 files, every one rc=0** |
| eslint vs a clean HEAD worktree, per rule | `@typescript-eslint/no-explicit-any` 3 → 3 · `@typescript-eslint/no-unused-vars` 5 → **4** · `react-hooks/exhaustive-deps` 7 → **10** · `react-hooks/set-state-in-effect` 5 → 5 · `react/no-unescaped-entities` 2 → 2 |

**The eslint delta explained.** `no-unused-vars` drops by one — this work deleted two now-unused imports.
`exhaustive-deps` rises by three, and all three are the *same pre-existing warning* reported once more
because there is one more memo consuming the same three values: eslint cannot prove that
`manualSlots = apiSlots.length ? apiSlots : …`, `capacityInputs = apiCapacityInputs ?? …` and
`serverCatConfigs = Object.keys(apiCatConfigs).length ? apiCatConfigs : …` return stable references, so it
warns for `slotIndicators` (line 568), `manualFitWhy` (624) and `manualPlacement` (665) alike. No new
*kind* of warning appeared.

**The cost of B3, measured.** One `projectBackwardOccupancy` plus one `fitOrderBackward` per listed time:
**2,040 fits in 135 ms ⇒ ~2.25 ms to recompute a whole 34-slot list**. Online — the normal path — the three
inputs above are the state objects themselves, so the memo recomputes only when the grid, the capacity
inputs or the basket actually change; typing a customer's name recomputes nothing. **Offline**, the
fallback rebuilds `capacityInputs` as a fresh object literal each render, so the memo recomputes each
render at that ~2.25 ms. I left that as it is rather than restructure `capacityInputs`, which two existing
memos also depend on.

## 9. Localhost test script — test-truck (Pizza Kitchen) only

🔴 **Never Pizzeria Gusto.** I did **not** run this: the popup and the label are UI, so the meaningful
check is a human one; the engine behind them is proven above.

Setup: `npm run dev`, open `/dashboard/<test-truck token>`, pick today's event on Van1, and set the
category so the case is reproducible — **Pizza: prep 15 min, batch 8**, van **kitchen capacity empty**,
collection interval **15**.

1. **Build the board.** Add Order → 8 Pizzas → time **18:30** → place. Repeat with 8 Pizzas at **19:00**.
   The time list should now show 🔴 on 18:30 and 19:00 with `8 Pizzas`.
2. **Dominic's case.** Add Order → **9 Pizzas**. Before choosing a time, open the time list: **18:45 and
   19:15 should be greyed with `· Order won't fit`, while their dots stay green**, and 17:00 should also
   be labelled (pre-open). Times from 19:30 on should be unlabelled.
3. Choose **18:45** and press the place button. Expect exactly:
   *Order won't fit at 18:45* / *Pizza: 8 at a time, every 15 minutes.* / *This order needs 2 batches to be
   ready by 18:45, but only 1 has room.* / *18:15–18:30 · Pizza · Full* / *18:30–18:45 · Pizza · 8 free*.
   **Check there is no "16" anywhere**, and no `#n · time · count` rows.
4. Press **Pick another time** → the modal closes and the time clears. Press the place button again after
   re-choosing 18:45, then **Place it anyway** → the order is created at 18:45 (unchanged behaviour).
5. **A small order that fits at 18:45.** Add Order → **1 Pizza** → the list should show **no labels at all**
   (the 18:30/19:00 dots stay red; that is the window's busyness, not this order's verdict). Choose 18:45,
   place → it goes straight through with **no popup**.
6. **An empty order.** Clear the basket. The time list must be **exactly as it was before this change** —
   dots and `{n} {Category}` labels only, no greying, no `· Order won't fit`.
7. **No data.** Stop the dev server (or go offline with no cached grid for this event) and reopen Add
   Order with items in the basket: **no `Order won't fit` labels at all** — never a verdict without inputs.

## 10. Manual sections made stale (NOT edited)

`docs/reference-manual.md`:
- **§31** describes the capacity verdicts and the wording built on `bound_by`. The `X/Y` form of
  `bound_by` is unchanged and still the tone's label, but it is **no longer the source of the operator's
  copy** — `why` is. The section should record that `bound_by` is a tone label, not a sentence, and that
  printing its numerator to an operator is what produced "it would need 16".
- The section documenting the **over-capacity confirm** (the `Around … it would need …` sentence, the
  contributor rows and `contributingProductionSlots`' role in them) now describes a screen that no longer
  exists.
- Any inventory of `fitOrderBackward`'s result should gain `why`, noting it is display-only and empty when
  `fits` is true.
- The Add Order time-list description should note the new basket-aware label and that the **dot remains
  basket-agnostic** — the two now answer different questions on purpose.

## 11. Anything I could not establish

- **That `<option>` greying renders on every platform.** The label is plain text and always shows; the
  grey is `style={{ color: '#94a3b8' }}` on an `<option>`, which Chrome and Safari on macOS/iOS honour but
  which some Android WebView / GTK select renderers ignore. The row is still marked by its text, so the
  information survives; only the colour may not. Unverified on a real device.
- **The popup's exact on-screen line wrapping** at phone width — the strings are correct, the layout is
  not something a harness can see.
- **Whether the "filled" note still reads well** under the new fixed title. I kept
  *"Another order came in while you were adding this one."* because it reports a real race the brief did
  not ask me to remove, but it now sits under *"Order won't fit at 18:45"* rather than
  *"18:45 has filled up"*, and I have not seen the two together on screen.
- **Behaviour against a real multi-category basket on a live board** — every multi-category case here is a
  fixture. The sweep covers two-category configurations, but no real truck data exercises them (Gusto is
  single-category plus drinks).
- **The offline recompute cost in practice** (§8): measured in Node against fixtures, not in a browser on
  an iPad.
