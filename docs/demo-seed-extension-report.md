# Demo seed extension — PHASE 1 ONLY. **STOPPED BEFORE PHASE 2.**

**Date:** 25 August 2026
**Nothing was changed. Nothing was run.** No file edited, no SQL executed, no `next dev`, nothing
against production. No row was written anywhere.

🔴 **PHASE 2 WAS NOT STARTED, AND THIS IS NOT A REFUSAL — IT IS THE STOP CONDITION YOUR OWN BRIEF
DEFINES.** Two of its instructions cannot both be satisfied. §6 sets out the contradiction and the
options. **I have not chosen between them.**

---

# §1 — PHASE 1.1: THE PATH THAT SEEDED EVENTS 1–8

## 1.1 🔴 THE BRIEF'S PREMISE IS CONTRADICTED BY THE FILE'S OWN SECOND LINE

> Your brief: *"Find the code or script that seeded events 1-8 and their orders. **It exists - this seed
> was created through the repo, not by hand.**"*

**The file is `docs/seed-apple-tester-orders.sql`. Its line 2 reads:**

```sql
-- seed-apple-tester-orders.sql — 64 orders on each of 8 events, 21–28 August 2026.
-- 🚫 NOT RUN. Dominic runs all SQL by hand. Paste the whole file into the Supabase SQL editor.
```

🔴 **IT IS RAW SQL, RUN BY HAND IN THE SUPABASE SQL EDITOR.**

**ENTRY POINT: there is none.** No `npm` script (`package.json` has only `dev`, `build`, `start`,
`lint`), no runner in `scripts/`, no route, no function. **It is a paste-in artefact that lives in the
repo — it is not a code path in it.**

## 1.2 🔴 AND IT DID NOT CREATE THE EVENTS AT ALL — ONLY THE ORDERS

```sql
v_event_ids uuid[] := array[
  '088936cd-b9f8-4aa6-b681-ccc0c81057a8'::uuid, 'e1352fde-4c82-4efa-9790-8668de7a267b'::uuid, … ];
```

**Eight hardcoded uuids of events that already existed.** 🔴 **Nothing in this repo created "Test Event
1" through "Test Event 8".** Whatever made them — the Manage UI by hand, or something outside the
repo — is not in the tree.

## 1.3 THE PART THAT CREATES AN ORDER, QUOTED

A PL/pgSQL loop, `for e in 1..8 loop` → `for i in 1..v_n_orders loop`, building `v_lines` as jsonb and
then:

```sql
    -- ── 4. CLEAR AND INSERT, EVENT BY EVENT ─────────────────────────────────────
    delete from orders
     where truck_id = v_truck_id and event_id = v_event_ids[e];
    delete from production_slot_usage
     where truck_id = v_truck_id and event_date = v_event_dates[e];
    …
      insert into orders (                      -- line 252
    …
    -- 🔴 THE COUNTER = THE HIGHEST DISPLAY ID WRITTEN, so a real order placed during review is #43
    -- and cannot collide with the partial unique index on (event_id, id). Requirement (i).
    update truck_events set order_counter = v_n_orders
     where id = v_event_ids[e] and truck_id = v_truck_id;
```

## 1.4 THE ONLY *CODE* SEEDER IN THE REPO — AND IT IS NOT THIS ONE

`lib/seed-demo-orders.ts`, `export async function seedDemoOrders(supabase, { truckId, eventId, … })`.

🔴 **IT DID NOT SEED EVENTS 1–8.** Its only two callers are `lib/provision-demo.ts` and
`lib/demo-restart.ts` — the **demo-truck** lifecycle, whose entry routes gate on `isDemoIdentifier`
(`identifier.startsWith('demo-')`). **`test-truck-3-2` does not carry that prefix**, so those callers
cannot reach it. ⚠️ `seedDemoOrders` itself takes `truckId` as a plain parameter and contains **no**
demo gate — the gate is entirely in its callers.

---

# §2 — PHASE 1.2: EVERY TABLE AND COLUMN WRITTEN PER ORDER

| | `docs/seed-apple-tester-orders.sql` (what ran) | `lib/seed-demo-orders.ts` (the code seeder) |
|---|---|---|
| **`public.orders`** | ✅ `insert into orders (…)`, one row per order | ✅ `supabase.from('orders').insert(rows)` — one bulk insert |
| **`truck_events.order_counter`** | ✅ **YES** — `update truck_events set order_counter = v_n_orders` (a direct SET to 64) | ✅ **YES** — `rpc('increment_event_order_counter', …)` called **once per row**, in parallel |
| **`production_slot_usage`** | 🔴 **DELETE ONLY. `delete from production_slot_usage where truck_id = … and event_date = …` and it is NEVER re-inserted.** | 🔴 **NOT WRITTEN AT ALL.** No reference to the table anywhere in the file. |
| Anything else beyond `orders` | Nothing. Reads menu/category rows to build the baskets. | Reads only: `menu_items_db`, `modifier_groups`, `item_modifier_groups`, `modifier_options`. |
| `order_payments` | Not written by the script | Not written |

🔴 **SO "NOTHING ELSE" COSTS EXACTLY ONE THING, AND BOTH PATHS PAY IT: `production_slot_usage` IS
NEVER POPULATED.** The counter is handled by both — that half of your concern is already covered.
🔴 **The SQL is worse than silent on usage: it actively DELETES the date's rows**, so if anything had
rebuilt them earlier, running the seed removed them.

---

# §3 — PHASE 1.3: WOULD A NEW ORDER COLLIDE ON `UNIQUE (event_id, id)`?

✅ **NO. The seed leaves the counter consistent.**

**What supplies the next id** — `lib/order-utils.ts`:

```
 * atomic DB function increment_event_order_counter(uuid) — UPDATE..RETURNING, so
 * Falls back to the truck-level counter (increment_order_counter(text)) when there [is no event]
   const { data, error } = await supabase.rpc('increment_event_order_counter', { p_event_id: eventId })
   const { data, error } = await supabase.rpc('increment_order_counter', { p_truck_id: truckId })
```

`app/api/dashboard/action/route.ts` records that these are the only writers left: *"the two RPCs
(increment_event_order_counter / increment_order_counter), both UPDATE .. SET order_counter =
order_counter + 1 .. RETURNING. **No client value reaches**"* the column.

**The chain for events 1–8:** the SQL wrote ids `1..64` and set `order_counter = 64`. The next real
order calls the RPC, which returns **65**. ✅ **No collision, and its own verification block asserts
exactly that** — *"expect 8 rows, each: order_counter = 64, orders = 64, max_id = 64"*.

⚠️ **Event 1 has 66 orders per your context, not 64.** If `order_counter` was left at 64 while ids run
to 66, the next two real orders would collide. 🔴 **I cannot check that from the repo — it is a live
row.** The script as written sets the counter to the number it inserted; **the extra two orders on event
1 did not come from this script**, so whatever added them is what determines the answer. **Worth one
query before review.**

⚠️ **READ, NOT RUN.** I have executed nothing and read no database.

---

# §4 — PHASE 1.4: WHAT THE CAPACITY STRIP READS, AND WHAT IT SHOWS TODAY

**Source:** `app/api/dashboard/route.ts` builds the strip from **`production_slot_usage`, keyed by the
production WINDOW key**, not by collection time:

```
  // WINDOW-KEY MAP: collection_time → production_slot from the static collection_times table — the
  // EXACT source the WRITE keys production_slot_usage by.
  // buildSlotIndicators reads production_slot_usage by the WINDOW key
  //   (production_window_key = timeMap[ct] || ct — the EXACT key the write stores under)
  tone:  dayIndicators.get(s.collection_time)?.tone ?? s.tone,
  label: dayIndicators.get(s.collection_time)?.label ?? '',
```

🔴 **FOR AN EVENT WITH ORDERS BUT NO `production_slot_usage` ROWS — which is every one of events 1–8:**

1. `dayIndicators` is **empty**, so `tone` falls through to `buildSlotAvailability`'s own
   customer-facing tone and `label` falls through to **`''`**.
2. `detectCapacityBreaches({ times, productionSlotUnits, … })` receives **zero units**, so
   `remainingTotal`/`remainingByCat` never go negative → 🔴 **the "N slot(s) over capacity" banner can
   never fire.**

🔴 **THE STRIP DOES NOT REFLECT THE 64 ORDERS SITTING ON THOSE EVENTS.** It shows availability tones
computed as if the kitchen were empty. **That is the opposite of the SQL's own stated intent**, which
projects a 31 green / 29 amber / 36 red strip and says *"the authoritative check is the dashboard's own
breach banner after you run it."* 🔴 **With the usage rows deleted, that banner has nothing to read.**

## 4.1 ✅ A SUPPORTED REPO REMEDY ALREADY EXISTS — AND I HAVE NOT RUN IT

- **`rebuildProductionSlotUsage(...)`** — `lib/slot-bookings.ts:421`. Delete-then-rebuild from live
  orders; idempotent.
- **`POST /api/admin/backfill-usage?secret=$SUPABASE_SERVICE_ROLE_KEY`** — an admin route that calls it
  per `(truck_id, event_date)`. Its header says *"Safe to re-run (idempotent: delete-then-rebuild from
  orders)."*
- **`/api/manage` upsert_event (line 734)** self-heals it: *"Gap 3: self-heal production_slot_usage
  whenever an event is created/confirmed."*

⚠️ **That third one matters for phase 2**: an event created *through the manage API* rebuilds usage for
its date on creation. **Read from source; not run, not observed.**

---

# §5 — WHAT I RAN VS WHAT I READ

| | |
|---|---|
| **RUN** | ✅ **Nothing.** No SQL, no script, no `next dev`, no database query, no network call to production. |
| **READ** | Every claim above, from source: `docs/seed-apple-tester-orders.sql`, `lib/seed-demo-orders.ts`, `lib/order-utils.ts`, `lib/slot-bookings.ts`, `app/api/dashboard/route.ts`, `app/api/manage/route.ts`, `app/api/admin/backfill-usage/route.ts`, `package.json`, `scripts/`. |
| **UNWRITTEN** | 🔴 **Events 9–14 do not exist. No order rows were created. Nothing is observed.** |

---

# §6 — 🔴 THE STOP: TWO INSTRUCTIONS THAT CANNOT BOTH BE SATISFIED

**A.** Phase 2: *"Use the **SAME path** that created events 1-8. Extend or parameterise it. **Do not
write a second, parallel seeding mechanism.**"*

**B.** Phase 1.2: *"**This is the reason this task is not being done in raw SQL.** A direct INSERT into
orders writes the row and nothing else."*

🔴 **THE SAME PATH *IS* RAW SQL, HAND-PASTED INTO THE SUPABASE EDITOR (§1.1).** Extending it means
doing precisely what B says this task is not doing. Honouring B means abandoning A.

**And the obvious escape is closed by a third instruction.** Using `seedDemoOrders` (§1.4) would be **a
second, parallel mechanism** — it is not the path that created events 1–8 — and its callers are
demo-prefix-gated, so reaching it for `test-truck-3-2` means either a new caller (parallel mechanism,
violating A) or loosening a product gate, which your brief also forbids: *"Do not change any application
code outside the seeding script itself. If the seed cannot be extended without changing product code,
STOP and tell me the instruction is contradictory rather than choosing."*

⚠️ **Phase 1.5 points the same way:** *"If NO seeding path exists in the repo, STOP HERE."* A pasteable
`.sql` artefact with no entry point is, on the strictest reading, not a path.

## 6.1 THE OPTIONS — 🔴 **YOURS TO PICK. I HAVE NOT CHOSEN.**

1. **Extend the SQL.** Add events 9–14 and their orders to `docs/seed-apple-tester-orders.sql` (or a
   sibling), as a re-runnable `do $$` block that skips an event whose name exists. **Honours A, breaks
   B.** ⚠️ **It must also CREATE the six events**, which the existing script never did (§1.2). ✅ **The
   usage gap is fixable in the same run** — either re-insert usage rows, or run
   `POST /api/admin/backfill-usage` afterwards.
2. **Write a Node script that calls `seedDemoOrders`.** A genuine repo path with the counter handled for
   free. **Honours B, breaks A**, and still leaves `production_slot_usage` unwritten (§2) unless it also
   calls `rebuildProductionSlotUsage`. **No product code need change** — `seedDemoOrders` takes `truckId`
   as a parameter — but it *is* a second mechanism.
3. **Create the six events through the Manage UI, then seed orders by whichever route you pick.** Event
   creation through `/api/manage` self-heals `production_slot_usage` for the date (§4.1), which is the
   only route that gets the usage table right without a separate step.

## 6.2 ONE THING TO DECIDE REGARDLESS

🔴 **EVENTS 1–8 HAVE NO `production_slot_usage` ROWS TODAY** (§4). Whatever you choose for 9–14, **the
eight events the reviewer will actually look at first are showing a capacity strip that does not
reflect their 64 orders**, and no over-capacity banner can fire on them. **That is a live-data condition
I inferred from source and did not verify against the database** — one query settles it.

⚠️ **I have not touched events 1–8, any of their orders, or anything belonging to pizzeria-gusto or
tikka-tonic. Nothing was deleted. No script was run.**
