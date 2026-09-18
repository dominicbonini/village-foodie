# Keep orders together in one batch — FULL INVESTIGATION

**17 September 2026 · HEAD `fc0fddc outreach` · READ-ONLY.** No code changed, no migration run, nothing written to any database. Every database read was a `GET`; every fixture was run against the **unmodified working-tree engine**, compiled into the scratchpad.

Figures are **LIVE** (production, read-only today), **CODE** (working tree), or **FIXTURE** (made-up inputs through the real engine).

> 🔴 **THE FINDING THAT REFRAMES THE REQUEST.** Dominic's description — *"the engine cooks 8 in one batch and 2 in the next, so B's order is split"* — is **true under one of the two ways the truck can be configured and false under the other**, and the two behave in opposite directions:
>
> | Model | How "8 per 15 min" is stored | B=4 at 18:15 with A=6 already there | Today's behaviour, in Dominic's words |
> |---|---|---|---|
> | **Category batch** (`prep_secs 900`, `batch_size 8`) — **how `test-truck` is configured LIVE** | per-category batch window | **RED, refused.** B is placed **whole** at the next fitting slot (`placeOrderInSlotLocked` walks forward → 18:30) or, via ASAP, at an earlier empty one (18:00). Two batches, each part-empty. | **"Keep orders together"** — already today |
> | **Kitchen ceiling** (burgers instant + ticked, `kitchen_capacity 8`, `capacity_window_mins 15`) | sweep-line concurrency points | **AMBER, accepted.** Stored 10 seats as 8 @18:00 **+ 2 @17:45** — `placeInstantPoints` rolls the overflow into the earlier window. B is split. | **"Fill every space"** — already today |
>
> So the proposed default *("Fill every space — exactly today's behaviour")* is today's behaviour only for a ceiling-modelled truck, and the proposed opt-in *("Keep orders together")* is today's behaviour for a batch-modelled truck. **Which model the burger truck actually uses decides whether this feature is a new rule, the opposite rule, or a wording change.** That is Decision 0 in Part C. Everything below is worked for both.

---

## 0. git status

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
?? docs/… (5 reports)   ?? lib/slot-interval.ts   ?? scripts/_slot-interval-compile.cjs
?? scripts/slot-interval-*.cjs (8)   ?? supabase/migrations/2026091{6,7,8}_*.sql (3)
```

**18 modified, 18 untracked** — the slot-interval workstream, untouched. This investigation added nothing to the tree; its two scratch scripts live in the session scratchpad.

---

# PART A — HOW THE ENGINE SEATS COOKING TODAY

## A1. Seating, with the code

### Per-category batch windows — `projectBackwardOccupancy`

Existing load arrives as **per-slot totals** and is spread backward from each slot's deadline on the category's prep grid:

```ts
const batch = Math.max(1, cfg.batch)
const prepMins = Math.max(1, Math.round(cfg.secs / 60))
batchByCat[cat] = batch
const numWindows = Math.ceil(N / batch)
const earliestWindowMins = deadline - numWindows * prepMins
…
// Seat batches backward on the PREP grid (UNCHANGED): earliest windows full (batch), the
// window ADJACENT to collection holds the remainder N − batch*(numWindows-1) ∈ [1, batch].
for (let i = 0; i < numWindows; i++) {
  const startMins = deadline - (numWindows - i) * prepMins
  const isAdjacent = i === numWindows - 1
  const items = isAdjacent ? N - batch * (numWindows - 1) : batch
  const w = loadByStart.get(startMins) ?? {}
  w[cat] = (w[cat] || 0) + items
  loadByStart.set(startMins, w)
  cookIntervals.push({ startMins, endMins: startMins + prepMins, items })
}
```

**The backward spread:** full batches earliest, the remainder in the window adjacent to collection. §31's worked example holds (3 pizzas, batch 2 → 17:00 = 2, 17:05 = 1) and the fixtures reproduce it at batch 8 / prep 15.

### The kitchen-capacity sweep-line

`kitchen_capacity` is a **concurrency** ceiling, judged by `maxConcurrentCount` / `concurrencyAt` over `CookInterval`s — a cooking batch is `[S, S+prep)` counting its items throughout; a **ticked instant** item is a zero-width point. `capacity_window_mins` governs only where instant points seat and how they roll:

```ts
// placeInstantPoints
const ws0 = anchorMins - capacityStep
…
while (remaining > 0) {
  if (w < Math.max(eventStartMins - capacityStep, nowMins)) return { points, runsOffFront: true }
  const headroom = Math.max(0, kitchenCapacity - concurrencyAt(sofar, w))
  const place = Math.min(remaining, headroom)
  if (place > 0) { … points.push(p); sofar.push(p); remaining -= place }
  w -= capacityStep
}
```

🔴 **This is the only place in the engine that splits an order.** `place = min(remaining, headroom)` seats *part* of an order in a window and rolls the rest one `capacityStep` earlier. Cooking batches are never split this way — a cooking category's `nw = ceil(M/batch)` windows are seated whole or refused.

### The run-up and the pre-open pile

One pre-open window is allowed (`eventStart − prep`): the run-up. Load needing to seat earlier "piles" — a **display-only** map read by the event-start dot:

```ts
// pileByStart: sums ALL cooking seated in PRE-OPEN windows (startMins < eventStartMins)
for (const w of windows) {
  if (w.startMins >= eventStartMins) continue
  … byCat[cat] += v; total += v
}
if (tone === 'red' && overflowed) bound_by = 'over capacity at event-start'
```

The seating loop, `byStart` and `intervals` are untouched by it; the picker never reads it.

### `loadRunsOffFront` — the shared lead verdict

```ts
const nw = Math.ceil(N / batch)
if (slotMins - nw * prep < Math.max(eventStartMins - prep, nowMins)) return true
```

One source for "would this cooking need a window before the front floor", used by both `fitOrderBackward` and the no-basket dot.

### `windowScopedPeak` — the ceiling, judged only where the order cooks

Evaluates `concurrencyAt(allIntervals, t)` only at instants the new order's intervals occupy (plus any existing start inside the order's cooking span), so an unrelated earlier override breach cannot red-out every later slot (§41).

### `fitOrderBackward` — how a NEW order is seated

The order's cooking is laid out backward from the candidate slot **whole**, then tested per window:

```ts
const nw = Math.ceil(M / batch)
if (loadRunsOffFront({ [cat]: (Number(existingAtSlot[cat]) || 0) + M }, …)) runsOffFront = true
for (let i = 0; i < nw; i++) {
  const ws = slotMins - (i + 1) * prep
  const items = i === 0 ? M - batch * (nw - 1) : batch
  …
}
// PER-CATEGORY batch tones — existing per-cat load ⊕ order's per-cat load
const combined = (existing?.byCat[cat] ?? 0) + add
const t = combined > batch + EPS ? 'red' : combined >= batch - EPS ? 'amber' : 'green'
```

**`fits` is false if any window the order touches would exceed its batch or the ceiling.** There is no partial seating of a cooking category: the order fits whole or it does not fit at that slot. Then, for a counted-instant portion, `placeInstantPoints` runs — and *that* may split.

## A2. 🔴 THE KEY QUESTION — does the engine know order boundaries? **NO.**

**What the engine receives:** `productionSlotUnits: Record<string, QtyByCat>` — one entry per collection slot, each a **sum** of item quantities by category across every order at that slot. Nothing else. The code says so itself, in `contributingProductionSlots`:

> *"🔴 HARD LIMIT — this returns SLOTS, never orders, and that is not a shortcut. `productionSlotUnits` is a per-slot AGGREGATE: 5 pizzas at 18:30 may be two orders, and the units that spill backward from it into an earlier window belong to those orders JOINTLY. **There is no information anywhere in the projection that could attribute a spilled unit to one order** — CookInterval carries no provenance and the source deadline is discarded during seating."*

**Where the boundary is lost — one line, in `buildUnitsFromOrders`:**

```ts
;[...(orders || []), ...extraOrders].forEach(order => {
  const ct = order.slot || eventStart
  …
  const productionSlot = timeMap[ct] || ct
  const lines = normaliseOrderLines(order.items || [], order.deals)
  const delta = orderItemsToQtyByCat(lines, itemCatMap)
  out[productionSlot] = mergeQtyByCat(out[productionSlot] || {}, delta)   // ← the merge
})
```

⚠️ **The per-order data exists upstream.** `orders.slot`, `orders.items` and `orders.deals` are per row; `buildUnitsFromOrders` reads them per order and then merges. Per-order granularity is not missing from the *system* — it is discarded at the storage boundary.

### Every producer and consumer of the aggregate shape

Schema, read-only (established from PostgREST's OpenAPI document — its live schema cache — since no SQL endpoint is exposed):

```sql
select information_schema.columns.column_name,
       information_schema.columns.data_type,
       information_schema.columns.is_nullable,
       information_schema.columns.column_default
from information_schema.columns
where information_schema.columns.table_schema = 'public'
  and information_schema.columns.table_name = 'production_slot_usage'
order by information_schema.columns.ordinal_position;
```

LIVE: `truck_id text NOT NULL · event_date date NOT NULL · production_slot text NOT NULL · units_by_cat jsonb NOT NULL · updated_at timestamptz NOT NULL default now() · event_id uuid NULL`. Unique on `(truck_id, event_id, production_slot)`. **One row per slot; `units_by_cat` is `{ "mains": 3, "sides": 1 }` — no order key anywhere.** Sample LIVE row (test-truck, 2026-08-21 18:40): `{"mains":5,"sides":1,"starters":5}`.

| Site | Role | Shape | What per-order granularity would require |
|---|---|---|---|
| `production_slot_usage` (table) | storage | per-slot `units_by_cat` | A second shape: per-order rows `(event_id, order_key, slot, units_by_cat)`, or read `orders` directly at fit time and never store the aggregate |
| `buildUnitsFromOrders` | the lazy reseed / rebuild source | merges per order → per slot | Return `{ perSlot, perOrder[] }`; the merge is one line |
| `readProductionSlotUnits` / `getProductionSlotUnits` | the read every engine caller uses | per-slot map | Either read per-order rows, or always rebuild from `orders` (it already does when the cache is empty) |
| `excludeOrderKey` path (submit fit-read) | `.neq('order_key', excludeOrderKey)` on the reseed | filters BEFORE merge | Trivially per-order — it already keys on `order_key` |
| `addOrderToProductionSlot` / `removeOrderFromProductionSlot` | incremental book/unbook | `mergeQtyByCat` / `subtractQtyByCat` into the slot's aggregate | Insert/delete a per-order row instead of merging |
| `computeEventUnitRows` (§45 atomic RPC) | post-insert rows folded through the same loop | per slot | Same as `buildUnitsFromOrders` |
| `rebuildProductionSlotUsage` | delete-and-rebuild per event | per slot | Same |
| `/api/slots`, `/api/dashboard` | readers → `projectBackwardOccupancy` | per slot | Pass per-order input to the engine |
| `/api/dashboard` → `truckSnapshot` → `offlineCapacity.productionSlotUnits` | the offline cached inputs | per slot | Ship per-order units in the snapshot (size: one entry per order, not per slot) |
| `buildOfflineOccupancy` (`lib/slot-capacity.ts`) | the client-side re-fold of server orders + queued offline creates | `merged[ps] = mergeQtyByCat(…)` — the SAME one-line merge | Keep per-order entries; the client already iterates orders |
| `seedDemoOrders` → `buildUnitsInMemory` | demo seeding | same loop, same merge | Same |
| `contributingProductionSlots` (breach detector) | names slots to move | reads the aggregate and *documents* that it cannot name orders | Becomes able to name orders — a genuine improvement |
| `slot_bookings` (table, 18 LIVE rows) | legacy per-slot order counter | `order_count` per collection_time | **Dead** — only `lib/delete-truck.ts` references it. Not a consumer. |

**Verdict:** the engine receives **only totals**. Order boundaries would have to be *added* at the storage boundary, and eleven sites touch the shape.

## A3. Ordering and priority — deterministic, and order-independent for cooking

`readProductionSlotUnits`'s select has **no `ORDER BY`**, so `Object.entries(productionSlotUnits)` iterates in row-return order. That does not matter, because:

- **Cooking** seats by pure addition into `loadByStart` keyed by `startMins`, then `windows` is sorted `(a, b) => a[0] - b[0]`. Sums are commutative — the result is identical in any order.
- **Instant points** are placed after all cooking, in an explicit order: `instantByDeadline.sort((a, b) => a.deadline - b.deadline)`. Deadline-ascending, deterministic; orders at the same deadline are already summed into one `instantHere` before placement.

So seating is a function of the totals alone. **There is no acceptance-time, key-order or collection-time priority between orders — because there are no orders.** B6 below shows the stored state is identical whichever order was accepted first.

## A4. Operator orders — the `manual` branch

`/api/dashboard/action` `manual`: *"knows the queue, so the manual path bypasses auto_accept and ALL capacity gating … occupies the oven via `addOrderToProductionSlot` below — confirm always, occupy always."* The row is inserted with `slot: slot || null` and the units merged into that slot's aggregate. **No fit runs on the server.**

The only capacity check is client-side, at confirm (V7.9): `submitManual` fetches `/api/slots` fresh, runs `fitOrderBackward` on the chosen slot, and if it does not fit shows an advisory `window.confirm` — *"Use it anyway? You may need to move another customer's slot."* OK books at the chosen slot (`skipFitCheck`); the modal never blocks; a fetch error fails open.

**How an override appears in seating:** the aggregate exceeds the batch; `projectBackwardOccupancy` spreads it honestly — `remainingByCat` goes negative (*"Negative ⇒ honest over-subscription (override) — NOT re-packed"*), the window reads red, and `detectCapacityBreaches` flags it strictly-over. B7 shows it: 11 stored at 18:15 → 8 @17:45 (red) + 3 @18:00, and the pile at 18:00 reads 8.

## A5. LIVE: every van and category

```sql
select menu_categories.truck_id,
       menu_categories.name,
       menu_categories.prep_secs,
       menu_categories.batch_size,
       menu_categories.counts_toward_capacity
from public.menu_categories
where menu_categories.is_active = true
order by menu_categories.truck_id, menu_categories.sort_order;
```

```sql
select truck_vans.truck_id,
       truck_vans.name,
       truck_vans.kitchen_capacity,
       truck_vans.capacity_window_mins
from public.truck_vans
order by truck_vans.truck_id, truck_vans.name;
```

| truck | cooking categories (prep s / batch / counts) | instant categories | van `kitchen_capacity` / `capacity_window_mins` |
|---|---|---|---|
| **pizzeria-gusto** | Pizza **300 / 2 / false** | Desserts, Drinks, Dips & Sauces, Dough Balls (all unticked) | Van1 **2 / 5** |
| **test-truck** | **Pizza 900 / 8 / true** | Desserts, Drinks | Van1 null / 10 · Van2 **8 / 5** |
| test-truck-3-2 | Pizza 300 / 2 / true | Drinks, Desserts | Van 1 2 / 5 |
| demo-3hgv…, demo-8c95… | Burgers 300 / 4 / true | Sides, Extras/Dips, Kids/Specials | Van 1 null / 5 |
| demo-a76m… | Mains 300 / 4 / true | Starters, Sides, Dips | Van 1 null / 5 |
| real-thai-food, test-truck-3, tikka-tonic, tt3, village-spice | — (all prep 0, batch 0) | all | Van 1 null / 5 |

⚠️ Gusto's Pizza has `counts_toward_capacity = false` — irrelevant to the engine: a cooking category **always** feeds `cookIntervals`; the flag only gates instant categories (`if (!cfg.secs) { if (cfg.countsToCapacity) … }`). Gusto's `kitchen_capacity 2` applies to pizza.

**"8 burgers every 15 minutes" is modelled today as a CATEGORY BATCH — `test-truck` Pizza `prep_secs 900, batch_size 8` is exactly it, LIVE.** It *could* also be modelled as `kitchen_capacity 8 / capacity_window_mins 15` with burgers as a ticked instant category. **The answer changes the design completely:**

| | Category batch (LIVE on test-truck) | Kitchen ceiling |
|---|---|---|
| Where "8" lives | `batch_size` | `kitchen_capacity` |
| Where "15 min" lives | `prep_secs` (a cooking duration) | `capacity_window_mins` (a seating cadence) |
| New order seating | whole, or refused at that slot | `placeInstantPoints`: partial fill + roll earlier |
| Splits an order? | **never** | **yes, by design** |
| "Keep together" would be | already the placement rule | a new `placeInstantPoints` mode |
| "Fill every space" would be | a **new** relaxation of `fitOrderBackward` | already the rule |

---

# PART B — WHAT "KEEP ORDERS TOGETHER" MEANS, PRECISELY

All FIXTURES: batch 8, prep 15, 15-minute slots, event 18:00–20:00, run through the **real, unmodified** `projectBackwardOccupancy` / `fitOrderBackward` / `earliestBackwardFitSlot` / `buildSlotIndicators`. "Window 18:00" means cooking `[18:00, 18:15)`, collected 18:15. Contents are shown **by order only where the engine can know it** (a single order at a slot); where two orders share a slot the engine sees one total and the split is attributed by the spread rule.

### B1. A=6 @18:15, then B=4 @18:15

**Batch model, TODAY:**

| step | windows | dots (15-grid) | B's fit at 18:15 | ASAP for B | "Ready around" |
|---|---|---|---|---|---|
| A alone | 18:00 = A:6 (amber 6/8) | 18:15 amber "6 Burgers" | — | — | — |
| B requests 18:15 | — | — | **red "Burgers 10/8" — refused** | **18:00** (the empty run-up) | 18:00 |
| B via `placeOrderInSlotLocked` (requested 18:15) | 18:00 = A:6 · 18:15 = **B:4** | 18:15 amber "6", 18:30 amber "4" | — | walks **forward** → **18:30** | 18:30 |

**B is never split.** Two batches, 6/8 and 4/8. This is **R-LATER for a requested slot** (`fromMins = max(startSlot, requestedSlot)`) and **earliest-anywhere for ASAP**.

**Ceiling model, TODAY:**

| step | capacity points | dots | B's fit at 18:15 |
|---|---|---|---|
| A alone | @18:00 = 6 | (green) | — |
| B requests 18:15 | — | — | **amber, `fits=true`, peak 8** — accepted |
| both stored (10 @18:15) | @18:00 = **8**, @17:45 = **2** | 18:00 red "10 Burgers" | — |

**B is split 2 + 2** across the 18:00 and 17:45 windows. Exactly Dominic's description.

**Candidate rules (both models):**

| rule | B's outcome | A moves? | notes |
|---|---|---|---|
| R-LATER | 18:30, whole (batch model: identical to today) | never | ceiling model: `placeInstantPoints` must refuse partial and the walk moves forward |
| R-EARLIER-OR-LATER | 18:00 whole (cooked 17:45–18:00, waits 15 min) | never | batch model: identical to today's ASAP; ceiling model: seat the whole 4 at 17:45 if headroom ≥ 4 |

### B2. A=6 @18:15, then B=4 with no time chosen (ASAP)

Batch model TODAY: ASAP = **18:00** — B cooks in the empty run-up window and waits. Ceiling model TODAY: ASAP = **18:00** too (peak 4 at 17:45). Under both rules B is whole here; the rules only differ when *no* earlier window has room, in which case R-LATER gives 18:30 and R-EARLIER-OR-LATER also gives 18:30 (nothing earlier fits). **For ASAP the two rules coincide whenever the earlier window is empty.**

### B3. An order of 12 (larger than a batch)

Batch model TODAY, empty kitchen: 18:00 → **red "too soon"** (needs windows 17:30 and 17:45; only one pre-open window allowed); **ASAP = 18:15**, seated 18:00 = 8, **17:45 = 4** — wait: the engine seats the *full* batch earliest and the *remainder* adjacent: 17:45 = 8? No — from the fixture, 12 @18:30 seats **18:00 = 8, 18:15 = 4**. Full batch earliest, remainder adjacent. Two consecutive windows. Dots: 18:15 red "8 Burgers", 18:30 amber "4 Burgers".

**"Unless it's too big" today = `ceil(N/batch)` consecutive windows, full batches first, remainder last.** That is already "as few batches as possible". Both candidate rules keep it; the only question is whether the 4-remainder window may be *shared* with another order (today: yes, 4/8 leaves room; strict keep-together: arguably no).

Ceiling model: 12 @18:30 → points @18:15 = 8, @18:00 = 4. Same shape.

### B4. Mixed order under the ceiling: 5 burgers + 3 chips (batch 4, prep 5) + 2 drinks (instant, ticked), `kitchen_capacity 8`, `capacity_window_mins 15`, all @18:15

TODAY: windows 18:00 = burgers 5 + drinks 2 (conc 7, amber), **18:10 = chips 3 (conc 8, red "global ceiling")** — the chips' 5-minute window overlaps the burgers' 15-minute one and the sweep-line counts both. Dot at 15-grid: 18:15 **red "peak 3 Chips"**. A new 4 burgers + 2 chips at 18:15 → red "Burgers 9/8"; ASAP 18:00.

**What this shows:** "together" has to be defined against **three different grids at once** — burgers on a 15-minute prep grid, chips on a 5-minute one, drinks on the capacity cadence. An order is already "together" in time (everything ready by 18:15) but not in a *batch*, because there is no single batch. Per-category keep-together is well-defined; whole-order keep-together across categories is not, unless it means "all of this order's cooking windows carry only this order", which under the ceiling is a much stronger constraint.

### B5. Event-start run-up and the pre-open pile

6 @18:00 (start): window 17:45 = 6 (pre-open run-up), pile @18:00 = 6 amber. New 4 → 18:00 red "too soon" (10 needs two pre-open windows); ASAP **18:15**. 12 @18:00: windows 17:30 = 8 and 17:45 = 4, **pile @18:00 = 12 red "over capacity at event-start"**.

Under keep-together nothing changes here: the pile is a display of load that seated pre-open, and `loadRunsOffFront` already refuses a second pre-open window. The one interaction: a keep-together rule that refuses to *share* the 17:45 run-up window with a second order would make the event-start slot fill faster (one order per run-up).

### B6. Out of order — B (4 @18:30) accepted before A (6 @18:15)

TODAY: stored `{18:30: 4, 18:15: 6}` — windows 18:00 = 6, 18:15 = 4. **Identical to A-then-B.** Acceptance order is invisible to the engine (A3). Under keep-together, ordering would matter only if the rule were applied at *projection* time to an aggregate — which is impossible without boundaries. Applied at *placement* time (each order judged against the state when it arrives), B6 stays order-independent for cooking and the placement decisions are simply sequential.

### B7. Operator override onto a full batch — 8 @18:15, operator forces +3 @18:15

TODAY: stored 11 → windows 17:45 = 8 (red, pre-open), 18:00 = 3 (amber); pile @18:00 = 8 red. Note the override *itself* is spread: 8 earliest, 3 adjacent — so the spread has silently put the **original** 8-burger batch into the run-up window and the operator's 3 into 18:00, which may be the opposite of what happened at the hatch. The engine cannot say whose units are where (A2).

Under either candidate rule an override stays an override — "confirm always, occupy always" is unchanged, and the display's honest over-subscription is unchanged. What keep-together would add is a *more truthful* breach message: with per-order data, `contributingProductionSlots` could say "A (8) and the override (3)" rather than "18:15".

### The properties, per rule

| | R-LATER | R-EARLIER-OR-LATER |
|---|---|---|
| **Can an accepted order ever move?** | **Never.** Placement happens once, at `placeOrderInSlotLocked`; edits remove-and-re-add only the edited order (`removeOrderFromProductionSlot` + `addOrderToProductionSlot`, A4/C3). | Same — never. |
| **"Unless it's too big"** | `ceil(N/batch)` consecutive windows back from the slot, full first, remainder adjacent — exactly today. Minimum count is what the spread already gives. | Same. |
| **Per category or whole order?** | Naturally **per category** (each category has its own grid); whole-order across categories under the ceiling is B4's problem. | Same. |
| **A batch with unused space** | Today's dot already shows it: amber "6 Burgers" = 6/8. A keep-together mode would need the dot to say **why** the space is unusable ("6 Burgers · reserved") or the operator will read amber as bookable and the picker will disagree. | Same, plus an early-cooked order shows in an *earlier* window than its collection dot — today's covering read (`coverDotWindows` on 10–30 grids) already handles that. |
| **Capacity cost, batch 8 / 15 min** | Fill-every-space: **32 burgers/hour** whatever the order sizes. Keep-together with a 6/4/6/4 stream: 6+4 cannot share (10 > 8) → one batch each → **4 batches × 5 avg = 20/hour, 4 orders/hour**. With a 4/4/4/4 stream: 2 per batch → 32/hour, 8 orders/hour. **Worst case (every order 5–8): one order per batch, 4 orders/hour.** | Same throughput; R-EARLIER can *sometimes* recover a batch by cooking early (B2), so slightly higher utilisation than R-LATER, at the cost of food waiting. |

---

# PART C — DESIGN OPTIONS (proposed, not built)

## C1. Where the mode lives

**Per van, beside `kitchen_capacity` and `capacity_window_mins` on `truck_vans`** — it is a property of how one kitchen cooks, and every reader already resolves the van by `event.van_id` (the slot-interval work made that path the norm). Proposed column: `truck_vans.batch_fill_mode text NOT NULL DEFAULT 'fill' CHECK (batch_fill_mode in ('fill', 'keep_together'))`. The default is the byte-identical path.

**Event-level override: not recommended now.** The three-layer resolver exists (`resolveIntervalsFor`) and the `*_override` convention is established, so it is *cheap* — but this setting changes *placement*, not selection: a customer who ordered under one mode and an operator who switches mid-event would have orders seated by two rules on one board. If it is ever wanted, it must follow Dominic's R1(d) choice from the event-override work (Manage resets this van's events).

## C2. How the engine would implement it — one seating function, default byte-identical

**The structural fact from A2 rules out the obvious design.** "Keep orders together" cannot be applied at *projection* time, because `projectBackwardOccupancy` sees totals. It can only be applied at **placement** time, in `fitOrderBackward`, where the new order *is* known whole. That is also where today's batch model already keeps a cooking order whole. So:

**Batch model — a "no-share" fit.** In keep-together mode, `fitOrderBackward` refuses a window that already carries *any* load of the order's category (rather than refusing only when `combined > batch`):

```
combined = existing + add
today:          red iff combined > batch
keep_together:  red iff existing > 0 && add > 0     (the window is someone else's batch)
```

A single `mode` parameter threaded through `buildSlotAvailability`, `earliestBackwardFitSlot` and the three client callers; `projectBackwardOccupancy` untouched. **DISPLAY == PICKER holds automatically**, because the dot reads occupancy and the picker reads the same occupancy plus the new rule — the dot shows 6/8 amber and the picker says "does not fit", which is B's whole point (the reserved-space labelling in the properties table above closes the visible gap).

⚠️ **But the projection would then be *wrong* for existing load.** With A=6 @18:15 and B=4 placed at 18:30 (keep-together), stored `{18:15: 6, 18:30: 4}` projects correctly (two windows). Fine. With A=6 @18:30 and B=6 @18:30 both accepted at *different times under different modes*, stored 12 @18:30 projects as 8 + 4 — a boundary the mode was meant to preserve, gone. **Keep-together at placement + aggregate storage is consistent only while the mode never changes mid-event and no override is placed.** Anything else needs:

**Per-order storage.** `buildUnitsFromOrders` keeps the per-order list it already iterates; the engine takes `Array<{ orderKey, slot, byCat }>` and seats each order's spread separately (identical arithmetic per order; the aggregate is the sum — which A3 shows is what today's result *is*, for any state the fit accepted). This is the honest design: it makes `contributingProductionSlots` able to name orders, makes overrides attributable, and makes the mode safe across edits. Cost: the eleven sites in A2, the snapshot (`offlineCapacity.productionSlotUnits`) and `buildOfflineOccupancy` (which already iterates orders — it need only stop merging), and a migration for a per-order `production_slot_usage` row shape or a switch to reading `orders` at fit time.

**Ceiling model — a "whole or nothing" `placeInstantPoints`.** In keep-together mode `place = headroom >= remaining ? remaining : 0` (seat all or move on), with the walk continuing earlier (R-EARLIER) and `earliestBackwardFitSlot` continuing later (R-LATER). One flag on the existing function; the "identical rule in both engine callers" invariant must be kept (the do-not-undo in its header), so the flag goes to both `projectBackwardOccupancy`'s existing-load placement and `fitOrderBackward`'s. ⚠️ For *existing* load the same aggregate problem applies: 10 stored at 18:15 will be placed whole-or-nothing as **10**, not as 6 and 4 — per-order storage is needed here too, or the projection of existing load stays in fill mode while only new placement keeps together (a defensible, smaller build: existing load's *exact* window is display-only for instant items anyway).

**The offline path** gets whichever shape the server ships in `offlineCapacity.productionSlotUnits`; `buildOfflineOccupancy` folds queued offline creates through the same helpers and would keep per-order entries rather than merging.

## C3. Interactions

| With | Effect |
|---|---|
| **Slot-interval "peak" dots** (10–30 grids) | Unchanged. `coverDotWindows` covers whatever windows exist; a keep-together batch with 6/8 shows "peak 6 Burgers" exactly as now. The reserved-space label is the only addition. |
| **Pre-open pile** | Unchanged; display-only. A no-share rule makes the single run-up window one-order-only, so the event-start slot fills after one order — worth a line in the setting's help. |
| **`excludeOrderKey`** | Unchanged and *helpful*: it already filters by `order_key` before the merge, so per-order storage is a natural extension of the same path. The §31 DO-NOT (never pass it to writers/readers) stands. |
| **Capacity breaches** | `detectCapacityBreaches` reads `remainingTotal`/`remainingByCat` from the projection — unaffected. With per-order data its "orders to move" list becomes accurate for the first time. |
| **Edits and cancellations** | `removeOrderFromProductionSlot` + `addOrderToProductionSlot` touch only the edited order; cancel/reject call `removeOrderFromProductionSlot`; nothing ever re-places another order. **Freeing space never pulls a later order forward** — today or under either rule. (Reseeds and `rebuildProductionSlotUsage` recompute *occupancy* from stored `orders.slot`; they never change a slot.) |
| **Offline outbox** | A queued `create` replays through the `manual` action — which bypasses capacity anyway (A4). The client-side confirm check runs `fitOrderBackward` against the cached snapshot; it would need the mode in the snapshot to check correctly offline. |
| **§31 worked examples** | All are single-order or override cases at batch 2 — **byte-identical in default mode** (the engine-identity harness already proves this for the working tree; the same harness extends to mode `'fill'`). Under `keep_together` the "2 pizzas + 2 desserts / 1 pizza + 3 desserts" ceiling examples still hold (they are single orders); the "17:00 & 17:05 full, add 2 pizzas + 7 desserts" example changes — the 7th dessert can no longer top up a shared window. |

## C4. Gusto safety

Gusto LIVE: Pizza batch 2 / prep 5, van `kitchen_capacity 2 / capacity_window_mins 5`, 6 `production_slot_usage` rows, all events following its van at 5/5. The default `'fill'` must leave every surface byte-identical:

| Surface | How it stays identical |
|---|---|
| `/api/slots` (customer picker, ASAP, `capacityInputs`) | mode read by a separate probed select (`readVanBatchMode`, the named-select rule); `'fill'` ⇒ `fitOrderBackward` takes today's branch, a literal no-op |
| `/api/dashboard` (grid, dots, breaches, snapshot) | same read; `projectBackwardOccupancy` untouched in either mode (batch model); `placeInstantPoints` flag off |
| `placeOrderInSlotLocked` (submit, `promoteDraft`) | same `earliestBackwardFitSlot`, mode `'fill'` ⇒ identical walk |
| `AddOrderPanel` confirm check, edit picker | same client engine, mode from `capacityInputs` — absent ⇒ `'fill'` |
| Manage → Kitchen capacity | one new radio pair, default "Fill every space", shown to Gusto; **no write until changed** |
| the `manual` branch | untouched — it never runs the fit |
| `production_slot_usage` | unchanged shape in the minimal build; changed shape only in the per-order design, which must reseed identically (A3 proves the sum is the same) |

**The one Gusto-visible change is the radio in Manage.** Everything else is gated on a stored value no van holds.

## C5. Proof plan

| Harness | Proves | Broken variant (must FAIL first) |
|---|---|---|
| `scripts/batch-mode-identity.cjs` | `projectBackwardOccupancy`, `fitOrderBackward`, `earliestBackwardFitSlot`, `buildSlotIndicators` compiled from a `git worktree` of HEAD and from the working tree give **byte-identical JSON** in default mode over all §31 worked examples, the B1–B7 fixtures, Gusto-shaped fixtures (batch 2 / prep 5 / kc 2), and a 60-case seeded sweep — the same pattern as `slot-interval-engine-identity.cjs` | mode `'keep_together'` forced on ⇒ B1 differs |
| `scripts/batch-keep-together.cjs` | B1–B7 under the chosen rule: B never split; A never moves; 12 uses two consecutive windows; B6 order-independent; override unchanged; the reserved-space label; ceiling-model whole-or-nothing | (a) a window shared when `existing > 0`; (b) an accepted order re-placed after a cancellation; (c) `placeInstantPoints` seating a partial |
| `scripts/batch-mode-routing.cjs` | every reader resolves the mode from the event's van by the same `van_id` path; customer and operator paths agree; the snapshot carries it; default when absent is `'fill'` | mode read from the truck instead of the van |
| `scripts/batch-mode-settings.cjs` | `update_van_settings` allowlist + validation; `get_vans` main select **does not** name the column (van-list tolerance); the Manage copy exactly as decided | column added to `get_vans`' main select |
| *(if per-order storage)* `scripts/batch-per-order-reseed.cjs` | the per-order rebuild sums to today's aggregate for every LIVE-shaped fixture; `excludeOrderKey` still excludes exactly one order | merge reinstated ⇒ boundaries lost |

**Live test-truck checks** (never Gusto): Van1 Pizza is already 900/8. Set the mode, place A=6 @18:15 from the customer page, B=4 @18:15 → confirm B is offered 18:30 and the dots read 6/8 and 4/8; place 12 → two windows; cancel A → B stays at 18:30; operator override onto a full batch → breach banner names the right load; switch back to "Fill every space" → identical to before.

## C6. Size and risk

**Minimal build (batch model, placement-only, aggregate storage kept):** one column, one probed read, one parameter through `fitOrderBackward` → `buildSlotAvailability` / `earliestBackwardFitSlot` and their five callers, one Manage radio, one dot label. **`projectBackwardOccupancy`, the sweep-line, the pile and `loadRunsOffFront` untouched** — but `fitOrderBackward` is one of the nine byte-identity symbols, so the identity harness would move to "identical in default mode" rather than "identical bytes". Roughly a third the size of the slot-interval work.

**Full build (per-order storage):** the eleven A2 sites, a storage migration, the snapshot shape, `buildOfflineOccupancy`, and a reseed proof. Two to three times the minimal build, and it touches `buildUnitsFromOrders` / `rebuildProductionSlotUsage` — two more identity symbols.

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | 🔴 **The premise is model-dependent** (the reframing above): building "keep together" for a batch-modelled truck changes nothing a customer sees, and building "fill every space" would *relax* a ceiling that is enforced today | High until Decision 0 is answered | Wasted build, or a capacity relaxation on a live truck | Decision 0 first; confirm the burger truck's actual categories |
| R2 | Aggregate storage silently loses the boundary the mode promises (mode change mid-event, overrides, B7) | Medium | The board shows a split the rule said would not happen | Per-order storage, or a documented "placement-only" scope |
| R3 | DISPLAY ≠ PICKER: amber 6/8 reads as bookable while the picker refuses | High without the label | Operator confusion, support load | The reserved-space label from the properties table; the dot harness |
| R4 | Throughput collapse under keep-together with mid-size orders (4 orders/hour worst case, B properties table) | Certain when enabled | Fewer orders per service — by the operator's choice | State the cost in the setting's help; it is the point of the setting |
| R5 | `fitOrderBackward` is a byte-identity symbol | Certain | Every existing harness that asserts identical bytes needs re-scoping to "identical in default mode" | Do it deliberately, in the identity harness, before the edit |
| R6 | The ceiling-model change alters `placeInstantPoints`, whose header carries a do-not-undo ("identical rule in both engine callers") | Medium | Placement and recorded occupancy spill differently | One flag, applied in both callers, proven by the keep-together harness |
| R7 | Offline confirm check runs without the mode | Medium | An offline operator order judged under the wrong rule (advisory only — never blocks) | Ship the mode in the snapshot's `capacityInputs` |

## C7. Decisions for Dominic

**Decision 0 — which model is the burger truck on, and therefore which rule is new?**
- (a) **Category batch** (prep 15, batch 8 — as `test-truck` is LIVE). Today already keeps a new order whole; "Fill every space" would be a **new** relaxation. *Recommendation:* if this is the truck, the feature as worded is unnecessary — what may be wanted is the *reverse* opt-in, and its capacity gain is real (32 vs ~20 burgers/hour) but it is a loosening of a ceiling the truck chose.
- (b) **Kitchen ceiling** (burgers instant + ticked, kc 8, cwm 15). Today splits; "Keep together" is the new rule as described. *Recommendation:* if this is the truck, build the ceiling-model whole-or-nothing, and consider whether the truck should simply be re-configured to (a) — which gives keep-together for free and is how every other cooking truck is modelled.
- **I cannot tell which from the repository or the database** (§"Could not establish"). Ask the truck.

**Decision 1 — R-LATER vs R-EARLIER-OR-LATER.** *Recommendation: R-LATER for a requested slot, earliest-fit for ASAP* — which is precisely today's split of behaviour (`placeOrderInSlotLocked` walks forward from a request; ASAP walks from the now-floor). It respects the customer's stated time and never cooks food to wait. R-EARLIER recovers a little throughput (B2) at the cost of food sitting, and makes an order show in a window before its dot.

**Decision 2 — per category or whole order.** *Recommendation: per category.* Each category has its own grid (B4); "whole order" across categories under the ceiling is a much stronger and less predictable constraint, and mixed orders are already "together in time".

**Decision 3 — per van only, or also per event.** *Recommendation: per van only.* It is a placement rule, not a selection convenience; two rules on one board is the failure mode.

**Decision 4 — placement-only (aggregate storage) or per-order storage.** *Recommendation: placement-only first, per-order storage as the next stage* — it makes the minimal build safe to ship and proves the rule on a real service before the storage boundary moves. State the scope plainly in the setting's help.

**Decision 5 — the wording, once the rule is chosen.** For (a)+R-LATER, the honest pair is:
- **"Fill every space"** — *Orders can share a batch. A big order that doesn't fit spreads across batches.* *(default, today)*
- **"One order per batch"** — *Each order cooks in its own batch, unless it's bigger than one. Fewer orders per hour.*
"Keep orders together" over-promises for a batch-modelled truck, where orders are already kept together; the difference the setting actually makes is *sharing*. For (b) the original wording is accurate.

---

# MANUAL SECTIONS THAT ARE STALE

`docs/reference-manual.md` is **not edited**.

1. **§31 "Backward cooking-spread"** — should state explicitly that the spread is applied to a **per-slot aggregate** and that order boundaries are not known to the engine (the code comment in `contributingProductionSlots` says it; the manual does not).
2. **§31 "The two ceilings"** — should record that the ceiling path (`placeInstantPoints`) **can split an order** across capacity windows while the batch path never does. That asymmetry is the whole subject of this request and is undocumented.
3. **§6 "Batch logic"** — *"If batch 2 has space, new items slot into batch 2 and finish alongside it"* describes sharing, which is true; it should add that a cooking order is seated whole or refused, so "new items slot into batch 2" never means part of an order.
4. **§31 file list** — `slot_bookings` (18 LIVE rows) is dead and referenced only by `lib/delete-truck.ts`; worth a line so nobody treats it as a per-order record.
5. **§10 capacity copy** — the pending `KITCHEN_CAPACITY_DESC` simplification is still marked pending.
6. The slot-interval reports' stale items (van-level intervals, event overrides, the named-select rule) still stand.

---

# WHAT I COULD NOT ESTABLISH

1. 🔴 **Which model the burger truck uses.** No truck in the database has a category literally named "Burgers" at batch 8 — `test-truck`'s Pizza (900/8) is the only 8-per-15 configuration and it is the batch model. The demo trucks' Burgers are 300/4. If Dominic's truck is a prospect not yet provisioned, its configuration does not exist to read.
2. **Whether Dominic observed the split on the dashboard or reasoned it.** Under the batch model the split he describes cannot occur at placement; it can appear on the *dots* only after an operator override (B7).
3. **What "8 burgers per batch" means physically** — one grill holding 8, or throughput. The batch model assumes the former (a 15-minute cook); the ceiling model the latter.
4. **Whether any live event has ever had two orders share a slot under the ceiling model** — no truck currently has a ticked instant category *and* a ceiling with a non-5 window, so the split path has likely never run in production.
5. **The exact operator wording** — deferred to Decision 5.
6. **Real throughput** — the orders/hour figures are arithmetic on the fixture, not observed.

---

**Nothing was changed.** No code, no migration, no database write; `git status` is byte-identical to §0 apart from this report.
