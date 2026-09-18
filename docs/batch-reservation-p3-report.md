# Batch reservations — P3 (Dominic's rule) + P4 (Place it anyway), behind a per-truck switch

Date: 17 September 2026. Localhost only. Nothing deployed, nothing committed, nothing staged.

## ⚠️ 0. An incident you must read first

While running "every harness family", my sweep loop globbed `scripts/*.cjs` and reached two scripts that are
not harnesses. I stopped the loop as soon as I saw it, but not before:

- `scripts/list-stranded-authorisations.cjs` ran to completion. It is **read-only** (no insert/upsert/update/delete,
  no Stripe mutation in its source). It printed: Stripe mode LIVE, 10 promoted drafts with an uncancelled
  authorisation, 0 not captured, "Nothing stranded".
- `scripts/migrate-from-sheets.cjs` — the one-off Google Sheets → Supabase **discovery** migration — **started and
  wrote** before I stopped it. Its own output, verbatim for the stages it reached:

  ```
  📦 Migrating Trucks...
    ❌ Pimp My FIsh: duplicate key value violates unique constraint "discovery_trucks_norm_name_uniq"
    ✅ 151 trucks migrated, 1 failed
  📍 Migrating Venues...
    ❌ <every venue>: there is no unique or exclusion constraint matching the ON CONFLICT specification
  ```
  The stop landed during the venues stage: 773 venue rows failed (nothing written), and the exclusions,
  subscribers, events and link-resolution stages never ran. So the only write is `migrateTrucks`:
  **151 rows upserted into `public.discovery_trucks` (onConflict `name`) from the master sheet, with the service
  role.** The script calls itself idempotent ("safe to run multiple times, uses upsert"), but if any of those 151
  directory rows had been edited in Supabase since the sheet was last the source of truth, the sheet's values are
  now back on top. I cannot tell from here whether that is the case. This is the discovery directory
  (`discovery_trucks`), **not** `public.trucks`, `orders` or any live truck's events; Gusto's trading row was not
  touched. I did not attempt any clean-up — that is your call. Read-only check of what the upsert stamped, if
  you want to see the blast radius:

  ```sql
  select discovery_trucks.name, discovery_trucks.updated_at
  from public.discovery_trucks
  order by discovery_trucks.updated_at desc
  limit 160;
  ```
  (If `discovery_trucks` has no `updated_at`, the row set the sheet writes is the one `migrateTrucks` builds at
  `scripts/migrate-from-sheets.cjs` lines 47–84.)

The remaining families were then run from an **explicit name list** (§6) — no glob. Lesson recorded: the
`scripts/` directory mixes harnesses with operational tools (`migrate-from-sheets`, `outreach-*`,
`register-payment-domain`, `dev-virtual-printer`); a sweep must name its files.

## 1. `git status`

**Before (STEP 0):** taken and shown in chat at the start of this task; after the session was compacted its
verbatim text is not reproducible here. It was the working tree as left by the P0–P2 report, i.e. the same
35 modified paths plus the untracked reports/harnesses/fixtures of this session, minus the files §3 adds.

**After (now):** 106 entries — 35 modified (` M`), 71 untracked (`??`), **nothing staged**. Files this task
added (all untracked): `scripts/_batch-reservation-sim.cjs`, `scripts/batch-reservation-p3-worked-case.cjs`,
`scripts/batch-reservation-immutability.cjs`, `scripts/batch-reservation-instants.cjs`,
`scripts/batch-reservation-display-equals-picker.cjs`, `scripts/batch-reservation-lock.cjs`,
`scripts/batch-reservation-switch.cjs`, `scripts/batch-reservation-golden-on.cjs`,
`scripts/_batch-reservation-golden-on-generate.cjs`, `scripts/fixtures/batch-reservation-golden-on.json`, this
report. Files this task changed are listed by symbol in §3. Not run: `git add`, `commit`, `stash`, `reset`,
`restore`. `git worktree list` shows two stale detached worktrees under `/private/var/folders/…/slot-head-dots-*`
left by an earlier dots-harness run; I left them alone.

## 2. The switch

**Resolution:** `resolveBatchReservations(truck)` in `lib/features.ts` returns
`truck.plan === 'demo' || truck.feature_overrides?.batch_reservations === true || … === 'true'`. Exactly the SQL
truth `trucks.feature_overrides->>'batch_reservations' = 'true' OR trucks.plan = 'demo'`, with the jsonb text
form accepted because `->>` compares text.

**feature_overrides findings (why a non-plan key is safe):** the column is typed `Record<string, boolean> | null`
on the truck row; `canAccess` only consults keys that are in the `Feature` union, so an unknown key is inert
there; `lib/plan-features.ts` and its parity harness never enumerate override keys; the admin card counts keys
("(n active)") and does not list them; and test-truck already carries a non-plan key
(`whatsapp_setup_preview`) as precedent. So no type, parity check or UI list breaks. `batch_reservations` is
**not** added to the `Feature` union or the plan matrix (proved in `batch-reservation-switch.cjs`). No column
was added.

**Where it is resolved, from data the routes already read:**

| Route / path | Truck read it resolves from |
|---|---|
| `/api/slots/[truckId]` | its truck select, now `id, collection_interval_mins, slot_duration_mins, plan, feature_overrides` — both **existing** columns, no new 42703 exposure; no shared named select gained a column |
| `/api/dashboard` | the truck row it already loads for the dashboard (`resolveBatchReservations(truck)`) |
| `/api/orders/submit` | the truck row it already loads (`batchReservationsOn`) |
| `promoteDraft` (`lib/payments/promote-draft.ts`) | the truck row it already loads |
| `/api/dashboard/action` (`manual`, `edit`) | the authenticated `truck` |

**Carried to the client** in `capacityInputs.batchReservations` (`/api/slots`), in `/api/dashboard`'s
`batchReservations` beside `productionSlotUnits`/`reservations`, and from there into the dashboard page's
offline fold (`offlineCapacity.reservations` / `.batchReservations`) and AddOrderPanel's offline
`capacityInputs`. The customer page reads `capacityInputs.batchReservations === true`.

**Live rows (LIVE, read-only, 17 Sep 2026):** ON — demo-3hgvth…, demo-8c95xz…, demo-a76mhb…, test-truck-2,
test-truck-3, tt3 (all plan `demo`). OFF — **pizzeria-gusto** (trial, `{}`), real-thai-food, test-truck (trial,
`{"whatsapp_setup_preview": true}`), test-truck-3-2, tikka-tonic, village-spice. SQL in §7.

## 3. What changed, by symbol

- `lib/features.ts` — **new** `resolveBatchReservations(truck)`.
- `lib/slot-availability.ts` —
  - `EngineReservation` gains `source?: 'fit' | 'override'`.
  - **new** `validReservationsAt(reservations, slot, cat, batch, prepMins)` → the stored windows for one slot
    and category, sorted, plus their item total (ON: seated verbatim).
  - `projectBackwardOccupancy(…, reservations = [], batchReservations = false)`: OFF keeps P2's
    `cachedReservationWindows` sole-at-slot rule (byte-identical); ON seats every valid reservation's windows
    verbatim, then seats only the **unreserved remainder** (`max(0, N − reserved items)`) with today's split
    (`numWindowsSeat`).
  - `fitOrderBackward(…, existingAtSlot, batchReservations = false)`: ON branch per category calls
    `reserveBatches` (floor = event start − prep, now-clamp), records `whyWindows` from its windows, accumulates
    `reservedByCat` and `onVerdicts` (amber if any window was already loaded, red on refusal with the label
    `${Cat} ${existing+M}/${batch}`); the tone loop iterates `batchReservations ? [] : orderLoad`; the return
    adds `reserved` **only when ON** (key absent OFF — this is what keeps OFF byte-identical).
  - **new** `buildAdmittedReservation({ back, slotLabel, qtyByCat, catConfigs, kitchenCapacity, eventStartMins,
    capacityWindowMins, nowMins?, gridIntervalMins? })` → `{ fits, record }`. Fit → nearest-first windows, source
    `'fit'`. Override (P4) → greedy into free space nearest-first, the shortfall added to the **nearest** window
    over the batch, source `'override'`; ≤B stays one window.
  - `earliestBackwardFitSlot(…, reservations = [], batchReservations = false)` and `buildSlotAvailability`
    forward the flag.
- `lib/slot-display.ts` — `buildSlotIndicators(…, reservations = [], batchReservations = false)`.
- `lib/capacity-breach.ts` — `detectCapacityBreaches({ …, batchReservations? })`; `CapacityBreach.override_orders?`
  is present **only when ON** (an always-present `[]` broke OFF identity; fixed) and names the `'override'`
  reservations whose windows overlap the breaching window.
- `lib/slot-bookings.ts` — `readCookingReservations` emits `source`.
- `lib/orders/cooking-reservation.ts` — **new** `writeReservationRecord(supabase, { truckId, orderKey, record })`
  (best-effort, never throws; a failed write never fails the order) and **new**
  `admitForManual(supabase, truckId, eventId, eventDate, orderKey, slotLabel, lines, itemCatMap)` (loads
  configs/meta/units/reservations excluding the order's own, projects ON, returns
  `buildAdmittedReservation(...).record`).
- `lib/orders/place-in-slot.ts` — `placeOrderInSlotLocked(…, excludeOrderKey?, batchReservations = false)` returns
  `{ finalSlot, booked, reservation? }`, the record computed from the **same fresh read under the caller's lock**
  (ON → `buildAdmittedReservation`; OFF → P2's `buildReservationForOrder`).
- `app/api/slots/[truckId]/route.ts`, `app/api/dashboard/route.ts` — resolve and forward the flag (readers,
  breaches, offline `capacityInputs`).
- `app/api/orders/submit/route.ts`, `lib/payments/promote-draft.ts` — `batchReservationsOn`; the claim's record
  written inside the lock (§4).
- `app/api/dashboard/action/route.ts` — `manual`: ON → `admitForManual` + `writeReservationRecord` inside the
  existing lock; `edit`: **new** `editLock = acquireEventLock(truck.id, order.event_date)` around
  unbook → rebook → `admitForManual(newSlot, newLines)` → write, released in `finally`.
- `components/dashboard/AddOrderPanel.tsx` — passes `capacityInputs.batchReservations === true` to
  `projectBackwardOccupancy` / `fitOrderBackward` / `earliestBackwardFitSlot` / `buildSlotIndicators`; the
  `offlineCapacity` prop type and the memoised offline `capacityInputs` fold now carry `reservations` and
  `batchReservations` (found by the render harness: the fold had dropped both, so offline ON reached nothing).
- `app/dashboard/[token]/page.tsx` — **new** state `serverReservations`, `batchReservationsOn` set from
  `/api/dashboard`'s `reservations` / `batchReservations`; both fed to the day strip's `buildSlotIndicators`
  (and its memo deps), into the `offlineCapacity` memo, and the edit picker's `editSlotIndicators` forwards
  `editCapacityInputs.reservations` / `.batchReservations` from `/api/slots`.
- `app/trucks/[slug]/order/page.tsx` — passes the flag through; no other change (customer files otherwise
  untouched, proved).
- `components/dashboard/CapacityBreachBanner.tsx` — **one new string**:
  `Placed anyway: #${id} for ${slot}` (joined with `, ` when several), shown under the existing breach line
  from `override_orders`. No other new user-facing strings.
- `place_order_atomic` — **not changed**. `orders.cooking_reservation` (P0) — the only column written; no
  migration added.

## 4. The lock finding, per write path

| Path | Lock | Where the reservation is written | Finding |
|---|---|---|---|
| Customer submit (`/api/orders/submit`) | `acquireEventLock(resolvedTruckId, orderEventDate)` at route line 877 | after `place_order_atomic`, before `releaseEventLock` (route lines 1052 → 1071 → 1074) | already inside the lock; the record comes from `placeOrderInSlotLocked`'s read under the same lock |
| Outbox replay | replays into `/api/dashboard/action` (`lib/native/outbox.ts` url; AddOrderPanel line 1287) → the `manual` path | as manual | same lock as manual |
| `promoteDraft` | `acquireEventLock(draft.truck_id, eventDate)` (line 212) | line 390, before `releaseEventLock` (line 412) | already inside |
| Manual (`action: 'manual'`) | `acquireEventLock(truck.id, eventDate)` (line 1470) | lines 1693–1696, before `releaseEventLock` (line 1699) | already inside; ON uses `admitForManual` after the rebuild |
| Place it anyway | the manual path with `manualOrder.override === true` | as manual; `buildAdmittedReservation` yields source `'override'` when it does not fit | same lock |
| Edit (`action: 'edit'`) | **had no lock** → `editLock` added (line 902), released in `finally` (line 934) | line 926 | the only path that needed a change; `place_order_atomic` untouched |
| Cancel / reject / refund | — | **no write**; `readCookingReservations` filters `OCCUPYING_STATUSES` (`slot-bookings.ts` line 213) | as specified |

No path needed `place_order_atomic` changed, so I did not stop.

## 5. Each harness — failure mode, broken variant FIRST, then the real result

All figures are **FIXTURE** unless marked LIVE.

| Harness | Fails when… | Broken variant (must FAIL) | Real result |
|---|---|---|---|
| `batch-reservation-p3-worked-case.cjs` | the worked case does not hold end to end | V1 today's split for admission (`batchReservations = false` forced at the top of `fitOrderBackward`): 9 @17:30 **REFUSED** (Pizza 9/8) — FAILED as required | 8 @17:00 → 16:45–17:00:8; 1 @17:15 → 17:00–17:15:1; 9 @17:30 **FITS** amber, reserved 17:00–17:15:1 + 17:15–17:30:8, `reserved` == windows, why empty; redraw 2 / 8; dots 17:30 🔴 "8 Pizzas", 17:15 🟡 "2 Pizzas"; 0 breaches; 1 @17:30 REFUSED (its one window is full — never pushed earlier); 1 @17:45 fits; 9 @18:45 and 9 @19:30 REFUSED with why `existing 8 free 0 · existing 0 free 8`; 4 with 6 in the window → refused, one window, never split; 4 with 4 → one window ✅ |
| `batch-reservation-immutability.cjs` | a stored reservation or displayed window moves when a neighbour is placed/edited/cancelled | V1 projection re-seating reserved orders: 534 moved — FAILED as required | 14,400 steps (1,456 with a shared slot, 1,173 pre-switch placements): **0** moved ✅ |
| `batch-reservation-instants.cjs` | the grill exceeds the batch or the ceiling at any minute | V1 closed-left overlap ignoring an interval's first five minutes: 762 minute-violations over 1,488 admissions — FAILED as required | 5,819 admissions across 5 shapes, 1,227,809 minute-checks: **0** over ✅ |
| `batch-reservation-display-equals-picker.cjs` | the projection's windows for an admitted order differ from the admission's `why.windows`/record | V1 projection using today's split for reserved orders: 371 disagreements over 638 — FAILED as required | 6,288 admissions (fit and override): reserved == stored record and the board seats exactly the record's windows, **0** disagreements ✅ |
| `batch-reservation-lock.cjs` | a record written after the lock is released is invisible to the next admission | V1 written after release: c1 fits, c2 fits, peak 9 on an 8 batch — FAILED as required | c2 refused, peak 8 ≤ 8 ✅ |
| `batch-reservation-switch.cjs` | a trial truck wakes up ON, a demo truck OFF, or the switch is read from anything but the truck row | V1 resolver defaulting ON for plan `trial`: Gusto resolves ON — FAILED as required | Gusto's row shape → OFF; test-truck today → OFF; demo → ON; `true`/`'true'` → ON; false/null/no truck → OFF; the §7 update statement preserves `whatsapp_setup_preview`; not in `Feature`, not in `plan-features.ts`; five routes resolve from their truck read; `/api/slots` names existing columns ✅ |
| `batch-reservation-golden-on.cjs` + `scripts/fixtures/batch-reservation-golden-on.json` | any ON-mode reader output moves from the pinned baseline | V1 fits inverted: digest DIFFERS — FAILED as required | §31 8, Gusto-shaped 300, aligned 240, Gusto's six live events (from the rolling golden's inputs), and 300 Gusto-shaped boards **with** 3,085 reservations admitted in slot order: 0 differ ✅. Generator: `scripts/_batch-reservation-golden-on-generate.cjs`; the header records the engine file's sha256 |
| `customer-path-identity.cjs` (extended) | OFF: any customer-offered set changes; ON: any time offered today is lost | V1 one slot forced into the unfittable set — FAILED as required | OFF: 60 baskets, 1,185 unfittable slots, 0 differ; **ON supersets**: 2,400 baskets over the Gusto-shaped sweep (batch 2, prep 5, kc 2, sizes 1–8): 14,665 offered today, **1,684 newly offered ON, 0 lost** ✅ |
| `add-order-render.cjs` (extended) | the panel throws, or labels a time wrongly | V1 the shipped ordering — FAILED as required | all fixtures render; new: the worked-case board OFF labels 17:30 "Order won't fit", **ON does not** ("17:30 🟢") ✅ — this case is what exposed the dropped offline fields |
| `batch-rolling-identity.cjs` vs the golden | OFF drifts from the durable baseline | V1 (its own) — FAILED as required | 8 + 300 + 240 + 6 cases identical **without regenerating**: `scripts/fixtures/batch-rolling-golden.json` sha256 `8bdae817748ad334…`, unchanged from the durable-harness report (the file is untracked like everything in this session, so "committed" here means "untouched since it was generated") ✅ |
| `batch-reservation-p2-identity.cjs` | P2 records become visible OFF | V1 — FAILED as required | 5,000 sequences, 50,000 steps, 0 differ ✅ |
| `slot-interval-engine-identity.cjs` | the engine differs from HEAD with the added params stripped | (its own) | byte-identical on all 10 cases ✅ |
| `batch-reservation-writers.cjs` | a writer can fail an order, or the column appears in a query it should not | V1 rethrowing writer — FAILED as required | column in exactly three queries (probed read, P2 recompute, P3 record) ✅ |
| `batch-reservation-helper.cjs` | `reserveBatches` splits or over-reserves | V1 4-of-8 over two windows, V2 9 over three — both FAILED as required | ✅ |

## 6. Verification

Every harness family, each with its true return code (the reservation/rolling/customer/render/printing/
slot-interval/whatsapp families were run by explicit name; the earlier glob run is the incident in §0):

```
rc=0  add-order-fit-message.cjs            ✅
rc=0  add-order-render.cjs                 ✅
rc=0  batch-reservation-display-equals-picker.cjs ✅
rc=0  batch-reservation-golden-on.cjs      ✅
rc=0  batch-reservation-helper.cjs         ✅
rc=0  batch-reservation-immutability.cjs   ✅
rc=0  batch-reservation-instants.cjs       ✅
rc=0  batch-reservation-lock.cjs           ✅
rc=0  batch-reservation-p2-identity.cjs    ✅
rc=0  batch-reservation-p3-worked-case.cjs ✅   (rc=1 in the first pass: two fixture mistakes in the harness, fixed — see below)
rc=0  batch-reservation-switch.cjs         ✅
rc=0  batch-reservation-writers.cjs        ✅
rc=0  batch-rolling-check.cjs              ✅
rc=0  batch-rolling-identity.cjs           ✅
rc=0  customer-path-identity.cjs           ✅
rc=0  printing-copy / dedupe / escpos-identity / failure-split / gating / network-guard / transport-contract  ✅ ×7
rc=0  slot-interval-dots / engine-identity / event-override / generator / grid-routing / settings / van-list-tolerance / van-resolution  ✅ ×8
rc=0  whatsapp-background-jobs / connection-view / golive-parity / settings-row / setup-machine harnesses  ✅ ×5
```
The worked-case harness's first-pass failure was in the harness, not the engine: its probe expected 1 pizza
@17:30 to be pushed into the earlier window (against the rule — one item gets exactly one window) and its
never-split fixtures stored the 6 at 18:00 instead of at 18:15. Both corrected to the rule; the engine's answers
did not change.

- `npx tsc --noEmit` — clean.
- `npx next build` — "Compiled successfully", exit 0.
- eslint delta vs a clean HEAD worktree (JSON formatter; the repo's config): on the 16 files this work touched,
  **errors 172 → 172, warnings 77 → 69** (no new finding; a few `react-hooks` warnings dropped as memo deps were
  completed). The whole-tree delta is noise — untracked Android build output and the `scripts/*.cjs` harnesses do
  not exist in a clean worktree.

## 7. SQL — read-only checks (every column table-qualified), and the one statement for you

Which trucks resolve ON, and that Gusto is OFF (run as-is; LIVE result on 17 Sep 2026 in §2):

```sql
select trucks.id, trucks.plan, trucks.feature_overrides,
       (trucks.plan = 'demo' or trucks.feature_overrides->>'batch_reservations' = 'true') as batch_reservations_on
from public.trucks
order by trucks.id;

select trucks.id, trucks.plan, trucks.feature_overrides
from public.trucks
where trucks.id = 'pizzeria-gusto';
-- expected: plan 'trial', feature_overrides '{}'  →  OFF
```

P0 still applied and untouched by this work:

```sql
select count(*) filter (where orders.cooking_reservation is not null) as with_record, count(*) as total
from public.orders;
```

**To switch test-truck ON (your statement; localhost testing only):**

```sql
update public.trucks
set feature_overrides = coalesce(trucks.feature_overrides, '{}'::jsonb) || '{"batch_reservations": true}'::jsonb
where trucks.id = 'test-truck';
```
`||` on jsonb merges keys, so `whatsapp_setup_preview: true` is preserved — simulated in
`batch-reservation-switch.cjs` (result `{"whatsapp_setup_preview":true,"batch_reservations":true}`). To switch it
back OFF: `set feature_overrides = trucks.feature_overrides - 'batch_reservations'`.

## 8. Localhost test script — test-truck (Pizza Kitchen) only

Switch test-truck ON with the §7 statement first. Event on a 15-minute grid, pizza batch 8, prep 15.

1. **Worked case.** Add Order: 8 pizzas @17:00 → placed. 1 pizza @17:15 → placed. Now 9 pizzas: the time list
   shows **17:30 with no "Order won't fit"** and no popup on submit; the board's 17:15 dot goes red "8 Pizzas",
   17:00 amber "2 Pizzas". (Today's tree refuses this — the render harness pins both.)
2. **Never split.** Fresh times: 4 pizzas @18:15, then another 4 @18:15 → both placed, dot 18:15 red 8. Then 1
   more @18:15 → refused; the popup names one window, `existing 8 free 0`.
3. **Refusal.** 8 @18:15, 8 @18:30, 8 @19:00, 8 @19:15. 9 pizzas @18:45 → **refused**, popup shows two windows:
   18:15–18:30 existing 8 free 0, 18:30–18:45 existing 0 free 8.
4. **Place it anyway.** On that refusal press Place it anyway → the order is placed; the 18:30 dot shows the true
   over-count in red (16/8) and the breach banner carries the new line `Placed anyway: #<n> for 18:45`.
5. **Edit.** Edit that order to 19:30 → it is re-checked from scratch at 19:30 (its old windows free up: 18:30's
   dot returns to 8); if it fits the banner line disappears, else the existing warning + Place it anyway.
6. **Cancel.** Cancel it → its windows are freed on the next dashboard fetch; no reservation is rewritten.
7. **Customer page** for test-truck: with 8 @17:00 and 1 @17:15 stored, 17:30 is offered for a 9-pizza basket
   (today it is not). ASAP for 9 lands on 17:30.
8. **Switch test-truck OFF** (§7 second statement): repeat 1 → 17:30 is labelled "Order won't fit" and the popup
   appears; all dots and breaches are today's.
9. **Gusto, look only, by you:** run the second §7 select. `{}` and `trial` → OFF. Do not open Gusto's dashboard.

## 9. Pre-deploy checklist

- [ ] Everything is uncommitted: review `git status` (35 M, 71 ??), including the P0–P2 and earlier reports.
- [ ] Gusto resolves OFF (§7 select) — nothing changes for a live trading truck.
- [ ] Demo trucks resolve ON by plan: after Create Demo, the new truck is ON with no further step.
- [ ] Migrations: P0 (`orders.cooking_reservation`) already applied; this task adds **none**.
- [ ] All harness families green (§6) on the tree you deploy; regenerate the ON golden only from a build the P3
      harnesses have passed.
- [ ] Decide on the `discovery_trucks` upsert in §0 before anything else.

## 10. Manual sections made stale (NOT edited)

`docs/reference-manual.md` was not touched. Stale once the switch is ON for a truck: **§31** (batch behaviour —
the rolling split is now only the unreserved remainder; ≤B never splits; refusal shows the windows), **§4**
(capacity dots/breaches — a breach can name a placed-anyway order; the dot's over-count is the true count), the
Add Order fit popup text (windows per reservation), the offline-cache description (it now carries reservations
and the switch), and the edit flow (an event lock is now taken). OFF, nothing in the manual is stale.

## 11. What I could not establish

- Whether the 151 `discovery_trucks` rows the stray migration upserted (§0) differed from the sheet before it ran.
- The verbatim STEP 0 `git status` text (lost to compaction; the delta is fully listed in §1/§3).
- Any behaviour on a real device offline beyond the harnessed folds: the offline cache now carries the fields,
  but I did not exercise the iPad outbox end to end.
- Realtime/updated_at effects of the extra reservation UPDATE are as P2 found (one extra `fetchAll`); not
  re-measured here.
