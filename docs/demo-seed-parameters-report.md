# Create Demo asks for the kitchen, and the seeded board is built to it

**Date** 19 September 2026 · **Scope** localhost only, nothing deployed · **Trucks written to: none.**
No demo was created (see *Anything I could not establish*), no test-truck row changed, no
`outreach_templates` row touched, and Pizzeria Gusto was never called, read or written.

**What was built.** The admin outreach Create Demo modal now asks for three numbers before it builds —
collection times, cook time and batch size — validates them server-side, writes them onto the demo's van
and cooking category, and seeds a board that obeys them. A live demo can now be **rebuilt** over itself
with new numbers, because a demo cannot be un-created. The anonymous landing-page demo is untouched: it
never sends these fields, and a demo built at the defaults is byte-for-byte the one built before this
existed — proven against a clean worktree of the previous commit.

**Two seeder defects surfaced while proving it, and both are fixed.** At a cook time longer than the grid
the planner budgeted per SLOT while the oven works per WINDOW, so 5-minute times with a 10-minute cook and
a batch of 2 produced a board with 35 of 37 times empty. And no board guaranteed room for an order needing
two batches — at 15/15/8 there was nowhere on the board it could go.

---

## git status — before

**HEAD `7346860` "between buns demo" · 0 staged · 0 modified · 0 untracked.** A clean tree; the previous
round's work is committed.

---

# R1–R4 — what Create Demo does today

## R1 · Create Demo, end to end

| step | symbol | today |
|---|---|---|
| the control | `ProspectMetaFacts` in `OutreachPanel` | `p.demo ? <DemoLinkChip/> : <button>Create demo</button>` — **no way to build a second one** |
| the modal | `CreateDemoModal` | a menu photo, pasted text, or "Use the sample pizza menu". No kitchen questions. |
| the route | `app/api/admin/provision-demo/route.ts` | reads `file` · `text` · `existingTruckId` · `discoveryTruckId` · `name` · `template`; `verifyAdmin` gates it |
| provisioning | `provisionDemo` | `provisionTruck` → session → logo → `buildMenu` → `provisionDemoEvent` → `seedDemoOrders` → ledger rebuild |
| the menu | `DEMO_TEMPLATES` (`pizza`, `burgers`, …) or an extraction | committed by `commitExtraction` → `commitMenu` |
| which category cooks | `buildDemoAssumptions` | `KNOWN_MAIN_CATEGORIES` = Mains · Burgers · Pizza · Wraps & Sandwiches; else the most-populated non-instant category |
| its numbers | `MAIN_PREP_SECS` / `MAIN_BATCH_SIZE` in `lib/demo-assumptions.ts` | **`300` seconds (5 minutes) and `4` a batch** — the defaults the controls now start from |

```ts
prep[c] = mainSet.has(c)
  ? { prep_secs: MAIN_PREP_SECS, batch_size: MAIN_BATCH_SIZE }
  : { prep_secs: 0, batch_size: 0, counts_toward: false }
```

Only the mains count toward capacity; every other category is instant. That is unchanged.

## R2 · The van a demo gets

`provisionTruck` is called by `provisionDemo` with `van: { name: 'Van 1', kitchen_capacity: DEMO_VAN_CAPACITY }`,
and `DEMO_VAN_CAPACITY` is **`null`** — no kitchen-wide ceiling, deliberately: the per-category batch is
the one number that matters and the engine enforces it independently.

| column | at creation | set by |
|---|---|---|
| `kitchen_capacity` | `null` | `provisionDemo` → `provisionTruck` |
| `capacity_window_mins` | column default (5) | not written |
| `collection_interval_mins` | column default (5) | **not written by anything** — this is what the new control fills |
| `operator_collection_interval_mins` | `null` | not written |

## R3 · The seeder after the van-grid fix

`seedDemoOrders` resolves its grid from `resolveIntervalsFor(supabase, vanId, eventId).customer` — the
resolver the customer submit path uses — and its ceiling from the categories. The pattern rule, quoted:

```ts
/** Per-slot MAINS BUDGET as a fraction of the ceiling. Cycles FULL → PARTIAL so the board reads busy WITH
 *  visible headroom; the zeros are what leave gaps between filled slots. A budget never exceeds the batch,
 *  and orders are packed WITHIN it, so a breach is impossible by construction. */
const FILL_PATTERN = [1.0, 0, 0.5, 0, 1.0, 0, 0.25, 0, 0.75, 0]
```

⚠️ **The zeros never reach the grid.** `const nonZero = FILL_PATTERN.filter(f => f > 0)` — the gaps between
filled times come from the **stride** (`slots.length / budgets.length`), not from the pattern's zeros. That
matters for the two-batch gap below: on a coarse grid the stride is barely above 1 and the board has no
run of empty times at all.

## R4 · What re-seeds a demo, and whether it re-reads the settings

`restartDemoService` (`/api/demo/restart`, authorised by the demo's own dashboard token) clears the
truck's orders, events, `slot_capacity` and `production_slot_usage`, re-provisions the event and calls
`seedDemoOrders` again. The dashboard's demo page posts to it on load.

**It re-reads everything.** `seedDemoOrders` takes no stored plan: it reads the van (`resolveIntervalsFor`,
`truck_vans.kitchen_capacity`) and the categories (`menu_items_db → menu_categories`) fresh on every call.
So a re-seed reproduces the same shape from the same settings, and the prospect's board survives a restart.
**No change was needed for B4** — but one hardening was made, because the reproduction depended on two call
sites agreeing about an argument neither really used for it:

```ts
/** The batch ORDERS_PER_SLOT was tuned against (four a batch, the demo default). …
 *  🔴 A CONSTANT, NOT `args.capacity`. Both callers pass DEMO_MAINS_BATCH today, so the two are equal — but
 *  a re-seed must reproduce a creation's board exactly, and that must not depend on two call sites
 *  continuing to agree about an argument neither of them is really using for this. */
const TUNED_BATCH = 4
```

---

# The controls

In `CreateDemoModal`, above the menu fields, introduced by **"Match the truck's kitchen so the demo looks
like theirs."**

| control | type | bounds | default |
|---|---|---|---|
| **Collection times** | select | 5 · 10 · 15 · 20 · 30 minutes (`INTERVAL_CHOICES`, the same five as the Collection times box everywhere else) | **5** |
| **Cook time** | number, minutes | **1 – 60** | **5** (`MAIN_PREP_SECS / 60`) |
| **Batch size** | number, items | **1 – 50** | **4** (`MAIN_BATCH_SIZE`) |

**Why those bounds.** One minute is the smallest meaningful batch; sixty is an hour, past which a
three-hour demo service could not show two batches back to back and there would be nothing to demonstrate.
A batch of one is a single-item grill; fifty is far past any real hatch and exists only so a typo of 500
is refused rather than seeding a board no operator would recognise.

**Validation is server-side as well**, in `lib/demo-kitchen.ts` → `parseDemoKitchen`, called by the route
before provisioning. A bad value is a **400 with its own sentence**, never a silent fall back to the
default:

| what | message |
|---|---|
| collection times off the five | `Collection times must be one of 5, 10, 15, 20, 30 minutes.` |
| cook time out of range, or not whole | `Cook time must be a whole number of minutes between 1 and 60.` |
| batch out of range, not whole, or not a number | `Batch size must be a whole number between 1 and 50.` |

**Absent and invalid are different answers**, and that distinction is the point of the module:

```ts
// 🔴 ABSENT AND INVALID ARE DIFFERENT ANSWERS, AND CONFLATING THEM IS THE FAILURE THIS GUARDS. A silently
// dropped "batch size 500" would build a demo at 4 and tell the admin nothing; an absent field must build
// today's demo.
```

All three absent → `{ kitchen: null }` → `provisionDemo` behaves exactly as before. **The landing-page
route `/api/demo` never sends them**, so the anonymous demo is untouched by this whole change.

## The defaults proof

Three assertions, all passing:

```
  ✓ no fields sent (the landing page) ⇒ parseDemoKitchen returns null, so provisioning is untouched
  ✓ the controls' own defaults are today's values: grid 5, prep 300s, batch 4
  ✓ and both read as "today's demo"
  ✓ at the defaults the seeded board is byte-for-byte 7346860's: 37 orders, same times, same items
```

The last one compiles `seedDemoOrders` from a clean worktree of `7346860` and compares the full plan —
every slot with its items — against the working tree's. Identical.

---

# What is written, and when

`applyDemoKitchen` in `lib/provision-demo.ts`, called **after the menu and before the event**, which is the
only ordering that works: the categories must hold their final numbers before `provisionDemoEvent` builds
the grid and `seedDemoOrders` reads them.

| write | statement |
|---|---|
| the van | `UPDATE truck_vans SET collection_interval_mins = <chosen>, operator_collection_interval_mins = NULL WHERE id = <van> AND truck_id = <demo>` |
| each cooking category | `UPDATE menu_categories SET prep_secs = <cook×60>, batch_size = <batch>, counts_toward_capacity = true WHERE id = <cat> AND truck_id = <demo>` |

The operator override goes to `NULL` so the dashboard's "Use different times for orders I add" box shows
**unticked**. "Each cooking category" means the ones already at `prep_secs > 0` — on a fresh truck exactly
the mains `buildDemoAssumptions` chose, on a rebuild the ones the previous build chose. The inference
itself is never re-run: which category is "mains" is a menu decision, not a settings one.

The numbers also ride **into** the menu commit (`buildDemoAssumptions(categories, items, kitchen)`), so a
fresh demo's categories are written once with their final values and there is no window in which they hold
5/4. `applyDemoKitchen` then rewrites the same values — idempotent, and it is what covers the rebuild path
where the menu is kept.

---

# The seeding rule

Two rules were added to `seedDemoOrders`, both stated in grid and batch rather than in times.

## 1. One batch per batch-window

```
// 🔴 ONE BATCH PER BATCH-WINDOW, NOT ONE PER SLOT (19 September 2026)
// The budget is a per-slot fraction of the batch, which is right only while a batch fits inside one grid
// step. With a cook time LONGER than the grid — 10-minute burgers on a 5-minute grid — two adjacent
// planned slots share the same oven window, so two slots each budgeted the full batch put twice the
// batch on the grill. The post-condition then shed most of them and the engine refused the rest: at
// 5-minute times, a 10-minute cook and a batch of 2, the seeded board came out with 35 of 37 times
// EMPTY. So planning now steps by `span = ceil(prep / grid)` slots — one batch per batch-window — and
// the budgets are counted against the slots that are actually plannable.
// ⚠️ `span` IS 1 WHENEVER THE COOK TIME FITS THE GRID, which includes every demo built before today
// (5-minute times, 5-minute cook) and the 15/15 shape. Those plan exactly as they did.
```

## 2. The two-batch gap

```
// THE RULE, in grid and batch rather than in times: a batch occupies `prep` minutes of oven, so an order
// of `2 × batch` needs `2 × prep` minutes clear before its collection time and nothing already cooking
// may overlap them. With `span = ceil(prep / grid)` grid steps to a batch, the seeder reserves a
// contiguous run of `3 × span + 1` slots and plans NOTHING into it. Call the slot `2 × span` into that
// run `T`:
//   • every earlier planned order collects at or before `T − 2×prep`, so its window has closed by T−2p;
//   • every later one collects at or after `T + span×grid ≥ T + prep`, so its window opens at or after T
//     (a planned slot never carries more than one batch — `allowanceFor` caps it at the batch — so no
//     later order reaches back further than one prep).
// `fitOrderBackward` therefore admits `2 × batch` at T …
//
// 🔴 RESERVED ONLY WHEN THE BOARD WOULD NOT OTHERWISE HAVE THE ROOM. Planning is run once with no run
// reserved and the ENGINE asked whether `2 × batch` fits anywhere; it usually does on a fine grid, where
// the stride already leaves whole batch-windows empty. Re-planning only when it does NOT is what keeps a
// demo built at the defaults byte-for-byte identical to one built before this existed — the run is a
// repair, not a redesign.
```

That conditional is also how the prompt's two requirements are both met without choosing between them:
B1 wants the defaults byte-identical, B3 wants the gap on every combination. The probe (`firstTwoBatchFit`,
which asks `fitOrderBackward` — the engine, not a rule of thumb) satisfies both, because the default board
already had the room.

---

# Rebuilding a demo

A demo cannot be un-created, so the way to change its kitchen is to build it again over the same truck.

- `ProspectMetaFacts` now renders **`Rebuild`** beside the demo link when `p.demo.truckId` is present.
  `truckId` was already in the route's payload; nothing was added to `/api/admin/outreach`.
- `CreateDemoModal` takes `demoTruckId`; when present it posts `existingTruckId`, the button reads
  **"Rebuild the demo"**, and a line says the link and the menu stay as they are. A menu is not required
  for a rebuild (it is for a new demo).
- `provisionDemo`'s `existingTruckId` path keeps the truck, the slug, the dashboard token and the menu, and
  re-provisions the event and the board with the new settings. One fix was needed there: that path called
  `touchDemoSession` and so returned `publicRef: null`, and the modal showed a result with no link as
  though the demo had lost one. It now reads the existing ref back.

---

# PROOF

## `scripts/demo-seed-parameters.cjs` (listed; the suite is now 56)

**Failure mode:** a demo whose board contradicts the kitchen it claims to model — orders at times the
pickers do not offer, a time over the batch, a board so full that the prospect's own two-batch order is
refused everywhere, or the over-capacity banner up before they have touched anything. And, above all, a
default demo that is no longer today's demo.

**Broken variants ran FIRST; all three FAILED as required:**

```
  ✓ FAILED as required  V1 grid ignored at 15/15/8: 13 times off the grid (15:05, 15:10, 15:20, 15:25)
  ✓ FAILED as required  V2 allowance uncapped: peak 16 in the oven against a batch of 8
  ✓ FAILED as required  V3 no reserved run: an order of 2 × batch fits at 0 of 13 times
```

**The real tree:**

```
── THE DEFAULTS REPRODUCE TODAY'S DEMO ──────────────────────────────────────────────────
  ✓ no fields sent (the landing page) ⇒ parseDemoKitchen returns null, so provisioning is untouched
  ✓ the controls' own defaults are today's values: grid 5, prep 300s, batch 4
  ✓ and both read as "today's demo"
  ✓ at the defaults the seeded board is byte-for-byte 7346860's: 37 orders, same times, same items

── THE MATRIX: 5 grids × 3 cook times × 3 batches ───────────────────────────────────────
  ✓ 45 combinations: every seeded order sits on its own grid (0 off-grid)
  ✓ no minute exceeds the batch in any combination (0 over)
  ✓ every board has full, part-full and empty times (0 without)
  ✓ every board names a time with two adjacent empty batch windows (0 without)
  ✓ an order of exactly the batch fits somewhere on every board (0 without)
  ✓ an order of 2 × the batch fits on every board (0 without)
  ✓ no board arrives over capacity — the banner would not show (0 over)

── THE TARGET SHAPE: 15-minute times, 15-minute cook, 8 a batch ─────────────────────────
     25 orders — mains per time: 15:00=0 15:15=8 15:30=4 15:45=0 16:00=8 16:15=2 16:30=6 16:45=0 17:00=0 17:15=0 17:30=0 17:45=0 18:00=1
     two-batch time reserved: 17:30 · 16 mains fit at: 17:00, 17:15, 17:30, 17:45
  ✓ an order of 16 is admitted at the reserved time 17:30
  ✓ every cooking order carries a reservation at batch 8 / prep 15

── SERVER-SIDE VALIDATION ───────────────────────────────────────────────────────────────
  ✓ collection times off the five choices → refused: "Collection times must be one of 5, 10, 15, 20, 30 minutes."
  ✓ cook time below the minimum → refused: "Cook time must be a whole number of minutes between 1 and 60."
  ✓ cook time above the maximum → refused: "Cook time must be a whole number of minutes between 1 and 60."
  ✓ cook time not a whole number → refused: "Cook time must be a whole number of minutes between 1 and 60."
  ✓ batch below the minimum → refused: "Batch size must be a whole number between 1 and 50."
  ✓ batch above the maximum → refused: "Batch size must be a whole number between 1 and 50."
  ✓ batch not a number → refused: "Batch size must be a whole number between 1 and 50."
  ✓ the bounds themselves are accepted (30 / 60 / 50)

✅ the board follows the three numbers, on every combination, and the defaults are today's demo
```

Every measurement is the **engine's** — `projectBackwardOccupancy` walked minute by minute for the peak,
`fitOrderBackward` for every "fits", `buildSlotIndicators` for every tone and label.

## `scripts/seed-demo-grid.cjs` — one assertion restated

It failed after the previous round was committed, on a tree with no seeder change: it asserted "HEAD wrote
no reservations; the fix writes one", which was true only while that fix was uncommitted. The durable
statement is that **both** sides write one for every cooking order. Same class of staleness as the
identity harness last round, and recorded in the same way rather than silently re-anchored.

---

# VERIFICATION — true exit codes

| command | exit |
|---|---|
| `node scripts/demo-seed-parameters.cjs` | **0** (23 assertions; V1–V3 failed first) |
| `node scripts/run-harnesses.cjs` | **0** — 56 run · 56 passed · 0 failed |
| `npx tsc --noEmit` | **0** |
| `npx next build` | **0** |

**Goldens — unchanged, byte for byte. No generator was run.**

| golden | sha256 |
|---|---|
| `scripts/fixtures/batch-rolling-golden.json` | `8bdae817748ad334bdac297592f19a58550fd17bc5ce7424331d73df82f32660` |
| `scripts/fixtures/batch-reservation-golden-on.json` | `e3f0a88099fd797c659da57881febc378e928dbc7bc8283a6931c814d6b29222` |

## eslint, per rule, against a clean HEAD worktree (`7346860`)

The two new files have no HEAD counterpart, so the delta is over the seven existing ones.

| rule | HEAD | working tree | delta |
|---|---|---|---|
| `@next/next/no-img-element` (warn) | 1 | 1 | 0 |
| `@typescript-eslint/no-explicit-any` (error) | 7 | 7 | 0 |
| `@typescript-eslint/no-require-imports` (error) | 4 | 4 | 0 |
| `react-hooks/immutability` (error) | 1 | 1 | 0 |
| `react-hooks/set-state-in-effect` (error) | 8 | 8 | 0 |

**Zero delta, every rule.** `lib/demo-kitchen.ts` lints clean; `scripts/demo-seed-parameters.cjs` reports
4 `@typescript-eslint/no-require-imports`, the house pattern for `.cjs` harnesses.

---

# The board a prospect sees at 15 / 15 / 8

Rendered through `buildSlotIndicators` — the code that draws the dashboard strip and the Add Order list —
over a seeded 15:00–18:00 service:

```
  15:00  🟢            15:15  🔴  8 Mains     15:30  🟡  4 Mains     15:45  🟢
  16:00  🔴  8 Mains   16:15  🟡  2 Mains     16:30  🟡  6 Mains     16:45  🟢
  17:00  🟢            17:15  🟢             17:30  🟢             17:45  🟢
  18:00  🟡  1 Mains
```

- **Two times are full and red** — a whole batch of 8 cooking in the quarter-hour before each. Three are
  amber with a part batch. The rest are green and free, and the over-capacity banner does not appear.
- **A four-item order** is offered at ten of the thirteen times; it is crossed at the two red ones and at
  16:30, where six of eight are already going.
- **A full batch of eight** is offered at seven times, and crossed at every part-loaded one — a part batch
  plus a full batch is more than the grill holds.
- **Sixteen items, two batches**, is offered at **17:00, 17:15, 17:30 and 17:45** — the reserved run — and
  crossed everywhere else. 17:30 is the time the seeder reserved for exactly that.

---

# LOCALHOST CHECK for Dominic

1. `npm run dev`, sign in as an admin, open the outreach console.
2. Pick a test prospect and press **Create demo**. The modal now opens with a grey box at the top reading
   "Match the truck's kitchen so the demo looks like theirs." and three fields: Collection times (Every 5
   minutes), Cook time (5), Batch size (4).
3. Set **Collection times → Every 15 minutes**, **Cook time → 15**, **Batch size → 8**. Add a menu photo,
   paste a menu, or press "Use the sample pizza menu".
4. **Build the demo.** Open the dashboard link it returns. *Expect:* the capacity strip on quarter-hour
   times only; two red times reading "8 …", a few amber, several green; no over-capacity banner.
5. **Add Order → add 16 of a main.** *Expect:* the dropdown offers the reserved stretch (around two thirds
   through the service) and crosses everything else with "Not enough time". Place it there and watch it
   land; the strip turns that stretch red.
6. **Settings tab.** *Expect:* Collection times reads "Every 15 minutes" and "Use different times for
   orders I add" is **unticked**. Menu & Stock shows the cooking category at 15 minutes, 8 a batch.
7. **Change your mind.** Back in the prospect modal the demo link now has a **Rebuild** button beside it.
   Press it, set different numbers, **Rebuild the demo** — same link, same menu, a fresh board on the new
   kitchen.
8. **A bad value is refused, not ignored.** Type a batch of 500 and build: the modal shows
   *"Batch size must be a whole number between 1 and 50."* and nothing is created.
9. **The landing page is unchanged.** Build a demo from the public landing page: no kitchen questions, and
   the board is the 5-minute, 5-minute, 4-a-batch one it has always been.

---

# Anything I could not establish

- **I did not create a demo.** `/api/admin/provision-demo` is gated by `verifyAdmin`, which needs an
  admin Supabase session; from here it answers `HTTP 401 {"error":"Unauthorised"}`, confirmed against the
  running dev server. Minting a session needs the service-role key, and that step was refused by the
  permission classifier in an earlier round — I did not work around it. So §"Create one demo on a test
  prospect at 15/15/8, verify it read-only" is the LOCALHOST CHECK above rather than something I ran.
  Everything it would have verified — the grid, the reservations at batch 8 / prep 15, no minute over 8,
  the board's shape — is asserted by the harness against the real seeder and the real engine at exactly
  those settings, and printed above.
- **Nothing to remove afterwards.** Since no demo was created there is nothing to clean up. For the demo
  you create by hand: the demo-cleanup cron removes a demo truck once its `demo_sessions.expires_at`
  passes; to retire one sooner, set `demo_sessions.retired_at`, or simply leave it — a demo truck is
  `demo-` prefixed and is excluded from every real-truck surface by `isDemoIdentifier`.
- **I did not touch Between Buns Royston.** It is a demo truck, but not one this task created, and this
  task's LIVE-TRUCK RULE narrows testing to test-truck and demos this task creates. Its settings are
  already 15 / 15 / 8 from the previous round, so it is the obvious thing to restart to see the new
  planner against real rows — say the word and I will.

---

# git status — after

**0 staged · 8 modified · 2 untracked.**

```
 M app/api/admin/provision-demo/route.ts   parse + validate the three fields, 400 on a bad one
 M components/admin/CreateDemoModal.tsx    the three controls, the intro line, rebuild mode
 M components/admin/OutreachPanel.tsx      the Rebuild button; demoTruckId handed to the modal
 M lib/demo-assumptions.ts                 buildDemoAssumptions takes the kitchen numbers
 M lib/provision-demo.ts                   ProvisionDemoInput.kitchen, applyDemoKitchen, a rebuild returns its link
 M lib/seed-demo-orders.ts                 one batch per batch-window; the two-batch gap; TUNED_BATCH
 M scripts/harnesses.json                  + demo-seed-parameters.cjs (56)
 M scripts/seed-demo-grid.cjs              one assertion restated after HEAD moved
?? lib/demo-kitchen.ts                     bounds, defaults, parseDemoKitchen, the three messages
?? scripts/demo-seed-parameters.cjs        the harness
```

Plus `docs/demo-seed-parameters-report.md`, this report.

Nothing was staged, committed, stashed, reset or restored. The temporary HEAD worktree used for the lint
delta was removed. **No truck row, no `outreach_templates` row and no demo was written to by this task.**
