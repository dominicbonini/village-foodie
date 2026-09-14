# The demo seeder must never seed a board that is over capacity

**Built 14 September 2026.** Nothing staged, committed or reverted. Item 7 (KDS) untouched. The capacity
engine, the cron, `/api/events/manage`, `/manage`, `/api/admin/create-truck` and the `??` fragment after
`resolvePaidStep` are unchanged.

Every claim is marked **READ** (read in source this session) or **INFERRED**. Citations are by symbol.

---

## 🔴 PREMISES — what was wrong, and what is true instead

1. **"Demo vans are `kitchen_capacity: null` … so the global veto cannot fire and every breach is
   per-category."** True at PROVISION time, false in general — and my own §0d said the same thing, so
   this corrects me as much as the brief. READ: the demo dashboard's Settings tab writes
   `truck_vans.kitchen_capacity` through `/api/manage` `update_van_settings`
   (`app/dashboard/[token]/page.tsx`, the `updateVanSetting` POST), and that action has **no demo gate**
   — review D recorded kitchen capacity as live in demo Settings. So a demo Dominic has configured, or a
   demo that is later restarted, CAN carry a global concurrency ceiling. **The post-condition reads
   `kitchen_capacity` rather than assuming null**, and the harness exercises that case explicitly — it is
   the one case that needed shedding (10 orders, 2 passes).
2. **`peakPerSlot` was not merely miscounted — NOTHING READ IT.** Its own comment says *"The admin
   provision panel surfaces it."* READ: `grep -rn "peakPerSlot" app lib components scripts supabase
   proxy.ts` returns hits only inside `lib/seed-demo-orders.ts` itself, one stale comment in
   `lib/demo-restart.ts`, one in a SQL script, and documentation. **Zero code readers.** It was not a
   safety check that failed; it was a decorative number with a comment claiming otherwise.
3. **A single order CAN NEVER BREACH.** Discovered because a control of mine failed: piling eight Pizzas
   into one slot produced **no** breach. READ, `projectBackwardOccupancy`: `numWindows = ceil(N/batch)`
   and each window receives at most `batch`, so one production slot self-distributes and can never
   exceed its own ceiling. **A breach is a COLLISION between two backward chains.** This is the strongest
   argument for the brief's own conclusion: no planner predicts that cheaply, so the seeder must ask the
   detector.
4. **`provisionTruck`'s van default is 5, not null.** READ: `kitchen_capacity: 'kitchen_capacity' in
   vanOpts ? vanOpts.kitchen_capacity : 5`. `provisionDemo` passes the key explicitly with
   `DEMO_VAN_CAPACITY = null`, so demos get null today — but a future demo caller that omits the key gets
   a ceiling of 5 silently. Noted, not changed.
5. **"Between Buns' shape breaches"** — partly. Its shape (3 cooked categories, 0 instant items) makes
   the pre-fix planner over-fill by 2.5× (peak **10/4**, and **11/4** on a realistically skewed 10/2/2
   item split), but with the load spread over three categories the per-category detector verdict stays
   clean for those item mixes. The shapes that breach the detector outright pre-fix are the
   **single-cooked-category** one (14/4, up to 4 breaches) and the **batch_size 0 / null** ones (4/1, up
   to 13 breaches), plus **any** shape once a global `kitchen_capacity` is set. The defect was
   unambiguously live on Between Buns; whether the banner fires there depends on the item mix.
6. **VERIFIED FACT accepted as given, not re-derived:** `demo-v6mxmabda11639h946ph9nvvhg`
   "Between Buns Royston" has 3 cooked categories and 0 instant items. SQL to re-confirm is in §SQL.

### The two git commands, verbatim

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   app/api/admin/outreach/route.ts
	modified:   app/api/admin/provision-demo/route.ts
	modified:   app/api/dashboard/route.ts
	modified:   app/api/demo/save-email/route.ts
	modified:   app/api/setup/route.ts
	modified:   app/dashboard/[token]/page.tsx
	modified:   components/admin/OutreachPanel.tsx
	modified:   components/dashboard/DemoWelcome.tsx
	modified:   docs/manual-update-report.md
	modified:   docs/reference-manual.md
	modified:   docs/scraper-reference-manual.md
	modified:   lib/demo-session.ts
	modified:   lib/provision-demo.ts

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	app/demo/
	components/admin/CreateDemoModal.tsx
	docs/demo-outreach-build-report.md
	docs/demo-outreach-review-report.md
	docs/demo-restart-report.md
	lib/demo-logo.ts
	lib/self-serve-discovery-link.ts
	supabase/migrations/20260912_demo_sessions_outreach.sql

no changes added to commit (use "git add" and/or "git commit -a")
════
5e57c45 scraper
7a9b823 landing and scraper
6e1259b scraper updates
9e83a5e migration changes
69c4fdd migration changes
```

---

# PHASE 0 — what the code does

## 0a · `seedDemoOrders`, re-read by symbol

| symbol | what it was |
|---|---|
| `ORDER_SHAPES` | 12 `{mains, extras}` pairs, cycled. Per cycle: 14 mains, 31 items. **Unchanged by this build.** |
| `lineFor(src, quantity, seed)` | builds one order line, resolving REQUIRED modifier groups; `unit_price` includes modifiers |
| `cooked` | `Number(cat?.prep_secs ?? 0) > 0` — a property of the item's CATEGORY |
| `all` / `mains` / `others` | `all` = active items (limit 120); `mains` = cooked; `others` = not cooked |
| `mainsPool` / **`otherPool`** | `mains.length ? mains : all` / **`others.length ? others : all`** ← the defect's mechanism |
| budget / stride / packing | `budgets` from `FILL_PATTERN × ceiling`; strided across `slots`; an order seated where `r.left >= shape.mains` |
| `ceiling` | `Math.max(1, args.capacity)` — the **constant** `DEMO_MAINS_BATCH = 4`, never the committed `batch_size` |
| returns | `inserted, mainsItems, totalItems, slotsUsed, skippedNoMenu, peakPerSlot` |

**The defect in one line:** the budget was charged `shape.mains`, but the LINES came from two pools, and
when `otherPool` falls back to `all` the "extras" are cooked too — up to 3 uncounted cooked lines per
order on top of the 1–2 counted ones.

## 0b · The detector, and whether the seeder can feed it

READ, `detectCapacityBreaches` (`lib/capacity-breach.ts`): it calls `projectBackwardOccupancy` and reads
the RAW window fields — `remainingTotal < -EPS` (global) or `remainingByCat[c] < -EPS` (per category).
It deliberately does **not** use `tone === 'red'`, which also fires on legitimately-full slots. For each
collection slot it reads `pileByStart.get(slotMins) ?? byStart.get(slotMins - step)`.

READ, `projectBackwardOccupancy`: seats each production slot's per-category load backward —
`numWindows = ceil(N/batch)`, `startMins = deadline − (numWindows−i) × prepMins` — and builds
`pileByStart`, a display-only pseudo-window at `eventStartMins` summing **every** pre-open window's
load against a single batch. `loadRunsOffFront` is a separate predicate used by the picker/fit path; the
**detector does not read it**, so the post-condition does not either.

**`batch: c.batch_size || 1` (READ, `/api/dashboard`): a category with `prep_secs > 0` and
`batch_size = 0` — or null — yields batch 1**, the tightest possible ceiling, not an unlimited one. The
seeder now mirrors that expression exactly (`MenuLine.batch`).

**The detector's exact inputs, and where the seeder gets each — it can assemble all of them:**

| input | source at seed time |
|---|---|
| `times` | the REAL `generateCollectionTimes(start, end, collection_interval_mins, slot_duration_mins, 30)` from the truck row, **unioned with the seeder's own slots** so a loaded slot can never escape the check |
| `productionSlotUnits` | `buildUnitsInMemory` — the real `normaliseOrderLines` + `orderItemsToQtyByCat` + `mergeQtyByCat` + the `collection_times` window key |
| `catConfigs` | the same `menu_items_db → menu_categories` read, now selecting `batch_size` and `counts_toward_capacity` |
| `kitchenCapacity`, `capacityWindowMins` | `truck_events.van_id → truck_vans` (see premise 1) |
| `eventStartMins` | `args.startTime` |
| `orders` | the in-memory rows (attribution only — the verdict comes from the units) |

**No round trip it cannot make:** one `Promise.all` of four reads (`trucks`, `collection_times`,
`truck_events`, `buildItemCatMap`) plus one dependent `truck_vans` read. Two sequential round trips, once.

## 0c · `buildDemoAssumptions` — which shapes produce zero instant items

READ: `MAIN_PREP_SECS = 300`, `MAIN_BATCH_SIZE = 4`;
`KNOWN_MAIN_CATEGORIES = {Mains, Burgers, Pizza, Wraps & Sandwiches}`;
`KNOWN_INSTANT_CATEGORIES = {Sides, Dips & Sauces, Drinks, Desserts}`;
`NO_SIGNAL_CATEGORIES = {Specials, Other}`. Every matched main gets `{prep_secs: 300, batch_size: 4}`;
everything else `{prep_secs: 0, batch_size: 0, counts_toward: false}`. When nothing matches, the
**most-populated non-instant category** becomes the main (`usedFallback`).

**Zero instant ITEMS therefore arises whenever every category with items is a cooked one:** a
single-category extraction (`Mains` only); several known mains and no Sides/Drinks (**Between Buns'
shape — 3 cooked, 0 instant**); or the fallback firing on a menu whose only other categories are empty.

## 0d · The global veto

READ: `DEMO_VAN_CAPACITY: number | null = null` (`lib/provision-demo.ts`), passed as the van's
`kitchen_capacity`. READ, `provisionDemoEvent`: the `slot_capacity` block is inside
`if (van?.kitchen_capacity)`, so **no `slot_capacity` rows are written** for a null-capacity demo — its
own comment: *"No van-level total → no slot_capacity rows."*

**Does ANY demo path set a non-null `kitchen_capacity`? YES — see premise 1.** The census of every
`kitchen_capacity` writer across `app lib components scripts supabase proxy.ts` gives three: the demo/
operator dashboard's `update_van_settings` POST, `/api/manage`'s handler behind it, and
`provisionTruck`'s insert (which defaults to **5** when the key is omitted).

---

# PHASE 1 — the planner made honest

All in `lib/seed-demo-orders.ts` (READ, edited).

1. **Every cooked line is charged.** The lines are now built **before** the budgets: each shape becomes a
   `Prospect { lines, cookedByCat, cookedTotal }` via a single `take()` that increments `cookedByCat`
   whenever `src.cooked`. The charge is a fact about the LINES, not about the shape that produced them,
   so the `otherPool` fallback cannot smuggle load past the budget again.
2. **The budget is per category.** `allowanceFor(f)` gives each cooked category its own allowance —
   `min(batch[c], max(1, round(batch[c] × f)))` — and an order is seated only where **every** cooked
   category it carries fits. The engine's ceiling is per category; a single aggregate number cannot
   express "4 items is fine as 2+2 and over as 4 of a category whose batch is 3".
3. **The ceiling comes from the committed data.** `MenuLine.batch = Number(cat?.batch_size) || 1` —
   byte-for-byte the dashboard's own expression, so `batch_size` 0 or null is batch **1** here exactly as
   it is there. The `refBatch` that decides HOW MANY slots get a budget is the **smallest** committed
   batch, so a tight category is not drowned by a loose one. `args.capacity` survives in the signature
   but is documented as a fallback used only when the menu has no cooked category at all.
4. **Multi-item orders kept.** `ORDER_SHAPES` is untouched and the `otherPool` fallback stays. Orders
   that fit nowhere are dropped — **a thinner board, never a fuller one**. Items per order across the
   matrix: **1.50–2.54**.

# PHASE 2 — the post-condition

```
plan → build rows in memory → [ detect → shed → detect ]×N → renumber → INSERT
```

- **The check is the real detector.** `detectCapacityBreaches` — the same function `/api/dashboard` calls
  to raise the "N slots over capacity" banner — over `buildUnitsInMemory(rows, …)`. Nothing about the
  engine's rules is reimplemented.
- **It runs BEFORE the insert**, so no breaching board ever reaches the database and there is no
  delete-to-recover path. That is the same posture as `computeEventUnitRows`, the atomic-RPC helper that
  already computes post-insert units without inserting.
- **The one local piece is five lines** (`buildUnitsInMemory`), calling the real `normaliseOrderLines`,
  `orderItemsToQtyByCat`, `mergeQtyByCat` and the real `collection_times` window key. §V-equivalence
  proves it produces units **identical** to `getProductionSlotUnits` → `buildUnitsFromOrders`.
- **Shedding uses the detector's OWN attribution.** `breach.order_keys` comes back populated because the
  detector is handed synthetic `seed-<index>` keys; `capacity-breach.ts` inverts the backward projection
  with `contributingProductionSlots` precisely because a window's load usually collects elsewhere. My
  first implementation guessed instead ("biggest order nearest the breach") and **did not converge** —
  with `kitchen_capacity = 6` it shed 14 orders over 6 passes and still left a breach. Using the
  detector's inversion it clears in **2 passes, 10 orders**. Within the candidates: most of the
  over-category first (fewest orders per unit cleared), then nearest slot, then latest-placed.
  Removals are collected as indices and applied **after** the whole pass — splicing inside the loop
  shifts every later index.
- **Bounded, and never silent.** `MAX_BREACH_PASSES = 6`. Anything still breaching is returned as
  `unresolvedBreaches` **and** pushed into `warnings` naming the slot, the category and the counts, and
  logged as `[seed-demo-orders] POST_CONDITION_FAILED`. If the check cannot RUN (a read fails, a column
  is missing) the board stands but the caller is told it is **UNVERIFIED** — the seeder never returns a
  board it did not check without saying so.
- **`peakPerSlot` is gone.** Replaced by `peakCookedPerSlotPerCat` + `peakBatch` — the highest
  (category, slot) cooked count actually placed and the batch it sits against, so the pair **can fail**.
  Also added: `slotsAtCapacity`, `breachPasses`, `shedOrders`, `unresolvedBreaches`, `warnings`.
  **Callers of `peakPerSlot`: none in code** (premise 2), so nothing broke; `lib/provision-demo.ts` and
  `lib/demo-restart.ts` were updated to push `seeded.warnings` into their own `warnings`, which reach the
  admin response. Stale mentions remain in `docs/screenshot-seed-report.md`,
  `docs/reference-manual.md` §1796 and `scripts/seed-thai-kitchen-screenshots.sql` — flagged, not edited.
- **Cost.** Measured below: **+0.13 to +0.21 ms** of CPU in the clean case, +0.47 ms median in the
  shedding case, and **two sequential database round trips, once** (not per pass — the passes are pure
  CPU over data already in memory). Against `/api/demo`'s ~40–45 s and `maxDuration = 300`, negligible.

---

# PHASE 3 / VERIFICATION

**What every proof here would look like if it proved nothing, and how that was excluded.**

### The instruments

- **`tsc --noEmit -p .` — exit 0.** *Null:* the file is excluded from the program. *Excluded:* it failed
  during this build with `'peakPerSlot' does not exist in type 'SeededOrders'` and had to be fixed.
- **ESLint on `lib/seed-demo-orders.ts`, `lib/provision-demo.ts`, `lib/demo-restart.ts`** — findings are
  **rule-for-rule identical to HEAD**.
- **The harness drives the REAL modules** through a stub that serves the tables. *Null:* a stub that
  answers whatever the assertion wants. *Excluded by the controls below, each of which FAILS first.*

### V-equivalence · the one local loop equals the real read path

`buildUnitsInMemory`'s output is compared to `getProductionSlotUnits(supabase, truckId, eventId)` — the
exported function `/api/dashboard` calls, which reaches the module-private `buildUnitsFromOrders` with
its own queries, its own `collection_times` map, its own `itemCatMap` and its own `normaliseOrderLines`.
**Identical for all 7 menu shapes, on a truck with a populated `collection_times` map** (so the
`timeMap[ct] || ct` key actually bites). *Control:* dropping that window key makes the two **differ** —
the comparison is sensitive.

### V2 · the rule holds — every case ZERO breaches

🔴 **The verdict is not the seeder's.** The harness takes the rows the seeder INSERTED, reads units back
through the REAL `getProductionSlotUnits`, and runs the REAL `detectCapacityBreaches` over the
DASHBOARD's own `generateCollectionTimes` list. The seeder's own `unresolvedBreaches` is printed but
never asserted on — a check that marks its own homework is the failure this task exists to fix.

```

  menu shape                                 open   ord items/ord slots atCap peak/batch shed pass  ms  BREACHES
  sample (Pizza + Sides + Drinks)            17:00   37     2.54    16     6        4/4    0    1   15  0
  sample (Pizza + Sides + Drinks)            21:30   30     2.50    12     5        4/4    0    1    1  0
  sample (Pizza + Sides + Drinks)            23:40    4     2.25     2     0        3/4    0    1    0  0
  single all-cooked category (Mains)         17:00   34     2.32    26    10        4/4    0    1    1  0
  single all-cooked category (Mains)         21:30   28     2.32    22     7        4/4    0    1    0  0
  single all-cooked category (Mains)         23:40    2     1.50     1     0        3/4    0    1    0  0
  Between Buns shape (3 cooked, 0 instant)   17:00   36     2.47    13     4        4/4    0    1    0  0
  Between Buns shape (3 cooked, 0 instant)   21:30   29     2.41    11     3        4/4    0    1    0  0
  Between Buns shape (3 cooked, 0 instant)   23:40    3     2.00     1     0        3/4    0    1    0  0
  Between Buns shape, skewed (10/2/2 cooked) 17:00   35     2.40    21     8        4/4    0    1    0  0
  Between Buns shape, skewed (10/2/2 cooked) 21:30   29     2.41    17     8        4/4    0    1    0  0
  Between Buns shape, skewed (10/2/2 cooked) 23:40    2     1.50     1     0        3/4    0    1    0  0
  two cooked cats, differing prep/batch      17:00   37     2.54    12     7        6/6    0    1    0  0
  two cooked cats, differing prep/batch      21:30   30     2.50    10     6        6/6    0    1    0  0
  two cooked cats, differing prep/batch      23:40    4     2.25     2     1        2/2    0    1    0  0
  cooked category with batch_size 0 (engine reads 1) 17:00   28     2.07    25    25        1/1    0    1    1  0
  cooked category with batch_size 0 (engine reads 1) 21:30   23     2.09    20    20        1/1    0    1    0  0
  cooked category with batch_size 0 (engine reads 1) 23:40    2     1.50     2     2        1/1    0    1    0  0
  cooked category with batch_size null (engine reads 1) 17:00   28     2.07    25    25        1/1    0    1    0  0
  cooked category with batch_size null (engine reads 1) 21:30   23     2.09    20    20        1/1    0    1    0  0
  cooked category with batch_size null (engine reads 1) 23:40    2     1.50     2     2        1/1    0    1    0  0
  Between Buns + kitchen_capacity 6 (global veto ON) 17:00   26     2.19    13     2        4/4   10    2    1  0

  ✓ every case: ZERO breaches from the independent detector, and peak <= batch everywhere
```

**V3 · the board is still a good demo.** Read the table above: **2–37 orders**, **1.50–2.54 items per
order**, and **`atCap`** — slots finishing AT their category's batch — is 0–25, i.e. "some at max, none
over" is real and an empty board is not how the breach test is passed. Two shapes are worth naming:
`batch_size 0/null` (batch 1) gives a deliberately thin 28-order board where **every** used slot is at
capacity, which is correct for a ceiling of one; and the `23:40` clamp gives **2–4 orders** — the code
**errs thin**, because `MIN_TARGET_ORDERS = 4` is a target, not a floor the packer will breach for.

**V4 · latency, measured** (same process, same fixtures, pre-fix vs fixed, 40 iterations, median/p95 ms):

| menu shape | pre-fix | fixed | added (median) |
|---|---|---|---|
| sample | 0.10 / 0.39 | 0.27 / 0.65 | **+0.17 ms** |
| Between Buns (skewed) | 0.08 / 0.12 | 0.30 / 0.83 | **+0.21 ms** |
| batch_size 0 | 0.08 / 0.17 | 0.20 / 0.52 | **+0.13 ms** |
| shedding worst case (kcap 6, 2 passes) | — | 0.47 / 0.93 | — |

Plus **two sequential database round trips, once per seed** (one `Promise.all` of four reads, then
`truck_vans`). *Null:* timing a no-op. *Excluded:* the pre-fix seeder runs the same fixture in the same
process, so the delta is this change and nothing else.

**🔴 THE CONTROL — the pre-fix seeder through the IDENTICAL harness.** **34 breaches** across the matrix,
and `peak exceeds batch` on **18 of 22** rows. The rows the independent detector flagged:

```
  single all-cooked category (Mains)         17:00   37 orders  peak 14/4   4 breaches
  single all-cooked category (Mains)         21:30   30 orders  peak 14/4   2 breaches
  cooked category with batch_size 0          17:00   37 orders  peak  4/1  13 breaches
  cooked category with batch_size 0          21:30   30 orders  peak  4/1   9 breaches
  cooked category with batch_size null       17:00   37 orders  peak  4/1   1 breach
  cooked category with batch_size null       21:30   30 orders  peak  4/1   1 breach
  Between Buns + kitchen_capacity 6          17:00   37 orders  peak 10/4   4 breaches
```

The 3-cooked-category rows show `peak 10/4` and `11/4` — the planner over-filling by 2.5× — with a clean
per-category verdict for those item mixes (premise 5). **If the harness could not produce a breach it
could not prove their absence; it produces 34.**

**V1 · Gusto and every operator truck are untouched.**
- **The predicate:** `lib/seed-demo-orders.ts` has exactly **two importers** — `lib/provision-demo.ts`
  and `lib/demo-restart.ts`. `provisionDemo` calls `provisionTruck({ kind: 'demo', … })`;
  `restartDemoService` opens with `if (!isDemoIdentifier(truckId)) throw new DemoRestartError`. Their
  only callers are `/api/demo`, `/api/demo/return`, `/api/demo/restart` and `/api/admin/provision-demo`
  — every one of which resolves a `demo-` truck first, and `demo-` is a prefix `assertReservedPrefix`
  forbids on an operator truck. `grep -rn "seedDemoOrders"` over `app lib components scripts` outside
  those three files returns **nothing (exit 1)**.
  *Null result:* a grep whose pattern never matches. *Positive control on the same search over the same
  file set:* `lib/slot-bookings` is imported by **23** files, so the search does find importers.
- **Byte-level:** `git status --porcelain` shows the only files this task changed are
  `lib/seed-demo-orders.ts`, `lib/provision-demo.ts` and `lib/demo-restart.ts`. `lib/capacity-breach.ts`,
  `lib/slot-availability.ts`, `lib/slot-bookings.ts`, `lib/slot-generation.ts`, `lib/prep-utils.ts`,
  `app/api/dashboard/route.ts`'s capacity block and `app/api/orders/submit/route.ts` are **untouched** —
  the engine Gusto's board reads is the same engine, called, not changed.

**V5 · `restartDemoService` and `/api/demo` still succeed end to end.**
`restartDemoService` was run through a fuller stub that holds rows in memory, so the REAL deletes,
inserts, `provisionDemoEvent`, `seedDemoOrders` and `rebuildProductionSlotUsage` all execute and read
each other back:

```
  restartDemoService · sample           → event 17:00-20:00, 37 orders, 16 usage rows, breaches=0, warnings=0
  restartDemoService · betweenBunsSkew  → event 17:00-20:00, 35 orders, 21 usage rows, breaches=0, warnings=0
  restartDemoService · zeroBatch        → event 17:00-20:00, 28 orders, 25 usage rows, breaches=0, warnings=0
```

A pre-existing stale event and stale order were wiped (`ordersDeleted: 1`, `eventsDeleted: 1`), the DB
row count equals the reported `seededOrders`, occupancy was rebuilt, and the independent detector
returns zero.
*Control, and it FAILED twice before it passed:* first a hand-piled 8-Pizza order produced no breach at
all (premise 3 — a single order cannot self-breach); then, placed correctly one slot after the busiest
seeded slot, it still produced none because `production_slot_usage` is a **cache** the restart had
already populated, so the re-read was stale. With the real `rebuildProductionSlotUsage` run after the
manual insert, **one manually placed order breaches (1)** — which is exactly what Dominic's rule still
permits, and it proves the zero-breach assertions above are live rather than vacuous.
`/api/demo` shares the identical `seedDemoOrders` call through `provisionDemo` (same args, same return
contract, enforced by `tsc`) and its `warnings` reach the admin response via
`app/api/admin/provision-demo/route.ts`'s `warnings: result.warnings` — **INFERRED** for the HTTP layer;
only the library path was executed.

---

# Files touched

`lib/seed-demo-orders.ts` (the planner + the post-condition), `lib/provision-demo.ts` and
`lib/demo-restart.ts` (surface `seeded.warnings`). Nothing else.

# Open items

- `docs/screenshot-seed-report.md`, `docs/reference-manual.md` §1796 and
  `scripts/seed-thai-kitchen-screenshots.sql` still describe `peakPerSlot` as the breach guard. Stale.
- The seeder places on a fixed **5-minute** grid (`SLOT_INTERVAL_MINS`) while the dashboard's slot list
  comes from `trucks.collection_interval_mins`. They agree while demos take the column default; the
  post-condition's `times` is a **union** of both so nothing escapes the check, but if a demo truck ever
  carried a 10-minute interval the seeder would place orders on slots the customer cannot book.
- `provisionTruck`'s `kitchen_capacity` default of **5** on an omitted key (premise 4).
- `MIN_TARGET_ORDERS = 4` cannot always be met in a midnight-clamped window; the code errs thin, which
  is right, but a 2-order board is a poor demo. A longer minimum window is the real fix.

# SQL — for Dominic to run; **nothing here was executed**

**First, confirm the columns these queries name:**

```sql
select c.table_name, c.column_name, c.data_type, c.is_nullable, c.column_default
  from information_schema.columns c
 where c.table_schema = 'public'
   and (c.table_name, c.column_name) in (
     ('menu_categories','prep_secs'), ('menu_categories','batch_size'),
     ('menu_categories','counts_toward_capacity'), ('menu_categories','is_active'),
     ('menu_items_db','category_id'), ('menu_items_db','is_active'),
     ('truck_vans','kitchen_capacity'), ('truck_vans','capacity_window_mins'),
     ('trucks','collection_interval_mins'), ('trucks','slot_duration_mins'),
     ('production_slot_usage','production_slot'), ('production_slot_usage','units_by_cat'),
     ('orders','slot'), ('orders','items'), ('orders','status'), ('orders','event_id'))
 order by c.table_name, c.column_name;
```

**Between Buns Royston — confirm the 3-cooked / 0-instant shape and the committed batches:**

```sql
select mc.name              as category,
       mc.prep_secs,
       mc.batch_size,
       mc.counts_toward_capacity,
       count(mi.id)         as active_items
  from public.menu_categories mc
  left join public.menu_items_db mi
    on mi.category_id = mc.id and mi.is_active
 where mc.truck_id = 'demo-v6mxmabda11639h946ph9nvvhg'
 group by mc.name, mc.prep_secs, mc.batch_size, mc.counts_toward_capacity
 order by mc.prep_secs desc, mc.name;
```

**Every live demo exposed to the `otherPool` fallback** — cooked items but no instant items:

```sql
select t.id,
       t.name,
       count(*) filter (where coalesce(mc.prep_secs, 0) > 0) as cooked_items,
       count(*) filter (where coalesce(mc.prep_secs, 0) = 0) as instant_items,
       count(distinct mc.name) filter (where coalesce(mc.prep_secs, 0) > 0) as cooked_categories
  from public.trucks t
  join public.menu_items_db mi on mi.truck_id = t.id and mi.is_active
  join public.menu_categories mc on mc.id = mi.category_id
 where t.id like 'demo-%'
 group by t.id, t.name
having count(*) filter (where coalesce(mc.prep_secs, 0) = 0) = 0
 order by t.id;
```

**Is any demo board over capacity RIGHT NOW, per collection slot and category** (the planner's own
arithmetic; the engine's backward projection is stricter, so treat a row here as a floor, not a ceiling):

```sql
select o.truck_id,
       o.slot,
       mc.name                       as category,
       sum((li ->> 'quantity')::int) as cooked_items,
       max(coalesce(nullif(mc.batch_size, 0), 1)) as effective_batch
  from public.orders o
  cross join lateral jsonb_array_elements(o.items) as li
  join public.menu_items_db mi
    on mi.truck_id = o.truck_id and mi.name = li ->> 'name'
  join public.menu_categories mc
    on mc.id = mi.category_id
 where o.truck_id like 'demo-%'
   and o.status in ('pending','confirmed','modified','cooking')
   and coalesce(mc.prep_secs, 0) > 0
 group by o.truck_id, o.slot, mc.name
having sum((li ->> 'quantity')::int) > max(coalesce(nullif(mc.batch_size, 0), 1))
 order by o.truck_id, o.slot;
```

**Which demo vans carry a non-null `kitchen_capacity`** (premise 1 — the global veto is ON for these, so
their seeded boards go through the shedding path):

```sql
select v.truck_id, v.id as van_id, v.name, v.kitchen_capacity, v.capacity_window_mins, v.active
  from public.truck_vans v
 where v.truck_id like 'demo-%'
 order by v.truck_id;
```

**Does any demo truck sit off the 5-minute grid the seeder places on?** (expect zero rows)

```sql
select t.id, t.name, t.collection_interval_mins, t.slot_duration_mins
  from public.trucks t
 where t.id like 'demo-%'
   and (coalesce(t.collection_interval_mins, 0) <> 5 or coalesce(t.slot_duration_mins, 0) <> 5);
```

## Closing `git status`, verbatim (nothing staged)

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   app/api/admin/outreach/route.ts
	modified:   app/api/admin/provision-demo/route.ts
	modified:   app/api/dashboard/route.ts
	modified:   app/api/demo/save-email/route.ts
	modified:   app/api/setup/route.ts
	modified:   app/dashboard/[token]/page.tsx
	modified:   components/admin/OutreachPanel.tsx
	modified:   components/dashboard/DemoWelcome.tsx
	modified:   docs/manual-update-report.md
	modified:   docs/reference-manual.md
	modified:   docs/scraper-reference-manual.md
	modified:   lib/demo-restart.ts
	modified:   lib/demo-session.ts
	modified:   lib/provision-demo.ts
	modified:   lib/seed-demo-orders.ts

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	app/demo/
	components/admin/CreateDemoModal.tsx
	docs/demo-outreach-build-report.md
	docs/demo-outreach-review-report.md
	docs/demo-restart-report.md
	docs/demo-seeder-capacity-report.md
	lib/demo-logo.ts
	lib/self-serve-discovery-link.ts
	supabase/migrations/20260912_demo_sessions_outreach.sql

no changes added to commit (use "git add" and/or "git commit -a")
```
