# Time list — span totals and crosses: STOPPED on three contradictions, with the measurements

**Date:** 19 September 2026 · Localhost only · **No source file was changed this turn.** Nothing was staged,
committed, stashed, reset or restored; `git add -A` / `git add .` were not run. The only new file is this report.

**Why I stopped rather than chose.** The brief says twice: *"if any aligned case changes, STOP and report it
before changing anything"* and *"if any instruction contradicts another, STOP and ask rather than choosing."*
Three contradictions are in the brief, and one of them is exactly the stop condition it names. All three are
settled by measurement below, and each has a recommendation, so a one-line answer from you unblocks the build.

**One thing is already done:** the "peak" removal (CHANGE 1's first half) was completed in the previous turn and
is in the tree — §1 lists every occurrence. Nothing about it is pending.

---

## STEP 0 — `git status`

**Before and after are identical: 37 modified, 100 untracked, 0 staged (137 entries).** Full grouped listing in
§7. Goldens unchanged and untouched: `batch-rolling-golden.json` `8bdae817748ad334…`,
`batch-reservation-golden-on.json` `47f228964849f4a5…`. Every measurement below came from a temporary probe under
`scripts/`, run by name and deleted immediately; `scripts/` was never globbed, no golden generator was run, and no
live truck or database was touched — every figure is a fixture through the compiled engine.

---

## 1. "peak" — done last turn, listed here for completeness

**Exactly one rendered string existed**, in `buildSlotIndicators` (`lib/slot-display.ts`):

```ts
    const ownLabel = w && (w as { peak?: boolean }).peak && rawLabel ? `peak ${rawLabel}` : rawLabel   // was
    const ownLabel = rawLabel                                                                          // now
```

| Before | After |
|---|---|
| `peak 2 Pizzas` · `peak 1 Pizza` · `peak 3 As` · `peak 3 As, 5 Bs` · `peak 4 As, 1 B` · `peak 7 As` · `peak 1 A, 4 Bs` | `2 Pizzas` · `1 Pizza` · `3 As` · `3 As, 5 Bs` · `4 As, 1 B` · `7 As` · `1 A, 4 Bs` |

**Internal identifiers kept** (renaming them would touch the engine for a wording change): `peakLoadOver`,
`windowScopedPeak`, `maxConcurrentCount`'s local `peak`, `peakDetailOver`, `CoveredDotWindow.peak` (the flag
`coverDotWindows` sets), `FitWhy.peak`, `lib/seed-demo-orders.ts`'s `peakBatch`. Verified: no rendered string in
`app`, `components` or `lib` contains the word.

## 2. 🔴 CONTRADICTION A — "aligned must be byte-identical" vs your own worked case

The brief defines aligned as **"grid a whole multiple of every cooking prep"** and requires those setups to be
byte-identical. It then requires *"Dominic's case (batch 2, prep 5, **10-minute grid**, two full batches in the
span): **🔴 4 Pizzas**"*. **10 is a whole multiple of 5**, so that case is aligned by the brief's own test — and
it must change from `2 Pizzas` to `4 Pizzas`. Both cannot hold.

Measured, with the proposed label in a patched copy of `lib/`:

| Family | States | Differ |
|---|---|---|
| **grid == prep** — Gusto's 5 on 5, and 15 on 15 (**both of your named examples**) | 160 | **0** |
| **grid a WIDER multiple of prep** — 10-on-5, 15-on-5, 30-on-15, 20-on-5 | 200 | **76** |
| **colours**, across every family above | 360 | **0 — no tone moved** |

Your headline case, exactly:
```
10:40   now "🔴 2 Pizzas"   →   proposed "🔴 4 Pizzas"     ← what you asked for
```
and examples of the wider-multiple change:
```
grid 30 / prep 15 / batch 8   18:00   now "🟡 3 Pizzas"  →  "🟡 9 Pizzas"
grid 30 / prep 15 / batch 8   18:30   now "🟡 4 Pizzas"  →  "🟡 12 Pizzas"
```

**The reading that makes the brief consistent:** *aligned* means **grid EQUALS the prep**, not "a multiple of" it.
Both examples you named (5 on 5, 15 on 15) are grid == prep, and those are **0 of 160** — byte-identical. Every
wider-multiple case changing is the whole point of the change, not a regression.
**→ I need you to confirm that reading before I touch the label.**

## 3. 🔴 CONTRADICTION B — the span formula gives 2, not 4

The brief gives the span two ways: *"the TOTAL items cooked in **the span that dot covers**"* and, in the same
sentence, *"every batch overlapping **[T − prep, T)**"*. On your 10-minute grid with a 5-minute cook those differ:

- `[T − prep, T)` = `[10:35, 10:40)` — **one** cooking window — → **2 Pizzas**, not the 4 you specified;
- **the span the dot covers** = `(T_prev, T]` worth of windows = `[10:30, 10:40)` — **two** windows — → **4 Pizzas** ✓.

**The reading that makes both your sentence and your example true:** the span is
**`[T − max(prep, grid), T)`** — the cooking window ending at T plus everything the dot covers when the grid is
wider than the prep. That is what I measured above, and it gives `8 Pizzas` (not 16) for the prep-15-on-5 case
you also named, because each distinct batch is counted once.
**→ Confirm and I will implement exactly that.**

## 4. 🔴 BLOCKER C — the time list is a native `<select>`; a cross through the dot cannot be drawn

`AddOrderPanel` renders the Add Order time list as a **native `<select>` with `<option>` children**
(`SLOT_SELECT_CLASS` / `SLOT_SELECT_STYLE`), and the coloured "dot" is an **emoji character inside the option's
text** — `{s.collection_time} {ind.emoji}…`. There is no custom listbox anywhere in the operator surfaces
(searched `components` and `app` for `role="listbox"` / `combobox`: none).

That makes three of Change 2's requirements impossible as written:

| Required | Why it cannot be done in a native `<select>` |
|---|---|
| "the coloured dot carries a **CROSS through it**", "white stroke with a thin dark edge" | An `<option>` renders OS-drawn text. There is no element to stroke, and the dot is an emoji glyph whose colour the OS owns — so **no stroke, and no contrast ratio to quote**. The combining overlay U+0338 is the only in-text approximation and renders inconsistently over emoji. |
| "the **whole row is greyed**" | Per-option styling is **ignored on macOS and iOS** (the platforms your operators use — your own screenshot is the macOS popup). The code already tries this — `style={wontFit ? { color: '#94a3b8' } : undefined}` — and it does nothing there. |
| "**aria-disabled** or the equivalent … and the row **stays tappable**" | `<option disabled>` is the only disabled state an option has, and it makes the row **unselectable** — which contradicts "the row stays tappable, and tapping still opens the popup". |

**Your options, and my recommendation:**

- **(a) Replace the native `<select>` with a custom listbox** — the only way to get a real stroked cross, a greyed
  row, `aria-disabled`, and quotable contrast figures. **This is what the brief describes.** It is *not*
  "display only": it changes a control every operator uses on a phone at a hatch (keyboard behaviour, scroll,
  the iOS wheel, VoiceOver). I would want it as its own task with its own proof.
- **(b) A text cross inside the option** — `12:10 🟢 ✕ Not enough time`. Works on every platform today, no control
  change, no contrast question (the ✕ takes the option's own text colour). It is not a cross *through* the dot,
  and there is no greying on macOS/iOS. **My recommendation if you want this shipped now.**
- **(c) Leave Change 2 and take Change 1 only.**

## 5. What Change 2 would and would not touch — confirmed

- **The capacity strip and the edit picker are NOT affected**: `formatFitSuffix` and the cross would be driven by
  `manualFitWhy`, which exists only in `AddOrderPanel` (there is no order in progress on the other two surfaces),
  so neither renders a verdict or a cross today and neither would.
- **The customer page is untouched** — it renders no operator reason at all (asserted already by
  `scripts/dot-overlap-labels.cjs`).
- **The resulting combinations**, under the brief's rule (verdict text on green/amber only, cross on any refused
  time):

| Dot | Order fits | Renders |
|---|---|---|
| 🟢 | yes | `12:20 🟢` |
| 🟢 | no | cross + grey + `Not enough time` |
| 🟡 | yes | `12:15 🟡 1 Pizza` |
| 🟡 | no | cross + grey + `1 Pizza · Not enough time` |
| 🔴 | yes | `11:00 🔴 2 Pizzas` (possible: red is peak-at-capacity, and a small order can still fit) |
| 🔴 | no | cross + grey + `2 Pizzas`, **no verdict text** |

## 6. Verification

Not run, because **no code changed**. The tree was left exactly as the previous turn's verification found it:
`node scripts/run-harnesses.cjs` **51 run · 51 passed · 0 failed**, `tsc --noEmit` **0**, `next build` **0**, and
both goldens at the hashes in STEP 0 (read, not regenerated).

**What I will run once you answer:** the full sweep, `tsc`, `next build`, the eslint delta, and the harness
assertions the brief lists — your 10-on-5 case reading `4 Pizzas`; prep-15-on-5 still reading `8 Pizzas`, not 16;
grid == prep identical across the 1,200 seeded states and 546 fixtures; cross-agreement over 2,000+ fixture
states (a row crossed **iff** `fitOrderBackward` refuses it); a span-total-over-batch case staying green/amber and
uncrossed; and the broken variants (peak used as the label, total used for the colour, `peak ` restored, crosses
driven by colour, crosses with an empty order).

**The goldens will need regenerating for Change 1** on the wider-multiple families, and I will list every entry
before and after and confirm no tone or verdict differs — the 360-state measurement above already shows **0 tone
changes**, which is the condition your brief sets for allowing it.

## 7. Anything I could not establish

- **Which platforms your operators actually use the list on.** The blocker in §4 is absolute on macOS and iOS and
  partial on Android/Chrome (where option `color` does apply). If the native app is Android-only in practice, (b)
  would at least grey correctly there — I did not want to assume.
- **Whether you want the span total on the capacity strip and the edit picker too.** Change 1 is written as "the
  dot's LABEL", and all three surfaces share `buildSlotIndicators`, so the total would appear on all three unless
  you want it confined to Add Order. I have assumed all three (one shared helper, as the brief also requires).

## 8. Every modified and untracked path (137 entries, 0 staged), grouped — unchanged this turn

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
34 existing reports, plus **`? docs/time-list-crosses-and-totals-report.md`** (this file — the only addition).

### ANYTHING ELSE
Nothing. Two stale detached worktrees under `/private/var/folders/…/slot-head-dots-*` from an earlier run remain
in `git worktree list`; they are outside the working tree and untouched.
