# Slot interval — full investigation (no code changed, nothing written to any database)

**Date:** 16 September 2026 · **HEAD:** `8964845` ("whatsapp change") · **Read-only.**

**No span of the prompt arrived garbled.** One premise in the brief does not hold and is corrected at the top of Part A: the interval columns are **per-truck, not per-event**. **No instruction contradicted another.**

🟢 **Gusto IS on 5 today** (LIVE, §A3). A default of 5 keeps every Gusto surface byte-identical, provided the build reads the existing column (§E1). No decision is forced on that point.

---

## 0. git status

```
On branch main — up to date with 'origin/main'
Changes not staged for commit:
	modified:   app/api/admin/outreach/route.ts
	modified:   components/admin/ComposeWindow.tsx
	modified:   components/admin/OutreachPanel.tsx
	modified:   docs/reference-manual.md
	modified:   lib/outreach-filter.ts
	modified:   lib/outreach-step.ts
Untracked files:
	docs/manual-v13-4-report.md
	docs/outreach-console-v13-5-report.md
	docs/outreach-console-v13-5b-report.md
	docs/outreach-logo-latch-report.md
	scripts/outreach-channel-for.cjs … scripts/outreach-upload-refresh.cjs   (7 files)
```

All of it is the outreach workstream, as the brief anticipated. **This investigation touched none of it.** Nothing staged, committed, stashed, reset or restored.

---

## SQL — how it was run, and every query

🔴 **The project exposes no SQL endpoint** (no `exec_sql`-style RPC; PostgREST does not serve `information_schema`). So every query below is shown as the SQL that answers the question, and was **executed through its exact read-only PostgREST equivalent** (GET only, service role): the schema questions through PostgREST's **OpenAPI document**, which *is* its live schema cache, and the row questions through table selects with any grouping done on the returned rows. **Every figure is labelled LIVE or FIXTURE.**

⚠️ **One caveat on nullability.** PostgREST's OpenAPI marks a column "required" by its own convention, which is not a direct read of `information_schema.columns.is_nullable`. Where nullability matters below I cite the migration file, which is authoritative.

---

## PART A — WHERE THE INTERVAL LIVES TODAY

### A1. Every matching column in `public`

```sql
select columns.table_name, columns.column_name, columns.data_type,
       columns.is_nullable, columns.column_default
from   information_schema.columns
where  columns.table_schema = 'public'
and    columns.column_name ~* 'interval|slot_duration|collection|prep|capacity|batch'
order  by columns.table_name, columns.column_name;
```

**LIVE — 70 tables exposed, 10 matching columns:**

| table | column | type | null | default |
|---|---|---|---|---|
| `collection_times` | `collection_time` | text | NOT NULL | — |
| `menu_categories` | `batch_size` | integer | null | **2** |
| `menu_categories` | `counts_toward_capacity` | boolean | NOT NULL | false |
| `menu_categories` | `prep_secs` | integer | null | **240** |
| `orders` | `capacity_ack_at` | timestamptz | null | — |
| `slot_bookings` | `collection_time` | text | NOT NULL | — |
| `truck_vans` | `capacity_window_mins` | integer | **NOT NULL** (migration `20260612`: `CHECK 1–20`) | **5** |
| `truck_vans` | `kitchen_capacity` | integer | null | — |
| **`trucks`** | **`collection_interval_mins`** | integer | null | **5** |
| **`trucks`** | **`slot_duration_mins`** | integer | null | **10** |

🔴 **Correction to the brief: there is no event-level interval.** `truck_events` (41 columns, listed in full during the run) carries **no** interval, slot or cadence column. The two interval columns are on **`trucks`**. The brief's D3 phrase "the existing per-event `collection_interval_mins`" describes a column that does not exist; the manual's §4 (line 6891) already records "slot cadence" as **truck-wide**, with per-event overrides *deferred*.

⚠️ A **third grid** exists outside the pattern: **`slot_capacity`** (keyed `truck_id, event_date, slot`), written by `upsert_event` and `save_slot_capacity` in `app/api/manage/route.ts` on a **hard-coded 5** — see A5.

### A2. Every reader and writer of the columns

**`trucks.collection_interval_mins` / `trucks.slot_duration_mins`** — the pattern everywhere is `interval = truck.collection_interval_mins ?? 0; slotDuration = truck.slot_duration_mins ?? interval`:

| Where (symbol) | Role | What it does |
|---|---|---|
| `generateCollectionTimes` (`lib/slot-generation.ts`) | **the one grid generator** | walks `start → end + grace` in `intervalMins` steps; `production_slot = floor(mins / slotDurationMins) · slotDurationMins` |
| `/api/slots/[truckId]` `GET` | reader → generator | selects **only** `'id, collection_interval_mins, slot_duration_mins'`; `GRACE_MINS = 30`; falls back to `collection_times` rows when `interval = 0` or no event times |
| `/api/dashboard` `GET` | reader → generator | selects `trucks.*`; same generator, `GRACE_MINS = 30`; **no static fallback**; feeds the day-load strip |
| `placeOrderInSlotLocked` (`lib/orders/place-in-slot.ts`) | reader → generator | server placement for **both** customer paths |
| `/api/orders/submit` `POST` | passes through | into `placeOrderInSlotLocked` |
| `promoteDraft` (`lib/payments/promote-draft.ts`) | passes through | the card path, same call |
| `seedDemoOrders` (`lib/seed-demo-orders.ts`) | reader → generator | "the SAME `generateCollectionTimes` the dashboard uses" |
| `Truck` type (`lib/supabase.ts`) | type | both declared `number` |
| `provisionTruck` (`lib/provision-truck.ts`) | **omits both** | rows get the DB defaults 5 / 10 |
| `scripts/seed-thai-kitchen-screenshots.sql` | asserts | `raise exception` unless `interval ∈ (5,10)` |

🔴 **There is NO application writer of either column.** No UI, no route, no allowlist entry. `update_truck`'s allowlist (`app/api/manage/route.ts`, the "array allowlist" at :854) does not name them. Today they are **constants set by DB default** — which is why all 12 trucks agree (§A3). A new setting therefore has an obvious home: expose the column that every generator already reads.

**`truck_vans.capacity_window_mins`** (the global ceiling's cooking cadence, a *different axis*):

| Where (symbol) | Role |
|---|---|
| `buildSlotAvailability`, `projectBackwardOccupancy`, `earliestBackwardFitSlot` (`lib/slot-availability.ts`) | **engine input** — where INSTANT items are seated on the capacity cadence (:477, :675) |
| `eventKitchenCapacity` (`lib/orders/place-in-slot.ts`) | reads by the event's `van_id`, `?? 5` |
| `/api/slots`, `/api/dashboard` | read by `van_id`, `?? 5` |
| `update_van_settings` (`app/api/manage/route.ts`) | **writer** — from Settings → Kitchen capacity |
| `updateVanSetting` (`app/manage/[token]/page.tsx`) | the Settings control (1–20) |
| `provisionTruck` | omitted → DB default 5 |
| `seedDemoOrders` | reads, `?? 5` |

`truck_vans.kitchen_capacity` has the same reader/writer set. `menu_categories.prep_secs` / `batch_size` reach the engine as `catConfigs` via `/api/slots` and `/api/dashboard`.

**Not read by anything in this list:** the scraper bridge (it writes event **times**, not intervals — see E2), the KDS (renders order `slot` strings — see B4), the schedule importer (event times only).

### A3. LIVE distribution, and Gusto

```sql
select trucks.collection_interval_mins, trucks.slot_duration_mins, count(*) as n
from   public.trucks
group  by trucks.collection_interval_mins, trucks.slot_duration_mins;
```
**LIVE — 12 trucks: `(5, 10)` × 12.** Every truck, every plan, identical.

```sql
select trucks.id, trucks.plan, trucks.active,
       trucks.collection_interval_mins, trucks.slot_duration_mins
from   public.trucks
where  trucks.id = 'pizzeria-gusto';
```
**LIVE — `pizzeria-gusto` · trial · active · `collection_interval_mins = 5` · `slot_duration_mins = 10`.**

🟢 **Gusto is on 5 today.** There are no Gusto event rows to list for this column, because **events carry no interval** (A1). Gusto's van:

```sql
select truck_vans.id, truck_vans.name, truck_vans.kitchen_capacity, truck_vans.capacity_window_mins
from   public.truck_vans
where  truck_vans.truck_id = 'pizzeria-gusto';
```
**LIVE — one van, "Van1": `kitchen_capacity = 2`, `capacity_window_mins = 5`.**

```sql
select truck_vans.truck_id, truck_vans.name, truck_vans.kitchen_capacity, truck_vans.capacity_window_mins
from   public.truck_vans
order  by truck_vans.truck_id;
```
**LIVE — 13 vans: `capacity_window_mins = 5` on 12, and `10` on `test-truck` "Van1"** (which has `kitchen_capacity = null`). `kitchen_capacity` is set on three vans: Gusto 2, `test-truck-3-2` 2, `test-truck` "Van2" 8.

### A4. `collection_times` is empty

```sql
select count(*) as rows,
       count(*) filter (where collection_times.production_slot like '%-%') as range_rows,
       count(*) filter (where collection_times.production_slot <> collection_times.collection_time) as non_identity
from   public.collection_times;
```
**LIVE — 0 rows, 0 range rows, 0 non-identity.** §31 holds trivially: `timeMap` is empty everywhere, so every storage key is the `collection_time` itself.

### A5. The hardcoded 5s — selection grid or cooking step?

| Site (symbol) | What it is | Verdict |
|---|---|---|
| `MINUTES` and `availableMinutes` — `app/trucks/[slug]/order/page.tsx` | `['00','05',…,'55']`; narrowed by event start/end, **never generated from the interval**. Used **only as the fallback** when `/api/slots` returned no `slots` (`slots.length ? slots.map(…) : availableHours.flatMap(availableMinutes…)`) | **SELECTION grid — in scope.** A parallel, clock-anchored generator. |
| `MINUTE_OPTIONS` in `EventTimeSelect` — `app/manage/[token]/page.tsx` | event **start/end** minute list, step 5, with a 🔴 *"DO NOT MAKE THIS CONFIGURABLE"* comment whose reasoning is exactly the customer-fallback parity above | **EVENT-TIME grid — adjacent, not the collection grid.** It is what keeps every start a multiple of 5, which is what makes the fallback agree with the server. At 15 it would need to become a multiple-of-the-interval guard, or the disjoint case returns. |
| `backwardWindowStepMins` — `lib/slot-availability.ts` | `min(round(prep_secs/60))` over prep categories — the cooking-window step the dots read with (`slotMins − step`) | **COOKING/ENGINE step — out of scope, must not change.** |
| `truck_vans.capacity_window_mins` (`?? 5` in three readers) | the global ceiling's own cadence | **COOKING/ENGINE — out of scope.** |
| `generateSlots(start_time, end_time, 5)` in `upsert_event`; `SLOT_INTERVAL_MINS = 5` in `provisionDemoEvent` | a **second generator** (`lib/slots.ts`) writing `slot_capacity` rows, hard-coded 5 | **A legacy SELECTION-ish grid.** Readers found: demo/provisioning **counts** only; `app/api/events/action/route.ts:73` records that the manual's §14 claim about it is stale. ⚠️ Not consumed by the engine, but keyed by `slot`, so it would silently sit on the wrong grid. |
| `GRACE_MINS = 30` (`/api/slots`, `/api/dashboard`) | grace slots after `end_time`, **on the interval** | selection — follows the interval automatically |
| "Ready around" gridding — `queueAwareGridSlot` in `AddOrderPanel` | first `manualSlots` time ≥ the ungridded estimate — grids to **the server grid**, not to 5 | selection — **follows the interval automatically** |
| The flat "+5 lead" | **gone** (V7.1) — comments only (`slot-availability.ts:148`, `slot-utils.ts:18`) | nothing to change |
| `seed-demo-orders.ts:44` "(170 / 5) + 1 = 35" | a comment; the code reads the truck's interval | nothing to change |

---

## PART B — HOW SELECTABLE TIMES ARE PRODUCED AND CONSUMED

### B1. End to end

**(a) Customer web** — `/api/slots/[truckId]` builds `times` with `generateCollectionTimes(eventStart, eventEnd, interval, slotDuration, 30)` and runs `buildSlotAvailability` over them; the page renders `slots` filtered to `available` and `≥ asapTime`. **Generator: the server's.** ⚠️ **The fallback is a parallel list**: with no server `slots`, the page renders `availableHours × availableMinutes` — clock-anchored 5-minute minutes. Client and server **do not share one generator** on that branch.

**(b) Operator dashboard / AddOrderPanel (web and native iPad/Android — the same component)** — `apiSlots` from `/api/slots`; **offline fallback** `offlineForThisEvent.slots`, which is the **cached server grid** written by `truckSnapshot.ts` "after a SUCCESSFUL `/api/dashboard`". `/api/dashboard` generates its own copy for the day-load strip with the same function. **No client generation anywhere on the operator path.**

**(c) ASAP** — customer: `backwardAsap || asapSlot || customerAsapTime` (the last is an *estimate*, shown only when no real slot exists). Operator: `adjustedAsapSlot` = `earliestBackwardFitSlot(manualSlots…)`. Server: `placeOrderInSlotLocked` resolves `startSlot = requestedSlot ?? getAsapSlot(times…)` then `earliestBackwardFitSlot(times…)`. **All three iterate the generated grid.**

**(d) Server validation — 🔴 the server does NOT reject an off-grid time; it accepts it *without a capacity check*.** `placeOrderInSlotLocked`:

```ts
const startEntry = times.find(t => t.collection_time === startSlot)
// Unrecognised slot (not in the list) → confirm at requested, no capacity check (Section 5).
if (!startEntry) {
  return { finalSlot: startSlot, booked: true }
}
```

The customer sees a **confirmed** order at the time they asked for. The manual's §4 says the same ("Unrecognised slot → short-circuits to confirm"). ⚠️ The manual's §4 line 6646 — "a full window returns 409, order never created" — is **contradicted by the code**: `placeOrderInSlotLocked` "**Never rejects: full → pending/unbooked**". Both `/api/orders/submit` and `promoteDraft` call it identically, so cash and card customers are treated the same.

### B2. Anchoring — event start, not the clock

`generateCollectionTimes` is `for (mins = start; mins <= end + grace; mins += intervalMins)`. **Anchored to the event start.** The customer fallback is anchored to the **clock**.

| start | server @5 (today) | client fallback @5 | server @15 (by reading the code) | client fallback @15 (unchanged) | agree? |
|---|---|---|---|---|---|
| 12:00 | 12:00, 12:05, 12:10 … | 12:00, 12:05, 12:10 … | 12:00, 12:15, 12:30 … | 12:00, **12:05**, 12:10 … | ❌ fallback offers times the server never generates |
| 12:05 | 12:05, 12:10 … | 12:05, 12:10 … | **12:05, 12:20, 12:35** … | 12:05, **12:10**, 12:15 … | ❌ disjoint after the first |
| 16:35 | 16:35, 16:40 … | 16:35, 16:40 … | **16:35, 16:50, 17:05** … | 16:35, **16:40** … | ❌ disjoint after the first |

At 5 the two agree **iff the start minute is a multiple of 5**, which `EventTimeSelect` enforces for manual edits — but **not** for the scraper bridge (E2). At 15, **every start that is not a multiple of 15 produces a server grid on :05/:20/:35 or :35/:50/:05** — legal, but not what an operator choosing "15 minutes" pictures — and the fallback disagrees whenever it is used at all. **Every place that would disagree:** the customer page's fallback branch; `EventTimeSelect`'s 5-step guarantee (no longer sufficient); `upsert_event`'s hard-coded-5 `slot_capacity`; and any client that cached a 5-grid before the change (E2). **The V11.15 class, exactly.**

### B3. ASAP and "Ready around" stay on-grid

`earliestBackwardFitSlot` sorts `times` and returns `t.collection_time` — **it cannot return a time that is not in the grid it was given.** `getAsapSlot` takes the slot list. So ASAP at 15 is on the 15-grid by construction. "Ready around" is a *readout*: `queueAware.readyTime` is deliberately **ungridded** (honest-early, e.g. 17:13) and shown only when `queueAwareGridSlot === fitReadyTime`, so a displayed ready time can be off-grid **by design** while the slot never is. The one off-grid candidate is `customerAsapTime`, an estimate, last-resort only.

### B4. Existing off-grid orders after switching to 15

Storage is keyed by `collection_time`: `buildUnitsFromOrders` writes `productionSlot = timeMap[ct] || ct` (= `ct`, since `collection_times` is empty), `slot_bookings.collection_time`, and `orders.slot`. An 18:05 order keeps `slot = '18:05'` and a `production_slot_usage` row at `18:05`.

- **Engine:** `projectBackwardOccupancy(productionSlotUnits, …)` iterates **every stored key** regardless of the displayed grid — the 18:05 order's cooking load is still seated (windows ending ≤ 18:05) and still counts against every later fit. ✅ Capacity is not lost.
- **Dots (C1):** those windows may sit on **no displayed dot**. 🔴 See the C1 fixture.
- **Dashboard / order card / KDS / buzzer / reports:** `slot` is a plain `HH:MM` string; `components/dashboard/helpers.ts` computes minutes-until from it. Nothing keys a display on grid membership, so an 18:05 card renders as 18:05. ⚠️ **KDS not established** — no direct `slot`/`collection_time` read was found under `app/kds`, so I cannot cite where it renders the time.
- **Re-placement:** if such an order is edited or replayed through `placeOrderInSlotLocked`, 18:05 is now **unrecognised → confirmed with no capacity check** (B1d).

---

## PART C — THE CAPACITY DISPLAY ON A WIDER GRID

### C1. What a dot reads, and the load that would appear on no dot

Both readers are the same line: `buildSlotAvailability`'s no-basket branch and `buildSlotIndicators`:

```ts
const w = back.pileByStart.get(slotMins) ?? back.byStart.get(slotMins - step) ?? null
```

with `step = backwardWindowStepMins(catConfigs)` — the **finest prep cadence** (5 for a 5-minute prep). A dot at T reads **one** cooking window, the one **ending at T**. Cooking windows stay prep-length whatever the grid.

**FIXTURE — prep 5, batch 2, 3 pizzas collected at 18:10, displayed grid 15 (18:00, 18:15, 18:30):**

| cooking window (start → end) | load (engine, `byStart`) | read by which 15-grid dot? |
|---|---|---|
| 17:55 → 18:00 | 0 | **18:00** (reads `byStart(17:55)`) → 🟢 |
| 18:00 → 18:05 | **2 pizzas** (full batch) | **none** |
| 18:05 → 18:10 | **1 pizza** (remainder) | **none** |
| 18:10 → 18:15 | 0 | **18:15** (reads `byStart(18:10)`) → 🟢 |

🔴 **Three pizzas cooking, batch 2 hit — both dots green.** Two of every three cooking windows are on no dot; the single-window read was correct only because the grid step equalled the cooking step. **This is the parallel-model hazard §31 warns about, arrived at from the display side.**

### C2. The pre-open pile-up when the event start is not a displayed time

`pileByStart` is keyed on **`eventStartMins`** and is read by `pileByStart.get(slotMins)` — it lands **only** on a dot whose time equals the event start. Because `generateCollectionTimes` is **anchored to the event start**, the event-start slot is always the first slot, so today the pile dot always exists. ⚠️ **If anchoring moved to the clock** (a 16:35 start with dots at 16:30/16:45), there would be **no 16:35 dot and the pile-up would be invisible** — "over capacity at event-start" would vanish from the strip. **The anchoring decision (E4) and the pile-up are coupled.**

### C3. Two representations for a wider dot — both READ the engine, add nothing

Let a displayed dot at T cover the windows starting in `(T_prev, T]`, stepping by `step` (i.e. `byStart.get(T_prev + step … T)`).

**(i) Worst tone, peak total across the covered windows.** Tone = the worst `w.tone` in the span; count/label = the window with the greatest `w.total` (ties: the latest). *Reads* `back.byStart` at each covered start; *computes* nothing new. §31 worked examples: 3 pizzas @ 17:05 / batch 2 on a 15-grid → the 17:15 dot covers 17:00→17:15: windows 17:00 (2, red) and 17:05 (1, amber) → **RED, "2 Pizzas"**. The 6-pizza event-start pile stays on the event-start dot via `pileByStart` unchanged → **red / 6**. *What could go wrong:* an operator reads "2 Pizzas" on a dot that spans three windows and thinks 2 is the span's total; the label must say **"peak"** or the tooltip must list the windows.

**(ii) Sum of `byCat` across the covered windows, tone from the worst window.** Label = the span's total cooking (3 pizzas), tone as (i). Also pure reads. *What could go wrong:* 🔴 **a sum across windows is not a concurrency** — three windows of 2 sum to 6 that never cooked at once, so "6 Pizzas" beside "batch 2" reads as over capacity when it is not. Legible as throughput, misleading as load. **I do not recommend (ii) as the primary read.**

**(iii, mentioned for completeness) Keep the single-window read and add a "hidden windows" marker** when any uncovered window in the span is non-green. Cheapest, honest, but replaces information with a warning.

**Recommendation: (i)**, keeping `pileByStart` exactly as is, with the label wording made explicit. Both (i) and (ii) must use the **same** covered-window set in `buildSlotAvailability` and `buildSlotIndicators`, or the API dot and the strip diverge — the §38/§39 lesson.

---

## PART D — THE SETTING ITSELF

### D1. Where kitchen capacity lives and how it reaches the engine

Manage → Settings → **Kitchen capacity** (`app/manage/[token]/page.tsx`, the section around `updateVanSetting`): per **van**, `kitchen_capacity` (1–20+) and `capacity_window_mins` (1–20). `updateVanSetting(vanId, field, value)` → `api('update_van_settings')` → `app/api/manage/route.ts` `update_van_settings` → `truck_vans.update(...)`. The engine reads them **by the event's `van_id`**: `eventKitchenCapacity` (placement), `/api/slots` (:243), `/api/dashboard` (:594), each `?? 5` for the window. The route's own comment: *"ADD NEW SETTINGS IN BOTH PLACES: here AND in `get_vans`' named select above, or the value writes but never reads back."*

### D2. The V8.9 trap — every subset a new setting must be added to

| Consumer (B1) | Route / select | Subset? | Needs the new setting added? |
|---|---|---|---|
| customer page grid | `/api/slots/[truckId]` — `cols = 'id, collection_interval_mins, slot_duration_mins'` | **hand-picked** | **YES** if a new column; **no** if the existing column is reused |
| customer page flags | `/api/menu/[truckId]` — `trucks.select('*')` | `*` | reaches automatically |
| dashboard strip + AddOrderPanel | `/api/dashboard` — `trucks.select('*')` | `*` | reaches automatically |
| placement (cash + card) | `placeOrderInSlotLocked` — passed `truck.*` values from submit / promote-draft | the callers read the truck row | reuse → nothing; new column → add to both callers' reads |
| Settings read-back (if per-van) | `get_vans` named select (`app/api/manage/route.ts:1827`) | **hand-picked** | YES, per the route's own warning |
| Settings write | `update_truck` allowlist (:854) or `update_van_settings` | **allowlists** | **YES** — a key not named is dropped silently |
| native cached payload | `truckSnapshot.ts` caches `/api/dashboard`'s response | `*` | reaches automatically **on the next successful dashboard read**; an older build ignores unknown fields |
| demo seeder | `seedDemoOrders` selects `'collection_interval_mins, slot_duration_mins'` | **hand-picked** | reuse → nothing |
| `Truck` type | `lib/supabase.ts` | type | add if new |

### D3. Per-truck vs per-van vs per-event — where it should live

**Recommendation: reuse `trucks.collection_interval_mins` as the setting.** Every generator already reads it; it has no writer today (A2), so exposing it in Kitchen capacity settings with the choices 5/10/15/20/30 changes **no read path**. `slot_duration_mins` should be **set equal to the interval** in the same write (or documented dead): with `collection_times` empty the storage key is `ct`, and dots read `productionSlotUnits[s.collection_time]` — so `production_slot` is unused for keys today, but a 15-interval on a 10-duration would recreate the V-era "collapsed key" shape the day-load off-by-one came from.

- **Per-van** would need a new `truck_vans` column, and `/api/slots` resolves the van only via the event — a truck with no event has no van to read. `capacity_window_mins` is the wrong column to overload: it is a cooking cadence.
- **Per-event** was contemplated and **deferred** (§4:6891). Nothing stores a grid per event; it is regenerated at read time from truck + event times.
- **Existing events:** nothing is stored, so the new grid appears **immediately** on the next read for every event, past and future. **A live event:** existing orders keep their `slot` strings (B4); new customers see the new grid; off-grid orders' load is seated but may sit on no dot (C1) — which is why C3 must ship with the setting, not after it.

### D4. Plan gating

`lib/features.ts` carries **`time_slot_selection`** (Pro+) and nothing for kitchen capacity or cadence. Kitchen capacity and `capacity_window_mins` are **ungated** today. **Recommendation: do not gate.** `TRIAL_FEATURES` includes everything, so a gate protects no live truck; and this is a kitchen setting in the same section as an ungated one. ⚠️ Note that the customer *picker* is gated by `time_selection_enabled` (Pro+): for a truck without it the customer only sees ASAP — the interval still governs which time ASAP resolves to.

### D5. Provisioning and demos

`provisionTruck` omits both columns → DB defaults **5 / 10**; demos are provisioned the same way; `provisionDemoEvent` uses its own `SLOT_INTERVAL_MINS = 5` for `slot_capacity`. **The setting's default must be 5**, which is what every row already holds. If the choice moves to a UI list, 5 must be the value shown for a row that has never been written.

---

## PART E — RISKS, GUSTO, AND A PROOF PLAN

### E1. Every Gusto surface, and why default 5 keeps it byte-identical

| Surface | What reads the interval | At default 5 |
|---|---|---|
| customer order page grid + ASAP | `/api/slots` → `generateCollectionTimes(start, end, 5, 10, 30)` | identical inputs → identical output |
| customer fallback picker | `availableMinutes` (5-min clock) | untouched unless the fallback is changed — see E4 #6 |
| placement (cash & card) | `placeOrderInSlotLocked(…, 5, 10, kc 2, cwm 5)` | identical |
| confirmation email slot | the placed slot | identical |
| dashboard day-load strip | `/api/dashboard` → same generator, dots read `byStart(T − 5)` | identical **if** the C3 representation is a no-op at interval = step (it must be: at 5 the covered span is one window) |
| AddOrderPanel slots, ASAP, Ready around | `apiSlots` from `/api/slots` | identical |
| KDS, buzzer, reports | order `slot` strings | untouched |
| native iPad (Gusto's boards) | cached `/api/dashboard` | identical |

🔴 **The one thing that could change Gusto at 5 is the dot representation.** Whichever C3 option ships must reduce to *exactly* the current single-window read when the grid step equals the cooking step. That is a proof obligation (E3), not an assumption.

### E2. Offline and native

- **No client generates the grid on the operator path.** The offline `slots` are a **cached server grid**; a device offline through the change keeps the old grid until its next successful `/api/dashboard`, then switches. An **older build** receives the new grid from the server regardless, because generation is server-side.
- **The outbox replays orders carrying a chosen `slot`.** An order picked on the old 5-grid and replayed after the switch arrives as an **unrecognised slot → confirmed, no capacity check** (B1d). The same applies to any customer who kept a stale order page open.
- **The customer fallback** is the only client-generated grid, and it is wrong at any interval other than 5 (B2).
- **The scraper bridge writes event start times verbatim** (`scripts/run-scraper.js` passes the model's `"HH:MM"` straight through at :2189/:2318; `app/api/inbound-schedule` does no rounding). It can already produce a 12:07 start — the V11.15 disjoint case — and at 15 it would produce starts that are multiples of 5 but not of 15. LIVE (V11.15, 14 August): no real truck has an off-grid start; two demo `23:59` ends.

### E3. Proof plan for the eventual build

All as `scripts/*.cjs`, self-compiling via the repo's `tsc` with the `@/` alias hook, broken variant first, like `scripts/whatsapp-*.cjs`.

| Harness | Proves | Broken variant that must FAIL |
|---|---|---|
| `scripts/slot-interval-generator.cjs` | `generateCollectionTimes` at 5/10/15/20/30 for starts 12:00, 12:05, 16:35; anchored to the start; grace on the interval; **output at 5 byte-identical to a frozen oracle** | V1: clock-anchored walk; V2: grace hard-coded to 30 slots instead of minutes |
| `scripts/slot-interval-engine-identity.cjs` | `projectBackwardOccupancy`, `fitOrderBackward`, `earliestBackwardFitSlot` produce **byte-identical** maps and slots before/after for every §31 worked example at interval 5, and identical maps (only the slot list differs) at 15 | V1: a window filtered out of `byStart`; V2: `step` taken from the interval instead of prep |
| `scripts/slot-interval-dots.cjs` | the C3 representation: at step = interval it equals today's single-window read for every fixture; at 15 the C1 fixture shows **red / 2 pizzas** on 18:15, and the event-start pile stays on its dot | V1: today's single-window read (must show green over 3 pizzas); V2: the sum representation (must show 6) |
| `scripts/slot-interval-picker-parity.cjs` | client and server offer the same set for 12:00/12:05/16:35 at 5 and 15 | V1: the current clock-minute fallback |
| `scripts/slot-interval-offgrid-placement.cjs` | whatever E4 #4 decides for an off-grid `requestedSlot` | V1: today's "unrecognised → book, no capacity check" |
| `scripts/slot-interval-settings-plumbing.cjs` | the value round-trips through every D2 subset | V1: the column missing from `/api/slots`' `cols` |

**Live on `test-truck`** (interval 5, then 15, then back): §31's 3 pizzas @ 17:05 → 17:00 red 2 / 17:05 amber 1 / 17:10 green; 6 pizzas at a 16:30 start → 16:30 red 6; the two "Ready around" examples; and `/api/slots` vs the rendered strip agreeing at both intervals. **Byte-identity at 5:** capture `/api/slots` and `/api/dashboard` JSON for Gusto before the deploy and diff after — not "looks the same".

### E4. Decisions needed

| # | Decision | Options | Recommendation |
|---|---|---|---|
| 1 | **Grid anchoring** | (a) event start — today; a 16:35 start at 15 gives 16:35/16:50/17:05. (b) clock — :00/:15/:30, first slot ≥ start | **(a)**. It is what ships, ASAP and placement already assume it, and the pile-up dot depends on it (C2). If (b) is wanted, `EventTimeSelect` must snap starts to the interval and `pileByStart` needs a home. |
| 2 | **Dot representation** | C3 (i) worst-tone/peak, (ii) sum, (iii) marker | **(i)**, with the label saying "peak". Proved no-op at 5 before shipping. |
| 3 | **Operators restricted to the grid?** | (a) yes, same list as customers; (b) operators keep any 5-minute time; (c) grid, with the existing capacity override | **(a) with (c)** — the operator list already *is* the server grid; the override onto a red slot is unchanged. Allowing 5-minute operator times on a 15 customer grid recreates C1 permanently. |
| 4 | **Off-grid existing orders and replays** | (a) leave as-is (unrecognised → confirmed, no capacity check); (b) snap to the next grid time server-side and set `slotChanged`; (c) keep the time but run the capacity fit anyway | **(c)** — keep the customer's time, stop skipping the fit. (a) is a live hole today, independent of this feature. |
| 5 | **Per-truck vs per-van vs per-event** | truck (reuse column) / van (new column) / event (deferred) | **per-truck, reuse `collection_interval_mins`**, write `slot_duration_mins = interval` alongside |
| 6 | **The customer fallback grid** | (a) make `availableMinutes` read the interval; (b) delete the fallback | **(b)** if the fallback is unreachable when `/api/slots` succeeds; otherwise (a). Needs a read of when `slots` is empty on a live page. |
| 7 | **`upsert_event`'s hard-coded 5 `slot_capacity`** | leave / read the interval / retire the table | **retire or read the interval** — decide after confirming its readers are demo counts only |
| 8 | **`EventTimeSelect` step** | keep 5 / make it the interval | keep 5 **and** add a warning when the start is not a multiple of the interval — starts are edited far less often than the interval is read |

---

## Risk table

| Risk | Where | Severity | Mitigation |
|---|---|---|---|
| Cooking load on no dot at interval > prep | C1 | 🔴 high — capacity looks free when it is not | C3 (i), proved no-op at 5 |
| Off-grid slot confirmed with no capacity check | B1d / B4 / E2 | 🔴 high, **exists today** | E4 #4 |
| Client fallback grid disagrees with server | B2 | 🔴 customer-facing outage class (V11.15) | E4 #6 |
| Scraper writes a start not on the grid | E2 | ⚠️ latent at 5, real at 15 | E4 #8 |
| `/api/slots` hand-picked select | D2 | ⚠️ value writes but never reaches the customer | reuse the column, or add + harness |
| `slot_duration_mins ≠ interval` | D3 | ⚠️ collapsed `production_slot` keys | write both together |
| Pile-up dot vanishes under clock anchoring | C2 | ⚠️ only if E4 #1 = (b) | keep event-start anchoring |
| Stale offline grid on a device | E2 | low — self-heals on next dashboard read | none needed |

---

## What I could not establish

- **The KDS's rendering of an order's slot** — no `slot`/`collection_time` read found under `app/kds`; I did not locate where the board prints the time.
- **Who reads `slot_capacity` beyond demo/provisioning counts** — the table's columns were not read (no SQL endpoint; not in the OpenAPI pattern) and `events/action/route.ts` says the manual's account of it is stale.
- **When the customer page's fallback branch is actually reached** — whether `slots` can be empty on a live event with `time_selection_enabled`, or only when `/api/slots` fails.
- **Exact nullability of the two `trucks` columns** — OpenAPI convention, not `is_nullable`; the migration for `capacity_window_mins` is authoritative for that one only.
- **Reports and buzzer keying** — no hits for `collection_time` in the paths searched; assumed to use `orders.slot` as a string.

---

## Manual sections this work would make stale

- **§31** — the "5-minute collection slots" phrasing throughout; the dot read `byStart.get(slotMins − step)` would become a span read (C3); the FILES list gains the setting's write path.
- **§4 (line 6891)** — "slot cadence … truck-wide, per-event overrides deferred": becomes a shipped truck-level setting; also line 6646's "a full window returns 409" is **already wrong** (B1d).
- **§6 / §10** — ASAP and slot descriptions assume a 5-minute grid.
- **§14** — `slot_capacity` "written from the van at confirm": already recorded as stale in `events/action/route.ts`.
- **"Event start and end times — hour + minute (V11.15)"** — the "minute step must be 5" argument becomes "must be a multiple of the interval".
- **The day-load off-by-one entry** — its `slot_duration_mins ≠ collection_interval_mins` generalisation is exactly the D3 hazard.
