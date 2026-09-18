# Batch overlap — READ-ONLY REVIEW

**17 September 2026 · HEAD `fc0fddc outreach` · READ-ONLY.** No code changed, nothing written to any database. Every fixture ran through the **real, unmodified working-tree engine** — `projectBackwardOccupancy`, `fitOrderBackward`, `earliestBackwardFitSlot`, `buildSlotIndicators`, `detectCapacityBreaches`, `generateCollectionTimes` — compiled into the session scratchpad.

**Scope:** the only live trading truck is Pizzeria Gusto. The truck that raised this is a **prospect** set up as burgers cook 15 minutes, batch 8, collection times every 15 minutes.

Figures are **LIVE** (production, read-only today), **CODE** (working tree) or **FIXTURE**.

> **The answer in three lines.** The per-category batch check compares only batches that start at the **same minute**, not batches that overlap in time. The prospect's 15/15 configuration is **safe** — 4,996,476 accepted states swept, the grill never exceeded 8 without an override. It becomes unsafe the moment any collection interval in play (customer, operator tickbox, event override, or an off-list time) is **shorter than the cook time**. Gusto is safe on both counts.

---

## 0. git status

18 modified, 20 untracked — the slot-interval workstream plus seven reports. **Touched nothing.** This review adds only its own report.

---

## R1 — the mechanism, re-confirmed

### `fitOrderBackward` — whether a category batch has room

```ts
// PER-CATEGORY batch tones (PREP grid) — UNCHANGED: existing per-cat load ⊕ order's per-cat load.
for (const [ws, ord] of orderLoad) {
  const existing = back.byStart.get(ws)
  for (const [cat, add] of Object.entries(ord)) {
    const batch = batchOf[cat]
    if (batch == null) continue
    const combined = (existing?.byCat[cat] ?? 0) + add
    const t: SlotTone = combined > batch + EPS ? 'red' : combined >= batch - EPS ? 'amber' : 'green'
    consider(t, `${capWord(cat)} ${Math.round(combined)}/${Math.round(batch)}`)
  }
}
```

### `projectBackwardOccupancy` — the display tone

```ts
for (const [cat, used] of Object.entries(byCat)) {          // byCat = the load seated at THIS start minute
  const batch = batchByCat[cat]
  if (batch == null) continue
  remainingByCat[cat] = batch - used
  const t: SlotTone = used >= batch - EPS ? 'red' : 'amber'
  …
}
```

**In one sentence:** both compare only batches that start at the **same minute** (`back.byStart.get(ws)` / this window's own `byCat`), never batches that overlap in time — the rolling, boundary-spanning check exists only for the kitchen-capacity ceiling (`windowScopedPeak` / `concurrencyAt`).

### The 2.1 fixture, re-run (FIXTURE: batch 8, prep 15, `kitchen_capacity` NULL, 5-minute grid; A = 8 @18:15 stored; B = 8 @18:20)

```
fitOrderBackward raw: {"tone":"amber","bound_by":"Burgers 8/8","fits":true,"peak":0,"spanFromMins":1085}
after both:  windows 18:00→18:15:8  18:05→18:20:8   grill peak 16   per-order peak 16
minute table: 18:00:8  18:05:16  18:10:16  18:15:8
```

**B fits.** Sixteen burgers on an 8-batch grill from 18:05 to 18:15.

---

## R2 — the safe case: the prospect's configuration

**FIXTURE:** batch 8, prep 15, `kitchen_capacity` NULL, customer and operator intervals both **15**, clock-anchored grid via `generateCollectionTimes`, event 17:00–21:00 (+30 min grace), starts at **17:00, 17:05, 17:50, 18:10** (first slots 17:00, 17:15, 18:00, 18:15 — so the run-up and an off-grid start are both exercised).

**Placement modelled exactly as `placeOrderInSlotLocked` does it:** a requested time walks forward to the first fitting slot (`earliestBackwardFitSlot` from `max(startSlot, requested)`); ASAP walks from the event start; no fitting slot ⇒ pending, not stored. Each accepted order is merged into the per-slot aggregate exactly as `addOrderToProductionSlot` merges it.

**Two peaks per state:** the engine's own (`maxConcurrentCount` over `projectBackwardOccupancy(...).intervals` of the stored aggregate) **and** a per-order cross-check (each accepted order spread independently, all intervals summed). They must agree, or the aggregate is hiding a boundary.

| pass | orders | sizes | requested times | states | pending placements | max on grill |
|---|---|---|---|---|---|---|
| exhaustive | 1 and 2 | every size 1–12 | ASAP + every selectable slot, × 4 starts | **178,936** | 752 | **8** |
| exhaustive | 3 | 1, 4, 7, 8, 9, 12 (includes > batch) | ASAP + every selectable slot, × 4 starts | **4,757,540** | — | **8** |
| random (seeded) | 4–6 | every size 1–12 | ASAP + every selectable slot, × 4 starts | **60,000** sequences | — | **8** |
| **total** | | | | **4,996,476** | | **8** |

- **Maximum on the grill in any accepted state: 8.** Never exceeded without an override.
- **Per-order peak ≠ aggregate peak in 0 states.** The stored aggregate never hides a boundary at 15/15.
- Orders larger than a batch (9–12) seat in two consecutive windows, full first, remainder adjacent — never overlapping another order's window.
- The pre-open run-up (`eventStart − 15`) is used once and only once; a second pre-open batch is refused by `loadRunsOffFront`.

⚠️ **Honest scope of "exhaustive":** depth ≤ 2 is exhaustive over the full order space; depth 3 is exhaustive over six sizes chosen to include every regime (below, at, one over, and larger than a batch); depths 4–6 are random. A full exhaustive depth-6 sweep is ~10¹³ states and was not attempted.

---

## R3 — every setting combination that can exceed the batch

Same burger setup (batch 8, prep 15, `kitchen_capacity` NULL), event from 18:00, placements as `placeOrderInSlotLocked`. **FIXTURE, one worked example each.**

| | intervals | worked example (acceptance order → placed) | grill by minute | max | dots |
|---|---|---|---|---|---|
| **(a)** control | customer 15 / operator 15 | customer 8@18:15 → 18:15 · operator 8@18:15 → **18:30** · operator 8@18:20 → **18:45** (18:20 is not on the 15 grid; walked forward) | 18:00–18:40 = 8 throughout | **8 ✓** | 18:15, 18:30, 18:45 red "8 Burgers" |
| **(b)** the tickbox | customer 15 / **operator 5** | customer 8@18:15 → 18:15 · operator 8@18:20 → **18:20 accepted** | 18:00:8 · **18:05:16 · 18:10:16** · 18:15:8 | **16 🔴** | customer grid: 18:15 red, 18:30 red — **the 18:20 window has no customer dot**; operator grid: 18:15 red, 18:20 red |
| **(c)** new-van default | customer 5 / operator 5 | customer 8@18:15 → 18:15 · customer 8@18:20 → **18:20 accepted** | 18:05–18:10 = **16** | **16 🔴** | 18:15 red, 18:20 red — two full-looking, independent dots |
| **(d1)** misaligned, finer | customer 10 / operator 10 | 8@18:20 → 18:20 · 8@18:30 → **18:30 accepted** | 18:15 = **16** | **16 🔴** | 18:20 red, 18:30 red |
| **(d2)** misaligned, coarser | customer 20 / operator 20 | 8@18:20, 8@18:40, 8@18:00 all accepted | windows 17:45, 18:05, 18:25 — **disjoint** | **8 ✓** | 18:00, 18:20, 18:40 red |
| **(e)** | customer 30 / operator 30 | 8@18:30, 8@19:00, 8@18:00 | disjoint | **8 ✓** | three red dots |
| **(f)** dashboard event override to 5 on a 15 van | event effective 5 / 5 | identical to (c) | 18:05–18:10 = **16** | **16 🔴** | as (c) — and `20260918` **is now applied LIVE**, so this is reachable today |
| **(g)** off-list time | customer 15, a stale page or offline replay submits **18:20** | customer 8@18:15 → 18:15 · off-list 8@18:20 → **18:20, confirmed with NO capacity check** | 18:05–18:10 = **16** | **16 🔴** | customer grid: 18:15 red, **18:30 red** — the covering read folds the 18:20 window onto the 18:30 dot |
| **(h)** "Use it anyway" | customer 15 / operator 15 | customer 8@18:15 · override **3@18:15** → stored 11 | the aggregate re-spreads: 17:45 = 8, 18:00 = 3 | **8 ✓** (by design: the override steals the run-up, it does not overlap) | 18:00 red "8", 18:15 amber "3" |

`detectCapacityBreaches` reported **none** in every case — it reads `remainingByCat` per window, and every window is exactly 8/8.

**(g) is the one a settings guard cannot reach.** `placeOrderInSlotLocked`: *"Unrecognised slot (not in the list) → confirm at requested, no capacity check (Section 5)."* Any time that is not on the current grid is accepted verbatim — a customer page loaded before an interval change, or an offline replay carrying an old time.

### The general rule, in one sentence

**The grill can exceed its batch whenever two accepted collection times are closer together than the cook time** — so with a clock-anchored grid it is safe if and only if **every interval in play (customer, operator tickbox, event override, and any off-list time) is at least as long as the longest cook time**; spacing equal to or greater than the cook time (15/15, 20, 30) can never overlap, spacing shorter than it (5, 10) always can.

---

## R4 — LIVE exposure

```sql
select menu_categories.truck_id,
       menu_categories.name,
       menu_categories.prep_secs,
       menu_categories.batch_size
from public.menu_categories
where menu_categories.is_active = true
  and menu_categories.prep_secs > 0
order by menu_categories.truck_id, menu_categories.sort_order;
```

```sql
select truck_vans.id,
       truck_vans.truck_id,
       truck_vans.name,
       truck_vans.collection_interval_mins,
       truck_vans.operator_collection_interval_mins,
       truck_vans.kitchen_capacity,
       truck_vans.capacity_window_mins
from public.truck_vans
order by truck_vans.truck_id, truck_vans.name;
```

```sql
select truck_events.truck_id,
       truck_events.id,
       truck_events.event_date,
       truck_events.van_id,
       truck_events.status,
       truck_events.collection_interval_mins_override,
       truck_events.operator_collection_interval_mins_override
from public.truck_events
where truck_events.event_date >= current_date
  and truck_events.status <> 'cancelled'
order by truck_events.event_date;
```

⚠️ **The third query runs today** — `20260918_event_collection_intervals.sql` **is applied LIVE** (both override columns present on `truck_events`). 4 upcoming non-cancelled events, **0 with any interval override.**

| van | cooking categories (prep / batch) | longest cook | customer | effective operator | event overrides | `kitchen_capacity` | intervals in play | verdict |
|---|---|---|---|---|---|---|---|---|
| **pizzeria-gusto / Van1** | Pizza 300 s / 2 | 5 min | 5 | 5 | none (1 upcoming event on this van) | **2** | {5} | **SAFE** — every interval (5) ≥ cook time (5), so windows can only coincide or be disjoint; and `kitchen_capacity 2 = batch 2`, so even a same-minute double-booking is caught by the sweep-line |
| test-truck / Van1 | Pizza 900 s / 8 | 15 min | 15 | 15 | none | NULL | {15} | **SAFE** (the prospect's configuration, R2) |
| test-truck / Van2 | Pizza 900 s / 8 | 15 min | 5 | 5 | none | **8** | {5} | **EXPOSED — but `kc 8 ≤ batch 8`, the sweep-line catches it** (2.2 in the previous report) |
| test-truck-3-2 / Van 1 | Pizza 300 s / 2 | 5 min | 5 | 5 | none (1 upcoming) | 2 | {5} | SAFE |
| demo-3hgv… / Van 1 | Burgers 300 s / 4 | 5 min | 5 | 5 | none | NULL | {5} | SAFE |
| demo-8c95… / Van 1 | Burgers 300 s / 4 | 5 min | 5 | 5 | none | NULL | {5} | SAFE |
| demo-a76m… / Van 1 | Mains 300 s / 4 | 5 min | 5 | 5 | none | NULL | {5} | SAFE |

Vans with no cooking category (real-thai-food, test-truck-2, test-truck-3, tikka-tonic, tt3, village-spice) have nothing to overlap and are omitted.

**No live van is exposed with no protection.** The only exposed van (test-truck Van2) is protected by a ceiling equal to its batch. Gusto's two remaining upcoming events have `van_id` NULL and follow the no-van 5/5 path; a null van cannot resolve a cooking category's interval any differently.

⚠️ Two LIVE facts differ from earlier reports and are recorded: test-truck **Van2 is now 5 / 5** (it read customer 15 / override 5 on the 17th, earlier), and the **event-override migration is applied**.

---

## R5 — options (proposed, not built)

| # | Option | What changes | Gusto blast radius | Size |
|---|---|---|---|---|
| **(1)** | **Do nothing; document the rule** | §31 gains the sentence: *the per-category batch is enforced per start minute; it is a true ceiling only while every collection interval ≥ the cook time.* A line in the Collection times help. | **None.** | Docs only |
| **(2)** | **Guard in settings** — Manage's Collection times box, the dashboard event box and the tickbox | When a chosen interval is shorter than the van's longest `prep_secs`, show one line (*"Shorter than your 15-minute cook time — orders may overlap on the grill"*), or list only compatible intervals. Needs the longest cook time on the page: Manage already has `categories`; the dashboard has `serverCatConfigs`. No engine, no route, no migration. **Does not cover (g) off-list times.** | **None** at 5/5 with a 5-minute cook — the warning condition is never true for Gusto. The box's copy grows by one conditional line, shown to nobody live. | Small — two components |
| **(3)** | **Engine fix** (previous report §2.7) | `fitOrderBackward`'s per-category test and `projectBackwardOccupancy`'s window tone become rolling per category (overlap sum over tagged `CookInterval`s). Covers (b)–(g) including off-list. | **Provable no-op**: Gusto's windows are all `[5k, 5k+5)`, so the overlap sum equals the same-start sum for every input; `kc 2 = batch 2` besides. But it touches **two of the nine byte-identity symbols**, so the identity harness re-scopes to "identical output on every aligned fixture". | Medium — one file, two loops, plus a harness with a HEAD-vs-new identity sweep |
| **(4)** | **Resolver clamp** — in `resolveIntervalsFor`, raise any effective interval below the van's longest cook time up to it | Everything downstream (grid, dots, placement, offline) sees a compatible grid; no engine change. **But it silently overrides a stored setting**, and it too cannot see an off-list time. | None at 5-minute cook. | Small — one function |

**Recommendation: (1) + (2), now.** The prospect intends 15/15 and R2 proves that safe across ~5 million states; Gusto is safe on two independent grounds; no live van is exposed without a ceiling. A one-line warning at the moment an operator picks an interval shorter than their cook time is the cheapest thing that stops the exposed configurations being chosen by accident, and it needs nothing in the engine. **(3) is the correct fix** — it makes §31's sentence true — and should be built before any truck is *allowed* to run sub-cook-time intervals; until then it is a change to two identity symbols for a case nobody is in. **(4) is not recommended**: a setting that reads back different from what was chosen is the silent-drift shape this codebase keeps rediscovering.

Whatever is chosen, **(g) remains**: an off-list time is confirmed without a capacity check today, on every truck, under every setting. That is a pre-existing property of `placeOrderInSlotLocked`, worth its own line in §31.

---

## Manual sections that are stale

`docs/reference-manual.md` is **not edited**.

1. 🔴 **§31 "The two ceilings"** — *"Every rolling cooking window … Batch (per-category): max of ONE category per window."* The batch is enforced per **start minute**; only the kitchen ceiling is rolling. Either state the limitation and the rule from R3, or build option (3).
2. **§31 "TRAFFIC-LIGHT DOTS"** — two overlapping full windows render as two independent full dots; the covering read on a coarser grid folds an off-grid window onto the next dot (R3 (g)) without saying so.
3. **§31 / §5 off-list slots** — *"Unrecognised slot → confirm at requested, no capacity check"* should be stated where the ceilings are described, not only in the placement code.
4. **The slot-interval reports** — `20260918` is now applied; test-truck Van2 is 5/5.

---

## What I could not establish

1. **Whether an overlap has ever happened in production.** `production_slot_usage` stores per-slot totals and cannot show it; no order data was inspected for it (read-only scope). The only live van that could reach it is ceiling-protected.
2. **The prospect's real menu.** No truck named for it exists; test-truck Van1 (Pizza 900 s / 8, 15/15) is the stand-in. If the prospect adds a second cooking category with a different cook time, R3's rule applies per category — the *longest* cook time is the one that matters.
3. **Depth-6 exhaustively.** ~10¹³ states; sampled instead (60,000 sequences), with depth ≤ 3 exhaustive. No state of any depth exceeded 8.
4. **How often (g) occurs** — a stale page or offline replay submitting an off-grid time after a setting change. Plausible after any Manage change during trading; unmeasured.

---

**Nothing was changed.** No code, no migration, no database write; every read was a `GET`; every fixture ran against the unmodified engine.
