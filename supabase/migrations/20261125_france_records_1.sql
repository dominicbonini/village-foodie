-- 20261125_france_records_1.sql
-- france-records-1 (25 November 2026, docs/france-records-1-report.md): BUSINESS DETAILS ON THE TRUCK, AND A GAP-FREE RECEIPT NUMBER
-- PER TRUCK, ASSIGNED BY A TRIGGER ON EVERY ORDER INSERT.
--
-- ✅ CLASSIFICATION: ADDITIVE AND BACKWARD-COMPATIBLE WITH THE DEPLOYED CODE (the live site uses this database):
--    • trucks: five NEW NULLABLE columns (legal_name, registered_address, registration_number, vat_number, vat_regime). Nothing reads
--      them on the deployed site; nothing is backfilled.
--    • orders.receipt_no: NEW, NULLABLE bigint, unique per truck where set. Existing orders stay NULL (no backfill).
--    • receipt_counters (one row per truck: the last number given) and receipt_no_failures (a trigger's failures): NEW tables, RLS
--      on, no policy, nothing for anon / authenticated — only the trigger (SECURITY DEFINER) writes them.
--    • THE TRIGGER (Dominic, 24 November 2026, decision 2 = A): BEFORE INSERT ON orders, every path — place_order_atomic_v2, the
--      walk-up's and the card promotion's direct inserts, the deployed code's too. It takes the truck's counter row with
--      INSERT … ON CONFLICT DO UPDATE (a row lock, in the order's own transaction: a rolled-back insert rolls the counter back, so
--      there is no gap), under a SHORT lock_timeout (2 s), restored afterwards.
--      🔴 IT NEVER MAKES AN INSERT FAIL: the whole assignment is one guarded block; on ANY error (a lock timeout included) the order
--      is inserted with receipt_no NULL, the failure is written to receipt_no_failures (itself guarded) and raised as a WARNING.
--    • A second trigger keeps a number once given (BEFORE UPDATE OF receipt_no: an update cannot change or clear it). It never errors.
--    • place_order_atomic_v2 is NOT replaced: the number is on the inserted row.
--    • No drop, no rename, no row updated or deleted.
--
-- VERIFY AFTER APPLYING: the read-only block at the end of this file.

set lock_timeout = '3s';

begin;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 1. Business details on the truck (Manage › Settings › Business details; operator-only, every field optional)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
alter table public.trucks add column if not exists legal_name          text;
alter table public.trucks add column if not exists registered_address  jsonb;
alter table public.trucks add column if not exists registration_number text;
alter table public.trucks add column if not exists vat_number          text;
alter table public.trucks add column if not exists vat_regime          text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'trucks_business_details_chk' and conrelid = 'public.trucks'::regclass) then
    alter table public.trucks add constraint trucks_business_details_chk check (
      (legal_name is null or char_length(legal_name) <= 200)
      and (registered_address is null or jsonb_typeof(registered_address) = 'object')
      and (registration_number is null or char_length(registration_number) <= 40)
      and (vat_number is null or char_length(vat_number) <= 40)
      and (vat_regime is null or vat_regime in ('franchise', 'reel_simplifie', 'reel_normal_monthly', 'reel_normal_quarterly'))
    );
  end if;
end $$;

comment on column public.trucks.legal_name is 'france-records-1: the business''s legal name (operator-entered). NULL = not given.';
comment on column public.trucks.registered_address is 'france-records-1: the registered address, in the truck''s address format: {address, town, suburb, region, postcode}. NULL = not given.';
comment on column public.trucks.registration_number is 'france-records-1: the company registration number — FR SIREN (9 digits) or SIRET (14), GB company number (8 characters), else free text. Stored without spaces.';
comment on column public.trucks.vat_number is 'france-records-1: the VAT number (EU: country prefix + number, format-checked only; no VIES check). Stored without spaces, upper case.';
comment on column public.trucks.vat_regime is 'france-records-1: France only — franchise | reel_simplifie | reel_normal_monthly | reel_normal_quarterly. Sets the daily-totals file''s period presets.';

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 2. The receipt number
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
alter table public.orders add column if not exists receipt_no bigint;
comment on column public.orders.receipt_no is 'france-records-1: the truck''s gap-free receipt number, assigned by the orders_receipt_no trigger on insert (1, 2, 3 … per truck; never reused; a cancelled or rejected order keeps its number). NULL on orders before it, and on an insert whose assignment failed (receipt_no_failures says why).';

create unique index if not exists orders_truck_receipt_no_key on public.orders (truck_id, receipt_no) where receipt_no is not null;

create table if not exists public.receipt_counters (
  truck_id   text primary key,
  last_no    bigint not null check (last_no >= 1),
  updated_at timestamptz not null default now()
);
comment on table public.receipt_counters is 'france-records-1: the last receipt number given per truck. Written ONLY by public.orders_assign_receipt_no() (the orders_receipt_no trigger), inside the order''s own transaction.';

create table if not exists public.receipt_no_failures (
  id         bigserial primary key,
  truck_id   text,
  sqlstate   text,
  message    text,
  created_at timestamptz not null default now()
);
comment on table public.receipt_no_failures is 'france-records-1: an order inserted WITHOUT a receipt number because the trigger failed (it never fails the insert). Read by people, never by the app.';

alter table public.receipt_counters    enable row level security;
alter table public.receipt_no_failures enable row level security;
revoke all on public.receipt_counters    from anon, authenticated;
revoke all on public.receipt_no_failures from anon, authenticated;
revoke all on sequence public.receipt_no_failures_id_seq from anon, authenticated;

create or replace function public.orders_assign_receipt_no()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
    perform set_config('lock_timeout', v_old, true);
    new.receipt_no := v_no;
  exception when others then
    -- 🔴 NEVER FAIL THE INSERT. The block's own work (the counter, the lock_timeout change) is undone with it.
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
comment on function public.orders_assign_receipt_no() is 'france-records-1: BEFORE INSERT ON orders — the truck''s next receipt number (gap-free, row-locked counter, 2 s lock_timeout). Never fails the insert: on any error, receipt_no stays NULL and the failure is logged.';

create or replace function public.orders_keep_receipt_no()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.receipt_no is not null then new.receipt_no := old.receipt_no; end if;
  return new;
end;
$$;
comment on function public.orders_keep_receipt_no() is 'france-records-1: BEFORE UPDATE OF receipt_no ON orders — a number once given is kept (never changed, never cleared).';

revoke all on function public.orders_assign_receipt_no() from public, anon, authenticated;
revoke all on function public.orders_keep_receipt_no()   from public, anon, authenticated;

-- Created only when missing (no drop): safe to run twice.
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'orders_receipt_no' and tgrelid = 'public.orders'::regclass) then
    create trigger orders_receipt_no before insert on public.orders for each row execute function public.orders_assign_receipt_no();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'orders_receipt_no_keep' and tgrelid = 'public.orders'::regclass) then
    create trigger orders_receipt_no_keep before update of receipt_no on public.orders for each row execute function public.orders_keep_receipt_no();
  end if;
end $$;

commit;

notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- VERIFY (read-only). Run after the block above.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 1. The six new columns, all nullable, no default (expect 6 rows):
--   select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public'
--    and ((table_name = 'trucks' and column_name in ('legal_name','registered_address','registration_number','vat_number','vat_regime'))
--      or (table_name = 'orders' and column_name = 'receipt_no')) order by 1, 2;
-- 2. The two triggers (expect orders_receipt_no BEFORE INSERT, orders_receipt_no_keep BEFORE UPDATE OF receipt_no):
--   select tgname, pg_get_triggerdef(oid) from pg_trigger where tgrelid = 'public.orders'::regclass and tgname like 'orders_receipt_no%';
-- 3. The two tables private (RLS on; anon / authenticated hold no privilege):
--   select relname, relrowsecurity from pg_class where relname in ('receipt_counters', 'receipt_no_failures');
--   select table_name, grantee, privilege_type from information_schema.role_table_grants
--    where table_name in ('receipt_counters', 'receipt_no_failures') and grantee in ('anon', 'authenticated');
-- 4. place_order_atomic_v2 untouched (md5 as before), and nothing numbered yet:
--   select md5(pg_get_functiondef('public.place_order_atomic_v2(jsonb,text,text,uuid,text,date,jsonb)'::regprocedure));
--   select count(*) filter (where receipt_no is not null) from public.orders;
