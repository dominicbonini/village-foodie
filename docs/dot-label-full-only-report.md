# Time-list dots — "Full", not "Full – next free HH:MM"

**Date:** 19 September 2026 · Display only (wording) · Localhost only; nothing deployed, nothing committed, nothing staged.
**Files changed:** `lib/slot-display.ts`, `components/dashboard/AddOrderPanel.tsx`, `app/dashboard/[token]/page.tsx`,
`scripts/dot-overlap-labels.cjs`.
**Scripts run:** `node scripts/run-harnesses.cjs` and `scripts/dot-overlap-labels.cjs`. `scripts/` was never globbed;
no golden generator was run. No live truck's token, device id, page, route or API was touched; nothing was created,
edited, cancelled or deleted for any truck. No database was written.

**No span of the prompt arrived garbled, and no instruction contradicted another.** Two factual notes the brief
anticipated but which are worth reading before the rest: the popup never contained "next free" (§3), and one of the
five times named for the second case is not reachable in any arrangement (§6.2).

---

## STEP 0 — `git status`

**Before:** branch `main`, up to date with `origin/main`, **37 modified, 87 untracked, 0 staged** (124 entries).
**After:** **37 modified, 88 untracked, 0 staged** (125 entries) — the same listing plus
`docs/dot-label-full-only-report.md`. Full grouped listing in §8. `git add -A` / `git add .` were not run;
nothing staged, committed, stashed, reset or restored.

---

## 1. What changed, by symbol

### `lib/slot-display.ts` — `formatOverlapLabel(overlap, multiCat)`
The third parameter (`nextFree: string | null`) is gone and the suffix with it:

```ts
export function formatOverlapLabel(overlap: DotOverlap, multiCat: boolean): string {
  const isRed = overlap.kind === 'kitchen' ? overlap.used >= overlap.cap : overlap.used >= overlap.batch
  if (isRed) return overlap.kind === 'kitchen' ? 'Kitchen full' : multiCat ? `${capWord(overlap.cat)} full` : 'Full'
  return overlap.kind === 'kitchen' ? `Kitchen: ${overlap.free} free` : multiCat ? `${capWord(overlap.cat)}: ${overlap.free} free` : `${overlap.free} free`
}
```

### `lib/slot-display.ts` — `buildSlotIndicators`
`nextFreeFor` (the forward scan for the earliest later time not full for the binding limit) and the `nextFree`
local are removed; the label line is now `const label = overlap ? formatOverlapLabel(overlap, multiCat) : ownLabel`.
`SlotIndicator.nextFree` is removed from the interface and the emitted object. The now-unused `slotM` local went
with them. `tone`, `emoji`, `overTotal`, `occ`, `overlap`, `ownLabel`, `multiCat` are untouched.

### `components/dashboard/AddOrderPanel.tsx`
The `nextFitAfter` memo is removed, and the option's label collapses to the shared one:

```tsx
            const label = ind.label
```

It used to be `ind.overlap && !ind.ownLabel && hasItems ? formatOverlapLabel(ind.overlap, ind.multiCat, nextFitAfter…) : ind.label`
— the panel re-formatted the label with its own answer because the wording named a time and an order in hand had a
different answer to it than an empty basket. With the wording gone the two answers are the same string, so the
second call went. The `formatOverlapLabel` import is removed; the panel now reads the shared label and formats
nothing. That strengthens the "one shared helper, no parallel calculation" constraint rather than weakening it.

### `app/dashboard/[token]/page.tsx`
The edit picker's fallback indicator literal drops `nextFree:null`. Its option line is unchanged.

## 2. Every string, before and after

| Case | Before | After |
|---|---|---|
| Red, batch, one cooking category | `Full – next free 17:15` (`Full` when no later time was free) | **`Full`** |
| Red, batch, several cooking categories | `Pizza full – next free 17:15` (`Pizza full`) | **`Pizza full`** |
| Red, kitchen ceiling | `Kitchen full – next free 17:15` (`Kitchen full`) | **`Kitchen full`** |
| Amber, one cooking category | `3 free` | `3 free` — unchanged |
| Amber, several categories | `Pizza: 3 free` | `Pizza: 3 free` — unchanged |
| Amber, kitchen ceiling | `Kitchen: 1 free` | `Kitchen: 1 free` — unchanged |
| A time with its own booking | `16 Pizzas` / `peak 2 Pizzas` | unchanged |
| Add Order trailing label | ` · Order won't fit` / ` – Order won't fit` | unchanged (byte-identical, both separators) |
| Popup (`buildFitMessage`) | `Order won't fit at 17:05`, then per-window `16:35–16:50 · Pizza · 3 free` | unchanged — `lib/slot-fit-message.ts` not edited |
| Collection times settings hint | `{Category} takes {prep} minutes to cook, so some times between batches will show as full.` | unchanged |

**No new strings.** One phrase was removed from one surface.

## 3. Where "next free" still appears — nowhere, and why that is what the brief asked for

The brief said to keep the wording in the popup and in the Add Order trailing label **"where it already appears"**,
and added **"If it does not currently appear in the popup, do not add it."** Checked before editing:

- `lib/slot-fit-message.ts` (the popup) contains **0** occurrences of "next free", before and after. Its lines are
  `Order won't fit at {slot}`, `{Cat}: {batch} at a time, every {prep} minutes.`, `This order needs N batches to be
  ready by {slot}, but only M have room.`, and one line per window — `16:35–16:50 · Pizza · 3 free` / `… · Full`.
  It answers "which batch, and how much room" without naming another time. **Nothing was added.**
- The Add Order trailing label is the fixed string ` · Order won't fit` / ` – Order won't fit`. The "next free" a
  reader saw in `17:05 🔴 Full – next free 17:15 · Order won't fit` came from the **dot label**, not the trailing
  one. **Unchanged.**

So after this change the phrase appears in no rendered string anywhere. That follows the brief exactly, but it is
worth stating plainly in case the expectation was that it survived somewhere: **it did not exist anywhere but the
dot label.**

## 4. The "next free" computation — removed, with nothing else left without it

The brief permitted removal "only if nothing else uses it". Nothing did. The three pieces and their only consumers:

| Piece | Consumer before | After |
|---|---|---|
| `nextFreeFor` (in `buildSlotIndicators`) | set the `nextFree` local | removed |
| `nextFree` local + `SlotIndicator.nextFree` | passed to `formatOverlapLabel`; the field was **never read** — the two default object literals (AddOrderPanel `slotIndicatorFor`, the edit picker) carried it only for type completeness | removed |
| `nextFitAfter` (AddOrderPanel) | the panel's own `formatOverlapLabel` call at the option line | removed |

**Confirmed no other caller lost anything:** a repo-wide search for `nextFree` / `nextFitAfter` / `formatOverlapLabel`
across `lib`, `components`, `app` and `scripts` returns only the sites listed above; the harness asserts the two
symbols are gone from the shipped modules. `formatOverlapLabel` itself stays — `buildSlotIndicators` is its one
caller, feeding the strip, the Add Order list and the edit picker.

## 5. Hard constraints

- **Colours unchanged.** `tone` is computed by `dotOccupancyAt` and was not touched. Only `label` changed.
- **Verdicts, offered times, placement, reservations, breaches byte-identical.** `lib/slot-availability.ts`,
  `lib/capacity-breach.ts`, `lib/orders/*` and the routes are not in this diff. The sweep's identity harnesses
  (`batch-rolling-identity`, `batch-reservation-golden-on`, `batch-reservation-p2-identity`,
  `customer-path-identity`, `slot-interval-engine-identity`, `slot-interval-dots`) all pass.
- **Aligned setups byte-identical.** On an aligned grid `read.overlap` is null, so the label is the composition
  label and "Full" never appears. Proved over 1,200 seeded aligned states and 546 golden fixtures (§6.3).
- **Customer page untouched** — not in the diff; the harness re-checks it renders no operator reason.
- **One shared helper.** Strengthened: the panel no longer calls the formatter at all.

## 6. The harness — `scripts/dot-overlap-labels.cjs`

**Failure mode:** a dot label naming a time. A dot says what is true *of that time*; naming another invited the
operator to read a promise into a colour, and with an order in hand the empty-basket answer and the this-order
answer were two different strings for the same dot.

**Broken variants, run FIRST — all six FAILED as required:**

| | Variant | Result |
|---|---|---|
| V1 | today's exact-time read (the rolling read discarded) | ✓ FAILED: `"17:05 🟢"` |
| V2 | the overlapping window's own count repeated on the overlapped time | ✓ FAILED: `"17:05 🔴 8 Pizzas"` |
| **V3 (new)** | **the old `Full – next free HH:MM` label restored** | ✓ FAILED: `"17:05 🔴 Full – next free 17:15"` |
| **V4b (new)** | **the popup stripped of its own free-room detail** | ✓ FAILED: lines became `"16:35–16:50 · pizza"` with no `N free` |
| V4 | operator reason text emitted on the `/api/slots` row | ✓ FAILED: the 17:05 row carried `"Full – next free"` |
| V5 | closed-left overlap (touching windows counted) | ✓ FAILED: `"17:15 🔴 1 Pizza"` |

⚠️ **V4b is an adaptation, and the reason is §3.** The brief asked for a variant that strips "next free" from the
popup too. The popup has never contained that phrase, so stripping it would be a no-op proving nothing. V4b strips
the wording the popup **does** carry for the same purpose — each window's free room — and the check catches it.

### 6.1 Real result — Dominic's first case (8 @17:00, 1 @17:15; 15-min prep, batch 8, 5-min grid)
```
  17:00 🔴 8 Pizzas      17:05 🔴 Full      17:10 🔴 Full      17:15 🟡 1 Pizza        (switch OFF and ON)
  with 2 pizzas: "17:05 🔴 Full · Order won’t fit"   "17:15 🟡 1 Pizza"
```

### 6.2 🔴 Dominic's second case — 16 pizzas @20:55 — one of the five times is not reachable
The engine, run over both possible arrangements of that order:

| time | order carrying the **pre-fix override record** (all 16 in 20:40–20:55) | order with the **fixed record** (two windows of 8) | his list |
|---|---|---|---|
| 20:30 | 🟢 | 🔴 `Full` | — |
| **20:40** | **🟢** | **🔴 `8 Pizzas`** | **🔴 `Full`** |
| 20:55 | 🔴 `16 Pizzas` | 🔴 `8 Pizzas` | 🔴 `16 Pizzas` |
| 21:00 | 🔴 `Full` | 🔴 `Full` | 🔴 `Full` |
| 21:05 | 🔴 `Full` | 🔴 `Full` | 🔴 `Full` |
| 21:10 | 🟢 | 🟢 | 🟢 |

**Four of the five match the override column exactly** — so the order he looked at carries the pre-fix record from
`docs/sixteen-pizza-bug-report.md` (16 in one window), not a freshly admitted one.

**20:40 🔴 "Full" is reachable in neither, and this change is not why.** Cooking for a 20:55 collection cannot begin
before 20:25 (two 15-minute batches), so the window ending at 20:40 is `[20:25, 20:40)`. With all 16 in 20:40–20:55
that window is empty — green, no label. With the fixed two-windows record it holds this order's own first batch —
red, and a time with its own booking keeps its count, so `"8 Pizzas"`. The colour is unaffected by this task
(wording only), so 20:40's colour is whatever it was yesterday. The harness asserts both columns and prints the
20:40 discrepancy rather than asserting his value. **If 20:40 really did read 🔴 "Full" on screen, something else is
on that board and I could not reconstruct it — see §9.**

### 6.3 The rest
```
  606 rendered lines across every fixture, both switch states: 0 name another time
  lib/slot-display.ts: the formatter and the module carry no nextFree code (comments aside)
  AddOrderPanel: the panel's own next-free memo is gone
  popup title: "Order won't fit at 17:05"; it still names each window's free room:
      ["16:35–16:50 · Pizza · 3 free", "16:50–17:05 · Pizza · 3 free"]
  lib/slot-fit-message.ts contains no "next free" — it never did, and none was added
  "· Order won't fit" after a label, "– Order won't fit" after a bare dot — byte-identical
  with 9 pizzas: "17:05 🔴 Full · Order won’t fit"          a bare dot: "17:45 🟢"
  partial (unchanged): 5 @17:00 → "17:05 🟡 3 free"
  two categories: "17:05 🔴 Pizza full"   ·   "17:15 🟡 Burgers: 2 free"
  kitchen ceiling: "17:05 🔴 Kitchen full"   ·   partial: "17:05 🟡 Kitchen: 1 free"
  customer row 17:05: tone red, available true (today's window), no reason text; the page renders none
  10-minute grid, prep 15: "17:10 🔴 Full" · "17:30 🔴 8 Pizzas" · "17:40 🔴 Full" · "17:50 🟢"
  AGREEMENT: 2200 states, 96441 (time, category) reads: dot red by overlap ⇔ refused, 0 disagree
  ALIGNED: 1200 seeded aligned states: 0 differ   ·   546 golden fixtures: 0 dots differ from today
✅ overlapped times read full, with a reason, and nothing else moved        rc=0
```

## 7. Verification

| Check | Result |
|---|---|
| `node scripts/run-harnesses.cjs` | **48 run · 48 passed · 0 failed — true exit code 0** |
| `npx tsc --noEmit` | **true exit code 0** |
| `npx next build` | "Compiled successfully in 5.7s", **true exit code 0** |
| `scripts/fixtures/batch-rolling-golden.json` | sha256 `8bdae817748ad334…` before **and** after, mtime 17 Sep 10:11 — not regenerated |
| `scripts/fixtures/batch-reservation-golden-on.json` | sha256 `ce5550b7ee2a42ce…` before **and** after, mtime 17 Sep 13:42 — not regenerated |

**eslint, changed files, against a clean HEAD worktree — delta per rule:**

| File · rule · severity | HEAD → tree |
|---|---|
| `components/dashboard/AddOrderPanel.tsx` · `react-hooks/exhaustive-deps` · warn | 7 → 1 (carried from the earlier refresh work) |
| `components/dashboard/AddOrderPanel.tsx` · `react-hooks/set-state-in-effect` · error | 5 → 4 (ditto) |
| `lib/slot-display.ts`, `app/dashboard/[token]/page.tsx` | no rule count changed |
| totals over the three files | errors 95 → 94 · warnings 39 → 33 |

No rule count rose.

## 8. Localhost check — test-truck (Pizza Kitchen), switch ON

1. Event on a **5-minute** customer grid, Pizza prep 15 / batch 8. Place **16 pizzas at 20:55** through Add Order.
   It fits (two empty batches) so there is no popup — the admission fix from `docs/sixteen-pizza-bug-report.md`.
2. The Add Order list and the capacity strip then read:
   **20:30 🔴 `Full` · 20:35 🔴 `Full` · 20:40 🔴 `8 Pizzas` · 20:45 🔴 `Full` · 20:50 🔴 `Full` ·
   20:55 🔴 `8 Pizzas` · 21:00 🔴 `Full` · 21:05 🔴 `Full` · 21:10 🟢**.
   No label names another time. (If you are looking at the **older** order that still carries the pre-fix record,
   20:55 reads `16 Pizzas`, 20:40 is green, and 21:00/21:05 read `Full` — §6.2.)
3. Empty the order and add **9 pizzas**. 17:05 and 17:10 read `Full · Order won't fit`; pick 17:05 and press Add —
   **the popup still appears** with its own wording: *"Order won't fit at 17:05"*, *"This order needs 2 batches to be
   ready by 17:05…"*, and a line per window such as *"16:50–17:05 · Pizza · 3 free"*. Nothing there changed.
4. The edit picker on any order shows the same labels as the list.
5. Settings → Collection times: the hint line is unchanged.
6. **Gusto, look only, by you:** prep 5 on a 5-minute grid is aligned, so no `Full` label can appear there at all —
   proved over its six live-event fixtures. Nothing to open; nothing was opened.

## 9. Anything I could not establish

- **How 20:40 showed 🔴 "Full"** on Dominic's screen. Neither arrangement of a 16-pizza 20:55 order produces it
  (§6.2), and this change alters no colour. If another order sits near 20:25–20:40 on that event it would explain
  both the colour and the label, but I did not query the live board for it — the previous report's read-only SQL
  showed no such order at the time it ran, and re-querying now would not tell me what was on screen then.
- **Whether any operator relied on the removed wording** to plan. It was 24 hours old.
- The rendered width of the shorter labels on a narrow strip — not rendered on a device here.

## 8b. Every modified and untracked path (125 entries, 0 staged), grouped

### COLLECTION TIMES + CAPACITY + ADD ORDER + RESERVATIONS
`M app/api/dashboard/action/route.ts` · `M app/api/dashboard/route.ts` · `M app/api/events/route.ts` · `M app/api/manage/route.ts` · `M app/api/menu/[truckId]/route.ts` · `M app/api/orders/submit/route.ts` · `M app/api/slots/[truckId]/route.ts` · **`M app/dashboard/[token]/page.tsx`** · `M app/manage/[token]/page.tsx` · `M app/trucks/[slug]/order/page.tsx` · **`M components/dashboard/AddOrderPanel.tsx`** · `M components/dashboard/CapacityBreachBanner.tsx` · `M lib/capacity-breach.ts` · `M lib/features.ts` · `M lib/orders/place-in-slot.ts` · `M lib/payments/promote-draft.ts` · `M lib/slot-availability.ts` · `M lib/slot-bookings.ts` · **`M lib/slot-display.ts`** · `M lib/slot-generation.ts` · `M lib/supabase.ts` · `? lib/capacity-refresh.ts` · `? lib/orders/cooking-reservation.ts` · `? lib/slot-fit-message.ts` · `? lib/slot-interval.ts`
(the three in bold are this task's; the rest are the earlier uncommitted capacity work)

### WIRED PRINTING (app, native, plugin)
`M android/app/capacitor.build.gradle` · `M android/capacitor.settings.gradle` · `M components/printing/PrintingSettings.tsx` · `M ios/App/App/Info.plist` · `M ios/App/CapApp-SPM/Package.swift` · `M lib/printing/bleTransport.ts` · `M lib/printing/transport.ts` · `M lib/printing/usePrinting.ts` · `M package-lock.json` · `M package.json` · `? app/api/printing/route.ts` · `? components/printing/PrinterTypeChoice.tsx` · `? lib/printing/netAddress.ts` · `? lib/printing/netTransport.ts` · `? lib/printing/networkGuard.ts` · `? lib/printing/testTicket.ts` · `? plugins/hatchgrab-net-printer/{Package.swift, index.d.ts, index.js, package.json, android/build.gradle, android/src/main/AndroidManifest.xml, android/src/main/java/com/hatchgrab/netprinter/NetPrinterPlugin.java, ios/Sources/NetPrinterPlugin/NetPrinterPlugin.swift}` — ⚠️ plus 34 untracked, **not ignored** build files under `plugins/hatchgrab-net-printer/android/build/…` and `plugins/hatchgrab-net-printer/.swiftpm/xcode/xcuserdata/…/xcschememanagement.plist`; a `.gitignore` entry (`plugins/**/build/`, `**/xcuserdata/`) is still proposed, not done.

### HOLD (landing, plan-features, store listing copy)
`M app/landing/page.tsx` · `M content/store-listing.md` · `M lib/plan-features.ts`

### MIGRATIONS (all five APPLIED by hand; the files are untracked)
`? supabase/migrations/20260916_collection_intervals.sql` · `? …/20260917_van_collection_intervals.sql` · `? …/20260918_event_collection_intervals.sql` · `? …/20260919_van_network_printer.sql` · `? …/20260920_orders_cooking_reservation.sql`

### INCIDENT SAFEGUARDS
`M scripts/migrate-from-sheets.cjs` · `M scripts/register-payment-domain.cjs` · `? scripts/harnesses.json` · `? scripts/run-harnesses.cjs` · `? scripts/ops-write-guard.cjs`

### HARNESSES + FIXTURES
`M scripts/whatsapp-golive-parity-harness.cjs` · `? scripts/_batch-reservation-golden-on-generate.cjs` · `? scripts/_batch-reservation-sim.cjs` · `? scripts/_batch-rolling-golden-generate.cjs` · `? scripts/_batch-rolling-snapshot.cjs` · `? scripts/_mini-dom.cjs` · `? scripts/_printing-mocks.cjs` · `? scripts/_slot-interval-compile.cjs` · `? scripts/add-order-fit-message.cjs` · `? scripts/add-order-refresh.cjs` · `? scripts/add-order-render.cjs` · `? scripts/batch-reservation-display-equals-picker.cjs` · `? scripts/batch-reservation-edit-lock.cjs` · `? scripts/batch-reservation-golden-on.cjs` · `? scripts/batch-reservation-helper.cjs` · `? scripts/batch-reservation-immutability.cjs` · `? scripts/batch-reservation-instants.cjs` · `? scripts/batch-reservation-lock.cjs` · `? scripts/batch-reservation-p2-identity.cjs` · `? scripts/batch-reservation-p3-worked-case.cjs` · `? scripts/batch-reservation-switch.cjs` · `? scripts/batch-reservation-writers.cjs` · `? scripts/batch-rolling-check.cjs` · `? scripts/batch-rolling-identity.cjs` · `? scripts/collection-times-hint.cjs` · `? scripts/customer-path-identity.cjs` · `? scripts/dev-virtual-printer.cjs` · **`? scripts/dot-overlap-labels.cjs`** · `? scripts/fixtures/{batch-reservation-golden-on.json, batch-rolling-fix.patch, batch-rolling-golden.json}` · `? scripts/printing-copy.cjs` · `? scripts/printing-dedupe.cjs` · `? scripts/printing-escpos-identity.cjs` · `? scripts/printing-failure-split.cjs` · `? scripts/printing-gating.cjs` · `? scripts/printing-network-guard.cjs` · `? scripts/printing-transport-contract.cjs` · `? scripts/sixteen-pizza-admission.cjs` · `? scripts/slot-interval-dots.cjs` · `? scripts/slot-interval-engine-identity.cjs` · `? scripts/slot-interval-event-override.cjs` · `? scripts/slot-interval-generator.cjs` · `? scripts/slot-interval-grid-routing.cjs` · `? scripts/slot-interval-settings.cjs` · `? scripts/slot-interval-van-list-tolerance.cjs` · `? scripts/slot-interval-van-resolution.cjs`

### DOCS
`? docs/add-order-fit-message-report.md` · `? docs/add-order-render-fix-report.md` · `? docs/batch-keep-together-investigation-report.md` · `? docs/batch-overlap-review-report.md` · `? docs/batch-reservation-investigation-report.md` · `? docs/batch-reservation-p0-p2-report.md` · `? docs/batch-reservation-p3-report.md` · `? docs/batch-rolling-durable-harness-report.md` · `? docs/batch-rolling-fix-report.md` · `? docs/batch-split-review-report.md` · `? docs/dashboard-order-and-batch-overlap-report.md` · `? docs/discovery-incident-followup-report.md` · `? docs/discovery-upsert-incident-report.md` · **`? docs/dot-label-full-only-report.md`** (this file) · `? docs/dot-overlap-labels-report.md` · `? docs/edit-busy-fix-report.md` · `? docs/edit-lock-and-refresh-report.md` · `? docs/gusto-event-update-trace-report.md` · `? docs/sixteen-pizza-bug-report.md` · `? docs/slot-interval-build-report.md` · `? docs/slot-interval-event-override-report.md` · `? docs/slot-interval-hardening-report.md` · `? docs/slot-interval-van-level-report.md` · `? docs/wired-printing-build-report.md` · `? docs/wired-printing-followup-report.md` · `? docs/wired-printing-investigation-report.md`

### ANYTHING ELSE
Nothing — every one of the 125 entries is above. Two stale detached worktrees under
`/private/var/folders/…/slot-head-dots-*`, from an earlier dots-harness run, remain in `git worktree list`; they are
outside the working tree and untouched.
