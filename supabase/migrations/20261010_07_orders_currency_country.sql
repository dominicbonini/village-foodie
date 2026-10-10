-- 20261010_07_orders_currency_country.sql
-- Country settings, Part A, file 7 of 9: every order remembers the currency and country it was sold in.
--
-- ⛔ NOT APPLIED. Nothing in this repository runs SQL. Dominic runs this by hand in the Supabase SQL
--    editor. Idempotent, so re-running is safe.
--
-- ✅ CLASSIFICATION: SAFE TO RUN NOW, BEFORE ANY CODE CHANGE. No code path sends `currency` or `country`
--    on an orders insert today, so every insert takes the trigger's values — the truck's own, which is
--    'GBP' / 'GB' for all 14 trucks. No route, RPC or seeding function needs editing for this to be
--    correct.
--
-- ── WHY A SNAPSHOT AND NOT A JOIN ───────────────────────────────────────────────────────────────────
-- Manual, "Currency and country": read live from the truck and changing a truck's currency retroactively
-- reprices every historical order and every past fee calculation. So the order carries its own copy,
-- taken once at insert, exactly as order_payments.currency already does.
--
-- ── 🔴 EXISTING ROWS: FILLED BY THE DEFAULT, NOT BY AN UPDATE ──────────────────────────────────────
-- ADD COLUMN … NOT NULL DEFAULT 'GBP' is a catalogue-only change on Postgres 11+: the value is recorded
-- once as the column's "missing value" and every existing row reads it. NO ROW IS REWRITTEN AND NO ROW IS
-- UPDATED, so:
--   • orders_set_updated_at (20260703, BEFORE UPDATE) does NOT fire — DDL fires no row trigger at all;
--   • orders.updated_at does NOT change, so lib/orders/mergeOrders.ts's version guard sees every order
--     exactly as before;
--   • no realtime UPDATE event is emitted for any existing order.
-- DROP DEFAULT afterwards is also catalogue-only and does not touch the missing value, so existing rows
-- keep reading 'GBP' / 'GB'.
--
-- ── NEW ROWS: A BEFORE INSERT TRIGGER, AND IT NEVER OVERRIDES ───────────────────────────────────────
-- With the default dropped, an insert that does not name the column arrives with NULL, and
-- orders_fill_currency_country copies the truck's currency / country into it. A value the insert DID
-- supply is kept as sent. The NOT NULL check runs after BEFORE triggers, so the order of events is:
-- insert → trigger fills → NOT NULL satisfied. An order whose truck_id matches no truck fails loudly
-- (23503) rather than being stored with no currency.
-- The function is SECURITY DEFINER so it can read trucks whatever role performs the insert (anon holds
-- no access to trucks since V12.1), with a pinned search_path.
--
-- 🔴 ALL OF THIS IS ONE TRANSACTION. The trigger is created BEFORE the default is dropped; if anything
-- fails, the columns, trigger and check all roll back together, so there is never a moment where an
-- insert could meet NOT NULL with neither a default nor a trigger.
--
-- ── EVERY PATH THAT INSERTS INTO orders (HEAD f4bd277) — none sends currency or country ────────────
--   1. place_order_atomic RPC (20260804_place_order_atomic_placed_at.sql) — customer pay-at-hatch
--      orders, called from app/api/orders/submit/route.ts:1207. Fixed column list; truck_id = p_truck_id.
--   2. lib/payments/promote-draft.ts:343 — online card orders, draft → order. truck_id = draft.truck_id.
--   3. app/api/dashboard/action/route.ts:1722 (upsert, offline replay with a client order_key) and :1730
--      (insert) — the operator's Add Order, action 'manual'. truck_id = truck.id. ON CONFLICT DO NOTHING
--      still runs BEFORE INSERT triggers on the proposed row; a discarded row's fill is discarded with it.
--   4. lib/seed-demo-orders.ts:993 — demo seeding. truck_id = the demo truck.
-- No Edge Function, script or other SQL function inserts into orders.
--
-- VERIFY AFTER APPLYING:
--   select column_name, data_type, is_nullable, column_default from information_schema.columns
--    where table_schema = 'public' and table_name = 'orders' and column_name in ('currency', 'country');
--     -- expect both text, NOT NULL, default NULL
--   select currency, country, count(*) from public.orders group by 1, 2;   -- expect only GBP / GB
--   select max(updated_at) from public.orders;   -- compare with the same query run BEFORE: unchanged
--   select tgname, tgenabled from pg_trigger
--    where tgrelid = 'public.orders'::regclass and not tgisinternal order by tgname;
--     -- expect orders_fill_currency_country and orders_set_updated_at

set lock_timeout = '3s';

begin;

-- 1 · the columns, existing rows filled through the default (no row is updated)
alter table public.orders add column if not exists currency text not null default 'GBP';
alter table public.orders add column if not exists country  text not null default 'GB';

-- 2 · the trigger, BEFORE the defaults go
create or replace function public.orders_fill_currency_country()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_currency text;
  v_country  text;
begin
  if new.currency is null or new.country is null then
    select t.currency, t.country
      into v_currency, v_country
      from public.trucks t
     where t.id = new.truck_id;

    if not found then
      raise exception 'orders: cannot record currency/country — no truck with id %', new.truck_id
        using errcode = '23503';
    end if;

    -- never override a value the insert supplied
    if new.currency is null then new.currency := v_currency; end if;
    if new.country  is null then new.country  := v_country;  end if;
  end if;
  return new;
end;
$$;

revoke all on function public.orders_fill_currency_country() from public, anon, authenticated;

drop trigger if exists orders_fill_currency_country on public.orders;
create trigger orders_fill_currency_country
  before insert on public.orders
  for each row execute function public.orders_fill_currency_country();

-- 3 · now the defaults can go: from here on the trigger is the only source for a new row
alter table public.orders alter column currency drop default;
alter table public.orders alter column country  drop default;

-- 4 · the same upper-case rule as order_payments / order_drafts / trucks
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.orders'::regclass and conname = 'orders_currency_upper_chk'
  ) then
    alter table public.orders
      add constraint orders_currency_upper_chk check (currency = upper(currency)) not valid;
  end if;
end $$;
alter table public.orders validate constraint orders_currency_upper_chk;

comment on column public.orders.currency is
  'ISO 4217, upper case. SNAPSHOT of trucks.currency taken at insert by orders_fill_currency_country — never re-read from the truck, so changing a truck''s currency cannot reprice history. Rows before 20261010 read ''GBP''.';
comment on column public.orders.country is
  'ISO 3166-1 alpha-2. SNAPSHOT of trucks.country taken at insert by orders_fill_currency_country. Rows before 20261010 read ''GB''.';
comment on function public.orders_fill_currency_country() is
  'BEFORE INSERT on orders: fills currency and country from the order''s truck when the insert leaves them NULL. Never overrides a supplied value. Raises 23503 if the truck does not exist.';

commit;

notify pgrst, 'reload schema';
