# Collection times — HARDEN THE VAN LIST, AND EVENTS WITH NO VAN

**17 September 2026 · HEAD `fc0fddc outreach` · Localhost only. Nothing deployed, nothing written to any database.**

Part 1 removes a real, observed defect: `get_vans` had made the **van list itself** depend on two new columns, so a deploy ahead of its migration would have hidden Pizzeria Gusto's only van and its kitchen-capacity setting. Part 2 is a read-only investigation of van-less events, which ends somewhere better than it started.

Figures are **LIVE** (read from production today, read-only), **CODE**, or **FIXTURE**.

---

## 0. git status

### Before

17 modified, 12 untracked, exactly as the brief predicted:

```
 M app/api/dashboard/route.ts          M lib/capacity-breach.ts
 M app/api/events/route.ts             M lib/orders/place-in-slot.ts
 M app/api/manage/route.ts             M lib/payments/promote-draft.ts
 M app/api/menu/[truckId]/route.ts     M lib/slot-availability.ts
 M app/api/orders/submit/route.ts      M lib/slot-display.ts
 M app/api/slots/[truckId]/route.ts    M lib/slot-generation.ts
 M app/dashboard/[token]/page.tsx      M lib/supabase.ts
 M app/manage/[token]/page.tsx
 M app/trucks/[slug]/order/page.tsx
 M components/dashboard/AddOrderPanel.tsx
?? docs/slot-interval-build-report.md          ?? scripts/slot-interval-engine-identity.cjs
?? docs/slot-interval-van-level-report.md      ?? scripts/slot-interval-generator.cjs
?? docs/wired-printing-investigation-report.md ?? scripts/slot-interval-grid-routing.cjs
?? lib/slot-interval.ts                        ?? scripts/slot-interval-settings.cjs
?? scripts/_slot-interval-compile.cjs          ?? scripts/slot-interval-van-resolution.cjs
?? scripts/slot-interval-dots.cjs              ?? supabase/migrations/20260916_collection_intervals.sql
                                               ?? supabase/migrations/20260917_van_collection_intervals.sql
```

### After

**17 modified (unchanged set), 13 untracked** — one file added: `scripts/slot-interval-van-list-tolerance.cjs`. Full listing in §8. Nothing staged, nothing committed.

---

## 🔴 CORRECTION CARRIED OUT FIRST — AND THE LIVE SCHEMA

Your correction is recorded and the previous report is fixed. **`20260916` was applied on 16 September**; my apply-order section told the reader to skip it, which was wrong on a fact I had not checked. The section in `docs/slot-interval-van-level-report.md` is now replaced by a struck-through correction block that states both migrations are applied and points here for the checklist. **I should have read the live schema before writing an apply order about it.**

Read-only verification, today:

```sql
select information_schema.columns.table_name,
       information_schema.columns.column_name,
       information_schema.columns.data_type,
       information_schema.columns.is_nullable,
       information_schema.columns.column_default
from information_schema.columns
where information_schema.columns.table_schema = 'public'
  and information_schema.columns.table_name in ('trucks', 'truck_vans')
  and information_schema.columns.column_name like '%collection_interval_mins%'
order by information_schema.columns.table_name, information_schema.columns.column_name;
```

| table | column | type | nullable | default |
|---|---|---|---|---|
| `trucks` | `collection_interval_mins` | integer | YES | `5` |
| `truck_vans` | `collection_interval_mins` | integer | **NO** | `5` |
| `truck_vans` | `operator_collection_interval_mins` | integer | YES | *(none)* |

`trucks.operator_collection_interval_mins` is **absent**. 🔴 **So `20260917` is applied too, and the live schema is already the target state.** There is no apply order left to follow — only the pre-deploy checklist in §7.

```sql
select truck_vans.truck_id,
       truck_vans.name,
       truck_vans.collection_interval_mins,
       truck_vans.operator_collection_interval_mins
from public.truck_vans
order by truck_vans.truck_id, truck_vans.name;
```

**13 vans. Twelve at `5 / null`. One is not:** `test-truck · Van2 · customer 15 · override 5` — the first van in the system to hold a real non-default setting, presumably from your localhost testing. **Every Gusto van is at `5 / null`.**

---

# PART 1 — THE VAN LIST MUST NEVER DEPEND ON THE NEW COLUMNS

## 1. The select sweep

Every select in the repository naming either new `truck_vans` column — **two**, and only one was a problem:

| # | Site | Shape | Verdict |
|---|---|---|---|
| 1 | `app/api/manage/route.ts` → **`get_vans`** | `.select('id, truck_id, name, kds_token, active, …, kitchen_capacity, capacity_window_mins, buzzer_count, collection_interval_mins, operator_collection_interval_mins')` | 🔴 **THE DEFECT.** One statement, 17 columns, all-or-nothing. |
| 2 | `lib/slot-interval.ts` → **`readVanIntervals`** | `.select('collection_interval_mins, operator_collection_interval_mins')` on one van id | ✅ Already a separate, capability-probed read. No change. |

Three further hits name **`trucks.collection_interval_mins`**, a different and still-live column: `lib/seed-demo-orders.ts` (`.from('trucks').select('collection_interval_mins, slot_duration_mins')`), `scripts/seed-thai-kitchen-screenshots.sql`, and `resolveTruck` in `/api/slots`. **None is affected** — they read the truck, not the van. *(The tolerance harness's first draft flagged `seed-demo-orders` because its scan did not check the table; the table is precisely what makes the shape dangerous, and the scan now checks it.)*

## 2. Why it was a defect, in the route's own terms

PostgREST fails the **whole statement** with `42703` when one named column does not exist. So `get_vans` did not degrade one field — it returned **no rows**, and the Manage → Settings tab renders vans from that array. Losing it loses, per van: the Kitchen capacity grid, offline protection, the auto-reject delay, display settings, the order-ready default, buzzers, rename and deactivate.

**Observed on localhost before `20260917` was applied: Manage → Settings showed no vans for test-truck.** Deployed before the migration this would have hidden Gusto's only van — and the `kitchen_capacity = 2` ceiling that lives on it — from its own operator, with no error on screen.

⚠️ **The same trap already existed and was already written down.** `get_vans`' own comment warns it about `buzzer_count` (added by `20260803`): *"a named select over a column PostgREST cannot see returns 42703 and fails the whole statement, which here means Manage → Settings renders no vans at all. Apply the migration BEFORE deploying."* The previous build read that warning, added two more columns, and repeated the mistake — **the comment documented the hazard and did not prevent it.** The fix is structural rather than another comment.

## 3. Changes, by symbol

### `lib/slot-interval.ts`

- **`readVanIntervalsForTruck(supabase, truckId)`** — NEW. Every van of one truck in one capability-probed query; `PGRST204` and `42703` logged distinguishably; returns `{ ok, byVanId }` and on any failure `{ ok: false, byVanId: empty }`.
- **`VanIntervalsBatch`** — NEW. 🔴 Its map carries **`rawOverride`** beside the resolved pair. I first derived the tickbox from `truck !== customer`, which type-checked and read plausibly and **is wrong**: an operator who ticks the box and leaves it on the customer value stores an override *equal* to it, and that inference would untick the box on the next load. Recorded in the file because it looked right.

### `app/api/manage/route.ts`

- **`get_vans`** — the van-list select is restored to **byte-identically HEAD's column list** (the harness compares it against `git show HEAD:…`, not a retyped copy). The intervals come from `readVanIntervalsForTruck` and are merged on afterwards: `collection_interval_mins: iv ? iv.customer : DEFAULT_INTERVAL`, `operator_collection_interval_mins: iv ? iv.rawOverride : null`. The response gains **`intervalsAvailable`**.
- **`update_van_settings`** — the two interval keys now collect into their own `intervalUpdates` object and are written in a **separate statement**. The existing settings' write is untouched and still unchecked (changing that would alter how every other van setting reports failure, which is not this change's business). The interval write **is** error-checked and returns a visible `500 Collection times could not be saved right now.`

### `app/manage/[token]/page.tsx`

- **`intervalsAvailable`** state, defaulting **true** — `setIntervalsAvailable(r.intervalsAvailable !== false)`, so an older response shape that omits the flag behaves exactly as before. A missing field must never disable a working setting.
- The **Collection times** box branches on it: when false it renders exactly one line, **"Collection times are unavailable right now."**, with no select, no checkbox and no save. 🔴 **The `vans.map` is not gated on it, and neither is the Kitchen capacity box** — they render exactly as they always did.

## 4. How an interval save fails when the columns are missing

**Before this change it failed silently and took everything with it.** The handler did:

```ts
await supabase.from('truck_vans').update(updates).eq('id', vanId).eq('truck_id', truck.id)
…
return NextResponse.json({ ok: true })
```

No error capture. So on a database without the columns, a save containing an interval would (a) fail entirely at the database, (b) **also discard the buzzer count, kitchen capacity and every other setting in the same request**, because it was one statement, and (c) return `{ ok: true }` — a green toast over a write that never happened. Exactly the silent-success shape this file's own allowlist comment warns about.

**Now:** the two writes are separate, so a missing interval column can only ever cost the interval; and the interval write is checked, logs `PGRST204`/`42703` distinguishably, and returns a **visible 500**. The operator sees an error, not a green toast.

## 5. The harness — `scripts/slot-interval-van-list-tolerance.cjs`

**Failure mode it exists to catch:** the interval columns being named on `get_vans`' main select, so a missing column or a stale PostgREST schema cache empties the van list — and with it every van's Kitchen capacity, offline protection, buzzers and display settings. Secondarily: the Manage page gating the van list on the interval read; the disabled state carrying extra copy or live controls; `update_van_settings` losing other settings to a missing column; or any other van select in the repo repeating the shape.

**Broken variant, run FIRST:**

```
✓ FAILED as required  V1 interval columns back in get_vans' main select — 42703 yields 0 vans (the observed defect)
⚠️ …and with the columns present it returns 2 vans — which is why the defect was invisible until the migration lagged the deploy
```

That second line is the point: the variant is *correct* whenever the columns exist, which is why it shipped. The harness pins the failure mode, not the happy path.

**Real run — ✅ van-list tolerance proven (30 assertions).**

- `get_vans`' van-list select names neither column, and is **byte-identical to HEAD's**, compared against `git show`.
- A `42703` on the interval read: **both vans still returned**, every one at `collection_interval_mins = 5` and `operator_collection_interval_mins = null`, `intervalsAvailable: false`, and **`kitchen_capacity` and `capacity_window_mins` survive with their real values (2 and 8), not defaults**.
- `PGRST204` behaves identically.
- Healthy path unchanged — and **van-2 reads back `15 / 15`**, proving an override deliberately equal to the customer value stays ticked.
- Manage page: the van map is a plain `vans.map` **not gated on `intervalsAvailable`**; only the Collection times box branches; the disabled branch contains the one required sentence and **no `<select>`, `<input>` or `updateVanSetting`**; an absent flag reads as available; and **the Kitchen capacity box does not mention `intervalsAvailable` anywhere in its 4,000 characters**, so it cannot be hidden by it.
- `update_van_settings`: separate objects, separate statements, the interval write error-checked, a visible error returned, both codes logged.
- **494 files scanned**: zero `truck_vans` selects mixing the interval columns with other fields.

### The two updated harnesses

`scripts/slot-interval-settings.cjs` needed three changes, and each was the harness correctly detecting the hardening:
- the override write assertion now targets `intervalUpdates`;
- 🔴 **the `get_vans` assertion is INVERTED** — it used to *require* both columns on the named select, which was the defect written down as a rule. It now requires neither, plus the separate read and the merge.
- the disabled line is added to the box's allowed-copy list.

Its **V2 broken variant was re-targeted**: it used to strip the column from `get_vans`' select, which — now that the select deliberately names neither — is a variant that cannot fail and therefore **proves nothing**. It now models the real read-back risk that moved with the hardening: a `get_vans` that forgets to merge the separately-read intervals, so a stored 15 reads back as `undefined` and the UI renders "Every 5 minutes" over it.

---

# PART 2 — EVENTS WITH NO VAN (read-only investigation, no fix)

## 2.1 The query

```sql
select truck_events.id,
       truck_events.event_date,
       truck_events.start_time,
       truck_events.venue_name,
       truck_events.van_id,
       truck_events.source,
       truck_events.status,
       truck_events.created_at
from public.truck_events
where truck_events.truck_id = 'pizzeria-gusto'
  and truck_events.event_date >= current_date
order by truck_events.event_date;
```

| event_date | start | venue | van_id | source | **status** | created_at |
|---|---|---|---|---|---|---|
| 2026-09-18 | 17:00 | Wickhambrook MSC | `ff1d59b8…` (Van1) | scraper | **confirmed** | 2026-09-07 16:57 |
| 2026-09-19 | 12:00 | Nethergate Brewery | **null** | scraper | **unconfirmed** | 2026-09-13 16:55 |
| 2026-09-20 | 14:00 | The Five Bells | **null** | scraper | **unconfirmed** | 2026-09-13 16:55 |

🔴 **The two van-less events are `unconfirmed`, and both were created by the same scraper run 18 seconds apart.** That single column reframes the whole question.

## 2.2 Every path that creates or updates `truck_events`

| Path | Sets `van_id`? | How |
|---|---|---|
| **`/api/inbound-schedule`** (the scraper bridge's destination) | 🔴 **NO — the key is absent from the insert entirely**, so the column takes its default of NULL. Inserts `status: 'unconfirmed'`, `source: 'scraper'`. | — |
| `scripts/run-scraper.js` | Indirectly — it POSTs to `/api/inbound-schedule`; it never writes `truck_events` itself for this path | — |
| **`upsert_event`** (Manage add) — `app/api/manage/route.ts` | ✅ Yes | `const resolvedVanId = van_id ?? await getSoleActiveVanId(supabase, targetTruckId)` — *"if the operator didn't pick a van and the truck has exactly one active van, assign it so capacity etc. can resolve."* Multi-van trucks leave it null for the operator. |
| **`upsert_event`** (Manage edit) | ⚠️ Yes, as given: `van_id: van_id ?? null` | The client always sends the loaded `van_id`, so it round-trips. **Latent hazard:** any caller omitting the key would NULL an existing van. Not a live defect. |
| **`/api/events/action`** (Approve / go live) | ✅ **Yes — this is the one that heals it.** | `const soleVanId = ev?.van_id ? null : await getSoleActiveVanId(...)`; `const vanPatch = (!ev?.van_id) ? { van_id: soleVanId } : {}`, applied in the confirm UPDATE. |
| `/api/dashboard/action` (`set_paused`, `set_offline_protection`, order-ready, extra-wait) | No — none touches `van_id` | — |
| Demo provisioning (`/api/admin/provision-demo`) | ✅ Yes — `van_id: result.vanId` | — |
| `scripts/diag-demo-event.mjs`, `scripts/reresolve-event-venues.ts` | Diagnostic/backfill; neither sets `van_id` | — |
| Manage cancel | No — writes `status` only | — |

**Match:** both null-van Gusto events are `source = 'scraper'`, `status = 'unconfirmed'`, created 2026-09-13 16:55. That is **`/api/inbound-schedule`**, unambiguously — it is the only path that writes `source: 'scraper'` with `status: 'unconfirmed'`, and it is the only path that omits `van_id`.

## 2.3 Is a null `van_id` ever intended?

**Yes — it is the pre-confirm state, and it is designed to heal on confirm.**

A scraper-bridged event arrives as an `unconfirmed` draft: a venue and a date the operator has not yet agreed to. It has no van because nobody has said it is happening. When the operator approves it, `/api/events/action` assigns the sole active van automatically, and for a **multi-van** truck refuses to go live at all:

```ts
if ((count ?? 0) > 1) {
  return NextResponse.json({ error: 'Choose which truck is working this event before it can go live.' }, { status: 400 })
}
```

🔴 **But on a single-van truck the operator cannot see or set it by hand.** Every van control on the events screen is gated on `vans.length > 1`:

- the van name on an event row — `{vans.length > 1 && event.van_id && …}`
- the amber inline picker — `{vans.length > 1 && !ev.van_id && …}`
- the edit modal's **Truck** field — `{vans.length > 1 && (…)}`
- the validation — `if (vans.length > 1 && !form.van_id) errors.van_id = 'Please select a truck'`

So for Gusto the van is **invisible and unsettable in the UI**. That is a reasonable design — with one van there is nothing to choose — and it is safe *only because* confirm assigns it. The operator's route to fixing a van-less Gusto event is to approve it.

## 2.4 The capacity consequence for Gusto today

**The readers, quoted.** Each skips the van when `van_id` is null, leaving `kitchenCapacity = null`:

```ts
// app/api/slots/[truckId]/route.ts
let kitchenCapacity: number | null = null
if (todayEvent?.van_id) { … kitchenCapacity = van?.kitchen_capacity ?? null }
```
```ts
// lib/orders/place-in-slot.ts — eventKitchenCapacity
let kitchenCapacity: number | null = null
if (ev?.van_id) { … kitchenCapacity = van?.kitchen_capacity ?? null }
```
```ts
// app/api/dashboard/route.ts
if (capacityEvent?.van_id) { … kitchenCapacity = van?.kitchen_capacity ?? null }
```

and `lib/slot-availability.ts` treats `null` as **unlimited** (`bindCap = kitchenCapacity ?? UNLIMITED`). `events/action`'s own comment states the consequence plainly: *"a confirmed van-less event does not merely look unfinished: it takes orders with **no capacity enforcement at all**, every slot, all day."*

### 🔴 But the honest answer for Gusto **today** is: no customer can reach those two events.

- **`/api/events`** — the customer page's event list — filters `.in('status', ['confirmed', 'open'])`. **Unconfirmed events are never offered.**
- **`/api/menu`** resolves `.in('status', ['open','confirmed'])`, and if only unconfirmed events remain it sets **`orderingAvailable = false`**.
- Gusto's only customer-reachable upcoming event is **18 September, Wickhambrook MSC — which has Van1 and its `kitchen_capacity = 2` ceiling.** ✅

**The residual exposure, stated precisely rather than dismissed:** `/api/slots` and `eventKitchenCapacity` both fall back on `.neq('status', 'cancelled')`, which *does* match an unconfirmed event. So a request that reached `/api/slots` for 19 or 20 September — by date, with no `event_id` — would resolve one of these events and compute an unlimited ceiling. Reaching that state requires bypassing the customer page, because the page only ever passes an `event_id` it got from `/api/events`. **So: a real hole in the date-fallback path, not a reachable one through the product.** And it closes the moment the event is approved, because approval assigns the van.

## 2.5 Options (proposed, NOT built)

### A. Treat a null `van_id` as the sole van at READ time, for single-van trucks

Add the `getSoleActiveVanId` fallback to the three capacity readers when `event.van_id` is null.

- **Gusto blast radius:** would give the two unconfirmed events a `kitchen_capacity = 2` ceiling immediately, and would change nothing for the 18 September event (it already has Van1). No write, no migration, instantly reversible. 🔴 **But it changes capacity behaviour for a live trading truck on a code path used by every order**, and it makes three read paths do a resolution they do not do today.
- **Proof needed:** a harness asserting that a truck with exactly one active van resolves identically with and without `van_id` set; that a multi-van truck still resolves to nothing; that a zero-van truck is unchanged; and byte-identical `/api/slots` output for every event that already has a van.
- **Recommendation: NO, not now.** It fixes a hole no customer can currently reach, by adding a query to the hottest read path in the product, on the trading truck. The confirm-time assignment already covers the reachable case.

### B. Set `van_id` on creation in the paths that omit it

One line in `/api/inbound-schedule`: `van_id: await getSoleActiveVanId(supabase, truckId)`, mirroring `upsert_event`'s create branch.

- **Gusto blast radius:** none retroactively — new scraper events only. An unconfirmed draft would arrive already carrying Van1, and confirm's `vanPatch` would become a no-op for it.
- **Proof needed:** a harness that a single-van truck's bridged event carries the van, a multi-van truck's does not, and the insert is otherwise byte-identical; plus one live scraper run observed end to end.
- **Recommendation: YES, eventually — this is the right fix.** It closes the gap at the source, it matches what `upsert_event` already does for manual events, and it makes the two paths agree. Not urgent, because confirm already heals it.

### C. A one-off backfill of existing null rows

**For Dominic's decision. NOT RUN, and I have executed nothing against the database.**

```sql
-- REVIEW FIRST — this is the exact set the update below would touch.
select truck_events.id,
       truck_events.truck_id,
       truck_events.event_date,
       truck_events.venue_name,
       truck_events.status,
       truck_vans.id   as sole_van_id,
       truck_vans.name as sole_van_name
from public.truck_events
join public.truck_vans
  on truck_vans.truck_id = truck_events.truck_id
 and truck_vans.active = true
where truck_events.van_id is null
  and truck_events.event_date >= current_date
  and truck_events.status <> 'cancelled'
  and (select count(*)
         from public.truck_vans as v
        where v.truck_id = truck_events.truck_id
          and v.active = true) = 1
order by truck_events.event_date;
```

```sql
-- THE BACKFILL ITSELF. Single-van trucks only; never overwrites an existing choice.
update public.truck_events
set van_id = (select v.id
                from public.truck_vans as v
               where v.truck_id = truck_events.truck_id
                 and v.active = true)
where truck_events.van_id is null
  and truck_events.event_date >= current_date
  and truck_events.status <> 'cancelled'
  and (select count(*)
         from public.truck_vans as v
        where v.truck_id = truck_events.truck_id
          and v.active = true) = 1;
```

- **Gusto blast radius:** exactly **two rows** — the 19 and 20 September unconfirmed events — each gaining Van1. Both are invisible to customers today, so the visible effect is nil until they are approved, at which point they would have got the same van anyway. **Low risk, low value.**
- **Proof needed:** run the SELECT first and confirm it returns exactly those two rows; re-run it after the UPDATE and confirm it returns none.
- **Recommendation: OPTIONAL.** It tidies two rows that confirm would tidy anyway. Worth doing only alongside option B, so the source stops producing them.

## 2.6 Any other truck?

```sql
select truck_events.truck_id,
       count(*) as upcoming_events,
       count(*) filter (where truck_events.van_id is null) as van_id_null
from public.truck_events
where truck_events.event_date >= current_date
group by truck_events.truck_id
order by truck_events.truck_id;
```

| truck_id | upcoming | `van_id` NULL |
|---|---:|---:|
| `pizzeria-gusto` | 3 | **2** |
| `test-truck-3-2` | 1 | 0 |

**Two van-less upcoming events in the entire database, both Gusto's, both `unconfirmed`, both `source = 'scraper'`.** No other truck has one.

---

# VERIFICATION

- **All 19 harnesses pass** — 7 × `slot-interval-*` (dots, engine-identity, generator, grid-routing, settings, **van-list-tolerance**, van-resolution), 7 × `outreach-*`, 5 × `whatsapp-*`.
- **`tsc --noEmit`** — no errors.
- **`next build`** — compiled successfully, 95/95 static pages.
- **eslint vs a clean HEAD worktree (17 changed files)** — HEAD 644 → **643**. **Delta per rule: `@typescript-eslint/no-unused-vars` (severity 1) −1.** Nothing else changed; **no new messages**. The single removal is the dead `MINUTES` const deleted in an earlier stage. `lib/slot-interval.ts`: 0 messages.
- **Engine byte-identity** — all nine symbols identical to HEAD: `projectBackwardOccupancy` (11,473 bytes), `fitOrderBackward` (1,155), `earliestBackwardFitSlot` (1,232), `windowScopedPeak` (904), `backwardWindowStepMins` (293), `loadRunsOffFront` (639), `placeInstantPoints` (576), `buildUnitsFromOrders` (3,792), `rebuildProductionSlotUsage` (1,544). `git diff -U0 lib/orders/place-in-slot.ts` shows hunks in `eventKitchenCapacity` only — `placeOrderInSlotLocked`'s off-list branch is untouched.
- **`git diff --stat`** — 17 files changed, 491 insertions, 42 deletions.

---

# APPLY ORDER (corrected) and PRE-DEPLOY CHECKLIST

## Apply order

**There isn't one left.** Both migrations are applied and verified live (see the correction block above):

1. ~~`20260916_collection_intervals.sql`~~ — **applied 16 September.** It added `trucks.operator_collection_interval_mins` and the CHECK on `trucks.collection_interval_mins`.
2. ~~`20260917_van_collection_intervals.sql`~~ — **applied.** It added both `truck_vans` columns with their CHECKs and dropped the `trucks` column `20260916` had added.

Keep both files in `supabase/migrations/`. `20260916` is part of the history even though `20260917` reverses one of its two changes — deleting it would make the applied sequence unreproducible.

## Pre-deploy checklist for Gusto

Run all five before deploying. The first four are read-only; the fifth is look-only.

**1. Confirm the schema is what the code expects.**

```sql
select information_schema.columns.table_name,
       information_schema.columns.column_name,
       information_schema.columns.data_type,
       information_schema.columns.is_nullable,
       information_schema.columns.column_default
from information_schema.columns
where information_schema.columns.table_schema = 'public'
  and information_schema.columns.table_name in ('trucks', 'truck_vans')
  and information_schema.columns.column_name like '%collection_interval_mins%'
order by information_schema.columns.table_name, information_schema.columns.column_name;
```
Expect three rows: `trucks.collection_interval_mins` (integer, YES, 5); `truck_vans.collection_interval_mins` (integer, **NO**, 5); `truck_vans.operator_collection_interval_mins` (integer, YES, none). **`trucks.operator_collection_interval_mins` must not appear.**

**2. Confirm both CHECKs exist.**

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
Expect the customer CHECK `IN (5, 10, 15, 20, 30)` and the override CHECK `IS NULL OR … IN (5, 10, 15, 20, 30)`.

**3. Confirm Gusto's van is at the defaults.**

```sql
select truck_vans.truck_id,
       truck_vans.name,
       truck_vans.kitchen_capacity,
       truck_vans.capacity_window_mins,
       truck_vans.collection_interval_mins,
       truck_vans.operator_collection_interval_mins
from public.truck_vans
where truck_vans.truck_id = 'pizzeria-gusto';
```
Expect **one row: Van1, kitchen_capacity 2, capacity_window_mins 5, collection_interval_mins 5, operator_collection_interval_mins null.** 🔴 If the override is not null, Gusto's Add Order grid is not 5 — stop and find out why.

**4. Confirm Gusto's customer-reachable event still has its van.**

```sql
select truck_events.event_date,
       truck_events.venue_name,
       truck_events.status,
       truck_events.van_id
from public.truck_events
where truck_events.truck_id = 'pizzeria-gusto'
  and truck_events.event_date >= current_date
  and truck_events.status in ('confirmed', 'open')
order by truck_events.event_date;
```
Expect every row to carry a non-null `van_id`. **A confirmed Gusto event with a null van has no capacity ceiling** (§2.4) — that is a stop-and-fix, not a note.

**5. After deploy — LOOK ONLY at Gusto's Manage page. Change nothing, save nothing.**

- Manage → Settings lists **Van1**. 🔴 If the van list is empty, the hardening has regressed — that is the exact defect Part 1 exists to prevent; roll back rather than investigate live.
- Van1's **Kitchen capacity** box renders, showing **2** and a **5**-minute window.
- Van1's **Collection times** box renders **above** it, showing **Every 5 minutes**, the tickbox **unticked**, no second select, and the line *"You and your customers can pick 18:00, 18:05, 18:10…"*.
- If instead it shows *"Collection times are unavailable right now."*, the interval read failed — the van list and Kitchen capacity are fine, and the fix is `notify pgrst, 'reload schema'`. Check the server log for `[slot-interval] truck pizzeria-gusto: … (PGRST204)`.
- Open the dashboard for the 18 September event and confirm the day-load strip renders 5-minute slots as it always has.

---

# MANUAL SECTIONS MADE STALE

`docs/reference-manual.md` is **not edited**. For a later pass — items 1–6 carry over from the van-level report, 7–9 are new:

1. **§31 / §14** — collection times are per **van**, not per truck.
2. **§10 / §4 / §6** — "every 5 minutes" statements: now "every N minutes, per van, per audience".
3. **§10's `trucks` column list** — `trucks.collection_interval_mins` is read **only** for an event whose van does not resolve, and is no longer editable; `trucks.operator_collection_interval_mins` existed between 16 and 17 September and is **dropped**.
4. **The `truck_vans` column list** — gains both interval columns; **NULL override means "same as customers"**.
5. **V11.15 / the off-by-one note** — grids are clock-anchored from midnight.
6. **Anything saying `update_truck` carries the interval keys** — they are on `update_van_settings`, with a visible error rather than a silent drop.
7. 🔴 **NEW — the named-select hazard deserves its own entry.** `get_vans` warned about it for `buzzer_count`, and the warning did not stop the same mistake being made twice. The rule worth recording: **a setting whose column may not exist yet must never be named on a select that another surface depends on.** Read it separately, probe it, and degrade the setting rather than the surface.
8. **§14's event lifecycle** — a scraper-bridged event is created with **no van**, and the van is assigned at **confirm** by `/api/events/action`, not at creation. `/api/inbound-schedule` omits `van_id` entirely.
9. **Any statement that a van-less event is merely cosmetic** — `events/action`'s own comment is right and should be promoted: a *confirmed* van-less event takes orders with no capacity enforcement at all. Today that is unreachable for Gusto because its van-less events are unconfirmed, and unconfirmed events are excluded by `/api/events` and `/api/menu`.

---

# WHAT I COULD NOT ESTABLISH

1. **Whether `test-truck`'s Van2 setting (customer 15, override 5) is yours or a stray.** It is the only non-default row in the database. I did not change it — it is a test truck, and the value is a plausible result of the localhost script. Worth a glance.
2. **Whether the Manage page actually renders the degraded box.** The disabled branch is asserted by string and structure, not seen: with both migrations applied, `intervalsAvailable` is always true, so there is now **no way to reach that state on this database**. It is provable only by a fake client (which the harness does) or by temporarily renaming a column, which I will not do to a live database.
3. **Whether the two unconfirmed Gusto events will be approved or deleted.** That decides whether option B/C is worth doing at all, and it is an operator's call.
4. **Whether `/api/slots`' date-fallback exposure has ever been hit.** It needs a request with a date and no `event_id` for 19 or 20 September. There is no access log in the repository to check, and no order exists on either date.
5. **Whether any other named select in the repo depends on a column added by an unapplied migration.** The harness proves it for the two interval columns specifically; the general class — `buzzer_count` and any future addition — is not swept, and item 7 above is the manual entry that should drive that sweep.

---

**Nothing was deployed, staged, committed, or written to any database.** Every database read in this report was a `GET`; the backfill SQL in §2.5 is for your decision and has not been run.
