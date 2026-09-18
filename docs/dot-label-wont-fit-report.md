# Time-list labels — "Won't fit", and not on a red dot

**Date:** 19 September 2026 · Display only (wording) · Localhost only; nothing deployed, nothing committed, nothing staged.
**Files changed:** `lib/slot-display.ts`, `components/dashboard/AddOrderPanel.tsx`, and four harnesses —
`scripts/dot-overlap-labels.cjs`, `scripts/add-order-fit-message.cjs`, `scripts/add-order-render.cjs`,
`scripts/add-order-refresh.cjs`.
**Scripts run:** `node scripts/run-harnesses.cjs` and `scripts/dot-overlap-labels.cjs`. `scripts/` was never globbed;
no golden generator was run. No live truck's token, device id, page, route or API was touched; nothing was created,
edited, cancelled or deleted for any truck. No database was read or written.

**No span of the prompt arrived garbled, and no instruction contradicted another.** One scope fact worth reading
first: of the three operator surfaces named, only the Add Order time list has ever rendered this label (§3).

---

## STEP 0 — `git status`

**Before:** branch `main`, up to date with `origin/main`, **37 modified, 88 untracked, 0 staged** (125 entries).
**After:** **37 modified, 89 untracked, 0 staged** (126 entries) — the same listing plus
`docs/dot-label-wont-fit-report.md`. Full grouped listing in §8. `git add -A` / `git add .` were not run;
nothing staged, committed, stashed, reset or restored.

---

## 1. What changed, by symbol

### `lib/slot-display.ts` — **new** `formatFitSuffix(tone, doesNotFit, hasLabel)`
The wording, both separators and the decision to render at all now live in one exported function beside
`formatOverlapLabel`:

```ts
export function formatFitSuffix(tone: SlotTone, doesNotFit: boolean, hasLabel: boolean): string {
  if (!doesNotFit || tone === 'red') return ''
  return hasLabel ? ' · Won’t fit' : ' Won’t fit'
}
```

### `components/dashboard/AddOrderPanel.tsx` — the Add Order option line
```tsx
{label ? ` ${label}` : ''}{formatFitSuffix(ind.tone, wontFit, !!label)}</option>
```
It was `{wontFit ? (label ? ' · Order won’t fit' : ' – Order won’t fit') : ''}`. The panel now
spells no fit wording of its own — it passes the dot's tone and the shared formatter decides. `wontFit`
(`manualFitWhy.has(...)`, the engine's verdict) and the greying (`style={wontFit ? { color: '#94a3b8' } : undefined}`)
are unchanged, so a red time that refuses the order is still greyed and still selectable; it simply no longer
repeats itself in words.

## 2. Every string, before and after

| Case | Before | After |
|---|---|---|
| Red dot, own count, order refused | `16 Pizzas · Order won't fit` | **`16 Pizzas`** |
| Red dot, overlap reason, order refused | `Full · Order won't fit` / `Pizza full · …` / `Kitchen full · …` | **`Full`** / **`Pizza full`** / **`Kitchen full`** |
| Amber dot, a label, order refused | `1 Pizza · Order won't fit` · `7 free · Order won't fit` | **`1 Pizza · Won't fit`** · **`7 free · Won't fit`** |
| Green dot, no label, order refused | `🟢 – Order won't fit` (spaced en dash) | **`🟢 Won't fit`** (no dash) |
| Green or amber, order fits | no suffix | no suffix — unchanged |
| Empty order | no suffix anywhere | unchanged |
| Popup | `Order won't fit at 18:45` + every reason line | **unchanged** — `lib/slot-fit-message.ts` not edited |
| Dot colours, count labels, `Full` / `{n} free` and prefixes | — | all unchanged |
| Collection times hint, customer page, grace row `⚠️ 21:05 · After closing` | — | all unchanged |

The en dash is gone **from this label's path only**; it is untouched wherever else it is used.

## 3. Other surfaces rendering the old string — none

The brief named three operator surfaces. Searched across `lib`, `components` and `app` (no extension scoping):

| Site | Renders the fit label? |
|---|---|
| **Add Order time list** (`AddOrderPanel`, the `<select>` option) | **Yes — the only one.** Changed. |
| **Edit picker** (`app/dashboard/[token]/page.tsx`, `editSlotIndicators`) | No. It renders `ind.label` plus `· (current)`. It computes no `fitOrderBackward` and has no basket, so it never had a fit verdict to show. Untouched. |
| **Capacity strip** (`DayLoadStrip`, fed by `/api/dashboard` and `displaySlots`) | No. It renders `s.label` only — no order in progress exists at that surface. Untouched. |
| `lib/slot-fit-message.ts` | The **popup** title `Order won't fit at {slot}` — a different surface with a different job, explicitly kept. |
| `lib/capacity-refresh.ts` line 4, `AddOrderPanel` line 631 | Prose in comments describing the label. Left as historical context; neither renders. |

So "leave it alone unless it is one of the three operator surfaces" applies to nothing: no other surface renders it.

## 4. Hard constraints
- **Verdicts, colours, offered times, placement, reservations, breaches byte-identical.** `lib/slot-availability.ts`,
  `lib/capacity-breach.ts`, `lib/orders/*` and every route are absent from this diff; only a display string moved.
  `ind.tone` is read, never written.
- **Aligned setups byte-identical.** No dot label changed; the suffix is a separate span appended after it, and it
  is basket-driven — with no order in progress (the strip, the edit picker, an empty basket) nothing is appended at all.
- **One shared helper.** Strengthened: the wording used to be spelled in the panel's JSX; it now lives in
  `lib/slot-display.ts` beside `formatOverlapLabel`, so if the edit picker ever gains a basket-aware fit there is
  one place to call.

## 5. The harnesses

**Failure mode:** a dot saying the same thing twice — a red dot already means "the kitchen cannot take more here",
and `Full · Order won't fit` spent a whole clause repeating it; on a counted time, `16 Pizzas · Order won't fit`
read as two facts about different things.

### `scripts/dot-overlap-labels.cjs` — broken variants, run FIRST (nine; the three new ones bold)

| | Variant | Result |
|---|---|---|
| V1 | today's exact-time read | ✓ FAILED: `"17:05 🟢"` |
| V2 | the overlapping window's count repeated | ✓ FAILED: `"17:05 🔴 8 Pizzas"` |
| V3 | the old `Full – next free HH:MM` label | ✓ FAILED: `"17:05 🔴 Full – next free 17:15"` |
| V4 | operator reason on the `/api/slots` row | ✓ FAILED |
| V4b | the popup stripped of its free-room detail | ✓ FAILED |
| V5 | closed-left overlap | ✓ FAILED: `"17:15 🔴 1 Pizza"` |
| **V6** | **the suffix rendered on a RED dot** (patched in the formatter, rendered through the real panel) | ✓ FAILED: `"17:05 🔴 Full · Won't fit"` |
| **V7** | **the long `Order won't fit` restored** | ✓ FAILED: `" · Order won't fit"` |
| **V8** | **the popup's title shortened to match the label** | ✓ FAILED: `"Won't fit at 17:05"` |

**Real result** (Dominic's first case, 8 @17:00 and 1 @17:15, 5-minute grid, switch OFF and ON):
```
  9 pizzas · red:   "17:00 🔴 8 Pizzas"  "17:05 🔴 Full"  "17:10 🔴 Full"        (no verdict on any)
  9 pizzas · amber: "17:15 🟡 1 Pizza · Won’t fit"   "17:20 🟡 7 free · Won’t fit"
  9 pizzas · green: ON  "17:30 🟢"  (it fits)   ·   OFF "17:30 🟢 Won’t fit"  (it does not — no dash)
                    "17:45 🟢" under both (it fits)
  2 pizzas: "17:00 🔴 8 Pizzas"  "17:05 🔴 Full"  "17:15 🟡 1 Pizza"
  a green time that refuses the order: "17:05 🟢 Won’t fit" — no dash, no other label
  550 rendered options across five baskets, both switch states: 0 red dots carry the verdict
  no rendered operator label contains "Order won't fit"; none puts an en dash before the verdict
  an EMPTY order produces no fit label anywhere (55 options)
  popup title: "Order won't fit at 17:05"; its lines still name each window's free room
  ALIGNED: 1200 seeded aligned states 0 differ · 546 golden fixtures 0 dots differ
✅ rc=0
```

🔴 **The two switch states genuinely differ at 17:30, and both labels are right.** ON, Dominic's rule fills
nearest-first — 8 into the empty 17:15–17:30 and 1 into 17:00–17:15's seven free — so 9 fit and the green dot says
nothing. OFF, today's split puts the full batch of 8 into the earlier window, which already holds 1, so 9 are
refused and the green dot carries the verdict alone. My first draft asserted the same string for both and the
harness caught it; the assertion is now switch-aware and exercises both forms.

### Three harnesses re-targeted, not weakened
The brief named two; two more asserted the old string and would have gone red.

- `scripts/add-order-fit-message.cjs` — its source assertion was the literal old expression. Now: the option calls
  `formatFitSuffix(ind.tone, wontFit, !!label)`; the panel spells no fit wording of its own; and the formatter's own
  text is asserted (`if (!doesNotFit || tone === 'red') return ''` and the two separator forms). The popup's
  expected block, including `Order won't fit at 18:45`, is untouched and still passes.
- `scripts/add-order-render.cjs` — its separator block tested `🟢 – Order won` and `8 Pizzas · Order won`. Now it
  tests the bare-dot form with no dash, sweeps every red option in the rendered list for the absence of the suffix,
  and asserts the long form appears nowhere. Its 1-pizza case flipped meaning honestly: 18:30 still refuses one
  pizza, but its dot is red, so the assertion is now *"does not fit, but its dot is RED so the verdict is not
  repeated"*. Two broken variants of its own (suffix on red; long form restored) FAIL first.
- `scripts/add-order-refresh.cjs` — its expected string became `17:30 🟡 7 Pizzas · Won’t fit` (amber, so the
  suffix stays) and its two regexes follow the new casing.

## 6. Verification

| Check | Result |
|---|---|
| `node scripts/run-harnesses.cjs` | **48 run · 48 passed · 0 failed — true exit code 0** |
| `npx tsc --noEmit` | **true exit code 0** |
| `npx next build` | "Compiled successfully in 5.2s", **true exit code 0** |
| `scripts/fixtures/batch-rolling-golden.json` | sha256 `8bdae817748ad334…` before **and** after — not regenerated |
| `scripts/fixtures/batch-reservation-golden-on.json` | sha256 `ce5550b7ee2a42ce…` before **and** after — not regenerated |

**eslint, changed files, against a clean HEAD worktree — delta per rule:**

| File · rule · severity | HEAD → tree |
|---|---|
| `components/dashboard/AddOrderPanel.tsx` · `react-hooks/exhaustive-deps` · warn | 7 → 1 (carried from the earlier refresh work) |
| `components/dashboard/AddOrderPanel.tsx` · `react-hooks/set-state-in-effect` · error | 5 → 4 (ditto) |
| `lib/slot-display.ts` | no rule count changed |
| totals over the two files | errors 10 → 9 · warnings 11 → 5 |

No rule count rose.

## 7. Localhost check — test-truck (Pizza Kitchen), switch ON

Event 17:00–21:00, 5-minute customer grid, Pizza prep 15 / batch 8. Store **8 pizzas @17:00** and **1 @17:15**.

1. **Empty order.** The list reads `17:00 🔴 8 Pizzas`, `17:05 🔴 Full`, `17:10 🔴 Full`, `17:15 🟡 1 Pizza`,
   `17:30 🟢`. No verdict anywhere — there is no order to judge.
2. **Add 9 pizzas.**
   - **RED** — `17:00 🔴 8 Pizzas`, `17:05 🔴 Full`, `17:10 🔴 Full`. Greyed and still selectable, but **no
     "Won't fit"**: the colour already said it.
   - **AMBER** — `17:15 🟡 1 Pizza · Won't fit`, `17:20 🟡 7 free · Won't fit`. Middle dot after the label.
   - **GREEN** — `17:30 🟢` and `17:45 🟢`: nine fit there, so nothing is appended.
3. **A green time that refuses.** Clear the board (or use a fresh event) and add 9 pizzas: the earliest times read
   `17:05 🟢 Won't fit` — the verdict alone, **no dash**, because the kitchen cannot start cooking before the
   event opens.
4. **The popup is unchanged.** Pick any greyed time and press Add: *"Order won't fit at 17:05"*, then
   *"Pizza: 8 at a time, every 15 minutes."*, *"This order needs 2 batches to be ready by 17:05…"*, and a line per
   window such as *"16:50–17:05 · Pizza · 3 free"*. Full wording, every reason line, exactly as before.
5. **The edit picker and the capacity strip** show the same dots and labels as always — neither ever showed the fit
   verdict, and neither changed.
6. **Gusto, look only, by you:** prep 5 on a 5-minute grid is aligned, so no `Full` label exists there, and the
   strip has no order in progress — nothing on that truck can render this suffix at all.

## 8. Anything I could not establish
- **Whether an operator relied on the verdict appearing on red times.** The greying and the popup both still mark
  them, so the information is not lost, only the sentence.
- The rendered width of the shorter option rows on a narrow iPad column — not rendered on a device here.
- Whether `ind.tone` and the customer-facing `available` flag could ever disagree about "red" on a surface that
  shows this suffix. They cannot today: the suffix renders only in the Add Order list, which reads `ind.tone` from
  `buildSlotIndicators`, the same read the dot is drawn from.

## 8b. Every modified and untracked path (126 entries, 0 staged), grouped

### COLLECTION TIMES + CAPACITY + ADD ORDER + RESERVATIONS
`M app/api/dashboard/action/route.ts` · `M app/api/dashboard/route.ts` · `M app/api/events/route.ts` · `M app/api/manage/route.ts` · `M app/api/menu/[truckId]/route.ts` · `M app/api/orders/submit/route.ts` · `M app/api/slots/[truckId]/route.ts` · `M app/dashboard/[token]/page.tsx` · `M app/manage/[token]/page.tsx` · `M app/trucks/[slug]/order/page.tsx` · **`M components/dashboard/AddOrderPanel.tsx`** · `M components/dashboard/CapacityBreachBanner.tsx` · `M lib/capacity-breach.ts` · `M lib/features.ts` · `M lib/orders/place-in-slot.ts` · `M lib/payments/promote-draft.ts` · `M lib/slot-availability.ts` · `M lib/slot-bookings.ts` · **`M lib/slot-display.ts`** · `M lib/slot-generation.ts` · `M lib/supabase.ts` · `? lib/capacity-refresh.ts` · `? lib/orders/cooking-reservation.ts` · `? lib/slot-fit-message.ts` · `? lib/slot-interval.ts`
(bold = this task's two source files; the rest is the earlier uncommitted capacity work)

### WIRED PRINTING (app, native, plugin)
`M android/app/capacitor.build.gradle` · `M android/capacitor.settings.gradle` · `M components/printing/PrintingSettings.tsx` · `M ios/App/App/Info.plist` · `M ios/App/CapApp-SPM/Package.swift` · `M lib/printing/bleTransport.ts` · `M lib/printing/transport.ts` · `M lib/printing/usePrinting.ts` · `M package-lock.json` · `M package.json` · `? app/api/printing/route.ts` · `? components/printing/PrinterTypeChoice.tsx` · `? lib/printing/netAddress.ts` · `? lib/printing/netTransport.ts` · `? lib/printing/networkGuard.ts` · `? lib/printing/testTicket.ts` · `? plugins/hatchgrab-net-printer/{Package.swift, index.d.ts, index.js, package.json, android/build.gradle, android/src/main/AndroidManifest.xml, android/src/main/java/com/hatchgrab/netprinter/NetPrinterPlugin.java, ios/Sources/NetPrinterPlugin/NetPrinterPlugin.swift}` — ⚠️ plus 34 untracked, **not ignored** build files under `plugins/hatchgrab-net-printer/android/build/…` and `plugins/hatchgrab-net-printer/.swiftpm/xcode/xcuserdata/…/xcschememanagement.plist`; a `.gitignore` entry (`plugins/**/build/`, `**/xcuserdata/`) is still proposed, not done.

### HOLD (landing, plan-features, store listing copy)
`M app/landing/page.tsx` · `M content/store-listing.md` · `M lib/plan-features.ts`

### MIGRATIONS (all five APPLIED by hand; the files are untracked)
`? supabase/migrations/20260916_collection_intervals.sql` · `? …/20260917_van_collection_intervals.sql` · `? …/20260918_event_collection_intervals.sql` · `? …/20260919_van_network_printer.sql` · `? …/20260920_orders_cooking_reservation.sql`

### INCIDENT SAFEGUARDS
`M scripts/migrate-from-sheets.cjs` · `M scripts/register-payment-domain.cjs` · `? scripts/harnesses.json` · `? scripts/run-harnesses.cjs` · `? scripts/ops-write-guard.cjs`

### HARNESSES + FIXTURES
`M scripts/whatsapp-golive-parity-harness.cjs` · `? scripts/_batch-reservation-golden-on-generate.cjs` · `? scripts/_batch-reservation-sim.cjs` · `? scripts/_batch-rolling-golden-generate.cjs` · `? scripts/_batch-rolling-snapshot.cjs` · `? scripts/_mini-dom.cjs` · `? scripts/_printing-mocks.cjs` · `? scripts/_slot-interval-compile.cjs` · **`? scripts/add-order-fit-message.cjs`** · **`? scripts/add-order-refresh.cjs`** · **`? scripts/add-order-render.cjs`** · `? scripts/batch-reservation-display-equals-picker.cjs` · `? scripts/batch-reservation-edit-lock.cjs` · `? scripts/batch-reservation-golden-on.cjs` · `? scripts/batch-reservation-helper.cjs` · `? scripts/batch-reservation-immutability.cjs` · `? scripts/batch-reservation-instants.cjs` · `? scripts/batch-reservation-lock.cjs` · `? scripts/batch-reservation-p2-identity.cjs` · `? scripts/batch-reservation-p3-worked-case.cjs` · `? scripts/batch-reservation-switch.cjs` · `? scripts/batch-reservation-writers.cjs` · `? scripts/batch-rolling-check.cjs` · `? scripts/batch-rolling-identity.cjs` · `? scripts/collection-times-hint.cjs` · `? scripts/customer-path-identity.cjs` · `? scripts/dev-virtual-printer.cjs` · **`? scripts/dot-overlap-labels.cjs`** · `? scripts/fixtures/{batch-reservation-golden-on.json, batch-rolling-fix.patch, batch-rolling-golden.json}` · `? scripts/printing-copy.cjs` · `? scripts/printing-dedupe.cjs` · `? scripts/printing-escpos-identity.cjs` · `? scripts/printing-failure-split.cjs` · `? scripts/printing-gating.cjs` · `? scripts/printing-network-guard.cjs` · `? scripts/printing-transport-contract.cjs` · `? scripts/sixteen-pizza-admission.cjs` · `? scripts/slot-interval-dots.cjs` · `? scripts/slot-interval-engine-identity.cjs` · `? scripts/slot-interval-event-override.cjs` · `? scripts/slot-interval-generator.cjs` · `? scripts/slot-interval-grid-routing.cjs` · `? scripts/slot-interval-settings.cjs` · `? scripts/slot-interval-van-list-tolerance.cjs` · `? scripts/slot-interval-van-resolution.cjs`
(bold = the four updated here)

### DOCS
`? docs/add-order-fit-message-report.md` · `? docs/add-order-render-fix-report.md` · `? docs/batch-keep-together-investigation-report.md` · `? docs/batch-overlap-review-report.md` · `? docs/batch-reservation-investigation-report.md` · `? docs/batch-reservation-p0-p2-report.md` · `? docs/batch-reservation-p3-report.md` · `? docs/batch-rolling-durable-harness-report.md` · `? docs/batch-rolling-fix-report.md` · `? docs/batch-split-review-report.md` · `? docs/dashboard-order-and-batch-overlap-report.md` · `? docs/discovery-incident-followup-report.md` · `? docs/discovery-upsert-incident-report.md` · `? docs/dot-label-full-only-report.md` · **`? docs/dot-label-wont-fit-report.md`** (this file) · `? docs/dot-overlap-labels-report.md` · `? docs/edit-busy-fix-report.md` · `? docs/edit-lock-and-refresh-report.md` · `? docs/gusto-event-update-trace-report.md` · `? docs/sixteen-pizza-bug-report.md` · `? docs/slot-interval-build-report.md` · `? docs/slot-interval-event-override-report.md` · `? docs/slot-interval-hardening-report.md` · `? docs/slot-interval-van-level-report.md` · `? docs/wired-printing-build-report.md` · `? docs/wired-printing-followup-report.md` · `? docs/wired-printing-investigation-report.md`

### ANYTHING ELSE
Nothing — every one of the 126 entries is above. Two stale detached worktrees under
`/private/var/folders/…/slot-head-dots-*`, from an earlier dots-harness run, remain in `git worktree list`; they are
outside the working tree and untouched.
