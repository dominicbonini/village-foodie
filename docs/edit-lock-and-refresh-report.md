# Two checks: the new edit lock, and stale capacity in the Add Order time list

**Date:** 18 September 2026 · Localhost only; nothing deployed, nothing committed, nothing staged.
**Files changed:** `app/api/dashboard/action/route.ts`, `components/dashboard/AddOrderPanel.tsx`, **new**
`lib/capacity-refresh.ts`; harnesses `scripts/batch-reservation-edit-lock.cjs`, `scripts/add-order-refresh.cjs`,
**new** shared helper `scripts/_mini-dom.cjs`; `scripts/harnesses.json` (both harnesses registered, the helper
excluded as a module); two existing harnesses re-targeted to the new shape (`batch-reservation-writers.cjs`,
`slot-interval-grid-routing.cjs`). **Customer files: byte-identical** (§2.5).
**Scripts run:** `node scripts/run-harnesses.cjs` and the individual harnesses named in this report. `scripts/`
was never globbed. No live truck's token, device id, page, route or API was touched; nothing was created,
edited, cancelled or deleted for any truck.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

---

## STEP 0 — `git status`

### Before

Branch `main`, up to date with `origin/main`, nothing staged: **38 modified, 79 untracked** — the P3 build,
the incident follow-up (`scripts/migrate-from-sheets.cjs`, `scripts/register-payment-domain.cjs` now carry
the write guard; `scripts/harnesses.json`, `run-harnesses.cjs`, `ops-write-guard.cjs` untracked), and every
earlier report. The full listing is the one in `docs/discovery-incident-followup-report.md` §STEP 0 "After"
plus those five files.

### After

Identical, plus:

| Path | State |
|---|---|
| `app/api/dashboard/action/route.ts` | modified (already ` M`; the edit lock gated) |
| `components/dashboard/AddOrderPanel.tsx` | modified (already ` M`; the refresh wiring) |
| `lib/capacity-refresh.ts` | **new**, untracked |
| `scripts/_mini-dom.cjs` | **new**, untracked |
| `scripts/add-order-refresh.cjs` | **new**, untracked |
| `scripts/batch-reservation-edit-lock.cjs` | **new**, untracked |
| `scripts/harnesses.json` | untracked; 45 harnesses listed |
| `docs/edit-lock-and-refresh-report.md` | **new**, untracked — this file |

`git add -A` / `git add .` were not run. Nothing staged, committed, stashed, reset or restored. The two stale
detached worktrees under `/private/var/folders/…/slot-head-dots-*` from an earlier dots-harness run are
still listed by `git worktree list`; left alone.

---

# PART 1 — THE EDIT LOCK

## 1.1 The code as it stood (quoted), and for whom the lock was taken

`app/api/dashboard/action/route.ts`, action `'edit'`, before this task:

```ts
        const editLock = await acquireEventLock(truck.id, order.event_date)
        try {
        const itemCatMap = await buildItemCatMap(supabase, truck.id)
        …
        const unbooked = await removeOrderFromProductionSlot(supabase, truck.id, order.event_id, order.slot, oldLines, itemCatMap)
        const rebooked = await addOrderToProductionSlot(supabase, truck.id, order.event_id, newSlot, newLines, itemCatMap)
        if (order.event_id) {
          if (resolveBatchReservations(truck) && newSlot) {
            const rec = await admitForManual(supabase, truck.id, order.event_id, order.event_date, orderKey, String(newSlot), newLines, itemCatMap)
            await writeReservationRecord(supabase, { truckId: truck.id, orderKey, record: rec })
          } else await writeCookingReservation(supabase, { truckId: truck.id, eventId: order.event_id, orderKey })
        }
        …
        } finally { if (editLock.ok) await releaseEventLock(truck.id, order.event_date) }
```

**The lock was taken for every truck.** Only the re-admission inside it was gated on
`resolveBatchReservations(truck)`; the `acquireEventLock` call was not. Pizzeria Gusto (switch OFF) paid for
a lock it did not need on every edit.

## 1.2 Every function called while it is held, and nested acquisition

Awaited inside the try, in order: `buildItemCatMap`, `removeOrderFromProductionSlot`,
`addOrderToProductionSlot`, `admitForManual`, `writeReservationRecord` / `writeCookingReservation`. Their
modules — `lib/slot-bookings.ts`, `lib/orders/cooking-reservation.ts`, and everything they import from
`lib/orders/place-in-slot.ts`, `lib/slot-availability.ts`, `lib/slot-display.ts`, `lib/capacity-breach.ts`,
`lib/features.ts` — contain **zero** references to `acquireEventLock`. `lib/stock-guard.ts` holds the only
two (its definition and its comment). **There is no nested acquisition**, direct or through a callee.

## 1.3 `acquireEventLock`, quoted — re-entrancy, timeout, and what the operator sees

`lib/stock-guard.ts`:

```ts
const LOCK_TTL_MS = 10_000      // a leaked lock self-heals after this
const LOCK_MAX_WAIT_MS = 3_000
const LOCK_RETRY_MS = 150

export async function acquireEventLock(truckId: string, eventDate: string): Promise<LockResult> {
  const deadline = Date.now() + LOCK_MAX_WAIT_MS
  for (;;) {
    await supabase.from('booking_locks').delete()
      .eq('truck_id', truckId).eq('event_date', eventDate)
      .lt('locked_at', new Date(Date.now() - LOCK_TTL_MS).toISOString())
    const { error } = await supabase.from('booking_locks').insert({ truck_id: truckId, event_date: eventDate })
    if (!error) return { ok: true }
    if (error.code !== '23505') {
      console.warn('[booking_locks] acquire error (failing safe — no insert):', error.message)
      return { ok: false, reason: 'error' }
    }
    if (Date.now() >= deadline) return { ok: false, reason: 'contention' }
    await sleep(LOCK_RETRY_MS)
  }
}
export async function releaseEventLock(truckId: string, eventDate: string): Promise<void> {
  const { error } = await supabase.from('booking_locks').delete().eq('truck_id', truckId).eq('event_date', eventDate)
  if (error) console.warn('[booking_locks] release failed (self-heals via TTL):', error.message)
}
```

- **Not re-entrant.** The lock is one `booking_locks` row per `(truck_id, event_date)`. A second acquire by
  the same request hits `23505` exactly as a competing request would, retries every 150 ms, and after
  **3 000 ms** returns `{ ok: false, reason: 'contention' }`. Measured on the real function against an
  in-memory table: 3 020 ms, 21 retried inserts (§1.5).
- **Already held by someone else:** the same — wait up to 3 s, then `contention`.
- **Timeout:** 3 s to acquire; a leaked row is reclaimed after 10 s.
- **What the operator sees on failure, in the edit flow:** *nothing*. `editLock.ok` was never checked before
  proceeding, so a contended edit waited 3 s and then ran **unlocked** — the save still happened, the
  response was the normal one. Contrast the `manual` action, which on `!haveLock` returns
  `409 { error: 'We are handling a lot of orders right now — please try again', retry: true }`.

## 1.4 Switch OFF (Gusto): identical to HEAD?

**No — not in timing or failure modes.** Result: identical (the same unbook → rebook → P2 reservation
write, in the same order). Timing: every OFF edit gained a `booking_locks` delete + insert + delete round
trip (three extra queries) and, under contention with a customer order being placed at the same moment,
**up to 3 s of waiting**. Failure mode: a contended edit silently proceeded unlocked after the wait, a path
HEAD does not have. A live truck was paying a latency tax for a rule it does not run.

## 1.5 The fix

```ts
        const editBatchOn = resolveBatchReservations(truck)
        const editLock = editBatchOn ? await acquireEventLock(truck.id, order.event_date) : null
        try {
          …
          if (editBatchOn && newSlot) { …admitForManual… writeReservationRecord… }
          else await writeCookingReservation(…)
          …
        } finally { if (editLock?.ok) await releaseEventLock(truck.id, order.event_date) }
```

- OFF ⇒ `editLock` is `null`: no `booking_locks` query, no wait, no release — the OFF edit flow is HEAD's.
- ON ⇒ the lock is taken **exactly once**, before the unbook, and released in the `finally` whether the body
  returns or throws. A `contention`/`error` result leaves `ok:false`, so the release never deletes another
  request's row. (The ON contended edit still proceeds unlocked after 3 s, as before this task; that is the
  pre-existing shape of the manual paths and is unchanged here.)

### Harness — `scripts/batch-reservation-edit-lock.cjs`

**Failure mode:** an OFF truck paying for the lock; a nested acquisition stalling the edit for the whole 3 s
budget.

**Broken variants, run FIRST — both FAILED as required:**

| | Variant | Result |
|---|---|---|
| V1 | the lock taken with the switch OFF — the block exactly as the first P3 build had it | ✓ FAILED: "the acquire is not guarded by the switch" |
| V2 | a nested `acquireEventLock` injected inside the try, before `admitForManual` | ✓ FAILED: "expected exactly ONE acquireEventLock in the edit block, found 2" |

**Real result — structure (the real route text):** exactly one acquire, guarded, released in a `finally`,
nothing nested; OFF ⇒ `editLock` null; none of the seven callee modules calls `acquireEventLock`; the six
functions awaited inside the lock are named and none is the lock.

**Real result — behaviour (the real `lib/stock-guard.ts` compiled against an in-memory `booking_locks`):**

```
  ✓ first acquire → ok (1 ms)
  ✓ a NESTED acquire while held → {ok:false, reason:'contention'} after 3020 ms (not re-entrant; LOCK_MAX_WAIT_MS = 3000)
  ✓ …and it spins for the whole budget (3020 ms): a V2 edit would stall ~3 s, then proceed unlocked
  ✓ after release, acquire → ok again
  ✓ booking_locks: 48 ops, the nested attempt retried its insert 21× (every 150 ms) — and the table is empty
  ✓ OFF: zero booking_locks operations (identical to HEAD)
  ✓ ON, body throws: one insert, still released (finally)
✅ the edit lock is taken only when ON, exactly once, and always released        rc=0
```

---

# PART 2 — THE STALE TIME LIST

## 2.1 Does the dashboard refetch for a customer order on a NOT STARTED event?

**Yes, for both paths, within about a second.** `app/dashboard/[token]/page.tsx`:

```ts
    const ordersChannel=supabaseBrowser
      .channel(`orders:${truck.id}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'orders',filter:`truck_id=eq.${truck.id}`},
        ()=>fetchAllRef.current())
      .subscribe()
```

`event:'*'` on `orders` filtered only by `truck_id` — no event, no status, no date. Any INSERT, UPDATE or
DELETE on any of the truck's orders calls `fetchAll`.

- **Cash path** — `app/api/orders/submit/route.ts` → `place_order_atomic` INSERTs the row with
  `status = autoAccepted ? 'confirmed' : 'pending'` (line 1008). INSERT → refetch.
- **Card path** — the draft lives in `order_drafts` (`lib/payments/order-drafts.ts`), which the channel does
  not watch; `promoteDraft` then INSERTs into `orders` with the same `status: autoAccepted ? 'confirmed' : 'pending'`
  (`lib/payments/promote-draft.ts:345–372`). INSERT → refetch. **An unpromoted draft triggers nothing**, and
  correctly so: it occupies no capacity until `promoteDraft` books it under the event lock.
- A pre-open order is `pending`, which is in both `ACTIVE_STATUSES` (`/api/dashboard` line 240:
  `['pending','confirmed','modified','cooking','ready']`) and `OCCUPYING_STATUSES`. Nothing is excluded by
  the event being Not started. There is also a 60 s fallback poll.

## 2.2 After the refetch, do the new units reach the time list? — **No. This is the bug.**

The page's fold is fine: `fetchAll` sets `orders`, `serverReservations`, `batchReservationsOn`; the
`offlineCapacity` memo (deps include `offlineOccupancy`, `serverReservations`, `batchReservationsOn`)
recomputes and the panel receives a new `offlineCapacity` prop. Inside `AddOrderPanel`:

```ts
  const capacityInputs = useMemo(() => apiCapacityInputs ?? (offlineForThisEvent ? { …the fold… } : null),
    [apiCapacityInputs, offlineForThisEvent])
```

`apiCapacityInputs` is the panel's **own** `/api/slots` snapshot, set only by `fetchManualSlots`, which ran
on: the event changing, the tab being shown (`isActive`), and reconnect. **Nothing ran it on a dashboard
refetch.** So the memo re-ran (its `offlineForThisEvent` dep changed), returned the same stale
`apiCapacityInputs` object, and every downstream memo — `slotIndicators` (the dot and its "7 Pizzas"),
`manualFitWhy` (the "Order won't fit" label), `manualPlacement` — kept its cached result because
`capacityInputs` had not changed identity. **The stale dependency is `capacityInputs`' preference for a
snapshot that no refetch signal invalidated.** The dot, the count and the label all read the same stale
object, which is exactly Dominic's screen: "17:30 🟢", no count, no label.

The popup did not lie because `submitManual` bypasses the memo: it makes its own fresh `no-store`
`/api/slots` read and runs `fitOrderBackward` on that.

## 2.3 Is `/api/dashboard` itself current? — **Yes.**

```ts
    const productionSlotUnits = selectedEventId ? await getProductionSlotUnits(supabase, truck.id, selectedEventId) : {}
    const eventReservations = selectedEventId ? await readCookingReservations(supabase, truck.id, selectedEventId) : []
    dashReservations = eventReservations
    dashBatchReservations = resolveBatchReservations(truck)
    dashProductionSlotUnits = productionSlotUnits
```

Both reads are for the selected event (today's, or the `event_id` param), straight from
`production_slot_usage` and `orders.cooking_reservation`, which the customer submit wrote under the event
lock. The response the refetch received already carried 7 @17:30 and its reservation. The data reached the
panel; the panel did not look.

## 2.4 Reproduced on the real component

`scripts/add-order-refresh.cjs` mounts the **real** `AddOrderPanel` with `react-dom/client` on
`scripts/_mini-dom.cjs` — the smallest DOM that lets react-dom 19 mount a tree in Node and keep it mounted,
so state survives and effects run (renderToString, which the other panel harnesses use, can do neither, and
this bug *is* state). The repo has no jsdom or test renderer; the helper adds no dependency. `fetch` is a
stub that counts `/api/slots` reads and answers with whatever board the scenario says the server holds;
handlers are invoked through the props React attached to the `<select>`, i.e. the functions React itself
would call.

The broken variant V1 (the fix's refetch-signal effect removed) reproduces the report exactly: mount with an
empty board → `"17:30 🟢"`; the customer's 7 @17:30 lands and the dashboard refetches (a new
`offlineCapacity` prop, and the server now holds it) → **still `"17:30 🟢"`, 1 slots read in total.** With the
fix the same sequence gives `"17:30 🟡 7 Pizzas · Order won’t fit"`.

## 2.5 The fix, by symbol

**(a) The repair — `AddOrderPanel`.**

- `fetchFreshSlots(ev)` — **new**, the ONE `/api/slots` read: operator token, event scope,
  `cache: 'no-store'`. Returns the parsed body, applies no state.
- `applyFreshSlots(body)` — **new**: `setApiSlots` / `setApiQueueByCat` / `setApiCapacityInputs` /
  `setApiCatConfigs` / `setEventTz` from one body.
- `fetchManualSlots` — now `applyFreshSlots(await fetchFreshSlots(…))`; its failure branch unchanged. (It
  used to be a plain `fetch`; it is now `no-store` like the re-check.)
- `cachedCapacityFingerprint` — **new** memo: `JSON.stringify([productionSlotUnits, reservations, batchReservations])`
  of the `offlineCapacity` prop — its **content**, because the prop's identity changes on every 60 s poll and
  the content only when an order did. An effect on it (skipping the first render) calls
  `capacityRefresher.request('dashboard-refetch')`. This is what closes 2.2.
- `submitManual`'s re-check now reads `const checkData = await fetchFreshSlots(manualEvent)` **and calls
  `applyFreshSlots(checkData)`** — so after any submit the list has been judged on the same response as the
  popup.

**(b) The safety net — `lib/capacity-refresh.ts`, `createCapacityRefresher`.** A plain object the panel
creates once (`useMemo`, latest-value refs for the event and the online flag):

| Rule from the brief | How |
|---|---|
| the same authenticated fresh re-check call submitManual uses | `fetchFresh: () => fetchFreshSlots(manualEventRef.current)` |
| update the list from it | `apply: applyFreshSlots` on success |
| at most once every 5 seconds | `minIntervalMs: 5000`; a request inside the window becomes **one trailing** read at the window's end — never dropped |
| never block opening the dropdown | `request()` is synchronous and fire-and-forget |
| show no label while nothing is known | unchanged: `capacityInputs === null` ⇒ `manualFitWhy`/`slotIndicators` empty; a pending refresh keeps the last data, no flicker |
| a failed fetch keeps the last data silently | `apply` runs only on success; rejection is swallowed and counted |
| offline uses the cached data exactly as now | `isOnline: () => !isOfflineRef.current && isOnline()` ⇒ no fetch at all |

Triggers: the `<select>` gained `onPointerDown` (mouse, touch, pen) and `onFocus` (keyboard) →
`request('dropdown-open' / 'dropdown-focus')`; the tab-shown effect now distinguishes an **event change**
(immediate `fetchManualSlots` — a new grid must never wait on a throttle) from the tab merely being **shown
again** on the same event (`request('tab-shown')`, throttled) via `fetchedEventKeyRef`; and the
dashboard-refetch signal above. The labels come from `manualFitWhy` → `fitOrderBackward` over the same
body the popup's `fitOrderBackward` ran on, so after a refresh the two cannot disagree.

**(c) Customer paths unchanged.** SHA-256 of nine files snapshotted before the first edit and compared after
the last: `app/trucks/[slug]/order/page.tsx`, `app/trucks/[slug]/TruckClient.tsx`,
`app/api/orders/submit/route.ts`, `app/api/slots/[truckId]/route.ts`, `lib/payments/promote-draft.ts`,
`lib/payments/order-drafts.ts`, `lib/slot-availability.ts`, `lib/slot-display.ts`, `lib/slot-fit-message.ts`
— **all nine identical** (`diff` empty).

### Harness — `scripts/add-order-refresh.cjs`

**Failure mode:** the list showing a time as free after the server no longer has room — the operator picks
it, and only the popup tells the truth.

**Broken variants, run FIRST — both FAILED as required:**

| | Variant | Result |
|---|---|---|
| V1 | the stale memo dependency restored: the `cachedCapacityFingerprint` effect removed | ✓ FAILED: `"17:30 🟢" → "17:30 🟢"` after the refetch, 1 slots read |
| V2 | the dropdown open not fetching: `onPointerDown`/`onFocus` removed | ✓ FAILED: opening the dropdown made 0 fresh reads |

**Real result** (≈60 s: four real 5-second throttle windows — the refresher's clock is inside the component):

```
  ✓ mount: one /api/slots read (1)
  ✓ before: "17:30 🟢" — no count, no label (an empty board)
  ✓ dashboard refetch → exactly one fresh /api/slots read (2 total)
  ✓ after: "17:30 🟡 7 Pizzas · Order won’t fit"
  ✓ …and 17:45 still fits: "17:45 🟢" (7 in 17:30–17:45 free)
  ✓ three opens inside the throttle window: the handler returns at once and no read has started yet
  ✓ …then exactly ONE fresh read at the window's end (1), 5444 ms after the first open
  ✓ an open outside the window → one immediate read (1)
  ✓ a failed read: attempted (1), list unchanged: "17:30 🟡 7 Pizzas · Order won’t fit"
  ✓ offline: dropdown open + a changed cache → 0 reads
  ✓ offline: the list still shows the last data: "17:30 🟡 7 Pizzas · Order won’t fit"
✅ the time list refreshes from the same read the popup uses        rc=0
```

The dot reads 🟡 because 7 of 8 is loaded, not full; the label is the basket-aware verdict — 7 + 7 in one
window of 8 under Dominic's rule is refused, and the popup says the same.

---

## AFTER

| Check | Result |
|---|---|
| `node scripts/run-harnesses.cjs` | **45 run · 45 passed · 0 failed — true exit code 0** |
| `batch-rolling-identity.cjs` | rc=0, against `scripts/fixtures/batch-rolling-golden.json` **sha `8bdae817748ad334…`, mtime 17 Sep 10:11** — not regenerated |
| `batch-reservation-golden-on.cjs` | rc=0, against `scripts/fixtures/batch-reservation-golden-on.json` **sha `ce5550b7ee2a42ce…`, mtime 17 Sep 13:42** — not regenerated |
| `npx tsc --noEmit` | **true exit code 0**, no output |
| `npx next build` | "Compiled successfully in 4.8s", **true exit code 0** |

Two existing harnesses had encoded the shapes this task changed and were re-targeted, not weakened:
`batch-reservation-writers.cjs` (its edit-site regex expected the unconditional lock; now expects the gated
form) and `slot-interval-grid-routing.cjs` (it counted two token-bearing `/api/slots` fetches; there is now
exactly one shared site, and it asserts both callers go through it and no other `/api/slots` fetch exists).
The first sweep after the edits reported both red (43/45); the resweep on the final tree is the 45/45 above.

**eslint, changed files, against a clean HEAD worktree — delta per rule:**

| File · rule · severity | HEAD → tree |
|---|---|
| `components/dashboard/AddOrderPanel.tsx` · `react-hooks/exhaustive-deps` · warn | 7 → **1** |
| `components/dashboard/AddOrderPanel.tsx` · `react-hooks/set-state-in-effect` · error | 5 → **4** |
| `app/api/dashboard/action/route.ts` · (all rules) | unchanged |
| `lib/capacity-refresh.ts` (new) | 0 errors, 0 warnings |
| **totals** | errors 29 → 28 · warnings 12 → 6 |

No rule count went up. (An intermediate state added two `@typescript-eslint/no-explicit-any` errors; they
were removed by typing the shared read's body as `FreshSlotsBody` before the final lint.)

---

## LOCALHOST CHECK — test-truck (Pizza Kitchen), switch ON, event "Rolling batch test" 17:00–21:00, 15-minute grid

1. Dashboard → Add Order; add 7 pizzas. The time list shows `17:30 🟢`.
2. In another tab, as a customer, place an order for 7 pizzas @17:30 (cash or card — both insert into
   `orders` and fire the realtime channel).
3. Within a few seconds — one realtime refetch plus at most one 5-second throttle window — the list reads
   **`17:30 🟡 7 Pizzas · Order won’t fit`** without touching anything. `17:45 🟢` stays.
4. Close and reopen the dropdown: still `17:30 🟡 7 Pizzas · Order won’t fit`. (Opening it asked for a fresh
   read; the answer was the same.) Pick 17:30 and Add anyway: the popup names the same window, 17:15–17:30,
   existing 7, free 1 — list and popup agree.
5. Edit an existing order (change an item or its time) and save: it saves normally; with the switch ON the
   edit takes the event lock once and releases it; the board updates. On an OFF truck the edit is exactly
   today's.

Do not run the Gusto part of anything: Pizzeria Gusto is OFF and its edit flow is now HEAD's by construction
(§1.5); there is nothing to look at and nothing was looked at.

---

## Anything I could not establish

- **The contended-ON edit still proceeds unlocked after 3 s.** `editLock.ok` is not checked before the
  body runs — that is how the block arrived in the first P3 build, and the brief's fix scope was "ON only,
  once, always released", which is done. Returning a 409 as the manual path does would be a one-line
  change; I did not make it without being asked.
- **Whether `fetchManualSlots` becoming `no-store` changes anything on a real device.** Browser
  `fetch` to an API route with the app's headers was already effectively uncached; the harness cannot
  observe an HTTP cache.
- **Real wall-clock latency of step 3.** The harness proves the mechanism with a stubbed fetch and real
  5 s windows; the realtime round trip and the `/api/slots` response time on localhost are not measured
  here. The bound is: realtime delivery + one `/api/dashboard` + one `/api/slots`, plus up to 5 s if a
  refresh had run in the previous 5 s.
- **`react-hooks/set-state-in-effect` at 4** in the panel: pre-existing (was 5); the one this work removed
  was incidental. The remaining four are outside this task's scope.
