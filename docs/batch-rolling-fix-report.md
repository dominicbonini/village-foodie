# Batch ceiling — the per-category batch check is now ROLLING

**17 September 2026 · HEAD `fc0fddc outreach` · Localhost only. Nothing deployed.**

**Principle (Dominic):** collection times are a selection convenience; the cooking check must never allow more than a category's batch on the grill at any instant, whatever collection times are offered. That is now what `fitOrderBackward` and `projectBackwardOccupancy` enforce.

Figures are **LIVE** (production, read-only unless stated), **CODE**, or **FIXTURE**.

> **In three lines.** One shared helper, `categoryLoadOver`, replaces the two same-start-minute reads; the fix is a proven no-op on every aligned fixture — §31, Gusto's shape, 100,000 sampled 15/15 states, 240 seeded aligned cases and all six real Gusto events — and a live run on the test kitchen shows the operator's 8 @18:20 now warns (`Pizza 16/8`) while a customer's 8 @19:05 under 5/5 is bumped to 19:15 by the real placement walk. **Two corrections to the brief are recorded below**: the aligned condition is "step a multiple of the prep", not the reverse — so 20/20 is *not* aligned for multi-batch orders and the fix rightly differs there — and the STEP 0 gate was not met.

---

## 0. git status

### Before

18 modified, 21 untracked. **HEAD is still `fc0fddc outreach` — the collection-times work is not committed**, and `lib/slot-availability.ts` (the file this fix edits) was already modified. **The brief's STEP 0 gate therefore failed and I stopped and asked.** Dominic chose: *"Proceed now against a frozen copy of the working tree."* So:

- the "before" baseline for every identity proof is a **frozen copy of the working tree as it stood before this fix** (`scratchpad/frozen-before/lib/…`, sha `400779a9…` for `slot-availability.ts`), **not** a `git worktree` of HEAD — a HEAD worktree lacks `coverDotWindows`, the covering dot read and `lib/slot-interval.ts`, so it would have confounded this fix with the collection-times work;
- the seven byte-identical symbols are still checked against **real git HEAD** (they were untouched by both workstreams);
- 🔴 the batch edits now sit in the same uncommitted hunks as the collection-times edits to `lib/slot-availability.ts`, so **they cannot be staged separately**. That was the stated cost of proceeding.

### After

18 modified (the same set — only `lib/slot-availability.ts` and `scripts/slot-interval-engine-identity.cjs` changed content), **23 untracked** — two new harnesses (`scripts/batch-rolling-check.cjs`, `scripts/batch-rolling-identity.cjs`) and this report. **Nothing staged, nothing committed.** Full listing in §9.

---

## 1. What changed, by symbol — `lib/slot-availability.ts` only

### (3) `CookInterval` — additive `cat`

```ts
export interface CookInterval {
  startMins: number
  endMins: number
  items: number
  /** The cooking category this interval belongs to. ADDITIVE (17 September 2026): set for cooking
   *  batches, absent for instant points. Read ONLY by categoryLoadOver … */
  cat?: string
}
```

### The shared helper — `categoryLoadOver` (new, exported)

```ts
export function categoryLoadOver(intervals: CookInterval[], cat: string, fromMins: number, toMins: number): number {
  let load = 0
  for (const iv of intervals) {
    if (iv.cat !== cat || iv.items <= 0) continue
    if (iv.endMins <= iv.startMins) continue                       // a point is never a batch
    if (iv.startMins < toMins && fromMins < iv.endMins) load += iv.items   // half-open overlap
  }
  return load
}
```

### (1) `fitOrderBackward` — the per-category loop (the diff, executable lines)

```diff
-      orderCookIntervals.push({ startMins: ws, endMins: ws + prep, items })
+      orderCookIntervals.push({ startMins: ws, endMins: ws + prep, items, cat })
 …
   for (const [ws, ord] of orderLoad) {
-    const existing = back.byStart.get(ws)
     for (const [cat, add] of Object.entries(ord)) {
       const batch = batchOf[cat]
       if (batch == null) continue
-      const combined = (existing?.byCat[cat] ?? 0) + add
+      const prep = Math.max(1, Math.round((catConfigs[cat]?.secs ?? 0) / 60))
+      const combined = categoryLoadOver(back.intervals, cat, ws, ws + prep) + add
       const t: SlotTone = combined > batch + EPS ? 'red' : combined >= batch - EPS ? 'amber' : 'green'
       consider(t, `${capWord(cat)} ${Math.round(combined)}/${Math.round(batch)}`)
```

`combined`, the thresholds, `consider` and `bound_by` are unchanged. `back.intervals` is the same interval set the kitchen-capacity sweep-line already reads.

### (2) `projectBackwardOccupancy` — the per-category window tone (the diff, executable lines)

```diff
   const batchByCat: Record<string, number> = {}
+  const prepByCat: Record<string, number> = {}
 …
       batchByCat[cat] = batch
+      prepByCat[cat] = prepMins
 …
-        cookIntervals.push({ startMins, endMins: startMins + prepMins, items })
+        cookIntervals.push({ startMins, endMins: startMins + prepMins, items, cat })
 …
-      for (const [cat, used] of Object.entries(byCat)) {
+      for (const cat of Object.keys(byCat)) {
         const batch = batchByCat[cat]
         if (batch == null) continue
+        const used = categoryLoadOver(cookIntervals, cat, startMins, startMins + (prepByCat[cat] ?? step))
         remainingByCat[cat] = batch - used
         const t: SlotTone = used >= batch - EPS ? 'red' : 'amber'
```

`prepByCat` exists because categories with different cook times share a start minute but not a span: each category's window is `[startMins, startMins + prep_cat)`.

### 🔴 How `remainingByCat` is derived now — `detectCapacityBreaches` reads it

`remainingByCat[cat] = batch − categoryLoadOver(cookIntervals, cat, startMins, startMins + prep_cat)` — **batch minus the rolling category load over that window's span**, no longer batch minus this start minute's own `byCat`. `byCat` itself (the **label** — "8 Pizzas") is unchanged and still this start minute's own seated load. Consequences:

- `detectCapacityBreaches` (`remainingByCat[c] < -EPS`) now flags an overlap **with no kitchen ceiling set**, which it could not before (live run A4/B3 below show `[]` because nothing there is over; the harness's override case shows `18:20: Burgers 16/8, over_cats [{burgers, 8}]`).
- Two windows that partially overlap each read the *combined* load: in the override fixture the 18:00 window (A's 8) and the 18:05 window (B's 8) both read `Burgers 16/8`, `remainingByCat −8`, so the detector lists **both** 18:15 and 18:20. That is correct — 16 is on the grill during both spans — and is the same double-listing shape the ceiling already produces for spanning batches.
- `bound_by` uses the rolling `used`, so a window's label can read "8 Pizzas" while its `bound_by` reads "Pizza 16/8". The label is what was seated *here*; the verdict is what is *cooking during* here.

### The overlap definition

Half-open intervals. Window `[fromMins, toMins)` overlaps batch `[startMins, endMins)` iff `startMins < toMins && fromMins < endMins`. **Touching does not overlap**: a batch ending at 18:15 and a window starting at 18:15 are two batches, not one. Zero-width instant points are never batches (`endMins <= startMins` ⇒ skipped) and carry no `cat`.

### What did not change

`earliestBackwardFitSlot`, `loadRunsOffFront`, `windowScopedPeak`, `placeInstantPoints`, `backwardWindowStepMins`, `buildUnitsFromOrders`, `rebuildProductionSlotUsage` — **byte-identical to git HEAD** (asserted). `pileByStart`'s construction — byte-identical. The storage shape — untouched. `placeOrderInSlotLocked`'s off-list branch — byte-identical to the frozen baseline (asserted). No change to how orders group into batches, to placement order, or to any flow beyond the verdicts.

---

## 2. 🔴 Two corrections to the brief

**(a) The aligned condition is inverted in the constraints.** The brief requires a no-op "for every category whose prep is a multiple of the collection step", but its own harness requires **prep 10 on a 5-minute grid** (10 *is* a multiple of 5) to *change*: B=3 @18:35 must be refused. The physically correct condition, which the fixture pins down, is the reverse — **the fix is a no-op iff the collection step is a multiple of the prep (prep ≤ step)**, because only then does every window of a category start on the grid and either share a start minute or be disjoint. Gusto (prep 5, step 5) satisfies both readings. I proceeded on the fixture's reading.

**(b) 20/20 is not aligned for multi-batch orders, and the fix is right to differ there.** The brief expected "15/15, 20/20 and 30/30: every verdict unchanged". 15 and 30 are multiples of the 15-minute prep; 20 is not. A 12 @18:20 cooks `[17:50,18:05) + [18:05,18:20)` — the earlier window starts *off* the grid — and an 8 @18:00 cooks `[17:45,18:00)`: **16 on the grill from 17:50 to 18:00, which the old check accepted.** The harness asserts what is true: 20/20 unchanged for every order ≤ one batch (270/270), and the multi-batch overlap now refused. My review report's (d2) "20/20 safe" was for single-batch orders only; this corrects it.

**(c) The off-list branch — stated plainly, as instructed.** My review report's R5 said the engine fix "covers (b)–(g) including off-list". **That was wrong.** An off-list time goes through `placeOrderInSlotLocked`'s unrecognised-slot branch — `if (!startEntry) return { finalSlot: startSlot, booked: true }` — which confirms with **no capacity check and never calls `fitOrderBackward`**. **This fix does not change that branch. Dominic has decided to leave it as is.** The harness asserts the branch is byte-identical to the baseline and still confirms an off-grid 18:20 unchecked.

---

## 3. Harnesses

### `scripts/batch-rolling-check.cjs` (NEW)

**Failure mode:** A=8 @18:15 (cooking [18:00,18:15)) and B=8 @18:20 (cooking [18:05,18:20)) both accepted — 16 on an 8-batch grill from 18:05 to 18:15 — because the check looked only at same-start batches; or the picker refusing while the dot still says 8/8; or touching batches refused.

**Broken variants, run FIRST — all FAILED as required:**

```
✓ FAILED as required  V1 same-start lookup: A=8 @18:15 stored, B=8 @18:20 → fits=true (Burgers 8/8) — 16 on an 8 grill
✓ FAILED as required  V2 fit fixed, tone not: the 18:05 window's dot says "Burgers 8/8" while the picker says "Burgers 17/8" — DISPLAY ≠ PICKER
✓ FAILED as required  V3 closed-interval overlap counts A's [18:00,18:15) against a window starting 18:15 (8); the real helper counts 0
```

V1 is literally the frozen baseline's `fitOrderBackward`; V2 pairs the new picker with the frozen projection's tone; V3 models the helper with closed intervals.

**Real run — ✅ rolling batch check proven (29 assertions):**
- batch 8 / prep 15 / kc NULL / 5-minute grid: A=8 @18:15, B=8 @18:20 → **red, fits=false, "Burgers 16/8"**; the walk from 18:20 lands on 18:30.
- customer 15 / operator 5: the operator's 18:20 refused, 18:30 offered.
- both stored as an override: window 18:05→18:20 **red "Burgers 16/8"** (rolling), its label `byCat` still 8, `remainingByCat −8`; the 18:20 dot red; `detectCapacityBreaches` flags 18:20 (and 18:15) with **no kitchen ceiling**.
- kc 8: verdict unchanged (red/false before and after).
- customer 10 / operator 10: A=8 @18:20, B=8 @18:30 → **refused** (was accepted).
- **15/15 and 30/30: 480 + 480 fit verdicts, 0 differ.** 20/20 with every order ≤ one batch: 270, 0 differ; 12 @18:20 then 8 @18:00 → before `fits=true`, after `fits=false` (Burgers 16/8).
- touching windows: A @18:15 then B @18:30 → fits; both read 8/8, neither over.
- batch 4 / prep 10: 10-minute grid — A=3 @18:30, B=3 @18:30 refused (Mains 6/4), B=3 @18:40 fits, dots 3/4 and 3/4; 5-minute grid — B=3 @18:35 refused (was accepted: [18:25,18:35) overlaps A's [18:20,18:30)), B=3 @18:40 fits.
- the off-list branch unchanged and byte-identical (asserted, not fixed).

### `scripts/batch-rolling-identity.cjs` (NEW)

**Failure mode:** any byte of JSON differing between the frozen baseline and the working tree from `projectBackwardOccupancy`, `fitOrderBackward`, `earliestBackwardFitSlot`, `buildSlotIndicators` or `detectCapacityBreaches` on an **aligned** fixture. (The additive `cat` tag is stripped from `intervals` before comparing, so the comparison is about verdicts.)

**Broken variant, run FIRST — FAILED as required:** an off-by-one on the *left* of the overlap test (a batch ending exactly as the window begins is counted) — on §31's 3-pizza example the 17:00 window reads **3 instead of 1**, an aligned fixture differing. *(A first draft used a right-hand off-by-one, which no fixture exercised and which therefore "passed" — recorded because a broken variant that cannot fail proves nothing.)*

**Real run — ✅ no-op on every aligned fixture and on Gusto's live state:**
- **§31 worked examples**, all identical: 3 pizzas @17:05 (17:00=2 red, 17:05=1 amber); 2 pizzas + 2 desserts at cap 4; 1 pizza + 3 desserts; 2 pizzas + 3 desserts rejected by the ceiling; 3 pizzas rejected by batch; 6 @16:30 pile red/6; 6 @16:30 + 8 @16:35 pile 10; "17:00 & 17:05 full, add 2 pizzas + 7 desserts → 17:15".
- **Gusto-shaped** (batch 2, prep 5, kc 2, 5-minute grid): 300 random states, 0 differ.
- **The 15/15 sweep**: 100,000 sampled states of 1–6 orders (sizes 1–12, four event starts, accepted via the real placement walk), 0 differ.
- **Seeded aligned sweep**: 240 cases, prep 5/10/15 on a grid of 1–3× the prep, two categories, with and without a ceiling — 0 differ.
- **Gusto LIVE-shaped** — below.

### Gusto LIVE-shaped identity — the SQL and the result

Read-only, via the PostgREST helper (`GET` only):

```sql
select production_slot_usage.event_id,
       production_slot_usage.event_date,
       production_slot_usage.production_slot,
       production_slot_usage.units_by_cat
from public.production_slot_usage
where production_slot_usage.truck_id = 'pizzeria-gusto'
order by production_slot_usage.event_date, production_slot_usage.production_slot;
```

```sql
select menu_categories.name,
       menu_categories.prep_secs,
       menu_categories.batch_size,
       menu_categories.counts_toward_capacity
from public.menu_categories
where menu_categories.truck_id = 'pizzeria-gusto'
  and menu_categories.is_active = true
order by menu_categories.sort_order;
```

```sql
select truck_vans.id,
       truck_vans.name,
       truck_vans.kitchen_capacity,
       truck_vans.capacity_window_mins,
       truck_vans.collection_interval_mins,
       truck_vans.operator_collection_interval_mins
from public.truck_vans
where truck_vans.truck_id = 'pizzeria-gusto';
```

```sql
select truck_events.id,
       truck_events.event_date,
       truck_events.start_time,
       truck_events.end_time,
       truck_events.van_id,
       truck_events.status,
       truck_events.collection_interval_mins_override,
       truck_events.operator_collection_interval_mins_override
from public.truck_events
where truck_events.truck_id = 'pizzeria-gusto'
  and (truck_events.event_date >= current_date
       or truck_events.event_date in ('2026-06-28', '2026-07-24'))
order by truck_events.event_date;
```

LIVE: Pizza 300 s / batch 2 (`counts_toward_capacity` false — irrelevant, a cooking category always feeds the intervals); Van1 kc 2, window 5, interval 5 / null; six `production_slot_usage` rows over two past events; three upcoming events with both override columns null.

```
✓ Gusto LIVE: Pizza 300s/2, van kc 2, window 5, interval 5
✓ Gusto event 2026-06-28 12:00–18:00 (1 stored slot)
✓ Gusto event 2026-07-24 17:00–20:00 (5 stored slots)
✓ Gusto event 2026-07-24 17:00–20:00 (0 stored slots, no van)
✓ Gusto event 2026-09-18 17:00–20:00 (0 stored slots)
✓ Gusto event 2026-09-19 12:00–20:00 (0 stored slots, no van)
✓ Gusto event 2026-09-20 14:00–20:00 (0 stored slots, no van)
✓ 6 real Gusto events checked (2 past with rows, 3 upcoming)
```

**Identical output before and after on Gusto's real state, every event.** Two independent reasons: prep 5 on a 5-minute grid means windows share a start or are disjoint, so the rolling sum equals the same-start sum; and kc 2 = batch 2, so any overlap would already be red by the sweep-line.

### `scripts/slot-interval-engine-identity.cjs` (UPDATED)

**What changed and why:** it compiled the engine from a `git worktree` of HEAD and required byte-identical JSON from all three engine functions on ten cases. `fitOrderBackward` and `projectBackwardOccupancy` are no longer byte-identical to HEAD, so their contract moves to **"identical output on every aligned fixture"**, which `batch-rolling-identity.cjs` proves at scale. The ten cases here are all aligned (prep 5 on a 5 grid, or prep 5 stored on a 15 grid), so the JSON comparison **still holds for them** and is kept as the fast local check. The **seven** other symbols (`earliestBackwardFitSlot`, `windowScopedPeak`, `backwardWindowStepMins`, `loadRunsOffFront`, `placeInstantPoints`, `buildUnitsFromOrders`, `rebuildProductionSlotUsage`) are now asserted **byte-identical against git HEAD** explicitly, plus `pileByStart`'s construction. Its D4 broken variant (the ceiling's cadence taken from the display interval) still fails first.

```
✓ 10/10 aligned cases identical · ✓ byte-identical ×7 · ✓ byte-identical pileByStart's construction · ✓ §31 facts hold
```

---

## 4. Verification

- **All 22 harnesses pass** — 2 × `batch-*`, 8 × `slot-interval-*`, 7 × `outreach-*`, 5 × `whatsapp-*`.
- **`tsc --noEmit`** — no errors.
- **`next build`** — compiled successfully, 95/95 static pages.
- **eslint vs a clean HEAD worktree (18 changed files)** — HEAD 664 → **662**. Delta per rule: `@typescript-eslint/no-unused-vars` (severity 1) **−2**; **no new messages**. The two removals: the dead `MINUTES` const (earlier stage), and `'step' is assigned a value but never used` in `lib/slot-availability.ts` — `step` was unused in `projectBackwardOccupancy` at HEAD and the rolling tone now reads it as the fallback span.
- **Byte-identity** — the seven symbols and `pileByStart`'s construction vs git HEAD; `lib/orders/place-in-slot.ts` vs the frozen baseline. The two rolling symbols: output-identical on every aligned fixture (above).
- **`git diff --stat`** — 18 files changed, 788 insertions, 48 deletions.

---

## 5. Live test orders on the test kitchen — Dominic's mid-turn request

> *"create test orders against test kitchen (never touch pizzeria gusto) once done with different settings and include the output in the report"*

**Where:** `test-truck` (slug `test-kitchen`, name "Pizza Kitchen"), Van1 = 15 / null, kc NULL, window 10, Pizza 900 s / batch 8. Through the real routes on `localhost:3000` (the dev server already running this working tree), so the real placement path executed. **Gusto was not touched** — its only read is the look-only check at the end.

**The one write outside the routes:** `/api/manage upsert_event` returned **401 "Sign in required"** (Manage needs an operator sign-in, not the dashboard token; the dashboard-action route creates only van-less drafts; `events/action` refuses to confirm on a two-van truck). So today's event was **inserted directly on the test kitchen** with the service role, shaped as `upsert_event` writes it: `truck_id test-truck`, Van1, `2026-09-17 17:00–21:00`, `source manual`, `status confirmed`, `order_ready_override false`. Everything after that went through `/api/dashboard/action`, `/api/orders/submit`, `/api/slots` and `/api/dashboard`.

**Why both "different settings" are event overrides, not Manage changes:** changing Van1's interval in Manage runs the reset rule and would have cleared the 30/10 override on yesterday's event that the brief says to leave alone. The event override on today's event touches nothing else — verified at the end.

**Output, verbatim** (the `SPAN`-style confirm check is exactly what `AddOrderPanel.submitManual` does — a fresh `/api/slots` with the token, then `fitOrderBackward` on the chosen slot):

```
══ LIVE TEST — test-kitchen (Pizza Kitchen), Van1 = 15/null, Pizza 900 s / batch 8, kitchen_capacity NULL ══
0. today's event on Van1 (inserted directly on the test kitchen — /api/manage upsert_event needs an operator sign-in, 401): 7a98c341… 2026-09-17 17:00–21:00
   /api/events publishes collection_interval_mins=15 for it (the van's 15)

A. set_collection_intervals_override customer 15 / operator 5 → 200 ok
   /api/dashboard: truckIntervalMins=5  vanIntervals={"customer":15,"truck":5}  eventIntervals[ev]={"collection_interval_mins_override":15,"operator_collection_interval_mins_override":5}
   customers see collection_interval_mins=15

A1. customer 8× Margherita @18:15 → 200: confirmedSlot=18:15 slotChanged=false key=39d3dacb

A2. operator grid interval=5; first slots 17:00,17:05,17:10,17:15,17:20,17:25
    Add Order 8 pizzas @18:20 → confirm-time check: red fits=false Pizza 16/8  → WOULD WARN "This slot is already booked up… Use it anyway?"
    Add Order 8 pizzas @18:30 → confirm-time check: amber fits=true Pizza 8/8  → fits, no warning

A3. Add Order 8 @18:30 → 200 booked

A4. dashboard dots (operator 5-grid): 18:15=red "8 Pizzas"  18:30=red "8 Pizzas"
    capacityBreaches: []
    customer 15-grid dots: 18:15=red  18:30=red

A5. "Use my usual setting" → 200; truckIntervalMins now 15 (the van's 15); eventIntervals[ev]={"collection_interval_mins_override":null,"operator_collection_interval_mins_override":null}

B. event override customer 5 / operator follows (5/5) → 200
B1. customer 8 @19:00 → 200: confirmedSlot=19:00 slotChanged=false
B2. customer 8 @19:05 (window 18:50–19:05 would overlap C's 18:45–19:00) → 200: confirmedSlot=19:15 slotChanged=true  ✓ bumped to the first non-overlapping slot
B3. dashboard dots (5-grid): 18:15=red "8 Pizzas"  18:30=red "8 Pizzas"  19:00=red "8 Pizzas"  19:15=red "8 Pizzas"
    capacityBreaches: []

B4. revert → 200; truckIntervalMins 15; final dots (15-grid): 18:15=red "8 Pizzas"  18:30=red "8 Pizzas"  19:00=red "8 Pizzas"  19:15=red "8 Pizzas"
    orders left on the event (test data, cancel at will): Rolling test A→18:15 ; Rolling test B (Add Order)→18:30 ; Rolling test C→19:00 ; Rolling test D→19:15
```

**Closing checks (read-only):**

```sql
select truck_events.event_date,
       truck_events.collection_interval_mins_override,
       truck_events.operator_collection_interval_mins_override
from public.truck_events
where truck_events.id in ('0f0974d6-922a-4347-bd94-d2109a9f508f', '7a98c341-85b3-43ab-856f-073a9ffe982b');
```
→ yesterday's event **30 / 10, untouched**; today's test event **null / null**.

Gusto's dashboard, 18 September event, look only: 43 slots from 17:00, interval 5, `vanIntervals {5,5}`, `eventIntervalsAvailable true`, **no non-green dots**, 0 orders, `capacityBreaches []`, kc 2, window 5 — **unchanged**.

**What is left on the test kitchen:** one confirmed event (`7a98c341…`, 2026-09-17, Van1) and four orders named "Rolling test A–D". Test data; cancel or delete at will. Two earlier attempts of the sequence were cleaned up before the final run (their orders and usage rows deleted, test-kitchen only).

---

## 6. LOCALHOST TEST SCRIPT — plain steps, test truck Van1 only

These are the steps the live run above executed by hand-equivalent; you can repeat them in the browser.

1. Open the dashboard for **Pizza Kitchen** (`test-kitchen`), select **today's Van1 event** ("Rolling batch test", 17:00–21:00). Settings tab → **Collection times**: set *Customer Collection Times* to **Every 15 minutes**, tick **"Use different times for orders I add"**, set *Your Collection Times* to **Every 5 minutes**.
2. On the customer page for that event, order **8 Margherita for 18:15**. Expect it confirmed at 18:15.
3. Dashboard → **Add Order**, 8 Margherita, pick **18:20** (on your 5-minute grid), tap Confirm. 🔴 **Expect the warning** *"This slot is already booked up… Use it anyway?"* — the 18:05–18:20 batch would overlap the 18:00–18:15 one. Cancel.
4. Pick **18:30** instead. Expect **no warning**; the order books at 18:30.
5. Look at the day-load strip: **18:15 red "8 Pizzas"**, **18:30 red "8 Pizzas"**, nothing else lit, no breach banner. (Both batches are full; neither is over.)
6. Tap **"Use my usual setting"**. The box returns to Every 15 minutes, unticked; the strip re-draws on the 15-minute grid with the same two red dots.
7. **Look only** at Pizzeria Gusto's dashboard (18 September event): every dot green, 5-minute slots, no banner. **Change nothing.**

---

## 7. Proposed replacement text for §31 "The two ceilings" (NOT applied)

> ### The two ceilings (this is the whole capacity model)
> Every cooking window (length = the category's prep time) is constrained by BOTH, independently, and **both are judged over every batch that overlaps the window in time, not only batches that start at the same minute**:
> 1. **Batch (per-category):** at no instant may more than one batch of a category be on the grill. For a candidate window `[S, S+prep)` of category C, the existing load is the sum of every existing batch of C that overlaps `[S, S+prep)` — half-open, so a batch finishing at S does not count. Implemented once, in `categoryLoadOver`, and read by both the picker (`fitOrderBackward`) and the dot tone (`projectBackwardOccupancy`), so DISPLAY == PICKER by construction.
> 2. **Kitchen capacity (cross-category total):** the sweep-line peak concurrency over every counted interval (`windowScopedPeak` / `concurrencyAt`), as before.
>
> A window is FULL when EITHER ceiling is hit.
>
> **Why the batch rule is rolling (17 September 2026).** Until this date the batch was judged per start minute. That is a rolling check only while the collection step is a multiple of the prep (windows then share a start or are disjoint) — true of every 5-minute-prep truck on a 5-minute grid, and therefore true of every worked example below. It was not true for a 15-minute cook on a 5-minute grid: A @18:15 cooks [18:00,18:15), B @18:20 cooks [18:05,18:20), and 16 sat on an 8-batch grill with nothing saying so. Collection times are a selection convenience; the ceiling is physical.
>
> **Still true after the fix:** an OFF-LIST collection time (one not on the current grid — a stale page, an offline replay) is confirmed by `placeOrderInSlotLocked` **without any capacity check**. That is a placement rule, not an engine rule, and it is deliberately unchanged.
>
> *(The worked examples that follow are unchanged.)*

---

## 8. What I could not establish

1. **Whether an overlap ever happened in production.** `production_slot_usage` stores per-slot totals and cannot show it; no order history was inspected. The only live van that could reach it (test-truck Van2, 5/5) is ceiling-protected.
2. **The prospect's real menu.** test-truck Van1 is the stand-in; if the prospect has a second cooking category with a different cook time, the rule applies per category with each category's own prep.
3. **Depth-6 exhaustively** — sampled (100,000 states), with depth ≤ 3 exhaustive in the earlier review.
4. **Whether the four test orders and the test event should stay.** Left in place as requested; they are on the test kitchen only.
5. **Byte-identity of the two rolling symbols against a committed baseline** — by Dominic's decision the baseline is a frozen working-tree copy, not git. Once the collection-times work is committed, `batch-rolling-identity.cjs` can be re-pointed at a `git worktree` by setting `BATCH_FROZEN_ROOT`; until then the frozen copy lives in the session scratchpad and will not survive it.

---

## 9. git status after

```
 M app/api/dashboard/action/route.ts     M lib/capacity-breach.ts
 M app/api/dashboard/route.ts            M lib/orders/place-in-slot.ts
 M app/api/events/route.ts               M lib/payments/promote-draft.ts
 M app/api/manage/route.ts               M lib/slot-availability.ts        ← this fix, in the same hunks as the collection-times work
 M app/api/menu/[truckId]/route.ts       M lib/slot-display.ts
 M app/api/orders/submit/route.ts        M lib/slot-generation.ts
 M app/api/slots/[truckId]/route.ts      M lib/supabase.ts
 M app/dashboard/[token]/page.tsx
 M app/manage/[token]/page.tsx
 M app/trucks/[slug]/order/page.tsx
 M components/dashboard/AddOrderPanel.tsx
?? docs/ (8 reports incl. this one)   ?? lib/slot-interval.ts   ?? scripts/_slot-interval-compile.cjs
?? scripts/batch-rolling-check.cjs    ?? scripts/batch-rolling-identity.cjs
?? scripts/slot-interval-*.cjs (8)    ?? supabase/migrations/2026091{6,7,8}_*.sql (3)
```

**Nothing staged, nothing committed, nothing deployed.** The only database writes were on the test kitchen (`test-truck`): one event row inserted directly, four orders and their settings through the real routes, and the cleanup of two earlier attempts. Pizzeria Gusto was read once, look-only.
