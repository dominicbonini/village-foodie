# 12:15 bookable while reading 8 of 8, and ASAP disagreeing — one cause, three symptoms

**Date:** 19 September 2026 · Read-only investigation · Localhost only · **No source file was changed.**
Nothing staged, committed, stashed, reset or restored; `git add -A` / `git add .` were not run. The only new
file is this report.

**Why I stopped before the fix.** The brief says *"Aligned setups … stay byte-identical, and both goldens pass
without regeneration. If a golden differs, STOP and report."* The fix named in §6 changes the dot's **tone** and
`/api/slots`' **`available`** on misaligned boards — which is the whole point, since that is what pushes ASAP
past a bookable time — and the `aligned240` golden family contains exactly those shapes. So the fix is specified
and its blast radius measured, and applying it is one word from you.

**Nothing arrived garbled.** Your §7 message is answered in §7 and turned out to be the answer.

**The headline: nothing is overbooked. The per-time fit is right, ASAP is wrong, and the label is lying.**

---

## STEP 0 — `git status`

**Before and after are identical: 37 modified, 102 untracked, 0 staged (139 entries).** Full grouped listing in
§11. Goldens read, not written: `batch-rolling-golden.json` `8bdae817748ad334…`,
`batch-reservation-golden-on.json` `de2596323d7a218c…`. The full sweep still passes (51 of 51). Every probe was a
temporary file under `scripts/`, run by name and deleted; `scripts/` was never globbed and no generator was run.
Database access was **read-only PostgREST GETs on test-truck** (§1).

---

## 1. The board (read-only SQL)

```sql
SELECT truck_events.id, truck_events.event_date, truck_events.start_time, truck_events.end_time,
       truck_events.status, truck_events.van_id, truck_events.collection_interval_mins_override
  FROM truck_events WHERE truck_events.truck_id = 'test-truck' AND truck_events.venue_name ILIKE '%Bures%';
-- 252aae9f-… · 2026-09-18 · 10:00–22:00 · open · Van1 · customer interval 15
SELECT menu_categories.name, menu_categories.prep_secs, menu_categories.batch_size, menu_categories.counts_toward_capacity
  FROM menu_categories WHERE menu_categories.truck_id = 'test-truck' AND menu_categories.is_active;
-- Pizza · 900 · 8 · true    (Drinks, Desserts: prep 0, batch 0, not counted)
SELECT truck_vans.kitchen_capacity, truck_vans.capacity_window_mins FROM truck_vans WHERE truck_vans.id = '8e38901e-…';
-- kitchen_capacity NULL · capacity_window_mins 10
SELECT orders.id, orders.slot, orders.status, orders.items, orders.cooking_reservation
  FROM orders WHERE orders.truck_id = 'test-truck' AND orders.event_id = '252aae9f-…' ORDER BY orders.slot;
```

| # | slot | status | items | `cooking_reservation` (batch / prep it was recorded under) |
|---|---|---|---|---|
| 6 | 10:40 | confirmed | 3 | **2 / 5** → 10:30–10:35:1, 10:35–10:40:2 |
| 1 | 10:45 | **cancelled** | 8 | 4 / 15 |
| 2 | 11:00 | confirmed | 8 | **4 / 15** → 10:30–10:45:4, 10:45–11:00:4 |
| 7 | 11:10 | confirmed | 4 | **2 / 5** → 11:00–11:05:2, 11:05–11:10:2 |
| 5 | 11:15 | confirmed | 2 | **4 / 15** → 11:00–11:15:2 |
| 3 | 11:30 | confirmed | 6 | **4 / 15** → 11:00–11:15:2, 11:15–11:30:4 |
| 8 | 11:45 | confirmed | 8 | **4 / 7** → 11:31–11:38:4, 11:38–11:45:4 |
| 4 | 11:45 | **cancelled** | 3 | 4 / 15 |
| 9 | 12:00 | confirmed | 5 | **4 / 7** → 11:46–11:53:1, 11:53–12:00:4 |
| 12 | 12:05 | confirmed | 3 | **2 / 5** → 11:55–12:00:1, 12:00–12:05:2 |
| 11 | 12:15 | confirmed | 1 | **4 / 7** → 12:08–12:15:1 |
| 13 | 12:15 | confirmed | 2 | 8 / 15 → 12:00–12:15:2 *(placed after the screenshot)* |
| 10 | 12:30 | confirmed | 6 | **4 / 7** → 12:16–12:23:2, 12:23–12:30:4 |
| 14, 15 | 12:45, 13:00 | confirmed | 8, 5 | 8 / 15 *(placed after the screenshot)* |

**The board as Dominic saw it** = the occupying orders without #13, #14, #15:
`10:40:3 · 11:00:8 · 11:10:4 · 11:15:2 · 11:30:6 · 11:45:8 · 12:00:5 · 12:05:3 · 12:15:1 · 12:30:6`.
`production_slot_usage` matches order for order. **Reproduced as a fixture through the real engine (§10), and
it renders his five lines exactly**, including 12:15 red and uncrossed.

### The cooking intervals the engine actually holds
```
11:15–11:30  4      11:30–11:45  8      11:45–12:00  5
11:50–12:05  3      12:00–12:15  1      12:15–12:30  6
```

### Minute-by-minute pizza load, 11:15 → 13:00 (changes only; batch 8)
| from | on the grill |
|---|---|
| 11:15 | 6 |
| 11:30 | **8** |
| 11:45 | 5 |
| 11:50 | **8** |
| 12:00 | **4** |
| 12:05 | **1** |
| 12:15 | 6 |
| 12:30 | 0 |

**At no minute does the load exceed 8.** Nothing on this board is overbooked.

## 2. Per listed time, for the 2-pizza order

| time | (a) the span the LABEL summed, and what it counted | (b) the COLOUR's peak | (c) `reserveBatches` for 2 pizzas | (d) crossed |
|---|---|---|---|---|
| **11:45** | `[11:30, 11:45)` — `11:30–11:45:8`. **Raw total 8**, no batch counted twice | 8 | `11:30–11:45` existing **8**, free **0** → **refused** | ✕ yes |
| **12:00** | `[11:45, 12:00)` — `11:45–12:00:5` + `11:50–12:05:3`. **Raw total 8** | 8 | `11:45–12:00` existing **8**, free **0** → **refused** | ✕ yes |
| **12:15** | `[12:00, 12:15)` — `11:50–12:05:3` + `12:00–12:15:1`. **Raw total 4** | **4** | `12:00–12:15` existing **4**, free **4**, share 2 → **accepted** | **no** |
| **12:30** | `[12:15, 12:30)` — `12:15–12:30:6`. **Raw total 6** | 6 | `12:15–12:30` existing 6, free 2 → accepted | no |
| **12:45** | `[12:30, 12:45)` — nothing. **Raw total 0** | 0 | `12:30–12:45` existing 0, free 8 → accepted | no |

**No batch is counted twice anywhere.** The 12:15 row is the whole bug: its stretch holds **4**, and the label
said **8**.

## 7. THE FLOOR — your question, answered: yes, it is the cause

`docs/time-list-span-totals-and-cross-report.md` §1 floors the span total at the tone's own number,
`batch − remainingByCat[cat]`, so a red dot can never read below what made it red. On this board:

| time | raw span total | the tone's number | SHOWN | which won |
|---|---|---|---|---|
| 11:45 | 8 | 8 | **8** | the total |
| 12:00 | 8 | 8 | **8** | the total |
| **12:15** | **4** | **8** | **8** | **🔴 THE FLOOR — the label is 4 higher than the truth** |
| 12:30 | 6 | 6 | **6** | the total |
| 12:45 | 0 | 0 | — | the total |

**Where the tone's 8 comes from, and why it is the wrong window.** On a 15-minute grid the dot's window is
`coverDotWindows`, which returns

```ts
  return { ...peakW, tone: worst.tone, bound_by: …, peak: covered.length > 1 }
```

— **the peak covered window's own record**. For 12:15 the covered windows start in `(11:45, 12:00]`, and the
peak one is **`@11:50`**, whose own fifteen minutes `[11:50, 12:05)` really do hold 8 (`coverRem = {pizza: 0}`).
The dot then floors its label at that window's fullness. But `[11:50, 12:05)` is **not the stretch the dot stands
for** — it begins ten minutes before it and ends ten minutes before the dot's time.

**So yes: the floor is why 12:00 and 12:15 both read "8 Pizzas" when their true loads are 8 and 4, and yes, it is
masking the real free space at 12:15 — four of the eight.**

## 3. The ASAP trace — and it is the SAME cause

`earliestBackwardFitSlot` (lib/slot-availability.ts) is not a second opinion; it is the same call in a loop:

```ts
  for (const t of sorted) {
    const m = parseMins(t.collection_time)
    if (m < fromMins) continue
    if (fitOrderBackward(back, m, orderByCat, catConfigs, kitchenCapacity, eventStartMins,
                         capacityWindowMins, nowMins, productionSlotUnits[t.collection_time] || {},
                         batchReservations).fits) return t.collection_time
  }
```

**Every difference between the two call sites in `AddOrderPanel`, checked one by one:**

| | the per-time list (`manualFitWhy`) | ASAP (`earliestBackwardFitSlot`) |
|---|---|---|
| load read | `capacityInputs` + `capacityInputs.reservations` | **the same** |
| switch | `capacityInputs.batchReservations === true` | **the same** |
| kitchen cap, event start, capacity window | `capacityInputs.*` | **the same** |
| now-clamp | `manualEvent?.event_date === getLocalDateInTz(eventTz) ? getNowMinsInTz(eventTz) : −∞` | **byte-identical expression** |
| pre-open floor / lead | inside `fitOrderBackward` | **the same function** |
| rounding | none | none |
| **where the search starts** | every listed slot | **`fromMins` = `manualAsapSlot`** |

**That last row is the whole difference.** `manualAsapSlot = getAsapSlot(manualSlots, …)`, which returns

```ts
  return slots.find(s => !isSlotPast(s, tz, eventDate) && s.available && !s.is_grace) || null
```

— the first slot whose **server `available`** is true. And on this board `/api/slots` says:

```
11:30 available=true  tone=amber
11:45 available=false tone=red
12:00 available=false tone=red
12:15 available=false tone=red     ← the cover again
12:30 available=true  tone=amber
```

`available` is the no-basket window tone, which at 12:15 is red **for the same `coverDotWindows` reason as the
label**. So `getAsapSlot` skips 12:15, ASAP's search starts at 12:30, and **12:15 is never tested**. ASAP did not
disagree about capacity; it was never allowed to look.

## 4. Your questions, answered directly

- **Is the label at 12:00 and 12:15 truthful — are 8 really cooking in each?** 12:00, **yes**: `11:45–12:00:5` and
  `11:50–12:05:3` overlap, and the minute table shows 8 from 11:50. 12:15, **no**: its stretch `[12:00, 12:15)`
  holds **4**, and the minute table shows 4 from 12:00 falling to 1 at 12:05. **No batch is counted in both** —
  the raw totals are 8 and 4; the 8 at 12:15 comes entirely from the floor.
- **If both spans were full, why does the fit accept 2 at 12:15?** They are not both full. `reserveBatches`
  computes `existing = categoryLoadOver(intervals, 'pizza', 12:00, 12:15)` = **4**, `free = 8 − 4 = 4`, and places
  `share: 2` in `12:00–12:15`. The window it chose held 4 of 8.
- **Did it place them in a window already at 8?** **No. There is no overbooking bug.** After the placement that
  window holds 6, and the minute-by-minute load peaks at 6 there — the table above is the proof.
- **Which is correct, ASAP or the per-time fit?** **The per-time fit.** 12:15 is genuinely bookable; the minute
  load 11:15→13:00 never exceeds 8 before or after the placement. **ASAP is wrong on this board**, and so is the
  dot: both are downstream of the same cover read.

## 5. Reservations recorded under earlier settings

Every reservation on the board Dominic saw was recorded under a **previous** configuration — batch 2 / prep 5,
batch 4 / prep 15, batch 4 / prep 7 — while Pizza is now **batch 8 / prep 15**. `validReservationsAt` requires

```ts
    if (c.batch !== batch || c.prepMins !== prepMins) continue
```

so **every one of them is discarded** and the engine re-seats each order from its slot total. Verified per slot:
10:40, 11:00, 11:10, 11:15, 11:30, 11:45, 12:00, 12:05, 12:15(#11), 12:30 → all **DISCARDED ⇒ re-seated fresh**.

They do, however, leave their mark: the orders themselves sit at **off-grid collection times** (10:40, 11:10,
12:05) from when the interval was 5 or 10 minutes. Re-seated at prep 15 those produce cooking intervals at
non-grid offsets — **`11:50–12:05`** is the one that matters. That interval is what makes 12:15's cover straddle
the boundary and pick `@11:50`. So the stale settings are not read, but the off-grid *times* they left behind are
what expose the cover bug.

## 6. The cause, and the fix by symbol

**`coverDotWindows` (lib/slot-availability.ts) returns another window's record as the dot's own.** On a grid
wider than the prep it answers `{ ...peakW, tone: worst.tone }`, so `byCat`, `remainingByCat` and `bound_by`
describe the peak covered window's own prep-length span — `[11:50, 12:05)` — rather than the stretch the dot
stands for, `[12:00, 12:15)`. One fact, three symptoms:

1. **the label** — the floor reads `batch − remainingByCat` from that window and shows **8** where 4 cook;
2. **the colour** — `tone: worst.tone` reds the dot from a window that is not this dot's stretch;
3. **ASAP** — `/api/slots`' `available` is that tone, so `getAsapSlot` skips 12:15 and ASAP starts at 12:30.

**The fix: a covered dot must report its OWN stretch.** `coverDotWindows` should return a window whose
`byCat`, `remainingByCat`, `total` and `tone` are computed over `[prevSlotMins, slotMins)` — the same span the
label already sums and the same one `reserveBatches` judges — instead of copying `peakW`. With that, on this
board: 12:15 reads **`🟡 4 Pizzas`**, uncrossed; `available` becomes true; `getAsapSlot` lands on 12:15; and ASAP
equals the earliest time the per-time fit accepts. **The floor then has nothing left to do and should go**, as
your §7 asks — the label becomes the honest span total everywhere.

**Why I did not apply it:** it changes tone and `available` on every misaligned board, which is what the
`aligned240` golden family is made of. Grid == prep is unaffected (no dot covers two windows there), so Gusto's
5-on-5 and the 15-on-15 sweep are safe — but `aligned240` will move, and your brief says to stop rather than
regenerate on my own judgement. It also already carries a recorded label delta from the previous task, which I
would rather resolve at the same time (see that report's §6).

**The four invariants, once it is in** — each to be proved over ≥ 2,000 fixture states:
1. ASAP equals the earliest listed time at which the per-time fit accepts the order;
2. a red dot whose count equals the batch is never bookable;
3. a bookable time never reads as full;
4. no admission exceeds the batch or the kitchen cap at any instant.
On this board after the fix: 12:15 reads 4 of 8 (not full) and is bookable ✓; 11:45 and 12:00 read 8 of 8 and are
refused ✓; the minute load never passes 8 ✓; ASAP = 12:15 = the first accepting time ✓.

## 8. Localhost check — test-truck, reproducing his board

Open the 18 September "Bures Music Festival" event (10:00–22:00, live), Pizza **batch 8 / prep 15**, collection
times **every 15 minutes**, and put **2 Campagnola** in the basket. Today you will see:

```
ASAP — 12:30
✕ 11:45 🔴 8 Pizzas     ← true: 8 cook in [11:30,11:45)
✕ 12:00 🔴 8 Pizzas     ← true: 5 + 3 overlap from 11:50
  12:15 🔴 8 Pizzas     ← FALSE: only 4 cook in [12:00,12:15); 4 are free, which is why it takes the order
  12:30 🟡 6 Pizzas
  12:45 🟢
```

Tap **12:15** and Confirm — it is accepted, and correctly so: the kitchen holds 4 there and 6 after. After the
fix the same board reads `12:15 🟡 4 Pizzas`, uncrossed, and **ASAP — 12:15**.

## 9. Anything I could not establish

- **The exact minute Dominic was looking**, so ASAP's now-clamp is not in the reproduction. It makes no
  difference to the finding: both call sites compute the clamp with byte-identical expressions, and the skip is
  caused by `fromMins`, not by the clamp.
- **Whether `available` should be basket-aware at all.** `getAsapSlot` filters on the no-basket tone, so ASAP
  inherits every display quirk of that tone. Even with the cover fixed, a red-but-bookable dot (red by the batch
  while a one-item order still fits) would make ASAP skip a time the list accepts. Making ASAP walk every listed
  time and rely on `fitOrderBackward` alone would close that class for good; it is a second, smaller change and
  I did not want to fold it in unasked.
- **The precise golden delta of the fix.** I could not measure it cleanly because `aligned240`'s comparison
  already runs through the recorded label allowance from the previous task; a clean number needs that resolved
  first, which is the same decision as regenerating it.

## 11. Every modified and untracked path (139 entries, 0 staged), grouped — unchanged this turn

### COLLECTION TIMES + CAPACITY + ADD ORDER + RESERVATIONS
`M app/api/dashboard/action/route.ts` · `M app/api/dashboard/route.ts` · `M app/api/events/route.ts` · `M app/api/manage/route.ts` · `M app/api/menu/[truckId]/route.ts` · `M app/api/orders/submit/route.ts` · `M app/api/slots/[truckId]/route.ts` · `M app/dashboard/[token]/page.tsx` · `M app/manage/[token]/page.tsx` · `M app/trucks/[slug]/order/page.tsx` · `M components/dashboard/AddOrderPanel.tsx` · `M components/dashboard/CapacityBreachBanner.tsx` · `M lib/capacity-breach.ts` · `M lib/features.ts` · `M lib/orders/place-in-slot.ts` · `M lib/payments/promote-draft.ts` · `M lib/slot-availability.ts` · `M lib/slot-bookings.ts` · `M lib/slot-display.ts` · `M lib/slot-generation.ts` · `M lib/supabase.ts` · `? lib/capacity-refresh.ts` · `? lib/orders/cooking-reservation.ts` · `? lib/slot-fit-message.ts` · `? lib/slot-interval.ts`

### WIRED PRINTING (app, native, plugin)
`M android/app/capacitor.build.gradle` · `M android/capacitor.settings.gradle` · `M components/printing/PrintingSettings.tsx` · `M ios/App/App/Info.plist` · `M ios/App/CapApp-SPM/Package.swift` · `M lib/printing/bleTransport.ts` · `M lib/printing/transport.ts` · `M lib/printing/usePrinting.ts` · `M package-lock.json` · `M package.json` · `? app/api/printing/route.ts` · `? components/printing/PrinterTypeChoice.tsx` · `? lib/printing/netAddress.ts` · `? lib/printing/netTransport.ts` · `? lib/printing/networkGuard.ts` · `? lib/printing/testTicket.ts` · `? plugins/hatchgrab-net-printer/{…}` — ⚠️ plus 34 untracked, **not ignored** build files under `plugins/hatchgrab-net-printer/android/build/…` and `…/.swiftpm/xcode/xcuserdata/…`; a `.gitignore` entry remains proposed, not done.

### HOLD (landing, plan-features, store listing copy)
`M app/landing/page.tsx` · `M content/store-listing.md` · `M lib/plan-features.ts`

### MIGRATIONS (all five APPLIED by hand; the files are untracked)
`? supabase/migrations/20260916_collection_intervals.sql` · `? …/20260917_van_collection_intervals.sql` · `? …/20260918_event_collection_intervals.sql` · `? …/20260919_van_network_printer.sql` · `? …/20260920_orders_cooking_reservation.sql`

### INCIDENT SAFEGUARDS
`M scripts/migrate-from-sheets.cjs` · `M scripts/register-payment-domain.cjs` · `? scripts/harnesses.json` (51 listed) · `? scripts/run-harnesses.cjs` · `? scripts/ops-write-guard.cjs`

### HARNESSES + FIXTURES
`M scripts/whatsapp-golive-parity-harness.cjs` · `? scripts/_batch-reservation-golden-on-generate.cjs` · `? scripts/_batch-reservation-sim.cjs` · `? scripts/_batch-rolling-golden-generate.cjs` · `? scripts/_batch-rolling-snapshot.cjs` · `? scripts/_mini-dom.cjs` · `? scripts/_printing-mocks.cjs` · `? scripts/_slot-interval-compile.cjs` · `? scripts/add-order-fit-message.cjs` · `? scripts/add-order-refresh.cjs` · `? scripts/add-order-refresh-inputs.cjs` · `? scripts/add-order-render.cjs` · `? scripts/batch-reservation-display-equals-picker.cjs` · `? scripts/batch-reservation-edit-lock.cjs` · `? scripts/batch-reservation-golden-on.cjs` · `? scripts/batch-reservation-helper.cjs` · `? scripts/batch-reservation-immutability.cjs` · `? scripts/batch-reservation-instants.cjs` · `? scripts/batch-reservation-lock.cjs` · `? scripts/batch-reservation-p2-identity.cjs` · `? scripts/batch-reservation-p3-worked-case.cjs` · `? scripts/batch-reservation-switch.cjs` · `? scripts/batch-reservation-writers.cjs` · `? scripts/batch-rolling-check.cjs` · `? scripts/batch-rolling-identity.cjs` · `? scripts/collection-times-hint.cjs` · `? scripts/customer-path-identity.cjs` · `? scripts/dev-virtual-printer.cjs` · `? scripts/dot-overlap-labels.cjs` · `? scripts/fixtures/{batch-rolling-golden.json, batch-reservation-golden-on.json, batch-rolling-fix.patch}` · `? scripts/peak-ceiling-rule.cjs` · `? scripts/peak-load-rule.cjs` · `? scripts/printing-*.cjs` (7) · `? scripts/sixteen-pizza-admission.cjs` · `? scripts/slot-interval-dots.cjs` · `? scripts/slot-interval-engine-identity.cjs` · `? scripts/slot-interval-event-override.cjs` · `? scripts/slot-interval-generator.cjs` · `? scripts/slot-interval-grid-routing.cjs` · `? scripts/slot-interval-settings.cjs` · `? scripts/slot-interval-van-list-tolerance.cjs` · `? scripts/slot-interval-van-resolution.cjs`

### DOCS
36 existing reports, plus **`? docs/full-batch-bookable-bug-report.md`** (this file — the only addition).

### ANYTHING ELSE
Nothing. Two stale detached worktrees under `/private/var/folders/…/slot-head-dots-*` from an earlier run remain
in `git worktree list`; they are outside the working tree and untouched.
