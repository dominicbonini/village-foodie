# A red dot labelled below the batch — diagnosed and fixed

**Date:** 19 September 2026 · Display only (the label's number) · Localhost only; nothing deployed, nothing
committed, nothing staged.
**Files changed:** `lib/slot-display.ts`, `scripts/dot-overlap-labels.cjs`. Nothing in the engine, the routes, the
panel or the pages.
**Scripts run:** `node scripts/run-harnesses.cjs` and `scripts/dot-overlap-labels.cjs`. `scripts/` was never
globbed; no golden generator was run. No live truck's token, device id, page, route or API was touched; nothing
was created, edited, cancelled or deleted for any truck. The only database access was **read-only PostgREST
GETs on test-truck** (§1, every column table-qualified, shown in chat); every engine figure is a fixture built from
those rows.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

**Dominic's mid-task note — "I had changed the prep time and batch"** — is visible in the rows (§1) and is
**not the cause** (§2): the engine discards those stale records and seats every order afresh, and the strip
renders identically with them carried or dropped.

---

## STEP 0 — `git status`

**Before:** branch `main`, up to date with `origin/main`, **37 modified, 92 untracked, 0 staged** (129 entries).
**After:** **37 modified, 93 untracked, 0 staged** (130 entries) — the same listing plus this report. Full grouped
listing in §9. `git add -A` / `git add .` were not run; nothing staged, committed, stashed, reset or restored.

---

## 1. What is on the board (read-only SQL, test-truck)

```sql
SELECT trucks.id, trucks.name, trucks.plan, trucks.feature_overrides FROM trucks WHERE trucks.name ILIKE '%Pizza Kitchen%';
-- test-truck · Pizza Kitchen · trial · {"batch_reservations": true, …}
SELECT truck_events.id, truck_events.event_date, truck_events.start_time, truck_events.end_time, truck_events.status,
       truck_events.van_id, truck_events.collection_interval_mins_override, truck_events.operator_collection_interval_mins_override
  FROM truck_events WHERE truck_events.truck_id = 'test-truck' ORDER BY truck_events.event_date DESC LIMIT 1;
-- 7a98c341-… · 2026-09-17 · 17:00–23:00 · open · Van1 · customer 5 · operator NULL  ⇒ operator grid 5
SELECT truck_vans.name, truck_vans.kitchen_capacity, truck_vans.capacity_window_mins FROM truck_vans WHERE truck_vans.truck_id = 'test-truck';
-- Van1 · kitchen_capacity NULL · capacity_window_mins 10
SELECT menu_categories.name, menu_categories.prep_secs, menu_categories.batch_size, menu_categories.counts_toward_capacity
  FROM menu_categories WHERE menu_categories.truck_id = 'test-truck' AND menu_categories.is_active;
-- Pizza · 900 · 8 · true   (Desserts, Drinks: prep 0, batch 0, counts_toward_capacity false)
SELECT orders.id, orders.slot, orders.status, orders.items, orders.cooking_reservation, orders.order_key
  FROM orders WHERE orders.truck_id = 'test-truck' AND orders.event_id = '7a98c341-85b3-43ab-856f-073a9ffe982b' ORDER BY orders.slot;
```

The 18 orders on the event; the ones that shape the 21:45–22:25 strip in bold:

| # | slot | status | items | stored `cooking_reservation` |
|---|---|---|---|---|
| 7 | 17:15 | confirmed | 9 | none |
| 8 | 17:30 | collected | 7 | batch 8 / prep 15 → 17:15–17:30: 7 (fit) |
| 3, 4, 5, 6 | 18:15, 18:30, 19:00, 19:15 | confirmed / ready / confirmed / confirmed | 8 each | none |
| 9 | 20:30 | **cancelled** | 16 | batch 8 / prep 15 → 20:15–20:30: 16 (override) |
| 10 | 20:55 | confirmed | 16 | batch 8 / prep 15 → 20:25–20:40: 8, 20:40–20:55: 8 (fit) |
| 11 | 21:05 | confirmed | 4 | **batch 2 / prep 5** → 20:55–21:00: 2, 21:00–21:05: 2 |
| 14, 15, 16 | 21:15, 21:20, 21:25 | confirmed | 2, 1, 1 | batch 2 / prep 5 |
| 17 | 21:25 | collected | 2 | batch 2 / prep 5 (override) |
| **12** | **21:45** | confirmed | **8** | **batch 2 / prep 10** → four windows of 2 |
| **13** | **21:50** | confirmed | **2** | batch 2 / prep 5 → 21:45–21:50: 2 |
| **19** | **21:55** | confirmed | **2** | batch 2 / prep 5 → 21:50–21:55: 2 |
| **18** | **22:00** | confirmed | **1** | batch 2 / prep 5 → 21:55–22:00: 1 |
| **20** | **22:10** | confirmed | **5** | batch 2 / prep 5 → 21:55–22:00: 1, 22:00–22:05: 2, 22:05–22:10: 2 |

**Occupying statuses** (`OCCUPYING_STATUSES`: pending, confirmed, modified, cooking): #4 (ready), #8 and #17
(collected) and #9 (cancelled) do not count. Occupying pizzas by collection time:
`17:15: 9 · 18:15: 8 · 19:00: 8 · 19:15: 8 · 20:55: 16 · 21:05: 4 · 21:15: 2 · 21:20: 1 · 21:25: 1 · 21:45: 8 · 21:50: 2 · 21:55: 2 · 22:00: 1 · 22:10: 5`.

**The stored reservations are stale.** Orders 11–20 were seated when Pizza was batch 2 / prep 5 (12 at prep 10);
the category is now batch 8 / prep 15. `validReservationsAt` accepts a record only when `c.batch === batch &&
c.prepMins === prepMins`, so every one of them is ignored and those orders are seated afresh at 15 / 8. Only #10's
record (batch 8 / prep 15) is valid — and it is exactly what fresh seating produces anyway.

**Cooking intervals the engine actually holds** (from `projectBackwardOccupancy`, switch ON; OFF identical):

```
21:05–21:20  1     21:10–21:25  1
21:30–21:45  8   (#12, collected 21:45)
21:35–21:50  2   (#13, 21:50)
21:40–21:55  2   (#19, 21:55)
21:45–22:00  1   (#18, 22:00)
21:55–22:10  5   (#20, 22:10)
```

## 2. Per listed time, from the real engine — the strip reproduced byte-for-byte

`dotOccupancyAt` with the state above, prep 15 / batch 8 / kc NULL / grid 5, switch ON (OFF identical):

| time | rendered (today) | (a) window the COLOUR came from — span · rolling pizza load · limit | (b) the LABEL's number — and which number | (c) fits 1 / 2 |
|---|---|---|---|---|
| 21:45 | 🔴 `8 Pizzas` | own window 21:30–21:45 · **12** (8+2+2) · batch 8 → red | **8** = `byCat` (items *seated* in that window) | no / no |
| 21:50 | 🔴 `2 Pizzas` | own window 21:35–21:50 · **13** (8+2+2+1) · batch 8 → red | **2** = `byCat` | no / no |
| 21:55 | 🔴 `2 Pizzas` | own window 21:40–21:55 · **13** (8+2+2+1) · batch 8 → red | **2** = `byCat` | no / no |
| 22:00 | 🔴 `1 Pizza` | own window 21:45–22:00 · **10** (2+2+1+5) · batch 8 → red | **1** = `byCat` | no / no |
| 22:05 | 🔴 `8 Pizzas` | no own window; rolling [21:50, 22:05) · **8** (2+1+5) · batch 8 → red | 8 = `perCat.used` — the rolling read | no / no |
| 22:10 | 🟡 `5 Pizzas` | own window 21:55–22:10 · **6** (1+5) · batch 8 → amber | 5 = `byCat` | yes / yes |
| 22:15 | 🟡 `5 Pizzas` | rolling [22:00, 22:15) · 5 · amber | 5 = `perCat.used` | yes / yes |
| 22:20 | 🟡 `5 Pizzas` | rolling [22:05, 22:20) · 5 · amber | 5 = `perCat.used` | yes / yes |
| 22:25 | 🟢 | rolling [22:10, 22:25) · 0 | — | yes / yes |

This is Dominic's strip exactly (the panel adds no verdict on red, and 2 pizzas fit from 22:10 on, so no
"Won't fit" appears with 2 in the basket).

**(a) and (b) disagree at 21:45, 21:50, 21:55, 22:00 and 22:10 — and the colour is reading the right span.**
In every one the label reads **one contributing batch — the items seated in this window** — while the colour
reads the **window's total across every batch overlapping its span**. The window's own `bound_by` already says
so: `"Pizza 13/8"` at 21:50. The two times with no window of their own (22:05, 22:15, 22:20) are fine because
their label already came from the rolling read.

## 3. The cause, stated plainly

A `BackwardWindow` carries **two numbers per cooking category**, and they were read by different things:

- `byCat[cat]` — the items **seated in this start minute**. Read by the composition label.
- `batch − remainingByCat[cat]` — the **rolling load over the window's span** `[startMins, startMins + prep_cat)`,
  every batch of the category overlapping it. Read by the window's `tone` and `bound_by`.

The window builder in `projectBackwardOccupancy` records the split in its own words (17 September 2026):
*"`byCat` (the LABEL) is still this start minute's own load, unchanged. The TONE, `remainingByCat` and `bound_by`
now use the rolling category load over this window's span."* On a grid that is a whole multiple of the prep the
two numbers are equal — every batch overlapping the span starts at its start — so nothing showed. On a 5-minute
grid under a 15-minute prep they diverge, and the label under-reports by exactly the batches that overlap.

**The invariant that should hold:** on a red dot the labelled number is the total of the window that made it
red, so it is **at least the batch (or the kitchen ceiling) unless an override put more in**. Sweep of **today's**
code (5-minute grid, preps 10 and 15, batches 2 and 8, kc NULL/6, switch ON/OFF, 400 seeded states):

> 3,094 red dots · **258 labelled below the limit** · **all 258 through the own-window label, 0 through the
> rolling label.** e.g. `prep 15 batch 8 kc 6 · 20:50 🔴 "5 Pizzas"`, `prep 10 batch 8 · 19:25 🔴 "2 Pizzas"`,
> `prep 15 batch 2 kc 6 · 18:35 🔴 "1 Pizza"`.

## 4. The fix, by symbol — `lib/slot-display.ts`, `buildSlotIndicators`

**The label now reads the number the tone was decided from.** Three additions, no engine change:

```ts
  // Each cooking category's batch exactly as projectBackwardOccupancy records it (`Math.max(1, cfg.batch)`,
  // lowercase key), so `batch − remainingByCat[cat]` below recovers the rolling load the tone used.
  const batchOf = new Map<string, number>()
  for (const [catRaw, cfg] of Object.entries(catConfigs)) if (cfg && cfg.secs) batchOf.set(catRaw.toLowerCase(), Math.max(1, cfg.batch))
  …
    const tonesNumber = (cat: string, own: number): number => {
      const batch = batchOf.get(cat.toLowerCase()); const rem = w!.remainingByCat[cat]
      return batch == null || rem == null || !Number.isFinite(rem) ? own : batch - rem
    }
    const rawLabel = w ? countLabel(Object.entries(w.byCat).map(([cat, n]) => [cat, tonesNumber(cat, Number(n))] as [string, number]), rankOf) : ''
  …
    const instants = w ? Object.entries(w.byCat).filter(([cat]) => !batchOf.has(cat.toLowerCase())).map(([cat, n]) => [cat, Number(n)] as [string, number]) : []
    const overlap = read.overlap
    const label = overlap
      ? countLabel([...Object.entries(read.perCat).map(([cat, r]) => [cat, r.used] as [string, number]), ...instants], rankOf)
      : ownLabel
```

- **`tonesNumber`** — for a cooking category, `batch − remainingByCat[cat]`: the rolling load over the window's
  span, the very number its tone and `bound_by` used. Same window, same span, same per-category total. An instant
  category has no batch, so its ticked count still comes from `byCat`.
- **`overlap = read.overlap`** — the `ownLabel ? null : …` guard is gone. When the rolling read over `[T − prep, T)`
  is strictly worse than the window's own tone the colour came from it, so the label reads its `perCat.used`
  regardless of whether the time has a window of its own. `instants` carries a ticked no-prep count into that
  branch too, so it keeps its place either way.
- **One read, used by both:** `dotOccupancyAt` returns `window` and `perCat`; the colour is
  `max(window.tone, rolling tone)` and the label now reads the numbers of whichever decided it.

**Why aligned setups cannot move.** Where the grid is a whole multiple of every cooking prep, every batch
overlapping `[start, start + prep)` starts at `start`, so the rolling load equals `byCat` and `tonesNumber`
returns the same number; the §31 pile records `remainingByCat = batch − byCat`, so it returns `byCat` there too;
and `read.overlap` can only be set where the rolling tone is strictly worse than the window's — which the
existing tone-identity sweep already proves never happens on an aligned grid. Measured, not assumed (§6).

**Strings:** none added, none removed. `countLabel`, `formatFitSuffix`, the popup, the settings hint and the
customer page are untouched.

## 5. The corrected strip, as built

Dominic's exact state; identical switch ON and OFF:

| time | before | **after** | with 3 in the basket |
|---|---|---|---|
| 21:45 | 🔴 `8 Pizzas` | 🔴 **`12 Pizzas`** | 🔴 `12 Pizzas` |
| 21:50 | 🔴 `2 Pizzas` | 🔴 **`13 Pizzas`** | 🔴 `13 Pizzas` |
| 21:55 | 🔴 `2 Pizzas` | 🔴 **`13 Pizzas`** | 🔴 `13 Pizzas` |
| 22:00 | 🔴 `1 Pizza` | 🔴 **`10 Pizzas`** | 🔴 `10 Pizzas` |
| 22:05 | 🔴 `8 Pizzas` | 🔴 `8 Pizzas` | 🔴 `8 Pizzas` |
| 22:10 | 🟡 `5 Pizzas` | 🟡 **`6 Pizzas`** | 🟡 `6 Pizzas · Won't fit` (6 + 3 > 8) |
| 22:15 | 🟡 `5 Pizzas` | 🟡 `5 Pizzas` | 🟡 `5 Pizzas` |
| 22:20 | 🟡 `5 Pizzas` | 🟡 `5 Pizzas` | 🟡 `5 Pizzas` |
| 22:25 | 🟢 | 🟢 | 🟢 |

Every red time now carries at least the batch of 8. With 2 in the basket no verdict appears anywhere (red is
silent; 2 fit from 22:10 on). **A note on the earlier brief:** `22:10 🟡 6 Pizzas · Won't fit` — the line I called
unreachable in `docs/dot-label-cooking-counts-report.md` §3 — was the real board all along: the 1 pizza at 22:00
(#18) shares 22:10's window, and the label was hiding it. That report's §4 table (two orders, no #18) is
unchanged and still asserted.

## 6. The harness — `scripts/dot-overlap-labels.cjs`

**Failure mode:** a red dot labelled with a number smaller than the batch — one contributing batch shown where
the colour was decided from the window's total.

**Broken variants, run FIRST — all twelve FAILED as required** (the two this fix needs in bold):

| | Variant | Result |
|---|---|---|
| V1 | today's exact-time read | ✓ FAILED |
| V2 | the overlapping window's own composition repeated | ✓ FAILED |
| V3 | "Full" restored on an overlapped time | ✓ FAILED |
| V3b | the rolling rule applied to `ownLabel` too (pile reads 2) | ✓ FAILED |
| **V9** | **today's label read — `byCat` instead of the tone's number** | ✓ FAILED: Dominic's 22:00 reads `"22:00 🔴 1 Pizza"` |
| **V10** | **the largest single batch overlapping the window instead of its total** | ✓ FAILED: 21:50 reads `"21:50 🔴 8 Pizzas"` (must be 13) |
| V4 / V4b | operator reason on the customer row / popup stripped | ✓ FAILED |
| V5 | closed-left overlap | ✓ FAILED (`"17:15 🔴 9 Pizzas"` — the touching batch now counted into the total) |
| V6 | the verdict on a red dot | ✓ FAILED |
| V7 / V8 | long wording / popup title shortened | ✓ FAILED |

**Real result** (verbatim, trimmed to the new and affected lines):
```
── DOMINIC'S BOARD — a red dot's number is the window's total, never one batch
  ✓ switch OFF · 0 in the basket · "21:45 🔴 12 Pizzas" "21:50 🔴 13 Pizzas" "21:55 🔴 13 Pizzas" "22:00 🔴 10 Pizzas" "22:05 🔴 8 Pizzas" "22:10 🟡 6 Pizzas" "22:15 🟡 5 Pizzas" "22:20 🟡 5 Pizzas" "22:25 🟢"
  ✓ …every red time (21:45, 21:50, 21:55, 22:00, 22:05) carries at least the batch of 8
  ✓ switch OFF · 2 in the basket · (identical)      ✓ switch ON · 0 and 2 · (identical)
  ✓ 3 in the basket · 22:10 shows its window's TOTAL and refuses (6 + 3 > 8): "22:10 🟡 6 Pizzas · Won’t fit"; 22:15 takes it: "22:15 🟡 5 Pizzas"   (ON and OFF)
── THE INVARIANT: on a red dot the number ≥ the binding limit (batch or ceiling)
  ✓ 5-minute grid · 400 states (preps 10/15, batches 2/8, kc null/6, ON/OFF) · 3094 red dots · 0 labelled below the limit
  ✓ …and 4167 amber dots all carry their window's number (0 blank)
  ✓ 10-minute grid · 200 states · 790 red dots · 0 labelled below the limit · 1044 amber dots, 0 blank
── (unchanged sections, still passing)
  ✓ DOMINIC'S FIRST CASE: "17:00 🔴 8 Pizzas" "17:05 🔴 9 Pizzas" "17:10 🔴 9 Pizzas" "17:15 🟡 1 Pizza"; 9 pizzas: "17:15 🟡 1 Pizza · Won’t fit"
  ✓ SECOND CASE 16 @20:55, both record shapes · THE §4 TABLE (both baskets, the 1 @22:05 variant, the empty order)
  ✓ §31 event-start pile: "16:30 🔴 6 Pizzas" · ticked no-prep: "17:10 🔴 2 Pizzas, 3 Drinks" · two categories: "17:40 🔴 8 Pizzas, 4 Burgers"
  ✓ 1226 rendered lines: 0 contain "Full" or "free" · kitchen ceiling: "17:05 🔴 4 Pizzas, 2 Burgers" · 10-minute grid, prep 15 unchanged
  ✓ AGREEMENT: 2200 states, 96441 (time, category) reads: dot red by overlap ⇔ refused, 0 disagree
  ✓ ALIGNED: 1200 seeded aligned states (grids 5/10/15/20/30, preps dividing the grid, instants + ceilings, ON/OFF): dots and /api/slots tones 0 differ
  ✓ Gusto-shaped (300) + aligned240 (240) + Gusto's six live events: 546 fixtures, 0 dots differ from today
✅ rc=0
```

A direct measurement outside the harness, for the guard removal: across 7,894 dot reads on aligned grids (5–30,
preps dividing the grid, instants and ceilings, ON/OFF) `read.overlap` was set **0** times.

## 7. Verification

| Check | Result |
|---|---|
| `node scripts/run-harnesses.cjs` | **48 run · 48 passed · 0 failed — true exit code 0** |
| `npx tsc --noEmit` | **true exit code 0** |
| `npx next build` | "Compiled successfully in 5.4s", **true exit code 0** |
| `scripts/fixtures/batch-rolling-golden.json` | sha256 `8bdae817748ad334…` **before and after** — not regenerated |
| `scripts/fixtures/batch-reservation-golden-on.json` | sha256 `ce5550b7ee2a42ce…` **before and after** — not regenerated |
| eslint, `lib/slot-display.ts`, vs a clean HEAD worktree | **no rule count changed** — 0 errors / 0 warnings on both sides |

Colours, verdicts, offered times, placement, reservations and breaches are byte-identical: `lib/slot-availability.ts`,
`lib/capacity-breach.ts`, `lib/orders/*`, every route and the panel are absent from this task's diff, and every
identity harness in the sweep passes.

## 8. Localhost check — test-truck (Pizza Kitchen), the board as it stands

Open the 17 September event's Add Order list (nothing to place; the orders are already there). With an **empty
basket** you should see, from 21:45:

```
21:45 🔴 12 Pizzas     21:50 🔴 13 Pizzas     21:55 🔴 13 Pizzas     22:00 🔴 10 Pizzas
22:05 🔴 8 Pizzas      22:10 🟡 6 Pizzas      22:15 🟡 5 Pizzas      22:20 🟡 5 Pizzas      22:25 🟢
```

- **Add 2 pizzas.** Nothing changes — red stays silent and 2 fit from 22:10 on.
- **Make it 3.** 22:10 becomes `🟡 6 Pizzas · Won't fit` (6 + 3 = 9 over the batch); 22:15 and 22:20 take it.
- The 13 at 21:50 is the same number the breach banner would name (`Pizza 13/8`): eight from #12, two each from
  #13 and #19, one from #18, all on the grill in that 15-minute span.
- The capacity strip and the edit picker show the same labels.

**Nothing to see on a 15-minute grid:** set Customer Collection Times to every 15 minutes and the listed times are
their own batches, so each shows exactly its own count as before. **Gusto** (prep 5 on a 5-minute grid) is
aligned and renders exactly as it does today — nothing was opened, and nothing needs to be.

## 9. Anything I could not establish

- **Whether Dominic wants the stale reservations re-seated on disk.** Orders 11–20 carry batch-2 / prep-5 records
  that the engine now ignores (§1). Display and admission are right regardless — the fallback is the same fresh
  seating — but `orders.cooking_reservation` no longer describes what the kitchen will do for those orders. A
  settings change re-seating every open order's record is a WRITE and outside this task.
- **The wide-grid cover on a misaligned grid** (a 10-minute grid under a 15-minute prep) takes its numbers from
  the **peak** covered window and its tone from the **worst**; the two coincide on aligned grids and in the 200
  seeded 10-minute states (0 violations), but I have not proved they must coincide in every misaligned state.
- **The mixed-prep window span.** A window's rolling total for a longer-prep category runs `[start, start + prep_cat)`
  past the dot's own time — the engine's documented mixed-cadence approximation. The label now reports that
  number faithfully; whether the approximation itself is what an operator wants on a 5-minute grid with two
  preps is a separate question the tone already raised.

## 10. Every modified and untracked path (130 entries, 0 staged), grouped

### COLLECTION TIMES + CAPACITY + ADD ORDER + RESERVATIONS
`M app/api/dashboard/action/route.ts` · `M app/api/dashboard/route.ts` · `M app/api/events/route.ts` · `M app/api/manage/route.ts` · `M app/api/menu/[truckId]/route.ts` · `M app/api/orders/submit/route.ts` · `M app/api/slots/[truckId]/route.ts` · `M app/dashboard/[token]/page.tsx` · `M app/manage/[token]/page.tsx` · `M app/trucks/[slug]/order/page.tsx` · `M components/dashboard/AddOrderPanel.tsx` · `M components/dashboard/CapacityBreachBanner.tsx` · `M lib/capacity-breach.ts` · `M lib/features.ts` · `M lib/orders/place-in-slot.ts` · `M lib/payments/promote-draft.ts` · `M lib/slot-availability.ts` · `M lib/slot-bookings.ts` · **`M lib/slot-display.ts`** (this task) · `M lib/slot-generation.ts` · `M lib/supabase.ts` · `? lib/capacity-refresh.ts` · `? lib/orders/cooking-reservation.ts` · `? lib/slot-fit-message.ts` · `? lib/slot-interval.ts`

### WIRED PRINTING (app, native, plugin)
`M android/app/capacitor.build.gradle` · `M android/capacitor.settings.gradle` · `M components/printing/PrintingSettings.tsx` · `M ios/App/App/Info.plist` · `M ios/App/CapApp-SPM/Package.swift` · `M lib/printing/bleTransport.ts` · `M lib/printing/transport.ts` · `M lib/printing/usePrinting.ts` · `M package-lock.json` · `M package.json` · `? app/api/printing/route.ts` · `? components/printing/PrinterTypeChoice.tsx` · `? lib/printing/netAddress.ts` · `? lib/printing/netTransport.ts` · `? lib/printing/networkGuard.ts` · `? lib/printing/testTicket.ts` · `? plugins/hatchgrab-net-printer/{Package.swift, index.d.ts, index.js, package.json, android/build.gradle, android/src/main/AndroidManifest.xml, android/src/main/java/com/hatchgrab/netprinter/NetPrinterPlugin.java, ios/Sources/NetPrinterPlugin/NetPrinterPlugin.swift}` — ⚠️ plus 34 untracked, **not ignored** build files under `plugins/hatchgrab-net-printer/android/build/…` and `plugins/hatchgrab-net-printer/.swiftpm/xcode/xcuserdata/…/xcschememanagement.plist`; a `.gitignore` entry (`plugins/**/build/`, `**/xcuserdata/`) remains proposed, not done.

### HOLD (landing, plan-features, store listing copy)
`M app/landing/page.tsx` · `M content/store-listing.md` · `M lib/plan-features.ts`

### MIGRATIONS (all five APPLIED by hand; the files are untracked)
`? supabase/migrations/20260916_collection_intervals.sql` · `? …/20260917_van_collection_intervals.sql` · `? …/20260918_event_collection_intervals.sql` · `? …/20260919_van_network_printer.sql` · `? …/20260920_orders_cooking_reservation.sql`

### INCIDENT SAFEGUARDS
`M scripts/migrate-from-sheets.cjs` · `M scripts/register-payment-domain.cjs` · `? scripts/harnesses.json` · `? scripts/run-harnesses.cjs` · `? scripts/ops-write-guard.cjs`

### HARNESSES + FIXTURES
`M scripts/whatsapp-golive-parity-harness.cjs` · `? scripts/_batch-reservation-golden-on-generate.cjs` · `? scripts/_batch-reservation-sim.cjs` · `? scripts/_batch-rolling-golden-generate.cjs` · `? scripts/_batch-rolling-snapshot.cjs` · `? scripts/_mini-dom.cjs` · `? scripts/_printing-mocks.cjs` · `? scripts/_slot-interval-compile.cjs` · `? scripts/add-order-fit-message.cjs` · `? scripts/add-order-refresh.cjs` · `? scripts/add-order-render.cjs` · `? scripts/batch-reservation-display-equals-picker.cjs` · `? scripts/batch-reservation-edit-lock.cjs` · `? scripts/batch-reservation-golden-on.cjs` · `? scripts/batch-reservation-helper.cjs` · `? scripts/batch-reservation-immutability.cjs` · `? scripts/batch-reservation-instants.cjs` · `? scripts/batch-reservation-lock.cjs` · `? scripts/batch-reservation-p2-identity.cjs` · `? scripts/batch-reservation-p3-worked-case.cjs` · `? scripts/batch-reservation-switch.cjs` · `? scripts/batch-reservation-writers.cjs` · `? scripts/batch-rolling-check.cjs` · `? scripts/batch-rolling-identity.cjs` · `? scripts/collection-times-hint.cjs` · `? scripts/customer-path-identity.cjs` · `? scripts/dev-virtual-printer.cjs` · **`? scripts/dot-overlap-labels.cjs`** (this task) · `? scripts/fixtures/{batch-reservation-golden-on.json, batch-rolling-fix.patch, batch-rolling-golden.json}` · `? scripts/printing-copy.cjs` · `? scripts/printing-dedupe.cjs` · `? scripts/printing-escpos-identity.cjs` · `? scripts/printing-failure-split.cjs` · `? scripts/printing-gating.cjs` · `? scripts/printing-network-guard.cjs` · `? scripts/printing-transport-contract.cjs` · `? scripts/sixteen-pizza-admission.cjs` · `? scripts/slot-interval-dots.cjs` · `? scripts/slot-interval-engine-identity.cjs` · `? scripts/slot-interval-event-override.cjs` · `? scripts/slot-interval-generator.cjs` · `? scripts/slot-interval-grid-routing.cjs` · `? scripts/slot-interval-settings.cjs` · `? scripts/slot-interval-van-list-tolerance.cjs` · `? scripts/slot-interval-van-resolution.cjs`

### DOCS
`? docs/add-order-fit-message-report.md` · `? docs/add-order-render-fix-report.md` · `? docs/batch-keep-together-investigation-report.md` · `? docs/batch-overlap-review-report.md` · `? docs/batch-reservation-investigation-report.md` · `? docs/batch-reservation-p0-p2-report.md` · `? docs/batch-reservation-p3-report.md` · `? docs/batch-rolling-durable-harness-report.md` · `? docs/batch-rolling-fix-report.md` · `? docs/batch-split-review-report.md` · `? docs/dashboard-order-and-batch-overlap-report.md` · `? docs/discovery-incident-followup-report.md` · `? docs/discovery-upsert-incident-report.md` · `? docs/dot-label-cooking-counts-report.md` · `? docs/dot-label-full-only-report.md` · `? docs/dot-label-overlap-counts-report.md` · **`? docs/dot-label-red-total-report.md`** (this file) · `? docs/dot-label-wont-fit-report.md` · `? docs/dot-overlap-labels-report.md` · `? docs/edit-busy-fix-report.md` · `? docs/edit-lock-and-refresh-report.md` · `? docs/gusto-event-update-trace-report.md` · `? docs/sixteen-pizza-bug-report.md` · `? docs/slot-interval-build-report.md` · `? docs/slot-interval-event-override-report.md` · `? docs/slot-interval-hardening-report.md` · `? docs/slot-interval-van-level-report.md` · `? docs/wired-printing-build-report.md` · `? docs/wired-printing-followup-report.md` · `? docs/wired-printing-investigation-report.md`

### ANYTHING ELSE
Nothing — every one of the 130 entries is above. Two stale detached worktrees under
`/private/var/folders/…/slot-head-dots-*`, from an earlier dots-harness run, remain in `git worktree list`; they
are outside the working tree and untouched.
