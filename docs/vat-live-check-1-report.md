# vat-live-check-1 — is live ordering still working after france-vat-1's function change?

**23 November 2026 · status: step 1 done (read-only); step 2 prepared but NOT run — stopped for your decision (§3) · nothing changed**

## 0 · Result so far

- **No order has been placed on any truck since 14:28 UTC**, when france-vat-1 replaced the function. So the new
  `place_order_atomic_v2` has **not yet run live**: there is no proof yet either way.
- **The live function is the 20261124 body.** It differs from the 20261010_18 body (which every order before 14:28 used) in
  exactly one place: it writes one more column, `tax_breakdown`, with the value `nullif(p_order->'tax_breakdown', 'null'::jsonb)`.
- **Why that should work with today's site** (reasoning, not proof):
  - The deployed site (`origin/main` `f2e2b4ab`) never sends `tax_breakdown`, so the value is SQL NULL.
  - `orders.tax_breakdown` exists, is `jsonb`, nullable, and has no default.
  - Its only check is `tax_breakdown IS NULL OR jsonb_typeof(tax_breakdown) = 'array'`, which a NULL passes.
  - The signature and grants are unchanged (EXECUTE for `postgres` and `service_role` only).
- **The real proof is step 2** (a rolled-back call). I have **not** run it: the brief's rules leave no allowed way to run it
  (§3).

## 1 · Step 1 — read-only (Supabase MCP)

```sql
select t.id, count(*) as orders, max(o.created_at) as latest, count(*) filter (where o.tax_breakdown is not null) as with_breakdown
from public.orders o join public.trucks t on t.id = o.truck_id
where o.created_at > '2026-11-23 14:28:00+00' group by t.id;
```
**Result: no rows.** No truck has had an order since 14:28 UTC.

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
- grants: `postgres:EXECUTE, service_role:EXECUTE`

Side effects of a rolled-back call, checked first:

```sql
select p.proname, position('nextval' in pg_get_functiondef(p.oid)) > 0 as uses_sequence, position('update' in lower(pg_get_functiondef(p.oid))) > 0 as uses_update
from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('increment_event_order_counter','increment_order_counter');
```

**Result:** both counters use UPDATE and no sequence. A ROLLBACK therefore undoes the order number too: no gap is left in the
test truck's numbering.

## 2 · Step 2 — prepared from the DEPLOYED route, not run

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
- **Event:** there is none today. The most recent is `c4a1fc78-b68b-45ea-9c5e-53103dd74f9a`, on 2026-11-16, with van
  `8e38901e-113f-42fc-ac60-11cf1360212b`. No event was created.
- **Snapshot (GB, pay at the truck):** the same values as that latest order — tax 0, inclusive, "VAT", card fees paid by the
  truck, no tip, no service fee.
- **Slot:** the unbooked / ASAP path, which is a live path too: `p_final_slot` null, `p_unit_rows` null, `p_status`
  `'pending'`.

The transaction, exactly as it would run (one transaction, rolled back):

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

**What would pass:** the function returns `{order_key, order_number, slot}`; the row exists inside the transaction with
`tax_breakdown_is_null = true`, total 1300, GBP, GB; and after the ROLLBACK `left_behind = 0`.

## 3 · Why I stopped (a decision for you)

The brief asks for the rolled-back call over "the project's own db-migrate.cjs-style connection". Every way of doing that
breaks another rule:

- **`scripts/db-migrate.cjs`** has no mode for running a statement. It runs only a committed file under `supabase/migrations/`,
  and it does not print query results. Using it would mean adding a fake "migration" file, which breaks "don't change any file
  except your report" and pollutes the migration history.
- **A small script of my own using the same connection** would have to read `SUPABASE_DB_URL` out of `.env.local` itself. That
  is an agent parsing a .env file, which the standing rule and this brief forbid. Only db-migrate.cjs, the project's own
  command, may do that.
- **The Supabase MCP** runs SQL, but your standing rule is that it stays read-only. Even rolled back, this call is a write. The
  MCP may also refuse writes outright.

Pick one:

```text
vat-live-check-1 — how should I run the rolled-back test call (§2's SQL)?
A) Run it through the Supabase MCP, as a one-off exception to "the MCP stays read-only" (it is rolled back; if the MCP refuses writes, I tell you and stop).
B) Let me write a throwaway script in my scratch folder that opens the same connection db-migrate.cjs uses (it reads only SUPABASE_DB_URL from .env.local and never prints it) — a one-off exception to the .env rule.
C) You paste §2's block into the Supabase SQL editor yourself (about a minute) and tell me the three results.
```

**Recommendation: A.** It is the quickest and touches nothing else, and the statement ends in ROLLBACK. **C** is equally safe if
you would rather not make an exception. If the call errors, step 3 (restoring the 20261010_18 body as a new migration) needs a
migration file, which "don't change any file except your report" also forbids. I'd take your choice here as covering that as
well, since the brief itself orders it in that case.

## 4 · Not done, deliberately

- No write to the database, no file changed except this report, no deploy, no push.
- No .env file opened.
- Pizzeria Gusto and Le Roi du Churrasco were not queried: every query above is filtered to `test-truck`, or is the brief's
  all-truck count, which returns only truck ids, counts and times.

## 5 · Flags

- Nothing in the brief arrived garbled.
- **Contradiction 1** (§3): the brief requires a written, rolled-back call over a db-migrate-style connection, but forbids
  opening the .env file and changing any file, and db-migrate.cjs cannot run a statement on its own.
- **Contradiction 2:** step 3's "new migration file" conflicts with "Don't change any file except your report". It applies only
  if the call errors.
