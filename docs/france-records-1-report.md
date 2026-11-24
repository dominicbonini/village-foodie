# france-records-1 — business details, a gap-free receipt number, the daily-totals file, order audit rows

*24 November 2026 · branch `france-vat-1` (this work started at `38d579e6`) · not pushed, not deployed.*

## Summary

- **Business details** are in Manage › Settings, for every country. The owner or an admin edits:
  - legal name and registered address;
  - SIREN/SIRET with a Luhn check (France), the 8-character company number (GB), free text elsewhere;
  - EU VAT number, format-checked;
  - France's VAT regime.
- **Every new order gets a gap-free receipt number per truck.** A trigger assigns it on insert, so the code live today is covered too. It never makes an order fail.
- **Reports › For your accountant has "Daily totals by VAT rate (CSV)"**, with presets that follow the regime. The accountant Orders CSV has "Receipt no.".
- **Placement, edit, cancel and reject are written to the audit log.**
- **Nothing a customer sees changed** (proved against `38d579e6`). **Retention is unchanged**, as decided.

| # | Item | Outcome |
|---|---|---|
| 1 | Business details | **Done.** Settings card, `update_business_details`, `lib/business-details.ts`. Not in signup. |
| 2 | Receipt number | **Done and live.** Migrations `20261125` + `20261125b`, each run only after a rolled-back live pre-flight passed. `place_order_atomic_v2` not replaced. |
| 3 | Daily totals file | **Done.** Button, period picker, `get_daily_totals`, `lib/accounts/daily-totals.ts`. |
| 4 | Audit log | **Done.** Placement (3 paths), edit (before/after), cancel (operator, customer, event), reject (operator and cron). |
| 5 | Retention | **Unchanged** (decision 1 = C). It still removes line notes at 12 months, as the privacy policy says. |
| Proof | | `scripts/france-records-1.cjs` **60 passed, 0 failed**. Live proofs (all rolled back) passed. Sweep: §9. |

## Things you should know first

1. **A gap found and fixed before any order used the trigger.**
   - The walk-up's offline replay inserts with `INSERT … ON CONFLICT (order_key) DO NOTHING`. Postgres fires BEFORE INSERT triggers even for a row the conflict then skips, so a replay of an already-synced order would have used a number.
   - Fix: migration `20261125b`. Once it holds the counter lock, the trigger checks whether that `order_key` already exists, and if so gives the number back.
   - The pre-flight proves both sides: with 1b the next order is 9; without it, 10.
   - No order had been placed in between (checked: none in the 3 hours before).
2. **The audit snapshots leave out the customer's name, email, phone and every free-text note** (the order note, line notes, deal slot notes). The audit log is never cleaned, and the privacy policy promises notes are removed at 12 months. Items, deals, status, money and the receipt number are all there.
3. **The cancelled-after-payment case** (§5): the money taken and not refunded counts as refunded on the day of the cancellation. That day comes from the new audit row, else the order's `updated_at`. So the sale and the cancellation each count on their own day and net to zero.
4. **Another session's commits are on this branch**: `26a8b0b9` (inbox-2's report). I didn't touch them.
5. **The deal-free case**: no live order has ever carried a deal (france-vat-1's read), so deal splits in the file are proved only by tests.

---

## 1 · What changed, by area

**Business details**
- `lib/business-details.ts` (new, pure):
  - SIREN/SIRET with Luhn, and La Poste's sum-of-digits rule for SIREN 356000000;
  - GB company number;
  - EU VAT prefixes and patterns, 27 countries (Greece EL; France's overseas departments use FR);
  - the regime (France only);
  - optional fields, where a blank clears.
- `components/manage/BusinessDetailsCard.tsx` (new): Settings' card style, saving when a box loses focus.
  - The registered address uses the truck's address format (`EventAddressFields`, with a new `customersSee={false}` so no "Customers see" line).
  - The franchise note appears when franchise en base is chosen and a rate applies.
- `components/manage/AddressFields.tsx`: the optional `customersSee` prop (default as before).
- `app/(app)/manage/[token]/page.tsx`: the card after "Where you trade"; SettingsTab gets `isAdmin`.
- `app/api/manage/route.ts`: `update_business_details` (owner or admin; the same check again; an audit row naming the fields, not the values).

**Receipt number**
- `supabase/migrations/20261125_france_records_1.sql`: the trucks' five columns, `orders.receipt_no`, a partial unique index, `receipt_counters`, `receipt_no_failures`, and the two triggers.
- `supabase/migrations/20261125_france_records_1b_receipt_replay.sql`: the replay guard (function body only).
- `scripts/db-rollback-proofs.cjs` (new, operational-only).
- `scripts/db-migrate.cjs`: now exports its connection helpers; as a command, unchanged.

**Daily totals**
- `lib/accounts/periods.ts` and `lib/accounts/daily-totals.ts` (new, pure).
- `components/manage/DailyTotalsCsv.tsx` (new): its own period picker and the download, under the accountant buttons.
- `app/api/manage/route.ts`: `get_daily_totals`.

**Receipt no. in the accountant CSV:** `lib/accounts/ledger.ts` (`receiptNo`), `lib/accounts/csv.ts` (the column after Order number), and `get_report` (reads `receipt_no` for the accounts only).

**Audit log**
- `lib/audit/order-audit.ts` (new): `orderAuditSnapshot`, and `logOrderEvent` through the existing best-effort `logAction`.
- Wired into:
  - `app/api/orders/submit/route.ts` (pay-at-the-truck placement);
  - `lib/payments/promote-draft.ts` (card placement);
  - `app/api/dashboard/action/route.ts` (walk-up placement, not again on an offline replay; edit before/after; cancel);
  - `app/api/orders/cancel/route.ts` (the customer's cancel);
  - `app/api/events/action/route.ts` (event cancellation);
  - `lib/orders/reject-order.ts` (operator reject and the auto-reject cron).

**Words**
- 60 en-GB strings, translated into the 54 bases enabled countries use, with back-translations (4 translators). translation-check: 0 structural problems in all 54.
- es-MX (6 overrides).
- en-US ("tax" where the file says "VAT": daily file, 10 overrides).
- The 5 unused bases are left alone.

**Proof:** `scripts/france-records-1.cjs` (new), `scripts/_lp-france-records-1.cjs` (the named set-aside), and logs in `docs/france-records-1/`.

## 2 · The migrations and every SQL statement run

**Read-only, before (Supabase MCP):**
```sql
select c.relname as tbl, t.tgname, t.tgisinternal, t.tgenabled, pg_get_triggerdef(t.oid) as def
from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('orders','order_payments','order_drafts','production_slot_usage','action_audit_log') order by 1,2;
```
```sql
select p.pubname, pt.schemaname, pt.tablename from pg_publication p join pg_publication_tables pt on pt.pubname = p.pubname
where pt.tablename in ('orders','order_payments','order_drafts','production_slot_usage','action_audit_log','order_counters','event_order_counters') order by 1,3;
```
```sql
select (select count(*) from pg_extension where extname = 'pg_net') as pg_net_installed,
       (select count(*) from information_schema.schemata where schema_name = 'supabase_functions') as webhooks_schema,
       (select count(*) from pg_trigger t join pg_proc p on p.oid = t.tgfoid join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('supabase_functions','net')) as webhook_triggers;
```
```sql
select n.nspname, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where p.prokind = 'f' and n.nspname = 'public' and pg_get_functiondef(p.oid) ilike any (array['%pg_notify%','%net.http%','%supabase_functions%','%dblink%']) order by 1,2;
```
```sql
select p.proname, pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('orders_fill_currency_country','increment_event_order_counter','increment_order_counter');
```
```sql
select id, name, mode, plan, is_customer, active, country from public.trucks where id like 'demo-%' or plan = 'demo' order by id limit 20;
```
```sql
select column_name, data_type from information_schema.columns where table_schema='public' and table_name='orders' and is_nullable='NO' and column_default is null order by ordinal_position;
```
```sql
select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='public.orders'::regclass and contype in ('u','p','c') order by 1;
```
```sql
select indexname, indexdef from pg_indexes where schemaname='public' and tablename='orders' order by 1;
```
(One more attempt errored before running: a filter over `pg_get_functiondef` that also met aggregate functions — "array_agg is an aggregate". It was re-run with `p.prokind = 'f'`, above.)

**Side effects outside the transaction: none.**
- No database-webhook triggers. pg_net is installed but nothing on these tables uses it.
- No `pg_notify`, `net.http` or `dblink` in any public function.
- Realtime publishes `orders`, but logical replication sends only committed transactions, so nothing from a rolled-back one.

**The migrations**, applied with `npx -y -p pg@8.13.1 node scripts/db-migrate.cjs <file>`:
- `20261125_france_records_1.sql`: sha `c124eda0064bad94`, committed `0b2cad75`, applied, one transaction, no error.
- `20261125_france_records_1b_receipt_replay.sql`: sha `aee0adb9c5d85282`, committed `3a796041`, applied, no error.

The full text of both is in the files. The trigger function as live now:
```sql
create or replace function public.orders_assign_receipt_no()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_no  bigint;
  v_old text;
begin
  begin
    v_old := current_setting('lock_timeout');
    perform set_config('lock_timeout', '2s', true);
    insert into public.receipt_counters as c (truck_id, last_no, updated_at)
      values (new.truck_id, 1, now())
      on conflict (truck_id) do update set last_no = c.last_no + 1, updated_at = now()
      returning c.last_no into v_no;
    if exists (select 1 from public.orders o where o.order_key = new.order_key) then
      raise sqlstate 'HGRN1';
    end if;
    perform set_config('lock_timeout', v_old, true);
    new.receipt_no := v_no;
  exception
    when sqlstate 'HGRN1' then
      new.receipt_no := null;
    when others then
      new.receipt_no := null;
      begin
        insert into public.receipt_no_failures (truck_id, sqlstate, message) values (new.truck_id, sqlstate, left(sqlerrm, 500));
      exception when others then
        null;
      end;
      raise warning 'orders_assign_receipt_no: no receipt number for truck % (%: %)', new.truck_id, sqlstate, left(sqlerrm, 200);
  end;
  return new;
end;
$$;
```

**Read-only, after:**
```sql
select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public'
 and ((table_name = 'trucks' and column_name in ('legal_name','registered_address','registration_number','vat_number','vat_regime'))
   or (table_name = 'orders' and column_name = 'receipt_no')) order by 1, 2;
```
→ 6 rows, nullable, no default.
```sql
select tgname, pg_get_triggerdef(oid) as def from pg_trigger where tgrelid = 'public.orders'::regclass and tgname like 'orders_receipt_no%' order by 1;
```
→ `orders_receipt_no` BEFORE INSERT; `orders_receipt_no_keep` BEFORE UPDATE OF receipt_no.
```sql
select relname, relrowsecurity from pg_class where relname in ('receipt_counters', 'receipt_no_failures') order by 1;
```
→ both have RLS on.
```sql
select table_name, grantee, privilege_type from information_schema.role_table_grants
 where table_name in ('receipt_counters', 'receipt_no_failures') and grantee in ('anon', 'authenticated');
```
→ no rows.
```sql
select md5(pg_get_functiondef('public.place_order_atomic_v2(jsonb,text,text,uuid,text,date,jsonb)'::regprocedure)) as v2_md5,
       (select count(*) from public.orders where receipt_no is not null) as numbered, (select count(*) from public.receipt_counters) as counters, (select count(*) from public.receipt_no_failures) as failures;
```
→ `e4b273abcf8e7609c6ca54033ed59332` (unchanged since france-vat-1, as vat-live-check-1 recorded), 0, 0, 0.
```sql
select position('HGRN1' in pg_get_functiondef('public.orders_assign_receipt_no()'::regprocedure)) > 0 as replay_guard,
       (select count(*) from public.orders where receipt_no is not null) as numbered, (select count(*) from public.receipt_no_failures) as failures,
       (select count(*) from public.orders where created_at > now() - interval '3 hours') as orders_last_3h;
```
→ true, 0, 0, 0.

**The live proofs**, `scripts/db-rollback-proofs.cjs`, every transaction ROLLED BACK. Full output, every statement with its parameters: `docs/france-records-1/*.log`. The distinct statements it sent:
```sql
set statement_timeout = '5s'
set lock_timeout = '3s'
begin
set transaction read only
select id, plan, is_customer from public.trucks where id = any($1) order by id
select (select count(*) from public.orders where truck_id = any($1))::int as orders, (select count(*) from public.order_payments where truck_id = any($1))::int as order_payments, (select count(*) from public.action_audit_log where truck_id = any($1))::int as action_audit_log, (select count(*) from public.production_slot_usage where truck_id = any($1))::int as production_slot_usage, (select coalesce(sum(order_counter), 0) from public.trucks where id = any($1))::int as trucks_order_counter, (select coalesce(sum(e.order_counter), 0) from public.truck_events e where e.truck_id = any($1))::int as events_order_counter, to_regclass('public.receipt_counters') is not null as has_counters
select (select count(*) from public.receipt_counters where truck_id = any($1))::int as counter_rows, (select coalesce(sum(last_no), 0) from public.receipt_counters where truck_id = any($1))::int as counter_sum, (select count(*) from public.receipt_no_failures)::int as failures
-- the migration's body (pre-flight only: its begin / commit / notify / lock_timeout taken out)
insert into public.orders (id, truck_id, customer_name, customer_phone, customer_email, slot, order_type, event_date, event_id, items, deals, discount_code, subtotal, discount_amt, total, total_minor, food_minor, tax_minor, tax_inclusive, tax_label, card_fee_payer, status, payment_status, source) values ($1, $2, 'rollback proof', null, null, null, 'collection', current_date, null, '[]'::jsonb, null, null, 0, 0, 0, 0, 0, 0, true, 'TVA', 'truck', 'confirmed', 'unpaid', 'manual') returning order_key, receipt_no
insert into public.orders (order_key, id, truck_id, customer_name, customer_email, customer_phone, order_type, table_ref, slot, requested_slot, asap_estimate, event_date, event_id, van_id, items, deals, extras, bundle, discount_code, subtotal, discount_amt, total, total_minor, notes, status, payment_status, placed_at) values (gen_random_uuid(), $1, $2, 'rollback proof', null, null, 'collection', null, null, null, null, current_date, null, null, '[]'::jsonb, null, null, null, null, 0, 0, 0, 0, null, 'pending', 'unpaid', now()) returning order_key, receipt_no
insert into public.orders (order_key, id, truck_id, …the walk-up's columns…) values ($3::uuid, $1, $2, …) on conflict (order_key) do nothing returning order_key, receipt_no
select public.place_order_atomic_v2($1::jsonb, null, 'confirmed', null, $2, current_date, null) as r
select receipt_no, tax_breakdown from public.orders where order_key = $1
select receipt_no, tax_breakdown, tax_rate_milli, tax_inclusive, total_minor, currency, country from public.orders where order_key = $1
select count(*)::int as n from public.orders where order_key = $1
select coalesce((select last_no from public.receipt_counters where truck_id = $1), 0) as n
select truck_id, last_no from public.receipt_counters where truck_id = any($1) order by truck_id
select sqlstate, message from public.receipt_no_failures where truck_id = $1 order by id desc limit 1
savepoint gap
rollback to savepoint gap
savepoint forced
alter table public.receipt_counters rename to receipt_counters_forced_failure
rollback to savepoint forced
update public.orders set receipt_no = 999 where order_key = $1
update public.orders set receipt_no = null where order_key = $1
update public.orders set status = 'cancelled' where order_key = $1 returning receipt_no
rollback
```

**The script's safeguards, as code:**
- **Demo trucks only:** the guard refuses unless every truck is non-customer and `demo-…` or plan `demo`. It used `demo-mk65q66spjck0g9mxt50btfxtr` and `test-truck-2`.
- **Never commits:** `q()` refuses to send any statement containing COMMIT. Every transaction ends in ROLLBACK, in a `finally`, and the connection is closed.
- **Short timeouts:** statement_timeout 5 s and lock_timeout 3 s.
- **Counts:** before and after counts for the demo trucks are printed and compared. They were identical in every run.
- **Never in a sweep:** it is in `operational_refused`.

| Run | Result |
|---|---|
| Pre-flight `20261125` (before applying) | 9/9. Sequential 1, 2, 3; the function (the deployed call) 4, tax_breakdown NULL; the promotion insert 5; a rolled-back insert leaves no gap (6, then 6); a forced failure (counter table renamed) still inserts with NULL and logs 42P01; another truck starts at 1; kept on update (999 / NULL → 7); a cancelled order keeps 7; counters 7 and 1. Counts identical. |
| Pre-flight `20261125b` | 10/10 (10: an offline replay takes no number: 8, the replay skipped, the next 9). Without 1b, proof 10 fails: 8, then 10. |
| Two connections (after applying) | Truck B not blocked while A's counter is held (19–20 ms). The waiting insert got A's 1 after the holder rolled back, then 2, 3: consecutive, no gap, no duplicate. A holder past 2 s: the waiting insert went in after ~2 s with receipt_no NULL (55P03), never an error. Counts identical. |
| vat-live-check-1's old-style call | The deployed code's `place_order_atomic_v2` call succeeds: tax_breakdown NULL, snapshot as sent, a receipt number. Counts identical. |

## 3 · The receipt-number design

- **One counter row per truck** (`receipt_counters.last_no`), taken by `INSERT … ON CONFLICT DO UPDATE` inside the order's own insert.
- **Gap-free:** the row lock serialises one truck's inserts, and a rolled-back insert rolls its increment back.
- **Never fails an insert:**
  - the whole assignment is one guarded block, with a 2 s lock_timeout restored afterwards;
  - on any error the number stays NULL, the failure goes to `receipt_no_failures` (itself guarded), and a WARNING is raised;
  - a replayed `order_key` gives its number back.
- **Every insert path is covered by the trigger**, the deployed code included:
  - `place_order_atomic_v2` (the customer's pay-at-the-truck order);
  - the walk-up's direct insert and its offline-replay upsert;
  - the card promotion's direct insert;
  - demo seeding.
  - The harness checks that no code sets `receipt_no` itself.
- **Card drafts get no number;** the order gets one when it is promoted.
- **Numbers are never reused or skipped.** Cancelled and rejected orders keep theirs, and the keep trigger stops an update changing or clearing one.
- **Existing orders stay NULL** (no backfill).
- **`place_order_atomic_v2` was not replaced.**
- **Not shown to customers.** It appears in the accountant Orders CSV and is read by the daily-totals file.

## 4 · Business details

| Field | Country | Check | Stored |
|---|---|---|---|
| Legal name | all | ≤ 200 | as typed, trimmed |
| Registered address | all | the truck's address format, each part ≤ 200 | `{address, town, suburb, region, postcode}` |
| Registration number | FR (+GP MQ GF RE YT) "SIREN or SIRET" | 9 or 14 digits, Luhn (La Poste: digit sum ÷ 5) | digits only |
| | GB "Company number" | 8 letters or digits | upper case, no spaces |
| | elsewhere "Registration number" | ≤ 40 | as typed |
| VAT number | EU (27) | prefix + pattern, format only, no VIES | upper case, no spaces |
| | elsewhere | ≤ 40 | as typed |
| VAT regime | FR only | Franchise en base / Réel simplifié / Réel normal – monthly / Réel normal – quarterly | `franchise` … |

- Every field is optional, and a blank clears it.
- **Saving:** owner or admin (403 `business_owner_only` otherwise). Each save writes an audit row naming the fields.
- **The franchise note** ("You've chosen franchise en base, so you may want to set your VAT to 0 %.") shows when franchise en base is chosen and a rate applies. The rate is never changed by it.
- **Not in signup.**

## 5 · The daily-totals file

**Rules** (`lib/accounts/daily-totals.ts`):
- **Which orders:** only accepted ones (confirmed, modified, cooking, ready, collected). Pending and rejected never count.
- **Cancelled orders** count only if money was taken. The money not refunded comes back as a refund on the day of the cancellation. The day is the audit log's `order_cancelled` row, else the row's `updated_at`. This replaces the "counted at full value" behaviour readiness §4 described.
- **Dates:** a sale counts on the day it was placed, and a refund on the day it was made. Both use the truck's time zone.
- **Rates:** each order's `tax_breakdown`. An order without one uses its single stored rate (else the truck's current rate, as the accountant ledger does).
- **Refunds** take back each rate's share in proportion, using largest remainder.
- **No-rate orders** (a UK truck with No VAT) are in no rate row. The file says how many were left out, in a line under the header.
- **Tips and fees** are not goods at a VAT rate and are not in the rows (France has neither).

**Format:**
- **Columns:** Date, Type ("Goods"), VAT rate, Sales incl. VAT, Refunds incl. VAT (negative), Net excl. VAT, VAT.
- **Totals:** one totals row per rate.
- **Header rows:** legal name, SIREN/SIRET (or "Registration number" outside France), VAT number, VAT regime, period.
- **Encoding:** UTF-8 with BOM, CRLF, ISO dates, the accountant CSVs' number format.

**Presets** (`lib/accounts/periods.ts`):
- franchise en base: two-month blocks;
- réel simplifié: the month;
- réel normal monthly: 1–10, 11–20, 21–end;
- réel normal quarterly: the month;
- no regime, or not France: the month.

Six recent periods are listed, starting on the last complete one, and "Custom dates" is always there.

**Worked example** (the harness's fixture, written to `docs/france-records-1/daily-totals-sample.csv`). A French test truck over two days:
- **2 Nov:** the mixed order 15,00 € (crêpe 10 %, can 5,5 %, cider 20 %); the same with a 10 % code, 13,50 €; a pending order (left out); a counter crêpe paid 8,50 € and cancelled on 3 Nov with no refund row; a rejected order (left out).
- **3 Nov:** a 5,00 € refund on the coded order, and a crêpe 8,50 €.
```csv
Legal name,Crêperie Léa SARL
SIREN/SIRET,73282932000074
VAT number,FR12345678901
VAT regime,Réel simplifié
Period,2026-11-02 – 2026-11-03

Date,Type,VAT rate,Sales incl. VAT,Refunds incl. VAT,Net excl. VAT,VAT
2026-11-02,Goods,5.5%,4.75,0.00,4.50,0.25
2026-11-02,Goods,10%,24.65,0.00,22.41,2.24
2026-11-02,Goods,20%,7.60,0.00,6.33,1.27
2026-11-03,Goods,5.5%,0.00,-0.84,-0.79,-0.05
2026-11-03,Goods,10%,8.50,-11.33,-2.57,-0.26
2026-11-03,Goods,20%,0.00,-1.33,-1.11,-0.22
Total,Goods,5.5%,4.75,-0.84,3.71,0.20
Total,Goods,10%,33.15,-11.33,19.84,1.98
Total,Goods,20%,7.60,-1.33,5.22,1.05
```

How 3 Nov's figures come about:
- **The 5,00 € refund** (of 13,50 €) is split over the order's 2,25 / 7,65 / 3,60. Sales back: 0,84 / 2,83 / 1,33. VAT back: 1,42 × 5,00 ÷ 13,50 = 0,53, split 0,05 / 0,26 / 0,22.
- **The cancelled counter crêpe's 8,50 €** (VAT 0,77) comes back on 3 Nov.
- **3 Nov's own crêpe** is 8,50 € (VAT 0,77).

## 6 · The audit rows

| Action | Where | Before / after |
|---|---|---|
| `order_placed` | submit (pay at the truck), walk-up (not again on an offline replay), card promotion | — / the order as placed |
| `order_edited` | dashboard edit | items, deals and totals before → after |
| `order_cancelled` | operator, customer, event cancellation | the order → status cancelled (+ `note.by`) |
| `order_rejected` | `rejectOrder` (operator and the auto-reject cron) | the order → status rejected |

- All go through the existing best-effort `logAction`, so a failed log never stops the action. No new `logActionOrThrow`.
- Snapshots carry no customer details or free-text notes (Things you should know, point 2).

## 7 · Retention

- **Unchanged** (decision 1 = C): `lib/order-retention.ts` and its cron are byte-identical to `38d579e6`.
- It still removes the name, email, phone, order note and line and slot notes at 12 months, as `content/legal/privacy-policy.md` line 146 and the country terms promise.
- Moving line notes into their own column is a later prompt.

## 8 · Proof and re-pins

**`scripts/france-records-1.cjs`: 60 passed, 0 failed.** No network and no database.
- **A · Business details:**
  - Luhn, La Poste's rule, SIREN/SIRET lengths;
  - GB's company number;
  - EU VAT, free text elsewhere;
  - the regime; blanks clearing;
  - the real `/api/manage`: the owner writes exactly the named columns and an audit row; a bad SIREN is refused; a manager and staff are refused and nothing is written;
  - the franchise-note rule, the mount, and not in signup.
- **B · Receipt number:**
  - the migration text: the never-fail block, the replay guard after the lock, the keep trigger, no drop;
  - `place_order_atomic_v2` untouched;
  - every insert path is an INSERT the trigger numbers;
  - the recorded live proof logs;
  - the proof script's safeguards, and that it is operational-only.
- **C · Daily totals:** the worked example (each day's rows and totals), every row adding up, the cancellation without an audit row, a UK No-VAT order left out and counted, a no-breakdown order at its stored rate, outside-the-period refunds, all four regimes' presets (and no regime), and the CSV's bytes.
- **D · Audit,** through the real `/api/dashboard/action`:
  - an edit writes before/after with one more line;
  - a cancel and a reject write their rows;
  - a refused edit writes none;
  - placement on the three paths and the customer and event cancels (structural);
  - best-effort only.
- **E · Retention:** byte-identical, still blanking.
- **F · Nothing customer-facing changed:** single- and mixed-rate orders' customer email (HTML + text), new-order email, ticket bytes (58 + 80 mm) and status/API charges are byte-identical to `38d579e6`, with a receipt number and business details on the row. No customer-facing file differs since `38d579e6`.
- **G · Words:** 60 in en-GB and all 54 bases with back-translations; the 5 unused bases untouched; "Receipt no." after Order number.

**Re-pins** (each marked ⚠️ RE-PINNED (france-records-1)):

| Harness | What moved, and why |
|---|---|
| `france-vat-1.cjs` §A | The accountant Orders CSV's new "Receipt no." column and the row's `receiptNo` are set aside on HEAD's side (they must be exactly there and empty), so the rest is compared byte for byte as before. |
| `costs-accounts-1.cjs` | Its own 55 keys still exclude france-vat-1's, and now also france-records-1's "Receipt no." header. |
| `messages-keys-used`, `country-picker-1`, `paperwork-1`, `costs-accounts-1`, `contact-1`, `faq-2`, `faq-3`, `faq-4` | france-vat-1's set-aside now reads the combined `scripts/_lp-france-records-1.cjs`. The 5 unused bases must lack EXACTLY france-vat-1's 24 + france-records-1's 60 keys, nothing else. |
| `costs-accounts-1` §7, `order-charges`, `messages-parity` (`_messages-parity-1e.cjs`), `languages-1`, `language-phase-1d` (`_lp1d-named.cjs`) | Found by the sweep; each described in §9. |

Two code fixes came from the sweep, both in §9:
- The pay-at-the-truck audit row is now written after the event lock is released.
- SettingsTab's `isAdmin` prop moved to after `truck`.

## 9 · The sweep (against `38d579e6`)

**Result: no failure from this work is left.** Every harness that fails on this branch fails the same way at `38d579e6`.

- **The two sweeps:**
  - `38d579e6`, in a throwaway worktree: 230 harnesses, 19 failing.
  - This branch: 231 harnesses (`france-records-1` is the new one), with every listed file passing the screen.
- **What the first branch sweep found:**
  - 5 harnesses failing that passed at the start;
  - 2 of the 19 shared failures with more failed checks than at the start.
  - All 7 came from this work. Each is fixed or re-pinned by name below, and each now matches the start exactly.
- **The other 17 shared failures match the start exactly,** in both the pass and fail counts and the failing check lines.
  - billing-1 130/1; contact-1 252/1; cwv-2 42/2; france-1 73/1; legal-languages-1 407/1; loyalty-1 80/1; site-chrome-1 34/1; tidy-1 89/1;
  - language-phase-1b 3112/392, 1c 4391/10, 1d2, 1e 1020/3, 2 1770/404;
  - country-settings-parity (1 section); event-types-render; faq-1; screenshot-truck-details 1 of 174.
- **The Mac slept twice during the branch sweep,** which explains one 948 s timing. `caffeinate` kept it awake for the rest. The runner's temp check: nothing left behind.

| Harness | At start → first branch run | Cause | Now |
|---|---|---|---|
| `batch-reservation-writers` | pass → 1 failed | The pay-at-the-truck placement's audit write sat inside the event lock, between the RPC and the reservation write. That broke this harness's placement pattern, and it also held the lock longer than needed. | **Code fix:** the audit row is written after the lock is released, from a snapshot kept next to `order`. Passes. |
| `schedule-graphics-places` | pass → 2 failed | Its Settings-copy check finds SettingsTab by its opening text, and I had put `isAdmin` in the middle of it. | **Code fix:** `isAdmin` moved to after `truck`, so the opening text is as before. 270/0. |
| `order-charges` | pass → 276/6 | The new `order_placed` / `order_edited` audit rows are extra writes. | **⚠️ RE-PINNED:** those four audit actions are taken out the same way as `auth_shadow:` rows (later ids renumbered). Each is first checked to carry no customer name, email, phone or note. 288/0. |
| `messages-parity` | pass → 10 failed | 5 new keys' words (SIREN, SIRET, régime…) aren't in the old source. | **⚠️ RE-PINNED:** france-records-1's 60 keys go into `NEW_WORDING`, by name, as france-vat-1's do. Their text is held by france-records-1 §G. 1,455,062/0. |
| `languages-1` | pass → 90/1 | The pseudo-language's back-translation unaccents every letter, so the en-GB "Réel simplifié" reads back as "Reel simplifie", 0 % overlap. | **⚠️ RE-PINNED:** that one key is set aside by name, and only while its back-translation is exactly its en-GB text unaccented. Every other drift still fails. 91/0. |
| `costs-accounts-1` | 77/1 → 74/4 | §7's three exact CSV lines lacked the new "Receipt no." column. | **⚠️ RE-PINNED:** the same three lines with that one empty column added. 77/1. The 1 is the start's §10, unchanged. |
| `language-phase-1d` | 486/4 → 463/27 | The 23 Settings page views now have the Business details card. | **⚠️ RE-PINNED,** named change `france-records-1-business-card` (`scripts/_named-france-records-1.cjs`), STRUCTURAL: with exactly that one card taken out (balanced `<div>`s, its en-GB title checked), each view equals the expected one byte for byte. 486/4. The 4 are the start's own: the `opened_at` API views, the same at `38d579e6` (checked by running it there). |

- **The runner itself, over the 9 harnesses this work touched** (`--list`, all 9 pass the screen):
  - 7 pass: batch-reservation-writers, languages-1 91/0, messages-parity, order-charges, schedule-graphics-places 270/0, france-records-1 60/0, france-vat-1 61/0.
  - 2 fail exactly as at the start: costs-accounts-1 77/1 and language-phase-1d 486/4.
- **Type-check:** clean.
- **eslint** on the two code files changed after the commit: the same counts as at `38d579e6` (page 232/81, submit 16/5).
- **Restored after the runs:** the four `us-changed.txt` fixtures the runs rewrite, with `git checkout`.

## 10 · Left undone

- **Receipts and customer screens:** nothing is shown yet (by design; after your mockup). The receipt number and business details are stored and exported only.
- **Retention:** unchanged (decision 1 = C). Moving line notes into their own column is a separate prompt.
- **VIES** (an online VAT-number check): not built, as the brief says.
- **The translators' notes**, worth a native read:
  - "{label} number" is phrased locally in sk, hu, ro, sl, lt, sq, sv (e.g. hu "{label}-azonosító", sv "Registreringsnummer för {label}").
  - "VAT regime" is "system" in pl, hr, sl.
  - pt-BR and ca-AD use "IVA".
  - ms-MY's "cukai" just means "tax".
  - ja: 消費税の登録番号.
  - ar-AE's plural is one count-neutral sentence.
  - hy-AM "{label} համար" can read as "for {label}".

## 11 · What to click through on localhost

Use a test or demo truck only.

1. **Manage › Settings › Business details (a French test truck):**
   - legal name and the registered address (no "Customers see" line);
   - SIREN 732 829 320 saves as 732829320, and 732829321 is refused;
   - VAT number FR12345678901;
   - regime "Franchise en base": the note shows while the TVA box is empty (10 % applies).
   - Then a GB test truck: "Company number", no regime.
2. **Reports › For your accountant › Daily totals by VAT rate (CSV):**
   - with the regime set to each of the four values in turn, the period list changes: two-month blocks, month, 1–10/11–20/21–end, month;
   - "Custom dates";
   - download and open it.
3. **An order's receipt number:** place an order on localhost for the test truck, then Reports › For your accountant › Orders CSV shows its "Receipt no.".
4. **On the live site (deployed code), for a demo truck:** one online order and one walk-up. Each should show a receipt number in the database:
   `select id, receipt_no, created_at from public.orders where truck_id = '<demo truck>' order by created_at desc limit 2;`
