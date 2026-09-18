# The Add Order time list was still stale after a cancellation — review, cause and fix

**Date** 19 September 2026 · **Scope** localhost only, nothing deployed · **Truck** test-truck (Pizza
Kitchen) fixtures only. Pizzeria Gusto was never called, read or written.

**The report** Dominic cancelled an order from the dashboard, moved to Add Order, and the list still
showed that order's pizzas. Only ⌘R cleared it — the same symptom the previous round was meant to fix.

**The answer, in one line.** The panel was never told anything had changed. `fetchAll` — the dashboard's
own refetch, which every operator action ends with — **discards itself when a read is already in
flight**. Cancel while the 60-second poll happens to be outstanding and the dashboard never refetched, so
`orders` and `offlineCapacity` both kept their pre-cancel values, so the panel's snapshot key had nothing
to notice and never asked for a fresh read. Intermittent exactly as reported. A second, independent
defect made the key weaker than it needed to be, and a third silently dropped offline changes. All three
are fixed, and the list no longer depends on the dashboard noticing anything at all.

---

## STEP 0 — the tree before any change

`git status` at the start: **0 staged · 38 modified · 107 untracked** (145 entries; the report
below is the 108th untracked file, taking the tree to 146). Goldens unchanged throughout:

| golden | sha256 |
|---|---|
| `scripts/fixtures/batch-rolling-golden.json` | `8bdae817748ad334bdac297592f19a58550fd17bc5ce7424331d73df82f32660` |
| `scripts/fixtures/batch-reservation-golden-on.json` | `e3f0a88099fd797c659da57881febc378e928dbc7bc8283a6931c814d6b29222` |

---

# ESTABLISH

## §1 — The invalidation rule as it stood

The key is `capacitySignature`, computed in `AddOrderPanel` from `offlineForThisEvent` — the
`offlineCapacity` prop, narrowed to the panel's own event:

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

A change of that string sets `signatureDirtyRef` and, when the tab is active and an event is resolved,
calls `capacityRefresher.request('capacity-changed')` — one authenticated no-store read of
`/api/slots/<truckId>`, applied by `applyFreshSlots` into `apiSlots` / `apiCapacityInputs` /
`apiCatConfigs`. Those are what the list is drawn from: `capacityInputs` resolves as
`apiCapacityInputs ?? offlineForThisEvent`, so once one read has landed the panel renders from its **own**
snapshot, not from the dashboard's view.

**The source of the key is a fold, not the orders.** `offlineCapacity.productionSlotUnits` is
`buildOfflineOccupancy(...)` — the sum of the items of the orders the dashboard considers occupying. The
key therefore witnesses a status change only through the oven load it happens to move. The per-slot flags
in the key (`available`, `is_past`, `too_soon`, `is_grace`) do not move when a status does, and `tone` and
`label` are deliberately excluded.

## §2 — A cancel, end to end

1. **The route.** `app/api/dashboard/action/route.ts`, the `cancel` branch: reads the order, resolves the
   email payment state, writes `status: 'cancelled'` plus the reason, releases any Stripe hold, and then —
   **awaited, before the response** — calls `removeOrderFromProductionSlot` with the order's slot and
   lines. So by the time the client sees `{success: true}` the ledger is already decremented.
2. **What the panel's read returns afterwards.** `/api/slots/<truckId>` builds its
   `productionSlotUnits` from `getProductionSlotUnits`, which reads the stored
   `production_slot_usage` rows — the very rows the cancel just decremented. A fresh read after a cancel
   is correct. **This is why ⌘R cures it and nothing else does.**
3. **Do the fields the key is built from change?** Yes — I tested the fold directly rather than reasoning
   about it. `buildOfflineOccupancy` drops a cancelled order in every shape a live dashboard can hand it:
   the row returned with `status: 'cancelled'`, the row filtered out of the payload entirely, and the row
   still `confirmed` but marked cancelled by the offline status overlay. It also drops it when the item
   maps to no category and when the item-category map has not loaded. So the answer to the question as
   put — *"if a cancelled order still appears in the payload the key reads, the key cannot notice it"* —
   is that it does **not** still appear, and the key is not blind in principle.
4. **So the key is not the failure.** The failure is one step earlier. `handleGateResult` ends every
   action with `await refetch()`, and `refetch` was `fetchAll` itself. `fetchAll` opens with the R4
   in-flight guard:

   ```ts
   if(inFlightRef.current){
     if(!forceSeed) return          // ← DROPPED, NEVER QUEUED
     inFlightRef.current.abort()
   }
   ```

   The guard exists to stop the 60-second **poll** rebuilding a backlog, and it is right to. But the
   operator's own post-action refetch went through the same door with `forceSeed` false, so whenever a
   read was outstanding the cancel's refetch simply returned. `orders` never changed. `offlineCapacity`
   never changed. The key never moved. The panel never asked. The next poll, up to 60 seconds later,
   eventually corrected it — by which time Dominic had already looked and reloaded.

## §3 — The same trace for every other change

| change | writes | ledger | reaches the panel before the fix |
|---|---|---|---|
| **reject** | `status: 'rejected'` via `lib/orders/reject-order.ts` | `removeOrderFromProductionSlot` | only if the refetch was not dropped |
| **refund** | refund row; cancellation writes the status | via the cancel path | same |
| **mark collected** | `status: 'collected'` | `rebuildProductionSlotUsage` for the date | same |
| **an edit** | items / slot rewritten | `removeOrderFromProductionSlot` + `addOrderToProductionSlot` | same |
| **a new order** | insert | `addOrderToProductionSlot` | same, plus orders-realtime → `fetchAll` (also droppable) |
| **a settings change** | prep secs / batch / interval / van capacity | none needed | same; the capacity half of the key covers it |
| **another device** | that device's own write | as above | realtime → `fetchAll` → same droppable path |

Every one of them depended on a `fetchAll` that could be discarded. `collected` is worth naming
separately: the dashboard's occupying set is `pending · confirmed · modified · cooking`, so a collected
order leaves the oven projection, and the list should free that window — it did not.

## §4 — Was the previous round's fix actually in the tree?

Yes. The held-dirty-flag fix is present in `components/dashboard/AddOrderPanel.tsx`, verbatim:

```ts
if (lastSignatureRef.current === null) { lastSignatureRef.current = capacitySignature; return }
if (capacitySignature !== lastSignatureRef.current) { lastSignatureRef.current = capacitySignature; signatureDirtyRef.current = true }
if (!signatureDirtyRef.current) return
if (!isActive || !manualEvent) return                 // held: the activation run below picks it up
signatureDirtyRef.current = false
capacityRefresher.request('capacity-changed')
```

and `lib/capacity-refresh.ts` exists with the 5-second throttle and the trailing call. `isActive` is
wired (`isActive={activeTab==='add'}`) and the panel is kept mounted and hidden by CSS, so the tab-shown
and activation paths are real.

**A dev-server restart is not required.** These are ordinary client components with no build step, no
environment variable and no server-side module state; Next compiles them from the working tree on the
next request. A Fast Refresh update preserves refs, which here only means a held dirty flag survives a
hot update — harmless. Nothing about the previous fix needed a restart, and nothing about this one does.

## §5 — The triggers and the throttle, and what can be dropped

Triggers before this round: the key changing, the Add Order tab being shown, and the time dropdown being
opened or focused. Throttle: `minIntervalMs: 5000` in `createCapacityRefresher`.

`request()` returns false for three unlike reasons, and they are **not** equivalent:

- **throttled** — `schedule()` sets a trailing timer. **Deferred, not dropped.**
- **in flight** — `trailingWanted = true`, and the completing read schedules the trailing one.
  **Deferred, not dropped.**
- **offline** — `skippedOffline++` and nothing happens at all. **Dropped.**

And the effect cleared `signatureDirtyRef` **before** calling `request()`, so an offline refusal ate the
change permanently: the key had already advanced, so it never asked again. That is a real second hole,
independent of Dominic's report, and it is fixed.

---

# THE FIX

## 1. The operator's own refetch is no longer droppable — `app/dashboard/[token]/page.tsx`

`fetchAll` gains a third mode, `supersede`, alongside the existing `forceSeed`:

```ts
const fetchAll=useCallback(async(currentPin=pin,forceSeed=false,supersede=false)=>{
  if(inFlightRef.current){
    if(!forceSeed&&!supersede) return
    inFlightRef.current.abort()
  }
```

`supersede` is the same ruled exception `forceSeed` already carried — the operator's own action takes the
outstanding read's place — **without** `forceSeed`'s config re-seed, which would undo operator-edited
settings. Still exactly one read in flight; only the poll is ever discarded. Six call sites now pass it:
the shared post-action handler (`refetch`), the order edit, the refund, the buzzer write, the interval
settings save, and the order-placed callback.

## 2. A key that moves when a STATUS moves — `components/dashboard/AddOrderPanel.tsx`

**What I used, as asked:** the orders themselves, which the panel already receives as a prop. A new
`ordersSignature` lists, for the panel's own event, each order as `order_key | STATUS | slot | total
quantity`, sorted. **Status is a literal field of the key**, so cancel, reject, refund, collected, an
edit's quantity or time change, a new order and a change made on another device all change the string by
construction rather than by inference. The snapshot key is now both halves:

```ts
const snapshotKey = `${capacitySignature}¦${ordersSignature}`
```

`capacitySignature` still carries the grid, the categories, the van capacity and the event's slot flags —
the things no order can tell you about. Neither half alone is enough.

## 3. All five refresh triggers, all through the existing authenticated no-store read

| trigger | where |
|---|---|
| the basket changes, including the first item | new `basketSignature` effect; first run records, does not fire |
| the time dropdown is opened | `onPointerDown` / `onFocus` on the `<select>` (already present) |
| the Add Order tab is shown | the event-key effect's `else` branch (already present) |
| a dashboard refetch or realtime event arrives | the `snapshotKey` effect |
| the snapshot is older than **`SLOT_SNAPSHOT_MAX_AGE_MS = 10_000`** | see below |

**The max-age backstop** is checked in two places, and it needs both. A render-time effect covers the
case where something re-rendered, so the check happens before the operator can act on what that render
drew. A 1-second timer (`SLOT_SNAPSHOT_MAX_AGE_MS / 10`) covers the case this backstop actually exists
for: **nothing told the panel anything, so nothing re-rendered, so a render-time check would never run
again.** The tick is one subtraction; a read happens only when the snapshot is genuinely past its age,
and is still subject to the 5-second throttle, the hidden-tab gate and the offline gate. `lastAppliedAtRef`
is seeded to mount time, not zero, so the mount's own read is not doubled — and because a **failed** read
never stamps it, a failing initial load is retried 10 seconds later instead of going quiet.

This is what makes the list independent of the dashboard: even with the upstream fix reverted, a cancel
clears within about 11 seconds with no manual refresh. That is proven below.

## 4. Throttle: one read per 5 seconds, with a trailing call

Unchanged in `lib/capacity-refresh.ts`, and now readable from outside. A new `pending` getter reports
whether a read is running or a trailing one is already scheduled, and the key effect uses it:

```ts
const started = capacityRefresher.request('capacity-changed')
if (started || capacityRefresher.pending) signatureDirtyRef.current = false
```

Throttled and in-flight refusals carry the change, so the flag is consumed. An **offline** refusal carries
nothing, so the flag is held and the change is asked for again later. A burst never drops the final state.

## 5. In place, silent, and no reload

Nothing remounts: `applyFreshSlots` only replaces state the list reads, so the `<select>` is the same DOM
node before and after, the dropdown stays open, the chosen time survives and scroll does not jump. There
is **no spinner and no inline indicator at all** — a refresh that the operator can see is a refresh that
interrupts them. A failed read applies nothing and raises nothing; the last good data stays. Offline makes
no fetch. The customer page is untouched. There is no full-page reload anywhere.

## 6. A refresh in flight when the operator submits

They do not race, because they do not share a decision. `submitManual` performs its **own** fresh
re-check and that is what governs admission; a background refresh only ever repaints the list. If a
refresh is in flight at submit time, three things are true: the submit's re-check is a separate read that
cannot be pre-empted by the refresher; the refresher applies to state the submit does not consult; and if
the refresher's result lands mid-submit it changes what the operator sees next, never what the server
accepted. The submit is authoritative either way, and a rejected time still produces the "Can't be ready
by …" popup.

---

# PROOF

`scripts/add-order-refresh-inputs.cjs` — **extended**, not replaced (it already mounts the real component
on the mini-DOM and counts reads, which is exactly the rig these assertions need). It is listed in
`scripts/harnesses.json` and runs in the suite. Runtime ≈ 150 s: the throttle windows and the 10-second
max age are real, not mocked.

**Failure mode it defends:** the Add Order time list showing a state the kitchen has already left —
either because nothing invalidated the panel's snapshot, or because a trigger fired and the read was
dropped rather than deferred.

**Broken variants ran FIRST, and every one FAILED as required:**

```
  ✓ FAILED as required  V1 the old three-field key — Dominic's (b): "11:45 🟡 3 Pizzas"/17 times → "11:45 🟡 3 Pizzas"/17 times (1 reads)
  ✓ FAILED as required  V2 a hidden-tab change discarded, with the tab-shown net gone too: "11:45 🟡 3 Pizzas" → "11:45 🟡 3 Pizzas" (1 reads)
  ✓ FAILED as required  V3 throttle with no trailing call: "11:45 🟡 3 Pizzas" → "11:45 🟡 3 Pizzas" (2 reads)
  ✓ FAILED as required  V4 the fold-only key on a STATUS-only cancel: "11:45 🟡 3 Pizzas" → "11:45 🟡 3 Pizzas" (0 reads)
  ✓ FAILED as required  V5 basket trigger removed: adding an item asked for 0 reads
```

V4 is the one the prompt asked for: the key reduced to today's `capacitySignature`, driven by a cancel
that reaches the panel as a status change while the folded capacity view stays byte-identical. **0 reads,
list stale.** V5 removes the basket trigger. V3 removes the trailing call.

**The real tree, all 26 assertions passing:**

```
── DOMINIC'S TWO CASES ──────────────────────────────────────────────────────────────────
  ✓ (a) the 3-pizza 11:45 order is cancelled: "11:45 🟡 3 Pizzas" → "11:45 🟢" in 2 reads, no manual refresh
  ✓ (a) …and when the cancel is made from the ORDERS tab: 1 reads while hidden, then "11:45 🟢" on return
  ✓ (b) 4-per-batch/15-min cook/15-min grid → 2-per-batch/5-min cook/5-min grid: the GRID moves 17 → 49 times
  ✓ (b) …and the LABEL is recomputed on the new categories: "11:45 🟡 3 Pizzas" → "11:45 🟡 1 Pizza" (2 reads)

── AN ORDER COMING THROUGH MUST NOT LEAVE A TAKEN TIME LOOKING FREE ─────────────────────
  ✓ a 4-pizza order arrives for 12:15 and fills the batch: "12:15 🟢" → "12:15 🔴 4 Pizzas" (2 reads)
  ✓ …and the same when it arrives while the operator is on another tab: "12:15 🔴 4 Pizzas"

── EVERY OTHER INPUT THE LIST IS MADE OF ────────────────────────────────────────────────
  ✓ an EDIT moves the order 11:45 → 12:15: "11:45 🟢" and "12:15 🟡 3 Pizzas" (2 reads)
  ✓ a MENU & STOCK prep change (15 → 30 minutes) re-spreads the same 3 pizzas across the list (2 reads)
  ✓ a MANAGE van kitchen-capacity change (none → 2) re-tones the list: "11:45 🟡 3 Pizzas" → "11:45 🔴❗ 3 Pizzas" (2 reads)
  ✓ an EVENT-TIMES change (11:00 and 11:15 fall into grace) reaches the list: 2 times now read "⚠️ … · After closing"
  ✓ a PAUSE (11:00, 11:15 unavailable) invalidates the snapshot: 1 fresh read

── THE RULES THE SAFETY NET KEEPS ───────────────────────────────────────────────────────
  ✓ five changes inside one 5-second window: 3 reads in total (mount + at most two), not one per change
  ✓ …and the list ends on the LAST state (the 5-minute grid): 49 times
  ✓ a failed refresh changes nothing and raises nothing: "11:45 🟡 3 Pizzas"
  ✓ offline: 0 fetches made (must be 0)
  ✓ the time <select> is the SAME DOM node after a refresh — the list updates in place, nothing remounts
  ✓ …and only the LABELS moved: 12:15 now "12:15 🔴 4 Pizzas", still 18 options

── EVERY STATUS TRANSITION CLEARS THE ORDER FROM THE LIST, WITH NO MANUAL REFRESH ───────
  ✓ an order marked CANCELLED leaves the list: "11:45 🟡 3 Pizzas" → "11:45 🟢" (2 reads)
  ✓ an order marked REJECTED leaves the list: "11:45 🟡 3 Pizzas" → "11:45 🟢" (2 reads)
  ✓ an order marked REFUNDED leaves the list: "11:45 🟡 3 Pizzas" → "11:45 🟢" (2 reads)
  ✓ an order marked COLLECTED leaves the list: "11:45 🟡 3 Pizzas" → "11:45 🟢" (2 reads)
  ✓ a status-only cancel (the dashboard's folded capacity unchanged): "11:45 🟡 3 Pizzas" → "11:45 🟢" in 1 read
  ✓ a DROPPED dashboard refetch (no prop changes at all): the 10-second max-age backstop still clears it — "11:45 🟡 3 Pizzas" → "11:45 🟢" (2 reads)

── THE TWO TRIGGERS THE OPERATOR MAKES ──────────────────────────────────────────────────
  ✓ adding an item to the basket asks for exactly 1 read
  ✓ …and the crosses and labels are drawn from the FRESH board: 12:15 reads "12:15 🔴 4 Pizzas"
  ✓ opening the dropdown asks for 1 read and the list is current when it opens: "11:45 🟢"

✅ every capacity input AND every status change invalidates the Add Order snapshot, and nothing else moves
```

The basket and dropdown are driven through the component's **own** handlers — the props React attached to
the menu button and the `<select>` — so they are the same functions a tap calls, not a simulation.

**One honest gap.** The `supersede` change itself has no dedicated assertion: the guard is inline in a
4,500-line page component with no harness rig around it. It is covered at the level that matters — the
dropped-refetch case above proves the list corrects **even when the refetch is dropped** — and by
`tsc --noEmit`, the production build and the 53-harness suite. I did not write a new page-level harness
for it.

---

# VERIFICATION — true exit codes

| command | exit |
|---|---|
| `node scripts/add-order-refresh-inputs.cjs` | **0** (26 assertions, 5 broken variants failed first) |
| `node scripts/run-harnesses.cjs` | **0** — 53 run · 53 passed · 0 failed |
| `npx tsc --noEmit` | **0** |
| `npx next build` | **0** |

**Goldens — unchanged, byte for byte:**

| golden | sha256 |
|---|---|
| `scripts/fixtures/batch-rolling-golden.json` | `8bdae817748ad334bdac297592f19a58550fd17bc5ce7424331d73df82f32660` |
| `scripts/fixtures/batch-reservation-golden-on.json` | `e3f0a88099fd797c659da57881febc378e928dbc7bc8283a6931c814d6b29222` |

No golden generator was run.

## eslint delta, per rule, against a clean HEAD worktree

`lib/capacity-refresh.ts` does not exist at HEAD (it is untracked, from the previous round), so HEAD was
linted on the two tracked files only.

| rule | HEAD | working tree | delta |
|---|---|---|---|
| `@next/next/no-img-element` (warn) | 1 | 1 | 0 |
| `@typescript-eslint/no-explicit-any` (error) | 59 | 59 | 0 |
| `@typescript-eslint/no-unused-vars` (warn) | 29 | 29 | 0 |
| `react-hooks/exhaustive-deps` (warn) | 9 | 3 | **−6** |
| `react-hooks/immutability` (error) | 1 | 1 | 0 |
| `react-hooks/preserve-manual-memoization` (error) | 3 | 3 | 0 |
| `react-hooks/purity` (error) | 5 | 5 | 0 |
| `react-hooks/refs` (error) | 5 | 5 | 0 |
| `react-hooks/set-state-in-effect` (error) | 13 | 12 | **−1** |
| `react/no-unescaped-entities` (error) | 9 | 9 | 0 |

**No rule gained a single count.** The two reductions are not this round's doing alone — HEAD is
`fc0fddc` and the working tree carries every uncommitted round — but nothing here added to any of them.

`lib/capacity-refresh.ts` lints **clean**: 0 errors, 0 warnings.
`scripts/add-order-refresh-inputs.cjs` reports 8 `@typescript-eslint/no-require-imports` errors, which is
**exactly** what its untouched sibling `scripts/add-order-refresh.cjs` reports — the house pattern for
`.cjs` harnesses, not a new finding.

---

# Files changed this round

| file | change |
|---|---|
| `app/dashboard/[token]/page.tsx` | `fetchAll` gains `supersede`; six operator-action refetches use it |
| `components/dashboard/AddOrderPanel.tsx` | `ordersSignature` + `snapshotKey`; basket trigger; `SLOT_SNAPSHOT_MAX_AGE_MS` backstop (render-time + 1 s timer); `lastAppliedAtRef`; offline refusals no longer eat the dirty flag |
| `lib/capacity-refresh.ts` | new `pending` getter — distinguishes deferred from dropped |
| `scripts/add-order-refresh-inputs.cjs` | V2 re-anchored; V4 and V5 added; order fixtures; the four status transitions, the status-only cancel, the dropped-refetch backstop, the basket and dropdown triggers |
| `docs/add-order-refresh-review-report.md` | this report |

Nothing was staged, committed, stashed, reset or restored. The temporary HEAD worktree used for the lint
delta was removed.

# git status — full, grouped

**0 staged.** (`git diff --cached --name-only` is empty.)

**38 modified (tracked):**

```
android/app/capacitor.build.gradle          lib/capacity-breach.ts
android/capacitor.settings.gradle           lib/features.ts
app/api/dashboard/action/route.ts           lib/orders/place-in-slot.ts
app/api/dashboard/route.ts                  lib/payments/promote-draft.ts
app/api/events/route.ts                     lib/plan-features.ts
app/api/manage/route.ts                     lib/printing/bleTransport.ts
app/api/menu/[truckId]/route.ts             lib/printing/transport.ts
app/api/orders/submit/route.ts              lib/printing/usePrinting.ts
app/api/slots/[truckId]/route.ts            lib/slot-availability.ts
app/dashboard/[token]/page.tsx        ←     lib/slot-bookings.ts
app/landing/page.tsx                        lib/slot-display.ts
app/manage/[token]/page.tsx                 lib/slot-generation.ts
app/trucks/[slug]/order/page.tsx            lib/supabase.ts
components/dashboard/AddOrderPanel.tsx ←    package-lock.json
components/dashboard/CapacityBreachBanner.tsx  package.json
components/printing/PrintingSettings.tsx    scripts/migrate-from-sheets.cjs
content/store-listing.md                    scripts/register-payment-domain.cjs
docs/reference-manual.md                    scripts/whatsapp-golive-parity-harness.cjs
ios/App/App/Info.plist
ios/App/CapApp-SPM/Package.swift
```

**108 untracked, by directory:**

| directory | files |
|---|---|
| `scripts/` | 51 (incl. `add-order-refresh-inputs.cjs` ←, `capacity-refresh` harnesses) |
| `docs/` | 40 (incl. `add-order-refresh-review-report.md` ←) |
| `supabase/migrations/` | 5 |
| `lib/printing/` | 4 |
| `lib/` | 3 (incl. `capacity-refresh.ts` ←) |
| `scripts/fixtures/` | 1 |
| `plugins/` | 1 |
| `lib/orders/` | 1 |
| `components/printing/` | 1 |
| `app/api/printing/` | 1 |

**Totals now: 0 staged · 38 modified · 108 untracked · 146 entries.** The only movement this round is the
new report; every file this round touched was already modified or already untracked.
