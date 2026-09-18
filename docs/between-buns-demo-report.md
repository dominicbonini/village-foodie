# Between Buns Royston — a demo at 8 burgers every 15 minutes, on 15-minute collection times

**Date** 19 September 2026 · **Trucks touched** the demo truck `demo-8c95xz1twsn1xfhx3a4nkjv7j3` ("Between
Buns Royston", plan `demo`) for the writes; test-truck for nothing this round (the harness runs against an
in-memory fake, not the database). Pizzeria Gusto was never called, read or written.

**The answer, in two lines.** Part 1 is done and proven: `seedDemoOrders` now takes its collection grid from
the same resolver the customer submit path uses and admits every seeded order through the same call an
operator's walk-up takes, so a 15-minute van seeds only 15-minute times, each with a cooking reservation,
and the 5-minute demos seed exactly as before. Part 2 is set up and was built on localhost — **but the demo
you will open lives on production, which still runs the pre-fix seeder, and a production client re-seeded
this demo within a second of each of my restarts.** The settings are in place; the seeded board will be right
the first time the fixed code runs against them, which means after a deploy. Details, evidence and what
I could not do are below.

**Two things moved under this task, both recorded rather than hidden:**
- **You committed the tree at 15:28:32 BST** (`5f70e07 kitchen capacity`, 194 files) while this ran. The
  git status "before" below is what STEP 0 saw against `fc0fddc`; the "after" is against `5f70e07`.
- **Something restarted this demo three times behind me**, each time with the pre-fix seeder. §8 has the
  timestamps.

---

## git status — before (STEP 0, HEAD `fc0fddc`)

**0 staged · 38 modified · 113 untracked · 151 entries.**

Modified (tracked):

```
android/app/capacitor.build.gradle          lib/capacity-breach.ts
android/capacitor.settings.gradle           lib/features.ts
app/api/dashboard/action/route.ts           lib/orders/place-in-slot.ts
app/api/dashboard/route.ts                  lib/payments/promote-draft.ts
app/api/events/route.ts                     lib/plan-features.ts
app/api/manage/route.ts                     lib/printing/bleTransport.ts
app/api/menu/[truckId]/route.ts             lib/printing/transport.ts
app/api/orders/submit/route.ts              lib/printing/usePrinting.ts
app/api/slots/[truckId]/route.ts            lib/slot-availability.ts
app/dashboard/[token]/page.tsx              lib/slot-bookings.ts
app/landing/page.tsx                        lib/slot-display.ts
app/manage/[token]/page.tsx                 lib/slot-generation.ts
app/trucks/[slug]/order/page.tsx            lib/supabase.ts
components/dashboard/AddOrderPanel.tsx      package-lock.json
components/dashboard/CapacityBreachBanner.tsx  package.json
components/printing/PrintingSettings.tsx    scripts/migrate-from-sheets.cjs
content/store-listing.md                    scripts/register-payment-domain.cjs
docs/reference-manual.md                    scripts/whatsapp-golive-parity-harness.cjs
ios/App/App/Info.plist
ios/App/CapApp-SPM/Package.swift
```

Untracked, by directory: `scripts/` 53 · `docs/` 42 · `supabase/migrations/` 5 · `lib/printing/` 4 ·
`lib/` 4 · `scripts/fixtures/` 1 · `plugins/` 1 · `lib/orders/` 1 · `components/printing/` 1 ·
`app/api/printing/` 1.

---

# PART 1 — the seeder's split resolution

## §1 The resolution as it stood

`seedDemoOrders` (`lib/seed-demo-orders.ts`) read the two halves of the engine's inputs from two places:

- **Capacity from the event's VAN** — `truck_events.van_id` → `truck_vans.kitchen_capacity` and
  `capacity_window_mins`; batch and prep from `menu_categories` per cooked category. Correct.
- **Collection interval from the TRUCK** — `trucks.collection_interval_mins` (and `slot_duration_mins`),
  used only for the post-condition's dashboard grid; and for its **own planning grid a constant**:
  `const SLOT_INTERVAL_MINS = 5`, with `firstMins = ceil(floor / 5) × 5` and
  `generateSlots(first, end, 5)`.

So a van set to 15-minute collection times still had its demo orders planned on a 5-minute grid: the split
docs/slot-interval-van-level-report.md recorded and left ("identical while everything is 5"). Confirmed
against the source before any change, and reproduced by the harness's broken variant: **23 of 37 seeded
orders off the 15-minute grid** (15:10, 15:10, …).

It also **inserted every row in one bulk `orders.insert(rows)`** with no `cooking_reservation`, so the
first real order on a demo board was projected against unreserved load the engine had to guess a split
for — the P1 gap the reservation work closed for real orders and not for seeded ones.

## §2 What it resolves now, and the symbols reused

| input | before | after |
|---|---|---|
| planning grid | `SLOT_INTERVAL_MINS = 5` | **`resolveIntervalsFor(supabase, vanId, eventId).customer`** — event override → van → 5/5, the resolver `app/api/orders/submit/route.ts` uses |
| post-condition grid | `trucks.collection_interval_mins` | `resolveIntervalsFor(…).truck` — the operator grid the dashboard draws |
| van id | read in the post-condition only | read once, up front, from `truck_events.van_id` (as `eventKitchenCapacity` resolves it) |
| capacity | van (unchanged) | van (unchanged) |
| switch | not consulted | **`resolveBatchReservations(truck)`** from `lib/features.ts` |

The first time is the first multiple of the interval from midnight at or after the floor and every later
one steps by the interval — the rule `generateCollectionTimes` applies, so the seeder and the pickers agree
on which times exist.

## §3 Every seeded order goes through the real admission

The bulk insert is replaced by a loop: insert one row, then **`admitForManual`** — the same call
`app/api/dashboard/action/route.ts` makes for an operator's walk-up under the batch-reservations switch —
then **`writeReservationRecord`**. A row that cooks nothing (sides only) has nothing to reserve and is
inserted without one, exactly as the manual path leaves it; that is decided from the order's own lines,
never from the null `admitForManual` returns for both "nothing to reserve" and "no fit". A cooking row the
engine will not admit at its planned time is **deleted and counted as shed**, so no seeded order can exceed
the batch or the kitchen cap at any instant — the in-memory post-condition planned within capacity, and the
engine confirms it row by row. With the switch off the row gets the fallback split
`writeCookingReservation` records, as the manual path does. If the very first cooking row is refused —
which by construction fits an empty board — the reservation column is unreadable and the rest are seeded
without admission, with a warning, rather than seeding an empty board.

One more change was needed for the board to look like a service: the order count scaled with the slot
count but not the batch, so at 8 a batch on 12 slots only three times carried load. The target now scales
by `refBatch / args.capacity` — 1 at the demo default of 4, so every existing demo seeds exactly as before.

## §4 Harness — `scripts/seed-demo-grid.cjs` (listed; the suite is now 55)

**Failure mode:** a demo showing a prospect an order at a time no picker could offer, or a board the
kitchen could not cook. The real seeder compiled from `lib/`, run against an in-memory Supabase fake; the
5-minute comparison compiles the seeder from a clean HEAD worktree.

**Broken variant FIRST — the truck-level interval restored as the planning grid:**

```
  ✓ FAILED as required  V1 truck-level interval, van at 15: 23 of 37 seeded orders off the 15-minute grid (15:10, 15:10, 15:10, 15:10)
```

**The real tree:**

```
── A VAN AT 15 MINUTES ──────────────────────────────────────────────────────────────────
     25 orders — burgers per time: 15:15=8 15:30=0 15:45=4 16:00=0 16:15=8 16:30=0 16:45=2 17:00=0 17:15=6 17:30=0 17:45=1 18:00=0
     warnings: []
  ✓ every seeded order sits on a 15-minute time (a multiple of 15 from midnight)
  ✓ and every one is inside the event window
  ✓ a realistic mix across the 12 times: 2 full (8), 4 part-loaded, 6 free
  ✓ no post-condition warning (0 warning(s): [])
  ✓ every seeded order that cooks something (23) carries a cooking reservation at batch 8 / prep 15 — the van's current settings
  ✓ …whose slot and item count match the row it belongs to
  ✓ and the 2 sides-only order(s) carry none — there is nothing to reserve
  ✓ no minute has more than 8 burgers in the oven: peak 8
  ✓ with kitchen_capacity 8 the cap holds at every minute too: peak 8, 25 orders

── A VAN AT 5 MINUTES IS UNCHANGED FROM TODAY ───────────────────────────────────────────
  ✓ at today's settings (4 a batch, 5 minutes) the same 37 orders land at the same times with the same items as HEAD's seeder (HEAD: 37; warnings: [])
  ✓ HEAD wrote no reservations; the fix writes one for every order that cooks

✅ the seeder plans on the van's grid and every order is admitted by the engine
```

"No minute exceeds" is the engine's own `projectBackwardOccupancy` over the inserted rows and their
reservations, walked minute by minute from 30 minutes before the event to its end.

## §5 Verification — true exit codes

| command | exit |
|---|---|
| `node scripts/seed-demo-grid.cjs` | **0** (12 assertions; V1 failed first) |
| `node scripts/run-harnesses.cjs` | **0** — 55 run · 55 passed · 0 failed (see the identity-harness note) |
| `npx tsc --noEmit` | **0** |
| `npx next build` | **0** |

**Goldens — unchanged, byte for byte. No generator was run.**

| golden | sha256 |
|---|---|
| `scripts/fixtures/batch-rolling-golden.json` | `8bdae817748ad334bdac297592f19a58550fd17bc5ce7424331d73df82f32660` |
| `scripts/fixtures/batch-reservation-golden-on.json` | `e3f0a88099fd797c659da57881febc378e928dbc7bc8283a6931c814d6b29222` |

**The identity harness, and why two harness files changed.** After your 15:28 commit,
`scripts/slot-interval-engine-identity.cjs` failed: it strips the two parameters the V13.5 work added to
`earliestBackwardFitSlot` and compares the rest against **`HEAD`** — a check whose premise was "HEAD is
the old engine", which stopped being true the moment the engine work was committed. I replicated its
comparison against `fc0fddc` and the function is byte-identical up to those two parameters, i.e. nothing
changed in the engine. The harness now pins `PRE_FIX_ENGINE_COMMIT = 'fc0fddc'` for both its worktree and
its `git show` reads, and `headWorktree(tag, ref = 'HEAD')` in `_slot-interval-compile.cjs` gained the
optional ref. The check means what it always did, and passes. `lib/slot-availability.ts` is untouched
this round.

**eslint, per rule, against a clean HEAD worktree (`5f70e07`):**

| file | HEAD | working tree | delta |
|---|---|---|---|
| `lib/seed-demo-orders.ts` | 2 `no-explicit-any` | 2 `no-explicit-any` | 0 |
| `scripts/slot-interval-engine-identity.cjs` + `_slot-interval-compile.cjs` | 10 `no-require-imports`, 1 `no-unused-vars` | same | 0 |
| `scripts/seed-demo-grid.cjs` (new) | — | 4 `no-require-imports` | the house pattern for `.cjs` harnesses |

No rule gained a count.

---

# PART 2 — the demo

## §6 Before (read-only)

```sql
SELECT trucks.id, trucks.name, trucks.slug, trucks.plan, trucks.feature_overrides, trucks.collection_interval_mins
  FROM trucks WHERE trucks.name ILIKE '%Between Buns%';
```
→ `demo-8c95xz1twsn1xfhx3a4nkjv7j3` · Between Buns Royston · slug `demo-feb2kf8a1v02fbyfbq9bss0ade` ·
plan **demo** · overrides `{}` · truck interval 5 (legacy column).

```sql
SELECT truck_vans.id, truck_vans.name, truck_vans.kitchen_capacity, truck_vans.capacity_window_mins,
       truck_vans.collection_interval_mins, truck_vans.operator_collection_interval_mins
  FROM truck_vans WHERE truck_vans.truck_id = 'demo-8c95xz1twsn1xfhx3a4nkjv7j3';
```
→ `3a95c5c4…` "Van 1" · kitchen_capacity **NULL** · window 5 · customer interval **5** · operator override **NULL**.

```sql
SELECT menu_categories.name, menu_categories.prep_secs, menu_categories.batch_size, menu_categories.counts_toward_capacity
  FROM menu_categories WHERE menu_categories.truck_id = 'demo-8c95xz1twsn1xfhx3a4nkjv7j3';
```

| category | prep_secs | batch_size | counts |
|---|---|---|---|
| Burgers | **300** | **4** | true |
| Sides | 0 | 0 | false |
| Dips & Sauces | 0 | 0 | false |
| Specials | 0 | 0 | false |

Events: one, `868b652b…`, 2026-09-18 15:00–18:00, open, van `3a95c5c4…`, no interval overrides.
Demo session: created 2026-09-12 19:00:48Z · `expires_at` **2026-10-12T19:00:48Z** · `first_opened_at`
**null** · `public_ref` `between-buns-royston-8c6a` · not retired. Orders: 34, all `confirmed`.

## §7 The writes — three, all through the demo truck's own dashboard token

The manage route grants a demo truck's `dashboard_token` owner access (`via: 'demo'`), so no admin
session was needed for the settings. Each call resolves the truck **from the token**; the category update
is keyed by category id **and** truck id, the van update by van id **and** truck id.

```sql
-- (1) POST /api/manage  {token, action:'upsert_category', id, name:'Burgers', prep_secs:900, batch_size:8,
--     allow_notes:false, default_stock:null, sort_order:1, counts_toward_capacity:true}   → 200
UPDATE menu_categories SET prep_secs = 900, batch_size = 8, counts_toward_capacity = true
 WHERE menu_categories.id = 'd3fcd646-2dd4-4265-81fb-ad89ec4ecb2f' AND menu_categories.truck_id = 'demo-8c95xz1twsn1xfhx3a4nkjv7j3';

-- (2) POST /api/manage  {token, action:'update_van_settings', vanId, collection_interval_mins:15,
--     operator_collection_interval_mins:null}   → {"ok":true}
UPDATE truck_vans SET collection_interval_mins = 15, operator_collection_interval_mins = NULL
 WHERE truck_vans.id = '3a95c5c4-cd3d-4cc1-8f1a-25f47ba6e948' AND truck_vans.truck_id = 'demo-8c95xz1twsn1xfhx3a4nkjv7j3';

-- (3) POST /api/demo/restart {token}   → restartDemoService: deletes the truck's orders, events,
--     slot_capacity and production_slot_usage; provisions today's event; seeds through seedDemoOrders
```

- **Sides, Dips & Sauces, Specials** — 0 / 0 / false each, **left alone**.
- **kitchen_capacity** — NULL, which is "no kitchen-wide ceiling", not "below 8"; **left as it is**. The
  burger batch of 8 is the binding ceiling.
- The first attempt at (1) and (2) was refused with "Token required" because the manage POST reads the
  token from the body, not the query; the restart I issued in that same step therefore ran on the OLD
  settings. Both settings were then applied correctly (responses above) and the restart re-issued.

## §8 Regeneration — and what happened to it

**The path.** The admin Create Demo route (`/api/admin/provision-demo`, `existingTruckId`) needs an admin
session I do not have. The other normal path is the one a prospect's own demo takes on every restart:
`/api/demo/restart` → `restartDemoService` → `provisionDemoEvent` + `seedDemoOrders` + the ledger rebuild —
the same seeding code, authorised by the demo token. Used, three times. It takes these settings without
change: it reads the van and the categories fresh on every run.

**What happened.** Each of my restarts on localhost (fixed seeder) was followed within seconds by another
restart with the **pre-fix** seeder:

| time (UTC) | who | result |
|---|---|---|
| ~14:52 | me, localhost | event `450a59ac`, 23 orders seeded (the fixed seeder's count for this window) |
| **14:53:25** | not me | event `2a46d698`, **32 orders on 16:05 16:25 16:50 17:10 17:30 17:50 18:15, 0 reservations** — the pre-fix seeder's 5-minute grid; my event and orders deleted |
| 15:00:30 | me, localhost | my first row inserted **with** a reservation… |
| **15:00:31** | not me | event `df2ee952`, **37 orders on 16:10 16:30 16:55 17:15 17:40 18:00 18:20 18:45, 0 reservations**; my event deleted mid-seed, leaving my one row with `event_id` NULL |

Only the pre-fix seeder produces a 5-minute board with no reservations, and localhost no longer runs it.
The only place it still runs is **production**, so a production dashboard client for this demo is open
somewhere and restarts it — the timing (one second after my restart's deletes) matches a tab reacting to
the realtime change. `first_opened_at` is still null, so it was not the prospect's first-open claim.

**So the demo's seeded board is, at hand-over, the pre-fix one**, and it will be again after any restart
until the fixed seeder is deployed. Worse, with prep 900 on a 5-minute grid the pre-fix planner produces
what the dashboard read back as **"12 Burgers" and "10 Burgers" in red** — the old planner's sum-based
post-condition against the new batch. I did not deploy: nothing in this task authorised it, and the tree
deploys as a whole.

**What is right and will hold:** the three settings (§7) are rows on the truck's van and category, and
every restart — pre-fix or fixed — reads them. The moment the fixed seeder runs against this truck
(a restart after deploy, or the prospect's first open, which claims and restarts), the board is the
15-minute one in §10.

## §9 Verification (read-only) — what could and could not be checked

**Checked and holding:**
- van: customer interval **15**, operator override **NULL** (box unticked), kitchen_capacity NULL;
- Burgers: prep **900** s, batch **8**, counts_toward_capacity **true**; the other three categories untouched;
- the switch: `trucks.plan = 'demo'` ⇒ `resolveBatchReservations` **ON** (`/api/slots` for this truck
  returns `batchReservations: true`, `intervalMins: 15`; the customer page lists 15:30 15:45 16:00 … on the
  15-minute grid);
- the demo session: `expires_at` **2026-10-12T19:00:48Z**, not retired, `public_ref`
  `between-buns-royston-8c6a`.

**Could not be verified on the live rows, because they are the pre-fix seeder's:** every order on the
15-minute grid; every order with a reservation at batch 8 / prep 15; no minute over 8. Those three hold
for the fixed seeder — proven in the harness against these exact settings (§4) and, for the 23 orders my
restart did seed before they were deleted, by construction of the same code. The one orphan row (event_id
NULL, reservation at 16:45) is mine; the next restart's `orders.delete().eq('truck_id')` removes it.

**The link.** `app/demo/[ref]/route.ts` serves the prospect link by `public_ref`:
`https://<production host>/demo/between-buns-royston-8c6a`; the dashboard itself is
`/dashboard/<demo dashboard token>` (token not reproduced here). Expiry is **24 days out**, not one month:
`expires_at` is monotonic and was set 30 days from the session's creation on 12 September; `restartDemoService`
does not touch it, and the path that extends it (`touchDemoSession`, on the admin re-provision) is the one
I could not call. Re-provisioning through Create Demo, or `saveDemoEmail`, extends it.

## §10 What the prospect will see (fixed seeder, this truck's settings; rendered through `buildSlotIndicators`)

For a 15:00–18:00 service the seeded board is:

```
  15:00  🟢            15:15  🔴  8 Burgers     15:30  🟢            15:45  🟡  4 Burgers
  16:00  🟢            16:15  🔴  8 Burgers     16:30  🟢            16:45  🟡  2 Burgers
  17:00  🟢            17:15  🟡  6 Burgers     17:30  🟢            17:45  🟡  1 Burgers
  18:00  🟢
```

- **The capacity strip** shows twelve collection times a quarter-hour apart. Two are red and full
  ("8 Burgers" — a whole batch cooking in the fifteen minutes before), four are amber with a part batch
  ("4", "2", "6", "1 Burgers"), six are green and empty. No time is over capacity and the over-capacity
  banner does not appear.
- **Add Order, dropdown open**, with three burgers in the basket: every green and amber time is offered;
  the two red ones carry the **×** and read "Not enough time" — the batch before them is already full.
- **Adding an order that needs two batches** (16 burgers): **no time is offered** — every row shows the
  cross, because two full batches need thirty clear minutes of oven and the seeded board never leaves
  more than fifteen. Choosing one anyway opens the "Can't be ready by …" popup with **Place it anyway**;
  placing it puts that time over and the banner names it. An 8-burger order fits any green time and is
  crossed at every amber one — a part batch plus a full batch is nine or more.

## git status — after (HEAD `5f70e07`)

**0 staged · 4 modified · 2 untracked (this report is the second).**

```
 M lib/seed-demo-orders.ts                       the seeder (Part 1)
 M scripts/_slot-interval-compile.cjs            headWorktree(tag, ref = 'HEAD')
 M scripts/harnesses.json                        + seed-demo-grid.cjs (55)
 M scripts/slot-interval-engine-identity.cjs     pinned to fc0fddc
?? scripts/seed-demo-grid.cjs                    the harness
?? docs/between-buns-demo-report.md              this report
```

Nothing was staged, committed, stashed, reset or restored. The temporary HEAD worktree used for the lint
delta was removed; the two stale `slot-head-dots-*` worktrees from earlier harness runs (Open item 9) are
still registered and were left alone.

**No truck other than the demo truck was written to.** Every write went through a route that resolves
the truck from the demo token and scopes its `UPDATE`/`DELETE` by that truck id; test-truck was not
called; the harness writes to an in-memory fake.

## Anything I could not establish

- **Which client restarted the demo at 14:53:25Z and 15:00:31Z.** Production, by elimination — only it
  runs the pre-fix seeder — but I have no access to its logs or to whoever has the tab open.
- **The Create Demo admin path.** Needs an admin session; I used the restart path, which runs the same
  seeder. If you want it re-provisioned through Create Demo (which also extends the expiry), that is a
  30-second admin action after deploy.
- **The 15-minute board on the live rows.** Seeded three times, deleted three times by the pre-fix
  restart. It will hold once the fixed seeder is what production runs.
- **The expiry.** 2026-10-12, 24 days out; extending it to a month from today needs the admin
  re-provision or the prospect entering an email.
