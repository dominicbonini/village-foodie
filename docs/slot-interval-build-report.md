# Slot interval — BUILD report

**Date:** 16 September 2026 · **HEAD at start and end:** `fc0fddc outreach` · **Nothing committed, nothing applied to any database.**

Two per-truck settings for which collection times are selectable — the CUSTOMER interval (existing `trucks.collection_interval_mins`) and a NEW TRUCK interval (`trucks.operator_collection_interval_mins`) for Add Order — choices 5/10/15/20/30, default 5, not plan-gated. The capacity engine is byte-identical (D4, proven below). At 5, every truck sees exactly what it saw before (proven below). No live truck is at anything but 5 until an operator changes it on the Manage page.

Where a figure is from the live database it is marked **LIVE**; from a made-up input, **FIXTURE**.

---

## 0. git status before

Clean at `fc0fddc`. Named files were not dirty; no STOP.

## 1. Findings from the reads (R1–R5)

| # | Question | Answer (code is truth) |
|---|---|---|
| R1 | How does Add Order authenticate and place? | `AddOrderPanel` POSTs `/api/dashboard/action` `{ token, pin, action: 'manual', manualOrder }`. `verifyToken` matches `trucks.dashboard_token` + `dashboard_pin`. The `manual` branch "bypasses ALL capacity gating … confirm always, occupy always" via `addOrderToProductionSlot`; it never calls `placeOrderInSlotLocked` (whose only callers are `/api/orders/submit` and `promoteDraft`, both customer). The operator's capacity "check" is a client-side confirm against `/api/slots`' engine inputs. The server already knows who the operator is → **no STOP**. |
| R2 | Which grid does Add Order read? | Online: `fetchManualSlots` → `/api/slots/${truck.id}?date&start&end&event_id` — **with no token at HEAD** (the route was unauthenticated). Offline: `offlineForThisEvent.slots`, the cached SERVER grid from the last successful `/api/dashboard` (native `truckSnapshot`), never client-generated. A second, token-less `/api/slots` call existed in the confirm handler (the fresh re-check). Both now send the dashboard token. |
| R3 | When is the customer fallback picker reached? | `/api/slots` failure (`catch → setAvailableSlots([])`) or an empty `slots` array, gated by `truck.time_selection_enabled`; its minutes were a hard-coded `MINUTES` list. |
| R4 | Manage page read/write? | GET `trucks.select('*').eq('dashboard_token', token)` — the new column arrives with no select edit. `update_truck` filters `data` through an **allowlist array that silently DROPS unknown keys** (it does not 400). Both keys added and validated. |
| R5 | Gusto's prep cadence (LIVE)? | `menu_categories` for Pizzeria Gusto: Pizza & Specials `prep_secs=300 batch_size=2`; Desserts / Dips / Dough Balls / Drinks `prep_secs=0` → `backwardWindowStepMins = 5`. Gusto's van: `kitchen_capacity=2`, `capacity_window_mins=5`. |

**D5 (readers of `production_slot`):** `projectOvenOccupancy` (only caller the retired `projectOrderTailWindow`, marked "No live callers… Safe to delete"), `getBatchCountsByCollectionTime` (no callers), and pass-throughs (`/api/dashboard`, `buildSlotAvailability`, types, client `production_slot: s.collection_time`). No live path behaves differently at 10–30 with `slot_duration_mins` 10 → **no STOP**, and `trucks.slot_duration_mins` is not written.

**A-facts (LIVE, from the investigation, unchanged):** all 12 trucks hold `(collection_interval_mins, slot_duration_mins) = (5, 10)`; `truck_vans.capacity_window_mins` NOT NULL default 5 CHECK 1–20; test-truck Van 1 `capacity_window_mins=10`; `collection_times` has 0 rows (storage key = `collection_time`); no event-level interval column; **no truck has an event from today onward whose start is off a 5-minute mark** (🔴 **CORRECTED 17 September 2026**: this sentence read *"no Gusto event has ever existed and no truck has an event…"*. The first clause was wrong — Gusto has events, three of them upcoming — and it was never what the LIVE query established. What was established, and all that was, is the 5-minute-mark fact. The wrong clause was load-bearing in the wrong direction: it implied Gusto could not be affected by an event-shaped change at all.), so D1's clock anchoring changes no live grid.

## 2. Changes, by symbol

### New

- **`supabase/migrations/20260916_collection_intervals.sql`** — written, **NOT applied**. Text in §3.
- **`lib/slot-interval.ts`** — `INTERVAL_CHOICES = [5,10,15,20,30]`, `IntervalChoice`, `DEFAULT_INTERVAL = 5`, `isIntervalChoice`, `normaliseInterval` (anything invalid → 5), `readOperatorInterval(supabase, truckId)`: a separate probe `select('operator_collection_interval_mins')` that logs `PGRST204` (schema cache not reloaded) and `42703` (column absent) distinguishably under `[slot-interval]` and returns 5 on any failure — never a 500.

### Generator (D1)

- **`lib/slot-generation.ts`** — `firstClockSlotAtOrAfter(startMins, interval)` = `ceil(start/interval)·interval`; `clockGridMinutes(interval)` → `['00','05',…]` (the fallback picker's minutes, so picker == server); `generateCollectionTimes` now begins at the first clock multiple ≥ start and walks `mins += intervalMins` while `mins <= end + grace`. `production_slot` derivation unchanged. At 5 this is the same list as HEAD for every start (a 5-minute walk from a 5-minute-aligned start is the clock grid; an off-grid start had no live instance — A-facts).

### Dot readers (display only)

- **`lib/slot-availability.ts`** — new `CoveredDotWindow extends BackwardWindow { peak }` and `coverDotWindows(back, slotMins, prevSlotMins, step, eventStartMins)`: the first displayed dot covers `pileByStart.get(eventStartMins)`; every dot covers the `byStart` windows with `startMins ∈ [max(eventStart, prev − step + 1), slot − step]`; tone = worst covered (`RANK`), `byCat/total/bound_by` = the PEAK window (never a sum), `peak = covered.length > 1`. It reads `back`; it writes nothing. `buildSlotAvailability` gains `displayIntervalMins?: number` (default 5) and, in the no-basket branch only, `displayInterval > 5 ? coverDotWindows(…) : (original single-window line, intact)`.
- **`lib/slot-display.ts`** — `buildSlotIndicators(…, capacityWindowMins = 5, intervalMins = 5)`; same gated read; label becomes `peak ${label}` when `peak`. (`orderedMins`/`prevOf` sit AFTER the local `toMins` — the dots harness caught a temporal-dead-zone crash when they were above it; tsc had not.)
- **`lib/capacity-breach.ts`** — `DetectCapacityBreachesParams.intervalMins?`; same gated read.

### Routing (D2/D3)

- **`app/api/slots/[truckId]/route.ts`** — `isOperatorOf(truckId, token)` (`trucks.select('id').eq('dashboard_token', token)` for THIS id); `?token=` read; `intervalMins = operator ? await readOperatorInterval(supabase, truckId) : (truck.collection_interval_mins ?? 0)`; `displayIntervalMins = normaliseInterval(intervalMins)` passed to `buildSlotAvailability` and `capacityInputs`. The customer `resolveTruck` select is UNCHANGED (`'id, collection_interval_mins, slot_duration_mins'`) — it must never name the new column, or every customer page would 500 if the code deployed before the migration.
- **`app/api/dashboard/route.ts`** — `truckIntervalMins = await readOperatorInterval(supabase, truck.id)`; passed to `buildSlotIndicators` and `detectCapacityBreaches({ intervalMins })`; returned as `truckIntervalMins`. The `truck:` object is `...publicTruckFields(truck)` (a REDACT list) so the column reaches the native snapshot with no edit.
- **`app/dashboard/[token]/page.tsx`** — `truckIntervalMins` state from `/api/dashboard`; offline `buildSlotIndicators(…, truckIntervalMins)`; `offlineCapacity.intervalMins`; edit picker `editCapacityInputs.intervalMins ?? 5`.
- **`components/dashboard/AddOrderPanel.tsx`** — `fetchManualSlots` and the confirm handler's fresh re-check BOTH `p.set('token', token)`; `useCallback` deps gain `token`; `capacityInputs`/`offlineCapacity`/`ci` types gain `intervalMins?`; dot reads via `buildSlotIndicators(…, capacityInputs.intervalMins ?? 5)` and, in the confirm re-check, `freshInterval > 5 ? coverDotWindows(…) : (original line)`.

### Settings

- **`app/api/manage/route.ts`** — `update_truck` allowlist + `'collection_interval_mins', 'operator_collection_interval_mins'`; a validation loop over both keys with `isIntervalChoice` → 400 `Collection times must be every 5, 10, 15, 20, 30 minutes.`
- **`app/manage/[token]/page.tsx`** — "Collection times" sub-card inside "Your trucks" (above the van list): two selects, **Customer collection times** and **Your order times (Add Order)**, options "Every N minutes", optimistic `onTruckUpdate` then `api('update_truck', …)`, revert + toast on error; the line "Changes which times can be chosen. It does not change kitchen capacity or prep times."
- **`lib/supabase.ts`** — `Truck.operator_collection_interval_mins: number`.

### Customer page

- **`app/api/menu/[truckId]/route.ts`** — the hand-picked truck object gains `collection_interval_mins: normaliseInterval(truck.collection_interval_mins)` (V8.9 trap: `/api/menu` is not `select('*')`).
- **`app/trucks/[slug]/order/page.tsx`** — dead `MINUTES` const removed; `availableMinutes` uses `clockGridMinutes(truck?.collection_interval_mins ?? 5)`; `TruckData.collection_interval_mins?`.

### Left as is (D6)

`EventTimeSelect` 5-minute step; `upsert_event` / `provisionDemoEvent` hard-coded-5 `slot_capacity` (report readers only: admin counts, provision-demo, demo return); scraper bridge; demo seeder's read of `collection_interval_mins`; `provisionTruck` and the demo provisioners write neither column (B7: the DB default supplies 5).

## 3. Migration (written, NOT applied) and verification SQL

`supabase/migrations/20260916_collection_intervals.sql`:

```sql
set lock_timeout = '3s';

begin;

alter table public.trucks
  add column if not exists operator_collection_interval_mins integer not null default 5;

alter table public.trucks
  drop constraint if exists trucks_operator_collection_interval_mins_check;
alter table public.trucks
  add constraint trucks_operator_collection_interval_mins_check
  check (operator_collection_interval_mins in (5, 10, 15, 20, 30));

alter table public.trucks
  drop constraint if exists trucks_collection_interval_mins_check;
alter table public.trucks
  add constraint trucks_collection_interval_mins_check
  check (collection_interval_mins is null or collection_interval_mins in (5, 10, 15, 20, 30));

commit;

notify pgrst, 'reload schema';
```

Safe on LIVE data: every `trucks` row reads `collection_interval_mins = 5` (LIVE, 12 rows), so the new CHECK admits every row; the new column defaults to 5 so no truck's Add Order changes.

Verification, after applying — read-only:

```sql
select information_schema.columns.column_name,
       information_schema.columns.data_type,
       information_schema.columns.is_nullable,
       information_schema.columns.column_default
from information_schema.columns
where information_schema.columns.table_schema = 'public'
  and information_schema.columns.table_name = 'trucks'
  and information_schema.columns.column_name in ('collection_interval_mins', 'operator_collection_interval_mins')
order by information_schema.columns.column_name;
```
Expected: two rows; `operator_collection_interval_mins integer NO 5`; `collection_interval_mins integer YES 5`.

```sql
select pg_constraint.conname,
       pg_get_constraintdef(pg_constraint.oid) as definition
from pg_constraint
join pg_class on pg_class.oid = pg_constraint.conrelid
join pg_namespace on pg_namespace.oid = pg_class.relnamespace
where pg_namespace.nspname = 'public'
  and pg_class.relname = 'trucks'
  and pg_constraint.conname in ('trucks_operator_collection_interval_mins_check', 'trucks_collection_interval_mins_check')
order by pg_constraint.conname;
```
Expected: both constraints, each `CHECK (... IN (5, 10, 15, 20, 30))`, the customer one admitting NULL.

```sql
select trucks.id,
       trucks.name,
       trucks.collection_interval_mins,
       trucks.operator_collection_interval_mins
from public.trucks
order by trucks.name;
```
Expected: 12 rows, every row `5, 5` (Pizzeria Gusto included).

## 4. Harnesses — each broken variant ran FIRST and reported FAILURE

| Harness | Failure it would surface | Broken variant(s) → result | Real run |
|---|---|---|---|
| `scripts/slot-interval-generator.cjs` | A 5-minute truck's list differing from HEAD by one slot; a 15 grid anchored to the event start; picker ≠ server | V1 event-start anchoring at every interval → FAILED; V2 the old hard-coded `MINUTES` list → FAILED | ✅ 23: identical to the frozen HEAD oracle over 4,644 FIXTURE combinations at 5 (every start 00:00–23:55, ends incl. 23:59, duration 5/10, grace 0/30); 17:50 start at 15 → 18:00; grace; `production_slot` floor; picker == server at 5 and 15 |
| `scripts/slot-interval-engine-identity.cjs` | Any engine output differing from HEAD | V1 the ceiling's cadence taken from the display interval → FAILED (2/10 differ — the two cases with ticked no-prep items, the only load `capacity_window_mins` seats; the first draft lacked such a case and the variant was silent, so the Gusto-shaped fixtures were added) | ✅ engine compiled from a `git worktree` of HEAD and from the working tree, run on 10 FIXTURE cases (§31 worked examples, Gusto-shaped, C1, off-grid key): byte-identical JSON; §31 spread and pile facts hold on the new build |
| `scripts/slot-interval-dots.cjs` | At 5 any dot/row byte differing from HEAD; at 15 the C1 dot green; a 17:50 pile lost; a window on two dots or none | V1 single-window read at 15 → C1's 18:15 dot GREEN → FAILED; V2 summed count → 6 where the true peak is 2 → FAILED (fixture: 4 pizzas @18:05 + 4 @18:15; a 3-pizza draft summed to 5 because §31 seats the FULL batch earlier and the remainder nearest the deadline — recorded in the file) | ✅ 68 FIXTURE cases (8 §31/Gusto/test-truck + 60 seeded): operator `buildSlotIndicators` and customer `buildSlotAvailability` rows identical to HEAD at 5, with and without a basket; C1 at 15 → 18:15 `red`, label **"peak 2 Pizzas"**, 18:00 green, customer row red; 17:50 start at 15 → first dot 18:00 carries the pile (red, "6 Pizzas"); 228 single-window fixtures across 10/15/20/30 × three starts each lit exactly one dot. **Also caught the `toMins` TDZ crash (real bug, fixed).** |
| `scripts/slot-interval-grid-routing.cjs` | Operator list from the customer grid; `/api/slots` serving the truck grid unauthenticated; customer placement reading the truck interval; operator 18:05 (truck 5 / customer 15) treated as off-list | V1 operator drawn from the customer grid → 18:05 not on the list → FAILED | ✅ 23: model (compiled generator + the route's selection logic) — customer→15, operator→5, 18:05 on the operator list (capacity-checked) and not on the customer list; column-absent fallback → 5; legacy 0 keeps its no-grid contract. Source (comments stripped) — `isOperatorOf` on `dashboard_token`; both AddOrderPanel `/api/slots` fetches send the token and none remains without; `manual` branch never calls `placeOrderInSlotLocked`; submit passes `truck.collection_interval_mins`; customer page/`/api/menu` never see the truck interval |
| `scripts/slot-interval-settings.cjs` | Allowlist silently dropping a key; a 7 or "15" reaching the DB; the customer select naming the new column; redact list hiding it; migration CHECK ≠ `INTERVAL_CHOICES` | V1 key missing from allowlist → dropped → FAILED; V2 column named in the customer select → FAILED | ✅ 22: both keys in the 28-key allowlist and validated; `isIntervalChoice` exactly the five; customer select does not name the column; probe distinguishes PGRST204/42703; Manage GET `select('*')`; `TRUCK_REDACT` lacks both keys; `/api/dashboard` returns `truckIntervalMins`; types; two selects; migration text matches code |

`scripts/_slot-interval-compile.cjs` is the shared prelude (compiles a file list from any tree root — working tree or a HEAD worktree — with the repo's `tsc`, `@/` mapped).

## 5. Verification

- **All harnesses:** 5 × `slot-interval-*` ✅, 7 × `outreach-*` ✅ (343/26/18/15/18/25/9), 5 × `whatsapp-*` ✅ (48/87/37/131/30).
- **`tsc --noEmit`:** no errors.
- **`next build`:** compiled, TypeScript passed, 95/95 static pages.
- **eslint vs a clean HEAD worktree (13 changed files):** HEAD 619 messages → NOW 618. Per-rule delta: `@typescript-eslint/no-unused-vars` **−1** (the dead `MINUTES` const, which carried that warning at HEAD, was removed — it had no reader); nothing added. The one warning the build had introduced (`fetchManualSlots` missing `token`) was fixed by adding it to the dependency array. `lib/slot-interval.ts`: 0 messages.
- **`git diff --stat`:** 13 files changed, 299 insertions, 27 deletions.

## 6. D4 confirmation

Function bodies compared byte-for-byte between `git show HEAD:…` and the working tree:

| Symbol | File | Bytes | Result |
|---|---|---|---|
| `projectBackwardOccupancy` | `lib/slot-availability.ts` | 11,473 | identical |
| `fitOrderBackward` | `lib/slot-availability.ts` | 1,155 | identical |
| `earliestBackwardFitSlot` | `lib/slot-availability.ts` | 1,232 | identical |
| `windowScopedPeak` | `lib/slot-availability.ts` | 904 | identical |
| `backwardWindowStepMins` | `lib/slot-availability.ts` | 293 | identical |
| `loadRunsOffFront` | `lib/slot-availability.ts` | 639 | identical |
| `placeInstantPoints` (sweep-line seating) | `lib/slot-availability.ts` | 576 | identical |
| `buildUnitsFromOrders` | `lib/slot-bookings.ts` | 3,792 | identical |
| `rebuildProductionSlotUsage` | `lib/slot-bookings.ts` | 1,544 | identical |

`git diff -U0 lib/slot-availability.ts` has hunks only inside `buildSlotAvailability` and after `projectOrderTailWindow` (the added `coverDotWindows` block — the header names the nearest preceding function). No `+`/`−` line touches `pileByStart.set`, `byStart.set` or `loadByStart.set`. `kitchen_capacity`, `capacity_window_mins`, `batch_size`, `prep_secs` are read where they always were and nowhere new. The engine-identity harness is the executable form of this table.

## 7. DEPLOY ORDER

1. **Apply the migration**, then run the three verification queries in §3 (expect: two columns; two constraints; 12 rows of `5, 5`). If the app is already live before the schema reload, `/api/slots` and `/api/dashboard` log `[slot-interval] … (PGRST204)` and serve 5 — harmless, but the setting will not take effect until `notify pgrst, 'reload schema'` has run.
2. **Deploy.** Before the migration the code is safe: no customer select names the column; the operator probe returns 5.
3. **Test-truck checks** (Van 1 `capacity_window_mins=10`, LIVE), Manage → Your trucks → Collection times:
   - At **5/5**: Add Order list and customer page identical to before; dots identical (harness-proven, confirm by eye).
   - Set **Your order times = 15** (customer left at 5): Add Order shows 18:00, 18:15, …; place 3 pizzas at 18:10 via the customer page (5 grid), then open Add Order — the 18:15 dot must be **red, "peak 2 Pizzas"** (§31 C1). "Ready around" for a further pizza must move to the next clock slot the engine accepts — the ASAP value comes from `earliestBackwardFitSlot` over the 15 grid.
   - Create an event starting **17:50**: Add Order's first slot is 18:00 (D1, accepted); a pre-open order shows on the 18:00 dot.
   - Set **Customer collection times = 15**: customer page offers 18:00/18:15/…; ASAP still fills; the fallback picker (kill `/api/slots` in devtools) offers the same minutes. An operator placing 18:05 is still capacity-checked (truck grid 5).
   - Set both back to **5**: everything as at the start.
4. **Gusto check at 5** (do not change Gusto's settings): Manage shows 5/5; customer page and Add Order unchanged.

## 8. Manual sections now stale (`docs/reference-manual.md` is a claim)

- **§31** — the worked examples remain true; add: dots on a 10–30 grid read the worst covered window and label the peak ("peak 2 Pizzas"); the first dot carries the pre-open pile even when the event start is not a displayed time.
- **§4 / §6 / §10** — "every 5 minutes" statements: now "every N minutes, per truck, per audience"; two settings under Manage → Your trucks → Collection times.
- **V11.15** and the off-by-one note — grids are clock-anchored from midnight; first slot = first multiple ≥ start.
- **§14** — `slot_capacity` is still written on a hard-coded 5 (unchanged, D6; the note at `events/action/route.ts` stands).

## 9. Could not establish

- Whether Supabase's PostgREST on this project auto-reloads on DDL; the migration sends `notify pgrst, 'reload schema'` regardless and the code tolerates PGRST204.
- Real-browser rendering of the new sub-card and the 15-grid dots (no UI run in this session; the harnesses cover the values, not the pixels).
- eslint "delta zero" in the strict sense: the count is −1 because removing dead code removed its warning; no rule gained a message.

## 10. git status after

```
 M app/api/dashboard/route.ts
 M app/api/manage/route.ts
 M app/api/menu/[truckId]/route.ts
 M app/api/slots/[truckId]/route.ts
 M app/dashboard/[token]/page.tsx
 M app/manage/[token]/page.tsx
 M app/trucks/[slug]/order/page.tsx
 M components/dashboard/AddOrderPanel.tsx
 M lib/capacity-breach.ts
 M lib/slot-availability.ts
 M lib/slot-display.ts
 M lib/slot-generation.ts
 M lib/supabase.ts
?? lib/slot-interval.ts
?? scripts/_slot-interval-compile.cjs
?? scripts/slot-interval-dots.cjs
?? scripts/slot-interval-engine-identity.cjs
?? scripts/slot-interval-generator.cjs
?? scripts/slot-interval-grid-routing.cjs
?? scripts/slot-interval-settings.cjs
?? supabase/migrations/20260916_collection_intervals.sql
```
Plus this report. Nothing staged, nothing committed.
