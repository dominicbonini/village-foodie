# Collection times — THE EVENT-LEVEL SETTING ON THE DASHBOARD

**17 September 2026 · HEAD `fc0fddc outreach` · Localhost only. Nothing deployed, migration NOT applied, nothing written to any database.**

The Collection times box now appears on the dashboard, where a change applies to that event only. Manage still sets the van.

> 🔴 **R1(d), IN ONE SENTENCE — AND IT REQUIRED A DECISION FROM DOMINIC, NOT A READING.**
> **The codebase carries TWO rules and says so out loud**, so this could not be inferred: `order_ready_override` is **bulk-written** onto every event when the Manage default flips (*"they reset to the new value, by design"*), while `show_paid_step_override` / `takes_cash_override` / `completion_presses_override` are **deliberately left alone** — `lib/payments/paid-step.ts` calls the bulk write *"WRONG here"* for a setting an operator sets per event. **I stopped and asked. Dominic chose the order-ready rule: a Manage change RESETS this van's events.**

Figures are **LIVE** (read from production today, read-only), **CODE**, or **FIXTURE**.

---

## 0. git status

### Before
17 modified, 13 untracked — as the brief predicted.

### After
**18 modified, 15 untracked.** One file joined the modified set (`app/api/dashboard/action/route.ts`); two joined the untracked set (`scripts/slot-interval-event-override.cjs`, `supabase/migrations/20260918_event_collection_intervals.sql`). Full listing in §8. **Nothing staged, nothing committed.**

---

# READS

## R1 — the existing Manage-vs-dashboard pattern

Schema first, as required. PostgREST's OpenAPI document is its live schema cache and the faithful substitute where no SQL endpoint is exposed:

```sql
select information_schema.columns.table_name,
       information_schema.columns.column_name,
       information_schema.columns.data_type,
       information_schema.columns.is_nullable,
       information_schema.columns.column_default
from information_schema.columns
where information_schema.columns.table_schema = 'public'
  and information_schema.columns.table_name = 'truck_events'
  and (information_schema.columns.column_name like '%_override'
       or information_schema.columns.column_name = 'buzzer_prompt')
order by information_schema.columns.column_name;
```

Observed LIVE — **45 columns on `truck_events`**, eight of them the override family, every one nullable with no default:

| column | type | nullable | default |
|---|---|---|---|
| `completion_presses_override` | text | YES | none |
| `offline_auto_reject_mins_override` | **integer** | YES | none |
| `offline_protection_mode_override` | text | YES | none |
| `offline_protection_override` | boolean | YES | none |
| `order_ready_override` | boolean | YES | none |
| `show_paid_step_override` | boolean | YES | none |
| `takes_cash_override` | boolean | YES | none |
| `buzzer_prompt` | boolean | YES | none |

`offline_auto_reject_mins_override` is the exact shape the two new columns take. `buzzer_prompt` is the one member without the suffix — the `*_override` convention is otherwise unbroken, so E1 follows it.

### (a) Where the dashboard control lives, and the "this event only" copy

Dashboard → **Settings** tab, in the per-event card. 🔴 **There is no per-row scope copy, and that is a standing rule, not a gap:**

> *"🔴 **DO NOT ADD PER-EVENT SCOPE WORDING TO THESE ROWS.** SCOPE IS A PROPERTY OF THE SCREEN, NOT OF EACH SETTING. Dashboard → Settings is PER-EVENT; Manage → Settings is TRUCK-WIDE… This is a **DESIGN DECISION, NOT AN UNCLOSED GAP**. Scope wording was removed deliberately on 30 July 2026 — from the heading sub-label (*"This event only. Your usual settings live in Manage → Settings."*) and from the cash row… ⚠️ Do NOT reinstate either, and do NOT add equivalent wording to any other row on this tab."*

⚠️ The same comment records that the rule's *"every option on this tab"* claim is **no longer literally true** — "Menu layout" and "Online card payments" are truck-wide and each flags itself in its own header. The per-row wording rule is unchanged and still binding.

**Consequence for E3, and Dominic confirmed it:** the existing convention *is* "add nothing". The dashboard box carries the same copy as Manage and no scope marker.

### (b) How an override is written, and how it is cleared

Writing is consistent across the family — each `set_*_override` action writes `truck_events` only, never the truck/van column, and returns the updated row:

```ts
if (action === 'set_show_paid_step_override') {
  const { value, eventId } = body
  if (!eventId) return NextResponse.json({ error: 'Missing eventId' }, { status: 400 })
  if (value !== null && typeof value !== 'boolean') {
    return NextResponse.json({ error: 'value must be true, false, or null to clear' }, { status: 400 })
  }
  const { data: rows, error } = await supabase.from('truck_events')
    .update({ show_paid_step_override: value }).eq('id', eventId).eq('truck_id', truck.id)
    .select('*')
  …
  return NextResponse.json({ success: true, event: rows?.[0] ?? null })
}
```

Three properties worth copying, all documented in that block: **`select('*')` not a named list** (*"a named select naming a column that does not exist fails the WHOLE statement with 42703"*); **no `.single()`** (PGRST116 on zero rows would turn a no-op into a 500); and **validated, not coerced**, with `undefined` rejected because *"an omitted field is a client bug, and silently clearing an override on one would be the quiet kind of wrong."*

🔴 **But clearing has no control in the product.** The routes accept `null`, the client savers are typed `boolean|null`, and `USUAL_SETTING_TOAST = 'Back to your usual setting for this event'` exists — yet **every call site passes a boolean** (`savePaidStepOverride(!effectivePaidStep)`), and a repo-wide search for a `null`-passing call finds none. The page says so:

> *"🔴 **THE RESET AFFORDANCE WENT WITH IT, ON EXPLICIT INSTRUCTION, AND THAT HAS A COST.** "Use my usual setting" was the only route from an overridden event back to inheriting the truck default. With it gone, the three `set_*_override` handlers still ACCEPT null… but **nothing in the product sends it**… a hand-matched event **SILENTLY STOPS TRACKING** the default when it later changes — coinciding and inheriting are different states… 🔴 **TO RESTORE IT: render a single "Use my usual setting" control per row calling the row's existing save function with `null`.** No migration, no new action, no outbox op."*

**Dominic chose to add that control for the Collection times box.** It is implemented exactly as that note prescribes.

### (c) How effective values resolve

One resolver per family, never inline. `lib/payments/paid-step.ts`:

```ts
const showPaidStep = event?.show_paid_step_override ?? truck?.show_paid_step ?? false
return {
  showPaidStep,
  takesCash: event?.takes_cash_override ?? truck?.takes_cash ?? false,
  …
}
```

> *"`??` and not `||`: an explicit override of FALSE must be honoured, not fall through to the default. `||` would treat `false` as "unset" and silently re-inherit — the bug this nullish chain avoids."*

`lib/buzzer.ts` mirrors it at van level (`event?.buzzer_prompt ?? true`, gated on `van?.buzzer_count`), and `/api/dashboard` resolves `effectiveOrderReady = event.order_ready_override ?? vanOrderReadyDefault ?? false`. **Chain shape: event → van/truck → literal default.** The new resolver follows it.

### (d) 🔴 THE RULE — AND THERE ARE TWO OF THEM

**Rule A — `order_ready_override`: seeded and bulk-written.** Seeded at creation (`order_ready_override: seededOrderReady`), and on a Manage change:

```ts
// MASTER SWITCH (order-ready): flipping the Settings default bulk-writes order_ready_override onto
// EVERY event for this truck — including events previously toggled on the dashboard (they reset to the
// new value, by design). Scope = all of the truck's events (simplest; single-van trucks are the norm).
if (order_ready_enabled !== undefined) {
  await supabase.from('truck_events')
    .update({ order_ready_override: order_ready_enabled })
    .eq('truck_id', truck.id)
}
```

⚠️ **No date filter — past events included.**

**Rule B — the paid-step family: left alone.** No seeding, no bulk write, and `paid-step.ts` argues against Rule A explicitly:

> *"⚠️ **DELIBERATELY UNLIKE `order_ready_override`, WHICH THIS OTHERWISE MIRRORS.** That column is SEEDED at event creation and BULK-WRITTEN onto every existing event when the truck default flips… Correct for the order-ready step; **WRONG here.** An operator who set Saturday's festival to take payment at order must not lose that because they changed their general default a week later. So: NO seeding at event creation, NO bulk write. Null-means-inherit gives the right behaviour for free… **Both properties come from doing nothing.**"*

**This is the STOP the brief called for. I did not choose. Dominic chose Rule A.**

### (e) Offline behaviour

**Dashboard override changes do not work offline.** Every control is `disabled={isOffline||!activeEvent}`, and the savers are plain `fetch` calls with no outbox op. The new box follows this exactly — `disabled={isOffline||savingIntervals}` on every control.

## R2 — where dashboard event settings render and save

**Render:** `app/dashboard/[token]/page.tsx`, Settings tab, in the per-event card — "Take orders without payment", "Completing an unpaid order", "Do you take cash?", "Remind me to add a buzzer". The new box is a sibling card immediately before the buzzer card.

**Save:** `POST /api/dashboard/action`. 🔴 **There is no action allowlist** — the route is a chain of `if (action === '…')`, so a new action needs no registration. All override handlers use `select('*')`, which is already safe.

🔴 **But the route's main `truck_events` READ is a named select, and it carries its own warning:**

```ts
supabase
  .from('truck_events')
  // ⚠️ NAMED SELECT — every column here must exist or PostgREST returns 42703 and the WHOLE
  // statement fails, which lands on the silent-empty-board path documented directly below.
  // `buzzer_prompt` is added by supabase/migrations/20260803_buzzer_settings.sql: apply it BEFORE
```

**So the new columns must not go on it** — the named-select rule, exactly as in the hardening work. They are read by `readEventIntervalsForTruck`, a separate probed query.

## R3 — every reader that needed the event layer

| Reader | Before | After |
|---|---|---|
| `/api/slots` | `readVanIntervals(supabase, todayEvent?.van_id)` | `resolveIntervalsFor(supabase, todayEvent?.van_id, todayEvent?.id)` |
| `/api/dashboard` (grid, dots, `detectCapacityBreaches`, `offlineCapacity`) | `readVanIntervals(supabase, selectedEvent?.van_id)` | `resolveIntervalsFor(supabase, selectedEvent?.van_id, selectedEvent?.id)` |
| `/api/events` | `readVanIntervals` per van → `iv.customer` | van pair per van + `readEventIntervalsForTruck` → `applyEventIntervals(...).customer` |
| customer `submit` | `readVanIntervals(supabase, vanId)` | `resolveIntervalsFor(supabase, vanId, eventRow?.id)` |
| `promoteDraft` | same | same |
| `AddOrderPanel` (list + fresh re-check) | reads `capacityInputs.intervalMins` from `/api/slots`, or the cached `offlineCapacity.intervalMins` | **unchanged** — both now carry the event-resolved value |
| Manage `get_vans` | `readVanIntervalsForTruck` | **unchanged** — Manage sets the van, not the event |

---

# WHAT CHANGED, BY SYMBOL

### New

- **`supabase/migrations/20260918_event_collection_intervals.sql`** — written, **NOT applied**. Text in §5.
- **`scripts/slot-interval-event-override.cjs`** — the E2/E3/E5 proof.
- **`lib/slot-interval.ts`** — the event layer:
  - `EventIntervalOverride`, `EventIntervalRead`, `NO_EVENT_OVERRIDE`.
  - **`applyEventIntervals(van, override)`** — 🔴 the one place the three layers meet. Null customer override ⇒ the van's pair untouched. Non-null ⇒ `{ customer, truck: operatorOverride ?? customer }`, **the van ignored, not merged**. The `??` falls back to *the event's own* customer value, never the van's — a van-operator value beside an event-customer value is a pair that exists in neither place and no screen shows.
  - **`hasEventOverride(override)`** — the switch, and what gates the revert control.
  - **`readEventIntervals(supabase, eventId)`** / **`readEventIntervalsForTruck(supabase, truckId)`** — capability-probed, `PGRST204`/`42703` logged distinguishably, every failure ⇒ "no override" so the event falls back to its van.
  - **`resolveIntervalsFor(supabase, vanId, eventId)`** — the single resolver every R3 reader calls. It resolves no events and chooses no vans; both ids come from the caller's existing resolution.

### Routing

- **`/api/slots`**, **`/api/dashboard`**, **`submit`**, **`promoteDraft`** — through `resolveIntervalsFor`. The two customer paths gained `|| vanIv.fromEvent` so an event override still applies on a van-less event; the legacy truck fallback and its `0 ⇒ collection_times` contract are otherwise untouched.
- **`/api/events`** — `applyEventIntervals(vanPair, eventOverride).customer` per event. 🔴 Only `.customer` is published.
- **`/api/dashboard`** response gains `eventIntervals`, `eventIntervalsAvailable`, `vanIntervals` — read by the box and by nothing that orders.

### Dashboard

- **`app/dashboard/[token]/page.tsx`** — `eventIntervals` / `eventIntervalsAvailable` (default **true**, so an older response shape behaves as before) / `vanIntervalPair` / `savingIntervals` state; **`saveCollectionIntervals(customer, operator)`** writing both columns in one call; and the box itself, rendered as a sibling card in the per-event settings card, **above** the buzzer card.
- **`/api/dashboard/action`** — **`set_collection_intervals_override`**: validates both values against `INTERVAL_CHOICES`, rejects `undefined`, **refuses an operator value with a null customer value (400, "Set the customer collection times before setting your own.")**, writes both columns in one `UPDATE … select('*')`, and returns a visible 500 with distinguishable logging if the columns are missing.

### Manage (E4 — Rule A, Dominic's choice)

- **`app/api/manage/route.ts`** — when `update_van_settings` changes an interval, this van's events are **reset**:

```ts
if (Object.keys(intervalUpdates).length) {
  const { error: resetErr } = await supabase
    .from('truck_events')
    .update({ collection_interval_mins_override: null, operator_collection_interval_mins_override: null })
    .eq('truck_id', truck.id)
    .eq('van_id', vanId)
  if (resetErr) console.warn(…)
}
```

🔴 **It clears to NULL rather than writing the van's number, and that is not a shortcut.** Writing the value in would leave every event permanently *holding* an override — and a non-null customer column **is** the definition of "this event has its own pair". Every event would stop following the van forever, the revert control would have nothing to revert, and only the next Manage change could move them. Clearing gives the same grid today **and** keeps them following the van tomorrow, which is what "reset" means.

⚠️ **Scope is this van's events, not the truck's.** `order_ready`'s bulk write is `.eq('truck_id', …)` because that switch applies one van's value truck-wide; collection times are per-van, so resetting another van's events for a change that cannot affect them would be a bug wearing consistency's clothes. Same rule, correct scope. No date filter, matching `order_ready`. Best-effort and unchecked, like `order_ready`'s — a failure must never fail the van save.

---

# THE MIGRATION (written, NOT applied) and verification SQL

```sql
set lock_timeout = '3s';

begin;

alter table public.truck_events
  add column if not exists collection_interval_mins_override integer;

alter table public.truck_events
  drop constraint if exists truck_events_collection_interval_mins_override_check;
alter table public.truck_events
  add constraint truck_events_collection_interval_mins_override_check
  check (collection_interval_mins_override is null
         or collection_interval_mins_override in (5, 10, 15, 20, 30));

alter table public.truck_events
  add column if not exists operator_collection_interval_mins_override integer;

alter table public.truck_events
  drop constraint if exists truck_events_operator_collection_interval_mins_override_check;
alter table public.truck_events
  add constraint truck_events_operator_collection_interval_mins_override_check
  check (operator_collection_interval_mins_override is null
         or operator_collection_interval_mins_override in (5, 10, 15, 20, 30));

commit;

notify pgrst, 'reload schema';
```

⚠️ **No cross-column CHECK for "operator requires customer", deliberately.** It would also fire on the bulk clear (which writes both to NULL and is correct) and on any future partial write, turning an operator-facing validation message into a `23514` nobody can read. The rule lives in the save route, where it can say something useful; the CHECKs police the vocabulary only.

### Verification (read-only, after applying)

```sql
select information_schema.columns.column_name,
       information_schema.columns.data_type,
       information_schema.columns.is_nullable,
       information_schema.columns.column_default
from information_schema.columns
where information_schema.columns.table_schema = 'public'
  and information_schema.columns.table_name = 'truck_events'
  and information_schema.columns.column_name in
      ('collection_interval_mins_override', 'operator_collection_interval_mins_override')
order by information_schema.columns.column_name;
```
Expect two rows, both `integer · YES · (null default)`.

```sql
select pg_constraint.conname,
       pg_get_constraintdef(pg_constraint.oid) as definition
from pg_constraint
join pg_class on pg_class.oid = pg_constraint.conrelid
join pg_namespace on pg_namespace.oid = pg_class.relnamespace
where pg_namespace.nspname = 'public'
  and pg_class.relname = 'truck_events'
  and pg_constraint.conname like '%collection_interval_mins_override%'
order by pg_constraint.conname;
```
Expect both CHECKs, each `IS NULL OR … IN (5, 10, 15, 20, 30)`.

```sql
select count(*) as total_events,
       count(truck_events.collection_interval_mins_override) as customer_overrides_set,
       count(truck_events.operator_collection_interval_mins_override) as operator_overrides_set
from public.truck_events;
```
Expect **both counts 0** — every row null, so no event's behaviour changes on applying.

```sql
select count(*) as gusto_events,
       count(truck_events.collection_interval_mins_override) as gusto_customer_overrides,
       count(truck_events.operator_collection_interval_mins_override) as gusto_operator_overrides
from public.truck_events
where truck_events.truck_id = 'pizzeria-gusto';
```
Expect **both override counts 0**. Observed today: Gusto has **50** event rows and **neither column exists yet** — read read-only via PostgREST, whose row shape returned `event_date, id, status, van_id` and no override column.

---

# HARNESSES

## `scripts/slot-interval-event-override.cjs` (NEW)

**Failure mode:** an event with no override behaving differently from before the layer existed; an event override of 15 still consulting its van's operator 5; unticking keeping the 10; an operator override honoured with no customer override; the operator value reaching a customer surface; the offline cached grid on the wrong half; or a missing column taking the board down instead of the box.

**Broken variants, run FIRST — all FAILED as required:**

```
✓ FAILED as required  V1 operator honoured with no customer override — gives 15/10 (a pair whose customer
                      grid came from the van and whose operator grid did not); the real rule gives 15/5
✓ FAILED as required  V2 untick writing the old value — the event keeps its operator 10 while the box says
                      it follows customers
⚠️ …the real untick gives 5/5
✓ FAILED as required  V3 override columns added to the dashboard's main event select → one absent column
                      42703s the whole statement onto the silent-empty-board path
```

**Real run — ✅ event override proven (42 assertions).** The resolver is compiled from the working tree and driven through a fake supabase client, so the real branch order is under test:

- **No override ⇒ van-level, unchanged:** `ev-plain` 15/5, `ev-gusto` 5/5, `ev-novan` 5/5, all `fromEvent=false`; a Gusto-shaped event generates the identical 5-minute grid.
- **An override replaces the van entirely:** event customer 15 / operator null → **15/15 even though the van has operator 5**; event 5/10 → 5/10.
- **The untick case:** 5/10 → untick → **5/5**. The 10 is gone, and the operator follows *this event's* customer value (5), not the van's 15 — and the event still has its own pair.
- **Ticking pre-sets to the effective customer value** (15, not the van's 5), and the control is literally `checked ? customer : null`.
- **Revert:** both null → 15/5, the van's pair; `saveCollectionIntervals(null, null)`; shown only when the event has an override.
- **The invalid shape is refused** with a 400 and a message that says what to do — and if such a row ever existed the resolver ignores it rather than inventing a customer grid.
- **Customer paths never see the operator value** — `/api/events` publishes `.customer` and contains no `.truck`; neither `submit` nor `promoteDraft` reads `.truck`; the customer page and `/api/menu` name no operator column.
- **The offline cached grid equals the dot grid** at the event's effective truck interval for all four fixtures (15, 10, 5, 5).
- **Manage resets this van's events**, clearing to null, scoped by `van_id`, only when an interval changed — and an event that held 5/10 then reads the van's new 10/10.
- **A 42703 disables only the box:** the event falls back to its van (15/5), `eventReadOk` false, the dashboard's main event select names neither column, the box shows exactly the one line, an absent flag reads as available, no other setting sits inside that branch, and a save returns a visible error.

## Updated harnesses, and why each assertion changed

**`scripts/slot-interval-grid-routing.cjs` — six assertions, all because the call shape moved:**

| Assertion | Why |
|---|---|
| `/api/slots` resolver call | Now `resolveIntervalsFor(van_id, event_id)`. The van half is unchanged and still comes from `todayEvent.van_id` — which is what the assertion protects. |
| `/api/dashboard` resolver call | Same reason; the selected event supplies both ids. |
| `submit` customer value | The condition gained `\|\| vanIv.fromEvent`, so an event override applies on a van-less event. The legacy truck fallback is otherwise untouched. |
| `promoteDraft` customer value | Same change, same reason. |
| `/api/events` publishes `.customer` | The map now holds the van *pair* and the value comes from `applyEventIntervals(...).customer`. Still customer-only — the assertion now also proves no `.truck` appears anywhere in the route. |
| `/api/events` per-event attachment | Was keyed by van alone; now the event's own override first, else its van. |

**`scripts/slot-interval-settings.cjs` and `scripts/slot-interval-van-list-tolerance.cjs` — unchanged.** Neither touches the event layer: the first proves the van-level settings plumbing and the Manage copy, the second proves the van list never depends on the interval columns. Both still pass as written.

---

# VERIFICATION

- **All 20 harnesses pass** — 8 × `slot-interval-*` (dots, engine-identity, **event-override**, generator, grid-routing, settings, van-list-tolerance, van-resolution), 7 × `outreach-*`, 5 × `whatsapp-*`.
- **`tsc --noEmit`** — no errors.
- **`next build`** — compiled successfully, 95/95 static pages.
- **eslint vs a clean HEAD worktree (18 changed files)** — HEAD 664 → **663**. **Delta per rule: `@typescript-eslint/no-unused-vars` (severity 1) −1.** Nothing else changed; **no new messages**. The single removal is the dead `MINUTES` const from an earlier stage. `lib/slot-interval.ts`: 0 messages.
- **Engine byte-identity** — all nine symbols identical to HEAD: `projectBackwardOccupancy` (11,473 bytes), `fitOrderBackward` (1,155), `earliestBackwardFitSlot` (1,232), `windowScopedPeak` (904), `backwardWindowStepMins` (293), `loadRunsOffFront` (639), `placeInstantPoints` (576), `buildUnitsFromOrders` (3,792), `rebuildProductionSlotUsage` (1,544). `git diff -U0 lib/orders/place-in-slot.ts` shows hunks in **`eventKitchenCapacity` only** — `placeOrderInSlotLocked`'s off-list branch untouched.
- **`git diff --stat`** — 18 files changed, 723 insertions, 42 deletions.

---

# LOCALHOST TEST SCRIPT

**Apply the migration first — see §8.** Then `npm run dev`. **Use `test truck` throughout (two vans, Van1 and Van2). Step 7 only looks at Gusto.**

1. **Set the van up.** Manage → Settings → Van1 → Collection times: **Every 5 minutes**, box **unticked**. Create two events on Van1 today, both 18:00–20:00, at different venues so you can tell them apart. Open the dashboard and select the first.

2. **The box is there and shows the van's values.** Dashboard → Settings. The **Collection times** box renders with **Every 5 minutes**, box unticked, and *"You and your customers can pick 18:00, 18:05, 18:10…"*. 🔴 **There is no "this event only" label — that is correct**, and deliberate: scope is a property of the screen. There should be **no "Use my usual setting"** link yet, because the event has no override.

3. **The 5 / 10 / untick case.** Set *Customer Collection Times* to **Every 5 minutes** (already there). Tick **"Use different times for orders I add"** — a second select appears, pre-set to **Every 5 minutes**. Change it to **Every 10 minutes**; the line reads *"You can pick 18:00, 18:10, 18:20…"*. Now **untick** the box. 🔴 **The 10 must be gone** — the second select disappears and the first line returns to *"You and your customers can pick 18:00, 18:05, 18:10…"*. Reload and confirm it stayed gone. *(If the 10 came back, the untick wrote the old value instead of null — the V2 broken variant.)*

4. **Revert to the van.** Set *Customer Collection Times* to **Every 15 minutes**. A **"Use my usual setting"** link now appears. Tap it: the box returns to **Every 5 minutes** (Van1's value), the link disappears, and the toast reads *"Back to your usual setting for this event"*. Reload to confirm.

5. **A Manage change resets it (R1(d), Rule A).** Put event 1 on **Every 15 minutes** via the dashboard. Now go to Manage → Settings → Van1 and change *Customer Collection Times* to **Every 10 minutes**. Return to the dashboard: 🔴 **event 1 must now show Every 10 minutes**, not 15, and the "Use my usual setting" link must be gone — its override was cleared, so it is following the van again. *(This is the rule you chose. Under the other rule it would have stayed on 15.)*

6. **Two events of one van, different settings.** Set Van1 back to **Every 5 minutes**. On the dashboard set **event 1** to customer **Every 15 minutes**, and leave **event 2** alone. Then check all four surfaces:
   - Customer page for **event 1** → selectable times **18:00, 18:15, 18:30…**
   - Customer page for **event 2** → **18:00, 18:05, 18:10…**
   - Add Order with **event 1** selected → 15-minute times (the box is unticked, so the operator follows customers).
   - Tick the box on event 1 and set *Your Collection Times* to **Every 5 minutes** → Add Order shows 5-minute times while the customer page still shows 15. Place an order at **18:05** and confirm it is accepted and capacity-checked, not treated as off-list.

7. **Put it back, then look at Gusto without touching it.** Clear both events with **"Use my usual setting"**, set Van1 to **Every 5 minutes** with the box unticked, and confirm everything reads 5-minute times again. Then open **Pizzeria Gusto** and **look only**:
   - Dashboard → Settings: the Collection times box shows **Every 5 minutes**, box **unticked**, **no** "Use my usual setting" link (no override), and every other setting on the tab renders as before.
   - Manage → Settings: Van1 shows **Every 5 minutes**, box unticked, and its **Kitchen capacity** box shows **2** with a **5**-minute window.
   - 🔴 **Change nothing and save nothing on Gusto.**

---

# APPLY ORDER

This migration and localhost testing are **not** coupled the way `20260917` was — nothing names the new columns on a select another surface depends on, by design. Before it is applied the code degrades honestly: `readEventIntervals` logs `42703`, every event follows its van, the dashboard box shows *"Collection times are unavailable right now."*, and every other setting works.

**Still, apply it first** — otherwise step 2 of the test script shows the unavailable line and you cannot test anything.

1. **Apply `20260918_event_collection_intervals.sql`.**
2. **Run the four verification queries in §5.** Expect two nullable integer columns, two CHECKs, and **zero overrides set anywhere, Gusto included**.
3. **Then start localhost and work through the test script.**
4. **Nothing is deployed by any of this.** Deploying is a separate decision after the script passes.

⚠️ For the record, corrected in the previous report and unchanged here: **`20260916` and `20260917` are both already applied.** Verified live today — `truck_vans.collection_interval_mins` (integer NOT NULL default 5), `truck_vans.operator_collection_interval_mins` (integer NULL), `trucks.operator_collection_interval_mins` absent.

# PRE-DEPLOY CHECKLIST FOR GUSTO

Queries 1–5 are read-only; 6 is look-only.

**1–3. The van-level checks from the hardening report, unchanged** — the two `truck_vans` columns and their CHECKs; `trucks.operator_collection_interval_mins` absent; Gusto's Van1 at `kitchen_capacity 2`, `capacity_window_mins 5`, `collection_interval_mins 5`, `operator_collection_interval_mins null`.

**4. The new event columns exist and are correctly shaped** — §5's first two queries.

**5. 🔴 Every Gusto event row has BOTH new columns null.**

```sql
select count(*) as gusto_events,
       count(truck_events.collection_interval_mins_override) as customer_overrides_set,
       count(truck_events.operator_collection_interval_mins_override) as operator_overrides_set
from public.truck_events
where truck_events.truck_id = 'pizzeria-gusto';
```
Expect `50 · 0 · 0` (the event count will grow; the two override counts must stay 0 until an operator changes something). **Any non-zero means a Gusto event is on its own grid — stop and find out which and why:**

```sql
select truck_events.id,
       truck_events.event_date,
       truck_events.status,
       truck_events.collection_interval_mins_override,
       truck_events.operator_collection_interval_mins_override
from public.truck_events
where truck_events.truck_id = 'pizzeria-gusto'
  and truck_events.collection_interval_mins_override is not null
order by truck_events.event_date;
```

**6. After deploy — LOOK ONLY at Gusto. Change nothing, save nothing.**
- **Manage → Settings** lists **Van1** with its Kitchen capacity box (2, 5-minute window) and its Collection times box at **Every 5 minutes**, unticked. 🔴 An empty van list means the van-list hardening has regressed — roll back rather than investigate live.
- **Dashboard → Settings** shows the Collection times box at **Every 5 minutes**, unticked, **no** "Use my usual setting" link, and every neighbouring setting rendering normally.
- If the box instead reads *"Collection times are unavailable right now."*, the event columns could not be read — ordering is unaffected and every event is following its van; run `notify pgrst, 'reload schema'` and check the log for `[slot-interval] truck pizzeria-gusto: … (PGRST204)`.
- Open the 18 September event and confirm the day-load strip renders **5-minute** slots as it always has.

---

# MANUAL SECTIONS MADE STALE

`docs/reference-manual.md` is **not edited**. Items 1–9 carry over from the two previous reports; 10–12 are new:

1–6. Collection times are per **van** (not truck); "every 5 minutes" statements; the `trucks` column list; the `truck_vans` column list; clock anchoring; `update_truck` no longer carries the keys.
7. The named-select hazard deserves its own entry — **a setting whose column may not exist yet must never be named on a select another surface depends on.**
8. A scraper-bridged event is created with **no van**; the van is assigned at **confirm**.
9. A *confirmed* van-less event takes orders with no capacity enforcement.
10. 🔴 **NEW — there are now THREE layers**: `truck_events.*_override` → `truck_vans` → (no van) `trucks.collection_interval_mins`. The event columns are the switch-pair described in §5, and `applyEventIntervals` is the only place they are applied.
11. 🔴 **NEW — and the most important for whoever writes the next override.** §14 (or wherever the override family is documented) should record that **the codebase carries two incompatible rules** for what a Manage change does to existing event overrides — `order_ready_override` bulk-writes, the paid-step family deliberately does not — and that **collection times follow the order-ready rule by Dominic's decision of 17 September 2026**. Without that written down, the next person will read `paid-step.ts`'s reasoning, find it persuasive, and quietly build the other behaviour.
12. ⚠️ **NEW — the reset affordance.** The manual should record that *"Use my usual setting"* now exists on the Collection times box and **nowhere else**, and that the three payment overrides still have no route back to inheriting (the one-way door the dashboard page documents above `USUAL_SETTING_TOAST`). That is now an inconsistency between rows on one screen, and it is deliberate for this brief's scope.

---

# WHAT I COULD NOT ESTABLISH

1. **Whether the migration applies cleanly** — it has not been run. `add column if not exists` succeeds whether or not it adds anything (§35), so §5's count query is the only thing that will prove it.
2. **Whether the dashboard box renders as intended.** Asserted by string and structure, not seen in a browser. Step 2 of the test script is the first time anyone will look at it, and the box's degraded state cannot be reached at all once the migration is applied (it is provable only through the harness's fake client).
3. **Whether the Manage reset should also cover events of a van that was later reassigned.** The reset is scoped `van_id = <the van being edited>`. An event moved to a different van after acquiring an override keeps it, and the new van's Manage change will not clear it. Rare, and arguably right — but not something I established a rule for.
4. **Whether Rule A's "no date filter" is wanted here.** I matched `order_ready`'s shape, so past events are reset too. Their grids are inert, so it is harmless — but it is a copied property, not a reasoned one.
5. **Whether the payment overrides should also get "Use my usual setting".** Out of this brief's scope; the one-way door remains for those three rows, and item 12 records it.
6. **`test-truck` Van2 still holds customer 15 / override 5** (LIVE) from earlier testing — the only non-default van in the database. Untouched.

---

**Nothing was deployed, staged, committed, or written to any database.** Every database read in this report was a `GET`, and the migration in §5 has not been applied.
