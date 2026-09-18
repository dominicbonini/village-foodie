# Dashboard box order, and whether two batches of one category can overlap

**17 September 2026 · HEAD `fc0fddc outreach` · Localhost only. Nothing deployed, no migration applied, nothing written to any database.**

Item 1 moves one box. Item 2 is read-only and finds that **the per-category batch ceiling is not rolling** — a second batch of the same category can be seated overlapping the first whenever the collection grid is finer than the category's prep time, and only the kitchen-capacity sweep-line stands in the way.

Figures are **LIVE** (production, read-only), **CODE** (working tree), or **FIXTURE** (made-up inputs through the real, unmodified engine).

---

## 0. git status

**Before:** 18 modified, 18 untracked — the slot-interval workstream plus five reports. Built on.

**After:** the same 18 modified and 18 untracked, **plus this report**. Item 1 changed the content of two already-modified files (`app/dashboard/[token]/page.tsx`, `scripts/slot-interval-event-override.cjs`); nothing else moved. **Nothing staged, nothing committed.** Full listing in §6.

---

# ITEM 1 — DASHBOARD LAYOUT

## What the dashboard Settings tab shows today, in order

Read from the tab body (`{activeTab==='settings'&&(` onward), card titles as the operator reads them:

| # | Card | Capacity-related? |
|---|---|---|
| 1 | Offline protection (`OFFLINE_PROTECTION_SWITCH_LABEL`) | no |
| 2 | Auto-accept orders | no |
| 3 | Menu layout | no |
| 4 | Take orders without payment · Completing an unpaid order · Do you take cash? (one card) | no |
| 5 | Order-ready step | no |
| 6 | **Collection times** ← where the event-override build put it | **yes** |
| 7 | Remind me to add a buzzer | no |
| 8 | Take card payments online | no |
| 9 | Sounds (New order sound · Sound when an order is due to be cooked) | no |
| 10 | **Kitchen capacity** (with the "Items — this event" ceiling row) | **yes** |
| 11 | Printing, Notifications (native-only; render null on web) | no |

**The dashboard does have a Kitchen capacity box** — its own card, *"Event-scoped ceiling + category scope… mirrors Settings. Reads/writes via service-role /api/dashboard + update_van_settings."* So item 1 proceeds. The two capacity-related controls were **four cards apart**; Manage has them adjacent.

## The change

`app/dashboard/[token]/page.tsx`: the Collection times block (the `COLLECTION TIMES — PER EVENT` card, 7,044 characters) was cut from between the Order-ready card and the buzzer card and inserted **directly before the Kitchen capacity card's own comment** (`Kitchen capacity — its own card now…`). The new order: … Order-ready → buzzer → card payments → Sounds → **Collection times → Kitchen capacity** → native cards.

Nothing else changed: no copy, no control, no handler, no other card moved. The only text difference inside the block is three lines appended to its leading comment recording the new position and the date.

## The harness — `scripts/slot-interval-event-override.cjs`, new section

**Failure mode:** the box drifting away from the Kitchen capacity card — back to where it first landed, or anywhere else — so the dashboard stops matching Manage, where the same box sits directly above the same card.

**Broken variant, run FIRST** (the sequence as it was before the move):

```
✓ FAILED as required  V4 the box in its ORIGINAL position (above the buzzer card):
  Collection times → Remind me to add a buzzer → Take card payments online → Sounds → Kitchen capacity
```

**Real run — ✅:**

```
✓ the real page: Collection times immediately precedes Kitchen capacity —
  Remind me to add a buzzer → Take card payments online → Sounds → Collection times → Kitchen capacity
✓ no card title sits between them
✓ Manage: the same box sits directly above the same card
✓ copy intact: "Customer Collection Times" · "Use different times for orders I add" ·
  "Your Collection Times" · "Use my usual setting" · "Collection times are unavailable right now."
```

The assertion reads the five card titles in source order from the Settings tab and requires `indexOf('Kitchen capacity') − indexOf('Collection times') === 1`.

---

# ITEM 2 — CAN TWO BATCHES OF ONE CATEGORY OVERLAP? **YES.**

All FIXTURES: category `burgers` prep 900 s / batch 8, event 18:00–20:00, run through the **unmodified** working-tree `projectBackwardOccupancy`, `fitOrderBackward`, `earliestBackwardFitSlot`, `buildSlotIndicators` and `detectCapacityBreaches`, compiled into the scratchpad.

## 2.1 — `kitchen_capacity` NULL, 5-minute grid. A = 8 @18:15. Does B = 8 @18:20 fit?

```
stored: {"18:15":{"burgers":8}}
windows:   18:00→18:15 {"burgers":8}  red (Burgers 8/8)
intervals: [18:00,18:15)×8
NEW {"burgers":8} @18:20 → tone=amber  fits=TRUE  bound=Burgers 8/8  span=18:05
```

🔴 **B fits.** With both stored:

```
windows:   18:00→18:15 {"burgers":8}  red (Burgers 8/8)
           18:05→18:20 {"burgers":8}  conc=16  red (Burgers 8/8)
intervals: [18:00,18:15)×8  [18:05,18:20)×8
peak concurrency (sweep-line): 16
```

**The grill holds 16 burgers from 18:05 to 18:15**, against a batch of 8. The engine *knows* — `maxConcurrentCount` over its own intervals returns 16 — but nothing reads that for the per-category ceiling.

**Control, same start:** B = 8 @18:15 → `red, fits=false, "Burgers 16/8"`. The check works when the windows share a start minute.

## 2.2 — the same with `kitchen_capacity` 8

```
NEW {"burgers":8} @18:20 → tone=red  fits=FALSE  peak=16  bound=global ceiling
```

**The sweep-line catches it.** `windowScopedPeak` counts every existing interval covering the order's cooking instants, so the 16 is seen and refused. With both stored anyway (an override), `detectCapacityBreaches` flags `18:20: global ceiling, over_total 8`.

So today the category batch is enforced against overlap **only where a kitchen ceiling happens to be set at or below the batch.** With no ceiling — the normal state (10 of 13 vans LIVE have `kitchen_capacity` NULL) — nothing enforces it.

## 2.3 — customer grid 15, operator grid 5 (the new per-van setting)

Customer A = 8 @18:15 is on the 15 grid. An operator on the 5 grid asks for 18:20:

```
NEW {"burgers":8} @18:20 → tone=amber  fits=TRUE  bound=Burgers 8/8
dots (15-grid): 18:15=red "8 Burgers"
```

**Yes — an operator order creates the overlap on a customer-15 van**, and the customer-facing 15-grid dots show nothing at 18:20 because 18:20 is not a customer slot. Then a customer asks for 18:30:

```
stored: {"18:15":8, "18:20":8}   (customer grid 15)
NEW {"burgers":8} @18:30 → tone=amber  fits=TRUE  bound=Burgers 8/8  span=18:15
```

Window 18:15→18:30 overlaps B's 18:05→18:20 by five minutes; same-start finds nothing at 18:15; fits. **Three batches, 24 burgers committed, with 16 in the grill at 18:15–18:20.** The operator grid being finer than the customer grid is exactly the shape that makes this reachable without an override.

## 2.4 — what the dots and the breach detector show

| case | dots | `detectCapacityBreaches` |
|---|---|---|
| 2.1b (kc NULL, both stored) | 18:15 red "8 Burgers" · 18:20 red "8 Burgers" — **two individually-full windows, no sign they overlap** | **none** — it reads `remainingByCat` per window, and each window is exactly 8/8 |
| 2.2b (kc 8, both stored) | same two red dots | `18:20: global ceiling, over_total 8` — from the sweep-line, not the batch |
| 2.3b (customer 15 grid) | 18:15 red "8 Burgers" · 18:30 red "8 Burgers" — the operator's 18:20 window has **no dot at all** on the customer grid | none (kc NULL) |

**DISPLAY == PICKER holds, and both are wrong in the same way.** The dot's tone is `used >= batch` per window; the picker's test is `existing.byCat[cat] + add > batch` per same-start window. They agree, and neither sees an overlap.

## 2.5 — rolling or same-start? **Same-start.** §31 and the code, side by side

**§31 (CANONICAL, AUTHORITATIVE):**

> *"### The two ceilings (this is the whole capacity model)*
> *Every **rolling cooking window** (length = prep time, e.g. 5 min) is constrained by BOTH, independently:*
> *1. **Batch (per-category):** max of ONE category per window. E.g. pizza batch 2 = max 2 pizzas cooking at once.*
> *2. **Kitchen capacity (cross-category total):** max TOTAL items of any kind per window.*
> *A window is FULL when EITHER ceiling is hit. Both always apply."*

and, on the ceiling: *"The kitchen-capacity ceiling is judged PER WINDOW — specifically the windows THIS order's cooking occupies… `fitOrderBackward`'s ceiling test is window-scoped (`windowScopedPeak`)… counts the order PLUS every existing batch covering it (incl. boundary-spanning — the sweep-line count is unchanged)."*

**The code — `fitOrderBackward`, the per-category test:**

```ts
// PER-CATEGORY batch tones (PREP grid) — UNCHANGED: existing per-cat load ⊕ order's per-cat load.
for (const [ws, ord] of orderLoad) {
  const existing = back.byStart.get(ws)            // ← the window with the SAME start minute, only
  for (const [cat, add] of Object.entries(ord)) {
    const batch = batchOf[cat]
    if (batch == null) continue
    const combined = (existing?.byCat[cat] ?? 0) + add
    const t: SlotTone = combined > batch + EPS ? 'red' : combined >= batch - EPS ? 'amber' : 'green'
    consider(t, `${capWord(cat)} ${Math.round(combined)}/${Math.round(batch)}`)
  }
}
```

**The code — the same function, the ceiling test, twenty lines later:**

```ts
const realIntervals = [...back.intervals, ...orderCookIntervals]
const cookingPeak = windowScopedPeak(realIntervals, orderCookIntervals)   // ← every covering interval
```

**And `projectBackwardOccupancy`'s window tone, the display side:**

```ts
for (const [cat, used] of Object.entries(byCat)) {                       // byCat = this start minute's load
  const batch = batchByCat[cat]
  …
  const t: SlotTone = used >= batch - EPS ? 'red' : 'amber'
}
// Global ceiling for the no-basket display = EXACT concurrency at this window's instant
const conc = concurrencyAt(intervals, startMins)                          // ← rolling, but cross-category
```

So: **the kitchen-capacity ceiling is rolling** (`windowScopedPeak` / `concurrencyAt` over intervals, boundary-spanning counted, exactly as §31 describes). **The per-category batch is a same-start-minute lookup** (`back.byStart.get(ws)` → `byCat[cat]`), which is a rolling check *only when every window of that category starts on the same grid as its length* — i.e. when prep is a multiple of the collection step and every window aligns. §31's "every rolling cooking window … max of ONE category per window" is **not what the batch path implements**. The manual's own V6.7 description ("window-scoped … incl. boundary-spanning") is true of the ceiling and was never true of the batch.

Why it was invisible: every worked example in §31 is prep 5 on a 5-minute grid, and every live cooking category until this month was prep 300 s on a 5-minute grid. Aligned windows can only coincide or be disjoint, so same-start *is* rolling there. The slot-interval work (grids of 5–30) and test-truck's 900-second Pizza are what make partial overlap reachable.

## 2.6 — LIVE: prep longer than the effective collection interval

```sql
select menu_categories.truck_id,
       menu_categories.name,
       menu_categories.prep_secs,
       menu_categories.batch_size,
       menu_categories.is_active
from public.menu_categories
where menu_categories.prep_secs > 300
order by menu_categories.truck_id, menu_categories.name;
```

```sql
select truck_vans.truck_id,
       truck_vans.name,
       truck_vans.collection_interval_mins,
       truck_vans.operator_collection_interval_mins,
       truck_vans.kitchen_capacity,
       truck_vans.capacity_window_mins
from public.truck_vans
order by truck_vans.truck_id, truck_vans.name;
```

**Exactly one cooking category LIVE has prep > 300 s:** test-truck **Pizza, 900 s, batch 8, active.** Its two vans:

| van | customer interval | effective operator interval | `kitchen_capacity` | prep > interval? | exposed? |
|---|---|---|---|---|---|
| test-truck **Van1** | 15 | 15 (override null) | **NULL** | no — 900 s = 15 min, windows align | not today — but an **event override** to 5 (migration `20260918`, written, not applied) would expose it with no ceiling |
| test-truck **Van2** | 5 | 5 | **8** | **yes** | overlap **reachable**, but the ceiling at 8 = batch catches it (2.2) |

⚠️ The brief's premise "all vans are currently at 5" is slightly stale: **Van1 is at customer 15 / operator 15** (from earlier localhost testing) and Van2 at 5 / override 5 — as recorded in the hardening report. Every other van is 5 / null, and every other cooking category is prep 300 s, so aligned.

**Pizzeria Gusto:** Pizza 300 s / batch 2, van interval 5, `kitchen_capacity 2`. Prep equals the grid, so no partial overlap is possible; and its ceiling equals its batch, so even an aligned double-booking is caught by the sweep-line. **Gusto is not exposed by either route.**

## 2.7 — the smallest fix (proposed, NOT built)

**Where it lives — two places, because DISPLAY must equal PICKER:**

1. **`fitOrderBackward`, the per-category loop.** Replace the same-start lookup with a per-category concurrency over the order's window. The engine already builds every existing cooking window as a `CookInterval` in `back.intervals`; it lacks only the category. Tag it (`CookInterval.cat?: string` — additive; the sweep-line ignores it) and, for each of the order's windows `[ws, ws+prep)`, take `existingCat = Σ items of back.intervals with cat === this cat that overlap [ws, ws+prep)` in place of `existing?.byCat[cat] ?? 0`. Everything else in the loop — `combined`, the tone thresholds, `consider`, `bound_by` — is unchanged.
2. **`projectBackwardOccupancy`, the window tone.** For each window, the per-category `used` becomes the same overlap sum over the *other* windows' intervals rather than this start minute's `byCat`, so the dot goes red when a category's rolling load hits its batch — the same way `conc` already does for the ceiling via `concurrencyAt`. `byCat` itself (the label) is untouched. `detectCapacityBreaches` reads `remainingByCat` from that window and inherits the fix for free.

`earliestBackwardFitSlot`, `loadRunsOffFront`, `windowScopedPeak`, `placeInstantPoints`, the pile, and the storage shape are untouched. This is *not* the "keep orders together" change — it makes the existing rule mean what §31 says it means.

**Gusto blast radius — a provable no-op, on two independent grounds:**
- **Alignment.** Gusto's only cooking category has prep 300 s on a 5-minute grid, so every cooking window is `[5k, 5k+5)`. Two such windows either share a start or are disjoint; the overlap sum over `[ws, ws+5)` therefore equals exactly `byStart.get(ws).byCat[cat]`. Same-start and rolling are the *same number* for every Gusto input.
- **The ceiling.** `kitchen_capacity 2 = batch 2`, so any per-category overlap would already be red by the sweep-line. The fix cannot change a verdict the ceiling has already given.
The general form: **the fix is a no-op for every category whose prep is a multiple of the collection step**, which is every category on every truck except test-truck's Pizza on a 5- or 10-minute grid.

**The harness — `scripts/batch-rolling-check.cjs`:**
- Broken variant (run first): today's same-start lookup → 2.1 reports `fits=true` → **must FAIL**.
- Real: 2.1 → `red, fits=false, "Burgers 16/8"`; 2.3 → the operator's 18:20 refused; the dots for 2.1b show the 18:20 window red with a rolling label; `detectCapacityBreaches` flags it with no ceiling set; 2.2 unchanged (the ceiling still catches it first).
- **Byte-identity in the aligned case** (the same worktree-vs-working-tree pattern as `slot-interval-engine-identity.cjs`): every §31 worked example must produce identical JSON from `projectBackwardOccupancy`, `fitOrderBackward` and `earliestBackwardFitSlot` before and after — 3 pizzas @17:05 (17:00 = 2 red, 17:05 = 1 amber); 2 pizzas + 2 desserts at cap 4; 1 pizza + 3 desserts; 2 pizzas + 3 desserts rejected by the ceiling; 3 pizzas rejected by batch; 6 pizzas @16:30 pile red/6; 6 @16:30 + 8 @16:35 pile/10; "17:00 & 17:05 full, add 2 pizzas + 7 desserts → 17:15"; plus Gusto-shaped fixtures (batch 2 / prep 5 / kc 2) and a seeded sweep of prep-5-on-grid-5 cases. Any byte difference in an aligned case is a bug in the fix.
- A second broken variant: the fit fixed but the window tone not → DISPLAY ≠ PICKER (the picker refuses 18:20 while the dot shows room) → must FAIL.

**Size:** two loops in one file, one optional field on `CookInterval`. It touches two of the nine byte-identity symbols (`fitOrderBackward`, `projectBackwardOccupancy`), so the identity harness moves from "identical bytes" to "identical output on every aligned fixture" — which is the property that actually matters and is stronger.

---

# VERIFICATION (item 1)

- **All 20 harnesses pass** — 8 × `slot-interval-*` (the event-override harness now carrying the ordering assertion), 7 × `outreach-*`, 5 × `whatsapp-*`.
- **`tsc --noEmit`** — no errors.
- **`next build`** — compiled successfully, 95/95 static pages.
- **eslint vs a clean HEAD worktree (18 changed files)** — HEAD 664 → **663**. Delta per rule: `@typescript-eslint/no-unused-vars` (severity 1) **−1**; **no new messages**. The single removal is the dead `MINUTES` const from an earlier stage.
- **The nine engine symbols are byte-identical to HEAD** — `projectBackwardOccupancy` (11,473 bytes), `fitOrderBackward` (1,155), `earliestBackwardFitSlot` (1,232), `windowScopedPeak` (904), `backwardWindowStepMins` (293), `loadRunsOffFront` (639), `placeInstantPoints` (576), `buildUnitsFromOrders` (3,792), `rebuildProductionSlotUsage` (1,544). **This prompt touched none of them**; item 2 was run against them unmodified.
- **`git diff --stat`** — 18 files changed, 726 insertions, 42 deletions.

## git status after

```
 M app/api/dashboard/action/route.ts     M lib/capacity-breach.ts
 M app/api/dashboard/route.ts            M lib/orders/place-in-slot.ts
 M app/api/events/route.ts               M lib/payments/promote-draft.ts
 M app/api/manage/route.ts               M lib/slot-availability.ts
 M app/api/menu/[truckId]/route.ts       M lib/slot-display.ts
 M app/api/orders/submit/route.ts        M lib/slot-generation.ts
 M app/api/slots/[truckId]/route.ts      M lib/supabase.ts
 M app/dashboard/[token]/page.tsx
 M app/manage/[token]/page.tsx
 M app/trucks/[slug]/order/page.tsx
 M components/dashboard/AddOrderPanel.tsx
?? docs/ (6 reports incl. this one)  ?? lib/slot-interval.ts  ?? scripts/_slot-interval-compile.cjs
?? scripts/slot-interval-*.cjs (8)   ?? supabase/migrations/2026091{6,7,8}_*.sql (3)
```

---

# MANUAL SECTIONS THAT ARE STALE

`docs/reference-manual.md` is **not edited**.

1. 🔴 **§31 "The two ceilings"** — *"Every rolling cooking window … Batch (per-category): max of ONE category per window"* describes a rolling per-category ceiling. **The code implements a same-start-minute check for the batch and a rolling check only for the kitchen ceiling.** The section should either state the limitation (the batch ceiling is rolling only where prep aligns with the collection grid) or be made true by the 2.7 fix. Until then the sentence is a claim the code contradicts, in the section that calls itself authoritative.
2. **§31 "TRAFFIC-LIGHT DOTS"** — the dot tone is per start minute for the batch; two overlapping full windows show as two independent full dots. Same root cause.
3. **§31 "ASAP … the kitchen-capacity ceiling is judged PER WINDOW … window-scoped"** — correct, and worth contrasting explicitly with the batch path so the next reader does not assume both ceilings share the mechanism.
4. **§10 / the dashboard Settings tab** — any description of the card order now places Collection times directly above Kitchen capacity, matching Manage.
5. The slot-interval reports' standing items (van-level intervals, event overrides, the named-select rule) still apply.

---

# WHAT I COULD NOT ESTABLISH

1. **Whether the overlap has ever happened in production.** It needs a category with prep > the collection step and no ceiling at or below the batch. LIVE that is test-truck Van1 only, and only via an event override that cannot exist until `20260918` is applied. No order data was examined for it (read-only scope, and `production_slot_usage` cannot show overlap — it stores per-slot totals).
2. **Whether Dominic wants the 2.7 fix or the "keep together" mode first.** They are different changes: 2.7 makes the existing batch rule true; keep-together adds a new rule on top. Building keep-together on a same-start batch check would inherit this hole.
3. **The rendered dashboard order** — asserted by source order and card titles, not seen in a browser. It is the first step of any localhost look.
4. **Exact §31 byte-identity of a 2.7 fix** — asserted as a requirement of the proposed harness, not yet run, because nothing was built.

---

**Item 1 changed one file's layout and one harness. Item 2 changed nothing.** No migration, no database write; every read was a `GET`; every fixture ran against the unmodified engine.
