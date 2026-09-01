# Seeding orders onto App Tester's September events — the specification, and a proposed approach

**Date:** 1 September 2026
**READ-ONLY.** No file changed, nothing written to the database, no script run, nothing committed or
deployed. **The proposal at the end is not executed.** Marked **READ**, **INFERRED**, **UNKNOWN**.

⚠️ **One premise updated:** the brief gives the slug as `app-tester` — **READ from production, that is
now correct.** My last report recorded `test-truck-3-2` for both id and slug; **the slug has since been
changed to `app-tester` while `id` remains `test-truck-3-2`.** Everything below keys on the **id**.

**READ — the truck:** `{id: 'test-truck-3-2', slug: 'app-tester', name: 'App Tester', active: true,
plan: 'trial'}` · **901 orders** · **28 events**, of which **15–28 (4–17 September) have none.**

---

## 1. What created the existing orders

## ✅ It exists, it is committed, and it is `docs/seed-apple-tester-orders.sql`.

**READ — tracked (`git ls-files`), committed in `dea3aba "kds fix"`, 368 lines, 20 August 2026.** Its
own header:

```sql
-- seed-apple-tester-orders.sql — 64 orders on each of 8 events, 21–28 August 2026.
-- 🚫 NOT RUN. Dominic runs all SQL by hand. Paste the whole file into the Supabase SQL editor.
-- Extracted VERBATIM from docs/apple-tester-seed-build.md, which carries the reasoning…
-- 🔴 ONE TRANSACTION. Any assertion aborts the whole thing and nothing changes.
-- 🔴 EVERY STATEMENT IS SCOPED TO truck_id = 'test-truck-3-2', and the script REFUSES to run against
--    'test-truck-3' (a different truck), against a truck not named "Apple Tester", or against Gusto.
```

**Its reasoning document is `docs/apple-tester-seed-build.md`** (601 lines) — capacity thresholds, the
tone spread, why the Pizza batch binds rather than the van ceiling.

🔴 **BUT THE COMMITTED SCRIPT IS NOT EXACTLY WHAT PRODUCED THE CURRENT ROWS.** Three READ discrepancies:

| | Committed script | Production rows |
|---|---|---|
| Coverage | "8 events, 21–28 August" | **14 event-dates × 64** (21 Aug – 3 Sep) = 896, + 5 `manual` = **901** |
| `placed_at` | sets it — `(event_date + slot) - interval '25 minutes'` | **NULL on every row I read** |
| `id = 28` | `v_status := 'pending'` (the nut-allergy note) | note present, **`status = 'confirmed'`** |

⚠️ **INFERRED: the committed file is the ancestor, and a modified variant was actually run — more
events, no `placed_at`, different statuses. UNKNOWN where that variant is;** it is not in the
repository and not in git history. **The rows in production are the specification, not this file.**

**Related but different:** `scripts/seed-thai-kitchen-screenshots.sql` (a different truck),
`docs/seed-thai-kitchen-orders.sql`, and `lib/seed-demo-orders.ts` (the demo-truck path).

## 2. The existing rows, in full — three representative

**READ from production**, all on **Test Event 14** (`9aa9baf8-…`, 3 September). **43 columns; every
value below is verbatim.**

| Column | id=1 (plain) | id=11 (multi-pizza) | id=28 (carries a note) |
|---|---|---|---|
| `id` | `"1"` | `"11"` | `"28"` |
| `order_key` | `218b84e9-…` | `1a670a24-…` | `3cd59e9c-…` |
| `truck_id` | `test-truck-3-2` | ← | ← |
| `customer_name` | `Amelia` | `Kira` | `Erin` |
| `customer_email` | `amelia@demo.hatchgrab.test` | `kira@…` | `erin@…` |
| `customer_phone` | NULL | NULL | NULL |
| `slot` | `09:05` | `10:35` | `12:20` |
| `order_type` | `collection` | ← | ← |
| `event_date` | `2026-09-03` | ← | ← |
| `event_id` | `9aa9baf8-…` | ← | ← |
| `van_id` | `0cde7768-ef86-473d-bfab-5d3afcb0ab6d` | ← | ← |
| `deals` | `[]` | `[]` | `[]` |
| `subtotal` / `total` | `21.5` | `32` | `25.5` |
| `total_minor` | `2150` | `3200` | `2550` |
| `discount_amt` | `0` | `0` | `0` |
| `status` | `confirmed` | `confirmed` | `confirmed` |
| `payment_status` | `unpaid` | ← | ← |
| `source` | `web` | ← | ← |
| `notes` | NULL | NULL | `"Nut allergy - please keep separate from anything with nuts. Thank you!"` |
| `created_at` / `updated_at` | `2026-09-02T18:00:00+00:00` | ← | ← |
| `placed_at` | **NULL** | **NULL** | **NULL** |
| `extras` | **NULL** | **NULL** | **NULL** |

**`items` jsonb, in full:**

```json
id=1   [{"name":"Holli's Pizza","quantity":1,"unit_price":12},
        {"name":"Fanta","quantity":1,"unit_price":1.5},
        {"name":"Tiramisu","quantity":1,"unit_price":8}]

id=11  [{"name":"Sweet Heat Salami","quantity":1,"unit_price":12},
        {"name":"Tonno Delight","quantity":1,"unit_price":12},
        {"name":"Tiramisu","quantity":1,"unit_price":8}]

id=28  [{"name":"Napolitano","quantity":1,"unit_price":12},
        {"name":"Pepperoni","quantity":1,"unit_price":12},
        {"name":"Fanta","quantity":1,"unit_price":1.5}]
```

**All 20 remaining columns are NULL on all three:** `amount_paid`, `asap_estimate`, `bundle`,
`buzzer_lost_at`, `buzzer_number`, `cancellation_reason`, `capacity_ack_at`, `collected_at`,
`deal_savings`, `discount_code`, `modify_data`, `modify_type`, `paid_at`, `rejection_reason`,
`requested_slot`, `status_before_collected`, `table_ref`.

🔴 **`items[].name` IS THE JOIN KEY** to `menu_items_db` for the capacity engine's category lookup. **A
name not on this truck's menu breaks the capacity projection silently.**

⚠️ **`customer_email` uses `@demo.hatchgrab.test`** — a **reserved TLD that can never receive mail**.
**Keep that domain**; it is the only thing stopping a seeded row emailing a real person if a flow ever
fires.

## 3. Every table a real order touches, in write order

**READ — `place_order_atomic` (`supabase/migrations/20260804_place_order_atomic_placed_at.sql:55-120`).
Two tables, one transaction:**

**① `increment_event_order_counter(p_event_id)`** — the display number, falling back to
`increment_order_counter(p_truck_id)` when there is no event:

```sql
if p_event_id is not null then v_order_number := increment_event_order_counter(p_event_id); end if;
if v_order_number is null then v_order_number := increment_order_counter(p_truck_id); end if;
if v_order_number is null then raise exception 'could not generate order number…'; end if;
```

**② `orders` — 21 columns**, `order_key`/`created_at`/`updated_at` from column defaults:

```sql
insert into orders (
  id, truck_id, customer_name, customer_email, customer_phone, slot, order_type,
  event_date, event_id, van_id, items, deals, discount_code, subtotal, discount_amt,
  total, total_minor, notes, status, payment_status, placed_at
) values ( v_order_number::text, …,
  round(coalesce((p_order->>'total')::numeric,0) * 100)::integer, …,
  now()   -- placed_at SERVER-MINTED. Never read from p_order
) returning order_key into v_order_key;
```

**③ `production_slot_usage` — capacity booking, event-scoped, delete-then-insert:**

```sql
if p_event_id is not null and p_unit_rows is not null then
  delete from production_slot_usage where truck_id = p_truck_id and event_id = p_event_id;
  for v_row in select * from jsonb_array_elements(p_unit_rows) loop
    insert into production_slot_usage (truck_id, event_id, event_date, production_slot, units_by_cat, updated_at)
    values (p_truck_id, p_event_id, p_event_date, v_row->>'production_slot', v_row->'units_by_cat', now());
  end loop;
end if;
```

**What is NOT written at placement — READ from production for this truck:**

| Table | Rows for `test-truck-3-2` | |
|---|---|---|
| `orders` | 901 | ✅ written |
| `production_slot_usage` | **190** | ✅ written (`{"truck_id":…,"production_slot":"12:55","units_by_cat":{"pizza":2},…}`) |
| `order_payments` | 23 | ❌ **not at placement** — see §4 |
| `order_counters` | **0** | ❌ this truck uses the **event** counter |
| `slot_bookings` | **0** | ❌ not on this path |
| `order_drafts` | 0 | ❌ card-payment path only |
| `action_audit_log` | 28 | ❌ operator actions only |

⚠️ **The committed seed writes `orders` only**, then `update truck_events set order_counter = …`. **It
does not write `production_slot_usage`** — yet 190 rows exist. **INFERRED: written by the operator
dashboard opening the event and re-projecting capacity (`lib/slot-bookings.ts:301,315` upsert), not by
the seed. UNKNOWN with certainty.**

## 4. 🔴 `order_payments.livemode` — would seeded orders look like real money?

**READ — every one of the 23 `order_payments` rows for this truck:**

```
livemode=true   kind=charge   23 rows
earliest 2026-08-20T12:46:40Z   latest 2026-09-01T09:38:06Z
```

**Across all trucks: `{true: 321, false: 18}` of 339.**

🔴 **AND THEY ATTACH TO SEEDED ORDERS.** The five I resolved include `id=11`, `id=13`, `id=16` on
2026-08-21 with **`source = 'web'`** — rows the seed created.

### The answer, in two parts

✅ **THE SEED ITSELF WRITES NO `order_payments` ROW AT ALL.** A seeded order is `payment_status:
'unpaid'`, `paid_at: NULL`, `amount_paid: NULL`, and **carries no ledger row.** On its own it is
**distinguishable** — an unpaid order with no money record.

🔴 **BUT THE MOMENT ANYONE MARKS ONE PAID IN THE OPERATOR UI, IT BECOMES INDISTINGUISHABLE.** `livemode`
is set at write time from the Stripe context, not from the order's provenance:

```ts
lib/payments/capture.ts:351   livemode: !process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')
lib/payments/refund.ts:261    livemode: !process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')
lib/payments/authorize.ts:175 livemode: intent.livemode === true
```

**Production runs a live key, so a cash/manual "mark paid" on a seeded order writes `livemode: true`** —
**exactly what the 23 existing rows are.** ⚠️ **That has already happened on this truck**, and those
rows are now in the ledger `lib/payments/ledger.ts` treats as real.

⚠️ **So the risk is not the seed. It is what an operator or reviewer does to a seeded order afterwards.**
🔴 **A seeding plan should say plainly that these orders must not be marked paid**, and ideally leave
them in statuses where that is not the obvious next tap.

## 5. What the KDS and dashboard query, and which columns must be populated

**READ — `app/api/dashboard/route.ts:251-263`. Both boards read the same table, split by status:**

```ts
.from('orders').select('*').eq('truck_id', truck.id).eq('event_id', selectedEventId).in('status', ACTIVE_STATUSES)
.from('orders').select('*').eq('truck_id', truck.id).eq('event_id', selectedEventId).in('status', DONE_STATUSES)
```

🔴 **`event_id` IS THE FILTER.** An order with a NULL or wrong `event_id` **does not appear at all**,
whatever else is right.

### Columns that must be populated, and the ones that render *wrongly* rather than not at all

| Column | If missing |
|---|---|
| `event_id` | 🔴 **invisible** — filtered out |
| `truck_id` | 🔴 invisible |
| `status` | 🔴 invisible — must be in `ACTIVE_STATUSES` or `DONE_STATUSES` |
| 🔴 **`slot`** | **RENDERS WRONGLY.** The KDS orders and groups by collection time; a null slot sorts unpredictably and detaches the ticket from the capacity strip. |
| 🔴 **`items`** | **RENDERS WRONGLY.** An empty array is a ticket with nothing to cook. And `items[].name` must match `menu_items_db.name` **on this truck**, or the category lookup misses and the order contributes nothing to capacity while still displaying. |
| 🔴 **`total` / `total_minor`** | **RENDERS WRONGLY.** They are independent columns; if they disagree, the ticket and the reports disagree. The RPC derives minor from major — **any seed must too.** |
| 🔴 **`van_id`** | **RENDERS WRONGLY on a multi-van truck** — a null van makes the order unassigned, so it may vanish from a van-filtered board while still existing. |
| `customer_name` | Renders as blank/Unknown — cosmetic |
| `notes` | Absent — but a null note **loses the manual-review signal** |
| `created_at`/`updated_at` | Column defaults; the existing rows carry `2026-09-02T18:00:00Z` |
| `placed_at` | **NULL on every existing row** — so it is evidently not required for display |

## 6. What reacts to an order row appearing

🔴 **NOTHING IN THE DATABASE REACTS. A DIRECT INSERT TRIGGERS NONE OF IT.**

**READ — the only trigger on `orders` is `orders_set_updated_at`**
(`20260703_orders_updated_at_trigger.sql:32`), a timestamp trigger. **There is no notification, email,
push or webhook trigger.**

**Every downstream effect is in the API route, AFTER the RPC returns** — `app/api/orders/submit/route.ts`:

- `sendConfirmationEmail(...)` to the **truck** (`:1172`) and to the **customer** (`:1225`)
- `sendOrderPendingPush` — **APNs** (`lib/apns`) and **FCM** (`lib/fcm`), `:26-29`
- WhatsApp: ⚠️ **`formatWhatsAppOrder` has NO call site** — the file says so at `:65`

✅ **So a direct `INSERT` sends no email, fires no push, calls no webhook and writes no audit row.** The
order simply appears on the boards at the next poll.

⚠️ **Two consequences.** Nothing will alert the operator's device — **correct for seeding.** And nothing
will book capacity: `production_slot_usage` is written by the RPC, **not by a trigger**, so a raw insert
leaves the capacity strip stale until the dashboard re-projects it.

---

# Proposed approach — NOT EXECUTED

**Shape: one idempotent, guarded SQL transaction, modelled on `docs/seed-apple-tester-orders.sql`, run
by hand in the Supabase editor.** I would write it for review before anything runs.

### What it would do

1. **Guard first, write nothing until they pass.** Assert `truck_id = 'test-truck-3-2'` **and** the
   truck's name is `App Tester` **and** the 14 target `event_id`s all belong to it and all currently
   have **zero** orders. **Any failure aborts the transaction.**
2. **Copy the production rows as the specification, not the committed script** — 43 columns, with the
   three discrepancies in §1 resolved in favour of what is live: `placed_at` NULL, `extras` NULL, the
   status mix as it actually reads.
3. **Per event: 64 orders, ids `'1'`–`'64'` as text**, `order_key` left to the column default,
   `created_at`/`updated_at` set to a fixed timestamp, `van_id = 0cde7768-…`,
   `customer_email` on **`@demo.hatchgrab.test`**, `source = 'web'`, `payment_status = 'unpaid'`,
   `total_minor = round(total*100)`, and `items[].name` **validated against `menu_items_db` for this
   truck before insert**.
4. **Set `truck_events.order_counter = 64`** per event, so a real order placed during a review is #65
   and cannot collide with the partial unique index on `(event_id, id)`.
5. **Re-run the committed file's capacity assertions** — no window over the Pizza batch — before commit.

### What it would deliberately NOT do

- 🔴 **No `order_payments` row, ever.** §4 — that is the line between test data and the money ledger.
- **No `production_slot_usage` write.** Let the dashboard project it, as it evidently already does.
- **No `slot_bookings`, `order_drafts` or `action_audit_log` rows.**

### 🔴 Three things I would want you to decide first

1. **Statuses.** The existing rows are almost all `confirmed`. For fourteen **future** events, is that
   right, or should later dates be `pending` so the boards show work arriving?
2. **`placed_at`.** Live rows have it NULL; the committed script sets it. **NULL is what production
   looks like**, but a non-null value is more truthful. **Your call — I would not choose silently.**
3. 🔴 **The instruction that these must never be marked paid**, and whether that belongs in the file
   header, given §4.

⚠️ **And one caveat I cannot resolve: fourteen events × 64 = 896 new orders, doubling this truck's
order table.** **UNKNOWN whether any report, export or dashboard query degrades at ~1,800 rows** — not
measured.

---

## What I could not establish

1. **UNKNOWN — where the variant script that actually produced the live rows is.** Not in the repo or
   git history. §1.
2. **UNKNOWN — what wrote the 190 `production_slot_usage` rows.** INFERRED: the dashboard's capacity
   re-projection.
3. **UNKNOWN — which of the 23 `livemode=true` payment rows were deliberate.** Some attach to seeded
   orders; whether that was intended testing or accidental is not visible here.
4. **NOT OBSERVED — no order was placed and no page loaded.** Everything is READ from code, migrations
   and production queries.

---

**No span of this prompt arrived garbled, and no instruction contradicted another.** The read-only
instruction and the request for an approach sit together as the brief intends: **the approach is
described and quoted, and nothing was run.**
