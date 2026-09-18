# Time list — span totals and a text cross

**Date:** 19 September 2026 · Display only · Localhost only; nothing deployed, nothing committed, nothing staged.
**Files changed:** `lib/slot-display.ts` (the label), `components/dashboard/AddOrderPanel.tsx` (the marker), and
six harnesses — `dot-overlap-labels.cjs`, `slot-interval-dots.cjs`, `add-order-refresh.cjs`,
`add-order-refresh-inputs.cjs`, `peak-load-rule.cjs`, `peak-ceiling-rule.cjs`, plus `batch-rolling-identity.cjs`
(its recorded baseline delta). `scripts/fixtures/batch-reservation-golden-on.json` regenerated (§6).
**Scripts run:** `node scripts/run-harnesses.cjs` and, by name, the harnesses above plus the two golden identity
ones. `scripts/` was never globbed; the only generator run was the one this brief authorises (§6). No live truck
was touched and no database was read or written — every figure is a fixture through the compiled engine.

**Nothing arrived garbled, and your three answers removed the contradictions I stopped on.** One correction to my
own §2 measurement is reported in §3: a corner case where the span total needed a floor.

---

## STEP 0 — `git status`

**Before:** 37 modified, 101 untracked, 0 staged (138 entries).
**After:** 37 modified, 102 untracked, 0 staged (139 entries) — the same listing plus this report.
Full grouped listing in §10.
committed, stashed, reset or restored.

---

## 1. CHANGE 1 — the label is the span total

`buildSlotIndicators` (`lib/slot-display.ts`): `tonesNumber` → **`spanNumber`**.

```ts
    const spanNumber = (cat: string, own: number): number => {
      const c = cat.toLowerCase()
      if (!batchOf.has(c)) return own                            // instant, ticked category: its own count
      const T = toMins(s.collection_time)
      if (w && back.pileByStart.has(w.startMins) && (T === eventStartMins || slotIndex === 0)) return own   // §31 pile
      const prep = Math.max(1, Math.round((catConfigs[c]?.secs ?? 0) / 60))
      const from = T - Math.max(prep, intervalMins)
      let total = 0
      for (const iv of back.intervals) {
        if (iv.cat !== c || iv.items <= 0 || iv.endMins <= iv.startMins) continue
        if (iv.startMins < T && from < iv.endMins) total += iv.items          // half-open, each batch once
      }
      const rem = w ? w.remainingByCat[c] : undefined
      const toneNumber = typeof rem === 'number' && Number.isFinite(rem) ? batchOf.get(c)! - rem : 0
      return Math.max(total, toneNumber)
    }
```

**The span is `[T − max(prep, grid), T)`, exactly as you confirmed.** A finer grid than the prep (15-minute cook,
5-minute times) means one cooking window reaches back past several listed times, so the same batch is named on
each of them — **8, never 16**, because each distinct batch is counted once. A wider grid than the prep (5-minute
cook, 10-minute times) means one dot covers several consecutive batches, and it totals them — **4 Pizzas**.

The label feeds all three operator surfaces through the one shared helper, as you asked (D): the capacity strip,
the Add Order list and the edit picker.

**The colour is untouched** — `dotOccupancyAt`'s peak concurrent load against the batch and the kitchen cap.
Measured across 360 states spanning every grid/prep combination: **0 tones moved**.

### Measured, every case you named

| Case | Reads |
|---|---|
| 10-minute times, 5-minute cook, batch 2, two full batches | **`10:40 🔴 4 Pizzas`** (was `2 Pizzas`) |
| 15-minute cook on 5-minute times, batch 8, one batch of 8 | **`21:45 / 21:50 / 21:55 🔴 8 Pizzas`** — never 16 |
| 30-minute times, 15-minute cook, batch 8 | **`18:00 🟡 9 Pizzas`**, **`18:30 🟡 12 Pizzas`** |
| total over the batch, peak under it — three back-to-back 2s on a batch of 4 | **`10:45 🟡 6 Pizzas`**, amber, **no cross** |
| §31 event-start pile, 6 @16:30 batch 4 | **`16:30 🔴 6 Pizzas`** — the raw piled count, unchanged |
| ticked no-prep beside a cooking category | **`17:10 🔴 2 Pizzas, 3 Drinks`** — unchanged |

## 2. The aligned evidence — grid EQUALS the prep

Against a copy of the tree with the span held at the prep alone (the pre-change label):

| Family | States | Differ |
|---|---|---|
| Gusto's 5-on-5 and 15-on-15, colour **and** label | 320 (ON and OFF) | **0** |
| the same with kitchen ceilings and ticked instant items | 320 | **0** |
| `gustoShaped` golden family (batch 2, prep 5, kc 2, 5-minute grid) | 300 | **0** |
| `sweep1515` golden family (batch 8, prep 15, 15-minute grid, four event starts) | 20,000 | **0** |
| §31 worked examples · Gusto's six live events | 8 · 6 | **0 · 0** |

Wider multiples changing is the change, as you confirmed (A).

## 3. One correction to my own §2 measurement — a floor was needed

My stop-report measured the span total alone. Building it surfaced a corner the measurement had not: **at the
event-start run-up the total came out BELOW the number the colour was decided from.** A cohort that spreads back
before the open lives in the window builder's own `cookIntervals` (so the tone sees it) but not in the exported
`back.intervals` the label loop reads, so a dot could read `🔴 1 Pizza` on a batch of 2 — the very bug
`docs/dot-label-red-total-report.md` closed. `spanNumber` therefore floors at `batch − remainingByCat` (the
tone's own number). It changes nothing elsewhere: where the grid equals the prep the two are equal, and on wider
grids the total is the larger. Caught by the existing invariant sweep — 3,008 red dots, **0 now labelled below
the batch**.

A second corner: the `pileByStart` map is keyed at the event start, and an ordinary cooking window can start
there too, so the first guard silenced a real window's total. It now fires only on the dot that actually reads
the pile — the dot at the event start, or the first listed dot on a 10–30 grid.

## 4. CHANGE 2 — the text cross

In `AddOrderPanel`, two constants and one expression:

```ts
  const CROSS_MARK = '✕ '        // ✕ + space — this order cannot be ready by then
  const BLANK_MARK = '  '        // FIGURE SPACE + space — the same width, no mark
  …
  const mark = hasItems ? (wontFit ? CROSS_MARK : BLANK_MARK) : ''
  return <option … style={wontFit ? { color: '#94a3b8' } : undefined}>{mark}{s.collection_time} {ind.emoji}…
```

**The alignment marker is U+2007 FIGURE SPACE plus a normal space** — a figure space is defined as the width of a
digit, the closest stable match to ✕ in the system font an `<option>` is drawn in, so the times stay in a column.

| Before | After |
|---|---|
| `22:10 🟡 6 Pizzas · Not enough time` | `✕ 22:10 🟡 10 Pizzas · Not enough time` |
| `22:15 🟡 5 Pizzas` | `␣ 22:15 🟡 5 Pizzas` (figure space) |
| `21:45 🔴 12 Pizzas` | `✕ 21:45 🔴 12 Pizzas` — cross and count, **no verdict text** |
| empty order: `22:10 🟡 6 Pizzas` | `22:10 🟡 6 Pizzas` — **no marker at all** |

- **Never `disabled`** — asserted against the rendered markup. A crossed row stays selectable, so tapping it
  still raises **"Can't be ready by {T}"** with "Place it anyway", and it keeps its place in the tab order and in
  VoiceOver's rota. The cross and the words "Not enough time" are in the option's own text, so the state is
  announced rather than conveyed by colour.
- **The `color: '#94a3b8'` style is kept** as you asked. ⚠️ **macOS and iOS ignore per-option styling entirely**,
  so no greying appears there — including in your own screenshot's popup. **Android and desktop Chrome do grey.**
  The cross is the part that works everywhere.
- **The capacity strip and the edit picker get no cross** — confirmed: the marker is driven by `manualFitWhy`,
  which exists only in `AddOrderPanel`; there is no order in progress on the other two surfaces and neither
  renders a verdict or a marker.
- **The customer page is untouched.**

## 5. The harnesses

### `scripts/dot-overlap-labels.cjs` — failure mode: the dot naming the wrong quantity, or the cross disagreeing with the picker

**Broken variants, run FIRST — all twelve FAILED as required**, the four this brief names in bold:

| | Variant | Result |
|---|---|---|
| **V11** | **the PEAK used as the label** | ✓ FAILED: 10-on-5 reads `"10:40 🔴 2 Pizzas"` (must be 4) |
| **V12** | **the TOTAL used for the colour** | ✓ FAILED: total 6 on a batch of 4 with a peak of 2 turned `🔴` (must stay amber) |
| **V10** | the largest single batch instead of the total | ✓ FAILED: `"10:40 🔴 2 Pizzas"` |
| V9 | the seated count as the label | ✓ FAILED: `"22:00 🟡 1 Pizza"` |
| V1, V2, V3, V3b, V4, V4b, V5, V6, V7, V8 | the earlier ten | ✓ all FAILED |

**Real result:** the four span cases above; **the cross** — 6 crossed and 3 blank of 9 rows, every row carrying a
marker of the same width, crossed rows keeping their dot and count, 3 red-crossed rows with **no** verdict text,
3 green/amber-crossed rows **every one explained**, no uncrossed row carrying a verdict, ON and OFF alike; **an
empty order** — no cross, no marker, no verdict anywhere; **no `<option>` disabled** and the crosses present in
the markup; **CROSS AGREEMENT — 2,400 rendered rows across 120 seeded states** (preps 5/10/15, batches 2/4/8,
grids 5/10/15, kc null/6, ON and OFF): a row is crossed **if and only if** `fitOrderBackward` refuses that order
at that time, **0 disagree**; the invariant sweep (3,008 red dots, 0 below the batch); AGREEMENT 2,200 states 0
disagree; **1,200 seeded aligned states and 546 golden fixtures, 0 dots differ**.

### The others
`slot-interval-dots.cjs` — C1's covered dot re-targeted from the peak (2) to the span total (3), with the reason
in the assertion; its own broken variants still fail first, and the 68 interval-5 cases stay byte-identical to
HEAD. `add-order-refresh.cjs` / `add-order-refresh-inputs.cjs` — their option readers now strip the leading
marker (the figure space is whitespace, which the old collapse-and-trim erased). `peak-load-rule.cjs` /
`peak-ceiling-rule.cjs` — label expectations moved to the span total; **every tone, `fits` and kitchen assertion
is unchanged**, and the "one number" identity now names the peak's three readers only, because the dot's label is
deliberately a different quantity (asserted in the two dot harnesses instead).

## 6. The golden outcome

| | Before | After |
|---|---|---|
| `scripts/fixtures/batch-rolling-golden.json` | `8bdae817748ad334…` | **`8bdae817748ad334…` — UNCHANGED** |
| `scripts/fixtures/batch-reservation-golden-on.json` | `47f228964849f4a5…` | **`de2596323d7a218c…` — regenerated** |

Both identity harnesses were run first. Both failed on **one family only — `aligned240`** (147 of 240);
`§31`, `gustoShaped`, `sweep1515` and `gustoLive` passed 0 differ.

**Label-only, proven two ways before anything was regenerated:**
1. the three stored full outputs differ in **7 label strings and 0 fields of any other kind** (tone, emoji,
   overTotal, occ, windows, fits, asap, breaches):
   `"peak 3 As" → "7 As"` · `"peak 3 As, 5 Bs" → "6 As, 5 Bs"` · `"peak 3 As" → "6 As"` · `"peak 3 As" → "5 As"` ·
   `"peak 4 As, 1 B" → "4 As, 5 Bs"` · `"peak 7 As" → "9 As"` · `"peak 1 A, 4 Bs" → "4 As, 4 Bs"`;
2. reconstructing the baseline's **own** label rule (the peak span plus the retired `peak ` prefix) on today's
   engine reproduces **every** golden digest exactly — **300 gustoShaped + 20,000 sweep1515 + 240 aligned240, 0
   differ**. Nothing but the label text moved.

**`batch-reservation-golden-on.json` was regenerated** — it pins current switch-ON behaviour, which is what
regeneration is for. New sha256 `de2596323d7a218c6a611792084f99b0063bd07c4075482d19e7553a0a9a2477`. Regenerated
for the span-total label alone; **0 tone and 0 verdict differences**.

**The rolling baseline's recorded delta, afterwards.** `batch-rolling-golden.json` is the **pre-fix baseline** and
its generator refuses without `BATCH_FROZEN_ROOT`, so it was not regenerated. Its delta — previously "the retired
`peak ` prefix" — is now **the whole baseline label rule**: `batch-rolling-identity.cjs` compiles one extra copy
of the working tree with two lines put back (the prep-only span, and the `peak ` prefix) and digests **that**
against the frozen file. Every other field is still compared byte for byte, so a regression anywhere outside the
label text still fails there. ⚠️ **This is the second time the label has moved under that baseline.** The delta is
documented at `same()`, but it is now large enough that I would rather regenerate the file against a frozen root
than keep widening it — say the word and it is a separate, small task.

## 7. Verification

| Check | Result |
|---|---|
| `node scripts/run-harnesses.cjs` | **51 run · 51 passed · 0 failed — true exit code 0** |
| `npx tsc --noEmit` | **true exit code 0** |
| `npx next build` | "Compiled successfully in 5.2s", **true exit code 0** |
| eslint vs a clean HEAD worktree (`lib/slot-display.ts`, `components/dashboard/AddOrderPanel.tsx`) | `react-hooks/exhaustive-deps` warn **7 → 1**, `react-hooks/set-state-in-effect` error **5 → 4**, both carried from earlier work; **no rule count rose**; totals 10 errors/11 warnings → 9/5 |

Verdicts, colours, offered times, placement, reservations and breaches are byte-identical, switch ON and OFF —
the label is the only rendered change, and the cross is added text.

## 8. Localhost check — test-truck (Pizza Kitchen)

1. **Your board, 3 pizzas in the order.** Open Add Order and the time list. Refused times lead with **`✕ `**;
   pickable times lead with a blank of the same width, so the column is straight. A refused green or amber row
   ends `· Not enough time`; a refused red row shows the cross and its count and nothing more. **Tap a crossed
   time** — the picker still takes it and Confirm raises **"Can't be ready by {T}"** with "Place it anyway".
2. **Empty the basket.** Every cross and every marker disappears; the list is exactly as it was.
3. **10-minute times with a 5-minute cook** (Pizza batch 2): place 2 pizzas at 10:35 and 2 at 10:40. The 10:40 dot
   reads **`4 Pizzas`** — what comes out of that ten minutes — and stays red because the oven holds 2 at once.
4. **A 5-minute grid is unchanged**: set the times to every 5 minutes with a 5-minute cook and every label reads
   exactly as before.
5. **Android or desktop Chrome** will also grey a refused row; **macOS and iOS will not** — the cross is the mark
   that works everywhere.

## 9. Anything I could not establish

- **How ✕ and the figure space measure in the exact system font** of every platform's option list. A figure space
  is the width of a digit by definition and ✕ is close to it, but I could not render the native popup here to
  confirm the column is pixel-straight on iOS. If it looks off, two ordinary spaces is a one-line change.
- **Whether you want the span total on the strip and the edit picker** — you said yes (D), and all three share the
  helper, so they have it. It is worth a look on the strip, where the numbers are now larger than before on any
  truck whose times are wider than its cook.
- **Whether the rolling baseline should be regenerated** against a frozen root rather than carrying a widening
  delta (§6).

## 10. Every modified and untracked path (139 entries, 0 staged), grouped

### COLLECTION TIMES + CAPACITY + ADD ORDER + RESERVATIONS
`M app/api/dashboard/action/route.ts` · `M app/api/dashboard/route.ts` · `M app/api/events/route.ts` · `M app/api/manage/route.ts` · `M app/api/menu/[truckId]/route.ts` · `M app/api/orders/submit/route.ts` · `M app/api/slots/[truckId]/route.ts` · `M app/dashboard/[token]/page.tsx` · `M app/manage/[token]/page.tsx` · `M app/trucks/[slug]/order/page.tsx` · **`M components/dashboard/AddOrderPanel.tsx`** · `M components/dashboard/CapacityBreachBanner.tsx` · `M lib/capacity-breach.ts` · `M lib/features.ts` · `M lib/orders/place-in-slot.ts` · `M lib/payments/promote-draft.ts` · `M lib/slot-availability.ts` · `M lib/slot-bookings.ts` · **`M lib/slot-display.ts`** · `M lib/slot-generation.ts` · `M lib/supabase.ts` · `? lib/capacity-refresh.ts` · `? lib/orders/cooking-reservation.ts` · `? lib/slot-fit-message.ts` · `? lib/slot-interval.ts`

### WIRED PRINTING (app, native, plugin)
`M android/app/capacitor.build.gradle` · `M android/capacitor.settings.gradle` · `M components/printing/PrintingSettings.tsx` · `M ios/App/App/Info.plist` · `M ios/App/CapApp-SPM/Package.swift` · `M lib/printing/bleTransport.ts` · `M lib/printing/transport.ts` · `M lib/printing/usePrinting.ts` · `M package-lock.json` · `M package.json` · `? app/api/printing/route.ts` · `? components/printing/PrinterTypeChoice.tsx` · `? lib/printing/netAddress.ts` · `? lib/printing/netTransport.ts` · `? lib/printing/networkGuard.ts` · `? lib/printing/testTicket.ts` · `? plugins/hatchgrab-net-printer/{…}` — ⚠️ plus 34 untracked, **not ignored** build files under `plugins/hatchgrab-net-printer/android/build/…` and `…/.swiftpm/xcode/xcuserdata/…`; a `.gitignore` entry remains proposed, not done.

### HOLD (landing, plan-features, store listing copy)
`M app/landing/page.tsx` · `M content/store-listing.md` · `M lib/plan-features.ts`

### MIGRATIONS (all five APPLIED by hand; the files are untracked)
`? supabase/migrations/20260916_collection_intervals.sql` · `? …/20260917_van_collection_intervals.sql` · `? …/20260918_event_collection_intervals.sql` · `? …/20260919_van_network_printer.sql` · `? …/20260920_orders_cooking_reservation.sql`

### INCIDENT SAFEGUARDS
`M scripts/migrate-from-sheets.cjs` · `M scripts/register-payment-domain.cjs` · `? scripts/harnesses.json` (51 listed) · `? scripts/run-harnesses.cjs` · `? scripts/ops-write-guard.cjs`

### HARNESSES + FIXTURES
`M scripts/whatsapp-golive-parity-harness.cjs` · `? scripts/_batch-reservation-golden-on-generate.cjs` · `? scripts/_batch-reservation-sim.cjs` · `? scripts/_batch-rolling-golden-generate.cjs` · `? scripts/_batch-rolling-snapshot.cjs` · `? scripts/_mini-dom.cjs` · `? scripts/_printing-mocks.cjs` · `? scripts/_slot-interval-compile.cjs` · `? scripts/add-order-fit-message.cjs` · **`? scripts/add-order-refresh.cjs`** · **`? scripts/add-order-refresh-inputs.cjs`** · `? scripts/add-order-render.cjs` · `? scripts/batch-reservation-display-equals-picker.cjs` · `? scripts/batch-reservation-edit-lock.cjs` · `? scripts/batch-reservation-golden-on.cjs` · `? scripts/batch-reservation-helper.cjs` · `? scripts/batch-reservation-immutability.cjs` · `? scripts/batch-reservation-instants.cjs` · `? scripts/batch-reservation-lock.cjs` · `? scripts/batch-reservation-p2-identity.cjs` · `? scripts/batch-reservation-p3-worked-case.cjs` · `? scripts/batch-reservation-switch.cjs` · `? scripts/batch-reservation-writers.cjs` · `? scripts/batch-rolling-check.cjs` · **`? scripts/batch-rolling-identity.cjs`** · `? scripts/collection-times-hint.cjs` · `? scripts/customer-path-identity.cjs` · `? scripts/dev-virtual-printer.cjs` · **`? scripts/dot-overlap-labels.cjs`** · `? scripts/fixtures/batch-rolling-golden.json` (**unchanged**) · **`? scripts/fixtures/batch-reservation-golden-on.json`** (regenerated) · `? scripts/fixtures/batch-rolling-fix.patch` · **`? scripts/peak-ceiling-rule.cjs`** · **`? scripts/peak-load-rule.cjs`** · `? scripts/printing-*.cjs` (7) · `? scripts/sixteen-pizza-admission.cjs` · **`? scripts/slot-interval-dots.cjs`** · `? scripts/slot-interval-engine-identity.cjs` · `? scripts/slot-interval-event-override.cjs` · `? scripts/slot-interval-generator.cjs` · `? scripts/slot-interval-grid-routing.cjs` · `? scripts/slot-interval-settings.cjs` · `? scripts/slot-interval-van-list-tolerance.cjs` · `? scripts/slot-interval-van-resolution.cjs`

### DOCS
34 existing reports, plus **`? docs/time-list-span-totals-and-cross-report.md`** (this file, replacing the
previous stop-report as the latest in this thread).

### ANYTHING ELSE
Nothing. Two stale detached worktrees under `/private/var/folders/…/slot-head-dots-*` from an earlier run remain
in `git worktree list`; they are outside the working tree and untouched.
