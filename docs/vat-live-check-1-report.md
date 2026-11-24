# vat-live-check-1 — is live ordering still working after france-vat-1's function change?

**23 November 2026 · status: DONE, PASSED · Dominic ran the rolled-back call (option C) in the Supabase SQL editor at 18:28: no
error, left_behind = 0 · nothing changed in the database or code**

## 0 · Result

- **The new `place_order_atomic_v2` accepts the call exactly as the deployed site makes it.** Dominic ran §2's block in the
  Supabase SQL editor on 23 Nov at 18:28 (option C, §3). It raised **no error**, and after the ROLLBACK **`left_behind = 0`**.
- So the function france-vat-1 put live at 14:28 UTC handles the old-style call (no `tax_breakdown` in `p_order`) without
  failing, and the rolled-back test left no order behind on the test truck.
- **Nothing else to run.** Step 3 (restoring the 20261010_18 body) applies only if the call errors, so it was not needed. No
  migration was written.

**What the result covers:**
- The call took the unbooked / ASAP path (`p_final_slot` and `p_unit_rows` null).
- The function has a **single `insert into orders`**, which both the unbooked and the booked-slot paths reach. france-vat-1's
  only change (the extra `tax_breakdown` column) is in that insert. So the tested insert is the same one every live order uses.
- The booked-slot path also writes `production_slot_usage`. That part of the function is unchanged from 20261010_18 and was not
  exercised by this call.
- I was told "no error" and `left_behind = 0`. The middle SELECT's row (`tax_breakdown_is_null`, total, currency, country) was
  not relayed. "No error" already means the INSERT, including the column's array check, succeeded.

## 1 · Step 1 — read-only (Supabase MCP)

```sql
select t.id, count(*) as orders, max(o.created_at) as latest, count(*) filter (where o.tax_breakdown is not null) as with_breakdown
from public.orders o join public.trucks t on t.id = o.truck_id
where o.created_at > '2026-11-23 14:28:00+00' group by t.id;
```
**Result: no rows.** No truck had had an order since 14:28 UTC, when france-vat-1 replaced the function, so the new function had
not yet run live.

```sql
select p.oid::regprocedure as signature, md5(pg_get_functiondef(p.oid)) as body_md5, length(pg_get_functiondef(p.oid)) as len,
       position('tax_breakdown' in pg_get_functiondef(p.oid)) > 0 as writes_tax_breakdown
from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'place_order_atomic_v2';
select pg_get_functiondef('public.place_order_atomic_v2(jsonb,text,text,uuid,text,date,jsonb)'::regprocedure);
```

**Result:**
- There is one function: `place_order_atomic_v2(jsonb,text,text,uuid,text,date,jsonb)`, md5 `e4b273abcf8e7609c6ca54033ed59332`,
  3,733 characters, and it writes `tax_breakdown`.
- The body read back matches the `create or replace function place_order_atomic_v2(` block in
  `supabase/migrations/20261124_france_vat_1.sql`, including its comment line "france-vat-1: absent (every deployed caller) → SQL
  NULL; a JSON null → SQL NULL too."
- Its only differences from `20261010_18_tax_rate_milli.sql` (the two files' function blocks, diffed):

```
36c36
<     application_fee_minor
---
>     application_fee_minor, tax_breakdown
73c73,75
<     (p_order->>'application_fee_minor')::integer
---
>     (p_order->>'application_fee_minor')::integer,
>     -- france-vat-1: absent (every deployed caller) → SQL NULL; a JSON null → SQL NULL too.
>     nullif(p_order->'tax_breakdown', 'null'::jsonb)
```

The column, its check, the triggers on `orders` and the function's grants:

```sql
select 'col' k, column_name||' '||data_type||' nullable='||is_nullable||' default='||coalesce(column_default,'-') v from information_schema.columns where table_schema='public' and table_name='orders' and column_name='tax_breakdown'
union all select 'check', conname||': '||pg_get_constraintdef(oid) from pg_constraint where conrelid='public.orders'::regclass and pg_get_constraintdef(oid) ilike '%tax_breakdown%'
union all select 'trigger', tgname||' '||pg_get_triggerdef(oid) from pg_trigger where tgrelid='public.orders'::regclass and not tgisinternal
union all select 'grants', string_agg(coalesce(r.rolname,'PUBLIC')||':'||a.privilege_type, ', ') from pg_proc p cross join lateral aclexplode(p.proacl) a left join pg_roles r on r.oid=a.grantee where p.oid='public.place_order_atomic_v2(jsonb,text,text,uuid,text,date,jsonb)'::regprocedure;
```

**Result:**
- column: `tax_breakdown jsonb nullable=YES default=-`
- check: `orders_tax_breakdown_array_chk: CHECK ((tax_breakdown IS NULL) OR (jsonb_typeof(tax_breakdown) = 'array'))`
- triggers: `orders_fill_currency_country` (BEFORE INSERT) and `orders_set_updated_at` (BEFORE UPDATE). Neither is new.
- grants: `postgres:EXECUTE, service_role:EXECUTE` (unchanged)

Side effects of a rolled-back call, checked first:

```sql
select p.proname, position('nextval' in pg_get_functiondef(p.oid)) > 0 as uses_sequence, position('update' in lower(pg_get_functiondef(p.oid))) > 0 as uses_update
from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('increment_event_order_counter','increment_order_counter');
```

**Result:** both counters use UPDATE and no sequence. A ROLLBACK therefore undoes the order number too, so the call left no gap in
the test truck's numbering.

## 2 · Step 2 — the rolled-back call, built from the DEPLOYED route

**The route:** read from `origin/main` (`git show origin/main:app/api/orders/submit/route.ts`, lines 1274–1303). It calls
`supabase.rpc('place_order_atomic_v2', { p_order, p_final_slot, p_status, p_event_id, p_truck_id, p_event_date, p_unit_rows })`.

**`p_order`** holds `customer_name`, `customer_email`, `customer_phone` and `order_type: 'collection'`, plus:
- `items` (the repriced lines), `deals`, `discount_code`, `subtotal`, `discount_amt`, `total`, `notes`;
- `van_id` (the event's) and `payment_status: 'unpaid'`;
- `total_minor`, and the 13 snapshot fields from `origin/main:lib/order-charges.ts`;
- **no `tax_breakdown`.**

**The values come from the test truck** (read-only):
- **Truck:** `test-truck` (slug `test-kitchen`, GB).
- **Item:** "Buscaiola", £13.00, available (id `a6239d76-…`). Items are stored as
  `{"name","cartKey","quantity","unit_price"}`, the shape of the test truck's latest pay-at-the-truck order.
- **Event:** there was none that day. The most recent is `c4a1fc78-b68b-45ea-9c5e-53103dd74f9a`, on 2026-11-16, with van
  `8e38901e-113f-42fc-ac60-11cf1360212b`. No event was created.
- **Snapshot (GB, pay at the truck):** the same values as that latest order — tax 0, inclusive, "VAT", card fees paid by the
  truck, no tip, no service fee.
- **Slot:** the unbooked / ASAP path, which is a live path too: `p_final_slot` null, `p_unit_rows` null, `p_status`
  `'pending'`.

The block Dominic ran (one transaction, rolled back):

```sql
begin;
select public.place_order_atomic_v2(
  '{"customer_name":"vat-live-check-1 (rolled back)","customer_email":null,"customer_phone":"00000000000","order_type":"collection",
    "items":[{"name":"Buscaiola","cartKey":"Buscaiola","quantity":1,"unit_price":13}],"deals":null,"discount_code":null,
    "subtotal":13,"discount_amt":0,"total":13,"notes":null,"van_id":"8e38901e-113f-42fc-ac60-11cf1360212b","payment_status":"unpaid",
    "total_minor":1300,"food_minor":1300,"tax_minor":0,"tax_rate_milli":null,"tax_inclusive":true,"tax_label":"VAT","tip_minor":0,
    "tip_pct_bps":null,"service_fee_minor":0,"service_fee_recipient":null,"card_surcharge_minor":0,"card_funding":null,
    "card_fee_payer":"truck","application_fee_minor":null}'::jsonb,
  null,                                            -- p_final_slot (ASAP, unbooked)
  'pending',                                       -- p_status
  'c4a1fc78-b68b-45ea-9c5e-53103dd74f9a'::uuid,    -- p_event_id (test-truck's most recent event)
  'test-truck',                                    -- p_truck_id
  '2026-11-16'::date,                              -- p_event_date
  null                                             -- p_unit_rows (unbooked)
);
select order_key, id, truck_id, status, payment_status, total_minor, currency, country, tax_breakdown is null as tax_breakdown_is_null
  from public.orders where truck_id = 'test-truck' and customer_name = 'vat-live-check-1 (rolled back)';
rollback;
select count(*) as left_behind from public.orders where customer_name = 'vat-live-check-1 (rolled back)';
```

**Result (run by Dominic in the Supabase SQL editor, 23 Nov 2026, 18:28):**
- **No error.** The function call completed.
- **`left_behind = 0`.** The ROLLBACK removed the test order.

**Pass condition, as set before the run:** the function returns without error, and nothing is left after the ROLLBACK. Both
held, so this is **PASSED**.

## 3 · How the call was run (the decision)

The brief asked for the rolled-back call over "the project's own db-migrate.cjs-style connection". Every way of doing that broke
another rule:
- `scripts/db-migrate.cjs` runs only committed migration files and prints no query results.
- A script of my own would have had to read `.env.local`.
- The Supabase MCP stays read-only.

I stopped and offered three options:
- **A:** the MCP, as a one-off exception.
- **B:** a throwaway script using db-migrate's connection.
- **C:** Dominic pastes the block into the Supabase SQL editor.

**Dominic chose C** and ran it himself at 18:28. No exception to any standing rule was needed: I made no database call
for step 2.

## 4 · Step 3 — not needed

Step 3 (restoring the 20261010_18 function body as a new migration) was conditional on the call erroring. It did not error, so
no migration was written and the live function is left as france-vat-1 set it (md5 `e4b273abcf8e7609c6ca54033ed59332`).

## 5 · Not done, deliberately

- No write to the database by me: step 1 was read-only through the MCP, and Dominic ran step 2. I ran nothing after his result
  ("Nothing else to run").
- No file changed except this report. No deploy, no push.
- No .env file opened.
- Pizzeria Gusto and Le Roi du Churrasco were not queried or touched. Every query is filtered to `test-truck`, or is the brief's
  all-truck count, which returns only truck ids, counts and times.

## 6 · Flags

- Nothing in either brief arrived garbled.
- Both contradictions raised in the first pass are now resolved:
  - how to run the call within the rules: settled by Dominic's choice of C;
  - step 3's "new migration file" against "don't change any file except your report": moot, because step 3 was not needed.
- No contradiction in this follow-up: "add this result … change nothing else" and "write your full report … overwriting"
  describe the same file.
