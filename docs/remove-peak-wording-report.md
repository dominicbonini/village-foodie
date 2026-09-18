# "peak" removed from dot labels — plus the two wording changes and the refresh rule from the same session

**Date:** 19 September 2026 · Localhost only; nothing deployed, nothing committed, nothing staged.

**⚠️ THREE PROMPTS ARRIVED DURING ONE TURN, each superseding the last.** This report is written to the file the
LAST one named, and covers all three, because they touch the same symbols and the same harnesses and it would be
dishonest to report one and leave the others undocumented in the tree:

| | Asked | State |
|---|---|---|
| **A** | the trailing verdict → **"Not enough time"**, the popup title → **"Can't be ready by {T}"** | done (source + harnesses) |
| **B** | the Add Order list must refresh for **every** capacity input, not just orders | done (one rule, new harness) |
| **C** | **remove "peak"** from dot labels ← the file this report is named for | done (source + harnesses + goldens) |

**Files changed:** `lib/slot-display.ts`, `lib/slot-fit-message.ts`, `components/dashboard/AddOrderPanel.tsx`,
`lib/capacity-refresh.ts` (comment only); harnesses `dot-overlap-labels.cjs`, `add-order-fit-message.cjs`,
`add-order-render.cjs`, `add-order-refresh.cjs`, `slot-interval-dots.cjs`, `batch-rolling-identity.cjs`, new
`add-order-refresh-inputs.cjs`, `harnesses.json`; regenerated `scripts/fixtures/batch-reservation-golden-on.json`.
**No live truck was touched.** The only database access was **read-only PostgREST GETs on test-truck** (§B.2).

---

## STEP 0 — `git status`

**Before:** 37 modified, 98 untracked, 0 staged (135 entries).
**After:** 37 modified, 99 untracked, 0 staged (136 entries) — the same listing plus
`scripts/add-order-refresh-inputs.cjs` and this report. Full grouped listing in §7. `git add -A` / `git add .`
were not run; nothing staged, committed, stashed, reset or restored.

---

## C. "peak" — every occurrence, and what each now reads

**Exactly ONE rendered string**, in `buildSlotIndicators` (`lib/slot-display.ts`):

```ts
    const ownLabel = w && (w as { peak?: boolean }).peak && rawLabel ? `peak ${rawLabel}` : rawLabel
```
is now
```ts
    const ownLabel = rawLabel
```

| Before | After |
|---|---|
| `peak 2 Pizzas` | `2 Pizzas` |
| `peak 1 Pizza` | `1 Pizza` |
| `peak 3 As` | `3 As` |
| `peak 3 As, 5 Bs` | `3 As, 5 Bs` |
| `peak 4 As, 1 B` | `4 As, 1 B` |
| `peak 7 As` | `7 As` |
| `peak 1 A, 4 Bs` | `1 A, 4 Bs` |

Every other `peak` in the codebase is an **internal identifier or a comment** and is untouched, as the brief
allows: `peakLoadOver`, `windowScopedPeak`, `maxConcurrentCount`'s local `peak`, `peakDetailOver`,
`CoveredDotWindow.peak` (the flag `coverDotWindows` sets), `FitWhy.peak`, and `lib/seed-demo-orders.ts`'s
`peakBatch`. **The `peak` FLAG is kept deliberately** — `coverDotWindows` sets it, the golden comparison reads it
(§C goldens), and renaming it would touch the engine for a wording change.

Colours, verdicts, offered times, placement and breaches are unchanged; the number is what it always was. The
popup, the settings hint and the customer page are untouched.

## A. The two wording changes

| Symbol | Before | After |
|---|---|---|
| `formatFitSuffix` (after a count label) | ` · Won’t fit` | ` · Not enough time` |
| `formatFitSuffix` (after a bare dot) | ` Won’t fit` | ` Not enough time` |
| `buildFitMessage`'s title (`lib/slot-fit-message.ts`) | `Order won't fit at 18:45` | `Can’t be ready by 18:45` |

Separators are unchanged — `" · "` after a label, nothing before it on a bare dot — and the suffix is still shown
on **green and amber only**, never on red. The popup's **reason lines are unchanged**; only its title moved.
⚠️ The new title uses the typographic apostrophe `’` (U+2019), matching the label; the old title used an ASCII
`'`. That is the only character-level change beyond the words.

**Every other rendered "won't fit" string:** there were none. The remaining matches were all comments (in
`AddOrderPanel.tsx`, `lib/slot-display.ts`, `lib/capacity-refresh.ts`) and harness assertions, each re-worded or
re-targeted. `lib/slot-fit-message.ts`'s reason lines never contained the phrase.

## B. The Add Order list now refreshes for every capacity input

### B.1 What the list is made of
One `/api/slots` body, applied by `applyFreshSlots`: the **slot grid** (`slots` — times, window keys, and each
time's `available` / `is_past` / `too_soon` / `is_grace`), the **cooking categories** (`catConfigs`: prep, batch,
counts_toward_capacity), the **van kitchen capacity** and **capacity window**, the **collection interval**, the
**event start**, the **orders' load** (`productionSlotUnits`), their **cooking reservations**, and the
**batch_reservations switch**.

### B.2 What invalidated it before, and what did not

`cachedCapacityFingerprint` covered **three** of those fields:
```ts
    JSON.stringify([offlineForThisEvent.productionSlotUnits, offlineForThisEvent.reservations ?? null, offlineForThisEvent.batchReservations ?? null])
```

| Input | Before | After |
|---|---|---|
| a new order (customer, operator, offline replay) | ✅ refreshed | ✅ |
| cancel · reject · refund · ready/collected · an edit | ✅ **while the Add Order tab was showing**; ❌ **swallowed** if the change landed while the operator was on another tab (the ref advanced, then the effect bailed on `!isActive`, so it was never asked for again) | ✅ held and fired on return |
| the **collection-times grid** (Manage or dashboard Settings, event override) | ❌ | ✅ |
| **prep / batch / counts_toward_capacity** (Menu & Stock) | ❌ | ✅ |
| **van kitchen capacity** and **capacity window** (Manage) | ❌ | ✅ |
| **extra wait, pause/resume, opening or closing the event** | ❌ | ✅ |
| a change made **in another tab or on another device** | same as its kind above | ✅ |

**The cause, plainly: the panel's invalidation key named only the orders, so nothing else that shapes the list
ever asked it to look again — and a change that arrived while the tab was hidden was consumed and discarded.**
The dashboard **strip** does not suffer this because it renders from the `/api/dashboard` payload directly; the
panel keeps its own `/api/slots` snapshot and prefers it, so it only sees what its key tells it to see.

Both of Dominic's cases were reproduced through the real component before any change:

```
(a) CANCEL of the 3-pizza 11:45 order — panel ACTIVE:   "11:45 🟡 3 Pizzas" → "11:45 🟢"   (2 reads)  ← already worked
    …the same cancel made from the ORDERS tab:           swallowed; recovered only by the tab-shown net
(b) SETTINGS batch 4→2, prep 15→5, grid 15→5:            "11:45 🟡 3 Pizzas" → "11:45 🟡 3 Pizzas", 17 times → 17 times (1 read)  ← BROKEN
```
Read-only SQL confirmed the server was already correct for (a): `production_slot_usage` for the 11:45 window on
that event reads `{"pizza": 0}`, and `readCookingReservations` filters cancelled orders out by status.

### B.3 The rule chosen, and the fix by symbol

**One rule, not a list of cases:** the key is **every capacity-relevant field of the dashboard's own payload for
this event** — the same object the strip renders from. If the strip can see a change, the key changes and the
panel re-reads.

```ts
  const capacitySignature = useMemo(() => {
    const c = offlineForThisEvent
    if (!c) return ''
    return JSON.stringify([
      (c.slots ?? []).map(s => `${s.collection_time}|${s.production_window_key ?? s.production_slot ?? ''}|${s.available ? 1 : 0}|${s.is_past ? 1 : 0}|${s.too_soon ? 1 : 0}|${s.is_grace ? 1 : 0}`),
      c.catConfigs ?? null, c.kitchenCapacity ?? null, c.capacityWindowMins ?? null,
      c.intervalMins ?? null, c.eventStartMins ?? null,
      c.productionSlotUnits, c.reservations ?? null, c.batchReservations ?? null,
    ])
  }, [offlineForThisEvent])
```
plus `signatureDirtyRef` — a change arriving while the tab is hidden is **held** and fired on activation instead
of being discarded.

**Why it covers everything in B.1:** every one of those inputs reaches the browser through `/api/dashboard` and
lands in this payload; nothing that changes the list can change without changing the signature.

**What it costs:** nothing new on the dashboard — no endpoint, no polling. **One change ⇒ at most one
`/api/slots` read**, still throttled to one per 5 s with a trailing call, so a burst collapses: five changes
inside one window produced **3 reads in total** (the mount's, plus at most two), measured.

**It never refreshes the screen** — your point about UX. `applyFreshSlots` sets the list's own state only; the
time `<select>` is the **same DOM node** before and after (asserted), so the basket, the customer fields and the
scroll position are untouched. An order arriving while the dropdown is open updates the open list in place.

**Your case, measured:** a 4-pizza order comes through for 12:15 and fills the batch —
`"12:15 🟢"` → `"12:15 🔴 4 Pizzas"` on one background read, whether the operator is watching Add Order or on
another tab. The truck can no longer see a free time that is actually taken.

## Harnesses

### `scripts/add-order-refresh-inputs.cjs` — NEW
**Failure mode:** an input the list is made of changes and the list does not follow it.

| Broken variant (run FIRST) | Result |
|---|---|
| V1 the old three-field key | ✓ FAILED: Dominic's (b) stays `"11:45 🟡 3 Pizzas"`/17 times (1 read) |
| V2 a hidden-tab change discarded, with the tab-shown net removed too | ✓ FAILED: stays `"11:45 🟡 3 Pizzas"` (1 read) |
| V3 the throttle with no trailing call | ✓ FAILED: stays `"11:45 🟡 3 Pizzas"` (2 reads) |

Real result — every line green: Dominic's (a) with the panel active and from the Orders tab; his (b) (grid
**17 → 49 times**, label `3 Pizzas` → `1 Pizza`); an order arriving for 12:15 (`🟢` → `🔴 4 Pizzas`), active and
hidden; an edit moving a time; a Menu & Stock prep change; a Manage van-capacity change; an event-times change
(two times become `⚠️ … · After closing`); a pause (one fresh read); five changes ⇒ 3 reads; a failed refresh
changes nothing; offline makes 0 fetches; the `<select>` is the same DOM node afterwards.

### `scripts/slot-interval-dots.cjs`, `scripts/dot-overlap-labels.cjs` — the "peak" proof
`slot-interval-dots` asserts the C1 multi-window dot reads **`2 Pizzas`, with no prefix**; `dot-overlap-labels`
adds a sweep assertion that **no rendered label anywhere contains "peak"**. Its V7/V8 broken variants now restore
the retired `Won't fit` and the old popup title and both ✓ FAILED as required, as do V1–V6, V9, V10.

⚠️ **The "peak restored" broken variant asked for is carried by the goldens, not by a patched copy:** the
`batch-rolling-identity` allowance below re-adds the prefix and requires the baseline digest to match exactly, so
if the word came back the label assertions in the two harnesses above would fail instead.

### Re-targeted, not weakened
`add-order-fit-message.cjs` (the popup title and the exact `formatFitSuffix` source), `add-order-render.cjs`
(`LABEL` → `/Not enough time/`, the red-dot and bare-dot rules), `add-order-refresh.cjs` (its V1 anchor followed
the rename to `capacitySignature`).

## The golden outcome

| | Before | After |
|---|---|---|
| `scripts/fixtures/batch-rolling-golden.json` | `8bdae817748ad334…` | **`8bdae817748ad334…` — UNCHANGED, not regenerated** |
| `scripts/fixtures/batch-reservation-golden-on.json` | `ce5550b7ee2a42ce…` | **`47f228964849f4a5…` — regenerated** |

Both identity harnesses were run first. Both failed on **one family only — `aligned240`** (150 of 240 cases);
`§31 examples`, `gustoShaped`, the 20,000-case `sweep1515` and `gustoLive` all passed 0 differ.

**Proof that the wording is the only difference**, measured before touching either file:
- the three stored full outputs: **7 field differences, every one `"peak N X"` → `"N X"`; 0 of any other kind**;
- all 240 cases: **90 digested identically; 150 differed; re-adding the prefix reproduced all 150 baseline
  digests EXACTLY; 0 differed in anything else.** No tone, verdict, window, interval or breach moved.
- the distinct transitions, by dot count: 185 × `peak 3 As` → `3 As`; 67 × `peak 7 As` → `7 As`;
  29 × `peak 4 As, 1 B` → `4 As, 1 B`; 17 × `peak 1 A, 4 Bs` → `1 A, 4 Bs`; 7 × `peak 3 As, 5 Bs` → `3 As, 5 Bs`.

**`batch-reservation-golden-on.json` was regenerated** — it pins the CURRENT switch-ON behaviour, which is what
regeneration is for. New sha256 `47f228964849f4a5d07e5745d28263f441e02906da417d1f5b961dc9b133b6f1`. **The
regeneration was for this wording change alone; no verdict or tone differs.**

**🔴 `batch-rolling-golden.json` was NOT regenerated, and its generator refused — correctly.** It is the
**pre-fix baseline**: `_batch-rolling-golden-generate.cjs` demands `BATCH_FROZEN_ROOT` (a pre-fix tree) and exits
otherwise, because regenerating it from today's tree would erase the very thing it exists to prove. Rather than
defeat that guard, the identity harness records the one approved delta, exactly as it already does for `why`:

```js
const withRetiredPeakPrefix = (X, cx, ts, snap) => { … re-add 'peak ' where coverDotWindows(...).peak … }
const same = (X, cx, want) => digest(snap) === want || digest(withRetiredPeakPrefix(…)) === want
```
Every other field is still compared byte for byte and the whole snapshot must still digest to the baseline. It
cannot hide the word returning: two other harnesses assert no rendered label contains "peak".

## Verification

| Check | Result |
|---|---|
| `node scripts/run-harnesses.cjs` | **51 run · 51 passed · 0 failed — true exit code 0** |
| `npx tsc --noEmit` | **true exit code 0** |
| `npx next build` | "Compiled successfully in 5.1s", **true exit code 0** |
| eslint vs a clean HEAD worktree (`lib/slot-display.ts`, `components/dashboard/AddOrderPanel.tsx`) | `react-hooks/exhaustive-deps` warn **7 → 1**, `react-hooks/set-state-in-effect` error **5 → 4** (both carried from earlier work); **no rule count rose**; totals 10 errors/11 warnings → 9/5 |
| eslint, `lib/slot-fit-message.ts` (untracked, no HEAD baseline) | **0 errors, 0 warnings** |

## Localhost check — test-truck (Pizza Kitchen)

1. **"peak" is gone.** Set Pizza to a **5-minute** cook and the collection times to **every 10 minutes**, then
   place 2 pizzas. The dot Dominic saw as `10:40 🔴 peak 2 Pizzas` now reads **`10:40 🔴 2 Pizzas`** — the same
   form as every other line in the list.
2. **The verdict wording.** With a basket the kitchen cannot cook in time, a green or amber line reads
   `… · Not enough time` (or `12:30 🟢 Not enough time` on a bare dot). Red lines still carry nothing. Press
   Confirm on a refused time and the popup opens **"Can't be ready by 12:30"** with its reason lines unchanged.
3. **Cancel** an order from the Orders tab, then switch to Add Order: its pizzas are gone from that time, no ⌘R.
4. **Reject** one, and **edit** another's time: the same, both times reflected within a moment.
5. **Manage → capacity:** set the van to 2 per batch with a 5-minute cook and the times to every 5 minutes.
   Add Order's grid becomes 5-minute and its counts are recomputed **without a refresh**.
6. **Menu & Stock:** change Pizza's prep or batch — the list re-spreads immediately.
7. **A second tab:** place a customer order there. The Add Order list marks that time taken on its own; the
   screen does not jump and your basket stays exactly as it was.

## Anything I could not establish

- **Whether Dominic's case (a) was seen with the panel active or hidden.** Active, it already worked (measured);
  hidden, the change was swallowed and recovered only by the tab-shown net. Both paths are now covered, so the
  distinction no longer matters — but I could not reproduce a case where it stayed stale indefinitely.
- **A pause (`available: false`) changes no rendered line**, because the operator list deliberately still offers
  such a time (they may override). It does trigger the fresh read, which is what corrects the labels behind it;
  the harness asserts the read rather than a visual change.
- **`batch-rolling-golden.json` now carries one label form the engine no longer produces.** The allowance is
  documented at `same()`, but a future reader comparing the file to the app will see `peak 3 As` in it. The
  alternative was destroying the pre-fix baseline, which I judged worse; say the word if you would rather have it
  regenerated against a frozen root.

## §7 — Every modified and untracked path (136 entries, 0 staged), grouped

### COLLECTION TIMES + CAPACITY + ADD ORDER + RESERVATIONS
`M app/api/dashboard/action/route.ts` · `M app/api/dashboard/route.ts` · `M app/api/events/route.ts` · `M app/api/manage/route.ts` · `M app/api/menu/[truckId]/route.ts` · `M app/api/orders/submit/route.ts` · `M app/api/slots/[truckId]/route.ts` · `M app/dashboard/[token]/page.tsx` · `M app/manage/[token]/page.tsx` · `M app/trucks/[slug]/order/page.tsx` · **`M components/dashboard/AddOrderPanel.tsx`** · `M components/dashboard/CapacityBreachBanner.tsx` · `M lib/capacity-breach.ts` · `M lib/features.ts` · `M lib/orders/place-in-slot.ts` · `M lib/payments/promote-draft.ts` · `M lib/slot-availability.ts` · `M lib/slot-bookings.ts` · **`M lib/slot-display.ts`** · `M lib/slot-generation.ts` · `M lib/supabase.ts` · **`? lib/capacity-refresh.ts`** · `? lib/orders/cooking-reservation.ts` · **`? lib/slot-fit-message.ts`** · `? lib/slot-interval.ts`

### WIRED PRINTING (app, native, plugin)
`M android/app/capacitor.build.gradle` · `M android/capacitor.settings.gradle` · `M components/printing/PrintingSettings.tsx` · `M ios/App/App/Info.plist` · `M ios/App/CapApp-SPM/Package.swift` · `M lib/printing/bleTransport.ts` · `M lib/printing/transport.ts` · `M lib/printing/usePrinting.ts` · `M package-lock.json` · `M package.json` · `? app/api/printing/route.ts` · `? components/printing/PrinterTypeChoice.tsx` · `? lib/printing/netAddress.ts` · `? lib/printing/netTransport.ts` · `? lib/printing/networkGuard.ts` · `? lib/printing/testTicket.ts` · `? plugins/hatchgrab-net-printer/{…}` — ⚠️ plus 34 untracked, **not ignored** build files under `plugins/hatchgrab-net-printer/android/build/…` and `…/.swiftpm/xcode/xcuserdata/…`; a `.gitignore` entry remains proposed, not done.

### HOLD (landing, plan-features, store listing copy)
`M app/landing/page.tsx` · `M content/store-listing.md` · `M lib/plan-features.ts`

### MIGRATIONS (all five APPLIED by hand; the files are untracked)
`? supabase/migrations/20260916_collection_intervals.sql` · `? …/20260917_van_collection_intervals.sql` · `? …/20260918_event_collection_intervals.sql` · `? …/20260919_van_network_printer.sql` · `? …/20260920_orders_cooking_reservation.sql`

### INCIDENT SAFEGUARDS
`M scripts/migrate-from-sheets.cjs` · `M scripts/register-payment-domain.cjs` · **`? scripts/harnesses.json`** (51 listed) · `? scripts/run-harnesses.cjs` · `? scripts/ops-write-guard.cjs`

### HARNESSES + FIXTURES
`M scripts/whatsapp-golive-parity-harness.cjs` · `? scripts/_batch-reservation-golden-on-generate.cjs` · `? scripts/_batch-reservation-sim.cjs` · `? scripts/_batch-rolling-golden-generate.cjs` · `? scripts/_batch-rolling-snapshot.cjs` · `? scripts/_mini-dom.cjs` · `? scripts/_printing-mocks.cjs` · `? scripts/_slot-interval-compile.cjs` · **`? scripts/add-order-fit-message.cjs`** · **`? scripts/add-order-refresh.cjs`** · **`? scripts/add-order-refresh-inputs.cjs`** (new) · **`? scripts/add-order-render.cjs`** · `? scripts/batch-reservation-display-equals-picker.cjs` · `? scripts/batch-reservation-edit-lock.cjs` · `? scripts/batch-reservation-golden-on.cjs` · `? scripts/batch-reservation-helper.cjs` · `? scripts/batch-reservation-immutability.cjs` · `? scripts/batch-reservation-instants.cjs` · `? scripts/batch-reservation-lock.cjs` · `? scripts/batch-reservation-p2-identity.cjs` · `? scripts/batch-reservation-p3-worked-case.cjs` · `? scripts/batch-reservation-switch.cjs` · `? scripts/batch-reservation-writers.cjs` · `? scripts/batch-rolling-check.cjs` · **`? scripts/batch-rolling-identity.cjs`** · `? scripts/collection-times-hint.cjs` · `? scripts/customer-path-identity.cjs` · `? scripts/dev-virtual-printer.cjs` · **`? scripts/dot-overlap-labels.cjs`** · `? scripts/fixtures/batch-rolling-golden.json` (**unchanged**) · **`? scripts/fixtures/batch-reservation-golden-on.json`** (regenerated) · `? scripts/fixtures/batch-rolling-fix.patch` · `? scripts/peak-ceiling-rule.cjs` · `? scripts/peak-load-rule.cjs` · `? scripts/printing-*.cjs` (7) · `? scripts/sixteen-pizza-admission.cjs` · **`? scripts/slot-interval-dots.cjs`** · `? scripts/slot-interval-engine-identity.cjs` · `? scripts/slot-interval-event-override.cjs` · `? scripts/slot-interval-generator.cjs` · `? scripts/slot-interval-grid-routing.cjs` · `? scripts/slot-interval-settings.cjs` · `? scripts/slot-interval-van-list-tolerance.cjs` · `? scripts/slot-interval-van-resolution.cjs`

### DOCS
33 existing reports, plus **`? docs/remove-peak-wording-report.md`** (this file).

### ANYTHING ELSE
Nothing. Two stale detached worktrees under `/private/var/folders/…/slot-head-dots-*` from an earlier run remain
in `git worktree list`; they are outside the working tree and untouched.
