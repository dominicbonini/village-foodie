# Time-list dots — an overlapped time shows what's cooking (option (a), built)

**Date:** 19 September 2026 · Display only (label text) · Localhost only; nothing deployed, nothing committed,
nothing staged.
**Files changed:** `lib/slot-display.ts`, `components/dashboard/AddOrderPanel.tsx`,
`app/dashboard/[token]/page.tsx`, `scripts/dot-overlap-labels.cjs`.
**Scripts run:** `node scripts/run-harnesses.cjs` and `scripts/dot-overlap-labels.cjs`. `scripts/` was never
globbed; no golden generator was run. No live truck's token, device id, page, route or API was touched; nothing
was created, edited, cancelled or deleted for any truck. No database was read or written — every figure below is a
FIXTURE through the compiled engine.

**No span of the prompt arrived garbled, and no instruction contradicted another.** Built exactly as
`docs/dot-label-cooking-counts-report.md` §4 specified, asserting the §4 measured table.

---

## STEP 0 — `git status`

**Before:** branch `main`, up to date with `origin/main`, **37 modified, 90 untracked, 0 staged** (127 entries).
**After:** **37 modified, 91 untracked, 0 staged** (128 entries) — the same listing plus
`docs/dot-label-overlap-counts-report.md`. Full grouped listing in §8. `git add -A` / `git add .` were not run;
nothing staged, committed, stashed, reset or restored.

---

## 1. What changed, by symbol

### `lib/slot-display.ts` — `formatOverlapLabel` deleted, `countLabel` shared by both label paths
The label block in `buildSlotIndicators` now reads:

```ts
    const rawLabel = w ? countLabel(Object.entries(w.byCat).map(([cat, n]) => [cat, Number(n)] as [string, number]), rankOf) : ''
    const ownLabel = w && (w as { peak?: boolean }).peak && rawLabel ? `peak ${rawLabel}` : rawLabel
    const overlap = ownLabel ? null : read.overlap
    const label = overlap
      ? countLabel(Object.entries(read.perCat).map(([cat, r]) => [cat, r.used] as [string, number]), rankOf)
      : ownLabel
```

- **`countLabel`** — **new**, module-private: the ONE count renderer ("8 Pizzas", "1 Pizza", "2 Pizzas, 1 Other"),
  menu-ordered and plural-aware. It is the body that used to be inlined for `rawLabel`, lifted so both paths call
  it. A count now reads identically whether the batch is collected at this time or merely shares the grill with it.
- **`read.perCat[cat].used`** is `categoryLoadOver(intervals, cat, T − prep_cat, T)` — **the very number
  `dotOccupancyAt` decided the colour from**, so the label and the colour cannot disagree and no second
  calculation exists.
- **`ownLabel` is untouched.** That is what preserves §31's event-start pile, ticked no-prep categories and the
  mixed-prep single-window read (§3).
- **`multiCat`** was read only by `formatOverlapLabel`; it is removed from `SlotIndicator`, from the local, and
  from the two fallback literals in `AddOrderPanel` (`slotIndicatorFor`) and `app/dashboard/[token]/page.tsx`
  (the edit picker). `overlap` and `ownLabel` stay on the interface.
- `formatFitSuffix` is untouched.

### Every string removed, and what replaced it

| Removed | Was shown when | Now |
|---|---|---|
| `Full` | an overlapped time, batch full, one cooking category | `8 Pizzas` — the overlapping batch's count |
| `Pizza full` | same, several cooking categories | `8 Pizzas` (every loaded category listed) |
| `Kitchen full` | same, the kitchen ceiling binding | `4 Pizzas, 2 Burgers` — item counts, no "Kitchen" wording |
| `{n} free` | an overlapped time, partly loaded, one category | `5 Pizzas` |
| `Pizza: {n} free` | same, several categories | `4 Burgers` / `8 Pizzas, 4 Burgers` |
| `Kitchen: {n} free` | same, ceiling binding | `3 Pizzas, 2 Burgers` |

**No string was added.** Every label is now produced by `countLabel`, whose output format
(`"{n} {Category}"`, comma-joined) is unchanged from today's count label.

## 2. The measured table, as built

Prep 15, batch 8, kitchen capacity NULL, 5-minute grid; 8 pizzas collected **21:45** (cooking 21:30–21:45) and 5
collected **22:10** (cooking 21:55–22:10). Identical switch ON and OFF.

| time | 3 pizzas in the order | 4 pizzas in the order |
|---|---|---|
| 21:40 | 🔴 `8 Pizzas` | 🔴 `8 Pizzas` |
| 21:45 | 🔴 `8 Pizzas` | 🔴 `8 Pizzas` |
| 21:50 | 🔴 `8 Pizzas` | 🔴 `8 Pizzas` |
| 21:55 | 🔴 `8 Pizzas` | 🔴 `8 Pizzas` |
| 22:00 | 🟡 `5 Pizzas` | 🟡 `5 Pizzas · Won't fit` |
| 22:05 | 🟡 `5 Pizzas` | 🟡 `5 Pizzas · Won't fit` |
| 22:10 | 🟡 `5 Pizzas` | 🟡 `5 Pizzas · Won't fit` |
| 22:15 | 🟡 `5 Pizzas` | 🟡 `5 Pizzas · Won't fit` |
| 22:20 | 🟡 `5 Pizzas` | 🟡 `5 Pizzas · Won't fit` |
| 22:25 | 🟢 | 🟢 |

One batch, one number, on every time it covers. With 3 pizzas nothing is refused (5 + 3 = 8, exactly the batch),
so no verdict appears; with 4 (5 + 4 = 9 > 8) every amber line gains it and the red lines still stay silent.

**Adding a third order of 1 pizza collected 22:05** (cooking 21:50–22:05) makes the shared times read the sum:
`22:00 🟡 6 Pizzas · Won't fit`, `22:15 🟡 6 Pizzas · Won't fit`, and `21:55 🔴 9 Pizzas` — 8 + 1 on the grill at
once, over the batch of 8, which is why it is red.

## 3. No aligned case changes — by construction and by measurement

`read.overlap` is non-null **only** when a time has no cooking window of its own *and* the rolling read is
strictly worse than that window's own tone. Where the grid is a whole multiple of every cooking prep, every
interval overlapping `[T − prep, T)` starts exactly at `T − prep` — the window today's read already looks at — so
the rolling read is never worse, `overlap` is always null, and the new branch never runs. Measured:

| Check | Result |
|---|---|
| 1,200 seeded aligned states (grids 5/10/15/20/30, preps dividing the grid, instants and ceilings, switch ON/OFF) | **0 differ** |
| Gusto-shaped (300) + aligned240 (240) + Gusto's six live events | **546 fixtures, 0 dots differ from today** |

And the three cases my §2 warned about in `docs/dot-label-cooking-counts-report.md` are all preserved, each with
its own assertion, because each is an `ownLabel` case:

| Case | Renders |
|---|---|
| §31 event-start pile — 6 pizzas at a 16:30 open, batch 4, prep 5 | `16:30 🔴 6 Pizzas` — the **raw piled count**, the manual's worked example |
| A ticked no-prep category beside a cooking one — 2 pizzas + 3 drinks @17:10 | `17:10 🔴 2 Pizzas, 3 Drinks` |
| Mixed-prep single-window read | unchanged (inside the 1,200-state sweep) |

## 4. The harness — `scripts/dot-overlap-labels.cjs`

**Failure mode:** a dot between batches describing a *limit* instead of the food. An operator looking at 21:50 was
told "Full" and could not see what was on the grill or how much of it.

**Broken variants, run FIRST — all ten FAILED as required** (the three this change needs in bold):

| | Variant | Result |
|---|---|---|
| V1 | today's exact-time read | ✓ FAILED: `"17:05 🟢"` |
| V2 | the overlapping window's own composition repeated | ✓ FAILED: `"17:05 🔴 8 Pizzas"` |
| **V3** | **"Full" restored on an overlapped time** | ✓ FAILED: `"17:05 🔴 Full"` |
| **V3b** | **the overlap rule applied to `ownLabel` too** | ✓ FAILED: §31's pile read `"16:30 🔴 2 Pizzas"` instead of `"16:30 🔴 6 Pizzas"` |
| V4 | operator reason on the `/api/slots` row | ✓ FAILED |
| V4b | the popup stripped of its free-room detail | ✓ FAILED |
| V5 | closed-left overlap | ✓ FAILED: `"17:15 🔴 1 Pizza"` |
| **V6** | **the verdict rendered on a red dot** | ✓ FAILED: `"17:05 🔴 9 Pizzas · Won't fit"` |
| V7 | the long "Order won't fit" restored | ✓ FAILED |
| V8 | the popup's title shortened | ✓ FAILED |

**Real result** (every line verbatim):
```
  DOMINIC'S FIRST CASE (8 @17:00, 1 @17:15), empty order, both switch states:
      "17:00 🔴 8 Pizzas"  "17:05 🔴 9 Pizzas"  "17:10 🔴 9 Pizzas"  "17:15 🟡 1 Pizza"
  9 pizzas: red lines silent; "17:15 🟡 1 Pizza · Won’t fit"  "17:20 🟡 1 Pizza · Won’t fit"
  THE §4 TABLE: the 21:30–21:45 batch reads "8 Pizzas" on all four times it covers;
      the 21:55–22:10 batch reads "5 Pizzas" on all five; 22:25 clear; 4 pizzas adds the verdict to each amber
      a 1-pizza order at 22:05 makes 22:00 and 22:15 read "6 Pizzas · Won’t fit"; 21:55 reads "9 Pizzas"
      an EMPTY order shows no verdict on any of the ten times
  1226 rendered lines: 0 contain "Full" or "free"
  formatOverlapLabel is gone from the module's code; none of its six strings survives
  §31 event-start pile: "16:30 🔴 6 Pizzas"
  a ticked no-prep category: "17:10 🔴 2 Pizzas, 3 Drinks"
  two categories across one overlapped time: "17:40 🔴 8 Pizzas, 4 Burgers"
  part-full batch: 5 @17:00 → "17:00 🟡 5 Pizzas" "17:05 🟡 5 Pizzas" "17:10 🟡 5 Pizzas" then "17:15 🟢"
  kitchen ceiling binding: "17:05 🔴 4 Pizzas, 2 Burgers" (no "Kitchen" wording) · partial "17:05 🟡 3 Pizzas, 2 Burgers"
  10-minute grid, prep 15: "17:10 🔴 8 Pizzas" "17:30 🔴 8 Pizzas" "17:40 🔴 8 Pizzas" "17:50 🟢"
  customer row 17:05: tone red, available true (today's window), no reason text; the page renders none
  AGREEMENT: 2200 states, 96441 (time, category) reads: dot red by overlap ⇔ refused, 0 disagree
  ALIGNED: 1200 seeded aligned states 0 differ · 546 golden fixtures 0 differ
✅ rc=0
```

`scripts/add-order-fit-message.cjs` needed no change: its assertions are on the popup's own text and on the
panel's call to `formatFitSuffix`, neither of which this change touches. It passes in the sweep.

## 5. Verification

| Check | Result |
|---|---|
| `node scripts/run-harnesses.cjs` | **48 run · 48 passed · 0 failed — true exit code 0** |
| `npx tsc --noEmit` | **true exit code 0** |
| `npx next build` | "Compiled successfully in 5.4s", **true exit code 0** |
| `scripts/fixtures/batch-rolling-golden.json` | sha256 `8bdae817748ad334…` **before and after** — not regenerated |
| `scripts/fixtures/batch-reservation-golden-on.json` | sha256 `ce5550b7ee2a42ce…` **before and after** — not regenerated |

**eslint, changed files, against a clean HEAD worktree — delta per rule:**

| File · rule · severity | HEAD → tree |
|---|---|
| `components/dashboard/AddOrderPanel.tsx` · `react-hooks/exhaustive-deps` · warn | 7 → 1 (carried from earlier work) |
| `components/dashboard/AddOrderPanel.tsx` · `react-hooks/set-state-in-effect` · error | 5 → 4 (ditto) |
| `lib/slot-display.ts`, `app/dashboard/[token]/page.tsx` | no rule count changed |
| totals over the three files | errors 95 → 94 · warnings 39 → 33 |

No rule count rose. Colours, verdicts, offered times, placement, reservations and breaches are byte-identical:
`lib/slot-availability.ts`, `lib/capacity-breach.ts`, `lib/orders/*` and every route are absent from this diff,
and the sweep's identity harnesses all pass.

## 6. Localhost check — test-truck (Pizza Kitchen), switch ON

**A · the table, on a 5-minute grid.** Event 17:00–22:30, customer grid **Every 5 minutes**, Pizza prep 15 /
batch 8, no kitchen capacity. Place **8 pizzas collected 21:45** and **5 collected 22:10**.

1. **Empty order.** 21:40, 21:45, 21:50 and 21:55 all read `🔴 8 Pizzas` — one batch, one number, on every time it
   covers. 22:00 through 22:20 all read `🟡 5 Pizzas`. 22:25 is `🟢` with nothing.
2. **Add 3 pizzas.** Identical — three fit into the 5-pizza batch's window (5 + 3 = 8), so no verdict appears.
3. **Make it 4 pizzas.** Every amber line becomes `🟡 5 Pizzas · Won't fit`; the four red lines stay
   `🔴 8 Pizzas` with no verdict.
4. **Add a third order of 1 pizza collected 22:05.** 22:00 and 22:15 become `🟡 6 Pizzas`, and 21:55 becomes
   `🔴 9 Pizzas` — the 8 and the 1 are on the grill together there.
5. Nowhere in the list does the word **Full** or **free** appear.
6. The capacity strip and the edit picker show the same labels.

**B · a 15-minute grid, where nothing should look different.** Set Customer Collection Times to **Every 15
minutes** on the same event and place 8 pizzas at 18:30 and 8 at 19:00. Every listed time is its own batch, so
each shows its own count exactly as before this change: `18:30 🔴 8 Pizzas`, `19:00 🔴 8 Pizzas`, the rest green
and blank. No `Full`, because no time falls between batches. The Collection times hint stays hidden (15 divides
15). This is the aligned case the 546 golden fixtures cover.

**C · Gusto, look only, by you.** Prep 5 on a 5-minute grid is aligned, so no overlapped time exists there and
every dot renders exactly as it does today. Nothing to open; nothing was opened.

## 7. Anything I could not establish
- **Whether an operator prefers the count to the old free-space wording on a part-full window.** `5 Pizzas` says
  what is cooking; `3 free` said what was left. The colour still carries fullness and the popup still lists each
  window's free room, so nothing is lost, but the two answer different questions and only use will settle it.
- **The rendered width of a two-category overlapped label** (`8 Pizzas, 4 Burgers`) on a narrow iPad column —
  `DayLoadStrip` truncates with `truncate min-w-0`, but this was not rendered on a device here.
- Whether any truck other than test-truck has a **ticked** no-prep category, which is the case §3 preserves. A
  read-only query on `menu_categories.counts_toward_capacity` would answer it; I did not run one, as the
  behaviour is preserved either way.

## 8. Every modified and untracked path (128 entries, 0 staged), grouped

### COLLECTION TIMES + CAPACITY + ADD ORDER + RESERVATIONS
`M app/api/dashboard/action/route.ts` · `M app/api/dashboard/route.ts` · `M app/api/events/route.ts` · `M app/api/manage/route.ts` · `M app/api/menu/[truckId]/route.ts` · `M app/api/orders/submit/route.ts` · `M app/api/slots/[truckId]/route.ts` · **`M app/dashboard/[token]/page.tsx`** · `M app/manage/[token]/page.tsx` · `M app/trucks/[slug]/order/page.tsx` · **`M components/dashboard/AddOrderPanel.tsx`** · `M components/dashboard/CapacityBreachBanner.tsx` · `M lib/capacity-breach.ts` · `M lib/features.ts` · `M lib/orders/place-in-slot.ts` · `M lib/payments/promote-draft.ts` · `M lib/slot-availability.ts` · `M lib/slot-bookings.ts` · **`M lib/slot-display.ts`** · `M lib/slot-generation.ts` · `M lib/supabase.ts` · `? lib/capacity-refresh.ts` · `? lib/orders/cooking-reservation.ts` · `? lib/slot-fit-message.ts` · `? lib/slot-interval.ts`
(bold = this task's three source files)

### WIRED PRINTING (app, native, plugin)
`M android/app/capacitor.build.gradle` · `M android/capacitor.settings.gradle` · `M components/printing/PrintingSettings.tsx` · `M ios/App/App/Info.plist` · `M ios/App/CapApp-SPM/Package.swift` · `M lib/printing/bleTransport.ts` · `M lib/printing/transport.ts` · `M lib/printing/usePrinting.ts` · `M package-lock.json` · `M package.json` · `? app/api/printing/route.ts` · `? components/printing/PrinterTypeChoice.tsx` · `? lib/printing/netAddress.ts` · `? lib/printing/netTransport.ts` · `? lib/printing/networkGuard.ts` · `? lib/printing/testTicket.ts` · `? plugins/hatchgrab-net-printer/{Package.swift, index.d.ts, index.js, package.json, android/build.gradle, android/src/main/AndroidManifest.xml, android/src/main/java/com/hatchgrab/netprinter/NetPrinterPlugin.java, ios/Sources/NetPrinterPlugin/NetPrinterPlugin.swift}` — ⚠️ plus 34 untracked, **not ignored** build files under `plugins/hatchgrab-net-printer/android/build/…` and `plugins/hatchgrab-net-printer/.swiftpm/xcode/xcuserdata/…/xcschememanagement.plist`; a `.gitignore` entry (`plugins/**/build/`, `**/xcuserdata/`) remains proposed, not done.

### HOLD (landing, plan-features, store listing copy)
`M app/landing/page.tsx` · `M content/store-listing.md` · `M lib/plan-features.ts`

### MIGRATIONS (all five APPLIED by hand; the files are untracked)
`? supabase/migrations/20260916_collection_intervals.sql` · `? …/20260917_van_collection_intervals.sql` · `? …/20260918_event_collection_intervals.sql` · `? …/20260919_van_network_printer.sql` · `? …/20260920_orders_cooking_reservation.sql`

### INCIDENT SAFEGUARDS
`M scripts/migrate-from-sheets.cjs` · `M scripts/register-payment-domain.cjs` · `? scripts/harnesses.json` · `? scripts/run-harnesses.cjs` · `? scripts/ops-write-guard.cjs`

### HARNESSES + FIXTURES
`M scripts/whatsapp-golive-parity-harness.cjs` · `? scripts/_batch-reservation-golden-on-generate.cjs` · `? scripts/_batch-reservation-sim.cjs` · `? scripts/_batch-rolling-golden-generate.cjs` · `? scripts/_batch-rolling-snapshot.cjs` · `? scripts/_mini-dom.cjs` · `? scripts/_printing-mocks.cjs` · `? scripts/_slot-interval-compile.cjs` · `? scripts/add-order-fit-message.cjs` · `? scripts/add-order-refresh.cjs` · `? scripts/add-order-render.cjs` · `? scripts/batch-reservation-display-equals-picker.cjs` · `? scripts/batch-reservation-edit-lock.cjs` · `? scripts/batch-reservation-golden-on.cjs` · `? scripts/batch-reservation-helper.cjs` · `? scripts/batch-reservation-immutability.cjs` · `? scripts/batch-reservation-instants.cjs` · `? scripts/batch-reservation-lock.cjs` · `? scripts/batch-reservation-p2-identity.cjs` · `? scripts/batch-reservation-p3-worked-case.cjs` · `? scripts/batch-reservation-switch.cjs` · `? scripts/batch-reservation-writers.cjs` · `? scripts/batch-rolling-check.cjs` · `? scripts/batch-rolling-identity.cjs` · `? scripts/collection-times-hint.cjs` · `? scripts/customer-path-identity.cjs` · `? scripts/dev-virtual-printer.cjs` · **`? scripts/dot-overlap-labels.cjs`** · `? scripts/fixtures/{batch-reservation-golden-on.json, batch-rolling-fix.patch, batch-rolling-golden.json}` · `? scripts/printing-copy.cjs` · `? scripts/printing-dedupe.cjs` · `? scripts/printing-escpos-identity.cjs` · `? scripts/printing-failure-split.cjs` · `? scripts/printing-gating.cjs` · `? scripts/printing-network-guard.cjs` · `? scripts/printing-transport-contract.cjs` · `? scripts/sixteen-pizza-admission.cjs` · `? scripts/slot-interval-dots.cjs` · `? scripts/slot-interval-engine-identity.cjs` · `? scripts/slot-interval-event-override.cjs` · `? scripts/slot-interval-generator.cjs` · `? scripts/slot-interval-grid-routing.cjs` · `? scripts/slot-interval-settings.cjs` · `? scripts/slot-interval-van-list-tolerance.cjs` · `? scripts/slot-interval-van-resolution.cjs`

### DOCS
`? docs/add-order-fit-message-report.md` · `? docs/add-order-render-fix-report.md` · `? docs/batch-keep-together-investigation-report.md` · `? docs/batch-overlap-review-report.md` · `? docs/batch-reservation-investigation-report.md` · `? docs/batch-reservation-p0-p2-report.md` · `? docs/batch-reservation-p3-report.md` · `? docs/batch-rolling-durable-harness-report.md` · `? docs/batch-rolling-fix-report.md` · `? docs/batch-split-review-report.md` · `? docs/dashboard-order-and-batch-overlap-report.md` · `? docs/discovery-incident-followup-report.md` · `? docs/discovery-upsert-incident-report.md` · `? docs/dot-label-cooking-counts-report.md` · `? docs/dot-label-full-only-report.md` · **`? docs/dot-label-overlap-counts-report.md`** (this file) · `? docs/dot-label-wont-fit-report.md` · `? docs/dot-overlap-labels-report.md` · `? docs/edit-busy-fix-report.md` · `? docs/edit-lock-and-refresh-report.md` · `? docs/gusto-event-update-trace-report.md` · `? docs/sixteen-pizza-bug-report.md` · `? docs/slot-interval-build-report.md` · `? docs/slot-interval-event-override-report.md` · `? docs/slot-interval-hardening-report.md` · `? docs/slot-interval-van-level-report.md` · `? docs/wired-printing-build-report.md` · `? docs/wired-printing-followup-report.md` · `? docs/wired-printing-investigation-report.md`

### ANYTHING ELSE
Nothing — every one of the 128 entries is above. Two stale detached worktrees under
`/private/var/folders/…/slot-head-dots-*`, from an earlier dots-harness run, remain in `git worktree list`; they
are outside the working tree and untouched.
