# A contended edit must not proceed unlocked (switch ON only)

**Date:** 19 September 2026 · Localhost only; nothing deployed, nothing committed, nothing staged.
**Files changed:** `app/api/dashboard/action/route.ts` (action `'edit'`), `app/dashboard/[token]/page.tsx`
(`submitEdit`), `scripts/batch-reservation-edit-lock.cjs` (extended), `scripts/batch-reservation-writers.cjs`
(its edit-site span re-targeted to the lock's new position, claim unchanged).
**Scripts run:** `node scripts/run-harnesses.cjs` and the two harnesses named, individually. `scripts/` was never
globbed; no golden generator was run. No live truck's token, device id, page, route or API was touched.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

---

## STEP 0 — the open bullet, and `git status`

`docs/edit-lock-and-refresh-report.md`, "Anything I could not establish", first bullet:

> **The contended-ON edit still proceeds unlocked after 3 s.** `editLock.ok` is not checked before the body
> runs — that is how the block arrived in the first P3 build, and the brief's fix scope was "ON only, once,
> always released", which is done. Returning a 409 as the manual path does would be a one-line change; I did
> not make it without being asked.

It was not a one-line change, and the reason is the finding of this task (§1.1).

### `git status` — before
Branch `main`, up to date with `origin/main`. **37 modified, 85 untracked, 0 staged** (122 entries). The
listing is identical to the "after" listing in §5 except that `docs/edit-busy-fix-report.md` did not yet exist.

### `git status` — after
**37 modified, 85 untracked, 0 staged** (122 entries). Full grouped listing in §5. `git add -A` / `git add .` were
not run; nothing was staged, committed, stashed, reset or restored.

---

## 1. The change, by symbol

### 1.1 What was actually wrong — the lock sat AFTER the row was written
In the edit action the order row is updated at `supabase.from('orders').update({ items: repriced.items, deals,
slot: newSlot, … })` (the "CHECK THE WRITE" block), then `recalcOrderPayment` runs, and only **then** did the
re-booking block take the lock:

```ts
      let slotWarning: string | null = null
      if (order.event_date && (items || slot !== undefined)) {
        const editBatchOn = resolveBatchReservations(truck)
        const editLock = editBatchOn ? await acquireEventLock(truck.id, order.event_date) : null
        try { … unbook … rebook … admitForManual … } finally { if (editLock?.ok) await releaseEventLock(…) }
      }
```

So a busy refusal returned *there* would have said "try again" about an order the handler had **already
changed** — the operator's edit saved, the capacity board not re-booked. "Leave the order unchanged" could only
be true if the lock were taken before the write.

### 1.2 The change — `app/api/dashboard/action/route.ts`, action `'edit'`
The lock moved **above the row update**; the busy refusal returns **before any write**; one `try … finally`
now spans update → payment recalculation → re-booking, releasing in every path (including the update's own
500 return):

```ts
      const newSlot = slot !== undefined ? slot : order.slot
      const editBatchOn = resolveBatchReservations(truck)
      const editNeedsLock = editBatchOn && !!order.event_date && !!(items || slot !== undefined)
      const editLock = editNeedsLock ? await acquireEventLock(truck.id, order.event_date) : null
      if (editNeedsLock && !editLock?.ok) {
        return NextResponse.json(
          { error: 'Someone else is updating orders right now. Please try again.', retry: true },
          { status: 409 },
        )
      }
      let slotWarning: string | null = null
      try {
        const { error: updateErr } = await supabase.from('orders').update({ … })
        …recalcOrderPayment…
        if (order.event_date && (items || slot !== undefined)) { …unbook… …rebook… …admitForManual / writeCookingReservation… }
      } finally { if (editLock?.ok) await releaseEventLock(truck.id, order.event_date) }
```

- `editNeedsLock` is the re-booking block's own condition (an event date, and an item or slot change) AND the
  switch — so the lock is taken exactly when the edit is an admission.
- **Switch OFF:** `editNeedsLock` is false ⇒ no acquire, no refusal, `editLock` null, the `try/finally` adds
  nothing ⇒ the OFF edit flow is byte-for-byte HEAD's, as before.
- **The busy response is the manual path's, verbatim in status and shape.** Manual path, quoted:

```ts
        if (!haveLock) {
          return NextResponse.json(
            { error: 'We are handling a lot of orders right now — please try again', retry: true },
            { status: 409 },
          )
        }
```

### 1.3 The UI — `app/dashboard/[token]/page.tsx`, `submitEdit`
How the Add Order panel handles the manual path's busy answer, quoted:

```ts
      // Lock contention past the budget (rare): server did NOT insert — keep the order, retry.
      if (result.status === 409 && data?.retry) {
        showToast('Busy right now — tap Confirm again in a moment', 'error')
        return
      }
```

`submitEdit` had no such branch: a non-OK response fell to `if(!res.ok)throw new Error(data.error)` → the
catch's `showToast(err.message||'Edit failed','error')` — which would have shown the message, but as a thrown
"failure". It now matches the panel: a `retry` branch **before** the generic throw that shows the server's
message and returns, leaving `editingOrder` set (the modal and the operator's edits stay), no `fetchAll`, and
`actionLoading` cleared by the existing `finally`:

```ts
      if(res.status===409&&data?.retry){
        showToast(data?.error||'Someone else is updating orders right now. Please try again.','error')
        return
      }
      if(!res.ok)throw new Error(data.error)
```

### 1.4 The new string
`Someone else is updating orders right now. Please try again.` — served by the route; the dashboard shows it
(and carries the same text as its fallback). No other string was added or changed.

---

## 2. The harness — `scripts/batch-reservation-edit-lock.cjs`, extended

**Failure mode:** an ON edit whose lock could not be acquired writing the order anyway — either running the
body unlocked (the pre-fix behaviour) or refusing after the row was already saved.

**Broken variants, run FIRST — all FAILED as required:**

| | Variant | Result |
|---|---|---|
| **V3 (new, run first)** | the body runs when the lock was not acquired — the busy refusal removed from the real block | ✓ FAILED as required: "acquire / busy refusal / row update not all present" |
| V1 | the lock taken for every truck | ✓ FAILED as required: "the acquire is not guarded by the switch" |
| V2 | a nested `acquireEventLock` inside the try | ✓ FAILED as required: "expected exactly ONE acquireEventLock, found 2" |
| **V3 (behaviour)** | a flow that ignores `ok`, against the real `acquireEventLock` with the lock held by another request | ✓ FAILED as required: the body ran 1× under contention |

**Real result — STRUCTURE (the real route text):** exactly one acquire, guarded by `editNeedsLock`; acquire →
busy refusal → row update in that order (the lock is taken BEFORE the write); the row update inside the try
that releases; the refusal is the manual path's shape `409, { error, retry: true }` and returns; OFF ⇒ no
booking_locks write, no wait, no refusal, no release; seven callee modules never call `acquireEventLock`; the
seven functions awaited inside the lock (`recalcOrderPayment`, `buildItemCatMap`, `removeOrderFromProductionSlot`,
`addOrderToProductionSlot`, `admitForManual`, `writeReservationRecord`, `writeCookingReservation`) are named and
none is the lock; `submitEdit` shows the message and returns before the generic throw.

**Real result — BEHAVIOUR (the real `lib/stock-guard.ts` against an in-memory `booking_locks`, the route's
control flow mirrored with a write counter):**

```
  ✓ OFF: zero booking_locks operations, the edit written (identical to HEAD)
  ✓ ON, lock available: one insert, the edit written once, released
  ✓ ON, body throws: still released (finally)
  ✓ another request holds the lock
  ✓ ON, lock unavailable: 409 {"error":"Someone else is updating orders right now. Please try again.","retry":true} after 3023 ms
  ✓ ON, lock unavailable: the edit body did NOT run — nothing written
  ✓ …and the other request's lock was not released by the refused edit
✅ the edit lock is taken only when ON, before any write, exactly once, always released — and a busy lock refuses with the manual path's answer   rc=0
```

The 3 s is `LOCK_MAX_WAIT_MS` — the existing wait, unchanged; the refusal comes after it, as the brief asked.

`scripts/batch-reservation-writers.cjs`: its edit-site regex anchored on `editBatchOn ?` and a 2,500-character
span; the lock now sits above the row update and the payment recalculation, so the span to the reservation
write is wider. Re-targeted to `editNeedsLock ?` and 9,000 characters; the claim — the record is written after
the acquire and before the finally that releases — is unchanged. rc=0.

---

## 3. Verification

| Check | Result |
|---|---|
| `node scripts/run-harnesses.cjs` | **47 run · 47 passed · 0 failed — true exit code 0** (a first sweep, run before the harness's own slice fix, reported 46/47 on that one file; the resweep on the final tree is the figure above) |
| `npx tsc --noEmit` | **true exit code 0** (one intermediate error — `slotWarning` declared inside the new try and read after it — fixed by hoisting the declaration) |
| `npx next build` | "Compiled successfully in 5.3s", **true exit code 0** |
| `scripts/fixtures/batch-rolling-golden.json` | sha256 `8bdae817748ad334…` — unchanged |
| `scripts/fixtures/batch-reservation-golden-on.json` | sha256 `ce5550b7ee2a42ce…` — unchanged |

---

## 4. Anything I could not establish
- **The 3-second wait before the refusal on a real device.** Proven against an in-memory lock (3,023 ms); the
  Supabase round trips add to it in production. The refusal itself is instant once the budget is spent.
- **Whether the edit modal's own "Save" button re-enables promptly after the busy toast.** `actionLoading` is
  cleared in `submitEdit`'s existing `finally`, which the new branch reaches; not rendered here.
- **Outbox replay of an edit.** Edits are not queued offline (`submitEdit` is a plain `fetch`), so no replay path
  meets this refusal; if one is added later it must handle `retry: true` as the manual replay does.

---

## 5. Every modified and untracked path, grouped (nothing staged)

### COLLECTION TIMES + CAPACITY + ADD ORDER + RESERVATIONS
```
M app/api/dashboard/action/route.ts
M app/api/dashboard/route.ts
M app/api/events/route.ts
M app/api/manage/route.ts
M app/api/menu/[truckId]/route.ts
M app/api/orders/submit/route.ts
M app/api/slots/[truckId]/route.ts
M app/dashboard/[token]/page.tsx
M app/manage/[token]/page.tsx
M app/trucks/[slug]/order/page.tsx
M components/dashboard/AddOrderPanel.tsx
M components/dashboard/CapacityBreachBanner.tsx
M lib/capacity-breach.ts
M lib/features.ts
M lib/orders/place-in-slot.ts
M lib/payments/promote-draft.ts
M lib/slot-availability.ts
M lib/slot-bookings.ts
M lib/slot-display.ts
M lib/slot-generation.ts
M lib/supabase.ts
? lib/capacity-refresh.ts
? lib/orders/cooking-reservation.ts
? lib/slot-fit-message.ts
? lib/slot-interval.ts
```

### WIRED PRINTING (app, native, plugin)
```
M android/app/capacitor.build.gradle
M android/capacitor.settings.gradle
M components/printing/PrintingSettings.tsx
M ios/App/App/Info.plist
M ios/App/CapApp-SPM/Package.swift
M lib/printing/bleTransport.ts
M lib/printing/transport.ts
M lib/printing/usePrinting.ts
M package-lock.json
M package.json
? app/api/printing/route.ts
? components/printing/PrinterTypeChoice.tsx
? lib/printing/netAddress.ts
? lib/printing/netTransport.ts
? lib/printing/networkGuard.ts
? lib/printing/testTicket.ts
? plugins/hatchgrab-net-printer/Package.swift
? plugins/hatchgrab-net-printer/index.d.ts
? plugins/hatchgrab-net-printer/index.js
? plugins/hatchgrab-net-printer/package.json
? plugins/hatchgrab-net-printer/android/build.gradle
? plugins/hatchgrab-net-printer/android/src/main/AndroidManifest.xml
? plugins/hatchgrab-net-printer/android/src/main/java/com/hatchgrab/netprinter/NetPrinterPlugin.java
? plugins/hatchgrab-net-printer/ios/Sources/NetPrinterPlugin/NetPrinterPlugin.swift
```
⚠️ **Also untracked and NOT ignored** (`.gitignore` has `/build` at the root only): the plugin's Android build
output, 34 files under `plugins/hatchgrab-net-printer/android/build/…` (`.transforms/…`, `intermediates/…`,
`outputs/aar/hatchgrab-net-printer-debug.aar`, `outputs/logs/…`, `tmp/…`), and
`plugins/hatchgrab-net-printer/.swiftpm/xcode/xcuserdata/dominicbonini.xcuserdatad/xcschemes/xcschememanagement.plist`.
A `git add plugins/` would commit all of them. They belong in `.gitignore` (`plugins/**/build/`, `**/xcuserdata/`)
before the plugin is added — proposed, not done.

### HOLD (landing, plan-features, store listing copy)
```
M app/landing/page.tsx
M content/store-listing.md
M lib/plan-features.ts
```

### MIGRATIONS
```
? supabase/migrations/20260916_collection_intervals.sql        — APPLIED (van-level intervals; the P0–P2 report and the event-override report confirmed the columns live)
? supabase/migrations/20260917_van_collection_intervals.sql    — APPLIED (same series; Manage → Settings reads them)
? supabase/migrations/20260918_event_collection_intervals.sql  — APPLIED (the dashboard Collection times box reads the event columns)
? supabase/migrations/20260919_van_network_printer.sql         — APPLIED (wired printing; the network-guard harness's named-select rule assumes it)
? supabase/migrations/20260920_orders_cooking_reservation.sql  — APPLIED (P0; verified read-only: column present, 0 non-null at the time)
```
(Applied by Dominic by hand; the files are untracked, so the repository does not yet record them.)

### INCIDENT SAFEGUARDS
```
M scripts/migrate-from-sheets.cjs          — the --yes-write-to-production guard
M scripts/register-payment-domain.cjs      — the --yes-write-to-production guard
? scripts/harnesses.json
? scripts/run-harnesses.cjs
? scripts/ops-write-guard.cjs
```

### HARNESSES + FIXTURES
```
M scripts/whatsapp-golive-parity-harness.cjs
? scripts/_batch-reservation-golden-on-generate.cjs
? scripts/_batch-reservation-sim.cjs
? scripts/_batch-rolling-golden-generate.cjs
? scripts/_batch-rolling-snapshot.cjs
? scripts/_mini-dom.cjs
? scripts/_printing-mocks.cjs
? scripts/_slot-interval-compile.cjs
? scripts/add-order-fit-message.cjs
? scripts/add-order-refresh.cjs
? scripts/add-order-render.cjs
? scripts/batch-reservation-display-equals-picker.cjs
? scripts/batch-reservation-edit-lock.cjs
? scripts/batch-reservation-golden-on.cjs
? scripts/batch-reservation-helper.cjs
? scripts/batch-reservation-immutability.cjs
? scripts/batch-reservation-instants.cjs
? scripts/batch-reservation-lock.cjs
? scripts/batch-reservation-p2-identity.cjs
? scripts/batch-reservation-p3-worked-case.cjs
? scripts/batch-reservation-switch.cjs
? scripts/batch-reservation-writers.cjs
? scripts/batch-rolling-check.cjs
? scripts/batch-rolling-identity.cjs
? scripts/collection-times-hint.cjs
? scripts/customer-path-identity.cjs
? scripts/dev-virtual-printer.cjs
? scripts/dot-overlap-labels.cjs
? scripts/fixtures/batch-reservation-golden-on.json
? scripts/fixtures/batch-rolling-fix.patch
? scripts/fixtures/batch-rolling-golden.json
? scripts/printing-copy.cjs
? scripts/printing-dedupe.cjs
? scripts/printing-escpos-identity.cjs
? scripts/printing-failure-split.cjs
? scripts/printing-gating.cjs
? scripts/printing-network-guard.cjs
? scripts/printing-transport-contract.cjs
? scripts/slot-interval-dots.cjs
? scripts/slot-interval-engine-identity.cjs
? scripts/slot-interval-event-override.cjs
? scripts/slot-interval-generator.cjs
? scripts/slot-interval-grid-routing.cjs
? scripts/slot-interval-settings.cjs
? scripts/slot-interval-van-list-tolerance.cjs
? scripts/slot-interval-van-resolution.cjs
```

### DOCS
```
? docs/add-order-fit-message-report.md
? docs/add-order-render-fix-report.md
? docs/batch-keep-together-investigation-report.md
? docs/batch-overlap-review-report.md
? docs/batch-reservation-investigation-report.md
? docs/batch-reservation-p0-p2-report.md
? docs/batch-reservation-p3-report.md
? docs/batch-rolling-durable-harness-report.md
? docs/batch-rolling-fix-report.md
? docs/batch-split-review-report.md
? docs/dashboard-order-and-batch-overlap-report.md
? docs/discovery-incident-followup-report.md
? docs/discovery-upsert-incident-report.md
? docs/dot-overlap-labels-report.md
? docs/edit-busy-fix-report.md                 — this file
? docs/edit-lock-and-refresh-report.md
? docs/gusto-event-update-trace-report.md
? docs/slot-interval-build-report.md
? docs/slot-interval-event-override-report.md
? docs/slot-interval-hardening-report.md
? docs/slot-interval-van-level-report.md
? docs/wired-printing-build-report.md
? docs/wired-printing-followup-report.md
? docs/wired-printing-investigation-report.md
```

### ANYTHING ELSE
Nothing. Every one of the 122 entries is listed above (the `plugins/` and `scripts/fixtures/` directories are
expanded to their files). Two stale detached worktrees under `/private/var/folders/…/slot-head-dots-*`, left by an
earlier dots-harness run, are still listed by `git worktree list`; they are outside the working tree and untouched.
