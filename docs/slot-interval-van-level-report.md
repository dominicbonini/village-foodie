# Collection times — MOVE TO VAN LEVEL

**17 September 2026 · HEAD `fc0fddc outreach` · Localhost only. Nothing deployed, no migration applied, nothing written to any database.**

Both collection-interval settings move from the truck to the **van**, the per-truck sub-card is removed, `trucks.operator_collection_interval_mins` is dropped, and the R3 offline-grid check found and fixed a real defect in the previous build.

Figures are marked **LIVE** (read from the production database today, read-only), **CODE** (read from the working tree) or **FIXTURE**.

---

## 0. git status

### Before

```
On branch main
Changes not staged for commit:
	modified:   app/api/dashboard/route.ts
	modified:   app/api/manage/route.ts
	modified:   app/api/menu/[truckId]/route.ts
	modified:   app/api/slots/[truckId]/route.ts
	modified:   app/dashboard/[token]/page.tsx
	modified:   app/manage/[token]/page.tsx
	modified:   app/trucks/[slug]/order/page.tsx
	modified:   components/dashboard/AddOrderPanel.tsx
	modified:   lib/capacity-breach.ts
	modified:   lib/slot-availability.ts
	modified:   lib/slot-display.ts
	modified:   lib/slot-generation.ts
	modified:   lib/supabase.ts

Untracked files:
	docs/slot-interval-build-report.md
	docs/wired-printing-investigation-report.md
	lib/slot-interval.ts
	scripts/_slot-interval-compile.cjs
	scripts/slot-interval-dots.cjs
	scripts/slot-interval-engine-identity.cjs
	scripts/slot-interval-generator.cjs
	scripts/slot-interval-grid-routing.cjs
	scripts/slot-interval-settings.cjs
	supabase/migrations/20260916_collection_intervals.sql
```

13 modified + 8 untracked, as expected. Built on.

### After

17 modified, 12 untracked. Four files joined the modified set (`app/api/events/route.ts`, `app/api/orders/submit/route.ts`, `lib/orders/place-in-slot.ts`, `lib/payments/promote-draft.ts`); two files joined the untracked set (`scripts/slot-interval-van-resolution.cjs`, `supabase/migrations/20260917_van_collection_intervals.sql`). Full listing in §8. **Nothing staged, nothing committed.**

---

# READS

## R1 — how kitchen_capacity / capacity_window_mins resolve today

All five sites share one shape: **the caller resolves its own event, then reads `event.van_id`.** Quoted verbatim.

### `/api/slots/[truckId]/route.ts`

Event first — explicit `event_id` param, else the date's first non-cancelled event:

```ts
if (eventIdParam) {
  const { data } = await supabase
    .from('truck_events')
    .select('id, start_time, end_time, van_id, extra_wait_mins, extra_wait_started_at')
    .eq('truck_id', truckId).eq('id', eventIdParam).maybeSingle()
  todayEvent = (data as EventRow) ?? null
  if (!todayEvent) console.warn(`[slots] event_id ${eventIdParam} not found for truck ${truckId} — date fallback`)
}
if (!todayEvent) {
  const { data, count } = await supabase
    .from('truck_events')
    .select('id, start_time, end_time, van_id, …', { count: 'exact' })
    .eq('truck_id', truckId).eq('event_date', date).neq('status', 'cancelled')
    .order('start_time', { ascending: true }).limit(1)
  todayEvent = (data?.[0] as EventRow) ?? null
  if (!eventIdParam && (count ?? 0) > 1) {
    console.warn(`[slots] ${count} events on ${date} for truck ${truckId} and no event_id — using earliest (${todayEvent?.id})`)
  }
}
```

then the van:

```ts
let kitchenCapacity: number | null = null
let capacityWindowMins = 5
if (todayEvent?.van_id) {
  const { data: van } = await supabase
    .from('truck_vans')
    .select('kitchen_capacity, capacity_window_mins')
    .eq('id', todayEvent.van_id)
    .single()
  kitchenCapacity = van?.kitchen_capacity ?? null
  capacityWindowMins = van?.capacity_window_mins ?? 5
}
```

**No `van_id`:** the block is skipped — `kitchenCapacity` stays `null` (no ceiling), `capacityWindowMins` stays 5. **One van vs several:** irrelevant here — the van is named by the event, never chosen from a list. A two-van truck is served correctly *because* the event carries the id; nothing enumerates vans.

### `/api/dashboard/route.ts`

```ts
const capacityEvent = selectedEvent
if (capacityEvent?.van_id) {
  const { data: van, error: vanErr } = await supabase
    .from('truck_vans')
    .select('kitchen_capacity, capacity_window_mins, name, auto_pause_on_offline, offline_protection_mode, offline_auto_reject_mins, show_cooking_step, order_ready_enabled, buzzer_count')
    .eq('id', capacityEvent.van_id)
    .single()
  if (vanErr) { console.error(`[dashboard] van ${capacityEvent.van_id} lookup failed — capacity, cooking step and order-ready all fall back to their defaults this poll:`, vanErr.message) }
  kitchenCapacity = van?.kitchen_capacity ?? null
  capacityWindowMins = van?.capacity_window_mins ?? 5
  …
}
```

The comment above it states the rule this whole workstream inherits: *"kitchen_capacity + name from the SELECTED event's van — the same event the production-usage read and slot times are scoped to, so a multi-event-same-date day shows the right event's capacity, not the date's first event."*

**No `van_id`:** same defaults, and additionally no van name, no buzzers, cooking step off. **Several vans:** again decided by `selectedEvent.van_id`. 🔴 Note this is a **NAMED select** whose own comment warns a 42703 degrades the whole van read — the reason the new columns are *not* added to it (B2).

### `placeOrderInSlotLocked` / `eventKitchenCapacity` (`lib/orders/place-in-slot.ts`)

The richest resolver, and the only one that owns its event lookup:

```ts
let ev: { start_time: string | null; van_id: string | null } | null = null
if (eventId) {
  const { data } = await supabase.from('truck_events')
    .select('start_time, van_id').eq('truck_id', truckId).eq('id', eventId).maybeSingle()
  ev = data ?? null
  if (!ev) console.warn(`[eventKitchenCapacity] event_id ${eventId} not found for truck ${truckId} — date fallback`)
}
if (!ev) {
  if (!eventId) console.warn(`[eventKitchenCapacity] no event_id for truck ${truckId} on ${eventDate} — using date's first event`)
  const { data } = await supabase.from('truck_events')
    .select('start_time, van_id').eq('truck_id', truckId).eq('event_date', eventDate)
    .neq('status', 'cancelled').order('start_time', { ascending: true }).limit(1).maybeSingle()
  ev = data ?? null
}
let kitchenCapacity: number | null = null
let capacityWindowMins = 5
if (ev?.van_id) {
  const { data: van } = await supabase.from('truck_vans')
    .select('kitchen_capacity, capacity_window_mins').eq('id', ev.van_id).single()
  kitchenCapacity = van?.kitchen_capacity ?? null
  capacityWindowMins = van?.capacity_window_mins ?? 5
}
```

**No `van_id`:** null ceiling, window 5, `eventStartMins` 0 if the event has no start. **Several vans:** by event id; the date fallback warns. `placeOrderInSlotLocked` itself takes `kitchenCapacity`/`capacityWindowMins` as **parameters** — it resolves nothing.

### `seedDemoOrders` (`lib/seed-demo-orders.ts`)

```ts
const vanId = (evRes.data as { van_id?: string | null } | null)?.van_id ?? null
if (vanId) {
  … .from('truck_vans').select('kitchen_capacity, capacity_window_mins').eq('id', vanId).maybeSingle()
  kitchenCapacity = … ?? null
  capacityWindowMins = … ?? 5
}
```

🔴 **But its grid comes from the TRUCK, not the van:**

```ts
supabase.from('trucks').select('collection_interval_mins, slot_duration_mins').eq('id', args.truckId).maybeSingle(),
…
const intervalMins = (truckRes.data as { collection_interval_mins?: number | null } | null)?.collection_interval_mins ?? 0
```

So capacity is van-resolved and the interval is truck-resolved — a split that predates this change. **Left as is:** it is the demo seeder, it is not in this brief's B3 list, and at 5/5 (every van and every truck, LIVE) it produces an identical grid. Recorded in §9 as a known inconsistency.

### The offline dashboard path (`app/dashboard/[token]/page.tsx`)

Resolves nothing. It consumes `kitchenCapacity` and `capacityWindowMins` as they arrived on the `/api/dashboard` payload — i.e. already van-resolved server-side — and folds them into `offlineOccupancy`, `displaySlots` and `offlineCapacity`.

---

## R2 — LIVE counts (read-only)

Read via the read-only PostgREST helper (`GET` only). Equivalent SQL, shown as required:

```sql
select truck_events.truck_id,
       count(*) as upcoming_events,
       count(*) filter (where truck_events.van_id is null) as van_id_null
from public.truck_events
where truck_events.event_date >= current_date
  and truck_events.status <> 'cancelled'
group by truck_events.truck_id
order by upcoming_events desc;
```

| truck_id | upcoming events | `van_id` NULL |
|---|---:|---:|
| `pizzeria-gusto` | 3 | **2** |
| `test-truck-3-2` | 2 | 0 |
| `demo-3hgvth0mancbak5krsxhy6fda7` | 1 | 0 |
| `test-truck` | 1 | 0 |
| **Total** | **7** | **2** |

```sql
select truck_vans.truck_id,
       count(*) as vans,
       count(*) filter (where truck_vans.active) as active_vans
from public.truck_vans
group by truck_vans.truck_id
order by truck_vans.truck_id;
```

**13 vans across 12 trucks. Exactly one truck has more than one van: `test-truck` (Van1 `capacity_window_mins=10`, Van2 `kitchen_capacity=8`).** Gusto has one van, `Van1 (kc=2, cwm=5)`.

🔴 **THE FINDING THAT MATTERS: two of Pizzeria Gusto's three upcoming events have `van_id` NULL.** The "no van resolves" branch is not theoretical — it is the live trading truck's most common upcoming state. V2's rule for it (both intervals 5, with the legacy customer read preserved) is therefore the branch that must be exactly right, and the van-resolution harness asserts it directly.

Supporting read, because the legacy contract depends on it:

```sql
select trucks.collection_interval_mins,
       trucks.slot_duration_mins,
       count(*) as trucks
from public.trucks
group by trucks.collection_interval_mins, trucks.slot_duration_mins;
```

**All 12 trucks: `(5, 10)`. No truck holds 0 or NULL**, so the `interval 0 ⇒ collection_times` fallback is currently unreachable — and `collection_times` has **0 rows** anyway. At 5/5 across the board, everything below is byte-identical to HEAD for every truck.

---

## R3 — the offline grid: a real defect, found and fixed

### Every grid-producer call in `/api/dashboard`

There is exactly **one**:

```ts
const slots =
  (selectedEvent?.start_time && selectedEvent?.end_time && intervalMins > 0
    ? generateCollectionTimes(selectedEvent.start_time, selectedEvent.end_time, intervalMins, slotDurationMins, GRACE_MINS)
    : []
  ).map(s => ({ ...s, production_window_key: timeMap[s.collection_time] || s.collection_time }))
```

At HEAD-plus-the-previous-build it received `intervalMins = truckIntervalMins = await readOperatorInterval(supabase, truck.id)` — the truck-level operator interval. **Now** it receives the van-resolved effective truck interval.

### Where that one grid goes

| Consumer | Path | Interval it used |
|---|---|---|
| Day-load strip (dots) | `buildSlotIndicators(slots, …, capacityWindowMins, truckIntervalMins)` → `dayIndicators` → `tone`/`label` on each row | ✅ truck interval |
| `detectCapacityBreaches` | `detectCapacityBreaches({ intervalMins: truckIntervalMins, times: slots, … })` | ✅ truck interval |
| The response's `slots:` | `slotsWithCapacity = buildSlotAvailability({ times: slots, … })` | 🔴 **defaulted to 5** |
| Offline Add Order | `offlineCapacity = { slots, intervalMins: truckIntervalMins, … }` → `AddOrderPanel.manualSlots` | ✅ truck interval |
| Offline day strip | `displaySlots` → `buildSlotIndicators(slots, merged, …, truckIntervalMins)` | ✅ truck interval |

### 🔴 THE VIOLATION, STATED EXPLICITLY

`buildSlotAvailability` was called **without `displayIntervalMins`**, so it took the parameter's default of 5 while `times` was generated at 10–30. Inside its no-basket branch that gates the read:

```ts
const w = displayInterval > 5
  ? coverDotWindows(back, slotMins, prevOf(slotMins), step, eventStartMins)
  : (back.pileByStart.get(slotMins) ?? back.byStart.get(slotMins - step) ?? null)
```

At 5 it took the single-window line. On a 15-minute grid with a 5-minute cooking step, the dot at 18:15 read only the window starting 18:10 — **the windows at 18:00 and 18:05 were on no dot at all.** So `current_orders`, `max_orders`, `remaining`, `available` and `bound_by` on every row of the dashboard's `slots` were computed from a window two-thirds of the grid never covers.

It was **half hidden**, which is why it survived the previous build's harnesses: the map immediately after overwrites `tone` and `label` from `dayIndicators`, which *did* get the right interval. So the strip would have shown a correctly **RED** dot sitting beside a `current_orders` of **0** and `available: true`.

**And it is not cosmetic.** `AddOrderPanel` picks its default slot with:

```ts
slot: fitSlot ?? manualSlots.find(s => !s.is_grace && s.available) ?? manualAsapSlot
```

where offline `manualSlots` **is** that cached array. So an operator adding an order offline on a 15-minute grid could have been handed a default slot whose `available: true` came from a window nothing had looked at.

**Fixed** by passing the grid's own interval:

```ts
slotsWithCapacity = buildSlotAvailability({
  times: slots || [],
  …
  displayIntervalMins: truckIntervalMins,
  date,
  …
})
```

Every field on every row now comes from the grid the row is actually displayed on. At 5 this is a no-op (the parameter's default was already 5), which is why nothing changes for any live truck.

⚠️ **One related item deliberately left alone:** `bindRemaining` is computed outside the gate —

```ts
const w = back.byStart.get(slotMins - step) ?? null
const bindRemaining = w ? (kitchenCapacity == null ? UNLIMITED : Math.max(0, Math.round(w.remainingTotal))) : (kitchenCapacity ?? UNLIMITED)
```

— so `remaining` is a single-window read at every interval, in both branches, in `/api/slots` as well. **No operator-facing surface reads it** (`AddOrderPanel`'s only `.remaining` use is stock, not slots; the dashboard page reads neither `remaining` nor `current_orders`). Changing it would alter `/api/slots` output for the customer path, which this brief does not authorise. Recorded in §9.

---

## R4 — how each customer surface learns its event, and so its van

| Surface | Knows the event? | Knows the van? |
|---|---|---|
| `/api/slots` | ✅ `event_id` query param, else the date's first non-cancelled event | ✅ `todayEvent.van_id` — already selected |
| `/api/menu` | ✅ `?event_id=` (the customer page always passes it once an event is selected: `` const menuUrl = event?.id ? `/api/menu/${slug}?event_id=${event.id}` : `/api/menu/${slug}` ``), else the open event | ✅ already selects `van_id` and reads the van for `auto_pause_on_offline` |
| Fallback picker | ✅ the selected `event` object in page state | 🔴 **NO** — `/api/events` selected `'id, event_date, start_time, end_time, venue_name, town, postcode, notes, status, opened_at'`, with **no `van_id`** |
| Customer submit / `promoteDraft` | ✅ `eventRow?.id` | ✅ via `eventKitchenCapacity`, which resolves the event and reads `van_id` |

**No STOP.** Only the fallback picker lacked a route to the van, and it is the one surface whose data source I control end to end — `/api/events` now resolves it. Per V2/B3 the interval is attached **to each event**, never truck-wide, and only the customer value is published.

---

# WHAT CHANGED, BY SYMBOL

### New

- **`supabase/migrations/20260917_van_collection_intervals.sql`** — written, **NOT applied**. Text in §5.
- **`scripts/slot-interval-van-resolution.cjs`** — the V2 proof.
- **`lib/slot-interval.ts`** — `readOperatorInterval` **removed**; new `VanIntervals`, `NO_VAN_INTERVALS`, and `readVanIntervals(supabase, vanId)`. It takes a **van id, never an event or a truck**, so the event→van resolution stays with the callers that already do it and cannot fork. The override rule is an explicit null branch: `override === null || override === undefined ? customer : normaliseInterval(override)` — 🔴 *not* `normaliseInterval(override)`, which would read NULL as 5 and hand a customer-15 van a 5-minute operator grid. Capability-probed exactly as before (PGRST204 / 42703 logged distinguishably, `NO_VAN_INTERVALS` on every failure, never a 500), and deliberately a **separate select** so it can never 42703 a route's existing named van read.
- **`lib/slot-generation.ts`** — `intervalExample(intervalMins)`, which calls `generateCollectionTimes('18:00', '23:00', iv, iv, 0).slice(0, 3)`. 🔴 The Manage example lines come from the real generator; there is no second list.

### Routing

- **`app/api/slots/[truckId]/route.ts`** — `readVanIntervals(supabase, todayEvent?.van_id ?? null)`; `customerInterval = todayEvent?.van_id ? vanIntervals.customer : (truck.collection_interval_mins ?? 0)`; `intervalMins = operator ? vanIntervals.truck : customerInterval`. `resolveTruck`'s select is **unchanged** and still reads `trucks.collection_interval_mins` — it is the no-van customer value and carries the legacy 0 contract.
- **`app/api/dashboard/route.ts`** — `readVanIntervals(supabase, selectedEvent?.van_id ?? null)`; `truckIntervalMins = vanIntervals.truck`; **plus the R3 fix** (`displayIntervalMins: truckIntervalMins` on `buildSlotAvailability`).
- **`lib/orders/place-in-slot.ts`** — `eventKitchenCapacity` additionally returns `vanId`. 🔴 Its `truck_vans` select is **untouched**: naming the interval columns on that named select would 42703 the read customer placement depends on.
- **`app/api/orders/submit/route.ts`** and **`lib/payments/promote-draft.ts`** — take `vanId` from `eventKitchenCapacity`, then `customerIntervalMins = vanId ? vanIv.customer : (truck.collection_interval_mins ?? 0)`, passed to `placeOrderInSlotLocked`. Neither ever reads `vanIv.truck`.
- **`app/api/events/route.ts`** — selects `van_id`; one batched `readVanIntervals` per distinct van; each event gains `collection_interval_mins`. Only `iv.customer` is published.
- **`app/trucks/[slug]/order/page.tsx`** — `availableMinutes` uses `clockGridMinutes(event?.collection_interval_mins ?? 5)`; `EventData` gains the field; `TruckData` loses it.
- **`app/api/menu/[truckId]/route.ts`** — the truck-wide `collection_interval_mins` added by the previous build is **removed** (it was truck-wide, which V2 forbids).

### Settings

- **`app/api/manage/route.ts`** — both keys **removed** from `update_truck`'s allowlist and its validation loop deleted; both **added** to `update_van_settings`' destructure with server-side validation returning a visible **400** (`Collection times must be every 5, 10, 15, 20, 30 minutes.`), the override accepting `null` explicitly; both added to `get_vans`' named select.
- **`app/manage/[token]/page.tsx`** — the per-truck "Collection times" sub-card **removed**; a per-van box added **directly above** each van's Kitchen capacity box; `Van` interface gains both columns; `Truck` loses them; `updateVanSetting`'s field union gains both.
- **`lib/supabase.ts`** — `Truck.operator_collection_interval_mins` removed.

### Docs (B5)

- **`docs/slot-interval-build-report.md`** — the A-facts sentence read *"no Gusto event has ever existed and no truck has an event from today onward whose start is off a 5-minute mark"*. The first clause was **wrong** — Gusto has three upcoming events — and was never what the LIVE query established. Corrected to the 5-minute-mark fact alone, with the correction noted inline. It mattered: the false clause implied Gusto could not be touched by an event-shaped change at all, which is the opposite of R2's finding.

---

# THE MIGRATION (written, NOT applied) and verification SQL

`supabase/migrations/20260917_van_collection_intervals.sql`:

```sql
set lock_timeout = '3s';

begin;

alter table public.truck_vans
  add column if not exists collection_interval_mins integer not null default 5;

alter table public.truck_vans
  drop constraint if exists truck_vans_collection_interval_mins_check;
alter table public.truck_vans
  add constraint truck_vans_collection_interval_mins_check
  check (collection_interval_mins in (5, 10, 15, 20, 30));

alter table public.truck_vans
  add column if not exists operator_collection_interval_mins integer;

alter table public.truck_vans
  drop constraint if exists truck_vans_operator_collection_interval_mins_check;
alter table public.truck_vans
  add constraint truck_vans_operator_collection_interval_mins_check
  check (operator_collection_interval_mins is null
         or operator_collection_interval_mins in (5, 10, 15, 20, 30));

alter table public.trucks
  drop constraint if exists trucks_operator_collection_interval_mins_check;
alter table public.trucks
  drop column if exists operator_collection_interval_mins;

commit;

notify pgrst, 'reload schema';
```

Safe on LIVE data: all 13 vans take `collection_interval_mins = 5` from the default and a NULL override, so both grids resolve to 5 — the value every truck reads today. `drop … if exists` makes the trucks clean-up a no-op when `20260916` was never applied.

### Verification (read-only, run after applying)

```sql
select information_schema.columns.column_name,
       information_schema.columns.data_type,
       information_schema.columns.is_nullable,
       information_schema.columns.column_default
from information_schema.columns
where information_schema.columns.table_schema = 'public'
  and information_schema.columns.table_name = 'truck_vans'
  and information_schema.columns.column_name in ('collection_interval_mins', 'operator_collection_interval_mins')
order by information_schema.columns.column_name;
```
Expected: `collection_interval_mins · integer · NO · 5` and `operator_collection_interval_mins · integer · YES · (null)`.

```sql
select pg_constraint.conname,
       pg_get_constraintdef(pg_constraint.oid) as definition
from pg_constraint
join pg_class on pg_class.oid = pg_constraint.conrelid
join pg_namespace on pg_namespace.oid = pg_class.relnamespace
where pg_namespace.nspname = 'public'
  and pg_class.relname = 'truck_vans'
  and pg_constraint.conname like '%collection_interval%'
order by pg_constraint.conname;
```
Expected: two rows — the customer CHECK `IN (5, 10, 15, 20, 30)`, the override CHECK `IS NULL OR … IN (5, 10, 15, 20, 30)`.

```sql
select information_schema.columns.column_name
from information_schema.columns
where information_schema.columns.table_schema = 'public'
  and information_schema.columns.table_name = 'trucks'
  and information_schema.columns.column_name = 'operator_collection_interval_mins';
```
Expected: **zero rows** — the column is gone.

```sql
select truck_vans.truck_id,
       truck_vans.name,
       truck_vans.collection_interval_mins,
       truck_vans.operator_collection_interval_mins
from public.truck_vans
order by truck_vans.truck_id, truck_vans.name;
```
Expected: **13 rows, every one `5` and `null`.**

```sql
select information_schema.columns.column_name,
       information_schema.columns.data_type
from information_schema.columns
where information_schema.columns.table_schema = 'public'
  and information_schema.columns.table_name = 'trucks'
  and information_schema.columns.column_name = 'collection_interval_mins';
```
Expected: one row, `integer` — untouched, still read for the no-van case.

---

# HARNESSES

Each broken variant ran **first** and reported FAILURE before the real code ran.

### `scripts/slot-interval-van-resolution.cjs` (NEW)

**Failure mode:** two vans of one truck sharing a grid because something resolved by truck; a NULL override read as 5; the offline grid on the customer interval; an event with no van inventing a grid; a Gusto-shaped van differing from HEAD.

**Broken variants — all FAILED as required:**
- V1 resolution by truck — both events read 15, so van-b's 30 is unreachable ✓
- V2 NULL override read as 5 — a customer-30 van hands its operator 5, not 30 ✓
- V3 offline grid on the customer interval — 11 slots against the dots' 31 ✓

**Real run — ✅ van resolution proven.** `readVanIntervals` is compiled from the working tree and driven through a fake supabase client, so the real branch order is under test. van-a (customer 15, override 5) → 15/5; van-b (customer 30, override null) → 30/**30**; the two events share no interval; an event with no van returns literally `NO_VAN_INTERVALS` with no query; the interval van equals the kitchen_capacity van for all five FIXTURE events; the cached offline grid equals the dot grid at the effective truck interval for every case; a 17:50 start gives customer-15 → 18:00 and operator-5 → 17:50 (D1 intact); and **1,152 FIXTURE grids at the Gusto-shaped resolved 5 are byte-identical to HEAD's generator** (every start on the 5 grid × durations 5/10 × graces 0/30, compiled from a clean `git worktree`).

### `scripts/slot-interval-grid-routing.cjs` (UPDATED for van level)

**Failure mode:** an operator list drawn from the customer interval when the van has an override; `/api/slots` handing the operator grid to an unauthenticated caller; a customer placement on anything but the event's van's customer value; the override leaking to a public endpoint; any path still reading the dropped trucks column.

**Broken variant — FAILED as required:** V1 operator ignoring the van override — 18:05 NOT on the operator list (interval 15) ✓

**Real run — ✅ 30 assertions.** Model: customer→15, operator→5 on an override van; **NULL override → operator follows the customer value (15)**; no van → 5/5; legacy truck 0 preserved. Source: `readVanIntervals` is given `todayEvent.van_id` and that is the same id the `kitchen_capacity` select uses; both AddOrderPanel fetches send the token; the `manual` branch never calls `placeOrderInSlotLocked`; submit and `promoteDraft` apply the identical customer rule and never read `.truck`; `/api/events` publishes only `iv.customer`, attached per event; the fallback picker reads the selected event; and **seven files confirmed not to read `trucks.operator_collection_interval_mins`**, with `readOperatorInterval` gone from every route.

### `scripts/slot-interval-settings.cjs` (UPDATED for van level)

**Failure mode:** the allowlist silently dropping a key; a key missing from `get_vans`' named select so the value writes and never reads back; 7 or `"15"` reaching the DB; null refused so the box can be ticked and never unticked; the tickbox backed by a second stored flag; hard-coded examples; the box rendering below Kitchen capacity.

**Broken variants — all FAILED as required:**
- V1 override missing from `update_van_settings`' destructure → silently dropped ✓
- V2 override missing from `get_vans`' select → writes but never reads back ✓
- V3 override read through `normaliseInterval` → a NULL override on a customer-15 van gives 5 ✓

**Real run — ✅ 49 assertions.** Both keys in the 10-field destructure and validated with a visible 400; null accepted **explicitly** for the override; both in `get_vans`' select; neither in `update_truck`; **410 source files scanned** and the dropped trucks column read in none; the migration matches `INTERVAL_CHOICES` and V1's nullability. V4 copy asserted literally — title, the single intro line, `Customer Collection Times`, `Your Collection Times`, `Use different times for orders I add`, the wording switch (`Customers can pick` / `You and your customers can pick`), `You can pick …`, `Every N minutes` — plus **no stray prose in the box** (every rendered sentence must be one V4 names) and **the box renders before Kitchen capacity**. Behaviour: the tickbox is derived from the override being non-null with no such flag anywhere on the page; ticking saves the current customer value and unticking saves `null`; the second select renders only when ticked. Examples: `intervalExample` lives beside `generateCollectionTimes` and **calls it**; reads `18:00, 18:15, 18:30…` at 15 and `18:00, 18:05, 18:10…` at 5; all five choices start at 18:00 with three times and an ellipsis; the page hard-codes no example string.

### Unchanged harnesses, rerun

`slot-interval-generator.cjs` ✅ 23 · `slot-interval-engine-identity.cjs` ✅ 10 cases byte-identical, §31 facts hold · `slot-interval-dots.cjs` ✅ (68 cases identical to HEAD at 5; C1 at 15 red with "peak 2 Pizzas"; 228 single-window fixtures each lighting exactly one dot).

---

# VERIFICATION

- **All 18 harnesses pass** — 6 × `slot-interval-*`, 7 × `outreach-*` (343/26/18/15/18/25/9), 5 × `whatsapp-*` (48/87/37/131/30).
- **`tsc --noEmit`** — no errors.
- **`next build`** — compiled successfully, TypeScript passed, 95/95 static pages.
- **eslint vs a clean HEAD worktree (17 changed files)** — HEAD 644 → working tree **643**. **Delta per rule: `@typescript-eslint/no-unused-vars` (severity 1) −1**, and nothing else changed. **New messages: none.** The single removal is the dead `MINUTES` const deleted in the earlier slot-interval build. `lib/slot-interval.ts`: 0 messages.
- **Engine byte-identity** — `projectBackwardOccupancy` (11,473 bytes), `fitOrderBackward` (1,155), `earliestBackwardFitSlot` (1,232), `windowScopedPeak` (904), `backwardWindowStepMins` (293), `loadRunsOffFront` (639), `placeInstantPoints` (576), `buildUnitsFromOrders` (3,792), `rebuildProductionSlotUsage` (1,544) — **all identical to HEAD**. `git diff -U0 lib/orders/place-in-slot.ts` shows hunks in **`eventKitchenCapacity` only**; `placeOrderInSlotLocked`'s off-list branch is untouched.
- **Plain-English checker** — run: **111/112 pass, 1 known violation** (the pre-existing "QR: print or display" line), unchanged. 🔴 **It does not cover this page.** Its corpus is an explicit hand-maintained dictionary of the embed/custom-domain wizard's strings; it scrapes no files and contains nothing from Manage → Settings. The V4 copy is instead asserted literally by `slot-interval-settings.cjs`.
- **`git diff --stat`** — 17 files changed, 423 insertions, 36 deletions.

---

# LOCALHOST TEST SCRIPT

**Apply the migration first — see §7.** Then `npm run dev` and work through these. **Use `test truck` (which has two vans, Van1 and Van2) throughout. Nothing here touches Pizzeria Gusto except step 9, which only looks.**

1. **Set the two vans differently.** Open Manage → Settings for `test truck`. Each van now has a **Collection times** box directly above its Kitchen capacity box. On **Van1**, set *Customer Collection Times* to **Every 15 minutes**. Leave **Van2** at *Every 5 minutes*. Check the line under Van1's select now reads **"You and your customers can pick 18:00, 18:15, 18:30…"** and Van2's still reads **"…18:00, 18:05, 18:10…"**.

2. **Tick the box on Van1.** Tick **"Use different times for orders I add"**. Confirm three things at once: a second select appears labelled **Your Collection Times**, it is pre-set to **Every 15 minutes** (the current customer value), and the line under the *first* select changes from "You and your customers can pick" to **"Customers can pick 18:00, 18:15, 18:30…"**.

3. **Change the operator value and watch the example.** Set *Your Collection Times* to **Every 5 minutes**. The line beneath it must immediately read **"You can pick 18:00, 18:05, 18:10…"**. Reload the page and confirm both selects and the tick survive.

4. **Untick, and confirm it really cleared.** Untick the box. The second select disappears and the first line returns to **"You and your customers can pick…"**. Reload — the box must still be unticked. (This is the step that catches a null the route refused to write.) Then **tick it again and set it back to Every 5 minutes** for the steps below.

5. **The customer page, per van.** Create or open one event on **Van1** and one on **Van2**, both today, both starting 18:00. Open the customer order page for the Van1 event: the selectable times must be **18:00, 18:15, 18:30…**. Open the Van2 event's page: **18:00, 18:05, 18:10…**. 🔴 Two vans of one truck, two different grids, at the same moment — this is the whole point of the change.

6. **Add Order, box ticked and unticked.** On the dashboard for the **Van1** event, open Add Order. With the box ticked at operator 5, the list shows **18:00, 18:05, 18:10…** while the customer page still shows 15-minute times. Pick **18:05** and confirm the order is accepted and capacity-checked (not treated as off-list). Now untick the box in Manage, reload the dashboard, and reopen Add Order: the list must fall back to the customer's **15-minute** grid.

7. **The dots at 15 — the §31 C1 case.** With Van1's customer interval at 15 and the box **unticked** (so the operator grid is 15 too), place an order of **3 pizzas for 18:10** from the customer page — or, if 18:10 is not selectable, from Add Order with the box ticked at 5. Then look at the dashboard day-load strip: the **18:15** dot must be **red** and labelled **"peak 2 Pizzas"**. The 18:00 dot stays green. 🔴 If 18:15 is green, the covering read is not running.

8. **A 17:50 start.** Change the Van1 event's start time to **17:50**. At customer 15 the first selectable time must be **18:00** (clock anchoring — times are multiples of the interval from midnight, not from the event start). Tick the box, set the operator to 5, and Add Order's first slot becomes **17:50**. If you placed a pre-open order, it must appear on the **18:00** dot.

9. **Put it all back, then look at Gusto without saving.** Set both vans to **Every 5 minutes** with the box **unticked**, and restore the event start time. Confirm the customer page and Add Order are back to 5-minute times and the dots look as they did at the start. Then open **Pizzeria Gusto's** Manage → Settings and *look only*: its one van must show **Every 5 minutes**, box **unticked**, second select absent. 🔴 **Change nothing and save nothing on Gusto.**

---

# APPLY ORDER

> 🔴 **CORRECTED 17 September 2026. THE VERSION BELOW THIS LINE WAS WRONG AND IS REPLACED.**
> It told you to **skip `20260916_collection_intervals.sql`**. That was wrong on a fact I had not
> checked: **`20260916` was already applied on 16 September** — Dominic verified the `trucks` column and
> both constraints live. Telling anyone to skip an applied migration is worse than telling them to apply
> one twice, because the second is idempotent and the first invites a "why is this column here" hunt.
> **I should have read the live schema before writing an apply order about it, and did not.**
>
> **BOTH MIGRATIONS ARE NOW APPLIED. Verified live, read-only, 17 September 2026:**
> `truck_vans.collection_interval_mins` `integer NOT NULL default 5` · `truck_vans.operator_collection_interval_mins` `integer NULL, no default` · `trucks.operator_collection_interval_mins` **absent** · `trucks.collection_interval_mins` `integer NULL default 5`, untouched.
>
> **So there is no apply order left to follow — only a verification, and it has passed.** The five
> queries in §5 are the check; run them again after any deploy. The live state is the target state, and
> `test-truck`'s Van2 already carries a real non-default setting (customer 15, override 5), which is the
> first van in the system to hold one.
>
> See `docs/slot-interval-hardening-report.md` for the pre-deploy checklist that replaces this section.

# MANUAL SECTIONS MADE STALE

`docs/reference-manual.md` is **not edited**. For a later pass:

1. **§31 and §14** — any statement that collection times are a truck-level setting. Both intervals are now **per van**, resolved from the event's van exactly as `kitchen_capacity` is.
2. **§10 / §4 / §6** — "every 5 minutes" statements: now "every N minutes, per van, per audience", set in Manage → Settings inside each van's **Collection times** box.
3. **The §10 column list for `trucks`** — `trucks.collection_interval_mins` is now read **only** for an event whose van does not resolve (and for its legacy `interval 0 ⇒ collection_times` contract) and is **no longer editable**. `trucks.operator_collection_interval_mins` never reached a deployed read and is dropped.
4. **The `truck_vans` column list** — gains `collection_interval_mins` (NOT NULL default 5) and `operator_collection_interval_mins` (nullable, no default, **NULL means "same as customers"**).
5. **V11.15 / the off-by-one note** — grids are clock-anchored from midnight; the first slot is the first multiple ≥ the event start. Unchanged by this work, still stale in the manual.
6. **Any note that `update_truck` carries the interval keys** — they are on `update_van_settings` now, with a 400 rather than a silent drop.

---

# WHAT I COULD NOT ESTABLISH

1. **Whether the migration applies cleanly** — it has not been run. `add column if not exists` succeeds whether or not it adds anything (§35), so the §5 row count is the only thing that will prove it.
2. **Whether any van is on a non-5 interval** — none can be until the migration runs. Every behavioural claim about 10–30 is proven against FIXTURES and the compiled generator, never against live data.
3. **The rendered appearance of the new box** — asserted by string and by ordering, not seen in a browser. Step 1 of the test script is the first time anyone will look at it.
4. **Whether the two null-van Gusto events are deliberate.** R2 found 2 of 3 upcoming Gusto events with `van_id` NULL. Under V2 they resolve to 5/5 and are unaffected — but if those events *should* carry Van1, they are also missing its `kitchen_capacity = 2` ceiling today, which is a capacity question wider than this brief. **Flagged, not touched.**
5. **`seedDemoOrders`' split resolution** — capacity from the van, interval from the truck. Identical output while everything is 5, and out of this brief's scope. Left as is.
6. **`bindRemaining`'s single-window read** — outside the display-interval gate in both branches, affecting `/api/slots` as well as `/api/dashboard`. No operator-facing surface reads `remaining`, and changing it would alter customer-facing output this brief does not cover. **Recorded, not changed.**

---

**Nothing was staged, committed, deployed, or written to any database.** Every database read in this report was a `GET`.
