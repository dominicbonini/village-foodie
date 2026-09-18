# Time-list dots — show what's cooking: STOPPED, two blockers, nothing changed

**Date:** 19 September 2026 · Localhost only · **No code was changed.** No file was edited, staged, committed,
stashed, reset or restored. The only new file is this report.
**Why:** the brief says *"State explicitly whether any aligned case changes; if one does, STOP and report it
before changing anything."* **Three classes of aligned case change** under the rule as written (§2). Separately,
**the expected table in the PROOF section does not match what the engine produces** for the two orders it names
(§3). Both are settled by measurement below, and §4 proposes a narrower rule that satisfies every hard constraint.

**No span of the prompt arrived garbled.** The two findings are not instructions contradicting each other — they
are the specification meeting the engine — so I have reported rather than chosen.

---

## STEP 0 — `git status`

**Before and after are identical: 37 modified, 90 untracked, 0 staged (127 entries).** Full grouped listing in §7.
`git add -A` / `git add .` were not run. Golden hashes unchanged and untouched:
`batch-rolling-golden.json` `8bdae817748ad334…`, `batch-reservation-golden-on.json` `ce5550b7ee2a42ce…`.

Every probe below was a temporary file under `scripts/`, run by name and deleted immediately; `scripts/` was never
globbed and no golden generator was run. No truck's data was read or written — every figure is a FIXTURE through
the compiled engine.

---

## 1. Where the label comes from today

`buildSlotIndicators` (lib/slot-display.ts) builds one `dotOccupancyAt` read per time and then:

```ts
    const ownLabel = w && (w as { peak?: boolean }).peak && rawLabel ? `peak ${rawLabel}` : rawLabel
    const overlap = ownLabel ? null : read.overlap
    const label = overlap ? formatOverlapLabel(overlap, multiCat) : ownLabel
```

- `ownLabel` — the composition of `w.byCat`, where `w` is **today's window read**: the event-start pile
  (`pileByStart`), else the single window ending at T (`byStart.get(T − step)`), else `coverDotWindows` on a
  10–30 grid. This is the `"8 Pizzas"` / `"2 Pizzas, 1 Other"` / `"peak 3 As"` label.
- `overlap` — present **only** when `ownLabel` is empty *and* the rolling read is strictly worse than the window's
  own tone. This is the branch that renders `"Full"` / `"{n} free"`.

So the two halves are disjoint: a time either has its own window load (and shows it) or it does not (and shows the
overlap reason). **The brief's change is about the second branch**; how it interacts with the first is the blocker.

## 2. 🔴 BLOCKER 1 — aligned cases change under the rule as written

The rule as written is *"Label = the rolling load of the binding cooking window for that time"*, i.e. replace the
label wholesale with `categoryLoadOver(intervals, cat, T − prep_cat, T)` per cooking category. I implemented that
as a read-only probe and compared it against today's rendering on **aligned** grids (grid a whole multiple of every
cooking prep). Three classes differ:

| Aligned case | Today | Rule as written |
|---|---|---|
| **Two cooking categories with DIFFERENT preps, both dividing the grid** — prep 5 + prep 15 on a 15-minute grid, 3 A and 4 B collected 17:15 | `17:15` → `"peak 3 As"` | `"3 As, 4 Bs"` |
| same, prep 10 + prep 30 on a 30-minute grid | `17:30` → `"peak 3 As"` | `"3 As, 4 Bs"` |
| **A ticked instant (no-prep) category beside a cooking one** — 2 pizzas + 3 drinks collected 17:10, prep 5, grid 5, ceiling 6 | `17:10` → `"2 Pizzas, 3 Drinks"` | `"2 Pizzas"` (the rolling read covers only cooking categories, so the drinks vanish) |
| **The event-start pile** — 6 pizzas at the 16:30 open, batch 4, prep 5, grid 5 | `16:30` → `"6 Pizzas"` (§31's raw piled count) | `"2 Pizzas"` (only the single pre-open run-up window) |

Aligned cases that do **not** change: single cooking category at 5-on-5 (Gusto's shape), 15-on-15, 15-on-30; two
categories with the *same* prep; a kitchen-ceiling-bound window.

Why each matters:

1. **Mixed preps.** Today's label reads one window at `T − step`, where `step` is the *shortest* prep — which is
   the documented approximation in `backwardWindowStepMins` (*"for mixed-cadence menus the single-window display is
   approximate"*). The new reading is arguably **more** correct, and it is still a change on an aligned setup.
2. **Instant categories.** `projectBackwardOccupancy` deliberately tallies ticked no-prep items into `byCat` so the
   dot can say `"Other N"` — its own comment records that as a fix. The rolling read has no concept of them, so
   they would silently disappear from every label. Gusto's own no-prep categories are `counts_toward_capacity:
   false`, so **Gusto is not affected**, but any truck that ticks one is.
3. **The event-start pile.** Manual §31 specifies this exactly: *"The 16:30 dot shows the RAW PILED COUNT = 6, tone
   = RED — 'over capacity at event-start', NOT 'amber 2 / room for 2 more'."* The rule as written would render 2.

## 3. 🔴 BLOCKER 2 — the expected table does not match the engine

The PROOF section names **two** orders — 8 pizzas collected 21:45 and 5 collected 22:10 — with prep 15, batch 8, a
5-minute grid and 3 pizzas in the order. The engine seats them as two cooking intervals, `21:30–21:45: 8` and
`21:55–22:10: 5`, switch ON and OFF alike. Against that state:

| time | brief expects | engine — rolling load over [T−15, T) | 3 pizzas fit there? |
|---|---|---|---|
| 21:45 | 🔴 `8 Pizzas` | 8 ✓ | no |
| 21:50 | 🔴 `8 Pizzas` | 8 ✓ | no |
| 21:55 | 🔴 `8 Pizzas` | 8 ✓ | no |
| **22:00** | **🟢 no label** | **5 — the 21:55–22:10 batch overlaps, so amber with a label** ✗ | yes |
| **22:10** | **🟡 `6 Pizzas · Won't fit`** | **5, not 6** ✗ · and 5 + 3 = 8 = batch, so it **fits** — no verdict ✗ | yes |
| **22:15** | **🟡 `5 Pizzas · Won't fit`** | 5 ✓, but it **fits** — no verdict ✗ | yes |
| **22:20** | **🟡 `5 Pizzas · Won't fit`** | 5 ✓, but it **fits** — no verdict ✗ | yes |
| 22:25 | 🟢 no label | 0 ✓ | yes |

Three separate mismatches:

- **22:00 cannot be green.** The 22:10 order's batch cooks `21:55–22:10`, which overlaps `[21:45, 22:00)`. Any
  label rule that reads the rolling load puts 5 there. (Today it reads `"3 free"`, amber — also not green.)
- **22:10 holds 5, not 6.** The brief's own aside — *"5 collected at 22:10 plus 1 still cooking reads '6 Pizzas'"*
  — needs a **third** order contributing 1 pizza to that window. With a 1-pizza order collected 22:05 the engine
  does produce `22:00 🟡 6 Pizzas`; with only the two orders named, it is 5.
- **The `· Won't fit` suffixes cannot appear with a 3-pizza order.** 5 + 3 = 8 is exactly the batch — amber, and it
  **fits**. A 4-pizza order (5 + 4 = 9 > 8) is refused and does carry the verdict.

## 4. The narrow rule that satisfies every hard constraint — for your approval

Change **only the `overlap` branch**, leaving `ownLabel` exactly as today:

```ts
    const label = overlap ? rollingCounts(read.perCat, rankOf) : ownLabel
```

- A time with its own window load keeps today's label, byte for byte — so the pile, instant categories and the
  mixed-prep single-window read are all untouched. **Blocker 1 disappears by construction.**
- A time with no load of its own but sharing an overlapping batch shows that batch's rolling counts instead of
  `"Full"` / `"{n} free"`. That is the whole visible change, and it is reachable **only on a misaligned grid** —
  the existing aligned proof (`1200 seeded aligned states: 0 differ`, `546 golden fixtures: 0 differ`) holds
  because `overlap` is always null there.
- `formatOverlapLabel` is deleted; every string it produced goes with it: **`Full`**, **`Pizza full`**,
  **`Kitchen full`**, **`{n} free`**, **`Pizza: {n} free`**, **`Kitchen: {n} free`**.
- The kitchen ceiling keeps driving colour through `dotOccupancyAt`; when it binds, the label becomes the window's
  per-category item counts, with no "Kitchen" wording — as the brief asks.
- `formatFitSuffix` is untouched: `· Won't fit` on green and amber only, never on red.
- One shared helper still feeds all three operator surfaces, and it reads the same `dotOccupancyAt` result the
  colour reads.

**What the brief's scenario would then render** (measured, switch ON; OFF is identical here):

| time | with 3 pizzas in the order | with 4 pizzas |
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

21:40 through 21:55 all read `8 Pizzas` — the same batch on four listed times, which is the intended "a batch
spanning several times shows the same number on each". Adding a 1-pizza order at 22:05 gives the `6 Pizzas` the
brief describes, at 22:00 and 22:15.

## 5. What I need from you

Pick one and I will build it in a single pass with the harness the brief specifies:

- **(a) The narrow rule above** — my recommendation. Aligned stays byte-identical, §31's pile survives, ticked
  instant items keep their place in the label, and every `Full` / `free` string goes. I would assert the corrected
  table in §4 rather than the one in the brief.
- **(b) The rule as written**, accepting the three aligned changes in §2. Then say which of the three you want: in
  particular whether the event-start dot should stop showing §31's piled count, and whether ticked instant items
  should disappear from the label. That is a manual §31 change as well as a code change.
- **(c) The narrow rule plus a deliberate extra** — e.g. keep the pile and instant items, but also fold a
  longer-prep category's overlapping batch into a mixed-prep label. That fixes the approximation in §2.1 on
  purpose rather than as a side effect.

If you want the brief's table asserted verbatim, tell me which third order to add to the fixture (a 1-pizza order
collected 22:05 reproduces the `6 Pizzas`) and what basket size to use (4, not 3, to make the verdict appear).

## 6. Anything I could not establish

- **Whether Dominic's 22:00/22:10 expectations came from a board with a third order on it.** The figures fit a
  board carrying one extra pizza in the 21:55–22:10 window; with only the two orders named they do not. I did not
  query any live board — the live-truck rule and the read-only scope both point away from it, and it would not tell
  me what was on screen at the time.
- **Whether any truck other than test-truck has a ticked no-prep category**, which is what makes §2 case 3 visible
  in production. A read-only query on `menu_categories.counts_toward_capacity` would answer it; I did not run one
  because no change is being made yet.

## 7. Every modified and untracked path (127 entries, 0 staged), grouped — unchanged by this task

**Nothing in this listing changed during this task except the addition of this report.**

### COLLECTION TIMES + CAPACITY + ADD ORDER + RESERVATIONS
`M app/api/dashboard/action/route.ts` · `M app/api/dashboard/route.ts` · `M app/api/events/route.ts` · `M app/api/manage/route.ts` · `M app/api/menu/[truckId]/route.ts` · `M app/api/orders/submit/route.ts` · `M app/api/slots/[truckId]/route.ts` · `M app/dashboard/[token]/page.tsx` · `M app/manage/[token]/page.tsx` · `M app/trucks/[slug]/order/page.tsx` · `M components/dashboard/AddOrderPanel.tsx` · `M components/dashboard/CapacityBreachBanner.tsx` · `M lib/capacity-breach.ts` · `M lib/features.ts` · `M lib/orders/place-in-slot.ts` · `M lib/payments/promote-draft.ts` · `M lib/slot-availability.ts` · `M lib/slot-bookings.ts` · `M lib/slot-display.ts` · `M lib/slot-generation.ts` · `M lib/supabase.ts` · `? lib/capacity-refresh.ts` · `? lib/orders/cooking-reservation.ts` · `? lib/slot-fit-message.ts` · `? lib/slot-interval.ts`

### WIRED PRINTING (app, native, plugin)
`M android/app/capacitor.build.gradle` · `M android/capacitor.settings.gradle` · `M components/printing/PrintingSettings.tsx` · `M ios/App/App/Info.plist` · `M ios/App/CapApp-SPM/Package.swift` · `M lib/printing/bleTransport.ts` · `M lib/printing/transport.ts` · `M lib/printing/usePrinting.ts` · `M package-lock.json` · `M package.json` · `? app/api/printing/route.ts` · `? components/printing/PrinterTypeChoice.tsx` · `? lib/printing/netAddress.ts` · `? lib/printing/netTransport.ts` · `? lib/printing/networkGuard.ts` · `? lib/printing/testTicket.ts` · `? plugins/hatchgrab-net-printer/{Package.swift, index.d.ts, index.js, package.json, android/build.gradle, android/src/main/AndroidManifest.xml, android/src/main/java/com/hatchgrab/netprinter/NetPrinterPlugin.java, ios/Sources/NetPrinterPlugin/NetPrinterPlugin.swift}` — ⚠️ plus 34 untracked, **not ignored** build files under `plugins/hatchgrab-net-printer/android/build/…` and `plugins/hatchgrab-net-printer/.swiftpm/xcode/xcuserdata/…/xcschememanagement.plist`; a `.gitignore` entry (`plugins/**/build/`, `**/xcuserdata/`) remains proposed, not done.

### HOLD (landing, plan-features, store listing copy)
`M app/landing/page.tsx` · `M content/store-listing.md` · `M lib/plan-features.ts`

### MIGRATIONS (all five APPLIED by hand; the files are untracked)
`? supabase/migrations/20260916_collection_intervals.sql` · `? …/20260917_van_collection_intervals.sql` · `? …/20260918_event_collection_intervals.sql` · `? …/20260919_van_network_printer.sql` · `? …/20260920_orders_cooking_reservation.sql`

### INCIDENT SAFEGUARDS
`M scripts/migrate-from-sheets.cjs` · `M scripts/register-payment-domain.cjs` · `? scripts/harnesses.json` · `? scripts/run-harnesses.cjs` · `? scripts/ops-write-guard.cjs`

### HARNESSES + FIXTURES
`M scripts/whatsapp-golive-parity-harness.cjs` · `? scripts/_batch-reservation-golden-on-generate.cjs` · `? scripts/_batch-reservation-sim.cjs` · `? scripts/_batch-rolling-golden-generate.cjs` · `? scripts/_batch-rolling-snapshot.cjs` · `? scripts/_mini-dom.cjs` · `? scripts/_printing-mocks.cjs` · `? scripts/_slot-interval-compile.cjs` · `? scripts/add-order-fit-message.cjs` · `? scripts/add-order-refresh.cjs` · `? scripts/add-order-render.cjs` · `? scripts/batch-reservation-display-equals-picker.cjs` · `? scripts/batch-reservation-edit-lock.cjs` · `? scripts/batch-reservation-golden-on.cjs` · `? scripts/batch-reservation-helper.cjs` · `? scripts/batch-reservation-immutability.cjs` · `? scripts/batch-reservation-instants.cjs` · `? scripts/batch-reservation-lock.cjs` · `? scripts/batch-reservation-p2-identity.cjs` · `? scripts/batch-reservation-p3-worked-case.cjs` · `? scripts/batch-reservation-switch.cjs` · `? scripts/batch-reservation-writers.cjs` · `? scripts/batch-rolling-check.cjs` · `? scripts/batch-rolling-identity.cjs` · `? scripts/collection-times-hint.cjs` · `? scripts/customer-path-identity.cjs` · `? scripts/dev-virtual-printer.cjs` · `? scripts/dot-overlap-labels.cjs` · `? scripts/fixtures/{batch-reservation-golden-on.json, batch-rolling-fix.patch, batch-rolling-golden.json}` · `? scripts/printing-copy.cjs` · `? scripts/printing-dedupe.cjs` · `? scripts/printing-escpos-identity.cjs` · `? scripts/printing-failure-split.cjs` · `? scripts/printing-gating.cjs` · `? scripts/printing-network-guard.cjs` · `? scripts/printing-transport-contract.cjs` · `? scripts/sixteen-pizza-admission.cjs` · `? scripts/slot-interval-dots.cjs` · `? scripts/slot-interval-engine-identity.cjs` · `? scripts/slot-interval-event-override.cjs` · `? scripts/slot-interval-generator.cjs` · `? scripts/slot-interval-grid-routing.cjs` · `? scripts/slot-interval-settings.cjs` · `? scripts/slot-interval-van-list-tolerance.cjs` · `? scripts/slot-interval-van-resolution.cjs`

### DOCS
`? docs/add-order-fit-message-report.md` · `? docs/add-order-render-fix-report.md` · `? docs/batch-keep-together-investigation-report.md` · `? docs/batch-overlap-review-report.md` · `? docs/batch-reservation-investigation-report.md` · `? docs/batch-reservation-p0-p2-report.md` · `? docs/batch-reservation-p3-report.md` · `? docs/batch-rolling-durable-harness-report.md` · `? docs/batch-rolling-fix-report.md` · `? docs/batch-split-review-report.md` · **`? docs/dot-label-cooking-counts-report.md`** (this file — the only addition) · `? docs/dashboard-order-and-batch-overlap-report.md` · `? docs/discovery-incident-followup-report.md` · `? docs/discovery-upsert-incident-report.md` · `? docs/dot-label-full-only-report.md` · `? docs/dot-label-wont-fit-report.md` · `? docs/dot-overlap-labels-report.md` · `? docs/edit-busy-fix-report.md` · `? docs/edit-lock-and-refresh-report.md` · `? docs/gusto-event-update-trace-report.md` · `? docs/sixteen-pizza-bug-report.md` · `? docs/slot-interval-build-report.md` · `? docs/slot-interval-event-override-report.md` · `? docs/slot-interval-hardening-report.md` · `? docs/slot-interval-van-level-report.md` · `? docs/wired-printing-build-report.md` · `? docs/wired-printing-followup-report.md` · `? docs/wired-printing-investigation-report.md`

### ANYTHING ELSE
Nothing. Two stale detached worktrees under `/private/var/folders/…/slot-head-dots-*` from an earlier dots-harness
run remain in `git worktree list`; they are outside the working tree and untouched.

**Not run, because no code changed:** `node scripts/run-harnesses.cjs`, `tsc --noEmit`, `next build`, the eslint
delta. The goldens were read, not run against: `8bdae817748ad334…` and `ce5550b7ee2a42ce…`, both unchanged.
