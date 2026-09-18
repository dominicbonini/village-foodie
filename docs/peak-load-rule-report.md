# Engine: the batch is judged by the PEAK in the oven, not the sum of batches touching a window

**Date:** 18 September 2026 · Engine change, one symbol · Localhost only; nothing deployed, nothing committed,
nothing staged.
**Files changed:** `lib/slot-availability.ts` (`categoryLoadOver` only), `scripts/peak-load-rule.cjs` (new),
`scripts/harnesses.json` (registers it), `scripts/dot-overlap-labels.cjs`, `scripts/batch-rolling-identity.cjs`,
`scripts/batch-reservation-instants.cjs` (the last three: broken variants re-cut to reach the new code, and
sum-era numbers re-targeted to the peak — every one listed in §5).
**Scripts run:** `node scripts/run-harnesses.cjs`; `scripts/batch-rolling-identity.cjs`,
`scripts/batch-reservation-golden-on.cjs`, `scripts/batch-rolling-check.cjs`, `scripts/dot-overlap-labels.cjs`,
`scripts/peak-load-rule.cjs` by name. `scripts/` was never globbed; **no golden generator was run — none was
needed (§6)**. No live truck's token, device id, page, route or API was touched; nothing was created, edited,
cancelled or deleted for any truck. No database was read or written this task: Dominic's board is the fixture
already recorded in `docs/dot-label-red-total-report.md` §1 plus order #21.

**No span of the prompt arrived garbled, and no instruction contradicted another.** One consequence of the
protected paths is reported rather than fixed (§4, §10): with a kitchen cap set, the ceiling's own reads still
sum, and I was told not to change them.

---

## STEP 0 — `git status`

**Before:** branch `main`, up to date with `origin/main`, **37 modified, 93 untracked, 0 staged** (130 entries).
**After:** **37 modified, 95 untracked, 0 staged** (132 entries) — the same listing plus `scripts/peak-load-rule.cjs`
and this report. Full grouped listing in §11. `git add -A` / `git add .` were not run; nothing staged, committed,
stashed, reset or restored.

---

## 1. The change, by symbol — `categoryLoadOver` (lib/slot-availability.ts)

**Old — the sum of every batch overlapping the span:**
```ts
export function categoryLoadOver(intervals: CookInterval[], cat: string, fromMins: number, toMins: number): number {
  let load = 0
  for (const iv of intervals) {
    if (iv.cat !== cat || iv.items <= 0) continue
    if (iv.endMins <= iv.startMins) continue                       // a point is never a batch
    if (iv.startMins < toMins && fromMins < iv.endMins) load += iv.items   // half-open overlap
  }
  return load
}
```

**New — the peak concurrent load at any instant of the span:**
```ts
export function categoryLoadOver(intervals: CookInterval[], cat: string, fromMins: number, toMins: number): number {
  if (toMins <= fromMins) return 0
  const batches: CookInterval[] = []
  for (const iv of intervals) {
    if (iv.cat !== cat || iv.items <= 0) continue
    if (iv.endMins <= iv.startMins) continue                       // a point is never a batch
    if (iv.startMins < toMins && fromMins < iv.endMins) batches.push(iv)   // half-open overlap
  }
  // The load only rises where a batch STARTS, so the peak over [fromMins, toMins) is attained at
  // fromMins or at an overlapping batch's start inside the span — those are the only instants read.
  let peak = 0
  for (const at of [fromMins, ...batches.map(b => b.startMins)]) {
    if (at < fromMins || at >= toMins) continue
    let n = 0
    for (const b of batches) if (b.startMins <= at && at < b.endMins) n += b.items
    if (n > peak) peak = n
  }
  return peak
}
```

Half-open throughout: the overlap filter is unchanged, and at an instant `t` a batch counts iff
`startMins ≤ t < endMins`, so a batch ending at `t` has left and one starting at `t` is in — touching batches never
share an instant. The load is piecewise constant and rises only at a batch start, so reading `fromMins` and every
overlapping batch's start inside the span is exact.

**Every reader gets the one number through its existing call, none of which changed:**

| Reader | Call site | What it now reads |
|---|---|---|
| Admission, switch ON | `reserveBatches` → `existing = categoryLoadOver(intervals, cat, ws, ws + P)` | the peak already in each of the order's `ceil(items/batch)` windows |
| Admission, switch OFF | `fitOrderBackward`'s per-window branch → `existing = categoryLoadOver(back.intervals, cat, ws, ws + prep)` | same |
| Window tone / `remainingByCat` / `bound_by` | `projectBackwardOccupancy`'s window builder | `batch − peak`, so the tone, the label (`tonesNumber`) and `detectCapacityBreaches` (`remainingByCat < −EPS`) all read it |
| Dot rolling read | `dotOccupancyAt` → `perCat[cat].used` | the peak over `[T − prep, T)` |

**Untouched, as instructed:** `windowScopedPeak` / `concurrencyAt` (the kitchen ceiling's sweep-line),
`kitchenLoadOver` and `reserveBatches`' per-window kitchen total (the ceiling's own reads), nearest-first
placement, the `ceil(items / batch)` window count, the switch-OFF branch, `coverDotWindows`, the pile.

## 2. The four expected consequences — measured (`scripts/peak-load-rule.cjs`)

**(1) 4 @22:10 + 4 @22:25, prep 15 / batch 8 / 5-minute grid — a 1-pizza order at 22:15 now FITS.**
Batches 21:55–22:10 and 22:10–22:25 are back to back; the span [22:00, 22:15) peaks at 4.
`22:15 🟡 "4 Pizzas" · 1 fits? true` — switch ON and OFF. Under the sum (restored as variant V1): `🔴 "8 Pizzas" ·
fits? false`.

**(2) Dominic's board (5 @22:10, 8 @22:25) — 22:15 stays RED, a 1-pizza order is refused, the label reads 8.**
A pizza for 22:15 would cook 22:00–22:15 alongside the 8-batch from 22:10. `22:15 🔴 "8 Pizzas" · fits? false`,
`22:20 🔴 "8 Pizzas" · fits? false`, and `22:10 🟡 "6 Pizzas" · fits? true` (5 + the 1 @22:00 share 21:55–22:00).
Switch ON and OFF.

**(3) Admission is a SUPERSET.** 2,520 seeded states over 36 shapes (preps 5/10/15, batches 2/4/8, grids
5/10/15, two cooking categories + an instant one, kc null / 9, the pre-open run-up); at every step the SAME state
(built by the old rule's own admissions) and the same candidate are judged by both engines:
**1,742 candidates the sum accepted — 0 refused by the peak; 2 the sum refused now fit.** (Peak ≤ sum by
construction, so free space can only grow.)

**(4) ALIGNED setups are byte-identical.** Where the grid is a whole multiple of every cooking prep, every batch
overlapping `[start, start + prep)` starts at `start`, so peak = sum:
- `scripts/peak-load-rule.cjs`: 522 (window, category) reads on aligned states — peak == sum in 522, differ 0.
- `scripts/dot-overlap-labels.cjs`: 1,200 seeded aligned states (grids 5/10/15/20/30, preps dividing the grid,
  instants + ceilings, ON/OFF) — dots and `/api/slots` tones **0 differ**; Gusto-shaped (300) + aligned240 (240)
  + Gusto's six live events — **546 fixtures, 0 dots differ**.
- `scripts/batch-rolling-identity.cjs` (§31 examples, 300 + 20,000 + 240 seeded aligned cases, Gusto's six events)
  and `scripts/batch-reservation-golden-on.cjs` (854 fixtures): **0 differ from the committed goldens** (§6).

## 3. Instant safety — the physical rule holds after every admission

Same sweep: after each of the **1,744 admissions under the peak rule**, every minute from 30 before the open to
the close was read from the projected intervals — **367,984 minute-checks, 0 minutes with more than the batch of
a category cooking or more than the cap in total.**

**One number, every reader:** 1,396 (window, category) reads — `categoryLoadOver` == `batch − remainingByCat` (the
tone) == `reserveBatches`' `existing` (admission) == the dot's labelled number: **0 disagree**; 69 breach entries
whose reason names "n/batch": **0 disagree** with that window's number.

## 4. What else the peak changes, honestly

- **Dominic's own board, earlier times.** 21:45–21:55 read `🔴 12 Pizzas` (at 21:40 the 8 + 2 + 2 cook together —
  the sum said 12 / 13 / 13); **22:00 becomes `🟡 6 Pizzas`** (by 21:55 both 2s have left: 1 + 5), where the sum's
  10 said red; 22:05 and 22:10 read `🟡 6 Pizzas`. A 2-pizza order fits at 22:00 now (6 + 2 = 8).
- **The six breach warnings on his board become five** (§8).
- **Dominic's first case** (8 @17:00, 1 @17:15): 17:05 and 17:10 read `🔴 8 Pizzas`, not 9 — the 1 cooks
  17:00–17:15, after the 8. Still red (8 is the batch); the 9-pizza verdicts are unchanged.
- **A ceiling-red dot can carry a category peak below the cap.** With a kitchen cap set, `kitchenLoadOver` (ON:
  overlapping sum) and `reserveBatches`' per-window kitchen total still SUM — the ceiling's own path, which I was
  told not to change. So a 10-minute-prep truck with kc 6 can show `🔴 5 Pizzas` at a time the ceiling's sum makes
  red (1 dot in 400 seeded 5-minute states; 1 in 200 10-minute states — both listed by the harness as ℹ lines).
  Display still equals picker there (both sum), but it is the same over-count you just retired for the batch.
  **Decision needed (§10).**

## 5. Every harness — failure mode, broken variants FIRST, real result

### `scripts/peak-load-rule.cjs` — NEW
**Failure mode:** the batch judged by the sum of batches touching a window, so back-to-back batches count
together — 13 "on the grill" when 8 are; a single pizza refused when only 5 would ever cook at once.

| | Broken variant | Result |
|---|---|---|
| V1 | the old SUM restored | ✓ FAILED: 4 + 4 → `22:15 🔴 "8 Pizzas" · 1 fits? false` |
| V2 | closed-left overlap (filter AND the instant test) | ✓ FAILED: 8 @22:25 then 1 at 22:40 (touching) → `22:40 🔴 "8 Pizzas" · fits? false` |
| V3 | peak for the tone, SUM for admission | ✓ FAILED: 4 + 4 → `22:15 🟡 "4 Pizzas" · fits? false` — amber dot, refused ⇒ DISPLAY ≠ PICKER |

Real result: the two named cases (ON and OFF), 2,520 states / 1,744 admissions / 367,984 minute-checks / 0
violations, 1,742 → 0 lost, 1,396 reads + 69 breaches agreeing, 522 aligned reads peak == sum. ✅ rc 0.

### `scripts/dot-overlap-labels.cjs` — re-targeted
Broken variants V1–V10 all still FAIL first; **V5 (closed-left) and V10 re-cut**: V5 now patches both the overlap
filter and the peak's instant test (the filter alone no longer bites — a batch ending at the instant is rejected
by `at < b.endMins`); V10's "must be 13" is "must be 12". **Re-targeted from sum to peak** (each a real change, none
weakened): `EXPECT` 17:05/17:10 `9 → 8`; the 2-pizza and 9-pizza red lines `9 → 8`; `BOARD_EXPECT` 21:50/21:55
`13 → 12`, 22:00 `🔴 10 → 🟡 6`, 22:05 `🔴 8 → 🟡 6`; "21:55 reads 9" → 8. The **invariant sweep** now distinguishes
red-by-batch (label ≥ batch: 2,659 + 684 dots, **0 below**) from red-by-ceiling (350 + 97 dots, reported as ℹ with
the 1 + 1 below-cap cases of §4). AGREEMENT 2,200 states 0 disagree; ALIGNED 1,200 + 546 0 differ. ✅ rc 0.

### `scripts/batch-rolling-identity.cjs` — variant re-cut
V1 (closed-left) patches the filter and the instant test; before the re-cut it PASSED against the golden (proved
nothing). Now ✓ FAILED as required; every golden family 0 differ. ✅ rc 0.

### `scripts/batch-reservation-instants.cjs` — needle followed the line
Its V1 patches the overlap filter (`fromMins + 5 < iv.endMins`); the needle now targets `batches.push(iv)`. Still
✓ FAILED as required (minute-violations appear); real run 0 violations. ✅ rc 0.

`scripts/batch-reservation-golden-on.cjs`, `scripts/batch-rolling-check.cjs`, `scripts/customer-path-identity.cjs`,
`scripts/sixteen-pizza-admission.cjs`, `scripts/batch-reservation-p3-worked-case.cjs` and the rest: **unchanged and
passing** on the first sweep under the peak.

## 6. The golden outcome — both identity harnesses run first, nothing regenerated

| Harness | Golden | Result |
|---|---|---|
| `scripts/batch-rolling-identity.cjs` | `batch-rolling-golden.json` | §31 examples, 300 + 20,000 + 240 seeded aligned cases, Gusto's six live events: **0 differ** |
| `scripts/batch-reservation-golden-on.cjs` | `batch-reservation-golden-on.json` | 8 + 300 + 240 + 6 + 300 fixtures (with and without reservations): **0 differ — "the ON baseline holds"** |
| `scripts/batch-rolling-check.cjs` | recorded misaligned verdicts | 480 + 270 recorded verdicts 0 differ; every misaligned assertion still holds under the peak |

**Both pass unchanged, so nothing was changed.** `batch-rolling-golden.json` sha256 `8bdae817748ad334…`,
`batch-reservation-golden-on.json` sha256 `ce5550b7ee2a42ce…` — before and after. The goldens' misaligned
families happen not to contain back-to-back batches that touch one span, which is the only shape the peak moves.

## 7. Verification

| Check | Result |
|---|---|
| `node scripts/run-harnesses.cjs` | **49 run · 49 passed · 0 failed — true exit code 0** (48 + `peak-load-rule.cjs`) |
| `npx tsc --noEmit` | **true exit code 0** |
| `npx next build` | "Compiled successfully in 5.0s", **true exit code 0** |
| eslint, `lib/slot-availability.ts`, vs a clean HEAD worktree | `@typescript-eslint/no-unused-vars` warn **1 → 0** (carried from earlier work); no rule count rose; 0 errors both sides |
| goldens | both hashes unchanged (§6) |

## 8. Dominic's six breach warnings, after

`detectCapacityBreaches` on the board (switch ON and OFF identical):

| time | before (sum) | **after (peak)** | why |
|---|---|---|---|
| 20:55 | `Pizza 12/8` | `Pizza 12/8` | #10's two windows of 8 overlap #11's fresh seating — 12 at once, a real breach |
| 21:05 | `Pizza 14/8` | `Pizza 12/8` | the sum counted a batch that had already left |
| 21:45 | `Pizza 12/8` | `Pizza 12/8` | 8 + 2 + 2 cook together at 21:40 |
| 21:50 | `Pizza 13/8` | `Pizza 12/8` | the 1 @22:00 starts at 21:45, after the 8 has left |
| 21:55 | `Pizza 13/8` | `Pizza 12/8` | same |
| 22:00 | `Pizza 10/8` | **gone** | by 21:55 the two 2s have left: 1 + 5 = 6, under the batch |

Five remain, and every one is a genuine moment with 12 in an 8-batch oven — the orders admitted at batch 2 /
prep 5 before the settings changed.

## 9. Localhost test script — test-truck (Pizza Kitchen), switch ON

**A · the 4 + 4 case is now bookable.** Open a fresh test-truck event (5-minute customer grid, Pizza prep 15 /
batch 8, no kitchen capacity). Add Order: 4 pizzas at **22:10**, then 4 at **22:25**. Now put 1 pizza in the
basket and open the time list: **22:15 reads `🟡 4 Pizzas`** with no verdict, and Confirm takes it. (Yesterday it
read `🔴 8 Pizzas` and refused.) 22:10 and 22:25 read `🟡 4 Pizzas`; 22:40 is green.

**B · your own board, 22:15.** On the 17 September event as it stands: with 1 pizza in the basket **22:15 reads
`🔴 8 Pizzas`** and is not offered — the 8-batch for 22:25 is in the oven from 22:10. 22:10 reads `🟡 6 Pizzas`
and takes it. Earlier: 21:45–21:55 `🔴 12 Pizzas`, 22:00 `🟡 6 Pizzas`. The Orders tab's breach banner lists five
times, all `Pizza 12/8` (§8).

**C · nothing changes on a 15-minute grid.** Set Customer Collection Times to every 15 minutes on any test-truck
event and place 8 pizzas at 18:30 and 8 at 19:00: each listed time is its own batch, back to back, and reads
exactly as before (`18:30 🔴 8 Pizzas`, `19:00 🔴 8 Pizzas`, the rest green). Gusto (prep 5 on 5) is the same
shape — nothing to open; nothing was opened.

## 10. Manual sections made stale — NOT edited

- **§31 "The two ceilings"** (`docs/reference-manual.md` line 15581): *"Every rolling cooking window … is
  constrained by BOTH"* and *"1. Batch (per-category): max of ONE category per window"* describe the batch as a
  per-**window** limit. It is now a per-**instant** limit: *at no instant may more than `batch` items of a category
  be cooking; batches that merely touch do not overlap.* The example line *"pizza batch 2 = max 2 pizzas cooking at
  once"* already says the right thing.
- **`docs/batch-rolling-fix-report.md` "The two ceilings" (proposed §31 text, line 336):** *"the existing load is
  the sum of every existing batch of C that overlaps `[S, S+prep)`"* — superseded: it is the peak. That report's
  "two half-overlapping full batches read 16/8" example still holds (they overlap at an instant); its 13-style sums
  of back-to-back batches do not.
- **The kitchen ceiling** is described in §31 as *"max TOTAL items of any kind per window"*; its own path already
  reads a sweep-line peak for admission, but `kitchenLoadOver`'s ON branch and `reserveBatches`' per-window total
  still sum (§4). If you want the peak there too, that is a second, separate change to the protected paths.

## 11. Anything I could not establish

- **Whether you want the ceiling's own reads on the peak as well** (§4). Left as is by your instruction; the
  harness reports the affected dots as ℹ lines so the count is visible on every run (1 + 1 today).
- **Whether the two goldens should gain a back-to-back fixture.** Neither golden family contains the shape the peak
  changes, which is why both pass unchanged — and also why they cannot catch a regression to the sum.
  `scripts/peak-load-rule.cjs` V1 does, without a golden. Adding one is a generator run and is yours to call.
- **The stale batch-2 / prep-5 reservation records** on orders 11–20 (`docs/dot-label-red-total-report.md` §9) are
  unchanged; the engine discards them and seats afresh, so §8's warnings come from fresh seating.

## 12. Every modified and untracked path (132 entries, 0 staged), grouped

### COLLECTION TIMES + CAPACITY + ADD ORDER + RESERVATIONS
`M app/api/dashboard/action/route.ts` · `M app/api/dashboard/route.ts` · `M app/api/events/route.ts` · `M app/api/manage/route.ts` · `M app/api/menu/[truckId]/route.ts` · `M app/api/orders/submit/route.ts` · `M app/api/slots/[truckId]/route.ts` · `M app/dashboard/[token]/page.tsx` · `M app/manage/[token]/page.tsx` · `M app/trucks/[slug]/order/page.tsx` · `M components/dashboard/AddOrderPanel.tsx` · `M components/dashboard/CapacityBreachBanner.tsx` · `M lib/capacity-breach.ts` · `M lib/features.ts` · `M lib/orders/place-in-slot.ts` · `M lib/payments/promote-draft.ts` · **`M lib/slot-availability.ts`** (this task) · `M lib/slot-bookings.ts` · `M lib/slot-display.ts` · `M lib/slot-generation.ts` · `M lib/supabase.ts` · `? lib/capacity-refresh.ts` · `? lib/orders/cooking-reservation.ts` · `? lib/slot-fit-message.ts` · `? lib/slot-interval.ts`

### WIRED PRINTING (app, native, plugin)
`M android/app/capacitor.build.gradle` · `M android/capacitor.settings.gradle` · `M components/printing/PrintingSettings.tsx` · `M ios/App/App/Info.plist` · `M ios/App/CapApp-SPM/Package.swift` · `M lib/printing/bleTransport.ts` · `M lib/printing/transport.ts` · `M lib/printing/usePrinting.ts` · `M package-lock.json` · `M package.json` · `? app/api/printing/route.ts` · `? components/printing/PrinterTypeChoice.tsx` · `? lib/printing/netAddress.ts` · `? lib/printing/netTransport.ts` · `? lib/printing/networkGuard.ts` · `? lib/printing/testTicket.ts` · `? plugins/hatchgrab-net-printer/{Package.swift, index.d.ts, index.js, package.json, android/build.gradle, android/src/main/AndroidManifest.xml, android/src/main/java/com/hatchgrab/netprinter/NetPrinterPlugin.java, ios/Sources/NetPrinterPlugin/NetPrinterPlugin.swift}` — ⚠️ plus 34 untracked, **not ignored** build files under `plugins/hatchgrab-net-printer/android/build/…` and `plugins/hatchgrab-net-printer/.swiftpm/xcode/xcuserdata/…/xcschememanagement.plist`; a `.gitignore` entry (`plugins/**/build/`, `**/xcuserdata/`) remains proposed, not done.

### HOLD (landing, plan-features, store listing copy)
`M app/landing/page.tsx` · `M content/store-listing.md` · `M lib/plan-features.ts`

### MIGRATIONS (all five APPLIED by hand; the files are untracked)
`? supabase/migrations/20260916_collection_intervals.sql` · `? …/20260917_van_collection_intervals.sql` · `? …/20260918_event_collection_intervals.sql` · `? …/20260919_van_network_printer.sql` · `? …/20260920_orders_cooking_reservation.sql`

### INCIDENT SAFEGUARDS
`M scripts/migrate-from-sheets.cjs` · `M scripts/register-payment-domain.cjs` · **`? scripts/harnesses.json`** (49 listed) · `? scripts/run-harnesses.cjs` · `? scripts/ops-write-guard.cjs`

### HARNESSES + FIXTURES
`M scripts/whatsapp-golive-parity-harness.cjs` · `? scripts/_batch-reservation-golden-on-generate.cjs` · `? scripts/_batch-reservation-sim.cjs` · `? scripts/_batch-rolling-golden-generate.cjs` · `? scripts/_batch-rolling-snapshot.cjs` · `? scripts/_mini-dom.cjs` · `? scripts/_printing-mocks.cjs` · `? scripts/_slot-interval-compile.cjs` · `? scripts/add-order-fit-message.cjs` · `? scripts/add-order-refresh.cjs` · `? scripts/add-order-render.cjs` · `? scripts/batch-reservation-display-equals-picker.cjs` · `? scripts/batch-reservation-edit-lock.cjs` · `? scripts/batch-reservation-golden-on.cjs` · `? scripts/batch-reservation-helper.cjs` · `? scripts/batch-reservation-immutability.cjs` · **`? scripts/batch-reservation-instants.cjs`** · `? scripts/batch-reservation-lock.cjs` · `? scripts/batch-reservation-p2-identity.cjs` · `? scripts/batch-reservation-p3-worked-case.cjs` · `? scripts/batch-reservation-switch.cjs` · `? scripts/batch-reservation-writers.cjs` · `? scripts/batch-rolling-check.cjs` · **`? scripts/batch-rolling-identity.cjs`** · `? scripts/collection-times-hint.cjs` · `? scripts/customer-path-identity.cjs` · `? scripts/dev-virtual-printer.cjs` · **`? scripts/dot-overlap-labels.cjs`** · `? scripts/fixtures/{batch-reservation-golden-on.json, batch-rolling-fix.patch, batch-rolling-golden.json}` (unchanged) · **`? scripts/peak-load-rule.cjs`** (new) · `? scripts/printing-copy.cjs` · `? scripts/printing-dedupe.cjs` · `? scripts/printing-escpos-identity.cjs` · `? scripts/printing-failure-split.cjs` · `? scripts/printing-gating.cjs` · `? scripts/printing-network-guard.cjs` · `? scripts/printing-transport-contract.cjs` · `? scripts/sixteen-pizza-admission.cjs` · `? scripts/slot-interval-dots.cjs` · `? scripts/slot-interval-engine-identity.cjs` · `? scripts/slot-interval-event-override.cjs` · `? scripts/slot-interval-generator.cjs` · `? scripts/slot-interval-grid-routing.cjs` · `? scripts/slot-interval-settings.cjs` · `? scripts/slot-interval-van-list-tolerance.cjs` · `? scripts/slot-interval-van-resolution.cjs`

### DOCS
`? docs/add-order-fit-message-report.md` · `? docs/add-order-render-fix-report.md` · `? docs/batch-keep-together-investigation-report.md` · `? docs/batch-overlap-review-report.md` · `? docs/batch-reservation-investigation-report.md` · `? docs/batch-reservation-p0-p2-report.md` · `? docs/batch-reservation-p3-report.md` · `? docs/batch-rolling-durable-harness-report.md` · `? docs/batch-rolling-fix-report.md` · `? docs/batch-split-review-report.md` · `? docs/dashboard-order-and-batch-overlap-report.md` · `? docs/discovery-incident-followup-report.md` · `? docs/discovery-upsert-incident-report.md` · `? docs/dot-label-cooking-counts-report.md` · `? docs/dot-label-full-only-report.md` · `? docs/dot-label-overlap-counts-report.md` · `? docs/dot-label-red-total-report.md` · `? docs/dot-label-wont-fit-report.md` · `? docs/dot-overlap-labels-report.md` · `? docs/edit-busy-fix-report.md` · `? docs/edit-lock-and-refresh-report.md` · `? docs/gusto-event-update-trace-report.md` · **`? docs/peak-load-rule-report.md`** (this file) · `? docs/sixteen-pizza-bug-report.md` · `? docs/slot-interval-build-report.md` · `? docs/slot-interval-event-override-report.md` · `? docs/slot-interval-hardening-report.md` · `? docs/slot-interval-van-level-report.md` · `? docs/wired-printing-build-report.md` · `? docs/wired-printing-followup-report.md` · `? docs/wired-printing-investigation-report.md`

### ANYTHING ELSE
Nothing — every one of the 132 entries is above. Two stale detached worktrees under
`/private/var/folders/…/slot-head-dots-*`, from an earlier dots-harness run, remain in `git worktree list`; they
are outside the working tree and untouched.
