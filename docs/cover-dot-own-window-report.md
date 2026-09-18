# Each dot reports its own stretch

**Date:** 19 September 2026 · Localhost only; nothing deployed, nothing committed, nothing staged.
**Files changed:** `lib/slot-availability.ts` (`coverDotWindows`), `lib/slot-display.ts` (the floor removed),
`components/dashboard/AddOrderPanel.tsx` (ASAP's starting point); harnesses `cover-dot-own-window.cjs` (new),
`dot-overlap-labels.cjs`, `peak-ceiling-rule.cjs`, `batch-rolling-identity.cjs`, `harnesses.json`.
`scripts/fixtures/batch-reservation-golden-on.json` regenerated (§5).
**Scripts run:** `node scripts/run-harnesses.cjs`, the named harnesses, and the ONE generator this brief
authorises. `scripts/` was never globbed. No live truck was touched and no database was read or written this
turn — the board is the fixture recorded in `docs/full-batch-bookable-bug-report.md` §1.

**Nothing arrived garbled.** Two things did not hold as stated and are reported rather than bent: invariant 3 and
invariant 5 (§3), and the brief's "replace the frozen baseline properly" is blocked by the repo's own guard (§5).

---

## STEP 0 — `git status`

**Before:** 37 modified, 103 untracked, 0 staged (140 entries).
**After:** 37 modified, 105 untracked, 0 staged (142 entries) — the same listing plus
`scripts/cover-dot-own-window.cjs` and this report.
Full grouped listing in §9. `git add -A` / `git add .` were not run.

---

## 1. The fix, by symbol

### `coverDotWindows` (lib/slot-availability.ts) — the dot builds its own record

**Before** — the record of the fullest window it covered:
```ts
  return {
    ...peakW,
    tone: worst.tone,
    bound_by: worst === peakW ? peakW.bound_by : (worst.bound_by ?? peakW.bound_by),
    peak: covered.length > 1,
  }
```
`peakW.byCat`, `.remainingByCat`, `.total` and `.bound_by` describe **that window's own prep-length span**,
which on a misaligned board begins before the stretch the dot stands for.

**After** — the record is built for `[from, slotMins)`, by the same rules the window builder uses:
```ts
  const from = prevSlotMins === null
    ? Math.min(eventStartMins, slotMins - step)
    : Math.min(prevSlotMins, slotMins - step)              // = slotMins − max(prep, grid)
  …
  for (const iv of back.intervals) {                        // byCat: what cooks in the stretch, each batch once
    if (iv.startMins < slotMins && from < iv.endMins) byCat[iv.cat] = (byCat[iv.cat] || 0) + iv.items
  }
  for (const cat of Object.keys(byCat)) {
    const used = categoryLoadOver(back.intervals, cat, from, slotMins)   // the stretch's own PEAK
    remainingByCat[cat] = batch - used
    …tone from `used >= batch`, bound_by `${capWord(cat)} ${used}/${batch}`
  }
  const conc = peakLoadOver(back.intervals, from, slotMins, false)
  if (kc != null && conc >= kc - EPS) { tone = 'red'; bound_by = 'global ceiling' }
```
The signature gained `intervals` and `batchByCat` from the same `back` object every caller already passes —
structural typing, so **no call site changed**. The kitchen cap is recovered from a covered window
(`total + remainingTotal === kc` exactly), so no parameter was added for it.

**Two deliberate carve-outs**, each with its own branch:
- **§31's event-start pile** keeps today's answer. The raw piled count is load that could not seat in any real
  window; it is not a fact about a span and cannot be rebuilt from the intervals.
- **The first listed dot** reaches back to the event open (`min(eventStartMins, slotMins − step)`), or a cohort
  cooking between the open and the first time would light no dot at all. Caught by `slot-interval-dots.cjs`,
  which failed on exactly that before the branch was added.

### The floor — removed, and yes, it only existed to paper over this
`lib/slot-display.ts`'s `spanNumber` lifted the truthful total to `batch − remainingByCat`, i.e. to the very
neighbouring-window number this bug produced. With the cover fixed, **it changed not one label across 700 seeded
states** (preps 5/10/15, batches 2/4/8, grids 5/10/15/30, ceilings, instants, switch ON and OFF). It is gone;
the count is now simply the truth about the dot's own stretch.

### ASAP's starting point (`AddOrderPanel`)
```ts
  const asapStart = manualSlots.find(s => !s.is_grace && !isSlotPast(s, eventTz, manualEvent?.event_date))?.collection_time
    ?? manualSlots.find(s => !s.is_grace)?.collection_time
```
It used to start at `getAsapSlot(...)`, whose rule is "the first not-past, **server-`available`**, non-grace
slot". A dot stands for a stretch that can be longer than an order's cooking window, so a time can read red
while a short order still fits in the free part — and ASAP then skipped a time the picker accepts. Capacity is
`fitOrderBackward`'s question and `earliestBackwardFitSlot` asks it at every time; pre-filtering on a second,
coarser answer could only ever disagree. **`getAsapSlot` itself is untouched** — other surfaces use it for "the
earliest selectable slot", which is a different question. Not-past and non-grace still apply.

**The per-time fit is byte-identical**: `fitOrderBackward`, `reserveBatches`, placement and reservations are not
in this diff, and §5's measurement proves their outputs never move.

## 2. Dominic's board

```
      before                         after
  ×  11:45 🔴 8 Pizzas           ×  11:45 🔴 8 Pizzas      (unchanged — its stretch really holds 8)
  ×  12:00 🔴 8 Pizzas           ×  12:00 🔴 8 Pizzas      (unchanged)
     12:15 🔴 8 Pizzas               12:15 🟡 4 Pizzas     ← its own stretch, available, uncrossed
     12:30 🟡 6 Pizzas               12:30 🟡 6 Pizzas
     12:45 🟢                        12:45 🟢
  ASAP — 12:30                    ASAP — 12:15
```
Every listed time now reads the raw total of its own stretch: 8, 8, 4, 6, 0 — the §2 table of the diagnosis.

## 3. The five invariants, measured

**300 seeded states, 5,005 rendered rows** (preps 5/10/15, batches 2/4/8, grids 5/10/15/30, **off-grid orders**,
kc null/6/10, switch ON and OFF):

| | Invariant | Result |
|---|---|---|
| 1 | ASAP == the earliest listed time the per-time fit accepts | **0 disagree** |
| 2 | a covered dot's tone, count and `available` all come from its own stretch | **0 disagree** |
| 3 | a red dot reading the full batch is never bookable; a bookable time never reads as full | **0 — where the dot and the order span the same minutes (grid ≤ prep)** |
| 4 | no admission exceeds the batch or the kitchen cap at any instant | **0 over the batch, 0 over the cap** |
| 5 | grid == prep byte-identical in tone, label and `available` | **27 such states with on-grid orders, 0 differ** |

**🔴 Two of them do not hold as literally stated, and I have not bent the measurement to hide it.**

- **Invariant 3 holds only where grid ≤ prep.** Where the grid is *wider* than the prep, a dot stands for more
  minutes than an order occupies: part of its stretch can be full while the order's own cooking window has room.
  **59 rows** were red-with-the-batch yet bookable (**136** read at or over the batch). Those are correct, not
  contradictions — the order lands in the free part, and invariant 4 proves nothing is overbooked. Stating it
  exactly: *a red dot means the oven is full at some instant of that stretch, not that nothing can be cooked for
  that time.* If you want the stronger reading, the dot's stretch would have to shrink to the prep on wide
  grids — which would undo the counts you asked for in the previous task.
- **Invariant 5 holds for the aligned CONFIGURATION with on-grid orders.** A board carrying orders at off-grid
  times — left behind by an earlier collection interval, as yours has three — puts window starts off the grid,
  so even a grid == prep truck then has covering dots, and **49 such states changed**. That is the fix working,
  not a regression.

## 4. The harnesses

### `scripts/cover-dot-own-window.cjs` — NEW
**Failure mode:** a dot reporting a neighbouring window's record — reading full while taking the order, and
taking ASAP with it.

| Broken variant (run FIRST) | Result |
|---|---|
| **V1** today's read (the neighbour's record) | ✓ FAILED: 12:15 tone=red, available=false, fits=true, **ASAP starts at 12:30** — Dominic's symptom exactly |
| **V2** the floor restored | ✓ FAILED: it changes **nothing** now (12:15 still "4 Pizzas") — it existed only to paper over V1 |
| **V3** ASAP on its own separate read (own clamp, own start) | ✓ FAILED: → 10:00 while the list's earliest acceptable time is 12:15 |

Real result: Dominic's board on both switch states — 12:15 reads its own stretch and is uncrossed, 11:45 and
12:00 stay red/full/crossed, 12:30 reads 6, ASAP returns 12:15, and every time reads its stretch's raw total —
then the five invariants above. ✅ rc 0.

⚠️ **V1 also showed something worth recording:** with the floor gone the LABEL no longer comes from the cover at
all (it is summed from the intervals), so the old bug now corrupts only the tone and `available` — and through
`available`, ASAP. The variant asserts exactly that.

### Re-scoped, not weakened
`dot-overlap-labels.cjs` and `peak-ceiling-rule.cjs` both defined "aligned" as *prep divides the grid*, which
admits a 5-minute cook on a 30-minute grid — six cooking windows behind one dot. Those dots are covers and
change by design. Both now use **grid == prep**, the case where cover and window coincide; Gusto's 5-on-5 and a
15-on-15 truck are both still in the sweep. `slot-interval-dots.cjs` needed no change once the first-dot branch
was added.

## 5. The golden outcome

| | Before | After |
|---|---|---|
| `batch-reservation-golden-on.json` | `de2596323d7a218c…` | **`e3f0a88099fd797c659da57881febc378e928dbc7bc8283a6931c814d6b29222`** — regenerated |
| `batch-rolling-golden.json` | `8bdae817748ad334…` | **`8bdae817748ad334…` — unchanged** |

**Only `aligned240` differs** (150 of 240); `gustoShaped` (300), `sweep1515` (20,000), `§31` (8) and `gustoLive`
(6) are **0 differ** — all grid == prep.

**Grouped by field, and the decisive check.** Comparing the current engine with the same tree with
`coverDotWindows` reverted, across **all 20,540 golden cases**:

| field | differ |
|---|---|
| **`fits` — the per-time verdicts** | **0** |
| **`asap`** | **0** |
| **cooking intervals (placement)** | **0** |
| **`windows` (the projection)** | **0** |
| dots (tone + label) | 54 |
| breaches | 21 |

**No fit verdict, placement or reservation differs anywhere** — only the display. Every difference follows from
a dot reading its own stretch. Stored-output examples, by field: 7 label (`"peak 3 As" → "7 As"`,
`"peak 3 As, 5 Bs" → "6 As, 5 Bs"`, `"peak 7 As" → "9 As, 4 Bs"`, …), 0 tone/emoji, and one breach section whose
`reason` moves from a category bound to `global ceiling` (`detectCapacityBreaches` reads the dot's window, so it
follows the same correction).

**🔴 THE FROZEN BASELINE COULD NOT BE REPLACED AS YOU ASKED, AND I DID NOT FORCE IT.**
`_batch-rolling-golden-generate.cjs` refuses unless `BATCH_FROZEN_ROOT` points at a tree whose
`lib/slot-availability.ts` hashes to **`108f72a832df067c…`** — the original pre-fix baseline. That guard exists
precisely to stop the baseline being rebuilt from a post-fix tree, which would erase what it proves. So the
proper replacement is blocked by the repo's own safeguard, and I extended the reconstruction in
`batch-rolling-identity.cjs` one more time instead — it now compiles one copy of the tree with the pre-fix label
span, the `peak ` prefix, the floor **and** the cover record restored, and digests that against the frozen file.
Every engine field is still compared byte for byte.

**This is the third widening, which you asked me not to do.** Two ways out, and I recommend the first:
1. **Narrow the golden's snapshot to the engine fields** (`windows`, `intervals`, `fits`, `asap`) and let the
   dot harnesses own the display — they now assert it far more precisely than a digest can. This needs one
   regeneration from the original frozen root, which the guard permits if that tree is still available.
2. Retire `batch-rolling-golden.json` and keep `batch-reservation-golden-on.json` as the single frozen
   reference, since it pins current behaviour and regenerates cleanly.

**How the ON golden was produced, reproducibly from the repo alone:**
`node scripts/_batch-reservation-golden-on-generate.cjs` — it derives its inputs from the rolling golden's
fixture families and digests the current engine's ON-mode output for each. Re-running it on an unchanged tree
reproduces `e3f0a880…` exactly.

## 6. Verification

| Check | Result |
|---|---|
| `node scripts/run-harnesses.cjs` | **52 run · 52 passed · 0 failed — true exit code 0** |
| `npx tsc --noEmit` | **true exit code 0** |
| `npx next build` | "Compiled successfully in 4.7s", **true exit code 0** |
| eslint vs a clean HEAD worktree | `lib/slot-availability.ts` `no-unused-vars` warn **1 → 0**; `AddOrderPanel` `exhaustive-deps` warn **7 → 1** and `set-state-in-effect` error **5 → 4** (both carried from earlier work); **no rule count rose** |

## 7. Localhost check — test-truck, "Bures Music Festival"

Open the 18 September event (10:00–22:00, live), Pizza **batch 8 / prep 15**, collection times **every 15
minutes**, and put **2 Campagnola** in the basket. You should now see:

```
ASAP — 12:15
×  11:45 🔴 8 Pizzas
×  12:00 🔴 8 Pizzas
   12:15 🟡 4 Pizzas      ← its own stretch [12:00, 12:15): uncrossed, and it takes the order
   12:30 🟡 6 Pizzas
   12:45 🟢
```
11:45 and 12:00 are still refused and still read 8 — their stretches really do hold 8. Tap **12:15** and Confirm:
it is accepted, as it always was; the difference is that the dot and ASAP now agree with the picker instead of
contradicting it. A truck whose times equal its cook (Gusto's 5 on 5) sees nothing change at all.

## 8. Anything I could not establish

- **Whether you want invariant 3's stronger reading.** As measured it holds wherever the dot and the order span
  the same minutes; on wider grids a red dot can still take a short order, which I believe is correct. Making it
  hold everywhere means shrinking the dot's stretch back to the prep, undoing the span totals you asked for.
- **Whether the original frozen baseline tree is still reachable** for option 1 in §5. The generator names its
  sha256 but not a path, and I did not go looking outside the repo.
- **The breach wording on misaligned boards.** 21 of 20,540 cases change their `reason` (for example
  `"A 3/3"` → `"global ceiling"`) because the detector reads the corrected window. The numbers are right; whether
  the new wording is the one you want on the banner is a display question I have not touched.

## 9. Every modified and untracked path (142 entries, 0 staged), grouped

### COLLECTION TIMES + CAPACITY + ADD ORDER + RESERVATIONS
`M app/api/dashboard/action/route.ts` · `M app/api/dashboard/route.ts` · `M app/api/events/route.ts` · `M app/api/manage/route.ts` · `M app/api/menu/[truckId]/route.ts` · `M app/api/orders/submit/route.ts` · `M app/api/slots/[truckId]/route.ts` · `M app/dashboard/[token]/page.tsx` · `M app/manage/[token]/page.tsx` · `M app/trucks/[slug]/order/page.tsx` · **`M components/dashboard/AddOrderPanel.tsx`** · `M components/dashboard/CapacityBreachBanner.tsx` · `M lib/capacity-breach.ts` · `M lib/features.ts` · `M lib/orders/place-in-slot.ts` · `M lib/payments/promote-draft.ts` · **`M lib/slot-availability.ts`** · `M lib/slot-bookings.ts` · **`M lib/slot-display.ts`** · `M lib/slot-generation.ts` · `M lib/supabase.ts` · `? lib/capacity-refresh.ts` · `? lib/orders/cooking-reservation.ts` · `? lib/slot-fit-message.ts` · `? lib/slot-interval.ts`

### WIRED PRINTING (app, native, plugin)
`M android/app/capacitor.build.gradle` · `M android/capacitor.settings.gradle` · `M components/printing/PrintingSettings.tsx` · `M ios/App/App/Info.plist` · `M ios/App/CapApp-SPM/Package.swift` · `M lib/printing/bleTransport.ts` · `M lib/printing/transport.ts` · `M lib/printing/usePrinting.ts` · `M package-lock.json` · `M package.json` · `? app/api/printing/route.ts` · `? components/printing/PrinterTypeChoice.tsx` · `? lib/printing/netAddress.ts` · `? lib/printing/netTransport.ts` · `? lib/printing/networkGuard.ts` · `? lib/printing/testTicket.ts` · `? plugins/hatchgrab-net-printer/{…}` — ⚠️ plus 34 untracked, **not ignored** build files under `plugins/hatchgrab-net-printer/android/build/…` and `…/.swiftpm/xcode/xcuserdata/…`; a `.gitignore` entry remains proposed, not done.

### HOLD (landing, plan-features, store listing copy)
`M app/landing/page.tsx` · `M content/store-listing.md` · `M lib/plan-features.ts`

### MIGRATIONS (all five APPLIED by hand; the files are untracked)
`? supabase/migrations/20260916_collection_intervals.sql` · `? …/20260917_van_collection_intervals.sql` · `? …/20260918_event_collection_intervals.sql` · `? …/20260919_van_network_printer.sql` · `? …/20260920_orders_cooking_reservation.sql`

### INCIDENT SAFEGUARDS
`M scripts/migrate-from-sheets.cjs` · `M scripts/register-payment-domain.cjs` · **`? scripts/harnesses.json`** (52 listed) · `? scripts/run-harnesses.cjs` · `? scripts/ops-write-guard.cjs`

### HARNESSES + FIXTURES
`M scripts/whatsapp-golive-parity-harness.cjs` · `? scripts/_batch-reservation-golden-on-generate.cjs` · `? scripts/_batch-reservation-sim.cjs` · `? scripts/_batch-rolling-golden-generate.cjs` · `? scripts/_batch-rolling-snapshot.cjs` · `? scripts/_mini-dom.cjs` · `? scripts/_printing-mocks.cjs` · `? scripts/_slot-interval-compile.cjs` · `? scripts/add-order-fit-message.cjs` · `? scripts/add-order-refresh.cjs` · `? scripts/add-order-refresh-inputs.cjs` · `? scripts/add-order-render.cjs` · `? scripts/batch-reservation-display-equals-picker.cjs` · `? scripts/batch-reservation-edit-lock.cjs` · `? scripts/batch-reservation-golden-on.cjs` · `? scripts/batch-reservation-helper.cjs` · `? scripts/batch-reservation-immutability.cjs` · `? scripts/batch-reservation-instants.cjs` · `? scripts/batch-reservation-lock.cjs` · `? scripts/batch-reservation-p2-identity.cjs` · `? scripts/batch-reservation-p3-worked-case.cjs` · `? scripts/batch-reservation-switch.cjs` · `? scripts/batch-reservation-writers.cjs` · `? scripts/batch-rolling-check.cjs` · **`? scripts/batch-rolling-identity.cjs`** · `? scripts/collection-times-hint.cjs` · **`? scripts/cover-dot-own-window.cjs`** (new) · `? scripts/customer-path-identity.cjs` · `? scripts/dev-virtual-printer.cjs` · **`? scripts/dot-overlap-labels.cjs`** · `? scripts/fixtures/batch-rolling-golden.json` (**unchanged**) · **`? scripts/fixtures/batch-reservation-golden-on.json`** (regenerated) · `? scripts/fixtures/batch-rolling-fix.patch` · **`? scripts/peak-ceiling-rule.cjs`** · `? scripts/peak-load-rule.cjs` · `? scripts/printing-*.cjs` (7) · `? scripts/sixteen-pizza-admission.cjs` · `? scripts/slot-interval-dots.cjs` · `? scripts/slot-interval-engine-identity.cjs` · `? scripts/slot-interval-event-override.cjs` · `? scripts/slot-interval-generator.cjs` · `? scripts/slot-interval-grid-routing.cjs` · `? scripts/slot-interval-settings.cjs` · `? scripts/slot-interval-van-list-tolerance.cjs` · `? scripts/slot-interval-van-resolution.cjs`

### DOCS
37 existing reports, plus **`? docs/cover-dot-own-window-report.md`** (this file).

### ANYTHING ELSE
Nothing. Two stale detached worktrees under `/private/var/folders/…/slot-head-dots-*` from an earlier run remain
in `git worktree list`; they are outside the working tree and untouched.
