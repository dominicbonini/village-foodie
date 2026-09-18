# Batch reservations — full investigation

18 September 2026. **Investigation only.** No code changed, no migration run, no database write, no live
truck touched. Gusto facts come from `scripts/fixtures/batch-rolling-golden.json`; the one live read was
the schema (A1), GET-only.

## 0. The prompt

No span arrived garbled. One tension, read the same way as the last two investigations: "write NOTHING"
means the live system; this report is the deliverable and the only thing written.

## 1. `git status`

HEAD `fc0fddc outreach`; 87 entries — 32 modified, 55 untracked (collection-times, rolling fix, durable
harness, wired printing, the Add Order popup/label/render fix, the split review). Unchanged by this
investigation.

## 2. Dominic's rule, restated as the engine must hear it

For an order with `items` of a cooking category at collection time T, with batch B and prep P:
1. `nw = ceil(items / B)` windows, side by side, the last ending at T: `[T−P, T)`, `[T−2P, T−P)`, …
2. In each window, **free = min(B − rolling load, kc − rolling total)**, rolling load measured exactly as
   today (`categoryLoadOver`, half-open overlap).
3. **FITS iff Σ free over those windows ≥ items** — and the pre-open floor and now-clamp still hold.
4. If it fits, **reserve**: nearest window first, `min(remaining, free)`, then the next earlier. The
   reservation is stored and **never moves**. Later orders see it only as load.

**"The default choice is always possible whenever rule 3 passes" — proven, two ways.** Algebraically:
greedy takes `min(rem, free_i)` per window, so it exhausts `rem` iff Σ free_i ≥ items, which is rule 3.
Empirically: 1,600 random admitted sequences over four configurations (prep 15 / batch 8 on a 5-minute
grid, with and without a kitchen ceiling; Gusto's prep 5 / batch 2 / kc 2; prep 10 / batch 4) — **19,995
admissions, greedy never failed once rule 3 passed**.

**The worked case, through the model:** 9 @17:30 with 8 @17:00 (`[16:45,17:00)`) and 1 @17:15
(`[17:00,17:15)`) → free `[17:00,17:15)` = 7, `[17:15,17:30)` = 8, Σ = 15 ≥ 9 → **FITS, reserving
8 in 17:15–17:30 and 1 in 17:00–17:15** — exactly as specified. 9 @18:45 with `[18:15,18:30)` full → free
0 + 8 = 8 < 9 → **REFUSED**; 9 @19:30 likewise.

---

# A. TODAY'S STORAGE AND EVERY READER

## A1. Schema (read-only)

Intended query — `information_schema` is not reachable through PostgREST (PGRST202), so the PostgREST
OpenAPI document, which *is* the live schema cache, was read GET-only instead:
```sql
select columns.table_name, columns.column_name, columns.data_type, columns.is_nullable, columns.column_default
from information_schema.columns as columns
where columns.table_schema = 'public'
  and columns.table_name in ('orders', 'production_slot_usage', 'collection_times', 'slot_bookings')
order by columns.table_name, columns.ordinal_position;
```
| Table | Columns (required unless `?`) |
|---|---|
| `orders` (42) | `id text`, `truck_id?`, `customer_name`, `customer_phone?`, `customer_email?`, **`slot? text`**, `order_type?`, `table_ref?`, `event_date date`, **`items jsonb`**, `extras?`, `bundle?`, `discount_code?`, `subtotal`, `discount_amt?`, `total`, `notes?`, **`status?`**, **`modify_type? text`**, **`modify_data? jsonb`**, `payment_status?`, `amount_paid?`, `created_at?`, `updated_at?`, **`deals? jsonb`**, `source?`, `paid_at?`, `collected_at?`, **`event_id? uuid`**, `cancellation_reason?`, `van_id?`, **`order_key uuid`**, `rejection_reason?`, `status_before_collected?`, `total_minor?`, `deal_savings?`, **`capacity_ack_at?`**, `buzzer_number?`, `placed_at?`, `buzzer_lost_at?`, **`requested_slot?`**, **`asap_estimate?`** |
| `production_slot_usage` (6) | `truck_id`, `event_date`, **`production_slot text`** (a collection time, "17:30"), **`units_by_cat jsonb`** ({"pizza": 9}), `updated_at`, `event_id?`. Upsert key `truck_id,event_id,production_slot`. |
| `collection_times` (6) | `id`, `truck_id?`, `event_date`, `production_slot`, `collection_time`, `event_id?` — §31: must be empty or identity |
| `slot_bookings` (5) | `truck_id`, `event_date`, `collection_time`, `order_count`, `updated_at` — a legacy count, not read by the engine |

**There is no per-order cooking record anywhere.** `production_slot_usage` is a per-slot **total** per
category; which order contributed what, and in which window it cooks, exists only at read time.

## A2. Every writer of capacity state

Two functions write `production_slot_usage`; everything else calls one of them.

| Writer | What it writes | When |
|---|---|---|
| `addOrderToProductionSlot` → `upsertProductionSlotUnits` | merges one order's category totals into the row at its collection slot (`onConflict truck_id,event_id,production_slot`) | customer placement (`placeOrderInSlotLocked` → caller), operator **edit** rebook (`dashboard/action` line 910: unbook old lines from the old slot, book new lines at the new slot), `lib/slot-bookings.ts:493/525` (move/rebook helpers) |
| `rebuildProductionSlotUsage` → `buildUnitsFromOrders` | **deletes** the truck/date rows, then re-derives each event's totals from `orders` with status ∈ `pending, confirmed, modified, cooking`, each order's **full load at its own `slot`** | `dashboard/action`: **manual** (walk-up insert, 1669), **edit** (600/702), **ready / undo_ready / collected_card / undo_collected** (452/479); `events/action` confirm (288); `manage` `upsert_event` (926/967); `promoteDraft` (394); demo provisioning/restart; `admin/backfill-usage` |
| `placeOrderInSlotLocked` | writes nothing itself; walks `earliestBackwardFitSlot` under the caller's per-event lock and returns `{finalSlot, booked}`; the caller persists `order.slot` then calls `addOrderToProductionSlot` | customer submit (`/api/orders/submit` 944, then `place_order_atomic`), `promoteDraft` (261) |
| customer submit | the order row via `place_order_atomic`, then the slot as above; passes `excludeOrderKey` so the fresh read omits its own pending row | every self-service order |
| operator add (`manual`) | the order row (`capacity_ack_at` set server-side when the client sent `capacityAcknowledged`, line 1564) then **rebuild** | every walk-up |
| "Place it anyway" | the same `manual` action with `capacityAck=true`; **no different write** — the over-capacity order is inserted and the rebuild spreads it exactly like any other | the over-capacity modal's second button |
| edits (`edit`, `modify_type`/`modify_data`) | order row; then unbook + rebook via `addOrderToProductionSlot`, then rebuild | dashboard edit |
| cancellations, rejections, refunds | the order row's `status` (and payment fields); **no capacity writer is called** — the totals stay stale until some later action rebuilds, and `buildUnitsFromOrders` then drops the row by status | dashboard `cancel`/`reject`/`refund` |
| demo seeding, lazy reseeds | `provision-demo-event`/`demo-restart` delete then rebuild; `getProductionSlotUnits` → `readProductionSlotUnits(…, persistReseed=false)` is **read-only** on the submit path (never writes from a read) | demo; every capacity read |
| offline outbox replay | queued ops replay to `/api/dashboard/action` (`manual` and status ops) in device FIFO order with a `provisional_id`; the server then runs the **same** `manual` path, so the replay is a walk-up insert + rebuild — with `capacityAck` as the device sent it | reconnect |

🔴 **Finding relevant to B5:** cancel/reject/refund free nothing until the next rebuild. Today that is
harmless because the next rebuild re-derives everything from `orders`. Under reservations it becomes a
rule: *a reservation is live iff its order's status is occupying* — readers must filter by status, exactly
as `buildUnitsFromOrders` does, so a cancellation frees spaces with no extra write.

## A3. Every reader

| Reader | What it reads |
|---|---|
| `projectBackwardOccupancy` | per-slot totals → windows (`byStart`, `intervals`, `pileByStart`, `cantFit`, `batchByCat`) — **the one place totals become cooking** |
| `fitOrderBackward` | `back.intervals` (rolling batch), `back.intervals ⊕ order` (ceiling), `existingAtSlot` (lead) |
| `earliestBackwardFitSlot` | `fitOrderBackward` per sorted slot |
| `buildSlotAvailability` | `projectBackwardOccupancy` + per-row fit; the no-basket dot via `pileByStart ?? byStart` |
| `buildSlotIndicators` (`slot-display.ts`) | the same, for the operator dots |
| `coverDotWindows` | the dot's window set on grids coarser than prep |
| `detectCapacityBreaches` (`capacity-breach.ts`) | `remainingByCat` per window |
| `pileByStart` | pre-open windows summed, display only |
| `loadRunsOffFront` | the raw slot total + the order, against `eventStart − prep` and now |
| `excludeOrderKey` | `getProductionSlotUnits` / `readProductionSlotUnits`: the placing order omitted from the fresh read |
| `/api/slots/[truckId]` | `buildSlotAvailability` + `capacityInputs` for the customer page and the panel's fresh re-check |
| `/api/dashboard` | `buildSlotIndicators`, `detectCapacityBreaches`, and the **offline cache**: `capacityInputs` carries `productionSlotUnits` (raw totals), `kitchenCapacity`, `capacityWindowMins`, `eventStartMins`, `intervalMins`, `catConfigs`, so the iPad re-runs the engine offline |
| customer order page | `unfittableSlots` (per-slot `fitOrderBackward`), ASAP (`earliestBackwardFitSlot`) |
| `AddOrderPanel` | dots, `manualPlacement`, `manualFitWhy`, the popup's fresh fit, `buildFitMessage` from `why` |
| `DayLoadStrip`, `BuzzerGrid`, `CapacityBreachBanner` | dots / breaches / pile |
| KDS, reports | **none** — no capacity read anywhere under `app/kds`, `app/admin`, `app/api/reports`; `admin/backfill-usage` is the only admin touch and it rebuilds |

Every reader funnels through `projectBackwardOccupancy`'s output. That is the seam.

---

# B. DESIGN

## B1. Where to store reservations

| | **(i) nullable jsonb on `orders`** — `cooking_reservation jsonb?` e.g. `{"pizza":[{"ws":1035,"items":8},{"ws":1020,"items":1}],"v":1}` | **(ii) new table** `order_reservations (order_key, truck_id, event_id, cat, window_start, items, source, created_at)` | **(iii) re-key `production_slot_usage` by cooking window** |
|---|---|---|---|
| Rebuildable from `orders` alone? | **Yes** — the row *is* the order; absent ⇒ fallback split (B4); `rebuildProductionSlotUsage` untouched | Yes, if every write also rewrites it; a rebuild must *regenerate* rows for reservation-less orders (fallback) | **No** — a window total has no order identity, so a cancellation cannot free *its* spaces, and a rebuild would have to re-admit every order in some order (the split-review C hazard) |
| Concurrency under the lock | the reservation is decided and written in the same transaction as `slot`, under the per-event lock `placeOrderInSlotLocked`'s callers already hold; `place_order_atomic` gains one parameter | same lock; one more insert per order | same lock, but a merged total loses which order owns what |
| Cancellation frees spaces | **automatically** — readers filter by `orders.status` as `buildUnitsFromOrders` already does | needs a status join or a mirrored delete | needs a subtract-write, which is the drift class `production_slot_usage` already suffers |
| Size of change | one column, one probe, one field on the engine's input | table, migration, writers in six paths, a join in readers | rewrites every writer and every reader at once |
| Named-select / probe rule | `orders` is read with `select('*')` everywhere (manual §4036) — a new column **cannot break** a surface; the engine reads it via a capability-probed path and degrades to fallback | the table is new, so the probe is "does it exist"; degrade = ignore | a changed key breaks every reader until they are all deployed together |
| Offline / old clients | the outbox replays to the server, which decides the reservation; an old server build ignores the column | same | old builds read the wrong key shape |
| Anonymisation (§41) | `orders` rows are anonymised, not deleted — the column survives, which is correct | rows survive | n/a |

**Recommendation: (i).** It is the only option where "never moves" and "cancellation frees" fall out of the
existing row lifecycle instead of being new invariants to police, and where the probe rule is already
satisfied by how `orders` is read. `production_slot_usage` stays exactly as it is — a totals cache the
old readers and the offline cache keep using — until the last phase retires it.

## B2. The admission check, in the one function every reader uses

**The engine's input grows by one optional field and nothing else changes shape.**
`projectBackwardOccupancy(units, cfg, start, kc, cw, reservations?)`, where `reservations` is the list
of live orders' stored intervals (`{startMins, endMins, items, cat, orderKey, source}`). It seats
**unreserved** load (a slot total minus the reserved items at that slot) with today's split — the
fallback — and appends the reserved intervals verbatim. `byStart`, `intervals`, `pileByStart`, `cantFit`
and the tones are then computed from the combined set exactly as now. Every reader is unchanged.

`fitOrderBackward` gains the rule in one shared helper, `reserveBatches(intervals, cat, T, items, B, P,
kc, floor, now)` → `{ fits, windows: [{ws, existing, free, share}], reason }`, used by the fit **and** by
the projection when it converts an admitted order into stored intervals — so DISPLAY == PICKER is the
same function twice, not two agreeing implementations. `why` is that helper's `windows` verbatim.

**Rolling windows on grids finer than prep — what "side by side" means.** The order's windows are fixed
by its own T: `[T−P, T)`, `[T−2P, T−P)`, …, whatever the collection grid. On a 5-minute grid with P = 15,
an order at 18:20 owns `[18:05,18:20)` and an order at 18:25 owns `[18:10,18:25)`; they overlap by ten
minutes. **Free space in a window = B − Σ items of every reservation overlapping it (half-open)** —
today's `categoryLoadOver`. That count is ≥ the true concurrency at any instant inside the window
(it counts a partial overlap in full), so:

> **Invariant.** If, before an admission, the load at every instant ≤ B (and ≤ kc), then after admitting
> with rule 3 it still is. *Proof:* the new order adds load only inside its own windows; for each such
> window W, every instant t ∈ W has load(t) ≤ Σ overlapping reservations + share_W ≤ B by rule 3. Instants
> outside the order's windows are untouched. Induction from an empty grill gives the invariant for every
> reachable state. — Verified by the sweep: **0 instants over batch or kc across 1,600 sequences on the
> 5-minute grid with P = 15 and P = 10** (checked every minute).

The check is conservative on fine grids (a reservation that ends five minutes into W is charged for the
whole of W), which is precisely today's rolling behaviour, chosen on 17 September because *undercounting*
was the bug. It can refuse an arrangement a perfect packer would accept; it never admits an overload.

**Kitchen ceiling across categories.** Free is `min(B − catLoad, kc − totalLoad)` per window; the
sweep-line `windowScopedPeak` then re-checks the combined set as now, so a category's reservation never
lets the cross-category total exceed kc. **Instant items** (`countsToCapacity`, prep 0) stay as they are:
`placeInstantPoints` seats them on the capacity cadence against the fixed cooking set; they are not
batches and reserve no window. **Pre-open run-up:** a window may start at `eventStart − P` and no earlier —
the floor is applied to the earliest of the order's `nw` windows before free is counted; **`loadRunsOffFront`
is unchanged** (it judges `ceil((existing + items)/B)` windows against the floor, and `nw` is the same
number). **Now-clamp** unchanged.

## B3. The display

Everything reads the combined interval set, so **the dots, `coverDotWindows`, `detectCapacityBreaches`,
`pileByStart` and the pile need no change** — they see reserved and fallback intervals alike. The popup's
`why` comes from `reserveBatches`, so the "18:15–18:30 · Pizza · Full" lines describe the windows the
reservation would use. Two additions:

- **"Place it anyway" reserves over the batch, visibly.** The admitted-anyway order gets its greedy
  reservation with `source: 'override'`, taking free space where there is any and **exceeding B in its
  nearest window by the shortfall** — one window over, not a pile of smeared load. The dot for that window
  reads red with the true count (e.g. `10/8`), `detectCapacityBreaches` flags it, and the breach carries the
  order key, so the banner can name the order that was placed anyway (today it cannot name anything —
  §31's "never say which order supplied which unit" was a *storage* limitation, not a preference).
- **An override shows** as a ❗ on the dot (the existing `overTotal` mark) plus, in the breach banner,
  "placed anyway by the operator at HH:MM" from `capacity_ack_at`.

## B4. Orders with no reservation — and the switchover proof

At switchover **every** order lacks a reservation; so does any order written by an old server build or
replayed from an outbox into an old build. **Fallback = today's split, computed at read time**, not a
backfill: it needs no write, cannot be wrong for an order that was never admitted under the new rule, and
a backfill would freeze today's arbitrary spread as if it were a decision. (A later `rebuild` may persist
it; nothing depends on that.)

**Proof that no screen changes on switchover.** With zero reservations, `projectBackwardOccupancy` seats
every slot total with today's split — the same code path — so `windows`, `intervals`, `pileByStart`,
`cantFit`, the dots and the breaches are byte-identical to today. That is exactly the property
`scripts/batch-rolling-identity.cjs` proves against the committed golden: **20,554 fixtures** (8 §31, 300
Gusto-shaped, 20,000 sampled 15/15, 240 aligned, **the six real Gusto events**) with identical digests.
Switchover = "the golden still passes with `reservations` empty". Only *admissions after* switchover differ,
and only in one direction (B7).

## B5. Edits and cancellations

- **Edit** (`edit`, `modify_type`/`modify_data`): under the event lock, drop the order's own reservation
  from the set, run `reserveBatches` for the new lines at the (possibly new) slot, **preferring its previous
  windows** when they still have room (so an unchanged category keeps its spaces), write the new reservation
  with `slot`. Nothing else moves. Today's unbook/rebook via `addOrderToProductionSlot` becomes
  unnecessary once totals are derived, but stays through the transition.
- **Cancel / reject**: status changes → the reservation is dead to every reader (status filter). Spaces
  are free on the next read. No write.
- **Refund**: no capacity effect (as today).
- **Ready / collected**: no capacity effect on the reservation; today's rebuild calls there become no-ops
  for reserved orders and continue to serve the totals cache.

## B6. The offline iPad

The cache `/api/dashboard` sends (`capacityInputs`) must add `reservations` for the event (live orders'
intervals). The device's `projectBackwardOccupancy` then answers as the server would; with the field
absent (old server) it falls back and is exactly today. **An offline-placed order** is admitted on the
device with the same helper against the cached set (advisory, as now), queued, and **re-admitted by the
server on replay** under the lock — the server's reservation wins, and if it no longer fits, the replay
takes the existing "capacityAck" path the device sent (a walk-up is never refused, §5), landing as an
override with `source: 'override'` and the breach visible. That is today's behaviour with a name on it.

## B7. Customer paths

`unfittableSlots`, ASAP and placement all call the same fit, so they change together and in one direction:
**more times offered, never fewer.** Gusto-shaped sweep, 60,000 verdicts (300 states × grid × sizes 1–8),
fallback reservations = today's split of the stored totals: **1,730 (2.9 %) refused-today → offered; 0
offered-today → refused.** ASAP can therefore only move **earlier**. Placement books what ASAP found. The
dots the customer sees are unchanged at switchover (B4) and, once reservations accumulate, show
remainders nearer collection than today (the 24 July shape in the split review).

---

# C. RISK, GUSTO, PLAN

## C1. Gusto impact (fixtures only)

| | Value |
|---|---|
| Verdicts that change (60,000-verdict sweep) | **1,730 — all refused-today → accepted; 0 the other way** |
| Screens that change on switchover | **none** — the six live events and 300 shaped states project identically with no reservations (golden identity) |
| kc 2 = batch 2 | drinks never count; removing kc changes the same 1,730 — the ceiling adds nothing to the batch for Gusto |
| First real difference Gusto would see | the first *new* multi-batch order admitted into a partially filled window after switchover; its dot counts then read nearer collection |

## C2. Migration order, deploy coupling, rollback

The site loads inside the native apps (`server.url`), so **every phase must be safe for an old app**
talking to a new server and a new app talking to an old server. The engine change is server-side and
client-side (the same TS runs on the iPad); the column is the only schema step.

1. **Migration first**, additive: `alter table public.orders add column if not exists cooking_reservation
   jsonb;` + `notify pgrst, 'reload schema'`. No reader names it in a shared select; the engine's read is
   probed (PGRST204 / 42703 logged distinguishably, then fallback). Harmless if it lands early.
2. **Server + web deploy** with the engine accepting `reservations` and the writers populating them, **rule
   unchanged** (P2 below). Old iPads keep working: they never see the field.
3. **Rule switch** (P3) is a code deploy behind a truck-level flag, default off.
4. **Rollback** at any phase: turn the flag off → admission is today's rule; stored reservations are
   still honoured by the display (they are valid arrangements under either rule), or ignored by setting
   `reservations` empty at read time, which is switchover in reverse and proven by the same golden. The
   column stays; nothing needs un-migrating.

## C3. Phased plan — each phase deployable and reversible on its own

| Phase | Ships | Behaviour change | Reverse |
|---|---|---|---|
| **P0** migration + probe | the column; `readProductionSlotUnits` probes it and returns `reservations: []` when absent or unreadable | none | none needed |
| **P1** engine input | `projectBackwardOccupancy(…, reservations)` seats reserved intervals verbatim and fallback-splits the rest; `reserveBatches` exists but the fit still uses today's split | **none** — golden passes with the field empty and with reservations that equal today's split (asserted) | flag |
| **P2** write reservations, today's rule | customer submit, `promoteDraft`, `manual`, edit write `cooking_reservation` = today's split under the lock; cancel frees by status | **none** — every reservation equals what the fallback would have computed; display identical | stop writing |
| **P3** Dominic's rule | the fit calls `reserveBatches`; `why` from it; new golden generated from P3 and committed | **the** change: 2.9 % more accepted on Gusto's shape | flag off → P2 |
| **P4** display + override | override reservations over the batch, the breach names the order, the popup's window lines from the reservation | visible only for placed-anyway orders | flag |
| **P5** offline | `capacityInputs.reservations`; device-side admission with the helper; replay re-admits | offline verdicts match the server's | drop the field |
| **P6** retire totals | readers stop needing `production_slot_usage`; the rebuild becomes a fallback generator | none if P1–P5 hold | keep the table |

## C4. Proof plan — harnesses, each with a broken variant that must fail first

| Harness | Asserts | Broken variant |
|---|---|---|
| `batch-reservation-worked-case.cjs` | 9 @17:30 fits reserving 8 + 1 exactly; 9 @18:45 and 9 @19:30 refused; `why` names the windows | the split forced to full-batches-first |
| `batch-reservation-immutability.cjs` | over ≥ 1,000 random sequences of place / edit / cancel, **no existing reservation ever changes** (byte-identical before/after every action except the acted-on order) | a projection that re-seats on every read |
| `batch-reservation-instants.cjs` | load at **every minute** ≤ B and ≤ kc after every admission, on 5-minute grids with P = 10 and 15, three categories, instants, pre-open run-up | the window overlap made closed on the left (the 17 September off-by-one) |
| `batch-reservation-display-equals-picker.cjs` | for every admitted order, the projection's windows for it equal the fit's `why.windows` | a projection that uses today's split for reserved orders |
| `batch-rolling-identity.cjs` (existing) | **switchover changes no screen**: passes against the committed golden with `reservations` empty | (already has two) |
| `batch-reservation-golden-p3.cjs` | P3's new golden, generated from the P3 baseline and committed, for the fixtures whose verdicts change | `fits` inverted on one fixture |
| `customer-path-identity.cjs` (existing) | extended: offered-times sets are supersets of today's on the Gusto sweep, never subsets | one slot withdrawn |
| `add-order-render.cjs` (existing) | the panel renders with reservations present, the label and popup unchanged in form | — |

## C5. Size and risk

**Size, honestly:** engine ~250 lines (`reserveBatches`, the input field, fallback seating, `why`);
writers — six paths, ~20 lines each; migration 1 file; `readProductionSlotUnits` probe ~40 lines; offline
cache 2 fields; display/override ~80 lines; harnesses ~600 lines; a new golden. **Roughly four to six
working days**, of which P3's new golden and the immutability/instant sweeps are half.

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| A reader still keys on `production_slot_usage` totals and disagrees with reservations | medium | dots ≠ picker | P1's assertion that fallback-seated totals equal reserved intervals; DISPLAY == PICKER harness |
| Edit path re-seats other orders by accident | low | "never moves" broken | immutability sweep over edit/cancel, not just place |
| Fine-grid conservatism refuses arrangements a cook would take | medium | fewer offers than the ideal, never fewer than today | accepted; documented in §31 |
| Old iPad + new server during rollout | certain | must be harmless | old client never sends or reads the field; server admits and reserves alone |
| Outbox replay lands as override after a race | low | a visible breach the operator did not choose | the replay path already carries `capacityAck`; the breach names the order |
| Golden churn hides a real regression | medium | — | P1/P2 must pass the *old* golden untouched; only P3 gets a new one, generated from a verified baseline like the current one was |
| Concurrency: two customers, one lock | as today | — | reservation decided inside the existing lock; `place_order_atomic` gains a parameter, not a second write |

## C6. Decisions for Dominic

1. **Adopt the rule?** Yes/no. Everything below assumes yes.
2. **Where does "Place it anyway" put the extra?** My proposal: the nearest window, over the batch by
   the shortfall, marked as an override and named in the breach. Alternative: spread the excess across the
   order's windows (harder to read, hides which batch is over).
3. **Should ASAP prefer the freshest arrangement?** ASAP = the earliest slot that fits (unchanged);
   *within* a slot the reservation is nearest-first, so the food is as fresh as that slot allows. If you
   want ASAP to skip a slot whose only fit puts most of the order in an *earlier* window, that is a new
   rule — say so, and by how many minutes.
4. **On a 5-minute grid with a 15-minute prep, accept that a batch overlapping the edge of a window is
   counted in full** (today's rolling rule, conservative), or ask for exact instant-level packing (more
   offers, more code, and the sweep would have to prove it).
5. **When an edited order no longer fits its old spaces, keep as many as still fit or re-place it
   entirely?** Proposal: keep what fits, place the rest nearest-first.
6. **Store reservations on `orders` (recommended) or in a new table?** The trade-offs are in B1.
7. **Should Gusto's dots be allowed to change *counts* between adjacent windows once new orders are
   reserved** (the 24 July shape)? Colours do not change; counts do.

## Anything I could not establish

- **The name and body of the per-event lock** beyond what the code shows (`lock.ok` / `lock.reason` in the
  submit route and `place_order_atomic`'s definition in `20260728_orders_total_minor_deal_savings.sql`); a
  psql read of `pg_get_functiondef` would settle whether the reservation can be written inside the same
  statement. The design assumes it can (one added parameter).
- **Multi-category interaction under a shared ceiling** is proven by the instant sweep for a single
  cooking category plus kc; three-category sequences are reasoned in B2 and listed for the C4 harness.
- **Real customer history**: totals-only storage cannot show how often a customer was refused a time the
  new rule would offer; 2.9 % is the fixture figure.
- **Whether any old app build reads `orders` with a named select** that would fail on a new column — the
  manual (§4036) says every orders read is `select('*')`; not re-verified against shipped binaries.

## Manual sections that would change (NOT edited)

- **§31 "Backward cooking-spread"** — becomes "reservations": an order's spaces are decided at admission
  and stored; the spread is the fallback for orders without one. The 3-pizza example and the dots example
  invert (17:00 = 1, 17:05 = 2).
- **§31 "STORAGE: production_slot_usage is COLLECTION-SLOT keyed"** — still true as a cache; the source of
  truth moves to `orders.cooking_reservation`.
- **§31 "DISPLAY == PICKER"** — the guarantee's basis changes from "same split of the same totals" to "the
  same `reserveBatches` helper".
- **§5 "Per-event booking lock"** — the reservation is written inside it.
- **§10 "Kitchen capacity … in the dashboard"** and the over-capacity modal — the override now reserves
  visibly and the breach names the order.
- **§39 / §41** — no change; buzzers and anonymisation do not touch the column.
