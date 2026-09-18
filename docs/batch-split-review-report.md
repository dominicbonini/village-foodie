# Batch split review — how an order is spread across cooking windows, and one label fix

18 September 2026. **Part 1 is a review: the engine is untouched.** Part 2 changed one separator in the
Add Order time list and two harnesses. Localhost only; nothing deployed, staged or committed. No live truck
was called; Gusto analysis used the committed fixtures only (no SQL was needed — every Gusto fact below
comes from `scripts/fixtures/batch-rolling-golden.json`).

## 0. The prompt

No span arrived garbled and no instruction contradicted another.

## 1. `git status`

**Before** — HEAD `fc0fddc outreach`; 32 modified, 52 untracked. **After** — 86 entries; this prompt's
only source change is `M components/dashboard/AddOrderPanel.tsx` (already modified), plus edits to the two
untracked harnesses `scripts/add-order-render.cjs` and `scripts/add-order-fit-message.cjs`, and this
report. `scripts/fixtures/batch-rolling-golden.json` is untouched (sha256 `8bdae817748ad334…`, unchanged).

---

# PART 1 — REVIEW

## 1.1 Dominic's case, through the real working-tree engine

Fixture: Pizza prep 15 / batch 8, kc null, event 17:00–21:00, 15-minute grid.

### State 1 — stored 8 @17:00 and 1 @17:15; new order 9 @17:30

`projectBackwardOccupancy` seats the stored load as `[16:45,17:00) 8` (the pre-open run-up) and
`[17:00,17:15) 1`. `fitOrderBackward` for 9 @17:30:

| The order's windows | Rolling load there | Free | The engine's share | Verdict |
|---|---|---|---|---|
| `[17:00,17:15)` (earlier) | 1 | 7 | **8** | 1 + 8 = 9 > 8 → **red** |
| `[17:15,17:30)` (nearest collection) | 0 | 8 | **1** | fine |

**`fits = false`, `bound_by = "Pizza 9/8"`**, `why` = one batch reason with exactly those two windows.
Every split of 9 over the two windows, (earlier, later):

```
(8,1) → no     ← the engine's split: full batches early, remainder nearest collection
(7,2) → FITS   (6,3) → FITS   (5,4) → FITS   (4,5) → FITS   (3,6) → FITS   (2,7) → FITS   (1,8) → FITS
```

**Dominic is right on the arithmetic: seven of the eight splits fit, including his 1 + 8.** The engine
refuses because it tries only the one it always tries.

### State 2 — stored 8 @18:15, 8 @18:30, 8 @19:00, 8 @19:15

| Order | Windows | Rolling load | Verdict | Any split? |
|---|---|---|---|---|
| 9 @18:45 | `[18:15,18:30)` 8 / `[18:30,18:45)` 0 | free 0 / 8 | refused, `Pizza 16/8` | **none of the eight** |
| 9 @19:30 | `[19:00,19:15)` 8 / `[19:15,19:30)` 0 | free 0 / 8 | refused, `Pizza 16/8` | **none of the eight** |

Confirmed: with the earlier window completely full, no split of 9 across two windows fits, whatever the
rule — 9 needs two windows and one of them has no room. Dominic's acceptance of these refusals stands.

## 1.2 The rule, in both places, and everything that stands on it

**`fitOrderBackward`** (the picker):
```ts
for (let i = 0; i < nw; i++) {
  // The order COOKS in the windows ENDING at the collection slot T: latest/adjacent window
  // [T−prep, T) keyed T−prep (i=0), stepping back … T−nw*prep. Mirrors projectBackwardOccupancy.
  const ws = slotMins - (i + 1) * prep
  const items = i === 0 ? M - batch * (nw - 1) : batch
```
**`projectBackwardOccupancy`** (the display and the existing-load model):
```ts
// Seat batches backward on the PREP grid (UNCHANGED): earliest windows full (batch), the
// window ADJACENT to collection holds the remainder N − batch*(numWindows-1) ∈ [1, batch].
for (let i = 0; i < numWindows; i++) {
  const startMins = deadline - (numWindows - i) * prepMins
  const isAdjacent = i === numWindows - 1
  const items = isAdjacent ? N - batch * (numWindows - 1) : batch
```
Both say the same thing: **`ceil(N/batch)` windows ending at T; every window but the last is a full batch;
the window adjacent to collection holds the remainder.** The split depends on N and T alone — never on
what else is cooking.

**§31's rationale**, quoted:
> *"An order's items spread BACKWARD across cooking windows from its collection time, at batch cadence …
> 3 pizzas, batch 2, prep 5, collected at 17:05: Window ending 17:05 holds the remainder (1 pizza); window
> ending 17:00 holds a full batch (2 pizzas) … The food for all 3 is ready by the 17:05 collection time.
> The 2 cooked "early" (by 17:00) wait; the engine just ensures throughput."*
> *"The backward cooking-spread is a DISPLAY/ENGINE concern computed at READ time from this storage — it is
> NOT stored. Storage holds 'this order, N items, at collection_time T.'"*
> *"TRAFFIC-LIGHT DOTS: read the engine's occupancy, do NOT re-derive … so dots, ASAP, capacity veto, and
> availability all AGREE."*

The manual justifies it as *throughput* and as the one shape everything can re-derive identically from a
stored total. It does not discuss room-aware splitting at all.

**Everything that depends on this rule** (each reads the windows this split produces):

| Behaviour | How it depends |
|---|---|
| `back.byStart` / `back.intervals` | are literally these windows — every reader below reads them |
| **`pileByStart`** (the event-start pile) | sums `byStart` windows with `startMins < eventStartMins`; which load lands pre-open is decided by the split |
| **`loadRunsOffFront`** | judges `slotMins − ceil((existing+M)/batch)·prep` against `eventStart − prep`: the *count* of windows is the rule's `ceil(N/batch)` |
| **the pre-open run-up** | one window before open is allowed; whether a slot's spread reaches into a second is the rule |
| **`windowScopedPeak`** (kitchen ceiling) | the sweep-line's instants come from these intervals' start minutes |
| **the dots** (`buildSlotIndicators`, `buildSlotAvailability` no-basket) | `byStart.get(slot − step)` / `coverDotWindows` — the window a dot reads holds whatever the split put there |
| **`detectCapacityBreaches`** | reads `remainingByCat` per window; a breach is a window the split overfilled |
| **`rebuildProductionSlotUsage`** | writes slot **totals** only — it relies on the split being reconstructible from a total at read time |
| **`excludeOrderKey`** | the submit path re-seeds occupancy without the placing order, then re-splits the rest — assumes the split of the others does not depend on this order |
| **the offline path** | the panel's cached `offlineCapacity` is per-slot totals; the device re-projects with the same rule, so offline dots match the server's |

Its one great property, which every row above leans on: **the split is a pure function of (N, T)**. Two
readers with the same totals get the same windows; storing an accepted order and re-reading it cannot
produce a different picture. That is what makes DISPLAY == PICKER hold today by construction.

## 1.3 Why the projection matters — the fixture

Suppose `fitOrderBackward` had accepted 9 @17:30 as Dominic's **1 + 8**. Storage keeps only
`17:30 → 9`. On the next read, `projectBackwardOccupancy` re-spreads that 9 by *its* rule — **8 + 1**:

```
[16:45,17:00) pizza 8        ← stored 17:00
[17:00,17:15) pizza 1        ← stored 17:15
[17:00,17:15) pizza 8        ← the stored 9's full batch, into the window that already had 1
[17:15,17:30) pizza 1        ← the stored 9's remainder
```
| Window | Tone | Label |
|---|---|---|
| 16:45→17:00 | red | `Pizza 8/8` |
| **17:00→17:15** | **red** | **`Pizza 9/8`, remaining −1** |
| 17:15→17:30 | amber | `Pizza 1/8` |

Dots: **17:15 🔴 "9 Pizzas"**, 17:30 🟡 "1 Pizza". `detectCapacityBreaches` → **`17:15 · Pizza 9/8 · over 1`**
— **a breach shown against an order the picker accepted**. The operator would see a red overflow they were
never warned about, and the breach banner would blame a window that, in the arrangement the picker had in
mind, was never over. And a subsequent 1 pizza @17:30 then *fits* (green): the picker checks only the new
order's own windows, so the overflow it created is invisible to it. This is the concrete meaning of "the
projection is the authority": whatever the picker imagines, the stored total is re-split by the projection,
and the projection's split is what everyone sees.

## 1.4 Options

Two readings of "then earlier batches" turned out to matter enormously, so B and C each come in two
variants:
- **bounded** — the order may use only its `ceil(N/batch)` windows (the same span as today); only the
  *split* between them becomes room-aware;
- **unbounded** — after the nearest window, keep stepping back past *full* windows until the items are
  seated (so 9 @18:45 in State 2 seats 8 in `[18:30,18:45)` and 1 in `[17:45,18:00)`).

Dominic's intuition is the bounded one: he accepts State 2's refusals, which the unbounded reading would
overturn by cooking one pizza 45 minutes early.

| | **A** keep the rule, document it | **B (bounded)** room-aware split, same windows, both fit and projection | **B (unbounded)** | **C (bounded)** fit = re-project the whole event | **C (unbounded)** |
|---|---|---|---|---|---|
| Dominic 9 @17:30 | refused | **accepted as 1 + 8** | accepted | accepted | accepted |
| Dominic 9 @18:45 / 19:30 | refused | refused | **accepted** (1 pizza cooks 45 min early) | refused | accepted |
| **DISPLAY == PICKER** | **exact, by construction** — split is f(N, T) | holds only if the projection re-seats stored slots in the *same order* the fit assumed; it does not (see below) | same weakness, larger | **exact by definition** — the fit *is* the projection | exact by definition |
| **Accepted order later shown as overflowing?** | **No.** A later order's fit checks its own windows against existing load; windows it does not touch are unchanged | **Yes.** Seating is order-dependent: storing a new slot re-seats every *later* slot after it, so an already-accepted later order can land in a different window and overflow. Fixture: the C counterexample below is the same mechanism | yes, more often | C's *refusal* prevents it — but the same fixture shows stored state that C already considers overflowing | as C |
| Determinism | total | deterministic given a seating order (ascending time); a different order gives a different picture | same | same | same |
| 5-minute grids + rolling | unchanged | the window set is still the rolling one; only shares move. Half-open overlap unchanged | look-back can reach many windows on a 5-grid | whole-event re-seat on every fit | same |
| Multiple categories | independent per category, as today | independent per category | same | shared kc couples them in the re-seat | same |
| Kitchen ceiling | `windowScopedPeak` over the split's intervals | room = min(batch − load, kc − load) per window; the sweep-line then re-checks | same | checked by the re-seat | same |
| Pre-open pile / `loadRunsOffFront` | unchanged | the lead check counts `ceil((existing+M)/batch)` windows regardless of split — unchanged; the pile sums whatever lands pre-open | look-back can push more into pre-open windows | re-seat decides what lands pre-open | same |
| Performance | O(N windows) per fit | O(windows) per fit, same order | O(look-back) per fit | **O(all slots × windows) per fit**: on a 5-minute, 3-category board that is the 37 ms shape from the render-fix report, per *slot* in the list | same |
| Food waiting | today: full batches early, remainder last — 9 @17:30 = 120 item·min | **−15.5 %** over the Gusto sweep (149,285 vs 176,740 item·min); 9 @17:30 = 15 item·min | as bounded for fitting orders, but *adds* far-early cooking for the newly accepted ones (45 min for State 2) | as B-bounded | as B-unbounded |

**(D) — a cheaper, safer variant, found while modelling.** Keep the projection exactly as it is (so storage,
dots, pile, breaches, offline and `excludeOrderKey` are untouched and DISPLAY stays f(N, T)), and change
only the **picker's** decision from "does *my* split fit?" to "does *any* bounded split fit?" — i.e. accept
iff there exists (k, N−k, …) with every window's rolling load + share ≤ batch (and ≤ kc). It accepts
Dominic's 1 + 8. **But it reintroduces 1.3 exactly:** the stored 9 is still re-spread 8 + 1 and displays as
9/8 red with a breach. So D is *worse* than A on the property that matters, and I do not recommend it; it
is listed because it is the change people reach for first.

## 1.5 Gusto impact — committed fixtures only

Gusto: Pizza prep 5 / batch 2, kc 2, 5-minute grid; drinks have `secs 0, batch 0, countsToCapacity false`
and never occupy a window. Sweep: the 300 committed Gusto-shaped states × every grid time × order sizes 1–8
= **60,000 verdicts**, today's real engine vs each modelled option.

| Option | Verdicts changed | refused-today → accepted | **accepted-today → REFUSED** | Shaped states displaying differently | Golden fixtures that would change |
|---|---|---|---|---|---|
| A | 0 | 0 | 0 | 0 | none |
| B bounded | **1,730 (2.9 %)** | 1,730 | **0** | **300 / 300** | all 300 `gustoShaped`, the live 24 July event, and the §31 3-pizza examples (their spread flips 2+1 → 1+2) |
| B unbounded | 35,056 (58.4 %) | 35,056 | 0 | 300 / 300 | as above |
| C bounded | 7,031 (11.7 %) | 6,613 | **418** | 300 / 300 | as above |
| C unbounded | 30,390 (50.7 %) | 29,946 | **444** | 300 / 300 | as above |

**Direction:** B never refuses anything Gusto accepts today. **C does** — 418 / 444 times — because it
judges the *whole event*, and stored states exist that its projection already cannot seat within bounds.
Fixture (`gustoShaped #0`, kc 2): stored `18:35 → 4` and `18:40 → 5`; today **1 pizza @18:40 is accepted**
(its window `[18:35,18:40)` holds the 18:40 slot's remainder 1, so 1 + 1 = 2 fits). Under C-bounded the two
stored slots together need windows that do not exist within bounds, so the event is already "overflowing"
before the order arrives, and adding it is refused.

**Does kc 2 = batch 2 make B a no-op for Gusto?** **No.** Re-running the B-bounded sweep with kc removed
changes exactly the same 1,730 verdicts. Drinks never count, so kc is only ever compared to pizza load,
which the batch of 2 already caps identically; the ceiling adds no constraint the batch does not. The 2.9 %
comes from partial windows — a window holding 1 pizza: today puts a full batch of 2 there and refuses, B
puts 1 there and fits. Counterexample: `gustoShaped #0`, 1 pizza @17:35, rolling load `[17:25,17:30) 2`,
`[17:30,17:35) 1` → today refuses (its 1 lands nearest, fine; but sizes ≥ 3 need the full window) — the
first changed verdict the sweep finds.

**Stored Gusto state that would display differently** — the real **24 July 2026** event (5 @17:20, 2 @18:00,
3 @18:30, 1 @18:55, 2 @19:00):

```
today       17:05=2  17:10=2  17:15=1   17:55=2   18:20=2  18:25=1   18:50=1  18:55=2
B-bounded   17:05=1  17:10=2  17:15=2   17:55=2   18:20=1  18:25=2   18:50=1  18:55=2
```
Same totals, remainder moved from the earliest window to the nearest — every dot still 🔴 or 🟡 in the same
places, but the *counts* on 17:05/17:15 and 18:20/18:25 swap. The other five live events hold no
multi-batch load and are unchanged.

## 1.6 Customer impact

| | A | B bounded | B unbounded | C |
|---|---|---|---|---|
| Times offered (`unfittableSlots`) | unchanged | **more** times offered — every verdict in the 2.9 % (Gusto) that flips is a slot that becomes selectable | many more, including ones that mean far-early cooking | more offered, **and some currently offered withdrawn** (the 418) |
| ASAP (`earliestBackwardFitSlot`) | unchanged | can move **earlier** | earlier still | can move either way |
| Placement (`placeOrderInSlotLocked`) | unchanged | books earlier where the fit changed | same | same, plus refusals today accepts |
| Displayed dots on the order page | unchanged | counts move between adjacent windows (24 July shape) | same | same |

Every option other than A changes what a member of the public is offered. B-bounded only ever *widens* it.

## 1.7 Recommendation, and the decisions

**Recommendation: B-bounded — but only as a single canonical rule applied to *both* `fitOrderBackward` and
`projectBackwardOccupancy` (and `coverDotWindows`, the pile, breaches, `excludeOrderKey` and the offline
re-projection with them), with a defined seating order for stored slots, behind the golden with a new
baseline.** It accepts exactly the arrangements a cook would use (Dominic's 1 + 8), it never refuses
anything Gusto accepts today, it cuts food-waiting time by 15 %, and it keeps the window *span* — so the
rolling, lead and pile logic keep their meaning. Its one real cost is 1.4's second row: with room-aware
seating, **the picture depends on seating order**, so an already-accepted later order can be re-seated
after a new one lands. That must be designed, not discovered — either seat in *arrival* order (needs the
order id in the projection, which storage does not have today) or accept ascending-time seating and prove
over the sweep that a bounded re-seat can only move load *within* a slot's own windows (it can, which is
why the 418 appears only under C's whole-event judgement, never under B).

Do **not** take D (picker-only): it is the 1.3 fixture made permanent. Do **not** take unbounded B or C:
"accept it, and cook a pizza 45 minutes early" is a decision about food quality no engine should make
silently. Do **not** take C: it refuses live orders Gusto accepts today and costs a whole-event re-seat per
slot in the list.

**Decisions Dominic must make, in plain English:**
1. **Is a split allowed to fill the nearest batch first?** Yes ⇒ B; no ⇒ A. (This is the whole question.)
2. **May an order ever cook more than `ceil(N/batch)` windows before its collection time?** I say no
   (bounded). If yes, say how early is too early, in minutes — that number becomes a rule.
3. **When two orders share a window, which one moves if a third arrives?** Ascending collection time, or
   arrival order? Ascending is what storage can support today; arrival order needs the order key in
   `production_slot_usage`, which is a schema change.
4. **Is it acceptable that Gusto's dots on a busy evening show different *counts* in adjacent windows than
   today** (24 July shape), with the same colours? This is visible to Gusto on the day of the change.
5. **A new golden.** B changes every multi-batch fixture, so the committed baseline must be regenerated
   from B *after* it is proven, and the §31 worked examples rewritten (3 pizzas at 17:05 becomes 17:00 = 1,
   17:05 = 2). Approve that rewrite in the same decision, or A stays.

---

# PART 2 — THE LABEL FIX

**Change, by symbol:** the time `<option>` in `AddOrderPanel` — the separator before *Order won't fit* is
now `" – "` (spaced en dash) when nothing but the dot precedes it, and stays `" · "` after a
`{n} {Category}` count label:

```tsx
{ind.label ? ` ${ind.label}` : ''}{wontFit ? (ind.label ? ' · Order won’t fit' : ' – Order won’t fit') : ''}
```
Rendered, from the real component: `18:45 🟢 – Order won’t fit` and `18:30 🔴 8 Pizzas · Order won’t fit`.
Nothing else changed.

**`scripts/add-order-render.cjs` (extended)**
- **Failure mode:** a bullet with nothing on its left — `🟢 · Order won't fit` — or the en dash leaking
  after a count label.
- **Broken variant, run first:** the old `" · "` restored after a bare dot on the rendered 18:45 option →
  **✓ FAILED as required** (`"18:45 🟢 · Order won’t fit"`).
- **Real result — `✅` 38 checks, 0 🔴:** bare dot → en dash; count label → middle dot; no `" · "` ever
  follows a bare dot; no `" – "` ever follows a count label; all seven render cases and the earlier
  assertions unchanged.

**`scripts/add-order-fit-message.cjs`** — its source assertion now requires both forms; passes.

**Verification:** `npx tsc --noEmit` rc 0 · `npx next build` rc 0 (`✓ Compiled successfully`) · **all 32
harnesses rc 0** (`add-order-*`, `customer-path-identity`, `batch-*`, `slot-interval-*`, `printing-*`,
`outreach-*`, `whatsapp-*`) · **`batch-rolling-identity.cjs` passes against the committed golden, not
regenerated** (sha unchanged) · eslint on `AddOrderPanel.tsx` vs a clean HEAD worktree, per rule:
`no-explicit-any` 3 → 3 · `no-unused-vars` 4 → 4 · `exhaustive-deps` 7 → 1 · `set-state-in-effect` 5 → 5 ·
`no-unescaped-entities` 2 → 2 — no regression.

## Manual sections that are stale (NOT edited)

- **§31 "Backward cooking-spread"** presents the remainder-nearest split as *the* model and never states
  that it is one of several feasible arrangements, nor that the picker tries only that one. Whatever
  decision 1 above produces, the section should say so explicitly; if B is chosen, its 3-pizza worked
  example and the dots example (`17:00 = 2, 17:05 = 1`) both invert.
- **§31 "DISPLAY == PICKER"** attributes the guarantee to shared reading of `byStart`; the real load-bearing
  fact — the split is a pure function of (N, T) — is nowhere stated, and it is the property B must
  re-establish by other means.
- The pile-up section's "seating/intervals/picker UNTOUCHED" paragraphs would need re-verification under B.

## Anything I could not establish

- **Options B and C were modelled, not built**: single-category scratchpad models validated on Dominic's
  two states and Gusto's shape. Multi-category interaction with a shared kitchen ceiling under a re-seat is
  reasoned in 1.4, not measured. The Gusto numbers are for pizza only, which is all that cooks there.
- **The right seating order for B** (decision 3) is a design choice; the sweep shows ascending-time seating
  never *refuses* what today accepts, but I did not enumerate every "later order re-seated" display change
  it can cause on Gusto's live shape.
- **Real Gusto history**: `production_slot_usage` holds totals, so whether a customer was ever *refused* a
  time B would have offered cannot be recovered from stored data.
- **Food-waiting figures** are item·minutes to collection, computed from window ends; real waiting also
  depends on how the cook actually sequences within a batch, which no model here sees.
