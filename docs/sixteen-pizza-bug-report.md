# 16 pizzas accepted at 20:30 with no warning, then flagged over capacity

**Date:** 19 September 2026 · Localhost only; nothing deployed, nothing committed, nothing staged.
**Files changed:** `lib/slot-bookings.ts` (new `readUnitsWithoutOrder`; `buildUnitsFromOrders` byte-identical),
`lib/orders/cooking-reservation.ts` (`admitForManual` reads the board without the order),
`components/dashboard/CapacityBreachBanner.tsx` (the headline names the real limit); **new**
`scripts/sixteen-pizza-admission.cjs`; `scripts/harnesses.json` (48 listed).
**Scripts run:** `node scripts/run-harnesses.cjs` and the harnesses named here, individually. `scripts/` was never
globbed; no golden generator was run. Test-truck only; no live truck's token, device id, page, route or API was
touched; every database access was a read-only select shown below.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

---

## STEP 0 — `git status`

**Before:** branch `main`, up to date with `origin/main`, **37 modified, 86 untracked, 0 staged** (123 entries) —
the "after" listing in §9 without `scripts/sixteen-pizza-admission.cjs` and this report.
**After:** **37 modified, 87 untracked, 0 staged** (124 entries); full grouped listing in §9. `git add -A` /
`git add .` were not run; nothing staged, committed, stashed, reset or restored.

---

## 1. Order #9 and its neighbours (read-only SQL)

```sql
select truck_events.id, truck_events.event_date, truck_events.start_time, truck_events.end_time, truck_events.status,
       truck_events.van_id, truck_events.collection_interval_mins_override, truck_events.operator_collection_interval_mins_override
from public.truck_events
where truck_events.truck_id = 'test-truck' and truck_events.venue_name ilike '%Rolling%';
-- 7a98c341-85b3-43ab-856f-073a9ffe982b · 2026-09-17 · 17:00–21:00 · open · van 8e38901e-… · customer override 5 · operator override NULL

select truck_vans.id, truck_vans.collection_interval_mins, truck_vans.operator_collection_interval_mins,
       truck_vans.kitchen_capacity, truck_vans.capacity_window_mins
from public.truck_vans where truck_vans.id = '8e38901e-113f-42fc-ac60-11cf1360212b';
-- Van1 · customer 15 · operator NULL · kitchen_capacity NULL · capacity_window_mins 10

select menu_categories.name, menu_categories.prep_secs, menu_categories.batch_size, menu_categories.counts_toward_capacity
from public.menu_categories where menu_categories.truck_id = 'test-truck' and menu_categories.is_active;
-- Pizza 900 s / 8 / true · Desserts 0 / 0 / false

select orders.id, orders.slot, orders.requested_slot, orders.status, orders.source, orders.items,
       orders.cooking_reservation, orders.event_id, orders.created_at
from public.orders
where orders.truck_id = 'test-truck' and orders.event_id = '7a98c341-85b3-43ab-856f-073a9ffe982b'
order by orders.id;
```

| # | slot | requested | status | source | items | cooking_reservation |
|---|---|---|---|---|---|---|
| 3 | 18:15 | 18:15 | pending | web | 8× Margherita | null |
| 4 | 18:30 | null | ready | manual | 8× Margherita | null |
| 5 | 19:00 | 19:00 | confirmed | web | 8× Margherita | null |
| 6 | 19:15 | 19:05 | pending | web | 8× Margherita | null |
| 7 | 17:15 | null | confirmed | web | 9× Buscaiola | null |
| 8 | 17:30 | 17:30 | collected | web | 7× Buscaiola | `fit`, pizza 7, one window 17:15–17:30: 7 |
| **9** | **20:30** | null | confirmed | **manual** | **16× Buscaiola** | **`source: 'override'`, slot 20:30, pizza: items 16, batch 8, prep 15, ONE window 20:15–20:30 holding 16** |

(#9 was created 18:52:53 UTC; #3–#7 carry no reservation because they predate the switch, as P3 intended.)

```sql
select production_slot_usage.production_slot, production_slot_usage.units_by_cat
from public.production_slot_usage
where production_slot_usage.truck_id = 'test-truck' and production_slot_usage.event_id = '7a98c341-85b3-43ab-856f-073a9ffe982b'
order by production_slot_usage.production_slot;
-- 17:15 {pizza 9} · 18:15 {pizza 8} · 19:00 {pizza 8} · 19:15 {pizza 8} · 20:30 {pizza 16}      (#4 is 'ready', #8 'collected' — neither occupies)
```

**So #9's reservation is one window, 20:15–20:30, with all 16 in it, `source: 'override'`** — the exact shape
`buildAdmittedReservation` writes when `reserveBatches` refuses and the whole shortfall goes into the nearest
window.

## 2. "Placed anyway" — every path, and which one ran

The wording has one site, `CapacityBreachBanner`:
```tsx
{`Placed anyway: ${placedAnyway.map(o => `#${o.id} for ${o.slot}`).join(', ')}`}
```
fed by `detectCapacityBreaches`' `override_orders` — reservations whose `source === 'override'` overlap the
breached window. An order is marked an override in exactly two places:

1. `buildAdmittedReservation` (lib/slot-availability.ts): `source: fits ? 'fit' : 'override'` — **decided by the
   admission's own verdict, never by a button**;
2. `writeCookingReservation`'s P2 path: `source: order.capacity_ack_at ? 'override' : 'fit'` — OFF only.

The manual path: `if (resolveBatchReservations(truck) && slot) { rec = await admitForManual(…); await
writeReservationRecord(…) }`. `manualOrder.override` (the "Place it anyway" flag) gates only the **stock**
check (`if (orderEventId && !override)`) — it never reaches the reservation. **#9 took path 1: `admitForManual`
→ `buildAdmittedReservation` returned `fits: false`, so the record was stamped `override` although Dominic pressed
nothing.** The banner then faithfully reported an override that the engine, not the operator, had declared.

## 3. The admission, reconstructed through the real engine (switch ON)

`scratchpad/recon16.cjs`, compiled `lib/slot-availability.ts`, catConfigs pizza 900 s/8, event start 17:00,
kc null, capacity window 10, 16 pizzas at 20:30:

```
A · the board WITHOUT #9  (18:15 8, 19:00 8, 19:15 8, 17:15 9)
   reserveBatches: fits=true  windows 20:15–20:30 existing 0 free 8 share 8 | 20:00–20:15 existing 0 free 8 share 8
   fitOrderBackward: fits=true tone=amber bound_by="Pizza 8/8" why=[]
   buildAdmittedReservation: fits=true source=fit windows 20:00–20:15:8 20:15–20:30:8

B · the board WITH #9's own 16 already stored at 20:30 (no reservation for it yet)
   reserveBatches: fits=false reason=batch  windows 20:15–20:30 existing 8 free 0 | 20:00–20:15 existing 8 free 0
   fitOrderBackward: fits=false tone=red bound_by="Pizza 24/8"
      why=[{ kind:'batch', cat:'pizza', windows:[{20:00–20:15 existing 8 free 0},{20:15–20:30 existing 8 free 0}] }]
   buildAdmittedReservation: fits=false source=override windows 20:15–20:30:16        ← #9's stored record, exactly
```

- `reserveBatches` uses **ceil(16/8) = 2** windows, 20:00–20:15 and 20:15–20:30, as expected.
- On the true board (A) it **fits**, as two full batches. Both batches were empty.
- On board B the test that failed is `free = B − existing` with `existing = categoryLoadOver(intervals, 'pizza',
  ws, ws+15)` = 8 in each window — and those 8s are **#9's own 16**, seated by today's split into exactly those
  two windows by `projectBackwardOccupancy` because the stored 20:30 total already contained them.

## 4. The off-list branch — did not run

The interval in force for the operator path: van customer 15 / operator NULL, **event override customer 5 /
operator NULL** → `applyEventIntervals` gives `{ customer: 5, truck: 5 }` (the operator follows the event's customer
value). 20:30 is on a 5-minute grid from 17:00. And **the manual path never calls `placeOrderInSlotLocked`** (no
reference in `app/api/dashboard/action/route.ts`); it books via `rebuildProductionSlotUsage`. The unrecognised-slot
branch —
```ts
    const startEntry = times.find(t => t.collection_time === startSlot)
    // Unrecognised slot (not in the list) → confirm at requested, no capacity check (Section 5).
    if (!startEntry) { return { finalSlot: startSlot, booked: true } }
```
— belongs to the customer submit and promote paths only. Not this case.

## 5. The UI — why no popup, and why that was correct

`submitManual` (AddOrderPanel): with a slot and an event, and `skipFitCheck` false, it awaits **its own fresh
read** — `const checkData = await fetchFreshSlots(manualEvent)` (operator token, event scope, `cache: 'no-store'`)
— projects it, runs `fitOrderBackward` for the basket at the slot with the switch on, and `if (!fit.fits) {
setCapacityConfirm({…}); return }`. It places with no popup **only** when that fresh fit says `fits: true` (or
`skipFitCheck` re-entry after the modal, or a swallowed exception in the check — "FAIL OPEN"). The board it read
was board A: **16 at 20:30 fits, so no popup was the right answer.** The refresher (`capacity-refresh`, 5-second
throttle) only feeds the list's dots and labels; the submit's check does not read `capacityInputs` when online
and cannot be served a throttled or in-flight result — it awaits a fresh response of its own. Offline it uses the
cached inputs and marks the modal `stale`. Nothing here was stale: the list said free, the check said fits, and
both were right about board A.

## 6. The banner text

`detectCapacityBreaches` sets `reason: w.bound_by ?? (overTotal > 0 ? 'kitchen capacity' : 'batch')` — for #9's
window that is the engine's own `"Pizza 16/8"`, with `over_total: 0` and `over_cats: [{ pizza: 8 }]` (kc is
NULL, so `remainingTotal` is Infinity). The banner ignored it:
```tsx
{`Kitchen over capacity — ${total} ${total === 1 ? 'item' : 'items'} cooking for ${slot}`}
```
— one headline for every reason. With a category batch it should have named the batch. Fixed (§8.2).

## 7. The cause, plainly

**(d) — none of a, b or c.** The order genuinely fit (two empty batches). The UI checked it against the real
board, found it fit, and placed it without a popup — correctly. The server then **admitted it against a board
that already contained it**: the manual path rebuilds `production_slot_usage` *after* inserting the order and
*before* `admitForManual`, and `admitForManual` read those totals through `getProductionSlotUnits(…, orderKey)`,
whose `excludeOrderKey` is honoured only on its two reseed paths (an empty or unreadable table) and ignored once
rows exist. So the admission saw its own 16 as "existing" (8 + 8), `reserveBatches` refused, and
`buildAdmittedReservation` stored an `override` record with all 16 in one window. Every downstream symptom — the
red "! 16 Pizzas" dot, the four "Full – next free" neighbours, the breach, the "Placed anyway" line — is the engine
faithfully rendering that wrong record. The same double-count applies to the **edit** path (re-book, then admit).

Evidence: §1 (the record), §3 (board B reproduces it byte for byte; board A does not), and the harness's broken
variant, which is the pre-fix `admitForManual` run on Dominic's exact data and produces `override, 20:15–20:30:16`.

## 8. The fix, by symbol

### 8.1 `lib/slot-bookings.ts` — new `readUnitsWithoutOrder(supabase, truckId, eventId, orderKey)`
Returns `buildUnitsFromOrders(supabase, truckId, eventId, orderKey)`: the board rebuilt from `orders`, this order
excluded by key, nothing persisted. `buildUnitsFromOrders` itself is **byte-identical to HEAD** (a first draft
exported it and `slot-interval-engine-identity.cjs` caught the changed first line; the wrapper keeps the symbol as it
was). `lib/orders/cooking-reservation.ts` `admitForManual`: the units read is now `readUnitsWithoutOrder(…)`
instead of `getProductionSlotUnits(…, orderKey)`. Reservations were already excluded by key.

This restores the intended rule — an admission judges the board without the order, exactly what the submit path's
fit-read sees — and changes nothing else: `fitOrderBackward`, `reserveBatches`, `buildAdmittedReservation`,
placement, the off-list branch and every OFF path are untouched. A **genuine** over-batch still records an
`override` (proven below).

### 8.2 `components/dashboard/CapacityBreachBanner.tsx` — the headline names the real limit
Per grouped slot the banner now picks the breach whose window ends at that slot (else the first naming one of its
orders) and reads its `reason`:

| reason | headline |
|---|---|
| `"<Cat> <used>/<batch>"` with `over_total` 0 | **new:** `Pizza over batch — 16 for 20:30 (8 per batch)` |
| `"over capacity at event-start"` | **new:** `Over capacity at event start — 10 items for 17:00` |
| anything else (`global ceiling`, `kitchen capacity`) | unchanged: `Kitchen over capacity — 6 items cooking for 18:30` |

The contributor line (`#9 — 16 items`) and `Placed anyway: #9 for 20:30` are unchanged. **Every new string:**
`{Category} over batch — {used} for {slot} ({batch} per batch)`; `Over capacity at event start — {n} items for {slot}`.

### 8.3 Harness — `scripts/sixteen-pizza-admission.cjs`
The **real** `admitForManual` against an in-memory PostgREST seeded with the event as the database held it (§1),
then Dominic's sequence: insert #9, rebuild the totals including it, admit.

**Failure mode:** an admission counting the order's own load as existing, storing an `override` the operator never
chose; a banner blaming the kitchen ceiling for a batch breach.

**Broken variants, run FIRST — both FAILED as required:**
| | Variant | Result |
|---|---|---|
| V1 | `admitForManual` as it was (units from the stored totals) | ✓ FAILED as required: `source=override windows=20:15–20:30:16 — Dominic's #9, exactly` |
| V2 | the banner's old unconditional headline on a batch breach with kc NULL | ✓ FAILED as required: `"Kitchen over capacity — 16 items cooking for 20:30"` |

**Real result:**
```
  ✓ manual: 16 @20:30 after the insert + rebuild → source fit
  ✓ …two windows of 8: 20:00–20:15:8 20:15–20:30:8 (both were empty)
  ✓ edit: re-booked then admitted → source fit, 20:00–20:15:8 20:15–20:30:8
  ✓ a real over-batch (another 8 in 20:00–20:15): source override, 20:15–20:30:16 — Place it anyway still records the shortfall
  ✓ category batch: "Pizza over batch — 16 for 20:30 (8 per batch)"   ✓ "Kitchen over capacity" not said (kc NULL)
  ✓ the contributor line and the placed-anyway line are unchanged
  ✓ kitchen ceiling: "Kitchen over capacity — 6 items cooking for 18:30"
  ✓ event-start pile: "Over capacity at event start — 10 items for 17:00"
✅ an order is admitted against the board without itself, and the banner names the real limit      rc=0
```

### 8.4 Order #9 itself
The stored record is wrong and this fix does not rewrite history. Editing #9 (any change, or re-saving it) re-admits
it through the fixed path and will store `fit` with two windows of 8; or cancel and re-add it. That is a data step
for Dominic on test-truck (§10), not code.

## 9. Verification

| Check | Result |
|---|---|
| `node scripts/run-harnesses.cjs` | **48 run · 48 passed · 0 failed — true exit code 0** (an intermediate sweep showed `slot-interval-engine-identity` red while `buildUnitsFromOrders` was exported; the wrapper restored it) |
| `npx tsc --noEmit` | **true exit code 0** |
| `npx next build` | "Compiled successfully in 5.0s", **true exit code 0** |
| `scripts/fixtures/batch-rolling-golden.json` | sha256 `8bdae817748ad334…` before and after — not regenerated |
| `scripts/fixtures/batch-reservation-golden-on.json` | sha256 `ce5550b7ee2a42ce…` before and after — not regenerated |

Verdicts for aligned setups: the engine files are untouched (`lib/slot-availability.ts` not in this task's diff);
`batch-rolling-identity`, `batch-reservation-golden-on`, `batch-reservation-p2-identity`, `customer-path-identity`
and `slot-interval-engine-identity` all pass in the sweep.

## 10. Localhost check — test-truck (Pizza Kitchen), switch ON, "Rolling batch test"

1. Add Order, 16 Margheritas, open the time list: **20:30 is green with no label** (both 20:00–20:15 and
   20:15–20:30 are empty). Select it and place. **No popup** — correct, it fits.
2. The order saves. The strip shows **20:15 🔴 8 Pizzas** and **20:30 🔴 8 Pizzas** (two full batches),
   20:20/20:25 "Full – next free 20:45", and **no** breach banner.
3. Open the new order's card: its reservation is two windows of 8 (or read it: the SQL in §1 — `source: 'fit'`).
4. Now place **another 8 at 20:15**, then a further **16 at 20:30**: the list shows 20:30 "Full – next free …" and
   the popup appears naming 20:00–20:15 existing 8; press **Place it anyway**. The banner reads
   **"Pizza over batch — 16 for 20:30 (8 per batch)"** with `Placed anyway: #<n> for 20:30` — never "Kitchen over
   capacity", because there is no kitchen ceiling on this van.
5. Edit that order down to 8 and save: the banner clears; the strip returns to two full batches.
6. Order #9 from yesterday: edit it (change nothing but re-save, or move it) and its reservation becomes `fit`
   with two windows; the stale "! 16 Pizzas" and the banner go.

## 11. Anything I could not establish
- **Why #9's `computed.gridIntervalMins` is null** in the stored record: `admitForManual` passes no grid interval
  to `buildAdmittedReservation`; cosmetic, unread by any consumer, unchanged here.
- **Whether any other order on any truck carries a spurious `override` record** from the same cause. A read-only
  query would answer it — `select orders.id, orders.truck_id, orders.slot from public.orders where
  orders.cooking_reservation->>'source' = 'override' and orders.capacity_ack_at is null` — but the column
  `capacity_ack_at`'s presence was not verified in this session and the live-truck rule keeps me from acting on the
  result; run it yourself if you want the count.
- The banner's fallback (`first breach naming one of these orders`) when an order feeds a window at another
  collection time is exercised only by the three fixture cases in the harness, not on a device.

## 9b. Every modified and untracked path (124 entries, 0 staged), grouped

### COLLECTION TIMES + CAPACITY + ADD ORDER + RESERVATIONS
`M app/api/dashboard/action/route.ts` · `M app/api/dashboard/route.ts` · `M app/api/events/route.ts` · `M app/api/manage/route.ts` · `M app/api/menu/[truckId]/route.ts` · `M app/api/orders/submit/route.ts` · `M app/api/slots/[truckId]/route.ts` · `M app/dashboard/[token]/page.tsx` · `M app/manage/[token]/page.tsx` · `M app/trucks/[slug]/order/page.tsx` · `M components/dashboard/AddOrderPanel.tsx` · `M components/dashboard/CapacityBreachBanner.tsx` · `M lib/capacity-breach.ts` · `M lib/features.ts` · `M lib/orders/place-in-slot.ts` · `M lib/payments/promote-draft.ts` · `M lib/slot-availability.ts` · `M lib/slot-bookings.ts` · `M lib/slot-display.ts` · `M lib/slot-generation.ts` · `M lib/supabase.ts` · `? lib/capacity-refresh.ts` · `? lib/orders/cooking-reservation.ts` · `? lib/slot-fit-message.ts` · `? lib/slot-interval.ts`

### WIRED PRINTING (app, native, plugin)
`M android/app/capacitor.build.gradle` · `M android/capacitor.settings.gradle` · `M components/printing/PrintingSettings.tsx` · `M ios/App/App/Info.plist` · `M ios/App/CapApp-SPM/Package.swift` · `M lib/printing/bleTransport.ts` · `M lib/printing/transport.ts` · `M lib/printing/usePrinting.ts` · `M package-lock.json` · `M package.json` · `? app/api/printing/route.ts` · `? components/printing/PrinterTypeChoice.tsx` · `? lib/printing/netAddress.ts` · `? lib/printing/netTransport.ts` · `? lib/printing/networkGuard.ts` · `? lib/printing/testTicket.ts` · `? plugins/hatchgrab-net-printer/{Package.swift, index.d.ts, index.js, package.json, android/build.gradle, android/src/main/AndroidManifest.xml, android/src/main/java/com/hatchgrab/netprinter/NetPrinterPlugin.java, ios/Sources/NetPrinterPlugin/NetPrinterPlugin.swift}` — ⚠️ plus 34 untracked, **not ignored** build files under `plugins/hatchgrab-net-printer/android/build/…` and `plugins/hatchgrab-net-printer/.swiftpm/xcode/xcuserdata/…/xcschememanagement.plist` (see docs/edit-busy-fix-report.md §5; a `.gitignore` entry is still proposed, not done).

### HOLD (landing, plan-features, store listing copy)
`M app/landing/page.tsx` · `M content/store-listing.md` · `M lib/plan-features.ts`

### MIGRATIONS (all APPLIED by hand; files untracked)
`? supabase/migrations/20260916_collection_intervals.sql` · `? …/20260917_van_collection_intervals.sql` · `? …/20260918_event_collection_intervals.sql` · `? …/20260919_van_network_printer.sql` · `? …/20260920_orders_cooking_reservation.sql`

### INCIDENT SAFEGUARDS
`M scripts/migrate-from-sheets.cjs` · `M scripts/register-payment-domain.cjs` · `? scripts/harnesses.json` · `? scripts/run-harnesses.cjs` · `? scripts/ops-write-guard.cjs`

### HARNESSES + FIXTURES
`M scripts/whatsapp-golive-parity-harness.cjs` · `? scripts/_batch-reservation-golden-on-generate.cjs` · `? scripts/_batch-reservation-sim.cjs` · `? scripts/_batch-rolling-golden-generate.cjs` · `? scripts/_batch-rolling-snapshot.cjs` · `? scripts/_mini-dom.cjs` · `? scripts/_printing-mocks.cjs` · `? scripts/_slot-interval-compile.cjs` · `? scripts/add-order-fit-message.cjs` · `? scripts/add-order-refresh.cjs` · `? scripts/add-order-render.cjs` · `? scripts/batch-reservation-display-equals-picker.cjs` · `? scripts/batch-reservation-edit-lock.cjs` · `? scripts/batch-reservation-golden-on.cjs` · `? scripts/batch-reservation-helper.cjs` · `? scripts/batch-reservation-immutability.cjs` · `? scripts/batch-reservation-instants.cjs` · `? scripts/batch-reservation-lock.cjs` · `? scripts/batch-reservation-p2-identity.cjs` · `? scripts/batch-reservation-p3-worked-case.cjs` · `? scripts/batch-reservation-switch.cjs` · `? scripts/batch-reservation-writers.cjs` · `? scripts/batch-rolling-check.cjs` · `? scripts/batch-rolling-identity.cjs` · `? scripts/collection-times-hint.cjs` · `? scripts/customer-path-identity.cjs` · `? scripts/dev-virtual-printer.cjs` · `? scripts/dot-overlap-labels.cjs` · `? scripts/fixtures/{batch-reservation-golden-on.json, batch-rolling-fix.patch, batch-rolling-golden.json}` · `? scripts/printing-copy.cjs` · `? scripts/printing-dedupe.cjs` · `? scripts/printing-escpos-identity.cjs` · `? scripts/printing-failure-split.cjs` · `? scripts/printing-gating.cjs` · `? scripts/printing-network-guard.cjs` · `? scripts/printing-transport-contract.cjs` · **`? scripts/sixteen-pizza-admission.cjs`** · `? scripts/slot-interval-dots.cjs` · `? scripts/slot-interval-engine-identity.cjs` · `? scripts/slot-interval-event-override.cjs` · `? scripts/slot-interval-generator.cjs` · `? scripts/slot-interval-grid-routing.cjs` · `? scripts/slot-interval-settings.cjs` · `? scripts/slot-interval-van-list-tolerance.cjs` · `? scripts/slot-interval-van-resolution.cjs`

### DOCS
`? docs/add-order-fit-message-report.md` · `? docs/add-order-render-fix-report.md` · `? docs/batch-keep-together-investigation-report.md` · `? docs/batch-overlap-review-report.md` · `? docs/batch-reservation-investigation-report.md` · `? docs/batch-reservation-p0-p2-report.md` · `? docs/batch-reservation-p3-report.md` · `? docs/batch-rolling-durable-harness-report.md` · `? docs/batch-rolling-fix-report.md` · `? docs/batch-split-review-report.md` · `? docs/dashboard-order-and-batch-overlap-report.md` · `? docs/discovery-incident-followup-report.md` · `? docs/discovery-upsert-incident-report.md` · `? docs/dot-overlap-labels-report.md` · `? docs/edit-busy-fix-report.md` · `? docs/edit-lock-and-refresh-report.md` · `? docs/gusto-event-update-trace-report.md` · **`? docs/sixteen-pizza-bug-report.md`** (this file) · `? docs/slot-interval-build-report.md` · `? docs/slot-interval-event-override-report.md` · `? docs/slot-interval-hardening-report.md` · `? docs/slot-interval-van-level-report.md` · `? docs/wired-printing-build-report.md` · `? docs/wired-printing-followup-report.md` · `? docs/wired-printing-investigation-report.md`

### ANYTHING ELSE
Nothing — every one of the 124 entries is above.
