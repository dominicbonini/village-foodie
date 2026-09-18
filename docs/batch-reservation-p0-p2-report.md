# Batch reservations — phases P0–P2 (store reservations; no behaviour change)

18 September 2026. Localhost only; nothing deployed. **The migration is written, not applied.** No live
truck was called; the only live read was the schema (GET-only, in the investigation). No behaviour changed:
every verdict, dot, offered time, ASAP result and placement is proven byte-identical with and without the
new data (§7).

## 0. The prompt, and the gate

No span arrived garbled and no instruction contradicted another. **STEP 0's gate was not met**: all seven
named files were uncommitted (HEAD `fc0fddc outreach`). I stopped and asked; Dominic chose **"proceed against
a frozen copy"**, as for the rolling fix on 17 September. A frozen copy of `lib/`, `app/`, `components/`,
`scripts/` and `supabase/` was taken **before any edit** (417 files, scratchpad `frozen-p0`), with the gate
files' hashes recorded (`lib/slot-availability.ts` `051f105dd4edb7d1…`, `AddOrderPanel.tsx`
`1765d39189816721…`, `lib/slot-bookings.ts` `218ee78d75f79d3f…`, …). The provenance caveat stands: the
"before" for this work is that copy, not a commit; the *durable* identity proof is the committed golden,
which still passes untouched (§7).

## 1. `git status`

**Before** — 87 entries: 32 modified, 55 untracked, all the uncommitted work of 16–18 September.
**After** — 94 entries. This prompt's changes, measured as changed lines against the frozen copy:

| File | Lines | What |
|---|---|---|
| `lib/slot-availability.ts` | 129 | types, `cachedReservationWindows`, `reserveBatches`, the `reservations` input threaded through `projectBackwardOccupancy`, `earliestBackwardFitSlot`, `buildSlotAvailability` |
| `lib/slot-bookings.ts` | 67 | `OCCUPYING_STATUSES`, `StoredCookingReservation`, `readCookingReservations` (probed) |
| `lib/orders/cooking-reservation.ts` | **new** | `buildReservationForOrder`, `writeCookingReservation` |
| `lib/slot-display.ts`, `lib/capacity-breach.ts` | 6, 7 | `buildSlotIndicators` / `detectCapacityBreaches` take `reservations` |
| `lib/orders/place-in-slot.ts` | 6 | reads reservations under the lock, forwards to the walk |
| `app/api/slots/[truckId]/route.ts`, `app/api/dashboard/route.ts` | 7, 12 | read + pass + `capacityInputs.reservations` (incl. the offline cache) |
| `app/api/orders/submit/route.ts`, `lib/payments/promote-draft.ts`, `app/api/dashboard/action/route.ts` | 3, 3, 5 | the four write sites |
| `components/dashboard/AddOrderPanel.tsx`, `app/trucks/[slug]/order/page.tsx` | 10, 6 | pass `capacityInputs.reservations` through (a trailing argument only) |
| `supabase/migrations/20260920_orders_cooking_reservation.sql` | **new** | P0 |
| `scripts/batch-reservation-{helper,p2-identity,writers}.cjs` | **new** | the three harnesses |
| `scripts/slot-interval-engine-identity.cjs` | 14 | re-scoped for the one added parameter |

Nothing staged, committed, stashed, reset or restored. `scripts/fixtures/batch-rolling-golden.json` untouched
(sha256 `8bdae817748ad334…`).

## 2. R1 — `place_order_atomic`

Latest definition, `supabase/migrations/20260804_place_order_atomic_placed_at.sql` (unchanged by this work):

```sql
create or replace function place_order_atomic(
  p_order jsonb, p_final_slot text, p_status text, p_event_id uuid, p_truck_id text, p_event_date date, p_unit_rows jsonb
) returns jsonb language plpgsql as $$
declare v_order_number integer; v_order_key uuid; v_row jsonb;
begin
  if p_event_id is not null then v_order_number := increment_event_order_counter(p_event_id); end if;
  if v_order_number is null then v_order_number := increment_order_counter(p_truck_id); end if;
  …
  insert into orders (id, truck_id, customer_name, customer_email, customer_phone, slot, order_type, event_date,
    event_id, van_id, items, deals, discount_code, subtotal, discount_amt, total, total_minor, notes, status,
    payment_status, placed_at) values (…) returning order_key into v_order_key;
  if p_event_id is not null and p_unit_rows is not null then
    delete from production_slot_usage where truck_id = p_truck_id and event_id = p_event_id;
    for v_row in select * from jsonb_array_elements(p_unit_rows) loop insert into production_slot_usage (…) values (…); end loop;
  end if;
  return jsonb_build_object('order_key', v_order_key, 'order_number', v_order_number, 'slot', p_final_slot);
end; $$;
```

It inserts an **explicit column list**, so `cooking_reservation` cannot ride in through `p_order`; and it
is called from **one place only**: `app/api/orders/submit/route.ts:1045`. `promoteDraft` does not use it (it
inserts the row itself and calls `rebuildProductionSlotUsage`); the operator `manual` path upserts the row
directly and rebuilds; the outbox replays to the `manual` action. **P2 needed no change to the function**:
the reservation is a separate UPDATE after each of those paths has committed the row.

## 3. R2 — every consumer of an `orders` UPDATE

`orders_set_updated_at` (`20260703_orders_updated_at_trigger.sql`) fires `before update … for each row`
and sets `updated_at := now()` — so a reservation write **is** a row-version bump. What each consumer does:

| Consumer | On the extra UPDATE |
|---|---|
| Dashboard Realtime `orders:<truck>` (`event:'*'`) | `fetchAllRef.current()` — **one extra `/api/dashboard` refetch**. The dashboard's sound (`page.tsx:1638`) fires on a **new `order_key`** or a rising pending count, never on an update |
| KDS Realtime `kds-orders:<truck>` | `fetchAllRef.current()` — one extra KDS refetch. `playNewOrder()` is gated on **`payload.eventType === 'INSERT'`** |
| `mergeOrders` version guard | the server row is newer by a few ms and carries identical visible fields; the merge keeps it. The write happens inside the placing request, before the operator can act on the row, so no in-flight optimistic status is overridden |
| Print watcher (`selectDueToPrint`, dedupe) | keys on `order_key`, `status`, `slot` — untouched; no reprint |
| Buzzers (`lib/buzzer.ts` optimistic state) | untouched content; the pre-existing "stale poll on the equal branch" window gains one more `fetchAll` per placement/edit — same mechanism, marginally more often |
| Orders list / "recently changed" | nothing keys a highlight on `updated_at` (grep: none) |
| Reports, KDS polling | no capacity or `updated_at` read |

**Verdict: no flash, no sound, no reprint, no reorder, no visible change — one extra refetch per
placement/edit per connected screen.** Not a stop.

## 4. R3 — the statuses that count

```ts
.in('status', ['pending', 'confirmed', 'modified', 'cooking'])          // buildUnitsFromOrders, lib/slot-bookings.ts:226 and :474
const OCCUPYING_STATUSES = new Set(['pending', 'confirmed', 'modified', 'cooking'])   // lib/capacity-breach.ts:30
```
`lib/buzzer.ts:27` notes the list "appears VERBATIM in five places — DO NOT GRAFT". The reservation read
now exports `OCCUPYING_STATUSES = ['pending', 'confirmed', 'modified', 'cooking'] as const` and filters on
exactly it; a cancelled/rejected order leaves the set and its reservation is dropped **without any write**.

## 5. R4 — a slot total made of more than one order

Storage holds per-slot totals; `projectBackwardOccupancy` splits the **total**, not the orders. Through the
real engine (batch 8, prep 15):

| Slot 17:30 holds | Today (split of the total) | Per-order splits, summed | Same? |
|---|---|---|---|
| 5 + 5 (one by override) | `[17:00,17:15) 8` red 8/8, `[17:15,17:30) 2` amber | 5 + 5 = **10** in `[17:15,17:30)`, nothing earlier | **no** |
| 8 + 1 | 8 + 1 across two windows | 8 + 1 = **9** in the nearest | **no** |
| 3 + 4 | 7 in the nearest | 3 + 4 = 7 in the nearest | yes |
| 8 + 8 | 8 + 8 | **16** in the nearest | **no** |

Neither seating each order verbatim nor mixing one reservation with a fallback remainder (5 reserved + 5
fallback → 10 nearest) reproduces the total's split. **Reachable ways two orders share a slot today:** an
operator "Place it anyway" (override) onto a full slot; an operator choosing any slot for a walk-up (no
fit gate on the manual path); an **off-list** slot (`placeOrderInSlotLocked`'s `!startEntry` branch confirms
unchecked); a replay race (two devices' outbox ops landing on the same slot); an **edit** moving an order
onto an occupied slot; **demo seeding** (`seedDemoOrders` writes clustered slots on purpose); and a
**reseed** that rebuilds totals from orders after any of the above. So shared slots are ordinary, not rare.

## 6. What changed, by symbol

### P0 — the migration (written, NOT applied)
`supabase/migrations/20260920_orders_cooking_reservation.sql`:
```sql
alter table public.orders add column if not exists cooking_reservation jsonb;
notify pgrst, 'reload schema';
```
No default, nullable, no applied/not-applied status in the header. Verification (read-only, after applying):
```sql
select columns.column_name, columns.data_type, columns.is_nullable, columns.column_default
from information_schema.columns as columns
where columns.table_schema = 'public' and columns.table_name = 'orders' and columns.column_name = 'cooking_reservation';
-- expect: cooking_reservation | jsonb | YES | null
select count(*) as non_null_reservations from public.orders where orders.cooking_reservation is not null;
-- expect: 0
```
**Old builds are unaffected by the column's existence**, confirmed from the code: 57 reads of `orders`; every
one is `select('*')` or a named select that does not name `cooking_reservation` (the named ones name
`order_key`, `slot`, `status`, `items`, `deals`, `event_date`, `event_id`, `customer_*`, `total`, …). The
**only** query naming the column is the probed read below, in a query of its own.

### P1 — the engine input
- **`EngineReservation`**, **`CookingReservationWindow`** (exported types).
- **`cachedReservationWindows(reservations, slot, cat, totalItems, batch, prepMins)`** — the P1/P2 identity
  rule, pure: returns the windows to seat only when **exactly one** counting order at that slot carries a
  reservation for the category, its `items` equal the slot's stored total, it was computed with the current
  `batch`/`prepMins`, and its windows sum to the total; otherwise `null` ⇒ today's split.
- **`projectBackwardOccupancy(…, reservations = [])`** — per (slot, cat), seats the cached windows
  earliest-first (the loop's own order) or falls through to today's loop. Absent/empty ⇒ byte-identical.
- **`earliestBackwardFitSlot(…, reservations = [])`**, **`buildSlotAvailability({ reservations? })`**,
  **`buildSlotIndicators(…, reservations = [])`**, **`detectCapacityBreaches({ reservations? })`** — forward it.
- **`reserveBatches({ intervals, cat, slotMins, items, batch, prepMins, kitchenCapacity, floorMins, nowMins? })`**
  — Dominic's rule as a pure helper: exactly `ceil(items/batch)` back-to-back windows ending at T, never
  split when ≤ batch, fits iff Σ free ≥ items, nearest-first, pre-open floor and now-clamp on the earliest
  window; free = `min(batch − categoryLoadOver, kc − total load)`. **Not called by `fitOrderBackward`.**
- **`readCookingReservations(supabase, truckId, eventId, excludeOrderKey?)`** (`lib/slot-bookings.ts`) — the
  probed read: `orders.select('order_key, slot, cooking_reservation')` filtered by truck, event, the R3
  status set, `not null`, and `excludeOrderKey`; PGRST204 and 42703 logged distinguishably (once per
  process) → `[]`; a reservation whose stored `slot` no longer matches the row's `slot` is skipped.
- **Where it is read**, and the cost — one indexed query on `orders (truck_id, event_id, status)` per
  capacity read: `/api/slots` (once per call), `/api/dashboard` (once, and surfaced as
  `capacityInputs.reservations` for the offline iPad), `placeOrderInSlotLocked` (once, under the existing
  per-event lock, beside the fresh units read — customer submit and `promoteDraft` both come through it).
  Measured locally as a few milliseconds; it is the only added query on the read side.

### P2 — the writer, under today's rule
- **`buildReservationForOrder({ slot, qtyByCat, catConfigs, eventStartMins, kitchenCapacity, capacityWindowMins, gridIntervalMins, source })`**
  — pure: runs `projectBackwardOccupancy` on **that order alone** and records its cooking windows.
- **`writeCookingReservation(supabase, { truckId, eventId, orderKey, gridIntervalMins? })`** — loads the
  order's own row, the item→category map, the category configs and the event/van meta **through the client
  it is handed**, builds, and writes with a separate `update({ cooking_reservation }).eq('order_key').eq('truck_id')`.
  `source` is `'override'` iff the row's `capacity_ack_at` is set (so "Place it anyway" is recorded without
  any caller passing a flag). **Never throws; on any failure the column stays null and the order is
  untouched.** Instant categories (prep 0) reserve nothing.
- **The four write sites:** customer submit — after `place_order_atomic` succeeded; `promoteDraft` — after
  its insert succeeded; `manual` — after the rebuild, inside the lock (covers walk-ups, "Place it anyway"
  and outbox replays, which all land here); `edit` — after the rebook. Cancel, reject, refund: nothing.

**The stored JSON (v1):**
```json
{ "v": 1, "source": "fit", "slot": "17:30",
  "computed": { "eventStartMins": 1020, "capacityWindowMins": 5, "kitchenCapacity": null, "gridIntervalMins": null },
  "cats": { "pizza": { "items": 9, "batch": 8, "prepMins": 15,
             "windows": [ { "startMins": 1020, "endMins": 1035, "items": 8 }, { "startMins": 1035, "endMins": 1050, "items": 1 } ] } } }
```
(`gridIntervalMins` is null from the server paths, which do not hold the display grid; it is provenance,
not an input to the split.)

**Shared slots (R4), resolved:** every order gets a reservation written; the *engine* decides use. A slot
shared by two counting orders never satisfies "sole reservation", so the whole slot falls back to today's
split — identity by construction, and no reservation is ever deleted or rewritten because a neighbour
arrived. That is the strict-rule version of "write NO reservation for those orders": the data is kept for
P3, but is inert now.

## 7. Each harness — failure mode, broken variant first, then the real result

### `scripts/batch-reservation-helper.cjs` (new)
**Failure mode:** `reserveBatches` splitting a one-batch order, using the wrong number of windows, filling
an earlier window before the nearest, or refusing when the free space adds up.
**Broken variants:** V1 — a 4-item order spread over two windows → **✓ FAILED as required**; V2 — 9 items
over three windows → **✓ FAILED as required**.
**Real:** `✅` 20 checks. The worked case — **9 @17:30 → `17:15–17:30: 8`, `17:00–17:15: 1`**, windows
reporting existing 0/1 and free 8/7; **9 @18:45 and 9 @19:30 refused** (free 0 + 8 < 9). 1/3/7/8 items →
exactly one window; 9/16/17/25 → exactly ceil; nearest-first with 3 already nearest → 5 + 4; pre-open →
`preopen`; now-clamp → `now`; kitchen cap 6 with 5 cooking and a 4-item order → **refused, never split**
(the rule forbids 1 + 3); the cap applies to every window (9 under kc 6: 1 + 6 = 7 < 9 refused; under kc 8:
3 + 6). Sweep: **20,000 random calls — fits ⇔ Σ free ≥ items, every share ≤ free, shares sum to items, 0
mismatches.**

### `scripts/batch-reservation-p2-identity.cjs` (new)
**Failure mode:** any of the six readers answering differently with the P2 reservations than without.
**Broken variant:** the engine patched to seat **every** per-order reservation verbatim (no sole-at-slot,
no equals-the-total) on R4's 5 + 5 → **✓ FAILED as required** ("readers DIFFER (5 + 5 → 10 nearest ≠ 8 + 2)").
**Real:** `✅`. R4's five fixtures explicitly (5+5, 8+1, 3+4, 8+8, an off-list 17:37 shared 6+6) identical;
**5,000 random sequences × 10 steps = 50,000 comparisons** across four shapes (Gusto 5/2/kc 2 on a 5-grid;
Dominic 15/8 on a 15-grid; prep 15 on a 5-grid; two categories + kc 6 on a 10-grid) with place, override,
off-list, edit and cancel — **2,380 steps had a shared slot — 0 differ.** The writer simulated is the real
`buildReservationForOrder`; the comparison covers `windows`, `byStart`, `pileByStart`, `cantFit`,
`intervals`, twelve `fitOrderBackward` results **including `why`**, `earliestBackwardFitSlot`,
`buildSlotAvailability`, `buildSlotIndicators` and `detectCapacityBreaches`. 18.8 s.

### `scripts/batch-reservation-writers.cjs` (new)
**Failure mode:** a placement path that forgets to write; a writer that throws and fails the order; the
column leaking into a shared select; a status filter that drifts from R3.
**Broken variant:** the writer patched to rethrow → **✓ FAILED as required** (the placement "would FAIL
with it").
**Real:** `✅` 20 checks. With a fake client whose update returns 42703, and one whose update throws: the
writer resolves `null`, throws nothing, touches the order row only via the one update; **42703 is logged as
"absent (migration not applied)" and not as PGRST204**; no `event_id` ⇒ no query. All four write sites
asserted in source; `source` from `capacity_ack_at`; the v1 shape; cancel/reject/refund write nothing; the
column appears in **exactly two queries** (the probed read and the writer's update); the read filters on
`OCCUPYING_STATUSES`, which equals the two `buildUnitsFromOrders` literals and `capacity-breach`'s set; the
writer imports neither the module client nor `place-in-slot`.

### `scripts/batch-rolling-identity.cjs` (existing) — golden **not** regenerated
`✅` against the committed golden with `reservations` empty: all 20,554 fixtures, both broken variants
failing first. This is the durable "switchover changes no screen" proof.

### `scripts/slot-interval-engine-identity.cjs` (re-scoped)
`earliestBackwardFitSlot` gained one optional trailing parameter; it moves from the byte-identical set to
"byte-identical **up to that parameter**" (its body with the two added fragments removed must equal HEAD's),
and its output is still compared on the ten cases. `✅`; the six remaining symbols stay byte-identical.

### `customer-path-identity.cjs`, `add-order-render.cjs` (existing)
Both `✅` — the customer's unfittable set is unchanged over the sweep, and the panel renders all seven cases.

## 8. Verification

| Step | Result |
|---|---|
| `npx tsc --noEmit` | rc 0 |
| `npx next build` | rc 0 — `✓ Compiled successfully` |
| **All harnesses** (35 files: `batch-reservation-*`, `batch-rolling-*`, `add-order-*`, `customer-path-identity`, `slot-interval-*`, `printing-*`, `outreach-*`, `whatsapp-*`) | **every one rc=0** |
| eslint on the 13 changed files vs a clean HEAD worktree | `no-img-element` 1→1 · `no-explicit-any` 74→74 · `no-unused-vars` 31→**29** · `prefer-const` 1→1 · `exhaustive-deps` 17→**11** · `preserve-manual-memoization` 1→1 · `set-state-in-effect` 9→9 · `no-unescaped-entities` 2→2 — two rules improved, none regressed |

## 9. Localhost test script — test-truck (Pizza Kitchen) only, AFTER P0 is applied

🔴 **Not run**: P0 is not applied, and I do not apply migrations. Never Pizzeria Gusto.

1. Apply P0 in the Supabase SQL editor; run the two verification queries (§6) — expect `jsonb | YES | null`
   and `0`.
2. `npm run dev`. Open `/dashboard/<test-truck token>`, today's event on Van1 (Pizza prep 15 / batch 8,
   collection interval 15). Note what the time list and dots look like.
3. **Place** a walk-up: 9 Pizzas at 17:30. Then read back (read-only):
   ```sql
   select orders.id, orders.slot, orders.status, orders.capacity_ack_at, orders.cooking_reservation
   from public.orders where orders.truck_id = 'test-truck' order by orders.created_at desc limit 5;
   ```
   Expect `cooking_reservation` = v1 with `source 'fit'`, `slot '17:30'`, pizza windows `[1020,1035) 8` and
   `[1035,1050) 1`.
4. **Override**: place another 9 at 17:30 and press **Place it anyway**. Read back: its reservation has
   `source 'override'`; the dashboard dots for 17:00–17:30 read exactly as they would have before (the slot
   is now shared, so the engine falls back to the total — §5).
5. **Edit** the first order to 4 Pizzas at 18:00. Read back: its reservation now says `slot '18:00'`, one
   window `[1065,1080) 4`.
6. **Cancel** the second order. Read back: its row still holds its reservation (nothing is written on
   cancel), but `status` has left the counting set, so `/api/slots` no longer reads it.
7. **Customer times**: open `/trucks/test-kitchen/order`, add 9 pizzas — the offered/greyed times must be
   exactly what they were in step 2's state with the same orders. `/api/slots?…` now carries
   `capacityInputs.reservations`.
8. Compare the dashboard and customer screens with step 2: **identical**.

## 10. Apply order and pre-deploy checklist

**Apply order:** (1) P0 migration — additive, safe at any time, harmless if early; (2) `notify pgrst`;
(3) deploy this web build. Order between (1) and (3) does not matter: the read probes and degrades, the
writer probes and leaves null. **Old app builds keep working**: the native shell loads the live site, so
they run this web code, which never names the column in a shared select; an old *server* build simply
never reads or writes it.

**Pre-deploy checklist:**
- [ ] P0 applied and verified (`jsonb | YES | null`, count 0).
- [ ] Logs after the first placement show no `[reservations] … PGRST204` (if they do: run `notify pgrst,
      'reload schema'` again).
- [ ] Read-only: Gusto's orders show `cooking_reservation` **null** until Gusto's first new order after deploy —
  ```sql
  select count(*) as gusto_reserved from public.orders
  where orders.truck_id = 'pizzeria-gusto' and orders.cooking_reservation is not null;
  -- expect 0 before Gusto's first placement after deploy; then only rows created/edited after it
  ```
- [ ] `scripts/batch-rolling-identity.cjs` green against the committed golden (no regeneration).
- [ ] Rollback: revert the web deploy — the column stays, nothing reads it; or leave the deploy and set
      `readCookingReservations` to return `[]` (one line), which is switchover in reverse.

## 11. What P3 will need

- Switch `fitOrderBackward`'s per-category batch decision to `reserveBatches` (behind a truck-level flag),
  with `why` built from its `windows`; `earliestBackwardFitSlot` and every reader follow automatically.
- Change `cachedReservationWindows`'s rule from "sole and equals the total" to "every reservation
  verbatim, fallback for the unreserved remainder" — the engine mode the P2 identity harness's broken
  variant exercises today.
- The writer stops computing "today's split" and stores the **admitted** windows from `reserveBatches`
  (the nearest-first arrangement); "Place it anyway" (P4) stores the nearest window over the batch with
  `source 'override'`.
- A new golden generated from the P3 baseline and committed; the P2 identity harness is retired or
  inverted (it will legitimately differ); `batch-reservation-immutability` and `-instants` harnesses added
  per the investigation's C4.
- The offline cache already carries `reservations`; the device-side admission then uses the same helper.

## 12. Manual sections made stale (NOT edited)

- **§31 "Backward cooking-spread"** — should now say the split is stored per order in
  `orders.cooking_reservation` (P2, today's rule) and describe the sole-at-slot identity rule.
- **§31 "STORAGE: production_slot_usage is COLLECTION-SLOT keyed"** — still the totals cache; note the
  per-order reservation beside it and that the engine never uses both for one (slot, category).
- **§31 "TRAFFIC-LIGHT DOTS: read the engine's occupancy"** — the occupancy now takes `reservations`.
- **§5 "Per-event booking lock"** — the reservation read happens inside it; the write after.
- **§4036 "select('*') DEGRADES; A NAMED SELECT THROWS"** — add `cooking_reservation` to the enumerated
  named-select audit (one probed query, one writer update).

## 13. Anything I could not establish

- **The localhost run** (§9) — gated on P0 being applied.
- **The added read's cost on production data** — measured on localhost fixtures only; `orders` is filtered
  by `truck_id`, `event_id`, `status`, and whether an index covers that pair is not visible through
  PostgREST.
- **The "before" provenance** — a frozen working-tree copy, not a commit (Dominic's decision). The durable
  proof is the committed golden, which passes untouched.
- **`promoteDraft` with a null event** — the writer returns null without writing; such orders (no event)
  are not counted by capacity today either.
- **Whether an old *server* build ever sees a reservation** — it cannot read the column, so any row written
  by a new build is simply ignored by it; not exercised against a real old deployment.
