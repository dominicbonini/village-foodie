# Engine: the kitchen ceiling is judged by the PEAK in the kitchen — one implementation for every reader

**Date:** 18 September 2026 · Engine change · Localhost only; nothing deployed, nothing committed, nothing staged.
**Files changed:** `lib/slot-availability.ts`; `scripts/peak-ceiling-rule.cjs` (new) + `scripts/harnesses.json`
(registers it); `scripts/peak-load-rule.cjs`, `scripts/dot-overlap-labels.cjs`, `scripts/batch-rolling-identity.cjs`,
`scripts/batch-reservation-instants.cjs` (broken variants re-anchored to the shared code — §5);
`scripts/slot-interval-engine-identity.cjs` (`windowScopedPeak` re-scoped from byte- to output-identity — §5).
**Scripts run:** `node scripts/run-harnesses.cjs`; by name: `batch-rolling-identity.cjs`, `batch-reservation-golden-on.cjs`,
`batch-rolling-check.cjs`, `batch-reservation-instants.cjs`, `dot-overlap-labels.cjs`, `peak-load-rule.cjs`,
`peak-ceiling-rule.cjs`, `slot-interval-dots.cjs`, `slot-interval-engine-identity.cjs`. `scripts/` was never globbed;
**no golden generator was run — none was needed (§6)**. No live truck was touched in any way; no database was read or
written this task (every figure is a fixture through the compiled engine).

**No span of the prompt arrived garbled, and no instruction contradicted another.** One tension surfaced and is
resolved by measurement, not by choice (§4, aligned identity on mixed-prep grids): the final code is byte-identical
there too.

---

## STEP 0 — `git status`

**Before:** branch `main`, up to date with `origin/main`, **37 modified, 95 untracked, 0 staged** (132 entries).
**After:** **37 modified, 97 untracked, 0 staged** (134 entries) — the same listing plus `scripts/peak-ceiling-rule.cjs`
and this report. Full grouped listing in §11. `git add -A` / `git add .` were not run; nothing staged, committed,
stashed, reset or restored.

---

## 1. The change, by symbol

### `peakLoadOver` — NEW, the one implementation
```ts
export function peakLoadOver(intervals: CookInterval[], fromMins: number, toMins: number, includePointsInside: boolean): number {
  if (toMins <= fromMins) return 0
  const instants = new Set<number>([fromMins])
  for (const iv of intervals) {
    if (iv.items <= 0) continue
    if (iv.startMins <= fromMins || iv.startMins >= toMins) continue
    if (iv.endMins > iv.startMins || includePointsInside) instants.add(iv.startMins)
  }
  let peak = 0
  for (const t of instants) { const c = concurrencyAt(intervals, t); if (c > peak) peak = c }
  return peak
}
```
The most counted items present at any one instant of `[fromMins, toMins)`. Membership is `concurrencyAt`'s —
reals cover `[start, end)`, a zero-width point hits only its own instant — so it is half-open throughout and
touching batches never share an instant. The load is piecewise constant and rises only where something starts,
so `fromMins` and every start inside the span are the only instants read.

### `categoryLoadOver` — now a category filter over `peakLoadOver`
Old (yesterday): its own instant loop over the category's batches. New:
```ts
  const batches: CookInterval[] = []
  for (const iv of intervals) { if (iv.cat !== cat || iv.items <= 0) continue; if (iv.endMins <= iv.startMins) continue; batches.push(iv) }
  return peakLoadOver(batches, fromMins, toMins, false)
```
Same number as yesterday (there are no points in a category's batches); one implementation.

### `kitchenLoadOver` — the dot's kitchen read, both switch states
**Old:** switch ON — `total += iv.items` for every real interval overlapping the span (a SUM); switch OFF — the
peak at the span's start and every cooking start inside. **New:**
```ts
function kitchenLoadOver(intervals: CookInterval[], fromMins: number, toMins: number): number {
  return peakLoadOver(intervals, fromMins, toMins, false)
}
```
The `batchReservations` parameter is gone from it (its caller `dotOccupancyAt` keeps its own for positional callers).

### `reserveBatches` — the per-window kitchen total (admission, switch ON)
**Old:** `let total = 0; for (const iv of intervals) if (real && iv.startMins < ws + P && ws < iv.endMins) total += iv.items`
— a SUM of reals, instants ignored. **New:**
```ts
      const total = peakLoadOver(intervals, ws, ws + P, true)
      free = Math.min(free, kitchenCapacity - total)
```
Nearest-first placement, the `ceil(items / batch)` window count and the switch-OFF branch are untouched.

### `projectBackwardOccupancy`'s window builder — the window's own ceiling read
**Old:** `const conc = concurrencyAt(intervals, startMins)` — the concurrency at the window's START instant alone,
which a batch starting inside the span slipped past. **New:**
```ts
      let spanMins = 0
      for (const cat of Object.keys(byCat)) if (batchByCat[cat] != null) spanMins = Math.max(spanMins, prepByCat[cat] ?? step)
      const conc = spanMins > 0 ? peakLoadOver(intervals, startMins, startMins + spanMins, false) : concurrencyAt(intervals, startMins)
      const atStart = concurrencyAt(intervals, startMins)
      …  total: atStart,  remainingTotal: kitchenCapacity == null ? Infinity : kitchenCapacity - conc,
```
`tone` ('global ceiling') and `remainingTotal` — which the breach detector and `/api/slots` read — use the span
peak. `total` keeps today's start-instant value: it is only the cover's tie-break (`coverDotWindows` picks the
"peak" window by it on a 10–30 grid) and `/api/slots`' `current`; keeping it is what leaves a mixed-prep aligned
grid's cover label byte-identical (§4). An instant-only window (keyed at `deadline − capacityStep`, holding
zero-width points) has no span and reads its instant exactly as before.

### `windowScopedPeak` — does the sweep-line duplicate the new code? Yes; it now IS the new code
The old body evaluated, for each focus (order) interval, its start; for each order cooking span, every start of
any interval inside it (points included); then `concurrencyAt` at each. That is exactly `peakLoadOver(all, oS, oE,
true)` per cooking span, plus `concurrencyAt` at each of the order's own instant points:
```ts
function windowScopedPeak(allIntervals: CookInterval[], focus: CookInterval[]): number {
  let peak = 0; let any = false
  for (const f of focus) {
    if (f.items <= 0) continue; any = true
    const c = f.endMins > f.startMins ? peakLoadOver(allIntervals, f.startMins, f.endMins, true) : concurrencyAt(allIntervals, f.startMins)
    if (c > peak) peak = c
  }
  return any ? peak : 0
}
```
**What it counts is unchanged**, proven: `scripts/peak-ceiling-rule.cjs` compiles the old body verbatim and
compares **21,520 verdicts** (fits, tone, bound_by, why) on states with instants and caps 2–8 — **0 differ**.
`concurrencyAt` and `maxConcurrentCount` are untouched.

### How instant (no-prep, ticked) items enter the peak
Exactly as today. `placeInstantPoints` is byte-identical (the engine-identity harness still asserts it) and still
seats a new order's ticked items as zero-width points, capacity-step-spaced, taking only the headroom left. In a
peak, a point counts at its own instant through `concurrencyAt` (`iv.startMins === t`). Which instants a span
evaluates is the one place the readers differ, deliberately:
- **Display and breach** (`kitchenLoadOver`, the window's `conc`): `includePointsInside = false` — a point counts
  at the span's start and at cooking starts, exactly as today's window read counted it; a point strictly inside a
  span at no cooking start is read by the window it keys (the capacity step), as before. This is what keeps an
  aligned grid byte-identical.
- **Admission** (`reserveBatches`, `windowScopedPeak`): `includePointsInside = true` — every instant the order's
  span covers. `windowScopedPeak` always did this; `reserveBatches` used to ignore points entirely, so it now sees
  them too, which can only tighten toward the verdict `windowScopedPeak` already gave. The harness counts the
  windows where the two reads differ: **189 of 1,614**, all with a point strictly inside at no cooking start —
  today's documented residual, unchanged in kind.

## 2. The four expected consequences — measured (`scripts/peak-ceiling-rule.cjs`)

**(1) The §10 case.** Prep 10 / batch 8 / cap 6 / 5-minute grid; 5 pizzas cooking 18:20–18:30, 4 cooking 18:30–18:40.
`18:35 🟡 "5 Pizzas" · kitchen 5/6 · 1 fits? true` (switch ON and OFF). The sum said `🔴 "5 Pizzas" · kitchen 9/6 ·
refused`. Two pizzas there are still refused (5 + 2 > 6).

**(2) Admission is a SUPERSET.** 2,592 seeded states over 72 shapes (caps 2/4/6/8, preps 5/10/15, grids 5/10/15,
two cooking categories + an instant one, the pre-open run-up); the same state (built by the sum ceiling's own
admissions) and the same candidate judged by both engines: **1,887 candidates the sum ceiling accepted — 0 refused
now; 1 it refused now fits.**

**(3) The ceiling's number is one number.** 1,614 windows with a cap: the tone's ceiling number (`kc −
remainingTotal`) == `peakLoadOver` over the window's span == the dot's `kitchen.used`: **0 disagree**; 557 ceiling
breach entries: `over_total` is that number minus the cap: **0 disagree**; 38 single-category dots red BY THE
CEILING: the label's number == the ceiling peak: **0 disagree**. (A multi-category window's label lists each
category's own peak; their sum can exceed the kitchen peak when the categories peak at different instants — the
harness's ℹ line records it.)

**(4) ALIGNED setups are byte-identical.** Against a compiled copy of the sum-ceiling tree, 116 aligned states —
84 single-prep (Gusto's shapes) and **32 mixed-prep** (prep 5 and 15 on a 15-minute grid) × ON/OFF: **dots differ
0 · one-pizza verdicts differ 0 · `/api/slots` (available, tone, remaining) differ 0 · breaches differ 0.** 466
single-prep aligned windows: the span peak == today's start-instant concurrency in all 466. 600 Gusto-shaped
states: dots and verdicts identical. Plus the standing proofs: `dot-overlap-labels` 1,200 seeded aligned states 0
differ, 546 golden fixtures 0 differ; both goldens unchanged (§6).

## 3. Instant safety — the physical rule holds after every admission

1,888 admissions under the peak ceiling, **398,368 minute-checks with points counted at their instant: 0 minutes
over a batch or the cap.** `batch-reservation-instants.cjs` (its own 600-sequence sweep) also passes: 0 violations.

## 4. What the measurement changed on the way — reported, not hidden

- **`window.total` first followed the span peak.** That changed 10 dot LABELS (no tones, no verdicts, no breaches)
  on the mixed-prep aligned shape: `coverDotWindows` chooses its "peak" window by `total`, and a burger window that
  now saw a pizza batch start inside its span became the chosen one ("peak 5 Burgers" for "peak 2 Pizzas"). Old
  and new dots both agreed with the picker in all 10. Keeping `total` at today's start-instant read (the cover's
  tie-break only) while the ceiling itself reads the span peak restored byte-identity: the harness now measures
  **0** differences on those 32 mixed-prep states.
- **Instant-only windows** (keyed at the capacity step, on a truck whose capacity window is not its prep — the
  dots harness's "test-truck shape cw 10") briefly read a capacity-step span and turned red where HEAD did not.
  A point occupies its instant, not a span; the window now reads `concurrencyAt(startMins)` as before, and
  `slot-interval-dots.cjs` passes against HEAD again on all 68 interval-5 cases.
- **A dot red by the ceiling on a mixed-prep misaligned grid** lists each category's own peak (§2.3) — reported in
  `dot-overlap-labels.cjs` as an ℹ count (0 in 400 5-minute states; 1 in 200 10-minute states, and that one is the
  §31 event-start pile made red by a pre-open window over the ceiling, showing its own piled count).

## 5. Every harness — failure mode, broken variants FIRST, real result

### `scripts/peak-ceiling-rule.cjs` — NEW
**Failure mode:** the ceiling judged by the sum of batches touching a span — a kitchen "at 9" that never held more
than 5; one more pizza refused; the dot red while the picker would have taken it.

| | Broken variant | Result |
|---|---|---|
| V1 | the old ceiling SUM restored (dot read, window read, admission) | ✓ FAILED: §10 → `18:35 🔴 "5 Pizzas" · kitchen 9/6 · refused` |
| V2 | closed-left overlap in the one membership test | ✓ FAILED: 6 @18:25 (cap 6) then 1 at 18:40, touching → `🔴 kitchen 6/6 · refused` |
| V3 | PEAK for the ceiling tone, SUM for ceiling admission | ✓ FAILED: §10 → `🟡 "5 Pizzas" · kitchen 5/6 · refused` — DISPLAY ≠ PICKER |

Real result: the §10 case (ON/OFF, 1 fits, 2 refused); `windowScopedPeak` old vs new 21,520 verdicts 0 differ;
2,592 states / 1,888 admissions / 398,368 minute-checks / 0 violations; SUPERSET 1,887 → 0 lost; one-number checks
1,614 + 557 + 38 with 0 disagreements; 466 single-prep aligned windows 0 differ; 116 aligned states vs the old
tree 0 differ in dots/verdicts/`/api/slots`/breaches; 600 Gusto-shaped states identical. ✅ rc 0.

### Re-anchored broken variants (same semantics, new text) — all still FAIL first
- `scripts/peak-load-rule.cjs`: V1 (sum restored) now patches `categoryLoadOver`'s `return peakLoadOver(…)`; V2
  (closed-left) patches `concurrencyAt`'s `t < iv.endMins`. Real run unchanged: ✅.
- `scripts/dot-overlap-labels.cjs`: V5 (closed-left) patches `concurrencyAt`; its ℹ wording for ceiling-red dots
  updated (the ceiling no longer sums). Real run unchanged: 1,200 + 546 aligned 0 differ, AGREEMENT 2,200 states 0
  disagree. ✅.
- `scripts/batch-rolling-identity.cjs`: V1 (closed-left) patches `concurrencyAt` — one needle now, since every
  reader shares that test. ✓ FAILED as required; all golden families 0 differ. ✅.
- `scripts/batch-reservation-instants.cjs`: V1 ("a batch's first five minutes invisible") patches `concurrencyAt`.
  ✓ FAILED as required (29,351 minute-violations); real run 0. ✅.

### `scripts/slot-interval-engine-identity.cjs` — re-scoped
It asserted `windowScopedPeak`'s BYTES equal HEAD's. Its body now delegates to `peakLoadOver` (as instructed:
one implementation), so — exactly as was done for `fitOrderBackward` / `projectBackwardOccupancy` on 17
September — it is now **output-identical** (the 21,520-verdict proof above) and the remaining five symbols
(`backwardWindowStepMins`, `loadRunsOffFront`, `placeInstantPoints`, `buildUnitsFromOrders`,
`rebuildProductionSlotUsage`) plus the pile's construction stay byte-identical. ✅ rc 0.

`scripts/slot-interval-dots.cjs` (68 interval-5 cases byte-identical to HEAD, the 10–30 cover cases),
`batch-reservation-golden-on.cjs`, `batch-rolling-check.cjs`, `customer-path-identity.cjs`,
`sixteen-pizza-admission.cjs` and the rest: **unchanged and passing.**

## 6. The golden outcome — both identity harnesses run first, nothing regenerated

| Harness | Golden | Result |
|---|---|---|
| `scripts/batch-rolling-identity.cjs` | `batch-rolling-golden.json` | §31 examples, 300 + 20,000 + 240 seeded aligned cases, Gusto's six live events: **0 differ** |
| `scripts/batch-reservation-golden-on.cjs` | `batch-reservation-golden-on.json` | 8 + 300 + 240 + 6 + 300 fixtures: **0 differ — "the ON baseline holds"** |

Run before the harness work, after the `total` adjustment, and again at the end. **Both pass unchanged, so nothing
was changed.** `batch-rolling-golden.json` sha256 `8bdae817748ad334…`, `batch-reservation-golden-on.json` sha256
`ce5550b7ee2a42ce…` — before and after.

## 7. Verification

| Check | Result |
|---|---|
| `node scripts/run-harnesses.cjs` | **50 run · 50 passed · 0 failed — true exit code 0** (49 + `peak-ceiling-rule.cjs`) |
| `npx tsc --noEmit` | **true exit code 0** |
| `npx next build` | "Compiled successfully in 5.2s", **true exit code 0** |
| eslint, `lib/slot-availability.ts`, vs a clean HEAD worktree | `@typescript-eslint/no-unused-vars` warn **1 → 0**; no rule rose; 0 errors both sides |
| goldens | both hashes unchanged (§6) |

## 8. Localhost test script — test-truck (Pizza Kitchen), switch ON

**A · the kitchen-cap case (Van2).** Van2 has a kitchen capacity and a 5-minute grid. Set Pizza to **prep 10 /
batch 8** and Van2's kitchen capacity to **6** on a fresh event 17:00–20:00. Add Order: **5 pizzas at 18:30**, then
**4 at 18:40**. With **1 pizza** in the basket the list reads
`18:20 🟢 · 18:25 🟡 5 Pizzas · 18:30 🟡 5 Pizzas · 18:35 🟡 5 Pizzas · 18:40 🟡 4 Pizzas · 18:45 🟡 4 Pizzas · 18:50 🟢`
and **18:35 takes the order** (yesterday: `🔴 5 Pizzas`, refused). With **2 pizzas** 18:25–18:35 read
`🟡 5 Pizzas · Won't fit` (5 + 2 over the cap of 6) while 18:40 and 18:45 take them.

**B · nothing changes on a 15-minute grid.** Same truck, Customer Collection Times every 15 minutes, 5 pizzas at
18:30 and 4 at 18:45: `18:15 🟢 · 18:30 🟡 5 Pizzas · 18:45 🟡 4 Pizzas · 19:00 🟢`, exactly as before.

**C · your board (Van1, no cap) is unchanged by this task**: the 5 + 8 shape still reads `🟡 5 Pizzas` then
`🔴 8 Pizzas` on the four times the 8-batch covers. Gusto (prep 5 on 5, cap 2, window 5) is the shape the 600-state
check and the goldens cover — nothing to open; nothing was opened.

## 9. Proposed §31 replacement text — "The two ceilings" (NOT applied to `docs/reference-manual.md`)

> ### The two ceilings (this is the whole capacity model)
> Both are limits on what is in the kitchen **at one instant**, judged over every rolling cooking window an
> order would occupy. Batches are half-open in time: one that finishes as the next starts never overlaps it.
> 1. **Batch (per-category):** at no instant may more than `batch` items of a category be cooking. For a
>    candidate window `[S, S + prep)` the existing load is the **peak** of the category's batches over that span —
>    e.g. pizza batch 8 = never more than 8 pizzas in the oven at once. Two batches of 4 back to back peak at 4;
>    one of 8 running 21:30–21:45 and one of 5 from 21:55 never meet.
> 2. **Kitchen capacity (cross-category total):** at no instant may more than the cap be in the kitchen in total —
>    every category's batches plus ticked no-prep items, which count at the instant they are seated. Judged as
>    the same peak over the same span.
>
> A window is FULL when either peak reaches its limit. One implementation (`peakLoadOver`) answers every reader —
> admission (`reserveBatches`, `windowScopedPeak`), the dot's tone and label, and the breach detector — so the
> time list, the picker and the warnings always name the same number.

The existing worked examples (2 pizzas + 2 desserts at cap 4, etc.) stay true as written; the sentence *"max of ONE
category per window"* and the batch-rolling-fix report's *"sum of every existing batch of C that overlaps"* are the
two lines this replaces.

## 10. Anything I could not establish

- **Whether the display should count an instant point strictly inside a span** (§1, the 189 windows). Admission
  does; the dot and the breach detector read points at the span's start and at cooking starts, as today. Making
  the display read them too would change aligned trucks whose capacity window is shorter than a prep, so it was
  left as it is. If you want it, that is a separate, aligned-breaking change to state.
- **Whether a multi-category ceiling-red label should show the breakdown at the kitchen's peak instant** rather
  than each category's own peak (§2.3). Single-category trucks — every live one — already read one number.
- **The two goldens still contain no back-to-back-with-cap fixture**, so they cannot catch a regression to the
  ceiling sum; `peak-ceiling-rule.cjs` V1 does. Adding one is a generator run and is yours to call.

## 11. Every modified and untracked path (134 entries, 0 staged), grouped

### COLLECTION TIMES + CAPACITY + ADD ORDER + RESERVATIONS
`M app/api/dashboard/action/route.ts` · `M app/api/dashboard/route.ts` · `M app/api/events/route.ts` · `M app/api/manage/route.ts` · `M app/api/menu/[truckId]/route.ts` · `M app/api/orders/submit/route.ts` · `M app/api/slots/[truckId]/route.ts` · `M app/dashboard/[token]/page.tsx` · `M app/manage/[token]/page.tsx` · `M app/trucks/[slug]/order/page.tsx` · `M components/dashboard/AddOrderPanel.tsx` · `M components/dashboard/CapacityBreachBanner.tsx` · `M lib/capacity-breach.ts` · `M lib/features.ts` · `M lib/orders/place-in-slot.ts` · `M lib/payments/promote-draft.ts` · **`M lib/slot-availability.ts`** (this task) · `M lib/slot-bookings.ts` · `M lib/slot-display.ts` · `M lib/slot-generation.ts` · `M lib/supabase.ts` · `? lib/capacity-refresh.ts` · `? lib/orders/cooking-reservation.ts` · `? lib/slot-fit-message.ts` · `? lib/slot-interval.ts`

### WIRED PRINTING (app, native, plugin)
`M android/app/capacitor.build.gradle` · `M android/capacitor.settings.gradle` · `M components/printing/PrintingSettings.tsx` · `M ios/App/App/Info.plist` · `M ios/App/CapApp-SPM/Package.swift` · `M lib/printing/bleTransport.ts` · `M lib/printing/transport.ts` · `M lib/printing/usePrinting.ts` · `M package-lock.json` · `M package.json` · `? app/api/printing/route.ts` · `? components/printing/PrinterTypeChoice.tsx` · `? lib/printing/netAddress.ts` · `? lib/printing/netTransport.ts` · `? lib/printing/networkGuard.ts` · `? lib/printing/testTicket.ts` · `? plugins/hatchgrab-net-printer/{Package.swift, index.d.ts, index.js, package.json, android/build.gradle, android/src/main/AndroidManifest.xml, android/src/main/java/com/hatchgrab/netprinter/NetPrinterPlugin.java, ios/Sources/NetPrinterPlugin/NetPrinterPlugin.swift}` — ⚠️ plus 34 untracked, **not ignored** build files under `plugins/hatchgrab-net-printer/android/build/…` and `plugins/hatchgrab-net-printer/.swiftpm/xcode/xcuserdata/…/xcschememanagement.plist`; a `.gitignore` entry (`plugins/**/build/`, `**/xcuserdata/`) remains proposed, not done.

### HOLD (landing, plan-features, store listing copy)
`M app/landing/page.tsx` · `M content/store-listing.md` · `M lib/plan-features.ts`

### MIGRATIONS (all five APPLIED by hand; the files are untracked)
`? supabase/migrations/20260916_collection_intervals.sql` · `? …/20260917_van_collection_intervals.sql` · `? …/20260918_event_collection_intervals.sql` · `? …/20260919_van_network_printer.sql` · `? …/20260920_orders_cooking_reservation.sql`

### INCIDENT SAFEGUARDS
`M scripts/migrate-from-sheets.cjs` · `M scripts/register-payment-domain.cjs` · **`? scripts/harnesses.json`** (50 listed) · `? scripts/run-harnesses.cjs` · `? scripts/ops-write-guard.cjs`

### HARNESSES + FIXTURES
`M scripts/whatsapp-golive-parity-harness.cjs` · `? scripts/_batch-reservation-golden-on-generate.cjs` · `? scripts/_batch-reservation-sim.cjs` · `? scripts/_batch-rolling-golden-generate.cjs` · `? scripts/_batch-rolling-snapshot.cjs` · `? scripts/_mini-dom.cjs` · `? scripts/_printing-mocks.cjs` · `? scripts/_slot-interval-compile.cjs` · `? scripts/add-order-fit-message.cjs` · `? scripts/add-order-refresh.cjs` · `? scripts/add-order-render.cjs` · `? scripts/batch-reservation-display-equals-picker.cjs` · `? scripts/batch-reservation-edit-lock.cjs` · `? scripts/batch-reservation-golden-on.cjs` · `? scripts/batch-reservation-helper.cjs` · `? scripts/batch-reservation-immutability.cjs` · **`? scripts/batch-reservation-instants.cjs`** · `? scripts/batch-reservation-lock.cjs` · `? scripts/batch-reservation-p2-identity.cjs` · `? scripts/batch-reservation-p3-worked-case.cjs` · `? scripts/batch-reservation-switch.cjs` · `? scripts/batch-reservation-writers.cjs` · `? scripts/batch-rolling-check.cjs` · **`? scripts/batch-rolling-identity.cjs`** · `? scripts/collection-times-hint.cjs` · `? scripts/customer-path-identity.cjs` · `? scripts/dev-virtual-printer.cjs` · **`? scripts/dot-overlap-labels.cjs`** · `? scripts/fixtures/{batch-reservation-golden-on.json, batch-rolling-fix.patch, batch-rolling-golden.json}` (unchanged) · **`? scripts/peak-ceiling-rule.cjs`** (new) · **`? scripts/peak-load-rule.cjs`** · `? scripts/printing-copy.cjs` · `? scripts/printing-dedupe.cjs` · `? scripts/printing-escpos-identity.cjs` · `? scripts/printing-failure-split.cjs` · `? scripts/printing-gating.cjs` · `? scripts/printing-network-guard.cjs` · `? scripts/printing-transport-contract.cjs` · `? scripts/sixteen-pizza-admission.cjs` · `? scripts/slot-interval-dots.cjs` · **`? scripts/slot-interval-engine-identity.cjs`** · `? scripts/slot-interval-event-override.cjs` · `? scripts/slot-interval-generator.cjs` · `? scripts/slot-interval-grid-routing.cjs` · `? scripts/slot-interval-settings.cjs` · `? scripts/slot-interval-van-list-tolerance.cjs` · `? scripts/slot-interval-van-resolution.cjs`

### DOCS
`? docs/add-order-fit-message-report.md` · `? docs/add-order-render-fix-report.md` · `? docs/batch-keep-together-investigation-report.md` · `? docs/batch-overlap-review-report.md` · `? docs/batch-reservation-investigation-report.md` · `? docs/batch-reservation-p0-p2-report.md` · `? docs/batch-reservation-p3-report.md` · `? docs/batch-rolling-durable-harness-report.md` · `? docs/batch-rolling-fix-report.md` · `? docs/batch-split-review-report.md` · `? docs/dashboard-order-and-batch-overlap-report.md` · `? docs/discovery-incident-followup-report.md` · `? docs/discovery-upsert-incident-report.md` · `? docs/dot-label-cooking-counts-report.md` · `? docs/dot-label-full-only-report.md` · `? docs/dot-label-overlap-counts-report.md` · `? docs/dot-label-red-total-report.md` · `? docs/dot-label-wont-fit-report.md` · `? docs/dot-overlap-labels-report.md` · `? docs/edit-busy-fix-report.md` · `? docs/edit-lock-and-refresh-report.md` · `? docs/gusto-event-update-trace-report.md` · **`? docs/peak-ceiling-rule-report.md`** (this file) · `? docs/peak-load-rule-report.md` · `? docs/sixteen-pizza-bug-report.md` · `? docs/slot-interval-build-report.md` · `? docs/slot-interval-event-override-report.md` · `? docs/slot-interval-hardening-report.md` · `? docs/slot-interval-van-level-report.md` · `? docs/wired-printing-build-report.md` · `? docs/wired-printing-followup-report.md` · `? docs/wired-printing-investigation-report.md`

### ANYTHING ELSE
Nothing — every one of the 134 entries is above. Two stale detached worktrees under
`/private/var/folders/…/slot-head-dots-*`, from an earlier dots-harness run, remain in `git worktree list`; they
are outside the working tree and untouched.
